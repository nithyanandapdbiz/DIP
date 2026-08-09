# ADR-0040 — Canonical Platform Contract Framework

**Status:** **COMPLETE** — 2026-07-28. All six §6.6 waves delivered and certified (15/15 platform contracts PASS); the Platform Readiness Review returned **FULL PASS** after close-out C1+C2; the Canonical Platform Contract Framework is **frozen**. Contracts are henceforth consumed, not redefined; extended only through approved interfaces.
**Date:** 2026-07-28
**History:** PROPOSED → ACCEPTED (§4.4 amendments) → **COMPLETE 2026-07-28** (six waves certified; C1 registry-index completeness + C2 closure re-baseline applied; FULL PASS).
**Raised by:** customer directive — elevate the capability-internal contracts of [ADR-0039](ADR-0039-functional-testing-capability-refounding.md) §4.6 to platform-wide canonical contracts owned by the shared contract layer and consumed by all six capabilities; one definition per concept; no capability defines its own contract model.
**Builds on:** [ADR-0039](ADR-0039-functional-testing-capability-refounding.md) (the C-1…C-14 contracts, until now scoped to capability 1), [ADR-0025](ADR-0025-platform-certification-framework.md) (the certification engine this extends), and [ADR-0022](ADR-0022-functional-testing-engine-internal-structure.md).
**Explicitly does NOT amend (constitutional — preserved):** R-11.4 (six capabilities), R-12.18 / R-12.1 (one orchestration lifecycle, no bypass), the twelve-stage lifecycle and governance triad (R-12.2), the six canonical tenant states (R-21.5), INV-1 / INV-2 / INV-3 / INV-9, R-13.1 (evidence over assertion), and the frozen cross-plane execution-package / evidence contracts.

---

## 1. Problem

The customer directs a **platform-wide canonical contract layer**: one definition for each cross-cutting concept — Execution Context, Decision Engine, the Connector SPI family, Repository / Automation / Evidence / Reporting models, the Domain Contract, the Domain State model, and the platform Event contract — owned by the shared contract layer, versioned, dependency-checked, and consumed by every current and future capability. No capability may define its own contract model. This is broader than [ADR-0039](ADR-0039-functional-testing-capability-refounding.md), which scoped those contracts to capability 1; and it adds canonical types to the shared core, which the extensibility principle (CHARTER §17.3) permits only additively and which CHARTER §11 requires an ADR to authorise.

A platform contract layer that all six capabilities depend on cannot be introduced on a prompt: getting one definition wrong propagates to every capability at once. This ADR is the governed instrument that (a) names what already exists versus what is genuinely missing, (b) fixes the invariants the contract layer must preserve, (c) declares the canonical contracts, their registry, dependency graph and certification, and (d) authorises the additive build once accepted.

## 2. Context

**What exists today, verified against disk (CHARTER §3).** The platform already has two canonical contract homes and a certification engine — the layer is to be **extended, not created** (CHARTER §4):

- `packages/contracts/src/execution-package.ts`, `packages/contracts/src/evidence.ts`, `packages/contracts/src/version.ts` — the frozen cross-plane execution-package contract, the canonical evidence-reference model, and the contract-version authority, with a backward-compatibility harness (baseline surface + versioned fixtures) that already makes compatibility measurable.
- `packages/capability-framework/src/stages.ts` (the `Capability` contract, twelve `STAGES`, sealed `StageResult`), `packages/capability-framework/src/adapters.ts` (five connector SPIs — Project / TestManagement / Execution / WorkItem / SourceControl), `packages/capability-framework/src/certification.ts` (the certification-gate contract), and `packages/capability-framework/src/reasoning.ts` (the AI-optional reasoning contract).
- The certification engine of ADR-0025 and the ADR-0039 contract registry (`governance/capability/adr0039-contract-registry.mjs`) plus its Domain Activation Rule gate.

