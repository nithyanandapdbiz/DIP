# ADR-0077 — Canonical Authoring Cut-over

**Status:** **ACCEPTED** · **Date:** 2026-08-05 · **Accepted:** 2026-08-05 · **Amended:** 2026-08-05 (§4.3, §5, §6 steps 4 and 5 — see §4.3.1; §4.5/§4.5.1; §4.7 seven→eight; **§7 and §8 — ADR-0044, see §7.1**)
**Supersedes:** [ADR-0049](ADR-0049-canonical-runtime-cutover.md) (Canonical Runtime Cut-over — M5), in full.
**Amends:** [ADR-0061](ADR-0061-canonical-functional-capability-runtime-adoption.md) §6, steps 6 and 7 only. **ADR-0061 §4 and its constitutional conditions 1–3 are untouched.**
**Governed by:** [01 — Platform Constitution](../architecture/01-platform-constitution.md); [12 — Capability Orchestration](../architecture/12-capability-orchestration.md); [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md)
**Evidence:** [`SECTION_G_SHAPE_REPORT.md`](../../program/SECTION_G_SHAPE_REPORT.md) §§1–10 · [`ADR_0049_SUPERSESSION_DESIGN_REPORT.md`](../../program/ADR_0049_SUPERSESSION_DESIGN_REPORT.md) §§0–6

> **ACCEPTANCE (2026-08-05, programme-owner authority; CHARTER §9).** Accepted as written, on the five rulings of [`ADR_0049_SUPERSESSION_DESIGN_REPORT.md`](../../program/ADR_0049_SUPERSESSION_DESIGN_REPORT.md) §6. Acceptance authorises the §6 migration sequence to begin — **gate-first, evidence-before-deletion, replace-before-remove** — and is itself precondition **CU-8** and property **RC-3′(3)**: the reroute is authorised because this line is on disk. **This ADR is FROZEN on acceptance.** New findings are recorded in `TECHNICAL_DEBT.md` and `PROJECT_STATE.md`, not written back into it; it is amended only where a finding changes the decision — and **§4.7's difference set is the one place where an amendment is the right answer rather than a last resort, per §4.5's E-7.**
>
> **AMENDMENT (2026-08-05, programme-owner authority; CHARTER §9). §6 step 3 WAS EXECUTED, CU-6a WAS MEASURED, AND IT DOES NOT HOLD — SO THE MIGRATION IS AMENDED AND THE DIFFERENCE SET IS NOT.**
>
> The CU-6a evidence exists: [`governance/capability/authoring-equivalence-evidence.json`](../../governance/capability/authoring-equivalence-evidence.json), six corpus entries, both paths, rebuilt tree, `corpusDigest 7d955bbe…e264`, `equivalent: false`. Two differences fall outside §4.7 and **E-7 made that a stop rather than a finding.** The ruling taken on it is recorded here because it is the first exercise of E-7's rule and it sets the precedent for the next one:
>
> **THE DIFFERENCES WERE NOT ADDED TO §4.7, AND THE GROUND IS THE ONE THING §4.7 IS FOR.** §4.7's seven are **capabilities the canonical path does not have and will not** — four ADR-0069 reductions and three shape-report absences. The two measured differences are **things the re-composition must supply and this ADR did not scope**. Admitting them would have declared a **defect** equivalent, which is precisely what E-7 exists to refuse: the difference set is the entire content of the word *equivalent*, so an entry that names a gap rather than a design boundary empties it. **§4.7 remains at seven. An eighth entry still requires an amendment to §4.7 specifically, and this is not one.**
>
> **WHAT IS AMENDED, AND WHY EACH CHANGES THE DECISION RATHER THAN CLARIFYING IT:** **§4.3** asserted publication was unchanged; it is not, and the obligation it omitted is a precondition of the cut-over working at all. **§6 step 4** was scoped to ten fields; the measured obligation is larger, and a step scoped smaller than its subject cannot discharge it. **§6 step 5** gains a defect obligation that must land with the re-composition rather than after it. **§5** gains the storage consequence of its own "measurable once" claim. **§4.4, §4.5, §4.6, §4.7, §4.8 and §4.9 are untouched**, as are the two narrowings and the readiness re-founding.
>
> **WHAT THIS ADR DOES, SAID BEFORE ANYTHING ELSE.** It authorises re-pointing the Intelligence Plane's **only live authoring path** from the legacy Functional Testing engine onto the canonical runtime. **After it executes, the platform's only live authoring path runs the canonical runtime through the twelve-stage governance runner. That is operational cut-over of the authoring half, and there is no third state in which repository canonicalization has happened and the live path has not moved.** ADR-0061 §6 wrote those as two steps, one in scope and one out; for `authoring-bridge.mjs` they are one act. An ADR that reverses ADR-0049 must say what it is doing, and this is what it is doing.
>
> **WHAT IT DOES NOT DO.** It does not reroute `/v1/execute` to the canonical **dispatch** path, does not bind a real signer, EP transport or locator resolver, does not delete `ip-execute-gateway.mjs`, and does not claim GA. **E-2 (a container runtime) is absent by measurement and stays absent.** No platform contract, Decision Type, connector SPI, `ExecutionPackage`, Execution-Plane protocol or signing behaviour is modified. **No implementation is performed here** — §6 is a migration strategy, not a change.

---

## 1. Problem

Section G — the retirement of the legacy Functional Testing runtime authorised by ADR-0061 §6 step 6 — cannot proceed, and the obstruction is a decision rather than an engineering gap.

**Its two halves are one change.** `authoring-bridge.mjs:26` imports `buildCatalogue`, `createFunctionalTestingEngine` and `FunctionalTestingOrchestrator` from the three modules G's Part 1 deletes. There is no tree on which Part 1 has run, Part 3 has not, and the suite is green. The bridge is not a library the gateway may call: **ADR-0049 §2 states the live path in its own words as `ip-execute-gateway.mjs → authoring-bridge.mjs`**, so re-composing it changes what the live service executes on the next request.

**The authority G runs under both authorises and forbids it.** ADR-0061 §6 **step 6** places *"re-point `authoring-bridge.mjs`"* in scope as repository canonicalization; §6 **step 7** places *"routing the live gateway"* out of scope — *"repository canonicalization does not perform it"*; §6 **step 4** names `verify-runtime-cutover-readiness` among five gates to **migrate**, and step 4 precedes step 6; and the acceptance banner states the ADR does **not** authorise deleting legacy before behavioural equivalence is verified. **One step includes what another excludes, and nothing in ADR-0061 compares them.**

**The control that would detect a premature reroute falls to G on Part 1 alone.** `verify-runtime-cutover-readiness.js` is registered `gating: true`. RC-4 requires `fs.existsSync(FTE/src/capability.ts)` — Part 1 deletes it. RC-3 fails when the bridge names the canonical entry-point bridge — Part 3 was expected to make it do so.

**And the authority that reserves the decision cannot compute its own verdict.** ADR-0049 gates cut-over on `assessCutoverReadiness`, whose ten preconditions include *behavioural equivalence demonstrated*. **`assessCutoverReadiness` has six call sites in this repository and all six are hardcoded literals inside its own reference conformance test.** No production code, no governance gate and no evidence generator ever calls it. The gate certifies that the assessor behaves correctly **given** evidence; nothing supplies it any.

So the problem to decide is not *may we delete these modules*. It is: **which runtime authors the sealed package, on what evidence, measured how, and detected by what.**

## 2. Context

### 2.1 The live path as it is

