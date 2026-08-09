# EPIP-STANDARDIZATION-001 — Functional Testing Command Ownership Standardization

**Date:** 2026-07-29 · **Type:** Implementation of an approved platform standard ·
**Authority:** Programme-owner directive EPIP-STANDARDIZATION-001 (explicit freeze exception; supersedes prior command-ownership guidance) ·
**Verdict:** **IMPLEMENTED. The canonical customer-facing Functional Testing command `npm run functionaltest` is now owned exclusively by the Execution Plane. The Intelligence Plane exposes no runnable Functional Testing command. Runtime behaviour, Runtime SPI, contracts, browser ownership, and the evidence pipeline are unchanged.**

> This is not an investigation or a correctness review. The prior EP/IP implementation was certified correct; the platform owner has since approved a **consistency standard** — every customer-invoked capability starts from the Execution Plane — and directed that prior ADRs, the EPIP-002 Command Ownership Matrix, the engineering freeze, and previous certifications be **superseded, not treated as blockers**. This record implements that standard and updates the affected documentation.

---

## 1. The approved platform standard

Across the DBiz platform: **every customer-invoked capability SHALL be started from the Execution Plane.** The Intelligence Plane exposes orchestration, planning, synthesis, the Runtime SPI, and platform services only — **no customer-facing executable commands.** This is a platform-consistency decision, not an architecture, sovereignty, or governance correction.

## 2. What changed, exactly (two independent, self-valid changes — one per plane)

Per the two-repository rule, this was authored as **two separate changes**, each valid on its own — not one atomic cross-plane commit. After the IP change alone, the IP is valid (orchestration intact, no runnable FT command). After the EP change alone, the EP is valid (canonical command present).

| Plane | File | Change | Class |
|---|---|---|---|
| Intelligence Plane | `package.json` | **Removed** the `"functionaltest"` script entry. Orchestration launcher `packages/functional-testing-engine/canonical-functionaltest.mjs`, the Runtime SPI, ExecutionPackage generation, planning, and workflow orchestration are **retained** as code. | Command-surface removal |
| Execution Plane (`carlislehomes`) | `package.json` | **Added** `"functionaltest": "node bin/ep-functional.mjs"`; **retained** `"functional"` as a backward-compatible alias pointing at the **same** launcher (no duplicate implementation). | Command-surface addition |
| Execution Plane (`carlislehomes`) | `README.md` | Added a "Running functional tests" section documenting `npm run functionaltest` as canonical. | Documentation |
| Intelligence Plane | `docs/certification/GOVERNANCE-EPIP-002-*.md` §3 | Superseding banner → this document's §3 is now authoritative. | Documentation (supersede) |
| Intelligence Plane | `docs/certification/EPIP-CONSISTENCY-001-*.md` | Superseding banner (its "no relocation" verdict is superseded). | Documentation (supersede) |

**Not touched (the non-negotiables held):** EP/IP sovereignty · Runtime SPI · browser/Playwright ownership · `ExecutionPackage` format · execution flow · contracts · APIs · evidence pipeline. No file under any `src/`, no adapter, no gate, no contract, no `.env`, no `docker-compose` was modified.

## 3. Command Ownership Matrix — AUTHORITATIVE (post-standardization)

Enumerated from disk after the change (`package.json` in each plane).

### 3.1 Intelligence Plane (`DBiz_IntelligencePlane`) — no customer-facing FT command

| Command | Purpose | Owner | Executes a browser? |
|---|---|---|---|
| `npm run govern` | Governance suite (`run-all.js`) | IP | No |
| `npm run build` / `test` / `verify` | Build / unit-test / build+test+govern | IP | No |
| `npm run dev` / `dev:down` / `dev:local` | Local dev bring-up | IP | No |
| *(none)* `functionaltest` | **Removed** — the IP exposes no runnable Functional Testing command | — | — |

Functional Testing orchestration remains in the IP as **code, not a command**: `packages/functional-testing-engine/canonical-functionaltest.mjs` (launcher/bootstrap), the Runtime SPI, the Canonical Authoring Composer, and the 13 domains are all retained and invoked by tests, harnesses, and the dev-bootstrap generator — never as a customer `npm run` command.

### 3.2 Execution Plane (`carlislehomes`) — owns the canonical command

| Command | Purpose | Owner | Executes a browser? |
|---|---|---|---|
| **`npm run functionaltest`** | **Canonical customer-facing Functional Testing command** → `bin/ep-functional.mjs` → `runFunctional` (verify-before-execute → run → evidence) | **EP** | **Yes** (via `i2-browser.js`) |
| `npm run functional` | Backward-compatible alias for the same workflow (same launcher) | EP | Yes |
| `npm test` | `playwright test` | EP | Yes |
| `npm run functional:debug` / `:inspect` / `:author-fixture` | Debug / inspect / author dev fixture | EP | Yes / Yes / No |
| `npm run readiness` / `provision` / `register` / `connectivity` | EP lifecycle & trust | EP | No |
| `npm run test:runtime` / `test:integration` / `test:all` | EP runtime/integration tests | EP | Mixed |

