# EPIP-CONSISTENCY-001 — Functional Test Entry-Point Standardization: Reconciliation

> **⚠ SUPERSEDED (2026-07-29) by [EPIP-STANDARDIZATION-001](EPIP-STANDARDIZATION-001-COMMAND-OWNERSHIP-STANDARDIZATION.md).** This record concluded "already conformant — no relocation" against the *then-current* governance (freeze + EPIP-002 matrix). The programme owner subsequently issued **EPIP-STANDARDIZATION-001** as an **approved platform standard** — every customer-invoked capability starts from the Execution Plane; the IP exposes no runnable command — with an explicit instruction that the prior matrices, freeze, and certifications are to be *superseded, not treated as blockers*. That standard is now implemented. The evidence below remains factually accurate about the pre-standard layout; its *verdict* is superseded.


**Date:** 2026-07-29 · **Type:** Reconciliation + verification (CLAUDE.md §5 / CHARTER §3) ·
**Product code changed:** none · **Runtime SPI changed:** none · **Code migrated:** none ·
**IP command surface changed:** none · **EP (`carlislehomes`) touched:** none ·
**Verdict:** **ALREADY CONFORMANT — no relocation performed. The requested migration is contradicted by disk and by two prior governed certifications; the platform already implements the target ownership model.**

