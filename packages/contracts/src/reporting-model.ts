/**
 * Canonical Platform Reporting Model — ADR-0040 Wave 5 (PCT-REPORT-MODEL).
 *
 * The single reporting contract every reporting provider consumes. It REPRESENTS
 * execution outcomes; it renders nothing, generates nothing, publishes nothing.
 * A PDF/HTML/dashboard renderer consumes this model — none becomes the source of
 * truth. It DESCRIBES certification (the Certification Framework performs it) and
 * references evidence only: it embeds no screenshot, video, trace or payload —
 * only canonical Evidence references (hash + metadata) cross. Capability-neutral:
 * it names no tool, provider, AI vendor or capability-specific concept (G-16).
 *
 * Immutable once constructed (sealReportingModel deep-freezes it, G-8).
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md · 10-evidence-flow-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-REPORT-MODEL · references-only (G-10) · immutable (G-8) · capability-neutral (G-16)
 */
import type { EvidenceReference } from './evidence.js';

export interface ReportEntry { readonly label: string; readonly value: string; }
export type ReportSection = readonly ReportEntry[];

/** Describes a certification outcome — it never performs certification (that is the framework's role). */
export interface CertificationDescription {
  readonly verdict: string;
  readonly describedBy: string;
  readonly criteria: readonly string[];
}

export interface ReportVersionInformation {
  readonly modelVersion: string;
  readonly contractVersions: ReportSection;
}

export interface ReportingModel {
  readonly modelVersion: string;
  readonly executionSummary: ReportSection;
  readonly capabilitySummary: ReportSection;
  readonly certificationSummary: CertificationDescription;
  readonly governanceSummary: ReportSection;
  readonly securitySummary: ReportSection;
  readonly riskSummary: ReportSection;
  readonly coverageSummary: ReportSection;
  /** Evidence by REFERENCE only (hash + metadata); no payload is ever embedded (G-10). */
  readonly evidenceReferences: readonly EvidenceReference[];
  readonly traceabilitySummary: ReportSection;
  readonly repositoryIntelligenceSummary: ReportSection;
  readonly automationIntelligenceSummary: ReportSection;
  readonly decisionSummary: ReportSection;
  readonly observabilitySummary: ReportSection;
  readonly metadata: ReportSection;
  readonly versionInformation: ReportVersionInformation;
}

export const REPORTING_MODEL_VERSION = '1.0.0';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** Seal a report — immutable once constructed (G-8). Returns the same shape, deep-frozen. */
export function sealReportingModel(model: ReportingModel): ReportingModel {
  return deepFreeze({ ...model });
}
