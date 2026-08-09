/**
 * MULTI-TENANT RBAC SUITE — proof that identity, not just policy, is tenant-scoped.
 *
 * TRACEABILITY
 *   Architecture : 07-tenant-isolation.md (C-07.11) · 08-security-model.md §5a
 *   ADR          : ADR-0033 §R-33.5 · ADR-0019 (evidence over assertion)
 *
 * WHY THIS SUITE IS SEPARATE FROM THE HTTP-SURFACE SUITE.
 *
 * The authorisation ENGINE was never the defect. `can()`, `mayAccessTenant()` and
 * `permissionForRoute()` were correct, tested, and enforced — a tenant-scoped principal really was
 * refused another tenant. The defect was that no such principal could ever exist:
 * `resolveMicrosoftSession` issued `roles: [IP_ADMIN_ROLE]` to every authenticated human, and
 * `mayAccessTenant()` short-circuits true for a platform-admin. The isolation rule was live code that
 * nothing could reach.
 *
 * So proving isolation by minting a scoped token by hand (as the HTTP suite does) proves the policy
 * engine and NOT the platform. This suite drives the identity path — Entra claims → roles → scope →
 * session — and asserts that what comes out the other end is actually confined. That is the property
 * the multi-tenant claim rests on.
 *
 * FAIL-CLOSED IS ASSERTED IN BOTH DIRECTIONS. It is not enough that a good token works; an identity
 * with an unrecognised role, an unmapped group, or a forged role claim must end up with NO access
 * rather than defaulting to the most convenient one.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMicrosoftSession, mapEntraRoles, resolveTenantScope, verifySessionToken,
  can, mayAccessTenant, isGlobalPrincipal,
  type MicrosoftAuthConfig, type MicrosoftClaims, type VerifyMicrosoftToken,
} from '../src/index.js';
import { parseGroupTenantMap } from '../src/server/platform-adoption.js';

const SECRET = 'test-secret-at-least-thirty-two-characters';

const baseConfig = (over: Partial<MicrosoftAuthConfig> = {}): MicrosoftAuthConfig => ({
  tenantId: 'dir-1', clientId: 'app-1',
  allowlist: ['ann@acme.test', 'bob@globex.test', 'root@dbiz.test'],
  sessionSecret: SECRET,
  ...over,
});

/** An injected verifier standing in for Entra, so the identity path is exercised without a directory. */
const verifierFor = (claims: MicrosoftClaims | null): VerifyMicrosoftToken => async () => claims;

// ── Role mapping ──────────────────────────────────────────────────────────────

describe('Entra app roles map to platform roles through a closed table', () => {
  test('recognised roles map, case-insensitively', () => {
    assert.deepEqual(mapEntraRoles(['DBiz.Platform.Admin']), ['platform-admin']);
    assert.deepEqual(mapEntraRoles(['dbiz.tenant.admin']), ['tenant-admin']);
    assert.deepEqual(mapEntraRoles(['Viewer']), ['viewer']);
  });

  test('an unrecognised role maps to NOTHING, never to a default', () => {
    // The whole point: a typo or an invented role must not become a role at all. A "default role"
    // here means a default to admin, which is the failure this change removes.
    assert.deepEqual(mapEntraRoles(['dbiz.superuser']), []);
    assert.deepEqual(mapEntraRoles(['admin']), []);
    assert.deepEqual(mapEntraRoles(['']), []);
    assert.deepEqual(mapEntraRoles(undefined), []);
  });

  test('duplicates collapse and order is stable', () => {
    assert.deepEqual(mapEntraRoles(['viewer', 'Viewer', 'dbiz.viewer']), ['viewer']);
  });
});

// ── Tenant scope from group membership ────────────────────────────────────────

