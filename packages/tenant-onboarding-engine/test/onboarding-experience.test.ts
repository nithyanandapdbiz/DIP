/**
 * Onboarding Experience + Tenant Configuration Repository (SSOT).
 * TRACEABILITY: ADR-0032 (SSOT) · ADR-0031 · ADR-0030 (single onboard(), reused) · INV-2 · R-21.3 · R-21.11
 *   Proves: Stage-1 creates tenant.json immediately with an OPAQUE id; progressive enrichment updates ONE file;
 *           onboard() consumes the SSOT's configuration unchanged (no mapper); Tenant Management listing;
 *           export/import/clone; migration from a legacy session; certify-before-activate; INV-2 (no credential).
 * Categories: contract, security, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAPABILITIES_WITH_EXECUTION_PATH, CREDENTIAL_MARKERS, type BootstrapServices } from '../src/domain/index.js';
import {
  OnboardingSessionService, InMemorySessionStore,
  TenantConfigRepository, InMemoryTenantConfigStore, FileTenantConfigStore,
  SimulatedEdge, recommend, deterministicAdvisor, activate,
  type RepositoryOptions, type WelcomeInput, type ConnectionSelection,
  type ProjectManagementMetadata, type TestManagementMetadata,
  type SourceControlMetadata, type ApplicationMetadata,
} from '../src/engine/index.js';

let tick = 0;
const opts: RepositoryOptions = { now: () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`, newTenantId: () => 'tnt-opaque-01' };
const services: BootstrapServices = {
  auth: { issueOneTimeCredential: (t: string) => `otc-${t}` },
  registration: { recordTenantCreated: () => { /* audit side effect */ } },
  now: () => '2026-07-23T00:00:00.000Z',
};
const WELCOME: WelcomeInput = {
  organisationName: 'Carlisle Homes', tenantName: 'Carlisle Prod',
  primaryAdministrator: 'John Smith', primaryAdministratorEmail: 'john@carlisle.example',
  preferredCloud: 'azure', deploymentModel: 'container',
};

async function enrichThrough(repo: TenantConfigRepository, slug: string) {
  const edge = new SimulatedEdge();
  const connections: ConnectionSelection[] = [
    { kind: 'project-management', provider: 'jira', connected: true },
    { kind: 'test-management', provider: 'zephyr-scale', connected: true, repositoryDisposition: 'reuse-existing', baseUrl: 'https://carlisle.atlassian.net', planId: 'plan-4471', suiteId: 'suite-9920', suiteKind: 'requirement-based' },
    { kind: 'source-control', provider: 'github', connected: true },
    { kind: 'ai', provider: 'capability', connected: true },
  ];
  repo.enrichIntegrations(slug, connections);
  const discovered = {
    projectManagement: await edge.discover('projectManagement', slug) as ProjectManagementMetadata,
    testManagement: await edge.discover('testManagement', slug) as TestManagementMetadata,
    sourceControl: await edge.discover('sourceControl', slug) as SourceControlMetadata,
    application: await edge.discover('application', slug) as ApplicationMetadata,
  };
  repo.enrichDiscovery(slug, discovered);
  repo.enrichRecommendations(slug, recommend(discovered, deterministicAdvisor, 'container'));
}

describe('Stage 1 creates the SSOT immediately with an opaque identity (R-21.3)', () => {
  test('createFromWelcome writes tenant.json with status Onboarding and an opaque id', () => {
    tick = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    const env = repo.createFromWelcome(WELCOME);
    assert.equal(env.onboarding.slug, 'carlisle-prod');       // human slug
    assert.equal(env.onboarding.tenantId, 'tnt-opaque-01');   // opaque, NOT the customer name (R-21.3)
    assert.notEqual(env.onboarding.tenantId, env.onboarding.slug);
    assert.equal(env.onboarding.status, 'Onboarding');
    assert.equal(env.onboarding.progress, 33); // advanced to 'connect' after creation
    assert.ok(env.onboarding.audit.some((a) => a.event === 'tenant-created'), 'audit opened at creation');
    assert.equal(env.configuration.customer.customerName, 'Carlisle Homes');
    assert.equal(env.configuration.customerOwned.deployment.executionPlaneName, 'carlisle-prod_ExecutionPlane');
  });
});

