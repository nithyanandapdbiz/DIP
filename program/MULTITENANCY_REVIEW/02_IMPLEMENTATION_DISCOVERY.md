# 02 — Implementation Discovery

Every tenancy-relevant implementation site found in `DBiz_IntelligencePlane/packages/`, with exact locations. "Wired?" answers the only question that matters for a physical-isolation model: **does a running request path reach this code?**

## Method

Four independent discovery passes over the whole `packages/` tree, then cross-checked by grep for every construction/import of the isolation types. The decisive query — *who constructs `TenantPaths` / `TenantStorage` / `TenantQueues` outside tests?* — returned **zero** non-test hits.

## Inventory

### A. The isolation primitives — package `@dbiz/platform-runtime`

| Concern | File · class · lines | Wired into a running path? |
|---|---|---|
| **Canonical path constructor** | [tenant-runtime.ts:42-67](../../packages/platform-runtime/src/tenant-runtime.ts#L42-L67) `TenantPaths.path()` | **No** — constructed only in [gateway.test.ts:214](../../packages/platform-runtime/test/gateway.test.ts#L214) |
| Prefix purge | [tenant-runtime.ts:70-73](../../packages/platform-runtime/src/tenant-runtime.ts#L70-L73) `TenantPaths.purge()` | **No** — zero callers |
| Per-tenant storage | [tenant-runtime.ts:77-96](../../packages/platform-runtime/src/tenant-runtime.ts#L77-L96) `TenantStorage` | **No** |
| Per-tenant queues | [tenant-runtime.ts:99-128](../../packages/platform-runtime/src/tenant-runtime.ts#L99-L128) `TenantQueues` | **No** |
| Per-tenant configuration | [tenant-runtime.ts:131-147](../../packages/platform-runtime/src/tenant-runtime.ts#L131-L147) `TenantConfiguration` | **No** |
| Per-tenant quotas | [tenant-runtime.ts:150-164](../../packages/platform-runtime/src/tenant-runtime.ts#L150-L164) `TenantQuotas` | **No** — and bypasses the constructor |
| Secret vault | [tenant-runtime.ts:183-232](../../packages/platform-runtime/src/tenant-runtime.ts#L183-L232) `TenantVault` | **No** — and holds secrets in-plane |

### B. The perimeter — package `@dbiz/platform-runtime` (this part **is** wired)

| Concern | File · class/method · lines | Notes |
|---|---|---|
| **mTLS gateway** (tenant established here) | [gateway.ts:94-170](../../packages/platform-runtime/src/gateway.ts#L94-L170) `ApiGateway.handle()` | Tenant from peer-cert CN; 8-check pipeline; fails closed |
| Real mTLS listener | [gateway.ts:174-197](../../packages/platform-runtime/src/gateway.ts#L174-L197) | `requestCert:true, rejectUnauthorized:true`; peer cert from socket |
| Caller-supplied tenant (accepted, ignored for authz) | [gateway.ts:40-45](../../packages/platform-runtime/src/gateway.ts#L40-L45) `GatewayRequest.claimedTenantId` | Used only to detect/audit spoofing |
| Certificate authority (tenant bound in cert) | [certificate-authority.ts:97-106](../../packages/platform-runtime/src/certificate-authority.ts#L97-L106), validate [:158-181](../../packages/platform-runtime/src/certificate-authority.ts#L158-L181) | CN + SAN `urn:dbiz:tenant:<id>` |
| Authorisation server (cert-bound tokens) | [authentication.ts:200-213](../../packages/platform-runtime/src/authentication.ts#L200-L213) issue, [:250-275](../../packages/platform-runtime/src/authentication.ts#L250-L275) verify | `cnf.kid` binds token to cert; nonce replay check |
| Registration service | [registration.ts:88-139](../../packages/platform-runtime/src/registration.ts#L88-L139) `register()` | One-time credential, idempotent, atomic |
| Registry set (subscription) | [registration.ts:55](../../packages/platform-runtime/src/registration.ts#L55) `activeTenants` | Disjoint from `TenantPaths.registry` |
| Registry map (EP grants) | [registration.ts:60](../../packages/platform-runtime/src/registration.ts#L60) `registered` | Disjoint again |

### C. Tenant lifecycle — package `@dbiz/tenant-lifecycle`

| Concern | File · lines | Wired? |
|---|---|---|
| Six-state machine | [lifecycle-state-machine.ts:23-48](../../packages/tenant-lifecycle/src/lifecycle-state-machine.ts#L23-L48) | Object exists; see below |
| **Execution-eligibility gate** | [lifecycle-state-machine.ts:102](../../packages/tenant-lifecycle/src/lifecycle-state-machine.ts#L102) `get canExecute()` | **No callers** — no PDP reads it |
| Activation prerequisite (stages 10–12) | [lifecycle-state-machine.ts:125-134](../../packages/tenant-lifecycle/src/lifecycle-state-machine.ts#L125-L134) | Enforced within `transition()` only |
| Onboarding orchestrator (IP stages 1–7) | [bootstrap-orchestrator.ts:86](../../packages/tenant-lifecycle/src/bootstrap-orchestrator.ts#L86) `onboard()` | Runs; but provisions no storage partition and populates no registry |
| Stage-2 "tenant creation" | [registration.ts:72-74](../../packages/platform-runtime/src/registration.ts#L72-L74) `recordTenantCreated()` | **Audit-only** |

### D. Capability orchestration — `@dbiz/capability-framework` + six engines

| Concern | File · lines | Notes |
|---|---|---|
| 12-stage runner | [capability-framework/src/stages.ts:221](../../packages/capability-framework/src/stages.ts#L221) `runCapability()` | Synchronous; tenant threaded but not validated |
| Stage context (carries tenant) | [stages.ts:128-138](../../packages/capability-framework/src/stages.ts#L128-L138) `StageContext`, tenant copied per-stage [:245-252](../../packages/capability-framework/src/stages.ts#L245-L252) | Threading only — no registry/state check |
| Agent context (carries tenant) | [capability-framework/src/agent.ts:113](../../packages/capability-framework/src/agent.ts#L113) | |
| **Shared knowledge store** | [capability-framework/src/vector.ts:184-203](../../packages/capability-framework/src/vector.ts#L184-L203) `VectorMemory`; index [:124-149](../../packages/capability-framework/src/vector.ts#L124-L149) | **No tenant dimension** |
| Prompt sovereignty gate | [agent.ts:137-141](../../packages/capability-framework/src/agent.ts#L137-L141) `FORBIDDEN_IN_PROMPT`, enforced [:199-202](../../packages/capability-framework/src/agent.ts#L199-L202) | Clean — see [06](06_AI_TENANT_ISOLATION.md) |
| Module-level id counter | e.g. [discovery-flow-engine/src/adapters.ts:40](../../packages/discovery-flow-engine/src/adapters.ts#L40) `let sequence = 0` | Process-global, cross-tenant (low severity) |

**Per-engine shared instance fields (`memory` + run-keyed `state`):**

| Engine | `VectorMemory` field | Run-state map |
|---|---|---|
| functional-testing | [orchestrators.ts:647](../../packages/functional-testing-engine/src/orchestrators.ts#L647) | [:644](../../packages/functional-testing-engine/src/orchestrators.ts#L644) |
| discovery-flow | [orchestrators.ts:643](../../packages/discovery-flow-engine/src/orchestrators.ts#L643) | [:641](../../packages/discovery-flow-engine/src/orchestrators.ts#L641) |
| performance | [orchestrators.ts:543](../../packages/performance-engine/src/orchestrators.ts#L543) | — |
| penetration | [orchestrators.ts:389](../../packages/penetration-testing-engine/src/orchestrators.ts#L389) | — |
| dev-change | [orchestrators.ts:558](../../packages/dev-change-engine/src/orchestrators.ts#L558) | — |
| **security-testing** | **none** — [orchestrators.ts:425-459](../../packages/security-testing-engine/src/orchestrators.ts#L425-L459); `auditTrailFor` returns `[]` | **none** — the safe counter-example |

### E. Observability — package `@dbiz/observability`

| Concern | File · lines | Notes |
|---|---|---|
| Call-site content refusal | [telemetry.ts:59-72](../../packages/observability/src/telemetry.ts#L59-L72) `assertEmittable()` | Real enforcement; rejects payload-shaped fields/values |
| Log sink (shared + tenant field) | [telemetry.ts:132](../../packages/observability/src/telemetry.ts#L132), `byTenant()` [:208-210](../../packages/observability/src/telemetry.ts#L208-L210) | Shared array, query-time filter |
| Metrics (tenant-keyed) | [telemetry.ts:258](../../packages/observability/src/telemetry.ts#L258) `key()`; reads [:304-347](../../packages/observability/src/telemetry.ts#L304-L347) | Tenant-scoped; no cross-tenant totals |

## Governance / verification layer

| Concern | Location | State |
|---|---|---|
| Verification gates registered | [governance/verification/run-all.js](../../governance/verification/run-all.js) | **26 gates** |
| Tenant **lifecycle** gate (Doc 21) | `governance/verification/verify-tenant-lifecycle-conformance.js` | Present |
| Tenant **isolation** gate (Doc 07) | — | **ABSENT** |

## Two decisive negative results

1. `grep "new TenantPaths\|new TenantStorage\|new TenantQueues"` across `src/` → **only tests**. The physical-isolation constructor governs nothing that runs.
2. `grep "canExecute\|\.purge("` across `src/` → **definitions only, zero callers**. The execution gate and the purge primitive are never invoked.

These two results, more than any single line of code, define the compliance gap analysed in the sections that follow.
