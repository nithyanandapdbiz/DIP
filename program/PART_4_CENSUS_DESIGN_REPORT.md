# Part 4 + `run-capability-conformance.mjs` — one decision, reported before building

**Date:** 2026-08-05 · **Authority:** ADR-0069 P-69.6 · ADR-0077 §6 step 7 · `SECTION_G_SHAPE_REPORT.md` §5
**Status:** **REPORTED, RULED, AND BUILT AS SCOPED (2026-08-06).** The four questions were answered before any build; the ruling authorised §5 in full; §5 is now implemented across all four files and both gates are GREEN. The report is left **as it was written**, in the present tense of the measurement — see §8 for what the build changed about it, including the one place the report was wrong.
**Reproduce:** every figure below comes from running the built artefact. The probes are named at §7.

---

## 0 · THE HEADLINE, BEFORE THE DETAIL — THE RESTATEMENT'S ARITHMETIC IS WRONG IN BOTH DIRECTIONS, AND I MEASURED IT RATHER THAN INHERITING IT

The instruction I was given says **eight dimensions removed, six survivors that must be shown to discriminate.** Measured against the file:

| Claim | Measured |
|---|---|
| eight dimensions lose their subject | **nine.** `domains` — `catalogue.domains.length`, `run-functional-completeness.mjs:402` — is not in the list of eight and is read from `buildCatalogue()`, which is deleted. `verify-functional-completeness.js:107` gates on it (`c.domains === c.orchestrators`). |
| six dimensions survive | **zero survive as written.** All six named survivors are computed from Pass A objects: `ADAPTER_OPERATIONS` is the legacy 14-operation list; `adoState` is `stateOf(passing)` and `passing` is a `FunctionalTestingOrchestrator` run; `calls` is the Pass A spy set; `digest` is Pass A's `F-1…F-22`. **Six of the six are Pass A artefacts.** What survives is the *idea* of four of them, re-pointed at Pass B. |
| — | **two of the six have no canonical analogue at all**: `automationAssets` counted materialised assets and the canonical composition never materialises one (ADR-0077 §6 step 5b); `workItemsCreated` counted `WorkItemAdapter.createWorkItem` and `WorkItemAdapter` is **not among the five canonical dependencies**. |

**This is the same error class as the one that cost the last session its Part 4, arriving in the same place.** A number in a restatement is an estimate; the surface is what the file does. It is recorded as debt **D-102** rather than left in a report nobody re-reads.

---

## 1 · QUESTION 1 — WHICH OF THE SURVIVING DIMENSIONS GENUINELY DISCRIMINATE

**The test applied.** A dimension discriminates iff it takes **more than one value** across the inputs the harness can actually construct. One value across every input is a constant wearing a measurement's clothes — the class of the hard-coded `135` in §3. Two runs are not enough to answer it, so the whole certified input space was swept.

### 1.1 · Axis one — the seven certified input variants, connectors held fixed

`referenceInput('A' | 'B' | 'C' | 'no-entitlement' | 'no-criteria' | 'dangling-reuse' | 'positional-reuse')`, `referenceDependencies('A')`:

| candidate dimension | A | B | C | no-ent | no-crit | dangling | positional | verdict |
|---|---|---|---|---|---|---|---|---|
| `adapterOperations` (declared) | 19 | 19 | 19 | 19 | 19 | 19 | 19 | **CONSTANT** |
| `adapterOperationsInvoked` | 17 | 17 | 17 | 17 | **8** | 17 | 17 | binary |
| `testCases` (`testManagement`) | 4 | 4 | 4 | 4 | **0** | 4 | 4 | binary |
| `testSuites` | 2 | 2 | 2 | 2 | 2 | 2 | 2 | **CONSTANT** |
| `scenarios` (`testDesign`) | 4 | 4 | 4 | 4 | **0** | 4 | 4 | binary |
| `architectureComponents` | 4 | 4 | 4 | 4 | **0** | 4 | 4 | binary |
| `publishedObjects` (`sync`) | 16 | 16 | 16 | 16 | **0** | 16 | 16 | binary |
| `defects` (`defectManagement`) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **CONSTANT at zero** |
| `domainSequence` | 14 | 14 | 14 | 14 | 14 | 14 | 14 | **CONSTANT** |

