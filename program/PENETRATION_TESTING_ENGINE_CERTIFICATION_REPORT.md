# Penetration Testing Engine — enterprise certification report

**Date:** 2026-07-23 · **Capability:** 6 of 6 · **Method:** executable evidence only
**Gates:** `verify-pentest-conformance.js` (13 properties) · `verify-pentest-completeness.js` (13 properties + 6 fault proofs)
**Companion:** [reconciliation report](PENETRATION_TESTING_ENGINE_RECONCILIATION_REPORT.md) · [ADR](../docs/adr/ADR-0027-penetration-testing-engine-internal-structure.md) · [impact analysis](PENETRATION_TESTING_ENGINE_IMPACT_ANALYSIS.md)

Every figure below was produced by executing the engine and reading what it emitted. **Nothing is asserted because code exists.** The evidence regenerates on every gate run (`pentest-evidence.json`, `pentest-completeness-evidence.json`) and is not copied between runs.

---

## 1. Measured implementation state (STEP 1)

Established from disk, not from any report:

| Component | Measured |
|---|---|
| Package | `@dbiz/penetration-testing-engine` v1.0.0 — builds clean, 37 conformance tests pass |
| Master orchestrator | 1 — `PenetrationTestingOrchestrator` |
| Domain orchestrators | 15 |
| Agents | **220** — 184 domain + 36 governance, across 15 domains |
| Scanners | **34** — 7 passive, 10 active-safe, 17 active-full |
| Plane split | 63 Execution Plane · 157 Intelligence Plane |
| Reasoning | 8 declare an AI Capability Class · **212 wholly deterministic** |
| Adapter operations | 7 (`SecurityAdapter`) |
| Threat Intelligence engine | 14 agents (`threat` domain) |

## 2. Canonical lifecycle (STEP 2)

The engine executes within the frozen twelve-stage lifecycle, and only that lifecycle:

```
planning → discovery → context → architecture-review → policy-review → guardrail-review
→ execution-planning → execution → evidence → reflection → certification → reporting
```

Measured: all six runs traverse all twelve stages in order and fail at none (C-1). The governance triad (architecture-review, policy-review, guardrail-review) is traversed on every run and certification is reached (C-2). **No secondary lifecycle exists** — the runner is the only thing that can mint a sealed stage result, and the master orchestrator has no stage list.

## 3. Runtime completeness = 100% (STEP 3)

Registered → Reachable → Executed, measured as the union across a six-run workflow set (happy, destructive-authorized, AI-enabled, passive-only, second-provider, suppression):

| Class | Registered | Executed | Completeness |
|---|---|---|---|
| Agents | 220 | 220 | **100%** |
| Scanners | 34 | 34 | **100%** |
| Domain orchestrators | 15 | 15 | **100%** |
| Adapter operations | 7 | 7 | **100%** |

**Runtime completeness = 100%** (C-13). No dormant production component. The measurement caught and drove the fix of one dormant path before certification: `SecurityAdapter.publishResult` was declared and implemented but never invoked — it is now wired into `sync.container` and executes (adapter completeness moved 6/7 → 7/7).

## 4. Orchestrator, scanner, agent and adapter participation (STEPS 4–5, 9)

- **Every domain orchestrator coordinated agents** — observed by instrumenting each `coordinate` (C-5, 15/15).
- **Every scanner executed** — a destructive-authorized run (safe mode off, non-production) authorizes all 34 categories; each scanner is invoked and produces observations, evidence and telemetry (C-4, 34/34).
- **Every agent executed** — reachability is the union across the workflow set (C-3, 220/220).
- **Every adapter operation was invoked** through orchestration; no provider name appears in orchestration source (C-6, 7/7; conformance P-5.n).

## 5. EP/IP ownership, structurally enforced (STEP 6)

Measured by executable test, not by inspection:

- The Execution Plane retains `ObservedTarget` (values) and `RawFinding` (request/response snippets); neither type is accepted anywhere in the Intelligence Plane — the compiler enforces it.
- The Intelligence Plane receives `Finding` and `EvidenceReference` only — a category, a location, a CWE, a hash and a locator. `EvidenceReference` has exactly `{findingCategory, kind, sha256, locator, capturedAtPhase}` and no content field; `Finding` carries no snippet.
- **No raw finding or session value crosses the boundary** (C-11): a session token planted in the observed cookie never appears in the crossed state. The crossing is two functions — `minimise`, `minimiseFinding`.
- All 63 scanning/recon/repository-search agents are Execution-Plane; all 157 reasoning/governance agents are Intelligence-Plane (C-8).

## 6. Security governance — no packet before certification (STEP 7)

