/**
 * Application-under-test targeting — CRM / D365 sign-in targets.
 * TRACEABILITY: ADR-0032 (SSOT) · INV-2 (no credential leaves the customer tenancy) · R-21.16
 *   Proves: the application CLASS and MFA posture declared at Welcome SURVIVE discovery enrichment
 *           (the regression that silently downgraded a D365 tenant to the generic web target);
 *           a sign-in target generates base-URL/username/password slots — plus a TOTP slot when the
 *           tenant declared MFA; non-sign-in targets generate none; and only env var NAMES are ever
 *           written into the package (INV-2).
 * Categories: contract, security, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, signInCredentials, generateTenantSolution,
  type RepositoryOptions, type WelcomeInput, type DiscoveredMetadata, type TenantEnvelope,
} from '../src/engine/index.js';
import { validateOnboarding } from '../src/domain/index.js';

let tick = 0;
const opts: RepositoryOptions = {
  now: () => `2026-08-01T00:00:${String(tick++ % 60).padStart(2, '0')}.000Z`,
  newTenantId: () => 'tnt-opaque-d365',
};

const welcome = (over: Partial<WelcomeInput> = {}): WelcomeInput => ({
  organisationName: 'Carlisle Homes', tenantName: 'Carlisle Test',
  primaryAdministrator: 'Ada', preferredCloud: 'dev', deploymentModel: 'container',
  applicationTypes: ['d365'], mfaRequired: true, ...over,
});

/**
 * The edge returns what it can OBSERVE — a name, a URL, an auth mechanism, browsers. It has no way
 * to report the application CLASS or an MFA policy, which is exactly why enrichment must not clear them.
 */
const DISCOVERED: DiscoveredMetadata = {
  application: {
    applicationName: 'Portal', environments: [{ name: 'test', url: 'https://portal.example.test' }],
    authenticationType: 'oauth', browserRequirements: ['chromium'],
  },
};

function enriched(w: WelcomeInput): TenantEnvelope {
  const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
  const env = repo.createFromWelcome(w);
  return repo.enrichDiscovery(env.onboarding.slug, DISCOVERED);
}

function generate(env: TenantEnvelope): Record<string, string> {
  const manifest = generateTenantSolution(env, {
    registrationEndpoint: 'https://gateway.dbiz.example/v1/register',
    issueCredential: (t) => `otc-${t}`,
  });
  return Object.fromEntries(manifest.files.map((f) => [f.path, f.content]));
}

describe('application target — declarations survive discovery', () => {
  test('REGRESSION: discovery enrichment preserves the declared application types', () => {
    const app = enriched(welcome()).configuration.customerOwned.application;
    // Discovery legitimately refines these…
    assert.equal(app.applicationName, 'Portal');
    assert.equal(app.applicationUrl, 'https://portal.example.test');
    // …but must NOT clear the customer's declaration. Before the fix this fell back to ['web'],
    // and the generated package silently lost its D365 credential slots.
    assert.deepEqual(app.applicationTypes, ['d365']);
  });

  test('REGRESSION: discovery enrichment preserves the declared MFA posture', () => {
    assert.deepEqual(enriched(welcome()).configuration.customerOwned.application.mfa, { required: true, method: 'totp' });
    assert.deepEqual(enriched(welcome({ mfaRequired: false })).configuration.customerOwned.application.mfa, { required: false, method: 'none' });
  });

  test('the enriched configuration still validates against the canonical schema', () => {
    assert.equal(validateOnboarding(enriched(welcome()).configuration as never).ok, true);
  });
});

