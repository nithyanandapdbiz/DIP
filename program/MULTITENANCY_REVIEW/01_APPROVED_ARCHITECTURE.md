# 01 — The Approved Multi-Tenancy Architecture

This section summarises the **authoritative, frozen** tenancy design before any code is judged against it. It restates nothing as new; every rule below is quoted from a frozen document and cited. Where documents could appear to disagree, the precedence order (`docs/architecture/` > `docs/adr/` > CHARTER) resolves it — and here they do **not** disagree: there is exactly one tenancy model.

## The authoritative source

**[07 — Tenant Isolation](../../docs/architecture/07-tenant-isolation.md)** is the owning document. It declares itself owner of "the isolation dimensions, partitioning strategy, and the single validated path constructor." Supporting authorities:

| Document | Owns (for tenancy) |
|---|---|
| [07 — Tenant Isolation](../../docs/architecture/07-tenant-isolation.md) | Isolation dimensions, physical partitioning, the one path constructor |
| [06 — Data Sovereignty](../../docs/architecture/06-data-sovereignty.md) | Classification (C1–C5), residency, retention & purge obligations |
| [08 — Security Model](../../docs/architecture/08-security-model.md) | Trust boundaries, authentication, authorisation, secret handling, PDP |
| [21 — Tenant Lifecycle](../../docs/architecture/21-tenant-lifecycle.md) | Tenant identity, states, onboarding, offboarding/purge |
| [22 — Threat Model](../../docs/architecture/22-security-threat-model.md) | Attack paths P-05…P-09 against isolation, and their controlling criteria |
| [ADR-0010](../../docs/adr/ADR-0010-tenant-storage-layout.md) | The concrete storage layout `tenant/capability/run/artefact` |
| [ADR-0009](../../docs/adr/ADR-0009-configuration-precedence.md) | Config scope chain, narrowing-only |

There is **one** tenancy model. No competing model exists in the corpus.

## The model in one paragraph

The **Execution Plane is single-tenant by construction** (R-2.5): it serves one customer in that customer's own tenancy and has no concept of a second tenant — "a deployment that cannot express a second tenant cannot leak to one" ([07 §1](../../docs/architecture/07-tenant-isolation.md)). All multi-tenancy risk therefore lives in the **Intelligence Plane**, which is genuinely shared. There, isolation must be **built**, and the architecture mandates it be **physical**.

## The non-negotiable requirements

**Physical, not filtered ([07 §2](../../docs/architecture/07-tenant-isolation.md)).**
- **R-07.1** — Isolation SHALL be physical: the tenant id is part of the storage path/partition key, not a field filtered in application code. *"A tenant identifier filtered in application code fails open… A physical path fails closed."*
- **R-07.2** — A store SHALL NOT construct its own tenant-scoped path.

