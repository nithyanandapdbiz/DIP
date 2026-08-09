/**
 * Contract version.
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md §6
 *   ADR          : ADR-0004 (wire format and versioning)
 *   Criteria     : C-20.6 · C-20.12 (every supported version has a compatibility test)
 *
 * Semantic versioning (R-20.23). Additive change is minor; field removal, semantic
 * change, or constraint tightening is major. A field's meaning SHALL NOT change
 * within a major version — that is the most dangerous available change class,
 * because both sides validate and the disagreement surfaces only as wrong behaviour.
 */
export const CONTRACT_VERSION = '1.0.0' as const;
export type ContractVersion = typeof CONTRACT_VERSION;

/** Major versions this build can parse. The IP must support every deployed version (R-20.24). */
export const SUPPORTED_MAJORS = [1] as const;

export function majorOf(version: string): number | null {
  const m = /^(\d+)\./.exec(version);
  return m?.[1] !== undefined ? Number(m[1]) : null;
}

export function isSupported(version: string): boolean {
  const major = majorOf(version);
  return major !== null && (SUPPORTED_MAJORS as readonly number[]).includes(major);
}
