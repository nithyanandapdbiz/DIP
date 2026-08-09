# REPOSITORY-OPTIMIZATION-001 — Repository Improvement Report

**Status:** COMPLETE · **Outcome:** ONE safe improvement implemented; remaining surface exhausted · **Date:** 2026-07-29

> Objective: implement every repository improvement legitimately possible **without** external
> infrastructure or governance changes. **No runtime activation, no simulated execution, no RC-3
> bypass, no frozen-contract/ADR change, no entry-point reroute, no legacy removal, no GA claim.**
> Assessment is evidence-based; only a change proven gate-neutral was made. Work was not
> fabricated to produce changes.

---

## Phase 1 — Repository assessment (classified)

| Finding | Location | Class | Reason |
|---|---|---|---|
| Stale status banner "P0 — skeleton. No implementation." | `README.md:5` | **SAFE** | README is **not** in the closure baseline (baseline hashes `docs/architecture/*` + ADRs + gates); the only gate scanning it (`ai-vendor-neutrality`) checks for vendor names. A factual status edit adds no vendor token, changes no runtime, touches no legacy/provider file. |
| Stale pointer `../program/` (program/ is in-repo) | `README.md:126` | SAFE (low value) | Same scope reasoning; deferred — the line sits beside a bootstrap-file reference that `ai-vendor-neutrality` inspects; not worth the marginal risk for near-zero value. |
| Per-engine "duplicated" files (`adapters.ts`/`model.ts`/`orchestrators.ts`/`capability.ts`) | `packages/*/src/*` | **BLOCKED** | Each engine's internal structure is a **frozen bounded context** (ADR-0022/0023/0024/0026/0027/0028); `functional-completeness` (R-11.14) proves every adapter method is invoked. "Consolidation" would turn conformance/completeness gates RED. Not real duplication. |
| "Unused" FTE modules (`legacy-retirement.ts`, `production-qualification.ts`, `runtime-cutover-readiness.ts`, `activation.ts`, `canonical-capability.ts`, `runtime/*`) | `functional-testing-engine/src/*` | **BLOCKED** | Each is the evidence source for a named gate; removing/trimming exports flips that gate. |
| Legacy runtime (`capability.ts`, `orchestrators.ts`, `agents/*`, `adapters.ts`, `authoring-bridge.mjs`, `ip-execute-gateway.mjs`) | FTE + gateway | **BLOCKED** | Active runtime + rollback path; AC-7 / LR-3 require presence. Out of scope by instruction. |
| `platform-providers/**` | whole package | **EXTERNAL** | Owned by the concurrent ADR-0060 workstream. |
| `.otc-server.log`, `generated/**` | root | **NOT APPLICABLE** | Gitignored + untracked (`git check-ignore` confirms). Not in the tracked tree — nothing to clean. |
| New certification docs (this session) | `docs/certification/*` | NOT APPLICABLE | In-progress authoring, not junk; `docs/certification/` is inside the `ai-vendor-neutrality` scan scope. |
| Genuinely dead code (no gate/barrel/test/fault-proof reference) | — | **NONE FOUND** | The completeness gate executes the FTE and asserts zero dormant components; no export is provably reference-free. |

## Phase 2 — Build health

**Already clean.** `packages/functional-testing-engine` `tsc --noEmit` → exit 0. No unused-import/dead-export removal is safe (the governance treats declared surface as load-bearing; R-11.14 requires invocation, and `record-fault-proofs` anchors on specific export strings). **No change made** — the build is healthy and changing it risks runtime behaviour and gates.

## Phase 3 — Documentation

**One correction made:** `README.md:5` — replaced the false "P0 — skeleton. No implementation. Architecture authoring begins at P1." banner with an accurate, honest status: engineering programme complete (ADR-0039–0054, PCR-0001); operational execution + GA pending external infrastructure; **GA NOT CERTIFIED**; legacy runtime active. **No GA-readiness claim; no vendor name introduced.** Verified gate-neutral (README not flagged by `ai-vendor-neutrality`; deterministic red count unchanged at 6). Architecture docs and ADRs were **not** touched (baseline-hashed / frozen).

## Phase 4 — Developer experience

**No safe change.** New validation/diagnostic commands risk implying runtime activation (explicitly disallowed) or colliding with the concurrent workstream's harness/proof races. Existing tooling (`build`/`test`/`govern`/`verify`) is sufficient and healthy. None added.

## Phase 5 — Operational readiness (present vs missing)

| Item | Present? |
|---|---|
| Deployment manifests (`deploy/Dockerfile`, `deploy/azure/containerapp.yaml`) | ✅ present |
| Configuration matrix / env templates | ✅ present (ADR-0052 §5) |
| Health + readiness endpoints (`packages/observability/src/health.ts`, R-23.30) | ✅ present |
| Observability / logging / metrics / correlation IDs | ✅ present (`packages/observability`; traceId/correlationId threaded) |
| **Container runtime (E-2)** | ❌ **MISSING (external)** |
| **Reachable Execution Plane** | ❌ **MISSING (customer)** |
| **Bound ADR-0050 runtime ports** | ❌ **MISSING (needs infra)** |

Everything buildable-in-reference for future activation is already present; the gaps are exclusively external (E-2, EP, port-binding) — unchanged from ADR-0051/0052/0054.

## Phase 6 — Technical debt

**Safely actionable today: essentially none beyond the README correction.** Every "duplicate helper / obsolete abstraction / unused utility" candidate is load-bearing for a named gate, frozen by an ADR/baseline, legacy-protected, or concurrent-owned. Known debt that is **not** safely actionable here (owned / gated, recorded for its owner): ADR-0052 template normalization (mine — but "do not modify ADR decisions" applies here), ADR-0037 template (its owner), harness stabilization (tooling owner), and the concurrent `programme-closure` baseline reconciliation (ADR-0060 workstream). None resolved here.

## Phase 7 — Final report

**Completed improvements:** (1) `README.md:5` status banner corrected to reflect the true programme state — the sole gate-neutral, non-legacy, non-concurrent improvement available.

**Blocked improvements:** all engine-structure consolidation, FTE-module trimming, and "dead export" removal — load-bearing for named gates or frozen by ADRs/baseline.

**External dependencies:** E-2 container runtime, reachable Execution Plane, bound ADR-0050 ports — none present; all owned outside the repository.

**Governance constraints honoured:** RC-3 not bypassed; no frozen contract/ADR modified; no entry point rerouted; no legacy removed; deterministic red baseline unchanged (6); no GA claim.

**Future activation prerequisites:** provision E-2 → connect a reachable Execution Plane → bind the ADR-0050 ports → M4.5 → behavioural equivalence → M5 cut-over (ADR-0049 §6). All external / separately authorised.

## Outcome

Repository quality and documentation currency were improved by one proven-safe change; build health was already clean; technical debt was reduced where safe (README). No governance rule was violated, no runtime activation was claimed, no legacy runtime was removed, and no production execution path was altered.

**Beyond the README correction, no further repository improvements are possible until external infrastructure prerequisites are satisfied** — every remaining candidate is load-bearing for a governance gate, frozen by an ADR or the closure baseline, legacy-protected, or owned by the concurrent workstream. GA remains NOT CERTIFIED; the legacy runtime remains active and recoverable.
