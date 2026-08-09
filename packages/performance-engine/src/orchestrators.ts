/**
 * The master orchestrator and the domain orchestrators.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 15-configuration-model.md · 16-runtime-model.md
 *   ADR          : ADR-0026
 *   Criteria     : C-11.11 (no framework code branches on a capability identity) · C-12.1
 *
 * THE MASTER ORCHESTRATOR RUNS THE ONE LIFECYCLE. IT DOES NOT DEFINE ONE.
 * `PerformanceEngineOrchestrator` accepts a request, loads tenant, AI and performance
 * configuration, resolves the load-generator and test-management adapters, and hands the
 * capability to the framework's twelve-stage runner. It has no stage list and could not have one —
 * the runner is the only thing that can mint a sealed stage result.
 *
 * THE DOMAIN ORCHESTRATORS ACTUALLY SEQUENCE THEIR AGENTS. Each `coordinate` invokes its domain's
 * agents in order and returns the domain's result. A domain that never ran an agent would fail the
 * conformance suite.
 *
 * WHERE `perf.aiEnabled` BECOMES `ai.enabled`. The framework reads the capability-neutral
 * `ai.enabled`; framework code that read a capability's own key would be branching on a capability
 * identity (C-11.11). The translation happens here, in the capability that owns the surface.
 */
import {
  runCapability, certify, resolveReasoningMode, gateProposals, proposalsFrom, invocationRecorder,
  VectorMemory, VectorIndex,
  type AgentCatalogue, type AgentContext, type Capability, type CertificationOutcome,
  type InvocationRecorder, type ProposalSource, type ReasoningLedger, type ReasoningMode, type RunOutcome,
} from '@dbiz/capability-framework';
import type {
  Baseline, Bottleneck, BusinessImpact, BusinessTransaction, CapacityForecast, DigitalTwin, DimensionScore,
  EvidenceReference, KnowledgeMatch, KnowledgeRecord, LearningRecord, MetricSummary, ObservedNode, PatternMatch,
  PerformanceCertification, PerformanceDefect, PerformanceScope, PerformanceThreshold, Prediction,
  PredictiveCertification, Recommendation, Regression, ReleaseImpact, ResourceForecast, RootCauseChain,
  SeasonalForecast, SeasonalPeriod, Severity, ServiceLevel, SimulationResult, SimulationScenario, SurfaceFact,
  SyncRecord, TestType, TransactionResult, WorkloadModel, WorkloadPattern,
} from './model.js';
import type { BusinessWeights } from './agents/intelligence-layer.js';
import type { TwinInput } from './agents/twin.js';
import type { LoadGeneratorAdapter, TestManagementAdapter, MonitoringAdapter, PerformanceAdapterRegistry } from './adapters.js';
import { type ScopeBoundary, buildInScope } from './agents/scope-and-discovery.js';
import { assembleWorkload, assemblePlan, type GuardrailAuthorization } from './agents/workload-design-guardrail.js';
import { assembleResults, buildScript } from './agents/scripting-load-metrics.js';
import { primaryBottlenecks, buildRootCause, forecastCapacity, detectRegressions, recommendationsFor, defectsFromBreaches } from './agents/analysis.js';
import { assembleCertification, scoreDimension, type CertificationInputs, type SyncContext, type LearningInputs } from './agents/sync-reporting-learning.js';
import type { PerformanceScript, ScriptStep } from './model.js';

export const DOMAINS = [
  'scope', 'discovery', 'surface', 'workload', 'design', 'guardrail', 'script', 'load', 'metrics',
  'bottleneck', 'rootcause', 'pattern', 'business', 'knowledge', 'twin', 'simulation', 'capacity',
  'optimisation', 'defect', 'certification', 'sync', 'reporting', 'learning', 'governance',
] as const;
export type Domain = (typeof DOMAINS)[number];

export type AgentContextFactory = (agentId: string) => AgentContext;

export interface DomainOrchestrator<I, O> {
  readonly domain: Domain;
  readonly purpose: string;
  coordinate(input: I, agents: AgentCatalogue, ctx: AgentContextFactory): O;
}

export function defineDomainOrchestrator<I, O>(
  domain: Domain, purpose: string,
  coordinate: (input: I, agents: AgentCatalogue, ctx: AgentContextFactory) => O,
): DomainOrchestrator<I, O> {
  return { domain, purpose, coordinate };
}

const invoke = <O>(agents: AgentCatalogue, ctx: AgentContextFactory, id: string, input: unknown): O =>
  agents.invoke<unknown, O>(id, input, ctx(id));

// ── scope (stage 1, planning) ───────────────────────────────────────────────

export interface ScopeResult { readonly boundary: ScopeBoundary; readonly objectives: { readonly peakConcurrency: number; readonly throughput: number }; }

