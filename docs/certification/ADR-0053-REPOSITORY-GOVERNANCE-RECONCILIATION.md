# ADR-0053 — Repository Governance Reconciliation

**Status:** COMPLETE (reconciliation package) · **Verdict:** GOVERNANCE RECONCILED · IMPLEMENTATIONS PRESERVED · **Date:** 2026-07-29

> Reconciles repository governance drift introduced by concurrent repository evolution,
> while preserving every certified Functional Testing implementation. **Documentation and
> recommendations only** — no runtime, gateway, contract, or Functional Testing behaviour
> changes; no ADR is renumbered; no other team's files are edited. Every finding is derived
> from disk and from standalone gate execution, not from assertion.

---

## 1. Executive Summary

The ADR-0039…ADR-0052 programme is **complete and technically intact**: architecture,
runtime, contracts, and certifications are unchanged and reproduce on disk (§6). Concurrent
evolution — chiefly a **cloud-native provider-platform workstream** — introduced four
governance-drift items that this ADR **documents and assigns ownership for, without
repairing**:

1. **Duplicate ADR-0051 identifier** — `production-readiness-review` (Functional Testing) and `cloud-native-provider-platform` (concurrent) share the number.
2. **ADR template drift** — three ADRs miss required sections: ADR-0037 (historical), ADR-0051-cloud (concurrent), **ADR-0052 (Functional Testing / mine)**.
3. **Traceability gap** — two files in `packages/platform-providers/` (concurrent) lack TRACEABILITY blocks.
4. **Stale published baseline** — the "6 documented pre-existing reds" cited through ADR-0052 no longer matches reality; the reproducible deterministic count is **7** (+1 transient).

The governance **baseline is recalculated** (§5). **No implementation, runtime, or contract was changed** to produce this report. Remediations are recommended to their owners (§9); none are executed here.

## 2. ADR Number Audit (Phase 1)

**Set on disk:** ADR-0001 … ADR-0052, contiguous. **No missing numbers.** **One duplicate: ADR-0051.**

| Identifier | File | Owning workstream | Status |
|---|---|---|---|
| ADR-0051-A | `ADR-0051-production-readiness-review.md` | Functional Testing programme (this arc) | PROPOSED |
| ADR-0051-B | `ADR-0051-cloud-native-provider-platform.md` | Concurrent — cloud-native provider platform | PROPOSED |

**Inbound reference analysis (evidence, grep-derived):**

- **0051-A (review)** is referenced by `docs/adr/ADR-0052-*.md` (×4), `program/DECISIONS.md` (row), `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md` — i.e. it is **embedded in the closed, certified 0050→0051→0052 chain**.
- **0051-B (cloud)** is referenced by its **own package only**: `packages/platform-providers/package.json`, `README.md`, and `TRACEABILITY: … · ADR-0051 §4` lines across its `src/` — **self-contained within the concurrent workstream**; no Functional Testing document depends on it.
- Both are listed in `program/ARCHITECTURE_BASELINE.md:104–105` (closure baseline captured both, status UNKNOWN).

**Broken/ambiguous references:** `ADR-0052` cites "ADR-0051" without disambiguation. By content it unambiguously means 0051-A; the citation is nonetheless under-specified because a second 0051 exists.

**Reconciliation plan (recommendation — NOT executed; renumbering requires explicit authorization):**
Renumber **0051-B (cloud-native-provider-platform) → ADR-0054** (next free after this ADR), performed by the **provider-platform workstream**. Rationale — minimum impact **and** programme preservation: 0051-A sits inside a **closed, certified** sequence whose internal references (ADR-0052, DECISIONS index, programme state) would fracture if renumbered; 0051-B's references are confined to its own package, so the blast radius is a single self-contained workstream. After renumbering, the provider-platform team updates its own `package.json`/`README`/`TRACEABILITY` lines and the closure baseline is re-cut. **This ADR does not renumber anything.**

## 3. ADR Template Audit (Phase 2)

**Canonical template enforced by `verify-adr-completeness.js`** (eight sections, prefix-matched):
`Problem · Context · Alternatives · Decision · Consequences · Migration strategy · Version impact · Affected components`.

| ADR | Template conformance | Missing sections | Owner |
|---|---|---|---|
| 0039–0050, 0051-A | ✅ conforms | — | Functional Testing |
| **0037** | ❌ | Migration strategy, Version impact | Historical (pre-programme) |
| **0051-B (cloud)** | ❌ | Migration strategy, Version impact | Concurrent |
| **0052** | ❌ | Problem, Alternatives, Migration strategy, Version impact, Affected components | **Functional Testing (mine)** |

**Root cause of the 0052 drift (owned honestly):** ADR-0052 was authored in a *different* eight-section set ("Context/Decision/Options/Consequences/Evidence/Scope boundary/Verification/Status") than the one the gate enforces. It is therefore flagged by **both** `adr-completeness` and `change-control-completeness` (the latter requires an "Affected components" declaration). This is the only Functional Testing template defect and it is mine.

