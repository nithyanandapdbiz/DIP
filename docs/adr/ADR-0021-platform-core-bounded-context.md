# ADR-0021 — Platform Core as a Bounded Context, and Where It Is Documented

**Status:** ACCEPTED · **Date:** 2026-07-22
**Amends:** [03](../architecture/03-intelligence-plane-architecture.md) v1.0→v1.1 · [21](../architecture/21-tenant-lifecycle.md) v1.0→v1.1 · [08](../architecture/08-security-model.md) v1.1→v1.2
**Scope:** P2.3 — Tenant Onboarding & Secure Solution Generation

---

## 1. Problem

P2.3 introduces tenant onboarding, technology profiles, automated solution generation, Execution Plane bootstrap, secure registration and extended lifecycle management. It must be integrated **without** creating a twenty-sixth document, a seventh capability, a third plane, or a fourth Platform Service — and **without introducing architectural drift**.

The instruction was to place all of it in a new *Platform Core* section inside document 24 (Platform Intelligence).

**That placement would itself be the drift it was meant to avoid**, and this ADR records why, along with the placement that achieves the same objective without it.

## 2. Context

The topic-ownership contract (`ARCHITECTURE_STATUS.md` §3) assigns every architectural topic exactly one canonical owner. Three of the four concerns P2.3 introduces **already have owners**:

| P2.3 concern | Existing canonical owner | Declared ownership |
|---|---|---|
| Tenant onboarding, registration, lifecycle | **21 — Tenant Lifecycle** | *"tenant identity, onboarding, provisioning, state transitions, suspension, and offboarding"* |
| Secure registration, mTLS, OAuth/OIDC, tokens | **08 — Security Model** | *"trust boundaries, identity, authentication, authorisation, secrets, encryption, signing"* |
| Internal structure of the Intelligence Plane | **03 — IP Architecture** | *"the internal structure of the Intelligence Plane"* |
| **Solution generation, technology profiles** | **none** | genuinely new |

Document 24 owns *"engineering, governance, operational, customer, AI and executive intelligence; the analytics pipeline; dashboard architecture; and evidence sourcing."* It owns **none** of the above.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Document 26 — Platform Core** | Rejected by constraint, and rightly: it would enlarge the certified set and require re-certification of the M2.5a baseline. |
| **All of Platform Core inside document 24** | **Rejected.** It would give tenant onboarding two owners (21 and 24) and authentication two owners (08 and 24), breaching the anti-duplication contract. It would also make document 24 answer two unrelated questions — analytics *and* provisioning — which is the navigability defect the small canonical set exists to prevent. A reader asking "where is onboarding defined?" would get two answers, and no mechanism would say which is current. |
| **Distribute to existing owners; new material to document 03** | **Selected.** |
| **Rename document 24 to cover both** | Rejected. A document that owns two unrelated domains has no meaningful boundary, and the integrity gate's ownership check would become vacuous. |

## 4. Decision

**Platform Core is a logical bounded context inside the Intelligence Plane — not a deployable, not a plane, not a service, not a document.**

The Intelligence Plane contains exactly two bounded contexts:

| Context | Responsibility |
|---|---|
| **Platform Core** | Tenant onboarding, registration, technology profiles, solution generation, repository and deployment package generation, identity, licensing, lifecycle, API gateway, platform administration |
| **Intelligence Core** | AI agents, workflow runtime, decision intelligence, the six capability engines, governance, reporting, certification |

**These are contexts within one deployable.** R-1.1 is untouched: there remain exactly two deployable runtimes.

### 4.1 Documentation placement

