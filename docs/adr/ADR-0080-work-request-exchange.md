# ADR-0080 — The Work-Request Exchange: how the Execution Plane learns which hash to fetch, and the response shape that keeps the taxonomy closed

**Status:** ACCEPTED · **Date:** 2026-08-06 · **Accepted:** 2026-08-06 · **Tree:** `a3d3a16`
<!-- Status is written UNBOLDED deliberately, as ADR-0079's is. `emit-closure-package.mjs:116`
     parses it with /\*\*Status:\*\*\s*([A-Z]+)/, which yields UNKNOWN for the bold-wrapped form.
     This is a one-row workaround, NOT the repair; see debt D-107. -->

**Governed by:** [05 — Cross-Plane Communication](../architecture/05-cross-plane-communication.md) (direction, the result taxonomy, the degradation matrix); [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md); [01 — Platform Constitution](../architecture/01-platform-constitution.md) Rules 5 and 10; [12 — Capability Orchestration](../architecture/12-capability-orchestration.md) §R-12.5; [18 — Governance Model](../architecture/18-governance-model.md) §R-18.26–29
**Answers:** **AD-043** — *"which Execution-Plane-initiated exchange carries the package hash to the Execution Plane, and what else it carries"* ([05](../architecture/05-cross-plane-communication.md) §9), and [ADR-0078](ADR-0078-package-retrieval-recorded-in-architecture.md) **P-78.7**.
**Closes:** **AD-043** ([05](../architecture/05-cross-plane-communication.md) §9).
<!-- `Closes:` is the label verify-adr-completeness.js reads to tie a closed decision to its ADR;
     `Answers:` above is prose and the gate does not see it. Added AT ACCEPTANCE, as a traceability
     label rather than a change to any proposition — the same at-acceptance correction ADR-0079 §7.1
     records. Without it the architecture declares AD-043 CLOSED with no ADR traceable to it. -->
**Amends:** [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) **P-70.2**, which is FROZEN and wrong as built. See §4 P-80.1.
**Relates to:** [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) (P-70.1 the IP never delivers, P-70.3 no delivery state, P-70.4 one refusal signal) · [ADR-0079](ADR-0079-retrievable-package-store.md) (the store the hash is fetched from) · [ADR-0036](ADR-0036-execution-plane-registration-and-trust-establishment.md) (the grant this extends) · the `/updates` software-update exchange this deliberately does **not** reuse (§2.3, and see §5.3 — the code citing it names an ADR that does not cover it)

