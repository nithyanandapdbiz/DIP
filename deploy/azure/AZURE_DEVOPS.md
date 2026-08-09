# Azure DevOps — SPA and API deploy pipelines

Two YAML pipelines in this repo deploy the Intelligence Plane to the existing `rg-dbiz-ip` estate:

| Pipeline | YAML | Deploys |
|----------|------|---------|
| Static web | [`azure-pipelines/deploy-static-web.yml`](../../azure-pipelines/deploy-static-web.yml) | Vite SPA → Storage `$web` |
| API | [`azure-pipelines/deploy-api.yml`](../../azure-pipelines/deploy-api.yml) | Docker image → ACR → Container App revision |

Infra (Front Door, ACR, Container App definition, Key Vault) remains Terraform in `DBizIntelligencePlane-Infra`. Routine image and SPA deploys do **not** require `terraform apply`.

## Prerequisites

- Azure DevOps project with this repo connected (Azure Repos or GitHub).
- Subscription `1c0c131f-15bc-47f0-8341-f37f59814ae5`, resource group `rg-dbiz-ip`.
- Your account must be able to create service principals and assign roles (Owner / User Access Administrator).

Dev resource names (from current Terraform outputs):

| Resource | Name |
|----------|------|
| Storage (static site) | `stdbizipwebdevajtw` |
| ACR | `dbizipdevajtw` |
| Image repository | `dbiz-intelligence-plane` |
| Container App | `intelligence-plane` |
| Public URL | `https://inteligenceplane.dbizsolution.com` |

---

## 1. Create the service principal

```bash
SUB=1c0c131f-15bc-47f0-8341-f37f59814ae5
RG=rg-dbiz-ip
SP_NAME=sp-dbiz-ip-ado-deploy

az ad sp create-for-rbac \
  --name "$SP_NAME" \
  --role Reader \
  --scopes "/subscriptions/$SUB/resourceGroups/$RG" \
  --sdk-auth
```

Save `clientId` / `appId`, `clientSecret` / `password`, and `tenantId` from the JSON output. You need them for the Azure DevOps service connection.

### Least-privilege roles beyond Reader

| Role | Scope | Why |
|------|--------|-----|
| **Storage Blob Data Contributor** | Storage account `stdbizipwebdevajtw` | SPA upload with `--auth-mode login` |
| **AcrPush** | ACR `dbizipdevajtw` | `docker push` |
| **Container Apps Contributor** | Container App `intelligence-plane` | `az containerapp update` |
| **CDN Endpoint Contributor** | the Front Door profile | `az afd endpoint purge` after an SPA upload. Without it the purge step fails and the edge keeps serving the previous bundle |

```bash
SP_APP_ID=<appId from create-for-rbac>
STORAGE_ID=$(az storage account show -g $RG -n stdbizipwebdevajtw --query id -o tsv)
ACR_ID=$(az acr show -g $RG -n dbizipdevajtw --query id -o tsv)
ACA_ID=$(az containerapp show -g $RG -n intelligence-plane --query id -o tsv)

az role assignment create --assignee "$SP_APP_ID" --role "Storage Blob Data Contributor" --scope "$STORAGE_ID"
az role assignment create --assignee "$SP_APP_ID" --role "AcrPush" --scope "$ACR_ID"
az role assignment create --assignee "$SP_APP_ID" --role "Container Apps Contributor" --scope "$ACA_ID"

# Front Door cache purge (static-web pipeline). Profile name from Terraform output / az afd profile list.
AFD_ID=$(az afd profile show -g $RG -n <front-door-profile> --query id -o tsv)
az role assignment create --assignee "$SP_APP_ID" --role "CDN Endpoint Contributor" --scope "$AFD_ID"
```

Blob data-plane RBAC can take a few minutes to propagate after assignment.

---

## 2. Azure DevOps service connection

1. **Project settings → Service connections → New service connection**.
2. Choose **Azure Resource Manager → Service principal (manual)**.
3. Fill in:
   - Subscription ID / name
   - Service Principal Id = `appId`
   - Service principal key = `password`
   - Tenant ID
   - Resource group: `rg-dbiz-ip`
   - Service connection name: **`sc-dbiz-ip-rg`** (must match pipeline YAML)
4. Grant access permission to all pipelines (or allowlist the two deploy pipelines).
5. Verify / Test connection.

---

## 3. Variable group `vg-dbiz-ip-dev`

