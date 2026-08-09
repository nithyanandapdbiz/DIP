# D-122 — who writes to the sealed package store. Reported before building.

**2026-08-06, from `8b2bcd8`. Nothing was built. Nothing in the repository was modified by the
measurements below; the store was rooted in a temporary directory and removed.**

> **THE FOUR QUESTIONS ARE ANSWERED, AND THREE OF THE FOUR ARE ANSWERED BY SOMETHING ALREADY ON
> DISK RATHER THAN BY PREFERENCE.** An admissible writer exists and was executed against a real
> store: **`composeExecutionPackage` produces a package the store ACCEPTS, RETRIEVES BYTE-IDENTICAL,
> AND `parseExecutionPackage` PARSES** — §2. Its home is not a choice either: doc 12 already names
> **stage 7, Execution Planning**, as the stage that *"authors the sealed execution package"* — §3.
>
> **AND THE MEASUREMENT FOUND A FIFTH THING THAT IS NOT IN THE ORIGINAL FOUR, AND IT BLOCKS THE
> BUILD RATHER THAN COMPLICATING IT.** Under **pull**, the detached signature R-20.29 obliges the
> Execution Plane to verify **has no carrier**. `put` stores a body; `GET /api/packages/{hash}`
> returns that body; **no field, header or second route carries a signature.** The signature was an
> argument of the *push* call ADR-0070 P-70.6 retired, and the inversion never re-provided it. **A
> writer built today produces packages the EP is contractually required to refuse** — §6. This is
> recorded as **D-123**.
>
> **THE RECOMMENDATION IS THEREFORE: RULE ALL FOUR AS BELOW, AND SEQUENCE THE BUILD BEHIND D-123.**

---

## 1. What was established first, because it changes the question

**The canonical path's terminus is still PUSH.** The only wiring of the canonical composition in the
tree is a **code generator that emits a string**:
[`generateBindings.mjs:36-41`](../packages/functional-testing-engine/launcher/generator/generateBindings.mjs)
composes `createExecutionPlaneTransport({ send: (pkg, signature, attempt) => epSend(executionPlaneEndpoint, …) })`
and hands it to `createRuntimeExecutionSpi(signer, transport)`. That code **opens a connection to the
Execution Plane**, which P-70.1 forbids in terms — *"It opens no connection to the Execution Plane,
for delivery or for any other purpose"* — and it is the module ADR-0070 **§6 steps 4 and 5** were
written to remove. Neither step has run.

> **SO D-122 IS NOT "A STORE WITH NO WRITER" BESIDE "AN UNFINISHED INVERSION". IT IS ONE THING.**
> The writer that must exist is exactly the substitution ADR-0070 §6 steps 4–5 describe:
> `transport.execute(pkg, signature)` becomes `store.put(ctx, pkg)`. Ruling on the writer *is*
> completing the inversion, and the two must not be scheduled as separate work — the second would
> silently re-decide the first.

This is why the fifth finding surfaced at all. `execute(pkg, signature)` takes **two** arguments and
`put(ctx, sealedBody)` takes **one**. Substituting the second for the first drops the signature on
the floor, and nothing in either ADR notices.

## 2. Question (i) — what authors a package that `put()` accepts

> **THE CANONICAL COMPOSITION. MEASURED, NOT PREFERRED.**

`composeExecutionPackage`
([`canonical-authoring-composer.ts:48-108`](../packages/functional-testing-engine/src/canonical-authoring-composer.ts))
was driven against a real `SealedPackageStore` over a real `FilesystemStorageProvider`, with a
fail-closed ownership resolver, in `carlisle-homes`' partition.

### SUBJECT

```
composed top-level keys
  capabilityId, contractVersion, correlationId, directives, evidenceRequirements,
  gates, operations, proceed, provenance, runId, validity          -- all 11, provenance PRESENT

provenance.contentHash
  { "algorithm": "sha256-jcs-v1",                                  -- ADR-0005 canonical, not transport bytes
    "domain": "dbiz.execution-package@1",
    "value": "292849499f44ae43b4af6a65e8c968ea70290d0f0e669db0f53b70ff6646f263" }

store.put(composed package)      -> ACCEPTED, hash 292849…f263
store.get(hash)                  -> found
parseExecutionPackage(retrieved) -> PARSED, contractVersion 1.0.0
bytes identical to what was put  -> true
```

### The controls, because a single acceptance proves nothing about a store that accepts anything

