'use strict';
/**
 * GOVERNANCE — the OPERATOR-WRITER census, from one enumeration.
 * ============================================================================
 * **"WHICH MODULES WRITE ON BEHALF OF AN OPERATOR, AND WHO IS PERMITTED TO DRIVE THEM?"**
 * has ONE answer, read from ONE enumeration — `SUBJECTS`, below.
 *
 * ── WHY THIS FILE EXISTS RATHER THAN A SECOND COPY OF THE RUN-RECORD GATE ───────────────────────
 *
 * **D-147.** `publishWorkPaths` — the whole mechanism by which a tenancy is told where to ask for
 * work — has **zero non-test callers**. No route, no CLI, no job. The engine can distribute a work
 * path and the deployed system has no way to ask it to. **It was found by the Execution Plane
 * reporting that nothing ever arrived**, which is not a mechanism.
 *
 * **ADR-0082's P-82.9 caller census was built for exactly this class and is scoped to one store.**
 * `verify-run-record-write-surface.js` hard-codes a single `STORE_SRC`, asserts its permitted-caller
 * set in BOTH directions, and is correct. **It was written about its neighbour.** So a sibling
 * writer, wired only by its tests, passes every gate in this programme.
 *
 * > **THIS IS D-141'S PATTERN FROM THE OTHER DIRECTION.** D-141 is *two subjects sharing one
 * > driver* — a control whose scope silently WIDENED. This is *one census not reaching a sibling* —
 * > a control whose scope silently stayed NARROW. Both are the same underlying defect: **the SET a
 * > control governs is implicit, so nobody can ask what is outside it.** A widened driver is visible
 * > when the wrong thing goes red. A narrow census is visible only when someone on the far side
 * > notices nothing ever arrived.
 *
 * ── THE SHAPE IS 677ec4a's, DELIBERATELY, AND NOT REINVENTED ────────────────────────────────────
 *
 * ADR-0082 **P-82.8** made the doc-06 sovereignty gate multi-subject rather than acquiring a
 * sibling, and its argument is the one this file would otherwise have to make from scratch:
 *
 *   ***"Which stores does document 06 govern?"* must have ONE answer, read from ONE enumeration.**
 *   With a sibling gate the answer becomes *"however many gates someone happened to write."*
 *
 * So: one `SUBJECTS` list · every property runs PER SUBJECT · **an empty enumeration FAILS CLOSED** ·
 * **an enumerated subject absent from disk FAILS** rather than passing vacuously.
 *
 * ── THE THIRD PROPERTY IS WHY THIS GATE WAS EVER RED, AND IT STAYS ──────────────────────────────
 *
 * On its first run `publishWorkPaths` was enumerated with an **EMPTY permitted set**, because it had
 * no callers to permit. Both census directions passed VACUOUSLY over that state — *"no unpermitted
 * caller"* is trivially true of no callers, and *"every permitted caller still writes"* is trivially
 * true of an empty set. **The subject was therefore carried by an explicit third property: a writer
 * nothing can drive is UNREACHABLE, and that FAILS.** The gate was RED, correctly, because the
 * platform genuinely could not distribute a work path.
 *
 * **THAT RED IS NOW CLOSED — D-147's operator route landed** (`POST /api/work-paths`, platform-admin,
 * swept on demand; `GET /api/work-paths` asks without writing). **The third property is KEPT, not
 * retired.** It is the only one of the three that can see the next writer wired by its tests alone,
 * and removing it once its first subject went green would leave the gate unable to catch the defect
 * it was written for — CHARTER §17.1.1's shape, a control retired with the instance that motivated it.
 *
 * Run:  node governance/verification/verify-operator-writer-census.js
 * Exit: 0 = every enumerated writer is reachable and its callers are permitted   1 = one is not
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PKG = path.join(ROOT, 'packages');

/**
 * ══ THE ENUMERATION — THE ONE ANSWER TO "WHICH OPERATOR-WRITERS DOES THIS PROGRAMME GOVERN?" ═════
 *
 * A module belongs here when its PURPOSE is to write on behalf of an operator: it changes durable
 * state that some party outside this process depends on, and nothing else in the system will do it
 * if no one calls it. **That is precisely the class whose failure mode is silence.**
 *
 * `permitted` paths are repo-relative and EXACT. A wildcard would let a whole directory become a
 * permitted caller, which is the enumeration dissolving into a pattern.
 */
