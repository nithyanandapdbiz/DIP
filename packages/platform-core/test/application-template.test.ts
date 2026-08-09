/**
 * Application Template Registry — contract, structural guards and INV-2.
 * TRACEABILITY: ADR-0021 · ADR-0030 (one generator) · C-03.16 · C-03.17 · C-03.18 (deterministic)
 *   Invariant: INV-2 (no customer credential representable in the Intelligence Plane)
 *   Proves: every registered template is well-formed and self-consistent; a malformed one is
 *           REFUSED at registration rather than reaching a customer's package; resolution is
 *           deterministic and precedence-ordered; the validation evaluator is scope-correct; and
 *           no template anywhere carries a credential VALUE.
 * Categories: contract, security, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLICATION_TEMPLATES, APPLICATION_TYPE_IDS, REGISTERED_TEMPLATES, FALLBACK_APPLICATION_TEMPLATE_ID,
  ApplicationTemplateRegistry, buildRegistry, resolveApplicationTemplate, resolveApplicationTemplates,
  resolveConfigFields, resolveAllConfigFields, resolveAuthentication, evaluateApplicationValidation,
  primaryTargetEnvVar, conditionHolds, envVarNameFor, isPlaceholder,
  ADAPTER_INTERFACES, adapterInterface,
  AUTHENTICATION_STRATEGIES, DISCOVERY_STRATEGIES, EXECUTION_STRATEGIES, VALIDATION_RULES, VALIDATION_SCOPES,
  type ApplicationTemplate, type ApplicationContext,
} from '../src/index.js';
import { WEB_TEMPLATE } from '../src/application-templates/web.js';

const ctx = (over: Partial<ApplicationContext> = {}): ApplicationContext => ({
  applicationTypes: ['web'], mfa: { required: false, method: 'none' }, ...over,
});

/** A minimal valid template, mutated per test to exercise one guard at a time. */
function draft(over: Partial<ApplicationTemplate> = {}): ApplicationTemplate {
  return {
    id: 'draft', label: 'Draft', description: 'test fixture', category: 'custom', precedence: 0,
    envPrefix: 'DRAFT', primaryTargetField: 'baseUrl',
    authentication: {
      id: 'anonymous', label: 'anonymous', credentialModel: 'none', captureSession: false,
      storageStateReuse: false, mfaSupported: false, sessionRefresh: { strategy: 'none' }, credentialFields: [],
    },
    discovery: { strategy: 'anonymous', label: 'crawl', profile: {} },
    execution: { strategy: 'anonymous', label: 'drive', sessionRefresh: false, profile: {} },
    runtime: {
      adapterInterfaces: ['I2-browser'], primaryAdapterInterface: 'I2-browser', browserRequired: true,
      headlessSupported: true, maxParallelSessions: 1, supportsUiExecution: true, supportsApiExecution: false,
      nonDestructiveByDefault: false,
    },
    configuration: [{
      name: 'baseUrl', label: 'Base URL', type: 'url', storage: 'env', envSuffix: 'BASE_URL',
      required: true, secret: false, group: 'target', order: 10, help: 'where the app lives',
    }],
    portal: { title: 'Draft', summary: '', groups: [{ id: 'target', label: 'Target', description: '', order: 1 }] },
    validation: [],
    documentation: { summary: '', setupSteps: [], authenticationNotes: [], discoveryNotes: [], executionNotes: [], troubleshooting: [] },
    capabilityProfiles: {},
    ...over,
  };
}

const register = (t: ApplicationTemplate): void => { new ApplicationTemplateRegistry().register(t); };