```
POST /v1/execute
  → ip-execute-gateway.mjs                     owns the signing key (INV-2); hashes and seals
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

**`reflectViaFTE` (gateway `:601–603`, bridge `:297–337`) drives the same `runFTE`.** ADR-0061 §6 step 6 names one function; **the file exports two, and both run the legacy engine.**

### 2.2 Two cut-overs, conflated by ADR-0049 and separated by the repository since

| | Which runtime **authors** the sealed package | Which runtime **dispatches** to the Execution Plane |
|---|---|---|
| Locus | `authoring-bridge.mjs` → the composition | `runtime-execution-spi.ts` → EP transport |
| Needs | nothing external | E-2, a real signer, a real transport, a live EP |
| Observable to the customer | only through the signed package body | the execution itself |
| ADR-0049 preconditions that apply | CU-1, CU-6, CU-7, approvals | **all ten**, CU-2/CU-4/CU-5 exclusively |

ADR-0049 was written when the canonical runtime could do neither. Since then ADR-0050 implemented the four M4 components in-reference with injected ports (`verify-runtime-enablement` RE-1…RE-8 PASS), and ADR-0061's FT-M6 reconciliation put the canonical composition **through** the twelve-stage governance runner. **The authoring half became reachable and the dispatch half did not, and ADR-0049 has no vocabulary for that.**

### 2.3 What is measured, and what the measurement replaced

Four measurements taken on a rebuilt tree at `683418e`, recorded in the debt register:

- **debt D-078 — the readiness verdict has never been computed.** *"Nine of ten preconditions unmet"* is the content of `currentEvidence()`, a fixture authored 2026-07-29. The only measurement the programme ever took — `FT-M5-CUTOVER-001`, same date, probing for docker/podman/nerdctl/containerd/kubectl/finch and the two `FTE_*` variables — recorded **eight**, because it measured CU-7 (*external contracts unchanged*) as **met**. Every prior statement of the form *"nine of ten"*, in `NEXT_ACTION.md`, in debt D-075 and in the rulings taken on them, was quoting a test fixture.
- **debt D-079 — RC-3 detects a name, not a routing.** It matches three literal strings over two files' raw text. Its own fault proof (`record-fault-proofs.js:1521–1528`) turns it red by planting a **comment**. And the composition Part 3 must actually use, `createCanonicalRunnerCapability(…).runThroughRunner(…)`, matches none of the three — **so the reroute that will really happen leaves the gate GREEN.**
- **debt D-077 — the symbol-scan method has a boundary, and at least five surfaces sit in it.** The cut-over gate references no FTE symbol: a file **path** and the **absence** of a string. Four governance surfaces import `authoring-bridge.mjs` **by path** and then **execute** it — `run-intent-conservation.mjs:12,38` (itself one of §6 step 4's five gates), `verify-execution-contract.js:84,111,228,249`, `verify-package-governance.js:95,99,457`, `verify-reasoning-registry.js:98,134,385,491` — plus `record-fault-proofs.js:1524` and `authoring-bridge.test.mjs`'s nine tests. **None is a symbol reference to a retiring module, so none appears in the four re-pointing obligations; all six are Part 3's blast radius.**
- **The fourth obligation is inside Part 3, not beside it.** `registry/reasoning-publication.ts:36` imports `type EngineState`; `:105` carries it as `ReasoningHarvest.state`, read at **8 sites over 10 fields** (`story`, `acceptanceCriteria`, `requirements`, `dependencies`, `risks`, `complexity`, `ambiguities`, `gaps`, `reviewApproved`, `authoringCoverage`), and `authoring-bridge.mjs:551–568` is its only live caller. Re-composing the bridge means supplying those ten from `CanonicalCapabilityResult`'s fourteen domain results. **They land together or neither lands.**

### 2.4 What the canonical is already known not to reproduce

Recorded, not discovered: ADR-0049 §5 (the canonical authors **abstract** packages by ADR-0039 design, the legacy **concrete** steps); ADR-0069 P-69.2's four reductions (`sharedSteps`, `businessGoal`, `automationReady`, `executionType`); and shape report §6's three capabilities with no replacement — the independent review board, the coverage-remediation loop, continuous learning. **Equivalence-as-sameness is unsatisfiable by construction, which is why the precondition was never defined.**

## 3. Alternatives

**A. Proceed with G's Part 1 and leave the bridge on legacy.** Rejected — **not available.** The bridge imports all three modules Part 1 deletes; the result is a repository with no working authoring path, four gates that *throw* rather than fail, and no valid boundary between the parts.

**B. Defer G behind ADR-0061 §6 steps 4 and 5.** Rejected as a resolution, though correct as an observation. Step 4 **is** the migration of this gate, and it cannot be performed without first deciding what RC-3 and RC-4 become after a reroute they were written to forbid. Deferring restates the question in the step that contains it.

**C. Amend ADR-0049 to carve an exception for the authoring half.** Rejected. It leaves **two live readings of CU-6** — one requiring real workloads, one not — and a second source of truth for a precondition is the failure CLAUDE.md §5 exists to prevent. It also inherits the unmeasured readiness model rather than repairing it.

**D. Delete `verify-runtime-cutover-readiness`, or re-point it, to restore green.** Rejected, and it is the alternative this ADR most needs to name. It would retire a control at the exact moment it detects the thing it was built for. **A gate going vacuously green is a control that stopped measuring; a gate going correctly red and then re-pointed is a control that was overruled** — and the second is a decision a person takes, not a repair an engine performs. Taking it silently is the manufactured confidence R-13.4 and R-13.7 forbid, spent on the one operation in this programme that cannot be undone.

**E. Supersede ADR-0049; amend ADR-0061 §6; re-found readiness on measurement; define equivalence for the authoring half; migrate the gate rather than retire it; and sequence the change so the control lands before the act it detects. (Chosen.)** It is the only route on which the deletion is authorised by something other than the instruction that ordered it, and on which the gate that would have detected an unauthorised reroute is still gating afterwards.

## 4. Decision

### 4.1 · What this ADR is

**It SUPERSEDES ADR-0049 in full and AMENDS ADR-0061 §6, steps 6 and 7 only.**

ADR-0049 is superseded rather than amended on three grounds: its Decision (§4) — *"while not ready the legacy runtime MUST remain live"*, *"the gateway continues to route to the legacy engine"* — is **reversed, not adjusted**; its ten-precondition model conflates the two cut-overs of §2.2, which no amendment can separate without leaving two readings of CU-6; and its readiness assessment has no measurement source, which a superseding ADR can re-found and an amendment would inherit. **ADR-0049 is PROPOSED and was never accepted, but its gate is registered `gating: true` and the programme has run under it as the reserving authority for a year of programme time. Superseding it is about that live control, not about a status.**

ADR-0061 is amended rather than superseded because its Decision is correct and load-bearing: the canonical becomes the authoritative implementation, bound to conditions 1–3 (governance triad preserved, exactly one lifecycle, no fabricated stage results). **What is wrong is one scope boundary inside a migration strategy.** Superseding an accepted architectural authority to correct a step boundary would discard constitutional conditions the boundary error has nothing to do with.

### 4.2 · The amendment to ADR-0061 §6

Three sentences §6 does not currently carry:

1. **Steps 6 and 7 are one act for `authoring-bridge.mjs`.** Re-pointing the bridge *is* routing the live authoring path, because ADR-0049 §2 states the bridge as the gateway's only authoring path. Step 7's *"out of scope"* stands for **dispatch** routing and for nothing else.
2. **Step 6 covers both bridge exports.** `authorViaFTE` **and** `reflectViaFTE`; the second drives the same `runFTE` on the post-execution pass. An amendment naming one would repeat the defect it corrects.
3. **Step 6 has an internal order, and it is the reverse of the one written.** §6 reads *retire and delete … re-point `authoring-bridge.mjs`*; that order is unexecutable, because the bridge imports what the deletion removes. **Re-point first: the re-point is what proves the delete is safe.** Replace-before-remove, applied to the step written as remove-then-re-point.

### 4.3 · What the live path becomes

```
POST /v1/execute
  → ip-execute-gateway.mjs                                       UNCHANGED — signs, seals, owns the key
  → authoring-bridge.mjs  authorViaFTE({ … })                    same signature, same return shape
      ├ build CanonicalCapabilityInput from the F1 contextRequest
      │    story + acceptance-criteria TEXT uncut (ADR-0075 P-75.2), as projectShim serves it today;
      │    repository/automation/reporting models, candidates and rules from the tenant profile
      ├ createCanonicalRunnerCapability(deps).runThroughRunner(input, ctx)
      │    → runCapability → 12 stages → governance triad (4–6) → certify → CanonicalCapabilityResult
      ├ groundOperations(…) against contextRequest.selectorDiscovery      the bridge's own reasoning; its
      │                                                                   INPUT VOCABULARY changes — §6 step 5
      ├ publishReasoningResults(openReasoningRegistry(…), harvest)        harvest.state RE-TYPED **and
      │                                                                   harvest.audit RE-FOUNDED** — §4.3.1
      ├ assembleExecutionPackage(registry, …)                            UNCHANGED — ADR-0067
      └ body  |  registryRefusal(…)                                      UNCHANGED shape
  → gateway hashes + signs the body                                      UNCHANGED
