# Rulings 2 and 3 — MEASURED. Both resolve, and not as either option offered.

**2026-08-05, from `883c220`. No edits.**

## The measurement that settles both

**`severity` and `risk` are used in ONE place across all nine agents — `design-sync.ts:63`:**

```ts
export function syncHashOf(t: TestCase): string {
  return sha(JSON.stringify([
    t.title, t.objective, t.businessGoal, t.preconditions, t.postConditions,
    t.steps.map(...),
    t.gwt, t.testData, t.priority, t.severity, t.risk, t.executionType,
    [...t.tags].sort(), t.requirementIds, t.acceptanceCriteriaCovered,
  ]));
}
```

> **They are HASH INPUTS ONLY. Never read for a decision, never published, never mapped to a spec field.** `canonicalSpecOf` carries neither. **The same is true of `executionType`**, which ruling 4 already dispositions.

**So the question the rulings asked — *are these the same concept under another name* — is not the question the code asks.** Neither field is consumed as a value. **What is at stake is what `syncHashOf` hashes**, and its whole purpose is *equal hash ⇒ nothing to write.*

## Ruling 2 · `risk` — **NOT the same concept. Do not map it.**

```
model.ts:454        readonly risk: RiskAssessment['level']
canonical:167       risk: negative ? 'high' : 'low'
```

**`TestClassification.risk` is derived from scenario POLARITY** — whether the scenario is a negative case. **`model.ts`'s `risk` is a requirement-level RiskAssessment.** One is a property of the test's shape; the other is a judgement about the requirement it covers. **Mapping them would be `'verify: ' + objective`'s shape at a new altitude** — a value published under a name that asserts a provenance it does not have.

**The measurement was right to flag it as nested and the nesting is not the point: the concepts differ.**

## Ruling 3 · `severity` vs `criticality` — **NOT the same concept. Same reason.**

```
model.ts:453        readonly severity: 'minor' | 'moderate' | 'major' | 'critical'
canonical:167       criticality: negative ? 'high' : 'medium'
```

**`criticality` is polarity-derived and two-valued; `severity` is a four-level defect-impact scale.** Not a rename, not a widening — **a different axis**, and the ruling's own instruction not to assume from the names is what caught it.

## What this means — the disposition neither option offered

**`risk`, `severity` and `executionType` do not need carrying, mapping, or recording as reductions in the way `businessGoal` was.** They need **removing from `syncHashOf`**, because the canonical case does not carry them and the hash must be computable from what exists.

**That is not a fabrication and not a capability reduction. It is a BEHAVIOUR change, and it must be stated as one:**

> **`syncHashOf` over fewer fields produces different hashes. On the first run after the change, every existing case's stored hash differs from its recomputed one, so `sync.design-idempotency` decides UPDATE for every case exactly once.**

**One rewrite of every case, then stable.** Not silent, not destructive, and **exactly the failure mode assumption #2 records** — *"decides `update` on every run, forever… the failure is invisible: every run succeeds and the counts look busy."* **The difference is that this fires once and is predicted; #2's fires forever and is not.** It must be recorded before the re-typing, or the first canonical run looks like assumption #2 coming true.

## Re-typing scope, all four resolved

| Member | Resolution |
|---|---|
| `preconditions` `postConditions` | **Widen `CanonicalTestCase` to plural** (ruling 1) — nothing derives them, so widening fabricates nothing |
| `title` `businessGoal` | **Recorded reductions** — closed, named in P-69.2 |
| `automationReady` `executionType` | **Recorded reductions** (ruling 4) — named in P-69.2 |
| **`risk` `severity`** | **Different concepts from `classification.risk`/`criticality`. Not mapped, not carried.** Removed from `syncHashOf` with the one-time rehash recorded |

**Nine members carry directly. Two widen. Six leave the hash.** The nine agents re-type against `CanonicalTestCase` **with `syncHashOf` rebuilt over what the canonical case actually holds** — which is the honest form, and the one that fabricates nothing.

**Not begun. Awaiting the ruling on the one-time rehash**, which is a behaviour change and not mine to take.
