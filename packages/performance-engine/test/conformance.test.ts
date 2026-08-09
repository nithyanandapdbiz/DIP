/**
 * Performance Engine conformance.
 * TRACEABILITY: 11-capability-model.md · 12-capability-orchestration.md
 *               06-data-sovereignty.md · 14-tool-operating-model.md · 13-ai-operating-model.md
 *   Criteria: C-11.5, C-11.11, C-11.13, C-12.1, C-12.2, C-12.11, C-12.12, C-13.1, C-14.1
 *   ADR: ADR-0026
 * Categories: capability, orchestration, sovereignty, completeness, negative
 *
 * Every property here executes the whole engine through the framework runner — the only way into
 * a stage — because a seam that constructed a stage result would be the bypass R-12.11 forbids.
 * The properties that matter most are the ones that would catch the failure classes this
 * programme exists to eliminate: load generated before the guardrail certified, a raw host value
 * that crossed the plane boundary, a bottleneck reported as a lone symptom, a verdict of PASS on
 * NOT MEASURED evidence, an engine that aborted because reasoning was unavailable, and domain
 * orchestrators that exist and never run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentCatalogue, CapabilityRegistry, STAGES, GOVERNANCE_TRIAD, VectorMemory, resolveReasoningMode, defineAgent,
} from '@dbiz/capability-framework';
import {
  buildCatalogue, buildPerformanceOrchestrator, performanceCapability,
  PerformanceAdapterRegistry, defaultAdapterRegistry, resetAdapterSequence,
  k6Adapter, azureDevOpsAdapter, zephyrAdapter, dynatraceAdapter,
  renderPdf, boardReport, minimiseNode, summarise, scrubLabel, DOMAINS, domainOrchestrators,
  type EngineDependencies, type ObservedNode, type PerformanceRequest, type RawSample, type ServiceLevel,
  type TransactionResult,
} from '../src/index.js';

// ── A synthetic system the Execution Plane "discovered and load-tested" ──────

function node(kind: ObservedNode['kind'], id: string, label: string, path: string, protocol: ObservedNode['protocol'], values: Record<string, string> = {}): ObservedNode {
  return { kind, id, label, path, protocol, values, parentId: null };
}

const OBSERVED: readonly ObservedNode[] = [
  node('page', 'pg-home', 'home', '/', 'https', { host: 'shop.example', ip: '10.0.0.1' }),
  node('rest-api', 'api-checkout', 'checkout', '/api/checkout', 'https', { host: 'shop.example', 'connection-string': 'postgres://secret@db' }),
  node('rest-api', 'api-orders', 'orders', '/api/orders', 'https', { host: 'shop.example' }),
  node('graphql-api', 'gql', 'graphql', '/graphql', 'graphql', {}),
  node('database', 'db-1', 'orders-db', '/db', 'sql', { host: 'db.internal', ip: '10.0.0.9' }),
  node('cache', 'cache-1', 'redis', '/cache', 'redis', {}),
  node('queue', 'q-1', 'kafka', '/queue', 'kafka', {}),
];

/** Deterministic synthetic load: latency, errors and infra saturation per transaction. */
function generateLoad(workload: { transactions: readonly { id: string; slaMs: number }[] }): readonly RawSample[] {
  const samples: RawSample[] = [];
  let clock = 0;
  for (const t of workload.transactions) {
    // Latency above the SLA for the first transaction (a breach), within SLA for the rest.
    const base = t === workload.transactions[0] ? t.slaMs * 1.6 : t.slaMs * 0.5;
    for (let i = 0; i < 30; i += 1) {
      samples.push({ metric: 'latency', category: 'api', transactionId: t.id, host: 'h1', value: base + (i % 5) * 20, unit: 'ms', atMillis: (clock += 100) });
      samples.push({ metric: 'error', category: 'api', transactionId: t.id, host: 'h1', value: i % 25 === 0 ? 1 : 0, unit: 'count', atMillis: clock });
    }
  }
  // Global infrastructure saturation -> a CPU and a database bottleneck.
  for (let i = 0; i < 30; i += 1) {
    samples.push({ metric: 'cpu', category: 'infrastructure', transactionId: 'global', host: 'node-1', value: 82 + (i % 6), unit: '%', atMillis: (clock += 100) });
    samples.push({ metric: 'db-query-time', category: 'database', transactionId: 'global', host: 'db.internal', value: 1800 + i * 5, unit: 'ms', atMillis: clock });
  }
  return samples;
}

const SERVICE_LEVELS: readonly ServiceLevel[] = [
  { kind: 'slo', id: 'slo-1', metric: 'p95', comparator: 'lte', value: 1500, unit: 'ms', appliesTo: 'global' },
];

function dependencies(overrides: Partial<EngineDependencies> = {}): EngineDependencies {
  return {
    discover: (_scope, inScope) => OBSERVED.filter((n) => inScope(n.path)),
    generateLoad: (_plan, workload) => generateLoad(workload),
    environmentReachable: true,
    capturedEvidence: (results: readonly TransactionResult[]) => results.slice(0, 1).flatMap((r) => [
      { kind: 'percentile-distribution' as const, metric: `${r.transactionId}.latency`, digest: 'aa11bb22', locator: `ep://evidence/${r.transactionId}.dist` },
      { kind: 'flame-graph' as const, metric: 'cpu', digest: 'cc33dd44', locator: 'ep://evidence/cpu.flame' },
    ]),
    baselines: [{ transactionId: 'txn-1', p95: 900 }],
    knowledgeRecords: [],
    ...overrides,
  };
}

