/**
 * Dashboard specifications — generated from the metric registry, never hand-drawn.
 *
 * TRACEABILITY
 *   Architecture : 24-platform-intelligence-model.md
 *   ADR          : ADR-0018
 *   Criteria     : C-24.1 (no published metric is interpolated, estimated or inferred)
 *                  C-24.5 (every index publishes score, coverage and freshness)
 *                  C-24.7 (absence of incidents is never reported as health)
 *                  C-24.10 (no cross-tenant aggregation)
 *
 * A DASHBOARD PANEL THAT NAMES A METRIC NOBODY EMITS IS AN EMPTY CHART.
 * Every panel below is validated against the live metric registry, and a specification
 * naming an undeclared metric is REFUSED rather than published. That is the whole
 * reason this is generated: a hand-drawn dashboard drifts the moment a metric is
 * renamed, and it drifts silently — the panel simply shows nothing, which looks
 * exactly like a quiet period.
 *
 * EVERY PANEL DECLARES WHAT ITS EMPTINESS MEANS.
 * `whenEmpty` is required. It is the field that stops C-24.7 being violated by the
 * presentation layer after the data layer got it right: a panel with no data is either
 * "nothing happened" or "nothing reported", and only the panel's author knows which.
 */
import type { MetricDefinition, Metrics } from './telemetry.js';

export type PanelKind = 'timeseries' | 'stat' | 'table' | 'heatmap';

export interface PanelSpec {
  readonly title: string;
  readonly kind: PanelKind;
  /** Metrics this panel reads. Each must be declared in the registry. */
  readonly metrics: readonly string[];
  /** Per tenant, or platform-wide. Never a cross-tenant aggregate (C-24.10). */
  readonly scope: 'tenant' | 'platform';
  /** REQUIRED: what an empty panel means. Absence is never health (C-24.7). */
  readonly whenEmpty: string;
  /** What an operator should do when this panel looks wrong. */
  readonly interpretation: string;
}

export interface DashboardSpec {
  readonly id: string;
  readonly title: string;
  readonly audience: string;
  readonly panels: readonly PanelSpec[];
}

export class DashboardError extends Error {
  constructor(public readonly dashboardId: string, public readonly undeclared: readonly string[]) {
    super(`dashboard ${dashboardId} names undeclared metric(s): ${undeclared.join(', ')}`);
    this.name = 'DashboardError';
  }
}

