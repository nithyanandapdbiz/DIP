# ADR-0081 — The Execution Package's Detached Signature: its Carrier, its Distribution, and the Completion of the Retrieval Inversion

**Status:** ACCEPTED · **Date:** 2026-08-06
**Discharges:** debt D-123 (the carrier) · debt D-125 (the distribution leg) · [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) §6 steps 4–5

> **ACCEPTED 2026-08-06, WITH TWO PROPOSITIONS THAT AMEND THE RULING THAT AUTHORISED THIS ADR RATHER
> THAN RESTATING IT.** Both are marked in the text where they occur and are recorded here so the
> difference is not lost in the drafting:
>
> - **§3.1 — the ruling said *"close the `HASH_RE` hole IN the scheme."* Drafting found that the
>   obvious way to close it is the wrong one:** loosening the pattern would weaken the control
>   P-79.2's addressing rests on. The parallel `run` segment closes the hole **without relaxing any
>   pattern**, and the reason is now in the decision rather than in a reviewer's memory.
> - **§4 P-81.1 — the write ordering was not in the ruling at all.** It is fail-closed at a **crash
>   boundary**, which is a boundary neither the ruling nor any prior decision on this path had
>   considered, and it is what keeps ADR-0078's taxonomy at four.
>
> **The re-baseline is taken on this acceptance and on nothing else**, clearing the single closure
> leg recorded knowingly in [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md) before this file
> was written.
**Reports:** [`D-123_SIGNATURE_CARRIER_AND_INVERSION_DESIGN_REPORT.md`](../../program/D-123_SIGNATURE_CARRIER_AND_INVERSION_DESIGN_REPORT.md) · [`D-122_WRITER_RULING_DESIGN_REPORT.md`](../../program/D-122_WRITER_RULING_DESIGN_REPORT.md)

> **NO `Closes:` LABEL IS DECLARED, AND THE OMISSION IS DELIBERATE — see §5.4.** This decision
> discharges **AD-016's distribution leg** while [ADR-0007](ADR-0007-package-signing.md) holds its
> **model**. AD-016 is one identifier for two decisions, the closure-uniqueness property admits *one
> decision, one ADR*, and declaring the label would both fail a passing gate and claim more than this
> ADR does.

---

## 1. Problem

**The Execution Plane is contractually required to verify a detached signature it is never sent, using a key it was never given.**

R-20.29 makes verification on retrieval **two checks**, both of which SHALL pass before a retrieved
package is executed: the content-hash match of R-20.28, and the validity of the detached signature
over the canonical form (R-20.22). **The second check is unperformable, and measurement shows the
chain is broken in three places, not one:**

1. **No signer on the write path.** The only `PackageSigner` is an injected port wired *inside a
   generated string*; the signer wired in the deployed tier signs an [ADR-0035](ADR-0035-execution-plane-software-update-management.md)
   solution manifest — a different artefact.
2. **No carrier.** `SealedPackageStore.put` takes one artefact; `GET /api/packages/{hash}` returns
   the body and nothing else; and `ExecutionPackageSchema` correctly carries **no** signature field,
   because R-20.22 makes the signature detached.
3. **No verification key.** Every generated `config/security.json` ships
   `signatureVerificationKeyRef: '<FILL: IP public verification key ref + keyId>'` — **and the same
   function writes the runtime instruction to verify against that field.**

**A writer built against links 1 and 2 alone would store packages the Execution Plane is obliged to
refuse**, producing a pipeline that authors, stores, serves and hash-matches correctly while every
delivery fails the second check — **and the symptom would present on the plane that did nothing
wrong.** That is why this is one decision rather than three.

## 2. Context

### 2.1 The signature was an argument, and arguments have no rest state

Under push, `ExecutionPlaneTransport.execute(pkg, signature)` carried the signature as its **second
parameter**. [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) inverted *who initiates*
and retired that call under P-70.6. **From the direction the inversion was reasoning in, nothing had
moved** — so it stated no home for the signature, and none was noticed missing.

