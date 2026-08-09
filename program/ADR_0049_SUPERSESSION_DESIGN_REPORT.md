# The cut-over ADR — design report

**REPORT ONLY. NO ADR WRITTEN. NO SOURCE TOUCHED. G NOT STARTED.** 2026-08-05, at `683418e`, tree at the same boundary [`SECTION_G_SHAPE_REPORT.md`](SECTION_G_SHAPE_REPORT.md) §§7–10 left it at.

**Authority for this report:** the ruling of 2026-08-05 accepting §10.4 resolution 2 — *amend or supersede ADR-0049 first, then G in full, MIGRATING `verify-runtime-cutover-readiness` per [ADR-0061](../docs/adr/ADR-0061-canonical-functional-capability-runtime-adoption.md) §6 step 4, not deleting it.* It answers the five questions the ruling set, in that order, and stops before the ADR.

**The severity inversion stands as ruled:** a gate going vacuously green is a control that stopped measuring; a gate going correctly red and then re-pointed is a control that was **overruled**, and only the second needs a person. §3 below is written to that ordering, and §1(b) reports a way the first can happen anyway — on the recommended path, without deleting anything.

---

## 0. FOUR MEASUREMENTS TAKEN BEFORE THE REPORT COULD BE WRITTEN

None is discovery. Each came from reading a file the shape report already names or grepping a symbol it already cites. **Two of them move the answers**, and one of them corrects a number this programme has been carrying since 2026-07-29.

### 0(a) · THE READINESS VERDICT HAS NEVER BEEN COMPUTED — *"nine of ten unmet"* IS A TEST FIXTURE

`assessCutoverReadiness` has **six call sites in the repository, and all six are in its own reference conformance test**, every one of them passing a hand-written literal:

```
src/runtime-cutover-readiness.ts:74                          the definition
test/runtime-cutover-readiness-conformance.test.ts:45,46,52  currentEvidence()  — hardcoded
test/runtime-cutover-readiness-conformance.test.ts:64        allMet()           — hardcoded
test/runtime-cutover-readiness-conformance.test.ts:72,79     almost / premature — hardcoded
```

**No production code, no governance gate and no evidence generator ever calls it.** `verify-runtime-cutover-readiness.js` does not either: RC-1 (`:71`) is a *regex over the source text* asserting the function is exported, and RC-2 (`:76`) spawns the built test. The gate certifies that the assessor behaves correctly given evidence. **Nothing in the platform supplies it evidence.**

So the *"nine of ten UNMET"* carried through shape report §10.2, D-075 and `NEXT_ACTION.md` is the content of `currentEvidence()` — a fixture authored 2026-07-29 and unchanged since. It is not a reading of this repository.

**And it disagrees with the only measurement the programme ever took.** `FT-M5-CUTOVER-001` (2026-07-29) evaluated the ten preconditions against fresh disk — probing for docker/podman/nerdctl/containerd/kubectl/finch, checking `FTE_EXECUTION_PLANE_ENDPOINT` and `FTE_RUNTIME_BINDINGS` — and recorded **8 of 10 unmet**, because it measured CU-7 (*external contracts unchanged*) as **met**: nothing had changed. The fixture records CU-7 as `false`.

> **The number is 8, measured; 9 is a fixture. The difference is one precondition, and the class is the finding:** ADR-0049's readiness model is a declaration with no measurement source, sitting inside the gate that certifies ADR-0049. **D-007's declaration-versus-implementation seam, in the control the programme has been treating as the authority that reserves this decision.** Recorded as **D-078**.

This is not an argument that readiness is better than believed. CU-2 (a container runtime) is absent by measurement and stays absent. It is the reason question 4 has never been answerable: **a precondition nothing computes cannot be met or waived on evidence — only asserted.**

### 0(b) · RC-3 DETECTS A NAME, NOT A ROUTING — AND THE REROUTE THAT WILL ACTUALLY HAPPEN DOES NOT TRIP IT

