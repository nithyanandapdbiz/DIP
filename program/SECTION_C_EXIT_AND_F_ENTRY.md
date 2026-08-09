# Section C — exit report · Section F — entry report

**2026-08-04.** Written at C's close, before F starts.

---

## 1. The logged disagreement prediction — MEASURED, AND FALSIFIED

**Predicted, before the run:** once both mechanisms could vary, a run where the domain reports `publicationStatus: 'partial'` while `SyncReport.status` still reads `SUCCESS` would be two mechanisms describing one publication and disagreeing — D-021's shape, one layer down.

**Measured:**

```
canonical publicationStatus     deps=A published · deps=F partial · deps=R failed
canonical result carries a SyncReport?   false
```

**The two never meet.** `publicationStatus` is produced by the canonical `synchronisation` domain; `SyncReport.status` is produced by the agent-path `report` agent. **No single run produces both**, so the disagreement I predicted cannot occur.

**The prediction was wrong because it assumed the port had happened.** It has not — placement moved to Section F, so the nine agents still run on the agent-catalogue path. The disagreement is therefore **scheduled, not absent**: it becomes possible exactly when F places the nine on the canonical runtime and one run carries both values.

**Consequence for the corollary, stated honestly.** The corollary's second direction — *that it predicts disagreements and not only silences* — **remains untested.** Two predictions have now been made before their runs: the first (a silence, at the design-sync SPI) held; this one did not, for a structural reason rather than a reasoning error. **A falsified prediction that names its own cause is the more useful outcome, and it is recorded rather than quietly dropped.**

---

## 2. Section C exit report

### Claims D, F and G will rest on

| # | Claim | Evidence | Falsified by |
|---|---|---|---|
| 1 | **A publication can fail, and every layer can say so.** `PublicationOutcome` and `WriteOutcome<T>` across three SPIs; `PublishedObject.status` reflects the tool's answer; `publicationStatus` reaches all three states. | measured: `published` / `partial` / `failed` on A / F / R | a publication path that reports success without the tool having agreed |
| 2 | **A stage can refuse, in production, and it is traceable to the domain finding that caused it.** The canonical runner refuses on a publication failure, carrying `synchronisation`'s own reason verbatim. | four ADR-0071 obligations asserted on one run, plus a negative control | a refusal indistinguishable from `not applicable`, or one that cannot be traced to a domain finding |
| 3 | **Every design-sync agent can report a failed write, and none writes against a case that was never created.** Four gained the ability (ADR-0073, `WriteOutcome`); three gained the predecessor check (D-034). | `skipped: true` proved reachable and distinguishable from a zero count | an agent that writes and cannot say what happened when the write did not |

### INFERRED, and D/F/G depend on it

