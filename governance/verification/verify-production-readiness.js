'use strict';
/**
 * GOVERNANCE — production readiness.
 * ============================================================================
 * Regenerates the production readiness evidence and gates on it (M2.8).
 *
 * It REGENERATES rather than reads (R-14.2, R-23.22). Committed evidence would still
 * assert "silence is not reported as health" long after that had stopped being true,
 * and a monitoring claim that has itself gone stale is the exact failure the
 * monitoring exists to prevent, one level up.
 *
 * WHAT THIS GATE WILL NOT DO.
 * It will not report the platform as ready for General Availability. Nothing has been
 * deployed; every measurement is in-process. The gate therefore checks that the
 * evidence continues to SAY so — a `certificationStatus` that quietly became
 * `certified`, or a `generalAvailability` field that stopped naming its blocker, is
 * itself a gate failure. The most likely way this platform ships a false claim is not
 * a broken measurement; it is a passing measurement that gets rounded up in a summary.
 *
 * Run:  node governance/verification/verify-production-readiness.js
 * Exit: 0 = every measured property holds   1 = a measured property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS = path.join(ROOT, 'governance', 'production', 'run-production-evidence.js');
const EVIDENCE = path.join(ROOT, 'governance', 'production', 'evidence.json');
const REPORTS = path.join(ROOT, 'docs', 'production');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

const gateStartedAt = Date.now();
line('');
line('GOVERNANCE — production readiness');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
const REQUIRED = ['contracts', 'platform-core', 'platform-runtime', 'observability'];
const unbuilt = REQUIRED.filter((p) => !fs.existsSync(path.join(ROOT, 'packages', p, 'dist', 'src', 'index.js')));
check('every package the production run needs is built', unbuilt.length === 0,
  unbuilt.length ? `not built: ${unbuilt.join(', ')}` : `${REQUIRED.length} packages present`);
check('the production evidence harness exists', fs.existsSync(HARNESS),
  fs.existsSync(HARNESS) ? 'governance/production/run-production-evidence.js' : 'absent');

if (unbuilt.length > 0 || !fs.existsSync(HARNESS)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — production readiness cannot be evidenced.');
  line('');
  process.exit(1);
}

// ── 2. Regenerate ───────────────────────────────────────────────────────────
line('\n2. Harness execution');
const run = spawnSync(process.execPath, [HARNESS],
  { cwd: ROOT, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 64 * 1024 * 1024 });
check('the harness executed', run.status !== null && !run.error,
  run.status !== null ? `exit ${run.status}` : String(run.error || 'no exit status'));
check('the harness exited cleanly', run.status === 0,
  run.status === 0 ? 'exit 0' : `exit ${run.status} — a measured property failed or the harness crashed`);

// ── 3. Evidence ─────────────────────────────────────────────────────────────
line('\n3. Evidence');
let ev = null;
try { ev = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')); } catch { ev = null; }
check('the harness emitted machine-readable evidence', ev !== null,
  ev ? `${ev.summary.provenTotal} measured, ${ev.summary.unmeasuredTotal} unmeasured` : 'absent or unparseable');

if (ev) {
  const producedAt = Date.parse(ev.timestamp);
  check('evidence was produced by this run, not left behind',
    Number.isFinite(producedAt) && producedAt >= gateStartedAt - 2000,
    Number.isFinite(producedAt)
      ? `produced ${Math.max(0, Math.round((Date.now() - producedAt) / 1000))}s ago`
      : 'no timestamp');

  const required = ['evidenceId', 'generator', 'generatorVersion', 'executionContext',
    'repository', 'commit', 'adrReference', 'ruleReference', 'timestamp', 'contentHash'];
  const missing = required.filter((k) => ev[k] === undefined || ev[k] === null);
  check('evidence carries complete provenance', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${required.length} provenance fields`);

  const failed = (ev.proven ?? []).filter((p) => !p.passed);
  check('every measured property holds', failed.length === 0,
    failed.length ? failed.map((p) => `${p.id}: ${p.detail}`).join('; ')
      : `${ev.summary.provenPassed}/${ev.summary.provenTotal}`);

  // The measured SET must not shrink. A harness that quietly stopped exercising
  // observability would report everything it did run as passing.
  const ids = new Set((ev.proven ?? []).map((p) => p.id));
  const expected = [
    'P-1', 'P-2', 'P-3', 'P-4', 'P-5', 'P-6', 'P-7', 'P-8', 'P-9', 'P-10', 'P-replay',
    'B-1', 'B-3', 'B-4', 'B-8',
    'R-1', 'R-2', 'R-6', 'R-8', 'R-10', 'R-11', 'R-replay',
  ];
  const absent = expected.filter((id) => !ids.has(id));
  check('no measured property has been dropped from the harness', absent.length === 0,
    absent.length ? `missing: ${absent.join(', ')}` : `${expected.length} anchor properties present`);

  // The properties most likely to regress silently, named individually.
  for (const [id, label] of [
    ['P-3', 'telemetry refuses customer content (C-23.11)'],
    ['P-4', 'silence is reported as unknown, never as health (C-24.7)'],
    ['P-5', 'an SLI without telemetry reports NOT MEASURED (C-23.4)'],
    ['P-6', 'security events are recorded, classified and attributable'],
    ['P-9', 'artefact integrity is verified by recomputation'],
    ['P-10', 'every tenant is independently observable (R-23.14)'],
    ['R-11', 'replay protection holds across instances with a shared store'],
  ]) {
    const p = (ev.proven ?? []).find((x) => x.id === id);
    check(label, p !== undefined && p.passed === true, p ? p.detail.slice(0, 160) : `${id} absent`);
  }

  const unexplained = (ev.unmeasured ?? []).filter((u) => !u.blocker || u.blocker.trim() === '');
  check('every unmeasured property names its blocker', unexplained.length === 0,
    unexplained.length ? unexplained.map((u) => u.id).join(', ')
      : `${(ev.unmeasured ?? []).length} blocked properties, each with a stated reason`);

  // ── The claim itself is gated ─────────────────────────────────────────────
  // A passing measurement that gets rounded up in a summary is the most likely route
  // to a false claim, so the summary is checked as carefully as the measurement.
  check('the certification status does not claim more than was measured',
    !((ev.unmeasured ?? []).length > 0 && ev.certificationStatus === 'certified'),
    `${ev.certificationStatus} with ${(ev.unmeasured ?? []).length} unmeasured`);

  check('General Availability is explicitly NOT certified while nothing is deployed',
    typeof ev.generalAvailability === 'string' && /NOT CERTIFIED/i.test(ev.generalAvailability),
    ev.generalAvailability ?? 'the field is absent — the evidence no longer states the limit of its own claim');

  const deploymentBlocker = (ev.unmeasured ?? []).find((u) => u.id === 'G-1');
  check('the deployment gap is still reported, not quietly closed',
    deploymentBlocker !== undefined,
    deploymentBlocker ? deploymentBlocker.blocker.slice(0, 140) : 'G-1 is gone — deployment must not become measured without a deployment');
}

// ── 4. Reports ──────────────────────────────────────────────────────────────
line('\n4. Generated reports');
const EXPECTED_REPORTS = [
  'PRODUCTION-READINESS-REPORT.md',
  'PERFORMANCE-BENCHMARK-REPORT.md',
  'RESILIENCE-VALIDATION-REPORT.md',
  'SECURITY-MONITORING-REPORT.md',
  'OBSERVABILITY-GUIDE.md',
  'PLATFORM-INTELLIGENCE-GUIDE.md',
  'OPERATIONAL-DASHBOARD-SPECIFICATION.md',
];
const missingReports = EXPECTED_REPORTS.filter((r) => !fs.existsSync(path.join(REPORTS, r)));
check('every report was generated', missingReports.length === 0,
  missingReports.length ? `missing: ${missingReports.join(', ')}` : `${EXPECTED_REPORTS.length} reports present`);

if (missingReports.length === 0) {
  // A report claiming GA would be the most damaging document this repository could
  // contain, so it is checked on disk rather than trusted from the generator.
  const readiness = fs.readFileSync(path.join(REPORTS, 'PRODUCTION-READINESS-REPORT.md'), 'utf8');
  check('the readiness report states that GA is not certified',
    /not certified for General Availability/i.test(readiness),
    'the report names the limit of its own claim');

  const leaks = [];
  for (const r of EXPECTED_REPORTS) {
    const body = fs.readFileSync(path.join(REPORTS, r), 'utf8');
    if (/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(body)) leaks.push(`${r}: private key`);
    if (/\beyJ[A-Za-z0-9_-]{20,}\./.test(body)) leaks.push(`${r}: token literal`);
  }
  check('no generated report carries key or token material', leaks.length === 0,
    leaks.length ? leaks.join('; ') : `${EXPECTED_REPORTS.length} reports scanned`);
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  const n = ev && ev.unmeasured ? ev.unmeasured.length : 0;
  line('RESULT: PASS — every measured production property holds.');
  line(`Production readiness is PARTIALLY certified: ${n} properties remain unmeasured.`);
  line('General Availability is NOT certified — nothing has been deployed.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
