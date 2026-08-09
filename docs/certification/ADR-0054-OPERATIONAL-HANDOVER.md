# ADR-0054 — Operational Handover & First Execution Readiness

**Status:** COMPLETE (handover package) · **Verdict:** REPOSITORY ENGINEERING COMPLETE · OPERATIONAL PREPARATION COMPLETE · DEPLOYMENT PENDING · **Date:** 2026-07-29

> The consolidated operational-ownership package for the first real execution of the
> canonical Functional Testing runtime. **This ADR prepares operations; it does not perform
> them** — no deployment, no execution, no cut-over, no retirement. It changes no
> implementation, architecture, contract, governance rule, runtime, or gateway route, and
> alters no existing ADR. It fabricates no runtime evidence, simulates no deployment, and
> claims neither behavioural equivalence nor production readiness. Every figure is
> re-derived from disk (programme-closure PASS; GA NOT CERTIFIED; deterministic baseline 6 — see the §4 reconciliation note on concurrent drift observed during authoring).

---

## 1. Executive Programme Summary (Phase 1)

| ADR | Objective | Scope | Deliverables | Impl status | Cert status | Depends on | Operational relevance |
|---|---|---|---|---|---|---|---|
| 0039 | Re-found Functional Testing across 13 domains | Capability 1 internals, behind the frozen 12-stage boundary | 13 domains + 52 fault proofs | **Built** | **CERTIFIED in-reference** (13/13) | 0040 contracts | The runtime being handed over |
| 0040 | Canonical platform contract framework | `@dbiz/contracts` + `@dbiz/capability-framework` | 15 contracts frozen | **Built** | **COMPLETE** (15/15) | — | Contracts the runtime consumes |
| 0041–0043 | Concurrent governance track (output sovereignty / repo purity / executable traceability) | Governance laws | 3 ADRs + gates | Built | PROPOSED | — | Governs the repo; not FT runtime |
| 0044 | Capability activation & governed cut-over | Composition + reversible activation | canonical-capability, activation | **Built** | **MECHANISM CERTIFIED** | 0039 | Activation/rollback mechanism |
| 0045 | Production qualification mechanism | In-reference qualification harness | production-qualification | **Built** | **MECHANISM CERTIFIED**; real-env NOT MEASURED | 0044 | Qualification method |
| 0046 | Legacy retirement readiness | Evidence-gated retirement | legacy-retirement + gate | **Built** | **DEFERRED** (7/9 unmet) | runtime, approvals | Retirement gate (§9) |
| 0047 | Canonical runtime architecture | Reuse-first integration design | 14-section blueprint | **Design** | PROPOSED | — | Blueprint for M1–M6 |
| 0048 | Runtime integration M1–M3 | Composer + SPI + bridge | 3 components + gate | **Built** | **CERTIFIED in-reference** | 0047 | The bridge to the EP |
| 0049 | Runtime cut-over (M5) | Readiness gate; gateway NOT rerouted | cutover-readiness + gate | **Built** | **DEFERRED** (9/10 unmet) | M4, approvals | Cut-over gate (§8) |
| 0050 | Runtime enablement (M4) | 4 runtime-infra components, injected ports | translator/adapter/transport/evidence + gate | **Built** | **CERTIFIED in-reference**; M4.5 NOT MEASURED | 0048 | Infra for first execution |
| 0051 | Production readiness review | M5 readiness assessment | 14-section review | **Review** | **NO GO for M5** | E-2, EP, approvals | Why M5 is not ready |
| 0052 | First deployment readiness | Deployment package | 10-output package | **Package** | **PACKAGE READY; deploy NO GO** | E-2, EP, approvals | Deployment runbook |
| 0053 | Governance reconciliation | Drift audit + baseline recalculation | 10-section report | **Docs** | **RECONCILED (documented)** | — | Open governance items (§10) |

**Net:** every ADR-0039…0052 deliverable is built or designed and certified to the extent measurable in-reference; ADR-0053 reconciled the governance record. **No ADR claims real-runtime, production, or GA success.**

## 2. Architecture Summary (Phase 8: architecture complete ✓)