describe('one customer cannot become two tenants (separator-only duplicates)', () => {
  // Regression: a live tenant existed twice — "carlislehomes" (tnt-42d3e7e9d324) and
  // "carlisle-homes" (tnt-eb7e75f1d0de). The EP package was generated from the first while its
  // token was issued by the second, so every tenant-scoped call returned
  // 403 not permitted for tenant "carlislehomes". Nothing detected it until runtime.
  test('a name differing only by separators is refused, naming the tenant to reuse', () => {
    tick = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    repo.createFromWelcome({ ...WELCOME, tenantName: 'Carlisle Homes' });
    assert.throws(
      () => repo.createFromWelcome({ ...WELCOME, tenantName: 'CarlisleHomes' }),
      (e: Error) => /already exists/.test(e.message) && /carlisle-homes/.test(e.message),
      'the second spelling must be refused and must name the existing tenant');
  });

  test('names differing in substance still create distinct tenants', () => {
    tick = 0;
    let idn = 0;
    // A per-tenant id generator: the shared `opts` returns a constant, which would make the
    // distinctness assertion below a test of the stub rather than of the guard.
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), { now: opts.now!, newTenantId: () => `tnt-${idn++}` });
    const prod = repo.createFromWelcome({ ...WELCOME, tenantName: 'Carlisle Prod' });
    const test_ = repo.createFromWelcome({ ...WELCOME, tenantName: 'Carlisle Test' });
    assert.equal(prod.onboarding.slug, 'carlisle-prod');
    assert.equal(test_.onboarding.slug, 'carlisle-test');
    assert.notEqual(prod.onboarding.tenantId, test_.onboarding.tenantId);
  });
});

describe('progressive enrichment updates ONE file (no duplicate configuration model)', () => {
  test('discovery and recommendations write into the same tenant.json', async () => {
    tick = 0;
    const store = new InMemoryTenantConfigStore();
    const repo = new TenantConfigRepository(store, opts);
    repo.createFromWelcome(WELCOME);
    await enrichThrough(repo, 'carlisle-prod');
    const env = repo.load('carlisle-prod')!;
    assert.equal(env.configuration.customerOwned.projectManagement.project, 'CARL');
    assert.equal(env.configuration.customerOwned.testManagement.projectKey, 'CARL');
    assert.equal(env.configuration.technologyProfile.framework, 'playwright');
    assert.equal(env.configuration.customerOwned.application.applicationUrl, 'https://portal.example.test');
    assert.ok(env.provenance.discovery, 'discovery provenance retained');
    assert.ok(env.provenance.recommendations, 'recommendation provenance retained');
    // Exactly one tenant exists — no second copy was created.
    assert.equal(store.list().length, 1);
  });
});

describe('onboard() consumes the SSOT configuration directly (no mapper) — ADR-0030 reused', () => {
  test('a certified tenant.json runs onboard() and reaches PROVISIONED', async () => {
    tick = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    repo.createFromWelcome(WELCOME);
    await enrichThrough(repo, 'carlisle-prod');
    const outcome = activate(repo, 'carlisle-prod', services, { registrationEndpoint: 'https://ip.example/register' });
    assert.equal(outcome.certification.ok, true);
    assert.ok(outcome.result, 'onboard() ran');
    assert.equal(outcome.result.intelligencePlaneComplete, true);
    assert.equal(outcome.result.lifecycleState, 'PROVISIONED');
    // The SSOT records the outcome — one file, start to finish.
    const env = repo.load('carlisle-prod')!;
    assert.equal(env.onboarding.status, 'Provisioned');
    assert.equal(env.onboarding.lifecycleState, 'PROVISIONED');
    assert.equal(env.onboarding.projection, 'WAITING_FOR_DEPLOYMENT');
  });
});

describe('activation never occurs before certification succeeds', () => {
  test('an incoherent tenant.json is refused and onboard() is NOT called', () => {
    tick = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    repo.createFromWelcome(WELCOME);
    // Connect a PM provider but never discover its project → incoherent at stage 4.
    repo.enrichIntegrations('carlisle-prod', [{ kind: 'project-management', provider: 'jira', connected: true }]);
    const outcome = activate(repo, 'carlisle-prod', services, { registrationEndpoint: 'https://ip.example/register' });
    assert.equal(outcome.certification.ok, false);
    assert.equal(outcome.result, undefined, 'onboard() did not run');
    assert.equal(repo.load('carlisle-prod')!.onboarding.status, 'Failed');
  });
});

describe('Tenant Management + resume read from the SSOT', () => {
  test('a tenant appears in the listing the instant Stage 1 completes', () => {
    tick = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    repo.createFromWelcome(WELCOME);
    const list = repo.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]!.displayName, 'Carlisle Homes');
    assert.equal(list[0]!.status, 'Onboarding');
    assert.equal(list[0]!.progress, 33);
    // Resume = reload the SSOT.
    assert.ok(repo.load('carlisle-prod'), 'resume reloads tenant.json');
  });
});

