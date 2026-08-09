/**
 * POST /v1/evidence — the Execution Plane returns evidence REFERENCES to the Intelligence Plane.
 *
 * TRACEABILITY
 *   Architecture : 05-cross-plane-communication.md (EP-initiated, outbound-only — INV-3) ·
 *                  06-data-sovereignty.md (INV-2) · 07-tenant-isolation.md (C-07.11) ·
 *                  10-evidence-flow-model.md · 20-cross-plane-contracts.md (R-20.12, R-20.14)
 *   ADR          : ADR-0082 (P-82.2 the record, P-82.5 the packageHash binding) ·
 *                  ADR-0079 P-79.8 (the auth block's SHAPE, written out rather than copied) ·
 *                  ADR-0036 (the credential this route authenticates) · ADR-0049 M5 (the gateway
 *                  this route moves off)
 *   Debt         : D-128 (this move) · D-115 (the record this feeds) · D-124 (why the handle is
 *                  not required here)
 *
 * ══ WHY THIS ROUTE MOVED, AND WHAT MOVING IT BUYS ══════════════════════════════════════════════
 *
 * It existed ONLY on `ip-execute-gateway.mjs` — which binds 127.0.0.1, exits on a production
 * environment, and whose `/v1/*` paths never reach the deployed application at all (D-121 §5).
 * So R-20.12's binding was enforced on a development path only, and ADR-0082's evidence half would
 * have been a store that is authorised, built, gated, and fed by nothing.
 *
 * THE MOVE RETIRES A DUPLICATE RATHER THAN CARRYING ONE. The gateway checks the reference's shape
 * with hand-written predicates because that file imports no `@dbiz` package (D-121). This tier
 * imports `@dbiz/contracts`, so it parses through `EvidenceReferenceSchema` — the artefact's single
 * source of truth — and uses the contract's own `carriesEvidencePayload`. Three copies of the
 * payload rule become one.
 *
 * ══ IT NOW RESOLVES `packageHash` TO A KNOWN RUN — ADR-0082 §6 STEP 1 (P-82.5), LANDED ═════════
 *
 * **This block previously recorded the opposite**, and said why: *"it cannot yet enforce that it
 * names a package THIS PLANE AUTHORED, because no run record exists to resolve against — that is
 * ADR-0082 §6 step 2."* **Step 2 landed, so the stated precondition is met and the deferral expired
 * with it.** The paragraph is replaced rather than amended, because leaving *"this route accepts any
 * reference whose `packageHash` parses"* beside code that refuses one is CHARTER §17.1.3's expired
 * justification in its most misleading form: a disclaimer that understates what the code does.
 *
 * R-20.12's binding is now enforced IN FULL at this route: the reference's `packageHash` must name a
 * run **this plane authored for THIS caller's tenant**, resolved through
 * `RunRecordStore.runForPackageHash`, and **an unbindable reference is REFUSED AND NOT PROCESSED**.
 *
 * > **WHY REFUSE RATHER THAN ACCEPT-AND-RECONCILE.** An accepted-but-unbound reference is
 * > unattributable, and pending work is derived as *"runs without evidence"* (R-05.28) — **a join on
 * > this field.** An unbound record joins to nothing, so **no run ever leaves the collection** and
 * > `GET /api/tenants/{slug}/work` returns the same work forever: a permanently non-empty falsehood,
 * > served as a `200`, reddening no gate. A later reconciliation pass cannot repair it either — it
 * > would have to decide what to do with references already accepted, which is a **second source of
 * > truth about what is outstanding.** The refusal is the only resolution that leaves one.
 *
 * ══ THE REFUSAL IS ONE EXPRESSION, AND THAT IS P-70.4 REACHING THIS ROUTE ══════════════════════
 *
 * `runForPackageHash` reads the caller's OWN partition, so a hash naming **another tenant's** package
 * is not found — exactly as a hash naming nothing is not found. **The two are refused by the same
 * expression, and neither the status nor the message distinguishes them.**
 *
 * **This is a NEW oracle surface on a route that previously had none**, and the header below still
 * says *"there is no oracle to protect here"* about the OTHER refusals, which remains true of them.
 * It is not true of this one: a refusal that separated *"no such package"* from *"not yours"* would
 * answer *"does this hash exist somewhere in the platform?"* to anything holding one valid EP
 * credential — a probe across tenants, from a route whose whole purpose is to accept submissions.
 * **Enforcement is by ADDRESSING, in the store; this route cannot weaken it by phrasing.**
 *
 * ══ AND IT NOW RECORDS — §6 STEP 3 (P-82.2). THIS ROUTE IS WHAT SUBTRACTS ══════════════════════
 *
 * **The line above this one said "IT STORES NOTHING" through two versions of this file**, and it was
 * true in both: first because no store was authorised, then because the store existed and this route
 * only refused. **It is false now**, and it is replaced rather than softened for the same reason the
 * binding paragraph was — a stale disclaimer about durability is read by someone deciding whether
 * evidence survives a restart.
 *
 * `onEvidenceArrived` is the SECOND and LAST write event (P-82.9), and **an arrival here is the only
 * thing that removes a run from `GET /api/tenants/{slug}/work`.** Nothing else subtracts: a FETCH
 * does not, because there is no method a fetch could call (P-82.3).
 *
 * A REPEATED ARRIVAL IS IDEMPOTENT AND SAYS SO. `alreadyRecorded` distinguishes a retry from a first
 * submission — a fact about the caller's own act, so it is not the oracle the binding refusal above
 * has to avoid being.
 *
 * ══ THE AUTH BLOCK IS WRITTEN OUT, NOT INHERITED AND NOT COPIED ════════════════════════════════
 *
 * This path carries NO tenant slug, so — exactly like `/api/packages/{hash}` — it reaches none of
 * the tenant router's checks: not `normaliseTenantSlug`, not `permissionForRoute`, not `can()`, not
 * `mayAccessTenant()`, and NOT THE EP-TOKEN REVOCATION CHECK. Nothing is inherited, so nothing is
 * inherited by accident either.
 *
 * The revocation check is the one a new route silently omits, and its absence is invisible: a route
 * that forgets it accepts every EP token ever issued, including the ones rotation was supposed to
 * kill, and no test that does not specifically rotate a token would notice. It is written below as
 * its own numbered step, for the same reason ADR-0079 P-79.8 required it on the retrieval route.
 *
 * THE TENANT IS TAKEN FROM THE CREDENTIAL, NEVER FROM THE BODY. `reference.tenantId` is a
 * caller-supplied value; using it to decide anything would be the F-04 class exactly. It is
 * compared against the authenticated principal's tenant and a mismatch is refused.
 */
