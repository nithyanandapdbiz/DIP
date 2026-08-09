/**
 * The agent contract — what every specialised agent must declare and do.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md · 12-capability-orchestration.md
 *                  13-ai-operating-model.md (AI Capability Classes) · 16-runtime-model.md
 *   ADR          : ADR-0022 · ADR-0016 (AI tool agnosticism)
 *   Criteria     : C-13.1 (AI proposes; code decides)
 *                  C-11.11 (no framework code branches on a capability identity)
 *   Rules        : R-11.16 (no stage stubbed to a no-op) · R-16.34 (telemetry carries
 *                  identifiers and outcomes, never payloads)
 *
 * AI PROPOSES. CODE DECIDES.
 * An agent that needs reasoning declares an **AI Capability Class** (document 13) and
 * receives a *proposal*. The agent's own code is the deterministic decision logic that
 * accepts, rejects or narrows it. No agent calls a named provider, and no agent's
 * behaviour depends on which provider answered — INV-9 and Rule 12.
 *
 * That is also what makes ~100 agents testable without an AI provider: every agent has
 * real executable decision logic, and the proposal is an input like any other. An agent
 * whose only behaviour is "ask the model and return the answer" would be a stub with a
 * network call, and it would satisfy nothing.
 *
 * EVERY AGENT DECLARES ITS OWNERSHIP.
 * `plane` is not documentation. The conformance gate reads it and fails a catalogue
 * that places customer source, evidence or credentials in the Intelligence Plane.
 */
import type { StageName } from './stages.js';

/** Reasoning classes from document 13. Capability, never a product name (Rule 12). */
export type AiCapabilityClass =
  | 'none'
  | 'extraction'
  | 'classification'
  | 'generation'
  | 'summarisation'
  | 'ranking'
  | 'reconciliation';

export type AgentPlane = 'IP' | 'EP';

export interface RetryPolicy {
  readonly maxAttempts: number;
  /** Retrying a deterministic failure just fails more slowly. */
  readonly retryOn: 'transient' | 'never';
}

/**
 * A prompt contract — what an agent asks reasoning for, and how it refuses the answer.
 *
 * `rejectionRules` is the load-bearing field, and the reason this type exists at all.
 * A prompt contract that declared only an intent and an output shape would document a
 * request; it would say nothing about C-13.1, which requires the agent's own code to
 * decide. An agent that cannot state a condition under which it rejects a proposal is
 * an agent that returns whatever it was handed — and registration refuses it.
 *
 * `inputsProvided` is read by the sovereignty check: an agent may not name customer
 * source, credentials or evidence artefacts among what it sends for reasoning.
 */
export interface PromptContract {
  /** The reasoning being requested, in capability terms — never a provider or product. */
  readonly intent: string;
  /** What is handed to reasoning. Identifiers, structure and derived text only. */
  readonly inputsProvided: readonly string[];
  /** The shape the agent expects back, as a description its own code validates. */
  readonly expects: string;
  /** Conditions under which the agent's code REJECTS the proposal. Never empty. */
  readonly rejectionRules: readonly string[];
}

