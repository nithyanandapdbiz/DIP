# ADR-0082 — The Run-and-Evidence Record: what the Intelligence Plane keeps, so that stages 10–12 have an input

**Status:** ACCEPTED · **Date:** 2026-08-06
**Discharges:** debt D-115 · unblocks [ADR-0080](ADR-0080-work-request-exchange.md) §6 steps 3–5
**Reports:** [`D-115_RUN_AND_EVIDENCE_RECORD_DESIGN_REPORT.md`](../../program/D-115_RUN_AND_EVIDENCE_RECORD_DESIGN_REPORT.md) — ruled **Q1 = B, Q2 = B, Q3 = B** · [`P-82.3_WRITE_TRIGGER_CONTROL_REPORT.md`](../../program/P-82.3_WRITE_TRIGGER_CONTROL_REPORT.md) — the write-trigger control, reported before §6 step 1

> **ACCEPTED 2026-08-06, WITH ONE PROPOSITION ADDED AFTER ACCEPTANCE WAS SOUGHT — P-82.9 — AND IT
> EXISTS BECAUSE §5's RISK WAS READ AS A GAP RATHER THAN AS A CAVEAT.**
>
> **The gap, stated exactly: P-82.6's allow-list enumerates FIELDS; P-82.3 governs CAUSATION. They do
> not overlap.** A diagnostic field could be added **to** the allow-list by someone reading it as a
> schema rather than as an authorisation — one line, every gate green, and the store begins recording
> when a package was fetched. **A delivery record and an evidence record can hold identical fields
> and differ only in what causes a row to be written.**
>
> **P-82.9 makes that partly enforceable, and §4.2 states plainly what it does NOT cover.** An
> unenforced discriminator stated as unenforced is honest; one implied to be covered by the
> allow-list is not.
>
> **The re-baseline is taken on this acceptance and on nothing else**, clearing the single closure
> leg recorded knowingly in [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md) before this file was
> written.

> **ONE ADR, BECAUSE IT IS ONE DECISION.** The run record, the evidence record, the retention, the
> purge, the document-06 gate and the `packageHash` enforcement are not six changes that happen to
> arrive together. **Splitting them would ship a store whose retention is a follow-up** — the shape
> [ADR-0079](ADR-0079-retrievable-package-store.md) P-79.9 exists to refuse, and the shape D-087
> counts.
>
> **NO `Closes:` LABEL IS DECLARED.** This ADR closes no `AD-nnn`: D-115 is debt, and the open
> decisions on this axis — **AD-008** (cached package and validity window) and **AD-009** (how
> deferred certification is durably queued **inside the customer tenancy**) — are neither answered
> nor touched here. AD-009 in particular is about a queue in the **other** plane and must not be
> read as discharged by a store in this one.

---

## 1. Problem

**R-05.28 derives pending work from *runs without evidence*, and this plane holds neither operand.**

Measured across all fifteen packages: no run is persisted anywhere — the only durable per-tenant
store holds tenant envelopes, lifecycle and EP-token metadata, and five engines keep
`Map<runId, …>` accumulators that are process-lifetime and lost on restart. `POST /v1/evidence`
shape-checks a reference, **writes one JSON line to stdout**, and returns `202`. And the binding
between them is schema-only: `EvidenceReferenceSchema.packageHash` is imported by tests, the compat
harness and the schema emitter, and by **no engine, gateway or store** — while the type the engine
actually uses, `EvidenceReferenceHandle`, has **no `packageHash` field at all**.

**So the obligation this plane may not delegate has no input.** R-12.5 rules that stages 10, 11 and
12 — Reflection, Certification, Reporting — SHALL NOT be performed by the Execution Plane under any
circumstance. **A plane cannot discharge an obligation it is constitutionally forbidden to delegate
without receiving, and holding, the evidence that is its input.**

## 2. Context

### 2.1 What this record IS, before what it does

