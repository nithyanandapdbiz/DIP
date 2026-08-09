# 12 — Capability Orchestration

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.4
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 4 and 10

**This document owns:** the twelve-stage lifecycle, what each stage does, which plane executes it, and why no stage may be bypassed.
**It does not own:** what a capability is ([11](11-capability-model.md)), transport ([05](05-cross-plane-communication.md)), contract shape ([20](20-cross-plane-contracts.md)), or evidence integrity ([10](10-evidence-flow-model.md)).

---

## 1. The twelve stages

**R-12.1** Every capability traverses these stages, in this order. **There are no optional stages and no permitted bypass.**

| # | Stage | Plane | Purpose |
|---|---|---|---|
| 1 | **Planning** | IP | Determine what shall be achieved and the strategy for achieving it |
| 2 | **Discovery** | EP | Observe the actual state of the customer's systems |
| 3 | **Context** | EP → IP | Assemble, minimise and scrub what reasoning requires |
| 4 | **Architecture Review** | IP | Does the plan conform to the platform's architecture? |
| 5 | **Policy Review** | IP | Does it conform to tenant and platform policy? |
| 6 | **Guardrail Review** | IP | Are safety, cost, blast-radius and residency limits respected? |
| 7 | **Execution Planning** | IP | Author the sealed execution package |
| 8 | **Execution** | EP | Sequence the package against customer systems |
| 9 | **Evidence** | EP | Capture, hash, and custody what happened |
| 10 | **Reflection** | IP | Interpret results; identify gaps and follow-on work |
| 11 | **Certification** | IP | Render the deterministic verdict |
| 12 | **Reporting** | IP | Present outcomes to consumers |

**R-12.2** Stages 4, 5 and 6 are the **governance triad**. No capability may bypass them (R-11.6).

**R-12.3** Stage 7 emits exactly **one** sealed execution package (R-4.1).

**R-12.4** Stages 8 and 9 SHALL be possible with the Intelligence Plane unreachable (INV-7).

**R-12.5** Stages 10, 11 and 12 SHALL NOT be performed by the Execution Plane under any circumstance (R-2.3, R-10.1).

## 2. Cross-plane structure

The twelve stages span both planes. Shown below for a capability with one directed stage (Execution) — the common case, giving two crossings. A capability with a directed Discovery stage has three, using the identical contract (§5.2):

```
EP:        [2 Discovery]──[3 Context]──▶                    ──[8 Execution]──[9 Evidence]──▶
                                       │                    ▲                              │
                                       ▼                    │                              ▼
IP:  [1 Planning]──────────▶[4 Arch]─[5 Policy]─[6 Guardrail]─[7 Exec Planning]    [10 Reflection]─[11 Certification]─[12 Reporting]
                                                                    │
                                                              sealed package
```

**R-12.6** Every cross-plane exchange uses the **single** execution package contract ([20](20-cross-plane-contracts.md)) and is EP-initiated ([05](05-cross-plane-communication.md)). The number of exchanges per run is `1 + (declared directed stages)` — see §5.2.

**R-12.7** Stage 1 may execute before context is available, on tenant configuration and capability definition alone. Planning determines *intent*; Discovery determines *reality*; the reviews reconcile them.

## 3. Why each stage is mandatory

A stage that can be skipped will be skipped, so each carries its justification.

| Stage | Consequence of omission |
|---|---|
| **Planning** | Execution without intent; nothing to certify *against* |
| **Discovery** | Reasoning over assumed rather than actual state. *The predecessor required the caller to supply the application surface — which is not a discovery capability, it is an input contract with the capability missing* |
| **Context** | Either reasoning without information, or unscrubbed customer data crossing the boundary |
| **Architecture Review** | Non-conformant plans reach execution; drift becomes undetectable at the only point it is cheap to catch |
| **Policy Review** | Tenant and platform policy become advisory |
| **Guardrail Review** | No blast-radius, cost, or residency limit is enforced before real systems are touched |
| **Execution Planning** | Orchestration reverts to a conversation, and INV-7 becomes unachievable |
| **Execution** | — |
| **Evidence** | Nothing to certify over; verdicts become unfalsifiable assertions |
| **Reflection** | Results are reported without interpretation; gaps stay invisible |
| **Certification** | No verdict — the platform's entire output |
| **Reporting** | Certified outcomes reach nobody |

