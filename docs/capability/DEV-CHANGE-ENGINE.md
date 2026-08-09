# Dev-Change Engine — Capability Catalogue and Architecture Impact Analysis

**Capability:** 2 of 6 · `dev-change-engine` · **Status:** BUILT / VERIFIED
**ADR:** [ADR-0024](../adr/ADR-0024-dev-change-engine-internal-structure.md)
**Package:** `@dbiz/dev-change-engine`
**Conformance gate:** `governance/verification/verify-devchange-conformance.js` — **22/22 properties PASS**, fault-proved

This document is the consolidated deliverable for the Dev-Change Engine. It answers the
sixteen expected outputs of the brief. It restates no architecture: where a topic is owned
by a frozen document, it is referenced, not copied (CHARTER §4).

---

## 1. What was built, and what was not

The Dev-Change Engine is the **first implementation of capability 2**, not a replacement —
[`IMPLEMENTATION_STATUS.md`](../../program/IMPLEMENTATION_STATUS.md) recorded it `NOT STARTED`
and disk agreed. It is built **inside the frozen twelve-stage lifecycle** (Document 12,
R-12.18), on the existing `@dbiz/capability-framework`. No architecture document was edited,
no capability was added, no second workflow was created.

The brief's forty-seven-step workflow is **internal structure of the twelve stages**
(ADR-0024 §3.1). The brief's two reasoning modes are **one workflow with proposals gated**,
not two code paths (ADR-0024 §3.2).

## 2. The canonical workflow → twelve frozen stages

| Stage | Plane | Canonical steps carried |
|---|---|---|
| 1 planning | IP | Repository Event · configuration · adapter resolution · change-set scope |
| 2 discovery | **EP** | Branch / PR / Commit discovery · Diff generation · Repository index · Existing-test discovery |
| 3 context | EP→IP | Repository Intelligence · **minimisation — the sole boundary crossing** |
| 4 architecture-review | IP | Change Intelligence · Dependency Intelligence |
| 5 policy-review | IP | Business Impact Analysis |
| 6 guardrail-review | IP | Risk Intelligence · Coverage Intelligence |
| 7 execution-planning | IP | Test Discovery · Repository Search · Automation Reuse · Generation · Enterprise Authoring |
| 8 execution | **EP** | Scoped, risk-first, dependency-ordered execution |
| 9 evidence | **EP** | Evidence capture — hashed, custody retained |
| 10 reflection | IP | Healing · Reflection · Root Cause · Defect Intelligence · Learning |
| 11 certification | IP | Governance Review · Release Certification |
| 12 reporting | IP | Synchronization · Executive Reporting |

Every stage runs **execute → review → decide → certify**; certification refusal is the only
exit (`runPhase` throws, no sealed result is produced, the run stops with the reason). Two
deviations from the brief's ordering are stated in ADR-0024 §5, both forced by the frozen
stage order.

## 3. Master orchestrator

`DevChangeEngineOrchestrator` (`src/orchestrators.ts`): receives the repository event, loads
tenant / AI / Dev-Change configuration, resolves five provider adapters, translates
`devchange.aiEnabled` onto the framework's capability-neutral `ai.enabled` (one line — C-11.11),
maintains execution state, and supports retry / resume / rollback / audit / certification. It
has **no stage list** — the framework runner is the only thing that can mint a sealed result.

## 4. Domain orchestrators (20 + governance)

`repository · diff · change · dependency · business · risk · coverage · testdiscovery ·
reuse · automation · authoring · execution · evidence · healing · reflection · rootcause ·
defect · learning · sync · reporting` — plus the cross-cutting `governance` orchestrator.
Each `coordinate()` **invokes** its domain's agents (never merely enumerates them); the
conformance suite asserts every domain contributed an observed invocation (V-14).

## 5. Agent catalogue — census

| Metric | Count |
|---|---|
| **Total agents** | **129** |
| Specialised / domain agents | 93 |
| Governance agents (review · decision · certification × 12 stages) | 36 |
| Execution-Plane agents | 31 |
| Intelligence-Plane agents | 98 |
| Reasoning agents (declare an AI Capability Class) | 10 |
| Wholly deterministic agents | 119 |
| Domain orchestrators · master orchestrators | 20 · 1 |

Every agent declares purpose, inputs, outputs, responsibilities, decision logic, tool
contracts, retry policy, failure handling, telemetry, audit events, EP/IP plane, and — for
reasoning agents — a prompt contract with a non-empty rejection rule (enforced at
registration; V-15). The count sits within the brief's 120–180 band; it is **reported, not
padded** (ADR-0024 §5).

## 6. Repository Intelligence catalogue

Executes in the **Execution Plane** (ADR-0024 §3.5 — the brief's IP placement contradicts its
own sovereignty rule): `branch-discovery · pull-request-discovery · commit-discovery ·
merge-detection · index · existing-test-discovery · automation-inventory · co-change-history`,
and the eight targeted reuse searches (`repository.search.*`: tests, features, page-objects,
components, apis, step-definitions, locators, fixtures). Only identifiers and scores cross.

## 7. Automation Intelligence catalogue

`automation.generation` (outlines only — never source), `automation.kind-reconciliation`
(the requested = generated invariant, V-11), and per-framework generators
`playwright · cypress · selenium · api · bdd`. **Reuse precedes generate**; generation is asked
only for candidates reuse could not satisfy.

## 8. Review · 9. Decision · 10. Certification agents

