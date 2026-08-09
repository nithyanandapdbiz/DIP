# ADR-0087 — Removal of the Functional Testing Capability

**Status:** **ACCEPTED** · **Date:** 2026-08-07. This ADR records the removal of capability 1, the Functional Testing Engine, from the Intelligence Plane in full: the package, its thirty-two governance gates, its workflow constitution, and its entry in the capability model. It amends the frozen **R-11.4** cardinality from six capabilities to five.

> **Directive note (CLAUDE.md §5 — the repository governs).** This removal was **directed by the programme owner** and executed on that authority. It does **not** satisfy the preconditions the repository already set for it, and this ADR does not pretend otherwise. [ADR-0046](ADR-0046-legacy-functional-pipeline-retirement.md) governs retirement of this capability and gates it on production operation, a completed stability window, an expired rollback window, and governance + stakeholder + executive approval. **None of those conditions hold.** ADR-0046 §3 lists "delete legacy now" as alternative 1 and **rejects it** — in the same terms this change makes real: it destroys the rollback path before any production validation, and it turns many governance gates red. The owner was shown the blast radius before execution and confirmed the removal. That is recorded here as a **directed supersession of ADR-0046**, not as a satisfied precondition, because the difference is the whole of the audit trail.

## 1. Problem

The programme owner directed that the Functional Testing capability be removed in full, together with everything that depends on it, leaving the remaining capabilities unaffected.

## 2. Context

The Functional Testing Engine was capability 1 of the frozen six (R-11.4) and by a wide margin the most governed component in the plane. On disk at removal:

- `packages/functional-testing-engine/` — 400 files, 300 tests.
- **Thirty-two** registered governance gates, including the fourteen ADR-0039/ADR-0075 per-domain gates and the ADR-0044/0045/0046/0048/0050/0077 lifecycle gates.
- `governance/functional-workflow/` — the ADR-0066 workflow constitution (FT-001…FT-037) and the FWGA, whose canonical source was `CANONICAL_DOMAIN_SEQUENCE` inside the engine.
- A dedicated CI workflow, and seven `governance:workflow:*` root scripts.

**No other package declared a dependency on `@dbiz/functional-testing-engine`.** The code graph therefore unwired cleanly; the cost of this change was almost entirely in governance, not in code.

## 3. Alternatives

1. **Refuse until ADR-0046's preconditions hold.** Correct on the repository's own terms, and rejected only because the owner holds the authority to supersede a decision this plane recorded. Recorded here so that the refusal case is visible rather than absent.
2. **Delete the package, leave the governance scaffolding.** Rejected: forbidden by CHARTER §17.1.1(ii). Thirty-two gates would either throw or go **green-by-absence** — the latter being worse, since a suite reporting green over a capability that no longer exists asserts a guarantee the platform does not have.
3. **Delete the capability and retire every control whose subject it was; renumber 2–6 to close the gap.** Rejected on the renumbering only — see §4.
4. **Delete the capability, retire its controls, preserve the survivors' numbers (chosen).**

## 4. Decision

Remove the capability and everything whose **subject** was the capability; keep everything whose subject is not.

**The classification is CHARTER §200's, applied to every reference before anything was deleted** — dangling path, expired justification, or historical record already in the past tense.

