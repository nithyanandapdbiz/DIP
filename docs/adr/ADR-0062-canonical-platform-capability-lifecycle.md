# ADR-0062 — Canonical Platform Capability Lifecycle & Replacement of the Twelve-Stage Orchestration Model

**Status:** ACCEPTED · **Date:** 2026-07-29 · **Accepted:** 2026-07-30
**Governed by:** [01 — Platform Constitution](../architecture/01-platform-constitution.md); [11 — Capability Model](../architecture/11-capability-model.md); [12 — Capability Orchestration](../architecture/12-capability-orchestration.md)
**Relates to:** ADR-0022 (amended), ADR-0046, ADR-0047 (extended), ADR-0048 (amended), ADR-0049, ADR-0050, ADR-0061 (extended)
**Scope:** architecture only. This ADR modifies no repository code, migrates nothing, and deletes nothing. It defines the platform-wide capability lifecycle and the architectural boundary that every capability SHALL follow, and binds that model to the constitutional invariants it must preserve.

> **ACCEPTANCE (2026-07-30, programme-owner authority under the E2E-FTE Constitutional Mandate v1.0; CHARTER §9).** Accepted in its REFINED form: the framework runner (`runCapability`/`pipeline.ts`, ADR-0023) is the affirmed capability-agnostic host; the twelve constitutional stages + governance triad + single PDP are retained as behaviour; "adoption" = routing each capability's composition *through* the runner, FT first (replace-before-remove). Passes `verify-adr-completeness` (8 sections). Acceptance makes the platform lifecycle model authoritative and unblocks the FT reconciliation; it does not itself migrate the other five capabilities (each a separately-scoped step) and does not waive the external operational cut-over gates.

> **⚠ REFINED 2026-07-30 (in place, still PROPOSED) — from M7/M8 repository evidence.** The original wording cast a generalized *canonical runtime* as replacing the framework's twelve-stage runner. That is inverted: the capability-agnostic, triad-enforcing host **already exists** — it is the framework runner (`runCapability`/`pipeline.ts`, ADR-0023) — and it is **affirmed, not replaced**. "Canonical adoption" means routing each capability's domain composition **through** the runner; the FT `canonical-capability.ts` *bypass* is reconciled to run through it (reading sealed results via the public `valueOf`, stages.ts:296 — **no SEAL change**). The title's word "Replacement" is retained for continuity but refined to "reconciliation of the canonical bypass onto the retained runner." §§3–8 have been corrected in place. See M7/M8 certifications for the evidence.

---

## 1. Problem

[ADR-0061](ADR-0061-canonical-functional-capability-runtime-adoption.md) authorized the canonical runtime as the authoritative implementation of **one** capability (Functional Testing) and, in doing so, surfaced an invariant it deliberately did not resolve: the twelve-stage lifecycle is **not merely an implementation** — it embodies platform-wide constitutional semantics (the governance triad, the single Policy Decision Point, exactly one lifecycle, no fabricated stage results) that apply to **every** capability, and those semantics are today **coupled to one implementation** (the framework's twelve-stage runner, driven by per-capability master orchestrators).

Consequently a Functional-Testing-only canonical adoption risks two lifecycle models coexisting platform-wide — the exact fracture R-12.18 and C-12.18 forbid. The platform cannot simply bypass the orchestrator, because the semantics must survive; but the implementation may change. This ADR **decouples the lifecycle semantics from the twelve-stage orchestrator implementation** for the whole platform, so the canonical runtime can become the single architectural boundary for every capability without any capability defining its own lifecycle or bypassing the triad.

## 2. Context

**The one lifecycle (document 12, authoritative).** Every capability traverses twelve stages, in order, no bypass (R-12.1):

| # | Stage | Plane | Constitutional note |
|---|---|---|---|
| 1 | Planning | IP | intent (R-12.7) |
| 2 | Discovery | EP | always available (C-12.9) |
| 3 | Context | EP→IP | minimise + scrub |
| 4 | **Architecture Review** | IP | **governance triad** (R-12.2) |
| 5 | **Policy Review** | IP | **governance triad** (R-12.2) |
| 6 | **Guardrail Review** | IP | **governance triad** (R-12.2) |
| 7 | Execution Planning | IP | exactly one sealed package (R-12.3) |
| 8 | Execution | EP | always available |
| 9 | Evidence | EP | hash + custody |
| 10 | Reflection | IP | never in EP (C-12.10) |
| 11 | Certification | IP | deterministic verdict |
| 12 | Reporting | IP | present outcomes |

**The invariants this lifecycle carries:** the governance triad (stages 4–6) executes for every run of every capability (R-12.2, C-12.6), evaluated by the **single Policy Decision Point** (R-12.13, R-03.6); exactly one orchestration lifecycle exists (R-12.18, C-12.18); no bypass/override/debug/test hook fabricates a stage result (R-12.11, C-12.4); stages execute in order (C-12.5); a stage result is not constructible outside its producing stage (C-12.3). These are **constitutional and platform-wide** — the lifecycle is shared by all six capabilities (document 11, R-11.4), and ADR-0022 §3 rejected amending document 12 "for one capability" precisely because it fractures the others.

**Current coupling.** These semantics are realized by the framework's twelve-stage runner, which each capability enters through a master orchestrator (for Functional Testing, `FunctionalTestingOrchestrator`, ADR-0022). **The canonical runtime exists today only for Functional Testing** (ADR-0039's thirteen-domain `canonical-capability.ts`; verified: no other capability references `canonical-capability`/`runtime-execution-spi`). It composes domains directly rather than through the framework runner — which is why, unqualified, it reads as an alternative lifecycle (C-12.18) and does not on its face run the triad. That is the coupling this ADR breaks.

