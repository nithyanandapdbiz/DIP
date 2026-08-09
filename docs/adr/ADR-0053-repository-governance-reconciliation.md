# ADR-0053 — Repository Governance Reconciliation

**Status:** **PROPOSED** · **Date:** 2026-07-29

## 1. Problem

The Functional Testing implementation programme (ADR-0039…ADR-0052) is complete and its
certifications hold. During that programme a **concurrent workstream** (the cloud-native
provider platform) evolved the repository in parallel, introducing governance drift that
now shows up in the shared gates: a **duplicate ADR-0051 identifier**, **template drift**
(two ADRs do not conform to the enforced ADR section template — one of them mine,
ADR-0052), a **traceability gap** in another team's package, and a **stale published
red-count baseline** ("6 documented pre-existing reds") that no longer matches the
reproducible state. Left unreconciled, the governance record no longer describes the
repository, and future reports would cite a count that is wrong.

## 2. Context

This ADR is **governance, documentation, traceability, and certification-integrity only**.
It changes no Functional Testing behaviour, no runtime, no gateway, no platform contract,
and deletes/renumbers nothing. It follows the FINAL PROGRAMME AUDIT (recorded 2026-07-29),
which established every finding below from disk and from standalone gate execution rather
than from assertion. Per CLAUDE.md §5 and the authorization's own terms, where drift
originates in a concurrent workstream this ADR **identifies ownership** rather than
correcting another team's work, and it does **not renumber** any ADR without explicit
authorization.

## 3. Alternatives

1. **Silently repair everything** (renumber 0051-B, edit the concurrent team's package,
   rewrite ADR-0052) — rejected: violates the authorization ("do not silently repair
   another team's work"; "do not renumber without explicit authorization") and would
   mutate certified/foreign artifacts.
2. **Do nothing / keep citing the historical 6** — rejected: the governance record would
   remain false; "NOT MEASURED / stale is FAIL" (C-0.4, evidence over assertion).
3. **Document every inconsistency, recalculate the baseline, and recommend
   minimum-impact, owner-scoped remediations** (chosen) — restores governance clarity
   additively, preserves every certified implementation, and leaves each fix to its owner.

## 4. Decision

Publish an additive reconciliation package
(`docs/certification/ADR-0053-REPOSITORY-GOVERNANCE-RECONCILIATION.md`) that: audits all
ADR identifiers and records the **duplicate 0051**; audits the ADR template and records
the **template drift** (ADR-0037, ADR-0051-cloud, ADR-0052); audits repository-wide
TRACEABILITY and records the **ownership** of every gap; **recalculates the governance
baseline** into three explicit figures — historical (6), current deterministic (7),
transient (+1) — and directs future reports to cite the current deterministic baseline;
analyses the harness transients; and confirms the ADR-0039…0052 programme remains
technically valid. Every remediation is a **recommendation to the owning workstream**; this
ADR performs none of them beyond publishing its own additive documents. It changes no code.

## 5. Consequences (stated honestly)

Governance documentation once again matches the repository. The published baseline becomes
correct (7 deterministic + 1 transient), replacing the stale "6". No certified
implementation, runtime, contract, or Functional Testing behaviour changes. The four
drift items remain **open and owned** — the duplicate 0051 and the platform-providers
traceability gap are the concurrent workstream's to close; the ADR-0052 template
non-conformance is mine to close — each under its own authorization. This ADR does not
itself clear the red gates it documents; it makes their causes and owners unambiguous.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

None of the recommended remediations execute under this ADR. On acceptance, and each under
separate authorization: (a) the provider-platform workstream renumbers **ADR-0051-cloud →
ADR-0054** (next free after this ADR) and adds TRACEABILITY blocks to
`platform-providers/src/index.ts` and its conformance test; (b) the Functional Testing
workstream normalizes **ADR-0052** to the enforced eight-section template (adding the
missing Problem / Alternatives / Migration strategy / Version impact / Affected components
headings, no technical-content rewrite); (c) ADR-0037's pre-existing template gaps are
closed by its owner. Only after (a)–(c) will `adr-completeness`, `change-control-completeness`
and `implementation-traceability` return green.

## 7. Version impact

Additive documentation only. New: this decision record and
`docs/certification/ADR-0053-REPOSITORY-GOVERNANCE-RECONCILIATION.md`; a DECISIONS index
row; programme-state addenda; a re-cut closure baseline admitting ADR-0053. **No** source,
test, gate, platform contract, Decision Type, connector SPI, `ExecutionPackage`,
`AdapterRegistry`, governance rule, or certified domain is modified. No ADR is renumbered.
No other team's files are edited.

## 8. Affected components

- `docs/adr/ADR-0053-repository-governance-reconciliation.md`
- `docs/certification/ADR-0053-REPOSITORY-GOVERNANCE-RECONCILIATION.md`
- `program/DECISIONS.md`
- `program/PROJECT_STATE.md`
- `program/NEXT_ACTION.md`
- `governance/closure/baseline.json`
