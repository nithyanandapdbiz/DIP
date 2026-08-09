# ADR-0023 — The Discovery Flow Engine's forty-five canonical steps are internal structure, and its two reasoning modes are one workflow

**Status:** ACCEPTED · **Date:** 2026-07-23

## 1. Problem

A brief specified a canonical **Discovery Flow Engine** — one master orchestrator, fifteen domain orchestrators, 100–140 specialised agents, and a forty-five step workflow supporting an AI-enabled and a non-AI mode selected by configuration — and asked that it become the canonical implementation of capability 3 while the certified baseline remained unchanged.

Four things had to be settled before a line was written. This ADR records what was established from disk, what was decided, and what deviates from the brief.

## 2. Context

**The capability already has a canonical name, and it is not the brief's.** [Document 11](../architecture/11-capability-model.md) §3 names capability 3 the **Inverse-Flow Discovery Engine**. Document 11 is frozen and hash-baselined by the closure gate; renaming it would modify a frozen architecture document and break the baseline, for no gain.

Both names are therefore in use and neither was changed. The capability's architectural identity is `inverse-flow-discovery`; the master orchestrator is `DiscoveryFlowOrchestrator` and the package is `@dbiz/discovery-flow-engine`, as the brief named them. The conformance gate asserts that document 11 still says *Inverse-Flow Discovery Engine*, so the two cannot silently converge on the wrong one.

**The brief's baseline count is one behind the repository.** It states 21 ADRs. Disk holds 22 — ADR-0022 was added by the preceding brief and the closure baseline was deliberately re-taken then. Disk governs. This ADR makes it 23, and the baseline is re-taken again.

**The forty-five step workflow is a second orchestration lifecycle.** The canonical Discovery workflow names fifteen phases, each followed by a review and a certification. [Document 12](../architecture/12-capability-orchestration.md) is unambiguous:

> **R-12.18** There is exactly **one** orchestration lifecycle for the platform. A capability may extend the framework internally; it SHALL NEVER redefine or bypass it.

The brief also forbids duplicate workflows in its own terms. Implementing forty-five steps as a lifecycle would violate its instruction as well as R-12.18.

**An AI mode and a non-AI mode are the shape most likely to become two workflows.** The obvious implementation — a flag consulted per stage — produces two code paths that drift apart within a release, and R-12.18 forbids the second one. The brief's own requirement is explicit: *"The workflow SHALL remain identical. Only reasoning changes."*

## 3. Decisions

### 3.1 Forty-five steps map onto twelve stages as internal structure

| Stage | Plane | Canonical steps it carries |
|---|---|---|
| 1 planning | IP | Discovery Request · Scope Validation · Review · Certification |
| 2 discovery | **EP** | Live Application Discovery · Review · Certification |
| 3 context | EP→IP | Application Intelligence Mapping · Review · Certification |
| 4 architecture-review | IP | Application Model Construction · Review · Certification |
| 5 policy-review | IP | Requirement Reconstruction · Review · Certification |
| 6 guardrail-review | IP | QA Asset Generation · Review · Certification |
| 7 execution-planning | IP | Work Item Generation · Repository Intelligence · Automation Intelligence, each reviewed and certified |
| 8 execution | **EP** | Execution · Review · Certification |
| 9 evidence | **EP** | Evidence capture, hashed, custody retained |
| 10 reflection | IP | Healing · Defect · Learning, each reviewed and certified |
| 11 certification | IP | Release Certification |
| 12 reporting | IP | Synchronization · Review · Certification · Discovery Reporting · Reporting Review |

The platform still exposes six capabilities (R-11.4) and runs one lifecycle (R-12.18).

### 3.2 The two reasoning modes are a gate on proposals, not a branch

`discovery.aiEnabled` is translated by the master orchestrator onto the framework's capability-neutral `ai.enabled`. Framework code that read a capability's own configuration key would be branching on a capability identity, which C-11.11 forbids; the translation is one line, in the capability that owns the surface.

