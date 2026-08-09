# 23 — Operational Excellence Platform Service

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P2 / M2.5a
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md)
**Classification:** **Platform Service** — not a Quality Engineering Capability ([ADR-0018](../adr/ADR-0018-platform-services-and-programme-instruments.md))

**This document owns:** SLOs, SLIs, error budgets, incident and problem management, capacity planning, HA/DR, backup and restore validation, health and readiness models, and operational runbooks.
**It does not own:** the process and concurrency model ([16](16-runtime-model.md)), observability instrumentation ([16](16-runtime-model.md) §7), analytics over operational data ([24](24-platform-intelligence-model.md)), deployment topology ([17](17-deployment-topology.md)), or governance gates ([18](18-governance-model.md)).

---

## 1. Purpose

To make the platform's operational behaviour **measurable, bounded and recoverable**, so that reliability is a stated obligation with evidence rather than an aspiration.

**R-23.1** Operations is a **first-class platform service**, engineered and certified like any other part of the platform.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Service level objectives, indicators and error budgets | Instrumentation mechanics ([16](16-runtime-model.md) §7) |
| Incident and problem management | Analytics and dashboards ([24](24-platform-intelligence-model.md)) |
| Capacity planning | Customer-facing operational guides ([25](25-customer-success-model.md)) |
| High availability and disaster recovery | Container build and topology ([17](17-deployment-topology.md)) |
| Backup and restore validation | Certification authority ([18](18-governance-model.md)) |
| Health and readiness models | |

## 3. Responsibilities

**R-23.2** Define and publish SLOs for every externally-observable platform behaviour.

**R-23.3** Measure SLIs from **executed telemetry**, never from estimation (INV-10, R-13.1).

**R-23.4** Maintain error budgets and enforce their consequences.

**R-23.5** Detect, classify, respond to and learn from incidents.

**R-23.6** Prove recoverability by **exercising** backup and restore, not by documenting them.

## 4. Architecture

Operational Excellence is a **service, not a runtime**. It consumes telemetry the planes already emit ([16](16-runtime-model.md) §7) and produces operational judgments. It executes no capability lifecycle and renders no customer quality verdict.

```
Intelligence Plane telemetry ─┐
                              ├─► Operational Excellence ─► SLI evaluation ─► error budget
Execution Plane telemetry ────┘        (service)          ─► incident record ─► problem record
```

**R-23.7** This service SHALL NOT sit on the execution path of any capability. An operational service that can block quality engineering has become a dependency of the product rather than a view of it.

**R-23.8** It SHALL degrade independently: loss of operational measurement SHALL NOT stop execution or certification. Measurement is reported as `NOT MEASURED`, and the platform continues.

## 5. Behaviour

### 5.1 The SLO model

**R-23.9** Every SLO SHALL declare: the user-visible behaviour it protects, its SLI, its target, its measurement window, and its consequence on breach.

**R-23.10** An SLO without a consequence is a **statistic, not an objective**, and SHALL NOT be published as an SLO.

**R-23.11** SLO targets SHALL be expressed against **user-visible outcomes**, not component internals. "The Execution Plane completed the run" is an objective; "CPU stayed below 70%" is a diagnostic.

### 5.2 The SLI model

**R-23.12** Every SLI SHALL be computed from emitted telemetry with a declared numerator, denominator and window.

**R-23.13** An SLI whose telemetry is unavailable SHALL report `NOT MEASURED`. It SHALL NOT be interpolated, estimated, or carried forward from a previous window (R-13.3).

**R-23.14** SLIs SHALL be tenant-scoped where the behaviour is tenant-visible, so one tenant's degradation is not concealed by another's health.

**R-23.14 exists because aggregate availability hides the failure that matters.** A platform at 99.9% aggregate can be wholly unavailable to one customer, and that customer's experience is the only one they can observe.

### 5.3 Error budgets

**R-23.15** Each SLO SHALL carry an error budget derived from its target and window.

**R-23.16** Budget exhaustion SHALL have a **declared, enforced consequence**.

**R-23.17** An exhausted budget SHALL NOT be reset by adjusting the target or extending the window. Adjusting the instrument to flatter the result is prohibited (P-002 in spirit; A-2).

### 5.4 Incident and problem management

**R-23.18** An **incident** is an active degradation. A **problem** is its underlying cause. They are tracked separately, because closing an incident does not close its cause.

