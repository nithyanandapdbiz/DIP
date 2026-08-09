# 09 — Remediation Plan

**Constraint honoured:** no redesign. The architecture is correct and frozen; every item below is *wiring, scoping, or coverage* that brings the implementation up to the existing design. Each fix follows D-012 — **declaration and enforcement land in one change** (the code fix ships with its test/gate).

Priority: **P0** blocks multi-tenant production; **P1** required before GA; **P2** hardening.

---

## F-3/F-4 · P0 · Assemble a composition root + Policy Decision Point
**Gap:** no PDP; nothing binds gateway-authenticated tenant to downstream stores; `canExecute` unused.
**Change (minimum):**
1. Add a `PolicyDecisionPoint` in `platform-runtime` (or `platform-core`) that takes the gateway result and, before any dispatch, (a) validates the tenant against the one registry (F-6), (b) reads `TenantLifecycle.canExecute` ([lifecycle-state-machine.ts:102](../../packages/tenant-lifecycle/src/lifecycle-state-machine.ts#L102)) and returns a **refusal** for non-`ACTIVE` (R-21.6/7), (c) constructs the request-scoped `TenantPaths` bound to that authenticated tenant.
2. Route every capability `execute(request)` through the PDP; the engine receives a *validated* tenant context, not a raw `request.tenantId`.
**Enforces:** R-07.9, R-08.11, R-21.6/7. **Closes:** F-3, F-4.
**Test:** suspended/closed/unregistered tenant → refusal, before any stage runs.

## F-1 · P0 · Tenant-partition the knowledge graph (`VectorMemory`)
**Gap:** shared, untenanted store leaks derived signals across tenants.
**Change (minimum), pick one:**
- **(a) Add a mandatory tenant dimension** to `VectorIndex`/`VectorMemory`: `remember(tenantId, …)`, `recall(tenantId, …)`, `search(tenantId, …)`; store `tenantId` on `VectorRecord` ([vector.ts:102-108](../../packages/capability-framework/src/vector.ts#L102-L108)) and filter on it in `search` ([:140-149](../../packages/capability-framework/src/vector.ts#L140-L149)); fail closed on absent tenant. **OR**
- **(b) Adopt the security-engine pattern** platform-wide: hold no shared `VectorMemory`; rebuild per-run from injected history ([security intelligence-layer.ts:39-56](../../packages/security-testing-engine/src/agents/intelligence-layer.ts#L39-L56)).
**Enforces:** C-07.7, C-07.8, dimension 9, RR-5. **Closes:** F-1.
**Test:** tenant A `remember`, tenant B `recall` → **no hit** (the isolation test currently absent for this store).

## F-2 · P0 · Tenant-scope run-state & audit keys
**Gap:** `Map<runId, RunOutcome>` collides across tenants; resume/retry/audit cross tenants.
**Change (minimum):** key the state map as `` `${tenantId}:${runId}` `` in all five engines ([functional :644](../../packages/functional-testing-engine/src/orchestrators.ts#L644), discovery :641, and the performance/penetration/dev-change equivalents); have `resume`/`retry`/`auditTrailFor` require the tenant and look up the composite key.
**Enforces:** R-07.6. **Closes:** F-2.
**Test:** two tenants, same `runId` → B cannot read A's outcome or audit.

## F-6 · P1 · One authoritative tenant registry
**Gap:** three disjoint sets; onboarding populates none.
**Change (minimum):** introduce a single registry entity owned by `RegistrationService`; onboarding stage-2 writes the tenant into it ([bootstrap-orchestrator.ts:127-137](../../packages/tenant-lifecycle/src/bootstrap-orchestrator.ts#L127-L137)); `TenantPaths` is constructed from *that* registry (a live view, not a snapshot array). Collapse `activeTenants`/`registered`/`TenantPaths.registry` to one source with typed sub-states.
**Enforces:** R-07.4 authoritatively. **Closes:** F-6.
**Test:** onboarded tenant is immediately path-constructible; departed tenant is rejected.

## F-5 · P1 · Wire and verify offboarding purge
**Gap:** `purge()` never called; `decommission()` deletes no data.
**Change (minimum):** on `OFFBOARDING→CLOSED` ([lifecycle-state-machine.ts:46](../../packages/tenant-lifecycle/src/lifecycle-state-machine.ts#L46)) invoke `TenantPaths.purge(tenantId)` ([tenant-runtime.ts:70](../../packages/platform-runtime/src/tenant-runtime.ts#L70)); add scheduled retention purge (R-06.13); add the R-06.14/R-21.25 test proving data is unreadable afterwards.
**Enforces:** R-21.24/25, R-06.13/14. **Closes:** F-5.

## F-7 · P1 · Reconcile the in-plane secret vault
**Gap:** `TenantVault` holds/mints secrets in the IP vs "isolation by absence."
**Change (minimum):** decide and document via [ADR-0008](../../docs/adr/ADR-0008-encryption-at-rest.md) whether `TenantVault` is platform-internal (not customer C2). If retained, add a type-level guard that no customer-supplied secret can enter it, and a test asserting C2 never reaches it. If not, remove customer-secret storage from the IP.
**Enforces:** R-3.3, R-08.18, dimension 2. **Closes:** F-7.

## F-8 · P1 · Graded authorisation at the PDP
**Gap:** flat path allow-list; no roles.
**Change (minimum):** implement operator / tenant-admin / member / auditor at the PDP (F-3), evaluated once (R-08.11), each role enforced by a code path (R-08.12).
**Enforces:** R-08.9/11/12. **Closes:** F-8.

## F-V · P0 (ships with F-1/F-2/F-3) · Add `verify-tenant-isolation.js`
**Gap:** no executing gate for Doc 07; C-07.1…C-07.12 are `NOT RUN ≡ FAIL`.
**Change (minimum):** add a gate registered in [run-all.js](../../governance/verification/run-all.js) that proves the ten dimensions (C-07.6) on the *running* path, plus a source scan for direct path assembly (C-07.2) and a "PDP gates inactive tenants" check. Ship it with a **recorded, replayed fault proof** (D-012) — e.g. plant a cross-tenant `VectorMemory` hit and confirm the gate goes red.
**Enforces:** the constitution's own coverage rule. **Closes:** F-V.

## F-9 · P2 · Per-run id sequence
Replace module-global `sequence` ([discovery adapters.ts:40](../../packages/discovery-flow-engine/src/adapters.ts#L40)) with a run-scoped id source.

## F-10 · P2 · Logging hardening
Require non-null tenant on any record carrying tenant-derived attributes; consider per-tenant sink partitioning ([telemetry.ts:132](../../packages/observability/src/telemetry.ts#L132)).

## R-07.10 · P1 · Demonstrate admin-surface isolation
When any admin/diagnostic surface is added, it must route through the same PDP + `TenantPaths`; add the per-surface isolation test (C-07.10) — today there is nothing to test, which is itself the gap.

## ADR-0009 · P1 · Implement the narrowing config scope chain
Replace the flat `TenantConfiguration` map with the `platform → capability → tenant → environment → run` narrowing chain, with provenance and no-widen enforcement.

---

## Programme-state reconciliation (CHARTER §3)

This review found drift between claim and disk that must be recorded in the register, not in a second copy:

1. **`PROJECT_STATE.md` / `IMPLEMENTATION_STATUS.md:48`** — qualify "physical isolation proven" to "physical isolation **primitive** proven by unit test; **not yet wired** into any capability execution path (see MULTITENANCY_REVIEW)."
2. **`RISKS.md`** — raise risks for F-1, F-2, F-3/F-4 (multi-tenant leakage / suspended-tenant execution) as **open, GA-blocking**.
3. **`TECHNICAL_DEBT.md`** — record the unwired isolation primitives and the missing `verify-tenant-isolation` gate.
4. **`docs/adr/`** — F-7 needs an ADR reconciliation; the PDP introduction (F-3) is a significant decision warranting an ADR per CHARTER §11.

These are *recommended entries for the owning session to make*; this review does not itself edit the frozen registers, to avoid creating a second source of truth (CHARTER §4).
