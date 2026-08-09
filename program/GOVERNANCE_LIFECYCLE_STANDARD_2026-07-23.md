# Enterprise Governance Lifecycle Standard (Additive)

**Date:** 2026-07-23 · **Type:** additive programme standard — **proposal for the prescriptive parts** · **Status of new process elements: PROPOSED**
**Complements:** Doc 18 (governance model, FROZEN), CHARTER, `DECISIONS.md`, `GOVERNANCE_BASELINE.md`, `PROGRAMME_GOVERNANCE_DECISION_D-023_PROPOSAL_2026-07-23.md`

> **This standard does not govern — it standardizes.** Governance authority lives in Doc 18 (the model), CHARTER (how the org operates), and the executing gates. This register (a) **maps** the lifecycle already implicit across those canonical artefacts and (b) **proposes** the few missing connective pieces. The descriptive map is additive documentation. The prescriptive additions (§4 decision states, §7 DIP, §11 RACI) bind *how the organisation operates* and are therefore **PROPOSED**, to be adopted through their proper versioned vehicle — a **CHARTER amendment**, and an **ADR under R-18.26** for any element that touches Doc 18. Nothing here is in force on creation. Where this standard and a canonical document disagree, the canonical document governs.

---

## 1. Executive summary

The platform does not need more architecture reviews; it needs the governance it **already runs** written down as one traceable lifecycle. Three status lifecycles already exist and interlock — they have simply never been drawn as one:

- **Architecture documents:** `NOT STARTED → DRAFT → REVIEWED → CANONICAL → FROZEN` (`ARCHITECTURE_STATUS.md`)
- **Implementation:** `NOT STARTED → IN PROGRESS → BUILT → VERIFIED → CERTIFIED` (`IMPLEMENTATION_STATUS.md`)
- **Decisions:** `ACCEPTED · SUPERSEDED · REJECTED · PROHIBITED` (`DECISIONS.md`)

**One genuine gap, found firsthand.** The decision legend carries only *terminal* states — no `DRAFT`/`PROPOSED`/`APPROVED`. That is why the D-023 governance proposal had **no governed status to occupy** and had to be parked in a register. The single highest-value change in this standard is to add **in-flight decision states**, so a proposal is a first-class, traceable governed object rather than a document in limbo.

Everything else — ADR lifecycle, verification, certification, audit, metadata — **already exists** and is referenced, not rebuilt.

## 2. Governance assessment (Deliverable 2 / Section 1) — what exists, mapped

| Governance domain | Canonical owner | Executing mechanism | State |
|---|---|---|---|
| Architecture governance | Doc 18, Doc 01 §3 | `verify-architecture-integrity/-fitness`, freeze + closure baseline | **Complete** |
| Change control (post-freeze) | Doc 18 R-18.26–29 | `verify-adr-completeness`, `verify-change-control-completeness` | **Complete** |
| Programme governance | CHARTER, `DECISIONS.md`, `MASTER_ROADMAP.md` §5 | ADR/decision index, P-008 | **Gap: in-flight decision states** |
| Implementation governance | CHARTER §9/§14, `IMPLEMENTATION_STATUS.md` | review pipeline (R-18.22), status legend | **Complete (DIP unstandardized)** |
| Verification governance | Doc 18 §3–4, `GOVERNANCE_BASELINE.md` | 26 gates, 27 fault proofs, NOT RUN≡FAIL | **Complete** |
| Release / certification | Doc 18 §5, ADR-0020 | deterministic gates, ERI/GCI/RCI, decay | **Complete** |
| Baseline management | closure baseline, ADR-0030 §7 | `verify-programme-closure`, `baseline.json` | **Gap: update rules implicit** |
| Metadata / evidence | Rule 13 (R-13.2 envelope), R-14.4 provenance | evidence envelope on every measurement | **Complete for evidence; gap for governed-artefact headers** |
| Roles / authority | *implicit* | — | **Gap: no RACI** |

Four gaps, all narrow and additive: (a) in-flight decision states, (b) a standardized DIP, (c) explicit baseline-update rules, (d) a RACI. The rest is reference.

## 3. Unified governance lifecycle (Deliverable 3) — the map

One decision, traced end to end, reusing the existing states:

```
 PROPOSAL ── evidence ─▶ REVIEW ─▶ APPROVED ─▶ IMPLEMENTED ─▶ VERIFIED ─▶ BASELINED
 (new)                   (ARB)      (new)       (BUILT)        (gate)      (closure re-cut)
    │                                                                          │
    └────────────── audit trail (immutable provenance, R-14.4) ───────────────┘
        terminal branches: SUPERSEDED · REJECTED · WITHDRAWN · PROHIBITED (DECISIONS.md legend)
```

