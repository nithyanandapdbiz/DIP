# ADR-0036 — Execution-Plane Registration & Trust Establishment

**Status:** ACCEPTED · **Date:** 2026-07-24
**Raised by:** the P0 directive to establish secure EP↔IP trust — connectivity was proven; authentication (HTTP 401) was the only remaining blocker
**Affects:** [05](../architecture/05-cross-plane-communication.md), [06](../architecture/06-data-sovereignty.md), [07](../architecture/07-tenant-isolation.md), [08](../architecture/08-security-model.md), [20](../architecture/20-cross-plane-contracts.md), `packages/tenant-onboarding-engine` (engine + server), the generated EP solution, `program/`
**Builds on:** [ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md) (SSOT) · [ADR-0033](ADR-0033-production-web-tier.md) (NestJS auth) · [ADR-0030](ADR-0030-tenant-lifecycle-management-orchestration.md)
**Implements the previously-designed-but-unbuilt:** the solution generator already baked a one-time registration credential into every EP package (`solution-export.ts`), and `docs/EP-RUNTIME-REQUIREMENTS.md` listed the registration client as *"required… NOT yet emitted."* This ADR builds the endpoint that consumes the OTC and the EP client that presents it.
**Does not amend:** the six capabilities, three services, the twelve-stage lifecycle, the six canonical states, the SSOT, or INV-2/INV-3/INV-9.

---

## 1. Problem

The Execution Plane could reach the Intelligence Plane, present a contract version, and be refused with **HTTP 401**. The token in use (`DBIZ_EP_TOKEN`) was a **hand-pasted JWT** in `carlislehomes/.env`, and the dev server signed EP tokens with a **random secret regenerated on every boot** (`SESSION_SECRET` unset → `randomBytes()`), so any issued token failed signature verification after the next restart. There was **no registration endpoint** and **no one-time-credential (OTC) store**: `issueOneTimeCredential` was a throwaway lambda and `recordTenantCreated` a no-op, so a minted OTC was never persisted and could not be validated.

The mission was explicitly **not** "make the 401 go away." It was to establish trust *without weakening* Data Security, Zero Trust, Multi-Tenancy, Tenant Isolation, Data Sovereignty, Least Privilege, or Secure Credential Management.

## 2. Context

- **The design already existed.** The OTC is baked into `src/bootstrap/register.*` of every generated package; `config/identity.json` declares reference-only slots for the registration-issued grant; `config/connectivity.json` names the registration endpoint and `DBIZ_EP_TOKEN`. Only the *endpoint* and the *EP client* were missing. Building a parallel mechanism would have been the duplicate-source failure CHARTER §4 forbids.
- **The EP credential is not a customer secret.** It is a DBIZ session token (`ep:<slug>:v<N>`, `execution-plane` role only), so issuing/holding it does not touch INV-2. The OTC likewise is a DBIZ-minted bootstrap credential, not a customer secret.
- **Rotation already had a mechanism.** `issueEpToken` embeds a version in the principal id; `route()` refuses any EP token whose version is not the tenant's current one — revocation without a denylist. Registration reuses it.
- **The sovereign split holds.** Registration is an **EP-initiated, outbound-only** POST (INV-3); the IP never dials into the EP.

## 3. Alternatives

| Option | Rejected because |
|---|---|
| **Keep pasting a token into `.env`** | Plaintext secret in a customer-kept file; no rotation, no revocation, no audit; the leak this ADR remediates |
| **Long-lived shared API key** | Violates least privilege and one-identity-per-tenant (§3 of the mission); a single leak compromises all tenants |
| **mTLS-only registration in dev** | Correct for production (§12), but unavailable on the plain-HTTP dev instance; would leave dev unauthenticatable and untestable |
| **OTC stored in plaintext on the IP** | Breaches INV-2 posture; a store breach would leak live credentials. Store a **hash** only |
| **Reuse `POST /:slug/ep-token` (IP-admin authed) for the EP** | The EP has no IP-admin session; the whole point is bootstrap trust from an OTC the EP already holds |

## 4. Decision

**Implement the OTC-authenticated registration exchange the architecture already designed, reusing every existing primitive.**

