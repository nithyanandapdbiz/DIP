# What is a gate derived from? — the last thing between the composer and stage 7

**2026-08-06. Reported before severing `gates` from stage 11. Nothing built.**

> **A GATE IS A CONDITION EVALUATED AGAINST EVIDENCE THAT DOES NOT EXIST YET. A CERTIFICATION
> OUTCOME IS A JUDGEMENT ABOUT EVIDENCE THAT DOES. They are not the same object at different times
> — they point in opposite temporal directions, and that is why one can be authored at stage 7 and
> the other cannot.**
>
> **The evidence a gate needs is declared at stage 3 and produced at stages 8–9.** The declaration
> is what the package carries; the production is the Execution Plane's. **Both are already on disk:
> `automationIntelligence.validationRequirements` is the declaration, and the composer already
> reads it — for `evidenceRequirements`.**
>
> **AND SEVERING `gates` IS NOT SUFFICIENT TO MOVE COMPOSITION TO STAGE 7.** A fourth input holds it
> late that the field table does not show: **`AuthoringMetadata`**, and specifically the certification
> the bridge checks **before** composing. §4.

---

## 1. What a gate is in R-20.7's terms, and what it is not

**R-20.7:** gate definitions are **carried by the Execution Plane and evaluated only by the
Intelligence Plane**. Two properties follow, and both are load-bearing:

| | A **gate** | A **certification outcome** |
|---|---|---|
| **Temporal direction** | a condition on evidence **not yet produced** | a judgement about evidence **already produced** |
| **Who holds it** | the EP, in transit, opaque to it | the IP, as a conclusion |
| **When it is authored** | before execution — it is an **input** to the run | after execution — it is the run's **output** |
| **What it is for** | telling the IP what to check when evidence returns | telling a customer what the IP concluded |
| **If it is wrong** | the wrong thing is checked | the wrong thing is reported |

> **THE CURRENT DERIVATION INVERTS EVERY ROW.** `gates` is built from
> `executiveReporting.certificationSummary` — a stage-11 judgement about a completed run — and shipped
> as the condition the EP is to carry **into** that run. The package therefore instructs the
> Execution Plane to carry conclusions about work it has not started.

**It survives only because nothing consumes it.** The EP is contractually obliged to carry gates and
never to evaluate them, so a nonsense `expression` string is transported faithfully and evaluated by
nobody. **D-122 established that nothing has ever been written to the store; this is what was in the
artefact that never crossed.**

## 2. Which stage holds the evidence a gate condition needs

**The declaration exists at stage 3. The production is stages 8–9. The evaluation is stage 10–11.**

| What | Where | Available at stage 7? |
|---|---|---|
| **The declaration** — *what must be true, and what evidence would show it* | `automationIntelligence.validationRequirements`, assigned in the runner's `context` stage — **stage 3** | **YES** |
| **The evidence** — the artefacts a gate is evaluated against | produced at stages **8–9**, and in a real run those stages are the **Execution Plane's** | no, and it must not be |
| **The evaluation** — the verdict | stages **10–11**, the IP's, after evidence returns | no, and it must not be |

> **THE COMPOSER ALREADY READS THE RIGHT SOURCE, FOR A DIFFERENT FIELD.**
> `evidenceRequirements` is derived from `automationIntelligence.validationRequirements` today.
> **A validation requirement and a gate condition are the same declaration seen from two sides** —
> *what SHALL be captured* and *what SHALL be true of it* — and one is already authored eight stages
> before the other.

**So the derivation `gates` needs is not new information.** It is the same stage-3 declaration,
projected into a condition rather than into a capture obligation.

### 2.1 What this report does NOT decide

**The `expression` language is a capability decision and is not taken here.** R-20.7 fixes *who
carries* and *who evaluates*; it does not fix the grammar. `GateDefinitionSchema` requires only
`gateId` and a non-empty `expression` string — **a closed vocabulary would be a contract change at a
moved version**, and D-121 is the record of what spending a version on a partial correction costs.

**What can be said without deciding it:** whatever the grammar, a gate's expression must be
**evaluable against an evidence set alone**, because that is all stage 10 has. A gate referencing a
certification summary is not evaluable at stage 10, which is the check that would have caught the
current derivation at authoring time.

## 3. Does severing `gates` move composition to stage 7?

**No — and the field table is why the question needed asking rather than assuming.**