describe('the registry is the single extension point', () => {
  test('every registered id is selectable at onboarding — the schema enum is DERIVED, not restated', () => {
    assert.deepEqual([...APPLICATION_TYPE_IDS].sort(), [...APPLICATION_TEMPLATES.ids()].sort());
    assert.equal(APPLICATION_TYPE_IDS.length, REGISTERED_TEMPLATES.length);
  });

  test('the historical application classes remain registered — no existing tenant becomes unresolvable', () => {
    // These are the ids the platform stored before the registry existed. Removing one would make an
    // already-onboarded tenant's declaration invalid against its own schema.
    for (const legacy of ['crm', 'd365', 'react', 'angular', 'mobile', 'web', 'web-api', 'other']) {
      assert.ok(APPLICATION_TEMPLATES.has(legacy), `legacy application type "${legacy}" must stay registered`);
    }
  });

  test('the registry covers the classes the platform claims to support', () => {
    for (const id of ['web', 'web-api', 'graphql', 'soap', 'd365', 'salesforce', 'sap', 'oracle-fusion', 'servicenow', 'workday', 'desktop', 'mobile', 'custom']) {
      assert.ok(APPLICATION_TEMPLATES.has(id), `${id} must be registered`);
    }
  });

  test('the fallback template is registered — resolution can always produce a coherent package', () => {
    assert.ok(APPLICATION_TEMPLATES.has(FALLBACK_APPLICATION_TEMPLATE_ID));
  });

  test('listing is deterministic (C-03.18) — generation feeds off this order', () => {
    assert.deepEqual([...APPLICATION_TEMPLATES.ids()], [...APPLICATION_TEMPLATES.ids()].sort());
  });

  test('a duplicate id is refused, never silently overwritten', () => {
    const r = new ApplicationTemplateRegistry().register(draft());
    assert.throws(() => r.register(draft()), /already registered/);
  });
});

describe('resolution', () => {
  test('the highest-precedence declared class drives the package', () => {
    assert.equal(resolveApplicationTemplate(['crm', 'd365']).id, 'd365');
    assert.equal(resolveApplicationTemplate(['d365', 'crm']).id, 'd365');
  });

  test('every declared class contributes, primary first', () => {
    const ids = resolveApplicationTemplates(['web', 'd365']).map((t) => t.id);
    assert.deepEqual(ids, ['d365', 'web']);
  });

  test('an unknown or empty declaration falls back rather than stranding the tenant', () => {
    assert.equal(resolveApplicationTemplate([]).id, FALLBACK_APPLICATION_TEMPLATE_ID);
    assert.equal(resolveApplicationTemplate(['not-a-registered-class']).id, FALLBACK_APPLICATION_TEMPLATE_ID);
  });

  test('a repeated class is resolved once', () => {
    assert.deepEqual(resolveApplicationTemplates(['web', 'web']).map((t) => t.id), ['web']);
  });

  test('a missing fallback is an explicit failure, not a silent undefined', () => {
    const r = buildRegistry([draft()]);
    assert.throws(() => r.resolve([], 'nope'), /fallback application template "nope" is not registered/);
  });
});

describe('INV-2 — no template can carry a credential value', () => {
  test('no secret field declares a default anywhere in the registry', () => {
    for (const t of REGISTERED_TEMPLATES) {
      for (const f of t.configuration) {
        if (!f.secret) continue;
        assert.equal(f.defaultValue, undefined, `${t.id}.${f.name} declares a default for a secret`);
        assert.equal(f.storage, 'env', `${t.id}.${f.name} is a secret held outside .env`);
      }
    }
  });

  test('the whole registry serialises without anything resembling a credential VALUE', () => {
    // A template is emitted verbatim into the generated package. Anything that looks like an
    // assigned secret here would be a secret shipped to a customer — and to every customer.
    const serialised = JSON.stringify(REGISTERED_TEMPLATES);
    for (const pattern of [/"password"\s*:\s*"(?!\s*$)[^"]+"/i, /Bearer\s+[A-Za-z0-9._-]{8,}/, /BEGIN [A-Z ]*PRIVATE KEY/]) {
      assert.doesNotMatch(serialised, pattern, `registry contains something matching ${pattern}`);
    }
  });

  test('a secret with a default is refused at registration', () => {
    assert.throws(() => register(draft({
      configuration: [{
        name: 'apiKey', label: 'Key', type: 'secret', storage: 'env', envSuffix: 'KEY', required: true,
        secret: true, group: 'target', order: 1, help: '', defaultValue: 'sk-live-abc',
      }, ...draft().configuration],
    })), /must not declare a default \(INV-2\)/);
  });

  test('a secret held as operational config is refused at registration', () => {
    assert.throws(() => register(draft({
      configuration: [...draft().configuration, {
        name: 'apiKey', label: 'Key', type: 'secret', storage: 'config', required: true,
        secret: true, group: 'target', order: 2, help: '',
      }],
    })), /must be env-stored \(INV-2\)/);
  });
});

