# PROPOSED — CHARTER §18 clause 3: a response is evidence only of what actually answered

**Status: PROPOSED, NOT ADOPTED. Raised 2026-08-06. Governs nothing.**

> **THIS FILE IS A PROPOSAL PUT FOR RULING, AND IT IS DELIBERATELY NOT AN EDIT TO THE CHARTER.**
> CHARTER §18 is **constitutional** — it is Rule 13 of the Platform Constitution, adopted through
> [ADR-0019](../docs/adr/ADR-0019-evidence-over-assertion.md). Its clauses are amended by a ruling
> with an ADR, never by a change that found a new clause useful. **A rule added without a ruling is
> a rule nobody ruled on**, and it would carry the authority of the document it was pasted into
> rather than of any decision.
>
> **The requesting instruction agreed with this and asked for it to be brought as a proposal. It is
> brought here. Nothing in `CHARTER.md` was modified.**

---

## 1. The proposed clause

> **Clause 3 — a response is evidence of an answer only once the path has been shown to answer at
> all.** Clause 2 asks whether a demonstration *faulted anything real*. This asks the prior question
> of every **observation**: whether the thing that responded is the thing under test. Every probe,
> query or retrieval relied upon as evidence is compared against a **deliberately constructed
> sibling that must not succeed** — a nonsense path, an unowned identifier, a malformed input of the
> same class. **Where the two responses are byte-identical, the fallthrough was measured, not the
> subject**, and the observation reports `NOT MEASURED` rather than its apparent result. A probe
> whose discriminating sibling cannot be constructed is recorded as unreachable, never as a pass.

**Placement.** After clause 2, in §18, under R-13.7. It extends no rule's scope: R-13.4 asks whether
a proof exists; clause 2 asks whether it touched anything real; **clause 3 asks whether the answer
came from the subject.**

## 2. Why it is not already covered by clause 2

Clause 2 governs **fault injection** — *"a demonstration is only evidence of what it actually faulted,
and of what actually ran"*. Its two halves are both about a deliberate action the author takes: where
the fault was injected, and which branch fired. **Both presuppose that the code under test is the
code that ran.**

Clause 3 governs **observation**, where nothing is injected and the author takes no action at all
beyond looking. The failure mode is upstream of everything clause 2 addresses: **the subject was
never reached, and something else answered in its place, plausibly.**

| | Clause 2 | Clause 3 |
|---|---|---|
| Activity | fault injection | observation |
| Failure | the right subject, faulted in the wrong place, or the wrong branch fired | **the wrong subject answered** |
| Symptom | a proof that passes and proves less than it claims | **an answer that is plausible and is about something else** |
| Control | fault the source of truth; record the branch | **a sibling that must not succeed** |

## 3. The runs that motivated it — three, and the third is the sharpest

### (a) The live deployment. A 405 that read as a route

Four probes against `https://inteligenceplane.dbizsolution.com`, recorded in full at
[`D-121_DECISIVE_TEST_MEASURED.md`](D-121_DECISIVE_TEST_MEASURED.md) §5:

| Probe | Status | Bytes |
|---|---|---|
| `POST /v1/execute` | 405 | 335 |
| `POST /v1/evidence` | 405 | 335 |
| `POST /zzz-deliberately-nonsense-path` | **405** | **335** |
| `POST /api/packages/notahash` | 404 | 136 |

The three 405s are **byte-identical**, and the bytes are **Azure Blob Storage's `UnsupportedHttpVerb`
page**. `/v1/*` never reaches the application. The fourth probe returns NestJS's own refusal in the
same minute, so the application is up and the fallthrough is specific rather than an outage.

> **`405 UnsupportedHttpVerb` on `POST /v1/execute` is a plausible answer from a route that exists.**
> It says *"wrong verb"*, which is what a mounted-but-GET-only route would say. **A 405 is a stronger
> false signal than a 404**, because it appears to confirm the path is real and merely misused. Read
> alone it would have concluded that the gateway was deployed and the cross-plane contract question
> was live on the wire. It was not, and never had been.

### (b) The store, one layer in

