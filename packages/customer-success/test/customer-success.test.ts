/**
 * Customer Success Platform Service.
 * TRACEABILITY: 25-customer-success-model.md · ADR-0018 · ADR-0021
 *   Criteria: C-25.3 (a failure names the unmet precondition)
 *             C-25.5 (examples validate against the live schema)
 *             C-25.6 (API documentation generated from contract schemas)
 *             C-25.9 (no real credentials, endpoints or tenant identifiers)
 *             C-25.11 · C-25.12 (the package is generated from validation output)
 * Categories: customer-success, documentation, cli, negative
 *
 * THE FAILURE PATHS ARE TESTED HARDEST.
 * A customer meets this code when something is already wrong. Tests that only cover
 * the happy path would certify the half of the product nobody reads.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  runCli, buildExamples, validateExamples, generateCompatibilityMatrix,
  generateOpenApi, generateErrorCatalogue, generateAuthenticationGuide, SYNTHETIC,
  buildRunbooks, validateRunbook, RunbookError, KNOWN_OPERATIONS,
  generateDocumentationSuite, buildCustomerSuccessPackage, generateIndex,
  checkNodeRuntime, checkConfiguration, checkDependencyPinning, summarise, renderReport,
  type ApiSurface, type SchemaSource, type Runbook,
} from '../src/index.js';

const SURFACE: ApiSurface = {
  authorisedPaths: ['/v1/execute'],
  contractVersion: '1.0.0',
  observedResponses: [
    { status: 401, reason: 'client certificate required', remedy: 'Present your client certificate.' },
    { status: 403, reason: 'not authorised for this path', remedy: 'Check the path, not the credentials.' },
  ],
};

const SCHEMAS: readonly SchemaSource[] = [{
  name: 'execution-package-v1.0.0.json',
  schema: {
    $id: 'https://contracts.dbiz.platform/execution-package/v1.0.0',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { runId: { type: 'string' }, capabilityId: { type: 'string' } },
  },
}];

const PACKAGE_INPUT = {
  releaseVersion: 'test', contractVersion: '1.0.0',
  generatorVersion: '1.0.0', templateVersion: '1.0.0',
  apiSurface: SURFACE, schemaSources: SCHEMAS,
  knownFailures: [{ symptom: 's', cause: 'c', remedy: 'r' }],
  unmeasured: [{ id: 'E-2', property: 'deployment', blocker: 'Docker unavailable' }],
  onboardingDurationMs: 1234,
  provenance: {
    repository: 'DBiz_IntelligencePlane', commit: 'abc123', branch: 'main',
    executionContext: 'test',
  },
  builtAt: '2026-07-22T00:00:00.000Z',
};

describe('configuration examples validate against the LIVE schema (C-25.5)', () => {
  test('every published example is accepted by the same validator onboarding calls', () => {
    // Not a copy of the schema. If this passed against a copy it would prove only
    // that the copy agrees with itself, which is the failure C-25.5 exists to prevent.
    const results = validateExamples(buildExamples());
    const invalid = results.filter((r) => !r.valid);
    assert.equal(invalid.length, 0, invalid.map((r) => `${r.id}: ${r.detail}`).join('; '));
    assert.ok(results.length >= 6, 'fewer examples than declared supported combinations');
  });

  test('examples are derived from the registry, so an unsupported one cannot be published', () => {
    const ids = new Set(buildExamples().map((e) => e.id));
    // A hand-listed example set drifts from the registry; a derived one cannot.
    assert.ok(ids.has('python-playwright'));
    assert.ok(ids.has('java-selenium'));
    assert.ok(!ids.has('python-selenium'), 'an unsupported combination was published as an example');
  });

  test('every example renders in all three formats, and none carries a secret', () => {
    for (const e of buildExamples()) {
      for (const format of ['json', 'yaml', 'env'] as const) {
        const content = e.rendered[format];
        assert.ok(content.length > 0, `${e.id} has no ${format} rendering`);
        assert.ok(!/PRIVATE KEY|AKIA[0-9A-Z]{16}/.test(content), `${e.id} ${format} carries key material`);
      }
      // The one-time credential belongs in a secret store, never in a committed file.
      assert.ok(!e.rendered.env.includes('CREDENTIAL='),
        `${e.id} env rendering embeds a registration credential`);
    }
  });

  test('example endpoints use reserved domains that cannot resolve (R-25.27)', () => {
    for (const e of buildExamples()) {
      const urls = e.rendered.json.match(/https?:\/\/[^"\s]+/g) ?? [];
      for (const u of urls) {
        assert.match(u, /\.(example|test|invalid)\b/,
          `${e.id} uses ${u}, which could resolve to a real system if copied`);
      }
    }
  });

  test('the compatibility matrix marks an unvalidated target as NOT VALIDATED', () => {
    const matrix = generateCompatibilityMatrix([
      { id: 'python-playwright', valid: false, detail: 'deliberately failed' },
    ]);
    assert.match(matrix, /NOT VALIDATED/);
    // Everything else has no validation record at all, so it must not read as passing.
    assert.ok(!/python \| playwright \| .*\*\*Validated\*\*/.test(matrix));
  });
});

