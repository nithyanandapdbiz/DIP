'use strict';
/**
 * GOVERNANCE — General Availability.
 * ============================================================================
 * The gate that decides whether General Availability may be claimed, and refuses to
 * let it be claimed anywhere else.
 *
 * THIS GATE PROTECTS AGAINST ONE FAILURE, AND IT IS NOT A TECHNICAL ONE.
 * Every measurement in M2.6-M2.8 passed. The platform is observable, diagnosable,
 * isolated and verifiable. The remaining risk is not that a measurement breaks — it is
 * that someone, reasonably, under delivery pressure, writes **CERTIFIED** in a summary
 * where a measurement should have gone. Twelve green milestones make that easier, not
 * harder: the more that is genuinely proven, the more natural it is to round up the
 * one thing that is not.
 *
 * So this gate does two things:
 *
 *   1. It DERIVES the determination. `generalAvailability` must equal CERTIFIED if and
 *      only if E-2 has PASS evidence, and E-2's status must come from a probe that
 *      ran. There is no flag, override or configuration that can set it otherwise.
 *
 *   2. It SEARCHES THE REPOSITORY for any claim to the contrary. A document asserting
 *      GA while E-2 is unmeasured fails this gate, wherever it is and whoever wrote
 *      it — including a certification record, a report, or a commit that looked
 *      entirely reasonable at the time.
 *
 * A gate that only checked its own evidence file would be trivially bypassed by
 * writing the claim somewhere else, which is exactly where it would be written.
 *
 * Run:  node governance/verification/verify-general-availability.js
 * Exit: 0 = the GA claim is consistent with the evidence   1 = it is not
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS = path.join(ROOT, 'governance', 'deployment', 'run-deployment-evidence.js');
const EVIDENCE = path.join(ROOT, 'governance', 'deployment', 'evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

const gateStartedAt = Date.now();
line('');
line('GOVERNANCE — General Availability');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the deployment evidence harness exists', fs.existsSync(HARNESS),
  fs.existsSync(HARNESS) ? 'governance/deployment/run-deployment-evidence.js' : 'absent');
if (!fs.existsSync(HARNESS)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — General Availability cannot be evaluated.');
  line('');
  process.exit(1);
}

// ── 2. Regenerate ───────────────────────────────────────────────────────────
line('\n2. Harness execution');
const run = spawnSync(process.execPath, [HARNESS],
  { cwd: ROOT, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 32 * 1024 * 1024 });
check('the harness executed', run.status !== null && !run.error,
  run.status !== null ? `exit ${run.status}` : String(run.error || 'no exit status'));
check('the harness exited cleanly', run.status === 0,
  run.status === 0 ? 'exit 0' : `exit ${run.status}`);

// ── 3. The determination is derived, not written ────────────────────────────
line('\n3. The determination');
let ev = null;
try { ev = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')); } catch { ev = null; }
check('the harness emitted machine-readable evidence', ev !== null,
  ev ? `E-2 is ${ev.e2 ? ev.e2.status : 'absent'}` : 'absent or unparseable');

let e2Pass = false;
if (ev) {
  const producedAt = Date.parse(ev.timestamp);
  check('evidence was produced by this run, not left behind',
    Number.isFinite(producedAt) && producedAt >= gateStartedAt - 2000,
    Number.isFinite(producedAt) ? `produced ${Math.max(0, Math.round((Date.now() - producedAt) / 1000))}s ago` : 'no timestamp');

  check('E-2 carries a status produced by an executed probe',
    ev.e2 !== null && typeof ev.e2 === 'object' && typeof ev.e2.status === 'string'
      && Array.isArray(ev.runtimesSearched) && ev.runtimesSearched.length > 0,
    ev.e2 ? `E-2 = ${ev.e2.status}, from a probe that searched ${(ev.runtimesSearched || []).length} runtimes` : 'E-2 absent');

  e2Pass = Boolean(ev.e2 && ev.e2.status === 'PASS');

  // THE CENTRAL CHECK. Equality in BOTH directions: certified requires E-2 PASS, and
  // E-2 PASS requires certified. A one-directional check would permit the platform to
  // withhold GA after deployment succeeded, which is a different failure but still a
  // determination that stopped tracking its evidence.
  const claimed = ev.generalAvailability === 'CERTIFIED';
  check('General Availability is CERTIFIED if and only if E-2 has PASS evidence',
    claimed === e2Pass,
    `evidence says "${ev.generalAvailability}"; E-2 is ${ev.e2 ? ev.e2.status : 'absent'}`);

  check('the determination carries its reason', typeof ev.generalAvailabilityReason === 'string'
    && ev.generalAvailabilityReason.length > 20,
    ev.generalAvailabilityReason ?? 'absent');

  if (!e2Pass) {
    // NOT MEASURED must never be silently promoted. The blocker is required to survive.
    const e2Blocked = (ev.unmeasured || []).some((u) => u.id === 'E-2');
    check('E-2 remains reported as unmeasured with its blocker named', e2Blocked,
      e2Blocked ? (ev.e2.blocker || '').slice(0, 140) : 'E-2 is no longer reported as unmeasured, and did not pass');

    // Every dependent replay must remain unmeasured too. A sub-gate that quietly
    // became measured without a deployment would be measuring nothing.
    const dependents = (ev.unmeasured || []).filter((u) => /^GA-\d+$/.test(u.id));
    check('every GA replay remains unmeasured while E-2 is', dependents.length >= 8,
      `${dependents.length} GA replays reported unmeasured, each naming E-2 as the blocker`);
  }
}

// ── 4. No false claim anywhere in the repository ────────────────────────────
line('\n4. Repository-wide claim scan');

/**
 * Text that ASSERTS General Availability. Deliberately narrow: it must not fire on the
 * many legitimate statements about GA that this repository correctly contains.
 */
