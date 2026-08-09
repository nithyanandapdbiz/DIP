# ADR-0039 — Re-founding the Functional Testing capability from first principles

**Status:** **ACCEPTED** — 2026-07-28 (customer sign-off, conditional on the fourteen §4.6 capability contracts, now incorporated). §6 authorised; executes gate-first, domain-by-domain, replacement certified before removal.
**Date:** 2026-07-28
**History:** PROPOSED 2026-07-28 (authoring-scoped) → PROPOSED 2026-07-28 (expanded to thirteen domains) → **ACCEPTED 2026-07-28** with the §4.6 contracts.
**Raised by:** customer directive — a complete, governed re-foundation of the Functional Testing capability's internal implementation, covering the full autonomous testing lifecycle (tenant/application/story/design/repository/test-management/automation/execution/healing/defect/synchronisation/reporting), not authoring alone; discard the internal implementation, not the capability; preserve every frozen invariant.
**Supersedes (in part):** [ADR-0022](ADR-0022-functional-testing-engine-internal-structure.md) — its *"implementation is deferred"* posture (§4) and the specifics of the current internal structure, **retaining unchanged** its three constitutional findings (the governance triad must be implemented; Repository Intelligence is an Execution-Plane stage; adapters are the only locus of variation).
**Builds on:** [ADR-0038](ADR-0038-execution-authoring-intent-conservation.md) — the rebuild adopts intent conservation (P-38) as a birth constraint. Authoring is **one of thirteen** domains re-founded here, not the whole of it.
**Explicitly does NOT amend (constitutional — preserved and re-satisfied by the rebuild):** R-11.4 (exactly six certifiable capabilities), R-12.18 / R-12.1 (one orchestration lifecycle, no bypass), the twelve-stage lifecycle and its governance triad (R-12.2), R-11.12 / R-11.15 / R-11.16 (an incomplete capability is unrepresentable; no stubbed stage), INV-1 / INV-2 / INV-3 / INV-9 (sovereignty and AI tool-agnosticism), R-13.1 (evidence over assertion), and the execution-package / evidence cross-plane contracts.

---

## 1. Problem

The customer directs a **complete, first-principles re-foundation of the Functional Testing capability's internal implementation** — the entire autonomous lifecycle from tenant resolution through release-readiness certification, owned by the capability end-to-end. The intent is explicitly broader than authoring: it is to rebuild every internal functional domain (tenant resolution, application strategy, story intelligence, test design, repository intelligence, test-management intelligence, automation intelligence and architecture, execution intelligence, healing, defect intelligence, synchronisation, executive reporting) to a production-grade, deterministic, AI-optional, tool-agnostic, application-aware, zero-human-intervention standard behind one command (`npm run functional`).

A literal "discard everything and rebuild" **cannot proceed on a prompt**, for the same reason ADR-0034 could not: the capability is not a free-standing feature but **capability 1 of the six frozen capabilities (R-11.4)**, and its workflow is bound to the **one frozen orchestration lifecycle (R-12.18)**. A rewrite that discards the invariants below regresses the platform to the "architecturally sound, implementationally non-conformant" failure this programme exists to prevent (PROJECT_STATE §3, R-11.14). This ADR is the governed instrument that (a) records what warrants rebuilding versus what the directive's own goals require preserving, (b) fixes the invariants the rebuild must re-satisfy, (c) decomposes the capability into thirteen internal functional domains mapped onto the twelve stages, and (d) authorises the teardown **once accepted**.

## 2. Context

**What exists today, verified against disk (CHARTER §3).** The Functional Testing capability is implemented at `packages/functional-testing-engine/` — principally `src/capability.ts` and `src/orchestrators.ts`, the domain model at `src/model.ts`, the adapter SPIs at `src/adapters.ts`, the automation emitter at `src/emitters/executable-automation.ts`, and the deterministic authoring bridge at `authoring-bridge.mjs`. It is **not a legacy stub**: it already implements the twelve stages in order, runs the canonical planning sequence through adapter SPIs, implements the governance triad (stages 4–6), gates every agent proposal behind an AI-optional reasoning mode, records agents-invoked as *derived* evidence, and refuses to let any orchestrator learn which provider answered. Its live path completes end-to-end.