A per-tenant record of runs and received evidence is **customer-derived C3 data persisted in the
DBiz plane** — structure, route names, element identifiers, timings, counts
([06 §1](../architecture/06-data-sovereignty.md)). It is this plane's **second** such store, after
the sealed package store, and it inherits **every** obligation ADR-0079 discharged for the first.

### 2.2 The resemblance that must be dealt with before anything else

An evidence record resembles the delivery tracking P-70.3 removed: both are per-tenant records of
things that crossed the boundary, and both grow over time. **A reader who opens this ADR and sees a
per-tenant record of cross-boundary events will reach for P-70.3.** §4 exists so that reader is
handed a test rather than an argument.

### 2.3 A false conflict, pre-empted because a reader will hit it

The tenant record carries `dbiz.retentionObligationDays: 365`. **That is not a C3-in-IP retention and
does not contradict the 90-day ceiling.** It is consumed at `solution-export.ts` as `retentionDays`
in the **generated Execution Plane solution** — the customer's own retention obligation over data
residing in the **customer's tenancy**, where R-06.6 says it belongs and no DBiz-side ceiling
applies. **Two different sides of the boundary, two different numbers, both correct.** Traced to its
single consumer before this note was written.

## 3. Alternatives

| Question | Options | Selected |
|---|---|---|
| **Q1 — how a run is known to exist** | infer from the sealed package store · **record at authoring time** | **Record at authoring time** |
| **Q2 — whether received evidence is recorded** | keep stdout · **record it** | **Record it** |
| **Q3 — the `packageHash` binding** | leave declared · **enforce at ingress** | **Enforce at ingress, FIRST** |
| **The document-06 gate** | a second gate · **a second enumerated subject on the existing one** | **Second subject** — §3.2 |
| **What the record holds** | payloads · **references and hashes only** | **References and hashes** — §4.4 |

**Q1-A, inferring runs from the sealed package store — NOT AVAILABLE, rather than worse.** The store
can enumerate hashes per tenant but **cannot say which represent outstanding work**: it holds no run,
and holds **deliberately no delivery state** (P-79.7), and its `run` layout segment is the constant
`'sealed'` — its own header admits the value *"is neither a capability nor a run"*. Inferring would
mean either *every package ever authored is outstanding forever*, or **adding delivery state to the
store, which is the P-70.3 violation directly.**

**Q2-A, keeping stdout — it is not a smaller option, it is a stop.** Stages 10–12 would have no
durable input, so R-12.5's obligation is unmeetable across a process restart and R-05.28's derivation
has no second operand. **The work-request exchange becomes permanently unbuildable**, and that should
be recorded as such rather than worked around.

**Q3-A, leaving the binding declared — rejected, and §4.5 is why.**

### 3.1 Why one ADR and not three

Because the three answers are not independent: a run record without an evidence record derives
nothing; an evidence record that cannot be joined to a run derives nothing; and either store without
its retention, purge and gate is a customer-data store this plane is not authorised to hold. **Three
ADRs would produce three partial authorisations, and the first one accepted would create a C3 store
whose obligations were scheduled.**

### 3.2 Why the document-06 gate takes a second SUBJECT rather than a sibling gate

`verify-data-sovereignty-store.js` is **scoped to one subject by construction** and says so: it
hard-codes the sealed package store's source path and **fails closed when that file is absent**,
rather than passing vacuously over an empty subject — CHARTER §17.1.1 applied at authoring time.

A second gate would be the cheaper change and is refused:

> ***"Which stores does document 06 govern?"* must have ONE answer, read from ONE enumeration.** A
> sibling gate makes the answer *"however many gates someone happened to write"* — which is exactly
> the shape debt **D-126** records about the ADR index, where three gates ran over the estate and
> none over the index, and eight ADRs sat unindexed because no single enumeration owned the question.

So the gate gains a **subject list**, each entry carrying its module path, its test path and its
authorising ADR; every property runs per subject; and **an empty subject list fails closed**, exactly
as the single hard-coded subject does today.

## 4. Decision

**P-82.1 — A run is recorded AT AUTHORING TIME, by this plane, about its own act.**

