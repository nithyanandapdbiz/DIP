/**
 * TRACEABILITY: 08-security-model.md · ADR-0033 · ADR-0034
 *
 * Microsoft (Entra ID) sign-in → DBIZ session bridge. No database.
 *
 * The ONLY role is DBIZ IP Admin (the platform-admin). A Microsoft identity is accepted only if
 * its email is on a configured allow-list; everyone else is refused with a clear message. On
 * acceptance a stateless DBIZ session JWT is issued (HS256, the platform's own token — auth-tokens.ts),
 * so there is no user store and no session table: the allow-list is config, the token is self-contained.
 *
 * SECURITY: the Entra id_token is verified server-side against the tenant's public keys (JWKS, RS256)
 * — the browser cannot forge it. `verify` is injectable so the allow-list/session logic is testable
 * without a live tenant; the default performs the real JWKS verification.
 */
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { issueSessionToken } from './auth-tokens.js';
import type { Principal, Role } from './authz.js';

/** DBIZ IP Admin === the platform-admin role. It is the only role this app grants. */
export const IP_ADMIN_ROLE: Role = 'platform-admin';

export interface MicrosoftAuthConfig {
  readonly tenantId: string;
  readonly clientId: string;
  readonly allowlist: readonly string[];
  readonly sessionSecret: string;
  readonly sessionTtlSeconds?: number;
  /**
   * Require an Entra app role on every sign-in. When true, an identity that carries no recognised role
   * is REFUSED even if it is on the allow-list — there is no implicit platform-admin.
   *
   * Default false preserves the established behaviour (allow-list ⇒ DBIZ IP Admin) so an existing
   * deployment keeps working while roles are provisioned in the directory. A production deployment
   * turns it on; `platform-adoption.ts` refuses to boot production without it being set deliberately.
   */
  readonly requireEntraRoles?: boolean;
  /**
   * Maps an Entra group object-id to the tenant slugs it grants. Only consulted for non-global roles.
   * Group-based scoping is what lets a customer administrator be confined to their own tenant without
   * the platform holding a user store (INV-2 — the IP keeps no customer identity data).
   */
  readonly groupTenantMap?: Readonly<Record<string, readonly string[]>>;
}

export interface MicrosoftClaims {
  readonly email: string;
  readonly name?: string;
  /** Entra app roles from the `roles` claim. Empty when the app registration defines none. */
  readonly roles?: readonly string[];
  /** Entra group object-ids from the `groups` claim, used to resolve tenant scope. */
  readonly groups?: readonly string[];
}
export type VerifyMicrosoftToken = (idToken: string, cfg: MicrosoftAuthConfig) => Promise<MicrosoftClaims | null>;

/** What the server needs to run the bridge: the config plus (optionally) an override verifier. */
export interface MicrosoftAuthDeps { readonly config: MicrosoftAuthConfig; readonly verify?: VerifyMicrosoftToken }

/**
 * DEV-ONLY verifier. Trusts an UNSIGNED `dev:<email>` token so the allow-list and session flow can be
 * exercised locally before a real Entra tenant is wired. NEVER select this when AZURE_TENANT_ID is set —
 * it performs no signature check. The allow-list still applies, so a non-listed email is still refused.
 */
export const devEmailVerifier: VerifyMicrosoftToken = async (idToken) => {
  const m = /^dev:(.+)$/.exec(idToken.trim());
  return m && m[1] ? { email: m[1].toLowerCase() } : null;
};

