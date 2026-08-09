# PLATFORM-VALIDATION-001 — Enterprise Functional Testing Platform Validation & Release Readiness Certification

**Status:** NOT CERTIFIED FOR ENTERPRISE RELEASE
**Date:** 2026-08-02 · **Issue 3** — issue 2 corrected RQ-1 and TD-2; issue 3 records the closures made by
[PLATFORM-CLOSURE-001](PLATFORM-CLOSURE-001-FINDING-CLOSURE-MATRIX.md). ER-1, ER-2, RQ-1, OR-2, OR-3 and
blocked-execution classification are CLOSED. **The verdict is unchanged.**
**Scope:** Architecture freeze honoured. No constitutional step, plane ownership, package contract,
package governance, repository architecture, Package Assembly Orchestrator or Reasoning Result
Registry was changed by this review.
**Method:** Measurement over 51 recorded Execution-Plane runs against a live Dynamics 365 tenancy,
147 fault-injection proofs, 461 Intelligence-Plane tests, 275 Execution-Plane tests, and one replay
of a real tenant context through the current build.

---

## 0. What was measured, and what could not be

This review had access to two repositories: the **Intelligence Plane**
(`DBizIntelligencePlane`) and one **materialised tenant Execution Plane** (`carlisle-homes`,
tenant `tnt-a2130d413210`) carrying 51 recorded runs, 799 evidence artefacts and 88 reports
against a live Dynamics 365 application.

**Measured directly.** Requirement intelligence, test design, automation generation, package
assembly, package governance, repository composition, cross-plane contract, real browser
execution, healing, failure intelligence, result synchronisation, evidence integrity, traceability,
determinism, performance, and 147 fault injections.

**NOT measured, and therefore NOT certified.** Statements below never extend past the evidence.

| Asked for | Status | Why |
|---|---|---|
| Jira integration | **NOT MEASURED** | Zero occurrences across 51 audit journals; adapter present, never exercised |
| Zephyr Essential / Zephyr Scale | **NOT MEASURED** | As above |
| Multi-tenant / multi-application | **NOT MEASURED** | One tenant, one application in evidence |
| 100 consecutive executions | **NOT MEASURED** | 51 runs recorded; 4 reached a browser |
| Allure reports | **NOT PRESENT** | No Allure artefact, dependency or configuration exists |
| Repository compilation | **NOT MEASURED** | A repository WAS materialised (58 files); it sits outside the configured suite root, so the toolchain never saw it — see §4 |

A capability that was never exercised is recorded as NOT MEASURED, never as passing.

---

## 1. Capability Certification Report

Independent certification per capability, from evidence.

| Capability | Verdict | Evidence |
|---|---|---|
| Requirement Intelligence | **CERTIFIED** | 3 requirements extracted from real story 52121; 100% carry id, kind, statement, confidence |
| Story / Acceptance Criteria Analysis | **CERTIFIED** | Full analysis crosses the boundary; `verify-execution-contract` 20/20 |
| Coverage Analysis | **CERTIFIED** | 9 measured dimensions on real-context replay |
| Coverage Certification | **CERTIFIED** | Verdict with score, threshold, shortfall; consistency re-derived by the semantic level |
| Test Design | **CERTIFIED WITH FINDING** | 53 cases, 12 steps each, 100% GWT, 100% requirement traceability — but `technique` and `severity` null on all 53, `priority` and `riskLevel` constant (§3) |
| Duplicate Detection | **NOT MEASURED** | No run reached a state where duplicates were reported |
| Automation Generation | **CERTIFIED** | 11 assets composed on replay; 58 files materialised in run …091921 (§4) |
| Feature / Step-Definition / POM / Locator Generation | **CERTIFIED** | 22 features, 11 Page Objects, 11 locator modules, 11 test-data files across 11 techniques (§4) |
| Repository Composition | **CERTIFIED** | Manifest, repository digest and dependency-graph digest all present; `verify-repository-handoff` 31/31 |
| Repository Materialisation | **CERTIFIED WITH FINDING** | 58 files staged, hash-verified and committed; stranded by a later suite-root change (RQ-1, §4) |
| Repository Compilation | **NOT MEASURED** | The materialised tree is not under the configured suite root, so the toolchain never saw it (RQ-1) |
| Execution | **FAILED** | 5 test cases observed, 0 passed, across 51 runs (§6) |
| Healing | **FAILED** | Never authorised — "no healing policy arrived from the Intelligence Plane" for every failure |
| Defect Intelligence | **FAILED** | 5 test failures produced 0 defects; 100% of signals `UNCLASSIFIED` |
| ADO Integration | **CERTIFIED** | Real read in 1729 ms; 5 results published to ADO run 1033399 |
| Jira / Zephyr Integration | **NOT MEASURED** | §0 |
| Executive Reporting | **FAILED** | `executiveSummary`, `qualityAssessment`, `releaseReadiness` all null on the only executing run |
| Package Assembly & Governance | **CERTIFIED** | 50/50 governance checks, 32/32 registry checks, 20/20 contract checks |

