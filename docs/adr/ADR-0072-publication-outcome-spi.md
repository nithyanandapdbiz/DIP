# ADR-0072 — A publication can fail, and the SPI can say so

**Status:** Accepted
**Date:** 2026-08-04 · **Accepted:** 2026-08-04
**Governed by:** [14 — Tool Operating Model](../architecture/14-tool-operating-model.md); [01 — Platform Constitution](../architecture/01-platform-constitution.md)
**Relates to:** ADR-0022 / ADR-0040 (the adapter SPI model, unchanged in shape) · ADR-0071 (the same defect one layer up) · closes `TECHNICAL_DEBT.md` **D-023**

---

## 0. Context

Every tool interaction crosses an adapter SPI (C-14.1). The adapter is a store, not a decision maker: what to create, update or skip arrives already decided from the Intelligence Plane. That boundary has held since it was written.

What had never been asked is what an adapter is able to *report back*. This ADR is the answer, raised while designing Section C's publication semantics and found — like ADR-0071's — to be platform-wide rather than local to the capability that surfaced it.

## 1. Problem

```ts
linkTraceability(testId, requirementId) : { linked: true }
publishResult(testId, outcome)          : { published: true }
publishEvidenceReference(testId, ref)   : { published: true }
publishDefect(defect)                   : { defectId: string }
publishTests(groupingId, tests)         : readonly string[]
```

**Four of the five return a type-level literal.** An adapter could not report a failed publication: `published: false` did not type-check. The fifth could express partial success only by returning a **short list**, which cannot say *which* test was not accepted — so `synchronisation.ts` guessed with `externalRef: publishedTestIds[index] ?? testCase.id`, making a missing acknowledgement indistinguishable from a present one (D-013).

The five hardcoded `status: 'published'` literals in `synchronisation.ts` were therefore **the only value the SPI permitted a caller to derive**, not an oversight.

**No layer between the customer's tool and the executive report could represent a failed publication into that customer's system of record.** Masked today because reference adapters always succeed — which is also what makes the repair free exactly once. After a real ADO connector lands, the same repair must be made while the platform produces wrong data in a customer's system of record, and the wrongness is of the worst kind: a report asserting successful publication of results that were never accepted.

**This is the third instance of one pattern** — *a truthful negative with nowhere to go*. A stage could say *did work* or *no work* but not *the answer is no* (D-019). A domain could say `certified: true` and nothing else (D-012). The tool boundary can say *published* and nothing else. Each time the field that appeared to carry the negative was doing something else; each time the workaround was to misreport a different fact.

## 2. Decision

```ts
export type PublicationOutcome =
  | { readonly published: true; readonly externalRef: string }
  | { readonly published: false; readonly reason: string };
```

All five operations return it (`publishTests` returns **one per test, positionally aligned**). A discriminated union for ADR-0071's reason: success carries the external identity it created, failure carries the reason it failed, and neither is constructible without its half.

**It is an observation, not a judgement.** `published: false` records what the tool did. Whether the run should refuse because of it is the calling domain's decision, and doc 14 keeps that decision in the Intelligence Plane rather than in an adapter.

## 3. Consequences

**Behaviour-neutral, verified by measurement.** Reference adapters always succeed, so every failure branch introduced below is unreachable today: **1427 tests pass / 0 fail, 69 gates 62 PASS / 7 FAIL — no gate moved.** The SPI gains the ability to express failure; nothing yet exercises it.

**Migration, measured rather than estimated:** 5 SPI signatures, 7 reference/in-memory adapter implementations across three capabilities, 5 test-fixture adapter sets, and **9 consumer sites**. The Section C design report predicted this would be "a second platform-wide change" and did not carry that into a consumer-surface expectation — the second estimate this session corrected by the compiler rather than by review (D-022).

## 4. EVERY FAILURE PATH IS UNDECIDED, AND MARKED AS SUCH

The deferral is the point of this section. **A fallback that reads as a considered choice is how this defect class propagates** — that is precisely how `status: 'published'` came to look deliberate. Each site below carries an inline `UNDECIDED (ADR-0072)` note naming the capability that owns the decision, so a later reader meets the deferral before the code.

**Failure semantics are NOT decided here for capabilities this programme does not own.** A wrong negative-path decision stays invisible until something downstream disagrees, and for a capability whose work is elsewhere that disagreement may be far off.

### Work list, by owning capability

| Capability | Site | What it does today | The decision owed |
|---|---|---|---|
| **Functional Testing** | `domains/synchronisation.ts` — test-case publication | falls back to `testCase.id` when an outcome is not `published`, preserving the old `??` | **Section C**: should a refused test case be `status: 'failed'`, and should it make the domain refuse? |
| **Functional Testing** | `domains/synchronisation.ts` — defect publication | falls back to the canonical `defect.defectId` | **Section C**, with the above |
| **Functional Testing** | `agents/automation-execution-healing.ts` — traceability links | counts `published` where it counted `linked` | Section F, with the agent port |
| **Functional Testing** | `agents/automation-execution-healing.ts` — defect ids | drops unpublished defects from the id list | Section F |
| **Dev-Change** | `agents/sync-and-reporting.ts` — published-id set | builds the set from `published` outcomes only | **theirs** |
| **Dev-Change** | `agents/sync-and-reporting.ts` — defect publication | **carries a live finding**: the agent's declared `failureHandling` says *"a defect that cannot be published yields `published:false` with a reason"*, while the code returns `published: true` unconditionally. The SPI could not report failure until now, so the declaration was **unimplementable when written** — D-007's axis. Wiring it up is a behaviour change and therefore theirs. | **theirs** |
| **Inverse-Flow** | `agents/execution-and-outcome.ts` — defect publication | `externalId` from the outcome; `published` unchanged | **theirs** |
| **Inverse-Flow** | `agents/execution-and-outcome.ts` — asset publication | reads `published` from the outcome instead of inferring it from array length — same answer today | **theirs** |
| **Inverse-Flow** | `agents/execution-and-outcome.ts` — traceability links | `test.published` where it read `test.linked` | **theirs** |

