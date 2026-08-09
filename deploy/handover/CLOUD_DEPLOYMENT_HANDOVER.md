# Cloud Deployment Handover — DBiz Intelligence Plane

**Audience:** Azure Cloud Engineering team · **From:** Intelligence Plane development team · **Date:** 2026-07-29
**Verdict:** **READY FOR CLOUD TEAM HANDOVER** (this is *not* a "cloud ready" claim — see [KNOWN_LIMITATIONS](KNOWN_LIMITATIONS.md) and §Status).

The Intelligence Plane is a **single container image**, configuration-driven, with **no Azure SDK** in application code. Local, Docker, and Azure Container Apps run the **same image**; only configuration values differ. This package is everything needed to deploy it without reverse-engineering the codebase.

## Package contents

| Document | Purpose |
|---|---|
| [AZURE_CONFIGURATION_GUIDE.md](AZURE_CONFIGURATION_GUIDE.md) | The six approved services, RBAC, managed-identity roles, networking |
| [ENVIRONMENT_VARIABLE_REFERENCE.md](ENVIRONMENT_VARIABLE_REFERENCE.md) | Every env var + secret, required/optional, default |
| [PRE_DEPLOYMENT_CHECKLIST.md](PRE_DEPLOYMENT_CHECKLIST.md) | What must exist before deploying |
| [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) | Step-by-step build → push → deploy → validate → rollback |
| [POST_DEPLOYMENT_VALIDATION.md](POST_DEPLOYMENT_VALIDATION.md) | Validation steps + the evidence the Cloud Team returns |
| [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) | Deployment-relevant limitations (Redis M-b, single replica, `/api/ready`) |
| [SUPPORT_AND_OWNERSHIP.md](SUPPORT_AND_OWNERSHIP.md) | Responsibility matrix (Dev / Cloud / Shared) |
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | Version, branch, commit, milestone contents |

**Canonical runbook sources** (authoritative — this package references, does not replace):
`../azure/README.md` · `../azure/CONTAINER_APPS.md` · `../azure/KEY_VAULT.md` · `../azure/APPLICATION_GATEWAY.md` · `../Dockerfile` · `../azure/containerapp.yaml` · `../../docker-compose.yml`

## The deployable artefact (evidence)

- **Image:** [`deploy/Dockerfile`](../Dockerfile) — multi-stage, `node:24.11.0-alpine`, non-root user `dbiz`, entrypoint `node dist/src/server/index.js`, `EXPOSE 8080`, `HEALTHCHECK /api/health`, durable state on the `/state` volume. No secret material baked in (C-17.4).
- **Manifest:** [`deploy/azure/containerapp.yaml`](../azure/containerapp.yaml) — Key Vault `secretRef`, user-assigned managed identity, Azure Files volume at `/state`, Startup/Liveness/Readiness probes, `minReplicas=maxReplicas=1`.
- **Endpoints:** `GET /api/health` (health **and** readiness), `GET /api/docs` (Swagger), `POST /api/auth/session`, `POST /api/tenants`, `POST /api/register`.

## Status

The repository is **ready to hand over**. Two items require action **before** first deploy, both documented:
1. **Commit + tag the milestone.** The ADR-0060 Provider Platform and its M-a runtime adoption are on `main` but **uncommitted** at handover time — see [RELEASE_NOTES](RELEASE_NOTES.md). The Cloud Team should deploy a **committed, tagged** image, not a working tree.
2. **Redis is provisioned-but-not-yet-consumed (M-b).** Keep `DBIZ_STATE_BACKEND=memory` for this deployment — see [KNOWN_LIMITATIONS](KNOWN_LIMITATIONS.md).

Neither blocks a **single-replica** production deployment.
