# ADR-0051 — Production Readiness & Operational Validation Review

**Status:** COMPLETE (review) · **Decision:** **NO GO for M5** (blocked on environment + customer-provided prerequisites; not on architecture) · **Date:** 2026-07-29

> An objective, repository-backed operational readiness assessment before behavioural
> equivalence, runtime cut-over and legacy retirement. **No code, architecture, contract
> or routing was changed by this review.** Every conclusion cites repository evidence.
> The architecture and implementation scopes (ADR-0039…ADR-0050) are complete and
> certified in-reference; the operational and environment prerequisites for M5 are not
> met. The result is **NO GO**, with the exact blockers documented.

---

## 1. Executive Summary

The Functional Testing capability has been rebuilt (ADR-0039), its platform contracts frozen (ADR-0040), its activation and qualification mechanisms certified (ADR-0044/0045), its retirement and cut-over governed and deferred (ADR-0046/0049), its runtime-integration architecture decided (ADR-0047), the bridge implemented (ADR-0048), and the runtime infrastructure implemented in-reference (ADR-0050). **All of that is present, certified by executed evidence, and additive — the legacy runtime is live and untouched.**

M5 (behavioural equivalence → gateway cut-over → legacy retirement) **cannot proceed**, for reasons that are operational and environmental, not architectural: there is **no runtime environment** (E-2 NOT MEASURED — no container runtime), the **Execution Plane is not reachable** (it is customer-provided, a separate sovereign plane), the real runtime **integration is validated in-reference only** (M4.5 NOT MEASURED), **behavioural equivalence has not been — and cannot yet be — demonstrated**, and the **required approvals do not exist**. **Decision: NO GO.**

## 2. Architecture Review (Phase 1)

| Item | Evidence | Result |
|------|----------|--------|
| ADR-0039 implementation matches architecture | 13 domain gates registered + PASS; 13/13 certified | ✅ consistent |
| ADR-0040 contracts unchanged | platform-contract gate PASS; no contract redefinition in any later component (gate-enforced) | ✅ unchanged |
| ADR-0047 architecture implemented | ADR-0048 bridge + ADR-0050 infrastructure realise Options A+B1 | ✅ implemented |
| ADR-0048 bridge implemented | `verify-canonical-runtime-integration` PASS (CI-1…CI-10), 6 fault proofs | ✅ implemented |
| ADR-0050 runtime infrastructure implemented | `verify-runtime-enablement` PASS (RE-1…RE-8), 6 fault proofs | ✅ implemented (in-reference) |

**Deviations / drift / duplicated responsibilities:** none introduced. One **declared** variance (ADR-0048 §9): the legacy `OrchestrationResult` embeds sealed `StageResult`s whose `SEAL` is module-private; the bridge returns a canonical-native `RuntimeExecutionOutcome`, and the mapping is deferred to M5 gateway adaptation. No architectural drift; no domain redesigned; no undocumented assumption found.

## 3. Runtime Readiness (Phase 2)

| Capability | Component | Status |
|------------|-----------|--------|
| request translation | `runtime/execution-request-translator.ts` | ✅ implemented (in-reference); real providers injected at deployment |
| runtime bridge | `runtime-entry-point-bridge.ts` | ✅ implemented; not wired to any entry point |
| runtime transport | `runtime/execution-plane-transport.ts` | ✅ implemented; network `send` is an injected port |
| evidence return | `runtime/evidence-return-channel.ts` | ✅ implemented (evidence by reference) |
| execution package generation | `canonical-authoring-composer.ts` | ✅ implemented (valid `ExecutionPackage`) |
| signing | `runtime-execution-spi.ts` + `package-signing.ts` (ed25519, ADR-0007) | ✅ mechanism present |
| correlation | translator + transport (correlation id preserved, mismatch refused) | ✅ implemented |
| observability | `packages/observability` (telemetry/health/slo/dashboards); components carry correlation/trace ids | ✅ present |

**Remaining runtime dependency that prevents M5:** the injected real ports — the **real request-translation providers** (project adapter + tenant profile), the **real locator resolver** (application model / EP discovery), the **real network transport `send`**, and a **reachable Execution Plane** — are not connected to real infrastructure, and there is no runtime environment to run them. **M4.5 (end-to-end EP integration) is NOT MEASURED.**

## 4. Dependency Matrix (Phase 3)

