# D-124 — why the sealed package is composed outside the lifecycle, and whether that blocks D-128

**2026-08-06. Reported before ADR-0082 §6 step 2 and before D-128's move. Nothing built.**

> **THREE ANSWERS, AND THE THIRD CORRECTS MY OWN FRAMING OF D-128.**
>
> **(1) It is a CONTENT-MODEL defect, not a placement one.** Of the three domain outputs
> `composeExecutionPackage` consumes, **two are available at stage 3 and exactly one is not: `gates`,
> derived from `executiveReporting.certificationSummary`, which is produced at STAGE 11.** The package
> is composed after all twelve stages because **one of its fields depends on a stage that runs after
> the stage that is supposed to author it.**
>
> **(2) The handle can be fixed, but the fix nobody should take is the obvious one.** The `packageHash`
> field is unavailable at handle-construction time only on the **reference** path; in a real
> cross-plane run the Execution Plane constructs the reference and **already holds the hash**.
>
> **(3) D-124 DOES NOT BLOCK D-128's MOVE, and my earlier statement that it did was wrong.** The
> ingress consumes a **wire reference**, not `EvidenceReferenceHandle` — measured:
> **`receiveEvidence` has zero non-test callers**, and the gateway implements its own inline check.
> **The route can move now.**

---

## 1. D-124's corrected form, which is the headline and not a consequence

> **THE REFERENCE PATH COMPOSES A PACKAGE "FOR DISPATCH" FROM A COMPLETED RUN — WHICH IS EXACTLY THE
> OPTION D-122 REJECTED AS IMPOSSIBLE BY THE LIFECYCLE'S OWN ORDERING.**
>
> D-122 ruled *"write the package at certification"* out on the ground that **certification is stage
> 11 and the Execution Plane executes at stage 8, so the package would be written after the run it
> exists to enable.** That ruling was right. **The implementation has been doing the rejected thing
> since before the ruling existed** — the bridge runs all twelve stages and then composes.
>
> **NOTHING COULD SEE IT BECAUSE NOTHING EVER DISPATCHED.** A package authored from a completed run
> and a package authored to enable one are **byte-indistinguishable artefacts**; they differ only in
> when they were built, and no gate, test or schema observes that. The store has never been written
> to (D-122), so the ordering has never had a consequence — and an ordering with no consequence
> produces no evidence of itself.

**And `gates` is not merely mistimed — it is impossible in a real cross-plane run.** **R-20.7** makes
a gate a condition the Execution Plane **carries** and the Intelligence Plane **evaluates**: an
input to a run. `executiveReporting.certificationSummary` is what the IP **concludes after** a run.
Under `STAGE_PLANE`, stages 8 and 9 are the **Execution Plane's**, so in a real run the certification
summary **does not exist** at the moment the package must be authored. **The derivation is not late by
some number of stages; it has no value to read, ever.**

**The reference path works only because it simulates all twelve stages in-process** — the runner's
stage 8 is not the EP's stage 8 — so the summary happens to exist, and the inversion is invisible.

## 2. Measured — which stage produces each of the composer's three inputs

`composeExecutionPackage` reads exactly three domain outputs:

| Composer field | Reads | Assigned in the runner at | Available by stage 7? |
|---|---|---|---|
| `operations` | `automationArchitecture.architectureComponents` | `context` — **stage 3** | **YES** |
| `evidenceRequirements` | `automationIntelligence.validationRequirements` | `context` — **stage 3** | **YES** |
| **`gates`** | **`executiveReporting.certificationSummary`** | **`certification` — stage 11** | **NO** |

> **TWO OF THREE ARE READY EIGHT STAGES EARLY. THE PACKAGE IS COMPOSED AT THE END BECAUSE OF ONE
> FIELD.**

That is a far narrower defect than *"composition sits outside the lifecycle"*, and it is the reason
this is reportable rather than a rewrite: **the blocking dependency is a single derivation.**

## 3. Fixable or structural? — it is structural in the CONTENT MODEL and fixable in the code

