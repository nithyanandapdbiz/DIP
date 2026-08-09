# D-123 — where the detached signature rides under pull, and the completion of ADR-0070's inversion

**2026-08-06, from `971fc94`. Design report. Nothing was built and no ADR was authored.**
**STOP FOR RULING.**

> **THE ADR NUMBER IS NOT CLAIMED HERE.** `ADR-0081` is unallocated on disk but `P-81.x` propositions
> are already cited across the registers from the v1.1.0 amendment D-121 killed. The number is
> assigned when the ADR is authored, on ruling — not by a report reserving one.

---

> **THE HEADLINE, AND IT ENLARGES D-123 RATHER THAN CONFIRMING IT: THE SIGNATURE CHAIN HAS THREE
> MISSING LINKS, NOT ONE, AND THE THIRD IS A LITERAL PLACEHOLDER SHIPPED TO THE CUSTOMER.**
>
> D-123 recorded the **carrier**. Measuring the chain end to end found the carrier is the middle
> link: there is **no signer on the write path** for execution packages, and **the generated
> Execution Plane is told to verify against `'<FILL: IP public verification key ref + keyId>'`** —
> an unfilled placeholder string in `config/security.json`, in every solution this plane emits.
>
> **So the ruling cannot be *"pick a carrier"*. Any carrier ruled today lands into a chain that is
> broken on both sides of it**, and a build that closed only the carrier would produce exactly the
> failure D-123 names — an EP that refuses every package — while appearing to have fixed it.

---

## 1. The chain, measured end to end

| # | Link | State | Evidence |
|---|---|---|---|
| **1** | **A signer on the write path** produces a detached signature over the authored package | **ABSENT** | The only `PackageSigner` is the SPI's injected port, wired **only inside a generated string** ([`generateBindings.mjs:35`](../packages/functional-testing-engine/launcher/generator/generateBindings.mjs)). The one signer wired in the deployed tier ([`api.ts:275`](../packages/tenant-onboarding-engine/src/engine/api.ts)) signs an **ADR-0035 solution manifest** — a different artefact |
| **2** | **A carrier** so the signature reaches the EP with the package | **ABSENT — D-123** | `put(ctx, sealedBody)` takes one artefact; `GET /api/packages/{hash}` returns `JSON.parse(result.body)` and nothing else; `ExecutionPackageSchema` correctly has no signature field |
| **3** | **A verification key at the Execution Plane** | **A PLACEHOLDER STRING** | [`solution-export.ts:509`](../packages/tenant-onboarding-engine/src/engine/solution-export.ts) emits `signatureVerificationKeyRef: '<FILL: IP public verification key ref + keyId>'` into `config/security.json`; `:483` emits the same for `verificationKeyRef`; and `:631` instructs the EP to *"verify … against `security.signatureVerificationKeyRef`"* — **which is that placeholder.** Recorded as **D-125** |

**The mechanism for link 1 and link 3 both exist and are unwired**, which is why this is a wiring-and-custody decision rather than a cryptography one. [`package-signing.ts`](../packages/tenant-onboarding-engine/src/engine/package-signing.ts) already has `loadOrCreateSigningKey`, `signContentHash` and `verifyContentHash`, and `platform-adoption.ts:193` already loads a persisted ed25519 key at boot. **What is missing is the decision about where its public half goes and what carries its output.**

## 2. What is NOT wrong, stated so it is not re-raised

**Signing over the hex content hash rather than over the package bytes is SOUND, and it is what doc 20 §5 asks for.** `signContentHash` signs `Buffer.from(contentHash, 'utf8')` — the hex digest, not the canonical JSON. That is correct on two independent grounds:

1. **Doc 20 §5's own rationale:** *"Detached signatures are specified so that the signature can be verified **without re-serialising the payload**, and so signing does not perturb the canonical bytes the content hash is computed over."* Signing the digest is precisely how that property is obtained.
2. **The domain is already bound into the digest.** `hash(domain, content)` returns `digestV1(domain, canonical)` ([`integrity.ts:83-98`](../packages/contracts/src/integrity.ts)), so `dbiz.execution-package@1` is inside the value being signed. A signature over an execution package's digest is **not** interchangeable with one over a solution manifest's digest, because the domains differ before the hash is taken.

