/**
 * Certificate Authority — real X.509 issuance, rotation, revocation and chain
 * validation for Execution Plane identity.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md §5a.2, §5a.3 · 03 §2a
 *   ADR          : ADR-0021 (Platform Core), ADR-0007 (signing custody)
 *   Criteria     : C-08.20 (mutual TLS with issued certificate identity)
 *                  C-08.21 (rotation without redeploying the Execution Plane, with overlap)
 *                  C-08.25 (revocation takes effect without customer action)
 *
 * REAL CERTIFICATES, NOT A SIMULATION.
 * Issuance shells out to OpenSSL and the result is a genuine X.509 chain that Node's
 * TLS stack verifies. A "certificate" that only this code understood would prove
 * nothing about mutual TLS — the whole point is that an independent implementation
 * accepts it.
 *
 * Signing keys are held by the Intelligence Plane and never distributed (R-08.15).
 * What leaves is a leaf certificate and its key, issued to one tenant.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { X509Certificate } from 'node:crypto';

export interface CertificateMaterial {
  readonly certificatePem: string;
  readonly privateKeyPem: string;
  /** Key identifier, carried on packages so rotation needs no contract change (ADR-0007 §6). */
  readonly keyId: string;
  readonly subject: string;
  readonly notBefore: Date;
  readonly notAfter: Date;
}

export interface CertificateAuthorityOptions {
  /** Where CA material lives. Never inside a customer tenancy (R-08.17). */
  readonly stateDir: string;
  /** Leaf lifetime. Short by design — a long-lived certificate is a standing authority. */
  readonly leafValidityDays?: number;
}

function openssl(args: readonly string[], cwd: string): void {
  execFileSync('openssl', args as string[], { cwd, stdio: 'pipe' });
}

/** Deterministic-ish identifier for a certificate's key, derived from its fingerprint. */
function keyIdOf(certificatePem: string): string {
  return new X509Certificate(certificatePem).fingerprint256.replace(/:/g, '').slice(0, 32).toLowerCase();
}

export class CertificateAuthority {
  private readonly stateDir: string;
  private readonly leafValidityDays: number;
  /** Revoked key identifiers. Revocation is checked on every validation (C-08.25). */
  private readonly revoked = new Set<string>();

  private constructor(stateDir: string, leafValidityDays: number) {
    this.stateDir = stateDir;
    this.leafValidityDays = leafValidityDays;
  }

  static create(options: CertificateAuthorityOptions): CertificateAuthority {
    const { stateDir, leafValidityDays = 1 } = options;
    mkdirSync(stateDir, { recursive: true });
    const ca = new CertificateAuthority(stateDir, leafValidityDays);
    if (!existsSync(join(stateDir, 'ca.crt'))) ca.initialiseRoot();
    return ca;
  }

  private initialiseRoot(): void {
    openssl([
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', 'ca.key', '-out', 'ca.crt',
      '-days', '3650', '-subj', '/CN=DBiz Platform Root CA/O=DBiz',
      '-addext', 'basicConstraints=critical,CA:TRUE',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
    ], this.stateDir);
  }

  get rootCertificatePem(): string {
    return readFileSync(join(this.stateDir, 'ca.crt'), 'utf8');
  }

