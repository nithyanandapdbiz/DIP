# Azure Front Door — the Intelligence Plane public edge

Front Door is the public HTTPS edge for `https://inteligenceplane.dbizsolution.com`. It fronts **two**
origins, and the split between them is the whole point of this document:

| Path pattern | Origin | Serves |
|---|---|---|
| `/*` | Azure Storage **static website** (`$web`) | the tenant-onboarding SPA (`index.html`, `/assets/*`, `/blank.html`) |
| `/api/*` | Azure **Container App** ingress | the Intelligence Plane API (`@dbiz/tenant-onboarding-engine`) |

> **Supersedes [`APPLICATION_GATEWAY.md`](APPLICATION_GATEWAY.md) for the deployed topology.** That guide
> describes an Application Gateway edge. Front Door is what is deployed. The Host-header rule in it is the
> one fact that carries over unchanged — see "The Host header" below.

## The failure this document exists to prevent

The SPA calls the API **same-origin**: `VITE_API_URL` is empty, so the browser requests
`https://inteligenceplane.dbizsolution.com/api/auth/session`. If Front Door has no `/api/*` route to the
Container App, that request is answered by the edge or by Storage instead of by the API — and **sign-in
fails at the token exchange, after a completely successful Microsoft authentication**.

The symptom is misleading by nature: Microsoft sign-in works, the user is authenticated, and the console
still refuses them. Observed on the live endpoint:

```
$ curl -i https://inteligenceplane.dbizsolution.com/api/health
HTTP/1.1 403 Forbidden
Content-Type: text/plain
x-azure-ref: 20260731T053036Z-...
RBAC: access denied
```

`/api/health` is public in the engine and returns JSON. A `text/plain` body with **no `x-ms-*` headers**
did not come from the API and did not come from Storage — the edge itself produced it.

## Verify the routing before anything else

```bash
RG=<resource-group>; PROFILE=<front-door-profile>; ENDPOINT=<endpoint-name>

# Which routes exist, and what does each match?
az afd route list -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" \
  --query "[].{route:name,patterns:patternsToMatch,originGroup:originGroup.id,cache:cacheConfiguration}" -o table

# Is a WAF or other security policy attached that could produce the 403?
az afd security-policy list -g "$RG" --profile-name "$PROFILE" -o table
```

Three candidates produce a `403` on `/api/*`; the commands above tell you which:

1. **No `/api/*` route at all** — the request falls through to the `/*` Storage route.
2. **A route exists but its origin is unreachable or unauthorised** — e.g. Private Link to the origin
   without an approved connection, or a managed identity missing its role assignment on the origin.
3. **A WAF or security policy is blocking it** before routing is considered.

## Create the `/api/*` route

```bash
RG=<resource-group>; PROFILE=<front-door-profile>; ENDPOINT=<endpoint-name>

# The Container App ingress FQDN is the origin. Take it from the app, never hand-typed.
API_FQDN=$(az containerapp show -g "$RG" -n <container-app-name> \
  --query properties.configuration.ingress.fqdn -o tsv)
echo "origin: $API_FQDN"

az afd origin-group create -g "$RG" --profile-name "$PROFILE" \
  --origin-group-name ip-api \
  --probe-request-type GET --probe-protocol Https --probe-path /api/health \
  --probe-interval-in-seconds 60 \
  --sample-size 4 --successful-samples-required 3 --additional-latency-in-milliseconds 50

az afd origin create -g "$RG" --profile-name "$PROFILE" \
  --origin-group-name ip-api --origin-name ip-api-origin \
  --host-name "$API_FQDN" \
  --origin-host-header "$API_FQDN" \
  --https-port 443 --priority 1 --weight 1000 --enabled-state Enabled

az afd route create -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" \
  --route-name ip-api-route \
  --origin-group ip-api \
  --patterns-to-match '/api/*' \
  --supported-protocols Https \
  --forwarding-protocol HttpsOnly \
  --https-redirect Enabled \
  --link-to-default-domain Enabled \
  --enable-caching false
```

### The Host header

