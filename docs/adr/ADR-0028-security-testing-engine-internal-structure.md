# ADR-0028 — The Security Testing Engine's verification domains are internal structure over twelve stages, and its scope is bounded against the Penetration Testing Engine

**Status:** ACCEPTED · **Date:** 2026-07-23

## 1. Problem

A brief specified a world-class **Security Testing Engine** — threat modelling, twenty-plus capability domains, exhaustive vulnerability coverage, security test generation, compliance mapping, executive reporting — to equal or exceed Burp Suite Enterprise, Invicti, Checkmarx, Veracode, Snyk, Wiz and the rest, as a first-class capability of the platform, with AI-enabled and non-AI modes, reusing every existing engine and requiring no architectural change.

Executed literally, the brief cannot be carried out inside the certified architecture, for the same structural reasons the Functional Testing ([ADR-0022](ADR-0022-functional-testing-engine-internal-structure.md)), Inverse-Flow Discovery ([ADR-0023](ADR-0023-discovery-flow-engine-internal-structure.md)), Dev-Change ([ADR-0024](ADR-0024-dev-change-engine-internal-structure.md)) and Penetration Testing ([ADR-0027](ADR-0027-penetration-testing-engine-internal-structure.md)) engines could not. This ADR records what was established from disk, what was decided, and what deviates from the brief.

## 2. Context

**The capability is already named canonically, and it is capability 5.** [Document 11](../architecture/11-capability-model.md) §2 names capability 5 the **Security Testing Engine** — *"Does it satisfy its security requirements?"*. It is not a new capability and must not be built as one: R-11.4 fixes the platform at exactly six, and a seventh would require its own ADR and would make the cardinality rule uncheckable by inspection. This engine is the *first implementation* of capability 5, built as internal structure over the twelve frozen stages.

**The scope overlaps an already-built capability, and must be bounded against it.** Capability 6, the **Penetration Testing Engine**, is built and verified ([ADR-0027](ADR-0027-penetration-testing-engine-internal-structure.md)): 220 agents, 34 scanners, a Threat Intelligence engine, MITRE/CVE/CWE/CAPEC, attack chains, active-full exploitation. Much of the brief's "exhaustive vulnerability coverage" — SQL injection, XSS, SSRF, command injection, attack chains — is *adversarial exploitation*, which capability 6 already owns. Re-implementing it under capability 5 would be the duplicate engine the brief itself forbids and the constitution prohibits (CHARTER §4). The line document 11 draws is between the two questions: capability 5 asks *does it satisfy its security requirements* (verification), capability 6 asks *can it be compromised by an adversary* (exploitation).

**The brief's twenty-plus domains and forty-plus workflow steps are a second lifecycle.** [Document 12](../architecture/12-capability-orchestration.md) R-12.18 permits exactly one orchestration lifecycle; a capability extends the framework internally and never redefines it. The brief's domains and steps are internal structure of the twelve stages, not a lifecycle of their own — and the brief's own instruction ("no duplicate framework, no duplicate workflow") agrees.

**Agent stubs are architecturally unrepresentable.** Document 11 (R-11.12, R-11.15, R-11.16) makes an incomplete capability impossible to register, and R-11.14 records why in the platform's own words. Writing a large agent catalogue with no executed evidence would recreate the *declared-but-unbuilt* defect this programme exists to prevent.

## 3. Alternatives

**Build a standalone security scanner.** Rejected: the brief explicitly forbids it, and it would be a second framework, a second workflow and a second reporting engine — every duplication the constitution prohibits.

**Add a seventh capability.** Rejected: R-11.4. The Security Testing Engine already exists as capability 5.

**Own the full adversarial scope (SQLi/XSS/SSRF exploitation, attack chains, MITRE).** Rejected: capability 6 owns and implements it. Capability 5 coordinates and consumes; it does not re-scan. The boundary is enforced structurally (§4).

**Generate the agents as stubs now, fill them later.** Rejected on the architecture's own terms (R-11.14–R-11.16), and doubly so given R-11.14's provenance.

**Implement as internal structure over the twelve stages, verification-scoped, and build it end to end.** **Chosen** — following the four engine precedents, which built rather than deferred.

## 4. Decision

**The Security Testing Engine's seventeen domains and 143 agents are INTERNAL structure of one capability. They map onto the twelve stages; they do not replace them.** The canonical mapping:

| Canonical phase(s) | Twelve-stage home | Plane |
|---|---|---|
| Verification request, scope, security-requirement elicitation (ASVS, OWASP Top 10, OWASP API Top 10, SDL, privacy, AI) | **1 Planning** | IP |
| Resource inventory — endpoints, headers, cookies, TLS, dependencies, IaC, containers, Kubernetes, cloud, secrets, source, auth, privacy, AI config | **2 Discovery** | **EP** |
| Fact minimisation — the single structure-only crossing | **3 Context** | EP→IP |
| **Security Requirement Model** *(trust boundaries, assets, in-scope categories, exposure)* | **4 Architecture Review** | IP |
| **Verification Authorization** *(category selection, ASVS-level policy, intrusive rejection)* | **5 Policy Review** | IP |
| **Verification Guardrails** *(read-only, no-intrusive, authorization, scope, production)* | **6 Guardrail Review** | IP |
| Verification campaign assembly | **7 Execution Planning** | IP |
| Read-only, deterministic checkers (SAST, SCA, secrets, headers, CORS, CSP, cookies, TLS, certificates, IaC, container, Kubernetes, cloud, authn, authz, session, privacy, AI) | **8 Execution** | **EP** |
| Evidence by reference, hashed, EP custody | **9 Evidence** | **EP** |
| Assessment, compliance mapping (12 frameworks), remediation, posture scoring, learning | **10 Reflection** | IP |
| Security certification | **11 Certification** | IP |
| Synchronization and executive reporting | **12 Reporting** | IP |

