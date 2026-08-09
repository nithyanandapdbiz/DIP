# The 135 — acceptance-bar answers

**The bar, applied to every agent that is not one of the nine `sync.design-*`:**

> *What does this agent assume that is true only because something below it cannot yet fail?*

The reading is the deliverable; this file is its residue. Recorded in domain-sized batches, each reported before the next begins. **An answer of "nothing" is a signal the reading went shallow** and is not recorded as a result — where a batch genuinely yields nothing, that is stated as a measured absence with what was read.

---

## THE SWEEP FINDING — IT GOVERNS ALL TEN BATCHES, NOT BATCH 1

**EVERY FINDING IN THIS STEP IS A RECORD, NOT A REPAIR. That holds for all ten batches and is not restated in each.**

**The 135 are downstream of placement, and placement is behind F3.** Nothing here can be repaired into its caller, because the caller is being deleted; nothing here can be repaired into the canonical runtime, because no canonical domain invokes an agent. **The reading exists to inform the placement decision, not to precede a fix** — a finding recorded now is a thing F3 must not carry across, and that is its whole function until F3 rules.

## THE MIGRATION'S REFERENCE SHAPE — `ReviewVerdict`

**Not a batch finding. The thing the migration copies.**

```ts
readonly approved: boolean;
readonly unreviewable: string | null;   // <- the second field is the whole point
```

**`could-not-review` and `did-not-pass` are different values, and `verdict()` forces `approved: false` whenever `unreviewable` is set.** Measured on a wholly empty snapshot: **0 of 14 reviewers approved** — thirteen returned `unreviewable`, one returned findings. The factory states the reasoning in its own `failureHandling`: *"Treating an absent artefact as a passed review is how a false-positive release recommendation is issued."*

**This is D-043's problem solved correctly, in the same package, by the same kind of unit.** `test.certification` has one boolean and concludes on emptiness; a reviewer has two fields and declines. **The pattern is therefore not inherent to the vocabulary, the package, or the era of the code** — which removes the last available excuse for D-043 and, more usefully, means the migration does not have to invent a shape. It has one, it is already in the tree, and it is measurably honest.

**The generalisation, which is the standing reach-versus-refuse rule in a return type:** wherever an agent can conclude, it must be able to say it could not. One boolean cannot carry both, and every instance of the truthful-negative pattern recorded in `TECHNICAL_DEBT.md` is a place where one was asked to.

**Read with G-1/G-2/G-3, which are in the code that CONSUMES these verdicts.** The reference shape is the verdict, not the review board wholesale: the reviewers are sound and the aggregator is where the defects are.

## THE SECOND REFERENCE SHAPE — `healing.validation`'s `| null`

**The read direction, done right, two files from the platform's worst read.**

```ts
{ action: HealingAction; retryOutcome: TestOutcome['outcome'] | null }
// `null` means the Execution Plane did not observe a retry. That is NOT a pass —
// an unobserved retry leaves the defect visible, which is the safe direction.
handle: (input) => ({ ...input.action, validated: input.retryOutcome === 'passed' }),
```

`healing.validation` reads an execution result exactly as `repository.search.*` reads a customer repository. **Its type can say the read did not happen; theirs cannot.** Not-observed is a third value, the consumer treats it as not-validated, and the comment states why.

**CROSS-REFERENCED TO F3'S NINTH SCOPE ITEM (`PROJECT_STATE.md` §9.3d-ii) AS THE PROOF THAT THE REPAIR IS ONE UNION MEMBER AND NOT A REDESIGN.** The read direction of ADR-0072/0073 is asking for precisely what this agent already has. **An argument that the ninth item is large should be answered with this file.**

## THE READING INSTRUCTION — **the direction of the default, not the ambiguity**

**This replaces the bar's phrasing for the remaining files.** The bar asked what an agent assumes that is true only because something below it cannot fail. **That question finds the collapse. It does not rank it, and three batches showed the same collapse producing outcomes three orders apart.**

> **The ambiguity is not the defect. The DIRECTION OF THE DEFAULT under ambiguity is.**
> **Ask of each collapse: what does the consumer do when it cannot tell, and is that the safe direction?**

| Instance | Ambiguous value | Consumer's default | Outcome |
|---|---|---|---|
| **T-2** — `test.*` techniques | `[]` | counts coverage as satisfied | **coverage claimed that does not exist** |
| **D-045** — `repository.search.*` | `[]` | decides CREATE | **duplicates a customer's repository** |
| **H-2** — `healing.*` kinds | `null` | proposes no heal | **the defect stays red** |

**Same collapse, three consequences, and the variable is not the ambiguity — it is which way the consumer defaults when it cannot tell.** `healing.*` chose deliberately and said so: *"Healing a genuine defect would hide it, which is worse than a red test."*

**An ambiguity whose default is safe is debt. An ambiguity whose default acts on a customer's system is D-045.**

## CONVERGENCE — `defect.genuineness`, recorded because the register is heavy with divergence

**Three independent statements of the same rule, agreeing.** The `failureHandling`: *"Ambiguous failures are treated as GENUINE. Suppressing a real defect costs more than an extra triage."* The `promptContract.rejectionRules`: *"where the proposal is absent or ambiguous the failure is treated as GENUINE."* The code: `return { genuine: true, … }` as the final branch, with a missing signal becoming `''` and matching no environmental pattern.

**D-007's axis is declaration-versus-behaviour drift, and this register is almost entirely instances of it.** An instance where a declaration, a rejection rule and a code path say the same thing is **evidence the standard is achievable rather than aspirational** — which matters for F3, because a migration told only what not to carry across has no example of what to carry.

