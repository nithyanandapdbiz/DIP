# Intelligence Plane — Architecture Standardisation Audit & Refactoring Report

**Date:** 2026-08-01
**Scope:** every Intelligence Plane engine in `packages/`
**Reference implementation:** `@dbiz/dev-change-engine`
**Status:** refactoring executed · build green · 1064/1064 tests pass · zero new governance failures

---

## 0. Executive summary

Six Intelligence Plane engines were audited against the Dev-Change Engine template. One
engine (the reference) already conformed. **Five engines were refactored**; four of them
now conform completely, and the remaining two deviations are both bound by hash-baselined
governance artefacts and are recorded here as approved, documented exceptions.

| Measure | Before | After |
|---|---|---|
| Engines exposing the full standard file set | 1 / 6 | **6 / 6** |
| Engines with zero non-standard root files | 1 / 6 | **4 / 6** |
| Engines missing `catalogue.ts` | 5 | **0** |
| Non-standard root files across the estate | 16 | **11** (all governance-bound) |
| Registered agents | 1026 | **1026** (byte-for-byte identical) |
| Circular dependencies | 0 | **0** |
| Tests passing | 1064 | **1064** |
| Failing governance gates | 9 | **9** (unchanged — all pre-existing) |

The headline result: **`catalogue.ts` now exists in every engine**, so all six expose the
same seven-element surface at `src/`, and agent registration is no longer a side effect of
either the capability implementation or the public barrel.

---

## 1. Engine inventory

The Intelligence Plane exposes **six capabilities** (R-11.4). These are the six engines;
the remaining nine workspace packages are framework, contracts or platform services, not
engines, and are correctly out of scope for this standard.

| # | Engine | Package | Capability | Agents | Domains | Stages |
|---|---|---|---|---|---|---|
| 1 | Functional Testing Engine | `functional-testing-engine` | 1 of 6 | 94 | 13 | 12 |
| 2 | Dev-Change Engine **(reference)** | `dev-change-engine` | 2 of 6 | 129 | 21 | 12 |
| 3 | Inverse-Flow Discovery Engine | `discovery-flow-engine` | 3 of 6 | 186 | 16 | 12 |
| 4 | Performance Engine | `performance-engine` | 4 of 6 | 233 | 24 | 12 |
| 5 | Security Testing Engine | `security-testing-engine` | 5 of 6 | 164 | 26 | 12 |
| 6 | Penetration Testing Engine | `penetration-testing-engine` | 6 of 6 | 220 | 15 | 12 |
| | | | **Total** | **1026** | | |

### Not engines (correctly excluded)

| Package | What it is | Why excluded |
|---|---|---|
| `capability-framework` | The single 12-stage orchestration lifecycle (R-12.18) | Framework the engines run *inside*; owns `AgentCatalogue`, `defineAgent`, `runPhase` |
| `contracts` | Cross-plane schemas and canonical models | Contract package, no reasoning |
| `platform-core`, `platform-providers`, `platform-runtime` | Platform Services | Infrastructure layer, below engines |
| `observability`, `customer-success` | Platform Services | No agents, no capability registration |
| `tenant-onboarding-engine` | Control-plane HTTP service (NestJS) | Named "engine" but is a **control-plane service**, not an Intelligence Plane capability: no `AgentCatalogue`, no 12-stage capability, no agents. Its `domain/ engine/ server/` layout is correct for what it is. **Applying the agent-engine standard here would be wrong.** |
| `tenant-onboarding-web` | Vite/React front end | UI |

---

## 2. Folder structure compliance — current vs desired

### Target (Dev-Change Engine template)

```
<engine>/
├── src/
│   ├── agents/          autonomous reasoning components
│   ├── adapters.ts      external-system integrations
│   ├── capability.ts    the twelve-stage capability
│   ├── catalogue.ts     agent registry
│   ├── model.ts         types, DTOs, enums, contracts
│   ├── orchestrators.ts execution sequencing
│   └── index.ts         public API
├── package.json
└── tsconfig.json
```

### Before → after

