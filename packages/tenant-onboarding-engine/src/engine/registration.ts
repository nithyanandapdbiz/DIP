/**
 * Execution-Plane registration & trust establishment — the OTC-authenticated endpoint that
 * turns a one-time registration credential into the EP's ongoing, tenant-scoped API identity.
 *
 * TRACEABILITY
 *   Architecture : 05-cross-plane-communication.md (EP-initiated, outbound-only — INV-3) ·
 *                  06-data-sovereignty.md (INV-2 — the IP keeps no customer secret) ·
 *                  07-tenant-isolation.md (C-07.11 — one identity per tenant, no cross-tenant) ·
 *                  08-security-model.md §5a (short-lived signed credentials) ·
 *                  20-cross-plane-contracts.md (the registration contract)
 *   ADR          : ADR-0036 (EP↔IP registration & trust establishment) · ADR-0032 (SSOT) ·
 *                  ADR-0033 §R-33.5 (auth is a production precondition)
 *
 * WHAT THIS IS. The solution generator bakes a ONE-TIME registration credential (OTC) into the EP
 * package (`solution-export.ts`). This module is the other half: the IP-side endpoint that VALIDATES
 * that OTC and, in exchange, mints the EP's tenant-scoped session credential (reusing `issueEpToken`,
 * so there is no second token type). The OTC is single-use — invalidated the instant it is consumed —
 * so a credential that lives in a repository history forever cannot be replayed.
 *
 * WHAT IT IS NOT. It is NOT authentication-by-session (that is `route()` + `bearerAuthenticator`); the
 * caller is unauthenticated by design and proves itself with the OTC alone. It stores NO customer
 * secret: the OTC is held only as a SHA-256 hash + non-secret metadata (INV-2), and the issued EP
 * credential is a DBIZ session token, not a customer credential.
 *
 * ZERO TRUST. Possession of the OTC is necessary but not sufficient: the endpoint independently
 * verifies tenant existence, tenant/OTC binding, the claimed environment against the tenant's
 * configured environment, the contract version, and the tenant's lifecycle state — before issuing
 * anything. Every outcome (success AND every refusal) writes an immutable audit record (§11).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync,
  openSync, closeSync, fsyncSync, renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { issueEpToken } from './ep-token.js';
import type { TenantConfigRepository } from './tenant-repository.js';
import type { ApiResponse } from './api.js';

const OTC_PREFIX = 'otc_';
const DEFAULT_OTC_TTL_SECONDS = 24 * 3600; // 24h to complete first registration; single-use regardless.

// ── Records ───────────────────────────────────────────────────────────────────

/** A one-time registration credential at rest: a HASH + non-secret metadata. Never the OTC value (INV-2). */
export interface OtcRecord {
  /** SHA-256 of the OTC (hex). The plaintext OTC is returned once and never persisted. */
  readonly hash: string;
  /** The OPAQUE tenant identity the OTC is bound to (R-21.3). One OTC → one tenant. */
  readonly tenantId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Set the instant the OTC is consumed — single-use is enforced by this field, atomically. */
  consumedAt?: string;
  readonly correlationId?: string;
}

/** An immutable audit record for every trust-establishment event (success or refusal). §11. */
export interface RegistrationAuditRecord {
  readonly ts: string;
  readonly operation:
    | 'otc-issued' | 'registration-succeeded' | 'registration-refused'
    | 'credential-issued' | 'credential-renewed' | 'credential-revoked';
  readonly result: 'success' | 'refused';
  readonly tenantId?: string;
  readonly slug?: string;
  readonly executionPlaneId?: string;
  readonly correlationId?: string;
  /** A stated, non-secret reason on refusal. Never carries the OTC or the issued credential. */
  readonly reason?: string;
}

// ── Store abstraction ───────────────────────────────────────────────────────────

/**
 * The registration store: OTC hashes + the append-only audit trail. Injected so tests use an
 * in-memory store and the dev/prod instance uses a durable one — the same seam the tenant store uses.
 * A production deployment substitutes a shared/KMS-backed implementation without changing this contract.
 */
