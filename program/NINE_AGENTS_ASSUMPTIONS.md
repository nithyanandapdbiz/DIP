# The nine design-sync agents — what each assumes that is true only because something below it cannot yet fail

**2026-08-04.** One entry per agent. Written from reading each agent's body, not its declaration — the lesson of D-035, where twenty agents were characterised from a `stage` field and fifteen were the opposite of what it said.

**This record is the residue of the reading, not a substitute for it.** Its purpose is to be checked against when a layer beneath one of these agents becomes honest. Section C found three such collapses already (a short array, four literal returns, a never-null id); every entry below names a candidate for the fourth.

---

### 1 · `design-sync.discovery`

**Assumes a null return is the ONLY way discovery fails.** It calls `discoverContainer` and `discoverGrouping` and throws if either is null. `discoverContainer` and `discoverGrouping` are the two operations on this SPI that *can* express absence (`| null`), and the agent treats absence as the complete failure vocabulary.

**True only because no adapter fails mid-discovery** — returns a container and then cannot read its groupings, or returns a stale container from a cache. A real ADO connector distinguishes *"no such plan"* from *"could not reach the plan service"*, and this agent would throw the same error for both. **The reach-versus-refuse rule, at the one place on this SPI it is not yet expressible.**

### 2 · `design-sync.idempotency`

**Assumes the tool stores what it was given, byte for byte.** Its whole decision is `syncHash` equality: equal hash ⇒ skip. That is sound if and only if the hash the tool returns was computed over content the tool did not alter.

**True only because the reference adapter stores the spec verbatim.** A tool that normalises on write — trims whitespace, reorders steps, canonicalises a title — returns a different hash for the same input, and this agent decides `update` **on every run, forever**, silently converting an idempotent phase into an unconditional rewrite. **The failure is invisible: every run succeeds and the counts look busy.**

### 3 · `design-sync.shared-assets`

**Assumes a shared asset's NAME is its identity.** `stepsByName` and `paramsByName` are keyed on name alone, so an existing asset is reused when a name matches.

**True only because the reference adapter namespaces by provider and nothing else shares a name.** In a real tool, shared steps are scoped — per plan, per suite, per team — and two distinct assets can carry one name. This agent would reuse a stranger's shared step and attach it to a customer's certified case. **Note the direction: the failure is silent reuse, not a refusal**, which is why widening the SPI to report refusal would not catch it.

### 4 · `design-sync.test-case`

**Assumes an `update` decision always carries a real `testCaseId`.** The call reads `updateTestCase(input.decision.testCaseId ?? '', spec)` — the `?? ''` covers a state that cannot occur, because `idempotency` only emits `update` when it found an existing case.

**True only because discovery cannot return a case without an id.** A D-013-shaped fallback: it exists, it reads as defensive, and it can never fire. **If it ever did, the empty string would be passed to a real tool as a test-case identifier.**

### 5 · `design-sync.traceability`

**Assumes duplicate links are harmless.** It links the story, then every `requirementId`, then every `workItemId`, with no de-duplication of its own — a requirement that is also a supplied work item is linked twice.

**True only because the adapter de-duplicates** (`if (!stored.linkedWorkItems.includes(link)) push`). The correctness lives in the *store*, not in the agent. A tool that appends rather than upserts accretes duplicate links on every run — **and the link census would count them as successes**, because each call returns `published: true`.

### 6 · `design-sync.attachments`

**Assumes twelve hex characters of a content hash identify an artefact.** `attachmentId` is `${provider}:att:${sha256.slice(0, 12)}`.

**True only because the fixture attaches few artefacts.** Forty-eight bits is ample against a handful and inadequate against a real repository's lifetime of attachments; a collision silently re-uses another artefact's id, and the idempotency check (`if (!includes) push`) then treats the *colliding* artefact as already attached. **The observable symptom is a missing attachment, attributed to nothing.**

### 7 · `design-sync.suite-assignment`

**Assumes the grouping discovered at the start of the phase still exists when assignment runs.** It is handed a `groupingId` and assigns to it without re-reading.

**True only because nothing between discovery and assignment can delete or move a suite** — which is true of an in-memory adapter and not of a shared customer tool where another user is working. **This is the only one of the nine whose assumption is about TIME rather than about a return value**, and it is therefore the one no SPI change can fix: a refusal-capable `assignToSuite` reports the failure but cannot prevent the race.

### 8 · `design-sync.validation` — *the reference pattern, and it still has one*

