# D-115 — What record of runs and received evidence does the Intelligence Plane keep?

**Status:** **REPORT FOR RULING — NOTHING IS BUILT BY THIS DOCUMENT** · **Date:** 2026-08-06
**Raised by:** `TECHNICAL_DEBT.md` **D-115** · **Blocks:** ADR-0080 §6 steps 3, 4 and 5
**Governed by:** [06 — Data Sovereignty](../docs/architecture/06-data-sovereignty.md) · [05 §R-05.26–R-05.28](../docs/architecture/05-cross-plane-communication.md) · [12 §R-12.5](../docs/architecture/12-capability-orchestration.md) · [ADR-0079](../docs/adr/ADR-0079-retrievable-package-store.md) · [ADR-0080](../docs/adr/ADR-0080-work-request-exchange.md)

---

## 0. What this report is, and what it deliberately does not do

**It reports. It does not build, and it does not amend ADR-0080.** ADR-0080 is ACCEPTED and FROZEN;
D-115 is recorded against it and is never written back into it.

**`GET /api/tenants/{slug}/work` REMAINS UNMOUNTED**, and **ADR-0080 §6 step 4 does not run** — step 4
puts `workPath` into the registration grant, which would point a freshly-registered Execution Plane
at a route that does not exist. Steps 3, 4 and 5 stay unperformed until the ruling below is made.

**No `PendingWorkSource` port is built.** §6 records why, and the law that generalises it.

**This is a sovereignty decision before it is an engineering one**, which is why it is reported for
ruling rather than folded into *"build the exchange."* Folding it in is the scope error D-087 counts
and which D-108, D-109 and ADR-0080 §5.2 have each already refused on this same axis.

---

## 1. The question

> **What record of runs and received evidence does the Intelligence Plane keep?**

It is forced by **R-05.28**, which rules that pending work is derived from **runs without evidence**
(R-20.12) and never from a record of what an Execution Plane has collected. That derivation names
two operands. **This plane holds neither.**

---

## 2. What is on disk today — measured across all fifteen packages

| Operand | State | Evidence |
|---|---|---|
| **Runs** | **Not persisted anywhere.** The only durable per-tenant store is `tenant-repository.ts` — tenant envelopes, lifecycle, EP-token metadata, capability update events — and it holds **no runs**. Five engines keep `Map<runId, RunOutcome>` accumulators that are **process-lifetime, lost on restart, not tenant-indexed** | `reasoning-result-registry.ts:31-36` says of itself: *"It is NOT a persistence database. It lives for one execution and is discarded with it."* |
| **Runs, second angle** | The sealed package store's layout **has a `run` segment and hard-codes it to the constant `'sealed'`** | `sealed-package-store.ts:85-86`, whose own header admits the value *"is neither a capability nor a run"* |
| **Evidence** | **Not persisted anywhere.** `POST /v1/evidence` shape-checks a reference, **writes one JSON line to stdout**, returns `202`. `evidence-return-channel.ts` is a pure function that retains nothing | `ip-execute-gateway.mjs:585-611` |
| **The binding between them** | **Schema-only.** `EvidenceReferenceSchema.packageHash` (R-20.12, C-20.10) is imported by `contracts/test/*`, `compat/harness.mjs` and `emit-schema.ts` and by **no engine, gateway or store**. The type the engine actually uses, `EvidenceReferenceHandle`, has **no `packageHash` field at all** | `contracts/src/evidence.ts:44-58`, `functional-testing-engine/src/domains/execution.ts:38` |

**Neither half of §6 step 3's completion condition (b) is constructible against this.** *A run gains
evidence and leaves the collection* requires both operands and the join. *A run without evidence
survives repeated polls unchanged* requires the first.

---

## 3. Sovereignty first — what this record IS, before what it does