export interface RegistrationStore {
  putOtc(record: OtcRecord): void;
  getOtc(hash: string): OtcRecord | undefined;
  /** Atomically mark an OTC consumed. Returns false if it was already consumed (single-use race guard). */
  consumeOtc(hash: string, at: string): boolean;
  /**
   * Roll back a consumption. Called ONLY when credential issuance fails AFTER a successful consume, so a
   * transient failure does not permanently burn a valid one-time credential (the legitimate EP can retry).
   * Not a general un-consume: it clears consumedAt so the single-use gate re-arms for a genuine retry.
   */
  releaseOtc(hash: string): void;
  appendAudit(record: RegistrationAuditRecord): void;
  readAudit(): readonly RegistrationAuditRecord[];
}

/** In-memory store for tests and ephemeral instances. */
export class InMemoryRegistrationStore implements RegistrationStore {
  private readonly otc = new Map<string, OtcRecord>();
  private readonly auditLog: RegistrationAuditRecord[] = [];
  putOtc(record: OtcRecord): void { this.otc.set(record.hash, { ...record }); }
  getOtc(hash: string): OtcRecord | undefined { const r = this.otc.get(hash); return r ? { ...r } : undefined; }
  consumeOtc(hash: string, at: string): boolean {
    const r = this.otc.get(hash);
    if (!r || r.consumedAt) return false;
    r.consumedAt = at;
    return true;
  }
  releaseOtc(hash: string): void { const r = this.otc.get(hash); if (r) delete r.consumedAt; }
  appendAudit(record: RegistrationAuditRecord): void { this.auditLog.push(record); }
  readAudit(): readonly RegistrationAuditRecord[] { return [...this.auditLog]; }
}

/**
 * Durable, SINGLE-INSTANCE store for the dev instance: OTC hashes in `<root>/otc.json`, the audit trail
 * in `<root>/audit.log` (append-only JSONL). The audit file is only ever appended to — the immutability
 * signal a real deployment backs with WORM/object-lock storage. It holds hashes + non-secret metadata
 * only (INV-2); the plaintext OTC and the issued credential are never written here.
 *
 * NOT SAFE TO HORIZONTALLY SCALE on a shared filesystem: consumeOtc is a read-modify-write over the whole
 * JSON, so two instances could both pass the single-use gate for one OTC. A multi-instance deployment MUST
 * substitute a shared store with an atomic compare-and-set (a DB unique constraint / conditional write /
 * KMS), per the RegistrationStore contract above.
 */
