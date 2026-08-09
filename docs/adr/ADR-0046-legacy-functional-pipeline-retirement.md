# ADR-0046 — Legacy Functional Pipeline Retirement & Canonical Runtime Adoption

**Status:** **PROPOSED** · **Date:** 2026-07-29. This ADR governs retiring the legacy Functional Testing implementation and adopting the certified ADR-0039 canonical capability as the sole runtime. Retirement is a one-way, unrecoverable action; it executes only when every precondition in §6 is met, and its readiness is measured by an executable gate. **No legacy code is deleted, and no runtime entry point is switched, by this ADR in its PROPOSED state.**

> **Sequencing note (CLAUDE.md §5 — the repository governs).** The authorization directs deleting the legacy pipeline now. The repository's own governance forbids that yet: ADR-0044 §6.4 and ADR-0045 §6.5/§9 gate legacy retirement on production operation, a stability window, rollback-window expiry, and governance + stakeholder + executive approval. **None of those exist.** The certified canonical capability has never operated in a real environment — it has run only against reference connectors in-reference (ADR-0045 recorded `productionActivationPerformed = false`); there is no container runtime (E-2 NOT MEASURED, GA NOT CERTIFIED). Deleting the only production-proven implementation and its rollback path, before any production validation of the replacement, would also break the many governance gates that depend on the legacy engine — failing this ADR's own success criterion "zero net-new governance RED gates." Therefore retirement is captured here as a governed decision with an executable readiness gate, and **deferred** until its preconditions hold.

## 1. Problem

The programme's end state is exactly one Functional Testing pipeline: one execution path, one orchestrator, one capability. The certified ADR-0039 capability is the intended sole runtime, and the legacy engine must eventually be retired. But retirement removes the rollback path and cannot be undone, so it must be gated on evidence, not on a directive.

## 2. Context

Legacy retirement is the last step of the ADR-0039 → ADR-0044 → ADR-0045 → ADR-0046 sequence. ADR-0044 built the activation mechanism (with a retained rollback path); ADR-0045 built the qualification mechanism and reported the real-environment phases NOT MEASURED. The legacy engine (`packages/functional-testing-engine/src/capability.ts`, `packages/functional-testing-engine/src/orchestrators.ts`) is capability 1 of the frozen six (R-11.4) and the only implementation proven to run end-to-end. Many governance gates depend on it. No production runtime exists.

## 3. Alternatives

1. **Delete legacy now** — remove the legacy pipeline immediately. Rejected: violates the retirement preconditions of ADR-0044/0045, destroys the rollback path before any production validation, deletes the only production-proven implementation, and turns many governance gates RED (failing this ADR's own success criterion).
2. **Leave retirement ungoverned** — retire whenever, by hand. Rejected: an unrecoverable action with no evidence gate.
3. **Govern retirement with an executable readiness gate, execute deletion only when ready (chosen)** — capture the retirement decision and its preconditions; measure readiness; retain legacy (replace-before-remove) until every precondition is met; then delete under a separately authorised change.

## 4. Decision

Adopt evidence-gated retirement with replace-before-remove.

- **Readiness assessment (`legacy-retirement.ts`).** `assessLegacyRetirementReadiness` computes readiness from measured evidence — canonical activation certified, qualification certified, a real runtime environment, production activation performed, a completed stability window, an expired rollback window, and governance + stakeholder + executive approval. `ready` is true only when EVERY precondition is met; while not ready, the legacy path MUST be retained. A not-ready state with legacy already removed is an inconsistent, premature retirement the assessment detects.
- **Current verdict: NOT READY, legacy retained.** With no runtime, no production activation, and no approvals, retirement is deferred and the legacy path remains the rollback path.
- **Sole authorities preserved.** No platform contract, Decision Type, connector SPI, reporting model or execution context is modified. No runtime toggle or feature flag is introduced.

The governance is certified by execution: `verify-legacy-retirement-readiness.js` (LR-1…LR-8) is registered in the runner and proved with five fault proofs (false readiness claim, undetected premature removal, a dropped precondition, platform-contract modification, and a runtime toggle — each turns the gate RED). The gate is GREEN in the correct current state (both paths present, retirement deferred) and RED if retirement is executed prematurely.

## 5. Consequences (stated honestly)

- Retirement is governed and measurable; the current state is honestly NOT READY and legacy is retained.
- **No legacy code is deleted and no entry point is switched by this ADR.** The repository still contains both the legacy and canonical paths (replace-before-remove).
- Retirement adds **zero net-new RED governance gates**; the runner's failing set is unchanged.
- When the preconditions are met — a real runtime, a production run, a stability window, an expired rollback window, and the approvals — §6 executes the deletion under a separately authorised change, and the one-pipeline end state is reached then, not now.

## 6. Migration strategy (executes only after this ADR is ACCEPTED and readiness is met)

Retirement executes only when `assessLegacyRetirementReadiness` returns `retirement-ready` (every precondition met). Then, under a separate authorised change:
1. **Canonical activation** — switch every runtime entry point to the canonical capability through the ADR-0044 mechanism.
2. **Legacy removal** — delete the legacy capability, orchestrators, and code used only by the old pipeline.
3. **Dependency & reference cleanup** — remove unused imports, factories, tests and documentation; the repository references only the canonical runtime.
4. **Test & documentation migration** — tests validate only the canonical pipeline; documentation describes only the canonical runtime.
Until every precondition is met, the legacy path is retained and none of the above executes.

## 7. Version impact

Additive. New source: `packages/functional-testing-engine/src/legacy-retirement.ts`. New gate: `governance/verification/verify-legacy-retirement-readiness.js`. No platform contract, Decision Type, connector SPI, execution context, governance rule or certified domain behaviour is modified. Neither the legacy engine nor the canonical composition is deleted or altered by this ADR.

## 8. Affected components

- `packages/functional-testing-engine/src/legacy-retirement.ts`
- `packages/functional-testing-engine/test/legacy-retirement-readiness-conformance.test.ts`
- `governance/verification/verify-legacy-retirement-readiness.js`
- `governance/verification/run-all.js`
- `governance/verification/record-fault-proofs.js`
- `docs/certification/ADR-0046-LEGACY-RETIREMENT-CERTIFICATION.md`
