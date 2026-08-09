# ADR-0086 — Reference output parity is domain depth, not a second workflow

**Status:** ACCEPTED · **Date:** 2026-08-07 · **Accepted:** 2026-08-07

**Raised by:** customer directive — reproduce the Functional Testing capability implemented by the reference solution (`CarlisleHomesD365_AgenticQAPlatform`) inside the DBiz EP/IP architecture, with behaviour identical and only the plane placement changed.

**Builds on:** [ADR-0039](ADR-0039-functional-testing-capability-refounding.md) — this ADR applies its §4.4 mapping and its C-11 composition rule to a second directive of the same shape, and adds no stage, no capability and no lifecycle.

**Explicitly does NOT amend (constitutional — preserved):** R-11.4 (exactly six certifiable capabilities), R-12.18 / R-12.1 (one orchestration lifecycle, no bypass), R-12.2 (the twelve stages and the governance triad), INV-1 (evidence by reference), INV-9 (AI tool-agnosticism, AI advisory-only), R-13.1 (evidence over assertion), the execution-package and evidence cross-plane contracts, and `CANONICAL_DOMAIN_SEQUENCE` (`packages/functional-testing-engine/src/canonical-capability.ts:52`).

**Evidence base:** [`program/FUNCTIONAL_TESTING_REFERENCE_PARITY_ANALYSIS.md`](../../program/FUNCTIONAL_TESTING_REFERENCE_PARITY_ANALYSIS.md) — every finding cited below is a `file:line` read recorded there.

---

## 1. Problem

The directive requires the reference solution's Functional Testing behaviour to be reproduced exactly, permitting only relocation of responsibilities into the correct plane.

Read literally as *build the reference's workflow here*, it cannot proceed, for the reason ADR-0039:17 already records: Functional Testing is capability 1 of the six frozen capabilities (R-11.4) bound to the one frozen orchestration lifecycle (R-12.18). A second implementation of it would be the second source of truth CHARTER §4 exists to prevent — and, unlike the ADR-0039 case, there is now a **certified fourteen-domain composition on disk** that already covers every stage the reference has.

But the directive is not thereby satisfied. **The stage sequences correspond; the behaviour inside several stages does not**, and the shortfall is not cosmetic:

- `qa.agent.js:79-370` builds ten concrete test-case templates of seven to ten imperative steps each, with a test-data table and a named design technique per case. `test-management-intelligence.ts:203-206` emits **exactly two steps** per case.
- `riskPrioritizer.agent.js:80-119` scores each case on business impact, failure likelihood and defect severity, composes them at `0.4/0.3/0.3`, and rewrites priority from the composite. `test-management-intelligence.ts:195` assigns `negative → high`, `positive → medium`.
- `planner.agent.js:28-136` scores eleven test-type categories from an eighty-eight-entry weighted keyword table and publishes a plan confidence that downstream generation reads. `story-intelligence.ts` has no equivalent and no confidence.
- `reviewer.agent.js:84-98` removes near-duplicates at Levenshtein title similarity ≥ 0.85. `test-management-intelligence.ts:245-249` detects only **exact** objective equality.

So the problem is: **how is a directive for behavioural parity satisfied without producing a second workflow, and where parity would require a mechanism the constitution prohibits, what is recorded instead of silently diverging.**

## 2. Context

### 2.1 · The reference's own sequence, and the two things it is not

Reconstructed from source (analysis §2). The live journey is `run-full-pipeline.js` `STAGES[]` → `run-story.js` → `generate-playwright.js` → `smart-healer.js` → `run-bdd-and-sync.js` → `healer.js` → `create-ado-bugs.js` → reporting → governance gate → git. `run-story.js` delegates wholly to `agentOrchestrator.runAgentChain` (`agentOrchestrator.js:70-140`): `planner.plan` → `qa.generate` → `reviewer.review` → `riskPrioritizer.prioritize`.

**It has no reflection stage.** `executionReflection.agent`, `critic.agent`, `adversarial.agent`, `testDiscovery.agent`, `testAuthoring.agent` and `testCycleCurator.agent` each have exactly one non-test caller, and it is `devChangeOrchestrator.js:43-48`. Reflection is Dev-Change's. Importing it into Functional Testing would be introducing a step the reference does not have.

**Its `PRESETS.functional` execution step is dead.** `steps.js:181` runs `run-and-sync.js`, which executes `tests/specs/`; `generate-playwright.js:861-870` throws `SPEC_GENERATION_FORBIDDEN` on any write to that directory, and it holds zero files. Only the BDD path executes what the generator produces. A migration that reproduced `PRESETS.functional` faithfully would reproduce a path that runs nothing.

Both are recorded because a parity claim is only as good as the thing it claims parity with, and neither is visible from the preset list that names itself `functional`.

### 2.2 · The Execution Plane is already correct and is not in scope