function registryFor(): PerformanceAdapterRegistry { return defaultAdapterRegistry(); }

function configuration(tool: string, provider: string, aiEnabled: boolean, over: Record<string, string> = {}): Record<string, string> {
  return {
    'perf.aiEnabled': String(aiEnabled),
    'perf.tool': tool, 'perf.provider': provider,
    'perf.durationSeconds': '300',
    'perf.regions': 'us-east,eu-west',
    ...over,
  };
}

const PROPOSALS = {
  'scope.workload-objective': { peakConcurrency: 40, throughput: 40 },
  'workload.transaction-identification': { groups: [] },
  'bottleneck.ai-hypothesis': { order: [] },
  'capacity.prediction': { predictions: [{ kind: 'cost-increase', subject: 'infra', likelihood: 0.5 }] },
  'reporting.executive-summary': { summary: 'Performance is constrained by database latency under peak load.' },
};

function run(tool: string, provider: string, aiEnabled: boolean, deps = dependencies(), configOver: Record<string, string> = {}) {
  resetAdapterSequence();
  const registry = registryFor();
  const orchestrator = buildPerformanceOrchestrator(deps, registry);
  const request: PerformanceRequest = {
    tenantId: 'tenant-a', runId: `run-${tool}-${provider}-${aiEnabled}-${Object.keys(configOver).join('')}`, correlationId: 'corr-1',
    scope: {
      targetId: 'shop', allowedHosts: ['https://shop.example'], exclusions: ['/logout'], authorizationReference: 'PERF-2026-001',
      testTypeCeiling: 'stress', safeMode: true, maxVirtualUsers: 500, maxRequestsPerSecond: 200, environment: 'staging',
    },
    serviceLevels: SERVICE_LEVELS,
    requestedTestTypes: ['smoke', 'load'],
    configuration: configuration(tool, provider, aiEnabled, configOver),
    ...(aiEnabled ? { proposals: PROPOSALS } : {}),
  };
  return { result: orchestrator.execute(request), orchestrator };
}

function finalState(result: ReturnType<typeof run>['result']): Record<string, unknown> {
  const reporting = result.run.results.get('reporting');
  assert.ok(reporting, `reporting produced no sealed result; run failed at ${result.run.failedAt}: ${result.run.failure}`);
  return reporting.value as Record<string, unknown>;
}

// ── 1. The lifecycle ────────────────────────────────────────────────────────

describe('the twelve-stage lifecycle', () => {
  it('traverses every stage in order and fails at none (C-12.1)', () => {
    const { result } = run('k6', 'azure-devops', true);
    assert.equal(result.run.failure, null, `run failed at ${result.run.failedAt}: ${result.run.failure}`);
    assert.deepEqual([...result.run.completed], [...STAGES]);
  });

  it('traverses the governance triad, so certification is reachable (C-11.13)', () => {
    const { result } = run('k6', 'azure-devops', true);
    for (const stage of GOVERNANCE_TRIAD) assert.ok(result.run.results.has(stage), `${stage} did not run`);
    assert.equal(result.certification.certified, true, result.certification.firstRefusal?.reason);
  });

  it('registers as a capability, and a capability with a no-op stage is refused (R-11.16)', () => {
    const registry = new CapabilityRegistry();
    const capability = performanceCapability(dependencies(), {
      reasoning: { source: { for: () => null }, ledger: () => ({ mode: 'disabled', delivered: [], withheld: [] }) },
      recorder: { context: (b, _id) => ({ ...b, proposal: null }), invoked: () => [] },
      loadGenerator: k6Adapter().adapter, testManagement: azureDevOpsAdapter().adapter, monitoring: null, memory: new VectorMemory(),
    });
    registry.register(capability);
    assert.equal(registry.get('performance-engine')?.name, 'Performance Engine');
    const gutted = { ...capability, id: 'gutted', stages: { ...capability.stages, execution: (() => { throw new Error('x'); }) as never } };
    assert.throws(() => new CapabilityRegistry().register(gutted), /takes no context and can perform no work/);
  });
});

// ── 2. AI mode and non-AI mode: one workflow (the headline requirement) ──────

describe('AI-enabled and non-AI modes are the same workflow', () => {
  it('produces an identical stage sequence and an identical agent set', () => {
    const enabled = run('k6', 'azure-devops', true);
    const disabled = run('k6', 'azure-devops', false);
    assert.deepEqual([...enabled.result.run.completed], [...disabled.result.run.completed]);
    assert.deepEqual([...enabled.result.agentsInvoked].sort(), [...disabled.result.agentsInvoked].sort(),
      'a different set of agents ran, so the two modes are not one workflow');
  });

  it('delivers no proposal at all when AI is disabled, and still completes and certifies (INV-7)', () => {
    const { result } = run('k6', 'azure-devops', false);
    assert.equal(result.reasoningMode, 'disabled');
    assert.equal(result.reasoning.delivered.length, 0);
    assert.ok(result.reasoning.withheld.length > 0);
    assert.equal(result.run.failure, null, 'the engine must complete with reasoning unavailable (INV-7)');
    assert.equal(result.certification.certified, true, result.certification.firstRefusal?.reason);
  });

  it('delivers proposals to reasoning agents when AI is enabled', () => {
    const { result } = run('k6', 'azure-devops', true);
    assert.equal(result.reasoningMode, 'enabled');
    assert.ok(result.reasoning.delivered.includes('reporting.executive-summary'),
      'an AI-mode run delivered no proposal to the executive-summary agent');
  });

  it('reads the capability-neutral key, so the framework never sees perf.aiEnabled (C-11.11)', () => {
    assert.equal(resolveReasoningMode({ 'ai.enabled': 'true' }), 'enabled');
    assert.equal(resolveReasoningMode({ 'perf.aiEnabled': 'true' }), 'disabled');
  });
});

