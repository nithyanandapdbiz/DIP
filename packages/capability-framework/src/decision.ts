/**
 * Canonical Decision Engine — ADR-0040 Wave 3 (PCT-DECISION).
 *
 * The single deterministic decision service every capability consumes. It ANSWERS
 * questions; it does not execute work, sequence stages, invoke domains, own the
 * lifecycle or bypass orchestration (G-6). It returns immutable Decision Objects
 * that the frozen twelve-stage pipeline consumes.
 *
 * DETERMINISM. Given identical inputs it always returns identical decisions — no
 * randomness, no hidden state, no time-based or environment-dependent behaviour.
 *
 * AI IS ADVISORY ONLY. An AI recommendation competes at exactly one precedence
 * tier (ai-recommendation) and never overrides a higher tier; the engine always
 * owns the final decision, and the recommendation is recorded SEPARATELY on the
 * Decision Object, never conflated with it.
 *
 * PRECEDENCE (highest first): platform-governance > security > tenant-configuration
 * > capability-configuration > ai-recommendation > platform-default. A lower tier
 * never overrides a higher one.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 13-ai-operating-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-DECISION · deterministic + AI-advisory (G-6) · capability-neutral (G-16)
 */
import type { ExecutionContext } from './execution-context.js';

export const DECISION_TYPES = [
  'connector-resolution', 'authentication-strategy', 'application-strategy', 'capability-strategy',
  'execution-strategy', 'retry-strategy', 'evidence-strategy', 'reporting-strategy',
  'repository-strategy', 'automation-strategy',
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

/** Precedence, highest first (index 0 = highest). A lower tier never overrides a higher one. */
export const RULE_PRECEDENCE = [
  'platform-governance', 'security', 'tenant-configuration', 'capability-configuration',
  'ai-recommendation', 'platform-default',
] as const;
export type RuleSource = (typeof RULE_PRECEDENCE)[number];

export interface DecisionRule { readonly source: RuleSource; readonly type: DecisionType; readonly selects: string; }

export interface AiRecommendation {
  readonly type: DecisionType;
  readonly recommends: string;
  readonly confidence: number;
  readonly rationale: string;
}

export interface DecisionRequest {
  readonly type: DecisionType;
  readonly candidates: readonly string[];
  readonly rules: readonly DecisionRule[];
  readonly aiRecommendation: AiRecommendation | null;
  readonly context: ExecutionContext;
  readonly traceId: string;
}

export interface DecisionObject {
  readonly decisionId: string;
  readonly type: DecisionType;
  readonly selectedStrategy: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly deterministic: true;
  readonly traceId: string;
  readonly ruleSource: RuleSource;
  /** The AI recommendation, recorded separately — never the decider above its tier. */
  readonly aiRecommendation: AiRecommendation | null;
}

export const DECISION_ENGINE_VERSION = '1.0.0';

export interface DecisionEngine {
  decide(request: DecisionRequest): DecisionObject;
}

function precedenceOf(source: RuleSource): number {
  return RULE_PRECEDENCE.indexOf(source);
}

/**
 * Construct the deterministic decision engine. Pure: it reads its request and
 * returns a frozen Decision Object; it holds no state between calls.
 */
export function createDecisionEngine(): DecisionEngine {
  return {
    decide(request: DecisionRequest): DecisionObject {
      // Candidate-valid rules for this decision type. The AI recommendation joins
      // as a rule at its own tier (ai-recommendation) — never higher.
      const pool: DecisionRule[] = request.rules
        .filter((r) => r.type === request.type && request.candidates.includes(r.selects))
        .map((r) => ({ source: r.source, type: r.type, selects: r.selects }));
      if (request.aiRecommendation && request.candidates.includes(request.aiRecommendation.recommends)) {
        pool.push({ source: 'ai-recommendation', type: request.type, selects: request.aiRecommendation.recommends });
      }
      // Deterministic ordering: by precedence, then lexicographically by strategy.
      pool.sort((a, b) => precedenceOf(a.source) - precedenceOf(b.source) || (a.selects < b.selects ? -1 : a.selects > b.selects ? 1 : 0));

      const winner = pool[0];
      const fallback = [...request.candidates].sort()[0] ?? '';
      const selectedStrategy = winner ? winner.selects : fallback;
      const ruleSource: RuleSource = winner ? winner.source : 'platform-default';
      const confidence = winner && winner.source === 'ai-recommendation' && request.aiRecommendation
        ? request.aiRecommendation.confidence
        : 1;
      const decisionId = 'decision:' + request.type + ':' + request.traceId + ':' + selectedStrategy;
      const rationale = winner
        ? 'selected by ' + ruleSource + ' among ' + request.candidates.length + ' candidate(s)'
        : 'no rule applied; deterministic platform default';
      const evidence = pool.map((r) => r.source + '->' + r.selects);

      const decision: DecisionObject = {
        decisionId,
        type: request.type,
        selectedStrategy,
        rationale,
        confidence,
        evidence: Object.freeze(evidence),
        deterministic: true,
        traceId: request.traceId,
        ruleSource,
        aiRecommendation: request.aiRecommendation,
      };
      return Object.freeze(decision);
    },
  };
}
