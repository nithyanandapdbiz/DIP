# Programme Operating Model — Dual-Track Evolution (Proposal)

**Date:** 2026-07-23 · **Type:** additive programme register — **proposal**, not an adopted plan · **Complements:** `ENTERPRISE_RECONCILIATION_2026-07-23.md`, `PRODUCT_READINESS_ASSESSMENT_2026-07-23.md`

> This register **proposes** an operating-model evolution and classifies existing work. It does **not** change the sequence of work by itself. Under `MASTER_ROADMAP.md` §5, any reordering is adopted **only** by a recorded entry in `DECISIONS.md`. Until that entry exists, `MASTER_ROADMAP.md` and `NEXT_ACTION.md` remain authoritative and unchanged. This register references canonical documents and restates none (CHARTER §4).

---

## 1. Executive summary

The programme is run as **one sequential roadmap** (`MASTER_ROADMAP.md`) that terminates at P10 / General Availability. That was correct while every phase genuinely depended on the previous one. It is now encoding a **false dependency**: it places *all* remaining work behind the deployment blocker, when only the **engineering** work actually needs the container runtime and the Execution-Plane runtime. Platform-evolution and product-evolution work is **independent of deployment** and is currently stalled for no dependency reason.

`MASTER_ROADMAP.md` §5 permits re-planning precisely when "a dependency is discovered to be wrong." This is that case — and the roadmap already contains the parallelism principle (P4/P5 run in parallel because they share no code). **Recommendation: evolve from one sequential roadmap into three concurrent tracks — Engineering, Platform, Product — that share one governance model, one architecture, and one dashboard, adopted via a `DECISIONS.md` entry.** GA stays a single engineering milestone; Platform Maturity and Commercial Readiness become continuous objectives.

## 2. Programme assessment — the dependency truth

| Work | Needs the deployment blocker? | Track |
|---|---|---|
| EP runtime · container runtime · deployment probe (E-2) · stages 8–14 · GA · production validation | **Yes** | **Engineering** |
| Configuration-lifecycle service · management/Platform APIs · tenant-config lifecycle · operational-monitoring surface · responsibility matrix | **No** — Intelligence-Plane, build now | **Platform** |
| Portals · licensing/entitlements · feature management · user-role self-service · admin/CX · analytics | **No to build** (some consume Platform APIs) | **Product** |

**Convergence point.** Tracks are parallel in *build* but convergent at *commercial operability*: no tenant can actually execute a QA capability until the Engineering track lands the EP runtime, and Product portals consume Platform-track APIs. Parallelism removes false waiting; it does not remove real dependencies.

## 3. Engineering workstream (Deliverable 3)

**Owner:** engineering · **Milestone:** GA (unchanged) · **Authoritative next step:** `NEXT_ACTION.md`

| Item | State | Blocker |
|---|---|---|
| Container runtime | Absent | External (the one true dependency) |
| Execution-Plane runtime | NOT STARTED (`CarlisleHomes_ExecutionPlane/`, Doc 04) | Runtime + build |
| Deployment probe E-2 · health · smoke · stages 8–14 | PENDING, never assumed (ADR-0030 §4.4) | Runtime |
| GA determination | Computed, not written — `CERTIFIED` iff E-2 `PASS` | E-2 |
| Production validation (G-2/G-3) | Unmeasured | Deployed cluster |

This track is **already correctly governed** by `NEXT_ACTION.md`. The proposal changes nothing here except to stop it from blocking the other two.

## 4. Platform workstream (Deliverable 4)

**Owner:** Platform Core (Intelligence Plane) · **Rule:** complete existing before creating new (CHARTER §4) · **No new architecture document**

