# ADR-0061 — Canonical Functional Capability Runtime Adoption & Twelve-Stage Functional Orchestrator Retirement

**Status:** ACCEPTED · **Date:** 2026-07-29 · **Accepted:** 2026-07-30
**Governed by:** [01 — Platform Constitution](../architecture/01-platform-constitution.md); [11 — Capability Model](../architecture/11-capability-model.md); [12 — Capability Orchestration](../architecture/12-capability-orchestration.md)
**Relates to:** ADR-0022 (amended), ADR-0046, ADR-0047, ADR-0048, ADR-0049, ADR-0050
**Scope:** architecture only. This ADR modifies no repository code, migrates nothing, and deletes nothing. It establishes the architectural authority that subsequent implementation work SHALL follow, and binds that authority to the constitutional invariants it must not break.

> **ACCEPTANCE (2026-07-30, programme-owner authority under the E2E-FTE Constitutional Mandate v1.0; CHARTER §9).** Accepted in its REFINED form (below): the framework runner is the affirmed host; adoption = reconcile the FT canonical composition to run *through* the runner; what retires is the canonical *bypass*, not the runner. The ADR passes `verify-adr-completeness` (8 sections, not an offender) and preserves every named invariant (R-12.1/2/11/13/18, C-12.4/6/18). Acceptance authorizes the FT-M6 reconciliation sequence to begin — additive, verify-first, replace-before-remove. It does NOT authorize deleting legacy before the canonical-through-runner path is verified behaviourally equivalent, nor does it waive the external cut-over gates (E-2, reachable EP, approvals) for operational GA.

