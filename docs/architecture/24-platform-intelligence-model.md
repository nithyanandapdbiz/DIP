# 24 — Platform Intelligence Platform Service

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P2 / M2.5a
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md)
**Classification:** **Platform Service** — not a Quality Engineering Capability ([ADR-0018](../adr/ADR-0018-platform-services-and-programme-instruments.md))

**This document owns:** engineering, governance, operational, customer, AI and executive intelligence; the analytics pipeline; dashboard architecture; and evidence sourcing.
**It does not own:** the evidence it consumes ([10](10-evidence-flow-model.md), [18](18-governance-model.md), [23](23-operational-excellence-model.md)), the AI runtime ([13](13-ai-operating-model.md)), tenant isolation ([07](07-tenant-isolation.md)), or certification authority ([18](18-governance-model.md)).

---

## 1. Purpose

To make the platform's own state **knowable without an audit** — continuously, from evidence, across engineering, governance, operations, customers and AI.

**R-24.1** Platform Intelligence **consumes** evidence. It SHALL NOT manufacture, infer, estimate, or extrapolate a metric it did not observe (R-13.6).

**R-24.1 is this document's governing constraint, not a caveat.** An analytics service is the single most likely place for a plausible number to be produced where no measurement exists, because interpolation is what analytics tooling is designed to do. Everything else here follows from prohibiting it.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Aggregation of published evidence | Producing evidence — every source owns its own |
| The five intelligence domains and executive rollup | Certification decisions ([18](18-governance-model.md)) |
| Analytics pipeline and dashboard architecture | Operational response ([23](23-operational-excellence-model.md)) |
| Index computation (ERI, GCI, RCI) | Customer-facing documentation ([25](25-customer-success-model.md)) |
| Orphan and drift detection across traceability | AI inference ([13](13-ai-operating-model.md)) |

## 3. Responsibilities

**R-24.2** Aggregate evidence from declared sources without reading those sources' internals.

**R-24.3** Compute the readiness indices from evidence, never by assignment (R-13.5).

**R-24.4** Publish score, coverage **and** freshness together for every index (R-14.6).

**R-24.5** Detect drift, orphans and staleness across the traceability chain.

**R-24.6** Report absence as absence. `NOT MEASURED` is a first-class output.

## 4. Architecture

```
        published evidence (never repositories)
   ┌──────────┬──────────┬──────────┬──────────┐
   │ gates    │ tests    │ compat   │ supply   │  ...and, when published,
   │ proofs   │ coverage │ evidence │ chain    │     Execution Plane manifests
   └────┬─────┴────┬─────┴────┬─────┴────┬─────┘
        └──────────┴────┬─────┴──────────┘
                        ▼
              ingestion (schema-validated)
                        ▼
              normalisation + provenance check
                        ▼
        ┌───────┬───────┬───────┬───────┬───────┐
        │ Eng   │ Gov   │ Ops   │ Cust  │  AI   │  intelligence domains
        └───┬───┴───┬───┴───┬───┴───┬───┴───┬───┘
            └───────┴───┬───┴───────┴───────┘
                        ▼
              Executive intelligence — ERI · GCI · RCI
                        ▼
                    dashboards
```

**R-24.7** Ingestion SHALL accept only **published evidence artefacts**, schema-validated and provenance-complete (R-14.4). Evidence lacking provenance is rejected, not accepted with a caveat.

**R-24.8** This service SHALL NOT read either repository's internal state, and SHALL NOT reach into a customer tenancy. Cross-plane aggregation follows the push model in [`../../governance/PROGRAMME-EVIDENCE-COLLECTOR.md`](../../governance/PROGRAMME-EVIDENCE-COLLECTOR.md).

**R-24.9** This service SHALL be **read-only with respect to the platform**. It observes; it never remediates. A service that both measures and acts can adjust what it measures.

## 5. Behaviour — the five domains

### 5.1 Engineering intelligence

Architecture drift, governance violations, ADR compliance, technical debt, code quality, delivery metrics.

**R-24.10** Drift SHALL be reported against **certified architecture**, not against a prior snapshot of implementation. Comparing implementation to itself measures churn, not conformance.

### 5.2 Governance intelligence

Gate results, proof currency, replay success, detection accuracy, change-control completeness, coverage of the traceability chain.

**R-24.11** Governance intelligence SHALL include **its own** freshness. An analytics service reporting stale governance as current would be the failure mode it exists to detect.