The middle of this chain is **already governed** (BUILT→VERIFIED→closure baseline). Only the front (`PROPOSAL/REVIEW/APPROVED`) is unmodelled today — the additive contribution.

## 4. Decision lifecycle model (Deliverables 4, 6 / Sections 2, 4) — PROPOSED

**Add in-flight states to the programme-decision legend** (extends, does not replace, the `DECISIONS.md` legend):

| State | Entry criterion | Exit criterion | Evidence required | Authority |
|---|---|---|---|---|
| `DRAFT` | An owner and a problem statement | Options + evidence attached | problem, context | proposer |
| `PROPOSED` | Evidence + options + impact assessment complete | ARB review scheduled | evidence review, options analysis, impact (cf. D-023) | proposer |
| `APPROVED` | ARB/Steering ratify; clears P-008 (no schedule-pressure reorder) | DIP created | approval record: actor, date, reason | ARB + Steering |
| `IMPLEMENTED` | DIP executed | verification gate green | code/docs per DIP | Engineering/Platform/Product lead |
| `VERIFIED` | Gate observed to pass, fault-proved (R-18.11) | closure re-baseline | machine-readable proof | Quality/Governance |
| `BASELINED` | Closure baseline re-cut (deliberate, ADR-0030 §7) | — | new `baseline.json` hash | Chief Architect |
| `SUPERSEDED`/`REJECTED`/`WITHDRAWN`/`PROHIBITED` | terminal | — | reason recorded | ARB |

**D-023 is the worked example:** it currently sits at `PROPOSED` and, under today's legend, had nowhere to be recorded — the exact gap this closes.

## 5. ADR lifecycle model (Deliverable 5 / Section 3) — reference, one addition

**Already governed by Doc 18 R-18.26–29** and `verify-adr-completeness.js`: creation → review → ACCEPTED → implementation → verification → baseline. Required artefacts (R-18.27): problem, context, alternatives, decision, consequences, migration strategy, version impact, affected components — **gate-enforced**. Supersession exists in the legend. **One additive clarification:** an ADR's `SUPERSEDED`/retirement transition SHALL name its successor ADR and trigger a closure re-baseline — otherwise a superseded ADR silently remains hashed as current.

## 6. Verification governance (Deliverable 8 / Section 6) — reference

**Fully exists.** 26 gates, each fault-proved (R-18.11, 27 proofs); `NOT RUN ≡ FAIL` (C-0.4); ≥3 independent mechanisms (R-18.14); certification deterministic + reproducible + input-recorded (R-18.19–20); re-verification and confidence decay (Rule 14); evidence regenerated, never read (`GOVERNANCE_BASELINE.md`). **No change proposed** — every governed decision's `VERIFIED` state binds to these.

## 7. Decision Implementation Plan (DIP) specification (Deliverable 7 / Section 5) — PROPOSED

Recommended **for every `APPROVED` programme decision that is not itself an ADR** (ADRs already carry migration/affected-components via R-18.27, so they need no DIP). A DIP is an **implementation-planning artefact, not architecture**.

| DIP field | Content |
|---|---|
| Decision ref | The `D-xxx` it implements |
| Affected documents / packages / ADRs / APIs | Explicit enumeration (reuses change-control-completeness discipline) |
| Migration · backward compatibility · rollback | How the change lands and unwinds |
| Verification gates | Which gate proves it; new gate + fault proof if none exists (D-012 atomicity) |
| Completion criteria | The `VERIFIED`→`BASELINED` conditions |

**D-023 §9 (transition plan) is a DIP in all but name** — this standardizes that shape so it is not re-invented per decision.

## 8. Baseline management model (Deliverable 9 / Section 7) — PROPOSED update rules

How an `APPROVED` decision propagates. **Rule: a baseline update is deliberate, reviewed, and re-hashed — never silent** (the closure gate exists to catch silent drift).

| Register | Update rule | Owner |
|---|---|---|
| `DECISIONS.md` | New `D-xxx`/ADR row on approval, with status | Chief Architect |
| `MASTER_ROADMAP.md` | Reorder **only** per §5 (dependency found wrong), justification recorded | Programme Manager |
| `NEXT_ACTION.md` | Regenerated to the single (or per-track) next action | Programme Manager |
| `IMPLEMENTATION_STATUS.md` | Status advances only on gate evidence (never hand-authored, R-13.1) | Engineering Lead |
| `PROJECT_STATE.md` | Reconciled to disk at every milestone boundary (CHARTER §3) | Programme Manager |
| `governance/closure/baseline.json` | Deliberate re-cut (`emit-closure-package.mjs`), reviewed & committed | Chief Architect |

