/**
 * EP↔IP registration & trust establishment (ADR-0036).
 * TRACEABILITY: ADR-0036 · 05-cross-plane-communication.md · 07-tenant-isolation.md (C-07.11) · 06-data-sovereignty.md (INV-2) · 08-security-model.md §5a
 *   Proves: an OTC is exchanged ONCE for a tenant-scoped EP credential that then AUTHENTICATES;
 *           the OTC is single-use, expiring, tenant/environment/contract-bound; the issued credential
 *           is least-privilege and cannot cross tenants; re-registration rotates/revokes the prior
 *           credential; the store keeps NO secret (INV-2); every outcome is audited (success + refusal).
 * Categories: security, contract, integration, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { BootstrapServices } from '../src/domain/index.js';
import {
  TenantConfigRepository, InMemoryTenantConfigStore,
  InMemoryRegistrationStore, issueRegistrationOtc, handleRegistration,
  route, verifySessionToken, parseEpPrincipal, epPrincipal,
  type ApiDeps, type RegistrationDeps, type RegistrationGrant, type Principal,
} from '../src/engine/index.js';

const WELCOME = { organisationName: 'Carlisle Homes', tenantName: 'Carlisle Prod', primaryAdministrator: 'John Smith', preferredCloud: 'azure', deploymentModel: 'container' };
const WELCOME_B = { ...WELCOME, organisationName: 'Beta', tenantName: 'Beta Prod' };
const admin: Principal = { id: 'u-admin', roles: ['platform-admin'] };
const SECRET = 'ep-signing-secret';

const services: BootstrapServices = {
  auth: { issueOneTimeCredential: (t: string) => `otc-${t}` },
  registration: { recordTenantCreated: () => { /* audit */ } },
  now: () => '2026-07-24T00:00:00.000Z',
};

/** A controllable ISO clock shared by the repo, the OTC store and the handler. */
function makeClock(startIso = '2026-07-24T00:00:00.000Z') {
  let ms = Date.parse(startIso);
  return { now: () => new Date(ms).toISOString(), advance: (s: number) => { ms += s * 1000; } };
}

/** A repo + registration deps + api deps that all share one clock, store and secret. */
function harness(startIso?: string) {
  const clock = makeClock(startIso);
  let t = 0;
  const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), { now: clock.now, newTenantId: () => `tnt-${String(t++).padStart(4, '0')}` });
  const store = new InMemoryRegistrationStore();
  const registration: RegistrationDeps = { repo, store, epTokenSecret: SECRET, contractVersion: '1.0.0', now: clock.now, otcTtlSeconds: 3600 };
  const apiDeps: ApiDeps = { repo, services, registrationEndpoint: 'https://ip.example/register', epTokenSecret: SECRET, registration };
  return { clock, repo, store, registration, apiDeps };
}

/** Create a tenant and return { slug, tenantId }. */
function createTenant(h: ReturnType<typeof harness>, welcome = WELCOME): { slug: string; tenantId: string } {
  const res = route({ method: 'POST', path: '/api/tenants', body: welcome, principal: admin }, h.apiDeps);
  assert.equal(res.status, 201);
  const env = res.body as { onboarding: { slug: string; tenantId: string } };
  return { slug: env.onboarding.slug, tenantId: env.onboarding.tenantId };
}