const SUBJECTS = [
  {
    id: 'work-path-distribution',
    source: 'packages/tenant-onboarding-engine/src/engine/work-path-distribution.ts',
    writer: 'publishWorkPaths',
    writes: 'a work-path-changed update event per tenancy (ADR-0080 §6, the rotation carrier)',
    // D-147 RULED: an operator route, swept ON DEMAND — and it has LANDED. `POST /api/work-paths`
    // sweeps, `GET /api/work-paths` asks without writing, and `WorkPathController` mounts both
    // unconditionally in `app.module.ts`.
    //
    // THE PERMITTED CALLER IS THE ROUTER, NOT THE CONTROLLER, and that is the same shape every other
    // write on this surface has: the controller adapts a transport and decides nothing, so naming it
    // here would permit a file that does not write and leave the file that does unenumerated. A
    // second transport over the same `route()` would then need a census amendment for a change that
    // altered no authorisation — which is the enumeration drifting toward "wherever the call is
    // spelled" and away from "who is permitted to write."
    permitted: ['packages/tenant-onboarding-engine/src/engine/api.ts'],
    owed: 'none — driven on demand from POST /api/work-paths (platform-admin, ADR-0033 R-33.5).',
  },
  {
    id: 'verification-key-distribution',
    source: 'packages/tenant-onboarding-engine/src/engine/verification-key-distribution.ts',
    writer: 'publishVerificationKeys',
    writes: 'a verification-key update event per tenancy (ADR-0081 P-81.4)',
    // THE SIBLING, AND ITS FIRST RUN IN THIS GATE IS WHY IT IS ENUMERATED RATHER THAN ASSUMED.
    //
    // `work-path-distribution.ts` says in its own header that it reuses "the identical reasoning
    // that gave verification-key distribution its existence" — and it did NOT reuse the one thing
    // that makes a distributor work: a caller. This one is driven from the composition root at
    // BOOT, sweeping every registered tenancy, idempotent by comparison so a restart emits nothing.
    // That asymmetry between two deliberately-parallel modules was invisible until something
    // enumerated writers, which is the whole argument for this file.
    permitted: ['packages/tenant-onboarding-engine/src/server/platform-adoption.ts'],
    owed: 'none — driven at boot from the composition root.',
  },
];

/** The other half of the class: a general write name lets a second cause in without a second method. */
let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

/** Every production `.ts` under packages/, excluding tests and build output — declared, not implied. */
function productionSources() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'test' || e.name === '.vite') continue;
        walk(full);
      } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !e.name.includes('.test.')) {
        out.push(full);
      }
    }
  };
  walk(PKG);
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/**
 * CODE WITH ITS COMMENTS REMOVED — borrowed from the run-record gate, and load-bearing for the same
 * reason it was there: that gate's FIRST RUN went red on its own subject's documentation. In this
 * platform the reasoning is written at the site and is often longer than the code, so a scan that
 * reads comments measures what a file SAYS rather than what it DOES — and fails in both directions.
 */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

line('');
line('GOVERNANCE — operator-writer census, measured on every enumerated writer (D-147, P-82.8 shape)');
line('='.repeat(96));

// ── 0. THE ENUMERATION ITSELF — FAIL CLOSED ON AN EMPTY LIST ────────────────
//
// P-82.8: "an empty subject list fails closed." Without this, emptying the enumeration turns this
// gate green over nothing — CHARTER §17.1.1's control-shaped literal, inside the gate written to
// prevent it. The fault proof for this branch is the enumeration emptied.
line('\n0. The enumeration');
check('at least one operator-writer is enumerated',
  SUBJECTS.length > 0,
  SUBJECTS.length > 0
    ? `${SUBJECTS.length} subject(s): ${SUBJECTS.map((s) => s.id).join(', ')}`
    : 'EMPTY — this gate would measure nothing and report success');

if (SUBJECTS.length === 0) {
  line('');
  line('='.repeat(96));
  line('RESULT: FAIL — the enumeration is empty; no operator-writer was measured.');
  process.exitCode = 1;
  return;
}

