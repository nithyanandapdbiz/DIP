# OAP-0001 — Operational Activation Program: Execution Report

**Status:** COMPLETE (attempt executed) · **Outcome:** EXECUTION BLOCKED ON EXTERNAL INFRASTRUCTURE — all blockers external · **Date:** 2026-07-29

> The first real end-to-end execution attempt of the canonical Functional Testing workflow against this
> environment. **`npm run functionaltest` was actually executed** — its result is observed, not simulated.
> No infrastructure was simulated, no runtime bindings were mocked, and no success was fabricated. No
> architecture, runtime, contract, governance, gateway, or legacy code was changed. Repository reviews
> already completed are not repeated.

---

## 1. Infrastructure Readiness Report (Phase 1)

| Dependency | Status | Evidence |
|---|---|---|
| E-2 container runtime | **NOT READY** | `docker`/`podman`/`nerdctl`/`containerd`/`kubectl` all absent; GA probe: E-2 = NOT MEASURED (searched 8 runtimes) |
| Execution Plane | **NOT READY** | `FTE_EXECUTION_PLANE_ENDPOINT` unset; the EP is the separate customer-owned plane |
| Runtime bindings (ADR-0050 ports) | **NOT READY** | `FTE_RUNTIME_BINDINGS` unset; no bound-ports module provided |
| Certificates / Identity / Secrets | **NOT READY (external)** | supplied at deployment; none present in-environment |
| Storage / Networking / DNS / Firewalls | **NOT READY (external)** | customer/deployment-provided; no host |
| Health endpoints / Monitoring / Logging | **READY (in-package)** | `observability/src/health.ts`, `packages/observability` present; not yet hosted |

**All activation-critical external dependencies are NOT READY.** No repository/governance dependency is missing.

## 2. Deployment Validation (Phase 2)

| Check | Result |
|---|---|
| Package integrity (artefacts present) | ✅ `deploy/Dockerfile`, `deploy/azure/containerapp.yaml` present |
| Runtime compatibility (FTE build) | ✅ canonical dist built (`runtime-entry-point-bridge.js` present); FTE `tsc` clean |
| Configuration loading | ✅ launcher loads config from env (no host to apply it to) |
| Endpoint resolution | ❌ **BLOCKED** — no EP endpoint configured |
| Signing | ✅ mechanism present (`package-signing.ts`, ed25519 ADR-0007); production key EXTERNAL (Key Vault) |
| Startup sequence | ⏸ not exercised — no runtime host (E-2) to start the container |

**Deployment blocker:** no container runtime (E-2) and no target environment. Artefacts are valid; deployment cannot be performed.

## 3. Canonical Execution / Operational Execution Report (Phase 3)

**`npm run functionaltest` executed against the real environment. Observed result:**

```
CANONICAL FUNCTIONAL TESTING — EXECUTION CANNOT PROCEED
  ✗ Execution Plane endpoint not configured (env FTE_EXECUTION_PLANE_ENDPOINT is unset) …
  ✗ ADR-0050 runtime ports not bound (env FTE_RUNTIME_BINDINGS is unset) …
Upstream (governance-tracked) prerequisite: an E-2 container runtime must be provisioned; E-2 is NOT MEASURED …
No execution was performed, simulated, mocked, or fabricated. Exiting non-zero.
EXIT CODE: 1
```

**Per-stage evidence:**

| Stage | Reached? |
|---|---|
| launcher | ✅ executed |
| prerequisite validation | ✅ executed → **missing prerequisites detected** |
| runtime bridge | ❌ not reached (exited before any dynamic import) |
| 13 domains · execution package · runtime SPI · Execution Plane · execution · evidence · completion | ❌ not reached |

The launcher reached its prerequisite gate and stopped **before** instantiating the runtime bridge — the
canonical pipeline was never entered because the external prerequisites are absent. This is the honest,
observable first-run result: **execution cannot proceed without real infrastructure.**

## 4. Failure Analysis Report (Phase 4)

**First failing component:** the launcher's prerequisite validation (before the runtime bridge).

