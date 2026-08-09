# 16 — Runtime Model

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.5
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 1, 2 and 3
**Resolves:** AD-015, AD-027

**This document owns:** the process model, composition, lifecycle, concurrency, and scheduling.
**It does not own:** internal plane structure ([03](03-intelligence-plane-architecture.md), [04](04-execution-plane-architecture.md)), deployment and images ([17](17-deployment-topology.md)), or the orchestration lifecycle ([12](12-capability-orchestration.md)).

---

## 1. Process model

**R-16.1** Exactly **two** deployable runtimes exist (R-1.1). Shared code is an in-process library that binds no listener and owns no lifecycle (R-1.3).

**R-16.2** A component that must never bind a listener SHALL NOT export the means to do so (R-1.5, R-03.5).

**R-16.3** Each runtime SHALL have exactly **one** process entry point.

**R-16.2 restated as a working rule:** do not export what must not be called. The predecessor satisfied its two-deployables rule only because nothing happened to call an exported start function — the capability existed and was one line from use. Conformance by accident is not conformance, and structural impossibility is the strongest available enforcement (C-0.1).

## 2. Composition

**R-16.4** Each runtime SHALL have exactly **one composition root** (R-03.1).

**R-16.5** Components are wired by **dependency injection**, through public interfaces only.

**R-16.6** No component SHALL construct another. Construction happens at the root.

**R-16.7** The composition root SHALL contain no domain, tool, customer, or capability logic.

**R-16.8** The dependency graph SHALL be **acyclic** and machine-inspectable.

**Why R-16.8 is stated as an architectural requirement.** A dependency graph that can be inspected is a graph that can be *asserted against* — layer direction (C-02.1), boundary integrity (C-19.1), and single-composition-root (C-03.1) all reduce to graph queries. Choosing a composition mechanism whose graph is only implicit would make several constitutional criteria unverifiable, which per C-0.4 would make them count as `NOT RUN`, and therefore `FAIL`.

## 3. Lifecycle

**R-16.9** Startup order SHALL be: configuration load and validate → composition → readiness. A runtime SHALL NOT accept work before readiness.

**R-16.10** Configuration validation failure SHALL prevent startup, unconditionally ([15](15-configuration-model.md) R-15.14/15).

**R-16.11** Constitutional boot guards SHALL execute at startup and SHALL refuse to start on violation — for example, inference capability detected in the Execution Plane (C-04.2).

**R-16.12** Shutdown SHALL be graceful: stop accepting work, drain in-flight work to a terminal or resumable state, flush evidence and the deferred queue, then exit.

**R-16.13** Shutdown SHALL NOT discard captured evidence or queued certifications.

**R-16.13 is a sovereignty obligation, not an operational nicety.** Evidence discarded at shutdown is evidence the customer paid to produce and can never reproduce — the system under test has moved on. The deferred certification queue has the same property: dropping it converts "judgment waits" into "judgment lost."

## 4. Concurrency — AD-015 resolved

**R-16.14** The Execution Plane SHALL support **thousands of concurrent executions** per tenancy.

**R-16.15** Concurrency limits SHALL be configuration, per tenant and per target, and SHALL be enforced ([15](15-configuration-model.md)).

**R-16.16** Every execution SHALL be **independently addressable and independently failable**. One failure SHALL NOT affect another.

**R-16.17** Work SHALL be scheduled **fairly** across capabilities and targets. A single large run SHALL NOT starve others.

**R-16.18** Concurrency against a customer system SHALL respect declared blast-radius limits, enforced at Guardrail Review ([12](12-capability-orchestration.md) stage 6).

**R-16.19** The Intelligence Plane SHALL be **stateless with respect to a run** (R-03.14) and therefore horizontally scalable without coordination.

**The scaling shapes differ by design.** The Intelligence Plane scales horizontally because it holds no run state. The Execution Plane scales **within a tenancy**, absorbing that customer's load on that customer's infrastructure — so one customer's thousands of concurrent executions cannot degrade another's. **The split delivers noisy-neighbour isolation as a structural side effect**, not as a feature requiring capacity management.

## 5. Timeouts and cancellation — AD-027 resolved

**R-16.20** Every stage SHALL declare a timeout. **There is no unbounded stage.**

**R-16.21** Every external invocation SHALL declare a timeout ([14](14-tool-operating-model.md) R-14.22).

**R-16.22** Timeout is **unavailability**, not refusal: it degrades ([05](05-cross-plane-communication.md) §3).

