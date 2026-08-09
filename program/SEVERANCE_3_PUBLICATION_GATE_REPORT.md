# Severance 3 — what gates publication at stage 7, and whether D-019 blocks it

**2026-08-06. Reported before building. Severances 1 and 2 have landed; this is the one that was not taken in passing.**

> **THE READING IS CORRECT: the governance triad is the only certification that exists before
> execution, and requiring more means requiring a run to have happened — the contradiction severance
> 2 just removed.**
>
> **BUT THE PREMISE NEEDS ONE CORRECTION, AND IT CHANGES THE ANSWER FROM "NO" TO "YES, CONDITIONALLY."**
> *"The canonical triad cannot decline"* is **no longer true as stated.** `emit.refuse` exists
> (ADR-0071), `certify()` now reads refusals, and **`architecture-review` CAN refuse, reachably.**
>
> **What is actually open is narrower and worse-named than D-019's headline: the triad reviews
> PRESENCE, not SOUNDNESS.** Two of its three stages cannot decline **by ruling**, because their
> predicate is *"was this artefact authored?"* and the negative is pure absence.
>
> **RECOMMENDATION: severance 3 is AVAILABLE as an interim, on three conditions — and the third is
> the one that keeps it honest.** §4.

---

## 1. Measured — what the triad can and cannot do today

| Stage | Predicate | Can it refuse? | Why |
|---|---|---|---|
| `architecture-review` | `architectureComponents.length > 0` | **YES, and reachably** | split deliberately: **absent** → `notApplicable`; **authored-but-empty** → **`refuse`** — *"cannot be certified as sound"* |
| `policy-review` | `story !== undefined` | **NO — by ruling** | its negative is **pure absence**; there is no *did-not-approve* state to reach, and a refusal would claim a review ran |
| `guardrail-review` | `testDesign !== undefined` | **NO — by ruling** | as above |

**Two framework repairs that D-019's headline predates:**

- **`emit.refuse` exists** (ADR-0071). The emitter is no longer *"`ok` or `notApplicable`"*.
- **`certify()` reads refusals** — `certification.ts:113`, `if (result.outcome === 'refused')`. D-019
  (ii) recorded that an applicable result certified **without the value ever being inspected**; that
  is repaired.

> **SO *"PUBLICATION GATED ON A TRIAD THAT ALWAYS APPROVES"* IS NOT THE SITUATION.** The triad
> declines on one reachable predicate, and the two stages that cannot decline were ruled that way for
> a reason that is still correct: absence and disapproval are different facts, and collapsing them
> would make a stage claim a review it did not perform.

## 2. What IS open, stated precisely enough to gate on

> **THE TRIAD ESTABLISHES THAT THE THREE ARTEFACTS EXIST AND THAT THE ARCHITECTURE IS NON-EMPTY. IT
> DOES NOT ESTABLISH THAT ANY OF THEM IS SOUND.**

`policy-review` approves **any** story that exists. `guardrail-review` approves **any** test design
that exists. Neither reads content. **A run whose story intelligence is wrong and whose test design
is inadequate passes the triad**, because nothing in the triad is positioned to disagree with it —
what a capability's reviews *should* refuse on is recorded as `UNDECIDED — Functional Testing`
(ADR-0076 §4.4) and is a capability decision, not a framework gap.

**That is the real content of D-019's remaining half, and it is a narrower claim than the entry's
headline.** The headline says the triad *cannot decline*; the measurement says it *declines on
presence and is silent on soundness*. **The entry is owed that correction** — recorded as debt rather
than edited into the ADR that predates it.

## 3. Why "wait for D-019" is the more expensive answer

**Severance 3 unavailable means composition stays where severance 2 just moved it from.**

- The Execution Plane needs the package **before stage 8**. Publication that waits for a stage-11
  verdict can never serve it — that is the contradiction, restated.
- So *"wait until D-019 closes"* is not a cautious version of the same plan. **It blocks the
  cross-plane path entirely**, on a debt item about what a capability's reviews should judge — which
  is ADR-0076's `UNDECIDED`, i.e. a decision nobody has scheduled.
- And it is not a regression that is being avoided: **nothing publishes today.** The comparison is
  not *strong gate vs weak gate*; it is **weak gate vs no path**.

**The genuine risk, put as strongly as it deserves:** a package would cross to a customer's Execution
Plane having passed three checks that confirm artefacts exist. **If publication is ever read as *"the
Intelligence Plane certified this package as sound"*, that is a false claim** — and it is the kind of
false claim this register exists to catch (D-012's verdict handed over, D-043's self-refuting reason).

## 4. Recommendation — AVAILABLE as an interim, on three conditions

**Condition 1 — the gate records WHICH LEGS JUDGED, per leg, and `notApplicable` is never counted as approval.**

CHARTER §17.1: **`NOT MEASURED` is never a pass.** A triad leg that returned `notApplicable` did not
approve — it reported that there was nothing to review. **A publication decision that folds three
outcomes into one boolean has erased exactly the distinction that makes the gate weak**, and the next
reader would find a `certified: true` with nothing behind it.

**Condition 2 — the publication record carries that fact where a consumer can see it, not only a log.**

The record states, per leg: **judged / not-applicable / refused**. This is the artefact that makes the
gap *visible at the gate* rather than implied — and it is what a later reader needs in order to tell a
package published under a full triad from one published under a triad that had nothing to review.

**Condition 3 — the publication decision SHALL NOT use the word *certified*, and its source says why.**

> **The triad establishes ADMISSIBILITY, not SOUNDNESS.** A package publishable under this gate is one
> the plane has **not found a reason to refuse**, which is a materially weaker statement than one it
> has **certified**. Naming it correctly is the whole of condition 3, and it is not cosmetic: the
> vocabulary is what a future reader will reason from when they decide whether the gate is sufficient.

**With all three, the gap is stated at the gate.** Without condition 3 in particular, the interim
becomes the failure it was meant to avoid — a weak gate wearing a strong gate's name.

## 5. What this does NOT authorise

- **SHALL NOT be read as closing D-019.** It is gated on a known-weak review, deliberately, with the
  weakness recorded in three places.
- **SHALL NOT make `policy-review` or `guardrail-review` refuse on absence** to strengthen the gate.
  That ruling is correct and reversing it would make a stage claim a review it did not perform.
- **SHALL NOT publish before the triad runs.** Stages 4–6 are mandatory (R-12.2) and unbypassable
  (C-11.13); an earlier publication point has no gate at all.
- **SHALL NOT collapse the per-leg record into a boolean** at any later point — condition 1 is the
  gate's only informative output.

## 6. What is owed with it

1. **D-019's headline correction** — the triad declines on presence and is silent on soundness; it is
   not that it *cannot decline*.
2. **ADR-0076 §4.4's `UNDECIDED — Functional Testing`** is what closing the gap actually requires: a
   capability stating what its reviews refuse on. **Named here so that "close D-019" resolves to a
   decision with an owner rather than to a repair with no author.**
3. **The publication gate lands with its fault proof** — a run in which the triad refuses and
   publication does not occur, with the branch that fired recorded (R-13.7 clause 2, CHARTER §18).

## 7. Measured

Triad predicates and outcomes read at their implementation sites in `canonical-runner-capability.ts`;
the emitter's constructors and `certify()`'s refusal branch in `capability-framework/src`; D-019 and
the triad ruling from `TECHNICAL_DEBT.md`; R-12.2, C-11.13 and R-20.7 from their documents.
**Nothing was modified.**
