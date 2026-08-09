# Increment C — Reconciliation & Dependency Map

**Capability:** 4 — Performance Engine (PTIE) · **Session:** 11 · **Date:** 2026-07-23
**Scope:** the **Predictive Performance Layer** — Digital Twin, Simulation, Capacity Forecasting, Seasonal Intelligence, Release Impact, Multi‑tier Baselines, What‑If, Predictive Certification — as one integrated layer that answers questions *before* execution.
**Governing rule:** reuse → extend → create. No new capability, engine, lifecycle, contract, EP/IP, governance or certification change.

Mandated FIRST TASK: reconcile against the Increment‑B reconciliation and the Phase‑2 gap‑analysis Digital‑Twin findings before any code. Classified **Already Exists · Can Be Extended · Requires Internal Model · Requires Optional Adapter**.
**Status: ✅ DELIVERED (session 11).** Built as reconciled: 2 new reflection sub‑domains (`twin`, `simulation`), `twin.ts` (buildTwin + 21 scenario kinds + `simulateScenario` reusing `matchPatterns`/`forecastCapacity`/`assembleCertification`), simulate‑mode Execution via `emit.notApplicable`, prediction‑vs‑reality accuracy. **DOMAINS 22→24, 233 agents, 53 conformance tests, 23/23 conformance properties (PP‑1…PP‑21), gate green, fault proof genuine.** No new capability/lifecycle/contract/architecture‑document; capability count still six; no optional adapter needed.

---

## The load-bearing insight (why this is small, not large)

A simulation is a **deterministic transform of baseline metrics fed through the pipeline that already exists.** The Increment‑A/B engine already turns `MetricSummary[]` into bottlenecks (16 detectors), patterns (`matchPatterns`), capacity (`forecastCapacity`), and a verdict (`assembleCertification`/`scoreDimension`). The Digital Twin/Simulation reuses all of it:

```
historical baselines + topology + workload ──▶ buildTwin() ──▶ baseline MetricSummary[]
                                                                     │  applyScenario(transform)
                                                                     ▼
                              predicted MetricSummary[] ──▶ matchPatterns() ──▶ predicted patterns/bottlenecks
                                                          ──▶ forecastCapacity() ──▶ predicted capacity
                                                          ──▶ scoreDimension()/assembleCertification() ──▶ predicted verdict
```

**No new analysis is built.** The twin builds the input; the existing pipeline produces the prediction. "The Digital Twin never executes load" is honoured structurally: in `perf.mode=simulate` the Execution stage returns a **typed NOT‑APPLICABLE** (`emit.notApplicable`, C‑12.12) with the reason "the Digital Twin predicts behaviour and never executes load" — the framework primitive that already exists for exactly this.

## Dependency map

| Layer domain | Classification | Reuses (exact component) | New |
|---|---|---|---|
| **D1** Digital Twin — model | Requires Internal Model | topology `SurfaceFact`, `WorkloadModel`, `deps.baselines`, `deps.knowledgeRecords` | `twin.ts` `buildTwin`, `DigitalTwin`, `ResourceModel` |
| D1 predicted baseline metrics | Can Be Extended | `MetricSummary`, `summarise` | synthesised baseline summaries |
| **D2** Simulation engine | Requires Internal Model | `matchPatterns`, `forecastCapacity`, `assembleCertification`, `scoreDimension` | `applyScenario`, `SCENARIO_LIBRARY`, `SimulationResult` |
| D2 predicted bottlenecks/patterns/SLA/cost/cert | Already Exists | the whole reflection pipeline | — |
| **D3** Capacity forecasting | Can Be Extended | `capacity` domain (`forecast`,`headroom`,`prediction`,`cost-projection`), `CapacityForecast` | `ResourceForecast`, capacity timeline |
| **D4** Seasonal intelligence | Requires Internal Model | `deps.baselines`, moving‑average over history | `SeasonalForecast`, seasonal multipliers |
| **D5** Release impact | Can Be Extended | simulation transform + `Regression` + certification | a `release-deploy` scenario kind + `ReleaseImpact` |
| **D6** Multi‑tier baselines | Can Be Extended | `learning.baseline`, `deps.baselines`, `Regression` | `Baseline` (+`BaselineTier`), tier compare |
| **D7** What‑If analysis | Can Be Extended | simulation transform | a `what-if` scenario kind + configurable params |
| **D8** Predictive certification + accuracy | Can Be Extended | `assembleCertification`, the real certification stage | `PredictiveCertification`, `PredictionAccuracy` (predicted vs actual) |
| Simulate‑mode Execution | Already Exists | framework `emit.notApplicable` (C‑12.12) | one branch in the execution stage |
| Reporting | Can Be Extended | `PerformanceReport`, `report.ts` | +forecast/prediction/accuracy summary fields |
| Governance | Already Exists | 36 governance agents; `STAGE_RULES` | +1 reflection rule (a prediction with no confidence) |
| AI‑disabled parity | Already Exists | `gateProposals`, `nonAiBehaviour` | deterministic simulation by construction |

## Created vs reused

**Reused unchanged:** the 12 stages, `matchPatterns`, `forecastCapacity`, `assembleCertification`/`scoreDimension`, the bottleneck detectors, `VectorMemory`, `emit.notApplicable`, adapters, the PDF renderer, governance agents, the gate.

**Extended:** `capacity` (resource timeline), `learning` (baseline tiers), `PerformanceReport` (+forecast/prediction/accuracy fields), reflection `STAGE_RULES` (+1 rule), `EngineDependencies` (already carries baselines/knowledgeRecords — no new seam needed).

**Created (internal structure of capability 4, reflection stage):**
- `twin.ts` — `buildTwin`, `applyScenario`, `SCENARIO_LIBRARY` (≥20 scenario kinds incl. Black Friday, region/db/cache failure, what‑if, release‑deploy), `seasonalForecast`, `resourceForecast`.
- Two reflection sub‑domains — **`twin`**, **`simulation`** — and their agents; DOMAINS 22 → 24.
- Model types: `ResourceKind`, `ResourceModel`, `DigitalTwin`, `ScenarioKind`, `SimulationScenario`, `SimulationResult`, `ResourceForecast`, `SeasonalPeriod`, `SeasonalForecast`, `BaselineTier`, `Baseline`, `ReleaseImpact`, `PredictiveCertification`, `PredictionAccuracy`.

**No adapter required.** The Digital Twin is pure internal computation over data the engine already receives.

## The one chain (not eight modules)

Within **reflection**, after the Increment‑B intelligence chain:

```
twin (D1: model + baseline + resources + capacity timeline + seasonal + baseline tiers)
   └─▶ simulation (D2/D5/D7: scenarios incl. release-deploy & what-if → predicted patterns/SLA/capacity/cost/verdict/confidence)
          └─▶ predictive certification (D8: predicted verdict) ── compared in reporting against the actual verdict → accuracy
```

Predictions run in **both** modes: in `execute` mode alongside real results (forecasting the future from the present); in `simulate` mode as the sole output (Execution NOT‑APPLICABLE). Deterministic by default; reasoning only refines confidence and narrative (INV‑7).

## Validation plan

Extend the conformance test (twin built, ≥20 scenarios simulate deterministically, predicted verdict with confidence, simulate‑mode Execution NOT‑APPLICABLE, prediction‑vs‑actual accuracy, AI‑disabled determinism of predictions) and the scenario/gate with anchor properties **PP‑18…PP‑21**; update the census (24 domains). Keep the gate green. No frozen artefact changes.
