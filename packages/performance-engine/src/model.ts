/**
 * The Performance Engine's domain model.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 08-security-model.md · 11-capability-model.md §2 (cap 4)
 *                  19-repository-ownership.md
 *   ADR          : ADR-0026
 *   Criteria     : C-06.x (customer artefacts are Execution Plane custody)
 *   Evidence     : E-5 (no customer artefact is retained in the Intelligence Plane)
 *
 * THE BOUNDARY IS IN THE TYPES, NOT IN THE DISCIPLINE.
 *
 * A performance test has the same sovereignty problem the penetration test does. The
 * Execution Plane discovers the real topology (host names, IPs, connection strings) and
 * captures raw metric samples (per-host CPU, a slow-query string, a thread dump). The
 * Intelligence Plane must model workload, find bottlenecks and forecast capacity WITHOUT
 * ever holding the raw host values or the captured artefacts.
 *
 * The line is drawn between OBSERVATION and FACT, and between SAMPLE and SUMMARY:
 *
 *   ObservedNode / RawSample     — Execution Plane. May carry values: a host name, an IP,
 *                                  a connection string, a slow-query text, a per-host reading.
 *   SurfaceFact / MetricSummary  — Intelligence Plane. Carry a kind, an identifier, a
 *                                  location, a protocol, attribute NAMES, and STATISTICS
 *                                  (count, mean, percentiles). There is no field for a raw
 *                                  per-host value or a captured artefact — so none can cross.
 *
 * A flame graph proves a CPU bottleneck; the graph stays in the Execution Plane as evidence,
 * and what crosses is `{ kind: 'cpu', component: 'orders-svc', saturationPercent: 96,
 * evidenceRef: <hash+locator> }`. `EvidenceReference` has a hash and a locator and no content
 * field — a rule the platform has already certified and this engine inherits rather than
 * restates.
 */

// ── Scope and configuration (stage 1, planning) ─────────────────────────────

/** The performance test types, in ascending intensity. Configuration selects the ceiling. */
export type TestType = 'smoke' | 'load' | 'stress' | 'soak' | 'spike' | 'breakpoint' | 'scalability';
export const TEST_TYPES: readonly TestType[] = ['smoke', 'load', 'stress', 'soak', 'spike', 'breakpoint', 'scalability'];

/** Relative intensity, used to refuse a type above the configured ceiling. */
export const TEST_TYPE_INTENSITY: Readonly<Record<TestType, number>> = {
  smoke: 0, load: 1, soak: 2, scalability: 3, spike: 4, stress: 5, breakpoint: 6,
};

export function testTypeAllowed(ceiling: TestType, type: TestType): boolean {
  return TEST_TYPE_INTENSITY[type] <= TEST_TYPE_INTENSITY[ceiling];
}

export interface PerformanceScope {
  readonly targetId: string;
  /** Hosts and origins authorised for load. Anything else is refused at the scope gate. */
  readonly allowedHosts: readonly string[];
  /** Paths explicitly excluded from load. Checked before any request, never after. */
  readonly exclusions: readonly string[];
  /** The authorisation record that permits this test at all. No load without it. */
  readonly authorizationReference: string;
  /** The most intense test type permitted. */
  readonly testTypeCeiling: TestType;
  /** Safe mode caps virtual users and forbids breakpoint/stress ramp beyond the ceiling. */
  readonly safeMode: boolean;
  /** The virtual-user ceiling the customer environment will tolerate. */
  readonly maxVirtualUsers: number;
  /** Requests per second the customer environment will tolerate. */
  readonly maxRequestsPerSecond: number;
  /** Environment classification. `production` tightens every guardrail. */
  readonly environment: 'production' | 'staging' | 'test' | 'unknown';
}

/** A Service Level Objective/Indicator/Agreement, declared up front and certified against. */
export type SlaKind = 'sla' | 'slo' | 'sli';
export interface ServiceLevel {
  readonly kind: SlaKind;
  readonly id: string;
  /** The metric this level governs, e.g. `api.p95` or `availability`. */
  readonly metric: string;
  readonly comparator: Comparator;
  readonly value: number;
  readonly unit: string;
  /** Transaction id, or `global`. */
  readonly appliesTo: string;
}

// ── Execution Plane observation (stage 2, discovery) ────────────────────────

