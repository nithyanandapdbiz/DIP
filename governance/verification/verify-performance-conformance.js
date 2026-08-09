'use strict';
/**
 * GOVERNANCE — Performance Engine conformance.
 * ============================================================================
 * Regenerates the capability-4 conformance evidence and gates on it (R-14.2). A committed result
 * would keep asserting that the twelve stages are traversed, that the engine runs with reasoning
 * unavailable, and that no load reaches production before the guardrail certifies — long after any
 * of those stopped being true. The properties that decay quietly are exactly the ones this gate
 * protects.
 *
 * Run:  node governance/verification/verify-performance-conformance.js
 * Exit: 0 = every property holds   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCENARIO = path.join(ROOT, 'governance', 'capability', 'run-performance-conformance.mjs');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'performance-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => { line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`); if (detail) line(`         ${detail}`); if (!cond) failures++; };

line('\nGOVERNANCE — Performance Engine conformance');
line('='.repeat(74));

line('\n1. Preconditions');
const REQUIRED = ['capability-framework', 'performance-engine'];
const unbuilt = REQUIRED.filter((p) => !fs.existsSync(path.join(ROOT, 'packages', p, 'dist', 'src', 'index.js')));
check('the capability packages are built', unbuilt.length === 0, unbuilt.length ? `not built: ${unbuilt.join(', ')}` : `${REQUIRED.length} packages present`);
check('the conformance scenario exists', fs.existsSync(SCENARIO), fs.existsSync(SCENARIO) ? 'governance/capability/run-performance-conformance.mjs' : 'absent');

if (unbuilt.length > 0 || !fs.existsSync(SCENARIO)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — performance conformance cannot be evidenced.\n');
  process.exit(1);
}

line('\n2. Scenario execution');
const run = spawnSync(process.execPath, [SCENARIO], { cwd: ROOT, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
let observed = null;
if (run.status !== 0) check('the scenario executed', false, `exit ${run.status}: ${(run.stderr || '').slice(0, 300)}`);
else { try { observed = JSON.parse(run.stdout); } catch { observed = null; } check('the scenario executed and produced observations', observed !== null, observed ? `${observed.properties.length} properties` : 'no parseable output'); }

if (observed) {
  check('the scenario did not fail fatally', observed.fatal === null, observed.fatal ?? 'completed');
  const failed = observed.properties.filter((p) => !p.ok);
  check('every conformance property holds', failed.length === 0, failed.length ? failed.map((p) => `${p.id}: ${p.detail}`).join('; ') : `${observed.properties.length}/${observed.properties.length}`);

  const ids = new Set(observed.properties.map((p) => p.id));
  const expected = ['PP-1', 'PP-2', 'PP-3', 'PP-4', 'PP-5', 'PP-5.n', 'PP-6', 'PP-7', 'PP-7.s', 'PP-8', 'PP-9', 'PP-10', 'PP-10.a', 'PP-11', 'PP-12', 'PP-13', 'PP-14', 'PP-15', 'PP-16', 'PP-17', 'PP-18', 'PP-19', 'PP-20', 'PP-21'];
  const absent = expected.filter((id) => !ids.has(id));
  check('no conformance property has been dropped', absent.length === 0, absent.length ? `missing: ${absent.join(', ')}` : `${expected.length} anchor properties present`);

  for (const [id, label] of [
    ['PP-2', 'the run traverses all twelve stages, in order (C-12.1)'],
    ['PP-3', 'the governance triad is traversed and cannot be skipped (C-12.2)'],
    ['PP-5', 'two providers produce an identical stage sequence — one workflow'],
    ['PP-7', 'every agent\'s plane matches its stage — EP/IP ownership'],
    ['PP-8', 'the engine runs with NO reasoning proposals (INV-7)'],
    ['PP-9', 'aggressive load against production is refused before any load'],
    ['PP-10', 'the platform still declares exactly six capabilities (R-11.4)'],
    ['PP-10.a', 'no architecture document was added'],
    ['PP-11', 'certification yields PASS/CONDITIONAL/FAIL with a reason'],
    ['PP-12', 'a serious bottleneck is never reported as a lone symptom'],
    ['PP-13', 'the monitoring/APM adapter face is optional and invoked only when configured'],
    ['PP-14', 'pattern intelligence recognises named patterns, each with a root cause'],
    ['PP-15', 'business intelligence maps every transaction to a business impact'],
    ['PP-16', 'the Performance Knowledge Graph matches a prior verified fix and folds in recurrence'],
    ['PP-17', 'optimization recommendations carry cost, risk, confidence and value'],
    ['PP-18', 'the Digital Twin is built with resources, baseline metrics and a confidence'],
    ['PP-19', 'scenarios simulate deterministically; Black Friday predicts FAIL on a healthy baseline'],
    ['PP-20', 'a certification verdict is predicted before execution and compared against reality'],
    ['PP-21', 'simulate mode makes Execution NOT-APPLICABLE and still predicts (the twin never executes load)'],
  ]) {
    const p = observed.properties.find((x) => x.id === id);
    check(label, p !== undefined && p.ok === true, p ? p.detail.slice(0, 150) : `${id} absent`);
  }

  line('\n3. Agent census');
  const c = observed.census ?? {};
  check('the agent catalogue is within its declared scale', c.domainAgents >= 90 && c.domainAgents <= 220, `${c.domainAgents} domain agents (declared floor 90) + ${c.governanceAgents} governance across ${c.domains} domains`);
  check('one master orchestrator and twenty-four domain orchestrators', c.masterOrchestrators === 1 && c.domainOrchestrators === 24, `1 master, ${c.domainOrchestrators} domain orchestrators (incl. pattern, business, knowledge, twin, simulation)`);
  check('the load-generator, test-management and monitoring catalogues are present', c.loadGenerators >= 5 && c.testManagementProviders >= 3 && c.monitoringProviders >= 11, `${c.loadGenerators} load generators, ${c.testManagementProviders} test-management, ${c.monitoringProviders} APM/monitoring providers`);
  check('agents span both planes, with load generation in the Execution Plane', c.executionPlaneAgents > 0 && c.intelligencePlaneAgents > 0, `IP ${c.intelligencePlaneAgents} · EP ${c.executionPlaneAgents}`);
  check('the engine is not wholly dependent on reasoning (INV-7)', c.deterministicAgents > c.reasoningAgents, `${c.deterministicAgents} deterministic, ${c.reasoningAgents} declare an AI capability class`);

  const evidence = {
    evidenceId: 'performance-conformance', generator: 'governance/verification/verify-performance-conformance.js', generatorVersion: '1.0.0',
    executionContext: `node ${process.version} on ${process.platform}`, repository: 'DBiz_IntelligencePlane', capability: 'performance-engine',
    adrReference: ['ADR-0026'], ruleReference: ['C-11.11', 'C-11.13', 'C-12.1', 'C-12.2', 'C-12.12', 'C-13.1', 'C-14.1'],
    properties: observed.properties, census: observed.census, digest: observed.digest,
    verificationStatus: failures === 0 ? 'verified' : 'failed',
  };
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Performance Engine conforms to the capability architecture.');
  line('One capability of six. One orchestration lifecycle. No load before certification. AI-optional by construction.');
} else line(`RESULT: FAIL — ${failures} conformance property violated.`);
line('');
process.exit(failures === 0 ? 0 : 1);
