'use strict';
/**
 * GOVERNANCE — ADR-0040 Wave 1 canonical execution contracts.
 * ============================================================================
 * Wave 1 builds the three foundational, capability-neutral execution contracts:
 * the immutable Execution Context, the Domain Contract, and the observational
 * Domain State model. This gate certifies them by EXECUTION, not assertion:
 *
 *   EC-1  the three contracts export their declared symbols (they exist).
 *   EC-2  the reference conformance suite PASSES — the minimal capability-neutral
 *         reference consumes all three; the context is sealed and immutable (G-8);
 *         append-only metadata preserves every immutable field by identity;
 *         domain state is observational only and never influences execution (G-9).
 *   EC-3  the contracts are capability-neutral — no Functional-Testing, tool,
 *         provider or AI-vendor concept appears in the contract source (G-16).
 *
 * The certification runs the REAL built reference (dist/test), so a broken
 * immutability or observational guarantee turns this gate RED.
 *
 * Run:  node governance/verification/verify-execution-contracts.js
 * Exit: 0 = the Wave-1 contracts are certified   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CF = path.join(ROOT, 'packages', 'capability-framework');
const SRC = { ctx: path.join(CF, 'src', 'execution-context.ts'), domain: path.join(CF, 'src', 'domain.ts') };
const BUILT_TEST = path.join(CF, 'dist', 'test', 'execution-contract-conformance.test.js');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'execution-contracts-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

const exportsSymbol = (file, symbol) => {
  if (!fs.existsSync(file)) return false;
  const src = fs.readFileSync(file, 'utf8');
  return new RegExp(`export\\s+(?:type\\s+|interface\\s+|const\\s+|function\\s+)?\\{?[^\\n]*\\b${symbol}\\b`).test(src);
};

line('');
line('GOVERNANCE — ADR-0040 Wave 1 canonical execution contracts');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the execution-context and domain contract sources exist',
  fs.existsSync(SRC.ctx) && fs.existsSync(SRC.domain),
  'packages/capability-framework/src/{execution-context,domain}.ts');
check('the reference conformance suite is built', fs.existsSync(BUILT_TEST),
  fs.existsSync(BUILT_TEST) ? 'dist/test/execution-contract-conformance.test.js' : 'not built — run tsc in @dbiz/capability-framework');

if (!fs.existsSync(SRC.ctx) || !fs.existsSync(SRC.domain) || !fs.existsSync(BUILT_TEST)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the Wave-1 contracts cannot be evidenced (NOT MEASURED is FAIL, R-13.3).');
  line('');
  process.exit(1);
}

// ── 2. EC-1 · the three contracts exist ─────────────────────────────────────
line('\n2. Contracts present');
const symbolChecks = [
  ['ExecutionContext', SRC.ctx], ['sealExecutionContext', SRC.ctx],
  ['DomainContract', SRC.domain], ['DomainState', SRC.domain], ['observeDomainState', SRC.domain],
];
const missingSym = symbolChecks.filter(([sym, f]) => !exportsSymbol(f, sym)).map(([sym]) => sym);
check('EC-1  the three canonical contracts export their declared symbols',
  missingSym.length === 0, missingSym.length ? `missing: ${missingSym.join(', ')}` : 'ExecutionContext · DomainContract · DomainState present');

// ── 3. EC-2 · the reference conformance suite passes ────────────────────────
line('\n3. Reference conformance (executed)');
const run = spawnSync(process.execPath, ['--test', BUILT_TEST],
  { cwd: CF, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
const passMatch = out.match(/(?:#|ℹ)\s*pass\s+(\d+)/);
const failMatch = out.match(/(?:#|ℹ)\s*fail\s+(\d+)/);
const passed = passMatch ? Number(passMatch[1]) : 0;
const failed = failMatch ? Number(failMatch[1]) : (run.status === 0 ? 0 : 1);
check('EC-2  the reference capability consumes all three contracts; immutability & observational-only hold',
  run.status === 0 && failed === 0 && passed >= 4,
  `${passed} passed, ${failed} failed (exit ${run.status})`);

// ── 4. EC-3 · capability-neutral ────────────────────────────────────────────
// Scans CODE, not comments: a neutral contract may explain in prose what it
// deliberately excludes; the risk is a capability concept appearing in an actual
// type or identifier. Block and line comments are stripped before the scan.
line('\n4. Capability neutrality (G-16)');
const FORBIDDEN = /(functional[\s-]?testing|playwright|allure|azure\s*devops|\bado\b|\bjira\b|zephyr|selenium|cypress|screenshot|gherkin)/i;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const neutralityFindings = [];
for (const f of [SRC.ctx, SRC.domain]) {
  const code = stripComments(fs.readFileSync(f, 'utf8'));
  if (FORBIDDEN.test(code)) neutralityFindings.push(`${path.basename(f)}: ${(code.match(FORBIDDEN) || [])[0]}`);
}
check('EC-3  the contracts name no capability, tool, provider or Functional-Testing concept',
  neutralityFindings.length === 0, neutralityFindings.length ? neutralityFindings.join(', ') : 'contracts are capability-neutral');

// ── 5. Evidence ─────────────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'adr0040-wave1-execution-contracts',
  generator: 'governance/verification/verify-execution-contracts.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  timestamp: new Date().toISOString(),
  adrReference: ['ADR-0040', 'ADR-0019'],
  ruleReference: ['PCT-EXEC-CONTEXT', 'PCT-DOMAIN', 'PCT-DOMAIN-STATE', 'G-8', 'G-9', 'G-16', 'Q2', 'R-13.1'],
  properties: [
    { id: 'EC-1', observed: missingSym.length === 0 },
    { id: 'EC-2', observed: run.status === 0 && failed === 0 && passed >= 4, referencePassed: passed, referenceFailed: failed },
    { id: 'EC-3', observed: neutralityFindings.length === 0 },
  ],
  verificationStatus: failures === 0 ? 'verified' : 'failed',
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Wave-1 canonical execution contracts are certified by executed evidence.');
} else {
  line(`RESULT: FAIL — ${failures} Wave-1 contract property violated (ADR-0040).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
