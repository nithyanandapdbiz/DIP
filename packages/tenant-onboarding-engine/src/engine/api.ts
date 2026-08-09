/**
 * Tenant REST API — production HTTP surface over the canonical Tenant Manifest.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md · 21-tenant-lifecycle.md
 *   ADR          : ADR-0032 (every endpoint reads/writes the ONE tenant.json) · ADR-0031 · ADR-0030
 *
 * EVERY ENDPOINT OPERATES ON THE SSOT. There is no DTO, no mapper, no second model: handlers
 * call the repository (which owns tenant.json) and the existing pipeline. The router is a PURE
 * function — (method, path, body) → (status, body) — so the failure path is testable without a
 * socket; `createServer` is a thin node:http adapter over it, using only the standard library
 * (no new dependency, R-19 / supply-chain discipline).
 *
 * NestJS NOTE. The CHARTER §5a names NestJS; the platform has no web tier today. This uses the
 * Node standard library to avoid an undeclared framework dependency. Adopting NestJS is a
 * separate, ADR-gated decision — flagged, not pre-empted.
 */
import { createServer as httpCreateServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { normaliseTenantSlug, tenantContext } from '@dbiz/platform-providers';
import { validateOnboarding, type BootstrapServices } from '../domain/index.js';
import { TenantConfigRepository } from './tenant-repository.js';
import { activate } from './experience-orchestrator.js';
import { can, isGlobalPrincipal, mayAccessTenant, permissionForRoute, type Principal } from './authz.js';
import { publishWorkPaths, undistributed, type WorkPathOutcome } from './work-path-distribution.js';
import { authRefusal, AUTH_NOT_CONFIGURED } from './auth-refusal.js';
import { principalOf, type AuthOutcome } from './auth-tokens.js';
import { issueEpToken, parseEpPrincipal } from './ep-token.js';
import { generateTenantSolution } from './solution-export.js';
import { applicationTemplateCatalogue } from './application-catalogue.js';
import { handleRegistration, issueRegistrationOtcDetailed, type RegistrationDeps, type RegistrationRequest, type RegistrationOtcResult } from './registration.js';
import { handlePackageRetrieval, packageHashFromPath } from './package-retrieval.js';
import { handleEvidenceIngress, isEvidenceIngressPath } from './evidence-ingress.js';
import type { MicrosoftAuthDeps } from './microsoft-auth.js';
import type { WelcomeInput } from './tenant-config.js';
import type { ConnectionSelection } from './onboarding-session.js';
import type { DiscoveredMetadata } from './discovery.js';
import type { RecommendationSet } from './recommendations.js';

export interface ApiDeps {
  readonly repo: TenantConfigRepository;
  readonly services: BootstrapServices;
  readonly registrationEndpoint: string;
  /**
   * Resolves the caller from request headers (JWT/session/mTLS). Required by the HTTP server.
   *
   * IT REPORTS THREE OUTCOMES, NOT TWO (`AuthOutcome`). A transport that only asked "who is the
   * caller?" could not tell *nothing was presented* from *what was presented was refused*, and
   * every 401 this API emitted was consequently the same bytes for both. See `auth-refusal.ts`.
   *
   * ABSENT IS NOT `401`. A deployment that does not wire this cannot evaluate credentials at
   * all, so its transports answer `501` — see `AUTH_NOT_CONFIGURED`. It is optional here only
   * because `route()` is pure and takes an already-resolved principal.
   */
  readonly authenticate?: (headers: IncomingHttpHeaders) => AuthOutcome;
  /** Microsoft (Entra) sign-in bridge. When present, the server exposes POST /api/auth/session. */
  readonly microsoftAuth?: MicrosoftAuthDeps;
  /** IP-owned directory where generated EP solution packages are written (staging, never the EP). */
  readonly solutionOutputDir?: string;
  /** Secret used to sign Execution-Plane API tokens. When present, POST /api/tenants/:slug/ep-token works. */
  readonly epTokenSecret?: string;
  /** Optional EP-token TTL (seconds); defaults to 30 days. */
  readonly epTokenTtlSeconds?: number;
  /** EP registration/trust-establishment deps. When present, POST /api/register is served (OTC-authed). */
  readonly registration?: RegistrationDeps;
  /** Signs a package content hash (ADR-0007). When present, POST /api/tenants/:slug/publish-update works. */
  readonly signPackage?: (contentHash: string) => import('./package-signing.js').DetachedSignature;
  /**
   * The sealed package store (ADR-0079). When present, GET /api/packages/{hash} is served.
   *
   * OBTAIN IT FROM `sealedPackageService()`, NEVER FROM THE BARE CONSTRUCTOR. The factory
   * constructs the store and STARTS its purge driver in the same call, so there is no path on
   * which this API serves reads from a store whose retention nothing enforces (R-06.13). The
   * bare `SealedPackageStore` constructor exists for tests, which need a store without a live
   * timer; a store obtained that way has no retention and must not reach production.
   *
   * NOT reached through `route()`: retrieval is async and `route()` is pure and synchronous, so
   * the handler is called directly by each transport — the same shape `/api/register` already
   * uses. Its authorisation is written out in `package-retrieval.ts` because that route inherits
   * none of this router's checks; see P-79.8.
   */
  readonly packageStore?: import('@dbiz/platform-providers').SealedPackageStore;

  /**
   * ADR-0082 P-82.5 — the run record store `/v1/evidence` resolves its `packageHash` binding
   * against.
   *
   * OPTIONAL HERE, REQUIRED THERE, AND THE DIFFERENCE IS NOT A LOOPHOLE. `EvidenceIngressDeps.runs`
   * is non-optional: the handler cannot be called without it. This field is optional because
   * `ApiDeps` configures a WHOLE SERVER, and a server composed without a run record store simply
   * **does not mount the evidence route** — the same fail-closed shape `authenticate` already has in
   * `app.module.ts`, where an evidence surface that cannot authenticate is not mounted rather than
   * mounted and degraded.
   *
   * **An unmounted route answers 404; a mounted route with no binding answers 202 to an unbindable
   * reference.** The first is a deployment that is visibly missing a capability; the second is the
   * defect P-82.5 exists to prevent, and it is invisible.
   */
  readonly runRecords?: import('@dbiz/platform-providers').RunRecordStore;
}

export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  /** The authenticated caller. Absent → 401 on any protected route. */
  readonly principal?: Principal;
  /**
   * Whether the caller PRESENTED a credential. Read only when `principal` is absent, to decide
   * which of the two 401s is owed (`auth-refusal.ts`). The two fields cannot disagree because
   * this one is never consulted while a principal exists.
   *
   * Narrowed from `AuthOutcome` by the transport rather than passed whole, so that the reason a
   * credential was refused is not in scope for this router at all and cannot be emitted by it.
   * Absent ⇒ treated as not presented, which is the weaker statement.
   */
  readonly credentialPresented?: boolean;
}
export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  /** Response headers the transport MUST write — today, the RFC 6750 `WWW-Authenticate` challenge. */
  readonly headers?: Readonly<Record<string, string>>;
}

