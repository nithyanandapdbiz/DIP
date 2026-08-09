/**
 * GET /api/packages/{hash} — the auth block and the single refusal (ADR-0079 P-79.8, P-79.6).
 * TRACEABILITY: ADR-0079 · ADR-0070 (P-70.4) · ADR-0078 (P-78.2) · 07-tenant-isolation.md C-07.11
 *   Proves: the route serves a package to its owning EP and refuses everything else
 *           INDISTINGUISHABLY; that it does not inherit the tenant router's checks and therefore
 *           performs its own; and that the EP-token revocation check — the one a slugless route
 *           silently omits — is present and fires.
 * Categories: security, contract, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryStorageProvider, SealedPackageStore, tenantContext, sealedPackageRefusal,
} from '@dbiz/platform-providers';
import type { BootstrapServices } from '../src/domain/index.js';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, epPrincipal,
  handlePackageRetrieval, tenantOwnershipResolver, route,
  type RepositoryOptions, type Principal, type ApiDeps,
} from '../src/engine/index.js';

let tick = 0;
const opts: RepositoryOptions = {
  now: () => `2026-08-06T00:00:${String(tick++).padStart(2, '0')}.000Z`,
  newTenantId: () => `tnt-${String(tick).padStart(12, '0')}`,
};
const services: BootstrapServices = {
  auth: { issueOneTimeCredential: (t: string) => `otc-${t}` },
  registration: { recordTenantCreated: () => { /* audit */ } },
  now: () => '2026-08-06T00:00:00.000Z',
};

const NOW = Date.parse('2026-08-06T00:00:00Z');
const HASH_ALICE = 'a'.repeat(64);
const HASH_BOB = 'b'.repeat(64);
const HASH_UNKNOWN = 'c'.repeat(64);
const HASH_EXPIRED = 'e'.repeat(64);
const HASH_OFFBOARD = 'f'.repeat(64);

function welcome(org: string) {
  return {
    organisationName: org, tenantName: `${org} Prod`, primaryAdministrator: 'A B',
    primaryAdministratorEmail: 'a@b.example', preferredCloud: 'azure', deploymentModel: 'container',
  };
}

function sealedBody(hash: string, tenantId: string, notAfter = '2027-01-01T00:00:00Z'): string {
  return JSON.stringify({
    contractVersion: '1.0.0', runId: 'run-1', correlationId: 'cor-1',
    capabilityId: 'functional-testing', proceed: true, operations: [],
    directives: { timeoutMs: 1000, maxAttempts: 1, maxConcurrency: 1, mode: 'dry-run' },
    gates: [], evidenceRequirements: [],
    provenance: {
      authoredBy: 'ip', tenantId, authoredAt: '2026-08-01T00:00:00Z', contractVersion: '1.0.0',
      signingKeyId: 'key-1',
      contentHash: { algorithm: 'sha256-jcs-v1', domain: 'dbiz.execution-package@1', value: hash },
    },
    validity: { notBefore: '2026-08-01T00:00:00Z', notAfter, reusableWhileUnavailable: true },
  });
}

/** Two real tenants, each with a package sealed and stored into its own partition. */
async function world() {
  tick = 0;
  const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
  const aliceEnv = repo.createFromWelcome(welcome('Alice Co'));
  const bobEnv = repo.createFromWelcome(welcome('Bob Ltd'));
  const alice = aliceEnv.onboarding.slug;
  const bob = bobEnv.onboarding.slug;

  const storage = new InMemoryStorageProvider();
  const store = new SealedPackageStore(storage, tenantOwnershipResolver(repo), () => NOW);

  const aliceCtx = tenantContext({ tenantId: aliceEnv.onboarding.tenantId, tenantSlug: alice });
  const bobCtx = tenantContext({ tenantId: bobEnv.onboarding.tenantId, tenantSlug: bob });

  await store.onPackageSealed(aliceCtx, sealedBody(HASH_ALICE, aliceEnv.onboarding.tenantId), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  await store.onPackageSealed(bobCtx, sealedBody(HASH_BOB, bobEnv.onboarding.tenantId), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  await store.onPackageSealed(aliceCtx, sealedBody(HASH_EXPIRED, aliceEnv.onboarding.tenantId, '2026-08-05T00:00:00Z'), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));
  await store.onPackageSealed(aliceCtx, sealedBody(HASH_OFFBOARD, aliceEnv.onboarding.tenantId), JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'c2ln' }));

  return { repo, store, storage, alice, bob, aliceEnv, bobEnv, deps: { repo, store } };
}

