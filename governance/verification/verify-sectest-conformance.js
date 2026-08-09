'use strict';
/**
 * GOVERNANCE — Security Testing Engine conformance (capability 5).
 * ============================================================================
 * Runs the capability-5 conformance scenario and rules on what it OBSERVED. The scenario
 * (`governance/capability/run-sectest-conformance.mjs`) executes the whole engine — twice
 * across two providers, once with reasoning disabled, and once with an intrusive request —
 * and reports each property. This gate asserts every property held.
 *
 * NEGATIVE DETECTION IS EMBEDDED, NOT ASSUMED. Property P-9 feeds the engine an intrusive
 * (exploitation) request and asserts it is REFUSED at the guardrail stage before any checker
 * runs. If the capability-5/6 boundary ever regressed — if an SQL-injection request reached
 * the execution stage — P-9 would be false and this gate would fail. The fault is injected by
 * the scenario and detected here, by execution.
 *
 * STANDALONE BY DESIGN. This gate is not yet registered in `run-all.js`, and it is not in
 * `proofs.json`. Registration and the closure re-baseline are a deliberate, human-reviewed
 * step (ADR-0028 §5) — the same posture ADR-0022/0023/0027 took — and are deferred while a
 * concurrent capability build shares the working tree. The gate stands as an independently
 * runnable, green verifier in the meantime.
 *
 * Run:  node governance/verification/verify-sectest-conformance.js
 * Exit: 0 = every property holds   1 = at least one property failed
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const SCENARIO = path.join(ROOT, 'governance', 'capability', 'run-sectest-conformance.mjs');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'sectest-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures += 1;
};

line('');
line('GOVERNANCE — Security Testing Engine conformance (capability 5)');
line('='.repeat(74));

const proc = spawnSync(process.execPath, [SCENARIO], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 });
if (proc.status !== 0 || !proc.stdout) {
  check('the conformance scenario ran', false, (proc.stderr || 'no output').slice(0, 300));
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the scenario did not run.');
  process.exit(1);
}

let observed;
try { observed = JSON.parse(proc.stdout); } catch (e) {
  check('the scenario emitted machine-readable output', false, e.message);
  process.exit(1);
}

if (observed.fatal) {
  check('the scenario completed without a fatal error', false, observed.fatal);
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the engine could not be exercised.');
  process.exit(1);
}

line(`\n1. Properties (${observed.properties.length})`);
for (const p of observed.properties) check(`${p.id} ${p.property}`, p.ok, p.detail);

line('\n2. Census');
const c = observed.census || {};
line(`         ${c.agents} agents (${c.domainAgents} domain + ${c.governanceAgents} governance) across ${c.domains} domains`);
line(`         ${c.executionPlaneAgents} EP / ${c.intelligencePlaneAgents} IP · ${c.deterministicAgents} deterministic / ${c.reasoningAgents} reasoning · ${c.checkers} checkers`);
line(`         ${c.domainOrchestrators} domain orchestrators + ${c.masterOrchestrators} master · ${c.stages} stages`);
if (c.intelligenceLayer) line(`         intelligence layer: ${c.intelligenceLayer.graphNodes} graph nodes / ${c.intelligenceLayer.graphEdges} edges · ${c.intelligenceLayer.enterpriseRisks} enterprise risks · certification ${c.intelligenceLayer.certificationStatus} (maturity L${c.intelligenceLayer.maturityLevel})`);
check('the catalogue meets the declared scale', (c.governanceAgents === 36) && (c.domainAgents >= 100) && (c.stages === 12));

// Record the evidence for audit (isolated file; no shared register touched).
try {
  fs.writeFileSync(EVIDENCE, JSON.stringify({ capability: 'security-testing', digest: observed.digest, properties: observed.properties, census: observed.census }, null, 2));
  line(`\n         evidence written: governance/capability/sectest-evidence.json`);
} catch { /* evidence is a convenience; the verdict stands without it */ }

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — capability 5 traverses twelve stages, the triad, both providers and INV-7; an intrusive request is refused before any checker.');
} else {
  line(`RESULT: FAIL — ${failures} property/properties did not hold.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
