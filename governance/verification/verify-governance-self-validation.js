'use strict';
/**
 * GOVERNANCE — self-validation.
 * ============================================================================
 * Governance must prove its own effectiveness (R-13.4, C-01.39).
 *
 * Every gate registered in the runner SHALL have a **current, machine-readable**
 * fault-injection proof showing it fails on a planted violation and passes on a
 * clean repository. A proof recorded only in prose does not satisfy R-13.4: a
 * sentence in a commit message cannot be reconciled against the gates that exist
 * today, and it is an assertion about evidence rather than evidence.
 *
 * This check enforces:
 *
 *   1. A proof registry exists and is machine-readable.
 *   2. Every gate in the runner has a proof entry.
 *   3. Every proof records a genuine detection — clean run passed, faulted run
 *      failed, and the gate NAMED the planted cause.
 *   4. No proof entry exists for a gate that no longer runs.
 *   5. Proofs are not stale relative to the gate they attest to.
 *
 * Property 3 is what stops a green registry from being meaningless. A gate that
 * fails for an unrelated reason has not detected anything, and recording that as a
 * proof would make the registry itself an assertion.
 *
 * Read-only. Regenerate proofs with record-fault-proofs.js.
 *
 * Run:  node governance/verification/verify-governance-self-validation.js
 * Exit: 0 = governance proves itself   1 = at least one violation
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const REGISTRY = path.join(HERE, 'proofs.json');
const RUNNER = path.join(HERE, 'run-all.js');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — self-validation');
line('='.repeat(74));

// ── 1. Registry present and readable ────────────────────────────────────────
line('\n1. Proof registry');
let registry = null;
if (fs.existsSync(REGISTRY)) {
  try { registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch { registry = null; }
}
check('a machine-readable proof registry exists',
  registry !== null && Array.isArray(registry.proofs),
  registry ? `${registry.proofs.length} proof(s), recorded ${registry.recordedAt}` : 'absent or unparseable');

if (registry === null || !Array.isArray(registry.proofs)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — governance cannot demonstrate its own effectiveness.');
  line('');
  process.exit(1);
}

/**
 * Proofs are grouped by gate, not keyed by it. A gate may be proved by more than one
 * fault — the operational gate is proved both by a retained customer artefact and by
 * a gateway that stopped refusing callers — and a Map keyed on gate name would keep
 * only the last, silently retiring the others from audit.
 */
const proofs = new Map();
for (const p of registry.proofs) {
  const list = proofs.get(p.gate);
  if (list) list.push(p); else proofs.set(p.gate, [p]);
}

/**
 * SELF-EXCLUSION, stated openly.
 *
 * This gate cannot assert about its own proof entry without infinite regress: its
 * clean run evaluates the registry, which would contain a not-yet-established entry
 * for itself, so it could never pass and could therefore never be proved.
 *
 * The exclusion is deliberately narrow. It applies ONLY to checks 2 and 3, and ONLY
 * to this gate's own entry. This gate is still fault-injected like every other — a
 * planted unregistered gate must make it fail — so its detection capability is
 * evidenced, not assumed. What is NOT evidenced is this gate auditing itself, and
 * that limitation is recorded here rather than hidden by a passing check.
 */
const SELF = path.basename(__filename);
const auditable = (g) => g !== SELF;

// ── 2. Gates registered in the runner ───────────────────────────────────────
line('\n2. Coverage of registered gates');
const runnerSrc = fs.existsSync(RUNNER) ? fs.readFileSync(RUNNER, 'utf8') : '';
const registered = [...runnerSrc.matchAll(/script:\s*'([^']+\.js)'/g)].map((m) => m[1]);
line(`   ${registered.length} gate(s) registered in run-all.js`);

const unproven = registered.filter(auditable).filter((g) => !proofs.has(g));
check('every registered gate has a proof entry', unproven.length === 0,
  unproven.join(', ') || `${registered.filter(auditable).length} gate(s) proved by ${registry.proofs.length} fault(s) (this gate excluded — see SELF-EXCLUSION)`);

// ── 3. Proofs record a genuine detection ────────────────────────────────────
line('\n3. Proof quality');
const weak = [];
let audited = 0;
for (const g of registered.filter(auditable)) {
  // EVERY proof for the gate is audited. Checking only one would let a second,
  // weaker fault sit in the registry unexamined while appearing to add coverage.
  for (const p of proofs.get(g) ?? []) {
    audited += 1;
    const o = p.observations ?? {};
    const genuine = p.proved === true
      && o.cleanRunExit === 0
      && o.faultedRunExit === 1
      && o.causeNamedInOutput === true;
    if (!genuine) {
      const why = o.causeNamedInOutput === false
        ? 'gate failed but did not name the planted cause'
        : `clean=${o.cleanRunExit} faulted=${o.faultedRunExit}`;
      weak.push(`${p.evidenceId ?? g} (${why})`);
    }
  }
}
check('every proof shows a clean pass, a faulted failure, and a named cause',
  weak.length === 0, weak.join('; ') || `${audited} detections are genuine, not incidental`);

// ── 4. No proof for a gate that no longer runs ──────────────────────────────
line('\n4. Registry hygiene');
const stale = [...proofs.keys()].filter((g) => !registered.includes(g));
check('no proof exists for a gate that is not registered', stale.length === 0,
  stale.join(', ') || 'registry matches the runner');

// ── 4b. Every gate present on disk is registered in the runner ─────────────
line('\n4b. Runner coverage');
// A gate that exists but is not registered reports NOT RUN, which C-0.4 treats as
// FAIL — it has zero enforcement value while appearing to provide some. This is not
// hypothetical: the AI-neutrality gate was authored and left unregistered, and was
// caught only because someone looked.
const onDisk = fs.readdirSync(HERE)
  .filter((f) => /^verify-.*\.js$/.test(f));
const unregistered = onDisk.filter((f) => !registered.includes(f));
check('every gate present on disk is registered in the runner',
  unregistered.length === 0,
  unregistered.length ? `${unregistered.join(', ')} — present but NOT RUN` : `${onDisk.length} gate(s) all registered`);

// ── 5. Proofs are not older than the gates they attest to ──────────────────
line('\n5. Proof currency');
const outdated = [];
const recordedAt = Date.parse(registry.recordedAt ?? '');
for (const g of registered) {
  const gateFile = path.join(HERE, g);
  if (!fs.existsSync(gateFile) || Number.isNaN(recordedAt)) continue;
  if (fs.statSync(gateFile).mtimeMs > recordedAt + 1000) outdated.push(g);
}
check('no gate has changed since its proof was recorded', outdated.length === 0,
  outdated.length ? `${outdated.join(', ')} — re-run record-fault-proofs.js` : 'proofs are current');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — every gate has demonstrated it can fail correctly.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
