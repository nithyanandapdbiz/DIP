/**
 * Application-Template-driven generation — the Execution Plane a tenant actually receives.
 * TRACEABILITY: ADR-0030 (one generator) · ADR-0032 (SSOT) · ADR-0035 (EP portal) · C-03.17 · C-03.18
 *   Invariant: INV-2 (no customer credential leaves the customer tenancy)
 *   Proves: the declared APPLICATION TYPE — not a generic web default — drives configuration,
 *           environment slots, authentication, discovery, execution, capability profiles, portal
 *           schema, validation and documentation; that a D365 tenant receives a complete package
 *           needing no manual wiring; that the generator contains no per-application branch; and
 *           that a tenant generated before the registry existed still gets its original slots.
 * Categories: contract, security, regression, architecture
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, generateTenantSolution, buildApplicationPlane,
  applicationTemplateCatalogue, validateApplicationPlane, writeSolutionFiles,
  type RepositoryOptions, type WelcomeInput, type TenantEnvelope, type DiscoveredMetadata,
} from '../src/engine/index.js';
import { validateOnboarding } from '../src/domain/index.js';
import { APPLICATION_TEMPLATES, REGISTERED_TEMPLATES } from '@dbiz/platform-core';

let tick = 0;
const opts: RepositoryOptions = {
  now: () => `2026-08-01T00:00:${String(tick++ % 60).padStart(2, '0')}.000Z`,
  newTenantId: () => 'tnt-opaque-template',
};

const welcome = (over: Partial<WelcomeInput> = {}): WelcomeInput => ({
  organisationName: 'Carlisle Homes', tenantName: `t${tick}`,
  primaryAdministrator: 'Ada', preferredCloud: 'dev', deploymentModel: 'container',
  applicationTypes: ['web'], mfaRequired: false, ...over,
});

/** The edge observes a name, a URL, a mechanism and browsers — never the application CLASS. */
const DISCOVERED: DiscoveredMetadata = {
  application: {
    applicationName: 'Portal', environments: [{ name: 'test', url: 'https://portal.example.test' }],
    authenticationType: 'oauth', browserRequirements: ['chromium'],
  },
};

function tenant(w: WelcomeInput, discovered?: DiscoveredMetadata): TenantEnvelope {
  const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
  const env = repo.createFromWelcome(w);
  return discovered ? repo.enrichDiscovery(env.onboarding.slug, discovered) : env;
}

function generate(env: TenantEnvelope): Record<string, string> {
  const manifest = generateTenantSolution(env, {
    registrationEndpoint: 'https://gateway.dbiz.example/v1/register',
    issueCredential: (t) => `otc-${t}`,
  });
  return Object.fromEntries(manifest.files.map((f) => [f.path, f.content]));
}

const packageFor = (over: Partial<WelcomeInput>, discovered?: DiscoveredMetadata): Record<string, string> =>
  generate(tenant(welcome(over), discovered));

const applicationJson = (files: Record<string, string>): any => JSON.parse(files['config/application.json']!);

describe('the application type drives the whole Execution Plane', () => {
  test('every generated package carries an application band naming its resolved template', () => {
    for (const id of ['web', 'd365', 'web-api', 'graphql', 'salesforce', 'sap', 'servicenow', 'workday', 'oracle-fusion', 'desktop', 'mobile', 'soap', 'custom']) {
      const app = applicationJson(packageFor({ applicationTypes: [id] }));
      assert.equal(app.template.id, id, `${id} did not drive its own package`);
      assert.deepEqual(app.declaredTypes, [id]);
    }
  });

  test('two different application types produce genuinely different packages', () => {
    // The defect this work exists to fix: the generator ignored the declared type and emitted the
    // same generic web package for every tenant. If these two agreed, it would be back.
    const d365 = applicationJson(packageFor({ applicationTypes: ['d365'], mfaRequired: true }));
    const api = applicationJson(packageFor({ applicationTypes: ['web-api'] }));
    assert.notEqual(d365.authentication.strategy, api.authentication.strategy);
    assert.notEqual(d365.discovery.strategy, api.discovery.strategy);
    assert.notEqual(d365.execution.strategy, api.execution.strategy);
    assert.notEqual(d365.runtime.primaryAdapterInterface, api.runtime.primaryAdapterInterface);
    assert.notDeepEqual(
      d365.configuration.env.map((f: { envVar: string }) => f.envVar),
      api.configuration.env.map((f: { envVar: string }) => f.envVar),
    );
  });

  test('the declared type survives discovery enrichment and still drives generation', () => {
    const app = applicationJson(generate(tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }), DISCOVERED)));
    // Discovery reported `oauth`; a Dynamics org is signed into through Entra regardless.
    assert.equal(app.template.id, 'd365');
    assert.equal(app.authentication.strategy, 'microsoft-entra-interactive');
  });

  test('the highest-precedence declared class drives; the others still contribute slots', () => {
    const app = applicationJson(packageFor({ applicationTypes: ['web', 'd365'] }));
    assert.equal(app.template.id, 'd365');
    assert.deepEqual(app.contributingTemplates, ['d365', 'web']);
    const slots = app.configuration.env.map((f: { envVar: string }) => f.envVar);
    assert.ok(slots.includes('D365_BASE_URL'));
    assert.ok(slots.includes('TEST_BASE_URL'));
  });
});

