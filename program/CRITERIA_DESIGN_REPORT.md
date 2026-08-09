# The 115 certification criteria — design report

**REPORT ONLY. Nothing built.** 2026-08-04. Written on evidence that did not exist when the three-part design was approved (`TECHNICAL_DEBT.md` D-038).

> ## THE NUMBER THIS REPORT WAS WRITTEN AGAINST HAS CHANGED: **109 → 115** (2026-08-05, ADR-0075)
>
> **Read this before the groups below — every tally in this report was measured over thirteen domains and the composition is now fourteen.** ADR-0075 composed `observation-interpretation` third in `CANONICAL_DOMAIN_SEQUENCE`; it declares **six** certification criteria, and they are now part of what C-3 must evidence. Measured from source across all fourteen domain modules, not inferred: **115** (`synchronisation` 11 · `healing`/`executive-reporting`/`execution`/`defect-management` 10 · `automation-architecture` 9 · `test-management-intelligence`/`repository-intelligence`/`automation-intelligence` 8 · `test-design-intelligence`/`story-intelligence` 7 · `observation-interpretation`/`application-strategy-resolution` 6 · `tenant-resolution` 5).
>
> **Where the six land, and it is not evenly:**
>
> | Group | This report | Now | The six |
> |---|---|---|---|
> | **Structural** | ~51 | **54** | `deterministic` 13→14 · `immutable-output` 13→14 · `capability-neutral` 13→14 |
> | **Consumption** | ~30 | **30** | **none** |
> | **Negative** | ~28 | **30** | `no-execution` 6→7 · `no-repository-access` 2→3 |
> | **Unclassified** | — | **1** | **`no-ratio`** |
>
> **Two things in that table are findings rather than arithmetic.**
>
> **1 · `observation-interpretation` contributes ZERO consumption criteria, and it is the only domain that declares no `decision-engine-consumed`.** The other thirteen all do. This is **correct and deliberate, verified rather than assumed**: `canonical-domain-steps.ts:161–162` states *"It takes no Decision Engine and no connector — it reads only its input, which is what lets it produce the same interpretation with reasoning unavailable (INV-7)"*, and the step supplies neither. **The consumption group's evidencer — the composition boundary — has nothing to say about this domain**, which is the first case where a group's mechanism legitimately does not reach a domain at all. The build order below is unaffected; the group's count is.
>
> **2 · `no-ratio` is a criterion this report's taxonomy has no place for, and it is the ONLY one of the 115 whose name already matches a declared CI gate.** `governance/capability/sovereignty-register.json` names `GATE no-ratio-computation` at three sites, and `docs/audit/PLANE-SOVEREIGNTY-AUDIT.md` defines `no-ratio-in-ep`. Every other criterion in the set is either a call-shaped absence, a content property, or a structural property; **`no-ratio` is a constraint on a value's derivation** — *"no ratio is produced"*, per the domain's own postcondition — enforced by a gate that exists and is not connected to the declaration. **It is therefore the cheapest citation in the whole exercise and the strongest single piece of evidence for the citation recommendation**: a criterion, a gate that already checks exactly it, and nothing joining them. **Do not fold it into the negative group to make the taxonomy close.** Its shape is genuinely different, and a fourth group of one is more honest than a third group of thirty-one with a member that does not fit.
>
> **What does NOT change: none of the four recommendations, the citation-labelling ruling, the self-assertion rejection, or the build order.** Each rests on the *shape* of a group rather than on its size, and no group changed shape. The number changed and every mechanism still reaches what it reached.
>
> **Provenance of the correction.** `PROJECT_STATE.md` §9.3 recorded *"115 certification criteria"* on 2026-08-04 — before the port, when it was also the section establishing that `observation-interpretation` sat **outside** the sequence. That figure counted all fourteen modules, including the one it had just placed outside the composition; the composition's true figure was **109**, which is what `TECHNICAL_DEBT.md` D-015 measured independently and correctly. **The two numbers were never in conflict — they were counting different things, and the identity of the figure now stated here is the third one: fourteen modules, all composed.**

**Two things settled before the design starts:**

- **Part 3 stands.** *A domain whose declared criteria are not all evidenced returns `certified: false`.* It is unaffected by this report — who evidences a criterion does not change what an unevidenced one means.
- **`certificationContributions`' transition to REQUIRED is WITHDRAWN ON EVIDENCE, not deferred.** Its schedule rested on the premise that agents evidence criteria; the measurement contradicts that premise. It stays optional, and its documented "scheduled end" is withdrawn rather than postponed — a postponement would leave a date attached to a plan that no longer exists.
- **The agent contract stays as landed.** `AgentOutput`, the three composition rules and `CertificationContribution` are **correct for what agents do**. They are simply not the criteria mechanism. **The layer is not a failed attempt at this** and must not be read as one; `CertificationContribution` remains the right shape for an agent that evidences something about a domain — there are just very few such criteria among these 115.

