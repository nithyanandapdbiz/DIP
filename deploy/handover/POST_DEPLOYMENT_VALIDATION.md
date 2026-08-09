# Post-Deployment Validation & Cloud-Team Return Package

After deployment, the Cloud Team runs the validation below and **returns the evidence** so the dev team
can fold it into a final Cloud Readiness certification. Every row requires **execution evidence** (a
command output, a log excerpt, or a portal screenshot) — not an assertion.

## Validation matrix (Cloud Team executes)

| # | Check | Command / source | Expected | Evidence to return |
|---|---|---|---|---|
| 1 | Health | `curl https://<fqdn>/api/health` | `200 {"status":"ok"}` | response body |
| 2 | Readiness | probe on `/api/health` | revision **Healthy** | revision status |
| 3 | Azure Files | create tenant → restart → list | `tenant.json` survives | before/after listing |
| 4 | Key Vault | app boots | started (refuses without secret) | startup log line |
| 5 | Redis (infra) | connectivity from Container App | reachable | `redis-cli`/telnet result |
| 6 | App Gateway | backend health + `curl` via gateway | Healthy + `200` | `show-backend-health` output |
| 7 | Managed Identity | secret resolved + image pulled | success | role assignments |
| 8 | Sample workflow | `POST /api/auth/session` → `POST /api/tenants` | tenant created | responses |
| 9 | Logs | `az containerapp logs show` | startup + request logs | log excerpt |
| 10 | Restart | restart revision | health returns, data intact | before/after |
| 11 | Scaling | confirm single replica | `replicas=1` | revision detail |

## Return checklist (send back to the dev team)

- [ ] Container **revision** name/id
- [ ] **Deployment logs** (build + startup)
- [ ] **Application URL** (Container App ingress FQDN)
- [ ] **Gateway URL** (public endpoint)
- [ ] **Health** endpoint result
- [ ] **Readiness** result
- [ ] **Redis** validation (infra connectivity)
- [ ] **Key Vault** validation (secret resolved)
- [ ] **Azure Files** validation (persist + survive restart)
- [ ] **Managed Identity** validation (roles effective)
- [ ] **Scaling** result (single replica confirmed)
- [ ] **Restart** result
- [ ] **Issues encountered** — classified **infrastructure** vs **application** (see SUPPORT_AND_OWNERSHIP)

## On completion
When rows 1–11 return green evidence, the standing **E-2** blocker is measured PASS and the dev team can
recompute the General Availability / Cloud Readiness determination from that evidence.
