# ADR-0024 — The Dev-Change Engine's canonical change workflow is internal structure of the twelve stages, and its two reasoning modes are one workflow

**Status:** ACCEPTED · **Date:** 2026-07-23

## 1. Problem

A brief specified a canonical **Dev-Change Engine** — one master orchestrator, twenty domain orchestrators, 120–180 specialised agents, and a forty-seven step workflow supporting an AI-enabled and an AI-disabled mode selected by configuration — and asked that it *replace the existing Dev-Change capability* while the certified baseline remained unchanged.

Six things had to be settled from disk before a line was written. This ADR records what was established, what was decided, and what deviates from the brief.

## 2. Context

**There is no existing Dev-Change implementation to replace.** [`program/IMPLEMENTATION_STATUS.md`](../../program/IMPLEMENTATION_STATUS.md) §5 records the Dev-Change Engine as `NOT STARTED`, and disk agrees: `packages/` held `capability-framework`, `functional-testing-engine` and `discovery-flow-engine` and nothing else. The brief's framing — *replace*, *the existing capability* — describes a state the repository is not in.

This matters because "replace" invites deleting something, and there was nothing to delete. The work is the **first implementation** of capability 2, built on a framework that already exists. Nothing was removed.

**The capability's name is already canonical, and the brief's name matches it.** [Document 11](../architecture/11-capability-model.md) §2 names capability 2 the **Dev-Change Engine**. Unlike ADR-0023, no name reconciliation was required. The architectural identity is `dev-change-engine`.

**The brief's baseline count is two behind the repository.** It states 21 ADRs and cites the *Penetration Testing Engine* as an existing reference implementation alongside Functional Testing and Discovery Flow. Disk held **23** ADRs, and the Penetration Testing Engine is `NOT STARTED` — capabilities 4, 5 and 6 do not exist. Two reference engines were available, not three. Disk governs. This ADR makes it 24.

**The forty-seven step workflow is a second orchestration lifecycle.** The brief's canonical workflow names a linear sequence of intelligences, each followed by a review and a certification. [Document 12](../architecture/12-capability-orchestration.md) is unambiguous:

> **R-12.18** There is exactly **one** orchestration lifecycle for the platform. A capability may extend the framework internally; it SHALL NEVER redefine or bypass it.

The brief independently forbids duplicate workflows in its own terms. Implementing forty-seven steps as a lifecycle would violate its instruction as well as R-12.18.

**The brief's workflow never names the governance triad.** Stages 4, 5 and 6 — Architecture Review, Policy Review, Guardrail Review — have no counterpart among the forty-seven steps. R-11.6 and R-12.2 make them mandatory for all six capabilities. A capability omitting one cannot register (R-11.12), so the omission would have surfaced as an unexplainable registration failure rather than as a governance gap.

**A precondition had to be repaired before building.** The working tree carried uncommitted work that had retrofitted the Functional Testing Engine onto a new framework runtime and left its test suite and conformance gate on the old API. The gate failed fifteen properties; the tests threw at runtime. ADR-0023 §6 asserted *"its forty-five tests still pass"* — an assertion contradicted by disk, which is R-13.1 inverted inside an ACCEPTED ADR. Building capability 2 on that footing would have compounded the drift. The repair is recorded in §7.

## 3. Decision

### 3.1 Forty-seven steps map onto twelve stages as internal structure

