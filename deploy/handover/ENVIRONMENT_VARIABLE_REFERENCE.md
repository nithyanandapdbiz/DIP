# Environment Variable Reference — Intelligence Plane

The single reader of the environment is the certified `ConfigurationProvider` (ADR-0060). Sources of truth:
[`.env.example`](../../.env.example), [`deploy/azure/containerapp.yaml`](../azure/containerapp.yaml), [`deploy/azure/KEY_VAULT.md`](../azure/KEY_VAULT.md).

## Secrets (Key Vault → env via `secretRef`)

| Key Vault secret | Env var | Required | Notes |
|---|---|---|---|
| `session-secret` | `SESSION_SECRET` | **Yes** | 32-byte random (`openssl rand -base64 32`). Signs DBIZ sessions **and** EP credentials. **Single stable value** — rotating revokes issued EP credentials. **The container refuses to start if unset.** |

`anthropic-api-key` / `openai-api-key`: **not required to boot** — the IP server calls no model at runtime. Provision only when a model-calling capability is wired.

## Non-secret configuration (plain Container App env)

| Var | Required | Default | Azure value | Purpose |
|---|---|---|---|---|
| `PORT` | no | `8080` | `8080` | Listen port (matches ingress `targetPort`) |
| `DBIZ_HOST` | no | `0.0.0.0` | — | Bind address (must stay `0.0.0.0` for ingress) |
| `DBIZ_STATE_DIR` | no | `/state` | `/state` | Root of the file-backed SSOT (Azure Files mount) |
| `DBIZ_STORAGE_BACKEND` | no | `filesystem` | `filesystem` | StorageProvider backend |
| `DBIZ_SECRET_BACKEND` | no | `env` | `env` | SecretProvider backend (Key Vault → env) |
| `DBIZ_STATE_BACKEND` | no | `memory` | `memory` | Distributed-state backend — **keep `memory` until M-b** |
| `REDIS_URL` | no | — | **leave unset** | Selecting redis requires the M-b client factory |
| `DBIZ_ENV` | no | `local` | `production` | Diagnostics/logging only — never a security control |
| `DBIZ_LOG_LEVEL` | no | `info` | `info` | debug \| info \| warn \| error |
| `AZURE_TENANT_ID` | **yes (prod)** | — | Entra tenant | Real Microsoft sign-in |
| `AZURE_CLIENT_ID` | **yes (prod)** | — | Entra app (audience) | Real Microsoft sign-in |
| `IP_ADMIN_ALLOWLIST` | recommended | empty | admin emails (CSV) | Who may obtain a session |
| `REGISTRATION_ENDPOINT` | no | `https://gateway.dbiz.example/v1/register` | EP registration URL | Advertised to the EP |
| `INTELLIGENCE_CONTRACT_VERSION` | no | `1.0.0` | `1.0.0` | Cross-plane contract version |
| `NODE_ENV` | no | — | `production` | |
| `DBIZ_DEV_AUTH` | **MUST be unset in Azure** | unset | **absent** | Unsigned `dev:<email>` verifier — local only |

## Audit result (evidence)
- **No hardcoded secrets** in the image or manifests — `session-secret` is a Key Vault `secretRef`; `git ls-files` shows no tracked `.env`/`.pem`/secret.
- **No development-only configuration** in the Azure path — `DBIZ_DEV_AUTH` is absent from [containerapp.yaml](../azure/containerapp.yaml) by design; if neither Entra config nor `DBIZ_DEV_AUTH` is present the app **refuses to start**.
- **No local file paths / localhost** in the deployable surface — `server/index.ts` binds `0.0.0.0`; the only loopback reference is the in-container `HEALTHCHECK` (`wget http://127.0.0.1:8080/api/health`), which is correct.
- **No temporary values** — all defaults are production-safe.