const CLAIM = /\b(?:general\s+availability|(?<![a-z])GA(?![a-z]))\b[^.\n]{0,60}?\bcertified\b/i;

/**
 * Markers that make a sentence a NEGATION, a CONDITION, or a definition rather than a
 * claim. Without these the scan would flag "GA is NOT CERTIFIED" — which is the very
 * statement the platform is trying to protect.
 *
 * WIDENED after two verified false positives, both of which were the OPPOSITE of a GA claim:
 *
 *   ADR-0054 §4  "...a programme-closure statement that distinguishes Repository Engineering
 *                Complete from Operationally Ready from Production Ready from GA Certified"
 *                — a taxonomy that separates GA from the states below it.
 *   PE-HANDOFF-001  "GA gate recomputes CERTIFIED iff E-2 PASS"
 *                — a conditional describing the gate's own rule.
 *
 * `distinguish*`, `taxonomy`, `difference between`, `recomputes` and the abbreviation `iff`
 * (the long form `if and only if` was already here) are therefore added.
 *
 * THIS DOES NOT WEAKEN THE GATE, and that is verified rather than asserted: the fault probe
 * `false-ga-claim` plants the bare sentence "General Availability: CERTIFIED", which carries none
 * of these markers and is still detected. A gate whose false positives are tolerated is a gate
 * people learn to ignore — which is how a real GA over-claim would eventually pass unnoticed.
 */
