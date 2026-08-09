# 01 — Platform Constitution

**Status:** **FROZEN** · **Version:** 1.4 · **Date:** 2026-07-22
**Authority:** the highest architectural authority in the platform. Where any other document conflicts with this one, this one governs.
**Milestone:** P1 / M1.1
**Amendments:** v1.1 — INV-9 and Rule 12 added by [ADR-0016](../adr/ADR-0016-ai-tool-agnosticism.md) · v1.2 — INV-10 and Rule 13 added by [ADR-0019](../adr/ADR-0019-evidence-over-assertion.md) · v1.3 — INV-11 and Rule 14 added by [ADR-0020](../adr/ADR-0020-continuous-verification.md) (all additive; no existing invariant affected) · **v1.4 — Rule 6's SCOPE recorded by [ADR-0084](../adr/ADR-0084-rule-6-scope.md). A CLARIFICATION, NOT AN AMENDMENT: no invariant, rule, conformance line or enforcement mechanism is added, removed or reworded. It records the scope the rule's own Conformance and Enforcement lines already measure, because R-6.3's sentence read in isolation supports a conclusion the rest of its rule does not**

---

## 1. Purpose

This document fixes **what shall be true of the platform**. It does not prescribe how — prescribing implementation would force the Constitution to change every time an implementation detail changed, and the Constitution must be stable.

Every rule here is stated as a **property that is either true or false of the system**, so that conformance can be measured rather than argued.

## 2. Derivation

The rules are not preferences. Each follows from the problem the platform exists to solve.

**The problem.** Enterprises want AI-assisted quality engineering. Their data may not leave their tenancy.

**Step 1 — Two deployables.** AI capability must be centrally operated to be multi-tenant, continuously improved, and commercially viable. Customer data must remain in place. These are irreconcilable in one deployable, so there are two: one that **reasons**, one that **performs**. This is the Sovereign Split, and it is the product — not a deployment topology.

**Step 2 — What goes where.** Anything that touches a customer system, holds customer data, or performs work must sit with the data. Anything that only reasons about work may sit centrally. The boundary is drawn by *contact with customer systems*, not by convenience.

**Step 3 — Who orchestrates.** If the reasoning plane drove execution step by step, it would need a live inbound path into the customer tenancy for every step — precisely what sovereignty forbids. If the executing plane planned freely, the reasoning plane could not certify what happened. The resolution is to split orchestration into **authorship** and **sequencing**: the reasoning plane authors one complete, sealed execution package; the executing plane sequences it. A conductor writes no notes and plays no instrument.

**Step 4 — Who certifies.** If the executing plane could certify, the customer would be self-certifying, which is worthless to a regulator. If certification required the reasoning plane to be reachable, a SaaS outage would stop customer testing, which is unacceptable. The resolution: **testing continues; judgment waits.** Certification is deferred, never delegated.

**Step 5 — Who holds evidence.** Evidence held centrally breaks sovereignty. Evidence held only locally breaks auditability. The resolution: the reasoning plane retains **decisions and content hashes**; the executing plane retains **evidence**. A decision references a hash, not a payload — so an expired evidence bundle leaves its decision record intact and still auditable.

**Step 6 — What AI may do.** If a model rendered decisions, those decisions would not be reproducible, certification would be unfalsifiable, and prompt injection would become a privilege-escalation path. The resolution: **AI generates material; deterministic code renders every decision.** The platform must also function with AI entirely disabled, or it cannot be sold into environments that forbid it.

## 3. What "enforced" means

A rule is only as real as the mechanism that enforces it. The following hierarchy is normative, weakest first.

| Form | Enforcement value |
|---|---|
| Prose in a document | **None** |
| A comment in source | **None** |
| A declared configuration value that no code reads | **Negative** — it is itself a violation, because it manufactures the appearance of a control |
| A test that exists but does not run where work happens | **None** |
| A test that fails the build | **Gate** |
| A guard that refuses to start the process | **Gate** |
| A structure in which the violation cannot be expressed | **Strongest** |

**C-0.1** Where a rule can be enforced structurally, it SHALL be. A rule that cannot be violated needs no test.