const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });
const err = (status: number, message: string): ApiResponse => ({ status, body: { error: message } });

/**
 * The pure router. Maps the tenant REST surface onto repository + pipeline operations. Every
 * path resolves the tenant by its slug (the addressable key); the opaque tenantId lives inside.
 */
export function route(req: ApiRequest, deps: ApiDeps): ApiResponse {
  const parts = req.path.replace(/^\/+|\/+$/g, '').split('/'); // ['api','tenants',...]

  // The Application Template catalogue. PLATFORM metadata, not tenant data: it names no customer,
  // holds no credential and is identical for every caller, so it is authenticated (the wizard is
  // behind sign-in like every other route) but not tenant-scoped. Serving it means the onboarding
  // wizard renders from the SAME registry the generator compiles from, instead of a list compiled
  // into the web bundle that would drift the moment a template is registered.
  if (parts[0] === 'api' && parts[1] === 'application-templates' && parts[2] === undefined) {
    if (req.method !== 'GET') return err(405, `${req.method} not allowed on /api/application-templates`);
    if (!req.principal) return authRefusal(req.credentialPresented);
    return ok(applicationTemplateCatalogue());
  }

  // The work-path distribution surface. Top-level and slug-less BECAUSE THE SUBJECT IS THE
  // POPULATION, not a tenancy — see `handleWorkPathDistribution` for why that is the shape and what
  // it costs.
  if (parts[0] === 'api' && parts[1] === 'work-paths' && parts[2] === undefined) {
    return handleWorkPathDistribution(req, deps);
  }

  const auth = authoriseTenantRequest(req, deps);
  if (auth.outcome === 'refused') return auth.response;
  const { slug, action } = auth;

  try {
    return dispatchTenantAction(req, deps, slug, action);
  } catch (e) {
    return translateError(e);
  }
}

/**
 * THE OUTCOME OF THE ONE TENANT AUTHORISATION PATH.
 *
 * A refusal carries the response verbatim rather than a code the caller re-renders — two renderings
 * of one refusal is how a route acquires a subtly different 403.
 */
export type TenantAuthorisation =
  | { readonly outcome: 'refused'; readonly response: ApiResponse }
  | { readonly outcome: 'authorised'; readonly slug: string | undefined; readonly action: string | undefined };

/**
 * ══ THE TENANT ROUTER'S AUTHORISATION, EXTRACTED SO IT CAN BE INHERITED (ADR-0080 P-80.2) ══════
 *
 * **THIS FUNCTION IS A MOVE, NOT A CHANGE.** Every line below was inside `route()` and is here
 * verbatim, in the same order, with the same returns. `route()` calls it first and behaves exactly
 * as it did — proved rather than asserted: a 1750-case matrix over every principal class, method,
 * path shape and credential state produced a byte-identical digest before and after.
 *
 * ── WHY IT WAS EXTRACTED, AND WHY NOT THE TWO OTHER OPTIONS ─────────────────────────────────
 *
 * `GET /api/tenants/{slug}/work` reads the run record store, so it is ASYNC; `route()` is pure and
 * synchronous by design. P-80.2 rules the route's authorisation **INHERITED**: *"a hand-written auth
 * block on this route is a defect, not a variation."*
 *
 *   **Serving it outside `route()`** — the shape `/api/packages/{hash}` and `/v1/evidence` use — is
 *   refused by P-80.2, and the contrast is the reason. **Those two carry NO SLUG**, so they reach
 *   none of these checks and their auth blocks had to be authored from nothing (ADR-0079 P-79.8).
 *   **This route carries a slug and does reach them**, so authoring a second block would be a second
 *   source of truth for tenant authorisation — and the one that silently diverges is the one nobody
 *   is looking at.
 *
 *   **Making `route()` async** is correct in principle and ripples to every call site across three
 *   transports and seven test files. A half-applied signature change there is a broken router.
 *
 * **So the authorisation moved and nothing else did.** One path, two callers: the synchronous router
 * and the asynchronous `/work` handler. A rule added here — a new permission, a new revocation check
 * — reaches both without anyone remembering to copy it, which is the property P-80.2 is protecting.
 */