// ── 3. No load before certification; guardrails hold ────────────────────────

describe('execution guardrails', () => {
  it('refuses aggressive load against a production target, and stops the run at the guardrail', () => {
    const { result } = run('k6', 'azure-devops', true, dependencies(), { 'perf.environment': 'production', 'perf.testTypes': 'stress' });
    assert.equal(result.run.failedAt, 'guardrail-review', `expected refusal at guardrail-review, got ${result.run.failedAt}`);
    assert.match(result.run.failure ?? '', /production|aggressive/);
    assert.ok(!result.run.completed.includes('execution'), 'load ran despite a refused guardrail');
  });

  it('generates no load when the environment is unreachable, and stops at execution', () => {
    const { result } = run('k6', 'azure-devops', true, dependencies({ environmentReachable: false }));
    assert.equal(result.run.failedAt, 'execution');
    assert.match(result.run.failure ?? '', /did not respond/);
    assert.equal(result.rolledBack, true);
  });
});

// ── 4. Data sovereignty ─────────────────────────────────────────────────────

describe('data sovereignty', () => {
  it('minimises a node: a surface fact carries attribute NAMES and no values', () => {
    const api = OBSERVED.find((n) => n.id === 'api-checkout');
    assert.ok(api);
    const fact = minimiseNode(api);
    assert.ok(!('values' in fact), 'SurfaceFact gained a values field');
    assert.ok(!JSON.stringify(fact).includes('secret'), 'a connection-string value crossed the boundary');
    assert.ok(fact.attributeNames.includes('connection-string'), 'the attribute NAME should cross even though its value does not');
  });

  it('never carries a raw host secret into the final Intelligence Plane state', () => {
    const state = finalState(run('k6', 'azure-devops', true).result);
    const serialised = JSON.stringify({ report: state['report'], sync: state['sync'], results: state['results'], summaries: state['summaries'], bottlenecks: state['bottlenecks'] });
    assert.ok(!serialised.includes('postgres://secret'), 'a connection string reached the Intelligence Plane');
    assert.ok(!serialised.includes('10.0.0'), 'a raw host IP reached the Intelligence Plane');
  });

  it('runs discovery, load and metrics in the Execution Plane', () => {
    const catalogue = buildCatalogue();
    for (const agent of catalogue.all) {
      if (agent.domain === 'discovery' && agent.stage === 'discovery') assert.equal(agent.plane, 'EP', `${agent.id} discovers from the wrong plane`);
      if (agent.domain === 'load' && agent.stage === 'execution') assert.equal(agent.plane, 'EP', `${agent.id} loads from the wrong plane`);
      if (agent.domain === 'metrics' && agent.stage === 'evidence') assert.equal(agent.plane, 'EP', `${agent.id} captures from the wrong plane`);
    }
  });

  it('gives EvidenceReference no field that could hold an artefact', () => {
    const state = finalState(run('k6', 'azure-devops', true).result);
    const refs = state['evidence'] as unknown as Record<string, unknown>[];
    assert.ok(refs.length > 0);
    for (const r of refs) assert.deepEqual([...Object.keys(r)].sort(), ['capturedAtStage', 'kind', 'locator', 'metric', 'sha256']);
  });

  it('refuses a prompt contract that would send Execution Plane custody for reasoning', () => {
    const catalogue = new AgentCatalogue();
    assert.throws(() => catalogue.register(defineAgent({
      id: 'bad.leak', domain: 'test', stage: 'reflection', plane: 'IP',
      purpose: 'An agent that would send a raw metrics artefact for reasoning.',
      inputs: ['x'], outputs: ['y'], responsibilities: ['leak'], toolContracts: [], aiCapabilityClass: 'extraction',
      promptContract: { intent: 'Extract meaning from the raw log.', inputsProvided: ['raw log'], expects: 'a description', rejectionRules: ['none'] },
      aiBehaviour: 'Reads the captured traffic in full.', nonAiBehaviour: 'Does nothing, the honest degraded path.',
      failureHandling: 'It should never have been registered in the first place.', handle: (i: unknown) => i,
    }) as never), /Execution Plane custody/);
  });
});

// ── 5. One workflow across two test-management providers ────────────────────

describe('one workflow across two providers', () => {
  it('produces an identical stage sequence and identical agents under both', () => {
    const ado = run('k6', 'azure-devops', true);
    const zephyr = run('k6', 'zephyr-scale', true);
    assert.deepEqual([...ado.result.run.completed], [...zephyr.result.run.completed]);
    assert.deepEqual([...ado.result.agentsInvoked].sort(), [...zephyr.result.agentsInvoked].sort());
    assert.notEqual(ado.result.testManagement, zephyr.result.testManagement);
  });

  it('reaches different provider nouns, so the comparison is not trivially true', () => {
    const ado = azureDevOpsAdapter();
    const zephyr = zephyrAdapter();
    assert.equal(ado.adapter.containerNoun, 'Test Plan');
    assert.equal(zephyr.adapter.containerNoun, 'Test Cycle');
    assert.notEqual(ado.adapter.defectNoun, zephyr.adapter.defectNoun);
  });

  it('renders through two different load-generator dialects without changing the workflow', () => {
    const k6 = run('k6', 'azure-devops', true);
    const jmeter = run('jmeter', 'azure-devops', true);
    assert.deepEqual([...k6.result.run.completed], [...jmeter.result.run.completed]);
    assert.notEqual(k6.result.loadGenerator, jmeter.result.loadGenerator);
  });
});

