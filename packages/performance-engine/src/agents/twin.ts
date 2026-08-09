/**
 * The Digital Twin and deterministic Simulation core (Increment C, Domains 1–2, 5, 7).
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 24-platform-intelligence-model.md
 *   ADR          : ADR-0026
 *
 * THE TWIN NEVER EXECUTES LOAD. It synthesises a baseline `MetricSummary[]` from topology, workload
 * and historical baselines, and a scenario is a DETERMINISTIC TRANSFORM of those summaries. The
 * transformed summaries are fed through the SAME pipeline the real engine already uses — pattern
 * matching, capacity forecasting and certification scoring — so a prediction reuses every analysis
 * the platform already trusts rather than re-implementing it. Reasoning is never consulted here.
 */
import {
  round2, severityForScore, thresholdHolds, CERTIFICATION_DIMENSIONS,
  type Baseline, type BaselineTier, type CapacityForecast, type DigitalTwin, type MetricCategory,
  type MetricSummary, type PercentileKey, type ResourceForecast, type ResourceKind,
  type ResourceModel, type ScenarioKind, type SeasonalForecast, type SeasonalPeriod, type SimulationResult,
  type SimulationScenario, type PerformanceThreshold, type TransactionResult, type Verdict,
} from '../model.js';
import { matchPatterns } from './patterns.js';
import { forecastCapacity } from './analysis.js';
import { scoreDimension, assembleCertification } from './sync-reporting-learning.js';

const PCT: readonly PercentileKey[] = ['p50', 'p75', 'p90', 'p95', 'p99', 'p999'];

/** A latency summary with a realistic percentile ladder around a p95. */
function latencySummary(transactionId: string, p95: number): MetricSummary {
  const ladder: Record<PercentileKey, number> = { p50: round2(p95 * 0.6), p75: round2(p95 * 0.8), p90: round2(p95 * 0.92), p95: round2(p95), p99: round2(p95 * 1.15), p999: round2(p95 * 1.3) };
  return { metric: 'latency', category: 'api', transactionId, unit: 'ms', count: 100, min: round2(p95 * 0.4), max: round2(p95 * 1.4), mean: round2(p95 * 0.7), stdDev: round2(p95 * 0.2), percentiles: ladder };
}

/** A flat summary where every percentile and the mean equal `value` — for resource metrics. */
function flatSummary(metric: string, category: MetricCategory, value: number): MetricSummary {
  const ladder = Object.fromEntries(PCT.map((k) => [k, round2(value)])) as Record<PercentileKey, number>;
  return { metric, category, transactionId: 'global', unit: '%', count: 100, min: round2(value * 0.9), max: round2(value * 1.1), mean: round2(value), stdDev: round2(value * 0.05), percentiles: ladder };
}

/** Map a resource's 0..100 saturation into the detector-space metric the bottleneck/pattern engine reads. */
const RESOURCE_METRIC: Readonly<Record<ResourceKind, { metric: string; category: MetricCategory; value: (sat: number) => number }>> = {
  cpu: { metric: 'cpu', category: 'infrastructure', value: (s) => s },
  memory: { metric: 'memory', category: 'infrastructure', value: (s) => s },
  network: { metric: 'network-io', category: 'network', value: (s) => s },
  storage: { metric: 'disk-io', category: 'infrastructure', value: (s) => s },
  database: { metric: 'db-query-time', category: 'database', value: (s) => s * 20 },
  cache: { metric: 'cache-hit', category: 'infrastructure', value: (s) => 100 - s },
  queue: { metric: 'queue-lag', category: 'queue', value: (s) => s * 10 },
  container: { metric: 'container-cpu', category: 'infrastructure', value: (s) => s },
  kubernetes: { metric: 'pod-restarts', category: 'infrastructure', value: (s) => s / 20 },
  cloud: { metric: 'scale-latency', category: 'cloud', value: (s) => s * 10 },
};

