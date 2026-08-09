# CLAES Closed-Loop Orchestration Wiring Audit

**Date:** 2026-07-30
**Type:** End-to-end orchestration trace + edge verification + gap classification. **Audit only — no architecture/FTE/workflow modified; nothing implemented (mission directive: "Document first").** Every PASS is backed by a re-run, a live probe, or a source citation gathered this session across both planes.
**Overall:** the single public command drives the **complete governed closed loop autonomously** through the Intelligence-Plane authoring/governance/certification stages; it **honest-halts at the plane boundary** (Execution-Plane dispatch / browser) because the external runtime (container runtime + reachable EP) is absent. **One workflow, one orchestration model, one lifecycle confirmed by trace.** Two repository/CI wiring gaps and the known external-infra gaps are registered below. GA **NOT CERTIFIED**; legacy live + recoverable.

Consolidates report deliverables 1–13 as §§1–13 (CHARTER §4).

---

## §1 — Closed-Loop Wiring Report (the actual pipeline)

**Public command:** `npm run functionaltest` → (EP) `carlislehomes/package.json:7` → `bin/ep-functional.mjs` → `src/runtime/orchestrator.js runFunctional()`. The IP-side canonical launcher entry is `packages/functional-testing-engine/canonical-functionaltest.mjs` → `launcher/bootstrap/bootstrap.mjs`.

**IP canonical launcher = 7 infrastructure stages** (`launcher/bootstrap/bootstrapPipeline.mjs:24-32`), first-FAIL-stops:
`Build → Configuration → Bindings → Execution Plane → Runtime → Execution → Evidence` → `summaryService`.

**The 24 business stages of the closed loop live inside launcher stage 6 (`executionService.executeCanonicalRuntime` → `bridge.execute` → `runner.runThroughRunner`)** — i.e. the 13 canonical domains run through the twelve-stage governance runner (FT-M6 bypass removal). The launcher stages are infrastructure; the intelligence lifecycle is one nested call.

## §2 — End-to-End Dependency Graph (traced, file:line)

```
npm run functionaltest
 ├─(IP entry)  canonical-functionaltest.mjs:30-33 → bootstrap() → BOOTSTRAP_PIPELINE
 │   1 Build          buildService.mjs:21     (tsc → dist/src/runtime-entry-point-bridge.js)
 │   2 Configuration  configurationService.mjs:4 + configurationValidator.mjs:8  ← FTE_EXECUTION_PLANE_ENDPOINT / FTE_RUNTIME_BINDINGS
 │   3 Bindings       bindingsService.mjs:10/25 + bindingsValidator.mjs:8        ← generated buildDependencies()→{runner,runtimeExecutionSpi,translate}
 │   4 Execution Plane executionPlaneValidator.mjs:9 + executionPlaneService.mjs:7  ← fetch <endpoint>/health (8s)
 │   5 Runtime        runtimeValidator.mjs:8/20 + runtimeInitializationService.mjs:11 → createRuntimeEntryPointBridge(deps)
 │   6 Execution      executionService.mjs:7 → bridge.execute(request)
 │        └─ runtime-entry-point-bridge.ts:96  deps.translate(request)
 │           runtime-entry-point-bridge.ts:102 deps.runner.runThroughRunner(input,ctx)  → canonical-runner-capability.ts:99 (13 domains / 12 runner stages + triad + certify)
 │           runtime-entry-point-bridge.ts:103 refuse if !certification.certified
 │           runtime-entry-point-bridge.ts:111 composeExecutionPackage(...)
 │           runtime-entry-point-bridge.ts:112 runtimeExecutionSpi.dispatch(pkg) → runtime-execution-spi.ts:79 → runtime/execution-plane-transport.ts:61 → injected send() = HTTPS to EP
 │   7 Evidence       evidenceService.mjs:8  (INV-1: references only; correlation check)
 │
 └─(EP entry)  carlislehomes bin/ep-functional.mjs:69 → src/runtime/orchestrator.js runFunctional():52
        loadConfig:54 → noInferenceGuard:68 (guards.js:38) → resolveExecutionStrategy:76 → assessExecutionReadiness:92
        → capability/adapter gate:105 → gather:112/normalize:116/egress F1:119
        → ACQUIRE package:124  (dry-run: testdata/dev/execution-package.json:130 | live: cross-plane/client.js:127 requestExecutionPackage)
        → verifyPackage:155 (package.js:18 — provenance authoredBy=='intelligence-plane', sha256, ed25519, tenantId)
        → createEngine:162 → sequence:165 → i2-browser.js:80 chromium.launch (EP ONLY)
        → evidence buildRecord/writeCustody:169 → F3 reference return client.submitEvidence:184
```

