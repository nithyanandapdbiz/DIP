# DEVX-0001 — One-Command Local Functional Testing Platform (Developer Experience)

**Status:** DESIGN COMPLETE + safe IP-side scaffolding implemented · **Date:** 2026-07-29

> Design + implementation package for a real local developer deployment where a developer runs
> `docker compose up --build` then `npm run functionaltest` with no manual infrastructure setup. **This is a
> real local deployment — same architecture, contracts, Runtime SPI, signing, evidence, and plane separation
> as production — not a mock and not a simulated Execution Plane.** Developer Mode differs from Production only
> in **deployment topology** and **provider implementations**; no production code path changes.

---

## Scope & boundaries (honest)

- **Freeze-compatible:** all Developer-Mode work is **additive and dev-scoped** — it changes no certified
  contract, domain, runtime bridge/SPI/composer, gateway, legacy runtime, governance gate, or production
  deployment. It is compatible with the PROGRAM-CLOSURE-001 freeze (which protects the certified core + production).
- **Sovereignty:** the **Developer Execution Plane runs the EP software, which lives in the Execution-Plane
  repository** (the separate, customer-owned plane). Its container image + service are **owned and delivered by
  the EP plane**, not authored into the Intelligence Plane. This design specifies the contract; it does not
  merge the planes.
- **Environment reality:** this authoring environment has no container runtime, so the end-to-end
  (`docker compose up` → real browser execution) is **not validated here** — no working demo is fabricated. The
  IP-side artifacts below are authored + statically/unittested; the running topology is validated by a
  developer with Docker + the EP-plane dev-EP image.
- **Implemented here (safe, additive, IP-side):** a `.devcontainer` and a **runtime-bindings generator**
  (`packages/functional-testing-engine/launcher/generator/`) with a self-check. Everything else is design/spec.

## 1. Developer Deployment Architecture

```
                     docker compose up --build            npm run functionaltest
developer machine ──────────────┬───────────────────────────────┬──────────────►
                                │                                │
  ┌── Intelligence Plane (image, existing) ──┐      ┌── canonical launcher (bootstrap pipeline) ──┐
  │  authors + ed25519-signs ExecutionPackage │      │  build → config → bindings → EP → runtime →  │
  │  Local providers (config/secret/state)    │      │  execute (Runtime SPI) → evidence → summary  │
  └───────────────────────┬───────────────────┘      └───────────────────────┬──────────────────────┘
                          │ signed package (HTTPS, real signature)            │ real dispatch
                          ▼                                                    ▼
  ┌── Developer Execution Plane (EP-plane image) ─────────────────────────────────────────────┐
  │  verifies the signature · executes a REAL browser against the DEV TEST APP · returns        │
  │  evidence BY REFERENCE (INV-1). Same EP software as production; developer-owned tenant.      │
  └───────────────────────┬──────────────────────────────────────────────────────────────────┘
                          ▼
  ┌── Dev Test Application (developer-owned target) ──┐
  └───────────────────────────────────────────────────┘
```

Same Runtime SPI, capability contracts, signing, evidence-by-reference, and **two-plane separation** as
production. Only the topology (local Compose) and provider implementations (Local vs Cloud) differ.

## 2. Docker Compose Enhancements (Workstream 1) — proposed, additive

The existing `docker-compose.yml` runs `intelligence-plane` + `redis` + `dbiz-state`. Add a **dev override**
(`docker-compose.dev.yml`, so production compose is untouched) with:

```yaml
# docker-compose.dev.yml  (additive override; never modifies production topology)
services:
  execution-plane-dev:            # image OWNED + published by the Execution-Plane repo (not the IP)
    image: ${DEV_EP_IMAGE}        # placeholder — supplied by the EP plane
    environment: [ EP_MODE=dev, EP_TENANT=developer-local ]
    healthcheck: { test: ["CMD","curl","-fsS","https://localhost:PORT/health"], interval: 10s }
  test-target-app:                # developer-owned test application the EP drives
    image: ${DEV_TEST_APP_IMAGE}
  intelligence-plane:             # existing service; select Local providers in dev
    environment:
      - DBIZ_PROVIDER_MODE=local  # platform-providers selects Local impls (config/secret/state)
      - FTE_EXECUTION_PLANE_ENDPOINT=https://execution-plane-dev:PORT
      - FTE_RUNTIME_BINDINGS=/app/generated/dev-bindings.mjs
# Compose provides the network + service DNS + healthchecks automatically.
```

No production change: production uses `docker-compose.yml` + `deploy/azure`; dev uses the override.

## 3. Developer Execution Plane (Workstream 2) — design; EP-plane-owned

A **real** Execution Plane instance: real signature verification, real Runtime SPI, real ed25519 signing
(dev key), real browser execution, real evidence — **no mocked requests, no simulated responses.** The *only*
difference from production is that the target application is the developer's own test app and the tenant is
`developer-local`. **The image and service definition are delivered in the Execution-Plane repository** (the
generated EP operational surface already exists there per ADR-0035); this IP design specifies the endpoint +
health + signature-verification + evidence-by-reference contract it must satisfy (docs 04/05/10/20, ADR-0007/0036).

## 4. Runtime Bindings Generator (Workstream 3) — IMPLEMENTED (IP-side) + self-checked

Manual binding authoring is replaced by generation from configuration. Implemented at
`packages/functional-testing-engine/launcher/generator/generateBindings.mjs`:

```
generateBindings({ executionPlaneEndpoint, signerModule, transportSendModule, providersModule,
                   locatorModule, requestModule }) → <source of a bindings module>
```

The emitted module imports **only** the canonical factories (`createRuntimeExecutionSpi`,
`createExecutionPlaneTransport`, `createCanonicalFunctionalTestingCapability`,
`createLiveApplicationStrategyAdapter`, `translateExecutionRequest`) and wires them to the concrete
dev/prod adapter modules named in the config, then exports `buildDependencies()` + `buildRequest()` —
**satisfying the existing launcher contract with no launcher change**. It emits **no legacy reference** and no
mock. A self-check verifies the generated module exports both functions, imports the canonical factories, and
contains no legacy symbols. (The concrete adapter modules — dev signer/transport/providers/locator — are
supplied by the dev topology; the generator produces the wiring, not those adapters.)

## 5. Automatic Bootstrap (Workstream 4) — design

A bootstrap script (invoked by the container entrypoint / a `predev` step, not a user command) that:
`start containers → wait for readiness (healthchecks) → validate EP health/connectivity → generate the dev
bindings (§4) into `/app/generated/dev-bindings.mjs` → set `FTE_*` env → hand off to the launcher’s existing
modular bootstrap pipeline (build → config → bindings → EP → runtime → execute → evidence)`. The developer runs
**no intermediate commands**; the launcher’s existing pipeline (FTL-001) performs validation + execution.

## 6. Local Provider Configuration (Workstream 5) — design; provider-plane-owned

`packages/platform-providers` already selects Local vs Cloud implementations by configuration
(Config/Secret/Storage/DistributedState; ADR-0060). Developer Mode sets `DBIZ_PROVIDER_MODE=local` so the dev
signing key comes from the **Local Secret provider** (real ed25519 signing, dev key — signing is **not**
removed), config/state from Local providers. **Production code paths are unchanged** — the same abstraction
selects Cloud providers in customer environments. (`platform-providers` is owned by the concurrent workstream;
this is a configuration-selection design, not a modification of that package.)

## 7. Developer Observability (Workstream 6) — design

Dev logging (the launcher already emits per-stage `[bootstrap]` logs + elapsed timing; the platform emits
telemetry with traceId/correlationId), local metrics/tracing via the observability package, a health/readiness
endpoint (`observability/src/health.ts`, R-23.30), and an optional local dashboard container in the override.
No new contracts — dev observability reuses the existing emitters.

## 8. Developer Documentation (Workstream 7)

- **Quick Start:** `git clone` (both planes) → `pnpm install` → provide the EP-plane dev-EP image →
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` → wait for healthy →
  `npm run functionaltest`.
- **Startup sequence:** compose network/DNS → EP + test-app healthy → IP up (Local providers) → bootstrap
  generates dev bindings → launcher pipeline runs → real signed dispatch → real browser → evidence → summary.
- **Common failures & recovery:** EP image missing → provide `DEV_EP_IMAGE` (from the EP plane); EP unhealthy
  → check its `/health`; bindings not generated → check the bootstrap log; signature rejected → confirm the
  dev trust anchor is published to the dev EP (ADR-0036); launcher exits 1 → read the staged summary’s
  Reason/Action.
- **Architecture diagram:** §1.

## Migration Plan (deliverable 7)

1. Land the IP-side additive scaffolding (`.devcontainer`, bindings generator — done; the `docker-compose.dev.yml`
   override + bootstrap script — proposed, additive). 2. EP plane publishes the dev-EP image + a dev test-app
   image. 3. Wire `DBIZ_PROVIDER_MODE=local` selection (provider-plane coordination). 4. Validate the full
   one-command flow on a machine with Docker. 5. Document + roll out. Each step additive; production untouched.

## Implementation Roadmap (deliverable 8)

| Item | Owner | Status |
|---|---|---|
| `.devcontainer` (toolchain) | IP (Functional Testing) | **implemented** |
| Runtime bindings generator + self-check | IP (Functional Testing) | **implemented** |
| `docker-compose.dev.yml` override | IP | designed (additive) |
| Automatic bootstrap script | IP | designed |
| Dev Execution Plane image + service | **Execution-Plane repo** | designed / handed off |
| Dev test application image | Execution-Plane / developer | designed |
| `DBIZ_PROVIDER_MODE=local` selection | provider-platform workstream | designed |
| End-to-end validation (`compose up` → browser) | requires Docker + dev-EP | **pending environment** |

## Should this be the standard onboarding model? — Assessment

**Yes — recommended as the standard onboarding model**, with two conditions. It gives every engineer a real,
production-faithful platform locally (same contracts/SPI/signing/evidence/plane-separation) via one command,
which is the strongest possible onboarding (developers exercise the real runtime, not a mock). Conditions:
(1) it depends on the **EP plane** publishing the dev-EP image + a dev test-app — a cross-plane commitment that
must be owned and maintained there; (2) it requires a container runtime on each developer machine (Docker) —
a reasonable, one-time prerequisite. It does **not** replace production governance: GA, the M5 cut-over, and
customer runs still require the real customer Execution Plane + approvals. Adopt it as the **developer
inner-loop** standard; keep production exactly as designed.

**No mock, no simulated Execution Plane, no weakened security, no plane merge, no Runtime-SPI/evidence bypass,
no production-deployment change.** GA remains NOT CERTIFIED; the legacy runtime remains the active production
path and rollback.
