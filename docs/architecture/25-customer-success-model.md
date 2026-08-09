# 25 — Customer Success Platform Service

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P2 / M2.5a
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md)
**Classification:** **Platform Service** — not a Quality Engineering Capability ([ADR-0018](../adr/ADR-0018-platform-services-and-programme-instruments.md))

**This document owns:** installation, upgrade, migration and configuration lifecycles from the customer's perspective; documentation, API and SDK strategy; training; support; the customer health model; and the Customer Success Package.
**It does not own:** tenant lifecycle and provisioning ([21](21-tenant-lifecycle.md)), deployment topology ([17](17-deployment-topology.md)), contract versioning ([20](20-cross-plane-contracts.md)), operational response ([23](23-operational-excellence-model.md)), or analytics ([24](24-platform-intelligence-model.md)).

---

## 1. Purpose

The Execution Plane is **built, deployed and operated by the customer**. Every operational burden the platform fails to remove becomes the customer's, in their infrastructure, on their schedule.

**R-25.1** Customer readiness SHALL be **measured from executed outcomes**, never asserted from the existence of documentation.

**R-25.1 is the distinction this document turns on.** "We have an installation guide" and "installation succeeds" are different claims, and only the second is evidence. A guide that has never been followed end-to-end on a clean environment is an assertion about a document.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Installation, upgrade, migration, configuration lifecycles | Tenant provisioning and states ([21](21-tenant-lifecycle.md)) |
| Documentation, API and SDK strategy | Contract shape and versioning ([20](20-cross-plane-contracts.md)) |
| Training and operational guides | Incident response ([23](23-operational-excellence-model.md)) |
| Support model and customer health | Customer analytics ([24](24-platform-intelligence-model.md)) |
| The Customer Success Package | Image build ([17](17-deployment-topology.md)) |

## 3. Responsibilities

**R-25.2** Prove that a customer can install, upgrade, migrate and configure the Execution Plane **without DBiz intervention**.

**R-25.3** Publish documentation whose accuracy is **verified against the software it documents**.

**R-25.4** Ship a Customer Success Package with every production release.

**R-25.5** Measure customer readiness continuously, not at release boundaries.

## 4. Architecture

Customer Success is a **service and a set of validated artefacts**, not a runtime. It executes nothing in the customer's tenancy — the customer does — and it renders no quality verdict.

```
release candidate
      │
      ▼
  validation harness  ──► install on clean environment
  (DBiz-side, against  ──► upgrade from each supported version
   a reference target) ──► migrate across a contract major
      │                ──► configure from documented examples
      ▼
 Customer Success Package  ──►  customer
      (evidence-backed)
```

**R-25.6** Validation SHALL run against a **clean environment**, not an environment already carrying platform state. An installation validated only on a developer machine validates nothing about a customer's first experience.

**R-25.7** This service SHALL NOT reach into a customer tenancy (INV-3). It validates against a **reference target** DBiz controls, and publishes the procedure the customer runs themselves.

## 5. Behaviour — the lifecycles

### 5.1 Installation

**R-25.8** Installation SHALL be validated end-to-end on a clean environment for every supported deployment target ([17](17-deployment-topology.md) R-17.13).

**R-25.9** Installation SHALL require **no DBiz connectivity** where the registry is mirrored ([ADR-0011](../adr/ADR-0011-contract-distribution.md) R-17.24).

**R-25.10** A failed installation SHALL fail **loudly and diagnosably**, naming the unmet precondition. A silent or ambiguous failure at first contact is the most expensive defect the platform can ship.

### 5.2 Upgrade

**R-25.11** Upgrade SHALL be validated **from every supported contract version** to current (R-19.10).

**R-25.12** Upgrade SHALL NOT require the customer to upgrade in lockstep with DBiz (R-19.11).

**R-25.13** Upgrade SHALL be **reversible**, or its irreversibility SHALL be declared before it begins.

### 5.3 Migration

**R-25.14** A contract major-version migration SHALL have a published, validated migration path with a declared support window.

**R-25.15** Migration SHALL preserve evidence integrity: migrated evidence SHALL verify under its recorded algorithm version ([ADR-0005](../adr/ADR-0005-canonical-integrity-primitive.md)).

