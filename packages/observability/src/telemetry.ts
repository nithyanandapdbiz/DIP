/**
 * Telemetry — structured logging, correlation, tracing and metrics.
 *
 * TRACEABILITY
 *   Architecture : 23-operational-excellence-model.md §5.7 · 24-platform-intelligence-model.md
 *   ADR          : ADR-0018 (Platform Service, not a capability) · ADR-0020
 *   Criteria     : C-23.11 (operational telemetry contains no C1/C2 data)
 *                  C-24.1  (no metric interpolated, estimated or inferred)
 *                  C-24.10 (no cross-tenant aggregation)
 *                  C-24.11 (no customer content is ingested)
 *
 * THE CONTENT RULE IS ENFORCED, NOT REQUESTED.
 * C-23.11 forbids customer data in operational telemetry, and R-09.12 names the
 * mechanism by which it usually arrives: something serialises a whole object. A
 * logging API that accepts arbitrary values will eventually be handed one, under time
 * pressure, by someone debugging. So this one does not accept them — attributes are
 * scalars, and a value that looks like customer content is rejected at the call site
 * rather than filtered downstream.
 *
 * WHY REJECT RATHER THAN REDACT.
 * Redaction is a guess about which fields matter, and it fails silently when the guess
 * is wrong. Refusing the emission surfaces the mistake while someone is still looking
 * at it.
 *
 * NO CROSS-TENANT AGGREGATION (C-24.10). Every counter is keyed by tenant, and the
 * only way to read a total across tenants is to ask for one explicitly — which the
 * intelligence layer never does, and a test proves.
 */

export type Scalar = string | number | boolean | null;

export class TelemetryContentError extends Error {
  constructor(public readonly field: string, public readonly reason: string) {
    super(`telemetry field "${field}" rejected: ${reason}`);
    this.name = 'TelemetryContentError';
  }
}

/**
 * Shapes that must never appear in operational telemetry.
 *
 * Detected by SHAPE, not by a list of known values. Searching for one real credential
 * would prove only that one credential is absent.
 */
