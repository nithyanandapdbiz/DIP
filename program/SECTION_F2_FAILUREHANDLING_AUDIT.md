# Section F2 — the `failureHandling` audit

**2026-08-05.** Written BEFORE any repair, which is the instruction and also the only order in
which the result is evidence: an audit taken after its own fixes measures the fixes.

D-024 states the question this answers, and it is one question per declaration:

> *Could the platform have honoured this when it was written, and can it now?*

D-024 also states the scope: **every `failureHandling` declaration in the platform was written
against an SPI that could not fail.** That sentence is the hypothesis. This audit measures it.

---

## 1. Method, and what it is blind to

**Extracted mechanically, classified by reading, and the instrument's own defects are recorded
below rather than smoothed out** — three of them mattered, and all three were the failure class
this register keeps finding.

1. Every `failureHandling:` in `packages/**/src` — 624 production declarations across six
   capability packages.
2. For each, the **handle body's actual SPI calls** — not its `toolContracts` field. `toolContracts`
   is itself a declaration and drifts (§5).
3. For each SPI operation, whether its **return type can carry a negative**, three-way:

| Expressiveness | Shape | Can say |
|---|---|---|
| `reason` | `ReadOutcome<T>` · `WriteOutcome<T>` · `PublicationOutcome` | that it failed, **and why** |
| `negative-only` | `{ published: boolean }` · `{ applied: number }` · `{ linked: boolean }` | that it failed. **Not why** |
| `literal` | `{ published: true }` · `{ linked: true }` · `{ containerId: string }` | **nothing but success** |

**The three-way split is load-bearing and was not in the first two passes.** Collapsing
`negative-only` into `literal` would have reported six declarations as unimplementable that are in
fact *partly* implementable — the negative lands, the reason does not — and that is the
not-applicable/refused conflation this platform has now removed at four boundaries.

### 1a. Three defects in the instrument, recorded because each is a register entry's shape

| # | Defect | Class |
|---|---|---|
| 1 | `.publishResult(` was credited to **every** SPI declaring that name, so an `ExecutionAdapter` call (can fail) also counted as a `SecurityAdapter` one (cannot). Fixed by resolving the **receiver**; where the receiver cannot resolve, the call is reported `AMBIGUOUS` rather than guessed | **D-025** — a pattern matching on shape. The fix is the discriminator, not a looser rule |
| 2 | The handle body was bounded by brace-matching, which returns to depth zero on a typed arrow signature (`handle: (input: { ctx: C }): readonly R[] =>`) **before the body begins** — so 5 agents' calls were attributed to their predecessors and `performance-engine`'s five `sync.*` agents read as calling nothing | Bounding by the next agent is correct here |
| 3 | `KEPT` was decided by *"does the body read `.published` anywhere"*. `dev-change sync.defects` reads `result.published` to choose a `remoteId` **and still returns `published: true`** — so the test passed on the one agent D-024 names as broken | **D-027 inside the audit's own instrument** — an assertion that cannot discriminate. Hardcoding now outranks reading |

**Defect 3 is the one worth keeping.** The instrument built to find declarations that cannot fail
had a check that could not fail on the register's own worked example. It was caught by running it
against D-024 and reading the answer, not by inspecting the instrument.

**What this audit is blind to, stated rather than discovered later:** it measures whether a
declaration's SPI *can* carry the negative and whether the code *does* read it. It does not measure
whether the reason string is accurate, and it does not reach the 575 declarations that call no SPI
at all — those can still be unimplementable through their **own return type** (D-043's class,
`test.coverage-analysis` declaring `unknown` over a type with no `unknown`). **That is a second
audit with a different instrument, and it is named here rather than folded in.**

---

## 2. The result

```
production failureHandling declarations          624
  reach an SPI operation in their handle           49
    KEPT — SPI can say no, and the code reads it   19
    KEEPABLE, NOT KEPT — SPI can say no; code ignores it   7
    UNIMPLEMENTABLE — an SPI it calls cannot say no        22
  call no SPI operation                           575
    of which DECLARE a toolContract anyway         21
```

**D-024's hypothesis is confirmed and its scope was too narrow.** It says every declaration was
written against an SPI that could not fail. Measured: of the 49 that reach an SPI, **29 were
written against an operation that still cannot fail or whose repair is unwired** — and ADR-0072,
ADR-0073 and ADR-0074 between them moved 19 into the honoured column.

### 2.1 · Which are now TRUE — and the three the instruction names are the right three

