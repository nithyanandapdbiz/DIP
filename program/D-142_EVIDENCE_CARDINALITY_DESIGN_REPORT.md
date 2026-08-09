# D-142 — Evidence cardinality per run: design report

**Status: FOR RULING. Nothing here is implemented.** Three questions, options with costs, no decision
taken. ADR-0082 amendment.

**Measured 2026-08-06** against `2eeafb9` … `cc7b063`. Shell: Git Bash, `MINGW64_NT-10.0-26200`,
`openssl /mingw64/bin/openssl` (CHARTER §17.1.4).

---

## 0. The consequence is already live, and it reddens nothing

`RunRecordStore.onEvidenceArrived` is idempotent on `runId` and **first write wins**. A second
arrival returns the stored record unchanged.

- The Execution Plane is told **`202 accepted`** for every reference it sends, whether stored or dropped.
- `alreadyRecorded: true` is returned for a **retry** and for a **genuinely different second
  reference**. The store cannot tell them apart and neither can the caller.
- **Nothing downstream can distinguish a one-reference run from a truncated one.** There is no field
  that could indicate a drop.
- **The subtraction is unaffected** — `/work` needs only *has any evidence* — so **no gate reddens and
  no test fails.** The measured property is satisfied by the first reference; the ones after it are
  lost against a green suite.

> **This is why the report precedes any claim that the loop is closed.** The loop is closed. It leaks.

**Stages 10–12 are the consumer that would otherwise find it**, holding one artefact where six were
captured, with no way to know a seventh was never offered.

---

## 1. Cardinality — measured, not guessed

**There is no honest small upper bound, and there is no fixed one.** Three independent multipliers,
each read from source:

| Multiplier | Measured | Where |
|---|---|---|
| **Artefact kinds** | **6** — `screenshot · video · har · trace · log · console` | [`model.ts:729`](../packages/functional-testing-engine/src/model.ts) |
| **Per-step capture** | `capturedAtStep: number \| null` — **evidence is per-step by contract** | `model.ts` `EvidenceReference` |
| **Per-component aggregation** | `evidenceReferences: executedComponents.flatMap((c) => c.evidenceReferences)` — the run's set is the **concatenation across components** | [`execution.ts:326`](../packages/functional-testing-engine/src/domains/execution.ts) |

So the shape is **kinds × steps × components**, and only the first factor is bounded.

**Today the reference implementation emits exactly one handle per component** (`execution.ts:297`),
which is why nothing has failed yet: the current emitter is at the bottom of a range whose top is
open. **The value is `1` by accident of the reference runtime, not by design**, and `flatMap` is
already the aggregation — the code is written for many and the store keeps one.

> **A REALISTIC RUN.** 20 components × 1 trace + 1 video + 1 har for the run + 1 screenshot per failed
> step. **Order 10²**, and a large suite is order 10³. **A bound stated as a number will be wrong**;
> what can be bounded is a *rate* or a *total size*, which is a different control.

**AND THE STORE CANNOT SEE `kind` AT ALL.** `EvidenceReferenceSchema` — the wire artefact ingress
parses — carries `contractVersion · evidenceId · packageHash · contentHash · classification ·
capturedAt · expiresAt · assuranceState · outcome`. **There is no `kind` field and no
`capturedAtStep`.** `kind` exists on the engine's *internal* `EvidenceReferenceHandle`, which never
crosses the boundary.

**Consequence for the options below: "at most one per kind" is NOT implementable at the current
contract.** It is a contract change (`EvidenceReferenceSchema` gains `kind`), and therefore a
`CONTRACT_VERSION` question, not a store question.

---

## 2. Refuse or accumulate

Opposite answers. The store cannot infer between them, and **each makes a different thing impossible.**

### Option A — REFUSE a second distinct reference

A second reference with a different `evidenceId` is refused; the EP learns it was.

| | |
|---|---|
| **Buys** | **The loss stops being silent.** This is the entire benefit, and it is real: a `409`-shaped refusal naming the stored `evidenceId` makes truncation a fact the EP can act on and an operator can see. |
| **Costs** | **It makes a normal run fail.** §1 measures the ordinary shape of a completed run as *many* references. Refusal converts today's silent truncation into a loud failure on **every realistic run** — the platform would go from losing evidence quietly to rejecting evidence loudly, and the EP has nowhere to put what it captured. |
| | **It cannot be distinguished from a retry without more work.** A retry after a lost `202` re-sends the **same** `evidenceId`; that must stay idempotent. So refusal is only safe once idempotency moves from `runId` to `evidenceId` — which is most of Option B's mechanism anyway. |
| **Reversibility** | High. Refusals are not written, so nothing accumulates that a later ruling must migrate. |

### Option B — ACCUMULATE

Each distinct `evidenceId` is recorded; a repeat of a known `evidenceId` is a no-op.

