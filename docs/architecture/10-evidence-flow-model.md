# 10 — Evidence Flow Model

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.3
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 9 and 10
**Resolves:** AD-004

**This document owns:** evidence capture, custody, integrity, the reference chain, and why a decision outlives the evidence it cites.
**It does not own:** contract shape ([20](20-cross-plane-contracts.md)), classification and retention periods ([06](06-data-sovereignty.md)), or transport ([05](05-cross-plane-communication.md)).

---

## 1. What evidence is

**R-10.1** **Evidence** is the record of what actually happened during execution: what was done, what was observed, and what state existed at the moment of observation.

**R-10.2** Evidence is **produced and custodied by the Execution Plane**, in the customer's tenancy (INV-1).

**R-10.3** Evidence is **not** a judgment. It records observation; it asserts no verdict.

**The separation is the point.** The plane that performs the work holds the evidence; the plane that reasons holds the judgment. Neither can manufacture a certified result alone — the Intelligence Plane has judgment but no evidence, and the Execution Plane has evidence but no authority to judge it. This is what makes a certification meaningful to a third party.

## 2. The chain

```
execution package ──(hash)──▶ evidence record ──(hash)──▶ decision
       │                            │                         │
   IP authors                  EP captures                IP renders
   EP executes                 EP custodies               IP retains
```

**R-10.4** Every evidence record SHALL reference the **execution package hash** that produced it (R-4.4).

**R-10.5** Every decision SHALL reference the **evidence hashes** it was rendered over.

**R-10.6** The chain SHALL be traversable in both directions: from a decision to the evidence it cites, and from a package to everything it produced.

**R-10.7** Every execution SHALL be attributable to exactly one package hash. An unattributable execution is a violation.

## 3. Capture

**R-10.8** What is captured is declared in the execution package's **evidence requirements** ([20](20-cross-plane-contracts.md) §2.1). Capture is directed, not incidental.

**R-10.9** Evidence SHALL be classified at capture and scrubbed on the write path ([06](06-data-sovereignty.md), [09](09-data-flow-model.md)).

**R-10.10** Capture failure SHALL be **recorded as such**. Missing evidence is a stated fact, never an empty result.

**R-10.10 matters more than it appears.** An empty evidence set and a failed capture are indistinguishable to a consumer unless the difference is recorded — and they mean opposite things. One says "nothing was observed"; the other says "we do not know what was observed."

## 4. Integrity — AD-004 resolved

**R-10.11** Evidence integrity SHALL use the platform's **single canonical primitive** (R-20.17). A second implementation is a Constitutional violation.

**R-10.12** The algorithm SHALL be **SHA-256**, applied as:

```
digest = SHA-256( domain ‖ 0x00 ‖ canonical(content) )
```

| Element | Requirement |
|---|---|
| **Domain** | A required, non-empty domain string identifying what is being hashed. Not optional, not defaulted |
| **Separator** | A single byte that cannot occur in a domain string, so domain and content cannot be confused |
| **Canonical form** | Deterministic serialisation (RFC 8785) — identical logical content always yields identical bytes |
| **Algorithm version** | Recorded **on every record**, alongside the digest |

**R-10.13** A hashing call without a domain SHALL be impossible to express. Where the language permits, this is enforced at compile time (C-0.1).

**R-10.14** Every hashed record SHALL carry its algorithm version (R-20.19).

**R-10.15** Verification SHALL select the algorithm by the record's declared version, so multiple versions coexist during migration.

### Why each element is mandatory

**Domain separation.** Without it, a digest computed over one kind of object is a valid digest for any other object with the same bytes. A hash of a package could be presented as a hash of evidence. Domain separation makes the *meaning* part of the digest.

**The version field.** Evidence outlives algorithms. Without a per-record version, changing the algorithm requires every producer and verifier to switch simultaneously — a flag day across hundreds of independently-scheduled customer deployments, which is not a migration that can actually be performed. **With it, the change is incremental and safe.**

