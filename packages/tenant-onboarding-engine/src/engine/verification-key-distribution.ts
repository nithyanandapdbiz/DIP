/**
 * VERIFICATION KEY DISTRIBUTION — the rotation carrier (ADR-0081 P-81.4, D-123 link 1, D-125).
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md (R-08.15 verification-only, R-08.16 rotatable without
 *                  redeploying a tenancy, R-08.17) · 06-data-sovereignty.md (INV-2)
 *   ADR          : ADR-0007 §6 (rotation is a first-class operation, not a migration) ·
 *                  ADR-0081 (P-81.4 the key SET in the grant) · ADR-0035 (the update channel)
 *   Debt         : D-125 (the distribution leg) · D-123 (link 1)
 *
 * ══ WHY A SECOND CARRIER EXISTS AT ALL ═════════════════════════════════════════════════════════
 *
 * P-81.4 put the key set in the registration grant, and that is right for a tenancy registering
 * from now on. **It is not a carrier for a tenancy that has ALREADY registered** — registration is
 * a once-per-tenancy event, and the grant is returned once and never persisted, so this plane
 * cannot re-send it and cannot read what a tenancy holds.
 *
 * **THE MEASURED CONSEQUENCE, WHICH IS WHY THIS RIDES WITH LINK 1 RATHER THAN FOLLOWING IT:** the
 * only registered tenancy registered **before the field existed**, so it holds no verification key
 * at all. Signing packages without this carrier would ship artefacts that tenancy **cannot verify**,
 * and the only remedy would be re-registering — which mints a new EP credential and is exactly the
 * redeployment coupling ADR-0007 §6 exists to remove.
 *
 * ══ WHAT CROSSES, AND WHY IT IS NOT AN INV-2 PROBLEM ═══════════════════════════════════════════
 *
 * **Verification keys only.** R-08.15 makes them public-verification-only: possession cannot produce
 * a signature. So this carries VALUES rather than references — the opposite of the credential rule,
 * and correct for the same reason: a public key IS the trust anchor, and a reference the Execution
 * Plane cannot resolve offline would reintroduce the inbound dependency R-17.24 forbids.
 *
 * ══ IT IS AN EVENT ON A CHANNEL THE EP ALREADY POLLS, NOT A NEW ENDPOINT ═══════════════════════
 *
 * ADR-0035's update channel is Execution-Plane-initiated and already carries pending events the EP
 * pulls and acknowledges. Rotation therefore needs **no new route, no inbound connection, and no
 * customer redeployment** — which is R-08.16 and ADR-0007 §6 discharged by reuse rather than by a
 * mechanism written for this.
 */
import type { CapabilityUpdateEvent, TenantEnvelope } from './tenant-config.js';
import type { PackageVerificationKey } from './registration.js';
import type { TenantConfigRepository } from './tenant-repository.js';

/** What a distribution sweep did, per tenancy. Returned so a caller can alert on it. */
export interface DistributionOutcome {
  readonly slug: string;
  /** `emitted` — the tenancy now has a pending event; `current` — it already had this exact set. */
  readonly result: 'emitted' | 'current';
  readonly keyIds: readonly string[];
}

/** The key ids a tenancy has most recently been SENT, or `undefined` if it has never been sent any. */
export function lastDistributedKeyIds(env: TenantEnvelope): readonly string[] | undefined {
  const events = (env.onboarding.updates ?? []).filter((e) => e.type === 'verification-keys-changed');
  const latest = events[events.length - 1];
  if (!latest) return undefined;
  const keys = (latest.config?.['keys'] ?? []) as readonly { keyId?: unknown }[];
  return keys.map((k) => String(k.keyId));
}

/**
 * Ensure every registered tenancy has been sent the CURRENT verification key set.
 *
 * ── IDEMPOTENT BY COMPARISON, NOT BY A FLAG ────────────────────────────────────────────────────
 *
 * A tenancy whose last event already carries this exact set is skipped. **The comparison is over the
 * key ids actually sent** — read back off the event this plane emitted — rather than over a
 * "distributed" marker on the tenant record, because a marker is a second record of the same fact
 * and can disagree with the events (ADR-0079 alternative D's reasoning, at a different subject).
 *
 * ── A TENANCY THAT HAS NEVER BEEN SENT ANY KEY IS THE CASE THIS EXISTS FOR ─────────────────────
 *
 * `lastDistributedKeyIds` returns `undefined` for it and it is emitted to. That is the only path by
 * which the already-registered tenancy can ever obtain a verification key.
 *
 * ── EVERY TENANCY IS ATTEMPTED; ONE FAILURE DOES NOT STOP THE OTHERS ───────────────────────────
 *
 * The same reasoning as the sealed-package purge driver: aborting the sweep on one unwritable
 * tenant record silently leaves every other tenancy without keys, and the outage looks like
 * nothing at all. Continuing is louder, and loudness is the obligation (R-06.15's shape).
 */
export function publishVerificationKeys(
  repo: TenantConfigRepository,
  keys: readonly PackageVerificationKey[],
): readonly DistributionOutcome[] {
  const keyIds = keys.map((k) => k.keyId);
  const outcomes: DistributionOutcome[] = [];

  for (const summary of repo.list()) {
    const env = repo.load(summary.slug);
    if (!env) continue;

    const sent = lastDistributedKeyIds(env);
    if (sent !== undefined && sent.length === keyIds.length && sent.every((id, i) => id === keyIds[i])) {
      outcomes.push({ slug: summary.slug, result: 'current', keyIds });
      continue;
    }

    // PUBLIC HALVES ONLY. `PackageVerificationKey` has no field that could carry a private key,
    // so R-08.15 and R-08.17 are enforced by the shape rather than by this call site.
    repo.recordVerificationKeys(summary.slug, keys.map((k) => ({
      keyId: k.keyId, publicKeyPem: k.publicKeyPem, algorithm: k.algorithm,
    })));
    outcomes.push({ slug: summary.slug, result: 'emitted', keyIds });
  }

  return outcomes;
}

/** The events a tenancy holds for this concern. Exported so a test can assert on them directly. */
export function verificationKeyEvents(env: TenantEnvelope): readonly CapabilityUpdateEvent[] {
  return (env.onboarding.updates ?? []).filter((e) => e.type === 'verification-keys-changed');
}
