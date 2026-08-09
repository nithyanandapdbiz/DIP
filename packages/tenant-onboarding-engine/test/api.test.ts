/**
 * Tenant REST API + RBAC + single-read-path resolver over the canonical Tenant Manifest.
 * TRACEABILITY: ADR-0032 (SSOT) · ADR-0033 §R-33.5 (auth) · ADR-0030 (onboard() reused) · INV-2
 *   Proves: every endpoint operates on tenant.json AND is access-controlled; a full authorised REST
 *           journey creates→enriches→activates ONE manifest via onboard(); Multi-Tenancy / Isolation /
 *           Config-Intelligence resolve the SAME manifest; a real HTTP server enforces auth.
 * Categories: contract, security, integration, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import { CAPABILITIES_WITH_EXECUTION_PATH, type BootstrapServices } from '../src/domain/index.js';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, TenantManifestResolver,
  route, createServer, SimulatedEdge, recommend, deterministicAdvisor, epPrincipal,
  InMemoryRegistrationStore, handleRegistration, AUTH_ABSENT,
  type AuthOutcome, type ApiDeps, type ApiRequest, type RepositoryOptions, type Principal, type RegistrationDeps,
  type ProjectManagementMetadata, type TestManagementMetadata, type SourceControlMetadata, type ApplicationMetadata,
} from '../src/engine/index.js';

const admin: Principal = { id: 'u-admin', roles: ['platform-admin'] };
const viewer: Principal = { id: 'u-viewer', roles: ['viewer'] };

let tick = 0;
const opts: RepositoryOptions = { now: () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`, newTenantId: () => 'tnt-opaque-01' };
const services: BootstrapServices = {
  auth: { issueOneTimeCredential: (t: string) => `otc-${t}` },
  registration: { recordTenantCreated: () => { /* audit */ } },
  now: () => '2026-07-23T00:00:00.000Z',
};
const WELCOME = { organisationName: 'Carlisle Homes', tenantName: 'Carlisle Prod', primaryAdministrator: 'John Smith', primaryAdministratorEmail: 'john@carlisle.example', preferredCloud: 'azure', deploymentModel: 'container' };

function deps(): ApiDeps { return { repo: new TenantConfigRepository(new InMemoryTenantConfigStore(), opts), services, registrationEndpoint: 'https://ip.example/register' }; }
/** Authorised request as platform-admin. */
const A = (req: Omit<ApiRequest, 'principal'>, d: ApiDeps) => route({ ...req, principal: admin }, d);

async function discovered() {
  const edge = new SimulatedEdge();
  return {
    projectManagement: await edge.discover('projectManagement', 'x') as ProjectManagementMetadata,
    testManagement: await edge.discover('testManagement', 'x') as TestManagementMetadata,
    sourceControl: await edge.discover('sourceControl', 'x') as SourceControlMetadata,
    application: await edge.discover('application', 'x') as ApplicationMetadata,
  };
}

describe('configuration merge is prototype-pollution safe (CWE-1321, security)', () => {
  test('a __proto__ configuration patch is refused and does not pollute Object.prototype', () => {
    tick = 0;
    const d = deps();
    assert.equal(A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d).status, 201);
    const slug = 'carlisle-prod';
    // Precondition: the global prototype is clean.
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    // A computed '__proto__' key reproduces exactly what JSON.parse yields for {"__proto__":…}: an OWN
    // enumerable property. Before the deepMerge guard this walked into Object.prototype and set 'polluted'
    // on EVERY object process-wide (the assertion below would then read 'yes').
    const res = A({ method: 'PATCH', path: `/api/tenants/${slug}/configuration`, body: { patch: { ['__proto__']: { polluted: 'yes' } } } }, d);
    assert.equal(res.status, 422); // refused loudly as an invalid configuration
    // The load-bearing assertion: no object anywhere gained the injected property.
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(Object.prototype.hasOwnProperty('polluted'), false);
  });

  test('a nested constructor/prototype patch is likewise refused', () => {
    tick = 0;
    const d = deps();
    assert.equal(A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d).status, 201);
    const res = A({ method: 'PATCH', path: '/api/tenants/carlisle-prod/configuration', body: { patch: { constructor: { prototype: { polluted: 'yes' } } } } }, d);
    assert.equal(res.status, 422);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
});

