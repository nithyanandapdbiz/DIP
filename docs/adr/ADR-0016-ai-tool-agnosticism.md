# ADR-0016 — AI Tool Agnosticism: Capability Classes, Not Products

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Adds:** INV-9, Rule 12 · **Closes:** AD-030

---

## 1. Problem

The architecture already forbids a vendor name from appearing outside an adapter (R-7.2), requires configuration keys to be capability-named rather than tool-named (R-7.3), and requires model providers to sit behind one platform-owned interface selected by tenant configuration (R-8.7, R-13.10–R-13.14).

**All of that governs the platform at runtime. None of it governs how the platform is built.**

The engineering process — the review pipeline (R-18.22), the certification authority (R-18.17), the engineering standards in `CHARTER.md`, and the implementation guidance — specifies *stages* but never says what performs them. That silence is the defect. A silent convention is filled by whatever tool the current session happens to use, and the first document that writes *"architecture review requires <product>"* converts an implementation tool into a governance dependency. At that point changing AI vendor requires changing governance, and the platform's portability claim becomes false in the one dimension nobody was checking.

This is the **declared-but-unbuilt** failure class inverted: not a control declared and never built, but a dependency acquired and never declared.

## 2. Context

- **§15 of `CHARTER.md`** commits this platform to serving enterprise customers *"over a decade, across multiple clouds, AI providers, and execution tools."* A decade is longer than the observed lifetime of any current AI product generation.
- **INV-5** — every external system sits behind a platform-owned interface; vendor names appear inside adapters and nowhere else. This covers AI providers *as runtime components*. It does not reach the engineering process, which is not a platform component at all.
- **The predecessor's evidence.** Its strongest correlation was that rules enforced by prose alone always drifted (D-020). A vendor-neutrality principle stated only in prose would drift the same way — and drift here is silent, because a vendor name in a governance document breaks no test.
- **A live terminology hazard.** `11-capability-model.md` is **FROZEN at v1.0** and owns the word *capability*: exactly six, each a certifiable unit traversing all twelve orchestration stages, with a seventh requiring an approved ADR (R-11.4). Introducing a second, unrelated set of "capabilities" describing properties of an AI system would collide with a frozen document's owned term and read as an unauthorised expansion of the capability set.
- **The distinction is real, not cosmetic.** *"High Reasoning"* is a property an AI system exhibits. *"Functional Testing Engine"* is a certifiable unit of quality engineering work. Sharing one noun between them would make R-11.4 unenforceable by inspection.

## 3. Alternatives

| Question | Options | Assessment |
|---|---|---|
| Where does the principle live? | Extend Rule 7 (external systems) | Rejected — Rule 7 governs runtime adapters; the engineering process has no adapter |
| | Extend Rule 8 (AI generates, code decides) | Rejected — Rule 8 governs the *inference boundary*, a different concern; overloading it makes both harder to cite |
| | **New Rule 12 + new INV-9** | **Selected** — the property is genuinely new: portability of *governance*, not of runtime |
| | Charter only | Rejected — `CHARTER.md` governs how the organisation operates and never originates architecture (CHARTER §preamble) |
| What are the classes called? | `Capability` (as proposed) | **Rejected** — collides with a FROZEN owned term (R-11.1, R-11.4) |
| | **`AI Capability Class`** | **Selected** — distinct noun phrase, unambiguous under grep, cannot be mistaken for one of the six |
| Is the class list closed? | Closed, ADR to extend | Rejected — the list describes AI properties, which evolve faster than the architecture should |
| | **Open, but a class must be declared before use** | **Selected** — extension needs no ADR; *undeclared* use fails the build |
| Enforcement | Prose in the constitution | Rejected outright — prose has **no** enforcement value (§3, R-18.16) |
| | **Executable scan + review gate + structural naming rule** | **Selected** — three independent mechanisms (C-0.2) |

## 4. Decision

**INV-9 is added:** *The platform's architecture, governance, contracts, workflows, certification and security model are portable across AI technologies. AI is specified by capability class; no vendor, model or tool is named as a requirement — at runtime or in the engineering process.*

**Rule 12 is added** to the Constitution, extending vendor-neutrality from the runtime to the engineering process, governance, standards and certification.

