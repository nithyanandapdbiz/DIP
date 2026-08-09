# 22 — Security Threat Model

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.4
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md)

**This document owns:** threat actors, assets, attack paths, the threat-to-mitigation map, **replay protection**, and **supply-chain security**.
**It does not own:** the controls themselves. Trust boundaries, identity, authentication, authorisation, secrets, encryption and package signing are owned by [08](08-security-model.md); tenant isolation by [07](07-tenant-isolation.md); data classification by [06](06-data-sovereignty.md); evidence integrity by [10](10-evidence-flow-model.md); transport by [05](05-cross-plane-communication.md).

**This document enumerates what an adversary would attempt and maps each to the control that stops it. It restates no control.**

---

## 1. Assets

| # | Asset | Held by | Loss consequence |
|---|---|---|---|
| **A1** | Customer credentials | Execution Plane | Direct compromise of customer systems |
| **A2** | Customer application data | Execution Plane | Confidentiality breach; regulatory exposure |
| **A3** | Execution evidence | Execution Plane | Certifications become unverifiable |
| **A4** | Certification decisions | Intelligence Plane | Releases authorised on false assurance |
| **A5** | Package signing keys | DBiz | Adversary directs execution in every customer tenancy |
| **A6** | Tenant configuration and registry | Intelligence Plane | Cross-tenant exposure; entitlement bypass |
| **A7** | Platform reasoning and knowledge graph | Intelligence Plane | Commercial loss; possible cross-tenant inference |

**A5 is the crown jewel.** It is the only asset whose compromise grants an adversary reach into *every* customer tenancy simultaneously, and it is the reason package signing keys are held in DBiz infrastructure only, never distributed, and rotatable without customer redeployment ([08](08-security-model.md) §5).

## 2. Threat actors

| Actor | Position | Capability |
|---|---|---|
| **T1 — External attacker** | Internet | Reaches DBiz public surfaces only; no path into customer tenancy |
| **T2 — Malicious tenant** | Authenticated customer | Full control of their own Execution Plane; may send arbitrary input to the Intelligence Plane |
| **T3 — Compromised Execution Plane** | Inside one customer tenancy | Holds that customer's credentials and evidence |
| **T4 — Compromised Intelligence Plane** | Inside DBiz | Holds judgments, hashes, configuration; **no customer credentials** |
| **T5 — Malicious insider (DBiz)** | Privileged DBiz access | Administrative surfaces, potentially signing keys |
| **T6 — Supply-chain adversary** | Upstream dependency | Code execution in either plane at build or run time |
| **T7 — Application under test** | Target system | Returns adversarial content into Discovery, Evidence, and AI context |

**T7 is the actor most often omitted from threat models of this kind.** The system under test is, by definition, of unknown quality and possibly compromised — and the platform ingests its output into reasoning. It must be treated as hostile input, not as data.

## 3. Attack paths and mitigations

Each path names the control that stops it and the criterion that proves the control runs. **No mitigation is described here; each is a reference.**

### 3.1 Against sovereignty

| # | Attack | Mitigation | Criterion |
|---|---|---|---|
| **P-01** | T4 pivots from Intelligence Plane into a customer tenancy | No inbound path exists; DBiz initiates nothing ([05](05-cross-plane-communication.md) R-05.1) | C-05.2, C-08.1 |
| **P-02** | T4 exfiltrates customer data from DBiz storage | Customer data is ephemeral and never persisted ([06](06-data-sovereignty.md) R-06.9) | C-06.11 |
| **P-03** | T5 reads customer data through admin tooling | Admin surfaces carry the same isolation and authorisation as application surfaces ([07](07-tenant-isolation.md) R-07.10) | C-07.10, C-08.5 |
| **P-04** | T4 decrypts customer-tenancy data | Customer-tenancy data is encrypted under customer-held keys ([08](08-security-model.md) R-08.23) | C-08.13 |

### 3.2 Against tenant isolation

