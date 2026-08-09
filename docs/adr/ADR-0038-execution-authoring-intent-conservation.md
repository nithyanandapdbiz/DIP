# ADR-0038 — Execution-Authoring Intent Conservation & Package-Quality Governance

**Status:** PROPOSED · **Date:** 2026-07-28
**Raised by:** an Enterprise Architecture Review of the Intelligence Plane authoring pipeline, prompted by a live run in which **972 candidate tests entered authoring and the sealed Execution Package left the plane carrying one navigation operation, and the run certified successful.** The mandate was explicitly *not* to make that scenario pass, but to ensure it can **never happen silently again**, for every present and future tenant, without tenant-specific logic.
**Affects (proposes to amend, via the CHARTER §9 review pipeline):** [12](../architecture/12-capability-orchestration.md) §4.3 (add C-12.19), [18](../architecture/18-governance-model.md) §3 (package-quality certification), [20](../architecture/20-cross-plane-contracts.md) §2 (the disposition ledger and the operation-assertion constraint), and the implementation named in §8.
**Builds on / bounded by:** [ADR-0019](ADR-0019-evidence-over-assertion.md), [ADR-0020](ADR-0020-continuous-verification.md), [ADR-0021](ADR-0021-platform-core-bounded-context.md), [ADR-0022](ADR-0022-functional-testing-engine-internal-structure.md).
**Does not amend:** the six capabilities, three Platform Services, the twelve-stage lifecycle, the six canonical states, the SSOT, the AI boundary (R-13.1 — *AI generates material, deterministic code renders every decision*), or the cross-plane direction (R-05.1). This ADR **adds no capability** and **adds no AI**.

---

## 1. Problem

An Execution Package can leave the Intelligence Plane having **silently discarded the execution intent it was authored from**, and be **certified successful**. The reasons are structural:

1. The platform's enforcement prevents stage **bypass** (the typestate chain, C-12.1–C-12.5) and package **tampering** (signing, C-20.x) — but **not stage *degradation*.** A package that conserves zero intent is byte-for-byte indistinguishable, to every gate, from a rich one.
2. **[R-12.12](../architecture/12-capability-orchestration.md) already governs this** — *"A stage that legitimately performs no work SHALL return a typed not-applicable result carrying a reason. It SHALL NOT return an empty or default value."* — but has **no executable conformance criterion**, so it is prose, and the manufactured-navigate floor violates it directly.
3. **[R-03.9](../architecture/03-intelligence-plane-architecture.md)** (*deterministic result first; AI may never remove or override structure*) is violated: there is no deterministic author that conserves selected intent — there is a stub plus a fallback that *reduces* it.
4. **[R-12.14](../architecture/12-capability-orchestration.md)** (*a failed review produces a refusal, not a warning execution proceeds past*) is violated by the silent smoke fallback.
5. **[R-03.13 / C-03.8](../architecture/03-intelligence-plane-architecture.md)** (*one authoring path; no flag selects between paths; defaults are architecture*) is violated: `IP_AUTHORING` and `IP_FTE_OPS` select authoring paths, and the default is the degraded one.

This is the predecessor's most consequential failure class, named in Doc 18 §1 and Doc 12 §6: **controls that report rather than prevent.** The missing architectural concept is **intent conservation** — the property that every unit of selected execution intent is *accounted for* at authoring, so a reduction is either impossible or a loud, signed refusal.

## 2. Context — ground truth, traced end to end (evidence, not assumption)

Every finding was read from disk. The authoring path is two `.mjs` files wrapping the real Functional Testing Engine (capability 1).

