# Re-composition blocker — the blast radius, MEASURED

**2026-08-05, from `1e988c6`. No edits. Measured per the ruling, not estimated.**

## What the nine agents actually USE

Seventeen members dereferenced off a `TestCase`-typed value across the nine:

```
acceptanceCriteriaCovered · automationReady · businessGoal · executionType · gwt · id ·
objective · postConditions · preconditions · priority · requirementIds · risk · severity ·
steps · tags · testData · title
```

## Per member, against `CanonicalTestCase`

| Group | Members | |
|---|---|---|
| **CARRIED — 9** | `acceptanceCriteriaCovered` `gwt` `id` `objective` `priority` `requirementIds` `steps` `tags` `testData` | direct, same name |
| **CARRIED UNDER ANOTHER NAME — 2** | `preconditions` ← `precondition` · `postConditions` ← `postcondition` | **singular vs plural** |
| **RULED OUT — 2** | `title` · `businessGoal` | F3 item 5; D-032 |
| **NOT CARRIED, NEVER EXAMINED — 4** | **`automationReady` · `executionType` · `risk` · `severity`** | **the finding** |

> **THE GAP IS EIGHT, NOT TWO — AND FOUR OF THE EIGHT HAVE NEVER APPEARED IN ANY F3 ITEM, ANY D-036 ENTRY, OR ANY RULING.**

### The four nobody has looked at

`automationReady` · `executionType` · `risk` · `severity`.

**`risk` has a partial home**: `CanonicalTestCase.classification` is `TestClassification { smoke, regression, criticality, risk }` — so `risk` is **carried inside a nested member under a different shape**, and `criticality` may or may not be `severity` under a third name. **That is a mapping question nobody has asked, not a gap and not a carry.**

`automationReady` and `executionType` have **no canonical counterpart in any form.** `canonicalSpecOf` derives `automationStatus` from `t.automationReady` at the publication boundary — **so the boundary already depends on a field the canonical sequence does not produce**, which is why it maps rather than carries.

### The two under another name are D-031's own shape, one level down

`precondition` and `postcondition` are **singular**; the nine use **plural**. D-031's recorded reasoning was *"a singular mapping cannot express a case covering two acceptance criteria… a field that structurally cannot represent the plural case cannot discriminate."* **The same defect it fixed for `requirementIds` is still present twice in the same type**, unfixed and unrecorded, and re-typing the nine would land directly on it.

## What else consumes `model.ts`'s `TestCase` — twelve modules

```
agents/authoring.ts · agents/automation-execution-healing.ts · agents/design-sync.ts ·
agents/repository-and-authoring.ts · agents/review-board.ts · canonical-sync-boundary.ts ·
capability.ts · design-sync-adapters.ts · domains/test-management-intelligence.ts ·
emitters/executable-automation.ts · emitters/repository.ts · model.ts
```

**Most are the retiring closure** — but `canonical-sync-boundary.ts`, `domains/test-management-intelligence.ts` and both emitters are **not**. **The type does not partition cleanly along the retirement boundary**, so "re-type the nine" is not confined to the nine.

## The ruling may need revisiting — stated plainly

**The ruling assumed the gap was `title` and `businessGoal`.** It is eight members, of which **four were never examined**, one is a nested-shape mapping question, and two are an unfixed instance of the defect D-031 exists to record.

**Re-typing the nine against `CanonicalTestCase` still fabricates nothing** — that part of the ruling holds. **But it is not the small change the ruling was taken on**, and four of its inputs have no ruling at all.

**Recommended: rule the four before re-typing.** For each — is it capability content the canonical sequence should produce, is it carried under another name, or is it a recorded reduction like `businessGoal`? **That is item 5's question asked four more times**, and asking it after the re-composition has begun is how a fabricated field enters.
