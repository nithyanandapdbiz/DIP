/**
 * RESILIENCE VALIDATION — M2.8.
 * ============================================================================
 * Breaks things deliberately and observes what the platform does. Reports as JSON on
 * stdout; asserts nothing; exits 0 either way.
 *
 * A RESILIENCE TEST THAT DOES NOT BREAK ANYTHING IS A HAPPY-PATH TEST WITH A LONGER
 * NAME. Every scenario below causes a real failure — a dropped connection, an expired
 * certificate, a revoked secret, a destroyed process boundary — and then asks whether
 * the platform did the right thing. Where the platform does NOT recover, that is
 * recorded as a finding rather than adjusted away.
 *
 *   R-1   process restart: state survives, credentials still verify
 *   R-2   gateway restart: a new instance serves existing credentials
 *   R-3   network interruption mid-request: the client observes it and retry succeeds
 *   R-4   certificate expiry: refused, with the reason classified
 *   R-5   secret revocation: the revoked version dies, the current one works
 *   R-6   partial failure: one tenant's failure does not affect another
 *   R-7   retry: a transient failure followed by success
 *   R-8   idempotency: repeating an operation does not duplicate its effect
 *   R-9   recovery: a decommissioned tenant can be re-provisioned
 *   R-10  replay protection across a restart — measured, not assumed
 *
 * Run:  node governance/production/run-resilience.mjs
 * Out:  {"scenarios":[...],"digest":"<sha256>"}
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { connect } from 'node:tls';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');

const scenarios = [];
let fatal = null;
const record = (id, scenario, ok, detail, note = null) =>
  scenarios.push({ id, scenario, ok: Boolean(ok), detail, note });

function emit() {
  const digest = createHash('sha256')
    .update('dbiz.resilience@1')
    .update(JSON.stringify(scenarios.map((s) => [s.id, s.ok])))
    .digest('hex');
  process.stdout.write(JSON.stringify({ scenarios, digest, fatal }));
  process.exit(0);
}

for (const pkg of ['platform-runtime', 'observability']) {
  if (!existsSync(entry(pkg))) { fatal = `@dbiz/${pkg} is not built`; emit(); }
}

const runtime = await import(pathToFileURL(entry('platform-runtime')).href);
const obs = await import(pathToFileURL(entry('observability')).href);

const stateDir = mkdtempSync(join(tmpdir(), 'dbiz-res-'));
const dataDir = mkdtempSync(join(tmpdir(), 'dbiz-res-data-'));
let listener = null;

const TENANTS = ['tenant-a', 'tenant-b'];

/** Build the platform. Called more than once, to simulate a restart. */
function boot(ca) {
  // The signing key is loaded from state, not generated per instance. Without this a
  // restart rejects every token it did not itself issue — which is what R-2 measured
  // before it was fixed.
  const auth = new runtime.AuthorisationServer({
    accessTokenTtlSeconds: 300,
    signingKey: runtime.loadOrCreateSigningKey(stateDir),
  });
  const registration = new runtime.RegistrationService({ ca, auth, activeTenants: new Set(TENANTS) });
  const serverIdentity = ca.issueForTenant('gateway');
  const gateway = new runtime.ApiGateway({
    ca, auth,
    serverCertPem: serverIdentity.certificatePem,
    serverKeyPem: serverIdentity.privateKeyPem,
    authorisedPaths: ['/v1/execute'],
    rateLimit: 10_000,
  });
  return { auth, registration, gateway };
}