## 4. Structural enforcement — invalid states unrepresentable

**R-12.8** A capability missing a stage SHALL fail to **compile**. A capability skipping a stage at runtime SHALL be **unconstructible**.

### 4.1 Omission is a compile error

The capability interface declares all twelve stages as **required** members. A capability that does not supply one does not typecheck, and therefore does not build. This is the strongest form in the enforcement hierarchy (C-0.1): the violation cannot be expressed.

### 4.2 Skipping is a type error

**R-12.9** Each stage consumes the **output type of its predecessor**. Stage outputs are opaque, constructible only by the stage that produces them.

```
PlanningResult ─▶ DiscoveryResult ─▶ ContextResult ─▶ ArchitectureVerdict
  ─▶ PolicyVerdict ─▶ GuardrailVerdict ─▶ ExecutionPackage ─▶ ExecutionResult
  ─▶ EvidenceSet ─▶ ReflectionResult ─▶ Certification ─▶ Report
```

**Because a stage's input can only be produced by its predecessor, there is no way to invoke stage N without having run stage N−1.** Skipping is not forbidden by a rule that could be violated — it is a state with no constructible value.

**R-12.10** Stage result types SHALL NOT be constructible outside their producing stage. No public constructor, no literal, no cast sanctioned in review.

**R-12.11** The framework SHALL NOT provide a bypass, override, debug path, or test hook that constructs a stage result without running the stage.

**R-12.11 is where this design would actually fail in practice.** Type-level guarantees are routinely defeated by a helper added for testing convenience. A test seam that fabricates a `GuardrailVerdict` reintroduces exactly the bypass the type system removed — and it will be used in production code within a year. Tests exercise capabilities through the real framework.

### 4.3 Non-applicability is explicit

**R-12.12** A stage that legitimately performs no work SHALL return a typed **not-applicable** result carrying a reason. It SHALL NOT return an empty or default value (R-11.16).

This preserves the distinction between *"this stage found nothing"*, *"this stage does not apply here"*, and *"this stage did nothing"* — three states that are identical to a consumer unless the type makes them distinct.

### 4.4 The four mechanisms

Per C-0.2, stage completeness is enforced independently at compile time, through type flow, at registration, and in CI — four mechanisms, exceeding the constitutional minimum of three.

## 5. Extension points — one lifecycle, capability-specific behaviour

**Closed by [ADR-0002](../adr/ADR-0002-capability-extension-points.md).**

**R-12.18** There is exactly **one** orchestration lifecycle for the platform. A capability may extend the framework internally; it SHALL NEVER redefine or bypass it.

```
One Platform → One Orchestration Framework → One Capability Contract
             → Six Capability Implementations → capability-specific extensions only
```

**R-12.19** A second orchestration model SHALL NOT be introduced unless a platform requirement genuinely cannot be represented through an extension. Such a change requires an approved ADR amending R-11.5.

### 5.1 Stage extensions

**R-12.20** A capability may declare zero or more **extensions** on a stage. An extension:

- executes **within** its stage, never between stages;
- consumes the stage's declared input type and produces the stage's declared **output type**;
- is subject to the same governance triad as its host stage;
- SHALL NOT introduce a stage, alter stage order, or skip a stage.

**R-12.21** An extension SHALL NOT alter its host stage's input or output type.

**R-12.22** Extensions SHALL be declared in the capability registry ([11](11-capability-model.md) R-11.11), not embedded silently in an implementation.

**R-12.21 is what keeps this mechanism from becoming the bypass it superficially resembles.** Because an extension's input and output are its host stage's own types, an extension is invisible to the lifecycle — the stage boundary is unchanged, and so is everything defined against it. An extension permitted to produce a different type would be a stage in disguise, and the typestate chain of §4.2 would no longer constrain it.

### 5.2 Directed stages

**R-12.23** A stage that must act on customer systems may declare itself **directed**, meaning it requires an authored execution package to proceed.

| Capability | Directed stages | Exchanges |
|---|---|---|
| Functional Testing · Dev-Change · Performance · Security · Penetration | Execution | 2 |
| Inverse-Flow Discovery | Discovery, Execution | 3 |

**R-12.24** A directed stage uses the **identical** execution package contract — identical authoring, sealing, signing, validity, verification, evidence binding and governance. **There is no second package type.**

