/**
 * The twelve-stage orchestration lifecycle — the platform's only one.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 11-capability-model.md
 *   ADR          : ADR-0022 (capability sub-engines are internal structure)
 *   Criteria     : C-12.1 (every capability implements all twelve stages)
 *                  C-12.2 (a capability omitting a stage fails to compile)
 *                  C-12.12 (non-applicable stages return a typed reason, never empty)
 *                  C-11.13 (no capability bypasses the three Review stages)
 *                  C-11.11 (no framework code branches on a capability identity)
 *
 * R-12.18: THERE IS EXACTLY ONE ORCHESTRATION LIFECYCLE FOR THE PLATFORM.
 * A capability may extend the framework internally; it SHALL NEVER redefine or bypass
 * it. Every capability — Functional Testing, Dev-Change, Inverse-Flow, Performance,
 * Security, Penetration — runs these twelve stages and no others.
 *
 * WHY STAGE RESULTS ARE UNCONSTRUCTIBLE.
 * R-12.10 forbids constructing a stage result outside its producing stage, and R-12.11
 * forbids any bypass, override, debug path or test hook that does so. Both exist
 * because type-level guarantees are routinely defeated by a helper added for testing
 * convenience: a seam that fabricates a `GuardrailVerdict` reintroduces exactly the
 * bypass the type system removed, and it will reach production code within a year.
 *
 * The mechanism here is a module-private brand. A stage result carries a symbol that
 * cannot be obtained outside this module, so no literal, cast or spread can produce
 * one. Tests exercise capabilities through the real framework — there is no other way
 * in, deliberately.
 */

/** Module-private. Not exported, so no other module can mint a stage result. */
const SEAL = Symbol('dbiz.stage.seal');

export const STAGES = [
  'planning', 'discovery', 'context',
  'architecture-review', 'policy-review', 'guardrail-review',
  'execution-planning', 'execution', 'evidence',
  'reflection', 'certification', 'reporting',
] as const;

export type StageName = (typeof STAGES)[number];

/** Which plane runs the stage. R-12.5: stages 10–12 are never Execution Plane. */
export const STAGE_PLANE: Readonly<Record<StageName, 'IP' | 'EP' | 'EP->IP'>> = {
  planning: 'IP',
  discovery: 'EP',
  context: 'EP->IP',
  'architecture-review': 'IP',
  'policy-review': 'IP',
  'guardrail-review': 'IP',
  'execution-planning': 'IP',
  execution: 'EP',
  evidence: 'EP',
  reflection: 'IP',
  certification: 'IP',
  reporting: 'IP',
};

/** R-12.2: stages 4, 5 and 6. No capability may bypass them (C-11.13). */
export const GOVERNANCE_TRIAD: readonly StageName[] =
  ['architecture-review', 'policy-review', 'guardrail-review'];

/**
 * A sealed stage result.
 *
 * `readonly [SEAL]` is the load-bearing field. It is a module-private symbol, so a
 * value of this type cannot be written by hand anywhere else in the platform.
 */
/**
 * What a stage concluded. THREE outcomes, not two, and not a set of booleans.
 *
 * Until ADR-0071 a stage could report `ok` or `not-applicable` and nothing else, so **refusal was
 * expressible only as absence**: the sole route to `certified: false` from a stage that had run
 * was to claim it had done no work. A governance-triad stage could therefore not decline, and
 * `certify()` — which never reads `value` — certified every applicable result regardless of what
 * the stage had concluded (TECHNICAL_DEBT.md D-019).
 *
 * A DISCRIMINATED UNION RATHER THAN ADDED BOOLEANS. `refused: boolean` beside `applicable:
 * boolean` would have made `{applicable: false, refused: true}` representable and meaningless.
 * This platform has repeatedly shipped fields that could not discriminate — `publicationStatus`
 * with unreachable branches, `eligible` hardcoded true, `certified` hardcoded true (D-012, D-013)
 * — and the repair for each was the same: make the invalid state unrepresentable, not merely
 * unlikely.
 */
export type StageOutcome = 'ok' | 'not-applicable' | 'refused';

export interface StageResult<S extends StageName, T> {
  readonly [SEAL]: true;
  readonly stage: S;
  readonly value: T;
  /**
   * R-12.12: a stage that legitimately performs no work returns NOT-APPLICABLE carrying a reason,
   * and one that did its work and reached a negative conclusion returns REFUSED carrying a reason.
   * It never returns empty or default — an empty result is indistinguishable from a stage that
   * silently did nothing, and a refusal reported as not-applicable is a stage lying about having
   * worked in order to be heard.
   */
  readonly outcome: StageOutcome;
  /** Required for `not-applicable` and `refused`; `null` for `ok`. Never empty. */
  readonly reason: string | null;
  /** Agents that ran, for audit. Never customer content. */
  readonly agentsInvoked: readonly string[];
}

