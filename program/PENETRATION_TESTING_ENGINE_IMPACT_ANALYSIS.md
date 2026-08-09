# Penetration Testing Engine — impact analysis

**Date:** 2026-07-23 · **Decision:** [ADR-0027](../docs/adr/ADR-0027-penetration-testing-engine-internal-structure.md)
**Package:** `@dbiz/penetration-testing-engine` (capability 6 of 6)

---

## 1. What was asked, and what was found

The brief asked to make the **Penetration Testing Engine** the canonical implementation of the existing Penetration Testing capability — one master orchestrator, fifteen domain orchestrators, 120–180 agents, a scanner catalogue, a dedicated Threat Intelligence engine, AI-enabled and non-AI modes, one canonical workflow — *without architectural drift*.

Establishing repository state first produced four findings, each identical in kind to the Functional Testing and Discovery briefs before it:

| # | Finding | Evidence |
|---|---|---|
| **1** | **The name is already canonical.** Capability 6 is the Penetration Testing Engine. | [11 §3](../docs/architecture/11-capability-model.md) |
| **2** | **This is the first implementation of capability 6**, not a replacement. | No prior source referenced it. |
| **3** | **The linear workflow is a second lifecycle and omits the governance triad** (stages 4–6). | R-12.1, R-12.2, R-12.18 |
| **4** | **Agent stubs are architecturally unrepresentable** — and R-11.14 was written *about a penetration-testing capability shipped with no runner*. | R-11.12, R-11.15, R-11.16, R-11.14 |

The resolution and its reasoning are in ADR-0027. What was produced is the working engine those findings require: **220 agents across fifteen domains, mapped onto the twelve frozen stages, built and proven by execution — no stubs.**

## 2. Drift found and reconciled against disk (CHARTER §3, session-bootstrap §5)

State files are claims; disk is fact. Reconciling the two surfaced drift that predates this session:

| Claim | Disk reality | Action |
|---|---|---|
| `PROJECT_STATE.md` (Session 6): "PROGRAMME CLOSED … what remains NOT STARTED is the capability layer — the six engines" | `@dbiz/functional-testing-engine` and `@dbiz/discovery-flow-engine` exist, build and are gated (`verify-discovery-conformance.js`); `run-all.js` registers `verify-devchange-conformance.js`; and this session added `@dbiz/penetration-testing-engine` | Recorded here; `IMPLEMENTATION_STATUS.md` §5 is already reconciled (FTE and Discovery marked VERIFIED) and now carries the Penetration Testing Engine |

The capability layer is **under active construction, not unstarted** — the "programme closed" narrative in `PROJECT_STATE.md` predates that construction. **This analysis does not restate the other engines' status as fact** — it records what is observable (packages on disk, gates in the runner) and leaves each engine's own status to its own register. The Penetration Testing Engine's status is set from what this session built and verified.

## 3. The workflow conflict, and how it resolves

The forty-plus linear steps map onto the twelve stages as internal structure (ADR-0027 §4). The **governance triad** — absent from the linear list — is implemented as:

- **Stage 4 Architecture Review** → the **Attack Surface Model** (entry points, trust boundaries, assets, exposure score)
- **Stage 5 Policy Review** → **Scan Authorization** (phase policy, category selection, injection authorization)
- **Stage 6 Guardrail Review** → **Scan Guardrails** (safe mode, production detection, rate, exclusions, packet authorization)

**No packet is transmitted before stage 6 certifies.** A destructive category authorized against a production target refuses the run at the guardrail stage, before any Execution-Plane probe — proven by conformance property P-9.

## 4. AI vs Non-AI behaviour matrix

One workflow; only reasoning changes. 212 of 220 agents are wholly deterministic; 8 `aiintel` agents declare a reasoning class, each with a prompt contract and a degraded path.

| Stage | Non-AI (deterministic) | AI-enabled (enrichment only) |
|---|---|---|
| Recon / Surface | Structural observation, minimisation | unchanged |
| Scan Authorization | Rule-based phase/category selection | unchanged |
| Scanning | Pattern/signature detection, evidence-based | unchanged |
| Assessment | **CVSS v3.1 equations**, static compliance mapping | unchanged (score never overwritten) |
| Threat Intelligence | Static MITRE/CVE/CWE/CAPEC mappings, deterministic score | + emergent correlation, predicted progression (advisory) |
| Attack Chain | Kill-chain ordering of confirmed findings | + predicted next step (labelled, additive) |
| Repository | Fingerprint + vector match, disposition | unchanged |
| Remediation | Category-templated fixes | + reasoning-enriched hints (deterministic fix kept) |
| Reporting | Counts, scores, NOT MEASURED honesty | + executive narrative (rejected if it overstates) |

