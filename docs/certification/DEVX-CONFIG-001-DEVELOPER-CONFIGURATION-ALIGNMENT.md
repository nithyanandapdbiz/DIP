# DEVX-CONFIG-001 — Developer Configuration Alignment

**Status:** COMPLETE (review) · **Verdict:** **CONFIGURATION REQUIRES CLEANUP** (one obsolete item) · **Date:** 2026-07-29

> Evidence-based alignment review of all developer-specific configuration. **No repository modification; no
> production behaviour changed; no future integration fabricated — recommendation only.**

---

## Task 3 — `DBIZ_PROVIDER_MODE` analysis (the flagged variable)

| Question | Finding (evidence) |
|---|---|
| Defined in | `.devcontainer/devcontainer.json` (`remoteEnv`) and `docker-compose.dev.yml` (intelligence-plane env) |
| Consumed by code | **NONE** — `grep process.env.DBIZ_PROVIDER_MODE` across all `.ts/.mjs/.js` = **zero hits** |
| Actively consumed | **No** |
| Indirectly consumed | **No** |
| Planned future config | **No** — the provider model is already implemented and uses different variables |
| **Conclusion** | **OBSOLETE / UNUSED** — it selects nothing |

**What actually selects providers** (evidence: `packages/platform-providers/src/config/configuration-provider.ts`
— *"the single reader of `process.env`"*): the `ConfigurationProvider.fromEnvironment()` reads
**`DBIZ_ENV`** (environment: `local`|development|qa|uat|production), **`DBIZ_STORAGE_BACKEND`**,
**`DBIZ_SECRET_BACKEND`**, **`DBIZ_STATE_BACKEND`** (+ `REDIS_URL`). `.env.example` documents exactly this Local
model (`DBIZ_ENV=local`, `DBIZ_STORAGE_BACKEND=filesystem`, `DBIZ_SECRET_BACKEND=env`, `DBIZ_STATE_BACKEND=memory`).
**`DBIZ_PROVIDER_MODE` is not part of that contract.**

## Task 4 — Recommendation for the unused variable (NOT implemented)

**REPLACE / REMOVE.** `DBIZ_PROVIDER_MODE=local` in `.devcontainer` and `docker-compose.dev.yml` should be
**removed** (it is inert) and the Local selection should rely on the **existing, consumed** model — `DBIZ_ENV=local`
+ the `DBIZ_*_BACKEND` defaults already in `.env.example` (which `docker compose` reads via `env_file`). No new
variable is needed; the correct one already exists and is documented. *(Recommendation only — not applied.)*

## Task 1/2 — Developer configuration trace

| Configuration | Defined in | Consumed by | Required |
|---|---|---|---|
| `DBIZ_PROVIDER_MODE` | `.devcontainer`, `docker-compose.dev.yml` | **nothing** | no |
| `DBIZ_ENV` | `.env.example` | `platform-providers` ConfigurationProvider | yes (provider/env selection) |
| `DBIZ_STORAGE_BACKEND` / `DBIZ_SECRET_BACKEND` / `DBIZ_STATE_BACKEND` (+ `REDIS_URL`) | `.env.example` | ConfigurationProvider | yes (backend selection) |
| `DBIZ_DEV_AUTH`, `DBIZ_HOST`, `DBIZ_LOG_LEVEL`, `DBIZ_STATE_DIR`, `DBIZ_KEY_PREFIX`, … | `.env.example` | ConfigurationProvider / server | yes (local dev) |
| `FTE_EXECUTION_PLANE_ENDPOINT` | `docker-compose.dev.yml` | `canonical-functionaltest.mjs`, `devBootstrap.mjs` | yes |
| `FTE_RUNTIME_BINDINGS` | `docker-compose.dev.yml` | `canonical-functionaltest.mjs`, `devBootstrap.mjs` | yes |
| `DEV_EP_IMAGE` / `DEV_EP_PORT` / `DEV_TEST_APP_IMAGE` | `docker-compose.dev.yml` | Compose (image/port/health) | yes (dev topology; images from the EP plane) |
| `EP_MODE` / `EP_TENANT` | `docker-compose.dev.yml` | the EP dev container (EP-owned) | yes (dev EP) |
| `DEV_SIGNER_MODULE` / `DEV_TRANSPORT_MODULE` / `DEV_PROVIDERS_MODULE` / `DEV_LOCATOR_MODULE` / `DEV_REQUEST_MODULE` | `devBootstrap.mjs` (defaulted) | `devBootstrap.mjs` → generator | optional (dev adapter modules — pending) |

