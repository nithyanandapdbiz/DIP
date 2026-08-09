# 05 — Data Isolation

Verification of each data-isolation surface the architecture names, mapped to the ten dimensions of [07 §4](../../docs/architecture/07-tenant-isolation.md) and the sovereignty rules of [06](../../docs/architecture/06-data-sovereignty.md).

| # | Surface | Status | Evidence |
|---|---|---|---|
| 1 | Database partitioning | **N/A** | No database exists; all state in-memory. When added, must use `TenantPaths`/partition key |
| 2 | Tenant filtering vs partitioning | **IMPLEMENTATION DEVIATION** | Architecture forbids app-level filtering (R-07.1); running stores that exist (logs, metrics) *filter by a tenant field* rather than partition — acceptable for metrics, a deviation for logs |
| 3 | Repository / store isolation | **NOT IMPLEMENTED (on path)** | `TenantStorage` unused ([tenant-runtime.ts:77](../../packages/platform-runtime/src/tenant-runtime.ts#L77)) |
| 4 | Configuration isolation | **PARTIALLY COMPLIANT** | Per-tenant map, no global fallback ([tenant-runtime.ts:143-146](../../packages/platform-runtime/src/tenant-runtime.ts#L143-L146)); ADR-0009 scope chain absent; store unused |
| 5 | Secrets isolation | **IMPLEMENTATION DEVIATION** | Dimension 2 requires "not held in this plane"; `TenantVault` stores & mints secret values in the IP ([tenant-runtime.ts:184,196,214](../../packages/platform-runtime/src/tenant-runtime.ts#L184)) |
| 6 | Prompt isolation | **COMPLIANT** | Per-request only; `FORBIDDEN_IN_PROMPT` gate ([agent.ts:137-141,199-202](../../packages/capability-framework/src/agent.ts#L137-L141)) |
| 7 | AI context isolation | **PARTIALLY COMPLIANT** | Prompt clean; leakage via knowledge recall not prompt (see [06](06_AI_TENANT_ISOLATION.md)) |
| 8 | Audit isolation | **IMPLEMENTATION DEVIATION** | Records carry tenant ([stages.ts:205](../../packages/capability-framework/src/stages.ts#L205)); retrieval keyed by runId only ([discovery orchestrators.ts:714](../../packages/discovery-flow-engine/src/orchestrators.ts#L714)) |
| 9 | Storage-path isolation | **NOT IMPLEMENTED (on path)** | Only `TenantPaths` builds tenant paths; unused in prod |
| 10 | Cache isolation | **IMPLEMENTATION DEVIATION** | No `TenantCache`; de-facto cache `VectorMemory` cross-tenant (L1) |
| 11 | Queue isolation | **NOT IMPLEMENTED (on path)** | `TenantQueues` correct but unused; no worker |
| 12 | Temporary file isolation | **NOT VERIFIED** | No engine writes temp files through `TenantPaths`; CA uses non-tenant temp dirs ([certificate-authority.ts:66-114](../../packages/platform-runtime/src/certificate-authority.ts#L66-L114)) — platform PKI, not tenant data |
| 13 | Report isolation | **IMPLEMENTATION DEVIATION** | Reports in five engines can include cross-tenant recall output (L1) |

## Sovereignty & classification checks ([06](../../docs/architecture/06-data-sovereignty.md))

**C1 (customer content) ephemerality (R-06.9, C-06.11).** Consistent with design — the IP persists no customer content: evidence crosses **by reference** ([adapters.ts:63-75](../../packages/capability-framework/src/adapters.ts#L63-L75)), and `VectorMemory` stores **hashed vectors, not source text** ([vector.ts:89,128](../../packages/capability-framework/src/vector.ts#L89)). This materially limits the blast radius of L1 to derived signals (ids, fingerprints, similarity), not raw content. **However** there is no persistence-scan test proving C-06.11 on the running path — mark **NOT VERIFIED**.

**C2 (secrets) never in this plane (R-06.2, R-08.18).** Cross-plane payloads carry references only. But `TenantVault` holds C2-shaped material in-plane; whether platform-internal secrets are in scope of R-3.3 needs reconciliation against [ADR-0008](../../docs/adr/ADR-0008-encryption-at-rest.md). Mark **IMPLEMENTATION DEVIATION / NEEDS RECONCILIATION**.

**Retention & purge (R-06.13, R-21.25).** Purge SHALL be enforced by code and verified. The prefix-purge primitive exists ([tenant-runtime.ts:70-73](../../packages/platform-runtime/src/tenant-runtime.ts#L70-L73)) but has **zero callers**; `decommission()` revokes the certificate and drops an in-memory grant but **does not purge tenant storage** ([registration.ts:160-167](../../packages/platform-runtime/src/registration.ts#L160-L167)). There is **no scheduled purge** and **no purge-verification test** on the running path. Mark **NOT IMPLEMENTED** for enforcement; the retention *values* declared in Doc 06 have no code reader on any tenant store because no tenant store runs.

**Residency (R-06.7/8).** Enforced-by-storage-layer requirement cannot be met while no storage layer runs. **NOT IMPLEMENTED.**

## Net data-isolation position

The **sovereignty posture** (nothing sensitive persisted, evidence by reference, no inbound) is genuinely upheld and is the strongest part of the data story. But the **within-plane isolation of the data the plane *does* hold** — run outcomes, audit trails, knowledge vectors, config — is either not partitioned (L1, L2) or not on the running path at all. The physical-partition model of Doc 07 / ADR-0010 is **present as a primitive and absent as a system**.
