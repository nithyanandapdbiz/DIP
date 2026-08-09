# 13 — AI Operating Model & Provider Integration

**Status:** **FROZEN** · **Version:** 1.1 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.5
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 8 and 12
**Resolves:** AD-023, AD-030
**Amendments:** v1.1 — §7 AI Capability Classes added by [ADR-0016](../adr/ADR-0016-ai-tool-agnosticism.md) (additive)

**This document owns:** the agent contract, AI boundaries, provider abstraction, AI-disabled operation, provider integration, and the **AI Capability Class taxonomy**.
**It does not own:** tool adapters ([14](14-tool-operating-model.md)), the orchestration lifecycle ([12](12-capability-orchestration.md)), governance evaluation ([18](18-governance-model.md)), or threat mapping ([22](22-security-threat-model.md)).

---

## 1. The boundary

**R-13.1** **AI generates material. Deterministic code renders every decision.** No branch, threshold, gate, verdict, or tool selection is computed by a model (INV-4, R-8.2).

**R-13.2** The platform SHALL function correctly with AI **disabled**. This is a supported operating mode, not a fallback.

**R-13.3** AI enrichment is **additive only**. It may refine or elaborate structure; it may never remove, override, or reshape it.

### Why this boundary and not a softer one

Three independent justifications, each sufficient alone:

**Certification.** A verdict computed by a model is not reproducible, and an irreproducible verdict cannot be certified — a customer's auditor must be able to re-derive the outcome from the evidence.

**Security.** If a model cannot determine control flow, **prompt injection ceases to be a privilege-escalation path**. There is no privilege for injected instructions to reach. This is why R-13.1 is a security control and not merely a determinism one ([22](22-security-threat-model.md) §3.4).

**Commercial.** Many target environments prohibit model inference over their data outright. A platform that requires AI cannot be sold into them at all.

## 2. The agent contract

**R-13.4** An **agent** is a pure function, invoked **exactly once** per attempt. There is no autonomous loop, no self-directed planning, and no model-selected tool use.

**R-13.5** Every agent SHALL compute a **deterministic baseline first**, before any model is consulted. The baseline is the result; enrichment is an improvement to it.

**R-13.6** Agent invocation SHALL be **flag-gated per agent**, so any individual agent can be disabled without disabling the platform.

**R-13.7** Model output SHALL be **schema-validated before use**. Invalid output is **discarded**, never repaired by a further model call.

**R-13.8** Numeric values derived from model output SHALL be **clamped** to declared bounds.

**R-13.9** Output **shape** SHALL be identical with AI enabled and disabled. Only depth and richness differ (R-8.6).

**R-13.7 deserves emphasis.** Repairing invalid model output with another model call is the natural instinct and it is wrong: it converts a bounded failure into an unbounded retry loop, doubles cost on exactly the inputs that are already misbehaving, and produces output whose provenance is a chain of corrections nobody can audit. **Discarding is deterministic; repairing is not.**

**R-13.5 is what makes R-13.2 real.** If the baseline is computed first and enrichment is additive, disabling AI removes richness and nothing else. If AI ran first with a deterministic fallback bolted on afterwards, the two paths would diverge and the AI-disabled path would be the untested one.

## 3. Provider abstraction

**R-13.10** Every model provider sits behind **one platform-owned interface**. A provider name SHALL NOT appear outside its adapter (INV-5, R-7.2).

**R-13.11** Provider selection is driven by **tenant configuration**, never by environment variable or build flag (R-7.4).

**R-13.12** Adding a provider SHALL require **only** implementing the interface and passing the conformance suite. It SHALL NOT require a change to any agent, capability, or the framework.

**R-13.13** Configuration keys SHALL be **capability-named**, never provider-named (R-7.3).

**R-13.14** Every provider implementation SHALL pass a shared **conformance suite** before registration.

**R-13.14 is what makes "provider-agnostic" true rather than aspirational.** An interface alone guarantees a shape, not a behaviour. Without an executable conformance suite, the second provider integration silently acquires the first provider's quirks, and the abstraction has been decorative since the day it was written.

## 4. Sovereignty of inference

**R-13.15** Model credentials are held **exclusively in the Execution Plane** and are configured by the customer (INV-2).

**R-13.16** **Zero external AI egress** SHALL occur until a tenant explicitly configures a provider. The default posture is no inference.

**R-13.17** Data sent to a provider SHALL pass the full egress pipeline — classified, minimised, scrubbed, validated ([09](09-data-flow-model.md) §2).

**R-13.18** No cross-tenant context, retrieval corpus, or few-shot content ([07](07-tenant-isolation.md) dimension 8).

**R-13.19** Tenant-declared residency SHALL constrain which providers and regions are permissible.

## 5. PII posture — AD-023 resolved

**R-13.20** Scrubbing SHALL be **allow-list based on structure** and detection-based on content — both, not either.

**R-13.21** **On detection uncertainty, the field is dropped.** Where a scrubber cannot determine whether a value contains protected data, the value SHALL NOT be transmitted.

**R-13.22** A dropped field SHALL be recorded as dropped, so reasoning knows information is absent rather than empty.

**R-13.23** Scrubbing failure on a required field SHALL cause the request to be **refused**, not transmitted unscrubbed.

**R-13.21 is the decision AD-023 existed to force.** No detector is perfect, so the architecture must state what happens when detection is uncertain. Left to implementation, the answer is always *transmit* — because that is what every unhandled case does. **Fail-closed here costs reasoning quality; fail-open costs sovereignty.** Only one of those is recoverable.

## 6. Degradation

**R-13.24** Provider unavailability is **unavailability**, not refusal: the platform degrades to the deterministic baseline and continues ([05](05-cross-plane-communication.md) §3).

