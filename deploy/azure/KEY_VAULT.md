# Key Vault Setup Guide — Intelligence Plane

The application reads **all** configuration from the process environment (R-17.15). Only genuine
secrets go in Key Vault; the rest are plain env values on the Container App. Nothing sensitive is baked
into the image (C-17.4).

## Secret inventory

| Secret name | Purpose | Environment variable | Required / Optional | Rotation notes |
|---|---|---|---|---|
| `session-secret` | HMAC key that signs **DBIZ session tokens** and **Execution-Plane credentials**. | `SESSION_SECRET` | **Required** — the container refuses to start if unset. | Rotating it **invalidates every issued session and EP credential**. Rotate only during a maintenance window; EPs must re-register (ADR-0036). Keep a **single stable value** across restarts. 32 bytes: `openssl rand -base64 32`. |
| `package-signing-key` | ed25519 **private key** (PKCS#8 PEM) that signs every execution package and solution manifest this plane authors (ADR-0007, ADR-0035, ADR-0081). | `PACKAGE_SIGNING_KEY` | **Required** — the container refuses to start if unset. | Changing it changes the **key id**, and every verification key already distributed stops matching. Treat like `session-secret`: a single stable value, rotated only deliberately. |
| `anthropic-api-key` / `openai-api-key` | LLM keys used by capabilities that call a model. | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | **Optional / not required to boot** | The IP HTTP server does **not** call an LLM at runtime today, so these are **not needed for deployment**. Provision only when a model-calling capability is wired. Flagged for owner rotation. |

## Create the required secrets
```bash
az keyvault secret set --vault-name "$KV" --name session-secret --value "$(openssl rand -base64 32)"

# The package signing key. Generated OUTSIDE the platform, deliberately (ADR-0083 P-83.2): there is
# no create-if-missing, so `absent` unambiguously means `not provisioned`.
openssl genpkey -algorithm ed25519 -out package-signing-key.pem
az keyvault secret set --vault-name "$KV" --name package-signing-key --file package-signing-key.pem
shred -u package-signing-key.pem   # or: rm -P / sdelete — it must not survive on the operator's disk
```

## Wiring (how the app receives it)
The Container App declares a Key Vault–referenced secret resolved through the user-assigned managed
identity, then maps it to the env var:

```yaml
# in containerapp.yaml
configuration:
  secrets:
    - name: session-secret
      keyVaultUrl: https://<keyvault-name>.vault.azure.net/secrets/session-secret
      identity: <user-assigned-identity-resource-id>
template:
  containers:
    - env:
        - name: SESSION_SECRET
          secretRef: session-secret
```
The identity needs **Key Vault Secrets User** (RBAC) or `get,list` secret permissions (access-policy vaults).

## Package-signing key — no longer a file, and no longer optional (ADR-0083)

**This section previously described a key that self-generated on the durable Azure Files mount.**
That branch is gone. The key is resolved through the Secret Provider like every other secret this
plane holds, and **there is no create-if-missing**:

- **Absence now unambiguously means *not provisioned*.** The first-run/lost-volume ambiguity — is
  this a fresh deployment, or a deployment whose volume was lost? — does not arise, because nothing
  can create a key by itself. `SigningKeyMintAuthorisation` was retired with its subject rather than
  left running as decoration (P-83.3).
- **There is no local-development fallback either**, deliberately. A fallback that mints a key when
  the backend is unreachable reinstates the removed branch in the environment where it is least
  likely to be noticed. Local development provisions a local secret.

**Newlines through the env round-trip:** the PEM reader tolerates literal `\n`, CRLF and a missing
trailing newline — all yield the same key and the same key id. Newlines *stripped* or replaced by
spaces are refused at boot. Measured, with the table, in
[`DEPLOY_READINESS.md`](DEPLOY_READINESS.md) §2. Store the PEM as-is.

## What is NOT a secret (plain env, not Key Vault)
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `IP_ADMIN_ALLOWLIST`, `PORT`, `DBIZ_STATE_DIR`, `NODE_ENV`,
`REGISTRATION_ENDPOINT`. `DBIZ_DEV_AUTH` must be **absent** in Azure.
