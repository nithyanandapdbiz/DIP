# Board Governance Approval Package

**Date:** 2026-07-23 · **For:** Architecture Review Board · Programme Steering Committee · **Status: FOR APPROVAL — adopts nothing**
**Prepared by:** Programme Governance (consolidation of existing registers) · **Governance discovery: CLOSED after this package**

> This package **consolidates** completed governance work into one submission. It performs **no new review**, reuses prior registers as authoritative evidence, and **adopts nothing**. Both actions remain **PROPOSED**. All canonical documents — `CHARTER`, Doc 18, `DECISIONS.md`, `MASTER_ROADMAP.md`, `NEXT_ACTION.md` — remain authoritative and **unchanged** until the Board records a decision. Post-approval updates in §8 are **described, not performed**.

**Evidence base (authoritative — referenced, not duplicated):** `ENTERPRISE_RECONCILIATION_2026-07-23.md` · `PRODUCT_READINESS_ASSESSMENT_2026-07-23.md` · `PROGRAMME_OPERATING_MODEL_2026-07-23.md` · `PROGRAMME_GOVERNANCE_DECISION_D-023_PROPOSAL_2026-07-23.md` · `GOVERNANCE_LIFECYCLE_STANDARD_2026-07-23.md` · `GOVERNANCE_RESPONSIBILITY_MODEL_2026-07-23.md`

---

## 1. Executive summary (Deliverable 1)

Six governance reconciliations converged on one conclusion: **the architecture is sound and frozen; the only outstanding changes are organisational governance.** They reduce to **two ratifiable actions**, neither touching frozen architecture:

| ID | Action | Authority | Vehicle |
|---|---|---|---|
| **D-023** | Adopt the coordinated Engineering / Platform / Product operating model | Steering | `DECISIONS.md` entry |
| **GO-001** | CHARTER amendment: decision lifecycle · DIP · RACI · baseline-propagation rules · remove §9–11 duplication | ARB | CHARTER amendment |

**What changes:** *how the programme is organised and how decisions are governed* — three coordinated tracks, a defined decision lifecycle, named authority, a standard implementation-planning artefact.

**What does NOT change:** the 25-document frozen architecture, six capabilities, three Platform Services, EP/IP sovereignty, Doc 18's governance model, the 26 gates, the Definition of Done, and the GA computation (E-2 → CERTIFIED). **No ADR is modified; none is required.**

## 2. Evidence summary (Deliverable 2)

Each claim is settled by a prior register — cited, not repeated:

| Claim | Settled by | Key evidence |
|---|---|---|
| Architecture is frozen & certified | Reconciliation §1; closure gate | 25 docs / 417 criteria / 30 ADRs, gate PASS |
| The deployment→build dependency is **false** | D-023 proposal §2 | TLM stages 1–7 built & gated **with no runtime** (`packages/tenant-lifecycle`) |
| Reorder is admissible (not schedule pressure) | D-023 §2; `DECISIONS.md` P-008 | `MASTER_ROADMAP.md` §5 permits reorder when a dependency is wrong |
| Governance ownership is assigned & non-duplicated | Responsibility Model §3, §8 | `ARCHITECTURE_STATUS.md` §3 + integrity gate |
| The four additions belong in CHARTER, not Doc 18 | Responsibility Model §6 | none touches Doc 18's owned topics (gates/certification/conformance) → no ADR |
| One soft-duplication exists | Responsibility Model §5 (GO-1..3) | CHARTER §9–11 restate Doc 18 R-18.22–27 |

## 3. D-023 — Board proposal (Deliverable 3) · **Status: PROPOSED**

- **Decision ID:** D-023 · **Approval:** ARB + Steering
- **Context.** Architecture frozen; six capabilities + TLM built; 26 gates green; GA blocked solely by a container runtime; Platform/Product work sits behind that blocker in a single sequential roadmap.
- **Evidence.** §2 above; full analysis in the D-023 proposal register.
- **Problem.** The roadmap serialises Platform/Product **build** behind an Engineering **deployment** blocker they do not technically depend on — a false dependency, proven by TLM 1–7 running with no runtime.
- **Decision.** Evolve execution from sequential to **three coordinated workstreams inside one programme**, sharing one architecture, one governance model, one DoD, one release gate, one GA milestone. Engineering remains the sole GA-critical path; Platform Maturity and Commercial Readiness become continuous objectives.
- **Alternatives.** A (retain sequential) — rejected, perpetuates the false wait. B (three independent programmes) — rejected, forks governance/roadmap (P-008 breach), loses single-source-of-truth.
- **Benefits.** Removes opportunity cost; earliest coherent commercial readiness; clearer ownership; no idle workstreams.
- **Trade-offs.** Coordination overhead; disciplined convergence required (Product→Platform APIs→Engineering GA).
- **Dependencies preserved.** Product consumes Platform APIs; commercial operability converges on Engineering GA. Only the false deployment→build dependency is removed.
- **Risks.** PR-1 governance dilution · PR-2 product ahead of APIs · PR-3 progress misread as GA · PR-4 second roadmap · PR-5 unowned scope · PR-6 hand-authored dashboard — each mitigated (D-023 §8).
- **Implementation overview.** Per the DIP in §5.
- **Success measures.** Zero workstreams idle on a false dependency; GA still computed solely from E-2; per-track progress on a generated dashboard; no canonical document duplicated or forked.
- **Board approval required:** YES.