import { parseEvidenceReference, carriesEvidencePayload } from '@dbiz/contracts';
import { tenantContext, type RunRecordStore } from '@dbiz/platform-providers';
import { can, mayAccessTenant, isGlobalPrincipal, type Principal } from './authz.js';
import { authRefusal } from './auth-refusal.js';
import type { AuthOutcome } from './auth-tokens.js';
import { parseEpPrincipal } from './ep-token.js';
import type { TenantConfigRepository } from './tenant-repository.js';

/**
 * THE ONE EXPRESSION AN UNBINDABLE REFERENCE IS REFUSED BY (P-82.5, P-70.4).
 *
 * Modelled on `sealedPackageRefusal` and for the same reason: **the refusal must not tell a caller
 * WHICH of the unbindable cases it hit.** Two reach here — the hash names no run at all, and the
 * hash names a run in ANOTHER tenant's partition — and they are one message because separating them
 * would make this route answer *"does this package exist somewhere?"* across tenants.
 *
 * The hash is echoed because the caller supplied it; echoing it back reveals nothing it did not
 * bring. What is withheld is the only thing it does not already know: **whether the hash exists
 * anywhere else.**
 */
export function unbindableEvidenceRefusal(packageHash: string): string {
  return `evidence reference names no run authored for this tenant: packageHash "${packageHash}"`;
}

