# D-147 — The rotation's missing caller, and the census gap above it: report

> ## RULED 2026-08-06
>
> **AN OPERATOR ROUTE, NOT AN ADOPTION-TIME HOOK.** The hook structurally cannot repair the existing
> population, and **that population — `carlisle-homes` included — is the entire reason the module
> exists.**
>
> > **RECORD THAT THE TWO WERE NEVER ALTERNATIVES.** §2.1 presented them as a choice and that framing
> > was wrong. A hook governs tenancies *from now on*; the module was written for the tenancy that
> > **already registered before `/work` existed**. A choice between them is a choice between solving
> > the problem and solving a different one — the hook is at best an addition, never a substitute.
>
> **SWEEP ON DEMAND.** `work-path-distribution.ts` separated `undistributed()` from
> `publishWorkPaths()` **so the trigger stays a decision. A schedule would answer it silently.**
>
> **THE WRITER CENSUS IS BUILT** —
> [`verify-operator-writer-census.js`](../governance/verification/verify-operator-writer-census.js),
> the `677ec4a` / P-82.8 shape: one `SUBJECTS` list · every property per subject · **empty
> enumeration fails closed** · **absent subject FAILS** rather than passing vacuously.
>
> **AND THE ORDERING CONSTRAINT IS KEPT AS THE FINDING.** `publishWorkPaths` is enumerated with an
> **empty permitted set**, and the gate is **RED**. **It stays red until the operator route lands,
> which is correct** — a gate that went green over an undrivable distributor would assert a capability
> this platform does not have. **It is registered in `run-all` as a KNOWING red: 10 → 11.**
>
> ### §4.1 — WHAT THE CENSUS FOUND ON ITS FIRST RUN, WHICH IS NEW SINCE THE RULING
>
> **The sibling IS wired, and this report assumed it was not measured.** `publishVerificationKeys` is
> called from the **composition root at BOOT** (`platform-adoption.ts:212`), sweeping every registered
> tenancy, idempotent by comparison so a restart emits nothing.
>
> > **TWO DELIBERATELY-PARALLEL MODULES, AND ONE OF THEM GOT A CALLER.**
> > `work-path-distribution.ts` states in its own header that it reuses *"the identical reasoning that
> > gave verification-key distribution its existence"* — **and it did not reuse the one thing that
> > makes a distributor work.** The asymmetry was invisible until something enumerated writers, which
> > is the entire argument for the gate.
>
> **THIS IS A FOURTH TRIGGER SHAPE THAT §2.2 DID NOT NAME, AND IT IS REPORTED RATHER THAN ACTED ON.**
> A **boot sweep** is not *at registration*, not *on demand*, and not *scheduled* — and unlike a
> per-registration hook it **does** repair the existing population, because it runs over every tenancy
> on every start. **It does not disturb the ruling's ground:** a route is what gives distribution an
> actor, an audit record and a refusal, which a boot sweep has none of. **But the precedent exists in
> this codebase**, and a later reader comparing the two modules will find it, so it is recorded here
> rather than left to be discovered as an inconsistency.

**Status: RULED (§ above). The body below is the report as written for the ruling, unedited —
including §2.1's "two options" framing, which the ruling corrects.**

**Measured 2026-08-06** while attempting to re-emit `upd-1` against the deployed store, which is how
the absence was found: not by review, but by trying to use it.

---

## 1. The instance

`publishWorkPaths` has **zero non-test callers.** A census across every `.ts`/`.js`/`.mjs` outside
`node_modules` and `dist` returns the definition, the barrel re-export, and **eleven call sites inside
`work-path-distribution.test.ts`.** There is **no route, no controller, no CLI, no scheduled job.**

> **The engine can distribute a work path. The deployed system has no way to ask it to.**

**The earlier sweep is not a counter-example, it is the evidence.** It succeeded because a script
called the library directly against the repository's ignored working-copy directory. **That is not a
capability the platform has**; it is a capability *I* had, once, from a shell.

## 2. The two decisions, named and NOT taken

`work-path-distribution.ts` **deliberately separated `undistributed()` — which asks and writes
nothing, and can be called by a party with no authority to emit — from `publishWorkPaths()`, which
writes.** That separation exists precisely so the operational question stays open. **Answering it
inside a re-emit would close, in a plumbing change, a question the module was written to keep open** —
the failure CHARTER §17.1.2 records, and the same reasoning that kept D-142 out of an implementation
step.

### 2.1 Who owns the caller

