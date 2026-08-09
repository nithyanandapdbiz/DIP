# D-123 link 1 — what signs the package, and when

**2026-08-06. Reported before building, and before the ADR-0049 M5 cut-over. Nothing built.**

> **FOUR ANSWERS, ONE CORRECTION TO THE PREMISE, AND ONE FINDING THAT WAS NOT ASKED FOR AND IS THE
> most urgent of them.**
>
> **(1) Nothing signs a package today, and there are TWO COMPETING SHAPES for the answer** —
> `SignatureEnvelope` and `DetachedSignature` share **not one field name** on the two fields that
> matter. **The writer I built last session takes `signature: unknown`, so whichever shape crosses
> first fixes what the Execution Plane parses.** That is D-122's ruling shape one artefact down, and
> it is unmade. §1.
>
> **(2) Same key, same mechanism, different artefact domain.** One ed25519 key signs the ADR-0035
> manifest today and would sign packages. Not a forgery risk — `digestV1` binds the domain — but
> key-*purpose* separation is unresolved. §2.
>
> **(3) R-6.3 says credential custody belongs EXCLUSIVELY to the Execution Plane, and this plane
> holds a private key on disk. Both are correct and the reconciling sentence is not written.** §3.
>
> **(4) Sign at AUTHORING — and D-122 genuinely could not have given this answer.** §4.
>
> **AND THE PREMISE ABOUT D-125 IS STALE: the `<FILL:>` is gone.** What remains is narrower and
> sharper — **the one registered tenancy holds no verification key at all**, and registration is a
> once-per-tenancy event. §5.

---

## 1. What signs a package today: nothing — and two shapes compete to be the answer

| Mechanism | State | Signs |
|---|---|---|
| `package-signing.ts` — `loadOrCreateSigningKey`, `signContentHash`, `verifyContentHash` | **Real, persisted, wired in the composition root** | the **ADR-0035 solution manifest** |
| The SPI's `PackageSigner` port | a port, wired **only inside a generated string** (`generateBindings.mjs`) | nothing that runs |
| `ip-execute-gateway.mjs`'s inline ed25519 | a **dev harness** that binds `127.0.0.1` and exits on production | its own envelope, which cannot enter the store (D-121) |

### 1.1 THE FINDING THAT WAS NOT ASKED FOR — two types for one concept, and no field name in common

```
SignatureEnvelope   { signature,  signingKeyId, algorithm }   functional-testing-engine
DetachedSignature   { value,      keyId,        algorithm }   tenant-onboarding-engine
```

**The two fields that carry the signature and the key share NO name between them.** `signature` vs
`value`; `signingKeyId` vs `keyId`. Only `algorithm` agrees.

> **THIS IS D-117'S SENTENCE AT A DIFFERENT ARTEFACT** — *"the shapes share no required field
> name"* — and it survives for D-117's reason: **nothing has ever carried a signature across the
> boundary, so nothing could disagree.**

**And it is live rather than historical, because of what I built last session.** The writer's event
takes `signature: unknown` and serialises whatever it is given. **So the first component to sign a
real package fixes the shape the Execution Plane must parse, for as long as the contract lives** —
which is exactly the decision D-122 refused to let a plumbing change make. **The same refusal
applies here, one artefact down, and it is why this is reported rather than picked.**

**The ruling owed:** one shape, named in the contract package beside `EvidenceReferenceSchema` and
`ExecutionPackageSchema` — not in either consumer. Neither existing type is in `@dbiz/contracts`
today, which is why they could drift.

## 2. The key: same key, same mechanism, different artefact domain

One ed25519 key, persisted at `<stateDir>/signing/ep-package-signing.pem` (mode `0600`), loaded once
at boot. It signs the ADR-0035 solution manifest today and is the key P-81.4 already publishes the
public half of.

**Not a forgery risk, and the reason is worth keeping:** `hash(domain, content)` returns
`digestV1(domain, canonical)`, so `dbiz.execution-package@1` is **inside the value being signed**. A
manifest signature cannot be replayed as a package signature even under one key.

