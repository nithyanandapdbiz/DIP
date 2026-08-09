/**
 * THE PUBLICATION GATE — whether an authored package may be made retrievable.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md (R-12.2 the triad is mandatory, R-12.5) ·
 *                  20-cross-plane-contracts.md (R-20.7) · 05-cross-plane-communication.md
 *   ADR          : ADR-0070 (P-70.1) · ADR-0071 (the stage refusal primitive) ·
 *                  ADR-0079/ADR-0081 (what publication IS: a write to the sealed package store)
 *   Charter      : §17.1 — `NOT MEASURED` is never a pass
 *   Debt         : D-019 (what the triad reviews) · D-122 · D-124
 *   Report       : program/SEVERANCE_3_PUBLICATION_GATE_REPORT.md
 *
 * ══ AUTHORING AND PUBLICATION ARE TWO ACTS ═════════════════════════════════════════════════════
 *
 * P-70.1 reads "a sealed package EXISTS AND IS RETRIEVABLE" — two conjuncts, and two MOMENTS.
 * Stage 7 authors; this decides whether the artefact becomes retrievable. Conflating them is what
 * put composition at the end of the lifecycle: gating AUTHORING on the run's certification means
 * the package cannot exist until the run has concluded, and the run cannot conclude without the
 * package in any deployment where stages 8 and 9 are the Execution Plane's (D-124).
 *
 * ══ WHY THE GOVERNANCE TRIAD IS THE BASIS, AND WHY THAT IS NOT A COMPROMISE ════════════════════
 *
 * The Execution Plane needs the package BEFORE stage 8. Publication therefore cannot wait for a
 * verdict that only exists at stage 11, and the governance triad (stages 4-6) is the only
 * certification that exists before execution. Requiring more means requiring a run to have
 * happened, which is the contradiction this file exists downstream of.
 *
 *   **THE COMPARISON IS NOT STRONG-GATE VERSUS WEAK-GATE. IT IS WEAK GATE VERSUS NO PATH.**
 *   Nothing publishes today. A gate that admits on a presence-only review is not a regression from
 *   a stronger gate; it is the first gate there has ever been on a path that does not otherwise
 *   exist. That is the REASON for this design and is recorded as the reason, not as a caveat.
 *
 * ══ WHAT THE TRIAD ESTABLISHES, STATED EXACTLY ═════════════════════════════════════════════════
 *
 * **The triad reviews PRESENCE, not SOUNDNESS.** `architecture-review` can refuse, reachably, on an
 * authored-but-empty architecture. `policy-review` and `guardrail-review` cannot refuse AT ALL — by
 * ruling, because their predicate is *was this artefact authored?* and the negative is pure absence:
 * there is no did-not-approve state to reach, and a refusal there would claim a review ran.
 *
 * So a run whose story intelligence is wrong and whose test design is inadequate passes the triad.
 * Closing that is ADR-0076 §4.4's `UNDECIDED — Functional Testing` — a capability stating what its
 * reviews refuse on. **It is a deferred capability decision, not a framework defect** (debt D-019,
 * whose headline is corrected to say so).
 *
 * ══ THE WORD, AND IT CARRIES THE WEIGHT ════════════════════════════════════════════════════════
 *
 * NOTHING HERE IS CALLED "CERTIFIED", AND THAT IS A DECISION RATHER THAN A STYLE CHOICE.
 *
 *   **ADMISSIBLE means the plane has NOT FOUND A REASON TO REFUSE.**
 *   **CERTIFIED would mean the plane has ESTABLISHED SOUNDNESS.**
 *
 * On a presence-only review only the first is true, and the second would be a false claim of exactly
 * the kind this platform's register counts — a verdict handed over (D-012), a reason that refutes
 * its own conclusion (D-043). **A weak gate wearing a strong gate's name is the whole defect class
 * in one word choice**, and the vocabulary is what a future reader will reason from when they decide
 * whether this gate is sufficient. Do not rename this to `certified` when the triad is strengthened;
 * add the stronger basis and let the name follow the evidence.
 */
