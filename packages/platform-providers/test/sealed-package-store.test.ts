/**
 * Sealed Package Store conformance (ADR-0079).
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md (R-06.4/5/9/12/13/14) · 07-tenant-isolation.md (R-07.1)
 *   ADR          : ADR-0079 P-79.1–P-79.9 · ADR-0070 P-70.4 · ADR-0078 P-78.2
 *   Criteria     : C-06.3 · C-06.6 · C-06.7 · C-06.8 · C-06.11 · C-07.11
 *
 * THE TWO COMPLETION CONDITIONS ADR-0079 §6 STEP 2 NAMES ARE HERE, not deferred:
 *   (a) the OFFBOARDING ORACLE — store, delete the tenant, retrieve: byte-identical refusal;
 *   (b) the WRITE-TIME OWNERSHIP ASSERTION proved failing, on both the wrong-partition and the
 *       ambiguous-resolution paths.
 *
 * An untested guarantee is an assertion (R-13.7 clause 1).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { tenantContext } from '../src/tenant/tenant-context.js';
import { InMemoryStorageProvider } from '../src/storage/storage-provider.js';
import type { StorageProvider, ArtefactKey } from '../src/storage/storage-provider.js';
import type { TenantContext } from '../src/tenant/tenant-context.js';
import {
  SealedPackageStore, SealedPackageWriteRefused, sealedPackageRefusal,
  AUTHORISING_ADR, SEALED_PACKAGE_RETENTION,
} from '../src/storage/sealed-package-store.js';
import type { TenantOwnershipResolver } from '../src/storage/sealed-package-store.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_ABSENT = 'c'.repeat(64);

const ALICE = tenantContext({ tenantId: 'tnt-aaaaaaaaaaaa', tenantSlug: 'alice-co' });
const BOB = tenantContext({ tenantId: 'tnt-bbbbbbbbbbbb', tenantSlug: 'bob-ltd' });

/**
 * A registry stand-in with the FAIL-CLOSED semantics the port's contract requires:
 * exactly one match, or `undefined`. Mirrors `resolveSlugByTenantId` (registration.ts:430),
 * never `knownTenant`'s first-match.
 */
class FakeRegistry implements TenantOwnershipResolver {
  private readonly rows: { tenantId: string; slug: string }[] = [];
  add(tenantId: string, slug: string): this { this.rows.push({ tenantId, slug }); return this; }
  /** Offboarding: `repo.delete(slug)` removes the directory outright. */
  delete(slug: string): void {
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i]!.slug === slug) this.rows.splice(i, 1);
  }
  resolveSlugByTenantId(tenantId: string): string | undefined {
    const hits = this.rows.filter((r) => r.tenantId === tenantId);
    return hits.length === 1 ? hits[0]!.slug : undefined;
  }
}

function sealedBody(opts: {
  hash: string; tenantId: string; notAfter?: string;
}): string {
  return JSON.stringify({
    contractVersion: '1.0.0',
    runId: 'run-1',
    correlationId: 'cor-1',
    capabilityId: 'functional-testing',
    proceed: true,
    operations: [],
    directives: { timeoutMs: 1000, maxAttempts: 1, maxConcurrency: 1, mode: 'dry-run' },
    gates: [],
    evidenceRequirements: [],
    provenance: {
      authoredBy: 'ip',
      tenantId: opts.tenantId,
      authoredAt: '2026-08-01T00:00:00Z',
      contractVersion: '1.0.0',
      signingKeyId: 'key-1',
      contentHash: { algorithm: 'sha256', domain: 'execution-package', value: opts.hash },
    },
    validity: {
      notBefore: '2026-08-01T00:00:00Z',
      notAfter: opts.notAfter ?? '2027-01-01T00:00:00Z',
      reusableWhileUnavailable: true,
    },
  });
}

const NOW = Date.parse('2026-08-06T00:00:00Z');

function newStore(registry: FakeRegistry, now = () => NOW) {
  return { store: new SealedPackageStore(new InMemoryStorageProvider(), registry, now), registry };
}

// ── P-79.3 / R-06.5 / C-06.3 — the authorisation is in source ───────────────────────────────
test('the authorising ADR is recorded in the storing module itself (R-06.5, C-06.3)', () => {
  assert.equal(AUTHORISING_ADR, 'ADR-0079');
  assert.equal(SEALED_PACKAGE_RETENTION.authorisingAdr, 'ADR-0079');
});