**So the directive's premise is only partly borne out, and the correction matters for scope.** There is **one** orchestration path (R-04.5) and **no** parallel legacy engine or duplicate orchestrator on disk to delete. What the capability actually needs is not de-duplication but **depth**: several internal domains are shallow relative to the standard the directive sets — authoring (the *972-candidate → 1-navigate* collapse root-caused by the Enterprise Architecture Review and under remediation by ADR-0038), and, to varying degrees, test-design breadth, repository reuse fidelity, healing beyond locator replacement, defect root-causing, synchronisation completeness, and executive reporting. This ADR therefore re-founds the **internal depth of all thirteen domains**, with intent conservation as the authoring spine.

**The directive's 42-stage pipeline is a business workflow, not a second lifecycle.** Read as a competing state machine it violates R-12.18 and **omits the governance triad** (no Architecture / Policy / Guardrail Review among its forty-two steps) — the identical finding ADR-0022 recorded against the earlier eighteen-stage list. The thirteen domains below are therefore implemented as **internal structure mapped onto the twelve stages** (§4.4), never as their own workflow.

**Runtime and sovereignty are hard boundaries.** The capability spans the sovereign split: IP owns stages 1, 4–7, 10–12; the Execution Plane owns 2, 3, 8, 9 and never surrenders customer source or credentials (INV-1/2/3). "Rebuild the capability" is bounded to the Intelligence-Plane package; the Execution-Plane runtime is a separate repository and a separate change ([19 — Repository Ownership](../architecture/19-repository-ownership.md)).

## 3. Alternatives

| Option | Disposition |
|---|---|
| **Big-bang discard now** — delete the engine + "legacy" code on the prompt, rebuild the 42-stage pipeline literally | **Rejected.** Deletes frozen, working, governed code (R-11.4) on a prompt (precedence: architecture > ADR > prompt); the 42-stage pipeline is a second lifecycle bypassing the governance triad (R-12.18, R-12.2); destroys the single source of truth. The predecessor failure re-run at scale. |
| **Authoring-only re-foundation (the prior draft of this ADR)** | **Superseded by this revision.** Correct but too narrow — it addressed the 972→1 authoring collapse and left the other twelve domains at current depth. The customer's objective is the complete capability. |
| **Amend the twelve-stage lifecycle to the 42 stages** | **Rejected.** The lifecycle is shared by all six capabilities; re-cutting it for one fractures the others or forces five capabilities through inapplicable stages (R-12.18, ADR-0022 §3). |
| **Introduce a Healing / Reporting / Automation capability** (the directive says "Healing shall become a dedicated capability within the Functional Testing Capability") | **Rejected as a *platform* capability; accepted as an *internal* domain.** R-11.4 fixes the count at six. "A dedicated capability within the Functional Testing Capability" is read as a **dedicated internal domain/sub-engine** owned by capability 1 — precisely what R-12.18 permits. |
| **Re-found all thirteen internal domains from first principles, in place, behind the frozen twelve-stage boundary, under MUST-preserve invariants, with governed replace-then-remove cleanup, teardown gated on acceptance** | **Chosen.** The only reading of the directive that delivers the complete end-to-end standard without regressing conformance. |

## 4. Decision

**Authorise a from-first-principles re-foundation of the Functional Testing capability's internal implementation across all thirteen functional domains** — in place in `packages/functional-testing-engine/` — under the invariants of §4.1. The re-foundation is **internal structure of one capability**, mapped onto the twelve stages (§4.4) as R-12.18 permits; it creates **no seventh capability and no second lifecycle**.

### 4.1 MUST preserve (re-satisfied by the rebuild; enforced by re-cut gates)

