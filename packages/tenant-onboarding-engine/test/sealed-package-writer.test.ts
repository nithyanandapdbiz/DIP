/**
 * THE WRITER — ADR-0081 §6 step 3, and the first time in this programme that a package this plane
 * authored is written to the store and retrieved back.
 *
 * THE POSITIVE CONTROL IS FIRST AND IS THE POINT. Every refusal below is only readable because the
 * round trip works: a suite in which everything refuses proves that something refuses.
 *
 * TRACEABILITY: ADR-0081 (P-81.1, P-81.2, P-81.5) · ADR-0079 (P-79.2, P-79.6) ·
 *   ADR-0082 (the publication gate, P-82.9's write surface) · D-122 · D-121.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryStorageProvider, SealedPackageStore, tenantContext } from '@dbiz/platform-providers';
import {
  TenantConfigRepository, FileTenantConfigStore, tenantOwnershipResolver,
  createSealedPackageWriter, PackagePublicationRefused, handlePackageRetrieval, epPrincipal,
  type PublicationVerdict,
} from '../src/index.js';

const HASH_RE = /^[0-9a-f]{64}$/;

/** All three governance-triad legs judged — the shape `decidePublication()` returns when admissible. */
const ADMISSIBLE: PublicationVerdict = {
  admissible: true,
  basis: 'governance-triad',
  legs: [
    { stage: 'architecture-review', disposition: 'judged', reason: 'ok' },
    { stage: 'policy-review', disposition: 'judged', reason: 'ok' },
    { stage: 'guardrail-review', disposition: 'judged', reason: 'ok' },
  ],
  judged: 3,
  unjudged: 0,
  reason: 'admissible: all 3 governance-triad leg(s) judged.',
};

/** One leg not-applicable — never approval (CHARTER §17.1). */
const NOT_ADMISSIBLE: PublicationVerdict = {
  ...ADMISSIBLE,
  admissible: false,
  legs: [...ADMISSIBLE.legs.slice(1), { stage: 'architecture-review', disposition: 'not-applicable', reason: 'nothing to review' }],
  judged: 2,
  unjudged: 1,
  reason: 'not admissible: 1 of 3 governance-triad leg(s) did not judge — architecture-review (not-applicable)',
};

const signature = { algorithm: 'ed25519', keyId: 'sig-1', value: 'c2ln' };

function conformingPackage(tenantId: string, hash: string): Record<string, unknown> {
  return {
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
      authoredBy: 'functional-testing',
      tenantId,
      authoredAt: '2026-08-01T00:00:00Z',
      contractVersion: '1.0.0',
      signingKeyId: 'key-1',
      contentHash: { algorithm: 'sha256-jcs-v1', domain: 'dbiz.execution-package@1', value: hash },
    },
    validity: { notBefore: '2026-08-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z', reusableWhileUnavailable: true },
  };
}

function world() {
  const root = mkdtempSync(join(tmpdir(), 'writer-'));
  const repo = new TenantConfigRepository(new FileTenantConfigStore(root));
  const env = repo.createFromWelcome({ tenantName: 'Acme', organisationName: 'Acme', primaryAdministrator: 'Ann' } as never);
  const storage = new InMemoryStorageProvider();
  const store = new SealedPackageStore(storage, tenantOwnershipResolver(repo), () => Date.parse('2026-08-06T00:00:00Z'));
  const writer = createSealedPackageWriter({ repo, store });
  return { root, repo, store, storage, writer, slug: env.onboarding.slug, tenantId: env.onboarding.tenantId };
}

