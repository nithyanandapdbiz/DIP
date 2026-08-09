# OAR-0001 — Operational Activation Readiness Review (Canonical Functional Testing)

**Status:** COMPLETE · **Final verdict:** **READY WITH EXTERNAL BLOCKERS** · **Date:** 2026-07-29

> Final pre-activation review determining whether the platform is prepared for operational activation once
> external infrastructure becomes available. **Review only — no code, routing, governance, or ADR changed;
> no defect was discovered.** No Execution Plane was simulated, no runtime bindings were mocked, and no
> success was fabricated. Every conclusion is re-derived from disk.

---

## Phase 1 — Architecture validation (no drift)

| Element | State | Evidence |
|---|---|---|
| Single launcher | ✅ intact | `canonical-functionaltest.mjs` present; `functionaltest` command exists once |
| Canonical runtime | ✅ intact | canonical bridge graph, legacy-free (FUNCTIONALTEST-VERIFICATION-001 PASS) |
| Runtime bridge | ✅ intact | `runtime-entry-point-bridge.ts` → `execute(request)` |
| Execution Package Composer | ✅ intact | `canonical-authoring-composer.ts` → `composeExecutionPackage` |
| Runtime SPI | ✅ intact | `runtime-execution-spi.ts` → `dispatch(pkg)` |
| Evidence-by-reference | ✅ intact | INV-1; canonical SPI returns references only |
| 13 canonical domains | ✅ intact | `src/domains/*.ts` = 13 |
| Build health | ✅ clean | `@dbiz/functional-testing-engine` `tsc --noEmit` exit 0 |

**No architectural drift.** No defect discovered; no code modified.

## Phase 2 — Configuration readiness

| Item | Class | Note |
|---|---|---|
| `FTE_EXECUTION_PLANE_ENDPOINT` | **EXTERNAL / MISSING** | supplied at deployment (points to the customer Execution Plane) |
| `FTE_RUNTIME_BINDINGS` (real bound-ports module) | **MISSING (needs infra)** | supplies real translate / SPI / capability deps; binding is the one bounded step, done on infra availability |
| Signing key (ed25519, ADR-0007) | **PRESENT** (mechanism) / **EXTERNAL** (prod key) | `package-signing.ts`; production key from Key Vault (`deploy/azure/KEY_VAULT.md`) |
| Trust anchor (public key) | **EXTERNAL** | published to the EP tenancy (ADR-0036) |
| Certificates (TLS) | **EXTERNAL** | per environment |
| Credentials / secrets (AI key, PAT) | **EXTERNAL** | vault-stored; owner rotation pre-existing |
| Execution Plane endpoint | **EXTERNAL (customer)** | separate sovereign plane |
| Configuration files (Dockerfile, containerapp, config matrix) | **PRESENT** | `deploy/`, ADR-0052 §5 |

## Phase 3 — Operational dependencies (activation checklist)

- ☐ Execution Plane deployed + reachable — **EXTERNAL (customer)**
- ☐ Container runtime (E-2) — **MISSING (external)**
- ☐ Identity / access — **EXTERNAL**
- ☐ Secrets / key management — **EXTERNAL**
- ☐ Storage (evidence, EP custody) — **EXTERNAL**
- ☑ Observability / logging / metrics / correlation — **PRESENT** (`packages/observability`; traceId/correlationId threaded)
- ☐ Alerting — **EXTERNAL** (environment)
- ☐ Networking (IP→EP) — **EXTERNAL (customer)**
- ☑ Health / readiness endpoints — **PRESENT** (`observability/src/health.ts`, R-23.30)
- ☐ Bound ADR-0050 runtime ports — **MISSING (needs infra)**

## Phase 4 — Activation readiness dependency matrix

| Prerequisite | Status |
|---|---|
| Canonical runtime + launcher + import-graph | **READY** |
| Observability / health / readiness / correlation | **READY** |
| Signing mechanism (ed25519) | **READY** (prod key EXTERNAL) |
| Deployment package (Dockerfile / containerapp / runbook) | **READY** |
| Container runtime (E-2) | **EXTERNAL** (blocked; NOT MEASURED) |
| Execution Plane (deploy + reachability + health) | **EXTERNAL** (customer) |
| Bound ADR-0050 ports (translate / SPI / locator / signer) | **BLOCKED** on infra (bounded step, on availability) |
| Behavioural equivalence | **BLOCKED** (needs a real run) |
| Operational / change / customer / rollback approvals | **EXTERNAL** (governance/customer) |

## Phase 5 — Failure analysis (`npm run functionaltest`)

The launcher exits **1** with truthful, evidence-matched blockers — none repository, all external/operational:

| Blocker | Class | Evidence |
|---|---|---|
| Execution Plane endpoint unset | **EXTERNAL** | `FTE_EXECUTION_PLANE_ENDPOINT` unset; EP is the customer plane |
| ADR-0050 ports not bound | **EXTERNAL/OPERATIONAL** | no bindings module; ports injected/unbound |
| Container runtime (E-2) NOT MEASURED | **EXTERNAL** | GA probe searched 8 runtimes; none present |
| Governance | **NONE** | no governance blocker; deterministic red baseline = 5, all historical/by-design; RC-3 PASS |
| Repository | **NONE** | architecture intact; build clean; launcher verified canonical-only |

## Phase 6 — Cut-over (M5) readiness

| M5 prerequisite | Status |
|---|---|
| Gateway readiness (correctly NOT rerouted) | governed — **RC-3 PASS** (cut-over DEFERRED, legacy live) |
| Rollback readiness (`rollbackToLegacy`, ADR-0044) | **READY** (mechanism) |
| Behavioural equivalence prerequisites | **BLOCKED** (no real run; E-2 + EP absent) |
| Legacy dependency | legacy is the active runtime (replace-before-remove) |
| Operational / customer approvals | **EXTERNAL** (absent) |

**M5 prerequisites NOT satisfied.** `verify-runtime-cutover-readiness` = PASS (it correctly governs the deferral: `cutover-not-ready-legacy-live`). **M5 not performed.**

## Phase 7 — Legacy retirement (M6) readiness

Legacy still active ✅ · rollback still available ✅ · canonical ready (in-reference) ✅ · **cut-over completed ❌ (M5 has not occurred)**. `verify-legacy-retirement-readiness` LR-3 PASS (legacy retained).

**Result: `M6 NOT ELIGIBLE`** (cut-over has not occurred).

## Phase 8 — Executive readiness report

| Dimension | Status |
|---|---|
| **Engineering** | **COMPLETE** — canonical runtime/bridge/composer/SPI/13 domains verified; single launcher verified canonical-only; build clean |
| **Repository** | **COMPLETE** — no drift, no defect; governance deterministic reds = 5 (all historical/by-design; concurrent workstream resolved `implementation-traceability` + `operational-readiness`) |
| **Operational** | **NOT STARTED** — `functionaltest` honestly refuses (exit 1) pending infra |
| **Infrastructure** | **MISSING (external)** — E-2, EP, bound ports |
| **Activation** | **AWAITING EXTERNAL** — every non-external prerequisite READY |
| **Cut-over (M5)** | **DEFERRED / NOT READY** — RC-3 governs; prerequisites external/approvals |
| **Legacy** | **ACTIVE + rollback** — retained (replace-before-remove) |
| **GA** | **NOT CERTIFIED** — E-2 NOT MEASURED |

### Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| E-2 unavailable | High (now) | Blocks all | provision runtime (DAR-0001) |
| EP unreachable / contract mismatch | Medium | High | verify EP + contract version |
| Signature canonicalization mismatch | Medium | High | byte-match EP verifier; publish trust anchor |
| Locator resolution insufficient at M4.5 | Medium | High | validate app-model resolver; invent no selectors |
| Behavioural drift at cut-over | Medium | High | equivalence suite before M5; `rollbackToLegacy` |
| Concurrent workstream baseline churn mis-read | Medium | Low | cite current deterministic baseline; run gates standalone |

### Remaining actions (all external / separately authorised — no repository work)

1. Provision E-2 container runtime (DAR-0001).
2. Deploy the certified package (ADR-0052 runbook).
3. Connect a reachable non-production Execution Plane.
4. Bind the ADR-0050 runtime ports (author the `FTE_RUNTIME_BINDINGS` module against real infra).
5. Run `npm run functionaltest` (M4.5) → behavioural equivalence → M5 cut-over (ADR-0049 §6) → M6 retirement (ADR-0046).
6. Record operational / change / customer / rollback approvals.

## Final Verdict

**READY WITH EXTERNAL BLOCKERS.**

The canonical Functional Testing architecture, launcher, runtime bridge, composer, SPI, evidence model, and 13
domains are intact, verified, and build clean; the single-command contract is conformant; governance is
green apart from the historical/by-design reds; and the launcher fails honestly on missing infrastructure with
truthful, external blockers. No repository defect exists and no repository work remains. Every unmet prerequisite
is external (E-2 runtime, reachable Execution Plane, bound ports) or a governance/customer approval.

> **Engineering is complete. Operational activation is awaiting external infrastructure and governance approvals.**

No production routing changed, no code was modified, no Execution Plane was simulated, and no success was
fabricated. GA remains NOT CERTIFIED; the legacy runtime remains the active production path and rollback. **M6 NOT ELIGIBLE** (cut-over has not occurred).