**Every count dimension is BINARY on this axis: its production value on six variants, and `0` on `no-criteria` alone.** It separates *the run produced something* from *the run collapsed entirely*. It does not separate any two substantive inputs from each other. **`no-entitlement`, `dangling-reuse` and `positional-reuse` — three variants built to express three distinct defects — are indistinguishable from `A` in every count.**

### 1.2 · Axis two — the connector variants, which is the canonical path's own workflow set

Pass A earns its five runs by varying the *conditions* (passing · healed · unhealed · reasoning · jira), not the input document. The canonical equivalent is `referenceDependencies('A' | 'F' | 'R')`, and **no census currently uses it.** Swept:

| dimension | A/A clean | C/A covered | A/F exec fails | A/R refuses | nc/A | verdict |
|---|---|---|---|---|---|---|
| `adapterOperationsInvoked` | 17 | 17 | **18** | 17 | 8 | **DISCRIMINATES (3)** |
| `publishedObjects` | 16 | 16 | **24** | 16 | 0 | **DISCRIMINATES (3)** |
| `execution.status` | passed | passed | **failed** | passed | **skipped** | **DISCRIMINATES (3)** |
| `publicationStatus` | published | published | **partial** | **failed** | published | **DISCRIMINATES (3)** |
| `defects` / `publishedDefects` | 0 | 0 | **4** | 0 | 0 | binary — moves off zero only here |
| `failureClassifications` / `recoveryAttempts` | 0 | 0 | **4** | 0 | 0 | binary — as above |
| `eligibleCount` | 0 | 0 | **1** | 0 | 0 | binary |
| `testCases` · `scenarios` · `architectureComponents` · `publishedTestCases` · `executedComponents` · `evidenceReferences` | 4 | 4 | 4 | 4 | 0 | **still binary on BOTH axes** |
| `domainSequence` | 14 | 14 | 14 | 14 | 14 | **CONSTANT on both axes** |
| **`certificationVerdict`** | NOT CERTIFIED, 1 finding | **CERTIFIED, 0** | NOT CERTIFIED, **3** | NOT CERTIFIED, **2** | NOT CERTIFIED, 1 (different reason) | **DISCRIMINATES — five distinct verdict/basis pairs, and it GRADES** |

### 1.3 · THE ANSWER, SHOWN RATHER THAN ASSERTED

> **The census's COUNT dimensions do not discriminate. The runtime's VERDICT dimension does, and no census dimension reads it.**

**Four count dimensions are binary on both axes** — `testCases`, `scenarios`, `architectureComponents`, `publishedTestCases`. They report their production value or `0`, and `0` occurs on exactly one input, the one carrying no acceptance criteria. A census built from them answers *did the runtime produce anything at all*, which is a liveness check, not a completeness measurement.

**Three discriminate, and only once the connector axis is added** — `adapterOperationsInvoked`, `publishedObjects`, `execution.status`, plus `publicationStatus`. Every one of them is flat across the input axis alone. **The discrimination lives in the connectors, and the current Pass B sweeps only inputs.**

**Two are constant and measure nothing** — `domainSequence` is `14` on every input the harness can build, because the sequence is frozen by design (C-1 already asserts that, correctly, as an *order* property); `testSuites` is `2` on all seven.

**One discriminates and grades**: `executiveReporting.certificationVerdict` returns `{verdict, reasons[], basis:{domainsAssessed, negativeFindings}}` — CERTIFIED/0 on `C/A`, NOT CERTIFIED/1 on `A/A`, /3 on `A/F`, /2 on `A/R`, and on `no-criteria` a **different reason from a different domain**. It is the only dimension measured here that varies with *what went wrong* rather than with *whether anything happened*.

**So the honest recommendation is not "keep six".** It is: **the census stops counting inventory and starts recording the verdict basis**, because inventory counts on this runtime are structurally binary and the verdict is not. The four binary counts are retained **labelled as liveness**, which is what they are, rather than presented as completeness.

### 1.4 · A DIMENSION THAT CANNOT BE SHOWN TO DISCRIMINATE, SAID AS ASKED

