'use strict';
/**
 * GOVERNANCE — Canonical Platform Contract Framework (ADR-0040).
 * ============================================================================
 * ADR-0040 elevates the capability contracts to a platform-wide canonical layer:
 * one definition per concept, owned by a shared package, versioned, dependency-
 * checked, and consumed by every capability. This gate makes that layer's health
 * EXECUTABLE and EXTENDS the existing certification engine (CHARTER §4 — it does
 * not create a second one): it reads the platform-contract registry, measures each
 * contract's certification state from executed evidence (does its canonical source
 * export the declared symbol?), builds the dependency graph and detects cycles,
 * and refuses any contract that over-claims a state it has not earned.
 *
 * It is GREEN and HONEST today: the registry is well-formed, every contract's
 * state matches its measured reality (six PASS, one PARTIAL, eight NOT
 * IMPLEMENTED), the graph is acyclic, and versioning is sound. It goes RED the
 * moment a contract claims `implemented` without its canonical type on disk, or a
 * dependency cycle appears — which is the whole point.
 *
 * Read-only. No writes except its own evidence envelope.
 *
 * Run:  node governance/verification/verify-platform-contract-framework.js
 * Exit: 0 = the contract layer is sound and no state is over-claimed   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCENARIO = path.join(ROOT, 'governance', 'capability', 'run-platform-contract-certification.mjs');
const REGISTRY = path.join(ROOT, 'governance', 'capability', 'platform-contract-registry.mjs');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'platform-contract-framework-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — Canonical Platform Contract Framework (ADR-0040)');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the platform-contract registry exists', fs.existsSync(REGISTRY),
  path.relative(ROOT, REGISTRY).replace(/\\/g, '/'));
check('the certification scenario exists', fs.existsSync(SCENARIO),
  path.relative(ROOT, SCENARIO).replace(/\\/g, '/'));

if (!fs.existsSync(REGISTRY) || !fs.existsSync(SCENARIO)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the contract framework cannot be evidenced (NOT MEASURED is FAIL, R-13.3).');
  line('');
  process.exit(1);
}

// ── 2. Execute the certification scenario ───────────────────────────────────
line('\n2. Scenario execution');
const run = spawnSync(process.execPath, [SCENARIO],
  { cwd: ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });

let observed = null;
if (run.status !== 0) {
  check('the scenario executed', false, `exit ${run.status}: ${(run.stderr || '').slice(0, 400)}`);
} else {
  try { observed = JSON.parse(run.stdout); } catch { observed = null; }
  check('the scenario executed and produced observations', observed !== null,
    observed ? `${observed.properties.length} properties` : 'no parseable output');
}

if (observed) {
  // ── 3. Contract-framework properties ──────────────────────────────────────
  line('\n3. Contract-framework properties');
  for (const property of observed.properties) {
    check(`${property.id}  ${property.property}`, property.observed === true, property.detail);
  }

  // ── 4. Certification census (honest — most contracts are not yet built) ───
  line('\n4. Contract certification census');
  const c = observed.census;
  check('no dependency cycle exists among the platform contracts',
    c.cyclesDetected === 0 && c.danglingEdges === 0,
    `${c.contracts} contracts, ${c.dependencyEdges} edges, ${c.cyclesDetected} cycle(s), ${c.danglingEdges} dangling`);
  line(`         states: ${c.pass} PASS · ${c.partial} PARTIAL · ${c.notImplemented} NOT IMPLEMENTED · ${c.fail} FAIL · ${c.unknown} UNKNOWN`);

  // ── 5. Evidence ───────────────────────────────────────────────────────────
  const evidence = {
    evidenceId: 'canonical-platform-contract-framework',
    generator: 'governance/verification/verify-platform-contract-framework.js',
    generatorVersion: '1.0.0',
    executionContext: `node ${process.version} on ${process.platform}`,
    repository: 'DBiz_IntelligencePlane',
    timestamp: new Date().toISOString(),
    adrReference: ['ADR-0040', 'ADR-0039', 'ADR-0025', 'ADR-0019'],
    ruleReference: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'R-13.1', 'R-13.4', 'CHARTER-4'],
    principle: observed.principle,
    census: observed.census,
    contractStates: observed.contractStates,
    properties: observed.properties,
    verificationStatus: failures === 0 ? 'verified' : 'failed',
  };
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  line('\n5. Per-contract state');
  for (const s of observed.contractStates) line(`         ${s.state.padEnd(16)} ${s.id}  (${s.symbols})  ${s.owner}`);
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the platform contract layer is sound; no state is over-claimed and the graph is acyclic.');
  line('Contracts still NOT IMPLEMENTED are honestly reported; each is added additively, gate-first (ADR-0040 §6).');
} else {
  line(`RESULT: FAIL — ${failures} contract-framework property violated (ADR-0040).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