| # | Invariant | Why |
|---|---|---|
| P1 | R-11.4 — exactly six certifiable capabilities; every domain below is internal to capability 1, not a seventh | capability model |
| P2 | R-12.18 / R-12.1 — one orchestration lifecycle; the 42-stage business workflow and the thirteen domains map onto the twelve stages (§4.4); no stage bypassed | one lifecycle |
| P3 | R-12.2 — the governance triad (stages 4 Architecture, 5 Policy, 6 Guardrail Review) is implemented, though the directive's list omits it | no ungoverned capability |
| P4 | R-11.12 / R-11.15 / R-11.16 — an incomplete capability is unrepresentable; no stage is stubbed to a no-op; registration fails if any stage is absent | anti-stub (the R-11.14 predecessor failure) |
| P5 | R-13.1 — every emitted status derives from observed evidence; agents-invoked, outcomes, coverage and metrics are *derived*, never asserted | evidence over assertion |
| P6 | P-38 (ADR-0038) — Stage 7 conserves selected execution intent: every candidate is accounted for by a typed disposition (Σ dispositions == candidate count) or the plane emits a typed `proceed:false` refusal; never a reduced package as success | intent conservation |
| P7 | INV-1/2/3 — customer source and credentials never leave the Execution Plane; Repository Intelligence, Execution and Evidence are EP stages; the platform never dials in | sovereignty |
| P8 | INV-9 — AI is specified by capability class, tools by adapter SPI; no vendor, model or provider name inside the capability or any governed document; AI-optional so no stage fails when AI is absent | tool- and AI-agnosticism |
| P9 | Connector-only variation — project / test-management / automation / execution / authentication / reporting reached only through SPIs; no `if (provider)` branch in orchestration; application-type strategy resolved from tenant configuration | tool- and application-agnosticism |
| P10 | One command, zero human intervention — `npm run functional` drives tenant resolution → executive reporting; the same one path serves UI and CLI (R-04.5) | zero-touch entry point |
| P11 | Configuration Intelligence — every routing decision (application type, authentication, execution strategy, thresholds) is resolved from tenant configuration; no hardcoded routing | config-driven |
| P12 | Decision Intelligence — every intelligence domain has a deterministic implementation (rule engines, decision tables, coverage/similarity algorithms); AI enhances, never gates | AI-optional determinism |
| P13 | Multi-tenancy, tenant isolation, data isolation, Zero Trust, security-by-design, encryption in transit and at rest — no cross-tenant sharing, no platform-owned customer secrets, no customer data in the Intelligence Plane; immutable audit on every stage | tenant safety & security |

### 4.2 MAY be replaced (what "rebuild from first principles" authorises)

The internal orchestrator/agent/domain decomposition and their APIs; the deterministic authoring, reuse-scoring, similarity/coverage, test-design, healing, defect-root-cause and reporting algorithms; the emitter structure; the adapter implementations behind the SPIs; and any residual dead code, unused utility, dormant flag, obsolete adapter, deprecated service, experimental path, unused configuration/test/package or stale documentation surfaced during the rebuild (removed under §6, replacement-certified-first). The capability's public contract (id, twelve stages, evidence classes, required adapters, certification criteria) is preserved in shape and **may expand additively** (e.g. authentication/automation/reporting adapters added to `requiredAdapters`) as a within-capability change governed by this ADR — never a cross-plane contract or lifecycle change.

### 4.3 Connector architecture (P9 made concrete)

All tool and application variation lives behind Service Provider Interfaces resolved dynamically from tenant configuration. Orchestration never names or branches on a provider. Six connector families:

| Connector | Resolves | Examples (adapter implementations, never orchestration branches) |
|---|---|---|
| **Project** | stories, requirements, work items, traceability links | Azure DevOps · Jira |
| **Test Management** | plans/suites or cycles/folders, existing tests, association, result sync | Azure DevOps Test Plans · Zephyr Essential · Zephyr Scale |
| **Automation** | feature/step/POM/locator assets, execution driver | the browser/API/desktop/mobile automation runners |
| **Authentication** | the tenant's identity/sign-in strategy | identity-provider sign-in · application-specific auth (e.g. a CRM's dedicated flow) |
| **Application Strategy** | navigation, locator and execution strategy per application type | Web · API · CRM · SAP · Desktop · Mobile · ServiceNow · Oracle |
| **Reporting** | executive report emission and distribution | dashboard · document formats |