## THE READING'S AGGREGATE FINDING — **the correct form is the majority, and it is adjacent**

**Recorded above its three instances, because the pattern is the finding and the instances are its evidence.**

| | Correct form | Incorrect form | Distance |
|---|---|---|---|
| **G-1** | 3 gates zero-guarded (`length > 0 &&`) | 4 gates bare `Array.every` | **same array literal** |
| **D-044** | 9 checks build `detail` as a state-dependent ternary | 3 checks pass a constant | **same function** |
| **S-1** | `story.certification` refuses on zero requirements | `test.certification` (D-043) does not | **same file** |

**In every case the correct form is the MAJORITY and is ADJACENT to the incorrect one.** Not a knowledge problem — the author demonstrably knew the form, used it more often than not, and applied it within a few lines. Not a design problem — no mechanism is missing; `check(name, passed, detail)`, the gate array and the verdict shape all support the correct form without modification.

> **It is a CONSISTENCY problem, and consistency problems are the class a mechanical check catches.**

**The contrast with D-035 is the point, and it runs the other way.** D-035 — fifteen agents declaring `guardrail-review` whose bodies are generators — passes every mechanical rule that exists or is planned: the prefixes resolve, the domains match, the ids are unique, and `toolContracts: []` is *accurate*. **A human reading `purpose` and `outputs` was the only thing that could find it, and `verify-agent-naming.js` records that as UNCLOSED rather than pending.**

### CANDIDATE FOR F3 — **a zero-guard consistency check within an aggregate. All three instances fail it.**

**Mechanical, and keyed on the MAJORITY FORM within a single scope** — one array literal, one function, or one file:

> Within an aggregate, where the majority of sibling expressions guard a collection against emptiness before concluding over it, **flag the minority that do not.**

It needs no new vocabulary and no runtime observation: the majority form *is* the specification, discovered per scope rather than declared globally. **That is what makes it cheap and what makes it correct** — a global rule *"never use bare `.every`"* would be wrong (a bare `.every` over a collection that cannot be empty is fine), whereas *"you guarded three of these four and not the fourth"* is a defect in every case it fires.

**All three instances fail it, at three scope levels** — G-1 at the array literal, D-044 at the function, S-1 at the file — which is the evidence that one check covers the class rather than three checks covering three cases.

**So the reading produced two kinds of finding with opposite remedies.** One kind is uniform-shape deviation inside a file that mostly gets it right — cheap to detect mechanically, and left undetected only because nobody wrote the check. The other is a declaration that is internally consistent and describes the wrong thing — invisible to every check the platform can currently express. **F3 should not treat them as one backlog**: the first is a lint, and the second is a reading.

## THE ANSWER ALL 135 SHARE, MEASURED BEFORE BATCH 1

**Every one of the 135 assumes it will be invoked. Nothing on the canonical runtime invokes any of them.**

Measured 2026-08-04 across the whole package:

```
grep -rln "agents.invoke|catalogue.invoke|.invoke<"  src/   ->  src/capability.ts
                                                              src/orchestrators.ts
grep -rn  "\.invoke("  src/domains/  src/canonical-*.ts       ->  0
grep -rn  "from '../agents/"  src/domains/ src/canonical-*.ts ->  0
```

**Both callers are the RETIRING closure** — `RETIREMENT_RESOLUTION_REGISTER.md` line 16, *"RETIRING closure : 15 modules (orchestrators, capability, catalogue)"*, with `FunctionalTestingOrchestrator` recorded at entry 9 as **DELIBERATELY DROPPED**. The fourteen canonical domains import no agent and invoke none.

**This is F1 §1's own sentence, still true after F1: *"`AgentDefinition` is not the problem. The problem is that nothing in the canonical runtime consumes one."*** The agent layer landed — `AgentOutput`, `CertificationContribution`, the three composition rules — and no consumer arrived, because placement is behind F3 and the triad is behind the R-12.11/R-12.2 ADR. **The nine were renamed but not placed, and the measurement confirms it: zero invocations.**

**What this does and does not change.** It does not make the per-agent answers below hypothetical — an assumption carried across a migration is carried whether or not it is executing today, and the migration is what this reading exists to inform. **It does change what a fix means**: a repair written into the retiring closure is work that is deleted, so findings below are recorded against the agent, not patched in the caller that is going away. Where a defect also exists on the canonical side it is called out separately, because that one is live.

---

## BATCH 1 — `test` (18 agents) · READ 2026-08-04

`test.positive` `negative` `boundary` `decision-table` `state-transition` `pairwise` `error-guessing` `exploratory` `security` `accessibility` `performance-awareness` `ai-edge-case` `business-rule` `data-variation` `workflow-variation` `duplicate-removal` `coverage-analysis` `certification`

### T-1 · `test.certification` — **ZERO REQUIREMENTS CERTIFIES.** Measured.

```
coverage-analysis({scenarios: [], requirements: []}) -> {"covered":0,"total":0,"uncovered":[]}
certification({uncovered: [], scenarioCount: 0})     -> {"certified":true,
                                                        "reason":"0 scenario(s) covering every requirement"}
```

**The assumption:** an empty `uncovered` means coverage is complete.

**True only because `test.coverage-analysis` cannot report that it could not compute coverage.** That agent's own `failureHandling` declares *"Coverage that cannot be computed is reported as unknown, never as complete"* — and its return type is `{ covered: number; total: number; uncovered: readonly string[] }`, which **has no `unknown`**. `uncovered: []` is the value for *everything is covered* and for *there was nothing to cover*, and `test.certification` reads the second as the first.

