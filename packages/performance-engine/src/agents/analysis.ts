/**
 * Agents for stage 10 (reflection): bottleneck, rootcause, capacity, optimisation, defect.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 12-capability-orchestration.md · 24-platform-intelligence-model.md
 *   ADR          : ADR-0026 · ADR-0019 (evidence over assertion)
 *   Criteria     : C-13.1 (AI proposes; code decides) · INV-7 (functions with reasoning unavailable)
 *
 * NEVER REPORT ONLY SYMPTOMS. The rootcause domain builds a complete symptom→root chain from the
 * bottlenecks, each link marked observed or inferred, so a reasoning-inferred link is never
 * indistinguishable from a measured one. Every agent here has a deterministic decision path
 * (statistics, thresholds, correlation, historical baselines) that runs unchanged when reasoning
 * is unavailable — the predecessor's Performance engine aborted in that state, and this one does
 * not (Document 11 §2).
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  fingerprint, priorityForSeverity, severityForScore, thresholdHolds,
  type Bottleneck, type BottleneckKind, type CapacityForecast, type MetricSummary, type PerformanceDefect,
  type Effort, type PerformanceThreshold, type Prediction, type Provenance, type Recommendation, type RecommendationKind,
  type Regression, type RootCauseChain, type RootCauseNode, type Severity, type TransactionResult,
} from '../model.js';

function def<I, O>(
  d: Omit<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'> &
    Partial<Pick<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'>>,
): AgentDefinition<never, unknown> {
  return defineAgent<I, O>(d) as unknown as AgentDefinition<never, unknown>;
}

// ── bottleneck (reflection, IP) ─────────────────────────────────────────────

interface BottleneckSpec { readonly kind: BottleneckKind; readonly metric: string; readonly component: string; readonly saturation: (s: MetricSummary) => number; }

/** How each bottleneck kind reads saturation (0..100) from its metric's summary. */
const BOTTLENECK_SPECS: readonly BottleneckSpec[] = [
  { kind: 'cpu', metric: 'cpu', component: 'compute', saturation: (s) => s.percentiles.p95 },
  { kind: 'memory', metric: 'memory', component: 'heap', saturation: (s) => s.percentiles.p95 },
  { kind: 'gc', metric: 'gc-pause', component: 'garbage-collector', saturation: (s) => Math.min(100, s.percentiles.p99 / 5) },
  { kind: 'disk', metric: 'disk-io', component: 'storage', saturation: (s) => s.percentiles.p95 },
  { kind: 'network', metric: 'network-io', component: 'network', saturation: (s) => s.percentiles.p95 },
  { kind: 'database', metric: 'db-query-time', component: 'database', saturation: (s) => Math.min(100, s.percentiles.p95 / 20) },
  { kind: 'cache', metric: 'cache-hit', component: 'cache', saturation: (s) => 100 - s.mean },
  { kind: 'queue', metric: 'queue-lag', component: 'queue', saturation: (s) => Math.min(100, s.percentiles.p95 / 10) },
  { kind: 'thread', metric: 'thread-pool', component: 'thread-pool', saturation: (s) => s.percentiles.p95 },
  { kind: 'connection-pool', metric: 'connection-pool', component: 'connection-pool', saturation: (s) => s.percentiles.p95 },
  { kind: 'autoscaling', metric: 'scale-latency', component: 'autoscaler', saturation: (s) => Math.min(100, s.percentiles.p95 / 10) },
  { kind: 'load-balancer', metric: 'lb-latency', component: 'load-balancer', saturation: (s) => Math.min(100, s.percentiles.p95 / 5) },
  { kind: 'third-party', metric: 'third-party-latency', component: 'third-party', saturation: (s) => Math.min(100, s.percentiles.p95 / 20) },
  { kind: 'container', metric: 'container-cpu', component: 'container', saturation: (s) => s.percentiles.p95 },
  { kind: 'kubernetes', metric: 'pod-restarts', component: 'kubernetes', saturation: (s) => Math.min(100, s.mean * 20) },
  { kind: 'application', metric: 'response-time', component: 'application', saturation: (s) => Math.min(100, s.percentiles.p95 / 30) },
];

