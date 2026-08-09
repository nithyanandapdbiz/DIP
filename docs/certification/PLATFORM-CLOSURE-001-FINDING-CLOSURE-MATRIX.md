# PLATFORM-CLOSURE-001 — Finding Closure Matrix

**Status:** PARTIAL CLOSURE — 6 findings closed with evidence, 1 withdrawn as wrong, 3 open,
2 blocked on credentials this environment does not hold.
**Date:** 2026-08-02 · **Issue 2** (supersedes issue 1)
**Governs:** every finding in
[PLATFORM-VALIDATION-001](PLATFORM-VALIDATION-001-RELEASE-READINESS-CERTIFICATION.md).
**Constitutional freeze:** honoured. No workflow phase, plane, contract, registry, orchestrator,
capability graph or governance model was added, removed or reordered. Six implementation defects
were repaired, one preflight risk level raised, and one abandoned test retired.

---

## 1. The scope boundary, stated before the results

The sprint requires **CERTIFIED FOR ENTERPRISE RELEASE** on *"measured evidence from real
execution"* — real browser, real providers, real repository, no synthetic certification.

**That cannot be produced from this environment.** Measured, not assumed:

| Prerequisite | State | Source |
|---|---|---|
| `D365_TOTP_SECRET` | **unset** — no second factor, so no authenticated Dynamics 365 session | preflight, run …005304 |
| 18 configuration values | `<FILL:…>` placeholders, incl. `security.requestSigning.signingKeyRef` | preflight, same run |
| Intelligence-Plane gateway | `gateway.dbiz.example` — a DNS placeholder; 6 runs failed `fetch failed` | audit journals |
| Jira / Zephyr instances | none configured; 0 references across 51 journals | audit journals |

The sprint anticipates this: *"Otherwise, it shall explicitly remain NOT CERTIFIED, listing the
remaining blocking findings and their owners."* That is the outcome recorded in §5.

---

## 2. Closure matrix

| # | Finding | Disposition | Implementation | Verification evidence |
|---|---|---|---|---|
| **ER-1** | `assuranceState: CERTIFIED` over runs with 0 passing tests | **CLOSED** | `orchestrator.mjs` no longer sets assurance from a sealed package; `finalisation.mjs` adds `resolveAssuranceState`, bound to the terminal state so the two cannot contradict. Every verdict carries rule, reason, owner, evidence | **Replayed over all 43 recorded runs: over-claims 5 → 0, contradictions 0.** 7 tests, including the exact recorded run reconstructed |
| **Blocked classification** | All 43 runs said `BLOCKED BY EXTERNAL DEPENDENCY`, naming nothing | **CLOSED** | `classifyBlockedExecution` + a 15-value `BlockedBy` vocabulary; surfaced on the outcome, the manifest and the journal | **32 of 32 classifiable runs classified (100%).** The other 11 recorded no reason at all and are reported `UNCLASSIFIED`, never absorbed. 6 tests over verbatim recorded reasons |
| **RQ-1** | Certified repository stranded outside the configured suite root | **CLOSED** | *Authority*: `discovery.mjs` stopped deriving location from `Boolean(capability.suite)`; `automation-repository.mjs` stopped restating the default in two parameter defaults. *Detection*: `strandedRepository` in preflight refuses, naming location, inventory and both remedies | Fires on the real tenancy: `FAIL — 46 materialised automation file(s) sit at the repository root, but the configured suite root is tests/functional`. 10 tests across two files |
| **OR-2** | Empty suite and unset credentials were warnings, not failures | **CLOSED** | `repository-integrity` raised `Risk.HIGH → Risk.CRITICAL` — `readyToProceed` counts only critical failures, so the old refusal could not block | Test asserts the risk level explicitly, so a downgrade fails the suite |
| **ER-2** | Executive report sections null on the best run | **CLOSED** | Six sections now carry a structured unavailability record — `reason`, `evidenceMissing`, `blockedBy`, `impact`, `owner`, `requiredAction` — instead of `null`. HTML renderers updated; the `unsupported-claim` reviewer repaired so it does not go inert on the new shape | 5 tests, one of which pins the reviewer against silently never firing again |
| **OR-3** | Dangling test import; opaque `'test failed'` | **CLOSED** | `suite-integrity.test.mjs` resolves every relative import in every shipped test and reports test, line, specifier, expected module, owner and repair. The abandoned `discovery-engine.test.mjs` (313 lines, 8 dangling imports into a subsystem that lives in the Intelligence Plane) was retired | **EP suite 274 pass / 1 fail → 304 pass / 0 fail.** The integrity check is the permanent guard |
| **EX-1** | Role selector unrenderable for multi-line accessible names | **CLOSED** (issue 1) | `selector-intelligence.mjs` | Real-tenant replay: **77/88 → 88/88** |
| **TD-2** | "Only accessibility and boundary techniques" | **WITHDRAWN — the finding was wrong** | none | 11 of 12 techniques were materialised |
| **TD-1** | `technique` and `severity` null on every designed case | **OPEN** | none | Intelligence-Plane test design. Closable without the tenancy; not reached this session |
| **EX-3** | Healing never authorised — no policy delivered | **OPEN** | none | Needs an IP-side policy emitter and a real failing run to verify effectiveness against |
| **EX-4** | Discovery truncated to ~13% of the application | **OPEN** | none | Declared by discovery itself; raising the caps needs a real run to measure the cost |
| **OR-1** | 18 `<FILL:…>` configuration placeholders | **BLOCKED — CREDENTIALS** | none | Tenant configuration, not platform code |
| **EX-2** | 15 execution failures from an unauthenticated session | **BLOCKED — CREDENTIALS** | none | `D365_TOTP_SECRET` unset |

