# Architecture Status

**Last updated:** 2026-07-23 (DR-1 reconciliation — ADR and criteria counts regenerated from `verify-programme-closure.js`; prior 2026-07-22 figures predated ADRs 0022–0030)

Tracks **which architecture documents exist and what state they are in**. It contains no architecture. The architecture itself is the single source of truth and lives in [`../docs/architecture/`](../docs/architecture/).

Legend: `NOT STARTED` · `DRAFT` · `REVIEWED` · `CANONICAL` (one authoritative answer, conformance criteria stated) · `FROZEN` (changes only by approved ADR)

---

## 1. Summary

| | |
|---|---|
| Architecture phase | **P1 CERTIFIED**; Constitution at **v1.3**; Platform Service baseline added at **P2/M2.5a** |
| Documents FROZEN | **25** — 22 from P1, plus 23/24/25 (Platform Services) at M2.5a |
| ADRs | **30** — index in [`DECISIONS.md`](DECISIONS.md) §5; hashes in [`ARCHITECTURE_BASELINE.md`](ARCHITECTURE_BASELINE.md). *(Source: `verify-programme-closure.js`; the earlier "21" predated the capability-engine ADRs 0022–0030.)* |
| Conformance criteria | **417** — regenerated from the closure gate ("417 on disk, 417 baselined"); never hand-authored (R-13.1) |
| Architecture freeze (M1.6) | **COMPLETE — 2026-07-22** |
| Certification reports | [Architecture v1.0](../docs/certification/ARCHITECTURE-CERTIFICATION-REPORT-v1.0.md) · [M2.5a Platform Services](../docs/certification/M2.5a-PLATFORM-SERVICE-ARCHITECTURE-CERTIFICATION.md) · [P2.3 Tenant Onboarding](../docs/certification/P2.3-TENANT-ONBOARDING-CERTIFICATION.md) · [M2.6 Operational Readiness](../docs/certification/M2.6-OPERATIONAL-READINESS-CERTIFICATION.md) · [M2.7 Customer Success](../docs/certification/M2.7-CUSTOMER-SUCCESS-CERTIFICATION.md) · [M2.8 Production Readiness](../docs/certification/M2.8-PRODUCTION-READINESS-CERTIFICATION.md) · [General Availability determination](../docs/deployment/GENERAL-AVAILABILITY-CERTIFICATION.md) |
| Coverage & traceability | [ACM](../governance/traceability/ARCHITECTURE-COVERAGE-MATRIX.md) · [ETM](../governance/traceability/ENTERPRISE-TRACEABILITY-MATRIX.md) — **generated** |

## 2. The canonical set

Each document SHALL carry explicit conformance criteria, so violations can be enumerated mechanically rather than argued. A document without them is not eligible for CANONICAL status.

| # | Document | Milestone | Status |
|---|---|---|---|
| 01 | Platform Constitution | M1.1 | **FROZEN v1.1** |
| 02 | Reference Architecture | M1.2 | **FROZEN** |
| 03 | Intelligence Plane Architecture | M1.2 | **FROZEN** |
| 04 | Execution Plane Architecture | M1.2 | **FROZEN** |
| 05 | Cross-Plane Communication | M1.2 | **FROZEN v1.1** |
| 19 | Repository Ownership & Shared Package Strategy | M1.2 | **FROZEN** |
| 20 | Cross-Plane Contracts | M1.2 | **FROZEN v1.1** |
| 21 | Tenant Lifecycle | M1.2 | **FROZEN** |
| 22 | Security Threat Model | M1.4 | **FROZEN** |
| 06 | Data Sovereignty | M1.3 | **FROZEN** |
| 07 | Tenant Isolation | M1.3 | **FROZEN** |
| 08 | Security Model & Trust Boundaries | M1.3 | **FROZEN** |
| 09 | Data Flow Model | M1.3 | **FROZEN** |
| 10 | Evidence Flow Model | M1.3 | **FROZEN** |
| 11 | Capability Model & Capability Ownership | M1.4 | **FROZEN** |
| 12 | Capability Orchestration | M1.4 | **FROZEN** |
| 13 | AI Operating Model & Provider Integration | M1.5 | **FROZEN v1.1** |
| 14 | Tool Operating Model & Integration Strategy | M1.5 | **FROZEN** |
| 15 | Configuration Model & Configuration Ownership | M1.5 | **FROZEN** |
| 16 | Runtime Model | M1.5 | **FROZEN** |
| 17 | Deployment Topology & Cloud Integration | M1.5 | **FROZEN** |
| 18 | Governance Model | M1.5 | **FROZEN v1.1** |
| 23 | Operational Excellence Platform Service | M2.5a | **FROZEN** |
| 24 | Platform Intelligence Platform Service | M2.5a | **FROZEN** |
| 25 | Customer Success Platform Service | M2.5a | **FROZEN** |

## 3. Topic ownership — the anti-duplication contract

**One topic, one document.** This table is the authoritative map. Before writing about a topic, consult it; if the topic already has an owner, reference that document rather than restating it.