A new provider or application type is added as an adapter behind an existing SPI — **never** a workflow branch (P9, [14 — Tool Operating Model](../architecture/14-tool-operating-model.md)).

### 4.4 The thirteen functional domains, mapped onto the twelve stages

The directive's forty-two steps and the thirteen domains are internal structure. They map onto the twelve canonical stages (extending, never redefining, R-12.18); the mapping repairs the governance-triad omission:

| # | Functional domain (rebuilt from first principles) | Twelve-stage home | Plane |
|---|---|---|---|
| 1 | **Tenant Resolution** — tenant → execution/security context → capability config → governance policies → application type → authentication & execution strategy, all config-driven (P11) | **1 Planning** + cross-cutting governance/security checkpoints on every stage | IP |
| 2 | **Application Strategy** — application-type-specific navigation/locator/execution, resolved from config, applied by adapters (P9) | resolved in **1 Planning**; applied across **7/8** | IP + EP |
| 3 | **Story Intelligence** — discovery, acceptance-criteria & requirement extraction, dependency/business-rule/risk identification, coverage & impact analysis (AI-enhanced, deterministically-grounded) | **1 Planning** | IP |
| 4 | **Test Design Intelligence** — BVA, equivalence partitioning, decision tables, state transition, pairwise/combinatorial, risk-based, negative, use-case, error-guessing, plus accessibility/security/performance/mutation suggestions — each with a deterministic implementation (P12) | **6 Guardrail Review** → **7 Execution Planning** | IP |
| 5 | **Repository Intelligence** — search existing cases/features/steps/POM/components/locators + historical executions/failures/bugs/coverage; semantic match, similarity, duplicate detection, coverage comparison, reuse decision; reuse-before-generate mandatory | **2 Discovery** (search) + reuse decision in **7** | **EP** (search) / IP (decide) |
| 6 | **Test Management Intelligence** — cases → plan/suite or cycle/folder → association → traceability → result sync, tool-agnostic via the Test-Management connector | **7 Execution Planning** (author/associate) + **12 Reporting** (sync) | IP |
| 7 | **Automation Intelligence** — search feature/BDD/step/POM/locator/shared assets; generate only what is missing; reuse everything else | **7 Execution Planning** | IP |
| 8 | **Automation Architecture** — features organised by business module/application area (not by story); each feature → dedicated steps, POM, locator repository, reusable components; full story→requirement→case→automation→execution→bug→release traceability | **7 Execution Planning** (emitters) | IP |
| 9 | **Execution Intelligence** — scheduling, environment resolution, parallelism, retry, dependency resolution, execution ordering, evidence collection, optimisation; outcomes observed, never invented | **8 Execution** + **9 Evidence** | **EP** |
| 10 | **Healing Intelligence** — proactive/reactive/self/predictive healing, auto-correction, locator/DOM/accessibility/historical recovery, AI-assisted and deterministic recovery; a dedicated internal domain | **10 Reflection** | IP (proposes) / **EP** (re-run observed) |
| 11 | **Defect Intelligence** — failure category, root cause, risk/severity/priority, affected module/story/requirement, environment/browser/OS, evidence (trace/HAR/console/network/screenshot/video/timeline/DOM), suggested resolution; complete traceability | **10 Reflection** | IP (over EP-custodied evidence references) |
| 12 | **Synchronisation Intelligence** — execution status, evidence references, bug links, traceability pushed back through the connectors, automatically | **12 Reporting** | IP → tools |
| 13 | **Executive Reporting Intelligence** — release readiness, quality score, automation/requirement/risk coverage, defect leakage, healing metrics, execution/failure trends, governance compliance, certification; interactive dashboard + document formats + board-ready report | **11 Certification** (verdict) + **12 Reporting** (emit) | IP |