**`adapterOperations` (the declared total) is a literal — `CANONICAL_ADAPTER_OPERATIONS.length`, 19 — and it is CONSTANT by construction.** It is not a measurement and never was; it is the denominator of `adapterOperationsInvoked`. **It is not retained as a census dimension.** It stays as the denominator inside the ratio it belongs to, where a reader cannot mistake it for an observation.

**`defects`, `failureClassifications` and `recoveryAttempts` are CONSTANT AT ZERO on the input axis** and move only under `referenceDependencies('F')`. Kept without the connector axis, all three are **exactly the finding this report exists to prevent**: a dimension reporting `0` on every run, in a green census.

---

## 2 · QUESTION 2 — WHAT EACH REMOVED DIMENSION LOSES, PER DIMENSION

Nine, not eight. Each is removed **with its own reason**, never left reporting zero — ADR-0077 §6 step 7's words. The column that matters is the last one: what stops being measured, stated as a loss rather than as a deletion.

| # | dimension | source, now gone | WHAT IS LOST |
|---|---|---|---|
| 1 | `agents` | `catalogue.all.length` | The scale bound. Nothing declares a unit count for the canonical path — it has fourteen domain *contracts*, and `domainSequence` already asserts their order and count. **Nothing is lost that C-1 does not already carry.** |
| 2 | `orchestrators` | `Object.keys(E.domainOrchestrators).length` | Per-domain coordination as a *countable* thing. The canonical composition has one composition function and no orchestrator objects. **Lost with no replacement: nothing measures that a domain's work was coordinated as opposed to inlined** — but the distinction has no referent in a composition with no coordinators, so it is a loss of a question, not of an answer. |
| 3 | `domains` **(the ninth, absent from the restatement)** | `catalogue.domains.length` | The equality `domains === orchestrators`, gated at `verify-functional-completeness.js:107` — *every agent domain has an owning orchestrator*. **Both sides of the equality are gone.** This is the dimension whose removal also removes a **gate check**, which is why missing it from the list mattered. |
| 4 | `intelligencePlane` | `catalogue.all.filter(plane==='IP')` | Per-unit plane declaration. **A REAL LOSS, and the sharpest of the nine.** `STAGE_PLANE` survives in the framework, so stages still declare a plane — but no canonical unit declares one, so **nothing can now be measured as misplaced.** F-19 and conformance F-7 both asserted this and both lose their subject. **The property is not satisfied by the canonical path; it is unaskable of it.** Recorded as an open question against ADR-0076 §4.2's `stageRef` work rather than closed here. |
| 5 | `executionPlane` | as above | As above. Additionally: the census reported *"agents span both planes, with execution in the Execution Plane"* (`verify-capability-conformance.js:112`). **After the deletion the Intelligence Plane declares no Execution-Plane unit at all**, which is true and is the D-069/ADR-0069 healing finding restated — the loss is a measurement of a condition that was already recorded as a defect. |
| 6 | `reasoningAgents` | `aiCapabilityClass !== 'none'` | The AI/deterministic split, and with it F-18 (*every reasoning agent declares a prompt contract with a rejection rule*). **A REAL LOSS.** The canonical composition has no `aiCapabilityClass`, no `promptContract` and no rejection rules — **the AI-governance surface of capability 1 is now entirely outside the runtime that ships.** This is not a census artefact: `11-ai-compliance-report.md` reads this axis. |
| 7 | `deterministicAgents` | `all - reasoning` | The INV-7 floor — `verify-capability-conformance.js:117` gated on `deterministicAgents > 0`, *the engine is not wholly dependent on reasoning*. **The canonical composition takes no reasoning dependency at all, so INV-7 is satisfied absolutely and the check becomes unfalsifiable.** Removed rather than re-pointed: a check that cannot fail is not a check. Stated in the evidence as *INV-7 holds by construction — the composition declares no reasoning port* rather than as a passing property. |
| 8 | `agentsReachable` | `registered - dormant` | **The dormancy measurement itself — the thing this whole scenario was built for.** Its header records the founding census: *75 of 89 agents reachable, 0 of 10 adapter operations invoked, 0 of 11 orchestrators coordinated, while every stage completed and the run reported `certified: true`.* **The canonical replacement is `adapterOperationsInvoked` and nothing else**, because there are no units to be dormant. **The dormancy question survives only in its adapter half.** |
| 9 | `orchestratorsActive` | `coordinated.size` | The observed half of #2. Same loss, and it is the half that was *observed* rather than declared — the census instrumented `orchestrator.coordinate` precisely so that "it coordinated" was not inferred. **Nothing in the canonical composition has an equivalent seam to instrument.** |