**The reason string refutes the verdict it accompanies** — *"0 scenario(s) covering every requirement"* — which makes this the clearest instance yet of the class: the agent had the number that contradicts its conclusion, formatted it into the sentence, and concluded anyway. **This is the truthful-negative pattern's sixth instance and the first inside a verdict rather than at a tool boundary.**

**Not repaired here, deliberately.** `test.certification` is invoked only by `testOrchestrator` (`orchestrators.ts:187`), which is the retiring closure and entry 9's DELIBERATELY DROPPED unit. **The canonical equivalent already resolves it the other way and says so**: `test-design-intelligence.ts:266` — *"Emptiness reaches the verdict from story-intelligence, which can see its cause. This domain would only be able to report the symptom."* The canonical runtime routes emptiness to the producer that knows why; the agent path concludes on it. **The finding is what must not be carried across the migration, which is what this reading is for.**

### T-2 · The fifteen technique agents — **the declared `not-applicable` does not exist.**

Every one declares `failureHandling: 'A technique that produces nothing is recorded as not-applicable, never as zero coverage.'` The return type is `readonly Scenario[]` and the value in that case is `[]`. **There is no not-applicable.** An empty array is emitted by a technique that does not apply, by a technique whose predicate failed to parse a statement it should have matched, and by a technique that applied and produced nothing — three different facts, one value.

**The assumption:** `applies(r)` is a decision. It is a regex over `r.statement` returning `boolean`, with no third answer.

**True only because `Requirement.statement` is a `string` that cannot carry "not usable".** `story.requirement-extraction` has no way to say it could not derive a usable statement, so every technique treats whatever arrives as a statement to match against.

**Measured** — an unparseable statement, `※※※`:

```
fifteen techniques produced 4 scenario(s) for an unparseable statement
```

The four are the unconditional predicates (`positive`, `negative`, `error-guessing`) plus `exploratory` (`kind !== 'acceptance-criterion'`), and they emit scenarios **titled `Verify ※※※`**. The other eleven return `[]` and nothing distinguishes *"boundary does not apply here"* from *"boundary could not read this."* This is ADR-0071's stage distinction — `not-applicable` versus `refused` — owed one level in, and **the standing reach-versus-refuse rule names this exact boundary as its fourth: a finding is not a conclusion.**

### T-3 · All fifteen destroy `Requirement.confidence` at the `Scenario` boundary. Measured.

```
from confidence 0.2 -> {"id":"R2-positive-1","requirementId":"R2","technique":"positive",
                        "title":"Verify the user can submit the form","fingerprint":"5048db53"}
from confidence 1.0 -> {"id":"R3-positive-1","requirementId":"R3","technique":"positive",
                        "title":"Verify the user can submit the form","fingerprint":"5048db53"}
Scenario members: id, requirementId, technique, title, fingerprint   carries confidence: false
```

**Byte-identical but for the id, and the fingerprints match** — so `test.duplicate-removal` would collapse a scenario derived from a 0.2-confidence inference into one derived from an explicit acceptance criterion, keeping whichever arrived first.

`Requirement.confidence` is documented *"Present when reasoning proposed it and code accepted it."* **`test.ai-edge-case` is the only one of the fifteen that reads it** — `(r) => r.confidence < 1` — and it uses it as a **trigger**, never propagating it. Downstream, a scenario generated from an inferred requirement is indistinguishable from one generated from a stated one.

**This is `canonicalSpecOf`'s shape — an information-destroying boundary — but unrecorded.** D-036 recorded the canonical publication boundary as a capability reduction with each dropped field named. **Nothing records this one**, and it drops the single field that says whether a human or a model asserted the requirement.

### T-4 · `test.duplicate-removal` declares a failure its body cannot have.

`failureHandling: 'Deduplication failure is reported; duplicates inflate coverage figures and cost execution time.'` The body is a `Set` loop over an array with no I/O, no parsing and no external call. **It cannot fail.**

**Category: AN-3's, not D-013's** — a declaration whose subject cannot reach it, rather than a declared state nothing produces. The remedy is to label it, not to build a producer for it. Recorded so the `failureHandling` audit (D-024, attributed to Section F) has this instance already classified when it runs.

### Batch 1 — registered separately

**T-1 is `TECHNICAL_DEBT.md` D-043** and **T-3 is D-042.** T-2 and T-4 stay here; neither is a defect on the live path and both are classification work the `failureHandling` audit will need.

### Batch 1 — what was NOT found

**No naming defect** (the gate is green over these eighteen), **no `toolContracts` claim to verify** (all eighteen declare `[]`, accurately — none touches a tool), and **no reasoning-boundary violation**: the fifteen declare `aiCapabilityClass: 'generation'` with a `promptContract` whose `inputsProvided` is *requirement identifiers, requirement statements, the technique name* — structure and derived text, nothing in `FORBIDDEN_IN_PROMPT`. `nonAiBehaviour` is declared on all fifteen and is accurate: the deterministic path generates one scenario per applicable requirement, and **coverage is identical with reasoning unavailable**, which is INV-7 satisfied rather than declared.

---

## BATCH 2 — `governance` (17 agents) · READ 2026-08-05

14 × `governance.review.*` · `governance.consistency` · `governance.final-certification` · `governance.release-certification`

### G-0 · **PROMOTED OUT OF THIS BATCH — see *THE MIGRATION'S REFERENCE SHAPE* above.** Measured here, recorded there.

**All fourteen reviewers refuse a wholly empty run. None approves.**

```
0 of 14 reviewer(s) APPROVED a wholly empty run
   13 return unreviewable=set, approved=false, findings=0
    1 (governance.review.release) returns unreviewable=null, approved=false, findings=2
```

