# ADR-0033 — Production Web Tier for Tenant Onboarding

**Status:** ACCEPTED · **Date:** 2026-07-23
**Raised by:** the directive to deliver a production web application + backend APIs for the Tenant Creation Journey
**Affects:** [03](../architecture/03-intelligence-plane-architecture.md), `packages/onboarding-experience`, a new `packages/onboarding-web` (frontend), `program/`, `governance/supply-chain/`
**Builds on:** [ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md) (tenant.json SSOT) · [ADR-0031](ADR-0031-onboarding-experience-layer.md)
**Resolves a standing drift:** CHARTER §5a mandates **NestJS**, but no code used it (recorded in the session-16 audit). This ADR brings the first HTTP surface into compliance.
**Does not amend:** `onboard()`, the validation/certification pipelines, the six states, the SSOT, or the sovereignty invariants

---

## 1. Problem

The tenant experience needs a **production web tier** — a browser application and an HTTP API. Today there is:

- a **tested REST API** built on the Node standard library (`api.ts`, ADR-0032) — which **deviates from CHARTER §5a** (NestJS mandated);
- **no frontend** at all — only a self-contained prototype artifact, which is not a shippable application (no framework, bundler, routing, auth, or build).

Two decisions are unavoidable and must be recorded rather than defaulted: the **API framework** (reconciling the NestJS mandate) and the **frontend stack** (none is chosen).

## 2. Context

- **The domain is already framework-independent and tested.** The repository, resolver, experience orchestrator, and the pure `route()` function are plain TypeScript with dependency injection, verified by 15 tests including a live HTTP round-trip. Whatever framework is chosen is **transport/presentation only** — it wraps tested logic, it does not contain it.
- **The platform is deliberately dependency-minimal** (D-014, pinned deps, SBOM, reproducible build). A web tier is the largest dependency surface the platform will add; it must be pinned and SBOM-tracked like everything else.
- **The SSOT is fixed.** The frontend holds no business logic and no second configuration model; it reads/writes `tenant.json` only through the REST API (ADR-0032).

## 3. Alternatives

| Option | Rejected because |
|---|---|
| **Keep node:http** for the API | Violates CHARTER §5a; leaves the mandate permanently unmet |
| **Next.js** (fullstack React) | SSR/framework coupling the platform does not need; heavier; blurs the API/SPA boundary the SSOT model keeps clean |
| **SvelteKit** | Lighter, but a smaller enterprise hiring pool and ecosystem than React — maintainability over a decade (CHARTER §15) favours React |
| **Plain-JS SPA** (the prototype's approach) | Not maintainable at enterprise scale; no type safety across a large view surface |

The selected pairing — **NestJS** for the API and **React + Vite + TypeScript** for the frontend — is recorded in §4.

## 4. Decision

**Adopt a two-part web tier, with the domain layer unchanged beneath it.**

| Tier | Choice | Rationale |
|---|---|---|
| **API framework** | **NestJS** (CHARTER §5a) wrapping the tested `route()`/repository/resolver | Restores compliance with the standing mandate; DI matches the platform idiom; controllers are thin adapters over already-tested domain logic |
| **Frontend** | **React + Vite + TypeScript** | Enterprise ubiquity (hiring, ecosystem, long support), first-class TS, fast build; consumes the REST API only |
| **Domain** | **Unchanged** — repository, resolver, orchestrator, `route()` | Framework-independent, already tested; NestJS/React are wrappers |

| # | Rule | Enforcement |
|---|---|---|
| **R-33.1** | NestJS controllers SHALL be thin adapters over the tested domain; no business logic in a controller | controllers delegate to `route()`/repository; unit tests target the domain, not Nest |
| **R-33.2** | The frontend SHALL hold no tenant configuration and no business logic; it reads/writes only via the REST API (the SSOT) | no config model in the SPA; API-client contract test |
| **R-33.3** | Every new runtime dependency SHALL be pinned and SBOM-tracked (D-014, supply-chain) | pinned versions; SBOM regeneration in the same change |
| **R-33.4** | Both tiers SHALL build in CI on every commit (D-015) | CI adds the web build + the API build |
| **R-33.5** | The API SHALL enforce authentication/authorisation before production exposure | an auth gate is a precondition of "production" — tracked, not assumed |

## 5. Consequences

- **The §5a drift closes** — the platform's first HTTP surface uses the mandated framework.
- **The domain stays dependency-light and fully tested**; frameworks are confined to the edges.
- **New dependency surface** (NestJS, React, Vite) — pinned, SBOM-tracked, CI-built; the largest supply-chain addition to date, deliberately bounded to the web tier.
- **Auth/RBAC is a production precondition** (R-33.5), not an afterthought — the API is not "production" until it is authenticated.
- **Unchanged:** the SSOT, `onboard()`, validation, certification, the six states, and the Sovereign Split. GA remains **NOT CERTIFIED** (the container/EP-runtime dependency is untouched).

### Delivered with this ADR, and what remains

- **Delivered now:** a typed **`TenantApiClient`** — the SPA's data layer — verified end-to-end against the real API over HTTP (the full create→enrich→certify→activate journey to PROVISIONED). This de-risks the SPA build by fixing and testing the contract first.
- **Remaining (scoped next increments):** the NestJS bootstrap wrapping `route()`; the React/Vite SPA views (Dashboard, Wizard, Details, Configuration Viewer, Progress, Certification); auth; and the governance-suite integration outstanding since sessions 16–18. Each lands with pinned deps + tests; none is claimed done until built and verified.

## 6. Migration strategy

Bounded and additive. The domain layer (`route()`, repository, resolver, orchestrator) is unchanged, so the migration is confined to the edges: the node:http `api.ts` is superseded by a NestJS bootstrap that wraps the **same** tested `route()` — a transport swap, not a logic rewrite — and the React/Vite SPA is net-new. No runtime data migration is required: no tenant has been provisioned against a deployed runtime, and the SSOT format ([ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md)) is unchanged. Each new dependency is pinned and added to the SBOM in the same change (R-33.3), so the supply-chain baseline moves deliberately rather than drifting.

## 7. Version impact

No cross-plane contract version change: the execution-package, evidence, and SSOT contracts are untouched; the web tier is transport/presentation over already-versioned logic. Architecture document 03 gains an additive reference to the web tier as Platform Core internal structure. The material change is to the **supply-chain baseline** — NestJS, React and Vite are the largest dependency addition to date and are pinned and SBOM-tracked (`governance/supply-chain/`). CHARTER §5a's NestJS mandate moves from unmet to met; no rule is removed and no ownership reassigned.

## 8. Affected components

| Component | Change |
|---|---|
| `packages/onboarding-experience` | The tested `route()`/repository/resolver domain is retained unchanged and wrapped; a typed API client is added |
| `packages/tenant-onboarding-web` | The React + Vite + TypeScript single-page application (frontend only, no business logic) — originally created here as `onboarding-web`, later consolidated under this name by [ADR-0034](ADR-0034-tenant-onboarding-engine-refounding.md) |
| `packages/tenant-onboarding-web/package.json` | The pinned web-tier dependency manifest |
| [03 — Intelligence Plane Architecture](../architecture/03-intelligence-plane-architecture.md) | Additive reference to the production web tier as Platform Core internal structure |
| `governance/supply-chain/sbom.cdx.json` | Regenerated to record the new web-tier dependency surface |
| [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md) | Session addendum recording the web-tier decision and its outstanding increments |