const SATURATION_THRESHOLD = 70;

function detectorAgent(spec: BottleneckSpec): AgentDefinition<never, unknown> {
  return def({
    id: `bottleneck.${spec.kind}`, domain: 'bottleneck', stage: 'reflection', plane: 'IP',
    purpose: `Detect a ${spec.kind} bottleneck by reading the ${spec.metric} metric saturation.`,
    inputs: ['MetricSummary[]'], outputs: ['Bottleneck | null'], responsibilities: [`detect ${spec.kind} saturation`],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A metric with no sample yields no bottleneck rather than a false one; absence is not saturation.',
    handle: (input: { summaries: readonly MetricSummary[]; evidenceRefs: readonly string[] }): Bottleneck | null => {
      const summary = input.summaries.find((s) => s.metric === spec.metric && s.count > 0);
      if (!summary) return null;
      const saturationPercent = Math.max(0, Math.min(100, Math.round(spec.saturation(summary))));
      if (saturationPercent < SATURATION_THRESHOLD) return null;
      return {
        id: `btl-${spec.kind}`, kind: spec.kind, component: spec.component,
        severity: severityForScore(saturationPercent), saturationPercent, confidence: 0.9,
        rationale: `${spec.metric} p95 saturation at ${saturationPercent}% exceeds the ${SATURATION_THRESHOLD}% threshold`,
        evidenceRefs: input.evidenceRefs, provenance: 'deterministic' as Provenance,
      };
    },
  });
}

