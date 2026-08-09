# ADR-0043 — Executable Constitutional Governance & Traceability: every invariant maps to a registered gate, and the mapping is itself verified

**Status:** **PROPOSED** — 2026-07-28. Nothing lands on disk (no gate registered, no baseline re-cut) until this ADR is moved from PROPOSED to ACCEPTED; on acceptance §6 executes gate-first (D-012).
**Date:** 2026-07-28
**History:** PROPOSED 2026-07-28 — raised from a customer "complete the governance model" directive: strengthen (not duplicate) the existing Constitution/ADR/gate/fitness-test framework with an executable invariant→enforcement traceability layer, so a constitutional rule cannot be unenforced without that being visible and blocked.
**Raised by:** customer directive — make every constitutional rule executable, traceable, measurable and automatically enforceable; a future developer, AI agent or Cloud-Engineering change must not be able to violate the constitution without an automated gate detecting and blocking it.
**Builds on:** [ADR-0025](ADR-0025-platform-certification-framework.md) (the certification engine), [ADR-0020](ADR-0020-continuous-verification.md) (continuous verification), the existing `governance/traceability/` stage matrix, and [01 — Platform Constitution](../architecture/01-platform-constitution.md) (the invariants/rules this maps).
**Explicitly does NOT amend (constitutional — preserved):** the eleven invariants and fourteen rules of Doc 01 (this ADR maps them, it does not change them), R-11.4, R-12.18, R-21.5, and the frozen contracts. It introduces **no new constitutional document** — Doc 01 remains the single source of truth (CHARTER §4).

---

## 1. Problem

The platform is governed by Doc 01 (eleven invariants, fourteen rules), ADRs (constitutional amendments), fifty-plus governance gates, and architecture fitness tests. What is missing is a **verified map from each constitutional invariant/rule to the executable gate(s) that enforce it.** The existing `governance/traceability/ENTERPRISE-TRACEABILITY-MATRIX.md` traces lifecycle **stages** (vision → capability → ADR → implementation → evidence → certification) and counts artefacts per stage; it does not answer *"which gate enforces INV-6?"* — so an invariant enforced only by ADR prose, with no dedicated gate, is invisible. The customer's objective is that an unenforced constitutional rule be **visible and blocked**, not merely documented. This ADR closes that with a per-invariant enforcement register that verifies itself against the registered gate set.

## 2. Context

**Verified against disk (CHARTER §3), and by executing the register built this session.**

