# GOVERNANCE-EPIP-001 — Execution Ownership Remediation & Governance Hardening

**Date:** 2026-07-29 · **Type:** Governance & architecture investigation (evidence-first, first-principles) ·
**Scope:** Intelligence Plane (`DBiz_IntelligencePlane`) + Execution Plane (`carlislehomes`) ·
**Change to product code:** none · **Change to governance:** one additive, self-proving fitness tool (not yet registered) ·
**Verdict:** **NO VIOLATION FOUND — the EP/IP execution boundary holds. The mission's founding premise is not supported by repository evidence.**

> This investigation was run under the instruction "Do NOT assume previous reports are correct — re-evaluate from first principles, evidence only." It was *also* run under CLAUDE.md §5 / CHARTER §3: **a prompt is an instruction, not evidence; where a prompt conflicts with the repository, the repository governs.** The mission presupposes that "Functional Test Execution entered the Intelligence Plane." That presupposition was tested against disk. It is false. What follows is the evidence, not a defence of any prior report — every claim below was re-derived by direct inspection in this session.

---

## 1. Executive Summary

The mission asked how functional-test **execution** entered the Intelligence Plane, which governance failure allowed it, and how to remediate. Direct inspection of both repositories shows **execution never entered the Intelligence Plane.** The premise is contradicted by four independent, mutually-corroborating lines of evidence:

| # | Question the evidence answers | Finding | Primary evidence |
|---|---|---|---|
| 1 | Does IP **depend on** a browser runtime? | **No** — zero browser/automation packages in any of the 16 IP manifests | `grep` over all `package.json`; `execution-plane-boundary-fitness.js` §1 |
| 2 | Does IP **import or call** a browser? | **No** — zero live browser imports/calls across 398 IP source files | tree-wide live-code scan §2 (PASS) |
| 3 | Where does the browser **actually run**? | **Execution Plane** — `playwright` dependency + `chromium.launch()`/`page.goto()`/`page.screenshot()` | `carlislehomes/package.json:20`; `carlislehomes/src/adapters/i2-browser.js:92,94,115,123,128` |
| 4 | What does the IP's functional-testing code **do**? | **Generates** test text and **orchestrates an execution request** — both IP-owned concerns | see §4 |

The only browser-shaped tokens anywhere in IP source are **string literals inside a code generator** (`src/emitters/executable-automation.ts` — Test Generation, an IP-owned concern) and **injection strings inside the fault-proof harness**. Neither is executed. The IP *physically cannot* launch a browser: the dependency is not installed.

**Therefore:** there is no misplaced execution component to migrate, no governance rule that failed, and no review that should have caught a violation — because there is no violation. The requested new rules (EP-IP-001…005) already exist as constitutional rules; minting them anew would create a second source of truth (CHARTER §4). The one *genuine* finding is **preventive, not remedial**: the existing import-scan enforcement is **file-scoped to the runtime seam**, whereas the constitution mandates it "over [the] source tree" (R-3.5). This report delivers a **tree-wide, self-proving enforcement gate** that closes that scope gap, and a **crosswalk** mapping the requested EP-IP rules onto the constitutional rules that already carry them.

---

## 2. Root-Cause Timeline

The mission asks for the "FIRST architectural decision that violated EP/IP separation." **No such decision exists in the repository record.** What the record shows instead:

| When (from repo record) | Decision | Effect on the boundary |
|---|---|---|
| Constitution v1.0 | **R-3.5**: IP "SHALL NOT contain browser, load-generation, or scanning capability — even dormant, even unreferenced," with three named enforcement mechanisms | Boundary declared with structural intent |
| Doc 19 (FROZEN 2026-07-22) | Ownership matrix: "Browser / API / performance / security / penetration execution" = **EP only**; R-19.2 "no concern appears in both columns" | Boundary made canonical |
| ADR-0039 (FT re-founding) | 13 FT domains built behind the frozen 12-stage boundary; **domains NOT wired to execution** | Generation/authoring built in IP — correctly, as IP owns Test Generation |
| ADR-0047/0048/0050 | Canonical runtime = **injected-dependency SPI**; IP dispatches an `ExecutionPackage` to the EP transport; CI-5 / RE-4 gates assert "no browser execution in the IP," fault-proven | Execution kept in EP by construction; enforcement added at the seam |
| `carlislehomes` EP | `playwright` dependency + `i2-browser.js` adapter | Browser execution located in EP, where the matrix assigns it |