**Pipelines → Library → + Variable group**. Name: **`vg-dbiz-ip-dev`**.

### Core (both pipelines)

| Variable | Value | Secret? |
|----------|--------|---------|
| `AZURE_SERVICE_CONNECTION` | `sc-dbiz-ip-rg` | no |
| `RESOURCE_GROUP` | `rg-dbiz-ip` | no |
| `STORAGE_ACCOUNT` | `stdbizipwebdevajtw` | no |
| `ACR_NAME` | `dbizipdevajtw` | no |
| `IMAGE_REPOSITORY` | `dbiz-intelligence-plane` | no |
| `CONTAINER_APP_NAME` | `intelligence-plane` | no |
| `VITE_AZURE_CLIENT_ID` | Entra SPA app (client) ID | no |
| `VITE_AZURE_TENANT_ID` | Entra directory (tenant) ID | no |
| `FRONTDOOR_PROFILE` | Front Door profile name | no |
| `FRONTDOOR_ENDPOINT` | Front Door endpoint name | no |

`FRONTDOOR_*` drive the cache purge after an SPA upload. If unset, the pipeline discovers them when the
resource group holds exactly one profile and one endpoint; where it is ambiguous it warns and **skips the
purge**, which leaves the previous bundle live. Set them explicitly.

Do **not** put Entra client secrets in this group. Frontend only needs the public client ID and tenant ID.

### API Container App env (optional — used when pipeline parameter **updateEnvVars** is true)

These map to `az containerapp update --set-env-vars`. Prefer `IP_*` names so they do not clash with AzureCLI’s own `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` (service connection).

| Variable group key | Container App env | Example |
|--------------------|-------------------|---------|
| `IP_AZURE_TENANT_ID` (or fallback `VITE_AZURE_TENANT_ID`) | `AZURE_TENANT_ID` | `1a815263-e4f7-4552-b141-ce31ce582f69` |
| `IP_AZURE_CLIENT_ID` (or fallback `VITE_AZURE_CLIENT_ID`) | `AZURE_CLIENT_ID` | `deee6bc0-f3f1-49fa-ac8d-62e7ccb8b16e` |
| `IP_ADMIN_ALLOWLIST` | `IP_ADMIN_ALLOWLIST` | `user@dbizsolution.com,...` |
| `IP_AZURE_FRONTDOOR_ID` | `AZURE_FRONTDOOR_ID` | Terraform output `front_door_id` |
| `IP_DBIZ_REQUIRE_ENTRA_ROLES` | `DBIZ_REQUIRE_ENTRA_ROLES` | `1` |
| `IP_DBIZ_CORS_ORIGINS` | `DBIZ_CORS_ORIGINS` | `https://inteligenceplane.dbizsolution.com` |
| `IP_REGISTRATION_ENDPOINT` | `REGISTRATION_ENDPOINT` | optional; omit if unused |

`PORT`, `DBIZ_STATE_DIR`, and `NODE_ENV` are set to fixed production defaults when env update is enabled.

**Never** set `SESSION_SECRET` from the pipeline — it must stay a Key Vault `secretRef` on the Container App.

Authorize the variable group for use by the two pipelines (Pipeline permissions on the group).

---

## 4. Register the pipelines

1. **Pipelines → New pipeline** → select this repo.
2. Existing Azure Pipelines YAML file → `azure-pipelines/deploy-static-web.yml` → save as e.g. **Deploy static web**.
3. Repeat for `azure-pipelines/deploy-api.yml` → **Deploy API**.
4. Default branch: `main` (matches YAML triggers).

First run may prompt to authorize the service connection and variable group.

### Triggers (path filters)

- **Static web** runs on changes under `packages/tenant-onboarding-web`, engine/contracts/platform packages in the web build graph, and its own YAML.
- **API** runs on `packages/**`, `deploy/Dockerfile`, lockfile/workspace roots, and its own YAML.

Both also support **Run pipeline** manually.

---

## 5. What each pipeline does

### Static web

1. Node 24 + Corepack (pnpm from `packageManager`).
2. `pnpm install --frozen-lockfile`.
3. `pnpm --filter "@dbiz/tenant-onboarding-web..." build` with `VITE_AZURE_*` set and `VITE_API_URL` unset (same-origin via Front Door).
4. `az storage blob upload-batch` to `$web` using `--auth-mode login`.
5. **Purge the Front Door cache.** Front Door caches `index.html` and `/assets/*`, so without this an
   upload changes nothing a user can see — the fix looks like a no-op and gets misdiagnosed as a code
   problem. A purge failure fails the pipeline: an unpurged deploy has not reached anyone.