| Stage | Plane | Canonical steps it carries |
|---|---|---|
| 1 planning | IP | Repository Event · tenant, AI and Dev-Change configuration · provider adapter resolution · change-set scope · Review · Certification |
| 2 discovery | **EP** | Branch/PR Discovery · Commit Discovery · Diff Generation · Repository Index · Existing Test Discovery · Review · Certification |
| 3 context | EP→IP | Repository Intelligence · minimisation · Review · Certification |
| 4 architecture-review | IP | Change Intelligence · Dependency Intelligence · Review · Certification |
| 5 policy-review | IP | Business Impact Analysis · Review · Certification |
| 6 guardrail-review | IP | Risk Intelligence · Coverage Intelligence · Review · Certification |
| 7 execution-planning | IP | Repository Search · Automation Reuse · Generate Missing Automation · Enterprise Test Authoring · Execution Planning, each reviewed and certified |
| 8 execution | **EP** | Scoped Execution · parallel and dependency-ordered · Review · Certification |
| 9 evidence | **EP** | Evidence collection, hashed, custody retained |
| 10 reflection | IP | Healing · Reflection Intelligence · Root Cause Analysis · Defect Intelligence · Learning, each reviewed and certified |
| 11 certification | IP | Governance Review · Release Certification |
| 12 reporting | IP | Synchronization · Executive Reporting · Review · Certification |

The platform still exposes six capabilities (R-11.4) and runs one lifecycle (R-12.18).

### 3.2 The two reasoning modes are a gate on proposals, not a branch

`devchange.aiEnabled` is translated by the master orchestrator onto the framework's capability-neutral `ai.enabled`. Framework code that read a capability's own configuration key would be branching on a capability identity, which C-11.11 forbids; the translation is one line, in the capability that owns the surface.

Disabling reasoning **withholds proposals**. It adds no code path. Every agent receives its reasoning as a proposal input and has deterministic decision logic that must work when the proposal is `null` (INV-7), so AI-disabled mode is the degraded path every agent was always required to have.

The two modes therefore *cannot* diverge — there is nothing to diverge. A stage cannot support only one mode, because a stage never learns which mode it is in. The conformance gate proves it by running the engine both ways and comparing: identical stage sequences and an **identical set of invoked agents**.

This satisfies the brief's *"Rules-first execution is mandatory"* literally rather than by intention: the rules path is the only path, and reasoning is an optional input that may narrow or reorder its output and may never originate a result.

### 3.3 Every stage runs execute → review → decide → certify, and refusal is the only exit

`runPhase` enforces the order and **throws** when certification refuses. A refused phase cannot produce a sealed stage result, so the run stops with the reason attached. There is no argument that skips certification and no flag that downgrades it to a warning.

Review, decision and certification are three separate agents per stage — thirty-six in total — because a reviewer that can act on its findings can excuse them, and a certifier that can add a finding can manufacture grounds for a refusal it wanted anyway.

### 3.4 The sovereignty boundary is a type, not a discipline

Dev-Change has the sharpest sovereignty problem of any capability so far: the Intelligence Plane must reason about a **code change**, and a code change *is* source. "Nothing crosses" was not available as an answer, and neither was "the diff crosses".

The line is between structure and content, and it is drawn in the type system:

- `ChangedFile` — Execution Plane. Carries `hunks`, each with `addedLines` and `removedLines` as **arrays of source text**, plus the file's content and blame.
- `ChangeFact` — Intelligence Plane. Carries a path, a language, a change kind, `symbolsAdded` / `symbolsRemoved` / `symbolsModified` as **identifier names only**, counts, and a complexity delta.

A function's *name* is structure and crosses. A function's *body* is content and **cannot** cross, because `ChangeFact` has no field that could hold it. One function, `minimise`, is the sole crossing point, so auditing what crosses means auditing one function rather than every agent that ever touched a diff.

The conformance gate plants a recognisable secret in the diff body and asserts it is absent from the entire sealed Intelligence-Plane state.

### 3.5 Repository intelligence executes in the Execution Plane

The brief assigns *Repository Intelligence* to the Intelligence Plane while simultaneously requiring that the customer repository never leave the Execution Plane. Both cannot hold. All repository search — the eight asset searches and the vector search — executes in the **Execution Plane** against the customer's own index; only identifiers and match scores cross. Implementing it in the Intelligence Plane would move customer source across the boundary and turn E-5 red.