**ADR-0074 made three declarations keepable, and not one word of any of them changed.** That is
the audit's cleanest result, because it is the ADR's own claim (§6.2.1e — *"the ADR does not add
caution, it makes existing caution keepable"*) measured from the declaration side:

| Declaration | What it always said | What made it true |
|---|---|---|
| `sync.design-discovery` | *"An unreachable tool fails the phase; it never yields 'nothing exists', which would republish everything as new"* | `ReadOutcome` on the five `discover*` operations |
| `repository.search.${repo}` (×8 agents) | *"An unreachable repository yields no matches **and is reported**; it never yields 'no duplicates exist'"* | `ReadOutcome` in and out |
| `automation.search.${kind}` (×8 agents) | *"A failed search yields CREATE, which duplicates rather than destroys"* — **rewritten**, because this one was wrong rather than merely unkeepable | `ReadOutcome` + the fourth `ReuseDecision` member |

**The third is not the same kind as the first two, and the difference is the finding.** The first
two were CORRECT SENTENCES A TYPE COULD NOT CARRY — they became true when the type changed.
`automation.search.*`'s sentence *described the defect*: it declared CREATE-on-failure as the safe
direction, and CREATE-on-failure was the harm. **A declaration can be unkeepable, and a declaration
can be wrong, and only one of those is fixed by widening a type.**

The remaining sixteen in the honoured column were made true earlier: ADR-0073 for the six
design-sync writes (D-028's four plus shared assets and the write itself), ADR-0072 for
`ExecutionAdapter`'s three publishes, and ADR-0074's read direction for `SourceControlAdapter`'s
three discoveries.

### 2.2 · Which are STILL UNIMPLEMENTABLE — 22, and they cluster

**Four SPIs were never touched by ADR-0072/0073/0074, and 20 of the 22 sit on them.**

| SPI | Operations that can report failure | Declarations resting on it |
|---|---|---|
| `WorkItemAdapter` (framework) | **0 / 4** | 6 — `dev-change sync.work-items`, `discovery-flow workitem.{story,labels-components,traceability}`, `requirement.dependencies` |
| `SecurityAdapter` (**penetration-testing's own**) | **0 / 7** | 4 |
| `SecurityAdapter` (**security-testing's own**) | **0 / 7** | 5 |
| `TestManagementAdapter` (**performance's own**) | **0 / 6** | 3 |
| `ReportingAdapter` (framework) | **0 / 5** | reached transitively |
| `ProjectAdapter.linkRequirement` | literal `{ linked: true }` | 2 |
| `TestManagementAdapter.{createContainer,createGrouping}` | literal | 2 |
| `SourceControlAdapter.diff` | plain array | 1 |

> **THE LARGEST SINGLE FINDING: THREE CAPABILITIES DEFINE THEIR OWN PUBLICATION SPI, AND
> ADR-0072's REPAIR NEVER REACHED THEM.**
>
> `penetration-testing-engine/src/adapters.ts`, `security-testing-engine/src/adapters.ts` and
> `performance-engine/src/adapters.ts` each declare a private `SecurityAdapter` or
> `TestManagementAdapter`. **Twenty operations, none of which can report that the customer's tool
> refused** — `publishFinding → { externalId }`, `publishResult → { published: true }`,
> `linkTraceability → { linked: boolean }`, `createContainer → { containerId }`.
>
> Every one of the twelve `sync.*` declarations across those three capabilities promises
> `published:false with a reason`. **Every one of their handles returns `published: true` as a
> literal**, and eleven of the twelve discard the adapter's return value entirely.

**This is D-028 exactly, three more times.** D-028 is *"the design-synchronisation SPI has the same
defect ADR-0072 just removed from its sibling — and ADR-0072 did not touch it"*. It was recorded
as one recurrence and repaired as one. **It was three more, in three capabilities, and nobody
searched a second package for the defect already recorded about the first** — which is D-045's
closing sentence, verbatim, at the SPI level instead of the agent level.

**The count is not the finding; the direction is.** ADR-0072 §scope reasoned about *"the SPIs
Section C's publication semantics ran through"*. That was true and it was a scope over a
**session's work**, not over the **platform's SPIs**. Four SPIs were outside it, and no artefact
recorded that they were outside it.

### 2.3 · Which were ALWAYS WRONG — a fourth bucket the question did not anticipate

D-024's question has two answers — *never implementable* and *stopped being true*. **Measured, there
is a third: declarations that describe an operation the agent does not perform.** They are not
unimplementable; they are about something else.

| Declaration | Says | Does |
|---|---|---|
| `story.retrieval` (FTE) | *"A story that cannot be retrieved stops the run"*, `responsibilities: ['fetch via adapter']`, `toolContracts: ['ProjectAdapter']` | receives an already-fetched `Story` and calls **no adapter**. The fetch is at `capability.ts:405` |
| `security-testing sync.traceability` | *"a traceability link that fails is recorded published:false with a reason"* | calls `publishResult` and **links nothing** |
| `performance reporting.executive-pdf` | *"A PDF that renders below a valid document size fails the reporting review"* | calls a **caller-supplied function**, not an SPI; nothing in the agent inspects the size |

**These cannot be fixed by widening a type, and a type-widening programme will report them as
closed when their SPI is repaired.** `story.retrieval` will be marked keepable the moment
`ProjectAdapter.fetchStory` can fail — it already can — and the declaration will still be describing
a call the agent never makes. **Recorded as its own class so the repair of §2.2 does not silently
absorb it.**

### 2.4 · The seven that are KEEPABLE AND NOT KEPT

**These are the only ones where the repair is small and entirely within one capability's own
code** — the SPI already says no, and the agent throws the answer away.

| Declaration | The SPI can say | The code returns |
|---|---|---|
| `dev-change sync.defects` | `PublicationOutcome` | `published: true`, with the finding recorded in a comment at the site |
| `dev-change sync.results-and-evidence` | `PublicationOutcome` ×2 | `published: true`; both return values discarded |
| `discovery-flow defect.publication` | `PublicationOutcome` | `published: true` |
| `dev-change repository.co-change-history` | a count | reports reduced confidence nowhere |
| `pentest sync.traceability` · `performance sync.{evidence,traceability}` | `{ linked: boolean }` / `{ published: boolean }` — the negative, not the reason | `published: true`, `reason: null` |

**`dev-change sync.defects` is D-024's own worked example and it is still open**, which is correct
and deliberate: D-024 records it as *"not wired here, deliberately — the decision belongs to the
capability that owns it"*. **The audit's job was to say whether that is still the state. It is.**

---

## 3. The `toolContracts` drift — 21 declarations, a second register entry's shape

**21 agents declare a `toolContracts` their handle never calls.** Two sub-classes, and only one is
a defect:

- **Legitimate** (most): the agent decides over a value the Execution Plane supplied — `ReadOutcome`
  in, decision out. `repository.search.*` declares `ProjectAdapter`/`TestManagementAdapter` and
  correctly touches neither, because D-045's repair moved the read to the composition. **The
  declaration names the tool the DATA came from.**
- **Three name a contract that exists as no type anywhere in the repository:**
  `CustomerFindingStore`, `EvidenceCustody`, `TargetConnectivity` — declared by five
  `penetration-testing-engine` agents, defined by nothing.

**Recorded, not repaired.** Whether `toolContracts` means *"calls this SPI"* or *"this run's data
came through this SPI"* is undecided, and both readings are in use. **Deciding it is a
declaration-semantics question, and inventing an answer here would put a third meaning in the
tree.** It belongs with the R-12.11/R-12.2 ADR, which is already the queue's naming-and-declaration
item.

---

## 4. What this audit does NOT license

**It does not license a bulk widening of the four untouched SPIs.** ADR-0072's own precedent is
that a negative-path decision belongs to the capability that owns it, and 20 of the 22
unimplementable declarations sit in Penetration Testing, Security Testing, Performance and
Dev-Change. **A wrong negative-path decision stays invisible until that capability disagrees** —
D-024's sentence, and it applies to the repair of D-024 as much as to D-024.

**The correct next artefact is one ADR naming the four SPIs and the 22 declarations**, with each
capability's failure path marked `UNDECIDED — <capability>` exactly as ADR-0074 §4 did. That is
work this audit scopes and does not perform.

---

## 5. Register impact

- **D-024 — AMENDED, not closed.** Its instance is still live and still correctly unwired. Its
  generalisation is now measured: **29 of 49, not "all of them"**, and the population is 624 rather
  than the unbounded "every declaration".
- **D-028 — RECURRED THREE TIMES, unrecorded.** Three capability-private publication SPIs carry the
  defect ADR-0072 removed from the framework's. New entry owed.
- **New class — a declaration about an operation the agent does not perform.** Three instances.
  Distinct from D-007 (a declaration that stopped being true) and from D-024 (one that was never
  implementable), because both of those describe the agent's own work. **D-058.**

---

## 6. Read-back validation — what F2 DELIVERED, and what it explicitly did not close

**Delivered, and each one is a thing only observation of the tool can produce.**

| # | Change | The argument |
|---|---|---|
| 1 | **An unreachable read-back reports NOT PERFORMED, never FAILED.** `SyncCheckStatus` is three-state; `SyncValidation` carries `observed`; `SyncReport` carries `unvalidated`; a run that verified nothing reports **PARTIAL and refuses**, where it previously reported SUCCESS | ADR-0074 §6.2.1h's fourth instance of D-045 and the one it ranks worst — *a false finding against the customer's system of record, produced by a validation that never ran*. The code itself deferred the behaviour change to F2 |
| 2 | **A normalising tool is diagnosed, and the recurrence is named.** A hash mismatch on a case THIS RUN WROTE has one remaining explanation: no other writer intervened between the write and the read | Assumption #2. At `sync.design-idempotency` a differing digest is *content changed* **or** *the tool normalises*, and the agent holds no evidence separating them — so it decides `update`, correctly given what it knows, forever. **At read-back the write and the read are the same tick.** Measured as an assertion, not argued |
| 3 | **Duplicate links are observed.** `links-not-duplicated` counts what the tool HOLDS per work item | Assumption #5. The census is honest about every call it made and structurally blind to a link the tool already held. `requirements-linked` cannot serve — it asks set MEMBERSHIP, and a set is the structure that discards multiplicity |

**Each probe faults the tool, not a copy of the tool's answer (R-13.7 clause 2).** The normalising
probe alters what the adapter STORES and lets the real `readTestCase` observe it; the appending
probe IS an appending adapter. `ADO-READBACK-OUTAGE-11` exists nowhere in the engine and is traced
to the output, so a passing assertion is evidence the intended branch fired.

**Guarded both ways, deliberately.** `{ reached: true, value: null }` — the tool answered and holds
no such case — is still a **failed** check with `observed: true`. Turning every negative into
`not-performed` would have satisfied probe 1 and destroyed the finding read-back exists to produce.

### 6.1 · What F2 CANNOT close, recorded at exit as it was at entry

| Limit | Status |
|---|---|
| **Assumption #2 is not closed by the `v2:` prefix** — a normalising tool returns a SAME-version hash with a different digest | Confirmed. Versioning removed a one-time mass write and does nothing here. **F2 detects and reports it; it does not stop the rewrite** |
| **The hash-storage gap** — idempotency can refuse an incomparable hash and has no SPI operation to store the recomputed one | **F2 CANNOT CLOSE IT. It needs its own change** — a hash-only write on `TestDesignSyncAdapter`, which is a frozen-SPI interface change and therefore an ADR. **D-059**, sequenced with D-057's |
| **`suite-assignment`'s race** — the grouping may be deleted or moved between discovery and assignment | **Unfixable by any SPI change, and F2 does not claim otherwise.** Read-back's `suite-assigned` check observes what the tool holds afterwards, which IS the whole available remedy — the race is reported, never prevented |
| **F2 delivers read-back and cannot CLOSE it** | Its value is surviving a lying adapter, and **no adapter in this tree lies.** Every assertion above is against a probe this work constructed. **Closure waits on a real connector**, and this is stated at exit exactly as ADR-0073 §4 and the F-entry report required |

> **THE HONEST SUMMARY: the mechanism is built and proven to FIRE; it is not proven to have been
> NEEDED.** Three failure modes that no honest layer beneath them could catch are now caught, in a
> tree where none of them occurs naturally. That is the most F2 was ever able to deliver, and
> reporting it as done would be the declared-but-unbuilt failure class arriving through a green
> suite.

### 6.2 · Measured

- FTE TypeScript suite **402 → 409**, all pass; `.mjs` **96** unchanged, all pass.
- Workspace build green; every package suite green **except `platform-runtime`**, whose 13
  failures are all `spawnSync openssl ENOENT` — an absent binary, confirmed by running it, not
  assumed from the record.
- **Governance gates: 215 checks, 46 red, byte-identical on a stashed clean tree and on this one.
  ZERO net-new reds — diffed, not inferred from the summary lines.**
- `verify-contract-compatibility` **PASS** (7 frozen fixtures); `run-functional-completeness.mjs`
  and `run-capability-conformance.mjs` — the two runners invisible to both `tsc` and the package
  suite — **exit 0**.

### 6.3 · Three defects in this work, caught by running it

Recorded because each is a register entry's shape, arriving inside the change that was auditing
for exactly that shape:

1. **An assertion that tested its own fixture.** `!/normalis/i.test(reason)` failed because the
   fixture's stored hash was named `-normalised` and the agent quotes the stored hash. **D-027 —
   an assertion that cannot discriminate.** Fixed at the fixture, not by relaxing the assertion.
2. **Two assertions against the wrong artefact.** The report's summary line carries COUNTS; the
   findings carry REASONS. Asserting `NOT VERIFIED` against the summary passed nothing.
3. **The classifier's `KEPT` test could not fail on D-024's own worked example** — it asked *does
   the body read `.published` anywhere*, and `dev-change sync.defects` reads it to choose a
   `remoteId` while still returning `published: true`. **The instrument built to find checks that
   cannot fail had one.** Caught by running it against the register's named instance and reading
   the answer.
