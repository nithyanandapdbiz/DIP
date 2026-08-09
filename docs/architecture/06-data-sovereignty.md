# 06 — Data Sovereignty

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.3
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rule 9
**Resolves:** AD-006, AD-017

**This document owns:** data classification, residency, the conditions under which customer data may exist in the Intelligence Plane, and retention and purge **obligations**.
**It does not own:** isolation mechanics ([07](07-tenant-isolation.md)), what moves across the boundary ([09](09-data-flow-model.md)), evidence semantics ([10](10-evidence-flow-model.md)), or threat model ([08](08-security-model.md)).

---

## 1. Classification

**R-06.1** Every piece of data SHALL carry exactly one classification. Data without a classification SHALL NOT be stored.

| Class | Description | May reside in the Intelligence Plane |
|---|---|---|
| **C1 — Customer content** | Application data, screenshots, DOM captures, request/response bodies, logs from customer systems | **Never**, except under §2 |
| **C2 — Customer secrets** | Credentials, tokens, keys, connection strings | **Never**, under any condition |
| **C3 — Customer metadata** | Structure, route names, element identifiers, timings, counts | Only under §2 |
| **C4 — Platform judgments** | Decisions, verdicts, gate outcomes, evidence hashes | **Always** — this is the plane's purpose |
| **C5 — Platform operational** | Tenant registry, configuration, capability definitions, audit records | **Always** |

**R-06.2** C2 SHALL NOT cross the plane boundary in any environment, for any reason, including diagnostics and error payloads (INV-2, R-6.2).

**R-06.3** Classification is assigned at the point of capture, not at the point of transmission.

**Rationale for R-06.3.** Classifying at transmission means the data existed unclassified on disk first — and the disk is where it will still be when someone comes looking.

## 2. The four conditions

**R-06.4** C1 or C3 data may exist in the Intelligence Plane **only** when **all four** conditions hold. Failing any one, the data SHALL NOT be received or stored.

| # | Condition | Meaning |
|---|---|---|
| **1 — Authorised** | A named ADR permits this specific use, and the ADR identifier is recorded **in the storing module itself** |
| **2 — Minimised** | A field-level allow-list. Only enumerated fields are retained; everything else is dropped |
| **3 — Scrubbed on write** | PII removal occurs on the **write path**, not on the response path |
| **4 — Purged** | An enforced expiry, with a test proving the data is unreadable afterwards |

**R-06.5** The ADR identifier SHALL appear in the storing module's own source. An authorisation recorded only in a separate document is not verifiable at the point it matters.

**Rationale for condition 3.** Scrubbing on egress protects the API. Scrubbing on write protects the disk. **Both are required**, and only the second survives an operator reading a file, a log shipper, or a backup.

**Rationale for condition 2 being an allow-list.** A deny-list fails toward inclusion: any field nobody thought to exclude is retained. An allow-list fails toward omission, which is recoverable. These are not equivalent postures.

## 3. Residency

**R-06.6** C1, C2, and C3 data reside in the **customer's tenancy** by default and remain there.

**R-06.7** Where a tenant declares a residency region, all C4 and C5 data for that tenant SHALL remain within it.

**R-06.8** Residency SHALL be enforced by the storage layer, not by convention or by operator discipline.

## 4. Retention obligations — AD-006 and AD-017 resolved

**R-06.9** Every store SHALL declare a retention period. **A store without one SHALL NOT be registered.**

| Data | Retention | Rationale |
|---|---|---|
| **C1 in Intelligence Plane** | **Ephemeral** — duration of the request, never persisted | Its presence is a processing necessity, not a storage decision |
| **C3 in Intelligence Plane** | Tenant-configured, **maximum 90 days** | Sufficient for trend reasoning; bounded so it cannot become a shadow data platform |
| **C2 anywhere in DBiz** | **Not permitted** | R-06.2 |
| **Evidence (customer tenancy)** | Tenant-configured, default 365 days, no platform maximum | The customer owns it and their compliance obligation governs |
| **C4 decisions and hashes** | **7 years** | Statutory audit horizon; a certification must be defensible for the life of the release it authorised |
| **C5 audit records** | **7 years** | Must outlive the decisions they explain |
| **C5 tenant configuration** | Life of tenant + 90 days | Offboarding disposition window ([21](21-tenant-lifecycle.md)) |