Of the composer's inputs, three are domain outputs and **one is not**: `AuthoringMetadata`, supplied
by the injected `translate()`, carrying `runId`, `correlationId`, `capabilityId`, `authoredAt`,
`notBefore`, `notAfter`, `signingKeyId` and `mode`. **All of it is request-derived and available
before stage 1** — it is not a blocker.

**The blocker is one line in the bridge, and it is not a field at all:**

```
const { result: canonical, certification } = deps.runner.runThroughRunner(input, ctx);
if (!certification.certified) throw …        // <- the gate on composition
const pkg = composeExecutionPackage(canonical, authoring);
```

> **COMPOSITION IS CURRENTLY GATED ON THE RUN HAVING BEEN CERTIFIED — WHICH IS STAGE 11.**
> Even with `gates` severed, the package would still not be authored at stage 7, because **the bridge
> refuses to author one until the whole lifecycle has concluded.**

**And that check is not wrong; it is in the wrong place.** D-122 ruled that certification is one of
the two discriminators deciding whether a package is retrievable — correctly. **What it discriminates
is whether the package is PUBLISHED, not whether it is AUTHORED.** Stage 7 authors; the certification
verdict decides whether that artefact ever becomes retrievable.

**So the move requires three severances, not one:**

| # | Sever | From | Difficulty |
|---|---|---|---|
| **1** | `gates` | `executiveReporting.certificationSummary` (stage 11) | **a capability decision** — §2 names the source, §2.1 leaves the grammar open |
| **2** | composition | the bridge's post-run certification check | **mechanical, once (3) is answered** — the check moves from *may I author* to *may I publish* |
| **3** | the **certification the run is gated on** | the run's own conclusion | **a ruling** — see below |

**(3) is the one to be careful about.** Today's check reads the verdict of the run that has just
finished. At stage 7 there is no such verdict — the governance triad (stages 4–6) has run and the
certification stage has not. **So what gates publication at stage 7 is the TRIAD's outcome, not
stage 11's**, and whether that is sufficient is precisely the question C-11.13 exists around. **It is
not answered here.**

## 4. What this means for D-124's closure

**D-124 is closed by a change of shape, not by moving a call:**

1. **Author at stage 7** — the package is a stage-7 output, inside the lifecycle that governs it, and
   `EvidenceReferenceHandle` at stages 8–9 can then carry the hash it currently cannot (D-128 (ii)).
2. **Publish after certification** — the store write ADR-0081 rules on happens when the run is
   certified, which is where the existing check belongs.
3. **`gates` derived from the stage-3 declaration**, not the stage-11 judgement.

> **AUTHORING AND PUBLISHING ARE TWO ACTS, AND CONFLATING THEM IS WHAT PUT COMPOSITION AT THE END.**
> P-70.1 already says the obligation is *"a sealed package **exists and is retrievable**"* — two
> conjuncts, which D-122 read as one obligation and which this report finds are **two moments**.

## 5. Recommendation

**Do not sever `gates` as an isolated change.** On its own it moves nothing (§3) and would leave a
composer that reads a stage-3 declaration while still being called after stage 12 — which looks
repaired and is not.

**The ruling owed, in one ADR, because these three cannot be decided independently:**

1. **What a gate's `expression` is derived from** — §2 says the stage-3 validation requirement; the
   **grammar** is the capability's to state.
2. **That authoring and publishing are separate acts**, with stage 7 authoring and the certification
   verdict gating publication.
3. **What gates publication at stage 7** — the governance triad's outcome, or something else (§3, (3)).

**What must not be done:**

- **SHALL NOT move `executiveReporting` earlier to satisfy the composer.** It would make a
  certification summary describe a run that has not happened — the same inversion one step worse.
- **SHALL NOT give `expression` a closed vocabulary in passing** — a contract change at a moved
  version, and D-121 records what that costs when it is a partial correction.
- **SHALL NOT author at stage 7 while publication still happens implicitly.** A package authored and
  never published is a store with no writer; a package published without a verdict is the check
  D-122 ruled load-bearing, removed.

## 6. Measured

Domain-to-stage assignments read at their assignment sites in `canonical-runner-capability.ts`;
composer inputs from `canonical-authoring-composer.ts`; the composition gate from
`runtime-entry-point-bridge.ts`; `GateDefinitionSchema` and `EvidenceRequirementSchema` from
`contracts/src/execution-package.ts`; R-20.7 and R-12.5 from their documents. **Nothing was
modified.**
