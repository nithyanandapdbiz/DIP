# RELEASE-READINESS-001 — Executive Release Readiness & Cross-Team Handover

**Status:** FINAL · **Program status:** **READY WITH EXTERNAL DEPENDENCIES** · **Date:** 2026-07-29

> The single authoritative handover for the remaining Functional Testing platform work. **Governance/delivery
> only — no implementation, no repository modification.** Every statement is backed by repository evidence or
> verified environment observation; nothing is speculative.

---

## Executive Summary (for leadership)

**The Intelligence Plane implementation is complete, verified, and release-ready.** The canonical Functional
Testing runtime (13 domains), the modular bootstrap launcher (`npm run functionaltest`), the Runtime SPI,
Execution Package composer, evidence-by-reference and ed25519 signing pipelines, the developer experience
(dev container, `docker-compose.dev.yml` override, runtime-bindings generator, dev bootstrap), and executable
governance are all built and verified in-reference. No repository defect exists; the repository is under
controlled engineering freeze.

**Everything that remains is owned outside the Intelligence Plane** — by the Execution-Plane team, the
Platform-Providers team, Platform Engineering, and Governance. None of it is Intelligence-Plane engineering
work. The first real end-to-end run (`docker compose up --build` → `npm run functionaltest` → real browser →
evidence), behavioural equivalence, the M5 cut-over, M6 retirement, and GA all depend on:

1. **Execution-Plane Developer Edition image + test application** (Execution-Plane repo — not yet published).
2. **A container runtime** (Docker) and the local topology (Platform Engineering — not provisioned here).
3. **A small provider-configuration alignment** (`environment`/backend config vs the `DBIZ_PROVIDER_MODE`
   convention — Platform Providers + IP).
4. **Governance/customer approvals** for cut-over and GA.

**Overall program status: READY WITH EXTERNAL DEPENDENCIES.** There is no Intelligence-Plane blocker; the
program proceeds the moment the external owners deliver. **GA remains NOT CERTIFIED** and the legacy runtime
remains the active production path and rollback until the governed M5/M6 steps.

**Recommended next move:** the Execution-Plane team publishes the Developer Edition image + test app; Platform
Engineering provisions Docker and runs the validation; then behavioural equivalence and the M5/M6/GA governance
gates follow. Detailed matrices, dependency graph, risks, and Go/No-Go checklist are in the appendices.

---

## Appendix — Task 1: Release Readiness Matrix

| Subsystem | State | Evidence |
|---|---|---|
| Canonical runtime / 13 domains / bridge / composer / SPI | **READY** | ADR-0039–0050 certified in-reference; build clean |
| Modular bootstrap launcher (`npm run functionaltest`) | **READY** | FTL-001; verified canonical-only, honest-fail |
| Runtime-bindings generator | **READY** | self-check PASS (canonical-only, contract-satisfying) |
| Developer bootstrap / dev container / `docker-compose.dev.yml` | **READY** | present; `node --check` OK; production compose unmodified |
| Evidence-by-reference + ed25519 signing | **READY** | INV-1; ADR-0007; `package-signing.ts` |
| Governance compliance | **READY (with historical reds)** | deterministic reds 5 (historical/by-design); RC-3 PASS |
| Execution-Plane Developer Edition image | **BLOCKED** | external repo (`carlislehomes`); not published |
| Developer Test Application | **BLOCKED** | external repo; not published |
| Platform-provider config alignment | **READY WITH DEPENDENCIES** | mechanism exists; `DBIZ_PROVIDER_MODE`↔`environment` mismatch to align |
| Container runtime (E-2/Docker) | **BLOCKED** | absent in environment |
| End-to-end integration / functional execution | **BLOCKED** | depends on the above |
| Behavioural equivalence | **BLOCKED** | depends on a successful run |
| M5 cut-over / M6 retirement / GA | **BLOCKED / NOT ELIGIBLE** | gated on the above + approvals; E-2 NOT MEASURED |

