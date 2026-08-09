# Azure Deployment Guide — DBiz Intelligence Plane (Phase 2 / E-2)

Execution runbook for the Cloud Engineering team. The application is **frozen** — this document
deploys the existing artefact, it does not change it. Deploy target: the already-provisioned
`dbiz-intelligence-plane` subscription (ACR · Container Apps · App Gateway · Key Vault · Azure Files ·
Redis). **No new Azure resources are required.** Redis is provisioned but the application has no Redis
consumer — leave it idle.

Companion files in this folder:
- [`containerapp.yaml`](containerapp.yaml) — the Container App manifest (edit placeholders, then apply)
- [`KEY_VAULT.md`](KEY_VAULT.md) · [`CONTAINER_APPS.md`](CONTAINER_APPS.md) · [`APPLICATION_GATEWAY.md`](APPLICATION_GATEWAY.md) — reference configs
- [`E2_EVIDENCE.md`](E2_EVIDENCE.md) + [`collect-e2-evidence.sh`](collect-e2-evidence.sh) — governance evidence for the E-2 gate

---

## 0. Required inputs (fill these once, then paste the block into your shell)

Every command below uses these variables. Nothing else needs editing.

```bash
# ── Subscription / resource group ──
export SUBSCRIPTION="dbiz-intelligence-plane"
export RG="<resource-group>"
export LOCATION="<azure-region>"                 # e.g. australiaeast

# ── Provisioned resources (names) ──
export ACR="<acr-name>"                           # short name, NOT the login server
export ENV="<container-apps-environment>"         # the Managed Environment
export KV="<keyvault-name>"
export SA="<storage-account-name>"                # holds the Azure Files share
export SHARE="<file-share-name>"                  # e.g. ip-state
export AGW="<application-gateway-name>"

# ── Names this deployment creates/uses ──
export APP="intelligence-plane"                   # the Container App
export UAMI="uami-intelligence-plane"             # user-assigned managed identity
export STORAGE="ip-state"                          # env storage registration name (logical)
export IMAGE_REPO="dbiz-intelligence-plane"
export TAG="$(git -C . rev-parse --short HEAD 2>/dev/null || echo v1)"   # image tag = commit SHA
export ACR_LOGIN="${ACR}.azurecr.io"
export IMAGE="${ACR_LOGIN}/${IMAGE_REPO}:${TAG}"

# ── Application configuration (non-secret) ──
export ENTRA_TENANT_ID="<entra-tenant-id>"
export ENTRA_CLIENT_ID="<entra-app-client-id>"
export ADMIN_ALLOWLIST="<admin1@dbizsolution.com,admin2@dbizsolution.com>"

az account set --subscription "$SUBSCRIPTION"
az extension add --name containerapp --upgrade -y
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

---

## 1. Prerequisites
- Azure CLI ≥ 2.60 with the `containerapp` extension; logged in (`az login`) to the `dbiz-intelligence-plane` subscription.
- Rights to: create a user-assigned managed identity, assign roles on the ACR and Key Vault, register env storage, create/update the Container App, and edit the Application Gateway.
- A TLS certificate for the public hostname (in Key Vault or to upload to the Gateway).
- The Entra **app registration** (client ID) whose `aud` the id_token carries, and the **tenant ID**.
- Repository checked out at the commit to deploy (the Dockerfile builds from repo root).

## 2. Deployment order (do not reorder)
1. Identity → 2. Role assignments (ACR pull, KV secrets) → 3. Key Vault secret → 4. Azure Files env storage → 5. ACR build → 6. Container App create → 7. Application Gateway wiring → 8. Validation → 9. Evidence capture.

## 3. Identity
```bash
az identity create -g "$RG" -n "$UAMI" -l "$LOCATION"
export UAMI_ID=$(az identity show -g "$RG" -n "$UAMI" --query id -o tsv)
export UAMI_PRINCIPAL=$(az identity show -g "$RG" -n "$UAMI" --query principalId -o tsv)
export UAMI_CLIENTID=$(az identity show -g "$RG" -n "$UAMI" --query clientId -o tsv)
```

## 4. Role assignments (least privilege)
```bash
export ACR_ID=$(az acr show -n "$ACR" --query id -o tsv)
export KV_ID=$(az keyvault show -n "$KV" --query id -o tsv)

