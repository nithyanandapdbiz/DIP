# Programme Governance Decision Proposal — D-023

## Adopt a coordinated tri-track (Engineering / Platform / Product) operating model

**Date:** 2026-07-23 · **Status: PROPOSED — awaiting approval** · **Type:** additive governance proposal
**Approval required from:** Architecture Review Board (ARB) · Programme Steering Committee
**Complements:** `PROGRAMME_OPERATING_MODEL_2026-07-23.md` (analysis), `PRODUCT_READINESS_ASSESSMENT_2026-07-23.md`, `ENTERPRISE_RECONCILIATION_2026-07-23.md`

> **This document does not adopt anything.** It is a proposal for programme approval. `MASTER_ROADMAP.md`, `NEXT_ACTION.md`, `IMPLEMENTATION_STATUS.md` and `DECISIONS.md` remain authoritative and **unchanged** until the ARB records an accepted decision. No implementation begins on the basis of this document. It creates no architecture, modifies no frozen ADR, and forks no roadmap (CHARTER §4; `DECISIONS.md` P-001, P-008).

---

## 1. Executive summary

The programme runs one sequential roadmap ending at GA. Evidence shows it now serialises **Platform** and **Product** work behind an **Engineering deployment blocker** those workstreams do not technically depend on. This is a **false dependency**, not schedule pressure — the distinction that determines admissibility under `DECISIONS.md` **P-008** (reordering is permitted *only* when a dependency is found wrong).

**Recommendation: Option C — one programme, three coordinated workstreams**, sharing one architecture, one governance model, one Definition of Done, one release gate, one GA milestone. GA stays the sole engineering-critical path; Platform Maturity and Commercial Readiness become continuous, independently-progressing objectives.

**Decision required:** ARB/Steering approve, reject, or amend. On approval, `D-023` is recorded ACCEPTED and the mechanical changes in §9 are applied — by the Board, not by this document.

## 2. Evidence review (validated, not assumed)

The statement under test: *"the roadmap introduces unnecessary waiting by placing Platform and Product evolution behind Engineering completion even though most remaining work has no deployment dependency."*

| Source | What it shows | Bearing on the statement |
|---|---|---|
| `MASTER_ROADMAP.md` §1 | Post-P3 is "strictly sequential" **except P4/P5**, which run in parallel "because they share no code" | Serialisation is real **and** the parallelism principle already exists — precedent |
| `MASTER_ROADMAP.md` §5 / P-008 | Reorder only when a dependency is wrong; never for schedule | Sets the admissibility test this proposal must pass |
| `ARCHITECTURE_BASELINE.md` | 25 docs / 30 ADRs / 417 criteria **frozen**; contracts v1.0.0 | The "stable contracts" precondition Platform/Product build needs **is satisfied** |
| ADR-0030 §2 + `packages/tenant-lifecycle` (built, gated, 26th gate) | TLM stages **1–7 execute in the Intelligence Plane with no runtime**; 8–14 report PENDING | **Direct proof** that IP platform work is deployment-independent — it was just built that way |
| `PROJECT_STATE.md` §9 blockers | Every blocker is E-2 / G-1…G-5 / K-12…K-15 — all **runtime/deployment/observed-customer** | None of them blocks building config-lifecycle, APIs, or admin surfaces |
| `IMPLEMENTATION_STATUS.md` | Config-lifecycle, management APIs, portals, licensing = NOT STARTED; **none marked blocked-by-runtime** | Absence of build, not presence of dependency |
| `NEXT_ACTION.md` | "single dependency… a runtime… no further milestone exists before it" | Confirms the serialisation — and that it is an **engineering-track** statement |

**Verdict: the statement is SUBSTANTIALLY CORRECT, with one required refinement.** The deployment dependency on Platform/Product *build* is false (proven by TLM 1–7). But two dependencies are **real and must be preserved**: (a) Product portals consume Platform-track **management APIs** (intra-programme), and (b) commercial **operability** — a tenant actually executing a capability — still converges on Engineering GA (the EP runtime). So: **eliminate the false deployment dependency; keep the real contract/API and operability dependencies.**