`ReviewVerdict` carries `unreviewable: string | null` **alongside** `approved`, so *"I could not review this"* and *"I reviewed this and it failed"* are different values, and `verdict()` forces `approved: false` whenever `unreviewable` is set. The factory's own `failureHandling` states the reasoning: *"Treating an absent artefact as a passed review is how a false-positive release recommendation is issued."*

**This is D-043's problem solved, in the same package, by the same kind of unit.** `test.certification` had one boolean and concluded on emptiness; a reviewer has two fields and declines. **The pattern is therefore not inherent to the vocabulary** — which removes the last excuse for D-043 and gives the migration a shape to copy rather than invent. **Recorded as a positive control**: the reading must be able to find things that are right, or its negatives are not credible.

**One inconsistency inside the good news.** `review.release` treats the same emptiness as two *findings* (`'no test case was authored'`, `'no execution was observed, so no release claim can be substantiated'`) rather than as `unreviewable`. The verdict is correct either way — but downstream, `final-certification` sorts reviewers into `rejecting` and `unreviewable` and **treats the two categories differently** (G-2), so the classification is not cosmetic.

### G-1, G-2 AND G-3 ARE ONE DEFECT AT THREE SITES — the diagnosis, added 2026-08-05 when they were repaired under ADR-0076 §4.1.2 A1

> **`satisfied: boolean` could not say `unproven`, so the aggregator reconstructed it from SPELLING.**

The three were read as three findings — a zero-guard problem, a string-matching problem, and a dead parameter. **They are one.** `FinalCertification.mandatoryGates` typed each gate `satisfied: boolean`, and the decision needed a third state: its own comment says *"CONDITIONAL exists for the case where nothing is WRONG but something is UNPROVEN"*. **The type could not carry `unproven`**, and everything else follows:

- **G-1** — with only two states, an empty collection had to become one of them, and `Array.prototype.every` made it `satisfied`. Four gates passed by absence; the gate that rescued the empty case (`every review agent approves`) was itself vacuous on an empty reviewer list.
- **G-2** — needing `unproven` and unable to read it, the decision inferred it by testing whether a gate's PROSE contained a reviewer's scope LABEL as a substring. Two undeclared namespaces related by spelling.
- **G-3** — `reviewer()` discarded the descriptive `scope` string, which is exactly what a declared gate-to-reviewer relation would have been built from. The dead parameter is the unbuilt half of G-2's missing relation.

**This is ADR-0076 §2.1's own principle found inside the mechanism ADR-0076 ports:** *a declaration whose type admits values the platform can prove wrong is a different kind of object from one whose type does not.* Here the type admitted too little rather than too much — the producer knew a gate was unmeasured and had no way to say it — which is the pre-landing check's second direction, *a value that says LESS than its producer knows*.

**The repair is therefore one change, not three patches**: `state: 'satisfied' | 'unproven' | 'failed'` plus a declared `evidenceFrom`, after which the decision reads the state and the substring heuristic and the dead parameter both disappear rather than being fixed. **Recorded here, above the three findings, so a later reader meets the cause before the symptoms** — reading them as three invites three local fixes, and a better regex for G-2 was available and would have been wrong.

### G-1 · **FOUR OF NINE MANDATORY GATES ARE SATISFIED BY ABSENCE**, and the zero-guard is applied inconsistently inside a single array literal. Measured.

```
    unmet  complete requirements coverage              0 requirement(s), 0 test case(s)
SATISFIED  complete traceability chain                 13/13 link(s) consistent
SATISFIED  certified automation architecture           0 asset(s)
    unmet  stable execution within quality thresholds  0 outcome(s), 0 skipped
    unmet  verified synchronisation with the tool      no synchronisation was performed
SATISFIED  evidence-backed defect classification       0 defect(s)
    unmet  executive reports generated                 0 section(s)
SATISFIED  no unresolved blocking issues               0 genuine defect(s)
    unmet  every review agent approves                 0/14 reviewer(s) approved
```

**The author knew the hazard and applied the remedy to some elements and not others, in one expression.** Three gates are explicitly guarded — `s.requirements.length > 0 &&`, `s.outcomes.length > 0 &&`, `s.report !== null &&` — and the four above use a bare `Array.prototype.every`, which is `true` on an empty array. *"Certified automation architecture"* is satisfied by having generated no automation; *"evidence-backed defect classification"* by having found no defects.

**The gate that saves the empty case is itself vacuous.** The run is `BLOCKED` only because *"every review agent approves"* reports `0/14`. That gate is `input.reviews.every((r) => r.approved)` — **`true` on an empty reviewer list.** So the correctness of the empty case rests entirely on the review board having run and refused; **on the gates alone, absence scores 4 of 9, and with the board absent as well, 5 of 9.**

**The assumption:** that a collection being empty and a collection being uniformly good are distinguishable at the point of the check. They are not, and `every` is where they merge.

### G-2 · **THE `CONDITIONAL` DECISION IS DECIDED BY SUBSTRING COLLISION BETWEEN TWO UNDECLARED NAMESPACES.** Measured.

`review-board.ts:554` decides `CONDITIONAL` versus `BLOCKED` with:

```ts
failed.every((g) => unreviewable.some((r) =>
  g.gate.includes(r.scope) || r.scope.includes(g.gate.split(' ')[0] ?? '')))
```

`g.gate` is prose written for a human reader; `r.scope` is a terse label written independently. **Neither namespace is declared, related or checked.** Measured collisions:

```
reviewer scopes: architecture, automation, business, compliance, defects, execution,
                 gates, quality, release, reporting, story, security, scenarios, chain

"complete traceability chain"                 <- "chain"
"certified automation architecture"           <- "architecture", "automation"
"stable execution within quality thresholds"  <- "execution", "quality"

3 of 9 gate(s) collide with some reviewer scope by substring alone
```

