# Architecture baseline — frozen at closure

**Commit:** `a7821fd63f6fedc2c7888478d33fcd33e300b765` · **Baseline hash:** `faa0f6c020d4e26185d3066573939090…`

## What this is, and what it is not

This is a **cryptographic snapshot** of the closed architecture: every document with
its content hash, so drift after closure is detectable by recomputation rather than by
review.

It does **not** duplicate [ARCHITECTURE_STATUS.md](ARCHITECTURE_STATUS.md), which owns
the living question *"which documents exist and what state are they in"*. This answers
a different one: *"what exactly was frozen, and has it moved since"*. One topic, one
home — the two would otherwise become a pair of records that disagree.

## The canonical set

**25 documents · 25 frozen · 422 conformance criteria**

| # | Document | Frozen | Criteria | SHA-256 |
|---|---|---|---|---|
| 01 | `01-platform-constitution.md` | **yes** | 52 | `3f71462175e06fdf…` |
| 02 | `02-reference-architecture.md` | **yes** | 8 | `901535875395828a…` |
| 03 | `03-intelligence-plane-architecture.md` | **yes** | 22 | `1e52d860f6358742…` |
| 04 | `04-execution-plane-architecture.md` | **yes** | 14 | `c347f16bc09d913d…` |
| 05 | `05-cross-plane-communication.md` | **yes** | 12 | `df995b20ef6e1d54…` |
| 06 | `06-data-sovereignty.md` | **yes** | 12 | `224a5dffc8d718a9…` |
| 07 | `07-tenant-isolation.md` | **yes** | 12 | `a17fb25f39421e6d…` |
| 08 | `08-security-model.md` | **yes** | 27 | `80b895cf3f2d7e15…` |
| 09 | `09-data-flow-model.md` | **yes** | 12 | `b557e16da1d1ac5b…` |
| 10 | `10-evidence-flow-model.md` | **yes** | 14 | `6463d717f2e5766c…` |
| 11 | `11-capability-model.md` | **yes** | 13 | `898b6cf94a4ee88a…` |
| 12 | `12-capability-orchestration.md` | **yes** | 18 | `af5bc2b255d56f52…` |
| 13 | `13-ai-operating-model.md` | **yes** | 20 | `9b4bd662ee382059…` |
| 14 | `14-tool-operating-model.md` | **yes** | 14 | `cc0331a4e86647d7…` |
| 15 | `15-configuration-model.md` | **yes** | 13 | `d4662b10de299183…` |
| 16 | `16-runtime-model.md` | **yes** | 20 | `db7275107029c78c…` |
| 17 | `17-deployment-topology.md` | **yes** | 15 | `3840cb3ada21ab0b…` |
| 18 | `18-governance-model.md` | **yes** | 18 | `564ae8cb198da4c5…` |
| 19 | `19-repository-ownership.md` | **yes** | 7 | `babec565f22ce61e…` |
| 20 | `20-cross-plane-contracts.md` | **yes** | 14 | `0c406661e989f10d…` |
| 21 | `21-tenant-lifecycle.md` | **yes** | 31 | `bd08be0155f61154…` |
| 22 | `22-security-threat-model.md` | **yes** | 11 | `e4652d34fbdb2ed8…` |
| 23 | `23-operational-excellence-model.md` | **yes** | 14 | `6552e755ca98c519…` |
| 24 | `24-platform-intelligence-model.md` | **yes** | 15 | `977b9e06acfa6db9…` |
| 25 | `25-customer-success-model.md` | **yes** | 14 | `58fd598e5dbacd46…` |

## Decisions

**79 ADRs.**

