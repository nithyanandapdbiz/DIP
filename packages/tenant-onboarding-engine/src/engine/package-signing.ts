/**
 * Production IP-side artifact signing (ADR-0007 posture) — reuses the platform's existing crypto.
 *
 * TRACEABILITY: ADR-0007 (package signing) · ADR-0005 (canonical integrity primitive; the manifest
 *   contentHash is already a real SHA-256 digest) · Doc 08 (key custody) · ADR-0035 (EP portal/updates).
 *
 * A persisted ed25519 key produces a DETACHED signature over a package's canonical content hash. The
 * Execution Plane recomputes the hash from the received files (generation is deterministic) and verifies
 * the signature with the PUBLISHED PUBLIC key — the exact recipe `carlislehomes/src/runtime/package.js`
 * already uses to verify execution packages. This is NEW only in being a persisted PRODUCTION signer
 * rather than the offline dev fixture; it invents no new signing framework.
 */
import { generateKeyPairSync, sign as edSign, verify as edVerify, createHash, createPublicKey } from 'node:crypto';

/**
 * THE DETACHED SIGNATURE IS THE CONTRACT'S, NOT THIS MODULE'S (D-123 link 1, ruling 1).
 *
 * This file declared its own `{ algorithm, keyId, value }` while the functional-testing engine
 * declared `SignatureEnvelope { signature, signingKeyId, algorithm }` — **two types for one
 * concept, sharing no field name on the two fields that matter.** They could drift because neither
 * was in `@dbiz/contracts` and **nothing had ever carried a signature across the boundary**, so
 * nothing could disagree.
 *
 * The shape below WON the convergence because it is the one actually produced — a working signer
 * emits it — and converging toward the artefact that exists costs nothing.
 */
import type { DetachedSignature } from '@dbiz/contracts';
export type { DetachedSignature };

export interface SigningKey {
  readonly keyId: string;
  readonly privateKeyPem: string; // IP-owned; never leaves the Intelligence Plane
  readonly publicKeyPem: string;  // published to the EP as trust material
}

/** A short, stable key id derived from the public key (fingerprint-style, like the CA keyId). */
function keyIdOf(publicKeyPem: string): string {
  return 'sig-' + createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
}

/** Raised when the signing key is not provisioned. There is no create-if-missing (ADR-0083 P-83.2). */
export class SigningKeyAbsentError extends Error {
  constructor(message: string) { super(message); this.name = 'SigningKeyAbsentError'; }
}

/**
 * Resolve the package signing key from the SECRET PROVIDER (ADR-0083 P-83.1, P-83.2).
 *
 * ══ WHY THIS IS NOT A FILE, AND WHY IT WAS ═════════════════════════════════════════════════════
 *
 * `SESSION_SECRET` has always been resolved through the Secret Provider. **This key — which
 * ADR-0007 §2 calls the platform's highest-value asset, whose compromise "grants reach into EVERY
 * customer tenancy simultaneously" — was a file that was created when missing**, twelve lines away
 * in the same composition root. **The weaker custody held the stronger asset, by RESIDUE rather than
 * by choice:** ADR-0060 §6 M-a adopted the config/secret seam ADDITIVELY, so what was already a file
 * stayed a file. Nothing rejected the Secret Provider for it; nothing considered it (debt D-129).
 *
 * ══ THERE IS NO CREATE-IF-MISSING, AND THAT REMOVES A PROBLEM RATHER THAN ADDING A CHECK ═══════
 *
 * Provisioning a secret is a **deliberate act**, so *absent* unambiguously means *not provisioned*.
 * **The first-run/lost-volume ambiguity does not arise** — it was an artefact of the key living
 * somewhere that HAS a creation idiom at all.
 *
 * **`SigningKeyMintAuthorisation` IS THEREFORE RETIRED WITH ITS SUBJECT, NOT LEFT RUNNING**
 * (ADR-0083 P-83.3, CHARTER §17.1.1 obligation (ii)). Its properties would be satisfied trivially
 * once nothing can create a key, and **a control satisfied by the absence of its subject is not
 * detecting anything.** Leaving it would look like defence in depth and be decoration.
 *
 * ══ NO LOCAL-DEVELOPMENT FALLBACK, DELIBERATELY (ADR-0083 §4.1) ════════════════════════════════
 *
 * A fallback that creates a key when the backend is unreachable reinstates exactly the branch this
 * removes, **in the environment where it is least likely to be noticed**. Local development
 * provisions a local secret.
 */