Stage 7 emits exactly one sealed execution package (R-12.3). **That is the moment a run demonstrably
exists, and a moment this plane is already writing.** The record is derived from the package it just
sealed: it needs no new customer data and opens no new crossing.

**P-82.2 — Received evidence IS recorded, and it is the one signal that legitimately crosses back.**

`POST /v1/evidence` gains a store behind it instead of a `console` line. **This is required, not
merely permitted** — see P-82.3.

**P-82.3 — THE DISCRIMINATOR, CARRIED HERE AS THE RULE A LATER READER IS HANDED INSTEAD OF THE ARGUMENT.**

> **Ask what changes when an Execution Plane re-fetches a package it already holds.**
>
> **Under a delivery record: something changes. That is the defect.** P-70.3 exists so that *"an
> Execution Plane that crashes mid-execution re-fetches by the hash it already holds, without
> re-requesting work and without the IP tracking delivery state."*
>
> **Under an evidence record: nothing changes.** Only a run **completing and returning evidence**
> changes it. A crashed Execution Plane re-asks and is told exactly the same thing, **because
> pending-ness never depended on fetching.**

**And the decisive reading, which settles it in the rule's own words:**

> **R-05.28 FORBIDS THE COLLECTION RECORD IN THE SAME SENTENCE THAT REQUIRES THE EVIDENCE RECORD** —
> *"pending work SHALL be derived from … runs without evidence … **never** from a record of what an
> Execution Plane has collected."* **The evidence record is PRESUPPOSED, not tolerated.**
>
> **P-70.3 and R-05.28 are one rule seen from two sides.** One forbids recording what was *fetched*;
> the other requires deriving from what was *produced*. An evidence record is what R-05.28 needs to
> exist. **It is not what P-70.3 removed.**

The difference, tabulated, is *whose act is recorded and what depends on it*:

| | **Delivery record** — forbidden | **Evidence record** — required |
|---|---|---|
| What it asserts | *"the EP has **received** X"* | *"a run **produced** Y, and Y is here"* |
| Whose act | the IP's own **outbound transfer** | the EP's **run concluding** |
| What it is for | deciding what to send next — **push bookkeeping renamed** | stages 10–12 — **work this plane may not delegate** |
| If it is lost | an EP is re-sent or starved; **recovery breaks** | a run **cannot be certified**; the plane fails its own obligation |
| Retrieval idempotence | **destroyed** | **preserved** |

**P-82.4 — REFERENCES AND HASHES, NEVER PAYLOADS. THIS IS A CONSTRAINT ON THE STORE, NOT A NOTE ABOUT IT.**

> **An evidence record that accreted payloads would be an UNAUTHORISED C1 STORE, and would convert a
> required signal into a sovereignty breach.**

Doc 05 §7's crossing table already rules that evidence **references** and hashes may cross EP→IP and
that **payloads may not**. P-82.2's permission is a permission to record **that evidence exists and
where** — never to hold it. **If any part of this store were C1, [06](../architecture/06-data-sovereignty.md)
prohibits it outright** — C1 in the Intelligence Plane is *"ephemeral — duration of the request, never
persisted"* — so this is a **condition on the store's existence**, not a labelling exercise, exactly
as ADR-0079 P-79.3 is for the package store. **C-06.11 is the gate that holds it.**

**The construction is checkable, and that is why the allow-list is enumerated rather than described**
— see P-82.6.

**P-82.5 — R-20.12's `packageHash` BINDING IS ENFORCED AT INGRESS, AND IT LANDS FIRST.**

`POST /v1/evidence` parses through `EvidenceReferenceSchema` — which **already requires
`packageHash`** — and **refuses** a reference that cannot be bound to a known run.
`EvidenceReferenceHandle` gains the `packageHash` field it currently lacks.

