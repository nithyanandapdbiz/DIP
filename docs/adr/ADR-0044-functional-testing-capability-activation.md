# ADR-0044 — Functional Testing Capability Activation & Governed Cut-over

**Status:** **PROPOSED** · **Date:** 2026-07-28. This ADR governs bringing the certified ADR-0039 Functional Testing capability into service. It introduces no functionality. Nothing is activated, and no legacy code is removed, until this ADR is moved from PROPOSED to ACCEPTED; on acceptance §6 executes gate-first (D-012), and legacy retirement remains gated on the separate approvals in §6.

> **Number note.** The activation authorization arrived labelled "ADR-0041". That number, and 0042 and 0043, were already taken on disk by an unrelated, concurrently-authored governance series — [ADR-0041 Generation Output Sovereignty](ADR-0041-generation-output-sovereignty.md), [ADR-0042 Repository Purity & Output Isolation](ADR-0042-repository-purity-and-output-isolation.md), [ADR-0043 Executable Constitutional Governance & Traceability](ADR-0043-executable-constitutional-governance-and-traceability.md). Per CHARTER §3, a prompt does not override the repository, and reusing an occupied number would create a second decision under one identifier and destroy traceability. This instrument therefore takes the next free number, **ADR-0044**. The activation content is unchanged; only the identifier is corrected.

## 1. Problem

ADR-0039 rebuilt the Functional Testing capability as thirteen independently certified, deterministic domains, but they are **not wired into the running capability**. The legacy engine is still the active implementation. Bringing the certified domains into service is a distinct, high-risk step — orchestrator replacement, dependency wiring, cut-over, rollback — and it must happen without behavioural drift of the capability contract, without weakening governance, and without a point of no return.

## 2. Context

The certified domains (ADR-0039) consume the frozen platform contracts (ADR-0040): the Decision Engine is the sole decision authority, the connector SPIs are the sole integration boundary, evidence crosses by reference only (INV-1), and every domain is deterministic and immutable. The legacy engine (`packages/functional-testing-engine/src/capability.ts`, `packages/functional-testing-engine/src/orchestrators.ts`) implements the one 12-stage lifecycle and remains operational. The container is a two-plane sovereignty boundary (doc 19); nothing here crosses it. Activation is a registration decision, not new behaviour.

## 3. Alternatives

1. **Big-bang replacement** — delete legacy and switch to the canonical composition in one step. Rejected: irreversible, violates replace-before-remove, no rollback window.
2. **Feature-flag branching inside capability code** — select the implementation with an `if` in the engine. Rejected: puts a decision outside the Decision Engine and leaves legacy execution logic entangled with the new path.
3. **Governed registration with replace-before-remove (chosen)** — compose the certified domains into an immutable canonical capability, select the active implementation through a deterministic, reversible registration seam, validate in parallel, cut over, and retain legacy for rollback until formally retired.

## 4. Decision

Adopt governed registration with replace-before-remove, composed of the certified domains only.

- **Composition (`canonical-capability.ts`).** `createCanonicalFunctionalTestingCapability` wires the thirteen certified domain factories, in the one immutable `CANONICAL_DOMAIN_SEQUENCE`, through explicit dependency injection. No domain is skipped or duplicated; no legacy execution logic and no new orchestration behaviour are introduced; the run is deterministic and the result immutable.
- **Dependency wiring.** The Decision Engine, the connector SPIs, the execution context, the reporting model and the abstract candidates are injected explicitly. There is no service locator and no runtime discovery.
- **Governed registration (`activation.ts`).** `activateCanonical` and `rollbackToLegacy` are pure functions of the current state and a governed event; `selectImplementation` reports the active implementation. Activation makes legacy inactive but never removes it (`legacyAvailable` stays true); rollback reactivates it exactly. Both are deterministic and require no code change.
- **Parallel validation.** `buildParallelValidationReport` compares the capability-contract dimensions and reports every difference explicitly — the intentional internal-representation difference from the ADR-0039 rebuild is declared, never silently equated.
- **Sole authorities preserved.** The Decision Engine remains the sole decision authority; the connector SPIs remain the sole integration boundary; evidence stays by reference; no platform contract is modified and no new Decision Type is introduced.

The activation is certified by execution: `verify-capability-activation.js` (AC-1…AC-10) is registered in the runner and proved with five fault proofs (domain omission, incorrect order, direct provider bypass, platform-contract modification, non-deterministic orchestration — each turns the gate RED).

## 5. Consequences (stated honestly)

- The certified capability can be activated and rolled back deterministically, with legacy retained as the rollback path.
- Activation adds **zero net-new RED governance gates**; the runner's failing set is unchanged (the documented pre-existing reds).
- Internal result representations differ from legacy by design (the ADR-0039 rebuild). This is reported by parallel validation as a declared difference; the capability **contract** — determinism, governance, connector isolation, evidence-by-reference — is preserved, so there is no drift of the contract.
- The composition and registration exist, but **flipping the runtime to canonical in production, and retiring legacy, are governed steps in §6** — not performed by this ADR. Legacy remains present, buildable and recoverable until formal retirement.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

1. **Activation readiness** — confirm the 13 domains certified, the composition present, the sequence valid, no circular dependencies, governance replay deterministic, legacy operational (`verify-capability-activation.js` PASS).
2. **Cut-over** — activate the canonical implementation through governed registration only after parallel validation, governance, and certification pass with stakeholder approval. Legacy remains installed and becomes inactive only; nothing is deleted.
3. **Rollback** — reactivate legacy through `rollbackToLegacy`; deterministic and requiring no code change.
4. **Legacy retirement** — remove legacy only after successful production operation, a stability observation period, governance approval, executive approval, and expiry of the rollback window. Until then legacy remains present, buildable and recoverable.

## 7. Version impact

Additive. New source: `packages/functional-testing-engine/src/canonical-capability.ts`, `packages/functional-testing-engine/src/activation.ts`. New gate: `governance/verification/verify-capability-activation.js`. No platform contract, Decision Type, connector SPI, reporting model, execution context, governance rule or certified domain behaviour is modified. The legacy engine is untouched.

## 8. Affected components

- `packages/functional-testing-engine/src/canonical-capability.ts`
- `packages/functional-testing-engine/src/activation.ts`
- `packages/functional-testing-engine/test/canonical-capability-conformance.test.ts`
- `governance/verification/verify-capability-activation.js`
- `governance/verification/run-all.js`
- `governance/verification/record-fault-proofs.js`
- `docs/certification/ADR-0044-ACTIVATION-CERTIFICATION.md`