az role assignment create --assignee-object-id "$UAMI_PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role "AcrPull" --scope "$ACR_ID"
az role assignment create --assignee-object-id "$UAMI_PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" --scope "$KV_ID"
```
> If the vault uses access policies (not RBAC): `az keyvault set-policy -n "$KV" --object-id "$UAMI_PRINCIPAL" --secret-permissions get list`.

## 5. Key Vault requirements
One **required** secret. Full table in [`KEY_VAULT.md`](KEY_VAULT.md).
```bash
az keyvault secret set --vault-name "$KV" --name session-secret --value "$(openssl rand -base64 32)"
export KV_SESSION_URI="https://${KV}.vault.azure.net/secrets/session-secret"
```

## 6. Azure Files configuration
The app persists its file-backed SSOT under `/state`: `tenants/`, `registration/`, `generated/`, and
`signing/` (the ADR-0035 ed25519 package-signing key). Register the provisioned share on the
environment, then the manifest mounts it.
```bash
export SA_KEY=$(az storage account keys list -g "$RG" -n "$SA" --query "[0].value" -o tsv)
az containerapp env storage set -g "$RG" -n "$ENV" \
  --storage-name "$STORAGE" \
  --azure-file-account-name "$SA" \
  --azure-file-account-key "$SA_KEY" \
  --azure-file-share-name "$SHARE" \
  --access-mode ReadWrite
```
> Single replica (Phase 1/2): a durable mount means tenant data, OTC store and the signing key survive
> restarts/revisions. `signing/ep-package-signing.pem` is a **private key** — keep the share access-restricted.

## 7. Build the image in ACR (no local Docker needed)
```bash
az acr build --registry "$ACR" --image "${IMAGE_REPO}:${TAG}" --file deploy/Dockerfile . \
  | tee acr-build-${TAG}.log     # keep this log — it is E-2 evidence
```

## 8. Deploy the Container App
Edit [`containerapp.yaml`](containerapp.yaml) placeholders (or use `sed`/`envsubst`) so it references
`$UAMI_ID`, `$ENV`, `$ACR_LOGIN`, `$IMAGE`, `$KV_SESSION_URI`, `$STORAGE`, and your Entra/allowlist
values, then:
```bash
az containerapp create -g "$RG" --yaml deploy/azure/containerapp.yaml
export APP_FQDN=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
echo "Container App ingress: https://$APP_FQDN"
```

### Equivalent flag-based create (if you prefer CLI over YAML)
```bash
az containerapp create -g "$RG" -n "$APP" --environment "$ENV" \
  --image "$IMAGE" --registry-server "$ACR_LOGIN" --registry-identity "$UAMI_ID" \
  --user-assigned "$UAMI_ID" \
  --ingress external --target-port 8080 --transport http \
  --cpu 1.0 --memory 2.0Gi --min-replicas 1 --max-replicas 1 \
  --secrets "session-secret=keyvaultref:${KV_SESSION_URI},identityref:${UAMI_ID}" \
  --env-vars PORT=8080 DBIZ_STATE_DIR=/state NODE_ENV=production \
             AZURE_TENANT_ID="$ENTRA_TENANT_ID" AZURE_CLIENT_ID="$ENTRA_CLIENT_ID" \
             IP_ADMIN_ALLOWLIST="$ADMIN_ALLOWLIST" "SESSION_SECRET=secretref:session-secret"
# then attach the volume (YAML is cleaner for volumes):
az containerapp update -g "$RG" -n "$APP" \
  --azure-file-volume-name state --azure-file-account-name "$SA" \
  --azure-file-share-name "$SHARE" --azure-file-account-key "$SA_KEY" 2>/dev/null || true
