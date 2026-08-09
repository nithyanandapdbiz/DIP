# Plane Sovereignty Audit — Functional Testing Engine

**Scope:** `DBizIntelligencePlane` (IP) and `carlisle-homes` (EP tenant runtime)
**Invariant under test:** *Knowledge belongs to the Intelligence Plane.*
**Superseded invariant:** *Deterministic = Execution Plane.*
**Posture:** the implementation is assumed wrong until proven otherwise.
**Date:** 2026-08-01

---

## 1. Executive Summary

### 1.1 The finding in one sentence

The Execution Plane contains a second, parallel intelligence plane — a twelve-agent
"Discovery Intelligence Engine", a knowledge graph, a completeness model, a coverage
calculator, a failure taxonomy, a three-reviewer certification pipeline and a sixteen-node
orchestration graph — and **the output of most of it is never read by the Intelligence
Plane**.

### 1.2 The five conclusions that matter

**1. The stated invariant is the root cause, not the symptom.**
`carlisle-homes/docs/PLANE-OWNERSHIP.md:16` states *"Performs deterministic transformations
→ EP"*. That single row is the licence under which every violation in this report was
written, and every violation was written in good faith against it. Business-rule regex is
deterministic. Coverage arithmetic is deterministic. A completeness score is deterministic.
Under the old rule they all belong to the EP; under the correct rule — *does this require
testing or business expertise?* — none of them do. **The document must be replaced before
any code is moved**, or the violations will regrow.

**2. The Execution Plane duplicates capabilities the Intelligence Plane already owns.**
This is not a case of missing IP capabilities. `story.business-rule-extraction`,
`appintel.business-rules`, `appintel.entities`, `appintel.knowledge-graph`,
`story-intelligence.personas`, `test.coverage-analysis`, `reporting.discovery-completeness`
and `repository.*` all exist, are registered, are conformance-tested and are **not on the
functional-testing path**. The EP re-implemented each of them with regex.

**3. The knowledge the EP produces is dead payload.**
`phases/intelligence.mjs:77-80` puts `knowledgePackage` and `discoveryMatrix` on the F1
request. `authoring-bridge.mjs:82` reads `contextRequest.knowledge` — the *legacy flat
block* — and nothing anywhere reads `knowledgePackage` or `discoveryMatrix`. Twelve agents,
a graph, an eighteen-row completeness matrix and twelve quality gates are computed inside
the customer tenancy, serialised across the boundary, and discarded.

**4. The closed evidence loop is broken, and certification is therefore vacuous.**
`gateway-package.mjs:262-276` keys observed outcomes by `operationId` (`op-1`, `op-2`…).
`authoring-bridge.mjs:148` joins them by `testCaseId`. The two key spaces never intersect,
so `observedExecutions` is **always an empty Map**. Every post-execution pass — reflection,
root-cause, healing, defect, certification — runs on zero outcomes, and the certification
verdict is then recovered by running `/certified=(true|false)/` over an audit *string*
(`authoring-bridge.mjs:213-215`). The platform's certification decision is currently
independent of what actually happened in the browser.

**5. The production authoring path is an unauthenticated signing oracle.**
`/v1/execute` is served by `tenant-onboarding-engine/ip-execute-gateway.mjs`, which holds
the ed25519 execution-signing key and gates on `knownTenant(tenantId)` — a value returned
in every tenant API response. The file documents this itself (lines 63-88, CWE-306). The
EP compounds it: `crossplane/client.mjs:124` and `:145` pass `requireCredential: false` on
exactly the two calls that carry authoring and evidence.

### 1.3 What is genuinely right

The audit is not uniformly negative, and the correct architecture is closer than the
violation count suggests.

- `@dbiz/capability-framework` is a real Capability Runtime: sealed stage results with a
  module-private brand (`stages.ts:32`), a registry that refuses no-op stages, an agent
  catalogue that refuses a reasoning agent with no rejection rule (`agent.ts:196-198`), a
  deterministic Decision Engine, and a `plane: 'IP' | 'EP'` field on every agent that a
  conformance gate reads. **The mechanism for EP-plane agents already exists.**
- The `discovery-flow-engine` already models the correct split exactly: `discovery.*`
  agents at `stage: 'discovery', plane: 'EP'` return `ApplicationFact[]`; `appintel.*`
  agents at `stage: 'context', plane: 'IP'` turn those facts into entities, business rules
  and a knowledge graph. **This is the target architecture, already built, in the wrong
  capability.**
- Evidence sovereignty is correct and well enforced: payloads never cross
  (`runtime/evidence.mjs:101`), `EvidenceReference` has no `content` field by construction,
  the IP refuses a reference carrying content (`ip-execute-gateway.mjs:227-229`), and
  retention purge runs at boot.
- Secret hygiene is correct: registration before first log, `assertNoSecrets` on every
  outbound payload, key-shape redaction as well as value redaction.
- The refusal semantics are correct and hard-won: typed `proceed:false` packages, no smoke
  fallback, verify-before-execute refusing rather than warning.

---

## 2. Architecture Score

**58 / 100** — sound intent, breached sovereignty, one broken load-bearing loop.

| Dimension | Score | Basis |
|---|---:|---|
| Plane sovereignty | 42 | Ten EP modules carry testing or business knowledge |
| Contract integrity | 35 | Two undeclared wire shapes; no EP→IP schema; dead payload |
| Capability ownership | 45 | IP capabilities exist and are bypassed by EP duplicates |
| Orchestration ownership | 30 | 16-phase task graph + authoring cycle loop live in EP |
| Runtime integrity | 55 | Capability runtime is excellent; EP does not use it |
| Evidence & data sovereignty | 88 | Correct by construction; minor leakage risks only |
| Determinism & auditability | 80 | Strong journal, sealed results, no silent caps |
| Security posture | 30 | Unauthenticated signing oracle on the live authoring path |
| Closed-loop correctness | 15 | Outcome join broken; certification runs on empty input |

---

## 3. EP / IP Compliance Score

**46 / 100 (weighted by criticality)** · 52/100 unweighted by module count.

26 Execution-Plane modules audited: **11 compliant, 5 split, 10 violating.**
The violating modules sit on the critical path (discovery, authoring, certification,
reporting); the compliant ones are largely infrastructure (transport, sanitiser, evidence,
journal), hence the weighted score is lower than the count.

| Verdict | Modules |
|---|---|
| **Compliant** | `runtime/browser.mjs`, `runtime/evidence.mjs`, `runtime/totp.mjs`, `connectors/http.mjs`, `connectors/azure-devops.mjs`, `support/canonical.mjs`, `support/env.mjs`, `support/identity.mjs`, `support/integrity.mjs`, `support/journal.mjs`, `support/sanitize.mjs` |
| **Compliant (exemplar)** | `support/configuration.mjs` — evaluates IP-authored rules, encodes none |
| **Split** | `phases/discovery.mjs`, `phases/planning-automation.mjs`, `phases/execution.mjs`, `runtime/automation-repository.mjs`, `runtime/selector-discovery.mjs` |
| **Violating** | `orchestrator.mjs`, `governance/pipeline.mjs`, `discovery/engine.mjs`, `discovery/agents.mjs`, `discovery/knowledge-graph.mjs`, `support/criteria.mjs`, `support/knowledge.mjs`, `crossplane/gateway-package.mjs`, `phases/intelligence.mjs`, `phases/closure.mjs` |

---

## 4. Capability Ownership Matrix

The twelve questions were applied to every module. `Obs?` = directly observable from the
customer system without interpretation. `Disagree?` = two competent engineers could differ.

### 4.1 Execution Plane — current placement vs correct placement

| # | Component | Capability implemented | Testing knowledge? | Business interpretation? | Obs? | Disagree? | Current class | **Correct class** | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `connectors/azure-devops.mjs` | ADO retrieval/write | no | no | yes | no | Collection | **Collection / Synchronisation** | ✅ |
| 2 | `connectors/http.mjs` | Transport | no | no | — | no | Execution Runtime | **Execution Runtime** | ✅ |
| 3 | `runtime/browser.mjs` | Browser drive + capture | no | no | yes | no | Execution Runtime | **Execution Runtime** | ✅ |
| 4 | `runtime/evidence.mjs` | Custody + references | no | no | yes | no | Evidence Runtime | **Evidence Runtime** | ✅ |
| 5 | `runtime/totp.mjs` | TOTP | no | no | yes | no | Execution Runtime | **Execution Runtime** | ✅ |
| 6 | `runtime/selector-discovery.mjs` | DOM control inventory | **partly** | no | yes | **yes** (what counts as a control) | Collection | **Collection** (definition must move) | ⚠️ |
| 7 | `runtime/automation-repository.mjs` `scan/materialise` | Repo scan + write | no | no | yes | no | Collection / Packaging | **Collection / Packaging** | ✅ |
| 8 | `runtime/automation-repository.mjs` `validateRepository` | Automation architecture opinions | **yes** | no | no | **yes** | Parsing (claimed) | **Review Capability (IP)** | ❌ |
| 9 | `support/configuration.mjs` | Config load + rule *evaluation* | no | no | yes | no | Parsing | **Parsing** | ✅ exemplar |
| 10 | `support/criteria.mjs` | Requirement decomposition | **yes** | **yes** | no | **yes** | Parsing (claimed) | **Knowledge Capability (IP)** | ❌ |
| 11 | `support/knowledge.mjs` | Artefact semantics + completeness model | **yes** | **yes** | no | **yes** | Normalization (claimed) | **Knowledge + Review Capability (IP)** | ❌ |
| 12 | `discovery/facts.mjs` | Fact model + provenance | no | no | — | no | Collection | **Collection** | ✅ |
| 13 | `discovery/engine.mjs` | Agent federation, tiered dependency graph | no | no | — | **yes** | Collection (claimed) | **Agent Runtime (IP)** | ❌ |
| 14 | `discovery/agents.mjs` 1,2,3,5,8,9 | Story/relations/attachments/API/repo/change collection | no | no | yes | no | Collection | **Collection** | ✅ |
| 15 | `discovery/agents.mjs` 6 business-rule | Business rule extraction | **yes** | **yes** | no | **yes** | Collection (claimed) | **Business Rule Capability (IP)** | ❌ |
| 16 | `discovery/agents.mjs` 7 domain-entity | Role/entity/state extraction | **yes** | **yes** | no | **yes** | Collection (claimed) | **Entity + Role Capability (IP)** | ❌ |
| 17 | `discovery/agents.mjs` 10 risk | (re-emits gaps under a risk name) | — | — | — | — | Collection (claimed) | **delete; Risk Capability is IP** | ❌ |
| 18 | `discovery/agents.mjs` 11 traceability | Traceability graph + coverage gap | **yes** | no | no | **yes** | Collection (claimed) | **Coverage Capability (IP)** | ❌ |
| 19 | `discovery/agents.mjs` 12 evidence-catalog | Provenance census | no | no | yes | no | Packaging | **Packaging** | ✅ |
| 20 | `discovery/knowledge-graph.mjs` | Knowledge graph + matrix + gates | **yes** | **yes** | no | **yes** | Normalization (claimed) | **Knowledge + Review Capability (IP)** | ❌ |
| 21 | `crossplane/client.mjs` | Single egress | no | no | — | no | Synchronisation | **Synchronisation** | ✅ (auth defect) |
| 22 | `crossplane/package-verifier.mjs` | Verify-before-execute | no | no | — | no | Parsing | **Parsing** | ✅ |
| 23 | `crossplane/gateway-package.mjs` | Op translation, failure taxonomy, defaults | **yes** | no | no | **yes** | Normalization (claimed) | **Contract (IP-owned shape)** | ❌ |
| 24 | `governance/pipeline.mjs` | 3 reviewers, CERTIFIED verdicts | **yes** | no | no | **yes** | — | **Review + Certification Capability (IP)** | ❌ |
| 25 | `orchestrator.mjs` | 16-phase graph, terminal verdict | **yes** | no | no | **yes** | — | **Planning + Agent Runtime (IP)** | ❌ |
| 26 | `phases/discovery.mjs` | Config probe + requirement pull | mixed | mixed | mixed | mixed | — | **split** | ⚠️ |
| 27 | `phases/intelligence.mjs` | Package consumption + ADO authoring render | mixed | mixed | mixed | mixed | — | **split** | ⚠️ |
| 28 | `phases/planning-automation.mjs` | Plan/suite creation, materialise | no | no | yes | no | Packaging / Sync | **Packaging / Sync** | ✅ |
| 29 | `phases/execution.mjs` | Drive + capture (+2 judgements) | mixed | no | yes | mixed | — | **split** | ⚠️ |
| 30 | `phases/closure.mjs` | Defect write, sync, report (+coverage) | mixed | mixed | mixed | mixed | — | **split** | ⚠️ |
| 31 | `src/portal/server.mjs` | Operational portal | no | no | yes | no | Execution Runtime | **Execution Runtime** | ✅ |
| 32 | `bin/ep-update-agent.mjs` | Update pull + apply | no | no | yes | no | Synchronisation | **Synchronisation** | ✅ |