export const scopeOrchestrator = defineDomainOrchestrator<
  { scope: PerformanceScope; serviceLevels: readonly ServiceLevel[]; requestedTestTypes: readonly TestType[] }, ScopeResult>(
  'scope', 'Validate the performance-test request and bind every later request to a fail-closed boundary.',
  (input, agents, ctx) => {
    invoke(agents, ctx, 'scope.authorization-reference', { scope: input.scope });
    const validated = invoke<PerformanceScope>(agents, ctx, 'scope.allowed-host-validation', { scope: input.scope });
    invoke(agents, ctx, 'scope.boundary-enforcement', { scope: validated });
    const serviceLevels = invoke<readonly ServiceLevel[]>(agents, ctx, 'scope.service-level-intake', { serviceLevels: input.serviceLevels });
    const vu = invoke<{ virtualUsers: number }>(agents, ctx, 'scope.vu-ceiling', { scope: validated });
    const rate = invoke<{ requestsPerSecond: number }>(agents, ctx, 'scope.rate-ceiling', { scope: validated });
    invoke(agents, ctx, 'scope.environment-detection', { scope: validated });
    const testTypes = invoke<readonly TestType[]>(agents, ctx, 'scope.test-type-selection', { scope: validated, requested: input.requestedTestTypes });
    const objectives = invoke<{ peakConcurrency: number; throughput: number }>(agents, ctx, 'scope.workload-objective', { authorizedVirtualUsers: vu.virtualUsers, authorizedRequestsPerSecond: rate.requestsPerSecond });
    return {
      boundary: {
        scope: validated, inScope: buildInScope(validated), serviceLevels, testTypes,
        authorizedVirtualUsers: vu.virtualUsers, authorizedRequestsPerSecond: rate.requestsPerSecond,
        authorized: true, summary: `${validated.allowedHosts.length} host(s), ${testTypes.length} test type(s)`,
      },
      objectives,
    };
  });

// ── discovery (stage 2, discovery — EP) ─────────────────────────────────────

export const discoveryOrchestrator = defineDomainOrchestrator<
  { observed: readonly ObservedNode[]; inScope: (u: string) => boolean }, readonly ObservedNode[]>(
  'discovery', 'Run every discovery probe inside the Execution Plane and assemble the observed topology.',
  (input, agents, ctx) => {
    const ids = agents.byDomain('discovery').filter((a) => a.stage === 'discovery').map((a) => a.id);
    const byId = new Map<string, ObservedNode>();
    for (const id of ids) for (const n of invoke<readonly ObservedNode[]>(agents, ctx, id, input)) byId.set(n.id, n);
    return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  });

// ── surface (stage 3, context) ──────────────────────────────────────────────

export interface SurfaceResult { readonly endpoints: readonly string[]; readonly dependencies: readonly string[]; readonly protocols: readonly string[]; }

export const surfaceOrchestrator = defineDomainOrchestrator<{ facts: readonly SurfaceFact[] }, SurfaceResult>(
  'surface', 'Inventory the minimised surface facts into endpoints, dependencies and protocols.',
  (input, agents, ctx) => {
    const endpoints = invoke<readonly string[]>(agents, ctx, 'surface.endpoint-inventory', input);
    const protocols = invoke<readonly string[]>(agents, ctx, 'surface.protocol-inventory', input);
    const dependencies = invoke<readonly string[]>(agents, ctx, 'surface.dependency-inventory', input);
    invoke(agents, ctx, 'surface.topology-assemble', input);
    return { endpoints, dependencies, protocols };
  });

// ── workload (stage 4, architecture-review) ─────────────────────────────────

export const workloadOrchestrator = defineDomainOrchestrator<
  { facts: readonly SurfaceFact[]; objectives: { peakConcurrency: number; throughput: number }; authorizedVirtualUsers: number; authorizedRequestsPerSecond: number; testTypes: readonly TestType[]; regions: readonly string[] }, WorkloadModel>(
  'workload', 'Model the workload: transactions, journeys, criticality, mix, think time, concurrency and pattern.',
  (input, agents, ctx) => {
    const transactions = invoke<readonly BusinessTransaction[]>(agents, ctx, 'workload.transaction-identification', { facts: input.facts });
    invoke(agents, ctx, 'workload.journey-mapping', { transactions });
    invoke(agents, ctx, 'workload.criticality-scoring', { transactions });
    const mix = invoke<ReadonlyMap<string, number>>(agents, ctx, 'workload.mix-modelling', { transactions });
    invoke(agents, ctx, 'workload.think-time', { transactions });
    const concurrency = invoke<{ peakConcurrency: number }>(agents, ctx, 'workload.concurrency-model', { peakConcurrency: input.objectives.peakConcurrency, authorizedVirtualUsers: input.authorizedVirtualUsers });
    const arrival = invoke<{ arrivalRatePerSecond: number }>(agents, ctx, 'workload.arrival-rate', { throughput: input.objectives.throughput, authorizedRequestsPerSecond: input.authorizedRequestsPerSecond });
    const ramp = invoke<{ up: number; steady: number; down: number }>(agents, ctx, 'workload.ramp-profile', { testTypes: input.testTypes });
    const patternR = invoke<{ pattern: WorkloadPattern }>(agents, ctx, 'workload.pattern-detection', { testTypes: input.testTypes });
    invoke(agents, ctx, 'workload.seasonality', { pattern: patternR.pattern });
    const regions = invoke<readonly string[]>(agents, ctx, 'workload.region-distribution', { regions: input.regions });
    const withMix = transactions.map((t) => ({ ...t, mix: mix.get(t.id) ?? 0 }));
    return assembleWorkload(input.facts[0]?.id ?? 'target', withMix, patternR.pattern, concurrency.peakConcurrency, arrival.arrivalRatePerSecond, ramp, regions);
  });

// ── design (stage 5, policy-review) ─────────────────────────────────────────