**But key-purpose separation is a different question and is unresolved** (ADR-0081 §5.1 recorded it
as deferred, not rejected). One key means one revocation blast radius: revoking it because a
solution-manifest signing path was compromised also invalidates **every execution package in every
tenancy's validity window**.

**Recommendation:** distinct **key identifiers per artefact domain**, resolved from the same custody.
ADR-0007 §6 already makes the key identifier imply the algorithm and makes rotation a first-class
operation, so this needs no new mechanism — only a second identifier and the discipline of signing
each domain under its own.

## 3. Where the key lives, and R-6.3 — two correct rules with no written reconciliation

| Source | Says |
|---|---|
| **R-6.3** (constitution, Rule 6 *"Secrets never cross"*) | *"Credential custody belongs **exclusively** to the Execution Plane."* |
| **R-08.15** (doc 08) | *"**Signing keys are DBiz-held.** Verification keys are distributed to customer tenancies and are public-verification only."* |
| **ADR-0007 §4** | *"Signing keys are DBiz-held and never distributed."* |

**Read literally, R-6.3 forbids what R-08.15 requires.** The Intelligence Plane holds an ed25519
private key on disk, in a mounted state volume.

**They are reconciled by SCOPE, and the scope is inferable but unwritten.** Rule 6 is titled
*"Secrets never cross"*, and R-6.1 is *"only credential **references** cross the plane boundary"* —
so R-6.3 governs **credentials that would otherwise cross**: the customer's credentials, which the
IP must never hold. **A DBiz package-signing key never crosses.** Only its public half is
distributed, and possession of that cannot produce a signature (R-08.15).

> **THIS IS AD-016'S SHAPE EXACTLY, AND IT IS THE SECOND TIME IN THIS PROGRAMME:** two rules that
> appear to conflict, whose reconciliation every reader must re-derive because no sentence states
> it. AD-016's model/distribution split cost a paragraph in ADR-0081 §2.3; this costs one sentence
> in the next ADR. **A reader who resolves it the other way concludes the platform is in
> constitutional violation** — and would be reasoning correctly from what is written.

**Recommendation:** the ADR states, in one sentence, that R-6.3 governs **customer** credentials and
that DBiz's own signing key is R-08.15's subject. **Not a new rule — the sentence that stops the
next reader re-deriving it, or deriving it wrongly.**

### 3.1 An operational fact about the key that is worse than the rule question

`loadOrCreateSigningKey` **generates and persists a new key pair when the file is absent.** That is
correct for first boot and is a **silent identity change** on any boot where the volume is empty —
a re-provisioned mount, a restored-without-state container, a mis-set `DBIZ_STATE_DIR`.

> **The plane would come up healthy, sign packages under a NEW `keyId`, and every verification key
> already distributed would stop matching.** The failure surfaces in the customer's plane, as
> `signature-invalid` under R-20.30 — **on the plane that did nothing wrong**, which is the same
> asymmetry D-123 was raised about.

**It is a single-replica, unversioned, operator-editable file** — D-114's class (the tenant registry)
on a second subject, and this one is the platform's **highest-value asset** by ADR-0007 §2.

**Recommendation:** absence of the key at boot is a **loud refusal in a deployment that has ever
issued one**, not a silent creation. Distinguishing *first boot* from *lost volume* needs a marker
this report does not design; naming it is the point.

## 4. Signing at authoring, not at publication — and D-122 could not have answered this

> **THE SIGNATURE ATTESTS ORIGIN: *"the Intelligence Plane authored this."* So it belongs to the act
> that authors.**

**ADR-0007 already settled the adjacent case and its reasoning transfers.** Signing at *retrieval*
was rejected because it changes what the signature asserts — from *authored* to *served*.
**Publication is nearer retrieval than authoring**: it is a decision about whether an artefact
becomes fetchable, taken after the artefact exists.

**And the answer is only available now, which is the part worth recording.** D-122 read P-70.1's
*"exists and is retrievable"* as **one obligation** — so there was no distinct authoring moment for a
signature to attach to, and *"when is it signed?"* had no well-formed answer. **Two acts give it
one.**

