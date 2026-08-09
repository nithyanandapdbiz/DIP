# ADR-0066 — Canonical Functional Testing Workflow, Governance Agent & Constitution Enforcement

**Status:** Proposed
**Date:** 2026-07-30

> **AMENDMENT — Functional Workflow Constitution (2026-07-31).** The invariants this ADR establishes
> are now enforced as ONE executable governance layer: `governance/functional-workflow/functional-workflow-constitution.json`
> (fifteen rules across seven categories — architectural · EP/IP · FWC · deterministic · traceability ·
> certification · business) run by `governance/functional-workflow/constitution.mjs`
> (`npm run governance:workflow:constitution`, gating in CI). The Constitution is **the highest
> governance authority for the Functional Testing capability AFTER the published ADRs**: on any conflict
> an accepted ADR governs, then the Constitution, then implementation. **No change may violate a
> constitutional rule without (1) an explicit ADR, (2) a constitution version increment, and (3) a
> re-lock** (`constitution.mjs --relock`, which regenerates certification). The runner is checksum-locked
> (rules + runner sealed in `workflow-version.json.constitution`); a rule edited without the re-lock fails
> self-validation — that mismatch IS the violation. It aggregates existing enforcers (FWGA, the
> convergence auditor, the domain/boundary/activation/traceability gates); it introduces no new rule and
> changes no frozen artefact. Certification: `docs/functional-workflow/FUNCTIONAL-WORKFLOW-CONSTITUTION.md`.

> **AMENDMENT — Workflow v2.0.0 (2026-07-30): FT-001..FT-025 → FT-001..FT-037.** Under the
> change-class policy this ADR establishes (§4.2), a change to the step set is a **breaking** change
> requiring Architecture-Board authority + a new MAJOR workflow version + a re-lock. The Platform
> Governor authorised **workflow v2.0.0**, a finer-grained re-partition of the SAME lifecycle onto the
> SAME thirteen certified domains (healing split 1→3, automation authoring 3→5, test-management
> publication 1→4, and explicit AI-Review / Failure-Intelligence / Metrics steps). It adds **no** stage
> type, domain, capability or engine, and does **not** change EP/IP ownership, security, sovereignty or
> execution semantics. v1.0.0 is **superseded, not deleted** (recorded in `workflow-version.json`
> `versionHistory`); the FWGA — made step-count-agnostic — enforces the currently-LOCKED version and
> was re-locked to v2.0.0 (certify + self-proof green). The 37-stage projection, ownership matrix,
> component/connector mapping, orchestrator/state-machine/resume design, security review and
> certification criteria are in [`../functional-workflow/FT-V2-37-STAGE-WORKFLOW.md`](../functional-workflow/FT-V2-37-STAGE-WORKFLOW.md).
> Everything below (authored for v1.0.0) remains the governing decision; only the step count and its
> mapping are amended by this banner.