**Two of the nine are losses of a QUESTION (2, 9), five are losses of a MEASUREMENT with the thing measured also gone (1, 3, 5, 7, 8), and two are losses of a measurement whose SUBJECT SURVIVES ELSEWHERE (4, 6) — plane placement and AI-capability declaration are platform-level properties that capability 1 no longer reports.** Items 4 and 6 are the ones that should not be absorbed into a deletion; they are recorded as debt, not as census entries.

---

## 3 · QUESTION 3 — CAN `run-capability-conformance.mjs` COLLAPSE TO ONE RUNTIME, OR IS ITS SUBJECT GONE TOO?

**Measured first: the scenario emits 1 of its 18 properties.** It throws at `fte.createFunctionalTestingEngine is not a function` before F-1 completes; the gate reports **15 failures**, of which 8 are named anchor properties absent, 4 are census fields `undefined`, and 3 are set-level.

### 3.1 · Per property, classified by what it CONSUMES

| id | asserts | after the deletion |
|---|---|---|
| F-4 | a forged stage result cannot be sealed | **INTACT** — `fw.isSealed` only, no legacy |
| F-7.s | evidence crosses as a reference (`model.ts` `EvidenceReference`) | **INTACT** — `model.ts` is explicitly excluded from the deletion set and verified present |
| F-10 | the platform declares exactly six capabilities | **INTACT** — reads doc 11 |
| F-10.a | no architecture document was added | **INTACT** — reads the directory |
| F-2 | traverses twelve stages, in order | **RE-POINTABLE, measured** — `runThroughRunner().outcome.completed` = 12, `=== [...fw.STAGES]`, `failedAt: null` |
| F-3 | triad traversed; a run missing `policy-review` is refused | **RE-POINTABLE, measured** — both halves true on the runner outcome |
| F-9 | a genuine failure refuses certification with a stated reason | **RE-POINTABLE, measured** — `referenceDependencies('F')` → NOT CERTIFIED with 3 named domain findings |
| F-9.p | a clean run is certified through every gate, in order | **RE-POINTABLE, measured** — `referenceInput('C')` → CERTIFIED, **9/9** gates |
| F-5.n | no orchestrator branches on a provider name | **PROPERTY SURVIVES, SOURCE CHANGES** — it reads `orchestrators.ts` + `capability.ts`, both deleted; re-points to `canonical-capability.ts` · `canonical-domain-steps.ts` · `canonical-runner-capability.ts` |
| F-1 | registers with all twelve stage implementations | **BLOCKED, and this is the one structural obstacle.** The `Capability` descriptor is constructed **inside** `runThroughRunner` (`canonical-runner-capability.ts:150`), closing over per-run mutable state, and is not returned. `createCanonicalRunnerCapability(deps)` returns `{ runThroughRunner }` only — **`CapabilityRegistry.register()` on it throws.** Verified. |
| F-1.n | a capability missing a stage is REFUSED | **BLOCKED for the same reason** — it needs a descriptor to strip a stage from |
| F-5 | two providers produce an identical stage sequence | **SUBJECT GONE.** The canonical path has no `AdapterRegistry`, no `registry.resolve(configuration)` and no provider names; connectors are injected. Provider equivalence is P-69.4's substrate and it lived on the agent path. |
| F-6 | catalogue within its declared scale (80–160) | **SUBJECT GONE** |
| F-6.o | one master orchestrator and one per domain | **SUBJECT GONE** |
| F-6.c | every domain orchestrator coordinated an observed invocation | **SUBJECT GONE** — and the surviving idea, *every declared domain produced its output*, is already C-1 in the other file |
| F-7 | every agent's plane matches its stage | **SUBJECT GONE** — §2 item 4 |
| F-8 | the engine runs with NO reasoning proposals (INV-7) | **SUBJECT GONE, AND VACUOUS IF RE-POINTED.** `CanonicalCapabilityDependencies` declares five members and none is a reasoning port. The canonical path *cannot* be given a proposal, so the property cannot fail — §2 item 7. |
| F-8.p | the canonical planning sequence executes in order through the adapters | **SUBJECT GONE.** `fw.PLANNING_SEQUENCE` is the legacy eight-step planning; the canonical runs fourteen domains across twelve stages and never enters it. |

