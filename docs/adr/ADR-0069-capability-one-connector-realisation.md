# ADR-0069 — Autonomous Functional Testing Engine: Capability One Realisation

**Status:** Accepted
**Date:** 2026-08-04 · **Accepted:** 2026-08-04
**Governed by:** [01 — Platform Constitution](../architecture/01-platform-constitution.md); [11 — Capability Model](../architecture/11-capability-model.md); [12 — Capability Orchestration](../architecture/12-capability-orchestration.md); [14 — Tool Operating Model](../architecture/14-tool-operating-model.md)
**Relates to:** ADR-0061 (precondition recorded on its §6 step 6), ADR-0066 (canonical workflow affirmed as the acceptance target), ADR-0067 (unchanged)

> **This text replaces the earlier Proposed draft of ADR-0069, which was never accepted.** That
> draft made connector realisation inside the Intelligence Plane its central deliverable. That
> deliverable is **unbuildable**: it violates R-3.2, R-3.3, R-6.3 and R-14.16. The finding is
> recorded in §2 rather than quietly dropped, because the draft was wrong in a way worth keeping.

> **Scope.** No capability is added, retired, renumbered or replaced. **R-11.4 stands unchanged:
> exactly six capabilities, capability 1 the Functional Testing Engine.** No frozen architecture
> document is amended. No agent is added — the 144 registered agents, 13 domains and 13 domain
> orchestrators stand as built. **The canonical workflow FT-001 → FT-037 (v2.3.0, ADR-0066) is
> affirmed as the single source of workflow governance; this ADR creates no second workflow and no
> second step numbering.** The twelve-stage lifecycle, governance triad, single Policy Decision
> Point, `ExecutionPackage` contract and evidence-by-reference are unchanged.

---

## 1. Problem

Capability 1 is structurally complete and structurally proven: it traverses all twelve stages
without failing at any (`verify-functional-completeness` F-1, five runs), reaches certification
through the governance triad (F-2), every one of its 144 agents is reachable by an executable
workflow (F-3), and it carries 462 passing tests.

**It has never performed one real interaction with a real tool.** Every adapter implementation is
in-memory, and says so at
[`packages/functional-testing-engine/src/adapters.ts`](../../packages/functional-testing-engine/src/adapters.ts) lines 19–21:

> *"These implementations are in-memory. They exercise the SPI faithfully and reach no external
> service, which is what lets the conformance suite prove the workflow is identical across providers
> without credentials or a network."*

That statement is honest and the design behind it is right — it is what allows provider equivalence
(F-9, F-10) to be proven without credentials. But the consequence is that the capability's entire
tool surface — acquire a story, discover existing cases, publish a test case, create a plan, sync a
result, raise a defect — has never executed against anything.

Three conformance properties fail today and are in scope:

| Property | Gate | Symptom |
|---|---|---|
| **F-4** | `verify-functional-completeness` | `TestManagementAdapter.publishTests` never invoked — 13/14 operations |
| **F-15** | `verify-functional-completeness` | generated automation kinds do not match the kinds found missing |
| **IC-1** | `verify-intent-conservation` | 12 of 12 candidate tests unaccounted for by a typed disposition (ADR-0038; RED and escalated, R-18.12) |

A 2026-08 proposal recommended retiring capability 1 and rebuilding it as a fifteen-agent
replacement. **Rejected on evidence:** all fifteen proposed agents already exist across the
capability's 13 domains, and the two connector ports it proposed to define already exist among the
nine adapter SPIs in
[`packages/capability-framework/src/adapters.ts`](../../packages/capability-framework/src/adapters.ts).
Building it would have produced a second implementation of capability 1, contrary to
[CHARTER](../../program/CHARTER.md) §4. Recorded so the question is not reopened without new evidence.

## 2. Context

### 2.1 The acceptance target is FT-001 → FT-037, not a new step list

The realisation target for capability 1 is the **existing** canonical workflow —
[`governance/functional-workflow/functional-workflow.canonical.json`](../../governance/functional-workflow/functional-workflow.canonical.json),
version 2.3.0, 37 steps, each already bound to a constitutional stage and an owning plane, governed
by ADR-0066 and enforced by `verify-functional-workflow-substructure` (PASS).

