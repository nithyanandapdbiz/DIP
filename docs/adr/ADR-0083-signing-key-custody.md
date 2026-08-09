# ADR-0083 — Signing Key Custody: the platform's highest-value asset belongs in the Secret Provider

**Status:** ACCEPTED · **Date:** 2026-08-06
**Discharges:** debt D-129 · advances **AD-016**'s custody leg (it does not close AD-016 — see §5.3)
**Report:** [`SIGNING_KEY_FIRST_RUN_MARKER_REPORT.md`](../../program/SIGNING_KEY_FIRST_RUN_MARKER_REPORT.md) §5

> **ACCEPTED AND EXECUTED 2026-08-06, AFTER [ADR-0084](ADR-0084-rule-6-scope.md) AND DELIBERATELY IN
> THAT ORDER.** With Rule 6's scope recorded first, this reads as **a custody improvement** — which
> is what it is. In the other order, moving the key would have read as **a violation being
> remediated**, and it never was one.
>
> **§6 executed:** the key is resolved through `secrets.require`-shaped access as
> `PACKAGE_SIGNING_KEY`; the create-if-missing branch is **gone**; `SigningKeyMintAuthorisation` is
> **retired with its subject** (P-83.3), and its four properties were **deleted rather than kept** —
> they would have been satisfied by the absence of what they watched.
>
> **What replaced them is stronger and is proved:** an unprovisioned secret refuses, an empty secret
> is treated as absent rather than as a key, and **the module exposes no create-or-get at all** —
> asserted as a property, so a future re-introduction fails a test rather than passing review.
>
> **The adoption end-to-end test had to provision the key to keep booting**, which is the change
> working: a deployment without a provisioned signing key does not start, and a test is a
> deployment.

> **NO `Closes:` LABEL IS DECLARED.** AD-016 is already closed by [ADR-0007](ADR-0007-package-signing.md)
> for its **model**, and the closure-uniqueness property admits *one decision, one ADR*. This ADR
> advances the **custody** leg; §5.3 states why that is not the same as closing it.

---

## 1. Problem

**The weaker custody holds the stronger asset, and the two are resolved twelve lines apart in the same function.**

```
sessionSecret = secrets.require('SESSION_SECRET')                      <- the Secret Provider
signingKey    = loadOrCreateSigningKey(join(signingDir, '….pem'), …)   <- a file on a mounted volume
```

`SESSION_SECRET` signs sessions and Execution-Plane credentials, and is resolved through the
**Secret Provider** — Key Vault in cloud, where absence throws `MissingSecretError` and there is **no
create-if-missing**. The **package signing key** — which [ADR-0007 §2](ADR-0007-package-signing.md)
calls *"the platform's **highest-value asset**: their compromise grants reach into **every** customer
tenancy simultaneously"* — is a file that is **created when missing**.

**The blast radii are asymmetric with the protection.** `SESSION_SECRET` compromise forges
credentials against this plane. Signing-key compromise **authors packages every customer tenancy will
execute.**

## 2. Context

### 2.1 The cause, which is the part nobody would find by review

> **NO DECISION RECORDS THE SPLIT. IT IS RESIDUE, NOT A CHOICE.**

[ADR-0060](ADR-0060-cloud-native-provider-platform.md) §6 M-a adopted the configuration/secret seam
**additively** — deliberately and correctly, so the migration could land without rewriting working
wiring. **The signing key already existed as a file, so it stayed a file.** Nothing rejected the
Secret Provider for it; nothing considered it.

**That is why this is debt rather than a design disagreement**, and why it is worth stating plainly:
a reader auditing custody would find a file-backed key and reasonably look for the decision that put
it there. **There is none.** The absence of the decision is the finding.

### 2.2 It is already causing a second mechanism to be built by hand

D-123 link 1 required *"absence of the key at boot is a refusal, not a silent creation"*, which needed
an authorisation rule derived from whether any tenancy has ever been registered
([`SIGNING_KEY_FIRST_RUN_MARKER_REPORT.md`](../../program/SIGNING_KEY_FIRST_RUN_MARKER_REPORT.md)).