import { GOVERNANCE_TRIAD, type StageName } from './stages.js';
import type { CertificationOutcome, Verdict, VerdictDisposition } from './certification.js';

/** One triad leg's contribution to the decision. Carried, never summarised into a boolean. */
export interface TriadLegRecord {
  readonly stage: StageName;
  readonly disposition: VerdictDisposition;
  /** The verdict's own reason, verbatim. Never re-worded — a re-worded reason is a second claim. */
  readonly reason: string;
}

/**
 * The publication decision.
 *
 * `legs` is part of the decision, not diagnostics beside it. A caller that reduces this to
 * `admissible` has discarded exactly the distinction that makes the basis weak, and the next reader
 * would find an approval with nothing behind it.
 */
export interface PublicationDecision {
  readonly admissible: boolean;
  /** What the decision was taken on. One value today; named so a stronger basis is additive. */
  readonly basis: 'governance-triad';
  readonly legs: readonly TriadLegRecord[];
  readonly judged: number;
  /** Legs that did NOT judge — not-applicable, refused or absent. Never folded into `judged`. */
  readonly unjudged: number;
  readonly reason: string;
}

/** The triad gates, resolved from the stage list rather than re-listed (one enumeration). */
const isTriadStage = (stage: StageName): boolean => GOVERNANCE_TRIAD.includes(stage);

/**
 * Decide whether an authored package may be published, from the governance triad alone.
 *
 * ── EVERY NON-JUDGED LEG REFUSES, INCLUDING `not-applicable` ────────────────────────────────
 *
 * CHARTER §17.1: **`NOT MEASURED` is never a pass.** A leg that returned `not-applicable` did not
 * approve — it reported that there was nothing to review, which is a different fact and one a reader
 * acting on it would act differently about. Admitting on it would make the gate satisfied BY THE
 * ABSENCE of its subject, which is CHARTER §17.1.1's control-shaped literal exactly.
 *
 * So: **admissible if and only if all three legs JUDGED.** Fail-closed on absent, refused and
 * not-applicable alike, and the three remain distinguishable in `legs` because they are different
 * facts even though they produce the same outcome here.
 */
export function decidePublication(outcome: CertificationOutcome): PublicationDecision {
  const triadVerdicts: Verdict[] = outcome.verdicts.filter((v) => isTriadStage(v.stage));

  // A stage the outcome says nothing about is ABSENT, not judged. Building the record from the
  // TRIAD rather than from the verdicts means a missing verdict produces a leg rather than a gap —
  // an enumeration over the subject, not over what happened to be reported.
  const legs: TriadLegRecord[] = GOVERNANCE_TRIAD.map((stage) => {
    const verdict = triadVerdicts.find((v) => v.stage === stage);
    return verdict
      ? { stage, disposition: verdict.disposition, reason: verdict.reason }
      : { stage, disposition: 'absent' as const, reason: `no verdict was rendered for stage "${stage}"` };
  });

  const judged = legs.filter((l) => l.disposition === 'judged').length;
  const unjudged = legs.length - judged;
  const admissible = unjudged === 0;

  // THE EMITTED REASON DOES NOT USE THE WORD "CERTIFIED" AT ALL — NOT EVEN TO DISCLAIM IT.
  //
  // The first version read "ADMISSIBLE IS NOT CERTIFIED — the triad reviews presence, not
  // soundness", which is true and is the right thing to say. The conformance property caught it,
  // and the property is right: a disclaimer still puts the word into every emitted verdict, where
  // it will be excerpted, logged, quoted into a report, and eventually read without its negation.
  // **The place for the distinction is this file's documentation, which travels with the decision
  // for a reader who is deciding whether the gate is sufficient — not the message, which travels
  // to everyone else.**
  const reason = admissible
    ? `admissible: all ${judged} governance-triad leg(s) judged. `
      + 'The basis is presence review, not soundness (D-019).'
    : `not admissible: ${unjudged} of ${legs.length} governance-triad leg(s) did not judge — `
      + legs.filter((l) => l.disposition !== 'judged').map((l) => `${l.stage} (${l.disposition})`).join(', ');

  return { admissible, basis: 'governance-triad', legs, judged, unjudged, reason };
}