**C-0.2** Every rule in §5 SHALL be enforced by **at least three independent mechanisms**. This is not belt-and-braces caution; it is the strongest empirical finding available to this programme. In the predecessor platform, the single rule enforced three independent ways never drifted, and every rule enforced by one mechanism — or by prose — did.

**C-0.3** Every gate SHALL be **observed to fail** against a deliberately planted violation, and that fault-injection proof SHALL be recorded. A gate that has never been seen to fail is indistinguishable from one that cannot fail.

**C-0.4** Every gate SHALL report `PASS`, `FAIL`, or `NOT RUN`. **`NOT RUN` SHALL be treated as `FAIL`.** A gate that was never asked to run provides no assurance, and silence must not read as success.

**C-0.5** A control SHALL behave identically in every environment. No constitutional guard may be conditional on environment, build flag, or image default. A rule that protects only production protects the environment least likely to be attacked, while non-production environments routinely hold real customer credentials under weaker guards.

## 4. Invariants

The invariants are the irreducible properties. Every rule in §5 exists to preserve one or more of them.

| # | Invariant |
|---|---|
| **INV-1** | The plane that performs the work owns the **evidence**; the plane that reasons owns the **judgment**. Neither plane can unilaterally manufacture a certified result. |
| **INV-2** | Only credential **references** cross the plane boundary. Secret material never does, in any environment. |
| **INV-3** | Cross-plane communication is **initiated by the executing plane, one-directional, and synchronous**. There is no inbound path from the reasoning plane into the customer tenancy. |
| **INV-4** | **AI generates; deterministic code decides.** No branch, threshold, gate, or verdict is computed by a model. |
| **INV-5** | Every external system sits behind a **platform-owned interface**. Vendor names appear inside adapters and nowhere else. |
| **INV-6** | Customer data inside platform infrastructure is **ephemeral, authorised, minimised, scrubbed on write, and purged by enforced code**. |
| **INV-7** | The executing plane is **never blocked** by unavailability of the reasoning plane. |
| **INV-8** | Every result carries its **assurance state**. A degraded result is structurally distinguishable from a certified one and cannot be presented as certified. |
| **INV-9** | The architecture, governance, contracts, workflows, certification and security model are **portable across AI technologies**. AI is specified by **capability class**; no vendor, model or tool is named as a requirement — at runtime or in the engineering process. |
| **INV-10** | **Trust is earned through independently verifiable evidence, never assumed.** Every claim the platform makes about itself is derived from executed evidence, or reports that it is not measured. |
| **INV-11** | **Trust expires.** No claim is trusted indefinitely. Confidence decays with the age of its supporting evidence, and expired evidence restores no confidence until regenerated. |

## 5. The rules

### Rule 1 — Two deployables, and no third

**R-1.1** The platform consists of exactly two independently deployable runtimes: the Intelligence Plane and the Execution Plane.

**R-1.2** The set of deployable units SHALL NOT change without an approved ADR.

**R-1.3** Shared code exists only as an in-process library: it binds no listener, owns no lifecycle, and is not independently deployable.

**R-1.4** A shared library SHALL be a **versioned, owned, releasable artefact**. Code reachable only by a relative filesystem path is not a library, and sharing by relative path is prohibited.

*Rationale for R-1.4.* Relative-path sharing works in a development workspace and is invisible until containerisation, because the failure surface is a deployment artefact. In the predecessor, such a directory sat above both repository roots, reached neither container image, and accumulated twenty-six import sites before anyone noticed.

**Conformance:** no third listener exists; no `require`/`import` resolves outside its repository root; every shared dependency is declared and versioned.
**Enforcement:** (1) boundary check in strict mode from the first commit; (2) image-closure check that walks the runtime dependency graph, including lazily-loaded edges, against the container manifest; (3) both images built in CI on every commit.

> **A structural note (R-1.5).** A capability that must never run in production SHALL NOT be exported from its package. In the predecessor, the control plane satisfied this rule *because nothing happened to call the function that would have broken it* — not because anything prevented it. Conformance by accident is not conformance.

### Rule 2 — The Execution Plane performs; it does not reason

