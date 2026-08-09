/**
 * The Performance Engine, implemented across the twelve-stage lifecycle.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 (capability 4) · 12-capability-orchestration.md
 *   ADR          : ADR-0026
 *   Criteria     : C-12.1 · C-12.2 · C-12.12 · C-11.13 · C-13.1 · C-14.1
 *
 * THE MISSION'S ~15 "ENGINES" ONTO TWELVE FROZEN STAGES.
 * Discovery, Workload Modelling, Test Design, Script Generation, Metrics, Bottleneck, Root Cause,
 * Predictive, Certification and Reporting are internal domains of these twelve stages, not
 * lifecycles of their own (R-12.18). The mapping (ADR-0026 §4):
 *
 *   1 planning            Performance requirement, SLA/SLO/SLI, scope validation
 *   2 discovery      EP   Topology discovery (pages, APIs, deps, queues, DBs, CDNs)
 *   3 context     EP->IP  Surface facts — the minimisation crossing
 *   4 arch-review         Workload model                                    (governance triad)
 *   5 policy-review       Test design authorisation                         (governance triad)
 *   6 guardrail-review    Execution guardrails — NO LOAD BEFORE THIS CERTIFIES (governance triad)
 *   7 exec-planning       Script generation, scenario matrix, distribution
 *   8 execution      EP   Load generation — deterministic (R-11.7)
 *   9 evidence       EP   Metric capture by reference
 *  10 reflection          Bottleneck, root cause, capacity, prediction, optimisation, defect, learning
 *  11 certification       Performance/Scalability/Reliability/... scores -> verdict
 *  12 reporting           Synchronisation and executive/board reporting
 */
import {
  runPhase, observedAgents, resolveReasoningMode,
  type Capability, type ReviewFinding, type StageContext, type StageEmitter, type StageName, type StageResult,
} from '@dbiz/capability-framework';
import { buildCatalogue } from './catalogue.js';
import { assembleFacts } from './agents/scope-and-discovery.js';
import type { SyncContext, CertificationInputs, LearningInputs } from './agents/sync-reporting-learning.js';
import { knowledgePriors, type BusinessWeights } from './agents/intelligence-layer.js';
import { PATTERN_CATALOGUE } from './agents/patterns.js';
import { scenarioTransform, DEFAULT_RESOURCE_BASELINE, type TwinInput } from './agents/twin.js';
import {
  scopeOrchestrator, discoveryOrchestrator, surfaceOrchestrator, workloadOrchestrator, designOrchestrator,
  guardrailOrchestrator, scriptOrchestrator, loadOrchestrator, metricsOrchestrator, bottleneckOrchestrator,
  rootcauseOrchestrator, capacityOrchestrator, optimisationOrchestrator, defectOrchestrator, learningOrchestrator,
  certificationOrchestrator, syncOrchestrator, reportingOrchestrator, governanceOrchestrator, domainOrchestrators,
  patternOrchestrator, businessOrchestrator, knowledgeOrchestrator, twinOrchestrator, simulationOrchestrator,
  PerformanceEngineOrchestrator,
  type AgentContextFactory, type EngineRuntime,
} from './orchestrators.js';
import { SEVERITY_ORDER } from './model.js';
import {
  type Baseline, type Bottleneck, type BusinessImpact, type CapacityForecast, type DigitalTwin, type EvidenceReference,
  type ExecutionPlan, type KnowledgeMatch, type KnowledgeRecord, type LearningRecord, type MetricSummary,
  type ObservedNode, type PatternMatch, type PerformanceCertification, type PerformanceDefect, type PerformanceReport,
  type PerformanceScope, type PerformanceTestCase, type PerformanceTestPlan, type PerformanceThreshold,
  type Prediction, type PredictionAccuracy, type PredictiveCertification, type RawSample, type Recommendation,
  type Regression, type ReleaseImpact, type ResourceForecast, type ResourceKind, type RootCauseChain,
  type ScenarioKind, type SeasonalForecast, type SeasonalPeriod, type Severity, type ServiceLevel,
  type SimulationResult, type SimulationScenario, type SurfaceFact, type SyncRecord, type TestType,
  type TransactionResult, type Verdict, type WorkloadModel,
} from './model.js';
import { renderReportPdf, boardReport } from './agents/report.js';
import type { PerformanceAdapterRegistry } from './adapters.js';

export const CAPABILITY_ID = 'performance-engine';