**So six canonical contracts already exist** (execution-package, evidence-reference, version, capability/lifecycle, certification, reasoning), the **connector SPI family is partial** (five of the eight families the directive names — Authentication, Application-Strategy and Reporting SPIs are absent), and **eight are not yet implemented** (Execution Context, Decision Engine, Repository-Intelligence model, Automation-Intelligence model, Reporting model, Domain Contract, Domain State model, Platform Event contract).

**The genuine gap is therefore additive**: three missing SPIs, eight missing canonical types, and the expansion of the certification engine to (i) register every platform contract with owner / version / canonical source / dependencies / verification rule / certification state / evidence / fault proof, (ii) compute a dependency graph and detect cycles, and (iii) report each contract as PASS / PARTIAL / FAIL / NOT IMPLEMENTED / UNKNOWN from executed evidence. No business logic is built in this phase.

## 3. Alternatives

| Option | Disposition |
|---|---|
| **Build a new, parallel contract framework** | **Rejected** — a second contract/certification framework beside the existing one is the CHARTER §4 duplication this programme exists to prevent, and the Phase-1 reconciliation already established the engine to extend. |
| **Leave the contracts capability-internal (ADR-0039 §4.6)** | **Rejected by the customer** — the objective is platform-wide reuse, one definition per concept, consumed by every capability. |
| **Amend the frozen architecture documents (11–14) to define each contract in prose** | **Rejected** — the canonical contracts belong in the versioned contract packages where they are executable and consumable, not restated in prose (CHARTER §4). The documents are referenced, not rewritten. |
| **Extend the existing contract layer + certification engine additively, gate-first, contracts declared in a registry and certified by executed evidence** | **Chosen.** |

## 4. Decision

**Establish the Canonical Platform Contract Framework as the existing contract layer and certification engine, EXTENDED.** Each cross-cutting concept has exactly one canonical definition in a shared package (`@dbiz/contracts` for data contracts, `@dbiz/capability-framework` for orchestration contracts); every capability consumes it; no capability defines its own. The framework registers, versions, dependency-checks and certifies each contract.

### 4.1 MUST preserve (enforced by the certification expansion)

| # | Invariant | Why |
|---|---|---|
| Q1 | R-11.4 / R-12.18 — the contract layer adds no capability and no second orchestration lifecycle; contracts are consumed by the twelve-stage lifecycle, never a parallel one | capability & lifecycle model |
| Q2 | The Domain State model (concept 9) is observational only — never a second execution lifecycle, never the twelve-stage typestate, never the six canonical tenant states | one lifecycle / one state authority |
| Q3 | The Event contract (concept 10) is observational — events never control execution sequencing; the single orchestration pipeline remains authoritative | one orchestration path |
| Q4 | One definition per concept in its canonical home; no capability defines an independent contract model (the certification engine detects a divergent definition) | CHARTER §4, single source of truth |
| Q5 | The Decision Engine (concept 2) is deterministic; AI may recommend, never own; every decision resolves with AI disabled | INV-9, AI-optional |
| Q6 | The Evidence model (concept 6) references the frozen cross-plane evidence contract; artefacts stay in the Execution Plane, only references cross | INV-1 |
| Q7 | Every contract is versioned through the existing version authority; incompatible changes are detected by the existing compatibility harness | backward compatibility measurable |
| Q8 | Contracts are additive to the frozen core — no existing frozen contract shape (execution-package, evidence-reference, six tenant states, twelve stages) is altered | frozen-core extensibility |

### 4.2 The canonical platform contracts

Each is owned by a shared package, versioned, and certified. Existing ones are consumed as-is; missing ones are added additively.

