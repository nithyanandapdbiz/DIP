# The first-run marker — what "this plane has never signed before" may be derived from

**2026-08-06. Reported before building, as required. Nothing built.**

> **THE MARKER SHOULD NOT BE A MARKER.** Every token-shaped answer fails the test the ruling itself
> set — *a marker that can be recreated by the same accident that lost the volume closes nothing* —
> because a token lives somewhere, and the somewhere is either the lost volume or an operator's
> hands.
>
> **THE CONDITION TO DERIVE FROM IS: HAS THIS PLANE EVER REGISTERED A TENANCY?** Not because
> registration is a proxy for signing, but because **the harm of minting a new key is precisely that
> previously distributed verification keys stop matching — and if no tenancy exists, none was
> distributed.** The condition is coupled to the harm rather than to a token, so **the accident that
> destroys the evidence also destroys the reason to refuse.** §3.
>
> **AND THE MARKER QUESTION IS A SYMPTOM.** `SESSION_SECRET` is resolved through the **Secret
> Provider**; the signing key — the platform's *highest-value asset* by ADR-0007 §2 — is a **file on
> a mounted volume**, in the same composition root, twelve lines apart. **That inconsistency is the
> real finding, and it is recorded rather than fixed here.** §5.

---

## 1. What the repair has to achieve, stated before the options

`loadOrCreateSigningKey` creates a key pair when the file is absent. Two situations produce that
absence and they must be distinguished:

| | Situation | Correct behaviour |
|---|---|---|
| **A** | **First run.** This deployment has never signed anything and no verification key has ever been distributed | **Create.** Refusing would make the platform unbootable on day one |
| **B** | **Lost volume.** A key existed, its public half was distributed, and the file is gone | **REFUSE, loudly.** Creating mints a new `keyId`, and every distributed verification key stops matching — surfacing as `signature-invalid` **in the customer's plane** |

> **THE DISTINCTION IS THE WHOLE REPAIR.** Without it the refusal is **permanent** (nothing can ever
> boot fresh) or **useless** (everything is treated as first run, which is today's behaviour with an
> error message added).

## 2. Why every token-shaped marker fails

| Option | Fails because |
|---|---|
| **A file beside the key** (`signing/.initialised`) | **Same failure domain.** The accident that loses `ep-package-signing.pem` loses this too, and the plane concludes *first run* again. This is the option the ruling named and it is named here to be refused explicitly |
| **A file elsewhere on the same volume** | identical, one directory along. `tenantsDir`, `signingDir` and `registrationDir` are **all** under `config.state.dir` |
| **An environment flag** (`DBIZ_SIGNING_FIRST_RUN=1`) | **It authorises the wrong person at the wrong moment.** An operator meeting a refusal sets it to make the error go away — the make-the-gate-green failure this register counts. And a flag left set (the overwhelmingly likely state) authorises **every future silent mint** |
| **A build-time constant** | cannot distinguish two deployments of the same build, which is the actual question |

**One environment-flag variant is nearly viable and is recorded because it will be proposed:** refuse
to boot when the flag is set **and** a key already exists, so the flag is self-retiring. It closes
the left-set-forever hole, and **it still authorises the operator debugging a refusal to create the
very state the refusal exists to prevent.** Rejected for that, not for the first reason.

## 3. RECOMMENDED — derive it from whether a tenancy has ever been registered

**The plane already holds the answer, and it holds it in the one place whose loss makes the question
moot.**

> **Minting a new key is harmful for exactly one reason: verification keys already in customer hands
> stop matching.** Verification keys reach a tenancy **only through the registration grant**
> (ADR-0081 P-81.4). **So if no tenancy has ever been registered, no verification key has ever been
> distributed, and minting is harmless.**

| Volume state | Tenants present? | Key present? | Behaviour | Correct? |
|---|---|---|---|---|
| fresh deployment | no | no | **create** | yes — situation A |
| running deployment | yes | yes | load | yes |
| **signing dir lost** | **yes** | **no** | **REFUSE** | **yes — situation B, the case the repair exists for** |
| whole volume lost | no | no | **create** | **yes — and this is the property that matters** |

**The last row is the test the ruling set.** The accident that destroys the evidence — the whole
state volume — **also destroys every tenancy record, and with it the reason to refuse.** There is no
tenancy holding a stale verification key, because there is no tenancy. **The condition is coupled to
the harm, not to a token, so it cannot be recreated by the accident that defeats a token.**

### 3.1 It over-approximates toward refusal, and that is the correct direction

