/**
 * Service level objectives, indicators and error budgets.
 *
 * TRACEABILITY
 *   Architecture : 23-operational-excellence-model.md §5.1-5.3
 *   ADR          : ADR-0018 · ADR-0020
 *   Criteria     : C-23.1 (every SLO declares SLI, target, window and consequence)
 *                  C-23.2 (no SLO is published without a consequence)
 *                  C-23.3 (every SLI is computed from emitted telemetry)
 *                  C-23.4 (an SLI with unavailable telemetry reports NOT MEASURED)
 *                  C-23.5 (SLIs are tenant-scoped where the behaviour is tenant-visible)
 *                  C-23.6 (error budget exhaustion triggers its declared consequence)
 *                  C-23.7 (a target or window change does not reset a consumed budget)
 *
 * R-23.10: AN SLO WITHOUT A CONSEQUENCE IS A STATISTIC, NOT AN OBJECTIVE.
 * That is enforced here by the type system and the constructor, not by review: an SLO
 * cannot be constructed without one. An objective nobody acts on is a number on a
 * dashboard, and it decays into decoration within a quarter.
 *
 * R-23.17 IS THE HARD ONE, AND IT IS THE POINT.
 * An exhausted budget SHALL NOT be reset by adjusting the target or extending the
 * window. That is the most natural thing in the world to do when a budget is spent and
 * a release is waiting — and it is adjusting the instrument to flatter the result.
 * Consumption is therefore recorded against the OBJECTIVE, not against its current
 * target, and retargeting is an explicit, audited event that carries the consumption
 * forward. See `retarget()`.
 */

export type SloStatus = 'met' | 'at-risk' | 'breached' | 'NOT MEASURED';

export interface SloDefinition {
  readonly id: string;
  /** The user-visible behaviour this protects (R-23.11) — never a component internal. */
  readonly protects: string;
  /** Metric recording successful outcomes. */
  readonly successMetric: string;
  /** Metric recording failed outcomes. Numerator and denominator are explicit (R-23.12). */
  readonly failureMetric: string;
  /** Fraction, e.g. 0.995. */
  readonly target: number;
  readonly windowDays: number;
  /** REQUIRED. Without it this is a statistic, not an objective (R-23.10). */
  readonly consequence: string;
  /** True where the behaviour is tenant-visible (R-23.14). */
  readonly tenantScoped: boolean;
}

export interface SliReading {
  readonly sloId: string;
  readonly tenantId: string | null;
  readonly status: SloStatus;
  /** Null when NOT MEASURED. Never interpolated or carried forward (R-23.13). */
  readonly achieved: number | null;
  readonly successes: number;
  readonly failures: number;
  /** Fraction of the error budget consumed. Null when NOT MEASURED. */
  readonly budgetConsumed: number | null;
  readonly detail: string;
}

export interface BudgetLedgerEntry {
  readonly at: string;
  readonly sloId: string;
  readonly event: 'consumed' | 'retargeted' | 'consequence-triggered';
  readonly detail: string;
}

export class SloError extends Error {
  constructor(message: string) { super(message); this.name = 'SloError'; }
}

/** Telemetry the registry reads. Narrow on purpose — it cannot reach anything else. */
export interface SliSource {
  read(name: string, tenantId: string | null): { value: number; count: number } | null;
  tenantsFor(name: string): readonly string[];
}

export class SloRegistry {
  private readonly definitions = new Map<string, SloDefinition>();
  /**
   * Failures consumed against each objective, independent of its current target.
   *
   * Keyed by SLO id — NOT by (id, target, window). That is what makes R-23.17 hold:
   * changing the target cannot produce a fresh key, and therefore cannot produce a
   * fresh budget.
   */
  private readonly consumed = new Map<string, number>();
  private readonly ledger: BudgetLedgerEntry[] = [];

  constructor(
    private readonly source: SliSource,
    private readonly nowIso: () => string = () => new Date().toISOString(),
  ) {}

  get ledgerEntries(): readonly BudgetLedgerEntry[] { return this.ledger; }

