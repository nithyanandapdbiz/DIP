# F3 item 4 — the fifth dependency: MEASURED, NOT BUILT

**2026-08-05. D-047's remedy applied — measure before assuming the work exists. It exists, and it cannot be done here.**

---

## What was measured

**1 · `TestDesignSyncAdapter` IS genuinely absent from the dependency set.** Confirmed, four members:

```ts
export interface CanonicalCapabilityDependencies {
  readonly decisionEngine: DecisionEngine;
  readonly runtimeConnector: ApplicationStrategyAdapter;
  readonly testManagementConnector: TestManagementAdapter;
  readonly executionConnector: ExecutionAdapter;
}
```

**Unlike items 2 and 3, the gap is real.** This one is not the architecture working and not present under another name.

**2 · AND THE CANONICAL SYNCHRONISATION DOMAIN DOES NOT REFERENCE IT. ZERO OCCURRENCES.**

```
grep -c "TestDesignSyncAdapter"  src/domains/synchronisation.ts   ->  0
canonical-domain-steps.ts:63
   d12: createSynchronisationDomain(decisionEngine, testManagementConnector, executionConnector)
```

**Three parameters, and nothing inside the domain uses the design-sync SPI.**

**3 · `verify-contract-compatibility` BEFORE: PASS.** Baseline recorded; the gate was not reached, because nothing was changed.

## The finding — **threading it now would add a contract member that nothing reads**

> **The fifth dependency's consumer is the nine `sync.design-*` agents, and their placement is F3's NEXT step. The dependency and its consumer arrive together or not at all.**

**Adding `testDesignSyncConnector` to `CanonicalCapabilityDependencies` today produces a required member of a certified contract that no domain consumes** — **D-033's shape, added deliberately, into a contract rather than into a result.** Every construction site would supply an adapter, `createSynchronisationDomain` would accept a fourth parameter it does not use, and the conformance suite would prove that all of it compiles and none of it does anything.

**That is precisely what the register is full of, and this time it would be authored on purpose.**

## Why this is NOT items 2 and 3's outcome, and must not be recorded as one

**Items 2 and 3 closed because the work did not exist.** Item 4's work **does** exist and is correctly scoped. **What the measurement changes is not whether, but WHEN — and it makes item 4 part of placement rather than preparation for it.**

**"Thread the dependency first, place the agents second" is intuitive and wrong here.** It reads as reducing the placement step's size; it actually splits one coherent change into a defect plus a repair. **The dependency is not infrastructure the placement needs in advance — it is the placement's first line.**

## Disposition

**Item 4 does not close. It MOVES — into placement, as its first step.**

**F3's mechanical phase is therefore complete:**

| Item | Outcome |
|---|---|
| 2b — `title` field | **BUILT** and committed (`ede2b44`) |
| `testCases` type (D-031) | **already implemented** — closed by measurement |
| config dereference (D-037) | **the architecture working** — closed, entry amended |
| fifth dependency | **moves into placement as its first step** |

**One of four was a build.** The other three were resolved by reading, and **three of the four would have been wasted or harmful work if taken at face value from the plan** — which is D-047 measured on the very next four items after it was written.

## What placement now carries

1. **Thread `TestDesignSyncAdapter` into `CanonicalCapabilityDependencies`**, `createSynchronisationDomain`, and every `referenceDependencies` site — **with a consumer, in the same change.**
2. **Place the nine `sync.design-*` agents** behind `synchronisation`'s `execute`.
3. **`verify-canonical-agent-dormancy` is EXPECTED to go RED** — that is the signal, not a regression, and it is retired or narrowed at that point deliberately.
4. **D-045 closes** when `repository.reuse-decision` behaves differently on `reached: false`.
5. **`verify-contract-compatibility` before and after** — baseline is PASS, recorded above.
