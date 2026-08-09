# 08 — Security Model & Trust Boundaries

**Status:** **FROZEN** · **Version:** 1.2 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.3
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 6, 8 and 9
**Amendments:** v1.2 — secure registration, mTLS/OAuth identity, rotation and replay protection added by [ADR-0021](../adr/ADR-0021-platform-core-bounded-context.md) (additive; no boundary changed)
**Resolves:** AD-016, AD-019

**This document owns:** trust boundaries, threat posture, authentication, authorisation, secret handling, and key management.
**It does not own:** isolation mechanics ([07](07-tenant-isolation.md)), classification ([06](06-data-sovereignty.md)), transport direction ([05](05-cross-plane-communication.md)), or evidence integrity ([10](10-evidence-flow-model.md)).

---

## 1. Trust boundaries

```
┌─ DBiz tenancy ──────────────┐        ┌─ Customer tenancy ─────────────┐
│                             │        │                                │
│   Intelligence Plane        │◀───────│   Execution Plane              │
│   trusts: nothing inbound   │   TB1  │   trusts: its own config       │
│                             │        │                                │
└─────────────────────────────┘        │        │ TB2                   │
                                       │        ▼                       │
                                       │   Customer systems under test  │
                                       └────────────────────────────────┘
                                                 │ TB3
                                                 ▼
                                          External tools / AI providers
```

| # | Boundary | Direction | Trust posture |
|---|---|---|---|
| **TB1** | Execution Plane → Intelligence Plane | EP-initiated only | Mutual authentication. **Neither side trusts the other's claims about identity or scope.** |
| **TB2** | Execution Plane → customer systems | EP-initiated | Credentials held customer-side; least privilege per target |
| **TB3** | Execution Plane → external tools and AI providers | EP-initiated | Credentials held customer-side; egress governed by tenant configuration |

**R-08.1** There is **no inbound trust boundary into the customer tenancy**. DBiz initiates nothing (INV-3, R-05.1).

**R-08.2** The Intelligence Plane SHALL treat all Execution Plane input as untrusted, including tenant identity claims, evidence references, and results.

**R-08.3** The Execution Plane SHALL verify that an execution package genuinely originated from the Intelligence Plane before executing it (§5).

**Rationale for R-08.2 and R-08.3.** The Execution Plane runs in an environment DBiz does not control; the Intelligence Plane is a service the customer does not control. Each is, from the other's perspective, a system operated by someone else. **Mutual distrust across TB1 is what makes the split safe for both parties** — and it is a commercial asset, not merely a security posture.

## 2. Threat posture

**R-08.4** The platform SHALL be designed against a declared threat model. Threat actors, assets, attack paths, and the mapping of each path to its controlling criterion are owned by **[22 — Security Threat Model](22-security-threat-model.md)**.

This document defines the **controls**. Document 22 defines the **threats those controls answer**, and reconciles every attack path against a criterion that currently runs. Neither restates the other.

## 3. Authentication

**R-08.5** TB1 SHALL use **mutual authentication**. The Execution Plane authenticates as its tenant; the Intelligence Plane authenticates as the platform.

**R-08.6** Tenant identity SHALL derive from the authenticated principal. A caller-supplied tenant field SHALL NOT establish scope (R-07.8).

**R-08.7** Credentials for TB2 and TB3 are created, held, and rotated **by the customer**. DBiz never receives them (INV-2).

**R-08.8** Authentication SHALL fail closed. An unauthenticated or ambiguously authenticated request is rejected, never treated as anonymous or default.

## 4. Authorisation

**R-08.9** Authorisation SHALL be **graded**, not binary. Roles are distinguished at minimum: platform operator, tenant administrator, tenant member, read-only auditor.

**R-08.10** Every surface — application, administrative, diagnostic, analytics, health — SHALL carry an authorisation check. **A surface without one is a violation, not an oversight.**

**R-08.11** Authorisation SHALL be evaluated at the single Policy Decision Point (R-03.6), never re-implemented at a call site.

