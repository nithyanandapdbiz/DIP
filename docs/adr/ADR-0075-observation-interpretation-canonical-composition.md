# ADR-0075 — The canonical runtime performs the interpretation it certifies

**Status:** PROPOSED · **Date:** 2026-08-05
**Supersedes:** nothing · **Amends:** ADR-0039 §4.4 (thirteen domains → fourteen), ADR-0044 AC-3/AC-4 (the certified composition), ADR-0066's canonical workflow manifest (v2.3.0 → v2.4.0) · **Extends:** ADR-0069 P-69.2

## 1. Problem

**A domain that owns five interpretation capabilities is not in the runtime that certifies the work those capabilities decide.**

`observation-interpretation` was built to close nine PLANE-SOVEREIGNTY-AUDIT findings (V-03, V-04, V-08–V-12, V-18, V-26) by moving interpretation out of the customer's tenancy and into the Intelligence Plane. It is constructible, `v1.0.0`, declares six certification criteria, and is **not in `CANONICAL_DOMAIN_SEQUENCE`** and not composed into either canonical entry point.

**The consequence is not that a module is unused. It is that the canonical runtime receives an interpretation it did not make and cannot audit.**

```
CanonicalCapabilityInput.requirement.rawAcceptanceCriteria : readonly string[]   ← already split
story-intelligence:135  acceptanceCriteria = req.rawAcceptanceCriteria.map(normalise).filter(…)
```

The audit's own statement of why V-08 matters is *"the number of criteria IS the coverage denominator"* — every coverage figure the platform reports is a ratio whose denominator is this count. **On the canonical path that count is set before the composition starts**, by whatever implements `TranslationProviders.fetchRequirement`, and no domain in the sequence can see the text it came from. A pre-split array and a split array are the same type, so nothing in the composition — no gate, no test, no reviewer reading the code — can tell which one arrived.

**Three of the five capabilities have a caller; two have none.** `decomposeAcceptanceCriteria` runs on the agent path (`agents/story-and-test.ts:21`) and in `authoring-bridge.mjs:40`, alongside `classifyArtefact`. `describeCriterion`, `extractReferences` and `assessCompleteness` have **no caller in this repository**. V-09, V-10 and half of V-11 were closed by moving code into the right plane, and nothing has executed it since.

## 2. Context

**This is a sovereignty question, and it was mistaken for a reachability one.** ADR-0069 P-69.2 originally named `observation-interpretation` as a capability retirement would lose. That was measured and corrected: `authoring-bridge.mjs:40` imports it directly, so it survives ADR-0061 §6 step 6 re-pointing untouched. **It is not at risk from retirement, and it is still not in the canonical runtime** — two different problems that P-69.2 conflated, recorded in `TECHNICAL_DEBT.md` D-018 and ruled in `PROJECT_STATE.md` §9.3.

**What the port must not become.** `RETIREMENT_RESOLUTION_REGISTER.md` §7 records the shape of a port that satisfies its own paperwork: eleven `continuousLearningAgents` ported into a runtime with no consumer of learning output — accepted deliberately, with the gap **named** rather than discovered later. A fourteenth domain that runs and whose output nothing reads would be that outcome by construction. **The port is only real if something in the sequence consumes the interpretation.**

**What it must also not become.** Section C's register records the opposite failure: inventing platform structure as a side effect of a port. Wiring completeness signals into `executive-reporting` or criterion structure into `test-design-intelligence` is designing those domains, and doing it inside a port is how ADR-0072 acquired a scope nobody could see (`TECHNICAL_DEBT.md` D-057).

**The composition can carry the facts; it cannot yet carry the contract.** The sovereignty register declares this domain's input contract as `dbiz.observation-set@1`. The type it actually consumes — `ObservationInterpretationInput` — is a flattened shape that assumes someone has already decided which work-item field is the acceptance criteria. **That decision is tool-schema knowledge**, and making it inside a composition would place a connector's field names in the runtime. The gap is real and is named here rather than closed.

**No frozen architecture document is affected.** Verified by search: no document in `docs/architecture/` enumerates a canonical domain id. The thirteen live in ADR-0039 §4.4 and in `CANONICAL_DOMAIN_SEQUENCE`, and this ADR amends the first and changes the second.

## 3. Alternatives