```
EP: one-time credential (baked into the package by the IP generator)
      │  POST /api/register  (EP-initiated, outbound-only, the ONE cross-plane client)
      ▼
IP: validate contract version → resolve OTC by hash → verify tenant/OTC binding
      → verify tenant exists + environment + lifecycle state → CONSUME OTC (atomic, single-use)
      → mint tenant-scoped EP credential (issueEpToken, version bumped ⇒ prior revoked)
      → immutable audit record
      ▼
EP: persist credential to the secure vault (.secrets/, 0600, gitignored)
      → record REFERENCES in config/identity.json (never the value, INV-2)
      → authenticated communication (the 401 is gone)
```

| # | Rule | Enforcement |
|---|---|---|
| **R-36.1** | An EP authenticates only with an IP-issued, **tenant-scoped, versioned** credential (`ep:<slug>:v<N>`, `execution-plane` role) — never a shared or global one | `issueEpToken` + `route()` version check; test `least-privilege`, `cross-tenant credential` |
| **R-36.2** | The OTC is **single-use**: consumed atomically on first success and refused thereafter | `consumeOtc` compare-and-set; tests `single-use`, live replay → 401 |
| **R-36.3** | The OTC is held **only as a SHA-256 hash + non-secret metadata** on the IP (INV-2); the plaintext OTC and the issued credential are never persisted or logged on the IP | `registration.ts` stores hashes; test `store holds a HASH, never the OTC or the credential` |
| **R-36.4** | Possession of the OTC is **necessary but not sufficient**: tenant/OTC binding, environment, contract version and lifecycle state are all verified before issuance (Zero Trust) | handler steps 2–8; tests `cross-tenant`, `environment`, `contract`, `unknown tenant` (403/403/426/404) |
| **R-36.5** | **One identity per tenant, no cross-tenant access.** Tenant A's OTC cannot register as B; A's credential cannot address B | tenant-binding check + `mayAccessTenant` (C-07.11); live checks D & F |
| **R-36.6** | The EP credential **persists to a secure store**, never to `.env` or a committed file; config holds `vault://` **references** only | EP `secret-store.js` + `.gitignore`; `identity.json` refs-only |
| **R-36.7** | The IP signing secret is **stable across restarts** (persisted / secret-manager sourced), never random-per-boot | `run-server.mjs` `resolveSessionSecret`; the root-cause fix for the 401 |
| **R-36.8** | Every trust event — issuance, registration success, and **every refusal** — writes an **immutable** audit record (timestamp, tenant, EP id, correlation id, operation, result), carrying no secret | `RegistrationStore.appendAudit` (append-only JSONL); test `every outcome is audited` |
| **R-36.9** | Registration reuses the **single cross-plane client** (R-05.3); no second HTTP client is introduced for any cross-plane call | EP `client.register()` composed onto `createCrossPlaneClient` |

## 5. Consequences

- **The 401 blocker is closed at root cause** — a persisted signing secret plus a real credential-issuance flow. Live proof: `401 unauth → 200 authenticated`.
- **The leaked `.env` is remediated** — the plaintext EP token is removed; the previously-committed AI key is flagged for rotation; the runtime reads the credential from the vault.
- **Production readiness without redesign (§12).** The same handler accepts mTLS/OAuth/request-signing/nonce as additional, stronger proofs layered *before* the OTC check; the credential type, vault, and reference model are unchanged. Dev uses plain HTTP + a persisted dev secret; production supplies `SESSION_SECRET`/mTLS from a secret manager.
- **New per-instance runtime state** (`.session-secret`, `registration/`) — gitignored, dev-instance only; a scaled deployment substitutes a shared/KMS-backed `RegistrationStore` behind the same interface.

## 6. Migration strategy