**One implementation.** The predecessor permitted one governed term two implementations. Their canonical forms agreed; their digests diverged, because one lacked domain separation. Evidence written by one and verified by the other reported **tampering on untampered records**.

> A false tamper verdict is more corrosive than a missed detection. It reports corruption where none occurred, is indistinguishable from real corruption, and **trains operators to discount the control**. An integrity check that cries wolf is worse than no check at all.

## 5. Custody and what crosses

**R-10.16** Evidence **payloads** remain in the customer's tenancy. They do not cross TB1 (R-9.1, INV-1).

**R-10.17** What crosses is an **evidence reference**: an identifier, a content hash, an algorithm version, and a classification — never the content.

**R-10.18** The Intelligence Plane SHALL NOT persist evidence payloads (R-03.16).

## 6. Why a decision outlives its evidence

**R-10.19** A decision SHALL remain auditable after the evidence it cites has been purged.

**R-10.20** Evidence expiry SHALL NOT invalidate, alter, or delete the decision that cited it.

**This resolves the tension the whole model exists to resolve.** Sovereignty requires evidence to stay with the customer and be purged on the customer's schedule. Auditability requires a certification to be defensible for the life of the release it authorised — which is longer.

Retaining the **hash** rather than the payload satisfies both. The decision record states precisely *what was judged* — a specific, verifiable artefact — without holding the artefact. If the evidence still exists, the claim is verifiable. If it has been purged, the record still shows what was judged and when, and it remains a coherent audit trail rather than a dangling reference.

**R-10.21** An expired evidence reference SHALL be reported as **expired**, never as missing or as failed verification.

**R-10.21 is the same distinction as R-10.10, at the other end of the lifecycle.** "Purged on schedule" and "cannot be found" mean very different things, and only one of them is a problem.

## 7. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-10.1** | Exactly one implementation of the integrity primitive exists platform-wide | Governed-term registry gate |
| **C-10.2** | A hash cannot be computed without a domain | Compile-time where possible; signature test otherwise |
| **C-10.3** | Canonicalisation is byte-identical across implementations and platforms | Cross-implementation equivalence test in CI |
| **C-10.4** | Every hashed record carries its algorithm version | Schema gate |
| **C-10.5** | Verification selects the algorithm by the record's declared version | Multi-version verification test |
| **C-10.6** | Two records differing only in domain produce different digests | Domain-separation test |
| **C-10.7** | Every evidence record carries its producing package hash | Schema gate |
| **C-10.8** | The chain is traversable decision → evidence and package → evidence | Bidirectional traversal test |
| **C-10.9** | No evidence payload appears in any outbound message or Intelligence Plane store | Outbound gate; store-schema gate |
| **C-10.10** | Capture failure is recorded as failure, distinguishable from empty | Capture-failure test |
| **C-10.11** | A decision remains auditable after its evidence is purged | Expired-evidence audit test |
| **C-10.12** | An expired reference reports as expired, not as missing or tampered | Expiry classification test |
| **C-10.13** | An altered evidence payload fails verification | Tamper-detection test |
| **C-10.14** | An unaltered payload never fails verification | **False-positive test** across all supported algorithm versions |

**C-10.14 is the test the predecessor most needed and did not have.** Tamper detection is usually tested only in the positive direction — corrupt something, assert it is caught. The failure that actually occurred was the opposite: *untampered* evidence failing verification. A false-positive test across every supported version is what catches an implementation fork before any evidence is written under it.

## 8. Open items

| # | Item | Target |
|---|---|---|
| **AD-024** | Whether evidence is signed by the Execution Plane in addition to being hashed | M1.5 |

**AD-024 concerns what a hash cannot prove.** A content hash proves evidence has not changed since it was hashed; it does not prove *who* produced it. If a customer must demonstrate to a third-party auditor that evidence originated from their own deployment rather than being constructed afterwards, hashing alone is insufficient and signing is required. This is a regulatory question whose answer varies by industry, so it is recorded rather than presumed.