**`put(ctx, sealedBody)` takes one argument where `execute(pkg, signature)` took two.** The
substitution ADR-0070 §6 steps 4–5 describe therefore **drops the signature silently, at a call site
that type-checks.** This ADR exists because that arity change was the whole defect and nothing in
either prior decision was positioned to see it.

### 2.2 What is already correct, recorded so it is not re-opened at the cost of a version move

**Signing over the hex content hash rather than over the canonical bytes is SOUND, and is what the
architecture asks for.** [20 §5](../architecture/20-cross-plane-contracts.md): *"Detached signatures
are specified so that the signature can be verified **without re-serialising the payload**, and so
signing does not perturb the canonical bytes the content hash is computed over."* And the domain is
already bound into the value being signed — `hash(domain, content)` returns `digestV1(domain,
canonical)` — so an execution package's signature is **not** interchangeable with a solution
manifest's, even though one key produces both.

**A reviewer reaching for *"the signature must be over the canonical form, not the hash"* would be
wrong, and would be wrong in a way that costs a major version.** It is stated here because it is the
natural first objection to §4.

### 2.3 AD-016 is not in contradiction; it is one identifier over two decisions

| Source | Says |
|---|---|
| [ADR-0007](ADR-0007-package-signing.md) header | `Closes: AD-016` |
| [08 §5](../architecture/08-security-model.md) heading | *"Package signing and verification — AD-016 resolved"* |
| [20 §8](../architecture/20-cross-plane-contracts.md) | lists **AD-016** under **Open items** |
| 20 R-20.29 | *"Key custody, rotation and customer-side trust material remain AD-016 — **open**"* |

**They are about different halves.** ADR-0007 closed the **model** — asymmetric keys, DBiz-held
signing, verification-only distribution, a key identifier on the package, overlapping validity for
rotation. **All five are decided and none is reopened here.** What R-20.29 correctly calls open is
the **distribution**: how a verification key actually reaches a customer tenancy. **Link 3 is that
gap, and it is not a documentation ambiguity — it is a `<FILL:` marker in emitted customer
configuration.**

**Neither frozen document is wrong. The sentence distinguishing them is what was missing**, and
§5.4 supplies it.

### 2.4 The generator still emits a forbidden call

The only wiring of the canonical composition is a **code generator emitting a string**:
`createExecutionPlaneTransport({ send: (pkg, signature, attempt) => epSend(executionPlaneEndpoint, …) })`.
That code **opens a connection to the Execution Plane**, which P-70.1 forbids in terms — *"It opens
no connection to the Execution Plane, for delivery or for any other purpose."* ADR-0070 §6 steps 4
and 5 have not run.

**So the writer D-122 ruled on IS that substitution**, and it cannot be scheduled separately without
the second silently re-deciding the first.

### 2.5 ADR-0070 §6's own scope no longer describes the tree — measured 2026-08-06

| ADR-0070 §6 / P-70.6 states | Measured |
|---|---|
| *"collapse the **eight** address-holding references"* | **10 references across 7 files** in the launcher tree |
| *"**four** conformance tests (`runtime-enablement-conformance.test.ts:88,103,109,115`)"* | **seven** tests construct the transport, at `:96, :102, :107, :112, :119, :124, :129`. **None of the four cited lines is a test boundary** — `:88` is a fixture declaration and the rest are assertion lines inside other tests |
| *"and **a** registered fault proof (`record-fault-proofs.js:1455`)"* | **five** registered fault proofs patch the transport module, at `:1535–:1580`. **Line 1455 is a proof about a different module** — the runtime SPI executing a browser inside the Intelligence Plane |

> **AN IMPLEMENTER FOLLOWING §6 AS WRITTEN RETIRES THE WRONG THINGS, MISSES FOUR OF THE FIVE FAULT
> PROOFS, AND REPORTS THE STEP COMPLETE.** P-70.6 insists the retirement is *"a scoped step with its
> own evidence … never a side effect of deleting a binding"* — and its own evidence citations have
> drifted into other subjects. This is **debt D-107's class inside a migration step** rather than in
> a state file, and that location is the more consequential of the two: **a stale state-file number
> misinforms a reader; a stale citation in a migration step misdirects an action.**