6. Report the expected vs live bundle hash. Informational — purge propagation is not instant.

### API

1. Tag image with short commit SHA and `latest`.
2. `az acr login` → `docker build -f deploy/Dockerfile` → push both tags.
3. `az containerapp update --image ...:<sha>` — Container App is Single revision mode with traffic on latest, so a new revision receives 100% traffic.
4. **Optional (manual run):** set pipeline parameter **Also update Container App environment variables** to `true` to merge `IP_*` / `VITE_*` values from `vg-dbiz-ip-dev` via `--set-env-vars` (does not touch `SESSION_SECRET`).

Terraform may still list `container_image_tag = "latest"`; the **running** image is whatever the last successful API pipeline set. Reconcile Terraform when you next apply infra if you care about state matching.

---

## 6. Verify

```bash
curl -fsS https://inteligenceplane.dbizsolution.com/
curl -fsS https://inteligenceplane.dbizsolution.com/api/health
```

Confirm the deploy actually reached the edge — not just that the pipeline was green:

```bash
curl -sS https://inteligenceplane.dbizsolution.com/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
curl -sS -o /dev/null -w '%{http_code}\n' https://inteligenceplane.dbizsolution.com/blank.html   # 200
```

### Entra app roles — provision them, do not hand-craft them

The role vocabulary belongs to the solution: the API accepts a closed table of roles
(`ENTRA_ROLE_MAP`) and refuses everything else. The matching directory objects are declared in
[`entra-app-roles.json`](entra-app-roles.json) and applied by
[`provision-entra-app-roles.sh`](provision-entra-app-roles.sh). Run it in Cloud Shell:

```bash
./deploy/azure/provision-entra-app-roles.sh \
  deee6bc0-f3f1-49fa-ac8d-62e7ccb8b16e \
  <you>@dbizsolution.com \
  DBiz.Platform.Admin
```

It creates any missing roles (additive — existing roles on the app are preserved), creates the
enterprise application if absent, and assigns the named user. Re-running it is safe.

**Defining a role emits nothing.** Until a user is *assigned*, their token carries no `roles` claim
at all and the API refuses them — with `DBIZ_REQUIRE_ENTRA_ROLES=1`, that locks the deployment out
via a control working exactly as designed. The portal presents role creation (App registrations) and
role assignment (Enterprise applications) as unrelated screens, which is why the second step is the
one usually missed; the script does both.

The declaration is kept honest by `entra-app-roles.conformance.test.ts`, which fails if a declared
role is one the API would refuse, or if an accepted role has no way to be provisioned.

### Entra SPA redirect URIs

Register **one**, under **Authentication → Single-page application** (not Web — a Web-platform URI
refuses the cross-origin token redemption an SPA performs):

```
https://inteligenceplane.dbizsolution.com/blank.html    # callback for BOTH popup and redirect flows
```

Register these **before** deploying a bundle that uses them; registration is additive and does not affect
the bundle already live. Rationale for the split is in
[`packages/tenant-onboarding-web/CONFIGURATION.md`](../../packages/tenant-onboarding-web/CONFIGURATION.md).

---

## 7. Rollback (Container App)

```bash
az containerapp revision list -g rg-dbiz-ip -n intelligence-plane -o table
az containerapp ingress traffic set \
  -g rg-dbiz-ip -n intelligence-plane \
  --revision-weight <previous-revision-name>=100
```

SPA rollback: re-run a previous successful static-web pipeline, or upload a known-good `dist/` with [`deploy-static-web.ps1`](deploy-static-web.ps1) `-SkipBuild`.

---

## Local alternative

Without Azure DevOps, use the PowerShell script:

```powershell
.\deploy\azure\deploy-static-web.ps1 `
  -AzureClientId "<entra-client-id>" `
  -AzureTenantId "<entra-tenant-id>"
```

API locally (needs Docker + Azure login):

```bash
az acr build -r dbizipdevajtw -t dbiz-intelligence-plane:<tag> -f deploy/Dockerfile .
az containerapp update -g rg-dbiz-ip -n intelligence-plane \
  --image dbizipdevajtw.azurecr.io/dbiz-intelligence-plane:<tag>
```