**R-2.1** The Execution Plane owns execution sequencing, tool adapters, browser/API/performance/security/penetration execution, credential custody, evidence custody, and all customer data processing.

**R-2.2** The Execution Plane SHALL NOT perform AI inference.

**R-2.3** The Execution Plane SHALL NOT render certification decisions.

**R-2.4** The Execution Plane SHALL NOT author workflows.

**R-2.5** The Execution Plane SHALL NOT contain multi-tenant logic. It serves exactly one tenant: the customer whose tenancy it runs in.

**R-2.6** The Execution Plane SHALL execute with the Intelligence Plane unreachable. Capabilities that require no reasoning SHALL be fully available in that state.

**Conformance:** no inference library or model credential is reachable from this plane; no code path produces a verdict; execution succeeds with the reasoning plane unreachable.
**Enforcement:** (1) boot guard refusing to start if an inference capability is present; (2) build fitness test banning inference dependencies; (3) an integration test that runs the plane with the boundary severed.

### Rule 3 — The Intelligence Plane reasons; it does not touch customer systems

**R-3.1** The Intelligence Plane owns workflow authorship, planning, all AI, deterministic gates and verdicts, certification, governance and policy, configuration intelligence, reporting, and tenant operations.

**R-3.2** The Intelligence Plane SHALL NOT open connections to customer systems.

**R-3.3** The Intelligence Plane SHALL NOT hold customer credentials.

**R-3.4** The Intelligence Plane SHALL NOT retain customer data permanently.

**R-3.5** The Intelligence Plane SHALL NOT contain browser, load-generation, or scanning capability — **even dormant, even unreferenced**.

*Rationale for R-3.5.* Capability present is capability one wiring change from active. Dead code in the wrong plane is a latent sovereignty breach, not a harmless artefact.

**Conformance:** no browser/load/scan dependency is present in this plane's dependency graph; no outbound connection targets a customer system.
**Enforcement:** (1) dependency ban gate over the plane's manifest; (2) import-scan gate over its source tree; (3) egress policy at the runtime boundary.

### Rule 4 — Orchestration is split: authorship here, sequencing there

**R-4.1** The Intelligence Plane authors exactly **one sealed execution package** per run. The Execution Plane sequences it.

**R-4.2** The execution package SHALL be **immutable once authored**, content-addressed by the platform's single canonical hash, and carry its authoring identity, tenant, timestamp, and validity window.

**R-4.3** The Execution Plane SHALL execute a package or refuse it. It SHALL NOT modify one.

**R-4.4** Every execution SHALL be attributable to exactly one package hash, and every piece of evidence SHALL reference the package hash that produced it.

**R-4.5** There SHALL be exactly one orchestration path. An imperative alternative SHALL NOT exist.

*Rationale for R-4.5.* In the predecessor the conformant orchestration path was fully built and working — and opt-in behind a flag, so every deployment ran the non-conformant default. **Defaults are architecture.** A flag may protect a rollback path from the conformant default; it may never protect the conformant path from a non-conformant one.

**Conformance:** exactly one code path constructs an execution sequence; every run record carries a package hash.
**Enforcement:** (1) single-construction-site fitness test; (2) schema requiring a package hash on every run and evidence record; (3) no feature flag may select an orchestration path.

### Rule 5 — Communication is one-directional and synchronous

**R-5.1** All cross-plane communication is **initiated by the Execution Plane**, synchronous, request/response.

**R-5.2** There SHALL be no callback, queue, webhook, or long-lived socket from the Intelligence Plane into the customer tenancy.

**R-5.3** All cross-plane traffic SHALL pass through **exactly one client module**, so that the entire cross-sovereignty surface is auditable in one file.

**R-5.4** The client SHALL distinguish **refusal** from **unavailability** as structurally distinct result types, not as status codes interpreted by callers.

**R-5.5** **Refusal halts. Unavailability degrades and continues.** Retry exhaustion yields unavailability, and therefore degradation — never abort.

*Rationale for R-5.4/R-5.5.* This is the most consequential distinction in the platform. Conflating the two is what caused the predecessor's executing plane to abort whenever the reasoning plane was unreachable — including for capabilities requiring no inference whatsoever. Its own assessment: *the architecture is correct; one early return contradicts it.*

