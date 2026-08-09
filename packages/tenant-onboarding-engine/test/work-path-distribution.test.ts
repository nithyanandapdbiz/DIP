/**
 * WORK PATH DISTRIBUTION — conformance (ADR-0080 §6 steps 4-5).
 *
 * TRACEABILITY
 *   ADR : ADR-0080 (P-80.2, §6 steps 4-5) · ADR-0007 §6 (rotation, not re-registration) ·
 *         ADR-0035 (the update channel) · ADR-0081 P-81.4 (the carrier this reuses)
 *
 * THE PROPERTY THAT MATTERS MOST HERE IS ABOUT A TENANCY THAT REGISTERED TOO EARLY. The grant is
 * returned once and never persisted, so a tenancy that registered before `workPath` existed can
 * never obtain one from the grant — and re-registering mints a new EP credential, which is the
 * coupling ADR-0007 §6 exists to remove.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, FileTenantConfigStore,
  publishWorkPaths, lastDistributedWorkPath, workPathEvents, undistributedWorkPaths,
  WORK_POLL_INTERVAL_SECONDS, route,
  type ApiDeps, type ApiRequest, type Principal,
} from '../src/index.js';

const repoOf = (): TenantConfigRepository => new TenantConfigRepository(new InMemoryTenantConfigStore());
const make = (repo: TenantConfigRepository, name: string): string =>
  repo.createFromWelcome({ tenantName: name, organisationName: name, primaryAdministrator: 'A' } as never)
    .onboarding.slug;

// ── The operator route's fixtures (D-147) ──────────────────────────────────────────────────────
const admin: Principal = { id: 'u-admin', roles: ['platform-admin'] };
const depsOf = (repo: TenantConfigRepository): ApiDeps => ({
  repo,
  services: { auth: { issueOneTimeCredential: (t: string) => `otc-${t}` }, registration: { recordTenantCreated: () => {} } } as never,
  registrationEndpoint: 'https://ip.example/register',
});
const call = (d: ApiDeps, method: string, principal?: Principal, extra: Partial<ApiRequest> = {}) =>
  route({ method, path: '/api/work-paths', ...(principal ? { principal } : {}), ...extra }, d);

describe('ADR-0080 §6 step 5 — the work path reaches a tenancy that registered before it existed', () => {
  test('a tenancy that has never been sent a path is IDENTIFIED, then sent one', () => {
    const repo = repoOf();
    const slug = make(repo, 'Carlisle Homes');

    // THE CASE THIS MODULE EXISTS FOR. `undefined` — never sent — is not the same as "sent an
    // empty path", and it is the only signal separating "cannot reach the exchange" from "idle".
    assert.equal(lastDistributedWorkPath(repo.load(slug)!), undefined);
    assert.deepEqual(undistributedWorkPaths(repo), [slug]);

    const outcomes = publishWorkPaths(repo);
    assert.deepEqual(outcomes, [{ slug, result: 'emitted', workPath: `/api/tenants/${slug}/work` }]);
    assert.equal(lastDistributedWorkPath(repo.load(slug)!), `/api/tenants/${slug}/work`);
    assert.deepEqual(undistributedWorkPaths(repo), []);
  });

  test('the event carries the CADENCE with the path — a path alone leaves the EP to invent one', () => {
    const repo = repoOf();
    const slug = make(repo, 'Acme');
    publishWorkPaths(repo);

    const [event] = workPathEvents(repo.load(slug)!);
    assert.equal(event!.type, 'work-path-changed');
    assert.equal(event!.config?.['workPath'], `/api/tenants/${slug}/work`);
    // An invented cadence is a load decision made by the party that cannot see the load.
    assert.equal(event!.config?.['pollingIntervalSeconds'], WORK_POLL_INTERVAL_SECONDS);
  });

  test('the event is PENDING — it reaches the EP over the channel it already polls (ADR-0035)', () => {
    const repo = repoOf();
    const slug = make(repo, 'Acme');
    publishWorkPaths(repo);

    // No new route, no inbound connection, no customer redeployment (R-17.24).
    const pending = repo.listUpdates(slug, true);
    assert.equal(pending.filter((e) => e.type === 'work-path-changed').length, 1);
  });

  test('a second sweep emits NOTHING — idempotent by comparison, not by a flag', () => {
    const repo = repoOf();
    const slug = make(repo, 'Acme');
    publishWorkPaths(repo);
    const second = publishWorkPaths(repo);

    assert.deepEqual(second.map((o) => o.result), ['current']);
    // A "distributed" marker on the tenant record would be a second record of the same fact and
    // could disagree with the events. The comparison is over the path ACTUALLY SENT.
    assert.equal(workPathEvents(repo.load(slug)!).length, 1);
  });

  test('every tenancy is swept, and each is told ITS OWN path', () => {
    const repo = repoOf();
    const a = make(repo, 'Acme');
    const b = make(repo, 'Globex');
    publishWorkPaths(repo);

    assert.equal(lastDistributedWorkPath(repo.load(a)!), `/api/tenants/${a}/work`);
    assert.equal(lastDistributedWorkPath(repo.load(b)!), `/api/tenants/${b}/work`);
    // A cross-tenant path would be discoverable-but-refused at the route (P-80.2's inherited
    // authorisation), so the failure would look like a permission problem rather than a routing one.
    assert.notEqual(lastDistributedWorkPath(repo.load(a)!), lastDistributedWorkPath(repo.load(b)!));
  });

  test('a tenancy onboarded AFTER a sweep is still undistributed until the next one', () => {
    const repo = repoOf();
    make(repo, 'Acme');
    publishWorkPaths(repo);
    const late = make(repo, 'Latecomer');

    // The sweep is not a one-off migration; the population it covers is read fresh each time.
    assert.deepEqual(undistributedWorkPaths(repo), [late]);
    publishWorkPaths(repo);
    assert.deepEqual(undistributedWorkPaths(repo), []);
  });

  test('the path a tenancy is SENT is the same one the router serves — one constructor, not two', () => {
    const root = mkdtempSync(join(tmpdir(), 'workpath-'));
    const repo = new TenantConfigRepository(new FileTenantConfigStore(join(root, 'tenants')));
    const slug = make(repo, 'Acme');
    publishWorkPaths(repo);

    // `workPathFor` is the single constructor; the grant and this carrier both call it. A second
    // literal would drift, and the tenancies holding the stale one would poll an address that 404s
    // while every test over the other passed.
    const sent = lastDistributedWorkPath(repo.load(slug)!)!;
    assert.match(sent, /^\/api\/tenants\/[a-z0-9-]+\/work$/);
    assert.equal(sent, `/api/tenants/${slug}/work`);
  });
});

/**
 * D-147 — THE OPERATOR ROUTE. The engine could distribute a work path and the deployed system had
 * no way to ask it to: `publishWorkPaths` had ZERO non-test callers, and every test above passed
 * over that state. These tests are the ones that could not have.
 */
