/**
 * Canonical Platform Event & Observability Contracts — ADR-0040 Wave 6 (PCT-EVENTS).
 *
 * The final foundational platform contracts. A PlatformEvent and an Observability
 * model are OBSERVATIONAL ONLY: they carry platform metadata for visibility,
 * diagnostics, certification and reporting. They never control execution, invoke a
 * domain, schedule work, trigger a workflow, replace orchestration, create an
 * alternate execution path or bypass governance (G-9). The twelve-stage pipeline
 * remains authoritative and the Decision Engine remains the only decision
 * authority. Both are capability-neutral: no business payload, test, screenshot,
 * video, provider object or AI vendor — only references (G-10/G-16).
 *
 * Immutable once published (seal* deep-freezes them, G-8).
 *
 * TRACEABILITY
 *   Architecture : 16-runtime-model.md · 20-cross-plane-contracts.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-EVENTS · observational-only (G-9) · references-only (G-10) · immutable (G-8) · capability-neutral (G-16)
 */
import type { EvidenceReference } from './evidence.js';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

// ── Part 1 · Canonical Platform Event ───────────────────────────────────────

export interface PlatformEventMetadataEntry { readonly key: string; readonly value: string; }

export interface PlatformEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: string;
  /** Producer-set instant (ISO string). The contract STORES it; it never reads a clock. */
  readonly timestamp: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly tenantRef: string;
  readonly capabilityRef: string;
  readonly domainRef: string;
  readonly stageRef: string;
  readonly severity: string;
  readonly classification: string;
  readonly source: string;
  readonly metadata: readonly PlatformEventMetadataEntry[];
  readonly evidenceReferences: readonly EvidenceReference[];
  readonly decisionReferences: readonly string[];
  readonly auditReferences: readonly string[];
}

export const PLATFORM_EVENT_VERSION = '1.0.0';

/** Seal an event — immutable once published (G-8). */
export function sealPlatformEvent(event: PlatformEvent): PlatformEvent {
  return deepFreeze({ ...event });
}

// ── Part 2 · Canonical Observability model ──────────────────────────────────

export interface Observation { readonly at: string; readonly kind: string; readonly note: string; }
export type ObservationSet = readonly Observation[];

export interface ObservabilityModel {
  readonly modelVersion: string;
  readonly executionTimeline: ObservationSet;
  readonly domainObservations: ObservationSet;
  readonly connectorObservations: ObservationSet;
  readonly decisionObservations: ObservationSet;
  readonly governanceObservations: ObservationSet;
  readonly securityObservations: ObservationSet;
  readonly certificationObservations: ObservationSet;
  readonly performanceObservations: ObservationSet;
  readonly auditObservations: ObservationSet;
  readonly traceabilityObservations: ObservationSet;
}

export const OBSERVABILITY_MODEL_VERSION = '1.0.0';

/** Seal an observability model — immutable once published (G-8). */
export function sealObservabilityModel(model: ObservabilityModel): ObservabilityModel {
  return deepFreeze({ ...model });
}
