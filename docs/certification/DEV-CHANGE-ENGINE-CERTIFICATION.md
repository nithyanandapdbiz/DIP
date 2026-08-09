# Dev-Change Engine — Enterprise Certification Report

**Capability:** 2 of 6 · `dev-change-engine` · **Verdict:** **ENTERPRISE CERTIFIED** (capability level)
**Measured:** 2026-07-23 · **Method:** executable evidence only — nothing asserted because code exists
**Gates:** `verify-devchange-certification.js` (this report) · `verify-devchange-conformance.js` (22/22)
**Evidence:** `governance/capability/devchange-certification-evidence.json`

Every number below is derived from an executed run of the engine. Reproduce with:

```sh
node governance/verification/verify-devchange-certification.js
```

---

## Step 1 — Measured implementation state (from disk)

| Artefact | Measured |
|---|---|
| Package | `@dbiz/dev-change-engine` — 13 source files, 13 compiled, builds clean |
| Master orchestrator | 1 (`DevChangeEngineOrchestrator`) |
| Domain orchestrators | 20 + 1 governance orchestrator (21 registered) |
| Agents | **129** (93 domain + 36 governance) |
| Stages | 12 (the frozen lifecycle) |
| Adapter SPIs | 5 (SourceControl, WorkItem, Project, TestManagement, Execution) — 19 operations |
| Conformance gate | `verify-devchange-conformance.js` — 22 properties, registered in `run-all.js`, fault-proved |

State was measured from the filesystem, not from programme status, README or prior summaries.

## Step 2 — Runtime reachability — **100%**

| Category | Registered | Executed | Completeness |
|---|---|---|---|
| Agents | 129 | **129** | **100%** |
| Domain orchestrators | 21 | **21** | 100% |
| Domains | 21 | **21** (0 inert) | 100% |
| Workflow stages | 12 | **12** | 100% |

`neverExecuted = []`. No dormant production components. A single run exercises every agent
because the scenario includes one failing test, so healing, reflection, root-cause and defect
domains all have work.

## Step 3 / 4 — Orchestrator & agent participation

Every domain orchestrator's `coordinate()` **invokes** its agents; no stage reaches past its
orchestrator (measured: all 21 domains contributed observed invocations). Every registered
agent executed and carries a complete contract — purpose, inputs, outputs, decision logic,
retry, failure handling, telemetry, audit events, plane; reasoning agents additionally carry a
prompt contract with a non-empty rejection rule (enforced at registration).

## Step 5 — Adapter reachability — **19/19 operations invoked**

| SPI | Operations | Invoked |
|---|---|---|
| SourceControlAdapter | 5 | **5** |
| WorkItemAdapter | 4 | **4** |
| TestManagementAdapter | 5 | **5** |
| ExecutionAdapter | 3 | **3** |
| ProjectAdapter | 2 | **2** |

Measured through a recording proxy that captures every method call — including the pure
`nounFor`/`supports`, which self-journal nothing but are invoked by `sync.work-items`. No
declared-only adapter operations.

## Step 6 — EP/IP boundary — fault-proved

| Check | Result |
|---|---|
| No source line in the sealed Intelligence-Plane state | **PASS** |
| No commit message in the sealed state | **PASS** |
| No author/PII in the sealed state | **PASS** |
| Every EP-stage agent declared Execution-Plane | **PASS** |
| `ChangeFact` structurally cannot hold source (type check) | **PASS** (conformance V-5 + gate §5) |

The boundary is a **type, not a discipline**: `ChangeFact` has no field for a line of source,
so a leak requires adding a field — a reviewable act. The raw diff and commits are dropped at
the single crossing (`minimise`, stage 3). A planted source-carrying fact is refused by the
context review (fault proof `boundary-violation-source-in-fact`).

## Step 7 — AI-enabled vs AI-disabled — **identical invocation graph**

| | AI Enabled | AI Disabled |
|---|---|---|
| Agents invoked | **129** | **129** (identical set) |
| Stages | 12 (identical) | 12 (identical) |
| Proposals delivered | 3 | **0** |

