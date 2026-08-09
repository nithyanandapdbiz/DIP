/**
 * The sealed package purge DRIVER — R-06.13's schedule, R-06.15's alerting.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md (R-06.13, R-06.14, R-06.15)
 *   ADR          : ADR-0079 (P-79.4 retention, never keyed to delivery)
 *   Criteria     : C-06.7 · C-06.8
 *
 * WHAT THESE PROVE THAT THE STORE'S OWN SUITE DID NOT. The store suite proved `purgeExpired` is
 * correct WHEN DRIVEN. It could not prove anything drives it, and nothing did. These prove the
 * schedule: that a timer invokes the sweep, that a failing tenant ALERTS rather than being
 * skipped, that one tenant's failure does not suspend retention for the rest, and that a store
 * obtained the production way is already purging before it serves a read.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { tenantContext } from '../src/tenant/tenant-context.js';
import { InMemoryStorageProvider, type StorageProvider, type ArtefactKey } from '../src/storage/storage-provider.js';
import { SealedPackageStore, type TenantOwnershipResolver } from '../src/storage/sealed-package-store.js';
import {
  SealedPackagePurgeDriver, sealedPackageService, DEFAULT_PURGE_INTERVAL_MS,
  type IntervalScheduler,
} from '../src/storage/sealed-package-purge.js';

const NOW = Date.parse('2026-08-06T00:00:00Z');
const ALICE = tenantContext({ tenantId: 'tnt-aaaaaaaaaaaa', tenantSlug: 'alice-co' });
const BOB = tenantContext({ tenantId: 'tnt-bbbbbbbbbbbb', tenantSlug: 'bob-ltd' });
const LIVE = 'a'.repeat(64);
const DEAD = 'd'.repeat(64);

const registry: TenantOwnershipResolver = {
  resolveSlugByTenantId: (id) =>
    id === ALICE.tenantId ? ALICE.tenantSlug : id === BOB.tenantId ? BOB.tenantSlug : undefined,
};

function sealedBody(hash: string, tenantId: string, notAfter: string): string {
  return JSON.stringify({
    provenance: {
      tenantId, authoredBy: 'ip', authoredAt: '2026-08-01T00:00:00Z',
      contractVersion: '1.0.0', signingKeyId: 'k',
      contentHash: { algorithm: 'sha256-jcs-v1', domain: 'dbiz.execution-package@1', value: hash },
    },
    validity: { notBefore: '2026-08-01T00:00:00Z', notAfter, reusableWhileUnavailable: true },
  });
}

/** A scheduler that records what it was asked to run, and fires only when told. */
function manualScheduler(): IntervalScheduler & { fire: () => void; intervalMs: number | undefined; stopped: boolean } {
  const s = {
    intervalMs: undefined as number | undefined,
    stopped: false,
    fn: undefined as (() => void) | undefined,
    every(ms: number, fn: () => void) {
      s.intervalMs = ms; s.fn = fn;
      return { stop: () => { s.stopped = true; } };
    },
    fire: () => s.fn?.(),
  };
  return s as IntervalScheduler & { fire: () => void; intervalMs: number | undefined; stopped: boolean };
}

