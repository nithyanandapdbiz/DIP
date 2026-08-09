# 03 — Tenant Context Lifecycle

Where tenant context **enters**, is **validated**, **propagates**, and where it is **dropped**. The finding: context is established correctly and immutably at the perimeter, threaded faithfully through the 12 stages as a **label**, and then **never re-validated or used to scope any store**. Establishment is strong; enforcement past the gateway is absent.

## Sequence — as implemented today

```
Execution Plane (customer tenancy, single-tenant)
   │  mutual TLS, client certificate (CN + SAN urn:dbiz:tenant:<id>)
   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ ApiGateway.handle(peerCertPem, request)         gateway.ts:94-170           │
│  1 cert present ......................... else 401   (:95-99)   FAIL-CLOSED  │
│  2 chain/expiry/revocation/TENANT-BINDING else 401   (:112-117)             │
│  3 OAuth token present .................. else 401   (:119-123)             │
│  4 token sig/exp/CERT-BINDING(cnf.kid)/nonce else 401 (:125-129)            │
│  5 token.sub == cert tenant ............. else 403   (:131-136)             │
│  6 claimedTenantId (if any) == cert tenant else 403  (:138-144) ← anti-spoof│
│  7 path in authorisedPaths allow-list ... else 403   (:146-151)             │
│  8 per-tenant rate limit ................ else 429   (:153-165)             │
│  ✔ return { status:200, tenantId: <FROM CERTIFICATE> }  (:167-169)          │
└───────────────────────────────────────────────────────────────────────────┘
   │  tenantId is a VALUE the caller must now thread by hand
   ▼
   ??? no composition root, no Policy Decision Point ???
   │
   ├─► TenantLifecycle.canExecute (ACTIVE?)   lifecycle-state-machine.ts:102   ← NEVER CALLED
   ├─► TenantPaths.path(tenantId,…)           tenant-runtime.ts:51            ← NEVER CALLED (prod)
   │
   ▼  what actually runs:
┌───────────────────────────────────────────────────────────────────────────┐
│ <engine>.execute(request)   e.g. functional orchestrators.ts:666            │
│   tenantId := request.tenantId   ← TRUSTED VERBATIM, never re-validated      │
│   runCapability(input)           stages.ts:221                              │
│     for stage in 12 STAGES:                                                 │
│       ctx = { tenantId: input.tenantId, runId, … }   stages.ts:245-252     │
│       capability.stages[stage](ctx, emitter)         stages.ts:256          │
│   ── touches shared, UNTENANTED state ──                                    │
│     this.memory : VectorMemory   (shared across tenants)  → LEAK L1         │
│     this.state  : Map<runId, RunOutcome>  (run-keyed)     → LEAK L2         │
└───────────────────────────────────────────────────────────────────────────┘
```

## Stage-by-stage

### 1. Entry & authentication — **STRONG (satisfied)**
Tenant identity is parsed from the **TLS-verified peer certificate**, not from any request field ([gateway.ts:102-110](../../packages/platform-runtime/src/gateway.ts#L102-L110)). The peer cert comes from the live socket ([gateway.ts:193-197](../../packages/platform-runtime/src/gateway.ts#L193-L197)), and the tenant is bound *inside* the certificate at issuance (CN + SAN URI, [certificate-authority.ts:97-106](../../packages/platform-runtime/src/certificate-authority.ts#L97-L106)) and re-verified on validation ([:175-178](../../packages/platform-runtime/src/certificate-authority.ts#L175-L178)). **R-07.8, R-08.6 satisfied.**

### 2. Anti-spoofing — **STRONG (satisfied)**
A caller-supplied `claimedTenantId` is *accepted and deliberately ignored for authorisation*, used only to detect and audit a spoof attempt ([gateway.ts:138-144](../../packages/platform-runtime/src/gateway.ts#L138-L144)). Proven by real negative tests over an actual mTLS socket ([mtls-integration.test.ts:224-246](../../packages/platform-runtime/test/mtls-integration.test.ts#L224-L246)) and in-process ([gateway.test.ts:193-210](../../packages/platform-runtime/test/gateway.test.ts#L193-L210)). **C-07.11, C-08.3 satisfied.**

### 3. Authorisation — **PARTIAL (deviation)**
The only authorisation past authentication is a **flat path allow-list** ([gateway.ts:146-151](../../packages/platform-runtime/src/gateway.ts#L146-L151)) with **no role grading**. R-08.9 (graded: operator / tenant-admin / member / auditor) is **NOT IMPLEMENTED**, and R-08.11 (single PDP) has no home because **no PDP exists**.

### 4. Propagation — **THREADED, NOT ENFORCED**
`runCapability` rebuilds a fresh `StageContext` per stage, copying `tenantId` into each ([stages.ts:245-252](../../packages/capability-framework/src/stages.ts#L245-L252)); agents also receive it ([agent.ts:113](../../packages/capability-framework/src/agent.ts#L113)). This is faithful, immutable threading — but the framework **never validates `input.tenantId`** against a registry and **never checks lifecycle state**. A bogus, unregistered, or suspended tenant id runs all 12 stages normally. There is **no request-scoped enforcing context** and **no `AsyncLocalStorage`** anywhere in the platform; nothing structurally binds "gateway authenticated tenant X" to "store called with tenant X."

### 5. Validation past the gateway — **MISSING**
`R-07.9` ("no ambient/default tenant; fail, not fall back") is honoured *locally* in the sense that every store method requires an explicit `tenantId` with no fallback — but that is moot because those stores are not on the path. On the path that runs, the tenant id is a trusted string. **The link between authentication and storage is convention, not code.**

### 6. Background / async recovery — **N/A (no worker), but a latent gap**
There is no background worker; `runCapability` is synchronous. The nearest async construct is **resume/retry**, which reads `this.state.get(request.runId)` ([discovery orchestrators.ts:678](../../packages/discovery-flow-engine/src/orchestrators.ts#L678)) — **keyed by run id only**. When queues/workers are eventually added, the architecture's requirement that a worker *recover and re-validate* tenant context has **no mechanism to inherit**; the `TenantQueues` primitive that would provide it ([tenant-runtime.ts:99](../../packages/platform-runtime/src/tenant-runtime.ts#L99)) is unused.

### 7. Outbound & response isolation — **SATISFIED by sovereignty design**
The IP never initiates into a customer tenancy (INV-3); evidence crosses by reference only ([capability-framework/src/adapters.ts:63-75](../../packages/capability-framework/src/adapters.ts#L63-L75)). Responses carry only the run's own `tenantId` echo ([stages.ts:260](../../packages/capability-framework/src/stages.ts#L260)).

## Summary

| Lifecycle phase | Status | Where |
|---|---|---|
| Enters (authenticated) | **Compliant** | gateway.ts:102-110 |
| Anti-spoof validated | **Compliant** | gateway.ts:138-144 |
| Authorised (graded, at a PDP) | **Not implemented** | no PDP; flat allow-list |
| Propagated through stages | **Compliant (label only)** | stages.ts:245-252 |
| Re-validated before store access | **Missing** | no code |
| Recovered by workers / async | **N/A today; no mechanism** | state keyed by runId |
| Outbound / response isolated | **Compliant** | adapters.ts:63-75 |

The context lifecycle is **secure up to the gateway's return statement and unenforced after it.** Every downstream isolation guarantee rests on callers voluntarily passing the correct tenant id into stores that, today, nothing calls.
