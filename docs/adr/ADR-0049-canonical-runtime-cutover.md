# ADR-0049 — Canonical Runtime Cut-over (M5)

**Status:** **PROPOSED** · **Date:** 2026-07-29. This ADR governs switching the live Functional Testing runtime from the legacy engine to the canonical implementation. Cut-over is the production activation gated by ADR-0044/0045/0046/0047/0048; it executes only when every precondition in §6 is met, and its readiness is measured by an executable gate. **No gateway is rerouted, no entry point is switched, and no legacy code is removed by this ADR in its PROPOSED state.** It does not authorise legacy deletion.

> **Stop condition met (CLAUDE.md §5 / the M5 stop clause).** The authorization directs cutting the gateway over to the canonical runtime after demonstrating behavioural equivalence. The repository proves that **behavioural equivalence cannot be demonstrated, and the cut-over cannot proceed, without inventing the missing M4 pieces or a runtime environment** — neither of which this ADR may fabricate. Evidence: (1) there is **no runtime environment** (no container runtime, E-2 NOT MEASURED, GA NOT CERTIFIED) and the canonical has never executed real (ADR-0045 `productionActivationPerformed = false`); (2) the **real request translator, the real EP-dispatch adapter and the real EP transport do not exist** — the canonical runtime cannot run against the real Execution Plane; (3) the canonical produces **abstract** packages by ADR-0039 design while the legacy produces **concrete** authored steps, so "same execution package / same selectors / same actions" is achievable only at M4 with live locator resolution. Rerouting `/v1/execute` now would break the working live authoring service and constitutes the production activation every governing ADR gates on M4 + approvals. Therefore cut-over is captured here as a governed decision with an executable readiness gate, and **deferred**.

## 1. Problem

The programme's end state is one live Functional Testing runtime: the canonical implementation. The bridge (ADR-0048) exists. But switching the live runtime is a production activation that changes what every external caller executes, and it cannot be undone cheaply. It must be gated on demonstrated behavioural equivalence and evidence, not on a directive.

## 2. Context

The gateway (`ip-execute-gateway.mjs` → `authoring-bridge.mjs`) consumes exactly three fields of the legacy `OrchestrationResult`: `run.results.get('execution-planning')` (via `valueOf` → state), `run.results.get('certification')` (via `valueOf().report`), and `run.audit`. The canonical bridge (ADR-0048) returns a `RuntimeExecutionOutcome` carrying the same information. Cut-over requires adapting the gateway to consume the canonical outcome — a gateway change permitted at cut-over — and demonstrating behavioural equivalence on real workloads. No runtime environment exists, and the real M4 integration pieces are absent.

## 3. Alternatives

1. **Cut over now** — reroute the gateway to the canonical runtime immediately. Rejected: no runtime environment, the real translator/EP-adapter/transport do not exist, behavioural equivalence is not demonstrable, it would break the live service, and it violates the preconditions of ADR-0044/0045/0046/0047/0048.
2. **Invent the missing pieces / a compatibility layer** — stub the translator, fake an EP adapter, simulate equivalence. Rejected: fabricated evidence and a workaround, both prohibited.
3. **Govern the cut-over with an executable readiness gate; execute only when ready (chosen)** — capture the decision and its preconditions; measure readiness; keep the legacy runtime live until every precondition is met; then reroute the gateway under a separately authorised change.

## 4. Decision

Adopt evidence-gated cut-over with the legacy runtime retained until ready.

- **Readiness assessment (`runtime-cutover-readiness.ts`).** `assessCutoverReadiness` computes readiness from measured evidence — the M1–M3 bridge certified, a real runtime environment (E-2), the real request translator, EP-dispatch adapter and EP transport implemented, behavioural equivalence demonstrated, the external contracts verified unchanged, and governance + stakeholder + executive approvals. `ready` is true only when EVERY precondition is met; while not ready the legacy runtime MUST remain live, and a not-ready state with the gateway already rerouted is an inconsistent, premature cut-over the assessment detects.
- **Current verdict: NOT READY, legacy live.** With no runtime, no real integration, no demonstrated equivalence and no approvals, cut-over is deferred and the gateway continues to route to the legacy engine.
- **Sole authorities preserved.** No platform contract, Decision Type, connector SPI, `ExecutionPackage`, Execution-Plane protocol or signing is modified. No runtime toggle, dual execution or feature flag is introduced. No sealed symbol is exported.

The governance is certified by execution: `verify-runtime-cutover-readiness.js` (RC-1…RC-8) is registered in the runner and proved with five fault proofs (false readiness claim, undetected premature reroute, a dropped precondition, platform-contract modification, and a premature gateway reroute — each turns the gate RED). The gate is GREEN in the correct current state (bridge present, gateway on legacy, cut-over deferred) and RED if the gateway is rerouted prematurely.

## 5. Consequences (stated honestly)

- Cut-over is governed and measurable; the current state is honestly NOT READY and the legacy runtime remains live.
- **No gateway is rerouted and no entry point is switched by this ADR.** The external HTTP/CLI contract, the `ExecutionPackage`, the Execution-Plane protocol, the evidence contract and signing are all untouched.
- Cut-over adds **zero net-new RED governance gates**; the runner's failing set is unchanged.
- Behavioural equivalence remains the hard dependency and cannot be demonstrated until the M4 real-runtime pieces and a runtime environment exist. When they do, §6 executes the reroute under a separately authorised change.

## 6. Migration strategy (executes only after this ADR is ACCEPTED and readiness is met)

Cut-over executes only when `assessCutoverReadiness` returns `cutover-ready` (every precondition met). Then, under a separate authorised change:
1. **Gateway adaptation** — adapt the gateway to consume the canonical `RuntimeExecutionOutcome` (resolving the ADR-0048 M3 variance without exporting any sealed symbol), preserving the external HTTP/CLI/`ExecutionPackage`/EP-protocol/signing contracts.
2. **Reroute** — switch `/v1/execute` and the other entry points to the canonical runtime; no dual execution, no feature flag.
Until every precondition is met, the gateway routes to the legacy engine and none of the above executes. Legacy deletion is a separate decision (ADR-0046), later still.

## 7. Version impact

Additive. New source: `packages/functional-testing-engine/src/runtime-cutover-readiness.ts`. New gate: `governance/verification/verify-runtime-cutover-readiness.js`. No platform contract, Decision Type, connector SPI, `ExecutionPackage`, Execution Context, governance rule or certified domain is modified. Neither the gateway, the legacy engine nor the canonical bridge is rerouted or altered by this ADR.

## 8. Affected components

- `packages/functional-testing-engine/src/runtime-cutover-readiness.ts`
- `packages/functional-testing-engine/test/runtime-cutover-readiness-conformance.test.ts`
- `governance/verification/verify-runtime-cutover-readiness.js`
- `governance/verification/run-all.js`
- `governance/verification/record-fault-proofs.js`
- `docs/certification/ADR-0049-RUNTIME-CUTOVER-CERTIFICATION.md`
