# REPOSITORY-HYGIENE-001 — `.devcontainer` Evaluation

**Status:** COMPLETE (review) · **Verdict:** **OPTIONAL** · **Date:** 2026-07-29

> Evidence-based review of `.devcontainer` to decide KEEP / REMOVE / OPTIONAL. **No repository modification; no
> files deleted — recommendation only.** Every conclusion is backed by repository evidence.

---

## Task 1 — Inspection

`.devcontainer/devcontainer.json` (947 bytes, one file). Contents:

| Element | Value |
|---|---|
| Image | `mcr.microsoft.com/devcontainers/typescript-node:24` |
| Feature | `docker-in-docker:2` |
| `onCreateCommand` | `corepack enable && corepack prepare pnpm@11.15.1 --activate && pnpm install` |
| `postStartCommand` | echo of the run instructions (compose + `npm run functionaltest`) |
| `remoteEnv` | `DBIZ_PROVIDER_MODE=local` |
| Extensions | `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode` |
| Mounted volumes / other deps | none |

## Task 2 — Production / build / test / CI / governance dependency?

**None.** A repository-wide grep for `devcontainer` finds references **only in documentation** (this session's
`docs/certification/*` reports + `program/NEXT_ACTION.md`) — never in production source, `package.json`, the
build (`tsc`), tests, the governance gates, `docker-compose*.yml`, or CI. **`.github/workflows/ci.yml` exists and
does not reference `.devcontainer`.** No Runtime SPI, launcher, Functional Testing Engine, runtime-bindings,
Compose, CI/CD, governance, build, or test capability depends on it.

## Task 3 — Developer convenience only?

**Yes.** It provides: a pinned Node 24 + pnpm toolchain image, docker-in-docker, an install-on-create step, an
informational post-start message, a provider-mode env default, and two editor extensions. All of this is IDE /
onboarding convenience — no runtime, build, or governance behaviour.

## Task 4 — Does equivalent functionality already exist?

**Yes, for all of it:**
- **Toolchain:** `package.json` declares `engines: { node: ">=24.0.0 <25" }` and `packageManager: pnpm@11.15.1`
  — the versions the dev container pins.
- **Workflow:** `README.md` documents the full quick-start (`git clone` → `pnpm install --frozen-lockfile` →
  `docker compose up --build`) and a tooling table (Docker Engine + Compose v2).
- **Compose:** `docker-compose.yml` + `docker-compose.dev.yml` exist.
- **Scripts:** `build`/`test`/`govern`/`verify`/`functionaltest` are in `package.json`.
- **Provider mode:** `DBIZ_PROVIDER_MODE=local` is also set by `docker-compose.dev.yml` (and — per the
  INTEGRATION-001 WS-C finding — is not actually the variable `platform-providers` reads; it keys on
  `environment`/`config.*.backend`), so the dev-container `remoteEnv` line is redundant and currently inert.

The supported onboarding (`git clone → pnpm install → docker compose up → npm run functionaltest`) works from the
host toolchain per the README **without** the dev container.

## Task 5 — Impact of removal

| Dimension | Impact of removing `.devcontainer` |
|---|---|
| Developer onboarding | **Minor** — VS Code Dev Containers / GitHub Codespaces users lose a zero-setup toolchain; they follow the README (install Node 24 + pnpm via corepack + Docker). Non-Codespaces users: no change. |
| Build / tests / compose / runtime | **None** — nothing references it |
| Certification / governance / CI/CD | **None** — no gate, baseline, or `ci.yml` reference |

## Task 7 — Justification if retained

- **Why useful:** a consistent, pinned toolchain (Node 24 + pnpm) + docker-in-docker with zero manual setup for
  teams standardizing on **VS Code Dev Containers / GitHub Codespaces**.
- **Who uses it:** only Dev Containers / Codespaces developers; it is invisible to everyone else.
- **What cannot be achieved without it:** nothing that the README + host toolchain + Compose cannot achieve
  manually; it removes a few setup steps for one class of developer.
- **Optional or mandatory:** **optional** — no production, build, test, CI, or governance path requires it.

## Verdict — **OPTIONAL**

- **Reasoning:** it is a **developer-convenience aid only**, required by **no** production capability, build,
  test, CI, or governance path; equivalent onboarding already exists (README + `engines`/`packageManager` +
  Compose + scripts). It is also **harmless** (additive, dev-scoped). Therefore it should be **neither mandated
  nor removed as a release requirement** — retain it as an optional convenience for Dev Containers / Codespaces
  users, or remove it with zero functional impact if the team does not use those.
- **Repository evidence:** single 947-byte file; grep shows references only in documentation; `package.json`
  `engines`/`packageManager`, `README` quick-start, `docker-compose*.yml`, and `ci.yml` provide the toolchain +
  workflow independently; `ci.yml` does not use it.
- **Architectural impact:** none — it touches no plane, contract, Runtime SPI, or the certified core.
- **Developer-experience impact:** positive-but-non-essential for Codespaces/Dev-Containers; neutral otherwise.
- **Production impact:** none — dev-scoped; not in any production/deployment path.
- **Governance impact:** none — outside the gated `src/` tree and the closure baseline; deterministic reds
  unchanged (5); RC-3 PASS.

**Recommendation:** **KEEP as OPTIONAL.** If retained, reconcile (or drop) the `remoteEnv DBIZ_PROVIDER_MODE`
line to match the actual provider-selection contract (`environment`/`config.*.backend`, per INTEGRATION-001) so
it is not misleading; this is a minor, non-blocking cleanup. Not a release blocker in either direction.

**No repository files were modified or deleted.**