export interface DesignResult {
  readonly plan: ReturnType<typeof assemblePlan>;
  readonly thresholds: readonly PerformanceThreshold[];
  readonly cases: readonly import('./model.js').PerformanceTestCase[];
  readonly suites: readonly import('./model.js').PerformanceTestSuite[];
}

export const designOrchestrator = defineDomainOrchestrator<
  { workload: WorkloadModel; serviceLevels: readonly ServiceLevel[]; testTypes: readonly TestType[]; virtualUsers: number; durationSeconds: number }, DesignResult>(
  'design', 'Design the performance test plan: requirements, thresholds, KPIs, cases and suites.',
  (input, agents, ctx) => {
    invoke(agents, ctx, 'design.requirement', { transactions: input.workload.transactions });
    const thresholds = invoke<readonly PerformanceThreshold[]>(agents, ctx, 'design.threshold', { serviceLevels: input.serviceLevels, transactions: input.workload.transactions });
    invoke(agents, ctx, 'design.kpi', { targetId: input.workload.targetId });
    invoke(agents, ctx, 'design.acceptance-criteria', { thresholds });
    const cases = invoke<readonly import('./model.js').PerformanceTestCase[]>(agents, ctx, 'design.test-case', { transactions: input.workload.transactions, testTypes: input.testTypes, thresholds, virtualUsers: input.virtualUsers, durationSeconds: input.durationSeconds });
    const suites = invoke<readonly import('./model.js').PerformanceTestSuite[]>(agents, ctx, 'design.test-suite', { cases });
    invoke(agents, ctx, 'design.test-data', { transactions: input.workload.transactions });
    invoke(agents, ctx, 'design.execution-matrix', { suites });
    invoke(agents, ctx, 'design.traceability', { cases });
    invoke(agents, ctx, 'design.coverage', { transactions: input.workload.transactions, cases });
    invoke(agents, ctx, 'design.review-workflow', { suiteCount: suites.length });
    const globalThresholds = thresholds.filter((t) => t.appliesTo === 'global');
    return { plan: assemblePlan(input.workload.targetId, input.workload.transactions, suites, globalThresholds, input.serviceLevels), thresholds, cases, suites };
  });

// ── guardrail (stage 6, guardrail-review) ───────────────────────────────────

export interface GuardrailResult { readonly authorization: GuardrailAuthorization; readonly productionAggressive: boolean; }

export const guardrailOrchestrator = defineDomainOrchestrator<
  { scope: PerformanceScope; testTypes: readonly TestType[]; workload: WorkloadModel; authorizedVirtualUsers: number; authorizedRequestsPerSecond: number }, GuardrailResult>(
  'guardrail', 'Enforce the execution guardrails: no aggressive load on production, and every ceiling honoured.',
  (input, agents, ctx) => {
    const refusals: string[] = [];
    const prod = invoke<{ ok: boolean; reason: string }>(agents, ctx, 'guardrail.production-guard', { scope: input.scope, testTypes: input.testTypes });
    if (!prod.ok) refusals.push(`production-guard: ${prod.reason}`);
    const rate = invoke<{ ok: boolean; reason: string }>(agents, ctx, 'guardrail.rate-guard', { arrivalRatePerSecond: input.workload.arrivalRatePerSecond, authorizedRequestsPerSecond: input.authorizedRequestsPerSecond });
    if (!rate.ok) refusals.push(`rate-guard: ${rate.reason}`);
    const vu = invoke<{ ok: boolean; reason: string }>(agents, ctx, 'guardrail.vu-guard', { peakConcurrency: input.workload.peakConcurrency, authorizedVirtualUsers: input.authorizedVirtualUsers });
    if (!vu.ok) refusals.push(`vu-guard: ${vu.reason}`);
    invoke(agents, ctx, 'guardrail.blast-radius', { scope: input.scope });
    const auth = invoke<{ ok: boolean; reason: string }>(agents, ctx, 'guardrail.authorization', { scope: input.scope });
    if (!auth.ok) refusals.push(`authorization: ${auth.reason}`);
    invoke(agents, ctx, 'guardrail.audit-trail', { refusals });
    const productionAggressive = (input.scope.environment === 'production' || input.scope.environment === 'unknown') && input.scope.safeMode && input.testTypes.some((t) => t === 'stress' || t === 'breakpoint' || t === 'spike');
    const certified = refusals.length === 0 && !productionAggressive;
    return {
      authorization: { targetId: input.scope.targetId, certified, authorizedVirtualUsers: certified ? input.authorizedVirtualUsers : 0, authorizedRequestsPerSecond: certified ? input.authorizedRequestsPerSecond : 0, refusals },
      productionAggressive,
    };
  });

// ── script (stage 7, execution-planning) ────────────────────────────────────

