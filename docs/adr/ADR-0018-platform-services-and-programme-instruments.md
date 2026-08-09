# ADR-0018 — Platform Services and Programme Instruments

**Status:** ACCEPTED · **Date:** 2026-07-22
**Raised by:** the twelve strategic recommendations adopted as permanent engineering principles
**Affects:** [11](../architecture/11-capability-model.md), [18](../architecture/18-governance-model.md), the canonical set, `program/`

---

## 1. Problem

Twelve strategic recommendations were adopted as permanent principles. They introduce concerns that the frozen architecture does not own — maturity assessment, engineering scorecards, operational excellence (SLOs, error budgets, incident and problem management, DR/HA), customer success readiness, platform intelligence and analytics, an engineering dashboard, and an innovation framework.

Two problems follow, and both are the kind that get absorbed silently.

**First, a cardinality collision.** Recommendation 7 says *"Create a Platform Intelligence capability."* [11](../architecture/11-capability-model.md) is frozen and R-11.4 fixes the platform at **exactly six** capabilities, a seventh requiring an approved ADR. Building Platform Intelligence as a capability without this ADR would violate a frozen rule.

**Second, unowned topics.** No canonical document owns SLOs, incident management, maturity, scorecards or customer readiness. Recording them anywhere convenient would breach the single-source-of-truth contract — the estate's defining discipline.

## 2. Context

- **R-11.1** defines a capability as *a complete, certifiable unit of quality engineering work* that traverses twelve stages and yields a certified verdict. Document 11 states the test mechanically: *"if it cannot traverse all twelve stages and emit a certified verdict, it is not a capability."*
- Document 11 already enumerates what is **not** a capability, and one row reads *"A report or dashboard — that is the Reporting stage of a capability."*
- The architecture is frozen. Additions require ADR, impact analysis, migration strategy and governance review (R-18.26).
- The predecessor's dominant defect class was **declared-but-unbuilt**: controls that existed in documentation and configuration and in no execution path.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Build Platform Intelligence as a seventh capability** | Rejected. It performs no quality engineering against a customer system and yields no certified verdict about customer software. Admitting it would make "capability" mean "feature", and document 11 states plainly that once that happens the shared orchestration becomes a suggestion. |
| **Fold these into existing documents** | Rejected. Governance ([18](../architecture/18-governance-model.md)) owns gates and certification, not SLOs or customer readiness. Stretching it to cover them would make one document the answer to unrelated questions — the navigability defect that produced ~215 unclassified documents in the predecessor. |
| **Record them in `program/` only** | Rejected for the architectural subset. Operational excellence and platform intelligence constrain how the platform is built and run; leaving them out of the canonical set means implementation would have nothing to conform to. |
| **Classify by kind: platform services get canonical documents; measurement instruments live in `program/`** | **Selected.** |

## 4. Decision

### 4.1 Platform Intelligence is a platform service, not a capability

**R-11.4 stands unchanged. The platform has exactly six capabilities.**

Platform Intelligence, Operational Excellence and Customer Success are **platform services**: they serve the platform and its operators, they do not perform quality engineering against a customer system, and they yield no certified verdict about customer software. They therefore do not traverse the twelve-stage lifecycle and are not subject to R-11.2.

This is recorded explicitly because the alternative is the failure document 11 exists to prevent — and because "Platform Intelligence capability" is natural phrasing that would, unexamined, have produced a seventh capability.

### 4.2 Three canonical documents are added

| # | Document | Owns |
|---|---|---|
| **23** | Operational Excellence Model | SLOs, SLIs, error budgets, incident and problem management, RCA, capacity planning, HA/DR, backup and restore validation, runbooks |
| **24** | Platform Intelligence Model | Engineering, operational, customer, AI and executive intelligence; the analytics surface and the dashboard |
| **25** | Customer Success & Release Readiness | Installation, upgrade, migration, troubleshooting, API/SDK documentation, the Customer Success Package |

Each carries conformance criteria and declared ownership boundaries like every other canonical document, and each is subject to the integrity gate.

