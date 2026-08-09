# ADR-0078 — Package Retrieval Recorded in Architecture: the retrieval operation, the integrity result class, and the absence of an acknowledgement

**Status:** **ACCEPTED** · **Date:** 2026-08-06 · **Accepted:** 2026-08-06
**Governed by:** [05 — Cross-Plane Communication](../architecture/05-cross-plane-communication.md); [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md); [01 — Platform Constitution](../architecture/01-platform-constitution.md) Rules 4, 5, 9, 10; [18 — Governance Model](../architecture/18-governance-model.md) §R-18.26–29
**Executes:** [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) §6 step 1 — **and corrects it.**
**Relates to:** [ADR-0036](ADR-0036-execution-plane-registration-and-trust-establishment.md) (the authenticated identity P-70.4 resolves) · [ADR-0007](ADR-0007-package-signing.md) (the seal) · [ADR-0005](ADR-0005-canonical-integrity-primitive.md) (the hash that is also the key) · [ADR-0015](ADR-0015-degraded-operation-mechanism.md) (the degradation matrix this amends a row of)

> **ACCEPTANCE (2026-08-06, programme-owner authority; CHARTER §9).** Accepted as written, with all eight propositions as scoped. Acceptance authorises the §6 migration sequence and satisfies R-18.26, which requires an ADR, an impact analysis, a migration strategy and a governance review **before** implementation — so it is also what unblocks [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) §6 step 2, subject to P-78.6. **This ADR is FROZEN on acceptance.** New findings are recorded in `TECHNICAL_DEBT.md` and `PROJECT_STATE.md`, not written back into it.
>
> **WHAT THIS ADR DOES.** It records package **retrieval** in the two frozen architecture documents that own it, adds the result class that retrieval creates and the taxonomy does not have, and settles what an **acknowledgement** is for a pull — by establishing that a successful pull needs none and that the case which does need a channel is not an acknowledgement at all.
>
> **AND IT CORRECTS THE INSTRUCTION IT EXECUTES.** ADR-0070 §6 step 1, §7 and §8 name [20](../architecture/20-cross-plane-contracts.md) as the sole document amended. Doc 20's own scope line disclaims direction and transport; [05](../architecture/05-cross-plane-communication.md) owns them. **Executing step 1 as written would place a direction rule in the document that disclaims direction** — the one-topic-one-home contract inverted inside the change that was meant to enforce the constitution. The correction is recorded against ADR-0070 rather than absorbed silently, because a mis-scoped step that is quietly widened leaves the next reader with an ADR whose migration strategy does not describe what happened.
>
> **WHAT IT DOES NOT DO.** No code. No route. No package store — that is its own decision (**P-78.6**) and is named here as step 2's precondition, not built. No contract version moves and no compatibility window opens. It does **not** settle which exchange carries the package hash to the Execution Plane (**P-78.7**); that exchange has no design, and naming a message on an undesigned exchange inside a frozen document is the defect this ADR exists downstream of.

---

## 1. Problem

[ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) §6 step 1 reads:

> Amend [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md) to record retrieval as the delivery mechanism and the hash as returned on the existing request.

Four defects, each established from disk rather than from the instruction.

**(i) The placement is wrong, and wrong against the target document's own first page.** [20:8](../architecture/20-cross-plane-contracts.md) states *"It does not own: transport or direction ([05](../architecture/05-cross-plane-communication.md))"*. [05:6](../architecture/05-cross-plane-communication.md) states *"This document owns: direction, transport, the result taxonomy, retry semantics, and the degradation matrix."* `ARCHITECTURE_STATUS.md` §3 concurs. *Delivery mechanism* is a direction statement. ADR-0070 §7 grants a version increment to doc 20 alone and §8 lists doc 20 alone as amended — so the mis-scope is in the accepted decision, not only in the instruction that carried it.