`carlislehomes` @ `352442e` performs browser execution, evidence capture, session and vault custody, and result return, and renders no verdict — `cross-plane-client.js:29-31` states verdict, assurance state and certification are the Intelligence Plane's "under every circumstance"; `dispatch.js:7-18` refuses to assert so that the run state, not Playwright's exit code, is the answer. No requirement analysis, test generation, coverage analysis or workflow decision exists in it. **This ADR changes nothing in the Execution Plane.**

### 2.3 · Two gaps cannot be closed by copying, and the reason is already recorded

**The reference infers what a step *is* by pattern-matching its prose** — `generate-playwright.js:120-179` is a twenty-branch regex ladder over step text, and `qa.agent.js:627-665` classifies every step `UI | API | DATABASE | MANUAL` the same way. ADR-0077 §6 step 5a prohibits exactly this: *no repair may map prose to an action by pattern-matching the prose*; a bridge inferring `click` from the word "submit" has authored an operation nothing certified. The IP already reaches the reference's *outcome* — every step carries its interaction kind — by **declaring** it at construction (`test-management-intelligence.ts:31-49`), which is strictly stronger.

**The reference calls a model at four points** — `planner.agent.js:429`, `qa.agent.js:929`, `reviewer.agent.js:128`, `riskPrioritizer.agent.js:200` — each behind an `AI_ENRICH_*` flag, each additive, each schema-clamped. INV-9 and `ADR-0039:9` hold AI advisory-only and never the source of truth. Reproducing the *enrichment points* is permitted; reproducing them as a source of canonical output is not.

## 3. Alternatives

| Option | Verdict |
|---|---|
| **Build the reference workflow standalone in the IP or EP** | **Rejected.** A second Functional Testing source of truth (CHARTER §4), a second lifecycle bypassing the governance triad (R-12.18, R-12.2), and the exact failure ADR-0039:33 rejected on the identical directive. |
| **Port the reference's mechanisms verbatim into the domains** | **Rejected in part.** Achievable for the keyword tables, templates, patterns and scoring; **not** for prose-pattern step inference (ADR-0077 §6 step 5a) or AI-as-source-of-truth (INV-9). A port that stops at two files is not a port, and calling it one would misrepresent what was delivered. |
| **Declare parity already met because the stage sequences correspond** | **Rejected.** Structural correspondence is not behavioural parity, and the four measurements in §1 say so numerically. This is the "declared-but-unbuilt" failure at the level of depth rather than presence (CHARTER §17.1). |
| **Close the behavioural gaps as additive depth inside the fourteen certified domains, preserving the frozen sequence; record the two prohibited mechanisms as closed-with-cause** | **Chosen.** The only reading that delivers the directive's *outcome* without regressing conformance, and it is ADR-0039 C-11 applied unchanged: composition adds internal depth, never stages and never capabilities. |

## 4. Decision

### 4.1 · **RULING 1 — the parity target is OUTPUTS, and it is stated as a target rather than assumed**

Parity is met when, for the same requirement, the Intelligence Plane produces test cases of comparable concreteness, breadth and prioritisation to the reference — the same *kinds* of case, the same *depth* of step, the same *risk ordering* — **not** when it executes the same functions. Where a reference mechanism produces the output and is constitutionally permitted, it is reproduced. Where it is not, the output is reached another way and the divergence in mechanism is recorded here, not left to be discovered.

### 4.2 · **RULING 2 — the frozen sequence is untouched, and nothing is added outside a domain**

`CANONICAL_DOMAIN_SEQUENCE` is not extended, reordered or branched. No new domain, stage, orchestrator, pipeline or preset is created in either plane. Every change lands inside an existing domain's `execute`, is deterministic, delegates every strategy selection to the Decision Engine, and returns a frozen result — the conditions each domain was certified under.

### 4.3 · **RULING 3 — the scope, per domain and per gap**

| Gap | Domain | What is added |
|---|---|---|
| **G-1** | `story-intelligence` | Weighted test-type category scoring with a confidence threshold, and a published `planConfidence` |
| **G-2** | `story-intelligence` | Scenario-pattern augmentation contributing critical scenarios, risks and test types |
| **G-3** | `test-design-intelligence` | Concrete test-case templates carrying multi-step bodies, test data and a named technique |
| **G-4** | `test-design-intelligence` | Dynamic gap-filling candidates guarded by story match and by an existing-coverage exclusion |
| **G-5** | `test-design-intelligence` | Standards coverage signature and a gate profile over it |
| **G-6** | `test-management-intelligence` | GWT derived from the case's own steps |
| **G-7** | `test-management-intelligence` | Near-duplicate **detection** by title/objective similarity |
| **G-8** | `test-management-intelligence` | Three-dimension risk scoring and priority derived from the composite |
| **G-10** | authoring / package governance | A purity gate over authored content before the package is sealed |
| **G-13** | `healing` | The reference's failure-classification depth, expressed as Decision-Engine candidates |