> **THIS IS A PRECONDITION OF P-82.1 AND P-82.2, NOT A FOLLOW-UP TO THEM, AND THE ORDERING IS PART OF
> THE DECISION.** The derivation *"runs without evidence"* is a **join on `packageHash`**. If ingress
> does not bind the hash, arriving evidence is **unattributable**, so **no run ever leaves the
> collection** and `/work` returns **the same work forever** to an Execution Plane that has already
> completed it.
>
> **A PERMANENTLY NON-EMPTY FALSEHOOD — the fail-open port's mirror image one layer down, and equally
> invisible.** The empty-collection lie says *"you have nothing to do"* forever; this one says *"you
> have this to do"* forever. Both are Successes under R-05.5, both are byte-identical to a truthful
> answer, and **neither reddens a gate.**
>
> **Built after the two stores rather than before them, this is two stores and no derivation.**

**P-82.6 — The allow-list is ENUMERATED HERE, and the enumeration IS the ruling.**

Recorded per record, and nothing else:

**tenant slug · run id · `packageHash` · contract version · arrival timestamp · the evidence reference handle.**

Counts and timings **only** where a stage-10 input genuinely requires them, **each named**. **No
payload, no customer identifiers, and no route or element names beyond what the reference already
carries.** Anything not on this list is dropped **on the write path** (R-06.4 condition 3) —
*scrubbing on egress protects the API; scrubbing on write protects the disk.*

**It is a field-level ALLOW-list, never a deny-list**, because a deny-list admits every field nobody
thought of, and the fields nobody thought of are the ones a future producer adds.

**P-82.7 — The full R-06.4 discharge applies, and every part of it lands WITH the store.**

| # | Condition | Discharged as |
|---|---|---|
| **1 — Authorised** | `AUTHORISING_ADR = 'ADR-0082'` **in the storing module's own source** (R-06.5, C-06.3), read by the gate, not written for a human |
| **2 — Minimised** | P-82.6's enumerated allow-list |
| **3 — Scrubbed on write** | On the **write path**, never the response path |
| **4 — Purged** | Declared retention **read by code** (R-06.12, C-06.7) at **`min(tenant C3 retention, 90 days)`**, driving a **scheduled** purge (R-06.13) whose **unreadability is proved by test** (R-06.14, C-06.8), with purge failure **loud and alerting** (R-06.15) |

**The store is obtained through a factory that STARTS its purge driver in the same call** — the
`sealedPackageService` pattern, and for its stated reason: *"a store mounted without its driver would
serve reads while nothing enforced its retention."* The bare constructor remains available to tests,
which need a store without a live timer, **and nothing in a running system reaches for it.**

**Retention is NEVER keyed to delivery state**, on ADR-0079 P-79.4's reasoning, which is what
preserves P-70.3 here as it does there.

**P-82.8 — The document-06 gate takes this store as a SECOND ENUMERATED SUBJECT, landing with it.**

Per §3.2. Every property runs per subject; **an empty subject list fails closed.** Its fault proof is
recorded in the same change, faulting the source of truth and naming the branch that fired
(R-13.7 clause 2, CHARTER §18).

**P-82.9 — THE WRITE SURFACE ENUMERATES THE EVENTS, AND A PERMITTED-CALLER CENSUS ENFORCES THEM. P-82.3 IS NO LONGER A RULE WITH NO MECHANISM.**

**The store exposes exactly two write methods, each named for its cause** — package sealed, evidence
arrived — and **no general `record()`, `write()` or `put()`, and no options bag carrying an event
discriminator.** A `kind: 'fetch'` parameter is a third event wearing a field's clothes, which is the
exact move this proposition exists to stop. **A third event therefore has no method to call**, and
adding one is an API change: visible in the diff, and an amendment to this ADR.

**A gate asserts the PERMITTED CALLER SET for each method — derived from source, compared against a
declared set, tests excluded by declaration.** Not a count.

> **A COUNT WOULD BE THE WRONG ASSERTION, AND CHARTER §17.1(i) IS WHY.** A gate whose passing
> condition is the literal `2` must be **edited** whenever legitimate structure changes, and a gate
> people edit to make green is a gate people edit to make green. **The count is also not the
> property:** two call sites into a general `record()` is worse than five into `onEvidenceArrived`,
> because the first tells you nothing about what caused any of them.

