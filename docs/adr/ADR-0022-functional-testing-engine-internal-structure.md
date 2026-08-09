# ADR-0022 — The Functional Testing Engine's sub-engines are internal structure, not a second orchestration lifecycle

**Status:** ACCEPTED · **Date:** 2026-07-22
**Superseded in part by:** [ADR-0039](ADR-0039-functional-testing-capability-refounding.md) (ACCEPTED 2026-07-28) — the *"implementation is deferred"* posture (§4) and the internal-structure specifics are superseded by the domain-by-domain re-foundation. **The three constitutional findings of this ADR are retained unchanged and re-satisfied by that rebuild:** the governance triad (stages 4–6) must be implemented; Repository Intelligence is an Execution-Plane stage; adapters are the only locus of variation.

## 1. Problem

A brief specified a canonical **Functional Testing Engine** — one master orchestrator, ten domain orchestrators, 80–120 specialised agents, and an eighteen-stage workflow — and asked that it *replace* the existing Functional Testing capability throughout the solution.

Executed literally, that instruction cannot be carried out inside the certified architecture, for four separate reasons. This ADR records what was established, what was decided, and what remains to be built.

## 2. Context

**The capability is already named canonically.** [Document 11](../architecture/11-capability-model.md) §3 names it **Functional Testing Engine**. The four remaining occurrences of the short form "Functional Testing" are table cells where *all six* capabilities appear in short form ("Dev-Change", "Security Testing", "Penetration Testing"), plus one generated maturity row. There is no competing name and nothing to rename.

**There is no implementation to replace.** `IMPLEMENTATION_STATUS.md` records *Functional Testing Engine (reference) — NOT STARTED*, and no source file in any package references it. The six capability engines were never in P2 scope; they are recorded as **NOT IMPLEMENTED** in [KNOWN_LIMITATIONS.md](../../program/KNOWN_LIMITATIONS.md). What the brief describes would be the **first implementation of the first capability engine**, not a replacement.

**The specified workflow is a second orchestration lifecycle.** [Document 12](../architecture/12-capability-orchestration.md) defines twelve stages and states:

> **R-12.18** There is exactly **one** orchestration lifecycle for the platform. A capability may extend the framework internally; it SHALL NEVER redefine or bypass it.

> **R-12.1** Every capability traverses these stages, in this order. **There are no optional stages and no permitted bypass.**

The eighteen-stage workflow contains no Architecture Review, no Policy Review and no Guardrail Review — stages 4, 5 and 6, which R-12.2 designates the **governance triad** and which no capability may bypass. The brief also forbids duplicate orchestration in its own terms; implementing the workflow as a parallel lifecycle would violate that instruction as well as R-12.18.

**Agent stubs are architecturally unrepresentable.** Document 11 is unusually explicit:

> **R-11.12** Registration SHALL fail if any mandatory stage is absent.
> **R-11.15** An incomplete capability SHALL be **unrepresentable**, enforced at four independent levels.
> **R-11.16** No capability may be registered with a stage stubbed to a no-op.

And R-11.14 records why, naming the predecessor failure directly: a penetration-testing capability listed in a tier definition, exposed through an API, and shipped **with no runner on disk** — its dispatch wrapper logging the miss and returning a soft failure. Writing 80–120 agent files with no executed evidence would recreate that defect at roughly a hundred times the scale.

## 3. Alternatives

**Implement the eighteen-stage workflow as specified.** Rejected: it redefines the orchestration lifecycle (R-12.18), bypasses the governance triad (R-12.2), and duplicates orchestration — which the brief itself prohibits.

**Amend document 12 to accommodate the eighteen stages.** Rejected: the brief forbids modifying the architecture, the twelve-stage lifecycle is shared by all six capabilities, and changing it for one would either fracture the others or force five capabilities through stages that do not apply to them.

**Generate 80–120 agent stubs now, and fill them later.** Rejected on the architecture's own terms. R-11.15 and R-11.16 make a capability with stubbed stages impossible to register, and R-11.14 exists because the predecessor shipped exactly this.

**Rename the four short-form occurrences for consistency.** Rejected: each sits in a table where every capability uses its short form, so changing one would make the table internally inconsistent, and it would modify frozen documents and break the closure baseline for no gain.

**Record the mapping and defer implementation.** **Chosen.**

## 4. Decision

**The Functional Testing Engine's sub-engines, domain orchestrators and agents are INTERNAL structure of one capability. They map onto the twelve stages; they do not replace them.** R-12.18 permits precisely this — *"a capability may extend the framework internally"*.

The canonical mapping:

| Canonical sub-engine | Twelve-stage home | Plane |
|---|---|---|
| Story Intake · Story Intelligence · Requirement Intelligence · Risk Intelligence | **1 Planning** | IP |
| Repository Intelligence *(observing the customer repository)* | **2 Discovery** | **EP** |
| Context assembly, minimisation, scrubbing | **3 Context** | EP → IP |
| *(no canonical equivalent — see below)* | **4 Architecture Review** | IP |
| *(no canonical equivalent — see below)* | **5 Policy Review** | IP |
| *(no canonical equivalent — see below)* | **6 Guardrail Review** | IP |
| Test Intelligence · Decision Intelligence · Test Authoring · Planning Intelligence · Automation Intelligence · Automation Generation | **7 Execution Planning** | IP |
| Execution Intelligence | **8 Execution** | **EP** |
| Evidence capture — screenshots, video, HAR, trace, logs | **9 Evidence** | **EP** |
| Healing Intelligence · Defect Intelligence · Learning Intelligence | **10 Reflection** | IP |
| Governance & Certification | **11 Certification** | IP |
| Reporting Intelligence · Synchronization Intelligence *(adapters)* | **12 Reporting** | IP |

**The mapping exposes one substantive gap, and it is the most important finding of this analysis: the canonical workflow omits the governance triad entirely.** Stages 4, 5 and 6 have no counterpart among the eighteen. R-12.2 states that no capability may bypass them, and R-11.6 makes the same requirement from the capability side. **The Functional Testing Engine must implement all three**, and any future implementation that follows the eighteen-stage list literally would ship a capability that cannot be registered.

**Repository Intelligence is an Execution Plane stage.** The brief lists it under Intelligence Plane ownership. The customer repository lives in the Execution Plane and never leaves it ([06](../architecture/06-data-sovereignty.md), [19](../architecture/19-repository-ownership.md)); what crosses is scrubbed, minimised context. Reasoning *about* the repository is IP; *observing* it is EP. Implementing it as an IP stage would place customer source in the Intelligence Plane and break non-retention.

**Adapters remain the only locus of variation**, as the brief requires and as [document 14](../architecture/14-tool-operating-model.md) already specifies. Azure DevOps, Jira, Zephyr and test-management integrations are adapter implementations behind existing SPIs — not workflow branches, and not capability variants.

**Implementation is deferred**, with scope recorded rather than started. It is a phase of work, not a capability swap, and the programme is closed pending a container runtime.

## 5. Consequences

**The capability count is unchanged: six.** R-11.4 holds. Ten domain orchestrators and ~100 agents are internal to one capability and create no seventh.

**No architecture document changes.** Documents 11 and 12 already own capability structure and orchestration; this ADR adds no topic and creates no second source of truth about either.

**A future implementer inherits a resolved design rather than a contradiction.** Without this record, the eighteen-stage list would most likely be implemented as written — producing a parallel lifecycle that bypasses the governance triad, and a capability the registry would refuse.

**The gap is now visible rather than latent.** "The canonical workflow omits stages 4–6" is a sentence that had to be written down; it would not have survived as a shared assumption.

**A closure baseline must be re-taken.** This ADR is a new file in `docs/adr/`, which the closure baseline hashes. Re-baselining is deliberate and is the designed path — amending after closure is permitted, amending silently is not.

## 6. Migration strategy

Nothing migrates. There is no existing implementation, no data, no registry entry and no consumer.

When implementation begins, the sequence is fixed by the architecture rather than by preference:

1. Implement all twelve stages, including the governance triad, before any agent.
2. Register the capability only when every stage is implemented — R-11.12 makes partial registration impossible.
3. Add domain orchestrators and agents behind the stage boundaries, as internal structure.
4. Add adapters behind existing SPIs; never as workflow branches.
5. Verify the execution path before the capability is presentable to any customer (R-11.14).

## 7. Version impact

No contract version changes. No architecture document version changes. No ADR is superseded. ADR-0021 is untouched.

The closure baseline hash changes because `docs/adr/` gained a file. That is recorded, not incidental.

## 8. Affected components

`docs/adr/ADR-0022-functional-testing-engine-internal-structure.md` — **New**

`program/FUNCTIONAL_TESTING_ENGINE_IMPACT_ANALYSIS.md` — **New**

`governance/closure/baseline.json` — **Modified** (re-baselined deliberately)

`program/PROGRAMME_SUMMARY.md` · `program/ARCHITECTURE_BASELINE.md` · `program/FINAL_CERTIFICATION_REGISTER.md` · `program/GENERAL_AVAILABILITY_REGISTER.md` · `program/GOVERNANCE_BASELINE.md` · `program/KNOWN_LIMITATIONS.md` — **Modified** (regenerated from state)
