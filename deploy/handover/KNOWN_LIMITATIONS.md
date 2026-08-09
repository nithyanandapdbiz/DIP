# Known Limitations (Deployment View) — Intelligence Plane

Deployment-relevant limitations for the Cloud Team. The **canonical programme register** is
[`program/KNOWN_LIMITATIONS.md`](../../program/KNOWN_LIMITATIONS.md) — this is the deployment subset, not a
second source of truth.

| # | Limitation | Current behaviour | Impact | Owner | Future milestone | Workaround |
|---|---|---|---|---|---|---|
| L-1 | **Redis not yet consumed** | `DistributedStateProvider` interface + Redis impl are certified, but the injected `ioredis` client factory and backend selection are not wired | App uses the in-memory backend; Redis carries no app traffic | Dev | **M-b** | Provision Redis; keep `DBIZ_STATE_BACKEND=memory`; validate Redis at infra level only |
| L-2 | **Single replica only** | Nonce/session/OTC state is in-memory/file; `FileRegistrationStore` is documented not safe to scale on a shared FS | Correct only at `minReplicas=maxReplicas=1` | Dev | **M-b** (Redis-backed state) | Do **not** raise `maxReplicas` above 1 |
| L-3 | **No distinct `/api/ready`** | Readiness reuses `GET /api/health` (returns 200 + tenant count + uptime) | Readiness probe cannot distinguish "up" from "dependencies ready" | Dev | hardening | Point the readiness probe at `/api/health` |
| L-4 | **`/v1/execute` runtime not in the image** | The cross-plane execution/authoring gateway is a dev `.mjs` (loopback, workstation path); the container image is the tenant/onboarding web tier only | Full EP↔IP execution is not served by the Container App | Dev | deferred runtime (ADR-0049 M5) | Deploy the web tier now; EP↔IP execution is a later, separately-authorised runtime step |
| L-5 | **E-2 never built here** | The image has never been `docker build`/`docker run` verified in the dev environment (no runtime) | First Azure/CI build is the first real build | Cloud | this deployment | The `az acr build` in the runbook **is** the E-2 measurement |

None of L-1…L-5 blocks a **single-replica** production deployment of the web tier. L-1/L-2 are the pair that gate horizontal scaling; both close together at **M-b** with the approved Redis service (no new Azure service).