**Assumes a read reflects a committed write.** Its `readTestCase` is the strongest mechanism in the set — it observes the tool rather than trusting the write — but it reads immediately after writing.

**True only because the in-memory adapter is synchronous and has no replication.** Against a real ADO instance, an immediate read can miss a write that will land, and this agent would report `test-case-exists: false` for a case that exists moments later. **The agent designed for a world where writes fail still assumes a world where reads are instantaneous** — which is worth recording precisely because it is the best of the nine.

### 9 · `design-sync.report`

**Assumes a case appears in at most one failure list.** `failures` concatenates failed write outcomes and invalid validations. A case whose write failed is *also* validated (validation runs for every outcome and reports `test-case-exists: false` when the id is null), so **one failed case can contribute two entries**.

**True only because writes could not fail until this section.** Before `WriteOutcome<T>`, `failed` was always empty and the concatenation could only draw from one side — so the double-count was unreachable, and the `PARTIAL` versus `FAILED` boundary (`succeeded.length === 0`) was never tested against a case counted twice. **This one was created by Section C's own repair**, which is the contagion law applied to work done under it.

---

---

## THE COMPOSED-FORM CHECK — asked of what the composition PROVIDES, and it is not one missing dependency

The instruction was to ask the question that found the missing `TestDesignSyncAdapter` of the other four dependencies too, **before composing**. Asked properly it is not a question about dependencies at all — it is about the **input record**. `DesignSyncInput` has eleven members; `SynchronisationInput` has seven, and they are almost disjoint.

| The nine require | The canonical composition provides |
|---|---|
| `adapter: TestDesignSyncAdapter` | **nothing** — the fifth dependency, already found |
| `storyId` | **nothing** — `testManagementResult.requirementId` is a requirement, not a story |
| `storyTitle` | **nothing anywhere in the sequence** — the same absence as D-032's `title` |
| `workItemIds` | **nothing** |
| `sharedSteps: SharedStepRecommendation[]` | **nothing** — no canonical domain recommends shared steps |
| `artefacts: DesignArtefact[]` | **nothing** — design artefacts have no canonical producer |
| `configuration: Record<string, string>` | **nothing** — the domain receives no configuration record |
| `batchSize`, `maxAttempts` | **nothing** |
| `testCases: TestCase[]` (agent-path) | `CanonicalTestCase[]` — **a different type** (D-031) |

**Eight of eleven inputs have no canonical source, and the ninth is the wrong type.** Only `testCases` is bridgeable, and only through `canonicalSpecOf`.

**This is not a wiring problem and it cannot be solved by adding dependencies.** A dependency is a collaborator the composition injects; these are **facts about the run that the canonical sequence never computes**. `sharedSteps` is the clearest: design-synchronisation reuses shared steps because something upstream *recommended* them, and no canonical domain does. Injecting an adapter does not create a recommendation.

**Three of the eight are the same finding as D-032, widening.** `storyTitle`, `workItemIds` and `artefacts` are authoring context — what a human named, linked and attached — and the canonical sequence produces steps and expected results only. **D-032 said the sequence cannot express a titled test case; this says it cannot express the authoring context a publication needs.** Same gap, measured from the consumer instead of the producer.

**What this means for placement, stated rather than worked around.** The nine cannot be composed into `synchronisation.execute` as they are, by any amount of dependency threading. Either the canonical sequence gains producers for the missing eight — which is domain work, and `sharedSteps` and `artefacts` are capabilities rather than fields — or the nine are re-specified against what the canonical run actually produces, which is a different set of agents. **Both were foreseen at a smaller scale in D-031's (a)/(b) split; this is that decision again, at eight inputs instead of four fields, and it is not an author's call.**

---

## What this record predicts

**Three of the nine (1, 8, 9) name a dependency that a REAL CONNECTOR breaks** — mid-operation failure, read-after-write latency, and a doubled failure count. **Two (3, 6) name a dependency that a real TOOL breaks** regardless of connector quality: name scoping and hash truncation. **One (7) names a race no SPI change can fix.**

**None of the nine answers "nothing", and N5 predicted that a "nothing" for `discovery` would be evidence of shallow reading.** `discovery`'s answer is the first entry above.

**The two that most repay attention are 2 and 5**, because both fail *silently and successfully*: an idempotency check that rewrites forever, and a link census that counts duplicates as achievements. Neither is caught by making a layer beneath them honest — **they are the cases where honesty below does not help, and only observation of the tool does.** That is the concrete argument for read-back validation, arrived at from the agents rather than from principle.

---