// ── 6. Adapters are actually called ─────────────────────────────────────────

describe('adapter publication happens', () => {
  it('invokes every test-management method the engine declares', () => {
    resetAdapterSequence();
    const registry = new PerformanceAdapterRegistry();
    registry.registerLoadGenerator(k6Adapter().adapter);
    const ado = azureDevOpsAdapter();
    registry.registerTestManagement(ado.adapter);
    const orchestrator = buildPerformanceOrchestrator(dependencies(), registry);
    orchestrator.execute({
      tenantId: 't', runId: 'r-adapters', correlationId: 'c',
      scope: { targetId: 'shop', allowedHosts: ['https://shop.example'], exclusions: [], authorizationReference: 'PERF-1', testTypeCeiling: 'load', safeMode: true, maxVirtualUsers: 200, maxRequestsPerSecond: 100, environment: 'staging' },
      serviceLevels: SERVICE_LEVELS, requestedTestTypes: ['load'],
      configuration: configuration('k6', 'azure-devops', false),
    });
    const called = new Set(ado.journal.calls.map((c) => c.method));
    for (const method of ['createContainer', 'publishResult', 'publishDefect', 'publishEvidenceReference', 'linkTraceability']) {
      assert.ok(called.has(method), `${method} was never called — declared and unwired`);
    }
  });
});

// ── 7. Bottleneck intelligence and root cause ───────────────────────────────

describe('bottleneck and root-cause intelligence', () => {
  it('detects bottlenecks and gives each a full root-cause chain, never a lone symptom', () => {
    const state = finalState(run('k6', 'azure-devops', false).result);
    const bottlenecks = state['bottlenecks'] as unknown as { id: string; kind: string; severity: string }[];
    const rootCauses = state['rootCauses'] as unknown as { bottleneckId: string; chain: unknown[]; estimatedFix: string }[];
    assert.ok(bottlenecks.length > 0, 'no bottleneck was detected under a saturating load');
    for (const b of bottlenecks.filter((x) => x.severity === 'critical' || x.severity === 'high')) {
      const rca = rootCauses.find((c) => c.bottleneckId === b.id);
      assert.ok(rca, `bottleneck ${b.id} was reported with no root-cause chain`);
      assert.ok(rca.chain.length >= 2, 'a root-cause chain is a lone symptom');
      assert.ok(rca.estimatedFix.trim().length > 0, 'a root cause carries no estimated fix');
    }
  });

  it('detects a database bottleneck deterministically in non-AI mode', () => {
    const state = finalState(run('k6', 'azure-devops', false).result);
    const bottlenecks = state['bottlenecks'] as unknown as { kind: string }[];
    assert.ok(bottlenecks.some((b) => b.kind === 'database'), 'the database saturation produced no bottleneck without AI');
  });
});

// ── 8. Defects, certification, capacity ─────────────────────────────────────

describe('defects, certification and capacity', () => {
  it('raises an enterprise-grade defect for a breached threshold, with observed vs expected and a root cause', () => {
    const state = finalState(run('k6', 'azure-devops', false).result);
    const defects = state['defects'] as unknown as { observed: string; expected: string; deviation: string; thresholdId: string; recommendation: string }[];
    assert.ok(defects.length > 0, 'a threshold was breached but no defect was raised');
    for (const d of defects) {
      assert.ok(d.observed && d.expected && d.thresholdId, 'a defect is missing observed/expected/threshold');
      assert.ok(d.recommendation.trim().length > 0, 'a defect carries no recommendation');
    }
  });

  it('produces a certification with a verdict of PASS, CONDITIONAL PASS or FAIL and a reason', () => {
    const state = finalState(run('k6', 'azure-devops', false).result);
    const cert = state['certification'] as unknown as { verdict: string; rationale: string; scores: { measured: boolean }[]; overallScore: number };
    assert.ok(['PASS', 'CONDITIONAL PASS', 'FAIL'].includes(cert.verdict), `unexpected verdict ${cert.verdict}`);
    assert.ok(cert.rationale.trim().length > 0, 'the verdict carries no reason');
    assert.ok(cert.scores.some((s) => s.measured), 'no dimension was measured');
  });

  it('forecasts capacity and predicts at least one future failure mode', () => {
    const state = finalState(run('k6', 'azure-devops', false).result);
    const forecasts = state['forecasts'] as unknown as unknown[];
    const predictions = state['predictions'] as unknown as unknown[];
    assert.ok(forecasts.length > 0, 'no capacity forecast was produced');
    assert.ok(predictions.length > 0, 'no prediction was produced from a saturating load');
  });
});

// ── 8c. The Performance Intelligence Layer (Increment B) ─────────────────────

