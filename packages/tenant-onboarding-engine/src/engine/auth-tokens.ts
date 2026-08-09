/**
 * Session tokens — HS256 JWT issue/verify, resolving a caller to a Principal.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md §5a (short-lived, signed tokens)
 *   ADR          : ADR-0033 §R-33.5 (production authentication)
 *
 * IDENTITY, NOT AUTHORISATION. This module answers "who is the caller?" — it issues and verifies
 * a signed, expiring session token and returns the Principal named in it. What that principal may
 * DO is decided by `authz.ts` (roles → permissions). The two are separate on purpose: a stolen
 * token still cannot exceed its roles, and an authorisation change needs no re-issue.
 *
 * NODE STANDARD LIBRARY ONLY. HMAC-SHA256 via node:crypto — no JWT dependency — mirroring the
 * platform's existing authorisation server (platform-runtime `authentication.ts`), so the web tier
 * adds no supply-chain surface for token handling.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Principal, Role } from './authz.js';

const b64url = (b: Buffer): string => b.toString('base64url');
const sign = (secret: string, data: string): string => b64url(createHmac('sha256', secret).update(data).digest());

export interface IssueOptions {
  readonly ttlSeconds?: number;
  readonly now?: () => number; // epoch seconds; injected for deterministic tests
}

/** Issue a signed session token for a principal. */
export function issueSessionToken(principal: Principal, secret: string, options: IssueOptions = {}): string {
  const now = options.now ? options.now() : Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(Buffer.from(JSON.stringify({
    sub: principal.id, roles: principal.roles,
    // Carry the tenant scope so a non-global principal keeps its entitlement across the token
    // round-trip. Without this a tenant-admin/viewer would authenticate with an EMPTY scope and be
    // denied its own tenant (C-07.11 is fail-closed). A platform-admin carries none and stays global.
    ...(principal.tenants && principal.tenants.length > 0 ? { tenants: principal.tenants } : {}),
    iat: now, exp: now + (options.ttlSeconds ?? 3600),
  })));
  const body = `${header}.${payload}`;
  return `${body}.${sign(secret, body)}`;
}

export type TokenResult =
  | { readonly ok: true; readonly principal: Principal }
  | { readonly ok: false; readonly reason: 'malformed' | 'bad-signature' | 'expired' };

