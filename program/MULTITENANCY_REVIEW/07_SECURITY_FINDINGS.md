# 07 — Security Findings

Findings ordered by severity. Severity reflects impact on tenant isolation and exploitability **as the code stands**, accounting for the mitigating fact that no customer *content* is persisted (only derived signals and platform metadata). Each maps to the threat-model attack path it realises ([22 §3.2](../../docs/architecture/22-security-threat-model.md)).

Legend: severity = **Critical / High / Medium / Low**; each finding is **CONFIRMED** against cited code.

---

## F-1 · HIGH · Cross-tenant knowledge-graph recall (realises P-07 & P-08, violates RR-5)
**Where:** shared `VectorMemory` in five engines — [vector.ts:184](../../packages/capability-framework/src/vector.ts#L184); leak path [penetration intelligence.ts:377](../../packages/penetration-testing-engine/src/agents/intelligence.ts#L377).
**Failure scenario:** Tenant A runs a pen-test; its findings' ids/fingerprints are `remember`ed in the process-shared store. Tenant B's later run `recall`s by finding signature and receives A's finding id, fingerprint, and similarity score, which appear in B's report as "recurring" matches. No storage boundary is crossed; nothing in a storage-layer review would show it.
**Impact:** Cross-tenant inference — the exact RR-5 risk the architecture presumes prohibited. Commercial-intelligence leakage between customers.
**Mitigation present:** raw text not stored (hashed vectors only).
**Fix:** tenant-partition `VectorMemory`/`VectorIndex` (F-1 in [09](09_REMEDIATION_PLAN.md)).

## F-2 · HIGH · Run-state & audit keyed by `runId` only (realises P-05, reproduces R-07.6)
**Where:** `state = new Map<string, RunOutcome>()` keyed by `request.runId` — [functional orchestrators.ts:644](../../packages/functional-testing-engine/src/orchestrators.ts#L644) (also discovery, performance, penetration, dev-change); resume [discovery :678](../../packages/discovery-flow-engine/src/orchestrators.ts#L678); `auditTrailFor(runId)` [performance :607](../../packages/performance-engine/src/orchestrators.ts#L607).
**Failure scenario:** Two tenants on one long-lived orchestrator present the same `runId` (run ids are not proven globally unique across tenants). Tenant B's `retry`/resume reads `state.get(runId)` and **replays tenant A's sealed results**; `auditTrailFor(runId)` returns A's audit trail to B.
**Impact:** Direct cross-tenant data return and result substitution. This is the predecessor's documented failure that R-07.6 exists to prevent — *"a run identifier is not a tenant identifier."*
**Fix:** key state as `${tenantId}:${runId}` and re-validate tenant on entry (F-2 in [09](09_REMEDIATION_PLAN.md)).

## F-3 · HIGH · Physical isolation not enforced on the running path (realises P-05)
**Where:** `TenantPaths` constructed only in tests — [gateway.test.ts:214](../../packages/platform-runtime/test/gateway.test.ts#L214); zero production callers.
**Failure scenario:** Any future or existing store that persists tenant data does so *without* the constructor's registry/traversal checks, because the running system never routes through it. R-07.5 "unbypassable" is convention-only, and `TenantQuotas` already bypasses it ([tenant-runtime.ts:150-164](../../packages/platform-runtime/src/tenant-runtime.ts#L150-L164)).
**Impact:** The architecture's fail-closed guarantee is not in force; the first store added under deadline will fail open by default.
**Fix:** composition root + route all durable state through `TenantPaths` (F-3/F-4 in [09](09_REMEDIATION_PLAN.md)).

## F-4 · MEDIUM · No Policy Decision Point; suspended/inactive tenants can execute (realises P-03, breaks R-21.6/7)
**Where:** `canExecute` has zero callers — [lifecycle-state-machine.ts:102](../../packages/tenant-lifecycle/src/lifecycle-state-machine.ts#L102); no `PolicyDecisionPoint` exists.
**Failure scenario:** A `SUSPENDED` (e.g. for non-payment or a security hold) or `CLOSED` tenant's `execute()` runs all 12 stages, because state is never checked before dispatch. R-21.6 refusal-on-inactive is unenforced.
**Impact:** Commercial and security suspension is ineffective; a tenant halted for cause keeps executing.
**Fix:** PDP reading `canExecute` before dispatch (F-3 in [09](09_REMEDIATION_PLAN.md)).

## F-5 · MEDIUM · Offboarding never purges tenant data (breaks R-21.24/25, R-06.13)
**Where:** `purge()` zero callers — [tenant-runtime.ts:70](../../packages/platform-runtime/src/tenant-runtime.ts#L70); `decommission()` revokes cert only — [registration.ts:160-167](../../packages/platform-runtime/src/registration.ts#L160-L167).
**Failure scenario:** A tenant is offboarded; the `OFFBOARDING→CLOSED` transition triggers no storage deletion. Any tenant-scoped data (once stores are wired) persists indefinitely; purge is neither scheduled nor verified.
**Impact:** Retention-obligation breach; the predecessor's "configuration theatre" failure re-emerges (a declared purge control that does not execute).
**Fix:** wire `purge()` to offboarding + scheduled purge + verification test (F-5 in [09](09_REMEDIATION_PLAN.md)).

## F-6 · MEDIUM · No authoritative tenant registry; three disjoint sets (weakens R-07.4)
**Where:** `TenantPaths.registry` ([tenant-runtime.ts:47](../../packages/platform-runtime/src/tenant-runtime.ts#L47)) vs `RegistrationService.activeTenants` ([registration.ts:55](../../packages/platform-runtime/src/registration.ts#L55)) vs `.registered` ([registration.ts:60](../../packages/platform-runtime/src/registration.ts#L60)); onboarding writes none of them ([bootstrap-orchestrator.ts:127-137](../../packages/tenant-lifecycle/src/bootstrap-orchestrator.ts#L127-L137)).
**Failure scenario:** The R-07.4 registry check consults whatever set the caller passed — potentially stale or over-broad. A freshly-onboarded tenant is in *no* set, so if the constructor were wired, it would reject that tenant as `unregistered`; conversely a caller could pass an over-broad set and admit a departed tenant.
**Impact:** The registry gate is unreliable and unauthoritative.
**Fix:** one registry entity, populated by onboarding, shared by registration and `TenantPaths` (F-6 in [09](09_REMEDIATION_PLAN.md)).

## F-7 · MEDIUM · Secrets held & minted inside the Intelligence Plane (tension with R-3.3 / dimension 2)
**Where:** `TenantVault` stores plaintext secret values in-memory and mints them via `randomBytes` — [tenant-runtime.ts:184,196,214](../../packages/platform-runtime/src/tenant-runtime.ts#L184).
**Failure scenario:** Dimension 2 says secrets are "not held in this plane at all — isolation by absence." A vault that holds/mints secret material in the IP contradicts that on its face; whether platform-internal secrets are in scope needs an explicit ADR-0008 reconciliation.
**Impact:** Either a real deviation or an undocumented exception; both must be resolved before production.
**Fix:** reconcile against [ADR-0008](../../docs/adr/ADR-0008-encryption-at-rest.md); if platform-internal, document the exception and confirm no customer secret can enter (F-7 in [09](09_REMEDIATION_PLAN.md)).

## F-8 · LOW · Graded authorisation not implemented (breaks R-08.9)
**Where:** flat `authorisedPaths` allow-list — [gateway.ts:146-151](../../packages/platform-runtime/src/gateway.ts#L146-L151); no roles.
**Impact:** No operator / tenant-admin / member / auditor distinction; R-08.12's "declared-but-unwired role" failure is pre-empted only because no roles are declared at all.
**Fix:** implement graded roles at the PDP (F-8 in [09](09_REMEDIATION_PLAN.md)).

## F-9 · LOW · Process-global id counter shared across tenants
**Where:** `let sequence = 0` at module scope — [discovery adapters.ts:40](../../packages/discovery-flow-engine/src/adapters.ts#L40) (all engines); global `resetAdapterSequence()`.
**Impact:** Two tenants' runs interleave in one id sequence; a global reset affects all. No customer data; a determinism device. Isolation-hygiene only.
**Fix:** per-run/per-tenant sequence or a run-scoped id source.

## F-10 · LOW · Logging is a shared sink with a tenant field; tenant nullable
**Where:** shared `logs` array — [telemetry.ts:132](../../packages/observability/src/telemetry.ts#L132); tenant defaults to `null` — [:145](../../packages/observability/src/telemetry.ts#L145).
**Impact:** Dimension 7 asks for tenant-*scoped sinks*; this is a shared sink discriminated by field, materially mitigated by the strong call-site content refusal ([:59-72](../../packages/observability/src/telemetry.ts#L59-L72)). An unattributed record can enter the shared stream (content still refused).
**Fix:** require a non-null tenant on any record carrying tenant-derived attributes; consider per-tenant sink partitioning.

---

## Coverage / verification finding (cross-cutting)

**F-V · HIGH (governance) · No executing gate for Doc 07.** The 26-gate suite has `verify-tenant-lifecycle-conformance.js` (Doc 21) but **no `verify-tenant-isolation.js`** (Doc 07). Under the constitution `NOT RUN ≡ FAIL` and R-13.1 (evidence over assertion), C-07.1…C-07.12 are **unverified** and therefore, by the platform's own rule, **failing**. C-07.6 ("ten dimensions, ten tests") has no coverage on the running path; C-07.7 and C-07.8 are actively contradicted by F-1. This is the single most important control to add, because per D-012 it must ship *with* the fixes above.

## Threat-path reconciliation

| Path | Realised by | Status |
|---|---|---|
| P-05 (read via identifier manipulation) | F-2, F-3 | **Exposed** on the orchestration/storage path |
| P-06 (assert another identity) | — | **Mitigated** (mTLS, C-07.11 tested) |
| P-07 (shared cache entry) | F-1 | **Exposed** (VectorMemory) |
| P-08 (via AI context) | F-1 | **Exposed** via retrieval (prompt path clean) |
| P-09 (exhaust shared capacity) | quotas unused on path | **Partially mitigated** (primitive exists, unwired) |
| P-03 (admin reads via tooling) | F-4, R-07.10 untested | **Not demonstrated** |