describe('structural guards refuse a malformed template at registration', () => {
  const cases: readonly (readonly [string, Partial<ApplicationTemplate>, RegExp])[] = [
    ['a non-kebab id', { id: 'Not_Kebab' }, /id must be lower-kebab-case/],
    ['a non-upper env prefix', { envPrefix: 'lower' }, /envPrefix must be UPPER_SNAKE_CASE/],
    ['a duplicate field name', { configuration: [...draft().configuration, ...draft().configuration] }, /duplicate configuration field/],
    ['an unknown portal group', { configuration: [{ ...draft().configuration[0]!, group: 'ghost' }] }, /unknown portal group/],
    ['a primary adapter outside the declared set', { runtime: { ...draft().runtime, primaryAdapterInterface: 'I3-api' } }, /is not in adapterInterfaces/],
    ['a primary target field that does not exist', { primaryTargetField: 'ghost' }, /is not a declared configuration field/],
    ['a select with no options', { configuration: [{ ...draft().configuration[0]!, type: 'select' }] }, /declares no options/],
    ['a validation rule against an unknown field', { validation: [{ id: 'r', field: 'ghost', rule: 'required', scope: 'both', severity: 'error', detail: '' }] }, /targets unknown field/],
    ['a pattern rule with no pattern', { validation: [{ id: 'r', field: 'baseUrl', rule: 'pattern', scope: 'both', severity: 'error', detail: '' }] }, /pattern rule with no pattern/],
    ['an anonymous strategy that names a credential', { authentication: { ...draft().authentication, credentialFields: ['baseUrl'] } }, /anonymous but declares credential fields/],
    ['a credentialed strategy that names none', { authentication: { ...draft().authentication, credentialModel: 'user-sign-in' } }, /credentialed but declares no credential field/],
    ['storage-state reuse with nowhere to store it', { authentication: { ...draft().authentication, credentialModel: 'user-sign-in', credentialFields: ['baseUrl'], storageStateReuse: true } }, /declares no storageStatePath/],
    ['a condition with no clause', { configuration: [{ ...draft().configuration[0]!, visibleWhen: { path: 'mfa.required' } }] }, /no equals\/notEquals\/oneOf clause/],
    ['a conditional primary target', { configuration: [{ ...draft().configuration[0]!, visibleWhen: { path: 'mfa.required', equals: true } }] }, /must be unconditional/],
  ];
  for (const [name, over, expected] of cases) {
    test(`refuses ${name}`, () => { assert.throws(() => register(draft(over)), expected); });
  }
});

describe('every registered template is internally coherent', () => {
  for (const t of REGISTERED_TEMPLATES) {
    test(`${t.id}: strategies, adapters and slots are all valid`, () => {
      assert.ok(AUTHENTICATION_STRATEGIES.includes(t.authentication.id), `${t.id} auth strategy`);
      assert.ok(DISCOVERY_STRATEGIES.includes(t.discovery.strategy), `${t.id} discovery strategy`);
      assert.ok(EXECUTION_STRATEGIES.includes(t.execution.strategy), `${t.id} execution strategy`);
      for (const iface of t.runtime.adapterInterfaces) {
        assert.doesNotThrow(() => adapterInterface(iface), `${t.id} references unknown adapter ${iface}`);
      }
      for (const r of t.validation) {
        assert.ok(VALIDATION_RULES.includes(r.rule), `${t.id} rule ${r.id}`);
        assert.ok(VALIDATION_SCOPES.includes(r.scope), `${t.id} rule ${r.id} scope`);
      }
      // A template that documents nothing leaves the operator to guess; that is the state this
      // registry exists to end, so documentation is part of the contract rather than a nicety.
      assert.ok(t.documentation.summary.length > 0, `${t.id} has no documentation summary`);
      assert.ok(t.documentation.setupSteps.length > 0, `${t.id} documents no setup step`);
      assert.ok(t.portal.groups.length > 0, `${t.id} declares no portal group`);
      assert.ok(primaryTargetEnvVar(t).length > 0, `${t.id} has no target env var`);
    });
  }
});