| | What it makes true | What it costs |
|---|---|---|
| **An operator route** | distribution is an **act with an actor**, authenticated, audit-landing, and refusable. It answers *"who rotated this, and when?"* | a new authorised write surface on the tenant API, and a permission decision beside it. The route is the audit record — but it only runs when a human runs it |
| **An adoption-time hook** | **no tenancy can exist without having been sent a path**, so `undistributed()` is empty by construction rather than by discipline | it fires where a *registration* is being processed, and a failure there is a failure of registration unless deliberately isolated. It also does nothing for the tenancies that already exist — **including `carlisle-homes`, which is the whole reason this module was written** |

**They are not exclusive, and the fact that the hook cannot fix the existing population is why.**

### 2.2 When a sweep runs

**At registration** — narrowest, and structurally cannot repair history. **On demand** — an operator
decides, which is honest about it being an operational act, and means *nothing happens if nobody
looks.* **Scheduled** — self-healing and the only option under which a tenancy that missed a path
recovers without anyone noticing, at the cost of **a writer that runs unattended**, which is a
different security posture and needs its own owner.

**One constraint holds under all three, and it is already built:** `publishWorkPaths` is
**idempotent by comparison, not by a flag** — it reads back the path actually sent and skips a
tenancy already holding it. **A scheduled sweep therefore does not accumulate events**, which is the
property that makes the scheduled option affordable at all.

## 3. The finding ABOVE the instance — the census gap

**ADR-0082's P-82.9 caller census was built for exactly this class and is scoped to one store.**
`verify-run-record-write-surface.js` hard-codes a single `STORE_SRC` path. It asserts the permitted
caller set **in both directions** — no unpermitted module writes, **and every permitted module still
does** — and that second direction is precisely the property D-147 violates.

> **So a sibling writer, wired only by its tests, passes every gate in this programme.** Not because
> the census is wrong, but because it was written about its neighbour.

**THIS IS D-141'S PATTERN FROM THE OTHER DIRECTION, AND NAMING THAT IS THE POINT.** D-141 is *two
subjects sharing one driver* — a control whose scope silently widened. This is *one census not
reaching a sibling* — a control whose scope silently stayed narrow. **Both are the same underlying
defect: the SET a control governs is implicit, so nobody can ask what is outside it.** A widened
driver is visible when the wrong thing goes red; a narrow census is visible only when someone on the
far side notices nothing ever arrived, which is how this one was found.

## 4. Can the census enumerate WRITERS the way the doc-06 gate enumerates STORES?

**Yes, and it is the same repair shape, already proved once in this repository.**

`677ec4a` made the doc-06 sovereignty gate multi-subject under **ADR-0082 P-82.8**, and its header
states the argument this report would otherwise have to make from scratch:

> ***"Which stores does document 06 govern?"* must have ONE answer, read from ONE enumeration.** With
> a sibling gate the answer becomes *"however many gates someone happened to write."*

**What transfers directly:**

- **`SUBJECTS` as the single enumeration.** *"Which writers does this programme govern?"* gets one
  answer in one list, instead of one gate per writer.
- **Every property runs PER SUBJECT** — the both-directions caller census applies unchanged to each.
- **An empty enumeration FAILS CLOSED** (P-82.8), so emptying the list cannot turn the gate green.
  Its fault proof is the enumeration emptied.
- **An enumerated subject absent from disk FAILS**, rather than passing vacuously — the branch the
  run-record gate already has for its one store.

**What does NOT transfer, and must be decided rather than assumed:** a run-record store's permitted
callers are named by an ADR. **`publishWorkPaths` has no ADR naming its callers, because it has
none** — so the enumeration cannot be populated for this subject until §2's decisions are taken.
**That ordering is real and is not an obstacle:** the enumeration would list the subject with an empty
permitted set, and **the "every permitted caller still writes" direction would fail immediately and
correctly**, which is the finding rather than a false negative.

> **AND IT CATCHES THE NEXT ONE, WHICH IS THE ARGUMENT FOR DOING IT AT ALL.** Any module whose whole
> purpose is to WRITE on behalf of an operator belongs in that enumeration. Without it, the next
> writer wired only by its tests is found the same way this one was — by the far side reporting that
> nothing ever arrived.

## 5. What is owed, and by whom

**A decision (§2.1, §2.2)** — capability decisions, not this session's to take. **Then a build:** the
caller, and the writer enumeration extended to include it. **Neither is blocked on the other's
completion**, but the enumeration cannot be populated for this subject before the decision exists.

**Not blocked on the deployment**, and not part of it: `/work` being served does not give this plane
a way to tell a tenancy where `/work` is.