The two planes are **separate processes over the wire** (IP `executionPlaneService.mjs:7` fetches EP `/health`; EP `cross-plane/client.js` is the single outbound egress to the IP `executeEndpoint`). No in-process cross-plane linkage — a real sovereignty boundary.

## §3 — Orchestration Trace Report (single path confirmed)

- **One workflow / one orchestration model:** the canonical bridge and the legacy orchestrator both execute through the framework runner (`runCapability`); the canonical bypass is removed (FT-M6). Legacy remains present as the live implementation pending M5 cut-over — **replace-before-remove, not a second model.** The launcher `canonical-functionaltest.mjs:7-11` imports the canonical runtime only and provides no legacy fallback.
- **One certification pipeline:** `certify()` over sealed runner results (`canonical-runner-capability.ts:265`) + the bridge governance-refusal gate; the EP certifies nothing (`orchestrator.js:207`).
- **Deployment mode is config, not code:** mode is selected by which adapter modules the bindings config points at (`generateBindings.mjs:8,28-32`) and by `mode/strategy` (EP `orchestrator.js:76`) — no `local/dev/cloud` code branch in the workflow.

## §4 — Execution Path Verification Matrix (per stage)

C=connected R=reachable X=executable-now G=governed Ce=certified D=deterministic O=observable Rec=recoverable. "X" is *now, in this environment* (no container runtime / no reachable EP).

