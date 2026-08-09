# PE-HANDOFF-001 — Platform Engineering Execution Delivery Backlog

**Status:** COMPLETE · **Type:** Delivery/PM package (no design, no code, no repository change) · **Date:** 2026-07-29

> Converts the PE-0001 design into an execution-ready backlog assignable to a real Platform Engineering
> organization. The software repository is COMPLETE and frozen; nothing here proposes repository
> modification. Effort figures are **indicative** relative sizing (S ≈ ≤2d, M ≈ 3–5d, L ≈ 1–2w, XL ≈ >2w);
> a delivery team calibrates to its own velocity. Customer-owned items are effort-unknown to us and are
> marked accordingly.

---

## Phase 1 & 2 — Work Breakdown Structure organized as Epics

Fields per work item: **Inputs → Outputs · Deps · Effort · Owner · Acceptance / Exit.**

### PE-EPIC-01 — Runtime Environment (E-2) *(critical-path start)*
| ID | Title / Objective | Inputs → Outputs | Deps | Effort | Owner | Acceptance / Exit |
|---|---|---|---|---|---|---|
| WI-01.1 | Provision container runtime + registry — a supported OCI host (Container Apps/AKS/…) | cloud subscription → running runtime + registry | — | M | Cloud Eng | `docker info`/cluster ready; E-2 probe measurable |
| WI-01.2 | Build + push IP image | `deploy/Dockerfile` → image in registry | 01.1 | S | Platform Eng | image builds; pushed; pull-able |
| WI-01.3 | Deploy IP container | image, `containerapp.yaml` → running IP | 01.2 | M | Platform Eng | container up; `/health` responds |

### PE-EPIC-02 — Execution Plane *(customer-owned)*
| WI-02.1 | Deploy non-production Execution Plane | customer env → running EP | — | Customer (unknown) | Customer | EP process running |
| WI-02.2 | Expose EP health + confirm contract version | EP → health 200, version | 02.1 | S | Customer | `/health` 200; contract compatible (R-20.24/25) |
| WI-02.3 | EP reachable from the IP | networking → reachability | 02.1, EPIC-04 | S | Customer/Networking | IP can reach the EP endpoint |

### PE-EPIC-03 — Identity & Certificates
| WI-03.1 | Provision Key Vault + store ed25519 signing key | subscription → KV + key | 01.1 | M | Security | key retrievable via managed identity |
| WI-03.2 | Managed identity + least-privilege key access | KV → identity binding | 03.1 | S | Security | IP reads key; nothing else can |
| WI-03.3 | TLS certificates + mTLS IP↔EP | CA → certs installed | EPIC-04 | M | Security | TLS handshake; mutual auth |
| WI-03.4 | Publish trust anchor to the EP tenancy (ADR-0036) | public key → EP trust store | 03.1, 02.1 | S | Security/Customer | EP verifies an IP-signed test package |
| WI-03.5 | Secret rotation policy (+ pre-existing AI-key/PAT owner rotation) | policy → rotation runbook | 03.1 | S | Security | rotation documented + scheduled |

### PE-EPIC-04 — Networking
| WI-04.1 | DNS for the EP endpoint | zone → resolvable name | — | Networking | Networking | name resolves |
| WI-04.2 | Private networking IP→EP + firewall allow-list | topology → private path | 01.1, 02.1 | M | Networking | egress IP→EP only; deny else |
| WI-04.3 | Ingress to the IP gateway; timeouts/retries/pooling | gateway → ingress | 01.3 | S | Networking | ingress healthy; policy applied |

### PE-EPIC-05 — Runtime Bindings *(the infra seam)*
| WI-05.1 | Implement `runtime-bindings.mjs` (4 `// PE:` points: KV signer, HTTPS EP transport+verify, live locator resolver, real providers) using the existing factories | PE-0001 §3 template, factories → bindings module | 03.1, 04.2, 02.1 | L | Platform Eng (SE advisory) | module exports `buildDependencies`/`buildRequest`; **no mock**; loads (OAP-0002 AT-3) |
| WI-05.2 | `buildRequest()` from the real work item source | project data → `RuntimeExecutionRequest` | 05.1 | S | Platform Eng | valid request built from real inputs |
| WI-05.3 | Set `FTE_EXECUTION_PLANE_ENDPOINT` + `FTE_RUNTIME_BINDINGS` | endpoints/paths → config | 05.1 | S | Platform Eng | both set; launcher passes prereq gate |