| Item | Canonical owner | State | Verdict |
|---|---|---|---|
| Configuration-lifecycle service (versioning/promotion/rollback/audit) — *"Configuration Intelligence Service"* | Doc 15 + **AD-031** (open) | Model built; lifecycle absent | **Build — highest-value deployment-independent P0** |
| Management / Platform APIs (Tenant, Config, Lifecycle, Admin, Reporting) | Platform Core (ADR-0021 §4) | CLI + mTLS gateway only | Create (reuse TLM/identity/generation) |
| Tenant-config lifecycle | Doc 15 scope chain | Resolution built; lifecycle absent | Complete existing |
| Operational-monitoring surface | Doc 23 + `observability` | Metrics built; no operator console | Complete existing |
| Enterprise Responsibility Matrix | `ARCHITECTURE_STATUS.md` §3 + Doc 19 | Exists | Reference — do not duplicate |
| Knowledge graph (B-006) · cert-report generation (B-015) · secret backend (B-013) | Docs 11/18/08 | NOT STARTED | Build |

## 5. Product workstream (Deliverable 5)

**Owner:** product · **Rule:** unowned items require an ADR *before* build

| Item | Owner | State | Business value | Verdict |
|---|---|---|---|---|
| Customer / Operator / Support / Partner portals | *none* | None | High — CX, self-service | **ADR-scope first**, then build (consumes Platform APIs) |
| Licensing / entitlements | Platform Core owns "licensing" (ADR-0021 §4) | Config only (R-15.5) | High — monetisation | Complete existing |
| Feature management | *none* | None | Medium | **ADR-scope first** |
| User / role self-service | Doc 08 (authz exists) | No surface | Medium | Complete existing |
| Analytics | Doc 24 (Platform Intelligence) | Built (intelligence); no product analytics UX | Medium | Complete existing |
| Marketplace | *none* | None | Future | P4 / ADR-scope |

## 6. Backlog classification (Deliverable 6)

Additive re-tagging of existing `BACKLOG.md` items — **no item invented, none removed**:

| # | Item | Track | Note |
|---|---|---|---|
| B-006 | Knowledge graph | Platform | P4 |
| B-007 | Reporting/evidence surface | Platform→Product | consumes intelligence |
| B-008 | Tenant onboarding | **Engineering/Platform — done (1–7)** | ADR-0030, TLM built |
| B-009 | Cost/AI-spend per tenant | Product (commercial) | — |
| B-010 | Observability | Platform — largely done | `observability` |
| B-011 | DR / evidence durability | Engineering | P10, needs runtime |
| B-012 | Perf/load characterisation | Engineering | needs cluster (G-2) |
| B-013 | Secret backend | Platform | D-003 sibling |
| B-014 | Supply-chain pipeline | Engineering | P10 |
| B-015 | Cert-report generation | Platform | — |
| *new (from assessment)* | Config-lifecycle · mgmt API · portals · licensing · feature-mgmt · user-role | Platform / Product | see §4–5; unowned → ADR-first |

## 7. Programme dashboard design (Deliverable 8)

**Constraint: the dashboard SHALL be generated, never hand-authored** (R-13.1, ADR-0018 §4.3) — reuse `governance/verification/generate-scorecard.js`; track-progress is derived from backlog state + gate output, not typed.

```
┌── DBiz Platform Programme ──────────────────────────────────────────┐
│ Architecture Stability │ FROZEN · 25 docs/417 crit · closure gate ✔ │
│ Engineering (→ GA)     │ IP runtime ✔ · TLM 1–7 ✔ · GA NOT CERTIFIED│
│ Platform Maturity      │ config model ✔ · lifecycle ✗ · APIs ✗       │
│ Product Readiness      │ onboarding CLI ✔ · portals ✗ · licensing ✗ │
│ Commercial Readiness   │ NOT READY (gated on Eng + Platform APIs)    │
│ Operational Readiness  │ health/SLO ✔ · operator console ✗          │
│ Customer Readiness     │ onboarding 1–7 auto · end-to-end PENDING    │
│ Confidence indices     │ ERI 18/21 · GCI 97% · RCI 100% (generated)  │
└─────────────────────────────────────────────────────────────────────┘
```

Each cell sources an **existing generated metric** (ERI/GCI/RCI, gate results, maturity) or a backlog-derived count. It adds a *view*, not a new measurement.

## 8. Proposed operating model (Deliverable 9)

