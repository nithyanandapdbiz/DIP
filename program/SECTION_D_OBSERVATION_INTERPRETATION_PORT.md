# Section D — the observation-interpretation port

**Written 2026-08-05, at Section D's entry, before any edit.** Tree clean at `1e5fcef`.

Section D's subject is named in one line of a register and nowhere else:

> `observation-interpretation` … remains outside `CANONICAL_DOMAIN_SEQUENCE`, which is a **sovereignty** question about what the canonical runtime performs, not a **reachability** question about what retirement deletes. P-69.2 conflated the two; **Section D ports it on the first ground.**
> — [`governance/capability/RETIREMENT_RESOLUTION_REGISTER.md`](../governance/capability/RETIREMENT_RESOLUTION_REGISTER.md)

and ruled in [`PROJECT_STATE.md`](PROJECT_STATE.md) §9.3: **PORT it to the canonical composition — as sequenced work, not a retirement blocker.**

---

## 1. What is true before the edit — measured, not read from the register

| Measurement | Value |
|---|---|
| `CANONICAL_DOMAIN_SEQUENCE` | **13** domain ids, `Object.freeze`d, `canonical-capability.ts:43` |
| `observation-interpretation` | constructible, `v1.0.0`, **6** certification criteria, exported from `src/index.ts:198` |
| Its consumers today | `authoring-bridge.mjs:40` (2 of 5 functions) · `agents/story-and-test.ts:21` (1 of 5) |
| ObservationSets consumed by the canonical composition | **zero** |
| `RequirementInput.rawAcceptanceCriteria` | `readonly string[]` — **already split** when it arrives |
| Implementations of `TranslationProviders.fetchRequirement` | **one**, and it is a test fixture (`test/runtime-enablement-conformance.test.ts:60`) |
| Per-domain governance gates | **13** — there is no `verify-observation-interpretation-domain.js` |
| Domain enumerations in `docs/architecture/` | **none** — no frozen architecture document names a domain id |

**The finding that makes this a sovereignty port and not a tidy-up.** The domain owns Requirement Decomposition — audit V-08 — and the audit's own words for why it matters are *"the number of criteria IS the coverage denominator"*. On the canonical path that number is set **before the composition runs**, by whatever implements `fetchRequirement`, and nothing in the composition can see the text it was derived from. **The canonical runtime does not perform the interpretation; it receives its result and cannot audit it.** That is true of all five capabilities the domain holds, and it is invisible from inside the composition because a pre-split array and a split array are the same type.

**Three of the five capabilities are live somewhere.** `decomposeAcceptanceCriteria` runs on the agent path and in the bridge; `classifyArtefact` runs in the bridge. `describeCriterion`, `extractReferences` and `assessCompleteness` have **no caller in this repository at all** — measured, and it is the more useful half of the measurement: V-09, V-10 and part of V-11 were closed by *moving the code into the right plane*, and nothing has executed them since.

---

## 2. Six rulings, taken before the first edit

### R1 · Position — third, before `story-intelligence`

The sequence becomes fourteen: `tenant-resolution → application-strategy-resolution → **observation-interpretation** → story-intelligence → …`

Not first: interpreting a customer's story before `tenant-resolution` has established that the tenant may run the capability would perform the work the entitlement check exists to gate. Not later: `story-intelligence` is the consumer, and a producer placed after its consumer is not composed, it is merely present.

### R2 · Consumption — one wire, and the other four recorded rather than invented

**`story-intelligence` consumes the decomposition.** Its `acceptanceCriteria` is derived from `interpretation.acceptanceCriteria`, not from a supplied array. This is the whole point of the port: after it, the coverage denominator is set **inside** the composition by a domain that declares determinism and carries certification criteria.

**The other four capabilities are produced and unread by the canonical run, and that is stated rather than papered over.** `governance/capability/sovereignty-register.json` names their consumers: `story-review` (does not exist on the canonical runtime), `test-design`, `coverage-measurement`, `executive-reporting`. Wiring criterion structure or completeness signals into `test-design-intelligence` or `executive-reporting` would be **designing those domains inside a port**, which is the mistake §5 of the retirement register records against Section C and the mistake ADR-0072's scope silence produced in F2. They are recorded as a named gap with their register-declared consumers, on the §7 precedent (`continuousLearningAgents`, ported with the consumer deferred **and named**).

### R3 · The raw text moves out of reach of the consumer — D-018, not a comment

`RequirementInput.rawAcceptanceCriteria: readonly string[]` is **removed**, replaced by `CanonicalCapabilityInput.observation.acceptanceCriteriaText: string`.

Keeping both would leave two sources for one fact — CHARTER §4 — and leave `story-intelligence` able to read the unsplit text and set the denominator itself. Keeping the text **on** `RequirementInput` would be the same footgun with better manners. D-018 says prefer structural impossibility to a test: after this, `story-intelligence` cannot see the acceptance-criteria text, because it is not in any type it receives.

