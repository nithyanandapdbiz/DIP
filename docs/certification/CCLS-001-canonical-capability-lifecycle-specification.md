# CCLS-001 — Canonical Capability Lifecycle: Normative Crosswalk & Conformance Specification

**Status:** PROPOSED · **Date:** 2026-07-29 · **Authorized by:** ADR-0062 (PROPOSED) · builds on ADR-0061
**Effective:** upon acceptance of ADR-0062 and the corresponding amendments to architecture documents 11/12/16.

> **This document is a normative CROSSWALK, not a second source of truth.** Every concern below — lifecycle, orchestration, governance, policy, runtime, evidence, certification, auditability, security — **already has exactly one canonical home** in the frozen architecture (documents 01–25). CHARTER §4 forbids a second copy ("a guarantee of divergence"), and CLAUDE.md §2 makes the architecture the final authority on every architectural topic. **CCLS-001 therefore references the owning documents; it does not restate or supersede them. On any divergence between this document and an owning document, the owning document governs.** The mandate's phrase "single source of truth" is honoured by *pointing at* the single sources, and by adding only the material ADR-0062 newly introduces (the capability-agnostic host, the extension model, the conformance matrix), which no existing document yet owns.

---

## 1. Why a crosswalk and not a new specification

The requested content — one lifecycle, the governance triad, the single Policy Decision Point, the evidence/certification/failure/observability/security models, the platform contracts — is **already normative** and **already owned**:

| Concern | Canonical owner (governs) |
|---|---|
| Capability lifecycle · orchestration · the twelve stages · no-bypass | [12 — Capability Orchestration](../architecture/12-capability-orchestration.md) |
| Capability model · six capabilities · no seventh | [11 — Capability Model](../architecture/11-capability-model.md) |
| Governance model · certification · GCI | [18 — Governance Model](../architecture/18-governance-model.md) |
| Policy · Policy Decision Point (R-03.6) | [08 — Security Model](../architecture/08-security-model.md) · [03 — Intelligence Plane](../architecture/03-intelligence-plane-architecture.md) |
| Runtime model · the host | [16 — Runtime Model](../architecture/16-runtime-model.md) |
| Evidence model · by-reference · integrity | [10 — Evidence Flow Model](../architecture/10-evidence-flow-model.md) |
| Data sovereignty · tenant isolation · threat model | [06](../architecture/06-data-sovereignty.md) · [07](../architecture/07-tenant-isolation.md) · [22](../architecture/22-security-threat-model.md) |
| Cross-plane contracts · Runtime SPI · ExecutionPackage | [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md) |
| Operational excellence · auditability · observability | [23 — Operational Excellence Model](../architecture/23-operational-excellence-model.md) |

Re-authoring any of these as a free-standing "CCL specification" would create a second normative source that immediately diverges. This document instead **consolidates them into one conformance reference** and records the **delta** ADR-0062 introduces.

## 2. The one lifecycle IS the twelve constitutional stages (mandate flow reconciled)

The mandate's execution flow is not a new lifecycle; it is the **twelve stages of document 12** (R-12.1, no bypass) with finer-grained steps shown as sub-activities and boundary crossings. Adopting the mandate's list *as a new stage set* would redefine the lifecycle — forbidden by R-12.18 and preserved against by ADR-0062. The authoritative mapping:

| Mandate step | Constitutional stage (doc 12) | Note |
|---|---|---|
| Client Request · Capability Entry Point | (entry, pre-stage-1) | the host receives the request |
| Planning | **1 · Planning** (IP) | intent (R-12.7) |
| Discovery | **2 · Discovery** (EP) | reality (C-12.9) |
| Context Assembly | **3 · Context** (EP→IP) | minimise + scrub |
| Architecture Review | **4 · Architecture Review** (IP) | **governance triad** (R-12.2), via the single PDP (R-12.13) |
| Policy Review | **5 · Policy Review** (IP) | **governance triad** |
| Guardrail Review | **6 · Guardrail Review** (IP) | **governance triad** |
| Execution Planning · Capability Composition · Execution Package Generation | **7 · Execution Planning** (IP) | composition + sealing are *within* stage 7; exactly one sealed package (R-12.3) |
| Runtime SPI · Execution Plane | (stage-7→8 boundary) | dispatch over the Runtime SPI (doc 20); not a stage |
| Execution | **8 · Execution** (EP) | sequence the package |
| Evidence Collection | **9 · Evidence** (EP) | hash + custody |
| Reflection | **10 · Reflection** (IP) | never in EP (C-12.10) |
| Certification | **11 · Certification** (IP) | deterministic verdict |
| Registration · Reporting | **12 · Reporting** (IP) | publication/registration is a stage-12 / directed-stage exchange (doc 12 §5.2), not a separate lifecycle stage |
| Completion | (terminal, post-stage-12) | run closed; evidence + verdict final |

