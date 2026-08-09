# ADR-0048 — Canonical Runtime Integration, Phase M1–M3

**Status:** **PROPOSED** · **Date:** 2026-07-29. Implements only the approved ADR-0047 architecture, Phases M1–M3, as three additive in-reference components. No redesign, no supersession of ADR-0039/0040, no governance-contract change, no runtime cut-over, no legacy removal, no entry-point switch.

## 1. Problem

ADR-0047 decided the architecture that lets the certified ADR-0039 canonical capability become the production runtime — reuse the `ExecutionPackage` contract and the cross-plane mechanism, and add three additive components. Those components must now be built, in-reference, gate-first, without touching the legacy engine, the gateway, or any frozen contract.

## 2. Context

The `ExecutionPackage` contract (`packages/contracts/src/execution-package.ts`) and the content hash (`hash`) already exist. The canonical composition takes its runtime connector as an injected dependency. Detached signing (ADR-0007) and evidence-by-reference (INV-1) already exist. The Intelligence Plane authors and dispatches; the Execution Plane executes (doc 20 R-20.10). There is no runtime environment (E-2 NOT MEASURED), so M1–M3 are qualified in-reference only.

## 3. Alternatives

Rejected: inventing a new package format, a fake/simulated execution adapter, browser execution in the Intelligence Plane, modifying the `AdapterRegistry` or any frozen contract, wiring the gateway or cutting over. Chosen: three additive components — Composer, Runtime Execution SPI, Entry-Point Bridge — reusing the frozen contracts, validated in-reference with a fault-proved gate.

## 4. Decision

Implement the three components additively.

- **Canonical Authoring Composer (`canonical-authoring-composer.ts`).** `composeExecutionPackage(result, meta)` projects a `CanonicalCapabilityResult` into a valid `ExecutionPackage`, reusing the frozen contract and the content hash. Deterministic (all timestamps/identities are inputs). It invents no selector; abstract operation parameters carry the canonical references; in-reference the package `mode` is `dry-run` (R-14.10).
- **Runtime Execution SPI (`runtime-execution-spi.ts`).** `createRuntimeExecutionSpi(signer, transport)` validates the package, obtains a detached signature (ADR-0007), dispatches it to the Execution Plane through an injected transport, and ingests the verdict and evidence references. It refuses unsigned, invalid, and missing-evidence packages, and executes nothing in the Intelligence Plane. Signer and transport are injected — real at runtime, reference (real crypto, real detached signature) in-reference. No fake adapter.
- **Runtime Entry-Point Bridge (`runtime-entry-point-bridge.ts`).** `createRuntimeEntryPointBridge(deps)` runs `RuntimeExecutionRequest → CanonicalCapabilityInput → canonical capability → Composer → Runtime Execution SPI → RuntimeExecutionOutcome`, deterministically, wired to no gateway.

Certified by execution: `verify-canonical-runtime-integration.js` (CI-1…CI-10), registered and proved with six fault proofs (invalid package accepted, unsigned package dispatched, missing-evidence verdict accepted, browser execution in the IP, AdapterRegistry touched, connector-SPI bypass — each turns the gate RED).

## 5. Consequences (stated honestly)

- The three components are implemented and certified in-reference; the frozen contracts, the legacy engine, and the gateway are untouched; zero net-new RED gates.
- **Architectural variance (surfaced, not worked around):** the legacy external result object `OrchestrationResult` embeds sealed `StageResult`s whose `SEAL` is a module-private symbol in `@dbiz/capability-framework`; a sealed result cannot be constructed outside the legacy stage machinery. The bridge therefore returns a canonical-native `RuntimeExecutionOutcome` carrying the same information the external contract exposes. Mapping it onto the legacy sealed `OrchestrationResult` requires either adapting the gateway (out of M1–M3 scope) or exporting the module-private `SEAL` (a frozen-contract change — prohibited); both are deferred to the governed M5 cut-over. No `SEAL` was exported and no workaround was introduced.
- M4 (real-environment qualification), M5 (cut-over), and M6 (retirement) remain blocked on a runtime environment (E-2) and approvals; GA remains NOT CERTIFIED.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

M1–M3 are the components delivered here (in-reference). At M4 a runtime environment supplies a real signing key and a real Execution-Plane transport, and ADR-0045 qualifies the runtime. At M5 the gateway is adapted (its own change) to consume the canonical runtime through the ADR-0044 activation mechanism. At M6 the legacy engine is retired via the ADR-0046 readiness gate. Each step is separately authorised and reversible.

## 7. Version impact

Additive. New source: `canonical-authoring-composer.ts`, `runtime-execution-spi.ts`, `runtime-entry-point-bridge.ts`. New gate: `verify-canonical-runtime-integration.js`. No platform contract, Decision Type, connector SPI shape, execution context, reporting model, `ExecutionPackage` contract, `AdapterRegistry`, `EngineRuntime`, governance rule or certified domain is modified. The legacy engine and the gateway are untouched.

## 8. Affected components

- `packages/functional-testing-engine/src/canonical-authoring-composer.ts`
- `packages/functional-testing-engine/src/runtime-execution-spi.ts`
- `packages/functional-testing-engine/src/runtime-entry-point-bridge.ts`
- `packages/functional-testing-engine/test/canonical-runtime-integration-conformance.test.ts`
- `governance/verification/verify-canonical-runtime-integration.js`
- `governance/verification/run-all.js`
- `governance/verification/record-fault-proofs.js`
- `docs/certification/ADR-0048-CANONICAL-RUNTIME-INTEGRATION-CERTIFICATION.md`
