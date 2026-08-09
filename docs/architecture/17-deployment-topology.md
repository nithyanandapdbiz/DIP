# 17 — Deployment Topology & Cloud Integration

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.5
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rule 1
**Resolves:** AD-011, AD-012, AD-014

**This document owns:** deployment topology, images and build, cloud portability and integration.
**It does not own:** the process and concurrency model ([16](16-runtime-model.md)), repository boundaries ([19](19-repository-ownership.md)), supply-chain controls ([22](22-security-threat-model.md)), or encryption ([08](08-security-model.md)).

---

## 1. Topology

**R-17.1** Exactly two deployable artefacts: the Intelligence Plane image and the Execution Plane image.

| | Intelligence Plane | Execution Plane |
|---|---|---|
| Deployed by | DBiz | **The customer** |
| Deployed into | DBiz tenancy | Customer tenancy |
| Instances | Multiple per region, horizontally scaled | One or more per customer, typically per environment |
| Tenancy | Multi-tenant | Single-tenant |
| Inbound from the other | **None** | Responses only, to its own requests |
| Upgrade cadence | Continuous | Customer's change calendar |

**R-17.2** DBiz SHALL NOT deploy into a customer tenancy (R-21.12).

**R-17.3** The customer SHALL NOT be required to open an inbound network path to DBiz (R-05.2).

**R-17.4** Regional Intelligence Plane deployments SHALL enforce tenant residency ([06](06-data-sovereignty.md) R-06.7).

## 2. Images and build

**R-17.5** Both images SHALL be built in CI **on every commit**. Build failure blocks merge.

**R-17.6** Build verification SHALL NOT be deferred to release.

**R-17.7** The image manifest SHALL be verified against the runtime dependency closure, **including lazily-loaded edges** (C-19.5).

**R-17.8** Images SHALL contain no secret material, no customer data, and no development-only tooling.

**R-17.9** Neither allowlist nor denylist copying is mandated. **Whichever is chosen SHALL be automatically verified.**

**R-17.10** No image default may weaken a control (C-0.5, R-15.15).

### Why R-17.5 and R-17.7 are separate requirements

R-17.5 catches an image that will not build. R-17.7 catches an image that **builds and starts successfully, then fails on the first real request** because a lazily-loaded dependency is absent from the manifest. The predecessor carried both defects: a `COPY` referencing a directory deleted three commits earlier went undetected because the only build ran on release tags, and shared code reached neither image because nothing walked the actual dependency closure.

**A green build is not evidence of a working image.**

### On R-17.9

An allowlist fails toward **omission** — something needed is missing, and the failure is loud at build or first use. A denylist fails toward **inclusion** — secrets, state, or development tooling ship silently. Neither is safe unverified, so the architecture mandates verification rather than a strategy.

## 3. Cloud portability — AD-014 resolved

**R-17.11** No layer above the adapter layer SHALL reference a cloud primitive directly ([02](02-reference-architecture.md) §2).

**R-17.12** Cloud services — object storage, queues, key management, secret stores, databases — SHALL sit behind platform-owned interfaces ([14](14-tool-operating-model.md)).

**R-17.13** Both planes SHALL run on **any** major cloud, and on customer-managed infrastructure.

**R-17.14** Deployment artefacts SHALL be container images with no cloud-specific packaging requirement.

**R-17.15** Cloud selection is **configuration**, never a build-time or code-level decision.

**R-17.13's second clause is the commercially load-bearing one.** The Execution Plane runs where the customer's data lives — which is frequently on-premises, in a regulated private cloud, or in an air-gapped environment. A platform whose execution side required a specific public cloud would be unsellable to exactly the customers whose sovereignty constraints make the split valuable in the first place.

## 4. Storage layout — AD-011 resolved

**R-17.16** Tenant-scoped storage SHALL be **physically partitioned**, with the tenant identifier as the leading path or partition-key component ([07](07-tenant-isolation.md)).

**R-17.17** The layout SHALL be: `tenant / capability / run / artefact`.

**R-17.18** Every location SHALL be produced by the single validated path constructor (R-07.3).

**R-17.19** The layout SHALL permit purge at the tenant, capability, and run levels **without scanning unrelated data**.

