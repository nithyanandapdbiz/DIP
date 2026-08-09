# 19 — Repository Ownership & Shared Package Strategy

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.2
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rule 1
**Resolves:** AD-002

**This document owns:** repository boundaries, what lives in each, the vehicle for plane-neutral shared code, and its versioning.
**It does not own:** the contents of the contracts ([20](20-cross-plane-contracts.md)) or deployment packaging ([17](17-deployment-topology.md)).

---

## 1. Two repositories, and no third

| Repository | Owner | Tenancy | Upgrade cadence |
|---|---|---|---|
| `DBiz_IntelligencePlane` | DBiz | DBiz, multi-tenant | Continuous |
| `CarlisleHomes_ExecutionPlane` | Customer | Customer | Customer's change calendar |

**R-19.1** The platform SHALL consist of exactly these two repositories. Introducing a third requires an approved ADR amending R-1.1.

**The boundary is ownership, not convenience.** These repositories have different owners, different tenancies, different threat models, and different release schedules. A folder boundary would express none of that; a repository boundary expresses all of it.

## 2. Ownership matrix

| Concern | Intelligence Plane | Execution Plane |
|---|---|---|
| Canonical enterprise architecture | ✅ | — |
| Capability registry & definitions | ✅ | — |
| Workflow definitions | ✅ | — |
| Governance & policy engine | ✅ | — |
| Certification engine | ✅ | — |
| Knowledge graph | ✅ | — |
| Tenant registry & lifecycle | ✅ | — |
| Review framework | ✅ | — |
| AI runtime & inference | ✅ | — |
| Platform APIs | ✅ | — |
| Shared contracts (authorship) | ✅ | — |
| Programme operational memory | ✅ | — |
| Governance-as-code checks | ✅ | — |
| Execution runtime & sequencing | — | ✅ |
| Browser / API / performance / security / penetration execution | — | ✅ |
| Tool adapters | — | ✅ |
| AI provider mapping & credentials | — | ✅ |
| Tool credentials | — | ✅ |
| Customer & environment configuration | — | ✅ |
| Customer data | — | ✅ |
| Execution evidence | — | ✅ |

**R-19.2** No concern appears in both columns. A concern that appears to need both belongs in the contracts layer, not in either repository's application code.

**R-19.3** Programme operational memory resides in the Intelligence Plane. Placing it in the customer-owned repository would expose DBiz's internal risk, debt, and decision posture across the sovereignty boundary.

## 3. Shared package strategy — AD-002 resolved

### 3.1 The decision

**R-19.4** Plane-neutral code SHALL be distributed as **versioned packages published to a private registry**, authored in the Intelligence Plane repository and consumed by the Execution Plane as a declared, version-pinned dependency.

**R-19.5** Sharing code by relative filesystem path is **prohibited** (R-1.4). A directory reachable only by relative path is not a library.

**R-19.6** A shared package SHALL be: **named, versioned, owned, independently releasable, and declared** in the consuming repository's manifest.

### 3.2 Why this vehicle and not the alternatives

| Alternative | Rejected because |
|---|---|
| **Relative path across repository roots** | Works in a development workspace and fails silently at containerisation, because the failure surface is a deployment artefact. In the predecessor this pattern reached neither container image and accumulated twenty-six import sites before anyone noticed. |
| **Git submodule** | Pins a commit rather than a contract version, gives no semantic-version compatibility signal, and requires customers to authenticate against a DBiz repository to build. |
| **Monorepo containing both planes** | Destroys the ownership boundary that is the product. Customers would receive DBiz's reasoning source. |
| **Duplicating the contract in both repositories** | Two sources of truth for the one artefact whose entire purpose is to be a single agreed definition. Guarantees divergence. |
| **Vendoring at build time** | Loses the version signal, and drift becomes undetectable because no manifest records what was vendored. |

**The decisive property is that a version-pinned dependency makes skew visible.** A customer's Execution Plane declares exactly which contract version it was built against. Nothing else on this list can state that.

### 3.3 What may and may not be shared

