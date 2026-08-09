# Deployment Checklist / Runbook — Intelligence Plane

Step-by-step build → push → deploy → validate → rollback. Commands are authoritative in
[../azure/README.md](../azure/README.md); this is the ordered checklist + expected outcomes.

## 1. Build the production image
```bash
az acr build -r <acr> -t dbiz-intelligence-plane:<tag> -f deploy/Dockerfile .
```
- **Expected:** build succeeds; image + digest recorded. **This build is the E-2 measurement** (an image that builds and starts). First build may surface the OpenSSL runtime dep / pnpm workspace copy / `/state` volume — all handled in the Dockerfile.

## 2. Push to ACR
- `az acr build` pushes automatically. Record **image tag** and **digest**.

## 3. Deploy to Container Apps
```bash
az containerapp create -g <rg> --yaml deploy/azure/containerapp.yaml
```
- Fill the `<angle-bracket>` placeholders (region, identity id, env id, ACR, KV URL, storage name) first.
- **Expected:** one revision, `minReplicas=maxReplicas=1`, provisioning succeeds.

## 4. Health validation
```bash
curl -fsS https://<fqdn>/api/health      # → 200 {"status":"ok","tenants":N,"uptime":N}
```

## 5. Readiness validation
- Readiness probe is `GET /api/health` (no distinct `/api/ready` yet — see KNOWN_LIMITATIONS). Confirm the revision reaches **Healthy**.

## 6. Storage (Azure Files) validation
- Confirm the app created `/state/tenants`, `/state/registration`, `/state/signing` on the mounted share (create a tenant via `POST /api/tenants` and confirm `tenant.json` persists across a restart).

## 7. Key Vault validation
- Confirm the app started (it refuses to boot without `SESSION_SECRET`) → proves the `secretRef` resolved via managed identity.

## 8. Redis validation
- **Infra-level only this release:** confirm connectivity to the Redis endpoint from the Container App network. The **application** does not use Redis until M-b (keep `DBIZ_STATE_BACKEND=memory`).

## 9. Application Gateway validation
```bash
az network application-gateway show-backend-health -g <rg> --name <agw> ...   # → Healthy
curl -i https://<gateway-hostname>/api/health                                  # → 200
```
- If **Unhealthy**: check the host-header setting first (AZURE_CONFIGURATION_GUIDE).

## 10. Workflow validation
- `POST /api/auth/session` (Entra id_token) → `200 {token}`; `POST /api/tenants` (Bearer) → tenant created + persisted + listed. (Full EP↔IP execution requires a registered Execution Plane — out of the IP-only deploy scope.)

## 11. Restart validation
- Restart the revision; confirm `/api/health` returns, tenant data survives (Azure Files), and no `SESSION_SECRET` regeneration (EP credentials remain valid).

## 12. Scaling validation
- **This release is single-replica** (correct until M-b). Do **not** raise `maxReplicas` above 1 (see KNOWN_LIMITATIONS).

## Rollback
Container Apps is revision-based:
```bash
az containerapp revision list -n intelligence-plane -g <rg> -o table
az containerapp ingress traffic set -n intelligence-plane -g <rg> --revision-weight <previous>=100
```
State on Azure Files is backward-compatible (append-only OTC store, additive `tenant.json`).
