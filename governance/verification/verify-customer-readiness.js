'use strict';
/**
 * GOVERNANCE — customer readiness.
 * ============================================================================
 * Regenerates the customer readiness evidence and gates on it (M2.7).
 *
 * It REGENERATES rather than reads (R-14.2, R-25.22). Committed evidence would still
 * assert "every example validates" long after an example had stopped validating —
 * and a documentation set whose validation is stale is exactly the artefact R-25.1
 * exists to prevent.
 *
 * WHAT IS GATED: only what the harness proves by executing. Unmeasured properties are
 * reported and are NOT counted as failures — an unmeasured property contributes
 * nothing in either direction (R-13.3). Counting them as failures makes the gate
 * permanently red, and a permanently red gate is disabled within a week; counting them
 * as passes would be a lie.
 *
 * The gate also refuses to let the proven SET shrink, and refuses a published package
 * whose validation did not pass. A package on disk from a failed run is worse than no
 * package: it is indistinguishable from a good one to the customer holding it.
 *
 * Run:  node governance/verification/verify-customer-readiness.js
 * Exit: 0 = every proven property holds   1 = a proven property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS = path.join(ROOT, 'governance', 'customer-success', 'run-customer-evidence.js');
const EVIDENCE = path.join(ROOT, 'governance', 'customer-success', 'evidence.json');
const PACKAGE_DIR = path.join(ROOT, 'docs', 'customer-success-package');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

const gateStartedAt = Date.now();
line('');
line('GOVERNANCE — customer readiness');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
const REQUIRED_PACKAGES = ['contracts', 'platform-core', 'platform-runtime', 'customer-success'];
const unbuilt = REQUIRED_PACKAGES
  .filter((p) => !fs.existsSync(path.join(ROOT, 'packages', p, 'dist', 'src', 'index.js')));
check('every package the customer journey needs is built', unbuilt.length === 0,
  unbuilt.length ? `not built: ${unbuilt.join(', ')} — run \`pnpm -r build\`` : `${REQUIRED_PACKAGES.length} packages present`);
check('the customer readiness harness exists', fs.existsSync(HARNESS),
  fs.existsSync(HARNESS) ? 'governance/customer-success/run-customer-evidence.js' : 'absent');

if (unbuilt.length > 0 || !fs.existsSync(HARNESS)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — customer readiness cannot be evidenced.');
  line('');
  process.exit(1);
}

// ── 2. Regenerate ───────────────────────────────────────────────────────────
line('\n2. Harness execution');
const run = spawnSync(process.execPath, [HARNESS], { cwd: ROOT, encoding: 'utf8', timeout: 600_000 });
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
    failed.length ? failed.map((p) => `${p.id}: ${p.detail}`).join('; ')
      : `${ev.summary.provenPassed}/${ev.summary.provenTotal}`);

  // The proven SET must not shrink. A harness that quietly stopped exercising the
  // journey would report everything it did run as passing.
  const ids = new Set((ev.proven ?? []).map((p) => p.id));
  const expected = ['K-1', 'K-1.f', 'K-2', 'K-3', 'K-4', 'K-5', 'K-6', 'K-7', 'K-8', 'K-9', 'K-10', 'K-11'];
  const absent = expected.filter((id) => !ids.has(id));
  check('no proven property has been dropped from the harness', absent.length === 0,
    absent.length ? `missing: ${absent.join(', ')}` : `${expected.length} properties present`);

  // C-25.8 specifically. This is the criterion that caught five of six declared
  // supported targets emitting another language's sources, and it is the one most
  // likely to regress silently — a generator change touches every language at once.
  const targets = (ev.proven ?? []).find((p) => p.id === 'K-2');
  check('every declared supported target generates in its own language (C-25.8)',
    targets !== undefined && targets.passed === true,
    targets ? targets.detail : 'K-2 absent from the evidence set');

  // C-25.5 and C-25.6: the two "generated, not written" criteria.
  for (const [id, label] of [
    ['K-3', 'every documented example validates against the live schema (C-25.5)'],
    ['K-4', 'API documentation is generated from contract schemas (C-25.6)'],
    ['K-9', 'documentation carries no real credential, endpoint or identifier (C-25.9)'],
  ]) {
    const p = (ev.proven ?? []).find((x) => x.id === id);
    check(label, p !== undefined && p.passed === true, p ? p.detail : `${id} absent`);
  }

  const unexplained = (ev.unmeasured ?? []).filter((u) => !u.blocker || u.blocker.trim() === '');
  check('every unmeasured property names its blocker', unexplained.length === 0,
    unexplained.length ? unexplained.map((u) => u.id).join(', ')
      : `${(ev.unmeasured ?? []).length} blocked properties, each with a stated reason`);

  check('the certification status does not claim more than was measured',
    !((ev.unmeasured ?? []).length > 0 && ev.certificationStatus === 'certified'),
    `${ev.certificationStatus} with ${(ev.unmeasured ?? []).length} unmeasured`);
}

// ── 4. The published package ────────────────────────────────────────────────
line('\n4. The published package');
const published = fs.existsSync(PACKAGE_DIR);
check('a Customer Success Package is published', published,
  published ? 'docs/customer-success-package/' : 'absent — R-25.35 forbids publishing a release without one');

if (published && ev) {
  const manifestPath = path.join(PACKAGE_DIR, 'MANIFEST.json');
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { manifest = null; }
  check('the package carries a manifest with provenance', manifest !== null && Boolean(manifest.contentHash),
    manifest ? `content hash ${String(manifest.contentHash).slice(0, 16)}…` : 'absent or unparseable');

  // The package on disk must be the one this run validated. A package left from an
  // earlier release describes software nobody just checked.
  //
  // KNOWN WEAKNESS, recorded rather than hidden: on a PASSING run the harness has
  // already republished the package, so this comparison is self-healing and cannot
  // fail. It has real force only when publishing was skipped — which happens exactly
  // when the run failed, and the gate is already red for that reason. It is kept
  // because it makes a stale package impossible to ship, not because it is a strong
  // independent check, and calling it one would overstate what governance knows.
  check('the published package is the one this run produced',
    manifest !== null && ev.packageContentHash !== null
      && manifest.contentHash === ev.packageContentHash,
    manifest === null ? 'no manifest'
      : ev.packageContentHash === null
        ? 'this run published nothing, so the package on disk is from an earlier release'
        : manifest.contentHash === ev.packageContentHash
          ? 'hashes match'
          : 'the package on disk is NOT from this validation run');

  const count = countFiles(PACKAGE_DIR);
  check('the package contains what the evidence says it contains',
    ev.packageFileCount === null || count >= ev.packageFileCount,
    `${count} files on disk, evidence records ${ev.packageFileCount}`);

  // R-25.26: no real credentials, endpoints or identifiers — checked against what is
  // ON DISK, not against what the generator believed it wrote.
  const leaks = scanForSecrets(PACKAGE_DIR);
  check('no published file carries key material or a token literal', leaks.length === 0,
    leaks.length ? leaks.slice(0, 3).join('; ') : `${count} files scanned`);
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n += 1;
  }
  return n;
}

function scanForSecrets(dir) {
  const found = [];
  const patterns = [
    ['PEM private key', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
    ['AWS-style access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['JWT literal', /\beyJ[A-Za-z0-9_-]{20,}\./],
  ];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const body = fs.readFileSync(full, 'utf8');
      for (const [kind, re] of patterns) {
        if (re.test(body)) found.push(`${path.relative(PACKAGE_DIR, full)}: ${kind}`);
      }
    }
  };
  walk(dir);
  return found;
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  const n = ev && ev.unmeasured ? ev.unmeasured.length : 0;
  line(`RESULT: PASS — customer readiness is ${n === 0 ? 'FULLY' : 'PARTIALLY'} certified.`);
  line(n === 0
    ? 'Every customer readiness property is proven by execution. None was simulated.'
    : `${n} properties remain unmeasured, each with a named blocker. None was simulated.`);
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