## 4. GO-001 — CHARTER amendment (Deliverable 4) · **Status: PROPOSED (text ready; NOT applied to CHARTER.md)**

**Purpose.** Assign the four implicit/missing governance ownerships and remove one soft-duplication, additively.
**Scope.** `CHARTER.md` only. No architecture document, no ADR, no frozen content.
**Reason.** Responsibility Model §6: these concern *how the organisation makes decisions* — CHARTER's domain, not Doc 18's.
**Sections affected.** New **§21 (Governance Lifecycle)**; clarifying edits to **§9, §10, §11**.

> **Proposed new CHARTER §21 — Governance Lifecycle** *(to be inserted on approval)*
>
> **21.1 Programme-decision lifecycle.** A programme decision progresses `DRAFT → PROPOSED → APPROVED → IMPLEMENTED → VERIFIED → BASELINED`, with terminal branches `SUPERSEDED · REJECTED · WITHDRAWN · PROHIBITED`. Entry/exit criteria per `GOVERNANCE_LIFECYCLE_STANDARD` §4. This **adds in-flight states** to the `DECISIONS.md` legend; it does not alter the terminal states already defined there.
>
> **21.2 Decision Implementation Plan (DIP).** Every `APPROVED` programme decision that is **not itself an ADR** carries a DIP (ADRs already satisfy R-18.27). A DIP is an implementation-planning artefact, not architecture: affected documents/packages/ADRs/APIs, migration, rollback, verification gate, completion criteria.
>
> **21.3 Governance RACI.** ARB approves ADRs/architecture; Steering approves programme decisions and roadmap reorders; Chief Architect authorises baseline re-cut; Programme Manager owns register updates; Engineering/Quality/Security/Product leads own implementation and verification in their domain.
>
> **21.4 Baseline propagation.** An approved decision updates registers by the rules in `GOVERNANCE_LIFECYCLE_STANDARD` §8: status advances only on gate evidence (R-13.1); the closure baseline is re-cut deliberately (`emit-closure-package.mjs`), reviewed and committed — never silently.

> **Proposed clarifications (remove duplication — GO-1..3):**
> **§9** → replace the restated pipeline with: *"Every milestone passes the review pipeline defined in Doc 18 R-18.22–23."*
> **§10** → *"After every milestone, the technical-debt scan defined in Doc 18 R-18.25 is performed."*
> **§11** → *"Architecture decisions follow the change-control process in Doc 18 R-18.26–27."*

**New governance processes:** decision lifecycle, DIP, RACI, baseline propagation (§21.1–4).
**Implementation notes:** additive; §21 is new; §9–11 shrink to citations. No rule weakened.
**Backward compatibility:** full. Existing ACCEPTED decisions and ADRs are unaffected; the in-flight states are additive; the §9–11 rules are unchanged in force (only their canonical home is clarified to Doc 18).

## 5. Decision Implementation Plans (Deliverable 5)

**DIP for D-023**

| Field | Content |
|---|---|
| Affected registers | `DECISIONS.md` (+D-023), `MASTER_ROADMAP.md` (§1 parallel branch, per §5), `NEXT_ACTION.md` (per-track actions), `IMPLEMENTATION_STATUS.md` (track tag), `BACKLOG.md` (track column) |
| Affected architecture | **none** |
| Migration | Re-tag existing backlog to tracks; add parallel branch post-P3 with §5 justification |
| Rollback | Revert D-023 to REJECTED; roadmap reverts to sequential — no code affected (governance-only) |
| Verification | GA still computed from E-2; a "no idle-on-false-dependency" check on backlog state; dashboard generated |
| Completion criteria | D-023 ACCEPTED; registers reflect three tracks; dashboard live |

**DIP for GO-001**