**No adapter in this tree refuses.** Every failure path proved above is proved through a *fixture* that refuses — `partialTestManagementConnector`, `refusingTestManagementConnector`, variant R. **That the same paths behave correctly against a REAL connector is inferred, not measured**, and cannot be measured until one exists (P-69.2's fidelity work). The inference is narrow — the code paths are identical and the fixtures differ only in what they return — but it is an inference.

**`SyncReport.status`'s three states are proved at the AGENT, not end-to-end.** The harness resolves its design-sync adapter through the registry, so a refusing adapter could not be injected without changing the harness. `PARTIAL` and `FAILED` are proved by driving the `report` agent directly. **The orchestrated path is inferred.**

### The premise D and F inherit

> **The nine design-sync agents are PORTED — PENDING PLACEMENT. Their fidelity exists and is proven; their home does not. F inherits a set of agents that are individually fit for a runtime that has nowhere to put them.**

Two obligations follow, on F rather than about it:

1. **Placement is architecture, not wiring.** The canonical runtime has domains; these are agents. Whatever F builds to hold them becomes the agent layer for all 144, not a fixture for nine.
2. **The disagreement in §1 arrives with placement.** The moment one run carries both `publicationStatus` and `SyncReport.status`, D-021's question exists at a second layer. F should expect it rather than discover it.

### Contagion — SETTLED

**The corollary predicted a LOCATION twice, both times from predictions written before the run, and both times it was right.**

- **First:** *look downstream of what was just made honest.* Applied to ADR-0072, it pointed at the design-sync SPI — which had the same defect, untouched (D-028), plus four `failureHandling` declarations that were unimplementable when written.
- **Second:** applied before the port, it pointed at the agents' own inferences — the link tally counting attempts (D-029) and three agents writing against a null id (D-034).

**Its bound was also measured, and is part of the settlement:** new honesty exposes silence **only where a consumer had already built on the old behaviour**. Where nothing consumes the new capability, the corollary makes no prediction and correctness must come from assertion — which is why the first production `refuse` shipped with four assertions and a negative control rather than a green suite.

**SCHEDULED TEST, not a closed question.** The second direction becomes testable the moment F1 places the nine and one run carries both publicationStatus and SyncReport.status. Logged here so it fires rather than lapses.

**What is NOT settled:** the second direction (§1). It predicts locations; whether it predicts disagreements is open.

---

## 3. Section F entry report — seven inherited obligations

| # | Obligation | Came from | Depends on | Independent? |
|---|---|---|---|---|
| 1 | **Place the nine design-sync agents** | Section C (P-69.2) | an agent layer existing | **No** — blocked on 2 |
| 2 | **The agent layer** — a home for agents on the canonical runtime | ADR-0061 / C's port | nothing | **Yes** — the root |
| 3 | **The agent-level acceptance bar** — *an agent that writes should be able to say what happened when the write did not*, plus *what does this assume that is true only because something below it cannot yet fail?* | Section C (D-034) | 2, to have agents to apply it to | **Yes** as a standard; **no** as an applied audit |
| 4 | **The twenty triad agents** — 2 architecture/policy-review, 18 guardrail-review | D-019 / retirement register §1 | 2, and ADR-0071's primitive (**landed**) | **No** — blocked on 2 |
| 5 | **The 109 unevidenced certification criteria** | D-015 (C-3) | agents that carry criteria contributions → 2 | **No** — blocked on 2 |
| 6 | **The `failureHandling` audit** — every declaration written against an SPI that could not fail | D-024 | nothing structural; it is a read | **Yes** |
| 7 | **Read-back validation for publication** (ADR-0073 ruling b) | Section C | a real connector to be worth proving | **Yes** to build; **no** to prove |
| 8 | **`businessGoal` / `title`'s upstream source** | D-032 | `test-design-intelligence`, not the agent layer | **Yes** — and it is the odd one out |

### F2 — read-back validation now has EVIDENCE, not principle

**Ruling (b) was argued from principle: read-back survives a lying adapter, and no adapter here lies.** That argument could not be exercised in this tree. **It can now be named instead**, from `NINE_AGENTS_ASSUMPTIONS.md`:

- **`design-sync.idempotency` (entry 2)** — its whole decision is `syncHash` equality. Against a tool that **normalises on write** — trims whitespace, reorders steps, canonicalises a title — the returned hash never matches the submitted one and the agent decides `update` **on every run, forever**. Every run succeeds; the counts look busy; the phase has silently stopped being idempotent.
- **`design-sync.traceability` (entry 5)** — links story, requirements and work items with no de-duplication of its own. **The correctness lives in the STORE**, not the agent. A tool that appends rather than upserts accretes duplicate links every run, **and the link census counts them as successes**, because each call returns `published: true`.

**Neither is caught by making a layer beneath them honest.** Both write successfully, both are reported successfully, and both are wrong. **They are the cases where honesty below does not help and only observation of the tool does** — which is read-back's job, stated as two named agents in this codebase rather than as a property of hypothetical adapters.

### F2 scoping — the three-way split, and the one F2 cannot close either

The nine assumptions divide by **what breaks them**, and the division is F2's scope boundary:

| Class | Agents | F2's reach |
|---|---|---|
| **Connector-breakable** — a real connector's failure modes | `discovery` (mid-operation failure), `validation` (read-after-write latency), `report` (doubled failure count) | **In scope.** Read-back and the outcome types address these |
| **Tool-breakable** — wrong regardless of connector quality | `idempotency` (normalising writes), `shared-assets` (name scoping), `attachments` (12-hex-char truncation) | **In scope, and the reason F2 exists.** Only observing the tool detects them |
| **Unfixable by any SPI change** | `suite-assignment` — the grouping may be deleted or moved between discovery and assignment | **NOT closeable by F2.** A refusal-capable `assignToSuite` *reports* the race; it cannot prevent it. **Reporting is the whole remedy**, and F2 must say so rather than close it |

**`suite-assignment` is the only one of the nine where widening a type is the complete available answer and the answer is still partial.** Recorded at F2's entry so it is a stated limit rather than an exit-time surprise.

### Owed BY the wiring, and created by this work

**`report`'s double-count is now reachable, and Section C made it so.** `failures` concatenates failed write outcomes and invalid validations; a case whose write failed is *also* validated and reports `test-case-exists: false`, so **one failed case contributes two entries** — and the `PARTIAL`/`FAILED` boundary (`succeeded.length === 0`) has never been tested against a case counted twice. Before `WriteOutcome<T>` a write could not fail, `failed` was always empty, and the path was unreachable.

**This is not a pre-existing defect to inherit. It is one this work created**, and it is owed by the wiring step rather than left for whoever meets it.

### Does it split? YES, and the expected boundary is ALMOST right

**F1 — the agent layer and what it holds:** 2 (the layer), 1 (place the nine), 4 (the triad agents), 3 (the bar, applied). **All four are blocked on the same root**, which is what makes them one section rather than four items.

**F2 — declaration versus behaviour:** 5 (the 109 criteria), 6 (the `failureHandling` audit), 7 (read-back). Each compares a stated thing against a done thing.

**The correction: obligation 5 does NOT belong in F2.** The 109 criteria are declaration-versus-behaviour in *character*, but they are **blocked on the agent layer** — agents are what would carry criteria contributions, so the work cannot start until F1 exists. Putting it in F2 makes F2 depend on F1, which defeats the split. **5 belongs in F1**, as the reason the agent layer is worth building rather than a separate audit.

That leaves **F2 = 6 and 7 only**, both genuinely independent of F1 — and F2 can run *before, during or after* F1.

**Obligation 8 belongs in neither.** `title` and `businessGoal` need a source in `test-design-intelligence` or the requirement model — **domain work, not agent work.** It rides along with F1 only because `GherkinAuthoringAgent` is the natural producer. If F1 is scoped as *the agent layer*, 8 is a dependency of it; if F1 is scoped as *placement*, 8 is a separate domain change. **This is the one scoping decision I would put back to you.**

### Mutually blocking? One near-miss, and it is worth knowing now

**7 (read-back) and the real connector are circular in a soft way.** Read-back's value is surviving a lying adapter; no adapter in this tree lies; so building it in F2 produces a capability proved only by construction — the exact situation ADR-0073 §4 recorded. **It is buildable independently and provable only later**, which means F2 can deliver it but F2 cannot close it. **That should be stated at F2's entry, not discovered at its exit.**

**Nothing else is mutually blocking.** 6 is a pure read. 2 blocks 1, 3, 4 and 5 in one direction only.

### Carried into F's bar, as agreed

**Only `validation` was DESIGNED for failure. The other eight were RETROFITTED for it, in Section C, by this work.** A retrofitted agent is correct today and rests on the same kind of guarantee that has now stopped holding twice.

**F asks of every agent it builds or ports: *what does this assume that is true only because something below it cannot yet fail?* — and RECORDS the answer**, so the next honest layer has somewhere to be checked against.