> This directive asked to remove `npm run functionaltest` from the Intelligence Plane and expose it, canonically, from the Execution Plane. Reconciled against disk, the premise does not hold: the IP command is **orchestration**, not execution; the EP already owns the **execution** command; and the naming concern was already investigated and resolved by the registered [Command Ownership Matrix](GOVERNANCE-EPIP-002-EXECUTION-OWNERSHIP-GOVERNANCE-INTEGRATION.md#3-command-ownership-matrix-deliverable-3--phase-4) (EPIP-002 §3). No governed artefact is restated here; this record references them (CHARTER §4).

---

## 1. Evidence (re-derived from disk this session)

| Fact | Source | Result |
|---|---|---|
| IP `functionaltest` is **orchestration**, launches no browser | `DBiz_IntelligencePlane/package.json:16` → `packages/functional-testing-engine/canonical-functionaltest.mjs` (dispatches **only** via Runtime SPI; header forbids legacy/simulate/fabricate) | Confirmed |
| IP has **no** browser runtime | `grep` playwright/puppeteer/selenium across 16 IP manifests | 0 hits |
| EP already owns the **execution** command | `carlislehomes/package.json:7` `"functional": "node bin/ep-functional.mjs"` → `runFunctional` → `src/adapters/i2-browser.js` `chromium.launch` | Confirmed |
| EP exposes no `functionaltest` | `grep functionaltest carlislehomes/package.json` | absent (exit 1) |
| Ownership already correct + governed | [EPIP-002 §2–3](GOVERNANCE-EPIP-002-EXECUTION-OWNERSHIP-GOVERNANCE-INTEGRATION.md) Repository + Command Ownership Matrices; enforced tree-wide by `governance/verification/verify-execution-plane-boundary.js` | INTEGRATED |
| Prior investigation of this exact premise | [EPIP-001](GOVERNANCE-EPIP-001-EXECUTION-OWNERSHIP-CERTIFICATION.md): *"NO VIOLATION FOUND; the EP/IP execution boundary holds"* | Certified |

**The two commands are not the same command in two places.** IP `functionaltest` is the certified **canonical runtime** entry point (ADR-0048/0050) — request → Runtime SPI → EP, honest-fail until a real EP exists. EP `functional` is the **EP-slice** that executes a *pre-authored, signed* `ExecutionPackage`. They are the two triggers of one workflow (`ep-functional.mjs` header: *"one workflow, one code path, two triggers"*), not duplicates. "Relocating" one onto the other would delete a canonical path and relabel a narrower command — a behaviour/scope change, which this directive's own constraints ("no execution flow changes", "no product functionality shall change") forbid.

## 2. Why the literal migration is not executed

Each item below is independently sufficient; together they are decisive (CLAUDE.md §2 precedence — architecture/ADR/governed-state outrank a prompt).

1. **Two-plane atomic change — CLAUDE.md §4.** Task 2 edits the IP; Task 3 edits the **customer-owned** `carlislehomes` EP. §4 forbids authoring a change spanning both planes in one step; the EP command surface belongs to the Execution Plane Team (CROSSPLANE-001 stopped there on the same grounds).
2. **Engineering freeze — PROGRAM-CLOSURE-001.** Prohibited: *new-launcher / entry-point switch / gateway-reroute / legacy-removal*. Removing the certified canonical command is an entry-point switch.
3. **Governed-artefact conflict.** The registered EPIP-002 Command Ownership Matrix documents the current layout as **CORRECT** and recommends *against* a rename (*"a rename is a product/DX behaviour change, out of scope"*). The directive (precedence #6) cannot silently reverse a certified governance artefact.
4. **Single source of truth — CLAUDE.md §5.** No second canonical command is created; the certified one is not deleted.

## 3. Per-task disposition

| Task | Disposition | Basis |
|---|---|---|
| **1** Locate IP `functionaltest` | **DONE** | `package.json:16` (script); documented in README quick-start, DEVX-0001, CROSSPLANE-001, DEVX-CONFIG-001. Only IP occurrence. |
| **2** Remove IP `functionaltest` runnable | **NOT PERFORMED** | Freeze (§2.2) + it is IP-owned **orchestration**, not misplaced execution (§1); removing it deletes the certified canonical-runtime entry point. |
| **3** EP exposes canonical `functionaltest` | **NOT PERFORMED (out of bounds)** | `carlislehomes` is customer-owned; the EP command surface is the Execution Plane Team's (§2.1). EPIP-002 §3.3 already carries the recommendation, conditioned on simultaneous IP disambiguation. |
| **4** Documentation shows EP as the run point | **ALREADY SATISFIED** | EPIP-002 §5 ownership diagram: browser/AUT/evidence execution EP-only via `npm run functional`; IP shows orchestration only. |
| **5** Governance artefacts (ownership/command matrices) | **ALREADY EXIST** | EPIP-002 §2 (Repository) + §3 (Command) matrices, registered and fault-proven. No constitutional change — confirmed none needed. |
| **6** Verification (SPI / execution / browser / IP-orchestrates unchanged) | **DONE — all confirmed unchanged** | Runtime SPI intact (`executionService.mjs` → `ctx.bridge.execute`); browser EP-only (`i2-browser.js`); IP orchestrates only (0 browser deps); no production behaviour changed (nothing edited). |

## 4. If the organisation genuinely wants the EP to expose `functionaltest`

That is a legitimate architectural preference, but it is an **architectural decision, not a package.json edit**, and it is not blocked engineering — it is out-of-bounds-here work with a clear owner:

1. Raise an **ADR** amending the entry-point model (the canonical FT command becomes EP-owned; the IP retains orchestration as **library/API only**, no runnable), with a **freeze exception** (PROGRAM-CLOSURE-001 §P2).
2. **Execution Plane Team** adds `"functionaltest"` to `carlislehomes/package.json` (delegating to `bin/ep-functional.mjs`), retaining `functional` for compatibility.
3. **IP** removes the runnable `functionaltest` script **only after** step 1, disambiguating simultaneously so no cross-plane literal collision is introduced (EPIP-002 §3.3).
4. Update EPIP-002's Command Ownership Matrix in place (single source of truth — not a second copy).

Each step is separately authorised and separately owned. None is performed here.

## 5. Verdict

**ALREADY CONFORMANT.** The platform already implements the requested ownership model: the Execution Plane owns functional execution and the browser (`npm run functional`); the Intelligence Plane owns orchestration/planning/SPI and exposes no browser execution. The residual — the EP not literally bearing the name `functionaltest` — is a naming/DX preference owned by the Execution Plane Team and governed by ADR + freeze exception, already analysed in EPIP-002. Runtime SPI, execution ownership, and browser boundaries are unchanged because nothing was changed. GA remains **NOT CERTIFIED** (E-2, external); legacy runtime live.