The graph is identical because disabling reasoning withholds proposals; it adds no code path.
Rules-first execution is the only path; reasoning is an optional input that narrows or reorders,
never originates.

## Step 8 — Provider workflow equality

Azure DevOps and GitHub+Jira+Zephyr traverse the **identical 12 stages with the identical
129-agent set**; only the resolved adapters differ (`sourceControl: azure-devops` vs `github`).
No provider name appears in orchestration source (conformance V-5.n equivalent).

## Step 9 — Governance derived from runtime

| Check | Result |
|---|---|
| Governance triad traversed (stages 4–6) | **PASS** |
| Every stage certified from the run | **PASS** |
| Audit events derived from the run (not hand-written) | **153 events** |

Every stage runs execute→review→decide→certify; refusal is the only exit. Audit is read from
the run's event stream, never authored.

## Step 10 — Fault proofs — **6/6 detected and replayed**

| # | Fault | Diagnosis (measured) | Replayed |
|---|---|---|---|
| 1 | Missing governance agent | triad not traversed: policy-review (R-12.2) | ✓ |
| 2 | Dormant orchestrator / missing agent | `repository.commit-discovery: not registered` | ✓ |
| 3 | Broken source-control adapter | discovery stage not certified — 2 blocking findings | ✓ |
| 4 | Boundary violation (source in fact) | a change fact carries source lines — refused | ✓ |
| 5 | Provider failure (unresolved adapter) | no provider "nonexistent" for `sourceControl.provider` | ✓ |
| 6 | Dormant registered agent | runtime completeness below 100% — agent never executed | ✓ |

Each fault fails certification with an evidence-backed diagnosis and reproduces on replay.

## Step 12 — Cross-capability certification

| Capability | Gate | Result |
|---|---|---|
| Functional Testing Engine | `verify-capability-conformance.js` · `verify-functional-completeness.js` | **PASS** |
| Inverse-Flow Discovery Engine | `verify-discovery-conformance.js` | **PASS** |
| Dev-Change Engine | `verify-devchange-conformance.js` · `verify-devchange-certification.js` | **PASS / CERTIFIED** |
| Platform certification framework | `verify-platform-certification.js` | **PASS** (reports honestly) |

Common runtime (`@dbiz/capability-framework`), common governance (the triad + four-phase
pipeline), common security (Information Boundary, EP/IP), common certification (sealed stage
results), and common AI behaviour (proposal gating) are **shared without drift**. The platform
framework reports Dev-Change **CONDITIONALLY CERTIFIED** — conditional only on deployment/E-2
evidence, the platform-wide GA blocker that no capability has cleared. That is a platform GA
gap, not a Dev-Change defect.

## Step 13 — Certification summary

| Success criterion | Result |
|---|---|
| Runtime completeness = 100% | ✓ 129/129 |
| Every registered orchestrator executes | ✓ 21/21 |
| Every registered agent executes | ✓ 129/129 |
| Every adapter executes | ✓ 19/19 operations |
| Every certification gate executes | ✓ 12 stage gates + release |
| AI-enabled/disabled share one execution graph | ✓ identical |
| EP/IP ownership structurally enforced | ✓ type + runtime |
| Information Boundary fault-proved | ✓ fault 4 |
| Providers preserve the canonical workflow | ✓ |
| Governance runtime-derived | ✓ |
| Audit runtime-derived | ✓ 153 events |
| Fault proofs replayable | ✓ 6/6 |
| Cross-capability certification passes | ✓ |
| No architecture / governance / security / sovereignty drift | ✓ (no frozen doc edited) |

**Verdict: ENTERPRISE CERTIFIED at the capability level.** Platform GA remains blocked by E-2
(deployment), which is outside this capability's scope and applies to the whole platform.

## Outstanding reconciliation (does not affect this verdict)

See [`DEV-CHANGE-ENGINE-RECONCILIATION.md`](DEV-CHANGE-ENGINE-RECONCILIATION.md). Summary: a
concurrently-authored **duplicate `ADR-0024`** (Penetration) and a pending shared-closure
re-baseline require a **human decision** and were deliberately not auto-resolved.