| # | Attack | Mitigation | Criterion |
|---|---|---|---|
| **P-05** | T2 reads another tenant's data by manipulating identifiers | Physical partitioning through one validated constructor ([07](07-tenant-isolation.md)) | C-07.1, C-07.3 |
| **P-06** | T2 asserts another tenant's identity | Scope derives from authenticated principal, never a supplied field ([08](08-security-model.md) R-08.6) | C-07.11, C-08.3 |
| **P-07** | T2 reads another tenant's data via a shared cache entry | Tenant-keyed cache namespace ([07](07-tenant-isolation.md) dimension 6) | C-07.7 |
| **P-08** | T2 extracts another tenant's data through AI context | No cross-tenant context, retrieval, or few-shot content (dimension 8) | C-07.8 |
| **P-09** | T2 exhausts shared capacity to degrade others | Per-tenant quotas (dimension 10) | C-07.12 |

### 3.3 Against integrity of execution

| # | Attack | Mitigation | Criterion |
|---|---|---|---|
| **P-10** | T1/T3 forges an execution package | Packages are signed; verification precedes execution ([08](08-security-model.md) R-08.13/14) | C-08.8 |
| **P-11** | Signature failure is treated as an outage, so execution proceeds | Verification failure is classed **refusal**, not unavailability | C-08.9, C-05.3 |
| **P-12** | **Replay** of a previously valid package | §4 | C-22.1–C-22.4 |
| **P-13** | T3 alters evidence after capture | Content addressing with domain-separated hashing ([10](10-evidence-flow-model.md)) | C-10.13 |
| **P-14** | T3 fabricates evidence for work never performed | Every evidence record binds to its producing package hash (R-10.4); see AD-024 | C-10.7 |
| **P-15** | T2 submits a degraded result for certification | Degraded results are a distinct type the certification interface refuses (R-10.3/4) | C-05.7, C-10.11 |

**P-14 is only partially mitigated, and that is stated deliberately.** Hashing proves evidence has not *changed*; it does not prove *who produced it*. Full mitigation requires Execution Plane signing of evidence, which is recorded as AD-024 and remains open ([10](10-evidence-flow-model.md) §8). Recording a partial mitigation as partial is required by R-11.5 — absence of an answer is not evidence of absence of a problem.

### 3.4 Against reasoning

| # | Attack | Mitigation | Criterion |
|---|---|---|---|
| **P-16** | T7 injects instructions via application content into AI context | A model cannot determine control flow, select tools, or compute decisions (R-8.2, R-8.5) | C-08.14, C-01.21 |
| **P-17** | T7 causes a model to emit a passing verdict | Verdicts are computed by deterministic gates only (INV-4) | C-01.21, C-03.7 |
| **P-18** | T2 supplies crafted context to skew certification | Gates are deterministic and evaluate evidence, not narrative | C-03.7 |
| **P-19** | T7 content causes unbounded cost | Guardrail Review enforces cost and blast-radius limits ([12](12-capability-orchestration.md) stage 6) | C-12.6 |

**Prompt injection is structurally neutralised rather than filtered.** Because no privilege is reachable by a model, a successful injection can alter generated *content* but cannot alter *what the platform does* — there is no decision, branch, or tool selection for it to reach. This is why R-8.2 is a security control and not merely a reproducibility one.

### 3.5 Against the supply chain

| # | Attack | Mitigation | Criterion |
|---|---|---|---|
| **P-20** | T6 introduces malicious code via a dependency | §5 | C-22.5–C-22.9 |
| **P-21** | T6 substitutes a shared contract package | Version pinning, lockfile enforcement, signature verification ([19](19-repository-ownership.md) R-19.4) | C-19.2, C-22.7 |
| **P-22** | T6 compromises a build to emit a trojaned image | Reproducible builds, provenance attestation, image signing | C-22.8 |
| **P-23** | Dependency confusion via a public package shadowing a private one | Scoped private registry; public fallback disabled | C-22.9 |

## 4. Replay protection

**R-22.1** Every execution package SHALL carry a **validity window**, and the Execution Plane SHALL refuse an expired package.

**R-22.2** Every package SHALL carry a **unique run correlation identity**. Execution is idempotent with respect to it (R-20.11).

**R-22.3** Re-presenting a package already executed for its run SHALL NOT produce a second execution.

