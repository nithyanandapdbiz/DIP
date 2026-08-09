# D-145 — The update receiver's delivery deadlock: design report

> ## RULED 2026-08-06 — **OPTION B, OUT OF BAND, AFTER THE DEPLOYMENT IS CURRENT.**
>
> **The ruling turns on the measured correction in §0, not on a preference between mechanisms.**
> `applySolutionUpdate` never installs, so the broken receiver consumes only the **announcement**; a
> well-formed signed update is handled correctly by it; and the exposure is exactly *"a malformed
> announcement is lost un-retryably"*. **B removes the announcement leg, not the mechanism.**
>
> **B IS AUTHORISED, AND THE AUTHORISATION IS NOT AN EXCEPTION.** ADR-0035's install leg is **already
> out of band by construction** — operator-approved, because the IP never auto-installs code the EP
> cannot verify (INV-3, ADR-0007). **A is blocked on `501` regardless** (`api.ts:433`; custody is
> **AD-016**, open).
>
> ### B'S COST IS RECORDED AS A COST, AND B SHALL NOT BECOME A MECHANISM
>
> **Per-tenancy · manual · no record of who received it — P-70.3's delivery state reintroduced as a
> spreadsheet.** That is accepted for THIS repair and is not a pattern. Anything that would turn B
> into standing practice — a persistent recipients list, a "delivered" flag on the tenant record, a
> second register of what tenancies hold — is **[`D-146`](TECHNICAL_DEBT.md)'s cheap answer and is
> forbidden**: a register of what we SENT is legitimate; a register of what they HOLD is a fabrication.
>
> ### C STAYS CLOSED, WITH ITS MEASUREMENT
>
> Four literal path constants, **none executable, none under `bin/`, none derived from event data** —
> and **a new event type is not ignored by an old receiver, it is CONSUMED by it**, at the catch-all
> that silently acks. §1 is the evidence. Recorded as closed by measurement so no later reader spends
> effort looking for a shape that does not exist.
>
> ### ORDER, AND IT IS FORCED
>
> **After the deployment is current** ([`D-144`](TECHNICAL_DEBT.md)). Nothing is announced or handed to
> a tenancy while the serving instance predates the fix.
>
> ### WHAT THE RULING DOES NOT CLOSE
>
> **[`D-146`](TECHNICAL_DEBT.md)** — *"which tenancies hold the corrected receiver?"* — is **open under
> B and would have been open under A.** Filed separately so the ruling is not misread as settling it.

**Status: RULED (§ above). The body below is the report as written for the ruling, unedited.**
Options with costs, no decision taken **in the body** — the decision is the block above.

**Measured 2026-08-06** from this plane, against `c4b6874` (local) and `42d30a3` (`origin/main`,
which is what the deployment builds). Shell: Git Bash, `MINGW64_NT-10.0-26200`,
`openssl /mingw64/bin/openssl` (CHARTER §17.1.4). Raised by the Execution Plane's measurement.

---

## 0. The statement of the deadlock, and the one correction measurement makes to it

**As put to this plane:** the corrected `bin/ep-update-agent.mjs` can only reach a tenant as an
ADR-0035 `solution-update`, which arrives on the queue the defect governs — so the fix must be
delivered by the receiver that is broken, and if it arrives malformed the broken receiver refuses it,
acks the refusal, and the fix is consumed, reported applied, and gone from both planes.

**The deadlock is real. One clause is measurably narrower, and it changes the option set, so it is
stated before the options rather than inside one of them.**

> **`applySolutionUpdate` NEVER INSTALLS ANYTHING. It writes a marker.** The deployed receiver's
> whole effect on a `solution-update` is `.update-available.json` plus two log lines; the marker's own
> `install` field says *"operator-approved: download packageRef → recompute hash → verify ed25519
> signature → backup → install → health-check → rollback on failure → POST /installed"*.

**So what the broken receiver can consume is the ANNOUNCEMENT, not the artefact.** The corrected agent
does not travel on the queue under any option below — it travels as a package the operator installs.
That does not dissolve the deadlock, it relocates it: **what is silently lost is the operator's only
notification that a fix exists**, and an operator who is never told does not install.

**And the loss is conditional, which bounds it.** The deployed receiver handles a **well-formed**
signed `solution-update` correctly — marker written, ack sent, ack deserved. The refusal path fires
only when `signature` or `contentHash` is missing. **The exposure is therefore precisely: a malformed
announcement is lost silently and un-retryably.** A correct one gets through the broken receiver.

### 0.1 The measured blast radius — this is not `carlisle-homes`' problem

`EP_UPDATE_AGENT` is a **generator constant**. Every package this plane has ever produced carries the
same receiver, so **every existing tenant has the broken one**, and the corrected one exists only in
packages generated after `c4b6874`. **A tenancy that never regenerates never gets it by any path
below except an install.**

---

## 1. What the deployed receiver can be made to do — measured, because option 3 depends on it

The deployed receiver (`origin/main`) writes to exactly four paths, and this is the complete list:

| Event shape | Path written | Executable? |
|---|---|---|
| `u.config.application` present | `config/application.json` | no |
| `u.integration` present | `config/integrations.json` | no |
| `u.capability` present | `config/capabilities.json` | no |
| `type: solution-update`, well-formed | `.update-available.json` | no |

