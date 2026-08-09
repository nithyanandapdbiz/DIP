/**
 * Health, readiness and liveness — three different questions, three different answers.
 *
 * TRACEABILITY
 *   Architecture : 23-operational-excellence-model.md §5.7
 *   ADR          : ADR-0018
 *   Criteria     : C-23.10 (readiness is distinct from health, and health is not liveness-only)
 *                  C-24.7  (absence of incidents is never reported as health)
 *
 * R-23.30: a health endpoint SHALL NOT report healthy on the basis of process liveness
 * alone. **Answering "the process is running" to the question "is it working?" is how
 * outages go undetected** — and it is the default behaviour of almost every health
 * check ever written, because liveness is the only thing that is trivial to measure.
 *
 * The three questions, and who asks them:
 *
 *   LIVENESS   "Should this process be killed and restarted?"      — the orchestrator
 *   READINESS  "Should traffic be sent here?"                      — the load balancer
 *   HEALTH     "Is the platform doing its job for its tenants?"    — an operator
 *
 * Conflating them causes specific, opposite failures. Liveness that checks dependencies
 * restarts a healthy process because a database blinked. Readiness that only checks
 * liveness sends traffic to a process that has not finished starting. Health that
 * checks liveness reports green during a total outage.
 *
 * F-23.2 in document 23 names exactly this: "health reports liveness only → outages
 * undetected".
 */
import type { Metrics } from './telemetry.js';

export type ProbeState = 'pass' | 'fail';
export type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ProbeResult {
  readonly probe: 'liveness' | 'readiness';
  readonly state: ProbeState;
  readonly detail: string;
}

export interface DependencyHealth {
  readonly name: string;
  readonly state: HealthState;
  readonly detail: string;
}

export interface HealthReport {
  readonly state: HealthState;
  readonly checkedAt: string;
  readonly dependencies: readonly DependencyHealth[];
  /** Why the state is what it is, in one line an operator can act on. */
  readonly summary: string;
}

export interface HealthDependency {
  readonly name: string;
  /** Required for readiness: without it, traffic must not be routed here. */
  readonly requiredForReadiness: boolean;
  check(): { state: HealthState; detail: string };
}

export class HealthMonitor {
  private readonly dependencies: HealthDependency[] = [];
  private started = false;

  constructor(
    private readonly metrics: Metrics,
    private readonly nowIso: () => string = () => new Date().toISOString(),
  ) {}

  register(dependency: HealthDependency): void { this.dependencies.push(dependency); }

  /** Called once the process has finished starting. Readiness is false before this. */
  markStarted(): void { this.started = true; }

  /**
   * LIVENESS — is this process irrecoverably stuck?
   *
   * Deliberately checks NOTHING external. A liveness probe that fails because a
   * dependency is unavailable causes the orchestrator to restart a process that was
   * working, turning a dependency blip into a restart storm. Liveness answers only
   * "restarting me would help".
   */
  liveness(): ProbeResult {
    return {
      probe: 'liveness',
      state: 'pass',
      detail: 'the process is running and its event loop is responsive; no dependency is consulted, deliberately',
    };
  }

  /**
   * READINESS — should traffic be routed here?
   *
   * Checks the dependencies required to SERVE. Distinct from health: a process can be
   * ready to serve while the platform is degraded elsewhere, and it can be unready
   * during startup while being perfectly healthy.
   */
  readiness(): ProbeResult {
    if (!this.started) {
      return { probe: 'readiness', state: 'fail', detail: 'still starting; not yet accepting traffic' };
    }
    const required = this.dependencies.filter((d) => d.requiredForReadiness);
    const failing = required
      .map((d) => ({ name: d.name, ...d.check() }))
      .filter((r) => r.state === 'unhealthy' || r.state === 'unknown');

    if (failing.length > 0) {
      return {
        probe: 'readiness',
        state: 'fail',
        detail: `not ready: ${failing.map((f) => `${f.name} (${f.state})`).join(', ')}`,
      };
    }
    return {
      probe: 'readiness',
      state: 'pass',
      detail: `${required.length} required dependencies available`,
    };
  }

