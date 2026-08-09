# ADR-0074 — A read of a customer tool reports whether it was reached

**Status:** PROPOSED · **Date:** 2026-08-05
**Supersedes:** nothing · **Amends:** nothing · **Extends:** ADR-0072, ADR-0073 (the write direction)

## 1. Problem

**Writes can report refusal. Reads cannot report unreachability.**

ADR-0072 and ADR-0073 gave every write on the connector SPIs a way to say the customer's tool declined — `PublicationOutcome`, `WriteOutcome<T>`. **Nothing was done for the read direction, and the omission was not noticed until an agent that reads was read** (`TECHNICAL_DEBT.md` D-045, batch 4 of the 135's migration reading).

Every read returns its payload type. **An unreachable tool and an empty result are therefore the same value**, and the platform has no way to tell them apart at any layer.

**Measured, end to end** (`agents/repository-and-authoring.ts`, the eight `repository.search.*` agents which declare `plane: 'EP'` and `toolContracts: ['ProjectAdapter', 'TestManagementAdapter']`):

```
A · repository UNREACHABLE   B · repository EMPTY      — byte-identical
   decisions     : create, create, create
   first reason  : "no existing asset resembled this scenario"
   certification : certified=true  reason="3 decision(s) over 0 observed asset(s)"
```

**An outage in a customer's ADO or Jira mid-run yields a CERTIFIED PLAN TO CREATE EVERY ASSET** — duplicating everything that repository already holds. It costs nothing today for exactly one reason: nothing invokes those agents, a fact now held by `verify-canonical-agent-dormancy.js` rather than assumed.

**The search agents declare the guarantee they cannot keep:** *"An unreachable repository yields no matches **and is reported**; it never yields 'no duplicates exist'."* The return type is `readonly RepositoryMatch[]`. **There is no "and is reported".**

## 2. Context

**This is not carelessness at the decision site, and that is the whole reason it needs a type change rather than a code review.** `repository.reuse-decision` declares *"On failure the decision is CREATE, which is wasteful but never destroys an existing asset"* — a deliberate, correct judgement about the hazard it could see. **The safe default was chosen against the wrong hazard, because that was the only hazard the return type could express.**

> **A type that cannot say "unreachable" makes unreachable unthinkable at the decision point.**

**The reference shape already exists in this package, two files away.** `healing.validation` reads an execution result exactly as `repository.search.*` reads a repository, and its type can say the read did not happen:

```ts
{ action: HealingAction; retryOutcome: TestOutcome['outcome'] | null }
// `null` means the Execution Plane did not observe a retry. That is NOT a pass —
// an unobserved retry leaves the defect visible, which is the safe direction.
```

**One union member. The scale of this ADR is settled by that file, not estimated.**

**Two dependencies, neither obvious until stated:**

1. **`findExistingTests` is one of C-4's two never-called operations** — and is exactly the operation whose first call would be a read whose emptiness decides whether a test already exists. **The gap and the dormancy are the same fact seen twice.**
2. **F2's read-back validation assumes reads are trustworthy.** Its technique — *"read back, so validation observes the tool rather than trusting the write"* — **survives a lying adapter and does not survive an unreachable one**, because an unreachable read-back returns the same empty result as a write that silently did nothing. **Read-back validation would report success for a write that never landed.**

**Sovereignty is unaffected.** This changes a return type on an SPI the Intelligence Plane composes against; it opens no connection (R-3.2), holds no credential (R-3.3), and does not alter which plane initiates (R-5.1).

## 3. Alternatives

- **Throw on unreachable.** REJECTED — **the standing reach-versus-refuse rule**: a failure to reach and a refusal on arrival are never one signal, and an exception makes every read a control-flow decision at every call site. It also loses partial reads.
- **Return `null` on unreachable.** REJECTED for the reads that already use `null` to mean *not found* — `discoverContainer` returns `| null` today, and `null` there is a legitimate negative the tool actually gave. **Overloading it would merge the two negatives this ADR exists to separate.**
- **A read-specific outcome per adapter.** REJECTED — a second union meaning the same thing, differing only in provenance; CHARTER §4.
- **Leave it; the agents are dormant.** REJECTED. Dormancy is held by one gate and ends at F3. **The repair is free exactly once** — after a live connector lands, the same change is made while the platform is producing wrong data against a customer's system of record, which is the window ADR-0072 was deliberately landed inside.

## 4. Decision

**One generic outcome type, mirroring `WriteOutcome<T>`:**

```ts
export type ReadOutcome<T> =
  | { readonly reached: true; readonly value: T }
  | { readonly reached: false; readonly reason: string };
```

**`reached` names the tool boundary, not the result.** `{ reached: true, value: [] }` is *the tool answered and holds nothing* — a fact. `{ reached: false, reason }` is *the tool was not consulted* — an absence of fact. **A `T` that is itself `X | null` keeps its own meaning**: `{ reached: true, value: null }` is *the tool answered and there is no such container*, which is why `discoverContainer`'s existing `| null` is preserved rather than absorbed.

