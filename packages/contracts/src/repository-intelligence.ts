/**
 * Canonical Repository Intelligence Model — ADR-0040 Wave 4 (PCT-REPO-MODEL).
 *
 * Descriptive repository knowledge ONLY. This model performs no decision, executes
 * no work, invokes no connector and calls no AI. Whether reuse actually occurs is
 * decided exclusively by the Decision Engine (Wave 3, PCT-DECISION) — this model
 * only describes what exists and what is similar/missing. It is capability-neutral:
 * it names no tool, provider, AI vendor or capability-specific concept (G-16).
 *
 * Immutable once created (sealRepositoryIntelligence deep-freezes it, G-8).
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md · 09-data-flow-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-REPO-MODEL · descriptive-only · immutable (G-8) · capability-neutral (G-16)
 */

export interface RepositoryAsset { readonly assetRef: string; readonly kind: string; readonly fingerprint: string; }
export interface CoverageDatum { readonly subjectRef: string; readonly covered: boolean; readonly score: number; }
export interface SimilarityDatum { readonly assetRef: string; readonly candidateRef: string; readonly score: number; }
export interface TraceabilityEdge { readonly from: string; readonly to: string; }
export interface RepositoryMetadataEntry { readonly key: string; readonly value: string; }
/** A recommendation is DESCRIPTIVE — a suggestion, never a decision (the Decision Engine decides). */
export interface RepositoryRecommendation { readonly subjectRef: string; readonly disposition: string; readonly rationale: string; }

export interface RepositoryIntelligenceModel {
  readonly modelVersion: string;
  readonly existingAssets: readonly RepositoryAsset[];
  readonly coverage: readonly CoverageDatum[];
  readonly similarity: readonly SimilarityDatum[];
  readonly duplicateCandidates: readonly string[];
  readonly reuseCandidates: readonly string[];
  readonly missingAssets: readonly string[];
  readonly confidence: number;
  readonly traceability: readonly TraceabilityEdge[];
  readonly metadata: readonly RepositoryMetadataEntry[];
  readonly recommendations: readonly RepositoryRecommendation[];
}

export const REPOSITORY_INTELLIGENCE_VERSION = '1.0.0';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** Seal a model — immutable once created (G-8). Returns the same shape, deep-frozen. */
export function sealRepositoryIntelligence(model: RepositoryIntelligenceModel): RepositoryIntelligenceModel {
  return deepFreeze({ ...model });
}
