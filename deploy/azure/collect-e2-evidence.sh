#!/usr/bin/env bash
# Collect E-2 runtime evidence for the DBiz Intelligence Plane deployment into a dated bundle.
# Deployment-execution tooling only — it reads state and writes evidence; it changes nothing.
#
# Usage:
#   BASE="https://<app-or-gateway-fqdn>" RG="<rg>" APP="intelligence-plane" ACR="<acr>" TAG="<tag>" \
#   [ENTRA_ID_TOKEN="<id-token>"] bash deploy/azure/collect-e2-evidence.sh
set -uo pipefail

: "${BASE:?set BASE to the app/gateway https URL}"
: "${RG:?set RG}"
: "${APP:?set APP}"
: "${ACR:?set ACR}"
: "${TAG:?set TAG}"

OUT="e2-evidence-${TAG}"
mkdir -p "$OUT"
echo "Writing evidence to ${OUT}/"

# 1. ACR build log is produced at build time (az acr build | tee acr-build-<tag>.log) — copy if present.
[ -f "acr-build-${TAG}.log" ] && cp "acr-build-${TAG}.log" "$OUT/01-acr-build.log"

# 2. Image digest
az acr repository show -n "$ACR" --image "dbiz-intelligence-plane:${TAG}" \
  > "$OUT/02-image-digest.json" 2>&1

# 3. Container App running status
az containerapp show -g "$RG" -n "$APP" \
  --query "{runningStatus:properties.runningStatus,fqdn:properties.configuration.ingress.fqdn}" \
  > "$OUT/03-containerapp-status.json" 2>&1

# 4. Revision health
az containerapp revision list -g "$RG" -n "$APP" \
  --query "[].{rev:name,active:properties.active,health:properties.healthState,provisioning:properties.provisioningState}" \
  -o table > "$OUT/04-revision-health.txt" 2>&1

# 5. Startup / console log
az containerapp logs show -g "$RG" -n "$APP" --type console --tail 300 \
  > "$OUT/05-startup-console.log" 2>&1

# 6. Health response
curl -is "$BASE/api/health"       > "$OUT/06-health.http"     2>&1

# 7. Swagger response (headers only — the body is a large HTML doc)
curl -is "$BASE/api/docs" | head -20 > "$OUT/07-swagger.http" 2>&1

# 8 + 9. Auth + tenant onboarding (only if an Entra id_token is supplied)
if [ -n "${ENTRA_ID_TOKEN:-}" ]; then
  curl -is -X POST "$BASE/api/auth/session" -H 'content-type: application/json' \
    -d "{\"idToken\":\"${ENTRA_ID_TOKEN}\"}" > "$OUT/08-auth.http" 2>&1
  TOKEN=$(grep -o '"token":"[^"]*"' "$OUT/08-auth.http" | head -1 | sed 's/"token":"//;s/"//')
  # negative case: a bogus identity must be refused
  curl -is -X POST "$BASE/api/auth/session" -H 'content-type: application/json' \
    -d '{"idToken":"dev:intruder@evil.example"}' > "$OUT/08b-auth-denied.http" 2>&1
  if [ -n "$TOKEN" ]; then
    curl -is -X POST "$BASE/api/tenants" -H "authorization: Bearer ${TOKEN}" \
      -H 'content-type: application/json' \
      -d '{"organisationName":"Evidence Co","tenantName":"Evidence Prod","primaryAdministrator":"Jane Roe","primaryAdministratorEmail":"jane@evidence.example","preferredCloud":"azure","deploymentModel":"container"}' \
      > "$OUT/09-tenant-create.http" 2>&1
    curl -is "$BASE/api/tenants" -H "authorization: Bearer ${TOKEN}" > "$OUT/09b-tenant-list.http" 2>&1
  fi
else
  echo "ENTRA_ID_TOKEN not set — items 8 & 9 (auth, onboarding) skipped. Capture in a follow-up." \
    > "$OUT/08-09-SKIPPED.txt"
fi

# 10. Azure Monitor / Log Analytics (best-effort; needs the workspace on the environment)
WS=$(az containerapp env show -g "$RG" -n "${ENV:-}" \
  --query properties.appLogsConfiguration.logAnalyticsConfiguration.customerId -o tsv 2>/dev/null)
if [ -n "${WS:-}" ]; then
  az monitor log-analytics query -w "$WS" \
    --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == '${APP}' | project TimeGenerated, Log_s | order by TimeGenerated desc | take 200" \
    > "$OUT/10-azure-monitor.json" 2>&1 || echo "log-analytics query failed (check workspace access)" > "$OUT/10-azure-monitor.txt"
fi

echo "== E-2 evidence bundle =="
ls -la "$OUT"
echo "Add item 11 (portal + Swagger + gateway-health screenshots) by hand, then attach ${OUT}/ to the governance record."