**R-08.12** Graded authorisation SHALL be **implemented**, not merely declared. A role defined in configuration but enforced by no code path is a violation (R-11.2).

**R-08.12 records a specific predecessor failure.** Graded access control was authored and never wired; the roles existed in configuration and in documentation, and no code consulted them. The controls looked present to an auditor reading the config and were absent to an attacker reading the code.

## 5. Package signing and verification — AD-016 resolved

**R-08.13** Every execution package SHALL be **signed by the Intelligence Plane** over its canonical serialisation, using a detached signature ([20](20-cross-plane-contracts.md) §5).

**R-08.14** The Execution Plane SHALL **verify the signature before executing**. Verification failure is a **refusal**, not an unavailability — it halts (R-05.5).

**R-08.15** Signing keys are DBiz-held. Verification keys are distributed to customer tenancies and are **public-verification only** — possession of a verification key SHALL NOT permit signing.

**R-08.15 and [01](01-platform-constitution.md) R-6.3 do not conflict, and [ADR-0084](../adr/ADR-0084-rule-6-scope.md) records why.** Rule 6 governs **what crosses** the plane boundary and its subject is the **customer's** credentials; a DBiz signing key never crosses, and only its public half is distributed. **The scope is recorded in the constitution beside Rule 6 rather than restated here** — one topic, one canonical home.

**R-08.16** Keys SHALL be rotatable without redeploying customer tenancies. Packages carry a key identifier; multiple keys are valid concurrently during rotation.

**R-08.17** DBiz SHALL NOT hold, inside a customer tenancy, any key that could be used to impersonate that customer to third parties.

**R-08.14's classification is deliberate and consequential.** A signature failure means the package is not what it claims to be. Classing that as unavailability would cause the Execution Plane to **degrade and continue** — executing an unverified package. It must halt, and the only way to guarantee that is to make it a refusal in the type system rather than a judgment at the call site.

## 5a. Secure registration of a generated Execution Plane

**Added at v1.2 by [ADR-0021](../adr/ADR-0021-platform-core-bounded-context.md).**

A generated Execution Plane starts with no identity. It must acquire one **without ever having held a durable secret**, because it was delivered as a repository the customer clones, forks and keeps.

### 5a.1 What the generated artefact may contain

**R-08.41** A generated Execution Plane SHALL contain **exactly three** registration inputs: tenant identifier, registration endpoint, and a **one-time registration credential**.

**R-08.42** It SHALL contain **no API key, no client secret, no certificate private key, and no long-lived token**. Static API keys are **prohibited** platform-wide.

**R-08.43** The one-time credential SHALL be short-lived, single-use, and bound to the tenant it was issued for.

**R-08.42 is not a hardening preference.** A credential shipped inside a repository lives in that repository's history permanently, readable by everyone who ever clones it and by every backup of it. No rotation policy reaches it. The only safe credential in generated output is one that dies on first use.

### 5a.2 The registration exchange

**R-08.44** On first start the Execution Plane SHALL complete this exchange, **initiated outbound by the Execution Plane** (INV-3), before accepting any work.

```
Execution Plane                                  Platform Core
      │                                                │
      │  1. authenticate (one-time credential)         │
      ├───────────────────────────────────────────────►│
      │                                    2. validate tenant
      │                                    3. validate subscription
      │◄───────────────────────────────────────────────┤
      │  4. issue client certificate (mTLS identity)   │
      │  5. issue OAuth client registration            │
      │  6. issue short-lived access token             │
      │                                                │
      │  7. register Execution Plane (mTLS + OAuth)    │
      ├───────────────────────────────────────────────►│
      │  8. validate connectivity                      │
      │◄───────────────────────────────────────────────┤
      │  9. tenant certified                           │
```

**R-08.45** Each step SHALL be atomic in effect: a failure at any step SHALL leave the tenant **unregistered**, never partially registered.