**Tally: 4 intact · 4 re-pointable and measured green today · 1 re-pointable with a source change · 2 blocked on an unexported descriptor · 7 subject gone.**

### 3.2 · THE ANSWER — ITS SUBJECT IS NOT GONE, AND THE SUBJECT IT SHOULD HAVE IS ONE NOTHING CENSUSES

> **Measured: no governance scenario exercises `createCanonicalRunnerCapability(...).runThroughRunner(...)`.**

Its consumers are `authoring-bridge.mjs:509` (the live path), `measure-authoring-equivalence.mjs` (**unrepeatable — it needs both runtimes and one is gone**), `runtime-entry-point-bridge.ts`, the launcher's generated bindings, and one TypeScript test. **Every `.mjs` governance census in this repository measures the DIRECT composition** — `createCanonicalFunctionalTestingCapability(...).run(...)` — which is `run-functional-completeness.mjs` Pass B and `measure-copy-through.mjs`.

These are **two different compositions of the same fourteen domains.** The direct one returns a `CanonicalCapabilityResult`. The runner one puts those fourteen through `runCapability` — twelve stages, the governance triad at 4–6, `certify()` at the end — and **it is the one ADR-0077 made live.**

**So `run-capability-conformance.mjs` does not collapse into `run-functional-completeness.mjs`, and it should not be deleted.** Its own header states its purpose precisely and the purpose survives verbatim: *"the tests prove each property in isolation; this runs the whole capability… one workflow is either true of an executed run or it is a claim about source code."* Re-pointed at the runner composition, it becomes **the only governance census of the composition the platform actually serves from** — which is a stronger position than it held before the deletion, when it duplicated the agent path's stage traversal.

**349 lines does collapse — to roughly 150.** Seven properties go with their subject, four are already framework-only, and the five that re-point need a run and a failing run rather than five adapter registries, two provider configs and a hand-built runtime seam.

### 3.3 · THE ONE THING THAT MUST BE DECIDED BEFORE IT CAN BE BUILT

**F-1 and F-1.n need the `Capability` descriptor, and it is unreachable.** Three routes, scoped and **not chosen here**:

| | route | cost |
|---|---|---|
| (a) | `createCanonicalRunnerCapability` also returns the descriptor | The descriptor closes over per-run `let` bindings; returning it exposes an object whose stage handlers mutate captured state across runs. **A registration-only descriptor and an execution descriptor would then be the same object with two contracts** — the shape D-091 punished. |
| (b) | a separate `canonicalRunnerDescriptor()` for registration only | Two constructions of one stage map, which is D-007's seam by hand: the registered shape and the executed shape could drift with every gate green. |
| (c) | **drop F-1/F-1.n from this scenario and let the framework's own suite carry them** | They are framework properties — *a registry refuses an incomplete capability* is `@dbiz/capability-framework`'s claim about itself, not capability 1's. **This is the honest reading and is the recommendation**, on the condition that the framework suite is confirmed to assert both. **NOT CONFIRMED — not measured in this report.** |

**Route (c) is recommended and is not taken.** Confirming the framework suite carries both is a measurement, and this report does not make claims it has not measured.

---

## 4 · WHAT ELSE THE MEASUREMENT FOUND, RECORDED BECAUSE IT WAS NOT ASKED FOR

**(i) Repairing the scenario alone converts a clean FAIL into an uncaught crash.** `verify-functional-completeness.js:118–119` reads `orchestrators.ts` and `capability.ts` unguarded, and `:141` reads `src/agents/`. All three are deleted. They are inside `if (observed)`, so they are unreached **only because the scenario throws first.** The moment the scenario emits parseable output, the gate throws `ENOENT` before it writes evidence. **Part 4 is four files, not two:** two scenarios and their two gates.

**(ii) `TestManagementAdapter.findExistingTests` is called by NO run in the entire sweep** — five runs across both axes, union **18 of 19**. C-4's detail explains `publishDefect` (*"defect publication requires an execution failure to publish about"*) and that excuse is now **dischargeable**: under `referenceDependencies('F')` the canonical path *does* call `publishDefect`, taking C-4 to 18/19. **`findExistingTests` has no stated reason at all.** It is in the declared list, it is never driven, and C-4 has been reporting it inside a two-item failure whose other item carried the whole explanation.

