# ADR-0027 — The Penetration Testing Engine's scanners, threat intelligence and domain orchestrators are internal structure, not a second orchestration lifecycle

**Status:** ACCEPTED · **Date:** 2026-07-23

## 1. Problem

A brief specified a canonical **Penetration Testing Engine** — one master orchestrator, fifteen domain orchestrators (including a dedicated Threat Intelligence engine), 120–180 specialised agents, a scanner catalogue spanning passive, active-safe and active-full phases, and a forty-plus-step linear workflow — and asked that it become the canonical implementation of the existing Penetration Testing capability *without any architectural drift*.

Executed literally, the linear workflow cannot be carried out inside the certified architecture, for the same structural reasons the Functional Testing Engine ([ADR-0022](ADR-0022-functional-testing-engine-internal-structure.md)) and the Inverse-Flow Discovery Engine ([ADR-0023](ADR-0023-discovery-flow-engine-internal-structure.md)) could not. This ADR records what was established, what was decided, and what was built.

## 2. Context

**The capability is already named canonically.** [Document 11](../architecture/11-capability-model.md) §3 names capability 6 the **Penetration Testing Engine**. There is no competing name and nothing to rename. The brief is the *first full implementation of capability 6*, not a replacement of an existing one.

**The specified linear workflow is a second orchestration lifecycle.** [Document 12](../architecture/12-capability-orchestration.md) defines twelve stages and states:

> **R-12.18** There is exactly **one** orchestration lifecycle for the platform. A capability may extend the framework internally; it SHALL NEVER redefine or bypass it.

The brief's forty-plus steps — Scope Validation → Reconnaissance → Passive/Active-Safe/Active-Full Scanning → Assessment → Threat Intelligence → Risk → Attack Chain → Repository → AI Enrichment → Historical → Remediation → Synchronization → Reporting, each with its own Review and Certification — are internal structure of the twelve stages, not a lifecycle of their own.

**The linear workflow omits the governance triad.** It names a Scope Review, a Scanner Review, an Assessment Review and so on, but no Architecture Review, Policy Review or Guardrail Review by those names. Stages 4, 5 and 6 are the **governance triad** (R-12.2), and no capability may bypass them (C-11.13). An engine that followed the linear list literally would ship a capability the registry refuses.

**Agent stubs are architecturally unrepresentable.** Document 11 (R-11.12, R-11.15, R-11.16) makes an incomplete capability impossible to register, and R-11.14 records why in the platform's own words: *the predecessor listed a penetration-testing capability in a tier definition, exposed it through an API, and shipped it with no runner on disk.* Writing 120–180 agent files with no executed evidence would recreate that exact defect at scale — in the very capability whose historical failure the rule was written about.

## 3. Alternatives

**Implement the linear workflow as specified.** Rejected: it redefines the lifecycle (R-12.18), bypasses the governance triad (R-12.2), and duplicates orchestration — which the brief itself forbids.

**Amend document 12 to accommodate the linear steps.** Rejected: the brief forbids modifying the certified architecture, and the twelve-stage lifecycle is shared by all six capabilities.

**Generate the agents as stubs now, fill them later.** Rejected on the architecture's own terms (R-11.14–R-11.16), and doubly so for this capability given R-11.14's provenance.

**Implement as internal structure over the twelve stages, and build it end to end.** **Chosen** — following the FTE and Discovery precedents, which built rather than deferred.

## 4. Decision

**The Penetration Testing Engine's fifteen domain orchestrators, scanners, threat-intelligence agents and ~184 domain agents are INTERNAL structure of one capability. They map onto the twelve stages; they do not replace them.**

The canonical mapping:

| Canonical phase(s) | Twelve-stage home | Plane |
|---|---|---|
| Penetration Test Request · Scope Validation | **1 Planning** | IP |
| Target Discovery · Reconnaissance | **2 Discovery** | **EP** |
| Surface intelligence — the minimisation crossing | **3 Context** | EP→IP |
| **Attack Surface Model** *(no linear equivalent)* | **4 Architecture Review** | IP |
| **Scan Authorization** *(no linear equivalent)* | **5 Policy Review** | IP |
| **Scan Guardrails** *(no linear equivalent — safe mode, production, rate, exclusions)* | **6 Guardrail Review** | IP |
| Scan Campaign assembly · Repository pre-search | **7 Execution Planning** | IP |
| Passive · Active-Safe · Active-Full scanning | **8 Execution** | **EP** |
| HAR / request-response evidence, hashed | **9 Evidence** | **EP** |
| Assessment · Risk · Threat Intelligence · Attack Chain · Repository · AI · Historical · Remediation · Learning | **10 Reflection** | IP |
| Release / Security Certification | **11 Certification** | IP |
| Synchronization · Executive Reporting | **12 Reporting** | IP |

