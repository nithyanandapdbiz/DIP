# Increment B — Reconciliation & Dependency Map

**Capability:** 4 — Performance Engine (PTIE) · **Session:** 10 · **Date:** 2026-07-23
**Scope:** the **Performance Intelligence Layer** — four integrated domains (Pattern, Business, Knowledge Graph, Optimization), orchestrated as one chain, feeding certification and reporting.
**Status: ✅ DELIVERED (session 10).** Built as reconciled below: 3 new reflection sub-domains (`pattern`, `business`, `knowledge`) + extended `optimisation`; `patterns.ts` (30-pattern catalogue + composites) reusing the bottleneck saturation logic; Knowledge Graph on the framework `VectorMemory` (query + write-back); `Recommendation`/`PerformanceReport` extended. **DOMAINS 19→22, 214 agents, 45 conformance tests, 19/19 conformance properties (PP-1…PP-17), gate green, fault proof genuine.** No new capability/lifecycle/contract/architecture-document; capability count still six.
**Governing rule:** reuse → extend → create. *Increase intelligence, reduce complexity.* No new capability, engine, lifecycle, contract, EP/IP, governance or certification change.

This is Increment B's mandated FIRST TASK: reconcile against the Phase‑2 gap analysis before any code. Each element is classified **Already Exists · Can Be Extended · Requires New Model · Requires Adapter**, with the exact Phase‑1/Increment‑A component reused.

---

## Dependency map

| Layer element | Classification | Reuses (exact component) | New |
|---|---|---|---|
| **D1** pattern detection | Can Be Extended | `BOTTLENECK_SPECS` (16 detectors), `primaryBottlenecks()`, `Bottleneck` | `patterns.ts` declarative catalogue |
| D1 root cause per pattern | Already Exists | `CAUSAL_LADDER`, `FIX_BY_KIND`, `buildRootCause` | — |
| D1 composite patterns | Requires New Model | `Bottleneck.correlation` idea | `CompositePattern`, composite rules |
| D1 confidence/severity/recurrence/suppression | Requires New Model | `severityForScore`, `fingerprint` | `PatternMatch` |
| **D2** business mapping | Requires New Model | `BusinessTransaction.criticality`/`journey`, `PerformanceDefect.businessImpact` | `BusinessImpact` |
| D2 revenue/customer/operational scoring | Can Be Extended | transaction criticality + configurable weights | scoring in `business` agents |
| **D3** knowledge substrate | Already Exists | framework `VectorMemory`/`VectorIndex` (threaded as `runtime.memory`, currently unused by this engine) | — |
| D3 historical records (EP‑searched) | Requires Adapter‑seam | pentest `PriorRecord` pattern → `deps.knowledgeRecords` | `KnowledgeRecord` |
| D3 similarity / lookup / reuse | Can Be Extended | `VectorIndex.add/query`, `LearningRecord` (8 kinds), `fingerprint` | `KnowledgeMatch` |
| **D4** recommendation engine | Already Exists | `optimisation` domain (6 agents) + `optimisation.advisor` + `recommendationsFor` | — |
| D4 subjects (cpu…regional) | Can Be Extended | `RecommendationKind`, `FIX_BY_KIND` | pattern‑driven rec agents |
| D4 cost/risk/confidence/value fields | Requires New Model (extend) | `Recommendation` | +7 fields on `Recommendation` |
| **Orchestration** chain | Can Be Extended | reflection stage already chains bottleneck→rootcause→capacity→optimisation→defect→learning | insert pattern→business→knowledge before optimisation |
| **Certification** input | Can Be Extended | `CertificationInputs`, `scoreDimension('risk')` | pass `patterns` (no new dimension) |
| **Reporting** | Can Be Extended | `PerformanceReport`, `executivePages`, `boardReport` | +summary fields, +report agents |
| **Governance** | Already Exists | 36 governance agents; `STAGE_RULES.reflection` | +2 reflection defect rules (additive) |
| **AI‑disabled parity** | Already Exists | `gateProposals`, `nonAiBehaviour` per agent | new agents deterministic‑first |

## What is created vs reused

**Reused unchanged:** the framework (`VectorMemory`, agent/stage/pipeline), the 12 stages, adapters, certification scoring, the PDF renderer, `CAUSAL_LADDER`/`FIX_BY_KIND`, the bottleneck detectors, governance agents, the conformance gate.

**Extended (existing types/agents):** `Recommendation` (+7 fields), `PerformanceReport` (+summary fields), `optimisation` domain (+ pattern‑driven agents), `CertificationInputs` (+ patterns), reflection `STAGE_RULES` (+2 rules), `EngineDependencies` (+ `knowledgeRecords`).

**Created (net‑new, all internal structure of capability 4 in the reflection stage):**
- `patterns.ts` — the declarative `PerformancePattern` catalogue (30 patterns) + composite rules + a pure `matchPatterns()` built on the *existing* saturation logic.
- Three reflection sub‑domains and their agents: **`pattern`**, **`business`**, **`knowledge`** — three domain orchestrators added to `DOMAINS` (19 → 22), each proven to run an agent.
- Model types: `PatternKind`, `PerformancePattern`, `PatternMatch`, `CompositePattern`, `BusinessImpact`, `KnowledgeRecord`, `KnowledgeMatch`.

**No adapter is required** (APM was Increment A). Knowledge history is an EP‑searched `deps` seam (the pentest `PriorRecord` precedent), not a new SPI.

## The one chain (not four modules)

Within the **reflection** stage, after bottleneck + root cause:

```
bottlenecks ─▶ patterns (D1) ─▶ business impact (D2) ─▶ knowledge lookup (D3) ─▶ optimization (D4)
                     │                                        │                        │
                     └────────────── feed ───────────────────┴──────────┬─────────────┘
                                                                          ▼
                                         defects · certification(risk) · reporting · learning(write‑back to memory)
```

Each stage consumes the previous domain's output; knowledge write‑back closes the loop so the next run's lookup finds this run's patterns and fixes. Deterministic by default; reasoning only sharpens confidence, ranking and narratives.

## Validation plan

Extend the conformance test (pattern detection, composite pattern, business impact scoring, knowledge match + write‑back, richer optimization, AI‑disabled determinism of all four) and the scenario/gate with anchor properties **PP‑14…PP‑17**; update the census (22 domains, new agent floor). Keep the gate green. No frozen artefact changes.
