/**
 * WORK PATH DISTRIBUTION — the rotation carrier for `GET /api/tenants/{slug}/work`.
 *
 * TRACEABILITY
 *   Architecture : 05-cross-plane-communication.md (R-05.1 EP-initiated, R-05.5, R-05.27) ·
 *                  17-deployment-topology.md (R-17.24 no inbound dependency)
 *   ADR          : ADR-0080 (P-80.2 the exchange, §6 steps 4-5) · ADR-0007 §6 (rotation is a
 *                  first-class operation, not a migration) · ADR-0035 (the update channel) ·
 *                  ADR-0081 P-81.4 (the carrier this reuses, deliberately)
 *   Debt         : D-122 (the caller this unblocks)
 *
 * ══ WHY A SECOND CARRIER EXISTS, AND WHY THE ARGUMENT IS NOT NEW ═══════════════════════════════
 *
 * The registration grant now carries `workPath`, and that is right for a tenancy registering from
 * now on. **It is not a carrier for a tenancy that has ALREADY registered.** Registration is a
 * once-per-tenancy event and **the grant is returned once and never persisted**, so this plane
 * cannot re-send it and **cannot read what a tenancy holds**.
 *
 * > **BUT IT CAN KNOW WHAT IT WAS NOT SENT.** That asymmetry is the whole mechanism. This plane
 * > emitted every update event a tenancy has ever received, so *"was this tenancy ever sent a work
 * > path?"* is answerable from its own record — while *"does the tenancy currently hold one?"* is
 * > not, and never will be.
 *
 * **THE MEASURED CONSEQUENCE:** `carlisle-homes` registered **before `/work` existed**, so it holds
 * no work path. Without this carrier the only remedy is re-registration, **which mints a new EP
 * credential** — precisely the redeployment coupling ADR-0007 §6 exists to remove, and the identical
 * reasoning that gave verification-key distribution its existence.
 *
 * ══ WHAT A TENANCY THAT WAS NEVER SENT A WORK PATH DOES — AND THE DISTINCTION IS THE POINT ═════
 *
 * > **SILENCE IS NOT "NO WORK AVAILABLE". IT IS "NO ROUTE KNOWN", AND THOSE ARE DIFFERENT FACTS.**
 *
 * An Execution Plane holding no `workPath` **does not poll**. It therefore observes nothing — and
 * *nothing observed* is exactly what an empty collection looks like from the far side. **The two
 * are indistinguishable at the EP unless the EP knows which it is in**, so it must treat an absent
 * `workPath` as **NOT CONFIGURED**, never as *idle*:
 *
 *   · **no route known**  → the exchange is unavailable; this is a DEPLOYMENT fact, and the
 *                           tenancy is not participating in the work exchange at all.
 *   · **route known, empty collection** → a positive assertion that nothing is pending (R-05.27),
 *                           returned as a Success (R-05.5), and the EP idles correctly.
 *
 * **CONFLATING THEM IS THE FAIL-OPEN PORT'S SHAPE ONE LAYER OUT.** A tenancy that silently reads
 * *"no path"* as *"nothing to do"* is permanently idle while work accumulates, reports itself
 * healthy, and reddens nothing — the same invisible falsehood `/work` was designed to avoid inside
 * the collection, arriving instead through the absence of the collection.
 *
 * **This plane cannot fix that reading from here** — it is the Execution Plane's inference to make —
 * so what this module guarantees is the antecedent: **every registered tenancy is SENT a path**, and
 * `undistributed()` names any that has not been, so the condition is observable rather than assumed.
 *
 * ══ IT IS AN EVENT ON A CHANNEL THE EP ALREADY POLLS, NOT A NEW ENDPOINT ═══════════════════════
 *
 * ADR-0035's update channel is Execution-Plane-initiated and already carries pending events the EP
 * pulls and acknowledges. Distribution therefore needs **no new route, no inbound connection and no
 * customer redeployment** (R-17.24, R-08.16's shape) — reuse rather than a mechanism written for it.
 */