Three per stage, thirty-six total. **Review** produces findings and cannot act; **Decision**
acts only on findings the reviewer raised and cannot invent one; **Certification** reads both
and can refuse either. Each stage's defect rules are in `src/agents/governance.ts` and are
Dev-Change's own — each names a specific way *this* engine's output can be wrong (e.g. a
coverage claim with no covering asset; a heal validated without an observed retry).

## 11. AI-Enabled vs AI-Disabled behaviour matrix

One workflow; only proposals differ. Proven by the gate running both ways and comparing:
**identical stage sequence, identical 129-agent invocation set** (V-3), **zero proposals
delivered when disabled** (V-4), and full reconstruction with no reasoning (V-20).

| Domain | AI Enabled enrichment | AI Disabled (rules-first, mandatory) |
|---|---|---|
| Change Intelligence | reasoning may **add** categories | ordered layer/symbol/churn rules assign ≥1 category each |
| Business Impact | reasoning names capability + journeys | capability defaults to module; criticality is rule-derived |
| Risk | reasoning **reorders** equal-band paths | churn × layer-weight × breaking × business-criticality score |
| Repository Search | reasoning **reorders** matches | hashed term-vector cosine kNN + path/symbol match |
| Automation Reuse / Authoring | reasoning proposes richer outlines/steps | deterministic arrange/act/assert with expected results |
| Healing | reasoning classifies signal → heal kind | signal pattern-match to heal kind |
| Reflection / Root Cause / Defect | reasoning refines classification & narrative | rule-derived class, cause, templated impact |

Reasoning may **narrow or reorder** deterministic output; it may **never originate** a result.
An agent that receives no proposal takes the degraded path it was always required to have
(INV-7).

## 12. EP / IP ownership matrix

| Concern | Plane | Enforcement |
|---|---|---|
| Git repo, source, commits, diffs, PRs, repository index | **EP** | `SourceControlAdapter`, all `repository.*`/`diff.*` agents `plane: 'EP'` |
| Test execution, healing execution, evidence capture | **EP** | `execution.scoped-run`, `evidence.*` `plane: 'EP'` |
| Credentials, customer artefacts, execution logs | **EP** | never named in any prompt contract; forbidden-input check at registration |
| Change / Business / Risk / Coverage / Root-Cause / Defect / Learning intelligence | **IP** | reason over `ChangeFact`, never `ChangedFile` |
| The crossing | EP→IP | one function, `minimise` — `ChangeFact` has **no field for a line of source** |

**Structural guarantee (V-5):** the entire sealed IP state is serialised and asserted free of
source lines, commit messages and author emails. The raw diff and commits are **dropped** at
the crossing (capability.ts stage 3), so no Intelligence-Plane sealed result can hold source.

## 13. Runtime Completeness validation

No dormant components: every orchestrator invokes agents (V-14), every declared adapter SPI
method is invoked platform-wide (V-6, section 4 of the gate), every declared learning kind is
emitted (V-17), no sealed audit names an agent that did not run (V-13). No placeholder
implementations; no documentation-only workflow. Evidence over assertion throughout.

## 14. Governance validation

The governance triad (stages 4–6) is traversed and cannot be bypassed (V-2; a run missing it
is refused by `certify`). Eight certification gates map onto stage boundaries. Fault-proved by
`record-fault-proofs.js#catalogue-omitting-the-governance-triad`: a catalogue that registers
every domain agent but no governance agent causes the run to fail — a clean build passes, the
planted one fails.

## 15. Security validation

Zero Trust, OAuth2, mutual TLS, replay protection, tenant isolation and the Information
Boundary are inherited from the platform runtime and unchanged. The Execution Plane retains
source, repository, evidence, credentials and logs; the Intelligence Plane receives only
minimised metadata. Evidence crosses by reference — hash and locator only (V-9).

## 16. Architecture Impact Analysis — zero drift

| Dimension | Result | Evidence |
|---|---|---|
| Architecture drift | **ZERO** | 25 documents frozen and unedited; V-1..V-22; ChangeFact type check |
| Governance drift | **ZERO** | governance triad enforced; new gate + fault proof registered |
| Security regression | **ZERO** | no change to auth, boundary, isolation; forbidden-input check |
| Data-sovereignty regression | **ZERO** | V-5 whole-state leak check; single typed crossing |
| EP/IP model | **PRESERVED** | section 12; V-16 places all repo/diff/search agents in EP |
| Provider-agnostic | **PRESERVED** | V-7/V-8 two providers, identical workflow; V-5.n no provider in orchestration |
| Certified Enterprise Architecture | **PRESERVED** | only additive changes: 1 ADR, 1 SPI, 1 package, 1 gate |
| Dev-Change integration | **COMPLETE** | 12 stages, 21 domains, 129 agents, all executed |

**Framework changes were purely additive:** a new `SourceControlAdapter` SPI (no existing
interface altered) and four framework mechanisms the earlier engines already introduced
(reasoning gating, vector intelligence, four-phase pipeline, invocation recorder) reused
unchanged.

---

## Reproduce

```sh
node governance/verification/verify-devchange-conformance.js   # 22 properties + 5 invariants
node governance/verification/record-fault-proofs.js            # includes the Dev-Change proof
```

## Known limits (stated, not hidden)

- Change-impact analysis is **structural**: a dependency expressed only through reflection,
  dynamic dispatch or configuration is not detected. Reasoning may surface it; the
  deterministic floor cannot.
- Reuse recall is **deterministic and lexical**: a semantically-equivalent asset sharing no
  terms is not matched. Reasoning reorders; it never adds.
- Provider adapters are **in-process** and have not been executed against a real Git host;
  the gate measures that SPI methods are *invoked*, a weaker claim than *integrated*.