> **NO EVENT THE DEPLOYED RECEIVER UNDERSTANDS CAN WRITE AN EXECUTABLE FILE, AND NONE WRITES UNDER
> `bin/` AT ALL.** The restriction is structural — four literal path constants, no path derived from
> event data — not incidental.

**And a NEW event type cannot be introduced to it either.** An unrecognised type falls to
`if (!u.capability) return;`, returns, **and is then acked** — the second of the three defects this
session repaired. A new type is therefore not merely ignored by an old receiver; **it is consumed by
it**, and this plane is told it was applied.

**This is the measured answer to *"a receiver change that can be applied by the broken receiver — if
such a shape exists"*: it does not exist.** Not for want of cleverness in the event payload — the
receiver has no code path from any event to an executable artefact, and the one path that could carry
new semantics is the path that silently swallows them.

---

## 2. The options, with costs. **No recommendation is made.**

### Option A — a signed `solution-update`, accepting that a malformed one is lost silently

Emit the fix's availability the way ADR-0035 already prescribes: a `solution-update` carrying
`signature` and `contentHash`, which the deployed receiver marks available and acks correctly.

**What it costs:**

- **It requires signing to be configured in production, and it is not.** `api.ts:433` refuses the
  publish with **`501 package signing is not configured`** when `deps.signPackage` is absent, and
  signing-key custody is **AD-016, open**. **Option A is not available today** — it is available after
  a custody decision that is itself owed. *This is a precondition, not an objection.*
- **The failure mode it accepts is un-observable from either side.** A malformed announcement is
  refused, acked, and gone; this plane's queue shows `applied`, the EP's log line is one `console.error`
  in a process nobody is reading, and **no retry ever occurs because the event is no longer pending**.
- **The risk is a function of emitter correctness, and the emitter is this plane.** The malformed case
  is not adversarial — it is one missing field in one payload builder, with no test on the far side
  able to catch it, on a path taken once per fix.
- **It is the only option that adds no mechanism.** Everything it needs already exists and is
  documented, and every subsequent update rides the same rail.
- **It does not fix the receiver on any tenancy that never installs.** It announces; the operator acts.

### Option B — out-of-band delivery, and what authorises it

Deliver the corrected package without using the update queue: regeneration + operator installation,
or a direct package hand-off.

**What authorises it — and this is the part that must be ruled, not assumed:**

- **ADR-0035's own install leg is ALREADY out of band.** The marker's `install` plan is operator-
  approved by construction: the IP never auto-installs code the EP cannot verify (INV-3, ADR-0007).
  **So "out-of-band delivery" is not an exception to the update mechanism — the second half of the
  update mechanism IS out of band.** What Option B removes is only the *announcement* leg.
- **The generator is the authorised producer and the customer is the authorised deployer.**
  ADR-0030 makes `generateSolution` the one generator; Doc 19 makes the deployment the customer's act;
  the IP writes packages to an **IP-owned staging directory** and never across the plane boundary.
  Regenerate-and-hand-over therefore crosses no boundary that the normal path does not.
- **What it costs:** it is **per-tenancy and manual**, so it scales with the tenant count and has no
  record of who received it — **the delivery-state problem P-70.3 exists to avoid, reintroduced as a
  spreadsheet.** It also **bypasses the one channel that produces an audit trail**, so *"which
  tenancies hold the corrected receiver?"* becomes unanswerable from this plane's own record —
  the same class of gap as `undistributed()` existing precisely so that condition is observable.
- **A regeneration is not free on a live EP.** It rewrites every generator-owned file in a deployed
  tenancy. `writeSolutionFiles` is careful — it prunes only what a previous manifest claimed, and
  never touches `.env`, `.auth/`, `evidence/` or reserved prefixes — but it is still a write into a
  running system, and it is the customer's act to accept.

### Option C — a receiver change applicable by the broken receiver

**MEASURED: NO SUCH SHAPE EXISTS.** §1 is the evidence. Four literal, non-executable path constants;
no path derived from event data; and the one extension point — a new event type — is the catch-all
that silently acks. **Recorded as closed by measurement rather than left open as a possibility**, so
no later reader spends effort looking for it.

**One adjacent shape exists and is NOT this option, and the distinction matters.** A *future* receiver
could be made updatable in place — for example by declaring the agent's own version and treating a
receiver upgrade as a first-class event. **That helps the NEXT deadlock and does nothing for this
one**, because it must itself arrive through the broken receiver. It is worth deciding separately; it
is not a way out of the current state.

---

## 3. What is true under every option

- **The queue must not be trusted as the record of which tenancies hold the corrected receiver.** Under
  A the ack proves a marker was written, not that an install happened. Under B there is no queue record
  at all. **Whatever is ruled, *"who has the fix?"* needs an answer that is not the ack** — and this
  plane cannot read what a tenancy holds, only what it was sent.
- **The exposure ends per-tenancy at install, not at emit.** Between the ruling and the last install,
  every un-upgraded tenancy continues to ack refusals — including, if it arrives malformed, the
  announcement of its own fix.
- **The order is forced.** Nothing can be announced to a deployed tenant until the deployment serves
  the code — see **D-144**: `origin/main` is **31 commits behind** local and contains none of this.

---

## 4. What this report does not do

It does not choose. The three options differ in what they cost, in what they leave un-auditable, and
in what they require to be decided first — and one of them (**A**) is blocked on an open custody
decision that this report does not pre-empt.

**The ruling owed:** which option, and — under whichever is chosen — **what answers *"which tenancies
hold the corrected receiver?"***, given that the ack cannot.