  /**
   * HEALTH — is the platform doing its job?
   *
   * Aggregates every dependency AND requires evidence that work is actually happening.
   * The second half is the one that matters: C-24.7 forbids reporting health on the
   * absence of incidents. A platform with no errors because it is serving no requests
   * is not healthy — it is silent, and silence is `unknown`.
   */
  health(activityMetric?: string): HealthReport {
    const checkedAt = this.nowIso();
    const dependencies = this.dependencies
      .map((d) => ({ name: d.name, ...d.check() }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));

    if (activityMetric) {
      // `anyRecorded`, not `read` — metrics are tenant-keyed, so reading the unscoped
      // bucket asks "did anything report OUTSIDE a tenant?", which is always no on a
      // multi-tenant platform. That defect reported a fully busy platform as silent,
      // which is the same class of error as the one this check exists to prevent,
      // pointing the other way.
      if (!this.metrics.anyRecorded(activityMetric)) {
        // THE SILENT-SOURCE CASE. Reporting `healthy` here is the single most damaging
        // thing a health endpoint can do: it is indistinguishable from working, and it
        // is what an operator sees during a total outage of the thing that reports.
        return {
          state: 'unknown',
          checkedAt,
          dependencies,
          summary: `no activity recorded for ${activityMetric}. This is NOT health — nothing has reported, and a silent source cannot be distinguished from a working one (C-24.7).`,
        };
      }
    }

    const unhealthy = dependencies.filter((d) => d.state === 'unhealthy');
    const degraded = dependencies.filter((d) => d.state === 'degraded');
    const unknown = dependencies.filter((d) => d.state === 'unknown');

    if (unhealthy.length > 0) {
      return {
        state: 'unhealthy', checkedAt, dependencies,
        summary: `${unhealthy.length} dependency(ies) unhealthy: ${unhealthy.map((d) => d.name).join(', ')}`,
      };
    }
    if (unknown.length > 0) {
      // Unknown is not degraded and not healthy. A dependency that cannot be reached
      // to be checked has not been shown to be working.
      return {
        state: 'unknown', checkedAt, dependencies,
        summary: `${unknown.length} dependency(ies) could not be evaluated: ${unknown.map((d) => d.name).join(', ')}`,
      };
    }
    if (degraded.length > 0) {
      return {
        state: 'degraded', checkedAt, dependencies,
        summary: `${degraded.length} dependency(ies) degraded: ${degraded.map((d) => d.name).join(', ')}`,
      };
    }
    return {
      state: 'healthy', checkedAt, dependencies,
      summary: `${dependencies.length} dependencies healthy, and activity was observed`,
    };
  }

  /**
   * Health for ONE tenant (R-23.14).
   *
   * Aggregate availability hides the failure that matters: a platform at 99.9% can be
   * wholly unavailable to one customer, and that customer's experience is the only one
   * they can observe.
   */
  tenantHealth(tenantId: string, successMetric: string, failureMetric: string): HealthReport {
    const checkedAt = this.nowIso();
    const ok = this.metrics.read(successMetric, tenantId);
    const failed = this.metrics.read(failureMetric, tenantId);

    if (ok === null && failed === null) {
      return {
        state: 'unknown', checkedAt, dependencies: [],
        summary: `no telemetry for ${tenantId}. Not healthy — unmeasured (R-23.13).`,
      };
    }
    const successes = ok?.value ?? 0;
    const failures = failed?.value ?? 0;
    const total = successes + failures;
    if (total === 0) {
      return {
        state: 'unknown', checkedAt, dependencies: [],
        summary: `${tenantId} recorded no outcomes in this window`,
      };
    }
    const rate = successes / total;
    const state: HealthState = rate >= 0.99 ? 'healthy' : rate >= 0.9 ? 'degraded' : 'unhealthy';
    return {
      state, checkedAt, dependencies: [],
      summary: `${tenantId}: ${successes}/${total} succeeded (${(rate * 100).toFixed(1)}%)`,
    };
  }
}
