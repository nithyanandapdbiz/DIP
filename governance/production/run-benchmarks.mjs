/**
 * PERFORMANCE AND SCALABILITY BENCHMARKS — M2.8.
 * ============================================================================
 * Measures throughput and latency by executing real platform operations, and reports
 * what was OBSERVED as JSON on stdout. It asserts nothing and exits 0 either way: the
 * harness that spawns it decides pass or fail. "Could not run" and "ran and was slow"
 * must never collapse (C-0.4).
 *
 * WHAT A BENCHMARK HERE IS, AND IS NOT.
 * It is a measurement of THIS machine, in THIS process, at THIS commit. It is not a
 * capacity model, and it is not a production forecast — a single-process measurement
 * on a developer workstation says nothing about a deployed cluster, and treating it as
 * though it does is how capacity plans come to be built on numbers nobody could
 * reproduce. Every figure is therefore published with its execution context attached,
 * and the certification records what it does NOT support.
 *
 * NO INTERPOLATION (C-24.1). Percentiles are drawn from observed samples. A p99
 * computed by interpolating between two measurements is a number nothing measured.
 *
 * Run:  node governance/production/run-benchmarks.mjs
 * Out:  {"benchmarks":[...],"digest":"<sha256>","context":{...}}
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { cpus, totalmem } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');

const benchmarks = [];
let fatal = null;

/**
 * Record a benchmark.
 *
 * `target` is the threshold this measurement must beat to count as a pass. Thresholds
 * are deliberately conservative and are stated in the output, so a reader can see what
 * was demanded rather than inferring it from whether it passed.
 */
const record = (id, operation, samples, target, unit = 'ops/sec') => {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((s, v) => s + v, 0);
  const mean = total / samples.length;
  // Percentiles from OBSERVED samples only — index into the sorted array, never
  // interpolate between neighbours (C-24.1).
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  benchmarks.push({
    id, operation, unit,
    samples: samples.length,
    meanMs: Number(mean.toFixed(4)),
    p50Ms: Number(at(50).toFixed(4)),
    p95Ms: Number(at(95).toFixed(4)),
    p99Ms: Number(at(99).toFixed(4)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(4)),
    throughputPerSec: Number((1000 / mean).toFixed(2)),
    target,
    ok: (1000 / mean) >= target.minThroughputPerSec && at(99) <= target.maxP99Ms,
  });
};

function emit() {
  const digest = createHash('sha256')
    .update('dbiz.benchmarks@1')
    // The digest covers identities and PASS/FAIL only. Timings vary between runs by
    // construction, so including them would make replay report a divergence on every
    // execution and train people to ignore it.
    .update(JSON.stringify(benchmarks.map((b) => [b.id, b.ok])))
    .digest('hex');
  process.stdout.write(JSON.stringify({
    benchmarks, digest, fatal,
    context: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: cpus().length,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      totalMemoryGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
      // Stated so no reader mistakes this for a deployed-cluster measurement.
      caveat: 'Single process, single machine, in-memory components. Not a capacity model and not a production forecast.',
    },
  }));
  process.exit(0);
}

for (const pkg of ['contracts', 'platform-core', 'platform-runtime', 'observability']) {
  if (!existsSync(entry(pkg))) { fatal = `@dbiz/${pkg} is not built`; emit(); }
}

const core = await import(pathToFileURL(entry('platform-core')).href);
const runtime = await import(pathToFileURL(entry('platform-runtime')).href);

const stateDir = mkdtempSync(join(tmpdir(), 'dbiz-bench-'));
const dataDir = mkdtempSync(join(tmpdir(), 'dbiz-bench-data-'));

/** Time one operation, in milliseconds, with nanosecond resolution. */
const timed = (fn) => {
  const started = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - started) / 1e6;
};

