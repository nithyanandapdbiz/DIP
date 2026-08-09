#!/usr/bin/env node
'use strict';
/**
 * SUITE INTEGRITY — a test that does not RUN must not look like a test that does not FAIL.
 * ============================================================================
 * TRACEABILITY
 *   Debt   : TECHNICAL_DEBT.md D-068 (this gate's whole subject) · D-008 (the class it extends)
 *   ADR    : ADR-0076 §6 (built between phases B2 and A1, deliberately before the largest change)
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN IMAGINED.
 * Two readings of the same workspace suite, minutes apart, during ADR-0076 phase B1:
 *
 *     functional-testing-engine   409 tests   fail 0   EXIT 0
 *     functional-testing-engine   413 tests   fail 0   EXIT 0
 *
 * The four were not failing. They were NOT RUNNING — the `dist` had been built before a
 * framework change propagated. **Both readings are green by every signal the platform
 * reads**: exit code, failure count, and the summary lines this programme quotes as evidence.
 * Only a total separates them, and nothing read the total.
 *
 * IT IS D-008's CLASS WITH A MECHANISM D-008 DOES NOT COVER. D-008 says a control never seen
 * to fail is indistinguishable from one that cannot, and its remedy is fault injection —
 * plant a violation, watch the control fire. **That remedy assumes the control RUNS.** A
 * probe that was never loaded cannot be fault-injected; it renders as success everywhere.
 *
 * WHAT IT CHECKS, AND WHY TWO CHECKS RATHER THAN ONE.
 *   1. DIST PARITY — every compiled suite is present and no smaller than its source.
 *      This is D-068's ACTUAL mechanism, and it needs no baseline: the source IS the
 *      expectation, so the check cannot itself go stale.
 *   2. BASELINE DROP — declared test counts per package against a committed baseline,
 *      failing only on a DROP. This catches what parity cannot: tests removed from source.
 *
 * IT CHECKS A DROP, NEVER A HARD-CODED EXPECTED COUNT. A rise is reported and passes — the
 * baseline is then re-cut deliberately with `--relock`. A pinned expected total is the stale
 * literal this register keeps finding, and ADR-0076 phase B1 had just replaced two of them.
 *
 * A RELOCK THAT ERASES ITS OWN REASON IS AN OVERRIDE. Added at the first real drop this gate
 * ever caught — ADR-0061 §6 step 6, functional-testing-engine 518 -> 300. Relock previously
 * rewrote the baseline with the totals and nothing else, so the number moved and the reason for
 * moving it lived only in a commit message. That is indistinguishable, on the next read, from a
 * baseline nobody ever questioned: the gate would have reported PASS at 300 with no record that
 * 218 tests were deliberately removed or which files carried them.
 *
 * So a DROP now requires `--reason "..."`, and every reduction is appended to a `reductions`
 * ledger the relock CARRIES FORWARD rather than overwrites. The pass/fail logic is unchanged —
 * any drop still fails — this only makes the explanation outlive the relock that accepts it.
 *
 * Run:    node governance/verification/verify-suite-integrity.js
 * Relock: node governance/verification/verify-suite-integrity.js --relock [--reason "why"]
 * Exit:   0 = no suite shrank   1 = a suite shrank, or a compiled suite is missing,
 *         or a relock would drop a count without a stated reason
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');
const BASELINE = path.join(__dirname, 'suite-totals.json');
const RELOCK = process.argv.includes('--relock');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures += 1;
};

/**
 * Count test declarations in a file.
 *
 * Counts `test(` and `it(` at a call position. Deliberately NOT a parser: this compares a
 * file against ITSELF COMPILED and against its own prior count, so a consistent
 * approximation is sufficient and a miscount cancels on both sides. What it must never do
 * is silently return 0 for a file it failed to understand — an unreadable file is a hard
 * failure below, not a zero.
 */
function countTests(file) {
  const body = fs.readFileSync(file, 'utf8');
  const matches = body.match(/(?<![A-Za-z0-9_$.])(?:test|it)\s*\(/g);
  return matches ? matches.length : 0;
}

const listing = (dir, suffix) => (fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith(suffix)).sort()
  : []);

/** Everything a package's `test` script would execute, from source and from the built tree. */
function surveyPackage(pkg) {
  const dir = path.join(PACKAGES, pkg);
  const srcTs = listing(path.join(dir, 'test'), '.test.ts');
  const srcMjs = listing(path.join(dir, 'test'), '.test.mjs');
  const distJs = listing(path.join(dir, 'dist', 'test'), '.test.js');

  const sum = (files, base, ext) => files.reduce(
    (n, f) => n + countTests(path.join(base, ext ? f.replace(/\.ts$/, '.js') : f)), 0);

  return {
    pkg,
    srcFiles: srcTs.length + srcMjs.length,
    distFiles: distJs.length,
    // `.mjs` suites are run from source directly, so they belong to both sides.
    srcTests: sum(srcTs, path.join(dir, 'test')) + sum(srcMjs, path.join(dir, 'test')),
    distTests: sum(distJs, path.join(dir, 'dist', 'test'))
      + sum(srcMjs, path.join(dir, 'test')),
    compiled: srcTs.map((f) => f.replace(/\.ts$/, '.js')),
    distJs,
  };
}

