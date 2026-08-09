/**
 * The four-phase stage pipeline — execute, review, decide, certify.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0023
 *   Criteria     : C-11.13 (no capability bypasses review)
 *                  C-12.11 (no verdict is emitted in a degraded state)
 *                  C-12.12 (a stage that does no work says so, with a reason)
 *   Rules        : R-13.x (evidence over assertion)
 *
 * "NOTHING PROGRESSES UNLESS CERTIFIED" IS THIS FILE.
 *
 * A stage that ends with `if (!certified) log(...)` has a review in it and no gate. The
 * pipeline makes refusal the only exit: an uncertified phase throws, the stage runner
 * records the failure, and the run stops with the reason attached. There is no argument
 * that skips certification and no flag that downgrades it to a warning — adding one
 * would reintroduce exactly the bypass the sealed stage result removed.
 *
 * WHY REVIEW AND DECISION ARE SEPARATE PHASES.
 * A review that also decides is a review that can excuse its own findings. Here, review
 * produces findings and cannot act on them; decision acts and cannot invent a finding it
 * was not given; certification reads both and can refuse either. Each phase is denied
 * the power that would let it cover for the previous one.
 *
 * WHY THE AGENT LIST IS NOT A PARAMETER.
 * `agentsInvoked` on a sealed stage result is read as evidence. The first capability
 * built on this framework hand-wrote those lists and two of them named agents that never
 * ran. The pipeline takes an `InvocationRecorder` instead and reads what the catalogue
 * actually emitted, so a stage cannot claim an agent it did not invoke.
 */
import type { StageName } from './stages.js';
import type { InvocationRecorder } from './reasoning.js';

/** A finding from the review phase. Findings do not act; they are acted upon. */
export interface ReviewFinding {
  readonly severity: 'blocking' | 'advisory';
  readonly subject: string;
  readonly finding: string;
}

/** The decision phase's output: what survives review, and what was dropped and why. */
export interface PhaseDecision<T> {
  readonly accepted: T;
  readonly rejected: readonly { readonly subject: string; readonly reason: string }[];
}

export interface PhaseCertification {
  readonly certified: boolean;
  /** Always present, certified or not. A verdict without a reason has failed, not ruled. */
  readonly reason: string;
}

export class StageNotCertifiedError extends Error {
  constructor(
    public readonly stage: StageName,
    public readonly phase: string,
    public readonly reason: string,
    public readonly findings: readonly ReviewFinding[],
  ) {
    super(`stage ${stage}: ${phase} was not certified — ${reason}`);
    this.name = 'StageNotCertifiedError';
  }
}

export interface StagePipelineSpec<X, T> {
  readonly stage: StageName;
  /** A name for the thing being gated. Appears in the refusal, so make it specific. */
  readonly phase: string;
  /** Execution agents. Produce the work. */
  execute(): X;
  /** Review agents. Produce findings. They cannot change the work. */
  review(executed: X): readonly ReviewFinding[];
  /** Decision agents. Accept, narrow or reject — from the findings, not around them. */
  decide(executed: X, findings: readonly ReviewFinding[]): PhaseDecision<T>;
  /** Certification agents. The only phase that can stop the run. */
  certifyPhase(decision: PhaseDecision<T>, findings: readonly ReviewFinding[]): PhaseCertification;
}

export interface PhaseOutcome<T> {
  readonly phase: string;
  readonly accepted: T;
  readonly findings: readonly ReviewFinding[];
  readonly rejected: readonly { readonly subject: string; readonly reason: string }[];
  readonly certification: PhaseCertification;
}

/**
 * Run one gated phase.
 *
 * Throws `StageNotCertifiedError` when certification refuses. The throw is the
 * mechanism: `runCapability` catches it, seals nothing, and returns a run that failed at
 * this stage with the reason. A refused phase therefore cannot produce a stage result,
 * and a stage result cannot exist for a phase that was refused.
 */
export function runPhase<X, T>(spec: StagePipelineSpec<X, T>): PhaseOutcome<T> {
  const executed = spec.execute();
  const findings = spec.review(executed);
  const decision = spec.decide(executed, findings);
  const certification = spec.certifyPhase(decision, findings);

  if (!certification.certified) {
    throw new StageNotCertifiedError(spec.stage, spec.phase, certification.reason, findings);
  }
  if (certification.reason.trim() === '') {
    // A certification that passes without saying why is indistinguishable from one that
    // was never evaluated, and it is the first thing to become a rubber stamp.
    throw new StageNotCertifiedError(spec.stage, spec.phase, 'certified without a stated reason', findings);
  }

  return {
    phase: spec.phase,
    accepted: decision.accepted,
    findings,
    rejected: decision.rejected,
    certification,
  };
}

/**
 * A blocking finding refuses; advisory findings are recorded and pass.
 *
 * Offered because it is the correct default and writing it per stage invites the variant
 * that treats "blocking" as advisory when a release is due.
 */
export function certifyOnNoBlockingFindings(
  subject: string,
  findings: readonly ReviewFinding[],
  accepted: number,
): PhaseCertification {
  const blocking = findings.filter((f) => f.severity === 'blocking');
  if (blocking.length > 0) {
    return {
      certified: false,
      reason: `${blocking.length} blocking finding(s): ${blocking.map((f) => `${f.subject}: ${f.finding}`).join('; ')}`,
    };
  }
  return {
    certified: true,
    reason: `${subject}: ${accepted} accepted, ${findings.length} advisory finding(s), no blocking findings`,
  };
}

/** The agents a recorder observed. Convenience so stages never build the list by hand. */
export function observedAgents(recorder: InvocationRecorder): readonly string[] {
  return recorder.invoked();
}