### 4.5 Certification strategy (how the re-foundation proves itself, per P4/P5)

Each domain is certified by executed evidence, not assertion. The rebuild adds, in one change with its enforcement (D-012):

- A **per-domain conformance gate** covering P1–P13 as executable properties — e.g. intent conservation (Σ dispositions == candidates, P6); reuse-before-generate (no authored asset when a repository match satisfies the scenario, domain 5); connector-only variation (no provider name reachable in orchestration, P9); AI-optional (every domain green with AI disabled, P12); governance triad present (registration fails if stages 4–6 absent, P3); no-stub (P4); sovereignty (no customer source/credential crosses, P7).
- Each gate ships **with its recorded fault proof** (positive and negative detection, R-13.4), registered in `run-all.js`.
- The capability's own `certificationCriteria` set expands to cover the new domains; a run yields `certified` only when every stage produced observed evidence (R-13.1) and intent was conserved (P6) — otherwise a typed refusal, never a hollow pass.
- The gate starts **RED and stays RED** until each domain conserves intent and satisfies its properties; green is earned by satisfying the gate, never by weakening it (P-002).

### 4.6 Mandatory capability contracts (acceptance conditions — customer-required, part of the decision)

Acceptance is conditioned on these fourteen contracts. They are **capability-internal platform contracts**: each is written as an executable gate property (§4.5) enforced on every domain, and each **conforms to and references its canonical architecture home rather than restating or competing with it** (CHARTER §4 — one topic, one source of truth). None introduces a second lifecycle, a second orchestration path, a competing state machine, a competing evidence contract, or a seventh capability.

**C-1 · Capability Domain Contract.** Every internal domain implements one common contract — `initialize · discover · analyse · plan · execute · validate · certify · cleanup · report`. These are **operations a domain exposes within its stage home**, not a lifecycle: no domain runs its own execution lifecycle, and the capability executes only through the single canonical twelve-stage lifecycle (R-12.1 / R-12.18). A domain absent any required operation is unregisterable (P4).

**C-2 · Canonical Execution Context.** One **immutable** Execution Context is constructed at run start and passed to every domain — Tenant · Security · Governance · Capability-Configuration · Application-Strategy · Connector-Resolution · AI · Execution-Metadata · Audit · Traceability. No domain constructs or mutates an independent context; it is the single source of truth for the run. This formalises the existing carried run-state ([12 — Capability Orchestration](../architecture/12-capability-orchestration.md)); the context holds **references and identifiers, never customer payload or credentials** (INV-1/INV-2, R-16.34).

**C-3 · Connector SPI Contracts.** The six connector families (§4.3) each expose a formal SPI: **Project** (discover / create-update work items · create bugs · sync execution · traceability); **Test Management** (discover assets · create cases / plans / suites-or-cycles · sync evidence); **Automation** (discover · generate · execute · publish evidence); **Authentication** (resolve strategy · acquire tokens · session lifecycle · credential abstraction); **Application Strategy** (authentication / navigation / discovery / locator / healing strategy · execution hooks); **Reporting** (report generation · executive dashboards · evidence aggregation · certification reporting). No orchestration contains connector-specific logic (P9, [14 — Tool Operating Model](../architecture/14-tool-operating-model.md)); adapters added to `requiredAdapters` additively.

**C-4 · Deterministic Decision Engine.** All routing decisions — application-strategy selection, connector resolution, authentication selection, execution strategy, healing strategy, reporting strategy — are produced by one Decision Intelligence layer with a deterministic implementation (rule engines / decision tables). No domain independently determines routing (P11/P12). **AI may contribute recommendations; AI never owns a decision** — with AI disabled every decision still resolves (P12, [13 — AI Operating Model](../architecture/13-ai-operating-model.md)).

**C-5 · Application Strategy Architecture.** Application Strategy is a first-class contract; every supported application type implements a strategy encapsulating authentication, discovery, navigation, locator management, healing behaviour, execution hooks and synchronisation behaviour. Application-specific behaviour lives **only** in strategies behind the SPI, never in orchestration (P9). A new application type is a new strategy, not a workflow branch.