**Conformance:** one client module; two distinct result types; no abort path on unavailability.
**Enforcement:** (1) single-client fitness test; (2) type-level distinction that makes conflation unrepresentable; (3) severed-boundary integration test asserting degradation rather than abort.

### Rule 6 — Secrets never cross

**R-6.1** Only credential **references** cross the plane boundary.

**R-6.2** Secret material SHALL NOT cross in any environment, for any reason, including diagnostics.

**R-6.3** Credential custody belongs exclusively to the Execution Plane.

**Scope of Rule 6 — added by [ADR-0084](../adr/ADR-0084-rule-6-scope.md). NO RULE IS ADDED, AMENDED OR NARROWED.** This rule governs **what crosses the plane boundary**, and its subject is the **customer's** credentials — those that authenticate to the customer's own systems. **R-6.3 is not a statement that the Intelligence Plane holds no key material of its own.** DBiz's package-signing key is [08](08-security-model.md) R-08.15's subject: DBiz-held, never distributed, and only its public half crosses — possession of which cannot produce a signature. It is **outside this rule's subject rather than an exception to it**, and [08](08-security-model.md) R-08.17 states the same boundary from the other side.

**The scope is already what this rule MEASURES, which is why recording it changes nothing.** The Conformance line below is satisfied by cross-plane payloads, and all three Enforcement mechanisms inspect a cross-plane payload or the cross-plane client. **A reading of R-6.3 that forbade this plane from holding any key at all would have no enforcement mechanism here** — and under §3 a rule enforced by nothing is not enforced. **A rule whose enforcement cannot see a case was never about that case.** What made the note necessary is only that R-6.3's sentence can be read in isolation, where it says something the rest of its own rule does not.

**Conformance:** no secret-shaped value appears in any cross-plane payload in any environment.
**Enforcement:** (1) outbound payload guard rejecting secret-shaped values; (2) contract schema admitting references only; (3) secret-scanning gate over the cross-plane client and its tests.

### Rule 7 — Every external system sits behind a platform interface

**R-7.1** Every external system — test management, execution tooling, load generation, scanning, source control, CRM — sits behind a platform-owned interface.

**R-7.2** A vendor name SHALL NOT appear outside its adapter. Not in identity, not in orchestration, not in configuration keys.

**R-7.3** Configuration keys SHALL be **capability-named**, never tool-named.

**R-7.4** Adapter selection is driven by **tenant configuration**, never by environment variable or build flag.

*Rationale for R-7.3.* A tool-named key propagates the vendor into every consumer's mental model and into customer-facing configuration, which converts a later abstraction from an internal refactor into a breaking change.

*Rationale for the whole rule.* In the predecessor, no interface existed at the moment of first integration, so one vendor propagated along the path of least resistance until it reached the **identity layer** — the hardest layer to change safely. Order matters more than effort here: the interface must exist before the first integration, not after.

**Conformance:** no vendor identifier outside an adapter directory; no tool-named configuration key.
**Enforcement:** (1) vendor-name scan over all non-adapter source; (2) configuration key-naming gate; (3) adapter conformance suite each implementation must pass.

### Rule 8 — AI generates; deterministic code decides

**R-8.1** The platform SHALL function correctly with AI **disabled**. This is a supported operating mode, not a fallback.

**R-8.2** No decision, branch, threshold, gate, or verdict SHALL be computed by a model.

**R-8.3** Every reasoning step SHALL compute a **deterministic baseline first**. AI enrichment is **additive only**: it may refine, never remove or override structure.

**R-8.4** AI output SHALL be schema-validated before use. Invalid output is **discarded, not repaired by a further model call**. Numeric adjustments are clamped to declared bounds.

**R-8.5** AI is invoked as a **pure function, once per attempt**. There is no autonomous loop, no model-selected control flow, and no model-selected tool use.

**R-8.6** Degradation SHALL reduce richness, never structure. Output shape is identical with AI enabled or disabled; only depth differs.