export interface EvidenceIngressDeps {
  readonly repo: TenantConfigRepository;
  /**
   * ADR-0082 P-82.5 — THE RUN RECORD STORE THE BINDING RESOLVES AGAINST. **REQUIRED, and not
   * optional the way the writer's is.**
   *
   * The writer's `runs` is optional so its own suite can exercise publication in isolation, and its
   * absence there costs a record that is not written. **Here, absence would mean the binding is not
   * enforced** — and a route that accepts unbindable references is the exact defect P-82.5 exists to
   * prevent, arriving through a composition that simply did not pass a dependency. **A binding that
   * can be switched off by omission is not enforced at ingress; it is enforced where someone
   * remembered.** So every composition supplies it, and a composition that cannot is a composition
   * that must not serve this route.
   */
  readonly runs: RunRecordStore;
  /** Resolves the caller from request headers. Each transport resolves its own principal (D-111). */
  readonly authenticate?: (headers: import('node:http').IncomingHttpHeaders) => AuthOutcome;
}

export interface EvidenceIngressRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly principal?: Principal;
  readonly credentialPresented?: boolean;
}

export interface EvidenceIngressResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/** The path this handler serves. Exported so both transports agree on one pattern. */
export const EVIDENCE_INGRESS_PATH = /^\/+v1\/+evidence\/*$/;

/** True if this request path is the evidence ingress. */
export function isEvidenceIngressPath(path: string): boolean {
  return EVIDENCE_INGRESS_PATH.test(path.replace(/[?#].*$/, ''));
}

/**
 * Receive returned evidence references from an Execution Plane.
 *
 * REFUSALS ARE EXPLICIT AND NAME THEIR REASON — WITH ONE EXCEPTION, AND THE EXCEPTION IS NEW.
 *
 * For every refusal about the SUBMISSION, telling the caller why reveals nothing it did not bring
 * with it: it already knows what it submitted, and a silent refusal would leave an Execution Plane
 * unable to correct a malformed return. **That reasoning holds only while the refusal is about the
 * caller's own input.**
 *
 * **The binding refusal (STEP 7) is not.** It is about what the PLANE holds, so it is the one answer
 * here a caller could not have derived, and it is deliberately uninformative beyond the fact of
 * refusal — see `unbindableEvidenceRefusal`. **The header's older claim that this route has "no
 * oracle to protect" was true when every refusal concerned the submission, and step 1 of ADR-0082 §6
 * made it stop being true.**
 */
export async function handleEvidenceIngress(
  req: EvidenceIngressRequest,
  deps: EvidenceIngressDeps,
): Promise<EvidenceIngressResponse> {
  if (!isEvidenceIngressPath(req.path)) {
    return { status: 404, body: { error: `no route for ${req.path}` } };
  }
  if (req.method !== 'POST') {
    return { status: 405, body: { error: `${req.method} not allowed on /v1/evidence` } };
  }

  // ── STEP 1. AN AUTHENTICATED PRINCIPAL ────────────────────────────────────────────────────
  const principal = req.principal;
  if (!principal) return authRefusal(req.credentialPresented);

  // ── STEP 2. THE EP-TOKEN REVOCATION CHECK ─────────────────────────────────────────────────
  //
  // Written out because this route does not reach `api.ts`'s. Rotation is implemented without a
  // denylist — the version is embedded in the principal id (`ep:<slug>:vN`) and regenerating bumps
  // the tenant's stored version — so a superseded token is refused HERE or it is not refused at all.
  //
  // `epTokenVersion` returns 0 for a tenant that no longer exists, so an offboarded tenant's EP
  // token is refused by this step as revoked.
  const epp = parseEpPrincipal(principal.id);
  if (epp && epp.version !== deps.repo.epTokenVersion(epp.slug)) {
    return { status: 401, body: { error: 'ep token revoked — regenerate it' } };
  }

  // ── STEP 3. THE PERMISSION ────────────────────────────────────────────────────────────────
  //
  // Returning evidence is a WRITE against the tenant's record, so it is `tenant:update` rather than
  // `tenant:read`. `permissionForRoute` is not consulted: it maps the tenant router's actions and
  // this route is not one of them, so the permission is stated directly.
  if (!can(principal, 'tenant:update')) {
    return { status: 403, body: { error: 'not permitted: tenant:update' } };
  }

  // ── STEP 4. THE PRINCIPAL'S TENANT, AND IT COMES FROM THE CREDENTIAL ───────────────────────
  //
  // A GLOBAL PRINCIPAL RESOLVES TO NO TENANT, AND THAT IS A REFUSAL RATHER THAN A LICENCE.
  // `mayAccessTenant` returns true for a platform-admin against every slug — correct on a route
  // that names its tenant, useless on one that does not. There is no slug here for "may access" to
  // range over, so the fail-closed answer is to refuse.
  const scoped = principal.tenants ?? [];
  if (isGlobalPrincipal(principal) || scoped.length !== 1) {
    return { status: 403, body: { error: 'evidence submission requires a principal scoped to exactly one tenant' } };
  }
  const slug = epp ? epp.slug : scoped[0]!;
  if (!mayAccessTenant(principal, slug) || (epp && !scoped.includes(epp.slug))) {
    return { status: 403, body: { error: `not permitted for tenant "${slug}"` } };
  }

  const env = deps.repo.load(slug);
  if (!env) return { status: 403, body: { error: `not permitted for tenant "${slug}"` } };

  // ── STEP 5. THE REFERENCE, PARSED THROUGH THE CONTRACT ────────────────────────────────────
  const body = (req.body ?? {}) as { reference?: unknown };
  const reference = body.reference;
  if (!reference || typeof reference !== 'object') {
    return { status: 400, body: { error: 'evidence reference is required' } };
  }

  // PAYLOAD FIRST, BEFORE THE PARSE, AND THE ORDER IS LOAD-BEARING. `EvidenceReferenceSchema` is
  // `.passthrough()` (R-20.4, C-20.7) so a reference carrying `content` PARSES SUCCESSFULLY. A
  // parse that succeeds is not evidence that no payload crossed. Checking after the parse would
  // still refuse — but it would report a schema-valid artefact as valid to any reader of the parse
  // result, and this is the boundary where a payload must not be normalised into acceptance.
  if (carriesEvidencePayload(reference)) {
    return {
      status: 422,
      body: { error: 'evidence reference carried an artefact payload — references and hashes only (INV-1, R-20.14)' },
    };
  }

  let parsed;
  try {
    parsed = parseEvidenceReference(reference);
  } catch (e) {
    // R-20.12's binding is inside this parse: `packageHash` is a REQUIRED field of the schema, so an
    // unbound reference cannot reach the branch below. Unattributable evidence is refused, never
    // recorded — because pending work is derived from "runs without evidence" (R-05.28), a join on
    // this field, and an unbound record means NO RUN EVER LEAVES THE COLLECTION.
    return {
      status: 422,
      body: {
        error: 'evidence reference does not satisfy the published contract',
        detail: e instanceof Error ? e.message : String(e),
      },
    };
  }

  // ── STEP 6. THE TENANT IN THE BODY MUST NOT CONTRADICT THE CREDENTIAL ─────────────────────
  //
  // The credential decides the tenant; this only refuses a contradiction. A reference claiming
  // another tenant is refused rather than silently re-scoped, because silently re-scoping would
  // record one tenant's evidence under another's identity.
  const claimed = (reference as { tenantId?: unknown }).tenantId;
  if (typeof claimed === 'string' && claimed !== env.onboarding.tenantId) {
    return { status: 403, body: { error: `not permitted for tenant "${slug}"` } };
  }

  // ── STEP 7. THE BINDING — THE HASH MUST NAME A RUN THIS PLANE AUTHORED FOR THIS TENANT ────
  //
  // ADR-0082 P-82.5, R-20.12. **This is the step that makes the reference ATTRIBUTABLE**, and it is
  // last among the checks deliberately: it is the only one that touches storage, and every cheaper
  // refusal above should have already fired. Auth, permission, tenant scope, payload and contract
  // shape are all settled before this route reads a byte of the run record store.
  //
  // THE PARTITION COMES FROM THE CREDENTIAL, NEVER FROM THE BODY. `slug` and `env.onboarding.tenantId`
  // are the values STEP 4 derived from the authenticated principal — `reference.tenantId` was only
  // ever allowed to CONTRADICT them (STEP 6), never to select them. Building the context from the
  // body here would re-open F-04 at the last possible moment, after six steps of closing it.
  const ctx = tenantContext({ tenantId: env.onboarding.tenantId, tenantSlug: slug });
  const run = await deps.runs.runForPackageHash(ctx, parsed.packageHash.value);
  if (!run) {
    // ONE EXPRESSION FOR BOTH UNBINDABLE CASES (P-70.4) — see `unbindableEvidenceRefusal`. A hash
    // naming another tenant's package is NOT FOUND here rather than found-and-rejected, so there is
    // no branch to leak and none to forget.
    return { status: 422, body: { error: unbindableEvidenceRefusal(parsed.packageHash.value) } };
  }

  // ── STEP 8. RECORDED — THE SUBTRACTION (ADR-0082 §6 step 3, P-82.2) ───────────────────────
  //
  // **THIS REPLACES THE STDOUT LINE, AND IT IS WHAT REMOVES THE RUN FROM `/work`.** Until this
  // existed the plane could accept evidence all day and the outstanding collection could only grow.
  //
  // THE ALLOW-LIST IS APPLIED IN THE STORE, ON THE WRITE PATH — NOT HERE. What this route passes is
  // named field by field, but the store rebuilds it again anyway (P-82.6). **That is not redundancy
  // to remove:** this route is one caller, and a projection performed only at the caller is a
  // projection the next caller will not perform.
  //
  // AN ARRIVAL THAT THROWS IS A 500 THROUGH THE TRANSPORTS, NOT A 202. The store refuses on a
  // run/hash disagreement it has already been checked for above, so a throw here means the store and
  // this route disagree about what STEP 7 established — which is a fault, not a caller error.
  const arrival = await deps.runs.onEvidenceArrived(ctx, {
    runId: run.runId,
    packageHash: parsed.packageHash.value,
    contractVersion: parsed.contractVersion,
    reference: {
      evidenceId: parsed.evidenceId,
      contentHashRef: parsed.contentHash.value,
      classification: parsed.classification,
      capturedAt: parsed.capturedAt,
      assuranceState: parsed.assuranceState,
      outcome: parsed.outcome,
    },
  });

  // 202, not 200: the plane has accepted the reference and has NOT yet performed stages 10-12 over
  // it. Returning 200 would assert a completed action that has not occurred — recording is not
  // processing.
  //
  // `alreadyRecorded` IS REPORTED SO A RETRY IS DISTINGUISHABLE FROM A FIRST SUBMISSION. It is about
  // the caller's OWN submission, so it is not the oracle STEP 7's refusal has to avoid being.
  return {
    status: 202,
    body: {
      accepted: true,
      packageHash: parsed.packageHash.value,
      runId: run.runId,
      recorded: true,
      alreadyRecorded: arrival.alreadyRecorded,
      detail: 'reference accepted, bound to a known run, and recorded; the run is no longer outstanding',
    },
  };
}
