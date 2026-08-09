# ADR-0017 — Runtime Baseline: Node.js 24 LTS

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Amends:** [ADR-0001](ADR-0001-platform-language-and-runtime.md) §4
**Raised by:** implementation reality at P2/M2.1

---

## 1. Problem

[ADR-0001](ADR-0001-platform-language-and-runtime.md) fixes the runtime as **Node.js 22 LTS**. The engineering environment provides **Node.js 24.14.1**, and Node 24 is now an active LTS line.

Implementation may not silently adapt to contradict certified architecture. Either the environment changes, or the architecture changes through change control. This ADR does the latter.

## 2. Context

- ADR-0001 §7 already carries a forward obligation: *"The platform SHALL track Node LTS releases, and a runtime upgrade is a **minor** platform version that SHALL NOT require customers to change contract versions."* **This change is anticipated by the decision it amends** — only the specific version in the decision table is stale.
- Node 22 LTS reaches end of support in 2027; Node 24 LTS extends that horizon materially, which matters for a platform with a ten-year intent.
- The Execution Plane is built and run by **customers**. A runtime baseline they cannot obtain, or that reaches end-of-life during their deployment cycle, is a real adoption cost.
- Runtime and contract lifecycles are **decoupled** by ADR-0001 §7, so this changes no contract.
- Nothing has been implemented against Node 22. The cost of this change is currently zero and rises with every file written.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Install Node 22 and keep the architecture unchanged** | Honours the letter of ADR-0001. **Rejected**: it pins the platform to a runtime whose support window is shorter, for no benefit, and would need this same ADR within a year. |
| **Use Node 24, leave ADR-0001 stating 22** | **Rejected outright.** This is exactly the silent adaptation the change-control process exists to prevent, and it would make the architecture inaccurate on its first contact with implementation. |
| **Amend to Node 24 LTS** | **Selected.** |
| **State "current Node LTS" with no version** | Superficially future-proof. **Rejected**: an unversioned baseline is unverifiable — no gate can assert conformance to "current", and per the enforcement hierarchy an unverifiable rule has no enforcement value. |

## 4. Decision

The runtime baseline is **Node.js 24 LTS**. ADR-0001 §4 is amended accordingly; every other element of ADR-0001 — TypeScript strict, pnpm, pnpm workspaces, NestJS, JSON Schema contracts, Zod, mandatory dependency injection — is **unchanged**.

**The rejection of "current LTS" is the substantive part of this decision.** A baseline exists to be checked. A version number can be asserted by a gate; a moving reference cannot, and per C-0.4 a criterion that cannot run counts as `NOT RUN`, therefore `FAIL`. Future LTS transitions each take an ADR — which is the intended friction, not an oversight.

## 5. Consequences

**Positive.** Support horizon extends by roughly two years; the baseline matches what engineering actually runs, so conformance is verifiable today rather than aspirational; no contract, capability or governance artefact changes.

**Negative, accepted.** Node 24 is a newer line, so some ecosystem packages may lag — mitigated by a deliberately small dependency surface. Each future LTS transition requires an ADR; accepted as the cost of a checkable baseline.

**Precedent set, and stated deliberately.** This is the first amendment raised by implementation contact. It is recorded here as evidence that the process works in the direction intended: **implementation revealed a stale fact, and the architecture changed through change control rather than the implementation quietly diverging.** That is the behaviour every subsequent conflict should follow.

## 6. Migration strategy

None required — no implementation exists against Node 22.

**Forward path for future LTS transitions.** Raise an ADR amending this one; run the full governance suite and every capability's CI job on the new runtime *before* the amendment is accepted; then update base images ([17](../architecture/17-deployment-topology.md)) and the declared baseline together. **Customers are never required to upgrade their runtime in step with DBiz** — the Execution Plane's supported runtime range is declared, and support windows overlap, exactly as contract versions do.

## 7. Version impact

**No contract version change.** Runtime and contract lifecycles are decoupled by design ([ADR-0001](ADR-0001-platform-language-and-runtime.md) §7); this ADR exercises that decoupling for the first time and confirms it holds.

Platform version impact is **minor**, per ADR-0001 §7.

## 8. Affected components

[ADR-0001](ADR-0001-platform-language-and-runtime.md) §4 (amended) · [17](../architecture/17-deployment-topology.md) (base images) · `package.json` engines fields in both planes · CI runner configuration · `program/CHARTER.md` §5a (standards summary).

No architecture document requires amendment: none names a Node version, because runtime specifics were correctly confined to the ADR rather than stated in the architecture.
