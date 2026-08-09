/**
 * The Performance Pattern catalogue and matcher (Increment B, Domain 1).
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 24-platform-intelligence-model.md
 *   ADR          : ADR-0026
 *
 * NOT A STATIC LIBRARY. The catalogue is data; the intelligence is `matchPatterns`, which reads
 * the SAME metric summaries the bottleneck detectors read and recognises named failure signatures —
 * including composites, where several primaries co-occurring imply a higher-order failure. Detection
 * is fully deterministic (thresholds + saturation); reasoning only sharpens confidence and
 * explanation. This is the reuse-first principle made concrete: patterns extend bottleneck detection
 * rather than re-implementing it.
 */
import {
  round2, severityForScore, fingerprint,
  type CompositePattern, type MetricSummary, type PatternKind, type PatternMatch, type PerformancePattern,
  type Provenance, type RecommendationKind,
} from '../model.js';

/** How a pattern reads saturation (0..100) from its metric summary — mirrors the bottleneck specs. */
type Saturation = (s: MetricSummary) => number;
const p95 = (s: MetricSummary): number => s.percentiles.p95;
const scaled = (divisor: number): Saturation => (s) => Math.min(100, s.percentiles.p95 / divisor);
const inverse = (s: MetricSummary): number => 100 - s.mean; // for hit-ratio style metrics

interface PatternSpec extends PerformancePattern { readonly saturation: Saturation; readonly threshold: number; }

