# ADR-0025 — The platform certification framework measures capabilities and refuses to assert a verdict it did not compute

**Status:** ACCEPTED · **Date:** 2026-07-23

## 1. Problem

A brief asked for the enterprise certification layer: a framework that certifies each of the six capabilities independently (Level 1), then verifies consistency across them (Level 2), then certifies the platform as an integrated system (Level 3), producing fourteen reports and a scorecard, with an explicit verdict of CERTIFIED, CONDITIONALLY CERTIFIED or NOT CERTIFIED.

The hazard in that request is specific. A certification framework is the one component whose output is a claim about everything else, and the easiest way to build it wrong is to let it *assert* a verdict — to write "PLATFORM CERTIFIED" where the honest answer is computed from evidence that does not yet exist. Four of the six capabilities are not in a certifiable state on disk. A framework that returned anything but NOT CERTIFIED would be the precise failure it exists to prevent.

## 2. Context

Established from disk before anything was written:

| Capability | State measured |
|---|---|
| 1 Functional Testing Engine | builds; conformance gate currently red on one property (concurrent refactor in flight) |
| 2 Dev-Change Engine | source present, no `tsconfig.json` — not yet a buildable package |
| 3 Inverse-Flow Discovery Engine | builds; conformance gate green; 20 properties observed |
| 4 Performance Engine | no package on disk |
| 5 Security Testing Engine | no package on disk |
| 6 Penetration Testing Engine | package present, does not compile |

So exactly one capability passes its own conformance gate cleanly at the moment of writing. The platform is, in measured fact, **NOT CERTIFIED**. This is not a defect in the framework — it is the framework working. The certified architecture (document 11 §3) names six capabilities and the platform is judged against six, not against however many happen to be built.

The framework had to be built so that this fact is *computed*, not configured: no table of outcomes, no stored verdict, nothing a human edits to make the platform greener. Every per-capability fact is derived from a build that is run (`tsc --noEmit`) and a conformance gate that is executed, during the certification run.

## 3. Alternatives

**Assert a scorecard from a static table.** Rejected outright: it is the exact substitution R-13.1 forbids — an assertion wearing the shape of evidence. A table saying "capability 3: CERTIFIED" is true today and a lie the day capability 3 regresses, and nothing would catch the transition.

**Certify only the capabilities that exist, and score the platform over that subset.** Rejected: it makes the denominator movable. A platform with one capability would score 100% by omitting the five it lacks. The platform is six capabilities; a missing one scores zero on every axis and stays in the denominator.

**Make the gate fail while the platform is NOT CERTIFIED.** Rejected, and this is the load-bearing decision. A gate that is red until the platform is certified is a red build for the entire duration of a six-capability programme, which trains everyone to ignore it. Instead the gate passes when the framework's *report is sound* — when its verdict matches the measured evidence. A truthfully-reported NOT CERTIFIED is a passing gate. This is the General Availability gate's philosophy exactly: the gate proves the claim matches the evidence, not that the platform is deployable.

**Have the framework trust each capability's last-emitted evidence file.** Rejected: a capability that regressed since its evidence was written would still read as certified. The framework re-executes each capability's gate live and requires exit 0 *and* clean evidence.

## 4. Decision

A three-level certification framework, implemented as governance, not as a capability.

**Level 1 — capability certification.** For each of the canonical six: measure build state, run every declared conformance gate, parse the evidence those gates emit, and derive the twenty Level-1 dimensions from it. A capability is CERTIFIED only if it builds, every gate exits 0, and every emitted property was observed. A dimension with no evidence mapped to it is NOT MEASURED — never scored as certified (R-13.3).

**Level 2 — cross-capability certification.** Over the Level-1-certified set only, verify eight shared invariants (one lifecycle, both reasoning modes, the governance triad, EP/IP ownership, data sovereignty, adapter invocation, no dormant components). The verdict carries how many capabilities it compared: agreement among one is PARTIAL, not PASS, because a single capability cannot evidence a platform-wide standard.