This is the same resolution ADR-0023 §5 reached for the same tension, and it is now consistent across two capabilities.

### 3.6 Adapters are invoked, not merely declared

The audit behind ADR-0023 found nine of ten adapter SPI methods declared and never called. This engine calls what it declares:

- Commit, branch, pull-request and diff retrieval run through a new `SourceControlAdapter` SPI.
- Test discovery, publication and traceability run through the existing `TestManagementAdapter`.
- Results, evidence references and defects run through the existing `ExecutionAdapter`.
- Work items run through the existing `WorkItemAdapter`.

A new `SourceControlAdapter` was added rather than widening `ProjectAdapter`, so no existing capability gained a method it never calls. The conformance gate checks adapter coverage and fails a method no capability invokes.

## 4. Alternatives

**Implement the forty-seven step workflow as its own lifecycle.** Rejected: R-12.18, and the brief's own prohibition on duplicate workflows.

**Branch per stage on `aiEnabled`.** Rejected: it is two workflows wearing one name, and the drift is invisible until the modes disagree in production. §3.2 is the alternative that was taken.

**Send the unified diff to the Intelligence Plane and rely on retention policy.** Rejected: it makes the sovereignty guarantee a promise about deletion rather than a property of the type system. §3.4 makes the leak unrepresentable.

**Implement Repository Intelligence in the Intelligence Plane as the brief specifies.** Rejected: it contradicts the brief's own sovereignty rule. §3.5.

**Widen `ProjectAdapter` with source-control methods.** Rejected: every capability would then declare methods it never calls — the declared-but-unwired pattern this platform has audited once already.

**Add a seventh capability for change impact.** Never considered viable: R-11.4 fixes the count at six and Dev-Change already *is* capability 2. Recorded only because "Change Intelligence" reads like a capability name and would, unexamined, have produced one.

### Deviations from the brief, stated rather than absorbed

**Healing intelligence runs in stage 10, not between execution and reflection.** The brief orders Scoped Execution → Healing → Reflection. `GATE_STAGE` binds `healing-certified` to the `reflection` stage, and the frozen lifecycle has no stage between execution and evidence. Healing *execution* — the re-run — happens in the Execution Plane during stage 8 and is **observed**; healing *intelligence* proposes and validates in stage 10. No heal is marked validated without an observed passing retry.

**Synchronization runs after Release Certification, not before.** The brief orders Synchronization → Learning → Executive Reporting → Governance Review → Release Certification. The frozen stage order is reflection (10) → certification (11) → reporting (12). Learning is therefore in 10, Governance Review and Release Certification in 11, and Synchronization and Executive Reporting in 12. The stage order governs. The result is also the better one: nothing is published to Jira or Azure DevOps until release certification has ruled.

**Repository Intelligence is split across planes.** See §3.5.

**The agent count is reported, not targeted.** The brief asks for 120–180 specialised agents *and separately* requires review, decision and certification agents in every stage. The measured census is published by the conformance gate and recorded in §6 rather than adjusted to hit a number.

## 5. Consequences

**Positive.** Capability 2 is implemented and executed rather than described. The governance triad is traversed. The sovereignty guarantee is structural, not procedural. Adapter publication is measured on every build. AI-disabled operation is proven by execution rather than asserted — a property the platform declared in INV-7 and had never measured for a capability until ADR-0023, and now measures for two.

**Positive, and unplanned.** Building capability 2 on the framework exposed that capability 1's conformance gate and test suite had been stranded on a superseded API, and that an ACCEPTED ADR asserted they passed. That is the exact defect class this programme exists to prevent, found by the ordinary act of building the next thing on the same foundation. §7.

**Negative.** The `SourceControlAdapter` SPI is exercised against in-memory provider adapters. No adapter has been executed against a real Git host, and none can be until the deployment blocker (E-2) clears. The gate measures that the methods are *invoked*, which is a weaker claim than *integrated*, and it is stated as the weaker claim.

