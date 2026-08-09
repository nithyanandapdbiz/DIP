/**
 * Tenant Lifecycle — the six-state machine and its projection.
 * TRACEABILITY: 21-tenant-lifecycle.md §2 (R-21.5/6), §3a (R-21.27/29) · ADR-0030 §4.3
 *   Criteria: C-21.1 (exactly one state) · C-21.14 (every transition audited)
 *             C-21.16 (no ACTIVE without registration, connectivity and smoke)
 * Categories: contract, security, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TenantLifecycle,
  projectLifecycle,
  CANONICAL_STATES,
  type CanonicalState,
} from '../src/domain/lifecycle-state-machine.js';

// A deterministic clock so audit timestamps replay (R-14.2).
let tick = 0;
const clock = () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`;
const fresh = (initial?: CanonicalState) =>
  new TenantLifecycle(initial ? { tenantId: 't-1', now: clock, initialState: initial } : { tenantId: 't-1', now: clock });

const driveToProvisionedWithPrereqs = (lc: TenantLifecycle) => {
  lc.transition('PROVISIONED', 'orchestrator', 'provisioning');
  for (const s of [3, 4, 5, 6, 7, 10, 11, 12]) lc.completeStage(s);
};

describe('the frozen six states (R-21.5)', () => {
  test('the machine declares exactly the six canonical states', () => {
    assert.deepEqual([...CANONICAL_STATES], ['REGISTERED', 'PROVISIONED', 'ACTIVE', 'SUSPENDED', 'OFFBOARDING', 'CLOSED']);
  });

  test('a tenant begins at REGISTERED and is always in exactly one state (C-21.1)', () => {
    const lc = fresh();
    assert.equal(lc.state, 'REGISTERED');
    assert.equal(typeof lc.state, 'string');
  });
});

describe('transitions are legal-only and audited (C-21.14)', () => {
  test('a legal transition is accepted and recorded with actor, timestamp and reason', () => {
    const lc = fresh();
    const r = lc.transition('PROVISIONED', 'orchestrator', 'entitlements set');
    assert.equal(r.ok, true);
    assert.equal(lc.history.length, 1);
    const e = lc.history[0];
    assert.ok(e && e.actor === 'orchestrator' && e.reason === 'entitlements set' && e.at.length > 0);
  });

  test('an illegal transition is a typed refusal, not a throw or a silent no-op', () => {
    const lc = fresh();
    const r = lc.transition('ACTIVE', 'orchestrator', 'skip'); // REGISTERED -> ACTIVE is illegal
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'illegal-transition');
    assert.equal(lc.state, 'REGISTERED');
    assert.equal(lc.history.length, 0);
  });
});

describe('no ACTIVE without proven registration, connectivity and smoke (C-21.16, R-21.29)', () => {
  test('PROVISIONED -> ACTIVE is refused while stages 10/11/12 are incomplete', () => {
    const lc = fresh();
    lc.transition('PROVISIONED', 'orchestrator', 'provisioned');
    lc.completeStage(10); lc.completeStage(11); // 12 (smoke) missing
    const r = lc.transition('ACTIVE', 'orchestrator', 'activate');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'activation-prerequisite-unmet');
    assert.equal(lc.canExecute, false);
  });

  test('PROVISIONED -> ACTIVE succeeds once all three prerequisites are proven', () => {
    const lc = fresh();
    driveToProvisionedWithPrereqs(lc);
    const r = lc.transition('ACTIVE', 'orchestrator', 'all evidence present');
    assert.equal(r.ok, true);
    assert.equal(lc.canExecute, true); // only ACTIVE permits execution (R-21.6)
  });
});

describe('only ACTIVE permits execution (R-21.6)', () => {
  test('canExecute is true in ACTIVE and false everywhere else', () => {
    for (const s of CANONICAL_STATES) {
      const lc = fresh(s);
      assert.equal(lc.canExecute, s === 'ACTIVE');
    }
  });
});

describe('the projection is an overlay over canonical state (ADR-0030 §4.3)', () => {
  test('an ACTIVE tenant projects OPERATIONAL', () => {
    const lc = fresh();
    driveToProvisionedWithPrereqs(lc);
    lc.transition('ACTIVE', 'orchestrator', 'activate');
    assert.equal(lc.projection, 'OPERATIONAL');
  });

  test('progress within PROVISIONED projects the right onboarding stage', () => {
    const done = new Set<number>();
    assert.equal(projectLifecycle('PROVISIONED', done), 'CONFIGURED');
    done.add(3); assert.equal(projectLifecycle('PROVISIONED', done), 'CONFIGURED');
    done.add(5); assert.equal(projectLifecycle('PROVISIONED', done), 'EP_GENERATED');
    done.add(7); assert.equal(projectLifecycle('PROVISIONED', done), 'WAITING_FOR_DEPLOYMENT');
    done.add(10); assert.equal(projectLifecycle('PROVISIONED', done), 'EP_CONNECTED');
    done.add(11); assert.equal(projectLifecycle('PROVISIONED', done), 'HEALTH_VERIFIED');
    done.add(12); assert.equal(projectLifecycle('PROVISIONED', done), 'SMOKE_PASSED');
    done.add(13); assert.equal(projectLifecycle('PROVISIONED', done), 'CERTIFIED');
  });

  test('closed projects DECOMMISSIONED, suspended projects SUSPENDED', () => {
    assert.equal(projectLifecycle('CLOSED', new Set()), 'DECOMMISSIONED');
    assert.equal(projectLifecycle('SUSPENDED', new Set()), 'SUSPENDED');
  });
});