`verify-runtime-cutover-readiness.js:84–86`:

```js
const REROUTE = /(runtime-entry-point-bridge|createRuntimeEntryPointBridge|RuntimeEntryPointBridge)/;
const gatewaySrc = (…GATEWAY…) + '\n' + (…AUTHORING_BRIDGE…);
const rerouted = REROUTE.test(gatewaySrc);
```

Three literal strings over two files' raw text. Two consequences, and the second is the one that matters:

**α · It fires on a comment.** Its own recorded fault proof does exactly that — `record-fault-proofs.js:1521–1528` plants `// premature-cutover probe: createRuntimeEntryPointBridge` above an unrelated import and expects RC-3 red. The probe is honest about what it proves; what it proves is that the check is textual.

**β · It does not fire on Path B.** §2 establishes that the only available successor composition is `createCanonicalRunnerCapability(...).runThroughRunner(...)`, **which matches none of the three strings.** A Part 3 built that way reroutes the platform's only live authoring path onto the canonical runtime and **RC-3 stays GREEN.**

> **The vacuous green is available by construction, not only by deletion — and it arrives on the recommended path rather than the declined one.** §10.3 removed one route to it by declining the cross-package deletion; this is a second, and it is inside the change the ruling authorised. Recorded as **D-079**. It is why §3's RC-3′ replaces the regex with a reachability measurement, and why the gate migration must land **before** Part 3 rather than after it (§6).

### 0(c) · PART 3's BLAST RADIUS IS LARGER THAN THE FOUR RE-POINTING OBLIGATIONS — FOUR GATES IMPORT THE BRIDGE BY PATH AND **EXECUTE** IT

| Surface | Anchor | What it does |
|---|---|---|
| `governance/capability/run-intent-conservation.mjs` | `:12` import · `:38` call | **is itself one of the five gates ADR-0061 §6 step 4 names for migration** |
| `governance/verification/verify-execution-contract.js` | `:84` import · `:111`, `:228`, `:249` | runs `authorViaFTE` three times, including the refusal path |
| `governance/verification/verify-package-governance.js` | `:95` import · `:99`, `:457` | authored body + refusal |
| `governance/verification/verify-reasoning-registry.js` | `:98` import · `:134`, `:385`, `:491` | ADR-0067 registry projection, three runs |
| `governance/verification/record-fault-proofs.js` | `:1524` | anchors the RC-3 probe **in this file** |
| `packages/functional-testing-engine/test/authoring-bridge.test.mjs` | 9 tests | drives the bridge directly |

**None of these is a symbol reference to a retiring module.** Every one references the *file*, then executes it. Shape report §3 measured *"governance files referencing FTE legacy symbols"* and found seven; these four are not among them, for the same structural reason §10.1 gave for the cut-over gate itself. **The method limit is one limit with at least five instances, not one exception.** Recorded as **D-077**.

### 0(d) · PART 3 IS A RE-TYPE, NOT A RE-POINT — AND OBLIGATION 4 IS **INSIDE** IT

`registry/reasoning-publication.ts:36` imports `type EngineState` from `../capability.js`; `:105` carries it as `ReasoningHarvest.state`. The publisher reads it at **8 sites over 10 fields**: `story`, `acceptanceCriteria`, `requirements`, `dependencies`, `risks`, `complexity`, `ambiguities`, `gaps`, `reviewApproved`, `authoringCoverage`.

`authoring-bridge.mjs:551–568` is the only caller in the live path, and it passes exactly the `state` it harvested from the legacy orchestrator (`:270`).

> **Shape report §2's obligation 4 and G's Part 3 are the same obligation seen from two ends, not two obligations.** Re-composing the bridge means supplying those ten fields from `CanonicalCapabilityResult`'s fourteen domain results. Re-typing `EngineState` in the registry without re-composing the bridge would leave the bridge unable to fill it. **They land together or neither lands.**

---

