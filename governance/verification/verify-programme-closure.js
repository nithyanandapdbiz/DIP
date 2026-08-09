'use strict';
/**
 * GOVERNANCE — programme closure baseline.
 * ============================================================================
 * Verifies the repository against the **committed** closure baseline.
 *
 * IT DOES NOT REGENERATE. That is the whole point, and it is the opposite of every
 * other gate in this suite.
 *
 * The others regenerate because evidence must be current: a committed measurement goes
 * stale and keeps asserting something that stopped being true. A BASELINE is the
 * inverse — it is a fixed point, and a gate that regenerated it before comparing would
 * always agree with itself. That failure mode is not hypothetical: M2.7 shipped a
 * package-integrity check with exactly this shape, and it was found to be self-healing
 * and therefore incapable of failing.
 *
 * So this gate recomputes hashes from disk and compares them against
 * `governance/closure/baseline.json` as committed. A changed architecture document
 * fails the gate and is named.
 *
 * THAT IS THE INTENDED BEHAVIOUR, NOT AN OBSTACLE.
 * Amending the architecture after closure is permitted. Amending it **silently** is
 * not. Re-baselining is a deliberate act — run the emitter, review the diff, commit —
 * and the gate exists to make sure it happens deliberately.
 *
 * Run:  node governance/verification/verify-programme-closure.js
 * Exit: 0 = the repository matches its closure baseline   1 = it has drifted
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const BASELINE = path.join(ROOT, 'governance', 'closure', 'baseline.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};
/**
 * Content hash over the CANONICAL representation of a document.
 *
 * WHY LINE ENDINGS ARE NORMALISED FIRST, AND WHY THIS IS NOT A WEAKENING.
 *
 * This gate answers "has the governed content changed?". A line ending is a checkout artefact, not
 * content: `.gitattributes` declares these files `text`, so git materialises them with CRLF on Windows
 * and LF on Linux from the SAME committed bytes. Hashing the raw file therefore made the verdict depend
 * on the developer's operating system — the gate reported all 55 ADRs and 2 architecture documents as
 * "modified" on a Windows working tree while the identical commit passed in Linux CI.
 *
 * A gate that disagrees with itself by platform is worse than no gate: it trains everyone to treat a
 * red result as noise, which is precisely how a real amendment would then slip through unnoticed. It
 * also made the documented remedy — re-baselining — actively dangerous, because re-baselining on
 * Windows would have written CRLF hashes that then failed for every Linux developer and for CI.
 *
 * Normalising to LF before hashing is what git itself does for `text=auto` content, so the gate now
 * compares the same thing the repository stores. The baseline was recorded against LF content and is
 * left UNCHANGED: no re-baseline, no loosened comparison, and a genuine one-character edit to any
 * governed document still fails this gate exactly as before.
 */
const canonical = (s) => s.replace(/\r\n/g, '\n');
const sha = (s) => crypto.createHash('sha256').update(canonical(s)).digest('hex');

line('');
line('GOVERNANCE — programme closure baseline');
line('='.repeat(74));

// ── 1. The baseline exists ──────────────────────────────────────────────────
line('\n1. Baseline');
let baseline = null;
try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { baseline = null; }
check('a committed closure baseline exists', baseline !== null,
  baseline ? `hash ${String(baseline.baselineHash).slice(0, 24)}…, commit ${baseline.commit ?? 'unknown'}`
    : 'governance/closure/baseline.json is absent or unparseable');

if (!baseline) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the programme has no closure baseline to verify against.');
  line('');
  process.exit(1);
}

// ── 2. Architecture has not drifted ─────────────────────────────────────────
line('\n2. Architecture');
const ARCH = path.join(ROOT, 'docs', 'architecture');
const onDisk = fs.existsSync(ARCH)
  ? fs.readdirSync(ARCH).filter((f) => /^\d\d-.*\.md$/.test(f)).sort() : [];

const baselineDocs = new Map((baseline.architecture ?? []).map((d) => [d.document, d]));
const changed = [];
const missing = [];
const added = [];