export type NodeKind =
  | 'page' | 'rest-api' | 'soap-api' | 'graphql-api' | 'grpc-service' | 'websocket' | 'sse-endpoint'
  | 'form' | 'auth-flow' | 'database' | 'queue' | 'cache' | 'cdn' | 'third-party' | 'microservice'
  | 'batch-job' | 'scheduler' | 'stream' | 'load-balancer' | 'host' | 'container' | 'pod';

export type Protocol = 'http' | 'https' | 'soap' | 'graphql' | 'grpc' | 'ws' | 'wss' | 'sse' | 'amqp' | 'kafka' | 'sql' | 'redis' | 'none';

/**
 * What the Execution Plane observed about the topology. Execution Plane custody, permanently.
 *
 * `values` is where content lives — a host name, an IP, a connection string, a discovered
 * header value. It is the reason this type never leaves the EP. Nothing in the Intelligence
 * Plane accepts an `ObservedNode`, and the compiler enforces that rather than a review comment.
 */
export interface ObservedNode {
  readonly kind: NodeKind;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly protocol: Protocol;
  /** Attribute name to observed value. EP only. */
  readonly values: Readonly<Record<string, string>>;
  readonly parentId: string | null;
}

/**
 * The minimised projection of a topology node that crosses into the Intelligence Plane.
 *
 * Note the absence: there is no `values`, only `attributeNames`. A change that wanted to
 * smuggle a value across would have to add a field, which is a reviewable act.
 */
export interface SurfaceFact {
  readonly kind: NodeKind;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly protocol: Protocol;
  readonly attributeNames: readonly string[];
  readonly parentId: string | null;
}

/**
 * Scrub identifying content from a label before it crosses the boundary.
 *
 * Query-string secrets, emails and reference numbers are redacted. The single label-scrubber
 * so the rule is audited in one place, mirroring the pentest engine.
 */
export function scrubLabel(label: string): string {
  return label
    .replace(/([?&](?:token|key|secret|password|pwd|sig|signature|access_token|api[_-]?key)=)[^&\s]+/gi, '$1{redacted}')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '{email}')
    .replace(/\b[A-Z]{2,}-\d{2,}\b/g, '{reference}');
}

/**
 * Minimise an observation into a surface fact.
 *
 * The single crossing point for topology structure. Auditing what crosses means auditing one
 * function rather than every agent that ever touched a node.
 */
export function minimiseNode(node: ObservedNode): SurfaceFact {
  return {
    kind: node.kind,
    id: node.id,
    label: scrubLabel(node.label),
    path: scrubLabel(node.path),
    protocol: node.protocol,
    attributeNames: Object.keys(node.values).sort(),
    parentId: node.parentId,
  };
}