| Dependency | Classification | Evidence |
|------------|----------------|----------|
| Legacy runtime (`capability.ts` / `orchestrators.ts` / `authoring-bridge.mjs`) | **ACTIVE** | the live `/v1/execute` path routes through it |
| Gateway (`ip-execute-gateway.mjs`) → authoring-bridge → legacy engine | **ACTIVE** | grep: gateway references authoring-bridge, not the canonical bridge |
| Canonical bridge / composer / SPI (ADR-0048) | **OPTIONAL** (present, not wired) | not referenced by any entry point |
| Runtime infrastructure (translator / adapter / transport / evidence channel) (ADR-0050) | **OPTIONAL** (present, not wired) | injected ports, no real bindings |
| Real Execution Plane transport / reachable EP | **BLOCKING** | no reachable EP; no container runtime (E-2) |
| Real translation providers / locator resolver | **BLOCKING** | not implemented against real adapters/app-model |
| Obsolete dependencies | **none** | nothing deleted; replace-before-remove intact |

## 5. Observability Matrix (Phase 4)

| Signal | Present | Evidence |
|--------|---------|----------|
| logging | ✅ platform | `packages/observability` (telemetry) |
| tracing | ✅ | execution context carries `traceId`/`spanId`; components thread them |
| correlation IDs | ✅ | translator preserves `correlationId`; transport refuses a mismatch |
| metrics | ✅ platform | `packages/observability` (slo, dashboards) |
| audit | ✅ | execution context `audit` (append-only); gateway builds a decision trace |
| evidence lineage | ✅ (by reference) | evidence handles carry `evidenceId`/`contentHashRef`/custody (INV-1) |
| error propagation | ✅ | transport surfaces transport failure / signature / correlation / missing-evidence as typed refusals |
| retry visibility | ⚠️ partial | transport enforces bounded retry; per-attempt telemetry emission is deployment-time (edge), NOT MEASURED here |

## 6. Security Review (Phase 5)

| Control | Status | Evidence |
|---------|--------|----------|
| package signing | ✅ | `package-signing.ts` — persisted ed25519 detached signer (ADR-0007) |
| signature verification | ✅ | SPI refuses unsigned; transport verifies the EP response signature (injected verifier) |
| transport authentication | ✅ mechanism | detached signatures + trust anchor (ADR-0036); verified at the EP |
| tenant isolation | ✅ | identities preserved end to end; no cross-tenant path in the runtime components |
| execution authorization | ✅ (by contract) | `ExecutionPackage.proceed` gates execution; the EP verifies before executing (R-20.10) |
| evidence integrity | ✅ | content-addressed package (`hash`), evidence by reference (INV-1), payloads never cross |

**Trust-boundary violations:** none found in the reviewed runtime components. (The IP never executes; the EP verifies and executes; evidence crosses by reference.) The AI-key and PAT owner-rotation items noted elsewhere are pre-existing and unrelated to this review.

## 7. Deployment Checklist (Phase 6)

| Requirement | Classification |
|-------------|----------------|
| Dockerfile / container image (`deploy/Dockerfile`, `deploy/azure/containerapp.yaml`) | IMPLEMENTED (artefacts) |
| Container build / runtime (E-2) | **NOT IMPLEMENTED / ENVIRONMENT PROVIDED** — E-2 NOT MEASURED (probe searched 8 runtimes, none present) |
| Signing key (persisted ed25519) | IMPLEMENTED (mechanism); production key = ENVIRONMENT PROVIDED |
| Trust anchor / signature verification key | ENVIRONMENT PROVIDED (published to the EP tenancy) |
| Network to the Execution Plane | CUSTOMER PROVIDED |
| Execution Plane runtime | **CUSTOMER PROVIDED** (separate sovereign plane) |
| Configuration / env vars / ports / certificates | ENVIRONMENT / CUSTOMER PROVIDED (documented in `deploy/`) |

## 8. Runtime Prerequisites (Phase 6)

Implemented (in-reference): the four M4 components, the bridge, the composer, the SPI, signing. **Not implemented / not measured:** the real bindings of the injected ports (translation providers, locator resolver, network transport) and the end-to-end run against a real Execution Plane (M4.5).

## 9. Environment Prerequisites (Phase 6)

