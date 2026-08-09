# Error catalogue

**Generated from the gateway's observed behaviour.** Every entry below was produced
by executing the gateway, not by reading its source. A status this table does not
list is a status the gateway was not observed to return.

| Status | Reason | What to do |
|---|---|---|
| `401` | access token required | Obtain a token bound to the certificate you are presenting. After rotating, fetch a new one. |
| `401` | client certificate required | Present your client certificate. Mutual TLS is required; a token alone is never sufficient. |
| `401` | token certificate-mismatch | Obtain a token bound to the certificate you are presenting. After rotating, fetch a new one. |
| `403` | not authorised for this path | Authenticated, but not entitled to what you asked for. Reissuing credentials will not change this — check the path and the tenant. |
| `403` | tenant scope may not be asserted by the caller | Authenticated, but not entitled to what you asked for. Reissuing credentials will not change this — check the path and the tenant. |

## Reading a refusal

Every refusal carries a `reason`. If you receive a refusal without one, that is a
platform defect and worth reporting — the platform gates on refusals being explained.

`401` means the platform could not establish **who you are**. `403` means it knows
who you are and you asked for something else's. The distinction matters when you are
debugging: a `403` will never be fixed by reissuing a certificate.