describe('the Performance Intelligence Layer', () => {
  function reflection(result: ReturnType<typeof run>['result']): Record<string, unknown> {
    const r = result.run.results.get('reflection');
    assert.ok(r, `reflection produced no result; failed at ${result.run.failedAt}: ${result.run.failure}`);
    return r.value as Record<string, unknown>;
  }

  it('D1 recognises named performance patterns, each with a root cause and evidence', () => {
    const state = reflection(run('k6', 'azure-devops', false).result);
    const patterns = state['patterns'] as { kind: string; rootCause: string; confidence: number; evidenceRefs: string[] }[];
    assert.ok(patterns.length > 0, 'no pattern was recognised under a saturating load');
    assert.ok(patterns.some((p) => p.kind === 'cpu-saturation') && patterns.some((p) => p.kind === 'database-hotspot'), 'the expected CPU and database patterns were not recognised');
    for (const p of patterns) { assert.ok(p.rootCause.trim().length > 0, 'a pattern has no root cause'); assert.ok(p.confidence > 0, 'a pattern has zero confidence'); }
  });

  it('D1 recognises a composite pattern when its primaries co-occur', () => {
    // A load that saturates CPU, GC and the connection pool implies application thread starvation.
    const composite = dependencies({
      generateLoad: (_p, workload: { transactions: readonly { id: string }[] }) => {
        const s: RawSample[] = [];
        let clock = 0;
        for (const t of workload.transactions) for (let i = 0; i < 20; i += 1) s.push({ metric: 'latency', category: 'api', transactionId: t.id, host: 'h', value: 500, unit: 'ms', atMillis: (clock += 50) });
        for (let i = 0; i < 20; i += 1) {
          s.push({ metric: 'cpu', category: 'infrastructure', transactionId: 'global', host: 'n', value: 85, unit: '%', atMillis: (clock += 50) });
          s.push({ metric: 'gc-pause', category: 'runtime', transactionId: 'global', host: 'n', value: 450, unit: 'ms', atMillis: clock });
          s.push({ metric: 'connection-pool', category: 'infrastructure', transactionId: 'global', host: 'n', value: 90, unit: '%', atMillis: clock });
        }
        return s;
      },
    });
    const state = reflection(run('k6', 'azure-devops', false, composite).result);
    const patterns = state['patterns'] as { kind: string; composite: boolean; correlatedWith: string[] }[];
    assert.ok(patterns.some((p) => p.composite && p.kind === 'thread-starvation'), 'the composite thread-starvation pattern was not recognised from its primaries');
  });

  it('D2 translates findings into business impact per transaction, with capability and score', () => {
    const state = reflection(run('k6', 'azure-devops', false).result);
    const impacts = state['businessImpacts'] as { transactionId: string; businessCapability: string; businessImpactScore: number; executiveSeverity: string; recoveryPriority: number }[];
    assert.ok(impacts.length > 0, 'no business impact was produced');
    for (const b of impacts) { assert.ok(b.businessCapability.length > 0, 'a business impact has no capability'); assert.ok(b.recoveryPriority >= 1, 'a business impact has no recovery priority'); }
    assert.ok(impacts.some((b) => b.businessCapability === 'Checkout'), 'the checkout transaction did not map to the Checkout capability');
  });

  it('D2 estimates financial exposure from configured business weights', () => {
    const weighted = run('k6', 'azure-devops', false, dependencies(), { 'perf.business': JSON.stringify({ 'txn-1': { revenuePerHour: 100000, usersPerHour: 5000 } }) });
    const impacts = reflection(weighted.result)['businessImpacts'] as { transactionId: string; estimatedFinancialExposure: number }[];
    assert.ok(impacts.some((b) => b.estimatedFinancialExposure > 0), 'configured revenue weights produced no financial exposure');
  });

  it('D3 the Knowledge Graph matches a prior verified fix and folds in recurrence', () => {
    const records = [
      { id: 'kr-1', kind: 'verified-fix' as const, fingerprint: 'x', text: 'CPU saturation insufficient compute or a hot code path', release: 'release-84', resolvedBy: 'added compute + optimised hot path', confidence: 0.94 },
      { id: 'kr-2', kind: 'pattern' as const, fingerprint: 'y', text: 'cpu saturation', release: 'release-83', resolvedBy: null, confidence: 0.8 },
    ];
    const state = reflection(run('k6', 'azure-devops', false, dependencies({ knowledgeRecords: records })).result);
    const matches = state['knowledgeMatches'] as { resolvedBy: string | null; release: string | null; similarity: number }[];
    assert.ok(matches.length > 0, 'the knowledge graph found no match for a known pattern');
    assert.ok(matches.some((m) => m.resolvedBy && /compute/.test(m.resolvedBy)), 'the prior verified fix was not surfaced');
    const patterns = state['patterns'] as { kind: string; recurrence: number }[];
    assert.ok(patterns.some((p) => p.kind === 'cpu-saturation' && p.recurrence > 0), 'recurrence from the knowledge graph was not folded into the pattern');
  });

  it('D4 produces optimization recommendations carrying cost, risk, confidence and value', () => {
    const state = reflection(run('k6', 'azure-devops', false).result);
    const recs = state['recommendations'] as { subject: string; expectedGainPercent: number; expectedCostSavingPercent: number; risk: string; confidence: number; businessValue: string; technicalValue: string }[];
    assert.ok(recs.length > 0, 'no optimization recommendation was produced');
    for (const r of recs) {
      assert.ok(['low', 'medium', 'high'].includes(r.risk), 'a recommendation has no risk grade');
      assert.ok(['low', 'medium', 'high'].includes(r.businessValue), 'a recommendation has no business value');
      assert.ok(r.confidence >= 0 && r.confidence <= 1, 'a recommendation has an out-of-range confidence');
    }
  });

  it('is deterministic: pattern and business intelligence are identical with AI enabled and disabled (INV-7)', () => {
    const on = reflection(run('k6', 'azure-devops', true).result);
    const off = reflection(run('k6', 'azure-devops', false).result);
    assert.deepEqual(on['patterns'], off['patterns'], 'pattern intelligence differs between AI modes');
    assert.deepEqual(on['businessImpacts'], off['businessImpacts'], 'business intelligence differs between AI modes');
  });

  it('surfaces the layer in the report: pattern, business, knowledge and optimization summaries', () => {
    const state = finalState(run('k6', 'azure-devops', false).result);
    const report = state['report'] as unknown as { patternCount: number; recommendationCount: number; executiveActions: string[]; engineeringActions: string[]; operationsActions: string[] };
    assert.ok(report.patternCount > 0, 'the report carries no pattern count');
    assert.ok(report.recommendationCount > 0, 'the report carries no recommendation count');
    assert.ok(report.executiveActions.length > 0 && report.engineeringActions.length > 0, 'the report carries no action lists');
  });
});