**C-6 · Repository Intelligence Contract.** Stage 2 Discovery emits one canonical analysis model — existing assets · coverage · similarity · duplicate detection · reuse candidates · missing assets · confidence · recommendations. Downstream domains **consume this model and never rescan the repository** (which is EP-resident; only scores/metadata cross — INV-1, P7).

**C-7 · Automation Intelligence Contract.** Automation is plan-driven: repository-analysis → automation-plan → reuse-decision → generation-plan → validation → materialisation → registration → execution. **Generation is always the last resort; reuse-before-generate is mandatory** (domain 5/7) and intent-conserving (P6).

**C-8 · Canonical Evidence Model.** All evidence conforms to one model — screenshots · video · trace · HAR · console · network · DOM snapshot · timeline · environment · browser · platform metadata · attachments · execution metrics. This model **conforms to and references the frozen cross-plane evidence contract** ([20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md)); **artefacts remain in the Execution Plane, only references + metadata cross** (INV-1). No connector or reporting implementation introduces a proprietary evidence structure.

**C-9 · Executive Reporting Contract.** Reporting consumes one canonical reporting model aggregating execution results · traceability · coverage · evidence · defects · risk · healing metrics · governance compliance · certification. Reports are generated independently of any tool report; **tool reports become evidence providers, not reporting owners** (tool-agnostic, P8/P9). Certification of the release remains an IP stage (11), never fabricated by a tool.

**C-10 · Domain Certification Contract.** Every domain satisfies the same criteria before activation — governance · security · AI-optional · deterministic · connector-only variability · tool-agnostic · multi-tenancy · EP/IP · reuse-before-generate · no-stub · auditability · traceability. **No domain becomes active until certified** (§4.5, P4); certification is derived from executed evidence (R-13.1), never asserted.

**C-11 · Capability Composition.** The engine composes domains **through configuration within their fixed stage homes** — a new internal domain is added by composition without an orchestration redesign. **The twelve-stage sequence is never composed, reordered, or bypassed** (R-12.1 / R-12.18); composition adds internal domains, never stages and never capabilities (P1/P2). This is the extensibility mechanism, bounded by the frozen lifecycle.

**C-12 · Canonical Domain State Model.** Each domain exposes a consistent internal state projection — `pending · initialized · discovering · planning · executing · validating · synchronizing · reporting · certified · completed · failed · archived` — used for orchestration, telemetry, audit, recovery and reporting. **This is an internal observed projection, NOT a lifecycle and NOT a state machine that gates cross-plane transitions.** It never redefines the twelve-stage typestate ([12](../architecture/12-capability-orchestration.md)) and never touches the six canonical tenant states ([21 — Tenant Lifecycle](../architecture/21-tenant-lifecycle.md), R-21.5); only a certified stage and an `ACTIVE` tenant permit execution.

**C-13 · Cross-Domain Event Contract.** Domains emit canonical events — `StoryDiscovered · TestCasesPlanned · AutomationReused · AutomationGenerated · ExecutionStarted · HealingTriggered · DefectCreated · ResultsSynchronized · ReportGenerated · CertificationCompleted` — for loose coupling and telemetry. **Events are observational within the single orchestration pipeline; they are NOT an alternative control-flow.** The one sequencer still drives the run in twelve-stage order (R-04.5 / R-12.18); an event never advances the lifecycle.

**C-14 · Observability Contract.** Every domain emits standardised telemetry — structured logs · metrics · distributed traces · domain health · performance · governance checkpoints · security audit events · certification evidence. This **reuses the platform observability package, not a per-domain copy** (CHARTER §4); telemetry carries **identifiers and outcomes only, never customer payload** (R-16.34, INV-1).

## 5. Consequences (stated honestly)

