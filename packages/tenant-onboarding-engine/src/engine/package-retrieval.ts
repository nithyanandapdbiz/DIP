/**
 * GET /api/packages/{hash} — sealed package retrieval (ADR-0070 §6 step 2, ADR-0079 P-79.8).
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 07-tenant-isolation.md (C-07.11) ·
 *                  08-security-model.md · 20-cross-plane-contracts.md
 *   ADR          : ADR-0079 (the store, and P-79.8 which rules this auth block) ·
 *                  ADR-0070 (P-70.1 "exists and is retrievable", P-70.3 no delivery state,
 *                  P-70.4 one refusal signal) · ADR-0078 (P-78.2 the refusal's wording) ·
 *                  ADR-0032 (the registry ownership resolves through) · ADR-0005 (canonical hashing)
 *   Criteria     : C-07.11 · C-06.11 · C-01.11 · C-22.1
 *
 * ══ THIS ROUTE HAS NO SLUG, SO IT INHERITS NOTHING ══════════════════════════════════════════
 *
 * `GET /api/packages/{hash}` carries no tenant slug BY DESIGN (P-70.4 clause 2). Measured
 * consequence: it never reaches `api.ts`'s tenant branch, so it inherits NONE of
 *
 *   - `normaliseTenantSlug` validation (api.ts:99-104)
 *   - `permissionForRoute` (api.ts:108)
 *   - `can()` (api.ts:111)
 *   - `mayAccessTenant()` (api.ts:115)
 *   - THE EP-TOKEN REVOCATION CHECK (api.ts:126)
 *
 * Nothing is inherited, so nothing is inherited BY ACCIDENT either — and that cuts both ways.
 * The revocation check is the one a new route silently omits: a route that forgets it accepts
 * every EP token ever issued, including the ones rotation was supposed to kill, and no test
 * that does not specifically rotate a token would notice. It is written out below, deliberately,
 * as its own numbered step.
 *
 * NOTHING IS COPIED FROM `/api/application-templates`. That route's authorisation is
 * "authenticated, not tenant-scoped" — correct there, because the template catalogue names no
 * customer, holds no credential and is identical for every caller. Here it would be
 * catastrophically wrong: it would serve any tenant's authored tests to any signed-in caller.
 *
 * ══ THIS AUTH BLOCK IS THE ONLY PROTECTION THAT EXISTS ══════════════════════════════════════
 *
 * Measured from BOTH planes, and the conclusion is not a matter of taste:
 *
 *   - the Execution-Plane client deliberately does NOT compare `provenance.tenantId` to its own
 *     tenant. Under P-70.4 unknown and unowned are ONE signal, so the EP cannot tell "not yours"
 *     from "no such package" and SHALL NOT pretend to. ADR-0078's taxonomy has no result class
 *     for *served, verified, and someone else's*, and inventing a fifth is the defect ADR-0078
 *     exists to prevent;
 *   - package verification proves INTEGRITY, not OWNERSHIP. A package correctly sealed for
 *     tenant B satisfies content-hash match and signature validity perfectly in tenant A's hands;
 *   - so a wrong-tenant package is not caught on retrieval by anything downstream of this route.
 *
 * THE FAILURE ASYMMETRY, which is why this is written at length rather than noted:
 *
 *   slug used where tenantId belongs  ->  403. Loud, at the boundary, immediately.
 *   tenantId used where slug belongs  ->  a package that VERIFIES and belongs to someone else.
 *                                         Silent, with nothing in either plane positioned to notice.
 *
 * The second failure produces a well-formed, correctly-sealed, hash-matching artefact that the
 * Execution Plane is contractually obliged to trust and execute. This block is the last line,
 * and it is authored as the last line.
 *
 * ══ WHY IT IS SERVED OUTSIDE `route()` ══════════════════════════════════════════════════════
 *
 * `route()` is a PURE SYNCHRONOUS function by design. Retrieval reads through the Storage
 * Provider and is therefore async. Rather than make the whole tenant router async — which would
 * change the failure semantics of every existing route to serve one new one — this follows the
 * precedent already set by `/api/register`: a dedicated handler, called directly by both
 * transports, testable without a socket.
 */
