/**
 * Tenant Lifecycle State Machine — the six canonical states, and a projection over them.
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md §2 (R-21.5, R-21.6), §3a (R-21.27, R-21.29),
 *                  §8 (C-21.1, C-21.14, C-21.16)
 *   ADR          : ADR-0030 §4.3 (the projection is an overlay, never a second lifecycle)
 *   Criteria     : C-21.1 (always exactly one state) · C-21.14 (every transition audited)
 *                  C-21.16 (no ACTIVE without registration, connectivity and smoke)
 *
 * THE SIX CANONICAL STATES ARE FROZEN (R-21.5) AND ARE NOT EXTENDED HERE.
 * The richer lifecycle a reader may expect — DRAFT, WAITING_FOR_DEPLOYMENT, CERTIFIED —
 * is a PROJECTION derived from canonical state plus stage history (ADR-0030 §4.3). The
 * projection is a reporting aid. Execution eligibility (R-21.6) is decided on the
 * canonical state alone, never on the projection (R-21.7) — so the overlay can never
 * become a second source of truth.
 *
 * DETERMINISM. The clock is injected. A state machine whose audit timestamps came from
 * an ambient clock could not be replayed, and every proof here must replay (R-14.2).
 */

/** The frozen six (21 §2). A tenant is always in exactly one (C-21.1). */
export const CANONICAL_STATES = [
  'REGISTERED', 'PROVISIONED', 'ACTIVE', 'SUSPENDED', 'OFFBOARDING', 'CLOSED',
] as const;
export type CanonicalState = (typeof CANONICAL_STATES)[number];

/** The fourteen onboarding stages (R-21.27), tracked for the R-21.29 guard and the projection. */
export const ONBOARDING_STAGES: Readonly<Record<number, string>> = {
  1: 'customer-registration', 2: 'tenant-creation', 3: 'technology-profile-capture',
  4: 'business-integration-configuration', 5: 'solution-generation', 6: 'repository-generation',
  7: 'deployment-package-generation', 8: 'customer-deployment', 9: 'execution-plane-bootstrap',
  10: 'secure-registration', 11: 'connectivity-validation', 12: 'smoke-validation',
  13: 'tenant-certification', 14: 'tenant-activated',
};

/** Stages that R-21.29 requires before ACTIVE: secure registration, connectivity, smoke. */
export const ACTIVATION_PREREQUISITE_STAGES = [10, 11, 12] as const;

/** Legal transitions of the frozen state machine (21 §2 diagram). */
const TRANSITIONS: Readonly<Record<CanonicalState, readonly CanonicalState[]>> = {
  REGISTERED: ['PROVISIONED'],
  PROVISIONED: ['ACTIVE'],
  ACTIVE: ['SUSPENDED', 'OFFBOARDING'],
  SUSPENDED: ['ACTIVE', 'OFFBOARDING'],
  OFFBOARDING: ['CLOSED'],
  CLOSED: [],
};

/**
 * Read-only accessors over the frozen TRANSITIONS graph (R-21.5). Governed lifecycle
 * operations (suspend/reactivate/archive) validate against these, reusing the SINGLE
 * transition authority rather than duplicating the rules. The graph itself is unchanged.
 */