// ── P-79.4 / R-06.9 / R-06.12 — retention declared AND read ─────────────────────────────────
test('retention is declared and the declared value is READ BY CODE (R-06.9, R-06.12, C-06.7)', () => {
  const { store } = newStore(new FakeRegistry());
  assert.equal(SEALED_PACKAGE_RETENTION.maxRetentionDays, 90);
  assert.equal(SEALED_PACKAGE_RETENTION.classification, 'C3');

  // A package whose contractual notAfter is BEYOND the C3 ceiling is bounded by the ceiling.
  const farFuture = { provenance: { tenantId: 'x', contentHash: { value: HASH_A } },
    validity: { notAfter: '2099-01-01T00:00:00Z' } };
  const ceiling = NOW + 90 * 86_400_000;
  assert.equal(store.retentionExpiryFor(farFuture, NOW), ceiling,
    'the C3 ceiling must bound a package that declares a longer validity');

  // A package that expires SOONER than the ceiling is bounded by its own contract (R-22.5).
  const soon = { provenance: { tenantId: 'x', contentHash: { value: HASH_A } },
    validity: { notAfter: '2026-08-10T00:00:00Z' } };
  assert.equal(store.retentionExpiryFor(soon, NOW), Date.parse('2026-08-10T00:00:00Z'),
    'the store takes the EARLIER of the two bounds');
});

// ── P-79.2 — the happy path, and the partition it writes into ───────────────────────────────
test('a package is stored into, and served from, its owning tenant partition', async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug);
  const { store } = newStore(registry);

  const body = sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId });
  assert.equal(await store.onPackageSealed(ALICE, body, JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' })), HASH_A);

  const got = await store.get(ALICE, HASH_A);
  assert.equal(got.outcome, 'found');
  assert.equal(got.outcome === 'found' ? got.body : '', body);
});

test('retrieval is idempotent and leaves the store byte-identical (P-79.7, R-05.21)', async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug);
  const { store } = newStore(registry);
  await store.onPackageSealed(ALICE, sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

  const first = await store.get(ALICE, HASH_A);
  const second = await store.get(ALICE, HASH_A);
  assert.deepEqual(first, second, 'a read must record nothing that a later read could observe');
});

// ── P-79.2 / P-79.8 — the write-time ownership assertion, PROVED FAILING ─────────────────────
test("a package whose provenance.tenantId belongs to another partition is a WRITE refusal", async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug).add(BOB.tenantId, BOB.tenantSlug);
  const { store } = newStore(registry);

  await assert.rejects(
    () => store.onPackageSealed(ALICE, sealedBody({ hash: HASH_B, tenantId: BOB.tenantId }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' })),
    SealedPackageWriteRefused,
    'Bob\'s package must never enter Alice\'s partition',
  );
  // And it did not enter the store under either identity.
  assert.equal((await store.get(ALICE, HASH_B)).outcome, 'refused');
});