## 3. Options analysis

| Dimension | **A — Retain sequential** | **B — Three independent programmes** | **C — One programme, three coordinated workstreams** |
|---|---|---|---|
| Architecture | Unchanged | Risks divergence (separate DoD) | **Unchanged, one set** |
| Governance | Unchanged, but perpetuates false wait | **Forks governance** — violates one-model rule | **One model, shared gates** |
| Implementation | Platform/Product idle until post-GA | Duplicated pipelines | **Parallel build, reuse-first** |
| Customer | Commercial features delayed by unrelated blocker | Inconsistent surfaces | **Earliest coherent readiness** |
| Commercial | Readiness gated on engineering | Fragmented product | **Progresses independently** |
| Operational | Simple but slow | 3× operational overhead | **One dashboard, one release** |
| Risk | Opportunity cost; morale | **Competing roadmaps (P-008 breach), lost SSOT** | Coordination risk — mitigated §8 |
| Maintainability | Degrades as backlog grows behind GA | Poor — three sources of truth | **High — views over one backlog** |
| **Verdict** | Reject — perpetuates a false dependency | **Reject — breaches mandatory rules** | **RECOMMENDED** |

Option B is rejected on the mandatory rules directly: it creates competing roadmaps and parallel governance, dissolving the single-source-of-truth the programme exists to protect.

## 4. Recommendation

**Adopt Option C.** It is the only option that eliminates the false dependency while satisfying every success criterion: architecture unchanged, governance preserved, no canonical duplication, Engineering the sole GA path, Platform and Product independently progressable, real dependencies intact, governance made *clearer* (three named tracks) rather than more complex.

## 5. Draft `DECISIONS.md` entry (for §2 of that file, on approval)

> **Paste target:** `DECISIONS.md` §2, as `D-023`, **only after ARB/Steering approval**, with status changed PROPOSED → ACCEPTED. Until then it lives here.

---
**D-023 — Coordinated tri-track programme operating model**
**Status:** PROPOSED *(→ ACCEPTED on approval)* · **Date:** 2026-07-23 · **Approval:** ARB + Programme Steering Committee

- **Context.** Architecture frozen; six capabilities + TLM built; 26 gates green; GA blocked solely by a container runtime. Platform and Product work sits behind that blocker in a single sequential roadmap.
- **Problem.** The roadmap serialises Platform/Product build behind an Engineering deployment blocker they do not technically depend on — a false dependency (proven: TLM stages 1–7 run with no runtime).
- **Decision.** Evolve programme execution from sequential to **three coordinated workstreams — Engineering, Platform, Product — inside one programme**, sharing one architecture, one governance model, one Definition of Done, one release gate and one GA milestone. Engineering remains the sole GA-critical path. Platform Maturity and Commercial Readiness become continuous objectives.
- **Alternatives.** A (retain sequential) — rejected, perpetuates the false wait. B (three independent programmes) — rejected, forks governance/roadmap (P-008) and loses single-source-of-truth.
- **Rationale.** `MASTER_ROADMAP.md` §5 permits reordering when a dependency is wrong; §1 already runs P4/P5 in parallel. This extends an existing principle on evidence, not schedule (clears P-008).
- **Benefits.** Removes opportunity cost; earliest coherent commercial readiness; clearer ownership; no idle workstreams.
- **Trade-offs.** Coordination overhead; requires disciplined convergence (Product→Platform APIs→Engineering GA).
- **Risks / mitigations.** See §8 (PR-1…PR-6): tracks are views not forks; ADR-first for unowned items; GA stays computed from E-2; dashboard generated.
- **Dependencies preserved.** Product consumes Platform APIs; commercial operability converges on Engineering GA (EP runtime). Only the *deployment→build* dependency is removed.
- **Consequences.** `MASTER_ROADMAP.md` gains a parallel branch post-P3 (recorded per §5); `NEXT_ACTION.md` gains per-track next-actions; `IMPLEMENTATION_STATUS.md` gains a track tag; dashboard generated. No architecture, capability, service, or sovereignty change.
- **Implementation guidance.** Complete-existing before create-new (CHARTER §4); unowned items (portals, notification, feature management) require a scoping ADR before build; build order Platform→Product (APIs before portals).
- **Success measures.** Zero workstreams idle on a false dependency; GA still computed solely from E-2; Platform/Product progress visible on a generated dashboard; no canonical document duplicated or forked.
- **Review criteria.** Revisit if a real cross-track dependency is discovered, if the single dashboard cannot be generated, or if any track drifts toward a second source of truth.
---

