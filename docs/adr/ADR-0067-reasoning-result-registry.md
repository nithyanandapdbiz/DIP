# ADR-0067 — Reasoning Result Registry & Deterministic Package Assembly

**Status:** Accepted
**Date:** 2026-08-02

> **Scope, stated first because it bounds everything below.** This is an IMPLEMENTATION decision
> inside the Intelligence Plane. The constitutional Functional Testing Workflow (FT-001 → FT-037)
> is unchanged: no step is added, removed, reordered or re-owned. Plane ownership is unchanged: the
> Intelligence Plane reasons, the Execution Plane executes, and nothing here moves a line of
> reasoning across the boundary. The execution-package contract (ADR-0038, `execution-package.ts`)
> and the four-level package governance built on it (`package-governance.ts`) are unchanged and
> still gate every seal. What changes is WHERE certified reasoning lives before a package exists,
> and therefore what a refusal is able to say.

---

## 1. Problem

The platform kept producing the same class of failure:

```
PACKAGE_INCOMPLETE: missing metadata.coverageMatrix
PACKAGE_INCOMPLETE: missing metadata.coverageCertification
PACKAGE_INCOMPLETE: missing automation.manifest
PACKAGE_INCOMPLETE: missing automation.repositoryDigest
PACKAGE_INCOMPLETE: missing automation.dependencyGraphDigest
```

Each of these is TRUE and each is a SYMPTOM. `missing metadata.coverageMatrix` is equally
consistent with four different repairs: coverage analysis never ran; it ran and concluded nothing;
it concluded something and assembly failed to carry it; or the story analysis it measures against
was itself absent, so nothing downstream could run. The package cannot tell them apart, because by
the time the package exists the information that would distinguish them has been discarded.

ADR-0038 closed the first half of this — a hollow package can no longer be sealed. The package
governance layer closed the second half at the level of the SECTION — a refusal now names the
pipeline that owns the missing section, the module a repair is made in, and whether a retry could
help. What neither could close is that the section a refusal names is the LAST place a failure
became visible, not the FIRST place it happened. The same three failures were still diagnosed by
hand, repeatedly, because the artefact carried the symptom and not the cause.

The deeper weakness is structural: **the execution package was the primary representation of
reasoning.** Reasoning outputs were generated, held in engine state, and then read field by field
at the moment the body was assembled. `state.authoringCoverage` was read when the body was built;
if it was null, the body carried null. Nothing recorded that coverage certification had failed,
nothing stopped automation from being carried anyway, and nothing connected the eventual refusal to
the stage that owed the verdict.

## 2. Context

The Intelligence Plane runs thirteen certified domains and roughly ninety agents, producing an
`EngineState` that carries every reasoning output of a run. The authoring bridge
(`authoring-bridge.mjs`) drove that engine and then constructed the execution package body inline —
twenty-odd sections, each read directly from a state field, several of them derived on the spot
(the intent-conservation block, the traceability chain, the readiness counts).

Three properties of that arrangement produced the failure class above:

1. **No governed unit between "reasoning" and "package section".** A reasoning output had no
   identity, no lifecycle and no certification of its own. It was a field on a state object until
   it became a field on a body.
2. **No declared dependencies.** That coverage certification requires a coverage matrix, which
   requires a story analysis, was true in the code's execution order and stated nowhere. An
   impossible chain was only detectable after the fact, from the package, by the dependency rules
   in `package-governance.ts`.
3. **Assembly always ran.** Even when the reasoning behind half the sections had not happened, the
   body was built, then validated, then refused. The refusal described the body.

The constraints on any fix were absolute: the constitutional workflow could not change, plane
ownership could not change, no mock or placeholder could be introduced, and governance could not be
weakened — every new rule had to be capable only of REFUSING a package that would previously have
been sealed, or of explaining a refusal that would previously have been bare.

## 3. Alternatives

**A. Add more package-level rules.** Extend `DEPENDENCY_RULES` and `SEMANTIC_RULES` until every
combination of missing sections implies its cause. Rejected: the inference is fundamentally
lossy — from a body carrying a null coverage verdict there is no rule that can distinguish "the
agent returned nothing" from "the agent never ran because story analysis failed". More rules would
produce more precise descriptions of the same symptom.

**B. Log the reasoning pipeline more richly.** Emit structured events per agent and reconcile them
against the refusal. Rejected: it makes the diagnosis recoverable rather than carried. The artefact
still would not explain itself, the reconciliation would be manual, and log retention would become
load-bearing for governance evidence.

**C. Make the package a projection of a governed reasoning store.** Introduce an execution-scoped
registry that every reasoning capability publishes into and that certifies each output against the
capability's own rules; make assembly read only certified entries. Chosen. It moves the unit of
governance one step upstream, from the section to the capability, which is the level at which the
question "whose is this and what went wrong" actually has an answer.