export const scriptOrchestrator = defineDomainOrchestrator<
  { cases: readonly import('./model.js').PerformanceTestCase[]; workload: WorkloadModel; tool: string; dialect: string }, import('./model.js').ExecutionPlan>(
  'script', 'Generate production-ready scripts, the scenario matrix and the distributed execution plan.',
  (input, agents, ctx) => {
    const stepsByTxn = new Map<string, readonly ScriptStep[]>();
    for (const t of input.workload.transactions) {
      stepsByTxn.set(t.id, t.nodeIds.map((nid, i): ScriptStep => ({ order: i + 1, transactionId: t.id, method: 'GET', path: `/${nid}`, thinkTimeMs: t.thinkTimeMs })));
    }
    const stepsByCase = invoke<ReadonlyMap<string, readonly ScriptStep[]>>(agents, ctx, 'script.step-sequencing', { cases: input.cases, steps: stepsByTxn });
    const scripts = invoke<readonly PerformanceScript[]>(agents, ctx, 'script.generation', { cases: input.cases, tool: input.tool, dialect: input.dialect, stepsByCase });
    invoke(agents, ctx, 'script.parameterisation', { scripts });
    const distribution = invoke<{ nodes: number; regions: readonly string[]; parallelism: number }>(agents, ctx, 'script.distribution-plan', { regions: input.workload.regions, peakConcurrency: input.workload.peakConcurrency });
    const matrix = invoke<readonly (readonly string[])[]>(agents, ctx, 'script.scenario-matrix', { scripts, parallelism: distribution.parallelism });
    // Ensure every case yields a script even when its steps were empty.
    const withSteps = scripts.length > 0 ? scripts : input.cases.map((c) => buildScript(input.tool, input.dialect, c, [{ order: 1, transactionId: c.transactionId, method: 'GET', path: '/', thinkTimeMs: 1000 }]));
    return { scripts: withSteps, scenarioMatrix: matrix, distribution };
  });

// ── load (stage 8, execution — EP) ──────────────────────────────────────────

export const loadOrchestrator = defineDomainOrchestrator<
  { plan: import('./model.js').ExecutionPlan; samples: readonly import('./model.js').RawSample[]; authorizedRequestsPerSecond: number }, readonly import('./model.js').RawSample[]>(
  'load', 'Run the generated scripts as real load in the Execution Plane, within every authorised ceiling.',
  (input, agents, ctx) => {
    const samples = invoke<readonly import('./model.js').RawSample[]>(agents, ctx, 'load.generator', { samples: input.samples });
    invoke(agents, ctx, 'load.ramp-controller', { plan: input.plan });
    invoke(agents, ctx, 'load.rate-limiter', { authorizedRequestsPerSecond: input.authorizedRequestsPerSecond });
    invoke(agents, ctx, 'load.checkpoint', { batches: input.plan.scenarioMatrix.length });
    return samples;
  });

// ── metrics (stage 9, evidence — EP) ────────────────────────────────────────

export interface MetricsResult { readonly results: readonly TransactionResult[]; readonly evidence: readonly EvidenceReference[]; readonly summaries: readonly MetricSummary[]; }

export const metricsOrchestrator = defineDomainOrchestrator<
  { samples: readonly import('./model.js').RawSample[]; capturedEvidence: (results: readonly TransactionResult[]) => readonly { kind: EvidenceReference['kind']; metric: string; digest: string; locator: string }[]; evidenceByTxn: ReadonlyMap<string, readonly string[]> }, MetricsResult>(
  'metrics', 'Capture and summarise every metric category into aggregate statistics; reference evidence, never carry it.',
  (input, agents, ctx) => {
    const categorySummaries: MetricSummary[] = [];
    for (const id of agents.byDomain('metrics').filter((a) => a.id.startsWith('metrics.') && ['browser', 'api', 'infrastructure', 'database', 'queue', 'runtime', 'cloud', 'network'].some((c) => a.id === `metrics.${c}`)).map((a) => a.id)) {
      categorySummaries.push(...invoke<readonly MetricSummary[]>(agents, ctx, id, { samples: input.samples }));
    }
    invoke(agents, ctx, 'metrics.percentile-aggregation', { samples: input.samples, transactionId: 'global' });
    // Results are assembled first so evidence can be captured against them — capturing before the
    // results exist is how the evidence set silently came back empty.
    const results = assembleResults(input.samples, input.evidenceByTxn);
    const captured = input.capturedEvidence(results);
    const evidence = invoke<readonly EvidenceReference[]>(agents, ctx, 'metrics.evidence-capture', { captured });
    invoke(agents, ctx, 'metrics.integrity-check', { references: evidence });
    const summaries = [...categorySummaries, ...results.flatMap((r) => r.summaries)];
    return { results, evidence, summaries };
  });

// ── bottleneck (stage 10, reflection) ───────────────────────────────────────

export const bottleneckOrchestrator = defineDomainOrchestrator<
  { summaries: readonly MetricSummary[]; evidenceRefs: readonly string[] }, readonly Bottleneck[]>(
  'bottleneck', 'Detect every resource bottleneck from the metric summaries and rank by dominant constraint.',
  (input, agents, ctx) => {
    const detected: Bottleneck[] = [];
    for (const id of agents.byDomain('bottleneck').filter((a) => a.id.startsWith('bottleneck.') && a.id !== 'bottleneck.correlation' && a.id !== 'bottleneck.ai-hypothesis').map((a) => a.id)) {
      const b = invoke<Bottleneck | null>(agents, ctx, id, input);
      if (b) detected.push(b);
    }
    const correlated = invoke<readonly Bottleneck[]>(agents, ctx, 'bottleneck.correlation', { bottlenecks: detected });
    invoke(agents, ctx, 'bottleneck.ai-hypothesis', { bottlenecks: correlated });
    return correlated.length > 0 ? correlated : primaryBottlenecks(input.summaries, input.evidenceRefs);
  });

// ── rootcause (stage 10, reflection) ────────────────────────────────────────