| Step | Stage / Plane | Step | Stage / Plane |
|---|---|---|---|
| FT-001 Load Configuration | 1 / IP | FT-020 Generate Step Definitions | 7 / IP |
| FT-002 Determine Project Platform | 1 / IP | FT-021 Generate POM | 7 / IP |
| FT-003 Determine Test Management Platform | 1 / IP | FT-022 Generate Locator Repository | 7 / IP |
| FT-004 Acquire Story | 3 / EP→IP | FT-023 Compile and Validate Automation | 7 / IP |
| FT-005 Application Knowledge Intelligence | 2 / EP→IP | FT-024 Execution Readiness Validation | 8 / EP |
| FT-006 Story Intelligence | 1 / IP | FT-025 Execution Plane | 8 / EP |
| FT-007 Requirement Intelligence | 1 / IP | FT-026 Proactive Healing | 8 / EP→IP |
| FT-008 AI Test Design Intelligence | 1 / IP | FT-027 Reactive Healing | 8 / EP→IP |
| FT-009 Enterprise Test Repository Intelligence | 1 / IP | FT-028 Self Healing | 8 / EP→IP |
| FT-010 Reuse Decision | 1 / IP | FT-029 Evidence Intelligence | 9 / EP |
| FT-011 Create Detailed Test Cases | 1 / IP | FT-030 Failure Intelligence | 10 / IP |
| FT-012 AI Review | 1 / IP | FT-031 Bug Intelligence | 10 / IP |
| FT-013 Publish Test Cases | 7 / IP | FT-032 Create Bugs | 12 / IP |
| FT-014 Create Test Plan | 7 / IP | FT-033 Sync Results | 12 / IP |
| FT-015 Create Test Suite or Cycle | 7 / IP | FT-034 Metrics Intelligence | 12 / IP |
| FT-016 Associate Every Test Case | 7 / IP | FT-035 Executive Reporting | 12 / IP |
| FT-017 Automation Repository Intelligence | 1 / IP | FT-036 Release Readiness Assessment | 11 / IP |
| FT-018 Reuse Existing Automation | 1 / IP | FT-037 Certification | 11 / IP |
| FT-019 Generate Feature Files | 7 / IP | | |

### The seventeen-step narrative mapped onto the canon

The seventeen-step business narrative in which this work was commissioned is a **view onto** these
37 steps, not a competing canon. Recording it as a view must not become a way for a requirement to
disappear, so every narrative step is mapped explicitly and any step without coverage is named as a
gap.