**(ii) The result taxonomy has no home for the outcome retrieval creates.** [05:47](../architecture/05-cross-plane-communication.md) — **R-05.5** — gives the client **three** structurally distinct result types: Success → Proceed, Refusal → HALT, Unavailability → DEGRADE and continue. A package that is *served and fails seal verification* is transport-Success and must not proceed; it is not Refusal, because the Intelligence Plane decided nothing; it is not Unavailability, because the Intelligence Plane was reached. **An implementer holding this outcome has three boxes and none fits — and of the two boxes that plausibly attract it, both continue.** R-05.8 requires the distinction between classes to be structural rather than a test, so the gap cannot be closed by convention at the call site.

**(iii) Step 1's second clause writes an undesigned exchange into a frozen document.** Measured: the only Execution-Plane-initiated route that exists is `POST /api/register` ([`api.ts:315`](../../packages/tenant-onboarding-engine/src/engine/api.ts)), unauthenticated by design, which mints a credential and carries no work. There is no work-request exchange for a hash to be *returned on*. Recording the mechanism now would declare a message on an exchange that has no shape.

**(iv) "Acknowledged" is used and defined nowhere.** It appears in the exit criteria carried into this work and has no definition in either plane. It is not an unused word: it already carries **two** unrelated meanings in this repository (§2.4). A third, undefined, is the second-source-of-truth failure that the precedence rules exist to prevent.

**And one thing doc 20 would assert that is not true.** P-70.1 states the Intelligence Plane's obligation *"ends when a sealed package exists and is retrievable."* Searched `packages/` and `governance/` for hash-keyed package lookup and for sealed-package persistence: **there is none.** Under push none was needed — [`generateBindings.mjs:37`](../../packages/functional-testing-engine/launcher/generator/generateBindings.mjs) hands the package to `epSend` and it is never stored. Amending doc 20 to describe retrieval without settling the store would have a frozen architecture document declare *retrievable* of an artefact nothing retains.

## 2. Context

### 2.1 The ownership line, and why it is not a formality

The two documents were drawn to be non-overlapping and each says so on its first page. Doc 20 owns the **artefact** — the package contract, its content addressing, the wire format, contract versioning. Doc 05 owns the **exchange** — direction, transport, the result classes, retry, degradation. Retrieval is both: a new operation on the exchange, keyed by a value the artefact already carries.

Splitting the amendment along the line the documents already declare costs one extra document and buys the property the line exists for: a reader asking *"what happens when retrieval fails?"* looks in the document that owns failure classes, and finds the answer there rather than a cross-reference.

### 2.2 R-05.5's gap is the reach-versus-refusal rule at a fourth boundary — and it was found in a frozen document

Doc 05 §3.1 already names this class as *the most important rule in the document*:

> Conflating refusal with unavailability is the single failure most likely to destroy the platform's value proposition, because the two demand **opposite** responses: one must stop the run, the other must not.

and records the predecessor collapsing both into an abort with one early return. That is the rule at the boundary between **the responder decided** and **the responder could not be reached**.

Retrieval creates a **fourth** boundary the taxonomy was never drawn against: between *the responder answered* and *what it answered with can be trusted*. Under push the response **was** the package, so the two were one event and the distinction had nowhere to appear. Under pull the response and the artefact are separate things, and the second can be well-served and worthless.

**The instance was found in a frozen architecture document, not in an implementation.** The predecessor's instance was one early return in code, discovered by the behaviour it produced. This one is discoverable only by reading R-05.5 against an operation that did not exist when R-05.5 was written — which is why nothing detected it: no gate compares a rule's enumeration against the set of outcomes a new operation can produce. **And the failure mode if it is left alone is worse than the predecessor's**, because the predecessor's collapse produced an abort — visibly wrong, and it stopped. Both boxes that attract this outcome continue: Success proceeds to execute an artefact that failed verification; Unavailability degrades and continues past it. The safe answer is the one no existing class expresses.

### 2.3 What exists on disk, and what does not