| Blocker | Classification | Evidence |
|---|---|---|
| Execution Plane endpoint unset | **INFRASTRUCTURE / (customer)** | `FTE_EXECUTION_PLANE_ENDPOINT` unset; EP is the customer plane |
| ADR-0050 ports not bound | **OPERATIONAL** | `FTE_RUNTIME_BINDINGS` unset; bindings authored at deployment against real infra |
| E-2 container runtime absent | **INFRASTRUCTURE** | no runtime binary; E-2 NOT MEASURED |
| Repository / Governance / Security / Network | **NONE** | architecture intact, build clean, governance green apart from historical reds; no network attempted (no EP configured) |

The failure is **entirely external (infrastructure + operational provisioning)**. No repository or governance defect.

## 5. Behavioural Equivalence Report (Phase 5)

**NOT PERFORMED — gated.** Behavioural equivalence requires a **successful** canonical execution to compare
against the legacy runtime. Canonical execution did not succeed (blocked on infrastructure), so there is no
canonical run to compare. No comparison was fabricated. Equivalence remains **BLOCKED** until a successful
real canonical run exists.

## 6. M5 Cut-over Readiness Assessment (Phase 6)

| Criterion | State |
|---|---|
| Runtime stability | **UNMEASURED** (no successful run) |
| Rollback readiness | READY (mechanism, `rollbackToLegacy`) |
| Operational metrics | **UNMEASURED** |
| Behavioural equivalence | **BLOCKED** (Phase 5) |
| Customer readiness | **EXTERNAL** (EP not deployed) |
| Governance approvals | **ABSENT** |

**M5 result: NOT ELIGIBLE.** `verify-runtime-cutover-readiness` PASS (correctly governs the deferral,
gateway not rerouted, RC-3 PASS). Cut-over not performed.

## 7. M6 Retirement Readiness Assessment (Phase 7)

M5 is **NOT ELIGIBLE**, so M6 evaluation is not entered. Independently: cut-over has not occurred, and the
legacy runtime is the active production path (LR-3 PASS, retained).

**Result: `M6 NOT ELIGIBLE`.**

## 8. GA Certification Assessment (Phase 8)

| GA requirement | Result | Evidence |
|---|---|---|
| E-2 (container build/runtime) has PASS evidence | **BLOCKED** | E-2 NOT MEASURED (no runtime) |
| Successful real canonical execution | **BLOCKED** | Phase 3 exit 1 (infra absent) |
| Behavioural equivalence demonstrated | **BLOCKED** | Phase 5 gated |
| Governance green (no net-new reds) | **PASS** | deterministic reds = 5, all historical/by-design; RC-3 PASS |
| Architecture / runtime / contracts intact | **PASS** | no drift; build clean |

**GA determination (computed, not asserted): NOT CERTIFIED** — the GA gate certifies iff E-2 has PASS evidence; E-2 is NOT MEASURED.

## Executive Summary

The canonical Functional Testing platform is engineering-complete and was **executed for real** against this
environment via `npm run functionaltest`. The observed result is a truthful non-zero exit: execution cannot
proceed because the external infrastructure (E-2 container runtime, a reachable Execution Plane, and the bound
ADR-0050 runtime ports) does not exist, and no operational/customer/governance approvals are recorded. The
launcher behaved exactly as designed — it reached the canonical prerequisite gate, refused honestly, entered
no legacy path, and simulated nothing. Behavioural equivalence, M5, M6, and GA are all consequently blocked on
that same external infrastructure. No repository defect was discovered; no repository work is recommended.

**Success criterion met** by the second of its two forms: not a successful execution (impossible without
infrastructure, and fabricating one is prohibited), but **a precise, evidence-backed explanation of why it
cannot yet occur** — every blocker external.

> **Engineering is complete. The remaining work is operational activation, infrastructure provisioning, and governance approval.**

**M5 recommendation: cannot proceed** — NOT ELIGIBLE until a successful real canonical execution + behavioural
equivalence + approvals exist. No production routing changed; no code modified; no infrastructure simulated;
no success fabricated. GA remains NOT CERTIFIED; the legacy runtime remains the active production path and
rollback. The external prerequisites are exactly those requested in DAR-0001.