**Eleven operations across five SPIs convert** — 31 call sites measured:

| SPI | Operations |
|---|---|
| `ProjectAdapter` | `fetchStory` |
| `TestManagementAdapter` | `findExistingTests` |
| `TestDesignSyncAdapter` | `discoverContainer`, `discoverGrouping`, `discoverTestCases`, `discoverSharedSteps`, `discoverSharedParameters`, `readTestCase` |
| `SourceControlAdapter` | `listBranches`, `findChangeRequest`, `listCommits` |

**BEHAVIOUR-NEUTRAL, as ADR-0072 landed.** Every reference adapter returns `{ reached: true, … }` unconditionally — they are in-memory and always reachable, and P-69.4 retains them as the credential-free conformance substrate rather than as scaffolding. **No run changes outcome.** The change is that a *future* adapter can express what today's cannot.

**FAILURE PATHS ARE MARKED, NOT DECIDED.** Where a consumer is owned by another capability, the `reached: false` branch carries an explicit `UNDECIDED — <capability>` marker at the call site rather than a silent fallback. **A wrong negative-path decision taken here stays invisible until that capability disagrees**, which is D-024's lesson and ADR-0072's precedent.

**One consumer's failure path IS decided here, because this ADR names it as the defect:** `repository.reuse-decision` must not return `create` from an unreached read. **That decision is scoped to F3's placement and is not implemented by this ADR** — the agent is dormant and the SPI must exist before the consumer can use it.

> **§4 IS AMENDED, 2026-08-05 — IMPLEMENTED, AND IT WAS TWO CONSUMERS, NOT ONE.** See §6.4. `automation.search.*` is the same defect and this ADR did not name it, because §1 measured the file D-045 was raised against and stopped there.

## 5. Consequences

- **Every read call site becomes explicit about reachability.** That is the point and it is also the cost: 31 sites gain an unwrap.
- **`repository.search.*`'s declaration becomes keepable.** *"…and is reported"* is currently false; after this it can be made true.
- **F2's read-back validation becomes soundable.** It cannot be sound before this lands.
- **C-4's `findExistingTests` gains a correct shape before its first call**, rather than after.
- **This ADR does not repair D-045.** It makes the repair possible. **D-045 closes when a consumer behaves differently on `reached: false`, and that is F3's.** — **MET 2026-08-05; see §6.4. Two consumers now do.**

## 6. Migration strategy

1. **`ReadOutcome<T>` lands in `capability-framework/src/adapters.ts`** beside `WriteOutcome<T>`.
2. **Eleven signatures convert**; reference adapters wrap unconditionally in `{ reached: true, value }`.
3. **~40+ sites convert.** **Exact method-scoped patterns, one operation at a time — no bulk regex.** D-025 has five recorded instances, two from this session, and the last was a rename script whose pattern matched an import specifier. **If an exclusion list becomes tempting, the pattern is wrong.**

### 6.1 · **§6's ORIGINAL FIGURE OF 31 WAS WRONG, AND THE REASON IS THE FINDING**

**Corrected 2026-08-05 by MEASUREMENT, not estimation** — the type, all eleven signatures and the barrel export were landed and the tree built, so the compiler enumerated the surface. The change was then reverted to a clean tree; **the measurement is what survives.**

> **§6 COUNTED CONSUMERS AND OMITTED IMPLEMENTORS.**
>
> **The surface of an interface change is CONSUMERS PLUS IMPLEMENTORS — and conformance fixtures are implementors that do not look like production code.** Every inline adapter object in a test constructs the SPI and breaks the moment a signature moves. `grep` for call sites finds the first group and is structurally blind to the second, because an implementor never names the method it is satisfying in a way a call-site search matches.

**IT GENERALISES, AND IT IS NOT SPECIFIC TO READS.** **ADR-0072 and ADR-0073 both landed without this being stated** — they were fortunate in that their consumers and implementors happened to be edited together, not correct in having scoped it. **It is true of every future SPI change**, and it belongs in the pre-landing checks:

> **Alongside *"a failure to reach and a refusal on arrival are never one signal"*, add:**
> **when an interface changes, who IMPLEMENTS it — including every fixture — and not only who CALLS it?**

### 6.2 · The measured surface, per package — **SUPERSEDED AS A PLANNING ARTEFACT (see 6.2.2). Retained as the record of what estimation produced; do not plan from it.**

**This is a FLOOR, not a complete list.** Per-package compilation halts after a threshold, and `functional-testing-engine`'s output was truncated mid-file — **so the next session starts from this list and expects it to grow, rather than treating it as closed.**