### 5.4 Configuration

**R-25.16** Every documented configuration example SHALL be **validated against the live schema**. An example that no longer parses is worse than none: it is a working instruction that produces a broken system.

**R-25.17** Configuration errors SHALL fail at load with a message naming the field and the constraint ([15](15-configuration-model.md) R-15.14).

## 6. Service boundaries

| Boundary | Rule |
|---|---|
| Customer tenancy | No inbound path; validation uses a DBiz-controlled reference target (R-25.7) |
| Tenant lifecycle | Owned by [21](21-tenant-lifecycle.md); this service covers the customer's *experience* of it |
| Capability execution | Never on the execution path |
| Customer data | Never handled; validation uses synthetic data only |

## 7. Interfaces

**R-25.18** The API surface SHALL be documented **from the contract schemas**, not maintained separately ([20](20-cross-plane-contracts.md)). Hand-maintained API documentation diverges from the API, and the divergence is invisible until a customer hits it.

**R-25.19** SDKs, where provided, SHALL be generated from the published JSON Schema and SHALL carry the contract version they were generated from.

**R-25.20** An SDK SHALL NOT expose capability beyond the contract. An SDK that can express what the contract cannot has become a second, undocumented contract.

## 8. Data ownership

| Data | Class | Owner |
|---|---|---|
| Documentation and guides | C5 | DBiz |
| Validation results | C5 | DBiz |
| Customer health metrics | C5 | DBiz, tenant-scoped |
| Support case content | **Customer-supplied; treated as C1 until classified** | Customer |

**R-25.21** Support material SHALL be scrubbed on the write path before retention ([09](09-data-flow-model.md) §2). **A support bundle is the most probable route by which customer content leaves a tenancy** — it is assembled under time pressure by people trying to solve a problem, and it routinely serialises whole objects (R-09.12).

## 9. Operational model

**R-25.22** Validation SHALL run on every release candidate, not on a schedule. A release whose installation was last validated two releases ago has unvalidated installation.

**R-25.23** Documentation changes SHALL be validated by the same harness as the software.

## 10. Configuration

**R-25.24** Supported targets, supported upgrade paths, and documentation sets are configuration, DBiz-owned, subject to the narrowing-only scope chain.

**R-25.25** Every declared supported target SHALL have a passing validation run. **A target declared supported without a validation run is declared-but-unbuilt** (R-11.2) — the platform's characteristic failure applied to compatibility claims.

## 11. Security

**R-25.26** Documentation SHALL contain no real credentials, endpoints, tenant identifiers or customer names.

**R-25.27** Examples SHALL use synthetic values that are recognisably synthetic, so a copied example cannot accidentally target a real system.

**R-25.28** Support surfaces enforce graded authorisation (R-08.9).

## 12. Governance

**R-25.29** Customer readiness contributes to the readiness indices **only from executed validation**, never from the existence of an artefact ([18](18-governance-model.md)).

**R-25.30** A documentation set with no passing validation run reports `NOT MEASURED`.

## 13. Evidence model

**R-25.31** Every validation run SHALL emit evidence with the envelope of R-13.2 and the provenance of R-14.4, naming the target, the source version, and the outcome.

**R-25.32** Validation evidence expires (R-14.5). Installation validated against a superseded release is not evidence about the current one.

## 14. The Customer Success Package

**R-25.33** Every production release SHALL ship a package containing: installation procedure and its validation evidence; upgrade paths from every supported version with evidence; the migration guide where a major version changed; validated configuration examples; API documentation generated from the contract; operational guides; troubleshooting; the contract version and supported window; and the SBOM ([ADR-0011](../adr/ADR-0011-contract-distribution.md), M2.4).

**R-25.34** The package SHALL be **generated from validation output**, not assembled by hand (R-13.1).

**R-25.35** A release SHALL NOT be published without its package. **The package is the release's evidence that a customer can actually adopt it.**

## 15. Failure modes

