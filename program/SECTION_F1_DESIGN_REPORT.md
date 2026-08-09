# Section F1 — design report

**DESIGN ONLY. Nothing built. Stop for ruling.** · 2026-08-04

> **THE INHERITED PREMISE, VERBATIM: placement is architecture, not wiring — whatever F builds becomes the agent layer for all 144. That is why F cannot be approached as a port.**

Nine agents need a home. A home for nine is a home for 144, and the shape chosen here is the shape every future agent inherits. This report is about the layer; the nine are its first tenant, not its specification.

**F1 carries:** the agent layer · placement of the nine · the twenty triad agents · the acceptance bar applied · the 109 criteria.
**Not F1:** `businessGoal`/`title`'s upstream source (a domain change, sequenced after) · the `failureHandling` audit and read-back validation (F2, independent).

---

## 1. What a canonical agent IS

`AgentDefinition` already exists and is well-formed — id, domain, purpose, stage, plane, inputs, outputs, responsibilities, `toolContracts`, `aiCapabilityClass`, `promptContract`, `aiBehaviour`, `failureHandling`, `handle`. **It is not the problem.** The problem is that nothing in the canonical runtime consumes one.

### The relation to `DomainContract`'s nine members

`DomainContract` is a **certification unit**: `id`, `version`, `preconditions`, `postconditions`, `determinism`, `observability`, `auditRequired`, `certificationCriteria`, `execute`. A domain is the thing the sequence certifies.

An agent is a **unit of work inside one**. The two are not peers, and the design turns on one asymmetry:

| | `DomainContract` | `AgentDefinition` |
|---|---|---|
| Declares what certifying it requires | `certificationCriteria` — **109 across 13 domains, 0 evidenced** | nothing today |
| Reports an outcome | `DomainOutput` — `certified`, `failure`, `observations` | a return value, unconstrained |
| Is addressed by the sequence | yes — `CANONICAL_DOMAIN_SEQUENCE` | no |

**RECOMMENDATION: an agent gains one member and one obligation, and nothing else.**

```ts
readonly certificationContributions: readonly string[];   // criteria ids this agent evidences
handle(input, ctx): AgentOutput<O>;                       // { output, evidenced, failure }
```

`AgentDefinition` keeps every existing member unchanged; **144 agents keep compiling.** `certificationContributions` defaults to empty, so an agent that evidences nothing says so rather than being silently exempt.

**Why not richer.** Every additional member is a declaration, and this register is a catalogue of declarations nothing enforced. An agent already declares eleven things; adding a twelfth that no gate reads would be D-024's class committed on purpose.

## 2. Composition WITHIN a domain, without a second lifecycle (R-12.18)

**The constraint is precise and it is the design's hardest edge.** R-12.18 permits exactly one orchestration lifecycle. The twelve-stage runner is it. **An agent layer that sequences, retries, branches or gates is a second lifecycle regardless of what it is called.**

**RECOMMENDATION: agents compose as a DECLARED SET behind a domain, invoked by that domain, and the domain remains the only thing the sequence addresses.**

```
CANONICAL_DOMAIN_SEQUENCE → DomainContract.execute()  ← unchanged, still the certification unit
                                   ↓ invokes
                            its declared agent set    ← new, and it is NOT a stage
```

Three rules make that not-a-lifecycle, and each is falsifiable:

1. **No agent invokes another agent.** Composition is the domain's, expressed in its `execute`. An agent calling an agent is a call graph, and a call graph with retries is a lifecycle.
2. **No agent has a stage of its own within the domain.** `AgentDefinition.stage` names the *twelve-stage* stage its domain runs at — it does not create one.
3. **An agent cannot refuse the run.** It reports `evidenced: false` with a reason; the DOMAIN decides what that means for `DomainOutput.certified`. **This is deliberate and it is the reach-versus-refuse rule applied one level in**: an agent says what it found, a domain says what the run concluded, and collapsing them would give 144 things the power to stop a run.

**REJECTED: an `AgentOrchestrator` per domain.** Thirteen orchestrators with their own ordering and failure handling is thirteen lifecycles wearing a different noun — and it is what the agent-catalogue runtime already does, which is the thing being retired.

## 3. Where the twenty triad agents live — **WITHDRAWN AS WRITTEN, AND THE STEP IS LIFTED OUT OF F1**

> **§3's recommendation is withdrawn. The triad step is SEQUENCED ON A NEW ADR — *can a coverage-remediation loop and an independent review of its output coexist under a forward-only runner?* (R-12.11 vs R-12.2) — and is NOT incomplete work.**
>
> **Why it was wrong:** it treated the twenty as reviewers because their `stage` said so, and fifteen of them are **generators** (`test.positive` → *"Generate the happy-path scenario"*, `outputs: Scenario[]`). Wiring them into the triad callbacks would have installed producer-reviews-self into the mechanism that exists to prevent it — **the very argument §3 used to justify the wiring.** The premise rested on a declaration and never on the behaviour: D-007's axis, inside an approved design report (D-035).
>
> **What survives:** the reasoning — stages 4–6 must not be performed by the producer. It is what condemns the wiring.
>
> **Why it cannot be repaired here:** the trace found neither a mis-staged label nor an absent capability, but **two constitutional constraints in genuine tension, resolved in favour of one, with the trade unrecorded.** Re-staging the eighteen breaks the remediation loop and re-enters a sealed stage; adding reviewers leaves the producer still certifying itself. **That is an architecture question and it does not get answered inside F1.**

