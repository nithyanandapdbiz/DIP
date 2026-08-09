# The board aggregator — what the PORT must satisfy

**A SPECIFICATION, NOT A TEST SUITE.** 2026-08-05. Ruled after Section G's shape report measured that ADR-0076 §4.1.2's three repairs were landed into `src/agents/review-board.ts`, which Section G deletes, and that the four tests proving them **cannot be preserved as executable tests** because the unit they drive is inside the deletion set.

**Authority:** ADR-0076 §4.1.2 items 4 and 5 (the repairs, binding) · §6 A1 (the sequencing that produced this artefact) · [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) D-069, D-070, D-070a.

---

## 0. Why this document exists rather than a test file

The four repair tests reach their subject through `catalogue()` → `buildCatalogue()` → `reviewBoardAgents`, and `governance.final-certification` — **the unit under test** — is defined at `src/agents/review-board.ts:492`. All three are in Section G's deletion set. **Moving the tests to another file relocates the import, not the dependency.**

So the repairs are preserved in the only form that survives the deletion of their subject: **as the specification the ported aggregator must satisfy.** Each finding below carries three things, and the third is the one that matters — a repair recorded without the assertion that failed on its unrepaired form is a claim, not a control (D-008).

> **THIS DOCUMENT IS NOT A CONTROL.** It is prose, and prose does not fail. It becomes a control again only when the port lands and re-expresses §§1–3 as executable assertions against the canonical aggregator. Until then the platform has **three repairs it can describe and cannot verify**, and that is the honest state — recorded here rather than absorbed into a green suite. Section G's suite drop is where it becomes visible.

---

## 1 · G-1 — an empty collection is UNPROVEN, never satisfied

### The defect
Four of nine mandatory gates were satisfied by absence. `Array.prototype.every` returns `true` on an empty array, in an array literal where three sibling gates *are* explicitly zero-guarded. *"Certified automation architecture"* was satisfied by having generated no automation. **And the gate that rescued the wholly empty case — *"every review agent approves"* — was itself vacuous**, because `input.reviews.every(r => r.approved)` is `true` on an empty reviewer list. On the gates alone, absence scored **4 of 9**; with the board absent, **5 of 9**.

### The repair
`satisfied: boolean` became `MandatoryGateState = 'satisfied' | 'unproven' | 'failed'`, and classification over a collection routes through one helper:

```ts
const over = <T>(items: readonly T[], holds: (item: T) => boolean): MandatoryGateState =>
  (items.length === 0 ? 'unproven' : items.every(holds) ? 'satisfied' : 'failed');
```

**The guard is NOT `.length > 0 &&`.** That turns an unmeasured property into a FAILED one — the same collapse running the other way, and it blocks every legitimately empty run.

**Emptiness is not uniformly `unproven`, and the exceptions are part of the specification, not deviations from it:**

| Gate | Empty means | Why |
|---|---|---|
| `no unresolved blocking issues` | **satisfied** | the absence of blocking defects IS the property |
| `evidence-backed defect classification` | **satisfied** | agrees with the row above deliberately — both are gates ABOUT DEFECTS, and a run must not be simultaneously clean and unproven on the same evidence |
| `executive reports generated` | **failed** | the report is a required output of the run, so its absence is a genuine failure |
| `verified synchronisation…` | **unproven** when `sync === null` | a run that synchronised nothing has not FAILED verification; it has not performed it |
| `every review agent approves` | **unproven** on an empty reviewer list | a board that never convened must not report that every reviewer approved |

**A reviewer that could not look SHALL NOT be collapsed into one that said no.** `over(reviews, r => r.approved)` was the first form of the reviewer gate and it scored an UNREVIEWABLE reviewer as a failed approval — the standing rule broken inside the repair written to honour it. The ported form reads `ReviewVerdict.unreviewable`, which already carried the distinction:

```ts
state: input.reviews.length === 0 ? 'unproven'
  : input.reviews.some((r) => !r.approved && r.unreviewable === null) ? 'failed'
  : input.reviews.some((r) => r.unreviewable !== null) ? 'unproven'
  : 'satisfied',
```

### The assertions that failed on the unrepaired form
Preserved verbatim in intent; the subject changes from `catalogue().invoke('governance.final-certification', …)` to whatever the port composes at `reporting`.

**1.1 — an empty collection is UNPROVEN, never satisfied.** Drive the aggregator with an empty snapshot and no reviews.
```
byName('certified automation architecture').state === 'unproven'
byName('complete requirements coverage').state    === 'unproven'
byName('stable execution').state                  === 'unproven'
byName('verified synchronisation').state          === 'unproven'
byName('every review agent approves').state       === 'unproven'   // and !== 'satisfied'
decision !== 'CERTIFIED'
gates.filter(state === 'satisfied').length === gates.filter(
  gate === 'no unresolved blocking issues' || gate === 'evidence-backed defect classification'
).length                                              // "a gate was satisfied by absence"
```
**On the unrepaired form this passes as CERTIFIED.**