export interface AgentDefinition<I = unknown, O = unknown> {
  readonly id: string;
  readonly domain: string;
  readonly purpose: string;
  readonly stage: StageName;
  /** Which plane executes it. Read by the conformance gate, not decorative. */
  readonly plane: AgentPlane;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly responsibilities: readonly string[];
  /**
   * The adapter SPIs through which this agent's INPUT REACHED IT — whether or not this
   * agent's own handle performs the call. Empty for pure reasoning or computation over
   * values the composition already held.
   *
   * RULED BY ADR-0076 §4.2, AND THE PREVIOUS WORDING WAS A THIRD READING NOBODY USED.
   * It read *"Adapter SPIs this agent needs"* — which is neither of the two meanings in live
   * use: *"this handle calls that SPI"* and *"this run's data came through that SPI"*. An
   * agent can need an SPI's output without calling it and without that call being how the
   * data arrived, so the definition site was describing a third thing while 144 agents
   * declared one of the other two (`TECHNICAL_DEBT.md` D-058).
   *
   * WHY THE DEPENDENCY READING WON. It is the only one D-045's repair does not falsify:
   * that repair moved reads out of agents and into the composition, so under the "this
   * handle calls it" reading **every agent D-045 improved became a liar as a side effect of
   * being fixed.** A meaning that a correct repair falsifies is the wrong meaning. It also
   * makes `story.retrieval` TRUE rather than repaired — its story genuinely arrives through
   * `ProjectAdapter`; it simply does not make the call — and it is checkable without
   * per-agent call attribution, which is the criteria programme's most expensive item.
   *
   * A NAME HERE THAT MATCHES NO SPI TYPE IS WRONG UNDER EVERY READING, including this one.
   * Three such names are live (`CustomerFindingStore`, `EvidenceCustody`,
   * `TargetConnectivity`) and are NOT excused by this ruling — see D-058. The type is still
   * `readonly string[]` and cannot refuse them: ADR-0076 §4.2 item 9 called for narrowing it
   * to a union sourced from `CONNECTOR_SPI_DESCRIPTORS`, and that source was measured at
   * three entries against eleven names in live use, so the narrowing is owed a corrected
   * source rather than applied to the one the ADR named (D-071).
   */
  readonly toolContracts: readonly string[];
  /** The reasoning class, or `none` for a wholly deterministic agent. */
  readonly aiCapabilityClass: AiCapabilityClass;
  /**
   * Required when `aiCapabilityClass` is not `none`; refused when it is.
   *
   * An agent that declares a reasoning class without a prompt contract has an
   * unreviewable request to a model in it. An agent that declares a prompt contract
   * without a reasoning class has one that is never used.
   */
  readonly promptContract?: PromptContract;
  /**
   * What the agent does differently when reasoning IS available, and when it is not.
   *
   * Both are required of a reasoning agent because the platform runs in both modes and
   * the difference must be stated rather than discovered. INV-7: a capability that
   * cannot describe its degraded behaviour has not been designed to degrade.
   */
  readonly aiBehaviour?: string;
  readonly nonAiBehaviour?: string;
  readonly retry: RetryPolicy;
  /** What happens when it fails. Never "log and continue". */
  readonly failureHandling: string;
  /** Telemetry emitted. Identifiers and outcomes only (R-16.34). */
  readonly telemetry: readonly string[];
  readonly auditEvents: readonly string[];
  /**
   * WHICH OF ITS DOMAIN'S CERTIFICATION CRITERIA THIS AGENT EVIDENCES (Section F1).
   *
   * Thirteen `DomainContract`s declare 109 certification criteria between them and **not one is
   * evidenced on any result** — nothing in the canonical runtime compares a declaration to
   * behaviour (TECHNICAL_DEBT.md D-015). Criteria are evidenced by the work that satisfies them,
   * and that work is an agent's.
   *
   * OPTIONAL IS A MIGRATION STATE, NOT A DESIGN PROPERTY, AND IT HAS A SCHEDULED END.
   *
   * It is optional so that all 144 existing agents keep compiling and none is presumed to have
   * contributed.
   *
   * **THE SCHEDULED TRANSITION TO REQUIRED IS WITHDRAWN ON EVIDENCE (2026-08-04), not deferred.**
   * It rested on the premise that agents evidence criteria. Reading all 109 found that **none is
   * agent-evidenceable**: ~51 are structural properties of a domain's own function, ~28 are
   * ABSENCES that no actor can evidence by acting, and ~30 are facts established at the
   * composition boundary (`TECHNICAL_DEBT.md` D-038). **The end date is removed rather than
   * moved** — a postponement would leave a schedule attached to a plan that no longer exists.
   *
   * **This field is NOT a failed attempt at the criteria mechanism.** It remains the right shape
   * for an agent that evidences something about a domain, with `domainId` naming whose criterion
   * it is. There are simply very few such criteria among these 109, and the criteria mechanism
   * belongs at three other evidencers — see `program/CRITERIA_DESIGN_REPORT.md`.
   *
   * **Stated as a migration because an unqualified "optional" reads, in six months, as a
   * deliberate design choice rather than an unfinished one** — which is D-024's class arriving
   * through the back door: a declaration that describes an intention nobody is obliged to meet.
   *
   * ── EACH CONTRIBUTION NAMES ITS SUBJECT, AND THAT IS NOT DECORATION ──────────────────────
   *
   * The first draft of this field was `readonly string[]` — bare criterion names. **Measured
   * before the first agent used it: the thirteen domains declare 109 criterion INSTANCES under
   * only 35 distinct NAMES**, and sixteen names are shared. `decision-engine-consumed`,
   * `immutable-output` and `capability-neutral` are each declared by all thirteen.
   *
   * So a bare name cannot say WHOSE criterion was evidenced. An agent declaring
   * `'immutable-output'` would be saying nothing at all — one of thirteen, unspecified.
   *
   * **This is the pre-landing check applied to a field this platform had just written:** *does
   * this value say more than its producer is positioned to know?* Here it was the inverse and
   * the consequence identical — the value could not carry the fact it purported to. It was found
   * by measuring the criterion namespace rather than by using the field, which is the only order
   * in which it could have been found before 144 agents adopted it.
   *
   * **The subject matters most for the triad**, whose twenty agents review OTHER domains' work:
   * a `guardrail-review` agent evidences `test-design-intelligence`'s criteria, never its own.
   * A field without a subject would have made the reviewing agents the least expressible.
   */
  readonly certificationContributions?: readonly CertificationContribution[];
  /** The deterministic decision logic. This is what makes it an agent, not a record. */
  readonly handle: (input: I, ctx: AgentContext) => O;
}