const packages = fs.readdirSync(PACKAGES)
  .filter((p) => fs.existsSync(path.join(PACKAGES, p, 'test')))
  .sort();

const survey = packages.map(surveyPackage);

line('');
line('GOVERNANCE — suite integrity: a test that does not run is not a test that does not fail');
line('='.repeat(74));

// ── 1. Every source suite has a compiled counterpart ────────────────────────
line('\n1. Compiled suites are present');
const uncompiled = survey.flatMap((s) =>
  s.compiled.filter((f) => !s.distJs.includes(f)).map((f) => `${s.pkg}/dist/test/${f}`));
check('every source test file has a compiled counterpart', uncompiled.length === 0,
  uncompiled.join('; ')
  || `${survey.reduce((n, s) => n + s.srcFiles, 0)} suite file(s) across ${survey.length} package(s)`);

// ── 2. No compiled suite is smaller than its source ─────────────────────────
line('\n2. The built tree is not behind its source');
// THE DIRECT DETECTOR FOR D-068. A stale `dist` compiles fewer tests than source declares,
// and every downstream signal — exit code, failure count — stays green while it does.
const behind = survey
  .filter((s) => s.distTests < s.srcTests)
  .map((s) => `${s.pkg}: source declares ${s.srcTests}, built tree carries ${s.distTests}`);
check('no compiled suite declares fewer tests than its source', behind.length === 0,
  behind.join('; ') || 'the built tree matches source in every package');

// ── 3. No suite has shrunk against the baseline ─────────────────────────────
line('\n3. No suite has shrunk');
const current = Object.fromEntries(survey.map((s) => [s.pkg, s.srcTests]));

if (RELOCK) {
  const prior = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const priorTotals = prior.totals ?? {};
  const falls = Object.entries(priorTotals)
    .filter(([pkg, was]) => (current[pkg] ?? 0) < was)
    .map(([pkg, was]) => ({ package: pkg, from: was, to: current[pkg] ?? 0, removed: was - (current[pkg] ?? 0) }));

  // A relock that LOWERS a count must say why. A relock that raises or holds one need not:
  // a rise is self-explanatory and this gate has never treated it as an event.
  const reasonAt = process.argv.indexOf('--reason');
  const reason = reasonAt !== -1 ? process.argv[reasonAt + 1] : null;
  if (falls.length > 0 && !reason) {
    check('a relock that lowers a declared count states why', false,
      `${falls.map((f) => `${f.package}: ${f.from} -> ${f.to}`).join('; ')} — re-run with --reason "..."; `
      + 'a baseline lowered without a recorded cause is indistinguishable from one nobody questioned');
    line('');
    process.exit(1);
  }

  fs.writeFileSync(BASELINE, `${JSON.stringify({
    recordedBy: 'verify-suite-integrity.js --relock',
    note: 'Declared test counts per package. A DROP fails the gate; a rise passes and is re-cut here deliberately.',
    // Append-only. Carried across every relock so a reduction cannot be erased by the next one.
    reductions: [...(prior.reductions ?? []), ...(falls.length > 0 ? [{ reason, packages: falls }] : [])],
    totals: current,
  }, null, 2)}\n`);
  line(`  RELOCKED  ${BASELINE}`);
  line(`         ${Object.values(current).reduce((a, b) => a + b, 0)} declared test(s) across ${survey.length} package(s)`);
  if (falls.length > 0) {
    line(`         REDUCTION RECORDED — ${falls.map((f) => `${f.package} -${f.removed}`).join('; ')}`);
    line(`         ${reason}`);
  }
  line('');
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  check('a committed suite baseline exists', false,
    'no baseline — run with --relock to record one, then review the diff and commit');
} else {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).totals ?? {};
  const dropped = Object.entries(baseline)
    .filter(([pkg, was]) => (current[pkg] ?? 0) < was)
    .map(([pkg, was]) => `${pkg}: ${was} -> ${current[pkg] ?? 0}`);
  const risen = Object.entries(current)
    .filter(([pkg, now]) => baseline[pkg] !== undefined && now > baseline[pkg])
    .map(([pkg, now]) => `${pkg}: ${baseline[pkg]} -> ${now}`);
  const added = Object.keys(current).filter((p) => baseline[p] === undefined);

  check('no package declares fewer tests than the baseline', dropped.length === 0,
    dropped.length > 0
      ? `${dropped.join('; ')} — a suite that shrank reads as green everywhere else. If intended, --relock.`
      : `${Object.values(current).reduce((a, b) => a + b, 0)} declared test(s), none below baseline`);

  // A RISE IS NOT A FAILURE. Reported so the baseline is re-cut deliberately rather than
  // drifting — the same reason the closure gate reports an added ADR instead of absorbing it.
  if (risen.length > 0 || added.length > 0) {
    line(`  NOTE      ${[...risen, ...added.map((p) => `${p}: new (${current[p]})`)].join('; ')}`);
    line('         a rise passes; re-cut with --relock so the next drop is measured from here');
  }
}

line('');
line('='.repeat(74));
line(failures === 0
  ? 'RESULT: PASS — every declared test is compiled, and no suite shrank.'
  : `RESULT: FAIL — ${failures} property violated.`);
line('');
process.exit(failures === 0 ? 0 : 1);
