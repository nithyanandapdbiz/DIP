/**
 * The authentication refusal — the ONE place that decides what a rejected caller is told.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md (§5a signed tokens) · 20-cross-plane-contracts.md
 *   ADR          : ADR-0033 (R-33.5, authentication is a production precondition) ·
 *                  ADR-0074 (both negatives stay distinct — the ruling this applies) ·
 *                  ADR-0078 (a refusal taxonomy is authored, never inferred from behaviour)
 *   Standard     : RFC 6750 §3 / §3.1 (the `WWW-Authenticate: Bearer` challenge)
 *   Criteria     : CWE-306 · CWE-209
 *
 * ══ THE DEFECT THIS CLOSES ═══════════════════════════════════════════════════════════════════
 *
 * `401 {"error":"authentication required"}` was returned, byte for byte, to
 *
 *   - a caller that presented NO credential,
 *   - a caller that presented a well-formed credential this deployment could not verify,
 *   - a caller that presented a corrupt or expired one,
 *   - and a caller reaching a deployment where `authenticate` was never wired at all.
 *
 * A caller could therefore form no hypothesis about its own grant that the response could
 * distinguish. Measured from the Execution Plane, `GET /api/application-templates` was
 * indistinguishable under all four, and the far side correctly declined to guess. **The
 * reach/refusal collapse is not untidiness on this boundary; it is what stops the diagnosis.**
 *
 * ══ WHAT IS SEPARATED, AND WHY EACH IS SAFE TO SAY ═══════════════════════════════════════════
 *
 * TWO facts reach the caller, and both are facts the caller ALREADY HOLDS:
 *
 *   ABSENT   — "you presented no credential". The caller knows what it put on the wire. This
 *              server evaluated nothing, so there is nothing it could be leaking: the response
 *              is a function of the request alone, identical for every deployment, every tenant
 *              and every secret. It is the RFC 6750 §3.1 bare challenge for exactly this reason
 *              — that section directs a resource server NOT to send an error code when the
 *              request carried no authentication information.
 *
 *   REJECTED — "you presented a credential and it did not authenticate". Also already held: the
 *              caller knows it sent one, and a 401 already told it the request did not succeed.
 *              `error="invalid_token"` adds no third fact; it names which of the two the caller
 *              is in.
 *
 * ══ WHAT IS DELIBERATELY NOT SEPARATED — THE RULING ASKED FOR ════════════════════════════════
 *
 * **`malformed`, `bad-signature` and `expired` are NOT distinguished on the wire, and the
 * decision is that they should not be.** They are carried on `AuthOutcome.reason` and go to the
 * server log; they never reach a response body or header.
 *
 * THE ARGUMENT IS NOT SQUEAMISHNESS, IT IS THAT THE SPLIT BUYS NOTHING AND COSTS SOMETHING.
 *
 *   It buys nothing. The remedy is identical in all three cases: obtain a new credential. A
 *   distinction that changes no action the caller can take is not a diagnosis, it is a detail.
 *
 *   It costs something specific. Separating `expired` from `bad-signature` answers a question
 *   about SERVER state that the caller does not otherwise hold: *was this token signed by the
 *   secret this deployment currently uses?* `expired` says yes-but-stale; `bad-signature` says
 *   never-under-this-secret. That difference reveals whether `SESSION_SECRET` has rotated, and
 *   it reveals it to whoever holds the token — which, for a captured token, is not the tenant.
 *   It is a small leak. It is still a leak, and it is bought with nothing.
 *
 * SO THE DISTINCTION IS KEPT, AND MOVED RATHER THAN DISCARDED. The operator — already inside
 * the trust boundary — reads `malformed` / `bad-signature` / `expired` / `unsupported-scheme` in
 * the request log against the same correlation id the caller was handed. The diagnosis has a
 * home; the caller does not get an oracle. **`NOT MEASURED` is never a pass (CHARTER §17.1), and
 * collapsing a fact into a log is not the same as not measuring it.**
 *
 * ══ REJECTED-FOR-SCOPE vs REJECTED-FOR-IDENTITY ══════════════════════════════════════════════
 *
 * **Already separated, and not at the 401.** Scope is decided only AFTER identity is
 * established, so it cannot be a 401 in the first place: `route()` answers `403 not permitted:
 * <permission>` when the role is insufficient and `403 not permitted for tenant "<slug>"` when
 * the principal is scoped elsewhere (api.ts), and `handlePackageRetrieval` states its own. A
 * caller that reaches a 403 has been authenticated. **Nothing further is owed here** — the split
 * the question asks for exists one status code up, and adding a scope signal to the 401 would
 * mean answering a scope question for a caller whose identity was never established.
 *
 * ══ AND THE FOURTH CASE, WHICH IS NOT ABOUT THE CALLER AT ALL ════════════════════════════════
 *
 * `authenticate` unwired is `501`, never `401`. A deployment that cannot evaluate credentials is
 * making no statement about the one presented, and saying `authentication required` there
 * reports an OPERATIONAL fault as a CREDENTIAL fault — sending the caller to rotate a grant that
 * was never the problem. This is D-111's shape exactly: `app.module.ts` records that omitting
 * `authenticate` from `PACKAGE_DEPS` "makes the route answer 401 to every caller, including the
 * package's owner". `handlePackageRetrieval` already answers 501 for an unconfigured STORE on
 * the same reasoning (`package-retrieval.ts`: "Declared-but-unconfigured is 501, never 404").
 * This is that rule applied to the unconfigured AUTHENTICATOR.
 *
 * It grants nothing and reaches nothing: 501 is a refusal, and no route body is served on it.
 */