export function authoriseTenantRequest(req: ApiRequest, deps: ApiDeps): TenantAuthorisation {
  const parts = req.path.replace(/^\/+|\/+$/g, '').split('/');
  const refuse = (response: ApiResponse): TenantAuthorisation => ({ outcome: 'refused', response });

  if (parts[0] !== 'api' || parts[1] !== 'tenants') return refuse(err(404, `no route for ${req.path}`));

  // TENANT SLUG VALIDATION — the FIRST thing that happens to a caller-supplied slug, before authorisation
  // and before any repository call.
  //
  // The slug is a PATH COMPONENT: `FileTenantConfigStore` composes `join(rootDir, slug)`. An unvalidated
  // slug of `..` therefore addresses the STATE ROOT rather than a tenant, which made `GET /api/tenants/..`
  // read outside the tenant tree and `DELETE /api/tenants/..` recursively remove the whole state volume
  // (CWE-22/CWE-73). Validating here — at the one point every transport funnels through — closes it for the
  // NestJS controller, the node:http adapter and any future transport at once.
  //
  // `normaliseTenantSlug` is the platform's EXISTING certified primitive (@dbiz/platform-providers,
  // ADR-0060): it case-folds and enforces /^[a-z0-9][a-z0-9-]{0,62}$/, so traversal, separators and
  // case-collisions are all rejected by one rule. Reused rather than re-implemented — a second slug rule
  // would be exactly the duplicate source of truth ADR-0032 forbids.
  const action = parts[3];
  let slug: string | undefined;
  if (parts[2] !== undefined) {
    try { slug = normaliseTenantSlug(parts[2]); }
    catch { return refuse(err(400, 'invalid tenant slug')); }
  }

  // Authorisation (ADR-0033 R-33.5). Every tenant route is protected; a missing caller is 401,
  // an under-privileged caller is 403 — decided before any repository work.
  const requiredPermission = permissionForRoute(req.method, action);
  if (requiredPermission) {
    if (!req.principal) return refuse(authRefusal(req.credentialPresented));
    if (!can(req.principal, requiredPermission)) return refuse(err(403, `not permitted: ${requiredPermission}`));
    // C-07.11 (tenant isolation, doc 07): a role permission is necessary but NOT sufficient — the
    // caller must also be scoped to THIS tenant. Without this, any authenticated tenant-admin or
    // viewer could read or mutate any other tenant by naming its slug (cross-tenant access).
    if (slug !== undefined && !mayAccessTenant(req.principal, slug)) {
      return refuse(err(403, `not permitted for tenant "${slug}"`));
    }
  }

  // Execution-Plane token rotation: an `ep:<slug>:vN` principal is valid ONLY at the tenant's current
  // version. A regenerated token bumps the version, so any older EP token is refused here (revocation
  // without a denylist). Its embedded slug must also match the tenant it addresses.
  const epp = req.principal ? parseEpPrincipal(req.principal.id) : null;
  if (epp) {
    if (slug !== undefined && epp.slug !== slug) return refuse(err(403, `ep token is not scoped to tenant "${slug}"`));
    if (epp.version !== deps.repo.epTokenVersion(epp.slug)) return refuse(err(401, 'ep token revoked — regenerate it'));
  }

  return { outcome: 'authorised', slug, action };
}

/**
 * ══ `/api/work-paths` — THE OPERATOR ROUTE FOR WORK-PATH DISTRIBUTION (D-147, RULED) ═══════════
 *
 * **`publishWorkPaths` had ZERO non-test callers.** The engine could tell a tenancy where to ask for
 * work and the deployed system had no way to ask it to — found not by review but by the Execution
 * Plane reporting that nothing ever arrived. D-147 rules the remedy: **an operator route, swept ON
 * DEMAND.**
 *
 * ── WHY IT IS SLUG-LESS AND TOP-LEVEL, WHICH COSTS THIS ROUTE ITS INHERITED AUTHORISATION ───────
 *
 * **THE SUBJECT OF A SWEEP IS THE POPULATION, NOT A TENANCY.** `publishWorkPaths` and
 * `undistributed` both take the REPOSITORY and iterate `repo.list()`; neither can be asked about one
 * slug. A `POST /api/tenants/{slug}/work-path` would inherit `authoriseTenantRequest` for free — and
 * it would be a different operation, one that answers *"is this tenancy current?"* and leaves
 * *"is any tenancy stranded?"* exactly as unanswerable as it was. **The stranded tenancy is the
 * whole reason the module exists**, and nobody finds it by naming it.
 *
 * **SO THE AUTHORISATION IS AUTHORED HERE, AND THAT IS A COST TO STATE RATHER THAN A LICENCE.**
 * P-80.2 rules a hand-written auth block a defect *for a route that carries a slug*, because such a
 * route reaches `authoriseTenantRequest` and a second block would be a second source of truth. This
 * route carries no slug and reaches none of it — the same position `/api/packages/{hash}`,
 * `/v1/evidence` and `/api/application-templates` are in (P-79.8). **What is authored is the
 * COMPOSITION, not the policy:** `can` and `isGlobalPrincipal` are `authz.ts`'s own predicates,
 * called rather than restated, so a change to the role model reaches this route too.
 *
 * ── TWO PREDICATES, AND NEITHER IS SUFFICIENT ALONE ─────────────────────────────────────────────
 *
 *   · **`can(tenant:configure)`** — distribution is a configuration act. It is the permission the
 *     tenant surface already requires of every PATCH, so no new permission was invented. **A route
 *     that needed a new permission would be the warning sign** (P-80.2's own test), because a new
 *     permission is a new place authorisation is decided.
 *   · **`isGlobalPrincipal`** — `tenant:configure` is held by `tenant-admin` too, and a tenant-admin
 *     is confined to its scoped slugs by `mayAccessTenant`. **There is no slug here to confine it
 *     with.** Without this second check a tenant-admin would drive a write across every tenancy in
 *     the deployment — C-07.11 defeated not by a missing check but by an inapplicable one.
 *
 * **AN EXECUTION-PLANE TOKEN IS REFUSED BY ROLE, BEFORE REVOCATION IS EVER CONSULTED.** The
 * `execution-plane` role holds `tenant:read` and `tenant:update` only, and is not global, so it
 * fails both predicates. The `ep:<slug>:vN` version check in `authoriseTenantRequest` is therefore
 * NOT reached from here — stated because its absence would otherwise read as an omission. A revoked
 * EP token and a live one are refused identically here, and for a reason that outranks revocation.
 *
 * ── GET ASKS · POST ACTS, AND THE SPLIT IS THE MODULE'S OWN ─────────────────────────────────────
 *
 * `work-path-distribution.ts` deliberately separated `undistributed()` — which writes nothing and
 * can be called by a party with no authority to emit — from `publishWorkPaths()`, which writes,
 * **so that the operational question stays open.** Collapsing them at the route would close in a
 * transport change the question the module was written to keep open. So:
 *
 *   · **`GET`** — who cannot currently discover the exchange. Reads; emits nothing.
 *   · **`POST`** — send every registered tenancy its current path. **Idempotent by comparison**, so
 *     a second POST reports every tenancy `current` and emits no event.
 *
 * ── THE ROUTE IS THE AUDIT RECORD, AND IT LANDS IN TWO PLACES ───────────────────────────────────
 *
 * *Who swept, and when* is the `LoggingInterceptor`'s `http.request` line — method, path, status and
 * the resolved principal, against a correlation id. *What the sweep did* is the durable
 * `work-path-changed` event on each tenancy's own record, which is the same record `undistributed()`
 * reads back. **Neither is a second copy of the other**: one names the actor, one names the effect.
 */