### 5.3 Operational intelligence

SLO compliance, incident trends, capacity, reliability, deployment success, availability — sourced from [23](23-operational-excellence-model.md).

**R-24.12** Where the Execution Plane has published no operational evidence, operational intelligence reports `NOT MEASURED` for that tenant. **It SHALL NOT infer health from the absence of incidents.**

### 5.4 Customer intelligence

Tenant adoption, capability utilisation, upgrade readiness, customer health, support trends.

**R-24.13** Customer intelligence SHALL operate on **C5 operational metadata only** — never C1 customer content (R-06.2, [07](07-tenant-isolation.md)).

**R-24.14** Cross-tenant aggregation is **prohibited** pending AD-020 ([06](06-data-sovereignty.md) §7). Until ruled otherwise, every customer metric is computed within a single tenant scope.

### 5.5 AI intelligence

Prompt versions, model performance, provider cost, latency, accuracy, fallback usage, AI governance.

**R-24.15** AI intelligence SHALL be **provider-agnostic**: reported by AI Capability Class, never by product name (Rule 12, R-12.2).

**R-24.16** AI accuracy SHALL be measured against deterministic baselines, since AI enrichment is additive and decisions are deterministic (INV-4). **An "AI accuracy" figure that could change a verdict would indicate INV-4 had been breached**, so this metric measures enrichment quality, not decision quality.

### 5.6 Executive intelligence

**R-24.17** Executive intelligence publishes **ERI, GCI and RCI**, each with score, coverage and freshness, plus platform maturity.

**R-24.18** No index SHALL be published without its coverage and freshness. A score alone permits the misreading each index exists to prevent.

## 6. Service boundaries

| Boundary | Rule |
|---|---|
| Repositories | Never read; only published artefacts are ingested (R-24.8) |
| Customer tenancy | No inbound path (INV-3) |
| Capability execution | Never on the execution path; observation only (R-24.9) |
| Certification | Supplies inputs; renders no verdict (R-10.1) |
| Remediation | Prohibited — observe, never act (R-24.9) |

## 7. Interfaces

**R-24.19** Every evidence source SHALL publish through a declared, versioned evidence schema. Adding a source is implementing that schema; it SHALL NOT require a change to the pipeline.

**R-24.20** Storage, query and visualisation technologies sit behind platform-owned interfaces ([14](14-tool-operating-model.md)); no vendor name outside an adapter.

## 8. Data ownership

| Data | Class | Owner |
|---|---|---|
| Gate results, proofs, index history | C5 | DBiz |
| Aggregated tenant metadata | C5 | DBiz, tenant-scoped |
| Execution Plane manifests | C5 | Customer publishes; DBiz aggregates |
| Customer content | C1 | **Never ingested** |

**R-24.21** Index history is retained for trend analysis under [06](06-data-sovereignty.md) retention. **Trend history is itself evidence and expires**; a five-year-old maturity curve is not a current claim.

## 9. Operational model

**R-24.22** This service SHALL degrade independently. Its unavailability makes metrics `NOT MEASURED`; it SHALL NOT block execution, certification or release.

**R-24.23** Ingestion failure for one source SHALL NOT prevent aggregation of others, and SHALL be reported per source rather than as a global outage.

## 10. Configuration

**R-24.24** Index weights, thresholds, expiry windows and dashboard composition are configuration, DBiz-owned, narrowing-only ([ADR-0009](../adr/ADR-0009-configuration-precedence.md)).

**R-24.25** An index weight SHALL NOT be changed to alter a published score without an ADR. **Retuning the instrument to improve the reading is prohibited** (A-2).

## 11. Security

**R-24.26** Dashboards enforce graded authorisation (R-08.9); a tenant sees only its own scope.

**R-24.27** Executive rollups SHALL NOT expose one customer's posture to another.

**R-24.28** Ingested evidence SHALL be integrity-verified against its content hash before use ([10](10-evidence-flow-model.md)).

## 12. Governance

**R-24.29** Every published metric carries the evidence envelope of R-13.2.

**R-24.30** This service is subject to the gates it reports on. **It has no privileged exemption**, and its own conformance appears in its own output.

## 13. Evidence model

**R-24.31** Every metric SHALL trace to the artefact that produced it, and that artefact to its generating commit (R-14.4).

**R-24.32** A metric whose source artefact has expired SHALL report `NOT CURRENT`, not its last value (R-14.5).