- Doc 01 declares **11 invariants (INV-1…INV-11) + 14 rules**. `governance/traceability/` already holds a **stage** matrix + `verify-traceability.js` / `verify-implementation-traceability.js`; there is **no per-invariant enforcement map** — the genuine gap.
- A machine-readable register was built and **run**: `governance/constitution/constitution-traceability.mjs`. It declares, for each invariant/rule, its enforcing gate(s) + ADR + evidence + severity, and **validates every citation against `run-all.js`** (a named gate must exist and be registered — a citation cannot be fiction). Executed result: **15 invariants/rules ENFORCED (all citations resolve), 3 GAPs, 2 PENDING** (P-41/P-42 land on their ADRs' acceptance), **0 broken citations**.
- **The 3 GAPs are real and now visible:** **INV-6** (customer data purged by *enforced code* — retention/PII are ADR-declared [ADR-0006/0014] but no dedicated purge-enforcement gate), **INV-7** (executing plane *never blocked* by the reasoning plane — degraded-operation is ADR-declared [ADR-0015] but no dedicated runtime gate), **INV-11** (trust *expires* / confidence decays with evidence age — continuous verification [ADR-0020/Rule 14] exists but no dedicated evidence-age gate). These are enforced by ADR + design today, not by a dedicated executable gate.

## 3. Alternatives

| Option | Disposition |
|---|---|
| **Write a "Constitution V2" governance document** | **Rejected** (customer-endorsed rejection) — a second constitution is the CHARTER §4 duplication; Doc 01 stays the source of truth. |
| **Hand-author a traceability table in Markdown** | **Rejected** — a committed table gates on a historical claim and drifts; the platform's rule is executed evidence (R-13.1). |
| **Extend the existing stage matrix to also carry per-invariant rows** | **Rejected** — conflates two orthogonal views (stage coverage vs. invariant enforcement) in one artefact; the per-invariant register references the stage matrix rather than merging into it. |
| **A self-validating per-invariant register + a verifier gate; unenforced invariants tracked as an acknowledged backlog closed gate-first** | **Chosen.** |

## 4. Decision

**Establish Executable Constitutional Governance & Traceability as platform law (principle P-43).**

**P-43 — Every constitutional invariant and rule maps to a registered executable gate, and the mapping is itself verified.** The invariant→enforcement register is canonical, validated against the registered gate set (no fictional citation), and any invariant lacking a dedicated gate is an **acknowledged, tracked backlog item** — never a silent gap. A new unenforced invariant, or a broken citation, fails the verifier.

### 4.1 MUST hold (enforced by the verifier gate)

| # | Invariant | Why |
|---|---|---|
| T1 | Every register citation names a gate that exists and is registered in `run-all.js` | citations cannot be fiction |
| T2 | Every Doc-01 invariant/rule with distinct enforcement appears in the register | completeness |
| T3 | Any invariant with no dedicated gate is on the acknowledged-backlog set; a new unenforced invariant fails | no silent unenforced rule |
| T4 | The register is executed (not a committed table); its verdict is computed each run | R-13.1 evidence over assertion |
| T5 | The enforcement backlog (INV-6, INV-7, INV-11) is closed gate-first — each dedicated gate lands RED→green before its invariant flips to ENFORCED | P-002, gate-first |

### 4.2 What this does not change

Doc 01's invariants/rules, the six-capability / one-lifecycle model, the existing gates and the stage traceability matrix are untouched. This is an additive verification layer over what already exists.

## 5. Consequences (stated honestly)

- **Three unenforced invariants are now visible and owned.** INV-6/7/11 were always enforced by ADR + design; they now have a tracked remediation path to a dedicated gate. Visibility is the deliverable, not a regression.
- **The governance model becomes self-checking.** After acceptance, a change that adds an invariant without enforcement, or cites a non-existent gate, fails the verifier — the customer's "cannot violate without a gate detecting it" standard, applied to the governance model itself.
- **No documentation-only enforcement.** The register is executable; its verdict is recomputed, never trusted from a committed file.
- **Additive, no churn.** No existing gate, fitness test or matrix changes; the register composes with them.
- **This is a precondition, not a certification.** It proves the enforcement map is complete and honest; it does not by itself close INV-6/7/11 — those are gate-first backlog items (§6).

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

1. **Accept this ADR** and index it in `program/DECISIONS.md`.
2. **Register the verifier gate** (D-012, gate-first): a new constitution-traceability gate under `governance/verification/` that runs `governance/constitution/constitution-traceability.mjs` and asserts T1–T4, registered in `run-all.js` with a recorded fault proof (cite a non-existent gate → RED; introduce an unacknowledged unenforced invariant → RED). It lands green (mapping valid; gaps acknowledged).
3. **Close the enforcement backlog gate-first** (T5): author a dedicated gate for **INV-6** (purge-by-enforced-code), **INV-7** (executing-plane-never-blocked), **INV-11** (evidence-age/trust-decay), each RED→green with a fault proof; flip each invariant to ENFORCED in the register only when its gate is green.
4. **Re-cut governance** — `run-all.js`, the closure baseline; re-run the suite. Restore/keep green by satisfying gates, never weakening them (P-002).
5. **Record** in `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, `program/TECHNICAL_DEBT.md` (the three gaps as owned backlog).

## 7. Version impact

**Additive.** Adds principle P-43, one register (already built and executing) and, on acceptance, one verifier gate + three backlog gates. It amends **no** Doc-01 invariant/rule, **no** cross-plane contract, **no** capability count, **no** lifecycle, **no** tenant state, and duplicates no existing matrix (it references the stage matrix). Nothing lands on disk except as §6 executes in order.

## 8. Affected components

On acceptance, the affected components are:

- `governance/constitution/constitution-traceability.mjs` — the executable invariant→enforcement register (built this session; validates its own citations against `run-all.js`).
- A new constitution-traceability verifier gate + recorded fault proof added under `governance/verification/`; `run-all.js` gains its line; `governance/closure/baseline.json` re-cut.
- Three new dedicated gates under `governance/verification/` (INV-6 purge-enforcement, INV-7 never-blocked, INV-11 evidence-age) closing the backlog gate-first.
- `governance/traceability/ENTERPRISE-TRACEABILITY-MATRIX.md` — **referenced, not changed**; the per-invariant register is its complement, not a replacement.
- [01 — Platform Constitution](../architecture/01-platform-constitution.md) — **referenced, not amended** (the register maps its invariants); [ADR-0025](ADR-0025-platform-certification-framework.md), [ADR-0020](ADR-0020-continuous-verification.md) — referenced, extended additively.
- `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, `program/DECISIONS.md`, `program/TECHNICAL_DEBT.md` — updated to record this decision and the three-gap backlog.

---

**Gate:** No verifier gate is registered and no backlog gate is written until this ADR is moved from PROPOSED to ACCEPTED. On acceptance, §6 executes in order, gate-first (D-012): the traceability gate lands green (mapping valid, gaps acknowledged), and the three backlog gates land RED→green, each flipping its invariant to ENFORCED only by satisfying its gate (P-002).