**R-23.19** Every incident SHALL record: detection time, detection method, affected tenants, affected SLOs, budget consumed, and resolution.

**R-23.20** An incident detected by a customer rather than by the platform SHALL be recorded as such. **Detection source is a measured property of the operational service, not an incidental detail** — a platform that learns of its outages from customers has an observability defect, not merely an availability one.

**R-23.21** Root cause analysis SHALL produce either a corrective action with an owner, or an explicitly accepted risk recorded in the risk register.

### 5.5 Capacity planning

**R-23.22** Capacity SHALL be planned per tenancy for the Execution Plane and per region for the Intelligence Plane, reflecting the scaling asymmetry in [16](16-runtime-model.md) §4.

**R-23.23** Capacity headroom SHALL be measured, not assumed.

### 5.6 High availability, disaster recovery, backup and restore

**R-23.24** Recovery objectives (RTO, RPO) SHALL be declared per data class, consistent with [06](06-data-sovereignty.md).

**R-23.25** **Restore SHALL be exercised, and the exercise SHALL be the evidence.** A backup that has never been restored is an assumption about a file.

**R-23.26** Restore validation SHALL verify **content**, not merely completion: restored evidence SHALL verify against its recorded content hash ([10](10-evidence-flow-model.md)).

**R-23.27** Disaster recovery for the Execution Plane is the **customer's** responsibility on the customer's infrastructure; the platform SHALL provide the procedure and the validation, not the execution (R-17.2).

### 5.7 Health and readiness

**R-23.28** **Health** answers "is this instance functioning?". **Readiness** answers "may this instance receive work?". They are distinct and SHALL NOT be conflated.

**R-23.29** A runtime SHALL report not-ready until configuration validation, composition and boot guards have completed ([16](16-runtime-model.md) §3).

**R-23.30** A health endpoint SHALL NOT report healthy on the basis of process liveness alone. Answering "the process is running" to the question "is it working?" is how outages go undetected.

## 6. Service boundaries

| Boundary | Rule |
|---|---|
| Capability execution | This service never blocks it (R-23.7) |
| Customer tenancy | No inbound path; operational data crosses only as the Execution Plane publishes it (INV-3) |
| Customer data | This service consumes telemetry only; no C1/C2 data (R-16.34) |
| Certification | This service produces operational evidence; it renders no quality verdict (R-10.1) |

## 7. Interfaces

**R-23.31** Telemetry ingestion, alerting and incident records SHALL sit behind platform-owned interfaces ([14](14-tool-operating-model.md)). No operational vendor name appears outside its adapter (R-7.2).

**R-23.32** Operational tooling is selected by configuration, never by build flag (R-7.4).

## 8. Data ownership

| Data | Class | Owner | Residency |
|---|---|---|---|
| SLI time series | C5 | DBiz | Per tenant residency ([06](06-data-sovereignty.md)) |
| Incident and problem records | C5 | DBiz | Per residency |
| Execution Plane operational telemetry | C5 | Customer, published to DBiz | Customer decides publication |
| Backups of customer-tenancy data | C1/C3 | **Customer** | Customer tenancy only |

**R-23.33** Operational telemetry SHALL contain no C1 or C2 data (R-16.34). Backups of customer-tenancy data are **never** held by DBiz (R-08.23).

## 9. Operational model

**R-23.34** This service SHALL itself have SLOs. An operational service with no measured reliability cannot credibly assert anyone else's.

**R-23.35** Runbooks SHALL be **executable or verified**. A runbook nobody has followed is a document, not a procedure.

## 10. Configuration

**R-23.36** SLO targets, windows, budgets, alert thresholds and recovery objectives are configuration, owned by DBiz, and subject to the narrowing-only scope chain ([ADR-0009](../adr/ADR-0009-configuration-precedence.md)).

**R-23.37** Every declared operational configuration field SHALL be read by code (R-15.1). An SLO target no code evaluates is configuration theatre.

## 11. Security

**R-23.38** Operational surfaces are subject to the same authorisation as application surfaces (R-07.10, R-08.10).

**R-23.39** Incident records SHALL NOT contain customer content; they reference tenants and evidence by identifier.

**R-23.40** Restore SHALL NOT be usable as a data-exfiltration path: restore of customer-tenancy data occurs under customer-held keys ([ADR-0008](../adr/ADR-0008-encryption-at-rest.md)).

## 12. Governance

**R-23.41** Operational claims are evidence-backed or report `NOT MEASURED` (INV-10, R-13.1).

