# Performance Engine — Impact & Gap Analysis

**Capability:** 4 of 6 — **Performance Engine** (frozen: `docs/architecture/11-capability-model.md` §2, R-11.4)
**Author:** Session 8 — Performance Engine implementation
**Status of the capability before this work:** `NOT STARTED` (`IMPLEMENTATION_STATUS.md` §5)
**Governing ADR:** [ADR-0026](../docs/adr/ADR-0026-performance-engine-internal-structure.md)

This is Implementation Requirement #1 (complete repository analysis) and #2 (gap analysis) of the delivery brief, performed before any code is written (CHARTER §5 build order).

---

## 1. The naming reconciliation — done first, because it frames everything

The brief names the capability **PTIE — Performance Testing Intelligence Engine**. The frozen architecture names it the **Performance Engine**, capability 4 of the exactly-six (R-11.4). These are the same capability.

This is the precise failure class CHARTER §3 exists to prevent: *a prompt asks for something that already exists under a different name, and a duplicate is created to satisfy it.* The enterprise-safe resolution is mandatory and singular:

> **Implement capability 4 (`performance-engine`) in place, as internal structure over the one frozen orchestration lifecycle. Do not create a parallel "PTIE" service, a seventh capability, or a 26th architecture document.**

Two frozen gates enforce this and would fail the build if violated:
- `run-capability-conformance.mjs` P-10 asserts exactly six capabilities are declared in Document 11.
- `run-*-conformance.mjs` P-10.a asserts `docs/architecture/` holds exactly 25 documents and none numbered ≥ 26.

"PTIE" is retained only as the customer-facing product name for this capability; the registry id, package, and certification all read `performance-engine`.

## 2. The mission is already answered by the frozen architecture in two decisive places

**2.1 AI-enabled and AI-disabled with no architectural difference.** The brief's headline requirement. Document 11 R-11.7 already fixes this: the Performance Engine's **Execution stage requires no reasoning — "load generation is entirely deterministic."** Reasoning is *enrichment* confined to Planning, Reflection, Certification and Reporting. The framework implements the two modes as one workflow already (`reasoning.ts` / `gateProposals`): disabling AI **withholds proposals**; every agent runs its deterministic decision path with `proposal === null`. There is no second workflow to build and none is permitted (R-12.18).

Document 11 §2 records the exact predecessor defect this capability must not repeat:

> *"its Performance and Security engines needed no inference at all, and both still aborted when the reasoning plane was unreachable, because a single early return conflated unavailability with refusal."*

The conformance suite's INV-7 property (a full run with **zero** proposals delivered, completing and certifying) is therefore the single most important test this engine ships.

**2.2 The Functional-Testing lifecycle for test management and defect sync.** The brief requires "the EXACT SAME workflow as the Functional Testing Engine." That workflow *is* the twelve-stage lifecycle plus adapter-mediated publication (`capability-framework/adapters.ts`: `ProjectAdapter`, `TestManagementAdapter`, `ExecutionAdapter`, `WorkItemAdapter`). Requirement → Test Plan → Suite → Case → Review → Approval → Execution → Evidence → Bug → Retest → Closure → Harvest → Sync-back is the canonical `PLANNING_SEQUENCE` and the certification gate order — inherited, not restated.

## 3. Gap analysis — reuse before create (Implementation Requirement #3–#5)

| Brief capability area | Already exists — reused as-is | Gap — built as capability-internal structure |
|---|---|---|
| One orchestration lifecycle (12 stages) | `@dbiz/capability-framework` `runCapability`, sealed `StageResult`, `CapabilityRegistry` | — (consumed unchanged) |
| Four-phase gated stages (execute/review/decide/certify) | `pipeline.ts` `runPhase`, `certification.ts` | Per-stage performance defect rules (`agents/governance.ts`) |
| AI-enabled / AI-disabled, one workflow | `reasoning.ts` `gateProposals`, `invocationRecorder` | Performance reasoning agents with deterministic degrade paths |
| Agent contract, catalogue, retry, plane validation | `agent.ts` `AgentCatalogue`, `defineAgent` | ~130 performance agents across 15 domains |
| Vendor neutrality (Rule 12 / INV-9) | Enforced by `verify-ai-vendor-neutrality.js` | Config keys named by capability, never by product |
| Adapter SPI as the only locus of variation | `AdapterRegistry` pattern | `PerformanceAdapter` SPI: load generators, monitors, TM sync |
| Test-management / defect sync (Jira, ADO, Zephyr, Xray) | `TestManagementAdapter` / `ExecutionAdapter` shape | Perf-specific publication (workload, thresholds, bug bodies) |
| Data-sovereignty boundary in the type system | `06-data-sovereignty.md`, minimise() pattern | `RawSample` (EP) vs `MetricSeries`/`MetricSummary` (IP) split |
| Vector memory / historical baselines | `vector.ts` `VectorMemory`, `VectorIndex` | Performance signatures, baseline & regression records |
| Real PDF rendering, NOT-MEASURED discipline | `report.ts` renderer pattern (per engine) | Executive/engineering/capacity performance reports |
| Certification scoring, three-verdict output | `certification.ts`, `ADR-0025` framework | Perf/Scalability/Reliability/… scores → PASS/CONDITIONAL/FAIL |
| Governance gate + fault proof + scenario runner | `run-all.js`, `record-fault-proofs.js`, `*-conformance.mjs` | `verify-performance-conformance.js` + `run-performance-conformance.mjs` |

