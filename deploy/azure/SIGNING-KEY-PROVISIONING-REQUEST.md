# `package-signing-key` — the Azure operation, addressed to Ananthu

**Raised 2026-08-06, after `6afd7d3` was pushed to `main`.** Conditions and mechanism are
authoritative in [`DEPLOY_READINESS.md`](DEPLOY_READINESS.md) §1 and are not restated here. **This
file exists to say which half is done, which half is yours, and the one thing that must be checked
before you create anything.**

---

## 1. Our half is done — the reference exists now

`package-signing-key` was declared in **neither** [`containerapp.yaml`](containerapp.yaml) nor
[`main.bicep`](../iac/main.bicep); both carried `session-secret` only. Both now declare the Key Vault
reference **and** the `PACKAGE_SIGNING_KEY` env mapping, mirroring `session-secret` exactly
(conditions **1.2** and **1.3**). Pushed as [`18f8255`](DEPLOY_READINESS.md).

**This had to go first, and that ordering is not a formality.** An image that does not declare the
secret cannot consume it. Had the vault secret been created on its own, **the symptom would not have
changed** — the revision would still have failed to boot with the same `SigningKeyAbsentError`, and
the next reading would have been *"the secret is there and it still will not start."* That sends
everyone hunting a second cause that does not exist. The application can only observe that the
variable is absent; it cannot see which of the three links is broken.

## 2. Your half — create the value

Vault **`kv-dbizip-dev-ajtw`**, secret name **`package-signing-key`** (conditions **1.1** and
**1.4** — the secret, and `Key Vault Secrets User` on the user-assigned identity).

### 2.1 CHECK THIS FIRST, BEFORE GENERATING ANYTHING

On the **`ip-state` Azure Files share**, look for:

```
/state/signing/ep-package-signing.pem
```

| If it… | Then |
|---|---|
| **EXISTS** | **Lift THAT PEM into the vault verbatim.** Do not generate a new one. |
| **does not exist** | **Generate a new PKCS#8 ed25519 key.** Nothing is lost. |

**Why the check is not optional.** The key id is **derived from the key** — it is a hash of the
public key, not a stored label. A new key is a new key id, and **anything already signed under the
old id stops verifying**: every verification key already distributed to the Execution Plane would
stop matching. That is the precise failure ADR-0083 P-83.2 removed create-if-missing to prevent —
a key that appears by itself is the outage, not the recovery.

If the file does not exist, no package has been signed under a durable key, so a fresh key strands
nothing.

### 2.2 Generating one, if the file is absent

PKCS#8 **ed25519** private key PEM. Either:

```bash
openssl genpkey -algorithm ed25519 -out package-signing-key.pem
az keyvault secret set --vault-name kv-dbizip-dev-ajtw \
  --name package-signing-key --file package-signing-key.pem
```

## 3. Newlines are safe — do not hand-repair the PEM

**Measured, not assumed** (run against the actual load path, `createPublicKey` on the stored value):

| Form of the value | Result |
|---|---|
| canonical LF, trailing newline | ✅ loads — reference key id |
| **literal `\n`** two-character sequences | ✅ loads — **identical key id** |
| **CRLF** line endings | ✅ loads — **identical key id** |
| **missing trailing newline** | ✅ loads — **identical key id** |
| **all newlines stripped** | ❌ refuses, `ERR_OSSL_UNSUPPORTED` |
| newlines replaced by spaces | ❌ refuses, `ERR_OSSL_UNSUPPORTED` |

So whichever way the portal, the CLI or a copy-paste mangles the line endings, **you get the same
key and the same key id** — there is no silent variant that signs under a different identity. The
only failing form is one where the newlines are removed entirely, and **it refuses at boot rather
than signing wrong.** A loud refusal at startup is the safe failure; a quiet key-id change is not.

**The practical consequence: do not "fix" a PEM that looks wrong in the portal.** Re-typing it is the
only way to introduce a real error here.

## 4. One thing that is NOT yours, flagged so it does not surprise you

The two deployment descriptors **disagree about where the Readiness probe points** —
`containerapp.yaml` at `/api/health`, `main.bicep` at `/api/ready`. Recorded as **D-148** in
[`TECHNICAL_DEBT.md`](../../program/TECHNICAL_DEBT.md); it is not this change's to fix.

**It matters to you only in one way: it is decided by whichever descriptor you apply last.** Applying
`containerapp.yaml` after `main.bicep` silently points readiness at liveness, and nothing reports the
change — both probes return `200` from a healthy process. The regression appears only when the state
volume detaches, which is exactly when the probe was supposed to catch it. If you apply only one,
prefer **`main.bicep`**; it already encodes the intended split.