/** A healthy default resource baseline the twin uses when no history is supplied. */
export const DEFAULT_RESOURCE_BASELINE: Readonly<Record<ResourceKind, number>> = {
  cpu: 45, memory: 50, network: 40, storage: 40, database: 20, cache: 10, queue: 10, container: 45, kubernetes: 20, cloud: 20,
};

export interface TwinInput {
  readonly targetId: string;
  readonly transactions: readonly { readonly id: string; readonly slaMs: number }[];
  readonly nodeCount: number;
  readonly dependencies: readonly string[];
  readonly baselines: ReadonlyMap<string, number>;
  readonly resourceBaseline: Readonly<Record<ResourceKind, number>>;
  /** How much history informed the twin, 0..1. */
  readonly historyCoverage: number;
}

export function buildTwin(input: TwinInput): DigitalTwin {
  const resources: ResourceModel[] = (Object.keys(input.resourceBaseline) as ResourceKind[]).map((r) => ({ resource: r, saturationPercent: input.resourceBaseline[r], capacity: 100, unit: '%' }));
  const latency = input.transactions.map((t) => latencySummary(t.id, input.baselines.get(t.id) ?? t.slaMs * 0.7));
  const resourceMetrics = resources.map((r) => { const m = RESOURCE_METRIC[r.resource]; return flatSummary(m.metric, m.category, m.value(r.saturationPercent)); });
  return {
    targetId: input.targetId, transactionCount: input.transactions.length, nodeCount: input.nodeCount,
    dependencies: input.dependencies, resources, baselineMetrics: [...latency, ...resourceMetrics],
    confidence: round2(0.5 + 0.5 * Math.max(0, Math.min(1, input.historyCoverage))),
  };
}

// ── Scenario library — a deterministic transform per scenario kind ──────────

interface Transform { readonly name: string; readonly description: string; readonly latencyMultiplier: number; readonly resourceOverrides: Readonly<Record<string, number>>; readonly costDeltaPercent: number; readonly confidence: number; }