**A reviewer reaching for *"the signature must be over the canonical form, not the hash"* would be wrong, and would be wrong in a way that costs a version move.** It is recorded here because it is the natural first objection.

## 3. AD-016 is not in contradiction — the MODEL is closed and the DISTRIBUTION is not

Two frozen documents appear to disagree, and the ruling needs the disagreement resolved because it sets the ADR's scope:

| Source | Says |
|---|---|
| [ADR-0007](../docs/adr/ADR-0007-package-signing.md) header | **`Closes: AD-016`** |
| [08 — Security Model](../docs/architecture/08-security-model.md) §5 heading | *"Package signing and verification — **AD-016 resolved**"* |
| [20 — Cross-Plane Contracts](../docs/architecture/20-cross-plane-contracts.md) §8 | lists **AD-016** under **Open items** |
| 20 R-20.29 (added by ADR-0078, v1.1) | *"Key custody, rotation and customer-side trust material remain **AD-016** — **open**, and named here rather than assumed closed"* |

> **THEY ARE ABOUT DIFFERENT HALVES, AND THE MEASUREMENT SETTLES WHICH.** ADR-0007 closed the
> **model**: asymmetric keys, DBiz-held signing, verification-only distribution, a key identifier on
> the package, overlapping validity for rotation. **All five are decided and none is in question.**
> What R-20.29 calls open is the **distribution and custody** — *how a verification key actually
> reaches a customer tenancy*. **Link 3 is that gap, and it is not a documentation ambiguity: it is a
> `<FILL:` marker in emitted customer configuration.**

**Recommended for the ruling to state, in one sentence, so the next reader is not left arbitrating between two frozen documents:** ADR-0007 closes AD-016's model; AD-016's **distribution** leg is open and is what R-20.29 names. **Neither document is wrong and neither needs amending on this point** — what is missing is the sentence distinguishing them.

## 4. The carrier options, with what each costs

### D — Embed the signature in the package body. **EXCLUDED, not weighed.**

Two independent statements exclude it before cost is considered:

- **ADR-0007 §7 forward obligation:** *"Changing the signature scheme — **detached to embedded** — would be a **major** contract version, because it alters what verification operates over."* That is **v2.0.0**.
- **Doc 20 §5:** detached is specified *so signing does not perturb the canonical bytes the content hash is computed over.* Embedding requires redefining `hashableContent` — which today excludes only `provenance.contentHash`, so a top-level `signature` **would be hashed**, and the package would no longer content-address to its own hash.

**It is listed because it is the cheapest-looking option and the one a later implementer will reach for.**

### B — An HTTP response header. **REJECTED, and the reason is the artefact's whole purpose.**

`X-DBiz-Package-Signature: <base64>; keyId=…`

| | |
|---|---|
| **Cost** | Lowest. The body stays byte-identical, so C-20.13's mutation test, R-20.28's hash check and the EP's parse are all untouched |
| **Why it fails** | **A header is not part of the artefact.** Doc 20 §2.2: *"A sealed artefact can be cached, replayed, audited, and executed while its author is offline."* ADR-0015 makes caching explicit. **A signature that exists only in an HTTP response does not survive being written to disk**, so a cached package becomes unverifiable the moment it is cached — and R-20.29 requires verification **before execution**, which under caching may be long after retrieval |
| **The sharp form** | It would satisfy retrieval and break replay, and **replay is the property the package exists to provide** |

### A — A retrieval envelope. `GET /api/packages/{hash}` returns `{ package, signature }`

| | |
|---|---|
| **Cost** | The retrieval **response** shape changes. The `ExecutionPackage` **contract does not** — the response is not the package, and no contract version moves |
| **Touches** | Doc 05 owns retrieval as an operation; doc 20 owns the artefact half. The response shape is doc 05's, so this is a **doc 05** amendment, not a doc 20 one — the split ADR-0078 P-78.1 already established |
| **Risk, and it is real** | R-20.28 says a retrieved package's recomputed hash must equal the hash requested. **A consumer that hashes the envelope instead of `envelope.package` gets a mismatch and reports `hash-mismatch`** under R-20.30 — a correct-looking failure with a wrong cause. Mitigation: the member is named, and C-20.13's mutation test is extended to assert the hash is taken over the member |
| **Does not solve** | **Storage.** An envelope on the wire says nothing about what is at rest |

