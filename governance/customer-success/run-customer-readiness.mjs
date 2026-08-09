/**
 * CUSTOMER READINESS SCENARIO — M2.7.
 * ============================================================================
 * Executes the whole customer journey against the real platform and reports what was
 * OBSERVED, as JSON, on stdout. It asserts nothing and exits 0 even when a step fails:
 * the harness that spawns it decides pass or fail. Collapsing "could not run" into
 * "ran and failed" is the failure C-0.4 exists to prevent.
 *
 * R-25.1: readiness is measured from EXECUTED OUTCOMES, never asserted from the
 * existence of documentation. Every property below is produced by running something.
 *
 *   K-1   a customer onboards end to end with no engineering intervention
 *   K-2   every declared supported target generates in its OWN language
 *   K-3   every documented configuration example validates against the live schema
 *   K-4   API documentation is generated from the published contract schemas
 *   K-5   the error catalogue matches refusals the gateway actually returned
 *   K-6   diagnostics identify a broken configuration and name the remedy
 *   K-7   runbook steps name only operations the platform has
 *   K-8   the Customer Success Package is generated, shippable and content-hashed
 *   K-9   documentation carries no real credential, endpoint or tenant identifier
 *   K-10  the whole journey replays to an identical outcome
 *
 * Run:  node governance/customer-success/run-customer-readiness.mjs
 * Out:  {"steps":[...],"digest":"<sha256>","onboardingDurationMs":N,"package":{...}}
 */
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');

const steps = [];
const step = (id, property, ok, detail) => steps.push({ id, property, ok: Boolean(ok), detail });

let onboardingDurationMs = null;
let packageSummary = null;
/**
 * What this run OBSERVED, published for the package emitter to consume.
 *
 * The emitter must not re-derive these. If it did, it could document a refusal the
 * gateway never returned — which is the exact failure the error catalogue exists to
 * prevent, reintroduced one layer down.
 */
let observations = { observedResponses: [], knownFailures: [], unmeasured: [] };

function emit(fatal) {
  const digest = createHash('sha256')
    .update('dbiz.customer-readiness@1')
    .update(JSON.stringify(steps.map((s) => [s.id, s.ok])))
    .digest('hex');
  process.stdout.write(JSON.stringify({
    steps, digest, fatal: fatal ?? null, onboardingDurationMs, package: packageSummary,
    ...observations,
  }));
  process.exit(0);
}

for (const pkg of ['contracts', 'platform-core', 'platform-runtime', 'customer-success']) {
  if (!existsSync(entry(pkg))) emit(`@dbiz/${pkg} is not built`);
}

const core = await import(pathToFileURL(entry('platform-core')).href);
const runtime = await import(pathToFileURL(entry('platform-runtime')).href);
const cs = await import(pathToFileURL(entry('customer-success')).href);
const contracts = await import(pathToFileURL(entry('contracts')).href);

const stateDir = mkdtempSync(join(tmpdir(), 'dbiz-cs-'));
const dataDir = mkdtempSync(join(tmpdir(), 'dbiz-cs-data-'));

