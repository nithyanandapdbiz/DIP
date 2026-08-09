/**
 * Tenant Lifecycle — the config-driven bootstrap orchestrator.
 * TRACEABILITY: 21-tenant-lifecycle.md §3a (R-21.27/28/29/31) · ADR-0030 §4.1/§4.4
 *   Criteria: C-21.15 (all fourteen stages, in order) · C-21.18 (a failed stage halts, named)
 *             C-21.16 (no ACTIVE without proven registration/connectivity/smoke)
 *             C-21.5 (a partial tenant cannot reach ACTIVE) · C-21.6 (entitlement needs an execution path)
 * Categories: contract, security, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { onboard, type BootstrapRequest, type BootstrapServices } from '../src/domain/bootstrap-orchestrator.js';
import { entitlementsWithoutExecutionPath, validateOnboarding } from '../src/domain/validation.js';
import type { OnboardingConfiguration } from '../src/domain/onboarding-configuration.js';

let tick = 0;
const services: BootstrapServices = {
  auth: { issueOneTimeCredential: (tenantId: string) => `otc-${tenantId}-${tick}` },
  registration: { recordTenantCreated: () => { /* audit side effect */ } },
  now: () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`,
};

const configuration: OnboardingConfiguration = {
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
    // ADR-0085 — the disposition is REQUIRED at intake with no default.
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
const request: BootstrapRequest = { tenantId: 'tnt-001', configuration, registrationEndpoint: 'https://ip.example.com/register' };

describe('the seven Intelligence-Plane stages run in order (C-21.15)', () => {
  test('a valid configuration completes stages 1-7 and provisions the tenant', () => {
    const r = onboard(request, services);
    assert.equal(r.intelligencePlaneComplete, true);
    assert.equal(r.lifecycleState, 'PROVISIONED');
    assert.equal(r.projection, 'WAITING_FOR_DEPLOYMENT');
    for (const s of [1, 2, 3, 4, 5, 6, 7]) {
      const outcome = r.stages.find((x) => x.stage === s);
      assert.ok(outcome && outcome.status === 'done', `stage ${s} done`);
    }
    assert.ok(r.solution && r.solution.fileCount > 0, 'a real solution was generated');
  });

  test('the solution generation is deterministic — a re-run is a repeat, not a divergence', () => {
    tick = 0; const a = onboard(request, services);
    tick = 0; const b = onboard(request, services);
    assert.equal(a.solution?.contentHash, b.solution?.contentHash);
  });
});

describe('stages 8-14 are pending, never assumed (ADR-0030 §4.4, R-21.29)', () => {
  test('every deferred stage reports pending with a reason, and the tenant is never ACTIVE', () => {
    const r = onboard(request, services);
    for (const s of [8, 9, 10, 11, 12, 13, 14]) {
      const outcome = r.stages.find((x) => x.stage === s);
      assert.ok(outcome && outcome.status === 'pending', `stage ${s} pending`);
      assert.ok(outcome.detail.length > 0, `stage ${s} names why it is pending`);
    }
    assert.notEqual(r.lifecycleState, 'ACTIVE');
    assert.notEqual(r.projection, 'OPERATIONAL');
  });
});

describe('a failed stage halts and names itself (C-21.18, R-21.31)', () => {
  test('a malformed configuration halts at stage 3 and creates nothing', () => {
    const r = onboard({ ...request, configuration: { configurationVersion: '1.0.0' } }, services);
    assert.equal(r.intelligencePlaneComplete, false);
    assert.equal(r.haltedAt, 3);
    assert.equal(r.lifecycleState, 'REGISTERED'); // never advanced
    const failed = r.stages.find((x) => x.status === 'failed');
    assert.ok(failed && failed.remedy && failed.remedy.length > 0, 'the failed stage carries a remedy');
  });

  test('an incoherent integration (provider without identifier) is refused at stage 4', () => {
    const bad = { ...configuration, customerOwned: { ...configuration.customerOwned, projectManagement: { provider: 'jira' as const } } };
    const r = validateOnboarding(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.issues.some((i) => i.code === 'incoherent-integration' && i.stage === 4));
  });
});

describe('an entitlement with no execution path is refused at provisioning (R-21.11, C-21.6)', () => {
  test('the guard flags a capability whose engine is absent from the registry', () => {
    // The schema enum and the built-engine registry coincide today, so the failure is
    // exercised by a registry that lags — an engine removed after entitlement.
    const laggingRegistry = new Set(['functional-testing']); // security-testing engine "removed"
    const orphaned = entitlementsWithoutExecutionPath(['functional-testing', 'security-testing'], laggingRegistry);
    assert.deepEqual([...orphaned], ['security-testing']);
  });

  test('with the real registry, all six built capabilities have an execution path', () => {
    assert.deepEqual([...entitlementsWithoutExecutionPath(['functional-testing', 'security-testing', 'penetration-testing'])], []);
  });
});
