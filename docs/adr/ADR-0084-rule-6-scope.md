# ADR-0084 — Rule 6's scope: "secrets never cross", not "this plane holds none"

**Status:** ACCEPTED · **Date:** 2026-08-06

**Discharges:** the reconciliation D-123 link 1 recorded as owed
**Report:** [`D-123_LINK1_PACKAGE_SIGNING_REPORT.md`](../../program/D-123_LINK1_PACKAGE_SIGNING_REPORT.md) §3

> **ACCEPTED AND EXECUTED 2026-08-06. §6 steps 1 and 3 are complete; step 2's diff is recorded below
> because it IS the evidence for P-84.2.**
>
> **Measured on the amendment:** **72 rule lines before, 72 after, ZERO changed. 20 Conformance and
> Enforcement lines before, 20 after, ZERO changed.** The only removals in the diff are the version
> line and the amendments line. **Nothing that carries force moved.**
>
> **A change whose risk is how it will be read needs its evidence to be the reading** — so the
> verification is the diff itself rather than a test, because no test can detect this change and
> none should be written to pretend otherwise.
>
> **LANDED BEFORE [ADR-0083](ADR-0083-signing-key-custody.md), DELIBERATELY.** In the other order,
> moving the signing key into the Secret Provider would read as **a violation being remediated** —
> and it never was one. This ADR establishes that holding the key here is permitted; ADR-0083 is
> then legible as **a custody improvement**, which is what it is.

> **THIS ADR ADDS NO RULE AND NARROWS NONE.** It records the scope **Rule 6's own title already
> implies** and **its own conformance line already states** — *"secrets never cross"*, not *"this
> plane holds none"*. No invariant moves, no rule is amended, no permission is created, and nothing
> becomes legal that was not legal before.
>
> **IT IS WRITTEN BECAUSE BEING KNOWN IS NOT ENOUGH.** A reader resolving **R-6.3** against
> **R-08.15** from what is on the page concludes **the platform is in constitutional violation** —
> and would be **reasoning correctly**. That is the defect this closes: not a wrong rule, but a
> correct rule whose scope must be re-derived by every reader, with one derivation available that is
> wrong and looks right.

---

## 1. Problem

**Two rules appear to contradict each other, and one of them is the constitution.**

| Source | Says |
|---|---|
| **R-6.3** — [01 Platform Constitution](../architecture/01-platform-constitution.md), Rule 6 | *"Credential custody belongs **exclusively** to the Execution Plane."* |
| **R-08.15** — [08 Security Model](../architecture/08-security-model.md) | *"**Signing keys are DBiz-held.** Verification keys are distributed to customer tenancies and are public-verification only."* |
| **ADR-0007 §4** | *"Signing keys are DBiz-held and never distributed."* |

**The Intelligence Plane holds an ed25519 private key.** Read literally, R-6.3 forbids what R-08.15
requires — and R-6.3 is in the document whose own authority line reads *"where any other document
conflicts with this one, this one governs."*

**So the literal reading does not merely raise a question; it resolves it against the security model
and concludes a violation.**

## 2. Context

### 2.1 The rule's own conformance line already states the scope

Rule 6 is not ambiguous when read whole:

```
### Rule 6 — Secrets never cross
  R-6.1  Only credential REFERENCES cross the plane boundary.
  R-6.2  Secret material SHALL NOT cross in any environment, for any reason.
  R-6.3  Credential custody belongs exclusively to the Execution Plane.

  Conformance: no secret-shaped value appears in ANY CROSS-PLANE PAYLOAD in any environment.
  Enforcement: (1) outbound payload guard; (2) contract schema admitting references only;
               (3) secret-scanning gate over the CROSS-PLANE CLIENT and its tests.
```

> **THE CONFORMANCE AND ENFORCEMENT LINES ARE ENTIRELY ABOUT WHAT CROSSES.** Every one of the three
> enforcement mechanisms inspects a **cross-plane payload or the cross-plane client**. **A rule
> forbidding this plane from holding any key at all would have no enforcement mechanism here** — none
> of the three could detect it, and a constitutional rule with no mechanism is the failure R-6's own
> document rates at zero.
>
> **So the scope is already determined by the rule as written.** What is missing is that **R-6.3's
> sentence can be read in isolation**, and in isolation it says something the rest of its own rule
> does not.

### 2.2 What R-6.3 is protecting, and why the customer's credentials are the subject

The **rationale** of Rule 6 is that the Intelligence Plane must never be able to act as the customer
against the customer's own systems. **Credential custody belongs to the Execution Plane because the
credentials in question are the CUSTOMER'S** — the ones that reach their test management, their
source control, their application. R-08.17 states the same boundary from the other side: *"DBiz SHALL
NOT hold, inside a customer tenancy, any key that could be used to impersonate that customer to third
parties."*