**R-08.46** The one-time credential SHALL be **consumed at step 1** and unusable thereafter. A repeated attempt SHALL be **refused**, not silently re-registered (replay protection).

**R-08.47** Registration SHALL be **idempotent by tenant identity**: a re-run after a completed registration returns the existing registration rather than creating a second.

### 5a.3 Steady-state authentication

**R-08.48** After registration, every cross-plane request SHALL use **mutual TLS** with the issued certificate identity, **plus** an OAuth2/OIDC short-lived access token.

**R-08.49** Access tokens SHALL be short-lived and **rotated**. A token SHALL NOT be renewable indefinitely without re-presenting certificate identity.

**R-08.50** Certificates SHALL be **rotatable without redeploying the Execution Plane**, and rotation SHALL overlap so a customer is never forced to upgrade in lockstep with DBiz (R-19.11 applied to identity).

**R-08.51** Every request SHALL carry a **nonce** and SHALL be **signed**; a repeated nonce within the validity window SHALL be rejected (R-22.4).

**R-08.52** All cross-plane traffic SHALL pass the API gateway, which enforces authentication, authorisation, rate limiting and audit **before** any platform component sees the request.

### 5a.4 Zero Trust

**R-08.53** Every request SHALL be **authenticated, authorised, encrypted and audited**. No request is trusted by origin, network position, or prior successful request.

**R-08.54** The Execution Plane **always initiates**. The Intelligence Plane SHALL NEVER require inbound access into customer infrastructure, for registration, upgrade, support, diagnostics or any other purpose (INV-3).

**R-08.55** A registered Execution Plane SHALL have **no standing authority**: its token expires, its certificate rotates, and revocation takes effect without customer action.

**R-08.54's enumeration is deliberate.** "No inbound access" erodes one exception at a time — first for support, then for diagnostics, then for upgrades. Naming the purposes closes the route by which the invariant would be negotiated away.

### 5a.5 Sovereignty of generated and runtime assets

**R-08.56** The Intelligence Plane SHALL NEVER permanently store: customer source code or repositories · customer secrets or credentials · business configuration · test data · screenshots or evidence · internal URLs · integration details · runtime configuration.

**R-08.57** Customer secrets remain in **customer-managed vaults**. Only credential *references* cross (INV-2).

**R-08.58** Screenshots and captured content SHALL be **scrubbed before any AI processing**, on the write path ([09](09-data-flow-model.md) §2, [ADR-0014](../adr/ADR-0014-pii-scrubbing-posture.md)).

**R-08.59** The Intelligence Plane stores **platform metadata only**: registration records, technology profiles, template and generator versions, licensing state, decisions, and content hashes ([03](03-intelligence-plane-architecture.md) R-03.37).

## 6. Secret handling

**R-08.18** Secret material SHALL NOT cross TB1 in any environment, for any reason (R-6.2).

**R-08.19** Only credential **references** cross. Resolution to secret material happens in the Execution Plane, at point of use.

**R-08.20** Secrets SHALL NOT appear in logs, traces, error messages, diagnostics, or evidence.

**R-08.21** Secret handling SHALL be **identical in every environment**. No environment conditional may relax it (C-0.5).

**R-08.21 records a real breach.** The predecessor forwarded a raw AI credential across its trust boundary outside production, on the reasoning that non-production is lower risk. Non-production environments routinely hold **real** customer credentials under **weaker** guards and looser access control — a control that protects only production protects the environment least likely to be attacked.

## 7. Encryption — AD-019 resolved

**R-08.22** All data SHALL be encrypted **in transit** across every trust boundary.

**R-08.23** C1, C2, C3 and evidence SHALL be encrypted **at rest**, with keys held in the tenancy that owns the data. **DBiz SHALL NOT hold keys to customer-tenancy data.**

**R-08.24** C4 and C5 SHALL be encrypted at rest under DBiz-held keys, scoped per residency region.

**R-08.25** Key rotation SHALL be supported without data migration and without downtime.

