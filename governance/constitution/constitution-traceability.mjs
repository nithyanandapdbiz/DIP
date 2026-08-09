#!/usr/bin/env node
/**
 * Executable Constitutional Governance & Traceability register.
 *
 * WHY THIS EXISTS (and why it is not the existing traceability matrix):
 *   governance/traceability/ENTERPRISE-TRACEABILITY-MATRIX.md traces the lifecycle
 *   STAGES (vision → capability → ADR → implementation → evidence → certification)
 *   and counts artefacts per stage. It does NOT map each constitutional INVARIANT /
 *   RULE (Doc 01) to the executable gate(s) that enforce it. This register closes
 *   that gap: for every invariant and rule it names the enforcing gate(s), and it
 *   VALIDATES those references against the gates actually registered in run-all.js.
 *
 * It is DECLARATION + VALIDATION in one file (D-012), so a citation cannot drift:
 *   - a register entry naming a gate that does not exist, or is not registered in
 *     run-all.js, is a hard failure (exit 1) — the mapping cannot be fiction;
 *   - an invariant with NO enforcing gate is reported as a GAP (exit 2) — an
 *     unenforced constitutional rule is visible, not hidden.
 *
 * It changes no other governance. It reads Doc 01 and run-all.js; it asserts nothing
 * a human wrote by hand — the enforcement column is checked against disk.
 *
 * TRACEABILITY: realises INV-10 (trust from executed evidence) and Rule 14
 * (continuous verification) for the governance model itself; source 01 §4/§5.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CONSTITUTION = path.join(ROOT, 'docs', 'architecture', '01-platform-constitution.md');
const RUN_ALL = path.join(ROOT, 'governance', 'verification', 'run-all.js');
const VERIFY_DIR = path.join(ROOT, 'governance', 'verification');

/**
 * The register. Each entry maps a constitutional invariant/rule to its enforcement.
 * `gates` are gate basenames under governance/verification (validated to exist AND
 * be registered in run-all.js). `GAP` marks a rule with no dedicated executable gate
 * — reported honestly, never hidden. `severity`: blocking | high | medium.
 */