export const bottleneckAgents: readonly AgentDefinition<never, unknown>[] = [
  ...BOTTLENECK_SPECS.map(detectorAgent),
  def({
    id: 'bottleneck.correlation', domain: 'bottleneck', stage: 'reflection', plane: 'IP',
    purpose: 'Correlate detected bottlenecks across resources to distinguish primary from secondary.',
    inputs: ['Bottleneck[]'], outputs: ['correlated bottlenecks'], responsibilities: ['correlate bottlenecks'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A bottleneck that cannot be correlated is kept as primary rather than dropped.',
    handle: (input: { bottlenecks: readonly Bottleneck[] }) => [...input.bottlenecks].sort((a, b) => b.saturationPercent - a.saturationPercent),
  }),
  def({
    id: 'bottleneck.ai-hypothesis', domain: 'bottleneck', stage: 'reflection', plane: 'IP',
    purpose: 'Enrich the bottleneck ranking with a reasoning hypothesis about the dominant constraint.',
    inputs: ['Bottleneck[]'], outputs: ['ranked bottlenecks'], responsibilities: ['propose the dominant constraint', 'reject a hypothesis naming an undetected bottleneck'],
    toolContracts: [], aiCapabilityClass: 'ranking',
    promptContract: {
      intent: 'Rank the detected bottlenecks by which most constrains throughput, in performance-engineering terms.',
      inputsProvided: ['bottleneck kinds', 'saturation percentages', 'component names'],
      expects: 'an ordered list of bottleneck ids',
      rejectionRules: ['reject any id that is not among the detected bottlenecks', 'reject an empty ranking'],
    },
    aiBehaviour: 'Uses the reasoning proposal to reorder the detected bottlenecks by dominant constraint.',
    nonAiBehaviour: 'Ranks deterministically by saturation percentage; the highest saturation is the dominant constraint.',
    failureHandling: 'A rejected or absent proposal falls back to the deterministic saturation ranking.',
    handle: (input: { bottlenecks: readonly Bottleneck[] }, ctx) => {
      const ids = new Set(input.bottlenecks.map((b) => b.id));
      const proposal = ctx.proposal as { order?: string[] } | null;
      if (proposal?.order && proposal.order.length > 0 && proposal.order.every((id) => ids.has(id))) return proposal.order;
      return [...input.bottlenecks].sort((a, b) => b.saturationPercent - a.saturationPercent).map((b) => b.id);
    },
  }),
];

export function primaryBottlenecks(summaries: readonly MetricSummary[], evidenceRefs: readonly string[]): readonly Bottleneck[] {
  return BOTTLENECK_SPECS.flatMap((spec) => {
    const summary = summaries.find((s) => s.metric === spec.metric && s.count > 0);
    if (!summary) return [];
    const sat = Math.max(0, Math.min(100, Math.round(spec.saturation(summary))));
    if (sat < SATURATION_THRESHOLD) return [];
    return [{ id: `btl-${spec.kind}`, kind: spec.kind, component: spec.component, severity: severityForScore(sat), saturationPercent: sat, confidence: 0.9, rationale: `${spec.metric} p95 saturation at ${sat}%`, evidenceRefs, provenance: 'deterministic' as Provenance }];
  }).sort((a, b) => b.saturationPercent - a.saturationPercent);
}

// ── rootcause (reflection, IP) ──────────────────────────────────────────────

/** The deterministic causal ladder each bottleneck kind implies, symptom -> root. */
const CAUSAL_LADDER: Readonly<Record<BottleneckKind, readonly { component: string; observation: string }[]>> = {
  database: [{ component: 'transaction', observation: 'slow response' }, { component: 'database', observation: 'high query time' }, { component: 'query-plan', observation: 'full table scan' }, { component: 'index', observation: 'missing composite index' }],
  cache: [{ component: 'transaction', observation: 'slow response' }, { component: 'cache', observation: 'low hit ratio' }, { component: 'origin', observation: 'origin load amplified by cache misses' }],
  gc: [{ component: 'transaction', observation: 'periodic latency spikes' }, { component: 'runtime', observation: 'long GC pauses' }, { component: 'heap', observation: 'allocation pressure' }],
  memory: [{ component: 'process', observation: 'rising memory' }, { component: 'heap', observation: 'retained objects grow' }, { component: 'allocation', observation: 'unbounded cache or leak' }],
  cpu: [{ component: 'transaction', observation: 'slow response under load' }, { component: 'compute', observation: 'CPU saturation' }, { component: 'code', observation: 'hot path or insufficient cores' }],
  'connection-pool': [{ component: 'transaction', observation: 'queuing before work' }, { component: 'connection-pool', observation: 'pool exhaustion' }, { component: 'configuration', observation: 'pool sized below concurrency' }],
  thread: [{ component: 'transaction', observation: 'requests queue' }, { component: 'thread-pool', observation: 'thread starvation' }, { component: 'configuration', observation: 'pool sized below concurrency' }],
  queue: [{ component: 'consumer', observation: 'growing lag' }, { component: 'queue', observation: 'depth increasing' }, { component: 'consumer-capacity', observation: 'consumers below producer rate' }],
  network: [{ component: 'transaction', observation: 'high transfer time' }, { component: 'network', observation: 'bandwidth saturation' }],
  disk: [{ component: 'service', observation: 'IO waits' }, { component: 'storage', observation: 'disk saturation' }],
  storage: [{ component: 'service', observation: 'IO waits' }, { component: 'storage', observation: 'storage saturation' }],
  application: [{ component: 'transaction', observation: 'slow response' }, { component: 'application', observation: 'processing latency' }],
  autoscaling: [{ component: 'service', observation: 'latency during scale' }, { component: 'autoscaler', observation: 'slow scale-out' }],
  'load-balancer': [{ component: 'edge', observation: 'added latency' }, { component: 'load-balancer', observation: 'balancer saturation' }],
  dns: [{ component: 'client', observation: 'connection setup latency' }, { component: 'dns', observation: 'slow resolution' }],
  tls: [{ component: 'client', observation: 'handshake latency' }, { component: 'tls', observation: 'expensive negotiation' }],
  'third-party': [{ component: 'transaction', observation: 'external call latency' }, { component: 'third-party', observation: 'dependency latency' }],
  container: [{ component: 'service', observation: 'throttling' }, { component: 'container', observation: 'CPU/memory limit' }],
  kubernetes: [{ component: 'service', observation: 'restarts under load' }, { component: 'kubernetes', observation: 'pod eviction or OOM' }],
  microservice: [{ component: 'journey', observation: 'downstream latency' }, { component: 'microservice', observation: 'saturated dependency' }],
};

const FIX_BY_KIND: Readonly<Record<BottleneckKind, string>> = {
  database: 'add the missing composite index and review the query plan', cache: 'raise cache TTL and pre-warm hot keys',
  gc: 'tune heap sizing and reduce per-request allocation', memory: 'fix the retention leak and bound the cache',
  cpu: 'optimise the hot path or add compute', 'connection-pool': 'size the connection pool to peak concurrency',
  thread: 'size the thread pool to peak concurrency', queue: 'scale consumers to match producer rate',
  network: 'compress payloads and co-locate services', disk: 'move to faster storage or reduce IO',
  storage: 'move to faster storage or reduce IO', application: 'profile and optimise the processing path',
  autoscaling: 'pre-scale ahead of the ramp or lower the scale threshold', 'load-balancer': 'scale the balancer or enable connection reuse',
  dns: 'cache DNS and reduce lookups', tls: 'enable session resumption', 'third-party': 'add a circuit breaker and cache',
  container: 'raise the container resource limit', kubernetes: 'raise pod limits and requests', microservice: 'scale or optimise the dependency',
};

export function buildRootCause(bottleneck: Bottleneck, narrative: string | null): RootCauseChain {
  const ladder = CAUSAL_LADDER[bottleneck.kind];
  const chain: RootCauseNode[] = ladder.map((step, i): RootCauseNode => ({
    component: step.component, observation: step.observation,
    provenance: i === 0 ? 'observed' : (narrative ? 'inferred' : 'inferred'),
  }));
  return {
    id: `rca-${bottleneck.id}`, bottleneckId: bottleneck.id, chain,
    estimatedFix: FIX_BY_KIND[bottleneck.kind], confidence: bottleneck.confidence,
    businessImpact: narrative ?? `${bottleneck.component} constrains transactions dependent on it`,
  };
}

export const rootcauseAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'rootcause.chain-builder', domain: 'rootcause', stage: 'reflection', plane: 'IP',
    purpose: 'Build the complete symptom-to-root cause chain for each detected bottleneck.',
    inputs: ['Bottleneck[]'], outputs: ['RootCauseChain[]'], responsibilities: ['build a full causal chain, never a lone symptom'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A bottleneck with no known causal ladder yields a two-link chain, never a bare symptom.',
    handle: (input: { bottlenecks: readonly Bottleneck[] }) => input.bottlenecks.map((b) => buildRootCause(b, null)),
  }),
  def({
    id: 'rootcause.correlation', domain: 'rootcause', stage: 'reflection', plane: 'IP',
    purpose: 'Correlate chains that share a root to avoid reporting one cause as many.',
    inputs: ['RootCauseChain[]'], outputs: ['correlated chains'], responsibilities: ['deduplicate shared roots'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A chain that cannot be correlated is kept distinct rather than merged incorrectly.',
    handle: (input: { chains: readonly RootCauseChain[] }) => {
      const byRoot = new Map<string, RootCauseChain>();
      for (const c of input.chains) { const root = c.chain[c.chain.length - 1]?.component ?? c.id; if (!byRoot.has(root)) byRoot.set(root, c); }
      return [...byRoot.values()];
    },
  }),
  def({
    id: 'rootcause.narrative', domain: 'rootcause', stage: 'reflection', plane: 'IP',
    purpose: 'Explain each root cause and its business impact in reviewer-readable terms.',
    inputs: ['RootCauseChain[]'], outputs: ['narratives'], responsibilities: ['explain the root cause', 'reject a narrative that contradicts the observed chain'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Explain a root-cause chain and its business impact from the observed chain structure.',
      inputsProvided: ['chain component names', 'chain observations', 'bottleneck kind'],
      expects: 'a short explanation of the root cause and its impact',
      rejectionRules: ['reject a narrative that names a component absent from the chain', 'reject an empty narrative'],
    },
    aiBehaviour: 'Uses the reasoning proposal to write the root-cause explanation and business impact.',
    nonAiBehaviour: 'Emits the deterministic estimated fix and a structural impact statement — no reasoning required.',
    failureHandling: 'A rejected or absent narrative falls back to the deterministic estimated fix and structural impact.',
    handle: (input: { chains: readonly RootCauseChain[] }, ctx) => {
      const proposal = ctx.proposal as { narratives?: Record<string, string> } | null;
      return input.chains.map((c) => {
        const components = new Set(c.chain.map((n) => n.component));
        const narrative = proposal?.narratives?.[c.id];
        const accepted = narrative && narrative.trim() !== '' && [...components].some((comp) => narrative.includes(comp)) ? narrative : c.estimatedFix;
        return { chainId: c.id, narrative: accepted };
      });
    },
  }),
];

