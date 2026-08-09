# 21 — Tenant Lifecycle

**Status:** **FROZEN** · **Version:** 1.3 · **Date:** 2026-07-23 · **Milestone:** P1 / M1.2
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 3, 6 and 9
**Amendments:** v1.1 — onboarding workflow, Execution Plane bootstrap and extended lifecycle operations added by [ADR-0021](../adr/ADR-0021-platform-core-bounded-context.md) (additive; no boundary changed) · v1.2 — onboarding orchestration and the lifecycle projection added by [ADR-0030](../adr/ADR-0030-tenant-lifecycle-management-orchestration.md) (additive; no canonical state changed) · v1.3 — **implementation re-founding** by [ADR-0034](../adr/ADR-0034-tenant-onboarding-engine-refounding.md): the onboarding *implementation* is consolidated into the "Tenant Onboarding Engine" (packages `tenant-onboarding-engine` + `tenant-onboarding-web`), superseding the four-module packaging of ADR-0030/31/33. **The canonical states (§2, R-21.5), the stage model (§3a), and all invariants are UNCHANGED and re-satisfied by the new engine (ADR-0034 P1–P7).**

**This document owns:** tenant identity, onboarding, provisioning, state transitions, suspension, and offboarding.
**It does not own:** isolation mechanics ([07](07-tenant-isolation.md)), data classification and retention ([06](06-data-sovereignty.md)), configuration schema ([15](15-configuration-model.md)), or authentication design ([08](08-security-model.md)).

---

## 1. What a tenant is

**R-21.1** A **tenant** is one customer organisation, identified by a stable identifier that is never reused.

**R-21.2** A tenant has **one registry entry** in the Intelligence Plane and **one or more Execution Plane deployments** in its own tenancy — typically one per environment.

**R-21.3** A tenant identifier SHALL NOT encode meaning — not customer name, not region, not tier. Meaning changes; identity must not.

**R-21.4** A run identifier is **not** a tenant identifier (R-9.6). Uniqueness carries no isolation semantics.

**Why identifiers are never reused.** Evidence, decisions, and audit records outlive the commercial relationship. Reusing an identifier would make a departed customer's historical records indistinguishable from a new customer's — a defect that is undetectable until it matters and unrecoverable afterwards.

## 2. Lifecycle states

```
  REGISTERED ──▶ PROVISIONED ──▶ ACTIVE ⇄ SUSPENDED
                                    │
                                    ▼
                              OFFBOARDING ──▶ CLOSED
```

**R-21.5** A tenant SHALL be in exactly one state. Every state transition is audited with actor, timestamp, and reason.

| State | Meaning | Execution permitted |
|---|---|---|
| **REGISTERED** | Identity exists; nothing provisioned | No |
| **PROVISIONED** | Configuration and entitlements set; no Execution Plane deployed yet | No |
| **ACTIVE** | Fully operational | Yes |
| **SUSPENDED** | Temporarily halted — commercial, security, or customer request | **No** |
| **OFFBOARDING** | Termination in progress; data disposition under way | No |
| **CLOSED** | Terminated; only the audit record remains | No |

**R-21.6** Only `ACTIVE` permits execution. Every other state SHALL cause package authoring to return a **refusal** ([05](05-cross-plane-communication.md) §3), not an error.

**R-21.7** Refusal-on-inactive SHALL be enforced at the Policy Decision Point, not at each call site.

**Why refusal and not error.** Refusal is a *decision* the Execution Plane must honour by halting, and it is carried in the package where it is auditable. An error would be classed as unavailability and would therefore **degrade and continue** — meaning a suspended tenant would keep executing. The distinction between the two result classes is exactly what prevents this, and it is why they are separate types rather than status codes.

## 3. Onboarding

**R-21.8** Onboarding SHALL be **configuration-driven**. Adding a tenant SHALL require no code change, no deployment, and no schema change.

**R-21.9** Onboarding SHALL be **complete or absent**. A partially provisioned tenant SHALL NOT reach `ACTIVE`.