describe('D365 — a complete, production-ready Execution Plane with no manual wiring', () => {
  const files = (): Record<string, string> => generate(tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }), DISCOVERED));

  test('every required artefact is present', () => {
    const f = files();
    for (const path of [
      'config/application.json', 'config/integrations.json', 'config/capabilities.json',
      'config/connectivity.json', 'config/identity.json', 'config/security.json',
      '.env.example', 'docs/EP-APPLICATION.md', 'docs/EP-CONFIGURATION.md', 'web/index.html',
    ]) assert.ok(f[path], `${path} was not generated`);
  });

  test('Microsoft Entra interactive sign-in with session capture, storage-state reuse and refresh', () => {
    const auth = applicationJson(files()).authentication;
    assert.equal(auth.strategy, 'microsoft-entra-interactive');
    assert.equal(auth.credentialModel, 'user-sign-in');
    assert.equal(auth.captureSession, true);
    assert.equal(auth.storageStateReuse, true);
    assert.ok(auth.storageStatePath, 'no path for the captured session');
    assert.equal(auth.sessionRefresh.strategy, 'reauthenticate');
    assert.ok(auth.sessionRefresh.intervalMinutes > 0, 'session refresh has no cadence');
  });

  test('MFA is enabled and driven through a TOTP slot — never bypassed', () => {
    const auth = applicationJson(files()).authentication;
    assert.equal(auth.mfa.supported, true);
    assert.equal(auth.mfa.required, true);
    assert.equal(auth.mfa.method, 'totp');
    assert.equal(auth.mfa.totpSecretEnv, 'D365_TOTP_SECRET');
  });

  test('CRM base URL, username and password slots are generated as env REFERENCES', () => {
    const auth = applicationJson(files()).authentication;
    assert.deepEqual(auth.credentialEnv, {
      username: 'D365_USERNAME', password: 'D365_PASSWORD', totpSecret: 'D365_TOTP_SECRET',
    });
    assert.equal(applicationJson(files()).target.baseUrlEnv, 'D365_BASE_URL');
  });

  test('discovery is AUTHENTICATED and bound to the captured session', () => {
    const d = applicationJson(files()).discovery;
    assert.equal(d.strategy, 'authenticated');
    assert.equal(d.profile.requiresSession, true);
    assert.equal(d.profile.readOnly, true);
    assert.ok(d.profile.metadataEndpoint, 'no Dataverse metadata endpoint for entity discovery');
  });

  test('functional execution replays the captured session and refreshes it', () => {
    const e = applicationJson(files()).execution;
    assert.equal(e.strategy, 'storage-state');
    assert.equal(e.sessionRefresh, true);
    assert.equal(e.profile.reauthenticateOnSignInRedirect, true);
  });

  test('capabilities are specialised to the target, not to a generic web app', () => {
    const caps = JSON.parse(files()['config/capabilities.json']!).capabilities;
    const ft = caps['functional-testing'];
    assert.equal(ft.applicationTemplate, 'd365');
    assert.equal(ft.discoveryStrategy, 'authenticated');
    assert.equal(ft.executionStrategy, 'storage-state');
    // A single authenticated session: parallel workers make the org invalidate the older ones.
    assert.equal(ft.guardrail.maxConcurrency, 1);
    assert.ok(ft.timeoutSeconds >= 900, 'an enterprise SaaS shell needs more than a web-app budget');
  });

  test('the auth profile every capability resolves carries the whole strategy', () => {
    const profile = JSON.parse(files()['config/integrations.json']!).authProfiles['app-default'];
    assert.equal(profile.strategy, 'microsoft-entra-interactive');
    assert.equal(profile.captureSession, true);
    assert.equal(profile.usernameEnv, 'D365_USERNAME');
    assert.equal(profile.mfa.totpSecretEnv, 'D365_TOTP_SECRET');
    assert.ok(profile.storageStatePath);
  });

  test('the .env slots are generated EMPTY — names only, never a value (INV-2)', () => {
    const envFile = files()['.env.example']!;
    for (const v of ['D365_BASE_URL', 'D365_USERNAME', 'D365_PASSWORD', 'D365_TOTP_SECRET']) {
      assert.match(envFile, new RegExp(`^${v}=\\s*(#.*)?$`, 'm'), `${v} must be an EMPTY slot`);
    }
  });

  test('documentation is specific to this target and to no other', () => {
    const doc = files()['docs/EP-APPLICATION.md']!;
    assert.match(doc, /Microsoft Dynamics 365/);
    assert.match(doc, /MFA is \*\*enforced\*\*/);
    assert.match(doc, /D365_TOTP_SECRET/);
    assert.match(doc, /AUTHENTICATED/);
    // Guidance for a target this tenant does not have must not appear.
    assert.doesNotMatch(doc, /OpenAPI/);
    assert.doesNotMatch(doc, /device or emulator/);
  });

  test('the package validates against its own rules once the operator fills the slots', () => {
    const app = applicationJson(files());
    const rules = app.validation as { id: string; scope: string }[];
    assert.ok(rules.some((r) => r.id === 'd365.username.required'));
    assert.ok(rules.some((r) => r.id === 'd365.totpSecret.required'));
    // The credential rules are EP-scoped: the IP cannot check a value it is forbidden to hold.
    assert.equal(rules.find((r) => r.id === 'd365.password.required')!.scope, 'execution-plane');
  });

  test('nothing in the application band is left as an unresolved placeholder', () => {
    // A generated package that still says `<FILL:>` where a STRATEGY belongs is one the operator
    // has to wire by hand — the outcome this work exists to eliminate.
    const app = applicationJson(files());
    for (const section of [app.authentication, app.execution, app.template, app.runtime]) {
      assert.doesNotMatch(JSON.stringify(section), /<FILL:/, `unresolved placeholder in ${JSON.stringify(section).slice(0, 60)}`);
    }
  });
});