A per-tenant record of runs and received evidence is **customer-derived C3 data persisted in the
DBiz plane** ([06](../docs/architecture/06-data-sovereignty.md) §1 — *structure, route names,
element identifiers, timings, counts*). It is the plane's **second** such store, after the sealed
package store, and it inherits **every** obligation ADR-0079 had to discharge for the first:

| # | R-06.4 condition | What discharging it means here |
|---|---|---|
| **1 — Authorised** | A named ADR permits this specific use, **and the identifier is recorded in the storing module's own source** (R-06.5, C-06.3) — as `AUTHORISING_ADR = 'ADR-0079'` is in `sealed-package-store.ts:70` |
| **2 — Minimised** | A **field-level allow-list**, not a deny-list. §5 Q2 enumerates the fields, and the enumeration is the ruling — not an implementation choice |
| **3 — Scrubbed on write** | On the **write path**, never the response path. *"Scrubbing on egress protects the API; scrubbing on write protects the disk"* |
| **4 — Purged** | A **declared retention read by code** (R-06.12, C-06.7) driving a **scheduled purge** whose **unreadability is proved by test** (C-06.8) — and, per ADR-0079 P-79.9, obtained through a factory that starts the purge driver in the same call, so no path serves reads from a store whose retention nothing enforces (R-06.13) |

Plus **a document-06 gate with this store as its own subject**, landing *with* the store and not as a
follow-up (ADR-0079 P-79.9).

**Retention ceiling.** C3 in the Intelligence Plane is **tenant-configured, maximum 90 days**
([06](../docs/architecture/06-data-sovereignty.md) §4). ADR-0079 P-79.4 set the package store's
retention at `min(validity.notAfter, tenant C3 retention ≤ 90 days)` and **never keyed to delivery
state**; the same shape applies here.

> **A false conflict, pre-empted because a reader will hit it.** The tenant record carries
> `dbiz.retentionObligationDays: 365`. **That is not a C3-in-IP retention and does not contradict the
> 90-day ceiling.** It is consumed at `solution-export.ts:513` as `retentionDays` in the **generated
> Execution Plane solution** — the customer's own retention obligation over data residing in the
> **customer's tenancy**, where R-06.6 says it belongs and no DBiz-side ceiling applies. Two
> different sides of the boundary, two different numbers, both correct.

---

## 4. THE CRUX — does an evidence record legitimately cross back?

**Yes. Under R-12.5 it does, and the ruling should say so explicitly**, because the next reader will
open this and see delivery tracking.

### 4.1 Why it is required, not merely permitted

**R-12.5** ([12](../docs/architecture/12-capability-orchestration.md)): *"Stages 10, 11 and 12 SHALL
NOT be performed by the Execution Plane under any circumstance."* Those stages are **Reflection,
Certification and Reporting**, and they are the **Intelligence Plane's** — the pipeline is
`EvidenceSet → ReflectionResult → Certification → Report`. Doc 12 states the cost of their absence
in its own words: *"Certification — no verdict — the platform's entire output."*

**The plane cannot discharge an obligation it is constitutionally forbidden to delegate without
receiving, and holding, the evidence that is its input.** An evidence record is therefore not
bookkeeping about a transfer. **It is the plane's own mandated work having an input.**

### 4.2 Why it is NOT the P-70.3 violation it resembles

It resembles one because both are per-tenant records of things that crossed the boundary, and both
grow over time. **The difference is which side's act is recorded, and what depends on it.**

| | **Delivery record** — what P-70.3 forbids | **Evidence record** — what R-12.5 requires |
|---|---|---|
| **What it asserts** | *"the Execution Plane has **received** X"* | *"a run **produced** Y, and Y is here"* |
| **Whose act** | the **Intelligence Plane's own outbound** transfer | the **Execution Plane's run concluding** |
| **What it is for** | deciding what to send next — **push bookkeeping under another name** | performing stages 10–12 — **work this plane may not delegate** |
| **If it is lost** | an EP is re-sent or starved; **recovery breaks** | a run **cannot be certified**; the plane fails its own obligation |
| **Direction of dependence** | *what is pending* depends on **what was fetched** | *what is pending* depends on **what was produced** |
| **Idempotence of retrieval** | **destroyed** — re-fetching changes plane state | **preserved** — re-fetching changes nothing |