| Engine | Missing before | Extra before | Missing after | Extra after |
|---|---|---|---|---|
| dev-change | — | — | — | — |
| discovery-flow | `catalogue.ts` | `report.ts` | — | **—** |
| penetration-testing | `catalogue.ts` | `report.ts` | — | **—** |
| performance | `catalogue.ts` | `report.ts`, `patterns.ts`, `twin.ts` | — | **—** |
| security-testing | `catalogue.ts` | `report.ts`, `intelligence-layer.ts` | — | `intelligence-layer.ts` ⚠️ |
| functional-testing | `catalogue.ts` | 10 root files + `domains/`, `emitters/`, `runtime/` | — | same 10 + 3 dirs ⚠️ |

⚠️ = documented architectural exception, see §7.

---

## 3. Agent inventory

Agents in this platform are **not classes**. They are `AgentDefinition` records created by
`defineAgent()` and validated at registration: an agent without a retry policy, failure
handling, telemetry, audit events, or (for reasoning agents) a prompt contract with a
non-empty rejection rule is *refused* by `AgentCatalogue.register`. This contract-first
model is the architectural standard the Dev-Change Engine sets, and it was preserved.

| Engine | Agents | IP | EP | Reasoning-enabled | Agent modules |
|---|---|---|---|---|---|
| dev-change | 129 | 98 | 31 | 10 | 7 |
| discovery-flow | 186 | 145 | 41 | 25 | 7 |
| functional-testing | 94 | 81 | 13 | 42 | 3 |
| penetration-testing | 220 | 157 | 63 | 8 | 9 |
| performance | 233 | 198 | 35 | 12 | 11 |
| security-testing | 164 | 128 | 36 | 4 | 9 |
| **Total** | **1026** | **807** | **219** | **101** | **46** |

**Every one of the 1026 agents is defined under its engine's `src/agents/` directory.**
Verified by AST-adjacent scan of all engine sources: zero agents defined outside `agents/`,
before or after the refactor.

---

## 4. Naming compliance report

### Finding: the requested `PascalCase *Agent.ts` convention conflicts with the reference implementation

The brief asks for classes named `DiscoveryAgent` in files named `DiscoveryAgent.ts`, and
asks to reject names like `planner.ts`, `review.ts`, `knowledge.ts`.

The Dev-Change Engine — which the same brief designates the architectural standard — uses
neither convention. It uses **kebab-case modules grouping contract-declared agent
definitions**: `agents/change-intelligence.ts` exporting `changeIntelligenceAgents`, whose
members carry dotted identifiers (`repository.branch-discovery`, `risk.blast-radius`).

These two instructions cannot both be satisfied. I followed **the reference implementation**,
because the brief states it "must become the architectural standard for every engine", and
because renaming 1026 agent definitions into 1026 PascalCase class files would:

- convert a validated, data-driven registry into hand-written classes, losing the
  registration-time contract enforcement that is the platform's main agent-quality control;
- break every dotted agent id, which is the key used by `catalogue.invoke(id, …)`,
  the conformance suites, the sovereignty register, and the governance gates;
- contradict the reference engine the standard is defined by.

**Assessment against the actual standard: 46/46 agent modules compliant.** All are
kebab-case, all live under `src/agents/`, all export `readonly AgentDefinition[]` arrays,
and all 1026 identifiers match the enforced `^[a-z0-9.-]+$` pattern. No renames were needed
or made.

If the PascalCase-class convention is genuinely wanted, it is a separate decision that
should start by changing the reference engine and be recorded in an ADR — not applied to
five engines while the reference keeps the old shape.

---

## 5. Ownership matrix — agent → engine

Every agent belongs to exactly one engine. `AgentCatalogue.register` rejects a duplicate id
within a catalogue, so **single ownership within an engine is machine-enforced**, not
asserted. No agent was found misplaced in the wrong engine; no agent was moved.

Domain ownership, post-refactor:

| Engine | Domains owned |
|---|---|
| dev-change | repository, diff, change, dependency, business, risk, coverage, testdiscovery, reuse, automation, authoring, execution, evidence, healing, reflection, rootcause, defect, learning, sync, reporting, governance |
| discovery-flow | scope, discovery, application-intelligence, application-model, requirement, workitem, qa, repository, automation, execution, healing, defect, sync, reporting, learning, governance |
| functional-testing | story, test, repository, authoring, planning, automation, execution, healing, defect, sync, reporting, learning, governance |
| performance | scope, discovery, surface, workload, design, guardrail, script, load, metrics, bottleneck, rootcause, capacity, optimisation, defect, learning, certification, sync, reporting, pattern, business, knowledge, twin, simulation, governance |
| security-testing | scope, requirement, inventory, context, model, authorization, guardrail, campaign, verify, evidence, assessment, compliance, remediation, posture, learning, knowledge-graph, risk-correlation, business-context, attack-surface, developer, predictive, certification, executive, contribution, sync, reporting, governance |
| penetration-testing | scope, recon, scanner, repository, assessment, risk, threat, attack-chain, ai-intel, historical, remediation, sync, reporting, learning, governance |

13 domain *names* recur across engines (`sync`, `reporting`, `execution`, `governance`, …).
This is correct: they are per-engine domains with per-engine agents, each owned by exactly
one orchestrator in its own engine. See §7 for the genuine duplication this exposes.

---

## 6. Dependency graph

**Result: zero circular dependencies, before and after.**

Verified by depth-first cycle detection over the resolved intra-package import graph of all
six engines (every `from './…'` / `from '../…'` specifier resolved to a real file).

Dependency flow, verified downward-only:

```
index.ts  (public API)
    │
    ▼
capability.ts  ──────►  catalogue.ts
    │                        │
    ▼                        ▼
orchestrators.ts  ──────►  agents/
    │                        │
    ▼                        ▼
                          model.ts
    │
    ▼
adapters.ts / @dbiz/capability-framework  (infrastructure)
```

Layering checks, all clean:

- **No agent imports `orchestrators.ts`, `capability.ts` or `catalogue.ts`** — 0 violations
  across all 46 agent modules. Agents cannot orchestrate, because they cannot see the
  orchestrator.
- **No agent imports an HTTP controller, Express route, CLI entry point or repository.**
  The Intelligence Plane packages contain none; the only controllers in the workspace are
  in `tenant-onboarding-engine`, which no engine imports.
- **Only orchestrators coordinate multiple agents.** Each domain orchestrator's `coordinate`
  invokes its agents in order; the conformance suites assert every domain contributed at
  least one observed agent invocation, so an orchestrator nothing calls fails the build.
- `catalogue.ts` → `agents/` is one-directional. This is why report rendering was placed
  under `agents/` and *not* in `catalogue.ts`: agents consume the renderers, so putting them
  in `catalogue.ts` would have created `agents/ → catalogue.ts → agents/` — a cycle. That
  constraint drove the placement decision in §8.

---

## 7. Architectural findings

### F-1 · `catalogue.ts` absent in five of six engines — **FIXED (MOVE)**

Agent registration lived inside `capability.ts` (four engines) or inside the public barrel
`index.ts` (functional-testing). The registry was therefore a side effect of the twelve-stage
implementation, or of the export surface.

**Fixed** — `catalogue.ts` created in all five, each exporting `ALL_AGENTS` and
`buildCatalogue()`. Registration order preserved exactly.

### F-2 · Report rendering at engine root — **FIXED (MOVE)**

`report.ts` sat at `src/` root in four engines — a non-standard slot. The reference engine
has no such file: it renders inside its reporting agents (`agents/sync-and-reporting.ts`,
`reporting.executive-pdf`).

**Fixed** — moved to `src/agents/report.ts` in discovery-flow, penetration-testing,
performance and security-testing, matching where the reference keeps rendering.

### F-3 · Performance pattern registry and digital twin at root — **FIXED (MOVE)**

`patterns.ts` (30-pattern registry + `matchPatterns` detector) and `twin.ts` (digital-twin
construction, scenario simulation, forecasting) were root files containing reasoning
consumed exclusively by `agents/intelligence-layer.ts` and `agents/predictive-layer.ts`.

**Fixed** — moved to `src/agents/patterns.ts` and `src/agents/twin.ts`, beside their only
consumers.

### F-4 · `ALL_AGENTS` assembled in the public barrel — **FIXED (MOVE)**

`functional-testing-engine/src/index.ts` imported three agent modules purely to build
`ALL_AGENTS`, mixing registry construction into the API surface.

**Fixed** — moved to `catalogue.ts` and re-exported. Same value, same order, same name.

### F-5 · Duplicated governance triad across five engines — **KEEP, recorded as debt**