| | |
|---|---|
| **Buys** | Evidence is not lost. Stages 10–12 get what was captured. It matches what the emitter already produces (`flatMap`). |
| **Costs** | **The record grows per run, and P-82.4's boundary is one shape along.** The rule is *references and hashes, never payloads*; an accreting record is an **unauthorised C1 store the moment it carries anything more.** The allow-list is enforced by construction today, so the boundary holds by shape — but the *pressure* to add a field ("just the step name", "just the failure text") rises with the record's usefulness. |
| | **Unbounded growth is a sovereignty question, not a performance one.** A C3 store whose per-run size is caller-controlled has no stated ceiling, and R-06.9's retention is a *time* bound, not a *size* bound. |
| | **`outstandingRuns()` is O(runs); evidence reads become O(references).** Real but secondary, and measurable before it matters. |
| **Reversibility** | Lower. Records written under B must be migrated or aged out if a later ruling bounds them. |

### Which failure the platform would rather have — a reasoned position, not a ruling

**Accumulation, bounded, with the bound as a refusal.**

The programme has ruled this shape twice already, and both precedents point the same way:

1. **A control that fails toward the discoverable failure** — `sealed-package-writer`'s ordering
   (P-81.1's reasoning): between two partial states, choose the one that **announces itself**. Silent
   truncation is the *undiscoverable* failure; that is what makes today's behaviour the worst of the
   three, and it is what neither A nor B leaves in place.
2. **A refusal is preferable to a silent success — but only where refusing is not the normal path.**
   Every refusal this platform added (unbindable evidence, cross-tenant write, unsigned package) fires
   on a **defect**. Option A alone fires on a **correct run**, and a control that refuses correct
   behaviour is one operators route around.

So: **A's loudness is right and its trigger is wrong.** Applying refusal at a *bound* rather than at
*the second reference* keeps the loudness for the case that is genuinely anomalous — a run producing
far more evidence than any run should — while letting an ordinary run succeed.

> **The failure the platform would rather have: a run that is REFUSED for exceeding a stated evidence
> bound, over a run that silently keeps one artefact of six.** A refusal is a fact someone can act on;
> a truncation is a fact nobody can see. **What must not be chosen is today's behaviour**, which is
> the silent one — and it is the status quo, so a deferral is a decision for it.

**This is a recommendation, not a ruling.** It is also the option with the lowest reversibility, which
is the strongest argument for the ruling being taken deliberately rather than inherited from this
report.

---

## 3. If it accumulates — retention per run or per reference

**Both are defensible and the store currently implements neither correctly.**

**Measured gap, and it is new:** `EvidenceReferenceSchema` **already carries `expiresAt`** — *"retention
is declared per record so expiry is a fact, not an inference"* — and **the evidence record drops it.**
`EvidenceReferenceRecord` keeps `evidenceId · contentHashRef · classification · capturedAt ·
assuranceState · outcome`. The reference's own declared expiry is not stored, so **whichever option is
ruled, a field that exists on the wire is currently discarded.**

Compare the sealed package store, which takes **`min(contractual notAfter, sovereign ceiling)`**
(P-79.4) — the contractual bound is *honoured*, not ignored.

| | **Per-run expiry** | **Per-reference expiry** |
|---|---|---|
| **Rule** | All evidence expires with the run record | Each reference expires on its own clock |
| **Failure** | **A late reference inherits an expiry set before it arrived** — evidence captured on day 89 is purged on day 90, having been held for one day | **A run can outlive its own evidence** — `/work` correctly shows the run as *not outstanding*, and stages 10–12 find the run with nothing attached |
| **Sovereignty** | One retention per run: simple to state, simple to prove unreadable | Correct per-artefact minimisation; matches how the EP declares its own retention |
| **Joins** | Never dangling | **Dangling by design** — the orphan sweep already exists and would run routinely rather than exceptionally |

**A third shape exists and is not obviously worse:** `min(reference.expiresAt, run.recordedAtMs + C3
ceiling)` per reference — the sealed package store's rule, reused. It honours the contractual expiry,
never exceeds the sovereign ceiling, and makes the late-arrival case correct without letting a
reference outlive the ceiling. **Its cost is that dangling-evidence handling becomes routine**, which
must be stated rather than discovered.

---

## 4. The constraint that survives every option — P-82.3

> **Two identical polls leave the plane byte-identical. The same reference arriving twice must not
> become two references.**

Under **A** this is preserved only if idempotency moves from `runId` to `evidenceId` — otherwise a
retry after a lost `202` is refused as a "second reference", which converts a network fault into an
evidence loss.

Under **B** the idempotency key **must** be `evidenceId` (`Identifier` on the wire, present today).
A record keyed on arrival order, or a list appended without a key, **grows on re-delivery** — which is
P-82.3 broken through the evidence door rather than the fetch door, and it would not fail a single
existing test.

**A test must exist that re-delivers one reference N times and asserts the stored bytes are unchanged**
— the exact shape of the `/work` byte-identity test, applied to ingress. **Neither option is safe
without it.**

---

## 5. What this report does not decide

- The bound's **value** (§1: a number will be wrong; a rate or size may not be).
- Whether `EvidenceReferenceSchema` gains `kind` — a `CONTRACT_VERSION` question, and the precondition
  for any per-kind rule.
- Whether the dropped `expiresAt` is a **defect to fix now** or falls out of §3's ruling.

**Owed with the ruling:** the P-82.6 allow-list is amended (it enumerates the handle *singular*), and
the document-06 gate's run-record subject gains whatever per-reference retention property is chosen —
the enumeration exists, so this is a subject's property list, not a new gate.
