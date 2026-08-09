/**
 * The sealed package purge driver (ADR-0079 P-79.4, R-06.13, R-06.15).
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md (R-06.13 purge enforced by code ON A SCHEDULE,
 *                  R-06.14 unreadable afterwards, R-06.15 purge failure alerts loudly) ·
 *                  07-tenant-isolation.md · 17-deployment-topology.md
 *   ADR          : ADR-0079 (the store this drives) · ADR-0060 (the provider platform)
 *   Criteria     : C-06.8 (every store has a passing purge-verification test) · C-06.7
 *
 * WHY THIS FILE EXISTS, AND IT IS NOT A TIDY-UP.
 *
 * `SealedPackageStore.purgeExpired` was correct and NOTHING CALLED IT. R-06.13 does not say
 * "purge is implemented"; it says purge is **enforced by code on a schedule, never
 * operator-initiated**. A retention method with no driver is a declared control that does not
 * execute — which document 06 calls CONFIGURATION THEATRE and R-06.12's rationale records as the
 * predecessor's actual failure.
 *
 * That shape appeared in ADR-0079's OWN implementation, in the change written to prevent it, and
 * the gate that shipped alongside was green over it because it measured the MECHANISM rather
 * than the SCHEDULE. Both are repaired here: this driver, and the gate branches that measure it.
 *
 * ── TWO PROPERTIES ARE STRUCTURAL RATHER THAN CHECKED ───────────────────────────────────────
 *
 * **1. A DRIVER CANNOT BE BUILT WITHOUT AN ALERT SINK.** `onPurgeFailure` is a REQUIRED field.
 * There is no default, no optional marker and no fallback to a logger. R-06.15 says purge
 * failure SHALL be a loud, alerting condition and never a silent skip; a sink that can be
 * omitted is a silent skip that has not happened yet. Omitting it is a compile error, which is
 * structural impossibility rather than a runtime check (C-0.1).
 *
 * **2. A STORE CANNOT BE PUT INTO SERVICE WITHOUT ITS DRIVER.** `sealedPackageService()` is the
 * one way to obtain a store for production use: it constructs the store and STARTS its purge
 * driver in the same call, and hands back both. The bare `SealedPackageStore` constructor
 * remains available to tests, which need a store without a live timer — but nothing in a running
 * system should reach for it, because a store obtained that way has no retention.
 *
 * ── ONE TENANT'S FAILURE MUST NOT STOP THE OTHERS ───────────────────────────────────────────
 *
 * A sweep continues past a failing tenant, alerting for each. The alternative — abort the sweep
 * — means a single unreadable partition silently suspends retention for every other tenant, and
 * the outage looks like nothing at all. Continuing is louder, and loudness is the obligation.
 */
import type { TenantContext } from '../tenant/tenant-context.js';
import type { Clock } from '../distributed/distributed-state-provider.js';
import type { StorageProvider } from './storage-provider.js';
import { SealedPackageStore, type TenantOwnershipResolver, AUTHORISING_ADR } from './sealed-package-store.js';

/** The default sweep interval. Retention is bounded in days; hourly is ample and cheap. */
export const DEFAULT_PURGE_INTERVAL_MS = 3_600_000;

/** What a sweep did, per tenant. Returned so a caller can assert on it and so tests can. */
export interface PurgeSweepOutcome {
  readonly sweptTenants: number;
  readonly purgedHashes: readonly string[];
  readonly failures: readonly { readonly tenantSlug: string; readonly error: unknown }[];
}

/**
 * The timer port. Injected so a sweep is testable without wall-clock time, and so the platform
 * never reaches for a Node global directly from business code.
 */
export interface IntervalScheduler {
  every(ms: number, fn: () => void): { stop: () => void };
}

/** The default port: `setInterval`, unreferenced so a purge timer never holds the process open. */
export const nodeIntervalScheduler: IntervalScheduler = {
  every(ms, fn) {
    const t = setInterval(fn, ms);
    if (typeof (t as unknown as { unref?: () => void }).unref === 'function') {
      (t as unknown as { unref: () => void }).unref();
    }
    return { stop: () => clearInterval(t) };
  },
};

