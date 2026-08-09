# ADR-0032 — Tenant Configuration Repository (Canonical JSON SSOT)

**Status:** ACCEPTED · **Date:** 2026-07-23
**Raised by:** the directive to make the tenant configuration the single source of truth throughout onboarding — created at Stage 1, enriched progressively, consumed by `onboard()`
**Affects:** [21](../architecture/21-tenant-lifecycle.md), [15](../architecture/15-configuration-model.md), [19](../architecture/19-repository-ownership.md), `packages/onboarding-experience`, `tenants/`, `program/`
**Builds on:** [ADR-0031](ADR-0031-onboarding-experience-layer.md) (experience layer) · [ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md) (single orchestrator)
**Does not amend:** `onboard()`, the validation/certification pipelines, the six canonical states, the runtime contracts, or the sovereignty invariants (INV-2/INV-3/INV-9)

---

## 1. Problem

The [ADR-0031](ADR-0031-onboarding-experience-layer.md) experience layer assembled a configuration from a **session** at the end of the journey. The directive requires the opposite ordering: create the tenant configuration **at Stage 1** and treat it as the **single source of truth (SSOT)**, enriched by every later stage, consumed by `onboard()` — with no transient model, no duplicate state, and no mapper.

Two parts of the literal directive collide with frozen rules:

1. **`tenant.id: "carlisle-prod"`.** The example identity encodes the customer name. **R-21.3** forbids a tenant identifier that encodes meaning. Resolved: the folder **slug** may be human (`carlisle-prod`); the identity is an opaque `tenantId` (`tnt-…`) that onboard() uses.

2. **"onboard() consumes the same tenant.json, no mapper" vs "onboard() unchanged."** `onboard()` accepts an `OnboardingConfiguration`. A tenant.json shaped differently would force a mapper — the thing the directive forbids. Resolved: the SSOT **embeds** the canonical `OnboardingConfiguration` as its `configuration` region, so onboard() reads it verbatim.

## 2. Context

- **The configuration shape is frozen and reused.** `onboard()` and `validateOnboarding` consume an `OnboardingConfiguration` ([ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md), [ADR-0031](ADR-0031-onboarding-experience-layer.md)). Whatever the SSOT is, it must present that shape unchanged so no mapper is introduced.
- **The tenant registry and lifecycle are IP-owned** ([19](../architecture/19-repository-ownership.md)). A tenant configuration repository therefore has a sovereignty-safe home inside the Intelligence Plane, provided it holds no customer credential (INV-2) and no customer runtime asset.
- **The store must be substitutable.** A file tree is Git-versionable and human-diffable, which suits an SSOT that a customer or operator inspects; a durable datastore is a later deployment concern. The decision must not hard-wire either, so the store is expressed behind an interface.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Keep the transient session model and map it to `onboard()`'s shape at the end** | **Rejected.** The directive forbids a mapper and a second configuration model; two shapes for one truth is the divergence [ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md) R-21.47 and CHARTER §4 exist to prevent. |
| **`tenant.id` encoding the customer name (`carlisle-prod`)** | **Rejected.** R-21.3 forbids an identifier that encodes meaning. Resolved by separating a human **slug** (folder label) from an opaque `tenantId` (`tnt-…`). |
| **A database-backed tenant store now** | **Rejected for now.** It adds a persistence dependency ahead of the deployment-topology decision. Durability at scale is real but is surfaced by the injectable store interface rather than decided here. |
| **A `tenants/<slug>/tenant.json` envelope embedding the canonical `OnboardingConfiguration` verbatim, behind an injectable store** | **Selected.** One file is the truth from Stage 1 to activation; onboard() reads the embedded `configuration` region unchanged; the file tree is Git-versionable and holds no credential. |

## 4. Decision

**Introduce a Tenant Configuration Repository — `tenants/<slug>/tenant.json` — as the canonical SSOT, owned by the Intelligence Plane (tenant registry & lifecycle are IP-owned, Doc 19).** The file is an envelope with three bands:

| Band | Owns | Read by |
|---|---|---|
| `configuration` | the **canonical** `OnboardingConfiguration` (customer, technologyProfile, dbiz, customerOwned) | `validateOnboarding` + `onboard()`, **verbatim** |
| `onboarding` | orchestration: opaque `tenantId`, slug, status, currentStage, progress, audit, lifecycleState | Tenant Management, UI |
| `provenance` | what discovery/recommendation observed; certification verdict | UI, audit |

