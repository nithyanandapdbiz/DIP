# ADR-0060 — Cloud-Native Provider Platform

**Status:** **PROPOSED** · **Date:** 2026-07-29. This ADR introduces an **additive** infrastructure-abstraction layer (`@dbiz/platform-providers`) so the Intelligence Plane runs identically on a developer laptop, in Docker, and in Azure Container Apps from **one image**, differing **only by configuration**. It changes **no** frozen contract, **no** capability, **no** domain, and **no** runtime orchestration. It does **not** perform, authorise, or unblock the M5 cut-over (ADR-0049) or the M6 legacy retirement (ADR-0046); both remain DEFERRED and untouched.

> **Numbering note (CLAUDE.md §5).** This decision was first drafted as ADR-0051; a concurrent governance stream had already taken 0051/0052/0053 (`production-readiness-review`, `first-runtime-deployment`, `repository-governance-reconciliation`). It was renumbered to 0060 — their files untouched — mirroring the ADR-0041→0044 precedent.

> **Honest boundary.** This ADR delivers the abstraction *seam* and its Local + reference-Cloud implementations, certified by an executed conformance suite. Live Azure integration (Key Vault → env, Azure Files SMB mount, Azure Cache for Redis) and horizontal scale-out remain **NOT MEASURED** here — there is no container runtime (E-2), no Redis server, and no Azure estate on this host. No production readiness, GA, or behavioural-equivalence claim is made.

## 1. Problem

A cloud-readiness review (repository evidence, 2026-07-29) found the Intelligence Plane is architecturally portable — **no server-side Azure SDK anywhere**, secrets read from `process.env`, storage behind `TenantConfigStore`/`RegistrationStore` interfaces — but its *runtime posture* blocks production:

- **No single configuration pipeline.** `process.env` is read ad-hoc and **duplicated** across two entrypoints (`server/index.ts`, `run-server.mjs`) with independent defaults and no schema.
- **No storage/secret/cache abstraction the whole platform shares.** Direct `node:fs` and direct `process.env` reads recur; the approved **Azure Cache for Redis is provisioned but has no consumer**, so distributed state (nonce/session/lock/rate-limit) is in-memory only — correct **only at a single replica** (`FileRegistrationStore` is documented "NOT SAFE TO HORIZONTALLY SCALE").
- **Local development friction.** No `docker-compose.yml`, no `.env.example`, no `npm run dev`; the working local path hardcodes a workstation absolute path.

These are software-architecture gaps, closeable **within the six approved Azure services**. No new Azure service is introduced (R-17.13/14/15).

## 2. Context

Architecture already mandates the target posture: **R-17.11** (no layer above the adapter references a cloud primitive), **R-17.12** (cloud services behind platform-owned interfaces), **R-17.13/14/15** (any cloud / container / configuration-selected), **R-17.20** (storage addressable through an interface), and **R-17.16-19** (tenant-partitioned `tenant/capability/run/artefact` layout). This ADR supplies the concrete interfaces those rules describe, and nothing more. The existing `TenantConfigStore`/`RegistrationStore` interfaces are the precedent; this generalises the pattern into a shared, tenant-aware provider set the entrypoints adopt without a runtime change.

## 3. Alternatives

1. **Introduce Azure SDKs directly** (`@azure/identity`, `@azure/keyvault-secrets`, `@azure/storage-blob`). Rejected: manufactures lock-in the codebase does not have, violates R-17.11, breaks "one image, config-only difference".
2. **Patch each gap in place.** Rejected: reproduces the duplication it removes; no single seam; not gate-provable.
3. **One additive provider package with Local + Cloud implementations selected by configuration, adopted by the entrypoints, certified by execution (chosen).** Interfaces own the boundary; business logic never names a cloud; the same binary runs everywhere; each provider is fault-proved.

## 4. Decision

Introduce `@dbiz/platform-providers` — capability-neutral, dependency-light (zod only), **no `@azure/*` dependency** — with four provider families, a tenant-context scoper, and a unified bootstrap. Cloud vs. local is chosen by configuration; the **same binary and image** run in every environment.