const FORBIDDEN_VALUE_SHAPES: readonly (readonly [string, RegExp])[] = [
  ['a PEM private key', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
  ['a JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['an AWS-style access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['an email address', /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i],
  ['a bearer credential', /\b(?:bearer|authorization)\s*[:=]\s*\S+/i],
];

/** Field names that carry payloads rather than identifiers. */
const FORBIDDEN_FIELDS = /^(?:body|payload|request|response|content|data|params|args|screenshot|source)$/i;

/** The longest a telemetry value may be. Beyond this it is content, not an identifier. */
const MAX_VALUE_LENGTH = 512;

function assertEmittable(field: string, value: Scalar): void {
  if (FORBIDDEN_FIELDS.test(field)) {
    throw new TelemetryContentError(field,
      'this field name carries a payload. Telemetry records identifiers and outcomes, never content (C-23.11)');
  }
  // A non-scalar value (object/array/function) bypasses every content check below and
  // can carry C1/C2 customer content into a span. The `Scalar` type forbids this at
  // compile time, but a `.js` consumer or a loosely-typed boundary can still pass one —
  // reject it at runtime rather than record it (reject-not-redact, C-23.11).
  if (value !== null && value !== undefined && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new TelemetryContentError(field,
      'a non-scalar telemetry value may carry customer content; telemetry records only scalar identifiers (C-23.11)');
  }
  if (typeof value !== 'string') return;
  if (value.length > MAX_VALUE_LENGTH) {
    throw new TelemetryContentError(field,
      `${value.length} characters exceeds ${MAX_VALUE_LENGTH}; a value this long is content, not an identifier`);
  }
  for (const [kind, re] of FORBIDDEN_VALUE_SHAPES) {
    if (re.test(value)) throw new TelemetryContentError(field, `the value looks like ${kind}`);
  }
}

export interface LogRecord {
  readonly at: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly event: string;
  /** Ties every record of one logical operation together, across processes. */
  readonly correlationId: string;
  readonly tenantId: string | null;
  readonly spanId: string | null;
  readonly attributes: Readonly<Record<string, Scalar>>;
}

export interface SpanRecord {
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly correlationId: string;
  readonly tenantId: string | null;
  readonly name: string;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
  readonly durationMs: number | null;
  readonly outcome: 'ok' | 'error' | 'unfinished';
  readonly attributes: Readonly<Record<string, Scalar>>;
}

/**
 * A monotonic clock and an id source, injected.
 *
 * Not for testability alone: evidence must be replayable, and a component that reads
 * the wall clock or a random source directly cannot be replayed. The same reason the
 * generator excludes timestamps by construction.
 */
export interface TelemetryClock {
  nowMs(): number;
  nowIso(): string;
  nextId(prefix: string): string;
}

export function systemClock(): TelemetryClock {
  let counter = 0;
  return {
    nowMs: () => Date.now(),
    nowIso: () => new Date().toISOString(),
    nextId: (prefix) => `${prefix}-${(counter += 1).toString(36).padStart(6, '0')}`,
  };
}

/** A deterministic clock, for evidence that must replay identically. */
export function fixedClock(startMs = 0, stepMs = 1): TelemetryClock {
  let now = startMs;
  let counter = 0;
  return {
    nowMs: () => (now += stepMs),
    nowIso: () => new Date(now).toISOString(),
    nextId: (prefix) => `${prefix}-${(counter += 1).toString(36).padStart(6, '0')}`,
  };
}

export class Telemetry {
  private readonly logs: LogRecord[] = [];
  private readonly spans = new Map<string, SpanRecord>();

  constructor(private readonly clock: TelemetryClock = systemClock()) {}

  get records(): readonly LogRecord[] { return this.logs; }
  get traces(): readonly SpanRecord[] { return [...this.spans.values()]; }

  /** A correlation id for one logical operation. Carried across every record. */
  newCorrelationId(): string { return this.clock.nextId('corr'); }

  log(
    level: LogRecord['level'], event: string,
    context: { correlationId: string; tenantId?: string | null; spanId?: string | null },
    attributes: Record<string, Scalar> = {},
  ): LogRecord {
    for (const [k, v] of Object.entries(attributes)) assertEmittable(k, v);
    const record: LogRecord = {
      at: this.clock.nowIso(),
      level,
      event,
      correlationId: context.correlationId,
      tenantId: context.tenantId ?? null,
      spanId: context.spanId ?? null,
      attributes: { ...attributes },
    };
    this.logs.push(record);
    return record;
  }

  /**
   * Start a span. Ending it records a duration; never ending it records `unfinished`.
   *
   * `unfinished` is a deliberate third state. A span that silently disappeared would
   * make a hung operation look like one that never started, and those need opposite
   * responses.
   */
  startSpan(
    name: string,
    context: { correlationId: string; tenantId?: string | null; parentSpanId?: string | null },
    attributes: Record<string, Scalar> = {},
  ): string {
    for (const [k, v] of Object.entries(attributes)) assertEmittable(k, v);
    const spanId = this.clock.nextId('span');
    this.spans.set(spanId, {
      spanId,
      parentSpanId: context.parentSpanId ?? null,
      correlationId: context.correlationId,
      tenantId: context.tenantId ?? null,
      name,
      startedAtMs: this.clock.nowMs(),
      endedAtMs: null,
      durationMs: null,
      outcome: 'unfinished',
      attributes: { ...attributes },
    });
    return spanId;
  }

  endSpan(spanId: string, outcome: 'ok' | 'error'): SpanRecord | null {
    const span = this.spans.get(spanId);
    if (!span) return null;
    const endedAtMs = this.clock.nowMs();
    const ended: SpanRecord = {
      ...span, endedAtMs, durationMs: endedAtMs - span.startedAtMs, outcome,
    };
    this.spans.set(spanId, ended);
    return ended;
  }

  /** Every record for one operation, in emission order. The unit of diagnosis. */
  byCorrelation(correlationId: string): readonly LogRecord[] {
    return this.logs.filter((l) => l.correlationId === correlationId);
  }

  /** Records for one tenant. There is deliberately no "all tenants" reader. */
  byTenant(tenantId: string): readonly LogRecord[] {
    return this.logs.filter((l) => l.tenantId === tenantId);
  }
}

// ── Metrics ─────────────────────────────────────────────────────────────────

export type MetricKind = 'counter' | 'gauge' | 'histogram';

export interface MetricDefinition {
  readonly name: string;
  readonly kind: MetricKind;
  readonly unit: string;
  readonly description: string;
  /** True when the metric is meaningful per tenant (R-23.14). */
  readonly tenantScoped: boolean;
}

export interface MetricSample {
  readonly name: string;
  readonly tenantId: string | null;
  readonly value: number;
  readonly count: number;
  /** Histogram only. Empty for counters and gauges. */
  readonly observations: readonly number[];
}

/**
 * The metric registry.
 *
 * A metric must be DECLARED before it can be recorded. An undeclared metric has no
 * unit, no description and no tenant-scoping decision — and it would appear on a
 * dashboard with a name someone has to guess the meaning of.
 */
export class Metrics {
  private readonly definitions = new Map<string, MetricDefinition>();
  private readonly samples = new Map<string, MetricSample>();

  declare(definition: MetricDefinition): void {
    const existing = this.definitions.get(definition.name);
    if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) {
      throw new Error(`metric ${definition.name} is already declared with a different definition`);
    }
    this.definitions.set(definition.name, definition);
  }

  get declared(): readonly MetricDefinition[] {
    return [...this.definitions.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  private key(name: string, tenantId: string | null): string { return `${name} ${tenantId ?? ''}`; }

  private definitionOf(name: string): MetricDefinition {
    const d = this.definitions.get(name);
    if (!d) throw new Error(`metric ${name} was recorded before it was declared`);
    return d;
  }

  increment(name: string, tenantId: string | null = null, by = 1): void {
    const d = this.definitionOf(name);
    if (d.kind !== 'counter') throw new Error(`${name} is a ${d.kind}, not a counter`);
    this.record(name, tenantId, (prev) => ({ value: prev.value + by, count: prev.count + 1, observations: [] }));
  }

  set(name: string, value: number, tenantId: string | null = null): void {
    const d = this.definitionOf(name);
    if (d.kind !== 'gauge') throw new Error(`${name} is a ${d.kind}, not a gauge`);
    this.record(name, tenantId, () => ({ value, count: 1, observations: [] }));
  }

  observe(name: string, value: number, tenantId: string | null = null): void {
    const d = this.definitionOf(name);
    if (d.kind !== 'histogram') throw new Error(`${name} is a ${d.kind}, not a histogram`);
    this.record(name, tenantId, (prev) => ({
      value: prev.value + value, count: prev.count + 1, observations: [...prev.observations, value],
    }));
  }

  private record(
    name: string, tenantId: string | null,
    update: (prev: { value: number; count: number; observations: readonly number[] }) =>
    { value: number; count: number; observations: readonly number[] },
  ): void {
    const k = this.key(name, tenantId);
    const prev = this.samples.get(k) ?? { name, tenantId, value: 0, count: 0, observations: [] };
    const next = update(prev);
    this.samples.set(k, { name, tenantId, ...next });
  }

  /**
   * Read a metric. Returns null when nothing was recorded.
   *
   * NULL, NOT ZERO (C-24.1, R-23.13). "No requests were served" and "no telemetry
   * arrived" are different facts, and a zero conflates them into the more comforting
   * one. Everything downstream depends on this distinction holding here.
   */
  read(name: string, tenantId: string | null = null): MetricSample | null {
    return this.samples.get(this.key(name, tenantId)) ?? null;
  }

  /**
   * Has ANY scope recorded this metric at all?
   *
   * An EXISTENCE check, not an aggregation, and the distinction is what keeps it
   * inside C-24.10. It answers "did anything report?" — it does not compute a
   * cross-tenant total, and it returns no tenant's value to any caller. The health
   * monitor needs exactly this and nothing more: metrics are tenant-keyed, so asking
   * the unscoped bucket whether the platform is alive always answers "no", which would
   * report a busy platform as silent.
   */
  anyRecorded(name: string): boolean {
    for (const s of this.samples.values()) {
      if (s.name === name && s.count > 0) return true;
    }
    return false;
  }

  /** Tenants that have recorded this metric. The only way to enumerate scope. */
  tenantsFor(name: string): readonly string[] {
    return [...this.samples.values()]
      .filter((s) => s.name === name && s.tenantId !== null)
      .map((s) => s.tenantId as string)
      .sort();
  }

  /**
   * Percentile from recorded observations.
   *
   * Interpolation is deliberately absent: the value returned is one that was actually
   * observed. An interpolated p99 is a number nothing measured (C-24.1).
   */
  percentile(name: string, p: number, tenantId: string | null = null): number | null {
    const s = this.read(name, tenantId);
    if (!s || s.observations.length === 0) return null;
    const sorted = [...s.observations].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index]!;
  }

  mean(name: string, tenantId: string | null = null): number | null {
    const s = this.read(name, tenantId);
    return s && s.count > 0 ? s.value / s.count : null;
  }

  /**
   * Snapshot for export. Sorted, so two exports of the same state are identical.
   *
   * Cross-tenant totals are NOT computed here (C-24.10). A caller wanting one must sum
   * explicitly, which makes the aggregation visible at the point it happens.
   */
  snapshot(): readonly MetricSample[] {
    return [...this.samples.values()].sort((a, b) => {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return (a.tenantId ?? '') < (b.tenantId ?? '') ? -1 : 1;
    });
  }
}