`SealedPackageWriteRefused` on the authored package would have read as *"the store is
misconfigured"* — and OBL-002 is the recorded precedent for exactly that misdiagnosis on this
boundary, where a full cycle was spent on a credential that was never the problem. **The
contract-conforming control body proved the store accepts, partitions and serves in the same run.**
Only then does the refusal mean what it says.

### (c) The one that shows the clause is not merely prudent — the same control, in this report's own probe

[`D-122_WRITER_RULING_DESIGN_REPORT.md`](D-122_WRITER_RULING_DESIGN_REPORT.md) §2:

```
store.put(the gateway envelope)  -> REFUSED: sealed body carries no provenance.tenantId
store.put("{}")                  -> REFUSED: sealed body carries no provenance.tenantId
```

> **The refusal D-121 relied upon is byte-identical to the refusal an EMPTY OBJECT earns.** It is the
> fallthrough. On its own it establishes *"not a package"*, not *"this package is wrong in a specific
> way"* — and *"the gateway emits a shape the store refuses on its first field"* is a claim that
> **was carried into a settled ruling**. The claim is still correct: control 1, a well-formed package
> refused on a later field for a stated reason, is what shows `put` reading and asserting.
>
> **But the discriminator arrived after the conclusion did, not before it.** That is the argument for
> making this mechanical rather than diligent, and it is the same argument clause 1 makes about
> properties: the control is least likely to be constructed exactly when the result already looks
> right.

## 4. What adoption would cost, stated before it is asked for

**Enforcement.** CHARTER §6 forbids a rule that relies solely on documentation, and §18's own
adoption precedent (ADR-0019, on the ADR-0030/ADR-0031 pattern) is to land a decision **with its
mechanisms explicitly sequenced and the gap named** rather than to claim full enforcement. Honestly
assessed:

| Mechanism | Assessment |
|---|---|
| **Authoring-time obligation** — a recorded observation lands with its discriminating sibling and that sibling's response | **Available immediately.** This is where clause 2 currently sits too |
| **Machine-readable capture** — extending `record-fault-proofs.js` from faults to probes | **Sequenced.** It is the same extension already sequenced for scenario properties under ADR-0019, and would follow it |
| **A gate over recorded observations** | **Not available, and the reason is structural** — see below |

> **THE HONEST GAP: A GATE CANNOT DECIDE WHETHER A SIBLING WAS *ADEQUATELY* NONSENSE.** It can check
> that a sibling was recorded and that the two responses differ. It cannot check that the sibling
> exercised the distinction that mattered — a sibling chosen to differ is trivially constructible,
> and would satisfy the check while proving nothing. **The clause would therefore be enforced at two
> mechanisms, not three, on adoption.** That is stated here rather than discovered after acceptance,
> and it is a real argument for deferring adoption until the third exists.

**The strongest argument against adopting it at all**, put as well as it can be: **clause 3 may be
clause 2 generalised rather than a third rule.** Both say *"a result is evidence only of what
produced it"*; clause 2 says it about a fault and clause 3 says it about a response. A ruling could
reasonably conclude that clause 2 should be **restated at the general form** and clause 3 folded
into it, leaving §18 with two clauses rather than three. **That would be a better outcome than
adopting this text**, and this proposal does not argue against it — a constitution with two general
rules is stronger than one with three specific ones.

## 5. What is being asked for

A ruling, in one of four dispositions:

1. **Adopt as clause 3**, via an ADR amending ADR-0019, with the two available mechanisms in force
   and the third named as sequenced.
2. **Adopt by restating clause 2 at its general form**, absorbing this — §4's counter-argument.
3. **Defer** until the third mechanism exists, keeping this file as the record of why.
4. **Decline**, recording that the obligation is adequately carried by CHARTER §3 (*"never assume —
   inspect, validate, document"*) and needs no constitutional clause.

**Until one of these is ruled, the obligation is honoured in practice and cited from
[D-117](TECHNICAL_DEBT.md), [D-121](TECHNICAL_DEBT.md) and [D-122](TECHNICAL_DEBT.md) — and it
governs nothing.**