describe('API documentation is generated from contract schemas (C-25.6)', () => {
  test('every published schema becomes a component', () => {
    const doc = generateOpenApi(SURFACE, SCHEMAS);
    const schemas = doc.components['schemas'] as Record<string, unknown>;
    assert.ok('ExecutionPackage' in schemas, 'the published schema is not a component');
  });

  test('document-framing keys are stripped so $ref resolution is not re-anchored', () => {
    const doc = generateOpenApi(SURFACE, SCHEMAS);
    const component = (doc.components['schemas'] as Record<string, Record<string, unknown>>)['ExecutionPackage']!;
    assert.ok(!('$id' in component), '$id survived into a component and would re-anchor resolution');
    assert.ok(!('$schema' in component), '$schema survived into a component');
    // The CONTENT must be untouched — only the framing is dropped.
    assert.deepEqual(Object.keys(component['properties'] as object), ['runId', 'capabilityId']);
  });

  test('only observed responses are documented', () => {
    const doc = generateOpenApi(SURFACE, SCHEMAS);
    const responses = Object.keys(doc.components['responses'] as object);
    assert.equal(responses.length, SURFACE.observedResponses.length);
    const catalogue = generateErrorCatalogue(SURFACE);
    // A status nobody observed must not appear. Documenting a 429 the gateway never
    // returns is a promise the platform has not made.
    assert.ok(!catalogue.includes('429'), 'an unobserved status was documented');
  });

  test('the error catalogue and the OpenAPI document cannot disagree', () => {
    const doc = generateOpenApi(SURFACE, SCHEMAS);
    const catalogue = generateErrorCatalogue(SURFACE);
    for (const r of SURFACE.observedResponses) {
      assert.ok(catalogue.includes(String(r.status)), `catalogue omits ${r.status}`);
      assert.ok(JSON.stringify(doc).includes(r.reason), `OpenAPI omits "${r.reason}"`);
    }
  });

  test('the authentication guide carries no token-shaped literal', () => {
    // A realistic-looking token reads as a credential to every scanner that meets it,
    // and teaches a reader nothing. This regressed once and is now asserted.
    const guide = generateAuthenticationGuide(SURFACE);
    assert.ok(!/\beyJ[A-Za-z0-9_-]{10,}/.test(guide), 'a JWT-shaped literal is present');
    assert.ok(guide.includes(SYNTHETIC.tenantId));
  });
});

