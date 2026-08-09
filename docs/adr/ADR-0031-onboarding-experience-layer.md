# ADR-0031 — Tenant Onboarding Experience Layer

**Status:** ACCEPTED · **Date:** 2026-07-23
**Raised by:** the directive to modernise tenant onboarding into a fast, AI-assisted, discovery-driven, self-service experience — within the Intelligence Plane only
**Affects:** [03](../architecture/03-intelligence-plane-architecture.md), [21](../architecture/21-tenant-lifecycle.md), [25](../architecture/25-customer-success-model.md), `packages/onboarding-experience`, `program/`
**Does not amend:** the frozen six-capability model ([11](../architecture/11-capability-model.md), R-11.4), the three Platform Services ([ADR-0018](ADR-0018-platform-services-and-programme-instruments.md)), the canonical tenant lifecycle states ([21](../architecture/21-tenant-lifecycle.md) §2), the single onboarding orchestrator ([ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md)), or the sovereignty invariants INV-2 / INV-3 / INV-9

---

## 1. Problem

A directive replaces the onboarding *experience* with a five-stage self-service journey — Welcome, Connect, Intelligent Discovery, AI Recommendations, Review & Certification, Activation — that is fast, discovery-driven, and asks the user for almost nothing technical. Three parts of the literal directive collide with frozen invariants, and each would be absorbed silently if not recorded:

1. **Discovery holding customer credentials in the Intelligence Plane.** "Connect" and "Intelligent Discovery" as stated have the IP take credentials and enumerate Jira/Azure DevOps/source-control/the application. That breaches **INV-2** (DBiz never receives a customer-system credential; the onboarding schema is structurally incapable of holding one — `onboarding-configuration.ts` CREDENTIAL_MARKERS scan) and **INV-3 / R-21.12** (the platform never dials into a customer tenancy; the EP always initiates).

2. **Naming an AI vendor.** The directive specifies the AI provider by naming commercial LLM products in the IP, which breaches **INV-9 / Rule 12 / [ADR-0016](ADR-0016-ai-tool-agnosticism.md)** — AI is expressed as capability classes, never a product, and the IP holds no AI key. The config's `ai.providerHandle` is deliberately opaque. [vendor-permitted: ADR records the directive's named-vendor list as the anti-pattern this decision rejects]

3. **A second onboarding engine.** A new "onboarding orchestrator" would contradict [ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md) R-21.47 (a single orchestrator) and the "one topic, one document / one workflow" rule (CHARTER §4).

## 2. Context