## 3. Alternatives

**A. Keep the twelve-stage framework runner as the platform boundary; leave the canonical FT-only/additive.** Rejected: Functional Testing then runs a different implementation path from the other five capabilities — the two-lifecycle risk ADR-0061 named — and the platform never converges on one model.

**B. Per-capability canonical runtimes, each defining its own lifecycle.** Rejected outright: multiple lifecycle models violate R-12.18 and are detected as alternative lifecycles by C-12.18. This is the fracture, formalized.

**C. Treat the lifecycle as implementation-independent and route every capability through the ONE host that already realizes it — the framework runner (`runCapability`/pipeline, ADR-0023) — having each capability supply its domain composition as stage payload.** Chosen — it preserves every constitutional guarantee, introduces no second host or pipeline, and yields one lifecycle, one triad, one PDP platform-wide. *(Refined 2026-07-30 per M7/M8 evidence: the host is not a generalized `canonical-capability`; it is the existing framework runner — see the §4 Refinement.)*

## 4. Decision

**The platform SHALL have exactly one capability lifecycle, and that lifecycle SHALL be implementation-independent.** The twelve constitutional stages (§2), the governance triad (stages 4–6), the single Policy Decision Point, and the invariants R-12.1/3/5/11/18 **are** the lifecycle; they are **retained unchanged as behaviour**.