- **Leave it outside the sequence; the audit findings are closed by the plane move alone.** REJECTED. The findings are about *where interpretation happens*, and the canonical runtime is where the platform's work now happens. A capability in the right plane and the wrong runtime satisfies the audit's letter while the certified path still consumes an interpretation made elsewhere. It is also the position that has held since 2026-08-04 and it is what this ADR exists to end.
- **Compose it as a fourteenth domain and wire no consumer.** REJECTED — §7's outcome chosen on purpose rather than inherited. It would add a domain whose certification criteria are declared, whose output is discarded, and whose presence in the sequence would read as evidence that the canonical path interprets. That is worse than the current state, because it is the current state wearing a composition.
- **Consume `dbiz.observation-set@1` end to end, mapping the customer's work-item fields onto the domain's input.** REJECTED for this ADR, and named as the next question. The mapping is tool knowledge, it needs a home that is neither the composition nor the customer's tenancy, and settling it inside a port is exactly the accident this programme keeps recording.
- **Fold `decomposeAcceptanceCriteria` into `story-intelligence` and delete the domain.** REJECTED on two grounds. It puts the interpretation inside the reasoner that consumes it — the shape R-12.2's review stages exist to prevent, one level down — and it creates a second splitter beside the one the agent path and the bridge already call. **Two splitters are two coverage denominators**, which is the defect V-08 named, rebuilt inside the Intelligence Plane.
- **Keep `rawAcceptanceCriteria` beside the new raw text, for a transition.** REJECTED. Two sources for one fact is CHARTER §4, and the one that requires no work is the one that survives. D-018 — structural impossibility over a test — decides it: the consumer must not be able to see the unsplit text.

## 4. Decision

**P-75.1 — `CANONICAL_DOMAIN_SEQUENCE` becomes fourteen ids, with `observation-interpretation` third.**

```
tenant-resolution → application-strategy-resolution → observation-interpretation → story-intelligence → …
```

Third, not first: interpreting a customer's story before `tenant-resolution` has established entitlement performs the work the entitlement check gates. Third, not later: `story-intelligence` is its consumer.

**P-75.2 — The Execution Plane's facts enter the composition as facts.** `RequirementInput.rawAcceptanceCriteria: readonly string[]` is **removed**. `CanonicalCapabilityInput` gains `observation`, carrying `acceptanceCriteriaText`, `commentText`, `artefacts` and `linkCounts` — exactly what the domain's input type already declares, and nothing invented beside it. After this change **no type reachable from `story-intelligence` carries the unsplit text**.

**P-75.3 — `story-intelligence` derives its acceptance criteria from the interpretation.** `StoryIntelligenceInput` gains `interpretation: ObservationInterpretationResult`. The coverage denominator is therefore set inside the composition, by a domain that declares `determinism: 'deterministic'` and carries certification criteria, and it is auditable from the run's own result.

**P-75.4 — The empty-criteria refusal stays in `story-intelligence`.** One cause is reported once, by the domain whose own output is derived from the empty set (`story-intelligence.ts:196`). A domain that correctly interprets empty text as zero criteria has not failed, and a second report of one cause turns `CertificationVerdict.reasons` into a list of echoes.

**P-75.5 — Four capabilities are composed and unconsumed, and they are NAMED.** Criterion Structure (V-09), Artefact Classification (V-11), Reference Extraction (V-11) and Story Completeness (V-10) are produced by the canonical run and read by no domain in the sequence. Their register-declared consumers are `story-review` (which does not exist on the canonical runtime), `test-design`, `coverage-measurement` and `executive-reporting`. **This is a named gap on the §7 precedent, not a silence, and it is not closed by this ADR.**

**P-75.6 — The workflow manifest re-binds FT-004 and takes a MINOR version.** `FT-004 Acquire Story` is `plane: EP->IP`, `stage: 3 (Context)` and is bound to `story-intelligence`, which declares `planning` and composes fourth. It re-binds to `observation-interpretation` — the domain that performs the Intelligence Plane's half of the EP→IP handover. `functional-workflow.canonical.json` goes **v2.3.0 → v2.4.0** with a re-lock. **No constitutional step is added, removed, renamed or reordered**; one binding is corrected and one domain is added to the projected sequence.

**P-75.7 — The domain enters the sequence with its own gate and a recorded fault proof.** Thirteen composed domains have a per-domain gate; the fourteenth lands with `verify-observation-interpretation-domain.js`, registered in `run-all.js`, with its proof recorded in the same change (CHARTER §18).

**P-75.8 — The declared input contract remains unmet, and says so.** The sovereignty register declares `dbiz.observation-set@1`; the composition supplies a flattened projection of it. This ADR closes the composition gap and **records the contract gap as open**.

## 5. Consequences

**What becomes true.** The canonical runtime performs the decomposition that sets its own coverage denominator; a run's result carries the interpretation it reasoned from; and the two capabilities that had no caller anywhere (`describeCriterion` via criterion structure, `assessCompleteness`) execute on every canonical run.

