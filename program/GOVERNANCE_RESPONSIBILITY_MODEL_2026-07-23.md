# Governance Responsibility Model — Canonical Ownership Reconciliation

**Date:** 2026-07-23 · **Type:** additive programme register (reconciliation + reference matrix) · **Adopts nothing**
**Complements:** `GOVERNANCE_LIFECYCLE_STANDARD_2026-07-23.md`, Doc 18 (governance model, FROZEN), CHARTER, `DECISIONS.md`, `ARCHITECTURE_STATUS.md` §3

> This register **classifies ownership; it does not move it.** "Prefer clarification over relocation" is the operating rule. It creates no governance, rewrites no governance document, and adopts nothing. Where it and a canonical document disagree, the canonical document governs. Required CHARTER amendments / ADRs are named as **future actions**, never taken here.

---

## 1. Executive summary

Governance ownership is **already ~90% assigned and non-duplicated** — the anti-duplication contract exists and executes: `ARCHITECTURE_STATUS.md` §3 is the authoritative topic-ownership map, and `verify-architecture-integrity.js` **fails the build on any topic with two owners**. So this reconciliation confirms far more than it repairs.

It finds **three things worth acting on**, all narrow:

1. **One soft-duplication.** CHARTER §9–11 (review pipeline, tech-debt scan, ADR requirement) **restate** Doc 18 R-18.22–27 near-verbatim — contradicting CHARTER's own preamble ("references it and never restates it"). Canonical owner is **Doc 18**; recommend CHARTER **cite, not restate**.
2. **Four implicit ownerships** (no canonical owner today): programme-decision *in-flight states*, RACI/authority, the DIP artefact, baseline-update propagation rules. These are the gaps the lifecycle standard proposed to fill.
3. **A boundary determination** the last register left open: those four additions belong in **CHARTER** (how the org operates), **not** Doc 18 (gates/certification/conformance) — so **no ADR and no frozen-architecture change is required.** Evidence in §6.

The success test — *"the matrix can answer where any governance rule lives"* — is met by §8.

## 2. Governance domain catalogue (Deliverable 3 / Section 1)

| Domain | Canonical owner | Executable? |
|---|---|---|
| Architecture governance | Doc 18 + Doc 01 §3 | yes (integrity/fitness gates) |
| Change control (post-freeze) | Doc 18 §7 (R-18.26–29) | yes (adr-completeness, change-control) |
| Programme governance | CHARTER + `DECISIONS.md` + `MASTER_ROADMAP.md` §5 | partial (P-008; decision states implicit) |
| Implementation governance | CHARTER §9/§14 + `IMPLEMENTATION_STATUS.md` | yes (review pipeline, status legend) |
| Verification governance | Doc 18 §3–4 + `GOVERNANCE_BASELINE.md` | yes (26 gates, 27 proofs) |
| Certification / release | Doc 18 §5 + ADR-0020 (ERI/GCI/RCI) | yes (deterministic gates) |
| Operational governance | Doc 23 + `observability` | yes |
| Security governance | Doc 08 + Doc 22 | yes |
| Product governance | *implicit* (proposed tri-track) | no — future |
| Configuration governance | Doc 15 | yes (declared-vs-consumed gate) |
| Data/sovereignty governance | Docs 06/07/09/10 | yes |

## 3. Canonical ownership matrix (Deliverable 4 / Section 2)

| Governance responsibility | Canonical document | Approval | Implementation | Verification | Status |
|---|---|---|---|---|---|
| Immutable rules, enforcement hierarchy, ≥3 mechanisms | Doc 01 §3 | ARB | — | fitness gate | **owned** |
| Gates, PDP, certification, conformance reporting | **Doc 18** | ARB | Eng | 26 gates | **owned** |
| Architecture change control (ADR) | Doc 18 §7 | ARB | proposer | adr-completeness gate | **owned** |
| Programme decision record + legend | `DECISIONS.md` | Steering | PM | index | **owned** |
| Roadmap sequence & re-plan rule | `MASTER_ROADMAP.md` §5 | Steering | PM | — | **owned** |
| Single next action | `NEXT_ACTION.md` | — | PM | — | **owned (generated)** |
| Where work stands / drift reconciliation | `PROJECT_STATE.md` | — | PM | disk reconcile | **owned** |
| Component build status | `IMPLEMENTATION_STATUS.md` | — | Eng | gate evidence | **owned (evidence-driven)** |
| Frozen architecture snapshot | `ARCHITECTURE_BASELINE.md` | Chief Architect | — | closure gate | **owned (generated)** |
| Gate & proof registry | `GOVERNANCE_BASELINE.md` | — | Quality | self-validation gate | **owned (generated)** |
| Evidence metadata (envelope) | Rule 13 (R-13.2) | — | — | evidence gates | **owned** |
| Review pipeline (7 stages) | **Doc 18 R-18.22** *(CHARTER §9 restates — see §5)* | ARB | leads | milestone review | **owned; soft-dup** |
| Programme-decision in-flight states | *none* | — | — | — | **MISSING → CHARTER** |
| RACI / authority | *none* | — | — | — | **MISSING → CHARTER** |
| Decision Implementation Plan | *none* | — | — | — | **MISSING → CHARTER** |
| Baseline-update propagation rules | *implicit* | — | — | — | **IMPLICIT → CHARTER** |