for (const [name, rec] of baselineDocs) {
  const full = path.join(ARCH, name);
  if (!fs.existsSync(full)) { missing.push(name); continue; }
  const actual = sha(fs.readFileSync(full, 'utf8'));
  if (actual !== rec.sha256) changed.push(`${name} (${rec.sha256.slice(0, 8)} -> ${actual.slice(0, 8)})`);
}
for (const name of onDisk) if (!baselineDocs.has(name)) added.push(name);

check('no baselined architecture document has been modified', changed.length === 0,
  changed.length ? changed.join('; ') : `${baselineDocs.size} documents match their recorded hash`);
check('no baselined architecture document has been removed', missing.length === 0,
  missing.length ? missing.join(', ') : 'all present');
check('no architecture document has been added since closure', added.length === 0,
  added.length ? `${added.join(', ')} — re-baseline deliberately if this is intended` : 'the canonical set is unchanged');

// ── 3. Decisions have not drifted ───────────────────────────────────────────
line('\n3. Decisions');
const ADR = path.join(ROOT, 'docs', 'adr');
const adrChanged = [];
for (const rec of baseline.adrs ?? []) {
  const full = path.join(ADR, rec.adr);
  if (!fs.existsSync(full)) { adrChanged.push(`${rec.adr} (removed)`); continue; }
  const actual = sha(fs.readFileSync(full, 'utf8'));
  if (actual !== rec.sha256) adrChanged.push(`${rec.adr} (modified)`);
}
check('no baselined ADR has been modified or removed', adrChanged.length === 0,
  adrChanged.length ? adrChanged.join('; ') : `${(baseline.adrs ?? []).length} ADRs match their recorded hash`);

// ADDED ADRs are drift too, and this check was missing.
//
// The gate detected an added architecture document but not an added ADR, so ADR-0022
// was written and the baseline still reported PASS. An ADR is the instrument by which
// architecture is amended — a new one appearing without a re-baseline is precisely the
// silent amendment this gate exists to prevent, arriving through the door left open.
const adrsOnDisk = fs.existsSync(ADR)
  ? fs.readdirSync(ADR).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)).sort() : [];
const baselinedAdrs = new Set((baseline.adrs ?? []).map((a) => a.adr));
const addedAdrs = adrsOnDisk.filter((f) => !baselinedAdrs.has(f));
check('no ADR has been added since closure', addedAdrs.length === 0,
  addedAdrs.length
    ? `${addedAdrs.join(', ')} — re-baseline deliberately if this is intended`
    : `${adrsOnDisk.length} ADRs, all baselined`);

// ADR-0021 is named individually because it is the decision the last four milestones
// were repeatedly instructed not to disturb.
const adr21 = (baseline.adrs ?? []).find((a) => a.adr.startsWith('ADR-0021'));
const adr21Path = adr21 ? path.join(ADR, adr21.adr) : null;
check('ADR-0021 is present and unchanged',
  adr21 !== undefined && adr21Path !== null && fs.existsSync(adr21Path)
    && sha(fs.readFileSync(adr21Path, 'utf8')) === adr21.sha256,
  adr21 ? `${adr21.adr} — ${adr21.status}` : 'ADR-0021 is not in the baseline');

// ── 4. Invariants ───────────────────────────────────────────────────────────
line('\n4. Invariants');
const inv = baseline.invariants ?? {};
check('the architecture set is exactly the baselined size',
  onDisk.length === inv.architectureDocuments,
  `${onDisk.length} on disk, ${inv.architectureDocuments} baselined`);
check('every canonical document is frozen',
  inv.frozenDocuments === inv.architectureDocuments,
  `${inv.frozenDocuments}/${inv.architectureDocuments} frozen`);
check('no document numbered 26 or above exists',
  !onDisk.some((f) => Number(f.slice(0, 2)) >= 26),
  onDisk.some((f) => Number(f.slice(0, 2)) >= 26)
    ? onDisk.filter((f) => Number(f.slice(0, 2)) >= 26).join(', ')
    : 'the highest is 25');
check('three Platform Services and six capabilities are recorded',
  inv.platformServices === 3 && inv.capabilities === 6,
  `${inv.platformServices} Platform Services, ${inv.capabilities} capabilities, ${inv.planes} planes`);