**Result:** exactly one canonical customer-facing Functional Testing command — `npm run functionaltest` — owned by the Execution Plane. `functional` is a temporary compatibility alias; `functionaltest` is the documented entry point.

## 4. Architecture Ownership Diagram (post-standardization)

```
                     ┌──────────────────────────── SOVEREIGNTY BOUNDARY ────────────────────────────┐
  INTELLIGENCE PLANE (DBiz)                                            EXECUTION PLANE (Customer / carlislehomes)
  ── orchestration · planning · synthesis ──                          ── customer-facing commands · execution ──
     Runtime SPI · platform services                                     browser · Playwright · evidence
     NO customer-facing runnable command

  ┌─────────────────────────────────┐                                 ┌─────────────────────────────────────┐
  │ Planner · Discovery · AI        │                                 │ ▶ npm run functionaltest  (CANONICAL)│
  │ Test Generation (emits TEXT)    │                                 │   npm run functional      (alias)    │
  │ Canonical orchestration (code): │                                 │     → bin/ep-functional.mjs          │
  │   canonical-functionaltest.mjs  │                                 │     → runFunctional (orchestrator)   │
  │   → Runtime SPI ────────────────┼──── ExecutionPackage ──────────►│     → i2-browser.js                  │
  │      (no npm command)           │      (sealed · signed)          │        chromium.launch() ◄─ browser  │
  │                                 │                                 │        page.goto(target) ◄─ AUT      │
  │ Certification / verdict         │◄──── ExecutionResult ───────────┤        page.screenshot() ◄─ evidence │
  │   (verifies; runs no browser)   │      (signed · refs+hashes)     │                                     │
  └─────────────────────────────────┘                                 └─────────────────────────────────────┘

  Customer starts every capability from the Execution Plane. The Intelligence Plane orchestrates and
  requests via the Runtime SPI; it exposes no runnable command. Browser/AUT/evidence execution is EP-only.
  Enforced: verify-execution-plane-boundary.js (tree-wide, IP browser execution forbidden) — UNCHANGED.
```

## 5. Verification — runtime behaviour identical, only command ownership moved

| Check | Method | Result |
|---|---|---|
| IP exposes no runnable `functionaltest` | `'functionaltest' in package.json.scripts` (IP) | **false** (removed) |
| EP exposes canonical `functionaltest` | EP `package.json.scripts.functionaltest` | `node bin/ep-functional.mjs` |
| No duplicate implementation | EP `functionaltest` === `functional` target | **true** (same launcher) |
| EP launcher target exists | `ls carlislehomes/bin/ep-functional.mjs` | present |
| Both manifests valid JSON | `node -e require(...)` both | parsed OK |
| Removing the IP alias breaks no automation | `grep "run functionaltest"` across IP `*.js/*.mjs/*.json/*.yml` | only prose/comments — **no gate or script invokes it** |
| Runtime SPI unchanged | no `src/`/SPI/adapter/contract file touched | held |
| Browser/Playwright ownership unchanged | still EP-only (`i2-browser.js`) | held |
| ExecutionPackage / execution flow / evidence unchanged | no contract or pipeline file touched | held |

**The command runs the same code before and after.** On the EP, `functionaltest` and `functional` are the identical launcher invocation; the workflow (verify-before-execute → sequence → evidence → certification reference) is unchanged. On the IP, the orchestration code is intact and still reachable by tests/harnesses/dev-bootstrap — only the `npm run` convenience was removed.

## 6. Superseded guidance

Per the directive, the following are **superseded** (not deleted — retained as point-in-time records with banners):

- **EPIP-002 §3 Command Ownership Matrix** → replaced by §3 here (IP command now removed; EP now canonical).
- **EPIP-CONSISTENCY-001** verdict ("already conformant — no relocation") → superseded; the standard was subsequently approved and is now implemented.
- Any engineering-freeze clause (PROGRAM-CLOSURE-001) that would bar an entry-point change → an **explicit freeze exception** was granted by the programme owner for this standard.
- Historical certification reports (CERTIFICATION-001, DEVX-0001, CROSSPLANE-001, ARCH-REVIEW, and the FUNCTIONALTEST-* series) that show the IP `npm run functionaltest`: these are **point-in-time records** of when that command existed in the IP; they are not rewritten. This record is the current source of truth for command ownership; where they differ, this record governs.

## 7. Statement

The platform now has exactly one canonical customer-facing Functional Testing command — `npm run functionaltest` — owned exclusively by the Execution Plane, consistent with the platform standard that every customer-invoked capability starts from the Execution Plane. The Intelligence Plane exposes no runnable Functional Testing command while retaining all orchestration, planning, synthesis, and Runtime SPI code. No runtime behaviour, contract, sovereignty boundary, or architectural invariant changed. GA remains **NOT CERTIFIED** (E-2, external); the legacy runtime remains the active production path (its retirement is the separate M5/M6 track, unaffected by this DX standardization).
