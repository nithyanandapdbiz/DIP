# Architecture Certification Report — Enterprise Architecture v1.0

**Programme:** DBiz Agentic QA Platform — Enterprise Re-Foundation
**Phase:** P1 — Canonical Enterprise Architecture
**Date:** 2026-07-22 · **Baseline version:** 1.0

**No implementation was performed in this phase. No runtime code exists.**

---

## 1. What is certified

> **The architecture is complete, internally consistent, mechanically verifiable, and stable enough to implement against.**

| Certified | Not certified |
|---|---|
| Every architectural topic has exactly one canonical owning document | That the implementation conforms — **there is no implementation** |
| Every document carries citable conformance criteria | That the criteria pass — they describe a system not yet built |
| Every closed decision is traceable to a complete ADR | That every open question is answered — 17 remain, recorded |
| The document set passes its integrity gate | That the platform is deployable — no image exists |
| Change control is defined and takes effect at freeze | That gate mechanisms exist for every criterion — most are P3 |

**The distinction matters.** Architectural stability and implementation conformance are different properties. This report certifies the first. The second is what P3 onward exists to establish, and it is why governance-as-code precedes runtime in this programme.

## 2. Scope

| | Count |
|---|---|
| Canonical architecture documents | **22** |
| Architecture Decision Records | **15** |
| Numbered rules | **474** |
| Conformance criteria | **309** |
| Invariants | 8 |
| Constitutional rules | 11 |
| Prohibited decisions | 11 |
| Decisions closed by ADR | **18** |
| Decisions open and recorded | **17** |

## 3. Review pipeline

| # | Review | Result | Evidence |
|---|---|---|---|
| 1 | **Developer** | PASS | All 22 documents authored; both governance checks execute and exit cleanly |
| 2 | **Architecture** | PASS | Every topic has one owner (§4); no duplication; all cross-references resolve |
| 3 | **Security** | PASS | Threat model enumerates 7 actors, 7 assets, 23 attack paths, each mapped to a controlling criterion; 5 residual risks stated, not hidden |
| 4 | **Governance** | PASS | Every constitutional rule names ≥3 independent mechanisms; `NOT RUN` ≡ `FAIL` implemented in the runner |
| 5 | **Performance** | PASS *(specification)* | Concurrency, timeout, cancellation and fairness specified with criteria ([ADR-0013](../adr/ADR-0013-execution-lifecycle-limits.md)). **No measurement is possible — nothing runs.** |
| 6 | **Documentation** | PASS | Integrity gate enforces headers, ownership boundaries, conformance criteria, reference integrity, number uniqueness |
| 7 | **Certification** | PASS | This report |

**Review 5 is qualified deliberately.** Performance is specified, not demonstrated. Recording it as an unqualified pass would be the kind of assertion this programme exists to avoid.

## 4. Single authoritative ownership

**Verified.** `ARCHITECTURE_STATUS.md` §3 maps every architectural topic to exactly one owning document. Each document declares what it owns **and what it does not**, enforced by the integrity gate — a document that does not state its boundary cannot be checked for overstepping it.

**One duplication was found and removed during the phase.** Adding document 22 duplicated the threat table in 08. It was removed from 08 on discovery, per the standing instruction. 08 now defines controls; 22 defines the threats those controls answer.

## 5. Gate results

```
[PASS] canonical architecture set integrity      verify-architecture-integrity.js
[PASS] ADR completeness and decision traceability verify-adr-completeness.js
RESULT: PASS — 2 gating checks green.
```

**Both gates have been observed to fail (C-0.3).**

| Gate | Fault injected | Behaviour |
|---|---|---|
| Architecture integrity | Document with no ownership boundary, no conformance criteria, dangling reference | Named all three failures, exited 1 |
| ADR completeness | ADR missing required sections; duplicate closure; decision closed with no ADR | Named each failure, exited 1 in both directions |

Probes were removed and the suite reconfirmed green in both cases. **A gate never observed to fail is indistinguishable from one that cannot fail**, so neither would have counted toward C-0.2 without this.

**Each gate found a real defect on first run** — which is the strongest available evidence that they measure something:

- Architecture integrity found the **Constitution had no citable conformance identifiers**, so a violation could be described but not *named*. Fixed by adding C-01.1 through C-01.32.
- ADR completeness found **seven decisions closed in M1.5 with no ADR** — the same D-001 pattern recurring immediately after D-001 was cleared. Fixed by ADR-0009 through ADR-0014.

In both cases the document was corrected, never the gate (P-001, P-002).

## 6. Technical debt

| # | Item | Status |
|---|---|---|
| **D-001** | Retrospective ADRs owed for decisions closed before ADRs became mandatory | **CLOSED** — ADR-0003 through ADR-0008 |
| **D-002** | Seven further decisions closed in M1.5 without ADRs *(found by gate)* | **CLOSED** — ADR-0009 through ADR-0014 |
| **D-003** | AD-008 and AD-009 open while the degradation matrix depended on them *(found during certification)* | **CLOSED** — ADR-0015 |

**Register is empty at freeze.** No debt blocks certification.

**D-003 warrants comment.** The degradation matrix specified behaviour for a cached package and a deferred queue, while the decisions establishing that either exists were open. The architecture was describing a mechanism nobody had decided on. Freezing in that state would have embedded an incoherence into the baseline, which is precisely what a freeze makes expensive to fix.

## 7. Open decisions

**17 remain, all recorded with an owner and a target.** None destabilises the baseline: every one selects an implementation route to a rule that is already fixed.