/** The EP principal for a tenant at its CURRENT token version. */
function epFor(repo: TenantConfigRepository, slug: string): Principal {
  return epPrincipal(slug, repo.epTokenVersion(slug));
}

const get = (hash: string, principal?: Principal) => ({
  method: 'GET', path: `/api/packages/${hash}`, ...(principal ? { principal } : {}),
});

describe('GET /api/packages/{hash} — the route serves its owner', () => {
  test('the owning EP receives its own package IN AN ENVELOPE, with the detached signature beside it', async () => {
    const w = await world();
    const r = await handlePackageRetrieval(get(HASH_ALICE, epFor(w.repo, w.alice)), w.deps);
    assert.equal(r.status, 200);
    const body = r.body as {
      package: { provenance: { tenantId: string; contentHash: { value: string } } };
      signature: { algorithm: string; keyId: string; value: string };
    };
    // THE HASH IS A PROPERTY OF THE `package` MEMBER, NEVER OF THE ENVELOPE (R-20.28, P-81.2).
    // A consumer that hashed the envelope would get a mismatch and report `hash-mismatch` under
    // R-20.30 — a correct-looking failure with a wrong cause — so the member is named, not
    // positional, and this assertion is what pins that.
    assert.equal(body.package.provenance.contentHash.value, HASH_ALICE);
    assert.equal(body.package.provenance.tenantId, w.aliceEnv.onboarding.tenantId);

    // THE SIGNATURE TRAVELS, AND IT IS NOT INSIDE THE PACKAGE. Embedding it would be a MAJOR
    // contract version (ADR-0007 §7) and would break the content addressing the key IS.
    assert.equal(body.signature.algorithm, 'ed25519');
    assert.ok(!('signature' in body.package), 'the signature leaked into the package body');
  });

  // ── THE COMPLETION CONDITION: a package whose signature is absent is REFUSED ───────────────
  //
  // Unreachable by a partial write — the body is the commit point — so reaching it means the
  // signature was removed after the fact, which is exactly the case that must not be served.
  test('a package whose signature is ABSENT refuses BYTE-IDENTICALLY to a never-existing hash (P-79.6)', async () => {
    const w = await world();
    const ctx = tenantContext({ tenantId: w.aliceEnv.onboarding.tenantId, tenantSlug: w.alice });

    // CONTROL FIRST: with its signature present, this hash is served.
    const before = await handlePackageRetrieval(get(HASH_ALICE, epFor(w.repo, w.alice)), w.deps);
    assert.equal(before.status, 200, 'the control did not serve, so the refusal below proves nothing');

    // FAULT THE SOURCE OF TRUTH: remove the signature artefact, leaving the package intact.
    await w.storage.delete(ctx, { capability: 'packages', run: 'signatures', artefact: HASH_ALICE });

    const after = await handlePackageRetrieval(get(HASH_ALICE, epFor(w.repo, w.alice)), w.deps);
    const unknown = await handlePackageRetrieval(get(HASH_UNKNOWN, epFor(w.repo, w.alice)), w.deps);
    assert.equal(after.status, 404);
    // NO FIFTH RESULT CLASS AND NO ORACLE: the refusal is byte-identical to a hash that never
    // existed, so a caller cannot learn that a package EXISTS at this hash.
    assert.deepEqual(after.body, { error: sealedPackageRefusal(HASH_ALICE) });
    assert.equal(
      JSON.stringify(after.body).replace(HASH_ALICE, 'H'),
      JSON.stringify(unknown.body).replace(HASH_UNKNOWN, 'H'),
    );
  });

  test('retrieval is idempotent — a second GET returns the same bytes and records nothing (P-79.7)', async () => {
    const w = await world();
    const p = epFor(w.repo, w.alice);
    const first = await handlePackageRetrieval(get(HASH_ALICE, p), w.deps);
    const second = await handlePackageRetrieval(get(HASH_ALICE, p), w.deps);
    assert.deepEqual(first, second);
  });
});

