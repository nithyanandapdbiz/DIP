# Performance Engine — Phase 2 Gap Analysis

**Capability:** 4 of 6 — Performance Engine (PTIE) · **Session:** 9 · **Date:** 2026-07-23
**Baseline:** the Phase‑1 engine (`PERFORMANCE_ENGINE_COMPLETION_REPORT.md`) — `@dbiz/performance-engine@1.0.0`, 179 agents, 19 domains, 33 tests, 15/15 conformance properties.
**Governing rule:** CHARTER §4 (no duplication) · §5 (build order) · ADR‑0026 (internal structure of capability 4). **Reuse first, extend second, create last.**

This is Phase 2's mandated FIRST TASK, performed before any code. Every enhancement is classified **Already Exists · Partially Exists · Missing · Not Applicable**, with the exact Phase‑1 artefact to reuse. **No enhancement introduces a service, a lifecycle, a framework, or an architecture document.** Every one lands as internal structure of capability 4 (more agents/domains within the twelve stages) or as an *optional* adapter — the only two sanctioned extension points.

---

## Summary verdict

| Area | Classification | Reuses |
|---|---|---|
| 1 Digital Twin | **Partially Exists** | workload model, `forecastCapacity`, baselines, VectorMemory |
| 2 Business Impact | **Partially Exists** | `PerformanceDefect.businessImpact`, `Criticality`, `RootCauseChain.businessImpact` |
| 3 Cloud Cost | **Partially Exists** | `capacity.cost-projection` agent |
| 4 Knowledge Graph | **Partially Exists** | `VectorMemory`/`VectorIndex` (framework), `LearningRecord` (8 kinds) |
| 5 Pattern Library | **Partially Exists** | 16 bottleneck detectors + `CAUSAL_LADDER` + `FIX_BY_KIND` |
| 6 Distributed Trace | **Missing** | topology (`SurfaceFact`), service dependencies |
| 7 Enterprise APM Integration | **DELIVERED (Increment A)** — was Missing/declared | adapter pattern; ADR‑0026 §4.3 promised the `MonitoringAdapter` face |
| 8 Advanced Regression | **Partially Exists** | `capacity.regression`, `detectRegressions`, `Regression` |
| 9 Baseline Intelligence | **Partially Exists** | `learning.baseline`, `deps.baselines` |
| 10 Continuous Certification | **Already Exists** | 9‑dimension `assembleCertification` → PASS/CONDITIONAL/FAIL |
| 11 Executive Intelligence | **Partially Exists** | `executivePages`, `boardReport`, `PerformanceReport` |
| 12 Engineering Dashboard | **Partially Exists** | `MetricSummary` percentile ladder, `topBottlenecks` |
| 13 Predictive Intelligence | **Partially Exists** | `capacity.prediction` (7 kinds), `CapacityForecast` |
| 14 Autonomous Advisor | **Already Exists** | `optimisation` domain (7 agents) + `optimisation.advisor` |
| 15 Executive Reporting | **Partially Exists** | `report.ts` (real PDF, board report) |
| 16 Governance | **Not Applicable** (constraint, not a feature) | the 36 governance agents + the gate apply unchanged |

**Nothing is Missing that requires a new architecture.** Two areas are net‑new build (6, 7) and both are *adapters/optional* by nature. The rest are extensions of existing domains and model types.

---

## Area‑by‑area

### 1. Digital Twin — Partially Exists → extend
**Exists:** the workload model *is* a virtual performance model (transactions, concurrency, arrival rate, pattern); `forecastCapacity` already projects latency vs concurrency deterministically with a confidence field; baselines and `VectorMemory` hold historical behaviour.
**Missing:** an explicit **simulate‑without‑executing** mode that, given topology + workload + baselines, emits predicted `TransactionResult`‑shaped output with confidence, *before* any load run.
**Plan (extend):** a config flag `perf.mode=simulate` and a `twin` domain in the *planning/reflection* stages that produces a `DigitalTwinProjection` from existing inputs. No new stage; the Execution stage becomes `notApplicable` with a stated reason under simulate mode (the framework already supports typed NOT‑APPLICABLE). Deterministic by default; reasoning refines confidence when enabled.

### 2. Business Impact Intelligence — Partially Exists → extend
**Exists:** defects and root causes carry a `businessImpact` string; transactions carry `Criticality`.
**Missing:** structured, quantified fields — business severity/priority, SLA impact, estimated revenue impact, customer‑impact %, operational risk.
**Plan (extend):** a `BusinessImpact` model type and a `business` sub‑domain in **reflection** that maps each defect/bottleneck to revenue/customer/operational outcomes using per‑transaction `revenueWeight`/`usersPerHour` config (deterministic) and reasoning narratives when enabled. Feeds the executive report.