**Level 3 — platform certification.** CERTIFIED only if all six pass Level 1 and Level 2 passes. Otherwise NOT CERTIFIED with the reason. There is no partial credit that reaches CERTIFIED.

**The gate** (`verify-platform-certification.js`) runs the harness and checks the *soundness* of its report: six capabilities measured, no capability certified without a passing gate, no NOT-MEASURED dimension scored as certified, the platform verdict following the evidence, and — the anti-fabrication control — a repository-wide scan that fails if any file asserts the platform certified while the computed verdict is not. It writes the machine evidence and generates the fourteen reports.

## 5. Consequences

**Positive.** The platform has a certification framework whose verdict cannot exceed its evidence. It re-measures on every run, so a capability that regresses is caught rather than trusted. It composes with the existing gates rather than replacing them, and it will report each remaining capability as certified automatically as that capability lands a passing gate — no edit to the framework required. The current honest verdict is NOT CERTIFIED at an overall score of 16.7% (one of six), and the framework says so plainly.

**Negative.** The framework is only as discerning as each capability's own conformance gate. It maps evidence properties onto dimensions by pattern; a capability whose gate emits no property for a dimension leaves that dimension NOT MEASURED rather than proven, which understates a capability that is in fact compliant but under-instrumented. This is the safe direction — NOT MEASURED never inflates a score — and it is recorded here rather than hidden.

**Negative.** Running the harness executes every capability's build and gate, so it is slower than a single gate. This is inherent to measuring rather than asserting and is accepted.

**Unchanged.** No architecture document, ADR (other than the addition of this one), Platform Service, contract, security control or data-sovereignty rule was modified. The framework is a governance layer that reads evidence and build state; it moves no customer artefact and publishes no customer content.

## 6. Migration strategy

None required — the framework is additive. It introduces one directory (`governance/platform-certification/`) and one gate. No existing gate, capability, contract or document changes. The framework is safe to run at any time and reports the current measured state; there is no migration event, only a first execution. As capabilities 1, 2, 4, 5 and 6 reach passing conformance gates, they are picked up with no change to this framework, and the platform verdict recomputes.

## 7. Version impact

Adds `docs/adr/ADR-0025`, which re-takes the programme closure baseline deliberately — the designed path, and the reason the closure gate exists. Adds one gating check to the runner; the closure and self-validation gates track the gate set and must be re-baselined to the new count. No package version changes; no contract version changes; no consumer is affected. The certified architecture set (25 documents, six capabilities) is unchanged.

## 8. Affected components

- `governance/platform-certification/capabilities.mjs` — **New**. The canonical six and their evidence mappings.
- `governance/platform-certification/run-platform-certification.mjs` — **New**. The three-level measuring harness.
- `governance/platform-certification/reports/` — **New**. The generated report set (twenty at v3.0).
- `governance/platform-certification/platform-certification-evidence.json` — **New**. The machine-readable evidence.
- `governance/platform-certification/history.jsonl` — **New (v3.0)**. Append-only log of measured certification snapshots, used only for trend.
- `governance/verification/verify-platform-certification.js` — **New**. The soundness gate.
- `governance/verification/run-all.js` — **Modified**. One gate registered before programme closure.
- `governance/verification/record-fault-proofs.js` — **Modified**. Fault probes added (a document claiming certification the evidence does not support; a harness emitting a false CERTIFIED verdict).
- `docs/adr/ADR-0025-platform-certification-framework.md` — **New**. This record.

## Addendum — v2.0 hardening (2026-07-23)

The same decision, deepened into the permanent certification authority. No architectural change; the framework still measures, still cannot overclaim, and is still additive governance. What hardened:

- **Repository reconciliation.** The harness now *discovers* each capability's gates and evidence by scanning `governance/`, matching an evidence file by its own declared `capability` field. The prior revision hardcoded the name **verify-dev-change-conformance.js**; the engine shipped as `verify-devchange-conformance.js`, and a stored name that no longer resolves turns a real, passing capability into a false NOT CERTIFIED — the same class of untruth as a false CERTIFIED. The framework reconciles against disk.
- **Tests executed, not inferred.** Each capability's suite is run live (`node --test`); pass/fail/skip are measured. A capability with a red suite cannot be certified regardless of what its gate says.
- **A third verdict — CONDITIONALLY CERTIFIED.** Builds, tests green, gates pass, but a required dimension is not yet measured. It is earned, not a consolation, and it is the truthful verdict for a capability that works but has not instrumented every dimension (Discovery, at writing).
- **A maturity ladder** of seven rungs (`not-started` → `certified`), computed per capability.
- **Framework self-validation.** The harness certifies its own execution against the rules it enforces on everything else, and the gate **re-derives** those soundness properties independently and requires its finding to agree with the harness's self-report — so the framework cannot certify itself by its own say-so.
- **A second fault proof.** Beyond the false-document probe, a probe replaces the harness with one emitting six CERTIFIED capabilities and a CERTIFIED platform with no passing gate behind any of it. The gate rejects it (exit 1, cause named): proof that it re-derives rather than transcribes.

At writing the framework reports the platform **NOT CERTIFIED** at 41.7% overall — 0 certified, 1 conditional (Discovery), Functional Testing and Dev-Change building with a red gate/test, Penetration building and green-tested without full conformance, Performance and Security Testing not started. That verdict is computed from fresh compilation, live tests and live gates, and the gate passes because the report is *sound*, not because the platform is green.

## Addendum — v3.0, the permanent governance authority (2026-07-23)

The same decision, evolved into the standing enterprise governance, certification, maturity and release authority. Still additive, still measuring, still unable to overclaim. What v3.0 added:

- **Continuous repository reconciliation.** The harness discovers capabilities, gates and evidence on every run and treats the repository as the source of truth — no manually curated registry where discovery is possible.
- **Evidence ownership validation.** Every evidence artefact must declare its capability, version, timestamp, producer and type, and must belong to the capability it is assigned to. Orphaned or mismatched evidence is rejected and cannot raise a verdict; incomplete attribution is reported as evidence drift. (First finding: `governance/capability/pentest-evidence.json` carries no timestamp.)
- **The seven canonical certification states** — NOT STARTED → IMPLEMENTED → BUILD VERIFIED → RUNTIME VERIFIED → CONFORMANCE VERIFIED → CONDITIONALLY CERTIFIED → CERTIFIED — computed per capability from measured signals alone, exactly one per capability.
- **Drift detection** across registry, capability, evidence, governance, architecture and contract dimensions, each finding carrying severity, root cause, impact and recommended action. (First high-severity finding, caught independently of `verify-governance-self-validation.js`: `verify-pentest-conformance.js` is present on disk but not registered in the runner, so it is NOT RUN — the C-0.4 hazard.)
- **Certification history.** An append-only `history.jsonl` of past measured snapshots, used only for trend (progression/regression, overall delta). The current verdict is never read from it — it is recomputed every run. Storing a trend is not trusting a stored verdict; it is recording what was true each time the truth was measured.
- **Maturity tiers** — capability, cross-capability, platform (the weakest capability's rung), enterprise readiness, release readiness, and GA readiness (permanently NOT MEASURED until deployment evidence E-2 exists).
- **Release governance.** APPROVED only when every release gate — compilation, tests, runtime, conformance, governance, security, sovereignty, certification — is satisfied by measured evidence across all six capabilities; otherwise BLOCKED with evidence-backed reasons.
- **Self-certification and double validation.** The authority certifies its own execution, and the gate independently re-derives every soundness property and requires its finding to agree with the harness's self-report; disagreement fails certification.

At v3.0 the platform is **NOT CERTIFIED** at ~43% overall — 0 certified, 2 conditional (Dev-Change, Discovery), Functional Testing and Penetration at CONFORMANCE VERIFIED, Performance and Security Testing NOT STARTED — with three drifts reported (one high). The report set is twenty documents plus the machine evidence, and the gate passes because the report is sound.