export class FileRegistrationStore implements RegistrationStore {
  private readonly otcFile: string;
  private readonly auditFile: string;
  constructor(private readonly rootDir: string) {
    mkdirSync(this.rootDir, { recursive: true });
    this.otcFile = join(this.rootDir, 'otc.json');
    this.auditFile = join(this.rootDir, 'audit.log');
  }
  private readAll(): Record<string, OtcRecord> {
    if (!existsSync(this.otcFile)) return {};
    try { return JSON.parse(readFileSync(this.otcFile, 'utf8')) as Record<string, OtcRecord>; } catch { return {}; }
  }
  /**
   * Persist the OTC store ATOMICALLY (temp → fsync → rename).
   *
   * The same reasoning as the tenant manifest, with a sharper consequence: this file records which
   * one-time credentials have been CONSUMED. A torn write here does not merely lose data — it can
   * resurrect a spent credential (single-use defeated) or destroy the record of every outstanding one
   * (every pending Execution Plane registration dead). Neither is acceptable at any replica count.
   */
  private writeAll(map: Record<string, OtcRecord>): void {
    const tmp = join(this.rootDir, `.otc.json.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    let fd: number | undefined;
    try {
      fd = openSync(tmp, 'w');
      writeFileSync(fd, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(tmp, this.otcFile);
    } catch (e) {
      if (fd !== undefined) { try { closeSync(fd); } catch { /* already closed */ } }
      try { if (existsSync(tmp)) rmSync(tmp, { force: true }); } catch { /* best effort */ }
      throw e;
    }
  }
  putOtc(record: OtcRecord): void { const m = this.readAll(); m[record.hash] = { ...record }; this.writeAll(m); }
  getOtc(hash: string): OtcRecord | undefined { const r = this.readAll()[hash]; return r ? { ...r } : undefined; }
  consumeOtc(hash: string, at: string): boolean {
    const m = this.readAll();
    const r = m[hash];
    if (!r || r.consumedAt) return false;
    r.consumedAt = at;
    this.writeAll(m);
    return true;
  }
  releaseOtc(hash: string): void {
    const m = this.readAll();
    const r = m[hash];
    if (r && r.consumedAt) { delete r.consumedAt; this.writeAll(m); }
  }
  appendAudit(record: RegistrationAuditRecord): void { appendFileSync(this.auditFile, `${JSON.stringify(record)}\n`, 'utf8'); }
  readAudit(): readonly RegistrationAuditRecord[] {
    if (!existsSync(this.auditFile)) return [];
    return readFileSync(this.auditFile, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as RegistrationAuditRecord);
  }
}

// ── The registration contract ─────────────────────────────────────────────────

/** What the Execution Plane presents at registration. Identity fields are non-secret; the OTC is the proof. */
export interface RegistrationRequest {
  /** The one-time registration credential (from the EP bootstrap). The ONLY proof of trust. */
  readonly otc?: string;
  readonly tenantId?: string;
  readonly executionPlaneId?: string;
  /** The environment the EP claims to be (test/staging/production) — verified against the tenant's config. */
  readonly environment?: string;
  readonly contractVersion?: string;
  readonly correlationId?: string;
}

/**
 * What the portal returns when an operator mints a fresh OTC by hand (the "generate OTC" action),
 * parallel to the EP API-token reveal. The OTC value is shown ONCE and never persisted — the IP keeps
 * only its SHA-256 hash (INV-2 / R-36.3). It binds to the tenant's opaque `tenantId`, so the EP must
 * present that same id at registration.
 */
export interface RegistrationOtcResult {
  /** The plaintext one-time credential — returned once, for the operator to map into the EP bootstrap. */
  readonly otc: string;
  /** The opaque tenant identity the OTC is bound to (R-21.3). The EP must present this at /api/register. */
  readonly tenantId: string;
  /** Where the EP presents the OTC to complete registration. */
  readonly registrationEndpoint: string;
  /** When it was issued, and when it stops being valid (single-use regardless — 24h by default). */
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** What the IP returns on success. The credential is returned ONCE; only metadata is persisted. */
/**
 * THE ONE PLACE THE WORK PATH IS CONSTRUCTED (ADR-0080 P-80.2).
 *
 * The grant states it and the rotation carrier re-states it, so it is built HERE and imported by
 * both. A second `/api/tenants/${slug}/work` literal is the duplicate source of truth ADR-0032
 * forbids, and the failure mode is specific: the two would drift, and the tenancies that received
 * the stale one would poll an address that 404s while every test over the other passed.
 */
export function workPathFor(slug: string): string {
  return `/api/tenants/${slug}/work`;
}

export interface RegistrationGrant {
  readonly credential: string;
  readonly credentialType: 'dbiz-ep-session-jwt';
  readonly credentialEnv: 'DBIZ_EP_TOKEN';
  readonly tokenVersion: number;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly tenantId: string;
  readonly slug: string;
  readonly executionPlaneId: string;
  readonly correlationId: string;
  /**
   * Non-secret routing/config map the EP needs — the "configuration downloaded at registration".
   *
   * AFTER ADR-0081 P-81.4 THIS FIELD ALSO CARRIES TRUST MATERIAL, AND THAT IS A RISE IN ITS
   * SECURITY SIGNIFICANCE RATHER THAN A NEW KIND OF CONTENT. `packageVerificationKeys` anchors
   * verification for every execution package this tenancy will ever run. Nothing secret crosses —
   * verification keys are public by R-08.15, and possession of one SHALL NOT permit signing — but a
   * later change treating `configuration` as freely extensible routing data would be extending an
   * artefact that now anchors verification. See ADR-0081 §5.2.
   */
  readonly configuration: {
    readonly contractVersion: string;
    readonly updatesPath: string;
    readonly pollingIntervalSeconds: number;
    readonly entitledCapabilities: readonly string[];
    /**
     * THE VERIFICATION KEY **SET**, NOT A KEY (ADR-0081 P-81.4, ADR-0007 §6).
     *
     * ── WHY A SET, AND WHY THIS IS THE WHOLE POINT ────────────────────────────────────────────
     *
     * ADR-0007 makes multiple keys valid CONCURRENTLY so that rotation needs no customer
     * redeployment. An Execution Plane holding ONE key must be redeployed to accept a rotated
     * one — which is precisely the coupling ADR-0007 §6 exists to remove. The EP therefore
     * resolves BY `keyId`, taken from the package's own `provenance.signingKeyId`, against
     * whatever set it currently holds.
     *
     * ── WHAT THIS REPLACES, AND WHY IT WAS INVISIBLE (debt D-125) ─────────────────────────────
     *
     * `solution-export` emitted `signatureVerificationKeyRef: '<FILL: IP public verification key
     * ref + keyId>'` into every generated `config/security.json`, AND emitted the runtime
     * instruction to verify against that same field. A placeholder and the instruction to trust
     * it, written by one function. Nothing published the key, and nothing could have noticed:
     * no package had ever been served, so no verification had ever been attempted.
     *
     * ── THE CHEAPEST-LOOKING FIX IS THE ONE THAT IS REFUSED ───────────────────────────────────
     *
     * Filling the placeholder with today's PEM at generation time would close it and rebuild the
     * redeployment coupling. Keys arrive HERE, at registration — the moment ADR-0036 already
     * defines as trust establishment, authenticated by the OTC — and rotate over the update-event
     * channel the EP already polls. No new endpoint and no inbound dependency.
     */
    readonly packageVerificationKeys: readonly PackageVerificationKey[];
    /**
     * WHERE THIS TENANCY ASKS FOR WORK (ADR-0080 §6 step 4, P-80.2).
     *
     * **A ROUTE THE FAR SIDE CANNOT DISCOVER IS A ROUTE THE FAR SIDE DOES NOT HAVE.**
     * `GET /api/tenants/{slug}/work` is mounted, authorised and subtracting — and until this field
     * existed the only way an Execution Plane could reach it was to be told out of band, which is
     * not a mechanism, it is a conversation.
     *
     * **IT SITS BESIDE `updatesPath` DELIBERATELY, AND IS NOT `updatesPath`.** ADR-0080 §2.3 keeps
     * the two exchanges independent: a software update and a run are different lifecycles and
     * neither blocks the other. Reusing the updates channel would have coupled them at the one
     * place a coupling is invisible — the EP's poll loop.
     *
     * **DISCOVERY IS NOT ACCESS.** Knowing the path grants nothing: the route inherits the tenant
     * router's authorisation (P-80.2), so an EP holding this string and no valid credential is
     * refused exactly as it was before it held the string.
     */
    readonly workPath: string;
  };
}

/**
 * One public verification key the Execution Plane may verify a sealed package against.
 *
 * PUBLIC BY CONSTRUCTION, AND THE TYPE SAYS SO. There is no field here that could hold a private
 * key, so a future change cannot ship one through this path by mistake — R-08.15 and R-08.17
 * enforced by the shape rather than by a review. INV-2 is unaffected: no secret crosses, so this
 * carries VALUES rather than references, which is the opposite of the credential rule and is
 * correct for the same reason — a public key IS the trust anchor, and a reference to one the EP
 * cannot resolve offline would reintroduce the inbound dependency R-17.24 forbids.
 */
export interface PackageVerificationKey {
  /** Matches `provenance.signingKeyId` on the package being verified (ADR-0007 §4). */
  readonly keyId: string;
  /** SPKI PEM. Verification only — possession SHALL NOT permit signing (R-08.15). */
  readonly publicKeyPem: string;
  /** The signature algorithm this key implies (ADR-0007 §6: a new algorithm is a new key id). */
  readonly algorithm: 'ed25519';
}

export interface RegistrationDeps {
  readonly repo: TenantConfigRepository;
  readonly store: RegistrationStore;
  /** Secret used to sign the EP credential. Absent → registration is not configured (501). */
  readonly epTokenSecret?: string;
  /** Contract version this IP instance accepts. */
  readonly contractVersion: string;
  readonly epTokenTtlSeconds?: number;
  readonly otcTtlSeconds?: number;
  /** ISO clock, injected for deterministic tests. */
  readonly now?: () => string;
  /**
   * The public verification key SET this deployment currently signs packages under (ADR-0081 P-81.4).
   *
   * INJECTED RATHER THAN IMPORTED, for the reason ADR-0079 gives about its ownership resolver: the
   * process that holds the signing key is the composition root, and this module must not reach for
   * it. Supplied by `platform-adoption`, which already loads the key at boot.
   *
   * **ABSENT MEANS ABSENT, AND THE GRANT SAYS SO — it does NOT mean "none".** An empty set is
   * emitted only when this deployment genuinely holds no signing key; there is no placeholder and
   * no default. The distinction matters because D-125 is exactly a placeholder that read as a
   * value, and an Execution Plane that receives an empty set can refuse rather than proceed on a
   * `<FILL:` marker it cannot resolve.
   */
  readonly packageVerificationKeys?: () => readonly PackageVerificationKey[];
}

const sha256hex = (s: string): string => createHash('sha256').update(s).digest('hex');
const nowIso = (deps: RegistrationDeps): string => (deps.now ? deps.now() : new Date().toISOString());

/** An issued OTC plus its non-secret lifecycle metadata. The plaintext `otc` is returned once and never persisted. */
export interface IssuedOtc {
  readonly otc: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/**
 * Issue a one-time registration credential bound to a tenant, returning the plaintext OTC ONCE together
 * with its issue/expiry metadata. The store keeps only the hash (INV-2 / R-36.3). This is the core the
 * string-returning `issueRegistrationOtc` (wired as the solution generator's `issueOneTimeCredential`)
 * and the portal's "generate OTC" endpoint both call — one issuance path, so a portal-minted OTC is
 * exactly the kind `handleRegistration` later validates.
 */
export function issueRegistrationOtcDetailed(deps: RegistrationDeps, tenantId: string, opts: { correlationId?: string } = {}): IssuedOtc {
  const otc = `${OTC_PREFIX}${randomBytes(24).toString('base64url')}`;
  const at = nowIso(deps);
  const ttl = deps.otcTtlSeconds ?? DEFAULT_OTC_TTL_SECONDS;
  const expiresAt = new Date(Date.parse(at) + ttl * 1000).toISOString();
  deps.store.putOtc({
    hash: sha256hex(otc),
    tenantId,
    issuedAt: at,
    expiresAt,
    ...(opts.correlationId ? { correlationId: opts.correlationId } : {}),
  });
  deps.store.appendAudit({ ts: at, operation: 'otc-issued', result: 'success', tenantId, ...(opts.correlationId ? { correlationId: opts.correlationId } : {}) });
  return { otc, issuedAt: at, expiresAt };
}

/**
 * Issue a one-time registration credential bound to a tenant. Returns the plaintext OTC ONCE; the
 * store keeps only its hash. Wired as the solution generator's `issueOneTimeCredential`, so the OTC
 * baked into the EP package is exactly the one this endpoint later validates.
 */
export function issueRegistrationOtc(deps: RegistrationDeps, tenantId: string, opts: { correlationId?: string } = {}): string {
  return issueRegistrationOtcDetailed(deps, tenantId, opts).otc;
}

/** Constant-time equality over two hex digests of equal length. */
function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });

/** Refuse, and record WHY in the immutable audit trail. The reason is non-secret and never echoes the OTC. */
function refuse(deps: RegistrationDeps, status: number, reason: string, ctx: { tenantId?: string; slug?: string; executionPlaneId?: string; correlationId: string }): ApiResponse {
  deps.store.appendAudit({
    ts: nowIso(deps), operation: 'registration-refused', result: 'refused', reason,
    ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
    ...(ctx.slug ? { slug: ctx.slug } : {}),
    ...(ctx.executionPlaneId ? { executionPlaneId: ctx.executionPlaneId } : {}),
    correlationId: ctx.correlationId,
  });
  return { status, body: { error: reason, correlationId: ctx.correlationId } };
}

/**
 * The pure registration handler — (request) → (status, body), testable without a socket. It is the
 * one place an EP credential is issued from an OTC; both transports (node:http and NestJS) call it.
 */
export function handleRegistration(req: RegistrationRequest, deps: RegistrationDeps): ApiResponse {
  // Clamp the caller-supplied correlation id: it lands in every audit record and the error body, and the
  // endpoint is unauthenticated — an unbounded value would let an attacker amplify each append-only audit
  // line (disk-exhaustion). 128 chars is ample for a UUID/trace id.
  const rawCorr = typeof req.correlationId === 'string' && req.correlationId ? req.correlationId.slice(0, 128) : '';
  const correlationId = rawCorr || `corr-${randomBytes(6).toString('hex')}`;

  // 0) The endpoint must be configured to issue credentials at all.
  if (!deps.epTokenSecret) return refuse(deps, 501, 'registration is not configured', { correlationId });

  // 1) The OTC is mandatory — possession of it is the only proof accepted here.
  if (typeof req.otc !== 'string' || !req.otc.startsWith(OTC_PREFIX)) {
    return refuse(deps, 401, 'registration credential required', { correlationId });
  }
  if (typeof req.tenantId !== 'string' || !req.tenantId) {
    return refuse(deps, 400, 'tenantId is required', { correlationId });
  }
  const executionPlaneId = typeof req.executionPlaneId === 'string' && req.executionPlaneId ? req.executionPlaneId : req.tenantId;

  // 2) Contract version must match (Zero Trust: never assume a compatible peer). 426 = upgrade required.
  if (req.contractVersion !== undefined && req.contractVersion !== deps.contractVersion) {
    return refuse(deps, 426, `unsupported contract version "${req.contractVersion}" (this IP accepts ${deps.contractVersion})`, { tenantId: req.tenantId, executionPlaneId, correlationId });
  }

  // 3) Resolve the OTC by its hash. A wrong/forged OTC simply has no record → invalid.
  const hash = sha256hex(req.otc);
  const record = deps.store.getOtc(hash);
  if (!record || !hashEquals(record.hash, hash)) {
    return refuse(deps, 401, 'invalid registration credential', { tenantId: req.tenantId, executionPlaneId, correlationId });
  }

  // 4) Tenant binding — the OTC is scoped to ONE tenant. Presenting tenant A's OTC while claiming to be
  //    tenant B is a cross-tenant attempt → refused (C-07.11). One identity per tenant, no exceptions.
  if (record.tenantId !== req.tenantId) {
    return refuse(deps, 403, 'registration credential is not valid for this tenant', { tenantId: req.tenantId, executionPlaneId, correlationId });
  }

  // 5) Expiry.
  if (Date.parse(record.expiresAt) <= Date.parse(nowIso(deps))) {
    return refuse(deps, 401, 'registration credential has expired', { tenantId: req.tenantId, executionPlaneId, correlationId });
  }

  // 6) The tenant must exist. Registration binds a real, provisioned tenant to its Execution Plane.
  const slug = resolveSlugByTenantId(deps.repo, record.tenantId);
  const env = slug ? deps.repo.load(slug) : undefined;
  if (!slug || !env) {
    return refuse(deps, 404, 'unknown tenant', { tenantId: req.tenantId, executionPlaneId, correlationId });
  }

  // 7) Environment binding — the EP's claimed environment must match the tenant's configured one, so a
  //    test-tenant OTC cannot bootstrap a production EP (or vice-versa).
  if (req.environment !== undefined && req.environment !== env.configuration.customer.environment) {
    return refuse(deps, 403, `environment "${req.environment}" does not match the tenant's environment`, { tenantId: req.tenantId, slug, executionPlaneId, correlationId });
  }

  // 8) Lifecycle state — a CLOSED/OFFBOARDING tenant may not register a new EP.
  const state = env.onboarding.lifecycleState;
  if (state === 'CLOSED' || state === 'OFFBOARDING') {
    return refuse(deps, 409, `tenant is ${state} and cannot register`, { tenantId: req.tenantId, slug, executionPlaneId, correlationId });
  }

  // 9) Consume the OTC ATOMICALLY. If another request consumed it first, this fails single-use here —
  //    the credential is dead the instant it is used, so a repository-committed OTC cannot be replayed.
  const at = nowIso(deps);
  if (!deps.store.consumeOtc(hash, at)) {
    return refuse(deps, 401, 'registration credential has already been used', { tenantId: req.tenantId, slug, executionPlaneId, correlationId });
  }

  // 10) Mint the EP credential — reuse issueEpToken (bump version → prior EP tokens revoked, no denylist).
  //     Least privilege: the token carries only the `execution-plane` role (tenant:read + tenant:update).
  //     The OTC is already consumed (step 9); if the durable record/audit write fails here, ROLL BACK the
  //     consumption so a transient failure does not permanently burn a valid one-time credential — the
  //     legitimate EP can retry. The atomic single-use gate at step 9 still prevents a concurrent double-issue.
  try {
    const version = deps.repo.epTokenVersion(slug) + 1;
    const issued = issueEpToken(slug, version, deps.epTokenSecret, {
      ...(deps.epTokenTtlSeconds ? { ttlSeconds: deps.epTokenTtlSeconds } : {}),
      nowMs: Date.parse(at),
    });
    deps.repo.recordEpToken(slug, { version: issued.version, issuedAt: issued.issuedAt, expiresAt: issued.expiresAt, last4: issued.last4 });

    deps.store.appendAudit({ ts: at, operation: 'credential-issued', result: 'success', tenantId: record.tenantId, slug, executionPlaneId, correlationId });
    deps.store.appendAudit({ ts: at, operation: 'registration-succeeded', result: 'success', tenantId: record.tenantId, slug, executionPlaneId, correlationId });

    const grant: RegistrationGrant = {
      credential: issued.token,
      credentialType: 'dbiz-ep-session-jwt',
      credentialEnv: 'DBIZ_EP_TOKEN',
      tokenVersion: issued.version,
      issuedAt: issued.issuedAt,
      expiresAt: issued.expiresAt,
      tenantId: record.tenantId,
      slug,
      executionPlaneId,
      correlationId,
      configuration: {
        contractVersion: deps.contractVersion,
        updatesPath: `/api/tenants/${slug}/updates`,
        pollingIntervalSeconds: 60,
        entitledCapabilities: [...env.configuration.dbiz.entitledCapabilities],
        // ADR-0081 P-81.4. The set, resolved at issue time so a tenancy registering after a
        // rotation receives the current keys rather than the ones present at boot.
        packageVerificationKeys: [...(deps.packageVerificationKeys?.() ?? [])],
        // ADR-0080 §6 step 4. Constructed from the slug the same way `updatesPath` is, and NOT read
        // from configuration: a path this plane serves is this plane's fact, and making it settable
        // would let a tenancy be pointed at a route the router does not have.
        workPath: workPathFor(slug),
      },
    };
    return ok(grant, 200);
  } catch {
    // Issuance failed after consumption — un-burn the OTC and return a RETRYABLE refusal (503). No partial
    // credential state escapes: recordEpToken is atomic (throws before write), and the grant was never sent.
    try { deps.store.releaseOtc(hash); } catch { /* best-effort rollback */ }
    return refuse(deps, 503, 'registration temporarily failed — retry', { tenantId: record.tenantId, slug, executionPlaneId, correlationId });
  }
}

/**
 * Resolve a tenant's folder slug from its opaque tenantId (the registration identity, R-21.3). FAIL-CLOSED
 * on ambiguity: if two tenants somehow share an opaque id (an invariant importJson now enforces, but which
 * this security-critical resolver must not assume), return undefined so the caller 404s rather than binding
 * a credential to whichever tenant happens to sort first — a would-be cross-tenant issuance (C-07.11).
 */
export function resolveSlugByTenantId(repo: TenantConfigRepository, tenantId: string): string | undefined {
  const hits = repo.list().filter((t) => t.tenantId === tenantId);
  return hits.length === 1 ? hits[0]!.slug : undefined;
}