export function minimiseNodes(nodes: readonly ObservedNode[]): readonly SurfaceFact[] {
  return nodes.map(minimiseNode).sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ── Workload model (stage 4, architecture-review) ───────────────────────────

export type Criticality = 'low' | 'medium' | 'high' | 'critical';
export const CRITICALITY_ORDER: Readonly<Record<Criticality, number>> = { low: 0, medium: 1, high: 2, critical: 3 };

export interface BusinessTransaction {
  readonly id: string;
  readonly name: string;
  /** The business journey this transaction belongs to. */
  readonly journey: string;
  readonly criticality: Criticality;
  /** Share of the workload mix, 0..1. The mix over all transactions sums to ~1. */
  readonly mix: number;
  /** Think time between steps, milliseconds. */
  readonly thinkTimeMs: number;
  /** The response-time objective for this transaction, milliseconds. */
  readonly slaMs: number;
  /** The surface-fact ids that make up this transaction. */
  readonly nodeIds: readonly string[];
}

export type WorkloadPattern = 'steady' | 'ramp' | 'burst' | 'spike' | 'seasonal';

export interface WorkloadModel {
  readonly targetId: string;
  readonly transactions: readonly BusinessTransaction[];
  readonly pattern: WorkloadPattern;
  readonly peakConcurrency: number;
  readonly arrivalRatePerSecond: number;
  readonly rampUpSeconds: number;
  readonly steadyStateSeconds: number;
  readonly rampDownSeconds: number;
  readonly regions: readonly string[];
  /** Multi-tenant / multi-region distribution weight, region -> share. */
  readonly regionMix: Readonly<Record<string, number>>;
}

// ── Test design (stage 5, policy-review) ────────────────────────────────────

export type Comparator = 'lte' | 'gte' | 'lt' | 'gt' | 'eq';

export interface PerformanceThreshold {
  readonly id: string;
  /** Metric key, e.g. `api.p95`, `error.rate`, `cpu.utilisation`. */
  readonly metric: string;
  readonly comparator: Comparator;
  readonly value: number;
  readonly unit: string;
  /** Transaction id, or `global`. */
  readonly appliesTo: string;
  /** A breach of a `blocking` threshold fails certification; `advisory` is reported only. */
  readonly severity: 'blocking' | 'advisory';
}

export interface PerformanceTestCase {
  readonly id: string;
  readonly name: string;
  readonly transactionId: string;
  readonly testType: TestType;
  readonly thresholds: readonly PerformanceThreshold[];
  readonly acceptanceCriteria: readonly string[];
  readonly virtualUsers: number;
  readonly durationSeconds: number;
}

export interface PerformanceTestSuite {
  readonly id: string;
  readonly name: string;
  readonly testType: TestType;
  readonly cases: readonly PerformanceTestCase[];
}

export interface PerformanceTestPlan {
  readonly id: string;
  readonly targetId: string;
  readonly objectives: readonly string[];
  readonly suites: readonly PerformanceTestSuite[];
  readonly globalThresholds: readonly PerformanceThreshold[];
  readonly kpis: readonly string[];
  readonly serviceLevels: readonly ServiceLevel[];
}

// ── Script generation & execution plan (stage 7, execution-planning) ────────

export interface ScriptStep {
  readonly order: number;
  readonly transactionId: string;
  readonly method: string;
  /** Scrubbed path — no query secrets. */
  readonly path: string;
  readonly thinkTimeMs: number;
}

/**
 * A generated performance script.
 *
 * The script is the platform's OWN generated artefact, not customer content — it carries no
 * captured value. `bodyDigest` is the hash of the rendered tool file the Execution Plane will
 * run; the rendered text itself is produced by the adapter in the Execution Plane.
 */
export interface PerformanceScript {
  readonly id: string;
  /** The load-generator provider this dialect targets, e.g. `k6`, `jmeter`. */
  readonly tool: string;
  readonly dialect: string;
  readonly scenarioName: string;
  readonly virtualUsers: number;
  readonly durationSeconds: number;
  readonly steps: readonly ScriptStep[];
  readonly bodyDigest: string;
}

export interface ExecutionPlan {
  readonly scripts: readonly PerformanceScript[];
  /** Ordered scenario batches; a batch runs its scripts in parallel. */
  readonly scenarioMatrix: readonly (readonly string[])[];
  readonly distribution: { readonly nodes: number; readonly regions: readonly string[]; readonly parallelism: number };
}

// ── Metrics (stage 8/9, execution/evidence) ─────────────────────────────────

export type MetricCategory = 'browser' | 'api' | 'infrastructure' | 'database' | 'queue' | 'runtime' | 'cloud' | 'network';

/**
 * A raw metric sample. Execution Plane custody, permanently.
 *
 * `host` and `value` are per-host readings. Nothing in the Intelligence Plane accepts a
 * `RawSample`; only the statistical `MetricSummary` derived from many samples crosses.
 */
export interface RawSample {
  readonly metric: string;
  readonly category: MetricCategory;
  readonly transactionId: string;
  readonly host: string;
  readonly value: number;
  readonly unit: string;
  readonly atMillis: number;
}

/** The percentile ladder every latency-like metric reports. */
export type PercentileKey = 'p50' | 'p75' | 'p90' | 'p95' | 'p99' | 'p999';
export const PERCENTILES: readonly PercentileKey[] = ['p50', 'p75', 'p90', 'p95', 'p99', 'p999'];
const PERCENTILE_FRACTION: Readonly<Record<PercentileKey, number>> = { p50: 0.5, p75: 0.75, p90: 0.9, p95: 0.95, p99: 0.99, p999: 0.999 };

/**
 * The statistical summary of many samples that crosses into the Intelligence Plane.
 *
 * There is no per-host value and no raw sample list — a summary is aggregate by construction.
 */
export interface MetricSummary {
  readonly metric: string;
  readonly category: MetricCategory;
  readonly transactionId: string;
  readonly unit: string;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly stdDev: number;
  readonly percentiles: Readonly<Record<PercentileKey, number>>;
}

/** The p-th percentile of an already-sorted ascending array. Guards empty and bounds. */
export function percentileOf(sortedAsc: readonly number[], fraction: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0] ?? 0;
  const rank = fraction * (sortedAsc.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowVal = sortedAsc[low] ?? 0;
  const highVal = sortedAsc[high] ?? lowVal;
  if (low === high) return lowVal;
  return lowVal + (highVal - lowVal) * (rank - low);
}

/**
 * Summarise a set of raw samples for one metric into an aggregate that may cross the boundary.
 *
 * The single crossing point for measurement. It computes statistics and discards the raw
 * per-host values — a summary carries no field that could hold one.
 */
export function summarise(metric: string, category: MetricCategory, transactionId: string, unit: string, samples: readonly RawSample[]): MetricSummary {
  const values = samples.map((s) => s.value).sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = count === 0 ? 0 : sum / count;
  const variance = count === 0 ? 0 : values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
  const percentiles = Object.fromEntries(
    PERCENTILES.map((k) => [k, round2(percentileOf(values, PERCENTILE_FRACTION[k]))]),
  ) as Record<PercentileKey, number>;
  return {
    metric, category, transactionId, unit, count,
    min: round2(values[0] ?? 0),
    max: round2(values[count - 1] ?? 0),
    mean: round2(mean),
    stdDev: round2(Math.sqrt(variance)),
    percentiles,
  };
}

export function round2(n: number): number { return Math.round(n * 100) / 100; }

/** Evidence kinds the Execution Plane captures and references. */
export type EvidenceKind =
  | 'percentile-distribution' | 'har' | 'heap-dump' | 'thread-dump' | 'flame-graph'
  | 'gc-log' | 'raw-metrics' | 'screenshot' | 'response-timeline' | 'execution-log';

/**
 * A reference to captured evidence. No content field exists, so no artefact can cross.
 */
export interface EvidenceReference {
  readonly kind: EvidenceKind;
  readonly metric: string;
  readonly sha256: string;
  readonly locator: string;
  readonly capturedAtStage: 'execution' | 'evidence';
}

/** The measured result of one transaction under load. Intelligence-Plane safe. */
export interface TransactionResult {
  readonly transactionId: string;
  readonly summaries: readonly MetricSummary[];
  readonly transactionsPerSecond: number;
  readonly errorRate: number;
  readonly sampleCount: number;
  readonly evidenceRefs: readonly string[];
}

// ── Reflection: bottleneck, root cause, regression, capacity, prediction ────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export const SEVERITY_ORDER: Readonly<Record<Severity, number>> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export function severityForScore(score: number): Severity {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  if (score > 0) return 'low';
  return 'info';
}

