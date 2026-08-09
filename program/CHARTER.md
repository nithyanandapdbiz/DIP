# Implementation Charter

**Programme:** DBiz Agentic QA Platform — Enterprise Re-Foundation
**Scope:** how the engineering organisation operates. **Not architecture.**

Architecture is the single source of truth and lives in [`../docs/architecture/`](../docs/architecture/). This charter references it and never restates it.

---

## 1. Two repositories, and no third

| Repository | Owner | Holds |
|---|---|---|
| `DBiz_IntelligencePlane` | DBiz | Canonical architecture, governance, certification, capability registry, workflow definitions, tenant lifecycle, AI runtime, platform APIs, shared contracts — **and this programme's operational memory** |
| `CarlisleHomes_ExecutionPlane` | Customer | Execution runtime, tool adapters, credentials, customer configuration, customer data, execution evidence |

Authoritative ownership is defined in [`19-repository-ownership.md`](../docs/architecture/19-repository-ownership.md). Where this table and that document differ, **the architecture governs**.

**Why programme state lives here.** It is DBiz's internal operational record — risks, debt, backlog, decisions. Placing it in the customer-owned repository would leak DBiz operational posture across the sovereignty boundary. Placing it outside both repositories would leave it unversioned, which is the defect this programme exists to avoid.

## 2. Read order

Chat history is not memory. These are:

| # | File | Answers |
|---|---|---|
| 1 | `program/CHARTER.md` (this file) | How the organisation operates |
| 2 | `program/PROJECT_STATE.md` | Where work actually stands |
| 3 | `program/NEXT_ACTION.md` | The single next action |
| 4 | `program/IMPLEMENTATION_STATUS.md` | What is built, per component |
| 5 | `program/ARCHITECTURE_STATUS.md` | Which architecture documents exist, and their status |
| 6 | `program/MASTER_IMPLEMENTATION_PLAN.md` | Phase and milestone structure |
| 7 | `program/MASTER_ROADMAP.md` | Sequence and dependencies |
| 8 | `program/DECISIONS.md` | Programme decisions and the ADR index |
| 9 | `program/RISKS.md` | Live risk register |
| 10 | `program/TECHNICAL_DEBT.md` | Debt register (target: empty) |
| 11 | `program/BACKLOG.md` | Work not yet scheduled |
| 12 | `program/SESSION_LOG.md` | Session-by-session record |

Then read the canonical architecture, beginning with [`01-platform-constitution.md`](../docs/architecture/01-platform-constitution.md).

## 3. Reality first

Establish repository reality before implementing. **Never assume — inspect, validate, document.**

**Where an instruction conflicts with the repository, the repository is the source of truth.** State the conflict, propose the enterprise-safe resolution, and continue. Never resolve a conflict by creating a second source of truth.

## 4. No duplication

One topic, one document. Architecture, standards, governance, contracts, and certification each have exactly one canonical home. If information exists in the canonical architecture, **reference it** — never copy it.

A second copy is not redundancy; it is a guarantee of divergence, and the reader has no way to tell which is current.

## 5. Build order — never inverted

```
Architecture → Governance → Policies → Contracts → Configuration
             → Runtime → Capabilities → Execution
```

Architecture precedes everything. Governance precedes policy. Contracts precede runtime. Configuration precedes orchestration. **Execution is the final consumer.**

**Runtime SHALL NOT precede contracts. Contracts SHALL NOT precede governance.**

If a prerequisite is missing, it is created first.

## 5a. Platform standards

Closed by [ADR-0001](../docs/adr/ADR-0001-platform-language-and-runtime.md), amended by [ADR-0017](../docs/adr/ADR-0017-runtime-baseline-node-24.md): **TypeScript** (strict) on **Node.js 24 LTS**, **pnpm** workspaces, **NestJS**, contracts as **JSON / JSON Schema** with **Zod** validation, dependency injection mandatory.

Compile-time validation is now available as a constitutional enforcement mechanism — but TypeScript's guarantees are erased at runtime, so **it never counts as the sole mechanism** for a constitutional rule. Every boundary validates at runtime as well.

