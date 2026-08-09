'use strict';
/**
 * GOVERNANCE — ADR-0040 Wave 4 canonical intelligence models.
 * ============================================================================
 * Wave 4 defines two passive, immutable, capability-neutral data contracts — the
 * Repository Intelligence model (PCT-REPO-MODEL) and the Automation Intelligence
 * model (PCT-AUTO-MODEL). They describe information only; they take no decision
 * (the Decision Engine decides), execute no work, and call no connector or AI.
 * This gate certifies them by EXECUTION:
 *
 *   IM-1  both models exist (their canonical types are exported).
 *   IM-2  the reference conformance suite PASSES — a reference consumer builds
 *         each model, proves it immutable, and reads its fields.
 *   IM-3  both models are capability-neutral — no provider, tool or Functional-
 *         Testing concept appears in the model source (G-16).
 *   IM-4  each model is a single canonical definition — no concept is defined
 *         twice across the two sources (G-1/G-12).
 *
 * Run:  node governance/verification/verify-intelligence-models.js
 * Exit: 0 = both models are certified   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CONTRACTS = path.join(ROOT, 'packages', 'contracts');
const REPO = path.join(CONTRACTS, 'src', 'repository-intelligence.ts');
const AUTO = path.join(CONTRACTS, 'src', 'automation-intelligence.ts');
const BUILT_TEST = path.join(CONTRACTS, 'dist', 'test', 'intelligence-models-conformance.test.js');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'intelligence-models-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — ADR-0040 Wave 4 canonical intelligence models');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('both model sources exist', fs.existsSync(REPO) && fs.existsSync(AUTO),
  'packages/contracts/src/{repository,automation}-intelligence.ts');
check('the reference conformance suite is built', fs.existsSync(BUILT_TEST),
  fs.existsSync(BUILT_TEST) ? 'dist/test/intelligence-models-conformance.test.js' : 'not built — run tsc in @dbiz/contracts');

if (!fs.existsSync(REPO) || !fs.existsSync(AUTO) || !fs.existsSync(BUILT_TEST)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the intelligence models cannot be evidenced (NOT MEASURED is FAIL, R-13.3).');
  line('');
  process.exit(1);
}

const repoSrc = fs.readFileSync(REPO, 'utf8');
const autoSrc = fs.readFileSync(AUTO, 'utf8');
const both = `${repoSrc}\n${autoSrc}`;
const exportsSymbol = (src, symbol) =>
  new RegExp(`export\\s+(?:type\\s+|interface\\s+|const\\s+|function\\s+)?\\{?[^\\n]*\\b${symbol}\\b`).test(src);

// ── 2. IM-1 · both models exist ─────────────────────────────────────────────
line('\n2. Models present');
const missing = [];
if (!exportsSymbol(repoSrc, 'RepositoryIntelligenceModel')) missing.push('RepositoryIntelligenceModel');
if (!exportsSymbol(autoSrc, 'AutomationIntelligenceModel')) missing.push('AutomationIntelligenceModel');
check('IM-1  both canonical intelligence models are exported',
  missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'RepositoryIntelligenceModel · AutomationIntelligenceModel present');

// ── 3. IM-2 · reference conformance passes ──────────────────────────────────
line('\n3. Reference conformance (executed)');
const run = spawnSync(process.execPath, ['--test', BUILT_TEST],
  { cwd: CONTRACTS, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
const passed = Number((out.match(/(?:#|ℹ)\s*pass\s+(\d+)/) || [])[1] || 0);
const failed = Number((out.match(/(?:#|ℹ)\s*fail\s+(\d+)/) || [])[1] || (run.status === 0 ? 0 : 1));
check('IM-2  a reference consumer builds each model, proves it immutable and reads its fields',
  run.status === 0 && failed === 0 && passed >= 3, `${passed} passed, ${failed} failed (exit ${run.status})`);

// ── 4. IM-3 · capability-neutral ────────────────────────────────────────────
line('\n4. Capability neutrality (G-16)');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const FORBIDDEN = /(functional[\s-]?testing|playwright|allure|azure\s*devops|\bado\b|\bjira\b|zephyr|selenium|cypress|gherkin)/i;
const neutralityHits = [];
for (const [name, src] of [['repository-intelligence.ts', repoSrc], ['automation-intelligence.ts', autoSrc]]) {
  const m = strip(src).match(FORBIDDEN);
  if (m) neutralityHits.push(`${name}: ${m[0]}`);
}
check('IM-3  both models name no provider, tool or Functional-Testing concept',
  neutralityHits.length === 0, neutralityHits.length ? neutralityHits.join('; ') : 'both models are capability-neutral');

// ── 5. IM-4 · single canonical definition ───────────────────────────────────
line('\n5. Canonical uniqueness (G-1/G-12)');
const countDef = (symbol) => (both.match(new RegExp(`export interface ${symbol}\\b`, 'g')) || []).length;
const dupes = [];
for (const symbol of ['RepositoryIntelligenceModel', 'AutomationIntelligenceModel']) {
  const n = countDef(symbol);
  if (n !== 1) dupes.push(`${symbol} defined ${n} time(s)`);
}
check('IM-4  each model is defined exactly once (no duplicate canonical definition)',
  dupes.length === 0, dupes.length ? dupes.join('; ') : 'each concept has a single canonical definition');

// ── 6. Evidence ─────────────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'adr0040-wave4-intelligence-models',
  generator: 'governance/verification/verify-intelligence-models.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  timestamp: new Date().toISOString(),
  adrReference: ['ADR-0040', 'ADR-0019'],
  ruleReference: ['PCT-REPO-MODEL', 'PCT-AUTO-MODEL', 'G-1', 'G-8', 'G-12', 'G-16', 'R-13.1'],
  properties: [
    { id: 'IM-1', observed: missing.length === 0 },
    { id: 'IM-2', observed: run.status === 0 && failed === 0 && passed >= 3, referencePassed: passed, referenceFailed: failed },
    { id: 'IM-3', observed: neutralityHits.length === 0 },
    { id: 'IM-4', observed: dupes.length === 0 },
  ],
  verificationStatus: failures === 0 ? 'verified' : 'failed',
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Wave-4 intelligence models are certified by executed evidence.');
} else {
  line(`RESULT: FAIL — ${failures} intelligence-model property violated (ADR-0040).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