### 4.2 Intelligence Plane — placement check

| Component | Class | Verdict |
|---|---|---|
| `capability-framework/stages.ts` | **Capability Runtime** | ✅ correct and strong |
| `capability-framework/agent.ts` | **Agent Runtime** | ✅ |
| `capability-framework/decision.ts` | **Decision Capability** | ✅ |
| `capability-framework/certification.ts`, `pipeline.ts` | **Certification / Review Capability** | ✅ |
| `contracts/*` | Contract shape only, no logic | ✅ (incomplete — §6) |
| `FTE/src/agents/story-and-test.ts` | **Knowledge + Planning Capability** | ✅ |
| `FTE/src/agents/repository-and-authoring.ts` | **Repository + Authoring Capability** | ✅ |
| `FTE/src/domains/*` (13 domains) | **Knowledge / Decision / Review** | ✅ |
| `FTE/authoring-bridge.mjs` `groundOperations` | **Planning Capability** | ⚠️ round-robin control assignment, not semantic matching — declared honestly in metadata, but it is the quality ceiling |
| `discovery-flow-engine/agents/scope-and-discovery.ts` | **Collection (EP-plane definitions)** | ✅ correct pattern |
| `discovery-flow-engine/agents/intelligence-and-model.ts` | **Knowledge Capability** | ✅ |
| `FTE` `repository.vector-search`, `repository.semantic-search` | declared `plane: 'EP'` | ❌ **semantic re-ranking is knowledge; see V-35** |
| `FTE` `execution.planner` | declared `plane: 'EP'` | ❌ **planning is IP; see V-36** |
| `tenant-onboarding-engine/ip-execute-gateway.mjs` | Contract endpoint | ❌ **unauthenticated signing oracle** |

---

## 5. Complete Violation Register

**Severity scale.** S1 = the architecture is unsound or a decision is being made in the
wrong plane on the critical path. S2 = knowledge in the EP with downstream effect. S3 =
knowledge in the EP with contained effect. S4 = latent / definitional.

### S1 — Critical

---

**V-01 · The Execution Plane certifies**

- **Current location:** `src/functional-testing/governance/pipeline.mjs:37-92, 101-182`
- **Current responsibility:** runs three reviewers (functional, governance, certification)
  over every phase, issues `CERTIFIED` / `NOT_CERTIFIED`, drives a bounded revision loop.
- **Correct responsibility:** none. The EP records outcomes; it does not review or certify.
- **Why this violates the architecture:** review and certification are explicitly IP
  (`Review Capability`, `Certification Capability`). `certificationReview` decides whether
  a phase's output "may be relied on downstream" — a judgement two competent engineers can
  disagree about, made inside the customer tenancy, with no IP visibility.
- **Impact:** a run can be locally CERTIFIED across 16 phases while the IP certified
  nothing. `orchestrator.mjs:275-279` partially compensates, which proves the EP verdict
  was never trustworthy. The audit trail shows "3 reviewers approved" for reviews the
  Intelligence Plane never saw.
- **Recommended fix:** delete the pipeline. Replace with a **Step Ledger** — an append-only
  record of `{step, started, finished, outcome, observations[], evidenceRefs[]}` with no
  verdict field. The IP's `runPhase` / `certify` in `capability-framework` already
  implements review and certification against the Step Ledger.
- **Migration strategy:** (a) add `POST /v1/observations` accepting a Step Ledger; (b) run
  IP review in shadow against it for one release, diffing against the EP verdict; (c)
  remove `Verdict.CERTIFIED` from EP and emit only ledger entries; (d) delete
  `governance/pipeline.mjs`.
- **Dependencies:** V-02 (orchestrator), C-02 (no EP→IP schema), V-31 (terminal state).

---

**V-02 · The Execution Plane orchestrates**

- **Current location:** `src/functional-testing/orchestrator.mjs:48-71, 217-250`
- **Current responsibility:** a sixteen-node task graph with `dependsOn` / `dependsOnAny`
  edges, skip-with-reason semantics, forward state threading, and re-execution of phase 16.
- **Correct responsibility:** the EP executes a *sequence the IP planned*. It owns no graph.
- **Why this violates the architecture:** the dependency edges encode testing expertise —
  "execution needs *either* a validated local suite *or* sealed operations"
  (`orchestrator.mjs:64`) is a testing judgement, and the comment above it argues the case,
  which is itself proof that two engineers could disagree.
- **Impact:** the IP cannot change the workflow without an EP release. The platform's
  single orchestration lifecycle (R-12.18) is contradicted by a second one in every
  tenancy. Sixteen phases exist in the EP against twelve stages in the framework.
- **Recommended fix:** the IP emits an **Execution Plan** — an ordered, signed list of
  `{stepId, kind, dependsOn[], parameters}` — as part of the sealed package. The EP becomes
  a plan interpreter with no built-in phase list.
- **Migration strategy:** (a) add `plan` to the package contract, initially mirroring the
  current 16 phases so behaviour is unchanged; (b) EP reads the plan instead of `PHASES`;
  (c) collapse the plan to the twelve framework stages; (d) delete `PHASES`.
- **Dependencies:** V-01, C-01 (contract redesign).

---

**V-03 · Business rule extraction inside the Execution Plane**

- **Current location:** `src/functional-testing/discovery/agents.mjs:263-310`
  (`RULE_PATTERNS`, `VALIDATION_PATTERN`, `businessRuleDiscoveryAgent`)
- **Current responsibility:** regex-scans story text, criteria, comments and attachment
  bodies; emits `business-rule` and `validation` facts.
- **Correct responsibility:** **Business Rule Capability (IP)** and **Validation Capability
  (IP)**. The EP supplies the *corpus with provenance*, nothing more.
- **Why this violates the architecture:** identifying a business rule is business
  interpretation by definition. The second pattern —
  `/\b(?:must|shall|should|cannot|…)\b/` at `LOW` confidence — matches any sentence with a
  modal verb, which is a heuristic about how requirements are written. The IP already owns
  this: `story.business-rule-extraction` (`story-and-test.ts:119-141`) with a declared
  prompt contract and rejection rules, and `appintel.business-rules`
  (`intelligence-and-model.ts:162`) with source-fact citation.
- **Impact:** two competing business-rule models exist. The EP's crosses the boundary and
  is discarded (C-04); the IP's runs on a `body` string the bridge assembles by joining
  prose. Rules the EP "found" never reach the reasoner that authors tests from them.
- **Recommended fix:** EP emits `TextSpan` observations — `{sourceUri, field, offset,
  length, text}` with retrieval provenance and **no classification**. IP's Business Rule
  Capability consumes the span set.
- **Migration strategy:** (a) add `textSpans` to the observation contract; (b) wire
  `story.business-rule-extraction` to consume spans instead of a joined `body`; (c) run
  both, diff rule counts on real tenants for one release; (d) delete the EP agent and its
  two regex constants.
- **Dependencies:** C-02, C-04.

---

**V-04 · Role, entity and state-transition extraction inside the Execution Plane**

- **Current location:** `src/functional-testing/discovery/agents.mjs:314-341`
  (`ROLE_PATTERN`, `ENTITY_PATTERN`, `STATUS_PATTERN`, `domainEntityDiscoveryAgent`)
- **Current responsibility:** extracts actors, domain entities and statuses from prose.
- **Correct responsibility:** **Entity Capability (IP)** (`appintel.entities`), **Role /
  Persona Capability (IP)** (`story-intelligence.ts:126-127` `personas`), **State
  Capability (IP)**.
- **Why this violates the architecture:** `ENTITY_PATTERN` is
  `/\b([A-Z][a-zA-Z]{2,}…)\s+(?:record|entity|form|list|status|field)\b/` — it decides that
  a capitalised word before the noun "record" *is a domain entity*. That is a claim about
  the customer's business ontology, inferred from English capitalisation.
- **Impact:** wrong or missing entities silently shape nothing, because the output is
  discarded — which is worse, because the run *reports* entities found and an operator
  believes entity discovery happened.
- **Recommended fix:** delete. The EP contributes entity evidence only as observed
  artefacts: form field names, API parameter names, ADO field values — which
  `appintel.entities` already consumes as `ApplicationFact[]`.
- **Migration strategy:** fold into V-03's span/fact contract; delete the agent whole.
- **Dependencies:** V-03.

---

**V-05 · The closed evidence loop does not join — certification is vacuous**

- **Current location:** `src/functional-testing/crossplane/gateway-package.mjs:262-276`
  (`toObservedExecution`, keyed by `operationId`) against
  `packages/functional-testing-engine/authoring-bridge.mjs:148` (`observedExecutions`,
  keyed by `testCaseId`).
- **Current responsibility:** return real execution outcomes to the IP so reflection,
  root-cause, healing, defect and certification run on reality.
- **Correct responsibility:** exactly that — it is correct in intent and broken in fact.
- **Why this violates the architecture:** the EP emits `observed['op-1']`; the IP looks up
  `observed[testCase.id]`. `groundOperations` (`authoring-bridge.mjs:270-291`) assigns
  operation ids `op-N` and records the owning test case in a *separate* field,
  `authoredFor`. The join therefore never matches, `.filter(([, v]) => v && …)` empties the
  Map, and every post-execution domain runs on zero outcomes.
- **Impact:** **the certification verdict is independent of the test run.** It is then
  extracted by regex over an audit string (`authoring-bridge.mjs:213-215`); if the audit
  event text ever changes, `certified` silently becomes `false`. Healing, root cause and
  defect genuineness are all computed against an empty outcome set. This is the single
  highest-impact defect in the audit and it is a live correctness failure, not a design
  disagreement.
- **Recommended fix:** (1) make the operation→test-case binding part of the contract —
  `operation.testCaseId` as a required field, not `authoredFor` metadata; (2) EP aggregates
  per-operation outcomes to a per-test-case outcome using that field; (3) delete the regex
  verdict recovery — `reflectViaFTE` must read the certification decision from the sealed
  stage result, not from an audit sentence.
- **Migration strategy:** ship (3) first — it is a contained fix and removes a silent
  failure mode. Then (1) as an additive contract field. Then (2) in the EP. Add a
  conformance test asserting a non-empty `observedExecutions` for any run with ≥1 operation.
- **Dependencies:** C-01.

---

**V-06 · `/v1/execute` is an unauthenticated signing oracle**

- **Current location:** `packages/tenant-onboarding-engine/ip-execute-gateway.mjs:190-204,
  253-269`; EP side `src/functional-testing/crossplane/client.mjs:124, 145`
- **Current responsibility:** authors and ed25519-signs the execution package the EP is
  contractually built to trust and run.
- **Correct responsibility:** an authenticated IP tier resolving the signing key through
  the SecretProvider.
