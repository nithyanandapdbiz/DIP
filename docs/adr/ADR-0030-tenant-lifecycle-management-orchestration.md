# ADR-0030 — Tenant Lifecycle Management as the Platform Core Onboarding Orchestrator

**Status:** ACCEPTED · **Date:** 2026-07-23
**Closes:** AD-018
**Raised by:** the P0 directive to make Tenant Lifecycle Management the mandatory bootstrap of the platform
**Affects:** [03](../architecture/03-intelligence-plane-architecture.md), [21](../architecture/21-tenant-lifecycle.md) §9, `packages/`, `program/`
**Does not amend:** the frozen six-capability model ([11](../architecture/11-capability-model.md), R-11.4), the three Platform Services ([ADR-0018](ADR-0018-platform-services-and-programme-instruments.md)), or the canonical tenant lifecycle states ([21](../architecture/21-tenant-lifecycle.md) §2)

---

## 1. Problem

A directive designates **Tenant Lifecycle Management (TLM)** the platform's *mandatory bootstrap capability* — the first thing that runs, the gate every tenant passes, config-driven, single-command, resumable, with a lifecycle richer than the frozen six states. Three things in that framing collide with frozen architecture, and each is the kind that gets absorbed silently if not recorded:

1. **"Mandatory first capability."** [11](../architecture/11-capability-model.md) is frozen and R-11.4 fixes the platform at **exactly six** capabilities, a seventh requiring an approved ADR. A capability is a *certifiable unit of quality engineering that traverses twelve stages and yields a certified verdict about customer software* (R-11.1). TLM performs no quality engineering against a customer system and yields no such verdict — it onboards the tenant that later runs one. Building it as a seventh capability would make "capability" mean "feature", which is the exact failure [ADR-0018](ADR-0018-platform-services-and-programme-instruments.md) exists to prevent.

2. **"Platform service."** The obvious next label — a fourth Platform Service beside Operational Excellence, Platform Intelligence and Customer Success — is **already prohibited by [ADR-0021](ADR-0021-platform-core-bounded-context.md) §5**, which ruled Platform Core (the context that owns onboarding) to be *a bounded context inside the Intelligence Plane, not a service with its own architecture document*. The closure baseline gate encodes this as a hard invariant (`platformServices === 3 && capabilities === 6`): a fourth service cannot be recorded without editing governance to permit what ADR-0021 forbids.

3. **A richer lifecycle.** The directive lists ~17 lifecycle stages against the six canonical states of [21](../architecture/21-tenant-lifecycle.md) §2. Adopting them as canonical states would contradict R-21.5 (*"a tenant SHALL be in exactly one state"*) and the frozen state machine.

The unowned question underneath all three is **AD-018** (doc 21 §9): *"Self-service versus DBiz-assisted onboarding, and the approval path."* It has been open since M1.5. The directive is, in substance, its answer.

## 2. Context

- **TLM is not new architecture.** [ADR-0021](ADR-0021-platform-core-bounded-context.md) §4 already assigns *"tenant onboarding, registration, technology profiles, solution generation, repository and deployment package generation, identity, licensing, **lifecycle**, API gateway, platform administration"* to the **Platform Core** bounded context. Doc 21 §3a already defines the **fourteen-stage onboarding workflow** (R-21.27), §3b–3c the EP bootstrap and smoke/certification, and §7a the **extended lifecycle operations** — upgrade, migration, technology-pack and framework upgrade, drift detection, rollback, backup/recovery coordination, decommissioning (R-21.41–46). Twenty-seven conformance criteria (C-21.1–27) already exist.
- **What exists in code is partial.** `platform-runtime` implements registration, tenant isolation, the CA, the authorisation server and the mTLS gateway; `platform-core` implements the Solution Generation Engine (scaffold generator, deterministic); `customer-success` holds a seven-step `runOnboarding` driver that is **not wired to live services and not directly tested**. There is no explicit lifecycle state machine, no activation operation (activation is injected-set membership), and no orchestrator that carries a tenant across the fourteen stages with audit, resumption and idempotency.
- **Stages 8–12 cannot execute here.** Stage 8 is the customer's deployment (R-21.12; DBiz never deploys into a customer tenancy); stages 9–12 are EP-initiated (INV-3) and require the P5 Execution-Plane runtime and a container runtime — the platform's single external dependency ([NEXT_ACTION](../../program/NEXT_ACTION.md); AD-040). No implementation removes that dependency.
- **The predecessor's dominant defect class was declared-but-unbuilt.** An onboarding orchestrator that *reported* success without a proven smoke run would be that defect at the platform's front door (R-21.11, R-21.29).

## 3. Alternatives

