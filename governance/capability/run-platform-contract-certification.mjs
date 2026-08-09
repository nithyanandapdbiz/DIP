// GOVERNANCE SCENARIO — platform contract certification (ADR-0040).
// ============================================================================
// Measures the canonical platform contract layer and emits what it observed. It
// asserts nothing; the verify-platform-contract-framework.js gate reads these
// observations and fails on any property that did not hold (R-13.1).
//
// WHAT IT MEASURES.
//   1. The registry is well-formed and complete (every contract has the required
//      registry fields; ADR-0040 §4.3).
//   2. Each contract's certification state — PASS / PARTIAL / FAIL / NOT
//      IMPLEMENTED / UNKNOWN — is MEASURED from executed evidence: does the
//      canonical source export the declared symbol(s)?
//   3. No contract OVER-CLAIMS: a contract `expected` implemented/partial but
//      measured NOT IMPLEMENTED is a fault (the teeth + the fault-proof target).
//   4. The dependency graph is acyclic (cycle detection) and every edge resolves.
//   5. Versioning is present and the version authority contract exists.
//
// It builds NO business logic. It reads source files and reports.
//
// Run:  node governance/capability/run-platform-contract-certification.mjs  → JSON on stdout
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_CONTRACTS, CERT_STATES, STABILITY_LEVELS, MATURITY_LEVELS, CAPABILITY_PACKAGE } from './platform-contract-registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

const REQUIRED_FIELDS = ['id', 'title', 'owner', 'version', 'canonicalSource', 'dependsOn', 'expected', 'verificationRule'];
const EXPECTED_STATES = new Set(['implemented', 'partial', 'pending']);

// A symbol is "exported" when the source file declares it as an export. Deterministic
// static introspection — no build, no execution of capability code.
function exportsSymbol(file, symbol) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return false;
  const src = fs.readFileSync(abs, 'utf8');
  const re = new RegExp(`export\\s+(?:type\\s+|interface\\s+|const\\s+|class\\s+|function\\s+|enum\\s+)?\\{?[^\\n]*\\b${symbol}\\b`);
  return re.test(src);
}

// Measure a contract's certification state from its verification rule.
function measureState(contract) {
  const { file, requires, anyOf } = contract.verificationRule;
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return { state: 'NOT IMPLEMENTED', present: 0, total: requires.length };
  const present = requires.filter((s) => exportsSymbol(file, s)).length;
  if (present === requires.length) return { state: 'PASS', present, total: requires.length };
  if (present > 0) return { state: 'PARTIAL', present, total: requires.length };
  return { state: 'NOT IMPLEMENTED', present, total: requires.length };
}

// ── Measurement ─────────────────────────────────────────────────────────────
const measured = PLATFORM_CONTRACTS.map((c) => ({ contract: c, ...measureState(c) }));
const byId = new Map(measured.map((m) => [m.contract.id, m]));

// ── CT-1 · registry well-formed ─────────────────────────────────────────────
const malformed = PLATFORM_CONTRACTS.filter((c) =>
  REQUIRED_FIELDS.some((f) => c[f] === undefined || c[f] === null || (typeof c[f] === 'string' && c[f].length === 0))
  || !Array.isArray(c.dependsOn)
  || !EXPECTED_STATES.has(c.expected)
  || typeof c.verificationRule !== 'object'
  || !Array.isArray(c.verificationRule.requires));

// ── CT-2 · every measured state is a valid certification state ───────────────
const invalidState = measured.filter((m) => !CERT_STATES.includes(m.state));

// ── CT-3 · no contract over-claims ──────────────────────────────────────────
// expected implemented -> must measure PASS; expected partial -> PASS or PARTIAL.
const overClaims = [];
for (const m of measured) {
  const exp = m.contract.expected;
  if (exp === 'implemented' && m.state !== 'PASS') overClaims.push(`${m.contract.id} expected implemented but measured ${m.state}`);
  if (exp === 'partial' && !(m.state === 'PASS' || m.state === 'PARTIAL')) overClaims.push(`${m.contract.id} expected partial but measured ${m.state}`);
}

// ── CT-4 · dependency graph resolves and is acyclic ─────────────────────────
const danglingEdges = [];
for (const c of PLATFORM_CONTRACTS) {
  for (const dep of c.dependsOn) if (!byId.has(dep)) danglingEdges.push(`${c.id}->${dep}`);
}
// Cycle detection (DFS colouring).
const WHITE = 0, GREY = 1, BLACK = 2;
const colour = new Map(PLATFORM_CONTRACTS.map((c) => [c.id, WHITE]));
const cycles = [];
function visit(id, stack) {
  colour.set(id, GREY);
  for (const dep of (byId.get(id)?.contract.dependsOn || [])) {
    if (!byId.has(dep)) continue;
    if (colour.get(dep) === GREY) cycles.push(`${[...stack, id, dep].join(' -> ')}`);
    else if (colour.get(dep) === WHITE) visit(dep, [...stack, id]);
  }
  colour.set(id, BLACK);
}
for (const c of PLATFORM_CONTRACTS) if (colour.get(c.id) === WHITE) visit(c.id, []);

// ── CT-5 · versioning present + version authority exists ────────────────────
const unversioned = PLATFORM_CONTRACTS.filter((c) => !/^\d+\.\d+\.\d+$/.test(c.version));
const versionAuthority = byId.get('PCT-VERSION');
const versioningSound = unversioned.length === 0 && versionAuthority && versionAuthority.state === 'PASS';