| Package | Site | Kind |
|---|---|---|
| `capability-framework` | `test/framework.test.ts:307` — inline `ProjectAdapter` | **Implementor (fixture)** |
| `dev-change-engine` | `src/adapters.ts:62,63,67` — `listBranches`, `findChangeRequest`, `listCommits` | **Implementor** |
| `dev-change-engine` | `src/adapters.ts:78,88` — `fetchStory`, `findExistingTests` | **Implementor** |
| `dev-change-engine` | `src/agents/repository-and-diff.ts:37,47,60` | Consumer — **UNDECIDED** |
| `dev-change-engine` | `src/agents/sync-and-reporting.ts:67,126,127` | Consumer — **UNDECIDED** |
| `dev-change-engine` | `test/conformance.test.ts:79` — inline `TestManagementAdapter` | **Implementor (fixture)** |
| `functional-testing-engine` | reference adapters — `fetchStory` and the `TestDesignSyncAdapter` family | **Implementor** |
| `functional-testing-engine` | `src/agents/design-sync.ts:130,132,137–142` — discovery | Consumer |
| `functional-testing-engine` | `src/agents/design-sync.ts:467–472` — `readTestCase` read-back | Consumer |
| `discovery-flow-engine` | `SourceControlAdapter` consumers — **not reached by the build before revert** | Consumer — **UNDECIDED** |

### 6.2.1 · **MEASURED BEYOND THE FLOOR — and the compiler is blind to implementors too**

**Attempted 2026-08-05, operation 1 (`fetchStory`) converted end to end, then reverted. What it measured:**

**`fetchStory` alone has EIGHT sites — six implementors and two consumers** — where §6.2's floor listed two:

```
IMPLEMENTORS  dev-change-engine/src/adapters.ts:78
              discovery-flow-engine/src/adapters.ts:68  and  :149   <- TWO adapter sets
              functional-testing-engine/src/adapters.ts:52  and  :88 <- TWO (ado, jira)
              capability-framework/test/framework.test.ts:293        <- fixture
CONSUMERS     functional-testing-engine/src/capability.ts:405
              dev-change-engine/src/agents/sync-and-reporting.ts:125
```

**`discovery-flow-engine`'s surface EXCEEDED expectation.** §6.2 listed it as *unmeasured, not absent*; it has **two** `ProjectAdapter` implementations — one per provider — and the same doubling appears in `functional-testing-engine`. **Provider pairs multiply every implementor count by two**, which no call-site figure would have shown.

**THE SHARPER FINDING, AND IT AMENDS §6.1: THE COMPILER IS BLIND TO SOME IMPLEMENTORS TOO.**

After converting the eight sites above, **the build was GREEN and thirteen tests were RED.** The failures were runtime, not type: fixtures that construct a `ProjectAdapter`-shaped object without being checked against the interface — passed structurally or through a cast — **return the old shape, so `.reached` is `undefined`, falsy, and the consumer's guard throws.** `grep` for `containerNoun` finds such fixtures in `capability-framework/test`, `functional-testing-engine/test` and **`performance-engine/test` — a package §6.2 never named at all.**

> **§6.1 said a call-site search is blind to implementors. This adds: a COMPILE is blind to implementors that are not type-checked against the interface.**
> **Neither `grep` nor `tsc` enumerates the surface of an SPI change. Only running the suite does.**

#### **THE THIRD CLAUSE, EARNED 2026-08-05 BY THE CONSUMER REPAIR (§6.4) — *"the suite"* WAS TOO COARSE A WORD**

**A PACKAGE SUITE IS BLIND TO IMPLEMENTORS OUTSIDE THE PACKAGE.** `governance/capability/run-functional-completeness.mjs` and `run-capability-conformance.mjs` each construct `EngineDependencies`. **`tsc` cannot see them — they are `.mjs`, §6.2.1a's blindness. `node --test "dist/test/*.test.js" && node --test "test/*.test.mjs"` cannot see them either — they live outside the package and nothing in it imports them.** Only the full workspace run reached them, and only because a governance gate spawns them.

**THAT IS A DIFFERENT BLINDNESS FROM §6.2.1a's, NOT A LOUDER ONE.** `authoring-bridge.mjs` was invisible to the type checker and **caught by the package suite on the first operation** — which is what made §6.2.3's *"run the suite"* look sufficient. **These two are invisible to both**, and a session that stopped at package-green would have committed them broken. The three clauses now read:

| Blind to | Because |
|---|---|
| `grep` | an implementor never names the method it satisfies |
| `tsc` | the file is never submitted to it (`.mjs`) |
| **the package suite** | **the implementor lives outside the package and nothing in it imports the implementor** |

#### **AND A FOURTH, WHICH IS THE ONLY ONE THAT IS AUTHORED RATHER THAN STRUCTURAL**