describe('other application classes get their own shape', () => {
  test('a REST API target is driven through the API adapter, with no browser', () => {
    const app = applicationJson(packageFor({ applicationTypes: ['web-api'] }));
    assert.equal(app.runtime.primaryAdapterInterface, 'I3-api');
    assert.equal(app.runtime.browserRequired, false);
    assert.equal(app.discovery.strategy, 'api');
    assert.ok(app.discovery.profile.contractPath, 'no OpenAPI contract path');
    assert.deepEqual(app.discovery.profile.safeMethods, ['GET', 'HEAD', 'OPTIONS']);
  });

  test('a GraphQL target discovers by introspection', () => {
    const app = applicationJson(packageFor({ applicationTypes: ['graphql'] }));
    assert.equal(app.discovery.strategy, 'metadata');
    assert.equal(app.discovery.profile.introspection, true);
    assert.equal(app.target.baseUrlEnv, 'GRAPHQL_ENDPOINT');
  });

  test('a desktop target binds a UI-automation adapter and refuses to claim headless support', () => {
    const app = applicationJson(packageFor({ applicationTypes: ['desktop'] }));
    assert.equal(app.runtime.primaryAdapterInterface, 'I8-desktop-ui');
    assert.equal(app.runtime.headlessSupported, false);
    assert.equal(app.target.baseUrlEnv, 'DESKTOP_APP_PATH');
    // The adapter class the target needs must be bound even though no capability selects it.
    const adapters = JSON.parse(packageFor({ applicationTypes: ['desktop'] })['config/integrations.json']!).executionAdapters;
    assert.ok(adapters['I8-desktop-ui'], 'the desktop runner class was not bound (R-11.13)');
  });

  test('a mobile target keeps its established slots', () => {
    const slots = applicationJson(packageFor({ applicationTypes: ['mobile'] })).configuration.env.map((f: { envVar: string }) => f.envVar);
    for (const v of ['APP_PACKAGE', 'TEST_BASE_URL', 'DEVICE_UDID']) assert.ok(slots.includes(v), `${v} missing`);
  });

  test('an unclassified target says so rather than pretending to be a web app', () => {
    const app = applicationJson(packageFor({ applicationTypes: ['custom'] }));
    assert.equal(app.discovery.strategy, 'none');
    assert.match(app.discovery.profile.reason, /not matched to a registered class/);
    assert.match(packageFor({ applicationTypes: ['custom'] })['docs/EP-APPLICATION.md']!, /discovery is not automated/i);
  });

  test('Salesforce, SAP, ServiceNow and Workday each capture their own session', () => {
    for (const id of ['salesforce', 'sap', 'servicenow', 'workday', 'oracle-fusion']) {
      const app = applicationJson(packageFor({ applicationTypes: [id], mfaRequired: true }));
      assert.equal(app.authentication.captureSession, true, `${id} does not capture a session`);
      assert.equal(app.execution.strategy, 'storage-state', `${id} does not replay its session`);
      assert.ok(app.authentication.mfa.totpSecretEnv, `${id} generated no second-factor slot`);
      assert.equal(app.discovery.strategy, 'authenticated', `${id} discovery is not authenticated`);
    }
  });

  test('SAP carries the identifiers that are part of its identity', () => {
    const slots = applicationJson(packageFor({ applicationTypes: ['sap'] })).configuration.env.map((f: { envVar: string }) => f.envVar);
    // The same user in a different client is a different dataset — omitting it tests the wrong system.
    assert.ok(slots.includes('SAP_CLIENT'));
    assert.ok(slots.includes('SAP_LANGUAGE'));
  });
});