### PE-EPIC-06 — Observability
| WI-06.1 | Central logging + correlation | in-package emitters → aggregated logs | 01.3 | M | Operations | logs flowing with correlationId |
| WI-06.2 | Metrics + distributed tracing + dashboards | telemetry → dashboards | 06.1 | M | Operations | traceId end-to-end; dashboards live |
| WI-06.3 | Alerting + health monitoring | SLOs → alerts | 06.2 | S | Operations | alerts fire on synthetic fault |

### PE-EPIC-07 — Operational Validation
| WI-07.1 | Run acceptance tests AT-1…AT-7 (OAP-0002 §4) | env → pass results | EPIC-01..05 | M | Platform Eng | all AT green |
| WI-07.2 | **First execution:** `npm run functionaltest` against the real EP | config → exit 0 + evidence | 07.1 | M | Platform Eng | exit 0; package signed+dispatched; EP accepts; evidence by reference verified; correlation preserved |
| WI-07.3 | Behavioural equivalence (canonical vs legacy, identical scenarios) | two runs → diff report | 07.2 | L | Platform Eng + SE (advisory) | intent/evidence/defect/report equivalent; declared diffs documented; no undeclared diff |

### PE-EPIC-08 — Production Readiness (M5 → M6 → GA)
| WI-08.1 | Stability observation window + operational metrics | runs → stability record | 07.2 | L | Operations | window complete; metrics within SLO |
| WI-08.2 | Approvals (operational/change/customer/rollback) | evidence → sign-offs | 07.3 | M | Governance/Customer | all recorded |
| WI-08.3 | M5 cut-over decision (ADR-0049 §6) — separate governed change | readiness → gateway reroute | 08.1, 08.2 | M | Governance/Platform Eng | `assessCutoverReadiness = cutover-ready`; then reroute + `rollbackToLegacy` proven |
| WI-08.4 | M6 legacy retirement (ADR-0046) — after cut-over + stability | evidence → retirement | 08.3 | M | Governance | `assessLegacyRetirementReadiness = retirement-ready` |
| WI-08.5 | GA determination (E-2 PASS + successful runs) | evidence → GA | 08.1 | S | Governance | GA gate recomputes CERTIFIED iff E-2 PASS |

## Phase 3 — RACI (by epic)

| Epic | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| 01 Runtime (E-2) | Cloud Eng | Platform Eng Lead | Architecture | Governance |
| 02 Execution Plane | Customer | Customer | Platform Eng, Architecture | Governance |
| 03 Identity & Certs | Security | Platform Eng Lead | Customer (trust anchor) | Operations |
| 04 Networking | Networking | Platform Eng Lead | Security, Customer | Operations |
| 05 Runtime Bindings | Platform Eng | Platform Eng Lead | Software Eng (advisory) | Architecture |
| 06 Observability | Operations | Platform Eng Lead | Platform Eng | Governance |
| 07 Operational Validation | Platform Eng | Platform Eng Lead | Software Eng (advisory), Customer | Governance |
| 08 Production Readiness | Governance | Exec Sponsor | Operations, Customer, Platform Eng | All |

*Software Engineering is **Consulted/advisory only** — the repository is frozen; SE acts only on a proven defect.*

## Phase 4 — Dependency graph & critical path

```
[01 E-2 runtime] ─┬─────────────► [05 Bindings] ─► [07.1 AT] ─► [07.2 first exec] ─► [07.3 equivalence]
                  │                    ▲                                                    │
[02 EP (customer)]┼──────► [02.3 reachable] ──────┘                                         ▼
                  │                                                        [08.1 stability]+[08.2 approvals]
[03 Identity/Certs]┤                                                                        │
[04 Networking] ───┘                                                          [08.3 M5] ─► [08.4 M6]
[06 Observability] (parallel, feeds 07/08)                                     [08.5 GA] ◄─ (E-2 PASS)
```