| # | Narrative step | Covered by | Coverage |
|---|---|---|---|
| 1 | Pull and scrub the user story | **FT-004** (`FT-004.4` *"Scrub and minimise customer content at the plane boundary"*), with FT-002/FT-003 resolving the connectors | Full |
| 2 | Story analysis | **FT-006** (requirements, acceptance criteria, business rules, dependencies, risks) · **FT-007** (hidden requirements, missing validations, negative scenarios) | Full |
| 3 | Test design technique selection | **FT-008** (EP, BVA, decision tables, state transition, pairwise, cause-effect, error-guessing, risk-based, exploratory, security, performance) | Full |
| 4 | AI-augmented case proposal | **FT-011** (authoring) · **FT-012** (AI review) | Full |
| 5 | Test repository reconciliation | **FT-009** (search, detect duplicate/equivalent/obsolete/superseded/reusable) · **FT-010** (reuse decision through the single Decision Engine) | Full |
| 6 | GWT authoring | **FT-011** (navigation, step number, action, per-step expected, pre/postconditions, data, traceability) | Full |
| 7 | Test classification and tagging | **FT-011** (*"AI tags; classify smoke/regression/sanity/module/critical/integration/E2E — tool-neutral"*) | Full |
| 8 | Plan / suite / cycle composition | **FT-014** (plan) · **FT-015** (suite or cycle) · **FT-016** (associate every case with traceability) | Full |
| 9 | Automation existence reconciliation | **FT-017** (search, plan — never generates) · **FT-018** (reuse; generate only when missing) | Full |
| 10 | Feature-file generation | **FT-019** (organised by module/page/entity, carrying case ids, tags, traceability) | Full |
| 11 | Step-definition specification | **FT-020** (authored with reuse) | Full |
| 12 | Page-object specification and tool write-back | **FT-021** (page objects) · **FT-022** (locator repository bound to EP-discovered selectors) · **FT-023** (compile and validate) · **FT-013** (publish test cases through the SPI) | Full |
| 13 | Execution against the tenant application | **FT-024** (readiness) · **FT-025** (authentication → session → discovery → execution → evidence → results) | Full |
| 14 | Healing attempts and evidence capture | **FT-026** proactive · **FT-027** reactive · **FT-028** self · **FT-029** evidence custody, returned by reference | Full **in declaration** — see §2.5: the implementation places all healing IP-side, so the declared EP-side execution does not exist yet (D-007) |
| 15 | Real-failure determination, verdict, traceability, bug determination | **FT-030** (interpret unresolved failures) · **FT-031** (defect analysis, AI root cause) · **FT-036** (release readiness) · **FT-037** (deterministic certification, single `certify()` authority) | Full |
| 16 | Synchronise to the project and test-management tools | **FT-032** (create bugs with evidence, traceability, environment, logs, video, stack, root cause) · **FT-033** (publish results and links) | Full |
| 17 | Executive rollup reporting | **FT-034** (release/quality/risk/coverage/automation/defect metrics) · **FT-035** (enterprise executive Release Quality report) | Full |

**No narrative step is without canonical coverage.** One narrative step — step 14 — is fully covered
*as a declaration* but not as an implementation; that is D-007 and §2.5, and it is a defect against
the canon rather than a gap in it.

### The canon is a strict superset — and this is the finding, not a footnote

**Four canonical steps have no counterpart anywhere in the seventeen-step narrative. None of them
is optional. A build driven by the narrative alone would silently omit all four.**

| Step | What the narrative omits | Why the omission would be severe |
|---|---|---|
| **FT-001** | Resolve tenant configuration, enabled capabilities, evidence and reporting profiles | The run would have no tenant scope, no capability entitlement and no evidence profile. Under C-07.11 tenant scope comes from the authenticated principal; a workflow that never resolves it has nowhere to get it from |
| **FT-002** / **FT-003** | Resolve the project and test-management connectors *from configuration* | Without these the tool is chosen somewhere else — in code. That is precisely the provider-branch R-14.25 and C-14.1 forbid, and it is how "support Jira" becomes a second workflow |
| **FT-005** | Build and maintain the stable application knowledge model from Execution-Plane-discovered reality | Every locator, page object and selector binding in FT-019→FT-022 grounds against this model. Authoring without it is authoring against an application nobody observed |

**FT-005 deserves particular attention.** It is the Discovery grounding this programme was separately
considering adding — and the canon already specifies it, and specifies it better than the proposal
did: it fixes the plane split explicitly (*"the intelligence is IP, the observation is EP"*, R-12.7),
binds FT-022's locator repository to it by reference, and places it at stage 2 rather than leaving it
implicit. **The requirement was never missing. It was missing from the narrative.**

This is the strongest available argument for treating the canon as authoritative and the narrative as
a view. A seventeen-step account of this capability is not a smaller description of the same thing —
it is a description with four load-bearing steps absent, three of which are the entire configuration
and connector-resolution front end, and the fourth of which is the observational ground truth that
all automation authoring depends on. Had this ADR adopted the narrative as its acceptance target, the
omission would have been invisible until a tenant ran it.

**A second seventeen-step numbering is deliberately not created.** One topic, one document
(CHARTER §4); ADR-0066 already makes this file the single source of workflow governance.

### 2.2 The Intelligence Plane may not perform tool I/O

The earlier draft of this ADR proposed real REST clients behind the Intelligence Plane's SPIs. **The
constitution forbids it, in four rules:**

[`01-platform-constitution.md`](../architecture/01-platform-constitution.md), Rule 3 — *"The Intelligence Plane reasons; it does not touch customer systems"*:

> **R-3.2** The Intelligence Plane SHALL NOT open connections to customer systems. *(line 116)*
> **R-3.3** The Intelligence Plane SHALL NOT hold customer credentials. *(line 118)*
> **Conformance:** …no outbound connection targets a customer system. *(line 126)*

Rule 5 — communication is one-directional:

> **R-5.1** All cross-plane communication is **initiated by the Execution Plane**. *(line 148)*
> **R-5.2** There SHALL be no callback, queue, webhook, or long-lived socket from the Intelligence Plane into the customer tenancy. *(line 150)*
> **R-5.3** All cross-plane traffic SHALL pass through **exactly one client module**. *(line 152)*

Rule 6 — secrets never cross:

> **R-6.3** Credential custody belongs exclusively to the Execution Plane. *(line 169)*

[`14-tool-operating-model.md`](../architecture/14-tool-operating-model.md):

> **R-14.16** Tool credentials are created, held, and rotated **by the customer**, in the Execution Plane (INV-2). *(line 77)*
> **R-14.17** Only credential **references** cross the plane boundary. *(line 79)*
> **R-14.18** Credentials SHALL be resolved at point of use, not gathered into a process-wide store. *(line 81)*

**No ADR grants an exception.** The nearest reinforce the prohibition: ADR-0032 §24 admits a tenant
configuration repository into the Intelligence Plane only *"provided it holds no customer credential
(INV-2)"*; ADR-0031 §24 records the established pattern for credentialed work — *"credentialed
enumeration executes at the customer edge… the Intelligence Plane receives only non-secret
metadata"*.

**R-3.2 bans the connection, not the mutation.** A read is as forbidden as a write.

### 2.3 R-3.2 has only two of its three enforcement mechanisms

The constitution states R-3.2/R-3.5 enforcement as *(1) dependency ban gate over the plane's
manifest; (2) import-scan gate over its source tree; (3) egress policy at the runtime boundary*
(line 127). Mechanism (3) **does not exist in this repository**.
`verify-execution-plane-boundary.js` implements (1) and (2) and is scoped to **R-3.5 only** —
browser, load and scan capability. Measured:

```
1. Manifest dependency ban (R-3.5 enforcement mechanism 1)   PASS  16 manifests
2. Source execution ban — LIVE code, whole tree (mechanism 2) PASS  476 sources
RESULT: PASS — the Intelligence Plane contains no execution capability.
```

An HTTP client to a customer's test-management tool would have compiled, passed all 67 gates and
shipped. CHARTER §6 requires a minimum of three independent enforcement mechanisms per
constitutional rule; R-3.2 has two. **The absence of a detecting gate is not permission**, and a rule
enforced only by documentation is the failure class this platform exists to prevent.

### 2.4 Capability 1 has two runtimes, and the fidelity is on the wrong one

| Runtime | Entry point | Synchronisation mechanism |
|---|---|---|
| **Agent-catalogue** | `FunctionalTestingOrchestrator` + `buildCatalogue()` — 144 agents | `design-sync.*` → `TestDesignSyncAdapter.createTestCase` |
| **Canonical-domain** | [`canonical-capability.ts`](../../packages/functional-testing-engine/src/canonical-capability.ts) lines 125–137, `d1`–`d13` | `d12` → [`domains/synchronisation.ts`](../../packages/functional-testing-engine/src/domains/synchronisation.ts) line 128 → `publishTests` |

This is authorised, not accidental: [ADR-0061](ADR-0061-canonical-functional-capability-runtime-adoption.md)
(**ACCEPTED 2026-07-30**) makes the canonical runtime *"the single authoritative implementation"* (§4)
and names the agent path a retirement target (§6 step 6, §8).

**But Phase 6.9 (`bff18a0`, 2026-08-02) added `TestDesignSyncAdapter` — 13 high-fidelity operations
— to the agent path only, three days after ADR-0061 was accepted.** The canonical path holds zero
references to it; `createSynchronisationDomain` receives only `TestManagementAdapter` and
`ExecutionAdapter`.