async function seeded() {
  const storage = new InMemoryStorageProvider();
  const store = new SealedPackageStore(storage, registry, () => NOW);
  await store.onPackageSealed(ALICE, sealedBody(LIVE, ALICE.tenantId, '2027-01-01T00:00:00Z'), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  await store.onPackageSealed(ALICE, sealedBody(DEAD, ALICE.tenantId, '2026-08-05T00:00:00Z'), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  return { storage, store };
}

describe('R-06.13 — purge is enforced by code ON A SCHEDULE', () => {
  test('starting the driver registers a timer; the sweep runs when it fires', async () => {
    const { store, storage } = await seeded();
    const sched = manualScheduler();
    const driver = new SealedPackagePurgeDriver({
      store, tenants: () => [ALICE], onPurgeFailure: () => { throw new Error('unexpected'); },
      scheduler: sched, now: () => NOW,
    });

    assert.equal(driver.running, false);
    driver.start();
    assert.equal(driver.running, true, 'starting must register a schedule');
    assert.equal(sched.intervalMs, DEFAULT_PURGE_INTERVAL_MS);

    // Precondition: the expired package is present until the schedule fires.
    const key: ArtefactKey = { capability: 'packages', run: 'sealed', artefact: DEAD };
    assert.equal(await storage.exists(ALICE, key), true);

    sched.fire();
    await new Promise((r) => setImmediate(r));

    assert.equal(await storage.exists(ALICE, key), false, 'the scheduled sweep must purge');
    assert.equal(await storage.exists(ALICE, { ...key, artefact: LIVE }), true, 'and only the expired one');
    driver.stop();
    assert.equal(driver.running, false);
  });

  test('the tenant list is read FRESH on every sweep — a tenant onboarded later is covered', async () => {
    const { store } = await seeded();
    let tenants: readonly typeof ALICE[] = [];
    const driver = new SealedPackagePurgeDriver({
      store, tenants: () => tenants, onPurgeFailure: () => {}, now: () => NOW,
    });
    assert.equal((await driver.sweep()).sweptTenants, 0);
    tenants = [ALICE];
    assert.equal((await driver.sweep()).sweptTenants, 1,
      'a cached tenant list would leave a new tenant with no retention');
  });

  test('a sweep purges across every tenant, not just the first', async () => {
    const storage = new InMemoryStorageProvider();
    const store = new SealedPackageStore(storage, registry, () => NOW);
    await store.onPackageSealed(ALICE, sealedBody(DEAD, ALICE.tenantId, '2026-08-05T00:00:00Z'), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
    await store.onPackageSealed(BOB, sealedBody(DEAD, BOB.tenantId, '2026-08-05T00:00:00Z'), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

    const driver = new SealedPackagePurgeDriver({
      store, tenants: () => [ALICE, BOB], onPurgeFailure: () => {}, now: () => NOW,
    });
    const outcome = await driver.sweep();
    assert.equal(outcome.sweptTenants, 2);
    assert.equal(outcome.purgedHashes.length, 2);
  });
});

describe('R-06.15 — purge failure is loud, never a silent skip', () => {
  test('a failing tenant ALERTS, and the failure is reported in the outcome', async () => {
    const exploding: StorageProvider = {
      backend: 'exploding',
      put: async () => {}, get: async () => undefined, getText: async () => undefined,
      exists: async () => false, delete: async () => {},
      list: async () => { throw new Error('mount unavailable'); },
      purgeTenant: async () => {},
    };
    const store = new SealedPackageStore(exploding, registry, () => NOW);
    const alerts: { slug: string; error: unknown }[] = [];
    const driver = new SealedPackagePurgeDriver({
      store, tenants: () => [ALICE], onPurgeFailure: (slug, error) => alerts.push({ slug, error }), now: () => NOW,
    });

    const outcome = await driver.sweep();
    assert.equal(alerts.length, 1, 'a failed purge must raise — a silent skip is the R-06.15 defect');
    assert.equal(alerts[0]!.slug, ALICE.tenantSlug);
    assert.equal(outcome.failures.length, 1, 'and the failure must survive into the outcome');
  });

  test("one tenant's failure does not suspend retention for the others", async () => {
    const storage = new InMemoryStorageProvider();
    const store = new SealedPackageStore(storage, registry, () => NOW);
    await store.onPackageSealed(BOB, sealedBody(DEAD, BOB.tenantId, '2026-08-05T00:00:00Z'), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

    // Alice's list throws; Bob's succeeds. Aborting the sweep on Alice would silently suspend
    // Bob's retention, and the outage would look like nothing at all.
    const flaky: StorageProvider = {
      backend: 'flaky',
      list: async (ctx, prefix) => {
        if (ctx.tenantSlug === ALICE.tenantSlug) throw new Error('alice partition unavailable');
        return storage.list(ctx, prefix);
      },
      put: (ctx, key, data) => storage.put(ctx, key, data),
      get: (ctx, key) => storage.get(ctx, key),
      getText: (ctx, key) => storage.getText(ctx, key),
      exists: (ctx, key) => storage.exists(ctx, key),
      delete: (ctx, key) => storage.delete(ctx, key),
      purgeTenant: (ctx) => storage.purgeTenant(ctx),
    };
    const driver = new SealedPackagePurgeDriver({
      store: new SealedPackageStore(flaky, registry, () => NOW),
      tenants: () => [ALICE, BOB], onPurgeFailure: () => {}, now: () => NOW,
    });

    const outcome = await driver.sweep();
    assert.equal(outcome.failures.length, 1, 'Alice failed');
    assert.deepEqual([...outcome.purgedHashes], [DEAD], 'and Bob was still purged');
  });

  test('a rejected scheduled sweep reaches the alert sink rather than becoming an unhandled rejection', async () => {
    const store = new SealedPackageStore(new InMemoryStorageProvider(), registry, () => NOW);
    const alerts: string[] = [];
    const sched = manualScheduler();
    const driver = new SealedPackagePurgeDriver({
      store,
      tenants: () => { throw new Error('registry unavailable'); },
      onPurgeFailure: (slug) => alerts.push(slug),
      scheduler: sched, now: () => NOW,
    });
    driver.start();
    sched.fire();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(alerts, ['*'],
      'a throw escaping the timer callback must alert, not vanish into an unhandled rejection');
    driver.stop();
  });
});

describe('a store cannot be put into service without its purge driver', () => {
  test('sealedPackageService() returns a store whose retention is ALREADY running', async () => {
    const svc = sealedPackageService({
      storage: new InMemoryStorageProvider(), owners: registry,
      tenants: () => [ALICE], onPurgeFailure: () => {},
      scheduler: manualScheduler(), now: () => NOW,
    });
    assert.equal(svc.purgeDriver.running, true,
      'there must be no window in which the store serves reads and nothing enforces retention');
    svc.stop();
    assert.equal(svc.purgeDriver.running, false);
  });

  test('the service purges on its schedule and still serves unexpired packages', async () => {
    const sched = manualScheduler();
    const svc = sealedPackageService({
      storage: new InMemoryStorageProvider(), owners: registry,
      tenants: () => [ALICE], onPurgeFailure: () => { throw new Error('unexpected'); },
      scheduler: sched, now: () => NOW,
    });
    await svc.store.onPackageSealed(ALICE, sealedBody(LIVE, ALICE.tenantId, '2027-01-01T00:00:00Z'), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
    await svc.store.onPackageSealed(ALICE, sealedBody(DEAD, ALICE.tenantId, '2026-08-05T00:00:00Z'), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

    sched.fire();
    await new Promise((r) => setImmediate(r));

    assert.equal((await svc.store.get(ALICE, DEAD)).outcome, 'refused');
    assert.equal((await svc.store.get(ALICE, LIVE)).outcome, 'found');
    svc.stop();
  });
});