/**
 * WHAT AN AGENT REPORTS — a finding, never a verdict.
 *
 * ── THE FOURTH BOUNDARY OF THE REACH-VERSUS-REFUSE RULE ──────────────────────────────────
 *
 * An agent says what it FOUND; the domain says what the run CONCLUDED. The distinction is the
 * same one defended at three boundaries already — stage (`notApplicable` vs `refused`),
 * publication (`absent` vs `published: false`), transport (unreachable vs refused) — and it is
 * defended here for a reason specific to this layer: **collapsing it would give 144 things the
 * power to stop a run.**
 *
 * So there is no `refuse` on this type and there will not be one. `evidenced: false` with a
 * reason is an agent's strongest statement. A domain reads its agents' outcomes and decides
 * whether its own `DomainOutput.certified` is false; a stage reads the domain and decides
 * whether to refuse. Each layer says only what it is positioned to know.
 *
 * ── THE THREE RULES THAT MAKE THIS NOT A SECOND LIFECYCLE (R-12.18) ──────────────────────
 *
 * The platform permits exactly one orchestration lifecycle: the twelve-stage runner. An agent
 * layer that sequences, retries, branches or gates is a second one regardless of what it is
 * called. Three rules keep this a composition rather than a lifecycle, and each is falsifiable:
 *
 *   1. NO AGENT INVOKES ANOTHER AGENT. Composition belongs to the domain, expressed in its
 *      `execute`. An agent calling an agent is a call graph, and a call graph with retries is a
 *      lifecycle.
 *   2. NO AGENT HAS A STAGE OF ITS OWN. `AgentDefinition.stage` names the TWELVE-STAGE stage its
 *      domain runs at. It does not create one.
 *   3. AN AGENT CANNOT REFUSE THE RUN — this type, above.
 */
/**
 * ONE CRITERION, ON ONE DOMAIN, EVIDENCED BY ONE AGENT.
 *
 * `domainId` is required because criterion names are not unique — 109 declared instances across
 * 35 names, sixteen of them shared, three declared by all thirteen domains. The pair is the
 * identity; the name alone is an ambiguity.
 */
export interface CertificationContribution {
  /** The domain whose criterion this is — NOT necessarily the agent's own domain. */
  readonly domainId: string;
  /** The criterion, as the domain's `certificationCriteria` declares it. */
  readonly criterion: string;
}

export interface AgentOutput<O> {
  readonly output: O;
  /**
   * Whether this agent's declared `certificationContributions` are satisfied BY THIS RUN.
   *
   * `true` with no contributions declared means "nothing to evidence and nothing went wrong" —
   * the honest reading for the majority of agents until criteria are attached.
   *
   * **AN ASSUMPTION INHERITED BY EVERY NON-ADOPTING AGENT, recorded rather than left implicit.**
   * Every agent that never opts in reports `evidenced: true` forever, **indistinguishable from
   * one that evidenced something successfully**. Defaulting to `false` was rejected because it
   * would make 144 agents report a failure they did not have — but the cost of the default is
   * that a later count of "evidenced agents" includes everything that never participated.
   * **Whoever counts must subtract the agents with no `certificationContributions`, or the number
   * measures adoption and reports correctness.**
   */
  readonly evidenced: boolean;
  /** Required when `evidenced` is false. An unevidenced criterion without a reason is a silence. */
  readonly reason: string | null;
}