# COMPOSED FORM — measured 2026-08-05 from `4d79e59`, against `synchronisation.execute`

**Eight assumptions, not nine.** #1 is STRUCK — closed by ADR-0074, and re-verifying it would be re-checking a gap that no longer exists. #5 is verified against its CORRECTED mechanism, not its recorded one. **#7 was checked first**, as the corollary check instructed, being the only assumption about TIME.

**Measured by instrumenting `TestDesignSyncAdapter` across a full canonical run and recording the ordered call sequence** — not by reading the composition. The sequence is 33 calls; every claim below is read off it.

## #7 · `suite-assignment` — the time assumption. **HOLDS, and the window NARROWED**

**Predicted:** *"if any assumption breaks on the move to `synchronisation.execute`, #7 is where to look first."*

**Measured window, discovery to first assignment:**

```
discoverContainer -> discoverGrouping -> discoverTestCases -> discoverSharedSteps ->
discoverSharedParameters -> createTestCase -> linkWorkItem -> linkWorkItem ->
applyTags -> applyClassification -> assignToSuite
```

**Eleven operations, and it is SHORTER than the agent path's**, which additionally runs `createSharedStep`/`createSharedParameter` between discovery and the first write and `attachDesignArtefact` before each assignment. Those have no canonical producer, so they do not run. **The race #7 names is real, unfixable by any SPI change, and marginally less likely here than where it was recorded.**

> **BUT THE PREDICTION AIMED AT THE WRONG WINDOW, AND THE RIGHT ONE IS MUCH LARGER.** #7 is phrased *within-phase* — discovery to assignment — and that is what narrowed. **What changed is the PHASE'S POSITION.** On the agent path design synchronisation runs at stage 7, before execution. On the canonical runtime it is domain 12, **after execution, healing and defect management**. The customer's tool is therefore read and written on the far side of a browser run — minutes or hours in a real environment, against a system other people are using. **The assumption held; the thing it is an assumption about moved.**

## #5 · `traceability` — **FIRES ON THE CANONICAL RUNTIME, BY A MECHANISM NEITHER VERSION RECORDED**

**Recorded reason (already corrected once):** duplicate links accrete because a requirement that is *also a supplied work item* is linked twice, and the store de-duplicates.

**That mechanism is unreachable here.** `workItemIds` is `[]` — no canonical domain produces work-item ids — so the overlap the assumption describes cannot occur. Measured: **8 `linkWorkItem` calls, 8 distinct (case, link) pairs, 0 duplicate submissions.**

> **AND YET EVERY CASE IS LINKED TWICE TO ONE WORK ITEM.** The composition passes `storyId: story.requirementId`, and each canonical case carries `requirementIds: [design.requirementId]` — **the same identifier.** So every case emits `linkWorkItem(tc, 'REQ-1', 'story')` and `linkWorkItem(tc, 'REQ-1', 'requirement')`. The store does not de-duplicate them because the link STRINGS differ by type, and the census counts both as successes — which is #5's conclusion exactly, reached without #5's cause.
>
> **This is D-046 arriving as behaviour.** `RequirementInput` is *"the shape of a story, named as a requirement"*, and 2a was closed by ruling that `req.id` is the customer's own identifier passed through. It is — and because story and requirement are one value on this runtime, a link pair that means two things on the agent path means one thing twice here. **Not a defect of the agents and not fabricated by the composition: two real relationships to an identifier that happens to be shared.** Recorded rather than repaired — suppressing one link would drop a relationship the agent path legitimately publishes.

## #2 · `idempotency` — normalise-on-write. **STANDS. Versioning does NOT close it**

Measured: 4 `createTestCase`, all submitting `v2:`-prefixed hashes; 4 read-backs, all matching. The reference adapter stores verbatim, so the assumption is **unfalsifiable in-reference**, exactly as recorded.

> **Stated because it is the one an optimistic reading would call closed.** The `v2:` prefix defends against a hash from a DIFFERENT ALGORITHM. A tool that normalises on write returns a hash under the SAME algorithm with a different digest — version matches, digests differ, `update` forever. **Versioning removed a one-time mass write; it does nothing about #2, which remains the assumption that fails silently and successfully.**

## #3 · `shared-assets` and #6 · `attachments` — **STRUCTURALLY UNREACHABLE, not fixed**