| | State |
|---|---|
| **Ownership claim** | **Exists.** [`execution-package.ts:78`](../../packages/contracts/src/execution-package.ts) — `ProvenanceSchema.tenantId`, required, inside the sealed body and therefore inside the content hash |
| **The seal mechanism** | **Exists.** [`package-signing.ts`](../../packages/tenant-onboarding-engine/src/engine/package-signing.ts) — a persisted production ed25519 signer producing a detached signature over a canonical content hash, public key published to the Execution Plane as trust material |
| **Key custody and rotation** | **Open — AD-016** ([20:155](../architecture/20-cross-plane-contracts.md)). `signingKeyId` is already on the provenance so rotation needs no contract change (ADR-0007 §6) |
| **A retrievable package store** | **Does not exist.** No persistence, no hash index, no ownership record outside the package body |
| **A work-request exchange** | **Does not exist.** `POST /api/register` mints a credential and carries no work |

Half of verification is therefore closed for free and needs no new mechanism: **the response's recomputed content hash must equal the hash used to request it, because the hash is the request key.** Content addressing makes identity self-verifying. The seal is the half that needs a key, and the key mechanism exists while its custody policy does not.

### 2.4 "Acknowledged" already has two meanings here

**The precedent that fits.** [`api.ts:221`](../../packages/tenant-onboarding-engine/src/engine/api.ts) → [`tenant-repository.ts:528`](../../packages/tenant-onboarding-engine/src/engine/tenant-repository.ts): the Execution Plane pulls pending update events, applies them, posts the id; the Intelligence Plane marks the event applied and writes an `update-acknowledged` audit entry. A working, Execution-Plane-initiated acknowledgement of a pulled artefact, carrying **no verdict** — a state marker and an audit line.

**The homonym.** [`synchronisation.ts:387`](../../packages/functional-testing-engine/src/domains/synchronisation.ts) and ADR-0072's `PublicationOutcome`: how many test cases a *connector* accepted on publication. Tool-side write acceptance, unrelated to anything cross-plane.

Either the word is bound to the first sense or it is refused for retrieval. It is not left to the reader.

## 3. Alternatives

**A. Amend doc 20 alone, as ADR-0070 §6 step 1 directs.** Rejected. It places a direction rule in the document that disclaims direction, and it leaves the result taxonomy — which is where the substantive gap is — untouched in the document that owns it.

**B. Amend doc 05 alone.** Rejected. The content hash's promotion from an integrity and attribution value to a **retrieval key** is a statement about the artefact and its addressing, which doc 20 owns. Recording it in doc 05 reproduces defect (i) in the other direction.

**C. Amend both, in one ADR.** **Chosen.** Two frozen documents, one plane, one decision, one re-baseline. The split follows the line the documents already draw.

**D. Add an acknowledgement on the successful-retrieval path.** Rejected on four independent grounds, each sufficient — recorded at P-78.4.

**E. Leave R-05.5 at three classes and let implementations classify integrity failure as they find convenient.** Rejected, and it is the alternative that would look cheapest. R-05.8 requires the classes to be structurally distinguishable, so "as convenient" means one of the existing three, and both plausible candidates continue past an artefact that failed verification. A taxonomy that cannot express a mandatory outcome does not merely omit it — it forces a wrong answer.

**F. Settle the package store in this ADR.** Rejected — P-78.6. Retention, expiry and sovereignty over artefacts that carry a tenant's authored tests is not a contract decision, and folding it in would bury a sovereignty ruling inside a documentation amendment.

## 4. Decision

**P-78.1 — The amendment splits along the documents' declared ownership, and this corrects ADR-0070.** Retrieval as an operation, its direction, its result classification, its retry posture and its degradation behaviour are recorded in **05**. The content hash as a retrieval key, the verification obligation on a retrieved artefact, and the shape of what may cross on the failure path are recorded in **20**. Neither document restates the other. ADR-0070 §6 step 1, §7 and §8 are **corrected, not superseded**: the decision was right and its amendment target was incomplete.

**P-78.2 — R-05.5 is amended from three result classes to four. The fourth is INTEGRITY FAILURE: served, unverifiable, HALT.** It is structurally distinct under R-05.8 — a caller cannot handle it as Success, Refusal or Unavailability. It is not retried (retry re-asks a healthy responder the same question) and it does not degrade (degradation continues past an artefact that cannot be trusted). It carries the assurance state `HALTED`.