```

#### 4.3.1 · Publication is NOT unchanged — the registry consumes `audit` as PROOF, and re-typing the harvest supplies none

> **AMENDED 2026-08-05.** The line above previously read `publishReasoningResults(…) — harvest.state RE-TYPED` and nothing else, and that was **wrong in a way only measurement could show.**

**The registry does not only consume the harvest's VALUES. It consumes `harvest.audit` as EVIDENCE THAT THE REASONING HAPPENED, and it refuses any capability that publishes without it.** `reasoning-publication.ts:151` matches each capability's declared evidence names against the events the run actually recorded — *"the declared evidence names are matched against the events the run actually recorded, and only what was observed is returned"* — and `reasoning-result-registry.ts:375` fails any capability whose evidence list is empty, with `CERTIFICATION_FAILURE` and the root cause *"an output nothing proves was produced is a claim."*

**That design is correct and is not weakened by this amendment.** It is the property that stops a capability satisfying a shape without doing the work. What was wrong was §4.3's accounting: **re-typing `ReasoningHarvest.state` supplies the values and supplies no evidence**, so a re-composition performed exactly as §4.3 described produces a run in which every audit-evidenced capability is refused.

**MEASURED, ON A REBUILT TREE, BOTH PATHS (§6 step 3):**

| | Legacy | Canonical-through-runner |
|---|---|---|
| audit entries | **515**, 180 distinct events | **12**, 1 distinct event |
| event vocabulary | `agent.<id>.invoked` / `<id>.decided` / stage events | `stage.completed` only |
| declared audit-derived evidence names matched | **16 of 18** | **0 of 18** |
| first capability refused | none | `requirement-intelligence` |
| package body projected | yes | **none, on every corpus entry** |

**THE DECLARED EVIDENCE NAMES ARE LEGACY AGENT IDENTITIES.** `story.requirement-extraction`, `test.positive`, `automation.generation` and the rest match `agent.story.requirement-extraction.invoked` by substring. **They are a declaration of which legacy AGENTS must have been invoked** — the fifteen agents debt D-035 named — and §6 step 6 deletes every one of them. So the obligation is not incidental to the re-composition: **the evidence model is bound to the runtime being retired, and it does not survive the retirement.**

**AND IT WAS ALREADY PARTLY ASPIRATIONAL, WHICH BOUNDS THE CLAIM RATHER THAN EXCUSING IT.** Two of the eighteen — `selector-intelligence.bestExecutable` and `selector-intelligence.certifyAuthoring`, declared by `grounded-authoring` — are matched by **neither** path, because nothing in the repository emits them; that capability passes on `composedFrom(…)` evidence instead, and the two names sit unenforced in `unobservedEvidence`. **The escape route this exposes is named here so that taking it is a decision rather than a discovery:** switching a publisher from `auditEvidence(…)` to `composedFrom(…)` clears the non-empty gate without any audit at all. That is debt **D-041**'s pressure with a ready-made mechanism, and §6 step 4 forbids it as a general repair.

**THE OBLIGATION, STATED:** the re-composition must leave every capability that publishes into the Reasoning Result Registry able to **prove it ran, from what the canonical composition actually recorded** — not from a name asserted on its behalf. **No event may be emitted that names work the emitting composition did not perform.** That is ADR-0061 §4 condition 3 (no fabricated stage results) applied to the evidence channel, and it is what makes route (c) of §6 step 4 inadmissible.

**The Runtime Entry-Point Bridge is NOT the successor**, on three measured grounds: `createRuntimeEntryPointBridge(...).execute()` returns a `RuntimeExecutionOutcome` where the gateway's contract is a package **body** it hashes and signs; it **dispatches** (`runtime-entry-point-bridge.ts:112`), which requires the unbound CU-4/CU-5 real signer and transport; and it **throws** on a refused lifecycle (`:103–108`) where the live path returns a typed `registryRefusal` carrying the originating capability and the blocked chain. It remains the dispatch-side entry point and is untouched by this ADR.

**Changed:** one composition call and one type at the registry seam. **Unchanged:** the gateway, the signing boundary, the grounding, the reasoning registry, the package assembly, the refusal shape, and the external HTTP/CLI/`ExecutionPackage`/EP-protocol/signing contracts.

### 4.4 · The two cut-overs are separated, and only the first is authorised here

**Authoring cut-over** — which runtime composes the package body the gateway signs. **Authorised by this ADR**, gated on §4.5's re-founded readiness model.
**Dispatch cut-over** — which runtime transmits to the Execution Plane. **NOT authorised here.** It remains external and E-2-bound, and it inherits ADR-0049's preconditions for the pieces that genuinely belong to it.

### 4.5 · Behavioural equivalence, defined as something measured

> **Behavioural equivalence is a property of the artefact the gateway signs, over a declared corpus, modulo a declared difference set. A difference outside that set is a failure.**

**CU-6a — AUTHORING EQUIVALENCE. In-reference, measurable now, gates the authoring cut-over.**

Corpus: the F1 `contextRequest` fixtures the four bridge-executing gates of §2.3 already drive — a corpus this repository already has and already trusts to certify the execution contract, the package-governance contract, the reasoning registry and intent conservation. For every fixture, the legacy body and the canonical body satisfy:

| | Property |
|---|---|
| **E-1** | identical `proceed`; when false, the refusal names the **same originating capability** and the same `failureCategory` |
| **E-2** | identical mandatory-section presence set (`MANDATORY_SECTIONS`) |
| **E-3′** | *(re-founded 2026-08-05 — see §4.5.1)* the operation set is **CONFORMANT**, not identical: no action kind the legacy vocabulary lacks; every operation's selector is drawn from that entry's `SelectorDiscovery`; every `testCaseId` resolves to a case that side authored; and every authored case with a groundable step is represented by at least one operation |
| **E-4′** | *(re-founded 2026-08-05 — see §4.5.1)* **(1)** identical criterion count — **KNOWN-SUBSUMED by (2), kept deliberately** · **(2)** identical covered criterion set **by statement, not by identifier** · **(3)** identical coverage-dimension NAME set, and **on the ADOPTED side only**, every dimension is either measured or carries a stated `unmeasurable` reason. The legacy side's reasons are **measured and reported, never gated** |
| **E-5** | identical certification verdict, and when refused the same reason class |
| **E-6** | `schemaVersion`, `executionContextVersion` and `contractVersion` unchanged; and determinism — two runs over one input give the same `contentHash` |
| **E-7** | **the difference set is declared and closed.** ADR-0069 P-69.2's four reductions (`sharedSteps`, `businessGoal`, `automationReady`, `executionType`) and shape report §6's three absences are enumerated in §4.7 of this ADR. Equivalence holds **iff every observed difference is in that enumeration** |

> **E-7's RULE, WHICH IS PART OF THE DECISION AND NOT COMMENTARY:**
>
> **Extending the difference set is an AMENDMENT to this ADR. It is never a gate edit.**
>
> When an eighth difference appears — and one will — the cheap resolution will be to widen the gate's tolerance by a line, in a file no reviewer reads as a decision. That is debt **D-041's** standing pressure (*a gate that goes red is expensive, so there is permanent pressure to weaken gates rather than answer them*) arriving at the one place where yielding to it would be **invisible**: the difference set is the entire content of "equivalent", so a gate that quietly grows it has redefined the precondition without anyone deciding to. **A difference not in §4.7 fails CU-6a, and the only way to make it pass is to amend §4.7.**

#### 4.5.1 · Why E-3 and E-4 were re-founded — CONTRACT properties and CONTENT-VOLUME properties are not the same kind of claim

> **AMENDED 2026-08-05.** E-3 read *"identical operations — same count, same order, same `action`, same `selector`, same `testCaseId`"* and E-4 *"identical coverage."* **Measured, both compositions, one tree: E-3 could not be satisfied on any corpus entry that grounded an operation, and it PASSED on exactly the three that grounded none.** Debt D-092.

**THE DEFECT, IN ONE INFERENCE, AND IT IS VISIBLE IN E-3's OWN JUSTIFYING CLAUSE.** It read: *"Grounding is the bridge's own reasoning and is unchanged by the re-composition, **so** a difference here is a defect, not a design difference."* That is **f unchanged ⇒ f(x) unchanged**, which holds only if `x` is unchanged — and `x` is the test cases, **the output of the runtime being swapped.** The ADR reasoned about the function and forgot the argument. It is D-087's question — *what does this step's subject CONSUME, as opposed to what does it PRODUCE?* — unasked in the clause that most needed it, and unlike D-087's four instances the cost here was not a rework cycle but an unsatisfiable gate on an irreversible operation.

**WHAT THE MEASUREMENT SHOWED.** From ONE acceptance criterion: legacy **22** test cases → **234** operations; canonical **2** → **4**. Ids `tc-REQ-1-r1-accessibility-1` against `REQ-1:sc:0:pos`. So `same testCaseId` required the two runtimes to author identically named cases in identical numbers — which is the abstract-versus-concrete difference **§2.4 already recorded before this ADR was drafted** (ADR-0049 §5: the canonical authors abstract packages by ADR-0039 design, the legacy concrete steps).

**AND E-3 PASSED ONLY WHERE IT MEASURED NOTHING** — the three entries with no `SelectorDiscovery`, where both sides ground zero operations. **A vacuous green (debt D-011, D-015) inside the precondition that gates the irreversible operation.**

**§4.1 NAMED THIS EXACT ERROR AND §4.5 REINTRODUCED IT ONE LEVEL IN.** §4.1: *"Equivalence-as-sameness is unsatisfiable by construction, which is why the precondition was never defined."* §4.5 replaced sameness with a measurable property — and E-3 restored sameness for one property, against the one input the cut-over changes by design.

**THE BASIS OF THE RE-FOUNDING, WHICH IS A DISTINCTION AND NOT A RELAXATION:**

> **E-1, E-2, E-5 and E-6 measure the artefact's CONTRACT. E-3 and E-4 measure its CONTENT VOLUME, which a differently-designed runtime necessarily produces differently. A content-volume property can be a FLOOR or a RATIO — never an IDENTITY.**

**THE PREMISE IS UNCHANGED AND IS SATISFIED.** §4.5's definition — *a property of the artefact the gateway signs, over a declared corpus, modulo a declared difference set* — is sound, and **E-1, E-2, E-5 and E-6 hold on every corpus entry today.** What is re-founded is two properties, not the definition.

**NO THRESHOLD IS INTRODUCED, DELIBERATELY.** Two candidate forms were measured and REJECTED as gates: the operation ratio (**1.7%** and **2.6%**) and discovered-surface coverage (legacy **3 of 4** controls, canonical **1 of 4**). Both capture the magnitude E-3′ does not, and both need a bar. **A bar set today would be reverse-engineered from the two numbers in front of us, which is precisely the error §4.5 made the first time.** Both are therefore **REPORTED IN THE EVIDENCE ARTEFACT AS MEASURED FIGURES WITH NO PASS/FAIL**, so a later bar can be set from data rather than from feel.

##### E-3′ and E-4′ carry an ANTI-VACUOUS PROPERTY, and it is a property rather than a note

> **(i) NOT APPLICABLE IS NOT PASS.** A corpus entry whose `SelectorDiscovery` bears no control with a selector is **NOT APPLICABLE** to E-3′ and is recorded as such — never as satisfied.
> **(ii) A GROUNDABLE ENTRY YIELDING AN EMPTY OPERATION SET FAILS E-3′.** It does not pass it.
> **(iii) CU-6a IS SATISFIED ONLY IF AT LEAST ONE CORPUS ENTRY IS APPLICABLE TO E-3′.**
>
> **(iii) is what stops a corpus being narrowed into satisfying the precondition** — the failure mode §6 step 3 already forbids for the corpus, stated here for the property. All three are **C-0.4** (*NOT MEASURED is FAIL*) applied to an E-property, not a new rule. The equivalent for E-4′: an entry in which neither side measures a dimension is NOT APPLICABLE, and a dimension declared `unmeasurable` counts as measured **only if it carries a stated reason** — the reason string is the anti-vacuous device the type already provides.

##### E-4′(2) is asserted on STATEMENTS because cardinality hid a real divergence

**Measured before asserting, on the condition that E-4′(2) not rest on cardinality — and the measurement found what cardinality concealed.** On `intent-conservation` the criterion statements match **exactly, in set and in order** (3 and 3, identical text). On the address fixtures the cardinality also agrees (1 and 1) and the statement text is identical — **but the two runtimes CLASSIFY that same sentence differently: the legacy calls it a `business-rule`, the canonical an `acceptance-criterion`.** Legacy acceptance-criterion statements: **0**. Canonical: **1**.

**A covered-set identity resting on cardinality would have reported PASS over a classification divergence**, which is E-3's error in a smaller field. **It also explains E-4's dimension difference measured earlier:** `byRequirementKind('acceptance-criteria', …)` and `byRequirementKind('business-rule', …)` route on exactly that `kind`, so the same sentence lands in a different dimension on each side.

> **RULED 2026-08-05 — `Requirement.kind` MEANS PROVENANCE, AND THIS RULING FOUNDS A MEANING THAT DID NOT EXIST (debt D-094).**
>
> **It is not a finding that one implementation drifted from a standard, because there was no standard.** `Requirement.kind` is a four-way union in `model.ts` with **no ADR, no architecture document and no criterion** behind it; ADR-0039 §88 names *"business-rule identification"* as a capability and defines nothing; and `contract/execution-package.ts` does not mention `kind` at all, though it crosses the boundary inside `metadata.storyAnalysis.requirements[].kind`. **Both runtimes were implementations of an unratified field.**
>
> **THE CANONICAL'S CONSTRUCTION IS CORRECT — provenance, two independent lists, no reclassification — on three grounds. (i)** The legacy's reclassification **destroys information**: overwriting `acceptance-criterion` with `business-rule` on a modal marker is *why* its `acceptance-criteria` coverage dimension reports `0/0, applicable: false`. **A classification that empties a measurement in order to record a different fact is losing one to state another.** **(ii)** The alternative reintroduces **modal-marker string matching into a certified domain**, which §6 step 5a's binding prohibition forbids by name. **(iii)** The sentence is genuinely both, and **a model that must choose is wrong about what it models.**
>
> **CONSEQUENCE FOR E-4′(2): the covered criterion set is the CRITERIA LIST, not `requirements` filtered by `kind`.** Reading the criterion set off a provenance field was the conflation this ruling ends. **The canonical requires no change — it already conforms to the meaning now founded.**

**E-4′(1) IS KNOWN-SUBSUMED BY E-4′(2), AND IS KEPT.** Comparing sorted criterion statements implies comparing their count, so (1) cannot fail independently of (2). It is **retained deliberately and labelled**, on the ground that **(1) is §4.5's own denominator clause** — *"same denominator (the criterion count)"* — which survived the re-founding **by name**. Removing it would leave the amended §4.5 lacking a sentence the original carried, and a reader diffing the two would find a clause deleted with no ruling behind it. **A redundant conjunct that is honest about being redundant is cheaper than an amendment that quietly drops one**, and the redundancy is recorded here rather than discovered by someone wondering why a property never fires.

##### E-4′(3) is asserted of the ADOPTED side only, because the anti-vacuous device caught the runtime being RETIRED

**Measured, all six corpus entries: the canonical composition carries ZERO dimensions marked not-applicable without a stated reason. The legacy carries TWO TO FOUR** — `acceptance-criteria`, `workflow`, and on two entries `business-rule`, `risk`, `boundary`. Asserted symmetrically, E-4′(3) fails on every entry **because of the runtime being deleted at §6 step 6.**

**RULED 2026-08-05: E-4′(3)'s reason clause binds the ADOPTED side. The legacy side is MEASURED AND REPORTED, never gated.** Symmetric assertion would demand a property of a runtime nobody runs after step 6, and **holding the cut-over on a defect in the thing being retired inverts the point of the cut-over.** The dimension NAME-set half stays symmetric — that is a comparison, not a quality bar, and it holds on all six entries today.

**This is not a weakening and the distinction matters:** the clause still cannot pass vacuously, because the side it binds is the side that will exist. What is dropped is a requirement that the *past* meet a standard the *future* is being held to.

##### The finding that reframes E-4, recorded because every prior framing of it — including this ADR's — assumed a reduction

**`canonical ⊆ legacy` IS FALSE, AND IT IS FALSE IN THE CANONICAL'S FAVOUR.** The canonical composition measures the `acceptance-criteria` dimension (**0 of 1**, a stated shortfall); the legacy reports that dimension `0/0, applicable: false` — it does not measure it at all. **The coverage difference is not "the canonical measures less"; it is a DIFFERENT SUBSET, and on the criterion dimension the canonical is the more honest of the two.** The dimension NAME set is identical on all six corpus entries; what differs is which are measured. E-4′(3) is written against that measured shape rather than against the assumed reduction.

**CU-6b — EXECUTION EQUIVALENCE. Real workload, against a live Execution Plane. Unchanged, external, E-2-bound. It does NOT gate the authoring cut-over**, because the authoring cut-over changes which runtime *composes* the package; the package is still sealed by the gateway and executed by the Execution Plane exactly as before, so **nothing it does is observable to the Execution Plane except through the artefact CU-6a measures.**

**THE NARROWING, RECORDED PLAINLY RATHER THAN SLIPPED.** ADR-0049 required behavioural equivalence *"demonstrated against the legacy runtime, on real workloads."* **CU-6a requires it over a declared in-reference corpus, for the authoring half only.** That is narrower than what ADR-0049 asked for. It is defensible on §2.2's separation — the preconditions ADR-0049 wrote for dispatch were applied to authoring by accident of what RC-3 and RC-4 happen to read, a file path and a string — and it is a **narrowing**, stated here so that no later reader finds it by diffing two ADRs.

### 4.6 · The readiness model is re-founded, inside this ADR

**A superseding ADR that inherits an unmeasured readiness model supersedes nothing that matters.** `assessCutoverReadiness` is re-founded on three rules:

**(i) A supplied boolean is no longer representable.** `CutoverReadinessInput`'s ten `readonly …: boolean` fields are replaced by evidence records — each precondition carries a **state** and a **named source**:

```
state:  'measured-met' | 'measured-unmet' | 'declared' | 'not-measured'
source: the generator, gate or artefact the state was read from — mandatory, and empty is not a value
```

`ready` requires every gating precondition to be `measured-met` and every required declaration to be present. **`not-measured` can never contribute to ready** (C-0.4: NOT MEASURED is FAIL). This is DECISIONS **D-012** in its preferred form — *derive the declaration from its registered readers, so an unenforced field is unrepresentable* — applied to the model whose unenforced field was the readiness verdict itself.

**(ii) Each of the ten is re-scoped to what can be measured, and where there is no measurement source, that is said rather than carried.**

| | Precondition | Class | Source | Gates |
|---|---|---|---|---|
| **CU-1** | canonical bridge certified | **measured** | `verify-canonical-runtime-integration` | authoring + dispatch |
| **CU-2** | real runtime environment (E-2) | **not measured — absent by probe** | the deployment probe under `governance/deployment/` | dispatch only |
| **CU-3** | request translator **implemented** | **measured** | `verify-runtime-enablement` RE-1/RE-2 | authoring + dispatch |
| **CU-3b** | its real providers **bound** | **not measured — deployment-time** | none in this repository | dispatch only |
| **CU-4** | EP-dispatch adapter implemented | **measured** | `verify-runtime-enablement` | dispatch only |
| **CU-4b/5b** | real EP adapter + transport **bound** | **not measured — infrastructure** | none in this repository | dispatch only |
| **CU-6a** | authoring equivalence | **measured** | the CU-6a evidence artefact (§6 step 3) | authoring |
| **CU-6b** | execution equivalence, real workload | **not measured — requires CU-2** | none in this repository | dispatch only |
| **CU-7** | external contracts unchanged | **measured** | `verify-contract-compatibility`, `verify-http-surface-parity`, `verify-execution-contract` | authoring + dispatch |
| **CU-8** | governance approval | **declared, presence measured** | **this ADR's acceptance line on disk** | authoring + dispatch |
| **CU-9/CU-10** | stakeholder + executive approval | **declared, no repository source** | recorded declarations | **dispatch only** — see below |

**CU-3, CU-4 and CU-5 were one boolean carrying two claims** — *the component exists* and *its real binding is present*. The first is measurable and met; the second is infrastructure. A single flag that means both can only ever be false, which is what the fixture recorded and what nobody could act on. They are split.

**(iii) Two verdicts, not one.** `authoring-cutover-ready` / `authoring-cutover-not-ready-legacy-live` / `inconsistent-premature-authoring-cutover`, and the dispatch trio alongside. The `inconsistent-premature-cutover` semantics are preserved for both: **a not-ready state with the corresponding path already moved is an inconsistency the assessment detects.**

**A DECISION TAKEN INSIDE THE RE-FOUNDING, FLAGGED SO IT IS NOT ABSORBED: CU-9 and CU-10 gate the DISPATCH cut-over and not the authoring one.** The ground is that the authoring cut-over changes no external contract and no customer-observable behaviour outside §4.7's enumerated difference set, while dispatch changes what runs against the customer's application. **For the authoring cut-over, the acceptance of this ADR (CU-8) is the approval.** This is the second narrowing of ADR-0049 in this document, and it is stated as one.

### 4.7 · The declared difference set — closed

> **AMENDED 2026-08-05 — SEVEN TO EIGHT. THE FIRST ENTRY ADMITTED SINCE DRAFTING, AND IT IS NOT A NEW DIFFERENCE.**
>
> Entry 8 is the abstract-versus-concrete authoring difference. **§2.4 already records it, quoting ADR-0049 §5, before this ADR was drafted** — *the canonical authors abstract packages by ADR-0039 design, the legacy concrete steps.* It was known, written down, and left out of §4.7.
>
> **WHY IT WAS OMITTED, WHICH IS THE FINDING RATHER THAN THE OMISSION: §4.7 enumerates CAPABILITY LOSSES and this is a DESIGN DIFFERENCE.** The other seven are things the canonical path does not *have* — four reductions and three absences. This is a thing it does *differently and deliberately*, by a ratified design decision. Nothing in §4.7's shape invited it, so it went unenumerated — **and that omission is what left two conformance tests unclassifiable**, asserting a shape the adopted runtime does not produce, with no declared difference to point at.
>
> **The route is E-7's, and E-7 is why this took an amendment rather than a gate edit.** A difference outside §4.7 fails CU-6a; the only way to make it pass is to amend §4.7. That is what this is.

Equivalence under CU-6a holds only if every observed difference is one of these eight:

1. `sharedSteps` — not produced by the canonical composition (ADR-0069 P-69.2)
2. `businessGoal` — as above
3. `automationReady` — as above
4. `executionType` — as above
5. **the independent review board** — fourteen reviewers, `ai=0 tool=0`, `ReviewSnapshot` frozen by type. **After the retirement the platform has no independent review mechanism at all**; its port is owed under ADR-0076 and is not a precondition of this ADR (debt D-070a)
6. **the coverage-remediation loop** (legacy stage 7) — the canonical path measures coverage and relays it, and does not re-author on a shortfall
7. **continuous learning** — no canonical consumer
8. **ABSTRACT-VERSUS-CONCRETE AUTHORING** *(added by amendment 2026-08-05)* — **the canonical composition authors one test case per design scenario, with abstract precondition/verify steps, and its grounded operation volume therefore does not vary with input the way the legacy's does.** The legacy authors concrete UI sequences per technique — measured, from ONE acceptance criterion: **legacy 22 test cases → 234 operations emitting `navigate`/`fill`/`click`/`assertText`; canonical 2 → 4 emitting `navigate`/`assertText`.** Ratified by ADR-0039 (the thirteen domains) and recorded in §2.4 quoting ADR-0049 §5. **Unlike entries 1–7 this is a DESIGN difference rather than a capability loss**, which is why §4.7's original shape did not invite it. **It is DECLARED, not tolerated: E-3′ still asserts conformance over it** — no action kind the legacy vocabulary lacks, every selector discovered, every `testCaseId` resolving, every authored case represented — so an operation set that is merely *smaller* is declared, while one that is *malformed* still fails.

**Nothing else. A ninth entry requires an amendment to this section.**

### 4.8 · The gate is migrated, not retired and not re-pointed to silence

`verify-runtime-cutover-readiness` is migrated per ADR-0061 §6 step 4. Six of its eight properties are unchanged. Two are re-founded because their propositions invert at cut-over, and one is added because §4.6 gave the model a measurement source it never had.

**RC-4′ — replace-before-remove becomes an ORDERING claim evidenced, not a coexistence claim observed.** Its predecessor asserted *both paths exist*, which after the retirement is false by design; deleting it discards replace-before-remove at the one irreversible operation, keeping it makes it permanently red, and inverting it to *legacy is absent* is vacuously green forever, since nothing can put the modules back. RC-4′ asserts all three of:

1. the canonical entry point exists and is the one the live path reaches;
2. the legacy modules are absent;
3. **the CU-6a evidence artefact exists and the input digest it records matches the corpus the current canonical path is measured over.**

(3) is what stops (2) from being a vacuous green: without it RC-4′ says only *"the file is gone"*, which is equally true of a repository that never had it. With it, RC-4′ says *the replacement was demonstrated before the replaced was removed, and the demonstration is still about this code.*

**RC-3′ — assert the routing, measured by reachability, plus the authority.** Its predecessor matched three literal strings, so it fires on a comment and **does not fire on the composition §4.3 adopts**. RC-3′ asserts:

1. the live path (`ip-execute-gateway.mjs` → `authoring-bridge.mjs`) **reaches** the canonical composition;
2. it does **not reach** `createFunctionalTestingEngine`, `FunctionalTestingOrchestrator` or `buildCatalogue`;
3. **this ADR is ACCEPTED on disk.**

(1) and (2) are measured with the module-graph tool the programme already owns, `retirement-inventory.mjs`, **on a rebuilt tree** — shape report §9.5 established that an unbuilt tree makes that tool report zero obligations with full confidence, and the gate's header must carry the requirement.

**RC-9 — the readiness verdict is computed from measured evidence and recorded.** The gate reads the sources named in §4.6's table, calls the re-founded assessor, and writes the verdict into its evidence artefact. This is the property whose absence is debt D-078.

**Re-anchored fault proofs**, replacing `runtime-cutover-premature-gateway-reroute`:

| Probe | Expected |
|---|---|
| revert `authoring-bridge.mjs` to the legacy composition | **RED** (RC-3′) |
| reroute while this ADR is not ACCEPTED | **RED** (RC-3′) |
| plant a comment naming the canonical bridge | **GREEN** — the probe that proves the name-match defect is gone |
| remove or stale the CU-6a evidence artefact | **RED** (RC-4′) |
| supply the assessor a precondition with no source | **RED** (RC-9) |

**RC-3′ is strictly harder to satisfy than RC-3 and goes red on states RC-3 cannot see, including the reroute that would otherwise pass it. The control that detects the cut-over survives the cut-over, still gating, with a green that means something afterwards.**

### 4.9 · Sole authorities preserved

No platform contract, Decision Type, connector SPI, `ExecutionPackage`, Execution Context, Execution-Plane protocol or signing behaviour is modified. No runtime toggle, dual execution or feature flag is introduced (RC-6 stands unchanged). No sealed symbol is exported; the ADR-0048 `SEAL` variance is untouched, because §4.3's path never constructs a legacy `OrchestrationResult`. `ip-execute-gateway.mjs` is **not deleted and not modified**: it is declared in a governed contract by a surviving module (`src/contract/package-governance.ts:166`), read unguarded by `verify-package-governance.js:518`, named in `verify-provider-platform.js:120`'s `FORBIDDEN_MODULE`, deferred by ADR-0061 §6 step 6 in the same breath that names it, and outside the retirement inventory's measured scope.

## 5. Consequences (stated honestly)

**The live authoring path moves.** On the next request after the re-composition, the package the gateway signs is composed by the canonical runtime through the twelve-stage governance runner. That is the point of the ADR and it is irreversible in practice once Part 1 removes the legacy modules.

**Two narrowings of what ADR-0049 required, both named in §4:** CU-6a is an in-reference corpus for the authoring half rather than a real workload; and stakeholder and executive approval gate dispatch rather than authoring. Both are decisions, not consequences of measurement, and a reader who disagrees with either should reject this ADR rather than the work performed under it.

**Three capabilities are lost with nothing replacing them, and the retirement's closure asserts it in these words rather than leaving it to a register:** after the retirement **the platform has no independent review mechanism at all** — fourteen reviewers measured at 0 of 14 approving a wholly empty run; the coverage-remediation loop is gone, and the canonical path measures coverage and relays it; continuous learning has no canonical consumer. With ADR-0069 P-69.2's four reductions these are §4.7's seven, and they are the entire declared difference set.

**Measured costs of the retirement, settled and not reopened here:** 9 orphan modules, **6 944 lines**, and a suite drop of **218** (509 → 291) named per file. `verify-suite-integrity` will report the drop as a failure, correctly, and the baseline is re-cut deliberately with the loss stated.

**The gate set changes shape, not size.** Two properties re-founded, one added, six unchanged; the fault-proof set gains a probe that must go **green** — the first in this programme whose passing condition is that a check *not* fire.

**What remains NOT MEASURED and is not improved by this ADR:** E-2 (a container runtime) is absent by probe; the real signer, EP transport and locator resolver are unbound; CU-6b cannot be attempted. **GA remains NOT CERTIFIED**, the dispatch cut-over remains deferred, and the Execution Plane continues to execute exactly the package it executes today.

**A standing risk, recorded rather than mitigated:** after the retirement there is no second implementation to compare against. CU-6a is measurable **once**, on a tree where both paths exist, and RC-4′(3) preserves that measurement by digest rather than by re-running it. If the corpus is later changed without re-measuring, RC-4′(3) goes red — which is the intended behaviour and will read as an obstruction to whoever changes the corpus.

**THE STORAGE CONSEQUENCE OF THAT SENTENCE, WHICH THIS ADR DID NOT DRAW AND NOW DOES.** *(AMENDED 2026-08-05; debt D-085.)* `.gitignore:115` ignores `governance/**/*-evidence.json`, and `git ls-files 'governance/capability/*-evidence.json'` returned **0** — **no** evidence artefact in this repository is tracked. That rule is correct for all 57 of them and rests on one premise: the evidence can be regenerated, so storing it buys churn and the risk of gating on a historical claim. **The premise is false for exactly one artefact.** `authoring-equivalence-evidence.json` is not a cache of a computation; after §6 step 6 it is **the only record that the computation ever happened.**

Two consequences, and the second is why this is in the decision rather than in a comment:

- **Ignored, it does not survive a clean clone.** RC-4′ permits the legacy modules to be absent **only where** this evidence is present and current, so after the retirement the gate is red for everyone but the machine that took the measurement.
- **That red invites the repair that destroys the evidence: regenerating the artefact on a post-deletion tree.** With one path left there is nothing to compare, and what such a run writes is a document, not a measurement — **a green RC-4′ asserting an equivalence nobody ever measured.** This is the vacuous-green class (debt D-011, D-015) arriving at the one artefact in the programme that cannot be re-derived.

**The artefact is therefore TRACKED**, by a `.gitignore` negation carrying this reasoning, for the same reason `governance/verification/proofs.json` and `governance/closure/baseline.json` are excepted: it is **consumed evidence, not produced output.** The wider question — whether a generator that can only ever be run once should be able to overwrite its own artefact at all — is recorded as debt D-085 and is not decided here.

## 6. Migration strategy

Post-acceptance, each step separately authorized; **none performed in this ADR.** The order is part of the decision (§4.2 clause 3): **the control lands before the act it detects, and the evidence lands before the deletion that makes it unrepeatable.**

1. **Migrate the gate.** RC-3′, RC-4′ and RC-9 land against the **current** tree, with the re-founded readiness model and its fault proofs re-anchored. RC-3′ is red at this point — correctly: the live path routes to legacy and this ADR authorises moving it. Gate-first, per DECISIONS D-012.
2. **Re-found the readiness model** (§4.6) and its reference conformance suite: evidence records with mandatory sources, the CU-3/CU-4/CU-5 splits, two verdicts, and `not-measured` unable to contribute to ready.
3. **Produce the CU-6a evidence on the current tree, where both paths exist.** Run the §4.5 corpus through the legacy path and the canonical composition; record E-1…E-7 and the input digest into an evidence artefact under `governance/capability/`. **This step is unrepeatable after step 6 and is the reason it precedes it.**

   > **AMENDED 2026-08-05. THIS SENTENCE READ "AFTER STEP 5" AND THE OFF-BY-ONE WAS NOT EDITORIAL — IT PRODUCED A GREEN EQUIVALENCE PROOF BETWEEN ONE IMPLEMENTATION AND ITSELF (debt D-091).**
   >
   > What **step 5** removes is the BRIDGE'S ROUTE to the legacy composition. What **step 6** removes is the composition. Between them the legacy modules are on disk and still constructible, so CU-6a remains measurable — which is also what makes step 5's own *"re-measure CU-6a"* instruction executable at all. The two sentences could not both be true, and the false one was the one the harness was built against.
   >
   > **THE OBLIGATION THIS EARNS, AND IT IS A PROPERTY OF THE INSTRUMENT RATHER THAN OF THE STEP: THE HARNESS MUST RECONSTRUCT THE RETIRING SIDE AND MUST NOT REACH IT THROUGH THE ADOPTED ONE.** The first harness read "legacy" by calling `authorViaFTE` — correct until step 5 re-pointed that function, after which it compared the canonical path with itself and every E-property it reported was an identity. **A measurement that runs one runtime twice reports equivalence**, and it would have reported it at the exact moment CU-6a stopped being measurable, on the one artefact this programme cannot re-derive. The general form, which outlives this ADR: **reconstruct the thing being RETIRED; measure the thing being ADOPTED as it actually ships.** A harness that rebuilds the path it is certifying can only prove its own copy correct.
4. **Re-found the registry harvest — the ten fields AND the evidence the declared names expect.** *(AMENDED 2026-08-05; previously "re-type the registry harvest", ten fields only.)*

   **(4a) The values.** `ReasoningHarvest.state`'s ten fields supplied from `CanonicalCapabilityResult`; `registry/reasoning-publication.ts` no longer imports `EngineState`. Unchanged from the original step.

   **(4b) The evidence.** Every capability publishing into the registry must be able to prove it ran from what the canonical composition **actually recorded** (§4.3.1). **Three routes. They are scoped here and NOT decided here; the route is ruled before it is built, on the blast radius recorded with it.**

   | | Route | Where it lands | Blast radius, measured |
   |---|---|---|---|
   | **(a)** | **the canonical composition emits domain-level events** | `canonical-runner-capability.ts`'s twelve stage handlers, via the `audit(event, detail)` sink the framework already gives every stage (`capability-framework/src/stages.ts:289`), currently unused by the runner | The mechanism exists and needs no framework change. **But the declared names are LEGACY AGENT IDENTITIES**, so emitting them verbatim asserts that agents which do not exist in this composition were invoked — fabrication, forbidden by ADR-0061 §4 condition 3 and by §4.3.1's obligation. Emitting **honest canonical names** does not match the declarations. **Necessary, and not sufficient alone.** |
   | **(b)** | **the registry's declared evidence names change to the canonical vocabulary** | `registry/capability-model.ts` — **11 of 22 capabilities** carry audit-derived evidence; ADR-0067's governed capability model; `verify-reasoning-registry.js` asserts over the declarations | **Both paths publish through ONE registry.** Replacing the names breaks the legacy path *while it is still live*, which is this ADR's own replace-before-remove inverted. So (b) is **additive first** — the declarations accept either vocabulary between steps 5 and 6 — and **reduced to canonical-only at step 7**, where the legacy names have no emitter left. The interim two-vocabulary state is a second answer to *what proves this capability ran* and **must not outlive step 7.** |
   | **(c)** | **the bridge translates** | `authoring-bridge.mjs`, synthesising audit entries from the canonical run | **INADMISSIBLE, and named because it is the cheapest.** The bridge would emit `agent.story.requirement-extraction.invoked` on behalf of a domain it does not own and an agent that does not exist, in the live path. That is the registry's own refusal condition — *"an output nothing proves was produced is a claim"* — manufactured by the component the claim is made to. |

   **The measured shape of the answer is (a) AND (b), in that dependency order**, with (c) rejected: the composition emits honest evidence of what it did, and the declarations are widened to accept it, additively until step 6 and reduced at step 7. **That is a recommendation from measurement, not a ruling** — §6 step 4 is not started until the route is ruled.

   **WHAT STEP 4 MAY NOT DO, STATED BECAUSE IT IS THE CHEAP REPAIR AND IT IS AVAILABLE TODAY:** it may not switch publishers from `auditEvidence(…)` to `composedFrom(…)` to clear the non-empty check. That passes the gate while removing the property the gate exists to enforce, and `grounded-authoring` already demonstrates it works (§4.3.1). **A capability whose proof is genuinely its certified upstream inputs may use `composedFrom`; a capability changed to `composedFrom` because its audit evidence stopped matching may not.**

5. **Re-compose the bridge — both exports, and the grounding vocabulary.** `authorViaFTE` and `reflectViaFTE` onto `createCanonicalRunnerCapability(...).runThroughRunner(...)`, with the F1 `contextRequest` → `CanonicalCapabilityInput` translation. **The four gates that import and execute the bridge, plus its nine tests, are re-verified in this step, not after it.** Re-measure CU-6a; RC-3′ turns green on the canonical routing.

   **(5a) THE GROUNDING VOCABULARY IS A DEFECT AND IS RECORDED AS ONE.** *(ADDED 2026-08-05 by amendment; debt D-086.)* `groundOperations` (`authoring-bridge.mjs:383–393`) dispatches on the closed set `navigate | input | select | click | assert`. `CanonicalTestCase.steps[].action` is **prose** — `test-management-intelligence.ts:172–175` emits *"establish precondition: …"* and *"verify: …"*. **Measured: seven distinct canonical step actions, zero in the grounding vocabulary; 125 / 155 / 234 legacy grounded operations become 0.**

   §4.5's **E-3** already rules on what this is: grounding *"is the bridge's own reasoning and is unchanged by the re-composition, so a difference here is a defect, not a design difference."* It was measured against the bridge's **own** `groundOperations` — exported for the measurement rather than copied — so it cannot be an artefact of a second implementation.

   **Two repairs, and the choice is a decision this step must take explicitly rather than absorb:** either **the vocabulary widens** to recognise what the canonical step carries, or **the canonical step carries a structured action beside its prose** — a typed field the grounding dispatches on, leaving the prose as the human-readable statement it already is. **The second keeps grounding's dispatch closed and puts the structure where the authoring decision is made; the first puts requirement→control interpretation into the bridge, which §4.3 calls the bridge's own reasoning but which is closer to the AI Selector Intelligence that `authoring-bridge.mjs:344–351` records as deferred.** Neither is chosen here.

   **THE PROHIBITION THAT MAKES THIS A DEFECT RATHER THAN A DESIGN CHOICE:** no repair may map prose to an action by pattern-matching the prose. That is not grounding, it is interpretation, and a bridge that guesses `click` from the word *"submit"* has authored an operation nothing certified.

   **(5b) THE AUTOMATION REPOSITORY IS COMPOSED FROM THE CANONICAL ARCHITECTURE.** *(ADDED 2026-08-05 by amendment; debt D-090 cause 3. A GAP, NOT A DIFFERENCE — it is not added to §4.7.)* Four registry capabilities — `repository-composition`, `manifest-generation`, `repository-digest-generation`, `dependency-graph-generation` — read `state.automation` and `state.automationManifest`. **Those are EMITTER outputs the legacy engine materialised at execution-planning, not reasoning outputs**, and the emitters (`src/emitters/`) are explicitly excluded from the retirement and survive it. The canonical composition produces an automation **architecture** — `architectureComponents`, `logicalModules`, `dependencyGraph`, `materializationPlan` — and never materialises an asset, so all four capabilities are refused and no package body is projected.

   **THIS IS THE SAME SHAPE AS §4.3.1 AND §6 STEP 5a, AND THAT IS WHY IT IS SCOPED HERE RATHER THAN DECLARED.** Like the harvest's evidence channel and the grounding vocabulary, it is a **consumer** of the bridge's call sequence that walking the sequence could not see. The surviving emitters are the composition point: `composeRepository` / `repositoryInventory` read the legacy `TestCase` through `businessTaxonomy` and `defaultEmitter.emit`, which `CanonicalTestCase` does not satisfy. **The obligation is to supply the emitters what they read, from what the canonical composition authored** — not to re-implement composition in the bridge, and not to weaken the four capabilities' declarations so an absent repository certifies.
6. **Delete the legacy modules** — the nine orphans, 6 944 lines, with `model.ts`, `observation-interpretation.ts`, `design-sync.ts`, `design-sync-composition.ts` and the three emitters explicitly excluded and verified absent from the orphan set.
7. **Re-cut the baselines with the losses named:** suite totals at 291 with the 218 stated per file, the completeness census's eight agent/orchestrator dimensions removed with their reason rather than left reporting zero, `retirement-inventory.json` regenerated, and the closure baseline re-cut.

**A partial migration has no valid boundary between steps 4 and 6.** Any stop after step 4 and before step 6 leaves the repository without a green suite; the boundaries are at 3, at 5 with the deletion pending, and at 7.

## 7. Version impact

**ADR-0049 → SUPERSEDED** by this ADR; its readiness module and gate are re-founded rather than removed, so no evidence identifier disappears. **ADR-0061 → AMENDED at §6 steps 6 and 7**; its §4 Decision, its constitutional conditions 1–3 and its §7 version impact are unchanged. **ADR-0046** (legacy retirement) is **enabled**: its remaining precondition is this ADR's acceptance plus §6 steps 1–5. **ADR-0044 → AMENDED at §4's reversibility clause and AC-7 — see §7.1, added by amendment.**

### 7.1 · ADR-0044 — AMENDED. §6 step 6 FALSIFIES AC-7, AND THIS SECTION DID NOT NAME IT

> **AMENDED 2026-08-05, programme-owner authority; CHARTER §9. Debt D-100.**
>
> **THE OMISSION, STATED BEFORE THE REPAIR.** §7 as accepted enumerated three decisions — ADR-0049 superseded, ADR-0061 amended, ADR-0046 enabled — and **ADR-0044 appeared nowhere in this document.** §6 step 6 deletes `src/capability.ts` and `src/orchestrators.ts`. **AC-7 is an ADR-0044 acceptance property reading *"the legacy implementation remains present (capability.ts + orchestrators.ts)"*, and those are exactly the two files.** So the migration this ADR authorises falsified a recorded property of an accepted ADR that the authorising ADR never mentioned.
>
> **WHY IT WAS INVISIBLE, WHICH IS THE FINDING RATHER THAN THE OMISSION.** §7 scoped this ADR's reach by **the decisions it produces a change in**, and missed a decision that **consumes the deleted files as a recorded property.** That is debt D-087's question — *what does this step's subject CONSUME, as opposed to what does it PRODUCE?* — unasked a fourth time, and per D-087's own closing note a fourth occurrence makes it a property of the document rather than of three steps. **It compounded with D-077's blind spot:** AC-7 references no FTE symbol. It is two `existsSync` calls on file **paths**, so the symbol inventory that scoped step 6 could not see it, and neither could `retirement-inventory.mjs`, which measures imports. **Contrast ADR-0046, whose LR-3/LR-4 assert the identical retention and which §7 explicitly enabled** — the same property at two ADRs, one covered and one not, separated by nothing but which one happened to be in view.
>
> **WHAT IS AMENDED, AND IT IS THE CLAUSE RATHER THAN THE PROPERTY.** ADR-0044 §4 makes activation **reversible** — `activateCanonical` / `rollbackToLegacy` are pure functions of state, `legacyAvailable` stays true, and *"activation makes legacy inactive but never removes it."* AC-7 is the executed evidence of that clause. **After §6 step 6 the clause is false and cannot be made true again**: there is no legacy to roll back to, and nothing can put the modules back.
>
> **ADR-0044's REVERSIBILITY CLAUSE IS RETIRED, NOT REINTERPRETED, AND THE GROUND IS THIS ADR'S OWN §4.5.** Reversibility was the safety property standing in for evidence that the replacement worked. **This ADR replaced it with a measurement**: CU-6a, `equivalent: true`, zero undeclared differences, `corpusDigest 7d955bbe…e264`, taken on a tree where both paths existed — the demonstration ADR-0044 §6.4 was waiting for, in a form ADR-0044 could not specify because §4.5 had not been written. **Replace-before-remove is satisfied by the evidence, not by the rollback path**, and RC-4′(3) is what keeps that true afterwards: the modules may be absent **only where** the CU-6a artefact is present and its digest still matches the corpus.
>
> **AC-7 IS THEREFORE RE-FOUNDED, IN THE SAME TERMS AS RC-4′ AND LR-3, AND THE RE-POINTING IS AUTHORISED HERE RATHER THAN INSIDE THE GATE.** It reads: **the legacy implementation is present, OR it was retired under a recorded authority** — this ADR ACCEPTED on disk, and the authoring-equivalence evidence present with a matching digest. **This sentence is what makes `verify-capability-activation.js`'s current behaviour authorised.** Until it existed the gate was measuring an ordering claim no ADR had made, which is §3 alternative **D** — *a gate re-pointed to restore green* — arriving through the back door of a repair rather than the front door of a decision. **The gate was right to be written this way and wrong to be the only place the decision lived.**
>
> **WHAT IS NOT AMENDED, AND IS NOT RESOLVED BY THIS AMENDMENT.** ADR-0044's **activation state model** survives its own domain: `rollbackToLegacy()`, `selectImplementation()`, `buildParallelValidationReport()` and `INITIAL_ACTIVATION_STATE.legacyAvailable = true` are all still exported, still tested, still green, and every one of those greens is about a transition that can no longer be performed (debt **D-099**). **This ADR retires the reversibility CLAUSE; it does not re-found the two-implementation STATE MODEL, and enlarging it to do so mid-deletion is the scope error §9.1 of the shape report stopped the first attempt for.** That re-founding is an ADR-0044 question and is owed. **Until it is taken, AC-7 prints the loss on its own line** — *ROLLBACK PATH GONE* — rather than folding it into a pass, so a reader of an activation gate is told the rollback path is gone instead of inferring it from a green.
>
> **AND THE GENERAL RULE THIS SETS, WHICH IS WHY THE AMENDMENT IS HERE AND NOT IN A REGISTER.** **An ADR that deletes a file must enumerate the decisions that ASSERT ON THAT FILE, not only the decisions it changes.** A symbol inventory cannot find them: an `existsSync` on a path is a dependency no import graph records. The measurement that would have found this is a **path** search across `docs/adr/` and `governance/verification/` for every file the deletion set names — cheap, available before the work, and unrun.

**No contract change.** The `ExecutionPackage`, Execution Context, Runtime SPI, connector SPIs, evidence contract, EP protocol, HTTP/CLI surface and signing are unaffected; no compatibility window opens; `verify-contract-compatibility`'s frozen fixtures are untouched. The `CutoverReadinessInput` change is **package-internal** to `@dbiz/functional-testing-engine` and reaches one test and one gate.

**Gate properties re-versioned:** RC-3 and RC-4 are re-founded as RC-3′ and RC-4′; RC-9 is added; RC-1, RC-2, RC-5, RC-6, RC-7 and RC-8 are unchanged. The gate count is unchanged — no gate is registered or removed by this ADR.

**Governance baselines move once, at §6 step 7,** and the movement is stated rather than absorbed: suite totals 509 → 291 for the Functional Testing engine, the retirement inventory to zero orphans, and the closure baseline re-cut around the accepted decision.

## 8. Affected components

**Superseded / amended decisions**

- `ADR-0049-canonical-runtime-cutover.md` — **superseded in full**
- `ADR-0061-canonical-functional-capability-runtime-adoption.md` — **amended, §6 steps 6 and 7 only**
- `ADR-0044-functional-testing-capability-activation.md` — **amended by amendment 2026-08-05, §4's reversibility clause and AC-7 only (§7.1).** Its §4 composition, dependency wiring, governed registration, parallel validation and sole-authority clauses are **untouched**; the two-implementation activation state model is **not re-founded here** (debt D-099)

**Re-founded (existing, modified under §6)**

- `packages/functional-testing-engine/src/runtime-cutover-readiness.ts` — evidence records with mandatory sources; two verdicts
- `packages/functional-testing-engine/test/runtime-cutover-readiness-conformance.test.ts` — the reference suite for the re-founded model
- `governance/verification/verify-runtime-cutover-readiness.js` — RC-3′, RC-4′, RC-9
- `governance/verification/record-fault-proofs.js` — the re-anchored probe set, including the one that must go green

**Re-composed / re-typed (existing, modified under §6)**

- `packages/functional-testing-engine/authoring-bridge.mjs` — both exports onto the canonical composition; **`groundOperations` exported for the §6 step 3 measurement** (additive, no call site, no behaviour change), and its dispatch vocabulary settled at step 5a
- `packages/functional-testing-engine/src/registry/reasoning-publication.ts` — the harvest re-typed off `EngineState`, **and its evidence derivation re-founded (§4.3.1, §6 step 4b)**
- `packages/functional-testing-engine/src/registry/capability-model.ts` — **added by amendment.** The declared evidence names of the 11 audit-evidenced capabilities, under §6 step 4b route (b)
- `packages/functional-testing-engine/src/canonical-runner-capability.ts` — **added by amendment.** Under §6 step 4b route (a) its twelve stage handlers emit domain-level evidence through the framework's existing `audit` sink. Previously listed as read-but-unmodified
- `packages/functional-testing-engine/src/domains/test-management-intelligence.ts` — **added by amendment.** Under §6 step 5a, if the structured-action repair is ruled

**Produced by §6 step 3 (new)**

- `governance/capability/measure-authoring-equivalence.mjs` — the CU-6a measurement; extracts the §4.5 corpus from the four gates' sources rather than transcribing it, and refuses on an unbuilt tree
- `governance/capability/authoring-equivalence-evidence.json` — the CU-6a evidence. **Tracked, by a `.gitignore` negation** (§5, debt D-085)
- `.gitignore` — the negation and its reasoning

**Read or executed by the change, verified in the same step (existing, unmodified by decision)**

- `packages/functional-testing-engine/src/canonical-runner-capability.ts` — the successor composition
- `packages/functional-testing-engine/src/runtime/execution-request-translator.ts` — the translation shape
- `packages/functional-testing-engine/src/runtime-entry-point-bridge.ts` — remains the dispatch-side entry point, untouched
- `governance/capability/run-intent-conservation.mjs`, `governance/verification/verify-execution-contract.js`, `governance/verification/verify-package-governance.js`, `governance/verification/verify-reasoning-registry.js` — import the bridge by path and execute it
- `packages/functional-testing-engine/test/authoring-bridge.test.mjs` — nine tests over the bridge
- `governance/capability/retirement-inventory.mjs` — the reachability measurement RC-3′ uses, on a rebuilt tree
- `governance/verification/run-all.js` — registration unchanged; no gate added or removed

**Explicitly NOT modified**

- `packages/tenant-onboarding-engine/ip-execute-gateway.mjs` — not deleted, not modified (§4.9)

**Evidence**

- `SECTION_G_SHAPE_REPORT.md` — the measured shape of the retirement
- `ADR_0049_SUPERSESSION_DESIGN_REPORT.md` — the design report this ADR was ruled from