export function resolveSigningKey(secrets: { get(name: string): string | undefined }): SigningKey {
  const privateKeyPem = secrets.get('PACKAGE_SIGNING_KEY');
  if (privateKeyPem === undefined || privateKeyPem === '') {
    throw new SigningKeyAbsentError(
      'PACKAGE_SIGNING_KEY is not available from the secret backend. It signs every execution package this '
      + 'plane authors, and there is no create-if-missing: a key that appeared by itself would change the key id '
      + 'and every verification key already distributed would stop matching. Provision it (Azure Key Vault in '
      + 'cloud; a local secret in development) — see ADR-0083.',
    );
  }
  const publicKeyPem = createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
  return { keyId: keyIdOf(publicKeyPem), privateKeyPem, publicKeyPem };
}

/**
 * Generate a signing key pair, for PROVISIONING — never at boot.
 *
 * Exported so an operator tool or a test can mint one deliberately. **It is not called by any boot
 * path**, which is the whole of P-83.2: creation is an act someone performs, not a fallback a
 * process reaches.
 */
export function generateSigningKeyMaterial(): { privateKeyPem: string; publicKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

/** Detached ed25519 signature over the canonical content hash of a package/manifest. */
export function signContentHash(key: SigningKey, contentHash: string): DetachedSignature {
  const value = edSign(null, Buffer.from(contentHash, 'utf8'), key.privateKeyPem).toString('base64');
  return { algorithm: 'ed25519', keyId: key.keyId, value };
}

/**
 * EP-side verification: the caller recomputes `contentHash` from the received files first
 * (deterministic generation), then this verifies the detached signature with the published public
 * key. Returns false on any tamper, wrong key, or malformed signature — never throws.
 */
export function verifyContentHash(publicKeyPem: string, contentHash: string, sig: DetachedSignature): boolean {
  if (!sig || sig.algorithm !== 'ed25519' || !sig.value) return false;
  try {
    return edVerify(null, Buffer.from(contentHash, 'utf8'), publicKeyPem, Buffer.from(sig.value, 'base64'));
  } catch {
    return false;
  }
}

/**
 * THE PACKAGE SIGNER — link 1 of D-123, at AUTHORING (ADR-0007, ADR-0081).
 *
 * THE SIGNATURE ATTESTS ORIGIN — "the Intelligence Plane authored this" — so it belongs to the act
 * that authors. ADR-0007 rejected signing at RETRIEVAL for exactly that reason, and publication is
 * nearer retrieval than authoring. The answer only became available once authoring and publication
 * became two acts: while P-70.1's "exists and is retrievable" was read as ONE obligation (D-122),
 * there was no distinct authoring moment for a signature to attach to.
 *
 * THE PROVENANCE AGREEMENT IS ENFORCED HERE, WHERE IT CAN STILL BE FIXED. A package names the key it
 * was signed under; the signature names the key it was produced with. **This is the only place both
 * values are ever in hand.** Refusing here turns a mismatch into a loud authoring failure; letting it
 * through turns it into `signature-invalid` in the customer's plane — a defect surfacing where nobody
 * did anything wrong, which is mint-on-empty's shape at a second site.
 */
export interface SignablePackage {
  readonly provenance: {
    readonly signingKeyId: string;
    readonly contentHash: { readonly value: string };
  };
}

/** Raised when a package names a signing key this signer does not hold. */
export class SigningKeyMismatchError extends Error {
  constructor(message: string) { super(message); this.name = 'SigningKeyMismatchError'; }
}

/**
 * Construct the package signer. Structurally satisfies the canonical runtime's `PackageSigner` port
 * without importing it — the capability engine is not a dependency of this tier, and a wire-level
 * agreement does not justify inverting the layering (the same reasoning as D-128's rule-lift).
 */
export function createPackageSigner(key: SigningKey): { sign(pkg: SignablePackage): DetachedSignature } {
  return {
    sign(pkg: SignablePackage): DetachedSignature {
      if (pkg.provenance.signingKeyId !== key.keyId) {
        throw new SigningKeyMismatchError(
          `the package names signing key "${pkg.provenance.signingKeyId}" and this plane holds "${key.keyId}". `
          + 'Signing it anyway would produce a signature the Execution Plane resolves to the wrong key and refuses.',
        );
      }
      // Signed over the CONTENT HASH, not over re-serialised bytes — doc 20 §5: detached signatures
      // are specified so verification needs no re-serialisation, and `digestV1` has already bound
      // the hash domain into the value, so a manifest signature cannot be replayed as a package one.
      return signContentHash(key, pkg.provenance.contentHash.value);
    },
  };
}