describe('D-147 — POST /api/work-paths, the caller the sweep never had', () => {
  test('the sweep is DRIVEN BY THE ROUTE, and the tenancy is told its path', () => {
    const repo = repoOf();
    const slug = make(repo, 'Carlisle Homes');
    const d = depsOf(repo);

    assert.equal(lastDistributedWorkPath(repo.load(slug)!), undefined);

    const res = call(d, 'POST', admin);
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).emitted, [slug]);
    // The property the module always had, now reachable from outside the process.
    assert.equal(lastDistributedWorkPath(repo.load(slug)!), `/api/tenants/${slug}/work`);
  });

  test('a second POST emits NOTHING and reports every tenancy `current`', () => {
    const repo = repoOf();
    const slug = make(repo, 'Acme');
    const d = depsOf(repo);
    call(d, 'POST', admin);

    const res = call(d, 'POST', admin);
    assert.deepEqual((res.body as any).emitted, []);
    // `current` is reported rather than omitted: "nothing to do" and "no tenancies" are different
    // facts, and an operator reading only `emitted` could not tell them apart.
    assert.deepEqual((res.body as any).current, [slug]);
    assert.equal(workPathEvents(repo.load(slug)!).length, 1);
  });

  test('GET ASKS AND WRITES NOTHING — the module\'s own separation, kept at the route', () => {
    const repo = repoOf();
    const slug = make(repo, 'Acme');
    const d = depsOf(repo);

    const res = call(d, 'GET', admin);
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).undistributed, [slug]);
    // Collapsing the two would close, in a transport change, the question the module was written to
    // keep open: asking who is stranded must not require the authority to fix it, nor fix it.
    assert.equal(lastDistributedWorkPath(repo.load(slug)!), undefined);
    assert.deepEqual(undistributedWorkPaths(repo), [slug]);
  });

  test('A TENANT-ADMIN IS REFUSED — `tenant:configure` is necessary and NOT sufficient', () => {
    const repo = repoOf();
    const slug = make(repo, 'Acme');
    const d = depsOf(repo);
    // This principal holds tenant:configure and is scoped to the only tenancy in the deployment.
    // `mayAccessTenant` would admit it for `/api/tenants/{slug}/...` — and there is NO SLUG here to
    // confine it with, so without `isGlobalPrincipal` it would drive a write across every tenancy.
    const ta: Principal = { id: 't-a', roles: ['tenant-admin'], tenants: [slug] };

    const res = call(d, 'POST', ta);
    assert.equal(res.status, 403);
    assert.equal(lastDistributedWorkPath(repo.load(slug)!), undefined);
    // The read is refused on the same ground: the question is about the population either way.
    assert.equal(call(d, 'GET', ta).status, 403);
  });

  test('a viewer is refused on the PERMISSION, before scope is ever considered', () => {
    const d = depsOf(repoOf());
    const res = call(d, 'POST', { id: 'u-viewer', roles: ['viewer'] });
    assert.equal(res.status, 403);
    assert.match((res.body as any).error, /tenant:configure/);
  });

  test('an EXECUTION-PLANE token is refused BY ROLE, not by revocation', () => {
    const repo = repoOf();
    const slug = make(repo, 'Acme');
    const d = depsOf(repo);
    // The EP holds tenant:read + tenant:update and is not global. The `ep:<slug>:vN` version check
    // in `authoriseTenantRequest` is never reached from here — asserted so its absence reads as a
    // decision rather than an omission. A revoked EP token and a live one are refused identically.
    const ep: Principal = { id: `ep:${slug}:v1`, roles: ['execution-plane'], tenants: [slug] };

    assert.equal(call(d, 'POST', ep).status, 403);
    assert.equal(lastDistributedWorkPath(repo.load(slug)!), undefined);
  });

  test('NO CREDENTIAL IS 401, and a rejected one is the OTHER 401 — never a silent no-op', () => {
    const repo = repoOf();
    const slug = make(repo, 'Acme');
    const d = depsOf(repo);

    const absent = call(d, 'POST');
    assert.equal(absent.status, 401);
    const rejected = call(d, 'POST', undefined, { credentialPresented: true });
    assert.equal(rejected.status, 401);
    // OBL-002: the two are distinguishable, so a caller can establish whether its own grant is the
    // problem. What must never differ is the effect — neither swept anything.
    assert.notDeepEqual(absent.body, rejected.body);
    assert.equal(lastDistributedWorkPath(repo.load(slug)!), undefined);
  });

  test('every other verb is 405, and PUT does not fall through to the tenant router', () => {
    const d = depsOf(repoOf());
    const res = call(d, 'PUT', admin);
    assert.equal(res.status, 405);
    assert.match((res.body as any).error, /\/api\/work-paths/);
  });

  test('an empty deployment sweeps to an EMPTY result, not to an error', () => {
    // Nothing registered is a legitimate state, and a sweep over it is a successful sweep that did
    // nothing. Reporting it as a failure would train an operator to ignore the route's refusals.
    const res = call(depsOf(repoOf()), 'POST', admin);
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).distribution, []);
  });
});
