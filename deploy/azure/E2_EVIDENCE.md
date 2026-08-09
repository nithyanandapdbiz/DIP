# Runtime Evidence Collection — E-2 Deployment Verification Gate

The E-2 gate asks one question: **did this image build, start, and serve a real request in the target
environment?** "An image that builds is not an image that runs" (doc 17, C-17.3). The evidence below is
what turns E-2 from `NOT MEASURED` to a determination. Collect **all** of it into one dated bundle and
attach it to the governance record; the platform's `governance/deployment/run-deployment-probe.mjs` is the
automated counterpart and should be run against the same deployment.

## Evidence manifest (collect every row)

| # | Evidence | How | Proves |
|---|---|---|---|
| 1 | **ACR build log** | `acr-build-<tag>.log` from `az acr build … | tee` | image built (C-17.1) |
| 2 | **Image digest** | `az acr repository show -n $ACR --image dbiz-intelligence-plane:<tag>` | the exact artefact deployed |
| 3 | **Container App status** | `az containerapp show … --query properties.runningStatus` → `Running` | app provisioned |
| 4 | **Revision health** | `az containerapp revision list …` → active revision `Healthy` | replica live |
| 5 | **Startup log** | `az containerapp logs show --type console --tail 300` — must contain `Intelligence Plane API listening on 0.0.0.0:8080` and **no** exception/stack trace | started cleanly, bound 0.0.0.0 |
| 6 | **Health response** | `curl -i $BASE/api/health` → `200` + `{"status":"ok",...}` | serves a real request (C-17.3) |
| 7 | **Swagger response** | `curl -is $BASE/api/docs | head` → `200` | API surface reachable |
| 8 | **Authentication response** | `curl -i POST /api/auth/session` → `200` + token (real Entra id_token); and a non-allow-listed identity → `403` | auth works + allow-list enforced |
| 9 | **Tenant onboarding response** | `curl -i POST /api/tenants` (Bearer) → `201`; then `GET /api/tenants` shows it | onboarding works + persists |
| 10 | **Azure Monitor logs** | Log Analytics `ContainerAppConsoleLogs_CL | where ContainerAppName_s == '<app>'` | durable log evidence |
| 11 | **Screenshots** | Portal: Container App **Running**/revision **Healthy**; Swagger UI in a browser; Gateway backend health **Healthy** | human-verifiable snapshot |

## One-shot collector
Run [`collect-e2-evidence.sh`](collect-e2-evidence.sh) after deployment; it writes a timestamped
`e2-evidence-<tag>/` folder containing items 1–10 (screenshots, item 11, are added by hand). Pass a valid
Entra id_token to also capture items 8–9.

```bash
BASE="https://$APP_FQDN" RG="$RG" APP="$APP" ACR="$ACR" TAG="$TAG" \
ENTRA_ID_TOKEN="<optional-id-token>" bash deploy/azure/collect-e2-evidence.sh
```

## Acceptance
E-2 is satisfied when items 1, 3–7, and 9 are all present and green (8 requires a real Entra token; if the
Entra app is not yet live, capture it in a follow-up and note the gap). Record the image digest (item 2)
so the evidence is bound to a specific artefact. GA (`E-2 = PASS`) is then computed, not asserted.

## Local pre-flight already on record
Before Azure, the frozen artefact was validated as a live process (dev-auth bridge): boot, `/api/health`
200, Swagger, auth, allow-list-deny 403, tenant create 201 + persist + list — **8/9 checks**; the 9th
(SIGTERM drain) is not observable on a Windows host and works on Linux. This is corroboration, **not** a
substitute for the in-Azure evidence above.