## Appendix — Task 2: Cross-Team Ownership Matrix

| Work item | Owner | Repository | Deliverable | Depends on | Acceptance criteria | Evidence required |
|---|---|---|---|---|---|---|
| EP Developer Edition | Execution Plane Team | `carlislehomes` | `Dockerfile.dev` + image + health/readiness + SPI endpoint + browser exec + signature verify + evidence | — | health 200; verifies IP-signed package; returns evidence by reference | build + health logs |
| Developer Test App | Execution Plane Team | `carlislehomes` | deterministic browser-executable app + stable dataset | — | repeatable state; browser-drivable | deploy logs |
| Provider config alignment | Platform Providers + IP | IP `platform-providers` / dev artifacts | set `environment=local` + backend config (not `DBIZ_PROVIDER_MODE`) | schema | Local providers selected in dev; no prod regression | config diff + a boot log |
| Container runtime + Compose | Platform Engineering | infra | Docker/Compose/networks/volumes/certs/DNS/monitoring | — | `docker info` ready; E-2 measurable | provisioning evidence |
| Dev adapter modules | EP/dev topology | dev | signer/transport/providers/locator/request | dev EP + test app | generated bindings import + run | module + a run log |
| Behavioural equivalence | Platform Eng + SE (advisory) | IP/infra | legacy vs canonical comparison | successful run | equivalent (declared diffs only) | paired run records |
| M5 / M6 / GA | Governance | IP governance | cut-over / retirement / GA decisions | equivalence + approvals | readiness gates green + approvals | gate output + sign-offs |

## Appendix — Task 3: Integration Dependency Graph & Critical Path

```
Intelligence Plane (READY) ─┐
Platform Providers (align)  ─┤
Execution Plane Dev Edition ─┼─► Infrastructure (Docker) ─► Functional Execution ─► Behavioural
Developer Test App ─────────┘        (WS D)                    (compose up + run)     Equivalence
                                                                                          │
                                                                                          ▼
                                                                        Production Readiness (M5→M6→GA)
```

**Critical path:** **EP Developer Edition image** (external repo) → **Docker provisioning** (infra) →
`docker compose up` → `npm run functionaltest` → behavioural equivalence → M5 → M6 → GA. The EP Developer
Edition is the pacing item (it is a build-and-publish deliverable owned by another team); Docker is a parallel
prerequisite. Provider alignment + dev adapter modules are small and parallelizable.

## Appendix — Task 4: Risk Register

| Risk | Prob. | Impact | Mitigation | Owner | Exit criteria |
|---|---|---|---|---|---|
| EP Developer Edition not delivered | Med | High | prioritize the EP dev image; reuse the ADR-0035 generated EP surface | Execution Plane Team | image published + healthy |
| No container runtime | High (now) | High | provision Docker (dev + CI) | Platform Engineering | E-2 measurable |
| Provider-config mismatch (`DBIZ_PROVIDER_MODE`) | Med | Med | align dev config to `environment`/backend schema | Platform Providers + IP | Local providers selected, no prod regression |
| Signature canonicalization mismatch (IP↔EP) | Med | High | byte-match verifier; publish trust anchor (ADR-0036) | EP + Security | EP accepts a signed package |
| Behavioural drift at equivalence | Med | High | equivalence suite before M5 | Platform Eng | equivalent; declared diffs only |
| "No-mock" rule violated to force a green run | Low | Critical | enforce real EP only; no simulated responses | All | real evidence only |
| Concurrent baseline churn reddens `programme-closure` | Med | Low | that workstream re-cuts; cite the deterministic baseline; run gates standalone | Provider-platform workstream | closure green after their re-cut |

## Appendix — Task 5: Go/No-Go Checklist