```
CONTROL 1  store.put(same composer, tenantId "tnt-000000000000")
             -> REFUSED: provenance.tenantId "tnt-000000000000" does not resolve to exactly one tenant
CONTROL 2  store.put(the gateway envelope)        -> REFUSED: sealed body carries no provenance.tenantId
CONTROL 3  store.put("{}")                        -> REFUSED: sealed body carries no provenance.tenantId
```

> **CONTROL 1 IS THE ONE THAT CARRIES THE PROOF, AND CONTROLS 2 AND 3 ARE WHY.** The gateway
> envelope and the empty object `{}` are refused with the **same bytes**. So the D-121 refusal, read
> alone, does not distinguish *"this package is wrong in a specific way"* from *"this is not a
> package at all"* — it is the fallthrough refusal, reached by anything without `provenance`.
> **Control 1 is a well-formed package, refused on a later field, for a stated reason**, which is
> what shows `put` reading and asserting rather than rejecting everything unfamiliar. §9's method,
> applied to this report's own subject.

### Why nothing else is a candidate, and why the gateway cannot be made one

`composeExecutionPackage` is the **only** function in the tree that constructs an `ExecutionPackage`.
`ip-execute-gateway.mjs` is not an incremental repair away from being a second:

| | The gateway | The composer |
|---|---|---|
| `@dbiz/contracts` | **not imported at all** | imported; `hash`, `parseExecutionPackage` |
| contract version | `const CONTRACT = "1.0.0"` — a string literal, so it would not follow a version move | from the contract |
| content hash | `sha256` over **transport bytes** — **not a value `ALGORITHM_VERSIONS` admits** | `sha256-jcs-v1` over the JCS canonical form (R-20.20, R-20.22) |
| validation before emitting | none | **`parseExecutionPackage(pkg)` on the return path** |

Its retirement is already scheduled in its own header — **ADR-0049 M5** — and
`verify-runtime-cutover-readiness.js` already gates it.

> **P-81.5 IS ALREADY DISCHARGED AT THIS PRODUCER.** The composer's last statement is
> `return parseExecutionPackage(pkg)`. What P-81.5 still owes is that **the WRITER parses too** —
> so that a future producer cannot reach `put` without passing the contract. That is one line at the
> write site and it is a completion condition, not a follow-up (§7).

## 3. Question (ii) — where the write belongs

> **STAGE 7, EXECUTION PLANNING. THE ARCHITECTURE ALREADY SAYS SO, AND THE OTHER TWO OPTIONS ARE
> NOT MERELY WORSE — THEY ARE UNAVAILABLE.**

[`12-capability-orchestration.md:23`](../docs/architecture/12-capability-orchestration.md):

```
| 7 | Execution Planning | IP | Author the sealed execution package |
```

**"At certification" is impossible by the lifecycle's own ordering.** Certification is **stage 11**;
the Execution Plane's execution is **stage 8** ([`stages.ts:34-57`](../packages/capability-framework/src/stages.ts)).
A package written at certification would be written **after the run it exists to enable**. This is
not a trade-off to weigh; it is a contradiction, and it is worth stating because "seal it when we
certify it" is the natural-sounding option a later reader will propose.

**"A separate publication step" is a thirteenth stage, and R-12.18 forbids one.** *"There is exactly
one orchestration lifecycle for the platform. A capability may extend the framework internally; it
SHALL NEVER redefine or bypass it."* A publication step outside the twelve is a redefinition however
it is packaged.

**What is genuinely open — and it is the only open half of this question — is whether STORING is part
of AUTHORING or a distinct act inside stage 7. P-70.1 binds them:**

> *"The IP's obligation ends when a sealed package **exists and is retrievable**."*

One obligation, two conjuncts. **Authoring without storing does not discharge stage 7.** That is the
defect in one sentence, and it is why this is a ruling: nothing anywhere currently says that stage 7
is incomplete, because doc 12's table stops at *"author"* and P-70.1's second conjunct lives in an
ADR that describes retrieval.

### And stage 7 as built authors no package at all

[`canonical-runner-capability.ts:277-281`](../packages/functional-testing-engine/src/canonical-runner-capability.ts) —
stage 7 emits `{ planned: true, components: N }`, **a count**. The package is composed at
[`runtime-entry-point-bridge.ts:111`](../packages/functional-testing-engine/src/runtime-entry-point-bridge.ts),
**after `runThroughRunner` has returned all twelve stages**. So the artefact doc 12 assigns to stage 7
is produced **outside the twelve-stage lifecycle entirely**, by the bridge. Recorded as **D-124**.