**Six of nine gates can never reach `CONDITIONAL`, for purely lexical reasons.** *"Executive reports generated"* is unreachable from the `reporting` scope because the gate says *reports* and the scope says *reporting* — `includes` is directional and *"executive reports generated"* does not contain *"reporting"*. *"Evidence-backed defect classification"* misses the `defects` scope over a plural. **Renaming a gate string — a pure documentation act, with no behavioural intent — silently moves a release decision between `CONDITIONAL` and `BLOCKED`.**

**The assumption:** that a gate and the reviewer whose evidence it depends on can be related by their names. **True only because nothing below declares the relation** — there is no mapping from a mandatory gate to the reviewer that supplies its evidence, so the code infers one from spelling. **This is D-025's shape at runtime rather than in a rename**: a pattern that is *more permissive than the relation it stands for*, and which therefore matches things it was never meant to and misses things it was.

### G-3 · `reviewer()`'s `scope` parameter is discarded, and it differs from the one that is live. Measured.

`review-board.ts:85-91` — the factory takes `scope` and its body opens `void scope;`. Every reviewer therefore carries **two scope strings**, and the surviving one is supplied separately inside each review function:

```
governance.review.requirements -> live scope "story"
                                  factory arg "user story and acceptance criteria"
```

D-033's shape — a parameter nothing reads — **with a consequence that is not cosmetic, because G-2's heuristic matches on the terse survivor.** The discarded string is the descriptive one, and it is exactly what would have made a gate-to-reviewer relation legible. **The dead parameter is a record of someone having had the right idea and it not being wired.**

### G-4 · D-020 is unchanged, and now measured precisely.

```
reporting=16   certification=1
   reporting      governance.final-certification
   certification  governance.release-certification
```

**Two agents in one file both render a release-level verdict and declare different stages.** `governance.final-certification` — the agent that returns `CERTIFIED`/`CONDITIONAL`/`BLOCKED` — declares `stage: 'reporting'`. Recorded as still open, with the measurement attached, so D-020's resolution has a number rather than a recollection.

### G-5 · **EVERY AGENT FAILURE IN THE PLATFORM IS REPORTED IN THE WORDS OF ITS OWN DECLARATION, WHATEVER ACTUALLY WENT WRONG.** Found by a fixture error of mine, which is why it is here.

An incomplete probe snapshot omitted `healing`, and the resulting `TypeError` surfaced as:

```
AgentError: agent governance.review.defects: A scope whose evidence is absent is UNREVIEWABLE and
not approved. Treating an absent artefact as a passed review is how a false-positive release
recommendation is issued. (last error: Cannot read properties of undefined (reading 'filter'))
```

`capability-framework/src/agent.ts` builds the message as `` `${agent.failureHandling} (last error: …)` ``. **The declaration leads; the fact is parenthetical.** Nothing had gone wrong with evidence being absent — a property read had failed on `undefined` — and the error announces the declared failure mode as though it had occurred.

**This is platform-wide, affects all 144 agents, and is the D-007 axis at the error boundary**: the one place a reader looks when behaviour and declaration have diverged is the place that prints the declaration over the behaviour. The true cause is present, which is why this is a legibility defect and not a data defect — **but it is worst exactly when it matters most**, because an operator reading an incident log sees a confident statement of a failure mode that may not be the one that happened.

### G-6 · **WHAT BATCH 2 CONTRIBUTES TO THE OPEN R-12.11 / R-12.2 ADR — the platform already has an independent review mechanism, and it is not the triad.**

Batch 2 was sequenced second on the expectation that D-035 lived here. **It does not** — D-035's fifteen mis-declared generators are the `test.*` technique agents at `stage: 'guardrail-review'`, read in batch 1. Governance measures `reporting=16 certification=1` and **not one of the seventeen declares a triad stage.** The correction matters because it changes what this batch has to say about the ADR.

**What it has to say is larger than a stage label.** The fourteen reviewers are an independent review mechanism that **works, is enforced structurally rather than declared, and sits after the producing stages rather than inside them**:

- **Independence by type.** `ReviewSnapshot` is a frozen value, documented *"deliberately a single frozen shape rather than a live handle: a reviewer holding the engine could invoke it, and an invocation from inside a review is no longer a review."*
- **Independence by capability.** `toolContracts: []` across all seventeen, verified from the census (`ai=0 tool=0`), with the factory stating the reason: a reviewer that could reach a provider could change what it is reviewing.
- **Independence by position.** They run at `reporting` — **after** the work, not at stages 4–6 — and G-0 shows they decline rather than approve when the evidence is absent.

**The ADR asks whether a coverage-remediation loop and an independent review of its output can coexist under a forward-only runner (R-12.11 vs R-12.2). The measurement reframes it:** the platform contains a second answer already implemented — **review afterwards, at reporting, by units that cannot touch what they review** — which does not re-enter a sealed stage and therefore does not collide with R-12.11 at all.

**This does not settle the ADR and must not be read as settling it.** D-019 stands: stages 4–6 are implemented as existence checks that cannot decline, and that is the platform's highest-severity open finding whichever mechanism wins. **What changes is the shape of the decision** — it is a choice between two mechanisms, one of which exists and is measurably honest, rather than the design of one from nothing. **The cost of the reporting-stage answer is also visible here and belongs in the ADR**: G-1, G-2 and G-3 are all in the decision logic that consumes those reviewers, so the mechanism's reviewers are sound and its *aggregator* is where the defects are.

### Batch 2 — what was NOT found (see also batch 3, read per-file)

