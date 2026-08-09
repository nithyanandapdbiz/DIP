/**
 * Tenant Lifecycle — onboarding configuration model.
 * TRACEABILITY: 21-tenant-lifecycle.md §3 (R-21.8, R-21.16) · ADR-0030
 *   Criteria: C-21.4 (configuration-only onboarding) · C-21.9 (ownership columns distinct)
 *   Invariant: INV-2 (DBiz never holds a customer credential)
 * Categories: contract, security, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OnboardingConfigurationSchema,
  validateConfiguration,
  CREDENTIAL_MARKERS,
  type OnboardingConfiguration,
} from '../src/domain/onboarding-configuration.js';

const valid: OnboardingConfiguration = {
  configurationVersion: '1.0.0',
  customer: { customerName: 'Carlisle Homes', tenantName: 'carlisle-prod', businessUnit: 'QA', environment: 'production' },
  technologyProfile: {
    profileVersion: '1.0.0', language: 'typescript', framework: 'playwright', testRunner: 'playwright-test',
    ciSystem: 'github-actions', gitProvider: 'github', cloudProvider: 'azure', deploymentModel: 'container',
    packageManager: 'pnpm', reportingFramework: 'allure', frameworkVersions: { '@playwright/test': '1.48.0' },
  },
  dbiz: { entitledCapabilities: ['functional-testing'], contractVersion: '1.0.0', retentionObligationDays: 365 },
  customerOwned: {
    deployment: { executionPlaneName: 'carlisle-ep', region: 'australiaeast' },
    application: { applicationName: 'Portal', applicationUrl: 'https://portal.example.com', authenticationType: 'oauth', browserRequirements: ['chromium'] },
    projectManagement: { provider: 'jira', project: 'CARL', board: 'CARL-1' },
    // ADR-0085 — a coherent configuration now DECLARES its disposition and carries the identifier
    // the declared disposition consumes. `reuse-existing` consumes the plan ID, not the name.
    testManagement: {
      provider: 'zephyr-scale', projectKey: 'CARL',
      repositoryDisposition: 'reuse-existing',
      baseUrl: 'https://carlisle.atlassian.net',
      planId: 'plan-4471', suiteId: 'suite-9920', suiteKind: 'requirement-based',
    },
    ai: { providerHandle: 'tenant-selected-handle', capabilityClasses: ['generation', 'classification'], routing: 'default' },
    security: { mutualTls: true, oauth: true, vault: true },
  },
};

describe('onboarding is configuration-driven (C-21.4)', () => {
  test('a complete, coherent configuration validates', () => {
    const r = validateConfiguration(valid);
    assert.equal(r.ok, true);
  });

  test('a malformed configuration returns a typed rejection, never throws (R-21.31)', () => {
    const r = validateConfiguration({ configurationVersion: '1.0.0' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'malformed');
  });

  test('unknown top-level keys are rejected — the schema is strict', () => {
    const r = validateConfiguration({ ...valid, rogue: 'field' });
    assert.equal(r.ok, false);
  });
});

describe('ownership columns are distinct types (C-21.9, R-21.16)', () => {
  test('the DBiz column and the customer column are separate objects', () => {
    const shape = OnboardingConfigurationSchema.shape;
    assert.ok('dbiz' in shape, 'DBiz-owned column present');
    assert.ok('customerOwned' in shape, 'customer-owned column present');
  });

  test('entitlements live only in the DBiz column', () => {
    // A customer cannot grant itself a capability: entitledCapabilities is not in the
    // customer column, so the schema rejects it there (strict object).
    const tampered = {
      ...valid,
      customerOwned: { ...valid.customerOwned, entitledCapabilities: ['penetration-testing'] },
    };
    const r = validateConfiguration(tampered);
    assert.equal(r.ok, false);
  });
});

describe('no credential is representable (INV-2) — structural', () => {
  // D-018: prefer structural impossibility to tests. The ABSENCE of any credential
  // field is what makes a customer credential unleakable by DBiz. This test walks the
  // entire schema and fails if any field name looks like a secret, so a future field
  // cannot reintroduce one unnoticed.
  test('no field name anywhere in the schema resembles a credential', () => {
    const names: string[] = [];
    const walk = (schema: unknown): void => {
      const s = schema as { shape?: Record<string, unknown>; _def?: { type?: string; innerType?: unknown; element?: unknown } };
      if (s && typeof s === 'object' && s.shape && typeof s.shape === 'object') {
        for (const [key, child] of Object.entries(s.shape)) { names.push(key); walk(child); }
      }
      const def = s?._def;
      if (def?.innerType) walk(def.innerType);
      if (def?.element) walk(def.element);
    };
    walk(OnboardingConfigurationSchema);
    assert.ok(names.length > 0, 'the schema was actually walked');
    for (const name of names) {
      const lower = name.toLowerCase();
      for (const marker of CREDENTIAL_MARKERS) {
        assert.ok(!lower.includes(marker), `field "${name}" resembles a credential ("${marker}") — INV-2 forbids it`);
      }
    }
  });
});
