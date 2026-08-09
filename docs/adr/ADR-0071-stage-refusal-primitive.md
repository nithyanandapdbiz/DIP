# ADR-0071 — A stage refusal primitive: three outcomes, not two

**Status:** Accepted
**Date:** 2026-08-04 · **Accepted:** 2026-08-04
**Governed by:** [01 — Platform Constitution](../architecture/01-platform-constitution.md); [12 — Capability Orchestration](../architecture/12-capability-orchestration.md)
**Relates to:** ADR-0039 / ADR-0040 (unchanged — they govern capability domains and platform contracts; this changes the stage-result algebra beneath both) · closes `TECHNICAL_DEBT.md` **D-019**

---

## 0. Context

The twelve-stage lifecycle (doc 12, R-12.1/R-12.2) requires every capability to traverse a governance triad — `architecture-review`, `policy-review`, `guardrail-review` — at stages 4–6, and forbids bypassing any stage. The triad exists for one reason: **so that review is not performed by the reviewed.** Each stage returns a sealed `StageResult`, and `certify()` renders certification gates from those results; `SEAL` is a module-private symbol, so a result cannot be forged outside the runner.

That machinery has been in place and traversed since the framework was written, across all five implemented capabilities. What had never been asked is what a stage is able to *say*. This ADR is the answer to that question, raised while designing failure conditions for the Functional Testing capability and found to hold platform-wide.

## 1. Problem

The governance triad exists so that review is not performed by the reviewed. **All three of its stages were implemented, and none of them could decline.**

```ts
// capability-framework/src/stages.ts — before
export interface StageEmitter<S extends StageName> {
  ok<T>(value: T, agentsInvoked?): StageResult<S, T>;
  notApplicable<T>(value: T, reason: string, agentsInvoked?): StageResult<S, T>;
}
```

```
// capability-framework/src/certification.ts — the whole decision, before
if (!result)            → certified: false   "stage did not run"
if (!result.applicable) → certified: false   "not applicable: <reason>"
otherwise               → certified: true    "stage completed with N agent(s)"
```

`result.value` was typed `unknown` and **never read**. A stage that computed `approved: false` and placed it in its value certified exactly like one that computed `approved: true`.

**Refusal was expressible only as absence.** The single route to `certified: false` from a stage that had run was `notApplicable`, which asserts *there was nothing to review*. **A capability wanting to refuse had to claim it had done no work.**

**Scope: all five implemented capabilities.** `certify()` and `StageEmitter` are framework. The framework fact establishes the consequence independently of what any capability's triad computes, because the value is never read: **every certification this platform has produced was reviewed by three stages that could not refuse.**

**The workaround was already in the tree, not hypothetical.** Four existing conformance tests assert `notApplicable` results whose reasons read `coverage certification refused`, `authoring quality review refused`, `design synchronisation PARTIAL|FAILED`, and `final certification BLOCKED|CONDITIONAL`. Capabilities were already refusing; they had only one channel to do it through, and it said the opposite.

`CertificationOutcome.firstRefusal` has been **named for the intended design rather than the implemented one since it was written** — the only reachable non-certified values were *did not run* and *not applicable*, neither of which is a refusal.

## 2. Decision

**A stage has three outcomes, carried as a discriminated union.**

```ts
export type StageOutcome = 'ok' | 'not-applicable' | 'refused';

export interface StageResult<S extends StageName, T> {
  readonly [SEAL]: true;
  readonly stage: S;
  readonly value: T;
  readonly outcome: StageOutcome;
  readonly reason: string | null;   // required unless 'ok'; never empty
  readonly agentsInvoked: readonly string[];
}

export interface StageEmitter<S extends StageName> {
  ok<T>(value, agentsInvoked?): StageResult<S, T>;
  notApplicable<T>(value, reason, agentsInvoked?): StageResult<S, T>;
  refuse<T>(value, reason, agentsInvoked?): StageResult<S, T>;   // did the work; the answer is no
}
```

