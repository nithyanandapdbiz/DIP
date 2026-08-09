# ADR-0002 — Capability Extension Points, Not Alternative Orchestration

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-026
**Affects:** [11](../architecture/11-capability-model.md), [12](../architecture/12-capability-orchestration.md), [20](../architecture/20-cross-plane-contracts.md), all six capabilities

---

## 1. Problem

[12](../architecture/12-capability-orchestration.md) fixed two cross-plane exchanges per run: context outbound with a package returned, then results outbound with certification returned.

The Inverse-Flow Discovery Engine does not fit. For it, discovery **is** the primary work rather than a preliminary observation, and a directed crawl of customer systems requires an authored package of its own. That implies a third exchange — and C-12.14, asserting exactly two, would become capability-dependent.

A conformance criterion that varies by capability is a crack in the claim that all six share one orchestration.

## 2. Context

- **R-11.5** requires all six capabilities to share one orchestration framework. A capability appearing to need a different one is evidence the framework is wrong.
- The predecessor's capability set fractured precisely here: two of its six had no execution path at all, and one failed silently while reporting success. Divergent capability architectures were the mechanism.
- Governance, certification, telemetry, observability, policy enforcement and the review pipeline are all defined **once**, against one lifecycle. Each alternative orchestration model multiplies every one of them.
- The Penetration and Performance engines may raise the same question later. A ruling that only resolves Discovery would be re-litigated.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **A second orchestration model for discovery-shaped capabilities** | Rejected. Two lifecycles means two governance integrations, two certification paths, two telemetry schemas, two review pipelines — and a permanent question of which model a new capability belongs to. This is the exact failure mode R-11.5 exists to prevent. |
| **Make the exchange count capability-declared, with no other change** | Insufficient alone. It removes the contradiction in C-12.14 but does not say *what* an additional exchange is, so each capability would invent its own answer — divergence by omission rather than by design. |
| **Force discovery into a single exchange by pre-supplying the surface** | Rejected outright. This is precisely the predecessor's defect: requiring the caller to supply the application surface is not a discovery capability, it is an input contract with the capability missing. |
| **Extension points within the single lifecycle** | **Selected.** Capability-specific behaviour is expressed inside the framework rather than beside it. |

## 4. Decision

**There is exactly one orchestration lifecycle for the platform.** Capability-specific behaviour is expressed through two extension mechanisms, both operating strictly *within* the standard lifecycle. Neither introduces, reorders, removes, or bypasses a stage.

### 4.1 Stage extensions

A capability may declare zero or more **extensions** on a stage. An extension:

- executes **within** its stage, never between stages;
- consumes the stage's declared input type and produces the stage's declared output type;
- is subject to the same governance triad as its host stage;
- **cannot** introduce a stage, alter stage order, or skip a stage.

Because an extension's input and output types are the stage's own, an extension is invisible to the lifecycle. The stage boundary is unchanged, and so is everything defined against it.

### 4.2 Directed stages

A stage that must act on customer systems may declare itself **directed**, meaning it requires an authored execution package to proceed.

- **Execution** (stage 8) is directed for every capability.
- **Discovery** (stage 2) is directed for capabilities whose discovery is itself work performed against customer systems.

A directed stage uses the **identical** execution package contract ([20](../architecture/20-cross-plane-contracts.md)) — identical authoring, sealing, signing, validity, verification, evidence binding, and governance. There is no second package type.

### 4.3 The consequence for exchange count

```
cross-plane exchanges per run = 1 + (number of directed stages)
```

| Capability | Directed stages | Exchanges |
|---|---|---|
| Functional Testing, Dev-Change, Performance, Security, Penetration | Execution | 2 |
| Inverse-Flow Discovery | Discovery, Execution | 3 |

**The orchestration contract is unchanged.** What varies is how many times one invariant exchange occurs — which is a property of the capability, not a different architecture. Every exchange is the same exchange.

**C-12.14 is amended** from "exactly two exchanges per run" to "every exchange conforms to the single contract, and the count equals one plus the capability's declared directed stages." The criterion remains mechanically checkable and is no longer capability-dependent in form.

## 5. Consequences

**Positive**

- One lifecycle, one contract, one governance integration, one certification path, one telemetry schema, one review pipeline — across all six capabilities and any seventh
- A new capability with unusual shape has a sanctioned way to express it that does not fork the architecture
- The Discovery capability can be built as a genuine discovery capability rather than an input contract
- Extensions are declared in the registry, so capability-specific behaviour is **visible and reviewable** rather than buried in an implementation

**Negative, and accepted**

- **An extension mechanism is a bypass mechanism if it is not tightly bounded.** This is the real risk, and it is why extensions are type-constrained to their host stage's input and output rather than being free functions. An extension that could produce a different type could effectively become a stage.
- **Directed stages make the number of exchanges variable**, so transport-level assertions must read the capability's declaration rather than a constant. Slightly more complex; the alternative was a false constant.
- **A future capability may want a directed stage that is neither Discovery nor Execution.** Permitted only by ADR, so the set stays enumerable.

**Explicitly prohibited by this decision**

| Prohibited | Because |
|---|---|
| A second orchestration lifecycle | R-11.5 |
| A second execution package type | R-20.1; one contract, versioned |
| An extension that changes a stage's input or output type | It would be a stage in disguise |
| An extension that bypasses the governance triad | R-11.6 |
| A directed stage other than Discovery or Execution, absent an ADR | Keeps the set enumerable and reviewable |

## 6. Migration strategy

None required — no implementation exists. This is why the ruling was sought before M1.5 fixed the runtime model around a two-exchange assumption.

Had it been deferred until implementation, the migration would have been severe: transport, telemetry, governance integration and certification all encode the exchange count, and a capability built under the pre-supplied-surface workaround would have needed rebuilding rather than extending.

## 7. Version impact

**No contract version change.** The execution package contract is untouched — this decision constrains *how many times* it is used, not its shape.

The **capability registry schema** gains two fields: per-stage extension declarations, and a per-stage directed flag. As the registry has never been published, this is a baseline definition rather than a version change.

Forward obligation: adding a directed stage to an existing capability changes its exchange count and is therefore a **minor** capability version — observable to telemetry and certification, and requiring no contract change.

## 8. Affected components

| Component | Impact |
|---|---|
| [12](../architecture/12-capability-orchestration.md) | Gains §5 extension mechanism; C-12.14 amended; AD-026 closed |
| [11](../architecture/11-capability-model.md) | Registry declares extensions and directed stages (R-11.11) |
| [20](../architecture/20-cross-plane-contracts.md) | Unchanged — one package contract serves every directed stage |
| [05](../architecture/05-cross-plane-communication.md) | Exchange-count assertions read the capability declaration |
| [16](../architecture/16-runtime-model.md) | Must not assume a fixed exchange count |
| [18](../architecture/18-governance-model.md) | Governance triad applies to extensions as to host stages |
| Inverse-Flow Discovery Engine | Buildable as a genuine discovery capability |