## 1. QUESTION 1 — WHAT THE LIVE PATH BECOMES AFTER G, STATED AS A PATH

### 1.1 · What it is now

```
POST /v1/execute
  → ip-execute-gateway.mjs                     (owns the signing key — INV-2; hashes and seals)
      :47  import { authorViaFTE, reflectViaFTE } from "../functional-testing-engine/authoring-bridge.mjs"
      :411 authorViaFTE({ contextRequest, now, contractVersion, packageIdOf, onAssembly })
  → authoring-bridge.mjs
      :245 new FunctionalTestingOrchestrator(runtime => createFunctionalTestingEngine(deps, runtime),
                                             buildCatalogue(), registry).execute({…})
      :270 state = valueOf(run.results.get('execution-planning'))
      :517 groundOperations(testCases, scenarios, contextRequest.selectorDiscovery)
      :551 publishReasoningResults(openReasoningRegistry(…), { identity, state, operations, … })
      :571 assembleExecutionPackage(registry, …)   → body  |  registryRefusal(…)
  → gateway hashes + signs the body, returns the sealed ExecutionPackage
```

`reflectViaFTE` (gateway `:601–603`, bridge `:297–337`) drives **the same `runFTE`** on the post-execution pass. **ADR-0061 §6 step 6 says "re-point `authoring-bridge.mjs`" and names one function; the file exports two, and both run the legacy engine.**

### 1.2 · Path A — via the Runtime Entry-Point Bridge. **NOT AVAILABLE**, three measured reasons

`createRuntimeEntryPointBridge` is the obvious candidate and it is the wrong one:

1. **It returns the wrong object.** `execute()` yields a `RuntimeExecutionOutcome` (`runtime-entry-point-bridge.ts:64–76`). The gateway's contract with the bridge is *a package body it then hashes and signs*. Adopting it changes the gateway — the act §6 step 7 puts out of scope and ADR-0049 §6.1 reserves to cut-over.
2. **It dispatches.** `:112 deps.runtimeExecutionSpi.dispatch(pkg)`. That needs a real signer and a real EP transport — **CU-4 and CU-5**, the ADR-0050 ports left unbound because the bindings are infrastructure. The live authoring path today dispatches nothing: it authors and returns.
3. **It throws where the live path refuses.** `:103–108` raises on a non-certified lifecycle; the live path returns a typed `registryRefusal` carrying the originating capability and the blocked chain — the artefact the far side acts on. A throw at the gateway is a different external behaviour, not an internal one.

### 1.3 · Path B — via the canonical runner capability. **The only successor that preserves the gateway contract**

```
POST /v1/execute
  → ip-execute-gateway.mjs                                       UNCHANGED — signs, seals, owns the key
  → authoring-bridge.mjs  authorViaFTE({ … })                    same signature, same return shape
      ├ build CanonicalCapabilityInput from the F1 contextRequest
      │    story + acceptance-criteria TEXT uncut (ADR-0075 P-75.2), as projectShim serves it today;
      │    repository/automation/reporting models, candidates and rules from the tenant profile
      ├ createCanonicalRunnerCapability(deps).runThroughRunner(input, ctx)
      │    → runCapability → 12 stages → governance triad (4–6) → certify → CanonicalCapabilityResult
      ├ groundOperations(…) against contextRequest.selectorDiscovery      UNCHANGED — the bridge's own reasoning
      ├ publishReasoningResults(openReasoningRegistry(…), harvest)        harvest.state RE-TYPED (§0d)
      ├ assembleExecutionPackage(registry, …)                            UNCHANGED — ADR-0067
      └ body  |  registryRefusal(…)                                      UNCHANGED shape
  → gateway hashes + signs the body                                      UNCHANGED
```

**Changed:** one composition call, and one type at the registry seam. **Unchanged:** the gateway, the signing boundary, the grounding, the reasoning registry, the package assembly, the refusal shape, the external HTTP/`ExecutionPackage`/EP-protocol contracts.