describe('every endpoint operates on the one tenant.json (ADR-0032)', () => {
  test('a full authorised REST journey creates, enriches, certifies and activates ONE manifest', async () => {
    tick = 0;
    const d = deps();
    assert.equal(A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d).status, 201);
    const slug = 'carlisle-prod';
    assert.equal((A({ method: 'GET', path: '/api/tenants' }, d).body as unknown[]).length, 1);

    const disc = await discovered();
    A({ method: 'PATCH', path: `/api/tenants/${slug}/connect`, body: { selections: [{ kind: 'project-management', provider: 'jira', connected: true }, { kind: 'test-management', provider: 'zephyr-scale', connected: true, repositoryDisposition: 'reuse-existing', baseUrl: 'https://carlisle.atlassian.net', planId: 'plan-4471', suiteId: 'suite-9920', suiteKind: 'requirement-based' }] } }, d);
    A({ method: 'PATCH', path: `/api/tenants/${slug}/discovery`, body: { discovered: disc } }, d);
    A({ method: 'PATCH', path: `/api/tenants/${slug}/recommendations`, body: { recommendations: recommend(disc, deterministicAdvisor, 'container') } }, d);
    assert.equal((A({ method: 'PATCH', path: `/api/tenants/${slug}/review` }, d).body as { certification: { ok: boolean } }).certification.ok, true);

    const activated = A({ method: 'POST', path: `/api/tenants/${slug}/activate` }, d);
    assert.equal(activated.status, 200);
    assert.equal((activated.body as { result: { lifecycleState: string } }).result.lifecycleState, 'PROVISIONED');
    assert.equal((A({ method: 'GET', path: `/api/tenants/${slug}/manifest` }, d).body as { onboarding: { status: string; administrators: unknown[] } }).onboarding.status, 'Provisioned');
    assert.equal(d.repo.list().length, 1);
  });

  test('the administrator is persisted in the manifest (no longer dropped)', () => {
    tick = 0;
    const d = deps();
    const created = A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const admins = (created.body as { onboarding: { administrators: { name: string; email?: string }[] } }).onboarding.administrators;
    assert.equal(admins[0]!.name, 'John Smith');
    assert.equal(admins[0]!.email, 'john@carlisle.example');
  });

  test('unknown tenant is 404; duplicate create is 409', () => {
    tick = 0;
    const d = deps();
    assert.equal(A({ method: 'GET', path: '/api/tenants/nope' }, d).status, 404);
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    assert.equal(A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d).status, 409);
  });
});

describe('capability update events for the EP (add → pull → acknowledge)', () => {
  test('adding a capability to a live tenant emits a pending event the EP pulls and acks', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    // Bring the tenant live so it has an EP to update.
    assert.equal(A({ method: 'POST', path: '/api/tenants/carlisle-prod/activate' }, d).status, 200);

    // Add a capability → an update event is recorded (capability-added, pending, with a config scaffold).
    A({ method: 'PATCH', path: '/api/tenants/carlisle-prod/capabilities', body: { capability: 'inverse-flow-discovery', enabled: true } }, d);
    const pending = A({ method: 'GET', path: '/api/tenants/carlisle-prod/updates' }, d).body as { id: string; type: string; capability: string; status: string; config?: unknown }[];
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.type, 'capability-added');
    assert.equal(pending[0]!.capability, 'inverse-flow-discovery');
    assert.equal(pending[0]!.status, 'pending');
    assert.ok(pending[0]!.config, 'the event carries the EP config scaffold');

    // The EP acknowledges → the event is marked applied.
    assert.equal(A({ method: 'POST', path: '/api/tenants/carlisle-prod/updates', body: { id: pending[0]!.id } }, d).status, 200);
    const after = A({ method: 'GET', path: '/api/tenants/carlisle-prod/updates' }, d).body as { status: string }[];
    assert.equal(after[0]!.status, 'applied');
  });
  test('enabling then disabling an integration (AI) emits integration update events', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    assert.equal(A({ method: 'POST', path: '/api/tenants/carlisle-prod/activate' }, d).status, 200);
    A({ method: 'PATCH', path: '/api/tenants/carlisle-prod/integrations', body: { integration: 'ai', enabled: true } }, d);
    const ups = A({ method: 'GET', path: '/api/tenants/carlisle-prod/updates' }, d).body as { type: string; integration: string; config?: { apiKeyEnv?: string } }[];
    assert.equal(ups.length, 1);
    assert.equal(ups[0]!.type, 'integration-enabled');
    assert.equal(ups[0]!.integration, 'ai');
    assert.equal(ups[0]!.config?.apiKeyEnv, 'AI_PROVIDER_KEY');
    A({ method: 'PATCH', path: '/api/tenants/carlisle-prod/integrations', body: { integration: 'ai', enabled: false } }, d);
    const ups2 = A({ method: 'GET', path: '/api/tenants/carlisle-prod/updates' }, d).body as { type: string }[];
    assert.equal(ups2.length, 2);
    assert.equal(ups2[1]!.type, 'integration-disabled');
  });
  test('acknowledging an unknown update is 404', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    assert.equal(A({ method: 'POST', path: '/api/tenants/carlisle-prod/updates', body: { id: 'nope' } }, d).status, 404);
  });
});