**Status drift (harmless):** ADR-0039 (`ACCEPTED`) and ADR-0040 (`COMPLETE`) retain "executes only after this ADR is moved from PROPOSED to ACCEPTED" gate boilerplate — status-vs-gate wording inconsistency, no operational effect.

**Recommendation (minimal, no technical-content rewrite):** add the missing section headings to ADR-0052 (mine) and ADR-0037 (its owner); the provider-platform team normalizes 0051-B. Recommended, **not performed** here.

## 4. Traceability Audit (Phase 3)

Repository-wide TRACEABILITY-block audit, grouped by package owner:

| Package / owner | TRACEABILITY status |
|---|---|
| `packages/functional-testing-engine/**` (Functional Testing) | ✅ **All 54 source/test files carry TRACEABILITY blocks** — all 13 domains, canonical-capability, activation, production-qualification, legacy-retirement, composer, SPI, bridge, cutover-readiness, all 4 `runtime/*`. |
| `packages/platform-providers/**` (Concurrent) | ⚠️ **Most `src/` files carry blocks** (`config/*`, `distributed/*`, `bootstrap/*` cite `ADR-0051 §4`), but **two lack them**: `src/index.ts` and `test/provider-platform-conformance.test.ts` (bare `(ADR-0051)` header only). **This is the deterministic cause of the `implementation-traceability` red.** |

**Ownership rule applied:** the two gap files belong to the **provider-platform workstream**. Per the authorization ("do not insert TRACEABILITY into another team's package without explicit ownership"), **no block was inserted**. Recommendation is recorded in §9 for that team.

## 5. Governance Baseline (Phase 4)