/** Everything the Execution Plane observes, and everything the engine cannot invent. */
export interface EngineDependencies {
  /** Execution Plane topology discovery, bound by the scope predicate. */
  readonly discover: (scope: PerformanceScope, inScope: (url: string) => boolean) => readonly ObservedNode[];
  /** Execution Plane load generation producing raw metric samples. */
  readonly generateLoad: (plan: ExecutionPlan, workload: WorkloadModel, inScope: (url: string) => boolean) => readonly RawSample[];
  /** Whether the target responded. `false` refuses the execution stage. */
  readonly environmentReachable: boolean;
  /** Evidence the Execution Plane captured, by reference. */
  readonly capturedEvidence: (results: readonly TransactionResult[]) => readonly { readonly kind: EvidenceReference['kind']; readonly metric: string; readonly digest: string; readonly locator: string }[];
  /** The customer's historical baselines, searched in the Execution Plane: transaction -> p95. */
  readonly baselines: readonly { readonly transactionId: string; readonly p95: number }[];
  /** The customer's historical performance-intelligence store (Knowledge Graph), searched in the EP. */
  readonly knowledgeRecords: readonly KnowledgeRecord[];
}

interface EngineState {
  readonly scope: PerformanceScope;
  readonly inScope: (u: string) => boolean;
  readonly serviceLevels: readonly ServiceLevel[];
  readonly testTypes: readonly TestType[];
  readonly authorizedVirtualUsers: number;
  readonly authorizedRequestsPerSecond: number;
  readonly objectives: { readonly peakConcurrency: number; readonly throughput: number };
  readonly nodes: readonly ObservedNode[];
  readonly facts: readonly SurfaceFact[];
  readonly endpoints: readonly string[];
  readonly workload: WorkloadModel;
  readonly plan: PerformanceTestPlan;
  readonly thresholds: readonly PerformanceThreshold[];
  readonly cases: readonly PerformanceTestCase[];
  readonly guardrailCertified: boolean;
  readonly execPlan: ExecutionPlan;
  readonly samples: readonly RawSample[];
  readonly results: readonly TransactionResult[];
  readonly summaries: readonly MetricSummary[];
  readonly evidence: readonly EvidenceReference[];
  readonly bottlenecks: readonly Bottleneck[];
  readonly rootCauses: readonly RootCauseChain[];
  readonly patterns: readonly PatternMatch[];
  readonly businessImpacts: readonly BusinessImpact[];
  readonly knowledgeMatches: readonly KnowledgeMatch[];
  readonly forecasts: readonly CapacityForecast[];
  readonly regressions: readonly Regression[];
  readonly predictions: readonly Prediction[];
  readonly recommendations: readonly Recommendation[];
  readonly defects: readonly PerformanceDefect[];
  readonly learning: readonly LearningRecord[];
  // Predictive Performance Layer (Increment C).
  readonly twin: DigitalTwin | null;
  readonly resourceForecasts: readonly ResourceForecast[];
  readonly seasonalForecasts: readonly SeasonalForecast[];
  readonly baselineTiers: readonly Baseline[];
  readonly simulations: readonly SimulationResult[];
  readonly releaseImpact: ReleaseImpact | null;
  readonly predictiveCertification: PredictiveCertification | null;
  readonly certification: PerformanceCertification | null;
  readonly sync: readonly SyncRecord[];
  readonly report: PerformanceReport | null;
}

const EMPTY_WORKLOAD: WorkloadModel = { targetId: '', transactions: [], pattern: 'steady', peakConcurrency: 0, arrivalRatePerSecond: 0, rampUpSeconds: 0, steadyStateSeconds: 0, rampDownSeconds: 0, regions: [], regionMix: {} };
const EMPTY_PLAN: PerformanceTestPlan = { id: '', targetId: '', objectives: [], suites: [], globalThresholds: [], kpis: [], serviceLevels: [] };
const EMPTY_EXEC: ExecutionPlan = { scripts: [], scenarioMatrix: [], distribution: { nodes: 0, regions: [], parallelism: 0 } };

function initialState(): EngineState {
  return {
    scope: { targetId: '', allowedHosts: [], exclusions: [], authorizationReference: '', testTypeCeiling: 'load', safeMode: true, maxVirtualUsers: 0, maxRequestsPerSecond: 0, environment: 'unknown' },
    inScope: () => false, serviceLevels: [], testTypes: [], authorizedVirtualUsers: 0, authorizedRequestsPerSecond: 0,
    objectives: { peakConcurrency: 0, throughput: 0 }, nodes: [], facts: [], endpoints: [],
    workload: EMPTY_WORKLOAD, plan: EMPTY_PLAN, thresholds: [], cases: [], guardrailCertified: false, execPlan: EMPTY_EXEC,
    samples: [], results: [], summaries: [], evidence: [], bottlenecks: [], rootCauses: [], patterns: [], businessImpacts: [], knowledgeMatches: [],
    forecasts: [], regressions: [], predictions: [], recommendations: [], defects: [], learning: [],
    twin: null, resourceForecasts: [], seasonalForecasts: [], baselineTiers: [], simulations: [], releaseImpact: null, predictiveCertification: null,
    certification: null, sync: [], report: null,
  };
}