This is not an argument against stage 7 as the answer. It is the reason the answer needs ruling: the
place the architecture names is currently empty, and the place the package is actually built is
outside the lifecycle that governs it.

## 4. Question (iii) — what decides that a run's package SHOULD be retrievable

> **TWO DISCRIMINATORS ALREADY EXIST, BOTH ARE FAIL-CLOSED, AND NEITHER WAS BUILT FOR THIS.
> THE RECOMMENDATION IS TO RULE THEM SUFFICIENT AND INTRODUCE NO THIRD.**

**1 — Certification.** [`runtime-entry-point-bridge.ts:103-108`](../packages/functional-testing-engine/src/runtime-entry-point-bridge.ts)
throws when `!certification.certified`, **before** composition. An uncertified run produces no
package to store. R-12.14's shape exactly: a failed review halts the run, it does not annotate it.

**2 — Ownership resolution, and this one is stronger than it looks.** A reference or in-reference run
carries `tenantId: 't1'`
([`canonical-runtime-integration-conformance.test.ts:148`](../packages/functional-testing-engine/test/canonical-runtime-integration-conformance.test.ts)),
which resolves to no tenant, so `put` refuses it — **measured, control 1 above**.

> **A REFERENCE RUN CANNOT POLLUTE A CUSTOMER PARTITION, BY CONSTRUCTION, AND THAT PROPERTY HOLDS
> TODAY BEFORE ANYTHING IS BUILT.** It is a consequence of P-79.2's registry lookup being
> fail-closed, not of anything anyone wrote to keep test data out of the store. It is recorded here
> so that a later change to the resolver is understood to be load-bearing on this too.

**What they do not decide, and what the ruling must therefore state:**

| | Ruling owed | Recommendation | Why |
|---|---|---|---|
| `proceed: false` | is a typed refusal retrievable? | **YES — retrievability is NOT conditioned on `proceed`** | ADR-0038 §4.3 / R-12.14 make a typed refusal a *valid signed package*, authored precisely so the EP learns it must not execute. A refusal that cannot be retrieved is a silent one, which is the failure R-12.14 exists to prevent |
| `directives.mode` | does `dry-run` discriminate? | **NO** | R-04.6 / R-14.10: dry-run *"differs only inside the adapter"*. A dry-run package is still EP work |
| every other axis | — | **introduce nothing** | P-79.5 and ADR-0079 alternative D already rejected derived state beside the package; a retrievability flag is that, one field smaller |

So: **every package composed on a certified run for a resolvable tenant is retrievable, and
everything else already fails closed.** Nothing new is introduced, and the ruling's content is
mostly the recognition that this is already true.

## 5. Question (iv) — whether that decision is a capability's or the platform's

> **THE PLATFORM'S. THIS ONE IS VERY NEARLY FORCED BY RULES THAT ALREADY EXIST.**

- **C-11.11 — no framework code branches on a capability identity.** A per-capability publication
  rule is precisely that branch, wherever it is written.
- **R-12.18 — one lifecycle, never redefined.** Stage 7 is the platform's stage. Whether its output
  is retrievable is a property of the lifecycle, not a capability's option within it.
- **The capability's contribution is already expressed and is already sufficient.** `proceed` and
  the certification verdict are **per-run** signals a capability emits through the framework. They
  discriminate everything §4 says needs discriminating, and they do it without any component
  knowing which capability it is serving.

**The one axis a capability may legitimately vary is `validity`** — how long its package stays
usable. That is already a contract field, already bounded by the store's C3 ceiling under P-79.4
(`min(validity.notAfter, storedAt + 90d)`), and needs no new mechanism.

**Counter-argument, stated because it is the strongest one available:** Functional Testing is today
the only capability that composes a package at all, so a platform-level rule is being written from a
population of one. That is true, and it is an argument for *writing the rule now* rather than later —
the second capability to author a package will inherit a decision, and the only question is whether
it inherits one that was made or one that was defaulted into.

## 6. The fifth finding — the detached signature has no carrier, and it blocks the build

> **RECORDED AS D-123. THIS IS NOT A REFINEMENT OF THE RULING; IT IS A PRECONDITION OF ACTING ON IT.**

**R-20.29** ([`20-cross-plane-contracts.md:67`](../docs/architecture/20-cross-plane-contracts.md)):

> *"Verification on retrieval is **two checks**, and **both SHALL pass** before a retrieved package is
> executed: the content-hash match of R-20.28, and **the validity of the detached signature over the
> canonical form** (R-20.22)."*