| # | Failure | Consequence | Mitigation |
|---|---|---|---|
| **F-25.1** | Documentation asserted as readiness | Readiness claimed with no executed outcome | R-25.1, R-25.29 |
| **F-25.2** | Configuration example that no longer parses | A working instruction that breaks the system | R-25.16 |
| **F-25.3** | Installation validated only on a dirty environment | First-contact failure ships undetected | R-25.6 |
| **F-25.4** | Upgrade path declared but never exercised | Customers stranded on old versions | R-25.11, R-25.25 |
| **F-25.5** | Hand-maintained API documentation | Silent divergence from the contract | R-25.18 |
| **F-25.6** | SDK exposing more than the contract | A second, undocumented contract | R-25.20 |
| **F-25.7** | Support bundle carrying customer content | Sovereignty breach via the least-guarded path | R-25.21 |
| **F-25.8** | Package assembled by hand | Claims outrun validation | R-25.34 |

## 16. Risks

| # | Risk | Status |
|---|---|---|
| **RK-25.1** | Validation uses a reference target, not real customer environments | Accepted — INV-3 forbids reaching in; residual difference is stated, not hidden |
| **RK-25.2** | Customer health depends on telemetry customers may decline to publish | Accepted; reports `NOT MEASURED` |
| **RK-25.3** | Documentation may be accurate yet unusable | Partially mitigated by validation; usability is not mechanically measurable and is recorded as unmeasured |

**RK-25.3 is stated because it is real.** A harness proves an instruction *works*; it cannot prove a human can follow it. Claiming otherwise would be exactly the assertion this document prohibits.

## 17. Conformance criteria
| # | Criterion | Verified by |
|---|---|---|
| **C-25.1** | Installation succeeds on a clean environment for every supported target | Install validation harness |
| **C-25.2** | Installation requires no DBiz connectivity with a mirrored registry | Offline install test |
| **C-25.3** | A failed installation names the unmet precondition | Negative install test |
| **C-25.4** | Upgrade succeeds from every supported contract version | Upgrade matrix run |
| **C-25.5** | Every documented configuration example validates against the live schema | Example validation gate |
| **C-25.6** | API documentation is generated from contract schemas | Generation-source gate |
| **C-25.7** | Any SDK carries its contract version and exposes nothing beyond the contract | SDK surface gate |
| **C-25.8** | Every declared supported target has a passing validation run | Declared-versus-validated gate |
| **C-25.9** | Documentation contains no real credentials, endpoints or tenant identifiers | Content scan |
| **C-25.10** | Support material is scrubbed on the write path | Raw-storage absence test |
| **C-25.11** | Every release ships a Customer Success Package | Release gate |
| **C-25.12** | The package is generated from validation output | Generation-source gate |
| **C-25.13** | Validation evidence carries envelope and provenance and expires | Evidence schema gate |
| **C-25.14** | Migrated evidence verifies under its recorded algorithm version | Migration integrity test |

**C-25.8 is the criterion that prevents the platform's characteristic failure appearing here.** Declaring support for a target is free; validating it is not. Without this criterion, the supported-target list would drift into a list of intentions.

## 18. Traceability

| Direction | Link |
|---|---|
| Constitution | INV-3 (no inbound path), INV-7, INV-10, INV-11, Rule 11 (declared-but-unbuilt) |
| ADRs | [ADR-0018](../adr/ADR-0018-platform-services-and-programme-instruments.md), [ADR-0011](../adr/ADR-0011-contract-distribution.md), [ADR-0005](../adr/ADR-0005-canonical-integrity-primitive.md), [ADR-0019](../adr/ADR-0019-evidence-over-assertion.md) |
| Consumes | [20](20-cross-plane-contracts.md) · [21](21-tenant-lifecycle.md) · [17](17-deployment-topology.md) · [15](15-configuration-model.md) |
| Consumed by | [24](24-platform-intelligence-model.md) customer intelligence · [18](18-governance-model.md) readiness |
| Implemented at | P2 / M2.7 |

## 19. Open items

| # | Item | Target |
|---|---|---|
| **AD-040** | The reference target used for installation validation | M2.7 — blocked with M2.5 while Docker is unavailable |
| **AD-041** | Whether SDKs are offered, and in which languages | M2.7 |
| **AD-042** | Support tier model and response obligations | M2.7 |