describe('Execution-Plane API token (generate · scope · rotate)', () => {
  const D = (): ApiDeps => ({ ...deps(), epTokenSecret: 'ep-secret' });
  test('generate issues a versioned token; regenerate revokes the prior version', () => {
    tick = 0;
    const d = D();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const slug = 'carlisle-prod';
    const r1 = A({ method: 'POST', path: `/api/tenants/${slug}/ep-token` }, d);
    assert.equal(r1.status, 200);
    assert.equal((r1.body as { version: number }).version, 1);
    assert.ok((r1.body as { token: string }).token.length > 0);
    // The v1 EP principal may read its own updates.
    const ep1 = epPrincipal(slug, 1);
    assert.equal(route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal: ep1 }, d).status, 200);
    // Regenerate → v2; v1 is now revoked, v2 works.
    assert.equal((A({ method: 'POST', path: `/api/tenants/${slug}/ep-token` }, d).body as { version: number }).version, 2);
    assert.equal(route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal: ep1 }, d).status, 401);
    assert.equal(route({ method: 'GET', path: `/api/tenants/${slug}/updates`, principal: epPrincipal(slug, 2) }, d).status, 200);
  });
  test('an EP token cannot address a different tenant', () => {
    tick = 0;
    const d = D();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    A({ method: 'POST', path: '/api/tenants/carlisle-prod/ep-token' }, d);
    assert.equal(route({ method: 'GET', path: '/api/tenants/other/updates', principal: epPrincipal('carlisle-prod', 1) }, d).status, 403);
  });
  test('issuance requires configuration (501 without a secret)', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    assert.equal(A({ method: 'POST', path: '/api/tenants/carlisle-prod/ep-token' }, d).status, 501);
  });
});

describe('One-time registration credential — portal issuance (POST :slug/otc)', () => {
  // Wire a real RegistrationDeps (hash store) so the OTC endpoint has somewhere to record the hash.
  const withReg = (): ApiDeps => {
    const base = deps();
    const registration: RegistrationDeps = {
      repo: base.repo, store: new InMemoryRegistrationStore(),
      epTokenSecret: 'ep-secret', contractVersion: '1.0.0',
    };
    return { ...base, registration };
  };

  test('mints a fresh OTC bound to the tenant, hash-only at rest (INV-2), and it is a REAL registration credential', () => {
    tick = 0;
    const d = withReg();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const slug = 'carlisle-prod';
    const tenantId = (d.repo.load(slug))!.onboarding.tenantId;

    const r = A({ method: 'POST', path: `/api/tenants/${slug}/otc` }, d);
    assert.equal(r.status, 200);
    const body = r.body as { otc: string; tenantId: string; registrationEndpoint: string; expiresAt: string };
    assert.ok(body.otc.startsWith('otc_'), 'returns a plaintext OTC');
    assert.equal(body.tenantId, tenantId, 'bound to the tenant opaque id');
    assert.equal(body.registrationEndpoint, d.registrationEndpoint);
    assert.ok(Date.parse(body.expiresAt) > 0, 'carries an expiry');

    // The store keeps only the HASH — never the plaintext (R-36.3). The endpoint response is the only place
    // the value appears. Prove the minted OTC actually registers: presenting it to handleRegistration succeeds.
    const regDeps: RegistrationDeps = { repo: d.repo, store: (d.registration!).store, epTokenSecret: 'ep-secret', contractVersion: '1.0.0' };
    const grant = handleRegistration({ otc: body.otc, tenantId, contractVersion: '1.0.0' }, regDeps);
    assert.equal(grant.status, 200, 'the portal-minted OTC authenticates a real registration');
    // Single-use: the same OTC cannot be replayed (R-36.2).
    assert.equal(handleRegistration({ otc: body.otc, tenantId, contractVersion: '1.0.0' }, regDeps).status, 401);
  });

  test('regenerating yields a distinct OTC each time', () => {
    tick = 0;
    const d = withReg();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const a = (A({ method: 'POST', path: '/api/tenants/carlisle-prod/otc' }, d).body as { otc: string }).otc;
    const b = (A({ method: 'POST', path: '/api/tenants/carlisle-prod/otc' }, d).body as { otc: string }).otc;
    assert.notEqual(a, b);
  });

  test('requires the tenant:configure permission (403 for a viewer)', () => {
    tick = 0;
    const d = withReg();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    assert.equal(route({ method: 'POST', path: '/api/tenants/carlisle-prod/otc', principal: viewer }, d).status, 403);
  });

  test('issuance requires registration to be configured (501 without it)', () => {
    tick = 0;
    const d = deps(); // no registration deps
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    assert.equal(A({ method: 'POST', path: '/api/tenants/carlisle-prod/otc' }, d).status, 501);
  });
});

