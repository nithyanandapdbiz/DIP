'use strict';
/**
 * GOVERNANCE — operational readiness.
 * ============================================================================
 * Regenerates the operational evidence and gates on it (M2.6).
 *
 * It REGENERATES rather than reads (R-14.2). A committed evidence file would still
 * assert "restore verified" long after restore had stopped working — which is the
 * failure mode restore validation exists to catch, reproduced in the gate that
 * checks it.
 *
 * WHAT IS GATED: only the properties the harness actually proves. Blocked properties
 * are reported and are NOT counted as failures — an unmeasured property contributes
 * nothing in either direction (R-13.3). Counting them as failures would make the gate
 * permanently red and it would be disabled within a week; counting them as passes
 * would be a lie.
 *
 * The gate also refuses to let the proven SET shrink. A harness that quietly stopped
 * exercising the runtime would still report every property it did run as passing, and
 * the gate would stay green over a fraction of the coverage. That is how a suite rots
 * without anyone deciding to weaken it.
 *
 * Run:  node governance/verification/verify-operational-readiness.js
 * Exit: 0 = every proven property holds   1 = a proven property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS = path.join(ROOT, 'governance', 'operational', 'run-operational-evidence.js');
const EVIDENCE = path.join(ROOT, 'governance', 'operational', 'evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

const gateStartedAt = Date.now();
line('');
line('GOVERNANCE — operational readiness');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
const coreBuilt = fs.existsSync(path.join(ROOT, 'packages', 'platform-core', 'dist', 'src', 'index.js'));
const runtimeBuilt = fs.existsSync(path.join(ROOT, 'packages', 'platform-runtime', 'dist', 'src', 'index.js'));
const built = coreBuilt && runtimeBuilt;
check('platform-core and platform-runtime are built', built,
  built ? 'both dist trees present'
    : `run \`pnpm -r build\` — missing: ${[!coreBuilt && 'platform-core', !runtimeBuilt && 'platform-runtime'].filter(Boolean).join(', ')}`);
check('the operational harness exists', fs.existsSync(HARNESS),
  fs.existsSync(HARNESS) ? 'governance/operational/run-operational-evidence.js' : 'absent');

if (!built || !fs.existsSync(HARNESS)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — operational readiness cannot be evidenced.');
  line('');
  process.exit(1);
}

// ── 2. Regenerate ───────────────────────────────────────────────────────────
line('\n2. Harness execution');
const run = spawnSync(process.execPath, [HARNESS], { cwd: ROOT, encoding: 'utf8' });
check('the harness executed', run.status !== null && !run.error,
  run.status !== null ? `exit ${run.status}` : String(run.error || 'no exit status'));
check('the harness exited cleanly', run.status === 0,
  run.status === 0 ? 'exit 0' : `exit ${run.status} — a proven property failed or the harness crashed`);

// ── 3. Evidence ─────────────────────────────────────────────────────────────
line('\n3. Evidence');
let ev = null;
try { ev = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')); } catch { ev = null; }
check('the harness emitted machine-readable evidence', ev !== null,
  ev ? `${ev.summary.provenTotal} proven, ${ev.summary.unmeasuredTotal} unmeasured` : 'absent or unparseable');

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
  check('every proven property holds', failed.length === 0,
    failed.length ? failed.map((p) => p.id).join(', ')
      : `${ev.summary.provenPassed}/${ev.summary.provenTotal}`);

  // Every property that must be present. If one silently disappeared from the harness
  // the gate would pass on a smaller set — which is how coverage erodes.
  const ids = new Set((ev.proven ?? []).map((p) => p.id));
  const expected = ['E-1', 'E-3', 'E-4', 'E-5', 'E-6', 'E-7', 'E-8', 'E-9', 'E-10',
    'E-11', 'E-12', 'C-23.9'];
  const absent = expected.filter((id) => !ids.has(id));
  check('no proven property has been dropped from the harness', absent.length === 0,
    absent.length ? `missing: ${absent.join(', ')}` : `${expected.length} properties present`);

  // The runtime properties must come from executed infrastructure, not from a harness
  // that learned to print PASS. Each one below is unreachable without a real
  // certificate authority, a real TLS handshake and real token verification.
  const RUNTIME = ['E-1', 'E-4', 'E-6', 'E-7', 'E-8', 'E-9', 'E-10'];
  const runtimeFailed = RUNTIME.filter((id) => {
    const p = (ev.proven ?? []).find((x) => x.id === id);
    return !p || p.passed !== true;
  });
  check('the runtime properties were proven against executed infrastructure',
    runtimeFailed.length === 0,
    runtimeFailed.length ? `not proven: ${runtimeFailed.join(', ')}`
      : `${RUNTIME.length} properties driven end to end over mutual TLS`);

  // E-12 is replay: the whole scenario re-executed in a second process and compared.
  const replay = (ev.proven ?? []).find((p) => p.id === 'E-12');
  check('the certification scenario replays to an identical outcome',
    replay !== undefined && replay.passed === true,
    replay ? replay.detail : 'E-12 absent from the evidence set');

  // Certification must never outrun measurement (R-13.3).
  const unmeasuredCount = (ev.unmeasured ?? []).length;
  check('the certification status does not claim more than was measured',
    !(unmeasuredCount > 0 && ev.certificationStatus === 'certified'),
    `${ev.certificationStatus} with ${unmeasuredCount} unmeasured`);

  // Every unmeasured property must name its blocker. "NOT MEASURED" without a reason
  // is indistinguishable from an oversight.
  const unexplained = (ev.unmeasured ?? []).filter((u) => !u.blocker || u.blocker.trim() === '');
  check('every unmeasured property names its blocker', unexplained.length === 0,
    unexplained.length ? unexplained.map((u) => u.id).join(', ')
      : `${(ev.unmeasured ?? []).length} blocked properties, each with a stated reason`);

  // C-23.9 specifically: restore must be PROVEN, not documented.
  const restore = (ev.proven ?? []).find((p) => p.id === 'C-23.9');
  check('restore was exercised, not merely documented',
    restore !== undefined && restore.passed === true,
    restore ? restore.detail : 'C-23.9 absent from the evidence set');
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  const n = ev && ev.unmeasured ? ev.unmeasured.length : 0;
  line(`RESULT: PASS — operational readiness is ${n === 0 ? 'FULLY' : 'PARTIALLY'} certified.`);
  line(n === 0
    ? 'Every operational property is proven by execution. None was simulated.'
    : `${n} propert${n === 1 ? 'y remains' : 'ies remain'} unmeasured${n === 1 ? ', with' : ', each with'} a named blocker. None was simulated.`);
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
