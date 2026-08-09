# DEVX-CLEANUP-001 — Obsolete Developer Configuration Removal

**Status:** COMPLETE · **Outcome:** `DBIZ_PROVIDER_MODE` removed (1 file changed) · **Date:** 2026-07-29

> Executes the approved DEVX-CONFIG-001 cleanup: remove the obsolete, never-consumed `DBIZ_PROVIDER_MODE`
> developer variable. **Repository-hygiene change only — no production behaviour, architecture, Runtime SPI,
> provider-selection logic, or new variable. Only actual changes are reported; nothing fabricated.**

---

## Task 2 — Confirmed unused (safety gate)

`grep process.env.DBIZ_PROVIDER_MODE` (and any `DBIZ_PROVIDER_MODE`) across all `.ts/.mjs/.js` = **0 code
consumers**. No consumer exists → safe to proceed.

## Task 4 — `.devcontainer`

**`.devcontainer` no longer exists** (it was present at REPOSITORY-HYGIENE-001 last turn but has since been
removed from the working tree — external/concurrent change; it was an untracked file). Per Task 4, with the
directory absent: **did nothing, did not recreate it, no failure reported.** This artifact was already aligned.

## Tasks 3 & 5 — Removal

| File | Change |
|---|---|
| `docker-compose.dev.yml` | Removed the single line `- DBIZ_PROVIDER_MODE=local` from the `intelligence-plane` service `environment`. Corrected the adjacent comment to state that Local provider selection comes from `.env` (`DBIZ_ENV=local` + `DBIZ_*_BACKEND`, per `@dbiz/platform-providers`). **All other environment variables left unchanged** (`FTE_EXECUTION_PLANE_ENDPOINT`, `FTE_RUNTIME_BINDINGS` retained). |

No other file defined the variable (the remaining occurrences are in `docs/certification/*` — the audit trail
of the finding — which are documentation, not configuration definitions, and are left intact as history).

## Task 6 — Verification

| Check | Result |
|---|---|
| `DBIZ_PROVIDER_MODE` in config artifacts (compose/`.env*`/`.devcontainer`) | **0** remaining |
| `FTE_*` retained in `docker-compose.dev.yml` | ✅ both present |
| Provider-selection contract (`DBIZ_ENV` + 3 `DBIZ_*_BACKEND` in `.env.example`) | ✅ **untouched** (4 vars intact) |
| Build (`@dbiz/functional-testing-engine` `tsc --noEmit`) | ✅ **clean** |
| Launcher (`npm run functionaltest`) | ✅ honest-fail **exit 1** (unchanged behaviour) |
| Runtime SPI / provider-selection logic | ✅ **unchanged** (no code touched) |
| Governance | ✅ deterministic reds **5** (unchanged); `RC-3` PASS |
| Files changed this task | **1** — `docker-compose.dev.yml` |

## Task 7 — Cleanup summary

- **Files modified:** `docker-compose.dev.yml` (1).
- **Variables removed:** `DBIZ_PROVIDER_MODE` (1) — obsolete, consumed by nothing.
- **Variables retained:** `FTE_EXECUTION_PLANE_ENDPOINT`, `FTE_RUNTIME_BINDINGS`, `DEV_EP_IMAGE`/`DEV_EP_PORT`/`DEV_TEST_APP_IMAGE`, `EP_MODE`/`EP_TENANT`, the `DEV_*_MODULE` pointers, and the entire provider-selection model (`DBIZ_ENV` + `DBIZ_*_BACKEND`) in `.env.example` — all unchanged.
- **`.devcontainer`:** already absent → no action (not recreated).
- **Verification results:** build clean; launcher behaviour unchanged; Runtime SPI + provider selection unchanged; governance unaffected (reds 5, RC-3 PASS).
- **Repository impact:** dev-scoped only. **No production behaviour, architecture, Runtime SPI, or provider-selection change.** Not in the gated `src/` tree or the closure baseline; no baseline re-cut needed.

## Outcome

The obsolete `DBIZ_PROVIDER_MODE` variable has been removed from `docker-compose.dev.yml`; `.devcontainer` was
already absent. The developer configuration is now aligned with the authoritative provider-selection model
(`DBIZ_ENV` + `DBIZ_*_BACKEND`). No production behaviour, architecture, Runtime SPI, or provider-selection logic
changed; no new configuration variable was introduced. GA remains NOT CERTIFIED; the legacy runtime remains the
active production path and rollback.