> **Three outcomes, and the client SHALL NOT collapse them.**
> *Could not reach the Intelligence Plane* ≠ *the Intelligence Plane refused* ≠ *the Intelligence Plane served a package that failed seal verification.* The first is Unavailability and degrades (R-05.5). The second is a decision and HALTs, unretried (R-05.6). The third is neither: the exchange succeeded and the artefact is untrustworthy — the Intelligence Plane was reached, decided nothing, and what came back cannot be executed. Degrading on it continues past a corrupt or forged artefact; retrying it asks a healthy responder the same question twice.
>
> **And under P-70.4 the client cannot recover a fourth distinction, deliberately.** Unknown-hash and unowned-hash are ONE signal from the Intelligence Plane, because distinguishing them turns retrieval into an oracle for the existence of another tenant's packages. The Execution Plane therefore cannot tell *"no such package"* from *"not yours"* — and SHALL NOT pretend to. A client that reports either as fact is reporting an inference the protocol was built to deny it. The refusal names the hash it declined, and stops.

**The degradation matrix gains a row, and the row HALTs even when a valid cached package is held.** A seal failure is evidence that the store or the channel is compromised; the cached package came from the same store, so the failure impeaches it too. Executing the cache on that signal would be continuing past a security event with the one artefact the event casts doubt on.

