'use strict';
/**
 * GOVERNANCE — ADR-0040 Wave 6 Platform Event & Observability contracts.
 * ============================================================================
 * Wave 6 defines the final two platform contracts (PCT-EVENTS): the immutable,
 * observational-only PlatformEvent and Observability model. They carry platform
 * metadata for visibility only — they never control execution, invoke a domain,
 * schedule work, trigger a workflow or bypass governance (G-9), and they carry no
 * business payload (G-10/G-16). This gate certifies them by EXECUTION:
 *
 *   EV-1  both contracts exist (their canonical types are exported).
 *   EV-2  the reference conformance suite PASSES — a reference consumer builds
 *         each, proves it immutable, and validates observational metadata.
 *   EV-3  capability-neutral — no provider, tool, messaging/telemetry brand or
 *         Functional-Testing concept in the source (G-16).
 *   EV-4  no business payload is embedded (G-10).
 *   EV-5  observational only — no execution-control semantics (G-9).
 *   EV-6  each contract is a single canonical definition (G-1/G-12).
 *
 * Run:  node governance/verification/verify-platform-events.js
 * Exit: 0 = both contracts are certified   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CONTRACTS = path.join(ROOT, 'packages', 'contracts');
const SRC = path.join(CONTRACTS, 'src', 'events.ts');
const BUILT_TEST = path.join(CONTRACTS, 'dist', 'test', 'events-conformance.test.js');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'platform-events-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — ADR-0040 Wave 6 Platform Event & Observability contracts');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the events source exists', fs.existsSync(SRC), 'packages/contracts/src/events.ts');
check('the reference conformance suite is built', fs.existsSync(BUILT_TEST),
  fs.existsSync(BUILT_TEST) ? 'dist/test/events-conformance.test.js' : 'not built — run tsc in @dbiz/contracts');

if (!fs.existsSync(SRC) || !fs.existsSync(BUILT_TEST)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the event/observability contracts cannot be evidenced (NOT MEASURED is FAIL, R-13.3).');
  line('');
  process.exit(1);
}

const src = fs.readFileSync(SRC, 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const exportsSymbol = (symbol) =>
  new RegExp(`export\\s+(?:type\\s+|interface\\s+|const\\s+|function\\s+)?\\{?[^\\n]*\\b${symbol}\\b`).test(src);

// ── 2. EV-1 · both contracts exist ──────────────────────────────────────────
line('\n2. Contracts present');
const missing = ['PlatformEvent', 'ObservabilityModel'].filter((s) => !exportsSymbol(s));
check('EV-1  both the PlatformEvent and Observability contracts are exported',
  missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'PlatformEvent · ObservabilityModel present');

// ── 3. EV-2 · reference conformance passes ──────────────────────────────────
line('\n3. Reference conformance (executed)');
const run = spawnSync(process.execPath, ['--test', BUILT_TEST],
  { cwd: CONTRACTS, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
const passed = Number((out.match(/(?:#|ℹ)\s*pass\s+(\d+)/) || [])[1] || 0);
const failed = Number((out.match(/(?:#|ℹ)\s*fail\s+(\d+)/) || [])[1] || (run.status === 0 ? 0 : 1));
check('EV-2  a reference consumer builds each, proves it immutable and validates observational metadata',
  run.status === 0 && failed === 0 && passed >= 3, `${passed} passed, ${failed} failed (exit ${run.status})`);

// ── 4. EV-3 · capability-neutral ────────────────────────────────────────────
line('\n4. Capability neutrality (G-16)');
const FORBIDDEN = /(functional[\s-]?testing|playwright|allure|azure\s*devops|\bado\b|\bjira\b|zephyr|selenium|cypress|kafka|rabbitmq|opentelemetry|prometheus|grafana|application\s*insights|pub\/?sub|service\s*bus)/i;
const neutralityHit = code.match(FORBIDDEN);
check('EV-3  the contracts name no provider, tool, messaging/telemetry brand or Functional-Testing concept',
  neutralityHit === null, neutralityHit ? `found "${neutralityHit[0]}"` : 'both contracts are capability-neutral');

// ── 5. EV-4 · no business payload ───────────────────────────────────────────
line('\n5. No business payload (G-10)');
const PAYLOAD = /(payload|base64|screenshot|\bvideo\b|testcase|\bstory\b|rawbytes|\bblob\b)/i;
const payloadHit = code.match(PAYLOAD);
check('EV-4  no business payload is embedded — references only',
  payloadHit === null, payloadHit ? `found business-payload token "${payloadHit[0]}"` : 'no business payload embedded');

// ── 6. EV-5 · observational only (no execution semantics) ───────────────────
line('\n6. Observational only (G-9)');
const CONTROL = /(\btrigger|\binvoke|\bschedule\b|\bdispatch|orchestrat|advancestage|controlflow|bypassgovernance|executestage)/i;
const controlHit = code.match(CONTROL);
check('EV-5  the contracts carry no execution-control semantics (observational only)',
  controlHit === null, controlHit ? `found execution-control token "${controlHit[0]}"` : 'observational only — no execution semantics');

// ── 7. EV-6 · single canonical definition ───────────────────────────────────
line('\n7. Canonical uniqueness (G-1/G-12)');
const dupes = [];
for (const symbol of ['PlatformEvent', 'ObservabilityModel']) {
  const n = (src.match(new RegExp(`export interface ${symbol}\\b`, 'g')) || []).length;
  if (n !== 1) dupes.push(`${symbol} defined ${n} time(s)`);
}
check('EV-6  each contract is defined exactly once (no duplicate canonical definition)',
  dupes.length === 0, dupes.length ? dupes.join('; ') : 'each contract has a single canonical definition');

// ── 8. Evidence ─────────────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'adr0040-wave6-platform-events',
  generator: 'governance/verification/verify-platform-events.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  timestamp: new Date().toISOString(),
  adrReference: ['ADR-0040', 'ADR-0019'],
  ruleReference: ['PCT-EVENTS', 'G-1', 'G-8', 'G-9', 'G-10', 'G-12', 'G-16', 'R-13.1'],
  properties: [
    { id: 'EV-1', observed: missing.length === 0 },
    { id: 'EV-2', observed: run.status === 0 && failed === 0 && passed >= 3, referencePassed: passed, referenceFailed: failed },
    { id: 'EV-3', observed: neutralityHit === null },
    { id: 'EV-4', observed: payloadHit === null },
    { id: 'EV-5', observed: controlHit === null },
    { id: 'EV-6', observed: dupes.length === 0 },
  ],
  verificationStatus: failures === 0 ? 'verified' : 'failed',
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Wave-6 Platform Event & Observability contracts are certified by executed evidence.');
} else {
  line(`RESULT: FAIL — ${failures} event/observability property violated (ADR-0040).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