- **One architecture, one governance, three tracks.** Every track item still passes the same review pipeline (CHARTER §9) and the same 26 gates. Tracks are **views over one governed backlog**, not forks — this is what keeps single-source-of-truth intact.
- **CHARTER §12 unchanged.** Each track still "determines the next task from programme state"; three concurrent next-actions, not one, does not violate the loop.
- **`NEXT_ACTION.md` gains two peers** (Platform next-action, Product next-action) while keeping GA as *the* engineering action — or splits into a small next-action set. Adoption vehicle: `DECISIONS.md`.
- **GA = engineering milestone. Platform Maturity & Commercial Readiness = continuous objectives**, each measured by a generated index (maturity model exists; a product-readiness measure is added *with its measurement*, per R-15.2).

## 9. Prioritised roadmap (Deliverable 10)

- **Phase 1 — Engineering completion / GA:** container runtime → EP runtime → E-2 → stages 8–14 → GA. *(critical path, unchanged)*
- **Phase 2 — Platform evolution (parallel, now):** config-lifecycle service (close AD-031) → management/Platform APIs → operator surface. *(deployment-independent)*
- **Phase 3 — Product evolution:** admin/CX → portals (ADR-scoped) → licensing/entitlements → user-role → feature-mgmt (ADR-scoped). *(consumes Phase-2 APIs)*
- **Phase 4 — Scale:** partner enablement → marketplace → demonstrated 100→1000-tenant scale.

## 10. Risks (Deliverable 11)

| # | Risk | Mitigation |
|---|---|---|
| PR-1 | Parallel tracks dilute single-source governance | Tracks are views, not forks; one dashboard, same gates |
| PR-2 | Product built ahead of Platform APIs | Enforce §9 order — portals consume Phase-2 APIs |
| PR-3 | Platform/Product progress misread as GA progress | Dashboard keeps GA a distinct engineering cell; GA stays computed from E-2 |
| PR-4 | This register drifts into a second roadmap | Adopt via `DECISIONS.md`; reference `MASTER_ROADMAP.md`, never fork it |
| PR-5 | Unowned items (portals, feature-mgmt) built without scope | ADR-first gate before any such build |
| PR-6 | Hand-authored dashboard becomes status theatre | Dashboard generated from existing metrics (R-13.1) |

## 11. Recommendations (Deliverable 12)

1. **Adopt the tri-track model via a `DECISIONS.md` entry** (the §5 vehicle), justified as false-dependency correction — not schedule pressure.
2. Keep **GA as the sole engineering milestone**; make Platform Maturity and Commercial Readiness continuous, each with a generated measure.
3. **Re-tag `BACKLOG.md` additively** with a track column (§6); promote config-lifecycle + management API to active Platform items.
4. Build order within Platform: **config-lifecycle → management API → then Product portals**.
5. **Route all unowned items through ADRs** before build (portals, notification, feature management).
6. **Generate the dashboard**; do not hand-maintain it.

## 12. Programme certification / status (Deliverables 13–15)

Stated from evidence — no verdict granted here:

| Dimension | Status | Source |
|---|---|---|
| Architecture | **FROZEN / CERTIFIED** | closure gate ✔ (25/417/30) |
| Engineering | **GA NOT CERTIFIED** (runtime dep); IP runtime + TLM(1–7) verified | `NEXT_ACTION.md`, 26 gates |
| Platform | **Partial** — model strong, lifecycle services absent | Doc 15, §4 |
| Product | **Early** — no product surface | §5 |
| Commercial | **Not ready** | §2 convergence |
| Customer readiness | Onboarding 1–7 automated; end-to-end PENDING | ADR-0030 |
| GA | **NOT CERTIFIED**, computed from E-2 | deployment evidence |

---

*Preserves the frozen architecture, the six-capability model, the three Platform Services, and EP/IP sovereignty. Proposes no new architecture document and no ADR modification. The tri-track model is a **proposal** until adopted by a `DECISIONS.md` entry per `MASTER_ROADMAP.md` §5; where a canonical document and this register disagree, the canonical document governs.*