/**
 * The only way to produce a stage result.
 *
 * Handed to a stage implementation by the runner, and only for the stage being run —
 * so a stage cannot emit another stage's result and skip it.
 */
export interface StageEmitter<S extends StageName> {
  readonly stage: S;
  ok<T>(value: T, agentsInvoked?: readonly string[]): StageResult<S, T>;
  notApplicable<T>(value: T, reason: string, agentsInvoked?: readonly string[]): StageResult<S, T>;
  /**
   * THE STAGE DID ITS WORK AND THE ANSWER IS NO (ADR-0071).
   *
   * Distinct from `notApplicable`, and the distinction is the whole point: *there was nothing to
   * review* and *the review failed* are different facts, and collapsing them forces a stage that
   * wants to decline to misreport having worked. `certify()` maps this to `certified: false` with
   * a reason that names it a refusal, so `firstRefusal` finally denotes what it is named for.
   */
  refuse<T>(value: T, reason: string, agentsInvoked?: readonly string[]): StageResult<S, T>;
}

function emitterFor<S extends StageName>(stage: S): StageEmitter<S> {
  return {
    stage,
    ok<T>(value: T, agentsInvoked: readonly string[] = []): StageResult<S, T> {
      return { [SEAL]: true, stage, value, outcome: 'ok', reason: null, agentsInvoked };
    },
    notApplicable<T>(value: T, reason: string, agentsInvoked: readonly string[] = []): StageResult<S, T> {
      if (!reason || reason.trim() === '') {
        // R-12.12 again: "not applicable" without a reason is an empty result wearing
        // a different name, and it is how a skipped stage becomes invisible.
        throw new StageError(stage, 'a not-applicable result requires a stated reason');
      }
      return { [SEAL]: true, stage, value, outcome: 'not-applicable', reason, agentsInvoked };
    },
    refuse<T>(value: T, reason: string, agentsInvoked: readonly string[] = []): StageResult<S, T> {
      if (!reason || reason.trim() === '') {
        // The framework's own words, at last describing something it can produce:
        // "a refusal without a reason has failed, not refused".
        throw new StageError(stage, 'a refusal requires a stated reason');
      }
      return { [SEAL]: true, stage, value, outcome: 'refused', reason, agentsInvoked };
    },
  };
}

export class StageError extends Error {
  constructor(public readonly stage: StageName, message: string) {
    super(`stage ${stage}: ${message}`);
    this.name = 'StageError';
  }
}

export class CapabilityRegistrationError extends Error {
  constructor(public readonly capabilityId: string, public readonly missing: readonly string[]) {
    super(`capability ${capabilityId} cannot be registered: ${missing.join('; ')}`);
    this.name = 'CapabilityRegistrationError';
  }
}

/** What every stage receives. Deliberately narrow — a stage reaches nothing else. */
export interface StageContext {
  readonly tenantId: string;
  readonly runId: string;
  readonly correlationId: string;
  /** Output of the predecessor stage (R-12.9). `null` only for Planning. */
  readonly previous: StageResult<StageName, unknown> | null;
  /** Tenant and capability configuration. Never customer content. */
  readonly configuration: Readonly<Record<string, string>>;
  /** Emits an audit event. Every stage is accountable. */
  readonly audit: (event: string, detail: string) => void;
}

export type StageImplementation<S extends StageName> =
  (context: StageContext, emit: StageEmitter<S>) => StageResult<S, unknown>;

/** A capability. R-11.11: it must declare all twelve stage implementations. */
export interface Capability {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  /** Every stage. A missing key is a compile error and a registration failure. */
  readonly stages: Readonly<Record<StageName, StageImplementation<StageName>>>;
  /** Adapter interfaces this capability requires, by name. */
  readonly requiredAdapters: readonly string[];
  /** Evidence classes this capability produces. */
  readonly evidenceClasses: readonly string[];
  /** Certification criteria this capability is judged against. */
  readonly certificationCriteria: readonly string[];
}

/**
 * The capability registry — R-11.10, the single source of truth for what exists.
 *
 * Registration REFUSES an incomplete capability (R-11.12), and refuses one whose stage
 * is a no-op (R-11.16). R-11.14 records why: the predecessor listed a penetration
 * capability in a tier definition, exposed it through an API, and shipped it with no
 * runner on disk — its dispatch wrapper logging the miss and returning a soft failure.
 */