**No tool access anywhere in the seventeen** — all declare `toolContracts: []`, and the factory comment states the reason: *"A reviewer that could reach a provider could change what it is reviewing, and the independence would be gone."* **Verified rather than trusted**: the census reports `tool=0` for the whole domain. **No reasoning either** — `ai=0` across all seventeen, so no `promptContract` to audit and no INV-7 exposure. `ReviewSnapshot` is documented as *"deliberately a single frozen shape rather than a live handle: a reviewer holding the engine could invoke it, and an invocation from inside a review is no longer a review"* — **an independence property enforced by the type rather than declared in prose**, which is the batch's second thing done right.

---

## BATCH 3 — `agents/authoring.ts` (16 agents) · READ 2026-08-05 · **PER-FILE**

**Re-scoped per the ruling: read as a file, not as sixteen agents.** The evidence from batches 1 and 2 was that the yield sits in shared factories and aggregation rather than in `handle` bodies, and batch 3 confirms it — **every finding below is in one function**, `authoring.quality-review`, which is the file's only aggregator. The other fifteen agents are single-purpose transforms whose bar answer is the shared one and who are not written up individually.

### A-1 · **THREE CHECKS RECORD EVIDENCE THAT CONTRADICTS THEIR OWN VERDICT — ON EVERY FAILURE.** Measured.

`authoring.quality-review` runs twelve checks over an authored test case. **Nine build their `detail` as a ternary describing the state actually found. Three build it as an unconditional literal.**

```
A · a test case with ZERO steps
   PASSED  atomic-steps          detail: "every action step carries its own observation"
   PASSED  automation-readiness  detail: "every step names a target an automation harness can resolve"
   PASSED  validation-layers     detail: "every step declares where its expected result is observed"

B · a step whose target is empty and whose validationLayer is absent
   failed  atomic-steps          detail: "every action step carries its own observation"
   failed  automation-readiness  detail: "every step names a target an automation harness can resolve"
   failed  validation-layers     detail: "every step declares where its expected result is observed"
```

**Case B is a harder version of D-043 and it is the sharper of the two.** In D-043 the reason string *contained the number* that refuted the verdict — a reader who did the arithmetic could catch it. Here **the evidence string flatly asserts the property the verdict denies**, in the same record, with no arithmetic required and no way to tell from the string which happened. `authoring.ts:785`, `812`, `815` pass a constant where the other nine sites pass a ternary.

**Case A is G-1's shape**: bare `Array.prototype.every` over `t.steps`, so a case with no steps satisfies all three. **The two compound** — a zero-step case passes with evidence asserting facts about steps that do not exist.

**The assumption:** that a check's verdict and its evidence cannot disagree, because the same expression produced both. **They were not produced by the same expression** — the verdict is computed and the detail is written, and nothing relates them. **True only because nothing below can fail**: `check(name, passed, detail)` accepts any string for any verdict, so the type system cannot object, and no test asserts that a failing check's detail describes a failure.

**The same inconsistency-within-one-expression shape as G-1's zero-guards**: the author knew the correct form, used it nine times out of twelve, and the three exceptions are adjacent lines in the same function.

### A-2 · Where the evidence goes, which is why A-1 is not cosmetic.

`authoring.quality-review` feeds `authoring.quality-score` and, through `AuthoringQuality`, reaches the review board's snapshot — where `governance.review.quality` reads it. **A `detail` string is exactly the kind of field that survives excerpting into a report while the boolean beside it does not.** The pre-landing check applies unchanged: *does this value match what its producer is positioned to know?* The producer computed `false` and published a sentence asserting `true`.

### Batch 3 — the G-5 fix, observed working in live use

Twice during this batch an incomplete probe fixture faulted an agent, and both times the message led with the fact:

```
AgentError: agent authoring.quality-review: TypeError: Cannot read properties of undefined
(reading 'length') — declared handling: Every check reports its own verdict, so a refusal
names the rule that failed rather than the case as a whole.
```

**Before the fix this would have opened with *"Every check reports its own verdict…"*** — a confident statement about refusal semantics, for a fault that was a missing property on a fixture. The declaration is still carried and still useful; it no longer claims to be what happened. Recorded because a fix observed working on the class of error that motivated it, one commit after landing, is better evidence than the test.

---

## BATCH 4 — `agents/repository-and-authoring.ts` (10 agents: 6 `repository.*` + 4 `planning.*`, plus 8 factory-built `repository.search.*`) · READ 2026-08-05 · **PER-FILE**

**The per-file scope paid for itself here: the finding is a CHAIN, and no single agent contains it.** Four agents each behave defensibly in isolation and compose into a certified plan to duplicate a customer's repository. Read agent-by-agent, this is four unremarkable functions.

### R-1 · **`D-045` — an unreachable repository and an empty one are the same value, and the plan certified from it is "create everything".** Measured.

```
A · repository UNREACHABLE  (search returns [])
   decisions      : create, create, create
   first reason   : "no existing asset resembled this scenario"
   reuseRate      : 0
   certification  : certified=true  reason="3 decision(s) over 0 observed asset(s)"

B · repository EMPTY        (search returns [])
   ... byte-identical ...

C · the eight EP search agents
   repository.search.ado      emptyIndex=[]  shortTitles=[]
   plane/toolContracts: "EP" / ["ProjectAdapter","TestManagementAdapter"]
```

**The eight search agents are the ones that actually reach a customer tool** — `plane: 'EP'`, two real adapter contracts — and each declares *"An unreachable repository yields no matches **and is reported**; it never yields 'no duplicates exist'."* The return type is `readonly RepositoryMatch[]`. **There is no "and is reported", and `[]` is exactly the value that means "no duplicates exist" to everything downstream.**