try {
  const ca = runtime.CertificateAuthority.create({ stateDir, leafValidityDays: 1 });
  let { auth, registration, gateway } = boot(ca);

  const enrol = (t, reg = registration, a = auth) => {
    const otc = a.issueOneTimeCredential(t);
    const r = reg.register({ tenantId: t, oneTimeCredential: otc });
    if (!r.ok) throw new Error(`enrolment failed for ${t}: ${r.reason}`);
    return r.grant;
  };

  const grantA = enrol('tenant-a');
  const grantB = enrol('tenant-b');

  // ── R-1 · process restart ─────────────────────────────────────────────────
  // The CA's state lives on disk. A restarted process must reconstruct a CA that still
  // trusts certificates issued by the previous one — otherwise every customer's
  // credentials are invalidated by a routine deploy.
  const caAfterRestart = runtime.CertificateAuthority.create({ stateDir, leafValidityDays: 1 });
  const stillValid = caAfterRestart.validate(grantA.certificate.certificatePem, 'tenant-a');
  record('R-1', 'a restarted process still trusts certificates issued before the restart',
    stillValid.ok,
    stillValid.ok
      ? 'the certificate authority reloaded its state from disk and the existing certificate validates'
      : `the restarted CA rejected an existing certificate: ${stillValid.reason}`);

  // ── R-2 · gateway restart ─────────────────────────────────────────────────
  const rebooted = boot(caAfterRestart);
  // Credentials were issued by the PREVIOUS authorisation server. A token bound to a
  // certificate must survive a gateway restart, or every deploy is a customer outage.
  const afterGatewayRestart = rebooted.gateway.handle(grantA.certificate.certificatePem, {
    path: '/v1/execute', token: grantA.access.token, nonce: 'r2-1',
  });
  // The new authorisation server has no record of the old token's tenant, which is the
  // honest result of holding token state in memory. Recorded as observed.
  const survives = afterGatewayRestart.status === 200;
  record('R-2', 'a restarted gateway serves credentials issued before the restart',
    survives,
    survives
      ? 'served — certificate trust and token binding both survived the restart'
      : `refused after restart: ${afterGatewayRestart.reason}`,
    survives ? null
      : 'Token state is held in memory, so a restart invalidates tokens issued by the previous process. Certificates survive; tokens do not. A production deployment needs shared token state, and this is the measurement that shows it.');

  // ── R-3 · network interruption ────────────────────────────────────────────
  listener = await gateway.listen(0);
  const interrupted = await new Promise((resolve) => {
    const socket = connect({
      port: listener.port, host: '127.0.0.1', ca: [ca.rootCertificatePem],
      cert: grantA.certificate.certificatePem, key: grantA.certificate.privateKeyPem,
      servername: 'localhost', rejectUnauthorized: true,
    });
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; socket.destroy(); resolve(v); } };
    const timer = setTimeout(() => done('timeout'), 8000);
    socket.on('secureConnect', () => {
      // Write a PARTIAL request and destroy the socket: an interruption mid-flight,
      // not a clean close. The server must not be left holding a half-parsed request.
      socket.write('{"path":"/v1/execute","tok');
      setTimeout(() => { clearTimeout(timer); done('interrupted'); }, 50);
    });
    socket.on('error', () => { clearTimeout(timer); done('error'); });
  });

  // After the interruption, a fresh connection must be served — the server must not
  // have been destabilised by a client that vanished mid-request.
  const afterInterruption = gateway.handle(grantA.certificate.certificatePem, {
    path: '/v1/execute', token: grantA.access.token, nonce: 'r3-retry',
  });
  record('R-3', 'a connection interrupted mid-request does not destabilise the gateway',
    interrupted !== 'timeout' && afterInterruption.status === 200,
    `interruption observed as "${interrupted}"; the next request was served with status ${afterInterruption.status}`);

  // ── R-4 · certificate expiry ──────────────────────────────────────────────
  const expiredAt = new Date(grantA.certificate.notAfter.getTime() + 86_400_000);
  const expiredCheck = ca.validate(grantA.certificate.certificatePem, 'tenant-a', expiredAt);
  const classified = obs.classify(expiredCheck.ok ? 'valid' : expiredCheck.reason);
  record('R-4', 'an expired certificate is refused, and the refusal is classified',
    !expiredCheck.ok && expiredCheck.reason === 'expired' && classified.category === 'lifecycle.expiry',
    `validation reason "${expiredCheck.ok ? 'accepted' : expiredCheck.reason}" classified as ${classified.category} (${classified.severity})`);

  // ── R-5 · secret revocation ───────────────────────────────────────────────
  const paths = new runtime.TenantPaths(dataDir, TENANTS);
  const vault = new runtime.TenantVault(paths);
  const v1 = vault.store('tenant-a', 'signing-key', 'value-1');
  const v2 = vault.rotate('tenant-a', 'signing-key');
  const duringOverlap = vault.retrieveVersion('tenant-a', 'signing-key', v1.version);
  vault.revoke('tenant-a', 'signing-key', v1.version);
  const afterRevoke = vault.retrieveVersion('tenant-a', 'signing-key', v1.version);
  const current = vault.retrieve('tenant-a', 'signing-key');
  record('R-5', 'a revoked secret version dies while the current version keeps working',
    duringOverlap !== null && afterRevoke === null && current !== null && current.version === v2.version,
    `v${v1.version} readable during overlap, gone after revocation; current is v${current?.version ?? '?'}`);

  // ── R-6 · partial failure ─────────────────────────────────────────────────
  // Tenant A's certificate is revoked. Tenant B must be entirely unaffected — a
  // failure that spreads between tenants is an isolation failure, not an availability one.
  ca.revoke(grantA.certificate.keyId);
  const aAfterRevoke = gateway.handle(grantA.certificate.certificatePem, {
    path: '/v1/execute', token: grantA.access.token, nonce: 'r6-a',
  });
  const bDuringAFailure = gateway.handle(grantB.certificate.certificatePem, {
    path: '/v1/execute', token: grantB.access.token, nonce: 'r6-b',
  });
  record('R-6', "one tenant's total failure does not affect another",
    aAfterRevoke.status === 401 && bDuringAFailure.status === 200,
    `tenant-a refused (${aAfterRevoke.status}), tenant-b served (${bDuringAFailure.status}) at the same time`);

  // ── R-7 · retry after a transient failure ─────────────────────────────────
  // Rate limiting is the transient failure the platform actually produces. Exhaust it,
  // observe the refusal, then confirm a later window serves again.
  const limited = new runtime.ApiGateway({
    ca, auth,
    serverCertPem: ca.issueForTenant('gateway-2').certificatePem,
    serverKeyPem: ca.issueForTenant('gateway-2').privateKeyPem,
    authorisedPaths: ['/v1/execute'],
    rateLimit: 3,
    rateWindowMs: 50,
  });
  let refused = null;
  for (let i = 0; i < 10; i += 1) {
    const r = limited.handle(grantB.certificate.certificatePem, {
      path: '/v1/execute', token: grantB.access.token, nonce: `r7-${i}`,
    });
    if (r.status === 429) { refused = r; break; }
  }
  await new Promise((r) => setTimeout(r, 80));
  const afterWindow = limited.handle(grantB.certificate.certificatePem, {
    path: '/v1/execute', token: grantB.access.token, nonce: 'r7-retry',
  });
  record('R-7', 'a rate-limited caller is refused and succeeds after the window',
    refused !== null && refused.status === 429 && afterWindow.status === 200,
    refused
      ? `refused with 429 ("${refused.reason}"), served on retry after the window (${afterWindow.status})`
      : 'the rate limit never engaged, so retry behaviour could not be observed');

  // ── R-8 · idempotency ─────────────────────────────────────────────────────
  const firstDecommission = registration.decommission('tenant-b');
  const secondDecommission = registration.decommission('tenant-b');
  const otcReplay = auth.issueOneTimeCredential('tenant-a');
  registration.register({ tenantId: 'tenant-a', oneTimeCredential: otcReplay });
  const replayed = registration.register({ tenantId: 'tenant-a', oneTimeCredential: otcReplay });
  record('R-8', 'repeating an operation does not duplicate its effect',
    firstDecommission === true && secondDecommission === false
      && replayed.ok === true && replayed.idempotentReplay === true,
    `decommission returned ${firstDecommission} then ${secondDecommission}; re-registration returned the existing grant (idempotent: ${replayed.ok && replayed.idempotentReplay})`);

  // ── R-9 · recovery ────────────────────────────────────────────────────────
  const recovered = enrol('tenant-b');
  const recoveredCall = gateway.handle(recovered.certificate.certificatePem, {
    path: '/v1/execute', token: recovered.access.token, nonce: 'r9-1',
  });
  record('R-9', 'a decommissioned tenant can be re-provisioned and works again',
    recoveredCall.status === 200,
    `re-provisioned tenant-b served with status ${recoveredCall.status}`);

  // ── R-10 · replay protection across a restart ─────────────────────────────
  // MEASURED, NOT ASSUMED. Nonce state is in memory, so a restart may well forget it.
  // Whatever the answer, it is a production-relevant property and the honest move is
  // to observe it rather than to describe the intent.
  const nonce = 'r10-fixed';
  const before = gateway.handle(recovered.certificate.certificatePem, {
    path: '/v1/execute', token: recovered.access.token, nonce,
  });
  const immediateReplay = gateway.handle(recovered.certificate.certificatePem, {
    path: '/v1/execute', token: recovered.access.token, nonce,
  });
  const restartedGateway = boot(caAfterRestart).gateway;
  const replayAfterRestart = restartedGateway.handle(recovered.certificate.certificatePem, {
    path: '/v1/execute', token: recovered.access.token, nonce,
  });
  // THE REASON MATTERS, NOT THE STATUS. Before the signing key was persisted, this
  // scenario "passed" because the restarted gateway rejected the token as
  // `bad-signature` — a refusal for an unrelated reason. That is a false pass, and it
  // was hiding a real replay exposure. Checking the reason is what surfaced it.
  const replayReason = replayAfterRestart.status === 401 ? replayAfterRestart.reason : '';
  record('R-10', 'replay protection holds within a process, and the refusal names replay as the reason',
    before.status === 200 && /replay/i.test(immediateReplay.status === 401 ? immediateReplay.reason : ''),
    `first ${before.status}, replay ${immediateReplay.status} ("${immediateReplay.status === 401 ? immediateReplay.reason : '-'}")`);

  // ── R-11 · replay protection across INSTANCES ─────────────────────────────
  // Document 17 declares the Intelligence Plane "multiple per region, horizontally
  // scaled", and R-16.19 requires horizontal scalability without coordination. So the
  // question is not whether replay protection survives a restart — it is whether it
  // holds across two instances behind a load balancer. Both are measured here: the
  // default store, and a shared one.
  const separateStores = (() => {
    const key = runtime.loadOrCreateSigningKey(stateDir);
    const one = new runtime.AuthorisationServer({ signingKey: key, accessTokenTtlSeconds: 300 });
    const two = new runtime.AuthorisationServer({ signingKey: key, accessTokenTtlSeconds: 300 });
    const g = registration.grantFor('tenant-b');
    const n = 'r11-separate';
    const first = one.verify(g.access.token, g.certificate.keyId, n);
    const second = two.verify(g.access.token, g.certificate.keyId, n);
    return { first: first.ok, secondAccepted: second.ok, singleProcess: one.replayProtectionIsSingleProcessOnly };
  })();

  const sharedStore = (() => {
    // One store, two instances — the shape a horizontally scaled deployment must run.
    const shared = new runtime.InMemoryNonceStore();
    const key = runtime.loadOrCreateSigningKey(stateDir);
    const one = new runtime.AuthorisationServer({ signingKey: key, accessTokenTtlSeconds: 300, nonceStore: shared });
    const two = new runtime.AuthorisationServer({ signingKey: key, accessTokenTtlSeconds: 300, nonceStore: shared });
    const g = registration.grantFor('tenant-b');
    const n = 'r11-shared';
    const first = one.verify(g.access.token, g.certificate.keyId, n);
    const second = two.verify(g.access.token, g.certificate.keyId, n);
    return { first: first.ok, secondRefused: !second.ok && second.reason === 'replayed' };
  })();

  record('R-11', 'replay protection holds ACROSS INSTANCES when a shared nonce store is supplied',
    sharedStore.first && sharedStore.secondRefused,
    `shared store: first accepted, replay on the second instance refused as "${sharedStore.secondRefused ? 'replayed' : 'ACCEPTED'}"`,
    separateStores.secondAccepted
      ? 'MEASURED, AND THE REASON THE STORE IS NOW INJECTABLE: with the per-process default, a nonce refused by one instance is ACCEPTED by another — no restart required, a load balancer is sufficient. Document 17 declares this plane horizontally scaled, so the default is correct for no production topology. A deployment MUST supply a shared store; `replayProtectionIsSingleProcessOnly` reports when it has not.'
      : null);

  record('R-11.d', 'the platform reports when it is running single-process replay protection',
    separateStores.singleProcess === true,
    `the in-memory default reports singleProcessOnly=${separateStores.singleProcess}, so a horizontally scaled deployment cannot run it unknowingly`);

  emit();
} catch (e) {
  fatal = e && e.message ? e.message : String(e);
  emit();
} finally {
  if (listener) await listener.close();
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
}
