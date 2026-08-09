# M5 — the cut-over, EXECUTED

> ## 2026-08-06 · **M5 IS DONE.** The gateway is retired, §13 retired with it, and the canonical
> ## authoring path publishes at stage 7 gated on `decidePublication()`.
>
> **The store has a writer.** `SealedPackageStore.onPackageSealed` had **zero non-test callers in the
> entire tree** (D-122) — a deployed, authenticated, tenant-partitioned retrieval route over a store
> that had never held a package this plane produced. It is now driven by the authoring path.
>
> ### OPTION C's FIRST STEP IS WITHDRAWN ON MEASUREMENT — RECORDED, NOT SILENTLY DROPPED
>
> Option C was *"wire `certifyPackageForSealing` into the canonical publication path, re-point §13,
> then retire the gateway"*, and it was recommended as **the only order in which nothing is green
> over an absence.** It is withdrawn, and the reason is a premise rather than a preference:
>
> > **C RESTED ON THE PREMISE THAT THE GATE'S SUBJECT IS THE SEALING POINT.** The measurement showed
> > it is the **gateway's package FORMAT** — 18 blocking findings against a canonical package that
> > satisfies `parseExecutionPackage`, every finding a field that exists only in the retiring format,
> > and `SECTION_OWNERSHIP`'s own repair strings naming `ip-execute-gateway.mjs`, `authoring-bridge.mjs`
> > and *"the gateway's `packageIdOf`"*.
>
> **Wiring it into the canonical path would therefore have turned the gate RED over the CORRECT
> artefact** — the opposite of what C was chosen to prevent.
>
> **AND THIS IS HOW THE PREMISE SURVIVED INTO A RECOMMENDATION: THE GATE HAD NEVER BEEN RUN AGAINST A
> CANONICAL PACKAGE.** Not once, in any conformance run, gate or probe. Its only caller was the
> gateway, whose format it was written for, so every run it had ever had confirmed it. **A gate that
> has only ever been shown its own subject cannot tell you what its subject is** — which is the
> subject-removal test (CHARTER §17.1.1) asked one step earlier, about scope rather than about
> deletion. The recommendation was reasoned correctly from what was known; what was missing was a
> measurement nobody had a reason to take until the deletion forced it.
>
> **What replaced C:** ruling (a) — the gate retires with its subject under §17.1.1 (ii) — plus the
> wiring C's third step always contained. **The deletion originally scoped, in the order it needed.**

---

# M5 — the cut-over, stopped at its own precondition (the report as written before the ruling)

**2026-08-06. ADR-0083 and ADR-0084 landed. The cut-over is NOT performed, and the gateway is NOT removed.**

> **STOP CONDITION MET, AND IT IS BETTER THAN "A REFERENCE EXISTS".**
>
> **Something reaches the gateway that is not a test: `verify-package-governance.js` §13 reads its
> source and asserts three properties about it — and its own words are *"a gate nothing calls is a
> gate the programme does not have."***
>
> **THOSE PROPERTIES ASSERT THAT THE SEALING POINT IS WIRED TO THE FOUR-LEVEL CONTRACT GATE. THE
> CANONICAL PATH DOES NOT CALL THAT GATE AT ALL.** Measured: `certifyPackageForSealing` has exactly
> two non-test callers — the gateway, and `package-assembly-orchestrator.ts`, which the bridge does
> not reach. **The bridge, the composer, the SPI and the writer never touch it.**
>
> **So the cut-over as scoped would silently drop a governance gate the old path had.** Removing the
> gateway retires the gate's subject; retiring the gate retires a property that must still hold; and
> keeping the gate pointed at a deleted file makes it throw. **None of the three is a wiring
> decision.**

---

## 1. What was checked before stopping, and what it found

**Every reference to the gateway, across all file types**, excluding `node_modules` and `dist`:

| Class | Count | Disposition |
|---|---|---|
| Programme records and certification reports (`program/`, `docs/`) | 15 files | **Historical.** They describe what the gateway was; removal does not break them |
| **A governance gate reading its source** | **1** | **THE STOP CONDITION** — §2 |
| A deny-list regex naming it (`verify-provider-platform.js:120`) | 1 | **Safe.** A forbidden-import pattern; removing the file means the pattern never matches |
| Comments in `.mjs` (`canonical-functionaltest.mjs`, `authoring-bridge.test.mjs`) | 2 | **Safe.** Prose, and both should be reworded when the file goes |
| The gateway itself | 1 | the subject |