## Task 5 — Do the sources describe the same configuration model?

**No — one inconsistency:**
- `.env.example` + `platform-providers` (the authoritative model): Local mode = `DBIZ_ENV=local` + `DBIZ_*_BACKEND` defaults.
- `.devcontainer` + `docker-compose.dev.yml` (my dev artifacts): introduce `DBIZ_PROVIDER_MODE=local`, a variable **not in the model** and consumed by nothing; and they do **not** set `DBIZ_ENV`/backends (Local selection actually comes from `.env`).
- `README`: documents the `.env`/compose workflow correctly; does not mention `DBIZ_PROVIDER_MODE`.

So `README`, `.env.example`, `platform-providers`, and the launcher/`FTE_*` vars are internally consistent; only
the two dev artifacts carry the stray `DBIZ_PROVIDER_MODE`.

## Task 6 — Developer Configuration Matrix

| Configuration | Defined In | Consumed By | Status | Required | Recommended Action |
|---|---|---|---|---|---|
| `DBIZ_PROVIDER_MODE` | `.devcontainer`, `docker-compose.dev.yml` | — (none) | **OBSOLETE** | no | **Remove**; rely on `DBIZ_ENV` + backends |
| `DBIZ_ENV` | `.env.example` | ConfigurationProvider | **ACTIVE** | yes | keep; set `local` in dev |
| `DBIZ_STORAGE_/SECRET_/STATE_BACKEND` (+`REDIS_URL`) | `.env.example` | ConfigurationProvider | **ACTIVE** | yes | keep (Local defaults) |
| `DBIZ_DEV_AUTH` and other `DBIZ_*` | `.env.example` | ConfigurationProvider/server | **ACTIVE** | yes (local) | keep |
| `FTE_EXECUTION_PLANE_ENDPOINT` | `docker-compose.dev.yml` | launcher, devBootstrap | **ACTIVE** | yes | keep |
| `FTE_RUNTIME_BINDINGS` | `docker-compose.dev.yml` | launcher, devBootstrap | **ACTIVE** | yes | keep |
| `DEV_EP_IMAGE`/`DEV_EP_PORT`/`DEV_TEST_APP_IMAGE` | `docker-compose.dev.yml` | Compose | **ACTIVE** | yes | keep (EP-plane images) |
| `EP_MODE`/`EP_TENANT` | `docker-compose.dev.yml` | EP dev container | **ACTIVE** | yes | keep (EP-owned) |
| `DEV_*_MODULE` (5) | `devBootstrap.mjs` (defaulted) | devBootstrap → generator | **FUTURE** | optional | keep; document (dev adapters pending) |

**Classification summary:** ACTIVE — all `DBIZ_ENV`/backend/`FTE_*`/`DEV_EP_*`/`EP_*` vars; **OBSOLETE** —
`DBIZ_PROVIDER_MODE`; **FUTURE** — the five `DEV_*_MODULE` adapter pointers (defaulted; the modules are pending);
REDUNDANT/OPTIONAL — none beyond the above.

## Final Verdict — **CONFIGURATION REQUIRES CLEANUP**

**Evidence:** exactly one obsolete item — `DBIZ_PROVIDER_MODE`, defined by two dev artifacts and consumed by no
code (`grep` = zero), superseded by the authoritative, already-consumed model (`DBIZ_ENV` + `DBIZ_*_BACKEND` per
`platform-providers`/`.env.example`). All other developer configuration is ACTIVE and internally consistent.

**Recommended cleanup (minimise developer confusion; preserve production architecture; NOT implemented):**
remove `DBIZ_PROVIDER_MODE=local` from `.devcontainer/devcontainer.json` and `docker-compose.dev.yml`, and (if
desired) set `DBIZ_ENV=local` explicitly in the dev override for clarity — matching the documented `.env.example`
model. This is a **small, dev-scoped, non-production** change with **no** governance/build/test impact (deterministic
reds 5; RC-3 PASS; the variables are outside the gated `src/` tree). No production configuration is touched.

**No repository files were modified or deleted; no production behaviour changed; no future integration fabricated.**
