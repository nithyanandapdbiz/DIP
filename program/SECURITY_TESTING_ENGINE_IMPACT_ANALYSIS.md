# Security Testing Engine — impact analysis

**Date:** 2026-07-23 · **Decision:** [ADR-0028](../docs/adr/ADR-0028-security-testing-engine-internal-structure.md)
**Package:** `@dbiz/security-testing-engine` (capability 5 of 6)

---

## 1. What was asked, and what was found

The brief asked for a world-class **Security Testing Engine** — equal to or exceeding Burp Suite Enterprise, Invicti, Acunetix, Checkmarx, Veracode, Fortify, Snyk, Contrast, Microsoft Defender, Wiz and Prisma Cloud — as a first-class platform capability, AI-optional, configuration-driven, reusing every existing engine, with no architectural change.

Establishing repository state first produced findings identical in kind to the four engine briefs before it:

| # | Finding | Evidence |
|---|---|---|
| **1** | **The name is already canonical, and it is capability 5.** | [11 §2](../docs/architecture/11-capability-model.md) |
| **2** | **This is the first implementation of capability 5**, not a replacement. | No prior source referenced it; no `packages/security-testing-engine/` existed. |
| **3** | **Much of the brief's scope is capability 6, already built.** Adversarial exploitation (SQLi, XSS, SSRF, attack chains, MITRE) is the Penetration Testing Engine. | [ADR-0027](../docs/adr/ADR-0027-penetration-testing-engine-internal-structure.md) |
| **4** | **The twenty-plus domains and forty-plus steps are a second lifecycle**, and the linear list omits the governance triad. | R-12.1, R-12.2, R-12.18 |

The resolution and its reasoning are in ADR-0028. What was produced is the working engine those findings require: **143 agents across seventeen domains, mapped onto the twelve frozen stages, verification-scoped and bounded against capability 6, built and proven by execution — no stubs.**

## 2. The scope boundary against capability 6, and how it is enforced

Capability 5 answers *"does it satisfy its security requirements?"* — it **verifies**, read-only, that controls are present and correct. Capability 6 answers *"can it be compromised?"* — it **exploits**, adversarially. The brief blended both; building the adversarial half here would duplicate the built Penetration Testing Engine, which the brief itself forbids.

The boundary is enforced structurally, not by convention. An intrusive request (`INTRUSIVE_CATEGORIES`: SQL injection, XSS, SSRF, command injection, attack-chain, …) is detected at scope, rejected at authorization, and **refused at the guardrail stage before the execution stage** — proven by conformance property P-9: an SQL-injection request fails at `guardrail-review` with three blocking findings and never completes `execution`.

## 3. AI vs Non-AI behaviour matrix

One workflow; only reasoning changes. 142 of 143 agents are wholly deterministic; one — `assessment.false-positive` — declares a reasoning class with a prompt contract and a deterministic degraded path.

| Stage | Non-AI (deterministic) | AI-enabled (enrichment only) |
|---|---|---|
| Requirement elicitation | ASVS/OWASP/SDL/privacy/AI seed catalogues | unchanged |
| Verification Authorization / Guardrails | rule-based selection and refusal | unchanged |
| Checkers (execution) | pattern/config detection, evidence-based | unchanged |
| Assessment | **CVSS equations**, deterministic priority/SLA | + false-positive suppression *proposals*, each validated |
| Compliance | static mapping across 12 frameworks | unchanged |
| Remediation | category-templated fixes, owners, effort | + reasoning-enriched hints (deterministic fix kept) |
| Posture / Reporting | deterministic scores, NOT MEASURED honesty | + executive narrative (rejected if it overstates) |

Proven by conformance P-8: the disabled run delivers **zero** proposals (143 withheld) and still completes and certifies (INV-7).

## 4. EP / IP ownership matrix

| Concern | Plane | Where |
|---|---|---|
| Resource inventory, checker execution, evidence capture, target content | **Execution Plane** | 36 EP agents (stages 2, 8, 9) |
| Requirement elicitation, Security Requirement Model, authorization, guardrails, assessment, compliance, remediation, posture, learning, governance, certification, reporting | **Intelligence Plane** | 107 IP agents |
| The crossing | `minimiseFact` (facts) and `minimiseWeakness` (weaknesses) | one function each |

`ObservedResource` (values) and `RawWeakness` (snippet) never leave the EP — the compiler enforces it. `SecurityFact` carries attribute names only; `Weakness` and `EvidenceReference` carry no content field. Conformance P-7.s and P-7.w assert it.

## 5. Runtime completeness

Every orchestrator and agent participates in a real run — no dormant components.

- **Master orchestrator:** 1 · **Domain orchestrators:** 17 · **Agents:** 143 (107 domain + 36 governance)
- **Verification checkers:** 18 (application, dependency, identity, crypto, infrastructure, privacy, AI)
- **Compliance frameworks mapped:** 12 (ASVS, OWASP Top 10, OWASP API, NIST, CIS, PCI-DSS, SOC2, ISO 27001, HIPAA, GDPR, Azure Benchmark, CSA)
- **11 conformance unit tests pass; the standalone conformance gate exits 0.**

## 6. Reuse of existing platform (no duplication)

