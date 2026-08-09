# Risk Register

**Last updated:** 2026-07-22

Severity: `CRITICAL` · `HIGH` · `MEDIUM` · `LOW` — assessed on consequence if the risk materialises, not on likelihood alone.

---

## 1. Live risks

| # | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| **R-001** | **Re-foundation recreates the predecessor's defects.** A clean start does not by itself prevent the failure modes that produced 76 violations; without structural prevention the same pressures reproduce them. | CRITICAL | Governance-as-code before runtime (P3); each known defect class mapped to a preventing mechanism in `TECHNICAL_DEBT.md` §3 | OPEN — mitigation scheduled |
| **R-002** | **Architecture is authored but never enforced.** The dominant legacy failure: sound architecture, non-conformant implementation. | CRITICAL | Every architecture document carries mechanically checkable conformance criteria (M1.1–M1.6); checks exist before the runtime (P3) | OPEN — mitigation scheduled |
| **R-003** | **Scope pressure inverts the build order.** Implementation before architecture is the fastest route to unrecoverable drift. | HIGH | Build order is a standing rule (`CHARTER.md` §5); P-008 prohibits reordering for schedule | OPEN — controlled |
| **R-004** | **Second-system effect.** Rebuilding from first principles invites over-architecting relative to delivered capability. | HIGH | Small canonical document set (D-010); one reference capability proven end-to-end (P7) before expansion | OPEN — controlled |
| **R-005** | **Deployability proven late.** The legacy platform's images were never confirmed to build; Docker was unavailable throughout. | HIGH | Confirm Docker availability before P10; treat "image builds and starts" as a demonstrated exit criterion, not an assertion | OPEN |
| **R-006** | **Legacy tree is mutated despite read-only status.** Would destroy the reference baseline's provenance. | MEDIUM | `CHARTER.md` §16 states the constraint; legacy is not a working directory for this programme | OPEN — controlled |
| **R-007** | **Programme state drifts from disk reality.** State files that describe intent rather than fact make the autonomous loop unreliable. | MEDIUM | Status reflects what is on disk and executable (`IMPLEMENTATION_STATUS.md` §7); state updated at every milestone boundary | OPEN — controlled |
| **R-008** | **Capability divergence.** Six capabilities built independently drift into six architectures. | HIGH | One reference capability first (P7); later capabilities verified against its conformance check (M7.3) | OPEN — mitigation scheduled |
| **R-009** | **AI dependency becomes structural.** If AI is woven through decision paths, the AI-disabled requirement becomes unmeetable. | HIGH | AI generates, deterministic code decides; both paths built together (D-009); AI-disabled operation is a gate | OPEN — mitigation scheduled |
## 2. Risks accepted

None yet.

## 3. Risks closed

| # | Risk | Severity | Closed | Evidence |
|---|---|---|---|---|
| **R-010** | No repositories under version control | HIGH | 2026-07-22 | Three repositories initialised at M0.3 — programme (`f319862`), Intelligence Plane (`0b98bc6`), Execution Plane (`7382937`). The two planes are separate repositories because the Sovereign Split is a repository boundary, not a folder boundary. |

## 4. Standing observation

The predecessor's failure was **not** poor architecture. Its baseline judged the architecture *"coherent, defensible, and genuinely well-conceived."* The failure was the **absence of continuous enforcement** — the gap between a declared control and a running one.

**R-001 and R-002 are therefore the programme's defining risks.** Every other entry is subordinate to them. If those two are genuinely mitigated, the programme succeeds; if they are not, no amount of architectural quality will compensate.