/** Default verifier: validate an Entra id_token against the tenant JWKS (RS256). Node crypto only. */
export const verifyMicrosoftIdToken: VerifyMicrosoftToken = async (idToken, cfg) => {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  let header: { kid?: string; alg?: string };
  let payload: {
    exp?: number; nbf?: number; aud?: string; iss?: string; tid?: string;
    preferred_username?: string; email?: string; name?: string;
    roles?: unknown; groups?: unknown;
  };
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch { return null; }
  // The algorithm is PINNED, never taken as a hint: accepting whatever the header names is the
  // classic algorithm-confusion vector (`alg: none`, or HS256 verified against the public key).
  if (header.alg !== 'RS256' || !header.kid) return null;

  let jwks: { keys: { kid: string; [k: string]: unknown }[] };
  try {
    const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/discovery/v2.0/keys`);
    jwks = await res.json() as typeof jwks;
  } catch { return null; }
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let pub;
  try { pub = createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' }); } catch { return null; }
  if (!cryptoVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, Buffer.from(s, 'base64url'))) return null;

  const now = Math.floor(Date.now() / 1000);
  // CLOCK SKEW IS TOLERATED IN ONE DIRECTION ONLY, AND IT IS NOT `exp`.
  // Leeway on `exp` EXTENDS the life of an expired credential, which is a security relaxation however
  // small — so expiry stays strict. Leeway on `nbf` only ever REFUSES a token slightly longer, which
  // is fail-safe, and is what actually breaks under modest drift between Entra and this host.
  const CLOCK_SKEW_SECONDS = 120;
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  // `nbf` was previously unchecked, so a token minted for future use was accepted early.
  if (typeof payload.nbf === 'number' && payload.nbf > now + CLOCK_SKEW_SECONDS) return null;
  if (cfg.clientId && payload.aud !== cfg.clientId) return null;

  // ISSUER AND DIRECTORY ARE MATCHED EXACTLY, NOT BY SUBSTRING.
  // `iss.includes(tenantId)` accepted any issuer URL that merely CONTAINED the tenant id — including
  // an attacker-controlled host with the id embedded in its path. Entra issues one of two well-known
  // issuer forms per directory, so both are enumerated and compared whole. `tid` is checked too: it is
  // the authoritative directory claim, and matching it closes the case where a multi-tenant app
  // registration accepts a token minted by a DIFFERENT directory.
  const validIssuers = [
    `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`,
    `https://sts.windows.net/${cfg.tenantId}/`,
  ];
  if (typeof payload.iss !== 'string' || !validIssuers.includes(payload.iss)) return null;
  if (typeof payload.tid === 'string' && payload.tid !== cfg.tenantId) return null;

  const email = String(payload.preferred_username ?? payload.email ?? '').toLowerCase();
  if (!email) return null;

  const strings = (v: unknown): readonly string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const roles = strings(payload.roles);
  const groups = strings(payload.groups);
  return {
    email,
    ...(payload.name ? { name: payload.name } : {}),
    ...(roles.length ? { roles } : {}),
    ...(groups.length ? { groups } : {}),
  };
};

/**
 * Entra app-role value → DBiz platform role.
 *
 * The mapping is a CLOSED, EXPLICIT table, not a string coercion. An unrecognised role value maps to
 * nothing at all rather than to a default, so a typo in a directory app-role assignment — or a role
 * invented by someone with directory write access — grants no access instead of quietly granting the
 * most convenient one. Role names are matched case-insensitively because directory tooling and
 * operators are inconsistent about casing, which is a usability property, not a security relaxation.
 */
export const ENTRA_ROLE_MAP: Readonly<Record<string, Role>> = {
  'dbiz.platform.admin': 'platform-admin',
  'platform-admin': 'platform-admin',
  'dbiz.tenant.admin': 'tenant-admin',
  'tenant-admin': 'tenant-admin',
  'dbiz.viewer': 'viewer',
  'viewer': 'viewer',
};