**A CAST IS AN IMPLEMENTOR THE COMPILER HAS BEEN TOLD NOT TO CHECK.** Six call sites across two test files passed the old shape through `agents.invoke<never, O>(id, { … } as never, ctx)`. **The build was green and five tests were red** — §6.2.1a's exact signature, arriving from the consumer side rather than the implementor side.

> **The first three blindnesses are properties of tools. This one is a decision someone made, at a site, on a line.** `grep` cannot be taught to read implementors; `tsc` cannot be pointed at a file it does not compile; a package suite cannot import what it does not depend on. **`as never` is none of those — it is an instruction, written by hand, that the compiler obey nothing at this position.**

**It is therefore the only one of the four that a review could have caught and a tool could not**, and the only one whose remedy is a habit rather than a mechanism. **Recorded here rather than as a lint rule, because the casts are not wrong**: `AgentCatalogue.invoke` takes the agent id as a plain string and the input as a call-site generic, so a fixture invoking an agent by id has no typed shape to conform to. **The cast is load-bearing. What it costs is that every SPI change must treat `as never` call sites as implementors and enumerate them by hand** — `grep` for the agent id, not for the type.

**That changes the method, not just the count.** The conversion's enumeration must come from **a green test suite**, not from a green build — and **build-green is therefore NOT a safe stopping boundary for this work**, which is why the attempt was reverted rather than committed at that point.

### 6.2.1a · **OPERATION 1 CONFIRMED §6.2.1 ON THE FIRST TRY, AND WITH STRONGER EVIDENCE THAN THE ARGUMENT THAT PRODUCED IT**

After the eight typed `fetchStory` sites were converted, **the build was green and thirteen tests were red.** The suite named the implementor no search and no compile could reach:

```
packages/functional-testing-engine/authoring-bridge.mjs:143
   — a ProjectAdapter in PRODUCTION .mjs, never type-checked, returning the old shape.
```

**§6.2.1 was argued from cast fixtures, and a cast fixture can be dismissed as a discipline problem** — *"then stop casting."* **This one cannot.** A `.mjs` module is invisible to `tsc` **BY CONSTRUCTION, not by looseness**: there is no discipline, no lint and no stricter setting that surfaces it, because the file is never submitted to the type checker at all. **No amount of care with types would have found it. Only running the suite did**, and it appeared on the first operation rather than the eleventh.

**It is also production code, not a fixture** — `authoring-bridge.mjs` is the module `PROJECT_STATE.md` §9.3a records as *load-bearing for capability*. So the invisible-implementor class is not confined to test scaffolding, which is where §6.2.1 expected it.

### 6.2.1b · **THE EGRESS GATE'S FALSE POSITIVE — fixed at the variable, not the scanner**

Operation 1's first consumer edit named a local `fetchedRead`, making the line `const fetched = fetchedRead.value`. `verify-intelligence-plane-egress` flagged it:

```
FAIL  EG-2  no Intelligence-Plane source opens an outbound connection
        packages/functional-testing-engine/src/capability.ts:411 aliased fetch "= fetch"
```

The substring `fetched = fetch` reads as an aliased global `fetch`. **A false positive — and the fix is the variable.** Renamed to `storyRead`, with the reason recorded at the site.

**Weakening an R-3.2 enforcement mechanism to accommodate a local name would be D-041's pressure at its cheapest and most invisible.** No ruling would have been sought to loosen a regex by one character. **The gate guards the constitution and a variable name is worth less than its precision** — the fourth refusal this session of the cheap resolution, after the compound agent prefix, AN-3's rewrite, and the G-5 assertion.

### 6.2.1c · **OPERATION 2'S GREEN FIRST RUN IS A RESULT, NOT AN ABSENCE OF ONE**

`findExistingTests` converted across fourteen sites and **the suite was green on the first run** — no invisible implementor.

**That is a measured fact, not a quiet success: `TestManagementAdapter` HAS no untyped implementor, and this is how the platform knows.** Operation 1's finding was specific — `ProjectAdapter` is implemented in `authoring-bridge.mjs`, a production `.mjs` module — and it would have been easy to generalise it into a standing suspicion of every SPI. **The method cost one extra suite run to establish that the suspicion does not apply here, which is the price of knowing rather than assuming**, and is precisely what convert-then-run was ruled in to buy. **A green run under this method carries information; a green build never did.**

### 6.2.1d · **D-045's SHAPE IN A SECOND CAPABILITY — Discovery-Flow, and the author had already reasoned correctly**

`discovery-flow-engine/src/agents/execution-and-outcome.ts:397` carried its own comment before this ADR existed:

```
// Existing assets are found by fingerprint BEFORE publication. Publishing first
// and deduplicating afterwards leaves duplicates in the customer's provider.
```

**The stake is stated exactly, and the reasoning is right.** An UNREACHED read produces the outcome that comment exists to prevent — duplicates in the customer's provider — **while presenting as a clean empty result.**