- **Removed:** the package; the fourteen per-domain gates; the seven lifecycle gates; `verify-execution-contract`, `verify-package-governance` and `verify-reasoning-registry` (each imported `dist/src/index.js` and drove `authorViaFTE` — their labels named the platform, their subject was this capability, which is §17.1.2's exact trap); `capability-conformance`, `functional-completeness`, `intent-conservation`, `automation-executable`, `repository-handoff`, `automation-architecture`, `functional-workflow-substructure`, `domain-stage-ref`; the workflow constitution; the FTE evidence set and runners; the CI workflow; the root scripts.
- **Kept:** the ADR-0040 platform-contract gates and `verify-provider-platform`, which name `functional-testing` only inside **FORBIDDEN regexes** asserting that *other* components stay capability-neutral. Those are guards on their own subjects; the token is one alternative among many, and dropping it would weaken a live control still governing capabilities 2–6. Also kept: `verify-suite-integrity` (subject: the workspace suite) and `@dbiz/capability-framework` (used by all five survivors).
- **Kept as history:** past-tense records in `packages/contracts/src/signature.ts` and the retired-gate blocks in `run-all.js`. §200 requires no work on these.

**R-11.4 is amended: five capabilities, not six.** The literal `6` was compared against in `run-platform-certification.mjs` (P-4, S-1), three capability conformance runners (P-10/PP-10) and `verify-architecture-fitness.js`; each was amended to `5`. A `.length` that silently changed under gates still asserting `6` would have turned the certification suite red for a reason none of them named.

**The survivors keep their numbers, and the list starts at 2.** A capability number is an **identity**, not a position: it is cited verbatim by the certification reports, the evidence JSONs and the ADRs. Renumbering to close the gap would silently re-point every one of those citations at a different capability — a worse defect than a list beginning at 2, and one that no gate would catch.

## 5. Consequences

**Accepted, and stated rather than minimised:**

- **The rollback path is gone.** ADR-0046's central objection was that deletion is one-way and unrecoverable. It is. Recovery is possible only from git history — commit `a7821fd` is the last commit in which the capability exists.
- **ADR-0044, ADR-0045, ADR-0046, ADR-0048, ADR-0050, ADR-0061, ADR-0066, ADR-0069, ADR-0077 and the ADR-0039/0075 domain series are superseded in their operative parts.** They are **not** deleted: they are the record of how this capability was built and certified, and CHARTER §200 classifies them as historical record. A reader must know they describe a capability the platform no longer has.
- **The platform no longer answers "does the application behave as specified?"** That was capability 1's question in document 11 §2. No survivor answers it, and none was extended to.
- The Execution Plane is **untouched**. `carlisle-homes/src/functional-testing/**` remains, and entries naming it in `governance/capability/sovereignty-register.json` are left as they are — the EP is customer-owned and a cross-plane edit is forbidden (CLAUDE.md §4). **The two planes are now inconsistent about this capability, and that inconsistency is real work, not an oversight of this change.**

## 6. Migration strategy

**There is no migration path, and that is the honest statement rather than an omission.** Nothing consumed capability 1 in-process: no package declared `@dbiz/functional-testing-engine` as a dependency, so no caller had to be moved. The capability's *function* is not migrated anywhere — no survivor was extended to answer its question.

| Concern | Path |
|---|---|
| Recovery of the capability | `git checkout a7821fd -- packages/functional-testing-engine` — the last commit containing it. The thirty-two gates and the workflow constitution are recoverable from the same commit. |
| Consumers to repoint | None. The dependency sweep found no in-process consumer. |
| Data migration | None. The capability held no persistent store; its outputs were sealed packages and evidence references, already at rest under the platform stores that survive. |
| Execution Plane | **Not migrated, and deliberately untouched.** `carlisle-homes/src/functional-testing/**` still exists and still expects an authoring counterpart in this plane. Closing that gap is real work and is recorded in the debt register, not resolved here. |

## 7. Version impact

**Breaking, at the platform level.** The frozen R-11.4 cardinality changed, which is a breaking change to the architecture baseline rather than to a published package interface.

| Surface | Impact |
|---|---|
| `@dbiz/functional-testing-engine` | **Removed.** Was `private: true` and never published. |
| `@dbiz/capability-framework` | **Breaking.** `TestDesignSyncAdapter`, `TestCaseSpec`, `SyncedTestCase`, `DesignAttachmentRef`, `registerTestDesignSync` and `resolveTestDesignSync` are removed from the public surface. All fifteen of that SPI's methods were invoked only from capability 1, and no survivor implemented the interface. |
| `@dbiz/contracts` | **None.** No contract shape changed. |
| Architecture baseline | **Breaking** — R-11.4 six → five; closure baseline re-emitted, 78 gates → 46. |
| Wire/API surface | **None.** No route, schema or published contract changed. |

## 8. Affected components

| Component | Change |
|---|---|
| `packages/functional-testing-engine/` | Deleted (400 files, 300 tests) |
| `governance/verification/` | 32 gates removed; retirement recorded in `run-all.js` |
| `governance/functional-workflow/` | Deleted — the ADR-0066 workflow constitution and FWGA |
| `governance/capability/` | FTE evidence set and runners removed; capabilities 2–6 untouched |
| `governance/platform-certification/capabilities.mjs` | Capability 1 entry removed; survivors keep their numbers |
| `packages/capability-framework/src/adapters.ts` and `packages/capability-framework/src/index.ts` | `TestDesignSyncAdapter` and its types removed |
| `packages/platform-providers/src/storage/run-record-store.ts` | Expired present-tense justification rewritten to past tense (§17.1.3) |
| `packages/contracts/test/sovereignty-contracts.test.ts` | Fixture `producer` repointed off the deleted tree |
| `docs/architecture/11-capability-model.md` | R-11.4/R-11.5/R-11.6/C-11.10 amended six → five |
| `.github/workflows/`, root `package.json` | FTE CI workflow and seven `governance:workflow:*` scripts removed |
| `governance/verification/suite-totals.json` | 300 → 0, recorded as a package removal |

**Known residue, not silently absorbed:** `TestManagementAdapter.discoverContainer` and `.discoverGrouping` are now declared with no invoker, so `verify-devchange-conformance` and `verify-discovery-conformance` are RED on one property. They are **ADR-0085's** reuse-or-create reads, not Functional Testing surface, and removing them would delete an accepted mechanism belonging to tenant onboarding. That is a separate architectural decision and is left open deliberately.

## 9. Traceability

| Concern | Reference |
|---|---|
| Amended | `docs/architecture/11-capability-model.md` §2 (R-11.4, R-11.5, R-11.6, C-11.10) |
| Supersedes | ADR-0046 §4 (directed, preconditions unmet), ADR-0044, ADR-0045 |
| Retirement record | `governance/verification/run-all.js` — the thirty-two gates, by class, with what was deliberately kept |
| Suite lock | `governance/verification/suite-totals.json` — 300 → 0, recorded as a package removal |
| Charter | §17.1.1 (subject-removal test), §17.1.2 (what the subject was), §17.1.3 (expired justifications), §200 (enumeration is the obligation) |