describe('runbooks name only operations the platform has', () => {
  test('every step names a known operation and a way to verify it', () => {
    const runbooks = buildRunbooks();
    assert.ok(runbooks.length >= 10);
    for (const r of runbooks) {
      assert.ok(r.steps.length > 0, `${r.id} has no steps`);
      for (const s of r.steps) {
        assert.ok((KNOWN_OPERATIONS as readonly string[]).includes(s.operation),
          `${r.id} step ${s.n} names unknown operation ${s.operation}`);
        assert.ok(s.verify.length > 0, `${r.id} step ${s.n} has no verification`);
      }
      assert.ok(r.ifItFails.length > 0, `${r.id} does not say what to do when it fails partway`);
    }
  });

  test('a runbook naming a non-existent operation is REFUSED, not published', () => {
    // Throwing rather than warning is the point: a runbook referencing an operation
    // that does not exist is discovered during an incident, at the worst moment.
    const bad: Runbook = {
      id: 'fabricated', title: 'x', whenToUse: 'x', downtime: 'none', reversible: true,
      steps: [{ n: 1, action: 'do a thing', operation: 'platform.doTheThing', verify: 'it happened' }],
      ifItFails: 'x',
    };
    assert.throws(() => validateRunbook(bad), RunbookError);
  });

  test('irreversible runbooks say so, and take a backup before the destructive step', () => {
    const decommission = buildRunbooks().find((r) => r.id === 'tenant-decommissioning')!;
    assert.equal(decommission.reversible, false);
    const backupStep = decommission.steps.findIndex((s) => /backup/i.test(s.action));
    const destructiveStep = decommission.steps.findIndex((s) => s.operation === 'tenant.decommission');
    assert.ok(backupStep >= 0, 'no backup step');
    assert.ok(backupStep < destructiveStep, 'the backup step comes after the destructive one');
  });
});

describe('documentation is generated from validation output (R-25.34)', () => {
  const input = {
    contractVersion: '1.0.0', generatorVersion: '1.0.0', templateVersion: '1.0.0',
    validatedTargets: [
      { id: 'typescript-playwright', valid: true, detail: 'accepted' },
      { id: 'java-selenium', valid: false, detail: 'unsupported-combination' },
    ],
    examples: buildExamples(),
    observedResponses: SURFACE.observedResponses,
    knownFailures: [{ symptom: 'handshake fails', cause: 'proxy', remedy: 'exempt the endpoint' }],
    unmeasured: [{ id: 'E-2', property: 'deployment', blocker: 'Docker unavailable' }],
    onboardingMeasured: true,
  };

  test('an unmeasured property appears in Known Limitations without anyone editing a document', () => {
    const limitations = generateDocumentationSuite(input).find((d) => d.path === 'KNOWN-LIMITATIONS.md')!;
    assert.match(limitations.content, /E-2/);
    assert.match(limitations.content, /Docker unavailable/);
  });

  test('a target that stops validating leaves the install guide and appears as a limitation', () => {
    const docs = generateDocumentationSuite(input);
    const install = docs.find((d) => d.path === 'INSTALLATION.md')!;
    const limitations = docs.find((d) => d.path === 'KNOWN-LIMITATIONS.md')!;
    assert.ok(install.content.includes('typescript'), 'a validated target is missing from installation');
    assert.ok(!/\| java \| selenium \| \*\*Validated\*\*/.test(install.content),
      'a target that did NOT validate is presented as validated');
    assert.match(limitations.content, /java-selenium/);
  });

  test('measurement is reported as a fact, never as a per-run number', () => {
    const measured = generateDocumentationSuite(input).find((d) => d.path === 'QUICK-START.md')!;
    assert.match(measured.content, /MANIFEST\.json/);
    // A wall-clock duration inside a document makes the package non-deterministic, so
    // a customer can no longer verify they hold what was published. K-8.d caught this.
    assert.ok(!/\d+\.\ds/.test(measured.content), 'a per-run duration is rendered into a document');

    const unmeasured = generateDocumentationSuite({ ...input, onboardingMeasured: false })
      .find((d) => d.path === 'QUICK-START.md')!;
    // Never a guess, never silence. R-13.3: NOT MEASURED is reported, not omitted.
    assert.match(unmeasured.content, /NOT MEASURED/);
  });

  test('troubleshooting is built from observed refusals and known failures', () => {
    const doc = generateDocumentationSuite(input).find((d) => d.path === 'TROUBLESHOOTING.md')!;
    for (const r of SURFACE.observedResponses) assert.ok(doc.content.includes(r.reason));
    assert.match(doc.content, /handshake fails/);
  });

  test('the quick start lists exactly the steps the software runs', () => {
    const doc = generateDocumentationSuite(input).find((d) => d.path === 'QUICK-START.md')!;
    // Rendered from ONBOARDING_STEPS, so the guide cannot fall behind the workflow.
    assert.match(doc.content, /Checking your environment/);
    assert.match(doc.content, /Verifying an authenticated call/);
  });
});

