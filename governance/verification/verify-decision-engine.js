'use strict';
/**
 * GOVERNANCE — ADR-0040 Wave 3 canonical Decision Engine.
 * ============================================================================
 * Wave 3 builds the single deterministic decision service (PCT-DECISION). It
 * answers questions and returns immutable Decision Objects; it does not execute,
 * sequence stages, invoke domains or own the lifecycle (G-6). This gate certifies
 * it by EXECUTION:
 *
 *   DE-1  the Decision Engine and its contracts exist.
 *   DE-2  the reference conformance suite PASSES — determinism (identical inputs
 *         give identical decisions), rule precedence (a higher tier always wins),
 *         AI advisory-only (AI never overrides a higher tier and is recorded
 *         separately), and Decision Object immutability.
 *   DE-3  the engine is capability-neutral — no provider, tool or Functional-
 *         Testing concept appears in the Decision Engine source (G-16).
 *
 * Run:  node governance/verification/verify-decision-engine.js
 * Exit: 0 = the Decision Engine is certified   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CF = path.join(ROOT, 'packages', 'capability-framework');
const SRC = path.join(CF, 'src', 'decision.ts');
const BUILT_TEST = path.join(CF, 'dist', 'test', 'decision-engine-conformance.test.js');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'decision-engine-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — ADR-0040 Wave 3 canonical Decision Engine');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the Decision Engine source exists', fs.existsSync(SRC), 'packages/capability-framework/src/decision.ts');
check('the Decision Engine reference conformance suite is built', fs.existsSync(BUILT_TEST),
  fs.existsSync(BUILT_TEST) ? 'dist/test/decision-engine-conformance.test.js' : 'not built — run tsc in @dbiz/capability-framework');

if (!fs.existsSync(SRC) || !fs.existsSync(BUILT_TEST)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the Decision Engine cannot be evidenced (NOT MEASURED is FAIL, R-13.3).');
  line('');
  process.exit(1);
}

const src = fs.readFileSync(SRC, 'utf8');
const exportsSymbol = (symbol) =>
  new RegExp(`export\\s+(?:type\\s+|interface\\s+|const\\s+|function\\s+)?\\{?[^\\n]*\\b${symbol}\\b`).test(src);

// ── 2. DE-1 · the engine and its contracts exist ────────────────────────────
line('\n2. Decision Engine present');
const required = ['DecisionEngine', 'createDecisionEngine', 'DecisionObject', 'DecisionRequest', 'RULE_PRECEDENCE'];
const missing = required.filter((s) => !exportsSymbol(s));
check('DE-1  the Decision Engine, its request/decision contracts and the rule precedence exist',
  missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'DecisionEngine · DecisionObject · RULE_PRECEDENCE present');

// ── 3. DE-2 · reference conformance passes ──────────────────────────────────
line('\n3. Reference conformance (executed)');
const run = spawnSync(process.execPath, ['--test', BUILT_TEST],
  { cwd: CF, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
const passed = Number((out.match(/(?:#|ℹ)\s*pass\s+(\d+)/) || [])[1] || 0);
const failed = Number((out.match(/(?:#|ℹ)\s*fail\s+(\d+)/) || [])[1] || (run.status === 0 ? 0 : 1));
check('DE-2  determinism, rule precedence, AI advisory-only and decision immutability hold',
  run.status === 0 && failed === 0 && passed >= 6, `${passed} passed, ${failed} failed (exit ${run.status})`);

// ── 4. DE-3 · capability-neutral engine ─────────────────────────────────────
line('\n4. Capability neutrality (G-16)');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const FORBIDDEN = /(functional[\s-]?testing|playwright|allure|azure\s*devops|\bado\b|\bjira\b|zephyr|salesforce|dynamics|\bcrm\b|\bsap\b|selenium|cypress|okta|azure\s*ad)/i;
const hit = code.match(FORBIDDEN);
check('DE-3  the Decision Engine names no provider, tool or Functional-Testing concept',
  hit === null, hit ? `found "${hit[0]}" in the Decision Engine source` : 'the Decision Engine is capability-neutral');

// ── 5. Evidence ─────────────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'adr0040-wave3-decision-engine',
  generator: 'governance/verification/verify-decision-engine.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  timestamp: new Date().toISOString(),
  adrReference: ['ADR-0040', 'ADR-0019'],
  ruleReference: ['PCT-DECISION', 'G-6', 'G-16', 'R-13.1'],
  properties: [
    { id: 'DE-1', observed: missing.length === 0 },
    { id: 'DE-2', observed: run.status === 0 && failed === 0 && passed >= 6, referencePassed: passed, referenceFailed: failed },
    { id: 'DE-3', observed: hit === null },
  ],
  verificationStatus: failures === 0 ? 'verified' : 'failed',
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Wave-3 Decision Engine is certified by executed evidence.');
} else {
  line(`RESULT: FAIL — ${failures} Decision Engine property violated (ADR-0040).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
