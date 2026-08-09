# Security Testing Engine — capability 5 of 6

**Package:** `@dbiz/security-testing-engine` · **Decision:** [ADR-0028](../adr/ADR-0028-security-testing-engine-internal-structure.md) · **Impact:** [analysis](../../program/SECURITY_TESTING_ENGINE_IMPACT_ANALYSIS.md)

*Answers document 11 §2: **"Does it satisfy its security requirements?"***

---

## What it is

The canonical implementation of capability 5, built as internal structure over the one twelve-stage orchestration lifecycle. It **verifies** — read-only, deterministically, requirement-first — that an application's security controls are present and correct. It is **not** an adversarial scanner: active exploitation is capability 6, the [Penetration Testing Engine](../adr/ADR-0027-penetration-testing-engine-internal-structure.md).

## The twelve stages

| # | Stage | Plane | What the Security Testing Engine does |
|---|---|---|---|
| 1 | planning | IP | Validate scope; elicit security requirements from ASVS, OWASP Top 10, OWASP API Top 10, SDL, privacy and AI practice |
| 2 | discovery | **EP** | Inventory resources: endpoints, headers, cookies, TLS, dependencies, IaC, containers, Kubernetes, cloud, secrets, source, auth, privacy, AI config |
| 3 | context | EP→IP | Minimise observations to security facts — the single structure-only crossing |
| 4 | architecture-review | IP | **Security Requirement Model** — trust boundaries, assets, in-scope categories, exposure *(governance triad)* |
| 5 | policy-review | IP | **Verification Authorization** — select categories, apply ASVS level, reject intrusive *(governance triad)* |
| 6 | guardrail-review | IP | **Verification Guardrails** — read-only, no-intrusive, authorization, scope, production *(governance triad)* |
| 7 | execution-planning | IP | Assemble the verification campaign |
| 8 | execution | **EP** | Run the read-only checkers — deterministic, no reasoning required |
| 9 | evidence | **EP** | Capture evidence by reference; hashes and locators cross, snippets do not |
| 10 | reflection | IP | Assess (CVSS, priority, false positives), map compliance (12 frameworks), remediate, score posture, learn |
| 11 | certification | IP | Security certification |
| 12 | reporting | IP | Publish through the adapter; render executive and board reports |

**No checker runs before the guardrail stage certifies.**

## Coverage (verification scope)

| Domain | Checks |
|---|---|
| Application | SAST patterns, security headers, CORS, CSP, cookie flags |
| Dependency | Known-CVE dependencies (SCA) |
| Secrets | Exposed secret material |
| Crypto | TLS configuration, certificate validity |
| Infrastructure | IaC misconfiguration, container hardening, Kubernetes policy, cloud baseline |
| Identity | Authentication, authorization, session configuration |
| Privacy | Data-protection / PII controls |
| AI | LLM guardrail configuration |

**Compliance mapping:** OWASP ASVS, OWASP Top 10, OWASP API Top 10, NIST 800-53, CIS Benchmarks, PCI-DSS, SOC 2, ISO 27001, HIPAA, GDPR, Azure Security Benchmark, CSA CCM.

## The capability-5/6 boundary

Adversarial, intrusive categories — SQL injection, XSS, SSRF, command injection, attack chains, MITRE exploitation — belong to capability 6. A request for one here is **refused at the guardrail stage before any checker runs** (`INTRUSIVE_CATEGORIES`, conformance P-9). Capability 5 coordinates and consumes; it does not re-scan.

## AI-optional

`sectest.aiEnabled` is translated onto the capability-neutral `ai.enabled`. 142 of 143 agents are wholly deterministic; the one reasoning agent (false-positive reduction) proposes, and its own code decides — it never suppresses a confirmed weakness. With reasoning disabled the engine completes and certifies unchanged (INV-7).

## Sovereignty

`ObservedResource` / `RawWeakness` (content) never leave the Execution Plane. `SecurityFact` (attribute names) and `Weakness` / `EvidenceReference` (hash + locator) are the only things that cross, through exactly two functions — `minimiseFact` and `minimiseWeakness`.

## Scale (measured)

143 agents (107 domain + 36 governance) · 17 domains · 1 master + 16 domain orchestrators · 18 checkers · 12 compliance frameworks · 36 EP / 107 IP · 142 deterministic / 1 reasoning · 11 conformance tests · 1 standalone gate (green).

## Verification

```sh
pnpm --filter @dbiz/security-testing-engine build
pnpm --filter @dbiz/security-testing-engine test          # 11 conformance tests
node governance/verification/verify-sectest-conformance.js # standalone gate, exits 0
```

Registration of the gate in `run-all.js` and the closure re-baseline are a deliberate, human-reviewed step (ADR-0028 §5), deferred while a concurrent capability build shares the working tree.

---

## The Security Intelligence Layer ([ADR-0029](../adr/ADR-0029-security-intelligence-layer-and-platform-intelligence-boundary.md))

Above the verification engine, capability 5 turns findings into enterprise intelligence — **internal structure in Reflection (10), Certification (11) and Reporting (12)**, all Intelligence Plane, no new stage or capability.

| Intelligence | Stage | Output |
|---|---|---|
| Security Knowledge Graph | 10 | one connected graph of facts, weaknesses, requirements, controls, assets and risks, with centrality |
| Risk Correlation Engine | 10 | isolated findings correlated into enterprise risks (identity, supply-chain, browser, data, infra, crypto, privacy, AI) |
| Business Context Engine | 10 | technical severity → business severity, config-driven |
| Attack Surface Intelligence | 10 | structural attack graph — entry points, trust boundaries, API graph, data & secrets flows (read-only) |
| Developer Intelligence | 10 | root cause, secure-coding guidance, CWE/OWASP, patch, regression test, prevention per finding |
| Predictive Security | 10 | hotspots, regression probability, trending categories from IP-supplied history |
| Security Certification Engine | 11 | per-domain scores, maturity level (1–5), readiness, certification status |
| Executive Intelligence | 12 | top risks, KPIs, security debt, cost of risk, recommendations, board narrative |

**The capability-5 / Platform-Intelligence boundary.** Cross-capability correlation and the single **enterprise risk score across all six capabilities** are **not** here — that is the Platform Intelligence service (doc 24). Capability 5 emits a `SecurityIntelligenceContribution` (scores and identifiers only; `aggregatesOtherCapabilities: false`) that the service consumes alongside the other five capabilities. Conformance P-11.b asserts the boundary.

**AI-optional, end to end.** Only four intelligence agents declare a reasoning class, each with a deterministic degraded path; the whole layer — graph, correlation, certification, contribution — runs with reasoning disabled (P-11.n, INV-7).

Measured: 164 agents (128 domain + 36 governance) across 26 domains; a run produces a 67-node / 196-edge graph and correlated enterprise risks; 14 conformance tests; standalone gate exits 0.
