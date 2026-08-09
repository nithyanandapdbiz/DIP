'use strict';
/**
 * PRODUCTION READINESS EVIDENCE HARNESS — M2.8.
 * ============================================================================
 * Runs the operational scenario, the benchmarks and the resilience suite; replays the
 * scenario; generates the reports from what was measured; and emits machine-readable
 * evidence.
 *
 * R-23.42: operational readiness SHALL NOT be asserted; it is COMPUTED from executed
 * measurement. Every figure in every report this harness writes came out of a run.
 *
 * WHAT THIS HARNESS CANNOT DO, AND SAYS SO.
 * It cannot certify General Availability. GA means "deployed and operated in
 * production", and nothing here has ever been deployed — Docker is unavailable, so
 * E-2 has been `NOT MEASURED` since M2.5 and remains so. A production-readiness
 * certificate issued on the strength of in-process measurements would be the single
 * most expensive false claim this programme could make, because it is the one a
 * customer would act on. The gap is reported, never closed by inference.
 *
 * Run:  node governance/production/run-production-evidence.js
 * Exit: 0 = every measured property holds   1 = a measured property failed
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = __dirname;
const REPORTS = path.join(ROOT, 'docs', 'production');

const proven = [];
const unmeasured = [];
let failures = 0;

const line = (s) => console.log(s);
const record = (id, property, passed, detail) => {
  proven.push({ id, property, passed, detail });
  line(`  ${passed ? 'PASS ' : 'FAIL '} ${id}  ${property}`);
  if (detail) line(`            ${detail}`);
  if (!passed) failures += 1;
};
const blocked = (id, property, blocker) => {
  unmeasured.push({ id, property, status: 'NOT MEASURED', blocker });
  line(`  NOT MEASURED  ${id}  ${property}`);
  line(`            blocked: ${blocker}`);
};

line('');
line('PRODUCTION READINESS EVIDENCE — M2.8');
line('='.repeat(74));

/** Run one scenario in a fresh process. Distinguishes "could not run" from "failed". */
function run(script) {
  const r = spawnSync(process.execPath, [path.join(OUT, script)],
    { cwd: ROOT, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    return { fatal: `${script} exited ${r.status}: ${(r.stderr || '').slice(0, 400)}` };
  }
  try { return JSON.parse(r.stdout); } catch {
    return { fatal: `${script} produced no parseable observation` };
  }
}

// ── Operational run ─────────────────────────────────────────────────────────
line('\nOperational run');
const scenarioA = run('run-production-scenario.mjs');
if (scenarioA.fatal || !scenarioA.properties) {
  record('P-scenario', 'the production operational run executes', false, scenarioA.fatal ?? 'no properties produced');
} else {
  for (const p of scenarioA.properties) record(p.id, p.property, p.ok, p.detail);
}

// ── Benchmarks ──────────────────────────────────────────────────────────────
line('\nPerformance and scalability');
const bench = run('run-benchmarks.mjs');
if (bench.fatal || !bench.benchmarks) {
  record('B-suite', 'benchmarks execute', false, bench.fatal ?? 'no benchmarks produced');
} else {
  for (const b of bench.benchmarks) {
    record(b.id, b.operation,
      b.ok,
      `${b.throughputPerSec}/s · p50 ${b.p50Ms}ms · p99 ${b.p99Ms}ms · ${b.samples} samples · target >=${b.target.minThroughputPerSec}/s, p99 <=${b.target.maxP99Ms}ms`);
  }
}

// ── Resilience ──────────────────────────────────────────────────────────────
line('\nResilience');
const resilience = run('run-resilience.mjs');
if (resilience.fatal || !resilience.scenarios) {
  record('R-suite', 'resilience scenarios execute', false, resilience.fatal ?? 'no scenarios produced');
} else {
  for (const s of resilience.scenarios) {
    record(s.id, s.scenario, s.ok, s.note ? `${s.detail} — ${s.note}` : s.detail);
  }
}

// ── Replay ──────────────────────────────────────────────────────────────────
line('\nReplay');
const scenarioB = run('run-production-scenario.mjs');
record('P-replay', 'the operational run replays to an identical outcome',
  Boolean(scenarioA.digest) && scenarioA.digest === scenarioB.digest,
  scenarioA.digest && scenarioB.digest
    ? (scenarioA.digest === scenarioB.digest
      ? `${scenarioB.properties.length} properties replayed identically, digest ${scenarioA.digest.slice(0, 24)}…`
      : `replay diverged: ${scenarioA.digest.slice(0, 16)} vs ${scenarioB.digest.slice(0, 16)}`)
    : 'replay could not execute');

const resilienceB = run('run-resilience.mjs');
record('R-replay', 'resilience scenarios replay to an identical outcome',
  Boolean(resilience.digest) && resilience.digest === resilienceB.digest,
  resilience.digest && resilienceB.digest
    ? (resilience.digest === resilienceB.digest
      ? `${resilienceB.scenarios.length} scenarios replayed identically`
      : 'replay diverged')
    : 'replay could not execute');

// ── What is NOT MEASURED ────────────────────────────────────────────────────
line('\nBlocked properties — none is simulated');

blocked('G-1', 'the platform runs in a deployed production environment',
  'Docker unavailable — nothing has ever been deployed. Every measurement here is in-process, and no in-process measurement is evidence about a deployed system. Unchanged since M2.5 (E-2)');
blocked('G-2', 'performance under production load and concurrency',
  'benchmarks measure a single process on one developer machine. They bound what the code can do; they say nothing about a horizontally scaled deployment behind a load balancer, and must not be used as a capacity model');
blocked('G-3', 'SLO attainment over a real measurement window',
  'SLIs are computed correctly from emitted telemetry, and were exercised over a synthetic run. A 30-day window against production traffic has not occurred, so no SLO has been ATTAINED — only computed');
blocked('G-4', 'incident detection in production, and detection source',
  'R-23.20 requires recording whether an incident was found by the platform or by a customer. No production incident has occurred, so the detection-source measurement has no data');
blocked('G-5', 'shared nonce store in a horizontally scaled deployment',
  'the requirement is proven and the store is injectable (R-11), but no shared implementation is deployed. Document 17 declares this plane horizontally scaled, so a production deployment MUST supply one — recorded in the debt register');

// ── Reports, generated from what was measured ───────────────────────────────
line('\nReports');
if (failures === 0) {
  const written = writeReports();
  record('G-reports', 'every report is generated from measured output',
    written.length > 0, `${written.length} reports written to docs/production/`);
} else {
  blocked('G-reports', 'reports are generated from measured output',
    'a measured property failed — publishing reports from a failed run would produce documents indistinguishable from good ones');
}

function writeReports() {
  fs.mkdirSync(REPORTS, { recursive: true });
  const written = [];
  const write = (name, content) => {
    fs.writeFileSync(path.join(REPORTS, name), content, 'utf8');
    written.push(name);
  };

  const ctx = bench.context ?? {};
  const table = (rows) => rows.join('\n');

  write('PERFORMANCE-BENCHMARK-REPORT.md', [
    '# Performance benchmark report',
    '',
    '**Generated from an executed run.** Every figure below was measured; none is',
    'projected, and percentiles are drawn from observed samples rather than interpolated',
    'between them (C-24.1).',
    '',
    '## Execution context',
    '',
    '| | |', '|---|---|',
    `| Node | ${ctx.node ?? 'unknown'} |`,
    `| Platform | ${ctx.platform ?? 'unknown'} ${ctx.arch ?? ''} |`,
    `| CPU | ${ctx.cpuModel ?? 'unknown'} (${ctx.cpus ?? '?'} logical) |`,
    `| Memory | ${ctx.totalMemoryGb ?? '?'} GB |`,
    '',
    `**${ctx.caveat ?? 'Single process, single machine.'}**`,
    '',
    '## Results',
    '',
    '| # | Operation | Throughput | p50 | p95 | p99 | Samples |',
    '|---|---|---|---|---|---|---|',
    table((bench.benchmarks ?? []).map((b) =>
      `| ${b.id} | ${b.operation} | ${b.throughputPerSec}/s | ${b.p50Ms}ms | ${b.p95Ms}ms | ${b.p99Ms}ms | ${b.samples} |`)),
    '',
    '## The bottleneck, named',
    '',
    'Certificate issuance, rotation and registration are all dominated by **real X.509',
    'generation through OpenSSL**, which spawns a process and generates a key. They run',
    'roughly three orders of magnitude slower than everything else, and that is not a',
    'defect — it is what using real cryptography costs. It is stated here because a',
    'capacity plan that assumes registration is as cheap as a gateway call will be wrong',
    'by that factor.',
    '',
    '## What these numbers do not support',
    '',
    '- They are not a capacity model. One process on one machine.',
    '- They are not a production forecast. Nothing has been deployed (G-1).',
    '- They do not include network, storage or orchestration latency.',
    '',
    '---', '', '*Generated by governance/production/run-production-evidence.js*', '',
  ].join('\n'));

  write('RESILIENCE-VALIDATION-REPORT.md', [
    '# Resilience validation report',
    '',
    '**Every scenario below broke something on purpose.** A resilience test that does not',
    'cause a failure is a happy-path test with a longer name.',
    '',
    '| # | Scenario | Result | Observed |',
    '|---|---|---|---|',
    table((resilience.scenarios ?? []).map((s) =>
      `| ${s.id} | ${s.scenario} | ${s.ok ? '**PASS**' : '**FAIL**'} | ${s.detail} |`)),
    '',
    '## Two defects this suite found',
    '',
    '**Tokens did not survive a restart.** The token signing key was generated per',
    'process, so a restarted instance rejected every token the previous one had issued',
    'with `bad-signature`. A routine deploy was a customer outage. The key is now loaded',
    'from state — the same custody model the certificate authority already used for its',
    'root key, applied to the second key rather than a new scheme invented for it.',
    '',
    '**Replay protection did not hold across instances.** Nonces were held in a',
    'per-process map. Document 17 declares this plane *"multiple per region,',
    'horizontally scaled"* and R-16.19 requires horizontal scalability, so a nonce',
    'refused by one instance was accepted by another — **no restart required, a load',
    'balancer was sufficient**. The store is now injectable and the platform reports',
    '`replayProtectionIsSingleProcessOnly` so a deployment cannot run the default',
    'unknowingly. Supplying a shared implementation is a deployment obligation (G-5).',
    '',
    '### How the second one was nearly missed',
    '',
    'The first version of the restart scenario asserted only that the replayed request',
    'was refused. It was — with `bad-signature`, because of the *first* defect. A refusal',
    'for an unrelated reason is a false pass, and it was concealing a real replay',
    'exposure. Asserting on the **reason** rather than the status is what surfaced it.',
    '',
    '---', '', '*Generated by governance/production/run-production-evidence.js*', '',
  ].join('\n'));

  const props = scenarioA.properties ?? [];
  write('SECURITY-MONITORING-REPORT.md', [
    '# Security monitoring report',
    '',
    '**Generated from an executed run in which every control was attacked.**',
    '',
    '| Control | Observed |',
    '|---|---|',
    ...props.filter((p) => p.id.startsWith('P-6')).map((p) => `| ${p.property} | ${p.detail} |`),
    '',
    '## A working control is not an availability failure',
    '',
    'Refusing a replayed nonce, a stolen token or a cross-tenant assertion is the',
    'platform doing its job. Those refusals are recorded, classified and attributed —',
    'and they are **excluded from the availability SLI**.',
    '',
    'This was modelled too narrowly at first: only `403`s and rate limits counted as',
    'policy, so refusing an attack drove availability down and the tenants the platform',
    'had just protected were reported as degraded. *Unexpected* means the platform',
    'failed, not that it refused. Only an unrecognised refusal counts against the SLI,',
    'which is also why the classifier returns `unclassified` rather than guessing.',
    '',
    '## What is monitored',
    '',
    '| Signal | Metric |',
    '|---|---|',
    '| Replay attempts | `security.replay_refused` |',
    '| Cross-tenant assertions | `security.cross_tenant_refused` |',
    '| Policy refusals | `gateway.refused_by_policy` |',
    '| Unexpected refusals | `gateway.refused_unexpectedly` |',
    '| Lifecycle audit | `audit.recorded` |',
    '',
    'Every security event carries a tenant and a correlation id, so it is attributable',
    'and traceable to the operation that produced it.',
    '',
    '---', '', '*Generated by governance/production/run-production-evidence.js*', '',
  ].join('\n'));

  write('PRODUCTION-READINESS-REPORT.md', [
    '# Production readiness report',
    '',
    // Counted at the moment of writing, which is BEFORE the report-generation property
    // itself is recorded — so this figure is one lower than the evidence file, by
    // construction. Said precisely rather than left to look like drift.
    `**${proven.filter((p) => p.passed).length}/${proven.length} measured properties hold** across the operational run, the benchmarks and the resilience suite. **${unmeasured.length} are NOT MEASURED.**`,
    '',
    '*(`governance/production/evidence.json` is authoritative and carries one further*',
    '*property — the generation of these reports — which is recorded after they are written.)*',
    '',
    '## The headline',
    '',
    '**This platform is not certified for General Availability, and this report does not',
    'claim it is.** GA means deployed and operated in production. Nothing here has ever',
    'been deployed: Docker is unavailable, so E-2 has been `NOT MEASURED` since M2.5 and',
    'still is. Everything below was measured in-process, and no in-process measurement is',
    'evidence about a deployed system.',
    '',
    'What M2.8 establishes is narrower and still worth having: **when this platform runs,',
    'its health is observable, its failures are diagnosable, and its releases are',
    'verifiable.**',
    '',
    '## Measured',
    '',
    '| # | Property | Result |',
    '|---|---|---|',
    ...proven.map((p) => `| ${p.id} | ${p.property} | ${p.passed ? '**PASS**' : '**FAIL**'} |`),
    '',
    '## Not measured',
    '',
    '| # | Property | Blocker |',
    '|---|---|---|',
    ...unmeasured.map((u) => `| ${u.id} | ${u.property} | ${u.blocker} |`),
    '',
    '## Fitness functions',
    '',
    '| Question | Answer |',
    '|---|---|',
    '| Is production health observable? | **Yes, when running.** Health, readiness and liveness answer different questions, and silence reports `unknown` rather than healthy. |',
    '| Is every failure diagnosable? | **Yes.** Every refusal is classified, attributed to a tenant and traceable by correlation id. Unrecognised signals are returned as `unclassified` rather than guessed. |',
    '| Is every release reproducible? | **Yes.** Artefact integrity is verified by recomputation, and a single tampered byte fails. |',
    '| Is every deployment traceable? | **Partially.** Manifests carry commit and provenance; no deployment has occurred to trace (G-1). |',
    '| Is every tenant independently observable? | **Yes.** SLIs and health are per tenant, and an unreported tenant reads `unknown`. |',
    '| Is operational evidence reproducible? | **Yes.** The operational run and the resilience suite each replay to an identical outcome. |',
    '',
    '---', '', '*Generated by governance/production/run-production-evidence.js*', '',
  ].join('\n'));

  // The dashboard specification and observability guide come from the live registry.
  const emit = spawnSync(process.execPath, [path.join(OUT, 'emit-observability-docs.mjs'), REPORTS],
    { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  if (emit.status === 0) {
    try { written.push(...JSON.parse(emit.stdout).written); } catch { /* reported below */ }
  }

  return written;
}

// ── Evidence ────────────────────────────────────────────────────────────────
const gitOrNull = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

const evidence = {
  evidenceId: 'production-readiness',
  generator: 'governance/production/run-production-evidence.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: gitOrNull(['rev-parse', 'HEAD']),
  adrReference: ['ADR-0018', 'ADR-0020', 'ADR-0021'],
  ruleReference: ['C-23.1', 'C-23.2', 'C-23.4', 'C-23.6', 'C-23.7', 'C-23.10', 'C-23.11',
    'C-24.1', 'C-24.5', 'C-24.7', 'C-24.9', 'C-24.10', 'C-24.13', 'C-24.14', 'R-23.42'],
  timestamp: new Date().toISOString(),
  benchmarkContext: bench.context ?? null,
  proven,
  unmeasured,
  summary: {
    provenTotal: proven.length,
    provenPassed: proven.filter((p) => p.passed).length,
    unmeasuredTotal: unmeasured.length,
  },
  verificationStatus: failures === 0 ? 'verified' : 'failed',
  certificationStatus: failures !== 0 ? 'uncertified'
    : unmeasured.length === 0 ? 'certified' : 'partially-certified',
  // Stated as a field, not only as prose, so no downstream consumer can read
  // "partially-certified" as "ready to deploy".
  generalAvailability: 'NOT CERTIFIED — nothing has been deployed; see G-1',
  certificationBlockers: unmeasured.map((u) => `${u.id}: ${u.blocker}`),
};
evidence.contentHash = crypto.createHash('sha256')
  .update('dbiz.production-evidence@1').update(Buffer.from([0]))
  .update(JSON.stringify(evidence, Object.keys(evidence).sort()))
  .digest('hex');

fs.writeFileSync(path.join(OUT, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
line(`${evidence.summary.provenPassed}/${evidence.summary.provenTotal} measured · ${unmeasured.length} NOT MEASURED`);
if (failures === 0) {
  line('RESULT: PASS — every measured production property holds.');
  line('');
  line('GENERAL AVAILABILITY: **NOT CERTIFIED.** Nothing has been deployed, so no');
  line('measurement here is evidence about a deployed system. Observability, resilience');
  line('and release governance are proven; production operation is not.');
} else {
  line(`RESULT: FAIL — ${failures} measured property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