| Concept | Canonical home | State today |
|---|---|---|
| Canonical Execution Context | `@dbiz/capability-framework` | not implemented |
| Decision Intelligence Contract | `@dbiz/capability-framework` | not implemented |
| Connector SPI family (6 families) | `@dbiz/capability-framework` (`adapters.ts`) | partial (5 SPIs; +Authentication/Application-Strategy/Reporting) |
| Repository Intelligence model | `@dbiz/contracts` | not implemented |
| Automation Intelligence model | `@dbiz/contracts` | not implemented |
| Canonical Evidence model | `@dbiz/contracts` (`evidence.ts`) | implemented (reference model) |
| Canonical Reporting model | `@dbiz/contracts` | not implemented |
| Canonical Domain Contract | `@dbiz/capability-framework` | not implemented |
| Canonical Domain State model | `@dbiz/capability-framework` | not implemented |
| Platform Event contract | `@dbiz/contracts` | not implemented |
| Execution-Package contract | `@dbiz/contracts` (`execution-package.ts`) | implemented (frozen) |
| Contract Versioning | `@dbiz/contracts` (`version.ts`) | implemented |
| Capability / lifecycle contract | `@dbiz/capability-framework` (`stages.ts`) | implemented (frozen) |
| Certification contract | `@dbiz/capability-framework` (`certification.ts`) | implemented |
| Reasoning / AI-optional contract | `@dbiz/capability-framework` (`reasoning.ts`) | implemented |

### 4.3 Registry, dependency graph, certification and versioning

- **Registry** — every contract carries identifier, owner, version, canonical source, dependent contracts, verification rule, certification state, evidence and fault proof. It extends the ADR-0039 registry pattern; there is one registry, not two.
- **Certification** — each contract is measured to PASS / PARTIAL / FAIL / NOT IMPLEMENTED / UNKNOWN from executed evidence (the canonical source exports the declared symbol, or it does not). No subjective reporting (R-13.1).
- **Dependency graph** — built automatically from the registry's declared edges; the certification engine detects cycles and flags a contract that depends on an unimplemented one.
- **Versioning** — every contract is versioned through the existing version authority; incompatible changes are detected by the existing compatibility harness. Backward compatibility is measurable.

### 4.4 Mandatory governance amendments (acceptance conditions — customer-required, part of the decision)

Acceptance is conditioned on these seventeen amendments. Each is enforced by the certification framework (§4.3) as an executable rule, and each references its canonical home rather than restating it (CHARTER §4). Where an amendment could be read as breaching a frozen invariant, its governance boundary is stated so it cannot.

**G-1 · Canonical contracts are constitutional.** The platform contract layer is a constitutional-grade platform asset: every capability consumes the canonical contract, no capability defines an equivalent local contract, and a **duplicate contract definition is an architectural violation** the framework detects (extends CHARTER §4 / [01 — Platform Constitution](../architecture/01-platform-constitution.md); enforced by the dependency-graph duplicate check, G-12).

**G-2 · Contract ownership is unambiguous.** Every contract declares **owner · version · stability · compatibility policy · deprecation policy · certification rule**. Ownership is a shared package, never a capability (G-16).

**G-3 · Compatibility classification.** Every contract declares one of **experimental · internal · stable · deprecated · removed**; the framework validates that transitions are monotonic and policy-conformant (no jump from removed back to stable).

**G-4 · Contract evolution policy.** No contract changes arbitrarily: every incompatible change requires an **ADR + version increment + migration path + certification update** (CHARTER §11, R-18.26). Backward compatibility is measured by the existing compatibility harness (G-15).

**G-5 · Single canonical type registry.** The platform exposes one canonical type registry (execution context, evidence, repository analysis, automation plan, decision, reporting, events, domain state, connector contracts); capabilities import these and never redefine them (Q4, G-1).

**G-6 · Decision Engine is a first-class platform service — not a capability, not a lifecycle.** It owns strategy selection, connector/authentication resolution, capability routing and execution planning, and is **deterministic** with **AI advisory only**. Governance boundary: it is a *contract/service consumed within* the twelve stages; it adds **no seventh capability (R-11.4)** and **never sequences the lifecycle (R-12.18)** — capabilities consume its decisions, the one pipeline still drives.

**G-7 · Connector SPI governance.** Every connector declares **capabilities · version · supported operations · optional operations · security model · authentication requirements · failure semantics · retry semantics · certification state**; the framework validates these (extends [14 — Tool Operating Model](../architecture/14-tool-operating-model.md)).

