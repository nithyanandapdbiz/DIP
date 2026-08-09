# ADR-0076 — What a declaration means when its type cannot carry it, and where independent review lives

**Status:** ACCEPTED · **Date:** 2026-08-05 · **Accepted:** 2026-08-05
**FROZEN ON ACCEPTANCE**, as ADR-0069 and ADR-0070 were. New findings go to `TECHNICAL_DEBT.md` and `PROJECT_STATE.md`. **This document is amended only if a finding changes the DECISION** — not to record what implementing it discovered.
**Supersedes:** nothing · **Amends:** ADR-0071 (its repair did not reach `architecture-review`; this ADR completes it), `AgentDefinition.toolContracts` semantics in `@dbiz/capability-framework`, `PlatformEvent.stageRef` in `@dbiz/contracts` (frozen, compatibility-gated) · **Relates to:** ADR-0061 §6/§8 (legacy retirement, blocked on this), ADR-0062 (the platform lifecycle these rulings arrange against), ADR-0022 §3 (internal structure is not a stage)
**Rules:** `TECHNICAL_DEBT.md` D-035, D-058 (the `toolContracts` half), D-062, D-066 · **Amends:** D-019 (closes its third half; see §4.1.3)

> **Section numbering follows R-18.27's required set, not the order in which this ADR was designed.** The governing principle is §2; the three rulings are §4.1, §4.2 and §4.3, ruling 1 first.

---

## 1. Problem

**Three fields in this platform declare something the platform can prove wrong, and nothing catches any of them. A fourth field declares the same thing as one of the three and has never drifted. The difference is its type.**

| Field | Type | Enforced | Measured drift |
|---|---|---|---|
| `AgentDefinition.stage` | **`StageName`** | **yes — gate `F-7`, 144 agents** | **none** |
| `PlatformEvent.stageRef` | `string` | no | **8 of 13 wrong; 3 name something that is not a stage** |
| `AgentDefinition.toolContracts` | `readonly string[]` | no | **21 declare an SPI the handle never calls; 3 name a type that exists nowhere** |

`stage` and `stageRef` are **the same sentence about the same twelve-stage lifecycle**, written twice. One is a type and holds; one is a string and drifted eight ways.

**And a second problem, on the same axis, one level up.** The governance triad exists so that review is not performed by the reviewed (R-12.2). Its three stages are *declared* mandatory and *traversed* on every run. What they are able to say, and whether anything reads it, was never made structural:

- **The canonical triad's three stages are existence checks** emitting `ok`/`notApplicable` — `canonical-runner-capability.ts:152–172`. ADR-0071 landed `emit.refuse` on 2026-08-04 and the same file uses it at line 225, at synchronisation. **The triad does not.**
- **`architecture-review` has no certification gate at all.** `certification.ts:76` checks the triad for *presence*; `GATE_STAGE` then maps gates onto seven stages, and stage 4 is not among them. **Proved by running a real capability through `runCapability` — a `StageResult` carries a module-private seal and cannot be forged (R-12.11), so this is the framework's own path:**

```
refuse at (clean run)          outcome=n/a       certified=true   firstRefusal=null
refuse at architecture-review  outcome=refused   certified=TRUE   firstRefusal=null
refuse at policy-review        outcome=refused   certified=false  firstRefusal=story-certified: refused: …
refuse at guardrail-review     outcome=refused   certified=false  firstRefusal=test-certified: refused: …
```

Repeating the probe with `notApplicable` gives identical results, **so the gap predates ADR-0071 and was not created by it.** It is `@dbiz/capability-framework`, therefore all five implemented capabilities. **A governance-triad stage can do its work, say no, seal that answer, and the run certifies.**

## 2. Context

### 2.1 The principle this ADR establishes

> **A declaration whose type admits values the platform can prove wrong is a different kind of object from one whose type does not.**
>
> The first is a comment with syntax highlighting. The second is a constraint. **"Nothing checks it" is the symptom; the type is the cause** — because a field typed to admit only correct values needs no checker, and a field typed `string` needs one that nobody ever writes.

**`stage` versus `stageRef` is the control group, and it is why this is a measurement rather than a preference.** Two fields, one lifecycle, one sentence, written by the same programme against the same twelve stages. The typed one is enforced by `F-7` across 144 agents with zero drift. The `string` one is wrong in eight of thirteen cases and three of those name something that is not a stage at all. **No difference in author care, review, or subject matter explains that. The type does.**

