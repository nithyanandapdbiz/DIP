/**
 * Reasoning mode — one workflow, two modes, selected by configuration.
 *
 * TRACEABILITY
 *   Architecture : 13-ai-operating-model.md · 15-configuration-model.md
 *   ADR          : ADR-0023 (Discovery Flow Engine internal structure) · ADR-0016
 *   Criteria     : C-13.1 (AI proposes; code decides)
 *                  C-11.11 (no framework code branches on a capability identity)
 *   Invariants   : INV-7 (the platform functions with reasoning unavailable)
 *                  INV-9 / Rule 12 (vendor neutrality)
 *
 * WHY THIS IS A GATE ON PROPOSALS AND NOT A SECOND WORKFLOW.
 * The brief asks for an AI mode and a non-AI mode with an identical workflow. The
 * obvious implementation — branch per stage on a flag — produces two workflows that
 * drift apart within a release, and R-12.18 forbids the second one.
 *
 * The implementation here is the opposite of a branch. Every agent already receives its
 * reasoning as a *proposal input* and already has deterministic decision logic that must
 * work when the proposal is `null` (INV-7). Disabling reasoning therefore requires no
 * new code path at all: it withholds the proposals. The same stages run, the same agents
 * run, in the same order, and every agent takes the degraded path it was always required
 * to have.
 *
 * That is why the two modes cannot diverge — there is nothing to diverge. A stage cannot
 * "support only AI mode" because a stage never learns which mode it is in.
 *
 * THE KEY IS GENERIC ON PURPOSE.
 * `ai.enabled` is not `discovery.aiEnabled`. Framework code that read a capability's own
 * configuration key would be branching on a capability identity, which C-11.11 forbids.
 * A capability translates its own configuration surface onto this key.
 */
import type { AgentContext } from './agent.js';

export type ReasoningMode = 'enabled' | 'disabled';

/** The generic configuration key. Capability-neutral by construction (C-11.11). */
export const REASONING_KEY = 'ai.enabled';

/**
 * Resolve the mode from configuration.
 *
 * Anything that is not exactly `true` is disabled. Reasoning is opt-in because the
 * failure of a misread flag should be the deterministic engine, never an unintended
 * call to a reasoning provider on customer-derived input.
 */
export function resolveReasoningMode(configuration: Readonly<Record<string, string>>): ReasoningMode {
  return (configuration[REASONING_KEY] ?? '').trim().toLowerCase() === 'true' ? 'enabled' : 'disabled';
}

/** Supplies a reasoning proposal for an agent, or `null` where there is none. */
export interface ProposalSource {
  for(agentId: string): unknown | null;
}

export const NO_PROPOSALS: ProposalSource = { for: () => null };

/** Build a source from a plain record, which is how tests and callers supply proposals. */
export function proposalsFrom(map: Readonly<Record<string, unknown>>): ProposalSource {
  return { for: (agentId) => (agentId in map ? map[agentId] : null) };
}

/**
 * What a gated run observed.
 *
 * `withheld` is the measurement that makes non-AI mode provable rather than asserted: a
 * conformance run asserts that a disabled run delivered zero proposals and still
 * completed every stage.
 */
export interface ReasoningLedger {
  readonly mode: ReasoningMode;
  readonly delivered: readonly string[];
  readonly withheld: readonly string[];
}

export interface GatedProposals {
  readonly source: ProposalSource;
  readonly ledger: () => ReasoningLedger;
}

/**
 * Gate a proposal source by mode.
 *
 * In `disabled` mode every request returns `null` and is recorded as withheld. The agent
 * is not told why, and must not be: an agent that could detect the mode could branch on
 * it, and the two workflows would begin to separate at that point.
 */
export function gateProposals(mode: ReasoningMode, source: ProposalSource): GatedProposals {
  const delivered: string[] = [];
  const withheld: string[] = [];

  return {
    source: {
      for(agentId: string): unknown | null {
        if (mode === 'disabled') {
          withheld.push(agentId);
          return null;
        }
        const proposal = source.for(agentId);
        // A missing proposal in enabled mode is withheld too. Reasoning being switched
        // on does not mean every agent received an answer, and recording it as delivered
        // would overstate what the run actually had available.
        (proposal === null || proposal === undefined ? withheld : delivered).push(agentId);
        return proposal ?? null;
      },
    },
    ledger: () => ({ mode, delivered: [...delivered], withheld: [...withheld] }),
  };
}

/**
 * Records which agents actually ran, by observing invocation audit events.
 *
 * This exists because of a measured defect in the first capability built on this
 * framework: its stages hand-wrote the list of agents they claimed to have invoked, and
 * two of those lists named agents that were never called. `agentsInvoked` is part of a
 * SEALED stage result and is read as evidence, so a hand-written list is an assertion
 * occupying an evidence field — which is Rule 13 inverted.
 *
 * Here the list is derived from what the catalogue emitted when it ran an agent. A stage
 * cannot name an agent it did not invoke, because the stage does not write the list.
 */
export interface InvocationRecorder {
  readonly context: (base: Omit<AgentContext, 'proposal'>, agentId: string) => AgentContext;
  readonly invoked: () => readonly string[];
}

export function invocationRecorder(proposals: ProposalSource): InvocationRecorder {
  const seen: string[] = [];
  return {
    context(base, agentId) {
      return {
        ...base,
        proposal: proposals.for(agentId),
        audit: (event, detail) => {
          // The catalogue emits `agent.<id>.invoked` on every attempt. That event is
          // the observation; everything else is narrative.
          const match = /^agent\.(.+)\.invoked$/.exec(event);
          if (match?.[1] && !seen.includes(match[1])) seen.push(match[1]);
          base.audit(event, detail);
        },
      };
    },
    invoked: () => [...seen],
  };
}
