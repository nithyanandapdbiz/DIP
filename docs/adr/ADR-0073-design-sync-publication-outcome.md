# ADR-0073 — The design-synchronisation SPI reports what the tool did

**Status:** Accepted
**Date:** 2026-08-04 · **Accepted:** 2026-08-04
**Governed by:** [14 — Tool Operating Model](../architecture/14-tool-operating-model.md)
**Relates to:** ADR-0072 (the same defect in the sibling SPIs) · ADR-0022 (the adapter SPI model, unchanged in shape) · closes `TECHNICAL_DEBT.md` **D-028**, fixes **D-029** instance (i)

---

## 0. Context

`TestDesignSyncAdapter` is the third publication SPI. It persists **certified design-time assets** — test cases, shared steps, links, tags, classification, attachments, suite assignment — into the customer's test tool. ADR-0072 widened `TestManagementAdapter` and `ExecutionAdapter` because those were the SPIs Section C's publication semantics ran through; this one was outside that change's scope and kept the defect.

It was found by applying the contagion corollary's second half deliberately, **before** porting the nine `designSyncAgents`: *look for inferences the agents made that only held while these operations could not fail.* One was found immediately, and four more followed.

## 1. Problem

```ts
linkWorkItem(…)        : { readonly linked: true }
applyClassification(…) : { readonly applied: true }
assignToSuite(…)       : { readonly assigned: true }
attachDesignArtefact(…): { readonly attachmentId: string }
```

**Not one can report that the customer's tool refused.** And an inference was already standing on it: `agents/design-sync.ts` counted links with `if (adapter.linkWorkItem(…).linked) links += 1`, so **`links` was the number of calls** — a count of attempts wearing the name of outcomes (D-029).

**Four `failureHandling` declarations were unimplementable when written**, the sharpest being the traceability agent's: *"the census reports what the tool accepted, **never what was attempted**."* It names the exact failure mode it exhibits, one line above the code that exhibits it. Not carelessness — a description of what the author intended and what the SPI made impossible (D-024's class).

## 2. Decision

The four acknowledgement writes return `PublicationOutcome` (ADR-0072's type, reused rather than re-declared). The four agent consumers read `published`, and `attachDesignArtefact`'s success identity is carried as `externalRef`. **All four declarations above are true from this change.**

**`createTestCase` and `updateTestCase` are NOT widened.** They return a `SyncedTestCase` payload, so expressing their refusal needs a payload-carrying union rather than this one — a different shape and a different decision, belonging with the port that consumes them. **Their failure remains inexpressible, and that is stated rather than left to be discovered.**

## 3. Alternatives rejected

- **Read-back validation instead of an outcome type.** This is the better answer and it is **sequenced to Section F**, not rejected — see §4.
- **A design-sync-specific outcome type.** A second union meaning the same thing, differing only in provenance; CHARTER §4.
- **Widen `createTestCase`/`updateTestCase` to `PublicationOutcome` too**, discarding the payload. The caller needs the `externalId` to proceed, so this would trade one inexpressible failure for a broken success path.
- **Port the nine agents first and widen afterwards.** The ADR-0071 sequencing argument: capability built on a channel that discards the signal is worse than no capability, because it looks complete.

## 4. Read-back validation is the target, and is sequenced — not deferred by omission

**This same file already does the stronger thing.** `design-sync.ts`'s validation phase calls `readTestCase` and checks what the tool actually holds — `linkedWorkItems`, `tags`, `suiteIds`, `attachmentIds` — rather than trusting the write's return value. Its own comment: *"read back, so validation observes the tool rather than trusting the write."* **That survives a lying adapter; a return code does not.**

Three reasons it is Section F's and not this ADR's:

1. **It cannot be proven here.** Its entire value is surviving an adapter that misreports, and every adapter in this tree tells the truth by construction. Correctness could only be asserted *by construction*, with no contradiction available — and unlike the first production refusal, **assertion cannot reach it either**, because the failure mode requires a real connector to exist.
2. **The two compose.** When read-back lands, this outcome type becomes a **corroborating** signal rather than being replaced: the tool's self-report and the tool's observed state are independent readings, and a disagreement between them is itself a finding. Widening now costs nothing later.
3. **It is declaration-versus-behaviour work** — the same shape as D-015's 109 unevidenced criteria, D-024's `failureHandling` audit and D-019's twenty triad agents. Section F is where that class lands and where it shares machinery.

## 5. Consequences

**Behaviour-neutral, verified by measurement: 1,432 tests pass / 0 fail, 69 gates 62 PASS / 7 FAIL.** Reference adapters accept everything, so no failure branch is reachable in this tree.

**Blast radius, measured:** 4 signatures, 1 reference adapter, 1 agent file — all inside `@dbiz/functional-testing-engine`. **No other capability implements this SPI**, which is why ADR-0072's per-capability deferral has no counterpart here.

**Consumers are WIRED, not marked UNDECIDED.** ADR-0072 marked its failure paths because they belonged to Dev-Change and Inverse-Flow. These belong to Functional Testing, and each agent's own `failureHandling` already declares what a refusal means — so wiring them implements a stated decision rather than taking one.

## 6. Migration strategy

One step, no compatibility window, for ADR-0072's reason: two readable representations of one fact can disagree for the window's duration.

1. Widen the four signatures — every consumer becomes a compile error.
2. Reference adapter returns `{ published: true, externalRef }`, the ref being the identity each already produced.
3. Wire the four agents to `published`.
4. Verify neutrality by measurement, not inspection.

**Rollback** is a single revert; no `PublicationOutcome` outlives a run.

## 7. Version impact

**No frozen platform contract changes** — `TestDesignSyncAdapter` is in `@dbiz/capability-framework`; ADR-0040's fifteen contracts are in `@dbiz/contracts` and are untouched. No contract version incremented. **Cross-plane impact: none** — the type never crosses the boundary. **Capability impact:** Functional Testing only. **Persistence and wire formats: none affected.**

## 8. Enforcement (CHARTER §6)

| # | Mechanism | State |
|---|---|---|
| 1 | **Compile-time.** Replacing the literal returns makes every consumer an error — found all six sites. | In force |
| 2 | **The existing suite** — the design-sync conformance suite exercises all four operations; 1,432 tests prove neutrality. | In force |
| 3 | **A negative-path test** asserting a refused link is counted as not created. **NOT WRITTEN** — no adapter in this tree refuses, so the assertion would test the fixture, which is C-3's tautology in a new file (D-015). It lands with the first refusing design-sync adapter, or with read-back validation in Section F. | Sequenced |

## 9. Affected components

- `packages/capability-framework/src/adapters.ts` — **Amended** (four signatures; §4's reasoning recorded at the site).
- `packages/functional-testing-engine/src/design-sync-adapters.ts` — **Amended** (reference implementation).
- `packages/functional-testing-engine/src/agents/design-sync.ts` — **Amended** (four consumers; the link tally now counts outcomes).