**This is the second capability in which the same author-reasoning pattern appears**, and it is D-045's diagnosis confirmed rather than restated: *the author reasoned carefully over a value set in which the failure that mattered did not appear.* In `repository.reuse-decision` the reasoning was about destruction; here it is about duplication — **the correct hazard, named in advance, and still not the one that arrives.** **Recorded and NOT decided**: what Discovery-Flow should do on `reached: false` is that capability's call.

### 6.2.1e · **THREE CAPABILITIES, THREE CORRECT HAZARDS NAMED IN ADVANCE, THREE TYPES THAT COULD NOT CARRY THE ONE THAT ARRIVES**

**This is §5's argument, and it is now measured rather than asserted.**

| Capability | Where | The hazard its author named, correctly, before this ADR |
|---|---|---|
| Functional Testing | `repository.reuse-decision` | *"On failure the decision is CREATE, which is wasteful but never **destroys** an existing asset."* |
| Discovery-Flow | `execution-and-outcome.ts:397` | *"Publishing first and deduplicating afterwards leaves **duplicates** in the customer's provider."* |
| Functional Testing | `agents/design-sync.ts` | *"An unreachable tool fails the phase; it never yields 'nothing exists', which would **republish** everything as new."* |

**Destruction. Duplication. Republication.** Three different authors, three different capabilities, each reasoning carefully about a real failure — **and in all three the type could not express the failure that actually arrives**, so the reasoning was applied to a value set the hazard was absent from.

> **THE ADR DOES NOT ADD CAUTION. IT MAKES EXISTING CAUTION KEEPABLE.**

**That distinction changes how this work should be judged.** A reviewer asking *"is this worth eleven operations?"* is asking whether the platform needs more care at these sites. **It does not — the care is already there, in the comments, written before anyone noticed the gap.** What is missing is a type that lets the care apply to the case it was written for. **`agents/design-sync.ts` is the proof: its declaration was unkeepable on Monday and keepable after operation 3, and not one line of its reasoning changed.**

**It also predicts where the remaining operations will find things.** The pattern is not *authors were careless*; it is *careful authors wrote a guarantee the SPI could not honour*. **So the remaining reads should be searched for DECLARATIONS, not for defects** — every `failureHandling` naming an unreachable tool is a site where this ADR has something to make true.

### 6.2.1f · **§6.2.1e's SUPPORT CORRECTED — five operations sit behind ONE declaration**

**The pattern is real. The count that appeared to support it was measuring something else.**

`discoverContainer`, `discoverGrouping`, `discoverTestCases`, `discoverSharedSteps` and `discoverSharedParameters` have **one consumer between them** — `sync.design-discovery` — called inside a single `handle`, three of them in one return object literal. **Its single `failureHandling` covers all five.**

So converting five operations does not produce five confirmations. **§6.2.1e rests on THREE DECLARATIONS ACROSS THREE CAPABILITIES, and that number does not grow as the schedule advances.** Operations 3–7 add none.

> **THIS IS THE SAME CLASS AS §6's ORIGINAL "31 call sites" — a count that looked like it measured one thing while measuring another.**
> §6 counted consumers and read it as surface. §6.2.1e counted operations and read it as evidence. **Both were honest arithmetic over the wrong unit**, and both were caught by asking what the number is a count *of* rather than whether it is correct.

**The prediction is retained** — it found all three, by reading what authors already wrote rather than hunting for what they got wrong. **It is testable only where an operation introduces a NEW consumer**, and on the remaining schedule that is the three `SourceControlAdapter` reads, whose consumers sit in `dev-change-engine` and `discovery-flow-engine`. **Recorded so its next test is a real one rather than a restatement.**

### 6.2.1g · **§6.2.1e FALSIFIED ON ITS FIRST REAL TEST — and §2's prediction confirmed by the same site**

`readTestCase` introduced the first consumer distinct from `sync.design-discovery`, so the prediction got a real test rather than a restatement. **It failed.** `sync.design-validation`'s comment:

> *"OBSERVED, not assumed. A write that returned successfully and stored nothing is exactly the failure a validation reading its own return value cannot see."*

**Careful, correct, and about the LYING-WRITE hazard.** It does not name an unreachable tool, so reading declarations would not have found this site.

> **§6.2.1e finds authors who anticipated THIS failure and misses authors who anticipated a DIFFERENT one just as carefully. It is a search heuristic, not a census** — useful for finding sites cheaply, worthless as a measure of how many there are.

**§2's own prediction was confirmed by the same code.** §2 states that F2's read-back validation *"survives a lying adapter and does not survive an unreachable one."* This is that validation, and it did exactly that. **One prediction confirmed and one falsified on a single site**, which is the clearest available warning against reading either as a rule.

### 6.2.1h · **D-045's FOURTH INSTANCE — the direction reverses, and that makes it worse**

```ts
if (!read) { check('test-case-exists', false, `... cannot be read back from the tool`) }
```