// ── capacity (reflection, IP): forecast, regression, prediction ─────────────

export function forecastCapacity(summary: MetricSummary, threshold: PerformanceThreshold | null, currentConcurrency: number): CapacityForecast {
  const current = summary.percentiles.p95;
  const target = threshold ? threshold.value : current * 1.5;
  // Linear projection: latency grows ~1.6x per doubling of concurrency (deterministic heuristic).
  const growthPerDouble = 1.6;
  let concurrency = currentConcurrency;
  let projected = current;
  let breachConcurrency: number | null = null;
  for (let step = 0; step < 6 && projected < target; step += 1) { concurrency *= 2; projected *= growthPerDouble; }
  if (projected >= target) breachConcurrency = concurrency;
  const headroom = target <= 0 ? 0 : Math.max(0, Math.round((1 - current / target) * 100));
  return { metric: summary.metric, currentValue: current, currentConcurrency, breachConcurrency, headroomPercent: headroom, projectedValueAtPeak: Math.round(projected * 100) / 100, confidence: 0.7 };
}

export function detectRegressions(results: readonly TransactionResult[], baselines: ReadonlyMap<string, number>): readonly Regression[] {
  const out: Regression[] = [];
  for (const r of results) {
    const p95 = r.summaries.find((s) => s.metric === 'latency' || s.metric === 'response-time')?.percentiles.p95;
    const baseline = baselines.get(r.transactionId);
    if (p95 === undefined || baseline === undefined || baseline === 0) continue;
    const deltaPercent = Math.round(((p95 - baseline) / baseline) * 1000) / 10;
    const direction: Regression['direction'] = deltaPercent > 5 ? 'regressed' : deltaPercent < -5 ? 'improved' : 'stable';
    out.push({ metric: 'p95', transactionId: r.transactionId, baseline, current: p95, deltaPercent, direction, significant: Math.abs(deltaPercent) > 10 });
  }
  return out;
}

