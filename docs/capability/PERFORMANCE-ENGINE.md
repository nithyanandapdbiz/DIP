# Performance Engine (PTIE)

**Capability 4 of 6** · registry id `performance-engine` · package `@dbiz/performance-engine@1.0.0`
**Design authority:** [ADR-0026](../adr/ADR-0026-performance-engine-internal-structure.md) · **Architecture:** [`11-capability-model.md`](../architecture/11-capability-model.md) §2

> The delivery brief names this the **Performance Testing Intelligence Engine (PTIE)**. PTIE is the customer-facing product name for capability 4. The registry id, package and certification all read `performance-engine`. It is **not** a seventh capability and it adds **no** architecture document — the platform still declares exactly six capabilities and 25 architecture documents (proven by conformance properties PP-10 and PP-10.a).

---

## 1. What it answers

*Does the system meet its performance obligations under load?* The engine autonomously discovers the performance topology, models the workload, designs and generates performance tests, generates load, captures thousands of metrics, detects bottlenecks, produces complete root-cause chains, forecasts capacity, predicts future failures, raises enterprise-grade defects, synchronises to the test-management system, reports, and certifies — **identically whether AI is enabled or disabled.**

## 2. One lifecycle, twelve stages

The Performance Engine is internal structure over the platform's single orchestration lifecycle (R-12.18). It runs the same twelve stages every capability runs; the brief's ~15 "engines" are domains within those stages, not lifecycles of their own.

| # | Stage | Plane | Performance work | Reasoning |
|---|---|---|---|---|
| 1 | planning | IP | Requirement intake, SLA/SLO/SLI, scope validation, workload objectives | optional |
| 2 | discovery | EP | Topology discovery — pages, REST/SOAP/GraphQL/gRPC/WS/SSE, deps, DBs, queues, caches, CDNs | no |
| 3 | context | EP→IP | **Minimisation crossing** — raw nodes → surface facts | no |
| 4 | architecture-review | IP | **Workload model** — transactions, journeys, concurrency, arrival rate, think time, pattern, seasonality *(triad)* | optional |
| 5 | policy-review | IP | **Test design** — plan, suites, cases, thresholds, KPIs, acceptance, traceability *(triad)* | no |
| 6 | guardrail-review | IP | **Execution guardrails** — no aggressive load on production; rate/VU ceilings *(triad)* | no |
| 7 | execution-planning | IP | Script generation (k6/JMeter/Gatling/Locust/Playwright), scenario matrix, distribution | no |
| 8 | execution | EP | Load generation — **deterministic, reasoning-free** (R-11.7) | no |
| 9 | evidence | EP | Metric capture by reference — percentiles, TPS, infra, DB, queue; dumps/HAR/flame-graph refs | no |
| 10 | reflection | IP | Bottleneck, root cause, capacity forecast, regression, prediction, optimisation, defect, learning | optional |
| 11 | certification | IP | Performance/Scalability/Reliability/Availability/Stability/Capacity/Risk scores → verdict | optional |
| 12 | reporting | IP | Executive/engineering/board reports; Jira/ADO/Zephyr/Xray sync-back | optional |

**No load is generated before the guardrail stage (6) certifies** — the performance analogue of "no packet before certification".

## 3. AI-enabled and AI-disabled — one workflow, no difference

The Execution stage requires no reasoning (R-11.7): load generation is entirely deterministic. Reasoning is *enrichment* in Planning, Reflection, Certification and Reporting. Disabling AI **withholds proposals** (`gateProposals`); the same twelve stages and the same agents run, each taking its deterministic path (`nonAiBehaviour`). A run with **zero** proposals delivered completes and certifies (INV-7 — the exact failure the predecessor's Performance engine had, where it aborted when reasoning was unreachable). Of 179 agents, **171 are deterministic** and only 8 declare an AI capability class.

| AI enabled | AI disabled (deterministic replacement) |
|---|---|
| Workload objectives, transaction grouping | Endpoint-derived grouping, ceiling-derived objectives |
| Bottleneck hypothesis ranking | Saturation-percentage ranking |
| Root-cause narrative | Deterministic causal ladder + estimated fix |
| Capacity prediction enrichment | Threshold/forecast/bottleneck-derived predictions |
| Executive summary phrasing | Verdict-derived summary |

## 4. Variation only through adapters

| SPI | Providers shipped | Differ in |
|---|---|---|
| `LoadGeneratorAdapter` | k6, JMeter, Gatling, Locust, Playwright | script dialect + runner — never the scenario matrix |
| `TestManagementAdapter` | Azure DevOps, Zephyr Scale, Jira/Xray | nouns (Test Plan/Cycle, Bug/Issue) — never the publish sequence |

Resolved by configuration (`perf.tool`, `perf.provider`); orchestration never learns which it received (proven by PP-5 / PP-5.n). The test-management lifecycle is the Functional Testing Engine's, inherited not restated.

## 5. Data sovereignty

The boundary is in the type system. `ObservedNode`/`RawSample` (Execution-Plane custody — host names, IPs, connection strings, per-host readings) are distinct types from `SurfaceFact`/`MetricSummary` (Intelligence-Plane — names, statistics, references). A single `minimise*()`/`summarise()` family is the only crossing point. Percentile distributions, heap/thread dumps, flame graphs and HAR cross **by reference** (`sha256` + `locator`) — `EvidenceReference` has no content field, so none can cross (PP-7.s).

## 6. Certification

Deterministic scores — Performance, Scalability, Reliability, Availability, Stability, Capacity, Risk, Business-Readiness, Production-Readiness (0–100 each) — aggregated to **PASS / CONDITIONAL PASS / FAIL**, each carrying its reason. An unmeasured dimension reports `NOT MEASURED` and is excluded from the average, never scored as a pass (R-13.3).

## 7. Evidence

| Artefact | Location |
|---|---|
| Package | `packages/performance-engine/` (179 agents, 19 domains, 1 master + 19 domain orchestrators) |
| Conformance tests | `packages/performance-engine/test/conformance.test.ts` — **33 tests, all pass** |
| Conformance scenario | `governance/capability/run-performance-conformance.mjs` — **15/15 properties hold** |
| Conformance gate | `governance/verification/verify-performance-conformance.js` — **PASS** (standalone; see completion report §on registration) |
| Fault proof | `record-fault-proofs.js` fault `architecture-document-added-for-the-performance-engine` — demonstrated: clean 0, faulted 1 naming the cause |

## 8. Configuration surface

`perf.tool` · `perf.provider` · `perf.aiEnabled` · `perf.targetId` · `perf.allowedHosts` · `perf.exclusions` · `perf.authorizationReference` · `perf.testTypeCeiling` · `perf.testTypes` · `perf.safeMode` · `perf.maxVirtualUsers` · `perf.maxRequestsPerSecond` · `perf.environment` · `perf.regions` · `perf.durationSeconds` · `perf.serviceLevels` (JSON). Nothing hardcoded; every tool and provider is an adapter.