**And it is worse than mistimed, which is the part that decides the repair.**

`gates` are defined by **R-20.7**: *carried by the Execution Plane, evaluated only by the Intelligence
Plane.* They are conditions the EP transports and the IP later judges. **Deriving them from a
`certificationSummary` inverts that** — a certification summary is what the IP concludes *after* a run,
so the package's gates currently describe **a run that has already happened.**

**In a real cross-plane run the derivation is not merely late; it is impossible.** Under
`STAGE_PLANE`, stages 8 and 9 are the **Execution Plane's**. `executiveReporting` is produced at stage
11, **after the EP has executed** — so a package that must be authored *before* stage 8 can never
contain a field derived from stage 11.

> **THE REFERENCE PATH WORKS ONLY BECAUSE IT SIMULATES ALL TWELVE STAGES IN-PROCESS.** The runner's
> stage 8 is not the Execution Plane's stage 8. The bridge then composes a package "for dispatch"
> **from the outputs of a run that has already completed** — which is precisely the ordering D-122
> ruled impossible when it rejected *"write the package at certification"*. **The rejected option is
> what the implementation does.**

**So the repair is not to move the composer. It is to sever `gates` from stage 11**, after which
composition at stage 7 is trivially available. What `gates` should be derived from is a **capability
decision** — certification *criteria* declared before execution, rather than a certification
*summary* produced after — and it is not this report's to take.

**One thing this does NOT mean.** It does not mean the packages authored so far are wrong for the
reference path, where the simulated run genuinely has concluded. It means the derivation **cannot
survive contact with a real Execution Plane**, and nothing has yet put it there (D-122: nothing has
ever been written to the store).

## 4. What would make `packageHash` available where the handle is built

| | Option | Verdict |
|---|---|---|
| **A** | **Move composition into stage 7** — requires §3's `gates` fix first | **The real repair of D-124.** The package then exists before stage 8, so any stage-8 handle can carry its hash |
| **B** | **Two-phase handle** — construct without the hash at stage 8, bind at composition time | **REJECTED.** It manufactures a window in which a handle exists and cannot be attributed, and the type would have to admit an unbound state — so *every* consumer must handle a case that exists only because of the ordering. **ADR-0081 P-81.1's rule applies unchanged: a partial construction must fail toward the absence of the thing that is used, never toward the absence of the thing that binds it.** A handle that exists unbound is exactly the package-without-its-signature that ordering was written to prevent |
| **C** | **Change nothing about the handle** | **CORRECT FOR PRODUCTION, and independent of A** — §4.1 |

### 4.1 Why C is not evasion

`EvidenceReferenceHandle` is constructed at `execution.ts` and `healing.ts`, **inside the Intelligence
Plane's reference runtime** — the in-process stand-in for stages 8 and 9. **In a real cross-plane run
those stages are the Execution Plane's**, and the EP constructs its own evidence references **holding
the package hash it just executed**. It is the one party that cannot fail to know it.

> **THE MISSING FIELD IS AN ARTEFACT OF THE SIMULATION, NOT OF THE CONTRACT.** `EvidenceReferenceSchema`
> — the wire contract — **already requires `packageHash`.** Nothing needs adding there.

**A and C are therefore both correct and answer different questions.** C is what production needs; **A
is what makes the reference path stop modelling an impossible ordering**, and A is D-124's actual
closure.

## 5. Can the move to the authenticated tier land WITHOUT the binding? — YES, and D-124 does not block it

**This corrects the framing in D-128 and in the previous session's report**, which listed the handle
as a blocker for the move. Measured:

| | |
|---|---|
| `receiveEvidence` — the function that ingests EP evidence as handles | **ZERO non-test callers.** Exported from the barrel, exercised by two conformance tests, and called by nothing on any serving path |
| The gateway's `POST /v1/evidence` | consumes **`body.reference`, raw JSON from the wire**, and implements its **own inline** payload check rather than calling `receiveEvidence` |
| `EvidenceReferenceHandle` | therefore appears on **no ingress path at all** |