describe('the happy path — an OTC is exchanged once for a working EP credential', () => {
  test('register returns a tenant-scoped credential that AUTHENTICATES the EP', () => {
    const h = harness();
    const { slug, tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    assert.ok(otc.startsWith('otc_'));

    const res = handleRegistration({ otc, tenantId, executionPlaneId: `${slug}-ep-1`, environment: 'test', contractVersion: '1.0.0' }, h.registration);
    assert.equal(res.status, 200);
    const grant = res.body as RegistrationGrant;
    assert.equal(grant.credentialType, 'dbiz-ep-session-jwt');
    assert.equal(grant.tokenVersion, 1);
    assert.equal(grant.tenantId, tenantId);
    assert.equal(grant.slug, slug);
    assert.equal(grant.configuration.updatesPath, `/api/tenants/${slug}/updates`);

    // ADR-0080 §6 step 4 — THE WORK PATH IS IN THE GRANT. A route the far side cannot discover is a
    // route the far side does not have, and until this field existed the only way to reach `/work`
    // was to be told out of band, which is not a mechanism.
    assert.equal(grant.configuration.workPath, `/api/tenants/${slug}/work`);
    // BESIDE `updatesPath`, NOT INSTEAD OF IT (ADR-0080 §2.3). A software update and a run are
    // different lifecycles; reusing the updates channel would couple them inside the EP's poll loop.
    assert.notEqual(grant.configuration.workPath, grant.configuration.updatesPath);

    // The credential verifies to an execution-plane principal scoped to THIS tenant (least privilege).
    const v = verifySessionToken(grant.credential, SECRET);
    assert.ok(v.ok);
    assert.deepEqual(v.principal.roles, ['execution-plane']);
    assert.deepEqual(v.principal.tenants, [slug]);
    assert.deepEqual(parseEpPrincipal(v.principal.id), { slug, version: 1 });

    // And it actually authenticates a protected call — the 401 is gone.
    const updates = route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal: v.principal }, h.apiDeps);
    assert.equal(updates.status, 200);
  });

  test('the issued credential is least-privilege: it may read/ack its updates, not administer tenants', () => {
    const h = harness();
    const { slug, tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    const grant = handleRegistration({ otc, tenantId, environment: 'test' }, h.registration).body as RegistrationGrant;
    const p = verifySessionToken(grant.credential, SECRET).ok && verifySessionToken(grant.credential, SECRET);
    assert.ok(p);
    const principal = (p as { principal: Principal }).principal;
    assert.equal(route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal }, h.apiDeps).status, 200);
    // No tenant:create / activate / delete for an execution-plane token.
    assert.equal(route({ method: 'POST', path: '/api/tenants', body: WELCOME, principal }, h.apiDeps).status, 403);
    assert.equal(route({ method: 'POST', path: `/api/tenants/${slug}/activate`, principal }, h.apiDeps).status, 403);
    assert.equal(route({ method: 'DELETE', path: `/api/tenants/${slug}`, principal }, h.apiDeps).status, 403);
  });
});

describe('the OTC is single-use, expiring, and forgery-resistant', () => {
  test('replaying a consumed OTC is refused (single-use)', () => {
    const h = harness();
    const { slug, tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    assert.equal(handleRegistration({ otc, tenantId, environment: 'test' }, h.registration).status, 200);
    const replay = handleRegistration({ otc, tenantId, environment: 'test' }, h.registration);
    assert.equal(replay.status, 401);
    assert.match((replay.body as { error: string }).error, /already been used/);
    void slug;
  });

  test('an expired OTC is refused', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId); // ttl 3600s
    h.clock.advance(3601);
    const res = handleRegistration({ otc, tenantId, environment: 'test' }, h.registration);
    assert.equal(res.status, 401);
    assert.match((res.body as { error: string }).error, /expired/);
  });

  test('a forged / unknown OTC is refused', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    assert.equal(handleRegistration({ otc: 'otc_not-a-real-credential', tenantId, environment: 'test' }, h.registration).status, 401);
    assert.equal(handleRegistration({ otc: 'garbage', tenantId, environment: 'test' }, h.registration).status, 401); // missing prefix → 401
  });

  test('a missing OTC is 401, not a silent pass', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    assert.equal(handleRegistration({ tenantId, environment: 'test' }, h.registration).status, 401);
  });
});

