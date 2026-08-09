# 11 — Capability Model & Capability Ownership

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.4
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md)

**This document owns:** what a capability is, the five capabilities, their ownership across the planes, and the capability registry.
**It does not own:** the orchestration lifecycle ([12](12-capability-orchestration.md)), tool adapters ([14](14-tool-operating-model.md)), AI boundaries ([13](13-ai-operating-model.md)), or entitlement lifecycle ([21](21-tenant-lifecycle.md)).

---

## 1. What a capability is

**R-11.1** A **capability** is a complete, certifiable unit of quality engineering work: it plans, discovers, executes, produces evidence, and yields a certified verdict.

**R-11.2** A capability SHALL implement **every** stage of the orchestration lifecycle ([12](12-capability-orchestration.md)). There are no optional stages.

**R-11.3** A capability SHALL NOT define its own architecture. It supplies stage implementations to a framework it does not control.

### What is *not* a capability

| Not a capability | Why |
|---|---|
| A tool integration | That is an adapter ([14](14-tool-operating-model.md)) |
| A report or dashboard | That is the Reporting stage of a capability |
| A test type or technique | That is an operation within a capability's Execution stage |
| A workflow or template | That is configuration consumed by a capability |
| Anything that cannot produce a certified verdict | Certification is what makes a capability a capability |

**The distinction is load-bearing.** If "capability" means "feature," the platform accumulates features that each want their own lifecycle, and the shared orchestration becomes a suggestion. The test is narrow and mechanical: **if it cannot traverse all twelve stages and emit a certified verdict, it is not a capability.**

## 2. The five capabilities

**R-11.4** The platform implements exactly five capabilities. Adding a sixth requires an approved ADR.

**The numbering starts at 2 and that is deliberate.** Capability 1, the Functional Testing Engine, was removed under ADR-0087. A capability number is an **identity**, not a position in a list: it is cited verbatim by the certification reports, the governance evidence and the ADRs. Renumbering the survivors to close the gap would silently re-point every one of those citations at a different capability. The gap is the honest record of a removal; a contiguous list would not be.

| # | Capability | Answers |
|---|---|---|
| 2 | **Dev-Change Engine** | What did this change break, and what must be re-verified? |
| 3 | **Inverse-Flow Discovery Engine** | What does the application actually do, as opposed to what is documented? |
| 4 | **Performance Engine** | Does it meet its performance obligations under load? |
| 5 | **Security Testing Engine** | Does it satisfy its security requirements? |
| 6 | **Penetration Testing Engine** | Can it be compromised by an adversary? |

**R-11.5** All five share **one** orchestration framework. A capability that appears to need a different one is evidence that the framework is wrong — **the framework changes, not the capability.**

**R-11.6** No capability may bypass governance. The Architecture, Policy, and Guardrail Review stages are mandatory for all five.

### Reasoning dependency

**R-11.7** Every capability SHALL declare whether each stage requires reasoning. Stages that do not SHALL execute with the Intelligence Plane unreachable (INV-7, R-2.6).

| Capability | Execution requires reasoning |
|---|---|
| Dev-Change | No — executes an authored package deterministically |
| Inverse-Flow Discovery | No — crawling is deterministic; *interpretation* is reasoning |
| Performance | **No** — load generation is entirely deterministic |
| Security Testing | **No** — scanning is entirely deterministic |
| Penetration Testing | No — tool execution is deterministic; *prioritisation* is reasoning |

**Every capability's Execution stage is deterministic.** Reasoning happens in Planning, Reflection and Certification — never in Execution. This is not a coincidence; it follows from INV-4, and it is what makes degraded operation genuinely useful rather than a stub.

The predecessor got this wrong in a specific and instructive way: its Performance and Security engines needed no inference at all, and both still aborted when the reasoning plane was unreachable, because a single early return conflated unavailability with refusal.

## 3. Capability ownership across the planes

**R-11.8** A capability is **not** owned by one plane. Its stages are distributed, and the distribution is fixed by [12](12-capability-orchestration.md).

| Concern | Owner |
|---|---|
| Capability **definition** — what stages exist, what they mean | Intelligence Plane |
| Capability **registry** — what capabilities exist and their execution paths | Intelligence Plane |
| Reasoning stages — Planning, Reviews, Reflection, Certification, Reporting | Intelligence Plane |
| Performing stages — Discovery, Execution, Evidence | Execution Plane |
| Tool bindings for a capability | Execution Plane |
| Entitlement — which tenant may use which capability | Intelligence Plane ([21](21-tenant-lifecycle.md)) |

**R-11.9** The Execution Plane SHALL NOT define a capability. It **implements** the performing stages of capabilities defined by the Intelligence Plane.

## 4. The capability registry

**R-11.10** The registry is the **single source of truth** for what capabilities exist. There is no second list — not in configuration, not in documentation, not in a tier definition.