**D. As C, but persist the registry.** Rejected. A durable store needs a retention policy, a
tenancy boundary and an eviction story, and becomes a second home for customer content. The problem
requires the registry only for the life of one execution.

**E. As C, but let the registry assemble the package.** Rejected. A store that also assembles is
the thing being replaced with a new name; separating the two is what makes "the package is a
projection" checkable.

## 4. Decision

Introduce a **Reasoning Result Registry** as the authoritative execution-scoped store of certified
reasoning, and a **Package Assembly Orchestrator** that projects execution packages from it and
from nothing else.

```
Requirement Intelligence → Reasoning Engines → Reasoning Result Registry
    → Package Assembly Orchestrator → Package Certification → Package Sealing → Execution Plane
```

**P-67.1 — The execution package is not the source of truth.** The registry is. The package is a
serialised PROJECTION of certified registry entries. It does not own, regenerate, infer or
fabricate reasoning.

**P-67.2 — Every reasoning capability publishes its certified output to the registry before
assembly.** No reasoning engine writes a package section. `SECTION_PROJECTION` is the single map
from certified output to package path, and the orchestrator writes nothing outside it.

**P-67.3 — Twenty-two governed capabilities, each declaring everything about itself.** Identifier,
owner (plane, pipeline, module, reasoning stage), purpose, produced outputs, consumed inputs,
prerequisites, consumers, certification rules, evidence, retry policy and permitted failure
categories. No implicit relationship is permitted: `capabilityGraphIntegrity()` refuses a
declaration whose `consumes` and `consumers` edges disagree, whose reads are unsequenced, that is
cyclic, that leaves a mandatory section unproduced, or that produces one twice.

**P-67.4 — One lifecycle.** `NOT_STARTED · RUNNING · BLOCKED · FAILED · COMPLETED · CERTIFIED ·
SKIPPED`, with the permitted transitions declared as data and every transition recorded with a
monotone sequence number and a reason. BLOCKED and FAILED are distinct facts with distinct repairs:
BLOCKED means the capability never ran because something it depends on did not certify.

**P-67.5 — Ownership is enforced at publication.** A capability publishes exactly the outputs it
declares. An extra key is refused as a claim of ownership it does not have; a missing key is
refused as a result it did not produce. A publication that references no evidence cannot certify.

**P-67.6 — One failure blocks its declared dependants, and the registry records why.** The blocking
cascade runs on the declared graph, not the execution order, and each blocked capability carries
the originating capability and the shortest declared chain to it. A capability that already reached
a verdict keeps it.

**P-67.7 — Assembly is attempted only when it can succeed.** If any mandatory section's producing
capability has not certified, no package is assembled. The refusal names the FIRST capability that
failed, the chain it blocked, the module the repair is made in, the missing certified outputs and
the retry verdict.

**P-67.8 — Refusing remains always possible, and is an outcome rather than a failure.** When there
is no `SelectorDiscovery` to ground against, `grounded-authoring` CERTIFIES a typed refusal — an
empty operation set with a stated reason — so the rest of the run keeps its coverage verdict, its
telemetry and its traceability. Modelling a refusal as a capability failure would blank exactly the
evidence an operator needs when a run authorises nothing.

**P-67.9 — Retry operates on capability state, upstream of the package.** The governed
`RETRY_POLICY` is the ceiling and is unchanged: only transport and authentication failures are
retryable. A capability may declare a narrower policy; it may never declare a deterministic failure
retryable, and the graph gate refuses a declaration that tries. An unchanged REGISTRY digest proves
a deterministic retry pointless BEFORE a package is built, where a package digest can only prove it
after.

**P-67.10 — Capability health is measured per capability.** Success and failure rates, blocked
counts, dependency-failure trends, package assembly and certification success rates, mean time to
repair (measured, with open failures listed rather than averaged in at zero), repeated failures and
reasoning completion rate.

## 5. Consequences

**What improves.**

- A missing section resolves to the originating capability, its pipeline, its module, the failed
  dependency, the chain between them, the evidence and the repair. `missing
  metadata.coverageMatrix` becomes `story-analysis FAILED, which blocked coverage-analysis; repair
  in src/agents/story-and-test.ts`.
- A hollow package is not merely refused after assembly; it is never assembled.
- A refusal carries the capability status of the whole run, so the Execution Plane and the evidence
  store both learn which reasoning happened without either reconstructing it.
- Derivations that were untyped inline JavaScript in the bridge — intent conservation, the
  traceability chain, the readiness counts, the deprecated artefact block — are now typed,
  certified capability outputs with rules over them.
- Recurring failures aggregate by capability rather than by field, so the metric names the repair
  site and the volume of work each failure blocks.

**What it costs.**

- Twenty-two declarations to maintain. A new package section now requires a producing capability
  and a declared projection; adding a section without one is a gate failure rather than a silent
  addition. That is the intended cost.