**Check two is unperformable as built.**

| | |
|---|---|
| `SealedPackageStore.put(ctx, sealedBody)` | takes **one** artefact — the body. No signature parameter, no signature field read ([`sealed-package-store.ts:216-253`](../packages/platform-providers/src/storage/sealed-package-store.ts)) |
| `GET /api/packages/{hash}` | returns `JSON.parse(result.body)` and nothing else — **no envelope, no header, no second route** ([`package-retrieval.ts:253-257`](../packages/tenant-onboarding-engine/src/engine/package-retrieval.ts)) |
| `ExecutionPackageSchema` | has **no signature field**. The contract is deliberately signed by a **detached** signature (R-20.22), so the body correctly does not carry one |
| the only `PackageSigner` | is the SPI's **injected port**, wired nowhere but the generated bindings string — and it returns a `SignatureEnvelope` that `transport.execute(pkg, signature)` carries as its **second argument** |
| the only wired `signPackage` in the deployed tier | [`api.ts:275`](../packages/tenant-onboarding-engine/src/engine/api.ts) — signs a **solution update manifest** under ADR-0035. **A different artefact entirely.** It is named here so nobody mistakes it for this one |

> **THE SIGNATURE WAS AN ARGUMENT OF THE CALL THE INVERSION DELETED.** Under push it travelled beside
> the package. Under pull there is no call, and ADR-0070 — which changed *who initiates* — never
> stated where the signature goes, because from the direction it was reasoning in, nothing had moved.
> ADR-0079 stores *"the sealed body and its provenance. Nothing derived"* (P-79.5), and a detached
> signature is not derived from the body — **it is a second artefact with no home in either decision.**

**Consequence, stated plainly:** a writer built today stores a body the Execution Plane can retrieve,
hash-match, and is then **contractually required to refuse** for want of a signature it was never
sent. That would be a working pipeline whose every delivery fails the second check — and it would
look like an Execution Plane defect.

**This is not in scope for this report to settle.** It touches R-20.22, R-20.29, ADR-0007's signing
model, AD-016 (key custody, open by name at doc 20 §8), P-79.5's *"nothing derived"*, and the
retrieval response shape. It is an ADR.

## 7. What the ruling owes, in order, and what must not be done

**Owed with the ruling:**

| # | Owed | State |
|---|---|---|
| 1 | **D-123 settled** — where the detached signature lives under pull | **BLOCKING.** An ADR. Nothing should be written to the store until it is ruled |
| 2 | **P-81.5 at the writer** — `parseExecutionPackage` before `put` | Ready. One line. The composer already parses; this closes the path against a future second producer |
| 3 | **A compatibility fixture captured from a REAL sealed package** — D-117 owes it | **Now constructible for the first time.** §2 produced one: hash `292849499f44ae43b4af6a65e8c968ea70290d0f0e669db0f53b70ff6646f263`. It must be **captured**, never hand-authored — that is the whole point, and D-120 records what a hand-authored corpus is worth |
| 4 | **A write-side companion to the fail-open/fail-closed design law** (doc 05 v1.3, beside R-05.27) | Owed. The read side satisfies the law perfectly and is permanently unable to succeed; nothing distinguishes *correctly empty* from *never fillable* |
| 5 | **ADR-0070 §6 steps 4 and 5** performed as part of the same change | Not separable — §1 |

**What must NOT be done, each with the rule that forbids it:**

- **Do not make `ip-execute-gateway.mjs` a writer.** §2. Its retirement is ADR-0049 M5.
- **Do not add a listing endpoint.** ADR-0079 alternative D, rejected — a derived index is a second
  record of ownership that can disagree with the sealed body.
- **Do not record anything on write that a delivery state could be inferred from.** P-70.3, P-79.7,
  R-12.5.
- **Do not introduce a thirteenth stage.** R-12.18.
- **Do not "improve" P-79.2's addressing into a predicate** while touching this path. Every test
  would still pass; addressing and predicate differ only on the attack.

## 8. C-05.11's extension — the emptiness is invisible to the OPERATOR, not only to the EP

**C-05.11** ([`05-cross-plane-communication.md:176`](../docs/architecture/05-cross-plane-communication.md))
requires a retrieval refusal to be *indistinguishable* between an unknown hash and an unowned one,
and P-70.4 clause 3 is its source. **It is correct and is not being questioned.**