Measured: **0 `createSharedStep`, 0 `createSharedParameter`, 0 `attachDesignArtefact`.** Name-scoping collisions (#3) and 48-bit attachment-hash collisions (#6) cannot occur on this runtime because nothing supplies a recommendation or an artefact.

> **This is the recorded capability reduction seen from the assumption side, and it is not a repair.** Both assumptions remain live for the agent path, which does supply them. **An assumption that cannot fire because its input has no producer is dormant, not closed** — and it will wake the moment `sharedSteps` or design artefacts gain a producer. Asserted negatively by `run-functional-completeness.mjs` C-4b, so a future producer cannot arrive silently.

## #4 · `test-case` — `updateTestCase(testCaseId ?? '')`. **STANDS, and gained a second unreachable route**

Measured: **0 `updateTestCase` calls** on a first canonical run. The `?? ''` still covers a state that cannot occur: `idempotency` emits `update` only where it found an existing case, so the id is non-null.

**New since the versioning:** a version-matching hash with a differing digest is a second path to `update` — and it too runs only where an existing case was found. **The fallback's unreachability survived the addition of a new way to reach the branch it guards**, which is worth one line: it is the D-013 shape, still defensive, still incapable of firing.

## #8 · `validation` — read-after-write. **STANDS, unchanged**

Measured: 4 read-backs, all after their own writes, all in the same synchronous tick. The in-memory adapter has no replication, so the assumption is unfalsifiable in-reference — as recorded, and untouched by composition.

## #9 · `report` — one case in at most one failure list. **STANDS, unexercised here**

Measured: 0 failures on the reference run, so the overlap cannot be observed. The de-duplication (`failedIds` set) is in the shared composition and now serves both runtimes; the double-count it prevents remains reachable through the failing connector variant.

---

## N1-N4 — **STRUCK. They were INVENTED, and carried forward as though recorded**

The instruction asked for N1 through N4 measured, prediction against outcome. **They do not exist on disk.** `grep` across every `.md` in the repository returns exactly one N-series reference — `NINE_AGENTS_ASSUMPTIONS.md:97`, citing **N5** — and no document defines N1, N2, N3, N4 or N5 themselves. `git log -S` over `program/` finds no commit that ever added them.

**So the predictions were made in a session and never written down**, and CHARTER's own rule applies to them: chat history is not memory. **Reporting them measured would mean inventing four predictions and then grading my own work against them**, which is the fabrication the standing instruction forbids by name.

> **This is the same class as D-048 and D-051 at the register level rather than the code level: a claim that exists only in a prompt.** The remedy is the one already recorded — *what did I read to get this?* — and here the answer is nothing, so nothing is reported. **RULED 2026-08-05 by their author: STRUCK, and recorded as TECHNICAL_DEBT.md D-054 — the eighth correction, and the first where the artefact being corrected was an INSTRUCTION rather than an estimate, a type or a registry.** They are deliberately NOT reconstructed: writing them down now would produce a reconstruction wearing a record's clothes, and the next reader could not tell. **#5 and #7 had a source, survived the check and are correctly reported measured above — which is what makes the fabrication separable rather than contaminating.** The four with no source did not survive it, and that is the check working.

---

## What the composed form found that the assumptions did not

> **THE TWO SYNCHRONISATION PHASES ARE COLLAPSED ON THE CANONICAL RUNTIME, AND `syncOrchestrator`'s OWN HEADER ARGUES AGAINST IT.**
>
> *"TWO PHASES, AND THE SEPARATION IS THE POINT. Design synchronisation persists certified test assets and stops; result synchronisation publishes what an execution produced. Collapsing them would put a Test Run in reach of the authoring stage, and a phase that can create one eventually will — reporting an execution nobody performed."*
>
> On the agent path the separation is structural: two phases, two stages, two branches of one orchestrator. **On the canonical runtime there is one synchronisation domain, and `synchronisation.execute` now performs both** — `execution.publishResult` and `composeDesignSync` run in the same function body.
>
> **The collapse is PRE-EXISTING and this change made it consequential.** Domain 12 already published test cases, results, evidence and defects together; what it did not have was the design-time write, so the design phase was not in the room. It is now. **The agents themselves still create no execution artefact — they touch only `TestDesignSyncAdapter`, and C-4b measures it — so the guarantee holds today by what the agents can REACH rather than by where they RUN.**
>
> **Recorded, not repaired.** Separating them means re-sequencing `CANONICAL_DOMAIN_SEQUENCE`, which is frozen, and the honest question is whether the canonical runtime should have a thirteenth domain rather than whether this composition should have been written differently. **That is a capability decision of the same class as P-69.2 itself, and naming it is what stops the next author reading the collapse as intended design.**