**R-06.10** Retention **obligation** is declared by DBiz; retention **implementation** for customer-tenancy data is performed by the customer's deployment ([21](21-tenant-lifecycle.md) §5).

**R-06.11** Immutability SHALL NOT be used to justify indefinite retention. An append-only store still requires an expiry and archival policy (R-9.4).

**R-06.12** Every declared retention value SHALL be read by code. A retention field with no reader fails the build.

**R-06.12 exists because of a specific failure.** The predecessor declared a 90-day retention limit that was customer-visible, schema-validated, API-served, and console-rendered — and read by no code. Its own archived analysis called it *configuration theatre*. **A declared control that does not execute is a false representation, not a missing feature**, and it is worse than declaring nothing because it manufactures the appearance of compliance.

## 5. Purge

**R-06.13** Purge SHALL be **enforced by code on a schedule**, never operator-initiated.

**R-06.14** Every store SHALL ship a test proving data is **unreadable** after its retention period (R-9.3).

**R-06.15** Purge failure SHALL be a loud, alerting condition — never a silent skip.

**R-06.16** A decision SHALL remain auditable after the evidence it cites has been purged, because the decision retains the hash rather than the payload ([10](10-evidence-flow-model.md)).

**R-06.16 is the property that makes the whole model work.** Sovereignty says the evidence must leave; auditability says the judgment must survive. Retaining the hash satisfies both — the record states precisely what was judged without holding what was judged.

## 6. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-06.1** | No data is stored without a classification | Store-registration gate |
| **C-06.2** | No C2 value appears in any cross-plane payload, in any environment | Outbound guard; secret-scan gate |
| **C-06.3** | Every C1/C3 store in the Intelligence Plane records its authorising ADR in source | Source-annotation gate |
| **C-06.4** | Field retention is allow-list based | Store-schema gate |
| **C-06.5** | Scrubbing occurs on the write path | Write-path test: read raw storage and assert absence |
| **C-06.6** | Every store declares a retention period | Store-registration gate |
| **C-06.7** | Every declared retention value has a code reader | Declared-vs-consumed gate |
| **C-06.8** | Every store has a passing purge-verification test | Per-store purge test |
| **C-06.9** | Purge failure alerts and does not silently skip | Fault-injection test on the purge path |
| **C-06.10** | A decision remains auditable after its evidence expires | Expired-evidence audit test |
| **C-06.11** | No C1 data persists beyond the request in the Intelligence Plane | Persistence scan after request completion |
| **C-06.12** | Residency is enforced by the storage layer | Cross-region write negative test |

**C-06.5 is deliberately adversarial.** It does not check that a scrubbing function was called; it reads raw storage and asserts the data is absent. A test that verifies the call rather than the outcome would pass against a scrubber that silently did nothing.

## 7. Open items

| # | Item | Target |
|---|---|---|
| **AD-004** | Hash algorithm and domain-separation scheme | [10](10-evidence-flow-model.md), this milestone |
| **AD-019** | Encryption at rest: key ownership and rotation per data class | [08](08-security-model.md), this milestone |
| **AD-020** | Whether C3 trend data may be aggregated across tenants for platform learning | M1.5 |

**AD-020 is a sovereignty question, not a product one.** Cross-tenant aggregation is commercially attractive and is exactly the kind of decision that becomes irreversible once data has been aggregated under it. It is recorded now so it is decided deliberately, and it is presumed **prohibited** until an approved ADR says otherwise.
