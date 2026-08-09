# ADR-0029 — The Security Intelligence Layer is internal structure of capability 5; cross-capability enterprise risk is the Platform Intelligence service, not capability 5

**Status:** ACCEPTED · **Date:** 2026-07-23

## 1. Problem

A brief asked to evolve capability 5 (the Security Testing Engine) into "the world's most advanced Security Intelligence Platform" — a Security Knowledge Graph, a Risk Correlation Engine, a Business Context Engine, Attack Surface Intelligence, a Security Certification Engine, Executive Intelligence, Developer Intelligence, Predictive Security, **Cross-Capability Intelligence**, and a **Unified Enterprise Risk Engine** that aggregates all six capabilities into one score and a release decision — with no framework change, no EP/IP change, no governance change, and no overlap with capability 6.

Two questions had to be settled before a line was written: **where does this intelligence live in the twelve-stage lifecycle**, and **does a single enterprise risk score spanning all six capabilities belong inside capability 5**. This ADR records both.

## 2. Context

**The Security Intelligence Layer is not a new stage, engine or capability.** [Document 12](../architecture/12-capability-orchestration.md) R-12.18 fixes one lifecycle; [document 11](../architecture/11-capability-model.md) R-11.4 fixes six capabilities. Turning findings into intelligence is *reflection, certification and reporting* — stages 10, 11 and 12, all Intelligence Plane. So the layer is internal structure of capability 5's existing IP stages, exactly as the verification catalogue is internal structure of its execution stage (ADR-0028).

**The Execution Plane holds no intelligence, and this changes nothing there.** Every intelligence function operates on already-minimised artefacts — `Weakness`, `AssessedWeakness`, `SecurityFact`, `SecurityModel`. The EP still only observes and captures evidence. Predictive Security needs history; that history is supplied by the *Intelligence-Plane* knowledge base through `EngineDependencies.priorFindings`, never read from the EP.

**A unified enterprise risk score across all six capabilities is a Platform Service, not a capability.** [ADR-0018](ADR-0018-platform-services-and-programme-instruments.md) and [document 24](../architecture/24-platform-intelligence-model.md) already own this: **Platform Intelligence** consumes each capability's evidence and computes cross-cutting analytics, and R-13.6 states it "consumes evidence; it never manufactures it." A capability produces a certified verdict for *its own question* (R-11.1); it does not reach across the boundary to rule on the others. Building a cross-capability aggregator inside capability 5 would (a) make capability 5 consume capability 6's attack evidence — the overlap the brief itself forbids — and (b) recreate the "seventh-capability-by-natural-phrasing" trap ADR-0016 and ADR-0018 were written to prevent.

## 3. Alternatives

**Build a new "Security Intelligence" capability or engine.** Rejected: R-11.4, R-12.18, and the brief's own "not a new capability" instruction.

**Add a Security Intelligence stage to the lifecycle.** Rejected: R-12.18. Intelligence is reflection/certification/reporting, which already exist.

**Aggregate all six capabilities' risk inside capability 5 (the Unified Enterprise Risk Engine).** Rejected: R-11.1, R-13.6, ADR-0018 — that is the Platform Intelligence service. It would also make capability 5 consume capability 6's exploitation evidence, overlapping capability 6.

**Implement items 1–8 as internal IP structure in stages 10/11/12, and expose items 9–10 as a contribution the Platform Intelligence service consumes.** **Chosen.**

## 4. Decision

**Items 1–8 are internal structure of capability 5, in stages 10 (Reflection), 11 (Certification) and 12 (Reporting).** Nine new Intelligence-Plane domains — `knowledgegraph`, `riskcorrelation`, `businesscontext`, `attacksurface`, `developer`, `predictive`, `certification`, `executive`, `contribution` — run inside the already-gated stages. No stage, capability, framework or EP change; the count remains six and the lifecycle remains one.

| Intelligence | Stage | What it does |
|---|---|---|
| Security Knowledge Graph | 10 | Correlates facts, weaknesses, requirements, controls, assets and risks into one graph with centrality |
| Risk Correlation Engine | 10 | Turns isolated findings into enterprise risks by deterministic rule; reasoning may append emergent ones, never remove |
| Business Context Engine | 10 | Config-driven; translates technical severity into business severity |
| Attack Surface Intelligence | 10 | Structural attack graph (entry points, boundaries, flows) — read-only, NOT exploitation |
| Developer Intelligence | 10 | Root cause, guidance, CWE/OWASP, patch, regression test, prevention per finding |
| Predictive Security | 10 | Hotspots, regression probability, trending categories from IP-supplied history |
| Security Certification Engine | 11 | Per-domain scores, maturity level, readiness, certification status |
| Executive Intelligence | 12 | Top risks, KPIs, security debt, cost of risk, recommendations, board narrative |