## 6. Updated programme governance model (if approved)

One architecture · one governance · one DoD · one release gate · one GA — **three execution views** over one governed backlog. Every track item still passes the same review pipeline (CHARTER §9) and the same 26 gates. CHARTER §12 is unchanged: each track "determines its next task from programme state." Full model, dashboard design and workstream detail already reside in `PROGRAMME_OPERATING_MODEL_2026-07-23.md` §7–8 — **referenced, not restated.**

## 7. Workstream definition (summary; detail in the operating-model register §3–5)

| | **Engineering** | **Platform** | **Product** |
|---|---|---|---|
| Objective | Reach GA | Platform maturity | Commercial readiness |
| Owner | Engineering | Platform Core (IP) | Product |
| Scope | EP runtime, container runtime, deploy, GA | config-lifecycle, mgmt/Platform APIs, operator services | portals, licensing, entitlements, user/feature mgmt |
| Inputs | frozen contracts + runtime | frozen contracts | Platform APIs |
| Outputs | platform that would reach GA certification | admin/config services | customer surfaces |
| Dependencies | container runtime (external) | none (build) | Platform APIs; operability → Engineering GA |
| Exit criteria | E-2 PASS → GA | services gated + generated | surfaces + ADR-scoped |
| Success metric | GA reached (target; E-2 PASS → GA) | maturity index ↑ (generated) | product-readiness index ↑ (generated) |

## 8. Impact assessment

**Changes if approved:** roadmap gains a documented parallel branch (via the decision, per §5); NEXT_ACTION gains per-track peers (GA stays *the* engineering action); IMPLEMENTATION_STATUS gains a track tag; a generated tri-track dashboard is wired. **Unchanged:** the 25-document frozen architecture, six capabilities, three Platform Services, EP/IP sovereignty, the 26 gates, the Definition of Done, and the GA computation (unchanged: only an E-2 PASS would let the determination read CERTIFIED).

**Risks:** PR-1 governance dilution → tracks are views, one dashboard, same gates · PR-2 product ahead of APIs → enforce build order · PR-3 progress misread as GA → GA stays a distinct computed cell · PR-4 second roadmap → adopt via decision, never fork · PR-5 unowned scope → ADR-first · PR-6 hand-authored dashboard → generated only.

## 9. Transition plan (post-approval — Board actions, not taken here)

1. ARB/Steering review this proposal; approve / reject / amend.
2. **On approval only:** record `D-023` ACCEPTED in `DECISIONS.md` §2; add the parallel branch to `MASTER_ROADMAP.md` §1 with its §5 justification; re-tag `BACKLOG.md` with a track column; add per-track next-actions to `NEXT_ACTION.md`; wire the generated dashboard into `generate-scorecard.js`.
3. No build on unowned items (portals, notification, feature management) until their scoping ADRs land.

## 10. Success criteria (self-check against the mandate)

✓ Architecture unchanged · ✓ existing governance preserved · ✓ no canonical document duplicated · ✓ Engineering the only GA-critical path · ✓ Platform can progress independently · ✓ Product can progress independently · ✓ real dependencies (APIs, operability) preserved · ✓ false (deployment→build) dependency eliminated · ✓ governance clearer (three named tracks), not more complex.

---

*Proposal only. Preserves the frozen architecture, six-capability model, three Platform Services and EP/IP sovereignty. Adoption requires an ARB/Steering decision recorded as `D-023` in `DECISIONS.md`; where a canonical document and this proposal disagree, the canonical document governs until that decision is recorded.*
