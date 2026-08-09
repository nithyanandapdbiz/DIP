# ADR-0020 — Continuous Verification and Confidence Decay (Constitution v1.3)

**Status:** ACCEPTED · **Date:** 2026-07-22
**Amends:** [01 — Platform Constitution](../architecture/01-platform-constitution.md) v1.2 → **v1.3**
**Adds:** INV-11, Rule 14, C-01.42 – C-01.47

---

## 1. Problem

The platform can now demonstrate that a claim was true **once**. Nothing establishes that it is true **now**.

Every gate proof, certification, compatibility claim and readiness assessment is recorded with a timestamp and then treated as permanently valid. A proof recorded in January is weighed identically to one recorded this morning, and a gate that silently stopped detecting anything would keep contributing its original confidence indefinitely.

This is the same defect class the platform has already closed twice, in a new place. `NOT RUN` ≡ `FAIL` established that silence is not success. `NOT MEASURED` is never a pass established that absence of measurement is not evidence. **Neither established that a measurement expires** — so stale evidence still reads as current evidence.

## 2. Context

- R-13.4 requires machine-readable proofs. It does not require them to be **recent**.
- The GCI is computed from the proof registry. A registry of year-old proofs currently scores identically to one recorded minutes ago.
- The estate's governance is now substantial: six gates, a proof registry, a scorecard, an ERI and a GCI. **The more governance exists, the more damaging stale governance becomes**, because there is more of it to be quietly wrong.
- Proofs are already re-run rather than transcribed ([ADR-0019](ADR-0019-evidence-over-assertion.md)). Replay is therefore already achievable; what is missing is the obligation.
- Docker remains unavailable and supply-chain tooling is unbuilt. Any decay model must leave those honestly `NOT MEASURED` rather than decaying them toward a false zero.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Leave proofs valid indefinitely** | Rejected. It makes governance monotonically more confident over time regardless of whether anything still works — the opposite of what evidence should do. |
| **Expire proofs with a hard cutoff (valid / invalid)** | Rejected. A cliff means confidence is unchanged for a period and then collapses, which encourages re-running only at the boundary and tells nobody anything in between. |
| **Graded decay with an explicit expiry** | **Selected.** Confidence declines continuously and reaches `NOT CURRENT` at a declared age. |
| **Weight by age without expiry** | Rejected. Without a floor, ancient evidence still contributes something, and "something" is what lets a dead gate keep paying into the score. |

## 4. Decision

The Constitution moves to **v1.3**, adding one invariant and one rule, additively.

### INV-11 — Trust expires

> No claim is trusted indefinitely. Confidence is earned continuously: it decays with the age of the evidence supporting it, and evidence that has expired restores no confidence until regenerated.

### Rule 14 — Continuous verification

| Sub-rule | Requires |
|---|---|
| **R-14.1** | Every governance proof, certification, compatibility claim, security validation, performance benchmark and readiness assessment SHALL be periodically revalidated |
| **R-14.2** | Every proof SHALL be **regenerated, never copied**, and SHALL support deterministic replay producing an equivalent outcome |
| **R-14.3** | Failure to replay SHALL invalidate the confidence that proof contributed |
| **R-14.4** | Every piece of evidence SHALL carry **immutable provenance** binding it to its origin: generator, generator version, repository, commit, rule and ADR reference, timestamp, and content hash |
| **R-14.5** | Confidence SHALL **decay with evidence age** and SHALL report `NOT CURRENT` once evidence has expired. Expired evidence contributes nothing — it is never averaged as partial credit |
| **R-14.6** | Confidence SHALL NOT be published as a single number. **Score, coverage and freshness SHALL always be published together** |

### The two clauses that carry the weight

**R-14.5 — decay with a floor at zero contribution.** Graded decay without expiry lets a dead gate keep paying into the score forever at diminishing rates. Expiry with no gradient tells nobody anything until the cliff. The combination is what makes the number responsive *and* honest.

**R-14.6 — three numbers, never one.** A GCI of 87% means something entirely different at 9-of-14 coverage with fresh evidence than at 14-of-14 coverage with expired evidence. **Publishing the score alone permits exactly the misreading the index exists to prevent**, which is why coverage was already published beside it and why freshness now joins them.

### What this rule does not do

It does **not** decay `NOT MEASURED` toward zero. An unmeasured metric has no evidence to age; it stays `NOT MEASURED` and contributes nothing, exactly as before. Decay applies only to claims that *were* evidenced — Docker and supply chain remain honestly unmeasured rather than being counted as expired.

## 5. Consequences

**Positive.** A gate that stops detecting is visible within one expiry window rather than never. Governance confidence becomes a live signal instead of a historical high-water mark. Provenance makes every proof reproducible from its recorded origin. The score can no longer be read out of context.

**Negative, accepted.** Proofs must be re-run periodically, and CI cost rises accordingly — bounded, because the whole suite runs in seconds. The GCI will now **fall** when nobody runs the suite, which will look like a regression caused by inactivity. That is correct: confidence in an unverified system genuinely is lower, and a number that only ever rises is not measuring anything.

**Prohibited by this amendment.**

| Prohibited | Because |
|---|---|
| Copying a proof forward instead of regenerating it | R-14.2 |
| Publishing a confidence score without coverage and freshness | R-14.6 |
| Counting expired evidence as partial credit | R-14.5 |
| Extending an expiry window to avoid a falling score | Adjusts the instrument to flatter the result |
| Evidence detached from its generating commit | R-14.4 |

## 6. Migration strategy

**Existing proofs are re-recorded, not annotated.** They currently lack provenance, and adding provenance fields to an existing record would fabricate an origin the record does not have — the transcription failure ADR-0019 already prohibits. Re-running is cheap and is the only way the provenance is true.

**Sequence.** (1) Extend the recorder to capture provenance and emit it per proof. (2) Re-run all proofs, producing a registry that is fully provenanced from its first version. (3) Extend the GCI to compute freshness and decay. (4) Publish score, coverage and freshness together.

**Rollback.** Additive: removing INV-11, Rule 14 and C-01.42–47 by superseding ADR. What would be lost is the ability to distinguish a currently-verified platform from a formerly-verified one.

## 7. Version impact

**Architecture: minor (v1.2 → v1.3)** — additive; no existing invariant or rule amended, per A-4.

**No contract version change.** No cross-plane contract is affected.

**Forward obligation.** A new proof type SHALL declare its expiry window when introduced. A metric SHALL NOT be added without stating how its freshness is determined, or explicitly that it is not time-sensitive.

## 8. Affected components

| Component | Change |
|---|---|
| [01 — Platform Constitution](../architecture/01-platform-constitution.md) | v1.3: INV-11, Rule 14, C-01.42–C-01.47 |
| [18 — Governance Model](../architecture/18-governance-model.md) | Continuous verification and decay reference this rule |
| `governance/verification/record-fault-proofs.js` | Provenance capture; replay determinism |
| `governance/verification/verify-governance-self-validation.js` | Freshness and replay checks |
| `governance/verification/generate-scorecard.js` | Freshness, decay, reliability KPIs; score/coverage/freshness published together |
| `governance/verification/verify-architecture-fitness.js` | **New** — continuous validation of architectural invariants |
| `governance/verification/verify-contract-compatibility.js` | **New** — consumer compatibility evidence |
| `program/CHARTER.md` | Standing principle recorded |