export interface PurgeDriverDeps {
  readonly store: SealedPackageStore;
  /** The tenants to sweep. Read fresh on EVERY sweep, so an onboarded tenant is covered. */
  readonly tenants: () => readonly TenantContext[];
  /**
   * REQUIRED (R-06.15). Called once per failing tenant. There is no default and no optional
   * marker: a purge driver that can be constructed without an alert sink is a silent skip.
   */
  readonly onPurgeFailure: (tenantSlug: string, error: unknown) => void;
  readonly intervalMs?: number;
  readonly scheduler?: IntervalScheduler;
  readonly now?: Clock;
}

export class SealedPackagePurgeDriver {
  /** Recorded in source so the gate can tie the driver to the decision that requires it. */
  static readonly authorisingAdr = AUTHORISING_ADR;

  private handle: { stop: () => void } | undefined;

  constructor(private readonly deps: PurgeDriverDeps) {}

  /**
   * One sweep across every tenant.
   *
   * FAILURE ALERTS AND THE SWEEP CONTINUES (R-06.15). The `catch` below does NOT swallow: it
   * calls `onPurgeFailure` and records the failure in the returned outcome. A bare `catch {}`
   * here would be the exact defect this file was written to remove, and the gate plants one to
   * prove it would be caught.
   */
  async sweep(): Promise<PurgeSweepOutcome> {
    const now = this.deps.now ? this.deps.now() : Date.now();
    const purgedHashes: string[] = [];
    const failures: { tenantSlug: string; error: unknown }[] = [];
    const tenants = this.deps.tenants();

    for (const ctx of tenants) {
      try {
        purgedHashes.push(...(await this.deps.store.purgeExpired(ctx, now)));
      } catch (error) {
        failures.push({ tenantSlug: ctx.tenantSlug, error });
        this.deps.onPurgeFailure(ctx.tenantSlug, error);
      }
    }
    return { sweptTenants: tenants.length, purgedHashes, failures };
  }

  /**
   * Start sweeping on the schedule. THIS is what makes purge scheduled rather than
   * operator-initiated (R-06.13).
   *
   * A rejected sweep is routed to the alert sink too. Without this an async throw escaping the
   * timer callback becomes an unhandled rejection — which is loud in the wrong place and, on a
   * process configured to ignore them, is not loud at all.
   */
  start(): void {
    if (this.handle) return;
    const interval = this.deps.intervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
    const scheduler = this.deps.scheduler ?? nodeIntervalScheduler;
    this.handle = scheduler.every(interval, () => {
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

export interface SealedPackageService {
  readonly store: SealedPackageStore;
  readonly purgeDriver: SealedPackagePurgeDriver;
  /** Stop the purge schedule. For shutdown and for tests; never for "turning retention off". */
  readonly stop: () => void;
}

/**
 * Obtain a sealed package store WITH its retention already running.
 *
 * THE ONE PRODUCTION ENTRY POINT (R-06.9, R-06.13). The store and its purge driver are
 * constructed together and the driver is STARTED before this returns, so there is no window —
 * and no code path — in which a store is serving reads while nothing enforces its retention.
 * That is the property `purgeExpired` alone could not give, because a method's existence says
 * nothing about whether anything calls it.
 */
export function sealedPackageService(opts: {
  storage: StorageProvider;
  owners: TenantOwnershipResolver;
  tenants: () => readonly TenantContext[];
  onPurgeFailure: (tenantSlug: string, error: unknown) => void;
  intervalMs?: number;
  scheduler?: IntervalScheduler;
  now?: Clock;
}): SealedPackageService {
  const store = new SealedPackageStore(opts.storage, opts.owners, opts.now ?? (() => Date.now()));
  const purgeDriver = new SealedPackagePurgeDriver({
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