- Two projection passes per package, because `certification` and `manifest` describe the body and
  cannot be inside the body they describe. They are published back into the registry as
  `package-certification`'s outputs rather than attached on the way out.
- A refusal is now larger: it carries the reasoning that DID complete. This is deliberate.

**What does not change.** The workflow, the domains, the agents, the execution-package contract,
the four validation levels, the retry policy, the signing arrangement, and the shape of an
authorising package — which is byte-identical, canonically, to the one the field-oriented assembly
produced for the same input.

**Risk.** The registry is in-memory and execution-scoped; a process that dies mid-run loses it, and
the run is re-authored from the same F1 context — which is deterministic, so the same registry is
reached. Nothing durable depends on it.

## 6. Migration strategy

Additive and behaviour-preserving, in one step, with no dual-running period:

1. The registry, the capability model, the publication adapters, the orchestrator and the health
   metrics are added under `packages/functional-testing-engine/src/registry/`. Nothing existing is
   modified by their addition.
2. `authoring-bridge.mjs` stops constructing the package body. It continues to run the engine and
   to ground authored steps against discovered selectors — both reasoning — and hands the harvest
   to `publishReasoningResults`, then returns what `assembleExecutionPackage` projects.
3. Equivalence is proved rather than assumed: the package authored from a fixed context before the
   change and after it is canonically identical, and the existing contract gates
   (`verify-execution-contract`, `verify-package-governance`) pass unchanged.
4. `ip-execute-gateway.mjs` is untouched. It still validates the finished body with nothing
   excluded and still owns the signing key (INV-2); the orchestrator returns a seal REQUEST, never
   a seal.
5. Rollback is a revert of the bridge's `authorViaFTE` to its previous body-building form; the
   registry modules are additive and inert without it.

There is no data migration: the registry holds nothing beyond one execution.

## 7. Version impact

- `CAPABILITY_MODEL_VERSION` 1.0.0, `REASONING_REGISTRY_VERSION` 1.0.0,
  `PACKAGE_ASSEMBLY_VERSION` 1.0.0, `CAPABILITY_HEALTH_VERSION` 1.0.0 — new contracts.
- `CONTRACT_SCHEMA_VERSION` unchanged at 1.1.0. No package section is added, removed or
  re-required, so no receiver needs to change.
- `EXECUTION_CONTEXT_VERSION` unchanged at 1.0.0.
- `PACKAGE_GOVERNANCE_VERSION` unchanged at 1.0.0. No validation level, ownership entry, dependency
  rule, semantic rule or retry-policy entry is altered.
- Workflow version unchanged: FT-001 → FT-037, twenty-two constitutional slots, same producers.
- Execution Plane impact: none for an authorising package. A refusal gains `registryDiagnostics`
  and a richer `metadata`; both are additive and a receiver that ignores them is unaffected.

## 8. Affected components

- `docs/adr/ADR-0067-reasoning-result-registry.md` — **New** (this ADR).
- `packages/functional-testing-engine/src/registry/capability-model.ts` — **New**. The twenty-two
  capability declarations, the lifecycle, the section projection and the graph-integrity proof.
- `packages/functional-testing-engine/src/registry/reasoning-result-registry.ts` — **New**. The
  execution-scoped store: publication, ownership and dependency enforcement, certification,
  blocking cascade, queries and root-cause localisation.
- `packages/functional-testing-engine/src/registry/reasoning-publication.ts` — **New**. One
  publisher per capability, each owning only its own outputs.
- `packages/functional-testing-engine/src/registry/package-assembly-orchestrator.ts` — **New**. The
  projection, the assembly report, the diagnostics and the seal request.
- `packages/functional-testing-engine/src/registry/capability-health.ts` — **New**. Per-capability
  operational metrics.
- `packages/functional-testing-engine/test/reasoning-registry-conformance.test.ts` — **New**.
  Twenty-eight conformance tests, each planting the defect first.
- `governance/verification/verify-reasoning-registry.js` — **New**. The gating governance check;
  plants a failure in every capability of the reasoning chain and reads what comes back.
- `packages/functional-testing-engine/authoring-bridge.mjs` — **Amended**. `authorViaFTE` publishes
  the run's harvest into the registry and returns what the orchestrator projects; the inline
  body-building and the field-oriented refusal are removed.
- `packages/functional-testing-engine/src/index.ts` — **Amended** (registry exports).
- `governance/verification/run-all.js` — **Amended** (the new gate is registered).
- `governance/verification/record-fault-proofs.js` — **Amended** (fault probe: an orchestrator that
  projects from uncertified reasoning).
- `governance/verification/proofs.json` — **Amended** (regenerated registry).
- `program/DECISIONS.md` — **Amended** (ADR-0067 index row).