- **Why this violates the architecture:** the only access control is
  `knownTenant(tenantId)`, and a tenantId is not a secret — it is returned in the
  registration grant and in every tenant API response. A Bearer header is read and logged
  but gates nothing (`ip-execute-gateway.mjs:262`). The EP does not require a credential
  either. The file states this itself, at length, and mitigates with a production
  environment-variable interlock — a configuration accident away from failing.
- **Impact:** cross-plane RCE. Anyone who can reach the port obtains an artefact customer
  infrastructure will verify and execute against a live production system.
- **Recommended fix:** ADR-0049 M5 as already planned — retire the harness, serve
  `/v1/execute` from the authenticated tier. **Additionally**, remove
  `requireCredential: false` from the EP client: an EP that will accept an unauthenticated
  answer has no way to distinguish the real IP from anything else on that origin.
- **Migration strategy:** (a) flip `requireCredential` to `true` on both calls and fix the
  dev harness to issue a token — this is a one-line change that closes the EP half
  immediately; (b) complete M5.
- **Dependencies:** none — this should not wait for the sovereignty work.

---

**V-07 · The Execution Plane authors test content**

- **Current location:** `src/functional-testing/phases/intelligence.mjs:540-563`
  (`stepsXml`), `:566-581` (`gwtSummary`), `:584-593` (`tagsFor`), `:660-671` (field map)
- **Current responsibility:** renders authored steps to ADO XML.
- **Correct responsibility:** rendering is EP; **the content substitutions are not**.
- **Why this violates the architecture:** four concrete acts of authoring:
  1. `:550` — `s.expectedResult || 'The step completes without error.'`. When the IP
     authored no expected result, **the EP invents one**. A step whose expected result is
     "completes without error" passes whenever nothing throws — this manufactures a green
     test out of an incomplete design.
  2. `:588` — `tags.add('risk-' + testCase.riskLevel)` and `:589` `'automation-candidate'`:
     the EP is applying risk and automation metadata.
  3. `:666` — `'Microsoft.VSTS.Common.Priority': testCase.priority ?? 2`: **priority
     assignment** with a hard-coded default.
  4. `:670` — automation status derived from `testCase.automated`, which
     `gateway-package.mjs:226` set to the literal `true` for every test case.
- **Impact:** the customer's ADO project contains test cases whose expected results,
  priority and risk tags were decided by the Execution Plane and attributed to the
  Intelligence Plane. `phases/intelligence.mjs:642-644` logs a warning about writing an
  incomplete design and writes it anyway — correct on certification ownership, wrong on
  substitution.
- **Recommended fix:** remove every `??` default from the field map. A step with no
  expected result is a package defect: refuse the package at verify-before-execute and
  return the observation. `priority`, `tags` and `automationStatus` become **required**
  fields on the authored test case contract.
- **Migration strategy:** (a) add the fields as required in the contract and populate them
  in `authoring-bridge.mjs` (the FTE `TestCase` model already carries `priority`, `risk`,
  `tags`, `automationReady` — `model.ts:96-118` — they are simply dropped by
  `projectGatewayPackage`); (b) remove the defaults; (c) add a verifier rule refusing a
  package with an empty `expectedResult`.
- **Dependencies:** V-13 (`projectGatewayPackage` field loss).

---

### S2 — High

---

**V-08 · Requirement decomposition inside the Execution Plane**

- **Current location:** `src/functional-testing/support/criteria.mjs:52-114`
- **Current responsibility:** splits acceptance-criteria text into discrete criteria via
  four strategies (Gherkin GIVEN, `AC1:` markers, list items, blank-line paragraphs), with
  a `MIN_CRITERION_CHARS = 12` floor and an `isNoise` filter.
- **Correct responsibility:** **Requirement Decomposition Capability (IP)**.
- **Why this violates the architecture:** the module's own header concedes the stakes —
  splitting "is what makes authored coverage meaningful". **The split determines the
  requirement count, which is the coverage denominator.** Choosing paragraphs over bullets
  changes how many requirements exist, and therefore changes reported coverage. Two
  competent engineers absolutely disagree about whether a 3-line bullet is one criterion or
  three. The `isNoise` list (`/^for reference only$/`, `/^(n\/a|tbc|tbd|none)$/`) is a
  judgement about which customer text is meaningless.
- **Impact:** the EP silently sets the denominator of every coverage figure the IP later
  reports, and the IP has no visibility into how it was set.
- **Recommended fix:** EP sends the **raw acceptance-criteria text with its field
  provenance**; the IP decomposes. `story.acceptance-criteria`
  (`story-and-test.ts:109-117`) is the owner; it needs a decomposition strategy the EP
  currently holds.
- **Migration strategy:** (a) port the four strategies into an IP capability verbatim so
  behaviour is bit-identical; (b) EP sends `acceptanceCriteriaText` only (already present —
  `phases/discovery.mjs:312`); (c) IP splits; (d) delete `support/criteria.mjs`.
- **Dependencies:** C-02, C-03.

---

**V-09 · Requirement semantic classification inside the Execution Plane**

- **Current location:** `src/functional-testing/support/criteria.mjs:123-136`
  (`describeCriterion`)
- **Current responsibility:** flags each criterion for `mentionsNavigation`,
  `mentionsValidation`, `mentionsRole`, `mentionsData`.
- **Correct responsibility:** IP requirement understanding.
- **Why this violates the architecture:** `mentionsRole` is
  `/\brole|permission|admin|user|access|unauthoris/` — deciding that a criterion concerns
  authorisation. That is a testing-domain classification, not an observation. `hasGiven` /
  `hasWhen` / `hasThen` / `chars` are legitimately structural; the four `mentions*` flags
  are not.
- **Impact:** feeds `measureCompleteness` (V-10) and thereby a completeness *score* that
  is presented to operators as a percentage.
- **Recommended fix:** keep `chars`, `hasGiven/When/Then`, `isGherkin` as EP structural
  facts. Move the four `mentions*` predicates to the IP.
- **Migration strategy:** fold into V-08's port. **Dependencies:** V-08.

---

**V-10 · A requirement-quality model inside the Execution Plane**

- **Current location:** `src/functional-testing/support/knowledge.mjs:69-138`
  (`measureCompleteness`), consumed at `phases/discovery.mjs:370-372, 491`
- **Current responsibility:** thirteen named completeness signals and a
  `completenessScore` ratio.
- **Correct responsibility:** **Story Completeness Capability (IP)** — which the EP's own
  documentation says exists (`support/knowledge.mjs:9-11`).
- **Why this violates the architecture:** the *choice of the thirteen signals* is the
  model. Deciding that a complete story has navigation, validation rules, roles, mockups,
  an API spec and linked defects is testing expertise. The module carefully avoids emitting
  `sufficient` — but publishes a ratio to the operator as `'completeness score': '46%'`
  (`phases/discovery.mjs:491`), which is read as a verdict regardless of the disclaimer.
- **Impact:** the EP defines what a good requirement is, and the number is on the terminal
  and in the report.
- **Recommended fix:** EP emits raw presence facts (`attachmentCount`, `linkedBugCount`,
  `criteriaCount`, `hasAreaPath`…) with no signal names and no score. The IP's
  `story.gap-detection` + `story.review` + `reporting.discovery-completeness` own the model.
- **Migration strategy:** (a) strip `completenessScore` from the terminal and report first
  — that removes the false verdict immediately; (b) move the thirteen signals to an IP
  capability; (c) delete `measureCompleteness`.
- **Dependencies:** V-09.

---

**V-11 · Artefact semantic classification inside the Execution Plane**

- **Current location:** `src/functional-testing/support/knowledge.mjs:16-37`
  (`KIND_RULES`, `classifyAttachment`)
- **Current responsibility:** maps filenames to `ui-mockup`, `api-specification`,
  `business-rules`, `documentation`, `data`, `log`.
- **Correct responsibility:** **Artefact Classification Capability (IP)**.
- **Why this violates the architecture:** the *taxonomy* is testing knowledge — the classes
  exist because a test designer needs to know whether a mockup or an API contract is
  available. The rules are guesses about filenames: `/rule|policy|matrix|decision/` →
  `business-rules`.
- **Impact:** classification crosses the boundary as fact (`phases/intelligence.mjs:86`)
  and drives the IP's `knowledgeProse` (`authoring-bridge.mjs:58-60`), so an EP filename
  guess becomes an IP input asserted as truth.
- **Recommended fix:** EP emits `{name, extension, mediaType, bytes, sha256, retrieved}` —
  all directly observable. IP classifies.
- **Migration strategy:** additive — send the raw fields alongside `kind`, move
  classification to IP, then drop `kind` from the EP payload.
- **Dependencies:** C-03.

---

**V-12 · The knowledge graph is built in the Execution Plane**

- **Current location:** `src/functional-testing/discovery/knowledge-graph.mjs:16-63`
- **Current responsibility:** assembles facts into an `Epic → Feature → Story → {criteria,
  rules, screens, APIs, roles, validations, entities, transitions}` ontology.
- **Correct responsibility:** **Knowledge Capability (IP)** — `appintel.knowledge-graph`
  and `learning.knowledge-graph` already exist.
- **Why this violates the architecture:** the graph *is* the knowledge model. Deciding that
  a story has `businessRules`, `validations`, `roles`, `domainEntities` and
  `stateTransitions` as first-class children is an ontological commitment about how
  requirements decompose for testing.
- **Impact:** see §12. It also mixes fact and knowledge in one structure, so neither can be
  versioned independently.
- **Recommended fix:** split (§12). EP emits an **Observation Set**; IP builds the graph.
- **Dependencies:** V-03, V-04, C-03, C-04.

---

**V-13 · The Execution Plane translates and defaults the authored package**

- **Current location:** `src/functional-testing/crossplane/gateway-package.mjs:110-152`
  (`mapGatewayOperations`), `:186-260` (`projectGatewayPackage`)
- **Current responsibility:** re-shapes the IP's package onto the sections the phases
  consume, and maps the IP action vocabulary to adapter kinds.
- **Correct responsibility:** the contract should require no translation. Where the shape
  must change, the IP emits the target shape.
- **Why this violates the architecture:** three distinct problems.
  1. **Semantic translation.** `case 'navigate'` resolves the target from EP configuration
     (`op.target || op.url || expect.page || baseUrl || ''`). The EP decides what "navigate"
     meant. The comment defends this on sovereignty grounds — correctly — which means the
     *contract* should carry `target: '@application.baseUrl'` as a resolvable reference,
     not an empty string the EP fills in.
  2. **Invented defaults.** `:210` `technique: 'unspecified'`, `:225` `priority: 2`, `:226`
     `automated: true`, `:224` `tags: [...]`. These are EP-authored test metadata (V-07).
  3. **Information loss.** The FTE `TestCase` model carries `priority`, `risk`, `tags`,
     `preconditions`, `gwt`, `validation`, `cleanup`, `testData`, `businessRuleIds`
     (`model.ts:96-118`). `authoredArtifacts.testCases` (`authoring-bridge.mjs:448`) emits
     only `{id, objective, scenarioId, requirementIds, steps}`. Everything else is dropped
     at the boundary — and then re-invented by the EP.
- **Impact:** the EP re-creates, badly, metadata the IP already computed well.
- **Recommended fix:** widen `authoredArtifacts.testCases` to the full `TestCase`; delete
  every default in `projectGatewayPackage`; make operation `target` a declared reference
  type resolved by a contract-defined substitution table, not by a `||` chain.
- **Dependencies:** C-01, V-07.

---

**V-14 · Failure taxonomy inside the Execution Plane**

- **Current location:** `src/functional-testing/crossplane/gateway-package.mjs:162-177`
  (`SIGNAL_RULES`, `classifyFailure`)
- **Current responsibility:** maps a Playwright error string to one of nine classified
  tokens (`TIMEOUT`, `AMBIGUOUS_SELECTOR`, `ASSERTION_MISMATCH`…).
