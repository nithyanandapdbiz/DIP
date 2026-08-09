'use strict';
/**
 * GOVERNANCE — Dev-Change Engine ENTERPRISE CERTIFICATION.
 * ============================================================================
 * Judges the measured certification evidence for capability 2 against the enterprise
 * success criteria. Runs the certification harness, then decides. It certifies ONLY on
 * measured runtime behaviour — never because code exists.
 *
 * This is the certification counterpart to verify-devchange-conformance.js. Conformance
 * asks "does the engine do the specific things it was built to do?"; certification asks
 * "is runtime completeness 100%, is every fault type detected and replayable, and does
 * the platform integration hold?" — the enterprise bar.
 *
 * Run:  node governance/verification/verify-devchange-certification.js
 * Exit: 0 = ENTERPRISE CERTIFIED   1 = not certified
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS = path.join(ROOT, 'governance', 'capability', 'run-devchange-certification.mjs');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'devchange-certification-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures += 1;
};

line('');
line('GOVERNANCE — Dev-Change Engine ENTERPRISE CERTIFICATION');
line('='.repeat(74));

line('\n1. Preconditions');
const REQUIRED = ['capability-framework', 'dev-change-engine'];
const unbuilt = REQUIRED.filter((p) => !fs.existsSync(path.join(ROOT, 'packages', p, 'dist', 'src', 'index.js')));
check('the capability packages are built', unbuilt.length === 0, unbuilt.join(', ') || `${REQUIRED.length} present`);
check('the certification harness exists', fs.existsSync(HARNESS));
if (unbuilt.length || !fs.existsSync(HARNESS)) {
  line('\nRESULT: NOT CERTIFIED — cannot measure.'); process.exit(1);
}

line('\n2. Harness execution');
const run = spawnSync(process.execPath, [HARNESS], { cwd: ROOT, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
let obs = null;
if (run.status !== 0) check('the harness executed', false, `exit ${run.status}: ${(run.stderr || '').slice(0, 300)}`);
else { try { obs = JSON.parse(run.stdout); } catch { obs = null; } check('the harness produced measurements', obs !== null); }

if (obs) {
  const m = obs.measurements;
  const rr = m.runtimeReachability;

  line('\n3. Runtime completeness (Step 2)');
  check('runtime completeness equals 100%', rr.completenessPercent === 100, `${rr.completenessPercent}% — ${rr.agents.executed}/${rr.agents.registered} agents`);
  check('no registered agent is dormant', rr.agents.neverExecuted.length === 0, rr.agents.neverExecuted.join(', ') || 'all executed');
  check('every domain orchestrator executed', rr.orchestrators.executed === rr.orchestrators.registered, `${rr.orchestrators.executed}/${rr.orchestrators.registered}`);
  check('no inert domain', rr.domains.inert.length === 0, rr.domains.inert.join(', ') || `${rr.domains.executed} active`);
  check('every stage executed', rr.stages.executed === rr.stages.declared, `${rr.stages.executed}/${rr.stages.declared}`);

  line('\n4. Adapter reachability (Step 5)');
  check('every declared adapter operation is invoked', m.adapters.invokedOps === m.adapters.declaredOps, `${m.adapters.invokedOps}/${m.adapters.declaredOps}`);
  for (const [spi, v] of Object.entries(m.adapters.coverage)) {
    check(`  ${spi}: every operation invoked`, v.uninvoked.length === 0, v.uninvoked.length ? `uninvoked: ${v.uninvoked.join(', ')}` : `${v.invoked}/${v.declared}`);
  }

  line('\n5. EP/IP boundary (Step 6)');
  check('no source line reaches the Intelligence Plane', m.boundary.noSourceLine === true);
  check('no commit message reaches the Intelligence Plane', m.boundary.noCommitMessage === true);
  check('no author reaches the Intelligence Plane', m.boundary.noAuthor === true);
  check('every EP-stage agent is declared Execution-Plane', m.boundary.epAgentsOnEpStages === true);

  line('\n6. AI-enabled vs AI-disabled (Step 7)');
  check('the invocation graph is IDENTICAL', m.ai.identicalAgentSet === true && m.ai.identicalStages === true, `${m.ai.aiCount} vs ${m.ai.noAiCount} agents`);
  check('no proposal is delivered when reasoning is disabled', m.ai.proposalsDeliveredWhenDisabled === 0);

  line('\n7. Provider workflow equality (Step 8)');
  check('two providers preserve an identical workflow', m.provider.identicalStages === true && m.provider.identicalAgentSet === true);
  check('the providers genuinely differ (not trivially equal)', m.provider.differentProviders === true, `${m.provider.adoProviders.sourceControl} vs ${m.provider.ghProviders.sourceControl}`);

  line('\n8. Governance derived from runtime (Step 9)');
  check('the governance triad is traversed', m.governance.triadTraversed === true);
  check('every stage is certified from the run', m.governance.everyStageCertified === true);
  check('audit events derive from the run, not a hand-written list', m.governance.auditEventsFromRun > 0, `${m.governance.auditEventsFromRun} audit events`);

  line('\n9. Fault proofs, replayed (Step 10)');
  const proved = obs.faults.filter((f) => f.proved).length;
  check('every fault type is detected and replayable', proved === obs.faults.length, `${proved}/${obs.faults.length}`);
  for (const f of obs.faults) check(`  fault "${f.name}" detected + replayed`, f.proved === true, (f.reason || '').slice(0, 80));

  const evidence = {
    evidenceId: 'dev-change-engine-certification',
    generator: 'governance/verification/verify-devchange-certification.js',
    generatorVersion: '1.0.0',
    executionContext: `node ${process.version} on ${process.platform}`,
    repository: 'DBiz_IntelligencePlane', capability: 'dev-change-engine',
    timestamp: new Date().toISOString(),
    adrReference: ['ADR-0024'],
    measurements: m, faults: obs.faults, faultsProved: obs.faultsProved,
    certificationStatus: failures === 0 ? 'ENTERPRISE CERTIFIED' : 'NOT CERTIFIED',
  };
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: ENTERPRISE CERTIFIED — Dev-Change Engine.');
  line('100% runtime completeness · boundary fault-proved · one graph both modes · providers preserved.');
} else {
  line(`RESULT: NOT CERTIFIED — ${failures} criterion/criteria not met.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