// ── CT-6 · no duplicate canonical definition, no duplicate ownership (G-1/G-12) ─
const dupFindings = [];
const seenId = new Set();
for (const c of PLATFORM_CONTRACTS) {
  if (seenId.has(c.id)) dupFindings.push(`duplicate id ${c.id}`);
  seenId.add(c.id);
}
// Two contracts declaring the SAME (file, primary required symbol) are the same
// concept defined twice — an architectural violation (G-1). The connector-SPI
// family legitimately shares files with no other contract, so key on file+symbol.
const defKey = new Map();
for (const c of PLATFORM_CONTRACTS) {
  const primary = (c.verificationRule.requires || [])[0] || '';
  const key = `${c.verificationRule.file}#${primary}`;
  if (defKey.has(key)) dupFindings.push(`concept "${key}" defined by ${defKey.get(key)} and ${c.id}`);
  else defKey.set(key, c.id);
}

// ── CT-7 · governance fields present + valid + capability-neutral (G-2/G-3/G-13/G-16) ─
const govFindings = [];
for (const c of PLATFORM_CONTRACTS) {
  if (!STABILITY_LEVELS.includes(c.stability)) govFindings.push(`${c.id} invalid stability "${c.stability}"`);
  if (!MATURITY_LEVELS.includes(c.maturity)) govFindings.push(`${c.id} invalid maturity "${c.maturity}"`);
  if (typeof c.owner !== 'string' || !c.owner.startsWith('@dbiz/')) govFindings.push(`${c.id} owner "${c.owner}" is not a shared package`);
  if (CAPABILITY_PACKAGE.test(c.owner)) govFindings.push(`${c.id} owned by a capability (G-16 violation): ${c.owner}`);
  // A contract cannot be matured to certified/implemented while measured NOT IMPLEMENTED (G-13).
  const st = byId.get(c.id).state;
  if ((c.maturity === 'certified' || c.maturity === 'implemented') && st === 'NOT IMPLEMENTED') {
    govFindings.push(`${c.id} maturity ${c.maturity} but measured NOT IMPLEMENTED (G-13)`);
  }
}

const tally = (s) => measured.filter((m) => m.state === s).length;

const properties = [
  { id: 'CT-1', property: 'the platform-contract registry is well-formed (every contract carries id/owner/version/canonicalSource/dependsOn/verificationRule)',
    observed: malformed.length === 0,
    detail: malformed.length ? `${malformed.length} malformed: ${malformed.map((c) => c.id).join(', ')}` : `${PLATFORM_CONTRACTS.length} contracts well-formed` },
  { id: 'CT-2', property: 'every contract resolves to one of the five certification states (PASS/PARTIAL/FAIL/NOT IMPLEMENTED/UNKNOWN) from measured evidence',
    observed: invalidState.length === 0,
    detail: invalidState.length ? `${invalidState.length} invalid` : `${tally('PASS')} PASS · ${tally('PARTIAL')} PARTIAL · ${tally('NOT IMPLEMENTED')} NOT IMPLEMENTED` },
  { id: 'CT-3', property: 'no contract over-claims its state — an expected-implemented contract that is not built is a fault',
    observed: overClaims.length === 0,
    detail: overClaims.length ? overClaims.join('; ') : 'measured state matches the declared expectation for every contract' },
  { id: 'CT-4', property: 'the dependency graph resolves (no dangling edge) and is acyclic',
    observed: danglingEdges.length === 0 && cycles.length === 0,
    detail: (danglingEdges.length || cycles.length) ? `${danglingEdges.length ? 'dangling ' + danglingEdges.join(',') + '; ' : ''}${cycles.length ? 'cycle ' + cycles.join(' | ') : ''}` : `${PLATFORM_CONTRACTS.length} nodes, no cycle, all edges resolve` },
  { id: 'CT-5', property: 'every contract is versioned and the version authority contract exists (backward compatibility measurable)',
    observed: versioningSound,
    detail: versioningSound ? 'all contracts semver-tagged; PCT-VERSION authority present' : `${unversioned.length} unversioned; version authority ${versionAuthority ? versionAuthority.state : 'absent'}` },
  { id: 'CT-6', property: 'no duplicate contract definition and no duplicate ownership — each concept is canonical (G-1/G-12)',
    observed: dupFindings.length === 0,
    detail: dupFindings.length ? dupFindings.join('; ') : `${PLATFORM_CONTRACTS.length} contracts, each a single canonical definition` },
  { id: 'CT-7', property: 'every contract declares valid governance fields (owner/stability/maturity) and is capability-neutral (G-2/G-3/G-13/G-16)',
    observed: govFindings.length === 0,
    detail: govFindings.length ? govFindings.join('; ') : 'all contracts owned by a shared package with valid stability + maturity' },
];

process.stdout.write(JSON.stringify({
  scenario: 'platform-contract-certification',
  principle: 'ADR-0040 §4.3',
  census: {
    contracts: PLATFORM_CONTRACTS.length,
    pass: tally('PASS'),
    partial: tally('PARTIAL'),
    notImplemented: tally('NOT IMPLEMENTED'),
    fail: tally('FAIL'),
    unknown: tally('UNKNOWN'),
    dependencyEdges: PLATFORM_CONTRACTS.reduce((n, c) => n + c.dependsOn.length, 0),
    cyclesDetected: cycles.length,
    danglingEdges: danglingEdges.length,
  },
  contractStates: measured.map((m) => ({ id: m.contract.id, title: m.contract.title, owner: m.contract.owner, version: m.contract.version, state: m.state, symbols: `${m.present}/${m.total}` })),
  properties,
}, null, 2));