**(iii) The Pass A / Pass B labelling that the file introduced is what makes this legible.** Its own comment — *"an unlabelled pair is how 'the census measures one of two runtimes' went unnoticed in the first place"* — held. The nine subjectless dimensions are all Pass A; every re-pointable one is Pass B. **The labelling did its job and is the reason this report could be written from the file rather than from a run.**

---

## 5 · THE SHAPE OF THE BUILD THIS REPORT ASKS TO BE AUTHORISED

Stated so the ruling is on something concrete. **Nothing here is performed.**

1. **`run-functional-completeness.mjs`** — Pass A deleted (lines 33–179, 344–367, and the Pass A half of the census). Pass B gains the **connector axis**: the workflow set becomes `{A/A, C/A, A/F, A/R, no-criteria/A}` and C-4's denominator is measured across the union.
2. **The census is re-founded on the verdict, not on inventory** — `certificationVerdict.verdict`, `basis.negativeFindings`, `basis.domainsAssessed`, `execution.status`, `publicationStatus`, `adapterOperationsInvoked/declared`, and the four binary counts **labelled `liveness`**. The nine removed dimensions appear in the evidence as **named absences with §2's reason**, never as `0`.
3. **`verify-functional-completeness.js`** — the three census equalities (`agentsReachable`, `orchestratorsActive`, `domains === orchestrators`) removed with their reasons; the `orchestrators.ts` / `capability.ts` / `agents/` reads re-pointed to the canonical sources or removed with their reason.
4. **`run-capability-conformance.mjs`** — re-pointed at `runThroughRunner`, ~150 lines, 4 intact + 5 re-pointed properties, 7 removed with reasons, F-1/F-1.n per §3.3's ruling.
5. **`verify-capability-conformance.js`** — the anchor list and the four census checks re-cut to match.
6. **Then, and only then**, the two deliberate re-baselines and `emit-closure-package.mjs`.

**What this build must not do**, stated because it is the cheap route and it is available: it must not keep a dimension that reports a constant so that the census still shows fourteen rows. **A census of six all-passing is one step from a census of nothing, and a census of fourteen where nine are constants is already there.**

---

## 6 · WHAT IS NOT MEASURED IN THIS REPORT

- **Whether `@dbiz/capability-framework`'s own suite asserts registration and incomplete-capability refusal.** §3.3 route (c) depends on it and it is not confirmed.
- **Whether any consumer outside these four files reads `functional-evidence.json`'s or `capability-conformance`'s census fields.** The platform-certification reports are regenerated and were not traced field by field.
- **Whether `findExistingTests` is unreachable by design or by omission** (§4 ii). It is recorded as an observation; the cause is not established.
- **Any figure for the agent path.** Pass A cannot run; nothing here re-derives what it used to report.

## 7 · REPRODUCTION

Built tree, `packages/functional-testing-engine` `tsc` exit 0. Probes:
`node governance/capability/run-functional-completeness.mjs` → throws at `:58`.
`node governance/capability/run-capability-conformance.mjs` → 1 property, `fatal: "fte.createFunctionalTestingEngine is not a function"`.
`node governance/verification/verify-functional-completeness.js` → FAIL, 1 property (scenario did not execute).
`node governance/verification/verify-capability-conformance.js` → FAIL, 15 properties.
The two discrimination sweeps were run against `dist/src/index.js` over `referenceInput` × `referenceDependencies`; both tables above are their output.

---

## 8 · WHAT THE BUILD CHANGED ABOUT THIS REPORT (added 2026-08-06, after §5 was implemented)

The report above is left in the tense it was written in. This section records what executing it
proved, corrected and found — **including the one place the report itself was wrong**, because a
design report amended into agreement with its own outcome is no longer evidence of anything.

