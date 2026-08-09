/**
 * TENANT LIFECYCLE CONFORMANCE SCENARIO — the Platform Core onboarding orchestrator.
 * ============================================================================
 * Exercises TLM end to end and reports what was OBSERVED as JSON. Asserts nothing;
 * exits 0 either way. The gate that spawns it decides pass or fail (R-14.2: the
 * evidence is regenerated on every run, never read from a committed file).
 *
 *   TL-1  a valid configuration completes stages 1-7 and provisions the tenant (C-21.28)
 *   TL-2  stages 8-14 are reported pending; the tenant is never ACTIVE (C-21.29)
 *   TL-3  no tenant reaches ACTIVE without stage 10/11/12 evidence (C-21.16, R-21.29)
 *   TL-4  the projection is derived from canonical state; only ACTIVE executes (C-21.30, R-21.6)
 *   TL-5  the onboarding configuration contains no credential field (C-21.31, INV-2)
 *   TL-6  an entitlement with no execution path is refused at provisioning (C-21.6, R-21.11)
 *   TL-7  a malformed configuration halts at its stage and creates nothing (C-21.18)
 *   TL-8  the lifecycle declares exactly the six canonical states (R-21.5)
 *
 * Run:  node governance/tenant-lifecycle/run-tenant-lifecycle-conformance.mjs
 * Out:  {"properties":[...],"digest":"<sha256>","fatal":null}
 */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');

const properties = [];
const record = (id, property, ok, detail) => properties.push({ id, property, ok: Boolean(ok), detail });
let fatal = null;