**R-23.42** Operational readiness SHALL NOT be asserted; it is computed from executed measurement and contributes to the readiness indices ([18](18-governance-model.md)).

## 13. Evidence model

**R-23.43** Every operational measurement SHALL carry the evidence envelope of R-13.2 and the provenance of R-14.4.

**R-23.44** Operational evidence expires and decays like any other (R-14.5). A restore exercised two years ago is not evidence that restore works today.

## 14. Failure modes

| # | Failure | Consequence | Mitigation |
|---|---|---|---|
| **F-23.1** | Telemetry unavailable | SLIs unmeasurable | Report `NOT MEASURED`; never interpolate (R-23.13) |
| **F-23.2** | Health reports liveness only | Outages undetected | R-23.30 |
| **F-23.3** | Backup never restored | Recovery is an assumption | R-23.25 |
| **F-23.4** | Aggregate SLI hides tenant outage | A customer is down while the platform looks healthy | Tenant-scoped SLIs (R-23.14) |
| **F-23.5** | Error budget reset by retargeting | The objective becomes decorative | R-23.17 |
| **F-23.6** | Operational service blocks execution | An availability view becomes an availability risk | R-23.7 |
| **F-23.7** | Incidents detected only by customers | Observability defect concealed as an availability one | R-23.20 |

## 15. Risks

| # | Risk | Status |
|---|---|---|
| **RK-23.1** | Execution Plane telemetry may never be published — a customer may decline | Accepted; reports `NOT MEASURED`, never penalised as failure |
| **RK-23.2** | DR for customer tenancies is outside DBiz control | Accepted; platform supplies procedure and validation only |
| **RK-23.3** | SLO targets set before real load exists will be wrong | Accepted; targets are provisional until measured and revised by ADR |

## 16. Conformance criteria
| # | Criterion | Verified by |
|---|---|---|
| **C-23.1** | Every published SLO declares SLI, target, window and consequence | SLO registry schema gate |
| **C-23.2** | No SLO is published without a consequence | Registry gate |
| **C-23.3** | Every SLI is computed from emitted telemetry | SLI derivation test |
| **C-23.4** | An SLI with unavailable telemetry reports `NOT MEASURED` | Telemetry-outage test |
| **C-23.5** | SLIs are tenant-scoped where the behaviour is tenant-visible | Per-tenant SLI test |
| **C-23.6** | Error budget exhaustion triggers its declared consequence | Budget-exhaustion test |
| **C-23.7** | A target or window change does not reset a consumed budget | Retarget negative test |
| **C-23.8** | Every incident records detection source | Incident schema gate |
| **C-23.9** | Restore is exercised and verified against content hashes | Scheduled restore exercise |
| **C-23.10** | Readiness is distinct from health, and health is not liveness-only | Endpoint behaviour test |
| **C-23.11** | Operational telemetry contains no C1/C2 data | Telemetry content scan |
| **C-23.12** | This service cannot block capability execution | Dependency-direction gate |
| **C-23.13** | Every declared operational configuration field is read by code | Declared-versus-consumed gate |
| **C-23.14** | Operational evidence carries envelope and provenance, and expires | Evidence schema gate |

**C-23.9 is the criterion this document exists to make unavoidable.** Every other operational control can be satisfied by configuration. Restore can only be satisfied by doing it.

## 17. Traceability

| Direction | Link |
|---|---|
| Constitution | INV-7 (executing plane never blocked), INV-10, INV-11 |
| ADRs | [ADR-0018](../adr/ADR-0018-platform-services-and-programme-instruments.md) (classification), [ADR-0020](../adr/ADR-0020-continuous-verification.md) (freshness), [ADR-0008](../adr/ADR-0008-encryption-at-rest.md) (restore keys) |
| Consumes | [16](16-runtime-model.md) §7 telemetry · [06](06-data-sovereignty.md) classification · [17](17-deployment-topology.md) topology |
| Consumed by | [24](24-platform-intelligence-model.md) operational intelligence · [18](18-governance-model.md) readiness |
| Implemented at | P2 / M2.6 |

## 18. Open items

| # | Item | Target |
|---|---|---|
| **AD-035** | Initial SLO targets and windows per user-visible behaviour | M2.6 |
| **AD-036** | RTO and RPO per data class | M2.6 |
| **AD-037** | Whether customers may publish operational telemetry to DBiz, and on what terms | M2.6 — bears directly on RK-23.1 |