| # | Date | Commit | Event |
|---|---|---|---|
| 1 | 2026-07-23 | `5ef7c7e` | F-4 gate assertion written |
| 2 | 2026-07-29 | `35eb5c7` | canonical `d12` written, calling `publishTests` |
| 3 | 2026-07-30 | — | **ADR-0061 ACCEPTED** — agent path becomes a retirement target |
| 4 | 2026-08-02 | `bff18a0` | **Phase 6.9 adds `TestDesignSyncAdapter` to the agent path only** |

`TestDesignSyncAdapter` carries ordered steps with data and expected results, shared steps,
parameter sets, design attachments by reference, tags, area and iteration classification, suite
assignment, and a read-back so validation observes the tool rather than trusting the write.
`publishTests` carries an id and a title.

Executing ADR-0061 §6 step 6 as written would therefore delete the only full-fidelity write path.
Invisible today, because both adapters are in-memory. Destructive the moment a real client sits
behind the SPI: `createTestCase`/`updateTestCase` key on `externalId`, so rich test cases in a
customer's system of record would be overwritten with stubs.

### 2.5 Declared healing ownership does not match implemented healing ownership

The canonical workflow declares **FT-026 Proactive Healing, FT-027 Reactive Healing and FT-028 Self
Healing at stage 8, plane EP→IP.** The agent registry implements `healing.proactive`,
`healing.reactive` and `healing.self` — and all thirteen `healing.*` agents — at **plane IP, stage
reflection (10)**.

There is therefore **no Execution-Plane mechanical healing anywhere in the platform**, and healing
cannot operate with the Intelligence Plane unreachable, which R-12.4 and INV-7 require of stages 8
and 9. `verify-functional-workflow-substructure` passes because it does not compare the canonical
workflow's declared plane and stage against the agent registry's. This is recorded as a finding, not
resolved here: the repair is Execution-Plane work.

## 3. Alternatives

**A. Realise real REST clients inside the Intelligence Plane.** The earlier draft. Rejected — it
violates R-3.2, R-3.3, R-6.3 and R-14.16, and would have shipped undetected because R-3.2's third
enforcement mechanism does not exist.

**B. Amend Rule 3 to permit Intelligence-Plane egress.** Rejected. Rule 3 is the sovereignty
boundary the platform is built on; amending it to fit an implementation inverts the precedence order
CHARTER §3 establishes. If egress were ever genuinely required, the path is a deliberate
constitutional amendment, never an implementation that contradicts the rule in place.

**C. Realise connectors in the Execution Plane; keep the Intelligence Plane composing intent against
injected ports; retain the in-memory implementations as the conformance substrate.** **Chosen.** It
matches the seam that already exists — `createSynchronisationDomain` takes its connectors by
injection — and it is what R-12.5 and R-3.2 jointly require: the Intelligence Plane decides *what* is
published, the Execution Plane performs the I/O and holds the credential.

**D. As C, but retire the agent path on ADR-0061's current schedule.** Rejected: it deletes the only
full-fidelity write path before the surviving runtime can replace it (§2.4).

## 4. Decision

**P-69.1 — Capability 1 is not retired, renumbered, replaced or extended with new agents.** R-11.4
stands at six capabilities. `11-capability-model.md` is not amended. The fifteen-agent replacement
roster is rejected on the evidence in §1.

**P-69.2 — The retirement precondition, expressed as a measurement rather than a list of names.**
*(Amended 2026-08-04. The original text named a single capability — the Phase 6.9
`TestDesignSyncAdapter` — as the thing retirement must not lose. That was a decision defect, not a
recording gap: enumerating the canonical domains found a second unported capability
(`observation-interpretation`), and running an exhaustive inventory then found **fourteen**. A
precondition that names instances is only as complete as the last person who looked, and nobody had
proved the list was closed. This amendment replaces the names with the measurement.)*

*(**Amended again 2026-08-04**, after the inventory became valid. Both amendments above were
written while the instrument was degenerate; the figure "fourteen" was produced by a measurement
that could not find an orphan at all, and is withdrawn. **The measured count is ten.** The
correction is kept visible rather than silently restated, because the way the earlier numbers were
wrong is the finding — see `TECHNICAL_DEBT.md` D-018. Two further corrections, in opposite
directions, are recorded below; both were named instances in the original text, and **both named
the wrong thing**, which is the argument for the measurement rather than a footnote to it.)*