### 1.4 · What that path *is*, said without euphemism

> **After G, the platform's only live authoring path runs the canonical runtime through the twelve-stage governance runner. That is operational cut-over of the authoring half.**

There is no third state in which repository canonicalization has happened and the live path has not moved. **`authoring-bridge.mjs` is not a library the gateway may call — ADR-0049 §2 states it as the gateway's only authoring path.** Re-composing it changes what the live service executes on the next request. This is the coupling §6 missed, and §1.3 is what it looks like when written as a path rather than as a list of edits.

---

## 2. QUESTION 2 — MIGRATED, RE-POINTED OR RETIRED; RC-3 AND RC-4 ANSWERED INDIVIDUALLY

**Recommendation: MIGRATED**, per ADR-0061 §6 step 4 — and migration means something different for each property, because the two properties fail for different reasons.

### 2.1 · RC-4 — replace-before-remove

**Reads** (`:38`, `:91`): `existsSync(src/capability.ts) && existsSync(src/runtime-entry-point-bridge.ts) && existsSync(authoring-bridge.mjs)`.
**Proposition:** *both paths coexist.* After G exactly one exists, by design and irreversibly.

Three disposals, and two are failures:

| Disposal | Result |
|---|---|
| Delete the property | replace-before-remove leaves the platform entirely, at the one operation that cannot be undone |
| Keep it as written | permanently RED on a state the ADR authorised — a control that can never be green again |
| Invert it (assert legacy absent) | **vacuously green forever**: nothing can put `capability.ts` back, so the check can never discriminate |

**Migrated form — RC-4′: replace-before-remove becomes an ORDERING claim evidenced, not a coexistence claim observed.**

1. the canonical entry point exists and is the one the live path reaches;
2. the legacy modules are absent;
3. **the equivalence evidence artefact (§4) exists, and the input digest it records matches the corpus the current canonical path is measured over.**

(3) is what stops (2) from becoming the vacuous green: without it RC-4′ says only *"the file is gone,"* which is true of a repository that never had it. With it, RC-4′ says *the replacement was demonstrated before the replaced was removed, and the demonstration is still about this code.*

### 2.2 · RC-3 — gateway not rerouted

**Reads** (`:84–86`): three literal strings over `ip-execute-gateway.mjs` + `authoring-bridge.mjs`.
**Proposition:** *the live path still routes to legacy.* After G that proposition is **false on purpose, with authority** — which is the state the ruling reserves to a person.

Two independent defects, and the second is §0(b):

- **α** it fires on a comment (its own fault proof);
- **β** it does **not** fire on Path B, the reroute that will actually happen.

**Migrated form — RC-3′: assert the routing, measured by reachability, plus the authority.**

1. the live path (`ip-execute-gateway.mjs` → `authoring-bridge.mjs`) **reaches** the canonical composition;
2. it does **not reach** `createFunctionalTestingEngine` / `FunctionalTestingOrchestrator` / `buildCatalogue`;
3. the ADR authorising the reroute is **ACCEPTED on disk**.

(1) and (2) are measured with the module-graph tool the programme already owns — `governance/capability/retirement-inventory.mjs`, which resolves the built tree, so shape report §9.5's *rebuilt-from-source* clause is load-bearing here too and must be stated in the gate's header.

**Re-anchored fault proofs:**

| Probe | Expected |
|---|---|
| revert the bridge to the legacy composition | **RED** |
| reroute while the authorising ADR is not ACCEPTED | **RED** |
| plant a comment naming the canonical bridge | **GREEN** — the probe that proves α is gone |

> **This is migration and it is the opposite of re-pointing to silence.** RC-3′ is strictly harder to satisfy than RC-3 and goes red on states RC-3 cannot see — including the one Part 3 would otherwise slip past it. The gate that detects the cut-over survives the cut-over, still gating, with a green that means something afterwards.

---

