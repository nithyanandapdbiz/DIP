/**
 * Authorisation — role-based access control for the tenant API.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md · 07-tenant-isolation.md
 *   ADR          : ADR-0033 §R-33.5 (auth is a production precondition)
 *
 * THE POLICY ENGINE IS FRAMEWORK-INDEPENDENT. Roles → permissions → a pure `can()` check,
 * with no dependency on the transport. The node:http server and a future NestJS guard both
 * consult the same functions, so the access rules are tested once and enforced everywhere.
 * Identity (who the principal is — JWT/session/mTLS) is supplied by the transport; this module
 * decides only what a given principal may do.
 */

export type Role = 'platform-admin' | 'tenant-admin' | 'viewer' | 'execution-plane';

export type Permission =
  | 'tenant:create' | 'tenant:read' | 'tenant:update' | 'tenant:activate' | 'tenant:delete'
  | 'tenant:lifecycle' | 'tenant:configure';

export interface Principal {
  readonly id: string;
  readonly roles: readonly Role[];
  /**
   * The tenant slugs this principal is scoped to. IGNORED for a platform-admin, who is global
   * by role. For every other principal this is the ONLY set of tenants it may reach; absent or
   * empty means no tenant access (fail-closed). C-07.11: tenant scope is taken from the
   * authenticated principal, never from a caller-supplied field.
   */
  readonly tenants?: readonly string[];
}

/** What each role may do. Least privilege: a viewer reads, and nothing else. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  'platform-admin': ['tenant:create', 'tenant:read', 'tenant:update', 'tenant:activate', 'tenant:delete', 'tenant:lifecycle', 'tenant:configure'],
  'tenant-admin': ['tenant:read', 'tenant:update', 'tenant:activate', 'tenant:lifecycle', 'tenant:configure'],
  'viewer': ['tenant:read'],
  // The Execution Plane's own token: it may read its updates and acknowledge them, nothing more.
  'execution-plane': ['tenant:read', 'tenant:update'],
};

/** The permissions a principal holds, unioned across its roles. */
export function permissionsOf(principal: Principal): ReadonlySet<Permission> {
  const perms = new Set<Permission>();
  for (const role of principal.roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) perms.add(p);
  }
  return perms;
}

export function can(principal: Principal, permission: Permission): boolean {
  return permissionsOf(principal).has(permission);
}

/** A platform-admin operates across all tenants; every other role is tenant-scoped. */
export function isGlobalPrincipal(principal: Principal): boolean {
  return principal.roles.includes('platform-admin');
}

/**
 * Whether the principal is entitled to act on a SPECIFIC tenant (by slug). `can()` answers
 * "may this principal do X to a tenant"; this answers "to THIS tenant". BOTH are required:
 * without the second check, any authenticated tenant-admin or viewer could read or mutate any
 * other tenant simply by naming its slug — the cross-tenant isolation hole (C-07.11, doc 07).
 * A platform-admin is global; every other principal is confined to its scoped slugs; an unknown
 * or empty scope denies (fail-closed).
 */
export function mayAccessTenant(principal: Principal, slug: string): boolean {
  if (isGlobalPrincipal(principal)) return true;
  return (principal.tenants ?? []).includes(slug);
}

/**
 * Map a route (method + terminal action) to the permission it requires. `null` means the
 * route needs no permission (there are none today — every tenant route is protected).
 */
export function permissionForRoute(method: string, action: string | undefined): Permission | null {
  if (method === 'POST' && action === undefined) return 'tenant:create';
  if (method === 'POST' && action === 'activate') return 'tenant:activate';
  if (method === 'POST' && action === 'solution') return 'tenant:activate';
  if (method === 'POST' && action === 'ep-token') return 'tenant:configure';
  if (method === 'POST' && action === 'otc') return 'tenant:configure';
  if (method === 'POST' && action === 'updates') return 'tenant:update';
  // Software Update Management (ADR-0035): publish is an admin act; the EP reports its installed version
  // with its own tenant:update; sync/compatibility are configure; rollback is a lifecycle action.
  if (method === 'POST' && action === 'installed') return 'tenant:update';
  if (method === 'POST' && action === 'publish-update') return 'tenant:activate';
  if (method === 'POST' && (action === 'sync-config' || action === 'check-compatibility')) return 'tenant:configure';
  if (method === 'POST' && action === 'rollback') return 'tenant:lifecycle';
  if (method === 'POST' && (action === 'suspend' || action === 'reactivate' || action === 'archive')) return 'tenant:lifecycle';
  if (method === 'GET') return 'tenant:read';
  // ALL onboarding/governance PATCH routes require tenant:configure (an admin permission). The
  // execution-plane role holds only tenant:read + tenant:update, so an EP credential cannot drive the
  // onboarding journey — in particular it cannot PATCH /recommendations to self-grant capabilities or
  // rewrite its own isolation boundaries (least privilege; would defeat the R-21.11 execution-path control).
  // The EP's legitimate surface is GET/POST /updates only, both handled above. connect/discovery/
  // recommendations/review are the journey; capabilities/configuration/integrations are governance.
  if (method === 'PATCH') return 'tenant:configure';
  if (method === 'DELETE') return 'tenant:delete';
  return null;
}
