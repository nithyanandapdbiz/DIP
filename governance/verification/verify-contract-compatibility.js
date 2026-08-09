'use strict';
/**
 * GOVERNANCE — consumer contract compatibility.
 * ============================================================================
 * Runs the compatibility harness and gates on its evidence (C-20.12).
 *
 * The commercial promise that a customer's Execution Plane may run OLDER than the
 * Intelligence Plane (R-19.11) is worth exactly what the evidence behind it is
 * worth. Until this gate existed, Contract Compatibility reported NOT MEASURED —
 * correctly, because nothing measured it.
 *
 * The gate REGENERATES the evidence rather than reading a stored file (R-14.2).
 * Reading a committed evidence.json would gate on a historical claim, which is the
 * transcription failure in a new place: the file would say "compatible" long after
 * the build had stopped being so.
 *
 * Read-only with respect to the contract; it writes only harness evidence.
 *
 * Run:  node governance/verification/verify-contract-compatibility.js
 * Exit: 0 = compatibility evidenced   1 = a compatibility property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PKG = path.join(ROOT, 'packages', 'contracts');
const HARNESS = path.join(PKG, 'compat', 'harness.mjs');
const EVIDENCE = path.join(PKG, 'compat', 'evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

// Recorded before the harness runs. Evidence older than this is from a previous
// run, which means the harness crashed before writing — see the freshness check.
const gateStartedAt = Date.now();

line('');
line('GOVERNANCE — consumer contract compatibility');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
const built = fs.existsSync(path.join(PKG, 'dist', 'src', 'index.js'));
check('the contracts package is built', built,
  built ? 'dist present' : 'run `pnpm -C packages/contracts build` first');
check('the compatibility harness exists', fs.existsSync(HARNESS),
  fs.existsSync(HARNESS) ? 'compat/harness.mjs' : 'harness absent');

if (!built || !fs.existsSync(HARNESS)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — compatibility cannot be evidenced.');
  line('');
  process.exit(1);
}

// ── 2. Regenerate the evidence ──────────────────────────────────────────────
line('\n2. Harness execution');
const run = spawnSync(process.execPath, [HARNESS], { cwd: PKG, encoding: 'utf8' });
const ran = run.status !== null && !run.error;
check('the harness executed', ran, ran ? `exit ${run.status}` : String(run.error || 'no exit status'));
// A non-zero exit is a failure in its own right. Treating it as merely informative
// and then reading evidence.json is how a CRASHED harness left a passing gate: the
// harness aborted before writing, and the stale file still said 9/9.
check('the harness exited cleanly', run.status === 0,
  run.status === 0 ? 'exit 0' : `exit ${run.status} — harness reported failure or crashed`);

// ── 3. Evidence is present, fresh, and complete ─────────────────────────────
line('\n3. Evidence');
let ev = null;
try { ev = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')); } catch { ev = null; }
check('the harness emitted machine-readable evidence', ev !== null,
  ev ? `${ev.fixtureCount} fixture(s), ${ev.versionsCovered?.length ?? 0} version(s)` : 'absent or unparseable');

if (ev) {
  // Provenance (R-14.4). A claim detached from its origin cannot be reproduced.
  const required = ['evidenceId', 'generator', 'generatorVersion', 'executionContext',
    'repository', 'commit', 'adrReference', 'ruleReference', 'timestamp',
    'contentHash', 'verificationStatus', 'certificationStatus'];
  const missing = required.filter((k) => ev[k] === undefined || ev[k] === null);
  check('evidence carries complete provenance', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${required.length} provenance fields present`);

  // Freshness (R-14.5). Evidence regenerated this run must be seconds old; anything
  // older means the harness did not actually re-run and a stale file was read.
  // Evidence must post-date the start of THIS gate run. A tolerance window is not
  // good enough: a harness that crashes leaves the previous run's evidence in place,
  // and any window wide enough to allow clock skew is wide enough to accept it.
  const producedAt = Date.parse(ev.timestamp);
  const fresh = Number.isFinite(producedAt) && producedAt >= gateStartedAt - 2000;
  check('evidence was produced by this run, not left behind by a previous one', fresh,
    fresh ? `produced ${Math.max(0, Math.round((Date.now() - producedAt) / 1000))}s ago`
      : `evidence predates this run by ${Math.round((gateStartedAt - producedAt) / 1000)}s — the harness did not write`);

  // Every property, individually. A summary count could hide which failed.
  const failed = (ev.properties ?? []).filter((p) => !p.passed);
  check('every compatibility property holds', failed.length === 0,
    failed.length ? failed.map((p) => p.property).join('; ')
      : `${ev.summary?.passed ?? 0}/${ev.summary?.total ?? 0} properties`);

  check('the harness certified the result', ev.certificationStatus === 'certified',
    `verification=${ev.verificationStatus}, certification=${ev.certificationStatus}`);
}

// ── 4. The corpus is non-trivial ────────────────────────────────────────────
line('\n4. Corpus');
const fixtureDir = path.join(PKG, 'compat', 'fixtures');
let corpusSize = 0;
if (fs.existsSync(fixtureDir)) {
  for (const v of fs.readdirSync(fixtureDir)) {
    const d = path.join(fixtureDir, v);
    if (fs.statSync(d).isDirectory()) corpusSize += fs.readdirSync(d).filter((f) => f.endsWith('.json')).length;
  }
}
// A harness with an empty corpus passes vacuously — the failure mode that would make
// this gate green and meaningless.
check('the fixture corpus is non-empty', corpusSize > 0, `${corpusSize} frozen fixture(s)`);

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — consumer compatibility is evidence-backed.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