  /**
   * Issue a leaf certificate bound to one tenant.
   *
   * The tenant identifier is placed in the subject CN **and** as a SAN URI, so
   * tenant binding is verifiable from the certificate itself rather than from an
   * accompanying claim. A certificate whose tenant came from a separate field
   * could be presented for another tenant (C-08.24 in spirit).
   */
  issueForTenant(tenantId: string): CertificateMaterial {
    // The tenant id is interpolated into the OpenSSL -subj and the extension config; a value
    // containing '/', a newline or a comma could inject additional RDNs or SAN/extension
    // directives (e.g. a leaf that is itself a CA). Constrain it to the platform slug charset
    // before it reaches OpenSSL (closes N-6). Server-generated `tnt-<hex>` ids always pass.
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(tenantId)) {
      throw new Error(`refusing to issue a certificate for a malformed tenant id: ${JSON.stringify(tenantId)}`);
    }
    const work = mkdtempSync(join(tmpdir(), 'dbiz-csr-'));
    try {
      const subject = `/CN=${tenantId}/O=DBiz Execution Plane`;
      openssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'leaf.key', '-out', 'leaf.csr',
        '-subj', subject], work);

      writeFileSync(join(work, 'ext.cnf'), [
        'basicConstraints=CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment',
        'extendedKeyUsage=clientAuth,serverAuth',
        `subjectAltName=URI:urn:dbiz:tenant:${tenantId},DNS:localhost,IP:127.0.0.1`,
      ].join('\n'));

      openssl(['x509', '-req', '-in', 'leaf.csr',
        '-CA', join(this.stateDir, 'ca.crt'), '-CAkey', join(this.stateDir, 'ca.key'),
        '-CAcreateserial', '-out', 'leaf.crt',
        '-days', String(this.leafValidityDays), '-extfile', 'ext.cnf'], work);

      const certificatePem = readFileSync(join(work, 'leaf.crt'), 'utf8');
      const privateKeyPem = readFileSync(join(work, 'leaf.key'), 'utf8');
      const x = new X509Certificate(certificatePem);
      return {
        certificatePem,
        privateKeyPem,
        keyId: keyIdOf(certificatePem),
        subject,
        notBefore: new Date(x.validFrom),
        notAfter: new Date(x.validTo),
      };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  /**
   * Rotate a tenant's certificate.
   *
   * Returns NEW material without invalidating the old one: both are valid until the
   * previous certificate expires (R-08.50). Overlap is what makes rotation possible
   * without redeploying the Execution Plane — an atomic swap would require the
   * customer to restart in lockstep with DBiz, which R-19.11 forbids.
   */
  rotateForTenant(tenantId: string): CertificateMaterial {
    return this.issueForTenant(tenantId);
  }

  /** Revoke by key identifier. Takes effect immediately, with no customer action. */
  revoke(keyId: string): void {
    this.revoked.add(keyId);
  }

  isRevoked(keyId: string): boolean {
    return this.revoked.has(keyId);
  }

  /**
   * Validate a presented certificate against the chain, expiry, revocation, and the
   * tenant it claims.
   *
   * Failures are CLASSIFIED. "Expired" and "wrong tenant" are different facts with
   * different responses, and collapsing them into a bare false is the same defect as
   * conflating a tamper verdict with an unsupported algorithm.
   */
  validate(certificatePem: string, expectedTenantId: string, now: Date = new Date()): ChainValidation {
    let x: X509Certificate;
    try {
      x = new X509Certificate(certificatePem);
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    const root = new X509Certificate(this.rootCertificatePem);
    if (!x.verify(root.publicKey)) return { ok: false, reason: 'untrusted-issuer' };

    if (now < new Date(x.validFrom)) return { ok: false, reason: 'not-yet-valid' };
    if (now > new Date(x.validTo)) return { ok: false, reason: 'expired' };

    const keyId = keyIdOf(certificatePem);
    if (this.revoked.has(keyId)) return { ok: false, reason: 'revoked' };

    // EXACT tenant binding — never a substring test. `.includes()` would let a certificate
    // issued for `tenant-a-2` satisfy a check for `tenant-a` (prefix), the same class of bug
    // fixed elsewhere for issuer matching. Compare the CN value and each SAN URI exactly (N-6).
    const cn = /CN=([^,/\n]+)/.exec(x.subject)?.[1]?.trim();
    const sans = (x.subjectAltName ?? '').split(',').map((s) => s.trim());
    const boundToTenant = cn === expectedTenantId || sans.includes(`URI:urn:dbiz:tenant:${expectedTenantId}`);
    if (!boundToTenant) return { ok: false, reason: 'wrong-tenant', presented: x.subject };

    return { ok: true, keyId, subject: x.subject };
  }
}

export type ChainValidation =
  | { readonly ok: true; readonly keyId: string; readonly subject: string }
  | { readonly ok: false; readonly reason: 'malformed' }
  | { readonly ok: false; readonly reason: 'untrusted-issuer' }
  | { readonly ok: false; readonly reason: 'not-yet-valid' }
  | { readonly ok: false; readonly reason: 'expired' }
  | { readonly ok: false; readonly reason: 'revoked' }
  | { readonly ok: false; readonly reason: 'wrong-tenant'; readonly presented: string };