**What becomes visible.** The four unconsumed capabilities are now measurable as unconsumed — eleven ported agents producing into nothing is a finding, whereas eleven deleted ones are an argument nobody can have (§7's reasoning, applied to four capabilities instead of eleven).

**What gets harder.** Every consumer of `CanonicalCapabilityInput` must supply the observation. That is one production translator (`execution-request-translator.ts`), one reference input and fifteen test fixtures — and it is the intended cost: a caller that cannot supply the text cannot supply a denominator either.

**What does not change.** No `@dbiz/contracts` type, so `verify-contract-compatibility` has nothing to compare — measured before and after, not assumed. No plane boundary moves: this composes an existing IP-resident domain into an IP-resident composition, opens no connection (R-3.2) and holds no credential (R-3.3). No capability is added — R-11.4 stands at six; a domain is an internal unit of capability 1 (R-11.6).

**A risk this ADR accepts.** `assessCompleteness` runs over facts the composition may receive as empty lists, and an absent signal then reports as *absent* rather than *not observed*. This is the reach-versus-refuse distinction ADR-0074 drew for reads, arriving in a third place; it is not repaired here, and it is recorded as debt at the port rather than presented as a completeness assessment.

## 6. Migration strategy

**One change, no window, no flag** — the composition is internal to the Functional Testing package and no external consumer constructs `CanonicalCapabilityInput` today (`fetchRequirement` has exactly one implementation in the tree, and it is a test fixture).

1. Domain into both compositions through the shared binder, so the surface cannot be half-applied (F3's `designSyncConnector` precedent).
2. `RequirementInput` loses the split array in the same commit as the observation member arrives — never both.
3. The gates move 13 → 14 in the same change as the sequence: `verify-capability-activation.js`, `fwga.js`, the manifest, `run-functional-completeness.mjs`'s out-of-scope declaration.
4. The manifest is re-locked as a governance action, and the FWGA's own checksum with it.
5. `RETIREMENT_RESOLUTION_REGISTER.md`'s closing note — *"Section D ports it on the first ground"* — is discharged and marked as such.

**Rollback** is a revert: nothing is deleted, no data migrates, no external contract moves.

## 7. Version impact

| Artefact | Before | After |
|---|---|---|
| `CANONICAL_DOMAIN_SEQUENCE` | 13 | **14** |
| Canonical certification criteria (contract-declared) | 109 | **115** (+6) |
| `functional-workflow.canonical.json` | v2.3.0 LOCKED | **v2.4.0 LOCKED** (MINOR — binding corrected, domain added; no step change) |
| `@dbiz/contracts` `CONTRACT_SCHEMA_VERSION` | unchanged | unchanged — **no contract type is touched** |
| Registered gates | 71 | **72** |
| ADR-0039 §4.4 | thirteen domains | fourteen, this ADR amending |
| ADR-0044 AC-3 / AC-4 | "exactly the 13 domains" | "exactly the 14 domains" |

**A figure corrected while measuring this one.** `PROJECT_STATE.md` §9.3 records *"115 certification criteria"* for the canonical runtime. Measured from the built artefact, the composition declared **109** and the fourteenth module's six were already in §9.3's total — **the count included the domain that section had just established was outside the sequence.** The port makes 115 true. It also moves `TECHNICAL_DEBT.md` D-015's denominator: *the 109 declared-but-unevidenced criteria* are now **115**, and the six that arrived are the only ones whose domain was composed by the same change that declared them.

## 8. Affected components

| Component | Change |
|---|---|
| `packages/functional-testing-engine/src/canonical-capability.ts` | sequence, `observation` input, `observationInterpretation` result |
| `packages/functional-testing-engine/src/canonical-domain-steps.ts` | binder, step, `UPSTREAM_OF_EXECUTIVE_REPORTING` |
| `packages/functional-testing-engine/src/canonical-runner-capability.ts` | executes it in `planning`, before `story-intelligence` |
| `packages/functional-testing-engine/src/domains/story-intelligence.ts` | `RequirementInput`, `StoryIntelligenceInput`, criteria source, refusal reason |
| `packages/functional-testing-engine/src/canonical-reference-input.ts` | observation facts across the seven variants |
| `packages/functional-testing-engine/src/runtime/execution-request-translator.ts` | the provider that supplies the observation |
| `governance/verification/verify-capability-activation.js` · `run-all.js` | AC-3/AC-4 at fourteen; the new domain gate registered |
| `governance/verification/verify-observation-interpretation-domain.js` | **new**, with its fault proof |
| `governance/functional-workflow/fwga.js` · `functional-workflow.canonical.json` · `workflow-version.json` | fourteen, FT-004's binding, v2.4.0, re-lock |
| `governance/capability/run-functional-completeness.mjs` | the out-of-scope declaration is discharged |
| `governance/capability/sovereignty-register.json` | the three IP capabilities' `consumers` reflect the canonical run |
| `packages/functional-testing-engine/test/**` | fifteen fixtures; the composition, equivalence and domain conformance suites |