test('a provenance.tenantId that resolves AMBIGUOUSLY is a write refusal, never a first-match', async () => {
  // Two tenants sharing one opaque id — the invariant importJson enforces but a security-critical
  // resolver must not assume. `knownTenant` would return the first; this must return neither.
  const registry = new FakeRegistry().add('tnt-dddddddddddd', 'first-co').add('tnt-dddddddddddd', 'second-co');
  const { store } = newStore(registry);
  const ctx = tenantContext({ tenantId: 'tnt-dddddddddddd', tenantSlug: 'first-co' });

  await assert.rejects(
    () => store.onPackageSealed(ctx, sealedBody({ hash: HASH_A, tenantId: 'tnt-dddddddddddd' }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' })),
    SealedPackageWriteRefused,
    'resolving ambiguously is a refusal, not a first-match',
  );
});

test('a package whose tenant is unknown to the registry is a write refusal', async () => {
  const { store } = newStore(new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug));
  await assert.rejects(
    () => store.onPackageSealed(ALICE, sealedBody({ hash: HASH_A, tenantId: 'tnt-999999999999' }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' })),
    SealedPackageWriteRefused,
  );
});

// ── P-79.6 — ONE REFUSAL EXPRESSION. The four states, each byte-identical. ───────────────────
//
// If (4) is distinguishable from (1), P-79.6's single expression has a hole and the oracle
// P-70.4 exists to close is open.
test('P-79.6: unknown, cross-tenant, expired and OFFBOARDED refuse byte-identically', async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug).add(BOB.tenantId, BOB.tenantSlug);
  const { store } = newStore(registry);

  // (1) unknown hash — nothing was ever stored at this address.
  const unknown = await store.get(ALICE, HASH_ABSENT);

  // (2) a valid hash owned by ANOTHER tenant. Stored correctly into Bob's partition, then
  //     requested by Alice. Under P-79.2 it is NOT FOUND rather than found-and-refused.
  await store.onPackageSealed(BOB, sealedBody({ hash: HASH_B, tenantId: BOB.tenantId }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  const crossTenant = await store.get(ALICE, HASH_B);

  // (3) a valid hash in the caller's own partition, past notAfter.
  const expiredHash = 'e'.repeat(64);
  await store.onPackageSealed(ALICE, sealedBody({
    hash: expiredHash, tenantId: ALICE.tenantId, notAfter: '2026-08-05T00:00:00Z',
  }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  const expired = await store.get(ALICE, expiredHash);

  // (4) THE OFFBOARDING CASE. Stored legitimately, then the tenant is deleted after storage.
  //     This is a REAL retrieval-time occurrence of ADR-0079 §5.2's fifth condition, and it
  //     arrives through the one path nobody would think to test for it.
  const offboardHash = 'f'.repeat(64);
  await store.onPackageSealed(ALICE, sealedBody({ hash: offboardHash, tenantId: ALICE.tenantId }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  registry.delete(ALICE.tenantSlug);
  const offboarded = await store.get(ALICE, offboardHash);

  for (const [label, r] of [['unknown', unknown], ['cross-tenant', crossTenant],
    ['expired', expired], ['offboarded', offboarded]] as const) {
    assert.equal(r.outcome, 'refused', `${label} must refuse`);
  }

  // The refusal differs ONLY by the hash the caller themselves supplied — nothing else leaks.
  assert.equal(unknown.outcome === 'refused' ? unknown.refusal : '', sealedPackageRefusal(HASH_ABSENT));
  assert.equal(crossTenant.outcome === 'refused' ? crossTenant.refusal : '', sealedPackageRefusal(HASH_B));
  assert.equal(expired.outcome === 'refused' ? expired.refusal : '', sealedPackageRefusal(expiredHash));
  assert.equal(offboarded.outcome === 'refused' ? offboarded.refusal : '', sealedPackageRefusal(offboardHash));

  // And the SHAPE is identical: same keys, same outcome, no extra field to branch on.
  const shapes = [unknown, crossTenant, expired, offboarded].map((r) => JSON.stringify(Object.keys(r).sort()));
  assert.equal(new Set(shapes).size, 1, 'every refusal must have an identical shape');

  // The decisive assertion: substitute a common hash and the four refusals are the SAME BYTES.
  const normalised = [unknown, crossTenant, expired, offboarded].map((r) =>
    r.outcome === 'refused'
      ? r.refusal.replace(HASH_ABSENT, 'H').replace(HASH_B, 'H').replace(expiredHash, 'H').replace(offboardHash, 'H')
      : 'FOUND');
  assert.equal(new Set(normalised).size, 1,
    `the four refusals are distinguishable: ${JSON.stringify(normalised)}`);
});

test('the cross-tenant negative fails by NOT FINDING, never by finding and refusing (P-79.2)', async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug).add(BOB.tenantId, BOB.tenantSlug);
  const storage = new InMemoryStorageProvider();
  const store = new SealedPackageStore(storage, registry, () => NOW);

  await store.onPackageSealed(BOB, sealedBody({ hash: HASH_B, tenantId: BOB.tenantId }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

  // Bob's package IS in the store — proving the refusal below is not a vacuous pass.
  assert.equal((await store.get(BOB, HASH_B)).outcome, 'found');

  // Alice's context cannot construct the address Bob's package lives at. The proof that this is
  // ADDRESSING and not a PREDICATE: the storage layer itself has nothing at Alice's key.
  assert.equal(await storage.exists(ALICE, { capability: 'packages', run: 'sealed', artefact: HASH_B }), false,
    'the package must be absent AT ALICE\'S ADDRESS — not present-and-refused');
  assert.equal((await store.get(ALICE, HASH_B)).outcome, 'refused');
});

// ── P-79.4 / R-06.13 / R-06.14 / C-06.8 — purge, and the unreadability proof ────────────────
test('scheduled purge removes expired packages and the data is UNREADABLE afterwards (R-06.14, C-06.8)', async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug);
  const storage = new InMemoryStorageProvider();
  const store = new SealedPackageStore(storage, registry, () => NOW);

  const liveHash = HASH_A;
  const deadHash = 'd'.repeat(64);
  await store.onPackageSealed(ALICE, sealedBody({ hash: liveHash, tenantId: ALICE.tenantId }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  await store.onPackageSealed(ALICE, sealedBody({ hash: deadHash, tenantId: ALICE.tenantId, notAfter: '2026-08-05T00:00:00Z' }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

  const purged = await store.purgeExpired(ALICE, NOW);
  assert.deepEqual([...purged], [deadHash], 'exactly the expired package is purged');

  // Unreadable through the store...
  assert.equal((await store.get(ALICE, deadHash)).outcome, 'refused');
  // ...AND the bytes are gone from the provider, not merely hidden behind a check.
  assert.equal(await storage.exists(ALICE, { capability: 'packages', run: 'sealed', artefact: deadHash }), false);
  // The unexpired one survives — a purge that removed everything would pass vacuously.
  assert.equal((await store.get(ALICE, liveHash)).outcome, 'found');
});

test('purge is keyed to retention, NEVER to delivery state (P-79.4, alternative E)', async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug);
  const { store } = newStore(registry);
  await store.onPackageSealed(ALICE, sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

  // Fetch it repeatedly — a delivery-keyed store would purge or mark after the first.
  await store.get(ALICE, HASH_A);
  await store.get(ALICE, HASH_A);
  assert.deepEqual([...await store.purgeExpired(ALICE, NOW)], [],
    'having been fetched must not make a package purgeable');
  assert.equal((await store.get(ALICE, HASH_A)).outcome, 'found');
});

// ── P-79.5 — nothing derived, nothing beyond the sealed body ────────────────────────────────
test('the store persists the sealed body and nothing else (P-79.5)', async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug);
  const storage = new InMemoryStorageProvider();
  const store = new SealedPackageStore(storage, registry, () => NOW);

  const body = sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId });
  await store.onPackageSealed(ALICE, body, JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

  const names = await storage.list(ALICE, { capability: 'packages', run: 'sealed' });
  assert.deepEqual([...names], [HASH_A], 'no index, no extracted tenant column, no cached parse');

  const raw = await storage.getText(ALICE, { capability: 'packages', run: 'sealed', artefact: HASH_A });
  assert.equal(raw, body, 'the stored bytes are the sealed body, unmodified');
});

test('the key is tenant-leading, so purge remains a prefix operation (ADR-0010 §6)', async () => {
  const registry = new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug);
  const storage = new InMemoryStorageProvider();
  const store = new SealedPackageStore(storage, registry, () => NOW);
  await store.onPackageSealed(ALICE, sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId }), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

  await storage.purgeTenant(ALICE);
  assert.equal((await store.get(ALICE, HASH_A)).outcome, 'refused',
    'purgeTenant must reach the package through the tenant-leading prefix');
});

// ── Malformed input never becomes a distinguishable signal ──────────────────────────────────
test('a malformed hash refuses identically rather than erroring differently', async () => {
  const { store } = newStore(new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug));
  for (const bad of ['../escape', '', 'Z'.repeat(64), 'abc']) {
    const r = await store.get(ALICE, bad);
    assert.equal(r.outcome, 'refused');
    assert.equal(r.outcome === 'refused' ? r.refusal : '', sealedPackageRefusal(bad));
  }
});

test('a body with no validity.notAfter cannot be stored — no retention, no store (R-06.9)', async () => {
  const { store } = newStore(new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug));
  const body = JSON.parse(sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId })) as Record<string, unknown>;
  delete (body as { validity?: unknown }).validity;
  await assert.rejects(() => store.onPackageSealed(ALICE, JSON.stringify(body), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' })), SealedPackageWriteRefused);
});

// ── ADR-0081 P-81.1 — THE WRITE ORDERING, AND ITS FAULT PROOF ────────────────────────────────
//
// THE ORDERING IS INVISIBLE IN A GREEN SUITE. Signature-first and body-first agree on every
// successful write and differ only on a crash BETWEEN the two — so no test over a completed write
// can distinguish them, and a refactor that swaps two adjacent awaits "for readability" passes
// everything. This is the only place that observes it, and it observes it by CRASHING the storage
// provider between the writes.
const owners = (): TenantOwnershipResolver =>
  new FakeRegistry().add(ALICE.tenantId, ALICE.tenantSlug).add(BOB.tenantId, BOB.tenantSlug);

describe('P-81.1 — the body is the commit point', () => {
  /** A provider that fails the Nth write, so a crash can be placed BETWEEN the two. */
  class CrashAfter implements StorageProvider {
    readonly backend = 'memory' as const;
    private writes = 0;
    constructor(private readonly inner: StorageProvider, private readonly failOn: number) {}
    async put(ctx: TenantContext, key: ArtefactKey, body: string): Promise<void> {
      this.writes += 1;
      if (this.writes === this.failOn) throw new Error('storage crashed between the two writes');
      return this.inner.put(ctx, key, body);
    }
    get(ctx: TenantContext, key: ArtefactKey) { return this.inner.get(ctx, key); }
    getText(ctx: TenantContext, key: ArtefactKey) { return this.inner.getText(ctx, key); }
    exists(ctx: TenantContext, key: ArtefactKey) { return this.inner.exists(ctx, key); }
    list(ctx: TenantContext, prefix: { capability: string; run: string }) { return this.inner.list(ctx, prefix); }
    delete(ctx: TenantContext, key: ArtefactKey) { return this.inner.delete(ctx, key); }
    purgeTenant(ctx: TenantContext) { return this.inner.purgeTenant(ctx); }
  }

  const sig = JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' });

  // THE CONTROL. Without it a refusal below proves only that something refused.
  test('CONTROL — an uninterrupted write stores both, and the package is served', async () => {
    const inner = new InMemoryStorageProvider();
    const store = new SealedPackageStore(inner, owners(), () => Date.parse('2026-08-06T00:00:00Z'));
    await store.onPackageSealed(ALICE, sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId }), sig);
    const got = await store.get(ALICE, HASH_A);
    assert.equal(got.outcome, 'found');
    assert.equal(got.outcome === 'found' && JSON.parse(got.signature).algorithm, 'ed25519');
  });

  test('FAULT — a crash after the SIGNATURE leaves NO package, so nothing is served', async () => {
    const inner = new InMemoryStorageProvider();
    const store = new SealedPackageStore(new CrashAfter(inner, 2), owners(), () => Date.parse('2026-08-06T00:00:00Z'));
    await assert.rejects(
      () => store.onPackageSealed(ALICE, sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId }), sig),
      /storage crashed/,
    );
    // THE BRANCH UNDER TEST (R-13.7 clause 2): the SECOND write failed, so the signature landed and
    // the body did not. The residue is inert — never served — which is the property the ordering buys.
    const got = await store.get(ALICE, HASH_A);
    assert.equal(got.outcome, 'refused', 'a package with no body was served');
  });

  test('THE ORDERING IS WHY: reversing it would leave an UNVERIFIABLE package that IS found', async () => {
    // Reproduces what body-first would produce — a body with no signature — WITHOUT reordering the
    // store, by writing the body alone through the provider. This is the state P-81.1 prevents,
    // and it asserts what would happen if a future refactor swapped the two awaits.
    const inner = new InMemoryStorageProvider();
    const store = new SealedPackageStore(inner, owners(), () => Date.parse('2026-08-06T00:00:00Z'));
    await inner.put(ALICE, { capability: 'packages', run: 'sealed', artefact: HASH_A },
      sealedBody({ hash: HASH_A, tenantId: ALICE.tenantId }));

    // It refuses TODAY — because `get` requires the signature (P-81.2). The ordering is what makes
    // this state unreachable in the first place rather than merely refused after the fact:
    // removing the state beats classifying it, which is P-79.2's move and ADR-0081 P-81.1's.
    const got = await store.get(ALICE, HASH_A);
    assert.equal(got.outcome, 'refused');
  });

  test('an orphaned SIGNATURE is purged unconditionally — the sibling scheme closes its own hole', async () => {
    const inner = new InMemoryStorageProvider();
    const store = new SealedPackageStore(inner, owners(), () => Date.parse('2026-08-06T00:00:00Z'));
    await inner.put(ALICE, { capability: 'packages', run: 'signatures', artefact: HASH_A }, sig);
    assert.notEqual(await inner.getText(ALICE, { capability: 'packages', run: 'signatures', artefact: HASH_A }), undefined);

    await store.purgeExpired(ALICE, Date.parse('2026-08-06T00:00:00Z'));

    // WITHOUT THIS, SIGNATURES OUTLIVE THE PACKAGES THEY SIGN — an R-06.13/C-06.8 breach created by
    // the fix. It is closed by ENUMERATING the second segment, never by relaxing HASH_RE.
    assert.equal(await inner.getText(ALICE, { capability: 'packages', run: 'signatures', artefact: HASH_A }), undefined);
  });
});