### 4.3 The discriminator, stated so it can be checked rather than argued

> **Ask what changes when an Execution Plane re-fetches a package it already holds.**
>
> **Under a delivery record: something changes.** That is the defect — P-70.3 exists so that *"an
> Execution Plane that crashes mid-execution re-fetches by the hash it already holds, without
> re-requesting work and without the IP tracking delivery state."*
>
> **Under an evidence record: nothing changes.** Only a run **completing and returning evidence**
> changes it. A crashed EP re-asks and is told exactly the same thing, because pending-ness never
> depended on fetching.

**P-70.3 and R-05.28 are one rule seen from two sides.** R-05.28 does not merely tolerate an evidence
record — it **presupposes one**: *"pending work SHALL be derived from … runs without evidence …
never from a record of what an Execution Plane has collected."* The clause forbids the collection
record **in the same sentence that requires the evidence record.** An evidence record is what
R-05.28 needs to exist. It is not what P-70.3 removed.

### 4.4 One boundary the ruling must hold, or 4.1 stops being true

**The record holds evidence REFERENCES, never evidence payloads.** Doc 05 §7's crossing table already
rules that evidence **references** and hashes may cross EP→IP and **evidence payloads may not**. An
evidence *record* that accreted payloads would be a C1 store nobody authorised, and would convert a
required signal into a sovereignty breach. **The permission in 4.1 is a permission to record that
evidence exists and where — not to hold it.**

---

## 5. The three things the ruling must settle

Each is stated with the options, what each costs, and a recommendation. **None is a wire-shape
detail.**

### Q1 — Is *"a run exists"* recorded at authoring time by this plane, or inferred from the sealed package store?

| Option | Consequence |
|---|---|
| **A — Infer from the store** | **Not available.** The store can enumerate hashes per tenant but **cannot say which represent outstanding work**: it holds no run, and holds **deliberately no delivery state**. Its `run` segment is the constant `'sealed'`. Inferring would mean either *every package ever authored is outstanding forever*, or adding delivery state to the store — **which is the P-70.3 violation directly** |
| **B — Record at authoring time** ⟵ **RECOMMENDED** | **Stage 7 emits exactly one sealed execution package (R-12.3).** That is the moment a run demonstrably exists, and a moment this plane is already writing. The record is authored by the IP **about its own act**, from the package it just sealed — it needs no new customer data, and no new crossing |

**Cost of B, stated rather than discovered later:** it is a **new durable per-tenant store**, so §3's
full discharge applies to it — authorising ADR in source, allow-list, write-path scrubbing, declared
retention read by code, purge driver, unreadability proof, and the document-06 gate with this store
as its subject.

### Q2 — Is received evidence recorded at all?

| Option | Consequence |
|---|---|
| **A — Keep stdout** | Stages 10–12 have **no durable input**, so R-12.5's obligation is unmeetable across a process restart, and R-05.28's derivation has **no second operand**. The work-request exchange stays unbuildable permanently |
| **B — Record it** ⟵ **RECOMMENDED**, on §4 | The one signal that legitimately crosses back. `POST /v1/evidence` gains a store behind it instead of a `console` line |

**The allow-list, which is the ruling and not an implementation choice.** Proposed enumerated fields:
**tenant slug · run id · `packageHash` · contract version · arrival timestamp · the evidence
reference handle.** Counts and timings only where a stage-10 input genuinely requires them, each
named. **No payload, no customer identifiers, no route or element names beyond what the reference
already carries.** Anything not on this list is dropped **on the write path** (R-06.4 condition 3).

### Q3 — Is R-20.12's `packageHash` binding ENFORCED, or left declared?

