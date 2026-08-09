# 06 — AI Tenant Isolation

The architecture treats AI isolation as one of the two most-often-missed dimensions ([07 §4](../../docs/architecture/07-tenant-isolation.md), dimension 8) and records **RR-5** — *cross-tenant inference through the knowledge graph, presumed prohibited until AD-020* ([22 §6](../../docs/architecture/22-security-threat-model.md)). This review finds the **prompt boundary clean** and the **knowledge/retrieval boundary breached**.

## What is COMPLIANT — prompt construction

AI context fed to a model is assembled **only from the current request's own data**:
- `execute()` builds context from `request.proposals` only — e.g. [discovery orchestrators.ts:675](../../packages/discovery-flow-engine/src/orchestrators.ts#L675) (`gateProposals(mode, proposalsFrom(request.proposals ?? {}))`); identical across engines.
- `AgentContext.proposal` is a per-run input ([agent.ts:124](../../packages/capability-framework/src/agent.ts#L124)); no shared corpus, few-shot store, or cross-tenant retrieval feeds a prompt.
- A **registration-time sovereignty gate** rejects any agent whose prompt contract would send source/credentials/evidence: `FORBIDDEN_IN_PROMPT` ([agent.ts:137-141](../../packages/capability-framework/src/agent.ts#L137-L141)), enforced against every `promptContract.inputsProvided` at `register()` ([agent.ts:199-202](../../packages/capability-framework/src/agent.ts#L199-L202)). Some contracts even reject summaries that *name a customer system by content* ([security-testing intelligence-layer.ts:73,234](../../packages/security-testing-engine/src/agents/intelligence-layer.ts#L73)).

Prompt-injection control flow (C-08.14, P-16/17) is structurally neutralised: models cannot select tools or compute verdicts; gates are deterministic (INV-4). **C-07.8 is met *for the prompt-assembly path.***

## What DEVIATES — the shared knowledge graph (L1)

The leak is not in the prompt; it is in the **`VectorMemory` recall path**, which surfaces into deterministic code and reports.

### The store has no tenant dimension
[capability-framework/src/vector.ts](../../packages/capability-framework/src/vector.ts):
- `VectorIndex` backing store is a bare array with no tenant field — [:125](../../packages/capability-framework/src/vector.ts#L125); `VectorRecord` [:102-108](../../packages/capability-framework/src/vector.ts#L102-L108) has none.
- `search()` filters by `kind` only, never tenant — [:140-149](../../packages/capability-framework/src/vector.ts#L140-L149).
- `VectorMemory.remember()` / `recall()` take **no tenant argument** — [:188-195](../../packages/capability-framework/src/vector.ts#L188-L195). The header describes it as accumulating "across runs" by design.

### It is a long-lived field on a multi-tenant orchestrator
One `VectorMemory` instance per orchestrator, while `execute(request)` takes a per-call `tenantId` — proof the instance serves many tenants:

| Engine | field | passes `this.memory` unscoped |
|---|---|---|
| discovery | [orchestrators.ts:643](../../packages/discovery-flow-engine/src/orchestrators.ts#L643) | [:682](../../packages/discovery-flow-engine/src/orchestrators.ts#L682) |
| performance | [orchestrators.ts:543](../../packages/performance-engine/src/orchestrators.ts#L543) | [:589](../../packages/performance-engine/src/orchestrators.ts#L589) |
| penetration | [orchestrators.ts:389](../../packages/penetration-testing-engine/src/orchestrators.ts#L389) | [capability.ts:379](../../packages/penetration-testing-engine/src/capability.ts#L379) |
| functional | [orchestrators.ts:647](../../packages/functional-testing-engine/src/orchestrators.ts#L647) | via runtime |
| dev-change | [orchestrators.ts:558](../../packages/dev-change-engine/src/orchestrators.ts#L558) | via runtime |

### Concrete write → recall leak (penetration engine)
- **Write:** [penetration sync-reporting-learning.ts:402](../../packages/penetration-testing-engine/src/agents/sync-reporting-learning.ts#L402) — `remember('finding', a.finding.id, "<category> <targetPath>", { fingerprint })`.
- **Recall:** [penetration intelligence.ts:377,391,404](../../packages/penetration-testing-engine/src/agents/intelligence.ts#L377) — `recall('finding', "<category> <targetPath>", 1, 0.6)` matches tenant B's finding path against **every** tenant's remembered finding vectors; a hit returns **another tenant's finding id + fingerprint + similarity**, flowing into B's recurring/novel counts and repository matches in B's report.
- Similar writes: discovery journeys/rules/entities [execution-and-outcome.ts:881-883](../../packages/discovery-flow-engine/src/agents/execution-and-outcome.ts#L881-L883); functional [automation-execution-healing.ts:723](../../packages/functional-testing-engine/src/agents/automation-execution-healing.ts#L723).

### Blast radius
Mitigated: **raw source text is never stored** — only hashed vectors ([vector.ts:89,128](../../packages/capability-framework/src/vector.ts#L89)). Not mitigated: **identifiers, fingerprints, provenance labels, and cross-tenant similarity signal** do cross. Under [07 dimension 9](../../docs/architecture/07-tenant-isolation.md) and RR-5, cross-tenant knowledge edges are **presumed prohibited** — this is a direct deviation, and there is **no test** asserting cross-tenant isolation of this store (unlike storage/mTLS/metrics, which are tested).

## The safe counter-example — security-testing engine
`SecurityTestingOrchestrator` holds **no `VectorMemory` and no `state` map** ([orchestrators.ts:425-459](../../packages/security-testing-engine/src/orchestrators.ts#L425-L459); `auditTrailFor` returns `[]` at [:458](../../packages/security-testing-engine/src/orchestrators.ts#L458)). Its knowledge graph is rebuilt per-run from the current request's facts ([intelligence-layer.ts:39-56](../../packages/security-testing-engine/src/agents/intelligence-layer.ts#L39-L56)), and predictive history is **injected per-request** as `deps`-supplied `HistoricalFinding[]` ([orchestrators.ts:293](../../packages/security-testing-engine/src/orchestrators.ts#L293)). **This is the pattern the other five must adopt.**

## Verdict

| Requirement | Status |
|---|---|
| C-07.8 — no cross-tenant AI context (prompt) | **COMPLIANT** |
| C-07.8 — no cross-tenant retrieval (knowledge recall) | **IMPLEMENTATION DEVIATION** (L1) |
| Dimension 9 — per-tenant knowledge subgraph | **IMPLEMENTATION DEVIATION** (5 of 6 engines) |
| RR-5 — cross-tenant inference prohibited | **VIOLATED in practice** by shared `VectorMemory` |

**Minimum fix (no redesign):** give `VectorIndex`/`VectorMemory` a mandatory tenant dimension — partition by `tenantId`, thread it through `remember`/`recall`/`search`, fail closed like `TenantPaths` — or adopt the security-engine's construct-per-run pattern platform-wide. Then add the cross-tenant knowledge-isolation test that today exists for storage/metrics but is absent here.