/** The metrics the platform emits. Declared once, consumed by dashboards and SLOs. */
export const PLATFORM_METRICS: readonly MetricDefinition[] = [
  { name: 'registration.succeeded', kind: 'counter', unit: 'registrations', tenantScoped: true, description: 'Execution Planes that registered and received credentials.' },
  { name: 'registration.failed', kind: 'counter', unit: 'registrations', tenantScoped: true, description: 'Registrations refused or failed. Excludes idempotent replays, which are successes.' },
  { name: 'registration.duration', kind: 'histogram', unit: 'ms', tenantScoped: true, description: 'Wall-clock time to complete a registration.' },
  { name: 'gateway.served', kind: 'counter', unit: 'requests', tenantScoped: true, description: 'Authenticated requests served.' },
  { name: 'gateway.refused_by_policy', kind: 'counter', unit: 'requests', tenantScoped: true, description: 'Requests refused deliberately. A working control, not a fault — excluded from the gateway SLI.' },
  { name: 'gateway.refused_unexpectedly', kind: 'counter', unit: 'requests', tenantScoped: true, description: 'Requests refused for a reason that is not a policy decision. Counts against the SLI.' },
  { name: 'gateway.duration', kind: 'histogram', unit: 'ms', tenantScoped: true, description: 'Time to serve or refuse a request.' },
  { name: 'certificate.issued', kind: 'counter', unit: 'certificates', tenantScoped: true, description: 'Certificates issued.' },
  { name: 'certificate.rotated', kind: 'counter', unit: 'certificates', tenantScoped: true, description: 'Certificates rotated with overlap.' },
  { name: 'certificate.rotation_failed', kind: 'counter', unit: 'certificates', tenantScoped: true, description: 'Rotations that did not complete. A failure here becomes an outage on a known date.' },
  { name: 'certificate.revoked', kind: 'counter', unit: 'certificates', tenantScoped: true, description: 'Certificates revoked.' },
  { name: 'certificate.days_remaining', kind: 'gauge', unit: 'days', tenantScoped: true, description: 'Days until the active certificate expires.' },
  { name: 'secret.rotated', kind: 'counter', unit: 'secrets', tenantScoped: true, description: 'Secret versions created by rotation.' },
  { name: 'secret.revoked', kind: 'counter', unit: 'secrets', tenantScoped: true, description: 'Secret versions revoked, ending an overlap window.' },
  { name: 'generation.succeeded', kind: 'counter', unit: 'solutions', tenantScoped: true, description: 'Execution Plane solutions generated.' },
  { name: 'generation.failed', kind: 'counter', unit: 'solutions', tenantScoped: true, description: 'Generation failures for a profile the registry accepted.' },
  { name: 'generation.duration', kind: 'histogram', unit: 'ms', tenantScoped: true, description: 'Time to generate a solution.' },
  { name: 'queue.depth', kind: 'gauge', unit: 'items', tenantScoped: true, description: 'Items awaiting processing for a tenant.' },
  { name: 'queue.enqueued', kind: 'counter', unit: 'items', tenantScoped: true, description: 'Items enqueued.' },
  { name: 'queue.drained', kind: 'counter', unit: 'items', tenantScoped: true, description: 'Items drained.' },
  { name: 'audit.recorded', kind: 'counter', unit: 'events', tenantScoped: true, description: 'Lifecycle audit events recorded.' },
  { name: 'security.replay_refused', kind: 'counter', unit: 'requests', tenantScoped: true, description: 'Requests refused for nonce reuse.' },
  { name: 'security.cross_tenant_refused', kind: 'counter', unit: 'requests', tenantScoped: true, description: 'Attempts to assert another tenant. Refused and audited.' },
  { name: 'quota.remaining', kind: 'gauge', unit: 'units', tenantScoped: true, description: 'Quota left for a tenant in the current window.' },
];

/**
 * The dashboards, derived from the metrics above.
 *
 * Every panel's `whenEmpty` is written from the panel's own semantics. This is the
 * field that carries C-24.7 into the presentation layer.
 */
