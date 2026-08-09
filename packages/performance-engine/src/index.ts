/**
 * @dbiz/performance-engine — capability 4 of 6.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 — **Performance Engine**
 *   ADR          : ADR-0026
 *
 * This package creates no new capability. The platform still exposes six (R-11.4) and still runs
 * one orchestration lifecycle (R-12.18). The Performance Engine is the canonical implementation of
 * capability 4, built as internal structure over the twelve frozen stages — one master
 * orchestrator, domain orchestrators across nineteen domains, and a discovery, workload, design,
 * script, metrics, bottleneck, root-cause, capacity, optimisation, defect, certification and
 * reporting catalogue, with AI-enabled and non-AI modes selected by configuration and no
 * duplicated workflow.
 *
 * The brief calls this the "Performance Testing Intelligence Engine (PTIE)". PTIE is the
 * customer-facing product name of this capability; the registry id, package and certification all
 * read `performance-engine`.
 */
export {
  CAPABILITY_ID, performanceCapability, buildPerformanceOrchestrator,
} from './capability.js';
export type { EngineDependencies } from './capability.js';

export { buildCatalogue, ALL_AGENTS } from './catalogue.js';

export {
  PerformanceEngineOrchestrator, DOMAINS, domainOrchestrators, defineDomainOrchestrator,
  scopeOrchestrator, discoveryOrchestrator, surfaceOrchestrator, workloadOrchestrator, designOrchestrator,
  guardrailOrchestrator, scriptOrchestrator, loadOrchestrator, metricsOrchestrator, bottleneckOrchestrator,
  rootcauseOrchestrator, capacityOrchestrator, optimisationOrchestrator, defectOrchestrator, learningOrchestrator,
  certificationOrchestrator, syncOrchestrator, reportingOrchestrator, governanceOrchestrator,
} from './orchestrators.js';
export type {
  Domain, DomainOrchestrator, PerformanceRequest, PerformanceOrchestrationResult, EngineRuntime,
  AgentContextFactory, ScopeResult, SurfaceResult, DesignResult, GuardrailResult, MetricsResult, CapacityResult,
  GovernancePhase, GovernanceInput,
} from './orchestrators.js';

export {
  PerformanceAdapterRegistry, AdapterError, defaultAdapterRegistry, resetAdapterSequence,
  k6Adapter, jmeterAdapter, gatlingAdapter, locustAdapter, playwrightAdapter,
  azureDevOpsAdapter, zephyrAdapter, jiraXrayAdapter,
  dynatraceAdapter, appDynamicsAdapter, datadogAdapter, newRelicAdapter, azureMonitorAdapter,
  cloudWatchAdapter, gcpOperationsAdapter, prometheusAdapter, grafanaAdapter, elasticApmAdapter, openTelemetryAdapter,
} from './adapters.js';
export type { LoadGeneratorAdapter, TestManagementAdapter, MonitoringAdapter, MonitorRequest, MonitorWindow, AdapterIdentity, AdapterJournal, RenderedScript } from './adapters.js';

export { renderPdf, executivePages, renderReportPdf, boardReport, num } from './agents/report.js';
export type { PdfPage, BoardReport } from './agents/report.js';

export { STAGE_RULES, governanceAgents } from './agents/governance.js';
export type { StageRule } from './agents/governance.js';

// Performance Intelligence Layer (Increment B)
export { PATTERN_CATALOGUE, COMPOSITE_PATTERNS, matchPatterns } from './agents/patterns.js';
export {
  patternAgents, businessAgents, knowledgeAgents, optimisationLayerAgents,
  assembleBusinessImpact, knowledgePriors,
} from './agents/intelligence-layer.js';
export type { BusinessWeights, PatternInput, BusinessInput, KnowledgeInput, OptimisationLayerInput } from './agents/intelligence-layer.js';
export {
  patternOrchestrator, businessOrchestrator, knowledgeOrchestrator,
} from './orchestrators.js';
export { buildRecommendation } from './agents/analysis.js';

// Predictive Performance Layer (Increment C)
export {
  buildTwin, applyScenario, simulateScenario, scenarioTransform, resourceForecast, seasonalForecast,
  baselineTiers, worstOf, riskGrade, DEFAULT_RESOURCE_BASELINE,
} from './agents/twin.js';
export type { TwinInput } from './agents/twin.js';
export { twinAgents, simulationAgents } from './agents/predictive-layer.js';
export type { ScenarioInput } from './agents/predictive-layer.js';
export { twinOrchestrator, simulationOrchestrator } from './orchestrators.js';
export type { TwinResult, SimulationSet } from './orchestrators.js';

export { buildInScope, type ScopeBoundary } from './agents/scope-and-discovery.js';
export { assembleWorkload, assemblePlan, type GuardrailAuthorization } from './agents/workload-design-guardrail.js';
export { assembleCertification, scoreDimension, slaCompliance, type CertificationInputs, type SyncContext, type LearningInputs } from './agents/sync-reporting-learning.js';
export { primaryBottlenecks, buildRootCause, forecastCapacity, detectRegressions, recommendationsFor, defectsFromBreaches } from './agents/analysis.js';

export {
  minimiseNode, minimiseNodes, summarise, percentileOf, scrubLabel, fingerprint, thresholdHolds,
  severityForScore, priorityForSeverity, testTypeAllowed, round2,
  TEST_TYPES, TEST_TYPE_INTENSITY, PERCENTILES, SEVERITY_ORDER, CERTIFICATION_DIMENSIONS,
} from './model.js';
export type {
  TestType, ServiceLevel, SlaKind, NodeKind, Protocol, ObservedNode, SurfaceFact, Criticality,
  BusinessTransaction, WorkloadPattern, WorkloadModel, Comparator, PerformanceThreshold, PerformanceTestCase,
  PerformanceTestSuite, PerformanceTestPlan, ScriptStep, PerformanceScript, ExecutionPlan, MetricCategory,
  RawSample, PercentileKey, MetricSummary, EvidenceKind, EvidenceReference, TransactionResult, Severity,
  BottleneckKind, Bottleneck, Provenance, RootCauseNode, RootCauseChain, RegressionDirection, Regression,
  PredictionKind, Prediction, CapacityForecast, RecommendationKind, Effort, Grade, Recommendation, Priority,
  PerformanceDefect, LearningKind, LearningRecord, CertificationDimension, DimensionScore, Verdict,
  PerformanceCertification, SyncRecord, PerformanceReport,
  PatternKind, PerformancePattern, CompositePattern, PatternMatch, BusinessSeverity, BusinessImpact,
  KnowledgeRecordKind, KnowledgeRecord, KnowledgeMatch,
  ResourceKind, ResourceModel, DigitalTwin, ScenarioKind, SimulationScenario, SimulationResult,
  ResourceForecast, SeasonalPeriod, SeasonalForecast, BaselineTier, Baseline, ReleaseImpact,
  PredictiveCertification, PredictionAccuracy,
} from './model.js';