## 6. Enforcement

Every constitutional rule is enforced by multiple independent mechanisms — minimum: architecture validation, schema validation, compile-time validation, runtime validation, integration validation, CI validation, certification validation, observability validation.

**No rule may rely solely on documentation.** The enforcement hierarchy, the ≥3-mechanism requirement, the `NOT RUN` ≡ `FAIL` rule, and the fault-injection requirement are constitutional — see [`01-platform-constitution.md`](../docs/architecture/01-platform-constitution.md) §3.

## 7. Capability model

Six capabilities, one orchestration lifecycle, no bypass of any stage. Defined in [`11-capability-model.md`](../docs/architecture/11-capability-model.md) and [`12-capability-orchestration.md`](../docs/architecture/12-capability-orchestration.md).

## 8. Data security — required before any capability is implemented

Every capability SHALL explicitly define: data owner · classification · location · storage policy · encryption · retention · deletion · cross-plane rules · access control · audit trail · evidence integrity · customer sovereignty · least privilege.

**Functionality is never implemented before these definitions exist.** The governing models are [`06-data-sovereignty.md`](../docs/architecture/06-data-sovereignty.md), [`07-tenant-isolation.md`](../docs/architecture/07-tenant-isolation.md), and [`08-security-model.md`](../docs/architecture/08-security-model.md).

## 9. Review pipeline

Every milestone passes: Developer → Architecture → Security → Governance → Performance → Documentation → Certification → Accept.

A failed review is **refactored immediately**, not deferred. Then continue.

## 10. Technical debt

Never postponed. After every milestone, scan for architecture drift, duplicate code, security weaknesses, configuration drift, governance gaps, performance bottlenecks, and maintainability issues. **Refactor immediately, then continue.**

## 11. Architecture Decision Records

Every significant architectural decision generates an ADR in [`../docs/adr/`](../docs/adr/), containing: problem · context · alternatives · decision · consequences · future impact · affected components · migration strategy.

## 12. Autonomous execution

```
Determine program → phase → milestone → task
  → implement → review → validate → refactor → document
  → update project state → determine next task → continue
```

Do not ask what to implement next. Determine it from programme state.

## 13. Stop conditions

Stop **only** for a genuine external dependency: missing infrastructure, missing credentials, missing third-party service, operating-system limitation, or tool installation failure.

When stopping, record the **blocker, impact, recommended resolution, and next action** in `PROJECT_STATE.md`. Otherwise continue.

## 14. Definition of done

A milestone is complete only when architecture, implementation, tests, documentation, security, governance, and performance criteria are all satisfied **and** programme state is updated. If any criterion fails, the milestone is not done.

## 15. Engineering standard

This is a commercial enterprise product intended to serve hundreds of enterprise customers over a decade, across multiple clouds, AI providers, and execution tools, with thousands of concurrent executions, versioned contracts, and backward compatibility.

**Architecture is never compromised for speed.**

## 16. The legacy platform is reference only

`C:\POC\DBIZIPEP` is a **read-only knowledge base**. Read it for lessons learned; never write to it, never copy from it, never treat its baseline as canonical here. Where a legacy conclusion is sound, it is re-derived and re-justified — importing an answer imports its assumptions.

---

## 17. Standing engineering principles

Adopted 2026-07-22 as permanent principles. Classification and ownership are ruled by [ADR-0018](../docs/adr/ADR-0018-platform-services-and-programme-instruments.md).

