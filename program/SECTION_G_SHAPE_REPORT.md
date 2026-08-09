# Section G — the shape, measured before anything is removed

**REPORT ONLY. NOTHING DELETED. NOTHING RE-POINTED.** 2026-08-05. Written at a clean boundary, before the first removal, because G is the irreversible one.

**Authority:** [ADR-0061](../docs/adr/ADR-0061-canonical-functional-capability-runtime-adoption.md) §6 step 6 and §8. **Preconditions ruled met:** D-070a (the board port is owed, not blocking) and D-072a (`StageName`'s move is its own ADR, not blocking).

---

## 1. THE DELETION SET, measured from `retirement-inventory.mjs`

```
SURVIVING closure : 34 module(s)   from canonical-capability.ts, canonical-runner-capability.ts, authoring-bridge.mjs
RETIRING  closure : 16 module(s)   from orchestrators.ts, capability.ts, catalogue.ts
ORPHANED          :  9 module(s)   reachable only through the retiring set
   of which export constructible units: 8
```

| Module | Lines | Exports lost |
|---|---:|---|
| `src/capability.ts` | 1257 | `createFunctionalTestingEngine` |
| `src/orchestrators.ts` | 1332 | `FunctionalTestingOrchestrator`, 13 `domainOrchestrators` |
| `src/catalogue.ts` | 46 | *(exports no constructible unit)* |
| `src/agents/authoring.ts` | 1418 | `authoringAgents` |
| `src/agents/design-sync.ts` | 901 | *(nine design-sync agents)* |
| `src/agents/automation-execution-healing.ts` | 874 | `automationAgents`, `executionAgents`, `healingAndDefectAgents`, `publishingAgents` |
| `src/agents/review-board.ts` | 790 | `reviewBoardAgents` — **the independent review board** |
| `src/agents/story-and-test.ts` | 531 | `storyAgents`, `testAgents` |
| `src/agents/repository-and-authoring.ts` | 403 | `repositoryAgents`, `planningAgents` |
| `src/agents/continuous-learning.ts` | 293 | `continuousLearningAgents` |

**≈ 7 845 lines, 144 agents, 13 orchestrators.** `buildCatalogue`, `ALL_AGENTS` and `domainOrchestrators` are **capability-local names** — Dev-Change and Discovery-Flow declare their own and are untouched. Verified, because the names alone suggest otherwise.

## 2. RE-POINTING OBLIGATIONS — **FOUR, measured. Not ~29.**

The inventory reports exactly four pieces of surviving code that still reach a retirement target:

| # | From | To |
|---|---|---|
| 1 | `authoring-bridge.mjs` | `capability.ts: createFunctionalTestingEngine` |
| 2 | `authoring-bridge.mjs` | `catalogue.ts: buildCatalogue` |
| 3 | `authoring-bridge.mjs` | `orchestrators.ts: FunctionalTestingOrchestrator` |
| 4 | **`src/registry/reasoning-publication.ts`** | **`capability.ts: EngineState`** |

**Three are one file.** `authoring-bridge.mjs` is ADR-0061 §6 step 6's named re-point and is **not deleted** — it survives, re-pointed at the canonical composition.

**The fourth is the one that is not a bridge, and it is a TYPE rather than a constructor.** `registry/reasoning-publication.ts` imports `EngineState` from `capability.ts` — the legacy engine's run-state shape. It is a **different kind of obligation from the other three**: those re-point a *call*, this re-points a *type*, and a type dependency does not announce itself as a runtime coupling. **`EngineState` has no canonical equivalent** — the canonical composition threads `OutcomeRecorder`/`CanonicalCapabilityResult` instead — so this is not a re-point but a **re-type**, and the Reasoning Result Registry (ADR-0067) is a platform-level consumer rather than an FTE-internal one.

> **The ~29 figure is not what any measurement produces.** Measured surfaces are: **4** re-pointing obligations, **7** governance files referencing FTE legacy, **7** test files, **99** FTE fault-proof entries of which **ZERO** anchor to the deletion set. Recorded so the planning figure is replaced rather than carried — the D-056/D-069 class.

## 3. THE GATE SURFACE — smaller than expected, and measured

Seven governance files reference FTE legacy symbols: `record-fault-proofs.js` (102 mentions), `run-capability-conformance.mjs` (8), `retirement-inventory.mjs`/`.json` (6/4), `run-functional-completeness.mjs` (3), `verify-automation-architecture.js` (1), `verify-agent-naming.js` (1).

**The fault-proof registry needs no re-pointing at all.** Of 99 FTE fault entries, **zero** name a file in the deletion set — all point at `canonical-capability.ts`, the fourteen domains, `runtime/*` and `production-qualification.ts`, every one of which survives. **Measured, because 102 mentions in one file reads like the largest obligation in the set and is none of it.**

**`verify-agent-naming.js` and `verify-canonical-agent-dormancy.js` lose their subject.** The naming gate passes over 144 agents; after G there are none. The dormancy gate asserts *the canonical runtime invokes no agent* — which becomes vacuously true, and is the D-015 class: a gate whose green means nothing once its subject is gone.

## 4. WHAT G COSTS THE SUITE — **280 of 419 FTE tests**

| File | Tests | Drives |
|---|---:|---|
| `conformance.test.ts` | 78 | legacy only |
| `authoring-specification-conformance.test.ts` | 41 | legacy only |
| `design-sync-conformance.test.ts` | 33 | legacy only |
| **`review-board-conformance.test.ts`** | **26** | **legacy only** |
| `authoring-pipeline-conformance.test.ts` | 22 | legacy only |
| `v22-conformance.test.ts` | 16 | legacy only |
| `canonical-capability-conformance.test.ts` | 13 | **dual** (16 canonical references) |

**Six of the seven are legacy-only.** `verify-suite-integrity.js` — built this session for exactly this class of event — will report the drop as a **failure**, correctly, and the baseline must be re-cut deliberately with the loss stated rather than absorbed.

> **THIS SESSION'S A1 REPAIRS DIE WITH IT.** `review-board-conformance.test.ts` is legacy-only, and it carries the four tests proving G-1, G-2 and G-3 — each written to fail on its unrepaired form, each proved by reverting the repair. **The repairs were landed into the aggregator of a board that G deletes.** That is not an argument against G; it is the precise cost of A1 having repaired the mechanism *before* it was ported, which was the sequencing ADR-0076 §6 chose deliberately.

## 5. P-69.6's COLLAPSE — the completeness census is a census of the retiring runtime

`run-functional-completeness.mjs` builds **five legacy runs** — `passing`, `healed`, `unhealed`, `reasoning`, `jira` — through `new E.FunctionalTestingOrchestrator(E.createFunctionalTestingEngine(...))` at lines 113–122, referenced 35 times across the file. P-69.6 ruled that the scenario *"exercises both runtimes while both exist"* and **"converges to canonical-only when the agent path retires under P-69.8"**.

**Measured, the census does not converge. Parts of it disappear.** Current output, `digest 20/22`:

```
agents 144 · orchestrators 13 · agentsReachable 144 · orchestratorsActive 13
intelligencePlane 131 · executionPlane 13 · reasoningAgents 44 · deterministicAgents 100
adapterOperations 14 · adapterOperationsInvoked 13
testCasesAuthored 49 · automationAssets 23 · workItemsCreated 4
1398 audit event(s) across 12 stages
```

**Eight of those fourteen dimensions count agents or orchestrators.** The canonical runtime has **zero of both** — `PROJECT_STATE.md` §9.3 established that and `verify-canonical-agent-dormancy` enforces it. So after G:

- `agents`, `agentsReachable`, `intelligencePlane`, `executionPlane`, `reasoningAgents`, `deterministicAgents` → **0, permanently, by design**
- `orchestrators`, `orchestratorsActive` → **0, permanently, by design**
- `testCasesAuthored`, `automationAssets`, `workItemsCreated`, `adapterOperations*` → **re-derivable** from the canonical runs (`canonRun` already exists in the file)

> **"Converges to canonical-only" is true of six dimensions and false of eight.** The eight do not converge to a smaller number — **they cease to have a subject**, and a census reporting `agents: 0` alongside `digest: 20/22` would be D-015's vacuous green in the gate built to measure completeness. **P-69.6 must be discharged by REMOVING those dimensions with the reason recorded, not by letting them report zero.**

## 6. WHAT G TAKES THAT NOTHING REPLACES — stated, not implied

Per D-070a, named here so G's closure asserts it rather than leaving it to a debt entry:

1. **The independent review board.** Fourteen reviewers, `ai=0 tool=0`, `ReviewSnapshot` frozen by type, measured at **0 of 14 approving a wholly empty run**. **After G the platform has no independent review mechanism at all.** D-019's third half is what survives: the triad reviews artefacts the composition handed it, and there is nothing else.
2. **The coverage-remediation loop** (`authoringOrchestrator`, stage 7) — the canonical path measures coverage and relays it.
3. **Continuous learning** (`continuousLearningAgents`) — no canonical consumer.
4. Alongside ADR-0069 P-69.2's four recorded reductions: `sharedSteps`, `businessGoal`, `automationReady`, `executionType`.

## 7. THE HARD STOP — and it is not a formality

**G is irreversible and stays a hard stop with every precondition met.** What this report establishes is that the *preconditions* are met and the *cost* is measured; it does not establish that the cost is acceptable, which is not this engine's call.

**Three things are owed before the first removal, and none of them is discovery:**

- **A ruling on §5** — whether the eight agent/orchestrator census dimensions are removed with their reason, or the completeness gate is retired with the runtime it measures.
- **A ruling on obligation 4** — `EngineState` in `registry/reasoning-publication.ts` is a re-**type** with no canonical equivalent, and the Reasoning Result Registry is a platform consumer (ADR-0067), not an FTE-internal one.
- **Acceptance that §6's four absences are stated in G's closure**, in those words.

**Nothing has been deleted, re-pointed or re-typed. The tree is unchanged from the boundary.**

---

## 8. STOPPED BEFORE THE FIRST DELETION — 2026-08-05

**Two reasons, and the first is a measured conflict that stands whoever executes G.**

### 8.1 · RULING 3's PRESERVATION AND PART 1's DELETION SET CONTRADICT — measured

> **Ruling 3:** *"PRESERVE the four G-1/G-2/G-3 tests OUTSIDE the deleted file as the port's specification."*

**They cannot be preserved as executable tests, because their subject is inside Part 1.** Measured:

```
review-board-conformance.test.ts:52   catalogue().invoke('governance.final-certification', …)
                        catalogue()  -> buildCatalogue()            [src/catalogue.ts     — DELETED, Part 1]
                        buildCatalogue -> reviewBoardAgents          [src/agents/review-board.ts — DELETED, Part 1]
      governance.final-certification is DEFINED AT review-board.ts:492 — the aggregator itself
```

**The four tests assert the behaviour of a unit Part 1 deletes.** Moving them to another file relocates the import, not the dependency. Three resolutions exist and each is a different decision:

1. **Preserve them as a SPECIFICATION DOCUMENT, not as tests** — the repairs' required behaviour recorded in prose plus the original assertions, carried into the port's ADR. Honest, and it means `verify-suite-integrity` records a **284**-test drop rather than 280.
2. **Exclude `src/agents/review-board.ts` from the deletion set** — the board survives unreferenced, so the tests keep running and the port has a live subject. **Contradicts Part 1 as written**, and leaves an orphan the retirement inventory will report every run.
3. **Port the board first** — which D-070a ruled is *owed, not blocking*, and whose own precondition (naming the missing architectural role, D-061a) is unmet.

**This is exactly the "if anything measured differs from the shape report, STOP BEFORE DELETING" condition.** §4 of this report said the A1 repairs die with the aggregator; ruling 3 then required them preserved. Both are reasonable and they are not jointly satisfiable as written.

### 8.2 · CAPACITY — said before the first deletion, as instructed

**This engine does not have the remaining context to carry all four parts to suite-green in one change.** Stated plainly because the instruction was explicit that saying so part way is the worse outcome, and because G has **no suite-green state between its parts** — a partial G leaves gates pointing at deleted paths and the repository with no valid boundary.

What remains is not a long tail: ~10 module deletions, a re-composition of `authoring-bridge.mjs` onto the canonical entry point, a rewrite of `run-functional-completeness.mjs`'s five-run harness to one runtime with eight census dimensions removed and the six survivors shown to still discriminate, six-plus governance edits including two gate deletions with recorded justifications, test extraction, a re-cut suite-totals baseline with the loss named, and **three to four full build + suite + governance cycles** — each governance run alone is 5–10 minutes — plus a stashed clean-tree diff and a closure re-baseline.

**Nothing is deleted. The tree is at the same clean boundary §7 left it at.**

---

## 9. STOPPED BEFORE THE FIRST DELETION, SECOND TIME — 2026-08-05

**§8.1's conflict is RULED and discharged.** Option 1: the A1 repairs are preserved as [`BOARD_AGGREGATOR_PORT_SPECIFICATION.md`](BOARD_AGGREGATOR_PORT_SPECIFICATION.md), the sequencing cost is recorded as one consequence with D-069, and the test loss is named rather than avoided. **That ruling is delivered.**

**What stops G a second time is not a conflict between instructions. It is four measured differences between this report's own §§1–4 and what the repository contains** — and the binding condition is *"if anything measured differs from the shape report, STOP BEFORE DELETING."* **Three of the four would silently destroy the canonical runtime; the fourth would silently destroy a gate.** A fifth finding (§9.5) is about the comparison procedure the binding itself prescribes.

**None of the four is discovery.** Each was produced by running a tool this report already cites, or by reading a file this report already names.

### 9.1 · THE DELETION SET IS **9 MODULES, NOT 25** — the two sets are nested, not disjoint

**`RETIRING ⊃ ORPHANED`.** The 9 orphans are a **subset** of the 16-module retiring closure, so *"16 retiring modules + 9 orphans"* names 25 files where 9 exist. The other **7 members of the retiring closure are also in the SURVIVING closure**, measured from the same tool §1 cites:

```
src/model.ts                             src/emitters/digest.ts
src/domains/observation-interpretation.ts     src/emitters/executable-automation.ts
src/agents/design-sync.ts                src/emitters/repository.ts
src/design-sync-composition.ts
```

**`src/model.ts` is the canonical runtime's own type module. `src/domains/observation-interpretation.ts` is Section D's port, committed two commits ago.** Deleting the retiring closure deletes the runtime G exists to preserve.

**Why the arithmetic reads as it does:** `retiring` is the closure *from* `orchestrators.ts`/`capability.ts`/`catalogue.ts`, and a closure contains everything those modules reach — including the shared modules the canonical path reaches too. **`orphans = retiring \ surviving` is the deletion set, and it is the only one the tool ever reported.** §1 prints both numbers on adjacent lines and never states their relation, which is what made "16 + 9" a readable sum.

### 9.2 · **`src/agents/design-sync.ts` IS NOT DELETABLE** — §1 quotes a fresh run beside a table built from a stale one

**§1 contains both numbers and they disagree.** Its pasted console block reads `ORPHANED : 9`; its table lists **ten** modules. The tenth is `src/agents/design-sync.ts`, and the provenance of the discrepancy is exact:

| | |
|---|---|
| `eca53fb` · **2026-08-04** | generated `governance/capability/retirement-inventory.json` — `orphanCount: 10`, **`src/agents/design-sync.ts` among them.** Correct on that tree. |
| `4d79e59` · **2026-08-05** | *"P-69.2 — design synchronisation composed onto the canonical runtime"*. `src/domains/synchronisation.ts` enters the canonical composition, **and `agents/design-sync.ts` with it.** |
| — | **The JSON was never regenerated.** §1's table was read from the 2026-08-04 file; §1's summary block was a fresh run. |

**The reachability is direct, live, and independent of the tool:**

```
src/canonical-capability.ts:173     S.stepSynchronisation(…)              — the canonical composition
src/domains/synchronisation.ts:41   import { designSyncAgents } from '../agents/design-sync.js'
src/domains/synchronisation.ts:152  new Map(designSyncAgents.map(…))      — a RUNTIME use, not a type import
src/design-sync-composition.ts:49   import type { DiscoveredRepository, SharedAssets }
```

**Deleting `agents/design-sync.ts` breaks the canonical synchronisation domain at line 152.** And `canonical-capability.ts:64–73` records that this reachability is new in its own words — *"Design synchronisation was unreachable from this composition until this existed"* — so the module moved from orphan to load-bearing **the day before G was scoped**, by a commit whose whole purpose was to move it.

**The ≈7 845-line figure is 6 944 + design-sync.ts's 901, and the 901 is not removable.** The measured cost of G is **6 944 lines across 9 modules** — the D-056/D-069 class §2 was written to prevent, arriving in §1 of the report that names it, through a stale evidence file rather than a wrong count.

> **The JSON has been regenerated** and now reports `9`. It is the one file in the working tree this stop changed, and it changed to become true.

### 9.3 · THE SUITE DROP IS **218**, AND IT IS NEITHER 280 NOR 284

**Measured in the gate's own units.** `verify-suite-integrity` counts `test(`/`it(` declarations in **source**; that count reproduces `suite-totals.json`'s `functional-testing-engine: 509` **exactly**, so it is the right yardstick and the drop is stated in it.

| File | Tests | Fate | Reached through |
|---|---:|---|---|
| `conformance.test.ts` | 78 | **deleted** | `createFunctionalTestingEngine`, `buildCatalogue` |
| `authoring-specification-conformance.test.ts` | 41 | **deleted** | same |
| `design-sync-conformance.test.ts` | 33 | **deleted** | same — *not* `designSyncAgents`, which survives |
| `review-board-conformance.test.ts` | 26 | **deleted** | same — **carries the four A1 tests** |
| `authoring-pipeline-conformance.test.ts` | 22 | **deleted** | same |
| `v22-conformance.test.ts` | 16 | **deleted** | same |
| `canonical-capability-conformance.test.ts` | 13 | **2 removed, 11 kept** | `FunctionalTestingOrchestrator` at lines 83 and 87 only |
| | **218** | **509 → 291** | |

**The four A1 tests are inside `review-board-conformance.test.ts`'s 26, which is inside the 216.** §4's table is a straight per-file sum that already includes them, so **"280 + 4" double-counts the four the ruling is about.** Naming the drop as 284 would over-state the loss by 66 and mis-attribute 4 of it.

> **THE DROP IS NAMED PER FILE ABOVE SO THE GATE'S FAILURE IS EXPLAINED RATHER THAN OVERRIDDEN** — which is the binding, and it holds at 218 exactly as it would have at 284. **The number changed; the discipline did not.**

### 9.4 · **`ip-execute-gateway.mjs` WAS NEVER IN THE INVENTORY'S SCOPE** — and one gate reads it unguarded

PART 1 names it for deletion. **It lives in `packages/tenant-onboarding-engine/`, and `retirement-inventory.mjs` measures `packages/functional-testing-engine` only.** So none of §2's four obligations and none of §3's seven governance files describe it. Measured directly:

| Reference | Effect of deleting the file |
|---|---|
| `governance/verification/verify-package-governance.js:518` | **UNGUARDED `readFileSync`** — the gate **throws**, it does not fail |
| `governance/verification/verify-runtime-cutover-readiness.js:85` | guarded by `existsSync`, falls back to `''` → **RC-3 `!rerouted` becomes vacuously true** |
| `packages/functional-testing-engine/src/contract/package-governance.ts:166` | a **surviving** module declares it in the governed package-governance contract |
| `packages/functional-testing-engine/test/authoring-bridge.test.mjs` | 8 tests, and PART 3 re-composes this bridge |
| `governance/verification/verify-provider-platform.js:120` | named in `FORBIDDEN_MODULE` |

**The second row is D-015's vacuous green arriving unannounced.** §3 identified two gates that lose their subject and required *"a recorded justification"* for each; this is a **third**, it is not a deletion, and it turns green by reading an empty string. **A gate that passes because its input vanished is the exact failure this report's §3 was written to prevent, and it is not in §3's list.**

### 9.5 · THE BINDING'S *"REBUILT FROM SOURCE"* CLAUSE IS LOAD-BEARING FOR THIS TOOL — measured

The binding requires gate deltas *"diffed against a stashed clean tree rebuilt from source."* **Measured what happens when the second half is skipped:** a clean `HEAD` worktree, unbuilt, run through the same inventory.

```
              current tree      clean HEAD, UNBUILT
SURVIVING           34                  23
RETIRING            16                  16
ORPHANED             9                 12
RE-POINTING          4                   0        <-- "none — no surviving module imports a retirement target"
```

**`authoring-bridge.mjs` imports `./dist/src/index.js`, and `dist/` is not tracked.** On an unbuilt tree the bridge's three obligations resolve to nothing, so the tool reports **zero re-pointing obligations and twelve orphans** — and every line of that output is a well-formed, confident, `VALIDITY: measured` answer. **It reports no work to do, which is the most dangerous shape a false negative can take in a retirement tool.**

The tool's own header anticipates the barrel and the entry-point traps and guards both; **the unbuilt-tree trap is a third, and it is the one the binding's own comparison procedure walks into.** Recorded so the clean-tree diff G still owes is performed **after** a build, not before.

### 9.6 · WHAT IS OWED BEFORE G RUNS

**Not discovery — all four are measured. What is owed is that the instruction be restated against them:**

1. **The deletion set is the 9 orphans, 6 944 lines** — with `model.ts`, `observation-interpretation.ts`, `design-sync.ts`, `design-sync-composition.ts` and the three emitters **explicitly excluded**.
2. **`verify-suite-integrity`'s re-cut names 218**, per the table in §9.3.
3. **`ip-execute-gateway.mjs` gets its own scope decision** — it is a cross-package deletion with a three-gate blast radius the FTE inventory cannot see, and one of those gates goes vacuously green rather than red.
4. **§8.1's ruling is already discharged** and is not waiting on anything.

**Nothing has been deleted, re-pointed or re-typed. The tree is at the same clean boundary §7 and §8 left it at, plus the specification the ruling required and the register entries recording why.**

---

## 10. STOPPED BEFORE THE FIRST DELETION, THIRD TIME — 2026-08-05, ON A BUILT TREE

**§9's four differences are all confirmed on a rebuilt tree, and the restated instruction is correct on every one of them.** Measured first, exactly as §9.5 requires — `tsc -p tsconfig.json` (exit 0), then `retirement-inventory.mjs`:

```
SURVIVING 34 · RETIRING 16 · ORPHANED 9 · RE-POINTING 4
orphans = capability.ts · orchestrators.ts · catalogue.ts · agents/{authoring,
          automation-execution-healing, continuous-learning, repository-and-authoring,
          review-board, story-and-test}.ts
excluded and verified absent from the orphan set: model.ts · observation-interpretation.ts
          · design-sync.ts · design-sync-composition.ts · the three emitters
```

`wc -l` over the nine = **6 944**. The gate's own counter over `packages/functional-testing-engine/test` = **509**, and the §9.3 per-file table sums to **216 + 2 = 218 → 291**. **Three numbers, three tools, all three match the restatement.**

**What stops G is a FOURTH gate, and it is on no list — not §3's two, not §9.4's third, not the restatement's three.**

### 10.1 · `verify-runtime-cutover-readiness` GOES RED ON PART 1 ALONE, BEFORE PART 3 AND WITHOUT TOUCHING `ip-execute-gateway.mjs`

| Property | Reads | Effect of G |
|---|---|---|
| **RC-4** *replace-before-remove* | `fs.existsSync(FTE/src/capability.ts)` — line 38, 91 | **PART 1 deletes `capability.ts`. RED.** No dependence on Part 3, Part 2, or the cross-package question |
| **RC-3** *gateway not rerouted* | `/(runtime-entry-point-bridge\|createRuntimeEntryPointBridge\|RuntimeEntryPointBridge)/` over `ip-execute-gateway.mjs` **+ `authoring-bridge.mjs`** — line 85–86 | **PART 3 re-composes `authoring-bridge.mjs` onto the canonical entry point. RED** — and correctly so |

**THE GATE IS GREEN ON THIS TREE, MEASURED NOW RATHER THAN INFERRED — so its red is attributable to G and to nothing else.** Run at the same boundary as the inventory above:

```
RC-1 … RC-8 : all PASS
RC-3  the live path still routes to the legacy engine
RC-4  canonical bridge + legacy engine both present
RESULT: PASS — cut-over DEFERRED, legacy live, gateway not rerouted.
```

**This is NOT D-009's class.** D-009 says an already-red gate cannot be fault-proved; this gate is **green, gating, and proved** — ADR-0049 §4 records five fault proofs, one of which is *"a premature gateway reroute"*. **G would fire a probe the programme has already recorded turning this gate red on purpose.**

**The restatement attributes this file's breakage entirely to line 85's `''` fallback on a deleted gateway, and names that the worse failure. Measured, the severity is inverted.** If the cross-package deletion is declined — which §10.3 rules it is — **the vacuous green never occurs at all.** What occurs instead is RC-3 going **RED because the live path really has been rerouted**, which is the gate working. **The worse outcome is not a gate going vacuously green; it is a gate going correctly red and being re-pointed to silence it.**

**Why no symbol scan could see this.** §3 measured *"governance files referencing FTE legacy symbols"* and found seven. This gate references **no FTE symbol**. It references a **file path** (`src/capability.ts`) and the **absence of a string** in another file. A symbol-based inventory is structurally blind to both — **D-007's declaration-versus-implementation seam, arriving in this report's own measurement method.**

### 10.2 · THE GATE IS NOT LOSING ITS SUBJECT. IT IS ABOUT TO DO ITS JOB — and ADR-0061 says so in two places

`runtime-cutover-readiness.ts` carries a **ten-precondition** model. The recorded evidence (`test/runtime-cutover-readiness-conformance.test.ts:19–33`) is **nine of ten UNMET**, including `realRequestTranslatorImplemented: false` — *the very translator PART 3 needs in order to build a `CanonicalCapabilityInput` at all* — and `behaviouralEquivalenceDemonstrated: false`. The model has a **named verdict for exactly what G does**: `inconsistent-premature-cutover`, reached when the gateway is rerouted while not ready.

**ADR-0061 is the authority G runs under, and it withholds this authority explicitly:**

| Source | Words |
|---|---|
| **§6 step 4** | migrate five gates — **`verify-runtime-cutover-readiness` is named** — *"instantiate the canonical runtime; re-anchor fault proofs; regenerate `proofs.json`"*. **Step 4 precedes step 6. G performs step 6 with step 4 undone.** |
| **§6 step 7** | *"Operational cut-over (**routing the live gateway**…) remains the separate ADR-0049 M5 track and is **out of scope** here — … repository canonicalization **does not perform it**."* |
| **§7 impact table** | *"ADR-0049 (M5 cut-over) — **Unchanged**"* |
| **Acceptance banner** | *"It does **NOT** authorize deleting legacy before the canonical-through-runner path is verified behaviourally equivalent, nor does it waive the external cut-over gates."* |

**And here is the contradiction inside the accepted ADR itself, which is the finding rather than a technicality.** §6 **step 6** places *"re-point `authoring-bridge.mjs`"* **in scope** as repository canonicalization. §6 **step 7** places *"routing the live gateway"* **out of scope**. **For this one file those are the same act.** ADR-0049 §2 states the live path in its own words — *"The gateway (`ip-execute-gateway.mjs` → `authoring-bridge.mjs`)"*. The bridge is not a library the gateway may call; **it is the gateway's only authoring path**, so re-composing it changes what the live service executes. **ADR-0061 separates steps 6 and 7 as though the bridge were a repository artefact and the gateway an operational one, and for `authoring-bridge.mjs` that separation does not exist.** This is D-069's class — a scope error inside an ACCEPTED ADR — and `verify-runtime-cutover-readiness` RC-3 is the control built to catch precisely it.

> **PART 1 alone turns a `gating: true` check RED (`run-all.js:115`). PARTS 1 AND 3 TOGETHER PUT THE REPOSITORY IN A STATE ADR-0049's OWN MODEL NAMES `inconsistent-premature-cutover`, WITH NINE OF TEN PRECONDITIONS RECORDED UNMET.** Deleting or re-pointing this gate to restore green would retire a control at the moment it detects the thing it exists to detect — the manufactured confidence R-13.4 and R-13.7 exist to forbid, spent on the one operation in this programme that cannot be undone.

### 10.3 · THE CROSS-PACKAGE SCOPE DECISION — TAKEN, NOT DEFERRED

The instruction required a scope decision on `ip-execute-gateway.mjs` before removal and permitted a stop only if it were not obvious. **It is obvious, and it is TAKEN: `ip-execute-gateway.mjs` is NOT deleted inside G.** Five independent grounds, each measured:

1. **ADR-0061 §6 step 6 defers it in the same breath that names it** — *"retire `ip-execute-gateway.mjs` (**already slated for M5**)"*. M5 is ADR-0049's track; ADR-0049 is **PROPOSED**, not accepted, and states *"It does not authorise legacy deletion."*
2. **A SURVIVING module declares it in a governed contract** — `src/contract/package-governance.ts:166` names it as the repair site for `contractVersion`. Deleting the file would leave a governed contract pointing at nothing.
3. `verify-package-governance.js:518` reads it with an **unguarded `readFileSync`** — the gate **throws**; it does not fail.
4. It is in `packages/tenant-onboarding-engine`; `retirement-inventory.mjs` measures `packages/functional-testing-engine` only, so **no measurement in this report describes its blast radius.**
5. `verify-provider-platform.js:120` names it in `FORBIDDEN_MODULE`.

**This decision removes the vacuous-green failure mode from G entirely** — §9.4's second row cannot occur if the file is not deleted — and leaves RC-3's red as the honest signal it is.

### 10.4 · WHAT IS OWED, AND IT IS ONE RULING

**Not discovery, and not a re-measurement — every number in the restatement verified.** What is owed is a decision that is not this engine's to take, because it is the decision ADR-0049 exists to reserve:

> **Does the programme perform operational cut-over now — re-pointing the live authoring path onto the canonical runtime with nine of ten ADR-0049 preconditions recorded unmet — or does G stop at repository canonicalization?**

Three resolutions, and they are genuinely different decisions:

1. **G proceeds WITHOUT Part 3.** Delete the nine orphans; leave `authoring-bridge.mjs` on the legacy path. **Not available as written** — the bridge imports `createFunctionalTestingEngine`, `buildCatalogue` and `FunctionalTestingOrchestrator` from the three modules Part 1 deletes. Part 1 and Part 3 are one change *because the bridge makes them one*, which is the same coupling §10.2 identifies in ADR-0061 §6.
2. **G proceeds in full, and ADR-0049 is amended or superseded FIRST** — the cut-over authorised on its own evidence, `verify-runtime-cutover-readiness` migrated per §6 step 4 rather than deleted, and the nine unmet preconditions either met or explicitly waived by the authority that owns them. **This is the enterprise-safe route and it is an ADR, not a code change.**
3. **G is deferred behind ADR-0061 §6 steps 4 and 5**, which are its stated predecessors and are undone.

**Recommendation: 2.** It is the only route that leaves the deletion authorised by something other than the instruction that ordered it, and it costs one ADR against an irreversible change to the platform's only live authoring path.

**Nothing has been deleted, re-pointed or re-typed. The tree is at the same clean boundary §7, §8 and §9 left it at** — plus `retirement-inventory.json` regenerated to become true, and the register entries recording why. **`node --check` / `tsc` clean; the suite and the gate set are untouched.**