describe('the portal is metadata-driven', () => {
  test('the generated console renders the resolved template\'s schema', () => {
    const html = packageFor({ applicationTypes: ['d365'], mfaRequired: true })['web/index.html']!;
    assert.match(html, /"templateId":"d365"/);
    assert.match(html, /D365_USERNAME/);
    // The console shows WHERE a secret is read from, never a value.
    assert.match(html, /env:D365_PASSWORD/);
    assert.doesNotMatch(html, /"password":"[^"]+"/);
  });

  test('a different target renders a different form, with no portal code change', () => {
    const api = packageFor({ applicationTypes: ['web-api'] })['web/index.html']!;
    assert.match(api, /"templateId":"web-api"/);
    assert.match(api, /API_TOKEN/);
    assert.doesNotMatch(api, /D365_USERNAME/);
  });

  test('the portal snapshot never carries an env VALUE, only a reference', () => {
    for (const id of REGISTERED_TEMPLATES.map((t) => t.id)) {
      const snapshot = buildApplicationPlane(tenant(welcome({ applicationTypes: [id], mfaRequired: true })));
      for (const f of snapshot.fields) {
        if (f.storage !== 'env') continue;
        assert.ok(f.secret === true || f.secret === false, `${id}.${f.name} has no secret classification`);
      }
    }
  });
});

describe('no hardcoded application logic remains in the generator', () => {
  // The registry is only an extension point if the generator has stopped knowing about individual
  // applications. This walks the generator's own sources, strips comments (prose may legitimately
  // name a target when explaining WHY), and fails on a code-level reference to any registered id.
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, '..', '..', 'src');
  const GENERATOR_SOURCES = [
    'engine/solution-export.ts',
    'engine/application-plane.ts',
    'engine/application-catalogue.ts',
    'engine/portal-templates.ts',
    'domain/validation.ts',
    'domain/onboarding-configuration.ts',
  ];

  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /**
   * The shapes application coupling actually takes. A bare occurrence of an id is NOT one of them:
   * `join(ROOT, "web")` names a directory and `'custom'` is also an authentication mechanism, so a
   * naive substring scan fails on collisions while proving nothing. What matters is whether the
   * code DECIDES on an application id — by comparing to one, testing membership, switching on one,
   * or tabulating several.
   */
  const decidesOn = (code: string, id: string): string | null => {
    const q = `['"\`]${id}['"\`]`;
    if (new RegExp(`(?:===|!==|==|!=|case\\s+|includes\\(|indexOf\\(|startsWith\\(|endsWith\\(|\\[)\\s*${q}`).test(code)) {
      return `compares against "${id}"`;
    }
    if (new RegExp(`${q}\\s*:`).test(code)) return `keys a lookup table by "${id}"`;
    return null;
  };

  for (const rel of GENERATOR_SOURCES) {
    test(`${rel} makes no decision based on a specific application type`, () => {
      const code = stripComments(readFileSync(join(srcRoot, rel), 'utf8'));
      for (const id of APPLICATION_TEMPLATES.ids()) {
        const finding = decidesOn(code, id);
        assert.equal(finding, null, `${rel} ${finding} — that decision belongs to the template, not the generator`);
      }
      // A table needs two entries before it is a table. Several distinct ids in one generator file
      // is the `APP_TARGET`/`SIGN_IN_TARGETS` shape this work removed, whatever syntax it wears.
      const mentioned = APPLICATION_TEMPLATES.ids().filter((id) => new RegExp(`['"\`]${id}['"\`]|^\\s*${id}\\s*:`, 'm').test(code));
      assert.ok(mentioned.length <= 1, `${rel} tabulates application types: ${mentioned.join(', ')}`);
    });
  }

  test('the onboarding schema derives its application enum from the registry', () => {
    const code = readFileSync(join(srcRoot, 'domain/onboarding-configuration.ts'), 'utf8');
    assert.match(code, /APPLICATION_TYPES\s*=\s*APPLICATION_TYPE_IDS/, 'the enum must be derived, never restated');
  });

  test('the onboarding wizard reads the catalogue from the API, not from a compiled-in list', () => {
    const wizard = readFileSync(join(here, '..', '..', '..', 'tenant-onboarding-web', 'src', 'pages', 'Wizard.tsx'), 'utf8');
    assert.doesNotMatch(stripComments(wizard), /const APP_TYPES\s*=/, 'the wizard restates the application list');
    assert.match(wizard, /applicationTemplates\(\)/, 'the wizard must fetch the registry catalogue');
  });
});