**The governance triad is the answer to "where is the review the brief did not name".** The Security Requirement Model (4), Verification Authorization (5) and Verification Guardrails (6) are the three mandatory Review stages, expressed in verification terms. **No checker runs before the guardrail stage certifies.**

**The capability-5/6 boundary is enforced structurally, not by convention.** A request for an intrusive category — SQL injection, XSS, SSRF, command injection, attack-chain, and the rest of `INTRUSIVE_CATEGORIES` — is detected at scope, rejected at authorization, and *refused at the guardrail stage before the execution stage is reached*, because active exploitation is capability 6. This is the verification analogue of pentest's "no destructive probe on production", and the conformance property P-9 proves it by execution: an SQL-injection request fails at `guardrail-review` and never completes `execution`.

**Sovereignty is in the types.** `ObservedResource` and `RawWeakness` carry the customer's configuration content and the proving snippet, and never leave the Execution Plane. `SecurityFact` carries attribute *names*, never values; `Weakness` carries a category, a location, a CWE and an evidence *reference*, and has no field for a snippet. `EvidenceReference` has a hash and a locator and no content field. The crossings are exactly two functions, `minimiseFact` and `minimiseWeakness` — the same posture Discovery's `minimise` and pentest's `minimiseFinding` took.

**AI-enabled and non-AI modes are one workflow.** `sectest.aiEnabled` is translated onto the capability-neutral `ai.enabled` in the master orchestrator (C-11.11). 142 of 143 agents are wholly deterministic; one — false-positive reduction — declares a reasoning class with a prompt contract and a deterministic degraded path. Disabling reasoning withholds proposals; the same stages and agents run, and the engine completes and certifies (INV-7, proven by P-8 with 143 proposals withheld). This matches R-11.7, which already records that Security Testing execution requires no reasoning.

**Adapters remain the only locus of variation.** Azure DevOps and a cloud Security Hub publish through one `SecurityAdapter` SPI in an identical sequence; the orchestrator names no provider, proven by P-5 and P-5.n.

## 5. Consequences

**The capability count is unchanged: six.** Seventeen domains and 143 agents are internal to one capability and create no seventh.

**No architecture document changes.** Documents 11 and 12 already own capability structure and orchestration; this ADR adds no topic. The 25 frozen documents are untouched (P-10.a).

**One gate built, passing standalone, with embedded negative detection.** `governance/verification/verify-sectest-conformance.js` and its scenario prove, by execution, the twelve-stage traversal, the governance triad, one-workflow-across-two-providers, EP/IP ownership, INV-7, and the property that most distinguishes this capability from capability 6 — *an intrusive request is refused before any checker*. `node governance/verification/verify-sectest-conformance.js` exits 0 and writes `governance/capability/sectest-evidence.json`.

**Registering the gate in `run-all.js` and re-baselining closure are a deliberate, human-reviewed final step — recorded here, not silently performed.** This is the designed path (ADR-0022, 0023, 0027 took it): amending after closure is permitted, amending *silently* is not. Registration and the closure re-baseline are additionally **deferred** because a concurrent capability build (the Performance Engine) shares the working tree, and freezing a tree another author is actively writing is exactly the failure the closure gate prevents. The gate stands as an independently runnable, green verifier until the tree is stable and the amendment can be reviewed.

## 6. Migration strategy

Nothing migrates. Capability 5 is a first implementation — there is no prior engine, no data, no registry entry and no consumer. The build order was fixed by the architecture: all twelve stages including the governance triad first, register only when complete (R-11.12), domain orchestrators and agents behind the stage boundaries, adapters behind the SPI, and the execution path verified before the capability is presentable (R-11.14) — which the conformance suite and the 11-test unit suite do. Rollback is the removal of `packages/security-testing-engine`, its scenario and its gate; no other package imports it, and the framework gained no Security-Testing-specific code (C-11.11 would forbid it).

## 7. Version impact

No contract version changes. No architecture document version changes. No ADR is superseded. ADR-0021 is untouched. The `@dbiz/capability-framework` is unchanged — the engine adds no framework code and no new SPI, reusing the `SecurityAdapter` shape. The closure baseline hash will change when `docs/adr/` and `packages/` are admitted at the next deliberate re-baseline; that change is recorded, not incidental, and is deferred with the gate registration (§5).

## 8. Affected components

- `docs/adr/ADR-0028-security-testing-engine-internal-structure.md` — **New**. This record.
- `packages/security-testing-engine/` — **New**. Capability 5, 143 agents across seventeen domains and the twelve stages, 11 conformance tests.
- `governance/verification/verify-sectest-conformance.js` — **New**. The standalone conformance gate (registration deferred, §5).
- `governance/capability/run-sectest-conformance.mjs` — **New**. The gate's scenario harness.
- `docs/capability/SECURITY-TESTING-ENGINE.md` — **New**. Capability documentation.
- `program/SECURITY_TESTING_ENGINE_IMPACT_ANALYSIS.md` — **New**. The impact analysis for this work.
- `governance/verification/run-all.js` — **Unchanged (registration deferred)**. No shared runner file was modified.
- `program/IMPLEMENTATION_STATUS.md` — **Unchanged (deferred)**. Programme-state reconciliation is deferred with the closure re-baseline.