| Option | Assessment |
|---|---|
| **TLM as a seventh capability** | Rejected. R-11.4; it yields no certified verdict about customer software. Admitting it dissolves the cardinality a reviewer checks by inspection, exactly as ADR-0018 §3 records. |
| **TLM as a fourth Platform Service** | Rejected. ADR-0021 §5 already prohibits Platform Core as a service; the closure gate hard-codes three services. It would give onboarding a second owner (doc 21 *and* a service document) — the drift ADR-0021 exists to prevent. |
| **A seventeen-state lifecycle replacing the six** | Rejected. Contradicts R-21.5 and the frozen §2 state machine. Most of the seventeen are onboarding sub-stages (already §3a) or governed operations (already §7a), not states. |
| **Leave onboarding as the current partial code; document only** | Rejected. It leaves `runOnboarding` unwired and untested, no state machine, no activation — the declared-but-unbuilt shape at the one workflow every tenant must pass. |
| **TLM is the orchestration of the existing Platform Core context, over the frozen states, closing AD-018** | **Selected.** |

## 4. Decision

### 4.1 TLM is Platform Core's onboarding orchestrator — not a capability, not a service, not a document

**R-11.4 stands. ADR-0018's three Platform Services stand. ADR-0021's bounded contexts stand. Doc 21 §2's six canonical states stand.**

Tenant Lifecycle Management is the **orchestration surface of the Platform Core bounded context**: the code that carries a tenant across the fourteen onboarding stages (R-21.27) and the extended lifecycle operations (R-21.41), enforcing the frozen state machine (R-21.5–6), the complete-or-absent rule (R-21.9), and the no-`ACTIVE`-without-proven-smoke rule (R-21.29). It adds **no** capability, **no** Platform Service, and **no** architecture document. It is realised as one or more Intelligence-Plane packages under Platform Core.

### 4.2 AD-018 is closed: onboarding is self-service and configuration-driven by default

- Onboarding SHALL be **configuration-driven and self-service by default** (R-21.8): a single command or wizard collects configuration once and drives stages 1–7 with **no manual DBiz engineering** (R-21.30). This is the canonical path (D-011: the conformant path is never behind a flag).
- **DBiz-assisted onboarding is the same automated pipeline** with a human approval gate inserted before solution generation (stage 5), for customers whose contract requires review. The gate approves or rejects; it never hand-edits generated output. An assisted onboarding that diverged from the automated one would be a second, unverified path.
- **The approval path** is an auditable state transition like any other (R-21.5): actor, timestamp, reason. Approval authority is Intelligence-Plane configuration (R-21.16, DBiz column), never customer-settable.

### 4.3 The onboarding progress projection — an overlay, never a second lifecycle

The richer lifecycle the directive describes is admitted as an **observable projection over the six canonical states**, not as new states. Each projection stage maps to exactly one canonical state and, where applicable, one onboarding stage:

| Projection stage | Canonical state (§2) | Onboarding stage (§3a) |
|---|---|---|
| DRAFT | *(pre-registration; no registry entry yet — not a tenant)* | before 1 |
| REGISTERED | REGISTERED | 1–2 |
| CONFIGURED | REGISTERED → PROVISIONED | 3–4 |
| VALIDATED | PROVISIONED | validation of 3–4 |
| EP_GENERATED | PROVISIONED | 5–7 |
| WAITING_FOR_DEPLOYMENT | PROVISIONED | after 7, awaiting customer stage 8 |
| EP_CONNECTED | PROVISIONED | 10 |
| HEALTH_VERIFIED | PROVISIONED | 11 |
| SMOKE_PASSED | PROVISIONED | 12 |
| CERTIFIED | PROVISIONED | 13 |
| ACTIVE / OPERATIONAL | ACTIVE | 14 |
| MAINTENANCE / UPGRADING / RE-CERTIFYING | ACTIVE *(governed operation in flight, §7a)* | — |
| OFFBOARDING / ARCHIVED | OFFBOARDING | — |
| DECOMMISSIONED / CLOSED | CLOSED | — |

The projection is **derived from** canonical state + audited stage history; it is a reporting and resumption aid (R-14.6: score, coverage, freshness published together). It SHALL NOT be a second source of truth: the canonical state (R-21.5) governs execution eligibility (R-21.6), and the Policy Decision Point reads *that*, never the projection (R-21.7). This mirrors ADR-0022 and ADR-0027 — internal structure is not a second lifecycle.

### 4.4 The bounds this decision does not cross