**Root cause of the mission's premise (not of a violation):** two natural-language conflations, each defensible-sounding and each wrong on inspection:

1. **"A `functional-testing-engine` package lives in the IP" ⇒ "the IP executes functional tests."** It does not. That package *generates* automation text (emitter) and *orchestrates the execution request* (launcher → SPI → EP). Both are IP-owned concerns (Doc 19: "Test generation," "Execution request orchestration").
2. **"`npm run functionaltest` exists in the IP" ⇒ "the canonical execution entry point is in the IP."** The IP's command is a *request orchestrator* that dispatches to the EP and refuses to fabricate execution; the EP owns the command that actually runs a browser. Two commands, two repos, one shared name (see §5, Finding M-1).

Additional evidence sufficiency note (per the mission's own rule): **git history was not available** in this container (the container is not a repository; the IP repo's internal history was not traversed in this session). The timeline above is reconstructed from *in-repo artefacts* (constitution, frozen Doc 19, ADR set, gate sources), which are themselves the durable record. Where an intent claim would require commit-level history to substantiate, this report states the artefact evidence and does not infer intent.

---

## 3. Architectural Violation Report

**Violations found: 0.** The scan that would surface them, run tree-wide in this session, is green:

```
2. Source execution ban — LIVE code, whole tree (R-3.5 enforcement mechanism 2)
  PASS  no Intelligence-Plane source executes or drives a browser (398 source files scanned)
1. Manifest dependency ban (R-3.5 enforcement mechanism 1)
  PASS  no Intelligence-Plane manifest declares a browser/automation runtime (16 manifests scanned)
RESULT: PASS — the Intelligence Plane contains no execution capability.
```

**Not-a-violation, explicitly cleared** (each was a candidate the scan flagged or a reasonable suspicion, and each was resolved to CORRECT by evidence):

| Candidate | Why it looked like a violation | Why it is not | Evidence |
|---|---|---|---|
| `src/emitters/executable-automation.ts` contains `@playwright/test`, `page.goto`, `page.screenshot` | Browser vocabulary in IP source | Tokens are **string literals** emitted as generated test code; Test Generation is IP-owned (Doc 19). Generation ≠ execution. | `executable-automation.ts:166,173,257` (all inside backticks) |
| IP root `npm run functionaltest` | A "functionaltest" entry point in the IP | Thin launcher that dispatches **only** through the Runtime SPI to the EP; "NEVER … simulates, mocks, or fabricates execution"; no browser dependency present to launch | `packages/functional-testing-engine/canonical-functionaltest.mjs`; `launcher/services/executionService.mjs` (`ctx.bridge.execute` → SPI) |
| Governance gates naming `chromium.launch`, `recordvideo`, etc. | Browser vocabulary in `governance/verification/*.js` | The **detection mechanism** naming the forbidden vocabulary as regex patterns; contains no browser runtime | e.g. `verify-canonical-runtime-integration.js:99`, `verify-automation-architecture-domain.js:101` |

---

## 4. Ownership Map — the Functional Testing flow, end to end

```
INTELLIGENCE PLANE  (DBiz_IntelligencePlane)                    EXECUTION PLANE (carlislehomes)
────────────────────────────────────────────────              ──────────────────────────────────
Planning / Discovery / Test Generation                          Runtime bindings (buildDependencies)
  • emitters/executable-automation.ts                             • src/adapters/i2-browser.js
    → EMITS Playwright *source text* (strings)                      → playwright.chromium.launch()   ← browser starts HERE
                                                                     → page.goto(target)             ← AUT connection HERE
Execution-request orchestration                                    → page.screenshot(...)            ← evidence capture HERE
  • npm run functionaltest → canonical-functionaltest.mjs
  • launcher → Runtime SPI → runtime-entry-point-bridge
      │  builds ExecutionPackage (sealed, content-addressed)
      │
      ▼  ═══════════ ExecutionPackage (signed, references only) ═══════════▶  executes package
                                                                                       │
      verify-ep-certification.js  ◀═══ signed ExecutionResult / EP certification ══════┘
        • verifies signature + content hash                        emits: verdict + evidence
        • references + hashes ONLY (no artefact content crosses)     REFERENCES + hashes only
        • produces the verdict (certification)                       (screenshots/video/trace stay in EP)
```