**Nothing imports it. Nothing executes it. No fixture depends on it.** The compiler could not have told
us this — three of the five executable references are in `.mjs` or in a regex literal — which is why
the check was by search across all file types rather than by build.

## 2. THE STOP CONDITION — a governance gate is wired only through the gateway

`verify-package-governance.js` §13 — *"the sealing point is wired to the gate, not merely able to be"*
— reads the gateway's source and asserts:

1. it calls `certifyPackageForSealing` and reads `certification.sealEligible`;
2. it **acts** on seal-eligibility and attaches `contractDiagnostics` to the refusal;
3. it records `LAST_REFUSED_DIGEST`, so a byte-identical resubmission is recognised.

> **The gate's own justification is the reason this matters:** *"a gate nothing calls is a gate the
> programme does not have."* §13 exists because the four-level contract gate could be present and
> unwired — **and it is about to become exactly that.**

### 2.1 Measured — the canonical path has never called it

```
certifyPackageForSealing — non-test callers
  ip-execute-gateway.mjs                          <- asserted by verify-package-governance §13
  registry/package-assembly-orchestrator.ts       <- exported from the barrel; the bridge does not reach it
  (the bridge, the composer, the SPI, the writer) <- NONE
```

**So the four-level gate is not a thing the cut-over moves. It is a thing the cut-over drops.**

### 2.2 The three options, and none is a wiring decision

| | Option | Consequence |
|---|---|---|
| **A** | Remove the gateway and **retire §13 with its subject** | CHARTER §17.1.1 (ii) permits retiring a control with its subject — **but the subject here is not the gateway, it is *the sealing point*.** The sealing point still exists; it moved. Retiring would drop a property that must still hold |
| **B** | Remove the gateway and **re-point §13 at the new sealing point** | **Requires the new sealing point to call the gate — which it does not.** Re-pointing a source-reading assertion at a file that does not satisfy it turns the gate red, correctly |
| **C** | **Wire `certifyPackageForSealing` into the canonical authoring path first**, then re-point §13, then remove the gateway | The only order in which nothing is silently lost |

**C is the recommendation, and it makes M5 larger than "wiring plus a deletion".** That is the report.

### 2.3 And the wiring is a decision, not a port

`certifyPackageForSealing` sits in `package-governance.ts` inside the **functional-testing engine** and
is reached today by `package-assembly-orchestrator.ts` — a registry module the canonical path
replaced. **Deciding whether the canonical composer certifies for sealing, and at which of the two
acts (authoring or publication), is a capability decision**, and it is the same shape as every other
question this sequence has answered: *the four-level gate is a check on the artefact, so it belongs
to authoring* — **but that is an argument, not a ruling, and it is not taken here.**

## 3. What a package authored through the new path looks like, against the gateway's

**New path** — `composeExecutionPackage`, measured:

```
capabilityId, contractVersion, correlationId, directives, evidenceRequirements,
gates, operations, proceed, provenance, runId, validity          <- the 11 required fields

gates      [{ gateId: "validation:0", expression: "screenshot-on-failure" }]   <- from STAGE 3
operations [{ operationId: "c1", kind: "functional.execute-reused" }]          <- capability-named
```

**Gateway** — from its own source:

```
packageId, tenantId, capability, contractVersion, authoredBy, issuedAt, validity,
proceed, adapterInterface, target, authoredFor, operations, metadata, certification, manifest,
contentHash (TOP LEVEL, algorithm "sha256"), signature

operations [{ id: "op-1", action: "navigate", target: "", expect: {...} }]     <- tool-shaped
```

| | New path | Gateway |
|---|---|---|
| Satisfies `ExecutionPackageSchema` | **YES** — parses, and the writer re-parses before `put` | **NO** — 8 issues (D-121) |
| `provenance` | present | **absent**; `contentHash` sits at the top level |
| Content hash | `sha256-jcs-v1` over the JCS canonical form, domain-bound | `sha256` over transport bytes — **not a value `ALGORITHM_VERSIONS` admits** |
| Operations | `operationId` / capability-named `kind` | `id` / tool-shaped `action` |
| `gates` | from the **stage-3** validation declaration | absent |
| Signature | **detached**, beside the package, one contract shape | embedded in the body |
| Can enter the store | **yes — proved, and retrieved back** | **no — refused on its first field** |

