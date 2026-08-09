# ADR-0019 — Evidence Over Assertion (Constitutional Amendment v1.2)

**Status:** ACCEPTED · **Date:** 2026-07-22
**Amends:** [01 — Platform Constitution](../architecture/01-platform-constitution.md) v1.1 → **v1.2**
**Adds:** INV-10, Rule 13, C-01.36 – C-01.41

---

## 1. Problem

*Evidence over assertion* is to become a permanent constitutional rule: the platform shall always prefer independently verifiable evidence over human assertion, and unknown quality shall report `NOT MEASURED` rather than a pass.

The principle is already applied in several places — `NOT RUN` ≡ `FAIL` (C-0.4), fault injection before trust (C-0.3), the generated scorecard (ADR-0018 §4.3). But it is **applied, not stated**. Nothing prevents the next mechanism from asserting instead of measuring, and nothing measures whether the governance system itself can be trusted.

A specific instance makes the gap concrete. **Every fault-injection proof in this estate exists only as prose in a commit message or a document.** The rule requiring evidence over assertion is currently enforced by assertions about evidence. That is precisely the shape it forbids.

## 2. Context

- The Constitution is FROZEN at v1.1. Amendment requires an ADR, impact analysis, migration strategy and governance review (R-18.26).
- **A-4** requires an amendment to state which invariant it affects. This one affects none — it is additive, like v1.1.
- C-0.3 already requires every gate to be observed to fail. It does not require that observation to be *recorded in a form a machine can read*, which is why the proofs are prose.
- ADR-0018 established that measurement instruments are generated. It did not establish what a measurement must *carry* to be trustworthy.
- Nothing currently measures confidence in the governance system itself, as distinct from the product it governs.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Leave it as an applied practice** | Rejected. A practice with no rule has no enforcement value — the hierarchy in §3 of the Constitution rates prose at zero, and this is prose about prose. |
| **Extend C-0.3 rather than add a rule** | Rejected. C-0.3 governs gates. The principle governs *every measurement the platform emits*, including scorecards, dashboards, certifications and customer-facing claims — a strictly larger scope than gates. |
| **Add Rule 13 with a measurement envelope and a self-validating governance requirement** | **Selected.** |
| **Add it to the Governance Model (18) instead of the Constitution** | Rejected. Document 18 owns gates and certification. This principle constrains AI output, security claims, performance figures, customer-readiness statements and executive reporting — none of which document 18 owns. A cross-cutting rule belongs in the Constitution. |

## 4. Decision

The Constitution moves to **v1.2**, adding one invariant and one rule, additively. No existing invariant or rule is amended.

### INV-10 — Evidence over assertion

> Trust is earned through independently verifiable evidence, never assumed. Every claim the platform makes about itself is derived from executed evidence or reports that it is not measured.

### Rule 13 — Evidence over assertion

Six sub-rules, stated in full in the Constitution. In summary:

| Sub-rule | Requires |
|---|---|
| **R-13.1** | Every emitted measurement derives from objective evidence; hand-authored status values are prohibited |
| **R-13.2** | Every measurement carries an **evidence envelope**: source, collection time, method, confidence, traceability, validation status |
| **R-13.3** | Uncollectable evidence reports `NOT MEASURED`; `NOT MEASURED` is never a pass |
| **R-13.4** | Every gate demonstrates positive detection, negative detection, fault injection, false-positive resistance and false-negative resistance — **recorded machine-readably**, not in prose |
| **R-13.5** | Governance measures its own trustworthiness via a **Governance Confidence Index**, derived entirely from evidence and never assigned |
| **R-13.6** | Platform Intelligence **consumes** evidence and never manufactures it |

### The three clauses that carry the weight

**R-13.2 — the envelope.** A bare value is unfalsifiable. `Architecture Compliance: PASS` cannot be audited without knowing what produced it, when, by what method, and whether that method was itself validated. The envelope turns a claim into a checkable record.

**R-13.4 — machine-readable proofs.** This closes the gap that motivated this ADR. A fault-injection proof described in a commit message cannot be reconciled against the gates that currently exist; a registry can. Without it, C-0.3 is satisfied by writing a sentence.

**R-13.5 — the GCI.** ERI answers *"is the platform ready?"*. GCI answers *"can the governance system that told you so be trusted?"* These are different questions, and only the second detects a governance system that has quietly stopped measuring. **A high ERI produced by an untrustworthy governance system is worse than a low one**, because it is confidently wrong.

## 5. Consequences

**Positive.** The principle becomes enforceable rather than habitual. Fault-injection proofs become reconcilable against the gate inventory. Governance acquires a measure of its own trustworthiness, so its decay is detectable. Every metric becomes auditable to its source.

**Negative, accepted.** Every measurement carries envelope overhead, and every new gate must be fault-injected *and its proof recorded* before it counts — deliberate friction, because an unproven gate contributes nothing to confidence. The GCI will initially be low, because most gates have prose proofs rather than recorded ones. **That is the correct starting position and it is reported rather than softened.**

**Prohibited by this amendment.**

| Prohibited | Because |
|---|---|
| A hand-authored status value in any emitted measurement | R-13.1 |
| Reporting `NOT MEASURED` as a pass | R-13.3 |
| Trusting a gate with no recorded fault-injection proof | R-13.4 |
| Assigning the GCI manually, or excluding an input to raise it | R-13.5 |
| Platform Intelligence generating a metric it did not observe | R-13.6 |

## 6. Migration strategy

**Existing prose proofs are not retroactively invalidated — they are re-recorded.** Each gate's fault injection is re-run and its result written to the machine-readable registry. Re-running is cheap and is the only way to confirm the prose was accurate; accepting the prose as evidence would be the exact substitution this rule forbids.

**Sequence.** (1) Create the proof registry and its gate. (2) Re-run and record proofs for all existing gates. (3) Add the envelope to the scorecard generator. (4) Compute the GCI from actual registry contents. Until (2) completes, the GCI reports low — accurately.

**Rollback.** This amendment is additive, so rollback is removing INV-10, Rule 13 and C-01.36–C-01.41 with a superseding ADR. Nothing depends on it structurally; what would be lost is the ability to detect governance decay.

## 7. Version impact

**Architecture: minor (v1.1 → v1.2)** — additive; no existing invariant or rule amended, per A-4.

**No contract version change.** No cross-plane contract is affected.

**Forward obligation.** A new gate SHALL be added together with its recorded fault-injection proof, in the same change — the R-15.2 pattern applied to governance. A new metric SHALL be added together with its evidence envelope.

## 8. Affected components

| Component | Change |
|---|---|
| [01 — Platform Constitution](../architecture/01-platform-constitution.md) | v1.2: INV-10, Rule 13, C-01.36–C-01.41 |
| [18 — Governance Model](../architecture/18-governance-model.md) | Gate self-validation and GCI reference this rule |
| `governance/verification/proofs.json` | **New** — machine-readable fault-injection registry |
| `governance/verification/verify-governance-self-validation.js` | **New** — every gate has a recorded, current proof |
| `governance/verification/verify-change-control-completeness.js` | **New** — every ADR's affected components were actually modified |
| `governance/verification/generate-scorecard.js` | Evidence envelope per metric; GCI computation |
| `program/ENGINEERING_SCORECARD.md`, `program/PLATFORM_MATURITY.md` | Regenerated with envelopes and GCI |
| `program/CHARTER.md` | Standing principle recorded |