## 3. Alternatives

| Question | Options | Selected |
|---|---|---|
| **Carrier at rest** | none · embedded in the body · **sibling artefact** · envelope stored whole | **Sibling artefact** |
| **Sibling addressing** | `<hash>.sig` suffix · **parallel `run` segment** | **Parallel `run` segment** — §3.1 |
| **Carrier on the wire** | HTTP header · second route · **retrieval envelope** | **Envelope** |
| **Signing moment** | at retrieval · **at authoring** | **At authoring** |
| **Key distribution** | PEM emitted at generation · fetch-on-demand · **carried by the registration grant, rotated over the existing update channel** | **Registration grant** |
| **Write ordering** | body then signature · **signature then body** | **Signature then body** — §4 P-81.1 |

**Embedding the signature in the body — rejected on two independent grounds, neither of them cost.**
[ADR-0007 §7](ADR-0007-package-signing.md)'s forward obligation: *"Changing the signature scheme —
detached to embedded — would be a **major** contract version, because it alters what verification
operates over."* And `hashableContent` excludes only `provenance.contentHash`, so a top-level
`signature` **would be hashed** and the package would no longer content-address to its own hash — the
key retrieval is performed by.

**A header alone — rejected for the artefact's own reason.** It is the cheapest option and the body
stays byte-identical, so every existing hash check is untouched. **But a header is not part of the
artefact.** [20 §2.2](../architecture/20-cross-plane-contracts.md): *"A sealed artefact can be
cached, replayed, audited, and executed while its author is offline"*, and
[ADR-0015](ADR-0015-execution-package-caching.md) makes caching explicit. **A signature that exists
only in an HTTP response does not survive being written to disk**, and R-20.29 requires verification
*before execution*, which under caching may be long after retrieval. **It would satisfy retrieval and
break replay — and replay is the property the package exists to provide.**

**Signing at retrieval time — rejected.** ed25519 is deterministic, so it costs no storage change and
looks attractive. It changes what the signature **asserts**: from *"the Intelligence Plane authored
this"* to *"the Intelligence Plane served this"*, when origin attestation is ADR-0007's entire model.
It puts the platform's **highest-value asset** (ADR-0007 §2) on the highest-traffic route rather than
on the authoring path exercised once per run. And it leaves the store holding **unsigned** customer
artefacts, which is a different sovereignty posture from the one ADR-0079 was accepted under.

**A PEM emitted at generation time — rejected, and it is the cheapest-looking fix for link 3.**
Filling `<FILL:` with today's public key would close the placeholder and **rebuild the exact coupling
ADR-0007 §6 exists to remove**: rotation would once again require regenerating and redeploying the
customer solution. ADR-0007 makes multiple keys concurrently valid, so **the Execution Plane needs a
key SET resolvable by `keyId`, not a key.**

### 3.1 Why the sibling is a parallel `run` segment and not a `<hash>.sig` suffix

> **THIS AMENDS THE AUTHORISING RULING RATHER THAN IMPLEMENTING IT.** The ruling required the
> `HASH_RE` hole to be **closed IN the scheme, not after it** — *"a `<hash>.sig` that is never purged
> is a retention defect created by the fix"* — and that requirement stands unchanged and is
> correct. **What drafting found is that the obvious way to satisfy it is the wrong one.**

This looks like a naming preference and is not.

`purgeExpired` iterates the partition and **skips every name that fails `HASH_RE`**. A `<hash>.sig`
sibling would therefore never be purged — signatures outliving the packages they sign, an R-06.13 /
C-06.8 breach **created by the fix**. The obvious repair is to loosen `HASH_RE` in the purge loop.

