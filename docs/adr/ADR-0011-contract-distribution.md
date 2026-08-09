# ADR-0011 — Contract Package Distribution to Customer Tenancies

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-012

---

## 1. Problem

The Execution Plane is built by the customer, in the customer's environment, and must resolve DBiz-published contract packages ([ADR-0003](ADR-0003-shared-package-vehicle.md)). How, without granting DBiz access to the customer's build environment or placing DBiz availability on the customer's release path?

## 2. Context

- Customers frequently build in restricted, private-cloud, or air-gapped environments.
- INV-7 holds that DBiz unavailability must never block customer work — the build-time form of that principle applies equally.
- Dependency confusion is a live supply-chain threat ([22](../architecture/22-security-threat-model.md) P-23).
- Packages must be verifiable as genuinely DBiz-published.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Public registry** | Simple. **Rejected**: contracts are commercial artefacts, and a public package name invites confusion attacks. |
| **DBiz registry, direct-only** | Workable but puts DBiz availability on the customer's build critical path, and fails outright for air-gapped customers. |
| **DBiz registry with customer mirroring** | **Selected.** |
| **Ship contracts inside the Execution Plane repository** | Rejected — duplicates the artefact whose entire purpose is to be a single agreed definition. |
| **Vendor at release into a tarball** | Rejected — loses the version signal that justifies the vehicle. |

## 4. Decision

Contract packages are published to a **DBiz-operated private registry**, **scoped**, with public-registry fallback **disabled**. Packages are **signed**, and signature verification is part of the customer's build. Customers **may mirror** the registry into their own infrastructure.

- Resolution requires no DBiz access to the customer's build environment (R-17.22).
- Signature verification occurs customer-side (R-17.23).
- Mirroring means building the Execution Plane requires **no live DBiz connectivity** (R-17.24).

**Mirroring is mandatory to offer, not optional to support.** If a customer's build pipeline depended on DBiz availability, a DBiz outage would block that customer's releases — the build-time form of exactly the coupling the sovereign split exists to prevent.

## 5. Consequences

**Positive.** Air-gapped and restricted environments are supported; DBiz outages cannot block customer releases; scoping plus disabled fallback closes dependency confusion; signing closes package substitution.

**Negative, accepted.** DBiz operates a registry with real availability and security obligations. Mirrored customers may lag on contract updates — acceptable, because the Intelligence Plane must support every deployed version anyway (R-19.10), and a deployment reports the version it was built against (R-19.12), so lag is visible rather than assumed.

## 6. Migration strategy

None required — taken before publication.

**Forward path.** Registry relocation is a resolution-configuration change for direct consumers and a mirror-source change for mirrored ones; because consumers pin versions, no code changes. **Constraint:** the signing key for packages is distinct from the execution-package signing key ([ADR-0007](ADR-0007-package-signing.md)); compromise of one must not imply compromise of the other, so they rotate independently.

## 7. Version impact

No contract version change — distribution is not contract shape. Establishes that every published package is signed from the first publication, so verification is never retrofitted onto an unsigned history.

## 8. Affected components

[17](../architecture/17-deployment-topology.md) §5 (owning document) · [19](../architecture/19-repository-ownership.md) §3 (the vehicle) · [22](../architecture/22-security-threat-model.md) §5 (supply-chain paths P-21, P-23) · customer build pipelines · DBiz publication pipeline.