/** Verify a session token and return its principal, or a typed reason it was refused. */
export function verifySessionToken(token: string, secret: string, now: () => number = () => Math.floor(Date.now() / 1000)): TokenResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, payload, signature] = parts as [string, string, string];
  const expected = sign(secret, `${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad-signature' };
  let claims: { sub?: unknown; roles?: unknown; tenants?: unknown; exp?: unknown };
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { return { ok: false, reason: 'malformed' }; }
  if (typeof claims.exp !== 'number' || now() >= claims.exp) return { ok: false, reason: 'expired' };
  if (typeof claims.sub !== 'string' || !Array.isArray(claims.roles)) return { ok: false, reason: 'malformed' };
  // Reconstruct the tenant scope if the token carried one (absent → global-or-fail-closed per role).
  const tenants = Array.isArray(claims.tenants) && claims.tenants.every((t) => typeof t === 'string')
    ? (claims.tenants as string[]) : undefined;
  return { ok: true, principal: { id: claims.sub, roles: claims.roles as Role[], ...(tenants ? { tenants } : {}) } };
}

/**
 * Why a credential did not authenticate. **Server-side only — never placed on the wire.**
 * See `auth-refusal.ts` for what a caller is told and the reasoning behind the split.
 *
 * DERIVED FROM `TokenResult`, NOT RESTATED. A hand-written copy of the verifier's reasons would
 * silently stop covering it the moment a reason is added — and the new reason would then be
 * unrepresentable here, so it would arrive at the log as whatever the nearest existing case was.
 * `unsupported-scheme` is added because it is this function's own refusal, not the verifier's:
 * the verifier is never reached when the scheme is not Bearer.
 */
export type AuthRejection = Extract<TokenResult, { ok: false }>['reason'] | 'unsupported-scheme';

/**
 * The result of resolving a caller from request headers — THREE outcomes, not two.
 *
 * ── WHY THIS IS NOT `Principal | null` ──────────────────────────────────────────────────────
 *
 * It was, and the collapse was load-bearing in the wrong direction. `bearerAuthenticator`
 * verified a token into a typed `TokenResult` carrying `malformed` / `bad-signature` /
 * `expired`, and then threw all of it — plus *no header at all* — away into one `null`. Every
 * consumer therefore answered `401 authentication required` to a caller who presented nothing,
 * a caller who presented a valid credential this deployment could not verify, and a caller who
 * presented a corrupt one. **The three are different facts, and the caller cannot establish
 * which one it is in without being told.** That is not untidiness: it is what stops the far
 * side diagnosing its own grant, because every hypothesis it can form produces the same bytes.
 *
 * `ABSENT` and `REJECTED` are kept distinct here for the same reason ADR-0074 keeps
 * `{reached: true, value: null}` distinct from `{reached: false, reason}` in
 * `capability-framework/adapters.ts`: **overloading one negative to mean two is recorded there
 * as REJECTED, not unconsidered.** This is that ruling applied to the auth seam.
 *
 * THE DISTINCTION IS IN THE TYPE, NOT IN A CONVENTION, because a transport that resolves its
 * own principal is exactly the thing this codebase has already forgotten to wire twice (D-111).
 * A transport cannot now read a principal without meeting the two refusals.
 */
export type AuthOutcome =
  /** A credential was presented and verified. */
  | { readonly outcome: 'authenticated'; readonly principal: Principal }
  /** No credential was presented. The caller sent nothing for this server to evaluate. */
  | { readonly outcome: 'absent' }
  /** A credential WAS presented and did not authenticate. `reason` never leaves the server. */
  | { readonly outcome: 'rejected'; readonly reason: AuthRejection };

/** No credential was presented. Named so transports state the absence rather than construct it. */
export const AUTH_ABSENT: AuthOutcome = { outcome: 'absent' };

/**
 * The principal an outcome names, or `null`.
 *
 * For the call sites that legitimately need only identity — attribution in a log line, say —
 * and must NOT branch on the refusal. It is deliberately a separate function rather than a
 * field: reading `.principal` off a refused outcome is a type error, and this is the one
 * sanctioned way to discard the distinction.
 */
export function principalOf(outcome: AuthOutcome | null | undefined): Principal | null {
  return outcome !== null && outcome !== undefined && outcome.outcome === 'authenticated' ? outcome.principal : null;
}

/**
 * Build an `authenticate(headers)` for the API server from a signing secret. It reads the Bearer
 * token, verifies it, and reports WHICH of the three outcomes occurred — the production wiring
 * behind the API's auth seam.
 *
 * THE SCHEME CHECK AND THE VERIFY ARE DIFFERENT ANSWERS. A missing or blank `Authorization`
 * header is `absent`: nothing was presented, and this function evaluated nothing. A header that
 * IS present but is not a Bearer credential — or is `Bearer` with no token after it — is
 * `rejected`, because the caller did attempt to authenticate and the attempt failed. Folding the
 * second into `absent` would tell a caller that sent a credential that it had sent none, which
 * is the same lie in the opposite direction.
 */
export function bearerAuthenticator(secret: string, now?: () => number): (headers: { authorization?: string | string[] | undefined }) => AuthOutcome {
  return (headers) => {
    const raw = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
    if (raw === undefined || raw.trim() === '') return AUTH_ABSENT;
    if (!raw.startsWith('Bearer ')) return { outcome: 'rejected', reason: 'unsupported-scheme' };
    const token = raw.slice('Bearer '.length).trim();
    if (token === '') return { outcome: 'rejected', reason: 'malformed' };
    const result = verifySessionToken(token, secret, now);
    return result.ok
      ? { outcome: 'authenticated', principal: result.principal }
      : { outcome: 'rejected', reason: result.reason };
  };
}