describe('conditional slots', () => {
  test('a second-factor slot appears only when the tenant declared MFA', () => {
    const withMfa = resolveConfigFields(APPLICATION_TEMPLATES.get('d365')!, ctx({ applicationTypes: ['d365'], mfa: { required: true, method: 'totp' } }));
    const without = resolveConfigFields(APPLICATION_TEMPLATES.get('d365')!, ctx({ applicationTypes: ['d365'] }));
    assert.ok(withMfa.some((f) => f.envVar === 'D365_TOTP_SECRET'));
    assert.ok(!without.some((f) => f.envVar === 'D365_TOTP_SECRET'));
  });

  test('conditions compose: equals, notEquals, oneOf and chained `and`', () => {
    const c = ctx({ authenticationType: 'form', mfa: { required: true, method: 'totp' } });
    assert.equal(conditionHolds({ path: 'authenticationType', equals: 'form' }, c), true);
    assert.equal(conditionHolds({ path: 'authenticationType', notEquals: 'none' }, c), true);
    assert.equal(conditionHolds({ path: 'authenticationType', oneOf: ['form', 'basic'] }, c), true);
    assert.equal(conditionHolds({ path: 'authenticationType', oneOf: ['oauth'] }, c), false);
    assert.equal(conditionHolds({ path: 'mfa.required', equals: true, and: { path: 'authenticationType', equals: 'form' } }, c), true);
    assert.equal(conditionHolds({ path: 'mfa.required', equals: true, and: { path: 'authenticationType', equals: 'oauth' } }, c), false);
    assert.equal(conditionHolds(undefined, c), true);
  });

  test('slots from several templates de-duplicate by env var, primary first', () => {
    const templates = resolveApplicationTemplates(['d365', 'web']);
    const fields = resolveAllConfigFields(templates, ctx({ applicationTypes: ['d365', 'web'] }));
    const envVars = fields.filter((f) => f.storage === 'env').map((f) => f.envVar);
    assert.deepEqual([...new Set(envVars)], envVars, 'an env var was declared twice');
    assert.equal(envVars[0], 'D365_BASE_URL', 'the primary template contributes first');
    assert.ok(envVars.includes('TEST_BASE_URL'), 'the secondary template still contributes its slot');
  });

  test('an env var is composed from the template prefix unless the slot names itself', () => {
    const t = APPLICATION_TEMPLATES.get('mobile')!;
    assert.equal(envVarNameFor(t, t.configuration.find((f) => f.name === 'platform')!), 'MOBILE_PLATFORM');
    assert.equal(envVarNameFor(t, t.configuration.find((f) => f.name === 'appPackage')!), 'APP_PACKAGE');
  });
});

describe('authentication resolution', () => {
  test('a generic web target follows the declared mechanism', () => {
    const t = WEB_TEMPLATE;
    assert.equal(resolveAuthentication(t, ctx({ authenticationType: 'none' })).credentialModel, 'none');
    assert.equal(resolveAuthentication(t, ctx({ authenticationType: 'form' })).credentialModel, 'user-sign-in');
    assert.equal(resolveAuthentication(t, ctx({ authenticationType: 'oauth' })).credentialModel, 'service-credential');
  });

  test('REGRESSION: an intrinsic mechanism cannot be downgraded by a discovered one', () => {
    // Discovery reports what it can OBSERVE at the org's front door — commonly `oauth`. A Dynamics
    // organisation is signed into through Entra regardless, and a template that let discovery
    // overrule that would generate a token-bearing web package for a target that needs a session.
    const t = APPLICATION_TEMPLATES.get('d365')!;
    for (const observed of ['oauth', 'saml', 'form', 'none', 'basic', 'custom']) {
      const auth = resolveAuthentication(t, ctx({ applicationTypes: ['d365'], authenticationType: observed }));
      assert.equal(auth.id, 'microsoft-entra-interactive', `discovery reporting "${observed}" changed the D365 strategy`);
      assert.equal(auth.captureSession, true);
      assert.equal(auth.storageStateReuse, true);
    }
  });

  test('a sign-in target that captures a session declares where the session lives', () => {
    for (const t of REGISTERED_TEMPLATES) {
      const strategies = [t.authentication, ...Object.values(t.authenticationVariants ?? {})];
      for (const s of strategies) {
        if (s.storageStateReuse) assert.ok(s.storageStatePath, `${t.id}: reuses storage state with no path`);
      }
    }
  });
});