The governance triad executes **before any scan activity** (C-10: guardrail at stage index 5, execution at 7). Fault proof **X-1**: a destructive scan injected against a production target is **refused at the guardrail stage** with a stated reason, and the execution stage never runs — no outbound traffic. Replayed on every gate run.

## 7. AI enabled vs AI disabled — identical execution graph (STEP 8)

Measured: the AI-enabled and AI-disabled runs invoke an **identical set of agents** and an **identical stage sequence** (C-9, 214 vs 214 agents, same 12 stages). Only reasoning proposals differ — the disabled run delivers zero proposals and still completes and certifies (INV-7). The framework reads the capability-neutral `ai.enabled` key; it never sees `pentest.aiEnabled` (conformance).

## 8. Provider validation (STEP 9)

Two providers (`azure-devops`, `security-hub`) produce an **identical stage sequence and identical agent set**; only the adapter nouns differ (`Bug` vs `Finding`). Provider names appear nowhere in orchestration logic (P-5.n). The `SecurityAdapter` SPI is the only locus of variation; GitHub/Jira/Zephyr are additional adapter implementations behind the same SPI, adding no workflow.

## 9. Governance, audit, telemetry — runtime-derived (STEP 10)

- Every stage runs execute → review → decision → certification via the four-phase pipeline; a refused phase throws and no sealed result is produced.
- **Audit is runtime-derived** (C-7): the invocation recorder observes `agent.<id>.invoked` events; the sealed audit trail names no agent that did not run, and the claimed set equals the observed set. Nothing is hand-written.
- **Learning is runtime-derived** (C-12): all 10 declared learning kinds are emitted by execution.

## 10. Fault proofs — replayable (STEP 11)

Each fault is injected, its refusal or detection observed, and the injection restored; the gate replays all six on every run:

| Proof | Injection | Result (measured) |
|---|---|---|
| X-1 | destructive scan on a production target | refused at guardrail-review, no execution |
| X-2 | security provider fails on publish | run fails at reporting, certification refused |
| X-3 | orchestrator drops a scanner (sql-injection) | scanner dormant — detected by the completeness census |
| X-4 | domain orchestrator coordinates nothing (threat) | 0/14 threat agents run — dormancy detected |
| X-5 | governance certification agent missing (execution) | run fails at execution, certification refused |
| X-6 | agent prompt contract sends EP custody | registration refused |

## 11. Cross-capability certification (STEP 13)

Measured: FTE (94 agents), Dev-Change (129), Discovery (186) and Penetration Testing (220) all depend on the **same `@dbiz/capability-framework`** and execute the **same twelve stages** with the **same governance triad**. Common runtime, common governance, common security boundary, common AI behaviour (proposal-gated on one `ai.enabled` key), common certification (sealed stage results, four-phase pipeline). **No architectural drift** — the platform declares six capabilities and 25 architecture documents, unchanged.

## 12. Success criteria — verdict

| Criterion | Evidence | Result |
|---|---|---|
| Runtime completeness 100% | C-13, census | ✅ |
| Every registered scanner executes | C-4, 34/34 | ✅ |
| Every registered agent executes | C-3, 220/220 | ✅ |
| Every registered orchestrator executes | C-5, 15/15 | ✅ |
| Every adapter executes | C-6, 7/7 | ✅ |
| Every certification gate executes | C-1/C-2, 12 stages | ✅ |
| Governance triad before any scan | C-10, X-1 | ✅ |
| AI/non-AI identical execution graph | C-9 | ✅ |
| EP/IP structurally enforced | C-8, C-11, types | ✅ |
| Raw findings never cross the boundary | C-11 | ✅ |
| Governance runtime-derived | four-phase pipeline | ✅ |
| Audit runtime-derived | C-7 | ✅ |
| Telemetry runtime-derived | recorder/invoke path | ✅ |
| Fault proofs replayable | X-1…X-6 | ✅ |
| Cross-capability certification passes | §11 | ✅ |
| No architecture drift | P-10, P-10.a | ✅ |
| No governance drift | no gate removed/relaxed | ✅ |
| No security regression | no control touched | ✅ |
| No data-sovereignty regression | C-11, EvidenceReference type | ✅ |

## Verdict

**The Penetration Testing Engine meets every enterprise certification criterion by executable evidence.**

One shared-repository action remains **before the certification is recorded in the platform's own registers**, and it is a human-approved decision, not an engineering gap: **resolve the ADR-0027 numbering collision** (renumber the pentest ADR to 0026), then register the two gates in `run-all.js` and re-baseline closure ([reconciliation report](PENETRATION_TESTING_ENGINE_RECONCILIATION_REPORT.md) §1, §5, §6). Until then the engine is **CERTIFIED against its own two green gates**, and the platform-level record is **pending that human-approved reconciliation** — reported here rather than absorbed silently.

**No architecture, governance, security or data-sovereignty change was made or is required.**
