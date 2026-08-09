# Section F3 — shape report

**REPORT ONLY. Nothing built. Stop for ruling.** · 2026-08-05

**Nine items, four kinds of work, and the kinds do not share a method.** Two are decisions that produce no code until taken; one is a mechanism change to a platform contract; four are mechanical; two are capability-content rulings. **Sequencing them as one backlog would put the highest-consequence item behind four cheap ones and would ask a design question in the middle of a lint.**

**The FT- steps are ADR-0066's canonical workflow FT-001→FT-037 v2.3.0, affirmed not modified. The seventeen-step business narrative is a VIEW onto it (ADR-0069 §2.1) — no second numbering is created here.**

---

## Summary

| # | Item | Kind | FT step | Narrative step | Build or decision |
|---|---|---|---|---|---|
| 1 | `sharedSteps` | **Capability design** | FT-030 | 11 (organise) | **Decision, then build** |
| 2 | `storyId` · `storyTitle` | Capability content | FT-006 | 1–2 | **Decision** |
| 3 | `workItemIds` | Capability content | FT-030 | 11 | **Decision** |
| 4 | design `artefacts` | Capability content | FT-030 | 11 | **Decision** |
| 5 | `businessGoal` / `title` upstream source | Capability content | FT-006 → FT-018 | 1–2 → 6 | **Decision** |
| 6 | **The read direction (D-045)** | **Mechanism** | FT-002/003, FT-016 | 3–5 | **Build** |
| 7 | config dereference (D-037) | Mechanical | FT-001 | — (canon-only) | Build |
| 8 | `testCases` type (D-031) | Mechanical | FT-018 | 6 | Build (ruled) |
| 9 | the fifth dependency | Mechanical | — | — | Build, **last** |

---

## CAPABILITY DESIGN — item 1

### 1 · `sharedSteps` — **a design question, not a gap**

**Nothing canonical recommends shared steps.** `PROJECT_STATE.md` §9.3d-i: it is immune to all three remedies the other seven admit — threading a dependency does not create it, widening an input record gives it nowhere to come from, dereferencing a configuration does not produce it. **There is no field to populate and no producer to build a field for.**

**The three questions, and each is a real decision:**

- **What recommends them?** A recommender is a **new producer** — the only item of the nine that adds a unit rather than connecting existing ones.
- **On what evidence?** The authored suite, which exists only after test-management organises it. **So the evidence postdates most of the sequence**, which constrains the answer to the third question.
- **At which stage?** This determines whether the recommendation can reach design-synchronisation at all. **Place it too late and it cannot; too early and it has nothing to read.**

**FT-030 (synchronisation) depends on it. Narrative step 11 (organise) serves it.**

**Proving it requires** a recommendation traceable to the repeated sequences it was derived from, and — under R-13.7 — **a case where a suite contains no extractable repetition and the recommender says so** rather than returning an empty list. **Note the reading's own instruction here: the direction of the default.** A shared-step recommender that returns `[]` on failure and `[]` on nothing-to-extract is L-1's shape; its default is safe (no extraction proposed), so it is debt rather than D-045 — **but it should be typed correctly on the first attempt, since this is the one item being designed from nothing.**

**Decision, then build.** The decision does not depend on any of the other eight.

## CAPABILITY CONTENT — items 2–5

**Same class as D-031's ruling: which domain produces a field is a capability-content decision, not plumbing.** `PROJECT_STATE.md` §9.3d records that three independent measurements — D-031 (fields), D-032 (producers), D-036 (inputs) — say the canonical runtime is a **reduced** capability rather than a re-arranged one. **These four items are that reduction, enumerated.**

**None of the four has a producer at any canonical domain.** They reach design-synchronisation today only through `authoring-bridge.mjs`, which is why ADR-0061 §6.6's retirement is deferred: **retiring the agent path removes the bridge, and the bridge is where these come from.**

- **2 · `storyId`, `storyTitle`** — FT-006 (story intelligence) is the only domain positioned to know them; it does not currently emit them. **Narrative steps 1–2.**
- **3 · `workItemIds`** — the traceability targets a design-sync link is published against. **FT-030, narrative step 11.**
- **4 · design `artefacts`** — attachments carried to the tool. **FT-030, narrative step 11.**
- **5 · `businessGoal` / `title` upstream source** — **folded in here as one item rather than carried separately.** D-032 records that neither has a source; `canonicalSpecOf` maps `objective → title` at the publication boundary and states the reason (D-036). **FT-006 produces the story; FT-018 authors the case.** The decision is which of the two owns the field, and it is the same question items 2–4 ask.

**All four are DECISIONS.** No code follows until each names an owning domain. **Proving them requires** the named domain emitting the field and a conformance assertion that the value reaching synchronisation came from that domain rather than from a fallback — **specifically NOT a `??` fallback, which is D-013's shape and already has three recorded instances.**

## MECHANISM — item 6

### 6 · **The read direction of ADR-0072/0073 — the highest consequence of the nine**