---

## 3. Workstreams

| Workstream | Status |
|---|---|
| 1 · Repository Materialisation | **ALREADY IMPLEMENTED** — stages outside the suite root, SHA-256 verifies every file, commits with rollback. It was never the defect |
| 2 · Repository Verification | **CLOSED for synchronisation** (authority + detection). Feature/step/POM/import-graph/compilation verification exists and cannot run until the tenancy's suite root is remediated |
| 3 · Runtime Execution | **BLOCKED — CREDENTIALS** |
| 4 · Healing | **OPEN** (EX-3) |
| 5 · Defect Intelligence | **OPEN** — depends on 3 and 4 |
| 6 · Executive Reporting | **CLOSED** (ER-2) |
| 7 · Assurance Governance | **CLOSED** (ER-1) |
| 8 · Preflight Readiness | **CLOSED** (OR-2) |
| 9 · Test Design Quality | **OPEN** (TD-1) |
| 10 · Authentication & Session | **BLOCKED — CREDENTIALS** |
| 11 · End-to-End Certification | **BLOCKED — CREDENTIALS** |
| Blocked-execution classification | **CLOSED** |
| Functional Readiness Gate | **NOT IMPLEMENTED** — the constituent checks exist (preflight, repository integrity, compilation, Playwright discovery); composing them into one ordered gate was not reached |

**Why three findings were left open.** TD-1, EX-3 and the Functional Readiness Gate are all
closable without the tenancy and were not closed. Making four more subsystem changes without the
budget to verify each would have produced unverified edits, which the sprint's own "no shortcuts,
no placeholder implementation" clause forbids more strongly than it demands completeness. They are
listed with owners so the next session starts from a position, not a rediscovery.

---

## 4. Regression certification

No capability previously certified has regressed.

| Suite | Before this sprint | After |
|---|---|---|
| Execution Plane — engine tests | 274 pass, **1 fail** | **304 pass, 0 fail** |
| Intelligence Plane — compiled tests | 366 pass, 0 fail | **366 pass, 0 fail** |
| Intelligence Plane — bridge/contract tests | 96 pass, 0 fail | **96 pass, 0 fail** |
| `verify-execution-contract` | PASS (20) | **PASS (20)** |
| `verify-package-governance` | PASS (50) | **PASS (50)** |
| `verify-reasoning-registry` | PASS (32) | **PASS (32)** |
| `verify-repository-handoff` | PASS (31) | **PASS (31)** |
| `verify-execution-plane-boundary` | PASS | **PASS** |
| `verify-repository-hygiene` | PASS (13 over 362 files) | **PASS** |
| `verify-capability-conformance` | PASS | **PASS** |
| Fault-injection registry | 147/147 detect; 140 clean-pass | unchanged (no gate touched) |

**30 tests added** across 6 new files, every one pinned to a measured defect rather than to a
hypothetical.

---

## 5. Certification verdict

**NOT CERTIFIED FOR ENTERPRISE RELEASE.**

Success criterion 13 requires repeated end-to-end executions with no manual intervention, certified
on measured evidence from real execution. Zero of 51 recorded runs completed the workflow, the
environment cannot authenticate to the application under test, and three findings remain open.

### Remaining blocking findings and their owners

| Finding | Owner | Blocks |
|---|---|---|
| Suite-root remediation on the tenancy | tenant operations | Every run — preflight now refuses until resolved |
| OR-1 · configuration placeholders, `D365_TOTP_SECRET` | tenant operations / security | Authentication, signing, gateway reachability |
| EX-3 · healing policy never delivered | intelligence-plane policy ↔ execution-plane phase 12 | Autonomous recovery |
| TD-1 · technique and severity metadata | intelligence-plane test design | Risk-based coverage certification |
| EX-4 · discovery truncation | execution-plane discovery | Grounding sees ~13% of the application |

### What changed that matters most

Two of this sprint's closures are about **truthfulness rather than function**, and they are the
reason the other findings stayed invisible for 51 runs:

- Assurance can no longer claim CERTIFIED over a run that executed nothing. Replayed across the
  whole estate, the five recorded over-claims become zero.
- A blocked run now names the dependency that blocked it, so the eight distinct causes behind one
  sentence are eight distinct sentences.

A platform that reports its own failure accurately is the precondition for fixing it. That is now
in place; the remaining work is visible, owned, and — for five of the items — waiting on
credentials rather than on code.

### Next actions, in order

1. **Remediate the tenancy suite root** — set `functional-testing.suite` to `.`, or let a run reach
   phase 9 and re-materialise. Preflight refuses until one is done.
2. **Provision credentials** — `D365_TOTP_SECRET`, signing key refs, a real gateway host. Until
   then criteria 3, 4, 5, 10, 11 and 13 cannot be measured by anyone.
3. **Close TD-1 and EX-3** — both are code-local and verifiable without the tenancy.
4. **Re-run this programme** once 1 and 2 are done; only then can enterprise certification be
   decided on measured evidence.
