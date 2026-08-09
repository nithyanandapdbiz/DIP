'use strict';
/**
 * GOVERNANCE — ADR-0040 Wave 2 canonical connector SPI framework.
 * ============================================================================
 * Wave 2 completes the connector SPI framework with the three remaining
 * capability-neutral families — Authentication, Application-Strategy and
 * Reporting — each with SPI governance metadata (G-7) and a reference
 * implementation that proves it is implementable. This gate certifies them by
 * EXECUTION, not assertion:
 *
 *   CS-1  the three SPI interfaces and their governance descriptors exist.
 *   CS-2  the reference conformance suite PASSES — every descriptor is complete
 *         and capability-neutral, and each reference implements every required
 *         operation (contract completeness + interface stability).
 *   CS-3  the SPI definitions are capability-neutral — no provider, tool or
 *         report-format brand appears in the connector-SPI source (G-16).
 *
 * No provider implementation is required to pass: the references are in-memory,
 * deterministic, and contain no business logic or external call.
 *
 * Run:  node governance/verification/verify-connector-spi.js
 * Exit: 0 = the connector SPI framework is certified   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CF = path.join(ROOT, 'packages', 'capability-framework');
const ADAPTERS = path.join(CF, 'src', 'adapters.ts');
const BUILT_TEST = path.join(CF, 'dist', 'test', 'connector-spi-conformance.test.js');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'connector-spi-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — ADR-0040 Wave 2 canonical connector SPI framework');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the adapters SPI source exists', fs.existsSync(ADAPTERS), 'packages/capability-framework/src/adapters.ts');
check('the connector-SPI reference conformance suite is built', fs.existsSync(BUILT_TEST),
  fs.existsSync(BUILT_TEST) ? 'dist/test/connector-spi-conformance.test.js' : 'not built — run tsc in @dbiz/capability-framework');

if (!fs.existsSync(ADAPTERS) || !fs.existsSync(BUILT_TEST)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the connector SPI framework cannot be evidenced (NOT MEASURED is FAIL, R-13.3).');
  line('');
  process.exit(1);
}

const adaptersSrc = fs.readFileSync(ADAPTERS, 'utf8');
const exportsSymbol = (symbol) =>
  new RegExp(`export\\s+(?:type\\s+|interface\\s+|const\\s+)?\\{?[^\\n]*\\b${symbol}\\b`).test(adaptersSrc);

// ── 2. CS-1 · the three SPIs and descriptors exist ──────────────────────────
line('\n2. Connector SPIs present');
const required = ['AuthenticationAdapter', 'ApplicationStrategyAdapter', 'ReportingAdapter', 'ConnectorSpiDescriptor', 'CONNECTOR_SPI_DESCRIPTORS'];
const missing = required.filter((s) => !exportsSymbol(s));
check('CS-1  the three connector SPIs and their governance descriptors are exported',
  missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'Authentication · Application-Strategy · Reporting + descriptors present');

// ── 3. CS-2 · reference conformance passes ──────────────────────────────────
line('\n3. Reference conformance (executed)');
const run = spawnSync(process.execPath, ['--test', BUILT_TEST],
  { cwd: CF, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
const passed = Number((out.match(/(?:#|ℹ)\s*pass\s+(\d+)/) || [])[1] || 0);
const failed = Number((out.match(/(?:#|ℹ)\s*fail\s+(\d+)/) || [])[1] || (run.status === 0 ? 0 : 1));
check('CS-2  every descriptor is complete + neutral and each reference implements its required operations',
  run.status === 0 && failed === 0 && passed >= 4, `${passed} passed, ${failed} failed (exit ${run.status})`);

// ── 4. CS-3 · capability-neutral SPI source ─────────────────────────────────
line('\n4. Capability neutrality (G-16)');
// Scope the scan to the Wave-2 section so the existing SPIs' provider-named
// COMMENTS and fields (e.g. authorEmail) are out of scope; scan CODE, not prose.
const start = adaptersSrc.indexOf('ADR-0040 Wave 2');
const end = adaptersSrc.indexOf('export interface AdapterSet');
const section = start >= 0 && end > start ? adaptersSrc.slice(start, end) : adaptersSrc;
const code = section.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const FORBIDDEN = /(azure\s*ad|\boauth\b|okta|\bsaml\b|salesforce|dynamics|\bcrm\b|\bsap\b|allure|playwright|selenium|cypress|\bjira\b|zephyr|\bxray\b)/i;
const neutralityHit = code.match(FORBIDDEN);
check('CS-3  the connector SPIs name no provider, tool or report-format brand',
  neutralityHit === null, neutralityHit ? `found "${neutralityHit[0]}" in the connector-SPI source` : 'connector SPIs are capability-neutral');

// ── 5. Evidence ─────────────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'adr0040-wave2-connector-spi',
  generator: 'governance/verification/verify-connector-spi.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  timestamp: new Date().toISOString(),
  adrReference: ['ADR-0040', 'ADR-0022', 'ADR-0019'],
  ruleReference: ['PCT-CONNECTOR-SPI', 'G-7', 'G-16', 'C-14.1', 'R-13.1'],
  properties: [
    { id: 'CS-1', observed: missing.length === 0 },
    { id: 'CS-2', observed: run.status === 0 && failed === 0 && passed >= 4, referencePassed: passed, referenceFailed: failed },
    { id: 'CS-3', observed: neutralityHit === null },
  ],
  verificationStatus: failures === 0 ? 'verified' : 'failed',
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Wave-2 connector SPI framework is certified by executed evidence.');
} else {
  line(`RESULT: FAIL — ${failures} connector-SPI property violated (ADR-0040).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