try {
  const tlm = await import(pathToFileURL(entry('tenant-onboarding-engine')).href);

  let tick = 0;
  const now = () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`;
  const services = {
    auth: { issueOneTimeCredential: (t) => `otc-${t}` },
    registration: { recordTenantCreated: () => {} },
    now,
  };
  const configuration = {
    configurationVersion: '1.0.0',
    customer: { customerName: 'Carlisle Homes', tenantName: 'carlisle-prod', businessUnit: 'QA', environment: 'production' },
    technologyProfile: {
      profileVersion: '1.0.0', language: 'typescript', framework: 'playwright', testRunner: 'playwright-test',
      ciSystem: 'github-actions', gitProvider: 'github', cloudProvider: 'azure', deploymentModel: 'container',
      packageManager: 'pnpm', reportingFramework: 'allure', frameworkVersions: { '@playwright/test': '1.48.0' },
    },
    dbiz: { entitledCapabilities: ['functional-testing', 'security-testing'], contractVersion: '1.0.0', retentionObligationDays: 365 },
    customerOwned: {
      deployment: { executionPlaneName: 'carlisle-ep', region: 'australiaeast' },
      application: { applicationName: 'Portal', applicationUrl: 'https://portal.example.com', authenticationType: 'oauth', browserRequirements: ['chromium'] },
      projectManagement: { provider: 'jira', project: 'CARL' },
      // ADR-0085 — a tenant that selects a test tool now DECLARES its disposition toward the test
      // repository, and carries the identifier that disposition consumes (`reuse-existing` ⇒ the id).
      // An omitted disposition is REFUSED rather than defaulted, so this scenario would otherwise
      // fail to provision — which is the change working, at the platform's front door.
      testManagement: {
        provider: 'zephyr-scale', projectKey: 'CARL',
        repositoryDisposition: 'reuse-existing',
        baseUrl: 'https://carlisle.atlassian.net',
        planId: 'plan-4471', suiteId: 'suite-9920', suiteKind: 'requirement-based',
      },
      ai: { providerHandle: 'tenant-handle', capabilityClasses: ['generation'] },
      security: { mutualTls: true, oauth: true, vault: true },
    },
  };
  const request = { tenantId: 'tnt-001', configuration, registrationEndpoint: 'https://ip.example.com/register' };

  // TL-1
  const run = tlm.onboard(request, services);
  record('TL-1', 'stages 1-7 complete and the tenant is provisioned', c21_28(run),
    `IP complete=${run.intelligencePlaneComplete}, state=${run.lifecycleState}, projection=${run.projection}`);

  // TL-2
  const deferred = run.stages.filter((s) => [8, 9, 10, 11, 12, 13, 14].includes(s.stage));
  const allPending = deferred.length === 7 && deferred.every((s) => s.status === 'pending' && s.detail.length > 0);
  record('TL-2', 'stages 8-14 pending, never ACTIVE', allPending && run.lifecycleState !== 'ACTIVE',
    `${deferred.filter((s) => s.status === 'pending').length}/7 pending, state=${run.lifecycleState}`);

  // TL-3
  const lc = new tlm.TenantLifecycle({ tenantId: 't', now });
  lc.transition('PROVISIONED', 'scenario', 'provisioned');
  lc.completeStage(10); lc.completeStage(11); // 12 missing
  const refusedNoSmoke = lc.transition('ACTIVE', 'scenario', 'attempt');
  lc.completeStage(12);
  const allowedWithSmoke = lc.transition('ACTIVE', 'scenario', 'evidence complete');
  record('TL-3', 'no ACTIVE without stage 10/11/12 evidence',
    refusedNoSmoke.ok === false && allowedWithSmoke.ok === true && lc.canExecute === true,
    `refused-without-smoke=${!refusedNoSmoke.ok}, allowed-with-smoke=${allowedWithSmoke.ok}`);

  // TL-4
  const projOk = tlm.projectLifecycle('ACTIVE', new Set()) === 'OPERATIONAL'
    && tlm.projectLifecycle('PROVISIONED', new Set([7])) === 'WAITING_FOR_DEPLOYMENT';
  const onlyActiveExecutes = tlm.CANONICAL_STATES.every((s) =>
    new tlm.TenantLifecycle({ tenantId: 't', initialState: s }).canExecute === (s === 'ACTIVE'));
  record('TL-4', 'projection derived; only ACTIVE executes', projOk && onlyActiveExecutes,
    `projection-derivation=${projOk}, only-ACTIVE-executes=${onlyActiveExecutes}`);

  // TL-5 — walk the schema and prove no field name resembles a credential.
  const names = [];
  const walk = (schema) => {
    const s = schema;
    if (s && typeof s === 'object' && s.shape && typeof s.shape === 'object') {
      for (const [k, child] of Object.entries(s.shape)) { names.push(k); walk(child); }
    }
    const def = s?._def;
    if (def?.innerType) walk(def.innerType);
    if (def?.element) walk(def.element);
  };
  walk(tlm.OnboardingConfigurationSchema);
  const leaks = names.filter((n) => tlm.CREDENTIAL_MARKERS.some((m) => n.toLowerCase().includes(m)));
  record('TL-5', 'no credential field is representable (INV-2)', names.length > 0 && leaks.length === 0,
    `${names.length} fields walked, ${leaks.length} credential-like`);

  // TL-6
  const orphaned = tlm.entitlementsWithoutExecutionPath(['functional-testing', 'security-testing'], new Set(['functional-testing']));
  const allBacked = tlm.entitlementsWithoutExecutionPath(['functional-testing', 'penetration-testing']);
  record('TL-6', 'entitlement without execution path refused', orphaned.length === 1 && allBacked.length === 0,
    `lagging-registry-orphans=${JSON.stringify(orphaned)}, real-registry-orphans=${allBacked.length}`);

  // TL-7
  const bad = tlm.onboard({ ...request, configuration: { configurationVersion: '1.0.0' } }, services);
  record('TL-7', 'a malformed configuration halts and creates nothing', bad.haltedAt === 3 && bad.lifecycleState === 'REGISTERED',
    `haltedAt=${bad.haltedAt}, state=${bad.lifecycleState}`);

  // TL-8
  const six = JSON.stringify([...tlm.CANONICAL_STATES]);
  record('TL-8', 'exactly the six canonical states (R-21.5)',
    six === JSON.stringify(['REGISTERED', 'PROVISIONED', 'ACTIVE', 'SUSPENDED', 'OFFBOARDING', 'CLOSED']), six);

  function c21_28(r) {
    return r.intelligencePlaneComplete === true && r.lifecycleState === 'PROVISIONED'
      && r.projection === 'WAITING_FOR_DEPLOYMENT'
      && [1, 2, 3, 4, 5, 6, 7].every((n) => r.stages.find((x) => x.stage === n)?.status === 'done');
  }
} catch (e) {
  fatal = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
}

const digest = createHash('sha256').update(JSON.stringify(properties.map((p) => [p.id, p.ok]))).digest('hex');
process.stdout.write(JSON.stringify({ properties, digest, fatal }));