---

## STRUCTURAL — 54 criteria *(51 when written; +3 from the fourteenth domain)*

`deterministic` and its five suffixed variants (14) · `immutable-output` (14) · `capability-neutral` (14) · `redefines-nothing` (6) · `evidence-references-only` (5) · `canonical-values-preserved` (1)

**What could evidence them:** three candidates, and only one survives.

**A domain asserting about itself — REJECTED, and D-019 is why.** A domain reporting *"my output is immutable"* is the producer certifying its own work, which is the exact defect the governance triad exists to prevent and which D-019 found the triad itself committing. **A self-assertion is not evidence; it is a second declaration beside the first.** Worse, it would be trivially satisfiable — `evidenced: true` is one line — so it would convert 54 criteria into 54 literals and reproduce D-012 at scale.

**A conformance test — PARTLY EXISTS, and this is the honest answer for most.** `immutable-output` is already asserted: every domain's conformance suite tests that its result is frozen and that mutation throws. `deterministic` is asserted by running twice and deep-comparing. **These criteria are not unevidenced — they are evidenced in the test suite and not connected to the declaration.** The gap is a *link*, not a mechanism.

**A gate — EXISTS for a few.** `capability-neutral` and `redefines-nothing` are scanning properties, and `verify-functional-completeness` already scans for related ones.

> **Recommended: the structural group is closed by CITATION, not by new evidence.** A criterion names the conformance test or gate that already proves it, and a gate checks that every citation resolves to a test that exists and passes. **The work is a mapping plus a gate over the mapping — not a runtime mechanism**, and nothing needs to flow through a run.

## CONSUMPTION — 30 criteria *(unchanged by the fourteenth domain, which declares none)*

`decision-engine-consumed` (13) · `connector-spi-consumed` (5) · `execution-result-consumed`, `healing-result-consumed`, `defect-result-consumed`, `repository-model-consumed`, `automation-model-consumed`, `repository-intelligence-consumed`, `automation-intelligence-consumed`, `reporting-model-consumed`, `synchronisation-result-consumed`

**`canonical-domain-steps.ts` is the natural evidencer, and the reasoning is stronger than convenience.** It is the **single place every domain is invoked** — thirteen `stepX` functions, each constructing that domain's input from the prior results. **It is therefore the only code that knows what actually reached a domain**, which is precisely what these criteria assert. A domain cannot evidence `execution-result-consumed` honestly: it received an object and used it, but *"was this the real execution result?"* is a question about the caller.

**It EXISTS.** No new component. `unwrapDomain` already sits at every invocation and already records an outcome per domain — the same seam.

> **Recommended: consumption criteria are evidenced at the composition boundary, in `canonical-domain-steps`, by the code that builds the input.** This is the group most likely to close cleanly and the one where the evidence is genuinely produced by a run rather than cited from a test.

## NEGATIVE — 30 criteria *(28 when written; +2 from the fourteenth domain)*

`no-execution` (7) · `no-automation` (4) · `no-repository-modification` (3) · `no-repository-access` (3) · `no-alm-synchronisation` (3) · `no-defect-creation` (2) · `no-report-generation` (2) · plus one each of `no-healing`, `no-synchronisation`, `no-external-publication`, `no-automation-generation`, `no-runtime-framework-invocation`, `no-application-brand`

**`no-ratio` is deliberately not in this list** — see the correction note at the head of this report. It is an absence like the others in name only: every criterion above forbids an *action*, and `no-ratio` constrains how a *value* may be derived. It is its own group of one, and its gate already exists.

**Only observation of a run can evidence an absence**, and `run-functional-completeness` already does exactly this for a handful — C-4 observes which adapter operations were invoked across a run by recording calls, which is how it reports `never called: findExistingTests, publishDefect`.

**Does it generalise to 28? Partly, and the boundary is sharp.** The mechanism is *record every SPI call, then assert a domain made none of a named kind*. That covers every criterion phrased as *"this domain does not call X"* — `no-execution`, `no-alm-synchronisation`, `no-defect-creation`, `no-report-generation`, `no-runtime-framework-invocation`. **It does not cover `no-application-brand`**, which is a property of *content* rather than of calls and needs a scan, nor `no-repository-access` where access is not through a recorded SPI.