- **Configuration Provider (`config/configuration-provider.ts`).** The **single reader of `process.env`** in the package. Parses and validates a strongly-typed schema (zod) **once at startup, fail-fast**. Resolves **Default → Environment → Tenant → Execution**, where tenant/execution may override only a safe, non-infrastructure subset (never a backend selector, never a secret).
- **Storage Provider (`storage/storage-provider.ts`).** `StorageProvider` interface with `FilesystemStorageProvider` (serves **both** a local folder **and** the Azure Files SMB mount — path from config) and `InMemoryStorageProvider`. Keys are tenant-partitioned and resolved by a **single validated path constructor** enforcing `tenant/capability/run/artefact` (R-17.17/18), rejecting traversal and case-folding tenant slugs.
- **Secret Provider (`secret/secret-provider.ts`).** `SecretProvider` with `EnvSecretProvider` (Key Vault → env, **no SDK**), `FileSecretProvider`, and `InMemorySecretProvider`. A missing required secret is a hard, named refusal.
- **Distributed State Provider (`distributed/distributed-state-provider.ts`).** `DistributedStateProvider` for keyed values with TTL, distributed **locks**, **counters**, **sessions**, and single-use **nonces** — all **tenant-partitioned**. `InMemoryDistributedStateProvider` (default) and `RedisDistributedStateProvider` (backed by an **injected** minimal Redis port — no `ioredis` dependency). Selecting Redis by configuration is the precondition for `maxReplicas > 1`; this ADR wires the seam, it does not flip the replica count.
- **Tenant Context (`tenant/tenant-context.ts`)** and **Unified Bootstrap (`bootstrap/platform-bootstrap.ts`)** — one canonical startup path composing the providers from configuration, fail-fast, returning an immutable `PlatformContext`.

Certified by execution: `packages/platform-providers/test/provider-platform-conformance.test.ts` and the governance gate `verify-provider-platform.js` (PP-1…PP-8), proved with fault injection.

## 5. Consequences

- The IP runs identically local / Docker / Container Apps from one image; environments differ only in configuration.
- Vendor lock-in is not introduced: no `@azure/*`; Redis via an injected port; Key Vault SDK-free (secretRef → env). Multi-tenancy strengthens (tenant-partitioned storage/secrets/state; the SMB/Windows slug case-collision is closed).
- **Backward compatible:** additive; existing stores, both entrypoints, the `/v1/execute` gateway, and the deferred runtime (M4/M5/M6) are untouched. Nothing is deleted.

## 6. Migration strategy

Adoption is incremental and separately authorised, each step gate-first: (M-a) the container entrypoint composes `bootstrapPlatform`; (M-b) `FileRegistrationStore` / nonce / session move behind the Distributed State Provider, and with `REDIS_URL` set the Redis backend is selected — **the precondition** the ADR-0049 readiness gate needs for `maxReplicas > 1`; (M-c) direct `node:fs`/`process.env` call sites migrate to the providers. Each step is reversible and touches no frozen surface. This ADR **supports** the future canonical runtime consolidation without performing it.

## 7. Version impact

No versioned contract changes. `@dbiz/contracts`, `@dbiz/capability-framework`, and every cross-plane contract version are **unchanged**; no schema is added or amended. The new package is `@dbiz/platform-providers@0.1.0`, additive and internal. No consumer-visible API of any existing package changes, so no compatibility window is required. The closure baseline is re-cut to admit this ADR and its gate (deliberate amendment, not silent).

## 8. Affected components

New:
- `packages/platform-providers/package.json` — **New**
- `packages/platform-providers/src/index.ts` — **New**
- `packages/platform-providers/src/config/configuration-provider.ts` — **New**
- `packages/platform-providers/src/storage/storage-provider.ts` — **New**
- `packages/platform-providers/src/secret/secret-provider.ts` — **New**
- `packages/platform-providers/src/distributed/distributed-state-provider.ts` — **New**
- `packages/platform-providers/src/bootstrap/platform-bootstrap.ts` — **New**
- `packages/platform-providers/test/provider-platform-conformance.test.ts` — **New**
- `governance/verification/verify-provider-platform.js` — **New**
- `docker-compose.yml` — **New**

Modified:
- `governance/verification/run-all.js` — **Modified** (registers the provider-platform gate)
- `package.json` — **Modified** (adds `dev`/`dev:down`/`dev:local` scripts)

Unchanged (asserted boundary): every `docs/architecture/*` document, every frozen contract, every capability/domain, both entrypoints, the `/v1/execute` gateway, and ADR-0044…0050 components.