> **THAT REPAIR WEAKENS A SECURITY CONTROL TO CLOSE A RETENTION HOLE.** The same pattern guards
> `keyFor`, where it is the shape check that stops a non-hash segment reaching the storage layer. A
> reviewer relaxing it in one loop invites the next reader to relax it in the constructor, and
> **addressing-by-validated-hash is what ADR-0079 P-79.2 rests on.**

A parallel run segment — `t/<slug>/packages/signatures/<hash>` beside
`t/<slug>/packages/sealed/<hash>` — keeps **both** artefact segments a bare hash, so **no pattern is
relaxed anywhere.** The purge hole becomes an **explicit enumeration change** (purge ranges over both
segments) rather than a loosened regex, and ADR-0010 §6's binding constraint is preserved unchanged:
the tenant-leading prefix is untouched, so `purgeTenant` remains a prefix operation and every
isolation property that depends on it holds.

## 4. Decision

**P-81.1 — The detached signature is a SIBLING ARTEFACT at rest, in the same tenant partition, and THE BODY IS THE COMMIT POINT.**

The signature is stored under a parallel run segment, keyed by the same content hash, so both keys'
artefact segments remain bare hashes and no validation pattern is relaxed (§3.1).

> **THE WRITE ORDER IS LOAD-BEARING AND IS PART OF THE DECISION: SIGNATURE FIRST, BODY SECOND.**
> The body's presence then **implies** the signature's. A crash between the two leaves a signature
> with no package — inert, never served, and purgeable. **The reverse order leaves a package that
> cannot be verified and would still be found**, which is precisely the state this ADR exists to
> prevent.
>
> **THE RULE, STATED AS A RULE BECAUSE IT GENERALISES PAST THIS STORE:**
>
> > **A partial write SHALL fail toward the absence of the thing that is SERVED, never toward the
> > absence of the thing that PROVES it.**
>
> **THIS WAS NOT IN THE AUTHORISING RULING. IT IS AN ADDITION, AND THE BOUNDARY IT GOVERNS IS THE
> REASON IT WAS MISSED.** Every fail-closed property this platform has written governs a **decision
> boundary** — a check that refuses, a resolver that returns `undefined`, a port whose empty case
> refuses rather than succeeds. **This one governs a CRASH boundary**, where nothing decides
> anything and the only question is which half of a two-part write survives. **No prior decision on
> this path had a two-part write, so the boundary had never existed to be reasoned about** — the
> same shape as D-123 itself, where the signature was an argument of a call and had no rest state
> until the call was deleted.
>
> **AND IT IS WHAT KEEPS ADR-0078's TAXONOMY AT FOUR.** Under the reverse order, a crash produces a
> package that is **found, hash-matching, and unverifiable** — which is neither *absent* nor
> *refused* nor any of the four existing result classes, and would have to become a fifth. **The
> ordering removes the state rather than classifying it**, which is the same move P-79.2 makes when
> it refuses another tenant's partition by not addressing it rather than by checking for it.

**P-81.2 — Retrieval serves an ENVELOPE, and the hash is taken over the package member.**

`GET /api/packages/{hash}` returns the package and its signature together. The content hash R-20.28
requires a consumer to recompute is taken over the **package member**, never over the envelope.

**A package whose signature is absent is REFUSED, and it creates no new result class.** The refusal
collapses into P-79.6's single expression — byte-identical to unknown, unowned, expired and
owner-offboarded. **ADR-0078's taxonomy stays at four**; nothing here is distinguishable by a caller,
so no oracle is opened.

**P-81.3 — The purge ranges over the SIGNATURE SEGMENT TOO, and the signature's retention is the package's.**

A signature has no `validity.notAfter` of its own and therefore **no declarable retention** — R-06.9
would forbid holding it at all if it were considered independently. It is retained **exactly as long
as the package it signs** and is deleted in the same sweep. Purge enumerates both segments; the
signature's expiry is derived from its package's body, never from itself, and an orphaned signature
whose package is absent is purged unconditionally.

**P-81.4 — The verification key set is carried by the REGISTRATION GRANT and rotated over the channel the Execution Plane already polls. The `<FILL:` placeholder is removed at its source.**