export const rootcauseOrchestrator = defineDomainOrchestrator<{ bottlenecks: readonly Bottleneck[] }, readonly RootCauseChain[]>(
  'rootcause', 'Build the complete symptom-to-root cause chain for every bottleneck; never report a lone symptom.',
  (input, agents, ctx) => {
    const chains = invoke<readonly RootCauseChain[]>(agents, ctx, 'rootcause.chain-builder', input);
    const correlated = invoke<readonly RootCauseChain[]>(agents, ctx, 'rootcause.correlation', { chains });
    invoke(agents, ctx, 'rootcause.narrative', { chains: correlated });
    return correlated.length > 0 ? correlated : input.bottlenecks.map((b) => buildRootCause(b, null));
  });

// ── capacity (stage 10, reflection) ─────────────────────────────────────────

export interface CapacityResult { readonly forecasts: readonly CapacityForecast[]; readonly regressions: readonly Regression[]; readonly predictions: readonly Prediction[]; }

export const capacityOrchestrator = defineDomainOrchestrator<
  { summaries: readonly MetricSummary[]; thresholds: readonly PerformanceThreshold[]; concurrency: number; results: readonly TransactionResult[]; baselines: ReadonlyMap<string, number>; bottlenecks: readonly Bottleneck[] }, CapacityResult>(
  'capacity', 'Forecast capacity to breach, detect regressions against baseline and predict future failures.',
  (input, agents, ctx) => {
    const forecasts = invoke<readonly CapacityForecast[]>(agents, ctx, 'capacity.forecast', { summaries: input.summaries, thresholds: input.thresholds, concurrency: input.concurrency });
    invoke(agents, ctx, 'capacity.headroom', { forecasts });
    const regressions = invoke<readonly Regression[]>(agents, ctx, 'capacity.regression', { results: input.results, baselines: input.baselines });
    const predictions = invoke<readonly Prediction[]>(agents, ctx, 'capacity.prediction', { forecasts, bottlenecks: input.bottlenecks });
    invoke(agents, ctx, 'capacity.cost-projection', { forecasts });
    return {
      forecasts: forecasts.length > 0 ? forecasts : input.summaries.filter((s) => s.metric === 'latency').map((s) => forecastCapacity(s, null, input.concurrency)),
      regressions: regressions.length > 0 ? regressions : detectRegressions(input.results, input.baselines),
      predictions,
    };
  });

// ── optimisation (stage 10, reflection) ─────────────────────────────────────

const OPTIMISATION_NON_PRODUCERS = ['optimisation.advisor', 'optimisation.cost-saving', 'optimisation.business-value', 'optimisation.knowledge-reuse'];

export const optimisationOrchestrator = defineDomainOrchestrator<
  { bottlenecks: readonly Bottleneck[]; patterns: readonly PatternMatch[]; knowledgeMatches: readonly KnowledgeMatch[] }, readonly Recommendation[]>(
  'optimisation', 'Generate optimisation recommendations from bottlenecks and matched patterns, enriched with cost, risk, value and reused prior fixes, prioritised by the advisor.',
  (input, agents, ctx) => {
    const recommendations: Recommendation[] = [];
    for (const id of agents.byDomain('optimisation').filter((a) => !OPTIMISATION_NON_PRODUCERS.includes(a.id)).map((a) => a.id)) {
      recommendations.push(...invoke<readonly Recommendation[]>(agents, ctx, id, input));
    }
    invoke(agents, ctx, 'optimisation.knowledge-reuse', input);
    invoke(agents, ctx, 'optimisation.cost-saving', { recommendations });
    invoke(agents, ctx, 'optimisation.business-value', { recommendations });
    invoke(agents, ctx, 'optimisation.advisor', { recommendations });
    return recommendations.length > 0 ? recommendations : recommendationsFor(input.bottlenecks);
  });

// ── pattern (stage 10, reflection) — Performance Intelligence Layer, Domain 1 ─

export const patternOrchestrator = defineDomainOrchestrator<
  { summaries: readonly MetricSummary[]; evidenceRefs: readonly string[]; recurrence: Readonly<Record<string, number>>; suppressed: readonly string[] }, readonly PatternMatch[]>(
  'pattern', 'Recognise every named performance pattern, including composites, and return the active (non-suppressed) matches.',
  (input, agents, ctx) => {
    const matched = invoke<readonly PatternMatch[]>(agents, ctx, 'pattern.match', input);
    const active = invoke<readonly PatternMatch[]>(agents, ctx, 'pattern.suppression', { matches: matched });
    for (const id of ['pattern.composite', 'pattern.correlation', 'pattern.severity', 'pattern.recurrence', 'pattern.confidence', 'pattern.verification', 'pattern.evidence', 'pattern.history', 'pattern.recommendation-link']) {
      invoke(agents, ctx, id, { matches: active });
    }
    return active;
  });

// ── business (stage 10, reflection) — Domain 2 ──────────────────────────────

export const businessOrchestrator = defineDomainOrchestrator<
  { transactions: readonly BusinessTransaction[]; results: readonly TransactionResult[]; worstSeverity: Severity; weights: Readonly<Record<string, BusinessWeights>>; windowSeconds: number }, readonly BusinessImpact[]>(
  'business', 'Translate technical findings into business outcomes per transaction — capability, customer, revenue, executive severity.',
  (input, agents, ctx) => {
    for (const id of ['business.capability-map', 'business.journey-impact', 'business.customer-impact', 'business.revenue-risk', 'business.operational-impact', 'business.executive-severity', 'business.financial-exposure', 'business.recovery-priority']) {
      invoke(agents, ctx, id, input);
    }
    const impacts = invoke<readonly BusinessImpact[]>(agents, ctx, 'business.assemble', input);
    invoke(agents, ctx, 'business.narrative', { impacts });
    return impacts;
  });