export function legalCanonicalTransitions(from: CanonicalState): readonly CanonicalState[] {
  return TRANSITIONS[from];
}
export function isLegalCanonicalTransition(from: CanonicalState, to: CanonicalState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The observable projection (ADR-0030 §4.3). Derived, never stored as the state. */
export const PROJECTION_STAGES = [
  'DRAFT', 'REGISTERED', 'CONFIGURED', 'VALIDATED', 'EP_GENERATED', 'WAITING_FOR_DEPLOYMENT',
  'EP_CONNECTED', 'HEALTH_VERIFIED', 'SMOKE_PASSED', 'CERTIFIED', 'OPERATIONAL',
  'SUSPENDED', 'OFFBOARDING', 'DECOMMISSIONED',
] as const;
export type ProjectionStage = (typeof PROJECTION_STAGES)[number];

export interface LifecycleEvent {
  readonly at: string;
  readonly from: CanonicalState;
  readonly to: CanonicalState;
  readonly actor: string;
  readonly reason: string;
}

export type TransitionOutcome =
  | { readonly ok: true; readonly state: CanonicalState; readonly event: LifecycleEvent }
  | { readonly ok: false; readonly reason: 'illegal-transition'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'activation-prerequisite-unmet'; readonly detail: string };

export interface TenantLifecycleOptions {
  readonly tenantId: string;
  /** Injected for deterministic, replayable audit (R-14.2). */
  readonly now?: () => string;
  /** Onboarding always begins at REGISTERED once identity exists (21 §2). */
  readonly initialState?: CanonicalState;
}

/**
 * One tenant's lifecycle. Owns its canonical state, its audited transition history, and
 * the set of completed onboarding stages. The Policy Decision Point reads `canExecute`
 * (R-21.6/R-21.7), never the projection.
 */
export class TenantLifecycle {
  readonly tenantId: string;
  private current: CanonicalState;
  private readonly clock: () => string;
  private readonly log: LifecycleEvent[] = [];
  private readonly completed = new Set<number>();

  constructor(options: TenantLifecycleOptions) {
    this.tenantId = options.tenantId;
    this.clock = options.now ?? (() => new Date().toISOString());
    this.current = options.initialState ?? 'REGISTERED';
  }

  get state(): CanonicalState { return this.current; }
  get history(): readonly LifecycleEvent[] { return this.log; }
  get completedStages(): ReadonlySet<number> { return this.completed; }

  /** Only ACTIVE permits execution (R-21.6). The PDP reads this, not the projection. */
  get canExecute(): boolean { return this.current === 'ACTIVE'; }

  /** Record an onboarding stage as complete (drives the R-21.29 guard and the projection). */
  completeStage(stage: number): void {
    if (!(stage in ONBOARDING_STAGES)) throw new Error(`unknown onboarding stage ${stage}`);
    this.completed.add(stage);
  }

  /**
   * Transition to a new canonical state. Illegal transitions and unmet activation
   * prerequisites are typed refusals, not thrown errors — onboarding must report which
   * stage failed and why (R-21.31). Every accepted transition is audited (C-21.14).
   */
  transition(to: CanonicalState, actor: string, reason: string): TransitionOutcome {
    const legal = TRANSITIONS[this.current];
    if (!legal.includes(to)) {
      return {
        ok: false,
        reason: 'illegal-transition',
        detail: `${this.current} -> ${to} is not a legal transition`,
      };
    }
    // R-21.29 / C-21.16: no ACTIVE without registration, connectivity and smoke.
    if (to === 'ACTIVE') {
      const missing = ACTIVATION_PREREQUISITE_STAGES.filter((s) => !this.completed.has(s));
      if (missing.length > 0) {
        return {
          ok: false,
          reason: 'activation-prerequisite-unmet',
          detail: `activation requires stages ${missing.join(', ')} (${missing.map((s) => ONBOARDING_STAGES[s]).join(', ')})`,
        };
      }
    }
    const event: LifecycleEvent = { at: this.clock(), from: this.current, to, actor, reason };
    this.current = to;
    this.log.push(event);
    return { ok: true, state: to, event };
  }

  /** The observable projection stage (ADR-0030 §4.3), derived from state + stage history. */
  get projection(): ProjectionStage {
    return projectLifecycle(this.current, this.completed);
  }
}

/**
 * Pure projection: canonical state + completed stages -> observable stage.
 * Exported so a dashboard can project a tenant it did not mutate (ADR-0030 §4.3).
 */
export function projectLifecycle(state: CanonicalState, completed: ReadonlySet<number>): ProjectionStage {
  switch (state) {
    case 'CLOSED': return 'DECOMMISSIONED';
    case 'OFFBOARDING': return 'OFFBOARDING';
    case 'SUSPENDED': return 'SUSPENDED';
    case 'ACTIVE': return 'OPERATIONAL';
    case 'REGISTERED':
      return 'REGISTERED';
    case 'PROVISIONED': {
      if (completed.has(13)) return 'CERTIFIED';
      if (completed.has(12)) return 'SMOKE_PASSED';
      if (completed.has(11)) return 'HEALTH_VERIFIED';
      if (completed.has(10)) return 'EP_CONNECTED';
      if (completed.has(7)) return 'WAITING_FOR_DEPLOYMENT';
      if (completed.has(5)) return 'EP_GENERATED';
      if (completed.has(4)) return 'VALIDATED';
      if (completed.has(3)) return 'CONFIGURED';
      return 'CONFIGURED';
    }
    default: return 'DRAFT';
  }
}