TLM builds only what the Intelligence Plane owns and can execute here: registration, tenant creation, configuration capture and validation, connectivity/credential/integration validation *of the declared configuration*, solution and deployment-package generation, the lifecycle state machine, orchestration, and the certification/activation **decision logic**. It SHALL NOT deploy into a customer tenancy (R-21.12), SHALL NOT execute stages 9–12 itself (INV-3), and SHALL NOT report a tenant `ACTIVE` without registration, connectivity and smoke evidence (R-21.29). Those stages remain gated on the P5 Execution-Plane runtime and a container runtime, and TLM reports them **PENDING**, never assumed.

## 5. Consequences

**Positive.** The six-capability cardinality, the three Platform Services and the six canonical states all survive a natural-language instruction that named all three. Onboarding keeps exactly one owner (doc 21) and one implementation home (Platform Core). AD-018, open since M1.5, is closed. The one workflow every tenant must pass acquires a real state machine, orchestration and activation logic instead of an unwired driver. The projection gives dashboards and resumption a rich view without manufacturing a second lifecycle.

**Negative, accepted.** TLM cannot be certified end-to-end here: stages 8–12 remain blocked on the customer deployment and a container runtime, so activation, smoke and operational monitoring will report `PENDING`/`NOT MEASURED` until P5 and Docker. That is the honest state, and reporting it as anything else is the declared-but-unbuilt failure this decision explicitly refuses.

**Prohibited by this decision.**

| Prohibited | Because |
|---|---|
| Building TLM as a seventh capability | R-11.4; it yields no certified verdict about customer software |
| Recording TLM as a fourth Platform Service | ADR-0021 §5; the closure baseline hard-codes three |
| Adding canonical lifecycle states beyond §2's six | R-21.5; the projection is an overlay, not the state |
| Reading the projection at the Policy Decision Point | R-21.7; execution eligibility derives from canonical state |
| Reporting a tenant `ACTIVE` without registration, connectivity and smoke evidence | R-21.29; activation on assumption |

## 6. Migration strategy

None to unwind — no contrary implementation exists; the collision is caught before TLM is built, which is the point.

**Forward path, honouring D-012 (declaration and enforcement are one atomic change).** This ADR is the *decision*. The **testable conformance criteria** for the progress projection and the orchestrator (the additive R-21.47+ / C-21.28+ material in doc 21 §3d), the **implementation**, and the **enforcing governance gate + scenario** land **together** in the TLM implementation increment (Phase 3) — a rule declared without its enforcement is prose, and a gate added without the rule it enforces is untraceable. Until that increment lands, doc 21 §9 records AD-018 as resolved by this ADR, and no new criterion is asserted as verified.

**Build order (CHARTER §5).** Architecture (this ADR) precedes runtime (the orchestrator). The orchestrator reuses, and does not duplicate, the registration/identity/generation code already in `platform-runtime`, `platform-core` and `customer-success` (CHARTER §4).

## 7. Version impact

**No contract version change.** No cross-plane contract is affected. Registration's bootstrap exchange and the execution/evidence contracts are untouched (as ADR-0021 §7 already established).

**Architecture:** minor. One open item (AD-018) is resolved in doc 21 §9; no canonical state, rule, boundary, capability or service is added or removed. The canonical set remains 25 documents. Adding this ADR and resolving AD-018 requires a **deliberate closure re-baseline** (`emit-closure-package.mjs`), reviewed and committed — silent amendment is what the closure gate prevents.

**Forward obligation.** Every projection stage SHALL be derivable from audited canonical state and stage history — a projection value no evidence supports is status theatre (R-13.1). A technology-profile or configuration field added for TLM SHALL be added together with the generator/validator code that reads it (R-15.2).

## 8. Affected components

| Component | Change |
|---|---|
| [21 — Tenant Lifecycle](../architecture/21-tenant-lifecycle.md) §9 | AD-018 marked resolved by this ADR (this increment). The additive §3d projection rules and C-21.28+ criteria land with the Phase 3 gate (§6) |
| [03 — Intelligence Plane Architecture](../architecture/03-intelligence-plane-architecture.md) | Referenced, not amended — Platform Core and Solution Generation already owned here |
| `packages/` (Platform Core) | New TLM orchestration + lifecycle state machine + config-driven bootstrap, reusing existing registration/generation packages (Phase 3) |
| `governance/verification/` | New TLM conformance gate + scenario, with recorded fault proof (Phase 3, atomic with the criteria it enforces) |
| `governance/closure/baseline.json` | Re-cut to admit ADR-0030 and the doc-21 §9 resolution |
| `program/DECISIONS.md` | ADR index extended to ADR-0030; AD-018 recorded closed |
| `program/BACKLOG.md` | B-008 (tenant onboarding self-service) promoted from P9 to active under this ADR |