No real connector **write** SHALL be enabled, and **ADR-0061 §6 step 6 SHALL NOT be executed**,
until every entry reported by
[`governance/capability/retirement-inventory.mjs`](../../governance/capability/retirement-inventory.mjs)
is resolved as either **PORTED** to the canonical runtime or **DELIBERATELY DROPPED with a stated
reason**. The inventory computes ORPHANS = (transitive closure of the retirement targets) minus
(transitive closure of the canonical entry points **cut at the retirement targets**); its method is
stated in its header so it can be re-run and audited, and it emits `retirement-inventory.json` as
evidence.

**The cut is load-bearing and is not a convenience.** Measured without it, all three retirement
targets sit *inside* the surviving closure — `authoring-bridge.mjs` imports
`FunctionalTestingOrchestrator`, `buildCatalogue` and `createFunctionalTestingEngine` — so the set
difference is empty by construction and reports zero orphans however many exist. ADR-0061 §6 step 6
says the bridge is **re-pointed**, so the question this precondition needs answered is *what is
orphaned after re-pointing*, and cutting the traversal at the targets is what asks it. The cut
edges are published as `repointObligations` rather than discarded. **`orphanCount` is meaningless
while `repointObligationCount` is non-zero, and the two SHALL be read together.**

**Two named instances corrected, in opposite directions.**

- **`observation-interpretation` is NOT orphaned by retirement.** `authoring-bridge.mjs:40` imports
  `decomposeAcceptanceCriteria` and `classifyArtefact` from it directly, so it survives re-pointing
  untouched. It remains outside `CANONICAL_DOMAIN_SEQUENCE`, and **the original text conflated two
  distinct problems**: *outside the canonical sequence* is a sovereignty question about what the
  canonical runtime performs, and *deleted by retirement* is a reachability question about what
  survives ADR-0061 §6 step 6. A module can be either, both, or neither. This one is the first
  only, and it is ported on the sovereignty grounds — not rescued from retirement.
- **The design-synchronisation entry named the wrong half.**
  `src/design-sync-adapters.ts` — the adapter the original text named — is in the surviving closure
  and is **not** orphaned. `src/agents/design-sync.ts`, which exports `designSyncAgents`, **is**.
  The capability at risk is the agents, not the adapter.

**One re-pointing obligation ADR-0061 does not mention.** `src/registry/reasoning-publication.ts:36`
imports `EngineState` from `src/capability.ts:255`. ADR-0061 §6 step 6 names only
`authoring-bridge.mjs` as requiring re-pointing. This import is **type-only**, so it costs nothing
at runtime and erases at compile time — but it is a surviving module depending on a retirement
target, and it is recorded here because the ADR's re-pointing scope is, on the measurement,
incomplete by one.

An entry resolved as DROPPED requires a reason recorded against it. Silence is not a resolution: the
failure this precondition exists to prevent is a capability disappearing because nobody enumerated
it, and an unexplained omission is indistinguishable from that.

**R-3.2 is the stronger of the two blocks on connector writes**: it forbids the connection entirely,
read or write, from the Intelligence Plane. P-69.2 governs the Execution Plane once egress is legal
there, and governs retirement unconditionally.

**P-69.3 — Tool I/O belongs to the Execution Plane.** The Intelligence Plane composes publication
intent against injected ports and performs no network call to a customer system. Connector
realisation is **Execution-Plane scope**, blocked on the Execution Plane product repository recorded
at [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md) §9.1. Credentials are customer-held in the
Execution Plane; only references cross; references resolve at point of use (R-6.1, R-6.3, R-14.16,
R-14.17, R-14.18).

**P-69.4 — The in-memory implementations are retained as architecture, not scaffolding.** They are
the credential-free conformance substrate that proves provider equivalence (F-9, F-10) and they are
not deleted when real connectors exist.

