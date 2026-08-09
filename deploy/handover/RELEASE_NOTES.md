# Release Notes — Intelligence Plane (Cloud Handover)

## Deployment version

| Field | Value |
|---|---|
| Branch | `main` |
| Last committed HEAD | `f57240b` — *"fix(repo): restore clean-clone reproducibility and bootstrap configuration"* |
| Milestone changes state | **UNCOMMITTED at handover** (ADR-0060 Provider Platform + M-a runtime adoption are in the working tree) |
| Recommended release candidate | **commit the milestone, then tag** e.g. `v0.1.0-rc1` |
| Image name | `dbiz-intelligence-plane:<tag>` (built from [`deploy/Dockerfile`](../Dockerfile)) |

> **Action before deploy (Dev):** commit the milestone and create an annotated tag; the Cloud Team deploys a **tagged, committed** image (the image tag should match the git tag). The `az acr build` produces the deployable digest — record both.

## What is in this milestone

- **ADR-0060 — Cloud-Native Provider Platform** (`@dbiz/platform-providers`): Configuration / Storage / Secret / Distributed-State providers + `bootstrapPlatform` + `TenantContext`. No `@azure/*` dependency; Local + Cloud implementations selected by configuration. Certified by an executed conformance suite (20/20) and a fault-proved governance gate (`verify-provider-platform.js`, PP-1…PP-8).
- **Runtime adoption (M-a):** the production entrypoint [`server/index.ts`](../../packages/tenant-onboarding-engine/src/server/index.ts) now initialises through `bootstrapPlatform` (config via `ConfigurationProvider`, secret via `SecretProvider`); no direct `process.env` in the entrypoint. Verified in-process (140/140 tests, real `GET /api/health` → 200); backward compatible (137 pre-existing tests unchanged).
- **Developer experience:** [`docker-compose.yml`](../../docker-compose.yml), [`.env.example`](../../.env.example), `npm run dev` scripts.
- **This handover package** under `deploy/handover/`.

## Not in this milestone (deferred — see KNOWN_LIMITATIONS)
- M-b: Redis-backed distributed state (unblocks horizontal scaling).
- M-c: migration of remaining `node:fs` call sites behind the Storage Provider.
- `/v1/execute` runtime containerisation and EP↔IP execution (deferred runtime, ADR-0049 M5).

## Compatibility
No versioned contract changed. `@dbiz/contracts` and all cross-plane contract versions are unchanged. No consumer-visible API of any existing package changed.
