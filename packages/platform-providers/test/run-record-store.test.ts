/**
 * The Run Record Store — conformance (ADR-0082 §6 step 2).
 *
 * TRACEABILITY
 *   ADR       : ADR-0082 (P-82.1, P-82.3, P-82.4, P-82.6, P-82.7, P-82.9) · ADR-0070 (P-70.3)
 *   Criteria  : C-06.6/7/8/9/11 · C-07.11 (cross-tenant refusal)
 *
 * THE PROPERTIES THAT MATTER HERE ARE THE ONES ABOUT WHAT THE STORE **CANNOT** DO. A store that
 * holds runs correctly and also quietly holds a payload, or a fetch timestamp, is the defect
 * ADR-0082 exists to prevent — and both of those pass every test written about correct behaviour.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStorageProvider } from '../src/storage/storage-provider.js';
import { tenantContext } from '../src/tenant/tenant-context.js';
import {
  RunRecordStore, RunRecordWriteRefused, RUN_RECORD_RETENTION, RUN_RECORD_CAPABILITY, RUN_RECORD_RUN,
  RUN_RECORD_EVIDENCE_RUN,
  AUTHORISING_ADR,
} from '../src/storage/run-record-store.js';
import { runRecordService } from '../src/storage/run-record-purge.js';

const ALICE = tenantContext({ tenantId: 'tnt-aaaaaaaaaaaa', tenantSlug: 'alice' });
const BOB = tenantContext({ tenantId: 'tnt-bbbbbbbbbbbb', tenantSlug: 'bob' });
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const NOW = Date.parse('2026-08-06T00:00:00Z');
const DAY = 86_400_000;

const event = (over: Partial<Parameters<RunRecordStore['onPackageAuthored']>[1]> = {}) => ({
  runId: 'run-1', packageHash: HASH, contractVersion: '1.0.0', authoredAt: '2026-08-06T00:00:00Z', ...over,
});

const store = (now = () => NOW) => {
  const storage = new InMemoryStorageProvider();
  return { storage, store: new RunRecordStore(storage, now) };
};

describe('ADR-0082 P-82.1 — the plane records its OWN act, at authoring time', () => {
  test('an authored package produces a run record readable from the same partition', async () => {
    const { store: s } = store();
    const record = await s.onPackageAuthored(ALICE, event());

    assert.equal(record.runId, 'run-1');
    assert.equal(record.packageHash, HASH);
    assert.equal(record.contractVersion, '1.0.0');
    assert.deepEqual(await s.read(ALICE, 'run-1'), record);
  });

  test('a run recorded by one tenant is NOT FOUND by another — addressing, not a predicate', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());

    // C-07.11. Bob does not get a refusal after a match; the address Bob's context constructs is a
    // different one, so there is nothing there. A flat store with a tenant predicate would agree on
    // every well-formed input and differ only on the attack.
    assert.equal(await s.read(BOB, 'run-1'), undefined);
    assert.deepEqual(await s.list(BOB), []);
  });

  test('runForPackageHash finds the run the hash names — the join R-05.28 derives on', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());

    const found = await s.runForPackageHash(ALICE, HASH);
    assert.equal(found?.runId, 'run-1');
  });

  test('runForPackageHash matches ON THE HASH, not on "there is a run" — a wrong hash finds nothing', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());

    // THE PARTITION IS NON-EMPTY AND THE ANSWER IS STILL undefined. A lookup that returned the
    // first record it saw would pass the test above and fail here, and the two differ only on this
    // case — which is why the pair exists rather than the first alone.
    assert.equal(await s.runForPackageHash(ALICE, OTHER_HASH), undefined);
  });

  test('one tenant\'s hash is NOT FOUND by another — the binding refusal cannot become an oracle (P-70.4)', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());

    // Bob names a hash that IS a real run — Alice's. Because the lookup addresses Bob's partition,
    // it is indistinguishable from a hash naming nothing, and `evidence-ingress` therefore has no
    // branch with which to tell a caller that a package exists in someone else's partition.
    assert.equal(await s.runForPackageHash(BOB, HASH), undefined);
    assert.equal(await s.runForPackageHash(BOB, OTHER_HASH), undefined);
  });

  test('a malformed hash finds nothing rather than throwing — a read refusal is never loud (P-79.6)', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());

    assert.equal(await s.runForPackageHash(ALICE, 'not-a-hash'), undefined);
    assert.equal(await s.runForPackageHash(ALICE, ''), undefined);
  });

  test('recording the same run twice is REFUSED, never silently overwritten', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());
    // Two authorings of one run id are a caller defect. An overwrite would hide it, and the second
    // record would replace the first with no trace that there had been two.
    await assert.rejects(() => s.onPackageAuthored(ALICE, event()), RunRecordWriteRefused);
  });

  test('an unbound run is refused — an unattributable run could never leave the collection', async () => {
    const { store: s } = store();
    await assert.rejects(() => s.onPackageAuthored(ALICE, event({ packageHash: 'not-a-hash' })), RunRecordWriteRefused);
    await assert.rejects(() => s.onPackageAuthored(ALICE, event({ contractVersion: '' })), RunRecordWriteRefused);
    await assert.rejects(() => s.onPackageAuthored(ALICE, event({ authoredAt: 'whenever' })), RunRecordWriteRefused);
    // `/work` answers from `list`. A record that cannot be attributed to a package can never be
    // discharged by evidence, so it would be returned forever — a permanently non-empty falsehood.
    assert.deepEqual(await s.list(ALICE), []);
  });
});

describe('ADR-0082 P-82.4 / P-82.6 — the allow-list is applied ON THE WRITE PATH', () => {
  test('a field the caller invents NEVER REACHES THE DISK', async () => {
    const { storage, store: s } = store();
    await s.onPackageAuthored(ALICE, {
      ...event(),
      // A payload, and a delivery timestamp. Both are what this store must not hold: the first
      // would make it an unauthorised C1 store (P-82.4), the second the delivery record P-70.3
      // removed. Neither is forbidden by name anywhere — the record is CONSTRUCTED field by field,
      // so being un-forbidden is not enough to survive.
      screenshot: 'data:image/png;base64,AAAA',
      fetchedAt: '2026-08-06T01:00:00Z',
    } as never);

    const raw = await storage.getText(ALICE, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: 'run-1' });
    assert.ok(raw, 'the record was written');
    // Scrubbing on egress protects the API; scrubbing on write protects the DISK. This asserts the
    // bytes, not the returned object — an egress filter would pass an assertion on the return value.
    assert.equal(raw.includes('screenshot'), false, 'no payload reached the disk');
    assert.equal(raw.includes('fetchedAt'), false, 'no delivery state reached the disk');
    assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),
      ['authoredAt', 'contractVersion', 'packageHash', 'recordedAtMs', 'runId']);
  });

  test('the write surface enumerates its EVENTS — there is no general record()', () => {
    const { store: s } = store();
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(s));
    // P-82.9. A general `record()` or an options bag carrying a discriminator lets a third cause
    // enter silently; a third cause must need a THIRD METHOD, which is visible in a diff.
    for (const forbidden of ['record', 'save', 'put', 'write']) {
      assert.equal(surface.includes(forbidden), false, `the store must not expose a general ${forbidden}()`);
    }
    assert.ok(surface.includes('onPackageAuthored'), 'the write method is named for its cause');
    assert.ok(surface.includes('onEvidenceArrived'), 'the second write method is named for its cause');

    // P-82.9 rules the surface at EXACTLY TWO write methods. Asserting the two by name is not the
    // same as asserting there is no third: this counts what is actually there, so a third event
    // added later fails here rather than passing because nobody updated the list.
    const writes = surface.filter((m) => m.startsWith('on'));
    assert.deepEqual(writes.sort(), ['onEvidenceArrived', 'onPackageAuthored']);
  });
});

describe('ADR-0082 P-82.2 / §6 step 3 — evidence arriving is what SUBTRACTS', () => {
  const reference = {
    evidenceId: 'ev-1', contentHashRef: 'c'.repeat(64), classification: 'C2',
    capturedAt: '2026-08-06T00:00:00Z', assuranceState: 'CERTIFIED', outcome: 'captured',
  };
  const arrival = (over: Record<string, unknown> = {}) => ({
    runId: 'run-1', packageHash: HASH, contractVersion: '1.0.0', reference, ...over,
  });

  test('a run with no evidence is OUTSTANDING; the same run after evidence arrives is NOT', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());

    // BOTH DIRECTIONS IN ONE TEST, DELIBERATELY. A `/work` observed only non-empty has not been
    // shown to subtract, and a collection observed only empty has not been shown to fill.
    assert.deepEqual((await s.outstandingRuns(ALICE)).map((r) => r.runId), ['run-1']);
    await s.onEvidenceArrived(ALICE, arrival());
    assert.deepEqual(await s.outstandingRuns(ALICE), []);
  });

  test('evidence for a run that does not exist is REFUSED — unattributable evidence subtracts nothing', async () => {
    const { store: s } = store();
    await assert.rejects(
      () => s.onEvidenceArrived(ALICE, arrival()),
      (e: Error) => e.name === 'RunRecordWriteRefused' && /no run "run-1"/.test(e.message),
    );
  });

  test('evidence citing a packageHash that is not that run\'s is REFUSED — the run record is the authority', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());
    // The run exists and the hash is well-formed; only the AGREEMENT fails. Without this check the
    // two caller-supplied fields are independent and evidence for one run can cite another's package.
    await assert.rejects(
      () => s.onEvidenceArrived(ALICE, arrival({ packageHash: OTHER_HASH })),
      (e: Error) => e.name === 'RunRecordWriteRefused' && /not that run's/.test(e.message),
    );
    assert.deepEqual((await s.outstandingRuns(ALICE)).map((r) => r.runId), ['run-1']);
  });

  test('another tenant cannot attach evidence to a run it does not have — addressing, not a predicate', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());
    await assert.rejects(
      () => s.onEvidenceArrived(BOB, arrival()),
      (e: Error) => e.name === 'RunRecordWriteRefused',
    );
    // AND ALICE'S RUN IS UNAFFECTED — a refused cross-tenant write must not subtract from the owner.
    assert.deepEqual((await s.outstandingRuns(ALICE)).map((r) => r.runId), ['run-1']);
  });

  test('a repeated arrival is IDEMPOTENT — the record is unchanged and the timestamp does not move', async () => {
    let t = NOW;
    const { storage, store: s } = store(() => t);
    await s.onPackageAuthored(ALICE, event());

    const first = await s.onEvidenceArrived(ALICE, arrival());
    assert.equal(first.alreadyRecorded, false);
    const bytes = await storage.getText(ALICE, {
      capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN, artefact: 'run-1',
    });

    t = NOW + 5 * DAY;   // the clock MOVES between the two arrivals
    const second = await s.onEvidenceArrived(ALICE, arrival());
    assert.equal(second.alreadyRecorded, true);
    assert.equal(second.record.recordedAtMs, NOW);
    // A retry that moved the arrival timestamp would extend retention by being announced again.
    assert.equal(await storage.getText(ALICE, {
      capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN, artefact: 'run-1',
    }), bytes);
  });

  test('a payload attached to the reference NEVER REACHES THE DISK — the allow-list rebuilds the handle', async () => {
    const { storage, store: s } = store();
    await s.onPackageAuthored(ALICE, event());
    await s.onEvidenceArrived(ALICE, arrival({
      reference: { ...reference, content: 'a screenshot', body: 'secret' },
    } as never));

    const raw = await storage.getText(ALICE, {
      capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN, artefact: 'run-1',
    });
    // P-82.4 is a CONDITION ON THE STORE'S EXISTENCE, not a style note: a persisted payload makes
    // this an unauthorised C1 store. A `{...reference}` spread would pass every other test here.
    assert.doesNotMatch(raw!, /screenshot/);
    assert.doesNotMatch(raw!, /secret/);
    assert.equal(JSON.parse(raw!).reference.evidenceId, 'ev-1');
  });

  test('the tenant slug is taken from the CONTEXT, never from the event', async () => {
    const { store: s } = store();
    await s.onPackageAuthored(ALICE, event());
    const { record } = await s.onEvidenceArrived(ALICE, arrival({ tenantSlug: 'bob' } as never));
    assert.equal(record.tenantSlug, 'alice');
  });

  test('evidence is purged WITH its run, and an ORPHANED evidence record is purged too', async () => {
    let t = NOW;
    const { storage, store: s } = store(() => t);
    await s.onPackageAuthored(ALICE, event());
    await s.onEvidenceArrived(ALICE, arrival());

    // An orphan: evidence whose run record is gone. Reachable in production when a purge is
    // interrupted, and NEVER reachable by a sweep that iterates over runs.
    await storage.delete(ALICE, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: 'run-1' });
    await s.purgeExpired(ALICE);

    assert.equal(await s.evidenceFor(ALICE, 'run-1'), undefined);
    assert.equal(await storage.getText(ALICE, {
      capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN, artefact: 'run-1',
    }), undefined);
    void t;
  });

  test('C-06.14 — after retention expires BOTH records are unreadable and the bytes are gone', async () => {
    let t = NOW;
    const { storage, store: s } = store(() => t);
    await s.onPackageAuthored(ALICE, event());
    await s.onEvidenceArrived(ALICE, arrival());

    t = NOW + 91 * DAY;
    await s.purgeExpired(ALICE);

    assert.equal(await s.read(ALICE, 'run-1'), undefined);
    assert.equal(await s.evidenceFor(ALICE, 'run-1'), undefined);
    assert.deepEqual(await storage.list(ALICE, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN }), []);
    assert.deepEqual(await storage.list(ALICE, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN }), []);
  });
});

describe('ADR-0082 P-82.7 — retention is DECLARED, READ BY CODE, and DRIVEN', () => {
  test('the declared retention is the C3 ceiling and names its authorising ADR', () => {
    assert.equal(RUN_RECORD_RETENTION.classification, 'C3');
    assert.equal(RUN_RECORD_RETENTION.maxRetentionDays, 90);
    assert.equal(RUN_RECORD_RETENTION.authorisingAdr, AUTHORISING_ADR);
    assert.equal(AUTHORISING_ADR, 'ADR-0082');
  });

  test('retention is read by code — the expiry MOVES when the constant moves', async () => {
    const { store: s } = store();
    const record = await s.onPackageAuthored(ALICE, event());
    // C-06.7. A retention constant with no reader is configuration theatre; this ties the declared
    // number to the computed expiry, so a change to one that does not move the other fails here.
    assert.equal(s.retentionExpiryFor(record), NOW + RUN_RECORD_RETENTION.maxRetentionDays * DAY);
  });

  test('a caller-supplied authoredAt CANNOT extend retention', async () => {
    const { store: s } = store();
    // A far-future authoring timestamp. Retention runs from when the STORE recorded it, so a caller
    // cannot buy itself indefinite retention by lying about when it authored.
    const record = await s.onPackageAuthored(ALICE, event({ authoredAt: '2099-01-01T00:00:00Z' }));
    assert.equal(s.retentionExpiryFor(record), NOW + RUN_RECORD_RETENTION.maxRetentionDays * DAY);
  });

  test('C-06.8 — after purge the record is UNREADABLE and the bytes are gone', async () => {
    let clock = NOW;
    const { storage, store: s } = store(() => clock);
    await s.onPackageAuthored(ALICE, event());
    await s.onPackageAuthored(ALICE, event({ runId: 'run-2', packageHash: OTHER_HASH }));

    clock = NOW + 91 * DAY;
    const purged = await s.purgeExpired(ALICE);

    assert.deepEqual([...purged].sort(), ['run-1', 'run-2']);
    assert.equal(await s.read(ALICE, 'run-1'), undefined);
    // Not merely unreadable through the store's own accessor — gone from the provider.
    assert.equal(
      await storage.getText(ALICE, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: 'run-1' }),
      undefined,
    );
    assert.deepEqual(await s.list(ALICE), []);
  });

  test('a record inside its retention SURVIVES the sweep — the purge is not a truncation', async () => {
    let clock = NOW;
    const { store: s } = store(() => clock);
    await s.onPackageAuthored(ALICE, event());
    clock = NOW + 89 * DAY;
    assert.deepEqual(await s.purgeExpired(ALICE), []);
    assert.ok(await s.read(ALICE, 'run-1'));
  });

  test('the service factory STARTS the driver before it returns — the store is never unguarded', () => {
    const svc = runRecordService({
      storage: new InMemoryStorageProvider(),
      tenants: () => [ALICE],
      onPurgeFailure: () => {},
      scheduler: { every: (_ms, _fn) => ({ stop: () => {} }) },
    });
    // R-06.13. A purge METHOD says nothing about whether anything drives it — that is the exact
    // defect ADR-0079 found and this store reuses the repair rather than re-learning it.
    assert.equal(svc.purgeDriver.running, true);
    svc.stop();
    assert.equal(svc.purgeDriver.running, false);
  });

  test('a purge failure ALERTS and the sweep continues to the next tenant (R-06.15)', async () => {
    const exploding = new InMemoryStorageProvider();
    const alerts: string[] = [];
    const original = exploding.list.bind(exploding);
    exploding.list = async (ctx, prefix) => {
      if (ctx.tenantSlug === 'alice') throw new Error('storage unavailable');
      return original(ctx, prefix);
    };
    const svc = runRecordService({
      storage: exploding,
      tenants: () => [ALICE, BOB],
      onPurgeFailure: (slug) => alerts.push(slug),
      scheduler: { every: () => ({ stop: () => {} }) },
    });

    const outcome = await svc.purgeDriver.sweep();
    // One tenant's storage fault must not stop retention for every other tenant — and must not pass
    // unnoticed either. A bare `catch {}` here satisfies "the sweep continues" and nothing else.
    assert.deepEqual(alerts, ['alice']);
    assert.equal(outcome.sweptTenants, 2);
    assert.equal(outcome.failures.length, 1);
    svc.stop();
  });
});

describe('ADR-0082 P-82.3 — nothing changes when a package is re-fetched', () => {
  test('the store has NO WAY to record a fetch, which is the property rather than the absence of a feature', async () => {
    const { storage, store: s } = store();
    await s.onPackageAuthored(ALICE, event());
    const before = await storage.getText(ALICE, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: 'run-1' });

    // Reading is the closest thing to a fetch this store offers, and it is idempotent on disk.
    await s.read(ALICE, 'run-1');
    await s.read(ALICE, 'run-1');
    await s.list(ALICE);

    const after = await storage.getText(ALICE, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: 'run-1' });
    // THE DISCRIMINATOR, AS A TEST: ask what changes when an EP re-fetches a package it already
    // holds. Under a delivery record something changes — and that is the defect. Here, nothing.
    assert.equal(after, before);
  });
});