describe('validation is data, evaluated identically on both planes', () => {
  const d365 = () => APPLICATION_TEMPLATES.get('d365')!;
  const d365Ctx = ctx({ applicationTypes: ['d365'], mfa: { required: true, method: 'totp' } });

  test('a credential rule is EP-scoped — the IP holds no credential to check (INV-2)', () => {
    const ipIssues = evaluateApplicationValidation(d365(), d365Ctx, { baseUrl: 'https://contoso.crm.dynamics.com' }, 'intelligence-plane');
    assert.ok(!ipIssues.some((i) => i.field === 'password'), 'the IP must not assert a password is set');
    const epIssues = evaluateApplicationValidation(d365(), d365Ctx, { baseUrl: 'https://contoso.crm.dynamics.com' }, 'execution-plane');
    assert.ok(epIssues.some((i) => i.field === 'password' && i.severity === 'error'), 'the EP must catch a missing password');
  });

  test('a missing second factor is caught only when MFA was declared', () => {
    const declared = evaluateApplicationValidation(d365(), d365Ctx, {}, 'execution-plane');
    assert.ok(declared.some((i) => i.field === 'totpSecret'));
    const notDeclared = evaluateApplicationValidation(d365(), ctx({ applicationTypes: ['d365'] }), {}, 'execution-plane');
    assert.ok(!notDeclared.some((i) => i.field === 'totpSecret'));
  });

  test('a `<FILL: …>` placeholder counts as absent, not as a value', () => {
    assert.equal(isPlaceholder('<FILL: app URL>'), true);
    const issues = evaluateApplicationValidation(d365(), d365Ctx, { baseUrl: '<FILL: app URL>' }, 'execution-plane');
    assert.ok(issues.some((i) => i.field === 'baseUrl' && i.ruleId.endsWith('.required')));
  });

  test('credentials are refused over plain http', () => {
    const issues = evaluateApplicationValidation(d365(), d365Ctx, { baseUrl: 'http://contoso.crm.dynamics.com' }, 'execution-plane');
    assert.ok(issues.some((i) => i.ruleId === 'd365.baseUrl.url'), 'an http target must be refused for a sign-in class');
  });

  test('a complete configuration produces no error', () => {
    const issues = evaluateApplicationValidation(d365(), d365Ctx, {
      baseUrl: 'https://contoso.crm.dynamics.com', username: 'svc@contoso.com', password: 'set-at-the-ep',
      totpSecret: 'set-at-the-ep', browser: 'chromium', timeoutMs: 60000, parallel: 1,
    }, 'execution-plane');
    assert.deepEqual(issues.filter((i) => i.severity === 'error'), []);
  });

  test('a rule for a slot this declaration does not generate is skipped', () => {
    // `custom`'s application-secret rule must not fire for an anonymous declaration, or a package
    // with no such slot would refuse to start over a variable it was never given.
    const custom = APPLICATION_TEMPLATES.get('custom')!;
    const issues = evaluateApplicationValidation(custom, ctx({ applicationTypes: ['custom'], authenticationType: 'none' }), { baseUrl: 'https://app.example.test' }, 'execution-plane');
    assert.ok(!issues.some((i) => i.field === 'authSecret'));
  });
});

describe('adapter interface catalogue', () => {
  test('every catalogue entry is keyed by its own id', () => {
    for (const [key, def] of Object.entries(ADAPTER_INTERFACES)) assert.equal(key, def.id);
  });

  test('an unknown interface is an explicit failure — a capability with no runner must not surface (R-11.13)', () => {
    assert.throws(() => adapterInterface('I99-imaginary'), /unknown execution adapter interface/);
  });
});