- **Correct responsibility:** **Failure Taxonomy Capability (IP)**. Root-cause reasoning
  is `defect.root-cause` (IP); the taxonomy it reasons over must be IP-owned too.
- **Why this violates the architecture:** the mapping is diagnostic expertise. Deciding
  that `resolved to N elements` means `AMBIGUOUS_SELECTOR` rather than `ELEMENT_NOT_FOUND`
  is exactly the judgement `defect.root-cause` exists to make — and the EP has already made
  it before the IP sees anything.
- **Nuance — this one is genuinely hard.** The raw error text is customer content and must
  not cross (the IP correctly refuses it, `ip-execute-gateway.mjs:56`). So the EP *must*
  classify before sending. The resolution is not to move the code but to move the
  **taxonomy**: the IP ships the `SIGNAL_RULES` table as signed configuration, exactly as
  it already ships validation rules in `config/application.json`
  (`support/configuration.mjs:9-13`). The EP evaluates rules it did not write.
- **Recommended fix:** add `failureTaxonomy` to the sealed package; EP evaluates it.
- **Migration strategy:** (a) move the table into the IP and ship it in the package; (b) EP
  reads it from the package and falls back to `UNCLASSIFIED` if absent — never to a local
  table; (c) delete `SIGNAL_RULES`.
- **Dependencies:** C-01.

---

**V-15 · Healing policy inside the Execution Plane**

- **Current location:** `src/functional-testing/phases/execution.mjs:332-340`
- **Current responsibility:** rejects an IP healing proposal whose replacement selector is
  `*`, `body` or `html` as "unsafely broad".
- **Correct responsibility:** **Healing Capability (IP)** owns what a safe heal is; the EP
  owns a *blast-radius guardrail* expressed as IP-supplied policy.
- **Why this violates the architecture:** the EP is overriding an IP decision on its own
  judgement. The set `{*, body, html}` is a judgement about which selectors are dangerous —
  `div`, `:nth-child(1)` and `[class*=btn]` are equally broad and pass.
- **Impact:** the IP proposes a heal, the EP silently rejects it, and the IP is never told —
  `rejected` is recorded locally as an advisory finding and never returned.
- **Recommended fix:** the package carries `healing.policy` (max blast radius, forbidden
  selector forms). The EP enforces the supplied policy and **returns every rejection to the
  IP as an observation**.
- **Dependencies:** C-01, V-05 (the return channel must work).

---

**V-16 · Coverage calculation inside the Execution Plane**

- **Current location:** `src/functional-testing/phases/authoring.mjs:65-98`
  (`measureAuthoring`), `phases/closure.mjs:298-304` (`report.coverage`)
- **Current responsibility:** computes `acceptanceCriteriaCoverage`,
  `requirementCoverage`, `automationCoverage`.
- **Correct responsibility:** **Coverage Capability (IP)** — `test.coverage-analysis`
  (`story-and-test.ts:427-439`) and `reporting.coverage` already exist.
- **Why this violates the architecture:** coverage is the platform's headline quality
  number. Its definition is testing expertise. `closure.mjs:299`
  `executedOperations / designedTestCases` is not a coverage metric in any recognised
  sense — it divides operations by test cases, two different units. The code is careful to
  report `null` rather than a fabricated zero, which is right, and then reports a
  meaningless ratio when both are present, which is worse.
- **Impact:** an executive report carries a coverage percentage the Intelligence Plane
  neither computed nor agreed with.
- **Recommended fix:** the EP reports **counts only**: operations executed, test cases
  written, criteria received. The IP computes every ratio and returns it in the reporting
  model (`contracts/reporting-model.ts` already exists for exactly this).
- **Migration strategy:** (a) remove `coverage` from the EP report, replace with the count
  block; (b) render the IP's `ReportingModel` when present, and an explicit "coverage not
  returned by the Intelligence Plane" when absent.
- **Dependencies:** V-05, C-01.

---

**V-17 · Discovery quality gates inside the Execution Plane**

- **Current location:** `src/functional-testing/discovery/knowledge-graph.mjs:113-188`
  (`evaluateDiscoveryGates`), enforced at `phases/discovery.mjs:504-506`
- **Current responsibility:** twelve gates deciding whether discovery is adequate; failures
  become `ERROR` findings that can fail the phase.
- **Correct responsibility:** **Review Capability (IP)**.
- **Why this violates the architecture:** a gate is a pass/fail judgement. The gate *set* is
  testing policy — deciding that "every linked work item resolved" is required but "an API
  specification was found" is not.
- **Impact:** the EP can fail a run on its own discovery policy before the IP is consulted.
- **Recommended fix:** delete. Gate evaluation moves to IP review over the Observation Set;
  `reporting.discovery-completeness` already exists.
- **Dependencies:** V-01, V-12.

---

**V-18 · The completeness matrix inside the Execution Plane**

- **Current location:** `src/functional-testing/discovery/knowledge-graph.mjs:73-103`
- **Current responsibility:** eighteen measured discovery dimensions with status
  classification.
- **Correct responsibility:** **Discovery Completeness Capability (IP)**.
- **Why this violates the architecture:** the *dimension list* encodes what a test designer
  needs. `expected` is honestly left `unknown` where nothing declares one — good — but
  choosing to measure `businessRules`, `roles`, `stateTransitions` as dimensions is the
  model itself.
- **Recommended fix:** move with V-12. The EP contributes raw counts; the IP names the
  dimensions.
- **Dependencies:** V-12, V-17.

---

**V-19 · Automation architecture opinions inside the Execution Plane**

- **Current location:** `src/functional-testing/runtime/automation-repository.mjs:134-201`
  (`validateRepository`)
- **Current responsibility:** emits findings with severities: `undefined-step` (error),
  `duplicate-step` (error), `unused-page-object` (warning), `brittle-locator` (warning),
  `no-executable-surface` (error). Sets `executionReady`.
- **Correct responsibility:** **split.** Detection of an undefined or duplicate step is a
  mechanical fact about the suite (EP). *Severity assignment*, `brittle-locator` and
  `unused-page-object` are automation-architecture judgements (IP —
  `src/domains/automation-architecture.ts` exists).
- **Why this violates the architecture:** "positional/XPath locators will not survive a
  layout change" is a well-founded testing opinion, and it is an opinion. `executionReady`
  is a go/no-go decision gating phase 11.
- **Recommended fix:** EP emits the observation set — `{undefinedSteps[], duplicateSteps[],
  positionalLocators[], unreferencedPageObjects[], scenarioCount}` with **no severity and
  no `executionReady`**. The IP assigns severity and decides readiness, returning it in the
  execution plan.
- **Dependencies:** V-01, V-02.

---

**V-20 · The Execution Plane runs an authoring cycle loop**

- **Current location:** `src/functional-testing/phases/authoring.mjs:158-246`
  (`runAuthoringPipeline`), with re-request at `phases/intelligence.mjs:251-284`
- **Current responsibility:** a `maxAuthoringCycles: 2` loop that measures the IP's output,
  returns findings, requests re-authoring, and decides convergence by JSON-comparing
  designs.
- **Correct responsibility:** the IP owns its own authoring loop. The EP requests once.
- **Why this violates the architecture:** the EP is orchestrating an Intelligence-Plane
  process — deciding how many reasoning cycles are worth running, what constitutes
  convergence, and which observations are worth returning. `measurementsAsFeedback`
  (`phases/authoring.mjs:106-122`) composes findings phrased as corrections, and the bridge
  converts them to `"Authoring correction required (…)"` prose injected into the story body
  (`authoring-bridge.mjs:86-91, 100`). **The EP is writing into the requirement text the
  IP reasons over.** That is the most direct form of the violation in this register.
- **Impact:** requirement text seen by the reasoner is EP-authored. Cycle budget is set in
  the customer tenancy. The `stages[]` array records IP stage names the EP never ran
  (`phases/authoring.mjs:173-209` logs `6.1 Story Analysis [IP]`, `6.7 Enterprise Quality
  Review [IP] — certified by the Intelligence Plane (the package was admitted)`) — a
  reconstructed narrative presented as an audit record.
- **Recommended fix:** the EP requests a package **once** and reports observations on the
  observation channel. The IP decides whether to re-author, using its own budget. Delete
  the loop, the stage narration and `reauthorPackage`.
- **Migration strategy:** (a) move the cycle budget into the IP's authoring domain; (b) EP
  sends observations without re-requesting; (c) delete `runAuthoringPipeline`; (d) replace
  the narrated `stages[]` with the IP's own `decisionTrace`, which is already returned
  (`authoring-bridge.mjs:435`).
- **Dependencies:** V-01, C-02.

---

### S3 — Medium

---

**V-21 · Selector relevance is decided in the Execution Plane**
`runtime/selector-discovery.mjs:19-23`. The `INTERACTIVE` list is commented *"Controls
worth authoring against. Anything not interactive is noise to the author."* — the EP
deciding what the author needs. **Fix:** the IP ships the control-selector profile in the
package (it already ships an application template with a discovery profile). EP evaluates.
**Severity S3** because the list is conventional and unlikely to be contested — but it is
the definition of what the IP is allowed to see.

**V-22 · Silent scope caps on the fact set**
`runtime/selector-discovery.mjs:136` (`maxPages = 3`, `maxControlsPerPage = 60`), `:74`
(80-character name cap). These bound what the IP can reason over, are set in the EP, and —
unlike the execution guardrails at `phases/execution.mjs:128-131`, which correctly warn —
are **not reported**. A control silently omitted is indistinguishable from a control that
does not exist. **Fix:** IP-supplied limits; always emit `observedTotal` vs `retained`.

**V-23 · Change significance is decided in the Execution Plane**
`discovery/agents.mjs:406`. The `SIGNIFICANT` field list decides which requirement
revisions matter for regression. **Fix:** emit all revisions with changed field names; IP
decides significance.

**V-24 · Environmental pre-classification of failures**
`phases/execution.mjs:385`. The EP decides a failure co-occurred with an environmental
signal via `/net::ERR|ECONN|timeout/`. Overlaps `defect.genuineness` (IP). **Fix:** emit
the signals; do not correlate.

**V-25 · Defect metadata authored in the Execution Plane**
`phases/closure.mjs:63-64`. `priority ?? 2`, `severity ?? '3 - Medium'`. Defect priority
and severity are business impact judgements — `defect.business-impact` (IP) exists. **Fix:**
required contract fields; refuse a verified failure carrying neither.

**V-26 · Traceability coverage judgement**
`discovery/agents.mjs:477-479`. Emits a `criterion-test-coverage` gap when criteria exist
and no tests do — a coverage conclusion, not an observation. **Fix:** emit both counts;
IP concludes.

**V-27 · `riskDiscoveryAgent` is misnamed and inert**
`discovery/agents.mjs:437-450`. Named for risk, computes none; re-emits other agents'
gaps, then `engine.mjs:73` deliberately excludes its output from the fact set to avoid
double counting. It exists solely to produce `consolidatedRisk`, which nothing consumes.
**Fix:** delete. Risk is `story.risk-analysis` (IP).

**V-28 · The federation runner is an agent runtime**
`discovery/engine.mjs:36-88`. Three dependency tiers, `Promise.all` fan-out, per-agent
isolation, gap-on-throw. This is a competent agent runtime — and the platform already has
one (`capability-framework/agent.ts`) with retry policy, telemetry, audit events and
catalogue validation the EP's lacks. **Fix:** EP hosts the framework's agent runtime and
executes `plane: 'EP'` agent definitions supplied by the IP.

**V-29 · Test plan and suite naming conventions**
`phases/planning-automation.mjs:32, 45`. Plan and suite names are composed in the EP.
Low impact, but it is a test-management convention. **Fix:** IP supplies naming templates.

**V-30 · Cross-plane `knowledge` block carries interpretation**
`phases/intelligence.mjs:83-97`. Ships `completenessObservations` (V-10 output) and
attachment `kind` (V-11 output) as knowledge. **Fix:** replaced by the Observation Set.

