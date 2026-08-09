# ADR-0037 — Execution Target Simplification

**Status:** PROPOSED · **Date:** 2026-07-28
**Raised by:** a Software Architecture Review Board directive to make the Execution-Plane configuration model strictly conform to the Sovereign Split — the `EP_EXECUTION_MODE` / `EP_EXECUTION_STRATEGY` surface fused execution behaviour, execution location, and deployment ownership into single tokens.
**Affects (proposes to amend, via the CHARTER §9 review pipeline):** [15](../architecture/15-configuration-model.md) §2, [16](../architecture/16-runtime-model.md), [17](../architecture/17-deployment-topology.md) §3, and the generated EP solution config model (`carlislehomes/src/runtime/readiness/`, `execution.config.json`, `.env`).
**Builds on / bounded by:** [ADR-0009](ADR-0009-configuration-precedence.md), [ADR-0012](ADR-0012-cloud-portability.md), [ADR-0035](ADR-0035-execution-plane-operational-portal.md), [ADR-0036](ADR-0036-execution-plane-registration-and-trust-establishment.md).
**Does not amend:** the six capabilities, three Platform Services, twelve-stage lifecycle, six canonical states, the SSOT, INV-2/3/9, or the cross-plane direction (R-05.1).

---

## 1. Context

The Execution Plane's runtime configuration exposes a flat six-value execution mode —
`dry-run · mock-live · live · provisioned-local-live · customer-cloud-live · dbiz-managed-cloud-live` —
crossed with a three-value strategy — `local · customer-cloud · dbiz-managed-cloud`. A tenant answering *"how should this capability execute?"* must choose among tokens that simultaneously name rehearsal semantics, deployment ownership, and provisioning state. Under the Sovereign Split, none of the latter two is a tenant execution decision.

**Ground truth, traced end to end (evidence, not assumption).** Every path from CLI → `npm run functional` → orchestrator → runtime was inspected in the generated EP solution:

| Config value | Runtime reader (file:line) | Classification |
|---|---|---|
| `dry-run` | `orchestrator.js:98,126-152` · `i2-browser.js:184-188` ("the ONLY place dry-run and live differ") · `gather.js:15-25` | **Runtime behaviour** — the one genuine branch |
| `live` (alias) | resolves to `transport:live` (`strategy.js:40-44,155-157`) | **Runtime behaviour** (= not-dry-run) |
| `mock-live` | mock lives in readiness only (`dimensions.js:207-224`); runtime `transport:live` | **Configuration only** (readiness report); runtime-identical to `live` |
| `provisioned-local-live` | `transport:live` + `requiresProvisioning:true` (`modes.js:66-76`) | **Configuration only** (readiness floor); runtime-identical to `live` |
| `customer-cloud-live` | runtime-identical to `provisioned-local-live`; adds K8s/Vault readiness (`dimensions.js:248-251`) | **Deployment metadata**, currently **dead at runtime** |
| `dbiz-managed-cloud-live` | runtime-identical; adds managed-infra readiness (`dimensions.js:252-255`) | **Deployment metadata / dead at runtime** — and an AD-033 hazard |
| `strategy: local\|customer-cloud\|dbiz-managed-cloud` | never reaches a runtime branch; selects readiness dimensions only | **Dead configuration** at runtime; **future placeholder** in the report |
| `target: remote` (implied) | no dispatch exists — `npm run functional` always runs the local process | **Future placeholder** (unimplemented) |

The genuine behavioural degrees of freedom are exactly **one bit** — `transport ∈ {dry-run, live}` — reduced at `orchestrator.js:98`. There is **no launcher and no remote dispatch**; `bin/ep-functional.mjs` is a thin flag parser over `orchestrator.js:52 runFunctional`.

## 2. Problem statement

A single configuration token conflates three orthogonal axes, and five of its six values drive **no runtime behaviour** — read only by the readiness report. This is simultaneously:

- **Configuration theatre** — declared fields whose only reader is a status report ([15](../architecture/15-configuration-model.md) R-15.1, and its "false representation, not a missing feature" rationale).
- **A path-selecting configuration** — the token names deployment/architectural arrangements (R-15.17, C-15.10).
- **A vocabulary collision** with three frozen invariants:

| Token | Collides with |
|---|---|
| `customer-cloud-live`, `dbiz-managed-cloud-live` | [ADR-0012](ADR-0012-cloud-portability.md) *Prohibited* — no cloud primitive above the adapter, **including in configuration keys** (R-17.15); C-15.13 — no config key is provider-named |
| `dbiz-managed-cloud-live` as a peer EP mode | [17](../architecture/17-deployment-topology.md) **AD-033** — a DBiz-managed EP is *a different product, not the sovereign split, and SHALL NOT be represented as the sovereign split* |
| `dry-run` / `…-live` fused | [04](../architecture/04-execution-plane-architecture.md) R-04.6 / C-04.14 — dry-run vs live differ **only inside the adapter**, one code path |

## 3. Root-cause analysis — three axes in one token

| Axis | Question | Wrong home (today) | Correct home |
|---|---|---|---|
| **A — Execution behaviour** | Do real side effects occur? | baked into the mode (`dry-run`/`…-live`) | **run scope** `run.dryRun` / `--dry-run`; realised **inside the adapter** (R-04.6) |
| **B — Execution target** | Which execution plane runs it? | split across mode **and** strategy | **`execution.target`** — a *logical target name* (`local` reserved); provisioning resolves it to a physical binding; read only by the launcher |
| **C — Deployment ownership** | customer / on-prem / partner / (dbiz) | `strategy` + the `…-cloud-…` modes | **provisioning + the tenant deployment record** ([17](../architecture/17-deployment-topology.md), [21](../architecture/21-tenant-lifecycle.md)); never an execution field. `dbiz-managed` excluded (AD-033) |

Only Axis B is a live execution decision, and it has two values.

## 4. Decision

### 4.0 Governing principle — Deployment-Topology-Free Execution (P-37)

> **P-37.** Execution configuration SHALL express only *execution intent* and a *logical execution target*. It SHALL NOT describe physical deployment topology. Provider, cloud, network, endpoint, certificate, identity, ownership, and discovery belong exclusively to provisioning and deployment, and SHALL be **resolved before execution begins**. Execution refers to a target by **name**, never by its physical address.

Every decision below is an application of P-37. It is the rule that makes the model future-proof: any physical concept that tries to enter execution configuration is rejected by name.

### 4.1 One execution field — a logical target name

```yaml
execution:
  target: <logical-target-name>   # Axis B. default: local (a reserved name)
```

`execution.target` is a **logical handle**, not a location. It carries exactly one responsibility: *which execution plane runs this capability*. It never names a provider, endpoint, cloud, or owner.

- **`local`** — a reserved target name resolving to the **in-process** EP. Dev and CI need nothing else — no provisioning, discovery, provider, or endpoint.
- **Any other name** (e.g. `production-ep`, `eu-west-ep`) — a **provisioned** target. Provisioning has already registered it (ADR-0036) and bound it to a physical endpoint, provider, identity, and certificate. The launcher resolves the name to that binding, authenticates, dispatches, and returns evidence.

`npm run functional` is byte-for-byte identical for every value; only *which* target runs the capability changes. The capability and the EP binary are invariant across all of them.

**Why a named target, not `local | remote`.** `remote` is a *location descriptor* — binary, and it silently assumes there is one "elsewhere." It does not survive the enterprise scenarios in §8.1 (multiple EPs, regional EPs, air-gapped enclaves, brokers): each would force a new enum value or a smuggled endpoint. A **named logical target** absorbs all of them without a schema change — they are simply more names, each resolved by provisioning. It also degrades perfectly: `local` is just the one name that needs no resolution.