| Permitted in a shared package | Prohibited |
|---|---|
| Contract type definitions and schemas | Business logic |
| Validation of those schemas | AI or inference code |
| The canonical integrity primitive | Anything touching customer systems |
| Canonical serialisation | Credential handling |
| Version negotiation helpers | Tenant-routing logic |
| Error and result taxonomies | Any decision or verdict computation |

**R-19.7** A shared package SHALL contain no business logic. It defines and validates the shape of what crosses the boundary; it does not decide anything.

**Rationale.** Shared logic would execute in both a DBiz tenancy and a customer tenancy under different threat models, with a single implementation satisfying neither. Shared *shape* has no such problem.

### 3.4 The canonical integrity primitive is a shared package

**R-19.8** The platform's single canonical hashing primitive SHALL be defined in exactly one shared package, with mandatory domain separation and a recorded algorithm version.

This is deliberately placed here rather than left to implementation. In the predecessor, one governed term acquired two implementations in two locations, producing divergent digests — so evidence written by one and verified by the other reported **tampering on untampered records**. A false tamper verdict is more corrosive than a missed detection: it trains operators to discount the control.

Detailed contract in [20](20-cross-plane-contracts.md); evidence semantics in [10](10-evidence-flow-model.md).

## 4. Versioning and compatibility

**R-19.9** Shared packages SHALL use semantic versioning. A breaking change to a contract is a **major** version.

**R-19.10** The Intelligence Plane SHALL support every contract major version still deployed in any customer tenancy. Support windows are declared, not implicit.

**R-19.11** An Execution Plane may run against an **older** contract version than the Intelligence Plane's current. The reverse SHALL NOT be required.

**R-19.12** Every deployed Execution Plane SHALL report the contract version it was built against, so the deployed-version population is a known quantity rather than an estimate.

**The asymmetry is commercial, not technical.** DBiz controls its own cadence and can carry compatibility burden. A customer cannot be compelled to upgrade on DBiz's schedule, and a platform that required it would be unsellable into the enterprises this platform targets.

## 5. Prohibited patterns

| # | Prohibited | Why |
|---|---|---|
| **X-19.1** | Any `import`/`require` resolving outside its repository root | R-1.4; the defect that reached neither container image |
| **X-19.2** | A third repository | R-1.1 |
| **X-19.3** | Business logic in a shared package | R-19.7 |
| **X-19.4** | An undeclared dependency | Makes the deployed population unknowable |
| **X-19.5** | A floating or unpinned shared-package version | Removes the skew signal that justifies the vehicle |
| **X-19.6** | Customer-owned code in the Intelligence Plane, or DBiz reasoning in the Execution Plane | R-19.2 |

## 6. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-19.1** | No module resolution escapes its repository root | Boundary check, strict mode from the first commit |
| **C-19.2** | Every shared dependency is declared and version-pinned in the consuming manifest | Manifest gate |
| **C-19.3** | Exactly two repositories exist | Repository inventory gate |
| **C-19.4** | No shared package exports a function that computes a decision | Shared-package surface gate |
| **C-19.5** | The runtime dependency closure of each plane is fully covered by its container manifest, including lazily-loaded edges | Image-closure check |
| **C-19.6** | Exactly one implementation of the canonical integrity primitive exists platform-wide | Governed-term registry gate |
| **C-19.7** | Every deployed Execution Plane reports its contract version | Telemetry conformance test |

**C-19.5 warrants emphasis.** A lazily-loaded dependency is invisible to a naive manifest check: the image boots successfully and fails only on the first real request that reaches that code path. The check SHALL walk lazy edges, not only top-level ones.

## 7. Open items

| # | Item | Target |
|---|---|---|
| **AD-001** | Language and runtime — determines the package manager and registry technology | M1.6 |
| **AD-012** | Private registry hosting and customer access model | M1.5 |

**AD-012 has an ownership dimension.** The Execution Plane runs in the customer's tenancy and must resolve a DBiz-published package at build time. Whether that is a proxied registry, a signed artefact bundle, or a mirror inside the customer's own infrastructure is a decision with security, network, and commercial consequences — recorded here so it is resolved deliberately rather than by whichever mechanism proves easiest first.