**R-16.23** Cancellation SHALL propagate to in-flight external work. A cancelled run SHALL NOT leave orphaned tool processes or browser sessions.

**R-16.24** A cancelled or timed-out run SHALL **retain the evidence captured up to that point**, marked as partial.

**R-16.25** A partial result SHALL carry its assurance state structurally and SHALL NOT be presentable as certified (R-10.3).

**R-16.24 preserves an important distinction.** A timed-out run that discards its evidence is indistinguishable from a run that never happened. Retaining partial evidence, explicitly marked, preserves the difference between *"we do not know"* and *"nothing was observed"* — the same distinction as C-10.10 and R-12.12, appearing here in its lifecycle form.

## 6. Failure isolation

**R-16.26** A capability failure SHALL NOT terminate the runtime.

**R-16.27** An adapter failure SHALL NOT propagate beyond its invoking stage.

**R-16.28** A tenant's failure SHALL NOT affect another tenant (Intelligence Plane).

**R-16.29** Unhandled failure SHALL be recorded and surfaced, never silently swallowed (R-14.21).

## 7. Observability

**R-16.30** Every run SHALL be traceable end to end by correlation identity, across both planes.

**R-16.31** Trace context SHALL propagate across the plane boundary without carrying customer data ([09](09-data-flow-model.md)).

**R-16.32** Every stage transition SHALL emit a structured event carrying capability, stage, tenant scope, and assurance state.

**R-16.33** Conformance state SHALL be derivable from emitted telemetry, without an audit ([18](18-governance-model.md)).

**R-16.34** Telemetry SHALL NOT contain C1 or C2 data ([07](07-tenant-isolation.md) dimension 7).

**R-16.33 is the observability expression of a governance rule.** If determining whether the platform is conformant requires someone to conduct an audit, then between audits its conformance state is unknown — which is the condition the predecessor was in for the entire period during which 76 violations accumulated.

## 8. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-16.1** | Exactly one process entry point per runtime | Entry-point inventory gate |
| **C-16.2** | No listener-binding capability is exported where binding is prohibited | Export-surface gate |
| **C-16.3** | Exactly one composition root per runtime; no component constructs another | Composition gate |
| **C-16.4** | The dependency graph is acyclic and machine-inspectable | Graph gate |
| **C-16.5** | A runtime accepts no work before readiness | Pre-readiness request test |
| **C-16.6** | Invalid configuration prevents startup, unconditionally | Invalid-config boot test in-container |
| **C-16.7** | Constitutional boot guards refuse to start on violation | Guard fault-injection test |
| **C-16.8** | Shutdown drains work and flushes evidence and the deferred queue | Shutdown-under-load test |
| **C-16.9** | No evidence or queued certification is lost on shutdown | Kill-and-restart durability test |
| **C-16.10** | Thousands of concurrent executions are sustained per tenancy | Load test at declared target |
| **C-16.11** | One execution's failure does not affect another | Fault-injection under concurrency |
| **C-16.12** | Scheduling is fair; a large run does not starve others | Starvation test |
| **C-16.13** | Every stage and external invocation declares a timeout | Registry and adapter inspection |
| **C-16.14** | Timeout degrades rather than aborts | Timeout fault-injection |
| **C-16.15** | Cancellation leaves no orphaned tool or browser process | Process-inventory test after cancellation |
| **C-16.16** | A cancelled run retains partial evidence, marked partial | Cancellation evidence test |
| **C-16.17** | A partial result cannot be presented as certified | Certification interface rejection test |
| **C-16.18** | Every run is traceable end to end across both planes | Trace continuity test |
| **C-16.19** | Telemetry contains no C1 or C2 data | Telemetry content scan |
| **C-16.20** | Conformance state is derivable from telemetry without an audit | Telemetry-to-conformance reconciliation |

**C-16.15 is easy to omit and expensive to omit.** Orphaned browser and tool processes accumulate silently inside the customer's own infrastructure, and the first symptom is usually resource exhaustion attributed to something else entirely.

## 9. Open items

| # | Item | Target |
|---|---|---|
| **AD-032** | Whether an in-flight run survives an Execution Plane restart, or restarts from its package | P2 |

**AD-032 is a real design fork.** Resumability requires durable stage checkpointing with all the isolation and retention obligations that implies; restart-from-package is simpler but repeats work against customer systems — which for a penetration or load capability is not merely wasteful but potentially harmful. The answer may legitimately differ per capability, which is exactly why it needs deciding rather than defaulting.