export function buildDashboards(): readonly DashboardSpec[] {
  const dashboards: DashboardSpec[] = [
    {
      id: 'tenant-health',
      title: 'Tenant health',
      audience: 'Operators answering "is this specific customer working?"',
      panels: [
        {
          title: 'Requests served vs. unexpectedly refused, per tenant',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['gateway.served', 'gateway.refused_unexpectedly'],
          whenEmpty: 'The tenant sent nothing, OR telemetry stopped arriving. These are different and this panel cannot tell them apart — check the platform status panel before concluding the tenant is idle.',
          interpretation: 'A tenant at zero served while others are serving is an outage for that customer, and aggregate availability will not show it.',
        },
        {
          title: 'Policy refusals, per tenant',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['gateway.refused_by_policy'],
          whenEmpty: 'No policy refusals. This is normal and is NOT a fault indicator.',
          interpretation: 'A rising rate for one tenant usually means a client change, not a platform change. These do not count against the gateway SLO.',
        },
        {
          title: 'Certificate days remaining, per tenant',
          kind: 'table', scope: 'tenant',
          metrics: ['certificate.days_remaining'],
          whenEmpty: 'No certificate is being reported for any tenant. That is a reporting failure, not an absence of certificates — every registered tenant has one.',
          interpretation: 'Under 14 days is the action threshold. Expiry is the one outage with a known date, so this table should never surprise anyone.',
        },
      ],
    },
    {
      id: 'runtime-health',
      title: 'Runtime health',
      audience: 'Operators answering "is the platform working?"',
      panels: [
        {
          title: 'Gateway request duration',
          kind: 'heatmap', scope: 'platform',
          metrics: ['gateway.duration'],
          whenEmpty: 'No requests were handled. During business hours this is an outage signal, not a quiet period.',
          interpretation: 'Percentiles are computed from observed values only; no interpolation (C-24.1).',
        },
        {
          title: 'Queue depth by tenant',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['queue.depth', 'queue.enqueued', 'queue.drained'],
          whenEmpty: 'Nothing is queued. Distinguish from "nothing is reporting" using the enqueued/drained counters — a flat zero on all three is a reporting failure.',
          interpretation: 'Depth rising while drained is flat means processing has stopped, not that load has risen.',
        },
      ],
    },
    {
      id: 'registration-health',
      title: 'Registration and onboarding',
      audience: 'Anyone who owns the first thing a customer experiences.',
      panels: [
        {
          title: 'Registrations succeeded vs. failed',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['registration.succeeded', 'registration.failed'],
          whenEmpty: 'No registrations were attempted. Expected outside onboarding periods; NOT evidence that registration works.',
          interpretation: 'A failure here is the first thing a customer sees. The SLO consequence is a freeze, deliberately.',
        },
        {
          title: 'Registration duration',
          kind: 'heatmap', scope: 'tenant',
          metrics: ['registration.duration'],
          whenEmpty: 'No registrations completed in the window.',
          interpretation: 'Compare against the published onboarding measurement rather than against intuition.',
        },
        {
          title: 'Solution generation',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['generation.succeeded', 'generation.failed', 'generation.duration'],
          whenEmpty: 'No solutions were generated. Expected outside onboarding periods, and NOT evidence that generation works — that is proven by the supported-target validation, not by this panel.',
          interpretation: 'A generation failure for a profile the registry ACCEPTED means the supported-target matrix is lying. That is a platform defect, not a customer error.',
        },
      ],
    },
    {
      id: 'certificate-and-secret-lifecycle',
      title: 'Certificate and secret lifecycle',
      audience: 'Operators owning credential rotation.',
      panels: [
        {
          title: 'Certificate issuance, rotation and revocation',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['certificate.issued', 'certificate.rotated', 'certificate.rotation_failed', 'certificate.revoked'],
          whenEmpty: 'No certificate activity. Sustained emptiness alongside falling days-remaining means rotation has stopped, which is an outage being scheduled.',
          interpretation: 'Rotation failures are the highest-value signal here: each is a dated future outage.',
        },
        {
          title: 'Secret rotation and revocation',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['secret.rotated', 'secret.revoked'],
          whenEmpty: 'No secret rotation. Whether that is correct depends on your rotation policy, which this panel does not know.',
          interpretation: 'Rotations far exceeding revocations means overlap windows are being left open.',
        },
      ],
    },
    {
      id: 'security-monitoring',
      title: 'Security monitoring',
      audience: 'Security operations.',
      panels: [
        {
          title: 'Replay refusals',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['security.replay_refused'],
          whenEmpty: 'No replays refused. This is the expected steady state and is NOT proof the control works — that is proven by the fault-injection suite, not by this panel.',
          interpretation: 'A client bug reuses nonces on retry; an attack replays a captured request. The source certificate distinguishes them.',
        },
        {
          title: 'Cross-tenant assertion attempts',
          kind: 'timeseries', scope: 'tenant',
          metrics: ['security.cross_tenant_refused'],
          whenEmpty: 'No cross-tenant assertions were attempted. This is the expected steady state; it is evidence of nothing happening, not evidence that the control works.',
          interpretation: 'Any non-zero value warrants investigation: legitimate clients have no reason to send a tenant identifier at all.',
        },
        {
          title: 'Audit events recorded',
          kind: 'stat', scope: 'tenant',
          metrics: ['audit.recorded'],
          whenEmpty: 'No audit events. Since registration and execution both emit them, emptiness alongside gateway activity means the audit path is broken — which is a compliance failure, not a quiet period.',
          interpretation: 'Audit volume should track lifecycle activity. Divergence is the signal.',
        },
      ],
    },
    {
      id: 'capacity',
      title: 'Capacity utilisation',
      audience: 'Capacity planning.',
      panels: [
        {
          title: 'Quota remaining by tenant',
          kind: 'table', scope: 'tenant',
          metrics: ['quota.remaining'],
          whenEmpty: 'No quota is being reported for any tenant. Every registered tenant has a quota, so emptiness here is a reporting failure rather than an absence of limits — do not read it as "nobody is near their limit".',
          interpretation: 'Quotas are per tenant and independent: one tenant exhausting its quota does not affect another. A tenant at zero is rate-limited, not broken.',
        },
        {
          title: 'Throughput by operation',
          kind: 'timeseries', scope: 'platform',
          metrics: ['gateway.served', 'registration.succeeded', 'certificate.issued', 'secret.rotated'],
          whenEmpty: 'No operations of any kind were recorded. On a platform with registered tenants this is an outage or a telemetry failure, never a quiet period — all four counters going flat together is the signal.',
          interpretation: 'Compare against the benchmark report rather than against a remembered figure.',
        },
      ],
    },
  ];

  return [...dashboards].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Validate every panel against the live registry.
 *
 * Throws rather than warns. A dashboard naming a metric nobody emits renders an empty
 * panel, and an empty panel is indistinguishable from a quiet period — the exact
 * confusion C-24.7 exists to prevent, arriving through the presentation layer instead
 * of the data layer.
 */
export function validateDashboards(dashboards: readonly DashboardSpec[], metrics: Metrics): void {
  const declared = new Set(metrics.declared.map((m) => m.name));
  for (const d of dashboards) {
    const undeclared = [...new Set(d.panels.flatMap((p) => p.metrics))].filter((m) => !declared.has(m));
    if (undeclared.length > 0) throw new DashboardError(d.id, undeclared);
    for (const p of d.panels) {
      if (!p.whenEmpty || p.whenEmpty.trim() === '') {
        throw new DashboardError(d.id, [`panel "${p.title}" does not declare what an empty panel means`]);
      }
    }
  }
}

/** Metrics declared but shown nowhere. Not a failure — a gap worth seeing. */
export function unusedMetrics(dashboards: readonly DashboardSpec[], metrics: Metrics): readonly string[] {
  const shown = new Set(dashboards.flatMap((d) => d.panels.flatMap((p) => p.metrics)));
  return metrics.declared.map((m) => m.name).filter((n) => !shown.has(n)).sort();
}

/** Render the specification as the document an operator or a dashboard author reads. */
export function renderDashboardSpec(dashboards: readonly DashboardSpec[]): string {
  const lines = [
    '# Operational dashboard specification',
    '',
    '**Generated from the metric registry.** Every panel below names metrics the platform',
    'actually declares; a specification naming an undeclared metric is refused rather than',
    'published, because an empty panel is indistinguishable from a quiet period.',
    '',
    '## Why every panel declares what emptiness means',
    '',
    'C-24.7: *absence of incidents is never reported as health*. A panel with no data is',
    'either "nothing happened" or "nothing reported", and those need opposite responses.',
    'Each panel below says which one its emptiness indicates — the data layer getting this',
    'right is not enough if the presentation layer then guesses.',
    '',
  ];

  for (const d of dashboards) {
    lines.push(`## ${d.title}`, '', `**Audience:** ${d.audience}`, '');
    for (const p of d.panels) {
      lines.push(`### ${p.title}`, '');
      lines.push(`- **Type:** ${p.kind} · **Scope:** ${p.scope === 'tenant' ? 'per tenant (never aggregated across tenants)' : 'platform-wide'}`);
      lines.push(`- **Metrics:** ${p.metrics.map((m) => `\`${m}\``).join(', ')}`);
      lines.push(`- **When empty:** ${p.whenEmpty}`);
      lines.push(`- **Reading it:** ${p.interpretation}`);
      lines.push('');
    }
  }

  lines.push('---', '', '*Generated from the live metric registry. Not hand-maintained.*', '');
  return lines.join('\n');
}