- **Critical path:** 01 → (03 ∥ 04 ∥ 02) → 05 → 07.1 → 07.2 → 07.3 → 08.1/08.2 → 08.3 → 08.4; GA (08.5) gated on E-2 PASS + successful runs.
- **Parallelizable:** 02 (customer), 03, 04, 06 run concurrently after 01 starts.
- **External dependencies:** E-2 runtime (Cloud/Platform), Execution Plane (Customer), approvals (Governance/Customer).
- **Approval gates:** before 08.3 (M5) and 08.4 (M6).
- **Rollback points:** any failure ≤ 07.2 → no production impact (gateway on legacy); post-08.3 → `rollbackToLegacy`.

## Phase 5 — Go/No-Go gates (objective)

| Gate | Pass condition |
|---|---|
| G1 Infrastructure Ready | E-2 measurable; IP deployed; `/health` green (AT-1) |
| G2 Execution Plane Healthy | EP `/health` 200; contract compatible (AT-2) |
| G3 Bindings Configured | module loads; env set; launcher passes prereq gate (AT-3/6/7) |
| G4 Smoke Test Pass | signing + transport reachability verified (AT-4/5) |
| G5 Functional Test Pass | `npm run functionaltest` → exit 0 + verified evidence (WI-07.2) |
| G6 Behavioural Equivalence | equivalent; only declared diffs (WI-07.3) |
| G7 M5 Approval | readiness + all approvals (WI-08.2/08.3) |
| G8 M6 Approval | cut-over complete + stability (WI-08.4) |
| G9 GA | E-2 PASS + successful runs (WI-08.5) |

*No gate may be skipped; each is evidence-gated. Failing a gate → stop, triage (infra/config/operational/security/network), remediate.*

## Phase 6 — Risk register

| Risk | Likelihood | Impact | Owner | Mitigation | Fallback | Escalation |
|---|---|---|---|---|---|---|
| E-2 runtime unavailable | High (now) | Blocks all | Cloud Eng | provision early (critical path) | delay program | Exec Sponsor |
| Execution Plane not deployed | High | Blocks G2+ | Customer | joint customer planning (DAR-0001) | pause at G1 | Governance/Customer |
| Signature canonicalization mismatch | Medium | High | Security | byte-match EP verifier; publish anchor (03.4) | fix + retest | Platform Eng Lead |
| Locator resolution insufficient | Medium | High | Platform Eng | validate app-model resolver at G5; invent no selectors | refine providers | Architecture |
| Behavioural drift at G6 | Medium | High | Platform Eng | equivalence suite before M5 | stay on legacy | Governance |
| Bindings tempt-to-mock (rule violation) | Medium | Critical | Platform Eng Lead | enforce "no mock EP"; real infra only | block G5 | Governance |
| Approvals delayed | Medium | Medium | Governance | early stakeholder alignment | hold at G7 | Exec Sponsor |
| Concurrent-repo governance drift misread | Low | Low | Platform Eng | cite current deterministic baseline; gates standalone | re-derive | Architecture |

## Phase 7 — Executive dashboard

| Dimension | Status |
|---|---|
| **Overall program** | Software Engineering **COMPLETE**; Platform Engineering execution **NOT STARTED** (awaiting infra) |
| **Repository** | **COMPLETE / FROZEN** — no defect; governance green apart from historical/by-design reds |
| **Infrastructure** | **NOT PROVISIONED** — E-2, EP, identity, networking all pending (external) |
| **Operational** | **NOT STARTED** — `npm run functionaltest` honestly refuses pending infra |
| **Critical risks** | E-2 unavailability; Execution Plane deployment (customer); approvals |
| **Remaining milestones** | G1→G9 (infra → EP → bindings → smoke → functional → equivalence → M5 → M6 → GA) |
| **Estimated completion** | Indicative only — **infrastructure-lead-time-bound**, not engineering-bound; dominated by E-2 provisioning + customer EP + the equivalence/stability windows; a delivery team sets calendar dates against its velocity and the customer plan |
| **GA readiness** | **NOT CERTIFIED** — computed; unlocks only on E-2 PASS + successful runs |

## Recommendation

The remaining program is fully broken down into an execution-ready backlog (8 epics, work items with
acceptance/exit criteria), RACI, a critical-path dependency graph, objective Go/No-Go gates, and a risk
register — assignable to a Platform Engineering organization with **no further architectural analysis**. No
repository modification is proposed; none is supported by evidence.

> **"Software Engineering work is complete. Platform Engineering execution is now the critical path."**

GA remains NOT CERTIFIED; the legacy runtime remains the active production path and rollback until the governed M5/M6 steps.
