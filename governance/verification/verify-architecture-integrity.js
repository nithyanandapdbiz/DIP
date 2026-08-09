'use strict';
/**
 * GOVERNANCE — architecture document integrity.
 * ============================================================================
 * The canonical architecture is the single source of truth. This check enforces
 * the properties that make that claim true, mechanically, on every commit:
 *
 *   1. Every document declares Status, Version, Date and Milestone.
 *   2. Every document declares what it OWNS and what it DOES NOT OWN.
 *      This is the anti-duplication contract: a document that does not state its
 *      boundary cannot be checked for overstepping it.
 *   3. Every document carries CONFORMANCE CRITERIA. Per ARCHITECTURE_STATUS.md
 *      these are mandatory — a document without them cannot be certified against
 *      and is not eligible for CANONICAL status.
 *   4. Every cross-reference resolves to an existing document, or to one listed
 *      in the canonical set (a scheduled forward reference).
 *   5. No document number is used twice.
 *
 * Read-only. No writes, no network.
 *
 * Run:  node governance/verification/verify-architecture-integrity.js
 * Exit: 0 = all properties hold   1 = at least one violation
 */
const fs = require('fs');
const path = require('path');

const ARCH = path.join(__dirname, '..', '..', 'docs', 'architecture');
const STATUS = path.join(__dirname, '..', '..', 'program', 'ARCHITECTURE_STATUS.md');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — architecture document integrity');
line('='.repeat(74));

const docs = fs.readdirSync(ARCH).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();
if (docs.length === 0) {
  line('\n  FAIL  no architecture documents found');
  line('');
  process.exit(1);
}

// The canonical set: every document number the programme has planned. A forward
// reference is legitimate only if its target is planned, not merely plausible.
const statusSrc = fs.readFileSync(STATUS, 'utf8');
const plannedNumbers = new Set(
  (statusSrc.match(/^\|\s*(\d\d)\s*\|/gm) || []).map((m) => m.replace(/\D/g, ''))
);

line(`\n1. Document set (${docs.length} present, ${plannedNumbers.size} planned)`);
for (const d of docs) line(`   ${d}`);

// ── 2. Required header fields ───────────────────────────────────────────────
line('\n2. Required headers');
const missingHeader = [];
for (const d of docs) {
  const src = fs.readFileSync(path.join(ARCH, d), 'utf8').slice(0, 1200);
  const has = /\*\*Status:\*\*/.test(src) && /\*\*Version:\*\*/.test(src)
    && /\*\*Date:\*\*/.test(src) && /\*\*Milestone:\*\*/.test(src);
  if (!has) missingHeader.push(d);
}
check('every document declares Status, Version, Date and Milestone',
  missingHeader.length === 0, missingHeader.join(', ') || `${docs.length} documents`);

// ── 3. Ownership boundary — the anti-duplication contract ───────────────────
line('\n3. Ownership boundary');
const missingOwnership = [];
for (const d of docs) {
  const src = fs.readFileSync(path.join(ARCH, d), 'utf8');
  // The Constitution is the root authority and owns everything it states; it is
  // the one document with no "does not own" boundary to declare.
  if (d.startsWith('01-')) continue;
  if (!/\*\*This document owns:\*\*/.test(src) || !/\*\*It does not own:\*\*/.test(src)) {
    missingOwnership.push(d);
  }
}
check('every document declares what it owns and does not own',
  missingOwnership.length === 0,
  missingOwnership.join(', ') || 'boundaries declared — overstep is checkable');

// ── 4. Conformance criteria are mandatory ───────────────────────────────────
line('\n4. Conformance criteria');
const missingConformance = [];
for (const d of docs) {
  const src = fs.readFileSync(path.join(ARCH, d), 'utf8');
  const hasSection = /##\s+\d+\.\s+Conformance criteria/i.test(src);
  const hasIds = /\*\*C-[\w.]+\*\*/.test(src);
  if (!(hasSection && hasIds)) missingConformance.push(d);
}
check('every document carries conformance criteria with identifiers',
  missingConformance.length === 0,
  missingConformance.join(', ') || 'all documents are certifiable against');

// ── 5. Cross-reference integrity ────────────────────────────────────────────
line('\n5. Cross-reference integrity');
const broken = [];
for (const d of docs) {
  const src = fs.readFileSync(path.join(ARCH, d), 'utf8');
  const refs = [...src.matchAll(/\]\((\d\d-[a-z0-9-]+\.md)\)/g)].map((m) => m[1]);
  for (const r of new Set(refs)) {
    if (fs.existsSync(path.join(ARCH, r))) continue;          // exists
    if (plannedNumbers.has(r.slice(0, 2))) continue;           // scheduled
    broken.push(`${d} -> ${r}`);
  }
}
check('every cross-reference resolves to an existing or planned document',
  broken.length === 0, broken.join('; ') || 'no dangling references');

// ── 6. Number uniqueness ────────────────────────────────────────────────────
line('\n6. Number uniqueness');
const byNumber = new Map();
for (const d of docs) {
  const n = d.slice(0, 2);
  if (!byNumber.has(n)) byNumber.set(n, []);
  byNumber.get(n).push(d);
}
const dupes = [...byNumber.entries()].filter(([, v]) => v.length > 1);
check('no document number is used twice', dupes.length === 0,
  dupes.map(([n, v]) => `${n}: ${v.join(' + ')}`).join('; ') || 'one topic, one number');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the architecture set is internally consistent and certifiable.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