describe('EP solution generation (POST /solution)', () => {
  test('generates the solution package from tenant.json', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const res = A({ method: 'POST', path: '/api/tenants/carlisle-prod/solution' }, d);
    assert.equal(res.status, 200);
    const m = res.body as { fileCount: number; files: { path: string }[]; profile: { language: string }; contentHash: string; capabilities: string[]; tools: string[] };
    assert.ok(m.fileCount > 0);
    assert.equal(m.files.length, m.fileCount);
    assert.equal(m.profile.language, 'typescript');
    assert.ok(m.contentHash.length > 0);
    // The package reflects the entitled capabilities and selected tools with fill-in config.
    assert.ok(m.files.some((f) => f.path === 'config/capabilities.json'));
    assert.ok(m.files.some((f) => f.path === 'config/integrations.json'));
    assert.ok(m.files.some((f) => f.path === 'docs/EP-CONFIGURATION.md'));
    assert.ok(Array.isArray(m.capabilities) && Array.isArray(m.tools));
    // ADR-0035 — the Execution-Plane Operational Portal is generated per tenant.
    assert.ok(m.files.some((f) => f.path === 'web/index.html'), 'portal UI emitted');
    assert.ok(m.files.some((f) => f.path === 'src/portal/server.mjs'), 'Local Execution API emitted');
    assert.ok(m.files.some((f) => f.path === 'bin/ep.mjs'), 'CLI emitted');
    const portal = (res.body as { files: { path: string; content: string }[] }).files.find((f) => f.path === 'web/index.html')!.content;
    // Self-contained: no external resource references (sovereignty / CSP).
    assert.ok(!/(href|src)\s*=\s*"https?:\/\//i.test(portal), 'portal makes no external resource request');
    // Vendor-neutral (INV-9) and secret slots are vault references, never plaintext (INV-2).
    assert.ok(!/anthropic|openai/i.test(portal), 'portal names no AI vendor');
    assert.ok(portal.includes('vault://'), 'portal secret slots are vault references');
    // One execution path: `npm run functional` routes through the CLI to the Local Execution API (R-04.5).
    const pkgJson = JSON.parse((res.body as { files: { path: string; content: string }[] }).files.find((f) => f.path === 'package.json')!.content);
    assert.equal(pkgJson.scripts.functional, 'node bin/ep.mjs run functional-testing', 'npm run functional routes through the CLI, never an engine directly');
    // The EP sequencer runs the twelve-stage lifecycle but emits no verdict — certification stays in the IP (R-12.5).
    const server = (res.body as { files: { path: string; content: string }[] }).files.find((f) => f.path === 'src/portal/server.mjs')!.content;
    assert.ok(server.includes('STAGES') && server.includes('twelve-stage'), 'the Local Execution API implements the twelve-stage lifecycle');
    assert.ok(/no verdict|R-05\.11|R-12\.5/.test(server), 'the EP sequencer emits no verdict; certification is deferred to the IP');
    // ADR-0035 — one reusable per-capability workspace with eight tabs, driven off the existing endpoints.
    assert.ok(portal.includes('id="v-workspace"') && portal.includes('function openWorkspace'), 'per-capability workspace is emitted');
    assert.ok(['wsOverview', 'wsConfiguration', 'wsExecution', 'wsHistory', 'wsEvidence', 'wsReports', 'wsHealth', 'wsSettings'].every((f) => portal.includes('function ' + f)), 'all eight workspace tabs are present');
  });
  test('unknown tenant returns 404', () => {
    assert.equal(A({ method: 'POST', path: '/api/tenants/nope/solution' }, deps()).status, 404);
  });
});