## 3. QUESTION 3 — AMENDMENT OR SUPERSESSION, AND WHICH THIS ADR IS

### 3.1 · ADR-0061 §6 steps 6 and 7 — reconciled by **AMENDMENT**

Its Decision (§4) is untouched and must stay untouched: the canonical becomes the authoritative implementation, bound to conditions 1–3 (triad preserved, one lifecycle, no fabricated stage results). What is wrong is **one scope boundary inside the migration strategy** — step 6 places *"re-point `authoring-bridge.mjs`"* in scope while step 7 places *"routing the live gateway"* out of scope, and per ADR-0049 §2 those are **one act for that file**. An amendment states the coupling and re-draws the boundary. It reverses nothing, and superseding an accepted architectural authority to correct a migration step would discard constitutional conditions the boundary error has nothing to do with.

The amendment also has to carry two things §6 does not currently say: that step 6 covers **both** bridge exports (§1.1), and that step 6 has an internal order (§5).

### 3.2 · ADR-0049 — reconciled by **SUPERSESSION**

Three grounds:

1. **Its Decision is reversed, not adjusted.** ADR-0049 §4 decides *"while not ready the legacy runtime MUST remain live"* and, in the same section, *"the gateway continues to route to the legacy engine."* G makes both false. An ADR whose decision is reversed is superseded.
2. **Its model conflates two cut-overs the repository has since separated.** *Which runtime authors the sealed package* is repository-internal, IP-only, and needs no Execution Plane. *Which runtime dispatches to the Execution Plane* needs E-2, a real signer and a real transport. **CU-2/CU-4/CU-5 belong wholly to the second.** RC-3 and RC-4 apply all ten preconditions to the first by accident of what they read — a file path and a string. Amending to carve an exception would leave **two live readings of CU-6**, which is the second-source-of-truth failure CLAUDE.md §5 forbids.
3. **Its readiness assessment has no measurement source** (§0a). A superseding ADR can re-found it; an amendment inherits it.

### 3.3 · What this ADR is

> **It SUPERSEDES ADR-0049 and AMENDS ADR-0061 §6.** One ADR, two dispositions, stated in its §8 dependency matrix. It supersedes nothing else, and it does not touch ADR-0061 §4.

---

## 4. QUESTION 4 — "BEHAVIOURAL EQUIVALENCE", DEFINED AS SOMETHING MEASURED

### 4.1 · Why it has never been defined

The acceptance banner requires it. CU-6 names it. Nothing computes it (§0a). **And the canonical is already known not to be output-identical**, on the record, in three places:

- ADR-0049 §5 — the canonical produces **abstract** packages by ADR-0039 design; the legacy produces **concrete** authored steps;
- ADR-0069 P-69.2 — four recorded reductions: `sharedSteps`, `businessGoal`, `automationReady`, `executionType`;
- shape report §6 — three capabilities G removes that nothing replaces (the independent review board, the coverage-remediation loop, continuous learning).

> **Equivalence-as-sameness is unsatisfiable by construction. That is why it was never written down** — not oversight. A precondition that cannot be met by any achievable state does not get defined; it gets deferred, and it has been deferred since 2026-07-29.

### 4.2 · The precedent, and why it is the right shape but the wrong subject

`FT-M6-CANONICAL-THROUGH-RUNNER-EQUIVALENCE-CERTIFICATION.md` (2026-07-30) measured equivalence as: deep-equality over all 13 domain results + `domainSequence` + `traceId`; the 7 bridge-consumed fields identical; 12 stages traversed with the triad applicable; one `certify()` returning `certified: true, firstRefusal: null`; deterministic and immutable — over an identical ADR-0044 fixture.

It measured **two arrangements of one runtime**. CU-6 asks about **two different runtimes**, and over the artefact the live path actually produces.

### 4.3 · The definition proposed — this is the ruling I need

> **Behavioural equivalence is a property of the artefact the gateway signs, over a declared corpus, modulo a declared difference set. A difference outside that set is a failure.**