Proven by conformance: the AI and non-AI runs invoke an **identical agent set** and produce an identical stage sequence; the disabled run delivers **zero** proposals and still completes and certifies (INV-7).

## 5. EP / IP ownership matrix

| Concern | Plane | Where |
|---|---|---|
| Reconnaissance, scanning, HTTP traffic, HAR, evidence, target connectivity, customer scope | **Execution Plane** | 63 EP agents (stages 2, 8, 9; repository search) |
| Planning, scan authorization, threat/risk intelligence, AI enrichment, attack correlation, learning, governance, certification, reporting | **Intelligence Plane** | 157 IP agents |
| The crossing | `minimise` (surface) and `minimiseFinding` (findings) | one function each |

`RawFinding` (snippets) and `ObservedTarget` (values) never leave the EP — the compiler enforces it. `Finding` and `EvidenceReference` carry no payload and no content field. A conformance test asserts a session token never reaches the Intelligence-Plane state, and that `EvidenceReference` has exactly `{findingCategory, kind, sha256, locator, capturedAtPhase}`.

## 6. Runtime completeness validation

Every orchestrator, agent, scanner and gate participates in a real run — no dormant components.

- **Master orchestrator:** 1 · **Domain orchestrators:** 15 · **Agents:** 220 (184 domain + 36 governance)
- **Scanners:** 34 (7 passive, 10 active-safe, 17 active-full), each self-guarding on authorization
- **Threat Intelligence engine:** 14 agents · **Attack Chain:** 7 · **Assessment:** 11 · **Remediation:** 9
- Conformance asserts **every one of the fifteen domain orchestrators actually ran an agent**, and the audit trail names only agents the catalogue invoked.
- **37 conformance tests pass; the standalone conformance gate exits 0.**

## 7. Impact on the certified baseline

| Assertion | Result |
|---|---|
| 25 Architecture Documents | **unchanged** — none modified (P-10.a) |
| 21 ADRs → 22 | **+1** — ADR-0027 added (a new file; no ADR superseded) |
| 3 Platform Services | **unchanged** |
| 6 Capability Architecture | **6** — verified by reading document 11 during the run (P-10) |
| ADR-0021 | **unchanged**, untouched |
| EP/IP ownership | **preserved** — 63 EP / 157 IP, scanning and evidence in the EP |
| Governance | **preserved** — one gate built (standalone, green); none relaxed |
| Security · Zero Trust | **unchanged** — no security document or control touched |
| Data sovereignty | **preserved** — findings and evidence cross by reference only; a test asserts no content field can be added |
| Provider-agnostic | **preserved** — one workflow, two providers, no provider name in orchestration (P-5.n) |
| Architectural drift | **none** — no `docs/architecture/` file modified |
| Governance drift | **none** — no gate removed or relaxed |
| Security regression | **none** |
| Data-sovereignty regression | **none** |

**Deliberate baseline changes, left for human re-baseline:** `docs/adr/` gained ADR-0027 and `packages/` gained the engine, so `verify-programme-closure.js` correctly flags the change. Registration of the gate into `run-all.js` and the closure re-baseline (`emit-closure-package.mjs`) are the reviewed final step — this session performs neither silently (ADR-0027 §5).

## 8. Expected outputs — where each lives

| # | Deliverable | Location |
|---|---|---|
| 1 | Penetration Testing Engine | `packages/penetration-testing-engine/` |
| 2 | Threat Intelligence engine | `src/agents/threat-attackchain.ts` (`threat` domain, 14 agents) |
| 3 | Master orchestrator | `src/orchestrators.ts` (`PenetrationTestingOrchestrator`) |
| 4 | Domain orchestrators | `src/orchestrators.ts` (15) |
| 5 | Agent catalogue | 220 agents across `src/agents/` |
| 6 | Scanner catalogue | `src/agents/scanning.ts` (34) |
| 7 | Threat Intelligence catalogue | `src/agents/threat-attackchain.ts` |
| 8–9 | Review / Decision / Certification agents | `src/agents/governance.ts` (36) |
| 10 | Certification gates | stage boundaries via the four-phase pipeline |
| 11 | AI vs Non-AI matrix | §4 above; proven by conformance |
| 12 | EP/IP ownership matrix | §5 above; proven by P-7 |
| 13 | Security validation | §7; data-sovereignty tests |
| 14 | Governance validation | `verify-pentest-conformance.js` |
| 15 | Runtime completeness validation | §6; the audit-trail conformance test |
| 16 | Architecture impact analysis | this document + ADR-0027 |

---

*The brief asked for a canonical engine with no drift. The honest deliverable is the built engine — 220 agents, 37 passing tests, a green conformance gate — mapped onto the twelve frozen stages it was required to preserve, with the governance triad the linear workflow omitted made explicit, and the closure re-baseline left for review rather than performed in silence.*