export function handleWorkPathDistribution(req: ApiRequest, deps: ApiDeps): ApiResponse {
  // The (method, path) pairs are stated POSITIVELY and on one line each, for the reason
  // `handleWorkRequest` states: `verify-http-surface-parity` reads verbs statically, and a method
  // expressed only as a negation is a route the gate cannot judge.
  const isRead = req.method === 'GET';
  const isSweep = req.method === 'POST';
  if (!isRead && !isSweep) return err(405, `${req.method} not allowed on /api/work-paths`);

  if (!req.principal) return authRefusal(req.credentialPresented);
  if (!can(req.principal, 'tenant:configure')) return err(403, 'not permitted: tenant:configure');
  if (!isGlobalPrincipal(req.principal)) {
    return err(403, 'work path distribution is platform-scoped; a tenant-scoped principal may not sweep every tenancy');
  }

  if (isRead) {
    const pending = undistributed(deps.repo);
    return ok({ undistributed: pending, count: pending.length });
  }

  const outcomes: readonly WorkPathOutcome[] = publishWorkPaths(deps.repo);
  return ok({
    distribution: outcomes,
    emitted: outcomes.filter((o) => o.result === 'emitted').map((o) => o.slug),
    // Reported rather than omitted: a sweep that emitted nothing because everything was already
    // current, and a sweep that emitted nothing because the repository is empty, are different
    // facts, and an operator reading only `emitted` cannot tell them apart.
    current: outcomes.filter((o) => o.result === 'current').map((o) => o.slug),
  });
}

/** True if this path is `GET /api/tenants/{slug}/work`. Exported so both transports agree on one pattern. */
export function isWorkPath(path: string): boolean {
  const parts = path.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '').split('/');
  return parts[0] === 'api' && parts[1] === 'tenants' && parts[3] === 'work' && parts[4] === undefined;
}

/**
 * ══ `GET /api/tenants/{slug}/work` — THE WORK REQUEST EXCHANGE (ADR-0080 P-80.2) ══════════════
 *
 * **A COLLECTION, NEVER A SINGULAR RESOURCE.** ADR-0080 §3 alternative B — a singular `/work`
 * returning one item — is rejected, and it is the alternative that looks simplest. Absence would
 * have to be a **404**; under **R-05.24** a refused retrieval is a **Refusal**; under document 05's
 * degradation matrix **Refusal → HALT, assurance state `HALTED`**. **An Execution Plane with nothing
 * to do would HALT on every quiet poll.** An empty collection is a **Success under R-05.5**, and it
 * is a positive assertion that nothing is pending (R-05.27).
 *
 * **WORK IS IDENTIFIED BY A RUN, NOT BY A PACKAGE.** The hash is what the run POINTS AT. A hash alone
 * cannot express supersession — two runs may legitimately reference one package — and the store's
 * idempotency is already on `runId`.
 *
 * ══ AUTHORISATION IS INHERITED, NOT AUTHORED (P-80.2) ══════════════════════════════════════════
 *
 * The first thing this does is call `authoriseTenantRequest` — **the same function `route()` calls,
 * not a copy of it.** Slug validation, `permissionForRoute`, `can`, `mayAccessTenant` and the
 * EP-token revocation check all run here because they run there.
 *
 * **AND IT NEEDED NO NEW PERMISSION RULE, WHICH IS THE INHERITANCE WORKING RATHER THAN A GAP.**
 * `permissionForRoute` maps every `GET` to `tenant:read`, which the execution-plane role holds — so
 * this route was authorised correctly the moment it existed. **A route that had required a new rule
 * would have been the warning sign**, because a new rule is a second place tenant authorisation is
 * decided.
 *
 * ══ IT RECORDS NOTHING, AND THAT IS P-82.3 AT THE ROUTE ════════════════════════════════════════
 *
 * > **TWO IDENTICAL POLLS LEAVE THE INTELLIGENCE PLANE BYTE-IDENTICAL.**
 *
 * This handler READS. It has no write path, and the store it reads through has no method a poll
 * could call — the write surface enumerates exactly two events, package-authored and
 * evidence-arrived, and a fetch is neither (P-82.9). **A `/work` that recorded its own polling would
 * be the delivery record P-70.3 removed**, arriving through the one route whose whole purpose is to
 * be polled, and it would look like diagnostics.
 */
