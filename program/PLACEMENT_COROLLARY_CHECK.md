# Placement pre-work — the corollary's second half, run before composing

**2026-08-05. Reading only, nothing composed. Run as instructed BEFORE placement.**

> **The corollary's second half: making a layer honest can DESTROY a downstream heuristic that depended on the dishonesty.** Four SPI operations and two domain types changed under these nine agents since `NINE_AGENTS_ASSUMPTIONS.md` was written. **Any inference that held only while those were literals is the next instance.**

**What changed underneath them:** ADR-0072/0073 (the write direction — `PublicationOutcome`, `WriteOutcome<T>`) · ADR-0074 (the read direction — six `TestDesignSyncAdapter` reads now return `ReadOutcome`) · `StoryIntelligenceResult` gained `title` · the nine were renamed `sync.design-*`.

---

## RESULT — one assumption CLOSED, one ALTERED, one GAINED A DISTINCTION, six untouched

### #1 `sync.design-discovery` — **CLOSED BY ADR-0074, and the assumption named the gap that closed it**

**Recorded:** *"Assumes a null return is the ONLY way discovery fails… the agent treats absence as the complete failure vocabulary… A real ADO connector distinguishes 'no such plan' from 'could not reach the plan service', and this agent would throw the same error for both."*

**Its closing clause was: *"the reach-versus-refuse rule, at the one place on this SPI it is not yet expressible."***

> **THAT SENTENCE IS NOW FALSE, AND THAT IS THE FINDING. ADR-0074 made it expressible, and the consumer was converted: `!reached` throws naming the unreachable tool; `value: null` falls through to the absence check. The two are separate branches with separate messages.**

**This is the corollary running the OTHER WAY, and it is worth recording as such.** The corollary's usual form is *a layer became honest and something downstream broke.* **Here a layer became honest and a recorded assumption CLOSED** — the same mechanism, opposite sign. **Assumption #1 does not need checking in composed form. It needs deleting, with ADR-0074 named as what closed it.**

### #5 `sync.design-traceability` — **ITS STATED MECHANISM CHANGED under ADR-0073**

**Recorded:** *"a requirement that is also a supplied work item is linked twice… the link census would count them as successes, **because each call returns `published: true`**."*

**The cited mechanism no longer exists.** `linkWorkItem` returns `PublicationOutcome`, not a literal — that was D-029's repair. **So the census now counts OUTCOMES rather than attempts.**

**The assumption's CONCLUSION survives and its REASON does not.** Duplicate links still accrete, because the agent still de-duplicates nothing and correctness still lives in the store. **But it is no longer true that a refused link would be counted as a success.** **Half of a recorded assumption silently became wrong while the other half stayed right** — which is exactly the shape D-018 records, arriving in a register entry rather than in code.

### #8 `sync.design-validation` — **core assumption STANDS; it gained a distinction it did not have**

**Recorded:** *"Assumes a read reflects a committed write… against a real ADO instance, an immediate read can miss a write that will land."* **Unaffected by reachability — read-after-write timing is orthogonal, and the assumption is untouched.**

**What is new:** `readTestCase` is now `ReadOutcome<X | null>`, so *"the tool answered and holds no such case"* and *"the tool was never consulted"* are separate branches with separate detail strings. **Both still yield `valid: false`** — behaviour-neutral, with the change of behaviour recorded as F2's, which owns read-back validation.

### #2, #3, #4, #6, #7, #9 — **UNTOUCHED, and checked rather than assumed**

`idempotency` (hash equality) · `shared-assets` (name as identity) · `test-case` (the `?? ''` fallback) · `attachments` (48-bit id) · `suite-assignment` (time, not a return value) · `report` — **none rests on a value the four changes altered.** Their subjects are hashing, naming, identifier width and timing, and no SPI change reaches any of them.

---

## What this means for placement

**Eight assumptions go into composed form, not nine.** #1 is closed and should be struck with its cause named; #5 goes in **with its reason corrected**, because carrying it as written would have the composed check verifying a mechanism that no longer exists.

> **The corollary earned its run: one of nine was already closed, and one of nine would have been checked against a stale reason. Neither would have been visible from the register alone.**

**The prediction for composition itself is unchanged and is now the sharper one:** the assumptions were recorded under `syncOrchestrator`, and **#7 (`suite-assignment`) is the only one about TIME rather than a return value.** Composition changes what runs between discovery and assignment. **If any assumption breaks on the move to `synchronisation.execute`, #7 is where to look first.**