> **`SecretProvider.require` ALREADY HAS THOSE SEMANTICS, PLATFORM-WIDE: absent throws, and there is
> no create-if-missing at all.** The first-run problem is largely an artefact of the key living
> somewhere that HAS a create-if-missing idiom. **Link 1's repair therefore rebuilds in one place
> what exists everywhere else** — and it is marked interim at the site rather than left to look
> permanent.

### 2.3 What is NOT wrong, so it is not re-litigated

**The key material itself is handled correctly.** ed25519, generated with `generateKeyPairSync`,
persisted at `0600`, the private half never distributed, only the public half published (R-08.15).
**This ADR moves where it lives, not how it is made or used.**

## 3. Alternatives

| Option | Verdict |
|---|---|
| **A — leave it, keep link 1's derived authorisation** | **Rejected.** It leaves the highest-value asset under the weakest custody by residue, and keeps a hand-built mechanism that duplicates a platform capability |
| **B — harden the file** (stricter permissions, backup policy, an integrity marker) | **Rejected.** Every variant is a token on a volume, and §2.2's report established that a token on the volume is defeated by the accident it exists for. It also leaves the asymmetry with `SESSION_SECRET` |
| **C — resolve the signing key through the Secret Provider** ⟵ **RECOMMENDED** | The seam exists, is certified (ADR-0060), and already carries a secret of adjacent sensitivity |
| **D — a dedicated HSM / hardware-backed custody** | **Not now, and named rather than omitted:** it is **AD-028**, and ADR-0007 §5 already records residual risk **RR-3** against it. C is a prerequisite for D, not an alternative to it |

## 4. Decision

**P-83.1 — The package signing key is resolved through the `SecretProvider`, like every other secret this plane holds.**

**P-83.2 — There is NO create-if-missing. Absence is a refusal.**

Provisioning a secret is a **deliberate act**, so *absent* unambiguously means *not provisioned* —
and the first-run/lost-volume ambiguity that D-123 link 1 had to reconstruct **does not arise**,
because the storage has no creation idiom to inherit.

**P-83.3 — Link 1's derived authorisation is RETIRED WITH ITS SUBJECT, not left running.**

`SigningKeyMintAuthorisation` exists only because of the create-if-missing branch. **When that branch
goes, the authorisation goes with it** — CHARTER §17.1.1's obligation (ii): *a control whose
properties would survive the removal of its subject SHALL be retired with its subject, and its
retirement stated.* It must not be left in place looking like defence in depth.

**P-83.4 — The DISTRIBUTION reasoning survives the move, and is not part of it.**

*Has any verification key reached a tenancy?* is a question about **distribution**, not about where
the private key is stored. `publishVerificationKeys` and its rotation event are unaffected by this
ADR and remain correct after it.

**P-83.5 — Rotation is unchanged and is not re-designed here.** ADR-0007 §6 already makes rotation a
first-class operation with overlapping validity; moving the key's storage changes where a new key is
provisioned, not how rotation works.

### 4.1 What SHALL NOT be done

- **SHALL NOT keep a file fallback** *"for local development"*. A fallback that creates a key when the
  secret backend is unreachable reinstates exactly the branch P-83.2 removes, in the environment
  where it is least likely to be noticed. Local development provisions a local secret.
- **SHALL NOT widen `SecretProvider` with a create-or-get** — it would give every future secret the
  idiom this ADR exists to remove from one of them.
- **SHALL NOT fold AD-016's distribution leg into this** — that is ADR-0081 P-81.4 and D-123 link 1,
  already built.

## 5. Consequences

**What improves.** The platform's highest-value asset gets the custody its second-most-valuable
already has. A hand-built authorisation rule is deleted rather than maintained. And *absent* stops
being ambiguous, which is what made a lost volume silently mint a new identity.

**What it costs.** Key provisioning becomes a deployment prerequisite — the plane will not boot
without it, which is the point and is also a new operational step. Local development must provision a
secret rather than having one appear.

**What does not change.** ADR-0007's signing model, rotation, the verification-key distribution
carrier, the `DetachedSignature` contract shape, and every property proved for D-123 link 1 except
the mint authorisation (P-83.3).

**Risk.** **A deployment that cannot reach the secret backend does not boot.** That is correct — a
plane that cannot sign cannot author packages — but it converts a class of misconfiguration into a
hard stop. The mitigation is that it is a *loud* stop at boot rather than a silent identity change
discovered by a customer.

