# Runbook — Troubleshooting

**When to use:** Something is refused and the reason is not yet obvious.
**Downtime:** None.
**Reversible:** Yes

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Run full diagnostics. | Failures print first, each with what to do next. Usually this is the whole procedure. |
| 2 | If connectivity fails, check egress and TLS inspection. | Outbound reaches the endpoint. A re-signing proxy breaks mutual TLS. |
| 3 | If the certificate fails, read the classified reason. | The reason distinguishes expired, revoked, wrong-tenant and untrusted-issuer — four different problems. |
| 4 | If the token fails, check whether it is bound to the certificate you presented. | `not-bound-to-certificate` after a rotation means fetch a token for the new certificate. |
| 5 | If everything individually passes, call the gateway. | The refusal names the layer: `403` is entitlement, `429` is rate, `401` is identity. |

## If it fails partway

A refusal carrying no reason, an accepted cross-tenant access, or credentials that are issued but do not verify are platform defects. Report them rather than working around them.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (5 steps, 5 distinct operations).*