| # | Principle | Where it lives |
|---|---|---|
| 1 | **Platform Maturity Model** — five levels, assessed continuously | `program/PLATFORM_MATURITY.md` — **generated** |
| 2 | **Engineering Scorecard** — measured after every milestone, regressions never ignored | `program/ENGINEERING_SCORECARD.md` — **generated** |
| 3 | **Customer Success Readiness** — every production release ships a Customer Success Package | Document 25 |
| 4 | **Extensibility** — capabilities, providers, tools, targets added without touching core | Documents 11, 12, 13, 14 (frozen) |
| 5 | **Operational Excellence** — SLOs, error budgets, incident and problem management, HA/DR | Document 23 |
| 6 | **Platform Self-Assessment** — autonomous review after every milestone | This charter §9–10 + generated reports |
| 7 | **Platform Intelligence** — engineering, operational, customer, AI and executive analytics | Document 24 |
| 8 | **Engineering Dashboard** — the operational cockpit | Document 24 |
| 9 | **Commercial Product Engineering** — the twelve questions below | This section |
| 10 | **Innovation Framework** — adopt only after full review | This charter §9 |
| 11 | **Sustainability** — ten-year operational life; avoid redesign | Documents 19, 20 (versioning) |
| 12 | **World-class standard** — every release improves the platform | This section |

### 17.1 Three rules that make the rest real

**Maturity and scorecard reports SHALL be machine-generated.** A hand-authored scorecard asserting compliance is the declared-but-unbuilt failure class exactly: it manufactures confidence rather than measuring it, and it is *more* dangerous than no scorecard because it is persuasive.

**A metric with no executing measurement reports `NOT MEASURED`, and `NOT MEASURED` is never a pass** — the measurement analogue of `NOT RUN` ≡ `FAIL` (C-0.4). A maturity level is derived from evidence, never asserted.

#### 17.1.1 The subject-removal test — before anything is removed, and before any gate is trusted

> **Of every property a control asserts, ask: if its SUBJECT were removed, would this property turn RED or GREEN?**
>
> **A property that turns GREEN when its subject is removed is not detecting anything.** It is satisfied *by* the absence, so its pass carries no information about the thing it was written to watch. Run the question before the removal, not after: it costs a reading and it is the only cheap way to tell a control from a control-shaped literal.

**This rule is here because it was learned by an irreversible operation** (debt **D-103**). `verify-canonical-agent-dormancy` **passed** after ADR-0061 §6 step 6 deleted the runtime it watched — all four of its properties were satisfied *more easily* by the absence: *only `agents/design-sync.ts` is reachable* held because it was the only agent module left; *no `AgentCatalogue` on the canonical surface* held because `catalogue.ts` had been deleted. **And its verdict line printed *"135 agents remain dormant"* from a string literal on the PASS branch**, in a tree containing nine agents and zero dormant ones. The number had been correct on the day it was typed and became false without anything observable changing.

**Two obligations follow, and they are separable:**

**(i) A gate's PASS-branch output is a declaration like any other and SHALL be derived, never authored.** Every count, ratio or population in a verdict line is computed from what the run observed, or it is not printed. A numeric literal inside a `RESULT: PASS` string is a finding.

**(ii) A control whose properties would survive the removal of its subject SHALL be retired with its subject, and its retirement stated** — not left in the runner going green. This is C-0.4's shape one level up: `NOT MEASURED` is never a pass, and *measuring nothing* is a way of not measuring.

**It generalises past deletion.** Any census, count or population a control reports is asked the same question — *does this number move when the thing it counts moves?* A dimension that takes one value across every input the harness can construct is a constant wearing a measurement's clothes, whatever produced it. Applied at [`PART_4_CENSUS_DESIGN_REPORT.md`](PART_4_CENSUS_DESIGN_REPORT.md) §1, it retired four census dimensions that reported the same figure on every run.

#### 17.1.2 The scope question — asked one step earlier than §17.1.1, and about the same blindness

> **A CONTROL THAT HAS ONLY EVER BEEN SHOWN ITS OWN SUBJECT CANNOT TELL YOU WHAT ITS SUBJECT IS.**
>
> Before trusting a control's SCOPE, ask: *has it ever run against something it was not written for?* If every input it has ever seen was the thing it was authored against, **every run it has ever had confirmed it**, and its passes carry no information about where its authority ends.

**§17.1.1 asks what happens when the subject is removed. This asks what the subject was in the first place**, and it is the earlier question because a control whose scope is misread will be defended, extended and reasoned from long before anything is deleted.

