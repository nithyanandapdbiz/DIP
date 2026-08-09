# 18 — Governance Model

**Status:** **FROZEN** · **Version:** 1.1 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.5
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 11 and 12
**Amendments:** v1.1 — R-18.30–R-18.32 (AI in the engineering process) added by [ADR-0016](../adr/ADR-0016-ai-tool-agnosticism.md) (additive)

**This document owns:** the governance model, gates, the certification authority, and how conformance is reported.
**It does not own:** the enforcement hierarchy ([01](01-platform-constitution.md) §3), the orchestration lifecycle ([12](12-capability-orchestration.md)), the threat model ([22](22-security-threat-model.md)), or configuration enforcement ([15](15-configuration-model.md)).

---

## 1. What governance is here

**R-18.1** Governance is **executable**. A rule that is not enforced by a running mechanism is not governed, regardless of how it is documented.

**R-18.2** A declared control that does not execute SHALL be recorded as a **violation**, not a gap (R-11.2).

**R-18.3** Conformance state SHALL NOT require an audit to discover.

### Why R-18.3 is the model's central requirement

If determining whether the platform conforms requires someone to conduct an audit, then **between audits its conformance state is unknown**. That is precisely the condition in which the predecessor accumulated 76 violations against an architecture two independent reviews declined to change. Its own closing assessment named the cause exactly: *the verification apparatus that would have caught all of this does not run where the work happens.*

Governance that reports continuously is a different thing from governance that can be checked periodically — and only the first constrains behaviour.

## 2. Policy decision point

**R-18.4** There SHALL be exactly **one** Policy Decision Point. Policy logic exists nowhere else (R-03.6).

**R-18.5** Enforcement points are **thin**: they assemble context and delegate. A PEP owns no policy logic.

**R-18.6** Every governed path SHALL have a registered enforcement point, and the path-to-PEP mapping SHALL be machine-readable, so adding an ungoverned path **fails the build**.

**R-18.7** Policy decisions SHALL be recorded as evidence, so *why* an action was permitted is auditable, not only *that* it was ([12](12-capability-orchestration.md) R-12.15).

**R-18.6 is the difference between coverage and hope.** Without a machine-readable mapping, governance coverage is whatever reviewers happened to notice — and a new endpoint added under deadline is exactly the one that slips through.

## 3. Gates

**R-18.8** Every gate SHALL report `PASS`, `FAIL`, or `NOT RUN`. **`NOT RUN` SHALL be treated as `FAIL`** (C-0.4).

**R-18.9** Every gate SHALL run **on every branch where work happens**, not only on the default branch.

**R-18.10** Branch protection SHALL be defined **as code, inside the repository**, so that gate enforcement is verifiable from the working tree.

**R-18.11** Every gate SHALL be **observed to fail** against a planted violation, and the fault-injection proof SHALL be recorded (C-0.3).

**R-18.12** A gate that cannot be made green SHALL be left **red and escalated**. Editing a gate to match non-conformant reality is prohibited (P-002).

**R-18.13** Gates are **gating** or **informational**. An informational gate SHALL name the decision blocking it, and SHALL NOT be silently excluded.

### The three states, and why the third exists

`NOT RUN` is the state the predecessor lacked. Its gates could not report that they had never been asked, so a workflow triggering only on branches where nobody worked looked indistinguishable from a passing one. An architecture fitness test failed for an extended period with nobody notified, **and the CI dashboard was green throughout** — because the failing check simply never ran.

**Silence must not read as success.**

### R-18.13 in practice

A finding blocked on a pending decision rather than on engineering should not force a choice between a permanently red build and a silenced check. Classing it informational **with the blocking decision named** keeps it visible and honest. A probe that *proves a defect exists* is a first-class artefact: it converts a claim into a reproducible fact and becomes the regression test the moment the defect is fixed.

## 4. Enforcement mechanisms

**R-18.14** Every constitutional rule SHALL be enforced by **at least three independent mechanisms** (C-0.2), drawn from:

| # | Mechanism | Catches |
|---|---|---|
| 1 | **Architecture validation** | Document integrity, ownership, cross-references |
| 2 | **Schema validation** | Malformed contracts, configuration, registry entries |
| 3 | **Compile-time validation** | Missing stages, type-flow violations, invalid states |
| 4 | **Runtime validation** | Boundary violations, boot guards, scope requirements |
| 5 | **Integration validation** | Severed-boundary behaviour, degradation, isolation |
| 6 | **CI validation** | Build, image closure, supply chain, capability execution |
| 7 | **Certification validation** | Conformance criteria across the whole platform |
| 8 | **Observability validation** | Conformance derivable from telemetry without an audit |

**R-18.15** Compile-time validation SHALL NOT be the sole mechanism for any rule. TypeScript's guarantees are erased at runtime ([ADR-0001](../adr/ADR-0001-platform-language-and-runtime.md) §5).

**R-18.16** No rule SHALL rely on documentation alone. Prose has **no** enforcement value ([01](01-platform-constitution.md) §3).

**The ≥3 requirement is empirical, not cautious.** In the predecessor, the single rule enforced three independent ways never drifted, and every rule enforced by one mechanism — or by prose — did. That correlation is the strongest evidence available to this programme.

## 5. Certification

**R-18.17** Certification is rendered **exclusively** by the Intelligence Plane (R-10.1).

**R-18.18** Certification is **deterministic**: gates evaluate evidence, and no model output reaches a verdict (INV-4).