**R-21.10** Provisioning SHALL declare, at minimum: identity, entitled capabilities, configuration scope, data classification and residency, retention periods per store class, AI provider posture (including *none*), and tool adapter bindings.

**R-21.11** A capability SHALL NOT be entitled unless it has a verified execution path (R-17 in [11](11-capability-model.md)). Entitling a capability with no execution path SHALL fail **at provisioning time**, loudly.

**R-21.11 is a direct inheritance from failure.** The predecessor tier-listed a penetration-testing engine as enabled, exposed it via API, and shipped it with no runner on disk; the dispatch wrapper logged the missing script and returned a soft failure. **A security capability that silently does nothing is indistinguishable, to its consumer, from a clean result** — the most dangerous possible failure mode for a security capability. Validating entitlement against a capability registry at provisioning time is what makes that unrepresentable.

## 3a. The onboarding workflow

**Added at v1.1 by [ADR-0021](../adr/ADR-0021-platform-core-bounded-context.md).**

**R-21.27** Onboarding SHALL proceed through these stages in order. Every stage is auditable, and **no stage may be skipped**.

| # | Stage | Performed by | Produces |
|---|---|---|---|
| 1 | Customer registration | Platform Core | Customer record |
| 2 | Tenant creation | Platform Core | Tenant identity (R-21.1) |
| 3 | Technology Profile capture | Platform Core | Validated profile ([03](03-intelligence-plane-architecture.md) §2b) |
| 4 | Business integration configuration | Platform Core | Adapter and target bindings |
| 5 | Solution generation | Platform Core | Complete EP solution ([03](03-intelligence-plane-architecture.md) §2c) |
| 6 | Repository generation | Platform Core | Repository in the **customer's** Git provider |
| 7 | Deployment package generation | Platform Core | Container and infrastructure templates |
| 8 | Customer deployment | **Customer** | Running Execution Plane |
| 9 | Execution Plane bootstrap | **Execution Plane** | First-start registration attempt |
| 10 | Secure registration | EP → Platform Core | Certificates, OAuth client, short-lived tokens ([08](08-security-model.md) §5a) |
| 11 | Connectivity validation | EP → Platform Core | Proven outbound path |
| 12 | Smoke validation | Execution Plane | Proven executable deployment |
| 13 | Tenant certification | Platform Core | Certification record |
| 14 | Tenant activated | Platform Core | State `ACTIVE` (R-21.6) |

**R-21.28** Stages 1–7 occur in the Intelligence Plane. **Stage 8 is performed by the customer**, in their tenancy, on their infrastructure. Stages 9–12 are **initiated by the Execution Plane** (INV-3). Stages 13–14 are Intelligence Plane decisions.

**R-21.29** A tenant SHALL NOT reach `ACTIVE` until stages 10, 11 and 12 have all succeeded. **A tenant activated without proven connectivity and a proven smoke run is activated on assumption.**

**R-21.30** Onboarding SHALL be **fully automated**. Any stage requiring manual DBiz engineering is a defect, not a service level.

**R-21.31** A failed stage SHALL halt onboarding and report which stage failed and why. **Partial onboarding SHALL NOT reach `ACTIVE`** (R-21.9).

### Why stage 8 is the customer's

The platform cannot deploy into a customer tenancy — R-17.2 and INV-3 forbid it, and no exception is made for convenience during onboarding. **Onboarding is therefore not one continuous automated flow but two, separated by an action only the customer can take.** Designing it as a single flow would require exactly the inbound access the sovereign split exists to prevent.

## 3b. Execution Plane bootstrap

**R-21.32** The generated Execution Plane SHALL contain **only three** registration inputs: the tenant identifier, the registration endpoint, and a **one-time registration credential**.

**R-21.33** It SHALL contain **no API key, no long-lived secret, and no embedded credential of any kind** (INV-2, [03](03-intelligence-plane-architecture.md) R-03.32).