**G-8 · Execution Context immutability.** The Execution Context is **immutable after orchestration begins**; domains may enrich execution *metadata* only through approved append-only extension points, never mutating tenant/security/governance fields; the framework validates immutability (Q6, C-2).

**G-9 · Event governance.** Events remain observational. ADR-0040 **explicitly prohibits event-driven orchestration, alternative execution paths, and hidden execution sequencing**; the twelve-stage pipeline is authoritative (Q3, R-12.18) — the framework flags any event wired to advance the lifecycle.

**G-10 · Evidence governance.** The evidence model distinguishes **execution · governance · certification · audit · customer** evidence classes; cross-plane transport continues to carry **references, never payloads** (Q6, INV-1, [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md)).

**G-11 · Reporting governance.** Reporting consumes canonical models only; tool reports (Playwright, Allure, future tools) are **evidence providers, never the source of truth** (Q-reporting, tool-agnostic).

**G-12 · Dependency-graph governance.** The graph detects **cycles · duplicate ownership · multiple canonical definitions · hidden dependencies · unused contracts · orphaned contracts · contract drift**; each is a certification failure, not a warning.

**G-13 · Contract maturity levels.** Every contract has a measurable maturity — **draft · proposed · implemented · certified · deprecated · retired**; the framework validates transitions (a contract cannot be certified while NOT IMPLEMENTED).

**G-14 · Capability consumption rule.** No capability may consume an **experimental or incomplete** contract unless explicitly permitted through governance — this keeps an unstable contract from becoming a production dependency (composes with the ADR-0039 Domain Activation Rule).

**G-15 · Contract change detection.** The framework detects **breaking changes · signature changes · schema drift · behavioural drift · dependency drift · version inconsistencies** — deterministic certification failures, measured against the versioned baseline surface + fixtures already in `@dbiz/contracts`.

**G-16 · Capability-neutral.** The contracts are for **every current and future capability** and contain **no Functional-Testing-specific assumptions**; the framework flags any contract owned by, or naming, a specific capability.

**G-17 · Roadmap in waves.** The fifteen contracts are classified into implementation waves, each ending in certification (§6.6).

## 5. Consequences (stated honestly)

- **The initial certified picture is mostly NOT IMPLEMENTED, and that is correct.** Six contracts pass, one is partial, eight are unbuilt; the framework reports this honestly rather than asserting completeness (R-13.1). The picture improves as each contract lands, gate-first.
- **A contract that all six capabilities consume becomes a single point of correctness.** Getting one wrong propagates everywhere — which is exactly why it is versioned, dependency-checked and certified before consumption, and why this ADR precedes the build.
- **The frozen core is touched — additively only** (Q8). No existing frozen contract shape changes; the new types are added beside them.
- **Certification is expanded, not duplicated** — the ADR-0039 registry and the ADR-0025 engine are extended; there is one registry and one engine.
- **No business logic is built in this phase** — no Functional Testing domain, no connector implementation, no application strategy, no reporting feature. Only the reusable contracts.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

1. **Accept this ADR** and index it in `program/DECISIONS.md`.
2. **Build the certification expansion FIRST, gate-first** (D-012): the platform-contract registry (owner/version/source/dependencies/verification-rule/state/evidence/fault-proof), the dependency graph with cycle detection, and the per-contract certification state — with a governance gate and its fault proof, registered in `run-all.js`. This measures the current state honestly (six pass, one partial, eight not implemented) before any type is added.
3. **Add the missing canonical types additively**, each with its verification rule and fault proof, one at a time, each flipping its certification state from NOT IMPLEMENTED to PASS: the three missing connector SPIs, then Execution Context, Decision Engine, Repository / Automation / Reporting models, Domain Contract, Domain State model, Event contract.
4. **Re-cut governance** — the registry, `run-all.js`, and the closure baseline; re-run the suite. Restore green by satisfying the gate, never by weakening it (P-002).
5. **Only when every contract is PASS and consumable without modification** does Functional Testing domain implementation (ADR-0039 §6.4) begin.