**R-8.7** Multiple providers SHALL be supported through abstraction, selected by tenant configuration. Zero external AI egress SHALL occur until a tenant explicitly configures a provider.

*Rationale for R-8.2/R-8.5.* Beyond reproducibility, this is a **security** property: if a model cannot determine control flow, prompt injection is removed as a privilege-escalation path.

**Conformance:** the full suite passes with AI disabled; no decision site consumes model output directly.
**Enforcement:** (1) AI-disabled CI run of the entire suite; (2) decision-site fitness test asserting no model output reaches a verdict; (3) schema validation gate on every model response.

### Rule 9 — Sovereignty of data and evidence

**R-9.1** Evidence is custodied by the Execution Plane. The Intelligence Plane retains **decisions and content hashes only**.

**R-9.2** Customer data in the Intelligence Plane SHALL be ephemeral, authorised by a named ADR recorded in the owning module, field-minimised, scrubbed on the **write** path, and purged by enforced code.

**R-9.3** A store SHALL NOT be registered unless it declares a retention source, implements purge, and ships a test proving data is unreadable after expiry.

**R-9.4** Immutability SHALL NOT be used to justify indefinite retention. An append-only store still requires an expiry and archival policy.

**R-9.5** Tenant isolation SHALL be **physical**, through exactly one validated path constructor. A tenant identifier filtered in application code is not isolation.

**R-9.6** A run identifier is **not** a tenant identifier. Uniqueness carries no isolation semantics.

*Rationale for R-9.5.* An application-level filter fails **open**: any read path that forgets it — a bug, a debug tool, a log shipper, an operator inspecting a file — exposes every tenant at once. A physical path fails **closed**: omitting the scope yields no path, and therefore no data. These are not equivalent security postures.

*Rationale for R-9.2's write-path requirement.* Scrubbing on egress protects the API. Scrubbing on write protects the disk. Both are required.

**Conformance:** every tenant-scoped path is produced by the canonical constructor; every store has a passing purge test.
**Enforcement:** (1) path-construction fitness test; (2) store registration refusing stores without purge; (3) scheduled purge-verification test per store.

### Rule 10 — Certification is deferred, never delegated

**R-10.1** Certification is rendered exclusively by the Intelligence Plane.

**R-10.2** When the Intelligence Plane is unavailable, execution proceeds and certification is **queued**. It is never delegated to the Execution Plane, and never skipped.

**R-10.3** Every result SHALL carry a structural **assurance state**. A degraded result is a distinct type that the certification interface refuses to accept.

**R-10.4** A degraded result SHALL NOT be presentable as certified, and consumers SHALL be able to filter degraded results without parsing prose.

*Rationale for R-10.3.* An unlabelled degraded pass is worse than an outage. An outage is visible; a silently degraded certification is a false assurance that propagates into release decisions.

**Conformance:** no verdict is constructible without an assurance state; the certification interface rejects degraded input.
**Enforcement:** (1) type-level requirement making an unstated assurance state unrepresentable; (2) certification interface rejection test; (3) schema gate on every emitted result.

### Rule 11 — Contradictions are recorded, never silently reconciled

**R-11.1** Where implementation contradicts this Constitution, the **contradiction is recorded as a violation** and the implementation is corrected. The Constitution is not amended to accommodate it.

**R-11.2** A declared control that does not execute SHALL be recorded as a **violation**, not as a gap.

**R-11.3** A gate that cannot be made green SHALL be left **red** and escalated. Editing a gate to match non-conformant reality is prohibited.

**R-11.4** A declared commitment SHALL NOT be deleted in order to close a finding.

**R-11.5** An open question SHALL be recorded, never guessed. **Absence of an answer is not evidence of absence of a problem.**

*Rationale for R-11.2.* Treating declared-but-unbuilt controls as gaps inverts the purpose of governance: it means no declared control can be believed without independent verification, which is precisely the state a governance framework exists to prevent.

---

### Rule 12 — AI is specified by capability, never by product

**R-12.1** The platform SHALL remain **AI tool agnostic**. No architectural component, governance rule, contract, workflow, certification rule or engineering standard SHALL require a specific AI vendor, model, assistant, gateway or provider.