The Execution Plane receives a **key set resolvable by `keyId`**, not a key:

- **Establishment** — the set is delivered in `RegistrationGrant.configuration`, the *"non-secret
  routing/config map the EP needs"*, at the OTC-authenticated moment
  [ADR-0036](ADR-0036-execution-plane-registration-and-trust-establishment.md) already defines as
  trust establishment. **Verification keys are non-secret by R-08.15** — possession cannot produce a
  signature — so this crosses no boundary INV-2 protects.
- **Rotation** — over the existing update-event channel the EP already polls, which is already
  signed under ADR-0035. **No new endpoint, no customer redeployment, no inbound dependency** —
  ADR-0007 §6's rotation model, unchanged.
- **Generation** — `solution-export` emits a **reference and a resolution rule**, never a PEM and
  never a `<FILL:` marker. **A generated artefact SHALL NOT ship a placeholder in a field a runtime
  instruction it also emits tells the reader to verify against.**

> **WITHOUT P-81.4, P-81.1 AND P-81.2 CHANGE NOTHING OBSERVABLE.** The Execution Plane would still be
> unable to verify, every retrieval would still end in R-20.30's `signature-invalid`, and **D-123
> would read as closed.** That is why this proposition is in this ADR and not sequenced after it.

**P-81.5 — The writer PARSES BEFORE IT PUTS.**

`parseExecutionPackage` runs on the write path before `put` is called, so a package that does not
satisfy the published contract cannot enter the store — and the run that produced it can be named at
the point of refusal.

> **THIS PROPOSITION NUMBER IS RECONCILED, NOT NEWLY ASSIGNED.** `P-81.5` has been cited across the
> registers since the v1.1.0 amendment [D-121](../../program/TECHNICAL_DEBT.md) closed, always with
> this meaning. **ADR-0081 is the ADR those citations were waiting for**, so P-81.5 lands here
> carrying the meaning it was always cited with rather than colliding with a freshly numbered
> proposition. The canonical composition already ends with `return parseExecutionPackage(pkg)`; **what
> this adds is that the WRITE PATH parses too**, closing it against a future second producer.

**P-81.6 — ADR-0070 §6 steps 4 and 5 EXECUTE HERE, as one substitution with the writer.**

`transport.execute(pkg, signature)` becomes the sealed write of `(package, signature)`. The emitted
`send` binding and the `executionPlaneEndpoint` argument are removed from the generator, the
address-holding references collapse, and `createExecutionPlaneTransport` is retired **in this plane**
with its conformance tests and its fault proofs migrated rather than deleted.

**Scheduling this separately from the writer is forbidden by this proposition**, because the second
change would silently re-decide the first: whichever lands last fixes the shape the Execution Plane
parses for as long as the contract lives.

**P-81.7 — The retirement scope is RE-MEASURED AT EXECUTION, never quoted; and evidence is cited by SYMBOL AND COUNT with the date of measurement.**

ADR-0070 §6's figures and line citations have all drifted (§2.5). This ADR therefore records its own
scope as **measured 2026-08-06** and requires it to be **re-measured when the step is performed**, on
the standing rule that **a number in a state file, a register or an ADR is an estimate until it is
measured.**

**Line-number citations into a moving tree are the mechanism that failed**, so evidence in this ADR
and in the change that executes it is cited by symbol name and count, with the measurement's date —
never by a bare line number that no mechanism compares to its subject.

### 4.1 What SHALL NOT be done

- **SHALL NOT embed the signature in the package body** — a major contract version, and it breaks the content addressing retrieval is performed by (§3).
- **SHALL NOT carry the signature only in an HTTP header** — it does not survive caching, and caching is the property the sealed artefact exists to provide (§3).
- **SHALL NOT sign on the read path** — it changes what the signature asserts and widens the highest-value key's exposure (§3).
- **SHALL NOT relax `HASH_RE` anywhere** to accommodate the sibling (§3.1).
- **SHALL NOT emit a verification PEM at generation time** — it rebuilds the redeployment coupling ADR-0007 §6 removed (§3).
- **SHALL NOT record anything on write from which delivery state could be inferred** — P-70.3, P-79.7, R-12.5.
- **SHALL NOT split the retrieval refusal** — one expression, four result classes, unchanged (P-79.6, ADR-0078 P-78.2).
- **SHALL NOT "improve" P-79.2's addressing into a predicate** while touching the store. Every test would still pass: addressing and a predicate agree on every well-formed input and differ only on the attack.