### C — A sibling artefact in the store, written and read with the package

Store the body at `<hash>` and the signature at a sibling key in the same partition.

| | |
|---|---|
| **Cost** | Two artefacts, two writes, and a **partial-write state** the store must refuse rather than tolerate — a body stored without its signature is exactly the unverifiable package this report exists to prevent. `put`'s current posture (refuse the write outright, loudly) is the right one to extend |
| **P-79.5 admits it** | *"The content is the sealed body and its provenance. Nothing derived."* **A detached signature is not derived from the body** — it cannot be recomputed from it — so it is not what P-79.5 excludes. ADR-0079 must nonetheless be **amended to say so**, because a reader applying P-79.5 literally would refuse it |
| **A CONCRETE DEFECT IT INTRODUCES, and it is checkable** | `purgeExpired` lists the partition and **skips every name that does not match `HASH_RE`** ([`sealed-package-store.ts:322-323`](../packages/platform-providers/src/storage/sealed-package-store.ts)). **A sibling named `<hash>.sig` would never be purged**, so signatures would outlive the packages they sign — an R-06.13 / C-06.8 breach introduced by the fix. **Any sibling scheme lands with the purge change, or it lands broken** |
| **What it buys** | The signature is **at rest with the package**, so a cached or archived package carries its own proof — the property B loses |

### E — Sign at retrieval time rather than at seal time. **REJECTED.**

| | |
|---|---|
| **Superficially attractive** | ed25519 is deterministic, so the same bytes yield the same signature on every fetch; no storage change at all |
| **Why it fails** | It changes what the signature **asserts** — from *"the Intelligence Plane authored this"* to *"the Intelligence Plane served this"*. ADR-0007's whole model is origin attestation |
| **And the security cost is concrete** | It puts the **signing key on the read path**, exercised on every retrieval, rather than on the authoring path exercised once per run. ADR-0007 §2 calls signing keys *"the platform's highest-value asset"* — widening their exposure surface to the highest-traffic route is the wrong direction |
| **And at rest** | The store would hold **unsigned** customer artefacts, which is a different sovereignty posture than the one ADR-0079 was accepted under |

## 5. Recommendation — C and A are two halves of one answer, not alternatives

> **STORE AS A SIBLING (C). SERVE AS AN ENVELOPE (A).**

**They answer different questions, and the reason D-123 exists is that nobody asked both.** The
signature was an *argument of a call* — a thing with no rest state and no wire representation of its
own — so when the call was deleted, both questions vanished with it and neither was noticed missing.
Ruling only the wire shape rebuilds the same gap one layer down: a package cached to disk by the EP
would again hold no signature.

**The write becomes atomic in refusal terms:** the writer produces `(package, signature)` together
or `put` refuses, exactly as it refuses a body with no `provenance.tenantId`. **A package in the
store without its signature SHALL NOT be a reachable state**, because it is indistinguishable at rest
from one whose signature was stripped.

**And the purge change lands in the same commit**, or C ships with the R-06.13 defect §4 measures.

**Sequenced with it and named, not assumed:** link 1 (a signer on the write path — the key is already
loaded at `platform-adoption.ts:193`) and link 3 (**D-125**, the `<FILL:` placeholder). **A carrier
without link 3 changes nothing observable** — the EP still cannot verify, and every retrieval still
ends in R-20.30's `signature-invalid`. If the ruling adopts the carrier without adopting link 3, it
**SHALL** say so explicitly and record the gap, on ADR-0019's own precedent of landing a decision
with its mechanisms sequenced and the gap named.

## 6. ADR-0070 §6 steps 4 and 5 — and every figure in the step has drifted

**This is not separable from D-122.** The only wiring of the canonical composition emits
`createExecutionPlaneTransport({ send: (pkg, signature, attempt) => epSend(executionPlaneEndpoint, …) })`
— **opening a connection to the Execution Plane that P-70.1 forbids in terms.** The writer that must
exist *is* that substitution. Scheduling them apart lets the second silently re-decide the first.

**The step's scope was measured once, at authoring, and has moved since. Measured today:**

