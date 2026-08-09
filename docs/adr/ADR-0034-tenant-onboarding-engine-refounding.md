# ADR-0034 — Re-founding Tenant Onboarding as the "Tenant Onboarding Engine"

**Status:** **ACCEPTED** — 2026-07-23 (customer sign-off "accept and proceed"); §6 migration authorised and in execution
**Date:** 2026-07-23
**Raised by:** customer directive to delete the entire tenant-onboarding feature and re-found it as a single "Tenant Onboarding Engine"
**Supersedes:** the **packaging/structure** established by [ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md) §4, [ADR-0031](ADR-0031-onboarding-experience-layer.md), [ADR-0033](ADR-0033-production-web-tier.md) (the four-module split), and amends [21-tenant-lifecycle.md](../architecture/21-tenant-lifecycle.md) to point the lifecycle implementation at the new engine
**Explicitly does NOT amend (constitutional — preserved and re-satisfied by the rebuild):** the six canonical states (R-21.5), R-11.4 (exactly six certifiable capabilities), INV-2 / INV-3 / INV-9, the SSOT model ([ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md)), validate-before-create, and never-`ACTIVE`-on-assumption (R-21.29)

---

## 1. Problem

The tenant journey is implemented as four layered packages — `tenant-lifecycle` (frozen domain: `onboard()`, six states, schema, validation), `onboarding-experience` (SSOT + REST + RBAC), `onboarding-api` (NestJS), `onboarding-web` (React). The customer directs a **clean re-founding** into a single **"Tenant Onboarding Engine."**

A full delete-and-rebuild touches **FROZEN architecture** (Doc 21) and four ACCEPTED ADRs, so it **cannot proceed on a prompt** (precedence: architecture > ADR > prompt). This ADR is the governed instrument that (a) supersedes the frozen *structure*, (b) fixes what the rebuild must *preserve*, and (c) authorizes the teardown once accepted.

## 2. Context

- **What exists today** (verified by the `tenant-onboarding-consolidation-inventory` workflow, 9 agents): four layered modules, ~61 green tests, a running NestJS API + React UI, the canonical SSOT (`tenants/<id>/tenant.json`), a governance gate (`verify-tenant-lifecycle-conformance.js`, gating in `run-all.js`), and references across Doc 21 + ADR-0030/31/32/33.
- **The founding constraint.** The predecessor platform failed as *"architecturally sound and implementationally non-conformant"* (PROJECT_STATE §3). The invariants below are the difference between conformant and not. **A rewrite that discards them does not modernise the platform — it regresses it to the exact failure this programme exists to prevent.**
- **Runtime is a hard boundary.** A browser (React) module and a Node domain cannot be one package. "One engine" therefore has a floor of **two** packages (a Node engine + a browser UI), no matter how clean the slate.

## 3. Decision

**Authorize a fresh Tenant Onboarding Engine, under two non-negotiable conditions.**

### 3.1 MUST preserve (re-satisfied by the rebuild; enforced by re-cut gates)

| # | Invariant | Why |
|---|---|---|
| P1 | Six canonical states (R-21.5); only `ACTIVE` permits execution; never `ACTIVE` without stages 10–12 (R-21.29) | tenant safety; a suspended tenant must not execute |
| P2 | INV-2 — no customer credential in the IP (structural, `CREDENTIAL_MARKERS`-style guard) | sovereignty |
| P3 | INV-3 — the Execution Plane always initiates; the platform never dials in | sovereignty |
| P4 | INV-9 — AI as capability classes, never a named vendor in the IP | tool-agnosticism |
| P5 | One canonical SSOT at `tenants/<id>/tenant.json`; no second tenant model | ADR-0032 |
| P6 | R-11.4 — exactly six certifiable capabilities; the Engine is a **product surface, not a seventh capability** | capability model |
| P7 | validate-before-create; `onboard()` drives stages 1–7 and reports 8–14 PENDING with reasons | inherited-failure guard |

### 3.2 MAY be replaced

The four-package split; the internal module APIs; the specific implementations of the orchestrator, repository, REST layer, and UI; the NestJS/React choices.

### 3.3 Target structure (recommended; open to revision before acceptance)

Consolidate the **four** onboarding packages into **two**, bounded by runtime:

- **`@dbiz/tenant-onboarding-engine`** (Node) — one bounded context: domain (`onboard()`, states, schema, validation) + SSOT repository + REST/authz surface. Continues to reuse `@dbiz/platform-core` (generation) and `@dbiz/platform-runtime` (identity) — those are separate frozen shared packages, **not** in scope for deletion.
- **`@dbiz/tenant-onboarding-web`** (browser) — the SPA. Separate by runtime necessity (P3 / clean architecture).

## 4. Alternatives considered

| Option | Disposition |
|---|---|
| Keep four modules, rename catalogue only (session 26) | Rejected by customer |
| Reset only the leaf packages (api + web) | Offered; customer chose full re-founding |
| Fix in place | Offered; customer chose re-founding |
| **Full re-founding via this ADR** | **Chosen** |

## 5. Consequences (stated honestly)

- **Deliberate loss of working, tested, conformant code** — ~61 green tests, the running API + UI. This is churn the CHARTER (§15, §17.2) warns against; it is accepted here as an explicit customer product decision, recorded so it is auditable rather than silent.
- **The clean domain/experience/server layering is collapsed** into one engine package — a trade of testable-in-isolation layering for product-naming cohesion. Recorded as a known cost.
- **Governance must be re-baselined** — the conformance gate re-pointed, the closure baseline re-cut, `run-all.js` updated; the platform is **NOT CERTIFIED** during the rebuild window.
- **Primary risk:** the rebuild must *re-earn* conformance to P1–P7 or it regresses to the predecessor's failure mode. The re-cut gates are what hold that line.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

1. **Accept this ADR** (customer sign-off) and amend Doc 21 (add the ADR-0034 supersession note).
2. **Scaffold** `@dbiz/tenant-onboarding-engine` + `@dbiz/tenant-onboarding-web` with P1–P7 gates written **first** (declaration-and-enforcement in one change, D-012).
3. **Rebuild** the engine + UI against those gates; port the SSOT format unchanged (P5).
4. **Delete in dependency order** (leaves first): `onboarding-web` → `onboarding-api` → `onboarding-experience` → `tenant-lifecycle`; remove their tests, the old gate, and stale lockfile entries.
5. **Re-cut governance** — new conformance gate + fault proof, `run-all.js`, closure baseline, ADR index; re-run the suite to green.
6. **Update** the product catalogue (`docs/product/TENANT-ONBOARDING-ENGINE.md`) and PROJECT_STATE.

## 7. Version impact

This ADR changes no cross-plane contract and no runtime schema: the SSOT format ([ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md)), the execution-package and evidence contracts, and the six canonical states are all preserved (P5, P1). What it version-impacts, **on acceptance**, is **structural**: it supersedes the packaging established by [ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md) §4, [ADR-0031](ADR-0031-onboarding-experience-layer.md) and [ADR-0033](ADR-0033-production-web-tier.md) (the four-module split), amends [21-tenant-lifecycle.md](../architecture/21-tenant-lifecycle.md) to point the lifecycle implementation at the new engine, and forces a re-cut of the closure baseline and the conformance gate. None of these structural changes lands on disk except as §6 executes in dependency order; until each step runs, this ADR changes nothing beyond its own record (see §6 and the Gate below). The capability count (6, R-11.4) and the Platform Service count are unchanged in every case.

## 8. Affected components

The engine is a **product surface, not a seventh capability** (P6); on acceptance the affected components are:

- `packages/tenant-lifecycle`, `packages/onboarding-experience`, `packages/onboarding-api`, `packages/onboarding-web` — deleted in dependency order (leaves first)
- new `packages/tenant-onboarding-engine` (Node) and `packages/tenant-onboarding-web` (browser) — scaffolded with P1–P7 gates first
- [21 — Tenant Lifecycle](../architecture/21-tenant-lifecycle.md) — amended to point the lifecycle implementation at the new engine
- [ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md), [ADR-0031](ADR-0031-onboarding-experience-layer.md), [ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md), [ADR-0033](ADR-0033-production-web-tier.md) — superseded in part (packaging/structure only)
- `governance/verification/` conformance gate + fault proof, `governance/closure/` baseline — re-cut; `program/` state and the product catalogue — updated
- the `tenants/` SSOT tree — format preserved unchanged (P5)

---

**Gate:** No file is deleted and no package is scaffolded until this ADR is moved from PROPOSED to ACCEPTED. On acceptance, §6 executes in order.