**Negative.** Change-impact analysis is structural — call graphs, imports, symbol references and historical co-change. It does not execute the code, so a dependency expressed only through reflection, dynamic dispatch or configuration is not detected. Reasoning may surface such a dependency as a proposal; the deterministic floor cannot, and the report states the limit rather than hiding it.

**Unchanged.** 25 architecture documents, 21 → 24 ADRs by addition only, 3 Platform Services, 6 capabilities, EP/IP ownership, governance, security, Zero Trust, data sovereignty, certification, and provider-agnostic architecture. No frozen document was edited. General Availability remains **NOT CERTIFIED**; nothing here touches deployment evidence.

### Verification

`node governance/verification/verify-devchange-conformance.js` re-executes the engine and judges the observations. It is registered in the runner and fault-proved.

The properties it measures are the ones prior audits found defective in earlier capabilities, so a regression on any of them is a regression to a **measured** failure rather than a hypothetical one.

## 6. Migration strategy

**Nothing is migrated, because nothing existed.** Capability 2 was `NOT STARTED`; this ADR records its first implementation. No consumer, no configuration key and no contract changes for any existing capability.

**Two repairs were required to reach a green baseline**, both to consumers of the framework and neither to a frozen artefact:

1. `packages/functional-testing-engine/test/conformance.test.ts` and `governance/capability/run-capability-conformance.mjs` were brought onto the current framework API. No property was deleted or weakened to make them pass.
2. The closure baseline was re-taken to admit ADR-0023 and ADR-0024, deliberately and by the documented command, rather than by silent amendment.

**Rollback.** Removing `packages/dev-change-engine`, its conformance scenario and its gate registration returns the platform to its prior state. No other package imports it; the framework gained no Dev-Change-specific code, which C-11.11 would forbid.

## 7. Version impact

| Artefact | Before | After | Nature |
|---|---|---|---|
| `docs/architecture/**` | 25 frozen | 25 frozen | **Unchanged** — no edit |
| `docs/adr/**` | 23 | 24 | Additive |
| Conformance criteria | 413 | 413 | **Unchanged** |
| Capabilities declared | 6 | 6 | **Unchanged** |
| Platform Services | 3 | 3 | **Unchanged** |
| `@dbiz/capability-framework` | 1.0.0 | 1.0.0 | **Unchanged** — new SPI added, no existing type altered |
| `@dbiz/dev-change-engine` | absent | 1.0.0 | New package |
| Gating checks | 17 | 18 | Additive |
| General Availability | NOT CERTIFIED | NOT CERTIFIED | **Unchanged** |

No contract version was incremented, because no existing contract changed shape. `SourceControlAdapter` is a new interface; adding one does not modify the others.

## 8. Affected components

| Component | Change |
|---|---|
| `packages/dev-change-engine/**` | **New.** Model, agents, twenty domain orchestrators, master orchestrator, twelve-stage capability, adapters, report |
| `packages/capability-framework/src/adapters.ts` | `SourceControlAdapter` SPI and its registry resolution added. No existing interface altered |
| `governance/capability/run-devchange-conformance.mjs` | **New.** Conformance scenario |
| `governance/verification/verify-devchange-conformance.js` | **New.** Gating check, registered in `run-all.js` |
| `governance/verification/record-fault-proofs.js` | Fault proof for the new gate |
| `governance/closure/baseline.json` | Re-baselined to admit ADR-0023 and ADR-0024 |
| `packages/functional-testing-engine/test/**` | Repaired onto the current framework API (§7) |
| `governance/capability/run-capability-conformance.mjs` | Repaired onto the current framework API (§7) |
| `program/**` | State reconciled to disk; Dev-Change recorded BUILT/VERIFIED |
| `docs/capability/DEV-CHANGE-ENGINE.md` | **New.** Agent, orchestrator, gate and ownership catalogues |