describe('export / import / clone', () => {
  test('export round-trips through import; clone mints a fresh opaque identity', () => {
    tick = 0;
    let idn = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), { now: opts.now!, newTenantId: () => `tnt-${idn++}` });
    repo.createFromWelcome(WELCOME);
    const text = repo.exportJson('carlisle-prod');
    // Import models RESTORING/MIGRATING a tenant.json into another instance — the opaque id is preserved
    // there. Round-trip into a fresh repo keeps identity and content.
    const repo2 = new TenantConfigRepository(new InMemoryTenantConfigStore(), { now: opts.now!, newTenantId: () => `tnt-x${idn++}` });
    const imported = repo2.importJson(text, 'carlisle-copy');
    assert.equal(imported.onboarding.slug, 'carlisle-copy');
    assert.equal(imported.onboarding.tenantId, repo.load('carlisle-prod')!.onboarding.tenantId, 'import preserves the opaque identity');
    // But a DUPLICATE opaque id in the SAME repo is refused — it would break tenantId uniqueness (R-21.3),
    // which security-critical lookups (EP registration) depend on.
    assert.throws(() => repo.importJson(text, 'carlisle-dupe'), /already in use/);
    const cloned = repo.clone('carlisle-prod', 'carlisle-staging');
    assert.notEqual(cloned.onboarding.tenantId, repo.load('carlisle-prod')!.onboarding.tenantId, 'clone gets a new id (R-21.26)');
    assert.equal(cloned.configuration.customerOwned.deployment.executionPlaneName, 'carlisle-staging_ExecutionPlane');
  });
});

describe('migration from the previous session model', () => {
  test('a legacy in-memory session becomes a tenant.json in the repository', () => {
    tick = 0;
    // The old model held config on the session; migration re-homes it into the SSOT via createFromWelcome.
    const sessions = new OnboardingSessionService(new InMemorySessionStore(), { now: opts.now! });
    const s = sessions.start('legacy-1');
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    const env = repo.createFromWelcome(WELCOME);
    sessions.linkTenant(s.id, env.onboarding.slug);
    assert.equal(sessions.resume('legacy-1')!.tenantSlug, 'carlisle-prod');
    assert.ok(repo.load('carlisle-prod'), 'config now lives in the repository, not the session');
  });
});

describe('the file store writes a real tenants/<slug>/tenant.json tree', () => {
  test('createFromWelcome produces a readable tenant.json on disk', () => {
    tick = 0;
    const dir = mkdtempSync(join(tmpdir(), 'dbiz-tenants-'));
    try {
      const repo = new TenantConfigRepository(new FileTenantConfigStore(dir), opts);
      repo.createFromWelcome(WELCOME);
      const file = join(dir, 'carlisle-prod', 'tenant.json');
      assert.ok(existsSync(file), 'tenant.json exists on disk');
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      assert.equal(parsed.onboarding.tenantId, 'tnt-opaque-01');
      assert.equal(repo.list().length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('no customer credential exists in the SSOT (INV-2)', () => {
  test('no field name in tenant.json resembles a credential', async () => {
    tick = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    repo.createFromWelcome(WELCOME);
    await enrichThrough(repo, 'carlisle-prod');
    const env = repo.load('carlisle-prod')!;
    const names: string[] = [];
    const walk = (v: unknown): void => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k, val] of Object.entries(v)) { names.push(k); walk(val); }
      } else if (Array.isArray(v)) { for (const el of v) walk(el); }
    };
    walk(env.configuration);
    assert.ok(names.length > 0, 'the configuration was walked');
    for (const name of names) {
      for (const marker of CREDENTIAL_MARKERS) {
        assert.ok(!name.toLowerCase().includes(marker), `field "${name}" resembles a credential ("${marker}") — INV-2 forbids it`);
      }
    }
  });
  test('every recommended capability has a verified execution path (R-21.11)', async () => {
    tick = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    repo.createFromWelcome(WELCOME);
    await enrichThrough(repo, 'carlisle-prod');
    for (const c of repo.load('carlisle-prod')!.configuration.dbiz.entitledCapabilities) {
      assert.ok(CAPABILITIES_WITH_EXECUTION_PATH.has(c), `capability ${c} has an execution path`);
    }
  });
});
