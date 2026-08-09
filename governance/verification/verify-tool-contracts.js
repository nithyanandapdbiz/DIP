#!/usr/bin/env node
'use strict';
/**
 * TOOL CONTRACTS — every declared SPI name RESOLVES to an SPI that exists.
 * ============================================================================
 * TRACEABILITY
 *   ADR    : ADR-0076 §4.2 (ruling 2) — item 9 REPLACED, see below
 *   Debt   : TECHNICAL_DEBT.md D-058 (the three phantom contracts) · D-071 (why a gate)
 *   Rules  : D-012 (declaration and enforcement are one change) · D-018 (structural first)
 *
 * WHY THIS IS A GATE AND NOT A TYPE — §2.1's FIRST LIMIT.
 *
 * ADR-0076 §4.2 item 9 ruled that `AgentDefinition.toolContracts` be narrowed from
 * `readonly string[]` to a union of declared SPI names sourced from
 * `CONNECTOR_SPI_DESCRIPTORS`. Measured before landing: that registry holds THREE
 * descriptors, the framework exports NINE adapter interfaces, and ELEVEN distinct names are
 * in live use — five framework SPIs plus `SecurityAdapter` (14 declarations),
 * `LoadGeneratorAdapter` (3) and `MonitoringAdapter` (1), which are owned by capabilities.
 *
 * **RULED: THE SPI NAMESPACE IS OPEN. The framework does not own it.** A union sourced from
 * a framework registry cannot express a namespace the framework does not own. Closing it to
 * the nine would exclude the capability-owned SPIs — P-004's bespoke-capability-architecture
 * pressure arriving through a type. Widening the framework to carry them would make the
 * framework declare knowledge of five capabilities' tool surfaces, which is the same
 * violation from the other side.
 *
 * So the check changes shape without changing its subject:
 *
 *     NOT  "is this name in a closed list the framework owns"
 *     BUT  "does this name RESOLVE to an SPI interface that exists"
 *
 * This is §2.1's principle in the only form available here, and it is **the first place in
 * ADR-0076 where D-012's PREFERRED form is unavailable**: *make an unenforced field
 * unrepresentable* has no implementation where the valid set is not owned by the type's own
 * package. D-012 already names the fallback — enforcement in the same change as the
 * declaration — and a gate is that fallback. Recorded rather than worked around, because a
 * limit found while applying a rule is worth more than the rule restated.
 *
 * It catches the three phantoms (`CustomerFindingStore`, `EvidenceCustody`,
 * `TargetConnectivity`) on the grounds ADR-0076 §4.2 item 8 already names — wrong under
 * EVERY reading of the field — **without asserting framework ownership of the namespace.**
 *
 * Run:  node governance/verification/verify-tool-contracts.js
 * Exit: 0 = every declared contract resolves   1 = at least one names nothing
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures += 1;
};

/** Every `.ts` under a package's `src`, excluding build output. */
function sources(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') sources(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = fs.readdirSync(PACKAGES)
  .flatMap((p) => sources(path.join(PACKAGES, p, 'src')));

// ── The resolvable set: every exported interface or type alias, wherever it lives ────
//
// DELIBERATELY NOT RESTRICTED TO THE FRAMEWORK. That restriction is the ruling this gate
// exists because of: the namespace is open, so a capability's own SPI is as valid a target
// as `@dbiz/capability-framework`'s. What is NOT valid is a name that resolves nowhere.
const declared = new Map();
/** Members declared on each interface, so an `Spi.operation` contract can be resolved too. */
const members = new Map();
/**
 * Extract each declaration's body by COUNTING BRACES from its opening `{`.
 *
 * A non-greedy `[\s\S]*?^\}` block regex was the first form and silently swallowed
 * declarations that followed one containing a brace at column 0 — `ProjectAdapter` and
 * `MonitoringAdapter` both reported as naming no type while both plainly exist. A parser
 * that under-reports what EXISTS makes this gate accuse correct code, which is worse than
 * the drift it was built to find. Counting is exact and does not depend on formatting.
 */
function bodyAt(body, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(openIndex + 1, i);
    }
  }
  return '';
}