- **Deliberate loss of working, tested, conformant code** across the capability's internals — the passing engine, both live FTE gates and accumulated hardening are discarded and re-earned. This is the churn CHARTER §15 / §17.2 warn against; accepted as an explicit customer product decision, recorded so it is auditable rather than silent.
- **A larger NOT-CERTIFIED window than the authoring-only draft.** Thirteen domains re-founded is materially more work than one; the capability is not certifiable until the domains are rebuilt and their gates pass. `run-all.js` carries the new gates RED-until-satisfied, as ADR-0038's gate is today.
- **The genuine defects are fixed by construction.** Intent conservation (P6), reuse-before-generate (domain 5), AI-optional determinism (P12) and observed-outcome-only execution (domain 9) are birth constraints, so the rebuilt capability cannot reproduce the 972→1 collapse, silent duplication, or fabricated outcomes and still certify.
- **Governance must be re-baselined** — per-domain gates + fault proofs added, `run-all.js` and the closure baseline re-cut, the ADR index updated.
- **Primary risk:** thirteen domains re-founded is thirteen opportunities to regress to the predecessor failure. The anti-stub invariants (P4) and per-domain gates (§4.5) are what hold the line — a partial re-foundation is unregisterable rather than silently shippable.
- **Cleanup is bounded and safe.** Residual/dead/obsolete code is removed only after its replacement domain is certified (§6); nothing is deleted prematurely, and every removal is in dependency order.
- **Extensibility is bounded, not open-ended.** The composition contract (C-11) lets future internal domains be added by configuration — but only within the fixed twelve-stage homes. The lifecycle, the state model (C-12), the event bus (C-13) and observability (C-14) are explicitly constrained to be projections/decoupling over the one pipeline, so extensibility never becomes a second control-flow. This is the long-term value the customer required, purchased without loosening R-12.18.
- **The fourteen §4.6 contracts add no second source of truth.** Each references its canonical home (the evidence contract to doc 20, the lifecycle to doc 12, the tenant states to doc 21, observability to the platform package) rather than restating it. If a future change needs to alter one of those canonical topics, it is amended in its owning document, not in this ADR.
- **No cross-plane atomic change.** The Execution-Plane runtime is a separate repository; any EP-side counterpart is a separate commit in that plane ([19 — Repository Ownership](../architecture/19-repository-ownership.md)). This ADR governs the Intelligence-Plane capability only.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

Domain by domain, replacement-certified before removal — never a big-bang cut.