| Option | Consequence |
|---|---|
| **A — Leave declared** | **Rejected, and the reason is the same law as §6.** The derivation *"runs without evidence"* is a **join on `packageHash`**. If ingress does not parse evidence through `EvidenceReferenceSchema` and bind the hash, arriving evidence is **unattributable** — so no run ever leaves the collection, and `/work` returns **the same work forever** to an EP that has already completed it. The mirror image of the empty-collection lie, one layer down: **a permanently non-empty falsehood instead of a permanently empty one**, and equally invisible |
| **B — Enforce at ingress** ⟵ **RECOMMENDED** | `POST /v1/evidence` parses through the schema and **refuses** a reference that cannot be bound to a known run. `EvidenceReferenceHandle` gains the `packageHash` field it currently lacks |

**This is a precondition of Q1 and Q2, not a follow-up to them.** A run record and an evidence record
that cannot be joined are two stores and no derivation.

---

## 6. What is NOT built, and the law it establishes

**No `PendingWorkSource` port is injected.** The route, the collection shape, the inherited
authorisation and the records-nothing-on-read property are all buildable and provable **today**; only
the derivation is not. Shipping the rest behind an unimplemented port would mount an endpoint that
**returns an empty collection to every Execution Plane, forever** — and under **R-05.27 an empty
collection is a Success**, a positive assertion that no work is pending. **No test fails and no gate
reddens, because nothing is broken: the shape does exactly what it was declared to do.** An absent
route is a Refusal the caller can see; an unimplemented fail-open port is a lie it cannot.

**Recorded as a design law beside R-05.27** ([05](../docs/architecture/05-cross-plane-communication.md)
v1.3):

> **A port MAY be declared and left unimplemented ONLY IF its unimplemented answer fails CLOSED.
> Where that answer is a Success, the port SHALL NOT be mounted until it is implemented.**

**The pattern is the same and the safety is opposite.** The unwired authenticator answers `501`
(`auth-refusal.ts`) and the unconfigured package store answers `501` (`package-retrieval.ts`) —
**both safe for one reason only: their empty case fails closed, so the absence is visible in the
response.** The identical construction over a Success-valued empty case is not deferral but
fabrication. **The test, applied before reaching for the pattern:** *what does this port return when
nothing is behind it, and what result class is that value under R-05.5?*

---

## 7. What the ruling unblocks

| Ruled | Then |
|---|---|
| Q1 = B, Q2 = B, Q3 = B | A **run-and-evidence record ADR** is authored — one ADR, because the store, its retention, its purge, its gate and the `packageHash` enforcement are one decision. ADR-0080 §6 step 3 becomes constructible, condition (b) provable in both directions |
| Q1 = B, Q2 = A | **Stop.** R-05.28 has no second operand and R-12.5 is unmeetable; `/work` cannot be built at all, and that should be recorded as such rather than worked around |
| Any option deferred | `/work` stays unmounted, steps 3–5 stay unperformed, D-115 stays OPEN |

**Sequencing note.** The record ADR is authored **before** any part of `/work` is built, on the
ADR-0078 P-78.6 precedent — which gated ADR-0070 §6 step 2 on **deciding** the package store rather
than building it in passing, and is the precedent D-115 records ADR-0080 as having not followed.

---

## 8. Measured

- The four operand claims in §2 re-verified on disk at this commit; sources cited inline.
- `retentionObligationDays` traced to its single consumer (`solution-export.ts:513`) before §3's
  false-conflict note was written; the note states what was measured, not what was assumed.
- R-12.5 disambiguated: **[12](../docs/architecture/12-capability-orchestration.md) §R-12.5**
  (stages 10–12), **not** [01](../docs/architecture/01-platform-constitution.md) §R-12.5, which is
  the AI-vendor-naming rule and shares the identifier.
- **Nothing in `packages/` was modified.** This report, the design law in doc 05, and D-116 are the
  whole of the change that carries it.
