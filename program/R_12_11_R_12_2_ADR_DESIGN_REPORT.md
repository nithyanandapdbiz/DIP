# The R-12.11 / R-12.2 ADR — design report

**REPORT ONLY. NOTHING BUILT. NO ADR WRITTEN.** 2026-08-05, at `683418e`, working tree clean at entry.

This report answers the question it was asked to answer first — **are the three rulings one decision or three?** — and then sets out each ruling with the evidence that decides it. **It stops before the ADR.** The recommendation on each is stated so it can be accepted, rejected or amended; none of it is implemented.

---

## 0. WHAT CHANGED BEFORE THE REPORT COULD BE WRITTEN

Three things were measured at entry that the queue did not know, and two of them move the rulings.

**(a) `109 → 115` is recorded where the criteria step will meet it, not only in a report.** `CRITERIA_DESIGN_REPORT.md` is retitled and its group tallies corrected from source across all fourteen domain modules (structural 51→54, consumption 30 unchanged, negative 28→30, **plus `no-ratio`, which its taxonomy has no group for**); `TECHNICAL_DEBT.md` D-015 carries the re-measurement with its original figure preserved rather than overwritten. Two findings fell out: `observation-interpretation` is the **only** domain declaring no `decision-engine-consumed` — correct and verified, since the step supplies it none — and **`no-ratio` is the only one of the 115 whose enforcing gate already exists** (`no-ratio-computation`), which makes it the cheapest possible worked example of the citation recommendation and it is now sequenced first.

**(b) The `DECISIONS.md` gap is SIX, not four.** Diffed rather than read: **67 ADRs on disk, 61 rows, six absent** — `ADR-0060`, `ADR-0063`, `ADR-0071`, `ADR-0072`, `ADR-0073`, `ADR-0074`. Nothing is indexed that does not exist. **The instruction to record this said four, and `DECISIONS.md`'s own drift note said four**, because both were written from what recent work had touched rather than from a diff — so both reproduced the boundary of that work, and `ADR-0060`/`ADR-0063` are older than every ADR either named. That is D-057's finding — *a scope over a session rather than over the artefact* — occurring inside the note written to record a scope defect. Recorded as **D-065**; the note is corrected in place.

**(c) A NEW FINDING, PROVED BY OBSERVATION, THAT THIS ADR CANNOT BE WRITTEN AROUND — recorded as D-066.**

> **Architecture Review is the one governance-triad stage whose verdict `certify()` never reads.**

`certification.ts:76` refuses a run that did not *traverse* all three triad stages. It then renders verdicts by iterating `CERTIFICATION_GATES`, and `GATE_STAGE` maps them onto seven stages — `policy-review`, `guardrail-review`, `execution-planning`, `execution`, `reflection`, `reporting`, `certification`. **`architecture-review` is not one of them.**

Measured by running a real capability through `runCapability`, refusing at one triad stage per run — the framework's own path, because a `StageResult` carries a module-private seal and cannot be forged (R-12.11):

```
refuse at (clean run)          stage.outcome=n/a           certified=true   firstRefusal=null
refuse at architecture-review  stage.outcome=refused       certified=TRUE   firstRefusal=null
refuse at policy-review        stage.outcome=refused       certified=false  firstRefusal=story-certified: refused: …
refuse at guardrail-review     stage.outcome=refused       certified=false  firstRefusal=test-certified: refused: …
```

Repeated with `notApplicable`, the results are identical — **so the gap predates ADR-0071 and was not created by it.** It is `@dbiz/capability-framework`, so it holds for all five implemented capabilities. **A triad stage can do its work, say no, seal that answer, and the run certifies.**

---

## 1. THE QUESTION ASKED FIRST — one ADR or three rulings?

**Recommendation: ONE ADR, THREE RULINGS, ONE PRINCIPLE — and the principle is not the one the framing proposes.**

The framing offered was: *"what does a declaration about position or tool access mean when nothing checks it?"* **That is the right instinct and the wrong predicate, and the difference decides the ADR's shape.** Measured:

| Field | Type | Constrained? | Enforced? | Drift |
|---|---|---|---|---|
| `AgentDefinition.stage` | **`StageName`** | yes, by the type | **yes — gate `F-7`, over 144 agents** | none |
| `PlatformEvent.stageRef` | **`string`** | no | no | **8 of 13 wrong; 3 name non-stages** |
| `AgentDefinition.toolContracts` | **`readonly string[]`** | no | no | **21 declare an uncalled SPI; 3 name no type at all** |

**`stage` and `stageRef` say the same sentence about the same lifecycle, and one is a type while the other is a string.** That is the finding: *nothing checks it* is a symptom, and the cause is that **the field was given a type that cannot carry the claim it makes.** D-012's rule is *declaration and enforcement are one atomic change*, with the preferred form being to make an unenforced field **unrepresentable**. `stage` did that. `stageRef` and `toolContracts` did not, and both drifted immediately.