// ── knowledge (stage 10, reflection) — Domain 3, the Knowledge Graph ─────────

export const knowledgeOrchestrator = defineDomainOrchestrator<
  { matches: readonly PatternMatch[]; records: readonly KnowledgeRecord[]; memory: VectorMemory }, readonly KnowledgeMatch[]>(
  'knowledge', 'Search the Performance Knowledge Graph for prior occurrences and verified fixes, then write this run back.',
  (input, agents, ctx) => {
    const index = new VectorIndex();
    for (const r of input.records) index.add(r.id, r.kind, r.text, { release: r.release ?? '', resolvedBy: r.resolvedBy ?? '' });
    const kInput = { matches: input.matches, records: input.records, index };
    const km = invoke<readonly KnowledgeMatch[]>(agents, ctx, 'knowledge.similarity', kInput);
    for (const id of ['knowledge.historical-lookup', 'knowledge.known-fix', 'knowledge.known-failure', 'knowledge.regression-lookup', 'knowledge.trend', 'knowledge.topology-aware']) {
      invoke(agents, ctx, id, kInput);
    }
    invoke(agents, ctx, 'knowledge.reasoning', { matches: km });
    invoke(agents, ctx, 'knowledge.record', kInput);
    return km;
  });

// ── twin (stage 10, reflection) — Predictive Performance Layer, Domain 1 ─────

export interface TwinResult {
  readonly twin: DigitalTwin;
  readonly resourceForecasts: readonly ResourceForecast[];
  readonly seasonalForecasts: readonly SeasonalForecast[];
  readonly baselineTiers: readonly Baseline[];
}

export const twinOrchestrator = defineDomainOrchestrator<
  { twinInput: TwinInput; concurrency: number; periods: readonly SeasonalPeriod[]; baselines: ReadonlyMap<string, number> }, TwinResult>(
  'twin', 'Build the Digital Twin and derive resource, seasonal and multi-tier baseline forecasts — never executing load.',
  (input, agents, ctx) => {
    const twin = invoke<DigitalTwin>(agents, ctx, 'twin.model', { twinInput: input.twinInput });
    for (const id of ['twin.topology-model', 'twin.infrastructure-model', 'twin.dependency-model', 'twin.confidence']) invoke(agents, ctx, id, { twin });
    const resourceForecasts = invoke<readonly ResourceForecast[]>(agents, ctx, 'twin.capacity-timeline', { twin, concurrency: input.concurrency });
    const seasonalForecasts = invoke<readonly SeasonalForecast[]>(agents, ctx, 'twin.seasonal-forecast', { peakConcurrency: input.concurrency, periods: input.periods });
    const tiers = invoke<readonly Baseline[]>(agents, ctx, 'twin.baseline-tiers', { twin, baselines: input.baselines });
    return { twin, resourceForecasts, seasonalForecasts, baselineTiers: tiers };
  });

// ── simulation (stage 10, reflection) — Domains 2, 5, 7, 8 ──────────────────

export interface SimulationSet {
  readonly simulations: readonly SimulationResult[];
  readonly releaseImpact: ReleaseImpact | null;
  readonly predictiveCertification: PredictiveCertification;
}

export const simulationOrchestrator = defineDomainOrchestrator<
  { twin: DigitalTwin; scenarios: readonly SimulationScenario[]; thresholds: readonly PerformanceThreshold[]; transactions: readonly { id: string; slaMs: number }[]; release: string; releaseMagnitude: number }, SimulationSet>(
  'simulation', 'Run every configured scenario against the twin, predict the release impact, and predict the certification verdict before execution.',
  (input, agents, ctx) => {
    const simulations = input.scenarios.map((sc) => invoke<SimulationResult>(agents, ctx, sc.kind === 'what-if' ? 'simulation.what-if' : 'simulation.scenario', { twin: input.twin, scenario: sc, thresholds: input.thresholds, transactions: input.transactions }));
    for (const id of ['simulation.traffic', 'simulation.infrastructure', 'simulation.failure', 'simulation.seasonal-event']) invoke(agents, ctx, id, { simulations });
    const releaseImpact = invoke<ReleaseImpact>(agents, ctx, 'simulation.release-impact', { twin: input.twin, release: input.release, magnitude: input.releaseMagnitude, thresholds: input.thresholds, transactions: input.transactions });
    const predictiveCertification = invoke<PredictiveCertification>(agents, ctx, 'simulation.predictive-certification', { simulations });
    invoke(agents, ctx, 'simulation.confidence', { simulations });
    invoke(agents, ctx, 'simulation.narrative', { prediction: predictiveCertification });
    return { simulations, releaseImpact, predictiveCertification };
  });

// ── defect (stage 10, reflection) ───────────────────────────────────────────