function csv(value: string | undefined): readonly string[] { return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean); }

function buildScope(config: Readonly<Record<string, string>>): PerformanceScope {
  return {
    targetId: config['perf.targetId'] ?? '',
    allowedHosts: csv(config['perf.allowedHosts']),
    exclusions: csv(config['perf.exclusions']),
    authorizationReference: config['perf.authorizationReference'] ?? '',
    testTypeCeiling: (config['perf.testTypeCeiling'] as TestType) ?? 'load',
    safeMode: (config['perf.safeMode'] ?? 'true').toLowerCase() === 'true',
    maxVirtualUsers: Number(config['perf.maxVirtualUsers'] ?? '100'),
    maxRequestsPerSecond: Number(config['perf.maxRequestsPerSecond'] ?? '100'),
    environment: (config['perf.environment'] as PerformanceScope['environment']) ?? 'unknown',
  };
}

function buildServiceLevels(config: Readonly<Record<string, string>>): readonly ServiceLevel[] {
  const raw = config['perf.serviceLevels'];
  if (!raw) return [];
  try { const parsed = JSON.parse(raw) as ServiceLevel[]; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

/** Per-transaction business weights (revenue/users per hour) for financial-exposure scoring. */
function businessWeights(config: Readonly<Record<string, string>>): Readonly<Record<string, BusinessWeights>> {
  const raw = config['perf.business'];
  if (!raw) return {};
  try { const parsed = JSON.parse(raw) as Record<string, BusinessWeights>; return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

const DEFAULT_SCENARIOS: readonly ScenarioKind[] = ['black-friday', 'traffic-increase', 'infra-reduction', 'cache-failure'];
const SCENARIO_MAGNITUDE: Readonly<Partial<Record<ScenarioKind, number>>> = {
  'traffic-increase': 1.6, 'traffic-decrease': 0.7, 'infra-reduction': 0.75, 'infra-expansion': 1.5,
  'black-friday': 3, holiday: 1.8, 'end-of-month': 1.5, 'peak-banking': 2, 'insurance-renewal': 1.7, 'retail-promotion': 2.2,
};

/** Build the simulation scenario set from configuration, always including a what-if. */
function buildScenarios(config: Readonly<Record<string, string>>): readonly SimulationScenario[] {
  const kinds = (csv(config['perf.scenarios']) as ScenarioKind[]);
  const chosen = kinds.length > 0 ? kinds : DEFAULT_SCENARIOS;
  const list = chosen.map((kind, i): SimulationScenario => {
    const magnitude = SCENARIO_MAGNITUDE[kind] ?? 1;
    const t = scenarioTransform(kind, magnitude);
    return { id: `sc-${i + 1}`, kind, name: t.name, description: t.description, magnitude };
  });
  const whatif = Number(config['perf.whatif'] ?? '2');
  const wt = scenarioTransform('what-if', whatif);
  return [...list, { id: 'sc-whatif', kind: 'what-if', name: wt.name, description: 'configured what-if adjustment', magnitude: whatif }];
}

/** The twin's resource baseline from configuration, defaulting to a healthy baseline. */
function resourceBaseline(config: Readonly<Record<string, string>>): Readonly<Record<ResourceKind, number>> {
  const raw = config['perf.twin.baseline'];
  if (!raw) return DEFAULT_RESOURCE_BASELINE;
  try { const parsed = JSON.parse(raw) as Partial<Record<ResourceKind, number>>; return { ...DEFAULT_RESOURCE_BASELINE, ...parsed }; } catch { return DEFAULT_RESOURCE_BASELINE; }
}

function seasonalPeriods(config: Readonly<Record<string, string>>): readonly SeasonalPeriod[] {
  const raw = csv(config['perf.seasonalPeriods']) as SeasonalPeriod[];
  return raw.length > 0 ? raw : ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'holiday'];
}

export function performanceCapability(deps: EngineDependencies, runtime: EngineRuntime): Capability {
  const agents = buildCatalogue();

  const factoryFor = (ctx: StageContext): AgentContextFactory => (agentId: string) =>
    runtime.recorder.context({
      tenantId: ctx.tenantId, runId: ctx.runId, correlationId: ctx.correlationId,
      audit: ctx.audit, telemetry: () => { /* R-16.34: identifiers and outcomes only */ },
    }, agentId);

  function gated<T>(
    stage: StageName, phase: string, ctx: StageContext,
    execute: () => { value: T; subject: unknown; accepted: number; notApplicableReason?: string | null },
  ): { value: T; reason: string; notApplicableReason: string | null } {
    const factory = factoryFor(ctx);
    const gov = (input: Parameters<typeof governanceOrchestrator.coordinate>[0]) => governanceOrchestrator.coordinate(input, agents, factory);
    let accepted = 0;
    let notApplicableReason: string | null = null;
    const outcome = runPhase<{ value: T; subject: unknown; accepted: number; notApplicableReason?: string | null }, T>({
      stage, phase,
      execute: () => { const produced = execute(); accepted = produced.accepted; notApplicableReason = produced.notApplicableReason ?? null; return produced; },
      review: (x) => gov({ stage, phase: 'review', subject: x.subject, findings: [], accept: false, accepted }) as readonly ReviewFinding[],
      decide: (x, findings) => {
        const decision = gov({ stage, phase: 'decision', subject: x.subject, findings, accept: false, accepted }) as { accept: boolean; rejected: readonly { subject: string; reason: string }[] };
        return { accepted: x.value, rejected: decision.rejected };
      },
      certifyPhase: (_d, findings) => {
        const blocking = findings.some((f) => f.severity === 'blocking');
        return gov({ stage, phase: 'certification', subject: null, findings, accept: !blocking, accepted }) as { certified: boolean; reason: string };
      },
    });
    return { value: outcome.accepted, reason: outcome.certification.reason, notApplicableReason };
  }

  const stateOf = (ctx: StageContext): EngineState => (ctx.previous?.value as EngineState | undefined) ?? initialState();

  const stage = (
    name: StageName, phase: string,
    run: (state: EngineState, ctx: StageContext) => { value: EngineState; subject: unknown; accepted: number; notApplicableReason?: string | null },
  ) => (ctx: StageContext, emit: StageEmitter<StageName>): StageResult<StageName, unknown> => {
    const before = runtime.recorder.invoked().length;
    const result = gated<EngineState>(name, phase, ctx, () => run(stateOf(ctx), ctx));
    const invoked = observedAgents(runtime.recorder).slice(before);
    ctx.audit(`${name}.certified`, result.reason);
    // C-12.12: a stage that legitimately performs no work returns a typed NOT-APPLICABLE with a reason.
    return result.notApplicableReason
      ? emit.notApplicable<EngineState>(result.value, result.notApplicableReason, invoked)
      : emit.ok<EngineState>(result.value, invoked);
  };

  return {
    id: CAPABILITY_ID,
    version: '1.0.0',
    name: 'Performance Engine',
    requiredAdapters: ['LoadGeneratorAdapter', 'TestManagementAdapter'],
    evidenceClasses: ['topology', 'workload-model', 'metric-summaries', 'evidence-references', 'bottlenecks', 'capacity-forecast'],
    certificationCriteria: ['C-12.1', 'C-12.2', 'C-12.12', 'C-11.13', 'C-13.1', 'C-14.1'],
    stages: {
      // 1 — Performance requirement, SLA/SLO/SLI, scope validation
      planning: stage('planning', 'scope validation', (state, ctx) => {
        const scope = buildScope(ctx.configuration);
        const result = scopeOrchestrator.coordinate({ scope, serviceLevels: buildServiceLevels(ctx.configuration), requestedTestTypes: csv(ctx.configuration['perf.testTypes']) as readonly TestType[] }, agents, factoryFor(ctx));
        return {
          value: { ...state, scope: result.boundary.scope, inScope: result.boundary.inScope, serviceLevels: result.boundary.serviceLevels, testTypes: result.boundary.testTypes, authorizedVirtualUsers: result.boundary.authorizedVirtualUsers, authorizedRequestsPerSecond: result.boundary.authorizedRequestsPerSecond, objectives: result.objectives },
          subject: { allowedHosts: result.boundary.scope.allowedHosts, authorizationReference: result.boundary.scope.authorizationReference, authorizedVirtualUsers: result.boundary.authorizedVirtualUsers, testTypes: result.boundary.testTypes },
          accepted: result.boundary.scope.allowedHosts.length,
        };
      }),

      // 2 — Topology discovery (Execution Plane)
      discovery: stage('discovery', 'topology discovery', (state, ctx) => {
        const observed = deps.discover(state.scope, state.inScope);
        const nodes = discoveryOrchestrator.coordinate({ observed, inScope: state.inScope }, agents, factoryFor(ctx));
        return {
          value: { ...state, nodes },
          subject: { nodeCount: nodes.length, inScopeHonoured: nodes.every((n) => state.inScope(n.path)) },
          accepted: nodes.length,
        };
      }),

      // 3 — Surface facts: the minimisation crossing
      context: stage('context', 'surface facts', (state, ctx) => {
        const facts = assembleFacts(state.nodes);
        const surface = surfaceOrchestrator.coordinate({ facts }, agents, factoryFor(ctx));
        return {
          value: { ...state, facts, endpoints: surface.endpoints },
          subject: { facts, endpoints: surface.endpoints },
          accepted: facts.length,
        };
      }),

      // 4 — Workload model (governance triad)
      'architecture-review': stage('architecture-review', 'workload model', (state, ctx) => {
        const workload = workloadOrchestrator.coordinate({
          facts: state.facts, objectives: state.objectives, authorizedVirtualUsers: state.authorizedVirtualUsers,
          authorizedRequestsPerSecond: state.authorizedRequestsPerSecond, testTypes: state.testTypes, regions: csv(ctx.configuration['perf.regions']),
        }, agents, factoryFor(ctx));
        const wl: WorkloadModel = { ...workload, targetId: state.scope.targetId };
        return {
          value: { ...state, workload: wl },
          subject: { transactions: wl.transactions, peakConcurrency: wl.peakConcurrency },
          accepted: wl.transactions.length,
        };
      }),

      // 5 — Test design authorisation (governance triad)
      'policy-review': stage('policy-review', 'test design', (state, ctx) => {
        const design = designOrchestrator.coordinate({
          workload: state.workload, serviceLevels: state.serviceLevels, testTypes: state.testTypes,
          virtualUsers: state.workload.peakConcurrency || state.authorizedVirtualUsers, durationSeconds: Number(ctx.configuration['perf.durationSeconds'] ?? '300'),
        }, agents, factoryFor(ctx));
        return {
          value: { ...state, plan: design.plan, thresholds: design.thresholds, cases: design.cases },
          subject: { thresholds: design.thresholds, cases: design.cases },
          accepted: design.cases.length,
        };
      }),

      // 6 — Execution guardrails (governance triad). No load runs before this certifies.
      'guardrail-review': stage('guardrail-review', 'execution guardrails', (state, ctx) => {
        const guard = guardrailOrchestrator.coordinate({
          scope: state.scope, testTypes: state.testTypes, workload: state.workload,
          authorizedVirtualUsers: state.authorizedVirtualUsers, authorizedRequestsPerSecond: state.authorizedRequestsPerSecond,
        }, agents, factoryFor(ctx));
        return {
          value: { ...state, guardrailCertified: guard.authorization.certified },
          subject: { certified: guard.authorization.certified, refusals: guard.authorization.refusals, productionAggressive: guard.productionAggressive },
          accepted: guard.authorization.certified ? 1 : 0,
        };
      }),

      // 7 — Script generation, scenario matrix, distribution
      'execution-planning': stage('execution-planning', 'script generation', (state, ctx) => {
        const execPlan = scriptOrchestrator.coordinate({
          cases: state.cases, workload: state.workload,
          tool: runtime.loadGenerator.identity.provider, dialect: runtime.loadGenerator.dialect,
        }, agents, factoryFor(ctx));
        for (const script of execPlan.scripts) runtime.loadGenerator.render(script);
        return {
          value: { ...state, execPlan },
          subject: { scripts: execPlan.scripts, caseCount: state.cases.length },
          accepted: execPlan.scripts.length,
        };
      }),

      // 8 — Load generation (Execution Plane), optionally fused with APM/monitoring samples
      execution: stage('execution', 'load generation', (state, ctx) => {
        // Simulate mode: the Digital Twin predicts behaviour and NEVER executes load. The stage is
        // typed NOT-APPLICABLE (C-12.12) with a stated reason; the twin predicts in reflection.
        if ((ctx.configuration['perf.mode'] ?? 'execute').toLowerCase() === 'simulate') {
          return {
            value: { ...state, samples: [] },
            subject: { environmentReachable: true, rawSampleCount: 0 },
            accepted: 0,
            notApplicableReason: 'simulation mode: the Digital Twin predicts behaviour and never executes load',
          };
        }
        const reachable = deps.environmentReachable && state.guardrailCertified;
        let samples: readonly RawSample[] = [];
        if (reachable) {
          const factory = factoryFor(ctx);
          const generated = deps.generateLoad(state.execPlan, state.workload, state.inScope);
          // OPTIONAL APM fusion (ADR-0026 §4.3): a configured monitoring provider contributes
          // Execution-Plane samples for the same window. Absent, the run proceeds on load samples
          // alone — APM is never a hard dependency.
          let monitorSamples: readonly RawSample[] = [];
          if (runtime.monitoring) {
            const window = { fromMillis: Math.min(...generated.map((s) => s.atMillis), 0), toMillis: Math.max(...generated.map((s) => s.atMillis), 0) };
            const collected = runtime.monitoring.collect({ targetId: state.scope.targetId, window, transactions: state.workload.transactions.map((t) => t.id) });
            monitorSamples = agents.invoke<{ samples: readonly RawSample[] }, readonly RawSample[]>('load.monitor-collect', { samples: collected }, factory('load.monitor-collect'));
          }
          samples = loadOrchestrator.coordinate({ plan: state.execPlan, samples: [...generated, ...monitorSamples], authorizedRequestsPerSecond: state.authorizedRequestsPerSecond }, agents, factory);
        }
        return {
          value: { ...state, samples },
          subject: { environmentReachable: deps.environmentReachable, rawSampleCount: samples.length },
          accepted: samples.length,
        };
      }),

      // 9 — Metric capture by reference (Execution Plane)
      evidence: stage('evidence', 'metric capture', (state, ctx) => {
        const evidenceByTxn = new Map<string, readonly string[]>();
        const metrics = metricsOrchestrator.coordinate({ samples: state.samples, capturedEvidence: deps.capturedEvidence, evidenceByTxn }, agents, factoryFor(ctx));
        const locators = metrics.evidence.map((e) => e.locator);
        const results = metrics.results.map((r) => ({ ...r, evidenceRefs: locators }));
        return {
          value: { ...state, results, summaries: metrics.summaries, evidence: metrics.evidence },
          subject: { references: metrics.evidence, resultCount: results.length },
          accepted: metrics.evidence.length,
        };
      }),

      // 10 — Reflection: bottleneck, root cause, then the Performance Intelligence Layer
      //      (pattern -> business -> knowledge -> optimization), capacity, defect, learning.
      reflection: stage('reflection', 'intelligence', (state, ctx) => {
        const factory = factoryFor(ctx);
        const evidenceRefs = state.evidence.map((e) => e.locator);
        const bottlenecks = bottleneckOrchestrator.coordinate({ summaries: state.summaries, evidenceRefs }, agents, factory);
        const rootCauses = rootcauseOrchestrator.coordinate({ bottlenecks }, agents, factory);

        // ── Performance Intelligence Layer chain ──────────────────────────────
        // D1 Pattern: knowledge priors (recurrence + suppression) feed deterministic matching.
        const kinds = PATTERN_CATALOGUE.map((p) => p.kind);
        const priors = knowledgePriors(deps.knowledgeRecords, kinds);
        const patterns = patternOrchestrator.coordinate({ summaries: state.summaries, evidenceRefs, recurrence: priors.recurrence, suppressed: priors.suppressed }, agents, factory);
        // D2 Business: translate the worst finding into business outcomes per transaction.
        const worstSeverity: Severity = [...patterns.map((p) => p.severity), ...bottlenecks.map((b) => b.severity)].sort((a, b) => SEVERITY_ORDER[b] - SEVERITY_ORDER[a])[0] ?? 'info';
        const weights = businessWeights(ctx.configuration);
        const windowSeconds = Number(ctx.configuration['perf.durationSeconds'] ?? '300');
        const businessImpacts = businessOrchestrator.coordinate({ transactions: state.workload.transactions, results: state.results, worstSeverity, weights, windowSeconds }, agents, factory);
        // D3 Knowledge Graph: search prior occurrences and verified fixes; write this run back.
        const knowledgeMatches = knowledgeOrchestrator.coordinate({ matches: patterns, records: deps.knowledgeRecords, memory: runtime.memory }, agents, factory);
        // D4 Optimization: recommendations from bottlenecks + patterns, reusing prior fixes.
        const recommendations = optimisationOrchestrator.coordinate({ bottlenecks, patterns, knowledgeMatches }, agents, factory);

        const baselines = new Map(deps.baselines.map((b) => [b.transactionId, b.p95] as const));

        // ── Predictive Performance Layer (Increment C): Digital Twin + Simulation ──
        const historyCoverage = deps.knowledgeRecords.length > 0 ? Math.min(1, deps.knowledgeRecords.length / 10) : (deps.baselines.length > 0 ? 0.5 : 0);
        const twinInput: TwinInput = {
          targetId: state.scope.targetId, transactions: state.workload.transactions.map((t) => ({ id: t.id, slaMs: t.slaMs })),
          nodeCount: state.facts.length, dependencies: state.facts.filter((f) => ['database', 'queue', 'cache', 'cdn', 'third-party', 'microservice'].includes(f.kind)).map((f) => f.id),
          baselines, resourceBaseline: resourceBaseline(ctx.configuration), historyCoverage,
        };
        const twinResult = twinOrchestrator.coordinate({ twinInput, concurrency: state.workload.peakConcurrency || state.authorizedVirtualUsers, periods: seasonalPeriods(ctx.configuration), baselines }, agents, factory);
        const releaseMagnitude = 1 + Number(ctx.configuration['perf.releaseRegression'] ?? '5') / 100;
        const simSet = simulationOrchestrator.coordinate({
          twin: twinResult.twin, scenarios: buildScenarios(ctx.configuration), thresholds: state.thresholds,
          transactions: state.workload.transactions.map((t) => ({ id: t.id, slaMs: t.slaMs })),
          release: ctx.configuration['perf.release'] ?? 'current', releaseMagnitude,
        }, agents, factory);
        const capacity = capacityOrchestrator.coordinate({ summaries: state.summaries, thresholds: state.thresholds, concurrency: state.workload.peakConcurrency, results: state.results, baselines, bottlenecks }, agents, factory);
        const defects = defectOrchestrator.coordinate({ results: state.results, thresholds: state.thresholds, rootCauses, bottlenecks }, agents, factory);
        const learningInputs: LearningInputs = { targetId: state.scope.targetId, results: state.results, bottlenecks, regressions: capacity.regressions, forecasts: capacity.forecasts, promptsDelivered: runtime.reasoning.ledger().delivered, promptsWithheld: runtime.reasoning.ledger().withheld };
        const learning = learningOrchestrator.coordinate({ inputs: learningInputs }, agents, factory);

        const serious = bottlenecks.filter((b) => b.severity === 'critical' || b.severity === 'high');
        const symptomOnly = serious.some((b) => !rootCauses.some((c) => c.bottleneckId === b.id));
        const chainNodes = rootCauses.flatMap((c) => c.chain);

        return {
          value: {
            ...state, bottlenecks, rootCauses, patterns, businessImpacts, knowledgeMatches,
            twin: twinResult.twin, resourceForecasts: twinResult.resourceForecasts, seasonalForecasts: twinResult.seasonalForecasts, baselineTiers: twinResult.baselineTiers,
            simulations: simSet.simulations, releaseImpact: simSet.releaseImpact, predictiveCertification: simSet.predictiveCertification,
            forecasts: capacity.forecasts, regressions: capacity.regressions, predictions: capacity.predictions, recommendations, defects, learning,
          },
          subject: { symptomOnly, chainNodes, defects, learning, patterns, predictedVerdict: simSet.predictiveCertification.predictedVerdict, predictionConfidence: simSet.predictiveCertification.confidence },
          accepted: bottlenecks.length,
        };
      }),

      // 11 — Certification: performance/scalability/reliability/... -> verdict
      certification: stage('certification', 'performance certification', (state, ctx) => {
        const blockingBreaches = state.defects.filter((d) => d.severity === 'critical' || d.severity === 'high').map((d) => d.title);
        const certInputs: CertificationInputs = { targetId: state.scope.targetId, results: state.results, thresholds: state.thresholds, bottlenecks: state.bottlenecks, forecasts: state.forecasts, regressions: state.regressions };
        const certification = certificationOrchestrator.coordinate({ inputs: certInputs, blockingBreaches }, agents, factoryFor(ctx));
        return {
          value: { ...state, certification },
          subject: { measuredCount: certification.scores.filter((s) => s.measured).length, scores: certification.scores, verdict: certification.verdict, verdictReason: certification.rationale },
          accepted: certification.scores.filter((s) => s.measured).length,
        };
      }),

      // 12 — Synchronisation and reporting
      reporting: stage('reporting', 'synchronisation and reporting', (state, ctx) => {
        const factory = factoryFor(ctx);
        const reasoningMode = resolveReasoningMode(ctx.configuration);
        const cert = state.certification;
        const verdict: Verdict = cert?.verdict ?? 'FAIL';

        const syncCtx: SyncContext = {
          adapter: runtime.testManagement, targetId: state.scope.targetId, results: state.results, defects: state.defects, verdict,
          evidenceRefs: state.evidence.map((e) => ({ sha256: e.sha256, locator: e.locator, kind: e.kind })),
        };
        const sync = syncOrchestrator.coordinate({ ctx: syncCtx }, agents, factory);

        const measured = state.testTypes.length > 0 && state.results.length > 0;
        const compliance = cert ? complianceFromScores(cert) : null;
        // Performance Intelligence Layer summaries (Increment B).
        const topBusiness = [...state.businessImpacts].sort((a, b) => b.businessImpactScore - a.businessImpactScore)[0] ?? null;
        const estimatedSavings = state.recommendations.reduce((m, r) => Math.max(m, r.expectedCostSavingPercent), 0);
        // Predictive Performance Layer: prediction vs reality (Increment C).
        const predCert = state.predictiveCertification;
        const worstScenario = [...state.simulations].sort((a, b) => a.predictedScore - b.predictedScore)[0] ?? null;
        const predictionAccuracy = predCert
          ? agents.invoke<{ predictedVerdict: Verdict; predictedScore: number; actualVerdict: Verdict | null; actualScore: number | null }, PredictionAccuracy>(
            'simulation.accuracy',
            { predictedVerdict: predCert.predictedVerdict, predictedScore: predCert.predictedScore, actualVerdict: measured ? verdict : null, actualScore: measured && cert ? cert.overallScore : null },
            factory('simulation.accuracy'))
          : null;
        const report: PerformanceReport = {
          targetId: state.scope.targetId, reasoningMode, testTypesRun: state.testTypes,
          transactionsSummarised: state.results.length,
          slaCompliancePercent: compliance,
          scores: cert?.scores ?? [], overallScore: cert?.overallScore ?? 0, verdict,
          topBottlenecks: state.bottlenecks.slice(0, 20).map((b) => ({ kind: b.kind, component: b.component, severity: b.severity })),
          regressionCount: state.regressions.filter((r) => r.direction === 'regressed').length,
          worstRegressionPercent: state.regressions.length === 0 ? null : Math.max(...state.regressions.map((r) => r.deltaPercent)),
          capacityHeadroomPercent: state.forecasts.length === 0 ? null : Math.min(...state.forecasts.map((f) => f.headroomPercent)),
          predictionCount: state.predictions.length, defectCount: state.defects.length,
          patternCount: state.patterns.length,
          topPatterns: state.patterns.slice(0, 10).map((p) => ({ kind: p.kind, severity: p.severity, confidence: p.confidence })),
          businessImpactScore: topBusiness ? topBusiness.businessImpactScore : null,
          estimatedFinancialExposure: state.businessImpacts.length === 0 ? null : state.businessImpacts.reduce((a, b) => a + b.estimatedFinancialExposure, 0),
          knowledgeMatchCount: state.knowledgeMatches.length,
          recommendationCount: state.recommendations.length,
          estimatedSavingsPercent: state.recommendations.length === 0 ? null : estimatedSavings,
          executiveActions: state.businessImpacts.slice(0, 3).map((b) => `Protect ${b.businessCapability} (${b.executiveSeverity})`),
          engineeringActions: state.recommendations.slice(0, 3).map((r) => `${r.subject}: ${r.text}`),
          operationsActions: state.patterns.filter((p) => p.severity === 'critical' || p.severity === 'high').slice(0, 3).map((p) => `Watch ${p.name} (${p.severity})`),
          digitalTwinConfidence: state.twin ? state.twin.confidence : null,
          simulationCount: state.simulations.length,
          worstScenario: worstScenario ? { kind: worstScenario.kind, predictedVerdict: worstScenario.predictedVerdict, confidence: worstScenario.confidence } : null,
          predictedVerdict: predCert ? predCert.predictedVerdict : null,
          predictionConfidence: predCert ? predCert.confidence : null,
          predictionAccuracy,
          seasonalForecasts: state.seasonalForecasts,
          resourceForecasts: state.resourceForecasts,
          releaseImpact: state.releaseImpact,
          executiveSummary: measured
            ? `Verdict ${verdict} at ${cert?.overallScore ?? 0}/100 across ${state.results.length} transaction(s); ${state.patterns.length} pattern(s); predicted ${predCert?.predictedVerdict ?? 'n/a'} under ${state.simulations.length} scenario(s).`
            : `Simulation: predicted ${predCert?.predictedVerdict ?? 'n/a'} under ${state.simulations.length} scenario(s); no load executed.`,
          rationale: cert?.rationale ?? 'no certification produced',
        };

        reportingOrchestrator.coordinate({
          report, render: renderReportPdf, board: boardReport,
          scores: report.scores, compliance, bottlenecks: state.bottlenecks, forecasts: state.forecasts, regressions: state.regressions,
        } as Record<string, unknown>, agents, factory);
        const pdf = renderReportPdf(report);

        return {
          value: { ...state, sync, report },
          subject: { sync, verdict, claimedReady: /\bready\b/i.test(report.executiveSummary) && verdict === 'FAIL', pdfBytes: pdf.bytes },
          accepted: sync.filter((r) => r.published).length,
        };
      }),
    },
  };
}

function complianceFromScores(cert: PerformanceCertification): number | null {
  const perf = cert.scores.find((s) => s.dimension === 'performance');
  return perf && perf.measured ? perf.score : null;
}

/** Wire the master orchestrator with a capability factory bound to these dependencies. */
export function buildPerformanceOrchestrator(deps: EngineDependencies, registry: PerformanceAdapterRegistry): PerformanceEngineOrchestrator {
  return new PerformanceEngineOrchestrator((runtime: EngineRuntime) => performanceCapability(deps, runtime), buildCatalogue(), registry);
}

export { domainOrchestrators };