A container runtime (E-2) and a reachable, verified Execution Plane in a non-production environment. **Neither exists here.** These are environment/customer responsibilities, documented in `deploy/E2_EVIDENCE.md` and the cross-plane contract; the platform cannot fabricate them.

## 10. M5 Readiness (Phase 7)

| Prerequisite | Classification | Evidence |
|--------------|----------------|----------|
| Behavioural Equivalence | **BLOCKED** | needs M4.5 (real EP) + real workloads; canonical has never run real (`productionActivationPerformed=false`); abstract-vs-concrete packages until live locator resolution |
| Gateway Cut-over | **BLOCKED** | `assessCutoverReadiness` → `cutover-not-ready-legacy-live` (9/10 preconditions unmet) |
| Legacy Retirement | **BLOCKED** | `assessLegacyRetirementReadiness` → `retirement-not-ready-legacy-retained` (7/9 unmet) |
| Runtime infrastructure (M4.1–M4.4) | **PARTIAL** | implemented in-reference; real bindings + M4.5 pending |
| Governance / observability / security mechanisms | **READY** | gates PASS; signing/evidence/correlation in place |

## 11. Risk Register

| Risk | Severity | Mitigation / Status |
|------|----------|---------------------|
| Premature cut-over before equivalence | High | `verify-runtime-cutover-readiness` RC-3 enforces the gateway is not rerouted; GREEN |
| Premature legacy deletion | High | `verify-legacy-retirement-readiness` enforces replace-before-remove; GREEN |
| Canonical produces abstract packages until M4 locator resolution | Medium | ADR-0050 live adapter resolves locators; requires a real app model at M4.5 |
| No runtime environment (E-2) | High (terminal GA dependency) | environment-provided; unchanged |
| Behavioural equivalence unproven | High | blocked on M4.5; do not fabricate |

## 12. Open Issues

- **E-2 NOT MEASURED** — the single terminal dependency for GA and for a real M4.5 run.
- **M4.5 real-EP integration** — pending a reachable Execution Plane.
- Real bindings of the injected ports (translation providers, locator resolver, transport `send`).
- No governance / stakeholder / executive approval recorded for cut-over or retirement.
- Pre-existing, unrelated: the 6 documented run-all reds (ADR-0037 ×3, operational-readiness, self-validation, intent-conservation); AI-key / PAT owner rotation.

## 13. GO / NO-GO Decision (Phase 8)

**Decision: NO GO for M5.**

| NO-GO item | Repository evidence | Blocking component | Required action | Estimated scope |
|------------|---------------------|--------------------|-----------------|-----------------|
| No runtime environment | E-2 NOT MEASURED (probe: 8 runtimes, none) | container runtime | provision a container runtime | environment (external) |
| Execution Plane unreachable | no EP endpoint; customer-owned plane | real EP | stand up / connect a non-production EP | customer/environment (external) |
| M4.5 not run | `verify-runtime-enablement` reports M4.5 NOT MEASURED | real port bindings + EP | bind real ports; run M4.5 end-to-end | implementation (bounded) + environment |
| Behavioural equivalence unproven | canonical never ran real; abstract-vs-concrete | equivalence suite on real workloads | run legacy + canonical, compare | blocked on M4.5 |
| No approvals | none recorded | governance/stakeholder/executive | obtain approvals | governance (external) |

**Architecture and implementation are GO; operations and environment are NO GO.** The blockers are environment-provided (E-2/runtime) and customer-provided (EP) plus approvals — none are architectural gaps, and none may be fabricated.

## 14. Final Recommendation

Proceed **only** in this order, each a separately authorised step, none of which this review performs:
1. Provision a container runtime (E-2) and connect a non-production Execution Plane.
2. Bind the ADR-0050 injected ports to the real project adapter, application-model locator resolver, and network transport.
3. Run **M4.5** end-to-end (package → transmit → EP accept → EP execute → evidence) and record measured evidence.
4. Run the **behavioural-equivalence** suite (legacy vs canonical) on representative real workloads; report every difference.
5. With equivalence demonstrated and governance + stakeholder + executive approval, perform the **M5 cut-over** via ADR-0049 §6 (gateway adaptation + reroute).
6. After stable production operation and the rollback window, perform **M6 retirement** via the ADR-0046 readiness gate.

Until step 1 exists, **M5 does not proceed.** The legacy runtime remains the live, recoverable implementation. GA remains NOT CERTIFIED. This review changed no code, architecture, contract or routing.