An unreachable tool reported **a written test case as MISSING** — a false negative about the customer's tool contents, produced by a validation that never ran.

| Instance | Default under ambiguity | Cost |
|---|---|---|
| `repository.reuse-decision` | create | duplicates the repository |
| `execution-and-outcome` | publish | duplicates in the provider |
| `design-sync.discovery` | republish | rewrites everything as new |
| **`design-sync.validation`** | **report absent** | **a false finding against the system of record** |

**The first three default toward doing too much. This one defaults toward asserting something untrue about the customer's data.** Under the direction-of-default rule that is the more damaging kind: **redundant work is visible and recoverable; a false finding propagates into reports someone acts on**, and nothing downstream can tell it was produced by a validation that never happened.

### 6.2.2 · **§6.2's FLOOR IS SUPERSEDED AS A PLANNING ARTEFACT. It is kept as the record of what estimation produced.**

**Do not plan from §6.2.** It was derived by reading and by a partial compile, and both methods are now known to be structurally incapable of enumerating this surface. **It is retained, unedited and marked, because a superseded estimate is evidence** — it is the measurement of how far an estimate of an SPI change's surface can be from the surface.

**THE METHOD, RULED AND ADOPTED — convert-then-run. Do not enumerate first.**

1. Convert the operation everywhere **the compiler shows**.
2. **RUN THE FULL SUITE.**
3. **Let the failures name the remaining implementors** — the structural and cast fixtures neither `grep` nor `tsc` can see.
4. Fix, re-run, until **suite-green**.
5. **Commit at suite-green**, then the next operation.

**Intermediate red-suite states WITHIN a session are expected and accepted.**

### 6.2.3 · **THE STOPPING RULE IS AMENDED: SUITE-GREEN, NOT BUILD-GREEN**

**Build-green with red tests IS the half-applied state the old rule existed to prevent — it just did not look like one.** The old rule assumed a broken conversion would fail to compile. It does not: an implementor the compiler never checked keeps compiling and returns the wrong shape at runtime.

> **Never commit, and never stop, on build-green alone.**

**THE FOURTH PRE-LANDING CHECK, earned here:**

> **What enumerates this change's surface — and if the answer is not *"running the suite"*, the surface is not enumerated.**

### 6.3 · Order for the conversion session

**Implementors first, consumers second.** An implementor that has not been converted makes every consumer error a duplicate of the same root cause, and the compiler's output becomes unreadable — which is what happened in the reverted attempt.

1. **Reference adapters and every inline fixture** — wrap in `{ reached: true, value }`.
2. **Consumers, one operation at a time**, in the order the eleven appear in §4.
3. **`dev-change` and `discovery-flow` sites are WRAPPED AND MARKED `UNDECIDED — <capability>`, never reasoned about.** Those are the packages where the negative path is not this ADR's to decide, **which makes them the most mechanical part of the work rather than the least** — the correct edit there is the one that changes no behaviour and leaves a marker.
4. **Conformance:** the suite proves neutrality — 1434 tests must pass unchanged.
5. **R-13.7, clause 2 specifically:** a probe supplying an adapter that returns `reached: false`, a consumer observed taking a different branch, and **evidence that the unreachable branch is the one that executed** — not merely that the outcome changed. A test that only asserts a different result would pass if the value happened to differ for another reason.

### 6.4 · **THE CONSUMER REPAIR — D-045 CLOSED, AND IT WAS TWO INSTANCES RECORDED AS ONE**

**Landed 2026-08-05. §4 deferred this to F3 and §5 said the ADR did not repair D-045. Both are now superseded by the work, and the reason to record that here rather than quietly is that the deferral's premise was wrong in a specific way: it treated D-045 as ONE consumer.**

#### 6.4.1 · **THE SECOND INSTANCE, NEVER RECORDED AS ONE**

`automation.search.*` — eight per-kind agents in `agents/automation-execution-healing.ts` — took `existing: readonly AutomationAsset[]` and declared:

> *"A failed search yields CREATE, which duplicates rather than destroys — the safe direction."*

**That is `repository.reuse-decision`'s sentence, written a second time, by a second author, about a second hazard they named correctly.** §6.2.1e's table lists three capabilities and three correctly-named hazards; **this is a fourth, in the capability the table already appears in twice, and the search-by-declaration heuristic would have found it.** It was missed because nobody searched a second file for the defect already recorded about the first.

**THE CHAIN IS WHY THIS HALF IS WORSE.** A `create` from `repository.reuse-decision` is a decision. A `create` from `automation.search.*` is consumed by `automation.gap-detection` and executed by `automation.generation` — **eight kinds × every certified test case.** The repository half duplicates test cases in the customer's tool; the automation half turns an unreachable read into **a plan to generate the customer's entire automation repository a second time.**

#### 6.4.2 · The change