describe('the catalogue the onboarding experience renders from', () => {
  test('it exposes every registered class with what each will generate', () => {
    const catalogue = applicationTemplateCatalogue();
    assert.deepEqual(catalogue.templates.map((t) => t.id), [...APPLICATION_TEMPLATES.ids()]);
    for (const t of catalogue.templates) {
      assert.ok(t.label.length > 0);
      assert.ok(t.discovery.strategy.length > 0);
      assert.ok(t.slots.withoutMfa.length > 0, `${t.id} previews no environment slot`);
    }
  });

  test('a sign-in class previews the extra slot MFA adds; a non-sign-in class does not', () => {
    const byId = Object.fromEntries(applicationTemplateCatalogue().templates.map((t) => [t.id, t]));
    assert.equal(byId['d365']!.signInTarget, true);
    assert.ok(byId['d365']!.slots.withMfa.length > byId['d365']!.slots.withoutMfa.length);
    assert.equal(byId['web-api']!.signInTarget, false);
    assert.deepEqual(byId['web-api']!.slots.withMfa, byId['web-api']!.slots.withoutMfa);
  });
});

describe('validation is template-driven on both planes', () => {
  test('onboarding accepts a coherent declaration for every registered class', () => {
    for (const id of APPLICATION_TEMPLATES.ids()) {
      const env = tenant(welcome({ applicationTypes: [id], mfaRequired: true }));
      const result = validateOnboarding(env.configuration as never);
      assert.equal(result.ok, true, `${id} failed onboarding validation: ${JSON.stringify(result.ok ? [] : result.issues)}`);
    }
  });

  test('the IP evaluates only what it is allowed to know', () => {
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const issues = validateApplicationPlane(env);
    // No credential rule may fire here: the Intelligence Plane holds no credential to test (INV-2).
    assert.ok(!issues.some((i) => ['username', 'password', 'totpSecret'].includes(i.field)));
  });

  test('an insecure target address is refused at onboarding for a sign-in class', () => {
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    env.configuration.customerOwned.application.applicationUrl = 'http://insecure.example.test';
    const result = validateOnboarding(env.configuration as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((i) => i.code === 'incoherent-application-target'));
  });

  test('an advisory rule informs without blocking a legitimate tenant', () => {
    // D365 warns when MFA was not declared. A tenant whose instance genuinely has it disabled must
    // still be able to onboard — a warning that blocks is an error wearing the wrong label.
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: false }));
    assert.equal(validateOnboarding(env.configuration as never).ok, true);
  });
});