describe('the Customer Success Package (C-25.11, C-25.12, C-25.13)', () => {
  test('it is generated, shippable and content-hashed', () => {
    const pkg = buildCustomerSuccessPackage(PACKAGE_INPUT);
    assert.equal(pkg.shippable, true, pkg.blockers.join('; '));
    assert.ok(pkg.files.length > 20);
    assert.match(pkg.contentHash.value, /^[0-9a-f]{64}$/);
  });

  test('two builds of the same release are byte-identical', () => {
    const a = buildCustomerSuccessPackage(PACKAGE_INPUT);
    const b = buildCustomerSuccessPackage(PACKAGE_INPUT);
    assert.equal(a.contentHash.value, b.contentHash.value);
    assert.deepEqual(a.files.map((f) => f.path), b.files.map((f) => f.path));
  });

  test('it is NOT shippable without contract schemas — documentation would not come from contracts', () => {
    const pkg = buildCustomerSuccessPackage({ ...PACKAGE_INPUT, schemaSources: [] });
    assert.equal(pkg.shippable, false);
    assert.match(pkg.blockers.join(' '), /C-25\.6/);
  });

  test('it is NOT shippable without observed responses — the catalogue would be written from memory', () => {
    const pkg = buildCustomerSuccessPackage({
      ...PACKAGE_INPUT,
      apiSurface: { ...SURFACE, observedResponses: [] },
    });
    assert.equal(pkg.shippable, false);
    assert.match(pkg.blockers.join(' '), /observed gateway response/);
  });

  test('validation evidence expires (C-25.13)', () => {
    const pkg = buildCustomerSuccessPackage({ ...PACKAGE_INPUT, expiryDays: 30 });
    const expiresAt = Date.parse(pkg.manifest['expiresAt'] as string);
    const builtAt = Date.parse(pkg.manifest['builtAt'] as string);
    assert.equal(expiresAt - builtAt, 30 * 86_400_000);
  });

  test('the manifest carries provenance, so a claim can be traced to its origin', () => {
    const pkg = buildCustomerSuccessPackage(PACKAGE_INPUT);
    for (const key of ['commit', 'branch', 'repository', 'executionContext', 'contentHash']) {
      assert.ok(pkg.manifest[key] !== undefined && pkg.manifest[key] !== null, `manifest lacks ${key}`);
    }
  });

  test('the index lists only files the package actually contains', () => {
    const pkg = buildCustomerSuccessPackage(PACKAGE_INPUT);
    const index = generateIndex(pkg);
    const present = new Set(pkg.files.map((f) => f.path));
    const linked = [...index.content.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);
    for (const link of linked.filter((l) => !l.startsWith('http'))) {
      assert.ok(present.has(link), `the index links ${link}, which the package does not contain`);
    }
  });

  test('environment examples avoid the .env name a secret scanner would flag', () => {
    const pkg = buildCustomerSuccessPackage(PACKAGE_INPUT);
    const envFiles = pkg.files.filter((f) => f.path.includes('env'));
    assert.ok(envFiles.length > 0);
    for (const f of envFiles) {
      assert.ok(!/(^|\/)\.env(\.|$)/.test(f.path),
        `${f.path} would be flagged as a retained secret file by the platform's own scan`);
    }
  });
});