**What the observation carries** is exactly what the domain's own input type already asked for and nothing more: `acceptanceCriteriaText`, `commentText`, `artefacts`, `linkCounts`. `description` is `requirement.statement`, composed by the step from the input it already has.

### R4 · The negative finding stays in `story-intelligence`

A story whose criteria text decomposes to nothing still refuses at `story-intelligence`, not at `observation-interpretation`.

The domain that reports it is the domain whose **own output** is derived from the empty set, and the rule the code already states (`story-intelligence.ts:196`) is *one cause, reported once, by the domain that can see it*. `observation-interpretation` returning zero criteria from empty text is a **correct interpretation of empty text**, not a failure of interpretation — and a second domain reporting the same cause would make `CertificationVerdict.reasons` a list of echoes, which is the exact thing that comment exists to prevent. The message changes, because the fact it reports changed: it now names the interpretation that produced no criteria rather than a count of supplied strings.

### R5 · The runner runs it in `planning`; its declared `stageRef` is left alone, and the drift is recorded

The through-runner composition executes it in `planning`, before `story-intelligence`, because the composition order requires it there.

Its Platform Event declares `stageRef: 'context'`, which is the architecturally correct stage for an EP→IP entry point (Doc 12 stage 3) and is what the workflow manifest binds FT-004 to. **Measured against the runner's arrangement, five of the thirteen existing domains declare the stage they run in and eight do not** — `test-design-intelligence` declares `guardrail-review` and runs in `discovery`; `test-management-intelligence`, `automation-intelligence` and `automation-architecture` declare `execution-planning` and run in `context`; `healing` declares `execution` and runs in `reflection`; and **`defect-management`, `synchronisation` and `executive-reporting` declare `defect-management`, `synchronisation` and `executive-reporting`, which are not stages at all.** **Nothing compares the two**, which is D-007's class. Changing this one domain to match the runner would make it the exception and would imply the other thirteen had been checked. The declaration is left as it is and the measurement is recorded as a finding.

### R6 · The workflow manifest re-binds FT-004, and that is a correction rather than an addition

`FT-004 Acquire Story` is declared `phase: AUTHOR · plane: EP->IP · stage: 3 (Context)` and bound to `domain: story-intelligence` — a domain that declares `planning` and runs at position 4. **FT-004 is the EP→IP handover step, and the domain that performs the Intelligence Plane's half of it is the one being ported.** It re-binds to `observation-interpretation`; `FT-006`/`FT-007` keep `story-intelligence`. The FWGA requires every canonical domain to be mapped by some step (`fwga.js:161`), so a fourteenth domain with no step would fail `completeness` — and inventing a thirty-eighth step to hold it would amend the constitutional step set to avoid amending a binding.

---

## 3. Blast radius — measured by search, before the first edit

