/**
 * Governance agents — three per stage, thirty-six in total.
 *
 * TRACEABILITY
 *   Architecture : 18-governance-model.md · 12-capability-orchestration.md
 *   ADR          : ADR-0028
 *   Criteria     : C-11.13 (no capability bypasses the three Review stages)
 *                  C-12.11 (no verdict is emitted in a degraded state)
 *
 * REVIEW FINDS. DECISION ACTS. CERTIFICATION RULES.
 * A review that could act on its findings could excuse them; a certifier that could add a
 * finding could manufacture grounds for a refusal it wanted. The three are separate agents,
 * each denied the power that would let it cover for the previous one (ADR-0023 §3.3, which
 * this engine inherits rather than restates).
 *
 * These agents are wholly deterministic (aiCapabilityClass: none). Governance never asks a
 * reasoning provider whether to certify — a certification that depends on an external model
 * is not a control (C-13.1).
 */
import { defineAgent, STAGES, type AgentDefinition, type ReviewFinding, type StageName } from '@dbiz/capability-framework';

export interface StageRule {
  readonly stage: StageName;
  readonly what: string;
}

export const STAGE_RULES: readonly StageRule[] = STAGES.map((stage) => ({
  stage,
  what: `review, decide and certify the ${stage} stage output against the security requirement model`,
}));

type Subject = Record<string, unknown>;

/**
 * The deterministic review rules. Every field the stages place on their `subject` that
 * represents a refusal or a boundary violation becomes a blocking finding here — which is
 * how an intrusive category, a non-read-only request, or a missing authorization stops the
 * run at the guardrail stage before any check executes (ADR-0028 §4, the capability-5/6
 * boundary enforcement).
 */
export function reviewSubject(subject: unknown): readonly ReviewFinding[] {
  const s = (subject ?? {}) as Subject;
  const out: ReviewFinding[] = [];
  const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

  if (s['certified'] === false) {
    out.push({ severity: 'blocking', subject: 'certification', finding: 'stage produced an uncertified authorization or guardrail state' });
  }
  for (const r of asArray(s['refusals'])) {
    out.push({ severity: 'blocking', subject: 'guardrail', finding: r });
  }
  if (s['intrusiveRequested'] === true) {
    out.push({ severity: 'blocking', subject: 'scope', finding: 'an intrusive/exploitation category was requested; active exploitation is capability 6 (Penetration Testing Engine), not capability 5' });
  }
  if (s['readOnlyViolated'] === true) {
    out.push({ severity: 'blocking', subject: 'guardrail', finding: 'security verification must be read-only; a state-changing mode was requested' });
  }
  if (s['missingAuthorization'] === true) {
    out.push({ severity: 'blocking', subject: 'scope', finding: 'no authorization reference supplied; verification is not authorized' });
  }
  if (s['httpsViolated'] === true) {
    out.push({ severity: 'advisory', subject: 'scope', finding: 'a non-HTTPS host was observed in scope' });
  }
  const open = typeof s['openRequirements'] === 'number' ? (s['openRequirements'] as number) : 0;
  if (open > 0) {
    out.push({ severity: 'advisory', subject: 'requirements', finding: `${open} security requirement(s) not yet fully verified` });
  }
  return out;
}

function reviewAgent(stage: StageName): AgentDefinition<{ subject: unknown }, readonly ReviewFinding[]> {
  return defineAgent<{ subject: unknown }, readonly ReviewFinding[]>({
    id: `governance.${stage}.review`,
    domain: 'governance',
    purpose: `Review the ${stage} stage output and produce findings without acting on them.`,
    stage, plane: 'IP',
    inputs: ['the minimised stage subject'],
    outputs: ['review findings, blocking or advisory'],
    responsibilities: ['detect refusals, boundary violations and unmet requirements', 'never act on its own findings'],
    toolContracts: [],
    aiCapabilityClass: 'none',
    failureHandling: 'a review that throws fails the stage closed; an unreviewable subject is a blocking finding, never a pass',
    handle: (input) => reviewSubject(input.subject),
  });
}

function decisionAgent(stage: StageName): AgentDefinition<{ subject: unknown; findings: readonly ReviewFinding[] }, { accept: boolean; rejected: readonly { subject: string; reason: string }[] }> {
  return defineAgent<{ subject: unknown; findings: readonly ReviewFinding[] }, { accept: boolean; rejected: readonly { subject: string; reason: string }[] }>({
    id: `governance.${stage}.decision`,
    domain: 'governance',
    purpose: `Decide the ${stage} stage output from the review findings, never around them.`,
    stage, plane: 'IP',
    inputs: ['the stage subject', 'the review findings'],
    outputs: ['an accept/reject decision with the rejected subjects and reasons'],
    responsibilities: ['reject on any blocking finding', 'accept only what review did not block'],
    toolContracts: [],
    aiCapabilityClass: 'none',
    failureHandling: 'a decision that throws fails the stage closed; it cannot invent a finding it was not given',
    handle: (input) => {
      const blocking = input.findings.filter((f) => f.severity === 'blocking');
      return {
        accept: blocking.length === 0,
        rejected: blocking.map((f) => ({ subject: f.subject, reason: f.finding })),
      };
    },
  });
}

function certificationAgent(stage: StageName): AgentDefinition<{ accept: boolean; findings: readonly ReviewFinding[]; accepted: number }, { certified: boolean; reason: string }> {
  return defineAgent<{ accept: boolean; findings: readonly ReviewFinding[]; accepted: number }, { certified: boolean; reason: string }>({
    id: `governance.${stage}.certification`,
    domain: 'governance',
    purpose: `Certify or refuse the ${stage} stage — the only agent that can stop the run.`,
    stage, plane: 'IP',
    inputs: ['the decision', 'the review findings', 'the accepted count'],
    outputs: ['a certification verdict with a stated reason'],
    responsibilities: ['refuse on any blocking finding', 'never certify without a stated reason'],
    toolContracts: [],
    aiCapabilityClass: 'none',
    failureHandling: 'a certification that throws is treated as a refusal; silence is never a pass (NOT RUN == FAIL)',
    handle: (input) => {
      const blocking = input.findings.filter((f) => f.severity === 'blocking');
      if (blocking.length > 0) {
        return { certified: false, reason: `${blocking.length} blocking finding(s): ${blocking.map((f) => `${f.subject}: ${f.finding}`).join('; ')}` };
      }
      if (!input.accept) {
        return { certified: false, reason: 'decision did not accept the stage output' };
      }
      return { certified: true, reason: `${stage} certified: ${input.accepted} accepted, ${input.findings.length} advisory finding(s), no blocking findings` };
    },
  });
}

export const governanceAgents: readonly AgentDefinition<never, unknown>[] = STAGES.flatMap((stage) => [
  reviewAgent(stage) as unknown as AgentDefinition<never, unknown>,
  decisionAgent(stage) as unknown as AgentDefinition<never, unknown>,
  certificationAgent(stage) as unknown as AgentDefinition<never, unknown>,
]);
