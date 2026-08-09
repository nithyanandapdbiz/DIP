# Deployment Candidate Manifest — DBiz Intelligence Plane

| Field | Value |
|---|---|
| **Repository** | `https://dbiz-product-engineering@dev.azure.com/dbiz-product-engineering/AI%20SDLC/_git/DBizIntelligencePlane` |
| **Branch** | `main` |
| **Last commit SHA** | `f57240b6526a3a614a1d6d2538393138c1981d89` |
| **Candidate state** | ⚠️ **NOT YET IMMUTABLE** — runtime adoption + handover docs are **uncommitted** (see below) |
| **Recommended tag** | `v0.1.0-rc1` — **apply only after** the commit below |
| **Build date** | 2026-07-29 |
| **Application version** | `@dbiz/platform-providers@0.1.0` (pre-1.0 platform; RC packaging) |
| **Deployment type** | Single container image → Azure Container Apps (single replica) |
| **Image** | `dbiz-intelligence-plane:<tag>` from [`deploy/Dockerfile`](../Dockerfile) |

## Azure services required (approved, fixed — no others)
Container Registry · Container Apps · Application Gateway · Key Vault · Azure Files · Cache for Redis. Region **Australia Southeast**. See [AZURE_CONFIGURATION_GUIDE.md](AZURE_CONFIGURATION_GUIDE.md).

## Blocking action before tagging (uncommitted work)
The following must be committed so the tag points at a tree that includes the runtime adoption:
```
# runtime adoption (M-a) + handover package + regenerated evidence
git add packages/tenant-onboarding-engine/src/server/index.ts \
        packages/tenant-onboarding-engine/src/server/platform-adoption.ts \
        packages/tenant-onboarding-engine/test/bootstrap-adoption.e2e.test.ts \
        packages/tenant-onboarding-engine/package.json pnpm-lock.yaml \
        docker-compose.yml deploy/handover/ governance/*/evidence.json
git commit -m "feat(runtime): ADR-0060 M-a adoption + cloud handover package"
git tag -a v0.1.0-rc1 -m "Intelligence Plane cloud deployment candidate"
```
> The last committed SHA `f57240b` does **not** include the M-a adoption; tagging it would ship the pre-adoption entrypoint. Commit first.

## Known limitations
See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) (L-1 Redis/M-b · L-2 single replica · L-3 `/api/ready` · L-4 `/v1/execute` deferred · L-5 E-2 first build).

## Ownership & contacts
See [SUPPORT_AND_OWNERSHIP.md](SUPPORT_AND_OWNERSHIP.md). Deployment owner: **Cloud Engineering**. Application owner: **Intelligence Plane dev team**. Application changes (M-b, `/api/ready`) route to the dev team with deployment evidence.