// ── 8d. The Predictive Performance Layer (Increment C) ───────────────────────

describe('the Predictive Performance Layer', () => {
  function reflection(result: ReturnType<typeof run>['result']): Record<string, unknown> {
    const r = result.run.results.get('reflection');
    assert.ok(r, `reflection produced no result; failed at ${result.run.failedAt}: ${result.run.failure}`);
    return r.value as Record<string, unknown>;
  }

  it('D1 builds a Digital Twin with resources, baseline metrics and a confidence', () => {
    const state = reflection(run('k6', 'azure-devops', false).result);
    const twin = state['twin'] as { resources: unknown[]; baselineMetrics: unknown[]; confidence: number };
    assert.ok(twin, 'no Digital Twin was built');
    assert.ok(twin.resources.length >= 10, 'the twin models too few resources');
    assert.ok(twin.baselineMetrics.length > 0 && twin.confidence > 0, 'the twin has no baseline or confidence');
  });

  it('D2 simulates scenarios (incl. Black Friday) and predicts a verdict + confidence per scenario', () => {
    const state = reflection(run('k6', 'azure-devops', false).result);
    const sims = state['simulations'] as { kind: string; predictedVerdict: string; confidence: number; predictedPatterns: unknown[] }[];
    assert.ok(sims.length >= 4, 'too few scenarios simulated');
    assert.ok(sims.some((s) => s.kind === 'black-friday'), 'Black Friday was not simulated');
    for (const s of sims) { assert.ok(['PASS', 'CONDITIONAL PASS', 'FAIL'].includes(s.predictedVerdict), 'a scenario has no verdict'); assert.ok(s.confidence > 0, 'a scenario has zero confidence'); }
    const bf = sims.find((s) => s.kind === 'black-friday');
    assert.ok(bf && bf.predictedVerdict === 'FAIL', 'Black Friday against a healthy baseline should predict FAIL');
  });

  it('D5 predicts release impact with performance/business/infra/operational risk', () => {
    const state = reflection(run('k6', 'azure-devops', false, dependencies(), { 'perf.release': 'release-132', 'perf.releaseRegression': '40' }).result);
    const rel = state['releaseImpact'] as { release: string; performanceRisk: string; predictedVerdict: string; expectedRegressionPercent: number };
    assert.ok(rel && rel.release === 'release-132', 'no release impact was predicted');
    assert.ok(['low', 'medium', 'high'].includes(rel.performanceRisk), 'release performance risk not graded');
    assert.equal(rel.expectedRegressionPercent, 40);
  });

  it('D7 answers a what-if (traffic doubled) deterministically', () => {
    const state = reflection(run('k6', 'azure-devops', false, dependencies(), { 'perf.whatif': '2.5' }).result);
    const sims = state['simulations'] as { kind: string; magnitude?: number }[];
    assert.ok(sims.some((s) => s.kind === 'what-if'), 'the configured what-if was not simulated');
  });

  it('D8 predicts a certification verdict before execution, and measures accuracy against reality', () => {
    const result = run('k6', 'azure-devops', false).result;
    const rstate = reflection(result);
    const predCert = rstate['predictiveCertification'] as { predictedVerdict: string; confidence: number };
    assert.ok(['PASS', 'CONDITIONAL PASS', 'FAIL'].includes(predCert.predictedVerdict), 'no predicted verdict');
    const report = (finalState(result)['report']) as unknown as { predictionAccuracy: { predictedVerdict: string; actualVerdict: string | null; verdictMatch: boolean | null } | null };
    assert.ok(report.predictionAccuracy, 'no prediction accuracy was measured');
    assert.equal(report.predictionAccuracy.predictedVerdict, predCert.predictedVerdict);
    assert.notEqual(report.predictionAccuracy.actualVerdict, null, 'an execute-mode run should have an actual verdict to compare');
  });

  it('simulate mode makes Execution NOT-APPLICABLE — the twin predicts and never executes load (C-12.12)', () => {
    const result = run('k6', 'azure-devops', false, dependencies(), { 'perf.mode': 'simulate' }).result;
    assert.equal(result.run.failure, null, `simulate run failed at ${result.run.failedAt}: ${result.run.failure}`);
    assert.deepEqual([...result.run.completed], [...STAGES], 'a simulate run must still traverse all twelve stages');
    const exec = result.run.results.get('execution');
    assert.ok(exec && exec.outcome === 'not-applicable', 'Execution should be NOT-APPLICABLE in simulate mode');
    assert.match(exec.reason ?? '', /never executes load|simulation mode/);
    // No load ran, but a prediction was still produced.
    const rstate = result.run.results.get('reflection');
    const sims = (rstate?.value as Record<string, unknown>)['simulations'] as unknown[];
    assert.ok(sims.length > 0, 'simulate mode produced no prediction');
  });

  it('is deterministic: the Digital Twin and simulations are identical with AI enabled and disabled (INV-7)', () => {
    const on = reflection(run('k6', 'azure-devops', true).result);
    const off = reflection(run('k6', 'azure-devops', false).result);
    assert.deepEqual(on['twin'], off['twin'], 'the twin differs between AI modes');
    assert.deepEqual(on['simulations'], off['simulations'], 'simulations differ between AI modes');
  });

  it('surfaces the predictive layer in the report: twin, simulations, forecasts and accuracy', () => {
    const state = finalState(run('k6', 'azure-devops', false).result);
    const report = state['report'] as unknown as { digitalTwinConfidence: number | null; simulationCount: number; seasonalForecasts: unknown[]; resourceForecasts: unknown[]; predictedVerdict: string | null };
    assert.ok((report.digitalTwinConfidence ?? 0) > 0, 'the report carries no twin confidence');
    assert.ok(report.simulationCount > 0, 'the report carries no simulation count');
    assert.ok(report.seasonalForecasts.length > 0 && report.resourceForecasts.length > 0, 'the report carries no forecasts');
    assert.ok(report.predictedVerdict, 'the report carries no predicted verdict');
  });
});

