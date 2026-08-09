# ADR-0001 — Platform Language, Runtime and Toolchain

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-001
**Affects:** both planes, all layers below Contracts

---

## 1. Problem

The programme had no language, runtime, or toolchain decision. This blocked P2 (contracts), P4 (Intelligence Plane runtime), P5 (Execution Plane runtime), and it left the shared-package vehicle in [19](../architecture/19-repository-ownership.md) unimplementable — a private registry cannot be specified without knowing the package manager it serves.

It was the largest single unresolved decision in the programme.

## 2. Context

Constraints the decision had to satisfy:

- **Two deployables, different owners.** The Execution Plane is built and run by customers. Its toolchain must be one enterprise customers already operate, not an exotic dependency.
- **Shared contracts across both planes.** One schema artefact must validate identically in both ([20](../architecture/20-cross-plane-contracts.md) R-20.3).
- **Structural enforcement is constitutional.** C-0.1 requires structural impossibility over tests where achievable, and the capability framework requires an incomplete capability to fail at compile time.
- **Browser, API, performance, security and penetration execution.** The Execution Plane must drive a mature tooling ecosystem for all five.
- **AI-agnostic and cloud-agnostic** (INV-4, INV-5).
- **Ten-year horizon** with versioned contracts and backward compatibility.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **TypeScript / Node.js** | Strong structural typing at compile time; the richest browser-automation and API-testing ecosystem; one language across both planes; JSON is native, so contract handling needs no translation layer. Weaker CPU-bound performance. |
| **Java / JVM** | Excellent enterprise posture, strong typing, mature. Heavier operational footprint in a customer tenancy; browser-automation ecosystem is a second-class citizen; slower iteration. |
| **C# / .NET** | Comparable to Java on typing and enterprise fit. Narrower cross-platform tool ecosystem for the execution surface; stronger Microsoft-stack coupling than a cloud-agnostic platform should assume. |
| **Go** | Excellent operational profile and deployment simplicity. Type system cannot express the typestate constraints the capability framework needs, so "incomplete capability is unrepresentable" degrades to runtime checking. |
| **Python** | Best AI ecosystem, strong security tooling. Weakest compile-time guarantees of the five — and the platform's thesis is that AI *generates* while deterministic code *decides*, so AI-ecosystem depth is the least load-bearing criterion. |
| **Polyglot (different language per plane)** | Rejected outright: contracts would require two implementations of one schema, violating R-20.3 and re-creating the predecessor's two-implementations-of-one-governed-term failure. |

## 4. Decision

| Concern | Selection |
|---|---|
| Language | **TypeScript** (strict mode) |
| Runtime | **Node.js 22 LTS** |
| Package manager | **pnpm** |
| Workspace model | **pnpm workspaces** |
| Application framework | **NestJS** |
| Contract format | **JSON** with **JSON Schema** |
| Validation | **Zod**, with JSON Schema as the published artefact |
| Composition | **Dependency injection**, mandatory |
| Architecture styles | Clean · Hexagonal · Capability-driven · Policy-driven · Configuration-driven |

**Decisive reasons.**

*One language across both planes* is what makes R-20.3 achievable — a single schema artefact, validated identically on both sides, with no translation layer to diverge.

*TypeScript's type system is expressive enough to make invalid states unrepresentable.* The capability framework requires that a capability missing a mandatory stage **fails to compile**. Discriminated unions and typestate chaining deliver that; a nominally-typed language without structural types would push the same guarantee to runtime, which C-0.1 ranks as strictly weaker enforcement.

*pnpm's strict, non-flat `node_modules`* prevents phantom dependencies — a package cannot import what it has not declared. That directly serves C-19.2 and X-19.4, and makes the boundary check in [19](../architecture/19-repository-ownership.md) enforceable rather than advisory.

*NestJS* provides first-class dependency injection and module boundaries, which the composition-root rules (R-03.1 to R-03.4) require. Its module graph is inspectable, so the single-composition-root property is mechanically checkable rather than a convention.

*Zod plus JSON Schema* gives compile-time inference and runtime validation from one definition, while publishing a language-neutral artefact — so a future non-TypeScript consumer is not excluded.

## 5. Consequences

**Positive**

- Compile-time enforcement becomes available as a constitutional mechanism, satisfying part of the ≥3-mechanism requirement (C-0.2) for many rules
- One toolchain, one skill set, one dependency graph across both planes
- Customers deploy a runtime their platform teams already operate
- The strict dependency graph makes several conformance criteria checkable that would otherwise be advisory

**Negative, and accepted**

- **CPU-bound work is slower than JVM or Go.** Accepted because the Intelligence Plane is I/O- and inference-bound rather than compute-bound, and the Execution Plane's heavy lifting happens inside external tools behind adapters.
- **TypeScript's guarantees are erased at runtime.** Every boundary therefore requires runtime validation as well — this is why Zod is mandatory rather than optional, and why compile-time validation never counts as the *sole* mechanism for a constitutional rule.
- **Node.js supply-chain surface is large.** Mitigated by pnpm's strict resolution, lockfile enforcement, and the supply-chain controls in [22](../architecture/22-security-threat-model.md).
- **Language monoculture.** Accepted deliberately: the alternative re-creates the duplicate-implementation failure the platform's integrity model exists to prevent.

## 6. Migration strategy

None required — no implementation exists. This decision is taken before P2, precisely so that no migration is ever needed.

Should a future change become necessary, the contracts layer is the migration seam: contracts are published as JSON Schema, which is language-neutral, so a plane could in principle be reimplemented without changing the other. **This is the only sanctioned migration path**, and it is why the contract artefact is JSON Schema rather than TypeScript types.

## 7. Version impact

Establishes the baseline. No contract versions exist yet, so there is no compatibility burden.

**Forward obligation:** Node.js 22 LTS reaches end of support in 2027. The platform SHALL track Node LTS releases, and a runtime upgrade is a **minor** platform version that SHALL NOT require customers to change contract versions. Runtime lifecycle and contract lifecycle are deliberately decoupled.

## 8. Affected components

| Component | Impact |
|---|---|
| Shared contract packages ([19](../architecture/19-repository-ownership.md), [20](../architecture/20-cross-plane-contracts.md)) | Published as pnpm packages; Zod definitions with generated JSON Schema |
| Intelligence Plane runtime ([03](../architecture/03-intelligence-plane-architecture.md)) | NestJS modules; composition root is a NestJS root module |
| Execution Plane runtime ([04](../architecture/04-execution-plane-architecture.md)) | NestJS; adapters are injectable providers |
| Capability framework ([11](../architecture/11-capability-model.md), [12](../architecture/12-capability-orchestration.md)) | Typestate chaining makes an incomplete capability a compile error |
| Governance checks | Extended to type-level and dependency-graph assertions |
| Deployment ([17](../architecture/17-deployment-topology.md)) | Node 22 base images; pnpm install with frozen lockfile |