for (const file of files) {
  const body = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  for (const m of body.matchAll(/^\s*export\s+(?:interface|type)\s+([A-Za-z][A-Za-z0-9_]*)/gm)) {
    const name = m[1];
    if (!declared.has(name)) declared.set(name, rel);
    const brace = body.indexOf('{', m.index + m[0].length);
    const nextLine = body.indexOf('\n', m.index + m[0].length);
    // Only treat it as a body if the `{` belongs to THIS declaration — a single-line
    // `export type X = 'a' | 'b';` has no body and must not borrow the next one's.
    if (brace === -1 || (nextLine !== -1 && brace > nextLine)) continue;
    const own = members.get(name) ?? new Set();
    for (const member of bodyAt(body, brace).matchAll(/(?:^|\n)\s*(?:readonly\s+)?([a-z][A-Za-z0-9_]*)\s*[(<?:]/g)) {
      own.add(member[1]);
    }
    members.set(name, own);
  }
}

/**
 * TWO DECLARATION FORMS ARE IN LIVE USE, and the first version of this gate saw only one.
 * `TestManagementAdapter` names the SPI; `TestManagementAdapter.createContainer` names one
 * OPERATION on it. Flagging the second form as unresolved was a false positive on 19 sites —
 * a check more restrictive than the relation it stands for, which is the shape this ADR is
 * about, in the gate written to enforce it. Caught by running it.
 *
 * Resolving the qualified form is also STRICTER than resolving the bare one: it verifies the
 * operation exists, so `WorkItemAdapter.nounFor` is checked against `WorkItemAdapter`'s
 * actual members rather than merely against the interface's existence.
 */
function resolve(name) {
  if (declared.has(name)) return { ok: true, where: declared.get(name) };
  const dot = name.indexOf('.');
  if (dot === -1) return { ok: false, why: 'names no exported interface or type' };
  const spi = name.slice(0, dot);
  const op = name.slice(dot + 1);
  if (!declared.has(spi)) return { ok: false, why: `names no exported interface "${spi}"` };
  if (!(members.get(spi) ?? new Set()).has(op)) {
    return { ok: false, why: `"${spi}" declares no operation "${op}"` };
  }
  return { ok: true, where: `${declared.get(spi)} (operation)` };
}

// ── Every declared toolContracts value, with its site ───────────────────────
const declarations = [];
for (const file of files) {
  const body = fs.readFileSync(file, 'utf8');
  for (const m of body.matchAll(/toolContracts:\s*\[([^\]]*)\]/g)) {
    const lineNo = body.slice(0, m.index).split('\n').length;
    for (const n of m[1].matchAll(/'([^']+)'/g)) {
      declarations.push({ name: n[1], at: `${path.relative(ROOT, file).replace(/\\/g, '/')}:${lineNo}` });
    }
  }
}

line('');
line('GOVERNANCE — tool contracts: every declared SPI name resolves to an SPI that exists');
line('='.repeat(78));
line('');
line('  THE NAMESPACE IS OPEN (ADR-0076 §4.2 as ruled, D-071). This checks RESOLUTION, not');
line('  membership of a framework-owned list — a capability\'s own SPI is a valid target.');

// ── 1. Something is declared, so the gate has a subject ─────────────────────
line('\n1. Declarations exist to check');
const distinct = [...new Set(declarations.map((d) => d.name))].sort();
check('at least one toolContracts declaration was found', declarations.length > 0,
  `${declarations.length} declaration(s), ${distinct.length} distinct name(s)`);

// ── 2. Every declared name resolves ─────────────────────────────────────────
line('\n2. Every declared contract names an SPI that exists');
const unresolved = declarations.filter((d) => !resolve(d.name).ok);
const unresolvedNames = [...new Set(unresolved.map((d) => d.name))].sort();
check('every toolContracts entry resolves to an exported interface, type or operation',
  unresolved.length === 0,
  unresolved.length > 0
    ? `${unresolvedNames.map((n) => `${n} (${resolve(n).why})`).join('; ')} — at ${unresolved.map((d) => d.at).join(', ')}`
    : `${distinct.length} distinct contract(s), all resolving`);

// ── 3. What resolved, for the record ────────────────────────────────────────
line('\n3. The resolved namespace, as measured');
for (const name of distinct) {
  const r = resolve(name);
  const count = declarations.filter((d) => d.name === name).length;
  line(`         ${r.ok ? 'resolves' : 'MISSING '}  ${name} (${count})${r.ok ? ` -> ${r.where}` : ` — ${r.why}`}`);
}

line('');
line('='.repeat(78));
if (failures === 0) {
  line('RESULT: PASS — every declared tool contract names an SPI that exists.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
  line('');
  line('  A contract naming no type is wrong under EVERY reading of the field (ADR-0076 §4.2');
  line('  item 8) and is NOT excused by the dependency ruling. What each site should declare');
  line('  instead is the owning capability\'s decision — UNDECIDED, per §4.4.');
}
line('');
process.exit(failures === 0 ? 0 : 1);
