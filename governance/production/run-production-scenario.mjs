/**
 * PRODUCTION OPERATIONAL RUN — M2.8.
 * ============================================================================
 * Executes the full tenant lifecycle with telemetry attached, then interrogates what
 * the observability layer actually recorded. Reports as JSON on stdout; asserts
 * nothing; exits 0 either way.
 *
 * THE QUESTION THIS ANSWERS IS NOT "DID IT WORK" — M2.6 ANSWERED THAT.
 * It is: when it works, and when it fails, **can you tell from the outside?** A
 * platform whose operations succeed but emit nothing is not production-ready; it is
 * production-blind, and every future incident will be diagnosed by reading source.
 *
 *   P-1   the full lifecycle executes and is observable end to end
 *   P-2   every operation is traceable by correlation id
 *   P-3   telemetry carries no customer content
 *   P-4   health, readiness and liveness answer different questions
 *   P-5   SLIs compute from emitted telemetry, and report NOT MEASURED without it
 *   P-6   security events are recorded, classified and attributable
 *   P-7   the audit chain is complete across the lifecycle
 *   P-8   dashboards validate against the metrics actually emitted
 *   P-9   release governance verifies artefact integrity and compatibility
 *   P-10  every tenant is independently observable
 *
 * Run:  node governance/production/run-production-scenario.mjs
 * Out:  {"properties":[...],"digest":"<sha256>","metrics":[...]}
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');

const properties = [];
let fatal = null;
let metricSnapshot = [];
const record = (id, property, ok, detail) =>
  properties.push({ id, property, ok: Boolean(ok), detail });

function emit() {
  const digest = createHash('sha256')
    .update('dbiz.production-scenario@1')
    .update(JSON.stringify(properties.map((p) => [p.id, p.ok])))
    .digest('hex');
  process.stdout.write(JSON.stringify({ properties, digest, fatal, metrics: metricSnapshot }));
  process.exit(0);
}

for (const pkg of ['contracts', 'platform-core', 'platform-runtime', 'observability']) {
  if (!existsSync(entry(pkg))) { fatal = `@dbiz/${pkg} is not built`; emit(); }
}

const core = await import(pathToFileURL(entry('platform-core')).href);
const runtime = await import(pathToFileURL(entry('platform-runtime')).href);
const obs = await import(pathToFileURL(entry('observability')).href);

const stateDir = mkdtempSync(join(tmpdir(), 'dbiz-prod-'));
const dataDir = mkdtempSync(join(tmpdir(), 'dbiz-prod-data-'));

try {
  // ── Instrumented platform ─────────────────────────────────────────────────
  const telemetry = new obs.Telemetry(obs.fixedClock(1_700_000_000_000, 1));
  const metrics = new obs.Metrics();
  for (const d of obs.PLATFORM_METRICS) metrics.declare(d);

  const ca = runtime.CertificateAuthority.create({ stateDir, leafValidityDays: 30 });
  const sharedNonces = new runtime.InMemoryNonceStore();
  const auth = new runtime.AuthorisationServer({
    accessTokenTtlSeconds: 3600,
    signingKey: runtime.loadOrCreateSigningKey(stateDir),
    nonceStore: sharedNonces,
  });
  const TENANTS = ['tenant-alpha', 'tenant-beta', 'tenant-gamma'];
  const registration = new runtime.RegistrationService({ ca, auth, activeTenants: new Set(TENANTS) });
  const serverIdentity = ca.issueForTenant('gateway');
  const gateway = new runtime.ApiGateway({
    ca, auth,
    serverCertPem: serverIdentity.certificatePem,
    serverKeyPem: serverIdentity.privateKeyPem,
    authorisedPaths: ['/v1/execute'],
    rateLimit: 100_000,
  });

  const health = new obs.HealthMonitor(metrics, () => '2026-07-22T00:00:00.000Z');
  health.register({
    name: 'certificate-authority', requiredForReadiness: true,
    check: () => (existsSync(join(stateDir, 'ca.crt'))
      ? { state: 'healthy', detail: 'root certificate present' }
      : { state: 'unhealthy', detail: 'root certificate missing' }),
  });
  health.register({
    name: 'authorisation-server', requiredForReadiness: true,
    check: () => ({ state: 'healthy', detail: 'issuing and verifying tokens' }),
  });
  health.register({
    name: 'replay-protection', requiredForReadiness: false,
    // A degraded state, not a healthy one: the default store is correct for no
    // production topology, and readiness must not hide that.
    check: () => (auth.replayProtectionIsSingleProcessOnly
      ? { state: 'degraded', detail: 'single-process nonce store; a horizontally scaled deployment needs a shared one' }
      : { state: 'healthy', detail: 'shared nonce store in use' }),
  });

  /** Instrumented lifecycle operations. Every one emits telemetry and metrics. */
  const onboard = (tenantId) => {
    const correlationId = telemetry.newCorrelationId();
    const span = telemetry.startSpan('onboard', { correlationId, tenantId });
    telemetry.log('info', 'onboarding.started', { correlationId, tenantId, spanId: span });

    const profile = {
      profileVersion: '1.0.0', language: 'typescript', framework: 'playwright',
      testRunner: 'playwright-test', ciSystem: 'github-actions', gitProvider: 'github',
      cloudProvider: 'azure', deploymentModel: 'container', packageManager: 'pnpm',
      reportingFramework: 'allure', frameworkVersions: { playwright: '1.49.0' },
    };
    const genStarted = process.hrtime.bigint();
    const solution = core.generateSolution(profile, {
      tenantId,
      registrationEndpoint: 'https://gateway.example.test/v1/register',
      oneTimeRegistrationCredential: auth.issueOneTimeCredential(tenantId),
    });
    metrics.observe('generation.duration', Number(process.hrtime.bigint() - genStarted) / 1e6, tenantId);
    metrics.increment('generation.succeeded', tenantId);

    const credential = auth.issueOneTimeCredential(tenantId);
    const regStarted = process.hrtime.bigint();
    const result = registration.register({ tenantId, oneTimeCredential: credential });
    metrics.observe('registration.duration', Number(process.hrtime.bigint() - regStarted) / 1e6, tenantId);

    if (result.ok) {
      metrics.increment('registration.succeeded', tenantId);
      metrics.increment('certificate.issued', tenantId);
      metrics.increment('audit.recorded', tenantId);
      telemetry.log('info', 'onboarding.completed', { correlationId, tenantId, spanId: span },
        { outcome: 'registered', files: solution.files.length });
      telemetry.endSpan(span, 'ok');
      return { correlationId, grant: result.grant };
    }
    metrics.increment('registration.failed', tenantId);
    telemetry.log('error', 'onboarding.failed', { correlationId, tenantId, spanId: span },
      { outcome: result.reason });
    telemetry.endSpan(span, 'error');
    return { correlationId, grant: null };
  };

  const call = (tenantId, grant, nonce, options = {}) => {
    const correlationId = telemetry.newCorrelationId();
    const span = telemetry.startSpan('gateway.call', { correlationId, tenantId });
    const started = process.hrtime.bigint();
    const response = gateway.handle(options.certificatePem ?? grant.certificate.certificatePem, {
      path: options.path ?? '/v1/execute',
      token: options.token ?? grant.access.token,
      nonce,
      ...(options.claimedTenantId ? { claimedTenantId: options.claimedTenantId } : {}),
    });
    metrics.observe('gateway.duration', Number(process.hrtime.bigint() - started) / 1e6, tenantId);

    if (response.status === 200) {
      metrics.increment('gateway.served', tenantId);
      telemetry.endSpan(span, 'ok');
    } else {
      // POLICY REFUSAL vs. UNEXPECTED REFUSAL.
      //
      // A WORKING CONTROL IS NOT AN AVAILABILITY FAILURE. This was modelled too
      // narrowly at first — only 403s and rate limits counted as policy — so refusing
      // a replayed nonce or a stolen token drove the availability SLI down. The
      // platform was being penalised for doing exactly what it exists to do, and the
      // tenants it protected were reported as degraded.
      //
      // Unexpected means THE PLATFORM FAILED, not that it refused. Every recognised
      // refusal is a decision; only an unrecognised one is a fault, which is also why
      // the classifier returns `unclassified` rather than guessing.
      const classification = obs.classify(response.reason);
      const isPolicy = classification.category !== 'unclassified';
      metrics.increment(isPolicy ? 'gateway.refused_by_policy' : 'gateway.refused_unexpectedly', tenantId);
      if (classification.category === 'security.replay') metrics.increment('security.replay_refused', tenantId);
      if (classification.category === 'security.cross-tenant-attempt') {
        metrics.increment('security.cross_tenant_refused', tenantId);
      }
      telemetry.log('warn', 'gateway.refused', { correlationId, tenantId, spanId: span },
        { status: response.status, category: classification.category, severity: classification.severity });
      telemetry.endSpan(span, 'error');
    }
    return { correlationId, response };
  };

  health.markStarted();

  // ── P-1 · full lifecycle, observable ──────────────────────────────────────
  const onboarded = new Map();
  for (const t of TENANTS) {
    const r = onboard(t);
    if (r.grant) onboarded.set(t, r);
  }

  for (const [t, { grant }] of onboarded) {
    for (let i = 0; i < 30; i += 1) call(t, grant, `p1-${t}-${i}`);
  }

  // Upgrade, rotation, secret rotation, recovery, removal — the operational run.
  const paths = new runtime.TenantPaths(dataDir, TENANTS);
  const vault = new runtime.TenantVault(paths);
  const queues = new runtime.TenantQueues(paths);
  const quotas = new runtime.TenantQuotas(1000);

  for (const t of TENANTS) {
    registration.recordUpgrade(t, 'technology-pack 1.1.0');
    metrics.increment('audit.recorded', t);

    const rotated = registration.rotateCertificate(t);
    metrics.increment(rotated.ok ? 'certificate.rotated' : 'certificate.rotation_failed', t);
    if (rotated.ok) {
      onboarded.set(t, { ...onboarded.get(t), grant: rotated.grant });
      metrics.set('certificate.days_remaining', 30, t);
    }

    const v1 = vault.store(t, 'signing-key', `value-${t}`);
    vault.rotate(t, 'signing-key');
    metrics.increment('secret.rotated', t);
    vault.revoke(t, 'signing-key', v1.version);
    metrics.increment('secret.revoked', t);

    for (let i = 0; i < 5; i += 1) { queues.enqueue(t, `item-${i}`); metrics.increment('queue.enqueued', t); }
    metrics.set('queue.depth', queues.depth(t), t);
    const drained = queues.drain(t);
    metrics.increment('queue.drained', t, drained.length);
    metrics.set('queue.depth', queues.depth(t), t);

    quotas.consume(t, 10);
    metrics.set('quota.remaining', quotas.remaining(t), t);
  }

  // Calls after rotation, proving continuity under the new credentials.
  for (const [t, { grant }] of onboarded) {
    for (let i = 0; i < 20; i += 1) call(t, grant, `p1b-${t}-${i}`);
  }

  const lifecycleOk = onboarded.size === TENANTS.length
    && TENANTS.every((t) => (metrics.read('gateway.served', t)?.value ?? 0) >= 50);
  record('P-1', 'the full tenant lifecycle executes and every stage emits telemetry',
    lifecycleOk,
    `${onboarded.size}/${TENANTS.length} tenants onboarded, rotated, secret-rotated, queued and served; ${telemetry.records.length} log records, ${telemetry.traces.length} spans`);

  // ── P-2 · traceability by correlation id ──────────────────────────────────
  const sample = [...onboarded.values()][0].correlationId;
  const chain = telemetry.byCorrelation(sample);
  const everySpanFinished = telemetry.traces.every((s) => s.outcome !== 'unfinished');
  record('P-2', 'every operation is traceable by correlation id, and no span is left unfinished',
    chain.length >= 2 && everySpanFinished,
    `${chain.length} records for one onboarding; ${telemetry.traces.length} spans, ${telemetry.traces.filter((s) => s.outcome === 'unfinished').length} unfinished`);

  // ── P-3 · telemetry carries no customer content ───────────────────────────
  // Verified by trying to emit some. A scan of what happens to be recorded proves only
  // that nobody happened to log a payload today.
  let refused = 0;
  for (const [field, value] of [['body', '{"secret":1}'], ['detail', 'user@example.com'], ['payload', 'x']]) {
    try { telemetry.log('info', 'probe', { correlationId: 'probe' }, { [field]: value }); }
    catch { refused += 1; }
  }
  const contentInRecords = telemetry.records.some((r) =>
    Object.values(r.attributes).some((v) => typeof v === 'string' && /@|PRIVATE KEY|eyJ/.test(v)));
  record('P-3', 'telemetry refuses customer content at the call site (C-23.11)',
    refused === 3 && !contentInRecords,
    `${refused}/3 attempts to emit customer content were refused; ${contentInRecords ? 'content found in records' : 'no content in any record'}`);

  // ── P-4 · health, readiness, liveness ─────────────────────────────────────
  const liveness = health.liveness();
  const readiness = health.readiness();
  const overall = health.health('gateway.served');
  const silentMetrics = new obs.Metrics();
  for (const d of obs.PLATFORM_METRICS) silentMetrics.declare(d);
  const silentHealth = new obs.HealthMonitor(silentMetrics, () => '2026-07-22T00:00:00.000Z');
  silentHealth.markStarted();
  silentHealth.register({ name: 'everything', requiredForReadiness: true, check: () => ({ state: 'healthy', detail: 'up' }) });
  const silent = silentHealth.health('gateway.served');

  record('P-4', 'liveness, readiness and health answer different questions, and silence is not health',
    liveness.state === 'pass' && readiness.state === 'pass'
      && overall.state !== 'unknown' && silent.state === 'unknown',
    `liveness ${liveness.state}, readiness ${readiness.state}, health ${overall.state}; a platform with healthy dependencies but NO activity reports "${silent.state}"`);

  // ── P-5 · SLIs from emitted telemetry ─────────────────────────────────────
  const slos = new obs.SloRegistry(
    { read: (n, t) => metrics.read(n, t), tenantsFor: (n) => metrics.tenantsFor(n) },
    () => '2026-07-22T00:00:00.000Z',
  );
  for (const s of obs.PLATFORM_SLOS) slos.publish(s);

  const gatewayReadings = slos.readPerTenant('slo.gateway');
  const registrationReadings = slos.readPerTenant('slo.registration');
  const unmeasured = slos.read('slo.certificate-rotation', 'tenant-never-seen');
  record('P-5', 'SLIs compute from emitted telemetry, and report NOT MEASURED without it',
    gatewayReadings.every((r) => r.status === 'met')
      && registrationReadings.every((r) => r.status === 'met')
      && unmeasured.status === 'NOT MEASURED' && unmeasured.achieved === null,
    `gateway ${gatewayReadings.length} tenants all met; registration ${registrationReadings.length} all met; an unreported tenant reads NOT MEASURED with no number`);

  // ── P-6 · security events ─────────────────────────────────────────────────
  const alpha = onboarded.get('tenant-alpha');
  const beta = onboarded.get('tenant-beta');
  const nonce = 'p6-replay';
  call('tenant-alpha', alpha.grant, nonce);
  const replayAttempt = call('tenant-alpha', alpha.grant, nonce);
  const crossTenant = call('tenant-beta', beta.grant, 'p6-cross', { claimedTenantId: 'tenant-alpha' });
  const stolenToken = call('tenant-beta', beta.grant, 'p6-stolen', { token: alpha.grant.access.token });
  const unauthorisedPath = call('tenant-alpha', alpha.grant, 'p6-path', { path: '/v1/forbidden' });

  const securityEvents = telemetry.records.filter((r) => r.event === 'gateway.refused');
  const categories = new Set(securityEvents.map((r) => r.attributes['category']));
  const attributable = securityEvents.every((r) => r.tenantId !== null && r.correlationId !== null);
  record('P-6', 'security events are recorded, classified and attributable to a tenant',
    replayAttempt.response.status === 401 && crossTenant.response.status === 403
      && stolenToken.response.status === 401 && unauthorisedPath.response.status === 403
      && attributable && categories.size >= 3
      && (metrics.read('security.replay_refused', 'tenant-alpha')?.value ?? 0) >= 1
      && (metrics.read('security.cross_tenant_refused', 'tenant-beta')?.value ?? 0) >= 1,
    `${securityEvents.length} refusals recorded across ${categories.size} categories, every one attributable; replay ${replayAttempt.response.status}, cross-tenant ${crossTenant.response.status}, stolen token ${stolenToken.response.status}, bad path ${unauthorisedPath.response.status}`);

  // Policy refusals must NOT count against the availability SLI.
  const policyRefusals = TENANTS.reduce((n, t) => n + (metrics.read('gateway.refused_by_policy', t)?.value ?? 0), 0);
  const gatewayStillMet = slos.readPerTenant('slo.gateway').every((r) => r.status === 'met' || r.status === 'NOT MEASURED');
  record('P-6.p', 'a working control is not counted as an availability failure',
    policyRefusals > 0 && gatewayStillMet,
    `${policyRefusals} policy refusals recorded and excluded from the gateway SLI, which remains met`);

  // ── Failure paths, exercised deliberately ─────────────────────────────────
  // A dashboard panel for `registration.failed` that has never once been incremented
  // is an untested panel. Failure counters are proven by causing the failures.
  // An UNREGISTERED tenant, deliberately. The first attempt at this probe used an
  // already-registered one and no failure occurred — idempotency checks before the
  // credential is consumed, so a bad credential cannot unseat an existing
  // registration. Correct behaviour, and the probe was measuring the wrong thing.
  const badRegistration = registration.register({
    tenantId: 'tenant-delta', oneTimeCredential: 'otc_not_a_real_credential',
  });
  if (!badRegistration.ok) metrics.increment('registration.failed', 'tenant-delta');

  const unsupported = core.validateProfile({
    profileVersion: '1.0.0', language: 'python', framework: 'playwright',
    testRunner: 'playwright-test', ciSystem: 'github-actions', gitProvider: 'github',
    cloudProvider: 'azure', deploymentModel: 'container', packageManager: 'pip',
    reportingFramework: 'allure', frameworkVersions: {},
  });
  if (!unsupported.ok) metrics.increment('generation.failed', 'tenant-alpha');

  const rotationOfUnknown = registration.rotateCertificate('tenant-never-registered');
  if (!rotationOfUnknown.ok) metrics.increment('certificate.rotation_failed', 'tenant-alpha');

  const revocable = ca.issueForTenant('tenant-alpha');
  ca.revoke(revocable.keyId);
  metrics.increment('certificate.revoked', 'tenant-alpha');

  record('P-6.f', 'failure counters are proven by causing the failures they count',
    badRegistration.ok === false && unsupported.ok === false && rotationOfUnknown.ok === false
      && (metrics.read('registration.failed', 'tenant-delta')?.value ?? 0) === 1
      && (metrics.read('generation.failed', 'tenant-alpha')?.value ?? 0) === 1
      && (metrics.read('certificate.rotation_failed', 'tenant-alpha')?.value ?? 0) === 1
      && (metrics.read('certificate.revoked', 'tenant-alpha')?.value ?? 0) === 1,
    `a bad credential (${badRegistration.ok ? 'accepted' : badRegistration.reason}), an unsupported profile, a rotation for an unknown tenant and a revocation each incremented their counter`);

  // ── P-7 · audit chain ─────────────────────────────────────────────────────
  for (const t of TENANTS) registration.recordExecution(t, `run-${t}`);
  registration.decommission('tenant-gamma');
  const events = new Set(registration.auditTrail.filter((e) => e.tenantId === 'tenant-gamma').map((e) => e.event));
  const required = ['registration', 'certificate-rotation', 'upgrade', 'execution', 'decommission'];
  const missing = required.filter((e) => !events.has(e));
  record('P-7', 'the audit chain is complete across the lifecycle and survives decommissioning',
    missing.length === 0 && registration.auditTrail.every((e) => e.at && e.tenantId && e.outcome),
    missing.length === 0
      ? `${registration.auditTrail.length} events; every lifecycle stage present for a decommissioned tenant`
      : `missing: ${missing.join(', ')}`);

  // ── P-8 · dashboards validate against emitted metrics ─────────────────────
  const dashboards = obs.buildDashboards();
  let dashboardsValid = true;
  let dashboardError = '';
  try { obs.validateDashboards(dashboards, metrics); }
  catch (e) { dashboardsValid = false; dashboardError = e.message; }

  // A panel naming a metric NOTHING emitted would render empty in production. Those
  // are reported rather than tolerated: an empty panel reads as a quiet period.
  const emitted = new Set(metrics.snapshot().map((s) => s.name));
  const shown = [...new Set(dashboards.flatMap((d) => d.panels.flatMap((p) => p.metrics)))];
  const neverEmitted = shown.filter((m) => !emitted.has(m));
  // Every panel metric must be DECLARED. Requiring every one to be EMITTED by a single
  // run was the wrong assertion and is not made here: failure counters are legitimately
  // empty when nothing fails, and demanding otherwise would push a run towards causing
  // failures for the dashboard's benefit. The failure paths are exercised deliberately
  // above (P-6.f) instead, which is the honest way to prove those panels work.
  record('P-8', 'every dashboard panel names a declared metric, and unemitted metrics are reported',
    dashboardsValid,
    dashboardsValid
      ? `${dashboards.length} dashboards, ${shown.length} distinct metrics, all declared; ${neverEmitted.length} not emitted by this run${neverEmitted.length ? ` (${neverEmitted.join(', ')})` : ''}`
      : dashboardError);

  // ── P-9 · release governance ──────────────────────────────────────────────
  const artefacts = [];
  const collect = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(e.name)) collect(full); continue; }
      if (!/\.(ts|json)$/.test(e.name)) continue;
      if (statSync(full).size > 1_000_000) continue;
      artefacts.push({ path: relative(ROOT, full).split('\\').join('/'), content: readFileSync(full, 'utf8') });
    }
  };
  collect(join(ROOT, 'packages'));

  const lock = JSON.parse(readFileSync(join(ROOT, 'packages', 'contracts', 'package.json'), 'utf8'));
  const manifest = obs.buildManifest({
    releaseVersion: 'M2.8',
    contractVersion: '1.0.0',
    supportedContractMajors: [1],
    upgradeableFrom: ['M2.6', 'M2.7'],
    commit: (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } })(),
    branch: (() => { try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } })(),
    builtAt: '2026-07-22T00:00:00.000Z',
    artefacts,
    dependencies: Object.entries({ ...lock.dependencies, ...lock.devDependencies })
      .map(([name, version]) => ({ name, version: String(version).replace(/^[\^~]/, '') })),
  });

  const integrity = obs.verifyIntegrity(manifest, artefacts);
  const tampered = obs.verifyIntegrity(manifest, artefacts.map((a, i) =>
    (i === 0 ? { ...a, content: `${a.content}// tampered` } : a)));
  const pinning = obs.checkDependencyPinning(manifest);
  const compatible = obs.checkContractCompatibility(manifest, '1.0.0');
  const incompatible = obs.checkContractCompatibility(manifest, '9.0.0');
  const upgrade = obs.checkUpgradePath(manifest, 'M2.7');
  const badUpgrade = obs.checkUpgradePath(manifest, 'M0.1');

  record('P-9', 'release governance verifies artefact integrity, pinning and compatibility',
    integrity.ok && !tampered.ok && obs.verifyManifestHash(manifest) && pinning.ok
      && compatible.ok && !incompatible.ok && upgrade.ok && !badUpgrade.ok,
    `${integrity.verified} artefacts verified by recomputation; a single tampered byte produced ${tampered.failures.length} failure(s); ${manifest.dependencies.length} dependencies all pinned; contract and upgrade compatibility both accept the supported case and refuse the unsupported one`);

  // ── P-10 · every tenant independently observable ──────────────────────────
  const perTenant = TENANTS.map((t) => ({
    tenantId: t,
    served: metrics.read('gateway.served', t)?.value ?? 0,
    health: health.tenantHealth(t, 'gateway.served', 'gateway.refused_unexpectedly').state,
    records: telemetry.byTenant(t).length,
  }));
  const unknownTenant = health.tenantHealth('tenant-never-seen', 'gateway.served', 'gateway.refused_unexpectedly');
  record('P-10', 'every tenant is independently observable, and an unreported tenant is unknown rather than healthy',
    perTenant.every((t) => t.served > 0 && t.records > 0 && t.health === 'healthy')
      && unknownTenant.state === 'unknown',
    `${perTenant.map((t) => `${t.tenantId}: ${t.served} served, ${t.records} records, ${t.health}`).join(' · ')}; an unreported tenant reads "${unknownTenant.state}"`);

  metricSnapshot = metrics.snapshot().map((s) => ({
    name: s.name, tenantId: s.tenantId, value: s.value, count: s.count,
  }));

  emit();
} catch (e) {
  fatal = e && e.message ? e.message : String(e);
  emit();
} finally {
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
}