**F1 CONTINUES WITHOUT IT, in this order:** place the nine (closes P-69.2's design-sync entry, and fires the scheduled contagion test) → the 109 criteria → the naming convention and its gate → migrate the remaining 135. **The twenty recorded assumptions are not owed for the triad agents now; they are owed for the nine, and for the 135 as they migrate.**

---

### §3 as originally written — retained for the record

## 3. Where the twenty triad agents live

**The problem, measured:** 20 agents declare a triad stage — 2 at `architecture-review`/`policy-review` in `storyAgents`, 18 at `guardrail-review` in `testAgents`. The canonical runner implements all three triad stages as existence checks that cannot decline (D-019). Separately, all 16 `reviewBoardAgents` declare `stage: 'reporting'` despite `governance.review.*` names, and `governance.final-certification` declares `reporting` rather than `certification` (D-020).

**RECOMMENDATION: the triad stages get agents; the review-board agents do NOT move.**

- **The 20 triad-stage agents are invoked by the triad STAGE CALLBACKS**, not by a domain. This is the one place agents attach to a stage rather than a domain, and the reason is structural: **stages 4–6 review what the domains produced, so an agent owned by a domain would be the producer reviewing itself** — the separation the triad exists to enforce.
- **Their findings drive `emit.refuse`.** The primitive exists and is proven (ADR-0071); this is its second production use, and the first where a refusal is a *judgement* rather than a fact about a tool.
- **The 16 `reviewBoardAgents` stay at `reporting`, where they declare.** Moving them into the triad would contradict their own declaration. **D-020 is NOT resolved by re-staging** — decide what `governance.final-certification` certifies that `executive-reporting` does not; if the answer is nothing, the honest outcome is that it is redundant and says so.

**This is the strongest argument for F1's ordering:** the triad cannot be given real reviewers until the agent layer exists, and it is the platform's highest-severity open finding.

## 4. How the 109 criteria become evidenced

**Today: 13 domains declare 109 criteria; 0 are carried on any result; nothing compares a declaration to behaviour** (D-015, C-3 red at `0/109`).

**RECOMMENDATION — three parts, and the third is what makes it real:**

1. **An agent declares which criteria it evidences** (`certificationContributions`), and returns `evidenced: true|false` with a reason.
2. **The domain carries its criteria's evidence on its result** — `DomainOutput` gains `criteriaEvidence: readonly { criterion, evidenced, by, reason }[]`.
3. **A domain whose declared criteria are not all evidenced returns `certified: false`.** Without this, criteria evidence is another produced-and-never-consumed field — **D-033's exact shape, in the mechanism built to fix D-015.**

**C-3 becomes the measurement rather than the finding.** It reads `criteriaEvidenced >= criteriaDeclared` today and reports `0/109`; the same property becomes a real gate the moment evidence exists.

**Not every criterion needs an agent.** Some are structural (`immutable-output`, `deterministic`) and are properties of the domain, evidenceable by the domain itself. **The split must be declared, not assumed** — a criterion evidenced by nobody is the current state with extra ceremony.

## 5. Naming convention, and its gate

**Observed:** `design-sync.discovery`, `governance.review.requirements`, `learning.execution-knowledge-mining`. The prefix is a domain or a concern; the suffix is a verb phrase. It is consistent and undocumented.

**RECOMMENDATION:** `<domain>.<agent>`, where `<domain>` is a member of `CANONICAL_DOMAIN_SEQUENCE` or `governance` for triad agents, and `<agent>` is a lowercase hyphenated verb phrase.

**The gate — and its fault proof:** every agent's `id` prefix resolves to a real domain; every agent's `domain` member matches its prefix; no two agents share an id. **All three fail on a fabricated agent**, which is the proof. WP5 (agent naming) is already sequenced and this is its content.

**A caution from this session:** the gate compares an id against a domain list — declaration against declaration. It cannot see whether the agent does what its name says. **That is D-007's axis and it is not closed by naming**; say so in the gate rather than let a green be read as more than it is.

## 6. What the nine imply for the other 135

**The nine are not special, and that is the finding.** Everything their placement needs — a domain to attach to, a way to report a failed write, criteria contributions, a stage that can refuse — is what all 144 need. **Design for nine and 135 arrive as migrations; design for the layer and the nine are its first test.**

Three things the nine specifically establish:

1. **`syncOrchestrator` does not survive.** The nine currently compose under it. Under §2 they compose under `synchronisation`'s `execute`, and the orchestrator is retirement scope — **the placement is what makes ADR-0061 §6 step 6 executable for them**, closing P-69.2's design-sync entry from `PENDING PLACEMENT`.
2. **`validation`'s shape becomes the layer's model.** It is the only agent designed for failure; the other eight were retrofitted in Section C. F's bar asks of each agent *what does this assume that is true only because something below it cannot yet fail?* — and **records the answer**, so the next honest layer has somewhere to be checked against.
3. **The scheduled contagion test arrives here.** The moment the nine sit on the canonical runtime, one run carries both `publicationStatus` and `SyncReport.status` — **the disagreement predicted and not yet testable.** It is a scheduled test, not a closed question, and F1 is where it fires.

## 7. Ruling requested

1. **Agent contract** — one member (`certificationContributions`) and one obligation (`AgentOutput`), or more?
2. **Composition** — agents behind a domain, invoked by its `execute`, with the three falsifiable rules? Is rule 3 (an agent cannot refuse the run) right?
3. **Triad** — agents attached to the three stage callbacks rather than to a domain, on the producer-never-judges argument?
4. **Criteria** — all three parts, including part 3 (a domain with unevidenced criteria returns `certified: false`)? Part 3 is the one that changes run outcomes.
5. **Sequence within F1** — I would build the layer, then the triad (highest severity), then the nine (proves it against real work), then criteria (needs agents to attach to). Placement third rather than first, deliberately.