## 14. Failure modes

| # | Failure | Consequence | Mitigation |
|---|---|---|---|
| **F-24.1** | Interpolating a missing value | A plausible number where no measurement exists | R-24.1 |
| **F-24.2** | Inferring health from absence of incidents | Silence read as success | R-24.12 |
| **F-24.3** | Publishing a score without coverage or freshness | The misreading each index exists to prevent | R-24.18 |
| **F-24.4** | Reading repositories directly | Sovereignty violation by the measurement layer | R-24.8 |
| **F-24.5** | Cross-tenant aggregation before AD-020 | Irreversible sovereignty breach | R-24.14 |
| **F-24.6** | Retuning weights to improve a score | The index stops measuring | R-24.25 |
| **F-24.7** | Reporting stale governance as current | The service fails at its own purpose | R-24.11 |
| **F-24.8** | Naming an AI product in a metric | Rule 12 breach in the analytics layer | R-24.15 |

## 15. Risks

| # | Risk | Status |
|---|---|---|
| **RK-24.1** | Cross-plane evidence depends on customer publication | Accepted; unpublished reports `NOT MEASURED`, never penalised as failure |
| **RK-24.2** | Dashboards invite interpretation beyond what evidence supports | Mitigated by mandatory coverage and freshness alongside every score |
| **RK-24.3** | Trend history may outlive its relevance | Mitigated by R-24.21 expiry |

## 16. Conformance criteria
| # | Criterion | Verified by |
|---|---|---|
| **C-24.1** | No published metric is interpolated, estimated or inferred | Source-traceability audit of every metric |
| **C-24.2** | Every metric traces to an artefact and a commit | Provenance gate |
| **C-24.3** | Evidence lacking provenance is rejected at ingestion | Malformed-evidence negative test |
| **C-24.4** | Ingested evidence is integrity-verified before use | Tampered-evidence negative test |
| **C-24.5** | Every index publishes score, coverage and freshness | Output schema gate |
| **C-24.6** | A metric with an expired source reports `NOT CURRENT` | Expiry test |
| **C-24.7** | Absence of incidents is never reported as health | Silent-source test |
| **C-24.8** | This service reads no repository and reaches no tenancy | Access-surface gate |
| **C-24.9** | This service performs no remediation | Source scan for write or control operations |
| **C-24.10** | No cross-tenant aggregation occurs | Tenant-scope test |
| **C-24.11** | No customer content is ingested | Ingestion content scan |
| **C-24.12** | No AI product name appears in any metric | Vendor-neutrality gate |
| **C-24.13** | Ingestion failure is reported per source, not globally | Partial-outage test |
| **C-24.14** | This service's own conformance appears in its own output | Self-inclusion test |
| **C-24.15** | Index weights cannot be changed without an ADR | Change-control gate |

**C-24.14 keeps the service honest about itself.** An intelligence service that reported on everything except its own conformance would have an exemption precisely where scrutiny matters most.

## 17. Traceability

| Direction | Link |
|---|---|
| Constitution | INV-4 (AI generates, code decides), INV-10, INV-11, Rule 12, Rule 13, Rule 14 |
| ADRs | [ADR-0018](../adr/ADR-0018-platform-services-and-programme-instruments.md), [ADR-0019](../adr/ADR-0019-evidence-over-assertion.md), [ADR-0020](../adr/ADR-0020-continuous-verification.md) |
| Consumes | [10](10-evidence-flow-model.md) · [18](18-governance-model.md) · [23](23-operational-excellence-model.md) · [16](16-runtime-model.md) §7 |
| Design input | [`PROGRAMME-EVIDENCE-COLLECTOR.md`](../../governance/PROGRAMME-EVIDENCE-COLLECTOR.md) |
| Implemented at | P2 / M2.8 |

## 18. Open items

| # | Item | Target |
|---|---|---|
| **AD-020** | Whether cross-tenant aggregation is ever permitted | **Presumed prohibited** until ruled |
| **AD-038** | Index weighting model — currently unweighted mean | M2.8 |
| **AD-039** | Trend-history retention period | M2.8 |
| **Q-C1…Q-C4** | Manifest publication, signing, expiry, and declined-versus-failed | [`PROGRAMME-EVIDENCE-COLLECTOR.md`](../../governance/PROGRAMME-EVIDENCE-COLLECTOR.md) §6 |