So the unifying principle is available and it is stronger than "nothing checks it":

> **A declaration whose type admits values the platform can prove wrong is not a weak declaration — it is a different kind of object from one whose type does not. The three rulings are three instances of choosing which kind each field is.**

**Why one ADR and not three.** Rulings 2 and 3 are unanswerable in isolation without inventing a meaning, which is precisely what D-058 and D-062 both say and both refuse to do. **`toolContracts` has two live readings and `stageRef` has two live readings, and in both cases one reading is *what this unit does* and the other is *what this unit belongs to*.** That is the same axis twice. Ruling on either alone would fix a meaning for one field and leave the identical ambiguity in the other — and the next reader would have two documents that answer the same question about two fields and would have to guess whether the difference was deliberate.

**Why not one ruling.** They do not collapse. `toolContracts` and `stageRef` are declarations *about* a unit; ruling 1 is about **where a mechanism sits**, and its subject is a runtime arrangement rather than a field. Folding it in would let a field-naming decision carry a constitutional one.

**Structure recommended:** one ADR, one principle in §2, three numbered rulings in §3–§5, **and ruling 1 first** — because it is the only one with a constitutional constraint on both sides, and because §0(c) means it now has to rule on something live rather than only on a design.

---

## 2. RULING 1 — R-12.11 vs R-12.2

### 2.1 What was believed, and what is true at `683418e`

The question of record: *can a coverage-remediation loop and an independent review of its output coexist under a forward-only runner?* G-6 narrowed it to a choice between two mechanisms rather than the design of one. **Measured at entry, the narrowing is right and both mechanisms are on the same side of a boundary nobody stated.**

**The remediation loop is LEGACY-ONLY.** `authoringOrchestrator` is referenced from exactly three files: its definition (`orchestrators.ts`), a re-export (`index.ts`), and `capability.ts` — the twelve-stage legacy engine. It is invoked at `capability.ts:697`, inside the **`execution-planning`** callback (stage 7). Its own comment (`orchestrators.ts:411–416`) is the trade D-035 found: *"R-12.11 forbids any path that re-enters a completed stage, so modelling this as `execution-planning -> guardrail-review` would be exactly the bypass the seal exists to prevent."*

**There is a SECOND site, at the triad itself, and it is the one D-035 named.** `capability.ts:546–561` — the `guardrail-review` callback calls `testOrchestrator.coordinate(...)`, which **generates** scenarios, measures their coverage, and returns `verdict.certified`, on which the stage emits `ok` or `notApplicable`. The producer certifies itself *at a governance-triad stage*.

**The independent review board is LEGACY-ONLY TOO.** `governanceOrchestrator` is referenced from the same three files, and convened at `capability.ts:1134` in the legacy **`reporting`** stage, phase 19 — after synchronisation and the executive pack, deliberately last, and deliberately convened *regardless of what the run concluded*.

**THE CANONICAL RUNTIME HAS NEITHER.** Its `reporting` stage (`canonical-runner-capability.ts:234–245`) freezes and emits `CanonicalCapabilityResult` and convenes no board. `canonical-authoring-composer.ts` is 109 lines, one exported function, no loop. **No canonical domain re-authors on a coverage shortfall.**

**And the canonical triad still cannot decline — while the primitive to decline now exists and is used elsewhere in the same file.** `canonical-runner-capability.ts:152–172`: all three reviews are existence checks emitting `ok`/`notApplicable`. ADR-0071 landed `emit.refuse` on 2026-08-04, and **`canonical-runner-capability.ts:225` uses it** — at synchronisation, not at the triad.

### 2.2 What that changes about the question

**The question as posed presumes a collision that does not exist on the runtime that survives.** On the canonical runtime there is no loop to collide with R-12.11 and no board to satisfy R-12.2. The collision is entirely on the runtime ADR-0061 §6/§8 names for retirement.

**This is not a reason to close the ADR. It is a reason to change what it decides.** Two facts stop the easy conclusion:

1. **Retirement is blocked on this ADR** (§9.3b, D-036), so "it retires" cannot be the answer to "what should replace it".
2. **The canonical runtime does not merely lack the loop and the board — it lacks the CAPABILITY they carried.** The legacy path measures a coverage shortfall and remediates it; the canonical path measures coverage in `repository-intelligence` and **relays** it (`test-management-intelligence.ts:204–206`). Retiring the legacy runtime without a decision here does not resolve the tension — **it discards one side of it and certifies the result.**

**So the honest statement of ruling 1 is not "which mechanism wins" but:**