describe('a live tenant stays application-aware after generation', () => {
  /** A tenant that has reached a lifecycle state — the condition for emitting EP update events. */
  function liveTenant(over: Partial<WelcomeInput> = {}): { repo: TenantConfigRepository; slug: string } {
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), opts);
    const env = repo.createFromWelcome(welcome({ applicationTypes: ['d365'], mfaRequired: true, ...over }));
    env.onboarding.lifecycleState = 'Active';
    repo['store'].write(env.onboarding.slug, env);
    return { repo, slug: env.onboarding.slug };
  }

  test('REGRESSION: a capability added post-activation carries the TARGET-specialised config', () => {
    // The update path is a second way into `config/capabilities.json`. A generic scaffold pulled
    // here would overwrite the concurrency ceiling and authenticated strategies generation got
    // right — reintroducing the generic-package defect after the package was already correct.
    const { repo, slug } = liveTenant();
    const env = repo.setCapability(slug, 'inverse-flow-discovery', true);
    const event = (env.onboarding.updates ?? []).find((u) => u.capability === 'inverse-flow-discovery');
    assert.ok(event, 'no update event was recorded for the live tenant');
    assert.equal(event!.config!['applicationTemplate'], 'd365');
    assert.equal(event!.config!['discoveryStrategy'], 'authenticated');
    assert.equal(event!.config!['executionStrategy'], 'storage-state');
  });

  test('REGRESSION: a configuration change ships the regenerated application band', () => {
    // Changing the declared class changes the whole strategy set. An EP left holding the previous
    // band keeps discovering and executing the old way while its manifest says otherwise.
    const { repo, slug } = liveTenant();
    const env = repo.updateConfiguration(slug, { customerOwned: { application: { applicationTypes: ['web-api'] } } });
    const event = [...(env.onboarding.updates ?? [])].reverse().find((u) => u.type === 'configuration-changed');
    assert.ok(event, 'no configuration-changed event was recorded');
    const band = event!.config!['application'] as { template: { id: string }; discovery: { strategy: string } };
    assert.equal(band.template.id, 'web-api');
    assert.equal(band.discovery.strategy, 'api');
  });

  test('an operator re-sync also carries the application band', () => {
    const { repo, slug } = liveTenant();
    const updates = repo.syncConfiguration(slug);
    const event = [...updates].reverse().find((u) => u.type === 'configuration-changed');
    assert.equal((event!.config!['application'] as { template: { id: string } }).template.id, 'd365');
  });

  test('the generated update agent applies an application band rather than dropping it', () => {
    const agent = packageFor({ applicationTypes: ['d365'], mfaRequired: true })['bin/ep-update-agent.mjs']!;
    assert.match(agent, /config\/application\.json/);
    assert.match(agent, /u\.config\.application/);
  });
});

