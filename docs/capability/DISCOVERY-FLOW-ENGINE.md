# Discovery Flow Engine

**Capability 3 of 6** — the **Inverse-Flow Discovery Engine** ([document 11](../architecture/11-capability-model.md) §3) · [ADR-0023](../adr/ADR-0023-discovery-flow-engine-internal-structure.md)

**186 agents · 16 domain orchestrators · 1 master orchestrator · 12 stages · 2 reasoning modes · 1 workflow**

---

## 1. Two names, and why both stay

The architecture calls capability 3 the **Inverse-Flow Discovery Engine**. The brief that commissioned this work called it the **Discovery Flow Engine** and named its master orchestrator `DiscoveryFlowOrchestrator`.

Neither was changed. Document 11 is frozen and hash-baselined; renaming it would break the closure baseline for no gain. The capability's architectural identity is `inverse-flow-discovery`; the implementation carries the name the brief gave it. The conformance gate asserts document 11 still says *Inverse-Flow Discovery Engine*, so the two cannot quietly converge on the wrong one.

## 2. What it does

Everything else in the platform starts from a written requirement. This starts from the running application and works backwards: crawl it, understand it, reconstruct the requirements nobody wrote down, generate the tests that verify them, and publish the lot into Azure DevOps or Jira.

```
DiscoveryFlowOrchestrator  (accepts the request, loads configuration, resolves four adapters)
        │
        ▼
┌──────────────────── the twelve-stage lifecycle ────────────────────┐
│                                                                    │
│  1 Planning        IP   scope validation, boundary, rate, depth    │
│  2 Discovery       EP   19 surface probes  ← the customer's app    │
│  3 Context      EP→IP   minimise, then reconstruct intelligence    │
│  4 Arch Review     IP   application model            ┐             │
│  5 Policy Review   IP   requirement reconstruction   ├ TRIAD       │
│  6 Guardrail Rev.  IP   QA asset generation          ┘             │
│  7 Exec Planning   IP   work items · repository · automation       │
│  8 Execution       EP   the tests actually run                     │
│  9 Evidence        EP   capture, hash, custody                     │
│ 10 Reflection      IP   healing · defects · learning               │
│ 11 Certification   IP   release verdict                            │
│ 12 Reporting       IP   synchronisation · executive pack · board   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

The canonical workflow named forty-five steps — fifteen phases, each with a review and a certification. Those are **internal structure of these twelve**, not a lifecycle of their own (R-12.18). The full mapping is in [ADR-0023 §3.1](../adr/ADR-0023-discovery-flow-engine-internal-structure.md).

## 3. AI mode and non-AI mode are the same workflow

```yaml
discovery:
  aiEnabled: true | false
