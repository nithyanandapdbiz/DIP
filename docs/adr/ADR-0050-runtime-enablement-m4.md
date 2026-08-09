# ADR-0050 — Runtime Enablement (M4)

**Status:** **PROPOSED** · **Date:** 2026-07-29. This ADR implements the real runtime-infrastructure components ADR-0049 proved missing, so the canonical Functional Testing runtime can eventually execute against a real Execution Plane. It is an implementation authorization, **not** a production activation, a runtime cut-over, or a legacy retirement. No gateway, entry point or production routing is changed.

> **Honest boundary.** M4.1–M4.4 (the four components) are implemented in-reference with the external boundaries — the network transport, the locator source and the signer — as **injected ports** (real at deployment, references in-reference). **M4.5 (end-to-end integration against a real Execution Plane) remains NOT MEASURED**: there is no container runtime (E-2 NOT MEASURED) and no reachable Execution Plane (it is the separate customer-owned plane). No production readiness, behavioural equivalence or GA is claimed.

## 1. Problem

ADR-0049 determined runtime cut-over is NOT READY, blocked in part on missing runtime infrastructure: a real request translator, a live `ApplicationStrategyAdapter`, an Execution Plane transport, and an evidence return channel. Until these exist, the canonical runtime cannot run against a real Execution Plane and behavioural equivalence cannot be attempted. This ADR implements those components — and only those.

## 2. Context

The Intelligence Plane authors and dispatches a signed `ExecutionPackage`; the Execution Plane executes it and returns evidence by reference (doc 20 R-20.10/R-20.14, INV-1). The cross-plane transport, signing (ADR-0007) and evidence-by-reference mechanisms already exist (`ip-execute-gateway.mjs`, `package-signing.ts`, `@dbiz/contracts` `hash`/`verify`, the ADR-0048 `ExecutionPlaneTransport` interface). The Execution Plane is a separate, customer-owned plane; the Intelligence Plane reaches it only through the declared contract, never a filesystem path. No runtime environment exists here.

## 3. Alternatives

1. **Simulate execution / stub the EP** — placeholder implementations that fake execution and evidence. Rejected: prohibited, and the exact failure the governance programme prevents.
2. **Wait for a runtime environment** — build nothing until E-2 exists. Rejected: the component logic is buildable and validatable in-reference now, removing the architectural blocker.
3. **Implement the components with the external boundaries as injected ports; validate the logic in-reference; report M4.5 NOT MEASURED (chosen)** — real components that reuse the existing transport/signature/evidence mechanisms, with the network/locator/signer injected; validated in-reference; the real-EP integration honestly deferred to a runtime environment.

## 4. Decision

Implement the four M4 components as real, additive infrastructure with injected external ports.

- **Execution Request Translator (`runtime/execution-request-translator.ts`).** `translateExecutionRequest` maps `ExecutionRequest → CanonicalCapabilityInput` deterministically and losslessly, preserving the correlation id, tenant identity, run id and story id; the story, models, candidates and rules arrive from injected providers (the real project adapter and tenant runtime profile). It fabricates nothing.
- **Live ApplicationStrategyAdapter (`runtime/live-application-strategy-adapter.ts`).** `createLiveApplicationStrategyAdapter` resolves runtime **locators** through an injected resolver (the real application model / Execution-Plane discovery) — supplying the concrete selectors the abstract domains lack — and records the interaction intent. It runs **no browser in the Intelligence Plane** and fabricates no execution result; the Execution Plane executes.
- **Execution Plane Transport (`runtime/execution-plane-transport.ts`).** `createExecutionPlaneTransport` implements the frozen `ExecutionPlaneTransport` interface with an injected network `send` and signature verifier. It enforces bounded retry, timeout surfacing, response-signature verification, correlation matching, and evidence-by-reference — refusing a transport failure, an unverifiable signature, a correlation mismatch, or a missing required evidence reference. It reuses the existing signing/evidence mechanisms and adds no second protocol.
- **Evidence Return Channel (`runtime/evidence-return-channel.ts`).** `receiveEvidence` ingests the Execution Plane's returned evidence as references, preserves the correlation id, propagates status, returns an immutable result, and **refuses any reference carrying an embedded payload** (INV-1).

The infrastructure is certified by execution: `verify-runtime-enablement.js` (RE-1…RE-8) is registered in the runner and proved with six fault proofs (invalid transport, invalid signature, missing evidence, retry/timeout policy ignored, correlation mismatch, and browser execution in the Intelligence Plane — each turns the gate RED).

## 5. Consequences (stated honestly)

- The runtime infrastructure exists and its logic is validated in-reference; one architectural blocker to cut-over is removed.
- **M4.5 end-to-end EP integration remains NOT MEASURED** — no container runtime, no reachable Execution Plane. No production readiness, behavioural equivalence or GA is claimed, and none is implied.
- No gateway, CLI, scheduler or production routing is changed; the legacy runtime is untouched; no platform contract, `ExecutionPackage`, `AdapterRegistry`, Decision Engine or certified domain is modified.
- Cut-over (M5) remains gated by ADR-0049 on M4.5 (real integration), demonstrated behavioural equivalence, and approvals — none of which this ADR provides.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

M4.1–M4.4 are additive and in-reference now. When a runtime environment (E-2) and a reachable Execution Plane exist, **M4.5** runs the real ports end to end (package generation → transmission → EP acceptance → EP execution → evidence retrieval → runtime outcome) in a non-production environment, producing measured evidence. Then ADR-0049 §6 (cut-over) may proceed, after demonstrated behavioural equivalence and approvals. Legacy retirement (ADR-0046) is later still.

## 7. Version impact

Additive. New source under `packages/functional-testing-engine/src/runtime/` (translator, live adapter, transport, evidence channel). New gate: `governance/verification/verify-runtime-enablement.js`. No platform contract, Decision Type, connector SPI, `ExecutionPackage`, `AdapterRegistry`, Execution Context, governance rule or certified domain is modified. Neither the gateway nor the legacy engine is changed.

## 8. Affected components

- `packages/functional-testing-engine/src/runtime/execution-request-translator.ts`
- `packages/functional-testing-engine/src/runtime/live-application-strategy-adapter.ts`
- `packages/functional-testing-engine/src/runtime/execution-plane-transport.ts`
- `packages/functional-testing-engine/src/runtime/evidence-return-channel.ts`
- `packages/functional-testing-engine/test/runtime-enablement-conformance.test.ts`
- `governance/verification/verify-runtime-enablement.js`
- `governance/verification/run-all.js`
- `governance/verification/record-fault-proofs.js`
- `docs/certification/ADR-0050-RUNTIME-ENABLEMENT-CERTIFICATION.md`