`certify()` gains one branch, reporting a refusal **distinctly** from an absence:

```
outcome === 'refused'        → certified: false, reason: `refused: <reason>`
outcome === 'not-applicable' → certified: false, reason: `not applicable: <reason>`
```

The audit trail distinguishes all three (`stage.completed` · `stage.not-applicable` · `stage.refused`); folding a refusal into `stage.not-applicable` would be the audit repeating the conflation this ADR removes. An empty refusal reason throws, exactly as an empty not-applicable reason already did — *a refusal without a reason has failed, not refused*, which is the framework's own sentence at `certification.ts:52`, until now describing something it could not produce.

### 2.1 Why a union and not a second boolean

`refused: boolean` beside `applicable: boolean` makes `{applicable: false, refused: true}` representable and meaningless. This platform has repeatedly shipped fields that could not discriminate — `publicationStatus` with unreachable branches, `eligible` hardcoded `true`, `certified` hardcoded `true` (D-012, D-013) — and the repair each time was the same: **make the invalid state unrepresentable, not merely unlikely.** `applicable` and `notApplicableReason` are therefore **replaced**, not supplemented; one source of truth (CHARTER §4).

### 2.2 What this ADR does NOT decide

- **Which mechanism governs when the stage verdict and a domain verdict disagree.** Recorded as **D-021** *before* this ADR was written, precisely so that this ADR cannot read as having addressed it. This change makes reconciliation possible; it does not perform it.
- **Whether any existing `notApplicable`-as-refusal call site should become `refuse`.** Four are identified in §1. Converting them changes evidence content and is a per-site judgement — sequenced, not bundled.
- **Who decides a triad refusal.** The stage callback maps blocking agent findings to `refuse`; which findings block is the Section F port of the 20 triad-stage agents.
- **Whether the other four capabilities' triads should refuse.** They gain the ability and use none of it.

## 3. Consequences

**Adoption changes no run's outcome.** Every existing stage emits `ok` or `notApplicable`; both map exactly as before. Measured after the change: the canonical run still returns `certified: true, firstRefusal: null`. **The primitive is inert until a stage uses it**, which is what made it safe to land ahead of the Section F agent port — and what makes the reverse order unsafe. Porting twenty triad reviewers into the previous framework would have produced reviewers whose refusals `certify()` discarded: **worse than the status quo, because it would look repaired.**

**Migration, measured rather than estimated.** 24 call sites, all in test files; no production source outside the framework itself. The design report predicted "one real reader" and was wrong by an order of magnitude — the type is consumed almost entirely through the emitter, but its *shape* is asserted widely.

**One class of consumer the compile-time mechanism could not reach.** Four governance scenarios are plain JS and read `StageResult` fields untyped; they were found by `verify-performance-conformance` turning red on `applicable=undefined`, not by the compiler. **Mechanism 1 stops at the TypeScript boundary, and the governance layer is on the other side of it.** Recorded here because it applies to every future framework field change, not just this one.

## 4. Enforcement (CHARTER §6)

| # | Mechanism | State |
|---|---|---|
| 1 | **Compile-time.** Removing `applicable`/`notApplicableReason` makes every unmigrated typed reader an error — no consumer can silently retain the old semantics. | In force. Found 24 of 28 sites. |
| 2 | **Conformance tests** (`capability-framework/test/framework.test.ts`): a refused stage is not certified; its verdict reason is distinguishable from not-applicable; `firstRefusal` names it; the audit records `stage.refused`; an empty refusal reason fails the run; and all three outcomes are mutually exclusive with a reason iff not `ok`. | In force. |
| 3 | **Governance gates.** The existing suite exercises the field through five capability scenarios; a dedicated gate asserting that no triad stage can reach `certified: true` without a distinguishable outcome belongs with the Section F port, when there is something to enforce against. | Sequenced. |