> **ACCEPTANCE (2026-08-06, programme-owner authority; CHARTER §9).** Accepted as written, with all seven propositions as scoped. Acceptance satisfies R-18.26 — an ADR, an impact analysis, a migration strategy and a governance review **before** implementation — and authorises §6 from step 2. **AD-043 is CLOSED** and [ADR-0078](ADR-0078-package-retrieval-recorded-in-architecture.md) **P-78.7** is discharged. **This ADR is FROZEN on acceptance**, as ADR-0069, ADR-0070, ADR-0076, ADR-0077, ADR-0078 and ADR-0079 are. New findings are recorded in `TECHNICAL_DEBT.md` and `PROJECT_STATE.md`, never written back into it.
>
> **THE TWO RULINGS ACCEPTANCE CARRIES, NAMED BECAUSE NEITHER IS AN IMPLEMENTATION CHOICE.** **P-80.1 amends a FROZEN decision** — ADR-0070 P-70.2's *"the request the Execution Plane already makes"* becomes *an Execution-Plane-INITIATED request*, because measurement showed no existing request can carry work without acquiring the delivery state P-70.3 removed. **P-80.3 is a DESIGN LAW binding every future exchange**: ADR-0078's taxonomy is closed at four, so where a response shape forces a fifth class, **the shape is wrong, not the taxonomy.**
>
> **Two residuals stay OPEN and acceptance does not close them:** **D-112** (ADR-0070 P-70.5 and doc 05 §9's count, both false on disk — §5.2) and **§5.1**'s derivation risk, which §6 step 3 condition (b) is written to catch.

> **WHAT THIS ADR DOES.** It settles the exchange by which the Execution Plane learns *which* package hash to fetch — the last unbuilt piece of the retrieval inversion — and it fixes the **response shape**, because the shape and not the taxonomy is what determines whether ADR-0078's four result classes remain sufficient.
>
> **WHAT IT DOES NOT DO.** It does not repair [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) **P-70.5** or [05](../architecture/05-cross-plane-communication.md) §9's *"sole Execution-Plane-initiated route"* statement, both measurably false on disk. They are recorded at §5.2 as **D-112** and left. Repairing a frozen document mid-design lands a second thing unreviewed.

---

## 1. Problem

**The Execution Plane can now fetch a package by hash and has no way to learn which hash.**

[ADR-0079](ADR-0079-retrievable-package-store.md) built the store and `GET /api/packages/{hash}` serves it. Retrieval is keyed by a value **the Execution Plane must already hold**, and nothing hands it one. [05](../architecture/05-cross-plane-communication.md) §9 records the gap precisely: *"no exchange exists that hands it one."*

[ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) **P-70.2** asserts the answer — *"the package hash is returned on the request the Execution Plane already makes. No new notification channel and no polling"* — and §6 step 3 sequences it as *"return the package hash on the existing Execution-Plane request."*

**Measured, that is false as built.** There is no existing request for work. The question this ADR answers is therefore not the one P-70.2 anticipated, and answering it truthfully requires amending P-70.2 rather than implementing it.

## 2. Context

### 2.1 What exists, measured on `4f107e6`

| | State |
|---|---|
| A retrievable store, keyed by content hash | **Exists** — ADR-0079, `t/<slug>/packages/sealed/<hash>` |
| `GET /api/packages/{hash}`, ownership-authorised | **Exists**, mounted, and socket-proved |
| An EP-initiated exchange carrying **work** | **Does not exist** |
| An EP-initiated exchange carrying **software updates** | **Exists** — `GET /api/tenants/{slug}/updates` (§5.3) |
| A polling cadence already handed to the EP | **Exists** — the registration grant carries `updatesPath` and `pollingIntervalSeconds: 60` |
| `runId` / `correlationId` on the package | **Exists** — in the frozen `ExecutionPackage` contract |

### 2.2 There are four EP-initiated routes, not one, and none carries work

[05](../architecture/05-cross-plane-communication.md) §9 states *"the sole Execution-Plane-initiated route today mints a credential and carries no work."* **Measured: there are four** — `POST /api/register`, `GET /api/tenants/{slug}/updates`, `POST /api/tenants/{slug}/updates` and `POST /api/tenants/{slug}/installed`; [`api.ts`](../../packages/tenant-onboarding-engine/src/engine/api.ts) labels the updates pair *"EP-initiated"* in its own source.

**The conclusion survives — none carries work — but the premise does not**, and it is recorded rather than silently relied upon because P-70.2 turns entirely on which exchanges exist.

### 2.3 Why `/updates` cannot carry work, and the second reason is decisive

`GET /api/tenants/{slug}/updates` is the only structurally plausible existing carrier. It is disqualified twice:

1. **A different lifecycle.** It carries *software update* events — *"your solution package version changed"* — not *"here is a run to execute"*. Overloading it conflates two independently-versioned concerns.
2. **IT IS A DELIVERY-STATE CHANNEL, AND THAT IS DECISIVE.** Its sibling `POST /updates` → `acknowledgeUpdate` ([`tenant-repository.ts:529-536`](../../packages/tenant-onboarding-engine/src/engine/tenant-repository.ts)) flips `status: pending → applied` and stamps `appliedAt`. **Putting work on this channel makes the Intelligence Plane record that work was collected** — which is exactly the delivery tracking **P-70.3** exists to prevent and **R-20.31** forbids.

**Reusing it would sacrifice P-70.3 to satisfy P-70.2.** Of the two, P-70.3 is the one carrying the architectural benefit: re-fetch without the IP tracking delivery, which is what makes an EP crash recoverable.

### 2.4 "No polling" cannot mean what it says, and R-05.1 is why

P-70.2 forbids *"polling"*. **R-05.1 forbids any callback, webhook, queue, subscription, polling endpoint or long-lived socket ORIGINATING IN THE INTELLIGENCE PLANE.** The IP therefore cannot notify, so the Execution Plane must ask — and **every EP-initiated request is a poll in the plain sense.** Read literally, P-70.2 forbids the only architecture R-05.1 permits.

**So P-70.2's "no polling" is read as "no NEW polling channel", and P-70.3 cannot have forbidden the architecture it was written to enable.** That reading is adopted here explicitly rather than assumed, because it is not what the words say.

## 3. Alternatives

**A. Reuse `GET /updates`.** Rejected — §2.3. It satisfies P-70.2's letter by breaking P-70.3, and P-70.3 is the load-bearing one.

**B. A singular work resource — `GET /api/tenants/{slug}/work` returning one item.** **Rejected, and it is the alternative that looks simplest.** Absence must then be a 404. Under **R-05.24** a refused retrieval is a **Refusal**; under [05](../architecture/05-cross-plane-communication.md)'s degradation matrix **Refusal → HALT, assurance state `HALTED`**. **An Execution Plane with nothing to do would HALT on every quiet poll.** The only escapes are a fifth result class — an amendment to a taxonomy ADR-0078 closed at four — or an idle EP that halts. See P-80.3.

**C. A fifth result class, `NO WORK`.** Rejected. *No work* is a **successful answer to the question asked**, and ADR-0078 §4.1 records what it costs to add a class: R-05.5 declared three exhaustive and a fourth was mandatory only because retrieval created a boundary *"the taxonomy was never drawn against"*. **No new boundary exists here.** The pressure for a fifth class comes entirely from alternative B's response shape, and the correct response to that pressure is to change the shape.

**D. The IP notifies the EP when work is authored.** Rejected — R-05.1, R-05.2, and the four reasons [05](../architecture/05-cross-plane-communication.md) §1 gives for one direction. Not available at any price.

**E. Carry the hash and nothing else.** Rejected — P-80.4. A hash identifies an **artefact**; it cannot express that one run supersedes another, cannot be correlated to the request that caused it, and gives the EP no way to report against work it could not start.

## 4. Decision

**P-80.1 — [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) P-70.2 IS AMENDED. The hash rides an EXECUTION-PLANE-INITIATED request, not an EXISTING one.**

> P-70.2 as written: *"The package hash is returned on the request the Execution Plane already makes. **No new notification channel and no polling.**"*
>
> **As amended:** the package hash is returned on **an Execution-Plane-initiated request**. **No notification channel originating in the Intelligence Plane, and no new polling CADENCE** — the exchange runs on the interval the registration grant already establishes.

**What is preserved, and it is the whole of P-70.2's intent:** the Intelligence Plane never initiates, no channel is opened toward the customer tenancy, and the EP remains the only dialler. **What changes is a factual claim about what existed** — and it was wrong on the day it was written, in the same way ADR-0078 §5 records ADR-0070 §6 step 1's four assertions as *"three of them false on the day they landed."* This is that class, found once more, in the same ADR.

**P-80.2 — The exchange is `GET /api/tenants/{slug}/work`, and it is new.** Execution-Plane-initiated, tenant-scoped by slug, polled at the cadence the registration grant already carries. **It is deliberately NOT `/updates`** (§2.3), and the two remain independent: a software update and a run are different lifecycles and neither blocks the other.

**It carries a slug, so unlike `GET /api/packages/{hash}` it DOES inherit the tenant router's authorisation** — slug validation, `permissionForRoute`, `mayAccessTenant`, and the EP-token revocation check at `api.ts:126`. **This is stated because the contrast is load-bearing:** ADR-0079 P-79.8 required the package route's auth block to be authored from nothing precisely because it has no slug. This route must **not** repeat that work, and must not be given a hand-written auth block that silently diverges from the shared one.

**P-80.3 — THE RESPONSE IS A COLLECTION, AND THIS IS A DESIGN LAW RATHER THAN A PREFERENCE.**

> **A RESPONSE SHAPE THAT FORCES A FIFTH RESULT CLASS IS THE SHAPE THAT IS WRONG — NOT THE TAXONOMY.**

ADR-0078 closed the result taxonomy at four after establishing that a fifth is added only when a **new boundary** exists that the enumeration cannot express. *"I answered, and the answer is zero"* is not a new boundary: it is **Success**. Refusal is *"I will not tell you"*; Unavailability is *"I cannot answer"*; Integrity Failure is *"I answered and the artefact cannot be trusted"*. **None of them is an empty answer.**

A singular resource cannot express an empty answer at all — absence is 404, 404 is a Refusal under R-05.24, and Refusal HALTs. **A collection expresses it natively: an empty array is a complete, true, successful answer.**

**This is the first time this pressure has arrived in this programme, and it is resolved by changing the shape.** It is recorded as a law because the next designer to meet it will feel the same pull toward the taxonomy, which is the more prominent artefact and the wrong one to move.

**P-80.4 — Work is identified by a RUN. The hash is what the run points at.**

Each item in the collection carries at minimum: `runId`, `correlationId`, the `packageHash` to fetch, and the package's `validity.notAfter`. **`runId` and `correlationId` already exist in the frozen `ExecutionPackage` contract**, so this introduces no new identity.

**Why the hash alone is insufficient:** it identifies an *artefact*, and two runs can legitimately point at the same artefact while one supersedes the other. A design carrying only the hash cannot express supersession, cannot correlate a run to the request that caused it, and leaves an EP unable to report against work it never started.

**P-80.5 — Pending work is derived from RUNS WITHOUT EVIDENCE, never from delivery state.**

A run appears in the collection while it is authorised and no evidence has been received against it. **R-20.12 already requires every evidence record to reference the package hash that produced it**, so the completion signal exists and is the customer's own evidence rather than a collection receipt.

**No field anywhere records that a work item was fetched.** No `deliveredAt`, no fetch count, no status transition on read. P-70.3 is preserved: an EP that crashes mid-execution re-polls, sees the same run, re-fetches by the same hash, and the Intelligence Plane learned nothing about either.

**P-80.6 — There is no acknowledgement, and none is added here.** R-20.31 stands unchanged. The collection is idempotent and leaves the Intelligence Plane byte-identical, exactly as retrieval does (R-05.21). **R-12.5 is the binding constraint** — an acknowledgement would be an Execution-Plane execution signal crossing back into the Intelligence Plane through a new door.

**P-80.7 — The registration grant carries the exchange.** [ADR-0036](ADR-0036-execution-plane-registration-and-trust-establishment.md)'s grant already returns `configuration.updatesPath` and `configuration.pollingIntervalSeconds`. It gains `workPath`, so a freshly-registered EP is told where to ask **without a second configuration step and without an operator transcribing a path** — the transcription failure R-13.1 names.

## 5. Consequences

**What improves.** AD-043 closes and the retrieval inversion is complete end to end: the EP learns of a run, fetches its package by hash, verifies it, and executes — with the Intelligence Plane holding no delivery state at any point. Milestone 1's Intelligence-Plane half becomes usable rather than merely present.

**What it costs.** A new route, its authorisation (inherited, not authored), its gate coverage, and a derivation of *pending work* that must be correct without a delivery record. The `/work` collection becomes a customer-visible surface with its own availability expectations.

**What does not change.** The `ExecutionPackage` contract, its seal, its content addressing. **The result taxonomy stays at FOUR.** P-70.1, P-70.3, P-70.4, R-12.5, R-20.31 and R-05.1 are enforced, not touched. No contract version moves.

### 5.1 The derivation is the risk, and it is stated rather than glossed

**P-80.5 replaces a delivery record with a derivation, and a wrong derivation is silent.** If *"runs without evidence"* is computed incorrectly the EP either re-executes completed work or never sees new work, and neither announces itself — there is no delivery record to disagree with. **The mitigation is that the derivation is testable from both ends** (a run with evidence disappears from the collection; a run without evidence persists across polls) and both directions are completion conditions at §6.

### 5.2 Two frozen statements are false on disk, and this ADR records them without repairing them

**[ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) P-70.5** asserts the retrieval endpoint *"is governed automatically by `verify-http-surface-parity.js`: the route must be served by `route()` and mapped by a mounted controller."* It is not: `route()` is pure and synchronous, retrieval is async, and the route is served by a dedicated handler and a self-handled controller — which parity excludes by HS-4's own rule. **[05](../architecture/05-cross-plane-communication.md) §9's *"sole Execution-Plane-initiated route"*** is wrong by count (§2.2).

**Both are carried as D-112 and NOT repaired here.** Repairing a frozen document in the middle of a design lands a second, unreviewed change inside a decision that should be judged on its own merits — the scope error **D-087** counts. They are named so that acceptance of this ADR is not read as endorsement of them.

### 5.3 The exchange this ADR declines to reuse cites an ADR that does not cover it

[`api.ts`](../../packages/tenant-onboarding-engine/src/engine/api.ts) labels the `/updates`,
`publish-update`, `installed`, `check-compatibility` and `rollback` routes **"Software Update
Management (ADR-0035)"**. **[ADR-0035](ADR-0035-execution-plane-operational-portal.md) is the
Execution-Plane Operational Portal**, and contains no software-update-management decision —
measured: zero occurrences of *update management*, *software update* or *acknowledge* in it.

**So the software-update exchange has no located authorising decision**, and the citation that
appears to supply one does not. This is recorded because **this ADR declines to reuse that
exchange (§2.3) and a reader may reasonably go looking for the decision that governs it.** It is
**D-107's class in a third place** — a status or reference read in one file, written in another,
validated in neither. It is **not repaired here**: correcting a citation requires establishing
which decision actually governs those five routes, which is an investigation and not an edit.

## 6. Migration strategy

Post-acceptance, in order. **None performed here** (R-18.26).

1. **Accept this ADR.** AD-043 stays open until then.
2. **Amend [05](../architecture/05-cross-plane-communication.md)** — AD-043 resolved, the work exchange recorded alongside R-05.21, and §2.2's count corrected. Doc 05 is FROZEN at v1.1 and takes v1.2. **Re-baseline deliberately.**
3. **Build `GET /api/tenants/{slug}/work`**, authorisation INHERITED from the tenant router and asserted to be so by test — a hand-written auth block on this route is a defect, not a variation.
   **Three completion conditions, none a follow-up.** (a) **An empty collection is returned with a SUCCESS status when there is no work**, and a test asserts the EP does not HALT. (b) **The derivation is proved in both directions** (§5.1): a run gains evidence and leaves the collection; a run without evidence survives repeated polls unchanged. (c) **A test proves the collection records nothing on read** — two identical polls leave the Intelligence Plane byte-identical.
4. **Extend the registration grant** with `workPath` (P-80.7), with a test that a fresh registration is sufficient to reach the exchange.
5. **Record residuals** — §5.1 and D-112 — in `PROJECT_STATE.md` before the milestone is called done.

**Not in this sequence, deliberately.** P-70.5's repair and doc 05 §9's count correction beyond what step 2 requires (§5.2).

## 7. Version impact

- **[05 — Cross-Plane Communication](../architecture/05-cross-plane-communication.md) takes v1.1 → v1.2**, FROZEN retained: AD-043 moves from open to resolved and the exchange is recorded. **This is the only architecture document that moves.**
- **[ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) P-70.2 is AMENDED** by P-80.1. ADR-0070 is FROZEN and is **not** written back into; the amendment lives here, which is what an amending ADR is for.
- **No contract change.** `CONTRACT_SCHEMA_VERSION`, `EXECUTION_CONTEXT_VERSION` and `PACKAGE_GOVERNANCE_VERSION` unchanged. No compatibility window opens. **The result taxonomy stays at four.**
- **Gate count +0 at acceptance; +1 at §6 step 3**, when the work exchange gains its own coverage with its fault proof.
- **This ADR's own landing is a baseline event** — the closure baseline enumerates ADRs on disk, so it trips `verify-programme-closure` and is cleared by a deliberate re-baseline whose diff moves only this ADR's entry. ADR-0079 §7.1 records why that is easy to miss: **a version-impact section that reasons only over the axes the change touches will miss every axis the change touches merely by existing.**

## 8. Affected components

- `docs/adr/ADR-0080-work-request-exchange.md` — **New** (this ADR).
- `docs/architecture/05-cross-plane-communication.md` — **Amended** at §6 step 2 (AD-043 resolved; the exchange recorded; §2.2's count corrected). v1.1 → v1.2.
- `packages/tenant-onboarding-engine/src/engine/api.ts` — **Amended**: the `work` action on the existing tenant router, inheriting its authorisation.
- `packages/tenant-onboarding-engine/src/engine/authz.ts` — **Amended**: `GET` already maps to `tenant:read`; confirmed, not extended.
- `packages/tenant-onboarding-engine/src/server/tenant.controller.ts` — **Amended**: one forwarding method.
- `packages/tenant-onboarding-engine/src/engine/registration.ts` — **Amended**: `workPath` on the grant (P-80.7).
- `governance/verification/` — **New gate** at §6 step 3, with its recorded fault proof.
- `program/DECISIONS.md`, `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md` — **Amended** on completion.

**No Execution-Plane artefact is modified by this ADR.** The EP client is the customer plane's to build against the contract this settles.

---

> **~~STOP FOR ACCEPTANCE.~~ SATISFIED 2026-08-06.** §6 step 2 onwards was gated on acceptance under R-18.26. **The amendment at P-80.1 changes a FROZEN decision and the design law at P-80.3 binds every future exchange** — both were taken as programme-owner rulings (CHARTER §9), not implementation choices, and both are recorded in the acceptance block above. **§6 step 1 is complete; step 2 is authorised.**