import { tenantContext, type SealedPackageStore, type TenantOwnershipResolver } from '@dbiz/platform-providers';
import { sealedPackageRefusal } from '@dbiz/platform-providers';
import { can, mayAccessTenant, isGlobalPrincipal, type Principal } from './authz.js';
import { authRefusal } from './auth-refusal.js';
import type { AuthOutcome } from './auth-tokens.js';
import { parseEpPrincipal } from './ep-token.js';
import { resolveSlugByTenantId } from './registration.js';
import type { TenantConfigRepository } from './tenant-repository.js';

export interface PackageRetrievalDeps {
  readonly repo: TenantConfigRepository;
  /** The sealed package store (ADR-0079). Absent → the route reports 501, never 404. */
  readonly store?: SealedPackageStore;
  /**
   * Resolves the caller from request headers, exactly as `ApiDeps.authenticate` does.
   *
   * CARRIED HERE BECAUSE EACH TRANSPORT RESOLVES ITS OWN PRINCIPAL, AND ONE OF THEM DID NOT.
   * The handler below is pure — it takes an already-resolved principal — so every transport must
   * do the resolving. NestJS does not populate `req.principal`; nothing does. The first version of
   * `PackageController` read that field, so it was `undefined` on every request and the route
   * answered 401 to its rightful owner through the assembled application while passing every
   * in-process test. Caught only by driving a real socket (D-111), which is the whole argument of
   * `http-surface.security.test.ts`.
   */
  readonly authenticate?: (headers: import('node:http').IncomingHttpHeaders) => AuthOutcome;
}

export interface PackageRetrievalRequest {
  readonly method: string;
  readonly path: string;
  /** The authenticated caller. Absent → 401. */
  readonly principal?: Principal;
  /**
   * Whether the caller PRESENTED a credential. Read only when `principal` is absent, to decide
   * which 401 is owed — see `auth-refusal.ts`. It changes NOTHING about what this route serves or
   * refuses: the two 401s differ only in naming which of the two the caller is in, and every
   * outcome below step 1 is reached identically either way.
   */
  readonly credentialPresented?: boolean;
}