**R-13.7 clause 2 applied to this change, and it caught one.** The refusal-reason test first used `assert.throws`, which cannot fire because the runner catches `StageError` and converts it to `failedAt`/`failure` — a probe aimed at the wrong mechanism, reporting on a branch that never ran. It was corrected to assert the runner's failure record and the `stage.failed` audit event. Recorded rather than quietly fixed: it is the third occurrence of that shape in one session.

## 5. Alternatives rejected

- **Add `refused`/`refusalReason` beside `applicable`.** Smallest diff; makes contradictory states representable. Rejected in §2.1.
- **Let `certify()` inspect `result.value`.** Would require the framework to know each capability's value shape — the coupling the sealed opaque value exists to prevent.
- **Leave it, and have capabilities encode refusal in the not-applicable reason string.** This is the status quo, and §1's four call sites are what it looks like: a refusal is discoverable only by regex over prose.

## 6. Migration strategy

**One step, no compatibility window, no shim.** `applicable`/`notApplicableReason` are replaced rather than deprecated, because a deprecation window here would mean a period in which both the old boolean and the new outcome are readable and can disagree — reintroducing the contradictory state §2.1 exists to eliminate, for the duration of the window.

1. **Framework first** — `StageOutcome`, the `StageResult` fields, `refuse`, the `certify()` branch, the audit event map. Every typed consumer becomes a compile error at this point; nothing can be half-migrated and still build.
2. **Migrate consumers mechanically**, preserving semantics exactly — `applicable: true → outcome === 'ok'`, `applicable: false → outcome === 'not-applicable'`, `notApplicableReason → reason`. **No call site changes meaning in this step.** 24 typed sites, all tests.
3. **Migrate the untyped governance scenarios**, which the compiler cannot see (§3). Found by gate failure, not by build failure.
4. **Verify behaviour-neutrality by measurement**, not by inspection: the canonical run's certification before and after must be identical.

**Rollback** is `git revert` of a single commit; no data, artefact or persisted state carries the old shape, because `StageResult` exists only within a run.

**Explicitly deferred, each with its own decision:** converting the four existing `notApplicable`-as-refusal call sites (§1); reconciling the two certification mechanisms (D-021); the Section F triad-agent port; whether the other four capabilities should refuse.

## 7. Version impact

**No frozen platform contract changes.** `StageResult` and `StageEmitter` live in `@dbiz/capability-framework`, not in `@dbiz/contracts`; the fifteen contracts frozen by ADR-0040 are untouched, and `verify-contract-compatibility` covers `packages/contracts` only. No contract version is incremented.

**Cross-plane impact: none.** `StageResult` never crosses the plane boundary. The `ExecutionPackage` the Execution Plane receives is composed from domain results, not stage results, and its content hash is unaffected — verified by the closure package re-emitting with an unchanged deployment determination.

**Capability-internal impact:** all five implemented capabilities compile against the new shape and behave identically, because none emits `refuse`. A capability that later adopts `refuse` changes its own certification outcome by design; that is the point of the primitive and is a per-capability decision, not a consequence of this ADR.

**Persistence and wire formats: none affected.** No `StageResult` is serialised, stored, or transmitted.

## 8. Affected components

- `packages/capability-framework/src/stages.ts` — **Amended** (`StageOutcome`, `StageResult`, `StageEmitter.refuse`, audit event map).
- `packages/capability-framework/src/certification.ts` — **Amended** (the refusal branch).
- `packages/capability-framework/src/index.ts` — **Amended** (`StageOutcome` exported).
- `packages/capability-framework/test/framework.test.ts` — **Amended** (three new conformance tests; literals migrated).
- Test suites in `dev-change-engine`, `functional-testing-engine`, `performance-engine` — **Amended** (field migration only; no semantic change).
- `governance/capability/run-{capability,pentest,sectest,performance}-conformance.mjs` — **Amended** (field migration only).