## 5. Consequences

**What improves.** The Execution Plane can perform both checks R-20.29 requires, for the first time.
A cached package carries its own proof, so replay verifies without re-retrieval. The store stops
being permanently empty, and `GET /api/packages/{hash}` stops being a route that cannot succeed. The
Intelligence Plane stops emitting code that opens a forbidden connection. And the customer stops
receiving a security control whose key reference is an unfilled template marker.

**What it costs.** Two artefacts per package where there was one, with a write ordering that must not
be reordered by a later refactor. A purge that enumerates two segments. A retrieval response shape
change and the extension of C-20.13's mutation test to assert the hash is taken over the package
member. The migration of seven conformance tests and five fault proofs. And the registration grant
grows a field, which is an EP-visible change even though it carries no secret.

**What does not change.** The `ExecutionPackage` contract, `CONTRACT_VERSION`, the compatibility
corpus, the content-addressing scheme, ADR-0007's signing model, plane ownership, the twelve-stage
lifecycle, P-79.2's addressing, and ADR-0078's four result classes. **No contract version moves and
no compatibility window opens** — the signature is detached, so nothing about the package's own shape
is touched.

**Risk, and it is one risk rather than several.** **The write ordering is the whole safety property
of P-81.1, and it is invisible in a diff that reorders two adjacent awaits.** A refactor that writes
the body first — for readability, or to fail faster — reintroduces exactly the state this decision
prevents, and **every test over a successful write would still pass**, because the two orders differ
only on a crash between them. The control is that the ordering is stated in the decision, is stated
in the module's own source, and lands with a fault proof that faults the ordering and shows the
refusal branch firing.

### 5.1 One key currently serves two artefact domains — stated, and not resolved here

`loadOrCreateSigningKey` produces a single ed25519 key used for **both** the ADR-0035 solution
manifest and, under this ADR, execution packages. **This is not a forgery risk**: `digestV1` binds
the domain into the value signed, so a manifest signature cannot be replayed as a package signature
(§2.2). It is nonetheless a **key-purpose separation** question, which is custody, which is AD-016's
open leg. Recorded here so that a reader of P-81.4 does not infer that key separation was considered
and rejected. **It was considered and deferred, and distinct key identifiers per artefact domain are
the recommended shape when custody is settled.**

### 5.2 The registration grant becomes trust material, not only routing

`RegistrationGrant.configuration` is documented as the *"non-secret routing/config map"*. After
P-81.4 it also carries the **trust anchor** for every package the tenancy will ever execute. Nothing
secret crosses — verification keys are public by R-08.15 — but **the field's security significance
rises**, and a future change that treats `configuration` as freely extensible routing data would be
extending an artefact that now anchors verification. Stated so the elevation is deliberate.

### 5.3 This ADR makes the store writable, and that is a sovereignty threshold

Until now the sealed package store has held nothing this plane produced. On execution it begins
holding **customer-derived C3 data** for real. Every obligation ADR-0079 discharged — R-06.4's four
conditions, the declared retention read by code, the scheduled purge with its unreadability proof,
the document-06 gate — was discharged **against a store with no writer.** They are unchanged by this
ADR and are now, for the first time, load-bearing rather than anticipatory. **The purge in particular
moves from a control over an empty directory to a control over customer data**, which is the
condition under which its fault proof must be re-run rather than assumed current (R-14.2, R-14.3).

### 5.4 AD-016 cannot express a partially discharged decision, and that is why no label is declared

