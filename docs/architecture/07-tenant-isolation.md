# 07 — Tenant Isolation

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.3
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rule 9

**This document owns:** the isolation dimensions, partitioning strategy, and the single validated path constructor.
**It does not own:** tenant states and onboarding ([21](21-tenant-lifecycle.md)), classification and retention ([06](06-data-sovereignty.md)), or authentication ([08](08-security-model.md)).

---

## 1. Where isolation is required

The Execution Plane is **single-tenant by construction** (R-2.5): it serves one customer, in that customer's tenancy, and contains no concept of a second tenant. A deployment that cannot express a second tenant cannot leak to one. **This is the strongest isolation available, and it is free** — obtained structurally rather than by enforcement.

Everything in this document therefore concerns the **Intelligence Plane**, which is genuinely multi-tenant and where isolation must be built rather than inherited.

## 2. Physical, not logical

**R-07.1** Tenant isolation SHALL be **physical**: the tenant identifier is part of the storage path or partition key, not a field filtered in application code.

**Why this is not a stylistic preference.**

> A tenant identifier filtered in application code **fails open**. Any read path that forgets the filter — a bug, a debug tool, a log shipper, an analytics job, an operator inspecting a file — returns every tenant's data at once.
>
> A physical path **fails closed**. Omitting the scope yields no path, and therefore no data.

These are not equivalent security postures, and the difference is not visible in a code review of the happy path. It surfaces only in the read path nobody thought about — which is precisely the path that will exist in a system of this size after a decade.

**R-07.2** A store SHALL NOT construct its own tenant-scoped path.

## 3. The single path constructor

**R-07.3** There SHALL be **exactly one** validated constructor for tenant-scoped storage locations, and every store SHALL obtain its location from it.

**R-07.4** The constructor SHALL **require** a tenant identifier. It SHALL reject: absent identifiers, malformed identifiers, path traversal sequences, absolute paths, and identifiers not present in the tenant registry.

**R-07.5** The constructor SHALL be **unbypassable** — there SHALL be no alternative means of obtaining a storage location.

**R-07.6** A **run identifier is not a tenant identifier** (R-9.6). Uniqueness carries no isolation semantics: a unique run identifier does not prevent a listing operation from returning another tenant's runs.

**R-07.6 records a real failure mode.** The predecessor keyed its discovery checkpoints by run identifier alone. Every checkpoint was uniquely addressable and none was isolated, because uniqueness answers "can two records collide?" while isolation answers "can one tenant enumerate another's?" — different questions with different answers.

## 4. The isolation dimensions

**R-07.7** Isolation SHALL hold across **every** dimension below. A dimension not listed as isolated is a gap, not an exemption.

| # | Dimension | Isolation mechanism |
|---|---|---|
| 1 | **Configuration** | Per-tenant scope chain; no global fallback that could leak another tenant's value |
| 2 | **Secrets** | Not held in this plane at all (R-3.3) — isolation by absence |
| 3 | **Evidence hashes & decisions** | Physical partition via the path constructor |
| 4 | **Execution records** | Physical partition |
| 5 | **Storage** | Physical partition |
| 6 | **Caching** | Tenant-keyed cache namespace; no shared entry may be tenant-derived |
| 7 | **Logging** | Tenant-scoped sinks; no C1/C3 in shared log streams |
| 8 | **AI context** | No cross-tenant context, retrieval, or few-shot content |
| 9 | **Knowledge graph** | Per-tenant subgraph; cross-tenant edges prohibited absent an approved ADR |
| 10 | **Rate limits & quotas** | Per tenant, so one tenant's load cannot degrade another's service |

**Dimensions 6 and 8 are the ones most often missed.** A cache keyed by a value derived from customer data, or an AI context assembled from a shared corpus, leaks across tenants without any storage boundary being crossed — and neither shows up in a review of the storage layer.

**Dimension 9 is presumed prohibited.** Cross-tenant knowledge edges are commercially attractive and irreversible once created — see AD-020 in [06](06-data-sovereignty.md).

## 5. Scope derivation

**R-07.8** Tenant scope SHALL derive from **authenticated identity**, never from a caller-supplied field alone (R-03.18).

**R-07.9** There is **no ambient or default tenant**. An operation without an explicit scope SHALL fail, not fall back.

**R-07.10** Administrative and diagnostic surfaces SHALL be subject to the same isolation as application surfaces.

**R-07.10 closes the most common real-world breach path.** Admin tools, health endpoints, analytics jobs, and support consoles are routinely written against the storage layer directly, by people who know the schema and are trusted — and they are exactly the read paths that "forget the filter."

## 6. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-07.1** | Every tenant-scoped location is produced by the canonical constructor | Path-construction gate over all store modules |
| **C-07.2** | No store constructs its own path | Source scan for direct path assembly |
| **C-07.3** | The constructor rejects absent, malformed, traversing, and absolute identifiers | Negative test per rejection class |
| **C-07.4** | The constructor rejects identifiers absent from the tenant registry | Unregistered-tenant negative test |
| **C-07.5** | No operation executes without an explicit tenant scope | Scope-requirement test |
| **C-07.6** | Each of the ten dimensions has a passing isolation test | Dimension coverage — ten tests, one per dimension |
| **C-07.7** | A cache entry is never shared across tenants | Cache-key derivation test |
| **C-07.8** | No AI context contains another tenant's data | Context-assembly test |
| **C-07.9** | No C1/C3 data appears in a shared log stream | Log-content scan |
| **C-07.10** | Administrative surfaces enforce the same isolation as application surfaces | Per-surface isolation test |
| **C-07.11** | Tenant scope cannot be asserted by a caller-supplied field | Identity-spoofing negative test |
| **C-07.12** | One tenant's load cannot exhaust another's quota | Quota isolation test under load |

**C-07.6 is exhaustive by design — ten dimensions, ten tests.** A partially-tested isolation model is indistinguishable from an untested one at the dimension that was skipped, and the dimensions most likely to be skipped (caching, AI context, logging) are the ones with no storage boundary to make the gap visible.

## 7. Open items

| # | Item | Target |
|---|---|---|
| **AD-011** | Physical storage layout for partitioning | M1.5 — [17](17-deployment-topology.md) |
| **AD-020** | Whether cross-tenant aggregation is ever permitted | M1.5 — presumed prohibited until an ADR says otherwise |

**AD-011 constrains migration permanently.** The predecessor's evidence store was both immutable and unpartitioned, which meant repartitioning would have required writing new files while retaining the old ones indefinitely. Choosing the layout before the first write is the only cheap moment.
