/**
 * The Run Record retention driver, and THE FACTORY THAT STARTS IT (ADR-0082 P-82.7).
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md (R-06.9, R-06.13, R-06.15)
 *   ADR          : ADR-0082 (P-82.7) · ADR-0079 (the pattern this reuses deliberately)
 *   Criteria     : C-06.8 (the purge test, which proves unreadability) · C-06.9 (purge failure alerts)
 *
 * ══ THE SAME LESSON AS ADR-0079's, AND IT IS REUSED RATHER THAN RE-LEARNED ═════════════════════
 *
 * `SealedPackageStore.purgeExpired` was correct and NOTHING CALLED IT. R-06.13 does not say
 * *"a purge method exists"*; it says retention is **enforced on a schedule**. A method's existence
 * says nothing about whether anything drives it.
 *
 * **So there is no bare constructor path in production.** `runRecordService` builds the store and
 * its driver together and **STARTS the driver before it returns**, so there is no window — and no
 * code path — in which this store is accepting writes while nothing enforces its retention.
 *
 * ADR-0082 §6 step 2 requires the driver be *"obtained through the starting factory"* for exactly
 * this reason: the store and the guarantee are acquired in one call or not at all.
 */
import type { TenantContext } from '../tenant/tenant-context.js';
import type { StorageProvider } from './storage-provider.js';
import {
  RunRecordStore, AUTHORISING_ADR, type Clock,
} from './run-record-store.js';
import { nodeIntervalScheduler, type IntervalScheduler } from './sealed-package-purge.js';

/** Hourly. Retention is a ceiling, not a deadline; the sweep only has to be regular. */
const DEFAULT_PURGE_INTERVAL_MS = 3_600_000;

export interface RunRecordPurgeSweepOutcome {
  readonly sweptTenants: number;
  readonly purgedRunIds: readonly string[];
  readonly failures: readonly { readonly tenantSlug: string; readonly error: unknown }[];
}

export interface RunRecordPurgeDriverDeps {
  readonly store: RunRecordStore;
  /** The tenants to sweep. Read fresh on EVERY sweep, so a tenant onboarded after boot is covered. */
  readonly tenants: () => readonly TenantContext[];
  /**
   * REQUIRED (R-06.15). Called once per failing tenant. No default and no optional marker:
   * a purge driver constructible without an alert sink is a silent skip wearing a driver's clothes.
   */
  readonly onPurgeFailure: (tenantSlug: string, error: unknown) => void;
  readonly intervalMs?: number;
  readonly scheduler?: IntervalScheduler;
  readonly now?: Clock;
}

export class RunRecordPurgeDriver {
  /** Recorded in source so the gate can tie the driver to the decision that requires it. */
  static readonly authorisingAdr = AUTHORISING_ADR;

  private handle: { stop: () => void } | undefined;

  constructor(private readonly deps: RunRecordPurgeDriverDeps) {}

  /**
   * One sweep across every tenant.
   *
   * FAILURE ALERTS AND THE SWEEP CONTINUES (R-06.15). The `catch` does NOT swallow — it calls
   * `onPurgeFailure` and records the failure in the outcome. One tenant's storage fault must not
   * stop retention for every other tenant, and it must not pass unnoticed either.
   */
  async sweep(): Promise<RunRecordPurgeSweepOutcome> {
    const purgedRunIds: string[] = [];
    const failures: { tenantSlug: string; error: unknown }[] = [];
    const tenants = this.deps.tenants();

    for (const ctx of tenants) {
      try {
        purgedRunIds.push(...(await this.deps.store.purgeExpired(ctx)));
      } catch (error) {
        failures.push({ tenantSlug: ctx.tenantSlug, error });
        this.deps.onPurgeFailure(ctx.tenantSlug, error);
      }
    }
    return { sweptTenants: tenants.length, purgedRunIds, failures };
  }

  /** Start sweeping. THIS is what makes purge scheduled rather than operator-initiated (R-06.13). */
  start(): void {
    if (this.handle) return;
    const interval = this.deps.intervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
    const scheduler = this.deps.scheduler ?? nodeIntervalScheduler;
    this.handle = scheduler.every(interval, () => {
      // A rejected sweep is routed to the alert sink too. Without this, an async throw escaping the
      // timer callback becomes an unhandled rejection — loud in the wrong place, and on a process
      // configured to ignore them, not loud at all.
      void this.sweep().catch((error: unknown) => this.deps.onPurgeFailure('*', error));
    });
  }

  stop(): void {
    this.handle?.stop();
    this.handle = undefined;
  }

  get running(): boolean {
    return this.handle !== undefined;
  }
}

export interface RunRecordService {
  readonly store: RunRecordStore;
  readonly purgeDriver: RunRecordPurgeDriver;
  /** Stop the purge schedule. For shutdown and for tests; never for "turning retention off". */
  readonly stop: () => void;
}

/**
 * Obtain a run record store WITH its retention already running.
 *
 * THE ONE PRODUCTION ENTRY POINT (R-06.9, R-06.13, P-82.7). The store and its purge driver are
 * constructed together and the driver is STARTED before this returns.
 */
export function runRecordService(opts: {
  storage: StorageProvider;
  tenants: () => readonly TenantContext[];
  onPurgeFailure: (tenantSlug: string, error: unknown) => void;
  intervalMs?: number;
  scheduler?: IntervalScheduler;
  now?: Clock;
}): RunRecordService {
  const store = new RunRecordStore(opts.storage, opts.now ?? (() => Date.now()));
  const purgeDriver = new RunRecordPurgeDriver({
    store,
    tenants: opts.tenants,
    onPurgeFailure: opts.onPurgeFailure,
    ...(opts.intervalMs !== undefined ? { intervalMs: opts.intervalMs } : {}),
    ...(opts.scheduler !== undefined ? { scheduler: opts.scheduler } : {}),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
  });
  purgeDriver.start();
  return { store, purgeDriver, stop: () => purgeDriver.stop() };
}