| ADR | Status | SHA-256 |
|---|---|---|
| `ADR-0001-platform-language-and-runtime.md` | ACCEPTED | `1210560e0e6dd282…` |
| `ADR-0002-capability-extension-points.md` | ACCEPTED | `4f98a415df5e901f…` |
| `ADR-0003-shared-package-vehicle.md` | ACCEPTED | `773a36e6187c3011…` |
| `ADR-0004-wire-format.md` | ACCEPTED | `a7ab349d6cf0d5e8…` |
| `ADR-0005-canonical-integrity-primitive.md` | ACCEPTED | `00ec650b7944ab7e…` |
| `ADR-0006-retention-model.md` | ACCEPTED | `2acad0e182525123…` |
| `ADR-0007-package-signing.md` | ACCEPTED | `ec11b79e370dbb4b…` |
| `ADR-0008-encryption-at-rest.md` | ACCEPTED | `2c7c36f474189923…` |
| `ADR-0009-configuration-precedence.md` | ACCEPTED | `f7baf05498df1f99…` |
| `ADR-0010-tenant-storage-layout.md` | ACCEPTED | `24ad17d82c36a95a…` |
| `ADR-0011-contract-distribution.md` | ACCEPTED | `3e5d652c27a9f5a2…` |
| `ADR-0012-cloud-portability.md` | ACCEPTED | `7f0b0e6157142c00…` |
| `ADR-0013-execution-lifecycle-limits.md` | ACCEPTED | `a2f01d84bcb60635…` |
| `ADR-0014-pii-scrubbing-posture.md` | ACCEPTED | `42356c9263c8360f…` |
| `ADR-0015-degraded-operation-mechanism.md` | ACCEPTED | `a8ceeae074276a0c…` |
| `ADR-0016-ai-tool-agnosticism.md` | ACCEPTED | `a6aa5387b4eb35bc…` |
| `ADR-0017-runtime-baseline-node-24.md` | ACCEPTED | `32b643c056c4e687…` |
| `ADR-0018-platform-services-and-programme-instruments.md` | ACCEPTED | `f90e2f1b143076a5…` |
| `ADR-0019-evidence-over-assertion.md` | ACCEPTED | `446f496702555210…` |
| `ADR-0020-continuous-verification.md` | ACCEPTED | `2aa63117834f2c04…` |
| `ADR-0021-platform-core-bounded-context.md` | ACCEPTED | `713ac8d07bf292a9…` |
| `ADR-0022-functional-testing-engine-internal-structure.md` | ACCEPTED | `6cb4099cbd4fe86a…` |
| `ADR-0023-discovery-flow-engine-internal-structure.md` | ACCEPTED | `7809d27355b60fea…` |
| `ADR-0024-dev-change-engine-internal-structure.md` | ACCEPTED | `15d3fb977f93db3b…` |
| `ADR-0025-platform-certification-framework.md` | ACCEPTED | `3afc1b01564ab627…` |
| `ADR-0026-performance-engine-internal-structure.md` | A | `bff5a4ed864ed373…` |
| `ADR-0027-penetration-testing-engine-internal-structure.md` | ACCEPTED | `81e781e4d6351e93…` |
| `ADR-0028-security-testing-engine-internal-structure.md` | ACCEPTED | `2ea3dc259cd16f41…` |
| `ADR-0029-security-intelligence-layer-and-platform-intelligence-boundary.md` | ACCEPTED | `c23c4ec5e743868e…` |
| `ADR-0030-tenant-lifecycle-management-orchestration.md` | ACCEPTED | `421580f192114261…` |
| `ADR-0031-onboarding-experience-layer.md` | ACCEPTED | `7e06f16f8ea4078b…` |
| `ADR-0032-tenant-configuration-repository-ssot.md` | ACCEPTED | `4c70b4a5195a5348…` |
| `ADR-0033-production-web-tier.md` | ACCEPTED | `68cf91cb5a2a3f35…` |
| `ADR-0034-tenant-onboarding-engine-refounding.md` | UNKNOWN | `49eb018cf3134d4b…` |
| `ADR-0035-execution-plane-operational-portal.md` | UNKNOWN | `6a4fd46ca1db103f…` |
| `ADR-0036-execution-plane-registration-and-trust-establishment.md` | ACCEPTED | `d5260ffa8b4f9680…` |
| `ADR-0037-execution-target-simplification.md` | PROPOSED | `0afa5d4c2ed17c00…` |
| `ADR-0038-execution-authoring-intent-conservation.md` | PROPOSED | `42b4ec758f16c2c4…` |
| `ADR-0039-functional-testing-capability-refounding.md` | UNKNOWN | `104cad32de507e3d…` |
| `ADR-0040-canonical-platform-contract-framework.md` | UNKNOWN | `8b838957e85c7bb5…` |
| `ADR-0041-generation-output-sovereignty.md` | UNKNOWN | `9850a8539d746b40…` |
| `ADR-0042-repository-purity-and-output-isolation.md` | UNKNOWN | `88d7f23e9f1028eb…` |
| `ADR-0043-executable-constitutional-governance-and-traceability.md` | UNKNOWN | `c9aa5214c01c414b…` |
| `ADR-0044-functional-testing-capability-activation.md` | UNKNOWN | `62a080eaa509a4d6…` |
| `ADR-0045-functional-testing-production-qualification.md` | UNKNOWN | `bcfc702b5c2aa5f5…` |
| `ADR-0046-legacy-functional-pipeline-retirement.md` | UNKNOWN | `d380a8a75165400e…` |
| `ADR-0047-canonical-runtime-integration.md` | UNKNOWN | `d4e676ec68ad1748…` |
| `ADR-0048-canonical-runtime-integration-m1-m3.md` | UNKNOWN | `d6471847061199fb…` |
| `ADR-0049-canonical-runtime-cutover.md` | UNKNOWN | `44385578069c4b25…` |
| `ADR-0050-runtime-enablement-m4.md` | UNKNOWN | `af632fd3bda4588f…` |
| `ADR-0051-production-readiness-review.md` | UNKNOWN | `45b4af520d7962af…` |
| `ADR-0052-first-runtime-deployment.md` | UNKNOWN | `b1c4c4b14fa998d8…` |
| `ADR-0053-repository-governance-reconciliation.md` | UNKNOWN | `4382db909f2a72ef…` |
| `ADR-0054-operational-handover.md` | UNKNOWN | `4f1387aa0ff007b3…` |
| `ADR-0060-cloud-native-provider-platform.md` | UNKNOWN | `d9b016ed6ca5582c…` |
| `ADR-0061-canonical-functional-capability-runtime-adoption.md` | ACCEPTED | `d02b589c04e9b8dc…` |
| `ADR-0062-canonical-platform-capability-lifecycle.md` | ACCEPTED | `23a09fb4c575b059…` |
| `ADR-0063-sbom-build-artifact-model.md` | A | `b49418e236cddab7…` |
| `ADR-0066-functional-workflow-governance.md` | P | `a163882a76ab86ce…` |
| `ADR-0067-reasoning-result-registry.md` | A | `3e02c354b5312414…` |
| `ADR-0069-capability-one-connector-realisation.md` | A | `af3e024deb585894…` |
| `ADR-0070-execution-package-retrieval-inversion.md` | A | `d62c6a5ba6702cbf…` |
| `ADR-0071-stage-refusal-primitive.md` | A | `47b2e214f75ddff4…` |
| `ADR-0072-publication-outcome-spi.md` | A | `b689f058b76a31de…` |
| `ADR-0073-design-sync-publication-outcome.md` | A | `1faabbdbce6cbe34…` |
| `ADR-0074-connector-read-reachability.md` | PROPOSED | `5f7f7034e3dbd502…` |
| `ADR-0075-observation-interpretation-canonical-composition.md` | PROPOSED | `03a1d0f54011431f…` |
| `ADR-0076-declaration-typing-and-independent-review.md` | ACCEPTED | `edcae99e0acde29e…` |
| `ADR-0077-canonical-authoring-cutover.md` | UNKNOWN | `a1beb8b9e5be4893…` |
| `ADR-0078-package-retrieval-recorded-in-architecture.md` | UNKNOWN | `196bd51c98e0a08e…` |
| `ADR-0079-retrievable-package-store.md` | ACCEPTED | `9750e2ffdbee8f95…` |
| `ADR-0080-work-request-exchange.md` | ACCEPTED | `89c45c918a10f451…` |
| `ADR-0081-execution-package-signature-carrier.md` | ACCEPTED | `6b70a6009f8509e5…` |
| `ADR-0082-run-and-evidence-record.md` | ACCEPTED | `5f803f33e631595c…` |
| `ADR-0083-signing-key-custody.md` | ACCEPTED | `cc9d162caa58fedf…` |
| `ADR-0084-rule-6-scope.md` | ACCEPTED | `006cf777350af2e4…` |
| `ADR-0085-tenant-test-repository-disposition.md` | ACCEPTED | `6d06f47f40ad7eae…` |
| `ADR-0086-reference-output-parity-as-domain-depth.md` | ACCEPTED | `74c83be4e3d9ad6e…` |
| `ADR-0087-functional-testing-capability-removal.md` | UNKNOWN | `0e62687e47dfd514…` |

