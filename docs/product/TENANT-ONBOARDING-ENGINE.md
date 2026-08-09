# Product Capability — Tenant Onboarding Engine

**Status:** ACTIVE · **Date:** 2026-07-23 · **Type:** Product-facing capability (feature catalogue)
**Supersedes the name:** "Tenant Onboarding Experience" (session-22 catalogue) — same capability, renamed at customer request
**Governed by:** [ADR-0030](../adr/ADR-0030-tenant-lifecycle-management-orchestration.md), [ADR-0031](../adr/ADR-0031-onboarding-experience-layer.md), [ADR-0032](../adr/ADR-0032-tenant-configuration-repository-ssot.md), [ADR-0033](../adr/ADR-0033-production-web-tier.md)
**Evidence base:** workflow `tenant-onboarding-consolidation-inventory` (9 agents, 0 errors) — inventory + adversarial delete-risk verification of all four modules

---

## 1. The single business capability

The platform exposes **exactly one** product-facing capability for the tenant journey:

> # Tenant Onboarding Engine

It owns, from the user's perspective: Welcome · Connect · Discovery · AI Recommendations · Review · Certification · Activation · and Tenant Management (view · edit configuration · manage integrations · enable/disable capability · run discovery · re-certify · suspend · reactivate · archive · delete).

Customers, administrators, menus, roadmaps and the product catalogue see **only this name**.

### 1a. What "Engine" does NOT mean here

**This is not a seventh certifiable capability engine.** The platform has exactly **six** certifiable quality-engineering capability engines (R-11.4, [11-capability-model.md](../architecture/11-capability-model.md)): functional-testing, dev-change, inverse-flow-discovery, performance, security-testing, penetration-testing — each in [`docs/capability/`](../capability/). "Tenant Onboarding Engine" performs **no** quality engineering against customer software and yields **no** certified verdict about it. "Engine" here names the **onboarding subsystem / product surface** of the Platform Core bounded context (ADR-0021) — the umbrella over the four internal modules below. The frozen six-capability count is unchanged.

## 2. Internal implementation modules (retained on evidence)

One product capability, **four cooperating internal modules — layered, with zero duplicated logic.** Module names are implementation details. The dependency direction was independently verified:

```
onboarding-web ─┐
                ├─► onboarding-experience ─► tenant-lifecycle
onboarding-api ─┘                 (core: onboard(), frozen states, schema, validation)
```

| Module | Runtime | Owns (unique) | Depends on |
|---|---|---|---|
| `@dbiz/tenant-lifecycle` | node-domain | `onboard()` orchestrator (`bootstrap-orchestrator.ts:86`) · six FROZEN canonical states (R-21.5, `lifecycle-state-machine.ts:23`) · `OnboardingConfiguration` schema + `validateConfiguration` · `validateOnboarding` + R-21.11 guard · INV-2 `CREDENTIAL_MARKERS` guard | platform-core, platform-runtime, zod |
| `@dbiz/onboarding-experience` | mixed | tenant.json SSOT repository · session · edge-discovery normalisers · AI-optional recommendations · REST `route()` + RBAC/`authz` + session tokens · `TenantManifestResolver` · dashboard/manifest-diff logic | **tenant-lifecycle** |
| `@dbiz/onboarding-api` | node-server | NestJS thin controllers over `route()` · health · Swagger · exception filter · logging (ADR-0033) | onboarding-experience, tenant-lifecycle |
| `@dbiz/onboarding-web` | browser | React/Vite SPA — Dashboard · 6-stage Wizard · Details · Config Viewer · auth/RBAC UI | onboarding-experience |

## 3. Migration reuse matrix (Moved / Refactored / Removed)

Independent adversarial delete-risk verification (per module):

| Module | Delete verdict | Dependents | Action |
|---|---|---|---|
| `@dbiz/tenant-lifecycle` | **UNSAFE-TO-DELETE** | onboarding-experience (value imports `onboard`, `validateOnboarding`, `CAPABILITIES_WITH_EXECUTION_PATH`), onboarding-api, governance gate `verify-tenant-lifecycle-conformance.js`, run-all.js:49 | **RETAIN in place** |
| `@dbiz/onboarding-experience` | **UNSAFE-TO-DELETE** | onboarding-api (value import of `route`), onboarding-web (value imports `TenantApiClient`/`queryDashboard`/`can`), platform-core `boundary.test.ts` allowlist | **RETAIN in place** |
| `@dbiz/onboarding-api` | leaf (no dependents) | none | **RETAIN** — deleting it removes the production NestJS/HTTP tier (ADR-0033) just built; a product regression, not a consolidation |
| `@dbiz/onboarding-web` | leaf (no dependents) | none | **RETAIN** — deleting it removes the React UI just built and demonstrated running |

**Moved: 0 · Refactored: 0 · Removed: 0.** Every module is retained in place; there is no duplicated logic to consolidate away (see §4).

## 4. Duplication analysis — classification

| Overlap area | Classification | Evidence |
|---|---|---|
| Orchestration | **Layered** — experience calls core `onboard()` | `experience-orchestrator.ts:15` imports `onboard` |
| Validation | **Shared** — one `validateOnboarding` | imported, not reimplemented |
| Config schema | **Shared** — SSOT embeds the one `OnboardingConfiguration` | ADR-0032 |
| State model | **Single** — six canonical states in the core only | `lifecycle-state-machine.ts:23` |
| Web/API vs domain | **Layered by runtime** — browser / node-server / node-domain | different runtimes; merging them would break the Sovereign Split |

**Genuine duplicates found: none.**

## 5. Validation report — full elimination is REFUSED (evidence-backed)

The request to delete all four packages after merging them into one is **refused as unsafe and self-contradictory**, on independently verified evidence:

1. **Self-contradiction.** `onboard()` is defined in `tenant-lifecycle` (`bootstrap-orchestrator.ts:86`, re-exported `index.ts:53`). "Remove Tenant Lifecycle source" deletes the definition of `onboard()`; "retain `onboard()` as the only orchestrator" requires it to survive. Both cannot hold.
2. **Deletes frozen architecture without an ADR.** `tenant-lifecycle` owns the six canonical states (FROZEN, R-21.5, Doc 21 §2) and `onboard()` (ADR-0030). ADR-0031/0032/0033 each explicitly *do not amend* the single orchestrator. Deleting the source silently amends a frozen document and three accepted ADRs (precedence: architecture > ADR > prompt).
3. **Cascading breakage.** Deleting `tenant-lifecycle` or `onboarding-experience` breaks live workspace dependents (value imports across api/web/experience) and a governance gate.
4. **Runtime merge is invalid.** A browser React module and the frozen Node domain cannot be one package.

**What is delivered instead (the safe consolidation):** the single business-capability **name** — "Tenant Onboarding Engine" — over the four retained, layered internal modules. **Documentation only; no package renamed, no module deleted, no code changed; zero regression** (onboarding stack green: tenant-lifecycle 23 + onboarding-experience 33 + onboarding-api 5, plus the web build/component test).

**Minor finding for the audit:** `tenant-lifecycle/package.json:18` declares `@dbiz/contracts` as a runtime dependency but no `src/` file imports it — a possibly-unused declared dependency (does not affect this consolidation).

## 6. Single Source of Truth (unchanged)

One canonical manifest — `tenants/<slug>/tenant.json` (ADR-0032) — consumed by the experience layer, `onboard()`, validation, and the Multi-Tenancy / Isolation / Configuration-Intelligence read views via the one `TenantManifestResolver`. No second tenant model exists.