## 4. Document responsibility matrix (Deliverable 5 / Section 3, 7)

| Document | Owns | SHALL NOT own |
|---|---|---|
| **CHARTER** | How the org operates: build order, review-pipeline *invocation*, DoD, ADR *requirement*, autonomous loop, stop conditions, standing principles | Architecture; gate definitions; the governance *model* (Doc 18); measured status values |
| **Doc 18** (Architecture Governance Model) | The governance model, gates, PDP, certification authority, conformance reporting, change control | Org roles; roadmap; programme state; the enforcement hierarchy (Doc 01) |
| **`GOVERNANCE_BASELINE.md`** | The gate & fault-proof registry, evidence sets, closure metrics (generated) | Rules (Doc 18); decisions (`DECISIONS.md`) |
| **`DECISIONS.md`** | Programme decisions (D-xxx), prohibitions (P-xxx), open decisions (AD-xxx), ADR index | Architecture; roadmap sequence; measured status |
| **`MASTER_ROADMAP.md`** | Sequence & dependencies, re-plan rule (§5) | Phase *content* (that is `MASTER_IMPLEMENTATION_PLAN.md`); decisions |
| **`NEXT_ACTION.md`** | The single next action (generated to state) | History; rationale (that is `PROJECT_STATE.md`) |
| **`PROJECT_STATE.md`** | Where work stands; drift register | Architecture; forward plan |
| **`IMPLEMENTATION_STATUS.md`** | Component build status (evidence-driven) | Planned/intended status; architecture |
| **`ARCHITECTURE_BASELINE.md`** | Cryptographic snapshot of the frozen set | The living "which docs exist" (that is `ARCHITECTURE_STATUS.md`) |
| **ADR collection** | Individual architecture decisions (problem→consequences) | The index (that is `DECISIONS.md` §5) |

## 5. Responsibility overlap findings (Deliverable 2 / Section 5)

| # | Finding | Type | Canonical authority | Recommendation |
|---|---|---|---|---|
| **GO-1** | CHARTER §9 review pipeline = Doc 18 R-18.22–23 (near-verbatim) | **Soft duplication** | **Doc 18** (architecture governs; gate-enforced) | CHARTER §9 → *cite* R-18.22, drop the restatement |
| **GO-2** | CHARTER §10 tech-debt scan = Doc 18 R-18.25 | Soft duplication | **Doc 18** | CHARTER §10 → cite R-18.25 |
| **GO-3** | CHARTER §11 ADR requirement = Doc 18 R-18.26–27 | Soft duplication | **Doc 18** | CHARTER §11 → cite R-18.26–27 |
| **GO-4** | Decision in-flight states, RACI, DIP, baseline-propagation | **Missing/implicit ownership** | none yet | Assign to **CHARTER** (§6) via one amendment |
| **GO-5** | ERI/GCI/RCI defined in CHARTER §20 **and** Doc 24/ADR-0020 | Reference (not dup) — CHARTER §20 already cites | **Doc 24 / ADR-0020** | None — already a reference |

**GO-1..GO-3 are genuine but minor** — they predate Doc 18's freeze and contradict CHARTER's own "never restates" preamble. They are **clarifications, not relocations**: the responsibility already lives in Doc 18; CHARTER should point rather than echo. I recommend; I do not edit CHARTER (mission rule: do not rewrite governance documents).

## 6. CHARTER boundary — the determination (Deliverables 7 / Section 6, 9)

**What belongs in CHARTER:** organisation, roles, approval authority, decision lifecycle, RACI, governance *principles*, and the *invocation* of architecture rules (by reference).

**What SHALL NOT be in CHARTER:** architecture, gate definitions, the governance *model* (Doc 18 owns it), any measured status value (R-13.1), and any *restatement* of a Doc-18 rule (GO-1..GO-3).

**The load-bearing determination.** The four additive elements (GO-4) concern how the *organisation makes and records decisions* — **not** gates, certification, or conformance reporting, which are Doc 18's owned topics. Therefore:

| Addition | Touches Doc 18's owned topics? | Vehicle |
|---|---|---|
| In-flight decision states | No (org decision process) | **CHARTER amendment** |
| RACI / authority | No (org roles) | **CHARTER amendment** |
| DIP artefact | No (implementation planning) | **CHARTER amendment** |
| Baseline-update propagation | No (org process over program/ registers) | **CHARTER amendment** |

**Conclusion: a single CHARTER amendment suffices. No ADR. No frozen-architecture change.** This confirms and de-risks the routing proposed in `GOVERNANCE_LIFECYCLE_STANDARD_2026-07-23.md` §13.

## 7. Authority model (Deliverable 6 / Section 4)

Currently implicit (GO-4). Proposed (PROPOSED until the CHARTER amendment): ARB approves ADRs/architecture; Steering approves programme decisions & roadmap reorders; Chief Architect authorises baseline re-cut; Programme Manager owns register updates; Engineering/Quality/Security/Product leads own implementation/verification in their domain. Full RACI in the lifecycle standard §10 — referenced, not restated.

## 8. Enterprise Governance Reference Matrix (Deliverable 8 / Section 8)

**The lookup: "where does this governance rule live?"**

| Governance topic | Canonical owner | Document | Approval | Verification | Lifecycle |
|---|---|---|---|---|---|
| Constitutional rules / invariants | Doc 01 | `01-platform-constitution.md` | ARB | fitness gate | FROZEN |
| Gates, PDP, certification, conformance | Doc 18 | `18-governance-model.md` | ARB | 26 gates | FROZEN |
| Architecture change control | Doc 18 §7 | `18` + ADR | ARB | adr-completeness | FROZEN |
| Enforcement (≥3 mechanisms) | Doc 01 §3 | `01` | ARB | rule→mechanism recon | FROZEN |
| Programme decisions | `DECISIONS.md` | program/ | Steering | index | ACCEPTED/… |
| Roadmap sequence | `MASTER_ROADMAP.md` §5 | program/ | Steering | — | v1.0 |
| Build status | `IMPLEMENTATION_STATUS.md` | program/ | — | gate evidence | evidence-driven |
| Gate/proof registry | `GOVERNANCE_BASELINE.md` | program/ | — | self-validation | generated |
| Frozen snapshot | `ARCHITECTURE_BASELINE.md` | program/ | Chief Architect | closure gate | generated |
| Evidence metadata | Rule 13 (R-13.2) | Doc 01/CHARTER §18 | — | evidence gates | FROZEN |
| Confidence indices (ERI/GCI/RCI) | Doc 24 / ADR-0020 | architecture | ARB | scorecard | FROZEN |
| Review pipeline | **Doc 18 R-18.22** | `18` | ARB | milestone review | FROZEN |
| Config governance | Doc 15 | `15` | ARB | declared-vs-consumed | FROZEN |
| Decision in-flight states · RACI · DIP · baseline rules | **(future) CHARTER** | CHARTER | Steering/ARB | — | **PROPOSED** |

## 9. Change impact assessment (Deliverable 9 / Section 9)

| Proposed governance addition | CHARTER amendment | ADR | Programme decision | Justification only |
|---|---|---|---|---|
| GO-1..GO-3 (de-duplicate CHARTER §9–11 → citations) | ✔ (minor, clarifying) | — | — | — |
| Decision in-flight states | ✔ | — | — | — |
| RACI / authority | ✔ | — | — | — |
| DIP artefact | ✔ | — | — | — |
| Baseline-update rules | ✔ | — | — | — |
| Tri-track operating model (D-023) | — | — | ✔ (Steering) | — |

**No item requires an ADR or a frozen-architecture change.** One CHARTER amendment carries GO-1..GO-4; D-023 remains a separate Steering decision.

## 10. Final recommendation (Deliverable 10 / Section 10)

- **Immediate:** none executed here — this register is classification only.
- **Future (one CHARTER amendment):** de-duplicate CHARTER §9–11 into citations of Doc 18 (GO-1..GO-3); add the decision lifecycle, RACI, DIP, and baseline-update rules (GO-4). Draft, review at ARB, ratify.
- **Deferred:** product-governance ownership — resolves when the tri-track model (D-023) is approved.
- **Out of scope:** any change to Doc 18, the frozen architecture, or the six-capability / three-service / sovereignty models. Confirmed unnecessary.

**Every governance responsibility now resolves to exactly one owner** (§8), the four implicit ones are named with their vehicle, and the single soft-duplication has a clarification path. Single-source-of-truth is reinforced, not disturbed.

---

*Additive reconciliation. Moves no responsibility; rewrites no governance document; adopts nothing. Preserves the frozen architecture and Doc 18's governance model. All amendments identified as future governance actions, subject to ARB/Steering. Where this register and a canonical document disagree, the canonical document governs.*