**V-31 · Terminal state is decided in the Execution Plane**
`orchestrator.mjs:265-281`. The EP derives `CERTIFIED` / `CONDITIONALLY CERTIFIED` /
`NOT CERTIFIED` / `BLOCKED` / `FATAL` and exits with a CI-gating code. Lines 275-279 are
correct (never promote to CERTIFIED without the IP) — but `BLOCKED` vs `NOT_CERTIFIED` is
still a run verdict. **Fix:** the EP reports a **completion state** (`COMPLETE`,
`INCOMPLETE`, `FAILED`) and renders the IP's certification verdict separately. Two fields,
not one.

**V-32 · Report renders EP-derived judgements**
`phases/closure.mjs:266-335`. Coverage (V-16), blockers derived from EP verdicts (V-01).
The certification slot is handled correctly and should be the model for the rest.
**Fix:** render the IP's `ReportingModel`; EP contributes only counts and evidence paths.

---

### S4 — Latent / definitional

**V-33 · The plane-ownership rule itself**
`carlisle-homes/docs/PLANE-OWNERSHIP.md:16` — *"Performs deterministic transformations →
EP"*. **This is the root cause.** Replace with the two-question test in §20.

**V-34 · Two competing story-knowledge paths in the IP**
`authoring-bridge.mjs:51-77` (`knowledgeProse`) flattens structured knowledge into prose
sentences joined with `'. '`, which the FTE then re-parses with regex
(`story-and-test.ts:138, 195-199`). Structure → prose → structure. **Fix:** `RequirementInput`
(`story-intelligence.ts:29-36`) already has `rawBusinessRules` and `rawDependencies`
fields; populate them directly instead of round-tripping through prose.

**V-35 · `repository.semantic-search` declares `plane: 'EP'`**
`FTE/src/agents/repository-and-authoring.ts` — an agent with `aiCapabilityClass: 'ranking'`
and a prompt contract, declared as Execution Plane. Semantic re-ranking is reasoning; an
EP-plane agent must never carry a reasoning class. **Fix:** split — EP returns lexical
matches and the vector index (deterministic, provider-free, correctly EP); IP re-ranks.
Add a catalogue rule: `plane: 'EP'` ⇒ `aiCapabilityClass: 'none'`.

**V-36 · `execution.planner` declares `plane: 'EP'`**
Same file. It reports batch/slot counts and asserts ordering — mechanical, so the code is
harmless; but the *name* claims planning in the EP and the framework's own
`STAGE_PLANE.planning = 'IP'` disagrees. **Fix:** rename to `execution.plan-materialiser`,
or move to IP.

**V-37 · `AgentPlane` is declared but not enforced across planes**
`capability-framework/agent.ts:40`. The `plane` field is read by a conformance gate inside
the IP repo, but no EP-plane agent definition is ever *transported* to an EP. The field is
the right mechanism with no delivery vehicle. **Fix:** §13.4.

---

## 6. Cross-Plane Contract Review

### 6.1 What the EP currently sends (F1 → `/v1/execute`)

Source: `phases/intelligence.mjs:43-98`.

| Field | Classification | Verdict |
|---|---|---|
| `tenantId`, `sources`, `aiEnabled` | fact | ✅ |
| `requirements[].{sourceRef,title,description,workItemType,areaPath,iterationPath,tags}` | fact | ✅ |
| `requirements[].priority` | fact (ADO field) | ✅ |
| `requirements[].acceptanceCriteria` | **derived by EP decomposition** | ❌ V-08 |
| `candidateTests[]` | fact | ✅ |
| `selectorDiscovery` | measurement (uniqueness counted live) | ✅ — the model citizen |
| `knowledgePackage` | **knowledge**: business rules, roles, entities, transitions, gaps | ❌ V-03, V-04, V-12 · **and never read** |
| `discoveryMatrix` | **knowledge**: 18 testing dimensions | ❌ V-18 · **and never read** |
| `knowledge.attachments[].kind` | **interpretation** | ❌ V-11 |
| `knowledge.completenessObservations` | **judgement** | ❌ V-10 |
| `authoringFeedback` | **review findings** | ❌ V-20 |

**Verdict: the EP sends knowledge, not facts.** Six of eleven field groups are
interpretation. The one that is unambiguously right — `selectorDiscovery` — is right
because it reports *measured* uniqueness with no opinion about what the controls mean.

### 6.2 What the EP receives

Two wire shapes, neither fully declared.

| | Frozen contract | Gateway contract |
|---|---|---|
| Schema | `contracts/src/execution-package.ts` | **none — implemented twice by hand** |
| Integrity | `sha256-jcs-v1` + domain `dbiz.execution-package@1` | bare `sha256`, no domain separation |
| Signature | detached RSA/EC over canonical sealed content | ed25519 over the same canonical bytes |
| Required elements | 7 (operations, directives, gates, evidenceRequirements, provenance, validity, proceed) | ad hoc |
| Verified by | `package-verifier.mjs:49-116` | `gateway-package.mjs:39-99` |
| Selected by | `package-verifier.mjs:45` — `contentHash.algorithm === 'sha256'` | same |
| In use | **no** | **yes** |

**C-01 · Two contracts, one of them undeclared, selected by a hash-algorithm heuristic.**
The frozen contract is the one with a schema, a domain-separated hash and a conformance
suite. It is dead. The live one exists only as two hand-written implementations that must
stay byte-identical, defended by a comment (`gateway-package.mjs:15-17`). The dispatch at
`package-verifier.mjs:45` is honest about it and correctly routes both through one gate —
but a *contract chosen by inspecting its integrity field* is not a contract.
**Fix:** define the gateway shape in `@dbiz/contracts` as `execution-package@2`, with
domain separation and a schema, and converge (ADR-0049 M5 already plans the endpoint move;
this adds the shape).

**C-02 · There is no schema for the EP→IP direction.**
`contextRequest` is the platform's most important payload — it is what the reasoner reasons
over — and it has no Zod schema, no version, no conformance test and no sovereignty guard
on the *inbound* side. The IP guards the *returned outcomes*
(`ip-execute-gateway.mjs:47-59`) but accepts any `contextRequest` shape. This absence is
why V-03, V-04, V-10, V-11 and V-12 could be added to the payload without anything
objecting. **Fix:** `contracts/src/observation-set.ts` — a versioned, guarded schema with a
declared classification per field, and an IP-side guard that **refuses knowledge-typed
fields** exactly as it refuses evidence content today.

**C-03 · The payload has no classification discipline.**
`EvidenceReference` proves the pattern works: no `content` field means content cannot
cross. `contextRequest` has no equivalent. **Fix:** brand observation types
(`Observation`, `Measurement`, `Provenance`) so a knowledge type is a compile error.

**C-04 · Dead payload.**
`knowledgePackage` and `discoveryMatrix` are serialised, transported and dropped. Nothing
in the IP references either identifier. **Fix:** delete on the EP side as V-03/V-04/V-12
land; until then the run reports discovery work that had no effect.

**C-05 · The certification contract is not used.**
`client.mjs:151-155` implements `requestCertification` against `/v1/certify`. Nothing calls
it. Certification instead rides back on the 202 from `/v1/evidence`
(`closure.mjs:178-188`), which means certification is a side effect of an evidence
acknowledgement. **Fix:** either implement `/v1/certify` and use it, or delete the dead
method and make `/v1/evidence` returning a verdict an explicit part of the contract. The
current state — a documented contract nobody calls, and an undocumented one that carries
the decision — is the worst of both.

**C-06 · Authentication is optional on the two calls that matter.**
`client.mjs:124, 145` — `requireCredential: false`. See V-06.

**C-07 · Operation identity does not carry test-case identity.** See V-05.

---

## 7. Discovery Engine Review

**Question posed: is Discovery actually Discovery, or is it Understanding?**

**Answer: it is both, and they are not separated.** Of twelve agents, seven discover, five
understand, and the module boundary runs through none of them.

| # | Agent | What it actually does | Verdict |
|---|---|---|---|
| 1 | `story-discovery` | reads ADO fields verbatim | **Discovery** ✅ (except the AC split it invokes — V-08) |
| 2 | `relationship-discovery` | resolves linked work items | **Discovery** ✅ |
| 3 | `attachment-intelligence` | downloads + indexes textual attachments | **Discovery** ✅ (except `classifyAttachment` — V-11) |
| 4 | `ui-discovery` | screens/controls from the live app | **Discovery** ✅ — the exemplar |
| 5 | `api-discovery` | parses OpenAPI into an operation catalogue | **Discovery** ✅ — parsing a formal specification |
| 6 | `business-rule-discovery` | regex over prose → rules + validations | **Understanding** ❌ V-03 |
| 7 | `domain-entity-discovery` | regex over prose → roles, entities, states | **Understanding** ❌ V-04 |
| 8 | `repository-discovery` | WIQL + shared steps + suite scan | **Discovery** ✅ |
| 9 | `change-discovery` | revision history | **Discovery** ✅ (significance filter — V-23) |
| 10 | `risk-discovery` | re-emits gaps; consumed by nothing | **Neither** ❌ V-27 |
| 11 | `traceability-discovery` | assembles the trace graph; declares a coverage gap | **Understanding** ❌ V-26 |
| 12 | `evidence-catalog` | provenance census | **Packaging** ✅ |

**The clean line.** Agents 6, 7, 10 and 11 must leave. Agents 1-5, 8, 9 and 12 stay, minus
the four helper functions they call into (`splitAcceptanceCriteria`, `describeCriterion`,
`classifyAttachment`, `measureCompleteness`).

**The federation runner** (`engine.mjs`) is a second agent runtime and must be replaced by
the framework's (V-28).

**The name is wrong and the name matters.** "Discovery *Intelligence* Engine" is what
authorised putting intelligence in it. Rename to **Evidence Collection Federation**.

---

## 8. Functional Testing Engine Review

### 8.1 Phase-by-phase ownership

| Phase | Title | Genuinely EP | Genuinely IP, misplaced | Verdict |
|---|---|---|---|---|
| 1 | Configuration Discovery | provider detection, connectivity probe, slot scan | slot→phase impact mapping (`discovery.mjs:106-116`) is a dependency judgement | ✅ mostly |
| 2 | Discovery Intelligence Engine | retrieval, attachment download, selector discovery | AC decomposition, business rules, entities, completeness, matrix, gates | ❌ §7 |
| 3 | Requirement Intelligence | package consumption, evidence custody | — | ✅ correct pattern |
| 4 | Test Design Intelligence | package consumption | duplicate + traceability review (`intelligence.mjs:397-415`) is IP review | ⚠️ |
| 5 | Repository Discovery & Intelligence | WIQL retrieval (5a) | 5b correctly delegated ✅ | ✅ **the model to copy** |
| 6 | Test Case Authoring | ADO write, target conformance | authoring loop, coverage measurement, expected-result substitution, priority, tags | ❌ V-07, V-16, V-20 |
| 7 | Test Planning | plan/suite creation, assignment | naming convention (V-29) | ✅ mostly |
| 8 | Automation Intelligence | repository scan | — (name overclaims) | ✅ |
| 9 | Automation Generation | materialise, path containment | — | ✅ correct pattern |
| 10 | Automation Validation | structural detection | severity, `executionReady`, brittle/unused opinions | ❌ V-19 |
| 11 | Execution | browser drive, evidence capture, guardrails | — | ✅ **the strongest module in the EP** |
| 12 | Healing | applies IP proposals | safety-gate override (V-15) | ⚠️ |
| 13 | Failure Intelligence | consumes IP analysis | environmental correlation (V-24) | ⚠️ |
| 14 | Bug Creation | ADO write, evidence attach | priority/severity defaults (V-25) | ⚠️ |
| 15 | Result Synchronisation | ADO test run, evidence refs | outcome key mismatch (V-05) | ❌ critical |
| 16 | Executive Reporting | render, file write | coverage, blockers from EP verdicts | ❌ V-16, V-32 |