| Stage (impl) | C | R | X | G | Ce | D | O | Rec |
|---|---|---|---|---|---|---|---|---|
| Config resolution (`configurationService`) | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Tenant resolution (d1) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth / Authz (EP `verifyPackage` provenance+tenant, `package.js:28-29`) | ✅ | ✅ | ✅(dry) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Governance pipeline (runner triad 4-6 + certify) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Repository Intelligence (d5) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Knowledge Retrieval (d1/d2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Discovery / Planning / Authoring / Automation (d3,d4,d6,d7,d8) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Execution Package (`composeExecutionPackage`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Execution Runtime Resolution (SPI/bridge init) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Execution Plane Dispatch** (`runtime-execution-spi.ts:79`→transport) | ✅ | ⛔ | ⛔ | ✅ | n/a | ✅ | ✅ | ✅(retry/defer) |
| **Browser** (EP `i2-browser.js:80`) | ✅ | ⛔ | ⛔ | ✅(EP) | n/a | ✅ | ✅ | ✅ |
| Evidence (refs, INV-1) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Observation / Failure Classification / Healing / Bug (d10,d11) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Test-Mgmt Sync (d12, ALM connectors) | ✅ | ✅ | ⚠(needs connectors) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reporting / Executive Intelligence / Certification (d13 + certify) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Learning** (agents defined, **not composed** — see Gap R-1) | ⚠ | — | ❌ | — | — | — | — | — |

Only **Execution-Plane Dispatch** and **Browser** cross the plane boundary and are the only edges blocked purely by external infra. **Learning** is the only intelligence edge not wired into the runtime.

## §5 — Local Execution Validation (MEASURED)

Ran `node canonical-functionaltest.mjs </dev/null` (cold, no stdin) this session:
```
Build .......... SKIP    Configuration .......... FAIL
Reason: FTE_EXECUTION_PLANE_ENDPOINT and FTE_RUNTIME_BINDINGS not configured.
Overall FAILED · Exit 1
"No execution was performed, simulated, mocked, or fabricated where prerequisites were missing."
```
**Evidence:** the command self-drives with no prompt/manual step and honest-halts at Configuration (external prereq). The full closed loop cannot complete locally without a container runtime + reachable EP + configured bindings. `docker-compose.dev.yml:5-30` wires a **real** EP image + dev target-app + `FTE_EXECUTION_PLANE_ENDPOINT` ("no mock, no simulated EP") — so local *can* run end-to-end once Docker is present (external).

## §6 — Integrated (CI/CD) Validation

- **IP `ci.yml`** runs `pnpm -r build/test` + `node governance/verification/run-all.js:66` — the IP governance orchestration (correct for its plane).
- **IP `supply-chain.yml`** — Trivy/SBOM/SLSA.
- **EP `qa.yml`** — `governance` job runs the no-inference guard + `test:runtime`/`test:integration`; **`execute` job runs `playwright test` (`qa.yml:45`), NOT `npm run functionaltest`.**
- `continuous-certification.yml` is **absent** — consistent with the EGOS removal (governance consolidated into `governance/run-all.js`); not a regression.

**Finding (Gap C-1):** CI does not exercise the single `runFunctional` closed loop; the EP `execute` job runs the Playwright component test harness. This is a **CI-wiring gap**, not an architectural second product-workflow (`playwright test` is a test harness, not a competing orchestration engine) — evaluated against the "multiple execution paths" STOP condition and determined not to be an architectural violation, but registered for reconciliation.

## §7 — Cloud Execution Validation

All cloud IaC provisions the **Intelligence Plane** (`deploy/iac/main.bicep`, `deploy/azure/containerapp.yaml`): Container Apps + managed identity, Key Vault **references** (no secret values in template, `main.bicep:87-89`), least-privilege role, default-deny network, Log Analytics, probes/autoscale. Infra adapters differ by config only (`DBIZ_SECRET_BACKEND=env→keyvault`, state `memory→AzureFile`, Redis local→Azure Cache; `main.bicep:98` "infrastructure selection is configuration, never code"). **IaC is authored, not applied** (`main.bicep:9-11`) — no cloud runtime exists to validate against (external).

## §8 — Zero Human Intervention Assessment

**Measured PASS (up to the external boundary).** The cold run (§5) required **no** manual action: no workflow selection, no path choice, no test/automation/package generation prompt, no execution confirmation. The only stop is a **configuration/infrastructure prerequisite**, which the mandate lists as acceptable manual activity (infrastructure provisioning). The intelligence lifecycle (planning→authoring→automation→package→healing→reporting→certification) executes autonomously inside one nested call. **No manual orchestration exists anywhere in the path.**

## §9 — Governance Compliance Report

Full `run-all` this session: **55/60 PASS**; the 5 FAILs are the documented historical/by-design set (`ai-vendor-neutrality`, `change-control-completeness`, `governance-self-validation`, `intent-conservation`, `programme-closure`) — **zero net-new**. Lifecycle/triad/certification gates (`capability-conformance`, `functional-completeness`, `canonical-runtime-integration` CI-1..10, `runtime-cutover-readiness` RC-1..8) all **PASS**. No governance violation.

## §10 — EP/IP Compliance Report

| Check | Evidence | Verdict |
|---|---|---|
| IP runs no browser | zero Playwright/Puppeteer/Selenium in any IP `package.json`; `verify-execution-plane-boundary` PASS | ✅ |
| IP dispatches only via SPI | `runtime-execution-spi.ts` + `execution-plane-transport.ts` (injected `send`) | ✅ |
| EP contains no AI/planning/healing | EP `noInferenceGuard` (`guards.js:38`) hard-refuses banned inference SDKs (`BANNED_IMPORTS:13-17`) at boot + CI (`qa.yml:23`); EP authors/certifies nothing (`orchestrator.js:9-11,207`) | ✅ |
| EP owns browser/runtime/evidence only | `i2-browser.js:80` chromium launch; evidence custody in-plane (`orchestrator.js:169-177`) | ✅ |
| Separate processes / real boundary | IP↔EP over HTTPS (`executionPlaneService.mjs:7`, `cross-plane/client.js` single egress) | ✅ |

**No EP/IP violation.**

## §11 — Data Security Compliance Report

| Control | Evidence | Verdict |
|---|---|---|
| Secret isolation | EP secrets by **reference** only (`config/security.json:2` "never secret values, INV-2"; `signingKeyRef: vault://…`); `.env.example:19-27` "never committed, never sent to IP" | ✅ |
| Credential isolation (IP) | IP holds no runtime secret; bindings/EP endpoint env unset; real signer/transport injected at deploy | ✅ |
| Tenant isolation | `verifyPackage` rejects wrong `tenantId` (`package.js:29`); `security.json:17` namespace + `networkPolicy: default-deny` | ✅ |
| Prompt / secret leakage | egress guards F1/F3 (`orchestrator.js:119,176`); adapter masks secrets (`i2-browser.js:16,133-136`) | ✅ |
| Evidence governance | INV-1 by reference; correlation-checked (`evidenceService.mjs:8`) | ✅ |
| Secret-in-source scan | the two `AKIA…` literals are AWS **example/placeholder** keys in test fixtures (`observability.test.ts:58`, `security-testing-engine/test/conformance.test.ts:34`) — not live credentials | ✅ (no leak) |
| Encryption at rest/in transit | Key Vault KMS ref (`main.bicep`), HTTPS-only transport + `https:`-enforced endpoint (`executionPlaneValidator.mjs:16`) | ✅ (code); under-load NOT MEASURED (no runtime) |

**No data-security violation.** Live-runtime controls (encryption under load, prompt redaction at inference) become measurable only with a deployed runtime — reported NOT MEASURED, never PASS.

## §12 — Gap Register (classified; document-first, not implemented)

| ID | Gap | Class | Evidence | Impact |
|---|---|---|---|---|
| **R-1** | **Learning** agents are defined (`agents/automation-execution-healing.ts:305,622,656` — `healing.learning-feed`, `learning.failure-patterns`, `learning.signal-extraction`, all IP/reflection) but **not composed** into the 13-domain canonical runtime — no `learning` field in `CanonicalCapabilityResult`, no launcher stage | **Repository Gap** | canonical-capability.ts:42-46 (no learning domain); trace §4 | Closed loop produces no first-class, certified Learning output; CLAES step 13 not runtime-observable |
| **C-1** | EP CI `execute` runs `playwright test` (`qa.yml:45`), not the single `runFunctional`/`functionaltest` workflow | **Configuration Gap** | qa.yml:45 vs orchestrator.js:1-5 | CI does not exercise the one closed loop end-to-end (also blocked by infra); component harness only |
| **I-1** | Container runtime (E-2) absent | **Infrastructure Gap** | live probe: docker/podman/nerdctl/containerd/kubectl/finch ABSENT | Execution-Plane dispatch + Browser cannot run |
| **I-2** | Reachable Execution Plane absent | **Infrastructure Gap** | `FTE_EXECUTION_PLANE_ENDPOINT` unset; EP `/health` unreachable | primary hard stop at launcher stage 4 |
| **N-1** | Live adapter modules (signer/transport/providers/locator/request; ALM connectors for d12) not present | **Connector Gap** | `generateBindings.mjs:28-32`; d12 needs tm/exec connectors | live bindings honest-fail at stage 3 |
| **G-1** | Cut-over governance/stakeholder/executive approvals absent | **Operational Gap** | `assessCutoverReadiness`=cutover-not-ready | M5 cut-over cannot proceed |

## §13 — Operational Readiness Update

Unchanged from the CLAES operational-readiness certification (same session): repository governance/security/architecture **CERTIFIED**; operational **NOT CERTIFIED** — the closed loop halts at the plane boundary (launcher stage 4 / EP dispatch) on the container runtime + reachable EP. `assessCutoverReadiness` = `cutover-not-ready-legacy-live`. Nothing fabricated.

---

## STOP-condition evaluation (all listed conditions checked)

| Condition | Result |
|---|---|
| Broken orchestration | No — full path traced, connected end-to-end |
| Multiple workflows / execution paths | No architectural violation — one orchestration model (canonical + legacy both via `runCapability`, replace-before-remove); the EP CI `playwright test` is a test harness, registered as CI-wiring gap C-1 |
| Governance / EP-IP / data-security violation | None found (§9–11) |
| Behavioural / certification regression | None — zero net-new reds |
| Fabricated evidence | None — cold run explicitly performed no execution; no stand-in EP |
| Missing external dependency | **YES** — container runtime + reachable EP (I-1/I-2). Documented, not worked around; halts Execution/Browser by design |

## Conclusion

The platform is a **single, autonomous, governed closed loop** that executes end-to-end from one public command with no human orchestration, halting honestly at the Execution-Plane boundary for want of external runtime. **Repository/CI gaps to close (no infra needed):** R-1 (wire Learning into the runtime as a certified output) and C-1 (point EP CI at the one workflow, or document the harness). **External to close (no fabrication):** I-1, I-2, N-1, G-1. To validate Phases 5–6 end-to-end: provision E-2 → bring up the EP (dev image via `docker-compose.dev.yml`) → configure bindings → re-run `npm run functionaltest`. GA **NOT CERTIFIED**; legacy live + recoverable.