**The brand pattern does not apply here, and is named so nobody reaches for it.** `stages.ts` makes a
stage result unconstructible outside its module with a **module-private symbol** — the strongest
mechanism in this platform. **It does not survive the package boundary:** the store is in
`@dbiz/platform-providers` and both triggering modules are in other packages, so a token they can
mint must be exported, and once exported any module can import the minting function. It would look
like enforcement and be a naming convention.

### 4.2 What P-82.9 does NOT cover — stated, because a residual implied covered is the defect it guards

**A syntactic caller census cannot see an aliased or dynamically-dispatched call.**
`const f = store.onEvidenceArrived; f(ref)` from a fourth module is invisible to it.

**The event-named surface bounds that rather than closing it, and the bound is the argument for
building both:** an aliased call to `onEvidenceArrived` **still asserts that evidence arrived.** To
record a fetch, a caller must invoke a method whose name says evidence arrived **at a point where no
evidence arrived** — a deliberate lie about the event, in a diff, under a method name that
contradicts it. **That is categorically different from adding a field to an allow-list**, which is a
plausible, well-intentioned, one-line change no reviewer would query.

> **P-82.9 does not make P-82.3 unbreakable. It makes breaking it require an act that cannot be
> mistaken for routine.**

**Three residuals remain and are enforced by review alone:**

1. **A caller that lies about the event** — invokes `onEvidenceArrived` where no evidence arrived.
2. **Aliased or dynamically-dispatched calls** — bounded by (1)'s visibility, not removed.
3. **A maintainer widening the declared caller set** to make the gate green. The set is small and its
   entries are **named in this ADR**, so widening it is an ADR amendment rather than a config edit.

### 4.3 What SHALL NOT be done

- **SHALL NOT record what an Execution Plane has fetched, collected or acknowledged** — P-70.3,
  P-79.7, R-05.28, R-20.31. The discriminator in P-82.3 is the test.
- **SHALL NOT hold an evidence payload**, in any field, under any name — P-82.4.
- **SHALL NOT widen the allow-list by implementation** — P-82.6 is the ruling, and a new field is an
  amendment to this ADR.
- **SHALL NOT mount `GET /api/tenants/{slug}/work` behind an unimplemented `PendingWorkSource`** —
  doc 05 v1.3's design law: *a port may be declared and left unimplemented only if its empty case
  fails CLOSED*, and this one fails open.
- **SHALL NOT key retention to delivery state** — P-82.7.
- **SHALL NOT add a second document-06 gate** — §3.2.

## 5. Consequences

**What improves.** Stages 10–12 gain the durable input R-12.5 obliges this plane to hold. R-05.28's
derivation becomes constructible in **both** directions, so ADR-0080 §6 step 3's completion condition
(b) stops being unprovable. Evidence stops being written to stdout. And R-20.12's binding stops being
a schema field nothing consumes — which is D-115's, D-117's and D-122's shared mechanism, closed on
one of its four instances.

**What it costs.** A second durable customer-data store in the DBiz plane, with the full §P-82.7
discharge. An ingress refusal path that did not exist. A change to `EvidenceReferenceHandle`, which is
consumed across the functional-testing engine. And a gate that becomes multi-subject, which is a
change to a gate that currently passes.

**What does not change.** The `ExecutionPackage` contract, `CONTRACT_VERSION`, the compatibility
corpus, ADR-0078's four result classes, ADR-0079's package store and its properties, P-79.2's
addressing, the twelve-stage lifecycle, and the crossing table. **No contract version moves.**

**Risk, and it is one — now PART-MITIGATED rather than merely stated.** The store's legitimacy rests
on P-82.3's discriminator holding at every future change. A field added *"for diagnostics"* that
records when a package was fetched converts this store into the one P-70.3 removed, **without failing
any test**, because a delivery record and an evidence record have the same shape and differ only in
what causes a write.