**The writer already assumes it, and that is a check rather than a coincidence.**
`PackageSealedEvent { package, signature, verdict }` takes the signature **as an input** — it is not
produced at the write. A design that signed at publication would have needed a signer injected into
the writer, and the shape built last session has no such dependency.

**One consequence, stated so it is not discovered later:** an authored-but-**unpublished** package is
signed. **That is correct.** It is inert — nothing serves it — and the signature asserts authorship,
which is true whether or not the package was ever published. A signature that appeared only on
publication would assert something the platform has no rule for.

## 5. D-125's distribution leg — the premise is stale, and what remains is sharper

**MEASURED, by generating a real solution for `carlisle-homes` from the repository's tenant record:**

```
config/security.json   <FILL:> markers: 2
   <FILL: EP signing key ref>                              <- the CUSTOMER's
   <FILL: customer-held KMS key ref — DBiz never holds it> <- the CUSTOMER's
   signatureVerification: { source: "registration-grant:configuration.packageVerificationKeys",
                            resolveBy: "provenance.signingKeyId", algorithm: "ed25519" }
```

> **`<FILL: IP public verification key ref + keyId>` IS GONE.** It was replaced when P-81.4 landed:
> the grant carries the key **SET**, thunk-resolved at issue time so a tenancy registering after a
> rotation receives the current keys. **Every remaining marker in that file is genuinely the
> customer's to fill.**

### 5.1 What actually remains, and it is why rotation must RIDE rather than follow

**Rotation is not built.** ADR-0081 P-81.4 rules that the key set is *"rotated over the update-event
channel the EP already polls"* — and **nothing emits a verification-key event.** The grant is the
only carrier, and **registration is a once-per-tenancy event.**

> **THE DECIDING FACT: the one registered tenancy holds NO verification key at all.**
> `carlisle-homes` registered **before the `packageVerificationKeys` field existed**, so its grant
> cannot have carried one. The grant is returned once and never persisted, so this plane cannot read
> what that tenancy holds — **but it can know what it was not sent.**

**So link 1 without a distribution path produces packages the only existing customer cannot verify.**
Not *"cannot verify until rotation is scheduled"* — **cannot verify at all, with no mechanism to fix
it short of re-registering**, which would mint a new EP credential and is exactly the redeployment
coupling ADR-0007 §6 exists to avoid.

**RECOMMENDATION: rotation rides with link 1.** Not because rotation is due — no key has rotated —
but because **the carrier for an already-registered tenancy does not exist**, and link 1 is the change
that makes that absence observable. **The first real signature is the moment the gap stops being
theoretical.**

## 6. Recommendation, in the order the ADR should take it

| # | Ruling | Why it is first/last |
|---|---|---|
| **1** | **ONE signature shape, in `@dbiz/contracts`** | it is the thing a plumbing change would otherwise decide by accident (§1.1). **Before any signer runs** |
| **2** | **Sign at AUTHORING** | §4. The writer already assumes it |
| **3** | **Distribution rides with link 1** | §5.1. The only registered tenancy has no key |
| **4** | **R-6.3's scope stated in one sentence** | §3. Cheap, and prevents a correct-looking conclusion that the platform is in violation |
| **5** | **Distinct key identifier per artefact domain** | §2. No new mechanism; ADR-0007 §6 already provides it |
| **6** | **Key absence at boot is a refusal, not a silent creation** | §3.1. Needs a first-boot marker this report does not design |

**What must NOT be done:**

- **SHALL NOT let the first signer pick the wire shape.** That is D-122's failure at the signature.
- **SHALL NOT sign at publication or at retrieval** — it changes what the signature asserts (ADR-0007).
- **SHALL NOT ship link 1 without a distribution path** — it produces packages the only customer cannot verify (§5.1).
- **SHALL NOT resolve R-6.3 by widening it** — the rule is right; only its scope is unwritten.

## 7. Measured

Signature shapes read at their declarations; the wired signer and its key path from the composition
root; R-6.3 and R-08.15 from their documents; `digestV1`'s domain binding from the integrity
primitive; the generated `config/security.json` by **generating a real solution from the
repository's own tenant record**; the absence of a rotation emitter by search across the
non-`dist`, non-`node_modules` trees. **Nothing was modified.**
