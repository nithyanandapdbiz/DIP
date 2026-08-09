/**
 * Authorisation policy — roles → permissions.
 * TRACEABILITY: ADR-0033 §R-33.5 · 08-security-model.md
 * Categories: security, contract
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { can, permissionsOf, permissionForRoute, type Principal } from '../src/engine/index.js';

describe('role-based permissions (least privilege)', () => {
  test('a viewer may only read', () => {
    const viewer: Principal = { id: 'v', roles: ['viewer'] };
    assert.ok(can(viewer, 'tenant:read'));
    for (const p of ['tenant:create', 'tenant:update', 'tenant:activate', 'tenant:delete'] as const) {
      assert.equal(can(viewer, p), false, `viewer denied ${p}`);
    }
  });
  test('a platform-admin may do everything', () => {
    const admin: Principal = { id: 'a', roles: ['platform-admin'] };
    assert.equal(permissionsOf(admin).size, 7); // + tenant:lifecycle, tenant:configure (ADR-0034)
  });
  test('a tenant-admin may update and activate but not create or delete', () => {
    const ta: Principal = { id: 't', roles: ['tenant-admin'] };
    assert.ok(can(ta, 'tenant:update') && can(ta, 'tenant:activate'));
    assert.equal(can(ta, 'tenant:create'), false);
    assert.equal(can(ta, 'tenant:delete'), false);
  });
  test('roles union their permissions', () => {
    const both: Principal = { id: 'b', roles: ['viewer', 'tenant-admin'] };
    assert.ok(can(both, 'tenant:read') && can(both, 'tenant:activate'));
  });
});

describe('route → required permission mapping', () => {
  test('each method maps to the expected permission', () => {
    assert.equal(permissionForRoute('POST', undefined), 'tenant:create');
    assert.equal(permissionForRoute('POST', 'activate'), 'tenant:activate');
    assert.equal(permissionForRoute('GET', 'manifest'), 'tenant:read');
    assert.equal(permissionForRoute('POST', 'updates'), 'tenant:update'); // the EP's legitimate write
    // ALL onboarding/governance PATCH routes require tenant:configure (admin), NOT tenant:update — so an
    // execution-plane credential (read+update only) cannot self-drive the journey / self-grant capabilities.
    assert.equal(permissionForRoute('PATCH', 'connect'), 'tenant:configure');
    assert.equal(permissionForRoute('PATCH', 'discovery'), 'tenant:configure');
    assert.equal(permissionForRoute('PATCH', 'recommendations'), 'tenant:configure');
    assert.equal(permissionForRoute('PATCH', 'review'), 'tenant:configure');
    assert.equal(permissionForRoute('PATCH', 'capabilities'), 'tenant:configure');
    assert.equal(permissionForRoute('DELETE', undefined), 'tenant:delete');
  });
});