**It is here because it was learned by a withdrawn ruling** (ADR-0049 M5, [`M5_CUTOVER_PRECONDITION_REPORT.md`](M5_CUTOVER_PRECONDITION_REPORT.md)). `verify-package-governance` §13 asserted that *the sealing point* was wired to the four-level contract gate, and a recommended cut-over sequence was built on that reading: wire the gate into the canonical path first, so that nothing goes green over an absence. **The gate had never once been run against a canonical package.** Its only caller was `ip-execute-gateway.mjs`, whose package FORMAT it was written for. Run against the canonical package for the first time, it returned **18 blocking findings — every one a field existing only in the retiring format** — against an artefact that satisfies the published contract.

> **The gate's subject was the gateway's format, not the sealing point. Wiring it into the canonical path would have turned it RED over the CORRECT artefact — the opposite of what the sequence was chosen to prevent.**

**The recommendation was reasoned correctly from what was known.** What was missing was a measurement nobody had a reason to take, because the control had never been pointed anywhere it might disagree. **A single run against a non-subject would have settled it, and is cheaper than every argument that was had instead.**

#### 17.1.3 A justification written in the PRESENT TENSE expires when its subject is removed

> **A comment that justifies a rule by naming a live offender — *"the wrong second rule IS ALREADY in the tree"* — becomes FALSE the moment that offender is deleted. The rule it justifies then looks expired with it.**
>
> **Write the justification in the PAST TENSE: why the rule exists, not something still there to avoid.**

**This is the §17.1.1 shape applied to PROSE rather than to properties**, and it is worse in one specific way: a property that survives its subject's removal goes green and is at least still running, whereas a falsified justification is read by a human who then has to decide whether the rule is stale. **It fails toward removing a control that is still needed.**

**Learned at ADR-0049 M5's deletion**, which falsified **three** assertions in one change — including the stated ground for **two fail-closed tenant resolvers**: *"the WRONG second rule is already in the tree: `knownTenant` returns the first `readdirSync` match."* True when written, false the moment the gateway went, **and the requirement it defends — that binding a package to whichever tenant sorts first is a cross-tenant write (C-07.11) — was never affected at all.** Five references were enumerated across `.ts`, `.mjs` and regex literals; three were of this class.

**The enumeration is the obligation, not the rewrite.** A deletion enumerates every reference to its subject **including comments, `.mjs` sources and regex literals**, and each is classified: *dangling path*, *expired justification*, or *historical record already in the past tense*. Only the first two need work.

#### 17.1.4 A measurement without its environment recorded is a measurement OF the environment

> **A FIGURE THAT DOES NOT CARRY THE CONDITIONS IT WAS TAKEN UNDER DOES NOT SAY WHAT IT APPEARS TO SAY.**
>
> Before treating any measurement as a property of the SUBJECT, ask: *what else was true when this was taken, and is any of it recorded beside the number?* Whatever is not recorded is free to be the actual cause, and the reading will attribute it to the subject instead.

**§17.1.1 asks what happens when the subject is removed; §17.1.2 asks what the subject was. This asks what ELSE was in the frame** — and it is the one that turns a correct measurement into a wrong conclusion, because nothing about the figure looks wrong.

**Learned 2026-08-06 at `platform-runtime`.** The package was carried for many turns, across sessions and into programme state, as **`0/59, spawnSync openssl ENOENT`** — read as a CHARTER §13 external dependency, a missing tool, and therefore **nobody's work and nothing to do**. Re-run, it is **58/58 PASS**. Nothing about the package changed. **The shell did:** `openssl` resolves at `/mingw64/bin/openssl` (3.5.5) under Git Bash and does not resolve from PowerShell, and **the shell that produced the figure was never recorded beside it.**

> **SO IT IS NOT A §13 EXTERNAL DEPENDENCY AND NEVER WAS. IT IS A HARNESS DEFECT, IT IS FIXABLE, AND THE §13 CLASSIFICATION IS WHAT MADE IT LOOK LIKE NEITHER.** A blocker attributed to the outside world is a blocker no one is assigned; that is the cost of the missing field, and it is paid every time the figure is re-read.