**One fixture improved rather than preserved, and it is the exception to behaviour-neutrality worth naming.** `partialTestManagementConnector` modelled a partial batch accept by returning a **short list**; it now returns an explicit `{ published: false, reason: 'the tool rejected the final case in the batch' }` for the refused case. The old shape could only be detected by comparing lengths, which is the guessing this ADR removes. The run's outcome is unchanged.

## 5. Migration strategy

One step, no compatibility window: a period in which both `{ published: true }` and `PublicationOutcome` were valid would let two representations of the same fact disagree, which is the state this ADR removes.

1. **Contract first** — `PublicationOutcome` and the five signatures. Every typed consumer becomes a compile error; nothing can be half-migrated and still build.
2. **Reference adapters** — all return `{ published: true, externalRef }`; the `externalRef` is the identity each was already producing.
3. **Consumers** — behaviour-preserving, each fallback marked `UNDECIDED` with its owner (§4).
4. **Verify neutrality by measurement**, not inspection: full suite and all gates before and after.

**Rollback** is a single revert; no persisted artefact carries the old shape, because a `PublicationOutcome` exists only within a run.

**A migration hazard recorded, because it recurred.** A regex for `{ linked: true }` rewrote `linkWorkItemTraceability` and `linkRequirement` — different SPIs that legitimately return that shape. Both files were reverted and redone with exact, method-scoped patterns. Same lesson as the closure-package guard's false positive: **when a pattern over-matches, make it more precise, not more permissive.**

## 6. Version impact

**No frozen platform contract changes.** The adapter SPIs live in `@dbiz/capability-framework`; the fifteen contracts frozen by ADR-0040 are in `@dbiz/contracts` and are untouched. No contract version is incremented.

**Cross-plane impact: none.** A `PublicationOutcome` never crosses the plane boundary — it is what an adapter returns to its caller within one plane. The `ExecutionPackage` is unaffected.

**Capability impact:** all five implemented capabilities compile and behave identically. A capability that later acts on `published: false` changes its own behaviour by design; that is the point of the primitive and is a per-capability decision (§4).

**Persistence and wire formats: none affected.**

## 7. Alternatives rejected

- **Add a separate `publishFailed` callback, or an error channel via exceptions.** A throw is how an adapter reports that it *could not be reached*; a refused publication is a normal outcome of a reachable tool, and conflating the two would put transport failure and business refusal on one channel — the exact conflation ADR-0071 removed one layer up.
- **`{ published: boolean; externalRef?: string; reason?: string }`.** Smaller diff, and it makes `{ published: false, externalRef: 'x' }` and `{ published: true }` with no identity both representable and meaningless. Rejected for the reason ADR-0071 gives: make the invalid state unrepresentable, not merely unlikely.
- **Keep `publishTests: readonly string[]` and infer partial acceptance from length.** This is the status quo, and `externalRef: publishedTestIds[index] ?? testCase.id` is what it looks like — a caller guessing which test was refused, silently substituting a canonical id when it guesses wrong.
- **Decide each capability's failure semantics here, while the surface is already open.** Cheaper in one pass and wrong: a negative-path decision made by someone who does not own the capability stays invisible until something downstream disagrees, and for Dev-Change and Inverse-Flow that disagreement may be far off. §4 defers them explicitly instead.
- **Defer the whole change until a real ADO connector exists.** Rejected on cost asymmetry: today the change is behaviour-neutral because every adapter succeeds; after a real connector it must be made while the platform is producing wrong data in a customer's system of record.

## 8. Enforcement (CHARTER §6)

| # | Mechanism | State |
|---|---|---|
| 1 | **Compile-time.** Replacing the literal return types makes every unmigrated typed consumer an error. Found 9 consumer sites and 12 adapter implementations. | In force |
| 2 | **The existing suite**, which exercises publication through five capability conformance suites and the canonical scenarios — 1427 tests, unchanged, proving neutrality. | In force |
| 3 | **A negative-path conformance test** asserting that a refused publication is visible to its caller. **NOT WRITTEN HERE** — under R-13.7 a property must be shown to fail, and there is no production code path that acts on `published: false` yet, so the assertion would have nothing to observe. It lands with Section C's first consumer of a refusal. | Sequenced |

**Mechanism 3's absence is stated rather than papered over.** Writing a test now that constructs a failing adapter and asserts the *adapter* returns what it was told to return would be a tautology — C-3's defect (D-015), in a new file.

## 9. Affected components

- `packages/capability-framework/src/adapters.ts` — **Amended** (`PublicationOutcome`, five signatures).
- `packages/capability-framework/src/index.ts` — **Amended** (export).
- `packages/functional-testing-engine/src/{adapters,canonical-reference-input}.ts`, `domains/synchronisation.ts`, `agents/automation-execution-healing.ts` — **Amended**.
- `packages/dev-change-engine/src/adapters.ts`, `agents/sync-and-reporting.ts` — **Amended**.
- `packages/discovery-flow-engine/src/adapters.ts`, `agents/execution-and-outcome.ts` — **Amended**.
- Five functional-testing conformance test fixtures — **Amended** (adapter stubs only).