> **They are not two versions of one artefact. Only one of them is an `ExecutionPackage`**, which is
> what D-121 settled: the contract was never wrong; the producer was.

### 3.1 Did anything downstream read the gateway's shape? — NO, and it is measurable

**Nothing has ever crossed** (D-122: the store had no writer until this session), so **no consumer
has ever parsed a gateway package.** The gateway returns it in its own `POST /v1/execute` response,
and:

- `/v1/*` **never reaches the deployed application** — Azure Blob Storage answers it (D-121 §5);
- the gateway binds `127.0.0.1` and `process.exit(1)`s on a production environment;
- **no module in this repository consumes that response.**

**So the shape difference has no migration cost.** There is nothing to translate, no consumer to
version, and no compatibility window to open — **which is the one part of M5 that is smaller than it
looks.**

## 4. What is ready, so the remaining work is not overstated

| | State |
|---|---|
| One signature shape, in the contract | **in** (ruling 1) |
| Sign at authoring | **in** (ruling 2, link 1) |
| Rotation + key custody | **in** (link 1, ADR-0083) |
| The writer, gated on `decidePublication()` | **in**, proved, **no production caller** |
| The carrier and the envelope | **in**, round-trip proved |
| Rule 6's scope | **in** (ADR-0084) |
| **The four-level sealing gate on the canonical path** | **NOT in — and this is the stop** |

## 5. Recommendation

1. **Do not remove `ip-execute-gateway.mjs` in this change.** It is the only wiring of a governance
   gate the suite asserts on.
2. **Rule whether the canonical authoring path certifies for sealing**, and at which act. §2.3 gives
   the argument; it is not taken here.
3. **Then wire it, re-point `verify-package-governance` §13 at the new sealing point, and only then
   remove the gateway** — in that order, so nothing is green over an absence at any point.
4. **Reword the two `.mjs` comments** when the file goes; they name it as a canonicalisation
   reference and would become dangling prose.

**What must NOT be done:**

- **SHALL NOT retire §13 with the gateway.** Its subject is the **sealing point**, which moved — not
  the gateway, which is one implementation of it. Retiring a control because its current host was
  deleted is how a property disappears while looking procedurally correct.
- **SHALL NOT re-point §13 at the canonical path before the canonical path satisfies it** — that is a
  gate edited to be green in the other direction.
- **SHALL NOT treat the shape difference as a migration.** Nothing consumed the old shape (§3.1).

## 6. Measured

References by search across all file types excluding `node_modules` and `dist`, classified by hand;
`certifyPackageForSealing` callers by search across `.ts`/`.mjs`/`.js`; the new package shape by
executing `composeExecutionPackage`; the gateway's shape from its own source; the deployment
behaviour of `/v1/*` from D-121 §5. **Nothing was modified by this report.**

---

# 7. AMENDMENT — 2026-08-06: THE GATE'S SUBJECT WAS MEASURED, AND IT IS NOT THE SEALING POINT

**§5's "what must NOT be done" list is corrected by measurement, and §2.2's three options are all
mis-scoped.** This section takes no ruling. It supplies the one fact that makes the ruling decidable,
and that fact was never measured because nobody had run the canonical package through the gate.

## 7.1 Measured — the canonical package is NOT seal-eligible, and the reason is not a defect in it

`composeExecutionPackage(referenceInput('A'))` → `certifyPackageForSealing(pkg)`, against the built
engine:

```
operations: 4 | kinds: functional.execute-reused
has operationId on every op: true          <- conforms to the PUBLISHED contract

sealEligible: false
total findings: 18 | blocking: 18

  schema        schema.version-compatible.schemaVersion
  schema        schema.version-compatible.executionContextVersion
  completeness  completeness.missing.packageId
  completeness  completeness.missing.tenantId
  completeness  completeness.missing.schemaVersion
  completeness  completeness.missing.executionContextVersion
  completeness  completeness.missing.metadata.storyAnalysis
  completeness  completeness.missing.metadata.coverageMatrix
  completeness  completeness.missing.metadata.coverageCertification
  completeness  completeness.missing.automation.assets
  completeness  completeness.missing.automation.manifest
  completeness  completeness.missing.automation.repositoryDigest
  … 18 total
```