describe('Portal branding capture (ADR-0035 R-35.7)', () => {
  test('PATCH /branding persists the presentation branding band', () => {
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const r = A({ method: 'PATCH', path: '/api/tenants/carlisle-prod/branding', body: { branding: { productName: 'QA Console', themeAccent: '#0066CC' } } }, d);
    assert.equal(r.status, 200);
    const env = r.body as { branding?: { productName?: string; themeAccent?: string } };
    assert.equal(env.branding?.productName, 'QA Console');
    assert.equal(env.branding?.themeAccent, '#0066CC');
  });
});

describe('RBAC is enforced on every route (ADR-0033 R-33.5)', () => {
  test('an unauthenticated request is 401', () => {
    tick = 0;
    assert.equal(route({ method: 'GET', path: '/api/tenants' }, deps()).status, 401);
  });
  test('a viewer may read but not create, activate or delete', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    assert.equal(route({ method: 'GET', path: '/api/tenants', principal: viewer }, d).status, 200);
    assert.equal(route({ method: 'POST', path: '/api/tenants', body: WELCOME, principal: viewer }, d).status, 403);
    assert.equal(route({ method: 'POST', path: '/api/tenants/carlisle-prod/activate', principal: viewer }, d).status, 403);
    assert.equal(route({ method: 'DELETE', path: '/api/tenants/carlisle-prod', principal: viewer }, d).status, 403);
  });
  test('DELETE by an admin removes the tenant', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    assert.equal(A({ method: 'DELETE', path: '/api/tenants/carlisle-prod' }, d).status, 200);
    assert.equal(d.repo.list().length, 0);
  });
});

describe('tenant-scoped authorisation prevents cross-tenant access (C-07.11)', () => {
  // A repository seeded with two distinct tenants by the global platform-admin.
  function twoTenantDeps(): ApiDeps {
    let n = 0, t = 0;
    return {
      repo: new TenantConfigRepository(new InMemoryTenantConfigStore(), {
        now: () => `2026-07-23T00:00:${String(n++).padStart(2, '0')}.000Z`,
        newTenantId: () => `tnt-opaque-${String(t++).padStart(2, '0')}`,
      }),
      services, registrationEndpoint: 'https://ip.example/register',
    };
  }
  const slugOf = (r: ReturnType<typeof route>) => (r.body as { onboarding: { slug: string } }).onboarding.slug;

  test('a tenant-admin scoped to one tenant is denied on another, despite holding the role permission', () => {
    const d = twoTenantDeps();
    const aCreate = A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const bCreate = A({ method: 'POST', path: '/api/tenants', body: { ...WELCOME, tenantName: 'Beta Prod', organisationName: 'Beta', primaryAdministratorEmail: 'b@beta.example' } }, d);
    assert.equal(aCreate.status, 201);
    assert.equal(bCreate.status, 201);
    const aSlug = slugOf(aCreate), bSlug = slugOf(bCreate);
    assert.notEqual(aSlug, bSlug);

    const taA: Principal = { id: 't-a', roles: ['tenant-admin'], tenants: [aSlug] };
    // Its OWN tenant: role permission AND tenant scope both satisfied.
    assert.equal(route({ method: 'GET', path: `/api/tenants/${aSlug}/manifest`, principal: taA }, d).status, 200);
    // ANOTHER tenant: the role still grants read/update/activate, but the scope check denies —
    // this is exactly the cross-tenant hole (C-07.11). Before the fix these were 200/2xx.
    assert.equal(route({ method: 'GET', path: `/api/tenants/${bSlug}/manifest`, principal: taA }, d).status, 403);
    assert.equal(route({ method: 'PATCH', path: `/api/tenants/${bSlug}/configuration`, body: { patch: {} }, principal: taA }, d).status, 403);
    assert.equal(route({ method: 'POST', path: `/api/tenants/${bSlug}/activate`, principal: taA }, d).status, 403);
    // A platform-admin remains global (unchanged behaviour).
    assert.equal(route({ method: 'GET', path: `/api/tenants/${bSlug}/manifest`, principal: admin }, d).status, 200);
  });

  test('the collection lists only the caller\'s scoped tenants; a platform-admin sees all', () => {
    const d = twoTenantDeps();
    const aSlug = slugOf(A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d));
    A({ method: 'POST', path: '/api/tenants', body: { ...WELCOME, tenantName: 'Beta Prod', organisationName: 'Beta', primaryAdministratorEmail: 'b@beta.example' } }, d);
    const taA: Principal = { id: 't-a', roles: ['tenant-admin'], tenants: [aSlug] };
    assert.equal((route({ method: 'GET', path: '/api/tenants', principal: taA }, d).body as unknown[]).length, 1);
    assert.equal((A({ method: 'GET', path: '/api/tenants' }, d).body as unknown[]).length, 2);
    // An unscoped tenant-admin sees nothing (fail-closed), rather than every tenant.
    const taNone: Principal = { id: 't-none', roles: ['tenant-admin'] };
    assert.equal((route({ method: 'GET', path: '/api/tenants', principal: taNone }, d).body as unknown[]).length, 0);
  });
});