### 3. Cloud Cost Intelligence — Partially Exists → extend
**Exists:** `capacity.cost-projection` (nodes‑to‑add).
**Missing:** a structured cost model (compute/db/cache/queue/container/bandwidth), recommended infrastructure, projected savings, ROI.
**Plan (extend):** a `CostModel` type + a `cost` sub‑domain in **reflection**, driven by a configurable unit‑price table (provider‑agnostic, tenant‑configured — no cloud vendor hardcoded). Recommendations flow into the advisor with `kind: 'cost'`.

### 4. Performance Knowledge Graph — Partially Exists → extend (reuse framework)
**Exists:** `@dbiz/capability-framework` already ships `VectorMemory`/`VectorIndex`; the engine writes 8 `LearningRecord` kinds; the pentest/discovery engines already use `VectorMemory` for cross‑run memory.
**Missing:** a **query‑before‑recommend** step — future runs consulting remembered signatures/fixes before producing recommendations.
**Plan (extend):** a `knowledge` sub‑domain in **reflection** that queries `runtime.memory` (already threaded in) for matching fingerprints and injects prior fixes/dispositions into the advisor and root‑cause narrative. No new store — reuses the framework primitive the other engines use.

### 5. Performance Pattern Library — Partially Exists → extend
**Exists:** 16 deterministic detectors with saturation rules; `CAUSAL_LADDER` (memory leak, thread starvation, connection‑pool exhaustion, GC, N+1/missing index via database, etc.); `FIX_BY_KIND`.
**Missing:** a *formal* pattern abstraction (detection rule + confidence + root cause + recommendation + evidence + business impact in one declarative record) and several patterns not yet distinct: cache stampede, deadlock, DNS/TLS delay, retry storm, circuit‑breaker failure, container cold start, database hotspot, queue backlog, load‑balancer saturation.
**Plan (extend):** promote the detector specs into a declarative `PerformancePattern[]` catalogue (one module), add the missing patterns as data (not new code paths), and have the `bottleneck` domain iterate the catalogue. Purely additive; strengthens PP‑12 (never a lone symptom).

### 6. Distributed Trace Intelligence — Missing → create (optional adapter + reflection domain)
**Exists:** topology and service dependencies (`SurfaceFact`, dependency inventory).
**Missing:** span/trace correlation, latency decomposition, call graphs.
**Plan (create, optional):** a `TraceAdapter` SPI (OpenTelemetry‑shaped, provider‑agnostic) resolved by config and **optional** — absent adapter degrades gracefully to structural latency decomposition. A `trace` sub‑domain in **reflection** correlates trace spans (EP‑captured, referenced) with metric summaries. No hard dependency; EP custody preserved (spans referenced, not carried).

### 7. Enterprise APM Integration — Missing (declared, unbuilt) → create the promised third adapter face
**Exists:** ADR‑0026 §4.3 explicitly declared a **monitoring‑collector** adapter face; Phase 1 shipped only `LoadGeneratorAdapter` + `TestManagementAdapter`.
**Missing:** the `MonitoringAdapter` SPI and providers (Dynatrace, AppDynamics, Datadog, New Relic, Azure Monitor, CloudWatch, Google Cloud Operations, Prometheus, Grafana, Elastic APM, OpenTelemetry).
**Plan (create, optional):** a `MonitoringAdapter` SPI resolved by `perf.monitor` — **optional**, so a run with no monitoring provider still completes on load‑generated samples. Providers are thin, provider‑agnostic collectors returning `RawSample[]` from the EP. This is the cleanest, most architecture‑pure enhancement and the correct first increment: it closes the ADR‑declared gap and feeds areas 1, 6, 8, 13.

### 8. Advanced Regression Intelligence — Partially Exists → extend
**Exists:** `detectRegressions` vs a single baseline; `Regression` with delta/direction/significance.
**Missing:** multiple baseline tiers (golden/silver/production/historical), improved/regressed/risk classification with confidence, release‑comparison output.
**Plan (extend):** widen `deps.baselines` to a `BaselineSet` (tiered), add a `regression` comparison across tiers, emit a `ReleaseComparison` for the report. Reuses `detectRegressions`.

### 9. Baseline Intelligence — Partially Exists → extend
**Exists:** `learning.baseline` records p95; `deps.baselines` consumed.
**Missing:** named baseline tiers (golden/production/environment/application/service/api/journey/historical), statistical significance, deviation.
**Plan (extend):** a `Baseline` type with tier + statistics; `learning` domain records per tier; significance computed deterministically (z‑score against stored variance). Shares the Area‑8 `BaselineSet`.

### 10. Continuous Performance Certification — Already Exists → minor extension
**Exists:** 9‑dimension deterministic scoring → PASS/CONDITIONAL PASS/FAIL with reason, NOT‑MEASURED discipline, release‑gate‑ready verdict.
**Missing:** an `infrastructure-readiness` dimension; explicit release‑gate output object.
**Plan (extend):** add one certification dimension and a `ReleaseGate` projection of the existing verdict. Small, additive.