**Items 9–10 are the Platform Intelligence service's, not capability 5's.** Capability 5 emits a `SecurityIntelligenceContribution` — its security risk score, top enterprise risks, certification and posture, carrying scores and identifiers only. The Platform Intelligence service (document 24) consumes it alongside the other five capabilities' contributions to compute the single enterprise risk score and release decision. The contribution declares `aggregatesOtherCapabilities: false` as a type-level statement of the boundary, and conformance property P-11.b asserts it.

**AI-optional is preserved end to end.** Of the layer's agents, only four declare a reasoning class (emergent correlation, fix narrative, executive summary, and one more), each with a prompt contract and a deterministic degraded path. With reasoning disabled the whole layer still runs — knowledge graph, correlation, certification and contribution — proven by conformance property P-11.n and by P-8 (INV-7).

**Sovereignty is unchanged.** The layer reads only minimised artefacts; nothing new crosses the boundary, and the `SecurityIntelligenceContribution` carries no customer content, so it is safe for a cross-boundary consumer.

## 5. Consequences

**Capability 5 grows from 143 to 164 agents (128 domain + 36 governance) across 26 domains, all within twelve stages.** The knowledge graph, correlation, certification and contribution are produced on every run and proven by execution: property P-11 shows a populated graph, correlated enterprise risks and a certification; P-11.b shows the contribution does not aggregate other capabilities; P-11.n shows the layer runs with reasoning disabled.

**No architecture document changes; no framework, EP/IP, governance or capability-count change.** The 25 frozen documents are untouched. Document 24 already describes the Platform Intelligence service that consumes the contribution; this ADR adds no topic to it.

**The cross-capability aggregator is explicitly out of scope here and left to the Platform Intelligence service.** That is a deliberate boundary, not an omission — building it inside capability 5 is the failure this ADR prevents.

**Gate registration and closure re-baseline remain deferred (ADR-0028 §5).** The standalone gate `verify-sectest-conformance.js` now also proves the intelligence layer and exits 0; registering it in `run-all.js` and re-baselining are the deliberate, human-reviewed step, still deferred while a concurrent capability build shares the working tree.

## 6. Migration strategy

Nothing migrates. The layer is additive internal structure over an already-built capability. Rollback is the removal of `intelligence-layer.ts`, `agents/intelligence-layer.ts`, the nine domains and the stage-10/11/12 additions; the verification engine underneath is unchanged and still passes its own suite. No consumer depends on the contribution yet; when the Platform Intelligence service consumes it, that is a new consumer of an emitted evidence type, not a migration of capability 5.

## 7. Version impact

No contract version changes. No architecture document version changes. No ADR is superseded; ADR-0028 stands and this ADR extends the same capability. `@dbiz/capability-framework` is unchanged — the layer adds no framework code, no new stage and no new SPI. The closure baseline hash will change when `docs/adr/` and `packages/` are admitted at the next deliberate re-baseline; that is recorded and deferred with the gate registration.

## 8. Affected components

- `docs/adr/ADR-0029-security-intelligence-layer-and-platform-intelligence-boundary.md` — **New**. This record.
- `packages/security-testing-engine/src/intelligence-layer.ts` — **New**. Deterministic builders and types for the Security Intelligence Layer, including the `SecurityIntelligenceContribution` seam.
- `packages/security-testing-engine/src/agents/intelligence-layer.ts` — **New**. The nine Intelligence-Plane domains' agents.
- `packages/security-testing-engine/src/orchestrators.ts` — **Modified**. Nine domain orchestrators added; `DOMAINS` and the registry extended.
- `packages/security-testing-engine/src/capability.ts` — **Modified**. Stages 10/11/12 run the layer; the catalogue registers its agents.
- `governance/verification/verify-sectest-conformance.js` — **Modified**. Proves the intelligence layer and the Platform-Intelligence boundary (P-11, P-11.b, P-11.n).
- `governance/capability/run-sectest-conformance.mjs` — **Modified**. The scenario exercises the layer.
- `docs/capability/SECURITY-TESTING-ENGINE.md` — **Modified**. Documents the Security Intelligence Layer.
- `program/SECURITY_TESTING_ENGINE_IMPACT_ANALYSIS.md` — **Modified**. Records the intelligence-layer evolution and the boundary.