This is D-012 — *declaration and enforcement are one atomic change, preferred form: make an unenforced field unrepresentable* — with an unusually clean natural experiment attached, and D-018's *prefer structural impossibility to tests* read from the failure side.

### 2.2 What ruling 1's subject turned out to be

The question of record (D-035, `SECTION_F1_DESIGN_REPORT.md` §3): *can a coverage-remediation loop and an independent review of its output coexist under a forward-only runner?* `AGENT_MIGRATION_BAR.md` G-6 narrowed it to a choice between two mechanisms rather than the design of one.

**Measured at `683418e`, both mechanisms are on the retiring runtime and the surviving one has neither.**

| Mechanism | Reachable from | Runs at | On the canonical runtime? |
|---|---|---|---|
| Coverage-remediation loop (`authoringOrchestrator`) | its definition, a re-export, `capability.ts` | `capability.ts:697` — **stage 7, execution-planning** | **no** |
| Independent review board (`governanceOrchestrator`) | its definition, a re-export, `capability.ts` | `capability.ts:1134` — **legacy reporting, phase 19** | **no** |
| Producer self-certifying at a triad stage | — | `capability.ts:546–561` — **stage 6, guardrail-review** | n/a (D-035's site) |

The canonical `reporting` stage freezes a result and convenes no board (`canonical-runner-capability.ts:234–245`). `canonical-authoring-composer.ts` is 109 lines with one exported function and no loop. No canonical domain re-authors on a shortfall.

**This does not close the question, for two reasons.** Retirement is *blocked on this ADR* (`PROJECT_STATE.md` §9.3b, D-036), so "it retires" cannot be the answer to "what replaces it". And the canonical path does not merely lack the two mechanisms — **it lacks the capability they carried**: it measures coverage in `repository-intelligence` and *relays* it (`test-management-intelligence.ts:204–206`). **Retiring the legacy runtime unruled would discard one side of the tension and certify the result.**

### 2.3 Why these are one ADR and not three

They share §2.1's principle, and two of them are the same ambiguity in two fields: `toolContracts` and `stageRef` each have exactly two live readings, and in both cases one is *what this unit does* and the other is *what this unit belongs to*. Ruling either alone fixes a meaning for one field and leaves the identical ambiguity in the other, with nothing to tell the next reader whether the difference was deliberate.

**And they touch.** `test-design-intelligence` declares `stageRef: 'guardrail-review'` — **a fossil of the exact arrangement ruling 1 decides**, since `guardrail-review` is where the legacy runtime generates test design and certifies it. Ruling 3 relabels that declaration; ruling 1 decides what that stage is for. Splitting them would let one be decided by the other's side effect.

## 3. Alternatives

**A · Rule the three fields separately, as three ADRs.** Rejected — §2.3. Three documents answering one question about three fields, with the relationship recorded nowhere.

**B · Rule only the naming questions (2 and 3) and defer ruling 1.** Rejected. It is the option that looks safest and is not: relabelling `test-design-intelligence`'s `stageRef` away from `guardrail-review` erases the evidence that the legacy arrangement put test design there, while leaving the arrangement in place.

**C · On ruling 1 — retire the legacy runtime and record the tension as closed by deletion.** Rejected on §2.2's second fact. It deletes the only two working answers the platform has and leaves the canonical runtime certifying coverage with no remediation and no independent review.

**D · On ruling 1 — the triad refuses (B), alone.** Rejected as sufficient. It satisfies R-12.2's *letter* and not its *purpose*: a stage that reviews the artefact it was handed by the composition it belongs to is not independent of the producer. **Giving a stage a verb does not make it a reviewer.**

**E · On ruling 1 — port the board (A), alone.** Rejected as sufficient. It leaves R-12.2 satisfied by three stages that cannot say no, which is D-019 unrepaired, and it makes the platform's only real review a thing that happens after certification rather than a thing certification depends on.

**F · On `toolContracts` — rule it to mean "this handle calls that SPI".** Rejected, and the reason is decisive: **D-045 moved reads out of agents and into the composition, so under this reading every agent that repair improved became a liar as a side effect of being fixed.** A meaning that a correct repair falsifies is the wrong meaning.

**G · On `stageRef` — rule it a projection ("which lifecycle stage this event belongs to").** Rejected. It requires a second concept of stage membership that nothing else in the platform has, and **it cannot make three of its own instances meaningful**: `defect-management`, `synchronisation` and `executive-reporting` declare their own domain names, which are projections of nothing. A reading that merely *permits* its worst instances is not the live reading.

## 4. Decision

### 4.1 · RULING 1 — Independent review: the triad refuses, then the board ports. Option C, sequenced B-then-A.

**Both, and in that order.** The triad is the constitutional floor; the board is the mechanism that measurably works. Neither is sufficient alone (§3 D, E).

#### 4.1.1 · Phase B — the governance triad acquires the ability to decline, and something reads it

1. **The canonical triad's three stages SHALL emit `refuse` — not `notApplicable` — when their review does not approve.** `notApplicable` asserts *there was nothing to review*; a review that ran and objected SHALL NOT claim it did no work. This is ADR-0071's primitive applied where ADR-0071 was written to apply it.
2. **`architecture-review` SHALL be gated (closes D-066).** A certification gate `architecture-certified` SHALL map to `architecture-review` in `GATE_STAGE`, and SHALL be the **first** member of the ordered `CERTIFICATION_GATES` list, because stage 4 precedes stages 5 and 6 and `progressedTo` reads that list as a progression.
3. **The reviews SHALL remain what they are in substance until phase A lands, and this ADR says so rather than implying otherwise.** Making a stage able to refuse does not make it independent. Phase B closes *"the triad cannot decline"*; it does not close *"review is performed by the reviewed"*.

#### 4.1.2 · Phase A — the review board ports to the canonical runtime, **with its aggregator repaired as part of the port**

4. **The independent review board SHALL be composed into the canonical runtime at `reporting`**, preserving all three independence properties that were measured to hold: **by type** (`ReviewSnapshot` is a frozen value, not a live handle — *"an invocation from inside a review is no longer a review"*), **by capability** (`ai=0 tool=0` across all seventeen governance agents, verified from the census), and **by position** (after the work, and convened regardless of what the run concluded). **It does not re-enter a sealed stage, so R-12.11 is not engaged.**
5. **THE AGGREGATOR IS REPAIRED AS PART OF THE PORT, NOT AFTER IT.** The reviewers are sound; `governance.final-certification` is where the defects are, and porting it unrepaired would install three known defects into the runtime that survives. Binding, all three:
   - **G-1 — four of nine mandatory gates are satisfied by absence.** Bare `Array.prototype.every` on empty collections, in an array literal where three sibling gates *are* explicitly zero-guarded. *"Certified automation architecture"* is satisfied by having generated no automation. **And the gate that rescues the empty case is itself vacuous** — `input.reviews.every(r => r.approved)` is `true` on an empty reviewer list, so on the gates alone absence scores 4 of 9, and with the board absent, 5 of 9. **Every mandatory gate SHALL distinguish an empty collection from a uniformly satisfactory one.**
   - **G-2 — the `CONDITIONAL`/`BLOCKED` decision is made by substring collision between two undeclared namespaces.** Gate prose against terse reviewer scope labels, related by `includes` in both directions. Three of nine collide; six of nine can never reach `CONDITIONAL` for purely lexical reasons. **Renaming a gate string — a documentation act — silently moves a release decision. A gate SHALL name the reviewer supplying its evidence through a declared relation, not through spelling.**
   - **G-3 — `reviewer()`'s `scope` parameter is discarded** (`void scope;`), so every reviewer carries two scope strings and the surviving one is the terse one G-2 matches on. **The discarded string is the descriptive one — the very thing that would have made G-2's relation legible.** The dead parameter SHALL be either wired as that declared relation or removed; it SHALL NOT be ported as-is.

#### 4.1.3 · THE TRADE, RECORDED AS A TRADE

D-035's finding was not the placement. It was that **R-12.2 was paid for R-12.11 and only one side of the payment was ever written down** — in a comment that reads as necessity, which is why it survived D-019, a design report and a ruling. *A trade recorded as a trade invites scrutiny; a trade recorded as a constraint forecloses it.* This ADR therefore records its own:

> **What this ruling costs.** Placing independent review at `reporting` means **review does not gate progression**. The board reads a run that has already been certified and executed; it can report a finding it cannot prevent. That is a real loss and it is accepted, because the alternative — review inside the stage that produced the artefact — is the defect the triad exists to prevent, and the platform has measured what that produces.
>
> **What phase B buys back, and what it does not.** Gating stages 4–6 with refusal restores *progression control*. It does not restore *independence*. **Two mechanisms are being kept because neither is a whole answer, and this ADR states that rather than presenting the pair as a design.**
>
> **What was true when this was decided.** Both candidate mechanisms were legacy-only — `authoringOrchestrator` and `governanceOrchestrator` are each reachable from exactly three files (definition, re-export, `capability.ts`), and neither is reachable from the canonical runtime. **A later reader SHALL NOT have to re-derive this**, because the conclusion depends on it entirely.

#### 4.1.4 · Which half of D-019 this ADR closes

D-019 has **three** halves. ADR-0071's banner says it *closes D-019*; the register still lists D-019 as highest-severity open, and the measurement shows why.

| Half | State |
|---|---|
| A triad stage could not **say** no | **CLOSED by ADR-0071** (`emit.refuse`) |
| One triad stage — `architecture-review` — has **no channel** for its answer | **CLOSED HERE**, §4.1.1 item 2 (D-066) |
| `certify()` never reads `value`; and the reviews remain existence checks over artefacts the composition handed them | **NOT CLOSED.** §4.1.1 item 3 and §4.1.3 state this explicitly. D-019 stays open, amended to this scope. |

**An ADR that closes one half of a finding records which half.** That is D-057's lesson — a scope stated over a session's work rather than over the artefact, silent about what it excluded — applied to a register entry instead of an SPI.

### 4.2 · RULING 2 — `toolContracts` means *this run's data came through that SPI*

**The dependency reading, not the call reading.**

6. **`AgentDefinition.toolContracts` SHALL declare the adapter SPIs through which this agent's input reached it, whether or not this agent's handle performs the call.**
7. **`agent.ts:81` SHALL be amended to say so in those words.** Its current wording — *"Adapter SPIs this agent **needs**"* — is a **third** reading already at the definition site, matching neither live use. **This ADR is therefore selecting among three meanings, one of them the definition's own, not inventing a fourth**; CHARTER §4's objection to a new definition arriving in passing does not apply.
8. **The three contracts that name no type anywhere in the repository — `CustomerFindingStore`, `EvidenceCustody`, `TargetConnectivity` — are WRONG UNDER EVERY READING, including this one, and are NOT excused by it.** They are the ruling's cheapest first evidence. **A ruling that made 21 declarations correct and left three naming nothing would be a type-widening programme reporting closure without touching its instances — the failure mode D-058 exists to name.**
9. ~~**The field SHALL be narrowed from `readonly string[]` to a union of declared SPI names**, sourced from `CONNECTOR_SPI_DESCRIPTORS`, which the framework already exports. **This makes the three phantom contracts a compile error rather than an audit finding** — §2.1's principle applied to the field that produced it.~~

> ### 4.2.1 · AMENDMENT — item 9 REPLACED, 2026-08-05 (`TECHNICAL_DEBT.md` D-071)
>
> **This ADR is frozen on acceptance and amended only where a finding changes the DECISION. This one does**, so item 9 is struck and replaced here rather than corrected in a register entry. Item 9's original text is retained above, struck through, because what it assumed is the finding.
>
> **RULED: THE SPI NAMESPACE IS OPEN. The framework does not own it.**
>
> Measured before landing the type, per ADR-0074 §6.1: `CONNECTOR_SPI_DESCRIPTORS` holds **three** descriptors; the framework exports **nine** adapter interfaces; **eleven** distinct names are in live use. Three of the eleven — `SecurityAdapter` (14 declarations), `LoadGeneratorAdapter` (3), `MonitoringAdapter` (1) — are **owned by capabilities**. Narrowing to the named source would make eight of eleven legitimate declarations a compile error.
>
> **A union sourced from a framework registry cannot express a namespace the framework does not own.** Closing it to the nine excludes the capability-owned SPIs, which is P-004's bespoke-capability-architecture pressure arriving through a type; widening the framework to carry them makes the framework declare knowledge of five capabilities' tool surfaces, which is the same violation from the other side. **Neither is implementable.**
>
> **9′. The check SHALL be RESOLUTION, not membership.** Not *"is this name in a closed list"* but **"does this name RESOLVE to an SPI interface that exists"** — wherever it lives, framework or capability. Delivered as `governance/verification/verify-tool-contracts.js`. It catches the three phantom contracts on the grounds item 8 already names — wrong under every reading — **without asserting framework ownership of the namespace**. It resolves both declaration forms in live use: a bare SPI name, and `Spi.operation`, the second of which is checked against the interface's actual members and is therefore stricter than the narrowing would have been.
>
> #### §2.1's FIRST LIMIT, and it is the reason this amendment is worth more than the gate
>
> > **"Make an unenforced field unrepresentable" has no implementation where the valid set is not owned by the type's package.**
>
> §2.1 rules that a declaration whose type admits values the platform can prove wrong is a different kind of object from one whose type does not, and D-018 prefers structural impossibility to tests. **This is the first place in this ADR where that preferred form is unavailable** — not inconvenient, unavailable: the type lives in `@dbiz/capability-framework` and the valid set is contributed by five capabilities, so no expression in the framework can enumerate it without either excluding valid members or importing knowledge it must not hold.
>
> **D-012 already names the fallback** — *declaration and enforcement are one atomic change*, with unrepresentability as the **preferred** form and enforcing code plus a proving test as the general one. **A gate is that fallback, and reaching for it here is the rule working rather than the rule being bypassed.**
>
> #### THE TEST — ownership of the valid set, applied before reaching for a type
>
> > **Before making a field's valid set unrepresentable, ask who OWNS that set. Where the type's own package does not own it, the preferred form has no implementation and a gate is the correct fallback.**
>
> **IT HAS TWO FAILURE MODES, AND THE SECOND WAS FOUND ONE RULING AFTER THE TEST WAS WRITTEN.** This section first stated the test with one mode and asserted, on that basis, that rulings 2 and 3 were asymmetric — that `stageRef`'s valid set was owned by the same package as the field, so the preferred form applied to ruling 3. **That premise was false** (`TECHNICAL_DEBT.md` D-073).
>
> | # | Mode | Instance | Why it defeats unrepresentability |
> |---|---|---|---|
> | **1** | The valid set is contributed by **CONSUMERS** | **Ruling 2** — `toolContracts`; five capabilities own SPI names | The framework cannot enumerate the set without importing knowledge it must not hold, and closing it excludes valid members |
> | **2** | The valid set lives **DOWNSTREAM of the field** | **Ruling 3** — `stageRef` is in `@dbiz/contracts`; `StageName` is in `@dbiz/capability-framework`, which **depends on** contracts | The import inverts the dependency. The compiler says so before any consumer is reached: `TS2307` |
>
> **Mode 2 is the harder of the two to see, and the reason is structural: it is invisible to any reading of the field itself.** `readonly stageRef: string` in a contracts file gives no hint that its valid set is one package away in the wrong direction — nothing at the declaration site, in its type, or in its neighbours carries the dependency graph. Mode 1 at least announces itself the moment you look for the set and find five owners. **Mode 2 announces itself only when you try.**
>
> **So rulings 2 and 3 are symmetric after all, by different mechanisms** — and the asymmetry asserted here was the error, not the finding. Both fields keep `string`; both are enforced by a gate (`verify-tool-contracts.js`, `verify-domain-stage-ref.js`); item 11's narrowing is owed a package-ownership decision exactly as item 9's was owed a namespace ruling (D-072).
>
> **HOW BOTH MODES WERE FOUND IS THE REUSABLE PART: by applying the rule to the work done under it, soonest.** Mode 2 was found one ruling after the test was written, in the very next ruling the test was used to justify. That is the same order that found T5, the criterion-namespace collision, and D-071 — a rule turned on its own most recent application, before adoption rather than after. **A rule is worth most turned on the work done under it, and soonest.**

**Why the dependency reading:** it is the only one D-045's repair does not falsify (§3 F); it makes `story.retrieval` — D-058's worked example — **true rather than repaired**, since its story genuinely arrives through `ProjectAdapter` (`capability.ts:405`) and it simply does not make the call; and it is checkable without per-domain call attribution, which is the criteria programme's most expensive deferred item.

### 4.3 · RULING 3 — `stageRef` means *where this domain executes*

10. **`PlatformEvent.stageRef` SHALL name the lifecycle stage in which the emitting domain actually executes** — the same meaning `AgentDefinition.stage` already carries. One lifecycle, one concept of position.
11. **`stageRef` SHALL be narrowed from `string` to `StageName`.** This makes the three non-stage values unrepresentable rather than merely wrong.
12. **The eight disagreements are relabelled, scoped individually.** Measured from `canonical-runner-capability.ts`:

| Domain | Declared | Actually runs in | Note |
|---|---|---|---|
| `test-design-intelligence` | `guardrail-review` | **`discovery`** | **The fossil.** `guardrail-review` is where the legacy runtime generates and self-certifies test design (D-035). See §4.3.1. |
| `test-management-intelligence` | `execution-planning` | **`context`** | |
| `automation-intelligence` | `execution-planning` | **`context`** | |
| `automation-architecture` | `execution-planning` | **`context`** | |
| `healing` | `execution` | **`reflection`** | |
| `defect-management` | `defect-management` | **`reflection`** | not a stage |
| `synchronisation` | `synchronisation` | **`certification`** | not a stage; note **`certification`**, not `reporting` |
| `executive-reporting` | `executive-reporting` | **`certification`** | not a stage; note **`certification`**, not `reporting` |

Five agree and are unchanged: `tenant-resolution`, `application-strategy-resolution`, `story-intelligence` (`planning`), `repository-intelligence` (`discovery`), `execution` (`execution`).

13. **`observation-interpretation`'s mismatch is stated plainly, not corrected with the others.** It declares `context` — the architecturally correct EP→IP stage — and runs in `planning`. **Its author knew it did not match**: matching one of fourteen would have made it the exception and implied the other thirteen had been checked. **Under this ruling it becomes wrong, and that is the correct outcome**, because the ruling is that `stageRef` reports the *runner* and not the *architecture*. **It is relabelled to `planning` as a consequence of this ruling, and this ADR records that its declaration was a deliberate, reasoned mismatch rather than drift.** The nine relabellings are therefore eight defects and one correct declaration overruled.
14. **A gate SHALL compare every domain's declared `stageRef` against the stage the composition invokes it in**, on `F-7`'s template. **It is writable the moment this ruling exists and was not before** (D-062).

#### 4.3.1 · The fossil, and why ruling 3 does not erase it

`test-design-intelligence`'s `guardrail-review` is the only declaration in the set that points at a *governance* stage. It is a record of the arrangement §4.1 is deciding about. **Relabelling it to `discovery` is correct and would destroy the evidence**, so this ADR records the prior value and its meaning here, in the document that rules on the arrangement it came from.

### 4.4 · WHAT THIS ADR DOES NOT TOUCH

**Stated because ADR-0072 did not, and four SPIs were silently outside its scope for a session's work — D-057.** This ADR:

- **Does NOT change `certify()`'s treatment of `value`.** It remains unread (D-019's third half, §4.1.4).
- **Does NOT rule on the 575 `failureHandling` declarations outside F2's instrument**, nor on D-024's own live instance, nor on D-057's four SPIs and twenty-two unimplementable declarations. Those are a separate ADR, already owed.
- **Does NOT rule on `AgentDefinition.stage`.** It is correct, typed and enforced; it is this ADR's control group, not its subject.
- **Does NOT touch the other five capabilities' triad implementations.** §4.1.1 items 1 and 3 bind the **Functional Testing** canonical runtime. Item 2 is framework and therefore reaches all five — deliberately, and its consequence is §5.
- **Does NOT rule what any capability's `architecture-review` should refuse ON.** Gating stage 4 makes five capabilities' never-read emissions load-bearing; **what each should refuse on is that capability's decision** (D-024, D-057's precedent), and each is `UNDECIDED — <capability>` until taken.
- **Does NOT touch `authoringOrchestrator` or the legacy runtime's arrangement.** They are ADR-0061's retirement, unblocked by this ADR and not performed by it.
- **Does NOT reconstruct the `DECISIONS.md` ADR index** (D-065, D-054's reason).

## 5. Consequences

**A gate is added to an ordered list, and that reaches every capability.** `architecture-certified` lands first in `CERTIFICATION_GATES`, so **`progressedTo` shifts for all five implemented capabilities**: no run is `story-certified` until `architecture-certified` is. This is intended — stage 4 precedes stages 5 and 6 — and it is the single widest-reaching consequence in this ADR. **Every capability's `architecture-review` emission becomes load-bearing on the same day**, which is why §4.4 refuses to also decide what each should refuse on.

**Runs that certified before may not certify after, and that is the point.** A capability whose `architecture-review` emits `notApplicable` today — including the Functional Testing canonical runtime at `canonical-runner-capability.ts:156`, when no architecture components were authored — will produce `certified: false` once gated. **A certification that changes because a control started working is not a regression.** (P-002: a gate's value is entirely in its ability to fail.)

**Two type narrowings with very different costs, and they SHALL NOT be priced the same.**

| | Ruling 2 · `toolContracts` | Ruling 3 · `stageRef` |
|---|---|---|
| Package | `@dbiz/capability-framework` | **`@dbiz/contracts`** |
| Nature | **framework-internal type** | **FROZEN PLATFORM CONTRACT** |
| Gate | package suite | **`verify-contract-compatibility`, 7 frozen fixtures** |
| Surface | agent definitions across five capabilities | every `PlatformEvent` producer **and every fixture that constructs one** |

**The drift is in the Functional Testing domains and the type is in `contracts`.** Ruling 3's change crosses a package boundary that ruling 2's does not, and it lands on the surface a compatibility gate guards.

**ADR-0074 §6.1 binds both narrowings: the surface of an interface change is CONSUMERS PLUS IMPLEMENTORS.** A `grep` for call sites finds the first group and is structurally blind to the second, because a fixture constructing a `PlatformEvent` never names the field in a way a call-site search matches. **Both surfaces SHALL be measured by landing the type and letting the compiler enumerate, not by estimation** — §6.1 records that estimation was wrong by a factor that mattered, and §6.2.3 amends the stopping rule to **suite-green, not build-green**.

**What gets better.** Eight domain declarations stop asserting a position they do not occupy. Twenty-one agent declarations stop asserting a call they do not make — **without a single one of them changing, because the reading changes instead**. Three phantom contracts become compile errors. The governance triad acquires a channel it has never had at stage 4. The platform's only measurably independent review mechanism reaches the runtime that survives, with its three known aggregator defects repaired rather than transported.

**What stays open, named.** D-019's third half. The 575 declarations outside F2's instrument. D-057's four SPIs. D-060, D-061, D-063. **The triad's reviews remain existence checks over artefacts the composition handed them, and no ruling here changes that.**

## 6. Migration strategy

**Phase order is binding. B before A, and within B, the framework change before the capability change.**

**B1 · Framework — the gate (D-066).** Add `architecture-certified` to `CERTIFICATION_GATES` as its first member and to `GATE_STAGE` → `architecture-review`. **Land the probe as a conformance test first, observed failing against current `main`, then passing** — a gate that has never been seen to fail is indistinguishable from one that cannot (D-008), and this one was observed *not* failing when it should have. Re-run all five capabilities' suites; expect movement in `progressedTo` assertions and treat each as a finding to read, not a test to update.

**B2 · Functional Testing — the triad refuses.** `canonical-runner-capability.ts:152–172`: negative branches from `notApplicable` to `refuse`. **Guarded both ways** — a review that genuinely had nothing to review still emits `notApplicable`, and turning every negative into a refusal would destroy the distinction ADR-0071 exists to carry.

**A1 · Port the board with its aggregator repaired.** §4.1.2 items 4 and 5 land together. **G-1, G-2 and G-3 are fixed in the port, not after it.** Each repair carries a test that fails on the unrepaired form: an empty-collection run that must not score 4 of 9; a gate rename that must not move a release decision; a reviewer whose declared relation to its gate is read rather than spelled.

**2 · `toolContracts`.** Amend `agent.ts:81` wording. Narrow the type from `CONNECTOR_SPI_DESCRIPTORS`. **The three phantom contracts become compile errors and are resolved individually — named, not deleted to make the build green.** Surface measured by the compiler per ADR-0074 §6.1, including every agent-definition fixture.

**3 · `stageRef`, LAST, and separately.** It is the compatibility-gated contract change and it SHALL NOT be batched with ruling 2's framework-internal one. Order: (a) relabel the eight, plus `observation-interpretation`, against the measured table in §4.3 — **behaviour-neutral, since no composition emits these events today**; (b) narrow `PlatformEvent.stageRef` to `StageName` in `@dbiz/contracts`, with `verify-contract-compatibility` read **before and after** over its 7 frozen fixtures; (c) add the `F-7`-shaped gate comparing declaration to composition. **If (b)'s compatibility cost is materially larger than measured, (a) and (c) still stand and (b) is recorded as owed** — the relabelling and the gate deliver most of the value and neither depends on the narrowing.

**Stopping rule: suite-green, not build-green** (ADR-0074 §6.2.3). **Gate deltas are measured against a stashed clean tree rebuilt from source and diffed**, not inferred from summary lines.

## 7. Version impact

| Artefact | Change | Class |
|---|---|---|
| `@dbiz/capability-framework` | `CERTIFICATION_GATES` gains an ordered member; `GATE_STAGE` gains a key; `toolContracts` narrowed; `agent.ts:81` reworded | **MAJOR** — both narrowings and the gate list are breaking for exhaustive consumers |
| `@dbiz/contracts` | `PlatformEvent.stageRef` `string` → `StageName` | **MAJOR** — frozen contract, compatibility-gated |
| Functional Testing — 14 domain modules | `stageRef` relabelled on the observability event | **MINOR** per module (`v1.0.0` → `v1.1.0`) |
| Functional Testing — canonical runner | triad refusal; review board composed at `reporting` | **MINOR** — additive to the composition; the arrangement is unchanged |
| Functional Testing — review board + aggregator | G-1/G-2/G-3 repairs | **PATCH** in shape, **behaviour-changing** in effect; §5 |

**These are the change classes, not the measured surfaces.** Per ADR-0074 §6.1 the exact consumer-plus-implementor counts SHALL be produced by landing each type and reading the compiler, and SHALL NOT be estimated in advance. **If the canonical workflow manifest requires amendment, the FWGA lock refuses execution until `--relock`** — expected, and the refusal is the mechanism working.

## 8. Affected components

**Paths are repo-relative and glob-free, so each resolves to a file that exists** — `verify-change-control-completeness` check 3 reads this section literally, and a glob names nothing it can find.

**Framework — `@dbiz/capability-framework`**
- `packages/capability-framework/src/certification.ts` — `CERTIFICATION_GATES`, `GATE_STAGE`, `certify` (D-066)
- `packages/capability-framework/src/agent.ts` — lines 81–82, `toolContracts` wording and type
- `packages/capability-framework/src/adapters.ts` — `CONNECTOR_SPI_DESCRIPTORS` as the union's source
- `packages/capability-framework/src/stages.ts` — `STAGES`, `GOVERNANCE_TRIAD` (read, not changed)

**Contracts — `@dbiz/contracts`**
- `packages/contracts/src/events.ts` — line 45, `PlatformEvent.stageRef` · **frozen; `verify-contract-compatibility`, 7 fixtures**

**Functional Testing — `@dbiz/functional-testing-engine`**
- `packages/functional-testing-engine/src/canonical-runner-capability.ts` — 152–172 triad refusal · 234–245 board composition at `reporting`
- `packages/functional-testing-engine/src/agents/review-board.ts` — `reviewer()` scope (G-3), line 554 `CONDITIONAL` decision (G-2), mandatory gates (G-1)
- `packages/functional-testing-engine/src/orchestrators.ts` — 1106–1128, the board aggregator being ported

**The nine `stageRef` declarations — eight drifted, one deliberate (§4.3)**
- `packages/functional-testing-engine/src/domains/test-design-intelligence.ts` — the fossil (§4.3.1)
- `packages/functional-testing-engine/src/domains/test-management-intelligence.ts`
- `packages/functional-testing-engine/src/domains/automation-intelligence.ts`
- `packages/functional-testing-engine/src/domains/automation-architecture.ts`
- `packages/functional-testing-engine/src/domains/healing.ts`
- `packages/functional-testing-engine/src/domains/defect-management.ts`
- `packages/functional-testing-engine/src/domains/synchronisation.ts`
- `packages/functional-testing-engine/src/domains/executive-reporting.ts`
- `packages/functional-testing-engine/src/domains/observation-interpretation.ts` — deliberate, overruled (§4.3 item 13)

Agent definitions declaring `toolContracts` span all files under `packages/functional-testing-engine/src/agents/` and the four sibling capabilities; **the surface is enumerated by the compiler, not listed here** (ADR-0074 §6.1).

**Other capabilities — gated stage 4 reaches all five**
- `dev-change-engine`, `discovery-flow-engine`, `penetration-testing-engine`, `security-testing-engine`, `performance-engine` — each `architecture-review` emission becomes load-bearing; **what each refuses on is `UNDECIDED — <capability>`**

**Governance**
- The new `F-7`-shaped domain `stageRef` gate
- `verify-adr-completeness`, `verify-contract-compatibility`, capability-conformance, `run-functional-completeness.mjs`, `run-capability-conformance.mjs` — the last two invisible to both `tsc` and the package suite (D-045)

**Programme**
- `TECHNICAL_DEBT.md` — D-035, D-058, D-062, D-066 ruled; **D-019 amended, not closed** (§4.1.4)
- `DECISIONS.md` — this ADR indexed, **and the six-row gap is D-065's, not closed here**