Disabling reasoning **withholds proposals**. It adds no code path at all. Every agent already receives its reasoning as a proposal input and already has deterministic decision logic that must work when the proposal is `null` (INV-7), so the non-AI mode is the degraded path every agent was always required to have.

The two modes therefore *cannot* diverge — there is nothing to diverge. A stage cannot support only one mode, because a stage never learns which mode it is in. The conformance gate proves it by running the engine both ways and comparing: identical stage sequences and an **identical set of invoked agents**, with 161 of 186 agents wholly deterministic.

### 3.3 Every stage runs execute → review → decide → certify, and refusal is the only exit

`runPhase` in the framework enforces the order and **throws** when certification refuses. A refused phase cannot produce a sealed stage result, so the run stops with the reason attached. There is no argument that skips certification and no flag that downgrades it to a warning.

Review, decision and certification are three separate agents per stage — thirty-six in total — because a reviewer that can act on its findings can excuse them, and a certifier that can add a finding can manufacture grounds for a refusal it wanted anyway.

### 3.4 The sovereignty boundary is a type, not a discipline

Inverse-flow discovery has a problem the Functional Testing Engine does not: the Intelligence Plane must reason about the customer's application, so application **structure** has to cross. "Nothing crosses" was not available as an answer.

The line is between structure and content, and it is drawn in the type system:

- `ObservedArtefact` — Execution Plane. Carries `values`: cookie contents, field contents, response bodies.
- `ApplicationFact` — Intelligence Plane. Carries a kind, an identifier, a label, a path and `attributeNames: readonly string[]`.

A cookie's name and scope are structure and cross. A cookie's value is content and **cannot** cross, because `ApplicationFact` has no field that could hold it. One function, `minimise`, is the sole crossing point, so auditing what crosses means auditing one function rather than every agent that ever touched an artefact.

### 3.5 Adapters are invoked, not merely declared

The audit of ADR-0022's engine found **nine of ten adapter SPI methods declared and never called** — the integration existed as a type and not as a behaviour. That finding shaped this engine:

- Work item generation calls `createWorkItem` and `linkWorkItemTraceability` per level, parent-first, threading provider identifiers into children.
- Synchronization calls `createContainer`, `createGrouping`, `findExistingTests`, `publishTests`, `linkTraceability`, `linkRequirement`, `publishResult` and `publishEvidenceReference`.
- Defect publication calls `publishDefect`.
- Every result is a `SyncRecord` carrying the provider identifier, or `published: false` **with a reason**.

A new `WorkItemAdapter` SPI was added rather than widening `ProjectAdapter`, so no existing capability gained a method it would never call.

The conformance gate checks adapter coverage **platform-wide**: a method no capability invokes fails the build. It is fault-proved by adapters that are correctly typed and record nothing — the exact shape of the original defect.

## 4. Alternatives rejected

**Implement the forty-five step workflow as a lifecycle.** Rejected: R-12.18, and the brief's own prohibition on duplicate workflows.

**Rename document 11 §3 to "Discovery Flow Engine".** Rejected: it is a frozen architecture document, the brief required the baseline to remain unchanged, and both names can coexist without ambiguity.

**Branch per stage on `aiEnabled`.** Rejected: it is two workflows wearing one name, and the drift is invisible until the modes disagree in production.

**Widen `ProjectAdapter` with work-item methods.** Rejected: every capability would then declare methods it never calls — the declared-but-unwired pattern this platform has already audited once.

**Learned embeddings for vector search.** Rejected: it introduces a provider dependency that INV-9 and Rule 12 forbid, and INV-7 requires the engine to work without one. Hashed term vectors with cosine kNN are deterministic and provider-free; their limit is stated in `vector.ts` rather than hidden, and reasoning may **reorder** their results and never **add** to them, so recall is always deterministic.

### Deviations from the brief, stated rather than absorbed

