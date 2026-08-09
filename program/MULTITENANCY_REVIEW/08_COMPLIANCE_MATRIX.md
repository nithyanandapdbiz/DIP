# 08 — Compliance Matrix

Every architectural tenancy requirement, its expected implementation, its actual implementation with evidence, and a status. Status vocabulary (as required): **Compliant** · **Partially Compliant** · **Not Implemented** · **Implementation Deviation**. Supplementary markers: **DOCUMENTED – NOT IMPLEMENTED**, **NOT VERIFIED**.

| Req | Expected | Actual (evidence) | Status |
|---|---|---|---|
| **R-07.1** physical, not filtered | Tenant id in path/partition key | `TenantPaths` uses tenant-leading path ([tenant-runtime.ts:66](../../packages/platform-runtime/src/tenant-runtime.ts#L66)) but is unused; running stores (logs) filter by field | **Partially Compliant** |
| **R-07.2** no store builds its own path | All stores via constructor | 4 stores route through it; `TenantQuotas` does not ([tenant-runtime.ts:150-164](../../packages/platform-runtime/src/tenant-runtime.ts#L150-L164)); none on running path | **Implementation Deviation** |
| **R-07.3** exactly one constructor, every store uses it | One constructor consumed everywhere | Constructor exists ([:42-67](../../packages/platform-runtime/src/tenant-runtime.ts#L42-L67)); **no running store consumes it** | **Not Implemented (in system)** |
| **R-07.4** require id; reject absent/malformed/traversal/absolute/unregistered | Five rejections + registry | All five present ([:52-60](../../packages/platform-runtime/src/tenant-runtime.ts#L52-L60)); tested ([gateway.test.ts:213-269](../../packages/platform-runtime/test/gateway.test.ts#L213-L269)); registry unauthoritative (F-6) | **Partially Compliant** |
| **R-07.5** unbypassable | No alternative path source | Convention-only; `TenantQuotas` bypasses; nothing type-enforced | **Implementation Deviation** |
| **R-07.6** run id ≠ tenant id | Never key isolation by run id | Run-state keyed by `runId` only ([functional orchestrators.ts:644](../../packages/functional-testing-engine/src/orchestrators.ts#L644)) | **Implementation Deviation** (F-2) |
| **R-07.7** all ten dimensions isolate | 10/10 isolated | 2 compliant (metrics, prompt), 5 partial, 3 deviating/missing — see [05](05_DATA_ISOLATION.md) | **Partially Compliant** |
| **R-07.8** scope from authenticated identity | From principal, not field | mTLS cert CN/SAN ([gateway.ts:102-110](../../packages/platform-runtime/src/gateway.ts#L102-L110)) | **Compliant** |
| **R-07.9** no ambient/default; fail not fallback | Explicit scope required | Stores require explicit id (unused); orchestration trusts unvalidated `request.tenantId` | **Partially Compliant** |
| **R-07.10** admin surfaces same isolation | Admin = app isolation | No admin surface exists to test; not demonstrated | **Not Verified** |
| **C-07.1** location from canonical constructor | Gate over all stores | No gate; no running store uses it | **Not Implemented** |
| **C-07.2** no direct path assembly | Source scan | No scan gate | **Not Verified** |
| **C-07.3** constructor rejects 4 classes | Negative test per class | Present ([gateway.test.ts:216-229](../../packages/platform-runtime/test/gateway.test.ts#L216-L229)) | **Compliant** (unit level) |
| **C-07.4** rejects unregistered | Negative test | Present ([:226-229](../../packages/platform-runtime/test/gateway.test.ts#L226-L229)) | **Compliant** (unit level) |
| **C-07.5** no op without explicit scope | Scope-requirement test | Stores enforce; orchestration does not | **Partially Compliant** |
| **C-07.6** ten dimensions, ten tests | 10 isolation tests | Storage/queue/config/quota/vault tested; **cache, AI-context, logging, knowledge, execution-record not tested on path** | **Not Implemented** |
| **C-07.7** cache never shared | Cache-key test | `VectorMemory` shared (F-1); no test | **Implementation Deviation** |
| **C-07.8** no cross-tenant AI context | Context-assembly test | Prompt clean; retrieval leaks (F-1) | **Partially Compliant** |
| **C-07.9** no C1/C3 in shared logs | Log-content scan | Call-site refusal ([telemetry.ts:59-72](../../packages/observability/src/telemetry.ts#L59-L72)); shared sink | **Partially Compliant** |
| **C-07.10** admin isolation test | Per-surface test | None | **Not Verified** |
| **C-07.11** no caller-asserted scope | Spoof negative test | Present, incl. real socket ([mtls-integration.test.ts:236-246](../../packages/platform-runtime/test/mtls-integration.test.ts#L236-L246)) | **Compliant** |
| **C-07.12** quota isolation | Under-load test | Isolation holds; `TenantQuotas` bypasses constructor | **Partially Compliant** |
| **R-08.6** identity from principal | Authenticated only | Satisfied ([gateway.ts:102-110](../../packages/platform-runtime/src/gateway.ts#L102-L110)) | **Compliant** |
| **R-08.8** fail closed | Reject ambiguous | Gateway fails closed at every check | **Compliant** |
| **R-08.9** graded authorisation | 4 roles enforced | Flat path allow-list; no roles | **Not Implemented** |
| **R-08.11** single PDP | Authz at one PDP | No PDP exists | **Not Implemented** |
| **R-08.18** secrets not cross TB1 | References only | Cross-plane carries references; but `TenantVault` holds secrets in-plane (F-7) | **Partially Compliant** |
| **ADR-0010** tenant-leading layout | `tenant/capability/run/artefact` | Correct in constructor ([:66](../../packages/platform-runtime/src/tenant-runtime.ts#L66)); unused | **Partially Compliant** |
| **ADR-0009** narrowing scope chain | 5-scope narrowing chain | Flat per-tenant map; no chain | **Not Implemented** |
| **R-21.6/7** only ACTIVE executes, at PDP | State-gated dispatch | `canExecute` zero callers (F-4) | **Not Implemented** |
| **R-21.24/25** offboarding purge, verified | Wired + tested purge | `purge()` zero callers (F-5) | **Not Implemented** |
| **R-06.11** C1 not persisted in IP | Ephemeral only | Evidence by reference; vectors hashed; no persistence-scan test | **Partially Compliant / Not Verified** |
| **Constitution** C-07.* have executing gate | `verify-tenant-isolation` gate | **Absent** (F-V) | **Not Implemented** |

## Roll-up

| Status | Count (of 33 rows) |
|---|---|
| Compliant | 7 |
| Partially Compliant | 12 |
| Implementation Deviation | 5 |
| Not Implemented | 8 |
| Not Verified | 3 (some rows carry two markers) |

**No row for "the core requirement" (R-07.3 — every store uses the one constructor) reaches Compliant in the running system.** That single fact governs the overall verdict in [00](00_EXECUTIVE_SUMMARY.md).