**A DBiz package-signing key is the opposite artefact in every respect that matters:**

| | A customer credential (R-6.3's subject) | The DBiz package-signing key |
|---|---|---|
| Whose identity does it assert? | the **customer's**, to third parties | **DBiz's**, to the customer |
| Does it cross the boundary? | **must not** — R-6.1, R-6.2 | **never** — only the public half is distributed |
| Who must hold it? | the Execution Plane, exclusively | DBiz, exclusively (R-08.15) |
| What does possession of the distributed half permit? | — | **verification only; it cannot sign** (R-08.15) |

**They point in opposite directions across the same boundary.** Reading one rule as governing both
makes each plane's own identity material the other's to hold, which no document intends and which
R-08.17 explicitly contradicts.

### 2.3 AD-016's shape, a second time

This is the second time in this programme that **two correct rules have appeared to conflict because
the sentence reconciling them was never written**. The first was AD-016: ADR-0007 closes its
**model**, doc 20's R-20.29 calls it **open** — both true, of different halves, and
[ADR-0081](ADR-0081-execution-package-signature-carrier.md) §2.3 had to spend a section on it.

> **The pattern is worth naming because it recurs cheaply and costs dearly:** a decision splits a
> concern, each half is recorded correctly in its own document, **and no document records that there
> are two halves.** Every subsequent reader re-derives the split, and the derivation is not always
> the same.

## 3. Alternatives

| Option | Verdict |
|---|---|
| **A — leave it; the reconciliation is known** | **Rejected.** *Known* is not a property of the estate. The next reader has R-6.3's sentence, R-08.15's sentence, and no instruction — and the wrong resolution reports a constitutional violation, which is expensive to answer and correct on its face |
| **B — amend R-6.3's text** to say "customer credential custody" | **Rejected, and this is the closest call.** It is the smallest edit and it changes a **constitutional rule's wording**, which invites the reading that the rule was narrowed. It was not: §2.1 shows the scope was already there. **An edit that looks like a narrowing of the constitution is worse than a note that is plainly not one** |
| **C — record the scope as a clarification beside Rule 6** ⟵ **RECOMMENDED** | Says what the rule already means, where the reader meets it, without touching the rule's words |
| **D — amend R-08.15 to acknowledge R-6.3** | **Rejected.** It puts the reconciliation in the subordinate document, so a reader of the constitution alone — the document that governs — still meets the isolated sentence |

## 4. Decision

**P-84.1 — Rule 6 governs what CROSSES the plane boundary. Its subject is the CUSTOMER'S credentials.**

`R-6.3`'s *"credential custody belongs exclusively to the Execution Plane"* is a rule about the
credentials Rule 6 forbids from crossing — those that authenticate to the customer's systems. **It is
not a rule that the Intelligence Plane holds no key material of its own.**

**P-84.2 — This ADR adds no rule, amends none, and creates no permission.**

Every rule keeps its number, its wording and its force. **Nothing becomes legal that was not legal
before**, and nothing that was forbidden is now allowed. The scope recorded here is the one Rule 6's
title states, its conformance line measures, and all three of its enforcement mechanisms inspect.

**P-84.3 — DBiz's own signing key is R-08.15's subject and stays so.**

It is held by the Intelligence Plane, never distributed, and only its public half crosses — and
possession of that half **cannot produce a signature** (R-08.15). **That is not an exception to Rule
6; it is outside Rule 6's subject**, and P-84.1 is what makes the difference statable.

**P-84.4 — The clarification lands beside Rule 6, not in a subordinate document.**

A reader of the constitution alone must meet it, because the constitution is the document that
governs and its isolated sentence is what produces the wrong reading.

### 4.1 What SHALL NOT be done

- **SHALL NOT rewrite R-6.1, R-6.2 or R-6.3.** Their wording, numbering and force are unchanged, and
  an edit would suggest the rule was narrowed when its scope was always this.
- **SHALL NOT read this as licence to hold any other key material** in the Intelligence Plane. It
  states the boundary; it does not move it. New key material is a new decision.
- **SHALL NOT record the reconciliation only in an ADR.** An ADR is where a decision is argued; the
  architecture is where a reader looks. **The point of this decision is that being written somewhere
  is not the same as being written where it is read.**

## 5. Consequences

**What improves.** A reader of Rule 6 can no longer derive a violation from a correct platform. The
custody question that D-123 link 1 had to reconstruct is answered in place. And ADR-0083's decision
to move the signing key into the Secret Provider is legible as **a custody improvement rather than a
compliance fix**, which is what it is.

**What it costs.** [01 Platform Constitution](../architecture/01-platform-constitution.md) takes a
version increment and a re-baseline — an amendment to the platform's highest authority, for a
clarification. **That cost is the reason §3 option A is tempting and the reason it is refused:** the
document that governs is exactly the document where an ambiguity is most expensive.

**What does not change.** Every invariant, every rule, every conformance and enforcement line. Rule
6's mechanisms are unchanged and still measure only what crosses. R-08.15, R-08.17 and ADR-0007 are
enforced, not amended.

**Risk.** **A clarification can be read as a loosening.** Someone encountering *"Rule 6 governs what
crosses"* without its reasoning could take it as permission for the Intelligence Plane to hold key
material generally. **P-84.2 and §4.1 exist to make that reading unavailable**, and the clarification
is written as a scope statement rather than as a permission.

### 5.1 Why this is a CLARIFICATION and not an amendment, on ADR-0078's own test

[ADR-0078](ADR-0078-package-retrieval-recorded-in-architecture.md) §4.1 split a change honestly into
a **clarification** (no invariant moves; the rule was always right) and a **true amendment** (a rule
no longer holds). **This is wholly the first kind**, and it meets the test §2.1 supplies: **the
scope is already enforced by the rule's own three mechanisms**, none of which could detect what the
literal reading would forbid. **A rule whose enforcement cannot see a case was never about that
case.**

## 6. Migration strategy

**Post-acceptance, each step separately authorised; none performed here.**

1. **Amend [01 — Platform Constitution](../architecture/01-platform-constitution.md)**, adding the
   scope statement beside Rule 6 and recording the amendment in the document's own amendment line as
   **a clarification that adds no rule** — the wording matters, because the amendment line is what a
   later reader uses to judge whether the constitution changed.
2. **Re-baseline deliberately**, review the diff, and confirm that **only Rule 6's scope note moved**
   and that **no rule text, conformance line or enforcement line changed** — that diff is the
   evidence for P-84.2 and should be read as such rather than skimmed.
3. **Cross-reference from [08](../architecture/08-security-model.md) §5** at R-08.15, so a reader
   arriving from the security model meets the same statement. **One sentence, pointing at the
   constitution — not a second copy** (CHARTER §4).

**Nothing in this sequence changes behaviour, and no test can detect it.** That is expected: the
defect is in what a reader concludes, and the repair is measured by a reader reaching the right
conclusion from the page alone.

## 7. Version impact

- **[01 — Platform Constitution](../architecture/01-platform-constitution.md): v1.3 → v1.4**, and it
  **stays FROZEN**. The amendment is a scope clarification; **no invariant, rule, conformance line or
  enforcement mechanism is added, removed or reworded.**
- **[08 — Security Model](../architecture/08-security-model.md)** takes a cross-reference at R-08.15
  (§6 step 3). No rule changes.
- **No contract change**, no gate added, no ADR superseded.
- **ADR-0007, ADR-0081 and ADR-0083 are enforced, not amended.** ADR-0083 in particular becomes
  easier to read correctly once this lands.
- **Closure baseline:** adding this ADR turns the *"no ADR has been added since closure"* leg **RED
  on exactly one leg**; executing §6 step 1 will additionally move document 01's hash. **Both are
  deliberate and are recorded before the change.**

## 8. Affected components

- [`ADR-0084-rule-6-scope.md`](ADR-0084-rule-6-scope.md) — **New** (this ADR).
- [`01-platform-constitution.md`](../architecture/01-platform-constitution.md) — **Amended** on execution (§6 step 1: the scope statement beside Rule 6; v1.3 → v1.4, FROZEN retained).
- [`08-security-model.md`](../architecture/08-security-model.md) — **Amended** on execution (§6 step 3: a cross-reference at R-08.15).
- [`ADR-0007-package-signing.md`](ADR-0007-package-signing.md) — **Enforced, not amended.**
- [`ADR-0083-signing-key-custody.md`](ADR-0083-signing-key-custody.md) — **Enforced, not amended.** Its subject is where the key lives; this is whether holding it is permitted at all.
- [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md), [`TECHNICAL_DEBT.md`](../../program/TECHNICAL_DEBT.md), [`DECISIONS.md`](../../program/DECISIONS.md), [`NEXT_ACTION.md`](../../program/NEXT_ACTION.md) — **Amended** (the knowing red, the index row, the next action).

**No frozen architecture document, no contract, no gate and no source file is modified BY THIS ADR.**

---

> **STOP FOR ACCEPTANCE.** R-18.26 gates implementation on acceptance with an impact analysis, a
> migration strategy and a governance review. §5 is the impact analysis and §6 is the migration
> strategy. **Until accepted, R-6.3 and R-08.15 stand exactly as written, and the reconciliation
> remains something every reader must derive.**