**Every missing section is a field of the GATEWAY's body, not of the published contract.** The same
set D-117 (iv) records as *"enumerated in `SECTION_OWNERSHIP` and absent from the published contract
entirely."* The canonical package satisfies `parseExecutionPackage` — it is the conforming one — and
the gate rejects it.

## 7.2 And `SECTION_OWNERSHIP` says so in its own words

The gate does not merely happen to expect the gateway's fields. **Its repair advice instructs the
reader to look inside the gateway, by module path:**

| Section | `module` | `repair` |
|---|---|---|
| `packageId` | `functional-testing-engine/authoring-bridge.mjs` | *"computed by **the gateway's `packageIdOf`**; an absent id means authoring returned before the body was built"* |
| `tenantId` | `functional-testing-engine/authoring-bridge.mjs` | *"carried from **the F1 `contextRequest`**"* |
| `contractVersion` | `tenant-onboarding-engine/ip-execute-gateway.mjs` | *"set by **the gateway constant `CONTRACT`**"* |

> **The four-level contract gate is not a check on *a package*. It is a check on the *gateway's package
> format*, and it names that format's producer in its own repair strings.**

## 7.3 What this does to the three options

| | §2.2 said | Measured |
|---|---|---|
| **A** — retire §13 with its subject | rejected: *"the subject is the sealing point, which moved"* | **Materially stronger than allowed.** The subject is narrower than §2.2 assumed — it is the gateway's package **format**, which is exactly what M5 retires. CHARTER §17.1.1 (ii) applies on its own terms |
| **B** — re-point §13 at the new sealing point | *"turns the gate red, correctly"* | **Confirmed, and the reason matters:** red at **18 blocking findings**, none of which the canonical package could satisfy without growing the gateway's sections back |
| **C** — wire the gate in first, then re-point, then remove | the recommendation | **C's first step turns the canonical path red on day one**, and not because the package is defective. "Wire it" is not a wiring task: it is *re-express the gate against a different artefact*, which is a **build** |

**§5's prohibition — *"SHALL NOT retire §13 with the gateway"* — rested on the premise that the gate's
subject is the sealing point. The premise is measurably false.** The prohibition is withdrawn as
stated; whether A is nonetheless wrong is the ruling below, on different grounds.

## 7.4 THE RULING OWED, RESTATED — and it is sharper than "at which act"

§2.3 framed it as *does the canonical composer certify for sealing, and at which of the two acts?*
**That question presupposes the gate is applicable to the canonical package. It is not, as written.**

> **Is the four-level contract gate:**
>
> **(a) a property of the GATEWAY'S PACKAGE FORMAT** — in which case it retires with its subject under
> CHARTER §17.1.1 (ii), §13 goes with it, and M5 is the deletion §1 originally scoped; **or**
>
> **(b) a property that must hold of ANY sealed package** — in which case it SHALL be **re-expressed
> against the canonical shape before the gateway goes**. That is a build with its own design report,
> not a re-point, and M5 waits on it.

**The argument for (b), stated so it is argued with rather than assumed:** *schema · completeness ·
dependency · semantic* is a reasonable four-level bar for any artefact crossing to a customer's plane,
and losing it because its first implementation was shape-specific would be D-019's shape — a control
retired because its host moved. **The argument for (a):** every mandatory section it enforces is a
gateway field, its repair strings name gateway internals, and a gate re-expressed against a different
artefact is a **new gate** wearing an old identifier — which is D-126's shape, one question with as
many answers as gates someone happened to write.

**Neither is taken here.** The measurement is the contribution; the ruling has an owner.

## 7.5 What changes in the sequence either way

**If (a):** M5 proceeds as §1 scoped — remove, retire §13 with its subject, reword the two `.mjs`
comments. Nothing is silently lost, because nothing that survives the gateway was ever in the gate's
subject.

**If (b):** the re-expression lands **first**, with its own report, and §13 re-points at it. **The
order in §5 is unchanged; what changes is that step 3's "wire it" is a build of unknown size rather
than a call site.**

## 7.6 Measured

`composeExecutionPackage` and `certifyPackageForSealing` executed against the built engine on the
reference input, variant A, 2026-08-06. `SECTION_OWNERSHIP` read from source. **Nothing was modified
by this amendment**, and the probe was run from the build output directory and removed.