/** Build the transform for a scenario. `magnitude` scales the effect (e.g. 1.6 = +60% traffic). */
export function scenarioTransform(kind: ScenarioKind, magnitude: number): Transform {
  const m = magnitude;
  switch (kind) {
    case 'traffic-increase': return { name: `Traffic +${Math.round((m - 1) * 100)}%`, description: 'sustained traffic increase', latencyMultiplier: 1 + (m - 1) * 1.2, resourceOverrides: { cpu: Math.min(100, 45 * m), 'db-query-time': 400 * m }, costDeltaPercent: Math.round((m - 1) * 40), confidence: 0.85 };
    case 'traffic-decrease': return { name: `Traffic ${Math.round((m - 1) * 100)}%`, description: 'traffic reduction', latencyMultiplier: Math.max(0.5, m), resourceOverrides: { cpu: 45 * m }, costDeltaPercent: Math.round((m - 1) * 40), confidence: 0.85 };
    case 'infra-reduction': return { name: `Infrastructure -${Math.round((1 - m) * 100)}%`, description: 'infrastructure capacity cut', latencyMultiplier: 1 + (1 / m - 1) * 0.8, resourceOverrides: { cpu: Math.min(100, 45 / m), memory: Math.min(100, 50 / m) }, costDeltaPercent: -Math.round((1 - m) * 30), confidence: 0.8 };
    case 'infra-expansion': return { name: `Infrastructure +${Math.round((m - 1) * 100)}%`, description: 'infrastructure expansion', latencyMultiplier: 1 / (1 + (m - 1) * 0.5), resourceOverrides: { cpu: 45 / m }, costDeltaPercent: Math.round((m - 1) * 30), confidence: 0.8 };
    case 'region-failure': return { name: 'Region failure', description: 'a region is lost; load shifts', latencyMultiplier: 1.8, resourceOverrides: { cpu: 85, 'db-query-time': 1600 }, costDeltaPercent: 0, confidence: 0.75 };
    case 'database-failure': return { name: 'Database degradation', description: 'the primary database degrades', latencyMultiplier: 2.0, resourceOverrides: { 'db-query-time': 3000 }, costDeltaPercent: 0, confidence: 0.8 };
    case 'cache-failure': return { name: 'Cache failure', description: 'the cache tier fails; origin load amplifies', latencyMultiplier: 1.6, resourceOverrides: { 'cache-hit': 8, 'db-query-time': 1800 }, costDeltaPercent: 0, confidence: 0.8 };
    case 'queue-saturation': return { name: 'Queue saturation', description: 'consumers fall behind producers', latencyMultiplier: 1.3, resourceOverrides: { 'queue-lag': 1200 }, costDeltaPercent: 0, confidence: 0.8 };
    case 'container-failure': return { name: 'Container failure', description: 'containers are throttled or evicted', latencyMultiplier: 1.6, resourceOverrides: { 'container-cpu': 92 }, costDeltaPercent: 0, confidence: 0.75 };
    case 'node-failure': return { name: 'Node failure', description: 'a node is lost; pods reschedule', latencyMultiplier: 1.6, resourceOverrides: { cpu: 90, 'pod-restarts': 3 }, costDeltaPercent: 0, confidence: 0.75 };
    case 'scaling-delay': return { name: 'Autoscaling delay', description: 'scale-out lags the ramp', latencyMultiplier: 1.4, resourceOverrides: { 'scale-latency': 1000, cpu: 88 }, costDeltaPercent: 0, confidence: 0.75 };
    case 'memory-leak': return { name: 'Memory leak', description: 'memory grows under sustained load', latencyMultiplier: 1.3, resourceOverrides: { memory: 95 }, costDeltaPercent: 0, confidence: 0.8 };
    case 'thread-exhaustion': return { name: 'Thread exhaustion', description: 'thread and connection pools saturate', latencyMultiplier: 1.5, resourceOverrides: { 'thread-pool': 92, 'connection-pool': 90 }, costDeltaPercent: 0, confidence: 0.8 };
    case 'holiday': return { name: 'Holiday traffic', description: 'holiday peak', latencyMultiplier: 1 + (1.8 - 1) * 1.2, resourceOverrides: { cpu: 80, 'db-query-time': 720 }, costDeltaPercent: 30, confidence: 0.8 };
    case 'black-friday': return { name: 'Black Friday', description: 'peak retail event, ~3x traffic', latencyMultiplier: 1 + (3 - 1) * 1.2, resourceOverrides: { cpu: 98, 'db-query-time': 1400, 'cache-hit': 30 }, costDeltaPercent: 120, confidence: 0.8 };
    case 'end-of-month': return { name: 'End of month', description: 'month-end batch + interactive peak', latencyMultiplier: 1 + (1.5 - 1) * 1.2, resourceOverrides: { cpu: 78, 'queue-lag': 800 }, costDeltaPercent: 20, confidence: 0.8 };
    case 'peak-banking': return { name: 'Peak banking day', description: 'salary/settlement peak', latencyMultiplier: 1 + (2 - 1) * 1.2, resourceOverrides: { cpu: 90, 'db-query-time': 1200 }, costDeltaPercent: 60, confidence: 0.8 };
    case 'insurance-renewal': return { name: 'Insurance renewal', description: 'annual renewal surge', latencyMultiplier: 1 + (1.7 - 1) * 1.2, resourceOverrides: { cpu: 82, 'db-query-time': 900 }, costDeltaPercent: 40, confidence: 0.8 };
    case 'retail-promotion': return { name: 'Retail promotion', description: 'campaign-driven surge', latencyMultiplier: 1 + (2.2 - 1) * 1.2, resourceOverrides: { cpu: 92, 'cache-hit': 40 }, costDeltaPercent: 70, confidence: 0.8 };
    case 'release-deploy': return { name: 'Release deployment', description: 'a new release with a modest regression', latencyMultiplier: 1 + Math.max(0, m - 1), resourceOverrides: { cpu: Math.min(100, 45 * (1 + Math.max(0, m - 1) * 0.5)) }, costDeltaPercent: 0, confidence: 0.7 };
    case 'what-if': return { name: 'What-if', description: 'a configured what-if adjustment', latencyMultiplier: Math.max(0.3, m), resourceOverrides: {}, costDeltaPercent: Math.round((m - 1) * 30), confidence: 0.7 };
    default: return { name: 'Unknown scenario', description: 'no transform', latencyMultiplier: 1, resourceOverrides: {}, costDeltaPercent: 0, confidence: 0.5 };
  }
}