ADR-0007 declares `Closes: AD-016`. The closure-uniqueness property admits **one decision, one ADR**,
so a second `Closes: AD-016` would fail a currently passing gate. **But this ADR does discharge part
of AD-016** — the distribution leg R-20.29 names as open.

> **THE REGISTER HAS NO SUB-IDENTIFIER, SO THERE IS NO TRUTHFUL LABEL TO WRITE.** Declaring the
> closure would claim ADR-0007's half as well; declaring nothing leaves the discharge untraceable by
> the structural label debt D-116 exists about. **The second is chosen and stated**, because a false
> structural claim is worse than a traceability gap that is written down. **The register's inability
> to represent a decision discharged by two ADRs across two halves is the finding**, and it is
> recorded rather than legislated around here.

## 6. Migration strategy

**Post-acceptance, each step separately authorised; none performed here.** Every step re-measures its
own scope at execution (P-81.7) rather than quoting §2.5's figures.

1. **Amend [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md) and
   [05 — Cross-Plane Communication](../architecture/05-cross-plane-communication.md)** to record the
   carrier: doc 05 takes the **retrieval response shape** (it owns the operation), doc 20 takes the
   **artefact half** — the signature's existence at rest and its binding to the package hash. **The
   split follows ADR-0078 P-78.1 and must not be collapsed into one document.**
2. **P-81.4 first, not last.** The verification key set into the registration grant, the rotation
   path over the update channel, and the `<FILL:` markers removed from `solution-export`. **It is
   sequenced first because it is the only step whose absence makes the others unobservable.**
3. **Build the carrier** — the sibling segment, the write ordering, the envelope, and the purge over
   both segments — **in one change**, with the refusal of a signature-less package proved by an
   executing test whose refusal is asserted **byte-identical** to a never-existing hash's.
   **Completion conditions, not follow-ups:** (a) the write-ordering fault proof, faulting the order
   at its source and naming the branch that fires (R-13.7 clause 2); (b) the orphaned-signature purge
   test; (c) C-20.13's mutation test extended to assert the hash is taken over the package member.
4. **The writer and the transport substitution together** (P-81.5, P-81.6) — `parseExecutionPackage`
   before `put`, `transport.execute` replaced, the generator's `send` binding and
   `executionPlaneEndpoint` argument removed, the address-holding references collapsed.
5. **Retire `createExecutionPlaneTransport` in this plane**, migrating its conformance tests and its
   fault proofs **with their scope re-measured at the time of the step** — never by following
   ADR-0070 §6's citations, which name other subjects (§2.5).
6. **Capture the first real sealed package into the compatibility corpus** — which debt D-117 owes,
   which only becomes possible once one exists, and which SHALL be **captured, never hand-authored**.

**Then, and only then, `verify-contract-compatibility` before and after**, and a full workspace suite
rather than a package suite, so failures name what `tsc` cannot see.

## 7. Version impact

- **No contract version change.** `CONTRACT_VERSION` stays at **1.0.0**; the signature is detached,
  so the package's own shape is untouched and the compatibility corpus stays byte-identical. This is
  the direct consequence of rejecting the embedded alternative (§3).
- **[05](../architecture/05-cross-plane-communication.md) and
  [20](../architecture/20-cross-plane-contracts.md) take version increments** (§6 step 1). Both stay
  FROZEN; the amendments are additive.
- **[ADR-0079](ADR-0079-retrievable-package-store.md) P-79.5 is amended, narrowly and explicitly.**
  *"The content is the sealed body and its provenance. Nothing derived"* is preserved as written — a
  detached signature **is not derived from the body**, and cannot be recomputed from it — but a
  reader applying it literally would refuse the sibling. The amendment states the sibling's
  admissibility rather than weakening the sentence.
- **ADR-0007 is enforced, not superseded.** Its model, its rotation mechanism and its forward
  obligation are all relied upon unchanged.
- **Gate count +0 on acceptance.** The properties added by §6 step 3 are completion conditions on
  existing gates and suites, not a new registered gate. If execution shows a new gate is warranted,
  it lands **with its recorded fault proof in the same change** (CHARTER §18, R-13.4, R-13.7).