export const defectOrchestrator = defineDomainOrchestrator<
  { results: readonly TransactionResult[]; thresholds: readonly PerformanceThreshold[]; rootCauses: readonly RootCauseChain[]; bottlenecks: readonly Bottleneck[] }, readonly PerformanceDefect[]>(
  'defect', 'Raise an enterprise-grade defect for every blocking threshold breached under load.',
  (input, agents, ctx) => {
    const defects = invoke<readonly PerformanceDefect[]>(agents, ctx, 'defect.threshold-breach', input);
    invoke(agents, ctx, 'defect.enrichment', { defects });
    invoke(agents, ctx, 'defect.severity-priority', { defects });
    return defects.length > 0 ? defects : defectsFromBreaches(input.results, input.thresholds, input.rootCauses, input.bottlenecks);
  });

// ── learning (stage 10, reflection) ─────────────────────────────────────────

export const learningOrchestrator = defineDomainOrchestrator<{ inputs: LearningInputs }, readonly LearningRecord[]>(
  'learning', 'Fold every learnable signal from this run into records the next run can use.',
  (input, agents, ctx) => agents.byDomain('learning').flatMap((a) => invoke<readonly LearningRecord[]>(agents, ctx, a.id, input)));

// ── certification (stage 11) ────────────────────────────────────────────────

export const certificationOrchestrator = defineDomainOrchestrator<
  { inputs: CertificationInputs; blockingBreaches: readonly string[] }, PerformanceCertification>(
  'certification', 'Score every certification dimension from measured evidence and render the verdict.',
  (input, agents, ctx) => {
    const scores: DimensionScore[] = [];
    for (const a of agents.byDomain('certification')) scores.push(invoke<DimensionScore>(agents, ctx, a.id, { inputs: input.inputs }));
    const ordered = scores.length > 0 ? scores : (['performance', 'scalability', 'reliability', 'availability', 'stability', 'capacity', 'risk', 'business-readiness', 'production-readiness'] as const).map((d) => scoreDimension(d, input.inputs));
    return assembleCertification(input.inputs.targetId, ordered, input.blockingBreaches);
  });

// ── sync (stage 12, reporting) ──────────────────────────────────────────────

export const syncOrchestrator = defineDomainOrchestrator<{ ctx: SyncContext }, readonly SyncRecord[]>(
  'sync', 'Publish the container, results, defects, evidence references and traceability through the adapter.',
  (input, agents, ctx) => agents.byDomain('sync').flatMap((a) => invoke<readonly SyncRecord[]>(agents, ctx, a.id, input)));

// ── reporting (stage 12, reporting) ─────────────────────────────────────────

export const reportingOrchestrator = defineDomainOrchestrator<Record<string, unknown>, void>(
  'reporting', 'Assemble the report parts and render the executive, engineering and board artefacts.',
  (input, agents, ctx) => { for (const a of agents.byDomain('reporting')) invoke(agents, ctx, a.id, input); });

// ── governance (all stages) ─────────────────────────────────────────────────

type ReviewFinding = import('@dbiz/capability-framework').ReviewFinding;
export type GovernancePhase = 'review' | 'decision' | 'certification';

export interface GovernanceInput {
  readonly stage: string;
  readonly phase: GovernancePhase;
  readonly subject: unknown;
  readonly findings: readonly ReviewFinding[];
  readonly accept: boolean;
  readonly accepted: number;
}

export const governanceOrchestrator = defineDomainOrchestrator<GovernanceInput, unknown>(
  'governance', 'Review, decide or certify a stage output, as the four-phase pipeline requires.',
  (input, agents, ctx) => {
    const id = `governance.${input.stage}.${input.phase}`;
    if (input.phase === 'review') return invoke<readonly ReviewFinding[]>(agents, ctx, id, { subject: input.subject });
    if (input.phase === 'decision') return invoke<{ accept: boolean; rejected: readonly { subject: string; reason: string }[] }>(agents, ctx, id, { subject: input.subject, findings: input.findings });
    return invoke<{ certified: boolean; reason: string }>(agents, ctx, id, { accept: input.accept, findings: input.findings, accepted: input.accepted });
  });

export const domainOrchestrators: Readonly<Record<Domain, DomainOrchestrator<never, unknown>>> = {
  scope: scopeOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  discovery: discoveryOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  surface: surfaceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  workload: workloadOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  design: designOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  guardrail: guardrailOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  script: scriptOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  load: loadOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  metrics: metricsOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  bottleneck: bottleneckOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  rootcause: rootcauseOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  pattern: patternOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  business: businessOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  knowledge: knowledgeOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  twin: twinOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  simulation: simulationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  capacity: capacityOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  optimisation: optimisationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  defect: defectOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  certification: certificationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  sync: syncOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  reporting: reportingOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  learning: learningOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  governance: governanceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
};

// ── The master orchestrator ─────────────────────────────────────────────────

export interface PerformanceRequest {
  readonly tenantId: string;
  readonly runId: string;
  readonly correlationId: string;
  readonly scope: PerformanceScope;
  readonly serviceLevels: readonly ServiceLevel[];
  readonly requestedTestTypes: readonly TestType[];
  /** Tenant configuration, including `perf.aiEnabled`, `perf.tool` and `perf.provider`. */
  readonly configuration: Readonly<Record<string, string>>;
  readonly proposals?: Readonly<Record<string, unknown>>;
}