export const capacityAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'capacity.forecast', domain: 'capacity', stage: 'reflection', plane: 'IP',
    purpose: 'Forecast the concurrency at which each key metric breaches its threshold.',
    inputs: ['MetricSummary[]', 'PerformanceThreshold[]'], outputs: ['CapacityForecast[]'], responsibilities: ['project capacity to breach'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A metric with too few samples reports low confidence rather than a fabricated breach point.',
    handle: (input: { summaries: readonly MetricSummary[]; thresholds: readonly PerformanceThreshold[]; concurrency: number }): readonly CapacityForecast[] =>
      input.summaries.filter((s) => (s.metric === 'latency' || s.metric === 'response-time') && s.count > 0)
        .map((s) => forecastCapacity(s, input.thresholds.find((t) => t.metric === 'p95') ?? null, input.concurrency)),
  }),
  def({
    id: 'capacity.headroom', domain: 'capacity', stage: 'reflection', plane: 'IP',
    purpose: 'Compute the remaining capacity headroom before the workload breaches its objectives.',
    inputs: ['CapacityForecast[]'], outputs: ['headroom'], responsibilities: ['compute headroom'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no forecast, headroom is reported as not-measured rather than as full.',
    handle: (input: { forecasts: readonly CapacityForecast[] }) => ({ headroomPercent: input.forecasts.length === 0 ? null : Math.min(...input.forecasts.map((f) => f.headroomPercent)) }),
  }),
  def({
    id: 'capacity.regression', domain: 'capacity', stage: 'reflection', plane: 'IP',
    purpose: 'Detect performance regressions against the customer historical baseline.',
    inputs: ['TransactionResult[]', 'baselines'], outputs: ['Regression[]'], responsibilities: ['detect regressions'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A transaction with no baseline is reported as new rather than as a regression or an improvement.',
    handle: (input: { results: readonly TransactionResult[]; baselines: ReadonlyMap<string, number> }) => detectRegressions(input.results, input.baselines),
  }),
  def({
    id: 'capacity.prediction', domain: 'capacity', stage: 'reflection', plane: 'IP',
    purpose: 'Predict future failures — SLA violation, resource exhaustion, memory leak, scaling need.',
    inputs: ['CapacityForecast[]', 'Bottleneck[]'], outputs: ['Prediction[]'], responsibilities: ['predict future failure modes', 'reject a prediction without a subject'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Predict likely future performance failures from the forecasts and detected bottlenecks.',
      inputsProvided: ['forecast breach points', 'headroom percentages', 'bottleneck kinds'],
      expects: 'a list of predicted failure modes with likelihoods',
      rejectionRules: ['reject a prediction that names no subject', 'reject a likelihood outside 0..1'],
    },
    aiBehaviour: 'Uses the reasoning proposal to add emergent predictions beyond the deterministic set.',
    nonAiBehaviour: 'Derives predictions deterministically from forecasts (breach -> sla-violation), bottlenecks (memory -> memory-leak) and headroom (<20% -> scaling-need).',
    failureHandling: 'A rejected proposal is ignored; the deterministic predictions always stand.',
    handle: (input: { forecasts: readonly CapacityForecast[]; bottlenecks: readonly Bottleneck[] }, ctx): readonly Prediction[] => {
      const out: Prediction[] = [];
      for (const f of input.forecasts) {
        if (f.breachConcurrency !== null) out.push({ kind: 'sla-violation', subject: f.metric, likelihood: 0.8, horizon: `${f.breachConcurrency} concurrent users`, rationale: `p95 breaches its threshold at ${f.breachConcurrency} concurrency`, provenance: 'deterministic' });
        if (f.headroomPercent < 20) out.push({ kind: 'scaling-need', subject: f.metric, likelihood: 0.7, horizon: 'near peak', rationale: `headroom ${f.headroomPercent}% is below 20%`, provenance: 'deterministic' });
      }
      if (input.bottlenecks.some((b) => b.kind === 'memory')) out.push({ kind: 'memory-leak', subject: 'heap', likelihood: 0.6, horizon: 'sustained load', rationale: 'memory saturation under sustained load suggests a leak', provenance: 'deterministic' });
      if (input.bottlenecks.some((b) => b.kind === 'cpu' || b.kind === 'database')) out.push({ kind: 'resource-exhaustion', subject: input.bottlenecks[0]?.component ?? 'resource', likelihood: 0.6, horizon: 'peak load', rationale: 'a saturated primary resource will exhaust under peak', provenance: 'deterministic' });
      const proposal = ctx.proposal as { predictions?: { kind: Prediction['kind']; subject: string; likelihood: number }[] } | null;
      if (proposal?.predictions) for (const p of proposal.predictions) if (p.subject && p.likelihood >= 0 && p.likelihood <= 1) out.push({ kind: p.kind, subject: p.subject, likelihood: p.likelihood, horizon: 'reasoned', rationale: 'reasoning-enriched prediction', provenance: 'reasoned' });
      return out;
    },
  }),
  def({
    id: 'capacity.cost-projection', domain: 'capacity', stage: 'reflection', plane: 'IP',
    purpose: 'Project the infrastructure cost implication of meeting the forecast peak.',
    inputs: ['CapacityForecast[]'], outputs: ['cost projection'], responsibilities: ['project cost growth'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no forecast, cost growth is reported as not-measured rather than zero.',
    handle: (input: { forecasts: readonly CapacityForecast[] }) => ({ nodesToAdd: input.forecasts.filter((f) => f.headroomPercent < 30).length }),
  }),
];

// ── optimisation (reflection, IP): recommendations ──────────────────────────

const REC_KINDS: readonly RecommendationKind[] = ['quick', 'long-term', 'config', 'code', 'infra', 'scaling'];

export function recommendationsFor(bottlenecks: readonly Bottleneck[]): readonly Recommendation[] {
  return bottlenecks.flatMap((b, i): readonly Recommendation[] => {
    const kind: RecommendationKind = b.kind === 'database' ? 'config' : b.kind === 'cpu' ? 'code' : b.kind === 'autoscaling' || b.kind === 'kubernetes' || b.kind === 'container' ? 'infra' : b.kind === 'connection-pool' || b.kind === 'thread' ? 'config' : 'scaling';
    const infra = kind === 'infra' || kind === 'scaling';
    return [buildRecommendation({
      id: `rec-${i + 1}`, kind, subject: b.component, text: FIX_BY_KIND[b.kind], severity: b.severity,
      expectedGainPercent: Math.min(60, Math.round(b.saturationPercent / 2)),
      expectedCostSavingPercent: infra ? Math.min(40, Math.round(b.saturationPercent / 3)) : 0,
      confidence: b.confidence, evidenceRefs: b.evidenceRefs, provenance: 'deterministic',
    })];
  });
}

/** Assemble a recommendation, deriving the value/risk/complexity grades deterministically. */
export function buildRecommendation(d: {
  id: string; kind: RecommendationKind; subject: string; text: string; severity: Severity;
  expectedGainPercent: number; expectedCostSavingPercent: number; confidence: number;
  evidenceRefs: readonly string[]; provenance: Provenance;
}): Recommendation {
  const grade = (n: number): 'low' | 'medium' | 'high' => (n >= 40 ? 'high' : n >= 20 ? 'medium' : 'low');
  const effort: Effort = d.severity === 'critical' ? 'medium' : d.severity === 'high' ? 'small' : 'small';
  const complexity = d.kind === 'code' || d.kind === 'infra' ? 'medium' : 'low';
  return {
    id: d.id, kind: d.kind, subject: d.subject, text: d.text,
    priority: priorityForSeverity(d.severity), effort,
    expectedGainPercent: d.expectedGainPercent, expectedCostSavingPercent: d.expectedCostSavingPercent,
    risk: complexity, confidence: d.confidence, implementationComplexity: complexity,
    businessValue: grade(d.expectedGainPercent), technicalValue: grade(d.expectedGainPercent),
    evidenceRefs: d.evidenceRefs, provenance: d.provenance,
  };
}

export const optimisationAgents: readonly AgentDefinition<never, unknown>[] = [
  ...REC_KINDS.map((kind) => def({
    id: `optimisation.${kind}`, domain: 'optimisation', stage: 'reflection', plane: 'IP',
    purpose: `Generate ${kind} optimisation recommendations from the detected bottlenecks.`,
    inputs: ['Bottleneck[]'], outputs: ['Recommendation[]'], responsibilities: [`generate ${kind} recommendations`],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A bottleneck with no known fix yields no recommendation rather than a generic one.',
    handle: (input: { bottlenecks: readonly Bottleneck[] }) => recommendationsFor(input.bottlenecks).filter((r) => r.kind === kind),
  })),
  def({
    id: 'optimisation.advisor', domain: 'optimisation', stage: 'reflection', plane: 'IP',
    purpose: 'Act as the performance-engineering advisor, prioritising recommendations by expected gain.',
    inputs: ['Recommendation[]'], outputs: ['prioritised recommendations'], responsibilities: ['prioritise by gain', 'reject a recommendation with no subject'],
    toolContracts: [], aiCapabilityClass: 'ranking',
    promptContract: {
      intent: 'Prioritise the optimisation recommendations by expected performance gain and effort.',
      inputsProvided: ['recommendation subjects', 'expected gain percentages', 'effort estimates'],
      expects: 'an ordered list of recommendation ids',
      rejectionRules: ['reject an id not among the recommendations', 'reject an empty ordering'],
    },
    aiBehaviour: 'Uses the reasoning proposal to reorder recommendations by advisor judgement.',
    nonAiBehaviour: 'Orders deterministically by expected gain descending, then effort ascending.',
    failureHandling: 'A rejected or absent proposal falls back to the deterministic gain/effort ordering.',
    handle: (input: { recommendations: readonly Recommendation[] }, ctx) => {
      const ids = new Set(input.recommendations.map((r) => r.id));
      const proposal = ctx.proposal as { order?: string[] } | null;
      if (proposal?.order && proposal.order.length > 0 && proposal.order.every((id) => ids.has(id))) return proposal.order;
      return [...input.recommendations].sort((a, b) => b.expectedGainPercent - a.expectedGainPercent).map((r) => r.id);
    },
  }),
];

// ── defect (reflection, IP): enterprise-grade bug creation ──────────────────

export function defectsFromBreaches(
  results: readonly TransactionResult[],
  thresholds: readonly PerformanceThreshold[],
  rootCauses: readonly RootCauseChain[],
  bottlenecks: readonly Bottleneck[],
): readonly PerformanceDefect[] {
  const out: PerformanceDefect[] = [];
  for (const r of results) {
    for (const threshold of thresholds.filter((t) => t.appliesTo === r.transactionId || t.appliesTo === 'global')) {
      const summary = r.summaries.find((s) => s.metric === 'latency' || s.metric === 'response-time' || s.metric === threshold.metric);
      const measured = threshold.metric === 'p95' ? (summary?.percentiles.p95 ?? null)
        : threshold.metric === 'p99' ? (summary?.percentiles.p99 ?? null)
          : threshold.metric === 'error.rate' ? r.errorRate * 100
            : (summary?.mean ?? null);
      if (measured === null) continue;
      if (thresholdHolds(threshold.comparator, measured, threshold.value)) continue;
      const deviationPct = threshold.value === 0 ? 100 : Math.round(((measured - threshold.value) / threshold.value) * 1000) / 10;
      const severity: Severity = threshold.severity === 'blocking' ? (deviationPct > 100 ? 'critical' : 'high') : 'medium';
      const rca = rootCauses.find((c) => bottlenecks.some((b) => b.id === c.bottleneckId)) ?? null;
      out.push({
        id: `defect-${fingerprint(r.transactionId, threshold.id)}`,
        title: `${r.transactionId} breaches ${threshold.metric} ${threshold.comparator} ${threshold.value}${threshold.unit}`,
        severity, priority: priorityForSeverity(severity), transactionId: r.transactionId,
        observed: `${threshold.metric}=${measured}${threshold.unit}`, expected: `${threshold.metric} ${threshold.comparator} ${threshold.value}${threshold.unit}`,
        deviation: `${deviationPct}% over threshold`, thresholdId: threshold.id,
        rootCauseChainId: rca?.id ?? null, recommendation: rca?.estimatedFix ?? 'investigate the breaching transaction under load',
        businessImpact: rca?.businessImpact ?? `${r.transactionId} misses its performance objective under load`,
        evidenceRefs: r.evidenceRefs,
      });
    }
  }
  return out;
}

export const defectAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'defect.threshold-breach', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'Raise a defect for every blocking threshold breached under load, with observed vs expected.',
    inputs: ['TransactionResult[]', 'PerformanceThreshold[]'], outputs: ['PerformanceDefect[]'], responsibilities: ['raise defects for breaches'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A transaction with no measurement raises no defect rather than a speculative one.',
    handle: (input: { results: readonly TransactionResult[]; thresholds: readonly PerformanceThreshold[]; rootCauses: readonly RootCauseChain[]; bottlenecks: readonly Bottleneck[] }) =>
      defectsFromBreaches(input.results, input.thresholds, input.rootCauses, input.bottlenecks),
  }),
  def({
    id: 'defect.enrichment', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'Attach root cause, recommendation and business impact to each raised defect.',
    inputs: ['PerformanceDefect[]'], outputs: ['enriched defects'], responsibilities: ['enrich defects with root cause'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A defect that cannot be enriched keeps its structural impact statement rather than losing it.',
    handle: (input: { defects: readonly PerformanceDefect[] }) => input.defects.map((d) => ({ id: d.id, enriched: d.rootCauseChainId !== null })),
  }),
  def({
    id: 'defect.severity-priority', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'Confirm each defect carries a severity and a priority consistent with its deviation.',
    inputs: ['PerformanceDefect[]'], outputs: ['severity/priority map'], responsibilities: ['confirm severity and priority'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A defect with no severity defaults to high rather than being published unclassified.',
    handle: (input: { defects: readonly PerformanceDefect[] }) => new Map(input.defects.map((d) => [d.id, { severity: d.severity, priority: d.priority }] as const)),
  }),
];