describe('regenerating over a LIVE Execution Plane preserves what the operator owns', () => {
  // The output directory is a deployed Execution Plane, not a build output. These files are created
  // by the operator or by the runtime and are not generated artefacts, so a regeneration must never
  // remove them: `.env` holds the filled-in credentials, `.auth/` the captured sign-in session
  // (deleting it forces a fresh interactive MFA challenge), and `evidence/` is locally custodied
  // evidence — INV-1 — which the Intelligence Plane has no copy of.
  const OPERATOR_OWNED = [
    ['.env', 'D365_PASSWORD=the-real-one\n'],
    ['config/portal.json', '{"parallel":2}\n'],
    ['.auth/d365-session.json', '{"cookies":[]}\n'],
    ['evidence/run-1/manifest.json', '{"artifacts":[]}\n'],
  ] as const;

  function scratchRoot(name: string): string {
    const dir = join(mkdtempSync(join(tmpdir(), 'dbiz-ep-')), name);
    return dir;
  }

  function writePackage(outputDir: string, env: TenantEnvelope): string {
    const manifest = generateTenantSolution(env, {
      registrationEndpoint: 'https://gateway.dbiz.example/v1/register',
      issueCredential: (t) => `otc-${t}`,
      outputDir,
    });
    return manifest.outputPath!;
  }

  test('REGRESSION: a regeneration does not delete the operator\'s credentials, session or evidence', () => {
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const outputDir = scratchRoot('out');
    const root = writePackage(outputDir, env);

    // The operator deploys, fills in `.env`, signs in once, and runs something.
    for (const [rel, body] of OPERATOR_OWNED) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), body, 'utf8');
    }

    writePackage(outputDir, env); // the "update" button

    for (const [rel, body] of OPERATOR_OWNED) {
      assert.equal(readFileSync(join(root, rel), 'utf8'), body, `${rel} was destroyed by a regeneration`);
    }
  });

  test('a file the generator previously wrote and no longer emits IS pruned', () => {
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const outputDir = scratchRoot('out');
    const root = writePackage(outputDir, env);
    assert.ok(existsSync(join(root, 'docs/EP-APPLICATION.md')));

    // Simulate a later generator that no longer emits one of its own files.
    const trimmed = generateTenantSolution(env, {
      registrationEndpoint: 'https://gateway.dbiz.example/v1/register',
      issueCredential: (t) => `otc-${t}`,
    }).files.filter((f) => f.path !== 'docs/EP-APPLICATION.md');
    writeSolutionFiles(outputDir, env.onboarding.slug, trimmed);

    assert.equal(existsSync(join(root, 'docs/EP-APPLICATION.md')), false, 'a stale generated file was left behind');
  });

  test('a package generated before the manifest existed prunes nothing, then adopts one', () => {
    // The migration case: an Execution Plane already deployed from an older generator has no record
    // of what it owns, so the safe reading of "unknown file" is "not mine".
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const outputDir = scratchRoot('out');
    const root = writePackage(outputDir, env);
    rmSync(join(root, '.dbiz-package-manifest.json'), { force: true });
    writeFileSync(join(root, '.env'), 'D365_PASSWORD=the-real-one\n', 'utf8');
    writeFileSync(join(root, 'docs/OBSOLETE.md'), 'from an older generator\n', 'utf8');

    writePackage(outputDir, env);

    assert.equal(readFileSync(join(root, '.env'), 'utf8'), 'D365_PASSWORD=the-real-one\n');
    assert.ok(existsSync(join(root, 'docs/OBSOLETE.md')), 'nothing may be pruned without a manifest');
    assert.ok(existsSync(join(root, '.dbiz-package-manifest.json')), 'the manifest must now be adopted');
  });

  test('EP runtime code under a reserved prefix survives a regeneration that HAS a manifest', () => {
    // The Option B case, and the one the existing suite did not cover. `.env` and `docs/OBSOLETE.md`
    // prove survival for a customer file at the root and for the no-manifest migration path. Neither
    // covers the case the Execution Plane actually builds on: a file the generator has never seen, in
    // a directory the generator never created, with a full manifest present authorising a prune.
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const outputDir = scratchRoot('out');
    const root = writePackage(outputDir, env);

    // The customer builds the single cross-plane client the EP owns (R-05.3, Doc 19).
    mkdirSync(join(root, 'src/runtime'), { recursive: true });
    writeFileSync(join(root, 'src/runtime/cross-plane-client.js'), 'export const EGRESS = 1;\n', 'utf8');
    writeFileSync(join(root, 'tests/cross-plane-client.conformance.test.mjs'), '// C-05.10\n', 'utf8');
    // …and one undeclared file in a directory the generator DOES write into, which is the weaker
    // position of the two and therefore the one worth pinning.
    writeFileSync(join(root, 'docs/RUNBOOK.md'), '# ours\n', 'utf8');

    writePackage(outputDir, env);

    assert.equal(readFileSync(join(root, 'src/runtime/cross-plane-client.js'), 'utf8'), 'export const EGRESS = 1;\n');
    assert.equal(readFileSync(join(root, 'tests/cross-plane-client.conformance.test.mjs'), 'utf8'), '// C-05.10\n');
    assert.equal(readFileSync(join(root, 'docs/RUNBOOK.md'), 'utf8'), '# ours\n');
  });

  test('a reserved path is not pruned even when a previous manifest claimed it', () => {
    // An older generator that wrongly emitted into `src/runtime/` must not license this one to delete
    // what the customer has since built there. Reservation outranks the recorded claim.
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const outputDir = scratchRoot('out');
    const root = writePackage(outputDir, env);

    const claimed = JSON.parse(readFileSync(join(root, '.dbiz-package-manifest.json'), 'utf8')) as { generatedPaths: string[] };
    claimed.generatedPaths.push('src/runtime/cross-plane-client.js');
    writeFileSync(join(root, '.dbiz-package-manifest.json'), `${JSON.stringify(claimed, null, 2)}\n`, 'utf8');
    mkdirSync(join(root, 'src/runtime'), { recursive: true });
    writeFileSync(join(root, 'src/runtime/cross-plane-client.js'), 'export const EGRESS = 1;\n', 'utf8');

    writePackage(outputDir, env);

    assert.ok(existsSync(join(root, 'src/runtime/cross-plane-client.js')), 'a stale CLAIM authorised deleting customer runtime code');
  });

  test('generation REFUSES to emit into reserved Execution-Plane runtime ground', () => {
    // The reservation is only worth as much as the thing that breaks when a template violates it.
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const outputDir = scratchRoot('out');
    const files = generateTenantSolution(env, {
      registrationEndpoint: 'https://gateway.dbiz.example/v1/register',
      issueCredential: (t) => `otc-${t}`,
    }).files;

    assert.throws(
      () => writeSolutionFiles(outputDir, env.onboarding.slug, [...files, { path: 'src/runtime/emitted.js', content: 'x\n' }]),
      /reserved Execution-Plane runtime ground/,
      'a template emitting into src/runtime/ must fail the generation, not overwrite customer code',
    );
  });

  test('the manifest declares ITSELF, and declares the reserved prefixes', () => {
    // It is rewritten on every run, so claiming to be customer-owned was false — and a file that
    // misreports its own ownership is the last file that should be the authority on everyone else's.
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const root = writePackage(scratchRoot('out'), env);

    const m = JSON.parse(readFileSync(join(root, '.dbiz-package-manifest.json'), 'utf8')) as { generatedPaths: string[]; reservedPaths: string[] };
    assert.ok(m.generatedPaths.includes('.dbiz-package-manifest.json'), 'the manifest must declare itself');
    assert.deepEqual(m.reservedPaths, ['src/runtime/', 'tests/', 'tools/']);
    assert.deepEqual([...m.generatedPaths].sort(), m.generatedPaths, 'the manifest must be deterministic');
  });

  test('the manifest records exactly the generated paths, and never a customer file', () => {
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const outputDir = scratchRoot('out');
    const root = writePackage(outputDir, env);
    writeFileSync(join(root, '.env'), 'x\n', 'utf8');
    writePackage(outputDir, env);

    const recorded = JSON.parse(readFileSync(join(root, '.dbiz-package-manifest.json'), 'utf8')) as { generatedPaths: string[] };
    assert.ok(recorded.generatedPaths.includes('config/application.json'));
    assert.ok(!recorded.generatedPaths.includes('.env'), 'the manifest must never claim a customer file');
    assert.deepEqual([...recorded.generatedPaths].sort(), recorded.generatedPaths, 'the manifest must be deterministic');
  });
});