**P-69.5 — No fixture supplies an outcome the system is supposed to produce.** An injected port is
architecture; a fixture returning a pre-written verdict is the defect. Where a property cannot be
measured it reports `NOT MEASURED` with a named reason and a stated measurement method, in the
established `notMeasured(...)` style. An honest `NOT MEASURED` is acceptable; a green test proving
nothing is not.

**P-69.6 — F-4 is resolved by making the measurement honest.** The stale clause in the
[`conformance.test.ts`](../../packages/functional-testing-engine/test/conformance.test.ts) lines 61–66
exclusion comment — which asserts this engine does not call `publishTests`, four days after it began
to — is corrected; the comment's principled refusal to call an operation once to green a census
stands. The completeness scenario **exercises both runtimes while both exist**, so the census
measures the capability rather than one path, and **converges to canonical-only when the agent path
retires under P-69.8**. `publishTests` is neither wired into the agent path nor removed from the SPI.

**P-69.7 — F-15 and IC-1 are root-caused before they are repaired.** The cause is reported and
accepted first. A repair that greens a gate without a stated cause is not a fix.

**P-69.8 — ADR-0061 §6 step 6 stays deferred** until P-69.2 is satisfied. This ADR does not amend
ADR-0061; it records a precondition on one migration step and the evidence for it.

**P-69.9 — R-3.2 acquires its third enforcement mechanism.** An executable gate detects
outbound-HTTP capability in Intelligence-Plane manifests and runtime source, separating four cases:
platform-infrastructure egress to the platform's own identity provider; browser-context code that
executes in the user's browser rather than an Intelligence-Plane process; emitted template text that
is generated for tenant solutions rather than executed here; and everything else, which fails. Every
allowlist entry carries a recorded rationale — **an allowlist entry without a rationale is a
bypass**.

**P-69.10 — Every agent carries a human-facing name alongside its machine id.** The `id` remains the
stable machine key; `name` is added to the agent contract in the capability framework, so all six
capabilities receive it and no framework code branches on capability identity (C-11.11). Names are
PascalCase, suffixed `Agent`, unique, and contain **no vendor or tool token** (R-11.5, R-14.2).

## 5. Consequences

**What improves.** The capability acquires a defined, legal path to real tool interaction, with the
plane boundary settled before any client is written rather than after. R-3.2 becomes enforceable
rather than merely stated. The two-runtime condition acquires a safe ordering instead of an implicit
race between a retirement and an unported capability. The fidelity gap and the healing-ownership
drift are written down while both are still cheap. Agents become legible to a tenant by name rather
than by internal id.

**What it costs.** Connector realisation leaves this repository and becomes dependent on an
Execution Plane product repository that does not yet exist, so the capability's first real tool
interaction is further away than the earlier draft implied. Porting design-synchronisation to the
canonical runtime is real work on the critical path. Two adapter implementations per provider must
be maintained, with an equivalence obligation between them that is `NOT MEASURED` until a live run
exists.

**What does not change.** The six capabilities, the twelve stages, the canonical workflow FT-001 →
FT-037, the governance triad, the single Policy Decision Point, the `ExecutionPackage` contract, the
four validation levels before sealing, plane ownership, evidence-by-reference, the 144 agents and
the 13 domains.

**Risk, recorded honestly.** (a) If P-69.2 is treated as advisory once Execution-Plane egress is
legal, the outcome is silent degradation of customer test cases — invisible to every gate currently
running. (b) The equivalence between in-memory and real adapters is unproven until a live run
exists; until then it is `NOT MEASURED`, not assumed. (c) The healing-ownership drift (§2.5) means
degraded-mode healing is currently impossible; that is a real capability gap, not a documentation
defect.

## 6. Migration strategy

Each step separately authorised; none performed by this ADR.

1. Build R-3.2's third enforcement mechanism (P-69.9), with a recorded fault proof, registered in
   the runner.
2. Correct the F-4 comment and extend the completeness scenario to both runtimes (P-69.6).
3. Name all 144 agents and add the naming gate (P-69.10).
4. Root-cause and repair F-15 and IC-1 (P-69.7).
5. Emit the capability's tenant configuration scaffold, so generated tenants are correct by shape
   before the runtime exists.