describe('tenant scope is resolved from group membership, fail-closed', () => {
  const map = parseGroupTenantMap('g-acme:acme-corp,g-multi:acme-corp|globex,g-globex:globex');

  test('a mapped group grants exactly its tenants', () => {
    assert.deepEqual(resolveTenantScope(['g-acme'], map), ['acme-corp']);
    assert.deepEqual(resolveTenantScope(['g-multi'], map), ['acme-corp', 'globex']);
  });

  test('an unmapped group grants nothing', () => {
    assert.deepEqual(resolveTenantScope(['g-unknown'], map), []);
  });

  test('no groups, or no map, grants nothing', () => {
    assert.deepEqual(resolveTenantScope(undefined, map), []);
    assert.deepEqual(resolveTenantScope(['g-acme'], undefined), []);
  });

  test('a malformed map entry is dropped, never defaulted', () => {
    // A typo must not silently widen scope.
    const bad = parseGroupTenantMap('no-colon-here,:,g-ok:acme-corp,g-empty:');
    assert.deepEqual(Object.keys(bad), ['g-ok']);
    assert.deepEqual(bad['g-ok'], ['acme-corp']);
  });

  test('slugs are case-folded so a mapping matches the canonical slug the router uses', () => {
    const m = parseGroupTenantMap('g:Acme-Corp');
    assert.deepEqual(m['g'], ['acme-corp']);
  });
});

// ── The identity path end to end ──────────────────────────────────────────────