| Material | Document | Rationale |
|---|---|---|
| The two bounded contexts; Platform Core structure; **Solution Generation Engine**; **Technology Profiles** | **03** | It owns IP internal structure, and a bounded context *is* internal structure. The generation engine is genuinely new and has no other owner. |
| Onboarding workflow stages; EP bootstrap; tenant certification; lifecycle extensions (upgrade, migration, drift, rollback, decommissioning) | **21** | It already owns onboarding, provisioning and lifecycle. |
| Secure registration; one-time credential; mTLS; OAuth/OIDC; certificate issuance; token rotation; replay protection; request signing | **08** | It already owns identity and authentication. |
| Data sovereignty rules for generated assets | **06** (referenced, not restated) | It already owns classification and residency. |
| Outbound-only communication | **05** (referenced, not restated) | Already R-05.1/INV-3. |

**Document 24 is not amended.** Platform Core is not analytics, and nothing about P2.3 belongs to it.

### 4.2 Why this satisfies the objective better than the instructed placement

The stated objective was to integrate P2.3 **without introducing architectural drift**. Drift is precisely what a second owner for onboarding would be: two documents describing the same lifecycle, diverging silently, with the topic-ownership table unable to say which governs.

Distributing to existing owners means **every P2.3 concern is documented exactly once**, by the document that already answers questions of that kind — which is what the contract requires and what makes the coverage matrix meaningful.

## 5. Consequences

**Positive.** No new document; the certified set stays at 25. No topic gains a second owner. Each amendment lands where a reader would already look. The M2.5a baseline remains valid because no document's *boundary* changes — each gains material inside the boundary it already declared.

**Negative, accepted.** P2.3 is described across three documents rather than one, so a reader wanting the whole onboarding story follows references. This is the cost of the one-topic-one-document rule and is preferred to the alternative: a single readable narrative that silently contradicts three other documents.

**Prohibited by this decision.**

| Prohibited | Because |
|---|---|
| A twenty-sixth architecture document | Constraint; certified set preserved |
| A seventh capability | R-11.4 |
| A third plane or Control Plane deployment | R-1.1 |
| Platform Core as a fourth Platform Service | It is a bounded context inside the IP, not a service with its own architecture document |
| Duplicating onboarding into document 24 | Anti-duplication contract |
| Customer runtime assets stored in the Intelligence Plane | R-3.3, R-3.4, INV-6 |

## 6. Migration strategy

None required — no implementation of P2.3 exists.

**Forward path.** Amendments are additive within existing boundaries: no rule is removed, no ownership reassigned. Each amended document moves by one minor version and records the amendment in its header, as v1.1/v1.2 amendments already do elsewhere.

**Should Platform Core later warrant its own document** — for instance if solution generation grows beyond what document 03 can coherently hold — that is a new ADR proposing document 26, with an impact analysis covering re-certification. It is not foreclosed; it is simply not justified by the current volume.

## 7. Version impact

**No contract version change.** No cross-plane contract is affected: the execution package and evidence contracts are untouched. Registration introduces a **bootstrap exchange** that is distinct from the execution-package exchange and does not alter it.

**Architecture:** minor amendments to 03, 21 and 08. The canonical set remains 25 documents. Conformance criteria increase; none is removed.

**Forward obligation.** A technology profile field SHALL be added together with the generator code that consumes it (R-15.2 applied to profiles) — a profile field no generator reads is configuration theatre in a new place.

## 8. Affected components

| Component | Change |
|---|---|
| [03 — Intelligence Plane Architecture](../architecture/03-intelligence-plane-architecture.md) | Bounded contexts; Platform Core; Solution Generation Engine; Technology Profiles |
| [21 — Tenant Lifecycle](../architecture/21-tenant-lifecycle.md) | Onboarding workflow; EP bootstrap; tenant certification; lifecycle extensions |
| [08 — Security Model](../architecture/08-security-model.md) | Secure registration; bootstrap credential; mTLS/OAuth/OIDC; rotation; replay protection |
| `governance/verification/verify-architecture-fitness.js` | P2.3 fitness functions |
| `governance/traceability/coverage-map.json` | Milestone mapping for the amended documents |
| `program/ARCHITECTURE_STATUS.md` | Topic-ownership rows for solution generation and technology profiles |