1. **Done:** engine `registration.ts` (OTC store, endpoint, audit) + wiring into `api.ts`/NestJS/`run-server.mjs`; stable signing secret; EP `client.register()`, `secret-store.js`, `register-client.js`, `bin/ep-register.mjs`; `.env` remediated; full engine suite green; live end-to-end + adversarial matrix verified.
2. **Adversarial security review (done).** A 6-lens adversarial review (18 agents) surfaced **12 findings**, all triaged as real and **all fixed**: (high) unbounded request body on the unauthenticated `/api/register` → **body-size cap + `toString` guard + handler `try/catch`** (no crash, clean 413); (medium) **OTC consumed before durable issuance** → rollback via `releaseOtc` (a post-consume failure now yields a retryable 503, not a burned OTC); (medium) an EP `execution-plane` credential could self-grant capabilities via onboarding PATCH routes → **those routes now require `tenant:configure`** + an R-21.11 guard in `enrichRecommendations`; (medium) audit-log amplification via an unbounded `correlationId` → **clamped to 128 chars**; (medium) transient IP 5xx/429 misclassified as Refusal → **now Unavailability (DEGRADE)**; (medium) OTC transmittable over cleartext via `INTELLIGENCE_API_URL` → **refused for non-loopback non-https before any POST**; (low) non-atomic `FileRegistrationStore.consumeOtc` under multi-instance → **documented single-instance-only**; (low) duplicate opaque `tenantId` → **fail-closed resolver + `importJson` uniqueness guard** (no cross-tenant bind); (low) `chmod 0600` no-op on Windows for both secret files → **icacls owner-only ACL**; (low) `isMutualTls()` false PASS → **connectivity check now gates mutual-TLS on an actual client cert**. Regression tests added; **114/114 green**; each fix re-verified live (413, 403 escalation-block, transport-refusal). Detail: session-31 review artefact.
3. **Conformance gate (done, standalone).** `governance/verification/verify-registration-conformance.js` + its scenario `governance/registration/run-registration-conformance.mjs` EXECUTE the flow and gate on eight properties (RG-1…RG-8: authenticates, single-use, no cross-tenant registration/token, hash-only-at-rest INV-2, full audit, Zero-Trust refusals, consume-rollback). Verified **green (8/8)**, and **fault-proved** — breaking single-use in the compiled store turns the gate **RED** (RG-2 `replay=200`, exit 1), so it demonstrably enforces the property (R-13.4), not merely asserts it. It follows the tenant-lifecycle gate pattern exactly.
4. **Remaining coordination step (not yet done, recorded honestly):** register the gate in `run-all.js`, record its fault proof in `proofs.json` (via `record-fault-proofs.js`, which `verify-governance-self-validation.js` requires), and re-cut the closure baseline (`baseline.json`) to admit ADR-0036 + the new modules. These three touch shared governance state a concurrent ADR-0035 stream is actively managing; per the Session-8 precedent the gate is **standalone pending that reconciliation** — no readiness claim is inflated. **GA remains NOT CERTIFIED.**

## 7. Version impact

This ADR is **additive** and increments no version. It amends no frozen architecture document and no `@dbiz/contracts` version, and touches none of the invariants named in the header (six capabilities, three services, the twelve-stage lifecycle, the six canonical states, the SSOT, INV-2/INV-3/INV-9). Backward compatibility is preserved: the registration exchange composes onto existing primitives (`issueEpToken`, the single cross-plane client, the tenant SSOT), and the credential-reference model recorded in the Execution Plane's identity configuration is unchanged — only references cross the boundary (INV-2).

Every future cross-plane call (telemetry, evidence-reference submission, package pull, heartbeat) authenticates with the registration-issued credential and composes onto the one cross-plane client. When mTLS + short-lived OAuth land (Doc 08 §5a, R-05.17/18), they layer in front of the OTC check as additional proofs without changing this contract — the reason §12 "production readiness without architectural change" is satisfiable.

## 8. Affected components

`packages/tenant-onboarding-engine/src/engine/registration.ts` (new) · `packages/tenant-onboarding-engine/src/engine/api.ts` · `packages/tenant-onboarding-engine/src/engine/index.ts` · `packages/tenant-onboarding-engine/src/server/registration.controller.ts` (new) · `packages/tenant-onboarding-engine/src/server/app.module.ts` · `packages/tenant-onboarding-engine/src/server/tokens.ts` · `packages/tenant-onboarding-engine/run-server.mjs` · `packages/tenant-onboarding-engine/test/registration.test.ts` (new) · `packages/tenant-onboarding-engine/package.json`. In the customer-owned Execution Plane (`carlislehomes/`, tracked in that plane's own history — no cross-plane path dependency): the single cross-plane client extended with a `register()` call, a new secure local secret store, a new registration client and a register-then-run entrypoint, the connectivity resolver, and the `.env`/`.gitignore` updates.