- **The orchestrator already exists and is reused unchanged.** `@dbiz/tenant-lifecycle` `onboard()` drives the seven Intelligence-Plane stages over the frozen six states; `validateOnboarding` is the single validation authority; the six-state machine and its 14-stage projection ([ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md) §4.3) are frozen. None of this is re-implemented.
- **The gap is experience, not orchestration.** Today onboarding is a library invoked by developers — no session, no discovery-assisted configuration, no recommendations, no UI. Filling that gap is additive.
- **Discovery has a sovereignty-safe home.** Credentialed enumeration executes at the **customer edge** (the customer's browser via OAuth+PKCE, or a customer-tenancy runner) which holds the token; the Intelligence Plane receives only *non-secret metadata* and normalises it into the existing customer-owned configuration columns. This is neither the IP holding a credential nor the EP participating in onboarding.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Implement the directive literally** — the IP holds discovery credentials, names the AI provider, and adds a new onboarding orchestrator | **Rejected.** Breaches INV-2 (the IP never holds a customer-system credential), INV-3 / R-21.12 (the platform never dials into a tenancy), INV-9 / [ADR-0016](ADR-0016-ai-tool-agnosticism.md) (AI named by product), and [ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md) R-21.47 (a single orchestrator). Each breach would be absorbed silently without this record. |
| **A seventh capability engine for onboarding** | **Rejected.** R-11.4 freezes the capability count at six; onboarding performs no quality engineering against customer software and yields no certified verdict, so under R-11.1 it is not a capability ([ADR-0018](ADR-0018-platform-services-and-programme-instruments.md)). |
| **Extend `onboard()` itself to carry the session, discovery and recommendations** | **Rejected.** It would fuse presentation with orchestration in the one module that must remain the single validation/orchestration authority, and would make the five UX stages canonical lifecycle states rather than a projection over the frozen six. |
| **An additive experience/assembly layer terminating in the existing `onboard()`, with credentialed discovery at the customer edge and an opaque AI advisor** | **Selected.** Fills the experience gap additively; preserves every frozen invariant; reconciles self-service discovery with sovereignty by keeping credential custody at the customer edge. |

## 4. Decision

**Introduce an additive experience/assembly layer, `@dbiz/onboarding-experience`, that assembles one `OnboardingConfiguration` and hands it to the existing `onboard()`.** It is a **platform-experience layer within the Platform Core / Customer Success surface — NOT a seventh capability (R-11.4) and NOT a fourth Platform Service (ADR-0021 §5).** It performs no quality engineering against customer software and yields no certified verdict about it.

| # | Rule | Enforcement |
|---|---|---|
| **R-31.1** | The experience layer SHALL terminate by invoking the existing `onboard()`; it SHALL NOT orchestrate the lifecycle itself | `activate()` calls `onboard()` exactly once; test "activation terminates in the existing onboard()" |
| **R-31.2** | Validation SHALL be the platform's own `validateOnboarding`; no validation is duplicated | `activate()` gates on `validateOnboarding`; certify-before-activate test |
| **R-31.3** | Activation SHALL NOT occur before certification succeeds | invalid config returns issues and does not call `onboard()`; negative test |
| **R-31.4** | Credentialed discovery SHALL execute at the customer edge; the IP receives non-secret metadata only (INV-2/INV-3) | discovery services are normalisers over an `EdgeDiscovery` seam that carries no credential; INV-2 field-scan test |
| **R-31.5** | AI SHALL be expressed as capability classes via an opaque advisor; recommendations SHALL be non-blocking with a deterministic fallback (INV-7/INV-9) | `Advisor` is provider-agnostic; `deterministicAdvisor` is the default; AI-off test |
| **R-31.6** | Capability recommendations SHALL be bounded by the execution-path guard (R-21.11) | `recommend()` filters against `CAPABILITIES_WITH_EXECUTION_PATH`; bounded-recommendation test |
| **R-31.7** | The layer SHALL hold no customer credential and no runtime contract | INV-2 scan; the module has no field capable of holding a secret |

The five UX stages are a **presentation projection** over the frozen lifecycle — the same overlay pattern ADR-0030 used for the 14-stage projection — not new canonical states.

## 5. Consequences

- **No architectural drift, conditional on R-31.1–7.** Nothing frozen changes: six capabilities, three services, six states, the 14-stage lifecycle, the single orchestrator, and INV-2/3/9 are all preserved.
- **The Sovereign Split gains an explicit customer-edge tier** for credentialed discovery — the reconciliation that lets self-service discovery exist without the IP holding a credential.
- **A production UI and a session HTTP API remain a separate, ADR-gated decision** — the platform has no web tier today; this ADR authorises the assembly layer and its contract, not a web-serving stack. That decision is now recorded in [ADR-0033](ADR-0033-production-web-tier.md).
- **What this does not change:** stages 8–14 still require the customer deployment and the Execution-Plane runtime + a container runtime; GA remains **NOT CERTIFIED**. This is an experience improvement to stages 1–7, not a deployability change.

### Governance integration (outstanding)

Per D-012 (declaration and enforcement are one atomic change), this ADR ships with `@dbiz/onboarding-experience` and its 7 passing conformance tests. The remaining, honestly-recorded integration steps — a dedicated onboarding-experience conformance gate with a recorded fault proof, registration in `run-all.js`, a re-cut closure baseline, the ADR index, and the programme-state update — are tracked in `PROJECT_STATE.md`. Until they land, the layer is verified by its own suite but is **not yet reflected in the platform governance baseline**, and the suite must not be reported as green with this package included until it is.

## 6. Migration strategy

None required — the layer is purely additive. `@dbiz/onboarding-experience` is a new package; no existing module, contract, canonical state, or orchestrator is modified. `onboard()` and `validateOnboarding` are consumed unchanged, so existing library callers continue to work untouched — the experience layer is an optional front door, not a replacement. Should a production web tier later expose this layer over HTTP, that is a separate, ADR-gated step (recorded in [ADR-0033](ADR-0033-production-web-tier.md)) and does not alter this contract.

## 7. Version impact

No cross-plane contract version changes: the execution-package and evidence contracts are untouched, and the onboarding schema gains no field capable of holding a credential (INV-2). Architecture documents 03, 21 and 25 gain additive references to the experience layer; none moves a rule or reassigns ownership. The capability count (6), the Platform Service count (3), and the six canonical states are unchanged. This ADR itself is the recorded, versioned home of the decision.

## 8. Affected components

| Component | Change |
|---|---|
| `packages/onboarding-experience` | **New** — session, edge-fed discovery normalisers, opaque AI advisor, and an experience orchestrator terminating in `onboard()` |
| [03 — Intelligence Plane Architecture](../architecture/03-intelligence-plane-architecture.md) | Additive reference to the experience/assembly layer within the Platform Core surface |
| [21 — Tenant Lifecycle](../architecture/21-tenant-lifecycle.md) | The five UX stages recorded as a presentation projection over the frozen six states |
| [25 — Customer Success Model](../architecture/25-customer-success-model.md) | The onboarding experience recorded as part of the customer-success surface |
| [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md) | Session addendum recording the layer and its outstanding governance integration |