> **THE EXTENSION: THE PROPERTY WAS REASONED ABOUT AS A CUSTOMER-FACING CONFIDENTIALITY GUARANTEE,
> AND IT IS ALSO AN OPERATOR-FACING BLINDFOLD.** *"The store is empty"*, *"that package is not
> yours"*, *"that package expired"* and *"that tenant was offboarded"* are **byte-identical over
> HTTP to every caller** — customer, Execution Plane, and platform operator alike. There is no
> privileged principal for whom the signal separates: a global principal is **refused outright**
> at [`package-retrieval.ts:216-221`](../packages/tenant-onboarding-engine/src/engine/package-retrieval.ts),
> deliberately and correctly, so an operator has *less* visibility than a tenant, not more.
>
> **The only way to learn that the store has never held anything is to read the source or the
> mount.** That is why D-122 went unnoticed while `GET /api/packages/{hash}` was deployed,
> authenticated, tenant-partitioned, gated, and green.

**This is not a defect in C-05.11 and SHALL NOT be repaired by weakening it.** A discriminating
refusal for operators is the oracle P-70.4 exists to deny, reachable by anyone who can obtain an
operator credential. The correct repair is on the **write** side — §7 item 4 — where an
*is-anything-ever-written* property can be asserted without any caller learning anything about any
package.

**Where this must eventually land:** doc 05 is canonical architecture at v1.3 and is amended by
ruling, not by a report. C-05.11's text needs no change; what is owed is that the **consequence** be
recorded where the next reader of the criterion meets it. Recorded here and carried on **D-122**.

## 9. The eighth issue, and the lesson is larger than the count

D-121 recorded **seven** required fields never sent. The measured figure is **eight**.

```
runId · correlationId · capabilityId · directives · gates · evidenceRequirements · provenance
                                                                    -- the seven, all top-level
validity.reusableWhileUnavailable          expected boolean, received undefined
                                                                    -- the eighth, NESTED
```

Measured again in §2's probe, at its own level:

```
composed validity  { "notBefore": …, "notAfter": …, "reusableWhileUnavailable": true }
gateway  validity  { "notBefore": …, "notAfter": … }
```

> **`validity` IS EMITTED. IT IS THE INCOMPLETENESS INSIDE A SECTION THAT IS PRESENT THAT THE CENSUS
> COULD NOT SEE — AND THE CENSUS WAS THE INSTRUMENT.** A top-level field census answers *"is this key
> present?"* and returns the same value for a section that is complete and a section that is
> present-and-partial. The divergence D-121 found is **one level deeper than the entry that found
> it**, and the depth was not a property of the defect — it was a property of the instrument.
>
> **This is CHARTER §17.1's shape at a different target.** §17.1 asks whether a number moves when
> the thing it counts moves. This asks whether a census **can range over the dimension the defect
> lives in**. An instrument that cannot is not wrong; it is silent, and silence reads as absence.
> **The general obligation: a census reports the depth it ranged to, so that its silence is
> distinguishable from a clean result.**

The eighth field matters on its own terms too. `reusableWhileUnavailable` is the field R-22.5 binds —
*"a cached package is not exempt from expiry"* — so it is exactly the kind of field whose absence
defaults to whatever a consumer assumes.

## 10. The method, and it is the same method a third time

§2's controls are D-121 §5's controls, one layer in again. **Controls 2 and 3 returning identical
bytes is the finding**, not a redundancy: it shows that the refusal D-121 read as *"the gateway's
shape is wrong"* is the same refusal `{}` earns, so on its own it establishes only *"not a package"*.
Control 1 — a well-formed package refused on a stated later field — is what shows `put` reading.

Offered as **CHARTER §18 clause 3** and **deliberately not written into the CHARTER**, which is
constitutional and amended through ADR-0019 by ruling. The proposed clause is at
[`CHARTER_18_CLAUSE_3_PROPOSED.md`](CHARTER_18_CLAUSE_3_PROPOSED.md), with its text, its scope, the
runs that motivated it, and the argument against adopting it.

## 11. Reproduction

The probe imports `composeExecutionPackage`, `SealedPackageStore`, `FilesystemStorageProvider` and
`parseExecutionPackage` from the built `dist/` trees, constructs the three canonical-result paths the
composer actually reads, and drives a store rooted in a temporary directory with a fail-closed
resolver stub matching `resolveSlugByTenantId`'s `hits.length === 1` semantics. The temporary root is
removed at the end. **No repository file was read for writing and none was modified.**
