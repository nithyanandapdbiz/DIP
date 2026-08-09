# Master Roadmap

**Last updated:** 2026-07-22 · **Roadmap version:** 1.0

Sequence and dependencies. The *content* of each phase is in `MASTER_IMPLEMENTATION_PLAN.md`; this document answers **what must happen before what, and why**.

---

## 1. Critical path

```
P0 Program Foundation
   └─> P1 Canonical Architecture ......... nothing can be built before it is specified
        └─> P2 Contracts & Interfaces .... boundaries defined before anything crosses them
             └─> P3 Governance-as-Code ... rules enforced before the code that could break them
                  ├─> P4 IP Foundation ─┐
                  └─> P5 EP Foundation ─┤  (parallel — different repos, no shared code)
                                        └─> P6 Cross-Plane Integration
                                             └─> P7 Reference Capability
                                                  └─> P8 Capability Expansion
                                                       └─> P9 Tenancy & Sovereignty
                                                            └─> P10 Production Readiness
```

**P4 and P5 are the only phases that may run in parallel.** They touch different repositories and share no code — only the contracts fixed in P2. Everything else is strictly sequential.

## 2. Why the order is what it is

| Ordering | Reason |
|---|---|
| **Architecture before contracts** | A contract is a commitment about a boundary. Boundaries are an architectural output, so contracts cannot be authored first without inventing the architecture implicitly. |
| **Contracts before governance** | Checks assert conformance to something. Without fixed contracts there is nothing stable to assert against, and the checks would churn with every change. |
| **Governance before runtime** | This is the programme's defining inversion. The legacy platform built the runtime and audited afterwards, discovering 76 violations at baseline. Enforcing first means a violation is visible when introduced, not years later. |
| **Both planes before integration** | Integration proves the contract holds. It cannot prove anything if either side is still moving. |
| **One reference capability before five more** | The reference capability turns the shared orchestration from a claim into an executable conformance check. Building all six in parallel would produce six subtly different architectures — precisely the outcome the capability model forbids. |
| **Tenancy after capabilities** | Isolation must be enforced across real execution paths. Applied to a skeleton it proves nothing. |
| **Production readiness last** | Deployability, supply chain, and certification are properties of the finished system. |

## 3. Dependency notes that constrain sequencing

- **The integrity primitive (M2.2) blocks all evidence work.** The legacy platform carried two implementations of one governed term and produced false tamper verdicts as a result. Exactly one implementation is defined once, before any producer or consumer exists.
- **AI-disabled operation (M5.4, M7.2) is not a late hardening step.** If AI is woven in first, removing it later is a rewrite. Both paths are built together, from the first capability onward.
- **The declared-vs-consumed check (M3.3) must exist before configuration schemas are populated (M2.4 onward).** Its purpose is to make an unconsumed field impossible to introduce; adding it afterwards only measures damage already done.
- **CI on active branches (M3.4) gates everything after it.** Checks that run only on the default branch do not constrain development, which is where violations are actually introduced.

## 4. Milestone sequence

| Order | Milestone | Depends on |
|---|---|---|
| 1 | M0.1 Programme memory | — |
| 2 | M0.2 Legacy lessons extracted | M0.1 |
| 3 | M0.3 Repositories initialised | M0.1 |
| 4 | M1.1 Platform Constitution | M0.2 |
| 5 | M1.2 Reference + plane architectures | M1.1 |
| 6 | M1.3 Sovereignty / tenancy / security / data-flow | M1.2 |
| 7 | M1.4 Capability model + orchestration | M1.2 |
| 8 | M1.5 AI / tool / config / runtime / deployment models | M1.2 |
| 9 | M1.6 Architecture freeze v1.0 | M1.3, M1.4, M1.5 |
| 10 | M2.1 Cross-plane contract | M1.6 |
| 11 | M2.2 Evidence contract + integrity primitive | M1.6 |
| 12 | M2.3 SPI definitions | M1.6 |
| 13 | M2.4 Configuration schema | M1.6 |
| 14 | M3.1 Verification harness | M2.1–M2.4 |
| 15 | M3.2 Structural checks | M3.1 |
| 16 | M3.3 Declared-vs-consumed check | M3.1 |
| 17 | M3.4 CI on active branches | M3.2, M3.3 |
| 18+ | P4/P5 onward | M3.4 |

## 5. Re-planning rule

The roadmap changes when a dependency is discovered to be wrong, and for no other reason. **Schedule pressure is never a reason to reorder.** Any reordering is recorded as a decision in `DECISIONS.md` with its justification.