**Phase 5 is the correct pattern and it is already in the codebase.** It splits explicitly
into `5a Repository Discovery [EP]` and `5b Repository Intelligence [IP]`, retains the
discovery evidence when the IP is unavailable, and blocks on the decision rather than
approximating it (`phases/intelligence.mjs:429-482`). Every other phase should be rewritten
to look like it.

**Phase 11 is the strongest module in the Execution Plane.** No simulation branch, honest
guardrails that warn rather than silently truncate, skipped operations reported as skipped
rather than omitted, evidence captured before it can be lost. It should be left alone.

### 8.2 The sixteen phases against the twelve stages

The framework defines twelve stages and forbids a second lifecycle (R-12.18). The EP has
sixteen phases. They do not map cleanly, and the mismatch is why the EP needed its own
reviewer pipeline: the framework's `architecture-review` / `policy-review` /
`guardrail-review` triad has no EP equivalent, so the EP invented `functional` /
`governance` / `certification` reviewers instead. **Two governance triads now exist, and
only one is the platform's.**

---

## 9. Runtime Review

| Runtime | Location | Class | Verdict |
|---|---|---|---|
| Capability Runtime | `capability-framework/stages.ts` | Capability Runtime | ✅ excellent — sealed results, forge-proof brand, no-op detection, no skip/resume bypass |
| Agent Runtime (IP) | `capability-framework/agent.ts` | Agent Runtime | ✅ excellent — refuses reasoning agents with no rejection rule; enforces `FORBIDDEN_IN_PROMPT` |
| Decision Runtime | `capability-framework/decision.ts` | Decision Capability | ✅ |
| Agent Runtime (EP, shadow) | `discovery/engine.mjs` | — | ❌ V-28 — a second, weaker runtime |
| Governance Runtime (EP, shadow) | `governance/pipeline.mjs` | — | ❌ V-01 — a second governance triad |
| Orchestration Runtime (EP, shadow) | `orchestrator.mjs` | — | ❌ V-02 — a second lifecycle |
| Execution Runtime | `runtime/browser.mjs` | Execution Runtime | ✅ |
| Evidence Runtime | `runtime/evidence.mjs` | Evidence Runtime | ✅ |
| Transport Runtime | `crossplane/client.mjs` | Synchronisation | ✅ shape, ❌ auth (V-06) |
| Trust Runtime | `crossplane/package-verifier.mjs` | Parsing | ✅ — refuses on missing key rather than degrading |

**The finding:** the Execution Plane has silently grown three shadow runtimes that mirror
three the Intelligence Plane already owns. None of them was a mistake in isolation; each
was the reasonable local answer to "the IP is not reachable from inside a phase". The
correct answer is that the EP should not have phases.

---

## 10. Agent Review

**Question posed: should every EP agent instead be a Collector, Parser, Normalizer,
Packager or Synchronizer?**

**Answer: yes — for all twelve.** Nothing in the EP should be called an agent, because in
this platform "agent" is a defined term meaning *a unit with declared decision logic, a
reasoning class and a prompt contract*, registered in the capability runtime. None of the
EP's twelve satisfy that; all twelve borrow the authority of the word.

| EP "agent" | Correct noun |
|---|---|
| story-discovery | **Collector** (ADO) |
| relationship-discovery | **Collector** (ADO) |
| attachment-intelligence | **Collector** + **Parser** |
| ui-discovery | **Collector** (browser) |
| api-discovery | **Parser** (OpenAPI — a formal specification) |
| business-rule-discovery | *delete* → IP Business Rule Capability |
| domain-entity-discovery | *delete* → IP Entity / Role Capability |
| repository-discovery | **Collector** (ADO + filesystem) |
| change-discovery | **Collector** (ADO) |
| risk-discovery | *delete* |
| traceability-discovery | *delete* → IP Coverage Capability |
| evidence-catalog | **Packager** |

**Net: 7 collectors/parsers/packagers, 5 deletions, 0 agents.**

**Where real EP agents should come from.** The framework already supports them:
`AgentDefinition.plane = 'EP'`, and `discovery-flow-engine` defines twenty of them
(`discovery.web`, `discovery.forms`, `discovery.controls`, `discovery.api`,
`discovery.navigation`…) returning `ApplicationFact[]`. **The EP should host the framework's
agent runtime and execute IP-authored EP-plane agent definitions** — then an agent is an
agent everywhere, defined once, in the plane that owns its definition.

---

## 11. Orchestration Review

**Question posed: does the EP currently own any orchestration?**

**Answer: it owns four distinct orchestrators.**

1. **The phase sequencer** — `orchestrator.mjs:48-71, 217-250`. A 16-node task graph with
   `dependsOn` / `dependsOnAny` edges and skip-with-reason. **V-02.**
2. **The governance loop** — `governance/pipeline.mjs:101-182`. Executor → 3 reviewers →
   revise, with a bounded revision budget. **V-01.**
3. **The discovery federation** — `discovery/engine.mjs:36-88`. Three dependency tiers with
   parallel fan-out and per-agent isolation. **V-28.**
4. **The authoring cycle** — `phases/authoring.mjs:187-230`. A feedback loop against the
   Intelligence Plane, with the EP deciding the budget and the convergence test. **V-20.**

There is also implicit orchestration in **when reasoning is invoked**: `obtainSealedPackage`
is called from phases 3, 4, 5 and 6 with a memoisation guard
(`phases/intelligence.mjs:169`). The EP decides that one package serves four phases — a
caching and scope decision about IP reasoning, made in the EP.

**Retry, parallel and dependency planning** all exist in the EP:
- retry → `pipeline.mjs:109` revision loop, `connectors/http.mjs` attempts
- parallel → `discovery/engine.mjs:43, 55` `Promise.all` tiers
- dependency → `orchestrator.mjs:218-219`

The IP owns the corresponding capabilities and they are unreachable from the EP:
`planning.dependency-resolver`, `planning.batch-optimizer`, `planning.parallel-scheduler`,
`planning.environment-validation`.

**Verdict: all orchestration moves to the IP, expressed as a signed Execution Plan the EP
interprets.**

---

## 12. Knowledge Graph Review

**Question posed: are the Fact Graph and the Knowledge Graph mixed?**

**Answer: yes — they are the same object.** `buildKnowledgeGraph`
(`discovery/knowledge-graph.mjs:16-63`) takes a flat fact list and returns a single
structure containing, indistinguishably:

- **Facts** — story fields, screens, controls, selectors, API operations, existing tests,
  shared steps, attachments, revisions, links.
- **Knowledge** — `businessRules`, `validations`, `roles`, `domainEntities`,
  `stateTransitions`, plus the `Epic → Feature → Story` ontology and the `gaps` set.

They share one type, one lifecycle, one hash and one transport field. Neither can be
versioned, guarded or reasoned about independently.

### 12.1 The split

**Fact Graph — EP-owned, `dbiz.observation-set@1`**

```
ObservationSet {
  runId, tenantId, correlationId, capturedAt
  provenance:   { sourceKind, sourceRef, locator, retrievedAt, retrievalMethod }[]
  workItems:    { id, type, fields{}, revisions[], links[] }[]      // verbatim
  textSpans:    { sourceUri, field, offset, length, text }[]        // no classification
  artefacts:    { name, extension, mediaType, bytes, sha256, retrieved }[]
  formalSpecs:  { kind: 'openapi', operations[] }[]                 // parsed specs only
  screens:      { url, title, controls[{ id, role, accessibleName, selectors[], unique }] }[]
  repository:   { existingTests[], sharedSteps[], sharedParameters[], automationAssets[] }[]
  measurements: { name, value, unit, method }[]                     // counts, never ratios
  retrievalGaps:{ sourceKind, sourceRef, reason }[]                 // could not retrieve
}
```

Rules: every entry carries provenance; confidence describes **how it was obtained**, never
whether it is true (the existing `facts.mjs:9-20` doctrine is right and survives); no field
may name a testing concept; ratios are forbidden.

**Knowledge Graph — IP-owned, `dbiz.knowledge-graph@1`**

Built by IP capabilities from the Observation Set: requirements, criteria, business rules,
validations, roles/personas, entities, state transitions, risk, ambiguities, coverage,
traceability, completeness. Persisted in the IP, versioned independently, feeding
`learning.knowledge-graph` and `learning.vector-memory` across runs — which is where a
knowledge graph earns its cost, and which the EP's per-run graph can never do.

### 12.2 The one thing that must not be lost

**`retrievalGaps` are facts and belong in the Fact Graph.** "The wiki was unreachable" is
an observation. "There is no API specification, and that is a risk" is knowledge. The EP's
current gap doctrine (`facts.mjs:63-81`) gets this exactly right and must survive the split
unchanged — it is one of the best ideas in the codebase.

---

## 13. Required Refactoring

Not "move the regex". These are capabilities to build, own and register.

### 13.1 New Intelligence-Plane capabilities

| Capability | Consumes | Produces | Status |
|---|---|---|---|
| **Requirement Decomposition** | raw AC text + provenance | discrete criteria with source offsets | **new** — port V-08 verbatim |
| **Business Rule Capability** | `textSpans` | `BusinessRule[]` with source citation | **exists**: `story.business-rule-extraction`, `appintel.business-rules` — needs a span port |
| **Validation Capability** | `textSpans`, `formalSpecs`, `screens` | `ValidationRule[]` | **new** — `story-intelligence.validationRules` is a start |
| **Entity Capability** | `screens`, `formalSpecs`, `textSpans` | `BusinessEntity[]` | **exists**: `appintel.entities` — needs wiring |
| **Role / Persona Capability** | `textSpans`, work-item fields | `Persona[]` | **exists**: `story-intelligence.personas` |
| **Artefact Classification** | `artefacts` | classified artefact kinds | **new** — port V-11 |
| **Coverage Capability** | knowledge graph + authored tests + outcomes | every ratio the platform reports | **exists**: `test.coverage-analysis`, `reporting.coverage` — EP must stop computing |
| **Discovery Completeness** | Observation Set | dimensions, gates, verdict | **exists**: `reporting.discovery-completeness` — needs the dimension model from V-18 |
| **Failure Taxonomy** | — | signed classification table shipped in the package | **new** — port V-14 |
| **Healing Policy** | — | signed policy shipped in the package | **new** — port V-15 |
| **Automation Architecture Review** | automation observation set | findings with severity, `executionReady` | **exists**: `src/domains/automation-architecture.ts` — needs the EP's observations |
| **Execution Planning** | authored tests + repository + config | signed Execution Plan | **exists**: `planning.*` agents — needs to reach the EP |
| **Review Capability** | Step Ledger + artefacts | findings | **exists**: `capability-framework/pipeline.ts` |
| **Certification Capability** | Step Ledger + outcomes + coverage | verdict | **exists**: `capability-framework/certification.ts` |

**Eight of fourteen already exist.** The work is predominantly *wiring and deletion*, not
construction — which is the most encouraging finding in this audit.

### 13.2 New Execution-Plane capabilities

| Capability | Responsibility |
|---|---|
| **Observation Set Builder** | assemble + seal the Fact Graph; enforce the no-knowledge guard structurally |
| **EP Agent Host** | host `capability-framework`'s agent runtime; execute IP-authored `plane:'EP'` agent definitions |
| **Execution Plan Interpreter** | execute the IP's signed plan; no built-in phase list |
| **Step Ledger** | append-only step records with observations and evidence refs; **no verdict field** |
| **Target Conformance** | keep — the one legitimate EP transformation of authored content (`authoring.mjs:133-144`) |
| **Policy Evaluator** | evaluate IP-shipped rule tables (failure taxonomy, healing policy, selector profile, control profile) — generalise `support/configuration.mjs`, the existing exemplar |

### 13.3 Deletions