const sources = productionSources();

for (const subject of SUBJECTS) {
  line(`\n── ${subject.id} — ${subject.writes}`);

  // ── 1. The subject exists ────────────────────────────────────────────────
  //
  // An enumerated subject not on disk is a gate measuring nothing. FAIL, never skip.
  const src = path.join(ROOT, subject.source);
  const exists = fs.existsSync(src);
  check('the writer\'s source is present',
    exists,
    exists ? subject.source : `ABSENT: ${subject.source} — every property below would pass vacuously`);
  if (!exists) continue;

  // ── 2. The writer is declared where it is claimed to be ──────────────────
  const text = code(fs.readFileSync(src, 'utf8'));
  const declared = new RegExp(`function\\s+${subject.writer}\\s*[(<]`).test(text);
  check(`\`${subject.writer}\` is declared in that source`,
    declared,
    declared ? `declared in ${subject.source}` : `not found — the enumeration names a writer that does not exist`);
  if (!declared) continue;

  // ── 3. The caller census, in BOTH directions ─────────────────────────────
  const callers = sources
    .filter((f) => f !== src)
    .filter((f) => new RegExp(`\\b${subject.writer}\\s*\\(`).test(code(fs.readFileSync(f, 'utf8'))))
    .map(rel)
    .filter((f) => !f.endsWith('/index.ts')) // a barrel re-export is not a caller; it forwards a name
    .sort();

  // (a) NO UNPERMITTED CALLER.
  const unpermitted = callers.filter((c) => !subject.permitted.includes(c));
  check(`every caller of \`${subject.writer}\` is permitted`,
    unpermitted.length === 0,
    unpermitted.length === 0
      ? `${callers.length} permitted caller(s): ${callers.join(', ') || 'none'}`
      : unpermitted.map((c) => `${c} calls ${subject.writer}() and is not permitted`).join('; '));

  // (b) EVERY PERMITTED CALLER STILL CALLS. Vacuous on an empty set — which (c) exists to catch.
  const missing = subject.permitted.filter((p) => !callers.includes(p));
  check(`every permitted module still drives \`${subject.writer}\``,
    missing.length === 0,
    subject.permitted.length === 0
      ? 'vacuous — the permitted set is EMPTY, which property (c) below is what actually reports'
      : missing.length === 0
        ? 'all permitted callers present'
        : missing.map((m) => `${m} is declared a caller and no longer calls it`).join('; '));

  // (c) THE WRITER IS REACHABLE AT ALL — the property the run-record gate never needed.
  //
  // Its subject always had permitted callers, so "no unpermitted caller" and "every permitted caller
  // still writes" were together sufficient. THEY ARE NOT SUFFICIENT FOR A WRITER WITH NO CALLERS:
  // both pass vacuously, and D-147 is precisely that state. A writer nothing can drive is a
  // capability the platform does not have, however green its own tests are.
  // REACHABILITY IS NOT PERMISSION, AND THE FIRST DRAFT OF THIS GATE CONFLATED THEM — it required
  // a PERMITTED caller, so a writer driven by an UNPERMITTED one reported as unreachable, which is
  // false and would have sent a reader looking for a missing caller that was there all along.
  // (a) judges who calls. This judges whether anything does. Two questions, two properties.
  const reachable = callers.length > 0;
  check(`\`${subject.writer}\` is REACHABLE from production code`,
    reachable,
    reachable
      ? `driven by ${callers.length} permitted caller(s)`
      : `NO PRODUCTION CALLER. ${subject.owed} The engine can perform this and the deployed system ` +
        'has no way to ask it to — green tests over an unreachable writer (D-122\'s shape, D-147\'s instance).');
}

line('');
line('='.repeat(96));
if (failures > 0) {
  line(`RESULT: FAIL — ${failures} property violated across ${SUBJECTS.length} enumerated writer(s).`);
  line('A writer nothing drives is a capability this platform does not have, whatever its tests say.');
} else {
  line(`RESULT: PASS — ${SUBJECTS.length} operator-writer(s), each reachable and each driven only by permitted callers.`);
}
line('='.repeat(96));
process.exitCode = failures === 0 ? 0 : 1;