> **THE INGRESS CONSUMES A WIRE REFERENCE, NOT THE INTERNAL HANDLE. THE ROUTE CAN MOVE NOW.**

**What R-20.12 enforcement the moved route can carry on day one:**

| Enforcement | Available? |
|---|---|
| `packageHash` **present and well-formed** | **YES** — this already landed at the gateway and transfers unchanged |
| Parse through **`EvidenceReferenceSchema`** — the single source of truth | **YES, and better than the gateway can do**: the authenticated tier is TypeScript and imports `@dbiz/contracts`. The gateway's shape check exists **only** because that file imports no `@dbiz` package (D-121). **The move retires a duplicated shape rule rather than adding one** |
| **Resolution to a known run** | **NO** — needs the run record, ADR-0082 §6 step 2. Claiming it earlier is the declared-but-unbuilt failure |

**The cost of landing the move before resolution exists, stated plainly:** the route accepts any
reference whose `packageHash` is well-formed, including one naming a package this plane never
authored. **That is strictly better than today** — today it accepts references naming nothing at all —
**and it is not the R-20.12 binding in full.** The register must say so, and the gap closes with §6
step 2 rather than by a later reading of this report.

## 6. A fourth instance of the class, and it is on the path just ruled to be built

**`receiveEvidence` is declared, exported, conformance-tested, and called by nothing.** That is the
mechanism D-115, D-117, D-118 and D-122 all record, at a fifth site:

| | Declared | Consumed by |
|---|---|---|
| D-115 | `EvidenceReferenceSchema.packageHash` | tests, the compat harness, the schema emitter |
| D-117 | the execution-package schema | its own harness, against fixtures it authors |
| D-118 | version tolerance | a predicate the parser did not call |
| D-122 | `SealedPackageStore.put` | its own test suite |
| **here** | **`receiveEvidence`** | **two conformance tests** |

**It matters now rather than as a curiosity:** D-128's move is an opportunity to wire it, and **an
opportunity to build a second inline check beside it instead.** The gateway already did that once —
its inline payload guard duplicates `carriesPayload` — and moving the route without consolidating
would carry the duplicate into the tier that is supposed to be canonical.

## 7. Recommendation

1. **Move the evidence route to the authenticated tier now** (D-128 as ruled). **It is not blocked.**
2. **Wire `receiveEvidence` on that route** rather than porting the gateway's inline checks — §6.
3. **Parse through `EvidenceReferenceSchema`** at the new route, retiring the gateway's duplicated
   shape rule rather than moving it.
4. **Record explicitly that resolution-to-a-known-run is NOT yet enforced**, and that it closes with
   ADR-0082 §6 step 2.
5. **Leave `EvidenceReferenceHandle` alone** — option C. It is correct for production and the change
   would be for the simulation's benefit.
6. **D-124's closure is option A, and it is a capability decision, not a refactor:** severing `gates`
   from `executiveReporting.certificationSummary` requires deciding what a gate is derived from, and
   R-20.7 says it is a condition the EP carries — not a summary of a run that already ended.

**What must NOT be done:**

- **SHALL NOT adopt the two-phase handle** (§4, option B) — it manufactures an unbindable window and
  makes every consumer handle a state that exists only because of the ordering.
- **SHALL NOT move composition to stage 7 while `gates` still reads stage 11** — it would fail on the
  first run, or worse, be "fixed" by moving `executiveReporting` earlier, which would make the
  certification summary describe a run that has not happened.
- **SHALL NOT port the gateway's inline shape check into the authenticated tier** — it exists only
  because that file cannot import the contract.
- **SHALL NOT read this report as closing D-124.** It reports what closing it requires.

## 8. Reproduction

Domain-to-stage assignments read from `canonical-runner-capability.ts` at the assignment sites;
composer inputs from `canonical-authoring-composer.ts`; plane assignment from `stages.ts`'s
`STAGE_PLANE`; call-site counts by search across the non-`dist`, non-`node_modules` TypeScript and
`.mjs` trees, tests included and reported separately. **Nothing was modified.**