export type BottleneckKind =
  | 'cpu' | 'memory' | 'gc' | 'disk' | 'network' | 'storage' | 'database' | 'application'
  | 'cache' | 'queue' | 'thread' | 'connection-pool' | 'autoscaling' | 'load-balancer'
  | 'dns' | 'tls' | 'third-party' | 'container' | 'kubernetes' | 'microservice';

export interface Bottleneck {
  readonly id: string;
  readonly kind: BottleneckKind;
  readonly component: string;
  readonly severity: Severity;
  /** 0..100 — how saturated the resource is. */
  readonly saturationPercent: number;
  /** 0..1 confidence in the identification. */
  readonly confidence: number;
  readonly rationale: string;
  readonly evidenceRefs: readonly string[];
  /** How the bottleneck was identified: threshold/statistics vs reasoning-enriched. */
  readonly provenance: Provenance;
}

export type Provenance = 'deterministic' | 'reasoned';

/** One link in a root-cause chain. Symptom at the head, root at the tail. */
export interface RootCauseNode {
  readonly component: string;
  readonly observation: string;
  /** Whether this link was observed in metrics or inferred by correlation/reasoning. */
  readonly provenance: 'observed' | 'inferred';
}

export interface RootCauseChain {
  readonly id: string;
  readonly bottleneckId: string;
  /** Ordered symptom -> ... -> root. */
  readonly chain: readonly RootCauseNode[];
  readonly estimatedFix: string;
  readonly confidence: number;
  readonly businessImpact: string;
}