### 11. Executive Performance Intelligence — Partially Exists → extend
**Exists:** `executivePages`, `boardReport`, `PerformanceReport` (verdict, scores, top bottlenecks, headroom, defects).
**Missing:** a structured **Executive Performance Index**, risk heatmap, top‑risks/top‑recommendations as data.
**Plan (extend):** an `ExecutiveDashboard` model assembled in **reporting** from existing state. Reuses report inputs; no new stage.

### 12. Advanced Engineering Dashboard — Partially Exists → extend
**Exists:** full percentile ladder in `MetricSummary`, bottleneck list, per‑category summaries.
**Missing:** structured dashboard data for flame graph/waterfall/scatter/histogram/correlation.
**Plan (extend):** an `EngineeringDashboard` data model (the *data* for visualisations; rendering is a downstream artefact/consumer concern, Not Applicable to the IP engine). Reuses summaries and evidence references.

### 13. Predictive Performance Intelligence — Partially Exists → extend
**Exists:** `capacity.prediction` with 7 kinds; `CapacityForecast` with confidence.
**Missing:** seasonality/event predictions (holiday, Black Friday, end‑of‑month/quarter), each with confidence + evidence + reasoning.
**Plan (extend):** add `PredictionKind` values and a `seasonality` predictor driven by configurable event calendar (deterministic); reasoning enriches when enabled. Reuses the prediction agent shape.

### 14. Autonomous Performance Advisor — Already Exists → extend categories
**Exists:** `optimisation` domain (quick/long‑term/config/code/infra/scaling) + `optimisation.advisor` ranking, each recommendation carrying priority/effort/gain/provenance/confidence.
**Missing:** distinct subjects — caching, compression, payload, network, security, cost, architecture, thread/connection pool, index.
**Plan (extend):** widen `RecommendationKind`/subjects and feed knowledge‑graph priors + cost recommendations into the existing advisor. No new domain.

### 15. Executive Reporting — Partially Exists → extend
**Exists:** real PDF renderer, executive + board reports, NOT‑MEASURED discipline.
**Missing:** Operations/Capacity/Infrastructure/Cloud‑Cost/Regression/Health/Certification report variants and richer viz payloads.
**Plan (extend):** additional page assemblers in `report.ts` (data + PDF), each fed from existing state. Reuses `renderPdf`.

### 16. Governance — Not Applicable as a feature; **binding constraint**
Every enhancement above reuses the 36 governance agents (three per stage) and the conformance gate unchanged. New reflection sub‑domains add their own per‑stage defect rules only where they introduce a new failure mode. AI‑enabled/disabled parity, determinism, tenant‑awareness, provider‑agnosticism and sovereignty are preserved by construction — new adapters are optional and provider‑neutral; new agents declare `nonAiBehaviour`.

---

## Phased plan (reuse → extend → create), architecture‑preserving

**Increment A — `MonitoringAdapter` SPI + APM providers (Area 7). ✅ DELIVERED (session 9).** The ADR‑declared, unbuilt third adapter face, now built: `MonitoringAdapter` SPI with **11 optional providers** (Dynatrace, AppDynamics, Datadog, New Relic, Azure Monitor, CloudWatch, Google Cloud Operations, Prometheus, Grafana, Elastic APM, OpenTelemetry), resolved by `perf.monitor` and **optional** (unset → `null`, engine runs on load‑generated samples; unknown → refused by name). A configured provider's samples are fused into the same summarise/bottleneck/certification path via the EP agent `load.monitor-collect`. Verified: **37 conformance tests pass**, conformance property **PP‑13** added (optional + invoked‑only‑when‑configured), gate green. No lifecycle, contract, ADR, architecture‑document or capability‑count change. Unblocks 1/6/8/13.

**Increment B — Formal Pattern Library (Area 5) + Business Impact (2) + Cloud Cost (3) + Knowledge‑graph query (4).** Extend the `bottleneck`/`optimisation`/reflection domains and model types; reuse `VectorMemory`. *Extend.*

**Increment C — Digital Twin simulate mode (1) + Predictive seasonality (13) + Multi‑tier Baselines/Regression (8, 9).** A config‑gated planning/reflection projection; Execution becomes typed NOT‑APPLICABLE under simulate. *Extend.*

**Increment D — Executive & Engineering dashboards + report variants (11, 12, 15) + infra‑readiness dimension + release gate (10) + optional Trace domain (6).** Assemble from existing state; add report assemblers. *Extend + optional adapter.*

Each increment: build green under strict TS, extend the conformance test and scenario (new anchor properties), keep the gate green, update state. No frozen contract, ADR‑beyond‑0026, architecture document, or capability count changes. **The capability stays one of six; the lifecycle stays one; variation stays in adapters and internal domains.**