describe('the sealed package writer — the store finally has one', () => {
  // ── THE POSITIVE CONTROL, AND IT IS THE HEADLINE ──────────────────────────────────────────
  test('CONTROL — a conforming package is PUBLISHED and RETRIEVED BACK through the route', async () => {
    const w = world();
    try {
      const hash = 'a'.repeat(64);
      const published = await w.writer.onPackageSealed({
        runId: 'run-1',
        package: conformingPackage(w.tenantId, hash),
        signature,
        verdict: ADMISSIBLE,
      });
      assert.match(published.hash, HASH_RE);
      assert.equal(published.hash, hash);
      assert.equal(published.tenantSlug, w.slug);
      // CONDITION 2 OF THE PUBLICATION GATE: what it was admitted ON travels with the result.
      assert.equal(published.admittedOn.judged, 3);
      assert.equal(published.admittedOn.basis, 'governance-triad');

      // AND THE EXECUTION PLANE CAN RETRIEVE IT — through the real route, with an EP principal.
      const res = await handlePackageRetrieval(
        { method: 'GET', path: `/api/packages/${hash}`, principal: epPrincipal(w.slug, w.repo.epTokenVersion(w.slug)) },
        { repo: w.repo, store: w.store },
      );
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const body = res.body as { package: { provenance: { contentHash: { value: string } } }; signature: { algorithm: string } };
      assert.equal(body.package.provenance.contentHash.value, hash);
      assert.equal(body.signature.algorithm, 'ed25519');
    } finally {
      rmSync(w.root, { recursive: true, force: true });
    }
  });

  // ── THE PUBLICATION GATE ──────────────────────────────────────────────────────────────────
  test('a NOT-ADMISSIBLE verdict refuses BEFORE anything is parsed, resolved or written', async () => {
    const w = world();
    try {
      const hash = 'b'.repeat(64);
      await assert.rejects(
        () => w.writer.onPackageSealed({ runId: 'run-1', package: conformingPackage(w.tenantId, hash), signature, verdict: NOT_ADMISSIBLE }),
        (e: Error) => e instanceof PackagePublicationRefused && /did not judge/.test(e.message),
      );
      // NOTHING WAS WRITTEN. A refused publication leaves the store byte-identical.
      const got = await w.store.get(tenantContext({ tenantId: w.tenantId, tenantSlug: w.slug }), hash);
      assert.equal(got.outcome, 'refused');
    } finally {
      rmSync(w.root, { recursive: true, force: true });
    }
  });

  // ── P-81.5 — THE WRITER PARSES BEFORE IT PUTS ─────────────────────────────────────────────
  test('P-81.5 — a package that does not satisfy the contract is REFUSED, and never stored', async () => {
    const w = world();
    try {
      // The gateway's shape: `contentHash` at the top level, NO `provenance` — the exact artefact
      // D-121 measured, which the store refuses on its first field and which nothing could detect
      // for as long as nothing called the store.
      const gatewayShaped = {
        packageId: 'pkg-func-abc', tenantId: w.tenantId, capability: 'functional-testing',
        contractVersion: '1.0.0', proceed: true, operations: [],
        contentHash: { algorithm: 'sha256', value: 'c'.repeat(64) },
      };
      await assert.rejects(
        () => w.writer.onPackageSealed({ runId: 'run-1', package: gatewayShaped, signature, verdict: ADMISSIBLE }),
        (e: Error) => e instanceof PackagePublicationRefused && /does not satisfy the published contract/.test(e.message),
      );
    } finally {
      rmSync(w.root, { recursive: true, force: true });
    }
  });

  // ── P-79.2 — OWNERSHIP RESOLVES THROUGH THE REGISTRY, FAIL-CLOSED ─────────────────────────
  test('a package whose provenance.tenantId resolves to no tenant is REFUSED', async () => {
    const w = world();
    try {
      await assert.rejects(
        () => w.writer.onPackageSealed({
          runId: 'run-1',
          package: conformingPackage('tnt-000000000000', 'd'.repeat(64)),
          signature,
          verdict: ADMISSIBLE,
        }),
        (e: Error) => e instanceof PackagePublicationRefused && /does not resolve to exactly one tenant/.test(e.message),
      );
    } finally {
      rmSync(w.root, { recursive: true, force: true });
    }
  });

  // ── THE SIGNATURE IS NOT OPTIONAL ─────────────────────────────────────────────────────────
  test('publication without a usable signature is REFUSED by the store, loudly', async () => {
    const w = world();
    try {
      await assert.rejects(
        () => w.writer.onPackageSealed({
          runId: 'run-1',
          package: conformingPackage(w.tenantId, 'e'.repeat(64)),
          signature: undefined,
          verdict: ADMISSIBLE,
        }),
        /detached signature/,
      );
    } finally {
      rmSync(w.root, { recursive: true, force: true });
    }
  });

  // ── P-82.9's DISCIPLINE, ASSERTED RATHER THAN LEFT TO REVIEW ──────────────────────────────
  test('the write surface enumerates ONE event and offers no general write', () => {
    const w = world();
    try {
      const surface = Object.keys(w.writer);
      assert.deepEqual(surface, ['onPackageSealed']);
      // A general `write`/`put`/`save`, or an options bag carrying a discriminator, is how a third
      // CAUSE enters a store that looks like it only holds packages. A third cause needs a third
      // method — visible in a diff, and an ADR amendment.
      for (const forbidden of ['write', 'put', 'save', 'record']) {
        assert.ok(!(forbidden in w.writer), `the writer exposes a general \`${forbidden}\``);
      }
    } finally {
      rmSync(w.root, { recursive: true, force: true });
    }
  });
});
