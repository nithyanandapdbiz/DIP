# Intelligence Plane — Azure Deployment (Phase 1)

The one IP artefact (R-17.1), on the already-provisioned Azure estate (ACR · Container Apps · **Front
Door** · Key Vault · Azure Files · Storage static website). No new infrastructure. Single replica. This is
the *minimum viable deployment*; hardening is deferred (see the bottom of this file).

**The public edge is Azure Front Door** — [`FRONT_DOOR.md`](FRONT_DOOR.md) is authoritative for routing.
It fronts two origins: the Storage static website (`/*`, the SPA) and this Container App (`/api/*`, the
API). [`APPLICATION_GATEWAY.md`](APPLICATION_GATEWAY.md) describes an alternative edge that is not
deployed.

## Runtime entrypoint

`node dist/src/server/index.js` (`packages/tenant-onboarding-engine`) — binds `0.0.0.0:$PORT`,
Linux/container-native, environment-driven, no hardcoded paths. Replaces the dev launcher `run-server.mjs`.

## Key Vault secret inventory

| Key Vault secret | Env var | Required | Notes |
|---|---|---|---|
| `session-secret` | `SESSION_SECRET` | **yes** | 32-byte random. Signs DBIZ session tokens **and** EP credentials. Must be a **single stable value** — rotating it invalidates issued EP credentials (re-register per ADR-0036). The container refuses to start if it is unset. |
| `package-signing-key` | `PACKAGE_SIGNING_KEY` | **yes** | ed25519 private key (PKCS#8 PEM). Signs every execution package and solution manifest this plane authors. **There is no create-if-missing** (ADR-0083) — the container refuses to start if it is unset, and nothing will generate one on its behalf. Rotating it changes the **key id**, and every verification key already distributed stops matching. |

Everything else is non-secret configuration and is passed as plain env (below). No API/LLM key is consumed
by the IP server at runtime today, so none is required to boot; provision `anthropic-api-key` /
`openai-api-key` in the vault only when a capability that calls a model is wired.

Create the two required secrets:
```bash
az keyvault secret set --vault-name <keyvault-name> --name session-secret \
  --value "$(openssl rand -base64 32)"

openssl genpkey -algorithm ed25519 -out package-signing-key.pem
az keyvault secret set --vault-name <keyvault-name> --name package-signing-key \
  --file package-signing-key.pem
shred -u package-signing-key.pem
```

> **Provisioning both is not sufficient on its own.** Each needs a Key Vault–referenced secret on the
> Container App *and* an env mapping; a vault secret with no reference never reaches the process, and
> the boot refusal is identical either way. See [`DEPLOY_READINESS.md`](DEPLOY_READINESS.md) §1.
Grant the Container App's user-assigned identity `Key Vault Secrets User` on the vault and `AcrPull` on the registry.

## Environment variable inventory

| Var | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `8080` | Listen port (matches ingress `targetPort` + Dockerfile `EXPOSE`) |
| `DBIZ_STATE_DIR` | no | `/state` | Root of the file-backed SSOT; mounted from Azure Files |
| `SESSION_SECRET` | **yes** | — | From Key Vault (`secretRef`). Refuse-to-start if absent |
| `PACKAGE_SIGNING_KEY` | **yes** | — | From Key Vault (`secretRef`). ed25519 PKCS#8 PEM. Refuse-to-start if absent; no create-if-missing (ADR-0083) |
| `AZURE_TENANT_ID` | **yes (prod)** | — | Entra tenant for real Microsoft sign-in |
| `AZURE_CLIENT_ID` | **yes (prod)** | — | Entra app registration (audience) |
| `IP_ADMIN_ALLOWLIST` | recommended | empty | Comma-separated admin emails allowed to sign in |
| `DBIZ_DEV_AUTH` | **MUST be unset in Azure** | unset | Enables the UNSIGNED `dev:<email>` verifier — local only |
| `REGISTRATION_ENDPOINT` | no | `https://gateway.dbiz.example/v1/register` | Advertised EP registration URL |
| `NODE_ENV` | no | — | Set `production` |

> If neither real Entra config nor `DBIZ_DEV_AUTH=1` is present, the app **refuses to start** by design —
> it will not silently accept unsigned tokens.

## Deploy

```bash
# 1. Build + push (no local Docker needed — ACR builds it)
az acr build -r <acr-name> -t dbiz-intelligence-plane:<tag> -f deploy/Dockerfile .

# 2. Deploy the Container App (single replica)
az containerapp create -g <rg> --yaml deploy/azure/containerapp.yaml

# 3. Route /api/* through Front Door to the Container App ingress FQDN.
#    Full commands and verification: deploy/azure/FRONT_DOOR.md
#    - origin-host-header MUST be the Container App FQDN (else Container Apps 404s a healthy app)
#    - caching disabled on /api/* (it carries session tokens)
#    - probe path /api/health expecting 200

# 4. Build and upload the SPA to the storage account's $web container.
#    Use azure-pipelines/deploy-static-web.yml (setup: deploy/azure/AZURE_DEVOPS.md) — it carries
#    VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID from the vg-dbiz-ip-dev variable group. A build
#    without them ships the local dev sign-in box instead of Microsoft sign-in.
```

> **Purge the Front Door cache after an SPA deploy.** The pipeline does not, so the edge keeps serving
> the previous bundle and the deploy looks like a no-op. See [`FRONT_DOOR.md`](FRONT_DOOR.md).

## Validate (success criteria)

```bash
FQDN=https://<app-gateway-or-containerapp-fqdn>
curl -fsS  $FQDN/api/health            # -> 200 {"status":"ok",...}
curl -fsS  $FQDN/api/docs   | head     # -> Swagger UI
# Auth (real Entra id_token from your admin sign-in):
curl -fsS -X POST $FQDN/api/auth/session -H 'content-type: application/json' \
  -d '{"idToken":"<entra-id-token>"}'  # -> 200 { token, principal }
# Tenant onboarding (Bearer <token from above>):
curl -fsS -X POST $FQDN/api/tenants -H "authorization: Bearer <token>" \
  -H 'content-type: application/json' \
  -d '{"organisationName":"...","tenantName":"...","primaryAdministrator":"...","primaryAdministratorEmail":"...","preferredCloud":"azure","deploymentModel":"container"}'
```

The same flow was validated locally (dev auth bridge) end-to-end: boot, health, Swagger, auth,
allowlist-deny, tenant create+persist+list — 8/9 checks, the 9th (SIGTERM drain) being un-observable on a
Windows host only.

## Rollback

Container Apps is revision-based. Keep the previous revision and shift traffic back:
```bash
az containerapp revision list -n intelligence-plane -g <rg> -o table
az containerapp ingress traffic set -n intelligence-plane -g <rg> --revision-weight <previous-revision>=100
```
State on Azure Files is backward-compatible (append-only OTC store, additive tenant.json).

## Deferred to a later hardening wave (NOT Phase 1)

- Horizontal scaling / multiple replicas (needs the file SSOT behind a shared/locked store — see the
  readiness assessment; today it is correct only at `maxReplicas: 1`).
- A dedicated `/api/ready` distinct from `/api/health` (readiness that checks state-dir writability + Entra reachability).
- Redis: **provisioned but unused** — no queue/cache/lock consumer exists in code. Do not wire it until a real need appears, and then behind a platform interface (R-17.12).
- E-2 container-build proof in CI; multi-region residency (R-17.4); contract-version telemetry (C-17.15).