export interface PerformanceOrchestrationResult {
  readonly run: RunOutcome;
  readonly certification: CertificationOutcome;
  readonly reasoningMode: ReasoningMode;
  readonly reasoning: ReasoningLedger;
  readonly loadGenerator: string;
  readonly testManagement: string;
  readonly monitoring: string | null;
  readonly agentsInvoked: readonly string[];
  readonly resumed: boolean;
  readonly rolledBack: boolean;
}

/** The engine's runtime seam. Everything the Execution Plane observes arrives here. */
export interface EngineRuntime {
  readonly reasoning: { readonly source: ProposalSource; readonly ledger: () => ReasoningLedger };
  readonly recorder: InvocationRecorder;
  readonly loadGenerator: LoadGeneratorAdapter;
  readonly testManagement: TestManagementAdapter;
  /** The APM/monitoring source, or `null` when none is configured — APM is optional (ADR-0026 §4.3). */
  readonly monitoring: MonitoringAdapter | null;
  readonly memory: VectorMemory;
}

export class PerformanceEngineOrchestrator {
  private readonly state = new Map<string, RunOutcome>();
  /** Vector memory outlives a run — PER TENANT. A single shared instance let one tenant's
   *  recall() surface another tenant's remembered vectors and labels (cross-tenant leakage).
   *  Isolation is enforced here, at the orchestrator boundary, so no agent needs tenant awareness. */
  private readonly memoryByTenant = new Map<string, VectorMemory>();
  private memoryFor(tenantId: string): VectorMemory {
    let m = this.memoryByTenant.get(tenantId);
    if (m === undefined) { m = new VectorMemory(); this.memoryByTenant.set(tenantId, m); }
    return m;
  }
  /** Aggregate census/size across tenants — counts only, never a cross-tenant recall. */
  get memory(): { readonly size: number; readonly census: Readonly<Record<string, number>> } {
    let size = 0;
    const census: Record<string, number> = {};
    for (const m of this.memoryByTenant.values()) {
      size += m.size;
      for (const [k, n] of Object.entries(m.census)) census[k] = (census[k] ?? 0) + n;
    }
    return { size, census };
  }

  constructor(
    private readonly capabilityFor: (runtime: EngineRuntime) => Capability,
    readonly agents: AgentCatalogue,
    private readonly adapterRegistry: PerformanceAdapterRegistry,
  ) {}

  orchestratorFor(domain: Domain): DomainOrchestrator<never, unknown> | null { return domainOrchestrators[domain] ?? null; }

  execute(request: PerformanceRequest): PerformanceOrchestrationResult {
    const loadGenerator = this.adapterRegistry.resolveLoadGenerator(request.configuration);
    const testManagement = this.adapterRegistry.resolveTestManagement(request.configuration);
    const monitoring = this.adapterRegistry.resolveMonitoring(request.configuration);
    // The typed request is the API; it is encoded onto the configuration surface the capability
    // reads (buildScope reads `perf.*` keys). Explicit `configuration` entries win, so a caller can
    // still override any field — but nothing declared on the request goes unwired.
    const encoded: Record<string, string> = {
      'perf.targetId': request.scope.targetId,
      'perf.allowedHosts': request.scope.allowedHosts.join(','),
      'perf.exclusions': request.scope.exclusions.join(','),
      'perf.authorizationReference': request.scope.authorizationReference,
      'perf.testTypeCeiling': request.scope.testTypeCeiling,
      'perf.safeMode': String(request.scope.safeMode),
      'perf.maxVirtualUsers': String(request.scope.maxVirtualUsers),
      'perf.maxRequestsPerSecond': String(request.scope.maxRequestsPerSecond),
      'perf.environment': request.scope.environment,
      'perf.testTypes': request.requestedTestTypes.join(','),
      'perf.serviceLevels': JSON.stringify(request.serviceLevels),
    };
    const configuration = {
      ...encoded,
      ...request.configuration,
      'ai.enabled': request.configuration['perf.aiEnabled'] ?? 'false',
      'adapter.loadGenerator': loadGenerator.identity.provider,
      'adapter.testManagement': testManagement.identity.provider,
    };

    const mode = resolveReasoningMode(configuration);
    const reasoning = gateProposals(mode, proposalsFrom(request.proposals ?? {}));
    const recorder = invocationRecorder(reasoning.source);

    const prior = this.state.get(request.runId);
    const resumed = prior !== undefined && prior.failedAt !== null;

    const run = runCapability(
      this.capabilityFor({ reasoning, recorder, loadGenerator, testManagement, monitoring, memory: this.memoryFor(request.tenantId) }),
      { tenantId: request.tenantId, runId: request.runId, correlationId: request.correlationId, configuration },
      resumed ? prior.results : undefined,
    );

    this.state.set(request.runId, run);
    const rolledBack = run.failedAt !== null;
    if (rolledBack) this.state.set(request.runId, { ...run, results: new Map() });

    return {
      run, certification: certify(run.results), reasoningMode: mode, reasoning: reasoning.ledger(),
      loadGenerator: loadGenerator.identity.provider, testManagement: testManagement.identity.provider,
      monitoring: monitoring ? monitoring.identity.provider : null,
      agentsInvoked: recorder.invoked(), resumed, rolledBack,
    };
  }

  retry(request: PerformanceRequest): PerformanceOrchestrationResult { return this.execute(request); }
  auditTrailFor(runId: string): readonly { at: number; stage: string | null; event: string; detail: string }[] { return this.state.get(runId)?.audit ?? []; }
}