export type RegressionDirection = 'improved' | 'regressed' | 'stable';

export interface Regression {
  readonly metric: string;
  readonly transactionId: string;
  readonly baseline: number;
  readonly current: number;
  readonly deltaPercent: number;
  readonly direction: RegressionDirection;
  /** True when the change exceeds the significance band. */
  readonly significant: boolean;
}

export type PredictionKind =
  | 'sla-violation' | 'resource-exhaustion' | 'memory-leak' | 'scaling-need'
  | 'cost-increase' | 'regression-trend' | 'capacity-breach';

export interface Prediction {
  readonly kind: PredictionKind;
  readonly subject: string;
  /** 0..1 likelihood. */
  readonly likelihood: number;
  readonly horizon: string;
  readonly rationale: string;
  readonly provenance: Provenance;
}

export interface CapacityForecast {
  readonly metric: string;
  readonly currentValue: number;
  readonly currentConcurrency: number;
  /** The concurrency at which the metric breaches its threshold. */
  readonly breachConcurrency: number | null;
  readonly headroomPercent: number;
  readonly projectedValueAtPeak: number;
  readonly confidence: number;
}

export type RecommendationKind =
  | 'quick' | 'long-term' | 'config' | 'code' | 'infra' | 'scaling'
  | 'network' | 'payload' | 'architecture' | 'cache' | 'index' | 'cost' | 'compression';
export type Effort = 'trivial' | 'small' | 'medium' | 'large';

export type Grade = 'low' | 'medium' | 'high';

export interface Recommendation {
  readonly id: string;
  readonly kind: RecommendationKind;
  readonly subject: string;
  readonly text: string;
  readonly priority: Priority;
  readonly effort: Effort;
  /** Expected performance gain, 0..100 percent. */
  readonly expectedGainPercent: number;
  /** Expected infrastructure cost saving, 0..100 percent. */
  readonly expectedCostSavingPercent: number;
  readonly risk: Grade;
  /** 0..1 confidence in the recommendation. */
  readonly confidence: number;
  readonly implementationComplexity: Grade;
  readonly businessValue: Grade;
  readonly technicalValue: Grade;
  readonly evidenceRefs: readonly string[];
  readonly provenance: Provenance;
}

export type Priority = 'p1' | 'p2' | 'p3' | 'p4';
export const PRIORITY_ORDER: Readonly<Record<Priority, number>> = { p1: 3, p2: 2, p3: 1, p4: 0 };

/**
 * An enterprise-grade performance defect. Intelligence-Plane safe — every artefact is a
 * reference, and observed/expected are statistics, never captured content.
 */
export interface PerformanceDefect {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly priority: Priority;
  readonly transactionId: string;
  readonly observed: string;
  readonly expected: string;
  readonly deviation: string;
  readonly thresholdId: string;
  readonly rootCauseChainId: string | null;
  readonly recommendation: string;
  readonly businessImpact: string;
  readonly evidenceRefs: readonly string[];
}

export type LearningKind =
  | 'baseline' | 'known-bottleneck' | 'known-fix' | 'regression-history'
  | 'capacity-growth' | 'performance-signature' | 'usage-pattern' | 'optimisation-success';

export interface LearningRecord {
  readonly kind: LearningKind;
  readonly key: string;
  readonly text: string;
  readonly fingerprint: string;
}

// ── Performance Intelligence Layer (reflection) ─────────────────────────────

/**
 * The performance pattern vocabulary. A superset of the bottleneck kinds — a pattern is a named,
 * recognisable failure signature with a detection rule, a root cause and a recommendation, and
 * several patterns map onto the same underlying resource (a missing index, a table scan and an
 * N+1 query all surface as database saturation, but they are distinct patterns with distinct fixes).
 */