export interface AgentContext {
  readonly tenantId: string;
  readonly runId: string;
  readonly correlationId: string;
  /**
   * A reasoning proposal, where the agent declared a capability class.
   *
   * `null` when no proposal was supplied — and the agent must still produce a correct
   * result, degraded if necessary. INV-7: the platform functions with reasoning
   * unavailable; an agent that cannot is a dependency on a provider, which Rule 12
   * forbids.
   */
  readonly proposal: unknown | null;
  readonly audit: (event: string, detail: string) => void;
  readonly telemetry: (metric: string, value: number) => void;
}

/**
 * What may never be named as an input to reasoning.
 *
 * The Intelligence Plane reasons over structure, identifiers and derived text. Source
 * code, credentials and captured evidence are Execution Plane custody (documents 06 and
 * 19), and an agent that sent one for reasoning would move it across the boundary
 * regardless of what the retention policy said afterwards.
 */
const FORBIDDEN_IN_PROMPT = [
  'source code', 'source-code', 'repository content', 'file content', 'file contents',
  'credential', 'secret', 'password', 'token value', 'screenshot', 'video',
  'har file', 'trace file', 'raw log', 'cookie value', 'session token',
] as const;

export class AgentError extends Error {
  constructor(public readonly agentId: string, message: string) {
    super(`agent ${agentId}: ${message}`);
    this.name = 'AgentError';
  }
}

export class AgentCatalogueError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`agent catalogue is invalid: ${problems.slice(0, 5).join('; ')}`);
    this.name = 'AgentCatalogueError';
  }
}

/**
 * The agent catalogue.
 *
 * Registration validates the FULL contract. An agent missing a retry policy or a
 * failure-handling statement is refused — those are the fields that get omitted first
 * and matter most during an incident.
 */
export class AgentCatalogue {
  private readonly agents = new Map<string, AgentDefinition<never, unknown>>();

  register(agent: AgentDefinition<never, unknown>): void {
    const problems: string[] = [];
    const need = (cond: boolean, what: string) => { if (!cond) problems.push(`${agent.id}: ${what}`); };

    need(Boolean(agent.id && /^[a-z0-9.-]+$/.test(agent.id)), 'identifier must be lowercase kebab/dot');
    need(agent.purpose.length > 15, 'purpose must state what it does');
    need(agent.inputs.length > 0, 'must declare inputs');
    need(agent.outputs.length > 0, 'must declare outputs');
    need(agent.responsibilities.length > 0, 'must declare responsibilities');
    need(agent.retry.maxAttempts >= 1, 'must declare a retry policy');
    need(agent.failureHandling.length > 15, 'must state how failure is handled');
    need(agent.telemetry.length > 0, 'must declare telemetry');
    need(agent.auditEvents.length > 0, 'must declare audit events');
    need(typeof agent.handle === 'function', 'must implement decision logic');
    // An agent with no parameters cannot consult its input or context, so it cannot
    // decide anything — the same no-op detection the stage registry applies.
    need(agent.handle.length > 0, 'decision logic takes no input and can decide nothing');

    // A reasoning agent declares HOW it uses reasoning and how it refuses it. This is
    // the check the Functional Testing Engine audit found absent: 42 agents declared a
    // capability class and none declared a contract, so nothing recorded what was sent
    // for reasoning or what would be rejected on return.
    if (agent.aiCapabilityClass !== 'none') {
      const pc = agent.promptContract;
      need(pc !== undefined, 'declares a reasoning class and must declare a prompt contract');
      if (pc) {
        need(pc.intent.length > 15, 'prompt contract must state its intent');
        need(pc.inputsProvided.length > 0, 'prompt contract must state what is sent for reasoning');
        need(pc.expects.length > 5, 'prompt contract must state what it expects back');
        // C-13.1. An agent with no rejection rule does not decide; it relays.
        need(pc.rejectionRules.length > 0,
          'prompt contract declares no rejection rule, so the agent relays rather than decides (C-13.1)');
        for (const provided of pc.inputsProvided) {
          need(!FORBIDDEN_IN_PROMPT.some((f) => provided.toLowerCase().includes(f)),
            `prompt contract sends "${provided}" for reasoning, which is Execution Plane custody`);
        }
      }
      need(Boolean(agent.aiBehaviour && agent.aiBehaviour.length > 15),
        'reasoning agent must state its behaviour when reasoning is available');
      need(Boolean(agent.nonAiBehaviour && agent.nonAiBehaviour.length > 15),
        'reasoning agent must state its behaviour when reasoning is unavailable (INV-7)');
    } else {
      need(agent.promptContract === undefined,
        'declares a prompt contract but no reasoning class, so the contract is never used');
    }

    if (this.agents.has(agent.id)) problems.push(`${agent.id}: already registered`);

    if (problems.length > 0) throw new AgentCatalogueError(problems);
    this.agents.set(agent.id, agent);
  }