### 6.6 Implementation waves (G-17)

Each wave is additive, gate-first, and **ends in certification** (the contract's state flips NOT IMPLEMENTED→PASS by executed evidence before the next wave starts):

- **Wave 1 — Core execution contracts:** Execution Context (immutable, G-8), Domain Contract, Domain State model (observational, Q2).
- **Wave 2 — Connector contracts:** the three missing SPIs (Authentication, Application-Strategy, Reporting) with SPI governance (G-7).
- **Wave 3 — Decision contracts:** the Decision Engine service (deterministic, AI-advisory, G-6).
- **Wave 4 — Repository & automation contracts:** the Repository Intelligence and Automation Intelligence models.
- **Wave 5 — Reporting contracts:** the canonical Reporting model with reporting governance (G-11).
- **Wave 6 — Observability & events contracts:** the Platform Event contract (observational, G-9) and the observability telemetry contract.

The framework's governance amendments (G-1…G-16) that are measurable without the new types — duplicate detection (G-1/G-12), ownership and maturity/compatibility fields (G-2/G-3/G-13), capability-neutrality (G-16), cycle/orphan detection (G-12) — are enforced from the outset; the type-specific ones (G-6/G-7/G-8/G-9/G-10) become enforced as each wave lands.

## 7. Version impact

This ADR changes **no existing contract shape**: the execution-package and evidence-reference contracts, the six tenant states, and the twelve stages are all preserved (Q8). Its version impact, **on acceptance**, is **additive**: new canonical types are added to `@dbiz/contracts` and `@dbiz/capability-framework`, each versioned through the existing version authority (`version.ts`) so incompatible changes are caught by the existing compatibility harness. It extends the ADR-0039 registry and the ADR-0025 certification engine rather than forking either, and forces a re-cut of the closure baseline. The capability count (six, R-11.4), the one-lifecycle rule (R-12.18), the state authority (R-21.5) and the sovereign split are unchanged. Nothing lands on disk except as §6 executes in order.

## 8. Affected components

On acceptance, the affected components are:

- `packages/contracts/src/evidence.ts`, `packages/contracts/src/execution-package.ts`, `packages/contracts/src/version.ts` — the existing data contracts, consumed as-is; new canonical types (repository / automation / reporting models, event contract) added additively alongside them in the same package.
- `packages/capability-framework/src/adapters.ts`, `packages/capability-framework/src/stages.ts`, `packages/capability-framework/src/certification.ts`, `packages/capability-framework/src/reasoning.ts` — the existing orchestration contracts; the three missing connector SPIs, the Execution Context, the Decision Engine, the Domain Contract and the Domain State model added additively.
- `governance/capability/adr0039-contract-registry.mjs` — extended (not duplicated) by the platform-contract registry; `governance/verification/run-all.js` gains the platform-contract certification gate; `governance/closure/baseline.json` re-cut.
- [ADR-0039](ADR-0039-functional-testing-capability-refounding.md) — its C-1…C-14 contracts are elevated from capability-internal to platform-wide; [ADR-0025](ADR-0025-platform-certification-framework.md) — its certification engine is extended.
- [11 — Capability Model](../architecture/11-capability-model.md), [12 — Capability Orchestration](../architecture/12-capability-orchestration.md), [13 — AI Operating Model](../architecture/13-ai-operating-model.md), [14 — Tool Operating Model](../architecture/14-tool-operating-model.md), [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md) — **referenced, not amended**; the contract layer conforms to them.
- `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, `program/DECISIONS.md` — updated to record this decision.

---

**Gate:** No canonical type is added to the core and no contract is registered as consumable until this ADR is moved from PROPOSED to ACCEPTED. On acceptance, §6 executes in order, gate-first (D-012); a contract becomes consumable only when its certification state is PASS from executed evidence.