**The single path constructor ([07 §3](../../docs/architecture/07-tenant-isolation.md)).**
- **R-07.3** — There SHALL be **exactly one** validated constructor for tenant-scoped locations, and **every store SHALL obtain its location from it.**
- **R-07.4** — The constructor SHALL **require** a tenant id and **reject**: absent, malformed, path-traversal, absolute, and **ids not in the tenant registry**.
- **R-07.5** — The constructor SHALL be **unbypassable** — no alternative means of obtaining a location.
- **R-07.6** — A **run id is not a tenant id**. Uniqueness carries no isolation semantics. *(Records the predecessor's exact failure: discovery checkpoints keyed by run id alone — uniquely addressable, none isolated.)*

**The ten isolation dimensions ([07 §4](../../docs/architecture/07-tenant-isolation.md), R-07.7).** Isolation SHALL hold across **all**; a dimension not listed as isolated is a **gap, not an exemption**:

1. **Configuration** — per-tenant scope chain; no global fallback.
2. **Secrets** — **not held in this plane at all** (R-3.3); isolation *by absence*.
3. **Evidence hashes & decisions** — physical partition via the constructor.
4. **Execution records** — physical partition.
5. **Storage** — physical partition.
6. **Caching** — tenant-keyed namespace; no shared entry may be tenant-derived.
7. **Logging** — tenant-scoped sinks; no C1/C3 in shared log streams.
8. **AI context** — no cross-tenant context, retrieval, or few-shot content.
9. **Knowledge graph** — per-tenant subgraph; cross-tenant edges prohibited absent an approved ADR (AD-020, presumed prohibited).
10. **Rate limits & quotas** — per tenant.

> *"Dimensions 6 and 8 are the ones most often missed. A cache keyed by a value derived from customer data, or an AI context assembled from a shared corpus, leaks across tenants without any storage boundary being crossed — and neither shows up in a review of the storage layer."* — [07 §4](../../docs/architecture/07-tenant-isolation.md)

**Scope derivation ([07 §5](../../docs/architecture/07-tenant-isolation.md)).**
- **R-07.8** — Scope SHALL derive from **authenticated identity**, never a caller-supplied field alone.
- **R-07.9** — There is **no ambient or default tenant**. An operation without explicit scope SHALL **fail, not fall back.**
- **R-07.10** — Administrative and diagnostic surfaces SHALL be subject to the **same** isolation as application surfaces.

**Authentication & authorisation ([08](../../docs/architecture/08-security-model.md)).**
- **R-08.6** — Tenant identity derives from the authenticated principal; a caller-supplied tenant field SHALL NOT establish scope.
- **R-08.9** — Authorisation SHALL be **graded** (platform operator, tenant admin, tenant member, read-only auditor).
- **R-08.11** — Authorisation SHALL be evaluated at the **single Policy Decision Point**, never re-implemented at a call site.
- **R-08.8 / R-08.53** — Fail closed; every request authenticated, authorised, encrypted, audited (Zero Trust).

**Storage layout ([ADR-0010](../../docs/adr/ADR-0010-tenant-storage-layout.md)).** `tenant / capability / run / artefact`, **tenant-leading** so purge follows a path prefix; every location from the one constructor; purge at tenant/capability/run level without scanning unrelated data.

**Configuration precedence ([ADR-0009](../../docs/adr/ADR-0009-configuration-precedence.md)).** `platform default → capability default → tenant → environment → run`, **narrowing-only** (a more specific scope may only *narrow*, never widen); no ambient/implicit config; DBiz-owned values not overridable by the EP.

**Lifecycle & purge ([21](../../docs/architecture/21-tenant-lifecycle.md)).**
- **R-21.6 / R-21.7** — Only `ACTIVE` permits execution; every other state produces a **refusal**, enforced **at the PDP**, not per call site.
- **R-21.24 / R-21.25** — Offboarding purges tenant configuration and ephemeral customer data; purge SHALL be **verified**, not asserted.

**Conformance criteria that must have executing verification.** [07 §6](../../docs/architecture/07-tenant-isolation.md) defines **C-07.1…C-07.12**, including **C-07.6** — *"exhaustive by design — ten dimensions, ten tests."* Under the constitution, a criterion with no executing check reports `NOT RUN`, and `NOT RUN ≡ FAIL`.

## Threat-model expectations ([22 §3.2](../../docs/architecture/22-security-threat-model.md))

The isolation controls must answer these attack paths, each mapped to a criterion that must run:

| Path | Attack (actor T2 = malicious authenticated tenant) | Control | Criterion |
|---|---|---|---|
| **P-05** | Reads another tenant's data by manipulating identifiers | One validated constructor, physical partition | C-07.1, C-07.3 |
| **P-06** | Asserts another tenant's identity | Scope from authenticated principal | C-07.11, C-08.3 |
| **P-07** | Reads another tenant's data via a shared cache entry | Tenant-keyed cache namespace | C-07.7 |
| **P-08** | Extracts another tenant's data through AI context | No cross-tenant context/retrieval/few-shot | C-07.8 |
| **P-09** | Exhausts shared capacity to degrade others | Per-tenant quotas | C-07.12 |

Residual risk **RR-5** ([22 §6](../../docs/architecture/22-security-threat-model.md)): *"Cross-tenant inference through the knowledge graph — presumed prohibited until AD-020 rules otherwise."*

## What "compliant" means for this review

An implementation is compliant only if, **in the running system**:
1. every tenant-scoped location comes from the one constructor (R-07.3), which is unbypassable (R-07.5);
2. scope derives from authenticated identity with no ambient default (R-07.8/9);
3. all ten dimensions isolate, each with a passing test (R-07.7, C-07.6);
4. purge is wired and verified (R-21.24/25);
5. a PDP centralises execution-eligibility and authorisation (R-08.11, R-21.7);
6. an executing gate proves C-07.1…C-07.12 (constitution: `NOT RUN ≡ FAIL`).

The remaining sections test the implementation against exactly these six.