- **Closure baseline:** adding this ADR turns `verify-programme-closure`'s *"no ADR has been added
  since closure"* leg **RED, deliberately and on exactly one leg** — recorded in
  [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md) **before the file was written**, on ADR-0078's
  precedent. It clears by a reviewed re-baseline **on acceptance**, never as a side effect.

## 8. Affected components

- [`ADR-0081-execution-package-signature-carrier.md`](ADR-0081-execution-package-signature-carrier.md) — **New** (this ADR).
- [`20-cross-plane-contracts.md`](../architecture/20-cross-plane-contracts.md) — **Amended** on execution (§6 step 1: the artefact half of the carrier).
- [`05-cross-plane-communication.md`](../architecture/05-cross-plane-communication.md) — **Amended** on execution (§6 step 1: the retrieval response shape).
- [`ADR-0079-retrievable-package-store.md`](ADR-0079-retrievable-package-store.md) — **Amended** on execution (§7: P-79.5 admits the sibling).
- [`ADR-0070-execution-package-retrieval-inversion.md`](ADR-0070-execution-package-retrieval-inversion.md) — **Amended** on execution (§6 steps 4–5 executed; §2.5's citations corrected at their source).
- `packages/platform-providers/src/storage/sealed-package-store.ts` — **Amended** (P-81.1, P-81.3: the sibling segment, the write ordering, the purge over both segments).
- `packages/platform-providers/src/storage/sealed-package-purge.ts` — **Amended** (P-81.3: the purge driver ranges over both segments).
- `packages/tenant-onboarding-engine/src/engine/package-retrieval.ts` — **Amended** (P-81.2: the envelope, and the refusal of a signature-less package).
- `packages/tenant-onboarding-engine/src/engine/registration.ts` — **Amended** (P-81.4: the verification key set in the grant).
- `packages/tenant-onboarding-engine/src/engine/solution-export.ts` — **Amended** (P-81.4: the `<FILL:` markers removed at their source).
- `packages/tenant-onboarding-engine/src/engine/package-signing.ts` — **Amended** (P-81.4: the published key set and its `keyId` resolution).
- `packages/tenant-onboarding-engine/src/server/platform-adoption.ts` — **Amended** (P-81.4, P-81.6: the signer on the write path).
- `packages/functional-testing-engine/src/runtime-execution-spi.ts` — **Amended** (P-81.6: the transport substitution).
- `packages/functional-testing-engine/src/runtime-entry-point-bridge.ts` — **Amended** (P-81.5, P-81.6: parse before put; the sealed write replaces dispatch).
- `packages/functional-testing-engine/src/runtime/execution-plane-transport.ts` — **Retired in this plane** on execution (§6 step 5, P-70.6).
- `packages/functional-testing-engine/launcher/generator/generateBindings.mjs` — **Amended** (§6 step 4: the `send` binding and the endpoint argument removed).
- `governance/verification/record-fault-proofs.js` — **Amended** (§6 steps 3 and 5: the write-ordering proof added; the five transport proofs migrated).
- [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md), [`TECHNICAL_DEBT.md`](../../program/TECHNICAL_DEBT.md), [`DECISIONS.md`](../../program/DECISIONS.md), [`NEXT_ACTION.md`](../../program/NEXT_ACTION.md) — **Amended** (the knowing red, D-123 and D-125, the ADR index row, the next action).

**No frozen architecture document, no contract, no gate and no source file is modified BY THIS ADR.**
Every amendment above is a consequence of §6 and is performed on execution, each step separately
authorised.

---

> **STOP FOR ACCEPTANCE.** R-18.26 gates implementation on this ADR being accepted, with an impact
> analysis, a migration strategy and a governance review, **before implementation**. §5 is the impact
> analysis and §6 is the migration strategy. **Nothing in §6 is performed, and nothing is written to
> the sealed package store, until acceptance is recorded here.**
>
> **On acceptance:** re-baseline deliberately, review the diff, and confirm that only this ADR moved.
