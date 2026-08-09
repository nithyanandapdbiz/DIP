'use strict';
/**
 * GOVERNANCE — change control completeness.
 * ============================================================================
 * After the freeze, an architecture change requires an ADR carrying impact analysis
 * and a migration strategy (R-18.26). An ADR declares its **affected components** —
 * but nothing verified that those components were actually modified.
 *
 * That gap was found in this programme's own work: ADR-0017 listed CHARTER.md §5a
 * as affected, and the charter continued to declare the superseded runtime for two
 * commits. **An ADR whose affected components were never touched is an assertion
 * that a change happened** — which R-13.1 forbids.
 *
 * This check enforces:
 *
 *   1. Every ADR declares affected components.
 *   2. Every file path named as affected EXISTS.
 *   3. Every ADR declaring a component "New" — that component exists.
 *   4. Every ADR is referenced by at least one architecture document or by another
 *      ADR, so an accepted decision cannot sit unconnected to the estate.
 *
 * Property 3 is the one that catches the real failure: an ADR can promise a new gate,
 * a new document or a new module, be accepted, and the artefact never appear.
 *
 * Read-only.
 *
 * Run:  node governance/verification/verify-change-control-completeness.js
 * Exit: 0 = change control is complete   1 = at least one violation
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ADR_DIR = path.join(ROOT, 'docs', 'adr');
const ARCH_DIR = path.join(ROOT, 'docs', 'architecture');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — change control completeness');
line('='.repeat(74));

const adrs = fs.existsSync(ADR_DIR)
  ? fs.readdirSync(ADR_DIR).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)).sort()
  : [];

line(`\n1. ADR set (${adrs.length})`);
check('at least one ADR exists', adrs.length > 0);

/** Extract the "Affected components" section of an ADR. */
function affectedSection(body) {
  const m = /##\s*8\.\s*Affected components\s*([\s\S]*)$/i.exec(body);
  return m?.[1] ?? '';
}

/**
 * File paths named inside the affected-components section.
 *
 * Matches backtick-quoted paths and markdown links to repository files. Prose
 * references such as "both plane build pipelines" are deliberately NOT matched:
 * flagging them would train reviewers to ignore this check, and a control that
 * cries wolf is worse than no control.
 */
