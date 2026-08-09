/**
 * Assurance state — structural, never a log line.
 *
 * TRACEABILITY
 *   Architecture : 10-evidence-flow-model.md · 05-cross-plane-communication.md §4
 *   ADR          : ADR-0015 (degraded operation)
 *   Criteria     : C-05.6 (no result constructible without an assurance state)
 *                  C-05.7 / C-10.11 (certification interface rejects a degraded result)
 *                  C-16.17 (a partial result cannot be presented as certified)
 *
 * An unlabelled degraded pass is worse than an outage. An outage is visible and
 * someone responds; a silently degraded certification is a false assurance that
 * propagates into release decisions (INV-8).
 */
export const ASSURANCE_STATES = ['CERTIFIED', 'DEGRADED', 'DEGRADED_UNCERTIFIED', 'HALTED'] as const;
export type AssuranceState = (typeof ASSURANCE_STATES)[number];

/** Only CERTIFIED may be presented as certified (R-10.4). */
export function isCertifiable(state: AssuranceState): state is 'CERTIFIED' {
  return state === 'CERTIFIED';
}

/**
 * Guard for the certification interface. Returns a typed refusal rather than
 * throwing, so callers must handle it — a thrown error can be swallowed.
 */
export type CertificationAdmission =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: 'not-certifiable'; readonly state: AssuranceState };

export function admitForCertification(state: AssuranceState): CertificationAdmission {
  return isCertifiable(state) ? { admitted: true } : { admitted: false, reason: 'not-certifiable', state };
}