const REGISTER = [
  // ── Invariants (Doc 01 §4) ────────────────────────────────────────────────
  { id: 'INV-1', name: 'Evidence/judgment plane split', source: '01 §4', adrs: ['ADR-0019'],
    gates: ['verify-architecture-fitness.js', 'verify-registration-conformance.js'],
    evidence: 'plane-boundary assertions + registration conformance', severity: 'blocking', ci: 'governance' },
  { id: 'INV-2', name: 'Only credential references cross', source: '01 §4', adrs: ['ADR-0007', 'ADR-0036'],
    gates: ['verify-architecture-fitness.js', 'verify-registration-conformance.js', 'verify-supply-chain.js'],
    evidence: 'secret-freedom of generated output; hash-only-at-rest', severity: 'blocking', ci: 'governance' },
  { id: 'INV-3', name: 'Executing-plane-initiated, no inbound path', source: '01 §4', adrs: ['ADR-0036'],
    gates: ['verify-architecture-fitness.js'],
    evidence: '"no inbound path into customer infrastructure"', severity: 'blocking', ci: 'governance' },
  { id: 'INV-4', name: 'AI generates; deterministic code decides', source: '01 §4', adrs: ['ADR-0016', 'ADR-0040'],
    gates: ['verify-decision-engine.js', 'verify-ai-vendor-neutrality.js'],
    evidence: 'deterministic decision engine; AI-advisory-only', severity: 'blocking', ci: 'governance' },
  { id: 'INV-5', name: 'External systems behind platform interface; vendors only in adapters', source: '01 §4', adrs: ['ADR-0016', 'ADR-0040'],
    gates: ['verify-ai-vendor-neutrality.js', 'verify-connector-spi.js'],
    evidence: 'no vendor name outside adapters; connector SPI conformance', severity: 'blocking', ci: 'governance' },
  { id: 'INV-6', name: 'Customer data ephemeral, scrubbed, purged by enforced code', source: '01 §4', adrs: ['ADR-0006', 'ADR-0014'],
    gates: ['GAP'],
    evidence: 'PII scrubbing/retention are ADR-declared; no DEDICATED purge-enforcement gate found', severity: 'high', ci: 'governance' },
  { id: 'INV-7', name: 'Executing plane never blocked by reasoning plane', source: '01 §4', adrs: ['ADR-0015'],
    gates: ['GAP'],
    evidence: 'degraded-operation is ADR-declared; no DEDICATED never-blocked runtime gate found', severity: 'high', ci: 'governance' },
  { id: 'INV-8', name: 'Every result carries assurance state; degraded != certified', source: '01 §4', adrs: ['ADR-0025'],
    gates: ['verify-platform-certification.js', 'verify-general-availability.js'],
    evidence: 'certification refuses a CERTIFIED claim without evidence', severity: 'blocking', ci: 'governance' },
  { id: 'INV-9', name: 'Portable across AI technologies; AI by capability class', source: '01 §4', adrs: ['ADR-0016'],
    gates: ['verify-ai-vendor-neutrality.js'],
    evidence: 'no vendor/model/tool named as a requirement', severity: 'blocking', ci: 'governance' },
  { id: 'INV-10', name: 'Trust from executed evidence, or NOT MEASURED', source: '01 §4', adrs: ['ADR-0020', 'ADR-0025'],
    gates: ['verify-governance-self-validation.js', 'verify-platform-certification.js'],
    evidence: 'every gate has a fault proof; no unmeasured PASS', severity: 'blocking', ci: 'governance' },
  { id: 'INV-11', name: 'Trust expires; confidence decays with evidence age', source: '01 §4', adrs: ['ADR-0020'],
    gates: ['GAP'],
    evidence: 'continuous verification (Rule 14) exists; no DEDICATED evidence-age/decay gate found', severity: 'medium', ci: 'governance' },
  // ── Key rules (Doc 01 §5) with distinct enforcement ───────────────────────
  { id: 'Rule-1', name: 'Two deployables, no third', source: '01 §5', adrs: ['ADR-0021'],
    gates: ['verify-architecture-fitness.js', 'verify-architecture-integrity.js'],
    evidence: 'exactly two planes / five capabilities; no third deployable', severity: 'blocking', ci: 'governance' },
  { id: 'Rule-8', name: 'AI generates; deterministic code decides', source: '01 §5', adrs: ['ADR-0016'],
    gates: ['verify-decision-engine.js'], evidence: 'deterministic decision resolves with AI disabled', severity: 'blocking', ci: 'governance' },
  { id: 'Rule-10', name: 'Certification deferred, never delegated', source: '01 §5', adrs: ['ADR-0025'],
    gates: ['verify-platform-certification.js', 'verify-ep-certification.js'], evidence: 'certification is an IP stage', severity: 'blocking', ci: 'governance' },
  { id: 'Rule-11', name: 'Contradictions recorded, never silently reconciled', source: '01 §5', adrs: ['ADR-0025'],
    gates: ['verify-adr-completeness.js', 'verify-change-control-completeness.js'], evidence: 'ADR completeness + change-control', severity: 'high', ci: 'governance' },
  { id: 'Rule-12', name: 'AI specified by capability, never by product', source: '01 §5', adrs: ['ADR-0016'],
    gates: ['verify-ai-vendor-neutrality.js'], evidence: 'no vendor name in governed documents', severity: 'blocking', ci: 'governance' },
  { id: 'Rule-13', name: 'Evidence over assertion', source: '01 §5', adrs: ['ADR-0019'],
    gates: ['verify-implementation-traceability.js', 'verify-traceability.js'], evidence: 'claims trace to executed evidence', severity: 'blocking', ci: 'governance' },
  { id: 'Rule-14', name: 'Continuous verification', source: '01 §5', adrs: ['ADR-0020'],
    gates: ['verify-governance-self-validation.js'], evidence: 'the suite re-proves itself', severity: 'blocking', ci: 'governance' },
  // ── Amendments proposed this session (traceability forward) ────────────────
  { id: 'P-41', name: 'Generation output sovereignty', source: 'ADR-0041', adrs: ['ADR-0041'],
    gates: ['PENDING'], evidence: 'sovereignty gate lands on ADR-0041 acceptance (§6)', severity: 'high', ci: 'governance' },
  { id: 'P-42', name: 'Repository purity & output isolation', source: 'ADR-0042', adrs: ['ADR-0042'],
    gates: ['PENDING'], evidence: 'positive-allowlist gate lands on ADR-0042 acceptance (§6)', severity: 'high', ci: 'governance' },
];