**`--origin-host-header` must be the Container App FQDN, not the customer-facing hostname.** Container
Apps routes inbound requests to the right app *by the `Host` header*. Forward the client's original host
and the Container Apps edge returns 404 for every request while the app itself is perfectly healthy —
the same trap [`APPLICATION_GATEWAY.md`](APPLICATION_GATEWAY.md) documents for the Gateway, for the same
reason.

### Caching is disabled deliberately

`--enable-caching false`. This route carries authentication exchanges, session tokens and tenant
administration. A cached `/api/*` response is a cross-user data leak, not a performance win.

### Route precedence

Front Door matches the **most specific** path pattern, so `/api/*` wins over the `/*` Storage route
without any ordering configuration. Both routes must stay attached to the same custom domain.

## Verify from outside

```bash
BASE=https://inteligenceplane.dbizsolution.com

# 1. The API is reachable and answering as itself: JSON, HTTP 200.
curl -sS -i "$BASE/api/health" | head -20

# 2. The auth endpoint is the API, not the edge. A junk token must be REFUSED BY THE APP:
#    HTTP 401 with a JSON body. A text/plain 403 means routing is still wrong.
curl -sS -i -X POST "$BASE/api/auth/session" \
  -H 'content-type: application/json' -d '{"idToken":"probe"}' | head -20

# 3. The SPA and its dedicated MSAL popup callback are both served.
curl -sS -o /dev/null -w 'index:      %{http_code}\n' "$BASE/"
curl -sS -o /dev/null -w 'blank.html: %{http_code}\n' "$BASE/blank.html"   # must be 200
```

Step 2 is the one that matters. `401` + JSON means the request reached the engine and it declined the
token — routing is correct. `403` + `text/plain` means the edge answered and sign-in will still fail.

## Known wart: `/login` returns HTTP 404

An Azure Storage static website has **no rewrite engine** — only a single *error document path*, which is
set to `index.html`. So `/login` serves the full SPA (`Content-Length: 477`, `<script type="module">`
intact) but with a `404` status.

The console still works: the browser renders the body and executes the bundle, so React Router shows the
login page and the MSAL redirect callback runs. It is incorrect, not broken. To return a true `200`, add a
Front Door **Rules Engine** URL-rewrite for unmatched SPA paths; Storage cannot do it.

The MSAL callback is `/blank.html`, a built page that answers `200` regardless of the rewrite. It must
ship with its bridge script or sign-in hangs on a white screen — see
[`packages/tenant-onboarding-web/CONFIGURATION.md`](../../packages/tenant-onboarding-web/CONFIGURATION.md).

## Deploying the SPA to `$web`

Use the pipeline: [`azure-pipelines/deploy-static-web.yml`](../../azure-pipelines/deploy-static-web.yml),
set up per [`AZURE_DEVOPS.md`](AZURE_DEVOPS.md). It builds with `VITE_AZURE_CLIENT_ID` /
`VITE_AZURE_TENANT_ID` from the `vg-dbiz-ip-dev` variable group, deliberately unsets `VITE_API_URL` (so
the SPA calls the API same-origin through the `/api/*` route above), and uploads `dist/` to `$web`.

> **The pipeline does not purge the Front Door cache.** Front Door will keep serving the previously
> cached `index.html` and `/assets/*` after a successful upload, so a deploy can appear to have done
> nothing. Until a purge step is added, run it by hand after the pipeline completes:
>
> ```bash
> az afd endpoint purge -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" \
>   --content-paths '/*'
> ```
>
> Confirm the new bundle is actually live before concluding anything about a deploy:
> `curl -sS https://inteligenceplane.dbizsolution.com/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'`

`DBIZ_CORS_ORIGINS` on the Container App can stay empty — same-origin, deny by default.

## Who owns this configuration

Front Door itself (along with ACR, the Container App definition and Key Vault) is **Terraform, in the
`DBizIntelligencePlane-Infra` repository** — see [`AZURE_DEVOPS.md`](AZURE_DEVOPS.md). The `az afd`
commands above are for **diagnosis, and for an urgent fix applied by hand**; a routing change made that
way is drift until it is reflected in Terraform. Routine SPA and image deploys need no `terraform apply`.