**R-21.34** On first start the Execution Plane SHALL execute the registration exchange in [08](08-security-model.md) §5a and SHALL NOT accept work until it completes.

**R-21.35** The one-time credential SHALL be **consumed on first successful use** and SHALL be unusable thereafter.

**R-21.36** Bootstrap SHALL be **replay-safe**: a repeated registration attempt with a consumed credential SHALL be refused, not silently re-registered.

**R-21.33 is what makes a generated repository safe to hand over.** A repository containing a durable credential is a credential in the customer's Git history forever, readable by anyone who ever clones it. A one-time credential that dies on first use has a blast radius measured in minutes.

## 3c. Connectivity, smoke and tenant certification

**R-21.37** Connectivity validation SHALL prove the **outbound** path works, and SHALL NOT test any inbound path — there is none to test (INV-3).

**R-21.38** Smoke validation SHALL execute a minimal real run end to end, proving the deployment can actually work rather than merely start.

**R-21.39** Tenant certification SHALL record: the technology profile, the generator and template versions, the content hash of what was generated, the registration outcome, and the smoke result.

**R-21.40** Tenant certification is **evidence-backed** and expires (R-14.5). A tenant certified against a superseded generator version is not certified against the current one.

## 3d. Onboarding orchestration and the lifecycle projection

**Added at v1.2 by [ADR-0030](../adr/ADR-0030-tenant-lifecycle-management-orchestration.md).** Additive: no canonical state (§2) is changed, and the projection is an overlay, never a second lifecycle.

**R-21.47** The onboarding workflow (R-21.27) SHALL be realised by a single, configuration-driven orchestrator in Platform Core — the **Tenant Lifecycle Manager**. It carries a tenant across the stages over the frozen six states (§2), completing the seven Intelligence-Plane stages (R-21.28) and reporting stages 8–14 as **pending** until the customer deployment (stage 8) and the Execution-Plane runtime exist. It SHALL NOT report a tenant `ACTIVE` on assumption (R-21.29), and it reuses the identity and generation services rather than reimplementing them (R-03.29, §5a of [08](08-security-model.md)).

**R-21.48** The observable onboarding **projection** — DRAFT · REGISTERED · CONFIGURED · VALIDATED · EP_GENERATED · WAITING_FOR_DEPLOYMENT · EP_CONNECTED · HEALTH_VERIFIED · SMOKE_PASSED · CERTIFIED · OPERATIONAL · SUSPENDED · OFFBOARDING · DECOMMISSIONED — SHALL be **derived** from canonical state and audited stage history. It SHALL NOT be a second source of truth: execution eligibility is decided on the canonical state (R-21.6) at the Policy Decision Point (R-21.7), never on the projection.

**Why a projection and not new states.** The richer sequence an operator wants to see is progress *within* the six states, not six more states. Making them canonical would contradict R-21.5 and let a dashboard's convenience become a place a tenant could be "in execution" without being `ACTIVE`. Deriving them keeps one state machine and one answer to "may this tenant execute?".

| # | Criterion | Verified by |
|---|---|---|
| **C-21.28** | The orchestrator completes stages 1–7 from one configuration and provisions the tenant | Orchestrator scenario |
| **C-21.29** | Stages 8–14 are reported pending; no tenant reaches `ACTIVE` without stage 10–12 evidence | Deferred-stage and negative-activation test |
| **C-21.30** | The projection is derived from canonical state and never gates execution | Projection-derivation test |
| **C-21.31** | The onboarding configuration contains no credential field (INV-2) | Structural schema scan |

These are enforced by `verify-tenant-lifecycle-conformance.js`, added together with them (D-012 — declaration and enforcement are one atomic change).

## 4. Provisioning the Execution Plane

**R-21.12** Execution Plane deployment happens **in the customer's tenancy, under customer control**. DBiz SHALL NOT deploy into a customer tenancy.