| Observation | Location | Consequence |
|---|---|---|
| The 972 candidate tests are demoted to reuse-search **assets**; none can become an operation | `authoring-bridge.mjs:71` | Candidate intent can only *suppress* authoring, never *produce* it |
| Only `requirements[0]` drives authoring; the rest are dropped | `authoring-bridge.mjs:52` | Requirement intent is lost before Stage 7 |
| `navigate-safe` (the **default**) maps each authored test to one `navigate` with `target:''`, `expect:{page:''}`; real steps ride in non-executed metadata | `authoring-bridge.mjs:146,156-164` | Even a healthy N-test run emits N assertion-free no-ops |
| Zero authored tests → a **manufactured single navigate "floor"** | `authoring-bridge.mjs:167-169` (pre-change) | The exact producer of "one operation" |
| Any engine/bridge error → a **silent smoke fallback**, signed, HTTP 200 | `ip-execute-gateway.mjs:26-27,96-100` (pre-change) | A failure is indistinguishable from success on the wire |
| The Operation contract has **no assertion field**; `operations: z.array(...)` has **no `.min(1)`** | `packages/contracts/src/execution-package.ts:46-51,106` | A semantically empty package is schema-valid |
| The live gateway **never imports `@dbiz/contracts`**; the emitted shape does not match `ExecutionPackageSchema` | `ip-execute-gateway.mjs` | The frozen Doc 20 contract is bypassed on the wire (R-20.3 violated) |
| **No governance gate** measures authored-operation count, candidate coverage, assertion completeness or intent preservation; `verify-ep-certification.js` *trusts the EP's self-asserted `CERTIFIED` verdict* | `run-all.js`; `verify-ep-certification.js:81-84` | The 972→1 collapse certifies green |

There is **no LLM**, and this is correct — an inference SDK is forbidden by a passing conformance test (`packages/contracts/test/surface.test.ts:99-107`), and R-13.2 makes AI-disabled a supported mode. The defect is **not** AI hallucination; it is that the deterministic author is a template stub and **nothing conserves or measures intent across it.**

## 3. Alternatives

| Option | Assessment |
|---|---|
| Make the scenario pass (author real steps for this app) | **Rejected** — the mandate is explicitly *not* to fix one scenario; every other tenant stays exposed. |
| Add `.min(1)` to the operations schema | **Rejected as insufficient** — the floor already emits exactly one operation; a count floor is satisfied by a placeholder. |
| Certify on operation **count** thresholds | **Rejected** — gameable by the same placeholder; only conservation-against-selected-intent is meaningful. |
| Trust the EP's `CERTIFIED` verdict (status quo) | **Rejected** — verifying a self-asserted verdict's signature is annotation, not measurement (R-18.3, R-12.14). |
| **Intent conservation + disposition ledger + package-quality gate + refusal-over-placeholder (P-38)** | **Selected** — realises R-12.12/R-03.9/R-12.14 with an executable measurement; domain-agnostic; makes silent degradation structurally impossible. |

## 4. Decision

### 4.0 Governing principle — Authoring Intent Conservation (P-38)

> **P-38.** Execution authoring SHALL **conserve intent**. Every unit of selected execution intent entering Stage 7 SHALL leave it **accounted for** — realised as one or more executable operations, or recorded as an explicit **typed disposition carrying a reason** (`authored · reused · merged · refused · not-applicable`). A package whose accounted intent does not equal its selected intent is **not authorable**; the plane SHALL emit a **typed refusal** (`proceed:false` with a reason) and SHALL NEVER emit a reduced package as `proceed:true`. Conservation is **measured**, not asserted, and the measurement gates emission.

P-38 is the executable form of R-12.12 applied to authoring. Every clause below applies it.