/** Apply a scenario to the twin's baseline, producing the predicted metric summaries. */
export function applyScenario(twin: DigitalTwin, scenario: SimulationScenario): readonly MetricSummary[] {
  const t = scenarioTransform(scenario.kind, scenario.magnitude);
  const byMetric = new Map<string, MetricSummary>();
  for (const s of twin.baselineMetrics) {
    if (s.metric === 'latency') {
      const scale = t.latencyMultiplier;
      const pct = Object.fromEntries(PCT.map((k) => [k, round2(s.percentiles[k] * scale)])) as Record<PercentileKey, number>;
      byMetric.set(`latency:${s.transactionId}`, { ...s, mean: round2(s.mean * scale), max: round2(s.max * scale), percentiles: pct });
    } else {
      const override = t.resourceOverrides[s.metric];
      byMetric.set(s.metric, override === undefined ? s : flatSummary(s.metric, s.category, override));
    }
  }
  // Overrides for metrics not present in the baseline (e.g. thread-pool) are added.
  for (const [metric, value] of Object.entries(t.resourceOverrides)) {
    if (![...byMetric.values()].some((s) => s.metric === metric)) byMetric.set(metric, flatSummary(metric, 'infrastructure', value));
  }
  return [...byMetric.values()];
}

/** Simulate one scenario end to end, reusing the real pattern/capacity/certification pipeline. */
export function simulateScenario(
  twin: DigitalTwin,
  scenario: SimulationScenario,
  thresholds: readonly PerformanceThreshold[],
  transactions: readonly { readonly id: string; readonly slaMs: number }[],
): SimulationResult {
  const predicted = applyScenario(twin, scenario);
  const patterns = matchPatterns(predicted, [], () => 0, () => false);
  const results: TransactionResult[] = transactions.map((t): TransactionResult => {
    const summary = predicted.find((s) => s.metric === 'latency' && s.transactionId === t.id);
    return { transactionId: t.id, summaries: summary ? [summary] : [], transactionsPerSecond: 0, errorRate: 0, sampleCount: 100, evidenceRefs: [] };
  });
  const forecasts: CapacityForecast[] = results.flatMap((r) => (r.summaries[0] ? [forecastCapacity(r.summaries[0], thresholds.find((th) => th.metric === 'p95') ?? null, 100)] : []));
  const certInputs = { targetId: twin.targetId, results, thresholds, bottlenecks: [], forecasts, regressions: [] } as const;
  const scores = CERTIFICATION_DIMENSIONS.map((d) => scoreDimension(d, certInputs));
  const blockingBreaches = breachTitles(results, thresholds);
  const cert = assembleCertification(twin.targetId, scores, blockingBreaches);
  const headroom = forecasts.length === 0 ? null : Math.min(...forecasts.map((f) => f.headroomPercent));
  const perf = scores.find((s) => s.dimension === 'performance');
  const top = patterns[0] ?? null;
  return {
    scenarioId: scenario.id, kind: scenario.kind, name: scenario.name, predictedPatterns: patterns,
    predictedSlaCompliancePercent: perf && perf.measured ? perf.score : null,
    predictedCapacityHeadroomPercent: headroom, predictedCostDeltaPercent: t_costDelta(scenario),
    predictedVerdict: cert.verdict, predictedScore: cert.overallScore,
    confidence: round2(twin.confidence * scenarioTransform(scenario.kind, scenario.magnitude).confidence),
    topBottleneck: top ? top.name : null, recommendation: top ? top.recommendation : 'no remediation required at the predicted load',
    rationale: `${scenario.name}: predicted ${cert.verdict} at ${cert.overallScore}/100 (${patterns.length} pattern(s))`,
  };
}

function t_costDelta(scenario: SimulationScenario): number { return scenarioTransform(scenario.kind, scenario.magnitude).costDeltaPercent; }