**The cost is the honest part: attributing a call to a DOMAIN, not to a run.** The existing recorder knows an operation was invoked; it does not know which domain invoked it, because domains share connectors. **Per-domain attribution is the work** — a recording seam per invocation, which `canonical-domain-steps` is again positioned to provide.

> **Recommended: negative criteria are evidenced by per-domain call observation, extending the existing recorder. The mechanism partly exists; the attribution does not.**

---

## Are the 115 closeable at all?

**No — and the subset matters more than the number.**

| Group | Closeable | Mechanism |
|---|---|---|
| **Consumption 30** | **Yes** | exists — `canonical-domain-steps` |
| **Negative, call-shaped ~25** | **Yes, with work** | partly exists — recorder plus per-domain attribution |
| **Structural 54** | **Yes, as citations** | exists in tests; needs a mapping and a gate over it |
| **Negative, content-shaped ~5** | **Yes, by scan** | `no-application-brand`, `no-repository-access` and similar — a gate, not a run |
| **`no-ratio` (1)** | **Yes, today** | **the gate already exists and already checks it** — `no-ratio-computation`; only the citation is missing |

**So all 115 are reachable, and none of them by the mechanism originally designed.** That is the finding restated positively: the criteria are not unevidenceable, they are evidenced in **five different places**, none of which is an agent.

### CITATION LABELLING — RULED, NOT OPTIONAL

Closing the structural 54 by citation makes C-3 able to report `115/115` while 54 of those are **pointers to tests rather than observations of a run**. Legitimate, and it carries three binding conditions:

1. **`evidenced` must NOT be a single number.** Evidence-by-citation and evidence-by-observation are reported as **separate counts**, always, at every level that aggregates them.
2. **C-3's output states both.** `115/115` with 54 unlabelled pointers **would be D-029 inside the mechanism built to close D-015 — the third instance of a fix wearing its defect's shape**, and the design-time check exists precisely to stop that one.
3. **A citation names the specific ASSERTION it points to, not the suite.** *"`immutable-output` is covered by `tenant-resolution-conformance`"* is a pointer to a file; *"…by its assertion that mutating `reportId` throws"* is a pointer to a proof. **A citation that names a suite cannot be checked when the suite changes** — which is the drift class this platform has recorded six times.

**A criterion evidenced by citation and one evidenced by observation are different facts and must never be summed without saying so.**

### DOMAIN SELF-ASSERTION — REJECTED, with the reasoning recorded

A domain asserting *"my output is immutable"* is **the producer certifying its own work** — the defect the governance triad exists to prevent, and the one D-019 found the triad itself committing.

**It was the cheap path, and that is why it is recorded rather than merely rejected.** It requires no new evidencer, no citation mapping, no per-domain attribution: fourteen domains each add a line and C-3 goes green. **And it would have converted 54 criteria into 54 literals — D-012 at scale**, in the mechanism built to close a defect of exactly that kind. The cheapness is the warning sign, not the recommendation.

### BUILD ORDER, ruled — when the criteria step re-enters

**Unchanged by 109 → 115.** Each position rests on the shape of a group and its mechanism's readiness, neither of which moved. The counts are restated to the measured figures so the step does not inherit a stale denominator.

0. **`no-ratio` (1)** — **new, and it goes first because it is the smallest complete instance of the recommendation the rest of the report argues for.** The gate exists, it already checks exactly this criterion, and only the citation is absent. **Closing it first produces a worked example of a citation — including its labelling — before the mapping exercise that needs one.**
1. **Consumption (30)** — the evidencer exists (`canonical-domain-steps`); highest certainty, no new mechanism. **Note it reaches thirteen domains, not fourteen**: `observation-interpretation` declares no consumption criterion because it consumes nothing, which is the correct result and not a gap to fill.
2. **Structural (54)** — citation, with the labelling above; largest group, and the one whose honesty depends on the labelling rather than on the work.
3. **Content-shaped (~5)** — a scan; small and self-contained.
4. **Negative (~25)** — **last, because per-domain attribution is the real cost and the only part requiring a new mechanism.** Sequencing it first would put the hardest work before the groups that prove the design.

## What this changes about part 3

Nothing, and that is worth stating. **A domain whose declared criteria are not all evidenced returns `certified: false`** — regardless of whether the evidence came from a test citation, the composition boundary, or a call recorder. **Part 3 was the part that made the other two more than bookkeeping, and it survives its co-parts being wrong.**