> **⚠ REFINED 2026-07-30 (still PROPOSED) — see ADR-0062's refinement banner and the M7/M8 certifications.** Repository evidence established that the capability-agnostic, triad-enforcing host already exists (the framework runner `runCapability`/`pipeline.ts`, ADR-0023) and is **affirmed, not replaced**. This ADR's "canonical runtime becomes authoritative / twelve-stage orchestrator retires" is refined to: the FT canonical composition is **reconciled to run *through* the framework runner** (reading the runner's sealed stage results via the public `valueOf` — stages.ts:296; **no SEAL change**), and what retires is the canonical *bypass*, not the framework runner. The constitutional intent (canonical execution under the one lifecycle, governance triad, single PDP) is unchanged; the *mechanism* is convergence-onto-the-runner, not replacement-of-it.

---

## 1. Problem

Repository certification (FT-M6-REPOSITORY-CANONICALIZATION) confirmed that the canonical Functional Testing capability runtime is implemented, feature-complete, independent of the legacy orchestrator, and at static capability parity. It also found the one remaining repository dependency is the **certified twelve-stage `FunctionalTestingOrchestrator`** (defined by architecture documents 11 and 12 and ADR-0022), and that this certified architecture — not any external/operational factor — prevents repository canonicalization until it is formally superseded.

This ADR must resolve that conflict. But a naïve resolution ("retire the twelve-stage orchestrator; let the canonical compose domains directly") would establish a **second orchestration lifecycle** and **bypass the governance triad** — violating R-12.1, R-12.2, R-12.11, R-12.18 and detectable by C-12.6 and C-12.18. The problem is therefore twofold: authorize the canonical adoption **and** guarantee it preserves the constitutional invariants the twelve-stage lifecycle exists to enforce.

## 2. Context

**Current architecture.** `FunctionalTestingOrchestrator` (`packages/functional-testing-engine/src/orchestrators.ts`) is the Functional Testing capability's master orchestrator. Per its own traceability it realizes architecture documents 11/12 and ADR-0022 and verifies criteria **C-12.1** (implements all twelve stages), **C-11.11** (no framework code branches on capability identity), **C-14.1** (every tool reached through an adapter SPI). It "hands the capability to the framework's twelve-stage runner"; it defines no workflow of its own.

**The constitutional invariants doc 12 owns:**
- **R-12.1** — every capability traverses the twelve stages, in order; no optional stages, no permitted bypass.
- **R-12.2** — stages 4/5/6 are the **governance triad** (Architecture, Policy, Guardrail Review); no capability may bypass them.
- **R-12.11** — no framework bypass/override/debug/test hook may construct a stage result without running the stage.
- **R-12.13** — the governance triad is evaluated by the **single Policy Decision Point**.
- **R-12.18** — there is exactly **one** orchestration lifecycle; a capability may extend it internally but SHALL NEVER redefine or bypass it.
- **C-12.4 / C-12.6 / C-12.18** — no fabricated stage results; the triad executes for every run of every capability; exactly one lifecycle exists (framework scan for *alternative* lifecycles).

**The twelve-stage lifecycle is platform-wide.** It is shared by all six capabilities. ADR-0022 §3 explicitly rejected amending document 12 "to accommodate one capability" because doing so fractures the other five.

**The canonical runtime** (ADR-0047/0048/0050; `canonical-capability.ts` → `canonical-authoring-composer.ts` → `runtime-execution-spi.ts` → `ExecutionPackage` → Execution Plane) composes the thirteen domains directly, with the **Decision Engine as the sole decision authority** delegated to every domain, over a frozen `CANONICAL_DOMAIN_SEQUENCE`. It is feature-complete and at static parity (FT-M6). **As built, it runs `capability.run()` directly and does not traverse the framework's twelve-stage runner** — which is precisely why, unqualified, it reads as an alternative lifecycle under C-12.18 and does not, on its face, execute the governance triad (R-12.2).

**The conflict, stated exactly:** the canonical is the intended implementation, but the twelve-stage lifecycle carries constitutional, platform-wide, non-bypassable invariants (one lifecycle; governance triad every run). The decision cannot retire the twelve-stage orchestrator by discarding those invariants; it must relocate and preserve them.

## 3. Alternatives

**A. Status quo — keep the twelve-stage orchestrator; leave the canonical additive/unwired.** Rejected: the repository never canonicalizes; two implementations of the capability persist indefinitely (the FT-M6 finding).

**B. Retire the twelve-stage lifecycle; let the canonical compose domains directly as the sole path.** Rejected — and it is the ADR-0022 anti-pattern re-created. It establishes a second/alternative orchestration lifecycle (violates R-12.18, detected by C-12.18), bypasses the governance triad (violates R-12.2/R-12.1, detected by C-12.6), and — because the lifecycle is shared by all six capabilities — fractures the platform (FT on one lifecycle, five on another). This would delete a constitutional safety invariant, not merely "retire legacy."

**C. Adopt the canonical as the capability's authoritative implementation while PRESERVING the one lifecycle and the governance triad — relocating their enforcement into the canonical runtime (via the single Policy Decision Point), rewriting the criteria to verify the *behaviour* rather than the twelve-stage-runner *implementation*, and authorizing retirement of the twelve-stage orchestrator only after the canonical is shown to enforce those invariants.** Chosen — it canonicalizes the repository without discarding any constitutional guarantee, and it matches R-12.18's own permission ("a capability may extend the framework internally").

## 4. Decision

**The canonical Functional Testing capability runtime becomes the single authoritative implementation of the Functional Testing capability.** The responsibilities currently discharged by the twelve-stage `FunctionalTestingOrchestrator` are assigned to `capability.run()`, the capability composer, the Runtime SPI, the `ExecutionPackage`, and the Execution Plane.

**This adoption is bound by the following non-negotiable constitutional conditions, which are part of the decision, not commentary:**

1. **The governance triad is preserved (R-12.2).** The canonical runtime SHALL evaluate Architecture, Policy and Guardrail Review through the **single Policy Decision Point** (R-12.13) for **every** run. Retirement of the twelve-stage orchestrator is authorized ONLY once this is implemented and verified.
2. **Exactly one lifecycle is preserved (R-12.18 / C-12.18).** The canonical runtime SHALL carry the twelve-stage semantics (all stages, in order, no bypass — R-12.1) and SHALL NOT constitute a second lifecycle. Because the lifecycle is platform-wide, the canonical's stage/triad semantics SHALL be identical to those the other five capabilities run, so no second platform lifecycle is introduced.
3. **No fabricated stage results (R-12.11 / C-12.4).** The canonical path SHALL NOT introduce any seam that produces a stage or triad result without running it.

**What is retired** is the twelve-stage orchestration as *implemented by the FT-specific master orchestrator and its pre-canonical domain code* (`FunctionalTestingOrchestrator`, `createFunctionalTestingEngine`) — **not** the twelve-stage *semantics* or the governance triad, which are relocated into and enforced by the canonical runtime. The twelve-stage orchestrator ceases to be the *implementation* boundary; the twelve-stage *lifecycle and its triad* remain the constitutional boundary, now realized by the canonical runtime.

This ADR authorizes that direction and makes the retirement **conditional** on conditions 1–3 being demonstrably met by the rewritten, behaviour-based criteria (§Constitutional impact). No implementation occurs here.

## 5. Consequences

**Changes.** The Functional Testing capability's internal orchestration mechanism moves from "the framework's twelve-stage runner driven by `FunctionalTestingOrchestrator`" to "the canonical thirteen-domain composition." Governance gates, conformance suites, fault proofs and certification hooks that currently instantiate the legacy orchestrator become eligible for migration to the canonical runtime (§Implementation consequences). Criteria C-12.1 / C-11.11 / C-14.1 (and C-12.6 / C-12.18 / C-12.4 as they apply to FT) are rewritten to verify *behaviour at the canonical locus* rather than a specific twelve-stage-runner implementation.

**Explicitly does NOT change** (compatibility, §below): the governance triad and single PDP (preserved, relocated); the single-lifecycle guarantee; adapter-SPI access to tools (C-14.1); the `ExecutionPackage` contract; evidence-by-reference (INV-1); Execution-Plane and Intelligence-Plane ownership; the Runtime SPI; browser/Playwright ownership (EP-only). Only the FT capability's internal orchestration mechanism changes.

**Standing risks recorded honestly.** (a) If the retirement is performed before conditions 1–3 are verified, the platform loses the governance triad for Functional Testing — a constitutional regression; the conditionality exists precisely to prevent this. (b) This adopts the canonical for FT first; until the same adoption is decided for the other five capabilities, C-12.18 holds only because the canonical carries identical stage/triad semantics — a platform-wide canonical-runtime decision is a foreseeable follow-on and is named here, not smuggled. (c) The migration touches the shared governance baseline that the concurrent workstream (ADR-0060) is churning; sequencing is a migration concern (§Migration strategy), not an architecture one.

## 6. Migration strategy

Post-acceptance, each step separately authorized; **none performed in this ADR:**

1. Amend architecture documents 11/12 and ADR-0022 to record the canonical runtime as the sanctioned FT implementation of the twelve-stage lifecycle, carrying the governance triad — preserving R-12.1/2/11/13/18 unchanged as invariants.
2. Ensure and instrument the canonical runtime to evaluate the governance triad through the single Policy Decision Point for every run, and to satisfy twelve-stage semantics (conditions 1–3). This is the gating implementation step.
3. Rewrite criteria C-12.1, C-12.6, C-12.18, C-12.4, C-11.11, C-14.1 to verify these behaviours at the canonical locus (behaviour, not implementation).
4. Migrate the five governance gates (`run-capability-conformance`, `run-functional-completeness`, `run-intent-conservation`, `record-fault-proofs`, `verify-runtime-cutover-readiness`) and the conformance suites to instantiate the canonical runtime; re-anchor fault proofs; regenerate `proofs.json` — sequenced when the concurrent ADR-0060 baseline churn is quiesced (CHARTER §3).
5. Resolve the ADR-0048 module-private `SEAL` variance so the sealed-`OrchestrationResult` consumers migrate to `RuntimeExecutionOutcome` natively (no adapter).
6. Retire and delete `FunctionalTestingOrchestrator`, `createFunctionalTestingEngine`, their exports, and the legacy domain implementation; re-point `authoring-bridge.mjs`; retire `ip-execute-gateway.mjs` (already slated for M5).
7. Operational cut-over (routing the live gateway, behavioural equivalence against a real Execution Plane) remains the separate ADR-0049 M5 track and is **out of scope** here — it does not gate repository canonicalization, and repository canonicalization does not perform it.

## 7. Version impact

Architecture documents 11 and 12 take a **version increment** (the twelve-stage lifecycle acquires a second sanctioned realization — the canonical runtime — while its invariants are unchanged). ADR-0022 is **amended, not reversed**: its protected invariant (a capability SHALL NOT introduce a second lifecycle or bypass the triad) is *retained in full*; only its assumption that the twelve stages are realized exclusively by the framework runner driven by `FunctionalTestingOrchestrator` is superseded. Criteria C-12.1/4/6/18, C-11.11, C-14.1 are re-versioned as behaviour-based. **No contract change:** the `ExecutionPackage`, Runtime SPI, evidence and EP-certification contracts are unaffected, so no contract major/minor version changes and no compatibility window opens.

## 8. Affected components

**ADR dependency matrix.**

| ADR | Disposition | Why |
|---|---|---|
| ADR-0022 (FTE internal structure / twelve-stage) | **Amended** | Invariant (no second lifecycle, triad preserved) retained; the exclusive framework-runner realization is superseded by the canonical runtime |
| ADR-0046 (legacy retirement) | **Enabled / sequenced** | Its preconditions gain this architectural authority; retirement stays conditional on conditions 1–3 + the migration |
| ADR-0047 (canonical runtime architecture) | **Extended** | Canonical elevated from additive to authoritative implementation |
| ADR-0048 (canonical bridge; SEAL variance) | **Amended** | The module-private `SEAL` variance MUST be resolved (§Migration 5) for native migration |
| ADR-0049 (M5 cut-over) | **Unchanged** | Operational cut-over remains separate and external; not affected by repository canonicalization |
| ADR-0050 (runtime enablement) | **Unchanged** | Injected-port runtime components stand as-is |

**Architecture documents:** 11 (capability model), 12 (capability orchestration) — amended.
**Constitutional criteria:** C-12.1, C-12.4, C-12.6, C-12.18, C-11.11, C-14.1 — rewritten to behaviour.
**Governance gates:** `run-capability-conformance`, `run-functional-completeness`, `run-intent-conservation`, `record-fault-proofs`, `verify-runtime-cutover-readiness` — eligible for migration.
**Conformance suites:** `conformance.test.ts`, `canonical-capability-conformance.test.ts`, `authoring-bridge.test.mjs` — eligible for migration.
**Runtime components:** `canonical-capability.ts`, `canonical-authoring-composer.ts`, `runtime-execution-spi.ts`, `runtime-entry-point-bridge.ts`, `runtime/*` — become the authoritative implementation.
**Retirement targets (after conditions met):** `orchestrators.ts` `FunctionalTestingOrchestrator`, `capability.ts` `createFunctionalTestingEngine`, their `index.ts` exports, legacy usage in `authoring-bridge.mjs`, `ip-execute-gateway.mjs`.

**No repository code is modified by this ADR.** It exists solely to establish the architectural authority — bound to the governance-triad and single-lifecycle invariants — required for the subsequent, separately-authorized implementation work.