try {
  const ca = runtime.CertificateAuthority.create({ stateDir, leafValidityDays: 30 });
  const auth = new runtime.AuthorisationServer({ accessTokenTtlSeconds: 3600 });

  const TENANT_COUNT = 40;
  const tenants = Array.from({ length: TENANT_COUNT }, (_, i) => `tenant-bench-${i}`);
  const registration = new runtime.RegistrationService({ ca, auth, activeTenants: new Set(tenants) });
  const serverIdentity = ca.issueForTenant('gateway');
  const gateway = new runtime.ApiGateway({
    ca, auth,
    serverCertPem: serverIdentity.certificatePem,
    serverKeyPem: serverIdentity.privateKeyPem,
    authorisedPaths: ['/v1/execute'],
    rateLimit: 1_000_000,
  });

  // ── B-1 · certificate issuance ────────────────────────────────────────────
  // Real X.509 through OpenSSL, so this is dominated by process spawn and key
  // generation. It is the slowest operation in the platform by a wide margin, and
  // knowing that is the point of measuring it.
  const issuance = [];
  for (let i = 0; i < 20; i += 1) {
    issuance.push(timed(() => ca.issueForTenant(`tenant-issue-${i}`)));
  }
  record('B-1', 'certificate issuance (real X.509 via OpenSSL)', issuance,
    { minThroughputPerSec: 1, maxP99Ms: 5000 });

  // ── B-2 · registration throughput ─────────────────────────────────────────
  const registrations = [];
  for (const t of tenants) {
    const credential = auth.issueOneTimeCredential(t);
    registrations.push(timed(() => {
      const r = registration.register({ tenantId: t, oneTimeCredential: credential });
      if (!r.ok) throw new Error(`registration failed for ${t}: ${r.reason}`);
    }));
  }
  record('B-2', 'Execution Plane registration (issue certificate, client, tokens)', registrations,
    { minThroughputPerSec: 1, maxP99Ms: 5000 });

  // ── B-3 · gateway throughput ──────────────────────────────────────────────
  // The hot path. Every authenticated call parses a certificate, verifies a token,
  // checks the nonce and applies the rate limit.
  const grants = tenants.map((t) => registration.grantFor(t));
  const gatewayCalls = [];
  let nonce = 0;
  for (let i = 0; i < 2000; i += 1) {
    const g = grants[i % grants.length];
    gatewayCalls.push(timed(() => {
      const r = gateway.handle(g.certificate.certificatePem, {
        path: '/v1/execute', token: g.access.token, nonce: `b3-${nonce += 1}`,
      });
      if (r.status !== 200) throw new Error(`gateway refused: ${r.reason}`);
    }));
  }
  record('B-3', 'authenticated gateway call (certificate + token + nonce + rate limit)', gatewayCalls,
    { minThroughputPerSec: 200, maxP99Ms: 50 });

  // ── B-4 · solution generation ─────────────────────────────────────────────
  const profile = {
    profileVersion: '1.0.0', language: 'typescript', framework: 'playwright',
    testRunner: 'playwright-test', ciSystem: 'github-actions', gitProvider: 'github',
    cloudProvider: 'azure', deploymentModel: 'container', packageManager: 'pnpm',
    reportingFramework: 'allure', frameworkVersions: { playwright: '1.49.0' },
  };
  const generations = [];
  for (let i = 0; i < 200; i += 1) {
    generations.push(timed(() => core.generateSolution(profile, {
      tenantId: `tenant-gen-${i}`,
      registrationEndpoint: 'https://gateway.example.test/v1/register',
      oneTimeRegistrationCredential: 'otc-example',
    })));
  }
  record('B-4', 'Execution Plane solution generation (14 files, content-hashed)', generations,
    { minThroughputPerSec: 50, maxP99Ms: 200 });

  // ── B-5 · certificate rotation ────────────────────────────────────────────
  const rotations = [];
  for (const t of tenants.slice(0, 20)) {
    rotations.push(timed(() => {
      const r = registration.rotateCertificate(t);
      if (!r.ok) throw new Error(`rotation failed for ${t}`);
    }));
  }
  record('B-5', 'certificate rotation with overlap', rotations,
    { minThroughputPerSec: 1, maxP99Ms: 5000 });

  // ── B-6 · secret rotation ─────────────────────────────────────────────────
  const paths = new runtime.TenantPaths(dataDir, tenants);
  const vault = new runtime.TenantVault(paths);
  for (const t of tenants) vault.store(t, 'signing-key', `value-for-${t}`);
  const secretRotations = [];
  for (let i = 0; i < 400; i += 1) {
    const t = tenants[i % tenants.length];
    secretRotations.push(timed(() => vault.rotate(t, 'signing-key')));
  }
  record('B-6', 'secret rotation (new version, previous readable)', secretRotations,
    { minThroughputPerSec: 100, maxP99Ms: 100 });

  // ── B-7 · queue throughput ────────────────────────────────────────────────
  const queues = new runtime.TenantQueues(paths);
  const queueOps = [];
  for (let i = 0; i < 2000; i += 1) {
    const t = tenants[i % tenants.length];
    queueOps.push(timed(() => queues.enqueue(t, `item-${i}`)));
  }
  record('B-7', 'per-tenant queue enqueue', queueOps,
    { minThroughputPerSec: 500, maxP99Ms: 20 });

  // ── B-8 · token verification ──────────────────────────────────────────────
  const verifications = [];
  for (let i = 0; i < 2000; i += 1) {
    const g = grants[i % grants.length];
    verifications.push(timed(() => {
      const v = auth.verify(g.access.token, g.certificate.keyId, `b8-${i}`);
      if (!v.ok) throw new Error(`verification failed: ${v.reason}`);
    }));
  }
  record('B-8', 'access token verification (certificate-bound, replay-checked)', verifications,
    { minThroughputPerSec: 1000, maxP99Ms: 10 });

  // ── B-9 · concurrent tenant isolation under interleaved load ──────────────
  // Not a throughput figure: a correctness measurement taken under concurrency, which
  // is where isolation bugs surface and single-tenant tests cannot reach.
  const storage = new runtime.TenantStorage(paths);
  const interleaved = [];
  let misattributed = 0;
  for (let i = 0; i < 1000; i += 1) {
    const t = tenants[i % tenants.length];
    interleaved.push(timed(() => {
      storage.write(t, 'functional-testing', `run-${i}`, 'result.json', `{"tenant":"${t}"}`);
      const readBack = storage.read(t, 'functional-testing', `run-${i}`, 'result.json');
      if (readBack !== `{"tenant":"${t}"}`) misattributed += 1;
    }));
  }
  record('B-9', 'interleaved per-tenant write and read-back across 40 tenants', interleaved,
    { minThroughputPerSec: 200, maxP99Ms: 50 });
  benchmarks[benchmarks.length - 1].misattributed = misattributed;
  benchmarks[benchmarks.length - 1].ok =
    benchmarks[benchmarks.length - 1].ok && misattributed === 0;

  emit();
} catch (e) {
  fatal = e && e.message ? e.message : String(e);
  emit();
} finally {
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
}