/**
 * The protection space named in the challenge. One realm: every route here is served by one
 * deployment and honours one credential, so a second realm would be a distinction without a
 * difference — and a caller reading two of them would reasonably infer two credentials.
 */
export const AUTH_REALM = 'dbiz-intelligence-plane';

/** A refusal, in the shape both handlers return. `headers` are written by every transport. */
export interface AuthRefusal {
  readonly status: number;
  readonly body: { readonly error: string };
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * The 401 for a caller that presented NOTHING (RFC 6750 §3.1 — a bare challenge, no error code).
 * Reachable without any credential, and a function of the request alone.
 */
export const AUTH_REQUIRED: AuthRefusal = {
  status: 401,
  body: { error: 'authentication required' },
  headers: { 'www-authenticate': `Bearer realm="${AUTH_REALM}"` },
};

/**
 * The 401 for a caller that presented a credential which did not authenticate.
 *
 * `invalid_token` is RFC 6750's own registered code and covers all four internal reasons at
 * once — which is the point: the caller learns it is in this case rather than the other, and
 * learns nothing about WHICH internal reason put it here.
 */
export const CREDENTIAL_REJECTED: AuthRefusal = {
  status: 401,
  body: { error: 'credential rejected' },
  headers: { 'www-authenticate': `Bearer realm="${AUTH_REALM}", error="invalid_token"` },
};

/**
 * The 501 for a deployment whose authenticator is not wired. Not a statement about any
 * credential — see the header comment.
 */
export const AUTH_NOT_CONFIGURED: AuthRefusal = {
  status: 501,
  body: { error: 'authentication is not configured' },
  headers: {},
};

/**
 * The refusal owed to an unauthenticated caller.
 *
 * `credentialPresented` is the ONLY input, and it is deliberately a boolean rather than the
 * `AuthOutcome` itself: this function must not be able to read `reason`, so it cannot leak one
 * by a later edit. The narrowing happens at the transport, once, on the way in.
 *
 * ABSENT IS THE DEFAULT AND THAT IS THE FAIL-SAFE DIRECTION. `undefined` means a caller that
 * did not tell us — a pure-`route()` invocation, say — and it resolves to the weaker,
 * non-committal statement rather than asserting a credential was seen.
 */
export function authRefusal(credentialPresented: boolean | undefined): AuthRefusal {
  return credentialPresented === true ? CREDENTIAL_REJECTED : AUTH_REQUIRED;
}
