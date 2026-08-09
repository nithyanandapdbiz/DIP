# Runbook — Execution Plane registration

**When to use:** First start of a deployment, or after rebuilding one from scratch.
**Downtime:** None.
**Reversible:** Yes

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Confirm outbound connectivity to the platform endpoint. | The connectivity check passes. A failure here is egress or a TLS-inspecting proxy. |
| 2 | Start the deployment so it registers with its one-time credential. | Registration returns a grant. A repeat returns the SAME grant, not a second identity. |
| 3 | Validate the issued certificate. | The certificate is valid and bound to the expected tenant. |
| 4 | Verify the access token against the certificate. | The token verifies and is bound to the certificate key. |
| 5 | Make an authenticated call. | The call is served. This — not credential issuance — is what proves registration worked. |

## If it fails partway

A failed registration leaves the tenant UNREGISTERED, never half-registered, so retrying is safe. `credential-already-consumed` on a genuinely new deployment means the tenant identifier is wrong.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (5 steps, 5 distinct operations).*