export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    const missing: string[] = [];

    for (const stage of STAGES) {
      const impl = capability.stages[stage];
      if (typeof impl !== 'function') {
        missing.push(`stage "${stage}" is not implemented`);
        continue;
      }
      // A no-op stage is detected structurally: a function that takes no parameters
      // cannot consult its context or emit through the emitter, so it cannot have
      // done any work. This is the cheapest available check that a stage is real,
      // and it is not the only one — the conformance gate also asserts every stage
      // returns a sealed result when the capability is exercised.
      if (impl.length === 0) {
        missing.push(`stage "${stage}" takes no context and can perform no work (R-11.16)`);
      }
    }

    if (capability.certificationCriteria.length === 0) {
      missing.push('no certification criteria declared (R-11.11)');
    }
    if (missing.length > 0) throw new CapabilityRegistrationError(capability.id, missing);

    this.capabilities.set(capability.id, capability);
  }

  get(id: string): Capability | null { return this.capabilities.get(id) ?? null; }

  get registered(): readonly Capability[] {
    return [...this.capabilities.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

export interface RunOutcome {
  readonly runId: string;
  readonly tenantId: string;
  readonly completed: readonly StageName[];
  readonly results: ReadonlyMap<StageName, StageResult<StageName, unknown>>;
  readonly audit: readonly { readonly at: number; readonly stage: StageName | null; readonly event: string; readonly detail: string }[];
  readonly failedAt: StageName | null;
  readonly failure: string | null;
}

/**
 * Run a capability through all twelve stages, in order.
 *
 * There is no `skip`, no `only`, no `from` and no `resumeAt` parameter, and adding one
 * would defeat the entire design (R-12.11). Resumption is expressed as a *new run*
 * that replays prior results, not as a bypass — see `resumeFrom`, which requires the
 * prior results to be sealed and therefore genuinely produced.
 */
export function runCapability(
  capability: Capability,
  input: { tenantId: string; runId: string; correlationId: string; configuration?: Readonly<Record<string, string>> },
  priorResults?: ReadonlyMap<StageName, StageResult<StageName, unknown>>,
): RunOutcome {
  const results = new Map<StageName, StageResult<StageName, unknown>>();
  const completed: StageName[] = [];
  const audit: { at: number; stage: StageName | null; event: string; detail: string }[] = [];
  let clock = 0;

  let previous: StageResult<StageName, unknown> | null = null;

  for (const stage of STAGES) {
    // Resumption: a prior result is accepted ONLY if it is sealed, which means it was
    // produced by a real run of that stage. A fabricated object cannot pass here.
    const prior = priorResults?.get(stage);
    if (prior && isSealed(prior) && prior.stage === stage) {
      results.set(stage, prior);
      completed.push(stage);
      previous = prior;
      audit.push({ at: (clock += 1), stage, event: 'stage.resumed', detail: 'replayed a sealed prior result' });
      continue;
    }

    const context: StageContext = {
      tenantId: input.tenantId,
      runId: input.runId,
      correlationId: input.correlationId,
      previous,
      configuration: input.configuration ?? {},
      audit: (event, detail) => { audit.push({ at: (clock += 1), stage, event, detail }); },
    };

    let result: StageResult<StageName, unknown>;
    try {
      result = capability.stages[stage](context, emitterFor(stage) as StageEmitter<StageName>);
    } catch (e) {
      audit.push({ at: (clock += 1), stage, event: 'stage.failed', detail: (e as Error).message });
      return {
        runId: input.runId, tenantId: input.tenantId, completed, results, audit,
        failedAt: stage, failure: (e as Error).message,
      };
    }

    // A stage that returned something it did not produce is a bypass attempt.
    if (!isSealed(result) || result.stage !== stage) {
      const detail = `stage "${stage}" returned a result it did not produce — this is the bypass R-12.11 forbids`;
      audit.push({ at: (clock += 1), stage, event: 'stage.invalid', detail });
      return {
        runId: input.runId, tenantId: input.tenantId, completed, results, audit,
        failedAt: stage, failure: detail,
      };
    }

    results.set(stage, result);
    completed.push(stage);
    previous = result;
    // The audit trail distinguishes all three outcomes. A refusal recorded as
    // `stage.not-applicable` would be the audit repeating the conflation ADR-0071 removes.
    const STAGE_EVENT: Record<StageOutcome, string> = {
      ok: 'stage.completed', 'not-applicable': 'stage.not-applicable', refused: 'stage.refused',
    };
    audit.push({
      at: (clock += 1), stage, event: STAGE_EVENT[result.outcome],
      detail: result.reason ?? `${result.agentsInvoked.length} agent(s)`,
    });
  }

  return {
    runId: input.runId, tenantId: input.tenantId, completed, results, audit,
    failedAt: null, failure: null,
  };
}

/** True only for a result this module produced. The seal cannot be forged. */
export function isSealed(value: unknown): value is StageResult<StageName, unknown> {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[SEAL] === true;
}

/** Read a stage's value. The only supported way to consume a result. */
export function valueOf<T>(result: StageResult<StageName, unknown>): T {
  return result.value as T;
}