| Item | Status | Evidence | Blocking dependency | Owner |
|---|---|---|---|---|
| IP runtime + launcher + generator + dev tooling | ✅ GO | files present; self-checks pass | — | IP |
| Governance (no net-new reds; RC-3) | ✅ GO | reds 5 historical; RC-3 PASS | — | Governance |
| EP Developer Edition image healthy | ❌ NO-GO | not published | EP repo | Execution Plane Team |
| Test application deployed | ❌ NO-GO | not published | EP repo | Execution Plane Team |
| Provider config aligned | ⚠ CONDITIONAL | mechanism exists; mismatch noted | schema alignment | Platform Providers + IP |
| Container runtime provisioned | ❌ NO-GO | Docker absent | infra | Platform Engineering |
| End-to-end run succeeds | ❌ NO-GO | not runnable here | all above | Platform Engineering |
| Behavioural equivalence | ❌ NO-GO | no successful run | run | Platform Eng |
| M5 / M6 / GA approvals | ❌ NO-GO | none recorded | equivalence + approvals | Governance |

## Appendix — Task 6: Consolidated Findings (deduplicated, actionable only)

1. **[External repo]** EP Developer Edition image + test app not published — Execution Plane Team.
2. **[Infrastructure]** No container runtime (E-2/Docker) — Platform Engineering.
3. **[Integration]** Provider-selection mismatch: dev artifacts set `DBIZ_PROVIDER_MODE`; platform-providers keys on `environment`/`config.*.backend` — align (Platform Providers + IP).
4. **[Binding]** Dev adapter modules (signer/transport/providers/locator/request) not authored — dev topology.
5. **[Governance — non-blocking hygiene]** ADR-0052 template drift (IP) + ADR-0037 template (historical) sit in already-red `adr-completeness`/`change-control`; deferred, not a defect.
6. **[Governance — concurrent]** `programme-closure` periodically red from the concurrent ADR-0060 baseline churn (the duplicate ADR-0051 was renumbered to 0060) — that workstream re-cuts; not FT content.
7. **[Production]** GA / M5 / M6 gated on a real customer Execution Plane + approvals (irreducible — data sovereignty).

*(Duplicates across DEVX-0001 / CROSSPLANE-001 / INTEGRATION-001 / PE-HANDOFF-001 / ARCH-REVIEW removed; the
above are the distinct, actionable items.)*

## Appendix — Task 7: Executive Handover

- **Current status:** Intelligence Plane complete + frozen; remaining work external. READY WITH EXTERNAL DEPENDENCIES.
- **Completed scope:** canonical runtime + 13 domains; launcher + modular bootstrap + generator + dev tooling; SPI/evidence/signing; governance; developer experience (IP share).
- **Outstanding scope:** EP Developer Edition + test app; container runtime; provider alignment; dev adapters; end-to-end validation; behavioural equivalence; M5/M6/GA.
- **Critical path:** EP dev image → Docker → run → equivalence → M5 → M6 → GA.
- **Recommended execution order:** (1) EP publishes the dev image + test app; (2) Platform Eng provisions Docker; (3) align provider config; (4) author dev adapters; (5) run WS E/F; (6) equivalence; (7) M5/M6/GA under governance.
- **Estimated effort by owner (indicative — a delivery team calibrates; no calendar dates fabricated):** Execution Plane Team **L** (dev EP image + test app); Platform Engineering **M** (Docker + validation runs); Platform Providers **S** (config alignment); IP/dev **S–M** (dev adapters, coordinate); Governance **M** (equivalence review + approvals). Timeline is **infrastructure-lead-time-bound, not engineering-bound.**

## Final Verdict

**READY WITH EXTERNAL DEPENDENCIES.** The Intelligence Plane is release-ready and verified with no repository
defect; the remaining work is entirely owned by external repositories, Platform Engineering, and Governance.
The program is **not RELEASE READY** (an actual end-to-end execution has not occurred and cannot occur here),
and it is **not merely BLOCKED** (there is no Intelligence-Plane blocker to clear) — it awaits external delivery.
GA remains NOT CERTIFIED; the legacy runtime remains the active production path and rollback. No implementation
or repository code was changed by this exercise.