/** Translate Entra app roles into DBiz roles, discarding anything unrecognised. Order is stable. */
export function mapEntraRoles(claimed: readonly string[] | undefined): readonly Role[] {
  const out: Role[] = [];
  for (const raw of claimed ?? []) {
    const mapped = ENTRA_ROLE_MAP[String(raw).trim().toLowerCase()];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

/**
 * Resolve the tenant slugs a principal is scoped to, from its Entra group memberships.
 *
 * Returns an empty list when nothing maps. That is deliberate and fail-closed: `mayAccessTenant()`
 * denies a non-global principal with an empty scope, so a tenant-admin whose groups are unmapped can
 * reach NO tenant rather than all of them.
 */
export function resolveTenantScope(
  groups: readonly string[] | undefined,
  groupTenantMap: Readonly<Record<string, readonly string[]>> | undefined,
): readonly string[] {
  if (!groups || !groupTenantMap) return [];
  const slugs = new Set<string>();
  for (const g of groups) for (const slug of groupTenantMap[g] ?? []) slugs.add(slug);
  return [...slugs].sort();
}

export type SessionResult =
  | { readonly ok: true; readonly token: string; readonly principal: Principal; readonly email: string }
  | { readonly ok: false; readonly status: 401 | 403; readonly message: string; readonly email?: string };

/**
 * Verify a Microsoft id_token, enforce the DBIZ IP Admin allow-list, and issue a DBIZ session token.
 * `verify` and `now` are injected for testing; production uses the real JWKS verifier and system clock.
 */
export async function resolveMicrosoftSession(
  idToken: string,
  cfg: MicrosoftAuthConfig,
  verify: VerifyMicrosoftToken = verifyMicrosoftIdToken,
  now?: () => number,
): Promise<SessionResult> {
  const claims = await verify(idToken, cfg);
  if (!claims) {
    return { ok: false, status: 401, message: 'Your Microsoft sign-in could not be verified. Please try signing in again.' };
  }
  const email = claims.email.toLowerCase();
  const allowed = cfg.allowlist.map((e) => e.trim().toLowerCase()).includes(email);
  if (!allowed) {
    return {
      ok: false, status: 403, email,
      message: `Access not authorised. Your Microsoft account (${email}) is not on the DBIZ IP Admin access list. If you believe this is an error, contact your DBIZ platform administrator to request access.`,
    };
  }

  // ── ROLE RESOLUTION ────────────────────────────────────────────────────────────────────────────
  // This function previously issued `roles: [IP_ADMIN_ROLE]` unconditionally, so EVERY authenticated
  // human was a global platform-admin over every tenant. `authz.ts` modelled four roles and a tenant
  // scope, and `mayAccessTenant()` short-circuits true for platform-admin — so C-07.11 was never
  // exercised for a human caller and the multi-tenant authorisation claim had no implementation
  // behind it. The policy engine was correct throughout; the identity was not.
  //
  // Roles now come from the DIRECTORY, and tenant scope from group membership. Two properties matter:
  //
  //   FAIL CLOSED. An identity with no recognised role gets no session. There is no "default role",
  //   because a default here means a default to admin — the failure this whole change removes.
  //
  //   BACKWARD COMPATIBLE, BUT ONLY DELIBERATELY. Where the directory supplies no roles at all (an app
  //   registration with none defined yet), the established allow-list ⇒ DBIZ IP Admin behaviour is
  //   retained so existing deployments keep working during role provisioning. `requireEntraRoles`
  //   turns that off, and `platform-adoption.ts` requires a production deployment to state its choice
  //   rather than inherit the lenient one.
  const mapped = mapEntraRoles(claims.roles);
  let roles: readonly Role[];
  if (mapped.length > 0) {
    roles = mapped;
  } else if (cfg.requireEntraRoles) {
    // TWO DIFFERENT FAULTS, TWO DIFFERENT FIXES — so they must not share one message.
    //
    // No `roles` claim at all means the directory never issued one: the app role is unassigned, or
    // does not exist, or is not assignable to users. Creating a role under App registrations does
    // nothing on its own — the assignment happens under Enterprise applications.
    //
    // A `roles` claim carrying something unrecognised means the assignment worked and the role's
    // VALUE is wrong (`ENTRA_ROLE_MAP` is a closed table, so a typo grants nothing).
    //
    // Both previously read "carries no DBIZ application role", which sent an operator to check an
    // assignment that was already correct — or, worse, to re-create a role that already existed.
    // The received values are echoed because the directory is the only place they can be corrected,
    // and an administrator cannot correct what they cannot see.
    const claimed = (claims.roles ?? []).filter((r) => typeof r === 'string' && r.trim());
    const expected = 'DBiz.Platform.Admin, DBiz.Tenant.Admin or DBiz.Viewer';
    const message = claimed.length === 0
      ? `Access not authorised. Your Microsoft sign-in carried no application-role claim at all, so no DBIZ role is assigned to ${email} in Microsoft Entra. Ask your DBIZ platform administrator to assign one (${expected}) to your account under the application's Enterprise application → Users and groups. Defining the role alone is not enough — it must be assigned.`
      : `Access not authorised. Your Microsoft account (${email}) carries the application role(s) ${claimed.join(', ')}, which are not DBIZ roles. Ask your DBIZ platform administrator to correct the app role's Value in Microsoft Entra — it must be one of ${expected}. The role's display name is not used; only its Value is.`;
    return { ok: false, status: 403, email, message };
  } else {
    roles = [IP_ADMIN_ROLE];
  }

  // A global role is scoped by role, not by group. For every other role the scope is the ONLY set of
  // tenants reachable, and an empty scope denies everything (authz.ts `mayAccessTenant`, fail-closed).
  const isGlobal = roles.includes(IP_ADMIN_ROLE);
  const tenants = isGlobal ? [] : resolveTenantScope(claims.groups, cfg.groupTenantMap);
  if (!isGlobal && tenants.length === 0) {
    return {
      ok: false, status: 403, email,
      message: `Access not authorised. Your Microsoft account (${email}) holds a tenant-scoped role but is not a member of any group mapped to a tenant. Ask your DBIZ platform administrator to add you to the tenant's access group.`,
    };
  }

  const principal: Principal = { id: email, roles, ...(tenants.length > 0 ? { tenants } : {}) };
  const token = issueSessionToken(principal, cfg.sessionSecret, {
    ttlSeconds: cfg.sessionTtlSeconds ?? 3600, ...(now ? { now } : {}),
  });
  return { ok: true, token, principal, email };
}