**R-22.4** Every cross-plane request SHALL carry a **nonce**, and the Intelligence Plane SHALL reject a repeated nonce within the validity window.

**R-22.5** Package caching for degraded operation ([05](05-cross-plane-communication.md) §4) SHALL be bounded by the validity window. **A cached package is not exempt from expiry.**

**R-22.5 closes an interaction that is easy to miss.** Degraded operation deliberately re-executes a cached package while the Intelligence Plane is unreachable — which is, mechanically, a replay. The distinction between legitimate degraded reuse and adversarial replay is *entirely* the validity window and the idempotency identity. Without R-22.5, the availability feature would be an authorised replay channel.

## 5. Supply-chain security

**R-22.6** Dependencies SHALL be **pinned by lockfile**, and builds SHALL fail on lockfile drift.

**R-22.7** The private registry SHALL be **scoped**, with public-registry fallback **disabled**, so a public package cannot shadow a private one.

**R-22.8** Every build SHALL produce an **SBOM** and a **provenance attestation**, and images SHALL be **signed**.

**R-22.9** Dependencies SHALL be scanned for known vulnerabilities on every build. A finding above the declared severity threshold fails the build.

**R-22.10** Supply-chain controls SHALL **execute on every commit**, not only on release. A control that runs only at release is unproven for the code that reaches customers between releases.

**R-22.11** Build provenance SHALL be verifiable by the customer for the Execution Plane artefacts they deploy.

**R-22.10 records a specific predecessor gap.** Its supply-chain pipeline — scan, SBOM, signing — was authored and triggered only on tags, and its own audit could not establish that it had **ever executed**. An authored-but-never-run control is indistinguishable from an absent one, and worse, because it appears on the control inventory.

## 6. Residual risks

**Stated, not hidden.** R-11.5 requires open questions to be recorded rather than guessed.

| # | Residual risk | Status |
|---|---|---|
| **RR-1** | Evidence authorship is unproven — hashing proves integrity, not origin | AD-024 open |
| **RR-2** | A compromised Execution Plane can misreport results within its own tenancy | Accepted: it is the customer's own infrastructure and their trust boundary |
| **RR-3** | T5 with signing-key access could author packages for any tenant | Mitigated by key custody and rotation; full mitigation needs hardware-backed signing — AD-028 |
| **RR-4** | PII scrubbing false negatives | AD-023 open; false-negative posture must be declared |
| **RR-5** | Cross-tenant inference through the knowledge graph | Presumed prohibited until AD-020 rules otherwise |

## 7. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-22.1** | An expired package is refused | Expiry negative test |
| **C-22.2** | Re-presenting an executed package produces no second execution | Idempotency test |
| **C-22.3** | A repeated nonce is rejected within the validity window | Replay negative test |
| **C-22.4** | A cached package is refused once its validity window closes | Degraded-mode expiry test |
| **C-22.5** | Builds fail on lockfile drift | Drift injection test |
| **C-22.6** | A vulnerability above threshold fails the build | Seeded-advisory test |
| **C-22.7** | A substituted or unsigned shared package is rejected | Substitution negative test |
| **C-22.8** | Every build emits an SBOM and provenance attestation, and images are signed | Artefact presence gate |
| **C-22.9** | A public package cannot shadow a private one | Dependency-confusion negative test |
| **C-22.10** | Supply-chain controls execute on every commit, and a skipped run reports `NOT RUN` and fails | CI trigger audit |
| **C-22.11** | Every attack path in §3 maps to a criterion that runs | Threat-to-criterion reconciliation gate |

**C-22.11 is the check that keeps this document honest.** A threat model decays into fiction the moment a mapped mitigation stops running, and nothing about the document itself would reveal it. Reconciling every path against a *currently executing* criterion makes decay visible on the commit that causes it.

## 8. Open items

| # | Item | Target |
|---|---|---|
| **AD-024** | Execution Plane signing of evidence (closes RR-1) | M1.5 |
| **AD-028** | Hardware-backed signing key custody (reduces RR-3) | M1.5 |
| **AD-023** | PII scrubbing false-negative posture (closes RR-4) | M1.5 |
| **AD-022** | Incident response and breach notification across the split | M1.5 |