| Topic | Canonical owner |
|---|---|
| Immutable rules, invariants, enforcement hierarchy, amendment | 01 |
| Whole-system view; how the planes, package and evidence chain compose | 02 |
| Internal structure of the Intelligence Plane; bounded contexts; Technology Profiles; Solution Generation Engine | 03 |
| Internal structure of the Execution Plane | 04 |
| Transport, direction, result classes, degradation matrix | 05 |
| Data classification, residency, retention obligation, purge obligation | 06 |
| Isolation dimensions, partitioning, path construction | 07 |
| Trust boundaries, identity, authentication, authorisation, secure registration, secrets, encryption, signing | 08 |
| Threat actors, assets, attack paths, replay protection, supply chain | 22 |
| SLOs, SLIs, error budgets, incident/problem management, HA/DR, runbooks | 23 |
| Engineering, operational, customer, AI and executive intelligence; dashboard | 24 |
| Installation, upgrade, migration, troubleshooting, Customer Success Package | 25 |
| Platform maturity and the engineering scorecard | `program/` — **generated, never authored** |
| What data moves where, and under what authority | 09 |
| Evidence capture, custody, integrity, chain of reference | 10 |
| What a capability is; the six capabilities; capability ownership | 11 |
| The orchestration lifecycle and its twelve stages | 12 |
| AI boundaries, agent contract, provider abstraction and integration | 13 |
| **AI Capability Class taxonomy** — the unit in which an AI requirement is expressed | **13** |
| Tool abstraction, adapter SPIs, tool integration strategy | 14 |
| Configuration schema, precedence, ownership, declared-vs-consumed | 15 |
| Process model, composition, lifecycle, concurrency | 16 |
| Deployment topology, images, cloud portability and integration | 17 |
| Governance model, gates, certification authority | 18 |
| Repository boundaries, shared package vehicle, versioning | 19 |
| Execution package and evidence contracts; wire format and versioning | 20 |
| Tenant onboarding workflow, provisioning, EP bootstrap, lifecycle, drift, offboarding | 21 |

**Where a listed programme topic maps into a later milestone.** Trust and security boundaries (08), data flow (09), capability ownership (11), AI provider integration (13), tool integration (14), configuration ownership (15), and deployment topology and cloud integration (17) are owned by documents scheduled in M1.3–M1.5. They are authored there rather than in M1.2 **because duplicating them into a structural document would create the second source of truth this contract exists to prevent.** Work continues automatically into M1.3 and onward without waiting for approval.

## 4. Rules governing this set

**One canonical answer per topic.** If two documents answer the same question, one is wrong and is corrected — not left for the reader to reconcile.

**Conformance criteria are mandatory.** A document without them cannot be certified against.

**Freeze means freeze.** After M1.6, an architecture change requires an approved ADR in [`../docs/adr/`](../docs/adr/). Implementation convenience is never grounds for amendment.

**Deferral needs an owner and a date.** The predecessor deferred its adapter interface signatures as "implementation detail" — defensible for a constitution — and then built one of eight declared adapter layers.

## 5. ADR register

**The ADR index is [`DECISIONS.md`](DECISIONS.md) §5.** It is not restated here — one topic, one home (CHARTER §4). Sixteen ADRs are accepted.

**The ADR backlog is closed.** Debt item **D-001** — seven decisions closed inside architecture documents before ADRs became mandatory — was cleared by ADR-0003 to ADR-0015 before the M1.6 freeze.

**Post-freeze changes.** [ADR-0016](../docs/adr/ADR-0016-ai-tool-agnosticism.md) is the first amendment after the freeze and the first exercise of R-18.26. It adds INV-9 and Rule 12 (AI tool agnosticism), taking documents 01, 13 and 18 to v1.1. The change is additive: no invariant was weakened and no rule relaxed.

[ADR-0078](../docs/adr/ADR-0078-package-retrieval-recorded-in-architecture.md) (2026-08-06) takes documents **05** and **20** to v1.1, executing [ADR-0070](../docs/adr/ADR-0070-execution-package-retrieval-inversion.md) §6 step 1 — and correcting it, since that step named document 20 alone and document 20's scope line disclaims the direction that document 05 owns. **It is the first post-freeze change that is not wholly additive.** Document 20's half is additive (§2.3 retrieval; R-20.28–R-20.31; C-20.13–C-20.14). **Document 05's is not: R-05.5 declared three result classes exhaustive and is amended to four**, adding `Integrity Failure` — a package that was served and failed verification fits none of the original three, and both classes that would plausibly absorb it *continue*. A-4 requires an amendment to say which invariant it affects and why it no longer holds; ADR-0078 §4.1 does so, and separates that half from the direction half, which weakens nothing and is a clarification. Conformance criteria **417 → 422**; both documents keep **FROZEN**.

## 6. Relationship to the legacy architecture

The legacy baseline at `C:\POC\DBIZIPEP\Architecture\Baseline\` is **historical reference only**. It is not canonical here and is not copied. Where a legacy conclusion is sound it is re-derived and re-justified under its own number, because adopting an answer imports the assumptions that produced it.