| Target | Decisions |
|---|---|
| **P2** | AD-010 (SPI signatures) · AD-024 (evidence signing) · AD-025 (capability versioning) · AD-029 (model pinning) · AD-030 (customer adapters) · AD-031 (config audit) · AD-032 (run resumability) · AD-033 (managed Execution Plane) · AD-034 (customer attestation) |
| **P2+** | AD-007 (mobile scope) · AD-013 (knowledge graph storage) · AD-018 (onboarding model) · AD-020 (cross-tenant aggregation — **presumed prohibited**) · AD-021 (IdP integration) · AD-022 (incident response) · AD-028 (hardware signing) |

**Three carry disproportionate weight.**

- **AD-010 — SPI method signatures.** The predecessor deferred exactly this as "implementation detail" and then built one of eight declared adapter layers. Deferring the *how* is correct for a constitution and dangerous for a roadmap. It has an owner and a milestone; that is the difference.
- **AD-020 — cross-tenant aggregation.** Commercially attractive and **irreversible once data has been aggregated under it**. Presumed prohibited until an approved ADR says otherwise.
- **AD-024 — evidence signing.** Leaves residual risk RR-1 open: hashing proves evidence has not changed, not who produced it.

## 8. Residual risks

Stated rather than closed, per R-11.5.

| # | Risk | Status |
|---|---|---|
| RR-1 | Evidence authorship unproven — integrity ≠ origin | AD-024 open |
| RR-2 | A compromised Execution Plane can misreport within its own tenancy | **Accepted** — customer infrastructure, customer trust boundary |
| RR-3 | Insider with signing-key access could author packages for any tenant | Mitigated by custody and rotation; AD-028 open |
| RR-4 | PII scrubbing false negatives | Reduced by fail-closed posture ([ADR-0014](../adr/ADR-0014-pii-scrubbing-posture.md)); not eliminated |
| RR-5 | Cross-tenant inference via knowledge graph | Presumed prohibited pending AD-020 |

## 9. Certification

> ### The Enterprise Architecture is CERTIFIED at version 1.0.

**Basis.**

1. **Every architectural question has exactly one canonical answer**, mechanically verified.
2. **Every closed decision is traceable to a complete ADR** carrying migration strategy and version impact — so a future reversal has a baseline to migrate from.
3. **Conformance is measurable**: 309 criteria, each naming what verifies it.
4. **The verification apparatus exists and has been proven to fail** — twice, in both directions, and it found real defects on first run.
5. **Unknowns are bounded and recorded**: 17 open decisions, 5 residual risks, none destabilising.
6. **No debt blocks certification.**

**What this certification does not assert.** That the implementation conforms — none exists. That the criteria pass — they describe a system not yet built. That nothing further will be learned.

## 10. Freeze and change control

> ### Enterprise Architecture v1.0 is FROZEN as of 2026-07-22.

**From this point, any architectural change requires — before implementation:**

1. An **ADR** with all eight required sections
2. An **impact analysis** naming affected components and criteria
3. A **migration strategy**
4. A **governance review**

**A finding, an outage, a deadline, or an implementation difficulty is never grounds for amendment** (A-2). Rejected amendments are recorded as prohibited decisions, so convenience cannot later be mistaken for a determination (A-3).

**The programme now transitions to P2 — Platform Contracts & Interfaces — under Architecture Change Control.**

---

## 11. Statement

The predecessor platform was assessed by its own board as *architecturally sound and implementationally non-conformant*, carrying 76 recorded violations against an architecture two independent reviews declined to change. Its closing finding named the cause exactly: **the verification apparatus that would have caught them did not run where the work happened.**

This architecture is not certified because it is well-written. It is certified because **the apparatus that would detect its violation exists, has been observed to fail, and has already caught three real defects — one of them in the Constitution itself, and one introduced by this programme immediately after resolving the identical pattern.**

That last point is the most useful evidence in this report. The failure mode recurred *within a single phase, under an explicit instruction to prevent it*. It was caught by a machine rather than by discipline — which is the entire argument for building governance before runtime.

---

## 12. Amendment record

Certification is rendered over a **stated baseline** (R-18.20). An amendment that is not recorded here would leave the certified baseline and the actual architecture describing different systems — the precise condition R-18.19 exists to make checkable.

| # | Amendment | Documents | Effect on this certification |
|---|---|---|---|
| 1 | [ADR-0016](../adr/ADR-0016-ai-tool-agnosticism.md) — AI tool agnosticism: capability classes, not products | 01, 13, 18 → v1.1 | **Certification stands.** Additive only |

**Why certification stands rather than being re-rendered.** ADR-0016 adds INV-9, Rule 12, an AI Capability Class taxonomy, three review-pipeline rules and eight conformance criteria. It **weakens no invariant, relaxes no rule, and removes no criterion** — every property certified at v1.0 remains true and remains checked. Under A-4 this is an extension, not an amendment to an existing invariant.

The amendment also ships its own gate, `verify-ai-vendor-neutrality.js`, observed to fail on a planted violation before being trusted (C-0.3). **It caught two real defects on its first run**: two entries in the risk register cited the unversioned tool bootstrap file as the source of a standing rule — simultaneously a vendor coupling and a precedence violation. Both were corrected to cite the governing charter.

That is now the fourth defect this apparatus has caught that no reviewer had raised, and the second found in an artefact that had already passed review.

**Amended baseline: 22 documents · 16 ADRs · 489 rules · 317 conformance criteria · 3 gating checks.**

---

*Issued by the Enterprise Certification Authority · 2026-07-22*
*v1.0 as certified: 22 documents · 15 ADRs · 474 rules · 309 conformance criteria · 18 decisions closed · 17 open · 5 residual risks · 0 blocking debt*
*Amended to v1.1 by ADR-0016 — see §12.*
