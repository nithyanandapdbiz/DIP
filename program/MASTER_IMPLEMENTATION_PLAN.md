# Master Implementation Plan

**Programme:** DBiz Agentic QA Platform — Enterprise Re-Foundation
**Owner:** Autonomous Enterprise Engineering Organisation
**Created:** 2026-07-22 · **Plan version:** 1.0

This document defines **phase and milestone structure only**. It contains no architecture. Architecture is authored in `DBiz_IntelligencePlane/docs/architecture/` and referenced from `ARCHITECTURE_STATUS.md`.

---

## 1. Programme shape

Eleven phases. Each phase completes before the next begins, because each produces a prerequisite the next consumes. The ordering is a dependency chain, not a preference.

```
P0  Program Foundation
P1  Canonical Enterprise Architecture
P2  Platform Contracts & Interfaces
P3  Governance-as-Code Baseline
P4  Intelligence Plane Foundation
P5  Execution Plane Foundation
P6  Cross-Plane Integration
P7  Reference Capability — Functional Testing Engine
P8  Capability Expansion
P9  Multi-Tenancy & Sovereignty Enforcement
P10 Enterprise Production Readiness
```

**Why governance (P3) precedes all runtime work (P4+).** The legacy platform authored its controls and audited conformance afterwards, discovering 76 violations at baseline. Building the verification suite before the runtime inverts that: a violation becomes visible the moment it is introduced, not at audit. This is the single most consequential structural difference between this programme and its predecessor.

## 2. Phases and milestones

### P0 — Program Foundation
*Establish the programme's memory and working agreements.*

| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M0.1** | Root structure, `CLAUDE.md`, `program/` state files | All 12 authoritative files exist and are internally consistent |
| **M0.2** | Legacy knowledge extraction complete | Lessons-learned recorded in `DECISIONS.md` / `RISKS.md`; no legacy artefact copied |
| **M0.3** | Repository skeletons with ownership boundaries declared | Both repos initialised; ownership stated; git initialised |

### P1 — Canonical Enterprise Architecture
*Author the architecture from first principles. No implementation.*

| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M1.1** | Platform Constitution — the immutable rules and invariants | Every rule is stated, numbered, and mechanically checkable or explicitly marked as not |
| **M1.2** | Reference Architecture + both plane architectures | One canonical answer per topic; no duplicates |
| **M1.3** | Sovereignty, tenancy, security, and data-flow models | Each carries explicit conformance criteria |
| **M1.4** | Capability model + capability orchestration | All six capabilities provably share one orchestration |
| **M1.5** | AI, tool, configuration, runtime, deployment models | AI-disabled operation specified, not assumed |
| **M1.6** | Architecture freeze v1.0 | Every question answerable from the architecture; changes require ADR |

### P2 — Platform Contracts & Interfaces
*Define what crosses boundaries, before anything is built to cross them.*

| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M2.1** | Cross-plane contract (the execution package) | Wire format specified and versioned |
| **M2.2** | Evidence contract + one canonical integrity primitive | Exactly one implementation of each governed term |
| **M2.3** | SPI definitions for every external system class | No external system reachable except through an SPI |
| **M2.4** | Configuration schema and precedence rules | Every declared field has a consuming code path |

### P3 — Governance-as-Code Baseline
*Make every architectural rule continuously enforced before the runtime exists.*

| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M3.1** | Verification harness + runner | Gating and informational findings are distinct result classes; every gate ships with a recorded fault-injection proof |
| **M3.2** | Structural checks — boundary integrity (strict from day one), plane separation, import rules, no environment-conditional guards, no exported capability that must never run | Each observed to fail on a planted violation |
| **M3.3** | Declared-vs-consumed checks — configuration fields, capability registry, tier definitions | A declared field with no reader, or a capability with no execution path, fails the build |
| **M3.4** | CI on all branches; branch protection as code; `NOT RUN` reported and treated as `FAIL` | Gates run where development happens, and the absence of a run is itself a failure |

**The runner design.** Gating checks block; informational findings are reported with the decision that blocks them named, so the suite can be honestly green while real findings stay open awaiting a ruling — rather than forcing a choice between a permanently red build and a silenced check. A probe that *proves a defect exists* inverts its exit code and is a first-class artefact: it converts a claim into a reproducible fact, and becomes the regression test the moment the defect is fixed.

**The suite observes the repositories; it is not a dependency of them.** It runs from the programme root and is not wired into either repository's scripts — doing so would make a repository depend on a path above its own root, which is the precise defect the boundary check exists to prevent.

### P4 — Intelligence Plane Foundation
| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M4.1** | Composition root and runtime wiring | One composition root; verified by check |
| **M4.2** | Policy decision point (single PDP, thin PEPs) | No policy logic outside the PDP |
| **M4.3** | AI runtime with provider abstraction | Platform passes its suite with AI disabled |
| **M4.4** | Certification and decision services | Decisions deterministic and reproducible |

### P5 — Execution Plane Foundation
| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M5.1** | Execution runtime and sequencing | Executes a package; makes no certification decision |
| **M5.2** | Credential custody | No secret material crosses the plane boundary |
| **M5.3** | Evidence custody and integrity | Evidence verifiable by the canonical primitive |
| **M5.4** | Degraded-mode operation | Executes correctly with the Intelligence Plane unreachable |