- **4.1 Disposition ledger** (contract — Doc 20 §2, additive). Per selected candidate test, exactly one typed disposition `{ candidateRef, disposition, reason, operationIds[] }`, with the cardinality invariant **Σ dispositions == |selected candidate tests|**; every `authored`/`merged` disposition names the operations it produced.
- **4.2 Operation assertion completeness** (contract — Doc 20 §2, additive). A `proceed:true` operation set SHALL carry, per authored test, **≥1 assertion with a non-placeholder target**. An operation whose target and expectation are both empty is the empty/default value R-12.12 forbids and SHALL NOT satisfy the ≥1-operation floor.
- **4.3 Refusal over placeholder** (realises R-12.12). Nothing authorable → `proceed:false` + `refusalReason` (the refusal shape the contract already defines). The manufactured-navigate floor is **deleted**; the silent smoke fallback is **deleted** as a success path. An engine error is a **typed refusal**, never a signed success.
- **4.4 One authoring path** (realises R-03.13 / C-03.8). `IP_AUTHORING` and `IP_FTE_OPS` are **removed** as behaviour selectors. Where authoring depth is legitimately configurable (e.g. a coverage floor) it is **tenant configuration** (Doc 15), never an environment flag (R-13.11).
- **4.5 Package-quality certification gate** (governance — Doc 18 §3). Before a package leaves the plane it SHALL pass an executable gate measuring (a) conservation, (b) assertion completeness, (c) coverage ≥ tenant floor. A failing package is **refused, not emitted**. The gate is fault-proved (R-18.11) and, until authoring conforms, **left RED and escalated** (R-18.12); it is never edited to match non-conformant reality (P-002).
- **4.6 Per-stage intent telemetry as evidence** (Doc 10, R-18.7). Every authoring stage emits its intent counts in/out as evidence; a drop that emits no evidence did not happen honestly.
- **4.7 Canonical contract on the wire** (R-20.3). The live gateway authors and validates against the same `@dbiz/contracts` artefact both planes share.

### 4.8 Responsibility matrix

| Actor | Owns | Must never |
|---|---|---|
| **Authoring** (Stage 7) | A deterministic, intent-conserving operation set + disposition ledger; refuse when not authorable | Emit a reduced package as `proceed:true`; manufacture a placeholder; fall back silently |
| **Package-quality gate** | Measure conservation, assertions, coverage; refuse emission on failure | Trust a self-asserted verdict; pass a package it did not measure |
| **Gateway** (`/v1/execute`) | Validate against the canonical contract; sign what authoring produced; return a refusal on error | Author a fallback; return a signed success on failure |
| **AI runtime** | Additively enrich a conserved baseline (R-13.3), off by default | Produce the baseline; remove/override structure; reach a decision (R-13.1) |
| **Execution Plane** | Execute a `proceed:true` package or refuse a `proceed:false` one | Author, infer, or repair missing intent (R-2.1, R-04.1) |

### 4.9 Validation

| Criterion | Verified by |
|---|---|
| **C-12.19** (new) Σ dispositions == selected candidate count; every operation traces to a disposition | `verify-intent-conservation.js` — drives the real author and measures the authored package |
| **C-20.x** (new) A `proceed:true` operation set carries ≥1 non-placeholder assertion per authored test | schema + package-quality gate |
| Refusal, not placeholder, when nothing is authorable | negative test: zero-authorable context → `proceed:false` with reason |
| No flag selects an authoring path | single-path gate (C-03.8) |
| Canonical contract validated on the wire | consumer audit: gateway parses via `@dbiz/contracts` |
| Silent degradation cannot certify | the package-quality gate is RED against the current collapse and named in `run-all.js` |

Each criterion is added **with its gate and recorded fault proof in the same change** (R-13.4, CHARTER §18).

## 5. Consequences

**Positive.** Silent loss of execution intent becomes **impossible to emit as success**: it is either an authored, traced operation set or a signed refusal. The false-positive certification surface is closed at its root. The fix is **domain-agnostic by construction** — it serves Carlisle, OrangeHRM, Shoply and unknown future domains identically, because it measures conservation, not any tenant's specifics.

**Negative, accepted and escalated.** The intent-conservation gate (§4.5) is **RED on the current tree** — authoring genuinely does not conserve intent yet. Per R-18.12 it is **left red and escalated**, not softened. Because the fault-proof recorder defines a gate's "clean" run as the repository as it stands (`record-fault-proofs.js:927`), a gate honestly red-on-reality **also** turns `verify-governance-self-validation.js` red (its clean-pass proof cannot be genuine while the measured property is violated). **This is honest, not collateral:** the GCI *should* fall when a newly-declared enforceable property is unmet (R-13.5, R-14.5). Green is restored in Phase 2/3 when authoring conserves intent, at which point the gate passes clean and is fault-proved genuine in the same change (CHARTER §18). Restoring green by weakening the gate is prohibited (P-002).

**Risks and mitigations.**