| Field | Content |
|---|---|
| Affected documents | `CHARTER.md` (new §21; §9–11 clarified) |
| Affected architecture / ADRs | **none** |
| Migration | Insert §21; replace §9–11 restatements with citations |
| Rollback | Remove §21; restore §9–11 prose — reversible, text-only |
| Verification | `verify-architecture-integrity.js` / change-control gates still green (CHARTER is not gated architecture, but the citation edits reduce duplication the SSOT principle targets); confirm no rule lost |
| Completion criteria | §21 present; §9–11 cite Doc 18; no rule weakened |

## 6. Change impact assessment (Deliverable 6)

| Dimension | Impact |
|---|---|
| Architecture | **None** — frozen set untouched |
| Governance | Additive: +decision lifecycle, +RACI, +DIP, +baseline rules; −1 soft-duplication |
| Programme | Roadmap gains a parallel branch (via decision); state registers gain track tags |
| Engineering | **None to the GA path** — remains the sole GA-critical track |
| Platform | Unblocked to build now (config-lifecycle, APIs) — no longer waiting on runtime |
| Product | Unblocked to build behind Platform APIs |
| Operations | One generated dashboard; no new runtime component |
| Certification | **Unchanged** — same gates, same GA computation |
| Commercial readiness | Can progress continuously rather than post-GA |

## 7. Approval checklist (Deliverable 7)

| Check | State |
|---|---|
| Evidence complete (six registers) | ✔ |
| No architecture impact | ✔ |
| No ADR changes required | ✔ |
| No governance duplication introduced (one removed) | ✔ |
| No conflicting ownership (one owner per responsibility, §8 Resp-Model) | ✔ |
| Backward compatibility confirmed | ✔ |
| Verification defined (DIPs §5) | ✔ |
| Both actions remain PROPOSED | ✔ |
| EP/IP sovereignty preserved | ✔ |

## 8. Post-approval action plan (Deliverable 8) — **described, not performed**

On the Board recording approval:
1. `DECISIONS.md` — add **D-023** (ACCEPTED) to §2. *(Chief Architect / PM)*
2. `CHARTER.md` — insert **§21**; clarify §9–11 to citations. *(Chief Architect)*
3. `MASTER_ROADMAP.md` — add the post-P3 parallel branch with its §5 justification. *(PM)*
4. `NEXT_ACTION.md` — regenerate to per-track next actions (GA stays the engineering one). *(PM)*
5. `IMPLEMENTATION_STATUS.md` / `BACKLOG.md` — add the track tag/column. *(Eng Lead)*
6. **Regenerate the governance baseline** — `emit-closure-package.mjs` (deliberate re-cut), then `run-all.js` to confirm green. *(Quality)*
7. Execute verification — confirm 26 gates green and GA still computed from E-2. *(Quality)*

**None of these is done here.** They are the ordered consequence of approval.

## 9. Board decision record (Deliverable 9)

| Field | Value |
|---|---|
| **Decision summary** | Adopt the coordinated tri-track operating model (D-023) and the governance-lifecycle CHARTER amendment (GO-001) |
| **Recommended resolution** | **APPROVE both**, additively; no architecture or ADR change |
| **Approval authority** | D-023 → Steering Committee · GO-001 → Architecture Review Board |
| **Required signatories** | Chair, ARB · Chair, Steering · Chief Architect |
| **Effective date** | On record of approval (the post-approval plan §8 then executes) |
| **Conditions** | Both remain PROPOSED until signed; GA computation and the 26 gates unchanged; unowned items (portals/notification/feature-mgmt) still ADR-first |

*Resolution options for the record:* ▢ Approve both ▢ Approve D-023 only ▢ Approve GO-001 only ▢ Approve with amendments ▢ Reject ▢ Defer.

## 10. Final governance certification (Deliverable 10)

| Test | Result |
|---|---|
| Package complete (all 10 deliverables) | ✔ |
| Internally consistent (D-023 ↔ GO-001 ↔ prior registers) | ✔ |
| No new review performed; evidence reused | ✔ |
| Frozen architecture preserved | ✔ |
| Governance integrity preserved (executable, evidence-driven) | ✔ |
| Single-source-of-truth preserved (one soft-dup removed) | ✔ |
| EP/IP sovereignty preserved | ✔ |
| Existing verification model preserved (26 gates, GA from E-2) | ✔ |
| Both actions remain PROPOSED | ✔ |
| Suitable for ARB + Steering review | ✔ |

**Determination: the package is COMPLETE and Board-ready. It adopts nothing.** Governance discovery is closed; further work proceeds through Board approval and engineering execution, not additional analysis.

---

*Consolidation only. Reuses six prior registers as authoritative evidence; introduces no new governance content beyond the concrete GO-001 amendment text (itself PROPOSED). Preserves the frozen architecture, Doc 18's governance model, the six-capability / three-service / sovereignty models, and the verification model. Where this package and a canonical document disagree, the canonical document governs until the Board records a decision.*
