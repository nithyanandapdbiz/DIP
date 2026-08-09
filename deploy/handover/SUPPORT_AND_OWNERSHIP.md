# Support & Ownership Matrix — Intelligence Plane

Clear responsibility boundaries for the deployed platform. "Shared" means jointly owned; escalate across
the boundary with evidence (see the issue-classification rule below).

| Domain | Development Team | Cloud Team | Shared |
|---|---|---|---|
| **Application code / behaviour** | ✅ owns | | |
| **Provider Platform (config/storage/secret/state)** | ✅ owns | | |
| **Container image (Dockerfile, entrypoint)** | ✅ owns | | |
| **Infrastructure provisioning** (ACR, Container Apps, Files, KV, Redis, Gateway) | | ✅ owns | |
| **Networking** (VNet, ingress, private endpoints, Gateway routing) | | ✅ owns | |
| **Secrets** — *value & rotation* | | ✅ owns (Key Vault) | |
| **Secrets** — *contract* (which secrets, env names) | ✅ owns | | |
| **Storage** — *Azure Files provisioning + mount* | | ✅ owns | |
| **Storage** — *layout & data* (`/state` tree) | ✅ owns | | |
| **Identity** — *managed identity + RBAC assignment* | | ✅ owns | |
| **Identity** — *Entra app registration + allowlist* | | | ✅ shared |
| **Monitoring / logs** (Container Apps log stream, alerts) | | ✅ owns | |
| **Deployment execution** (build/push/deploy/validate) | | ✅ owns | |
| **Release tagging / image versioning** | ✅ owns | | |
| **Application defects** | ✅ owns | | |
| **Infrastructure defects** | | ✅ owns | |
| **EP↔IP execution runtime** (deferred, ADR-0049 M5) | ✅ owns | | |

## Issue classification (per the handover Notes)
- **Infrastructure issue** — a service is misconfigured, unreachable, or a role is missing (e.g. Gateway 404 from a missing host-header setting, KV access denied, Files mount fails). Cloud Team owns; documented separately from app issues.
- **Application issue** — the container behaves incorrectly given correct configuration (e.g. a boot failure with a valid `SESSION_SECRET`, a wrong health response). Report to the dev team **with deployment evidence** (logs + the env/config used).

## Escalation contacts
- Deployment blockers → Cloud Team lead.
- Application changes required (e.g. M-b Redis wiring, `/api/ready`) → Intelligence Plane dev team, tracked as a milestone item.