- `EngineDependencies.existingAssets` and `.existingAutomation` become `ReadOutcome<…>`; `EngineState.matches` and `.duplicates` follow, because discovery runs the search and execution-planning takes the decision **three stages apart**, and unwrapping at discovery would resolve the failure path in the stage that cannot act on it.
- **Sixteen search agents propagate the outcome** rather than inventing matches — and every one is still INVOKED on the unreached path, because *"an unreachable repository yields no matches and is reported"* is the agents' own declaration and short-circuiting before them would leave it unkept by the thing that makes it.
- **A fourth `ReuseDecision` member: `{ kind: 'undecidable'; reason: string }`.** Named so it says the decision **could not be made**. `create` with a different reason would have been the defect with better prose.
- **`execution-planning` REFUSES on any undecidable decision** — `emit.refuse`, ADR-0071's outcome, which is what "the stage did its work and the answer is no" is for.

#### 6.4.3 · **THE REFUSAL EXISTS FOR A FAILURE MODE THIS ADR NEVER NAMED**

§1 measured *a certified plan to CREATE EVERY ASSET*. **The refusal is not for that.** Once decisions can say `undecidable`, `automation.generation` correctly generates nothing for one — and that is the defect in its quieter form. **An undecidable decision falls through every downstream branch**: not `reuse`, so the scenario is not marked satisfied; not `create`, so nothing treats it as a gap. It simply does not appear. The run authors what remains, composes a repository short by exactly what was never searched for, **certifies coverage against its own reduced denominator**, and publishes.

> **NOT A WRONG PLAN — A SMALLER ONE, INDISTINGUISHABLE FROM A STORY THAT NEEDED FEWER TESTS.**
> **Generating less is as wrong as generating everything, and nothing downstream can see it.**

**NEITHER D-045 NOR THIS ADR NAMED THIS FAILURE MODE, and both were looking straight at it.** D-045's harm is *"a certified plan to duplicate everything that repository already holds"*; §1's measurement is `create, create, create`. **Both describe the case where the type forces a decision. Once the type can decline, the harm inverts and neither document had a word for the inverted form** — which is why the refusal is the part of this change that could most easily have been left out as redundant. **The fourth member alone would have looked like a complete repair, produced a green suite, and shipped a run that quietly plans less whenever a customer's repository is unreachable.**

#### 6.4.4 · **THE TWO `Extract<>` NARROWINGS — ONE SURVIVED THE FOURTH MEMBER AND ONE DID NOT, AND THE DIFFERENCE GENERALISES**

Both compiled before and after. **Compiling was never the test.**

| Site | Selector | Filter | Verdict |
|---|---|---|---|
| `repository.certification` | `Extract<ReuseDecision, { assetId: string }>` — **structural** | `d.kind !== 'create'` — **complement of one kind** | **BROKEN** |
| `automation.gap-detection` | `Extract<ReuseDecision, { kind: 'create' }>` — **by the discriminant** | `d.kind === 'create'` — **the same kind** | **INTACT** |

**The certification predicate asserted a STRUCTURAL property while filtering on the COMPLEMENT OF ONE KIND, and the two agreed only while `create` was the sole member without an `assetId`.** A fourth member without one broke the agreement, and **`tsc` accepted both readings because a type predicate is an assertion it does not verify.** An undecidable decision would have passed the filter, been typed as carrying an `assetId` it does not have, and refused with `reuse names asset(s) no search returned: undefined` — **a refusal, so a green suite, and a reason naming a defect that does not exist instead of the outage that does.**

> **ASK WHAT A NARROWING EXCLUDES, NOT WHETHER IT STILL COMPILES.** A narrowing that selects by the discriminant grows correctly with the union. **One that selects structurally while filtering by kind is a coincidence with a type signature**, and it is silent when the coincidence ends.

**The same defect appears one line above `gap-detection`'s intact narrowing, with no `Extract<>` to flag it:** `reuse: decisions.filter((d) => d.kind !== 'create').length` **would have reported an unread index as eight kinds successfully REUSED** — the most confident possible statement about a repository nothing looked at. `repository.reuse-analysis` carried the same shape in its rate denominator. **Both were corrected with the member rather than after it.**

#### 6.4.5 · **THE MEASURED SURFACE — four corrections, all in the same direction**

**§6.2.1's law needs a third clause.** A `grep` is blind to implementors; a **compile** is blind to implementors it does not type-check; and — added here — **a PACKAGE SUITE is blind to implementors it does not import.**

| Predicted | Measured | |
|---|---|---|
| 8 construction sites | **9** | `index.ts` re-exports the type and constructs nothing |
| 5 test fixtures | **6** | |
| 1 `.mjs` implementor | **3** | `authoring-bridge.mjs` **plus** `run-functional-completeness.mjs` and `run-capability-conformance.mjs` |
| 14 search agents | **16** | 8 `repository.*` + 8 `automation.*` |