export async function handleWorkRequest(req: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
  const auth = authoriseTenantRequest(req, deps);
  if (auth.outcome === 'refused') return auth.response;
  const { slug, action } = auth;

  if (action !== 'work' || slug === undefined) return err(404, `no route for ${req.path}`);
  // THE (METHOD, ACTION) PAIR IS STATED ON ONE LINE, POSITIVELY, and that is not a style choice:
  // `verify-http-surface-parity` HS-7 reads the verb for each action STATICALLY from this shape, so
  // an action whose method is only ever expressed as a negation has no determinable verb and the
  // gate cannot check that the controller maps it under the same one. Written as `req.method !==
  // 'GET'` this route was invisible to HS-6/HS-7 while passing every test.
  if (!(req.method === 'GET' && action === 'work')) {
    return err(405, `${req.method} not allowed on /api/tenants/${slug}/work`);
  }

  // NOT SERVED WITHOUT A RUN RECORD STORE, AND 501 RATHER THAN AN EMPTY COLLECTION. This is the
  // one place an empty answer would be a LIE with consequences: under R-05.27 an empty collection
  // is a positive assertion that nothing is pending, so a composition with no store would tell
  // every Execution Plane it has nothing to do — the fail-open port, with a 200. 501 says the
  // surface is not configured, which is true and which an EP does not read as "idle".
  if (!deps.runRecords) {
    return err(501, 'work requests are not configured on this deployment');
  }

  const env = deps.repo.load(slug);
  if (!env) return err(404, `unknown tenant "${slug}"`);

  try {
    const ctx = tenantContext({ tenantId: env.onboarding.tenantId, tenantSlug: slug });
    const outstanding = await deps.runRecords.outstandingRuns(ctx);
    // PROJECTED FIELD BY FIELD. The run record is an internal shape; this is the wire. A spread
    // here would publish `recordedAtMs` — the store's own retention clock — to the far side, where
    // it means nothing and would be depended on.
    return ok({
      work: outstanding.map((r) => ({
        runId: r.runId,
        packageHash: r.packageHash,
        contractVersion: r.contractVersion,
        authoredAt: r.authoredAt,
      })),
    });
  } catch (e) {
    return translateError(e);
  }
}

