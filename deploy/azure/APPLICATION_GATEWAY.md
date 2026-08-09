# Application Gateway Guide — Intelligence Plane

> **NOT THE DEPLOYED EDGE.** `https://inteligenceplane.dbizsolution.com` is served by **Azure Front
> Door** — see [`FRONT_DOOR.md`](FRONT_DOOR.md), which is authoritative for the deployed topology.
> This guide is retained for the Application Gateway option; do not configure routing from it without
> first confirming which edge the environment actually runs. The **Host header** rule below is the one
> fact that applies to both edges, and for the same reason.

The Application Gateway is the public HTTPS edge; the Container App ingress is its backend. Uses the
existing gateway — no new resource.

## Critical integration fact (read first)
Azure Container Apps routes inbound requests **by the `Host` header** to the right app. The Gateway must
therefore send the **backend FQDN as the Host header**, not the client's original host. In HTTP settings
this is **"Pick host name from backend target" = Yes** (`--host-name-from-backend-pool true`). Omit it and
every request returns 404 from the Container Apps edge even though the app is healthy. The same applies to
the health probe (`--host-name-from-http-settings true`).

## Components

| Component | Setting |
|---|---|
| **Backend pool** (`ip-backend`) | one target: the Container App ingress FQDN (`az containerapp show --query properties.configuration.ingress.fqdn`) |
| **Health probe** (`ip-health`) | Protocol **Https**, path `/api/health`, host from HTTP settings, interval 30s, timeout 30s, unhealthy threshold 3, match **200-399** |
| **HTTP settings** (`ip-https`) | Backend protocol **Https**, port **443**, **host name from backend pool = Yes**, request **timeout ≥ 120s**, associated probe `ip-health` |
| **Listener** | **HTTPS** on port 443, TLS certificate (from Key Vault or uploaded PFX), public frontend IP |
| **Routing rule** | Path-based: `/api/*` → `ip-backend` via `ip-https` (or a basic rule sending all traffic there) |
| **HTTPS / SSL** | TLS terminates at the Gateway; Gateway → Container App is HTTPS again (end-to-end encrypted). Container Apps supplies the backend certificate automatically (trusted CA) — no "trusted root cert" upload needed |
| **Timeouts** | 120s+ backend request timeout — solution export / EP registration can exceed the 20s default |
| **Headers** | Host = backend FQDN (above). Forward `X-Forwarded-For` / `X-Forwarded-Proto` (Gateway adds these by default) |

## Commands
```bash
export APP_FQDN=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)

az network application-gateway address-pool create -g "$RG" --gateway-name "$AGW" \
  -n ip-backend --servers "$APP_FQDN"

az network application-gateway probe create -g "$RG" --gateway-name "$AGW" \
  -n ip-health --protocol Https --host-name-from-http-settings true --path /api/health \
  --interval 30 --timeout 30 --threshold 3 --match-status-codes 200-399

az network application-gateway http-settings create -g "$RG" --gateway-name "$AGW" \
  -n ip-https --port 443 --protocol Https --host-name-from-backend-pool true \
  --timeout 120 --probe ip-health

# TLS listener — reference a cert already on the gateway (from Key Vault or uploaded):
az network application-gateway http-listener create -g "$RG" --gateway-name "$AGW" \
  -n ip-listener --frontend-port <https-port-name> --ssl-cert <ssl-cert-name>

# Route to the backend:
az network application-gateway url-path-map create -g "$RG" --gateway-name "$AGW" \
  -n ip-pathmap --paths "/api/*" --address-pool ip-backend --http-settings ip-https \
  --default-address-pool ip-backend --default-http-settings ip-https
az network application-gateway rule create -g "$RG" --gateway-name "$AGW" \
  -n ip-rule --http-listener ip-listener --rule-type PathBasedRouting --url-path-map ip-pathmap --priority 100
```

## Verify
```bash
az network application-gateway show-backend-health -g "$RG" --name "$AGW" \
  --query "backendAddressPools[].backendHttpSettingsCollection[].servers[].health" -o tsv   # -> Healthy
curl -i https://<gateway-public-hostname>/api/health                                         # -> 200
```
If backend health is **Unhealthy**: the host-header setting (top of this file) is the first thing to check.
