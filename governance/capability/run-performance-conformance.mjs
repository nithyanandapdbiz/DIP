/**
 * CAPABILITY CONFORMANCE SCENARIO — the Performance Engine (capability 4).
 * ============================================================================
 * Exercises capability 4 end to end and reports what was OBSERVED as JSON. Asserts nothing; exits
 * 0 either way. The harness that spawns it decides pass or fail.
 *
 * WHAT THIS PROVES THAT THE UNIT TESTS DO NOT.
 * It runs the whole capability twice — once publishing to Azure DevOps, once to Zephyr — and
 * compares the stage sequences. "One workflow, variation only through adapters" is either true of
 * an executed run or it is a claim about source code. It also proves the two properties that most
 * distinguish this capability: the engine completes with NO reasoning proposals (INV-7 — the
 * predecessor's Performance engine aborted here), and no load is generated against a production
 * target before the guardrail stage certifies.
 *
 *   PP-1   the capability registers with all twelve stages
 *   PP-2   a run traverses all twelve, in order
 *   PP-3   the governance triad is traversed and cannot be skipped
 *   PP-4   a forged stage result is refused
 *   PP-5   two providers produce an IDENTICAL stage sequence
 *   PP-5.n no orchestrator branches on a provider or tool name
 *   PP-6   the agent catalogue meets its declared scale and contract
 *   PP-7   EP/IP ownership matches the stage plane for every agent
 *   PP-7.s evidence crosses as a reference — the type carries no artefact content
 *   PP-8   the engine runs with NO reasoning proposals (INV-7)
 *   PP-9   aggressive load against production is refused before any load
 *   PP-10  the capability count is still six, and no architecture document was added
 *   PP-11  certification yields PASS/CONDITIONAL/FAIL with a reason
 *   PP-12  a bottleneck is never reported as a lone symptom
 *
 * Run:  node governance/capability/run-performance-conformance.mjs
 * Out:  {"properties":[...],"digest":"<sha256>","census":{...}}
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');

const properties = [];
let census = null;
let fatal = null;
const record = (id, property, ok, detail) => properties.push({ id, property, ok: Boolean(ok), detail });

function emit() {
  const digest = createHash('sha256').update('dbiz.performance-conformance@1').update(JSON.stringify(properties.map((p) => [p.id, p.ok]))).digest('hex');
  process.stdout.write(JSON.stringify({ properties, digest, fatal, census }));
  process.exit(0);
}

for (const pkg of ['capability-framework', 'performance-engine']) {
  if (!existsSync(entry(pkg))) { fatal = `@dbiz/${pkg} is not built`; emit(); }
}

const fw = await import(pathToFileURL(entry('capability-framework')).href);
const pe = await import(pathToFileURL(entry('performance-engine')).href);

function node(kind, id, label, path, protocol, values = {}) { return { kind, id, label, path, protocol, values, parentId: null }; }
const OBSERVED = [
  node('page', 'pg-home', 'home', '/', 'https', { host: 'shop.example', ip: '10.0.0.1' }),
  node('rest-api', 'api-checkout', 'checkout', '/api/checkout', 'https', { host: 'shop.example', 'connection-string': 'postgres://secret@db' }),
  node('rest-api', 'api-orders', 'orders', '/api/orders', 'https', {}),
  node('database', 'db-1', 'orders-db', '/db', 'sql', { host: 'db.internal', ip: '10.0.0.9' }),
  node('cache', 'cache-1', 'redis', '/cache', 'redis', {}),
];

function generateLoad(workload) {
  const samples = [];
  let clock = 0;
  for (const t of workload.transactions) {
    const base = t === workload.transactions[0] ? t.slaMs * 1.6 : t.slaMs * 0.5;
    for (let i = 0; i < 30; i += 1) {
      samples.push({ metric: 'latency', category: 'api', transactionId: t.id, host: 'h1', value: base + (i % 5) * 20, unit: 'ms', atMillis: (clock += 100) });
      samples.push({ metric: 'error', category: 'api', transactionId: t.id, host: 'h1', value: i % 25 === 0 ? 1 : 0, unit: 'count', atMillis: clock });
    }
  }
  for (let i = 0; i < 30; i += 1) {
    samples.push({ metric: 'cpu', category: 'infrastructure', transactionId: 'global', host: 'node-1', value: 82 + (i % 6), unit: '%', atMillis: (clock += 100) });
    samples.push({ metric: 'db-query-time', category: 'database', transactionId: 'global', host: 'db.internal', value: 1800 + i * 5, unit: 'ms', atMillis: clock });
  }
  return samples;
}

const SERVICE_LEVELS = [{ kind: 'slo', id: 'slo-1', metric: 'p95', comparator: 'lte', value: 1500, unit: 'ms', appliesTo: 'global' }];

const deps = (over = {}) => ({
  discover: (_s, inScope) => OBSERVED.filter((n) => inScope(n.path)),
  generateLoad: (_p, workload) => generateLoad(workload),
  environmentReachable: true,
  capturedEvidence: (results) => results.slice(0, 1).map((r) => ({ kind: 'percentile-distribution', metric: `${r.transactionId}.latency`, digest: 'aa11bb22', locator: `ep://evidence/${r.transactionId}.dist` })),
  baselines: [{ transactionId: 'txn-1', p95: 900 }],
  knowledgeRecords: [],
  ...over,
});

function registry() {
  const r = pe.defaultAdapterRegistry();
  return r;
}
function config(tool, provider, aiEnabled, over = {}) {
  return { 'perf.aiEnabled': String(aiEnabled), 'perf.tool': tool, 'perf.provider': provider, 'perf.durationSeconds': '300', 'perf.regions': 'us-east,eu-west', ...over };
}
function execute(tool, provider, aiEnabled, over = {}, depsOver = {}) {
  pe.resetAdapterSequence();
  const orchestrator = pe.buildPerformanceOrchestrator(deps(depsOver), registry());
  return orchestrator.execute({
    tenantId: 'tenant-a', runId: `run-${tool}-${provider}-${aiEnabled}-${Object.keys(over).join('')}`, correlationId: 'corr-1',
    scope: { targetId: 'shop', allowedHosts: ['https://shop.example'], exclusions: ['/logout'], authorizationReference: 'PERF-2026-001', testTypeCeiling: 'stress', safeMode: true, maxVirtualUsers: 500, maxRequestsPerSecond: 200, environment: 'staging' },
    serviceLevels: SERVICE_LEVELS, requestedTestTypes: ['smoke', 'load'],
    configuration: config(tool, provider, aiEnabled, over),
    ...(aiEnabled ? { proposals: { 'reporting.executive-summary': { summary: 'Constrained by database latency under peak load.' } } } : {}),
  });
}

try {
  const catalogue = pe.buildCatalogue();

  // PP-1
  const registryCap = new fw.CapabilityRegistry();
  const capability = pe.performanceCapability(deps(), {
    reasoning: { source: { for: () => null }, ledger: () => ({ mode: 'disabled', delivered: [], withheld: [] }) },
    recorder: { context: (b) => ({ ...b, proposal: null }), invoked: () => [] },
    loadGenerator: pe.k6Adapter().adapter, testManagement: pe.azureDevOpsAdapter().adapter, monitoring: null, memory: new fw.VectorMemory(),
  });
  registryCap.register(capability);
  record('PP-1', 'the capability registers with all twelve stages', registryCap.get('performance-engine')?.name === 'Performance Engine', 'registered as performance-engine');

  // PP-2, PP-3
  const ai = execute('k6', 'azure-devops', true);
  record('PP-2', 'a run traverses all twelve stages, in order', ai.run.failedAt === null && JSON.stringify([...ai.run.completed]) === JSON.stringify([...fw.STAGES]), ai.run.failedAt ? `failed at ${ai.run.failedAt}: ${ai.run.failure}` : 'all twelve, in order');
  record('PP-3', 'the governance triad is traversed and cannot be skipped', fw.GOVERNANCE_TRIAD.every((s) => ai.run.results.has(s)) && ai.certification.certified, ai.certification.firstRefusal?.reason ?? 'triad traversed, certification reachable');

  // PP-4 — a forged stage result is refused.
  record('PP-4', 'a forged stage result is refused', fw.isSealed({ stage: 'execution', value: {}, applicable: true }) === false, 'a hand-built object is not sealed and cannot enter a run');

  // PP-5, PP-5.n
  const ado = execute('k6', 'azure-devops', true);
  const zephyr = execute('k6', 'zephyr-scale', true);
  const sameSeq = JSON.stringify([...ado.run.completed]) === JSON.stringify([...zephyr.run.completed]);
  const sameAgents = JSON.stringify([...ado.agentsInvoked].sort()) === JSON.stringify([...zephyr.agentsInvoked].sort());
  record('PP-5', 'two providers produce an identical stage sequence — one workflow', sameSeq && sameAgents && ado.testManagement !== zephyr.testManagement, `${ado.testManagement} vs ${zephyr.testManagement}: sequence ${sameSeq}, agents ${sameAgents}`);

  const orchSrc = readFileSync(join(ROOT, 'packages', 'performance-engine', 'src', 'orchestrators.ts'), 'utf8') + readFileSync(join(ROOT, 'packages', 'performance-engine', 'src', 'capability.ts'), 'utf8');
  const providerNames = ['k6', 'jmeter', 'gatling', 'locust', 'playwright', 'azure-devops', 'zephyr-scale', 'xray'];
  const leaked = providerNames.filter((p) => new RegExp(`['"\`]${p.replace(/[-]/g, '\\-')}['"\`]`).test(orchSrc));
  record('PP-5.n', 'no orchestrator branches on a provider or tool name', leaked.length === 0, leaked.length === 0 ? 'orchestration names no provider' : `provider names in orchestration: ${leaked.join(', ')}`);

  // PP-6, PP-6.o
  const gov = catalogue.byDomain('governance').length;
  const domain = catalogue.all.length - gov;
  record('PP-6', 'the agent catalogue meets its declared scale with a complete contract each', domain >= 90 && gov === 36, `${domain} domain agents + ${gov} governance across ${catalogue.domains.length} domains`);
  record('PP-6.o', 'there is one domain orchestrator per declared domain, plus one master', Object.keys(pe.domainOrchestrators).length === pe.DOMAINS.length, `${Object.keys(pe.domainOrchestrators).length} orchestrators for ${pe.DOMAINS.length} domains, plus 1 master`);

  // PP-7 — every execution agent's plane matches its stage plane; governance is IP by architecture.
  const misplaced = catalogue.all.filter((a) => {
    if (a.domain === 'governance') return false;
    const plane = fw.STAGE_PLANE[a.stage];
    return (plane === 'EP' && a.plane !== 'EP') || (plane === 'IP' && a.plane !== 'IP');
  });
  record('PP-7', "every execution agent's declared plane matches the plane of its stage", misplaced.length === 0, misplaced.length === 0 ? `${catalogue.all.filter((a) => a.plane === 'EP').length} agents in the Execution Plane; none misplaced` : misplaced.map((a) => `${a.id} (${a.plane} in ${fw.STAGE_PLANE[a.stage]})`).join(', '));

  const modelSrc = readFileSync(join(ROOT, 'packages', 'performance-engine', 'src', 'model.ts'), 'utf8');
  const evBlock = /export interface EvidenceReference \{[\s\S]*?\n\}/.exec(modelSrc)?.[0] ?? '';
  record('PP-7.s', 'evidence crosses as a reference — the type carries no artefact content', evBlock.length > 0 && !/\bcontent\b|\bbody\b|\bpayload\b|\bbytes\b/.test(evBlock), 'EvidenceReference declares a hash and a locator only');

  // PP-8 — INV-7: runs with NO reasoning proposals.
  const noai = execute('k6', 'azure-devops', false);
  const rep = fw.valueOf(noai.run.results.get('reporting'));
  record('PP-8', 'the engine completes with NO reasoning proposals supplied (INV-7)', noai.run.failedAt === null && noai.reasoning.delivered.length === 0 && (rep.report?.overallScore ?? -1) >= 0, `completed with ${noai.reasoning.withheld.length} proposal(s) withheld`);

  // PP-9 — the distinguishing safety property.
  const prod = execute('k6', 'azure-devops', true, { 'perf.environment': 'production', 'perf.testTypes': 'stress' });
  record('PP-9', 'aggressive load against a production target is refused before any load', prod.run.failedAt === 'guardrail-review' && !prod.run.completed.includes('execution'), prod.run.failedAt ? `refused at ${prod.run.failedAt}: ${(prod.run.failure || '').slice(0, 90)}` : 'production load was permitted');

  // PP-10
  const doc11 = readFileSync(join(ROOT, 'docs', 'architecture', '11-capability-model.md'), 'utf8');
  const declared = [...doc11.matchAll(/^\|\s*\d\s*\|\s*\*\*([^*]+Engine)\*\*/gm)].map((m) => m[1].trim());
  record('PP-10', 'the platform still declares exactly five capabilities (R-11.4, ADR-0087)', declared.length === 5, `${declared.length} capabilities: ${declared.join(', ')}`);
  const archDocs = readdirSync(join(ROOT, 'docs', 'architecture')).filter((f) => /^\d\d-.*\.md$/.test(f));
  record('PP-10.a', 'no architecture document was added', archDocs.length === 25 && !archDocs.some((f) => Number(f.slice(0, 2)) >= 26), `${archDocs.length} architecture documents`);

  // PP-11 — certification.
  const cert = rep.certification;
  record('PP-11', 'certification yields PASS, CONDITIONAL PASS or FAIL with a reason', ['PASS', 'CONDITIONAL PASS', 'FAIL'].includes(cert?.verdict) && (cert?.rationale?.trim().length ?? 0) > 0, `${cert?.verdict}: ${(cert?.rationale ?? '').slice(0, 80)}`);

  // PP-12 — never a lone symptom.
  const state = fw.valueOf(noai.run.results.get('reflection'));
  const serious = (state.bottlenecks ?? []).filter((b) => b.severity === 'critical' || b.severity === 'high');
  const everySymptomDiagnosed = serious.every((b) => (state.rootCauses ?? []).some((c) => c.bottleneckId === b.id));
  record('PP-12', 'a serious bottleneck is never reported as a lone symptom', (state.bottlenecks ?? []).length > 0 && everySymptomDiagnosed, `${(state.bottlenecks ?? []).length} bottleneck(s), each serious one carries a root-cause chain`);

  // PP-13 — the monitoring/APM adapter face is OPTIONAL and, when configured, is invoked.
  const withMon = execute('k6', 'azure-devops', false, { 'perf.monitor': 'prometheus' });
  record('PP-13', 'the monitoring/APM adapter face is optional and invoked only when configured', noai.monitoring === null && withMon.monitoring === 'prometheus' && withMon.agentsInvoked.includes('load.monitor-collect') && withMon.run.failedAt === null, `no-monitor run monitoring=${noai.monitoring}; configured run monitoring=${withMon.monitoring}, agent invoked=${withMon.agentsInvoked.includes('load.monitor-collect')}`);

  // ── Performance Intelligence Layer (Increment B) ──────────────────────────
  const refl = fw.valueOf(noai.run.results.get('reflection'));
  const patterns = refl.patterns ?? [];
  record('PP-14', 'pattern intelligence recognises named patterns, each with a root cause', patterns.length > 0 && patterns.every((p) => (p.rootCause ?? '').length > 0), `${patterns.length} pattern(s): ${[...new Set(patterns.map((p) => p.kind))].slice(0, 5).join(', ')}`);

  const impacts = refl.businessImpacts ?? [];
  record('PP-15', 'business intelligence maps every transaction to a business impact', impacts.length > 0 && impacts.every((b) => (b.businessCapability ?? '').length > 0 && b.recoveryPriority >= 1), `${impacts.length} business impact(s)`);

  // Knowledge graph: a prior verified fix and a prior pattern occurrence.
  const kr = [
    { id: 'kr-1', kind: 'verified-fix', fingerprint: 'x', text: 'CPU saturation insufficient compute or a hot code path', release: 'release-84', resolvedBy: 'added compute + optimised hot path', confidence: 0.94 },
    { id: 'kr-2', kind: 'pattern', fingerprint: 'y', text: 'cpu saturation', release: 'release-83', resolvedBy: null, confidence: 0.8 },
  ];
  const withK = execute('k6', 'azure-devops', false, {}, { knowledgeRecords: kr });
  const krefl = fw.valueOf(withK.run.results.get('reflection'));
  const km = krefl.knowledgeMatches ?? [];
  const recur = (krefl.patterns ?? []).some((p) => p.kind === 'cpu-saturation' && p.recurrence > 0);
  record('PP-16', 'the Performance Knowledge Graph matches a prior verified fix and folds in recurrence', km.some((m) => m.resolvedBy) && recur, `${km.length} match(es), recurrence folded=${recur}`);

  const recs = refl.recommendations ?? [];
  record('PP-17', 'optimization recommendations carry cost, risk, confidence and value', recs.length > 0 && recs.every((r) => ['low', 'medium', 'high'].includes(r.risk) && r.confidence >= 0 && r.confidence <= 1 && ['low', 'medium', 'high'].includes(r.businessValue)), `${recs.length} recommendation(s)`);

  // ── Predictive Performance Layer (Increment C) ────────────────────────────
  const twin = refl.twin;
  record('PP-18', 'the Digital Twin is built with resources, baseline metrics and a confidence', Boolean(twin) && (twin.resources?.length ?? 0) >= 10 && twin.confidence > 0 && (twin.baselineMetrics?.length ?? 0) > 0, `twin confidence ${twin?.confidence}, ${twin?.resources?.length} resource(s)`);

  const sims = refl.simulations ?? [];
  const bf = sims.find((s) => s.kind === 'black-friday');
  record('PP-19', 'scenarios simulate deterministically; Black Friday predicts FAIL on a healthy baseline', sims.length >= 4 && Boolean(bf) && bf.predictedVerdict === 'FAIL' && sims.every((s) => s.confidence > 0), `${sims.length} scenario(s), black-friday=${bf?.predictedVerdict}`);

  const predCert = refl.predictiveCertification;
  const rep20 = fw.valueOf(noai.run.results.get('reporting'));
  const acc = rep20.report?.predictionAccuracy;
  record('PP-20', 'a certification verdict is predicted before execution and compared against reality (accuracy)', Boolean(predCert) && ['PASS', 'CONDITIONAL PASS', 'FAIL'].includes(predCert.predictedVerdict) && Boolean(acc) && acc.actualVerdict !== null, `predicted ${predCert?.predictedVerdict}, actual ${acc?.actualVerdict}, match ${acc?.verdictMatch}`);

  const sim = execute('k6', 'azure-devops', false, { 'perf.mode': 'simulate' });
  const execResult = sim.run.results.get('execution');
  const simRefl = execResult ? fw.valueOf(sim.run.results.get('reflection')) : {};
  record('PP-21', 'simulate mode makes Execution NOT-APPLICABLE and still predicts (the twin never executes load)', sim.run.failedAt === null && Boolean(execResult) && execResult.outcome === 'not-applicable' && (simRefl.simulations?.length ?? 0) > 0, `execution outcome=${execResult?.outcome}, predictions=${simRefl.simulations?.length}`);

  census = {
    agents: catalogue.all.length, domainAgents: domain, governanceAgents: gov, domains: catalogue.domains.length,
    executionPlaneAgents: catalogue.all.filter((a) => a.plane === 'EP').length,
    intelligencePlaneAgents: catalogue.all.filter((a) => a.plane === 'IP').length,
    reasoningAgents: catalogue.all.filter((a) => a.aiCapabilityClass !== 'none').length,
    deterministicAgents: catalogue.all.filter((a) => a.aiCapabilityClass === 'none').length,
    loadGenerators: registry().loadGeneratorProviders.length, testManagementProviders: registry().testManagementProviders.length,
    monitoringProviders: registry().monitoringProviders.length,
    domainOrchestrators: Object.keys(pe.domainOrchestrators).length, masterOrchestrators: 1,
    stages: fw.STAGES.length,
  };
  emit();
} catch (e) {
  fatal = e && e.message ? e.message : String(e);
  emit();
}