**R-11.11** A registry entry SHALL declare: identity, version, all twelve stage implementations, reasoning dependency per stage, required adapter interfaces, required evidence classes, and its certification criteria.

**R-11.12** Registration SHALL fail if any mandatory stage is absent.

**R-11.13** A capability SHALL NOT be entitled to a tenant unless the registry confirms a **verified execution path** ([21](21-tenant-lifecycle.md) R-21.11).

**R-11.14** A capability SHALL NOT be presentable to a customer — in an API, a console, a tier listing, or a contract — unless it is registered and its execution path is verified.

### Why the registry is the only list

**R-11.14 exists because of a precise failure.** The predecessor listed a penetration-testing capability as enabled in a tier definition, exposed it through an API, and shipped it with **no runner on disk**. Its dispatch wrapper logged the missing script and returned a soft failure.

> A penetration test that silently does nothing and reports no findings is indistinguishable, to its consumer, from a clean result. **This is the most dangerous possible failure mode for a security capability** — it does not merely fail to protect, it actively asserts safety.

Three separate declarations existed — tier listing, API surface, documentation — and none was coupled to the existence of code. **A single registry, validated against real execution paths, makes that state unreachable** rather than merely detectable.

## 5. Structural completeness

**R-11.15** An incomplete capability SHALL be **unrepresentable**, enforced at four independent levels:

| Level | Mechanism | Failure mode |
|---|---|---|
| **Compile time** | The capability interface declares all twelve stages as required members | Missing stage → type error; the code does not build |
| **Type flow** | Each stage consumes the previous stage's output type | Skipping a stage → no value of the required type exists |
| **Registration** | Runtime schema validation of the registry entry | Missing stage → registration throws at startup |
| **Deployment** | CI gate asserting every registered capability has a verified execution path | Missing path → build fails, artefact is not produced |

**R-11.16** No capability may be registered with a stage stubbed to a no-op. A stage that legitimately performs no work for a capability SHALL return an explicit, typed "not applicable" result — **it SHALL NOT be silently empty.**

**R-11.16 is the subtle half of the requirement.** Requiring all twelve stages to exist is easy to satisfy dishonestly, by supplying twelve functions of which several do nothing. Requiring an *explicit typed declaration* of non-applicability makes the omission visible in the registry, reviewable, and certifiable — and it distinguishes "this stage found nothing" from "this stage did nothing," which is the same distinction as C-10.10 and R-21.6.

## 6. Extension

**R-11.17** Adding a capability SHALL require: a registry entry, twelve stage implementations, and an ADR. It SHALL NOT require a change to the framework, the composition root, the contracts, or any other capability.

**R-11.18** Adding a **tool** to an existing capability SHALL require only an adapter implementation ([14](14-tool-operating-model.md)).

**R-11.19** The framework SHALL contain no capability-specific logic. A conditional naming a capability inside framework code is a violation.

## 7. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-11.1** | Every registered capability implements all twelve stages | Compile-time interface; registration schema; CI gate |
| **C-11.2** | A capability missing a stage fails to compile | Negative compile test in CI |
| **C-11.3** | A capability cannot skip a stage at runtime | Type-flow test; no constructible path around a stage |
| **C-11.4** | Registration fails when a stage is absent | Negative registration test |
| **C-11.5** | No stage is a silent no-op; non-applicability is explicit and typed | Registry inspection gate |
| **C-11.6** | Every registered capability has a verified execution path | CI execution-path gate |
| **C-11.7** | A capability with no execution path cannot be entitled | Provisioning negative test |
| **C-11.8** | No capability is presentable in any surface unless registered and verified | Surface-versus-registry reconciliation gate |
| **C-11.9** | The registry is the only enumeration of capabilities | Duplicate-list scan across config, docs and code |
| **C-11.10** | Every capability is exercised end-to-end in CI | Per-capability CI job — five jobs |
| **C-11.11** | No framework code branches on a capability identity | Framework source scan |
| **C-11.12** | Every capability's Execution stage completes with the Intelligence Plane unreachable | Severed-boundary test per capability |
| **C-11.13** | No capability bypasses the three Review stages | Stage-invocation trace test |

**C-11.10 is non-negotiable and was the predecessor's single most consequential omission.** Its CI invoked none of its capability scripts. A capability not executed in CI is unverified, and unverified capabilities are exactly where declared-but-unbuilt hides.

## 8. Open items

| # | Item | Target |
|---|---|---|
| **AD-025** | Capability versioning: whether a tenant may pin a capability version | M1.5 |
| **AD-007** | Whether mobile execution is a seventh capability or an execution mode of the first | M1.5 |

**AD-007 is a scope decision with structural consequence.** As an execution mode it is an adapter concern; as a capability it needs twelve stages and a registry entry. Deciding it late means building it twice.