/** The declarative catalogue — thirty named patterns. Adding a pattern is adding a row. */
const CATALOGUE: readonly PatternSpec[] = [
  { id: 'pat-cpu-saturation', name: 'CPU saturation', kind: 'cpu-saturation', metric: 'cpu', baseSeverity: 'high', detection: 'cpu p95 >= 70%', rootCause: 'insufficient compute or a hot code path', recommendation: 'optimise the hot path or add compute', recommendationKind: 'code', saturation: p95, threshold: 70 },
  { id: 'pat-memory-pressure', name: 'Memory pressure', kind: 'memory-pressure', metric: 'memory', baseSeverity: 'high', detection: 'memory p95 >= 75%', rootCause: 'working set exceeds allocation', recommendation: 'raise the heap or reduce retention', recommendationKind: 'config', saturation: p95, threshold: 75 },
  { id: 'pat-memory-leak', name: 'Memory leak', kind: 'memory-leak', metric: 'memory', baseSeverity: 'critical', detection: 'memory p95 >= 90% under sustained load', rootCause: 'unbounded retention or a leak', recommendation: 'fix the retention leak and bound caches', recommendationKind: 'code', saturation: p95, threshold: 90 },
  { id: 'pat-gc-thrashing', name: 'GC thrashing', kind: 'gc-thrashing', metric: 'gc-pause', baseSeverity: 'high', detection: 'gc pause p99 high', rootCause: 'excessive allocation churn', recommendation: 'tune heap sizing and reduce per-request allocation', recommendationKind: 'config', saturation: scaled(5), threshold: 70 },
  { id: 'pat-thread-starvation', name: 'Thread starvation', kind: 'thread-starvation', metric: 'thread-pool', baseSeverity: 'high', detection: 'thread pool p95 saturated', rootCause: 'thread pool sized below concurrency', recommendation: 'size the thread pool to peak concurrency', recommendationKind: 'config', saturation: p95, threshold: 70 },
  { id: 'pat-connection-pool', name: 'Connection pool exhaustion', kind: 'connection-pool-exhaustion', metric: 'connection-pool', baseSeverity: 'high', detection: 'connection pool p95 saturated', rootCause: 'pool sized below concurrency', recommendation: 'size the connection pool to peak concurrency', recommendationKind: 'config', saturation: p95, threshold: 70 },
  { id: 'pat-lock-contention', name: 'Lock contention', kind: 'lock-contention', metric: 'lock-wait', baseSeverity: 'high', detection: 'lock wait p95 high', rootCause: 'coarse-grained locking on a hot resource', recommendation: 'reduce lock scope or shard the resource', recommendationKind: 'code', saturation: scaled(10), threshold: 70 },
  { id: 'pat-deadlock', name: 'Deadlock', kind: 'deadlock', metric: 'deadlocks', baseSeverity: 'critical', detection: 'deadlock count > 0', rootCause: 'inconsistent lock ordering', recommendation: 'enforce a consistent lock acquisition order', recommendationKind: 'code', saturation: (s) => Math.min(100, s.mean * 100), threshold: 1 },
  { id: 'pat-database-hotspot', name: 'Database hotspot', kind: 'database-hotspot', metric: 'db-query-time', baseSeverity: 'high', detection: 'db query time p95 high', rootCause: 'a single table or partition is a hot path', recommendation: 'partition or cache the hot table', recommendationKind: 'config', saturation: scaled(20), threshold: 70 },
  { id: 'pat-missing-index', name: 'Missing index', kind: 'missing-index', metric: 'db-rows-scanned', baseSeverity: 'high', detection: 'rows scanned >> rows returned', rootCause: 'a query has no supporting index', recommendation: 'add the missing composite index', recommendationKind: 'config', saturation: scaled(1000), threshold: 70 },
  { id: 'pat-table-scan', name: 'Full table scan', kind: 'table-scan', metric: 'db-scan-ratio', baseSeverity: 'medium', detection: 'scan ratio high', rootCause: 'a query plan chooses a full scan', recommendation: 'add an index or rewrite the predicate', recommendationKind: 'config', saturation: p95, threshold: 70 },
  { id: 'pat-n-plus-one', name: 'N+1 query', kind: 'n-plus-one-query', metric: 'db-calls-per-request', baseSeverity: 'medium', detection: 'db calls per request high', rootCause: 'per-row queries instead of a join', recommendation: 'batch the queries or add a join/eager load', recommendationKind: 'code', saturation: scaled(5), threshold: 70 },
  { id: 'pat-dns-delay', name: 'DNS delay', kind: 'dns-delay', metric: 'dns-time', baseSeverity: 'low', detection: 'dns resolution p95 high', rootCause: 'slow or uncached DNS resolution', recommendation: 'cache DNS and reduce lookups', recommendationKind: 'config', saturation: scaled(10), threshold: 70 },
  { id: 'pat-tls-delay', name: 'TLS handshake delay', kind: 'tls-delay', metric: 'tls-time', baseSeverity: 'low', detection: 'tls handshake p95 high', rootCause: 'no session resumption', recommendation: 'enable TLS session resumption', recommendationKind: 'config', saturation: scaled(10), threshold: 70 },
  { id: 'pat-storage-saturation', name: 'Storage saturation', kind: 'storage-saturation', metric: 'disk-io', baseSeverity: 'high', detection: 'disk io p95 saturated', rootCause: 'storage throughput limit reached', recommendation: 'move to faster storage or reduce IO', recommendationKind: 'infra', saturation: p95, threshold: 70 },
  { id: 'pat-disk-contention', name: 'Disk contention', kind: 'disk-contention', metric: 'disk-queue', baseSeverity: 'medium', detection: 'disk queue depth high', rootCause: 'competing IO workloads', recommendation: 'isolate the noisy workload', recommendationKind: 'infra', saturation: scaled(2), threshold: 70 },
  { id: 'pat-cache-stampede', name: 'Cache stampede', kind: 'cache-stampede', metric: 'cache-hit', baseSeverity: 'high', detection: 'cache hit ratio collapses under load', rootCause: 'simultaneous cache misses hit the origin', recommendation: 'add request coalescing and stagger TTLs', recommendationKind: 'config', saturation: inverse, threshold: 40 },
  { id: 'pat-queue-backlog', name: 'Queue backlog', kind: 'queue-backlog', metric: 'queue-lag', baseSeverity: 'high', detection: 'consumer lag grows', rootCause: 'consumers below producer rate', recommendation: 'scale consumers to match producer rate', recommendationKind: 'scaling', saturation: scaled(10), threshold: 70 },
  { id: 'pat-retry-storm', name: 'Retry storm', kind: 'retry-storm', metric: 'retry-rate', baseSeverity: 'high', detection: 'retry rate spikes', rootCause: 'aggressive retries amplify a downstream failure', recommendation: 'add exponential backoff and jitter', recommendationKind: 'config', saturation: p95, threshold: 60 },
  { id: 'pat-circuit-breaker', name: 'Circuit breaker failure', kind: 'circuit-breaker-failure', metric: 'breaker-open', baseSeverity: 'high', detection: 'breaker open ratio high', rootCause: 'a downstream dependency is failing', recommendation: 'stabilise the dependency and tune breaker thresholds', recommendationKind: 'config', saturation: (s) => Math.min(100, s.mean * 100), threshold: 30 },
  { id: 'pat-lb-saturation', name: 'Load balancer saturation', kind: 'load-balancer-saturation', metric: 'lb-latency', baseSeverity: 'medium', detection: 'lb added latency high', rootCause: 'balancer at capacity', recommendation: 'scale the balancer or enable connection reuse', recommendationKind: 'infra', saturation: scaled(5), threshold: 70 },
  { id: 'pat-cold-start', name: 'Container cold start', kind: 'container-cold-start', metric: 'cold-start-time', baseSeverity: 'medium', detection: 'cold start latency high', rootCause: 'no warm pool during scale-out', recommendation: 'keep a warm pool or reduce image size', recommendationKind: 'infra', saturation: scaled(20), threshold: 70 },
  { id: 'pat-autoscaling-delay', name: 'Autoscaling delay', kind: 'autoscaling-delay', metric: 'scale-latency', baseSeverity: 'medium', detection: 'scale-out latency high', rootCause: 'slow scale-out relative to the ramp', recommendation: 'pre-scale ahead of the ramp or lower the threshold', recommendationKind: 'scaling', saturation: scaled(10), threshold: 70 },
  { id: 'pat-network-congestion', name: 'Network congestion', kind: 'network-congestion', metric: 'network-io', baseSeverity: 'medium', detection: 'network io p95 saturated', rootCause: 'bandwidth limit reached', recommendation: 'compress payloads and co-locate services', recommendationKind: 'network', saturation: p95, threshold: 70 },
  { id: 'pat-microservice-cascade', name: 'Microservice cascade', kind: 'microservice-cascade', metric: 'downstream-latency', baseSeverity: 'critical', detection: 'downstream latency propagates upstream', rootCause: 'a saturated dependency cascades', recommendation: 'add bulkheads and timeouts between services', recommendationKind: 'architecture', saturation: scaled(20), threshold: 70 },
  { id: 'pat-dependency-timeout', name: 'Dependency timeout', kind: 'dependency-timeout', metric: 'third-party-latency', baseSeverity: 'high', detection: 'third-party latency at timeout', rootCause: 'an external dependency is slow', recommendation: 'add a circuit breaker and cache', recommendationKind: 'config', saturation: scaled(20), threshold: 70 },
  { id: 'pat-service-chatter', name: 'Service chatter', kind: 'service-chatter', metric: 'calls-per-transaction', baseSeverity: 'medium', detection: 'inter-service calls per transaction high', rootCause: 'chatty service boundaries', recommendation: 'coarsen the API or batch calls', recommendationKind: 'architecture', saturation: scaled(10), threshold: 70 },
  { id: 'pat-excessive-serialization', name: 'Excessive serialization', kind: 'excessive-serialization', metric: 'serialization-time', baseSeverity: 'low', detection: 'serialization time high', rootCause: 'heavy or repeated serialization', recommendation: 'use a lighter format or cache serialized forms', recommendationKind: 'code', saturation: scaled(10), threshold: 70 },
  { id: 'pat-payload-inflation', name: 'Payload inflation', kind: 'payload-inflation', metric: 'payload-size', baseSeverity: 'medium', detection: 'response payload size high', rootCause: 'over-fetching or unbounded payloads', recommendation: 'paginate, compress and trim fields', recommendationKind: 'payload', saturation: scaled(1000), threshold: 70 },
  { id: 'pat-session-contention', name: 'Session contention', kind: 'session-contention', metric: 'session-lock-wait', baseSeverity: 'medium', detection: 'session store lock wait high', rootCause: 'a shared session store is a hot path', recommendation: 'shard sessions or move to a token model', recommendationKind: 'architecture', saturation: scaled(10), threshold: 70 },
];