// ── 9. Reporting ────────────────────────────────────────────────────────────

describe('reporting', () => {
  it('renders a real PDF document', () => {
    const bytes = renderPdf('Performance', [{ title: 'Page one', lines: ['a line', 'another line'] }]);
    const text = bytes.toString('latin1');
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.includes('/Type /Catalog') && text.includes('/Type /Page'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    const objects = (text.match(/^\d+ 0 obj$/gm) ?? []).length;
    const entries = (text.match(/^\d{10} 00000 n $/gm) ?? []).length;
    assert.equal(entries, objects, 'the cross-reference table does not match the object count');
  });

  it('marks unmeasured board figures as unmeasured rather than zero (R-13.3)', () => {
    const report = {
      targetId: 'shop', reasoningMode: 'disabled' as const, testTypesRun: [], transactionsSummarised: 0,
      slaCompliancePercent: null, scores: [], overallScore: 0, verdict: 'FAIL' as const, topBottlenecks: [],
      regressionCount: 0, worstRegressionPercent: null, capacityHeadroomPercent: null, predictionCount: 0, defectCount: 0,
      patternCount: 0, topPatterns: [], businessImpactScore: null, estimatedFinancialExposure: null, knowledgeMatchCount: 0,
      recommendationCount: 0, estimatedSavingsPercent: null, executiveActions: [], engineeringActions: [], operationsActions: [],
      digitalTwinConfidence: null, simulationCount: 0, worstScenario: null, predictedVerdict: null, predictionConfidence: null,
      predictionAccuracy: null, seasonalForecasts: [], resourceForecasts: [], releaseImpact: null,
      executiveSummary: 'No load executed; nothing measured.', rationale: 'no load',
    };
    const board = boardReport(report);
    assert.ok(board.figures.some((f) => f.value === 'NOT MEASURED' && !f.measured));
    assert.ok(board.risks.some((r) => /No load/i.test(r)));
  });
});

// ── 10. Nothing progresses unless certified; governance rules bite ──────────

describe('certification gates and governance', () => {
  it('gives every stage a review, a decision and a certification agent', () => {
    const catalogue = buildCatalogue();
    for (const stage of STAGES) for (const phase of ['review', 'decision', 'certification']) {
      assert.ok(catalogue.get(`governance.${stage}.${phase}`), `stage ${stage} has no ${phase} agent`);
    }
  });

  it('refuses the certification stage when nothing was measured but the verdict is not FAIL (R-13.3)', () => {
    const catalogue = buildCatalogue();
    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };
    const findings = catalogue.invoke<{ subject: unknown }, { severity: string; finding: string }[]>(
      'governance.certification.review', { subject: { measuredCount: 0, scores: [], verdict: 'PASS', verdictReason: 'x' } }, ctx);
    assert.ok(findings.some((f) => f.severity === 'blocking' && /NOT MEASURED/.test(f.finding)));
  });

  it('refuses the reporting stage when the verdict is FAIL but the report claims ready', () => {
    const catalogue = buildCatalogue();
    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };
    const findings = catalogue.invoke<{ subject: unknown }, { severity: string; finding: string }[]>(
      'governance.reporting.review', { subject: { sync: [{ reason: 'x' }], verdict: 'FAIL', claimedReady: true, pdfBytes: 1000 } }, ctx);
    assert.ok(findings.some((f) => f.severity === 'blocking' && /ready/i.test(f.finding)));
  });
});

// ── 10b. Optional enterprise APM / monitoring integration (Phase 2, area 7) ──