**R-13.25** A result produced without enrichment SHALL carry its assurance state structurally (R-10.3). Degradation reduces richness, never structure.

**R-13.26** Cost and token budgets are enforced per tenant at the Guardrail Review stage ([12](12-capability-orchestration.md) stage 6). Budget exhaustion is unavailability.

## 7. AI Capability Classes — the unit of specification

**R-13.27** An **AI Capability Class** is a named statement of *what an AI system must be able to do*. It is the platform's only permitted unit for expressing an AI requirement (R-12.2).

**R-13.28** The class taxonomy is **open**: a new class may be declared without an ADR. But a class SHALL be **declared before it is required**, so an undeclared class named in a requirement fails the build rather than being silently accepted.

**R-13.29** A class SHALL be defined by the capability itself, never by the products that currently exhibit it. A class definition SHALL NOT name a vendor, model or product.

### The declared classes

| Class | The capability required |
|---|---|
| **High Reasoning** | Multi-step inference over a large context with sustained coherence |
| **Code Generation** | Producing source that satisfies a specification |
| **Code Review** | Identifying defects, risks and deviations in existing source |
| **Architecture Analysis** | Reasoning about structure, boundaries, dependencies and conformance |
| **Security Analysis** | Identifying weaknesses, attack paths and control gaps |
| **Governance Analysis** | Evaluating conformance of an artefact against a stated rule set |
| **Certification** | Assembling and assessing evidence against certification criteria |
| **Documentation** | Producing accurate technical prose from a system's actual state |
| **Vision** | Interpreting images, screenshots and rendered interfaces |
| **Planning** | Decomposing an objective into an ordered, dependency-aware sequence |
| **Orchestration** | Coordinating multi-step work across tools and stages |
| **Refactoring** | Restructuring existing source while preserving behaviour |
| **Test Generation** | Deriving test cases and data from a specification or system |

### How a class binds

**R-13.30** A **runtime** AI requirement names a class; the provider adapter satisfying it is selected by tenant configuration (R-13.11). The class is the contract; the provider is configuration.

**R-13.31** An **engineering-process** AI requirement names a class; which product satisfies it is a session-level implementation choice with no architectural weight (R-12.6).

**R-13.32** A requirement SHALL NOT name a product *in addition to* a class. Naming both makes the product the real requirement and the class decorative.

**Correct** — *"Architecture review requires an Architecture Analysis Capability Class."*
**Incorrect** — *"Architecture review requires <vendor model name>."*
**Also incorrect** — *"Architecture review requires an Architecture Analysis Capability Class (use <vendor model name>)."*

### Why the classes are not the six capabilities

They are unrelated concepts that would otherwise share a noun. A **capability** ([11](11-capability-model.md)) is a certifiable unit of quality engineering work that traverses all twelve orchestration stages and yields a verdict; there are exactly six, and a seventh requires an ADR. An **AI Capability Class** is a property an AI system exhibits; there are currently thirteen, the list is open, and extending it requires nothing.

**The separation is load-bearing, not stylistic.** If both were called "capability", the frozen cardinality rule in [11](11-capability-model.md) could no longer be checked by inspection — and a reviewer counting capabilities would get nineteen.

## 8. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-13.1** | The full suite passes with AI disabled | AI-disabled CI run — mandatory, every commit |
| **C-13.2** | No model output reaches a decision, gate, threshold, verdict, or tool selection | Decision-site fitness test |
| **C-13.3** | Every agent computes its deterministic baseline before any model call | Invocation-order test |
| **C-13.4** | Output shape is identical with AI enabled and disabled | Shape-equivalence test |
| **C-13.5** | Invalid model output is discarded, never repaired by a further call | Malformed-response test |
| **C-13.6** | Numeric values from model output are clamped | Out-of-range response test |
| **C-13.7** | An agent is invoked at most once per attempt | Call-count assertion |
| **C-13.8** | No provider name appears outside its adapter | Vendor-name scan |
| **C-13.9** | No configuration key is provider-named | Key-naming gate |
| **C-13.10** | Every provider passes the conformance suite | Per-provider suite run |
| **C-13.11** | Zero egress occurs with no provider configured | Network assertion on a default-configured tenant |
| **C-13.12** | Provider-bound data passes the full egress pipeline | Pipeline trace test |
| **C-13.13** | No AI context contains another tenant's data | Context-assembly test |
| **C-13.14** | An uncertain field is dropped, not transmitted | Ambiguous-input test |
| **C-13.15** | Dropped fields are recorded as dropped | Result inspection test |
| **C-13.16** | Provider unavailability degrades rather than aborts | Provider fault-injection test |
| **C-13.17** | Prompt injection cannot alter control flow | Injection corpus test asserting identical control flow |
| **C-13.18** | No AI vendor, model or tool name appears outside the five permitted contexts | `verify-ai-vendor-neutrality.js` |
| **C-13.19** | Every AI requirement names a declared AI Capability Class | Undeclared-class scan |
| **C-13.20** | No class definition names a vendor, model or product | Taxonomy self-scan |

**C-13.1 runs on every commit, not nightly.** AI-disabled operation is the mode most likely to rot, because it is the one nobody uses during development — and it is the mode that makes the platform sellable into its hardest markets.

## 9. Open items

| # | Item | Target |
|---|---|---|
| **AD-029** | Model version pinning: whether a tenant may pin a provider model version for reproducibility | P2 |

**AD-029 matters more than it appears.** Provider model versions change under customers without notice, so an enrichment that produced one output today may produce another tomorrow. Because enrichment is additive and decisions are deterministic, this **cannot** change a verdict — but it can change a report, and a customer comparing two reports will reasonably ask why.