**Conformance rule:** an implementation SHALL realize exactly these twelve stages in order, no bypass (R-12.1/C-12.5), the triad every run (R-12.2/C-12.6), one sealed package at stage 7 (R-12.3), stages 10–12 never in the EP (C-12.10). The finer steps are internal structure, not stages (R-12.15: an extension SHALL NOT alter its host stage's types).

## 3. Architectural principles → owning rule (the mandate's ten principles, by reference)

| # | Principle | Governing rule (owner) |
|---|---|---|
| 1 | One lifecycle per capability execution | R-12.18 · C-12.18 (doc 12) |
| 2 | One Governance Triad | R-12.2 · C-12.6 (doc 12) |
| 3 | One Policy Decision Point | R-12.13 · R-03.6 (docs 12/03/08) |
| 4 | One Certification Pipeline | doc 18 · C-12.10/11 (certification is an IP stage) |
| 5 | One Evidence Model | doc 10 · INV-1 (references + hashes only) |
| 6 | One Runtime SPI | doc 20 · doc 16 |
| 7 | One Execution Package | R-12.3 · doc 20 (the single package contract, C-12.14) |
| 8 | Deterministic execution | R-13.1 · R-14.2 (evidence over assertion; proofs replay) |
| 9 | Complete audit trail | doc 10 · doc 23 |
| 10 | Zero fabricated lifecycle stages | R-12.11 · C-12.4 (no bypass/override/test-hook fabricates a stage result) |

None of these is restated here; each is verified by its existing gate (§6).

## 4. Governance triad, PDP, and the models — location of enforcement (reference, not restatement)

- **Governance triad** (Architecture/Policy/Guardrail Review, stages 4–6): purpose, evidence and failure conditions are owned by **doc 12 §governance triad + doc 18**. Under ADR-0062 the triad executes **in the canonical host** between stage 3 and stage 7, each review assembling context and delegating to the **single PDP** (stages 4–6 contain no policy logic — R-12.13). The *requirement* is unchanged; only the host that invokes the PDP changes.
- **Policy Decision Point:** exactly one (R-03.6). It evaluates architecture, tenant policy, security, capability policy, runtime constraints and compliance — owned by **docs 03/08/18**. No capability-specific bypass, no duplicate policy engine (C-12.18 semantics extended to policy).
- **Evidence · Certification · Failure · Observability · Security · Tenant · Contracts models:** each is owned respectively by **docs 10 · 18 · 16 · 23 · 08/22 · 06/07 · 20**. CCLS-001 adds no field to any of these; it requires that every capability, on the canonical host, satisfy them unchanged.

## 5. The delta ADR-0062 introduces (specified here pending doc 12/16 amendment)

This is the only genuinely-new material — it is not yet owned by any document, so it is specified here as ADR-0062's normative delta, to be merged into documents 16 (runtime) and 12 (orchestration) on acceptance:

**5.1 Canonical Capability Host (capability-agnostic).** The host provides the lifecycle engines the mandate enumerates — Planning, Lifecycle, Governance, Policy, Composer, Execution-Package generation, Evidence, Reflection, Certification, Registration, Reporting — as **one implementation-independent runtime that hosts the twelve stages for every capability**, invoking the single PDP for the triad and emitting the single sealed package at stage 7. It is the FT canonical runtime (`canonical-capability.ts` + composer + SPI + bridge) **generalized**; today it exists only for Functional Testing (verified: no other capability references it), so the host generalization is required implementation work, not a repoint.

**5.2 Extension model.** A capability contributes **only domain logic** — Planning, Discovery, Execution, Evidence-enrichment, Reflection and Reporting *content* — as internal structure. A capability SHALL NOT own or replace Planning-as-a-stage, Governance, Policy, Runtime, Certification or Reporting-as-a-stage, and SHALL NOT define its own lifecycle (R-12.18) or alter a host stage's input/output types (R-12.15). The lifecycle owns orchestration; capabilities own business behaviour.

**5.3 One authoritative model at all times.** During migration the repository SHALL never contain two *authoritative* lifecycle models (C-12.18): capabilities migrate one at a time behind the one host, replacement certified before removal (the ADR-0039 discipline), while the framework twelve-stage runner remains the authoritative implementation for not-yet-migrated capabilities — one model, one legacy implementation draining, never two authoritative models.

## 6. Conformance verification matrix (behaviour-based, per ADR-0062)

Each obligation is verified by an existing gate, rewritten (per ADR-0062) to verify **behaviour**, not a specific implementation:

| Obligation | Verified by |
|---|---|
| All twelve stages, in order | `verify-capability-conformance` · `verify-functional-completeness` (→ behaviour) · C-12.1/C-12.5 |
| Governance triad every run, via the single PDP | C-12.6 trace assertion · doc 18 gates |
| One lifecycle only | C-12.18 (scan for alternative lifecycles) |
| No fabricated stage results | C-12.4 (source/seam scan) |
| One sealed ExecutionPackage at stage 7 | C-12.14 · `verify-execution-contracts` |
| Evidence by reference, integrity | `verify-ep-certification` · INV-1 |
| Execution / browser stays EP-only | `verify-execution-plane-boundary` (tree-wide) |
| Tenant isolation | `verify-tenant-isolation` · docs 07/06 |
| Determinism / proof replay | `record-fault-proofs` · R-14.2 |

An implementation that diverges from an owning document fails that document's gate — which is what "the implementation is incorrect if it differs from the specification" means in this repository: it is measured against the **owning architecture and its gates**, with CCLS-001 as the index that ties them together.

## 7. Migration & non-negotiables (reference)

Migration phases and their conditionality are owned by **ADR-0062 §Migration** (lifecycle definition → host implementation → governance → capability-by-capability → legacy retirement) and are not restated here. The non-negotiables — Execution-Plane and Intelligence-Plane ownership, the Runtime SPI, the ExecutionPackage, capability contracts, evidence contracts, certification contracts, tenant contracts, browser ownership — are owned by docs 04/03/20/06/07/10/18 and are unchanged; **only the lifecycle host changes.**

## 8. Status and precedence

CCLS-001 is **PROPOSED and subordinate.** It becomes the consolidated normative conformance reference for the Canonical Capability Lifecycle **on acceptance of ADR-0062** and the merge of §5 into documents 12/16. It creates no capability, defines no new stage, and changes no rule. Where CCLS-001 and any owning architecture document differ, **the architecture document governs** (CLAUDE.md §2, CHARTER §4). No repository code is modified by this document.