`discovery/engine.mjs` · `discovery/knowledge-graph.mjs` · `support/criteria.mjs` ·
`support/knowledge.mjs` · `governance/pipeline.mjs` · `orchestrator.mjs` `PHASES` ·
`phases/authoring.mjs` `runAuthoringPipeline` + `measureAuthoring` +
`measurementsAsFeedback` · `discovery/agents.mjs` agents 6, 7, 10, 11 ·
`gateway-package.mjs` `SIGNAL_RULES` + defaults in `projectGatewayPackage` ·
`client.mjs` `requestCertification` (or implement it).

**Retained unchanged:** `runtime/browser.mjs`, `runtime/evidence.mjs`, `runtime/totp.mjs`,
`connectors/*`, `support/{canonical,env,identity,integrity,journal,sanitize}.mjs`,
`crossplane/package-verifier.mjs`, `discovery/facts.mjs` (as the Observation Set model),
`phases/execution.mjs` execution body.

### 13.4 Delivering EP agent definitions

The mechanism gap behind V-37. Options, with a recommendation:

1. **Ship definitions in the sealed package.** Each run carries the EP-plane agent
   definitions it needs, already signed by the existing trust chain. No new transport, no
   new trust root, and it makes agent evolution an IP-side change. **Recommended.**
2. Publish a versioned agent bundle the EP pulls via `ep-update-agent.mjs`. Reuses an
   existing channel but needs its own signing and version negotiation.
3. Vendor `@dbiz/capability-framework` into the EP package. Simplest, but couples EP
   releases to framework releases — rejected.

Definitions must be **data-driven**, not JavaScript: a definition is `{id, domain, stage,
plane, collector: {kind, parameters}}` interpreted by the EP host. Shipping executable code
into a customer tenancy re-creates the V-06 trust problem in a new place.

---

## 14. Migration Roadmap

Seven waves. Each is independently shippable and independently reversible.

### Wave 0 — Stop the bleeding (1 sprint, no architecture change)

| # | Action | Closes |
|---|---|---|
| 0.1 | `requireCredential: true` on `/v1/execute` and `/v1/evidence`; issue a dev token | V-06 (EP half) |
| 0.2 | Fix the outcome join; delete the regex verdict recovery | **V-05** |
| 0.3 | Remove `?? 2`, `?? '3 - Medium'`, `'The step completes without error.'` — refuse instead | V-07, V-25 |
| 0.4 | Remove `completenessScore` and `coverage` ratios from terminal + report | V-10, V-16 (surface) |
| 0.5 | Delete `riskDiscoveryAgent` and `consolidatedRisk` | V-27 |
| 0.6 | Report `observedTotal` vs `retained` on every capped collection | V-22 |

**Rationale for ordering: 0.2 first.** Certification is currently decoupled from execution.
Nothing else in this plan matters while that is true.

### Wave 1 — Replace the doctrine (1 sprint, documentation + gates)

- Rewrite `PLANE-OWNERSHIP.md` around the two-question test (§20). **V-33.**
- Add the catalogue rule `plane: 'EP'` ⇒ `aiCapabilityClass: 'none'`. **V-35.**
- Rename `execution.planner` → `execution.plan-materialiser`. **V-36.**
- Add a lint gate over `carlisle-homes/src`: no regex literal may appear in a module that
  writes to a cross-plane payload. Crude, and it would have caught V-03, V-04, V-09 and
  V-11 on the day they were written.

### Wave 2 — Define the contracts (2 sprints)

- `contracts/src/observation-set.ts` — schema, version, branded types, sovereignty guard.
- `contracts/src/execution-package-v2.ts` — the gateway shape, domain-separated.
- `contracts/src/execution-plan.ts` — the signed step graph.
- `contracts/src/step-ledger.ts` — the verdict-free EP record.
- IP-side inbound guard refusing knowledge-typed fields, mirroring the existing outcome
  guard. **C-01, C-02, C-03.**

### Wave 3 — Move understanding to the Intelligence Plane (3 sprints)

Per capability: port verbatim → run both → diff on real tenants for one release → delete
the EP copy. Order by blast radius, lowest first:

1. Artefact Classification (V-11) — smallest, proves the pattern
2. Business Rule + Validation (V-03)
3. Entity + Role + State (V-04)
4. Requirement Decomposition (V-08, V-09) — **highest risk: it changes the coverage
   denominator; must ship with a coverage-drift report**
5. Completeness + Matrix + Gates (V-10, V-17, V-18)
6. Knowledge Graph (V-12) — split per §12

Wave 3 exit: `knowledgePackage` and `discoveryMatrix` are gone from the wire. **C-04.**

### Wave 4 — Move policy to the Intelligence Plane (2 sprints)

Failure taxonomy (V-14), healing policy (V-15), selector/control profile (V-21), change
significance (V-23), automation review severities (V-19), plan naming (V-29). Each ships as
a signed table in the package; the EP's Policy Evaluator interprets it. `support/configuration.mjs`
is the working precedent.

### Wave 5 — Move orchestration to the Intelligence Plane (3 sprints)

1. IP emits an Execution Plan mirroring the current 16 phases — behaviour unchanged.
2. EP interprets the plan instead of `PHASES`.
3. EP emits a Step Ledger; IP reviews it in shadow, diffing against EP verdicts.
4. Delete `governance/pipeline.mjs`; the IP verdict becomes authoritative.
5. Collapse the plan from 16 phases to the 12 framework stages.
6. Delete the EP authoring loop; the IP owns its cycle budget.

**V-01, V-02, V-20, V-31.**

### Wave 6 — Unify the agent runtime (2 sprints)

EP hosts `capability-framework`'s agent runtime; IP ships EP-plane agent definitions in the
package; `discovery/engine.mjs` deleted; the `discovery-flow-engine`'s twenty EP-plane
`discovery.*` definitions become reachable from functional testing. **V-28, V-37.**

### Wave 7 — Retire the second contract (1 sprint, gated on ADR-0049 M5)

`/v1/execute` moves to the authenticated tier; `execution-package@1` and `@2` converge;
`package-verifier.mjs`'s algorithm-based dispatch is deleted. **V-06, C-01.**

**Total: ~15 sprints.** Waves 0 and 1 are ~2 sprints and deliver most of the risk reduction.

---

## 15. Priority Matrix

| Priority | Violation | Impact | Effort | Wave |
|---|---|---|---|---|
| **P0** | V-05 broken outcome join | certification is meaningless | S | 0 |
| **P0** | V-06 signing oracle | cross-plane RCE | S (EP half) / L (M5) | 0 / 7 |
| **P0** | V-07 invented expected results | manufactures passing tests | S | 0 |
| **P1** | V-01 EP certifies | false assurance | L | 5 |
| **P1** | V-02 EP orchestrates | second lifecycle | L | 5 |
| **P1** | C-01/C-02 contracts | nothing else is enforceable without them | M | 2 |
| **P1** | V-16 coverage in EP | headline number is EP-owned | M | 0/3 |
| **P2** | V-03/V-04 rules + entities | duplicated + discarded knowledge | M | 3 |
| **P2** | V-08/V-09 decomposition | sets the coverage denominator | M | 3 |
| **P2** | V-12 knowledge graph | fact/knowledge conflation | L | 3 |
| **P2** | V-20 authoring loop | EP writes requirement text | M | 5 |
| **P3** | V-10/V-11/V-17/V-18 | completeness + classification | M | 3 |
| **P3** | V-14/V-15/V-19 | policy in EP | M | 4 |
| **P3** | V-28 shadow agent runtime | duplication | M | 6 |
| **P4** | V-21..V-32 | contained | S each | 3-5 |
| **P4** | V-33..V-37 | definitional | S | 1 |

---

## 16. Risk Assessment

### 16.1 Risks of the current architecture

| Risk | Likelihood | Impact | Note |
|---|---|---|---|
| A run certifies without evidence being considered | **Certain — happening now** | Critical | V-05 |
| Unauthorised execution package reaches a tenancy | Low (loopback) | Critical | V-06; one config change from Medium |
| Test cases pass because the EP invented the expected result | **High** | Critical | V-07 |
| Reported coverage is wrong | **High** | High | V-08 sets the denominator, V-16 the formula |
| EP and IP business-rule models diverge | **Certain — already true** | Medium | V-03; masked only because output is discarded |
| A silently capped fact set makes the IP reason on a partial view | Medium | Medium | V-22 |
| EP release required to change the workflow | **Certain** | Medium | V-02 |

### 16.2 Risks of the migration

| Risk | Mitigation |
|---|---|
| **Coverage figures change when decomposition moves** (Wave 3.4) | Port verbatim; run both for one release; ship a per-tenant coverage-drift report; brief customers before cut-over |
| **Latency**: EP→IP round trip for what was a local call | Observation Set is one payload per run, not per fact — no additional round trips; the current design already gathers everything before one `/v1/execute` call |
| **Availability**: more IP dependency | Unchanged. Phases 3-6, 9, 12, 13 already block without the IP. Discovery collection stays local; only interpretation moves |
| **Regression during Wave 5 orchestration move** | The plan mirrors the current phases exactly in step 1; the collapse to 12 stages is a separate, later step |
| **Shadow-mode divergence goes unnoticed** | Every dual-run wave emits a machine-readable diff and fails CI on a delta above threshold |
| **Wave 0.2 changes certification outcomes** | It will — from "arbitrary" to "correct". Expect previously-CERTIFIED runs to become NOT CERTIFIED. This is the fix working; communicate it as such |

### 16.3 The risk of not acting

The EP currently reports discovery work with no effect, coverage it computed itself, and
certification decoupled from execution — while presenting all three under Intelligence-Plane
authority. That is not a latent risk; it is the current state of every run in
`carlisle-homes/reports/`.

---

## 17. Implementation Plan

### Wave 0 detail — the three changes that matter most

**0.2 · Fix the outcome join**

1. `authoring-bridge.mjs`: emit `testCaseId` as a first-class field on every operation
   (`groundOperations` already knows it as `authoredFor` — promote it).
2. `contracts`: `Operation.testCaseId` becomes required in `execution-package@2`.
3. EP `toObservedExecution`: aggregate operations to a test-case outcome —
   `failed` if any failed, else `skipped` if any skipped, else `passed`; duration summed;
   `failureSignal` from the first failure.
4. `authoring-bridge.mjs` `reflectViaFTE`: read certification from the sealed
   `certification` stage result, **not** `/certified=(true|false)/` over an audit string.
5. Conformance test: a run with ≥1 operation MUST yield a non-empty `observedExecutions`.

**0.3 · Remove invented content**
Replace every `?? default` in `phases/intelligence.mjs:660-671` and `closure.mjs:63-64`
with a verifier rule. A package whose test case has no expected result, priority or
severity is refused at verify-before-execute with a typed reason — which is exactly how the
platform already handles a package it cannot trust.

**0.1 · Close the EP auth half**
Two lines in `client.mjs`. The dev gateway must issue and check a token; the interlock at
`ip-execute-gateway.mjs:82-88` stays until M5.

### Wave 3 pattern — how each capability moves

Applied identically six times:

1. **Port verbatim.** Copy the EP logic into an IP capability, byte-identical. No
   improvement, no cleanup — a behaviour change and a plane change must never ship together.
2. **Extend the Observation Set** with the raw inputs the IP now needs.
3. **Dual-run.** EP computes and sends; IP computes independently; a diff agent records
   deltas per tenant per run.
4. **Soak** one release. Investigate every delta — each is either an EP bug being fixed or
   a port error.
5. **Cut over.** IP output becomes authoritative; EP stops sending its version.
6. **Delete.** EP code and its tests removed in the same commit.
7. **Improve.** Only now: replace the ported regex with the real capability (a reasoning
   agent with a prompt contract and rejection rules).

Step 7 is where the platform actually gets better. Steps 1-6 exist so that it can.

---

## 18. Validation Strategy

### 18.1 Structural gates (CI, both repos)