**R-12.2** AI requirements SHALL be expressed as an **AI Capability Class** — the capability required — never as the product that supplies it. The taxonomy is owned by [13](13-ai-operating-model.md) §7.

**R-12.3** R-12.1 binds the **engineering process** as well as the runtime: governance, standards, review definitions, certification rules and implementation guidance state *what capability is required*, never *which product must be used*.

**R-12.4** Changing AI vendor, model, assistant, gateway or provider SHALL require **only a configuration change**. It SHALL NOT require a change to architecture, governance, contracts, workflows, the capability model, certification or the security model.

**R-12.5** A vendor, model or tool name is permitted **only** in: a provider adapter implementation; configuration examples and tenant configuration values; supported-provider or compatibility documentation; migration and historical records; and an ADR recording a decision that was genuinely product-specific. **Outside these five contexts a vendor name is a violation** (R-11.1), not a stylistic preference.

**R-12.6** Which product satisfies a required capability class is a **session-level implementation choice**. It carries no architectural weight and requires no ADR to change.

#### Why this is a separate rule and not an extension of Rule 7 or Rule 8

Rule 7 places every external system behind a platform-owned interface, and Rule 8 fixes the inference boundary. Both govern the platform **as it runs**. Neither reaches the process that **builds** it — and the engineering process has no adapter to hide a vendor name inside.

That gap is where the dependency is actually acquired. A vendor name in a runtime module fails an existing gate; a vendor name in a review standard fails nothing, reads as helpful specificity, and quietly converts an implementation tool into a governance dependency. **Rule 12 exists because the unguarded surface is documentation, not code.**

#### Why the term is *AI Capability Class* and not *capability*

[11](11-capability-model.md) is frozen and owns *capability*: exactly six certifiable units, a seventh requiring an approved ADR (R-11.4 of that document). *High Reasoning* is a property an AI system exhibits; *Functional Testing Engine* is a certifiable unit of quality engineering work. **Sharing one noun between them would make that document's own cardinality rule unenforceable by inspection** — so the new concept takes a distinct name rather than the frozen document taking an edit. See [ADR-0016](../adr/ADR-0016-ai-tool-agnosticism.md) §2.

---

### Rule 13 — Evidence over assertion

**R-13.1** Every measurement the platform emits SHALL derive from **objective evidence**. A hand-authored status value is prohibited in any emitted measurement — scorecard, dashboard, maturity report, certification, or customer-facing claim.

**R-13.2** Every measurement SHALL carry an **evidence envelope**: evidence source · collection time · collection method · confidence level · traceability · validation status.

**R-13.3** Where evidence cannot be collected, the measurement SHALL report **`NOT MEASURED`**. **`NOT MEASURED` SHALL NOT be reported as a pass**, aggregated as a pass, or omitted from a total.

**R-13.4** Every governance gate SHALL demonstrate **positive detection, negative detection, fault injection, false-positive resistance and false-negative resistance**, and those demonstrations SHALL be recorded in a **machine-readable registry**. A proof recorded only in prose does not satisfy this rule.

**R-13.5** Governance SHALL measure its own trustworthiness through a **Governance Confidence Index**, derived entirely from evidence. The GCI SHALL NOT be assigned manually, and an input SHALL NOT be excluded in order to raise it.

**R-13.6** Platform Intelligence **consumes** evidence. It SHALL NOT manufacture, infer, or estimate a metric it did not observe.

#### Why this is constitutional rather than a governance practice

The enforcement hierarchy in §3 rates prose at **zero**. A principle applied by habit is prose, and habit is exactly what erodes under deadline. This rule exists because the platform had already adopted the practice — `NOT RUN` ≡ `FAIL`, fault injection before trust, generated scorecards — while nothing prevented the next mechanism from asserting instead of measuring.

#### The clause that closes a live gap

**R-13.4 was raised by a defect in this estate.** Every fault-injection proof recorded before this amendment existed only as prose in a commit message or a document. **The rule requiring evidence over assertion was itself backed by assertions about evidence** — the precise shape it forbids. A prose proof cannot be reconciled against the gates that currently exist; a registry can.