**P-78.3 — Verification on retrieval is two checks, and only one of them is closed.** Content-hash match is self-verifying by construction (P-78.2's third case cannot arise from a transport error alone) and needs no key. Detached-signature validity over the canonical form (R-20.22) needs one; the mechanism exists ([`package-signing.ts`](../../packages/tenant-onboarding-engine/src/engine/package-signing.ts)) and its custody and rotation policy is **AD-016, which remains open and is named rather than implied closed.** Both checks pass before a retrieved package is executed.

**P-78.4 — Successful retrieval is NOT acknowledged.** Four independent reasons, each sufficient:

1. **It returns the property the inversion was for.** P-70.3's stated benefit is re-fetch *"without the Intelligence Plane tracking delivery state."* An acknowledgement is delivery state.
2. **Attribution already carries it.** R-20.12 and R-4.4: every evidence record references the package hash that produced it. The Intelligence Plane learns which package ran from the evidence it already receives. A second record of one fact is two records that can disagree.
3. **Retention does not need it.** `validity.notAfter` bounds the package's life on its own terms (R-22.5). A store ages out on contract, not on delivery.
4. **R-12.5 empties it.** Stages 10, 11 and 12 are the Intelligence Plane's under every circumstance. Strip verdict, assurance state and certification input from a success acknowledgement — R-12.5 permits none of them to cross — and what remains is *"I fetched a thing you already know exists"*, which is the delivery state reason 1 forbids.

**P-78.5 — The failure path gets a channel, and it is NOT an acknowledgement.** If verification fails the Execution Plane halts, so no execution begins, so **no evidence record ever carries that hash** — the Intelligence Plane's only channel falls silent in precisely the case where silence is indistinguishable from *"the Execution Plane has not got to it yet."* And a seal failure means the store is corrupt or something is impersonating the Intelligence Plane: both are Intelligence-Plane security events, not Execution-Plane execution outcomes.

> An **integrity report** is Execution-Plane-initiated and carries exactly: the content hash it requested, the failure kind (`hash-mismatch` · `signature-invalid` · `unparseable`), and its contract version. It carries no assurance state, no verdict and no evidence, and it is never certification input (R-12.5, R-18.17). It lands in the tenant audit trail as a security event. The Intelligence Plane treats it as authoritative about exactly one thing: **that this Execution Plane said so.** It is a diagnostic self-report, not evidence about a run.

**It is not called an acknowledgement.** That word already names the update-event mechanism (§2.4), and a second cross-plane sense of it would make the register ambiguous in the one place ambiguity is expensive.

**P-78.6 — The retrievable package store is a SEPARATE decision, and it is step 2's precondition.** It does not exist. Its retention window, its expiry behaviour against `validity.notAfter`, and its sovereignty posture — DBiz holding, for a stated period, sealed artefacts that carry the tenant's authored tests — are a data-sovereignty ruling under [06](../architecture/06-data-sovereignty.md) and [07](../architecture/07-tenant-isolation.md), not a contract shape. **It is recorded here, named, and not built.** ADR-0070 §6 step 2 does not begin until it is decided, because an endpoint that serves from nothing is not implementable and a document that describes retrieval from nothing is not true.

**P-78.7 — The hash-return leg records the RULE and defers the MECHANISM.** The rule: the package hash reaches the Execution Plane on an **Execution-Plane-initiated** exchange, never on an Intelligence-Plane-initiated one (R-05.1, P-70.1). The mechanism: which exchange, carrying what, is **not settled here** — no such exchange exists, and naming a message on an undesigned exchange is the defect this ADR is downstream of. It is recorded as a new open item **AD-043** in doc 05 §9, and is ADR-0070 §6 step 3's subject.

**P-78.8 — `provenance.tenantId` is the authoritative ownership key, and its reconciliation with `mayAccessTenant` is step 2's first measurement.** The package is the artefact being authorised, and its own provenance is the only ownership claim that travels with it; it sits inside the sealed body and therefore inside the content hash, so it cannot be altered without changing the identity by which it was requested. A slug is a routing convenience resolved at a boundary this route does not have — `GET /api/packages/{hash}` carries no slug by design (P-70.4 clause 2).

**And the reconciliation is open, recorded with the ruling rather than assumed by it.** [`authz.ts:68`](../../packages/tenant-onboarding-engine/src/engine/authz.ts) `mayAccessTenant(principal, slug)` takes a **slug**; `provenance.tenantId` is an `Identifier`. Whether they are the same value, a mapping, or two identifier spaces is **not established on disk and is not assumed here**. It is step 2's first measurement, **reported before the ownership check is built.** Note also that [`api.ts:115`](../../packages/tenant-onboarding-engine/src/engine/api.ts) authorises a slug taken from the **path**, whereas retrieval must resolve the owner from the **stored package** and then compare — the same predicate with the data flowing the other way. That inversion is the difference between reusing the pattern that closed F-04 and rebuilding the defect underneath it.

### 4.1 The A-4 statement, because an amendment owes one

[01](../architecture/01-platform-constitution.md) **A-4**: an amendment SHALL state which invariant it affects and why that invariant no longer holds; an amendment that affects no invariant is a clarification. This change is **both**, and the halves are stated separately because they carry different weight:

- **The direction half is a CLARIFICATION. No invariant moves.** R-5.1 already mandates Execution-Plane initiation; ADR-0037 §116 already records that the Execution Plane pulls its signed package. The architecture was right and the implementation contradicted it. Nothing is being relaxed, and nothing that was true stops being true.
- **The taxonomy half is a TRUE AMENDMENT.** It affects **R-05.5**, which enumerates three result classes as exhaustive. It no longer holds because R-05.5 was written for an exchange in which the Intelligence Plane's *response was the package*. Under retrieval the response and the artefact are separate, and the second can be well-served and untrustworthy — an outcome the enumeration cannot express and therefore misclassifies into one of two classes that both continue.

### 4.2 One criterion deliberately not written — CHARTER §17.1.1 applied to a control being WRITTEN

No conformance criterion is added for P-78.4's *"successful retrieval is not acknowledged."*

`C-20.15 — no route requires or records an acknowledgement of successful retrieval` was drafted and **struck**. It turns **GREEN when the entire retrieval surface is removed**: it is satisfied *by* the absence, so its pass carries no information about the thing it was written to watch. That is CHARTER §17.1.1's subject-removal test — *of every property a control asserts, ask: if its SUBJECT were removed, would this property turn RED or GREEN?*

**This is the rule's first application to a control being written rather than one already running, and the distinction is the whole value of running it early.** Every prior instance caught an **existing** control: `verify-canonical-agent-dormancy` had already gone green over a deleted runtime (**D-103**), the two fault probes had already been asserting nothing against a deleted build output, and `PART_4_CENSUS_DESIGN_REPORT.md` §1 retired four census dimensions that had already been reporting the same figure on every run. Each was found after it had spent time in the runner manufacturing confidence. **C-20.15 never entered the criteria set at all** — it was asked the question at the moment it was proposed, in the ADR that would have introduced it, which is the cheapest point in the control's life to ask and the only point at which striking it costs nothing but a paragraph.

CHARTER §17.1.1 states the rule is *"the only cheap way to tell a control from a control-shaped literal"* and directs that it be run *"before the removal, not after."* Applied here it is earlier still: **before the creation.**

The decision is enforced positively instead, by **C-20.10** — every evidence record carries its producing package hash — remaining the **only** attribution path. If a second one is ever added, C-20.10 stops being sufficient and the gap surfaces where attribution is measured, rather than where a negative was asserted and would have gone on passing.

### 4.3 The proposed amendment text

**Doc 05 — new rules.** `R-05.21` retrieval is a separate Execution-Plane-initiated, idempotent exchange keyed by content hash, over which the Intelligence Plane holds no delivery state. `R-05.22` defines **Integrity Failure** — the Intelligence Plane answered and the artefact it returned failed verification; the exchange succeeded and the artefact did not. R-05.5 itself is edited **in place** from three classes to four, with the fourth row added to its table, so that a reader of R-05.5 sees the current enumeration rather than a rule and a patch; the amendment's traceability lives in the document's `Amendments:` line and in this ADR, not in a second copy of the rule. `R-05.23` Integrity Failure SHALL NOT be retried and SHALL NOT degrade; it HALTs, including when a valid cached package is held. `R-05.24` a retrieval refusal is a Refusal under R-05.5 and its reason SHALL NOT distinguish unknown-hash from unowned-hash; the client SHALL NOT report either as fact. `R-05.25` an Execution Plane whose verification fails SHALL send an integrity report; its shape is [20](../architecture/20-cross-plane-contracts.md)'s. **§4's matrix** gains an Integrity Failure row (`HALT`, `HALTED`). **§7's table** gains the integrity report to the EP→IP row and the retrieved package to IP→EP. **§9** gains **AD-043** — the work-request exchange that carries the package hash (P-78.7).

**Doc 05 — new criteria.** `C-05.10` Integrity Failure is a distinct type and cannot be handled as Success, Refusal or Unavailability — type-level test. `C-05.11` a retrieval refusal is indistinguishable between unknown-hash and unowned-hash — negative test asserting response equality. `C-05.12` a verification failure HALTs and does not degrade **with a valid cached package present** — fault-injection test.

**Doc 20 — new rules.** `R-20.28` the content hash is a retrieval key as well as an integrity and attribution value; a retrieved package's recomputed content hash SHALL equal the hash it was requested by, or it is not the package requested. `R-20.29` verification on retrieval is both checks of P-78.3, both passing before execution; key custody remains AD-016. `R-20.30` the integrity report's shape, exactly as P-78.5 states it. `R-20.31` the Intelligence Plane SHALL NOT require, and the Execution Plane SHALL NOT send, an acknowledgement of successful retrieval; attribution is carried by R-20.12.

**Doc 20 — new criteria.** `C-20.13` a retrieved package whose recomputed hash differs from the requested hash is refused — mutation test. `C-20.14` an integrity report is not constructible with an assurance state or a verdict field — type-level requirement, in the established form of C-20.11.

## 5. Consequences

**What improves.** The outcome that must halt becomes expressible, in the document that owns outcomes, before any code can misclassify it. The one-topic-one-home contract survives a change that was scoped to break it. The word *acknowledgement* keeps one meaning. And the two things retrieval genuinely needs but does not have — a store and a work-request exchange — are named as preconditions with owners instead of being implied by prose that describes them as present.

**What it costs.** Two frozen documents move to v1.1 and a deliberate re-baseline — one leg of which is **already red on the tree carrying this ADR**, measured, and recorded at §6 step 4. Five new conformance criteria, each of which owes a fault proof under R-13.4 and R-13.7 when its subject exists — none can be proved today, and none is counted as satisfied in the meantime. ADR-0070's §6, §7 and §8 carry a correction, which is a cost paid in the record's accuracy rather than in work.

**What does not change.** The `ExecutionPackage` contract, its seal, its content addressing, plane ownership, evidence-by-reference and the twelve-stage lifecycle. No contract version moves and no compatibility window opens — delivery is not described by the contract, as ADR-0070 §5 established and this ADR inherits rather than re-derives. No gate is added, removed or modified. R-5.1, R-12.5 and P-70.4 are enforced, not touched.

### 5.1 The consequence that matters most — what executing step 1 as scoped would have produced

**This is why the step was reported before it was built, and it is the ADR's principal finding rather than one of its risks.**

Had ADR-0070 §6 step 1 been executed as written, [20](../architecture/20-cross-plane-contracts.md) would today assert **retrieval as the delivery mechanism** — in a plane with **no store to retrieve from**, under a taxonomy that classifies a **failed seal** as *proceed* or as *degrade and continue*, naming a hash **returned on an exchange that does not exist**. Four assertions, three of them false on the day they landed and the fourth actively harmful.

**And every structural gate would have stayed green.** Measured, not supposed:

- `verify-adr-completeness` checks that eight **sections** are present, never what they say.
- `verify-programme-closure` checks **digests** — that documents have not changed silently — and a deliberately re-baselined amendment satisfies it by construction. It cannot ask whether a document's claim has a referent.
- `verify-http-surface-parity` and `verify-http-surface` govern **routes that exist**. A route that architecture describes and nothing serves is outside both.
- No gate anywhere compares a rule's **enumeration** against the set of outcomes a new operation can produce. R-05.5 would have gone on declaring three classes exhaustive while a fourth was mandatory and unnamed.

**That is D-007's class — declaration-versus-implementation drift — arriving in architecture rather than in code, which is the worse direction.** In code the drift is between two things that both exist, so a reader can eventually find the contradiction. Here the declaration would have had *nothing on disk to contradict it*, because nothing on disk implements it yet — and by the time an implementation existed, the frozen document would be the specification it was built against. The taxonomy defect in particular does not fail loudly when it is finally reached: **an implementer forced to classify a failed seal into three boxes picks one of the two that continue**, and a package that failed verification executes.

The controls that replace the four assertions are: P-78.6 (the store, named as a precondition with its own decision owed), AD-043 (the exchange, an open item with a number), P-78.2 (the fourth class, in the document that owns classes), and P-78.7 (the mechanism deferred to where its design will be made).

**Risk.** What remains is that this ADR reads as complete while two of those preconditions stay open, and a later reader takes *"retrieval is recorded in architecture"* for *"retrieval works."* The control is that both are numbered rather than caveated in prose, and that ADR-0070 §6 step 2 is explicitly gated on the first of them.

## 6. Migration strategy

Post-acceptance, in order. **None performed here.** R-18.26 requires an ADR, an impact analysis, a migration strategy and a governance review **before implementation**, so nothing below and nothing in ADR-0070 §6 step 2 begins until this ADR is ACCEPTED.

1. **Record the deliberate red in programme state BEFORE amending anything.** `PROJECT_STATE.md` names the gate, the property, the cause and the clearing step; `NEXT_ACTION.md`'s red count is corrected in the same act. **This is first, not last.** A deliberate red under a `NEXT_ACTION.md` still asserting *"every one of the nine is pre-existing"* is D-104's shape — a fact that survives only if someone happens to look, and surfaces on someone else's read as an unexplained failure.
2. **Amend [05](../architecture/05-cross-plane-communication.md)** per §4.3 — rules, criteria, the matrix row, the §7 table, and AD-043. Version line to **v1.1**; status stays **FROZEN**.
3. **Amend [20](../architecture/20-cross-plane-contracts.md)** per §4.3 — rules and criteria. Version line to **v1.1**; status stays **FROZEN**.
4. **Take the re-baseline deliberately.** `node governance/closure/emit-closure-package.mjs program`, then **review the diff and confirm only doc 05 and doc 20 moved** — plus this ADR's own entry.

   This is a **knowing red, and one leg of it is already lit.** Measured on the tree that carries this draft: `verify-programme-closure` was PASS before it and is now **FAIL — 1 baseline property violated**, on *"no ADR has been added since closure"*, naming this file. The two architecture-digest legs — *"no baselined architecture document has been modified"* — are still **PASS** and go red at steps 1 and 2. All three clear together at this step. **The red is created by this change and cleared by this step: it is not inherited, and it is not to be carried into a session that would read it as pre-existing.**
4. **Record P-78.6 as a decision owed** — the retrievable package store, in `BACKLOG.md` with `TECHNICAL_DEBT.md` D-007 instance (v) noting that ADR-0070 §6 step 2 is gated on it. It is a decision, not a defect.
5. **Then, and only then, ADR-0070 §6 step 2 may begin** — and its **first act is a measurement, not a build**: the `provenance.tenantId` ↔ `mayAccessTenant(slug)` reconciliation (P-78.8), reported before the ownership check is written.

**Not in this sequence, and deliberately.** ADR-0070 §6 step 3 (the hash-return mechanism) is unblocked by this ADR only to the extent that its **rule** is now recorded; its shape is still owed as a report before it is built. §6 steps 4 and 5 are untouched.

## 7. Version impact

- [05 — Cross-Plane Communication](../architecture/05-cross-plane-communication.md): **v1.0 → v1.1**, `FROZEN` retained. Five rules added, one rule amended (R-05.5), three criteria added, one matrix row, one open item.
- [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md): **v1.0 → v1.1**, `FROZEN` retained. Four rules added, two criteria added. ADR-0070 §7 already anticipated this document's increment; the increment to doc 05 is what this ADR adds.
- **No contract change.** `CONTRACT_SCHEMA_VERSION`, `EXECUTION_CONTEXT_VERSION` and `PACKAGE_GOVERNANCE_VERSION` unchanged; no compatibility window.
- **Conformance criteria 417 → 422.** `verify-programme-closure`'s criteria check is a floor (`criteriaNow >= baselined`), so the count passes without the re-baseline; only the document digests force it.
- **[ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) is CORRECTED, not superseded** — §6 step 1's amendment target, §7's version-impact list and §8's affected-components list. P-70.1 through P-70.6 are untouched and enforced.
- **Gate count unchanged.** No gate is added or removed. Five new criteria enter the criteria set and none is claimed as verified.

## 8. Affected components

- `docs/adr/ADR-0078-package-retrieval-recorded-in-architecture.md` — **New** (this ADR).
- `docs/architecture/05-cross-plane-communication.md` — **Amended** (§6 step 1: R-05.5 amended to four result classes; R-05.21–R-05.25; C-05.10–C-05.12; §4 matrix row; §7 table; AD-043). **v1.0 → v1.1, FROZEN retained.**
- `docs/architecture/20-cross-plane-contracts.md` — **Amended** (§6 step 2: R-20.28–R-20.31; C-20.13–C-20.14). **v1.0 → v1.1, FROZEN retained.**
- `docs/adr/ADR-0070-execution-package-retrieval-inversion.md` — **Corrected** (§6 step 1, §7, §8: the amendment set is doc 05 **and** doc 20; step 1's hash-return clause is deferred to step 3 per P-78.7).
- `governance/closure/baseline.json` — **Re-baselined** (§6 step 3: doc 05 and doc 20 digests only, reviewed).
- `program/DECISIONS.md` — **Amended** (ADR-0078 index row; AD-043 registered).
- `program/ARCHITECTURE_STATUS.md` — **Amended** (§2: documents 05 and 20 at **FROZEN v1.1**; §5 post-freeze changes).
- `program/BACKLOG.md` — **Amended** (§6 step 4: the retrievable package store, P-78.6, as a decision owed and step 2's precondition).
- `program/TECHNICAL_DEBT.md` — **Amended** (D-007 instance (v): ADR-0070 §6 step 2 is gated on P-78.6).

**No contract, no gate, no code and no Execution-Plane artefact is modified by this ADR.** The two frozen documents it amends are amended under R-18.26, with the amendment's clarification half and its true-amendment half stated separately per A-4 (§4.1).
