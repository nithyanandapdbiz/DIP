# Azure Configuration Guide — Intelligence Plane

The **only** Azure services required. **Do not introduce additional services.**

| # | Service | Role in the deployment |
|---|---|---|
| 1 | **Container Registry (ACR)** | Holds the one image `dbiz-intelligence-plane:<tag>` |
| 2 | **Container Apps** | Runs the image; ingress on `:8080`; probes on `/api/health` |
| 3 | **Application Gateway** | Public HTTPS edge → Container App ingress FQDN |
| 4 | **Key Vault** | Stores `session-secret`; resolved to env via `secretRef` |
| 5 | **Azure Files** | Durable state, mounted at `/state` |
| 6 | **Cache for Redis** | Distributed state — **provisioned now, consumed at M-b** (see KNOWN_LIMITATIONS) |

Region: **Australia Southeast**. Support: **MCA**.

## Managed Identity (user-assigned) — RBAC (least privilege)

| Role | Scope | Why |
|---|---|---|
| `AcrPull` | the ACR | pull the image |
| `Key Vault Secrets User` | the Key Vault | read `session-secret` |
| `Storage File Data SMB Share Contributor` | the Azure Files share | read/write `/state` |

No other role is required for the Container App runtime. The identity must be assigned to the Container App (`identity.type: UserAssigned` in [containerapp.yaml](../azure/containerapp.yaml)).

## Per-service configuration (authoritative sources referenced)

- **ACR + Container Apps env + app:** [../azure/CONTAINER_APPS.md](../azure/CONTAINER_APPS.md), [../azure/README.md](../azure/README.md). Ingress `external: true`, `targetPort: 8080`, `transport: http`.
- **Key Vault:** [../azure/KEY_VAULT.md](../azure/KEY_VAULT.md). One required secret `session-secret` (32-byte random). Wired as a `secretRef` → `SESSION_SECRET`.
- **Azure Files:** register the share as a storage on the Container Apps **environment**, then reference it as an `AzureFile` volume mounted at `/state` (see the `volumes`/`volumeMounts` block in [containerapp.yaml](../azure/containerapp.yaml)). Validate read/write by confirming the app creates `/state/tenants`, `/state/registration`, `/state/signing` on first boot.
- **Redis:** provision the instance and record endpoint/port (6380 TLS). **Networking:** the Container App must reach Redis (same VNet/private endpoint, or firewall-allow the Container Apps outbound IPs). **Do not set `REDIS_URL` yet** — the app selects the memory backend until M-b.
- **Application Gateway:** [../azure/APPLICATION_GATEWAY.md](../azure/APPLICATION_GATEWAY.md). **Critical:** HTTP settings **"Pick host name from backend target = Yes"** (`--host-name-from-backend-pool true`) or Container Apps returns 404. Health probe path `/api/health`, match `200-399`, backend request timeout **≥120s**, HTTPS end-to-end.

## Networking summary
- Inbound: Internet → App Gateway (HTTPS 443) → Container App ingress (HTTPS) — host header = backend FQDN.
- Outbound: Container App → Key Vault (secret resolution), → Azure Files (SMB mount), → Redis (M-b), → (optionally) the customer Execution Plane registration endpoint.
- No public ingress to the container except through the Gateway.