| Existing capability | How capability 5 reuses it |
|---|---|
| One orchestration lifecycle (`@dbiz/capability-framework`) | The twelve stages, the sealed stage result, the four-phase pipeline, the agent catalogue, the reasoning gate, the adapter SPI — all reused, none reimplemented |
| Governance triad | Expressed as Security Requirement Model / Verification Authorization / Verification Guardrails; the framework's `runPhase` gates every stage |
| Bug / Test-Management / Reporting / Certification | These are *stages* of the shared lifecycle (10, 11, 12) and the `SecurityAdapter` SPI, not new engines |
| Discovery (capability 3) | The inventory stage is the same EP-observation pattern; findings feed the shared reporting and sync |
| AI operating model (ADR-0016) | `sectest.aiEnabled` → capability-neutral `ai.enabled`; no provider named |

## 7. Impact on the certified baseline

| Assertion | Result |
|---|---|
| 25 Architecture Documents | **unchanged** — none modified (P-10.a) |
| ADRs | **+1** — ADR-0028 added (a new file; no ADR superseded) |
| 6 Capability Architecture | **6** — verified by reading document 11 during the run (P-10) |
| EP/IP ownership | **preserved** — 36 EP / 107 IP, checkers and evidence in the EP |
| Governance | **preserved** — one standalone gate built (green); none relaxed |
| Data sovereignty | **preserved** — facts and weaknesses cross by reference only; the crossing types carry no content field |
| Provider-agnostic | **preserved** — one workflow, two providers, no provider name in orchestration (P-5.n) |
| Architectural / governance drift | **none** — no `docs/architecture/` file modified, no gate removed or relaxed |

**Deliberately deferred, not silently performed:** registering `verify-sectest-conformance.js` in `run-all.js` and re-baselining closure (ADR-0028 §5). Both are additionally deferred because a concurrent capability build (the Performance Engine) shares the working tree, and freezing a tree another author is actively writing is the failure the closure gate exists to prevent.

## 8. Expected outputs — where each lives

| # | Deliverable | Location |
|---|---|---|
| 1 | Security Testing Engine | `packages/security-testing-engine/` |
| 2 | Domain model + sovereignty types | `src/model.ts` |
| 3 | Master + 16 domain orchestrators | `src/orchestrators.ts` |
| 4 | Agent catalogue (143) | `src/agents/` |
| 5 | Verification checkers (18) | `src/agents/verification.ts` |
| 6 | Compliance mapping (12 frameworks) | `src/agents/intelligence.ts` |
| 7 | Adapter SPI | `src/adapters.ts` |
| 8 | Capability assembly (12 stages) | `src/capability.ts` |
| 9 | Conformance tests (11) | `test/conformance.test.ts` |
| 10 | Conformance scenario + gate | `governance/capability/run-sectest-conformance.mjs` · `governance/verification/verify-sectest-conformance.js` |
| 11 | Architecture decision | `docs/adr/ADR-0028-security-testing-engine-internal-structure.md` |
| 12 | Capability documentation | `docs/capability/SECURITY-TESTING-ENGINE.md` |

---

*The brief asked for the most advanced security engine ever designed for an enterprise QA platform, with no drift. The honest deliverable is the built engine — 143 agents, 11 passing tests, a green conformance gate — mapped onto the twelve frozen stages it was required to preserve, verification-scoped so it does not duplicate the Penetration Testing Engine, with the governance triad the linear brief omitted made explicit, and the closure re-baseline left for review rather than performed in silence.*

---

## 9. Update — the Security Intelligence Layer ([ADR-0029](../docs/adr/ADR-0029-security-intelligence-layer-and-platform-intelligence-boundary.md))

A follow-on brief asked to evolve capability 5 into an enterprise Security Intelligence platform. It was built as **internal structure in stages 10 (Reflection), 11 (Certification) and 12 (Reporting)** — nine new Intelligence-Plane domains, no framework/EP/governance/capability-count change:

| # | Intelligence | Stage |
|---|---|---|
| 1 | Security Knowledge Graph (correlate every entity; centrality) | 10 |
| 2 | Risk Correlation Engine (findings → enterprise risks, by rule) | 10 |
| 3 | Business Context Engine (technical → business severity) | 10 |
| 4 | Attack Surface Intelligence (structural, read-only) | 10 |
| 5 | Developer Intelligence (root cause, patch, regression per finding) | 10 |
| 6 | Predictive Security (hotspots, regression probability — IP-supplied history) | 10 |
| 7 | Security Certification Engine (domain scores, maturity, readiness, status) | 11 |
| 8 | Executive Intelligence (top risks, KPIs, security debt, cost of risk) | 12 |

**The boundary held.** Items 9–10 of that brief (Cross-Capability Correlation and a Unified Enterprise Risk score across all six capabilities) were **not** built inside capability 5 — that is the **Platform Intelligence** service (doc 24, [ADR-0018](../docs/adr/ADR-0018-platform-services-and-programme-instruments.md), R-13.6). Capability 5 emits a `SecurityIntelligenceContribution` (scores and identifiers only, `aggregatesOtherCapabilities: false`) that the service consumes alongside the other five. Building the aggregator in capability 5 would consume capability 6's attack evidence and reach across the capability boundary — the overlap the brief forbids.

**Measured after the evolution:** 164 agents (128 domain + 36 governance) across 26 domains; the run produces a 67-node / 196-edge knowledge graph, 7 correlated enterprise risks, and a certification with a maturity level; **14 conformance tests pass**; the standalone gate exits 0 and now proves the intelligence layer (P-11), the Platform-Intelligence boundary (P-11.b) and INV-7 across the layer (P-11.n). AI-optional is preserved: the layer runs fully with reasoning disabled.