> **Refinement (2026-07-30, from M7/M8 repository evidence).** The capability-agnostic host that realizes this lifecycle and enforces the triad **already exists** — it is the framework's `runCapability`/`pipeline.ts`/`stages.ts`/`certify` engine (ADR-0023), through which capabilities already run (FT via `FunctionalTestingOrchestrator`, which hands the 13 domains to the runner). This ADR does **not** authorize building a *new* host or migrating the lifecycle semantics into a generalized `canonical-capability` — that would duplicate the single governance pipeline (forbidden, C-12.18). **"Canonical adoption" means each capability's domain composition runs *through* the existing framework runner.** The FT `canonical-capability.ts` direct-composition, which currently *bypasses* the runner, is **reconciled to run through it** (`runCapability`, reading sealed stage results via the public `valueOf` — stages.ts:296; **no SEAL change is required**). Accordingly, "replacement of the twelve-stage orchestration model" (this ADR's title) is refined to: the twelve-stage **runner is retained as the host**; what is reconciled/retired is the canonical *bypass*, not the runner. Points 1–4 below are the corrected decision.

1. **The framework runner (`runCapability`/pipeline) is, and remains, the single architectural execution boundary** that hosts this lifecycle for every capability. It is not replaced by a canonical host.
2. **Each capability executes *through* that runner.** The runner already executes all twelve stages in order (R-12.1/C-12.5), evaluates the governance triad (stages 4–6) via the **single Policy Decision Point** (R-12.13) every run (R-12.2/C-12.6), emits exactly one sealed execution package at stage 7 (R-12.3), and permits no seam that fabricates a stage result (R-12.11/C-12.4). No second engine reproduces any of these.
3. **No capability defines its own lifecycle.** No capability-specific orchestration model, no alternate lifecycle, no duplicate policy engine, no direct execution that bypasses the runner (C-12.18 holds: exactly one lifecycle).
4. **The FT canonical composition converges onto the runner.** `canonical-capability.ts` is presented as (or routed through) a twelve-stage `Capability`, its domain outputs read from the runner's sealed stage results via the public `valueOf`. No capability-agnostic host is generalized from the canonical — the runner is the host.

**Governance triad — where each review occurs in the canonical runtime.** Architecture Review (stage 4), Policy Review (stage 5) and Guardrail Review (stage 6) SHALL be executed by the canonical host between Context (stage 3) and Execution Planning (stage 7), each assembling context and delegating the decision to the single Policy Decision Point (stages 4–6 contain no policy logic — R-12.13). The requirement is unchanged; only the host that invokes the PDP changes.

**Lifecycle-invariant mapping (realized by the one host — the framework runner — unchanged).** The refinement collapses the earlier "runner → canonical host" columns: the runner *is* the host, so each invariant stays where it is; what changes is only that the FT canonical domains now run through it.

| Invariant | Realized by (the framework runner — retained) | Verified by (rewritten to behaviour) |
|---|---|---|
| One lifecycle only (R-12.18) | one framework runner (no second host) | C-12.18 |
| Governance triad every run (R-12.2) | stages 4–6 in the runner, via the PDP | C-12.6 |
| Single Policy Decision Point (R-12.13) | one PDP (unchanged) | R-03.6 conformance |
| No fabricated stage results (R-12.11) | framework typestate + module-private SEAL (C-12.3) | C-12.4 |
| Order preserved (R-12.5) | runner order | C-12.5 |
| One sealed package at stage 7 (R-12.3) | runner | C-12.14 |
| Determinism / traceability / evidence completeness / certification integrity / auditability | runner + domains | behaviour tests per capability |

**Capability model.** Every capability — the six defined in document 11 (R-11.4) — SHALL execute through this one runner. Functional Testing is the first to have its *canonical composition* reconciled onto it (ADR-0061); the remaining five already execute through the runner via their own orchestrators. No capability-specific orchestration model and no alternate lifecycle at any point.

**Conditionality (as ADR-0061, now platform-wide).** The framework runner is the host and is **not** retired. What is authorized to retire (later, M6) is the FT canonical *bypass* — but only ONCE the canonical composition **demonstrably runs through the runner** and the runner's triad, single PDP and one-lifecycle semantics are shown preserved for it, verified by the rewritten behaviour-based criteria and a passing test. Until then the existing paths remain the certified implementation. This ADR authorizes the direction; it asserts no completed migration.

## 5. Consequences

**Changes.** The architectural execution boundary moves from the framework twelve-stage runner to the capability-agnostic canonical host. The FT canonical runtime is generalized so any capability plugs in. Governance gates, certification, fault proofs and lifecycle validation are rewritten to verify **lifecycle behaviour at the canonical host**, not a specific implementation (criteria C-12.1/4/5/6/18, C-11.11, C-14.1). All six capabilities eventually run on the one host.

**Explicitly does NOT change** (the mandate's non-negotiables, plus the lifecycle semantics themselves): Execution-Plane ownership · Intelligence-Plane ownership · the Runtime SPI · the `ExecutionPackage` contract · browser/Playwright ownership (EP-only) · capability contracts · tenant isolation · the evidence model — **and** the twelve stages, their order, the governance triad, the single PDP, one-lifecycle, no-fabrication, determinism, traceability, evidence completeness, certification integrity and auditability. Only the lifecycle *implementation/host* changes.

**Honest risks.** (a) Only Functional Testing has a canonical runtime today; the other five capabilities have no canonical implementation and must be built to the generalized host — this is substantial, multi-capability implementation work, not a repoint. (b) A half-migrated platform must never present two authoritative lifecycle models (C-12.18); the migration therefore proceeds capability-by-capability behind the **one** host, replacement certified before removal (the ADR-0039 discipline), and the framework runner remains authoritative for not-yet-migrated capabilities during the transition — a state that must be governed so it is never *two authoritative models* but *one model, one legacy implementation being drained*. (c) The migration touches the shared governance baseline that the concurrent workstream (ADR-0060) is churning; sequencing respects CHARTER §3. (d) The ADR-0048 module-private `SEAL` variance must be resolved so sealed-result consumers migrate natively.

## 6. Migration strategy

Post-acceptance; each phase separately authorized; **none performed in this ADR:**

1. **Platform lifecycle definition** — this ADR + amendments to documents 11/12 recording the implementation-independent lifecycle with the **framework runner (`runCapability`/pipeline) as its host/boundary** (semantics unchanged; the runner is affirmed, not replaced).
2. **Route the FT canonical composition through the runner** — present `canonical-capability.ts` as (or route `runtime-entry-point-bridge.ts` through) a twelve-stage `Capability` (reusing the orchestrator's existing wiring), reading the runner's sealed stage results via the public `valueOf`. **No new host is built and no SEAL change is required** (the gating implementation step — M8).
3. **Governance alignment** — rewrite C-12.1/4/5/6/18, C-11.11, C-14.1 to verify behaviour at the runner; re-anchor fault proofs; regenerate proofs (sequenced with concurrent-baseline quiescence).
4. **Capability confirmation** — the other five capabilities already execute through the runner via their orchestrators; confirm none defines an alternate lifecycle. Functional Testing's canonical *bypass* is the only reconciliation outstanding (ADR-0061).
5. **Retire the canonical bypass** — once the canonical runs through the runner and is verified, retire the redundant direct-composition path. **The framework runner and the compliant orchestrator wiring are retained** (they are the host); nothing that owns the lifecycle is deleted.

**Invariant across all phases:** the repository SHALL never contain two *authoritative* lifecycle models. Operational cut-over (routing live traffic; behavioural equivalence against a real Execution Plane) remains the separate ADR-0049 M5 track and is out of scope here.

## 7. Version impact

Architecture documents **11 and 12** take a **clarifying** amendment (not a re-architecture): the lifecycle is stated as implementation-independent *behaviour* realized by the framework runner — which is **affirmed as the host, not replaced** — and capabilities converge their compositions onto it. The stages, order, triad, single PDP and every invariant are unchanged. **ADR-0022** is **affirmed** (its invariant — no second lifecycle, no triad bypass — holds platform-wide; its realization by the framework runner is retained, not superseded — a correction of this ADR's original wording). **ADR-0061** is extended (its FT canonical adoption is the first *convergence-onto-the-runner*, not a replacement of it). Criteria C-12.1/4/5/6/18, C-11.11, C-14.1 are re-versioned as behaviour-based. **No contract change:** `ExecutionPackage`, Runtime SPI, evidence, EP-certification and capability contracts are unaffected — no contract version bump, no compatibility window.

## 8. Affected components

**ADR dependency graph.**

| ADR | Disposition | Why |
|---|---|---|
| ADR-0022 (twelve-stage / FTE internal structure) | **Affirmed** | Invariant holds platform-wide; its realization by the framework runner is **retained** (the runner is the host), not superseded — correction of the original wording |
| ADR-0046 (legacy retirement) | **Enabled / sequenced** | Retirement (of the canonical *bypass*) gains authority; remains conditional on §Decision + §Migration |
| ADR-0047 (canonical runtime architecture) | **Refined** | The canonical is reconciled to run *through* the framework runner, not generalized into a replacement host |
| ADR-0048 (canonical bridge; SEAL variance) | **Referenced** | The SEAL is **not** on M8's path (consume uses the public `valueOf`); ADR-0048's variance is the reverse construct-direction |
| ADR-0049 (M5 cut-over) | **Unchanged** | Operational cut-over remains separate/external |
| ADR-0050 (runtime enablement) | **Unchanged** | Injected-port runtime components stand |
| ADR-0061 (canonical FT runtime adoption) | **Extended** | FT is the first *convergence onto the runner*, not a replacement of it |

**Architecture documents:** 11 (capability model), 12 (capability orchestration) — clarifying amendment (runner affirmed as host).
**Constitutional criteria:** C-12.1, C-12.4, C-12.5, C-12.6, C-12.18, C-11.11, C-14.1 — rewritten to verify lifecycle behaviour at the runner.
**Framework / runtime:** the `@dbiz/capability-framework` runner (`runCapability`/`pipeline.ts`) — **affirmed as the host, retained**; the per-capability master orchestrators (retained; they hold the compliant twelve-stage wiring); the FT canonical components (`canonical-capability.ts`, composer, SPI, bridge) — **reconciled to run through the runner** (the bypass, not the host).
**Capabilities:** all six (R-11.4) — five already execute through the runner via their orchestrators; Functional Testing's canonical bypass is the one reconciliation outstanding.
**Governance / certification:** capability-conformance, functional-completeness, intent-conservation, fault-proof recording, runtime/lifecycle verification — rewritten to verify behaviour at the runner.

**No repository code is modified by this ADR.** It defines the platform lifecycle with the framework runner affirmed as its host, bound to the governance-triad, single-PDP and one-lifecycle invariants, and authorizes the subsequent, separately-authorized work to reconcile the FT canonical composition onto the runner while preserving all constitutional lifecycle semantics.