> **The canonical runtime has neither mechanism, its triad cannot decline, and one third of its triad could not be heard if it did. The ADR must rule what the surviving runtime does about review — and the legacy arrangement is now EVIDENCE about two designs rather than a thing to preserve or retire.**

### 2.3 The options

**A · Port the reporting-stage board to the canonical runtime.** The mechanism G-6 measured as working — independence by type (`ReviewSnapshot` frozen), by capability (`ai=0 tool=0` across all seventeen), by position (after the work). **0 of 14 approved a wholly empty run.** It does not re-enter a sealed stage, so **R-12.11 is not engaged at all**. Cost, measured and not minimised: **the reviewers are sound and the aggregator is where the defects are** — G-1/G-2/G-3 are all in `governance.final-certification`, whose `CONDITIONAL` branch is decided by substring collision between gate prose and reviewer scope labels. Porting the board ports that aggregator, and **it must be ruled to be repaired as part of the port, not after it**.

**B · Make the triad able to decline, and use it.** The vocabulary exists (`emit.refuse`); the triad does not use it; **and stage 4 has no gate, so this option is incomplete until D-066 is closed.** It satisfies R-12.2 where the constitution puts it. It does not, by itself, give the canonical runtime a remediation loop or an independent reviewer — **a stage that refuses is not a reviewer that is independent of the producer**, which is D-019's actual complaint and is untouched by giving a stage a verb.

**C · Both, with the trade recorded.** Review at stages 4–6 as the constitution requires **and** the board at reporting, with the ADR stating plainly what each is for: the triad gates progression, the board reads the whole run and cannot be reached by it.

**D · Neither; record the tension and retire the legacy runtime.** Rejected on the evidence, and named so it is a decision rather than a drift: it closes the ADR by deleting the only two working answers the platform has, and §2.2's second fact means the canonical runtime would then certify coverage with no remediation and no independent review.

**Recommendation: C, sequenced B-then-A, with D-066 closed inside B.** The reasoning is that **B is the constitutional floor and A is the mechanism that actually works**, and doing A alone leaves R-12.2 satisfied by a stage that cannot say no while doing B alone leaves the producer still the only reviewer. **The one thing the ADR must not do is what D-035 found: pay one rule for the other and record only the payment it made.**

### 2.4 What ruling 1 must record whatever it decides

- **The trade, as a trade.** D-035's finding is that *a trade recorded as a constraint forecloses scrutiny*. Whichever option wins, the ADR states what the other constraint cost.
- **That both candidate mechanisms were legacy-only when the decision was taken**, with the three-file reachability measurement — so a later reader does not re-derive it.
- **D-019's three halves and which of them this ADR closes.** ADR-0071 closed the vocabulary and its banner says it *closes D-019*; the register still lists D-019 as highest-severity open, and the measurement shows why. **An ADR closing one half of a finding records which half**, which is D-057's lesson applied to a register entry instead of an SPI.

---

## 3. RULING 2 — D-058's `toolContracts`

**The two live readings:** *"this handle calls that SPI"* and *"this run's data came through that SPI"*. Both are in use, and `repository.search.*` is **correctly** the second after D-045 moved its read into the composition.

**A third reading is already in the tree and nobody is using it deliberately.** `agent.ts:81` documents the field as *"Adapter SPIs this agent **needs**"*. **Needs** is neither *calls* nor *received data through* — an agent can need an SPI's output without calling it and without the data reaching it through that call. **So the ADR is not choosing between two meanings and adding a third; it is choosing among three, one of which is at the definition site.** That is a materially better position than D-058 records, and it removes the CHARTER §4 objection: **selecting the definition-site wording is not inventing a meaning.**

**Recommendation: rule the field to mean *this run's data came through that SPI* — the dependency reading — and amend `agent.ts:81` to say so in those words.** Reasons:

1. **It is the only reading that survives D-045's repair.** The composition now performs reads that agents formerly performed. Under the *calls* reading, every agent D-045 improved became a liar as a side effect of being fixed. A meaning that a correct repair falsifies is the wrong meaning.
2. **It makes `story.retrieval` — D-058's worked example — TRUE rather than repaired.** Its story genuinely arrives through `ProjectAdapter` (`capability.ts:405`); it simply does not make the call itself. **The declaration was never wrong; the reading was.**
3. **It is checkable, which the *calls* reading is not without per-agent attribution** — the same per-domain attribution the criteria step defers to last as its most expensive item.

**What this ruling does NOT excuse, and the ADR must say so explicitly:** the three contracts that **name no type anywhere in the repository** — `CustomerFindingStore`, `EvidenceCustody`, `TargetConnectivity`. **Those are wrong under every reading**, including the one recommended, and they are the ruling's cheapest first evidence exactly as D-058 says. **A ruling that made 21 declarations correct and left 3 naming nothing would be a type-widening programme reporting closure without touching the instances — the failure mode D-058 exists to name.**

