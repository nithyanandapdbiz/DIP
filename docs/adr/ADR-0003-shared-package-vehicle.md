# ADR-0003 — Shared Package Vehicle

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-002
**Retrospective:** decision taken in M1.2; regularised under D-001

---

## 1. Problem

Both planes need identical contract definitions. They are separate repositories, separately owned, deployed into different tenancies on different schedules. How is plane-neutral code shared without violating R-1.4, which forbids sharing by relative filesystem path?

## 2. Context

- **R-1.4** — a shared library is a versioned, owned, releasable artefact. A directory reachable only by relative path is not a library.
- **R-20.3** — both planes must validate against the *same* schema artefact, not two hand-maintained copies.
- The Execution Plane is built by customers, frequently in restricted or air-gapped environments.
- Version skew between planes is the normal state ([02](../architecture/02-reference-architecture.md) §6).

## 3. Alternatives

| Option | Rejected because |
|---|---|
| **Relative path across repository roots** | Works in a development workspace and fails silently at containerisation. In the predecessor this reached neither container image and accumulated 26 import sites before discovery. |
| **Git submodule** | Pins a commit, not a contract version; gives no semantic compatibility signal; requires customers to authenticate against a DBiz repository to build. |
| **Monorepo containing both planes** | Destroys the ownership boundary that is the product. Customers would receive DBiz reasoning source. |
| **Duplicate the contract in both repositories** | Two sources of truth for the one artefact whose purpose is to be a single agreed definition. |
| **Build-time vendoring** | No version signal; drift undetectable because no manifest records what was vendored. |

## 4. Decision

Plane-neutral code is distributed as **versioned packages published to a DBiz-operated private registry**, authored in the Intelligence Plane and consumed by the Execution Plane as a **version-pinned** dependency.

Shared packages contain **shape and validation only** — no business logic, no inference, no credential handling, no decision computation (R-19.7).

**The deciding property is that a pinned dependency makes version skew visible.** A deployment declares exactly which contract version it was built against. No alternative on the list can state that.

## 5. Consequences

**Positive.** Skew is a known quantity rather than an estimate; the compatibility matrix is testable; a customer build is reproducible; the boundary check becomes enforceable rather than advisory.

**Negative, accepted.** DBiz must operate a private registry with the availability and security obligations that entails. Customers must be able to resolve it, which is why mirroring is mandatory (R-17.24) — otherwise DBiz availability would sit on a customer's release critical path.

**Prohibited by this decision.** Relative-path sharing; undeclared dependencies; floating or unpinned versions; business logic in a shared package.

## 6. Migration strategy

None required — taken before any implementation.

**Forward migration path.** Because the published artefact is JSON Schema rather than TypeScript types, a future consumer in another language can be added without changing the vehicle. Should the registry itself need to change, the migration seam is the package manifest: consumers pin versions, so a registry move is a resolution change, not a code change.

**If this decision were reversed**, every consuming manifest would need updating and every deployed Execution Plane would need rebuilding. That cost is the reason the vehicle is decided before the first shared line is written.

## 7. Version impact

Establishes shared-package versioning as **semantic**. A breaking contract change is a major version; additive change is minor (R-20.23, R-20.26). No existing versions, so no compatibility burden.

## 8. Affected components

[19](../architecture/19-repository-ownership.md) §3 (owning document) · [20](../architecture/20-cross-plane-contracts.md) (contracts distributed by this vehicle) · [17](../architecture/17-deployment-topology.md) §5 (registry, signing, mirroring) · [22](../architecture/22-security-threat-model.md) §5 (dependency confusion, substitution) · both plane build pipelines.