**Three distinct causes collapse into that one value**: the tool was unreachable; the index is empty; or `similarity()` returned `0` because either token set was empty after filtering tokens of two characters or fewer — measured, `shortTitles=[]`.

**Registered as D-045 — the highest-consequence item the reading has produced**, and the first instance of the truthful-negative pattern whose outcome is a **write to the customer's system of record** rather than a wrong report.

### R-2 · `repository.certification` cannot fire in the case that most needs it.

Its purpose is *"Refuse a reuse plan that names an asset no search returned."* It computes `unobserved` from `decisions.filter(d => d.kind !== 'create')` — **empty precisely when every decision is `create`.** So the total-failure case produces nothing to refuse, and it certifies. **AN-3's category crossed with D-043's**: a check whose subject cannot reach it, in a verdict whose reason string carries the refuting number — `observed.size` is `0` and is formatted into the sentence that certifies.

### R-3 · The author reasoned about this failure and stopped one step short.

`repository.reuse-decision` declares *"On failure the decision is CREATE, which is wasteful but never destroys an existing asset."* **Correct about destruction.** It does not consider that CREATE at scale, driven by an unreported outage, duplicates the customer's repository — a harm that is not destruction, is not caught by any guard in the chain, and is not recoverable by re-running. **The bar answer in its sharpest form: the safe default was chosen against the wrong hazard, because the hazard it was chosen against was the only one the return type could express.**

### R-4 · `repository.reuse-analysis` declares the right thing and cannot do it.

*"Reported as unknown rather than zero; a zero reuse rate reads as a finding rather than a measurement failure."* **Exactly the correct instinct, and unimplementable in its return type** — there is no `unknown`, and `total = decisions.length || 1` turns no-data into a clean `reuseRate: 0`. Measured `0`, indistinguishable from a genuine nothing-was-reusable. Same class as T-2 and D-024: a `failureHandling` that was never expressible.

### Batch 4 — what was NOT found, and one thing done right

**The four `planning.*` agents yielded nothing beyond the shared answer** — dependency resolution, batching, scheduling and environment validation are single-purpose transforms over data already in hand, none reaching a tool, none rendering a verdict. Recorded as a measured absence rather than omitted.

**Done right, and worth naming**: `repository.search.*` returns fingerprints and scores and **structurally cannot return source** — *"None returns source, and none can: the return type carries no content field."* An EP-plane agent that cannot carry source across the boundary is sovereignty enforced by type rather than by rule, and it is the same technique as `ReviewSnapshot`'s frozen shape. **The file contains both the best and the worst of the reading so far.**

---

## BATCH 5 — `agents/automation-execution-healing.ts` (28 agents) · READ 2026-08-05 · **PER-FILE**

The largest file, and it carries the answer to batch 4.

### H-1 · **D-045'S MISSING DISTINCTION EXISTS, CORRECT, IN THIS PACKAGE — AND THE DIFFERENCE IS ONE UNION MEMBER.**

`healing.validation` reads an execution result the same way `repository.search.*` reads a customer repository. **Its input type can say the read did not happen:**

```ts
{ action: HealingAction; retryOutcome: TestOutcome['outcome'] | null }
// `null` means the Execution Plane did not observe a retry. That is NOT a pass —
// an unobserved retry leaves the defect visible, which is the safe direction.
handle: (input) => ({ ...input.action, validated: input.retryOutcome === 'passed' }),
```

**`| null` is the whole repair.** Not observed is a third value, the consumer treats it as not-validated, and the comment states the reasoning. Compare D-045: `readonly RepositoryMatch[]` has no third value, so unreachable and empty are one, and the consumer creates.

**This settles the ninth F3 item's shape and removes any argument that it is a redesign.** The read direction of ADR-0072/0073 is asking for what `healing.validation` already has, and the file that contains the platform's worst read (`repository-and-authoring.ts`) and the file that contains its best are two files apart. **Recorded as the second reference shape**, beside `ReviewVerdict`.

### H-2 · **THE AMBIGUITY IS NOT THE DEFECT. THE DIRECTION OF THE DEFAULT UNDER AMBIGUITY IS.** A refinement of the standing rule, earned here.

The eleven `healing.*` kind agents return `HealingAction | null`, and `null` means both *"this kind does not claim this signal"* (`if (!claims[kind].test(signal)) return null`) and *"nothing could be proposed"*. **That is T-2's exact collapse** — two facts, one value, no way to tell them apart.

**And it is harmless here**, because of where the default points:

| Instance | Ambiguous value | What the consumer does with it | Outcome |
|---|---|---|---|
| T-2 (`test.*` techniques) | `[]` | counts coverage as satisfied | **coverage claimed that does not exist** |
| D-045 (`repository.search.*`) | `[]` | decides CREATE | **duplicates a customer's repository** |
| H-2 (`healing.*` kinds) | `null` | proposes no heal | **the defect stays red** |

**Same collapse, three consequences, and the variable is not the ambiguity — it is which way the consumer defaults when it cannot tell.** `healing.*` declares this deliberately: *"Healing a genuine defect would hide it, which is worse than a red test."*

**The refinement, for the migration:** where a value's producer cannot express a negative, **the question is not "is this ambiguous" but "what does the consumer do when it cannot tell, and is that the safe direction".** An ambiguity whose default is safe is debt; an ambiguity whose default acts on a customer's system is D-045.

### H-3 · `confidence: 0.6` is hardcoded on every healing action from all eleven kinds.

Every proposal carries the identical confidence regardless of signal, kind or match strength. **D-042's shape — a field that looks like information and carries none** — and `HealingAction.confidence` is exactly the field a reviewer deciding whether to trust a heal would read first.

### H-4 · `healing.api` and `defect.genuineness` classify the same string differently, and neither references the other.