export type PatternKind =
  | 'memory-leak' | 'memory-pressure' | 'gc-thrashing' | 'thread-starvation' | 'deadlock'
  | 'connection-pool-exhaustion' | 'cache-stampede' | 'lock-contention' | 'database-hotspot'
  | 'missing-index' | 'table-scan' | 'n-plus-one-query' | 'dns-delay' | 'tls-delay'
  | 'storage-saturation' | 'disk-contention' | 'cpu-saturation' | 'queue-backlog' | 'retry-storm'
  | 'circuit-breaker-failure' | 'load-balancer-saturation' | 'container-cold-start'
  | 'autoscaling-delay' | 'network-congestion' | 'microservice-cascade' | 'dependency-timeout'
  | 'service-chatter' | 'excessive-serialization' | 'payload-inflation' | 'session-contention';

/** A declarative pattern in the catalogue. Detection is deterministic; reasoning only refines. */
export interface PerformancePattern {
  readonly id: string;
  readonly name: string;
  readonly kind: PatternKind;
  /** The metric whose saturation signals this pattern, or `null` for a composite/derived pattern. */
  readonly metric: string | null;
  readonly baseSeverity: Severity;
  readonly detection: string;
  readonly rootCause: string;
  readonly recommendation: string;
  readonly recommendationKind: RecommendationKind;
}

/** A composite pattern: several primaries co-occurring imply a higher-order failure. */
export interface CompositePattern {
  readonly id: string;
  readonly name: string;
  readonly kind: PatternKind;
  /** The primary pattern kinds that, co-present, imply this composite. */
  readonly components: readonly PatternKind[];
  readonly rootCause: string;
  readonly recommendation: string;
}

/** A matched pattern in a run — the output of pattern intelligence. */
export interface PatternMatch {
  readonly patternId: string;
  readonly name: string;
  readonly kind: PatternKind;
  readonly confidence: number;
  readonly severity: Severity;
  readonly saturationPercent: number;
  /** Other matched pattern kinds this one correlates with. */
  readonly correlatedWith: readonly PatternKind[];
  /** How many prior runs carried this pattern, from the knowledge graph. */
  readonly recurrence: number;
  readonly composite: boolean;
  readonly rootCause: string;
  readonly recommendation: string;
  readonly recommendationKind: RecommendationKind;
  readonly evidenceRefs: readonly string[];
  /** Suppressed by a known-false-positive / accepted-risk record in the knowledge graph. */
  readonly suppressed: boolean;
  readonly provenance: Provenance;
  readonly fingerprint: string;
}

/** Executive business-severity classification, sev1 (highest) .. sev4. */
export type BusinessSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4';

/** The business translation of a technical finding for one transaction. */
export interface BusinessImpact {
  readonly transactionId: string;
  readonly businessCapability: string;
  readonly journey: string;
  readonly customerExperience: string;
  readonly revenueStream: string;
  readonly operationalKpi: string;
  readonly slaId: string | null;
  readonly executiveSeverity: BusinessSeverity;
  readonly businessCriticality: Criticality;
  /** 0..100 composite business impact. */
  readonly businessImpactScore: number;
  /** 0..100 percent of customers affected. */
  readonly customerImpactPercent: number;
  readonly operationalImpact: Grade;
  /** Currency-neutral revenue-at-risk magnitude for the window. */
  readonly revenueRiskAmount: number;
  readonly estimatedFinancialExposure: number;
  readonly executivePriority: Priority;
  /** 1 = restore first. */
  readonly recoveryPriority: number;
  readonly recommendation: string;
}

/** A record in the customer's historical performance intelligence store (EP‑searched). */
export type KnowledgeRecordKind = 'pattern' | 'root-cause' | 'verified-fix' | 'regression' | 'baseline' | 'known-failure' | 'suppression';

export interface KnowledgeRecord {
  readonly id: string;
  readonly kind: KnowledgeRecordKind;
  readonly fingerprint: string;
  readonly text: string;
  readonly release: string | null;
  readonly resolvedBy: string | null;
  readonly confidence: number;
}

/** A match found in the Performance Knowledge Graph for a current finding. */
export interface KnowledgeMatch {
  readonly recordId: string;
  readonly kind: KnowledgeRecordKind;
  readonly patternKind: PatternKind | null;
  readonly similarity: number;
  readonly release: string | null;
  readonly resolvedBy: string | null;
  readonly confidence: number;
}

// ── Predictive Performance Layer (reflection) — Increment C ──────────────────