1. **Accept this ADR** (customer sign-off), add its supersession note to `docs/adr/ADR-0022-functional-testing-engine-internal-structure.md`, and index it in `program/DECISIONS.md`.
2. **Fold in ADR-0038 Phase 2/3** as the authoring spine (domains 6–8): one authoring path (retire the `IP_AUTHORING` / `IP_FTE_OPS` seams), the canonical contract validated on the wire, all candidate tests and all requirements wired into authoring, steps carried through to executable operations, Discovery-grounded targets — making intent conservation (P6) the backbone.
3. **Write the per-domain P1–P13 conformance gates AND the §4.6 contract gates (C-1…C-14) FIRST** (declaration-and-enforcement in one change, D-012), against `packages/functional-testing-engine/` — the common domain contract (C-1), the immutable execution context (C-2), the six connector SPIs (C-3), the deterministic decision engine (C-4), the canonical repository/evidence/reporting models (C-6/C-8/C-9), the domain-certification criteria (C-10), and the composition/state/event/observability boundaries (C-11…C-14) — all before any domain rebuild, so a domain that violates a contract is unregisterable rather than silently shippable.
4. **Rebuild the thirteen domains** (§4.4) behind the stage and SPI boundaries, in dependency order (tenant/application/authentication resolution → story → design → repository → test-management/automation → execution → evidence → healing → defect → synchronisation → reporting); preserve the public capability contract shape, expanding `requiredAdapters` additively for the new connector families (§4.3).
5. **Governed cleanup** — for each rebuilt domain, once its gate is green, remove the superseded internal path plus any dead code, unused utility, dormant flag, obsolete adapter, deprecated service, experimental implementation, residual workflow, unused configuration/test/package or stale documentation it replaced. Removal is dependency-ordered and replacement-certified; P4 keeps a partial state unregisterable, so a premature deletion cannot ship.
6. **Re-cut governance** — the per-domain gates + fault proofs in `governance/verification/`, `run-all.js`, and the `governance/closure/baseline.json` closure baseline; re-run the suite. Restore green **by satisfying** the gates, never by weakening them (P-002).
7. **Update** `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, and the product catalogue.

## 7. Version impact

This ADR changes **no cross-plane contract and no runtime schema**: the execution-package and evidence contracts, the six canonical states, and the twelve-stage lifecycle are all preserved (P2, P6, P7). Its version impact, **on acceptance**, is **internal-structural**: it supersedes the *deferred-implementation* posture and internal specifics of [ADR-0022](ADR-0022-functional-testing-engine-internal-structure.md) (retaining its constitutional findings), absorbs the delivery of [ADR-0038](ADR-0038-execution-authoring-intent-conservation.md) Phase 2/3 into domain 6–8 of the rebuild, forces a re-cut of the conformance gates and closure baseline, and **additively expands the capability's own contract** (`requiredAdapters` / `evidenceClasses` / `certificationCriteria`) to cover the new connector families and domains — a within-capability change, not a platform-contract change. The capability count (six, R-11.4), the Platform Service count, the one-lifecycle rule (R-12.18) and the sovereign split are unchanged in every case. Nothing lands on disk except as §6 executes in order; until each step runs, this ADR changes nothing beyond its own record (see the Gate below).

## 8. Affected components

On acceptance, the affected components are:

- `packages/functional-testing-engine/src/capability.ts`, `packages/functional-testing-engine/src/orchestrators.ts`, `packages/functional-testing-engine/src/model.ts`, `packages/functional-testing-engine/src/adapters.ts`, `packages/functional-testing-engine/src/emitters/executable-automation.ts`, `packages/functional-testing-engine/authoring-bridge.mjs` — rebuilt in place across all thirteen domains; residual/dead internal paths removed in dependency order, replacement-certified first (§6.5). The package's public capability contract shape is preserved and expanded additively for the new connector families.
- [ADR-0022](ADR-0022-functional-testing-engine-internal-structure.md) — superseded in part (deferred-implementation posture + internal-structure specifics; constitutional findings retained).
- [ADR-0038](ADR-0038-execution-authoring-intent-conservation.md) — its Phase 2/3 authoring work is absorbed as the rebuild's authoring spine (domains 6–8).
- [11 — Capability Model](../architecture/11-capability-model.md), [12 — Capability Orchestration](../architecture/12-capability-orchestration.md), [13 — AI Operating Model](../architecture/13-ai-operating-model.md), [14 — Tool Operating Model](../architecture/14-tool-operating-model.md), [06 — Data Sovereignty](../architecture/06-data-sovereignty.md), [07 — Tenant Isolation](../architecture/07-tenant-isolation.md), [08 — Security Model](../architecture/08-security-model.md) — **referenced, not amended**; they already own capability structure, the one lifecycle, the AI operating model, the adapter model, sovereignty, isolation and security, so the rebuild conforms to them rather than changing them.
- `governance/verification/` — per-domain P1–P13 conformance gates **and the §4.6 contract gates (C-1…C-14)** + recorded fault proofs added; `governance/verification/run-all.js` gains their lines; `governance/closure/baseline.json` re-cut.
- `packages/observability` — reused by the observability contract (C-14); telemetry carries identifiers and outcomes only (R-16.34), not duplicated per domain.
- `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, `program/DECISIONS.md` — updated to record this decision and the rebuild window.
- The Execution-Plane runtime — a **separate repository and a separate change** ([19 — Repository Ownership](../architecture/19-repository-ownership.md)); not modified by this ADR.

---

**Gate:** No file is deleted, no domain is rebuilt, and no residual code is removed until this ADR is moved from PROPOSED to ACCEPTED. On acceptance, §6 executes in order, gate-first (D-012), domain by domain with replacement certified before removal, restoring green only by satisfying the per-domain conformance and intent-conservation gates (P-002).