**AI Capability Class** is adopted as the governing term, defined and owned by [13 — AI Operating Model](../architecture/13-ai-operating-model.md) §7. It is deliberately *not* the word "capability", which remains owned exclusively by [11](../architecture/11-capability-model.md) for the six certifiable units.

**Engineering process specifies capability class, never product.** A governance document, standard, workflow or review definition states *"requires a High Reasoning Capability Class"*. It never states which product satisfies it. Which product is used is a **session-level implementation choice** carrying no architectural weight — and therefore requires no ADR to change.

**Vendor names remain permitted** in exactly five places, because erasing them there would destroy real information: provider adapter implementations, configuration examples and tenant configuration values, supported-provider and compatibility documentation, migration and historical records, and ADRs recording a decision that was genuinely product-specific. **Outside those five, a vendor name is a violation.**

**The rule ships with its gate.** `verify-ai-vendor-neutrality.js` is added to the governance suite in the same change, with a recorded fault-injection proof (C-0.3). Declaration and enforcement are one atomic change (D-012) — a vendor-neutrality rule delivered as prose would violate the very finding that motivates it.

## 5. Consequences

**Positive.** Changing AI vendor, model, assistant, gateway or provider becomes a configuration change with no architectural, governance, contractual or certification impact — and this is now *checkable* rather than asserted. The engineering process gains a vocabulary that survives product churn. The terminology collision is closed before any document propagates it.

**Negative.** Capability-class language is less immediately concrete than a product name; a reader wanting to know what to actually use must consult configuration rather than architecture. This is the intended trade: the architecture describes what is required, configuration records what currently satisfies it.

**Accepted cost.** The five permitted contexts are a judgement boundary, not a bright line, so the gate uses an explicit allow-list of paths and an inline exemption marker rather than attempting to infer intent. An exemption is visible in the diff and reviewable — which is the property that matters.

**A note on this repository's own bootstrap file.** The container holds a tool-specific bootstrap file whose *filename* is vendor-derived. It is unversioned, originates no rule, and carries no authority (CLAUDE.md §1 — cited here as the historical record of the coupling this ADR removes) [vendor-permitted: migration record, R-12.5 context 4]. It is therefore an implementation-specific reference under the fifth permitted context. **However**, two programme documents cited it as the *source* of a standing rule — a coupling of governance to a vendor-named artefact, and independently a precedence violation. Those citations are corrected in this change to name the canonical documents instead.

## 6. Migration strategy

No runtime code exists, so there is no code migration.

1. Constitution gains INV-9, Rule 12, and criteria C-01.33–C-01.35.
2. [13](../architecture/13-ai-operating-model.md) gains §7, defining the AI Capability Class taxonomy and its binding rules.
3. [18](../architecture/18-governance-model.md) gains R-18.28–R-18.30, applying the principle to the review pipeline and certification.
4. `verify-ai-vendor-neutrality.js` joins the gating suite; fault-injection proof recorded.
5. Governance citations of the vendor-named bootstrap file are repointed to canonical documents.

**After the M1.6 freeze**, a document acquiring a vendor name in a governed context is a violation corrected under R-11.1 — the Constitution is not amended to accommodate it.

## 7. Version impact

Constitution: **minor version increase** — additive. INV-9 introduces a property; it weakens no existing invariant, and Rule 12 relaxes no existing rule. Per A-4 this is an **extension**, not an amendment to an existing invariant.

Documents 13 and 18: minor increase, additive sections only.

Document 11 is **FROZEN and is not modified.** The collision is resolved by naming the new concept distinctly, not by editing the frozen document — which is the correct direction under R-11.1.

## 8. Affected components

| Component | Change |
|---|---|
| [01 — Platform Constitution](../architecture/01-platform-constitution.md) | INV-9; Rule 12; C-01.33–C-01.35 |
| [13 — AI Operating Model](../architecture/13-ai-operating-model.md) | §7 AI Capability Classes; C-13.18–C-13.20 |
| [18 — Governance Model](../architecture/18-governance-model.md) | R-18.28–R-18.30; C-18.x |
| [11 — Capability Model](../architecture/11-capability-model.md) | **Unchanged** — frozen; term protected by naming the new concept distinctly |
| `governance/verification/` | New gating check + suite registration + fault-injection proof |
| `program/RISKS.md`, plane `README.md` files | Governance citations repointed off the vendor-named bootstrap file |
