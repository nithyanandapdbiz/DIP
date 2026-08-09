# Penetration Testing Engine — reconciliation and conflict report

**Date:** 2026-07-23 · **Scope:** shared-repository actions requiring human approval (STEP 12)
**Companion:** [certification report](PENETRATION_TESTING_ENGINE_CERTIFICATION_REPORT.md) · [ADR](../docs/adr/ADR-0027-penetration-testing-engine-internal-structure.md)

Every item below was detected from disk. **None has been auto-applied.** Each carries evidence and a recommended resolution, and each remains a human-approved change — ADR numbering, closure re-baselining, runner registration and programme-state updates are explicitly out of scope for automatic modification.

---

## 1. CONFLICT — ADR number 0024 is claimed twice (must resolve)

**Evidence (from disk):**

```
docs/adr/ADR-0024-dev-change-engine-internal-structure.md          (pre-existing — Dev-Change Engine)
docs/adr/ADR-0027-penetration-testing-engine-internal-structure.md  (this work — created session 7)
docs/adr/ADR-0025-platform-certification-framework.md               (pre-existing)
```

The Dev-Change Engine took **ADR-0024** and the platform certification framework took **ADR-0025** — both between the session that authored the pentest ADR and now. The Penetration Testing Engine ADR therefore **collides on number 0024**. The two files have distinct filenames (so markdown links still resolve), but the *decision number* is duplicated, which breaks the one-number-one-decision invariant and will confuse `verify-adr-completeness.js` and the traceability gate.

**Root cause:** the pentest ADR was numbered 0024 when 0024 appeared free; the Dev-Change and certification ADRs landed in the same window. This is a numbering race, not a content conflict — the two ADRs decide unrelated things.

**Recommended resolution (human-approved):** renumber the Penetration Testing Engine ADR **0024 → 0026** (the next free number). The rename touches these references, all of which must move together:

| File | Reference to update |
|---|---|
| `docs/adr/ADR-0027-penetration-testing-engine-internal-structure.md` | rename file → `ADR-0026-…`; change the `# ADR-0024` heading and every in-text "ADR-0024" |
| `program/PENETRATION_TESTING_ENGINE_IMPACT_ANALYSIS.md` | all "ADR-0024" references and the link |
| `program/IMPLEMENTATION_STATUS.md` §5 | the pentest row's ADR link |
| `program/DECISIONS.md` | the ADR-index row added for the pentest ADR (currently labelled 0024) |
| `governance/capability/run-pentest-conformance.mjs` · `run-pentest-completeness.mjs` | `adrReference: ['ADR-0024']` |
| `governance/verification/verify-pentest-conformance.js` · `verify-pentest-completeness.js` | `adrReference: ['ADR-0024']` |
| `program/SESSION_LOG.md` | session-7 entry mentions of ADR-0024 |

No code changes; the engine does not reference the ADR number at runtime. **This report does not perform the rename** — it is a shared-record decision.

## 2. Programme-state drift (record, human-approved to close)

| Claim | Disk reality | Status |
|---|---|---|
| `PROJECT_STATE.md` (Session 6): "PROGRAMME CLOSED … the capability layer — the six engines — NOT STARTED" | Four capability engines are built and gated: FTE (94 agents), Dev-Change (129), Discovery (186), Penetration Testing (220) | **Drift.** `IMPLEMENTATION_STATUS.md` is already reconciled (all four VERIFIED); `PROJECT_STATE.md`'s closed-programme narrative is stale. Recommend a `PROJECT_STATE.md` update noting the capability layer is under active construction. |
| `DECISIONS.md` ADR index ends at ADR-0019 | `docs/adr/` holds ADR-0020 … ADR-0025 (and the pentest ADR) | **Drift.** ADR-0020–0025 must be backfilled from their **headers, not filenames** (the session-1 lesson recorded in `PROJECT_STATE.md` §8). |

## 3. Capability registry — NO drift

- The platform still declares **exactly six capabilities** (measured: conformance P-10 reads document 11 at runtime). The Penetration Testing Engine is capability 6, not a seventh.
- **No architecture document was added** (measured: 25 documents, highest numbered 25 — P-10.a).
- The Threat Intelligence engine is a *domain* (14 agents), not a capability.

## 4. Shared file conflicts

| File | State | Recommendation |
|---|---|---|
| `governance/verification/run-all.js` | Pentest gates **not registered** (a session-7 attempt was reverted by the environment) | Register `verify-pentest-conformance.js` and `verify-pentest-completeness.js` as part of the deliberate re-baseline (below) |
| `governance/capability/pentest-evidence.json` · `pentest-completeness-evidence.json` | **New**, regenerated on every gate run | No action — these are generated evidence, not source |

## 5. Closure baseline changes (deliberate re-baseline required)

Adding `docs/adr/` and `packages/penetration-testing-engine/` and (when approved) the two runner entries all change the closure baseline. `verify-programme-closure.js` **correctly flags** this until a human re-baselines:

```
node governance/closure/emit-closure-package.mjs program   # regenerate the closure package
# then review the diff and commit — silent amendment is what the gate prevents
```

This is the same path ADR-0022 and ADR-0023 took. **This session performs no re-baseline.**

## 6. Runner registration requirements (human-approved)

Two new gates are built and green **standalone**, but not in `run-all.js`:

```
node governance/verification/verify-pentest-conformance.js     # → PASS (13 properties)
node governance/verification/verify-pentest-completeness.js    # → PASS (100%, 6 fault proofs)
```

Registering them alongside the FTE/Discovery/Dev-Change gates requires the closure re-baseline in §5 and (per `verify-governance-self-validation.js`) a recorded fault proof — which the completeness gate already carries as X-1…X-6. Recommend registering both during the §5 re-baseline.

---

## Human-decision summary

| # | Decision | Evidence | Recommendation |
|---|---|---|---|
| 1 | **ADR number collision 0024** | two ADR-0024 files on disk | renumber pentest ADR → **0026**, update 7 reference sites |
| 2 | Register two pentest gates in `run-all.js` | gates green standalone | register during re-baseline |
| 3 | Re-baseline closure | `verify-programme-closure.js` flags the ADR + package additions | `emit-closure-package.mjs`, human-reviewed |
| 4 | Update `PROJECT_STATE.md` closed-programme narrative | 4 engines built on disk | note capability layer under construction |
| 5 | Backfill `DECISIONS.md` ADR index (0020–0025) | index ends at 0019 | backfill from ADR headers, not filenames |

**No architectural, governance, security or data-sovereignty change is required or recommended.** These are records and wiring, not design.