describe('Multi-Tenancy, Isolation and Config-Intelligence resolve the SAME manifest (no duplicate)', () => {
  test('all three views come from the one tenant.json via the resolver', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const resolver = new TenantManifestResolver(d.repo);
    const mt = resolver.forMultiTenancy('carlisle-prod');
    const iso = resolver.forIsolation('carlisle-prod');
    const cfg = resolver.forConfigIntelligence('carlisle-prod');
    const manifest = d.repo.load('carlisle-prod')!;
    assert.equal(mt.tenantId, manifest.onboarding.tenantId);
    assert.equal(iso.namespace, manifest.onboarding.tenantId);
    assert.equal(mt.isolationModel, 'physical-path');
    assert.deepEqual(cfg, manifest.configuration);
    for (const c of iso.capabilityBoundaries) assert.ok(CAPABILITIES_WITH_EXECUTION_PATH.has(c));
  });
});

describe('post-activation lifecycle routes are governed (ADR-0034)', () => {
  test('capability enable = 200; suspend on a PROVISIONED tenant = 409; viewer suspend = 403', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const slug = 'carlisle-prod';
    assert.equal(A({ method: 'PATCH', path: `/api/tenants/${slug}/capabilities`, body: { capability: 'security-testing', enabled: true } }, d).status, 200);
    assert.equal(A({ method: 'POST', path: `/api/tenants/${slug}/suspend` }, d).status, 409); // needs ACTIVE
    assert.equal(route({ method: 'POST', path: `/api/tenants/${slug}/suspend`, principal: viewer }, d).status, 403);
    assert.equal(A({ method: 'PATCH', path: `/api/tenants/${slug}/configuration`, body: { patch: { customer: { environment: 'staging' } } } }, d).status, 200);
  });
});

describe('a real HTTP server enforces auth and serves the API', () => {
  test('an admin token round-trips; an anonymous call is 401', async () => {
    tick = 0;
    const authenticate = (h: IncomingHttpHeaders): AuthOutcome =>
      (h.authorization === 'Bearer admin-token' ? { outcome: 'authenticated', principal: admin }
        : h.authorization ? { outcome: 'rejected', reason: 'bad-signature' }
          : AUTH_ABSENT);
    const server = createServer({ ...deps(), authenticate });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const anon = await fetch(`${base}/api/tenants`);
      assert.equal(anon.status, 401);
      const post = await fetch(`${base}/api/tenants`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer admin-token' }, body: JSON.stringify(WELCOME) });
      assert.equal(post.status, 201);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('the audit trail attributes actions to the authenticated actor, not a spoofable body field (F-21)', () => {
  test('suspend records the signed-in admin as actor, ignoring a body.actor attempt', () => {
    tick = 0;
    const store = new InMemoryTenantConfigStore();
    const d: ApiDeps = { repo: new TenantConfigRepository(store, opts), services, registrationEndpoint: 'https://ip.example/register' };
    // Create the tenant, then seed the frozen state to ACTIVE (as the lifecycle tests do) so suspend is legal.
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const seeded = store.read('carlisle-prod')!;
    seeded.onboarding.lifecycleState = 'ACTIVE';
    store.write('carlisle-prod', seeded);
    // Alice suspends; the request body tries to attribute the action to someone else.
    const alice: Principal = { id: 'alice@dbiz.example', roles: ['platform-admin'] };
    const res = route({ method: 'POST', path: '/api/tenants/carlisle-prod/suspend', body: { actor: 'mallory@evil.example', reason: 'hold' }, principal: alice }, d);
    assert.equal(res.status, 200);
    const entry = store.read('carlisle-prod')!.onboarding.audit.find((a) => a.event === 'suspended')!;
    assert.match(entry.detail, /alice@dbiz\.example/);   // the authenticated principal
    assert.doesNotMatch(entry.detail, /mallory/);        // NOT the caller-supplied body actor
  });
});