describe('a signed-in identity receives only the access its directory role grants', () => {
  const map = parseGroupTenantMap('g-acme:acme-corp,g-globex:globex');

  test('a tenant-admin is confined to its mapped tenant', async () => {
    const r = await resolveMicrosoftSession('t', baseConfig({ requireEntraRoles: true, groupTenantMap: map }),
      verifierFor({ email: 'ann@acme.test', roles: ['dbiz.tenant.admin'], groups: ['g-acme'] }));
    assert.equal(r.ok, true);
    if (!r.ok) return;

    assert.deepEqual(r.principal.roles, ['tenant-admin']);
    assert.deepEqual(r.principal.tenants, ['acme-corp']);
    assert.equal(isGlobalPrincipal(r.principal), false, 'a tenant-admin must not be global');
    assert.equal(mayAccessTenant(r.principal, 'acme-corp'), true);
    assert.equal(mayAccessTenant(r.principal, 'globex'), false, 'CROSS-TENANT ACCESS');
    assert.equal(can(r.principal, 'tenant:delete'), false, 'a tenant-admin cannot delete a tenant');
  });

  test('the scope survives the token round-trip', async () => {
    // Regression guard: if `tenants` were dropped from the token, a tenant-admin would authenticate
    // with an EMPTY scope and be denied its own tenant — or, worse, a later change could treat an
    // absent scope as unrestricted.
    const r = await resolveMicrosoftSession('t', baseConfig({ requireEntraRoles: true, groupTenantMap: map }),
      verifierFor({ email: 'ann@acme.test', roles: ['dbiz.tenant.admin'], groups: ['g-acme'] }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const verified = verifySessionToken(r.token, SECRET);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    assert.deepEqual(verified.principal.tenants, ['acme-corp']);
    assert.equal(mayAccessTenant(verified.principal, 'globex'), false);
  });

  test('a viewer can read and nothing else', async () => {
    const r = await resolveMicrosoftSession('t', baseConfig({ requireEntraRoles: true, groupTenantMap: map }),
      verifierFor({ email: 'bob@globex.test', roles: ['dbiz.viewer'], groups: ['g-globex'] }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(can(r.principal, 'tenant:read'), true);
    assert.equal(can(r.principal, 'tenant:update'), false);
    assert.equal(can(r.principal, 'tenant:configure'), false);
    assert.deepEqual(r.principal.tenants, ['globex']);
  });

  test('a platform-admin is global and carries no group-derived scope', async () => {
    const r = await resolveMicrosoftSession('t', baseConfig({ requireEntraRoles: true, groupTenantMap: map }),
      verifierFor({ email: 'root@dbiz.test', roles: ['dbiz.platform.admin'], groups: ['g-acme'] }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(isGlobalPrincipal(r.principal), true);
    assert.equal(r.principal.tenants, undefined, 'a global role is scoped by role, not by group');
    assert.equal(mayAccessTenant(r.principal, 'any-tenant'), true);
  });
});

// ── Fail-closed ───────────────────────────────────────────────────────────────

describe('identity resolution fails closed', () => {
  const map = parseGroupTenantMap('g-acme:acme-corp');
  const strict = baseConfig({ requireEntraRoles: true, groupTenantMap: map });

  test('an allow-listed identity with NO recognised role is refused, not made admin', async () => {
    // The exact defect: previously every allow-listed identity became a global platform-admin.
    const r = await resolveMicrosoftSession('t', strict,
      verifierFor({ email: 'ann@acme.test', roles: ['some.unrecognised.role'], groups: ['g-acme'] }));
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 403);
  });

  test('a MISSING roles claim and an UNRECOGNISED role give different, actionable messages', async () => {
    /*
     * These are different faults with different fixes, and one shared message cost a real
     * investigation: a token with no `roles` claim at all was reported identically to one carrying a
     * misspelled role, so the administrator checked an assignment that was already correct.
     *
     * Missing claim  → nothing is assigned in the directory (assign it under Enterprise applications).
     * Unrecognised   → the assignment worked and the app role's Value is wrong (fix the Value).
     */
    const absent = await resolveMicrosoftSession('t', strict, verifierFor({ email: 'ann@acme.test' }));
    assert.equal(absent.ok, false);
    if (absent.ok) return;
    assert.match(absent.message, /no application-role claim at all/i);
    assert.match(absent.message, /Enterprise application/i, 'must name where the assignment is made');

    const wrong = await resolveMicrosoftSession('t', strict,
      verifierFor({ email: 'ann@acme.test', roles: ['Admin'] }));
    assert.equal(wrong.ok, false);
    if (wrong.ok) return;
    assert.match(wrong.message, /carries the application role\(s\) Admin/,
      'the received value must be echoed — it is the thing that has to be corrected');
    assert.match(wrong.message, /Value/, 'must point at the Value field, not the display name');
    assert.doesNotMatch(wrong.message, /no application-role claim/i);
  });

  test('a tenant-scoped role with no mapped group reaches NO tenant', async () => {
    const r = await resolveMicrosoftSession('t', strict,
      verifierFor({ email: 'ann@acme.test', roles: ['dbiz.tenant.admin'], groups: ['g-unmapped'] }));
    assert.equal(r.ok, false, 'an unscoped tenant-admin must not receive a session');
    if (r.ok) return;
    assert.equal(r.status, 403);
  });

  test('the allow-list still gates entry even with a valid platform role', async () => {
    const r = await resolveMicrosoftSession('t', strict,
      verifierFor({ email: 'intruder@evil.test', roles: ['dbiz.platform.admin'] }));
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 403);
  });

  test('an unverifiable token is refused before any role is considered', async () => {
    const r = await resolveMicrosoftSession('t', strict, verifierFor(null));
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 401);
  });
});

// ── Backward compatibility ────────────────────────────────────────────────────

describe('the transitional mode is preserved, and is opt-out not opt-in', () => {
  test('without requireEntraRoles, a role-less allow-listed identity keeps platform-admin', async () => {
    // Existing deployments must not break the moment this ships, while roles are being provisioned.
    // `platform-adoption.ts` forces a PRODUCTION deployment to state its choice rather than inherit
    // this one, so the lenient path cannot be reached in production by omission.
    const r = await resolveMicrosoftSession('t', baseConfig(),
      verifierFor({ email: 'root@dbiz.test' }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.principal.roles, ['platform-admin']);
  });

  test('even in transitional mode, a directory role WINS over the implicit default', async () => {
    const r = await resolveMicrosoftSession('t', baseConfig({ groupTenantMap: parseGroupTenantMap('g-acme:acme-corp') }),
      verifierFor({ email: 'ann@acme.test', roles: ['dbiz.viewer'], groups: ['g-acme'] }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.principal.roles, ['viewer'], 'an explicit role must never be widened to admin');
    assert.equal(isGlobalPrincipal(r.principal), false);
  });
});