`healing.api` claims `/5\d\d|network|connection refused/`; `defect.genuineness` treats `/connection refused|dns|network unreachable/` as environmental. **"Connection refused" is simultaneously a signal one agent offers to heal and one another agent says is not application behaviour at all** — so a heal may be proposed, and applied to a test asset, for a network outage. **G-2's shape**: two undeclared pattern namespaces related only by the words in them, in one file, with no mapping between them. Lower consequence than G-2 — the outcome is non-genuine either way — but the same cause.

### Batch 5 — done right, and worth naming

**`defect.genuineness` defaults ambiguity to GENUINE in three places that agree**: the code (`return { genuine: true, … }` as the final branch, with a missing signal becoming `''` and matching no environmental pattern), the `failureHandling` (*"Ambiguous failures are treated as GENUINE. Suppressing a real defect costs more than an extra triage."*), and the `promptContract.rejectionRules` (*"where the proposal is absent or ambiguous the failure is treated as GENUINE"*). **A declaration, a rejection rule and a code path saying the same thing is the condition D-007 exists because of, met.**

---

## BATCHES 6–8 — the remaining three files, one pass · READ 2026-08-05 · **PER-FILE**

Read with the direction-of-default question, not the bar's original phrasing.

### BATCH 6 — `agents/continuous-learning.ts` (15) · `learner` factory

**L-1 · The declaration NAMES the ambiguity and picks the safe reading — and still cannot carry it.**

```
failureHandling: 'A run with nothing to learn from yields no recommendation, which is an
                  absence of signal rather than a failure to look.'
```

**This is the first instance in the reading where an author saw both readings of `[]`, said so, and chose.** It is materially better than silence — a reader is told which meaning is intended — and **it is still prose asserting a distinction the return type does not carry**, exactly as `repository.search.*` asserts *"and is reported"*. `readonly LearningRecommendation[]` is `[]` whether there was nothing to learn or the mining logic found nothing it should have found.

**Direction of default: SAFE.** A missing recommendation causes no action. **Debt, not D-045** — and the entry is worth keeping precisely because the declaration is good: **naming the ambiguity is the step before typing it, and this file is the only place in 135 agents that took it.**

**Done right, twice.** `learning.*` reads `ReviewSnapshot` — the frozen shape — so **learning structurally cannot modify the release it learns from**, which is its second declared responsibility enforced by type rather than promised. And `recommend()` takes `evidence` as a required parameter, so **a recommendation without its basis cannot be constructed**.

### BATCH 7 — `agents/story-and-test.ts`, story half (11)

**S-1 · `story.certification` GUARDS THE ZERO CASE. `test.certification` — D-043 — DOES NOT. Same file.**

```ts
// story.certification, line 394
if (input.requirementCount === 0) return { certified: false, reason: 'no requirement was derived; there is nothing to test' };

// test.certification, line 527 — D-043
input.uncovered.length > 0 ? { certified: false, … } : { certified: true, reason: `${input.scenarioCount} scenario(s) covering every requirement` }
```

**Two verdict agents, one file, ~130 lines apart, both receiving a count, and only one refuses on zero.** This changes what D-043 is: **not a pattern nobody knew, but a pattern applied in the same file and not carried across.**

**It is the THIRD instance of that meta-shape**, and the three together are the reading's most useful aggregate finding:

| | Correct form present | Incorrect form | Distance |
|---|---|---|---|
| **G-1** | 3 gates zero-guarded | 4 gates bare `.every` | same array literal |
| **D-044** | 9 checks state-dependent `detail` | 3 checks constant `detail` | same function |
| **S-1** | `story.certification` guards zero | `test.certification` does not | same file |

**In every case the correct form is the majority and is adjacent.** That is not a knowledge problem and not a design problem — **it is a consistency problem, and consistency problems are exactly what a mechanical check catches.**

**S-2 · `story.review` declares a stage refusal the framework cannot perform.** It declares `stage: 'architecture-review'` and `failureHandling: 'A failed review stops the run at the architecture-review stage rather than authoring against an unusable story.'` **D-019 established that the triad stages cannot decline** — `StageEmitter` had no refusal constructor until ADR-0071, and nothing routes an agent's `approved: false` to a stage outcome. `story.review` and `story.certification` are **2 of D-019's 20 triad-stage agents**, and this is D-024's class — a declaration that was never implementable — sitting on one of them.

### BATCH 8 — residual `sync.*` (4) and `reporting.*` (2)

**Y-1 · `sync.results` is ADR-0072 working, and it records its own history.**

```ts
// The count is what the ADAPTER acknowledged, not the length of the input. These
// agents previously returned `input.outcomes.length` and never called an adapter
// at all — a publication count for a publication that never happened.
if (input.adapters.execution.publishResult(o.testCaseId, outcome).published) published += 1;
```

**The write direction, repaired, with the defect it replaced named in place.** Done right.

**Y-2 · The count still cannot distinguish zero-published from nothing-to-publish.** `{ published: number }` is `0` for an empty outcome list and for an adapter that refused everything. Its `failureHandling` covers *partial* publication — *"Partial publication is reported with the count"* — and **partial is the case the count does handle**; total failure against an empty input is the one it does not. **Direction of default: a report states 0 either way.** Debt — a misleading report, not a customer write. **This is the Section C ruling (*zero-published is a negative finding*) applied at the domain and not at the agent**, which is consistent with the sweep finding: the domain is live, the agent is not.

### Batches 6–8 — what was NOT found

**No new class.** Every finding across the three files is an instance of something batches 1–5 already named — which is itself the result worth recording after 135 agents: **the reading converged.** The last three files produced no shape the first five had not.
