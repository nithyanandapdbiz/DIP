# ADR-0026 — Performance Engine internal structure

**Status:** Accepted
**Date:** 2026-07-23
**Deciders:** Performance Engineering Architecture, Platform Architecture
**Supersedes:** none · **Amends:** none · **Closes:** none (implements capability 4 of the frozen six)

---

## 1. Problem

The platform's frozen capability model (`11-capability-model.md` §2, R-11.4) declares six capabilities. Four are built (Functional, Dev-Change, Inverse-Flow Discovery, Penetration). Capability **4 — the Performance Engine — is `NOT STARTED`.** The delivery brief ("PTIE — Performance Testing Intelligence Engine") requires an autonomous performance-engineering capability that discovers topology, models workload, designs and generates performance tests, executes load, monitors thousands of metrics, detects bottlenecks, performs root-cause analysis, forecasts capacity, raises defects, syncs to Jira/ADO/Zephyr/Xray, reports, and certifies — working **identically with AI enabled and AI disabled**.

The question this ADR answers is *how* to build that as internal structure of capability 4 over the one frozen orchestration lifecycle, without adding a lifecycle, a capability, an architecture document, or a change to any frozen component.

## 2. Context

- **R-12.18** — exactly one orchestration lifecycle; a capability extends it internally and never redefines it.
- **R-11.4** — exactly six capabilities; a seventh needs an approved ADR. "PTIE" is not a seventh capability; it is the product name of capability 4. This ADR does **not** add one.
- **R-11.7 / §2** — the Performance Engine's Execution stage requires **no reasoning**; load generation is deterministic. The predecessor's Performance engine aborted when reasoning was unreachable — the defect this design must structurally prevent (INV-7).
- **R-11.6 / R-12.2** — the Architecture, Policy and Guardrail review stages are mandatory; no bypass.
- **C-14.1** — every tool is reached through an adapter SPI; providers differ in nouns, never in the order of the workflow.
- **06/07/08 + E-5** — customer topology and raw metric samples are Execution-Plane custody; only minimised aggregates and references cross into the Intelligence Plane.
- Precedent: **ADR-0022 §6.5** established that a capability's sub-engines are *internal structure*, not new architecture. ADR-0023 (Discovery), ADR-0024 (Dev-Change / Pentest) applied it. This ADR is the fifth application.

## 3. Alternatives

**A. A separate "PTIE" service/lifecycle.** Rejected. Directly violates R-12.18 and R-11.4, duplicates orchestration/governance/reporting, and is the exact duplication CHARTER §4 forbids. The two conformance gates (`P-10`, `P-10.a`) would fail the build.

**B. A new architecture document (26-performance-model.md).** Rejected. Performance testing needs no new architectural concept — it is a capability, and capabilities are defined by Document 11, which already names it. Adding document 26 trips `P-10.a` (archDocs must remain 25) and violates CHARTER §4 (one topic, one home).

**C. A literal implementation of the brief's ~15 "engines" as branches.** Rejected. Discovery/Workload/Design/Script/Metrics/Bottleneck/RCA/Predictive/Reporting are **domains within the twelve stages**, coordinated by domain orchestrators — not lifecycles. A per-engine or per-tool branch in orchestration is the drift `adapters.ts` and the conformance scan exist to prevent.

**D. Two code paths for AI-enabled vs AI-disabled.** Rejected. R-12.18 forbids the second workflow; the framework already models the two modes as one by *withholding proposals*. Every agent carries a deterministic decision path (`nonAiBehaviour`) exercised when `proposal === null`.

**E (chosen). Capability-internal structure over the twelve frozen stages**, mirroring the Penetration Testing Engine: a master orchestrator, domain orchestrators, an agent catalogue, a `PerformanceAdapter` SPI, and a conformance gate — reusing the framework unchanged.

## 4. Decision

Implement `@dbiz/performance-engine` (registry id `performance-engine`, name "Performance Engine") as internal structure of capability 4.

**4.1 Stage mapping** (plane fixed by `STAGE_PLANE`):

| # | Stage | Domain work |
|---|---|---|
| 1 planning | IP | requirement intake, SLA/SLO/SLI, workload objectives, scope |
| 2 discovery | EP | topology discovery (pages, REST/SOAP/GraphQL/gRPC/WS/SSE, deps, queues, DBs, CDNs) |
| 3 context | EP→IP | minimisation crossing — raw topology → surface facts |
| 4 architecture-review | IP | **workload model** (transactions, journeys, concurrency, arrival rate, think time, seasonality) — triad |
| 5 policy-review | IP | **test design authorisation** (plan, suites, cases, thresholds, KPIs, acceptance) — triad |
| 6 guardrail-review | IP | **execution guardrails** — no load on production without authorisation; rate & blast-radius ceilings — triad |
| 7 execution-planning | IP | script generation + scenario matrix + distributed plan |
| 8 execution | EP | load generation — deterministic, reasoning-free (R-11.7) |
| 9 evidence | EP | metric capture by reference (percentiles, TPS, infra, DB, queue; dumps/HAR refs) |
| 10 reflection | IP | bottleneck detection, root-cause chains, regression, capacity forecast, prediction, learning, defects |
| 11 certification | IP | performance/scalability/reliability/availability/stability/capacity/risk scores → verdict |
| 12 reporting | IP | executive/engineering/capacity reports; Jira/ADO/Zephyr/Xray sync-back |

**No workload profile is generated as load before the guardrail stage (6) certifies.** This is the performance analogue of pentest's "no packet before certification".