## Invariants held at closure

| Invariant | Value |
|---|---|
| Architecture documents | **25** |
| Documents frozen | **25/25** |
| Platform Services | **3** — Operational Excellence (23), Platform Intelligence (24), Customer Success (25) |
| Quality Engineering Capabilities | **6** — R-11.4 |
| Planes | **2** — the sovereign split |
| ADRs | **79**, ADR-0021 among them and unchanged |
| Documents numbered 26 or above | **0** |

**Each of these is verified by an executing fitness function**, not by this table.
The table records what the fitness functions found at closure.

## Ownership

Each document declares what it owns and what it does not. The anti-duplication
contract is enforced by the architecture-integrity gate, which fails on a topic with
two owners.

| Document | Owns |
|---|---|
| `02` | the whole-system view — how the two planes, the execution package, and the evidence chain compose into one platform. |
| `03` | the internal structure of the Intelligence Plane, including its bounded contexts, technology profiles and the solution generation engine. |
| `04` | the internal structure of the Execution Plane. |
| `05` | direction, transport, the result taxonomy, retry semantics, and the degradation matrix. |
| `06` | data classification, residency, the conditions under which customer data may exist in the Intelligence Plane, and retention and purge **obligations**. |
| `07` | the isolation dimensions, partitioning strategy, and the single validated path constructor. |
| `08` | trust boundaries, threat posture, authentication, authorisation, secret handling, and key management. |
| `09` | what data moves where, under what authority, and with what transformation. |
| `10` | evidence capture, custody, integrity, the reference chain, and why a decision outlives the evidence it cites. |
| `11` | what a capability is, the five capabilities, their ownership across the planes, and the capability registry. |
| `12` | the twelve-stage lifecycle, what each stage does, which plane executes it, and why no stage may be bypassed. |
| `13` | the agent contract, AI boundaries, provider abstraction, AI-disabled operation, provider integration, and the **AI Capability Class taxonomy**. |
| `14` | tool abstraction, the adapter interfaces, tool integration strategy, and vendor containment. |
| `15` | the configuration schema model, precedence, the ownership split, and declared-versus-consumed enforcement. |
| `16` | the process model, composition, lifecycle, concurrency, and scheduling. |
| `17` | deployment topology, images and build, cloud portability and integration. |
| `18` | the governance model, gates, the certification authority, and how conformance is reported. |
| `19` | repository boundaries, what lives in each, the vehicle for plane-neutral shared code, and its versioning. |
| `20` | the execution package and evidence contracts, the canonical integrity primitive, the wire format, and contract versioning. |
| `21` | tenant identity, onboarding, provisioning, state transitions, suspension, and offboarding. |
| `22` | threat actors, assets, attack paths, the threat-to-mitigation map, **replay protection**, and **supply-chain security**. |
| `23` | SLOs, SLIs, error budgets, incident and problem management, capacity planning, HA/DR, backup and restore validation, health and readiness models, and  |
| `24` | engineering, governance, operational, customer, AI and executive intelligence; the analytics pipeline; dashboard architecture; and evidence sourcing. |
| `25` | installation, upgrade, migration and configuration lifecycles from the customer's perspective; documentation, API and SDK strategy; training; support; |

## Detecting drift against this baseline

```
node governance/verification/verify-programme-closure.js
```

It recomputes every hash above. A changed document fails the gate and is named.
**Amending the architecture is permitted; amending it silently is not.**

---

*Generated from 25 documents and 79 ADRs.*