| # | Rule | Enforcement |
|---|---|---|
| **R-32.1** | The tenant.json SHALL be created at Stage 1 completion, with an audit event, before onboarding continues | `createFromWelcome`; Stage-1 test |
| **R-32.2** | Every later stage SHALL enrich the SAME file; no second configuration model exists | `enrich*` methods; "one file" test (`store.list().length === 1`) |
| **R-32.3** | `onboard()` SHALL consume `configuration` directly — no mapper, no transformation | `activate` passes `env.configuration` to `onboard()`; reuse test |
| **R-32.4** | The tenant identity SHALL be opaque (R-21.3); the slug is a human label only | `newTenantId` mints `tnt-…`; opaque-id test |
| **R-32.5** | The session SHALL hold orchestration metadata only (step, progress, locks, activity, resume); it SHALL NOT own configuration | slimmed `OnboardingSession`; migration test |
| **R-32.6** | The SSOT SHALL support export / import / clone, and be Git-versionable | `FileTenantConfigStore` writes pretty JSON; export/import/clone tests |
| **R-32.7** | No customer credential SHALL appear in the SSOT (INV-2) | CREDENTIAL_MARKERS scan over `configuration` |

## 5. Consequences

- **Configuration-driven, zero duplication.** One file is the truth from Stage 1 to activation; onboard() reads it unchanged; the session no longer owns config. Tenant Management lists tenants straight from the repository the instant Stage 1 completes.
- **No architectural drift.** onboard(), validation, certification, the six states, and the runtime contracts are untouched. The SSOT embeds the frozen configuration shape rather than replacing it.
- **Store is injectable.** `FileTenantConfigStore` writes the real `tenants/` tree (Git-versionable, human-diffable); `InMemoryTenantConfigStore` backs tests. Durability at scale is the deployment concern the interface surfaces.
- **Unchanged boundary.** Stages 8–14 still need the customer deployment + EP runtime + a container runtime; GA remains **NOT CERTIFIED**.

### Governance integration (outstanding)

Ships with `@dbiz/onboarding-experience` and its **10 passing tests** (build clean under the strict tsconfig). The remaining, honestly-recorded steps — an onboarding-experience conformance gate with a recorded fault proof, registration in `run-all.js`, a re-cut closure baseline, and the ADR index (→ 0031, 0032) — are tracked in `PROJECT_STATE.md`. Until they land, the layer is verified by its own suite but is **not yet reflected in the platform governance baseline**; the suite must not be reported green with this package counted until it is.

## 6. Migration strategy

Additive, with one bounded internal migration. The `tenants/` tree and `FileTenantConfigStore` are new; `onboard()`, `validateOnboarding`, the six states, and the runtime contracts are untouched. The one behavioural change is internal to the experience layer: the `OnboardingSession` is slimmed to orchestration metadata and no longer owns configuration (R-32.5), which is covered by a migration test. No customer data migration is required because no tenant has been provisioned against a deployed runtime; the SSOT is the first persisted representation, not a replacement for an existing one.

## 7. Version impact

No cross-plane contract version change: the execution-package and evidence contracts are untouched, and the embedded `configuration` region is the frozen `OnboardingConfiguration` shape read verbatim. Architecture documents 21, 15 and 19 gain additive references to the SSOT; none moves a rule or reassigns ownership — the tenant registry remains IP-owned per Doc 19. The capability count, Platform Service count, and canonical states are unchanged.

## 8. Affected components

| Component | Change |
|---|---|
| `packages/onboarding-experience` | **New** SSOT machinery — `TenantConfigStore` interface, `FileTenantConfigStore`, `InMemoryTenantConfigStore`, `createFromWelcome`/`enrich*`, opaque `tenantId` minting |
| `tenants/` | **New** — the on-disk canonical tenant configuration repository, laid out as one tenant.json per slug directory |
| [21 — Tenant Lifecycle](../architecture/21-tenant-lifecycle.md) | Additive reference to the SSOT as the configuration carried through the frozen states |
| [15 — Configuration Model](../architecture/15-configuration-model.md) | Additive reference: the tenant SSOT as the onboarding configuration's canonical home |
| [19 — Repository Ownership](../architecture/19-repository-ownership.md) | Additive reference confirming IP ownership of the tenant registry |
| [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md) | Session addendum recording the SSOT and its outstanding governance integration |