export interface PackageRetrievalResponse {
  readonly status: number;
  readonly body: unknown;
  /** Response headers the transport MUST write — the RFC 6750 challenge on a 401, else absent. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Adapt the tenant registry to the store's ownership port.
 *
 * THE ONE CANONICAL RESOLVER, REUSED RATHER THAN RE-IMPLEMENTED. `resolveSlugByTenantId` is
 * fail-closed — `hits.length === 1`, else `undefined`. A second slug-from-tenantId rule would be
 * exactly the duplicate source of truth ADR-0032 forbids. The WRONG second rule WAS in the tree —
 * `knownTenant` in `ip-execute-gateway.mjs`, returning the first `readdirSync` match — and it went
 * with that gateway on 2026-08-06 (ADR-0049 M5). It is recorded in the past tense because it is
 * why this resolver is fail-closed, not because it is still there to be avoided.
 */
export function tenantOwnershipResolver(repo: TenantConfigRepository): TenantOwnershipResolver {
  return { resolveSlugByTenantId: (tenantId: string) => resolveSlugByTenantId(repo, tenantId) };
}

/** The path this handler serves. Exported so both transports agree on one pattern. */
export const PACKAGE_RETRIEVAL_PATH = /^\/+api\/+packages\/+([^/]+)\/*$/;

/** Extract the hash from a request path, or `undefined` if this is not a retrieval path. */
export function packageHashFromPath(path: string): string | undefined {
  const m = PACKAGE_RETRIEVAL_PATH.exec(path.replace(/[?#].*$/, ''));
  return m?.[1];
}

const refuse = (hash: string): PackageRetrievalResponse => ({
  // ONE refusal expression, naming the hash it declined and nothing else (P-79.6, P-78.2).
  // 404 for every refused state: unknown, another tenant's, expired, and owner-offboarded.
  status: 404,
  body: { error: sealedPackageRefusal(hash) },
});

/**
 * Serve a sealed package to the tenant that owns it, and refuse everything else
 * indistinguishably.
 */
export async function handlePackageRetrieval(
  req: PackageRetrievalRequest,
  deps: PackageRetrievalDeps,
): Promise<PackageRetrievalResponse> {
  const hash = packageHashFromPath(req.path);
  if (hash === undefined) return { status: 404, body: { error: `no route for ${req.path}` } };

  if (req.method !== 'GET') {
    // Retrieval is idempotent and read-only (P-79.7, R-05.21). There is no write verb here.
    return { status: 405, body: { error: `${req.method} not allowed on /api/packages/{hash}` } };
  }

  // ── STEP 1. AN AUTHENTICATED PRINCIPAL ────────────────────────────────────────────────────
  //
  // Written first and unconditionally. There is no anonymous read of this surface: unlike
  // /api/register, whose OTC is its proof, a package request carries no credential of its own.
  //
  // THE TWO 401s ARE NOT AN ORACLE ON THIS ROUTE, AND THE REASON IS WORTH STATING WHERE P-79.6
  // IS ENFORCED. `authRefusal` reads ONE input — did this caller present a credential — which is
  // a fact about the REQUEST and not about any package. It is returned identically for every
  // hash, including hashes that do not exist, so it cannot be differenced against anything.
  // The single refusal P-79.6 requires is the 404 below, and it is untouched: nothing here
  // splits it, and no caller reaching step 1 has been told whether any package exists.
  const principal = req.principal;
  if (!principal) return authRefusal(req.credentialPresented);

  // ── STEP 2. THE EP-TOKEN REVOCATION CHECK ─────────────────────────────────────────────────
  //
  // The equivalent of api.ts:126, WRITTEN OUT because this route does not reach it. Rotation is
  // implemented without a denylist: the version is embedded in the principal id (`ep:<slug>:vN`)
  // and regenerating bumps the tenant's stored version, so a superseded token is refused HERE or
  // it is not refused at all.
  //
  // `epTokenVersion` returns 0 for a tenant that no longer exists, so an offboarded tenant's EP
  // token is refused by this step as revoked. That is a fact about the CALLER'S OWN CREDENTIAL,
  // returned identically for every hash, so it is not an oracle about any package.
  //
  // Note there is no analogue of api.ts:125 (`epp.slug !== slug`): there IS no path slug here to
  // disagree with. The token's own slug is the partition — which is precisely why step 2 must
  // run before step 3 rather than after.
  const epp = parseEpPrincipal(principal.id);
  if (epp) {
    if (epp.version !== deps.repo.epTokenVersion(epp.slug)) {
      return { status: 401, body: { error: 'ep token revoked — regenerate it' } };
    }
  }

  // ── STEP 3. THE PRINCIPAL'S TENANT SCOPE ──────────────────────────────────────────────────
  //
  // `permissionForRoute` is NOT consulted: it maps the tenant router's actions and this route is
  // not one of them. The permission is stated directly instead. Retrieval is a read.
  if (!can(principal, 'tenant:read')) {
    return { status: 403, body: { error: 'not permitted: tenant:read' } };
  }

  // ── STEP 4. AND ONLY THEN, THE PARTITION ──────────────────────────────────────────────────
  //
  // THE PARTITION IS RESOLVED FROM THE AUTHENTICATED PRINCIPAL AND FROM NOTHING ELSE (P-79.2).
  // The caller supplied a hash; the caller cannot express, influence or hint at a partition.
  //
  // A GLOBAL PRINCIPAL RESOLVES TO NO PARTITION, AND THAT IS A REFUSAL RATHER THAN A LICENCE.
  // `mayAccessTenant` returns true for a platform-admin against EVERY slug — which is correct on
  // a route that names its tenant and useless on one that does not. There is no slug here for
  // "may access" to range over, so a platform-admin has no single partition to read from and the
  // fail-closed answer is to refuse. Picking one, or searching all of them, would make this route
  // the cross-tenant read the rest of the file exists to prevent.
  //
  // Returned identically for every hash, so it tells a caller nothing about any package.
  const scoped = principal.tenants ?? [];
  if (isGlobalPrincipal(principal) || scoped.length !== 1) {
    return {
      status: 403,
      body: { error: 'package retrieval requires a principal scoped to exactly one tenant' },
    };
  }
  const partition = epp ? epp.slug : scoped[0]!;

  // Belt and braces. For an EP principal `tenants` is `[slug]`, so this holds by construction —
  // but if scope resolution above is ever changed, the certified primitive still guards the
  // partition rather than the change silently widening it (C-07.11).
  if (!mayAccessTenant(principal, partition) || (epp && !scoped.includes(epp.slug))) {
    return { status: 403, body: { error: `not permitted for tenant "${partition}"` } };
  }

  if (!deps.store) {
    // Declared-but-unconfigured is 501, never 404. A 404 here would be indistinguishable from a
    // genuine refusal and would make an operational misconfiguration look like a missing package.
    return { status: 501, body: { error: 'package retrieval is not configured' } };
  }

  // From here on EVERY failure is the single refusal (P-79.6).
  const env = deps.repo.load(partition);
  if (!env) return refuse(hash);

  const ctx = tenantContext({ tenantId: env.onboarding.tenantId, tenantSlug: partition });

  const result = await deps.store.get(ctx, hash);
  if (result.outcome === 'refused') return refuse(hash);

  // The sealed body is returned parsed. Content addressing is CANONICAL — `sha256-jcs-v1`
  // (ADR-0005) hashes a JCS canonicalisation of the object, not the transport bytes — so
  // re-serialising over HTTP does not disturb the Execution Plane's verification.
  //
  // NOTHING IS RECORDED BY THIS READ (P-79.7, R-12.5, R-20.31). No fetch count, no
  // last-accessed timestamp, no acknowledgement, no state transition. A read-access audit line
  // would be exactly the delivery state P-70.3 removed, re-entered through the audit trail.
  // ── THE ENVELOPE (ADR-0081 P-81.2) ────────────────────────────────────────────────────────
  //
  // THE SIGNATURE TRAVELS BESIDE THE PACKAGE, NOT INSIDE IT. Embedding it would be a MAJOR
  // contract version (ADR-0007 §7's forward obligation) and would break the content addressing
  // this route's key IS: `hashableContent` excludes only `provenance.contentHash`, so a top-level
  // `signature` would be hashed and the package would no longer address to its own hash.
  //
  // AND IT IS NOT A HEADER, for the artefact's own reason: doc 20 §2.2 makes a sealed package
  // cacheable, replayable and executable while its author is offline. **A signature that lives
  // only in an HTTP response does not survive being written to disk**, so a cached package would
  // become unverifiable exactly when R-20.29 requires verification — before execution, which under
  // caching may be long after retrieval.
  //
  // THE HASH IS RECOMPUTED OVER THE `package` MEMBER, NEVER OVER THE ENVELOPE (R-20.28). A
  // consumer that hashes the envelope gets a mismatch and reports `hash-mismatch` under R-20.30 —
  // a correct-looking failure with a wrong cause — which is why the member is named rather than
  // positional.
  try {
    return {
      status: 200,
      body: { package: JSON.parse(result.body), signature: JSON.parse(result.signature) },
    };
  } catch {
    return refuse(hash);
  }
}