---

## 2. End-to-End Functional Validation Report

**No run has ever completed the constitutional workflow.**

| Measure | Value |
|---|---|
| Runs recorded | 51 (43 with a parseable report) |
| Runs reaching a non-blocked terminal state | **0 / 43** |
| Runs reaching a real browser | 4 |
| Runs producing structured execution results | 1 |
| Test cases executed, all runs | 5 |
| Test cases passed, all runs | **0** |
| Defects raised, all runs | **0** |

Every run terminated `BLOCKED BY EXTERNAL DEPENDENCY`. Measured blocking causes, clustered:

| Cause | Occurrences |
|---|---|
| `AUTHORING_REFUSED: no SelectorDiscovery on F1` | 14 |
| `content-hash: package altered since sealed` | 10 |
| `PACKAGE_INCOMPLETE: missing coverageMatrix, coverageCertification, automation.manifest, repositoryDigest, dependencyGraphDigest` | 6 |
| Gateway unreachable (`gateway.dbiz.example`, DNS placeholder) | 6 |
| `grounding produced no executable operation from 0 test(s)` | 4 |
| Knowledge-field guard rejected `contextRequest.requirements` | 2 |
| `tests/functional holds neither a feature file nor a step definition` | 2 |
| ADO work-item fetch failure | 1 |

**Regression status of the `PACKAGE_INCOMPLETE` class.** The real tenant F1 context was replayed
through the current build, with the discovery document projected by the **Execution Plane's own**
contract module. Result: 22/22 capabilities certified, 0 failed, 0 blocked; story analysis,
coverage matrix (9 dimensions), coverage certification, automation manifest, repository digest and
dependency-graph digest all present; package assembled and seal requested in 0.3 s. **This failure
class no longer reproduces on the input that produced it.**

---

## 3. Test Design Quality Assessment

From real story 52121 (3 requirements → 53 designed cases):

| Property | Measured |
|---|---|
| Cases traceable to a requirement | **53 / 53 (100%)** |
| Cases with steps | 53 / 53, mean 12.0 steps |
| Cases with complete Given/When/Then | **53 / 53 (100%)** |
| Cases carrying a `technique` | **0 / 53** |
| Cases carrying a `severity` | **0 / 53** |
| Distinct `priority` values | 1 (`p2` on all 53) |
| Distinct `riskLevel` values | 1 (`medium` on all 53) |
| Design → execution conversion | **5 / 53 (9%)** |

**Finding TD-1.** The twelve design techniques are not evidenced in the emitted artefact. Technique
survives only inside the identifier (`tc-52121-r1-accessibility-1`); the typed field is null on
every case. Risk-based coverage cannot be certified from a constant.

**Finding TD-2 (corrected).** The first issue of this report said technique diversity was **NOT
MEASURED** because only `accessibility` and `boundary` appear among the 5 executed cases. That
understated what the platform produced. The materialised repository (§4) carries **11 of the 12
techniques** — accessibility, boundary, data-variation, decision-table, error-guessing, negative,
pairwise, positive, security, state-transition and workflow-variation — each with its own feature
file, Page Object, locator module and test data. Technique diversity is therefore **DEMONSTRATED at
design and generation time**. What remains NOT MEASURED is technique diversity *at execution*: only
2 of the 11 reached a browser, because execution ran before the suite root moved and only 5 of 53
cases were dispatched.

---

## 4. Repository Quality Assessment

> **CORRECTION (2026-08-02, superseding the first issue of this section).** The first issue of this
> report stated that automation *"was never materialised"* and that materialisation had **FAILED**
> with 0 files in 51 runs. **That was wrong.** It was inferred from the empty `features/` and
> `pages/` directories without reading the phase-9 evidence. Re-measurement against
> `phase-09-automation-generation.json` shows materialisation ran and succeeded. The corrected
> finding is below; §1, §3 and §10 are corrected to match.

### What materialisation actually did

Run `…-20260801091921` wrote **58 distinct files across 11 of the 12 design techniques**, each with
a complete Page Object structure:

| Directory | Files | Techniques covered |
|---|---|---|
| `features/` | 22 | accessibility, boundary, datavariation, decisiontable, errorguessing, negative, pairwise, positive, security, statetransition, workflowvariation |
| `pages/` | 11 | one Page Object per technique |
| `locators/` | 11 | one locator module per technique |
| `test-data/` | 11 | one data file per test case |
| `support/` | 3 | assertions, hooks, utilities |

The materialiser is sound by inspection and by evidence: it stages outside the suite root, verifies
every staged file by SHA-256 against the certified manifest, commits with per-file backup, and
rolls back on failure. It never deletes outside its own commit path.

### The actual defect

| Measure | Value |
|---|---|
| Configured suite root (`capabilities.json → functional-testing.suite`) | `tests/functional` |
| Suite root the 58 files were written to | repository root |
| `tests/functional` exists | **No** |
| Feature files under the configured suite root | **0** |
| Playwright tests discovered | **0** (`playwright test` → 0 suites) |
| Materialised artefacts still on disk at the old root | **25** (11 locators, 11 test-data, 3 support) |

**Finding RQ-1 (corrected, critical).** The configured suite root changed from the repository root
to `tests/functional` **after** the repository was materialised. `resolveSuiteRoot` is
deterministic and reads the configured value, so every run since looks in `tests/functional`,
which does not exist, while the certified repository sits at the old root. No run since has reached
phase 9 to re-materialise into the new location, because all of them blocked upstream.

The platform does not detect this. It reports *"no feature file was found"* — true of the location
it is looking at, and misleading about the estate, because a materialised repository and its
`repository-manifest.json` exist one directory up. A suite root that moves silently strands a
certified repository, and nothing in the run notices.

**Finding RQ-2.** Preflight observes the empty suite and does not block: *"the suite directory
tests/functional does not exist"*, *"no feature file was found"*, *"the suite declares no page
objects"* are recorded as **WARNING**, and preflight returns `readyToProceed: true` with `fail: 0`.

**What remains NOT MEASURED.** POM compliance, import graph, circular dependencies, TypeScript
compilation and Playwright discovery were never exercised against the materialised tree, because
the tree is not where the toolchain looks. These are measurable as soon as RQ-1 is closed; they are
not measurable from the evidence in hand.

---

## 5. Test Management Integration Assessment

| Provider | Verdict | Evidence |
|---|---|---|
| Azure DevOps | **CERTIFIED** | 124 audit references; live read in 1729 ms; 5 results published to run 1033399; `returnOutcome: available` |
| Azure Test Plans | **PARTIAL** | Test plan artefact produced once; plan/suite lifecycle not exercised |
| Jira | **NOT MEASURED** | 0 references in 51 journals |
| Zephyr Essential / Scale | **NOT MEASURED** | 0 references in 51 journals |

Result synchronisation works. Defect synchronisation is **NOT MEASURED** because no defect was
ever raised.

---

## 6. Execution Quality Assessment

The single run with structured results (`…-20260802005304`), against live Dynamics 365:

| Measure | Value |
|---|---|
| Operations executed | 60 |
| Operations passed / failed | 25 / **35 (58% failure)** |
| Test cases | 5, **all failed** |
| Total execution time | 1082 s |
| Time lost to 30 s locator timeouts | **1050 s (97%)** |
| Failure classes | 1 — locator timeout, 100% |
| Failure signals classified | **0** (all `UNCLASSIFIED`) |
| Healing attempts permitted | **0** |
| Browser evidence | 174 screenshots, 11 videos, 10 HAR, 10 traces |

**Finding EX-1 — CONFIRMED DEFECT, FIXED.** 10 of the 35 locator-driving operations were grounded
onto selectors that could not resolve. Root cause: a role candidate crosses the boundary as
*structure* (`{role, name}`) and is measured live by the Execution Plane, but the Intelligence
Plane renders it as a `role=…[name="…"]` *string*, and Playwright's role-engine string parser reads
an escaped newline as a backslash and an `n`. 98 of 655 discovered controls carry a newline in
their accessible name. Every affected control also carried two unique, resolving CSS candidates
that were passed over, because `STRATEGY_RANK` prefers `role` (5) to `css` (2).