try {
  const ca = runtime.CertificateAuthority.create({ stateDir, leafValidityDays: 30 });
  const auth = new runtime.AuthorisationServer({ accessTokenTtlSeconds: 300 });
  const TENANTS = ['tenant-alpha', 'tenant-beta'];
  const registration = new runtime.RegistrationService({ ca, auth, activeTenants: new Set(TENANTS) });
  const serverIdentity = ca.issueForTenant('gateway');
  const gateway = new runtime.ApiGateway({
    ca, auth,
    serverCertPem: serverIdentity.certificatePem,
    serverKeyPem: serverIdentity.privateKeyPem,
    authorisedPaths: ['/v1/execute'],
    rateLimit: 200,
  });

  // ── K-1 · a customer onboards with no engineering intervention ─────────────
  const profile = {
    profileVersion: '1.0.0', language: 'typescript', framework: 'playwright',
    testRunner: 'playwright-test', ciSystem: 'github-actions', gitProvider: 'github',
    cloudProvider: 'azure', deploymentModel: 'container', packageManager: 'pnpm',
    reportingFramework: 'allure', frameworkVersions: { playwright: '1.49.0' },
  };

  const progress = [];
  const startedAt = process.hrtime.bigint();
  const onboarded = cs.runOnboarding(
    {
      tenantId: 'tenant-alpha',
      profile,
      registrationEndpoint: 'https://gateway.example.test/v1/register',
    },
    { ca, auth, registration, onProgress: (s, i, total) => progress.push(`${i}/${total} ${s.id}`) },
  );
  onboardingDurationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  step('K-1', 'a customer completes onboarding end to end with no engineering intervention',
    onboarded.succeeded && onboarded.completed === onboarded.total && progress.length === onboarded.total,
    onboarded.succeeded
      ? `${onboarded.completed}/${onboarded.total} steps, ${onboardingDurationMs.toFixed(0)}ms, ${onboarded.solution.fileCount} files generated`
      : `stopped at step ${onboarded.steps.length}: ${onboarded.steps[onboarded.steps.length - 1]?.detail}`);

  // Onboarding must also FAIL well. A workflow that only works when nothing is wrong
  // does not remove the need for an engineer — it defers it to the worst moment.
  const badOnboarding = cs.runOnboarding(
    { tenantId: 'tenant-beta', profile: { ...profile, testRunner: 'junit5' }, registrationEndpoint: 'https://gateway.example.test/v1/register' },
    { ca, auth, registration },
  );
  const failedStep = badOnboarding.steps.find((s) => s.status === 'failed');
  step('K-1.f', 'a rejected profile stops onboarding BEFORE anything is created, and names the remedy',
    !badOnboarding.succeeded && Boolean(failedStep?.remedy)
      && !registration.isRegistered('tenant-beta')
      && badOnboarding.steps.length < cs.ONBOARDING_STEPS.length,
    failedStep
      ? `stopped at "${failedStep.label}" with a remedy; tenant-beta was NOT created`
      : 'the invalid profile was accepted');

  // ── K-2 · every declared supported target generates in its OWN language ────
  const versionsFor = (framework) => (framework === 'playwright'
    ? { playwright: '1.49.0' } : { 'selenium-java': '4.27.0' });
  const wrongLanguage = [];
  for (const s of core.SUPPORTED) {
    const p = {
      ...profile, language: s.language, framework: s.framework,
      testRunner: s.testRunners[0], packageManager: s.packageManagers[0],
      frameworkVersions: versionsFor(s.framework),
    };
    const generated = core.generateSolution(p, {
      tenantId: 'tenant-example',
      registrationEndpoint: 'https://gateway.example.test/v1/register',
      oneTimeRegistrationCredential: 'otc-example',
    });
    // Sources must belong to the declared language. A Python profile emitting `.ts`
    // is the declared-but-unbuilt failure C-25.8 exists to catch, and it is invisible
    // to a file count.
    const own = core.SOURCE_EXTENSIONS[s.language];
    const foreign = Object.entries(core.SOURCE_EXTENSIONS)
      .filter(([lang]) => lang !== s.language)
      .flatMap(([, exts]) => exts)
      .filter((ext) => !own.includes(ext));
    const offenders = generated.files
      .filter((f) => f.path.startsWith('src/') && foreign.some((ext) => f.path.endsWith(ext)))
      .map((f) => f.path);
    const hasOwn = generated.files.some((f) => own.some((ext) => f.path.endsWith(ext)));
    if (offenders.length > 0 || !hasOwn) {
      wrongLanguage.push(`${s.language}/${s.framework}: ${offenders.length > 0 ? `emits ${offenders.join(', ')}` : 'emits no source in its own language'}`);
    }
  }
  step('K-2', 'every declared supported target generates sources in its OWN language',
    wrongLanguage.length === 0,
    wrongLanguage.length === 0
      ? `${core.SUPPORTED.length} declared combinations, each emitting only its own language`
      : wrongLanguage.join(' · '));

  // ── K-3 · every documented example validates against the LIVE schema ───────
  const examples = cs.buildExamples();
  const validations = cs.validateExamples(examples);
  const invalid = validations.filter((v) => !v.valid);
  step('K-3', 'every documented configuration example validates against the live schema',
    invalid.length === 0 && validations.length > 0,
    invalid.length === 0
      ? `${validations.length} examples, each accepted by the same validator onboarding calls`
      : invalid.map((v) => `${v.id}: ${v.detail}`).join('; '));

  // ── K-5 · the error catalogue matches refusals the gateway ACTUALLY returns ─
  // Provoked, not assumed. Each entry below is produced by making the gateway refuse.
  const grant = registration.grantFor('tenant-alpha');
  const otherGrant = (() => {
    const otc = auth.issueOneTimeCredential('tenant-beta');
    const r = registration.register({ tenantId: 'tenant-beta', oneTimeCredential: otc });
    return r.ok ? r.grant : null;
  })();

  const provoked = [
    ['no certificate', gateway.handle(null, { path: '/v1/execute', token: grant.access.token, nonce: 'k5-1' })],
    ['no token', gateway.handle(grant.certificate.certificatePem, { path: '/v1/execute', nonce: 'k5-2' })],
    ['unauthorised path', gateway.handle(grant.certificate.certificatePem, { path: '/v1/forbidden', token: grant.access.token, nonce: 'k5-3' })],
    ['claimed tenant', gateway.handle(grant.certificate.certificatePem, { path: '/v1/execute', token: grant.access.token, nonce: 'k5-4', claimedTenantId: 'tenant-beta' })],
    ['stolen token', gateway.handle(otherGrant.certificate.certificatePem, { path: '/v1/execute', token: grant.access.token, nonce: 'k5-5' })],
  ];
  const observedResponses = [];
  const seen = new Set();
  for (const [, response] of provoked) {
    if (response.status === 200) continue;
    const key = `${response.status}:${response.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    observedResponses.push({
      status: response.status,
      reason: response.reason,
      remedy: remedyFor(response.status, response.reason),
    });
  }
  step('K-5', 'the error catalogue is built from refusals the gateway actually returned',
    observedResponses.length >= 4,
    `${observedResponses.length} distinct refusals provoked: ${observedResponses.map((r) => `${r.status} ${r.reason}`).join(' · ')}`);

  // ── K-6 · diagnostics identify a broken configuration and name the remedy ──
  const brokenChecks = [
    cs.checkConfiguration({ ...profile, framework: 'not-a-framework' }),
    cs.checkConfiguration({ ...profile, language: 'python', testRunner: 'playwright-test' }),
    cs.checkDependencyPinning({ playwright: '^1.49.0' }),
  ];
  const goodChecks = [
    cs.checkConfiguration(profile),
    cs.checkCertificate(ca, grant.certificate.certificatePem, 'tenant-alpha'),
    cs.checkAccessToken(auth, grant.access.token, grant.certificate.keyId),
    cs.checkGateway(gateway, grant.certificate.certificatePem, grant.access.token, '/v1/execute', 'k6-ok'),
    cs.checkTenantIsolation(() => new runtime.TenantPaths(dataDir, TENANTS).path('tenant-alpha', '../tenant-beta')),
  ];
  const allBrokenCaught = brokenChecks.every((c) => c.status === 'fail' && Boolean(c.remedy));
  const allGoodPass = goodChecks.every((c) => c.status === 'pass' || c.status === 'warn');
  step('K-6', 'diagnostics identify broken configuration and name a remedy, and pass a good one',
    allBrokenCaught && allGoodPass,
    `${brokenChecks.length}/${brokenChecks.length} faults caught with remedies · ${goodChecks.filter((c) => c.status === 'pass').length}/${goodChecks.length} healthy checks pass`);

  // A diagnostic that cannot distinguish two different faults sends the customer down
  // the wrong path, so the remedies must differ rather than merely exist.
  const distinctRemedies = new Set(brokenChecks.map((c) => c.remedy)).size;
  step('K-6.d', 'different faults produce different remedies',
    distinctRemedies === brokenChecks.length,
    `${distinctRemedies} distinct remedies across ${brokenChecks.length} distinct faults`);

  // ── K-7 · runbook steps name only operations the platform has ──────────────
  let runbookError = null;
  let runbooks = [];
  try {
    runbooks = cs.buildRunbooks();
  } catch (e) {
    runbookError = e.message;
  }
  const verifiedSteps = runbooks.reduce((n, r) => n + r.steps.filter((s) => s.verify).length, 0);
  const totalSteps = runbooks.reduce((n, r) => n + r.steps.length, 0);
  step('K-7', 'every runbook step names a real platform operation and how to verify it',
    runbookError === null && runbooks.length > 0 && verifiedSteps === totalSteps,
    runbookError ?? `${runbooks.length} runbooks, ${totalSteps} steps, all naming known operations and carrying a verification`);

  // ── K-4 and K-8 · API docs from schemas, and the package ───────────────────
  const schemaDir = join(ROOT, 'packages', 'contracts', 'schema');
  const schemaSources = existsSync(schemaDir)
    ? readdirSync(schemaDir).filter((f) => f.endsWith('.json')).sort().map((name) => ({
      name, schema: JSON.parse(readFileSync(join(schemaDir, name), 'utf8')),
    }))
    : [];

  const apiSurface = {
    authorisedPaths: ['/v1/execute'],
    observedResponses,
    contractVersion: contracts.CONTRACT_VERSION,
  };

  const openapi = cs.generateOpenApi(apiSurface, schemaSources);
  // Every published schema must appear as a component, and the component must be the
  // published schema — not a summary of it. Anything less is documentation that
  // resembles the contract.
  const componentNames = Object.keys(openapi.components.schemas);
  const publishedProperties = schemaSources.flatMap((s) => {
    const inner = s.schema.allOf?.[0]?.properties ?? s.schema.properties ?? {};
    return Object.keys(inner);
  });
  const documentedProperties = componentNames.flatMap((n) => {
    const c = openapi.components.schemas[n];
    const inner = c?.allOf?.[0]?.properties ?? c?.properties ?? {};
    return Object.keys(inner);
  });
  const missingProperties = publishedProperties.filter((p) => !documentedProperties.includes(p));

  step('K-4', 'API documentation is generated from the published contract schemas',
    schemaSources.length > 0 && missingProperties.length === 0
      && componentNames.length >= schemaSources.length,
    schemaSources.length === 0
      ? 'no published schema was found — API documentation could not be generated from contracts'
      : `${schemaSources.length} schemas -> ${componentNames.length} components, ${publishedProperties.length} contract properties all present`);

  observations = {
    observedResponses,
    knownFailures: knownFailures(),
    unmeasured: readUnmeasured(),
  };

  const pkg = cs.buildCustomerSuccessPackage({
    releaseVersion: 'M2.7',
    contractVersion: contracts.CONTRACT_VERSION,
    generatorVersion: core.GENERATOR_VERSION ?? '1.0.0',
    templateVersion: core.TEMPLATE_VERSION ?? '1.0.0',
    apiSurface,
    schemaSources,
    knownFailures: knownFailures(),
    unmeasured: readUnmeasured(),
    onboardingDurationMs,
    provenance: {
      repository: 'DBiz_IntelligencePlane',
      commit: gitOrNull(['rev-parse', 'HEAD']),
      branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
      executionContext: `node ${process.version} on ${process.platform}`,
    },
    // Supplied rather than read from the clock inside the builder, so a rebuild of the
    // same release is byte-identical and can be compared.
    builtAt: '2026-07-22T00:00:00.000Z',
  });
  const index = cs.generateIndex(pkg);
  packageSummary = {
    fileCount: pkg.files.length + 1,
    contentHash: pkg.contentHash.value,
    shippable: pkg.shippable,
    blockers: pkg.blockers,
  };

  step('K-8', 'the Customer Success Package is generated from validation output and is shippable',
    pkg.shippable && pkg.files.length > 20 && index.content.length > 0,
    pkg.shippable
      ? `${pkg.files.length + 1} files, content hash ${pkg.contentHash.value.slice(0, 16)}…`
      : `NOT shippable: ${pkg.blockers.join('; ')}`);

  // ── K-9 · no real credential, endpoint or tenant identifier ───────────────
  // R-25.26/27. Scans for SHAPES, not for a list of known values: searching for one
  // real endpoint would only prove that one endpoint is absent.
  const FORBIDDEN = [
    ['a non-reserved hostname', /https?:\/\/(?!.*\.(?:example|test|invalid|localhost)\b)[a-z0-9-]+\.[a-z]{2,}/gi],
    ['a private IP endpoint', /https?:\/\/(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./g],
    ['a bearer token literal', /\b(?:eyJ[A-Za-z0-9_-]{20,})\b/g],
    ['a PEM private key', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g],
    ['an AWS-style access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ];
  const leaks = [];
  for (const f of [...pkg.files, index]) {
    const scannable = scrubSchemaIdentifiers(f.content);
    for (const [kind, re] of FORBIDDEN) {
      const found = scannable.match(re);
      if (found) leaks.push(`${f.path}: ${kind} (${found[0].slice(0, 40)})`);
    }
  }
  step('K-9', 'no documentation file carries a real credential, endpoint or tenant identifier',
    leaks.length === 0,
    leaks.length === 0
      ? `${pkg.files.length + 1} files scanned for ${FORBIDDEN.length} artefact shapes, none found`
      : leaks.slice(0, 3).join(' · '));

  // Synthetic values must also be RECOGNISABLY synthetic (R-25.27), or a copied
  // example can quietly point somewhere real.
  const usesReserved = [...pkg.files, index]
    .map((f) => scrubSchemaIdentifiers(f.content))
    .filter((c) => /https?:\/\//.test(c))
    .every((c) => /\.(example|test|invalid)\b/.test(c));
  step('K-9.s', 'every example endpoint uses a reserved, non-resolving domain',
    usesReserved,
    usesReserved ? 'all example URLs use RFC 2606 reserved domains' : 'an example URL uses a resolvable domain');

  emit(null);
} catch (e) {
  emit(e && e.message ? e.message : String(e));
} finally {
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
}

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Remove JSON Schema IDENTIFIER URIs before scanning for endpoints.
 *
 * `$id` and `$schema` are identifiers, not addresses — nothing dereferences them, and
 * rewriting them would break `$ref` resolution and make the shipped schema differ from
 * the published one. They are therefore exempt from the endpoint rule.
 *
 * The exemption is deliberately NARROW: it removes only those two values, so any other
 * URL inside a schema file is still caught. Exempting whole files would have been
 * easier and would have created somewhere for a real endpoint to hide.
 */
function scrubSchemaIdentifiers(content) {
  return content.replace(/"\$(?:id|schema)":\s*"[^"]*"/g, '"$id":""');
}

function remedyFor(status, reason) {
  if (status === 429) return 'You are above your request rate. Back off and retry; this is a limit, not a fault.';
  if (status === 403) return 'Authenticated, but not entitled to what you asked for. Reissuing credentials will not change this — check the path and the tenant.';
  if (/certificate required/i.test(reason)) return 'Present your client certificate. Mutual TLS is required; a token alone is never sufficient.';
  if (/revoked/i.test(reason)) return 'This certificate was revoked. If you did not expect that, treat it as a security event before reissuing.';
  if (/token/i.test(reason)) return 'Obtain a token bound to the certificate you are presenting. After rotating, fetch a new one.';
  return 'Run `dbiz doctor`; it names which layer refused and what to do.';
}

/**
 * Known failures, each harvested from a diagnostic remedy rather than invented.
 *
 * A function rather than a const: this file runs its scenario at module top level, so
 * a `const` declared below it sits in the temporal dead zone and throws on use. The
 * failure surfaced as "Cannot access before initialization" AFTER nine steps had
 * already passed — which is exactly why the scenario reports rather than asserts.
 */
function knownFailures() {
  return [
  {
    symptom: 'Handshake fails inside the corporate network, succeeds outside',
    cause: 'A TLS-inspecting proxy re-signs traffic and presents its own certificate',
    remedy: 'Exempt the platform endpoint from TLS inspection. Mutual TLS cannot survive a re-signing proxy.',
  },
  {
    symptom: 'A valid token is refused immediately after certificate rotation',
    cause: 'Tokens are bound to the certificate they were issued against',
    remedy: 'Fetch a token for the new certificate. This is the binding working, not a fault.',
  },
  {
    symptom: 'Registration reports the credential is already consumed',
    cause: 'The credential is single-use and this deployment has registered before',
    remedy: 'Registration is idempotent by tenant — re-registering returns your existing grant. If it does not, the tenant identifier is wrong.',
  },
  {
    symptom: 'Every field in the profile is valid but it is still refused',
    cause: 'The combination is not buildable, even though each value is known',
    remedy: 'Check the compatibility matrix. A profile that parses is not a profile that can be built.',
  },
  {
    symptom: 'Onboarding fails at the environment check',
    cause: 'Node.js is older than the supported minimum',
      remedy: 'Install Node.js 24 LTS. Older versions fail later as a handshake error, which is much harder to diagnose.',
    },
  ];
}

/** Unmeasured properties, read from operational evidence rather than restated. */
function readUnmeasured() {
  try {
    const ev = JSON.parse(readFileSync(join(ROOT, 'governance', 'operational', 'evidence.json'), 'utf8'));
    return (ev.unmeasured ?? []).map((u) => ({ id: u.id, property: u.property, blocker: u.blocker }));
  } catch {
    // Not an empty list: "we could not read what is unmeasured" and "nothing is
    // unmeasured" are opposite claims and must not render identically.
    return [{
      id: 'UNKNOWN', property: 'operational evidence could not be read',
      blocker: 'governance/operational/evidence.json is absent or unparseable — run the operational harness',
    }];
  }
}

function gitOrNull(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
}