**R-21.13** The Execution Plane SHALL authenticate as its tenant, and tenant identity SHALL derive from authenticated identity — never from a caller-supplied field alone (R-03.18).

**R-21.14** Credentials for customer systems are created and held **by the customer**, in their tenancy. DBiz never receives them (INV-2).

**R-21.15** Each deployment SHALL report the contract version it was built against (R-19.12).

## 5. Configuration ownership at the boundary

**R-21.16** Configuration is **split by ownership**, and the split follows the sovereignty boundary rather than convenience.

| Owned by DBiz (Intelligence Plane) | Owned by the customer (Execution Plane) |
|---|---|
| Entitled capabilities | Tool adapter selection and endpoints |
| Policy and guardrail configuration | Tool credentials |
| Gate definitions and thresholds | AI provider selection and credentials |
| Contract versions supported | Environment and target configuration |
| Retention **obligations** | Retention **implementation** |

**R-21.17** Neither side may override the other's column.

**R-21.18** Every declared configuration field SHALL be read by code. A field with no reader fails the build (R-15 in [15](15-configuration-model.md)).

**On the retention split.** DBiz declares the obligation because it carries the compliance commitment; the customer implements it because the data is in their tenancy. The predecessor declared a retention limit that was customer-visible, schema-validated, and API-served — and read by no code. The obligation existed and the enforcement did not, which is worse than declaring nothing, because it manufactured the appearance of a control.

## 6. Suspension

**R-21.19** Suspension SHALL take effect at the **next package request**. It SHALL NOT terminate work already in flight.

**R-21.20** Evidence already captured SHALL be retained under its existing retention policy. Suspension is not deletion.

**R-21.21** Suspension SHALL be reversible without data loss.

## 7. Offboarding

**R-21.22** Offboarding SHALL define disposition for **every** data class the tenant holds, in both planes.

**R-21.23** Customer data and evidence reside in the customer's tenancy and remain **under customer control** after termination. DBiz SHALL NOT be required to delete what it never held, and SHALL NOT retain what it did.

**R-21.24** In the Intelligence Plane, offboarding SHALL purge tenant configuration and any ephemeral customer data, and SHALL retain **decisions, hashes, and audit records** for the declared statutory period.

**R-21.25** Purge SHALL be **verified**, not asserted: a test SHALL prove the data is unreadable afterwards (R-9.3).

**R-21.26** A tenant identifier SHALL NOT be reissued after `CLOSED`.

**The asymmetry in R-21.24 is the sovereignty model working as designed.** DBiz retains judgments and the hashes they cite; the customer retains the evidence. A decision referencing an expired or deleted evidence bundle **remains auditable**, because the hash records what was judged without holding what was judged.

## 7a. Extended lifecycle operations

**R-21.41** The platform SHALL support, as governed operations: provisioning · upgrade · migration · **technology pack upgrade** · **framework upgrade** · configuration drift detection · rollback · backup coordination · recovery coordination · decommissioning.

**R-21.42** A **technology pack upgrade** regenerates parts of the customer's solution from newer templates. It SHALL be **proposed with a diff**, never applied silently — the customer's repository is theirs, and the platform does not rewrite it unilaterally.

**R-21.43** **Configuration drift detection** compares the customer's deployed solution against the templates and profile it was generated from, and reports divergence. **Divergence is reported, not corrected**: a customer may have modified their solution deliberately, and treating that as an error would make the platform hostile to its own extension model.

**R-21.44** Rollback SHALL be possible for any platform-initiated change, or its irreversibility SHALL be declared before it begins (R-25.13).

**R-21.45** Backup and recovery of customer-tenancy assets are **coordinated, not performed**, by the platform ([23](23-operational-excellence-model.md) R-23.27). DBiz holds no customer-tenancy backup and no key to one ([ADR-0008](../adr/ADR-0008-encryption-at-rest.md)).

**R-21.46** Decommissioning SHALL follow §7 offboarding: customer assets remain under customer control; the Intelligence Plane purges tenant configuration and retains decisions, hashes and audit records for the statutory period (R-21.24).