## 9. Governance metadata model (Deliverable 10 / Section 8) — extends R-13.2

**Do not duplicate R-13.2** (the evidence envelope already carries source, time, method, confidence, traceability, validation for every *measurement*). Additive: a **header schema for governed *artefacts*** (ADRs, decisions, DIPs):

`identifier · type · owner · status · created · approved · implemented · verified · baseline-version · dependencies · affected-documents · affected-ADRs · verification-required · rollback-available · audit-reference`

Most ADRs already carry a subset in their headers; this standardizes it so traceability is mechanical, not by inspection.

## 10. Roles & responsibilities matrix (Deliverable 11 / Section 9) — PROPOSED (CHARTER territory)

Authority is currently implicit; D-023 introduced ARB + Steering ad hoc. Proposed RACI (binding adoption via CHARTER amendment):

| Role | Approves | Reviews | Implements | Verifies |
|---|---|---|---|---|
| Architecture Review Board | ADRs, architecture changes | all decisions | — | — |
| Steering Committee | programme decisions (D-xxx), roadmap reorders | — | — | — |
| Chief Architect | baseline re-cut | ADRs | — | — |
| Product / Platform Architect | — | product/platform decisions | track scope | — |
| Programme Manager | — | roadmap/state | register updates | — |
| Engineering Lead | — | — | code/runtime | — |
| Quality Lead | — | — | — | gate evidence |
| Security Lead | — | security-review stage (R-18.22) | — | security gates |

## 11. Audit & traceability model (Deliverable 12 / Section 10) — reference

**Exists:** ACM + ETM (generated), `verify-traceability.js`, immutable provenance (R-14.4), policy decisions recorded as evidence (R-18.7). The unified lifecycle (§3) makes each transition auditable: `PROPOSAL→APPROVED` (approval record), `→VERIFIED` (fault-proved gate), `→BASELINED` (hash). **No new mechanism — the additive states simply extend the existing trail to the front of the chain.**

## 12. Governance maturity (Deliverables 13, 14 / Section 11)

| | |
|---|---|
| **Strengths** | Executable governance (R-18.1); ≥3 mechanisms; every gate fault-proved; evidence over assertion; trust decays; single-source-of-truth enforced by the integrity gate |
| **Weaknesses** | Front of the decision lifecycle unmodelled (no in-flight states); DIP ad hoc; RACI implicit; baseline-update rules implicit |
| **Risks** | Proposals live in limbo (D-023); ad-hoc process re-invented per decision; authority ambiguity at approval |
| **Opportunities** | Close all four with additive process — no architecture change; GCI already measures governance trustworthiness, so improvement is measurable |
| **Improvement roadmap** | (1) CHARTER amendment adding the decision lifecycle §4 + RACI §10 + baseline rules §8; (2) ADR under R-18.26 **only if** any element touches Doc 18; (3) DIP template adopted; (4) GCI re-measured after adoption |

Assessed maturity: **Level 3–4 (Defined→Measured)** on the ADR-0018 scale — process documented and gate-enforced, metrics generated (GCI/ERI/RCI). The four gaps are what stands between here and Level 4 across the board.

## 13. Gaps → adoption vehicle (the enterprise-safe routing)

| Gap | Additive fix | **Binding adoption vehicle** |
|---|---|---|
| In-flight decision states | §4 lifecycle | **CHARTER amendment** (how the org operates) |
| DIP | §7 spec | CHARTER amendment (process artefact) |
| Baseline-update rules | §8 | CHARTER amendment |
| RACI | §10 | CHARTER amendment |
| Any element touching Doc 18's model | — | **ADR under R-18.26** (Doc 18 is FROZEN) |

None requires new architecture, a new Platform Service, or a modified frozen ADR.

## 14. Final governance recommendation (Deliverable 15)

**Adopt this as an additive governance *standard*, not a governance authority.** Ratify the four prescriptive additions via a **single CHARTER amendment** (new §: "Governance Lifecycle"), raising an **ADR only if** the decision-state model is judged to touch Doc 18's frozen governance model — on current reading it touches CHARTER (org process), not Doc 18 (gates/certification), so a CHARTER amendment suffices. Until ratified, the additions are **PROPOSED**; Doc 18, CHARTER and the executing gates remain the sole governing authorities.

---

*Additive standard. Preserves the frozen architecture, six-capability model, three Platform Services, EP/IP sovereignty, and Doc 18's governance model. Introduces no Platform Service and no capability — governance process is programme process, distinct from runtime platform capability (mandatory rule). Where this standard and a canonical document disagree, the canonical document governs until an amendment is recorded.*
