# ADR-0047 — Canonical Runtime Integration for Functional Testing

**Status:** **PROPOSED** · **Date:** 2026-07-29. An architecture decision (no code) resolving how the certified ADR-0039 canonical capability becomes the production Functional Testing runtime without violating governance, plane sovereignty, or frozen contracts. The full analysis (14 sections: current/canonical/gap/options/recommendation/sequence/matrices/governance/migration/risk/retirement) is the companion blueprint `docs/certification/ADR-0047-CANONICAL-RUNTIME-ARCHITECTURE.md`.

## 1. Problem

The live Functional Testing runtime is **IP-authors → EP-executes** (an authored, signed `ExecutionPackage` runs on the Execution Plane), while the certified ADR-0039 capability is a **synchronous, single-process 13-domain composition** consuming abstract Connector SPIs. Two blockers were proven: (A) the canonical Execution/Healing domains require an `ApplicationStrategyAdapter` the real `AdapterRegistry` does not supply; (B) no canonical domain produces the concrete `ExecutionPackage` the Execution Plane runs. This ADR decides the target architecture that closes both.

## 2. Context

The Intelligence Plane authors and signs the execution package; the Execution Plane executes it and returns evidence by reference; the Intelligence Plane never executes (doc 20 R-20.10/R-20.14, INV-1). The `ExecutionPackage` contract already exists (`packages/contracts/src/execution-package.ts`). The canonical composition takes its runtime connector as an **injected dependency**, not from `AdapterRegistry`. Doc 14 R-14.10 requires that live and dry-run differ **only inside the adapter**, with one code path through capability and framework. These existing mechanisms determine the solution.

## 3. Alternatives

- **Option A — Canonical Authoring Composer:** materialise the canonical automation architecture into a concrete `ExecutionPackage`.
- **Option B — Runtime Execution SPI:** the live `ApplicationStrategyAdapter` as the IP↔EP dispatch bridge (B1 preserves the SPI shape by buffering; B2 re-specs the SPI — rejected).
- **Option C — Explicit IP-authoring / EP-execution sub-pipelines:** preserve the thirteen domains but split them across the plane boundary.
- Rejected non-options: fake execution adapters, simulated execution, dual execution, runtime toggles, redefining frozen contracts, redesigning the thirteen domains.

## 4. Decision

Adopt **Option A + B1 expressed through Option C's plane split** — reuse-first and additive. Reuse the `ExecutionPackage` contract, the cross-plane authoring/sign/verify/execute/evidence-by-reference mechanism, the canonical injected-dependency model, and R-14.10 (the adapter is the live/dry locus). Add exactly three additive components: a **Canonical Authoring Composer** (materialises the canonical automation architecture into a concrete `ExecutionPackage` — the completion of ADR-0039's deferred `materializationPlan`, a post-domain step), a **Runtime Execution SPI** (the live `ApplicationStrategyAdapter` = an EP-dispatch bridge that signs, dispatches to the Execution Plane, and ingests the real verdict + evidence references — not a fake adapter, injected so the `AdapterRegistry` is untouched), and a **Runtime Entry-Point Bridge** (`ExecutionRequest ↔ OrchestrationResult`, preserving the external `/v1/execute` contract). **No frozen platform contract is modified and none of the thirteen certified domains is redesigned.** Cut-over reuses ADR-0044; qualification reuses ADR-0045; retirement reuses ADR-0046.

## 5. Consequences (stated honestly)

- The gap is closed by reuse; the thirteen domains and every frozen contract are preserved; plane sovereignty and evidence-by-reference hold; no fake evidence is introduced.
- ADR-0047 is purely additive — no existing ADR requires supersession or amendment.
- Only M1–M3 (the three components, in-reference, gate-first) are buildable now. **M4 (real-environment qualification), M5 (cut-over), and M6 (legacy retirement) are blocked on a runtime environment (E-2) and governed approvals; GA remains NOT CERTIFIED.**
- One residual design risk: the Composer must obtain concrete locators from the SPI `discover`/`locate` + the tenant application model; if the domains' abstraction proves insufficient, that is surfaced as a scoped future amendment — selectors are never invented.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

M1 Composer (in-reference) → M2 Runtime Execution SPI (in-reference) → M3 Entry-Point Bridge (in-reference) → M4 real-environment qualification (blocked on E-2) → M5 governed cut-over via the ADR-0044 mechanism (with approvals) → M6 legacy retirement via the ADR-0046 readiness gate. Each phase is independently testable and reversible; replace-before-remove holds until M6.

## 7. Version impact

Additive architecture decision. Introduces the design for three additive components (Composer, Runtime Execution SPI, Entry-Point Bridge) to be built gate-first under later authorisations. No platform contract, Decision Type, connector SPI shape, execution context, reporting model, governance rule or certified domain is modified by this ADR. No code is implemented here.

## 8. Affected components

- `docs/adr/ADR-0047-canonical-runtime-integration.md`
- `docs/certification/ADR-0047-CANONICAL-RUNTIME-ARCHITECTURE.md`
- `docs/certification/ADR-0046-CANONICAL-RUNTIME-GAP-ANALYSIS.md`
- `docs/certification/ADR-0046-LEGACY-RETIREMENT-DISCOVERY.md`