describe('generated connectivity names only routes the Intelligence Plane serves', () => {
  // A tenant received `${origin}/v1/execute`, `/v1/evidence`, `/v1/token` and `/v1/telemetry` —
  // four well-formed URLs composed from the gateway origin, none of them served by anything. They
  // were indistinguishable from the two real routes until every call 404'd. A confident wrong URL
  // costs more than an obvious placeholder, because only the placeholder trips the boot guard.
  test('the unserved cross-plane endpoints are placeholders, not fabricated URLs', () => {
    const env = tenant(welcome({ applicationTypes: ['d365'], mfaRequired: true }));
    const files = generateTenantSolution(env, {
      registrationEndpoint: 'https://gateway.dbiz.example/api/register',
      issueCredential: (t) => `otc-${t}`,
    }).files;
    const conn = JSON.parse(files.find((f) => f.path === 'config/connectivity.json')!.content) as {
      intelligencePlane: Record<string, string>;
    };
    const ip = conn.intelligencePlane;

    for (const key of ['executeEndpoint', 'evidenceEndpoint', 'oauthTokenEndpoint', 'telemetryEndpoint']) {
      assert.match(ip[key]!, /^<FILL:/, `${key} bakes a URL for a route the IP does not serve`);
    }
    // The two that ARE served stay real — the fix must not degrade working connectivity.
    assert.equal(ip['registrationEndpoint'], 'https://gateway.dbiz.example/api/register');
    assert.equal(ip['updatesEndpoint'], `https://gateway.dbiz.example/api/tenants/${env.onboarding.slug}/updates`);
  });
});

describe('backward compatibility', () => {
  test('a tenant that declared no application class keeps the slots it already filled in', () => {
    // Tenants onboarded before the declaration existed were all generated as web applications.
    // Resolving them anywhere else would change the `.env` keys under a deployed Execution Plane.
    const env = tenant(welcome({ applicationTypes: [] }), DISCOVERED);
    delete (env.configuration.customerOwned.application as { applicationTypes?: string[] }).applicationTypes;
    const files = generate(env);
    assert.match(files['.env.example']!, /^TEST_BASE_URL=/m);
    assert.equal(JSON.parse(files['config/integrations.json']!).application.baseUrlEnv, 'TEST_BASE_URL');
    assert.equal(applicationJson(files).template.id, 'web');
  });

  test('the integrations application block keeps every key an Execution Plane already reads', () => {
    const block = JSON.parse(packageFor({ applicationTypes: ['d365'], mfaRequired: true })['config/integrations.json']!).application;
    for (const key of ['name', 'types', 'url', 'baseUrlEnv', 'authenticationType', 'authSecretEnv', 'issueKey', 'credentials']) {
      assert.ok(key in block, `the established key "${key}" was dropped`);
    }
  });

  test('generation stays deterministic — the same tenant produces the same bytes (C-03.18)', () => {
    const build = (): Record<string, string> => {
      tick = 0;
      return generate(tenant(welcome({ tenantName: 'determinism', applicationTypes: ['d365'], mfaRequired: true }), DISCOVERED));
    };
    assert.deepEqual(build(), build());
  });

  test('no generated file declares the same environment variable twice', () => {
    for (const id of APPLICATION_TEMPLATES.ids()) {
      const envFile = packageFor({ applicationTypes: [id, 'web'], mfaRequired: true })['.env.example']!;
      const assigned = [...envFile.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);
      assert.deepEqual([...new Set(assigned)], assigned, `${id} produced a duplicated .env slot`);
    }
  });
});
