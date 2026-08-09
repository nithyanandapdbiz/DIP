# Pending ADR Amendments — required to clear the remaining governance gates

**Status:** OPEN · **Raised:** 2026-07-29 · **Raised by:** release-certification cycle
**Governs:** nothing. This is a work register, not a source of truth. Each amendment below must be
applied through the normal decision process (edit → review → `emit-closure-package.mjs` re-baseline)
by an owner with the authority to amend a decision record.

---

## Why this file exists instead of the edits themselves

Three governance gates fail on the CONTENT of baselined decision records:

| Gate | Failing on | Class |
|---|---|---|
| `verify-adr-completeness` | ADR-0037, ADR-0052 — missing required sections | Documentation |
| `verify-change-control-completeness` | an ADR not declaring its affected components | Documentation |
| `verify-ai-vendor-neutrality` | governed documents citing the tool bootstrap file as a rule source | Documentation |

Every one of these is a real defect and none is a false positive — I verified each against the gate
output and the document itself. They are nonetheless **not** fixed in this cycle, for two reasons.

**The documents are baselined.** `governance/closure/baseline.json` records a content hash for all 55
ADRs. Editing one is a deliberate governance act that requires a re-baseline, which is exactly the
"silent amendment" `verify-programme-closure` exists to prevent. Doing it as a side effect of a
security release would be the failure mode, not the fix.

**The missing content is a decision, not a formatting gap.** ADR-0052 is missing `Problem`,
`Alternatives`, `Migration strategy`, `Version impact` and `Affected components`. Nobody can write
"Alternatives" for a decision they did not take — inventing them would put fabricated reasoning into
the permanent record of why this platform is built the way it is. That is worse than a red gate,
because a red gate is visible and a fabricated rationale is not.

So each amendment is specified precisely enough to be applied mechanically by the decision owner, and
no further.

---

## AMD-1 · ADR-0037 and ADR-0052 are missing required sections

**Gate:** `verify-adr-completeness` — "every ADR carries all eight required sections"

| Document | Missing sections |
|---|---|
| `docs/adr/ADR-0037-execution-target-simplification.md` | Migration strategy · Version impact |
| `docs/adr/ADR-0052-first-runtime-deployment.md` | Problem · Alternatives · Migration strategy · Version impact · Affected components |

**Required of the owner.** Add each named section using the heading form the other 53 ADRs use
(`## N. <Section>`). Content must describe what was actually decided and actually considered at the
time the decision was taken. If an ADR genuinely had no alternatives — which happens for a forced
technical constraint — say so explicitly and say why; an honest "none, because X" satisfies the gate
and the reader, whereas a plausible-sounding invented list satisfies neither.

**Verify:** `node governance/verification/verify-adr-completeness.js` → exit 0.

---

## AMD-2 · An ADR does not declare its affected components

**Gate:** `verify-change-control-completeness` — "every ADR declares its affected components"

Same root cause as AMD-1 (ADR-0052 omits `Affected components`) and clears with it. The section must
name the packages and documents the decision changes, so a reviewer can tell from the record alone
what a decision touched — which is the entire purpose of change control.

**Verify:** `node governance/verification/verify-change-control-completeness.js` → exit 0.

---

## AMD-3 · Governed documents cite the tool bootstrap file as the source of a rule

**Gate:** `verify-ai-vendor-neutrality` — two properties, one root cause

This is the sharpest of the three, because the repository's own constitution already forbids it. The
bootstrap file states plainly, in its §1, that **no rule originates there** — it has no history, no
review, no commit gate — and that anything governing the organisation belongs in `program/CHARTER.md`
and anything governing the system belongs in `docs/architecture/`. These documents nonetheless cite
it as the governing authority for a rule:

| Document | Line | Cites |
|---|---|---|
| `docs/adr/ADR-0037-execution-target-simplification.md` | 199 | the bootstrap file §4, for the no-cross-plane-change rule |
| `docs/adr/ADR-0046-legacy-functional-pipeline-retirement.md` | 5 | the bootstrap file §5 |
| `docs/adr/ADR-0049-canonical-runtime-cutover.md` | 5 | the bootstrap file §5 |
| `docs/adr/ADR-0052-first-runtime-deployment.md` | 43 | the bootstrap file §5 |
| `docs/adr/ADR-0053-repository-governance-reconciliation.md` | 23 | the bootstrap file §5 |
| `docs/adr/ADR-0060-cloud-native-provider-platform.md` | 5 | the bootstrap file §5 |
| `program/DECISIONS.md` | 130 | as above |

**Required of the owner.** Replace each citation with the versioned document that actually owns the
rule. From the bootstrap file's own §4, the substantive rules it restates live in:

- no change spanning both planes in one step → `docs/architecture/20-cross-plane-contracts.md`
- plane ownership and the sovereignty boundary → `docs/architecture/19-repository-ownership.md`
- prompt-versus-repository precedence → `program/CHARTER.md`

This is a citation correction, not a change of rule: the rules themselves are unaffected and live
where they always did. The point is that a reader following the reference lands on something
reviewable.

**One line is NOT part of this amendment.**
`docs/certification/ADR-0053-REPOSITORY-GOVERNANCE-RECONCILIATION.md:94` quotes a vendor name that
appears inside a deliberately-planted fault-probe fixture, as historical evidence of a past gate run.
That is permitted context 4 in the gate's own header ("migration and historical records"). It is left
for the owner to mark with the gate's declared inline exemption rather than silently exempted here —
the marker is designed to be visible in a diff and reviewed by someone with the standing to accept it,
and a release cycle marking its own exemptions is how that control decays.

**Verify:** `node governance/verification/verify-ai-vendor-neutrality.js` → exit 0.

---

## AMD-4 · `verify-decision-index` fails on two documents — and the two are different kinds of work

**Gate:** `verify-decision-index` — properties 4 (status readability) and 5 (index/file agreement)

**Raised 2026-08-06**, measured while reporting story input. **The gate had three failures; one was
mechanical and has been taken, and these two are what is left.**

| Document | Failure | Kind |
|---|---|---|
| `docs/adr/ADR-0040-canonical-platform-contract-framework.md` | `Status:` reads **`COMPLETE`** — not one of the five the canonical accessor knows (`ACCEPTED`, `PROPOSED`, `SUPERSEDED`, `REJECTED`, `DEPRECATED`) | **Baselined ADR content** |
| `program/DECISIONS.md` — the ADR-0067 row | the index row **declares no status** while the file reads `ACCEPTED` | **Index row** — see the correction below |

**What was already taken, and why it did not belong here.** `DECISIONS.md` declared **ADR-0083 and
ADR-0084 as `PROPOSED` while both files read `ACCEPTED`**. That is not an amendment to a decision
record — it is an index that was **not updated when the acceptance happened**, so the correction is
owed *by* the acceptance and restores agreement rather than changing a decision. Both rows now read
`**ACCEPTED** 2026-08-06 · re-baselined on acceptance`, matching the three rows above them, and
property 5 no longer names them.

**A correction to the routing of the ADR-0067 half, recorded rather than acted on.** It was routed here
as baselined content. **Measured, it is not:** the defect is in `program/DECISIONS.md`'s row, not in
`docs/adr/ADR-0067-reasoning-result-registry.md`, whose own `Status:` line is correct and whose content
hash is untouched by fixing it. **It is mechanically the same class as the ADR-0083/0084 rows just
taken**, and it is left here rather than taken because the routing was a ruling and reversing a ruling
by measurement is a separate act from reporting that the measurement disagrees with it. **Cheap when
someone wants it:** one status cell, no re-baseline, `DECISIONS.md` is not a baselined document.

**ADR-0040 is genuinely baselined content and genuinely belongs here.** `governance/closure/baseline.json`
records its content hash; editing the `Status:` line is a deliberate governance act requiring a
re-baseline, which is exactly what `verify-programme-closure` exists to prevent being done silently —
and doing it as a side effect of a capability report is the specific failure this file was created to
avoid. **Required of the owner:** decide what `COMPLETE` was intended to mean. It is not a synonym for
`ACCEPTED` in this vocabulary, and choosing one changes what a reader concludes about a frozen contract
framework — so this is a small ruling, not a typo fix.

**Verify:** `node governance/verification/verify-decision-index.js` → exit 0.

---

## Not an amendment: two gates that will not clear this way

**`verify-intent-conservation`** is RED by design and escalated under R-18.12 (ADR-0038 §P-38). It
reports five real, open properties. It must stay red until the underlying work is done; treating it
as a documentation problem would be exactly the silent-amendment failure this register exists to
avoid.

**`verify-governance-self-validation`** cannot pass while any gate above is red: it requires a clean
run of every gate to record a proof, so its failure is downstream of AMD-1..3 rather than independent.
It should clear on its own once those close, and `record-fault-proofs.js` is re-run.

---

## Closure procedure

1. Apply AMD-1, AMD-2, AMD-3, AMD-4 as separate reviewed commits.
2. `node governance/verification/run-all.js` — confirm the three gates pass.
3. `node governance/closure/emit-closure-package.mjs program` — re-baseline deliberately, then review
   the diff and confirm only the amended documents moved.
4. `node governance/verification/record-fault-proofs.js` — twice, to settle proof currency.
5. Delete this file. A pending-work register that outlives its work becomes a false record.