### P6 — Cross-Plane Integration
| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M6.1** | End-to-end package round trip | Authored in IP, sequenced in EP, certified in IP |
| **M6.2** | Availability and refusal semantics | Unavailability degrades; refusal halts |
| **M6.3** | Evidence flow and retention enforcement | Retention enforced by code, not declared in config |

### P7 — Reference Capability: Functional Testing Engine
| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M7.1** | All eleven orchestration stages implemented | No stage bypassed or stubbed |
| **M7.2** | AI-enabled and AI-disabled paths | Both certified |
| **M7.3** | Capability conformance check | Becomes the template every later capability is verified against |

### P8 — Capability Expansion
| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M8.1** | Dev-Change Engine | Passes the P7 conformance check |
| **M8.2** | Inverse-Flow Discovery Engine | Passes the P7 conformance check |
| **M8.3** | Performance Engine | Passes the P7 conformance check |
| **M8.4** | Security Testing Engine | Passes the P7 conformance check |
| **M8.5** | Penetration Testing Engine | Passes the P7 conformance check; no silent-failure path |

### P9 — Multi-Tenancy & Sovereignty Enforcement
| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M9.1** | Tenant registry and isolation | Physical partitioning, verified |
| **M9.2** | Data sovereignty enforcement | Ephemerality and purge enforced by code |
| **M9.3** | Graded access control | Enforced on every administrative surface |

### P10 — Enterprise Production Readiness
| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M10.1** | Deployability | Both images build and start in CI |
| **M10.2** | Supply chain | Scan, SBOM, signing — executed, not merely authored |
| **M10.3** | Full certification | Every conformance criterion green |

## 3. Governing constraints

**Build order is never inverted.** Architecture → Contracts → Interfaces → Configuration → Documentation → Implementation.

**A milestone is done only when** architecture, implementation, tests, documentation, security, governance, and performance criteria all pass **and** programme state is updated. Partial completion is recorded as in-progress, never as done.

**Technical debt is not scheduled.** It is fixed on discovery. `TECHNICAL_DEBT.md` exists to prove it is empty, not to accumulate entries.

**Every capability shares one orchestration.** A capability that needs a different architecture is a signal that the architecture is wrong — the architecture changes, not the capability.

---

# P2 — Governed programme roadmap

Adopted 2026-07-22 as the planning baseline. Internal tasks may be refined; milestone objectives change only through Architecture Change Control.

| Milestone | Objective | Status |
|---|---|---|
| **M2.1** | Cross-plane contract package | **COMPLETE** — `@dbiz/contracts` v1.0.0 |
| **M2.2** | Consumer compatibility harness | **COMPLETE** — 9 properties, evidence-backed |
| **M2.3** | *(absorbed)* — package publication and signing | Folded into **M2.4**; signing and promotion are supply-chain concerns and separating them would have split one pipeline across two milestones |
| **M2.4** | Trusted software supply chain | **PARTIAL** — 11 measured, 3 NOT MEASURED |
| **M2.5** | Production deployment readiness | **BLOCKED** — Docker unavailable |
| **M2.5a** | Platform Service architecture baseline | **COMPLETE** — documents 23, 24, 25 frozen |
| **P2.3** | Tenant onboarding & secure solution generation | **COMPLETE** — ADR-0021 |
| **M2.6** | Operational readiness | **COMPLETE** — 16 properties proven; E-2 (deployment) NOT MEASURED, blocked on Docker |
| **M2.7** | Customer success & adoption | **COMPLETE** — 15 properties proven; 4 NOT MEASURED (no customer, no test runners, no clean-environment runner, no Docker) |
| **M2.8** | Observability & platform intelligence | **COMPLETE** — 36 properties measured; 5 NOT MEASURED. **General Availability NOT certified: nothing deployed** |
| **M2.9** | *(not created — instructed)* | The M2 programme is complete. GA is the outstanding determination, and it is blocked on deployment evidence, not on a further milestone |
| **GA** | General Availability | **NOT CERTIFIED** — E-2 `NOT MEASURED`. The absence is now measured by a probe rather than asserted |

## The sequencing conflict M2.6–M2.8 contain

The roadmap asks for Operational Excellence, Customer Success and Platform Intelligence to be **implemented**. [ADR-0018](../docs/adr/ADR-0018-platform-services-and-programme-instruments.md) assigned each a canonical document — 23, 24 and 25 — and **none is authored**.

The build order forbids implementing before architecture (CHARTER §5): *architecture precedes everything; runtime shall not precede contracts*. Implementing SLOs before document 23 exists would mean writing the operational model in code and back-filling the document to match — which is how the predecessor's architecture came to describe a system nobody had built.

**Proposed resolution, requiring no roadmap change:** insert an architecture increment **M2.5a** authoring documents 23, 24 and 25 to the same standard as the frozen set — conformance criteria, declared ownership boundaries, gate-verified — before M2.6 begins. Milestone objectives are preserved; only their prerequisite is made explicit.

## What may advance readiness

**Only measurable evidence.** M2.5 remains `NOT MEASURED` until Docker exists; no simulated deployment evidence is permitted. Supply-chain signing, attestation and promotion remain `NOT MEASURED` until tooling exists. Neither is counted against the score either — an unmeasured input contributes nothing in **either** direction, because inventing a zero is as dishonest as inventing a one.