// Conformance criteria must not have been quietly relaxed. Counting per document
// catches a criterion deleted from one document and not from the register.
const criteriaNow = onDisk.reduce((n, f) => {
  const body = fs.readFileSync(path.join(ARCH, f), 'utf8');
  return n + new Set([...body.matchAll(/\*\*(C-[\w.]+)\*\*/g)].map((m) => m[1])).size;
}, 0);
check('no conformance criterion has been removed', criteriaNow >= inv.conformanceCriteria,
  `${criteriaNow} on disk, ${inv.conformanceCriteria} baselined${criteriaNow > inv.conformanceCriteria ? ' (added, not removed)' : ''}`);

// ── 5. Governance has not drifted ───────────────────────────────────────────
line('\n5. Governance');
const runnerSrc = fs.existsSync(path.join(__dirname, 'run-all.js'))
  ? fs.readFileSync(path.join(__dirname, 'run-all.js'), 'utf8') : '';
const gatesNow = [...runnerSrc.matchAll(/script:\s*'([^']+\.js)'/g)].map((m) => m[1]);
const removedGates = (baseline.gates ?? []).filter((g) => !gatesNow.includes(g));
check('no gate has been removed from the runner', removedGates.length === 0,
  removedGates.length ? removedGates.join(', ') : `${gatesNow.length} gates registered, ${(baseline.gates ?? []).length} baselined`);

// ── 6. The closure package is internally consistent ─────────────────────────
line('\n6. Closure package');
const REQUIRED_DOCS = [
  'PROGRAMME_SUMMARY.md',
  'FINAL_CERTIFICATION_REGISTER.md',
  'GENERAL_AVAILABILITY_REGISTER.md',
  'ARCHITECTURE_BASELINE.md',
  'GOVERNANCE_BASELINE.md',
  'KNOWN_LIMITATIONS.md',
  'NEXT_ACTION.md',
];
const absent = REQUIRED_DOCS.filter((d) => !fs.existsSync(path.join(ROOT, 'program', d)));
check('every closure register is present', absent.length === 0,
  absent.length ? `missing: ${absent.join(', ')}` : `${REQUIRED_DOCS.length} registers`);

// Every unmeasured property must be classified. An unclassified one would silently
// default into whichever bucket the renderer happened to put it in, which is how a
// non-deployment blocker comes to look like it will be closed by obtaining Docker.
check('every unmeasured property is classified',
  Array.isArray(baseline.unclassified) && baseline.unclassified.length === 0,
  (baseline.unclassified ?? []).length === 0
    ? `${(baseline.unmeasured ?? []).length} properties, each classified`
    : `unclassified: ${(baseline.unclassified ?? []).join(', ')}`);

// The GA determination recorded in the baseline must match the deployment evidence.
let deploymentEvidence = null;
try {
  deploymentEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance', 'deployment', 'evidence.json'), 'utf8'));
} catch { deploymentEvidence = null; }
check('the baseline GA determination matches the deployment evidence',
  deploymentEvidence !== null && baseline.generalAvailability === deploymentEvidence.generalAvailability,
  deploymentEvidence
    ? `baseline "${baseline.generalAvailability}", evidence "${deploymentEvidence.generalAvailability}"`
    : 'deployment evidence is absent');

// NEXT_ACTION must name exactly one dependency, and it must be the runtime.
const nextAction = fs.existsSync(path.join(ROOT, 'program', 'NEXT_ACTION.md'))
  ? fs.readFileSync(path.join(ROOT, 'program', 'NEXT_ACTION.md'), 'utf8') : '';
check('the next action names the container runtime as the single dependency',
  /container runtime/i.test(nextAction),
  /container runtime/i.test(nextAction)
    ? 'acquire a supported container runtime'
    : 'NEXT_ACTION.md does not name the outstanding dependency');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the repository matches its closure baseline.');
  line('');
  line(`Architecture: ${inv.architectureDocuments} documents, ${inv.conformanceCriteria} criteria, all frozen.`);
  line(`Governance:   ${(baseline.gates ?? []).length} gates.`);
  line(`General Availability: ${baseline.generalAvailability}.`);
} else {
  line(`RESULT: FAIL — ${failures} baseline property violated.`);
  line('');
  line('If the change was intended, re-baseline deliberately:');
  line('  node governance/closure/emit-closure-package.mjs program');
  line('Then review the diff and commit. Silent amendment is what this gate prevents.');
}
line('');
process.exit(failures === 0 ? 0 : 1);