import { workPathFor } from './registration.js';
import type { CapabilityUpdateEvent, TenantEnvelope } from './tenant-config.js';
import type { TenantConfigRepository } from './tenant-repository.js';

/**
 * THE DEFAULT CADENCE, AND IT MATCHES THE GRANT'S `pollingIntervalSeconds`.
 *
 * Stated once here and passed explicitly, so a tenancy told its path by rotation polls at the same
 * rate as one told at registration. Two cadences for one exchange would make load depend on WHEN a
 * tenancy onboarded, which nothing downstream could explain.
 */
export const WORK_POLL_INTERVAL_SECONDS = 60;

/** What a distribution sweep did, per tenancy. Returned so a caller can alert on it. */
export interface WorkPathOutcome {
  readonly slug: string;
  /** `emitted` — the tenancy now has a pending event; `current` — it was already sent this path. */
  readonly result: 'emitted' | 'current';
  readonly workPath: string;
}

/** The events a tenancy holds for this concern. Exported so a test can assert on them directly. */
export function workPathEvents(env: TenantEnvelope): readonly CapabilityUpdateEvent[] {
  return (env.onboarding.updates ?? []).filter((e) => e.type === 'work-path-changed');
}

/**
 * The work path a tenancy has most recently been SENT, or `undefined` if it has never been sent one.
 *
 * **`undefined` IS THE CASE THIS MODULE EXISTS FOR** — it is the only signal distinguishing a
 * tenancy that cannot reach the exchange from one that can and has nothing to do.
 */
export function lastDistributedWorkPath(env: TenantEnvelope): string | undefined {
  const events = workPathEvents(env);
  const latest = events[events.length - 1];
  if (!latest) return undefined;
  const p = latest.config?.['workPath'];
  return typeof p === 'string' ? p : undefined;
}

/**
 * Every registered tenancy that has NEVER been sent a work path, or holds a stale one.
 *
 * **REPORTED SEPARATELY FROM THE SWEEP THAT FIXES IT**, because the two answer different questions:
 * this one is *"who cannot currently discover the exchange?"* and can be asked without writing
 * anything — including by a caller that has no authority to emit events.
 */
export function undistributed(repo: TenantConfigRepository): readonly string[] {
  const out: string[] = [];
  for (const summary of repo.list()) {
    const env = repo.load(summary.slug);
    if (!env) continue;
    if (lastDistributedWorkPath(env) !== workPathFor(summary.slug)) out.push(summary.slug);
  }
  return out;
}

/**
 * Ensure every registered tenancy has been sent its CURRENT work path.
 *
 * ── IDEMPOTENT BY COMPARISON, NOT BY A FLAG ────────────────────────────────────────────────────
 *
 * A tenancy whose last event already carries this exact path is skipped. The comparison is over the
 * path **actually sent** — read back off the event this plane emitted — rather than over a
 * "distributed" marker on the tenant record, because a marker is a second record of the same fact
 * and can disagree with the events.
 *
 * ── EVERY TENANCY IS ATTEMPTED; ONE FAILURE DOES NOT STOP THE OTHERS ───────────────────────────
 *
 * Aborting the sweep on one unwritable tenant record silently leaves every other tenancy unable to
 * discover the exchange, and that outage looks like nothing at all. Continuing is louder, and
 * loudness is the obligation.
 */
export function publishWorkPaths(
  repo: TenantConfigRepository,
  pollingIntervalSeconds: number = WORK_POLL_INTERVAL_SECONDS,
): readonly WorkPathOutcome[] {
  const outcomes: WorkPathOutcome[] = [];

  for (const summary of repo.list()) {
    const env = repo.load(summary.slug);
    if (!env) continue;
    const workPath = workPathFor(summary.slug);

    if (lastDistributedWorkPath(env) === workPath) {
      outcomes.push({ slug: summary.slug, result: 'current', workPath });
      continue;
    }
    repo.recordWorkPath(summary.slug, workPath, pollingIntervalSeconds);
    outcomes.push({ slug: summary.slug, result: 'emitted', workPath });
  }

  return outcomes;
}