/** The tenant router's action dispatch — everything AFTER authorisation, unchanged. */
function dispatchTenantAction(
  req: ApiRequest, deps: ApiDeps, slug: string | undefined, action: string | undefined,
): ApiResponse {
  {
    // Collection: /api/tenants
    if (slug === undefined) {
      if (req.method === 'POST') {
        const env = deps.repo.createFromWelcome(req.body as WelcomeInput);
        return ok(env, 201);
      }
      if (req.method === 'GET') {
        // The collection lists only tenants the caller is scoped to; a platform-admin sees all.
        // Otherwise listing would leak the existence and metadata of every other tenant.
        const p = req.principal;
        const visible = deps.repo.list().filter((e) => p !== undefined && mayAccessTenant(p, e.slug));
        return ok(visible);
      }
      return err(405, `${req.method} not allowed on /api/tenants`);
    }

    // Sub-resource: /api/tenants/{slug}/{action}
    if (action !== undefined) {
      const b = (req.body ?? {}) as Record<string, unknown>;
      if (req.method === 'GET' && action === 'manifest') return ok(deps.repo.load(slug) ?? notFound(slug));
      if (req.method === 'PATCH' && action === 'connect') return ok(deps.repo.enrichIntegrations(slug, b['selections'] as ConnectionSelection[]));
      if (req.method === 'PATCH' && action === 'discovery') return ok(deps.repo.enrichDiscovery(slug, b['discovered'] as DiscoveredMetadata));
      if (req.method === 'PATCH' && action === 'recommendations') {
        return ok(deps.repo.enrichRecommendations(slug, b['recommendations'] as RecommendationSet, (b['overrides'] as { capabilities?: readonly string[]; framework?: string; language?: string }) ?? {}));
      }
      if (req.method === 'PATCH' && action === 'review') {
        const env = deps.repo.load(slug);
        if (!env) return err(404, `unknown tenant "${slug}"`);
        const v = validateOnboarding(env.configuration);
        const issues = v.ok ? [] : v.issues.map((i) => ({ stage: i.stage, code: i.code, detail: i.detail }));
        deps.repo.recordCertification(slug, { ok: v.ok, issues });
        return ok({ certification: { ok: v.ok, issues } });
      }
      if (req.method === 'POST' && action === 'activate') {
        const outcome = activate(deps.repo, slug, deps.services, { registrationEndpoint: deps.registrationEndpoint });
        return ok(outcome, outcome.certification.ok ? 200 : 422);
      }
      // Generate (or regenerate) the tenant-scoped EP API token. Bumps the version → revokes prior tokens.
      // The full token is returned ONCE for the operator to map into the EP; only metadata is persisted.
      if (req.method === 'POST' && action === 'ep-token') {
        if (!deps.epTokenSecret) return err(501, 'EP token issuance is not configured');
        const env = deps.repo.load(slug);
        if (!env) return err(404, `unknown tenant "${slug}"`);
        const version = deps.repo.epTokenVersion(slug) + 1;
        const issued = issueEpToken(slug, version, deps.epTokenSecret, deps.epTokenTtlSeconds ? { ttlSeconds: deps.epTokenTtlSeconds } : {});
        deps.repo.recordEpToken(slug, { version: issued.version, issuedAt: issued.issuedAt, expiresAt: issued.expiresAt, last4: issued.last4 });
        return ok(issued);
      }
      // Mint a FRESH one-time registration credential (OTC) for THIS tenant, bound to its opaque tenantId.
      // Parallel to `ep-token`: the value is returned ONCE for the operator to map into the EP bootstrap;
      // the IP persists only its SHA-256 hash (INV-2 / R-36.3). Single-use and short-lived — a consumed or
      // expired OTC cannot be replayed (R-36.2). Gated on registration being configured, exactly as
      // POST /api/register is; without it there is nowhere to record the hash, so issuance is refused.
      if (req.method === 'POST' && action === 'otc') {
        if (!deps.registration) return err(501, 'registration is not configured');
        const env = deps.repo.load(slug);
        if (!env) return err(404, `unknown tenant "${slug}"`);
        const issued = issueRegistrationOtcDetailed(deps.registration, env.onboarding.tenantId);
        const result: RegistrationOtcResult = {
          otc: issued.otc,
          tenantId: env.onboarding.tenantId,
          registrationEndpoint: deps.registrationEndpoint,
          issuedAt: issued.issuedAt,
          expiresAt: issued.expiresAt,
        };
        return ok(result);
      }
      // Generate the EP solution package from the tenant's canonical config (writes to the IP staging dir).
      if (req.method === 'POST' && action === 'solution') {
        const env = deps.repo.load(slug);
        if (!env) return err(404, `unknown tenant "${slug}"`);
        const manifest = generateTenantSolution(env, {
          registrationEndpoint: deps.registrationEndpoint,
          issueCredential: (id) => deps.services.auth.issueOneTimeCredential(id),
          ...(deps.solutionOutputDir ? { outputDir: deps.solutionOutputDir } : {}),
        });
        return ok(manifest);
      }
      // ── Post-activation lifecycle governance (IP-owned; the EP consumes the state) ──
      // The audit actor is the AUTHENTICATED principal (its id/email), never a caller-supplied body field —
      // a `body.actor` is spoofable and would let one admin attribute an action to another. `reason` is
      // legitimate caller-supplied context. This makes the audit trail attributable (F-21).
      if (req.method === 'POST' && action === 'suspend') return ok(deps.repo.suspend(slug, req.principal?.id, b['reason'] as string | undefined));
      if (req.method === 'POST' && action === 'reactivate') return ok(deps.repo.reactivate(slug, req.principal?.id, b['reason'] as string | undefined));
      if (req.method === 'POST' && action === 'archive') return ok(deps.repo.archive(slug, req.principal?.id, b['reason'] as string | undefined));
      if (req.method === 'PATCH' && action === 'capabilities') return ok(deps.repo.setCapability(slug, b['capability'] as string, b['enabled'] !== false));
      if (req.method === 'PATCH' && action === 'integrations') return ok(deps.repo.setIntegration(slug, b['integration'] as string, b['enabled'] !== false));
      if (req.method === 'PATCH' && action === 'configuration') return ok(deps.repo.updateConfiguration(slug, (b['patch'] as Record<string, unknown>) ?? b));
      if (req.method === 'PATCH' && action === 'branding') return ok(deps.repo.setBranding(slug, (b['branding'] as Record<string, unknown>) ?? b));
      // ── Update events: the EP pulls pending changes and acknowledges applied ones (EP-initiated) ──
      if (req.method === 'GET' && action === 'updates') return ok(deps.repo.listUpdates(slug));
      if (req.method === 'POST' && action === 'updates') return ok(deps.repo.acknowledgeUpdate(slug, b['id'] as string));
      // ── Software Update Management (ADR-0035): the IP publishes; the EP always pulls + verifies (INV-3) ──
      if (req.method === 'POST' && action === 'publish-update') {
        if (!deps.signPackage) return err(501, 'package signing is not configured');
        const env = deps.repo.load(slug);
        if (!env) return err(404, `unknown tenant "${slug}"`);
        const manifest = generateTenantSolution(env, {
          registrationEndpoint: deps.registrationEndpoint,
          issueCredential: (id) => deps.services.auth.issueOneTimeCredential(id),
          ...(deps.solutionOutputDir ? { outputDir: deps.solutionOutputDir } : {}),
        });
        const signature = deps.signPackage(manifest.contentHash);
        return ok(deps.repo.recordSolutionUpdate(slug, manifest, signature, manifest.outputPath ?? `staging/${slug}`, b['mandatory'] === true));
      }
      if (req.method === 'POST' && action === 'sync-config') return ok(deps.repo.syncConfiguration(slug));
      if (req.method === 'POST' && action === 'installed') return ok(deps.repo.recordInstalledVersion(slug, b['version'] as string, b['hash'] as string));
      if (req.method === 'GET' && action === 'update-history') return ok(deps.repo.solutionUpdateHistory(slug));
      if (req.method === 'POST' && action === 'check-compatibility') return ok(deps.repo.checkSolutionCompatibility(slug, (b['ep'] as Record<string, unknown>) ?? {}));
      if (req.method === 'POST' && action === 'rollback') return ok(deps.repo.recordRollback(slug, b['reason'] as string | undefined));
      return err(405, `${req.method} not allowed on /api/tenants/${slug}/${action}`);
    }

    // Item: /api/tenants/{slug}
    if (req.method === 'GET') { const env = deps.repo.load(slug); return env ? ok(env) : err(404, `unknown tenant "${slug}"`); }
    if (req.method === 'DELETE') { deps.repo.delete(slug); return ok({ deleted: slug }, 200); }
    return err(405, `${req.method} not allowed on /api/tenants/${slug}`);
  }
}