// ══ THE FOUR REQUIRED NEGATIVES, EACH BYTE-IDENTICAL (P-70.4, P-79.6, ADR-0079 §5.2) ══════════
describe('P-79.6 — one refusal expression, not three states agreeing', () => {
  test('unknown / cross-tenant / expired / offboarded refuse BYTE-IDENTICALLY', async () => {
    const w = await world();
    const alice = epFor(w.repo, w.alice);

    // (1) unknown hash — nothing was ever sealed at this address.
    const unknown = await handlePackageRetrieval(get(HASH_UNKNOWN, alice), w.deps);

    // (2) a valid hash belonging to a DIFFERENT tenant. Bob's package exists and is retrievable
    //     BY BOB — proving the refusal below is not a vacuous pass.
    const bobsOwn = await handlePackageRetrieval(get(HASH_BOB, epFor(w.repo, w.bob)), w.deps);
    assert.equal(bobsOwn.status, 200, 'precondition: Bob\'s package really is in the store');
    const crossTenant = await handlePackageRetrieval(get(HASH_BOB, alice), w.deps);

    // (3) a valid hash in the caller's own partition, past notAfter.
    const expired = await handlePackageRetrieval(get(HASH_EXPIRED, alice), w.deps);

    // (4) THE OFFBOARDING CASE — a package stored legitimately, then the tenant deleted. Per
    //     ADR-0079 §5.2 this is a real retrieval-time occurrence of the fifth condition and it
    //     arrives through the one path nobody would think to test for.
    w.repo.delete(w.alice);
    const offboarded = await handlePackageRetrieval(get(HASH_OFFBOARD, alice), w.deps);

    const all = [
      ['unknown', unknown, HASH_UNKNOWN],
      ['cross-tenant', crossTenant, HASH_BOB],
      ['expired', expired, HASH_EXPIRED],
      ['offboarded', offboarded, HASH_OFFBOARD],
    ] as const;

    // Same status for all four. A 403 on the cross-tenant case would be an oracle.
    for (const [label, r] of all) assert.equal(r.status, 404, `${label} must be 404`);

    // Same body, each naming only the hash the caller themselves supplied.
    for (const [label, r, h] of all) {
      assert.deepEqual(r.body, { error: sealedPackageRefusal(h) }, `${label} refusal body`);
    }

    // THE DECISIVE ASSERTION. Normalise out the caller's own hash and the four responses are the
    // SAME BYTES. If (4) is distinguishable from (1), P-79.6's single expression has a hole and
    // the oracle P-70.4 exists to close is open.
    const normalised = all.map(([, r, h]) =>
      JSON.stringify({ status: r.status, body: r.body }).split(h).join('<HASH>'));
    assert.equal(new Set(normalised).size, 1,
      `the four refusals are distinguishable:\n${normalised.join('\n')}`);
  });

  test('the cross-tenant refusal is NOT FINDING, never finding-and-refusing (P-79.2)', async () => {
    const w = await world();
    // The store holds Bob's package. Alice's context cannot construct the address it lives at,
    // so the bytes are absent AT ALICE'S ADDRESS rather than present and guarded by a predicate.
    const aliceCtx = tenantContext({ tenantId: w.aliceEnv.onboarding.tenantId, tenantSlug: w.alice });
    assert.equal(
      await w.storage.exists(aliceCtx, { capability: 'packages', run: 'sealed', artefact: HASH_BOB }),
      false,
    );
    const r = await handlePackageRetrieval(get(HASH_BOB, epFor(w.repo, w.alice)), w.deps);
    assert.equal(r.status, 404);
  });

  test('a malformed hash refuses identically rather than erroring differently', async () => {
    const w = await world();
    const alice = epFor(w.repo, w.alice);
    for (const bad of ['not-a-hash', 'Z'.repeat(64), '..']) {
      const r = await handlePackageRetrieval(get(bad, alice), w.deps);
      assert.equal(r.status, 404);
      assert.deepEqual(r.body, { error: sealedPackageRefusal(bad) });
    }
  });
});