| Where the mission asked to look | Answer (evidence) |
|---|---|
| Where execution begins | Execution Plane, `i2-browser.js` |
| Where Playwright starts | EP dependency `playwright@^1.62.0`; `i2-browser.js:92` |
| Where browsers launch | `carlislehomes/src/adapters/i2-browser.js:92,94` (`chromium.launch`) |
| Where AUT connections occur | `i2-browser.js:123,128` (`page.goto(target)`) |
| Where screenshots originate | `i2-browser.js:115` (`page.screenshot`) |
| Where runtime bindings execute | Execution Plane (the IP holds only a *generator* for bindings text; §DEVX-0001) |
| Where `npm run functionaltest` resolves — IP | `canonical-functionaltest.mjs` → SPI → EP transport (a **request**, no browser) |
| Where `npm run functionaltest` resolves — EP | EP-local execution against a browser (the command that actually runs) |

---

## 5. Repository Ownership Matrix (as-built, verified this session)

C = CORRECT · SC = SHARED CONTRACT · M = MISPLACED (needs migration). **Misplaced components: none.**

| Component | Plane (as-built) | Owner (Doc 19) | Class | Evidence |
|---|---|---|---|---|
| Browser launch / page driving / screenshots | EP | EP | **C** | `i2-browser.js` |
| `playwright` dependency | EP | EP | **C** | `carlislehomes/package.json:20` |
| Test-generation emitter (Playwright *text*) | IP | IP (Test generation) | **C** | `executable-automation.ts` |
| Execution-request launcher / Runtime SPI / bridge | IP | IP (Execution request orchestration) | **C** | `canonical-functionaltest.mjs`, `runtime-execution-spi.ts` |
| `ExecutionPackage` (authored in IP, consumed in EP) | both, by contract | contracts layer | **SC** | `20-cross-plane-contracts.md` |
| `ExecutionResult` / EP certification (produced in EP, verified in IP) | both, by contract | contracts layer | **SC** | `verify-ep-certification.js` |
| Evidence artefacts (screenshots/video/trace) | EP | EP | **C** | references-only cross the boundary |
| Certification / verdict | IP | IP | **C** | `verify-ep-certification.js` (IP verifies, does not execute) |

**Minor finding M-1 (advisory, not a boundary violation).** Both planes expose a command literally named `functionaltest`. In the IP it is an *execution-request orchestrator*; in the EP it is *local execution*. Same name, two meanings, two repos. This is a clarity risk, not a sovereignty breach (the IP command launches no browser). **Recommendation:** document the IP command as the *request/orchestration* entry (or rename to e.g. `functionaltest:request`) and reserve the bare `functionaltest` verb for EP-local execution, so the mission's own conflation cannot recur in a reader's mind. Owner: maintainer; non-blocking.

---

## 6. Governance Gap Analysis

For each governance process the mission named: did it verify correct ownership / boundary? "Ownership validated?" is the deciding column.

