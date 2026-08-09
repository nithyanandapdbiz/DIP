/**
 * OPERATIONAL RUNTIME SCENARIO — M2.6.
 * ============================================================================
 * Drives @dbiz/platform-runtime end to end and reports what was OBSERVED, as JSON,
 * on stdout. It asserts nothing and exits 0 even when a step fails: the harness that
 * spawns it decides pass or fail. A scenario that exited non-zero on a failed step
 * would be indistinguishable from a scenario that could not run at all — and those
 * two outcomes must never collapse (C-0.4).
 *
 * Every step below uses real cryptography over a real TLS socket. Nothing is stubbed.
 *
 *   E-1   provision → generate → register → first authenticated call
 *   E-4   registration over mutual TLS, with unauthorised clients refused
 *   E-6   certificate rotation while the previous certificate keeps working
 *   E-7   reconnection on the rotated certificate
 *   E-8   concurrent tenants, with cross-tenant access refused at every layer
 *   E-9   secret rotation while execution continues
 *   E-10  audit trail across the whole tenant lifecycle
 *
 * Run:  node governance/operational/runtime-scenario.mjs
 * Out:  {"steps":[{"id","property","ok","detail"}...],"digest":"<sha256>"}
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect } from 'node:tls';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeEntry = join(ROOT, 'packages', 'platform-runtime', 'dist', 'src', 'index.js');
const coreEntry = join(ROOT, 'packages', 'platform-core', 'dist', 'src', 'index.js');

const steps = [];
const step = (id, property, ok, detail) => steps.push({ id, property, ok: Boolean(ok), detail });

function emit(fatal) {
  // The digest covers step identities and outcomes only — never timestamps, key ids,
  // ports or temp paths. Replay (E-12) compares outcomes, and an outcome that changed
  // because a port changed would be a false alarm that trains people to ignore it.
  const digest = createHash('sha256')
    .update('dbiz.runtime-scenario@1')
    .update(JSON.stringify(steps.map((s) => [s.id, s.ok])))
    .digest('hex');
  process.stdout.write(JSON.stringify({ steps, digest, fatal: fatal ?? null }));
  process.exit(0);
}

if (!existsSync(runtimeEntry) || !existsSync(coreEntry)) {
  emit('platform-runtime or platform-core is not built');
}

const {
  CertificateAuthority, AuthorisationServer, ApiGateway, RegistrationService,
  TenantPaths, TenantStorage, TenantVault, TenantQuotas,
} = await import(pathToFileURL(runtimeEntry).href);
const { generateSolution } = await import(pathToFileURL(coreEntry).href);

const TENANTS = ['tenant-alpha', 'tenant-beta'];
const stateDir = mkdtempSync(join(tmpdir(), 'dbiz-scenario-'));
const dataDir = mkdtempSync(join(tmpdir(), 'dbiz-scenario-data-'));
let listener = null;

try {
  const ca = CertificateAuthority.create({ stateDir, leafValidityDays: 1 });
  const auth = new AuthorisationServer({ accessTokenTtlSeconds: 300 });
  const registration = new RegistrationService({ ca, auth, activeTenants: new Set(TENANTS) });
  const serverIdentity = ca.issueForTenant('gateway');
  const gateway = new ApiGateway({
    ca, auth,
    serverCertPem: serverIdentity.certificatePem,
    serverKeyPem: serverIdentity.privateKeyPem,
    authorisedPaths: ['/v1/execute', '/v1/artefacts'],
    rateLimit: 500,
  });
  listener = await gateway.listen(0);

  const paths = new TenantPaths(dataDir, TENANTS);
  const storage = new TenantStorage(paths);
  const vault = new TenantVault(paths);
  const quotas = new TenantQuotas(1000);

  /** One real mutual-TLS call. Resolves to what the gateway served, or null. */
  const call = (cert, key, payload) => new Promise((resolve) => {
    const socket = connect({
      port: listener.port, host: '127.0.0.1', ca: [ca.rootCertificatePem],
      ...(cert && key ? { cert, key } : {}), servername: 'localhost', rejectUnauthorized: true,
    });
    let out = '';
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(v);
    };
    // Under TLS 1.3 a client the server will reject still sees its own handshake
    // succeed, then a bare close. "Was a response served?" is the only honest signal.
    const timer = setTimeout(() => done(null), 8000);
    socket.on('secureConnect', () => socket.write(`${JSON.stringify(payload)}\n`));
    socket.on('data', (d) => {
      out += d.toString('utf8');
      if (out.includes('\n')) { try { done(JSON.parse(out.trim())); } catch { done(null); } }
    });
    socket.on('error', () => done(null));
    socket.on('close', () => done(null));
  });

  let nonce = 0;
  const nextNonce = () => `n-${nonce += 1}`;

  // ── E-1 · provision → generate → register → first authenticated call ───────
  const alpha = 'tenant-alpha';
  registration.recordTenantCreated(alpha);
  const credential = auth.issueOneTimeCredential(alpha);

  const solution = generateSolution({
    profileVersion: '1.0.0', language: 'typescript', framework: 'playwright',
    testRunner: 'playwright-test', ciSystem: 'github-actions', gitProvider: 'github',
    cloudProvider: 'azure', deploymentModel: 'container', packageManager: 'pnpm',
    reportingFramework: 'allure', frameworkVersions: { playwright: '1.49.0' },
  }, {
    tenantId: alpha,
    registrationEndpoint: `https://127.0.0.1:${listener.port}/v1/register`,
    oneTimeRegistrationCredential: credential,
  });

  const onboarding = registration.register({ tenantId: alpha, oneTimeCredential: credential });
  const alphaGrant = onboarding.ok ? onboarding.grant : null;
  const firstCall = alphaGrant && await call(
    alphaGrant.certificate.certificatePem, alphaGrant.certificate.privateKeyPem,
    { path: '/v1/execute', token: alphaGrant.access.token, nonce: nextNonce(), body: { run: 'first' } },
  );
  registration.recordExecution(alpha, 'run-first');

  step('E-1', 'tenant provisioned, Execution Plane generated, registered, and served',
    onboarding.ok && solution.files.length > 0 && firstCall?.status === 200,
    onboarding.ok
      ? `${solution.files.length} files generated (sha256 ${solution.contentHash.value.slice(0, 16)}…), registered, first authenticated call ${firstCall?.status}`
      : `registration refused: ${onboarding.reason}`);

  // A spent registration credential must never register a second Execution Plane.
  const replayed = registration.register({ tenantId: alpha, oneTimeCredential: credential });
  step('E-1.r', 'a spent registration credential is idempotent, never a second registration',
    replayed.ok === true && replayed.idempotentReplay === true,
    replayed.ok ? `replay returned the existing grant (idempotent: ${replayed.idempotentReplay})` : `replay: ${replayed.reason}`);

  // ── E-4 · registration over mutual TLS, unauthorised clients refused ───────
  const noCert = await call(null, null, { path: '/v1/execute' });
  const rogueDir = mkdtempSync(join(tmpdir(), 'dbiz-scenario-rogue-'));
  let forgedServed = null;
  try {
    const rogue = CertificateAuthority.create({ stateDir: rogueDir });
    const forged = rogue.issueForTenant(alpha);
    forgedServed = await call(forged.certificatePem, forged.privateKeyPem,
      { path: '/v1/execute', token: alphaGrant.access.token, nonce: nextNonce() });
  } finally {
    rmSync(rogueDir, { recursive: true, force: true });
  }
  const noToken = await call(alphaGrant.certificate.certificatePem, alphaGrant.certificate.privateKeyPem,
    { path: '/v1/execute' });

  step('E-4', 'Execution Plane registers and is served only with a trusted certificate AND a token',
    firstCall?.status === 200 && noCert === null && forgedServed === null && noToken?.status === 401,
    `valid ${firstCall?.status} · no-certificate ${noCert === null ? 'not served' : 'SERVED'} · forged-CA ${forgedServed === null ? 'not served' : 'SERVED'} · no-token ${noToken?.status}`);

  // Replay of a previously used nonce must be refused (C-08.22).
  const fixedNonce = 'n-replay-probe';
  const firstUse = await call(alphaGrant.certificate.certificatePem, alphaGrant.certificate.privateKeyPem,
    { path: '/v1/execute', token: alphaGrant.access.token, nonce: fixedNonce });
  const replayUse = await call(alphaGrant.certificate.certificatePem, alphaGrant.certificate.privateKeyPem,
    { path: '/v1/execute', token: alphaGrant.access.token, nonce: fixedNonce });
  step('E-4.n', 'a replayed request nonce is refused', firstUse?.status === 200 && replayUse?.status === 401,
    `first ${firstUse?.status}, replay ${replayUse?.status} (${replayUse?.reason ?? '-'})`);

  // ── E-6 · rotation while the previous certificate keeps working ────────────
  const beforeRotation = registration.grantFor(alpha);
  const rotation = registration.rotateCertificate(alpha);
  const oldStillWorks = await call(
    beforeRotation.certificate.certificatePem, beforeRotation.certificate.privateKeyPem,
    { path: '/v1/execute', token: beforeRotation.access.token, nonce: nextNonce() },
  );
  step('E-6', 'certificates rotate with no downtime for the Execution Plane in place',
    rotation.ok && oldStillWorks?.status === 200,
    rotation.ok ? `rotated; the previous certificate still served ${oldStillWorks?.status} — no redeploy required`
      : `rotation refused: ${rotation.reason}`);

  // ── E-7 · reconnection on the rotated certificate ──────────────────────────
  const afterRotation = registration.grantFor(alpha);
  const reconnected = await call(
    afterRotation.certificate.certificatePem, afterRotation.certificate.privateKeyPem,
    { path: '/v1/execute', token: afterRotation.access.token, nonce: nextNonce() },
  );
  // Cutover completes: the old certificate is revoked and must stop being served.
  ca.revoke(beforeRotation.certificate.keyId);
  const revokedAfterCutover = await call(
    beforeRotation.certificate.certificatePem, beforeRotation.certificate.privateKeyPem,
    { path: '/v1/execute', token: beforeRotation.access.token, nonce: nextNonce() },
  );
  step('E-7', 'Execution Plane reconnects on the rotated certificate; the revoked one stops working',
    reconnected?.status === 200 && revokedAfterCutover?.status === 401,
    `reconnected ${reconnected?.status} · revoked certificate ${revokedAfterCutover?.status} (${revokedAfterCutover?.reason ?? '-'})`);

  // ── E-8 · concurrent tenants, no cross-tenant leakage ──────────────────────
  const beta = 'tenant-beta';
  registration.recordTenantCreated(beta);
  const betaCredential = auth.issueOneTimeCredential(beta);
  const betaOutcome = registration.register({ tenantId: beta, oneTimeCredential: betaCredential });
  const betaGrant = betaOutcome.ok ? betaOutcome.grant : null;

  // Genuinely concurrent: both tenants' calls are in flight at the same time.
  const interleaved = await Promise.all(Array.from({ length: 12 }, (_, i) => {
    const g = i % 2 === 0 ? registration.grantFor(alpha) : betaGrant;
    const expected = i % 2 === 0 ? alpha : beta;
    return call(g.certificate.certificatePem, g.certificate.privateKeyPem,
      { path: '/v1/execute', token: g.access.token, nonce: nextNonce(), body: { i } })
      .then((r) => ({ expected, got: r?.tenantId ?? null, status: r?.status ?? null }));
  }));
  const misattributed = interleaved.filter((r) => r.status !== 200 || r.got !== r.expected);

  // Physical isolation: each tenant writes, and neither can reach the other's data.
  for (const t of TENANTS) storage.write(t, 'functional-testing', 'run-1', 'result.json', `{"tenant":"${t}"}`);
  const alphaSees = storage.list(alpha).join(',');
  const betaSees = storage.list(beta).join(',');
  const pathEscape = (() => {
    try { paths.path(alpha, '../tenant-beta'); return 'ACCEPTED'; }
    catch (e) { return e.reason ?? 'rejected'; }
  })();

  // Credential theft: beta's certificate with alpha's token, and beta claiming alpha.
  const stolenToken = await call(betaGrant.certificate.certificatePem, betaGrant.certificate.privateKeyPem,
    { path: '/v1/execute', token: registration.grantFor(alpha).access.token, nonce: nextNonce() });
  const claimedTenant = await call(betaGrant.certificate.certificatePem, betaGrant.certificate.privateKeyPem,
    { path: '/v1/execute', token: betaGrant.access.token, nonce: nextNonce(), claimedTenantId: alpha });

  step('E-8', 'tenants execute concurrently with no cross-tenant leakage at any layer',
    misattributed.length === 0
      && !alphaSees.includes(beta) && !betaSees.includes(alpha)
      && pathEscape !== 'ACCEPTED'
      && stolenToken?.status === 401 && claimedTenant?.status === 403,
    `${interleaved.length} interleaved calls, ${misattributed.length} misattributed · path escape rejected as ${pathEscape} · stolen token ${stolenToken?.status} · claimed tenant ${claimedTenant?.status}`);

  step('E-8.q', 'per-tenant quotas are independent',
    (() => { for (let i = 0; i < 5; i += 1) quotas.consume(alpha, 100); return quotas.remaining(beta) === 1000; })(),
    `alpha consumed 500, beta remaining ${quotas.remaining(beta)}`);

  // ── E-9 · secret rotation while execution continues ────────────────────────
  const original = vault.store(alpha, 'execution-signing-key', 'secret-value-v1');
  const duringRotation = [];
  duringRotation.push(await call(
    registration.grantFor(alpha).certificate.certificatePem,
    registration.grantFor(alpha).certificate.privateKeyPem,
    { path: '/v1/execute', token: registration.grantFor(alpha).access.token, nonce: nextNonce() },
  ));
  const rotated = vault.rotate(alpha, 'execution-signing-key');
  // The in-flight generation must still resolve, or rotation is an outage (R-08.50).
  const previousStillReadable = vault.retrieveVersion(alpha, 'execution-signing-key', original.version);
  duringRotation.push(await call(
    registration.grantFor(alpha).certificate.certificatePem,
    registration.grantFor(alpha).certificate.privateKeyPem,
    { path: '/v1/execute', token: registration.grantFor(alpha).access.token, nonce: nextNonce() },
  ));
  const revokedOld = vault.revoke(alpha, 'execution-signing-key', original.version);
  const previousAfterRevoke = vault.retrieveVersion(alpha, 'execution-signing-key', original.version);
  const betaCannotRead = vault.retrieve(beta, 'execution-signing-key');

  step('E-9', 'secrets rotate with execution continuing, and the old version dies on revocation',
    rotated.version > original.version
      && previousStillReadable !== null && previousAfterRevoke === null && revokedOld
      && duringRotation.every((r) => r?.status === 200)
      && betaCannotRead === null,
    `v${original.version}→v${rotated.version} · previous readable during overlap, gone after revocation · ${duringRotation.length}/${duringRotation.length} calls served across the rotation · other tenant sees nothing`);

  // ── E-10 · audit trail across the whole lifecycle ──────────────────────────
  registration.recordUpgrade(alpha, 'technology-pack 1.1.0');
  registration.recordExecution(alpha, 'run-final');
  const decommissioned = registration.decommission(alpha);

  const lifecycle = ['tenant-creation', 'registration', 'certificate-rotation', 'execution', 'upgrade', 'decommission'];
  const recorded = new Set(registration.auditTrail.filter((e) => e.tenantId === alpha).map((e) => e.event));
  const missing = lifecycle.filter((e) => !recorded.has(e));
  const allowed = gateway.auditTrail.filter((e) => e.outcome === 'allowed').length;
  const denied = gateway.auditTrail.filter((e) => e.outcome === 'denied');
  const unexplainedDenials = denied.filter((e) => !e.reason).length;
  const wellFormed = registration.auditTrail.every((e) => e.at && !Number.isNaN(Date.parse(e.at)) && e.tenantId && e.outcome);

  step('E-10', 'the audit trail spans creation to decommission, and records refusals with reasons',
    missing.length === 0 && decommissioned && wellFormed
      && allowed > 0 && denied.length > 0 && unexplainedDenials === 0,
    `${registration.auditTrail.length} lifecycle events (${lifecycle.length - missing.length}/${lifecycle.length} stages) · gateway ${allowed} allowed, ${denied.length} denied, ${unexplainedDenials} without a reason`);

  step('E-10.d', 'a decommissioned tenant is no longer registered and its certificate is revoked',
    registration.isRegistered(alpha) === false
      && ca.isRevoked(afterRotation.certificate.keyId) === true,
    `registered: ${registration.isRegistered(alpha)} · certificate revoked: ${ca.isRevoked(afterRotation.certificate.keyId)}`);

  emit(null);
} catch (e) {
  emit(`${e && e.message ? e.message : String(e)}`);
} finally {
  if (listener) await listener.close();
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
}