### 5.1 It removes a control, and that is deliberate

P-83.3 deletes `SigningKeyMintAuthorisation`. **Under CHARTER §17.1.1 that is the correct outcome, not
a regression:** the authorisation's properties would be satisfied trivially once nothing can create a
key, and a control satisfied by the absence of its subject *"is not detecting anything."*

### 5.2 The audit trail is unaffected and is worth naming

`verification-keys-distributed` audit entries are per-tenancy records of what was sent. They are
about distribution, not storage, and survive unchanged.

### 5.3 This does not close AD-016, and the reason matters

AD-016 covers *"signing key management, rotation, and customer-side verification."* ADR-0007 closed
its **model**; ADR-0081 P-81.4 and D-123 link 1 built its **distribution**; this ADR moves its
**storage**. **What remains open is hardware-backed custody (AD-028) and the residual risk RR-3
ADR-0007 §5 records — a malicious insider with signing-key access.** Moving from a file to Key Vault
narrows that surface; it does not eliminate it, and claiming closure here would be the
declared-but-unbuilt failure this platform exists to avoid.

## 6. Migration strategy

**Post-acceptance, each step separately authorised; none performed here.**

1. **Provision the signing key as a secret** in each environment, from the existing key material —
   **before any code change**, so no deployment is between the two states.
2. **Resolve it through `secrets.require`** in the composition root, and **delete the
   create-if-missing branch** together with `SigningKeyMintAuthorisation` (P-83.3). **Completion
   condition:** a boot with the secret absent **refuses**, with the branch that fired recorded.
3. **Retire the file path**, including any local-development fallback (§4.1).
4. **Re-run D-123 link 1's suite** — the signer and rotation properties must pass unchanged, which is
   what demonstrates P-83.4.

**The order is load-bearing:** provisioning before the code change means step 2 is a no-op for a
correctly-provisioned environment and a loud refusal for one that is not. Reversing them makes every
environment fail simultaneously.

## 7. Version impact

- **No contract change.** `CONTRACT_VERSION` unchanged; no cross-plane artefact is touched.
- **No architecture document changes.** R-08.15/16/17 already require what this does; **this ADR
  removes a divergence from them rather than amending them.**
- **Gate count +0.** Step 2's completion condition is a conformance property, not a registered gate.
- **Closure baseline:** adding this ADR turns `verify-programme-closure`'s *"no ADR has been added
  since closure"* leg **RED on exactly one leg**, recorded before the file was written.

## 8. Affected components

- [`ADR-0083-signing-key-custody.md`](ADR-0083-signing-key-custody.md) — **New** (this ADR).
- `packages/tenant-onboarding-engine/src/engine/package-signing.ts` — **Amended** on execution (P-83.2, P-83.3: the create branch and the mint authorisation are removed).
- `packages/tenant-onboarding-engine/src/server/platform-adoption.ts` — **Amended** on execution (P-83.1: resolved through `secrets.require`).
- `packages/tenant-onboarding-engine/test/signing-link1.test.ts` — **Amended** on execution (the mint-on-empty block is retired with its subject; the signer and rotation blocks stand).
- [`ADR-0007-package-signing.md`](ADR-0007-package-signing.md) — **Enforced, not amended.** Its model, rotation and key-identifier scheme are relied upon unchanged.
- [`ADR-0060-cloud-native-provider-platform.md`](ADR-0060-cloud-native-provider-platform.md) — **Named as the cause, not amended.** Its additive posture is why the key stayed a file.
- [`PROJECT_STATE.md`](../../program/PROJECT_STATE.md), [`TECHNICAL_DEBT.md`](../../program/TECHNICAL_DEBT.md), [`DECISIONS.md`](../../program/DECISIONS.md), [`NEXT_ACTION.md`](../../program/NEXT_ACTION.md) — **Amended** (the knowing red, D-129, the index row, the next action).

**No frozen architecture document, no contract, no gate and no source file is modified BY THIS ADR.**

---

> **STOP FOR ACCEPTANCE.** R-18.26 gates implementation on acceptance with an impact analysis, a
> migration strategy and a governance review. §5 is the impact analysis and §6 is the migration
> strategy. **Until accepted, the signing key stays a file and link 1's derived authorisation
> remains in force** — it is interim, and it is the correct interim.
