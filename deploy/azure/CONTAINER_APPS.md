# Container Apps Configuration Guide — Intelligence Plane

Single Container App, single replica (Phase 2). Authoritative manifest: [`containerapp.yaml`](containerapp.yaml).

| Aspect | Value | Notes |
|---|---|---|
| **Container name** | `intelligence-plane` | one container, one process |
| **Image** | `<acr>.azurecr.io/dbiz-intelligence-plane:<tag>` | tag = commit SHA |
| **CPU** | `1.0` vCPU | Node startup + NestJS |
| **Memory** | `2Gi` | must pair with 1.0 vCPU on the Consumption profile |
| **Port (targetPort)** | `8080` | matches Dockerfile `EXPOSE` and `PORT` env |
| **Transport** | `http` | HTTP/1.1; TLS terminates at ingress |
| **Ingress** | `external: true` | fronted by Application Gateway |
| **Identity** | user-assigned managed identity | carries `AcrPull` + `Key Vault Secrets User` |
| **Registry auth** | via the user-assigned identity | no registry username/password stored |

## Environment variables
| Name | Value | Source |
|---|---|---|
| `PORT` | `8080` | literal |
| `DBIZ_STATE_DIR` | `/state` | literal (volume mount path) |
| `NODE_ENV` | `production` | literal |
| `AZURE_TENANT_ID` | `<entra-tenant-id>` | literal (non-secret) |
| `AZURE_CLIENT_ID` | `<entra-app-client-id>` | literal (non-secret) |
| `IP_ADMIN_ALLOWLIST` | `<comma,separated,emails>` | literal (non-secret) |
| `SESSION_SECRET` | — | `secretRef: session-secret` (Key Vault) |
| `REGISTRATION_ENDPOINT` | *(optional)* advertised EP registration URL | literal; defaults if unset |
| `DBIZ_DEV_AUTH` | **must NOT be set** | omitting it forces real Entra auth |

## Secrets
| Container App secret | Backing | Exposed as |
|---|---|---|
| `session-secret` | Key Vault reference (`.../secrets/session-secret`) via managed identity | env `SESSION_SECRET` |

## Volume mounts
| Volume | Type | Storage | Mount path | Contents |
|---|---|---|---|---|
| `state` | `AzureFile` | env storage `ip-state` (registered on the environment) | `/state` | `tenants/`, `registration/`, `generated/`, `signing/` |

Registered with `az containerapp env storage set` (see the deployment guide §6). Durable across
restarts/revisions. Single replica → no cross-replica write contention.

## Health / startup / liveness / readiness probes
All hit the public, cheap `GET /api/health` (returns 200 `{status, tenants, uptime}`).

| Probe | Path | Period | Failure threshold | Purpose |
|---|---|---|---|---|
| **Startup** | `/api/health` | 2s | 30 (~60s budget) | tolerate cold Node start before liveness begins |
| **Liveness** | `/api/health` | 30s | 3 | restart if the process wedges |
| **Readiness** | `/api/health` | 10s (initialDelay 5s) | 3 | gate traffic until serving |

## Scaling
| Setting | Value |
|---|---|
| `minReplicas` | `1` |
| `maxReplicas` | `1` |

Fixed 1/1 for Phase 2. The file-backed SSOT is correct only at a single replica; scaling out is a
separate hardening item (shared/locked store) and must not be enabled here.

## Graceful shutdown
The entrypoint handles `SIGTERM`/`SIGINT` and calls `app.close()`, so in-flight requests drain on
revision swap / scale-in. No extra Container Apps configuration needed.