Fixed in `selector-intelligence.mjs`: a role name that the `role=` string syntax cannot carry no
longer yields a selector, so the existing fallback chain reaches the CSS candidate — the behaviour
`bestExecutable` already documents ("skips a role/label candidate that lacks the metadata to be
expressed as a string"). **Verified by replay against the real tenant context: operations driving a
selector the Execution Plane measured as resolving rose from 77/88 to 88/88.** Regression test
added; 96/96 bridge tests and all four affected gates pass.

**Finding EX-2 — NOT AN INTELLIGENCE-PLANE DEFECT.** The remaining 15 failures used selectors
discovery measured as unique and resolving. Console evidence records repeated
`401 Unauthorized`. This is consistent with the execution session not holding the authenticated
application state discovery ran under. Preflight corroborates: `D365_TOTP_SECRET` unset, so no
second-factor authentication was possible. Attributing these to grounding would be unsupported.

**Finding EX-3.** Healing never fires: *"no healing policy arrived from the Intelligence Plane, so
no healing is authorised"* on every failed operation. Retry effectiveness and healing success are
therefore **NOT MEASURED**, and autonomous recovery is **not demonstrated**.

**Finding EX-4.** Discovery is heavily truncated and says so: 12 of 95 screens retained, 120 of 162
and 120 of 185 controls retained. Grounding reasons over roughly 13% of the observed application.

---

## 7. Traceability Certification

**CERTIFIED, with one severed link.**

| Link | Verdict | Measured |
|---|---|---|
| Requirement → Test Case | **PASS** | 53 cases reference 3 of 3 requirements; 0 dangling references |
| Requirement → Scenario | **PASS** | All designed cases carry requirement ids |
| Scenario → Automation | **NOT MEASURED** | No automation materialised |
| Automation → Execution | **PASS** | 5 executed, 0 orphans against designed cases |
| Execution → Evidence | **PASS** | 33 artefacts, 335 journal records for the executing run |
| **Evidence → Defect** | **FAIL** | 5 failures → 0 defects; all signals `UNCLASSIFIED` |
| Defect → Test Management | **NOT MEASURED** | No defect existed to synchronise |
| Test Management → Executive Report | **FAIL** | Executive sections null (§9) |

**Evidence integrity — independently verified, not read.** The audit hash chain was recomputed from
the records rather than trusting the manifest's `journalDigest: "intact"`:

- 39 journals with a hash chain — **39 verified, 0 broken**, 7,448 records
- 12 earlier journals carry no chain (predate its introduction)

---

## 8. Operational Readiness Assessment

**NOT READY.**

Preflight on the executing run: 15 PASS, 5 WARNING, 1 UNKNOWN, 2 NOT_APPLICABLE, **0 FAIL**, and
`readyToProceed: true`. The environment itself is sound — Node 24.18.0, Playwright installed,
Chromium available, evidence directory writable, verification key present, ADO reachable.

**Finding OR-1.** 18 configuration values remain `<FILL:…>` placeholders, including
`$.connectivity.intelligencePlane.verificationKeyRef` and `$.security.requestSigning.signingKeyRef`
— consistent with the 10 `content-hash` refusals and 6 unreachable-gateway failures.

**Finding OR-2.** An empty automation suite and unset credentials are **warnings, not failures**, so
nothing blocks a run that cannot possibly succeed. A preflight that returns "ready" for a tenancy
with no tests, no page objects and no second factor is reporting on its own checklist rather than
on readiness.

**Finding OR-3.** `tests/engine/discovery-engine.test.mjs` imports
`src/functional-testing/discovery-engine/agent-contract.mjs`, which does not exist. 274/275
Execution-Plane tests pass; this one cannot load.

---

## 9. Executive Release Readiness Report

**Finding ER-1 — governance over-claim.** 5 of 43 runs report `assuranceState: CERTIFIED`. All 5
terminated `BLOCKED BY EXTERNAL DEPENDENCY`, with 4 to 9 constitutional phases never certified, and
**0 tests passing in any of them**. The only executing run reports `certification.certified: true`
alongside `qualityIndex: 0.5`, `deploymentRecommendation: "hold"` and 5/5 tests failed — and
`missionOutcome: "NOT CERTIFIED"` in the same envelope as `assuranceState: "CERTIFIED"`.

Two fields disagree about the same run. Governance that certifies a run in which every test failed
is the failure mode the platform's own C-13.1 forbids: a verdict without the measurement behind it.

**Finding ER-2.** Executive reporting is empty where it matters: `executiveSummary: null`,
`qualityAssessment: null`, `releaseReadiness: null`, `testManagement: undefined` on the best run.

**Performance (measured, not optimised).** 32 runs timed: min 1 s, p50 283 s, p90 1053 s, max
13850 s, mean 733 s. The one executing run took 1897 s, of which 1050 s was locator timeout.
Intelligence-Plane authoring over the real context: **0.3 s** for 99 operations and 11 assets.

---

## 10. Final Platform Certification

### Intelligence Plane — **CERTIFIED**

| Measure | Result |
|---|---|
| Package tests (15 packages) | **all suites pass** |
| Functional Testing Engine tests | **366 + 96 pass, 0 fail** |
| Governance gates registered | 67 |
| Fault-injection proofs | **147 / 147 detect their planted fault** |
| Gates passing on a clean repository | **140 / 147** |
| Gates red on a clean repository | 7 |
| Authoring determinism | byte-identical across runs over the same context |

The 7 red gates are pre-existing and named: `verify-ai-vendor-neutrality`,
`verify-implementation-traceability` (two test files lack a TRACEABILITY block),
`verify-change-control-completeness` (six older ADRs), `verify-governance-self-validation`,
`verify-programme-closure`, `verify-functional-completeness` (F-4, F-15),
`verify-intent-conservation` (IC-1, already RED and escalated under R-18.12). Every one of them
detects its planted fault correctly — they are red about the estate, not broken.

### Execution Plane / End-to-End Delivery — **NOT CERTIFIED**

The platform **cannot currently deliver enterprise functional testing without manual
intervention.** Against the success criteria:

| Criterion | Verdict |
|---|---|
| Every constitutional phase executes correctly | **FAIL** — 0 of 43 runs completed |
| Every capability functions correctly | **FAIL** — execution, healing, defect intelligence (materialisation corrected to CERTIFIED, §4) |
| Every contract is honoured | **PASS** (IP side, 147 proofs) |
| Every generated artifact is traceable | **PASS**, except Evidence → Defect |
| Every repository compiles | **NOT MEASURED** — tree materialised outside the configured suite root (RQ-1) |
| Every execution produces valid evidence | **PASS** — 39/39 hash chains verified |
| Every synchronization succeeds | **PARTIAL** — ADO only |
| Every report is evidence-backed | **FAIL** — executive sections null; assurance over-claims |
| No manual intervention required | **FAIL** |
| No architectural change required | **PASS** — see below |

### Architectural verdict

**No architectural redesign is recommended.** No measured defect demonstrates that the frozen
architecture cannot satisfy its constitutional responsibilities. Every failure localises to an
implementation component or an unconfigured tenancy:

| # | Defect | Owner | Status |
|---|---|---|---|
| EX-1 | Role selector unrenderable for multi-line accessible names | `selector-intelligence.mjs` | **FIXED, verified by replay** |
| RQ-1 | Certified repository stranded: suite root moved after materialisation; nothing detected it | EP suite-root resolution / preflight | **CLOSED** — one authoritative resolver; preflight refuses and names the location |
| EX-3 | No healing policy issued, so healing never authorised | IP policy provisioning ↔ EP phase 12 | Open |
| ER-1 | `assuranceState: CERTIFIED` over a run with 0 passing tests | EP finalisation | **CLOSED** — assurance bound to the terminal state; 5 over-claims → 0 across all 43 runs |
| ER-2 | Executive report sections null | EP phase 16 | **CLOSED** — structured unavailability records carrying reason, owner, impact and action |
| OR-1 | 18 `<FILL:…>` configuration placeholders | Tenant configuration | Open |
| OR-2 | Empty suite and unset credentials are warnings, not failures | EP preflight | **CLOSED** — repository integrity raised to CRITICAL, so it blocks |
| OR-3 | Dangling test import `discovery-engine/agent-contract.mjs` | EP test suite | **CLOSED** — suite-integrity check added; abandoned test retired; EP suite 304 pass / 0 fail |
| TD-1 | `technique` and `severity` null on every designed case | IP test design | Open |

### Certification statement

The **Intelligence Plane is certified**: it reasons, governs, refuses correctly, proves its own
gates against 147 injected faults, and now authors a complete, seal-eligible package from the real
tenant context that previously produced `PACKAGE_INCOMPLETE`.

The **platform as a whole is NOT certified for enterprise release**. The gap is not architectural.
It is that generated automation has never reached the tenancy, execution has never passed a test,
healing has never been authorised, and no defect has ever been raised — while the reporting layer
has, in five runs, described that state as certified.

Release readiness should be re-assessed after RQ-1 (materialisation) and ER-1 (assurance
over-claim) are closed, since the first prevents the workflow from completing and the second
prevents that fact from being visible.