### 4.3 Maturity and the scorecard are programme instruments, and SHALL be generated

The Platform Maturity Model and Engineering Scorecard measure the programme, not the product. They live in `program/`.

**They SHALL be machine-generated from gate and test output. A hand-authored scorecard or maturity report is prohibited.**

This is the load-bearing clause of this ADR. A hand-written scorecard asserting "Architecture Compliance: green" is **precisely the declared-but-unbuilt failure class** — it manufactures confidence rather than measuring it, and it is worse than no scorecard because it is persuasive. The predecessor's retention limit was schema-validated, API-served, console-rendered and read by no code; a hand-maintained scorecard has exactly that shape.

**A metric with no executing measurement SHALL be reported as `NOT MEASURED`, and `NOT MEASURED` SHALL NOT be reported as a pass** — the same rule as `NOT RUN` ≡ `FAIL` (C-0.4), applied to measurement rather than enforcement.

### 4.4 Maturity levels are evidence-based

A capability SHALL NOT be assessed above **Level 1 (Initial)** unless evidence exists:

| Level | Requires |
|---|---|
| 1 Initial | Nothing — the default |
| 2 Managed | A defined process exists and is followed |
| 3 Defined | The process is documented and enforced by at least one gate |
| 4 Measured | Metrics are emitted and collected automatically |
| 5 Optimized | Metrics drive automatic improvement, with regression detection |

**Level is claimed from evidence, never asserted.** Most of the platform is Level 1 today and the first generated report will say so.

## 5. Consequences

**Positive.** The six-capability cardinality survives contact with a natural-language instruction that would have broken it. Every strategic topic acquires exactly one owner. The scorecard measures rather than asserts, so a regression is detectable rather than reportable. An honest Level 1 baseline makes improvement visible.

**Negative, accepted.** Three additional canonical documents enlarge the estate — bounded by their being the only ones added, each with a declared boundary. Generated reports are less flattering than authored ones: the first will show mostly Level 1 and several `NOT MEASURED` entries. **That is the point.** An unflattering measurement is worth more than a confident assertion.

**Prohibited by this decision.**

| Prohibited | Because |
|---|---|
| Building Platform Intelligence as a capability | R-11.4; it yields no certified verdict |
| A hand-authored scorecard or maturity report | Declared-but-unmeasured is the predecessor's defining failure |
| Reporting `NOT MEASURED` as a pass | Silence must not read as success |
| Claiming a maturity level without evidence | Level is derived, never asserted |

## 6. Migration strategy

None required — nothing has been implemented against a contrary interpretation, which is why the collision was worth catching now rather than after Platform Intelligence had been built with a twelve-stage lifecycle it does not need.

**Forward path.** Documents 23–25 are authored in the next architecture increment and follow the same lifecycle as the frozen set: DRAFT → conformance criteria → gate-verified → FROZEN at the next architecture version. Until they are FROZEN, implementation against them is prohibited by the build order.

**Should Platform Intelligence ever need to become a capability**, that requires an ADR amending R-11.4 and demonstrating that it produces a certified verdict — which would mean it had become a different thing.

## 7. Version impact

**No contract version change.** No cross-plane contract is affected; these concerns are internal to platform operation and to the programme.

**Architecture version:** minor — additive documents and an explicit classification, with no existing rule amended. R-11.4 is *confirmed*, not changed.

**Forward obligation.** A metric added to the scorecard SHALL be added together with the mechanism that measures it, in the same change — the configuration rule of R-15.2 applied to measurement.

## 8. Affected components

[11](../architecture/11-capability-model.md) (cardinality confirmed, not amended) · [18](../architecture/18-governance-model.md) (scorecard consumes gate output) · [16](../architecture/16-runtime-model.md) §7 (observability feeds intelligence) · new documents 23, 24, 25 · `program/ARCHITECTURE_STATUS.md` (topic-ownership table) · `program/CHARTER.md` (standing principles) · `governance/verification/generate-scorecard.js` (new) · `program/PLATFORM_MATURITY.md` and `program/ENGINEERING_SCORECARD.md` (generated, never hand-edited).
