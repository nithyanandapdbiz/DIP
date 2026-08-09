/**
 * Certification gates — nothing progresses without certification.
 *
 * TRACEABILITY
 *   Architecture : 18-governance-model.md · 12-capability-orchestration.md §5
 *   ADR          : ADR-0022 · ADR-0019 (evidence over assertion)
 *   Criteria     : C-11.13 (no capability bypasses the three Review stages)
 *                  C-12.11 (no verdict is emitted in a degraded state)
 *
 * THE NINE GATES MAP ONTO STAGES. THEY DO NOT ADD A SECOND GOVERNANCE MODEL.
 * Story Certified, Test Certified, Automation Certified and the rest are names for
 * conditions the twelve-stage lifecycle already enforces at stage boundaries. Binding
 * them to stages rather than implementing them separately is what keeps one governance
 * model rather than two that must be kept in agreement.
 *
 * WHY NINE AND NOT EIGHT (ADR-0076 §4.1.1, TECHNICAL_DEBT.md D-066).
 * There were eight, and `architecture-review` was in none of them. The triad was checked
 * for PRESENCE below — R-12.2, no capability bypasses stages 4-6 — and then the verdict
 * loop iterated the gates, which reached stages 5 and 6 and never stage 4. So stage 4
 * could do its work, seal a refusal, and the run certified: measured through the real
 * runner as `outcome=refused, certified=true, firstRefusal=null`, and identically for
 * `notApplicable`, which is how it is known the gap predated ADR-0071 rather than being
 * created by it. **Presence is not a verdict. A stage nothing reads is a stage that
 * cannot refuse, whatever vocabulary it has.**
 *
 * A VERDICT IS DETERMINISTIC AND CARRIES ITS REASON.
 * `certified: false` without a reason is indistinguishable from a crash, and during an
 * incident that difference is the whole diagnosis. A gate that cannot say why it
 * refused has not refused — it has failed.
 */
import type { StageName, StageResult } from './stages.js';
import { GOVERNANCE_TRIAD } from './stages.js';

export const CERTIFICATION_GATES = [
  // FIRST, because the list is an ORDER and not a set — `progressedTo` reads it as a
  // progression, and stage 4 precedes stages 5 and 6. Placing it anywhere else would let a
  // run be story-certified while its architecture review was still refusing.
  'architecture-certified',
  'story-certified',
  'test-certified',
  'automation-certified',
  'execution-certified',
  'healing-certified',
  'defect-certified',
  'reporting-certified',
  'release-certified',
] as const;

export type CertificationGate = (typeof CERTIFICATION_GATES)[number];

/** Which stage's completion each gate is a verdict about. */
export const GATE_STAGE: Readonly<Record<CertificationGate, StageName>> = {
  'architecture-certified': 'architecture-review',
  'story-certified': 'policy-review',
  'test-certified': 'guardrail-review',
  'automation-certified': 'execution-planning',
  'execution-certified': 'execution',
  'healing-certified': 'reflection',
  'defect-certified': 'reflection',
  'reporting-certified': 'reporting',
  'release-certified': 'certification',
};

/**
 * WHY A VERDICT IS NOT CERTIFIED, AS A VALUE RATHER THAN AS PROSE.
 *
 * `certified: false` covers four different facts — the stage did not run, it did no work, it did
 * its work and objected, or the gate had no stage. Before this type existed the four were
 * distinguishable only by READING `reason`, which is a message and not a value: a consumer that
 * needed the distinction had to parse the sentence a producer happened to write.
 *
 * ADR-0082's publication gate needs exactly this distinction and needs it mechanically — CHARTER
 * §17.1's `NOT MEASURED` is never a pass, and a gate that cannot tell "reviewed and approved" from
 * "there was nothing to review" cannot honour that rule. Deriving it from prose would be D-013's
 * shape: a message asserting a state the value does not carry.
 */
export type VerdictDisposition =
  /** The stage did its work and the gate is satisfied. */
  | 'judged'
  /** The stage legitimately did no work. NOT an approval, and never counted as one. */
  | 'not-applicable'
  /** The stage did its work and said no (ADR-0071). */
  | 'refused'
  /** The stage did not run at all. */
  | 'absent';

export interface Verdict {
  readonly gate: CertificationGate;
  readonly certified: boolean;
  /** WHY, as a value. `certified === (disposition === 'judged')` by construction. */
  readonly disposition: VerdictDisposition;
  /** Always present. A refusal without a reason has failed, not refused. */
  readonly reason: string;
  readonly stage: StageName;
}

