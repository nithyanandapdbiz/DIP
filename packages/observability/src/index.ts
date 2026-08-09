/**
 * @dbiz/observability — Operational Excellence and Platform Intelligence.
 *
 * TRACEABILITY
 *   Architecture : 23-operational-excellence-model.md · 24-platform-intelligence-model.md
 *   ADR          : ADR-0018 (Platform Services, not capabilities) · ADR-0020
 *   Criteria     : C-23.1-C-23.14 · C-24.1-C-24.15
 *
 * TWO PLATFORM SERVICES, NOT A SEVENTH CAPABILITY.
 * Documents 23 and 24 already own this surface. Nothing here renders a quality verdict,
 * and the six Quality Engineering Capabilities are unchanged (R-11.4). Worth stating in
 * code because "observability" is exactly the kind of surface that grows into a
 * capability if nobody says otherwise.
 *
 * THIS PACKAGE OBSERVES AND REPORTS. IT NEVER ACTS.
 * C-24.9 forbids remediation, and C-23.12 forbids this service blocking capability
 * execution. Both are enforced by tests that scan this source, not by intention: the
 * pressure to close the loop arrives during an incident, which is precisely when a
 * comment stops working.
 */
export {
  Telemetry, Metrics, TelemetryContentError, systemClock, fixedClock,
} from './telemetry.js';
export type {
  LogRecord, SpanRecord, MetricDefinition, MetricSample, MetricKind, Scalar, TelemetryClock,
} from './telemetry.js';

export { HealthMonitor } from './health.js';
export type {
  HealthReport, HealthState, ProbeResult, ProbeState, DependencyHealth, HealthDependency,
} from './health.js';

export { SloRegistry, SloError, PLATFORM_SLOS } from './slo.js';
export type { SloDefinition, SliReading, SloStatus, BudgetLedgerEntry, SliSource } from './slo.js';

export {
  classify, detectSilentSources, scoreHealth, analyse, selfConformance, CLASSIFIER_CATEGORIES,
} from './intelligence.js';
export type { Finding, Severity, IndexReport, IngestedSource, Classification } from './intelligence.js';

export {
  buildDashboards, validateDashboards, unusedMetrics, renderDashboardSpec,
  DashboardError, PLATFORM_METRICS,
} from './dashboards.js';
export type { DashboardSpec, PanelSpec, PanelKind } from './dashboards.js';

export {
  buildManifest, verifyIntegrity, verifyManifestHash, hashBytes,
  checkContractCompatibility, checkUpgradePath, checkDependencyPinning, admitEvidence,
} from './release-governance.js';
export type {
  ReleaseManifest, ArtefactRecord, IntegrityResult, IntegrityFailure, CompatibilityVerdict,
} from './release-governance.js';
