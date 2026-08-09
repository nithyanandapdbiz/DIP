/**
 * Canonical Automation Intelligence Model — ADR-0040 Wave 4 (PCT-AUTO-MODEL).
 *
 * Automation PLANNING information only. This model never generates automation,
 * never executes automation, never invokes AI and never calls a connector — it
 * describes planning data. Generation itself is outside this wave. Whether any
 * plan is acted on is decided by the Decision Engine (Wave 3). Capability-neutral:
 * it names no tool, provider, AI vendor or capability-specific concept (G-16).
 *
 * Immutable once created (sealAutomationIntelligence deep-freezes it, G-8).
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md · 09-data-flow-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-AUTO-MODEL · planning-data-only · immutable (G-8) · capability-neutral (G-16)
 */

export interface AutomationCandidate { readonly candidateRef: string; readonly kind: string; }
export interface AutomationTraceabilityEdge { readonly from: string; readonly to: string; }

export interface AutomationIntelligenceModel {
  readonly modelVersion: string;
  readonly automationIntent: readonly string[];
  readonly candidateAssets: readonly AutomationCandidate[];
  readonly reuseOpportunities: readonly string[];
  readonly generationCandidates: readonly string[];
  readonly validationStatus: string;
  readonly materializationPlan: readonly string[];
  readonly registrationPlan: readonly string[];
  readonly executionReadiness: string;
  readonly confidence: number;
  readonly traceability: readonly AutomationTraceabilityEdge[];
}

export const AUTOMATION_INTELLIGENCE_VERSION = '1.0.0';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** Seal a model — immutable once created (G-8). Returns the same shape, deep-frozen. */
export function sealAutomationIntelligence(model: AutomationIntelligenceModel): AutomationIntelligenceModel {
  return deepFreeze({ ...model });
}