export type ResourceKind = 'cpu' | 'memory' | 'network' | 'storage' | 'database' | 'cache' | 'queue' | 'container' | 'kubernetes' | 'cloud';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['cpu', 'memory', 'network', 'storage', 'database', 'cache', 'queue', 'container', 'kubernetes', 'cloud'];

export interface ResourceModel {
  readonly resource: ResourceKind;
  /** 0..100 baseline saturation the twin models. */
  readonly saturationPercent: number;
  readonly capacity: number;
  readonly unit: string;
}

/** The Digital Twin — a virtual performance model. It NEVER executes load; it predicts. */
export interface DigitalTwin {
  readonly targetId: string;
  readonly transactionCount: number;
  readonly nodeCount: number;
  readonly dependencies: readonly string[];
  readonly resources: readonly ResourceModel[];
  /** The synthesised baseline metric summaries the simulation transforms. */
  readonly baselineMetrics: readonly MetricSummary[];
  /** 0..1 confidence in the twin, from how much history informed it. */
  readonly confidence: number;
}

export type ScenarioKind =
  | 'traffic-increase' | 'traffic-decrease' | 'infra-reduction' | 'infra-expansion'
  | 'region-failure' | 'database-failure' | 'cache-failure' | 'queue-saturation'
  | 'container-failure' | 'node-failure' | 'scaling-delay' | 'memory-leak' | 'thread-exhaustion'
  | 'holiday' | 'black-friday' | 'end-of-month' | 'peak-banking' | 'insurance-renewal'
  | 'retail-promotion' | 'release-deploy' | 'what-if';

export interface SimulationScenario {
  readonly id: string;
  readonly kind: ScenarioKind;
  readonly name: string;
  readonly description: string;
  /** The scenario magnitude (e.g. 1.6 for +60% traffic, 0.75 for a 25% capacity cut). */
  readonly magnitude: number;
}

export interface SimulationResult {
  readonly scenarioId: string;
  readonly kind: ScenarioKind;
  readonly name: string;
  readonly predictedPatterns: readonly PatternMatch[];
  readonly predictedSlaCompliancePercent: number | null;
  readonly predictedCapacityHeadroomPercent: number | null;
  readonly predictedCostDeltaPercent: number;
  readonly predictedVerdict: Verdict;
  readonly predictedScore: number;
  readonly confidence: number;
  readonly topBottleneck: string | null;
  readonly recommendation: string;
  readonly rationale: string;
}

export interface ResourceForecast {
  readonly resource: ResourceKind;
  readonly currentSaturation: number;
  readonly projectedSaturation: number;
  readonly headroomPercent: number;
  /** The concurrency at which this resource exhausts, or `null` if it does not within the horizon. */
  readonly exhaustionConcurrency: number | null;
  readonly scalingRecommendation: string;
}

export type SeasonalPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'holiday' | 'campaign';

export interface SeasonalForecast {
  readonly period: SeasonalPeriod;
  readonly multiplier: number;
  readonly predictedPeakConcurrency: number;
  readonly predictedHeadroomPercent: number;
}

export type BaselineTier = 'golden' | 'production' | 'environment' | 'release' | 'service' | 'journey' | 'regional' | 'cloud';
export const BASELINE_TIERS: readonly BaselineTier[] = ['golden', 'production', 'environment', 'release', 'service', 'journey', 'regional', 'cloud'];

export interface Baseline {
  readonly tier: BaselineTier;
  readonly key: string;
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
}

export interface ReleaseImpact {
  readonly release: string;
  readonly performanceRisk: Grade;
  readonly businessRisk: Grade;
  readonly infrastructureRisk: Grade;
  readonly operationalRisk: Grade;
  readonly predictedVerdict: Verdict;
  readonly expectedRegressionPercent: number;
  readonly topBottlenecks: readonly string[];
  readonly topRecommendations: readonly string[];
  readonly confidence: number;
}

export interface PredictiveCertification {
  readonly predictedVerdict: Verdict;
  readonly predictedScore: number;
  readonly confidence: number;
  readonly rationale: string;
}

/** Prediction vs reality — the accuracy loop that lets the platform continuously improve. */
export interface PredictionAccuracy {
  readonly predictedVerdict: Verdict;
  readonly actualVerdict: Verdict | null;
  readonly predictedScore: number;
  readonly actualScore: number | null;
  readonly verdictMatch: boolean | null;
  readonly scoreErrorPercent: number | null;
}