**R-12.25** A stage other than Discovery or Execution SHALL NOT be directed without an approved ADR.

**What varies is how many times one invariant exchange occurs, not what the exchange is.** That is a property of the capability, not a different architecture — which is precisely why the Inverse-Flow Discovery Engine can be built as a genuine discovery capability rather than, as in the predecessor, an input contract with the capability missing.

## 6. Governance is inside the lifecycle

**R-12.13** The governance triad SHALL be evaluated by the **single Policy Decision Point** (R-03.6). Stages 4–6 assemble context and delegate; they contain no policy logic.

**R-12.14** A failed review SHALL produce a **refusal**, which halts the run ([05](05-cross-plane-communication.md) §3). It SHALL NOT produce a warning that execution proceeds past.

**R-12.15** Review outcomes SHALL be recorded as evidence, so that *why* a run was permitted is auditable, not only *that* it was.

**R-12.14 is the difference between a gate and a label.** A review that emits a warning and allows execution is not governance; it is annotation. The predecessor's most consequential drift was of exactly this shape — controls that reported rather than prevented.

## 7. Degraded operation

**R-12.16** When the Intelligence Plane is unreachable, stage behaviour is fully determined by the degradation matrix ([05](05-cross-plane-communication.md) §4).

| Stages | Degraded behaviour |
|---|---|
| 1, 4–7 | Unavailable. A cached package substitutes for their output where one is valid |
| 2, 3, 8, 9 | **Always available.** These are Execution Plane stages and never require reasoning |
| 10–12 | **Deferred and queued.** Never delegated, never skipped (R-10.2) |

**R-12.17** No run may emit a verdict in a degraded state. Results carry `DEGRADED` or `DEGRADED — UNCERTIFIED` (R-10.3).

**Testing continues; judgment waits.** That sentence is the entire operational promise of the sovereign split, and this table is where it is either true or false.

## 8. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-12.1** | Every capability implements all twelve stages | Compile-time interface; registration; CI gate |
| **C-12.2** | A capability omitting a stage fails to compile | Negative compile test |
| **C-12.3** | A stage result type is not constructible outside its producing stage | Construction-attempt negative test |
| **C-12.4** | No bypass, override, debug path, or test hook fabricates a stage result | Framework source scan; test-seam audit |
| **C-12.5** | Stages execute in the declared order | Invocation-order trace test per capability |
| **C-12.6** | The governance triad executes for every run of every capability | Trace assertion — six capabilities, three stages |
| **C-12.7** | A failed review halts the run and does not warn-and-continue | Failed-review negative test |
| **C-12.8** | Review outcomes are recorded as evidence | Evidence content test |
| **C-12.9** | Stages 2, 3, 8, 9 complete with the Intelligence Plane unreachable | Severed-boundary test per capability |
| **C-12.10** | Stages 10–12 never execute in the Execution Plane | Plane-boundary source gate |
| **C-12.11** | No verdict is emitted in a degraded state | Degraded-run assertion |
| **C-12.12** | Non-applicable stages return a typed reason, never an empty value | Registry and result inspection |
| **C-12.13** | Exactly one execution package is emitted per run | Package-count assertion |
| **C-12.14** | Every exchange uses the single package contract, and the count equals 1 + declared directed stages | Transport trace assertion against the capability declaration |
| **C-12.15** | No extension alters its host stage's input or output type | Type-signature gate over declared extensions |
| **C-12.16** | Every extension is declared in the registry | Registry-versus-implementation reconciliation |
| **C-12.17** | Only Discovery and Execution are directed | Registry inspection gate |
| **C-12.18** | Exactly one orchestration lifecycle exists | Framework source scan for alternative lifecycles |

**C-12.4 deserves its own gate rather than folding into C-12.3.** The type system prevents an *accidental* bypass; only an audit of the framework's own surface prevents a *deliberate* one added for convenience. The predecessor's bypasses were all added deliberately, by competent engineers, for defensible short-term reasons.

## 9. Open items

| # | Item | Target |
|---|---|---|
| **AD-027** | Stage-level timeout and cancellation semantics | M1.5 — [16](16-runtime-model.md) |

**AD-026 is CLOSED** by [ADR-0002](../adr/ADR-0002-capability-extension-points.md): extension points within the single lifecycle, never an alternative orchestration model. See §5.
