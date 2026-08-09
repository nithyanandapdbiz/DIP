/**
 * Post-activation lifecycle governance — Intelligence-Plane owned (ADR-0034 §6; Doc 19).
 * TRACEABILITY: R-21.5 (frozen states, reused), R-21.11 (capability guard), R-21.24 (archive retains), P7.
 *   Proves: suspend/reactivate/archive drive the FROZEN state machine and update the one tenant.json;
 *           illegal transitions are refused and leave the manifest untouched; capability enable is
 *           R-21.11-bounded; generic config edit validates BEFORE persisting; every op audits.
 * Categories: contract, governance, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TenantConfigRepository, InMemoryTenantConfigStore,
  type RepositoryOptions, type WelcomeInput, type TenantEnvelope,
} from '../src/engine/index.js';

let tick = 0;
const opts: RepositoryOptions = { now: () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`, newTenantId: () => 'tnt-x' };
const WELCOME: WelcomeInput = { organisationName: 'Carlisle Homes', tenantName: 'Carlisle Prod', primaryAdministrator: 'John', preferredCloud: 'azure', deploymentModel: 'container' };
const SLUG = 'carlisle-prod';

/** Create a tenant and (optionally) seed its canonical lifecycle state for the transition under test. */
function seed(state?: string): { store: InMemoryTenantConfigStore; repo: TenantConfigRepository } {
  tick = 0;
  const store = new InMemoryTenantConfigStore();
  const repo = new TenantConfigRepository(store, opts);
  repo.createFromWelcome(WELCOME);
  if (state) { const env = store.read(SLUG) as TenantEnvelope; env.onboarding.lifecycleState = state; store.write(SLUG, env); }
  return { store, repo };
}

describe('lifecycle operations are IP-owned and reuse the frozen state machine (R-21.5)', () => {
  test('suspend an ACTIVE tenant → SUSPENDED, audited', () => {
    const { repo } = seed('ACTIVE');
    const env = repo.suspend(SLUG, 'ops', 'security review');
    assert.equal(env.onboarding.lifecycleState, 'SUSPENDED');
    assert.equal(env.onboarding.status, 'Suspended');
    assert.equal(env.onboarding.projection, 'SUSPENDED');
    assert.ok(env.onboarding.audit.some((a) => a.event === 'suspended' && a.detail.includes('security review')));
  });
  test('reactivate a SUSPENDED tenant → ACTIVE', () => {
    const env = seed('SUSPENDED').repo.reactivate(SLUG);
    assert.equal(env.onboarding.lifecycleState, 'ACTIVE');
    assert.equal(env.onboarding.status, 'Active');
  });
  test('archive an ACTIVE tenant → CLOSED / DECOMMISSIONED (manifest retained, R-21.24)', () => {
    const env = seed('ACTIVE').repo.archive(SLUG);
    assert.equal(env.onboarding.lifecycleState, 'CLOSED');
    assert.equal(env.onboarding.projection, 'DECOMMISSIONED');
    assert.equal(env.onboarding.status, 'Archived');
    assert.ok(env.onboarding.audit.some((a) => a.event === 'archived'));
  });
  test('an illegal transition is refused and leaves the manifest untouched', () => {
    const { store, repo } = seed('PROVISIONED');
    assert.throws(() => repo.suspend(SLUG), /illegal transition PROVISIONED -> SUSPENDED/);
    assert.equal((store.read(SLUG) as TenantEnvelope).onboarding.lifecycleState, 'PROVISIONED');
  });
});

describe('capability management reuses the R-21.11 execution-path guard', () => {
  test('enable a built capability, then disable it', () => {
    const { repo } = seed();
    let env = repo.setCapability(SLUG, 'security-testing', true);
    assert.ok(env.configuration.dbiz.entitledCapabilities.includes('security-testing'));
    assert.ok(env.isolation.capabilityBoundaries.includes('security-testing'));
    assert.ok(env.onboarding.audit.some((a) => a.event === 'capability-enabled'));
    env = repo.setCapability(SLUG, 'security-testing', false);
    assert.ok(!env.configuration.dbiz.entitledCapabilities.includes('security-testing'));
  });
  test('enabling a capability with no execution path is refused (R-21.11)', () => {
    assert.throws(() => seed().repo.setCapability(SLUG, 'not-a-real-capability', true), /no verified execution path/);
  });
});

describe('generic configuration edit validates BEFORE persisting (P7)', () => {
  test('a valid patch is deep-merged, re-certified and audited', () => {
    const env = seed().repo.updateConfiguration(SLUG, { customer: { environment: 'production' } });
    assert.equal(env.configuration.customer.environment, 'production');
    assert.equal(env.configuration.customer.customerName, 'Carlisle Homes'); // untouched by the merge
    assert.equal(env.provenance.certification?.ok, true);
    assert.ok(env.onboarding.audit.some((a) => a.event === 'configuration-updated'));
  });
  test('an invalid patch is rejected and NOT persisted', () => {
    const { store, repo } = seed();
    assert.throws(() => repo.updateConfiguration(SLUG, { dbiz: { entitledCapabilities: [] } }), /invalid configuration/);
    assert.ok((store.read(SLUG) as TenantEnvelope).configuration.dbiz.entitledCapabilities.length >= 1);
  });
});