/**
 * THE DOMAIN'S TYPED REFUSAL TRANSLATION, EXTRACTED WITH THE DISPATCH IT SERVED.
 *
 * Shared by `route()` and by the `/work` handler, for the same reason the authorisation is: a second
 * translation would let one route disclose what the other withholds.
 */
export function translateError(e: unknown): ApiResponse {
  {
    // TYPED REFUSALS ARE ECHOED; EVERYTHING ELSE IS NOT (CWE-209).
    //
    // The patterns below are the domain's own deliberate refusals — "unknown tenant", "illegal
    // transition", "invalid configuration" — and their text is written to be read by a caller. The
    // previous `return err(400, message)` fallback echoed EVERY other exception verbatim, including
    // internal ones: a corrupt manifest surfaced the raw parser message to the caller, disclosing
    // internal state and giving an attacker a probe. An unrecognised exception is, by definition, one
    // whose message was never reviewed for disclosure — so it is not echoed. The full detail is logged
    // by AllExceptionsFilter against the correlation id, so support loses nothing.
    const message = (e as Error).message;
    if (/already exists|already in use/.test(message)) return err(409, message);
    if (/^unknown tenant|^no tenant|^unknown update|^unknown integration/.test(message)) return err(404, message);
    if (/^illegal transition/.test(message)) return err(409, message);
    if (/no verified execution path|^invalid configuration/.test(message)) return err(422, message);
    if (/^no rollback point|^no published solution/.test(message)) return err(409, message);
    if (/escapes the tenant root|invalid tenant slug/.test(message)) return err(400, 'invalid tenant slug');
    throw e; // unrecognised → the filter logs it in full and returns a generic 500
  }
}

function notFound(slug: string): never { throw new Error(`unknown tenant "${slug}"`); }

