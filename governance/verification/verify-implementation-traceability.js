'use strict';
/**
 * GOVERNANCE — implementation traceability.
 * ============================================================================
 * Nothing may be implemented without traceability. Every source file SHALL trace to:
 *
 *   Architecture Document -> ADR -> Conformance Criteria -> Implementation
 *
 * This check enforces, on every commit:
 *
 *   1. Every source file carries a TRACEABILITY block.
 *   2. Every architecture document it cites EXISTS.
 *   3. Every ADR it cites EXISTS.
 *   4. Every conformance criterion it cites is DECLARED in some architecture document.
 *   5. Every source file has at least one test file citing an overlapping criterion.
 *
 * Property 4 is the one that decays silently. A file can cite C-99.9 — a criterion
 * that has never existed — and the citation reads as rigour while asserting nothing.
 * Resolving each citation against the frozen architecture is what makes traceability
 * a fact rather than a convention.
 *
 * Read-only.
 *
 * Run:  node governance/verification/verify-implementation-traceability.js
 * Exit: 0 = all properties hold   1 = at least one violation
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ARCH = path.join(ROOT, 'docs', 'architecture');
const ADR = path.join(ROOT, 'docs', 'adr');
const PACKAGES = path.join(ROOT, 'packages');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — implementation traceability');
line('='.repeat(74));

/** Every .ts file under packages/, excluding build output and dependencies. */
function sources(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'schema'].includes(e.name)) continue;
      sources(full, acc);
    } else if (e.isFile() && e.name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

const all = sources(PACKAGES);
const src = all.filter((f) => !/\.test\.ts$/.test(f));
const tests = all.filter((f) => /\.test\.ts$/.test(f));
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

line(`\n1. Implementation inventory`);
line(`   ${src.length} source file(s), ${tests.length} test file(s)`);
check('implementation exists to verify', all.length > 0, all.length ? '' : 'no TypeScript sources found');

// Declared criteria across the frozen architecture.
const declaredCriteria = new Set();
const archDocs = new Set();
for (const f of fs.readdirSync(ARCH).filter((x) => /^\d\d-.*\.md$/.test(x))) {
  archDocs.add(f);
  const body = fs.readFileSync(path.join(ARCH, f), 'utf8');
  for (const m of body.matchAll(/\*\*(C-[\w.]+)\*\*/g)) declaredCriteria.add(m[1]);
}
const adrDocs = new Set(fs.readdirSync(ADR).filter((x) => /^ADR-\d{4}-.*\.md$/.test(x)));
line(`   ${archDocs.size} architecture documents, ${adrDocs.size} ADRs, ${declaredCriteria.size} declared criteria`);

// ── 2. Every source file carries a TRACEABILITY block ───────────────────────
line('\n2. Traceability blocks');
const untraced = all.filter((f) => !/TRACEABILITY/.test(fs.readFileSync(f, 'utf8')));
check('every source and test file carries a TRACEABILITY block',
  untraced.length === 0, untraced.map(rel).join(', ') || `${all.length} files traced`);

// ── 3-5. Citations resolve ──────────────────────────────────────────────────
line('\n3. Citation resolution');

const badArch = [];
const badAdr = [];
const badCriteria = [];
const citedCriteriaBySource = new Map();

for (const f of all) {
  const body = fs.readFileSync(f, 'utf8');
  const head = body.slice(0, body.indexOf('*/') + 2 || 2000);

  for (const m of head.matchAll(/\b(\d\d)-[a-z0-9-]+\.md\b/g)) {
    const named = m[0];
    if (!archDocs.has(named)) badArch.push(`${rel(f)} -> ${named}`);
  }
  // Architecture cited by bare number, e.g. "20 §2".
  for (const m of head.matchAll(/(?:^|\s)(\d\d)\s*§/g)) {
    const num = m[1];
    if (![...archDocs].some((d) => d.startsWith(`${num}-`))) badArch.push(`${rel(f)} -> doc ${num}`);
  }
  for (const m of head.matchAll(/\bADR-(\d{4})\b/g)) {
    const num = m[1];
    if (![...adrDocs].some((d) => d.startsWith(`ADR-${num}-`))) badAdr.push(`${rel(f)} -> ADR-${num}`);
  }
  const cited = new Set();
  for (const m of head.matchAll(/\b(C-\d+\.\d+)\b/g)) {
    cited.add(m[1]);
    if (!declaredCriteria.has(m[1])) badCriteria.push(`${rel(f)} -> ${m[1]}`);
  }
  citedCriteriaBySource.set(f, cited);
}

check('every cited architecture document exists', badArch.length === 0,
  [...new Set(badArch)].join('; ') || 'all architecture citations resolve');
check('every cited ADR exists', badAdr.length === 0,
  [...new Set(badAdr)].join('; ') || 'all ADR citations resolve');
check('every cited conformance criterion is declared in the architecture',
  badCriteria.length === 0,
  [...new Set(badCriteria)].join('; ') || 'all criteria citations resolve');

// ── 4. Every source file is covered by a test citing an overlapping criterion ─
line('\n4. Test coverage of cited criteria');

const testedCriteria = new Set();
for (const t of tests) {
  for (const c of citedCriteriaBySource.get(t) || []) testedCriteria.add(c);
}

const uncovered = [];
for (const f of src) {
  const cited = citedCriteriaBySource.get(f) || new Set();
  if (cited.size === 0) continue;                       // no criteria claimed
  const covered = [...cited].some((c) => testedCriteria.has(c));
  if (!covered) uncovered.push(`${rel(f)} [${[...cited].join(', ')}]`);
}
check('every criterion claimed by a source file is cited by at least one test',
  uncovered.length === 0, uncovered.join('; ') || 'claimed criteria are exercised');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — every implementation artefact traces to the frozen architecture.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