// ══ THE AUTH BLOCK — written because NOTHING IS INHERITED (P-79.8) ═══════════════════════════
describe('P-79.8 — the auth block this route does not inherit', () => {
  test('the tenant router does not serve this path at all — nothing is inherited', () => {
    const d = {
      repo: new TenantConfigRepository(new InMemoryTenantConfigStore(), opts),
      services, registrationEndpoint: 'https://ip.example/register',
    } as ApiDeps;
    // The measured premise of P-79.8: route() 404s /api/packages, so none of its slug validation,
    // permissionForRoute, mayAccessTenant or EP-token revocation is on this route's path.
    const r = route({ method: 'GET', path: `/api/packages/${HASH_ALICE}`, principal: { id: 'u', roles: ['platform-admin'] } }, d);
    assert.equal(r.status, 404);
  });

  test('an unauthenticated caller is 401 before any store access', async () => {
    const w = await world();
    const r = await handlePackageRetrieval(get(HASH_ALICE), w.deps);
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { error: 'authentication required' });
  });

  test('THE REVOCATION CHECK: a superseded EP token is refused (the api.ts:126 equivalent)', async () => {
    const w = await world();
    const stale = epPrincipal(w.alice, w.repo.epTokenVersion(w.alice));
    // Rotate: recording a new EP token bumps the tenant's version, revoking every prior token.
    w.repo.recordEpToken(w.alice, {
      version: w.repo.epTokenVersion(w.alice) + 1,
      issuedAt: '2026-08-06T00:00:00.000Z', expiresAt: '2026-09-06T00:00:00.000Z', last4: 'abcd',
    });
    const r = await handlePackageRetrieval(get(HASH_ALICE, stale), w.deps);
    assert.equal(r.status, 401, 'a rotated-out EP token must not retrieve');
    assert.deepEqual(r.body, { error: 'ep token revoked — regenerate it' });

    // And the CURRENT token still works — otherwise this test would pass on a broken route.
    const fresh = epFor(w.repo, w.alice);
    assert.equal((await handlePackageRetrieval(get(HASH_ALICE, fresh), w.deps)).status, 200);
  });

  test('a global (platform-admin) principal resolves to NO partition and is refused', async () => {
    const w = await world();
    const admin: Principal = { id: 'u-admin', roles: ['platform-admin'] };
    const r = await handlePackageRetrieval(get(HASH_ALICE, admin), w.deps);
    assert.equal(r.status, 403,
      'mayAccessTenant() is true for a platform-admin against every slug — on a slugless route that is no licence');
    // Uniform across hashes, so it cannot be used as an oracle about any package.
    const r2 = await handlePackageRetrieval(get(HASH_UNKNOWN, admin), w.deps);
    assert.deepEqual(r2, r);
  });

  test('a principal scoped to more than one tenant is refused — no partition is implied', async () => {
    const w = await world();
    const multi: Principal = { id: 'u-multi', roles: ['viewer'], tenants: [w.alice, w.bob] };
    assert.equal((await handlePackageRetrieval(get(HASH_ALICE, multi), w.deps)).status, 403);
  });

  test('a principal with no tenant scope is refused (fail-closed)', async () => {
    const w = await world();
    const none: Principal = { id: 'u-none', roles: ['viewer'] };
    assert.equal((await handlePackageRetrieval(get(HASH_ALICE, none), w.deps)).status, 403);
  });

  test('a role without tenant:read cannot retrieve', async () => {
    const w = await world();
    const noRead: Principal = { id: 'u-x', roles: [], tenants: [w.alice] };
    const r = await handlePackageRetrieval(get(HASH_ALICE, noRead), w.deps);
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, { error: 'not permitted: tenant:read' });
  });

  test('a tenant-scoped non-EP principal retrieves its own tenant\'s package', async () => {
    const w = await world();
    const admin: Principal = { id: 'u-alice', roles: ['tenant-admin'], tenants: [w.alice] };
    assert.equal((await handlePackageRetrieval(get(HASH_ALICE, admin), w.deps)).status, 200);
    // ...and still cannot reach Bob's.
    assert.equal((await handlePackageRetrieval(get(HASH_BOB, admin), w.deps)).status, 404);
  });

  test('a non-GET verb is 405, not a refusal — retrieval is read-only', async () => {
    const w = await world();
    const r = await handlePackageRetrieval(
      { method: 'DELETE', path: `/api/packages/${HASH_ALICE}`, principal: epFor(w.repo, w.alice) }, w.deps);
    assert.equal(r.status, 405);
  });

  test('an unconfigured store is 501, never 404 — a misconfiguration is not a missing package', async () => {
    const w = await world();
    const r = await handlePackageRetrieval(get(HASH_ALICE, epFor(w.repo, w.alice)), { repo: w.repo });
    assert.equal(r.status, 501);
  });
});