describe('tenant isolation and binding (Zero Trust — possession is not sufficient)', () => {
  test('tenant A\'s OTC cannot register as tenant B (cross-tenant attempt → 403)', () => {
    const h = harness();
    const a = createTenant(h, WELCOME);
    const b = createTenant(h, WELCOME_B);
    const otcA = issueRegistrationOtc(h.registration, a.tenantId);
    // Present A's OTC but CLAIM to be B → refused; B is untouched.
    const res = handleRegistration({ otc: otcA, tenantId: b.tenantId, environment: 'test' }, h.registration);
    assert.equal(res.status, 403);
    assert.match((res.body as { error: string }).error, /not valid for this tenant/);
    // And A's OTC is NOT consumed by the failed attempt — the legitimate EP can still register.
    assert.equal(handleRegistration({ otc: otcA, tenantId: a.tenantId, environment: 'test' }, h.registration).status, 200);
  });

  test('an environment mismatch is refused (a test OTC cannot bootstrap another environment)', () => {
    const h = harness();
    const { tenantId } = createTenant(h); // tenant environment defaults to 'test'
    const otc = issueRegistrationOtc(h.registration, tenantId);
    const res = handleRegistration({ otc, tenantId, environment: 'production' }, h.registration);
    assert.equal(res.status, 403);
    assert.match((res.body as { error: string }).error, /environment/);
  });

  test('an unsupported contract version is refused (426)', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    assert.equal(handleRegistration({ otc, tenantId, environment: 'test', contractVersion: '9.9.9' }, h.registration).status, 426);
  });

  test('an OTC bound to a non-existent tenant is 404', () => {
    const h = harness();
    const otc = issueRegistrationOtc(h.registration, 'tnt-ghost');
    assert.equal(handleRegistration({ otc, tenantId: 'tnt-ghost', environment: 'test' }, h.registration).status, 404);
  });

  test('the issued credential cannot address a different tenant (C-07.11)', () => {
    const h = harness();
    const a = createTenant(h, WELCOME);
    const b = createTenant(h, WELCOME_B);
    const otcA = issueRegistrationOtc(h.registration, a.tenantId);
    const grantA = handleRegistration({ otc: otcA, tenantId: a.tenantId, environment: 'test' }, h.registration).body as RegistrationGrant;
    const pA = verifySessionToken(grantA.credential, SECRET);
    assert.ok(pA.ok);
    // A's credential reads A, is refused on B.
    assert.equal(route({ method: 'GET', path: `/api/tenants/${a.slug}/updates`, principal: pA.principal }, h.apiDeps).status, 200);
    assert.equal(route({ method: 'GET', path: `/api/tenants/${b.slug}/updates`, principal: pA.principal }, h.apiDeps).status, 403);
  });
});

describe('rotation & revocation (no denylist — the version in the id revokes)', () => {
  test('re-registering rotates the credential and revokes the previous one', () => {
    const h = harness();
    const { slug, tenantId } = createTenant(h);
    const otc1 = issueRegistrationOtc(h.registration, tenantId);
    const g1 = handleRegistration({ otc: otc1, tenantId, environment: 'test' }, h.registration).body as RegistrationGrant;
    assert.equal(g1.tokenVersion, 1);
    const p1 = verifySessionToken(g1.credential, SECRET);
    assert.ok(p1.ok && route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal: p1.principal }, h.apiDeps).status === 200);

    // A fresh OTC (e.g. a re-issued package) → a v2 credential; v1 is now revoked.
    const otc2 = issueRegistrationOtc(h.registration, tenantId);
    const g2 = handleRegistration({ otc: otc2, tenantId, environment: 'test' }, h.registration).body as RegistrationGrant;
    assert.equal(g2.tokenVersion, 2);
    assert.equal(route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal: epPrincipal(slug, 1) }, h.apiDeps).status, 401);
    assert.equal(route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal: epPrincipal(slug, 2) }, h.apiDeps).status, 200);
  });
});

describe('data sovereignty & audit (INV-2, §11)', () => {
  test('the store holds a HASH, never the OTC or the credential', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    const grant = handleRegistration({ otc, tenantId, environment: 'test' }, h.registration).body as RegistrationGrant;
    const serialized = JSON.stringify([...h.store.readAudit()]);
    assert.ok(!serialized.includes(otc), 'audit must not contain the OTC');
    assert.ok(!serialized.includes(grant.credential), 'audit must not contain the issued credential');
  });

  test('every outcome is audited — success and refusal alike', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    handleRegistration({ otc, tenantId, environment: 'test' }, h.registration);         // success
    handleRegistration({ otc, tenantId, environment: 'test' }, h.registration);         // refused (replay)
    const ops = h.store.readAudit().map((a) => a.operation);
    assert.ok(ops.includes('otc-issued'));
    assert.ok(ops.includes('credential-issued'));
    assert.ok(ops.includes('registration-succeeded'));
    assert.ok(ops.includes('registration-refused'));
  });

  test('registration is 501 when no signing secret is configured', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    const { epTokenSecret: _omit, ...rest } = h.registration; // omit the secret entirely (not = undefined)
    void _omit;
    assert.equal(handleRegistration({ otc, tenantId, environment: 'test' }, rest as RegistrationDeps).status, 501);
  });
});