| Risk | Severity | Mitigation |
|---|---|---|
| The refusal path breaks the live loop (EP expects `proceed:true`) | High | The EP contract already handles `proceed:false` (R-20.10, `execution-package.refusal.json`); a refusal is a valid signed package |
| A tenant coverage floor set so low the gate is decorative | Medium | The floor is tenant config with a platform minimum; `NOT MEASURED` coverage is `FAIL` (R-13.3) |
| "Intent" defined loosely and the ledger becomes theatre (R-15.1) | Medium | The cardinality invariant Σ dispositions == candidate count is mechanical |
| The escalated-red suite mistaken for a regression | Low | Recorded in `PROJECT_STATE.md` with blocker · impact · recommendation · next action (CHARTER §6/§13) |

**Governance impact.** Amends frozen Documents 12 (§4.3 — C-12.19), 18 (§3 — the package-quality gate), and 20 (§2 — the ledger and assertion constraint) through the §9 review pipeline. This ADR is the **proposal**, not the amendment, and freezes nothing. It **strengthens** governance by making an already-frozen rule (R-12.12) measurable and closing a false-positive surface. Decision-to-rule: P-38→(R-12.12); §4.3→(R-12.14); §4.4→(R-03.13/C-03.8); §4.7→(R-20.3/R-20.6); §4.5→(R-18.1/R-18.3).

## 6. Migration strategy

1. **Phase 1 (immediate — this change):** stop the false positive. Emit intent telemetry; add `verify-intent-conservation.js` as a **RED, escalated** gate; replace the silent smoke-200 with a typed refusal, and the manufactured-navigate floor with a refusal. The defect becomes loud; nothing is fixed by hiding it.
2. **Phase 2 (conformance):** one authoring path (delete `IP_AUTHORING`/`IP_FTE_OPS`); validate the canonical contract on the wire; fault-prove the gate genuine once authoring conserves intent.
3. **Phase 3 (depth):** wire candidate tests and all requirements into authoring; carry steps → operations; ground authoring in Stage-2 Discovery so operations target the real application surface; move thresholds and the coverage floor into tenant config.
4. **Phase 4 (hardening):** remove the `DBIZ_DEV_AUTH` and committed `mode:"live"` default risks; additive multi-provider enrichment, off by default.
5. **Phase 5 (certification):** re-cut the closure baseline to admit P-38 and the new criteria; the GA determination recomputes and can no longer go green on a hollow package.

## 7. Version impact

No contract **version** bump is required now. The disposition ledger (§4.1) and the operation expectation (§4.2) are introduced **additively**, under the unknown-field tolerance of R-20.4 — an older Execution-Plane consumer preserves and ignores them, so no existing consumer breaks. They become **required** content, and a `.min(1)`-style constraint becomes enforceable at the schema level, at the **next scheduled execution-package contract version** (a separate, versioned change under R-20.1). P-38, C-12.19 and the package-quality gate are governance and implementation additions and carry no contract-version implication. The AI boundary, the six canonical states and the twelve-stage lifecycle are unchanged, so no capability or Platform Service version is affected.

## 8. Affected components

- [12](../architecture/12-capability-orchestration.md) §4.3 · [18](../architecture/18-governance-model.md) §3 · [20](../architecture/20-cross-plane-contracts.md) §2 — **Modified** (proposed amendments via §9).
- `packages/functional-testing-engine/authoring-bridge.mjs` — **Modified** (intent-conservation telemetry; floor → typed refusal).
- `packages/tenant-onboarding-engine/ip-execute-gateway.mjs` — **Modified** (silent smoke fallback → typed refusal).
- `packages/contracts/src/execution-package.ts` — **Modified** (ledger + assertion, at the next contract version — Phase 3).
- `governance/verification/verify-intent-conservation.js` — **New**.
- `governance/capability/run-intent-conservation.mjs` — **New**.
- `governance/verification/run-all.js` — **Modified** (registers the gate).
- `governance/verification/record-fault-proofs.js` — **Modified** (ships the gate's fault-proof mechanism).

This IP-side ADR does not travel with any Execution-Plane change; the EP-side handling of `proceed:false` is a **separate Execution-Plane commit** (one plane, one commit — the container bootstrap §4).