**4.2 One workflow, two modes.** Reasoning agents (planning objectives, bottleneck hypotheses, RCA narratives, capacity forecasts, executive summaries, optimisation advice) declare an AI capability class and a prompt contract; each has a deterministic `nonAiBehaviour` (rule engine, statistical/threshold analysis, correlation, historical baselines, performance signatures). Disabling AI withholds proposals via `gateProposals`; the same stages and agents run. A run with zero proposals delivered must complete and certify (INV-7) — the anchor conformance property.

**4.3 Variation only through adapters.** `PerformanceAdapter` SPI has three faces, all Execution-Plane-implemented, all resolved by configuration:
- **Load generators:** JMeter, k6, Gatling, Locust, Playwright-performance, browser, API, hybrid, cloud-load, container-load — differ in the *script dialect they emit* and the *runner invoked*, never in the scenario matrix or stage order.
- **Monitoring collectors:** APM/infra/DB/queue/cloud metric sources — differ in metric *names*, never in the percentile/aggregation contract.
- **Test-management sync:** Jira, Azure DevOps, Zephyr Essential/Scale, Xray — differ in *nouns* (Test Plan/Cycle, Bug/Issue), never in the publish sequence. The FTE lifecycle is inherited, not restated.

**4.4 Sovereignty in the type system.** `RawSample`/`ObservedNode` (EP custody: host names, IPs, raw values, snippets) are distinct types from `MetricSummary`/`SurfaceFact` (IP: names, statistics, references). A single family of `minimise*()` functions is the only crossing point. Percentile distributions, heap/thread dumps and HAR cross **by reference** (`sha256` + `locator`), never by content — the same rule pentest certified.

**4.5 Governance.** Twelve stages, four phases each (execute/review/decide/certify), three governance agents per stage (36) with performance-specific per-stage defect rules (e.g. an SLA with no threshold, a workload with zero concurrency, injectionless load against production, a certified verdict with no reason, a report claiming READY on `NOT MEASURED` metrics).

**4.6 Certification.** Deterministic scores — Performance, Scalability, Reliability, Availability, Stability, Capacity, Risk, Business/Production Readiness — aggregated to **PASS / CONDITIONAL PASS / FAIL**, each carrying its reason; `NOT MEASURED` never scored as a pass (R-13.3).

**4.7 Verification.** A conformance scenario runner (`run-performance-conformance.mjs`) exercises the engine end-to-end through ≥2 adapters, emitting observed properties; a gate (`verify-performance-conformance.js`) regenerates and asserts them (R-14.2) with a recorded, replayed fault proof; registered in `run-all.js`.

## 5. Consequences

**Positive.** Capability 4 becomes buildable, certifiable and entitleable via one registry entry (R-11.10). The AI/non-AI requirement is satisfied structurally, not by branching. Adding a load tool or a TM provider is an adapter, never a core change. The six-capability, one-lifecycle invariants are preserved and re-proven.

**Negative / accepted.** The engine defines the Execution-Plane performing-stage contracts (adapter SPIs) but the EP itself remains skeleton (`IMPLEMENTATION_STATUS.md` §4); real load generation and metric capture are proven in-process against recorded observations until an EP runtime and real tools exist (K-13/K-14 in `KNOWN_LIMITATIONS.md`). This is disclosed, not hidden: the conformance run drives synthetic observations, and the gate census reports it.

**Neutral.** ~130 domain agents + 36 governance agents across 15 domains; deterministic agents are a strict majority (INV-7).

## 6. Migration strategy

Purely additive; nothing to migrate. (a) Add the package; (b) build it in isolation (does not depend on the other engines); (c) add the scenario runner + gate + fault proof; (d) register the gate in `run-all.js`; (e) update programme state and ship the capability doc + completion report. No consumer of any existing contract is affected — no frozen contract, ADR, architecture document or Platform Service changes. Rollback is deletion of the package, the gate, the runner and this ADR; no other artefact references them.

## 7. Version impact

`@dbiz/performance-engine@1.0.0` — new package, no existing version affected. No contract version change (`@dbiz/contracts` untouched). No architecture version change (Document 11 already declares the capability). Certification-framework (ADR-0025) gains one more certifiable capability, moving platform certification from 4/6 toward 5/6 as an emergent recomputation, never a hand-edit.

## 8. Affected components

| Component | Change |
|---|---|
| `packages/performance-engine/**` | **New.** Model, agents, domain + master orchestrators, twelve-stage capability, load-generator / test-management / monitoring adapters, digital twin, simulation engine, report |
| `governance/capability/run-performance-conformance.mjs` | **New.** Conformance scenario |
| `governance/verification/verify-performance-conformance.js` | **New.** Gating check, registered in `run-all.js` |
| `governance/verification/run-all.js` | One line appended to register the Performance gate |
| `governance/verification/record-fault-proofs.js` | One fault proof appended for the new gate |
| `governance/closure/baseline.json` | Re-baselined to admit this ADR |
| `docs/capability/PERFORMANCE-ENGINE.md` | **New.** Agent, orchestrator, adapter and gate catalogues |

**Referenced, unchanged (prose, not modified):** the capability framework (`@dbiz/capability-framework`) and the platform contracts (`@dbiz/contracts`); architecture documents 11, 12, 13, 14, 15, 16 and 18, cited for conformance and none altered.
**Explicitly not changed:** the capability framework, the other five engines, the tenant/governance/security/audit models, and the count of architecture documents (25).