| ADR-0070 §6 / P-70.6 says | Measured 2026-08-06 |
|---|---|
| *"collapse the **eight** address-holding references"* | **10 references across 7 files** — `bootstrapContext.mjs`, `devBootstrap.mjs`, `generateBindings.mjs`, `bindingsService.mjs`, `configurationService.mjs`, `configurationValidator.mjs`, `executionPlaneValidator.mjs` |
| *"it carries **four** conformance tests (`runtime-enablement-conformance.test.ts:88,103,109,115`)"* | **seven** tests construct the transport, at `:96, :102, :107, :112, :119, :124, :129`. **The four cited lines point at none of them** — `:88` is a fixture declaration, `:103`/`:109`/`:115` are assertion lines inside other tests |
| *"and **a** registered fault proof (`record-fault-proofs.js:1455`)"* | **five** registered fault proofs patch `execution-plane-transport.js`, at `:1535–:1580`. **Line 1455 is a proof about `runtime-execution-spi.ts` executing a browser in the Intelligence Plane** — a different subject entirely |

> **EVERY CITATION IN THE RETIREMENT STEP NOW POINTS AT SOMETHING OTHER THAN WHAT IT NAMES, AND THE
> CONSEQUENCE IS NOT COSMETIC.** P-70.6 says the retirement *"is a scoped step with its own evidence,
> sequenced after the retrieval endpoint exists — never a side effect of deleting a binding."* **An
> implementer following those citations would retire the wrong things and miss four of the five fault
> proofs**, and the step would report itself complete. This is **D-107's class inside a migration
> step** rather than in a state file, and it is the more consequential location: a state-file number
> misinforms a reader, an ADR's migration citation misdirects an action.

**What the ADR must therefore carry for steps 4–5:** the scope **re-measured at authoring time**, and
a statement that the figures are measured rather than quoted. Line-number citations into a moving
tree are the mechanism that failed here — **cite by symbol and count, and record the count's
measurement date.**

## 7. What the ADR must carry, and what it must not

**Must carry:**

1. The **carrier at rest** and the **carrier on the wire**, ruled together (§5).
2. The **purge change** for whatever at-rest scheme is chosen (§4 C).
3. The **partial-write refusal** — a stored package without its signature is not a reachable state.
4. **AD-016's two halves distinguished** in one sentence (§3).
5. **Link 1 and link 3** either discharged or explicitly sequenced with the gap named (§5).
6. **ADR-0070 §6 steps 4 and 5**, with their scope **re-measured**, not quoted (§6).
7. The **fault proof** for anything gate-bearing it adds, in the same change (CHARTER §18, R-13.4, R-13.7).

**Must not:**

- **Must not embed the signature in the body** (§4 D) — a major contract version, and it breaks the content addressing the retrieval key depends on.
- **Must not put the signature only in a header** (§4 B) — it does not survive caching, and caching is the property the package exists for.
- **Must not sign on the read path** (§4 E) — it changes what the signature asserts and widens the highest-value key's exposure.
- **Must not record anything on write from which delivery state could be inferred** (P-70.3, P-79.7, R-12.5).
- **Must not "improve" P-79.2's addressing into a predicate** while touching the store — every test would still pass; addressing and a predicate differ only on the attack.

## 8. The ruling asked for

1. **The carrier at rest** — sibling artefact (recommended) · envelope stored whole · none, with the consequence accepted.
2. **The carrier on the wire** — retrieval envelope (recommended) · header · a second route.
3. **Whether links 1 and 3 are in this ADR** or sequenced with the gap named.
4. **Whether ADR-0070 §6 steps 4–5 land in this ADR** (recommended — they are the same substitution) or in D-122's.
5. **AD-016's two halves** — confirm the model/distribution split, so the next reader is not arbitrating between two frozen documents.

**Until ruled: nothing is written to the sealed package store**, because the first stored package
fixes what retrieval returns, and **nothing in ADR-0070 §6 steps 4–5 is executed**, because its own
scope no longer describes the tree.

## 9. Reproduction

Every figure above was read from the tree at `971fc94` — reference counts by search across the
non-`dist`, non-`node_modules` TypeScript and `.mjs` trees; test counts by locating the constructor's
call sites and the enclosing `test(` boundaries; fault-proof counts by locating entries whose `file`
names the transport module. The cited ADR line numbers were resolved against the files they name.
**Nothing was modified.**