function breachTitles(results: readonly TransactionResult[], thresholds: readonly PerformanceThreshold[]): readonly string[] {
  const out: string[] = [];
  for (const r of results) for (const th of thresholds.filter((x) => x.severity === 'blocking' && (x.appliesTo === r.transactionId || x.appliesTo === 'global'))) {
    const s = r.summaries[0];
    if (!s) continue;
    const measured = th.metric === 'p99' ? s.percentiles.p99 : s.percentiles.p95;
    if (!thresholdHolds(th.comparator, measured, th.value)) out.push(`${r.transactionId} predicted to breach ${th.metric} ${th.comparator} ${th.value}${th.unit}`);
  }
  return out;
}

// ── Capacity, seasonal and baseline-tier helpers ────────────────────────────

export function resourceForecast(twin: DigitalTwin, concurrency: number): readonly ResourceForecast[] {
  return twin.resources.map((r): ResourceForecast => {
    const projected = Math.min(100, round2(r.saturationPercent * 1.6));
    const headroom = Math.max(0, Math.round(100 - projected));
    let exhaustion: number | null = null;
    let c = concurrency; let s = r.saturationPercent;
    for (let step = 0; step < 6 && s < 100; step += 1) { c *= 2; s *= 1.4; }
    if (s >= 100) exhaustion = c;
    return { resource: r.resource, currentSaturation: r.saturationPercent, projectedSaturation: projected, headroomPercent: headroom, exhaustionConcurrency: exhaustion, scalingRecommendation: headroom < 20 ? `scale ${r.resource} ahead of peak` : `${r.resource} has headroom` };
  });
}

const SEASONAL_MULTIPLIER: Readonly<Record<SeasonalPeriod, number>> = { daily: 1.2, weekly: 1.4, monthly: 1.6, quarterly: 1.8, yearly: 2.0, holiday: 2.2, campaign: 2.5 };

export function seasonalForecast(peakConcurrency: number, periods: readonly SeasonalPeriod[]): readonly SeasonalForecast[] {
  return periods.map((period): SeasonalForecast => {
    const mult = SEASONAL_MULTIPLIER[period];
    const predictedPeak = Math.round(peakConcurrency * mult);
    return { period, multiplier: mult, predictedPeakConcurrency: predictedPeak, predictedHeadroomPercent: Math.max(0, Math.round(100 - mult * 40)) };
  });
}

export function baselineTiers(twin: DigitalTwin, baselines: ReadonlyMap<string, number>): readonly Baseline[] {
  const tiers: BaselineTier[] = ['golden', 'production', 'release'];
  const out: Baseline[] = [];
  for (const [txn, p95] of baselines) for (const tier of tiers) out.push({ tier, key: txn, metric: 'p95', value: p95, unit: 'ms' });
  for (const r of twin.resources) out.push({ tier: 'environment', key: r.resource, metric: 'saturation', value: r.saturationPercent, unit: '%' });
  return out;
}

/** The predicted verdict across all simulated scenarios — the worst governs (fail-safe). */
export function worstOf(simulations: readonly SimulationResult[]): { verdict: Verdict; score: number; confidence: number; scenario: SimulationResult | null } {
  if (simulations.length === 0) return { verdict: 'PASS', score: 100, confidence: 0, scenario: null };
  const rank: Record<Verdict, number> = { FAIL: 2, 'CONDITIONAL PASS': 1, PASS: 0 };
  const worst = [...simulations].sort((a, b) => rank[b.predictedVerdict] - rank[a.predictedVerdict] || a.predictedScore - b.predictedScore)[0];
  return worst ? { verdict: worst.predictedVerdict, score: worst.predictedScore, confidence: worst.confidence, scenario: worst } : { verdict: 'PASS', score: 100, confidence: 0, scenario: null };
}

/** Severity label helper reused for release risk grading. */
export function riskGrade(score: number): 'low' | 'medium' | 'high' {
  const sev = severityForScore(100 - score);
  return sev === 'critical' || sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : 'low';
}