describe('sign-in credential slots', () => {
  test('D365 takes precedence over the generic CRM block when both are selected', () => {
    assert.equal(signInCredentials(['crm', 'd365'])?.type, 'd365');
    assert.equal(signInCredentials(['crm'])?.baseUrlEnv, 'CRM_BASE_URL');
  });

  test('a sign-in target names base URL, username and password slots', () => {
    const creds = signInCredentials(['d365'], { required: false });
    assert.deepEqual(creds, {
      type: 'd365', baseUrlEnv: 'D365_BASE_URL', usernameEnv: 'D365_USERNAME', passwordEnv: 'D365_PASSWORD',
      mfa: { required: false, method: 'none' },
    });
  });

  test('MFA adds a TOTP slot, and defaults to totp when required without a method', () => {
    assert.equal(signInCredentials(['d365'], { required: true })?.mfa.totpSecretEnv, 'D365_TOTP_SECRET');
    assert.equal(signInCredentials(['crm'], { required: true, method: 'totp' })?.mfa.totpSecretEnv, 'CRM_TOTP_SECRET');
  });

  test('MFA is never asserted without an explicit declaration, and adds no slot when absent', () => {
    const creds = signInCredentials(['d365']);
    assert.equal(creds?.mfa.required, false);
    assert.equal(creds?.mfa.totpSecretEnv, undefined);
  });

  test('non-sign-in application types get no credential slots', () => {
    for (const t of ['react', 'angular', 'web', 'web-api', 'mobile', 'other']) {
      assert.equal(signInCredentials([t]), null, `${t} must not be treated as a sign-in target`);
    }
  });
});

describe('generated EP package — D365 tenant', () => {
  test('integrations.json carries the D365 credential + MFA env references', () => {
    const files = generate(enriched(welcome()));
    const integrations = JSON.parse(files['config/integrations.json']!);
    assert.deepEqual(integrations.application.types, ['d365']);
    assert.equal(integrations.application.baseUrlEnv, 'D365_BASE_URL');
    assert.deepEqual(integrations.application.credentials, {
      baseUrlEnv: 'D365_BASE_URL', usernameEnv: 'D365_USERNAME', passwordEnv: 'D365_PASSWORD',
      mfa: { required: true, method: 'totp', totpSecretEnv: 'D365_TOTP_SECRET' },
    });
    // Every capability resolves `app-default`, so the profile must carry the same slots.
    assert.equal(integrations.authProfiles['app-default'].usernameEnv, 'D365_USERNAME');
    assert.equal(integrations.authProfiles['app-default'].mfa.totpSecretEnv, 'D365_TOTP_SECRET');
  });

  test('.env.example exposes a fill-in slot for base URL, username, password and TOTP secret', () => {
    const envFile = generate(enriched(welcome()))['.env.example']!;
    for (const v of ['D365_BASE_URL', 'D365_USERNAME', 'D365_PASSWORD', 'D365_TOTP_SECRET']) {
      assert.match(envFile, new RegExp(`^${v}=`, 'm'), `${v} must have an assignable slot in .env.example`);
    }
    assert.match(envFile, /Dynamics 365 \/ application target/);
  });

  test('no TOTP slot is generated when the tenant did not declare MFA', () => {
    const files = generate(enriched(welcome({ mfaRequired: false })));
    assert.equal(JSON.parse(files['config/integrations.json']!).application.credentials.mfa.required, false);
    assert.doesNotMatch(files['.env.example']!, /^D365_TOTP_SECRET=/m);
  });

  test('INV-2: the package carries env var NAMES only — never a credential value', () => {
    // A filled slot (`NAME=value`) would mean the generator baked a secret into the package.
    const envFile = generate(enriched(welcome()))['.env.example']!;
    for (const v of ['D365_USERNAME', 'D365_PASSWORD', 'D365_TOTP_SECRET']) {
      assert.match(envFile, new RegExp(`^${v}=\\s*(#.*)?$`, 'm'), `${v} must be generated EMPTY`);
    }
  });

  test('a non-sign-in tenant generates no credentials block', () => {
    const files = generate(enriched(welcome({ applicationTypes: ['react'], mfaRequired: false })));
    const integrations = JSON.parse(files['config/integrations.json']!);
    assert.equal(integrations.application.credentials, undefined);
    assert.equal(integrations.application.baseUrlEnv, 'TEST_BASE_URL');
    assert.match(files['.env.example']!, /^TEST_BASE_URL=/m);
  });

  test('EP-CONFIGURATION.md tells the operator which slots to fill', () => {
    const doc = generate(enriched(welcome()))['docs/EP-CONFIGURATION.md']!;
    assert.match(doc, /sign-in target/);
    assert.match(doc, /D365_BASE_URL/);
    assert.match(doc, /MFA is \*\*enforced\*\*/);
  });
});