**One condition on the measurement, stated because it bounds it:** the working tree carried another
session's in-flight ADR-0085 edit at the time, which left five test files mid-change and the package
build red. **The engine's `src` compiles clean and the probe ran against `src` only** — no test file
participates in it — but the full suite could not be re-run to completion afterwards, so the
`210/210 · 89/89` recorded earlier in this session is a measurement taken **before** that edit arrived
and is not claimed as current.

---

# 8. RULED 2026-08-06 — **(a): THE FOUR-LEVEL GATE RETIRES WITH THE GATEWAY.** M5 IS THE DELETION ORIGINALLY SCOPED, AND IS **HELD ON A TREE THAT CANNOT COMPLETE A TEST RUN.**

## 8.1 The ruling

> **The four-level contract gate's subject is the GATEWAY'S PACKAGE FORMAT, and it retires with it under
> CHARTER §17.1.1 (ii).** Its own repair strings name that subject — *"computed by the gateway's
> `packageIdOf`"*, *"set by the gateway constant `CONTRACT`"*, `ip-execute-gateway.mjs` by path.
>
> **And this control does not merely survive its subject's removal — it FAILS the artefact that replaces
> it.** Eighteen blocking findings against a package that satisfies the published contract. A control
> that rejects its successor's artefact is not defence in depth being preserved; it is the retiring
> format asserting itself over the one that replaces it.

**(b) is not available as scoped, and the reason is the finding rather than a preference.** The eighteen
findings are **absences of fields that exist only in the retiring format**. Re-expressing the gate against
the canonical shape does not move a gate — it writes **a new gate sharing a name**, which is D-126's shape
exactly: one question with as many answers as gates someone happened to write. **And writing it inside M5
would settle what a sealed package must satisfy inside a change reviewed as a cut-over** — a decision
taken in the margin of a deletion.

**What already holds of a canonical package, so the retirement leaves no property unguarded:**

| | Control | Status |
|---|---|---|
| 1 | `parseExecutionPackage` on the serving path | the published contract, enforced where it is served |
| 2 | `decidePublication()` admissibility | ADR-0082 severance 3 — every non-judged leg refuses, `not-applicable` included |
| 3 | the seal | ADR-0081 / ADR-0083 — one signature shape, signed at authoring, key in the Secret Provider |

**If more is owed of a sealed package, that is its own ADR with its own evidence — not eighteen inherited
findings.**

## 8.2 What dissolves

**Option C's first step dissolves.** *"Wire `certifyPackageForSealing` into the canonical authoring
path"* was the first of three ordered acts; there is nothing to wire, because the gate is not applicable
to the artefact. **Steps 2 and 3 collapse into one act:** retire §13 with its subject, in the same change
that removes the gateway.

**M5 is therefore the deletion §1 originally scoped**, and it is smaller than §2.2 concluded — not
because anything was skipped, but because the property §2.2 was protecting turned out to belong to the
thing being deleted.

## 8.3 §5's clause is WITHDRAWN ON MEASUREMENT, and why it survived is the transferable part

§5 read: **"SHALL NOT retire §13 with the gateway. Its subject is the sealing point, which moved — not
the gateway, which is one implementation of it."**

**Withdrawn.** The clause was sound reasoning from a premise, and **the premise was never tested.**

> **Testing it took ONE RUN of the gate against the artefact it would govern.** `composeExecutionPackage`
> → `certifyPackageForSealing`, four lines. **The gate had never been run against a canonical package —
> and that is how the premise survived into a report that governs a cut-over.**

**The attribution is recorded because an unattributed inference reads as a measurement.** *"The subject is
the sealing point, which moved"* was an **inference**, made by the reader of this report and adopted into
§5 as a prohibition. It was reasonable, it was stated confidently, and it was wrong — not because the
reasoning was poor, but because **nothing in the report distinguished it from the measured facts around
it.** A prohibition inherits the authority of the section it sits in.

**The transferable rule, and it generalises past this report:**

> **A prohibition resting on a claim about a control's SUBJECT SHALL state how the subject was
> established.** Where it was inferred rather than run, say so — an inference that reads as a measurement
> is one nobody re-tests, and the cheaper the test, the longer it goes untaken, because a claim that
> could have been checked in one run is assumed to have been.

**This is D-107's class**, and the third instance recorded in this programme: a load-bearing claim,
correct-looking, carried into a governed document, and false when finally measured. **What is different
here is the cost of the measurement** — D-107's and D-117's took a cross-plane read and a deployment
probe; this one took four lines against an artefact already in hand.