// ── Certification (stage 11) ────────────────────────────────────────────────

export type CertificationDimension =
  | 'performance' | 'scalability' | 'reliability' | 'availability' | 'stability'
  | 'capacity' | 'risk' | 'business-readiness' | 'production-readiness';

export const CERTIFICATION_DIMENSIONS: readonly CertificationDimension[] = [
  'performance', 'scalability', 'reliability', 'availability', 'stability',
  'capacity', 'risk', 'business-readiness', 'production-readiness',
];

export interface DimensionScore {
  readonly dimension: CertificationDimension;
  /** 0..100. A dimension with no measurement reports `measured: false` and is excluded. */
  readonly score: number;
  readonly measured: boolean;
  readonly rationale: string;
}

export type Verdict = 'PASS' | 'CONDITIONAL PASS' | 'FAIL';

export interface PerformanceCertification {
  readonly targetId: string;
  readonly scores: readonly DimensionScore[];
  readonly overallScore: number;
  readonly verdict: Verdict;
  readonly rationale: string;
  readonly blockingBreaches: readonly string[];
}

// ── Reporting (stage 12) ────────────────────────────────────────────────────

export interface SyncRecord {
  readonly target: string;
  readonly published: boolean;
  readonly reason: string;
  readonly externalId: string | null;
}

export interface PerformanceReport {
  readonly targetId: string;
  readonly reasoningMode: 'enabled' | 'disabled';
  readonly testTypesRun: readonly TestType[];
  readonly transactionsSummarised: number;
  readonly slaCompliancePercent: number | null;
  readonly scores: readonly DimensionScore[];
  readonly overallScore: number;
  readonly verdict: Verdict;
  readonly topBottlenecks: readonly { readonly kind: BottleneckKind; readonly component: string; readonly severity: Severity }[];
  readonly regressionCount: number;
  readonly worstRegressionPercent: number | null;
  readonly capacityHeadroomPercent: number | null;
  readonly predictionCount: number;
  readonly defectCount: number;
  // Performance Intelligence Layer summaries (Increment B).
  readonly patternCount: number;
  readonly topPatterns: readonly { readonly kind: PatternKind; readonly severity: Severity; readonly confidence: number }[];
  readonly businessImpactScore: number | null;
  readonly estimatedFinancialExposure: number | null;
  readonly knowledgeMatchCount: number;
  readonly recommendationCount: number;
  readonly estimatedSavingsPercent: number | null;
  readonly executiveActions: readonly string[];
  readonly engineeringActions: readonly string[];
  readonly operationsActions: readonly string[];
  // Predictive Performance Layer summaries (Increment C).
  readonly digitalTwinConfidence: number | null;
  readonly simulationCount: number;
  readonly worstScenario: { readonly kind: ScenarioKind; readonly predictedVerdict: Verdict; readonly confidence: number } | null;
  readonly predictedVerdict: Verdict | null;
  readonly predictionConfidence: number | null;
  readonly predictionAccuracy: PredictionAccuracy | null;
  readonly seasonalForecasts: readonly SeasonalForecast[];
  readonly resourceForecasts: readonly ResourceForecast[];
  readonly releaseImpact: ReleaseImpact | null;
  readonly executiveSummary: string;
  readonly rationale: string;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/** A stable, content-free fingerprint for correlation and suppression. */
export function fingerprint(...parts: readonly string[]): string {
  const joined = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < joined.length; i += 1) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Evaluate a measured value against a threshold. `true` means the threshold HOLDS (no breach). */
export function thresholdHolds(comparator: Comparator, measured: number, target: number): boolean {
  switch (comparator) {
    case 'lte': return measured <= target;
    case 'gte': return measured >= target;
    case 'lt': return measured < target;
    case 'gt': return measured > target;
    case 'eq': return measured === target;
    default: return false;
  }
}

/** Priority from severity — the deterministic default the assessment agents share. */
export function priorityForSeverity(severity: Severity): Priority {
  switch (severity) {
    case 'critical': return 'p1';
    case 'high': return 'p2';
    case 'medium': return 'p3';
    case 'low': return 'p4';
    case 'info': return 'p4';
    default: return 'p4';
  }
}