#### Why the GCI is separate from the readiness index

The Enterprise Readiness Index answers *"is the platform ready?"*. The Governance Confidence Index answers *"can the system that told you so be trusted?"*

These are different questions with different failure modes, and only the second detects a governance system that has quietly stopped measuring. **A high readiness index produced by an untrustworthy governance system is worse than a low one, because it is confidently wrong.**

---

### Rule 14 — Continuous verification

**R-14.1** Every governance proof, certification, compatibility claim, security validation, performance benchmark, operational assessment and readiness assessment SHALL be **periodically revalidated**.

**R-14.2** Every proof SHALL be **regenerated, never copied**, and SHALL support **deterministic replay** producing an equivalent certified outcome.

**R-14.3** Failure to replay SHALL **invalidate** the confidence that proof contributed.

**R-14.4** Every piece of evidence SHALL carry **immutable provenance** binding it to its origin: evidence identifier, generator, generator version, execution context, repository, branch, commit identifier, ADR reference, rule reference, timestamp, cryptographic hash, verification status and certification status.

**R-14.5** Confidence SHALL **decay with evidence age**, and SHALL report **`NOT CURRENT`** once evidence has expired. **Expired evidence contributes nothing** — it is never averaged in as partial credit.

**R-14.6** Confidence SHALL NOT be published as a single number. **Score, coverage and freshness SHALL always be published together.**

#### Why decay needs both a gradient and a floor

Graded decay with no expiry lets a gate that stopped detecting years ago keep paying into the score at a diminishing rate — quieter each year, never silent. A hard cliff with no gradient leaves confidence unchanged until the boundary and then collapses it, which says nothing in between and encourages re-running only at the deadline.

**The combination is what makes the number both responsive and honest.**

#### Why three numbers and never one

A score of 87% means one thing at full coverage with fresh evidence and something entirely different at partial coverage with expired evidence. **Publishing the score alone permits exactly the misreading the index exists to prevent.**

#### What this rule deliberately does not do

It does **not** decay `NOT MEASURED` toward zero. An unmeasured metric has no evidence to age — it stays unmeasured and contributes nothing, exactly as before. Areas blocked on genuine external dependencies remain honestly unmeasured rather than being recorded as expired, which would imply they were once measured.

## 6. Conformance criteria

Each rule states its enforcement mechanisms inline. This section consolidates them into **citable identifiers**, so a violation can be named precisely rather than described.