6. Specify the Execution-Plane connector contract — timeouts, bounded retry on 429/5xx only,
   `Retry-After`, pagination to completion, a typed error taxonomy that fails loud rather than
   returning an empty result, and `externalId` idempotency on every write.
7. Port design-synchronisation onto the canonical runtime — the gating step for P-69.2.
8. Realise connectors in the Execution Plane, once that repository exists.
9. Retire the agent-catalogue runtime per ADR-0061 §6 step 6 — after, and only after, 7 and 8 are
   verified.

## 7. Version impact

- **No contract change.** `CONTRACT_SCHEMA_VERSION`, `EXECUTION_CONTEXT_VERSION` and
  `PACKAGE_GOVERNANCE_VERSION` unchanged. No SPI method is added, removed or re-typed.
- **No architecture document version increment.** No frozen document is amended.
- **No canonical workflow change.** FT-001 → FT-037 v2.3.0 is affirmed, not modified; no step is
  added, removed, reordered or re-owned.
- **The agent contract gains an additive `name` field** (P-69.10) — additive and non-breaking; a
  consumer reading only `id` is unaffected.
- **Two new governance gates** raise the registered total from 67 to 69.
- Execution Plane impact: none. No package section is added, removed or re-required.

## 8. Affected components

- `docs/adr/ADR-0069-capability-one-connector-realisation.md` — **New** (this ADR).
- `program/DECISIONS.md` — **Amended** (ADR-0069 index row).
- `program/PROJECT_STATE.md` — **Amended** (§9.1 Execution Plane sequencing dependency; §9.2 fidelity precondition).
- `program/TECHNICAL_DEBT.md` — **Amended** (the healing-ownership drift of §2.5, pending its Execution-Plane repair).
- `governance/verification/run-all.js` — **Amended** (the two new gates of §6 steps 1 and 3 are registered when they are built).
- `governance/verification/record-fault-proofs.js` — **Amended** (a clean/faulted pair for each new gate).
- `governance/verification/proofs.json` — **Amended** (regenerated registry).
- `packages/capability-framework/src/agent.ts` — **Amended** (P-69.10: `AgentDefinition` gains `name`).
- `packages/functional-testing-engine/test/conformance.test.ts` — **Amended** (P-69.6: the stale clause corrected; the exclusion and its reasoning stand).
- `governance/capability/run-functional-completeness.mjs` — **Amended** (P-69.6: exercises both runtimes).
- `governance/capability/run-intent-conservation.mjs` — **Amended** (P-69.7: IC-1 root cause).
- `packages/functional-testing-engine/src/domains/synchronisation.ts` — **Amended** (P-69.2: the canonical synchronisation domain gains the design-synchronisation capability it lacks).
- `packages/functional-testing-engine/src/canonical-capability.ts` — **Amended** (P-69.2: `d12` receives the design-synchronisation port).
- `packages/functional-testing-engine/src/canonical-runner-capability.ts` — **Amended** (P-69.2: the same composition change on the runner path).
- `packages/tenant-onboarding-engine/src/engine/solution-export.ts` — **Amended** (the capability's tenant configuration scaffold replaces the generic default).
- `packages/platform-providers/src/config/schema.ts` — **Amended** (the scaffold's keys validated by the existing Configuration Provider; no second configuration reader).
- `governance/capability/retirement-inventory.mjs` — **New** (P-69.2 as amended: the measurement the precondition references, replacing the named instances).
- `packages/capability-framework/src/adapters.ts` — **Unchanged**, and named to record that no SPI change is required: the nine existing ports already carry every operation this work needs.

**The two new governance gates of §6 steps 1 and 3 are deliberately not listed above.** They do not
exist yet, and `verify-change-control-completeness` requires that every component an ADR declares
`New` already exists — a rule that stops an ADR from promising an artefact nobody ever builds.
ADR-0061 fails that property today for precisely this reason. Each gate is added to this list in the
same change that creates it, together with its recorded fault proof, as CHARTER §18 requires.

**No frozen architecture document, no contract, no canonical workflow step and no existing governance gate is modified by this ADR.**