```
> `DBIZ_DEV_AUTH` is intentionally **never set** — the app refuses to start without real Entra config,
> which is the correct production posture.

## 9. Application Gateway configuration
Full detail in [`APPLICATION_GATEWAY.md`](APPLICATION_GATEWAY.md). Essentials:
```bash
# Backend pool -> the Container App ingress FQDN
az network application-gateway address-pool create -g "$RG" --gateway-name "$AGW" \
  -n ip-backend --servers "$APP_FQDN"
# Health probe (HTTPS, path /api/health, pick host from backend)
az network application-gateway probe create -g "$RG" --gateway-name "$AGW" \
  -n ip-health --protocol Https --host-name-from-http-settings true --path /api/health \
  --interval 30 --timeout 30 --threshold 3 --match-status-codes 200-399
# HTTP settings: HTTPS to backend, host from backend FQDN (REQUIRED for Container Apps routing), long timeout
az network application-gateway http-settings create -g "$RG" --gateway-name "$AGW" \
  -n ip-https --port 443 --protocol Https --host-name-from-backend-pool true \
  --timeout 120 --probe ip-health
```
Then create the HTTPS listener (with the TLS cert) and a routing rule sending `/api/*` (or all traffic)
to `ip-backend` via `ip-https`. See the gateway guide for the listener/rule/cert commands.

## 10. Validation (must all pass — this is the E-2 proof)
```bash
export BASE="https://$APP_FQDN"          # or the Gateway public hostname once wired

# runtime status
az containerapp show -g "$RG" -n "$APP" --query "properties.runningStatus" -o tsv          # -> Running
az containerapp revision list -g "$RG" -n "$APP" \
  --query "[].{rev:name,active:properties.active,health:properties.healthState}" -o table   # -> Healthy

curl -i  "$BASE/api/health"              # -> HTTP 200  {"status":"ok","tenants":N,"uptime":...}
curl -is "$BASE/api/docs" | head -1      # -> HTTP 200  (Swagger UI)

# authentication (real Entra id_token from an allow-listed admin sign-in)
curl -i -X POST "$BASE/api/auth/session" -H 'content-type: application/json' \
  -d '{"idToken":"<entra-id-token>"}'    # -> 200 { token, principal }  |  403 if not allow-listed

# tenant onboarding (Bearer <token> from above)
curl -i -X POST "$BASE/api/tenants" -H "authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"organisationName":"Carlisle Homes","tenantName":"Carlisle Prod","primaryAdministrator":"Jane Roe","primaryAdministratorEmail":"jane@carlisle.example","preferredCloud":"azure","deploymentModel":"container"}'
                                          # -> 201  (tenant created + persisted)
```
Checklist form in §Validation of [`E2_EVIDENCE.md`](E2_EVIDENCE.md).

## 11. Operations — logs, restart, scaling
```bash
# live console logs (startup line + any exceptions)
az containerapp logs show -g "$RG" -n "$APP" --type console --follow
az containerapp logs show -g "$RG" -n "$APP" --type console --tail 200 > startup-${TAG}.log

# restart current revision
export REV=$(az containerapp revision list -g "$RG" -n "$APP" --query "[?properties.active].name | [0]" -o tsv)
az containerapp revision restart -g "$RG" -n "$APP" --revision "$REV"

# scaling stays 1/1 in this phase
az containerapp update -g "$RG" -n "$APP" --min-replicas 1 --max-replicas 1
```

## 12. Rollback
Container Apps is revision-based; the previous revision stays available.
```bash
az containerapp revision list -g "$RG" -n "$APP" -o table
# shift 100% of traffic back to the last-known-good revision:
az containerapp ingress traffic set -g "$RG" -n "$APP" --revision-weight <previous-revision>=100
# (optional) deactivate the bad revision:
az containerapp revision deactivate -g "$RG" -n "$APP" --revision <bad-revision>
```
State on Azure Files is backward-compatible (append-only OTC store; additive `tenant.json`). No data
migration is involved in a rollback.
```

