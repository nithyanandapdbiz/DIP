# Story input — attachments, completeness as refusal, and subject before breadth

**Status:** REPORTED · measured 2026-08-06 · **three rulings taken, four capability decisions open, one finding corrected against the register**
**Requested:** report before design. **No design is proposed here and none was authored.**
**NEXT_ACTION is unchanged** — M5's sealing-certification ruling still blocks a real package, and nothing below competes with it.

---

## 0. Two corrections, before anything is read

**(a) The prompt's premise about `RequirementInput` was stale, and the correction moves the whole of part 1.**
The request stated that `RequirementInput` carries `rawAcceptanceCriteria`. It does not, and has not since
Section D. [`story-intelligence.ts:42-48`](../packages/functional-testing-engine/src/domains/story-intelligence.ts#L42-L48)
carries `id · title · statement · rawBusinessRules · rawDependencies`; the raw acceptance-criteria text
travels as an observed fact on `StoryObservation` and is split by `observation-interpretation`
(ADR-0075 P-75.2). **The consequence is not cosmetic: the carrier a story attachment would use already
exists, and it is `StoryObservation`, not `RequirementInput`.** Everything in §1 is measured against that.

**(b) The finding held back for a ruling is already ruled, and the ruling says the opposite of the request's framing.**
The request put `policy-review` approving on `story !== undefined` outside the capability decisions —
*"a gate that reviews a domain and does not read its verdict is the gate not doing its job."*
**D-019, amended 2026-08-06, rules precisely this shape and rules it a capability decision:**

> `policy-review` and `guardrail-review` cannot refuse **by ruling**, because their predicate is
> *was this artefact authored?* and the negative is **pure absence** — there is no *did-not-approve*
> state to reach, and a refusal would claim a review ran. **So the triad establishes that the three
> artefacts exist and the architecture is non-empty; it does NOT establish that any of them is sound.**
> Closing it is ADR-0076 §4.4's `UNDECIDED — Functional Testing` — **a decision with an owner, not a
> repair with no author.**

§4 reports this in full, with what is genuinely new and what the register already held.

---

## 1. Attachments

### 1.1 What reads a story attachment — measured

**Nothing reads attachment content, in either plane.** Three sites read attachment *names*; one writes
references outward.

| Site | Has | Does |
|---|---|---|
| [`observation-interpretation.ts:313-319`](../packages/functional-testing-engine/src/domains/observation-interpretation.ts#L313-L319) | `artefacts: { name, retrieved }[]` on `StoryObservation` | carries them |
| [`classifyArtefact`, :180-201](../packages/functional-testing-engine/src/domains/observation-interpretation.ts#L180-L201) | the filename string only | regex over extension and name → one of seven kinds |
| [`assessCompleteness`, :289-290](../packages/functional-testing-engine/src/domains/observation-interpretation.ts#L289-L290) | the `retrieved` booleans | emits the `attachments-retrieved` signal |
| [`design-sync.ts:551-575`](../packages/functional-testing-engine/src/agents/design-sync.ts#L551-L575) | `DesignArtefact[]` | writes `{name, kind, sha256, locator}` to the customer's test tool |

**Two facts qualify all four, and they are the operative ones.**

**Nothing populates `artefacts`.** The only producer of a `StoryObservation` in the repository is the
fixture — [`canonical-reference-input.ts:304-306`](../packages/functional-testing-engine/src/canonical-reference-input.ts#L304-L306),
hard-coding `payment-form-mockup.png / retrieved:true` and `payments-api.yaml / retrieved:false`.
`translateExecutionRequest` obtains it from an injected `fetchRequirement` provider
([`execution-request-translator.ts:53-55`](../packages/functional-testing-engine/src/runtime/execution-request-translator.ts#L53-L55))
that has no implementation. **The Execution Plane performs no work-item attachment retrieval at all** —
its only `attachments` call is an outbound `attachEvidenceReference`. The `attachment-intelligence`
agent that downloaded and indexed attachments (PLANE-SOVEREIGNTY-AUDIT §7, agent 3) belongs to the prior
EP codebase, not the current one.

**Nothing populates `DesignArtefact[]` either.** `design-sync-composition` accepts `artefacts`
([:78](../packages/functional-testing-engine/src/design-sync-composition.ts#L78)) and the canonical
composition never fills it. `canonical-capability-conformance.test.ts` asserts `report.attachments === 0`
and passes because the list is empty on every run.

> **`retrieved` is a boolean nobody sets, and `classifyArtefact` classifies a list nobody fills.**
> The capability is shaped end-to-end and unwired end-to-end.

### 1.2 RULED — attachments cross by reference only

**The contract already says so, and predates this request.**
[`ArtefactObservationSchema`, `observation-set.ts:106-116`](../packages/contracts/src/observation-set.ts#L106-L116):

```
name · extension · mediaType · bytes · sha256 · retrieved · retrievalError · provenance
```

commented *"an artefact that exists, described by what is observable about it — never by what it is FOR."*
**There is no content field.** `ProvenanceSchema` already enumerates `'attachment'` as a `sourceKind`
([:64](../packages/contracts/src/observation-set.ts#L64)). Audit V-11's recommended fix is this shape exactly.

The write side matches: [`DesignAttachmentRef`, `adapters.ts:112-130`](../packages/capability-framework/src/adapters.ts#L112-L130)
— *"by REFERENCE, exactly like `EvidenceReference` and for the same reason… There is no `content` field
and there will not be one."*

**So evidence's referencing model is not an analogy here. It is the same model, already declared on both
the inbound and the outbound contract.** What is absent is anything that fills either.

**Ruled, and recorded as ruled:**

| # | Ruling |
|---|---|
| **R1** | **Attachment content crosses by reference only.** `ArtefactObservationSchema` has no content field and will not gain one. |
| **R2** | **Content is C1** — permitted in the Intelligence Plane **never, except under §2**; where present, **ephemeral for the request, never persisted** ([`06-data-sovereignty.md`](../docs/architecture/06-data-sovereignty.md) R-06.4 and the retention table). |
| **R3** | **No attachment store, and no ADR authorises one** without all four R-06.4 conditions — a named ADR recorded *in the storing module's own source*, a field-level allow-list, scrubbing on the write path, and enforced purge with a test proving unreadability. |
| **R4** | **WHO FETCHES is EP-side, by R-3.2** — *"The Intelligence Plane SHALL NOT open connections to customer systems"* ([`01-platform-constitution.md:116`](../docs/architecture/01-platform-constitution.md#L116), conformance C-01.9). This is not a preference; the IP fetching a work-item attachment is a constitutional breach. |

**Still open:** **WHETHER** an attachment is retrieved at all is a capability decision and is *not* ruled
here. R1–R4 settle the shape and the custody if it happens; they do not authorise it happening.

### 1.3 The gap that is load-bearing — and it is a defect, not a design

**The runtime does not carry the contract's shape.** `StoryObservation.artefacts` is `{name, retrieved}`
— a flattened projection that **drops `sha256`, `mediaType`, `bytes`, `retrievalError` and `provenance`**.

This is recorded, not discovered:
[`observation-interpretation.ts:305-311`](../packages/functional-testing-engine/src/domains/observation-interpretation.ts#L305-L311)
states the projection is *not* an `ObservationSet`, that it presumes someone already decided which
work-item field is the acceptance criteria, and that **ADR-0075 P-75.8 records the gap open rather than
closing it.**

**RULED: the projection is a defect, and widening it to the contract's shape is a BUILD, not a decision.**
P-75.8 already holds the gap open; nothing further is owed before the widening can be authored.

The consequence for §2 is direct and is why this ordering matters:
**`retrievalError` is where *"a reference to an attachment that cannot be read"* would live, and the
runtime shape has no field for it.** A failed retrieval and a retrieval nobody attempted are the same
value today.

**And a second defect on its own terms, ruled to be fixed with the widening rather than deferred to the ADR:**

```ts
signal('attachments-retrieved', input.artefacts.length === 0 || input.artefacts.every((a) => a.retrieved), …)
```

**A story with no attachments and a story whose attachments all downloaded report the identical
`present: true`.** That is the absence/silence distinction the `ObservationSet` contract added
`retrievalError` and `retrievalGaps` to prevent, defeated in the projection that consumes it.

Both are recorded as **D-130**.

---

## 2. Story completeness as a refusal

### 2.1 What exists — thirteen signals, and no verdict, deliberately

[`assessCompleteness`, :260-292](../packages/functional-testing-engine/src/domains/observation-interpretation.ts#L260-L292)
already emits every signal the request names, each carrying its own evidence string:

- **`expected-results`** — *"N of M criteria state an expected outcome"* → an acceptance criterion with no
  observable outcome is **already measured**
- **`attachments-retrieved`** — *"N of M attachment(s) retrieved"* → an unreadable attachment is
  **already measured** (subject to the defect above)
- `navigation` — *"no criterion states how to reach the feature"*
- plus `roles-permissions`, `validation-rules`, `business-rules`, `ui-mockups`, `api-specification`,
  `dependencies`, `known-defects`, `existing-tests`, `gherkin-structure`, `acceptance-criteria`

The domain's certification criteria include `'no-ratio'`, and the header states why: the prior
implementation divided present by total and published `completeness score: 46%`, *"which reads as a
verdict no matter what the surrounding prose says."* **The score was removed on purpose. The signals are
returned and nothing weighs them.**

### 2.2 What is absent — the signals reach no decision

**(a) `completenessSignals` is consumed by nothing.** It sits on `ObservationInterpretationResult`, whose
only downstream reader is `story-intelligence` — which reads `interpretation.acceptanceCriteria` and
nothing else ([:157](../packages/functional-testing-engine/src/domains/story-intelligence.ts#L157)).
**Twelve of the thirteen signals are computed every run and discarded.** The Platform Event publishes a
count of how many were present ([:422](../packages/functional-testing-engine/src/domains/observation-interpretation.ts#L422))
and that is their entire effect.

**(b) `observation-interpretation` cannot refuse.** Its `execute` has exactly one exit —
`certified: true, failure: null` ([:383](../packages/functional-testing-engine/src/domains/observation-interpretation.ts#L383)).
There is no branch. **The one domain holding every completeness signal is the one domain in the sequence
with no negative finding.**

**(c) The refusal that does exist does not stop generation.** `story-intelligence` returns
`certified:false / category:'requirement'` when no criterion survives normalisation
([:227-238](../packages/functional-testing-engine/src/domains/story-intelligence.ts#L227-L238)), and its
comment states the downstream consequence exactly — *"a full run, a complete report, and a suite that
verifies nothing."* Then `policy-review` approves it on `story !== undefined`. **See §4.**

### 2.3 The "1 of 2 criteria uncovered" precedent, read accurately

[`test-management-intelligence.ts:292-305`](../packages/functional-testing-engine/src/domains/test-management-intelligence.ts#L292-L305)
refuses on `uncovered > 0`, `recoverable: true`. Its own comment corrects an earlier misattribution: the
figure is **relayed** from `repository-intelligence.coverageSummary`, not computed there.

That is the shape the request calls for — a domain reporting a fact it can see, at the point it first
becomes visible, naming what is missing rather than inferring it. **But it is a downstream refusal on a
denominator, and it marks the run not-certified without stopping it.** For the part that matters —
*declining to generate* — there is no precedent to copy.

### 2.4 What an upstream refusal would need, and what blocks each

| Refusal named in the request | Signal exists | Blocking fact |
|---|---|---|
| an AC with no observable outcome | ✅ `expected-results` | nothing consumes it; the domain has no branch |
| a reference to an unreadable attachment | ⚠️ `attachments-retrieved` | the boolean is unset in practice; `retrievalError` is dropped by the projection; **and the signal reads `present:true` on an empty list** (D-130) |
| **a story naming no application module** | ❌ **not assessable** | **there is nothing to check a module name against** — §3 |

The third is not a missing check. **No application model exists against which "names an application
module" could be evaluated.**

---

## 3. Subject before breadth

### 3.1 The measurement is the Execution Plane's, and it is not theoretical

`CORRECT-CHECK-WRONG-SUBJECT.md` (Execution Plane, 2026-08-06, closed by construction) records
`op-002-url-is-the-organisation` reporting **OBSERVED/SATISFIED against Microsoft's Entra login page**,
because the authorize URL carries the organisation URL inside its own query string. Every component
behaved to specification; there is no line of code that is wrong.

> **Finding 1 — adding checks makes it WORSE.** Each additional satisfied comparison raises confidence in
> a conclusion about the wrong thing. *"Four checks against a login form produce a weaker artefact than
> one check against a login form, because four make the green result look earned."*

The corollary is the operative part: **no quantity of checks can close it, so no check was added to close
it.** The repair was `RunState.NOT_AUTHENTICATED`, ranked above every step-level condition including a
satisfied one. And the guard that later held was written **positive** — *is this the origin I was told to
expect* — not negative; it rejected an intermediate `mel--ocecrmlivesg611.crm6.dynamics.com` hop that
both obvious defences would have accepted, a case its author did not know existed.

> **A negative control must enumerate the substitutions it defends against, and it fails on the first one
> nobody enumerated. A positive control needs no enumeration, because it names the one subject that is
> correct and rejects the rest by construction.**

**The ordering is therefore recorded as a constraint on this work:** more test cases against the wrong
module is more confident wrong answers. **A-8's subject block and an application model precede test-case
breadth, or breadth amplifies the error.**

### 3.2 A-8 — measured state in this plane

**A-8 has not arrived here.** Grep across the entire Intelligence Plane for `A-8` returns only `GA-8`
(a deployment gate) and `AA-8` (an automation-architecture property). No ADR, no entry in
`TECHNICAL_DEBT.md`, `KNOWN_LIMITATIONS.md`, `PENDING_ADR_AMENDMENTS.md` or `DECISIONS.md`.

Against the contract:

```ts
ExecutionPackageSchema = { contractVersion, runId, correlationId, capabilityId,
  operations, directives, gates, evidenceRequirements, provenance, validity }
```
[`execution-package.ts:99-114`](../packages/contracts/src/execution-package.ts#L99-L114) — **no `subject`.**

**One nuance that looks like a partial answer and is not.** `provenance.tenantId` **is** carried
([:76-88](../packages/contracts/src/execution-package.ts#L76-L88)). But provenance records *who authored
this package*; it is not an assertion the executor is obliged to compare against its own configured
target before acting, and it carries no `expectedOrigin`. **The EP's argument stands unchanged:** the IP
knows what it commissioned, the EP knows only its `.env`, and no artefact compares the two. A run against
the wrong customer's environment is **undetectable rather than impossible** — and a green run is not
evidence against that; it is what makes it urgent.

**Raised here as D-132, because the Execution Plane cannot raise it in this plane and it is the only item
in their set with no workaround on their side.**

### 3.3 The application model — measured

**`ApplicationKnowledgeModel` exists as thirteen empty slots.**
[`application-strategy-resolution.ts:39-55`](../packages/functional-testing-engine/src/domains/application-strategy-resolution.ts#L39-L55)
declares `navigationNodes` (*"sitemap / areas / modules"*), `entities`, `forms`, `businessProcessFlows`,
`securityRoles` and eight more, with `source: 'strategy-resolution' until Discovery populates it`.

In the domain body, **ten of the thirteen are literal `[]` on every run.** The three that are populated
derive from the domain's own strategy decision, not from any application: `navigationNodes` is
`'nav:' + interactionType + ':' + strategyRef`. The domain's own comment records that a refusal on this
was designed and rejected — *"it is true on EVERY run, so it is a constant wearing a branch."*
(Already registered as D-016.)

Discovery holds the real model: [`discovery-flow-engine/src/model.ts:203`](../packages/discovery-flow-engine/src/model.ts#L203)
declares `ApplicationModel`, alongside `ApplicationFact`, `BusinessEntity`, `Relationship`, `Graph`,
`Journey`, `BusinessCapability`. **The functional-testing engine does not import
`@dbiz/discovery-flow-engine` — no source import, no package dependency.**

> **Two application models exist in this repository and nothing connects them.**

**So the ordering constraint is not a preference. It is the current state:** the subject block is absent
from the contract, the application model is empty on every run, and the only thing between a story and a
suite is a gate that checks `!== undefined`.

---

## 4. The finding held back for a ruling — reported

**Requested:** whether the other triad legs share `policy-review`'s shape, and whether reading `certified`
is a one-line change or reopens D-021's precedence — *"if it is one line and does not reopen D-021, it
should land regardless of every decision above it."*

**Reported: it is not one line in effect, it does reopen D-021, and it additionally lands inside two
further open decisions. It should not land regardless.** The reasoning is below, and one part of it is
genuinely new.

### 4.1 The three legs do NOT share a shape, and the asymmetry is the new finding

| Leg | Reviews | Can its subject dissent? | Predicate | Can the leg refuse? |
|---|---|---|---|---|
| `architecture-review` | `automation-architecture` | **No** — 0 `certified:false` sites | `architectureComponents.length > 0` | **Yes, reachably** — split absent→`notApplicable`, authored-but-empty→`refuse` |
| `guardrail-review` | `test-design-intelligence` | **No** — 0 `certified:false` sites | `testDesign !== undefined` | No |
| **`policy-review`** | **`story-intelligence`** | **YES** — reachable, D-016's implemented condition | `story !== undefined` | No |

**Measured:** `grep -c "certified: false"` returns **0** for both `test-design-intelligence.ts` and
`automation-architecture.ts`.

> **`policy-review` is the only leg of the three whose subject can dissent, and the only one whose gate
> ignores a verdict that exists.** The other two read `!== undefined` because **there is nothing else to
> read.** `architecture-review` had to invent its own predicate for exactly that reason — and its comment
> says so: *"No refusal PREDICATE is invented here either… What this capability's architecture review
> SHOULD refuse on is `UNDECIDED — Functional Testing`."*

**This asymmetry is not in D-019.** D-019 groups `policy-review` and `guardrail-review` together as
predicates whose negative is *pure absence*. That grouping was correct when written and is now correct
for only one of the two: `story-intelligence` acquired a reachable negative verdict (D-016), and
`test-design-intelligence` did not. **D-019 should be amended to record that its two grouped legs have
diverged** — that is the one genuinely new fact in this section.

### 4.2 Reading `certified` — mechanically one line, and that is the trap

`s.outcomes.entries` is in scope in the triad stage closures. The synchronisation refusal already uses
exactly that lookup ([`canonical-runner-capability.ts:331-334`](../packages/functional-testing-engine/src/canonical-runner-capability.ts#L331-L334)):

```ts
s.outcomes.entries.find((o) => o.domainId === 'synchronisation' && !o.certified && …)
```

So the *access* is one line. **The effect is not.** Two distinct changes are being conflated, and only
one of them is small:

**(1) Refusing on the verdict.** `emit.refuse` → `certify()` maps it to `certified: false` with
`firstRefusal` ([`certification.ts:139-148`](../packages/capability-framework/src/certification.ts#L139-L148))
→ `decidePublication` makes the package inadmissible and
[`runtime-entry-point-bridge.ts:160`](../packages/functional-testing-engine/src/runtime-entry-point-bridge.ts#L160)
**throws**, so the package is not published and the run does not dispatch.

**That is D-021's owed question, verbatim:** *"whether a domain's negative finding SHOULD block proceeding
or only be reported."* And it is the exact generalisation the existing refusal site explicitly declined
to make:

> *"It is scoped to PUBLICATION… It does not generalise to 'any domain negative refuses its stage', and
> extending it that way is D-021's decision to take, not this site's to imply."*

**It also changes `policy-review`'s predicate from presence to soundness — which is ADR-0076 §4.4's
`UNDECIDED — Functional Testing`, D-019's named closure**, a third open decision. So refusing touches
**D-021, D-019 and ADR-0076 §4.4** at once. Landing it "regardless of every decision above it" would
answer three deferred questions as a side effect of a one-line edit, which is the shape this register
exists to catch.

**(2) Reporting the verdict without changing the disposition.** `policy-review` carrying
`story-intelligence`'s `certified` and `failure.reason` in its `emit.ok` payload and observations is
genuinely one line, touches `certify()` not at all, changes no run's outcome, and reopens nothing.

**It is the only part that meets the request's own test.** It does not repair the gate — an approving gate
that also reports a negative is still approving — but it removes the condition D-019 names as the
consumer-facing harm: *"`certification.verdicts` reports `stage "policy-review" completed with 1 agent(s)`,
which reads as review having occurred. A reader has no signal that the approval was a `!== undefined` test."*

**RULED 2026-08-06 — (2) TAKEN, (1) NOT, AND THE FAILED TEST IS RECORDED AS A TEST RATHER THAN AS SILENCE.**

**(1) was tested against the condition it was offered under and the condition failed.** The instruction
was that the change *"should land regardless of every decision above it **if** it is one line and does not
reopen D-021."* It is not, and it does. **Recorded here so that the absence of the change is not later
read as an omission** — the conditional was honoured by not acting on it, which is a different fact from
nobody having looked.

**(2) landed.** `policy-review` now emits `subjectCertified` and `subjectFinding` alongside `approved`,
read from the same outcome-ledger lookup the publication refusal uses so the two sites agree by
construction. **The predicate is unchanged and `approved` is still decided by presence alone.**
`null` where the domain did not report, so it is distinguishable from `false`. The site states what it
does not do and why each was rejected, in the terms D-021 and ADR-0076 §4.4 use, so the next author meets
the reasoning before re-reaching for the refusal. **210/210 · 89/89, typecheck clean.**

### 4.3 The premise, resolved

The request placed this outside the capability decisions. **The register places it inside one, and the
register is correct** — but the request's underlying observation survives intact and is sharper than
D-019's version of it:

> D-019 says the triad *"establishes that the three artefacts exist… it does NOT establish that any of
> them is sound."* **What is now measurable, and was not when that was written, is that for one leg the
> soundness verdict already exists, is computed every run, and is discarded.** That is no longer only a
> deferred capability decision; it is a deferred capability decision with an unread answer sitting next
> to it.

---

## 5. Register

**Ruled in this report:**

| | Ruling | Where |
|---|---|---|
| **R1–R4** | attachments cross by reference only · content is C1 · no attachment store without R-06.4's four conditions · **who fetches is EP-side by R-3.2** | §1.2 |
| **R5** | the `{name, retrieved}` projection is a **defect**, not a design; widening it to `ArtefactObservationSchema`'s shape is a **build**, ADR-0075 P-75.8 already holds the gap open | §1.3 · **D-130** |
| **R6** | `attachments-retrieved` reporting `present:true` on an empty list is a defect on its own terms; **fixed with the widening, not deferred to the ADR** | §1.3 · **D-130** |
| **R7** | the twelve discarded completeness signals are recorded as a **declared-and-unconsumed instance** | §2.2 · **D-131** |

**Open capability decisions — four, correctly named, none taken here:**

| | Decision | Owner |
|---|---|---|
| **1** | **D-021's precedence** — does a domain's negative finding block proceeding, or only get reported? | Platform + capability |
| **2** | **Who weighs the completeness signals** — the score was deliberately deleted as a false verdict; restoring weighting without a named owner reintroduces it | Functional Testing |
| **3** | **A-8's subject block** — does the execution package assert its own subject? Contract amendment with a cross-plane consumer; **needs an ADR** | Contract · **D-132** |
| **4** | **Does Discovery's `ApplicationModel` source `ApplicationKnowledgeModel`?** Until ruled, *"the story names no application module"* is unassessable rather than unimplemented | Capability boundary |

**Also open, and not one of the four:** **WHETHER** a story attachment is retrieved at all (§1.2). R1–R4
settle shape and custody; they do not authorise retrieval.

**Builds, unblocked once the above are ruled — and not before:**

- an `ObservationSet` producer in the EP populating `artefacts` and `retrievalGaps`
- widening `StoryObservation.artefacts` to the contract's shape (**R5 — no decision owed**)
- wiring `completenessSignals` to any consumer at all
- populating `design-sync`'s `artefacts` input, which is plumbed and empty

**Amendment made to an existing entry:** **D-019** grouped `policy-review` and `guardrail-review` as legs
whose negative is pure absence. They have diverged — `story-intelligence` now has a reachable negative
verdict and `test-design-intelligence` does not (§4.1). **The general form is what was recorded, because
it outlives the instance:**

> **A finding that groups by SYMPTOM ages badly when one member's cause changes.** D-019 grouped two legs
> by what they *did* — read `!== undefined` — and the grouping was correct when written. One subject then
> acquired a verdict and the other did not, **so the shared symptom survived while the shared cause did
> not**, and the entry went on asserting a common explanation for two things that no longer had one.
> Nothing changed in the two lines it describes; what changed was underneath them. **A grouped finding
> SHALL name the cause it groups on, not only the behaviour, or it cannot be falsified on the day one
> member's cause moves.**

**Correction to a count in this report, and the correction is an instance of its own subject.** §2.2 was
first recorded as the **eighth** declared-and-unconsumed instance on a carried estimate. **Measured, the
priors are seven** — `requirementMapping` and `DomainOutput.certified` (D-033 i, ii), `automation-architecture`'s
unread `testManagement` input (D-016), `frameworkVersions`, `EvidenceReferenceSchema.packageHash` (D-115),
the execution-package schema (D-117), `receiveEvidence` (D-128). **D-107's own subject** — a figure asserted
from memory, correct-looking, never measured until something needed it to be right. **The measured
enumeration governs and is written out in D-131**, because a class register carrying an unreproducible
count would be an instance of itself.

**Governance drift found and routed, not resolved in passing.** `verify-decision-index` failed on three
properties. **One was mechanical and was taken:** `DECISIONS.md` declared ADR-0083 and ADR-0084 `PROPOSED`
while both files read `ACCEPTED` — an index not updated when the acceptance happened, so the correction is
owed *by* the acceptance. **Two were routed to `PENDING_ADR_AMENDMENTS.md` as AMD-4:** ADR-0040's
unrecognised `COMPLETE` status (**baselined content — a small ruling, not a typo fix**) and ADR-0067's
empty index cell. **One correction recorded rather than acted on:** ADR-0067's defect is measurably an
index row, not baselined content, and is mechanically the same class as the two just taken — left where it
was routed, with the measurement stated beside it.

**Also pre-existing and not this report's:** `verify-implementation-traceability` fails on
`packages/functional-testing-engine/src/model.ts [C-09.12, C-12.10]` — a file this session did not touch.

---

## 6. What this report does not do

It proposes no design, no schema, no ADR text and no code. It takes no position on D-021, on ADR-0076
§4.4, on A-8's field set, or on whether Discovery sources the knowledge model. **M5's sealing-certification
ruling remains `NEXT_ACTION` and is untouched by everything above** — it is still the thing blocking a real
package, and none of this work competes with it.