**Method:** each gate run **standalone and sequentially** (eliminating `run-all`'s parallel non-determinism).

**Three explicit baselines:**

| Baseline | Count | Gates |
|---|---|---|
| **Historical** (as published through ADR-0052) | 6 | adr-completeness, ai-vendor-neutrality, change-control-completeness, governance-self-validation, operational-readiness, intent-conservation |
| **Current deterministic** (reproducible standalone) | **7** | the 6 above **+ implementation-traceability** |
| **Transient** (parallel-run only) | +1 | `automation-executable` **or** `production-readiness` — both **PASS** standalone |

**Per-gate classification:**

| Gate | Class | Cause |
|---|---|---|
| adr-completeness | **Historical + Concurrent Drift + Repository Defect (mine)** | ADR-0037 (historical) · ADR-0051-cloud (concurrent) · ADR-0052 (mine) |
| ai-vendor-neutrality | **Historical + Harness** | ADR-0037 + a fault-probe fixture (`docs/architecture/98-fault-probe.md:8` "GPT-4"); the mid-scan `ENOENT` on that fixture is a fault-recorder interaction (§6/Harness) |
| change-control-completeness | **Historical + Concurrent Drift + Repository Defect (mine)** | ADR-0037 · ADR-0051-cloud · ADR-0052 |
| governance-self-validation | **Historical (by design)** | consequence gate — fails because other gates/proofs do |
| operational-readiness | **Historical + Environment** | no runtime / partial operational posture (E-5 lineage) |
| intent-conservation | **Historical (by design, escalated R-18.12)** | ADR-0038 — authoring does not yet conserve intent |
| implementation-traceability | **Concurrent Drift** | platform-providers `index.ts` + conformance test lack TRACEABILITY |
| automation-executable / production-readiness | **Harness Defect / Environment contention** | parallel temp-dir/dist race; PASS standalone |

**Directive:** future governance reports SHALL cite the **current deterministic baseline (7)** and name the transient explicitly, never the historical "6".

## 6. Harness Analysis (Phase 5)

Investigated: parallel execution, temp directories, dist reuse, race conditions, fault-recorder interactions.

- **Finding 1 — parallel temp/dist contention (real harness behaviour).** `run-all` executes gates concurrently. `automation-executable` generates TypeScript into a shared temp dir and runs `tsc`; under concurrency the `tsconfig.json` can be absent when read (`TS5058 … tsconfig.json … does not exist`). `production-readiness` similarly loses temp/dist races. Both **PASS standalone** → the failure is contention, **not** a code defect.
- **Finding 2 — fault-recorder fixture interaction.** `verify-ai-vendor-neutrality` crashed mid-scan with `ENOENT` on `docs/architecture/98-fault-probe.md` — a fixture that `record-fault-proofs.js` plants and removes. A concurrent recorder/scan overlap surfaces a transient `ENOENT` on top of that gate's genuine (historical) red.
- **Finding 3 — dist residue after the fault recorder.** Consistent with prior programme notes: a killed/parallel recorder can leave `dist` in a patched state, producing spurious reds until the package is rebuilt (`tsc`) and the gate re-run.

**Classification of the transients:** **test-harness defects / environment contention — not real product defects.**

**Recommendations only (harness NOT redesigned):** (a) run gates that compile into temp dirs with a **per-gate unique temp directory**; (b) **serialize** the fault recorder against `run-all`, or give it an isolated workspace; (c) treat a gate result as authoritative only from a **standalone** run, or add a lightweight retry-once-standalone confirmation before a gate is reported RED. These are recommendations for the governance-tooling owner; none are implemented here.

## 7. Repository Drift Report

| # | Drift | Origin | Deterministic? | Certified programme affected? |
|---|---|---|---|---|
| 1 | Duplicate ADR-0051 | Concurrent (provider platform) | yes | No — 0051-A intact; only the shared identifier collides |
| 2 | Template drift — ADR-0051-cloud | Concurrent | yes | No |
| 3 | Template drift — ADR-0052 | **Functional Testing (mine)** | yes | Documentation defect in my own ADR; content valid (audit-confirmed) |
| 4 | Template drift — ADR-0037 | Historical | yes | No |
| 5 | TRACEABILITY gap — platform-providers ×2 | Concurrent | yes | No — Functional Testing files all conform |
| 6 | Stale "6 reds" baseline | Programme-wide claim outrun by (1)–(5) | n/a | Claim now corrected to 7 (§5) |
| 7 | Harness transient (8th red) | Environment/harness contention | **no** | No |

**Explicitly flagged as no-longer-true claims (unrepaired, per audit terms):** the "6 documented pre-existing reds / zero net-new" phrasing carried through ADR-0044…0052 was true when written but is **superseded**; the correct current figure is **7 deterministic + 1 transient**. ADR-0052's "zero net-new reds by construction" holds at gate-count granularity (no gate flipped) but **masks** that ADR-0052 itself became a new offender inside two already-red gates (§3).

## 8. Ownership Matrix

| Finding | Owner | May THIS ADR fix it? | Action |
|---|---|---|---|
| Duplicate ADR-0051 → renumber 0051-B to 0054 | Provider-platform workstream | ❌ (foreign + renumber needs authorization) | Recommend to owner |
| platform-providers TRACEABILITY ×2 | Provider-platform workstream | ❌ (foreign package) | Recommend to owner |
| ADR-0051-cloud template drift | Provider-platform workstream | ❌ (foreign) | Recommend to owner |
| **ADR-0052 template drift** | **Functional Testing (mine)** | ✅ in principle | Recommend as bounded follow-up (not done here to keep this ADR purely additive) |
| ADR-0037 template drift | ADR-0037 owner (historical) | ❌ (out of programme) | Recommend to owner |
| Baseline recalculation | This ADR | ✅ | **Done (§5)** |
| Harness transients | Governance-tooling owner | ❌ (recommendations only) | Recommend (§6) |

## 9. Recommended Actions

1. **Provider-platform workstream:** renumber `ADR-0051-cloud-native-provider-platform` → **ADR-0054**; update its `package.json`/`README`/in-source `TRACEABILITY … ADR-0051 §4` citations; re-cut the closure baseline.
2. **Provider-platform workstream:** add TRACEABILITY blocks to `platform-providers/src/index.ts` and `test/provider-platform-conformance.test.ts` → clears `implementation-traceability`.
3. **Provider-platform workstream:** normalize `ADR-0051-cloud` to the enforced eight-section template.
4. **Functional Testing (me), separately authorized:** normalize **ADR-0052** to the enforced template (add Problem / Alternatives / Migration strategy / Version impact / Affected components; no content rewrite) → removes ADR-0052 from `adr-completeness` and `change-control-completeness`.
5. **ADR-0037 owner:** add its two missing sections.
6. **Governance-tooling owner:** apply the harness isolation recommendations (§6) to remove the transient 8th red.
7. **All future reports:** cite the **current deterministic baseline (7)**, name the transient explicitly.

*Actions 1–3, 5, 6 are for other owners; action 4 is mine, deferred to its own authorization. This ADR performs none of them.*

## 10. Final Repository Integrity Verdict

**GOVERNANCE RECONCILED (documented); CERTIFIED PROGRAMME PRESERVED.**

- **Programme preservation (Phase 6) — CONFIRMED:** architecture unchanged; runtime unchanged; platform contracts unchanged; certifications still supported (all 13 ADR-0039…0052 certification reports reproduce on disk and none overclaims — GA/production remain NOT CERTIFIED, legacy live); Functional Testing implementation unchanged. This ADR touched no source, test, gate, or contract.
- **Governance clarity — RESTORED:** every inconsistency is identified (§2–§4, §7); the duplicate identifier is documented (§2); template drift is documented (§3); traceability ownership is documented (§4, §8); the baseline is recalculated to **7 deterministic + 1 transient** (§5).
- **Open items remain OPEN and OWNED:** the four drift items (§7) are recommendations to their owners (§9); none is silently repaired.
- **Success criteria — met:** every governance inconsistency identified ✓ · duplicate identifiers documented ✓ · template drift documented ✓ · traceability ownership documented ✓ · baseline recalculated ✓ · no implementation / runtime / platform-contract / certified Functional Testing behaviour changed ✓ · no ADR renumbered ✓ · no other team's work repaired ✓.

**GA remains NOT CERTIFIED; the legacy runtime remains live and recoverable.**
