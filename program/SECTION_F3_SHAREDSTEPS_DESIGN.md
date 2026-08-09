# F3 item 1 — `sharedSteps`: design report

**DESIGN ONLY. Nothing built. F3 rules this and does not build it.** · 2026-08-05

**`sharedSteps` is an ABSENT CAPABILITY, not an absent field.** There is no field to populate and no producer to build a field for, and `PROJECT_STATE.md` §9.3d-i records it as immune to all three remedies the other seven inputs admit — threading a dependency does not create it, widening an input record gives it nowhere to come from, dereferencing a configuration does not produce it. **No producer is fabricated below.**

---

## The third question is answered FIRST, because it was expected to close the other two

**The feared chain:** the evidence is the authored suite, which postdates most of the sequence; if the only stage that could host a recommender sits *after* synchronisation, the recommendation cannot reach its consumer and the design is blocked by the canonical ordering.

**MEASURED — `canonical-capability.ts:43`, the frozen sequence:**

```
 1 tenant-resolution              8 automation-architecture
 2 application-strategy-resolution 9 execution
 3 story-intelligence            10 healing
 4 test-design-intelligence      11 defect-management
 5 repository-intelligence       12 synchronisation      <- CONSUMES sharedSteps
 6 test-management-intelligence  13 executive-reporting
      ^ THE AUTHORED SUITE EXISTS HERE
 7 automation-intelligence
```

> **THE CHAIN RESOLVES. The evidence exists at position 6 and the consumer is at position 12 — FIVE domains of slack between them.**

**The feared finding does not hold, and that is the report's most useful result.** *"It cannot reach synchronisation under the current stage ordering"* was a real possibility and would have been a finding about the canonical sequence rather than about this design. **It is false, measured rather than assumed**, and the design question is therefore an ordinary one: which of six available positions, not whether any exists.

## What recommends them — **`test-management-intelligence`, and not a new domain**

**The recommender is a NEW PRODUCER — the only one of F3's nine items that adds one.** The question is whether it needs a new *domain*.

**It does not, and the argument is not convenience.** `test-management-intelligence` is the domain that **organises the authored suite**, and shared-step extraction *is* that subject: deciding which repeated sequences deserve to become reusable assets is an act of organising a suite, not a separate concern that happens to need one. **A domain whose declared purpose is test management, producing a shared-step recommendation from the suite it just organised, is the recommender being placed where its subject already lives.**

**Rejected: a new domain between 6 and 11.** R-12.18 permits one orchestration lifecycle and `CANONICAL_DOMAIN_SEQUENCE` is frozen; a fourteenth domain is a constitutional change, and it would be one justified by a single field. **It also fails the cheaper test: a new domain would need its own certification criteria, its own contract and its own place in the sequence, to produce something the domain before it already has the evidence for.**

## On what evidence — **the authored suite, at the point it is organised**

The evidence is **structural repetition across authored test cases** — sequences of steps recurring in more than one case. That evidence exists **only after** authoring and organisation, which is exactly why the recommender cannot sit earlier and why positions 1–5 are unavailable.

**It is deterministic and needs no reasoning class.** Identical or near-identical step sequences are found by comparison, not by inference — and a shared-step recommender that used a similarity threshold would repeat `repository.reuse-decision`'s shape at a new altitude, where a differently-tuned threshold silently changes what the customer's tool receives.

## At which stage — **6, as part of test management's own output**

**Not a stage of its own.** F1 §2's composition rules stand: an agent has no stage of its own, and a domain is the unit the sequence addresses. The recommendation is a **member on `test-management-intelligence`'s result**, carried forward like every other domain output, and read by `synchronisation` at 12.

## What this does NOT resolve, and must not be read as resolving

**The recommender does not exist.** This report says where it belongs, on what evidence, and why no new domain is needed. **It does not design the extraction itself** — what counts as a repeated sequence, what minimum recurrence justifies extraction, and whether a recommendation is ever automatic rather than advisory are open, and each is a real decision.

**Nor does it make `sharedSteps` a small change.** It remains the only F3 item that adds a producer, and adding a producer to a certified domain means new certification criteria for that domain — which, per D-038, is a group of criteria nobody can currently evidence.

---

## Consequence for P-69.2's closure — **stated regardless of the answer above**

**Placement succeeds without `sharedSteps`.** Nothing in the nine agents' placement depends on it; `sync.design-shared-assets` receives an empty list and publishes nothing, which is honest and does not fail.

> **DESIGN-SYNC ON THE CANONICAL RUNTIME DOES NOT REUSE SHARED STEPS. That is a RECORDED CAPABILITY REDUCTION, named at closure alongside `businessGoal` — not discovered afterwards.**

**What the customer sees:** every published test case carries its steps inline. Sequences repeated across twenty cases are published twenty times. **Nothing is wrong in the tool; it is simply less organised than the agent path would have made it**, and no reader of the published suite can tell that a recommender was intended.

**The reduction is stated in these terms deliberately.** It is not *"shared steps are not yet supported"* — that implies a schedule. It is *"the canonical capability does not recommend shared steps"*, which is true today and remains true until a recommender is designed, built and certified.