| Where | Files | What changes |
|---|---|---|
| Composition | `canonical-capability.ts`, `canonical-domain-steps.ts`, `canonical-runner-capability.ts` | sequence, input, result, binder, step, `UPSTREAM_OF_EXECUTIVE_REPORTING` |
| Domains | `story-intelligence.ts` | `RequirementInput`, `StoryIntelligenceInput`, the criteria source, the refusal reason |
| Inputs | `canonical-reference-input.ts`, `runtime/execution-request-translator.ts` | the observation facts, and the provider that supplies them |
| Tests | **15** files carrying a `rawAcceptanceCriteria` fixture, one occurrence each | mechanical; the `no-criteria` variant in `canonical-reference-input.ts` carries a meaning and is not |
| Gates | `verify-capability-activation.js` (AC-3/AC-4, `EXPECTED_SEQUENCE`, `DOMAIN_FACTORIES`), `fwga.js` (`!== 13`, twice-stated), `functional-workflow.canonical.json` (`canonicalDomains.sequence`, FT-004), `run-functional-completeness.mjs` (`OUT_OF_SCOPE_DOMAINS`), `run-all.js` (the activation gate's label) | 13 → 14 |
| Locks | `workflow-version.json` — `canonicalChecksum` covers `canonicalDomains`; `fwga.js` seals its own checksum | manifest version increment + `--relock` |
| Not touched | `docs/architecture/**` | **no frozen architecture document enumerates a domain id** — verified by search |

**Two enumerations deliberately left alone, and why.** `governance/capability/adr0039-contract-registry.mjs` `DOMAINS` uses a *different vocabulary* (`application-strategy`, `execution-intelligence`, `defect-intelligence`) and feeds the activation ledger, not the composition; `verify-agent-naming.js` reads the **agent path's** `DOMAINS`, not this sequence. Adding a name to either would be editing a list that answers a different question.

---

## 4. What Section D does not close, stated at entry

- **The domain's declared input contract is `dbiz.observation-set@1`; the type it consumes is not one.** `ObservationInterpretationInput` is a flattened shape someone has already extracted from a work item — which field is the acceptance criteria, which comments count, what an artefact is. **Deciding that `Microsoft.VSTS.Common.AcceptanceCriteria` is the acceptance-criteria field is a mapping this port does not make**, and making it inside a port would place tool-schema knowledge in a composition. The gap is real, it is the next question after this one, and it is recorded rather than closed.
- **Four of five capabilities remain unconsumed by a canonical run** (R2). The port makes them *reachable and composed*; it does not make them *read*.
- **No live run exercises any of this.** `fetchRequirement` has one implementation and it is a fixture. Everything proved here is proved against reference inputs this work constructs — the same limit F2 stated for read-back, and it is stated here at entry for the same reason.
- **`rawBusinessRules` and `rawDependencies` keep the shape this port removes from the criteria.** They arrive pre-split and pre-classified, and `business-rule-extraction` is declared IP-owned in the sovereignty register with an **agent** as its producer. That makes it F1's port, not this one. Recorded, not fixed.

---

## 5. Exit — what was measured, written after the work rather than predicted before it

**Every ruling in §2 held.** None was reopened, and the one that came closest — R4, keeping the empty-criteria refusal in `story-intelligence` — was settled by writing the refusal's new message: it names *the interpretation that produced no criteria*, so the domain that reports it is still the one whose own output is derived from an empty set.

### The four fault proofs, and which branch each fired

R-13.7 clause 2 asks for the branch under test to be observed executing, not merely for a red suite. Each fault was planted at the source of truth, run, and reverted.

| Fault planted | Property that failed | The assertion that fired |
|---|---|---|
| `stepObservationInterpretation` passes a constant instead of `observation.acceptanceCriteriaText` | *the run performs the interpretation* | `actual: [ 'Given a valid card…' ]` vs the two expected criteria |
| `repository-intelligence` computes `coverageSummary.total` from a literal | *the interpretation sets the coverage denominator* | **the last assertion, alone** — `the coverage denominator did not follow the interpretation` |
| `assessCompleteness` returns `present: true` for every signal | *guarded both ways* | `every completeness signal agreed — the fixture decided them, not the assessment` |
| the empty-criteria refusal condition is disabled | *an interpretation with no criteria refuses* | `a story with no criteria certified anyway` |
| the splitter collapses newlines before splitting | *the criteria come from the interpretation* | `the splitter did not produce three criteria` |

**The second row is the one worth reading.** The first fault also fails that property — but through its *first* assertion, which is a different claim. Faulting the last link instead leaves every earlier measurement passing and fires only the denominator check, which is what makes it evidence about the denominator rather than evidence about the chain.

### The gate found its own defect on its first probe

`verify-observation-interpretation-domain.js` OI-4 originally tested `/input\.interpretation\.acceptanceCriteria/` against the whole of `story-intelligence.ts`. Its fault probe — *the reasoner derives its criteria from something else* — reported **NOT PROVED**, because that substring also appears in the **refusal message**. The check now matches the assignment (`const acceptanceCriteria = input.interpretation.acceptanceCriteria`). **A gate whose probe cannot fail it is the class this platform keeps finding in its own instruments**, and it was caught by requiring the proof rather than by reading the regex.

### Measured

```
CANONICAL_DOMAIN_SEQUENCE      13 → 14      observation-interpretation at position 3
declared certification criteria 109 → 115   measured from the built artefact, both trees
FTE suite                      409 → 413    .mjs 96 unchanged, both green
registered gates               71 → 72      clean tree 9 red · changed tree 10 red
workflow manifest              v2.3.0 → v2.4.0 (MINOR) · FWGA refused before --relock
```

**The gate diff is two lines and nothing else.** `+ PASS verify-observation-interpretation-domain.js` and `PASS → FAIL verify-programme-closure.js`, the latter on one check — *"no ADR has been added since closure"* — which the gate's own message says to resolve by a deliberate re-baseline. Measured against a **stashed clean tree rebuilt from source**, so the comparison is not an artefact of a stale `dist`.

### One limit of the harness, stated because the port did not change it

**C-5 cannot see copy-through of the acceptance criteria, and could not before either.** The copy-through measurement only flags a leaf whose value **differs between variants A and B**; the reference input supplies identical criteria in both, exactly as it supplied identical `rawAcceptanceCriteria` before Section D. So a domain emitting the criteria verbatim would not be flagged. The port makes this *less* likely to matter — the criteria are now split from a text blob, so no output leaf equals an input leaf — but the blind spot is a property of the harness, not of the change, and it is recorded rather than left to be rediscovered.
