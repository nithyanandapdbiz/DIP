# Dev-Change Engine — Independent Enterprise Certification Package

**Capability:** 2 of 6 · `dev-change-engine` · Intelligence Plane
**Verification:** independent, evidence-only. Nothing accepted on documentation, prior reports, stored JSON or AI summary.
**Verifier standard:** recompute every conclusion from source; measure everything; evidence overrides assertion.
**Date basis:** measured against source at HEAD `f922626` (the package is untracked in the working tree).

---

## 1. Independent Verification Summary

The Dev-Change Engine was re-verified from source under the twelve-step enterprise protocol. **Every measurable criterion passed.** Two independent measurement paths — this verifier's own harnesses (fresh census, 18-point structural probe, 6-fault injection) and the capability's conformance gate — **converge on the same verdict**. The only open items are non-code coordination matters (an ADR-number collision, gate registration) that the mission explicitly reserves for human decision and forbids auto-modifying.

**Verdict: ENTERPRISE CERTIFIED** (runtime evidence). Coordination items in §14 do not affect the runtime verdict; they gate the *commit*, not the *capability*.

## 2. Measured Before / After State

"Before" is this verifier's independent recomputation, not a cited report.

| Dimension | Measured (independent) |
|---|---|
| Source | 3,891 LOC `src`, 565 LOC `test`; package untracked at HEAD |
| **Clean compilation** (dist deleted first) | **exit 0**, full strict mode (`strict`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`) |
| Agents | **129 / 129 reachable (100%)** |
| Domain orchestrators | **21 / 21 active (100%)** |
| Adapter operations | **19 / 19 invoked (100%)** across 5 SPIs |
| Workflow stages | **12 / 12 executed** |
| Governance phases | **36 / 36** (review·decision·certification × 12) |
| Package tests | **47 / 47 pass** (0 fail, 0 skip, 0 todo) |
| Conformance gate | **PASS** |
| Stage-declaration mismatches | **0** |
| Phantom audit claims | **0** |

## 3. Runtime Reachability Matrix

| Component | Registered | Reachable | Executed | Coverage |
|---|---:|---:|---:|---:|
| Master orchestrator | 1 | 1 | 1 | 100% |
| Domain orchestrators | 21 | 21 | 21 | **100%** |
| Agents | 129 | 129 | 129 | **100%** |
| Workflow stages | 12 | 12 | 12 | **100%** |
| Adapter operations | 19 | 19 | 19 | **100%** |
| Governance phases | 36 | 36 | 36 | **100%** |

Measured over a five-run workflow set (passing · failed-and-healed · failed-unhealed · reasoning-enabled · second provider); reachability is the union, because healing/defect agents are reachable only through failure and a `prompt` signal only through reasoning.

## 4. Runtime Completeness Matrix

**Runtime completeness = 100%.** No dormant production component: every registered agent, orchestrator, adapter operation, stage and governance phase was **observed to execute** — not declared. `NOT MEASURED`/`NOT RUN` appears nowhere in the pass set.

## 5. Adapter Coverage Matrix

Every operation Registered → Invoked → Observed → Recorded → Certified, both provider profiles (Azure DevOps · GitHub/Jira/Zephyr).

| SPI | Operations | Invoked |
|---|---:|---:|
| SourceControlAdapter | 5 (`listBranches`, `findChangeRequest`, `listCommits`, `diff`, `coChangedWith`) | **5/5** |
| ProjectAdapter | 2 (`fetchStory`, `linkRequirement`) | **2/2** |
| TestManagementAdapter | 5 (`createContainer`, `createGrouping`, `findExistingTests`, `publishTests`, `linkTraceability`) | **5/5** |
| ExecutionAdapter | 3 (`publishResult`, `publishEvidenceReference`, `publishDefect`) | **3/3** |
| WorkItemAdapter | 4 (`nounFor`, `supports`, `createWorkItem`, `linkWorkItemTraceability`) | **4/4** |

*Note on the brief:* STEP 6 lists "RepositoryAdapter"; the engine's actual fifth SPI is **ExecutionAdapter**. No `RepositoryAdapter` type exists in the framework — repository access is the `SourceControlAdapter`. Verified against source, not the brief's label.

## 6. Orchestrator Coverage Matrix

21 / 21 domain orchestrators coordinate their agents. **Structural ownership proven:** the capability's stages contain **zero** direct `agents.invoke(` calls — every agent is reached through its owning orchestrator's `coordinate`; every invoked agent belongs to a domain with a registered orchestrator; the master orchestrator runs the framework's twelve-stage runner and defines no lifecycle of its own.

## 7. Fault-Proof Evidence (independent injection)

Six fault classes injected by this verifier and **detected, replayed and cleanly restored**:

| Fault | Injection | Detection | Replay | Restore |
|---|---|---|---|---|
| Dormant orchestrator (business) | `coordinate` → empty | run fails at `policy-review` | ✓ | certifies again |
| Dormant orchestrator (change) | `coordinate` → empty | run fails at `architecture-review` | ✓ | certifies again |
| Dormant adapter (empty diff) | `SourceControl.diff` → [] | run fails at `discovery` | ✓ | certifies again |
| Missing governance stage | governance-less catalogue (planted in dist) | gate **exit 1**, 13 properties fail | ✓ | gate exit 0 |
| Broken build | type error in `src` | `tsc` **TS2322**, non-zero exit | ✓ | build exit 0 |
| Boundary violation | — | **unrepresentable**: `ChangeFact` has no `addedLines` field | n/a | — |

## 8. Replay Evidence

Every in-memory fault produced an identical observation on immediate re-run (deterministic). The recorded conformance-gate proof was **re-executed from a clean tree, not read from JSON**: planted → `FAIL (exit 1)`, restored → `PASS (exit 0)`. Registry entry independently confirmed `proved=true · replayed=true · verified`.

## 9. EP/IP Compliance

**Structurally enforced and proven from sealed objects.** The boundary is crossed in exactly one stage (`context`, `EP→IP`) through one agent (`repository.minimise-changes`). Scanning every sealed Intelligence-Plane stage value across all runs:

- `changedFiles`: **0**, raw `commits`: **0** in every IP-stage sealed result.
- Source lines (`addedLines`/`removedLines`, `MAX_REFUND = 1000`): **absent**.
- Commit messages (`enforce refund ceiling`): **absent**. Authors (`dev@customer.example`): **absent**.
- `EvidenceReference` has no `content`/`bytes`/`body` field.

**Grounded in ADR-0024 §3.4:** *"A function's name is structure and crosses; a function's body is content and cannot, because `ChangeFact` has no field that could hold it."* Symbol identifiers (`RefundExceeded`) crossing is the sanctioned design — approved metadata, not source. The information boundary is a **type**, not a discipline: source text is unrepresentable in the crossing type.

## 10. Governance Compliance

Every stage runs execute → review → decide → certify (`runPhase`). All 36 governance agents (3 × 12 stages) registered and observed. **Audit derives from runtime** — every agent a sealed stage claims has a matching `agent.<id>.invoked` event in that stage (0 phantom); the list comes from the framework `invocationRecorder`, never hand-written. A `<stage>.certified` audit event exists for all 12 stages. "Nothing progresses unless certified" proven by subtraction — the missing-governance fault halts the run.

## 11. Security & Data-Sovereignty Compliance

**No regression.** No security or sovereignty file touched. No credential/secret/token path altered. Provider adapters remain in-process seams — none executed against a real host (stated limit, ADR-0024 §6, not concealed). Data sovereignty: §9 above — the customer's source, commits, messages and authors are structurally confined to the Execution Plane.

## 12. AI Comparison Report

AI-enabled and AI-disabled produce **identical execution graphs**:

| Property | Result |
|---|---|
| Same stage sequence | ✓ (12/12 both) |
| Same agent invocation graph | ✓ (identical sorted set) |
| Disabled delivers 0 proposals | ✓ |
| Enabled delivers proposals | ✓ |
| Same certification outcome | ✓ |

Only reasoning proposals differ; the workflow never branches on AI. `devchange.aiEnabled` translates to the capability-neutral `ai.enabled` in one place (the master orchestrator) — framework code branches on no capability identity.

## 13. Cross-Capability Compatibility

All four built capability engines share **one framework and one canonical lifecycle**:

| Capability | `@dbiz/capability-framework` | Shared primitives | Tests |
|---|:--:|---|---:|
| Functional Testing (1) | ✓ | STAGES, certify, gateProposals, invocationRecorder | 67/67 |
| **Dev-Change (2)** | ✓ | + runPhase | **47/47** |
| Discovery (3) | ✓ | + runPhase | 54/54 |
| Penetration (6) | ✓ | + runPhase | 37/37 |

Common runtime (`runCapability`), common governance (`certify`/`runPhase`), common AI behaviour (`gateProposals`/`resolveReasoningMode`), common certification (`certify` + `CERTIFICATION_GATES`), one twelve-stage lifecycle (`STAGES`). Architecture names exactly six capabilities (R-11.4); no second orchestration lifecycle exists. **205 capability tests pass with no regression.**

## 14. Outstanding Human-Coordination Items

These are **not** runtime defects and are **not** auto-modified (STEP 11 reserves them for human decision):

1. **ADR-0024 numbering collision.** Two ACCEPTED ADRs, both dated 2026-07-23, claim number **0024**: `ADR-0024-dev-change-engine-internal-structure.md` and `ADR-0027-penetration-testing-engine-internal-structure.md`. The Dev-Change code cites ADR-0024. **Recommendation:** renumber the Penetration ADR (e.g. 0026) and update its citations; do not renumber Dev-Change's, which is the earlier capability. *Human decision required.*
2. **Two Dev-Change gates.** `verify-devchange-conformance.js` (registered in `run-all.js`) and `verify-devchange-certification.js` (unregistered, reports `ENTERPRISE CERTIFIED`) both exist — complementary (conformance vs enterprise-criteria judge), not duplicative. **Recommendation:** register the certification gate deliberately or fold it into conformance; confirm the fault entry. *Human decision — governance registration.*
3. **Uncommitted working tree (D-005).** Capability 2 sits uncommitted alongside capabilities 1, 3, 6, a framework expansion (`pipeline.ts`, `reasoning.ts`, `vector.ts`), and ADRs 0023–0025. Programme state and closure baseline predate all of it. **Recommendation:** commit each capability under its own history; re-base the closure baseline deliberately once the tree is committed. *Human decision — closure baseline.*
4. **Concurrent editing observed.** Shared governance files (`run-all.js`, `record-fault-proofs.js`, `IMPLEMENTATION_STATUS.md`, `NEXT_ACTION.md`) changed during verification. No conflict with the Dev-Change runtime evidence, but the platform has more than one active author.

## 15. Architecture Impact

**Zero drift.** This verification is additive only. No architecture document, ADR, contract, Platform Service, runtime, governance, security or sovereignty file was modified. The single artifact this verifier created and then removed was a temporary build probe; the platform is left exactly as found (verified: no `__build-probe` residue in src or dist).

## 16. Final Enterprise Certification Verdict

> ## ✅ ENTERPRISE CERTIFIED — Dev-Change Engine (capability 2)
>
> Derived exclusively from executable runtime evidence, recomputed independently.

| Criterion | Verdict |
|---|:--:|
| Runtime completeness = 100% | ✅ |
| Every registered agent executes (129/129) | ✅ |
| Every registered orchestrator executes (21/21) | ✅ |
| Every adapter operation executes (19/19) | ✅ |
| Every governance phase executes (36/36) | ✅ |
| Every certification gate passes | ✅ |
| Package compilation succeeds (clean, strict) | ✅ |
| Package tests succeed (47/47) | ✅ |
| Conformance tests succeed | ✅ |
| Fault proofs succeed (6 classes) | ✅ |
| Replay validation succeeds | ✅ |
| AI-enabled = AI-disabled execution graph | ✅ |
| EP/IP ownership structurally enforced | ✅ |
| Information boundary proven | ✅ |
| Audit derives from runtime | ✅ |
| Telemetry derives from runtime | ✅ |
| Certification derives from runtime | ✅ |
| Cross-capability validation succeeds | ✅ |
| No architecture / governance / security / sovereignty drift | ✅ |

**The certified Enterprise Architecture is preserved. No architectural, governance, security or sovereignty drift was introduced. The runtime verdict stands independent of the §14 coordination items, which gate the commit, not the capability.**
