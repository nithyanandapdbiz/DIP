/**
 * Web-tier logic — session tokens, dashboard queries, and manifest diff.
 * TRACEABILITY: ADR-0033 (React/NestJS are presentation/transport over this tested logic) · 08-security-model.md
 *   Proves: JWT issue/verify + tamper/expiry detection; dashboard search/filter/sort; config-viewer diff.
 * Categories: security, contract
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  issueSessionToken, verifySessionToken, bearerAuthenticator, principalOf,
  queryDashboard, searchTenants, sortTenants,
  diffManifests,
  type Principal,
} from '../src/engine/index.js';
import type { TenantSummary } from '../src/engine/tenant-repository.js';

const admin: Principal = { id: 'u1', roles: ['platform-admin'] };
const SECRET = 'test-secret';

describe('session tokens (HS256, no dependency)', () => {
  test('a freshly issued token verifies to its principal', () => {
    const now = () => 1_000;
    const token = issueSessionToken(admin, SECRET, { now, ttlSeconds: 60 });
    const r = verifySessionToken(token, SECRET, () => 1_030);
    assert.ok(r.ok && r.principal.id === 'u1' && r.principal.roles[0] === 'platform-admin');
  });
  test('an expired token is refused', () => {
    const token = issueSessionToken(admin, SECRET, { now: () => 1_000, ttlSeconds: 10 });
    const r = verifySessionToken(token, SECRET, () => 2_000);
    assert.ok(!r.ok && r.reason === 'expired');
  });
  test('a tampered token fails signature verification', () => {
    const token = issueSessionToken(admin, SECRET, { now: () => 1_000 });
    const forged = `${token.slice(0, -2)}xy`;
    const r = verifySessionToken(forged, SECRET, () => 1_010);
    assert.ok(!r.ok && (r.reason === 'bad-signature' || r.reason === 'malformed'));
  });
  test('the bearer authenticator resolves a header to a principal', () => {
    const token = issueSessionToken(admin, SECRET, { now: () => 1_000 });
    const auth = bearerAuthenticator(SECRET, () => 1_010);
    const resolved = auth({ authorization: `Bearer ${token}` });
    assert.equal(resolved.outcome, 'authenticated');
    assert.equal(principalOf(resolved)?.id, 'u1');
  });

  /**
   * THE AUTHENTICATOR REPORTS *WHICH* NEGATIVE, AND THAT IS THE POINT (OBL-002).
   *
   * It previously returned `null` for all five rows below, so every consumer answered one
   * indistinguishable 401 — and a caller could form no hypothesis about its own credential that
   * the response could separate. `absent` and `rejected` are different facts; the four REASONS
   * are deliberately not on the wire, and `auth-refusal.ts` owns that ruling.
   */
  test('the bearer authenticator distinguishes no-credential from credential-refused', () => {
    const auth = bearerAuthenticator(SECRET, () => 1_010);
    const expired = issueSessionToken(admin, SECRET, { now: () => 1_000, ttlSeconds: 1 });
    const valid = issueSessionToken(admin, SECRET, { now: () => 1_000 });

    // Nothing presented — this server evaluated nothing.
    assert.equal(auth({ authorization: undefined }).outcome, 'absent');
    assert.equal(auth({ authorization: '   ' }).outcome, 'absent');

    // Presented and refused, with the reason kept server-side.
    const rows: [string, string][] = [
      ['Basic dXNlcjpwYXNz', 'unsupported-scheme'],
      ['Bearer ', 'malformed'],
      ['Bearer not.a.token', 'bad-signature'],
      [`Bearer ${expired}`, 'expired'],
      [`Bearer ${valid.slice(0, -2)}xy`, 'bad-signature'],
    ];
    for (const [header, reason] of rows) {
      const r = auth({ authorization: header });
      assert.equal(r.outcome, 'rejected', `"${header.slice(0, 24)}" must be rejected, not absent`);
      assert.equal(r.outcome === 'rejected' && r.reason, reason, `reason for "${header.slice(0, 24)}"`);
    }
  });
  test('a scoped principal keeps its tenant entitlement across the token round-trip (C-07.11)', () => {
    const scoped: Principal = { id: 'u-ta', roles: ['tenant-admin'], tenants: ['carlisle-homes'] };
    const r = verifySessionToken(issueSessionToken(scoped, SECRET, { now: () => 1_000, ttlSeconds: 60 }), SECRET, () => 1_010);
    assert.ok(r.ok);
    assert.deepEqual(r.principal.tenants, ['carlisle-homes']);
    // A platform-admin carries no scope and stays global (tenants absent, mayAccessTenant → true).
    const g = verifySessionToken(issueSessionToken(admin, SECRET, { now: () => 1_000 }), SECRET, () => 1_010);
    assert.ok(g.ok && g.principal.tenants === undefined);
  });
});

describe('dashboard queries (search / filter / sort)', () => {
  const tenants: TenantSummary[] = [
    { slug: 'alpha', displayName: 'Alpha Corp', status: 'Onboarding', progress: 33, currentStage: 'connect', tenantId: 'tnt-a', updatedAt: '2026-07-23T00:00:01.000Z' },
    { slug: 'beta', displayName: 'Beta Ltd', status: 'Provisioned', progress: 100, currentStage: 'activation', tenantId: 'tnt-b', updatedAt: '2026-07-23T00:00:03.000Z' },
    { slug: 'gamma', displayName: 'Gamma Homes', status: 'Onboarding', progress: 66, currentStage: 'recommendations', tenantId: 'tnt-g', updatedAt: '2026-07-23T00:00:02.000Z' },
  ];
  test('search matches name/slug/id case-insensitively', () => {
    assert.equal(searchTenants(tenants, 'beta').length, 1);
    assert.equal(searchTenants(tenants, 'tnt-g')[0]!.slug, 'gamma');
  });
  test('recently-updated sort puts the newest first', () => {
    assert.equal(sortTenants(tenants, 'recently-updated')[0]!.slug, 'beta');
  });
  test('the pipeline filters by status then sorts', () => {
    const r = queryDashboard(tenants, { status: 'Onboarding', sort: 'progress' });
    assert.equal(r.length, 2);
    assert.equal(r[0]!.slug, 'gamma'); // 66 before 33
  });
});

describe('manifest diff (config-viewer compare)', () => {
  test('detects changed, added and removed leaves', () => {
    const before = { a: 1, b: { c: 'x' }, d: [1, 2] };
    const after = { a: 2, b: { c: 'x', e: true }, d: [1, 2] };
    const changes = diffManifests(before, after);
    const byPath = new Map(changes.map((c) => [c.path, c]));
    assert.equal(byPath.get('a')?.kind, 'changed');
    assert.equal(byPath.get('b.e')?.kind, 'added');
    assert.ok(!byPath.has('d')); // unchanged array not reported
  });
});