| # | Criterion | Rule |
|---|---|---|
| **C-01.1** | Exactly two deployable runtimes exist | R-1.1 |
| **C-01.2** | No module resolution escapes its repository root | R-1.4 |
| **C-01.3** | Every shared dependency is declared and versioned | R-1.4 |
| **C-01.4** | No capability that must not run in production is exported | R-1.5 |
| **C-01.5** | The Execution Plane contains no inference capability | R-2.2 |
| **C-01.6** | The Execution Plane produces no verdict | R-2.3 |
| **C-01.7** | The Execution Plane completes execution with the Intelligence Plane unreachable | R-2.6 |
| **C-01.8** | The Intelligence Plane contains no browser, load, or scan capability, even dormant | R-3.5 |
| **C-01.9** | The Intelligence Plane opens no connection to a customer system | R-3.2 |
| **C-01.10** | The Intelligence Plane holds no customer credential and no permanent customer data | R-3.3, R-3.4 |
| **C-01.11** | Exactly one execution package is authored per run, sealed and content-addressed | R-4.1, R-4.2 |
| **C-01.12** | Every execution is attributable to exactly one package hash | R-4.4 |
| **C-01.13** | Exactly one orchestration path exists; no flag selects between paths | R-4.5 |
| **C-01.14** | All cross-plane traffic passes through exactly one client module | R-5.3 |
| **C-01.15** | Refusal and unavailability are structurally distinct and cannot be handled interchangeably | R-5.4 |
| **C-01.16** | Retry exhaustion yields degradation, never abort | R-5.5 |
| **C-01.17** | No secret material appears in any cross-plane payload, in any environment | R-6.2 |
| **C-01.18** | No vendor identifier appears outside an adapter | R-7.2 |
| **C-01.19** | No configuration key is tool-named | R-7.3 |
| **C-01.20** | The full suite passes with AI disabled | R-8.1 |
| **C-01.21** | No model output reaches a decision, gate, threshold, or verdict | R-8.2 |
| **C-01.22** | Model output is schema-validated, and invalid output is discarded rather than repaired | R-8.4 |
| **C-01.23** | Output shape is identical with AI enabled and disabled | R-8.6 |
| **C-01.24** | The Intelligence Plane persists no evidence payload | R-9.1 |
| **C-01.25** | Every store declares a retention source, implements purge, and proves it by test | R-9.3 |
| **C-01.26** | Every tenant-scoped path is produced by the canonical constructor | R-9.5 |
| **C-01.27** | Certification is rendered only by the Intelligence Plane | R-10.1 |
| **C-01.28** | No result is constructible without an assurance state | R-10.3 |
| **C-01.29** | The certification interface rejects a degraded result | R-10.4 |
| **C-01.30** | Every gate reports PASS, FAIL, or NOT RUN, and NOT RUN is treated as FAIL | C-0.4 |
| **C-01.31** | Every gate has a recorded fault-injection proof | C-0.3 |
| **C-01.32** | No constitutional guard is conditional on environment, build flag, or image default | C-0.5 |
| **C-01.33** | No AI vendor, model or tool name appears in architecture, governance, contracts, workflows, certification or engineering standards outside the five permitted contexts | R-12.1, R-12.5 |
| **C-01.34** | Every AI requirement names a declared AI Capability Class | R-12.2, R-12.3 |
| **C-01.35** | Provider substitution changes configuration only — no architecture, contract, workflow or certification artefact changes | R-12.4 |
| **C-01.36** | No emitted measurement carries a hand-authored status value | R-13.1 |
| **C-01.37** | Every emitted measurement carries a complete evidence envelope | R-13.2 |
| **C-01.38** | `NOT MEASURED` is never reported, aggregated, or omitted as a pass | R-13.3 |
| **C-01.39** | Every gate has a machine-readable fault-injection proof covering positive and negative detection | R-13.4 |
| **C-01.40** | The Governance Confidence Index is computed from the proof registry and gate results, never assigned | R-13.5 |
| **C-01.41** | Every ADR's declared affected components were actually modified | R-13.1, R-18.26 |
| **C-01.42** | Every proof carries complete immutable provenance | R-14.4 |
| **C-01.43** | Every proof is regenerated rather than copied, and replays deterministically | R-14.2 |
| **C-01.44** | A proof that fails to replay contributes no confidence | R-14.3 |
| **C-01.45** | Confidence decays with evidence age and reports `NOT CURRENT` on expiry | R-14.5 |
| **C-01.46** | Expired evidence is never averaged in as partial credit | R-14.5 |
| **C-01.47** | Score, coverage and freshness are always published together | R-14.6 |

**C-01.31 applies to this list itself.** A criterion whose gate has never been observed to fail is recorded as unproven, and an unproven gate does not count toward the three-mechanism requirement of C-0.2.

## 7. Amendment

**A-1** This Constitution changes only by approved ADR.

**A-2** A finding, an outage, a deadline, or an implementation difficulty is **never** grounds for amendment.

**A-3** Amendments that were considered and rejected SHALL be recorded as **prohibited decisions**, with reasoning, so that convenience cannot later be mistaken for a determination.

**A-4** An amendment SHALL state which invariant it affects and why that invariant no longer holds. An amendment that affects no invariant is a clarification, not an amendment.

## 8. What this document does not do

It does not specify wire formats, method signatures, storage layouts, retention periods, algorithms, or language choices. Those are implementation decisions, recorded in `program/DECISIONS.md` and resolved by ADR.

**But the distinction carries a warning.** The predecessor deferred its adapter interface signatures as "implementation detail" — defensible for a constitution — and subsequently built one of eight declared adapter layers. Deferring the *how* is correct for a constitution and dangerous for a roadmap. **A deferred item needs an owner and a date, not merely a category.**