Split CU-6, because its two halves have different evidence and only one of them gates G.

**CU-6a — AUTHORING EQUIVALENCE. In-reference, measurable now, gates G.**
Corpus: the F1 `contextRequest` fixtures the four bridge-executing gates already drive (§0c) — a corpus this repository already has and already trusts to certify the execution contract, the package-governance contract, the reasoning registry and intent conservation. For every fixture, the legacy body and the canonical body satisfy:

| | Property |
|---|---|
| **E-1** | identical `proceed`; when false, the refusal names the **same originating capability** and the same `failureCategory` |
| **E-2** | identical mandatory-section presence set (`MANDATORY_SECTIONS`) |
| **E-3** | identical operations — same count, same order, same `action`, same `selector`, same `testCaseId`. *Grounding is the bridge's own reasoning and is unchanged by Part 3, so any difference here is a defect, not a design difference* |
| **E-4** | identical coverage — same denominator (criteria count) and same covered requirement set |
| **E-5** | identical certification verdict, and when refused the same reason class |
| **E-6** | `schemaVersion`, `executionContextVersion`, `contractVersion` unchanged; and determinism — two runs over one input give the same `contentHash` |
| **E-7** | **the difference set is declared and closed.** The four ADR-0069 P-69.2 reductions and the three §6 absences are enumerated **in the ADR**. Equivalence holds iff every observed difference is in that enumeration. An unenumerated difference **fails**, and extending the enumeration is an ADR amendment — never a gate edit |

E-7 is the load-bearing clause. Without it "modulo known differences" is a phrase that absorbs whatever turns up; with it, the ADR carries a finite list and the gate refuses anything else.

**CU-6b — EXECUTION EQUIVALENCE. Real workload, against a live Execution Plane. Unchanged, external, E-2-bound. It does NOT gate G**, and the ADR must say why in one sentence: *G changes which runtime authors the package; the package is still sealed by the gateway and executed by the Execution Plane exactly as before, so nothing G does is observable to the Execution Plane except through the artefact CU-6a measures.*

### 4.4 · The strongest objection to my own recommendation, stated

**CU-6a cannot be measured after Part 1, because Part 1 deletes the path it compares against.** The corpus must run on both paths, so the equivalence evidence must be produced **before the first deletion**, on a tree where both exist — and RC-4′(3) then checks the recorded input digest still matches. **Section G as currently scoped contains no such step.** §5 sequences it in.

Second objection, also stated: **CU-6a is a genuine narrowing of what ADR-0049 required.** ADR-0049 says *"on real workloads"*; CU-6a says *on a declared in-reference corpus, for the authoring half only*. That narrowing is defensible on the §3.2(2) split, and it is exactly the kind of decision that is not this engine's to take — which is why it is a ruling and not a recommendation acted on.

---

## 5. QUESTION 5 — PARTS 1 AND 3 ARE ONE CHANGE, AND THE COUPLING §6 MISSED HAS AN ORDER INSIDE IT

**Measured.** `authoring-bridge.mjs:26` imports `buildCatalogue`, `createFunctionalTestingEngine` and `FunctionalTestingOrchestrator` — the three modules Part 1 deletes. There is no tree on which Part 1 has run, Part 3 has not, and the suite is green.

- **Part 1 without Part 3:** the bridge does not resolve; the platform's only authoring path is broken; the four gates that execute it throw rather than fail; 9 bridge tests fail; RC-4 red. That is not a partial G — it is a broken repository with no valid boundary.
- **Part 3 without Part 1:** available, and it is the **reversible** half. Both paths exist, so CU-6a is measurable, the gates run, and Part 1 afterwards removes something already proved unreached.

> **So the coupling §6 missed is not only that steps 6 and 7 are the same act. It is that step 6 has an internal order §6 never states: re-point before delete, because the re-point is what proves the delete is safe.** Replace-before-remove, applied to the step that was written as remove-then-re-point.