**The failure is one-directional and that is why it persists.** An unrecorded environment cannot make a passing thing look broken *and be noticed* — a red result is attributed to the subject, filed, and stops being questioned, while the environment that actually caused it is never in the record to be doubted. **A red with no environment beside it is a hypothesis, not a finding.**

**This is [`D-008`](TECHNICAL_DEBT.md)'s rule generalised past the tree.** D-008 requires a commit-ish beside every published measurement, because a concurrently-changing tree confounds two honest readings. **The tree is one environment variable among several** — shell and `PATH` are others, and the ones here were decisive. **What a measurement must carry is not "the commit"; it is everything that could have produced it.** Recorded as [`D-138`](TECHNICAL_DEBT.md).

### 17.2 The twelve questions

Every implementation decision answers these. **If any answer is NO, the design is reviewed before implementation continues.**

Can this scale to hundreds of enterprise customers? · Can it evolve without breaking compatibility? · Is it secure by default? · Observable? · Governable? · Maintainable? · Extensible? · Operationally supportable? · Commercially sustainable? · Does it reduce customer effort? · Does it reduce operational risk? · Does it improve long-term product value?

### 17.3 What these principles do not change

**They add no capability.** The platform has exactly six (R-11.4). Platform Intelligence, Operational Excellence and Customer Success are **platform services** — they perform no quality engineering against a customer system and yield no certified verdict, so under R-11.1 they are not capabilities. ADR-0018 records this because "Platform Intelligence capability" is natural phrasing that would, unexamined, have produced a seventh.

## 18. Evidence over assertion (Rule 13, Constitution v1.2)

Added by [ADR-0019](../docs/adr/ADR-0019-evidence-over-assertion.md). Constitutional, not a practice — the enforcement hierarchy rates prose at zero, and a principle applied by habit is prose.

| Obligation | Rule |
|---|---|
| Every emitted measurement derives from objective evidence; no hand-authored status values | R-13.1 |
| Every measurement carries an evidence envelope: source, time, method, confidence, traceability, validation | R-13.2 |
| Uncollectable evidence reports `NOT MEASURED`; it is never a pass, never aggregated as one | R-13.3 |
| Every gate demonstrates positive and negative detection, recorded **machine-readably** | R-13.4 |
| Governance measures its own trustworthiness via the **GCI**, never assigned | R-13.5 |
| Platform Intelligence consumes evidence; it never manufactures it | R-13.6 |
| Every property, gate and instrument that can report a pass demonstrates a run in which it **FAILS**, before its pass is relied upon; and every such demonstration faults the **source of truth** and shows the **specific branch under test** executing | R-13.7 |

**Clause 1 — a property that cannot fail is indistinguishable from one that passes.** Green is the outcome the author expects, so it is the least interrogated: a property is written by someone who has just convinced themselves the thing is true, and the natural expression of that conviction is an assertion that holds — a tautology holds hardest. The obligation is therefore mechanical rather than diligent. **A new property lands with a recorded run in which it fails**, and a property whose failing run cannot be produced is reported as unreachable rather than counted as satisfied — the `NOT MEASURED` rule (§17.1) applied to properties instead of metrics. This extends R-13.4 past gates to every construct that can emit a verdict.

**Clause 2 — a demonstration is only evidence of what it actually faulted, and of what actually ran.** A proof that corrupts an artefact **downstream** of the source of truth shows the check reacting to a corruption it would never encounter in the field: the fault must be injected where the truth is produced, not where a copy of it is read. And a proof must show **the branch under test executing** — a fault that trips a different branch of the same property reports as a successful proof of a branch that never ran, so the proof records which branch fired and fails if it is not the intended one. Both halves are failures of *aim* rather than of rigour, and neither is visible in the pass/fail result they produce.