const NOT_A_CLAIM = /\b(?:not|never|cannot|can't|shall only|only become|only be|withheld|until|unless|if and only if|iff|would|refus|prevent|false|blocked|remains?\s+not|distinguish(?:es|ing)?|difference between|taxonomy|recomputes?)\b/i;

const SCAN_DIRS = ['docs', 'governance', 'program', 'packages', 'deploy'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const violations = [];
let scannedFiles = 0;

function scan(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) scan(full); continue; }
    if (!/\.(md|json|js|mjs|ts|ya?ml)$/.test(e.name)) continue;
    // This gate necessarily contains the patterns it searches for.
    if (path.resolve(full) === path.resolve(__filename)) continue;
    scannedFiles += 1;

    const body = fs.readFileSync(full, 'utf8');
    if (!/general\s+availability|(?<![a-z])GA(?![a-z])/i.test(body)) continue;

    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (!CLAIM.test(l)) continue;
      // A QUALIFIER IS EVALUATED AGAINST THE SENTENCE, NOT THE LINE.
      //
      // Markdown prose wraps, so a sentence's own negation or condition frequently sits on an
      // EARLIER line than the words that trip CLAIM. Testing the matched line alone therefore flagged
      // ADR-0054 §4, whose sentence begins "...a programme-closure statement that distinguishes" on
      // the preceding line and lands "Production Ready from GA Certified" on the next — a taxonomy
      // separating GA from the states below it, reported as if it asserted GA.
      //
      // The context walks back to the previous sentence terminator (or a blank line, which ends a
      // Markdown block) and no further, so a qualifier from an UNRELATED neighbouring sentence cannot
      // launder a real claim. The fault probe plants a bare "General Availability: CERTIFIED" with no
      // preceding sentence at all, and is still detected.
      let sentence = l;
      for (let j = i - 1; j >= 0 && j >= i - 5; j -= 1) {
        const prev = lines[j];
        if (prev.trim() === '') break;                 // blank line ends the block
        sentence = `${prev} ${sentence}`;
        if (/[.!?]\s*$/.test(prev.trim())) break;      // previous sentence ended here
      }
      if (NOT_A_CLAIM.test(sentence)) continue;
      violations.push(`${path.relative(ROOT, full).split('\\').join('/')}:${i + 1}: ${l.trim().slice(0, 120)}`);
    }
  }
}
for (const d of SCAN_DIRS) scan(path.join(ROOT, d));

if (e2Pass) {
  check('General Availability claims are permitted — E-2 has PASS evidence', true,
    `${violations.length} GA claim(s) found, and E-2 supports them`);
} else {
  check('NO file claims General Availability while E-2 is unmeasured',
    violations.length === 0,
    violations.length === 0
      ? `${scannedFiles} files scanned; every mention of General Availability is a negation, a condition or a definition`
      : violations.slice(0, 5).join(' | '));
}

// ── 5. NOT MEASURED has not been promoted elsewhere ─────────────────────────
line('\n5. Cross-evidence consistency');

/**
 * E-2 is referenced by three other evidence sets. If one of them started reporting it
 * as passed, the platform would be internally inconsistent — and the inconsistency
 * would be invisible from inside any single gate.
 */
const RELATED = [
  ['governance/operational/evidence.json', 'E-2'],
  ['governance/production/evidence.json', 'G-1'],
  ['governance/customer-success/evidence.json', 'K-15'],
];
const promoted = [];
for (const [rel, id] of RELATED) {
  let other = null;
  try { other = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { continue; }
  const stillBlocked = (other.unmeasured || []).some((u) => u.id === id);
  const claimsPassed = (other.proven || []).some((p) => p.id === id && p.passed);
  if (!e2Pass && (claimsPassed || !stillBlocked)) {
    promoted.push(`${rel}: ${id} is no longer reported as unmeasured`);
  }
}
check('no other evidence set promotes the deployment gap to passed',
  promoted.length === 0,
  promoted.length === 0
    ? `${RELATED.length} related evidence sets all still report the deployment gap`
    : promoted.join('; '));

// ── Result ──────────────────────────────────────────────────────────────────
line('\n' + '='.repeat(74));
if (failures === 0) {
  line(`RESULT: PASS — the General Availability claim is consistent with the evidence.`);
  line('');
  if (e2Pass) {
    line('GENERAL AVAILABILITY: CERTIFIED — E-2 has PASS evidence.');
  } else {
    line('GENERAL AVAILABILITY: NOT CERTIFIED.');
    line('Reason: Deployment evidence unavailable.');
    line('');
    line('This gate passing means the claim MATCHES the evidence. It does not mean the');
    line('platform is deployable. Those are different sentences and this one is the');
    line('weaker of the two.');
  }
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