**And the order has a precondition of its own, from §0(b): Part 3 alone would reroute the live path with RC-3 green.** So the gate migration lands **first** — declaration and enforcement as one atomic change, which is D-012's rule and this programme's own discipline.

**Sequence the ADR should carry:**

```
ADR accepted  →  RC-3′ / RC-4′ migrated, fault proofs re-anchored   (gates first — D-012)
              →  CU-6a evidence produced on the CURRENT tree, both paths live
              →  PART 3   re-compose both bridge exports + re-type the registry harvest (§0d)
              →  CU-6a re-measured; RC-3′ green on the canonical routing, RC-4′(3) digest matches
              →  PART 1   delete the 9 orphans, 6 944 lines
              →  PART 2 / PART 4, suite-totals re-cut at 291 with the 218 named, closure re-baselined
```

---

## 6. WHAT IS OWED — FIVE RULINGS, EACH SEPARABLE

Stated so each can be accepted, rejected or amended on its own. **None is implemented.**

| # | Ruling | Recommendation | §|
|---|---|---|---|
| **R1** | The ADR's disposition | **Supersede ADR-0049; amend ADR-0061 §6.** Not the reverse, and ADR-0061 §4 untouched | §3 |
| **R2** | What behavioural equivalence means | **CU-6a / CU-6b split**; E-1…E-7 over the four gates' existing corpus; **E-7's difference set closed and held in the ADR** | §4 |
| **R3** | The gate's disposition | **Migrated.** RC-4′ = ordering-evidenced; RC-3′ = routing measured by reachability + authority recorded | §2 |
| **R4** | The sequence | **gates → evidence → Part 3 → re-measure → Part 1**, not 1 → 3 | §5 |
| **R5** | The readiness model | **Re-found it on measured evidence, or honestly re-scope the ten preconditions to what can be measured.** Leaving a fixture as the programme's cut-over authority is D-078 unrepaired | §0a |

**R5 is the one I would most expect to be argued with.** It is repairable inside this ADR or deferrable to its own; what it cannot be is left implicit, because §0(a) means every prior statement of the form *"nine of ten preconditions are unmet"* — including the one in `NEXT_ACTION.md` and in D-075 — was quoting a test fixture.

---

## 7. RECORDS WRITTEN, AND THE BOUNDARY

Written this session, none of them source, none of them the ADR:

| Register | Entry |
|---|---|
| **D-076** | **ADR-0061 §6's self-contradiction — recorded as the finding, not as the blockage.** Step 4 migrates this gate and precedes step 6 · step 7 puts routing the live gateway out of scope · step 6 puts re-pointing `authoring-bridge.mjs` in scope · per ADR-0049 §2 those are the same act for that file. One step includes what another excludes, and the acceptance banner does not authorise deleting legacy before behavioural equivalence. **D-035's shape inside an accepted retirement plan: a decision whose two halves were written against different pictures of one file, with nothing comparing them** |
| **D-077** | **§3's method limit, recorded beside the method.** The cut-over gate references no FTE symbol — a file path and the absence of a string. A symbol scan was structurally blind to both. **Not a miss; the method's boundary** — and it has at least five instances, since four governance surfaces import `authoring-bridge.mjs` by path and execute it (§0c) |
| **D-078** | **The readiness verdict has never been computed** — six call sites, all fixtures; *"nine of ten"* is a literal from 2026-07-29, and the only measurement the programme took said **8** (§0a) |
| **D-079** | **RC-3 detects a name, not a routing** — its own fault proof fires on a comment, and the recommended Path B leaves it green while the live path really has moved (§0b) |

`PROJECT_STATE.md` §9.12 and `NEXT_ACTION.md` name one action: **the ruling on R1–R5.**

**Nothing has been deleted, re-pointed or re-typed. No source file was opened for writing. G has not started.** The tree is at the same clean boundary §§7–10 left it at, plus this report and the four register entries.