describe('the CLI fails usefully (C-25.3)', () => {
  test('an unknown command lists the known ones and suggests the nearest', () => {
    const r = runCli(['doctr']);
    assert.equal(r.exitCode, 2);
    assert.match(r.stdout, /Known commands/);
    assert.match(r.stdout, /`doctor`/, 'no suggestion offered for an obvious typo');
  });

  test('a missing argument explains what it is and how to get one', () => {
    const r = runCli(['validate']);
    assert.equal(r.exitCode, 2);
    // Naming the flag is not enough; the message must say what a profile IS.
    assert.match(r.stdout, /profile is the JSON/);
    assert.match(r.stdout, /dbiz examples/);
  });

  test('a missing file and an unparseable file give DIFFERENT remedies', () => {
    const missing = runCli(['validate', '--profile', 'gone.json'], {
      readJson: () => { throw new Error('ENOENT: no such file or directory'); },
    });
    const malformed = runCli(['validate', '--profile', 'broken.json'], {
      readJson: () => { throw new Error('Unexpected token } in JSON at position 4'); },
    });
    assert.match(missing.stdout, /Cannot find/);
    assert.match(malformed.stdout, /Cannot parse/);
    assert.notEqual(missing.stdout, malformed.stdout,
      'a path problem and a syntax problem produce the same message');
  });

  test('exit codes distinguish "it failed" from "I could not run it"', () => {
    const cannotRun = runCli(['onboard']);
    assert.equal(cannotRun.exitCode, 2, 'a usage error must not look like a check failure');

    const failed = runCli(['validate', '--profile', 'p.json'], {
      readJson: () => ({ profileVersion: '1.0.0', language: 'klingon' }),
    });
    assert.equal(failed.exitCode, 1, 'a genuine validation failure must not look like a usage error');
  });

  test('doctor reports a skipped check rather than silently omitting it', () => {
    const r = runCli(['doctor']);
    // A check that did not run must be visible. Omission reads as a pass.
    assert.match(r.stdout, /skip/);
    assert.match(r.stdout, /--profile/);
  });

  test('onboarding without a platform endpoint says which commands still work', () => {
    const r = runCli(['onboard', '--tenant', 't', '--profile', 'p.json']);
    assert.equal(r.exitCode, 2);
    assert.match(r.stdout, /doctor.*validate.*examples.*runbook/s);
  });

  test('runbook with no argument lists them; an unknown id lists them too', () => {
    assert.equal(runCli(['runbook']).exitCode, 0);
    const unknown = runCli(['runbook', 'not-a-runbook']);
    assert.equal(unknown.exitCode, 2);
    assert.match(unknown.stdout, /Available:/);
  });

  test('help is success when asked for, and a usage error when nothing was asked', () => {
    assert.equal(runCli(['help']).exitCode, 0);
    assert.equal(runCli([]).exitCode, 2);
  });
});

describe('diagnostics name a remedy whenever they do not pass', () => {
  test('every non-passing check carries a remedy', () => {
    const results = [
      checkConfiguration({ language: 'nope' }),
      checkConfiguration({
        profileVersion: '1.0.0', language: 'python', framework: 'playwright',
        testRunner: 'playwright-test', ciSystem: 'github-actions', gitProvider: 'github',
        cloudProvider: 'azure', deploymentModel: 'container', packageManager: 'pip',
        reportingFramework: 'allure', frameworkVersions: {},
      }),
      checkDependencyPinning({ playwright: '^1.49.0' }),
    ];
    for (const r of results) {
      assert.equal(r.status, 'fail');
      assert.ok(r.remedy && r.remedy.length > 20, `${r.id} failed without a usable remedy`);
    }
  });

  test('a malformed profile and an unsupported combination get different remedies', () => {
    // Collapsing these into "invalid configuration" turns a two-minute fix into a
    // support case: one is a typo, the other is a roadmap conversation.
    const malformed = checkConfiguration({ language: 'nope' });
    const unsupported = checkConfiguration({
      profileVersion: '1.0.0', language: 'python', framework: 'playwright',
      testRunner: 'playwright-test', ciSystem: 'github-actions', gitProvider: 'github',
      cloudProvider: 'azure', deploymentModel: 'container', packageManager: 'pip',
      reportingFramework: 'allure', frameworkVersions: {},
    });
    assert.notEqual(malformed.remedy, unsupported.remedy);
  });

  test('the report prints failures before passes', () => {
    const report = summarise([
      checkNodeRuntime(),
      checkDependencyPinning({ playwright: '^1.49.0' }),
    ]);
    const rendered = renderReport(report);
    assert.ok(rendered.indexOf('FAIL') < rendered.indexOf('  ok  '),
      'a reader has to scroll past passes to reach the failure');
    assert.equal(report.ready, false);
  });

  test('warnings do not block readiness, but failures do', () => {
    assert.equal(summarise([{ id: 'x', checked: 'x', status: 'warn', detail: 'd' }]).ready, true);
    assert.equal(summarise([{ id: 'x', checked: 'x', status: 'fail', detail: 'd' }]).ready, false);
  });
});
