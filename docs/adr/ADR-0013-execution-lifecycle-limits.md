# ADR-0013 — Concurrency, Timeout and Cancellation

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-015, AD-027

---

## 1. Problem

How much concurrent execution must a tenancy sustain, and what happens when work exceeds its time budget or is cancelled? AD-015 asked about scale; AD-027 asked about bounds. They govern the same execution lifecycle and are recorded as one decision.

## 2. Context

- Target scale is **thousands of concurrent executions per tenancy**, across hundreds of customers.
- Execution touches customer production-adjacent systems, so blast radius is a safety concern, not only a performance one.
- Unbounded work is the classic route to resource exhaustion inside a customer's own infrastructure.
- Timeout must not be confused with refusal ([05](../architecture/05-cross-plane-communication.md) §3) — they demand opposite responses.
- Evidence is expensive to produce and impossible to reproduce once the system under test moves on.

## 3. Alternatives

| Question | Options | Selected |
|---|---|---|
| Where concurrency scales | Centrally in DBiz · **within each tenancy** | Within the tenancy — one customer's load then cannot degrade another's |
| Concurrency limits | Global · **per tenant and per target, configured** | Per tenant and target, since the constraint is usually the system under test, not the runner |
| Timeout scope | Per run · **per stage and per external invocation** | Per stage and invocation — a per-run timeout cannot attribute the overrun |
| Timeout classification | Refusal · **unavailability** | Unavailability — it is an outage of progress, not a decision |
| Evidence on cancellation | Discard · **retain, marked partial** | Retain |

## 4. Decision

**Concurrency.** Thousands of concurrent executions per tenancy (R-16.14); limits are configuration per tenant and per target (R-16.15); every execution is independently addressable and independently failable (R-16.16); scheduling is fair, so one large run cannot starve others (R-16.17); concurrency against customer systems respects blast-radius limits enforced at Guardrail Review (R-16.18).

**Timeouts.** Every stage declares one — **there is no unbounded stage** (R-16.20). Every external invocation declares one (R-14.22). Timeout is **unavailability** and degrades (R-16.22).

**Cancellation.** Propagates to in-flight external work, leaving **no orphaned tool processes or browser sessions** (R-16.23). A cancelled or timed-out run **retains evidence captured to that point, marked partial** (R-16.24), and a partial result carries its assurance state and cannot be presented as certified (R-16.25).

**Retaining partial evidence preserves a distinction that would otherwise be lost.** A timed-out run that discards its evidence is indistinguishable from a run that never happened — the same failure as an unrecorded capture failure (R-10.10) or a silently empty stage (R-12.12), appearing here in its lifecycle form.

## 5. Consequences

**Positive.** Noisy-neighbour isolation is structural rather than managed; no execution can run unbounded; a cancelled run still yields usable evidence; orphaned browser and tool processes — which accumulate silently inside customer infrastructure and surface as unexplained resource exhaustion — are prevented explicitly.

**Negative, accepted.** Per-stage timeouts must be tuned per capability, and a badly-tuned timeout degrades work that would have completed. Accepted because the alternative is unbounded execution, whose failure mode is worse and harder to attribute. Cancellation propagation adds real complexity to every adapter, which is why it is an interface obligation (C-14.7) rather than best-effort.

## 6. Migration strategy

None required — taken before implementation.

**Forward path.** Concurrency and timeout values are configuration, so changes take effect without deployment, within the narrowing-only bounds of [ADR-0009](ADR-0009-configuration-precedence.md) — a tenant may lower a limit, never raise it past the platform ceiling. Raising a platform ceiling requires impact analysis, since it changes blast radius for every tenant.

**Constraint.** Adding a stage adds a timeout declaration in the same change; a stage without one fails registration.

## 7. Version impact

No contract version change. Execution directives in the package already carry timeout and concurrency parameters ([20](../architecture/20-cross-plane-contracts.md) §2.1), so this decision fixes their semantics rather than the shape.

Partial results were already representable through the assurance state (R-10.3), so cancellation semantics require no contract change — which is a consequence of assurance state having been made structural from the outset.

## 8. Affected components

[16](../architecture/16-runtime-model.md) §§4–5 (owning document) · [14](../architecture/14-tool-operating-model.md) (adapter timeouts and cancellation) · [12](../architecture/12-capability-orchestration.md) (per-stage timeouts; guardrail blast radius) · [05](../architecture/05-cross-plane-communication.md) (timeout classified as unavailability) · [10](../architecture/10-evidence-flow-model.md) (partial evidence) · both planes' schedulers.