36 agent identifiers (`governance.<stage>.review`, `.decision`, `.certification` for all
twelve stages) are implemented **five times**, once per engine, in each engine's
`agents/governance.ts`. That is ~180 near-identical agent definitions.

**Recommendation: MERGE** — hoist the governance triad into `@dbiz/capability-framework` as
a parameterised factory (`governanceAgentsFor(STAGE_RULES)`), leaving each engine to supply
only its own `STAGE_RULES`.

**Not done in this change, deliberately.** It alters `capability-framework`, which all six
engines and 60 governance gates depend on, and it is a behavioural change rather than a
structural one. It belongs in its own ADR-backed change with its own risk assessment. This
refactor was scoped to structure with provably identical behaviour.

### F-6 · 65 non-governance agent ids reused across engines — **KEEP**

`sync.defects` appears in all six engines, `sync.evidence` and `sync.traceability` in five,
and so on. Each is a *different implementation* over a different model in a separately
registered catalogue, so there is no collision and no dead code. The repetition is real but
it is convergent design, not duplication of a single component. Worth revisiting only if a
shared synchronisation/reporting library is ever extracted; not a defect today.

### F-7 · Dead, unreachable or legacy agents — **NONE FOUND**

Transitive reachability analysis from each engine's registration site, resolving aggregate
arrays (e.g. security's `intelligenceLayerAgents`, which composes nine sub-arrays):
**every declared agent array in all six engines reaches its catalogue. Zero dead agents,
zero unreachable agents, zero orphan agent modules.**

An earlier pass flagged nine security-testing arrays as unregistered; that was a false
positive from non-transitive analysis and is corrected here.

### F-8 · Business logic in orchestrators / orchestration in agents — **NONE FOUND**

No agent module imports an orchestrator. Domain orchestrators sequence, fan out and
aggregate; the twelve-stage runner in `capability-framework` is the only lifecycle, and no
engine defines a second one (R-12.18 holds).

---

## 8. Approved deviations (documented architectural reasons)

Phase 4 permits deviation "with a documented architectural reason". Two exist. Both are
cases where the standard structure is blocked by a **hash-baselined governance artefact**,
and where forcing conformance would break gates that pass today.

### D-1 · `security-testing-engine/src/intelligence-layer.ts` stays at root

The natural fix is to merge it into `src/agents/intelligence-layer.ts`, its only consumer.

**Blocked because:** `ADR-0029` names this exact path in its affected-components section and
marks it **New**. `verify-change-control-completeness.js` resolves every such path and fails
if it is absent — its resolver has no `packages/**` fallback, so the move alone adds two
violations. Editing the ADR to correct the path is also unavailable:
`verify-programme-closure.js` compares a SHA-256 of every ADR against
`governance/closure/baseline.json`, so any edit fails the closure gate as a silent amendment.

**Resolution:** keep the file. Fold it into `agents/intelligence-layer.ts` as part of a
future change that re-baselines the closure package deliberately
(`node governance/closure/emit-closure-package.mjs program`), which is the sanctioned route.

### D-2 · `functional-testing-engine` keeps 10 root files and `domains/`, `emitters/`, `runtime/`

Every one of these 13 paths is named literally by governance:

- `src/domains/*.ts` (13 files) — bound by 13 currently-**passing** domain gates:
  `verify-execution-domain.js`, `verify-healing-domain.js`, `verify-defect-management-domain.js`,
  `verify-synchronisation-domain.js`, `verify-executive-reporting-domain.js`,
  `verify-story-intelligence-domain.js`, `verify-test-design-domain.js`,
  `verify-test-management-domain.js`, `verify-repository-intelligence-domain.js`,
  `verify-automation-architecture-domain.js`, `verify-automation-intelligence-domain.js`,
  `verify-tenant-resolution-domain.js`, `verify-application-strategy-domain.js` —
  plus `governance/functional-workflow/business-capability-matrix.json` and
  `governance/capability/sovereignty-register.json`, which cite
  `src/domains/<file>.ts#<symbol>` as producer references.
- `src/runtime/*.ts`, `src/emitters/executable-automation.ts` and the 10 root files
  (`activation.ts`, `canonical-*.ts`, `runtime-*.ts`, `production-qualification.ts`,
  `legacy-retirement.ts`, `functional-workflow-context.ts`) — bound by
  `verify-runtime-enablement.js`, `verify-canonical-runtime-integration.js`,
  `verify-capability-activation.js`, `verify-legacy-retirement-readiness.js`,
  `verify-production-qualification.js`, `verify-runtime-cutover-readiness.js` and
  `governance/verification/record-fault-proofs.js`.

These are also not agent code: `domains/` holds ADR-0039/0066 canonical domain
implementations, `runtime/` holds ADR-0050 execution-plane transport, `emitters/` holds
automation emission. They are a *different* architectural layer that the seven-file template
does not model.

**Resolution:** keep. `catalogue.ts` was still extracted, so the engine now exposes the full
standard surface; the extra structure sits alongside it. Consolidating it requires
re-pointing 19 governance gates and two frozen JSON matrices, which is its own change.

---

## 9. Refactoring plan as executed

### Files created (5)

| File | Contents |
|---|---|
| `discovery-flow-engine/src/catalogue.ts` | `ALL_AGENTS` (16 arrays) + `buildCatalogue()` |
| `functional-testing-engine/src/catalogue.ts` | `ALL_AGENTS` (9 arrays) + `buildCatalogue()` |
| `penetration-testing-engine/src/catalogue.ts` | `ALL_AGENTS` (23 arrays) + `buildCatalogue()` |
| `performance-engine/src/catalogue.ts` | `ALL_AGENTS` (25 arrays) + `buildCatalogue()` |
| `security-testing-engine/src/catalogue.ts` | `ALL_AGENTS` (19 arrays) + `buildCatalogue()` |

### Files moved (6)

| From | To |
|---|---|
| `discovery-flow-engine/src/report.ts` | `src/agents/report.ts` |
| `penetration-testing-engine/src/report.ts` | `src/agents/report.ts` |
| `performance-engine/src/report.ts` | `src/agents/report.ts` |
| `performance-engine/src/patterns.ts` | `src/agents/patterns.ts` |
| `performance-engine/src/twin.ts` | `src/agents/twin.ts` |
| `security-testing-engine/src/report.ts` | `src/agents/report.ts` |

### Files modified (15)

Five `capability.ts` (registration removed, `buildCatalogue` imported, unused agent imports
pruned), five `index.ts` (barrel re-pointed), five agent/orchestrator modules whose relative
specifiers changed depth.

### Renames

**None.** See §4 — no agent module or identifier violated the enforced convention.

### Public API impact

**None breaking.** `buildCatalogue` is still exported from each engine's barrel under the
same name; it now originates in `catalogue.ts` instead of `capability.ts`, which is internal.
`ALL_AGENTS` is now additionally exported by the four engines that did not expose it —
purely additive. No export was removed or renamed.

---

## 10. Validation evidence

All figures below are measured, not asserted.

### Structure

```
Standard file compliance (adapters · capability · catalogue · model · orchestrators · index):
  dev-change-engine            missing: —   extra: —
  discovery-flow-engine        missing: —   extra: —
  penetration-testing-engine   missing: —   extra: —
  performance-engine           missing: —   extra: —
  security-testing-engine      missing: —   extra: intelligence-layer.ts   (D-1)
  functional-testing-engine    missing: —   extra: 10 files, 3 dirs        (D-2)
```

- ✅ **6/6 engines expose every standard file.** `catalogue.ts` existed in 1 engine before,
  6 after.
- ✅ **4/6 engines have zero deviation.** The two remaining are D-1 and D-2 above.
- ✅ **1026/1026 agents reside under `src/agents/`.**
- ✅ **Every autonomous reasoning component is a contract-validated `AgentDefinition`**
  registered in exactly one engine catalogue.

### Behaviour — no regression

- ✅ **Agent registration byte-for-byte identical.** All six catalogues were loaded from
  `dist/` before and after and every agent's `(engine, id, domain, stage, plane,
  aiCapabilityClass)` tuple was diffed: **1026 rows, zero differences.**
- ✅ **Build:** `pnpm build` — all 15 packages compile, exit 0.
- ✅ **Tests:** **1064 pass, 0 fail** — identical to baseline, per package:

  | Package | Before | After | | Package | Before | After |
  |---|---|---|---|---|---|---|
  | dev-change | 47 | 47 | | contracts | 99 | 99 |
  | discovery-flow | 54 | 54 | | platform-core | 86 | 86 |
  | functional-testing | 213 | 213 | | customer-success | 38 | 38 |
  | penetration-testing | 37 | 37 | | observability | 57 | 57 |
  | performance | 53 | 53 | | platform-providers | 20 | 20 |
  | security-testing | 14 | 14 | | tenant-onboarding | 304 | 304 |
  | capability-framework | 42 | 42 | | **Total** | **1064** | **1064** |

- ✅ **Governance:** every gate's PASS/FAIL verdict was captured before and after and
  compared. **The sets are identical — zero new failures.**
- ✅ `pnpm governance:workflow` — **PASS**, workflow compliance certificate reissued.
- ✅ `governance:workflow:convergence` — **CONVERGED**, 22 slots, 22 provenance.
- ✅ No stale references: repo-wide grep for the six old paths returns nothing outside
  `dist/`; stale build artefacts were removed and the workspace rebuilt clean.

### Pre-existing conditions (not caused by, and not fixed by, this change)

- `platform-runtime` tests fail with `spawnSync openssl ENOENT` — the mTLS integration
  suite shells out to `openssl`, which is absent from this machine's PATH. **Environmental**,
  unrelated to the Intelligence Plane, present at baseline.
- `pnpm govern` exits 1 with 9 failing gates (`verify-ai-vendor-neutrality`,
  `verify-implementation-traceability`, `verify-change-control-completeness`,
  `verify-governance-self-validation`, `verify-operational-readiness`,
  `verify-customer-readiness`, `verify-production-readiness`, `verify-intent-conservation`,
  `verify-programme-closure`). **All nine failed identically before this work.**
- No lint script exists in the workspace; `tsc` under the strict base config is the
  equivalent gate and passes.

---

## 11. Recommendations by disposition

| Finding | Disposition | Status |
|---|---|---|
| F-1 missing `catalogue.ts` ×5 | **MOVE** | ✅ done |
| F-2 `report.ts` at root ×4 | **MOVE** | ✅ done |
| F-3 `patterns.ts`, `twin.ts` at root | **MOVE** | ✅ done |
| F-4 `ALL_AGENTS` in barrel | **MOVE** | ✅ done |
| F-5 governance triad ×5 engines | **MERGE** into `capability-framework` | ⏸ deferred — needs ADR |
| F-6 65 reused agent ids | **KEEP** | ✅ no action |
| F-7 dead / legacy / unreachable agents | — | ✅ none exist |
| F-8 misplaced orchestration | — | ✅ none exist |
| D-1 security `intelligence-layer.ts` | **MOVE** when closure is re-baselined | ⏸ blocked by ADR-0029 hash |
| D-2 functional-testing extra structure | **KEEP** | ✅ documented |

### Suggested next steps

1. **F-5 (highest remaining value):** hoist the governance triad into
   `capability-framework`, removing ~180 duplicated definitions across five engines.
2. **D-1:** fold `intelligence-layer.ts` into `agents/intelligence-layer.ts` in the same
   change that next re-baselines the closure package.
3. **D-2:** if the seven-file template should also govern the canonical-domain layer,
   extend the template with a documented eighth slot rather than flattening
   `functional-testing-engine` into it — the gates and the frozen matrices encode that
   layer deliberately.

---

## 12. Success criteria assessment

| Criterion | Result |
|---|---|
| Every engine adheres to one canonical architecture | ✅ 6/6 expose the full standard surface; 4/6 with zero deviation, 2 documented |
| Every autonomous reasoning component is identifiable as an agent | ✅ all 1026 are contract-validated `AgentDefinition`s, refused at registration if incomplete |
| Every agent resides under `src/agents/` | ✅ 1026/1026 |
| Every agent orchestrated only through the engine orchestrator | ✅ 0 agent→orchestrator imports; domain orchestrators are the only coordinators |
| Dependencies flow downward, no cycles | ✅ 0 circular dependencies |
| The solution builds | ✅ `pnpm build` exit 0 |
| All automated tests pass | ✅ 1064/1064 (excluding the pre-existing environmental `openssl` failure) |
| No functionality regressed | ✅ 1026 agent registrations byte-for-byte identical; governance verdicts unchanged |