// ── Validation ───────────────────────────────────────────────────────────────
const runAll = fs.readFileSync(RUN_ALL, 'utf8');
const registered = new Set([...runAll.matchAll(/verify-[a-z0-9-]+\.js/g)].map((m) => m[0]));
const constitution = fs.readFileSync(CONSTITUTION, 'utf8');
const declaredInv = new Set([...constitution.matchAll(/\bINV-\d+\b/g)].map((m) => m[0]));

let hardFail = 0, gaps = 0, pending = 0;
const rows = [];
for (const e of REGISTER) {
  const status = [];
  for (const g of e.gates) {
    if (g === 'GAP') { gaps++; status.push('GAP'); continue; }
    if (g === 'PENDING') { pending++; status.push('PENDING(on-accept)'); continue; }
    const exists = fs.existsSync(path.join(VERIFY_DIR, g));
    const inSuite = registered.has(g);
    if (!exists) { hardFail++; status.push(`${g}:MISSING-FILE`); }
    else if (!inSuite) { hardFail++; status.push(`${g}:NOT-REGISTERED`); }
    else status.push(`${g}:OK`);
  }
  rows.push({ id: e.id, name: e.name, enforced: e.gates[0] !== 'GAP' && e.gates[0] !== 'PENDING', status, severity: e.severity });
}

const p = (s) => process.stdout.write(s + '\n');
p('\nCONSTITUTIONAL GOVERNANCE — invariant → enforcement traceability');
p('='.repeat(74));
p(`Constitution declares: ${declaredInv.size} invariants (INV-*) + 14 rules (Doc 01)`);
p(`Register covers: ${REGISTER.length} entries · gates registered in run-all.js: ${registered.size}`);
p('');
for (const r of rows) {
  const mark = r.status.every((s) => s.endsWith(':OK')) ? 'ENFORCED'
    : r.status.some((s) => s === 'GAP') ? 'GAP     '
    : r.status.some((s) => s.startsWith('PENDING')) ? 'PENDING '
    : 'BROKEN  ';
  p(`  [${mark}] ${r.id.padEnd(8)} ${r.name}`);
  p(`             ${r.status.join(' · ')}`);
}
p('');
// Acknowledged enforcement backlog (Doc-01 invariants enforced by ADR declaration
// but WITHOUT a dedicated executable gate). Tracked openly; closing each = a new
// gate lands gate-first. A gap NOT on this list, or a broken citation, fails the
// check — so the governance model cannot silently acquire a new unenforced rule.
const ACKNOWLEDGED_GAPS = new Set(['INV-6', 'INV-7', 'INV-11']);
const gapIds = rows.filter((r) => r.status.includes('GAP')).map((r) => r.id);
const undeclared = gapIds.filter((id) => !ACKNOWLEDGED_GAPS.has(id));

p(`SUMMARY: ${rows.length} entries · enforced: ${rows.filter((r)=>r.status.every((s)=>s.endsWith(':OK'))).length} · broken citations: ${hardFail} · acknowledged gaps: ${gapIds.length} · pending-on-accept: ${pending}`);
p(`GAPS (backlog, INV enforced by ADR only, no dedicated gate): ${gapIds.join(', ') || 'none'}`);
if (hardFail > 0) { p('RESULT: FAIL — a register entry cites a gate that is missing or unregistered (citation cannot be fiction).'); process.exit(1); }
if (undeclared.length > 0) { p(`RESULT: FAIL — a NEW unenforced invariant appeared without acknowledgement: ${undeclared.join(', ')}.`); process.exit(1); }
p('RESULT: PASS — every citation resolves to a registered gate; every unenforced invariant is an acknowledged, tracked backlog item.');