  registerAll(agents: readonly AgentDefinition<never, unknown>[]): void {
    for (const a of agents) this.register(a);
  }

  get(id: string): AgentDefinition<never, unknown> | null { return this.agents.get(id) ?? null; }

  get all(): readonly AgentDefinition<never, unknown>[] {
    return [...this.agents.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  byDomain(domain: string): readonly AgentDefinition<never, unknown>[] {
    return this.all.filter((a) => a.domain === domain);
  }

  byStage(stage: StageName): readonly AgentDefinition<never, unknown>[] {
    return this.all.filter((a) => a.stage === stage);
  }

  get domains(): readonly string[] {
    return [...new Set(this.all.map((a) => a.domain))].sort();
  }

  /**
   * Invoke an agent with its declared retry policy.
   *
   * A `never` retry policy is honoured: retrying a deterministic failure produces the
   * same failure more slowly, and hides it behind a delay.
   */
  invoke<I, O>(id: string, input: I, ctx: AgentContext): O {
    const agent = this.agents.get(id);
    if (!agent) throw new AgentError(id, 'not registered');

    const attempts = agent.retry.retryOn === 'never' ? 1 : agent.retry.maxAttempts;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        ctx.audit(`agent.${agent.id}.invoked`, `attempt ${attempt}/${attempts}`);
        const out = (agent.handle as (i: I, c: AgentContext) => O)(input, ctx);
        ctx.telemetry(`agent.${agent.domain}.succeeded`, 1);
        return out;
      } catch (e) {
        lastError = e as Error;
        ctx.telemetry(`agent.${agent.domain}.failed`, 1);
        ctx.audit(`agent.${agent.id}.failed`, `attempt ${attempt}: ${lastError.message}`);
        if (agent.retry.retryOn === 'never') break;
      }
    }
    // THE FACT LEADS. THE DECLARATION FOLLOWS, AND ONLY AS CONTEXT.
    //
    // This message used to open with `agent.failureHandling` and append the real error in
    // parentheses, so EVERY internal fault in all 144 agents was announced as that agent's
    // DECLARED failure mode. A `TypeError` reading a property of `undefined` surfaced as
    // "A scope whose evidence is absent is UNREVIEWABLE and not approved…" — a confident
    // statement of a failure that had not occurred, with the truth in a trailing clause.
    //
    // That is D-007's axis at the one place a reader looks WHEN behaviour and declaration
    // have already diverged: an operator reading an incident log was shown the declaration
    // over the behaviour, and the more carefully an author had written `failureHandling`,
    // the more convincing the wrong explanation became.
    //
    // The error type is named because "Cannot read properties of undefined" alone does not
    // say a TypeError occurred, and the distinction between a thrown domain error and a
    // programming fault is the first thing an operator needs.
    const cause = lastError
      ? `${lastError.name}: ${lastError.message}`
      : 'failed with no error recorded';
    throw new AgentError(agent.id, `${cause} — declared handling: ${agent.failureHandling}`);
  }
}

/** Convenience for defining an agent with sensible, explicit defaults. */
export function defineAgent<I, O>(
  d: Omit<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'> &
  Partial<Pick<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'>>,
): AgentDefinition<I, O> {
  return {
    ...d,
    retry: d.retry ?? { maxAttempts: 2, retryOn: 'transient' },
    telemetry: d.telemetry ?? [`agent.${d.domain}.succeeded`, `agent.${d.domain}.failed`],
    auditEvents: d.auditEvents ?? [`agent.${d.id}.invoked`, `agent.${d.id}.failed`],
  };
}