Frozen and unchanged: 6 capabilities (R-11.4), one 12-stage lifecycle (R-12.18), the governance triad (R-12.2), 6 canonical tenant states (R-21.5), 15 platform contracts (ADR-0040), IP-authors→EP-executes cross-plane model (INV-1, evidence by reference), Decision Engine as sole authority, Connector SPI as sole integration boundary. The canonical runtime integrates **additively** (ADR-0047) — no frozen contract modified, no domain redesigned. **Architecture: COMPLETE.**

## 3. Implementation Summary (Phase 8: implementation complete ✓)

Built and certified in-reference: 13 domains; canonical composition + activation/rollback; qualification, retirement-readiness and cut-over-readiness harnesses; the M1–M3 bridge (composer, SPI, entry-point bridge); the M4 runtime infrastructure (translator, live application-strategy adapter with real locator resolution, EP transport, evidence return channel) with external boundaries as **injected ports**. All 54 FT source/test files carry TRACEABILITY blocks. **The one bounded implementation step NOT done** (out of every prior ADR's scope): binding those injected ports to real infrastructure. **Implementation: COMPLETE in-reference; port-binding PENDING.**

## 4. Governance Summary (Phase 8: governance + reconciliation complete ✓)

Governance is executable and gate-enforced. Current **deterministic** baseline = **6 reds**: adr-completeness, ai-vendor-neutrality, change-control-completeness, governance-self-validation, operational-readiness, intent-conservation (all historical / by-design). One transient appears only under parallel `run-all`. `verify-programme-closure` PASS. **Governance: COMPLETE; reconciliation documented (open items in §10).**

> **Reconciliation note (concurrent drift observed during this ADR's authoring, 2026-07-29):** ADR-0053 recorded a deterministic baseline of **7** (its 7th red, `implementation-traceability`, from a concurrent workstream's `platform-providers` files lacking TRACEABILITY blocks). **During the authoring of this ADR, that concurrent workstream acted on the ADR-0053 recommendations on disk:** it added the TRACEABILITY blocks (→ `implementation-traceability` now **PASS**) and **renumbered its duplicate `ADR-0051-cloud-native-provider-platform` to `ADR-0060`** (→ the duplicate-0051 collision is **resolved**; only the Functional Testing `ADR-0051-production-readiness-review` remains at 0051). The baseline is therefore now **6** (verified standalone), and `verify-programme-closure` was re-cut to capture both this ADR and the concurrent changes now on disk. This drift originates entirely in the concurrent workstream; this ADR resolved nothing on their behalf — it records the state as found. (A numbering **gap 0055–0059** now exists because the concurrent renumber jumped to 0060; that is the concurrent workstream's to note.)

## 5. Operational Handover Guide (Phase 2)

| Domain | Requirement | Classification | Source |
|---|---|---|---|
| Runtime prerequisites | A container runtime (Docker/Podman/containerd/K8s) — **E-2** | **ENVIRONMENT (MISSING)** | `deploy/azure/E2_EVIDENCE.md` |
| Infrastructure | Registry + image + Key Vault + ingress | ENVIRONMENT PROVIDED | `deploy/Dockerfile`, `deploy/azure/{CONTAINER_APPS,KEY_VAULT,APPLICATION_GATEWAY}.md` |
| Networking | IP→EP path; gateway currently binds loopback `127.0.0.1` | CUSTOMER PROVIDED | cross-plane contract (doc 20) |
| Certificates | TLS per environment; published trust anchor | ENVIRONMENT PROVIDED | ADR-0036 |
| Secrets | Signing key, AI key, PAT — vault-only (AI/PAT owner rotation pre-existing) | CUSTOMER/ENVIRONMENT PROVIDED | `deploy/azure/KEY_VAULT.md` |
| Configuration | `IP_EXECUTE_PORT`=4611, `IP_AUTHORING`, EP endpoint, tenant profile | ENVIRONMENT/CUSTOMER PROVIDED | `ip-execute-gateway.mjs` |
| Signing | ed25519 detached (ADR-0007); canonicalization must byte-match the EP verifier | IMPLEMENTED | `packages/tenant-onboarding-engine/src/engine/package-signing.ts` |
| Observability | Telemetry + readiness (readiness ≠ liveness, R-23.30) + append-only audit | IMPLEMENTED | `packages/observability/src/health.ts` |
| Monitoring | traceId/correlationId threaded; SLO/dashboards present; per-attempt retry telemetry is deployment-edge | IMPLEMENTED (partial edge) | `packages/observability` |
| Rollback | Canonical is not the live path → gateway stays on legacy; post-M5 `rollbackToLegacy` | IMPLEMENTED | ADR-0044 |

## 6. First Execution Checklist — M4.5 (Phase 3)

Execute **only** when a runtime and a reachable Execution Plane exist. Prepared, **not executed.**

- ☐ **Runtime available** — E-2 measured PASS (container runtime present).
- ☐ **Execution Plane reachable** — non-prod EP responds; contract version compatible (R-20.24/25).
- ☐ **Injected ports bound** — `TranslationProviders`, `LocatorResolver`, transport `send`/`verifyResponseSignature` bound to real infrastructure, wired as a **non-default** entry (never replacing the gateway default).
- ☐ **Package signing verified** — detached ed25519 produced; canonicalization byte-matches the EP verifier; trust anchor published.
- ☐ **Evidence storage verified** — evidence returned **by reference**; payloads remain in EP custody (INV-1).
- ☐ **Correlation verified** — correlation id preserved request→package→verdict→evidence.
- ☐ **Observability enabled** — telemetry emitting; readiness green; audit append-only.
- ☐ **Rollback verified** — a failed first-run leaves the gateway on legacy (no production traffic affected).

**Refusal scenarios already fault-proved in-reference (ADR-0050 RE-2):** unsigned package, correlation mismatch, missing evidence, retry/timeout ignored, IP browser execution → each refused. M4.5 validates **infrastructure only — not behavioural equivalence (§7).**

## 7. Behavioural Equivalence Procedure (Phase 4) — prepared, NOT executed; NO equivalence claimed

- **Inputs:** for each representative scenario, the **identical** `ExecutionRequest` run through (a) the legacy runtime and (b) the canonical runtime (post live locator resolution).
- **Expected outputs:** equivalent execution intent, equivalent evidence-reference contract, equivalent defect/report semantics.
- **Comparison method:** field-by-field diff of the execution package (operations/selectors/actions after live resolution), execution intent, evidence references, defect records, reporting model.
- **Acceptance criteria:** same execution intent + same evidence-reference contract + same defect/report semantics; the one **declared** internal-representation difference (from the ADR-0039 rebuild) is documented and acceptable.
- **Rollback criteria:** any **undeclared** difference, any evidence payload crossing the boundary, or any IP browser execution → FAIL → do not cut over.
- **Required evidence:** the paired real-run records with correlation ids; **not producible now** (the canonical has never run real; packages are abstract-vs-concrete until live locator resolution). **No equivalence is claimed.**

## 8. Cut-over Readiness — M5 (Phase 5)

Each ADR-0049 prerequisite classified:

| M5 prerequisite | Class |
|---|---|
| M1–M3 bridge certified (ADR-0048) | **READY** |
| External contracts verified unchanged | **READY** |
| Container runtime (E-2) | **ENVIRONMENT** (blocked) |
| Execution Plane reachable | **CUSTOMER** (blocked) |
| Real translator port bound | **IMPLEMENTATION** (bounded step) |
| Real EP-dispatch adapter bound | **IMPLEMENTATION** |
| Real EP transport bound | **IMPLEMENTATION** |
| Behavioural equivalence demonstrated | **BLOCKED** (depends on the above) |
| Governance approval | **APPROVAL** |
| Stakeholder approval | **APPROVAL** |
| Executive approval | **APPROVAL** |

**Verdict:** `cutover-not-ready-legacy-live` — 9 of 10 preconditions unmet; the gateway routes to legacy. RC-3 keeps the gateway un-rerouted. **No cut-over recommended.**

## 9. Legacy Retirement Readiness — M6 (Phase 6)

ADR-0046 preconditions reconfirmed:

| Precondition | State |
|---|---|
| Canonical activation certified | met (mechanism) |
| Qualification certified | met (mechanism) |
| Real runtime available | **BLOCKED** (E-2) |
| Production activation performed | **BLOCKED** |
| Stability window complete | **BLOCKED** |
| Rollback window expired | **BLOCKED** |
| Governance + stakeholder + executive approval | **BLOCKED** (APPROVAL) |

**Verdict:** `retirement-not-ready-legacy-retained` — 7 of 9 unmet. Legacy is retained as the rollback path. **No retirement is recommended** (replace-before-remove).

## 10. Open Governance Items (Phase 7) — informational only; resolved by no one here

Status as found on disk at this ADR's authoring (two ADR-0053 items were **resolved by the concurrent workstream during authoring** — see §4 reconciliation note):
1. **Duplicate ADR-0051 — RESOLVED (by the concurrent workstream).** It renumbered `ADR-0051-cloud-native-provider-platform` → `ADR-0060`; only `ADR-0051-production-readiness-review` (Functional Testing) remains at 0051. A numbering **gap 0055–0059** now exists (the renumber jumped to 0060) — informational, owned by the concurrent workstream.
2. **ADR template normalization — STILL OPEN.** `ADR-0037` (historical) and **`ADR-0052` (Functional Testing / mine)** miss enforced sections. *Recommendation only; not resolved here.*
3. **TRACEABILITY ownership — RESOLVED (by the concurrent workstream).** `platform-providers/src/index.ts` and its conformance test now carry TRACEABILITY blocks; `implementation-traceability` PASS.
4. **Harness stabilization — STILL OPEN.** Per-gate temp dirs, serialize the fault recorder vs `run-all`, standalone-confirm before reporting RED. *Recommendation to the tooling owner.*

## 11. Operational Risk Register

| Risk | Likelihood | Impact | Mitigation | Rollback |
|---|---|---|---|---|
| E-2 runtime unavailable | High (now) | Blocks all | provision runtime | n/a (no deploy) |
| EP unreachable / contract mismatch | Medium | High | verify EP + contract version | do not reroute |
| Signature canonicalization mismatch | Medium | High | byte-match EP verifier; publish trust anchor | do not reroute |
| Locator resolution insufficient at M4.5 | Medium | High | validate app-model resolver; invent no selectors | do not reroute |
| Behavioural drift | Medium | High | equivalence suite (§7) before cut-over | `rollbackToLegacy` |
| Premature cut-over / retirement | Low | High | RC-3 + retirement gate block | gates block |
| Governance drift mis-read as regression | Medium | Medium | cite the current deterministic 6-baseline (§4); run gates standalone; concurrent workstreams re-cut closure after their changes | — |

## 12. Final Operational Readiness Verdict

**REPOSITORY ENGINEERING COMPLETE · OPERATIONAL PREPARATION COMPLETE · DEPLOYMENT PENDING.**

Operations receive a complete package — programme summary, handover guide, M4.5 checklist, equivalence procedure, cut-over and retirement readiness, risk register — executable the moment the external prerequisites exist. **No deployment was performed, no runtime evidence fabricated, no behavioural equivalence or production readiness claimed.** The legacy runtime remains live and recoverable.

## 13. Programme Closure Statement (Phase 8)

| Milestone | Status |
|---|---|
| **Repository Engineering Complete** | ✅ **YES** — ADR-0039…0053 built/designed, certified in-reference, governance reconciled |
| **Operational Preparation Complete** | ✅ **YES** — this ADR + ADR-0052 package |
| **Deployment** | ⏳ **PENDING** — E-2 + infrastructure |
| **Runtime Validation (M4.5)** | ⏳ **PENDING** — E-2 + reachable EP + port-binding |
| **Production Cut-over (M5)** | ⏳ **PENDING** — equivalence + approvals |
| **Legacy Retirement (M6)** | ⏳ **PENDING** — production run + stability window + approvals |
| **GA Certification** | ⏳ **PENDING** — E-2 PASS evidence (NOT MEASURED; probe searched 8) |

**The programme's engineering is complete; everything downstream of it is gated on external dependencies — a runtime environment, a reachable Execution Plane, a bounded port-binding step, and approvals — none of which this ADR may fabricate. GA remains NOT CERTIFIED.**
