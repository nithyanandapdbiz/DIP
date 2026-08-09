'use strict';
/**
 * GOVERNANCE — ADR-0040 Wave 5 canonical Reporting model.
 * ============================================================================
 * Wave 5 defines the single passive, immutable, capability-neutral Reporting
 * model (PCT-REPORT-MODEL). It represents execution outcomes; it renders nothing,
 * publishes nothing, and carries evidence by REFERENCE only — never a payload.
 * This gate certifies it by EXECUTION:
 *
 *   RM-1  the model exists (its canonical type is exported).
 *   RM-2  the reference conformance suite PASSES — a reference consumer builds a
 *         report, proves it immutable, and validates evidence references.
 *   RM-3  the model is capability-neutral — no provider, tool or Functional-
 *         Testing concept appears in the model source (G-16).
 *   RM-4  evidence is referenced only — no execution payload is embedded (G-10).
 *   RM-5  the model is a single canonical definition (G-1/G-12).
 *
 * Run:  node governance/verification/verify-reporting-model.js
 * Exit: 0 = the Reporting model is certified   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CONTRACTS = path.join(ROOT, 'packages', 'contracts');
const SRC = path.join(CONTRACTS, 'src', 'reporting-model.ts');
const BUILT_TEST = path.join(CONTRACTS, 'dist', 'test', 'reporting-model-conformance.test.js');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'reporting-model-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — ADR-0040 Wave 5 canonical Reporting model');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the Reporting model source exists', fs.existsSync(SRC), 'packages/contracts/src/reporting-model.ts');
check('the reference conformance suite is built', fs.existsSync(BUILT_TEST),
  fs.existsSync(BUILT_TEST) ? 'dist/test/reporting-model-conformance.test.js' : 'not built — run tsc in @dbiz/contracts');

if (!fs.existsSync(SRC) || !fs.existsSync(BUILT_TEST)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the Reporting model cannot be evidenced (NOT MEASURED is FAIL, R-13.3).');
  line('');
  process.exit(1);
}

const src = fs.readFileSync(SRC, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const code = strip(src);
const exportsSymbol = (symbol) =>
  new RegExp(`export\\s+(?:type\\s+|interface\\s+|const\\s+|function\\s+)?\\{?[^\\n]*\\b${symbol}\\b`).test(src);

// ── 2. RM-1 · the model exists ──────────────────────────────────────────────
line('\n2. Model present');
check('RM-1  the canonical Reporting model is exported',
  exportsSymbol('ReportingModel'), exportsSymbol('ReportingModel') ? 'ReportingModel present' : 'ReportingModel missing');

// ── 3. RM-2 · reference conformance passes ──────────────────────────────────
line('\n3. Reference conformance (executed)');
const run = spawnSync(process.execPath, ['--test', BUILT_TEST],
  { cwd: CONTRACTS, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
const passed = Number((out.match(/(?:#|ℹ)\s*pass\s+(\d+)/) || [])[1] || 0);
const failed = Number((out.match(/(?:#|ℹ)\s*fail\s+(\d+)/) || [])[1] || (run.status === 0 ? 0 : 1));
check('RM-2  a reference consumer builds a report, proves it immutable and validates evidence references',
  run.status === 0 && failed === 0 && passed >= 3, `${passed} passed, ${failed} failed (exit ${run.status})`);

// ── 4. RM-3 · capability-neutral ────────────────────────────────────────────
line('\n4. Capability neutrality (G-16)');
const FORBIDDEN = /(functional[\s-]?testing|playwright|allure|azure\s*devops|\bado\b|\bjira\b|zephyr|selenium|cypress|\bteams\b)/i;
const neutralityHit = code.match(FORBIDDEN);
check('RM-3  the model names no provider, tool or Functional-Testing concept',
  neutralityHit === null, neutralityHit ? `found "${neutralityHit[0]}" in the model source` : 'the Reporting model is capability-neutral');

// ── 5. RM-4 · evidence references only (no embedded payload) ─────────────────
line('\n5. Evidence references only (G-10)');
const PAYLOAD = /(base64|payload|rawbytes|embeddedcontent|screenshotdata|videobytes|\bblob\b)/i;
const payloadHit = code.match(PAYLOAD);
check('RM-4  evidence is carried by reference only — no execution payload is embedded',
  payloadHit === null, payloadHit ? `found embedded-payload token "${payloadHit[0]}"` : 'evidence is referenced, never embedded');

// ── 6. RM-5 · single canonical definition ───────────────────────────────────
line('\n6. Canonical uniqueness (G-1/G-12)');
const defs = (src.match(/export interface ReportingModel\b/g) || []).length;
check('RM-5  the Reporting model is defined exactly once (no duplicate canonical definition)',
  defs === 1, defs === 1 ? 'single canonical definition' : `ReportingModel defined ${defs} time(s)`);

// ── 7. Evidence ─────────────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'adr0040-wave5-reporting-model',
  generator: 'governance/verification/verify-reporting-model.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  timestamp: new Date().toISOString(),
  adrReference: ['ADR-0040', 'ADR-0019'],
  ruleReference: ['PCT-REPORT-MODEL', 'G-1', 'G-8', 'G-10', 'G-12', 'G-16', 'R-13.1'],
  properties: [
    { id: 'RM-1', observed: exportsSymbol('ReportingModel') },
    { id: 'RM-2', observed: run.status === 0 && failed === 0 && passed >= 3, referencePassed: passed, referenceFailed: failed },
    { id: 'RM-3', observed: neutralityHit === null },
    { id: 'RM-4', observed: payloadHit === null },
    { id: 'RM-5', observed: defs === 1 },
  ],
  verificationStatus: failures === 0 ? 'verified' : 'failed',
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Wave-5 Reporting model is certified by executed evidence.');
} else {
  line(`RESULT: FAIL — ${failures} Reporting-model property violated (ADR-0040).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
