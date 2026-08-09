# ADR-0005 — The Canonical Integrity Primitive

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-004
**Retrospective:** decision taken in M1.3; regularised under D-001

---

## 1. Problem

Content addressing and integrity verification are needed for execution packages, evidence records, and decisions. Which algorithm, applied how, and with what provision for change over a seven-year retention horizon?

## 2. Context

This decision is taken **before any producer or consumer exists**, deliberately.

The predecessor permitted one governed term — `contentHash` — two implementations in two packages. Their canonical forms agreed; their digests diverged, because one lacked domain separation. Evidence written by one and verified by the other reported **tampering on untampered records**, proven by execution.

> A false tamper verdict is more corrosive than a missed detection. It reports corruption where none occurred, is indistinguishable from genuine corruption, and **trains operators to discount the control**.

Evidence is retained for years and outlives algorithm generations. Hundreds of customer deployments upgrade on independent schedules.

## 3. Alternatives

| Question | Options | Selected |
|---|---|---|
| Algorithm | SHA-256 · SHA-512 · SHA-3 · BLAKE3 | **SHA-256** — universally available in every runtime and FIPS-validated implementation, hardware-accelerated, and the conservative choice for a control an external auditor must accept. Speed is not a constraint at this volume. |
| Domain separation | None · optional parameter · **required parameter** | **Required.** An optional parameter is omitted under deadline; the predecessor's one-argument hash function is exactly this failure. |
| Version recording | Implicit by deployment · **explicit per record** | **Per record.** |
| Implementations | One per layer · **exactly one platform-wide** | **Exactly one.** |

## 4. Decision

```
digest = SHA-256( domain ‖ 0x00 ‖ canonical(content) )
```

- **One implementation** platform-wide, in one shared package. A second is a Constitutional violation (R-20.21).
- **Domain** is a required, non-empty parameter. A call without one SHALL be inexpressible where the language permits (R-10.13).
- **Separator** is a byte that cannot occur in a domain string, so domain and content cannot be confused.
- **Canonical form** is RFC 8785 ([ADR-0004](ADR-0004-wire-format.md)).
- **Algorithm version** is recorded on every record; verification selects by the record's declared version.

**Why each element is load-bearing.** Without domain separation, a digest over one kind of object is a valid digest for any other object with the same bytes — a package hash could be presented as an evidence hash; separation makes *meaning* part of the digest. Without a per-record version, changing the algorithm requires every producer and verifier to switch **simultaneously** — a flag day across hundreds of independently-scheduled deployments, which is not a migration that can actually be performed.

## 5. Consequences

**Positive.** Integrity is verifiable by any third party with a standard SHA-256 implementation; algorithm change is incremental rather than a flag day; cross-context digest replay is structurally prevented; one implementation means one behaviour.

**Negative, accepted.** Every hashed record carries version metadata overhead. Verification must dispatch on version, which is marginally more complex than a fixed algorithm — and is the entire reason migration is possible.

**Structural obligation.** A governed-terms registry with exactly one owning module per term, and a CI gate failing on a second definition (C-20.1). A **cross-implementation equivalence test** runs in CI (C-10.3) — precisely the check that would have caught the predecessor's fork before evidence was written under it.

## 6. Migration strategy

**Algorithm change is a first-class supported operation, not an exception.**

1. Register the new algorithm as a new version; the primitive supports both concurrently.
2. New records are written under the new version.
3. Existing records verify under their own declared version — **no re-hashing, no flag day**.
4. Retire the old version only when no record under it remains within retention.

**Constraint.** Canonicalisation changes are *not* algorithm changes: they alter the bytes hashed and therefore invalidate existing digests. A canonicalisation change requires re-hashing under a new algorithm version and is a **major contract version**.

## 7. Version impact

Establishes algorithm version 1. Contract v1 requires the algorithm-version field on every hashed record.

**Forward obligation.** Adding an algorithm version is a **minor** contract change, because the field already exists and consumers already dispatch on it. This is the property the per-record version buys, and it is why the field is mandatory from record one rather than added when first needed.

## 8. Affected components

[10](../architecture/10-evidence-flow-model.md) §4 (owning document) · [20](../architecture/20-cross-plane-contracts.md) §4 (contract requirement) · [19](../architecture/19-repository-ownership.md) §3.4 (shared package placement) · [22](../architecture/22-security-threat-model.md) (evidence tamper paths P-13, P-14) · execution package content addressing · evidence records · decision records · the governed-terms registry.