**Terminology rejected.** `remote` (location descriptor, non-extensible); `attached`/`detached` (leaks a process-coupling runtime detail into config); `registered` (names the *mechanism* — a registry — not the *thing*; a target *is registered*, but the value a tenant writes is the target's **name**). `local` + a logical name is the strongest, and is the only form under which execution never learns a physical fact.

### 4.2 Rehearsal is a run-scope intent (Axis A)

```yaml
run:
  dryRun: true | false          # default false — primary form:  npm run functional -- --dry-run
```

Orthogonal to `target`; resolved at the **run** scope of the ADR-0009 precedence chain; realised **inside the adapter** (R-04.6), one code path through the sequencer and engines. Its primary form is the **per-invocation** flag/API parameter — rehearsal is an intent of *this run*, not durable tenant state; a persisted `run.dryRun` default is permitted but SHALL default to `false` (least surprise: a tenant never silently rehearses forever). `mock-live` is reclassified as a **test-harness fixture**, not a tenant-facing mode.

### 4.3 Provider and endpoint are removed from execution configuration (P-37)

There is **no** `remote`, `provider`, or `endpoint` block in execution configuration. Under P-37 those are physical facts. The launcher resolves them from the target **name** through a platform-owned resolution interface that returns the binding:

```
execution.target  ──resolve──▶  { endpoint, provider, identity, certificate, discovery, transport }
     (a name)        (provisioning / ADR-0036 registry)              (a physical binding)
```

The binding is owned by **provisioning** and stored in the tenant deployment record (customer-owned, EP plane). Provider-specific connection material lives **behind the Remote Adapter**, keyed off the resolved `provider` **value** — never inlined into config, never a configuration key (C-15.13, R-7.2), never above the adapter layer (ADR-0012). Execution learns a *name*; provisioning owns the *address*.

### 4.4 Axis C is absent from execution configuration

Deployment ownership (customer- / DBiz- / partner-managed / self-hosted) and topology (cloud / on-prem / air-gapped / edge) appear in **no** execution field. They are operational facts of *who deployed the EP binary and where*, recorded in the tenant deployment record at provisioning time ([17](../architecture/17-deployment-topology.md), [21](../architecture/21-tenant-lifecycle.md)), and enforced by the storage/residency layer, not by a mode (R-06.8). `dbiz-managed` is removed, not relocated (AD-033).

## 5. Responsibility matrix

Each responsibility has **exactly one** owner.

| Actor | Owns (single responsibility) | Must never |
|---|---|---|
| **Intelligence Plane** | Planning, orchestration, governance, execution context, capability selection; **authors + signs** the execution package | Call into the EP; decide *where* execution runs |
| **Execution Launcher** (customer-plane; the [04](../architecture/04-execution-plane-architecture.md) *Trigger: schedule · pipeline · API* surface) | Read `execution.target` (a name) + `run.dryRun`; ask **Provisioning** to resolve the name → binding; `local` → invoke in-process EP; a named target → authenticate, dispatch, receive evidence, return | Contain execution logic; hold a provider/cloud primitive; resolve physical addresses itself |
| **Provisioning** | Resolve a target **name** → physical binding `{ endpoint, provider, identity, certificate, discovery, transport }`; register/rotate targets (ADR-0036); own the tenant deployment record | Run a capability; be consulted *during* execution (resolution completes **before** execution — P-37) |
| **Deployment Infrastructure** | Where/by whom the EP binary is deployed — cloud, on-prem, air-gapped, edge; customer/DBiz/partner-managed | Alter capability behaviour or appear in execution config (R-17.11–R-17.15) |
| **Execution Plane** | Receive request → execute the **complete** capability → collect evidence → return; pull its signed package from the IP (the "only egress", R-05.1) | See `target`, provider, endpoint, or ownership; execute a partial workflow (R-04.1) |
| **Capability** | Own the **complete** workflow — stages, orchestrators, agents; determine **what** executes | Branch on cloud, provider, deployment, ownership, or infrastructure; be narrowed by configuration (R-15.17) |
| **Remote Adapter** | The single place a resolved `provider` **value** becomes a concrete endpoint/transport; isolate Azure/AWS/K8s specifics; conformance-suite-gated before first use (ADR-0012 R-14.12) | Leak a provider name above the adapter (R-7.2, C-04.13) |
| **Runtime** | Execute the operations of the package in order (the sequencer + engines); realise dry-run vs live **inside the adapter**, one code path (R-04.6) | Read `target`/provider/ownership; take a second code path for rehearsal (R-04.6) |

The launcher sits **inside the customer's sovereignty domain**, so dispatch to a named target is intra-plane (customer launcher → customer EP). **INV-3 / R-05.1 is untouched**: it governs the *plane boundary* — the EP still initiates all IP↔EP traffic and opens no inbound path to DBiz (R-05.2). A customer component calling the customer's own EP over the ADR-0035 local API is not cross-plane and is not the IP initiating anything.

## 6. Alternatives considered

| Option | Assessment |
|---|---|
| Keep the six-mode / three-strategy enum | **Rejected** — R-15.1 configuration theatre; token selects architectural/ownership paths (R-15.17). |
| Adopt the brief literally (`target: cloud`, `azure:` block) | **Rejected** — provider-named config keys (C-15.13) and a cloud primitive above the adapter (ADR-0012 *Prohibited*); excludes on-prem/air-gapped (R-17.13). |
| Two fields `target` + `mode` | **Rejected** — re-opens the conflation; `mode` regains no reader beyond the readiness report. |
| `target: local\|remote` + `remote:{ provider, endpoint }` | **Rejected (superseded)** — a binary location descriptor that does not scale (§8.1), and `provider`/`endpoint` in execution config still describe physical topology, violating P-37. This was the prior draft of this ADR; the review below supersedes it. |
| **`execution.target` = a logical target name (`local` reserved), physical binding resolved by provisioning; `run.dryRun` at run scope** | **Selected** — one tenant decision, one responsibility, zero physical facts in execution; conforms to P-37, R-04.6, R-05.1/2, R-15.1/17, ADR-0012, AD-033; extensible to every §8.1 scenario without a schema change. |

## 7. Consequences

**Positive.** A tenant understands execution as one question with two answers. The EP is provably deployment- and provider-agnostic — the same binary runs unchanged locally, in a pipeline, on-prem, or in any supported cloud. The `NOT-READ` configuration surface (R-15.1 exposure) is closed by deletion. `dbiz-managed` leaves the tenant vocabulary entirely (AD-033).

**Negative, accepted.** `remote` requires the launcher and the endpoint-discovery/Remote-Adapter interface to be **built** — today neither exists. This ADR separates an *immediately-conformant configuration* simplification from a *capability* addition (remote dispatch) and does not claim the latter is implemented.

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A named target advertised before dispatch exists → a `target` value the launcher cannot resolve = a *new* R-15.1 exposure | High | Only `local` ships until the resolver + Remote-Adapter conformance suite exist (ADR-0012 R-14.12); an unresolvable target name **fails closed** with a provenance-bearing Configuration Error (R-15.11/13), never a silent fallback to `local` |
| A target **name** is a free-form value → typo / drift resolves to nothing | Medium | Resolution is closed-world against the provisioning registry (ADR-0036); the effective binding reports its source scope (R-15.11); no name → no ambient default (R-15.12) |
| Readiness dimensions lose their driving token when `strategy` is deleted | Medium | Re-key infra-ownership dimensions off the tenant deployment record before deleting `strategy`, in the same change (R-15.2) |
| Clean break strands an in-flight tenant `.env` still naming an old mode | Medium | Startup validation rejects the removed tokens with a message naming the replacement (`execution.target` + `run.dryRun`); fail closed, not silent reinterpretation (`strategy.js:103-125` pattern) |
| Provider/endpoint material migrates back into config by habit | Low | P-37 stated as a rule + the C-15.13 key-naming gate + a schema test asserting no `provider`/`endpoint`/cloud key anywhere under `execution` |

### 8.1 Future-enterprise scalability — does P-37 hold?

The named-target model was chosen precisely so the config surface never grows as topology does. Each scenario is *more names*, resolved by provisioning — **no schema change, no execution change**:

| Scenario | How it is absorbed |
|---|---|
| Multiple / regional EPs | Multiple target names (`eu-west-ep`, `us-east-ep`); the launcher resolves each; the capability is identical |
| Air-gapped / disconnected | A target whose resolved transport is offline/queue; the signed package is delivered per ADR-0015 degraded operation; execution config is unchanged |
| Kubernetes / serverless / edge / VM | All are the *deployment* of the EP binary (R-17.14 container image); resolved as binding+transport, invisible to `execution.target` |
| Customer discovery services | The resolver delegates to the customer's discovery; the target name is the lookup key |
| Execution brokers | A target whose binding points at the broker; the Remote Adapter speaks the broker transport; capability and config unchanged |

If a future scenario cannot be expressed as *(a name) + (a provisioning-resolved binding)*, that is the signal to revisit P-37 — not to add a field to `execution`.

## 9. Validation

| Criterion | Verified by |
|---|---|
| No execution mode combines concerns | Schema audit: the mode enum is absent; `execution.target` is a single logical name |
| **No physical fact under `execution` (P-37)** | Schema gate: no `provider`, `endpoint`, `cloud`, `certificate`, `identity`, or ownership key anywhere under `execution` |
| Target is resolved *before* execution | Ordering test: the launcher completes name→binding resolution before invoking the EP; the EP receives no target |
| `execution.target` determines only *where* | Consumer audit: read solely by the launcher/resolver, never by an engine or the capability |
| Capability determines the complete workflow | R-04.1 path-equivalence test; no config path selects steps (C-15.10); capability does not branch on infra |
| Deployment ownership removed from execution config | Schema completeness gate — no ownership/topology field in `execution` |
| Provider details isolated behind adapters | C-04.13 / C-15.13 gates: no vendor identifier or provider-named key above the adapter |
| EP provider- & deployment-agnostic; same binary everywhere (local / pipeline / on-prem / any cloud) | R-17.11–R-17.15; container-image parity; EP never receives `target` |
| `npm run functional` consistent, only the target changes | Command-invariance test across `target: local` and any named target |
| Rehearsal & live share one path | R-04.6 path-equivalence test — dry-run differs only inside the adapter |
| Aligns with ADRs / governance | Decision-to-rule map in §10: P-37, R-04.6, R-7.2, R-15.1/17, C-15.10/13, INV-3/R-05.1/2, ADR-0009/0012, AD-033 |

Each criterion is added **with its gate in the same change** (R-15.2, R-13.4).

## 10. Governance impact

Amends frozen Documents 15 (§2 — the `execution.target` field's ownership/scope; **P-37** as a configuration rule), 16 (run-scope dry-run), and 17 (§3 — logical target vs physical deployment) through the CHARTER §9 review pipeline; this ADR is the **proposal**, not the amendment, and freezes nothing. It **strengthens** governance by deleting a configuration-theatre surface (raising the R-15.1 signal), removing an AD-033 representation hazard, and adding P-37 — a rule that structurally prevents physical topology re-entering execution config.

**Decision-to-rule map (governance §9 checklist).**

| Rule | Satisfied by |
|---|---|
| **P-37** (new) | No physical fact under `execution`; target is a logical name resolved by provisioning before execution |
| **ADR-0012** | No cloud primitive / provider key above the adapter — none in config at all |
| **AD-033 / Doc 17** | `dbiz-managed` removed; ownership+topology live in provisioning, not execution |
| **R-04.6 / C-04.14** | dry-run at run scope, realised inside the adapter — one code path |
| **R-7.2 / C-04.13** | provider appears only as a resolved value behind the Remote Adapter |
| **R-15.1** | every remaining field has a real reader (the launcher/resolver); theatre deleted |
| **R-15.17 / C-15.10** | `execution.target` selects a *binding*, not a workflow/orchestration path; capability invariant |
| **C-15.13** | no provider/tool-named configuration key |
| **INV-3 / R-05.1/2** | EP still initiates all cross-plane traffic; launcher→EP dispatch is intra-plane |

No new capability, Platform Service, canonical state, or contract version (infrastructure choice is invisible across the plane boundary — ADR-0012 §7). The EP-side change (`carlislehomes/`) is a **separate Execution-Plane commit** and does not travel with this IP-side ADR (CLAUDE §4 — no cross-plane change in one step).

## 11. Backward compatibility & recommendation

**Backward compatibility — deliberately none.** Per the review-board directive, this optimises for architectural correctness over compatibility. The removed tokens are **deleted, not aliased**: no `mode`/`strategy` shim survives. This is safe *because the evidence in §1 shows they never drove capability behaviour* — only the `dry-run` bit did, and it is preserved at the run scope. A clean break therefore changes the configuration surface while changing **zero** capability behaviour.

**Migration plan (behaviour-preserving by construction).**
1. `mode:live, strategy:local` (the committed default) → `execution.target: local`.
2. `dry-run` → `run.dryRun: true` / `--dry-run` (adapter-internal branch retained; reconcile the orchestrator-level dry-run branches `orchestrator.js:126-152` toward R-04.6).
3. Delete `strategy`, the `…-cloud-…` and `provisioned-…` modes, **and any `remote`/`provider`/`endpoint` config** — pure deletion, no runtime branch lost; re-key infra readiness dimensions off the tenant deployment record first.
4. Remove `dbiz-managed-*` outright (AD-033).
5. Ship `local` only. Schedule the **name→binding resolver + Remote Adapter** as a separate capability increment, its conformance suite authored **before** first implementation (ADR-0012 R-14.12); named targets fail closed until it exists.

**Recommendation.** **Adopt.** Move ADR-0037 to ACCEPTED through the §9 review pipeline, land the Doc 15/16/17 amendments (including P-37), then execute the EP-side migration as its own Execution-Plane change. The simplification is not a trade-off against the architecture — it is the architecture the frozen invariants already require, and P-37 is the rule that keeps it true for the next decade.

## 12. Affected components

[15](../architecture/15-configuration-model.md) §2 · [16](../architecture/16-runtime-model.md) · [17](../architecture/17-deployment-topology.md) §3 · [04](../architecture/04-execution-plane-architecture.md) R-04.6 · [05](../architecture/05-cross-plane-communication.md) R-05.1/2 · the generated EP solution `carlislehomes/src/runtime/readiness/` (`modes.js`, `strategy.js`, `dimensions.js`), `src/config/execution.config.json`, `.env` · the IP solution-generator emitters (`solution-generator.ts`, `solution-export.ts`).

## 13. Migration strategy

The behaviour-preserving migration is specified in §11 (**Migration plan**): the five committed steps map `mode:live, strategy:local` → `execution.target: local`, relocate `dry-run` to the run scope, delete the removed tokens (pure deletion, no runtime branch lost), remove `dbiz-managed-*` (AD-033), and ship `local` only, with the name→binding resolver scheduled as a later increment that fails closed until it exists. The migration executes as its own Execution-Plane change (§11 Recommendation); no Intelligence-Plane runtime behaviour changes.

## 14. Version impact

This is a **configuration-surface** change, not a capability-contract change. The `execution` configuration block takes a breaking, deliberately un-aliased shape (§11: "Backward compatibility — deliberately none"), so the EP configuration schema increments a **major** version; the cross-plane contracts ([05](../architecture/05-cross-plane-communication.md), [20](../architecture/20-cross-plane-contracts.md)) and all capability behaviour are **unchanged** (zero behavioural delta by construction). No shared-package major version is triggered.