**R-21.43 deserves emphasis.** Drift detection that auto-corrected would silently overwrite customer work, and the platform would become the least trustworthy component in the customer's own repository. Reporting divergence keeps the customer in control of code they own.

## 8. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-21.1** | A tenant is always in exactly one declared state | State-machine test; schema constraint |
| **C-21.2** | Only `ACTIVE` permits execution; all others produce refusal | Per-state authoring test — one per state |
| **C-21.3** | Inactive-state refusal is enforced at the decision point, not at call sites | Policy-location gate |
| **C-21.4** | Onboarding a tenant requires no code, deployment, or schema change | Configuration-only onboarding test |
| **C-21.5** | A partially provisioned tenant cannot reach `ACTIVE` | Negative provisioning test |
| **C-21.6** | Entitling a capability with no execution path fails at provisioning | Registry validation test |
| **C-21.7** | Tenant scope derives from authenticated identity | Identity-spoofing negative test |
| **C-21.8** | Every configuration field has a code reader | Declared-vs-consumed gate |
| **C-21.9** | Neither side can write the other's configuration column | Ownership enforcement test |
| **C-21.10** | Suspension does not terminate in-flight work | Suspension timing test |
| **C-21.11** | Offboarding purge is proven, not asserted | Purge verification test per store |
| **C-21.12** | A closed tenant's identifier cannot be reissued | Registry uniqueness test |
| **C-21.13** | A decision remains auditable after its evidence expires | Expired-evidence audit test |
| **C-21.14** | Every state transition is audited with actor, timestamp and reason | Audit completeness test |
| **C-21.15** | Onboarding completes all fourteen stages, in order, with none skipped | Stage-trace test |
| **C-21.16** | A tenant cannot reach `ACTIVE` without registration, connectivity and smoke all succeeding | Negative activation test per stage |
| **C-21.17** | Onboarding requires no manual DBiz engineering | End-to-end automated onboarding run |
| **C-21.18** | A failed stage halts onboarding and names the stage | Per-stage failure test |
| **C-21.19** | The generated Execution Plane contains only tenant id, endpoint and a one-time credential | Generated-artefact content scan |
| **C-21.20** | No API key or long-lived secret is present in generated output | Secret scan over generated artefacts |
| **C-21.21** | The one-time credential is consumed on first use and refused thereafter | Replay negative test |
| **C-21.22** | Connectivity validation tests only the outbound path | Direction assertion |
| **C-21.23** | Smoke validation executes a real minimal run | Smoke evidence test |
| **C-21.24** | Tenant certification records profile, versions, content hash, registration and smoke outcome | Certification schema gate |
| **C-21.25** | A technology pack upgrade is proposed with a diff, never applied silently | Upgrade-proposal test |
| **C-21.26** | Configuration drift is reported, never auto-corrected | Drift-handling test |
| **C-21.27** | Backup and recovery of customer-tenancy assets are coordinated, never performed by DBiz | Custody assertion |

**C-21.2 is deliberately exhaustive — one test per state.** A partially-tested state machine is indistinguishable from an untested one at the transition that matters, and the transition that matters here is the one that lets a suspended tenant keep executing.

## 9. Open items

| # | Item | Target |
|---|---|---|
| **AD-006** | Retention period per data class | M1.3 — [06](06-data-sovereignty.md) |
| **AD-017** | Statutory retention period for decisions and audit records | M1.3 — [06](06-data-sovereignty.md) |
| **AD-018** | Self-service versus DBiz-assisted onboarding, and the approval path | **Resolved** by [ADR-0030](../adr/ADR-0030-tenant-lifecycle-management-orchestration.md): self-service, configuration-driven onboarding is the default; DBiz-assisted is the same pipeline with an approval gate before stage 5 |
| **AD-012** | How a customer tenancy resolves DBiz-published contract packages | M1.5 — [19](19-repository-ownership.md) |