`PROJECT_STATE.md` §9.3d-ii · `TECHNICAL_DEBT.md` D-045.

**It is the only one of the nine whose outcome is a WRITE TO A CUSTOMER'S SYSTEM OF RECORD.** The other eight produce a missing field, a wrong type or an absent capability. This one produces a certified plan to duplicate everything a customer's repository holds, from an outage the platform cannot report.

**Writes can report refusal (ADR-0072/0073). Reads cannot report unreachability.** Scope: `findExistingTests`, the eight `repository.search.*` agents, and every other read of a customer tool. **Requirement in one sentence: an unreachable read must be distinguishable from an empty one.**

**`healing.validation` is the reference shape and settles the size of the work:**

```ts
{ action: HealingAction; retryOutcome: TestOutcome['outcome'] | null }
// `null` means the Execution Plane did not observe a retry. That is NOT a pass.
```

**One union member. Not a redesign.** An argument that this item is large is answered by that file.

**FT-002/FT-003 (resolve project and test-management connectors) and FT-016 (repository reconciliation) depend on it. Narrative steps 3–5.**

**Proving it requires**, under R-13.7 and specifically clause 2: an adapter that reports unreachable, a consumer that behaves differently from the empty case, and **a probe showing the unreachable branch executed** — not merely that the outcome changed. **D-039's design-time check applies before a line is written:** *if this mechanism ships, what flows through it on the first real run?* Here the answer is non-empty, which is what distinguishes it from the two mechanisms D-039 stopped.

**Two dependencies, recorded because neither is obvious:** `findExistingTests` is one of C-4's two never-called operations **and is exactly the operation whose first call would be a read whose emptiness decides whether a test already exists** — the gap and the dormancy are the same fact seen twice. And **F2's read-back validation assumes reads are trustworthy**: *"read back, so validation observes the tool rather than trusting the write"* survives a lying adapter and **does not survive an unreachable one**, because an unreachable read-back returns the same empty result as a write that silently did nothing.

**Build. And it lands with placement or before it, never after** — after placement the same repair happens while a live connector is producing the wrong value against a customer's system of record, which is the window ADR-0072 was deliberately landed inside.

## MECHANICAL — items 7–9

### 7 · Config dereference (D-037) — **a reference resolved and never read, by a sequence that cannot read it**

Tenant configuration values reach design-synchronisation through the bridge. **FT-001 (tenant configuration) is where they originate.** No narrative counterpart — ADR-0069 §2.1 records FT-001 as one of four canonical steps with none. **Build.** Proving it requires a configured value observably changing a published field, and the unconfigured case producing a stated default rather than an empty string.

### 8 · `testCases` type (D-031) — **already ruled**

Two `TestCase` types exist. The ruling stands; this is its execution. **FT-018 (test-case authoring), narrative step 6. Build.** Proving it requires the type unification compiling across both consumers with no widening — **a widened union would satisfy the compiler and lose the reduction D-031 measured.**

### 9 · The fifth dependency — **last, once the rest resolve**

Deliberately sequenced last: it is a threading problem whose shape depends on what items 2–5 decide about ownership. **Attempting it first would thread a dependency to a producer that has not been chosen.**

---

## What this report deliberately does NOT plan

**The migration-read repairs are NOT part of this backlog, and they are not one class either.** `AGENT_MIGRATION_BAR.md` records fourteen findings behind the dormancy gate (`verify-canonical-agent-dormancy.js`, 71 gates), and they divide by remedy, not by severity:

| Class | Instances | Remedy | Belongs |
|---|---|---|---|
| **The lint class** | G-1, D-044, S-1 | **A zero-guard consistency check keyed on the majority form within one array literal, function or file.** All three fail it, at three scope levels. | A gate. Independent of F3's nine. |
| **The reading class** | **D-035** | None available. Fifteen generators declaring `guardrail-review` pass every mechanical rule that exists or is planned — prefixes resolve, domains match, ids unique, `toolContracts: []` *accurate*. | **A human reading. Recorded UNCLOSED, not pending.** |

**Merging them would put an unclosable item on a schedule.** `verify-agent-naming.js` already states this in its own header and prints it on every run, and that record must survive F3 rather than be absorbed into it.

---

## Ruling requested

1. **Sequence.** I would take **6 first** — highest consequence, and the only one whose cost grows once a live connector exists — then **2–5 as a single decision session** (they ask one question four times), then **1**, then **7–9**. Item 6 first, deliberately, despite items 7–9 being cheaper.
2. **Items 2–5 — are they four decisions or one?** They differ only in which domain is named. **One ruling with four answers is cheaper than four rulings and less likely to produce inconsistent owners.**
3. **Item 1 — is the recommender in scope for F3 at all?** It is the only item that adds a producer. **If F3 is placement, a new producer may belong to a later section**, and the honest answer may be that F3 rules the design question and does not build it.
4. **The lint gate — F3 or independent?** It repairs nothing F3 needs and would catch a class F3 could otherwise reintroduce. **I would build it independently and before F3**, on the same argument that put G-5 ahead of the reading.
