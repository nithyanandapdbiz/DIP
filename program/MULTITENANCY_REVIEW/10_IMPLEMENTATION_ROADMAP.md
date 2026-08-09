# 10 — Implementation Roadmap

A sequenced path from today's state to full compliance with the approved multi-tenancy architecture. Sequencing is driven by dependency, not preference: the PDP must exist before stores can be bound to it; the isolation gate must exist to prove the rest did not regress.

## Sequencing rationale

```
        ┌─────────────────────────────────────────────────────────┐
        │ M-0  Composition root + Policy Decision Point (F-3/F-4)  │  P0
        │      → binds authenticated tenant to every execution     │
        └───────────────┬─────────────────────────────────────────┘
                        │ (everything else binds to it)
        ┌───────────────┼───────────────┬─────────────────────────┐
        ▼               ▼               ▼                         ▼
  M-1 Registry     M-2 Knowledge    M-3 Run-state           M-4 Isolation
  (F-6)            partition (F-1)  scoping (F-2)           gate (F-V)  P0
        │               │               │                         │
        └───────────────┴───────┬───────┴─────────────────────────┘
                                ▼
                     M-5 Purge + retention (F-5)  P1
                                ▼
             M-6 Graded authz (F-8) · Secret reconciliation (F-7) · P1
                     Config scope chain (ADR-0009) · Admin surface (R-07.10)
                                ▼
                     M-7 Hardening (F-9, F-10)  P2
```

## Milestones

### M-0 — Policy Decision Point & composition root · **P0 · blocks all else**
Deliver a `PolicyDecisionPoint` and a composition root that assemble gateway → registry check → `canExecute` refusal → request-scoped `TenantPaths` → engine dispatch. **Exit:** every `execute()` reaches an engine only through the PDP; a suspended/unregistered tenant is refused before stage 1, proven by test.
**Closes:** F-3, F-4. **Enforces:** R-07.9, R-08.11, R-21.6/7.

### M-1 — Authoritative registry · **P0**
Collapse the three registry sets to one, populated by onboarding, consumed by both registration and `TenantPaths`. **Exit:** onboarded tenant immediately path-constructible; departed tenant rejected; no snapshot arrays.
**Closes:** F-6. **Enforces:** R-07.4.

### M-2 — Knowledge-graph tenant partition · **P0**
Add the mandatory tenant dimension to `VectorMemory`/`VectorIndex` (or adopt the per-run pattern) across the five affected engines. **Exit:** cross-tenant `recall` returns nothing; the previously-absent isolation test is green.
**Closes:** F-1. **Enforces:** C-07.7, C-07.8, dimension 9, RR-5.

### M-3 — Run-state & audit scoping · **P0**
Key all engine `state`/audit maps by `${tenantId}:${runId}`; require tenant on resume/retry/audit reads. **Exit:** two tenants, same `runId` → no cross-read.
**Closes:** F-2. **Enforces:** R-07.6.

### M-4 — `verify-tenant-isolation` gate · **P0 (ships alongside M-2/M-3)**
Add the ten-dimension gate + direct-path-assembly scan + inactive-tenant-refusal check, registered in `run-all.js`, with a recorded/replayed fault proof (D-012). **Exit:** gate green on the fixed tree, red on a planted cross-tenant hit; suite becomes **27 gates**.
**Closes:** F-V. **Enforces:** C-07.1…C-07.12 coverage (constitution).

### M-5 — Purge & retention · **P1**
Wire `TenantPaths.purge()` to `OFFBOARDING→CLOSED`; add scheduled retention purge; add the unreadable-after-purge test. **Exit:** offboarding provably deletes tenant data; retention values have code readers.
**Closes:** F-5. **Enforces:** R-21.24/25, R-06.13/14.

### M-6 — Authorisation, secrets, config, admin · **P1**
Graded roles at the PDP (F-8); ADR-0008 reconciliation of `TenantVault` (F-7); ADR-0009 narrowing config chain; route/prove any admin surface (R-07.10). **Exit:** each role enforced by code; secret posture documented and guarded; config provenance explainable.

### M-7 — Hardening · **P2**
Per-run id sequence (F-9); logging tenant-required + sink partitioning (F-10).

## Certification gate for multi-tenant GA

Multi-tenant production certification requires, at minimum, **M-0 through M-5 complete and the M-4 gate green with its fault proof**. Until then, per the platform's own `NOT RUN ≡ FAIL` and Evidence-over-Assertion rules, tenant isolation is **not certified**, and the GA determination for multi-tenant operation must read **NOT CERTIFIED** regardless of the single-tenant/container-runtime blocker tracked separately in `PROJECT_STATE.md`.

## Effort shape (indicative, not a commitment)

| Milestone | Relative size | Risk |
|---|---|---|
| M-0 PDP/composition root | Medium | Touches the request path; highest design care |
| M-1 Registry | Small | Mechanical collapse of 3 sets |
| M-2 Knowledge partition | Small–Medium | 5 engines, one shared type |
| M-3 Run-state scoping | Small | One-line key change ×5 + read guards |
| M-4 Isolation gate | Medium | New gate + fault proof |
| M-5 Purge/retention | Small–Medium | Wire + scheduled job + test |
| M-6 Authz/secrets/config | Medium | Several independent workstreams |
| M-7 Hardening | Small | Isolated |

None requires an architecture change. All are additive against a frozen, correct design — which is why the overall position is *recoverable without redesign*, exactly the outcome the programme's founding constraints were built to make possible.