| Governance process | Verifies implementation? | Verifies ownership / boundary? | Assessment |
|---|---|---|---|
| Architecture Fitness (`verify-architecture-fitness.js`) | — | **Partial** — checks the **document** still forbids browser capability + bans cross-plane relative paths (`:78`, `:90`); does **not** scan IP *source* | **GAP (scope):** doc-level + path-level, not code-level |
| Canonical Runtime Integration (`verify-canonical-runtime-integration.js`, CI-5) | Yes | **Yes** — import-scans IP source for `playwright/…/page./.goto(/.screenshot(` — **but only the 3 seam files** (composer/SPI/bridge) | **GAP (coverage):** seam-scoped, not tree-wide |
| Runtime Enablement (`verify-runtime-enablement.js`, RE-4) | Yes | **Yes** — same scan over 4 runtime-infra files | **GAP (coverage):** seam-scoped, not tree-wide |
| EP Certification (`verify-ep-certification.js`, EDR-4) | Yes | **Yes (strong)** — IP *verifies* a signed EP certification; references+hashes only; "NO artefact content crossed"; "no browser dependency … in the Intelligence Plane" | **SOUND** |
| Governance Self-Validation (`verify-governance-self-validation.js`) | Yes (meta) | Indirectly — ensures every registered gate is proven and every on-disk gate is registered | **SOUND** (this is why an orphan gate is itself flagged) |
| Provider / Configuration / DevX governance | Yes | Not their remit | Out of scope for this boundary |

**The single real gap.** Constitution R-3.5's enforcement clause names *three* mechanisms: **(1) a dependency-ban gate over the manifest, (2) an import-scan gate over the source tree, (3) an egress policy at the runtime boundary.** Mechanism (2) exists and is fault-proven — but as **seam-scoped** checks (CI-5, RE-4) over a hardcoded file list, not **tree-wide**. A browser import introduced in a *new* IP file, in another package, is outside those file lists and would pass CI while "even dormant, even unreferenced" (R-3.5) forbids exactly that. A dedicated **manifest dependency-ban gate** (mechanism 1) is likewise not present as a standalone, tree-wide check. **This is a coverage gap in enforcement, not a boundary that was breached** — today the tree is clean, as this session's scan proves.

**Why no review "failed."** The boundary was never crossed; enforcement at the seam is real and fault-proven; the evidence contract (EP certification) structurally forbids artefact content from crossing. The mission's expectation of a failed review presupposes a violation that did not occur.

---

## 7. Migration Plan & Governance Hardening

**Migration required: none.** The as-built flow already *is* the target the mission specifies:

```
IP → ExecutionPackage → EP → Functional Execution → Evidence → ExecutionResult → IP
```

No browser execution resides in the IP to move. The remediation is therefore **hardening the enforcement to match the constitution's stated scope**, plus a naming-clarity advisory (M-1). Two deliverables:

### 7.1 Tree-wide execution-ownership fitness gate (delivered, self-proving)

`governance/fitness/execution-plane-boundary-fitness.js` — implements R-3.5 enforcement mechanisms (1) and (2) at **tree scope**:

- **Manifest ban:** scans every IP `package.json` for a browser/automation runtime in any dependency section (structural key match — no false positives).
- **Source ban:** reads every IP `.ts/.mts/.cts/.js/.mjs/.cjs` file, **strips comments + string/template-literal bodies + regex-literal bodies** (preserving `import`/`require` specifiers and `${…}` interpolations), then scans the residual **live code** for browser imports and browser-drive calls. This is what makes it correct where a naïve `grep` is wrong: it distinguishes **generation** (the emitter's Playwright *text*) and **detection** (gates naming the vocabulary in regexes) from **execution** (a live call).
- **Self-proof (R-13.4), fail-closed:** before trusting its verdict it proves it *detects* a synthetic live `import 'playwright'` + `chromium.launch()` **and** that it does *not* flag an emitter-style template string, a prohibition comment, a detection regex, or a data string. If the self-proof fails, the gate exits non-zero.

Evidence produced this session:
- IP tree-wide scan: **PASS** (16 manifests + 398 sources; 0 violations).
- Self-proof: **PASS** (positive + negative).
- **External validation:** pointed at the EP's `i2-browser.js`, the same patterns detect `chromium.launch` — the gate is not blind; it correctly finds execution where execution legitimately lives.

**Registration recipe (maintainer step — mutates the frozen baseline, per CHARTER §18).** The gate is deliberately placed under `governance/fitness/` (not `governance/verification/`) and **not** named `verify-*.js`, so it introduces **no NOT-RUN drift** into `verify-governance-self-validation` §4b (verified: "59 gates all registered"). To promote it to gating:
1. Move/rename to `governance/verification/verify-execution-plane-boundary.js`.
2. Add `{ script: 'verify-execution-plane-boundary.js', label: 'Execution-Plane boundary — no browser/scan/load capability in the IP, tree-wide (R-3.5)', gating: true }` to `run-all.js`.
3. Add its fault proof in the **same change** (`record-fault-proofs.js`): inject a live `playwright.chromium.launch` into a scanned IP file, assert the gate goes red, revert. Re-run `record-fault-proofs.js` then `verify-governance-self-validation.js` (must return to its prior state — it is green on §4b before/after this addition).

This step is **not** performed in this session: it edits `run-all.js` + `proofs.json`, which are baseline-load-bearing and under engineering freeze; adding it is a deliberate maintainer action, not a side effect of an investigation.

### 7.2 New governance rules — crosswalk, not duplication

The mission asks to *create* EP-IP-001…005. **CHARTER §4 and CLAUDE.md forbid a second source of truth:** these rules already exist as constitutional rules. Creating parallel EP-IP-00x text would guarantee divergence. The enterprise-safe form is a **crosswalk** that binds the requested identifiers to their existing canonical homes:

| Requested rule | Already exists as | Canonical home | Enforced by |
|---|---|---|---|
| **EP-IP-001** Execution Ownership (browser forbidden in IP) | **R-3.5**, **C-01.8** | `01-platform-constitution.md:122,361` | CI-5, RE-4, **§7.1 (tree-wide)** |
| **EP-IP-002** Evidence Ownership (capture only in EP) | **R-19.2** + evidence-flow (references-only cross) | `19-repository-ownership.md:49`; `10-evidence-flow-model.md` | `verify-ep-certification.js` (no content crosses) |
| **EP-IP-003** AUT Connectivity (only EP talks to AUT) | **R-3.2** (IP opens no connection to customer systems) | `01-platform-constitution.md` (C-01.9) | egress policy; `verify-http-surface.js` |
| **EP-IP-004** Execution Entry Point (canonical run only in EP) | **R-2.x** execution sequencing = EP; **R-19.2** | `19-repository-ownership.md`; `04-execution-plane-architecture.md` | §7.1 + M-1 naming advisory |
| **EP-IP-005** Architecture Ownership Review (owner plane / deps / boundaries per feature) | **CHARTER §8** (data-security definition per capability) + Doc 19 review | `CHARTER.md §8`; `19-repository-ownership.md` | review pipeline (CHARTER §9) |

**Recommendation:** if the organisation wants the "EP-IP-00x" nomenclature for communication, record it as a **crosswalk appendix inside `19-repository-ownership.md`** (an ADR amendment), pointing at the constitutional rules — **never** as standalone rule text. That keeps one topic, one document.

---

## 8. CI Enforcement Strategy

The mission's Phase 7 asks CI to fail if the IP contains Playwright imports, browser launch, page objects, evidence/screenshot/video/trace utilities, browser lifecycle, direct AUT connectivity, or an execution runtime — and to verify `ExecutionPackage` is produced only by IP and `ExecutionResult` consumed only by IP.

| Requirement | Mechanism | Status |
|---|---|---|
| IP contains no Playwright import / browser launch / page-driving / screenshot | §7.1 tree-wide gate (live-code scan) | **Built & self-proven; pending registration** |
| IP contains no browser/automation **dependency** | §7.1 manifest ban | **Built & self-proven; pending registration** |
| IP runtime seam runs no browser | CI-5, RE-4 | **Already gating & fault-proven** |
| No artefact content (screenshot/video/trace) crosses into IP | `verify-ep-certification.js` (references+hashes only) | **Already gating** |
| `ExecutionPackage` produced only by IP | ADR-0048/0050 SPI contract; CI-5 asserts IP dispatches, EP executes | **Present** — a dedicated "package authored in IP, executed in EP" assertion can be added to §7.1 as a follow-on |
| `ExecutionResult` consumed only by IP | `verify-ep-certification.js` (IP verifies; EP produces no verdict, C-01.6) | **Present** |
| IP reaches no plane by filesystem path | `verify-architecture-fitness.js:90` | **Already gating** |

**Defence in depth already exists** (dependency-ban ∪ seam import-scan ∪ evidence-contract ∪ egress ∪ cross-plane-path ban). §7.1 upgrades the import-scan leg from *seam-scoped* to *tree-wide*, which is the one leg not yet at the scope the constitution states.

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A future browser import lands in a *new* IP file outside the seam gates | Low today (tree is clean) | High (latent sovereignty breach per R-3.5) | Register §7.1 tree-wide gate |
| The `functionaltest` name collision leads a reader to re-assert "IP executes tests" | Medium (this very mission did) | Low (no code effect) | M-1 naming advisory / doc |
| A naïve future scan false-positives on the emitter and someone "fixes" the generator | Medium | Medium (breaks Test Generation) | §7.1's live-code method + this report's evidence that generation ≠ execution |
| Registering §7.1 perturbs the frozen `run-all.js`/`proofs.json` baseline | Certain if done carelessly | Medium | Follow §7.1 recipe: gate **and** proof in one change; re-verify self-validation |
| Git history unavailable ⇒ intent claims unprovable | n/a | Low | This report asserts only artefact evidence; states where commit history would be required |

**Evidence-sufficiency statement (per the mission's closing instruction).** Two conclusions are bounded by available evidence and are reported as such rather than inferred: (a) the *intent* behind any historical decision cannot be established without commit history, which was not available in this container — the timeline uses in-repo artefacts only; (b) the EP was inspected as the `carlislehomes` working tree present in this container; a full EP certification run was not executed here (it requires the EP runtime — external, per the standing E-2 blocker). The boundary conclusions in §3–§5 rest on the IP and EP **source and manifests**, which were directly read.

---

## 10. Final Certification

**VERDICT: NO EXECUTION-OWNERSHIP VIOLATION EXISTS. The EP/IP boundary is intact and enforced.**

Answering the mission's success criteria, each from evidence:

- **Why was execution allowed inside the IP?** It was not. IP has zero browser dependencies and zero live browser code (398 sources, 16 manifests scanned green). Browser execution lives in the EP (`i2-browser.js`, `playwright`). The premise rests on conflating **Test Generation** and **execution-request orchestration** (both IP-owned) with **execution** (EP-owned).
- **Which governance rule failed?** None. R-3.5, R-19.2 and the evidence contract all held. The only shortfall is a **coverage gap** in R-3.5 enforcement mechanism (2): import-scanning is seam-scoped, not tree-wide.
- **Which review should have caught it?** There was nothing to catch. The seam gates (CI-5/RE-4) and the EP-certification gate already enforce the boundary and are fault-proven.
- **Which architectural assumption was incorrect?** The mission's — that a `functional-testing-engine` package and a `functionaltest` script *inside the IP* imply execution inside the IP. Inspection shows generation + request-orchestration, not execution.
- **How will this never happen again?** (1) Register the delivered **tree-wide, self-proving** execution-ownership gate (§7.1) to enforce R-3.5 at the scope the constitution states; (2) adopt the **crosswalk** (§7.2) so EP-IP-00x point at existing rules rather than duplicating them; (3) apply the **M-1 naming advisory** so the `functionaltest` collision stops inviting the very misreading this mission began with.

**Deliverables produced this session (all additive, gate-neutral, product code untouched):**
- `governance/fitness/execution-plane-boundary-fitness.js` — tree-wide, self-proving execution-ownership fitness gate (PASS; external-validated against the EP).
- `governance/boundary/execution-plane-boundary-evidence.json` — machine-readable scan evidence.
- This certification report.

**Not done, by design:** no product code changed; no browser code "migrated" (none exists in IP to migrate); `run-all.js`/`proofs.json` not mutated (registration is a maintainer step, §7.1); no EP-IP-00x rule text authored (would duplicate the constitution — §7.2). No execution was simulated, mocked, or fabricated.

> **Closing statement.** The Intelligence Plane executes no browser automation. The sovereignty boundary between planning (IP) and execution (EP) is intact, is enforced by multiple independent and fault-proven mechanisms, and — with the one delivered tree-wide gate registered — will be enforced at the exact scope the constitution declares. The remediation this mission anticipated is not required, because the violation it presumed does not exist in the repository.