**The typing question, and it is the D-012 half:** `readonly string[]` cannot carry either meaning. The ruling should state whether the field becomes a union of declared SPI names. **Recommendation: yes, and it is nearly free** — `CONNECTOR_SPI_DESCRIPTORS` is already exported from the framework, so the union has a source. **That alone makes the three phantom contracts a compile error rather than an audit finding**, which is D-018 applied to the exact field D-058 found drifting.

---

## 4. RULING 3 — D-062's `stageRef`

**The two live readings:** *where this domain executes* (which would make three declarations invalid outright) and *which lifecycle stage this event belongs to* (a projection, which may legitimately differ from the runner's arrangement).

**Two measurements the ruling needs and D-062 does not carry.**

**(i) `stageRef` is `string` on a FROZEN PLATFORM CONTRACT.** `packages/contracts/src/events.ts:45`, inside `PlatformEvent`. Narrowing it to `StageName` is a **contract change under compatibility gating** — the same surface `verify-contract-compatibility` guards across 7 frozen fixtures. **This is the ruling's real cost and it sits in a different package from the drift.** The `toolContracts` narrowing in ruling 2 is a framework-internal type; this one is not, and the ADR must not price them the same.

**(ii) The asymmetry is the argument.** `AgentDefinition.stage` is `StageName` — typed, and enforced by `F-7` over 144 agents with zero drift. `PlatformEvent.stageRef` is `string` — unenforced, and 8 of 13 wrong. **The same sentence about the same lifecycle, expressed twice, and only the typed one held.** That is not an argument that domains are harder than agents; it is D-012 with a control group.

**Recommendation: rule `stageRef` to mean *where this domain executes* — the same meaning `AgentDefinition.stage` already has — and accept that this makes three declarations invalid.** Reasons:

1. **Two meanings for one lifecycle position is the duplication CHARTER §4 forbids**, and the platform already spent a meaning on `stage`. The projection reading requires a *second* concept of stage membership that nothing else in the platform has.
2. **The three non-stage values decide it on their own.** `defect-management`, `synchronisation` and `executive-reporting` declare their **own domain names** as `stageRef`. Under the projection reading those are not merely unchecked, they are **not projections of anything** — there is no lifecycle stage they name. **A reading that cannot make three of its own instances meaningful is not the live reading; it is the reading that permits them.**
3. **`F-7` is the gate's template**, so the enforcement is a known quantity rather than a design.

**The eight relabellings are the cost and the ADR must scope them, not wave at them.** `test-design-intelligence` `guardrail-review`→`discovery`; `test-management-intelligence`, `automation-intelligence`, `automation-architecture` `execution-planning`→`context`; `healing` `execution`→`reflection`; and the three non-stages to whatever the runner actually does. **Note the ADR must handle: `test-design-intelligence` declares `guardrail-review` — the stage where D-035 found the legacy runtime generating and self-certifying test design. That declaration is not random; it is a fossil of the arrangement ruling 1 is deciding about, and the two rulings touch the same stage from opposite directions.** That is the strongest single reason these are one ADR.

**The fourteenth domain is the reference case and should be cited as such.** `observation-interpretation` declares `context` and runs in `planning`, **deliberately not matching** — matching one of fourteen would have made it the exception and implied the other thirteen had been checked. **Under the recommended ruling it becomes wrong**, and that is the correct outcome: it was declared against the architecturally right answer, and the ruling is that `stageRef` reports the runner rather than the architecture. **The ADR should say so plainly rather than quietly relabelling it with the other eight** — it is the one declaration whose author knew it did not match.

---

## 5. WHAT THIS REPORT DOES NOT DECIDE

- **Nothing is built.** No ADR, no gate, no relabelling, no type change.
- **D-060, D-061, D-062, D-063 remain open exactly as recorded at entry.** D-062 is *addressed* by ruling 3 and is not closed by this report.
- **D-066 is new and open**, and §2.3 recommends closing it inside ruling 1 rather than as a separate two-line change.
- **The criteria step is unblocked and unstarted.** Its denominator is corrected and its build order now begins with `no-ratio`.
- **The `DECISIONS.md` index is not reconstructed** (D-065, D-054's reason). The gate that would fix it is six lines and is not written here.

## 6. THE ONE ACTION NOW

**Rule on §1 first — one ADR or three.** The three rulings' recommendations stand or fall on that answer, and ruling 1's own shape changed under measurement: **it is no longer choosing between two mechanisms, because both were measured to be on the retiring runtime and the surviving one has neither.**