describe('hardening — verified fixes from the adversarial security review', () => {
  test('an EP credential cannot drive the onboarding journey or self-grant capabilities (least privilege)', () => {
    const h = harness();
    const { slug, tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    handleRegistration({ otc, tenantId, environment: 'test' }, h.registration); // records ep-token v1
    const ep = epPrincipal(slug, 1);
    // Every onboarding/governance PATCH is 403 for an execution-plane credential (needs tenant:configure).
    for (const action of ['connect', 'discovery', 'recommendations', 'review', 'capabilities', 'configuration']) {
      assert.equal(route({ method: 'PATCH', path: `/api/tenants/${slug}/${action}`, body: {}, principal: ep }, h.apiDeps).status, 403, `PATCH ${action}`);
    }
    // Its legitimate surface still works: read + acknowledge updates.
    assert.equal(route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal: ep }, h.apiDeps).status, 200);
  });

  test('enrichRecommendations rejects a capability with no verified execution path (R-21.11)', () => {
    const h = harness();
    const { slug } = createTenant(h);
    assert.throws(() => h.repo.enrichRecommendations(slug, {} as never, { capabilities: ['totally-made-up-capability'] }), /no verified execution path/);
  });

  test('a failure AFTER consume rolls back the OTC so the legitimate EP can retry (no burned credential)', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    const otc = issueRegistrationOtc(h.registration, tenantId);
    const base = h.registration.store;
    let failNext = true;
    const flaky = {
      putOtc: (r: Parameters<typeof base.putOtc>[0]) => base.putOtc(r),
      getOtc: (x: string) => base.getOtc(x),
      consumeOtc: (x: string, a: string) => base.consumeOtc(x, a),
      releaseOtc: (x: string) => base.releaseOtc(x),
      readAudit: () => base.readAudit(),
      appendAudit: (rec: Parameters<typeof base.appendAudit>[0]) => {
        if (failNext && rec.operation === 'credential-issued') { failNext = false; throw new Error('transient disk error'); }
        base.appendAudit(rec);
      },
    };
    const deps: RegistrationDeps = { ...h.registration, store: flaky };
    assert.equal(handleRegistration({ otc, tenantId, environment: 'test' }, deps).status, 503); // retryable, OTC released
    assert.equal(handleRegistration({ otc, tenantId, environment: 'test' }, deps).status, 200); // same OTC now works
  });

  test('an over-long correlationId is clamped in the audit record (amplification bound)', () => {
    const h = harness();
    const { tenantId } = createTenant(h);
    handleRegistration({ tenantId, environment: 'test', otc: 'otc_bad', correlationId: 'x'.repeat(5000) }, h.registration);
    const rec = [...h.store.readAudit()].reverse().find((a) => a.operation === 'registration-refused')!;
    assert.ok(rec.correlationId!.length <= 128, `correlationId was ${rec.correlationId!.length} chars`);
  });

  test('a duplicated opaque tenantId fails CLOSED → 404, never a cross-tenant credential (C-07.11)', () => {
    const clock = makeClock();
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), { now: clock.now, newTenantId: () => 'tnt-collide' });
    repo.createFromWelcome(WELCOME);
    repo.createFromWelcome({ ...WELCOME, organisationName: 'Beta', tenantName: 'Beta Prod' }); // same forced id
    const reg: RegistrationDeps = { repo, store: new InMemoryRegistrationStore(), epTokenSecret: SECRET, contractVersion: '1.0.0', now: clock.now };
    const otc = issueRegistrationOtc(reg, 'tnt-collide');
    assert.equal(handleRegistration({ otc, tenantId: 'tnt-collide', environment: 'test' }, reg).status, 404);
  });
});
