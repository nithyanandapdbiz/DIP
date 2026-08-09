# Hash versioning — measurement, and rulings 4/5/6 recorded

**2026-08-05, from `e4be2b9`. No edits.**

## RULING 3's MEASUREMENT — **the hash is stored in the CUSTOMER'S TOOL**

```
adapters.ts:155   TestCaseSpec.syncHash        WRITTEN to the tool
adapters.ts:162   SyncedTestCase.syncHash      READ BACK from discovery
adapters.ts:273   readTestCase(...).syncHash   READ BACK from validation

design-sync-adapters.ts:112,126   stored on the record
design-sync-adapters.ts:87,203    returned on discovery and read-back
```

**It round-trips: the platform computes it, the tool stores it, the platform reads it back and compares.** So the ruling's first branch holds — **a version field would need somewhere to live in the customer's tool, and that is its own decision.**

## But it does not need a field — **the version rides in the hash string**

`syncHash` is a `string` in all three positions and its value is already opaque to the tool. **Prefixing it carries the version at zero cost:**

```
"5048db53"        <- today, unversioned
"v2:5048db53"     <- versioned; same field, same type, same round-trip
```

**No SPI change. No new tool field. No schema decision. No adapter change.** The comparison becomes: split on `:`, compare versions first, then digests.

> **This is the cheapest correct answer and it exists because the value was already an opaque string the tool never interprets.** Had `syncHash` been structured, or validated tool-side, the field decision would have been unavoidable.

## The behaviour, as ruled

| Case | Action |
|---|---|
| **version matches** | compare digests as today |
| **version differs** | **recompute and store. DO NOT update the test case.** |

**First canonical run rewrites hashes and touches no test case.** The mass write does not happen at all.

## RULING 6 — assumption #2's relationship, recorded explicitly

**Assumption #2:** *"a tool that normalises on write returns a different hash for the same input, and this agent decides `update` on every run, forever, silently converting an idempotent phase into an unconditional rewrite. The failure is invisible: every run succeeds and the counts look busy."*

**The one-time rehash was #2's failure mode firing ONCE and PREDICTED, where #2's fires FOREVER and UNPREDICTED.** That difference is real, and it is not the point.

> **Versioning removes even the one-time instance. The fix is not "accept a smaller version of the defect" — it is "do not reproduce it at all."**

**Accepting the one-time write would have been the register's own recorded defect, authored deliberately, on the grounds that it was bounded.** Bounded is not the same as correct, and *"we knew it would happen"* is a worse position than *"we did not"* when the write lands in a customer's system of record.

## RULING 2's GENERALISATION — the fourth boundary

**A hash computed under a different algorithm is not evidence of divergence. It is the ABSENCE OF COMPARABLE EVIDENCE**, and `sync.design-idempotency` collapsed the two into *"differs, therefore update."*

| Boundary | Collapsed pair |
|---|---|
| Stage (ADR-0071) | `not-applicable` vs `refused` |
| Publication (ADR-0072/0073) | absent vs `published: false` |
| Read (ADR-0074) | unreachable vs empty |
| **Hash (this)** | **incomparable vs different** |

**Fourth instance of one rule, at a fourth altitude: a failure to compare and a comparison that failed are not one signal.** Each was found the same way — by asking what a value cannot say — and this one was found in a hash, which is the least type-shaped place any of them has appeared.

## RULINGS 4 and 5 — recorded as measured

**`risk`** — `RiskAssessment['level']`, a requirement-level judgement · versus `negative ? 'high' : 'low'`, scenario polarity. **Different concepts.**
**`severity`** — a four-level defect-impact scale · versus `criticality`, two-valued and polarity-derived. **A different axis, not a rename.**

**"Do not assume from the names" caught both**, and the measurement changed the question from *"same concept?"* to *"what does `syncHashOf` hash?"* — **which neither ruling asked, and which is the question that resolved them.**

**Re-typing scope, accepted:** nine members carry · two widen to plural · six leave the hash. **`title`, `businessGoal`, `automationReady` and `executionType` are recorded reductions named in P-69.2's closure**, alongside `sharedSteps`.

---

**Not begun. The versioning is trivial as measured** — a string prefix on a value the tool never interprets — **and the re-typing scope is fully resolved.** Next action is the re-composition itself, with the hash versioned and no mass write.