**The two governance runners are the finding.** §6.2.1a's `authoring-bridge.mjs` was invisible to `tsc` and caught by the package suite. **These two are invisible to BOTH** — no compile reaches them and no package test imports them; only a governance gate does. **`node --test` found `authoring-bridge.mjs` on the first run and would never have found these.**

**AND A CONSUMER CLASS §6.2.1 DID NOT NAME: `as never` AT THE CALL SITE.** Six invocations across two test files passed the old shape through `agents.invoke<never, O>(id, { … } as never, ctx)`. **The build was green and five tests were red** — §6.2.1a's signature arriving from the opposite side: not an implementor the compiler never checked, but **a consumer that instructed the compiler not to check it.** §6.2.3's stopping rule is confirmed a second time by a mechanism it did not anticipate.

#### 6.4.6 · Guarded both ways, and measured through the SPI

**`reached: false` refuses. `{ reached: true, value: [] }` still yields `create` with the reason it always had**, asserted explicitly at both instances. **A change that turned an empty repository into an unreachable one would satisfy half the probes and be the worse defect — it would refuse every green-field story.**

**R-13.7 clause 2** is met by tracing, not by counting: the probes supply an unreached read carrying a reason string (`ADO-OUTAGE-7`, `GIT-OUTAGE-9`) that **exists nowhere in the engine**, and assert it in the stage verdict. **That is the evidence the unreachable branch is the one that executed** — a test asserting only that the outcome changed would pass if the value differed for another reason.

**Suite: 391 → 402 (TS), 96 unchanged (`.mjs`), both green.** Workspace green apart from `platform-runtime`'s pre-existing `openssl ENOENT`. `verify-contract-compatibility` PASS before and after.

#### 6.4.7 · **RECORDED AND NOT REPAIRED — a known open question, not an absence**

**`RepositoryIntelligenceModel.existingAssets` in `packages/contracts` carries the same unreachability question.** It is compat-gated with **seven frozen fixtures**, and `verify-contract-compatibility` passes across this change **because the canonical path produces no `ReuseDecision`, so this repair does not reach it.** Answering the question there changes a sealed contract. **The gate's silence is not an answer**, and is recorded as such so a later reader does not mistake a green gate for a settled question.

## 7. Version impact

`@dbiz/capability-framework` minor. **Breaking for any out-of-tree implementor of the five SPIs**; there are none — every implementation is in this repository.

## 8. Affected components

- `packages/capability-framework/src/adapters.ts` — **Amended** (the type; eleven signatures).
- `packages/functional-testing-engine/src/*-adapters.ts` — **Amended** (reference implementations wrap).
- `packages/functional-testing-engine/src/agents/`, `src/domains/` — **Amended** (call sites unwrap).
- `packages/dev-change-engine`, `packages/discovery-flow-engine` — **Amended where they consume `SourceControlAdapter`**; failure paths **UNDECIDED**, owned by those capabilities.
- `program/TECHNICAL_DEBT.md` D-045 — **Amended** (repair possible, not closed).

**Added by the consumer repair (§6.4), 2026-08-05:**

- `packages/functional-testing-engine/src/model.ts` — **Amended** (`ReuseDecision` gains `undecidable`; `namesAnAsset`).
- `packages/functional-testing-engine/src/capability.ts` — **Amended** (`EngineDependencies` × 2, `EngineState` × 2, two stage refusals).
- `packages/functional-testing-engine/src/orchestrators.ts` — **Amended** (repository and automation inputs carry the outcome).
- `packages/functional-testing-engine/src/agents/repository-and-authoring.ts` — **Amended** (8 searches, decision, analysis, certification).
- `packages/functional-testing-engine/src/agents/automation-execution-healing.ts` — **Amended** (8 searches, gap detection, generation).
- `packages/functional-testing-engine/authoring-bridge.mjs` — **Amended** (`.mjs`, invisible to `tsc`).
- `governance/capability/run-functional-completeness.mjs`, `run-capability-conformance.mjs` — **Amended** (`.mjs`, invisible to `tsc` **and** to the package suite).
- `packages/functional-testing-engine/test/conformance.test.ts` — **Amended** (fixture, six `as never` call sites, and the R-13.7 clause-2 probes).
- `packages/functional-testing-engine/test/authoring-pipeline-conformance.test.ts` — **Amended** (fixture and two `as never` call sites).
- `packages/functional-testing-engine/test/authoring-specification-conformance.test.ts` — **Amended** (fixture).
- `packages/functional-testing-engine/test/design-sync-conformance.test.ts` — **Amended** (fixture).
- `packages/functional-testing-engine/test/review-board-conformance.test.ts` — **Amended** (fixture).
- `packages/functional-testing-engine/test/v22-conformance.test.ts` — **Amended** (fixture).
- `program/TECHNICAL_DEBT.md` D-045 — **CLOSED**, and re-scoped from one instance to two.

