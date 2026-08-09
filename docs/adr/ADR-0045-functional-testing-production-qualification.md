# ADR-0045 — Functional Testing Production Qualification & Operational Cut-over

**Status:** **PROPOSED** · **Date:** 2026-07-28. This ADR governs qualifying the certified capability under real runtime conditions and, subject to validation and formal approval, promoting it into production through the certified ADR-0044 activation mechanism. It introduces no new architecture and no new capability. Nothing is flipped in production and no legacy is retired under this ADR; the real-environment phases are honestly reported NOT MEASURED until a runtime environment exists.

## 1. Problem

ADR-0044 certified the activation *mechanism* — the certified ADR-0039 capability can be composed, activated and rolled back deterministically. But operating confidence requires qualification under real runtime conditions: connector connectivity, behavioural equivalence on real workloads, performance, resiliency, a governed production cut-over, rollback under production, and a stability window. That qualification must be honest: it may claim only what it has measured.

## 2. Context

This platform has **no runtime environment**: there is no container runtime (E-2 is NOT MEASURED), no live external-provider connectivity, and General Availability is correctly NOT CERTIFIED. The governance programme's first principle is that NOT MEASURED is FAIL (C-0.4) and the platform never claims more than it has proven (R-13.1). The certified capability (ADR-0039) and the activation mechanism (ADR-0044) are deterministic and testable in-reference; the real-environment phases are not, until an environment is supplied.

## 3. Alternatives

1. **Assert a green production qualification** — emit PASS reports for environment, performance, production activation and stability. Rejected: fabricated evidence; the exact failure this platform's governance exists to prevent.
2. **Defer qualification entirely until a runtime exists** — do nothing now. Rejected: the qualification *mechanism* is buildable and certifiable today, and doing so de-risks the eventual real run.
3. **Qualify the mechanism in-reference and report the rest NOT MEASURED (chosen)** — certify deterministically what is measurable (connector exercise, behavioural equivalence, resiliency, rollback) through the ADR-0044 mechanism, and report environment/performance/production-activation/stability as NOT MEASURED, blocked on the external runtime and approvals.

## 4. Decision

Adopt honest, in-reference qualification of the operational mechanism, with the real-environment phases explicitly NOT MEASURED.

- **Harness (`production-qualification.ts`).** `qualifyProduction` exercises the certified capability through the certified ADR-0044 activation mechanism and measures the phases that are deterministically measurable: connector qualification (the publication SPIs are exercised), behavioural equivalence (the capability contract is preserved; the internal-representation difference is declared, not silent), resiliency (a degraded connector degrades gracefully with no evidence or traceability loss), and rollback (governed activation is deterministic and reversible).
- **Honest reporting.** Environment qualification, performance, production activation and stability observation are reported **NOT MEASURED / NOT PERFORMED**, each naming its blocker (the external runtime environment, or the governed cut-over approvals). `productionActivationPerformed` and `legacyRetired` are always false. The harness never asserts a real-environment pass and never claims General Availability.
- **Sole authorities preserved.** The Decision Engine remains the sole decision authority; the connector SPIs remain the sole integration boundary; evidence stays by reference; no platform contract is modified and no new Decision Type is introduced. Production activation, when performed, shall use only the ADR-0044 mechanism — no manual runtime modification.

The qualification is certified by execution: `verify-production-qualification.js` (PQ-1…PQ-9) is registered in the runner and proved with five fault proofs (connector failure, behavioural drift, rollback failure, connector-SPI bypass, platform-contract modification — each turns the gate RED).

## 5. Consequences (stated honestly)

- The qualification mechanism is certified and deterministic; the measurable operational phases qualify in-reference.
- **General Availability remains NOT CERTIFIED**, and this ADR does not change that: environment qualification, performance, production activation and stability observation are NOT MEASURED, blocked on the external runtime (E-2). This is reported, not hidden.
- No production cut-over is executed and no legacy is retired under this ADR. Legacy remains active, present, buildable and recoverable.
- When a runtime environment and the §6 approvals exist, the same harness runs the real-environment phases and this ADR's §6 governs the actual cut-over.

## 6. Migration strategy (executes only after this ADR is ACCEPTED and a runtime exists)

1. **Real-environment qualification** — run environment, connector, parallel, performance and resiliency phases against a live environment; every phase produces measured evidence (NOT MEASURED remains FAIL).
2. **Production cut-over** — activate the canonical implementation through the ADR-0044 mechanism only after environment/parallel/behavioural/performance/resiliency pass with governance, stakeholder and executive approval. Legacy remains installed and becomes inactive only.
3. **Rollback validation** — verify rollback under production conditions through `rollbackToLegacy`; no code changes.
4. **Stability observation** — operate the canonical capability for the approved window; produce the stability report.
5. **Legacy retirement readiness** — assessed but not performed here; retirement is a separately authorised decision after stable operation, rollback-window expiry, and approvals.

## 7. Version impact

Additive. New source: `packages/functional-testing-engine/src/production-qualification.ts`. New gate: `governance/verification/verify-production-qualification.js`. No platform contract, Decision Type, connector SPI, execution context, governance rule or certified domain behaviour is modified. The legacy engine and the ADR-0044 activation mechanism are untouched.

## 8. Affected components

- `packages/functional-testing-engine/src/production-qualification.ts`
- `packages/functional-testing-engine/test/production-qualification-conformance.test.ts`
- `governance/verification/verify-production-qualification.js`
- `governance/verification/run-all.js`
- `governance/verification/record-fault-proofs.js`
- `docs/certification/ADR-0045-PRODUCTION-QUALIFICATION.md`