**R-18.19** A certification SHALL be **reproducible** — re-evaluating the same evidence under the same gate definitions yields the same verdict.

**R-18.20** A certification SHALL record the gate definitions, configuration values, and evidence hashes it was rendered over.

**R-18.21** A degraded result SHALL NOT be certifiable (R-10.3, R-10.4).

**R-18.19 and R-18.20 exist together.** Reproducibility is meaningless unless the inputs are recorded: if gate thresholds changed between two runs, the same evidence legitimately yields different verdicts, and without the record that looks like non-determinism. **Recording the inputs is what makes the determinism checkable.**

## 6. The review pipeline

**R-18.22** Every milestone passes: Developer → Architecture → Security → Governance → Performance → Documentation → Certification → Accept.

**R-18.23** A failed review is **corrected immediately and revalidated**. It is not deferred.

**R-18.24** Technical debt is corrected on discovery. Where an item genuinely cannot be closed within its milestone, it is recorded with an **owner and a resolving milestone**, and it blocks that milestone's exit.

**R-18.25** After every milestone, scan for architecture drift, duplicate code, configuration drift, governance gaps, security weaknesses, performance bottlenecks, and maintainability issues.

### AI in the engineering process

**R-18.30** A review stage SHALL declare the **AI Capability Class** it requires ([13](13-ai-operating-model.md) §7), never the product that supplies it (R-12.3).

| Review stage | Required class |
|---|---|
| Developer | Code Generation, Code Review |
| Architecture | Architecture Analysis, High Reasoning |
| Security | Security Analysis |
| Governance | Governance Analysis |
| Performance | High Reasoning |
| Documentation | Documentation |
| Certification | Certification |

**R-18.31** A review is valid on the evidence it produces, **not on which system produced it**. A review record SHALL be assessable without knowing what performed it.

**R-18.32** Substituting the AI system used for any review stage SHALL NOT invalidate a prior review, require a re-review, or require an ADR (R-12.4, R-12.6).

**Why R-18.31 is the operative one.** Recording *which* system performed a review makes the record's credibility depend on the reputation of a product — and a product that is later deprecated retroactively devalues every review it signed. **A review must stand on its evidence**, exactly as certification does (R-18.18, R-18.19): the argument is checkable, or the review is worthless regardless of what produced it.

## 7. Architecture change control

**R-18.26** After the M1.6 freeze, an architecture change SHALL require: an **ADR**, an **impact analysis**, a **migration strategy**, and a **governance review** — before implementation.

**R-18.27** Every ADR SHALL contain: problem, context, alternatives, decision, consequences, migration strategy, version impact, and affected components.

**R-18.28** A decision closed **without** an ADR has no recorded migration path and therefore no baseline from which to migrate. Such decisions SHALL be regularised before the freeze.

**R-18.29** Implementation convenience is **never** grounds for amendment (A-2). Rejected amendments are recorded as prohibited decisions so convenience cannot later be mistaken for a determination (A-3).

## 8. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-18.1** | Exactly one Policy Decision Point; no policy logic elsewhere | Policy-location gate |
| **C-18.2** | Every governed path has a registered enforcement point | Coverage matrix gate — an unregistered path fails the build |
| **C-18.3** | Policy decisions are recorded as evidence | Evidence content test |
| **C-18.4** | Every gate reports PASS, FAIL or NOT RUN | Gate output schema check |
| **C-18.5** | A `NOT RUN` gate fails certification | Skipped-gate negative test |
| **C-18.6** | Every gate runs on every active branch | CI trigger audit |
| **C-18.7** | Branch protection is defined as code within the repository | Repository content check |
| **C-18.8** | Every gate has a recorded fault-injection proof | Proof register reconciliation |
| **C-18.9** | Every constitutional rule has ≥3 independent mechanisms | Rule-to-mechanism reconciliation |
| **C-18.10** | No rule relies on compile-time validation alone | Mechanism inventory audit |
| **C-18.11** | Certification is reproducible over identical evidence and definitions | Re-evaluation test |
| **C-18.12** | Every certification records its gate definitions, configuration and evidence hashes | Certification schema gate |
| **C-18.13** | A degraded result cannot be certified | Interface rejection test |
| **C-18.14** | Conformance state is derivable from telemetry without an audit | Telemetry-to-conformance reconciliation |
| **C-18.15** | Every architecture change after the freeze carries an ADR with migration strategy and version impact | ADR completeness gate |
| **C-18.16** | No informational finding is excluded without naming its blocking decision | Suite output audit |
| **C-18.17** | Every review stage declares an AI Capability Class and names no product | `verify-ai-vendor-neutrality.js` |
| **C-18.18** | A review record is assessable without knowing what performed it | Review-record inspection |

**C-18.9 is the criterion that keeps the model honest about itself.** It reconciles every constitutional rule against the mechanisms claimed to enforce it, and a mechanism that is not currently running does not count. Without it, the ≥3 requirement would itself be documentation — enforced by prose, which this document rates at zero.

## 9. Open items

| # | Item | Target |
|---|---|---|
| **AD-034** | Whether customers receive a conformance attestation for their own audits | P2 |

**AD-034 has commercial weight.** A customer's auditor will ask whether the platform that certified their release was itself conformant. Answering "yes, and here is the machine-generated evidence" is a materially different sales position from answering "yes, we audit periodically" — and the difference is precisely what R-18.3 makes possible.