**The governance triad is the answer to "where is the review the brief did not name".** Attack-surface modelling (4), scan authorization (5) and scan guardrails (6) are the three mandatory Review stages, expressed in penetration-testing terms. **No packet is transmitted before the guardrail stage certifies** — the scanners self-check the authorization the guardrail produces, and a destructive category authorized against a production target refuses the whole run at stage 6, before any Execution-Plane probe.

**The Threat Intelligence engine is a domain, not a seventh capability.** It is fifteen agents in the `threat` domain (MITRE, CVE, CWE, CAPEC, exploit maturity, threat actors, cloud context, zero-day awareness, heat map, executive threat score, …), running in the Reflection stage. R-11.4 holds: six capabilities, not seven.

**Sovereignty is in the types.** `RawFinding` carries the request and response snippets and never leaves the Execution Plane; `Finding` carries a category, a location, a CWE and an evidence *reference* and has no field for a payload. `EvidenceReference` has a hash and a locator and no content field. The crossing is one function, `minimiseFinding`, exactly as Discovery's `minimise` is the single surface crossing.

**AI-enabled and non-AI modes are one workflow.** Every agent receives reasoning as a *proposal input* gated by the capability-neutral `ai.enabled` key (translated from `pentest.aiEnabled` in the master orchestrator, C-11.11). Disabling reasoning withholds proposals; the same stages and agents run, and 212 of 220 agents are wholly deterministic, so the engine completes with reasoning unavailable (INV-7). Only eight `aiintel` agents declare a reasoning class, each with a prompt contract and a deterministic degraded path.

**Adapters remain the only locus of variation.** Azure DevOps and a cloud Security Hub publish through one `SecurityAdapter` SPI in an identical sequence; the orchestrator names no provider, proven by execution.

## 5. Consequences

**The capability count is unchanged: six.** Fifteen domain orchestrators and ~184 agents are internal to one capability and create no seventh.

**No architecture document changes.** Documents 11 and 12 already own capability structure and orchestration; this ADR adds no topic.

**A four-agent overshoot is recorded, not corrected by deletion.** The brief's target was 120–180 specialised agents; the catalogue holds 184 domain agents plus 36 governance agents (three per stage — the brief's own "Review, Decision and Certification agents in every stage", counted separately). The overshoot is recorded here rather than resolved by deleting working, wired, tested agents to hit a round number — the same posture ADR-0023 §7 took.

**One gate built, passing standalone, with recorded evidence.** `governance/verification/verify-pentest-conformance.js` and its scenario prove, by execution, the twelve-stage traversal, the governance triad, one-workflow-across-two-providers, EP/IP ownership, INV-7, and the property that most distinguishes this capability — *a destructive probe against production is refused before any packet*. Its negative detection is demonstrated by that refusal and by the triad-missing and unreachable-target refusals. `node governance/verification/verify-pentest-conformance.js` exits 0 and writes `governance/capability/pentest-evidence.json`.

**Registering the gate in `run-all.js` and re-baselining closure are the deliberate final step — recorded here, not silently performed.** Adding the gate to the runner and adding ADR-0027 to `docs/adr/` both change the closure baseline, and `verify-programme-closure.js` correctly flags that change until a human re-baselines with `node governance/closure/emit-closure-package.mjs program` and reviews the diff. That is the designed path (ADR-0022 and ADR-0023 took it): amending after closure is permitted, amending *silently* is not. This session leaves the runner and the closure baseline untouched so the amendment is reviewed rather than absorbed — the gate stands as an independently runnable, green verifier in the meantime.

## 6. Migration strategy

Nothing migrates. There is no prior implementation, no data, no registry entry and no consumer. The build order was fixed by the architecture: all twelve stages first (including the triad), register only when complete (R-11.12), domain orchestrators and agents behind the stage boundaries, adapters behind the SPI, and the execution path verified before the capability is presentable (R-11.14) — which the conformance suite does.

## 7. Version impact

No contract version changes. No architecture document version changes. No ADR is superseded. **ADR-0021 is untouched.** The closure baseline hash changes because `docs/adr/` and `packages/` gained files — recorded, not incidental.

## 8. Affected components

`docs/adr/ADR-0027-penetration-testing-engine-internal-structure.md` — **New**
`program/PENETRATION_TESTING_ENGINE_IMPACT_ANALYSIS.md` — **New**
`packages/penetration-testing-engine/**` — **New** (capability 6, 220 agents, 37 conformance tests)
`governance/capability/run-pentest-conformance.mjs` · `governance/verification/verify-pentest-conformance.js` — **New** (standalone, green)
`governance/verification/run-all.js` — **Registration pending deliberate re-baseline** (not modified in this session)
`governance/closure/baseline.json` — **Re-baseline pending** (`emit-closure-package.mjs`, human-reviewed)
`program/IMPLEMENTATION_STATUS.md` · `program/PROJECT_STATE.md` · `program/DECISIONS.md` · `program/SESSION_LOG.md` · `program/NEXT_ACTION.md` — **Modified** (state reconciled to disk)