*Has a tenancy ever been registered* is **not** *has a verification key ever been distributed*.
`carlisle-homes` registered **before `packageVerificationKeys` existed**, so a tenancy exists that
holds no key. Under this rule, losing the signing directory today would **refuse** — even though the
one tenancy could not verify anything anyway.

**That is fail-closed and is left as it is.** The alternative — tracking distribution precisely —
requires a record of what each grant carried, which is state this plane deliberately does not keep
(the grant is returned once and never persisted). **Refusing slightly more often than strictly
necessary costs an operator one deliberate action; refusing slightly less often costs a customer a
silent verification failure.**

### 3.2 What the refusal must say, because a refusal nobody can act on is an outage

The message names: that a signing key is absent, that **N tenancies are registered**, that creating a
new key would invalidate any verification key already distributed, and **the one action that
resolves it** — restore the signing directory from backup, or, if the loss is accepted, an explicit
operator act that re-mints and **re-distributes** to every tenancy.

> **THAT SECOND PATH IS NOT DESIGNED HERE, AND ITS ABSENCE IS THE HONEST RESIDUAL.** Re-minting
> requires the rotation channel that rides with link 1 — so **the refusal is only actionable once
> rotation exists**, which is another reason the three parts land together.

## 4. What this does NOT solve

**It does not protect the FIRST tenancy's registration window.** Between first boot and first
registration, the plane will freely re-mint on an empty volume. **Nothing has been distributed in
that window, so nothing breaks** — but a reader should not take this rule as *the key is stable from
first boot*. It is stable **from first registration**.

**It does not make the key durable.** It converts a silent identity change into a loud refusal.
**Durability is §5.**

## 5. THE MARKER QUESTION IS A SYMPTOM — the key is in the wrong custody, and the inconsistency is inside one function

```
sessionSecret = secrets.require('SESSION_SECRET')                      <- the Secret Provider
signingKey    = loadOrCreateSigningKey(join(signingDir, '…​.pem'))      <- a file on a mounted volume
```

**Twelve lines apart in the same composition root.** The session secret — which signs sessions and EP
credentials — is resolved through the **Secret Provider**, backed by Key Vault in cloud, where
absence is unambiguous and throws `MissingSecretError`. **The package signing key — which ADR-0007 §2
calls the platform's highest-value asset, whose compromise "grants reach into *every* customer
tenancy simultaneously" — is a file that is created if missing.**

> **NO DECISION RECORDS THAT SPLIT.** The signing key predates the provider adoption
> (ADR-0060 §6 M-a adopted the config/secret seam "additively"), so it was simply not moved — and
> nothing since has asked why the weaker custody holds the stronger asset.

**The real repair is that the signing key is a SECRET, resolved like one.** `SecretProvider.require`
already has exactly the semantics this report is reconstructing: **absent throws, and there is no
create-if-missing.** The first-run problem largely dissolves — provisioning a secret is a deliberate
act, so *absent* unambiguously means *not provisioned*.

**It is NOT proposed as part of link 1.** It touches secret provisioning, deployment and key
custody — AD-016's open leg — and folding it into a signing change is the scope error D-087 counts.
**Recorded as debt, with §3 as the correct interim**, and §3 remains correct even after the move
because it is about *distribution*, not storage.

## 6. Recommendation

1. **Derive first-run from the tenant registry** (§3). No new artefact, no operator token, fail-closed,
   and **coupled to the harm** rather than to a marker.
2. **The refusal names the count and the resolving action** (§3.2) — and is only fully actionable once
   rotation exists, which is why the three parts of link 1 land together.
3. **Record the custody inconsistency as debt** (§5). The signing key belongs in the Secret Provider;
   that is its own decision, and this report does not take it.

**What must NOT be done:**

- **SHALL NOT place the marker on the state volume** — it is defeated by the accident it exists for.
- **SHALL NOT use an operator-set flag** — it authorises the person debugging the refusal to create
  the state the refusal prevents.
- **SHALL NOT refuse without a resolving action**, which requires rotation.
- **SHALL NOT move the key to the Secret Provider inside link 1** — it is AD-016's leg and its own ADR.

## 7. Measured

`loadOrCreateSigningKey`'s create-on-absent branch and its call site; `stateDir` and the three
directories beneath it, from the composition root; `SecretProvider.require`'s throw-on-absent
semantics from its interface; the verification-key carrier from `RegistrationGrant.configuration`.
**Nothing was modified.**