/** Composite patterns — primaries co-occurring imply a higher-order failure. */
export const COMPOSITE_PATTERNS: readonly CompositePattern[] = [
  { id: 'comp-thread-starvation', name: 'Application thread starvation', kind: 'thread-starvation', components: ['cpu-saturation', 'gc-thrashing', 'connection-pool-exhaustion'], rootCause: 'CPU saturation and GC thrashing exhaust the connection pool, starving application threads', recommendation: 'address the CPU/GC pressure first, then resize pools' },
  { id: 'comp-cascade', name: 'Cascading dependency failure', kind: 'microservice-cascade', components: ['dependency-timeout', 'retry-storm'], rootCause: 'a dependency timeout drives a retry storm that cascades upstream', recommendation: 'add circuit breakers, backoff and bulkheads' },
];

export const PATTERN_CATALOGUE: readonly PerformancePattern[] = CATALOGUE.map(({ saturation: _s, threshold: _t, ...p }) => p);

/**
 * Match patterns against the metric summaries — the deterministic core of pattern intelligence.
 *
 * `recurrenceFor` folds knowledge-graph history in (0 when none). `suppressed` marks a pattern a
 * suppression record has waived. Reasoning is never consulted here; it refines the result later.
 */
export function matchPatterns(
  summaries: readonly MetricSummary[],
  evidenceRefs: readonly string[],
  recurrenceFor: (kind: PatternKind) => number,
  isSuppressed: (fingerprint: string) => boolean,
): readonly PatternMatch[] {
  const primaries: PatternMatch[] = [];
  for (const spec of CATALOGUE) {
    const summary = spec.metric ? summaries.find((s) => s.metric === spec.metric && s.count > 0) : undefined;
    if (!summary) continue;
    const sat = Math.max(0, Math.min(100, Math.round(spec.saturation(summary))));
    if (sat < spec.threshold) continue;
    const fp = fingerprint(spec.kind, spec.metric ?? '');
    primaries.push({
      patternId: spec.id, name: spec.name, kind: spec.kind,
      confidence: round2(Math.min(0.99, 0.6 + sat / 250)), severity: severityForScore(sat), saturationPercent: sat,
      correlatedWith: [], recurrence: recurrenceFor(spec.kind), composite: false,
      rootCause: spec.rootCause, recommendation: spec.recommendation, recommendationKind: spec.recommendationKind,
      evidenceRefs, suppressed: isSuppressed(fp), provenance: 'deterministic', fingerprint: fp,
    });
  }
  const presentKinds = new Set(primaries.map((p) => p.kind));
  // Correlate: every primary lists the other primaries present.
  const correlated = primaries.map((p) => ({ ...p, correlatedWith: [...presentKinds].filter((k) => k !== p.kind) }));
  // Composites: emit when all components are present.
  const composites: PatternMatch[] = COMPOSITE_PATTERNS.filter((c) => c.components.every((k) => presentKinds.has(k))).map((c) => {
    const fp = fingerprint('composite', c.id);
    return {
      patternId: c.id, name: c.name, kind: c.kind, confidence: 0.85, severity: 'critical' as const, saturationPercent: 100,
      correlatedWith: c.components, recurrence: recurrenceFor(c.kind), composite: true,
      rootCause: c.rootCause, recommendation: c.recommendation, recommendationKind: 'architecture' as RecommendationKind,
      evidenceRefs, suppressed: isSuppressed(fp), provenance: 'deterministic' as Provenance, fingerprint: fp,
    };
  });
  return [...composites, ...correlated].sort((a, b) => b.saturationPercent - a.saturationPercent);
}
