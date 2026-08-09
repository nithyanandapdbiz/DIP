/**
 * Execution Plane registration — the bootstrap exchange and its replay protection.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md §5a.2 · 21-tenant-lifecycle.md §3b
 *   ADR          : ADR-0021
 *   Criteria     : C-08.17 (one-time credential consumed, replay refused)
 *                  C-08.18 (a failed registration leaves the tenant UNREGISTERED)
 *                  C-08.19 (idempotent by tenant identity)
 *                  C-21.21 (credential consumed on first use)
 *
 * ATOMICITY IS THE HARD PART.
 * R-08.45 requires a failure at any step to leave the tenant unregistered, never
 * partially registered. A half-registered tenant holds a certificate the platform
 * does not know it issued — the worst of both states. Every step is therefore
 * staged and committed only once all have succeeded.
 */
import type { CertificateAuthority, CertificateMaterial } from './certificate-authority.js';
import type { AuthorisationServer, AccessToken, RefreshToken, OAuthClient } from './authentication.js';

export interface RegistrationRequest {
  readonly tenantId: string;
  readonly oneTimeCredential: string;
}

export interface RegistrationGrant {
  readonly tenantId: string;
  readonly certificate: CertificateMaterial;
  readonly client: OAuthClient;
  readonly access: AccessToken;
  readonly refresh: RefreshToken;
  /** Configuration the Execution Plane downloads at registration. */
  readonly configuration: Readonly<Record<string, string>>;
}

export interface AuditRecord {
  readonly at: string;
  readonly event: string;
  readonly tenantId: string;
  readonly outcome: string;
}

export type RegistrationOutcome =
  | { readonly ok: true; readonly grant: RegistrationGrant; readonly idempotentReplay: false }
  | { readonly ok: true; readonly idempotentReplay: true }
  | { readonly ok: false; readonly reason: 'unknown-credential' }
  | { readonly ok: false; readonly reason: 'credential-already-consumed' }
  | { readonly ok: false; readonly reason: 'tenant-mismatch' }
  | { readonly ok: false; readonly reason: 'subscription-inactive' }
  | { readonly ok: false; readonly reason: 'issuance-failed'; readonly detail: string };

export interface RegistrationServiceOptions {
  readonly ca: CertificateAuthority;
  readonly auth: AuthorisationServer;
  /** Tenants whose subscription permits registration. */
  readonly activeTenants: ReadonlySet<string>;
  readonly configuration?: Readonly<Record<string, string>>;
}

export class RegistrationService {
  private readonly registered = new Map<string, RegistrationGrant>();
  private readonly auditLog: AuditRecord[] = [];

  constructor(private readonly options: RegistrationServiceOptions) {}

  get auditTrail(): readonly AuditRecord[] { return this.auditLog; }

  private audit(event: string, tenantId: string, outcome: string): void {
    this.auditLog.push({ at: new Date().toISOString(), event, tenantId, outcome });
  }

  /** Records tenant creation, so the audit chain begins before registration (E-10). */
  recordTenantCreated(tenantId: string): void {
    this.audit('tenant-creation', tenantId, 'created');
  }

  recordExecution(tenantId: string, runId: string): void {
    this.audit('execution', tenantId, runId);
  }

  recordUpgrade(tenantId: string, detail: string): void {
    this.audit('upgrade', tenantId, detail);
  }

  isRegistered(tenantId: string): boolean { return this.registered.has(tenantId); }

  grantFor(tenantId: string): RegistrationGrant | null { return this.registered.get(tenantId) ?? null; }

  register(request: RegistrationRequest): RegistrationOutcome {
    const { ca, auth, activeTenants } = this.options;

    // Idempotency BEFORE credential consumption: a completed registration re-run
    // returns the existing grant rather than failing on a spent credential (C-08.19).
    const existing = this.registered.get(request.tenantId);
    if (existing) {
      this.audit('registration', request.tenantId, 'idempotent-replay');
      // Do NOT re-disclose secret material (certificate private key, access/refresh tokens)
      // on replay — a tenantId is not a secret, so anyone who names an already-registered
      // tenant must not receive its identity. A lost grant is recovered through the
      // authenticated rotate path, never by replaying registration (closes N-1).
      return { ok: true, idempotentReplay: true };
    }

    const consumed = auth.consumeOneTimeCredential(request.oneTimeCredential);
    if (!consumed.ok) {
      const reason = consumed.reason === 'already-consumed'
        ? 'credential-already-consumed' as const
        : 'unknown-credential' as const;
      this.audit('registration', request.tenantId, reason);
      return { ok: false, reason };
    }

    if (consumed.tenantId !== request.tenantId) {
      this.audit('registration', request.tenantId, 'tenant-mismatch');
      return { ok: false, reason: 'tenant-mismatch' };
    }

    if (!activeTenants.has(request.tenantId)) {
      // The credential is already spent, and that is correct: it has been used.
      // Reissuing is an onboarding decision, not a retry.
      this.audit('registration', request.tenantId, 'subscription-inactive');
      return { ok: false, reason: 'subscription-inactive' };
    }

    let grant: RegistrationGrant;
    try {
      const certificate = ca.issueForTenant(request.tenantId);
      const client = auth.registerClient(request.tenantId);
      const access = auth.issueAccessToken(request.tenantId, certificate.keyId);
      const refresh = auth.issueRefreshToken(request.tenantId);
      grant = {
        tenantId: request.tenantId, certificate, client, access, refresh,
        configuration: this.options.configuration ?? {},
      };
    } catch (e) {
      // Nothing was committed: the tenant remains unregistered (C-08.18).
      this.audit('registration', request.tenantId, 'issuance-failed');
      return { ok: false, reason: 'issuance-failed', detail: (e as Error).message };
    }

    this.registered.set(request.tenantId, grant);
    this.audit('registration', request.tenantId, 'registered');
    return { ok: true, grant, idempotentReplay: false };
  }

  /**
   * Rotate a registered tenant's certificate and issue a token bound to the new one.
   *
   * The previous certificate remains valid until it expires — overlap is what makes
   * rotation possible without redeploying the Execution Plane (R-08.50).
   */
  rotateCertificate(tenantId: string):
  { ok: true; grant: RegistrationGrant; previous: CertificateMaterial } | { ok: false; reason: 'not-registered' } {
    const existing = this.registered.get(tenantId);
    if (!existing) return { ok: false, reason: 'not-registered' };
    const certificate = this.options.ca.rotateForTenant(tenantId);
    const access = this.options.auth.issueAccessToken(tenantId, certificate.keyId);
    const refresh = this.options.auth.issueRefreshToken(tenantId);
    const grant: RegistrationGrant = { ...existing, certificate, access, refresh };
    this.registered.set(tenantId, grant);
    this.audit('certificate-rotation', tenantId, 'rotated');
    return { ok: true, grant, previous: existing.certificate };
  }

  decommission(tenantId: string): boolean {
    const existing = this.registered.get(tenantId);
    if (!existing) return false;
    this.options.ca.revoke(existing.certificate.keyId);
    this.registered.delete(tenantId);
    this.audit('decommission', tenantId, 'revoked-and-removed');
    return true;
  }
}