## 8.4 THE HOLD — M5 SHALL NOT RUN ON THIS TREE

**Ruled with the ruling above:** *a cut-over measured against a suite that cannot execute is measured
against nothing.*

**Measured 2026-08-06, after the ruling:**

| Suite | Result |
|---|---|
| `functional-testing-engine` | **210/210** · 94/96 `.mjs` (2 pre-existing `todo`) · **0 fail** |
| `capability-framework` | **89/89** · 0 fail |
| `contracts` | **107/107** · 0 fail |
| **`tenant-onboarding-engine`** | **366/379 — 13 FAIL** |

**The thirteen are another session's in-flight ADR-0085 work, and are not this session's.** Its
`functional-testing-engine` half has landed — the package typechecks clean and its suite is green, where
an hour earlier five test files referenced an undeclared `made` binding. **Its `tenant-onboarding-engine`
half has not.** Representative failure:

```
✖ an insecure target address is refused at onboarding for a sign-in class
  assert.ok(result.issues.some((i) => i.code === 'incoherent-application-target'))
  → falsy
```

Validation issue codes have moved in `src/domain/validation.ts` and `onboarding-configuration.ts` ahead
of the assertions that name them. **Nothing in this session touched that package.**

**So M5 waits.** The ruling is taken and the scope is settled; **the deletion does not proceed until
`tenant-onboarding-engine` is green**, because the only honest evidence that a cut-over removed nothing
is a suite that ran before it and ran after it. **Either that edit lands and the suite goes green, or
M5 waits** — and it waits.

## 8.5 What M5 is, when the tree allows it — **FOUR ACTS, ruled 2026-08-06**

**This supersedes the three-act sketch this section first carried.** Act 3 was absent from it, and its
absence would have made M5 a deletion that left the store still empty.

**1 · Retire `packages/tenant-onboarding-engine/ip-execute-gateway.mjs`.**

**2 · Retire `verify-package-governance.js` §13 with it, in the same change** — recording CHARTER
§17.1.1 (ii) and **§8.1's three surviving controls AT THE RETIREMENT SITE**. A retirement that names what
still guards the property is a different artefact from one that leaves a reader to work it out: the first
can be reviewed, the second can only be trusted.

**3 · Wire the canonical authoring path to the writer at stage 7, gated on `decidePublication()`.**
**Measured, and this is the act that makes M5 more than a deletion:** the writer is **built, composed, and
explicitly discarded** —

```ts
// platform-adoption.ts:297-298
const packageWriter = createSealedPackageWriter({ repo, store: packages.store });
void packageWriter;
```

**`void packageWriter;`** is D-122's finding still standing in source: `onPackageSealed` had zero non-test
callers, the writer was built to close that, and it is constructed into a variable that is then thrown
away. **Without act 3 the gateway goes and nothing replaces what it was the only path to** — the store
stays empty, and M5 would have removed a path without connecting its successor.

**4 · Enumerate every remaining gateway reference — INCLUDING `.mjs` FILES AND REGEX LITERALS.**
**Three of the five executable references were invisible to both the compiler and a symbol search** (§1):
two `.mjs` comments and a deny-list **regex literal** in `verify-provider-platform.js:120`. A
build-and-grep-for-the-symbol sweep finds neither. **The enumeration is by search across all file types,
as §1's was**, and it is an act of M5 rather than a check afterwards — a dangling reference found after
the deletion is found by whoever trips on it.

> **`verify-provider-platform.js:120`'s deny-list regex still needs no change** — a forbidden-import
> pattern whose target no longer exists simply never matches. **It must nonetheless be enumerated**, so
> that "needs no change" is a recorded finding rather than an omission that happens to be harmless.

**Then re-run all four suites and confirm the counts against §8.4's green rows.**

## 8.6 Exit criterion

> **The first package ever written to the store, and the first thing the Execution Plane has had to
> retrieve.**

**Not "the gateway is gone".** A deletion is evidence that something was removed; it is not evidence that
anything works. **The store has never held a package** — D-122 measured the writer with zero non-test
callers, D-117's correction measured `SealedPackageStore.put` silently refusing the gateway's body all
along because nothing ever called it, and `void packageWriter;` is that same absence in current source.
**So the exit is the first artefact that has ever completed the path**, and the first retrieval is what
proves the other plane can reach it — which no measurement on this side can establish alone.