```

The obvious implementation of two modes — a flag consulted per stage — produces two workflows that drift apart within a release. This does the opposite of a branch.

**Disabling reasoning withholds proposals. It adds no code path at all.** Every agent already receives its reasoning as a proposal input and already has deterministic logic that must work when the proposal is `null` (INV-7). Turning reasoning off simply stops delivering them, and every agent takes the degraded path it was always required to have.

The two modes therefore *cannot* diverge — there is nothing to diverge. A stage cannot support only one mode, because **a stage never learns which mode it is in**.

Proven by execution: both modes traverse identical stages and invoke an **identical set of agents**. With reasoning disabled, zero proposals are delivered and 20 requirements are still reconstructed.

| | AI enabled | AI disabled |
|---|---|---|
| Relationships | observed **+ inferred**, each marked | observed only |
| Entity names | domain language — "purchase basket" | structural — "checkout" |
| Business rules | implied rules, if they cite a discovered fact | enforced constraints only |
| Repository search | reordered by closeness | lexical and vector order stands |
| Risk | may be **raised** above the matched factors | matched factors only |
| Coverage | wider | narrower, and entirely measured |

Reasoning may **raise** a risk level and never lower one; may **reorder** search results and never add one; may **extend** requirements and never remove an observed fact. Enrichment on a deterministic floor.

`discovery.aiEnabled` is translated onto the framework's capability-neutral `ai.enabled` by the master orchestrator — framework code that read a capability's own key would be branching on a capability identity, which C-11.11 forbids.

## 4. The sovereignty boundary is a type

Inverse-flow discovery has a problem the Functional Testing Engine does not: the Intelligence Plane must reason about the customer's application, so application **structure** has to cross. "Nothing crosses" was not available as an answer.

The line is between structure and content, and it is in the type system:

| | Plane | Carries |
|---|---|---|
| `ObservedArtefact` | **EP** | `values` — cookie contents, field contents, response bodies |
| `ApplicationFact` | **IP** | kind, id, label, path, `attributeNames: readonly string[]` |

A cookie's name and scope are structure and cross. **A cookie's value cannot cross, because `ApplicationFact` has no field that could hold it.** One function — `minimise` — is the sole crossing point, so auditing what crosses means auditing one function rather than every agent that ever touched an artefact.

The same reasoning gives `EvidenceReference` a hash and a locator and no content field, and gives `RepositoryMatch` an identifier and a score and no excerpt. All 19 discovery probes and all 14 repository and automation searches run in the **Execution Plane**.

Labels are scrubbed on the way across: `Invoice INV-4471 for j.okonkwo@example.com` becomes `Invoice {reference} for {email}`. A page title is structure; a page title with a customer's name in it is structure with content attached.

## 5. Every stage: execute → review → decide → certify

Thirty-six governance agents — three for each of the twelve stages — because each stage has different ways of being wrong and one generic reviewer would check none of them properly.

**Refusal is the only exit.** `runPhase` throws when certification refuses; a refused phase cannot produce a sealed stage result, so the run stops with the reason attached. There is no argument that skips certification and no flag that downgrades it to a warning.

The three are separate agents because **a reviewer that can act on its findings can excuse them**, and a certifier that can add a finding can manufacture grounds for a refusal it wanted anyway. Review produces findings and cannot act; decision acts and cannot invent; certification reads both and can refuse either.

What the reviewers actually check — one example per stage:

| Stage | A blocking finding |
|---|---|
| planning | no origin is in scope |
| discovery | a cookie descriptor carries a value |
| context | a fact carries observed values |
| architecture-review | the model has neither a journey nor a service |
| policy-review | a story cites no source fact |
| guardrail-review | a step carries no expected result |
| execution-planning | generated asset kinds do not match the kinds found missing |
| execution | the environment was not validated |
| evidence | a reference has no hash or no locator |
| reflection | a heal is validated without an observed passing retry |
| certification | a verdict carries no reason |
| reporting | readiness is NOT MEASURED and the report claims READY |

## 6. Reconstruction is always sourced

Every virtual story carries `sourceFactIds`. **A story that cannot name what it was reconstructed from is refused, not published** — inverse-flow discovery exists precisely because the documentation already contains unsourced claims.

```
Business capability  →  Epic
Journey              →  Feature
Journey step         →  Story  (+ every control and field on that step)
Acceptance criterion →  Task
```

## 7. Every click, every input — and why this engine can do it

The brief requires a test case to cover navigation, every click and every input, each with an expected result. A capability starting from a written story cannot do it: the story does not enumerate the controls.

This engine starts from the application, so **the controls are the input**. Steps are generated one per discovered field and one per discovered control. The enumeration is measured.

```
navigate  /checkout                  → the page loads and is interactive
input     quantity                   → the value is accepted and shown
input     delivery address           → the value is accepted and shown
click     Pay now                    → activating it produces its observed transition
assert    <acceptance criterion>     → the criterion holds
cleanup   session and created data   → the environment is returned to its prior state
```

Nine test kinds — functional, api, integration, negative, boundary, security, accessibility, performance-awareness, edge-case — each generated only where it applies. `qa.completeness` **refuses** an asset missing any mandatory field or any expected result, rather than repairing it.

## 8. Adapters are invoked, not merely declared

The audit of capability 1 found nine of ten adapter methods declared and never called: the integration existed as a type and not as a behaviour. This engine calls them, and the gate measures it on every build.

```
Azure DevOps : Epic → Feature   → User Story → Task
Jira         : Epic → (none)    → Story      → Sub-task
```

Jira has no Feature level. The engine does not silently drop it: every feature is recorded **unpublished with the provider's limitation as the reason**, and its stories re-parent to the epic. A capability that quietly dropped the level would publish an orphaned backlog and report success.

Every publication returns a `SyncRecord` carrying the provider identifier, or `published: false` **with a reason**. The reviewer refuses a record that claims publication without an identifier, and one that refuses without a reason.

The conformance gate checks adapter coverage **platform-wide** — a method no capability invokes fails the build — and is fault-proved by adapters that are correctly typed and record nothing.

## 9. Vector intelligence, without a vendor

Hashed term vectors, sublinear weighting, L2 normalisation, cosine kNN with a similarity floor. Deterministic, provider-free, and genuinely vectors.

**They are not learned embeddings.** "Cancel an order" and "abort a purchase" are close to a learned model and far apart here. That limit is stated in the source rather than hidden, because a vector search that silently under-recalls is worse than one whose reach is known.

The design consequence: a ranking proposal may **reorder** results and may not **add** to them. Recall is always deterministic and always the floor; reasoning improves precision on top of it.

Vector **memory** outlives the run. It holds vectors, identifiers and labels — never text — so it is a set of directions, not a copy of the customer's application.

## 10. Census

| | |
|---|---|
| Agents | **186** — 150 domain, 36 governance |
| Domains | 16, each with an orchestrator that actually runs its agents |
| Plane split | 42 Execution Plane · 144 Intelligence Plane |
| Reasoning | 25 declare an AI Capability Class · **161 wholly deterministic** |
| Prompt contracts | required of all 25, each with a non-empty rejection rule |
| Tests | 54 |
| Conformance properties | 20, executed |

The brief asked for 100–140 specialised agents. **This is 186, and 150 excluding governance — ten over.** Recorded in [ADR-0023 §6](../adr/ADR-0023-discovery-flow-engine-internal-structure.md) rather than corrected by deleting working agents to reach a number.

## 11. What cannot be bypassed

| Mechanism | Prevents |
|---|---|
| A module-private seal on stage results | Forging a stage result; skipping ahead (R-12.10, R-12.11) |
| `runPhase` throws on refusal | A review whose findings are logged and ignored |
| `ApplicationFact` has no `values` field | A cookie, field or response value reaching the Intelligence Plane |
| `EvidenceReference` has no content field | A customer artefact crossing with its reference |
| `promptContract.rejectionRules` is required and non-empty | An agent that relays reasoning rather than deciding (C-13.1) |
| Agent invocations are **recorded**, never declared | An audit trail naming agents that did not run |
| Adapter coverage is checked platform-wide | An SPI that is declared and never wired |

Each is proven by a test that attempts the violation and observes the refusal.

---

*`node governance/verification/verify-discovery-conformance.js` re-executes every claim above. Generated documentation is not a substitute for the run.*
