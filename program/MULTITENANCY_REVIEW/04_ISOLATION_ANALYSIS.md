# 04 — Isolation Analysis (per subsystem)

Rating scale: **STRONG** (physically enforced and tested on the running path) · **PARTIAL** (enforced but with a structural gap or untested) · **MISSING** (required, absent) · **BYPASSED** (mechanism exists but the running path goes around it).

| Subsystem | Rating | Basis |
|---|---|---|
| API / Gateway | **STRONG** | mTLS cert-derived scope; 8-check fail-closed; spoof-negative tests — [gateway.ts:94-170](../../packages/platform-runtime/src/gateway.ts#L94-L170) |
| Authentication / Identity | **STRONG** | Cert-bound tokens (`cnf.kid`), nonce replay — [authentication.ts:250-275](../../packages/platform-runtime/src/authentication.ts#L250-L275) |
| Authorisation / PDP | **MISSING** | No PDP; flat path allow-list; no graded roles — [gateway.ts:146-151](../../packages/platform-runtime/src/gateway.ts#L146-L151) |
| Path constructor (primitive) | **STRONG in isolation / BYPASSED in system** | Correct & tested, but constructed only in tests — [tenant-runtime.ts:42-67](../../packages/platform-runtime/src/tenant-runtime.ts#L42-L67) |
| Storage | **BYPASSED** | No running store uses `TenantStorage` |
| Workflow / Orchestration engine | **PARTIAL** | Tenant threaded as label; never validated — [stages.ts:245-256](../../packages/capability-framework/src/stages.ts#L245-L256) |
| Configuration | **PARTIAL** | Per-tenant, no global fallback (good); ADR-0009 scope chain not implemented; unused |
| Decision / Certification | **PARTIAL** | Decisions carried in run outcome, but retrieval run-keyed (L2) |
| AI (prompt assembly) | **STRONG** | Per-request, sovereignty-gated — [agent.ts:199-202](../../packages/capability-framework/src/agent.ts#L199-L202) |
| AI (knowledge recall) | **MISSING/BYPASSED** | Cross-tenant `VectorMemory` recall (L1) |
| Queues | **MISSING (on path)** | `TenantQueues` correct but unused; no worker exists |
| Scheduler | **N/A** | No scheduler implemented |
| Redis / external cache | **N/A / MISSING** | No Redis; in-memory only; no `TenantCache` |
| Database | **N/A** | No database; all state in-memory |
| Blob / storage paths | **BYPASSED** | Only `TenantPaths` builds tenant paths, and it is unused |
| Logging | **PARTIAL** | Call-site content refusal (strong); shared sink + tenant field; nullable tenant — [telemetry.ts:59-72](../../packages/observability/src/telemetry.ts#L59-L72), [:132](../../packages/observability/src/telemetry.ts#L132) |
| Metrics | **STRONG** | Tenant-keyed; no cross-tenant totals — [telemetry.ts:258](../../packages/observability/src/telemetry.ts#L258) |
| Audit | **PARTIAL** | Record carries tenant; retrieval keyed by runId (L2) — [stages.ts:205](../../packages/capability-framework/src/stages.ts#L205) |
| Reporting | **PARTIAL** | Reports include cross-tenant recall output (L1) in five engines |
| Knowledge graph | **MISSING** | Untenanted shared `VectorMemory` (L1); security-engine safe |
| Prompt construction | **STRONG** | See AI (prompt assembly) |

## Detail on the deviating subsystems

### Authorisation / PDP — MISSING
R-08.11 requires a single Policy Decision Point; R-08.9 requires graded roles; R-21.7 requires refusal-on-inactive at the PDP. None exist. Authorisation is one flat `authorisedPaths` list checked in the gateway ([gateway.ts:146-151](../../packages/platform-runtime/src/gateway.ts#L146-L151)). `TenantLifecycle.canExecute` ([lifecycle-state-machine.ts:102](../../packages/tenant-lifecycle/src/lifecycle-state-machine.ts#L102)) — the natural PDP input for R-21.6 — has **zero callers**. A `SUSPENDED`, `PROVISIONED`, or `CLOSED` tenant is indistinguishable from `ACTIVE` at the point work is dispatched.

### Path constructor — STRONG primitive, BYPASSED system
`TenantPaths.path()` enforces all five R-07.4 rejections ([tenant-runtime.ts:52-60](../../packages/platform-runtime/src/tenant-runtime.ts#L52-L60)) and the ADR-0010 tenant-leading layout ([:66](../../packages/platform-runtime/src/tenant-runtime.ts#L66)), with a full negative-test suite ([gateway.test.ts:213-269](../../packages/platform-runtime/test/gateway.test.ts#L213-L269)). R-07.5 "unbypassable," however, is enforced **by convention**: each store voluntarily holds a `TenantPaths` and calls it; nothing at the type level prevents direct `node:fs` use, and `TenantQuotas` already demonstrates the bypass ([tenant-runtime.ts:150-164](../../packages/platform-runtime/src/tenant-runtime.ts#L150-L164) — no `TenantPaths`, raw id used as key). Because no running store is constructed with a registry-bearing `TenantPaths`, the constructor governs nothing in production.

### Orchestration — PARTIAL
Tenant threading is correct and immutable ([stages.ts:245-252](../../packages/capability-framework/src/stages.ts#L245-L252)), but `input.tenantId` is never checked against the registry or lifecycle state. The engine trusts `request.tenantId` verbatim at entry (e.g. [functional orchestrators.ts:696](../../packages/functional-testing-engine/src/orchestrators.ts#L696)).

### Knowledge graph — MISSING (the headline deviation)
Five engines share one untenanted `VectorMemory`; the security engine keeps none and rebuilds per-run — the correct pattern ([security-testing-engine/src/agents/intelligence-layer.ts:39-56](../../packages/security-testing-engine/src/agents/intelligence-layer.ts#L39-L56)). Full analysis in [06_AI_TENANT_ISOLATION.md](06_AI_TENANT_ISOLATION.md).

## The one subsystem to imitate

**`@dbiz/observability` metrics** and **the security-testing engine** are the two places that get it right on the running path — metrics because the tenant is *in the key* ([telemetry.ts:258](../../packages/observability/src/telemetry.ts#L258)), and the security engine because it holds **no shared cross-run state** ([orchestrators.ts:425-459](../../packages/security-testing-engine/src/orchestrators.ts#L425-L459)). Both are the models the remediation adopts.