**Nothing in the left column is modified.** Every gap in the right column is *internal structure of capability 4* (ADR-0022 §6.5 precedent: a capability's sub-engines are internal structure, not new architecture).

## 4. Discovery / workload / design / script / execution / metrics / bottleneck / RCA / prediction — mapped onto the twelve frozen stages

The brief lists ~15 "engines" (Discovery, Workload Modelling, Test Design, Script Generator, Execution, Metrics, Bottleneck, Root Cause, Predictive, Bug, Reporting, Learning, Certification). R-12.18 permits exactly one lifecycle, so these are internal domains of the twelve stages, not lifecycles of their own:

| # | Stage | Plane | Performance-Engine meaning |
|---|---|---|---|
| 1 | planning | IP | Performance requirement intake; SLA/SLO/SLI; workload objectives; scope |
| 2 | discovery | EP | Topology discovery: pages, APIs (REST/SOAP/GraphQL/gRPC/WS/SSE), dependencies, queues, DBs, CDNs |
| 3 | context | EP→IP | **Minimisation crossing** — raw topology → `SurfaceFact`s; no host secrets cross |
| 4 | architecture-review | IP | Workload model: business transactions, journeys, concurrency, arrival rate, think time, seasonality *(governance triad)* |
| 5 | policy-review | IP | Test design authorisation: plan, suites, cases, thresholds, KPIs, acceptance criteria *(triad)* |
| 6 | guardrail-review | IP | Execution guardrails: **no load against production without authorisation**, blast-radius & rate ceilings *(triad)* |
| 7 | execution-planning | IP | Script generation (JMeter/k6/Gatling/Locust/Playwright), scenario matrix, distributed plan |
| 8 | execution | EP | Load generation — **deterministic, reasoning-free** (R-11.7) |
| 9 | evidence | EP | Metric capture by reference: percentiles, TPS, infra, DB, queues; HAR/heap/thread-dump refs |
| 10 | reflection | IP | Bottleneck detection, root-cause chains, regression, capacity forecast, prediction, learning, defects |
| 11 | certification | IP | Performance/Scalability/Reliability/Availability/Stability/Capacity/Risk scores → verdict |
| 12 | reporting | IP | Executive/engineering/capacity reports; Jira/ADO/Zephyr/Xray sync-back |

**The governance-triad finding, stated not hidden:** the brief's linear list names no Architecture/Policy/Guardrail Review. Those three stages are mandatory (R-12.2). They are implemented as the **workload model**, the **test-design authorisation**, and the **execution guardrails**. An engine following the linear list literally would ship a capability the registry refuses — the same finding ADR-0024 §3 recorded for pentest. **No load is generated before the guardrail stage certifies.**

## 5. Data sovereignty (CHARTER §8 — required before implementation)

| Concern | Definition |
|---|---|
| Data owner | Customer (target system, its metrics, its evidence) |
| Classification | Topology & raw samples: customer-confidential (EP custody). Aggregates/percentiles: derived, IP-permissible |
| The crossing | `RawSample`/`ObservedNode` (EP, carry host names, IPs, raw values, snippets) → `MetricSummary`/`SurfaceFact` (IP, carry names, statistics, references). Single `minimise*()` crossing point, mirrored on the pentest model |
| Encryption / retention / deletion | Inherited: ADR-0006 retention, ADR-0008 encryption-at-rest, E-5 non-retention of artefacts in IP |
| Evidence integrity | Percentile distributions, heap/thread dumps, HAR cross **by reference** (sha256 + locator), never by content |
| Cross-plane rules | EP initiates; IP never dials the tenant; load generators run only in EP (agent `plane: 'EP'` on discovery/execution/evidence stages, gate-checked) |
| Audit / least privilege | Inherited framework audit on every stage and agent invocation |

## 6. What changes, and what explicitly does not

**Added (all additive, capability-internal):**
- `packages/performance-engine/` — the capability package
- `docs/adr/ADR-0026-performance-engine-internal-structure.md`
- `docs/capability/PERFORMANCE-ENGINE.md`
- `governance/capability/run-performance-conformance.mjs` + `governance/verification/verify-performance-conformance.js` (+ its fault proof)
- Programme state updates (this file, `IMPLEMENTATION_STATUS.md`, `PROJECT_STATE.md`, `NEXT_ACTION.md`, `SESSION_LOG.md`, completion report)

**Explicitly NOT changed** (Implementation Requirement #6–#9, backward compatibility):
- No architecture document added or edited (25 stays 25).
- No change to `@dbiz/capability-framework`, `@dbiz/contracts`, `@dbiz/platform-core`, `@dbiz/platform-runtime`, `@dbiz/observability`.
- No change to the tenant model, governance model, auth, security, audit, or the other five engines.
- No change to the Execution Plane sovereignty rules; the EP remains skeleton — this delivers the **Intelligence-Plane definition and the performing-stage contracts (adapter SPIs)** the EP will later implement (R-11.9).
- The six-capability count and one-lifecycle invariant are preserved and re-proven by the new gate.

## 7. The twelve commercial questions (CHARTER §17.2) — all answered YES

Scales to hundreds of tenants (stateless capability, per-tenant runtime) · evolves without breaking compatibility (additive, versioned SPI) · secure by default (sovereignty in types, guardrail-before-load) · observable (framework audit + telemetry) · governable (twelve gated stages) · maintainable (one lifecycle) · extensible (tools via adapters) · operationally supportable (deterministic, replayable) · commercially sustainable (no per-tool code) · reduces customer effort (autonomous discovery→design→script→certify) · reduces operational risk (no unauthorised production load) · improves long-term value (learning baselines).