**R-08.23 is the encryption expression of sovereignty.** If DBiz held the keys to customer-tenancy data, the customer's data would be functionally DBiz-accessible regardless of where the bytes sit — and the split would be a topology detail rather than a sovereignty guarantee.

## 8. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-08.1** | No Intelligence Plane code initiates a connection into a customer tenancy | Egress-direction gate; runtime egress policy |
| **C-08.2** | TB1 requires mutual authentication | Unauthenticated and one-way-authenticated negative tests |
| **C-08.3** | A caller-supplied tenant field cannot establish scope | Identity-spoofing negative test |
| **C-08.4** | Authentication fails closed | Ambiguous-credential negative test |
| **C-08.5** | Every surface carries an authorisation check | Surface inventory gate — an unguarded surface fails the build |
| **C-08.6** | Every declared role is enforced by a code path | Declared-vs-consumed gate applied to roles |
| **C-08.7** | Authorisation logic exists only at the decision point | Policy-location gate |
| **C-08.8** | An unsigned or wrongly-signed package is refused, and execution halts | Forged-package negative test |
| **C-08.9** | Signature failure is classed as refusal, never unavailability | Type-level test |
| **C-08.10** | Key rotation succeeds without customer redeployment | Rotation test with overlapping keys |
| **C-08.11** | No secret material appears in any outbound payload, log, trace, error, or evidence, in any environment | Secret-scan gate across all sinks |
| **C-08.12** | No environment conditional exists in any secret-handling path | Conditional scan |
| **C-08.13** | Customer-tenancy data is encrypted at rest under customer-held keys | Key-ownership test |
| **C-08.14** | Prompt injection cannot alter control flow | Injection corpus test asserting identical control flow |
| **C-08.15** | A generated Execution Plane contains only tenant id, endpoint and a one-time credential | Generated-artefact content scan |
| **C-08.16** | No static API key or long-lived secret exists anywhere in the platform | Static-key scan across both planes |
| **C-08.17** | The one-time credential is consumed on first use and refused on replay | Replay negative test |
| **C-08.18** | A failed registration leaves the tenant unregistered, never partially registered | Interrupted-registration test |
| **C-08.19** | Registration is idempotent by tenant identity | Repeat-registration test |
| **C-08.20** | Steady-state requests use mutual TLS **and** a short-lived OAuth token | Transport assertion; single-factor negative test |
| **C-08.21** | Certificates rotate without redeploying the Execution Plane, with overlap | Rotation test |
| **C-08.22** | A repeated nonce is rejected within the validity window | Replay negative test |
| **C-08.23** | Every cross-plane request passes the gateway before reaching any component | Bypass negative test |
| **C-08.24** | No inbound path into customer infrastructure exists for any purpose | Egress-direction gate; purpose enumeration audit |
| **C-08.25** | Revocation takes effect without customer action | Revocation test |
| **C-08.26** | No customer source, secret, screenshot, evidence or runtime configuration is stored in the Intelligence Plane | Store-content scan |
| **C-08.27** | Screenshots are scrubbed before any AI processing | Write-path absence test |

**C-08.11 and C-08.12 are separate on purpose.** The first asks whether secrets leak today; the second asks whether the code contains the *mechanism* by which they could leak tomorrow under a different environment variable. The predecessor passed the equivalent of the first and failed the second.

## 9. Open items

| # | Item | Target |
|---|---|---|
| **AD-021** | Identity provider integration for tenant administrators | M1.5 |
| **AD-022** | Security incident response and breach-notification obligations across the split | M1.5 |

**AD-022 has an unusual shape under sovereignty.** A breach in a customer tenancy is the customer's incident, on infrastructure DBiz cannot inspect; a breach in the Intelligence Plane is DBiz's incident, affecting judgments about many customers. Who must notify whom, within what window, and on whose evidence, is a contractual as well as an architectural question — and it must be answered before the first production tenant, not after the first incident.