/** Thin node:http adapter over the pure router. Reads a JSON body, delegates, writes JSON. */
export function createServer(deps: ApiDeps): Server {
  // Cap the request body. /api/register is unauthenticated by design, so an uncapped body is a pre-auth
  // memory-exhaustion / crash vector (Buffer.concat + toString can also RangeError on an over-length buffer).
  // Tenant/registration JSON payloads are tiny; 256 KiB is generous.
  const MAX_BODY = 256 * 1024;
  const sendJson = (
    res: import('node:http').ServerResponse,
    status: number,
    obj: unknown,
    headers: Readonly<Record<string, string>> = {},
  ): void => {
    if (res.headersSent) return;
    // The handler's headers are merged in, never allowed to displace the content type: a refusal
    // that changed how its own body is parsed would be a different defect from the one it reports.
    res.writeHead(status, { ...headers, 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  /**
   * Resolve the caller, or the refusal owed. Written ONCE for this transport, so the two routes
   * below cannot drift apart on the thing they must agree about — which is how the first version
   * of `PackageController` came to read a principal nothing populated (D-111).
   */
  const resolveCaller = (headers: IncomingHttpHeaders):
  { readonly principal: Principal | null; readonly credentialPresented: boolean } | null => {
    if (!deps.authenticate) return null;                    // → 501, never 401. See auth-refusal.ts.
    const auth = deps.authenticate(headers);
    return { principal: principalOf(auth), credentialPresented: auth.outcome === 'rejected' };
  };
  return httpCreateServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0, aborted = false;
    // Reject an oversized body WITHOUT destroying the socket (a reset would race the response and the
    // client would see ECONNRESET instead of a clean 413). We send 413 + Connection: close and then simply
    // DISCARD any further chunks — memory stays bounded (we stop buffering) and the connection closes
    // cleanly. Bandwidth-level abuse is an infra/reverse-proxy concern, out of scope here.
    const tooLarge = (): void => {
      aborted = true;
      if (!res.headersSent) { res.writeHead(413, { 'content-type': 'application/json', connection: 'close' }); res.end(JSON.stringify({ error: 'payload too large' })); }
    };
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY) tooLarge();
    req.on('data', (c: Buffer) => {
      if (aborted) return;        // discard once we've decided to reject
      size += c.length;
      if (size > MAX_BODY) { tooLarge(); return; }
      chunks.push(c);
    });
    req.on('error', () => { aborted = true; });
    req.on('end', () => {
      if (aborted) return;
      let body: unknown;
      let raw: string;
      try { raw = Buffer.concat(chunks).toString('utf8'); }
      catch { sendJson(res, 400, { error: 'invalid body' }); return; } // RangeError on an over-length buffer
      if (raw.length > 0) {
        try { body = JSON.parse(raw); }
        catch { sendJson(res, 400, { error: 'invalid JSON body' }); return; }
      }
      // Registration is OTC-authenticated, NOT session-authenticated: it is the ONE route that runs
      // before the caller has any DBIZ credential, so it bypasses `authenticate`/`route()` entirely and
      // is served by the dedicated OTC handler. Everything else goes through session auth + RBAC.
      const path = (req.url ?? '/').replace(/[?#].*$/, '');
      if (path.replace(/\/+$/, '') === '/api/register') {
        if ((req.method ?? 'GET') !== 'POST') { sendJson(res, 405, { error: 'POST required' }); return; }
        if (!deps.registration) { sendJson(res, 501, { error: 'registration is not configured' }); return; }
        const b = (body ?? {}) as Record<string, unknown>;
        const headerCorr = Array.isArray(req.headers['x-correlation-id']) ? req.headers['x-correlation-id'][0] : req.headers['x-correlation-id'];
        const headerVer = Array.isArray(req.headers['x-dbiz-contract-version']) ? req.headers['x-dbiz-contract-version'][0] : req.headers['x-dbiz-contract-version'];
        const regReq: RegistrationRequest = {
          ...(typeof b['otc'] === 'string' ? { otc: b['otc'] as string } : {}),
          ...(typeof b['tenantId'] === 'string' ? { tenantId: b['tenantId'] as string } : {}),
          ...(typeof b['executionPlaneId'] === 'string' ? { executionPlaneId: b['executionPlaneId'] as string } : {}),
          ...(typeof b['environment'] === 'string' ? { environment: b['environment'] as string } : {}),
          ...(typeof b['contractVersion'] === 'string' ? { contractVersion: b['contractVersion'] as string } : (headerVer ? { contractVersion: headerVer } : {})),
          ...(typeof b['correlationId'] === 'string' ? { correlationId: b['correlationId'] as string } : (headerCorr ? { correlationId: headerCorr } : {})),
        };
        // Guard the handler like route() guards itself: an internal throw must become a 500, never a hung
        // socket + uncaughtException that takes down the multi-tenant server.
        try {
          const regRes = handleRegistration(regReq, deps.registration);
          sendJson(res, regRes.status, regRes.body);
        } catch {
          sendJson(res, 500, { error: 'registration failed' });
        }
        return;
      }

      // Sealed package retrieval (ADR-0079 P-79.8). Served BEFORE route() and outside it, for the
      // same reason /api/register is: it is not a tenant route and route() cannot await. Its own
      // handler establishes authentication, EP-token revocation, permission and tenant scope
      // explicitly — this router's checks are not on its path and are not reached by it.
      // Evidence ingress (ADR-0082 P-82.2/P-82.5, D-128). Served BEFORE route() and outside it for
      // the same reason retrieval is: it carries no tenant slug, so route()'s checks are not on its
      // path.
      //
      // IT IS NOW ASYNC, AND THE COMMENT THAT SAID OTHERWISE WENT WITH THE REASON FOR IT. This block
      // previously recorded that the handler "is SYNCHRONOUS — it stores nothing yet — so unlike
      // retrieval it needs no promise chain, and adding one would imply durability it does not
      // have." **The premise was correct and is now spent:** P-82.5's binding READS the run record
      // store, so the handler awaits. It still stores nothing, and the promise chain here implies a
      // read rather than a write.
      //
      // NOT MOUNTED WITHOUT A RUN RECORD STORE. Serving this route with no store would accept every
      // unbindable reference with a 202 — P-82.5 defeated by an absent dependency rather than by a
      // decision. 404 is the fail-closed answer: an Execution Plane discovers the surface is not
      // there, instead of being told its unattributable evidence was accepted.
      if (isEvidenceIngressPath(path)) {
        if (!deps.runRecords) { sendJson(res, 404, { error: `no route for ${path}` }); return; }
        const caller = resolveCaller(req.headers);
        if (!caller) { sendJson(res, AUTH_NOT_CONFIGURED.status, AUTH_NOT_CONFIGURED.body); return; }
        void handleEvidenceIngress({
          method: req.method ?? 'POST', path,
          ...(body !== undefined ? { body } : {}),
          ...(caller.principal ? { principal: caller.principal } : {}),
          credentialPresented: caller.credentialPresented,
        }, { repo: deps.repo, runs: deps.runRecords })
          .then((r) => sendJson(res, r.status, r.body, r.headers))
          .catch(() => sendJson(res, 500, { error: 'evidence ingress failed' }));
        return;
      }

      // The work request exchange (ADR-0080 P-80.2). Served before route() because it READS THE RUN
      // RECORD STORE and route() is pure and synchronous — the same reason retrieval is. Unlike
      // retrieval it inherits the tenant router's authorisation rather than authoring its own: the
      // handler's first act is to call `authoriseTenantRequest`, the very function route() calls.
      if (isWorkPath(path)) {
        const caller = resolveCaller(req.headers);
        if (!caller) { sendJson(res, AUTH_NOT_CONFIGURED.status, AUTH_NOT_CONFIGURED.body); return; }
        void handleWorkRequest({
          method: req.method ?? 'GET', path,
          ...(caller.principal ? { principal: caller.principal } : {}),
          credentialPresented: caller.credentialPresented,
        }, deps)
          .then((r) => sendJson(res, r.status, r.body, r.headers))
          .catch(() => sendJson(res, 500, { error: 'work request failed' }));
        return;
      }

      if (packageHashFromPath(path) !== undefined) {
        const caller = resolveCaller(req.headers);
        if (!caller) { sendJson(res, AUTH_NOT_CONFIGURED.status, AUTH_NOT_CONFIGURED.body); return; }
        handlePackageRetrieval({
          method: req.method ?? 'GET', path,
          ...(caller.principal ? { principal: caller.principal } : {}),
          credentialPresented: caller.credentialPresented,
        }, { repo: deps.repo, ...(deps.packageStore ? { store: deps.packageStore } : {}) })
          .then((r) => sendJson(res, r.status, r.body, r.headers))
          // A rejected retrieval must become a 500, never a hung socket. It must NOT become the
          // package refusal: an internal fault is not a statement about whether a package exists.
          .catch(() => sendJson(res, 500, { error: 'internal error' }));
        return;
      }

      try {
        const caller = resolveCaller(req.headers);
        if (!caller) { sendJson(res, AUTH_NOT_CONFIGURED.status, AUTH_NOT_CONFIGURED.body); return; }
        const response = route({
          method: req.method ?? 'GET', path: req.url ?? '/',
          ...(body !== undefined ? { body } : {}),
          ...(caller.principal ? { principal: caller.principal } : {}),
          credentialPresented: caller.credentialPresented,
        }, deps);
        sendJson(res, response.status, response.body, response.headers);
      } catch {
        sendJson(res, 500, { error: 'internal error' });
      }
    });
  });
}