**§3.3 ROUTE (c) IS CONFIRMED, AND IT WAS A MEASUREMENT RATHER THAN A CHOICE.**
`capability-framework/test/framework.test.ts` carries *"a missing stage is refused, and the message
names it"* — which asserts more than the scenario's F-1.n did, since it also checks the error type
and that the message names the missing stage — and *"the registry is the single enumeration of
capabilities (C-11.9)"*, which registers a complete twelve-stage capability. It carries a third the
scenario never had: *"a capability with no certification criteria is refused."* **33/33 green.**
F-1's capability-1 half is **subsumed by F-2**, not dropped: twelve stages cannot complete in the
declared order without twelve stage implementations.

**THE REPORT WAS WRONG ABOUT WHAT THE WORKFLOW SET BUYS, AND THE GATE CAUGHT IT.**
§5 item 1 implied the set would widen adapter coverage. The first version of the gate's check
asserted exactly that — *the union reaches operations no single run reaches* — and it **FAILED**:
union **18**, and `execution-failing` alone reaches **18**. One run dominates the set on coverage.
**The set's value is DISCRIMINATION, not coverage**, and the check now asserts the thing the set
actually delivers — *no run is redundant; each produces a distinct (verdict, findings, execution,
publication) signature* — measured at **5 runs, 5 distinct signatures**. The coverage figure is
reported beside it rather than gated, so a later reader sees the number instead of inferring it
from a missing check. **A gate demanding something untrue of a correct runtime is a gate that will
be weakened later**, and this one was corrected before it landed rather than after.

**THREE PROPERTIES WERE FAILING INVISIBLY AND ARE NOW GATED.** The old gate read the scenario's
top-level `properties`, which were **Pass A's**. The canonical C-properties were emitted into a
nested field **nothing checked** — so C-3 and C-5 had been failing inside a green gate. All
thirteen are now gated, and a failure is excused **only** where it names a debt id the gate
**resolves in the register**; a stale exemption (a passing property still claiming a debt) is
itself a failure. Standing, declared, not waived: **C-3 → D-007 · C-4 → D-105 · C-5 → D-012.**

**§4 (ii) BECAME DEBT D-105, AND HALF ITS EXCUSE WAS DISCHARGED BY THE BUILD.** C-4's detail
explained both uncalled operations with one reason — *"defect publication requires an execution
failure to publish about."* Under `referenceDependencies('F')` the canonical path **does** call
`publishDefect`, so that reason was a property of which inputs the census ran. What remains is
`TestManagementAdapter.findExistingTests`, driven by **no run in the set**, with **no stated
reason**, against four sibling operations that each carry one. Cause not established; not guessed.

**TWO FAULT PROOFS WERE DEAD AND NEITHER GATE HAD BEEN PROVED SINCE THE DELETION.** Both probes
replaced `dist/src/orchestrators.js` — the build output of a source file §6 step 6 deleted. **A
probe whose target does not exist cannot make a gate go red**, so both proofs asserted nothing
while being recorded as proofs. That is D-103's shape inside the fault-proof set, found by
`verify-governance-self-validation` reporting *"no gate has changed since its proof was recorded"*.
Re-anchored on the properties the rebuilt gates actually carry — a provider name planted in
canonical orchestration source, and a certification verdict made unconditional so the census stops
discriminating. **Both now PROVED (clean 0 · faulted 1 · named · replayed).** The verdict probe's
first version patched `src/` and recorded `faulted 0`, because the scenario imports `dist/`; the
recorder caught the inert probe, which is the recorder doing its job.

**AND THE RULE THIS SESSION WROTE CAUGHT TWO INSTANCES OF ITSELF, ONE FILE OVER FROM WHERE IT WAS
LEARNED.** CHARTER §17.1.1 (i) — *a gate's PASS-branch output is derived, never authored*. Both
rebuilt gates printed authored verdict lines that had become false: *"Every agent, adapter
operation and domain orchestrator was observed to execute"* (no agents, no orchestrators, one
operation uncalled) and *"Variation only through adapters"* (F-5's claim, whose subject was
deleted). Both are now derived from the run.

**MEASURED AFTER THE BUILD.** `verify-functional-completeness` **PASS** (10/13 properties hold,
3 declared debts, 18/19 operations across the set, census discriminates). `verify-capability-
conformance` **PASS** (11/11). Full suite **12 reds → 9**, none added; the closure baseline
re-cut and `verify-programme-closure` **PASS**. FTE suite **210/0**. Framework suite **33/0**.