export interface CertificationOutcome {
  readonly verdicts: readonly Verdict[];
  readonly certified: boolean;
  readonly firstRefusal: Verdict | null;
}

/**
 * Render verdicts from a completed run.
 *
 * Reads the SEALED stage results. A gate cannot be satisfied by an assertion that a
 * stage ran — only by the result that stage produced, which cannot be forged.
 */
export function certify(
  results: ReadonlyMap<StageName, StageResult<StageName, unknown>>,
): CertificationOutcome {
  const verdicts: Verdict[] = [];

  // The governance triad first. R-12.2: no capability may bypass stages 4, 5 and 6,
  // and a run missing any of them is refused before any other gate is considered.
  const missingTriad = GOVERNANCE_TRIAD.filter((s) => !results.has(s));
  if (missingTriad.length > 0) {
    return {
      verdicts: [{
        gate: 'release-certified',
        certified: false,
        disposition: 'absent',
        reason: `the governance triad was not traversed: ${missingTriad.join(', ')} (R-12.2)`,
        stage: 'certification',
      }],
      certified: false,
      firstRefusal: null,
    };
  }

  for (const gate of CERTIFICATION_GATES) {
    const stage = GATE_STAGE[gate];
    const result = results.get(stage);

    if (!result) {
      verdicts.push({ gate, certified: false, disposition: 'absent', reason: `stage "${stage}" did not run`, stage });
      continue;
    }
    if (result.outcome === 'refused') {
      // THE STAGE DID ITS WORK AND SAID NO (ADR-0071). Reported distinctly from
      // not-applicable, because "the review failed" and "there was nothing to review" are
      // different facts and a reader acting on them would act differently. Before this branch
      // existed, a stage could only decline by claiming it had done no work, and a governance
      // triad that had done its work and objected was indistinguishable from one that had
      // nothing to look at (TECHNICAL_DEBT.md D-019).
      verdicts.push({
        gate, certified: false, stage, disposition: 'refused',
        reason: `refused: ${result.reason ?? 'no reason recorded'}`,
      });
      continue;
    }
    if (result.outcome === 'not-applicable') {
      // NOT APPLICABLE IS NOT CERTIFIED, and it is not a failure either. A stage that
      // legitimately did no work has produced nothing to certify, and recording it as
      // certified would be certifying an absence.
      verdicts.push({
        gate, certified: false, stage, disposition: 'not-applicable',
        reason: `not applicable: ${result.reason ?? 'no reason recorded'}`,
      });
      continue;
    }
    verdicts.push({
      gate, certified: true, stage, disposition: 'judged',
      reason: `stage "${stage}" completed with ${result.agentsInvoked.length} agent(s)`,
    });
  }

  const firstRefusal = verdicts.find((v) => !v.certified) ?? null;
  return { verdicts, certified: firstRefusal === null, firstRefusal };
}

/**
 * Does the run reach a gate?
 *
 * Progression is checked against the ORDER of the gates: a run cannot be
 * automation-certified while story certification was refused. "Nothing progresses
 * without certification" is this function, and it is why the gates are an ordered list
 * rather than a set.
 *
 * THIS IS A PROGRESSION OVER CERTIFICATIONS, NOT OVER STAGES, AND THE TWO DIVERGE.
 * The gate order mostly tracks the stage order and does NOT have to. The last pair is
 * the standing counter-example: `reporting-certified` binds to stage 12 (Reporting) and
 * `release-certified` binds to stage 11 (Certification), so the final gate reads an
 * EARLIER stage than the one before it. That is deliberate — release certification is
 * the AGGREGATE verdict and is last because everything else must hold before it, not
 * because of where it is rendered.
 *
 * Stated here rather than left to be inferred, because it is inferable wrongly: an
 * assertion that "gate order mirrors stage order" was written against this list during
 * ADR-0076 §6 B1, looked obviously true, and failed on exactly that pair. The property
 * that DOES hold, and which ADR-0076 relies on when it places `architecture-certified`
 * first, is narrower: **the governance triad's three gates come first, in stage order,
 * ahead of every other gate** — so no run is story-certified while its architecture
 * review is still refusing. `framework.test.ts` asserts that narrower property.
 */
export function progressedTo(outcome: CertificationOutcome, gate: CertificationGate): boolean {
  const index = CERTIFICATION_GATES.indexOf(gate);
  return CERTIFICATION_GATES.slice(0, index + 1)
    .every((g) => outcome.verdicts.find((v) => v.gate === g)?.certified === true);
}