### 4.4 · **RULING 4 — G-7's DISPOSITION does not move, only its DETECTION**

The reference *removes* the near-duplicate. This domain *reports* and keeps, because authoring is immutable there (`test-management-intelligence.ts:242`). **Detection becomes fuzzy; disposition stays report-only.** Making the IP remove cases would change an invariant rather than a threshold, and the directive asks for the reference's finding, not for its mutation.

### 4.5 · **RULING 5 — G-9 and G-11 are CLOSED WITH CAUSE, not carried as unmet parity**

**G-9 (prose-pattern step-type inference) is WONTFIX.** Prohibited by ADR-0077 §6 step 5a; the outcome is already achieved by declaration.
**G-11 (AI enrichment) is BOUNDED.** AI remains advisory-only under INV-9. Any future enrichment point is additive to a deterministic result and never its source.

Recorded as decisions so that a later reader finds a ruling where they would otherwise find a gap in a register and reopen it.

### 4.6 · **RULING 6 — G-12 and G-14 are placed, not closed**

**G-12 (checkpoint / resume / write idempotency)** is not a domain-depth question: in the reference it guards external ADO writes (`agentOrchestrator.js:428-446`). Its EP/IP home is `synchronisation`'s write path through the connectors, and it is scoped out of this ADR rather than half-done inside a planning domain.
**G-14 (HTML and Allure rendering)** stays in the Execution Plane. `executive-reporting` produces the reporting model and renders no presentation format, by its own certification criteria. This is placement, not shortfall.

## 5. Consequences

**Positive.** The capability produces test cases of reference-grade concreteness and ordering while remaining deterministic, capability-neutral, Decision-Engine-governed and evidence-by-reference. One workflow, one source of truth. The two prohibited mechanisms are on the record with their causes.

**Negative, and stated.** Every domain touched here is certified, so each change carries a conformance test and a fault proof, and the certification is re-established rather than assumed. The result shapes grow: `StoryIntelligenceResult`, `TestDesignResult` and `TestManagementResult` each gain fields, and every consumer of those types recompiles. **Parity is a claim about outputs and it is only as true as the measurement in Phase 8** — no figure in this ADR is a measurement of a run.

**Not changed.** The Execution Plane. The frozen sequence. The stage count. The capability count. The cross-plane contracts.

## 6. Migration strategy

Additive, domain by domain, in dependency order — `story-intelligence` → `test-design-intelligence` → `test-management-intelligence` → `healing` → authoring gate. Each domain builds and passes its conformance suite before the next begins. Existing fields keep their meaning and their derivation; new fields are new. No field is removed and no field's derivation changes, so no consumer breaks — which is what makes the sequence resumable at any point rather than all-or-nothing.

The baseline it moves from is recorded so the delta is attributable: build exit 0; `dist/test/*.test.js` **223 tests, 223 pass, 0 fail**; `test/*.test.mjs` **96 tests, 0 fail, 2 todo** (the ADR-0077 §4.7 entry-8 divergences, which predate this work). Measured 2026-08-07 under Git Bash at HEAD `292bf9f`.

## 7. Version impact

`@dbiz/functional-testing-engine` minor. Three exported result interfaces gain optional-by-construction fields; no exported symbol is removed or renamed. No contract in `@dbiz/contracts` changes, so no cross-plane compatibility window opens and no execution-package or evidence contract version moves.

## 8. Affected components

- `packages/functional-testing-engine/src/domains/story-intelligence.ts` — G-1, G-2
- `packages/functional-testing-engine/src/domains/test-design-intelligence.ts` — G-3, G-4, G-5
- `packages/functional-testing-engine/src/domains/test-management-intelligence.ts` — G-6, G-7, G-8
- `packages/functional-testing-engine/src/domains/healing.ts` — G-13
- `packages/functional-testing-engine/src/domains/defect-management.ts` — the severity rows the widened failure vocabulary needs
- `packages/functional-testing-engine/test/reference-parity-conformance.test.ts` — the certification of each gap
- `packages/functional-testing-engine/test/test-design-intelligence-conformance.test.ts` — `appliedTechniques` asserted as a derivation rather than a length
- `packages/functional-testing-engine/test/test-management-intelligence-conformance.test.ts` — case and step counts asserted as relations
- `packages/functional-testing-engine/test/automation-intelligence-conformance.test.ts` — one plan per test case, as a relation
- `packages/functional-testing-engine/test/automation-architecture-conformance.test.ts` — one component per candidate, as a relation
- `program/FUNCTIONAL_TESTING_REFERENCE_PARITY_ANALYSIS.md` — the evidence base

**Unchanged, and named so the absence is a statement rather than an omission:** `packages/functional-testing-engine/src/canonical-capability.ts` and `packages/functional-testing-engine/src/canonical-domain-steps.ts` carry the composition and the arrangement, and neither is touched; the Execution Plane is not touched at all.