  get published(): readonly SloDefinition[] {
    return [...this.definitions.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /**
   * Publish an SLO.
   *
   * Refuses one without a consequence. Refusing at registration rather than at review
   * is what stops a consequence-free objective ever reaching a dashboard.
   */
  publish(definition: SloDefinition): void {
    if (!definition.consequence || definition.consequence.trim() === '') {
      throw new SloError(
        `${definition.id} has no consequence. An SLO without one is a statistic, not an objective (R-23.10).`,
      );
    }
    if (definition.target <= 0 || definition.target >= 1) {
      throw new SloError(`${definition.id} target must be a fraction between 0 and 1, exclusive`);
    }
    if (this.definitions.has(definition.id)) {
      throw new SloError(`${definition.id} is already published; use retarget() to change it`);
    }
    this.definitions.set(definition.id, definition);
  }

  /**
   * Change a target or window WITHOUT resetting consumed budget (R-23.17).
   *
   * The consumption ledger is keyed by objective, so it survives untouched. The change
   * is recorded, because a retarget under budget pressure is exactly the event an
   * auditor needs to see.
   */
  retarget(sloId: string, change: { target?: number; windowDays?: number }, reason: string): void {
    const existing = this.definitions.get(sloId);
    if (!existing) throw new SloError(`${sloId} is not published`);
    if (!reason || reason.trim() === '') {
      throw new SloError('a retarget requires a stated reason; an unexplained target change is indistinguishable from concealment');
    }
    this.definitions.set(sloId, {
      ...existing,
      target: change.target ?? existing.target,
      windowDays: change.windowDays ?? existing.windowDays,
    });
    this.ledger.push({
      at: this.nowIso(), sloId, event: 'retargeted',
      detail: `${reason}. Consumed budget carried forward unchanged (R-23.17): ${this.consumed.get(sloId) ?? 0} failure(s).`,
    });
  }

  /**
   * Read an SLI.
   *
   * Returns NOT MEASURED when telemetry is absent. It is never interpolated, estimated
   * or carried forward from a previous window (R-23.13) — the three ways a dashboard
   * comes to show a number that nothing measured.
   */
  read(sloId: string, tenantId: string | null = null): SliReading {
    const slo = this.definitions.get(sloId);
    if (!slo) throw new SloError(`${sloId} is not published`);

    const ok = this.source.read(slo.successMetric, tenantId);
    const bad = this.source.read(slo.failureMetric, tenantId);

    if (ok === null && bad === null) {
      return {
        sloId, tenantId, status: 'NOT MEASURED', achieved: null,
        successes: 0, failures: 0, budgetConsumed: null,
        detail: `no telemetry for ${slo.successMetric} or ${slo.failureMetric}. NOT MEASURED — never interpolated (R-23.13).`,
      };
    }

    const successes = ok?.value ?? 0;
    const failures = bad?.value ?? 0;
    const total = successes + failures;
    if (total === 0) {
      return {
        sloId, tenantId, status: 'NOT MEASURED', achieved: null,
        successes, failures, budgetConsumed: null,
        detail: 'telemetry exists but recorded no outcomes in this window',
      };
    }

    const achieved = successes / total;
    // The budget is the failures the target permits over the window's volume.
    const allowedFailures = (1 - slo.target) * total;
    const budgetConsumed = allowedFailures === 0 ? 1 : Math.min(1, failures / allowedFailures);
    const status: SloStatus = achieved >= slo.target
      ? (budgetConsumed >= 0.75 ? 'at-risk' : 'met')
      : 'breached';

    return {
      sloId, tenantId, status, achieved, successes, failures, budgetConsumed,
      detail: `${successes}/${total} succeeded (${(achieved * 100).toFixed(2)}%), target ${(slo.target * 100).toFixed(2)}%, budget ${(budgetConsumed * 100).toFixed(0)}% consumed`,
    };
  }

  /**
   * Read one SLO across every tenant that reported (R-23.14).
   *
   * Per tenant, never aggregated into a single figure. Aggregate availability hides
   * the failure that matters: the customer who is entirely down.
   */
  readPerTenant(sloId: string): readonly SliReading[] {
    const slo = this.definitions.get(sloId);
    if (!slo) throw new SloError(`${sloId} is not published`);
    if (!slo.tenantScoped) return [this.read(sloId, null)];
    const tenants = new Set([
      ...this.source.tenantsFor(slo.successMetric),
      ...this.source.tenantsFor(slo.failureMetric),
    ]);
    return [...tenants].sort().map((t) => this.read(sloId, t));
  }

  /**
   * Record consumption and trigger the declared consequence on exhaustion (R-23.16).
   *
   * The consequence is RETURNED, not performed. This service enforces nothing and
   * remediates nothing (C-24.9) — it states what the declared consequence is, and the
   * decision to act remains with whoever owns the release.
   */
  evaluate(sloId: string, tenantId: string | null = null): {
    reading: SliReading; consequenceTriggered: boolean; consequence: string | null;
  } {
    const slo = this.definitions.get(sloId);
    if (!slo) throw new SloError(`${sloId} is not published`);
    const reading = this.read(sloId, tenantId);

    if (reading.status === 'NOT MEASURED') {
      // An unmeasured SLO does not consume budget and does not trigger a consequence.
      // Treating absence as success would be the exact inversion R-13.3 forbids.
      return { reading, consequenceTriggered: false, consequence: null };
    }

    if (reading.failures > 0) {
      this.consumed.set(sloId, (this.consumed.get(sloId) ?? 0) + reading.failures);
      this.ledger.push({
        at: this.nowIso(), sloId, event: 'consumed',
        detail: `${reading.failures} failure(s)${tenantId ? ` for ${tenantId}` : ''}`,
      });
    }

    const exhausted = reading.status === 'breached' || (reading.budgetConsumed ?? 0) >= 1;
    if (exhausted) {
      this.ledger.push({
        at: this.nowIso(), sloId, event: 'consequence-triggered', detail: slo.consequence,
      });
      return { reading, consequenceTriggered: true, consequence: slo.consequence };
    }
    return { reading, consequenceTriggered: false, consequence: null };
  }

  /** Total failures consumed against an objective, across retargets. */
  consumedFor(sloId: string): number { return this.consumed.get(sloId) ?? 0; }
}

/**
 * The platform's published SLOs.
 *
 * Each protects a USER-VISIBLE outcome (R-23.11) rather than a component internal, and
 * each carries a consequence. "The registration succeeded" is an objective; "CPU
 * stayed below 70%" is a diagnostic and does not belong here.
 */
export const PLATFORM_SLOS: readonly SloDefinition[] = [
  {
    id: 'slo.registration',
    protects: 'An Execution Plane can register and receive its credentials on first start.',
    successMetric: 'registration.succeeded',
    failureMetric: 'registration.failed',
    target: 0.995,
    windowDays: 30,
    consequence: 'Registration changes are frozen and the next release is blocked until the budget recovers. Onboarding is the first thing a customer experiences; a failure here is never absorbed.',
    tenantScoped: true,
  },
  {
    id: 'slo.gateway',
    protects: 'An authenticated call from a registered tenant is served.',
    successMetric: 'gateway.served',
    failureMetric: 'gateway.refused_unexpectedly',
    target: 0.999,
    windowDays: 30,
    consequence: 'Gateway deploys are frozen and an incident is opened with the affected tenants named. Refusals that are policy decisions are excluded from this SLI; only unexpected refusals count against it.',
    tenantScoped: true,
  },
  {
    id: 'slo.certificate-rotation',
    protects: 'A certificate rotates without the customer redeploying anything.',
    successMetric: 'certificate.rotated',
    failureMetric: 'certificate.rotation_failed',
    target: 0.999,
    windowDays: 90,
    consequence: 'Rotation is suspended and every affected tenant is contacted before their certificate expires. A rotation failure becomes an outage on a known date, which makes it the one failure with a deadline.',
    tenantScoped: true,
  },
  {
    id: 'slo.solution-generation',
    protects: 'A tenant receives a generated Execution Plane for a supported profile.',
    successMetric: 'generation.succeeded',
    failureMetric: 'generation.failed',
    target: 0.99,
    windowDays: 30,
    consequence: 'Generator changes are frozen and the supported-target matrix is re-validated before any release. A generation failure for a declared-supported profile means the matrix is lying.',
    tenantScoped: true,
  },
];
