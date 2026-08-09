'use strict';
/**
 * GOVERNANCE — ADR completeness and decision traceability.
 * ============================================================================
 * After the M1.6 freeze, an architecture change requires an ADR carrying impact
 * analysis and a migration strategy (R-18.26). An ADR missing those sections
 * cannot support the change control it exists to enable — a decision with no
 * recorded migration path has no baseline from which to migrate.
 *
 * This check enforces, on every commit:
 *
 *   1. Every ADR carries all eight required sections (R-18.27).
 *   2. Every ADR declares a Status and a Date.
 *   3. Every ADR that closes a decision names it explicitly.
 *   4. Every decision referenced as CLOSED in the architecture has an ADR.
 *      This is the traceability direction that actually decays: a decision can
 *      be quietly closed inside a document, and nothing would reveal it.
 *   5. No two ADRs claim to close the same decision.
 *
 * Read-only.
 *
 * Run:  node governance/verification/verify-adr-completeness.js
 * Exit: 0 = all properties hold   1 = at least one violation
 */
const fs = require('fs');
const path = require('path');

const ADR = path.join(__dirname, '..', '..', 'docs', 'adr');
const ARCH = path.join(__dirname, '..', '..', 'docs', 'architecture');

const REQUIRED = [
  'Problem', 'Context', 'Alternatives', 'Decision',
  'Consequences', 'Migration strategy', 'Version impact', 'Affected components',
];

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — ADR completeness and decision traceability');
line('='.repeat(74));

const adrs = fs.existsSync(ADR)
  ? fs.readdirSync(ADR).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)).sort()
  : [];

line(`\n1. ADR set (${adrs.length} present)`);
for (const a of adrs) line(`   ${a}`);
check('at least one ADR exists', adrs.length > 0);

// ── 2. Required sections ────────────────────────────────────────────────────
line('\n2. Required sections');
const incomplete = [];
for (const a of adrs) {
  const src = fs.readFileSync(path.join(ADR, a), 'utf8');
  const missing = REQUIRED.filter((sec) => {
    // Match "## N. Section" case-insensitively on the section name.
    const re = new RegExp(`^##\\s+\\d+\\.\\s+${sec}`, 'im');
    return !re.test(src);
  });
  if (missing.length) incomplete.push(`${a} [missing: ${missing.join(', ')}]`);
}
check('every ADR carries all eight required sections',
  incomplete.length === 0, incomplete.join('; ') || `${adrs.length} ADRs complete`);

// ── 3. Status and date ──────────────────────────────────────────────────────
line('\n3. Status and date');
const noStatus = adrs.filter((a) => {
  const head = fs.readFileSync(path.join(ADR, a), 'utf8').slice(0, 600);
  return !/\*\*Status:\*\*/.test(head) || !/\*\*Date:\*\*/.test(head);
});
check('every ADR declares a Status and a Date', noStatus.length === 0,
  noStatus.join(', ') || 'all declared');

// ── 4. Decision traceability ────────────────────────────────────────────────
line('\n4. Decision traceability');

// Decisions each ADR claims to close.
const closedByAdr = new Map();          // decision id -> [adr, ...]
for (const a of adrs) {
  const src = fs.readFileSync(path.join(ADR, a), 'utf8');
  const m = src.match(/\*\*(?:Closes|Resolves):\*\*\s*([^\n]+)/i);
  if (!m) continue;
  for (const id of m[1].match(/AD-\d+/g) || []) {
    if (!closedByAdr.has(id)) closedByAdr.set(id, []);
    closedByAdr.get(id).push(a);
  }
}
line(`   decisions closed by ADR: ${[...closedByAdr.keys()].sort().join(', ') || 'none'}`);

// Decisions the architecture declares CLOSED or Resolves.
const declaredClosed = new Set();
for (const f of fs.readdirSync(ARCH).filter((x) => x.endsWith('.md'))) {
  const src = fs.readFileSync(path.join(ARCH, f), 'utf8');
  const res = src.match(/\*\*Resolves:\*\*\s*([^\n]+)/i);
  if (res) for (const id of res[1].match(/AD-\d+/g) || []) declaredClosed.add(id);
  for (const m of src.matchAll(/\*\*(AD-\d+)\s+is\s+CLOSED\*\*/gi)) declaredClosed.add(m[1]);
}
line(`   decisions declared closed in architecture: ${[...declaredClosed].sort().join(', ') || 'none'}`);

const untraced = [...declaredClosed].filter((id) => !closedByAdr.has(id)).sort();
check('every decision closed in the architecture has an ADR',
  untraced.length === 0, untraced.length ? `no ADR for ${untraced.join(', ')}` : 'fully traced');

// ── 5. No duplicate closure ─────────────────────────────────────────────────
line('\n5. Closure uniqueness');
const dupes = [...closedByAdr.entries()].filter(([, v]) => v.length > 1);
check('no decision is closed by more than one ADR', dupes.length === 0,
  dupes.map(([id, v]) => `${id}: ${v.join(' + ')}`).join('; ') || 'one decision, one ADR');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — every decision is traceable to a complete ADR.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