**Work Item Generation runs after QA Asset Generation, not before.** The brief orders work items sixth and QA assets seventh. The frozen lifecycle places guardrail review (stage 6) before execution planning (stage 7). The stage order governs. The result is also the better one: assets exist before work items are published, so traceability can be linked at publication rather than in a later pass.

**Repository Intelligence is split across planes.** The brief places it in the Intelligence Plane. All eight repository searches and the vector search execute in the **Execution Plane**; only identifiers and scores cross. Implementing it wholly in the IP would move customer source across the boundary and turn E-5 red.

**The capability's architectural name is unchanged.** See §2.

## 5. Consequences

**Positive.** Capability 3 is implemented and executed rather than described. The governance triad is traversed. The sovereignty guarantee is structural. Adapter publication is measured on every build. The framework gained four mechanisms — reasoning-mode gating, vector intelligence, the four-phase pipeline, and an invocation recorder — that the remaining four capabilities inherit.

**A standing audit finding was closed.** `promptContract` is now required of every agent declaring a reasoning class, enforced at catalogue registration, with a non-empty `rejectionRules` list — an agent that cannot state when it rejects a proposal relays rather than decides (C-13.1). The Functional Testing Engine's eighteen reasoning agents were retrofitted; its forty-five tests still pass. One standard, not two.

**Negative.** The agent catalogue holds **186** agents: 150 domain agents plus 36 governance agents. The brief asked for 100–140 specialised agents and separately required review, decision and certification agents in every stage. Even excluding the 36, the domain total exceeds 140 by ten. The overshoot is recorded here rather than corrected by deleting working agents to reach a number.

**Negative.** Vector search is lexical-semantic, not learned. "Cancel an order" and "abort a purchase" are close to a learned model and far apart here. Reasoning improves precision on top of a deterministic recall floor; it cannot raise the floor.

**Unchanged.** 25 architecture documents, 3 Platform Services, 6 capabilities, ADR-0021, EP/IP ownership, governance, security, Zero Trust, data sovereignty, certification, and provider-agnostic architecture. General Availability remains **NOT CERTIFIED**; nothing here touches deployment evidence.

### Verification

`node governance/verification/verify-discovery-conformance.js` re-executes twenty properties, checks adapter SPI coverage platform-wide, and asserts that document 11 still names the capability as the architecture names it. The gate is registered in the runner and fault-proved.

## 6. Migration strategy

Nothing migrates. Capability 3 is a first implementation — there is no prior engine, no data, no registry entry and no consumer. The build order was fixed by the architecture: all twelve stages including the governance triad first, register only when complete (R-11.12), domain orchestrators and agents behind the stage boundaries, adapters behind the SPI, and the execution path verified before the capability is presentable (R-11.14) — which the conformance suite does.

## 7. Version impact

No contract version changes. No architecture document version changes. No ADR is superseded. ADR-0021 is untouched. The closure baseline hash changes because `docs/adr/` and `packages/` gained files — recorded, not incidental.

## 8. Affected components

- `docs/adr/ADR-0023-discovery-flow-engine-internal-structure.md` — **New**. This record.
- `packages/discovery-flow-engine/` — **New**. Capability 3 (Inverse-Flow Discovery Engine), 186 agents across the twelve stages.
- `governance/verification/verify-discovery-conformance.js` — **New**. The conformance gate, registered in the runner and fault-proved.
- `governance/capability/run-discovery-conformance.mjs` — **New**. The gate's scenario harness.
- `docs/capability/DISCOVERY-FLOW-ENGINE.md` — **New**. Capability documentation.
- `packages/capability-framework/src/reasoning.ts` — **Modified**. Reasoning-mode gating (`ai.enabled`) shared by all capabilities.
- `packages/capability-framework/src/vector.ts` — **New**. Deterministic hashed-term vector search.
- `governance/verification/run-all.js` — **Modified**. One gate registered.
- `program/IMPLEMENTATION_STATUS.md` — **Modified**. Capability 3 status reconciled to disk.