**Adopted 2026-08-04, with one of its three mechanisms in force and two sequenced** (`PROJECT_STATE.md` §9.7), on the ADR-0030/ADR-0031 precedent of landing a decision with its enforcement explicitly sequenced and the gap named. In force: fault injection at authoring time, with the FAIL output and the branch it fired recorded in the change. Sequenced: extending `record-fault-proofs.js` from gates to scenario properties, and a gate over the scenarios themselves.

**A circularity this rule cannot yet escape, stated rather than legislated around.** Under `TECHNICAL_DEBT.md` D-009, a gate already red cannot record a fault proof, because the clean leg of a *clean → faulted → clean* triple cannot be established. The four fault probes that motivated clause 2 sit behind a red gate and are therefore recorded in prose, which is weaker than a machine-readable proof and is stated as such. **Narrowing the rule to what is currently enforceable would be the shape the rule legislates against** — a property scoped until it cannot fail.

**The instance that shows clause 2 is not redundant with R-13.4.** `governance/verification/verify-customer-readiness.js:157` compares `manifest.contentHash` with `ev.packageContentHash` — both fields of the **same emitted artefact**, recomputing nothing from source. It is a registered gate, counted among the passing, and carries a recorded fault proof that faults the artefact both operands read from. It is fully compliant with R-13.4 and cannot fail on the thing it appears to check. **R-13.4 asks whether a proof exists; clause 2 asks whether it touched anything real.**

**ERI and GCI are read together.** ERI answers *"is the platform ready?"*; GCI answers *"can the system that told you so be trusted?"* A high ERI produced by an untrustworthy governance system is worse than a low one, because it is confidently wrong.

**Working commands.**

```sh
node governance/verification/run-all.js              # 6 gating checks
node governance/verification/record-fault-proofs.js  # re-run and record proofs
node governance/verification/generate-scorecard.js   # scorecard, maturity, GCI
```

A new gate is added **together with its recorded proof**, in the same change. A new metric is added together with its evidence envelope.

## 19. Continuous verification (Rule 14, Constitution v1.3)

Added by [ADR-0020](../docs/adr/ADR-0020-continuous-verification.md). **Trust expires.**

| Obligation | Rule |
|---|---|
| Every proof, certification, compatibility claim and readiness assessment is periodically revalidated | R-14.1 |
| Proofs are **regenerated, never copied**, and replay deterministically | R-14.2 |
| A proof that fails to replay invalidates the confidence it contributed | R-14.3 |
| Every piece of evidence carries immutable provenance binding it to its origin | R-14.4 |
| Confidence **decays with evidence age** and reports NOT CURRENT on expiry | R-14.5 |
| Score, coverage and freshness are **always published together** | R-14.6 |

**The GCI will fall when nobody runs the suite.** That looks like a regression caused by inactivity, and it is correct: confidence in an unverified system genuinely is lower, and a number that only ever rises is not measuring anything.

Working commands: `run-all.js` (8 gating checks) · `record-fault-proofs.js` (regenerate, never copy) · `generate-scorecard.js` (ERI, GCI, maturity, KPIs) · `packages/contracts/compat/harness.mjs` (compatibility evidence).

## 20. Three confidence indices

Published together, never in isolation (R-14.6). Each answers a different question, and none substitutes for another.

| Index | Question | Fails when |
|---|---|---|
| **ERI** — Enterprise Readiness | *Is the platform ready?* | Capability is missing or unmeasured |
| **GCI** — Governance Confidence | *Can the system that told you so be trusted?* | Gates are unproven, stale, or absent |
| **RCI** — Release Confidence | *Can this build be shipped?* | Tests, compatibility, supply chain or reproducibility fail |

A platform can be architecturally ready with trustworthy governance and still produce a build that must not ship — because a dependency carries an advisory, the output is irreproducible, or it cannot be deployed. **RCI is the metric that would say so**, and it is why three indices exist rather than one.

Every index publishes **score, coverage and freshness**. An unmeasured input is excluded from the average and reported — never counted as satisfied, and never counted against the score either.