| Gate | Asserts | Catches |
|---|---|---|
| `no-knowledge-in-observation-set` | every Observation Set field is `Observation`, `Measurement` or `Provenance` branded | V-03, V-04, V-10, V-11, V-12 |
| `no-verdict-in-step-ledger` | the Step Ledger type has no verdict/certified/approved field | V-01 |
| `no-ratio-in-ep` | no EP module emits a field named `*coverage*`, `*Percent`, `*Score`, `*ratio` | V-10, V-16 |
| `no-regex-into-crossplane` | no module in the EP's cross-plane call graph contains a regex literal | V-03, V-04, V-09, V-11, V-14 |
| `ep-agents-are-not-reasoners` | `plane:'EP'` ⇒ `aiCapabilityClass:'none'` and no `promptContract` | V-35 |
| `one-lifecycle` | the EP declares no phase list; step ids come only from a signed plan | V-02 |
| `contract-declared` | every cross-plane payload parses against a schema in `@dbiz/contracts` | C-01, C-02 |
| `no-dead-payload` | every field the EP sends is read somewhere in the IP | C-04 |
| `closed-loop-joins` | ≥1 operation ⇒ non-empty `observedExecutions` | **V-05** |
| `auth-required` | no cross-plane call passes `requireCredential: false` | V-06 |

`no-dead-payload` is worth singling out: it is cheap, it is mechanical, and it would have
caught the single largest waste in this audit — an entire discovery engine whose output
nothing reads.

### 18.2 Behavioural validation

- **Sovereignty fuzz.** Inject knowledge-shaped fields into `contextRequest`; the IP guard
  must return 422, as it already does for evidence content.
- **Determinism.** Identical Observation Set ⇒ byte-identical package. Already implied by
  the domains' determinism postconditions; assert it end to end.
- **Degradation.** IP unreachable ⇒ collection completes, interpretation blocks, no
  approximation, terminal state honest. This already works and must not regress.
- **Certification honesty.** A run whose every operation failed must never certify. Given
  V-05, **this test currently cannot pass and should be written first** as the regression
  proof for Wave 0.2.

### 18.3 Evidence of correctness

Each wave produces a governance evidence file under
`DBizIntelligencePlane/governance/capability/`, matching the existing convention (there are
already ~40). Add `plane-sovereignty-evidence.json` recording, per violation: current
state, target state, wave, gate that enforces it, and status.

---

## 19. Regression Strategy

### 19.1 The baseline

Before Wave 0, capture a **golden corpus** from `carlisle-homes/reports/` — eleven real
runs exist. For each: the `contextRequest` sent, the package received, execution outcomes,
the report. These become replay fixtures. Critically, capture them **before** Wave 0.2,
because the certification outputs will legitimately change and the delta must be
attributable.

### 19.2 Per-wave regression

| Wave | Invariant that must hold | How |
|---|---|---|
| 0 | Only certification, defaults and reported ratios change; discovery, execution and evidence are byte-identical | Replay golden corpus; diff every field; every delta must map to a listed 0.x item |
| 1 | No behaviour change at all | Docs and gates only |
| 2 | Contracts accept every golden payload | Parse the corpus against the new schemas before any producer changes |
| 3 | IP output equals ported EP output | Dual-run diff per capability; **zero** deltas required to cut over |
| 4 | Policy evaluation equals the hard-coded behaviour | Replay: same taxonomy tokens, same healing rejections, same severities |
| 5 | The 16-step plan produces the same step sequence, outcomes and evidence | Replay; compare Step Ledger against phase results |
| 6 | The hosted agent runtime produces the same Observation Set | Replay; compare fact-by-fact |
| 7 | `@1` and `@2` verify identically | Verify every corpus package under both paths |

### 19.3 Rollback

Every wave ships behind a per-tenant flag with the prior path intact for one release.
Wave 5 is the exception and needs care: once the EP interprets a plan, reverting to `PHASES`
means reverting the IP's plan emission too. Keep `PHASES` as a **fallback plan constant**
for two releases — the EP uses it only when the package carries no plan — then delete.

### 19.4 What must never regress

Non-negotiable, asserted every wave:

1. Evidence payloads do not cross the boundary.
2. No registered secret rides an outbound payload.
3. No simulated or synthesised execution outcome.
4. A refusal is honoured, never downgraded.
5. An unverified package never executes.
6. A capped or truncated collection is always reported as such.
7. The EP never emits a certification verdict.

Items 1-6 hold today and are well tested. Item 7 does not hold today and is the point of
this work.

---

## 20. Final Target Architecture

### 20.1 The rule that replaces the current one

> **Q1 — Does this require testing or business expertise?** If yes → **Intelligence Plane.**
> **Q2 — Is it directly observable from the customer system without interpretation?**
> If yes → **Execution Plane.** If no → **Intelligence Plane.**
>
> Determinism is not a test. A deterministic regex over prose is still interpretation.
> "Could two competent engineers disagree?" remains the tie-breaker, and applies to the
> *choice of the rule*, not only its output.

### 20.2 The Execution Plane, entire

```
EXECUTION PLANE  (customer tenancy)

  Collectors            ADO · repository · filesystem · browser
                        → verbatim fields, spans, artefacts, controls, revisions

  Parsers               formal specifications only (OpenAPI, WSDL, JSON Schema)

  Normalizers           encoding, whitespace, HTML→text, structural shape

  Packagers             Observation Set  (sealed, provenance-complete, knowledge-free)
                        Step Ledger      (append-only, verdict-free)
                        Evidence Manifest(references + hashes)

  Execution Runtime     browser · adapters · guardrails · session custody
                        executes the IP's signed Execution Plan, step by step

  Evidence Runtime      capture · custody · hash · retention · purge

  Synchronizers         writes the IP's decisions into customer systems
                        (test cases, plans, results, defects) — no defaults, no invention

  Policy Evaluator      evaluates IP-shipped rule tables; authors none

  EP Agent Host         hosts the capability-framework agent runtime;
                        executes IP-authored plane:'EP' agent definitions

  NOT PRESENT           agents defined locally · orchestration · reviewers · certification
                        knowledge graph · coverage · risk · priority · recommendations
                        heuristics over prose · testing policy · quality opinions
```

### 20.3 The Intelligence Plane, entire

```
INTELLIGENCE PLANE  (DBiz tenancy)

  Capability Runtime    12 stages · sealed results · governance triad · registry
  Agent Runtime         catalogue · prompt contracts · rejection rules · retry · telemetry
  Decision Engine       deterministic, AI-advisory

  Knowledge Capabilities
      Requirement Decomposition · Business Rule · Validation · Entity · Role/Persona
      State · Artefact Classification · Ambiguity · Gap · Risk
      → the Knowledge Graph (persisted, versioned, cross-run)

  Planning Capabilities
      Test Design · Coverage · Repository/Reuse · Authoring · Automation Architecture
      Execution Planning (dependency · batch · parallel · environment)
      → the signed Execution Plan

  Reflection Capabilities
      Failure Taxonomy · Root Cause · Healing Policy · Defect Genuineness
      Business Impact · Duplicate Detection · Learning

  Review & Certification
      Architecture Review · Policy Review · Guardrail Review · Certification
      → the only verdict the platform recognises

  Reporting
      Reporting Model · Coverage · Release Readiness · Executive Pack
```

### 20.4 The contract surface

```
EP → IP   ObservationSet      dbiz.observation-set@1     facts · provenance · measurements
                              guarded: no knowledge-typed field may cross

EP → IP   StepLedger          dbiz.step-ledger@1         steps · observations · evidence refs
                              guarded: no verdict field exists

EP → IP   EvidenceManifest    dbiz.evidence-ref@1        references + hashes only
                              guarded: no content field exists  ← already correct

IP → EP   ExecutionPackage    dbiz.execution-package@2   signed · sealed · content-addressed
                                                         · authored artefacts (complete)
                                                         · execution plan
                                                         · policy tables
                                                         · EP agent definitions
                                                         · evidence requirements

IP → EP   CertificationResult dbiz.certification@1       verdict · rationale · coverage
                                                         the only source of a verdict
```

Every one is versioned, schema-declared in `@dbiz/contracts`, guarded on receipt in both
directions, and covered by a `no-dead-payload` gate.

### 20.5 What this buys

- **One knowledge model.** Business rules are extracted once, by a capability with a prompt
  contract and rejection rules, and improve for every tenant at once.
- **One orchestration lifecycle.** Twelve stages, defined in one place, changeable without
  an EP release in every customer tenancy.
- **One certification authority.** A verdict exists only where the evidence and the
  reasoning meet.
- **One agent runtime.** An agent means the same thing in both planes, defined once.
- **Cross-run learning becomes possible.** `learning.knowledge-graph` and
  `learning.vector-memory` can accumulate, which a per-run EP graph could never do.
- **The Execution Plane becomes small enough to certify.** Roughly 40% of the current EP
  functional-testing code is deleted or moved. What remains — collect, execute, custody,
  synchronise — is the part that must live in the customer's tenancy, and only that part.

---

## Appendix A — Every file audited

**Execution Plane** (`carlisle-homes`) — 26 source modules, 9 test modules, 6 config bands.
`src/functional-testing/`: `index.mjs`, `orchestrator.mjs`; `phases/{discovery,intelligence,planning-automation,authoring,execution,closure}.mjs`;
`discovery/{engine,agents,facts,knowledge-graph}.mjs`; `crossplane/{client,package-verifier,gateway-package}.mjs`;
`runtime/{browser,evidence,selector-discovery,automation-repository,totp}.mjs`;
`support/{configuration,criteria,knowledge,canonical,env,identity,integrity,journal,sanitize}.mjs`;
`governance/pipeline.mjs`; `connectors/{azure-devops,http}.mjs`. Plus `src/portal/server.mjs`,
`bin/{ep,ep-update-agent}.mjs`, `docs/PLANE-OWNERSHIP.md`, `config/*`.

**Intelligence Plane** (`DBizIntelligencePlane`) —
`packages/contracts/src/*` (10 modules); `packages/capability-framework/src/*` (12 modules);
`packages/functional-testing-engine/` — `src/index.ts`, `src/model.ts`, `src/capability.ts`,
`src/orchestrators.ts`, `src/agents/*` (3), `src/domains/*` (13), `src/runtime/*` (4),
`authoring-bridge.mjs`, `selector-intelligence.mjs`, `launcher/*`;
`packages/discovery-flow-engine/src/*` (agents, orchestrators, model, capability);
`packages/tenant-onboarding-engine/ip-execute-gateway.mjs`;
`packages/platform-core/*`; `packages/platform-runtime/*`; `docs/architecture/*`;
`governance/capability/*`.

## Appendix B — Violation index

**S1:** V-01 EP certifies · V-02 EP orchestrates · V-03 business rules in EP · V-04 entities/roles in EP · V-05 broken outcome join · V-06 signing oracle · V-07 EP authors content
**S2:** V-08 decomposition · V-09 criterion classification · V-10 completeness model · V-11 artefact classification · V-12 knowledge graph · V-13 package translation + defaults · V-14 failure taxonomy · V-15 healing policy · V-16 coverage · V-17 discovery gates · V-18 completeness matrix · V-19 automation opinions · V-20 authoring loop
**S3:** V-21 selector relevance · V-22 silent caps · V-23 change significance · V-24 environmental correlation · V-25 defect metadata · V-26 traceability coverage · V-27 inert risk agent · V-28 shadow agent runtime · V-29 plan naming · V-30 knowledge block · V-31 terminal state · V-32 report judgements
**S4:** V-33 the ownership rule · V-34 prose round-trip · V-35 EP-plane reasoning agent · V-36 EP-plane planner · V-37 undeliverable EP agents
**Contracts:** C-01 two undeclared shapes · C-02 no EP→IP schema · C-03 no classification discipline · C-04 dead payload · C-05 unused certification contract · C-06 optional auth · C-07 operation identity
