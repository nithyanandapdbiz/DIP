# ADR-0015 — Degraded Operation: Package Caching and Deferred Certification

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-008, AD-009

---

## 1. Problem

The degradation matrix ([05](../architecture/05-cross-plane-communication.md) §4) specifies behaviour for *"Intelligence Plane unavailable, cached package valid"* and *"cached package expired"*, and requires evidence to be queued for later certification.

**Both mechanisms were referenced but never decided.** Without AD-008, rows 2 and 3 of the matrix collapse into row 4 and the matrix is describing something that does not exist. Without AD-009, "certification deferred, never delegated" has no vehicle. These are one decision about how degraded operation actually works, and are recorded together.

## 2. Context

- **INV-7** — the Execution Plane is never blocked by Intelligence Plane unavailability. This is the platform's central availability promise.
- **R-10.2** — certification is deferred, never delegated and never skipped.
- Degraded re-execution of a cached package is, mechanically, a **replay**; only the validity window and idempotency identity distinguish it from an adversarial one ([22](../architecture/22-security-threat-model.md) R-22.5).
- Evidence is expensive to produce and impossible to reproduce once the system under test moves on.
- The queue lives **inside the customer tenancy**, so it is subject to the same isolation, retention and encryption obligations as any other store.

## 3. Alternatives

| Question | Options | Assessment |
|---|---|---|
| Cache a package? | **No** — degrade to deterministic-only whenever the IP is unreachable | Simplest, but discards the matrix's most useful rows and makes a brief DBiz outage as damaging as a long one |
| | **Yes, bounded by the package's own validity window** | **Selected** — reuses an existing security control rather than inventing a second expiry concept |
| | Yes, with a separate cache TTL | Rejected — two expiry concepts that can disagree, and the disagreement is a replay window |
| Queue durability | In-memory | Rejected — a restart loses evidence that cannot be reproduced |
| | **Durable, survives restart** | **Selected** |
| Queue ordering | Strict FIFO | Rejected — one poisoned entry blocks every later certification |
| | **Per-run independent, unordered** | **Selected** — certifications are independent by construction |
| Queue overflow | Drop oldest · drop newest · **stop accepting new work** | **Stop accepting** — see §4 |

## 4. Decision

**Package caching.** The Execution Plane caches the last-known-good execution package per run scope. Its validity is **exactly the package's own validity window** — there is no separate cache TTL. An expired cached package is refused, identically to an expired fresh one (R-22.5). Cached execution is idempotent by the package's run correlation identity, so degraded reuse cannot produce a duplicate execution (R-22.2).

**Deferred certification queue.** Evidence produced during degraded operation is written to a **durable queue inside the customer tenancy**. It survives process restart (R-16.9), is drained when the Intelligence Plane becomes reachable, and entries are **independent and unordered** so one failure cannot block others. Entries are subject to the tenancy's isolation, retention and encryption obligations like any other store, and carry a retention period with a proven purge ([ADR-0006](ADR-0006-retention-model.md)).

**On overflow, the Execution Plane stops accepting new work rather than discarding evidence.** Refusing to start new work is visible and recoverable; silently dropping evidence is neither. Both a full queue and a stalled drain are alerting conditions.

**Reusing the package's own validity window as the cache bound is the load-bearing choice.** A separate TTL would create a period in which a package is invalid for fresh execution but valid from cache — which is precisely an authorised replay channel, and would turn the platform's availability feature into a security weakness.

## 5. Consequences

**Positive.** Rows 2 and 3 of the degradation matrix become real; a DBiz outage degrades gracefully instead of halting testing; no evidence is lost to an outage or a restart; replay protection and caching share one control rather than two that can disagree.

**Negative, accepted.** The Execution Plane gains durable state with real operational weight — durability, monitoring, retention and purge obligations, inside customer infrastructure. Stopping work on overflow means a prolonged DBiz outage eventually halts testing; this is the honest failure mode, and it is loud. Cached packages become stale as validity windows are short by design, so a long outage still degrades to `DEGRADED — UNCERTIFIED`.

**Unchanged.** The Execution Plane still renders no verdict in any degraded state (R-12.17), and certification remains deferred rather than delegated.

## 6. Migration strategy

None required — taken before implementation, and deliberately before M1.6 rather than after, because the degradation matrix already depends on it.

**Forward path.** Queue technology sits behind a platform interface ([ADR-0012](ADR-0012-cloud-portability.md)), so replacing the implementation is an adapter change with a drain-then-switch migration. **Constraint:** any change SHALL preserve durability across restart and SHALL NOT introduce a cache expiry independent of the package validity window — reintroducing that divergence would reopen the replay channel this decision closes.

## 7. Version impact

No contract version change. Package validity and run correlation identity are already contract v1 provenance fields ([20](../architecture/20-cross-plane-contracts.md) §2.1); this decision fixes their use in degraded operation rather than adding shape.

**Forward obligation.** A queued certification submitted after a contract version has been retired must still be certifiable, so queue retention SHALL NOT exceed the contract support window, or the window SHALL be extended to cover it. This is a genuine coupling between two independently-set periods and is recorded so it is not discovered by a failed certification.

## 8. Affected components

[05](../architecture/05-cross-plane-communication.md) §4 (degradation matrix — the owning document) · [04](../architecture/04-execution-plane-architecture.md) §5.3 (queue custody) · [22](../architecture/22-security-threat-model.md) §4 (replay protection) · [16](../architecture/16-runtime-model.md) §3 (shutdown flushes the queue) · [06](../architecture/06-data-sovereignty.md) (queue retention) · [12](../architecture/12-capability-orchestration.md) §7 (degraded stage behaviour) · Execution Plane storage and scheduler.