> **Renumbered from ADR-0064 (2026-07-30, CLAUDE.md §5 — preserve the single source of truth).**
> This decision was first authored as ADR-0064. Disk reconciliation found `ADR-0064` and
> `ADR-0065` already committed at HEAD by a concurrent workstream
> (`ADR-0064-closed-loop-evidence-intelligence`, `ADR-0065-ai-proposal-exchange`; both deleted in
> that workstream's working tree). To avoid a two-ADR-0064 collision, this ADR moved to the free
> number **0066**. The concurrent workstream owns 0064/0065; final numbering across both
> workstreams is a merge-time coordination item recorded in `PROJECT_STATE.md` / `NEXT_ACTION.md`.

---

## 1. Problem

The Functional Testing capability is fully implemented and certified: one public command
(`npm run functionaltest`), one lifecycle (the twelve constitutional stages, Doc 12), one
composition (the thirteen ADR-0039 domains in `CANONICAL_DOMAIN_SEQUENCE`), one Decision Engine,
one Connector SPI boundary, one sealed ExecutionPackage, and a per-domain governance gate for
each of the thirteen domains. Two things did not exist:

1. A single machine-readable statement of the **business workflow** — the twenty-five
   operator-facing steps FT-001 → FT-025 — bound to those certified owners.
2. A mechanism that makes that workflow the **constitution**: one that **rejects any future
   implementation, runtime, agent, connector, PR, review, certification or release that
   deviates** from the ordered workflow, enforced at author time, at runtime, and in CI — not
   as prose.

Without (1)+(2), "one and only one functional testing workflow" is an intention enforced by
habit. A prose constitution is the declared-but-unenforced failure class this programme exists
to prevent: nothing turns a build red — or stops a run — when a step is skipped, reordered,
inserted, merged, split, deleted, or moved to the wrong plane.

## 2. Context

- **The lifecycle already has a canonical owner** (Doc 12, R-12.1; ADR-0039 +
  `canonical-capability.ts`). The workflow definition must be **subordinate** — a projection
  that references those owners and restates none of them (CHARTER §4, R-12.18). It adds no
  stage, domain, capability or rule.
- **Business order and composition order legitimately differ** (the composition resolves
  `application-strategy-resolution` before `story-intelligence` for data-flow; the operator
  reads the story before discovering the application). Both are certified. Enforcement is on
  **constitutional phase order** (author → execute → evidence → interpret, R-12.5) and
  **thirteen-domain completeness**, not step-to-composition index equality.
- **Governance is self-proving, not prose.** Every `run-all.js` gate carries a fault-injection
  proof (R-13.4); `verify-governance-self-validation.js` requires every registered gate proven
  and every gate on disk registered. A registration into that suite regenerates the whole proof
  registry (re-runs every fault), which is heavy and, during concurrent churn, unsafe.
- **The EP/IP boundary is frozen and absolute (CLAUDE.md §4).** `npm run functionaltest` is the
  **Execution-Plane** command; the FWGA and the constitution live in the **Intelligence Plane**.
  The EP may not reference the IP's filesystem, and no change may span both planes. Runtime
  enforcement must therefore be **in-plane on each side**, coupled only through declared
  contracts — never a cross-plane path.

## 3. Alternatives

1. **A new authoritative workflow/lifecycle document.** Rejected — a second source of truth for
   the lifecycle; inverts precedence (CCLS-001 finding).
2. **Re-verify each step's behaviour in the agent.** Rejected — duplicates the thirteen
   per-domain gates. The agent certifies the *projection*, not domain internals.
3. **Make the EP command load the IP's FWGA directly.** Rejected — a cross-plane filesystem
   reference (CLAUDE.md §4 violation). Enforcement is in-plane; the EP is gated transitively
   because it cannot execute without an IP-authored package the IP now guards, and its own
   preflight consumes a **distributed** copy of the constitution (a governed contract), never
   the IP path.
4. **Register the gate into `run-all.js` + regenerate `proofs.json` now.** Rejected *for this
   change* — the working tree carries 47 files of concurrent churn across every package; the
   recorder temporarily patches `dist/src` files that churn is editing. Registration is
   **authorised here** and specified in the implementation plan, to run under quiescence.
5. **A subordinate canonical workflow + a self-proving Workflow Governance Agent that is also a
   runtime preflight and a proofs-independent CI gate, with workflow version governance.**
   **Chosen.**

## 4. Decision

Establish, as **subordinate governance artifacts**, one canonical Functional Testing Workflow,
one agent that governs it, and the enforcement that makes it the platform constitution:

1. **Canonical workflow definition** — `governance/functional-workflow/functional-workflow.canonical.json`.
   Machine-readable SSoT for FT-001 → FT-025; `authority: SUBORDINATE`, `immutable: true`.
   Binds each step to its constitutional stage, canonical domain, plane owner, gate(s) and
   architecture reference. Introduces no stage/domain/capability/rule.

2. **Workflow version governance** — `governance/functional-workflow/workflow-version.json`.
   The workflow carries a **version (1.0.0)** with status **LOCKED**, a governing **authority**
   (Architecture Board · Chief Architect · QA Practice Lead · Security Architect), a **checksum**
   of the canonical definition, and a **change-class policy** (breaking → board approval; minor →
   governance approval; patch → FWGA approval). No step may skip/reorder/duplicate/merge/split/
   insert/delete unless a new **constitutional workflow version** is approved and re-locked.

3. **Functional Workflow Governance Agent (FWGA)** — `governance/functional-workflow/fwga.js`.
   It **governs the workflow; it performs none of it** (generates no test, executes no
   Playwright, creates no defect, writes no product code). It verifies the eighteen mandated
   responsibilities (version · checksum · sequence · missing/duplicate/inserted/deleted steps ·
   EP/IP ownership · security ownership · traceability · connector ownership · architecture refs ·
   canonical-domain mapping · governance refs · ADR refs · registered-capability mapping ·
   execution authorization · completion), derives its ground truth from disk
   (`CANONICAL_DOMAIN_SEQUENCE`, `run-all.js`), and **self-validates first** (its own checksum,
   version and integrity, and its canonical workflow) before validating anything. It emits a
   **Workflow Compliance Certificate** and is **self-proving** (R-13.4): `--selftest` plants
   reorder/skip/insert/mis-own/invented-domain/broken-traceability and proves each is rejected
   and named, and the clean workflow accepted.

4. **Runtime enforcement (in-plane, both planes).** The IP orchestration launcher
   (`packages/functional-testing-engine/canonical-functionaltest.mjs`) runs an additive FWGA
   **preflight** — *Load Canonical Workflow → FWGA self-validation → Workflow Integrity
   Verification → Execution Permission* — **before** any composition/authoring. On failure it
   **refuses and exits non-zero before FT-001**, authoring nothing. The preflight can only
   refuse; it changes no workflow step, no domain, and no EP/IP ownership. The EP is gated
   transitively (verify-before-execute: no IP-authored package ⇒ EP halts); the EP's own local
   preflight against a **distributed** constitution copy is a separate EP-plane change (ADR-0011
   contract distribution), recorded, not made cross-plane here.

5. **CI/PR enforcement (proofs-independent + gating registration).** A proofs-independent CI
   job and npm script run the FWGA on build/test/certification/release, blocking on failure —
   this does not touch the frozen `proofs.json` baseline. Additionally, registering a thin
   `verify-functional-workflow-conformance.js` gate into `run-all.js` (with its fault proof) is
   **authorised**, to be applied under concurrent quiescence (implementation plan). A PR
   Workflow Impact Assessment contract declares affected steps / added / removed / reordered /
   ownership-changed / security-changed / traceability-changed / constitution PASS-FAIL.

6. **Agent declaration.** Every IP agent, EP component, connector and orchestration stage
   SHALL expose workflow metadata (WorkflowVersion · CurrentStep · PreviousStep · NextStep ·
   Plane · Domain · Capability · InputContract · OutputContract · TraceabilityId); the FWGA
   validates declarations against the canonical definition.

7. **Binding rule.** From acceptance, every functional-testing implementation, runtime, agent,
   connector, feature, PR, review, certification and release SHALL conform to FT-001 → FT-025.
   The workflow is the **source of governance**; the repository remains the **source of
   implementation**. Deviation is rejected.

This decision **changes nothing** about the architecture, the twelve stages, the thirteen
domains, the EP/IP boundary, the security model, data sovereignty, zero-trust, execution
semantics, or any existing implementation. It adds a governance projection, its enforcing agent,
and the runtime/CI/version scaffolding around the *existing* workflow.

## 5. Consequences

**Positive.** The workflow becomes the enforced constitution: one machine-readable definition, a
self-proving+self-validating agent, a runtime preflight that stops a violating run before FT-001,
proofs-independent CI gating, version governance with a locked checksum, and a PR contract. "One
and only one functional testing workflow" becomes evidence at author time, runtime and CI.

**Cost / limits (stated honestly, R-13.3).** Until the `run-all.js` gate is registered (the
authorised quiescence-gated step), the self-validation suite does not yet include the FWGA — CI
enforcement runs via the dedicated proofs-independent job in the interim. The EP-side local
preflight requires the constitution to be distributed to the EP as a governed contract (separate
EP-plane change). The FWGA certifies the projection + declarations, not domain internals (the
thirteen per-domain gates) nor operational GA (external, NOT MEASURED). PROPOSED until accepted.

## 6. Migration strategy

Additive and reversible; replace-before-remove not engaged (nothing replaced). (1) Author the
definition, version governance, the enhanced+self-validating FWGA, the launcher preflight, the
CI job/scripts, the agent-declaration contract and the deliverable specs — **done in this
change**; FWGA certify + self-proof + self-validation green. (2) Accept this ADR (Architecture +
Governance + Security review, CHARTER §9); advance the definition/version status to LOCKED-active.
(3) Under concurrent quiescence, register `verify-functional-workflow-conformance.js` into
`run-all.js`, add its `record-fault-proofs.js` entry, regenerate `proofs.json`, confirm
`verify-governance-self-validation.js` green. (4) Distribute the constitution contract to the EP
and add the EP local preflight (separate EP-plane change). Rollback is deletion of the additive
files + reverting the launcher preflight guard; no certified artifact depends on them.

## 7. Version impact

No contract, schema or wire-format version changes. No architecture document changes (Doc 12,
Doc 11, ADR-0039 referenced, not amended). The **workflow** gains an explicit governed version
(1.0.0, LOCKED). `run-all.js` / `proofs.json` are unchanged by this ADR and change only at the
authorised registration step.

## 8. Affected components

- `docs/adr/ADR-0066-functional-workflow-governance.md` — **New** (this ADR; supersedes the
  ADR-0064-numbered draft, which is removed).
- `governance/functional-workflow/functional-workflow.canonical.json` — **Amended** (subordinate SSoT; `governedBy` → ADR-0066).
- `governance/functional-workflow/workflow-version.json` — **New** (workflow version governance + checksum).
- `governance/functional-workflow/fwga.js` — **Amended** (version/checksum/self-validation + the eighteen responsibilities; runtime-preflight entry).
- `governance/functional-workflow/agent-workflow-declaration.schema.json` — **New** (agent metadata contract).
- `governance/functional-workflow/workflow-compliance-certificate.json` — **New** (generated evidence).
- `packages/functional-testing-engine/canonical-functionaltest.mjs` — **Amended** (additive FWGA runtime preflight; refuses before FT-001; no business logic changed).
- `.github/workflows/functional-workflow-governance.yml` — **New** (proofs-independent CI gate).
- `package.json` — **Amended** (`governance:workflow` script).
- `docs/functional-workflow/FUNCTIONAL-TESTING-LIFECYCLE-SPECIFICATION.md` — **New**.
- `docs/functional-workflow/WORKFLOW-GOVERNANCE-SPECIFICATION.md` — **New**.
- `docs/functional-workflow/WORKFLOW-COMPLIANCE-MATRIX.md` — **New**.
- `docs/functional-workflow/REPOSITORY-MAPPING.md` — **New**.
- `docs/functional-workflow/GAP-ANALYSIS.md` — **New**.
- `docs/functional-workflow/FWGA-DESIGN.md` — **New**.
- `docs/functional-workflow/IMPLEMENTATION-PLAN.md` — **New**.
- `docs/functional-workflow/WORKFLOW-COMPLIANCE-CERTIFICATION.md` — **New**.
- `docs/functional-workflow/CONSTITUTION-ENFORCEMENT-REPORT.md` — **New**.
- `governance/functional-workflow/verify-functional-workflow-conformance.js` — **New** (staged run-all wrapper).
- `.github/pull_request_template.md` — **New** (Workflow Impact Assessment).
- `program/DECISIONS.md` — **Amended** (ADR-0066 index row).
- `packages/functional-testing-engine/src/canonical-capability.ts` — **Referenced, unchanged** (source of `CANONICAL_DOMAIN_SEQUENCE`).
- `governance/verification/run-all.js` — **Referenced, unchanged** (registration is the later authorised step).