function namedPaths(section) {
  const out = new Set();
  for (const m of section.matchAll(/`([^`\n]+\.(?:md|js|ts|json|ya?ml))`/g)) out.add(m[1]);
  for (const m of section.matchAll(/\]\((\.\.\/[^)\s]+\.md)\)/g)) out.add(m[1]);
  return [...out];
}

/** Resolve a path as written in an ADR (relative to docs/adr) or from repo root. */
function resolveNamed(p) {
  const cleaned = p.replace(/^\.\//, '');
  const candidates = [
    path.join(ADR_DIR, cleaned),
    path.join(ROOT, cleaned),
    path.join(ROOT, 'program', path.basename(cleaned)),
    path.join(ARCH_DIR, path.basename(cleaned)),
    path.join(ADR_DIR, path.basename(cleaned)),
    path.join(ROOT, 'governance', 'verification', path.basename(cleaned)),
  ];
  return candidates.some((c) => fs.existsSync(c));
}

// ── 2. Every ADR declares affected components ───────────────────────────────
line('\n2. Affected components declared');
const noSection = adrs.filter((a) => affectedSection(fs.readFileSync(path.join(ADR_DIR, a), 'utf8')).trim() === '');
check('every ADR declares its affected components',
  noSection.length === 0, noSection.join(', ') || `${adrs.length} ADRs declare them`);

/**
 * COMPONENTS REMOVED BY A LATER ADR, each exempted UNDER THE AUTHORITY THAT REMOVED IT.
 *
 * An ADR's "Affected components" describes the estate AT DECISION TIME. When a later ADR
 * deletes one of those components, the earlier ADR does not become wrong — it becomes
 * HISTORY, which is CHARTER §200's third class and the one that needs no rewrite. Without
 * this, the only ways to keep the gate green would be to edit history (destroying the record
 * of what the decision touched) or to delete the ADRs (destroying it outright).
 *
 * THIS IS AN EXEMPTION, NOT A SKIP, AND THE DIFFERENCE IS THE WHOLE DESIGN:
 *   - every exemption NAMES the ADR that authorised the removal — an unattributed entry is
 *     indistinguishable from a path someone could not be bothered to fix;
 *   - exempted paths are COUNTED AND PRINTED on every run, so the exemption stays visible
 *     rather than becoming a quiet hole in the property;
 *   - an entry whose authorising ADR does not exist FAILS THE GATE (below), so this table
 *     cannot be used to wave through an arbitrary path;
 *   - the property is UNCHANGED for every path not matched here.
 *
 * §17.1.1's question, asked of this gate: if the removed capability came back, these prefixes
 * would resolve again and the exemption would simply stop matching. It detects nothing less
 * than it did before for anything that still exists.
 */
const REMOVED_BY_ADR = [
  { adr: 'ADR-0087-functional-testing-capability-removal.md', prefixes: [
    'packages/functional-testing-engine/',
    'governance/functional-workflow/',
    '.github/workflows/functional-workflow-governance.yml',
  ], gates: [
    'verify-functional-completeness.js', 'verify-intent-conservation.js', 'verify-automation-executable.js',
    'verify-repository-handoff.js', 'verify-automation-architecture.js', 'verify-functional-workflow-substructure.js',
    'verify-domain-stage-ref.js', 'verify-capability-certification-framework.js', 'verify-capability-conformance.js',
    'verify-execution-contract.js', 'verify-package-governance.js', 'verify-reasoning-registry.js',
    'verify-tenant-resolution-domain.js', 'verify-application-strategy-domain.js',
    'verify-observation-interpretation-domain.js', 'verify-story-intelligence-domain.js',
    'verify-test-design-domain.js', 'verify-repository-intelligence-domain.js', 'verify-test-management-domain.js',
    'verify-automation-intelligence-domain.js', 'verify-automation-architecture-domain.js',
    'verify-execution-domain.js', 'verify-healing-domain.js', 'verify-defect-management-domain.js',
    'verify-synchronisation-domain.js', 'verify-executive-reporting-domain.js', 'verify-capability-activation.js',
    'verify-production-qualification.js', 'verify-legacy-retirement-readiness.js',
    'verify-canonical-runtime-integration.js', 'verify-runtime-cutover-readiness.js', 'verify-runtime-enablement.js',
  ], evidence: [
    'functional-evidence.json', 'authoring-equivalence-evidence.json', 'automation-executable-evidence.json',
    'automation-architecture-evidence.json', 'automation-intelligence-evidence.json',
    'application-strategy-evidence.json', 'canonical-runtime-integration-evidence.json',
    'capability-activation-evidence.json', 'capability-certification-framework-evidence.json',
    'defect-management-evidence.json', 'execution-evidence.json', 'executive-reporting-evidence.json',
    'healing-evidence.json', 'intent-conservation-evidence.json', 'legacy-retirement-readiness-evidence.json',
    'observation-interpretation-evidence.json', 'production-qualification-evidence.json',
    'repository-intelligence-domain-evidence.json', 'runtime-cutover-readiness-evidence.json',
    'runtime-enablement-evidence.json', 'story-intelligence-evidence.json', 'synchronisation-evidence.json',
    'tenant-resolution-evidence.json', 'test-design-evidence.json', 'test-management-evidence.json',
    'retirement-inventory.json', 'domain-activation-ledger.json',
  ] },
];

/** The authorising ADR for a removed path, or null if this path is not exempt. */
function removedBy(p) {
  const cleaned = p.replace(/^\.\//, '');
  const base = path.basename(cleaned);
  for (const entry of REMOVED_BY_ADR) {
    if (entry.prefixes.some((pre) => cleaned.startsWith(pre) || cleaned === pre)) return entry.adr;
    if (entry.gates.includes(base) || entry.evidence.includes(base)) return entry.adr;
  }
  return null;
}

// An exemption whose authorising ADR is absent would let this table wave through anything.
const danglingAuthority = REMOVED_BY_ADR.filter((e) => !fs.existsSync(path.join(ADR_DIR, e.adr)));

// ── 3. Named paths exist ────────────────────────────────────────────────────
line('\n3. Named components exist');
const missing = [];
const newPromised = [];
const exempt = [];
for (const a of adrs) {
  const body = fs.readFileSync(path.join(ADR_DIR, a), 'utf8');
  const section = affectedSection(body);
  for (const p of namedPaths(section)) {
    if (resolveNamed(p)) continue;
    const authority = removedBy(p);
    if (authority) { exempt.push(`${a} -> ${p} (removed by ${authority})`); continue; }
    missing.push(`${a} -> ${p}`);
  }
  // A component declared "New" must now exist — an ADR promising an artefact that
  // never appeared is a decision recorded as done and never performed.
  for (const m of section.matchAll(/`([^`\n]+\.(?:md|js|ts|json|ya?ml))`[^\n|]*\*\*New\*\*/g)) {
    const p = m[1];
    if (resolveNamed(p) || removedBy(p)) continue;
    newPromised.push(`${a} -> ${p}`);
  }
}
check('every removal exemption names an ADR that exists', danglingAuthority.length === 0,
  danglingAuthority.map((e) => e.adr).join(', ') || `${REMOVED_BY_ADR.length} removal authority declared`);
check('every named affected component exists, or was removed by a named ADR', missing.length === 0,
  missing.join('; ') || `all named components resolve${exempt.length ? `; ${exempt.length} exempt as removed` : ''}`);
if (exempt.length) {
  line(`         exempt (component removed by a later ADR, not a broken reference):`);
  for (const e of exempt) line(`           ${e}`);
}
check('every component an ADR declares "New" now exists', newPromised.length === 0,
  newPromised.join('; ') || 'no promised artefact is absent');

// ── 4. Every ADR is connected to the estate ─────────────────────────────────
line('\n4. ADR connectivity');
// Programme state is scanned WHOLESALE rather than as a hand-listed subset. The
// first version listed files individually, omitted DECISIONS.md — which is the
// actual ADR index — and reported five connected ADRs as orphans. A check that
// cries wolf trains reviewers to ignore it, so the corpus is derived, not curated.
const PROGRAM_DIR = path.join(ROOT, 'program');
const corpus = [
  ...fs.readdirSync(ARCH_DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(ARCH_DIR, f)),
  ...adrs.map((f) => path.join(ADR_DIR, f)),
  ...(fs.existsSync(PROGRAM_DIR)
    ? fs.readdirSync(PROGRAM_DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(PROGRAM_DIR, f))
    : []),
].filter((f) => fs.existsSync(f)).map((f) => ({ f, body: fs.readFileSync(f, 'utf8') }));

const orphans = [];
for (const a of adrs) {
  const id = /^(ADR-\d{4})/.exec(a)?.[1];
  if (!id) continue;
  const referenced = corpus.some(({ f, body }) => path.basename(f) !== a && body.includes(id));
  if (!referenced) orphans.push(id);
}
check('every ADR is referenced by the architecture, another ADR, or programme state',
  orphans.length === 0,
  orphans.join(', ') || `${adrs.length} ADRs connected`);

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — every declared change was actually made.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