describe('optional monitoring / APM integration', () => {
  function withMonitor(provider: string) {
    resetAdapterSequence();
    const registry = new PerformanceAdapterRegistry();
    registry.registerLoadGenerator(k6Adapter().adapter);
    registry.registerTestManagement(azureDevOpsAdapter().adapter);
    // A monitoring provider whose collector contributes an infrastructure memory-saturation series.
    const dt = dynatraceAdapter((req) => {
      const out: RawSample[] = [];
      for (let i = 0; i < 20; i += 1) out.push({ metric: 'memory', category: 'infrastructure', transactionId: 'global', host: 'apm-node', value: 88 + (i % 5), unit: '%', atMillis: req.window.fromMillis + i * 50 });
      return out;
    });
    registry.registerMonitoring(dt.adapter);
    const orchestrator = buildPerformanceOrchestrator(dependencies(), registry);
    const result = orchestrator.execute({
      tenantId: 't', runId: `run-monitor-${provider}`, correlationId: 'c',
      scope: { targetId: 'shop', allowedHosts: ['https://shop.example'], exclusions: [], authorizationReference: 'PERF-1', testTypeCeiling: 'load', safeMode: true, maxVirtualUsers: 200, maxRequestsPerSecond: 100, environment: 'staging' },
      serviceLevels: SERVICE_LEVELS, requestedTestTypes: ['load'],
      configuration: configuration('k6', 'azure-devops', false, { 'perf.monitor': provider }),
    });
    return { result, journal: dt.journal };
  }

  it('is optional: a run with no monitoring provider completes and reports monitoring null', () => {
    const { result } = run('k6', 'azure-devops', false);
    assert.equal(result.monitoring, null, 'a run with no perf.monitor should carry no monitoring provider');
    assert.equal(result.run.failure, null, 'the engine must run without an APM provider — APM is optional');
    assert.ok(!result.agentsInvoked.includes('load.monitor-collect'), 'the monitor-collect agent ran with no provider configured');
  });

  it('fuses APM samples into the analysis when a provider is configured', () => {
    const { result, journal } = withMonitor('dynatrace');
    assert.equal(result.monitoring, 'dynatrace');
    assert.equal(result.run.failure, null, result.run.failure ?? undefined);
    assert.ok(result.agentsInvoked.includes('load.monitor-collect'), 'the monitor-collect agent did not run with a provider configured');
    assert.ok(journal.calls.some((c) => c.method === 'collect'), 'the monitoring adapter was never collected from');
    const reflection = result.run.results.get('reflection');
    assert.ok(reflection);
    const bottlenecks = (reflection.value as Record<string, unknown>)['bottlenecks'] as { kind: string }[];
    assert.ok(bottlenecks.some((b) => b.kind === 'memory'), 'the APM-supplied memory saturation produced no bottleneck');
  });

  it('refuses a configured-but-unknown monitoring provider by name', () => {
    const registry = defaultAdapterRegistry();
    const orchestrator = buildPerformanceOrchestrator(dependencies(), registry);
    assert.throws(() => orchestrator.execute({
      tenantId: 't', runId: 'run-bad-monitor', correlationId: 'c',
      scope: { targetId: 'shop', allowedHosts: ['https://shop.example'], exclusions: [], authorizationReference: 'PERF-1', testTypeCeiling: 'load', safeMode: true, maxVirtualUsers: 200, maxRequestsPerSecond: 100, environment: 'staging' },
      serviceLevels: SERVICE_LEVELS, requestedTestTypes: ['load'],
      configuration: configuration('k6', 'azure-devops', false, { 'perf.monitor': 'no-such-apm' }),
    }), /no provider "no-such-apm"/);
  });

  it('registers eleven APM providers in the default registry', () => {
    assert.ok(defaultAdapterRegistry().monitoringProviders.length >= 11, 'the default registry is missing APM providers');
  });
});

// ── 11. The audit trail and orchestrators ───────────────────────────────────

describe('the audit trail and orchestrators', () => {
  it('names only agents the catalogue actually invoked', () => {
    const { result } = run('k6', 'azure-devops', true);
    const registered = new Set(buildCatalogue().all.map((a) => a.id));
    const claimed = [...result.run.results.values()].flatMap((r) => r.agentsInvoked);
    for (const id of claimed) assert.ok(registered.has(id), `the trail names "${id}", which is not a registered agent`);
    assert.deepEqual([...new Set(claimed)].sort(), [...result.agentsInvoked].sort());
  });

  it('records every domain orchestrator as having actually run an agent', () => {
    const { result } = run('k6', 'azure-devops', true);
    const domainOf = new Map(buildCatalogue().all.map((a) => [a.id, a.domain]));
    const domainsThatRan = new Set(result.agentsInvoked.map((id) => domainOf.get(id)));
    for (const domain of DOMAINS) {
      assert.ok(domainsThatRan.has(domain), `the ${domain} orchestrator exists and never ran an agent`);
      assert.ok(domainOrchestrators[domain], `no orchestrator is defined for ${domain}`);
    }
  });
});

// ── 12. The agent census ────────────────────────────────────────────────────

describe('the agent catalogue', () => {
  it('registers the declared agent population across twenty-four domains', () => {
    const catalogue = buildCatalogue();
    const governance = catalogue.byDomain('governance').length;
    const domain = catalogue.all.length - governance;
    assert.equal(governance, 36, 'every stage must carry a review, a decision and a certification agent');
    assert.ok(domain >= 140, `${domain} domain agents is below the declared floor of 140`);
    assert.equal(DOMAINS.length, 24, 'the Predictive Performance Layer adds the twin and simulation domains');
    assert.deepEqual([...catalogue.domains].sort(), [...DOMAINS].sort());
  });

  it('keeps a strict majority of agents deterministic (INV-7)', () => {
    const catalogue = buildCatalogue();
    const deterministic = catalogue.all.filter((a) => a.aiCapabilityClass === 'none').length;
    assert.ok(deterministic > catalogue.all.length / 2, `${deterministic}/${catalogue.all.length} deterministic; a majority is required by INV-7`);
  });

  it('summarises samples into percentiles with no raw value retained', () => {
    const summary = summarise('latency', 'api', 'txn-1', 'ms', [
      { metric: 'latency', category: 'api', transactionId: 'txn-1', host: 'h', value: 100, unit: 'ms', atMillis: 1 },
      { metric: 'latency', category: 'api', transactionId: 'txn-1', host: 'h', value: 200, unit: 'ms', atMillis: 2 },
    ]);
    assert.equal(summary.count, 2);
    assert.ok(!('samples' in summary) && !('values' in summary), 'a summary retained raw values');
    assert.equal(scrubLabel('GET /api?token=SECRET'), 'GET /api?token={redacted}');
  });
});
