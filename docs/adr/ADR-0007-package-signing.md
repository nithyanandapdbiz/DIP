# ADR-0007 — Execution Package Signing and Verification

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-016
**Retrospective:** decision taken in M1.3; regularised under D-001

---

## 1. Problem

The Execution Plane acts on customer systems under instructions authored by DBiz. How does it establish that a package genuinely came from the Intelligence Plane, using keys the customer can trust, without DBiz holding anything inside the customer tenancy that could impersonate the customer?

## 2. Context

- Package signing keys are the platform's **highest-value asset**: their compromise grants reach into *every* customer tenancy simultaneously ([22](../architecture/22-security-threat-model.md) §1, A5).
- The Execution Plane treats all input as untrusted, including from DBiz (R-08.2). Mutual distrust across the boundary is what makes the split safe for both parties.
- Customer deployments upgrade on their own calendars, so key rotation cannot require customer redeployment.
- Refusal and unavailability demand **opposite** responses ([05](../architecture/05-cross-plane-communication.md) §3) — this decision must state which a signature failure is.

## 3. Alternatives

| Question | Options | Selected |
|---|---|---|
| Integrity mechanism | Transport auth only · content hash only · **detached signature over canonical form** | Signature — transport auth proves the channel, not the artefact; a hash proves integrity, not origin |
| Key distribution | Shared secret (HMAC) · **asymmetric, public verification keys** | Asymmetric — a shared secret in every customer tenancy is a signing key in every customer tenancy |
| Rotation | Redeploy customers · **key identifier on the package, overlapping validity** | Overlapping — the only option compatible with independent customer schedules |
| Failure classification | Unavailability · **refusal** | Refusal |

## 4. Decision

Every execution package is **signed by the Intelligence Plane** with a detached signature over its canonical serialisation, and the Execution Plane **verifies before executing**.

- Signing keys are DBiz-held and never distributed.
- Verification keys are distributed to customer tenancies and are **verification-only** — possessing one cannot produce a signature.
- Packages carry a **key identifier**; multiple keys are valid concurrently, so rotation needs no customer redeployment.
- DBiz SHALL NOT hold, inside a customer tenancy, any key capable of impersonating that customer to third parties (R-08.17).
- **Verification failure is a refusal.** It halts (R-08.14).

**The failure classification is the consequential part.** A signature failure means the package is not what it claims to be. Classing it as unavailability would make the Execution Plane **degrade and continue** — that is, execute a package it could not verify. Making it a refusal in the *type system* rather than a judgment at the call site is what guarantees the halt.

## 5. Consequences

**Positive.** Forged and tampered packages are rejected before touching customer systems; a compromised transport cannot inject instructions; rotation is decoupled from customer schedules; asymmetric keys mean a compromised tenancy cannot forge packages for any tenancy, including its own.

**Negative, accepted.** DBiz must operate signing-key custody with the operational rigour that implies. Verification adds latency per package — negligible at one package per directed stage. **Residual risk RR-3 remains**: a malicious insider with signing-key access could author packages for any tenant; hardware-backed custody (AD-028) reduces but does not eliminate it, and it is recorded rather than hidden.

## 6. Migration strategy

None required — taken before implementation.

**Key rotation is a first-class operation, not a migration.** Publish the new verification key; sign new packages under the new key identifier; both remain valid through the overlap window; retire the old key once no package under it remains within its validity window. **No customer action, no redeployment.**

**Algorithm migration** follows the same pattern: the key identifier implies the algorithm, so a new algorithm is a new key identifier. This is why packages carry a key identifier rather than assuming a fixed algorithm.

**Compromise response** is not a migration but an incident: revoke the key identifier, publish revocation, and treat every package signed under it as unverifiable. This is why validity windows are short (R-22.1) — they bound the blast radius of a key compromise.

## 7. Version impact

No contract version change: the signature is detached and the key identifier sits in package provenance, which contract v1 already carries.

**Forward obligation.** Adding a key or algorithm is **not** a contract change. Changing the signature *scheme* — detached to embedded, or a different canonical input — would be a **major** contract version, because it alters what verification operates over.

## 8. Affected components

[08](../architecture/08-security-model.md) §5 (owning document) · [20](../architecture/20-cross-plane-contracts.md) §5 (detached signature over canonical form) · [05](../architecture/05-cross-plane-communication.md) §3 (refusal classification) · [22](../architecture/22-security-threat-model.md) §3.3 (paths P-10, P-11) · [17](../architecture/17-deployment-topology.md) §5 (verification key distribution) · Execution Plane validation; Intelligence Plane authoring.