**R-17.20** Storage SHALL be addressable through an interface, not a cloud-native API (R-17.12).

**R-17.19 is why the layout is fixed in architecture rather than left to implementation.** A layout that cannot purge a tenant without a full scan makes offboarding operationally infeasible at hundreds of customers, and makes retention enforcement expensive enough that it will eventually be skipped. **Choosing the layout before the first write is the only cheap moment** — the predecessor's evidence store was both immutable and unpartitioned, so repartitioning would have meant writing new files while retaining old ones indefinitely.

## 5. Contract distribution — AD-012 resolved

**R-17.21** Shared contract packages are published to a **DBiz-operated private registry**, scoped, with public-registry fallback disabled ([22](22-security-threat-model.md) R-22.7).

**R-17.22** A customer tenancy SHALL resolve contract packages **without granting DBiz access to the customer's build environment**.

**R-17.23** Published packages SHALL be **signed**, and signature verification SHALL be part of the customer's build.

**R-17.24** Customers SHALL be able to **mirror** the registry into their own infrastructure, so that building the Execution Plane does not require live DBiz connectivity.

**R-17.24 follows from the same logic as INV-7.** If a customer's build pipeline depended on DBiz availability, a DBiz outage would block the customer's releases — which is the build-time form of exactly the coupling the sovereign split exists to prevent. Availability of DBiz must never be on a customer's critical path.

## 6. Upgrade and version skew

**R-17.25** Version skew is the **normal state**, not an exception ([02](02-reference-architecture.md) §6).

**R-17.26** The Intelligence Plane SHALL support every contract major version still deployed in any tenancy, with declared support windows (R-19.10).

**R-17.27** An Execution Plane may run **older** than the Intelligence Plane. The reverse SHALL NOT be required (R-19.11).

**R-17.28** Every deployed Execution Plane SHALL report its contract version, so the deployed population is known rather than estimated (R-19.12).

**R-17.29** A runtime upgrade SHALL NOT require a contract version change. Runtime and contract lifecycles are decoupled ([ADR-0001](../adr/ADR-0001-platform-language-and-runtime.md) §7).

## 7. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-17.1** | Both images build in CI on every commit; failure blocks merge | CI trigger audit; `NOT RUN` ≡ `FAIL` |
| **C-17.2** | The image manifest covers the full runtime closure, including lazy edges | Image-closure check |
| **C-17.3** | Each image starts and serves a real request in CI | Smoke test per image |
| **C-17.4** | No image contains secret material, customer data, or development tooling | Image content scan |
| **C-17.5** | The chosen copy strategy is automatically verified | Build-context completeness check |
| **C-17.6** | No image default weakens a control | Image-default audit against the control inventory |
| **C-17.7** | No cloud primitive is referenced above the adapter layer | Source scan |
| **C-17.8** | Both planes deploy and pass smoke tests on at least two clouds and one customer-managed target | Multi-target deployment test |
| **C-17.9** | Cloud selection is configuration only | Selection-source test |
| **C-17.10** | Every storage location comes from the canonical path constructor | Path-construction gate |
| **C-17.11** | Tenant, capability and run purge complete without scanning unrelated data | Purge-scope test |
| **C-17.12** | Contract packages are signed and verified at customer build | Unsigned-package negative test |
| **C-17.13** | The Execution Plane builds from a mirrored registry with no DBiz connectivity | Offline build test |
| **C-17.14** | Every supported contract version has a passing compatibility test | Compatibility matrix |
| **C-17.15** | Every deployed Execution Plane reports its contract version | Telemetry conformance test |

**C-17.3 exists because C-17.1 is insufficient.** An image that builds is not an image that runs, and the gap between them is where the predecessor's stale `COPY` and missing shared code both hid. **Starting the image and serving one real request is the cheapest possible proof that the artefact is real.**

## 8. Open items

| # | Item | Target |
|---|---|---|
| **AD-033** | Whether DBiz offers a managed Execution Plane for customers who prefer it | P2 |

**AD-033 is a commercial question with a sovereignty consequence.** A DBiz-managed Execution Plane inside a DBiz-controlled tenancy would place customer data and credentials back under DBiz control — dissolving the property the platform is built to provide. If offered at all it is a **different product** with a different trust model, and it SHALL NOT be represented as the sovereign split.