**P-82.9 is the mechanism that was missing when this paragraph was first written**, and §4.2 names
the three residuals it does not reach. The remaining controls are that the discriminator is stated in
the decision, stated in the module's own source, and is a question a reviewer can answer in one
sentence: *does an EP re-fetch change this?*

> **THE CHAIN OF THIS RISK IS ITSELF INSTRUCTIVE AND IS RECORDED RATHER THAN TIDIED AWAY.** This
> paragraph was authored as a caveat. Read as a **gap**, it produced P-82.9 — and P-82.9's own report
> then found that the obvious enforcement (*"exactly two call sites"*) counts the wrong thing, and
> that the strongest mechanism in this platform (`stages.ts`'s module-private brand) **does not
> survive the package boundary.** **A risk paragraph is a proposition that has not been written
> yet**, and the difference between the two readings was one question: *is anything actually stopping
> this?*

### 5.1 This is the plane's second customer-data store, and the count is now load-bearing

ADR-0079 §2.4 recorded that *"document 06 has never had a subject in this plane."* It now has two.
**The obligations stop being per-store artefacts and become an enumeration**, which is why §3.2
refuses a sibling gate. **A third store must join the same list**, and the list is the answer to the
question document 06 asks.

### 5.2 What this ADR does NOT unblock, stated so no reader infers it

**`GET /api/tenants/{slug}/work` is not mounted by this ADR**, and ADR-0080 §6 steps 3–5 are not
performed by it. It makes them **constructible**; performing them is their own authorised work.

**And the Execution Plane still cannot boot** — `config/connectivity.json` carries four IP-owned
`<FILL:>` markers and the boot guard refuses start on any unresolved marker (debt D-125's note). That
is a different blocker, on a different axis, and nothing here touches it.

## 6. Migration strategy

**Post-acceptance, each step separately authorised; none performed here. The order is part of the decision.**

1. **P-82.5 FIRST — the binding, before either store exists.** `EvidenceReferenceHandle` gains
   `packageHash`; `POST /v1/evidence` parses through `EvidenceReferenceSchema` and refuses an
   unbindable reference. **Completion condition:** an executing test showing an evidence reference
   **without** a resolvable `packageHash` **refused**, not stored. *Built after the stores, this is
   two stores and no derivation.*
2. **The run record** (P-82.1) with its allow-list, its write-path scrubbing, its declared retention
   read by code, and its purge driver obtained through the starting factory. **Its write surface is
   event-named from the first commit (P-82.9)** — retrofitting an event name onto a general
   `record()` is a refactor nobody will schedule.
3. **The evidence record** (P-82.2, P-82.4) on the same terms, replacing the stdout line.
   **Completion condition:** the **permitted-caller gate** (P-82.9) with its fault proof — add a call
   from a third module, observe RED naming that module and that method, remove it, observe green.
4. **The document-06 gate becomes multi-subject** (P-82.8), with both stores enumerated and its fault
   proof recorded in the same change. **Completion conditions:** the unreadability test after purge
   for **each** subject, and a run showing the gate RED when the subject list is empty.
5. **Then, and only then, ADR-0080 §6 step 3** — with condition (b) proved in **both** directions: *a
   run gains evidence and leaves the collection*, and *a run without evidence survives repeated polls
   unchanged*.
6. **Then §6 steps 4 and 5** — `workPath` into the registration grant, and the route mounted.

**`GET /api/tenants/{slug}/work` SHALL NOT be mounted, and ADR-0080 §6 steps 3–5 SHALL NOT be
performed, until this ADR is accepted** — the [ADR-0078](ADR-0078-package-retrieval-recorded-in-architecture.md)
P-78.6 precedent, which gated ADR-0070 §6 step 2 on **deciding** the package store rather than
building it in passing, and which D-115 records ADR-0080 as having not followed.

**Run the full workspace suite, not the package suite**, after steps 2 and 3, and let failures name
what `tsc` cannot see.

## 7. Version impact

- **No contract change.** `CONTRACT_VERSION` unchanged; the compatibility corpus is untouched.
  `EvidenceReferenceSchema` is **already** as this ADR requires — it declares `packageHash` today.
  What changes is an internal handle type, which is not a contract.
- **[06 — Data Sovereignty](../architecture/06-data-sovereignty.md)** takes a **version increment**
  on execution: it gains a second governed store and the enumeration §3.2 requires.
- **[05 — Cross-Plane Communication](../architecture/05-cross-plane-communication.md)** is
  **unchanged.** R-05.26–R-05.28 already say everything this ADR relies on; the design law beside
  R-05.27 is already recorded at v1.3.
- **ADR-0079 is enforced, not superseded.** Its retention shape, its factory pattern and its
  fail-closed posture are reused deliberately rather than re-derived.
- **Gate count +0.** The document-06 gate gains a subject; it is not duplicated (§3.2).
- **Closure baseline:** adding this ADR turns `verify-programme-closure`'s *"no ADR has been added
  since closure"* leg **RED, deliberately and on exactly one leg** — recorded in
  [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md) **before this file was written**. It clears by
  a reviewed re-baseline **on acceptance**.

## 8. Affected components

- [`ADR-0082-run-and-evidence-record.md`](ADR-0082-run-and-evidence-record.md) — **New** (this ADR).
- [`06-data-sovereignty.md`](../architecture/06-data-sovereignty.md) — **Amended** on execution (§7: a second governed store, and the enumeration).
- [`ADR-0080-work-request-exchange.md`](ADR-0080-work-request-exchange.md) — **Unblocked, not amended.** §6 steps 3–5 become constructible; ADR-0080 is ACCEPTED and FROZEN and is not written back into.
- `packages/contracts/src/evidence.ts` — **Unchanged, and named because it is the reason P-82.5 is cheap**: `EvidenceReferenceSchema` already requires `packageHash`.
- `packages/functional-testing-engine/src/domains/execution.ts` — **Amended** (P-82.5: `EvidenceReferenceHandle` gains `packageHash`).
- `packages/tenant-onboarding-engine/ip-execute-gateway.mjs` — **Amended** (P-82.5: `POST /v1/evidence` parses and refuses; P-82.2: the stdout line is replaced). **Note its retirement is ADR-0049 M5** — this is the interim serving path, not a new investment in it.
- `packages/platform-providers/src/storage/sealed-package-purge.ts` — **Amended** (P-82.7: the starting-factory pattern is reused for the new store's driver).
- `packages/platform-providers/src/index.ts` — **Amended** (the new store and its service factory are exported).
- `packages/tenant-onboarding-engine/src/server/platform-adoption.ts` — **Amended** (P-82.7: the store is mounted through its starting factory, as `sealedPackageService` already is).
- `governance/verification/verify-data-sovereignty-store.js` — **Amended** (P-82.8: one subject becomes an enumerated list; an empty list fails closed).
- `governance/verification/verify-composition-root.js` — **Named as the pattern P-82.9's caller census follows** (a derived set compared against a declared one, with no third state), not amended by this ADR.
- `governance/verification/record-fault-proofs.js` — **Amended** (P-82.8: the gate's proof, in the same change).
- [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md), [`TECHNICAL_DEBT.md`](../../program/TECHNICAL_DEBT.md), [`DECISIONS.md`](../../program/DECISIONS.md), [`NEXT_ACTION.md`](../../program/NEXT_ACTION.md) — **Amended** (the knowing red, D-115's ruling, the ADR index row, the next action).

**No frozen architecture document, no contract, no gate and no source file is modified BY THIS ADR.**
Every amendment above is a consequence of §6 and is performed on execution, each step separately
authorised.

---

> **STOP FOR ACCEPTANCE.** R-18.26 gates implementation on this ADR being accepted, with an impact
> analysis, a migration strategy and a governance review, **before implementation**. §5 is the impact
> analysis and §6 is the migration strategy.
>
> **Until acceptance: `GET /api/tenants/{slug}/work` stays unmounted, ADR-0080 §6 steps 3–5 stay
> unperformed, nothing is written to any new store, and no re-baseline is taken.**