**1.2 — but absence that IS the success condition stays satisfied.** Same empty snapshot:
```
byName('no unresolved blocking issues').state         === 'satisfied'
byName('evidence-backed defect classification').state === 'satisfied'
```
**This one caught a defect inside the repair itself**: classifying zero defects as `unproven` made `CONDITIONAL` permanent and `CERTIFIED` **unreachable for every clean run**. A control too strict to pass is as useless as one that cannot fail, and only the positive case tells them apart (R-13.4). **The port SHALL carry both directions or it will re-introduce whichever one it drops.**

---

## 2 · G-2 — CONDITIONAL is reached without any lexical collision

### The defect
The `CONDITIONAL`/`BLOCKED` decision was made by **substring collision between two undeclared namespaces** — gate prose against terse reviewer scope labels, related by `includes` in both directions. Three of nine collided; **six of nine could never reach `CONDITIONAL` for purely lexical reasons.** Renaming a gate string — a documentation act — silently moved a release decision.

### The repair
The gates can now *say* `unproven`, so the decision reads the state instead of inferring it from spelling:
```ts
const decision = failed.length > 0 || rejecting.length > 0 ? 'BLOCKED'
  : unproven.length > 0 || unreviewable.length > 0 ? 'CONDITIONAL'
  : 'CERTIFIED';
```

### The assertion that failed on the unrepaired form — **and the first version of it did not**
Recorded because it is the defect this ADR is about, committed inside the test written to prove the repair. **The first version drove the wholly empty snapshot, where the substring heuristic and the state logic both return `BLOCKED`** — it asserted a property that held either way, passed against the unrepaired form, and proved nothing.

The discriminating scenario, which the port SHALL reproduce:

- The exact case `CONDITIONAL` exists for — **nothing failed, something unproven**.
- A reviewer scope (`zzz-unrelated`) chosen so it collides with **no** gate name.
- A `report` and one `section` present, **so *"executive reports generated"* is SATISFIED rather than failed** — a single failed gate forces `BLOCKED` under both logics and hides the divergence again.
- One `ReviewVerdict` with `approved: false` and `unreviewable: 'no evidence reached this scope'`.

```
gates.filter(state === 'failed').length === 0   // else BLOCKED under both logics — divergence hidden
gates.some(state === 'unproven')
for every gate: !gate.gate.includes('zzz-unrelated')   // the probe scope collides with no gate name
decision === 'CONDITIONAL'                              // BLOCKED here is the unrepaired behaviour
```

**The three precondition assertions are part of the specification, not scaffolding.** They exist so that a future change which removes the divergence fails *there* rather than silently making the check vacuous again — which is exactly what happened once already.

---

## 3 · G-3 — the gate-to-reviewer relation is DECLARED, not spelled

### The defect
`reviewer()` took a `scope` parameter and opened `void scope;`. Every reviewer therefore carried **two** scope strings: the descriptive one passed to the factory and discarded, and a terse one supplied separately inside each review function. The surviving one was the terse label G-2's heuristic matched on, and **the discarded one was the descriptive string — the very thing that would have made the relation legible.** The dead parameter was a record of someone having had the right idea and it not being wired.

### The repair
Two halves, and the port owes both:
1. **`MandatoryGate.evidenceFrom: string | null`** — every gate names the reviewer scope whose evidence it depends on, or states `null` where it depends on no single reviewer. `null` is *stated*, not left to a lexical accident.
2. **The descriptive string is carried**, reaching the agent's `purpose` line: `` purpose: `${purpose} Scope: ${scope}.` ``.

### The assertions that failed on the unrepaired form
```
for every gate:  'evidenceFrom' in gate                       // "declares no evidence relation"
for every gate:  evidenceFrom === null || scopes.has(evidenceFrom)
                 // scopes derived FROM THE REVIEWERS THEMSELVES — a hand-written list would be
                 // a second namespace, which is the defect G-2 is
reviewer 'governance.review.requirements'.purpose matches /Scope: /
```

**`scopes` SHALL be derived from the reviewers, never enumerated.** An enumerated list re-creates the second namespace this finding exists to remove.

---

## 4 · What the port inherits, and what it does not

**These three repairs are landed and proven against the legacy aggregator.** They were verified by reverting each repair and observing the corresponding assertion fail — the evidence exists, it was produced, and Section G deletes the artefact that carries it.

**The port SHALL NOT treat this document as a completed control.** Per ADR-0076 §6's stopping rule — suite-green, not build-green — the port is not complete until §§1–3 are executable against the canonical aggregator. Three repairs described in prose are exactly the *"declared but not executed"* shape [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) §4 names as its standing rule, and this document is the honest record of the platform being in that state deliberately for the duration of the port.

**What the port does NOT inherit from here** is the projection problem. D-069 measured it and D-070 scopes it: `ReviewSnapshot`'s fourteen agent-path model types and `CanonicalCapabilityResult`'s fourteen domain result types have **no projection in either direction**, and D-070a makes naming the missing architectural role (D-061a) a **precondition** of the port. **This specification says what the aggregator must do once it has a snapshot. It says nothing about where the snapshot comes from, and SHALL NOT be read as reducing that question.**
