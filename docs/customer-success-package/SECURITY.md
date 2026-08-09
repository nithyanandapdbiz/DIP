# Security

## What the platform never holds

- Your source code
- Your test data
- Your screenshots and captured media
- Your secrets
- Your private keys

This is verified on every build by scanning platform storage for those artefact
kinds — not by searching for a known value, which would only prove that one value
is absent.

## How calls are authorised

Two credentials, together, neither sufficient alone:

1. **A client certificate** identifying your tenant, bound in the subject and in a
   SAN URI. Every authorisation decision derives from it.
2. **An access token** bound to that certificate's key. Presented on a different
   certificate, it is refused.

**A tenant identifier in a request body is treated as an attack**, answered `403`,
and audited. Identity comes from the certificate; nothing else can assert it.

## Replay

Every request carries a nonce. A repeated nonce is refused. This is not tunable.

## Rotation and revocation

Certificates rotate with overlap and no redeploy. Revocation takes effect at the
gateway immediately — it does not wait for expiry and needs no action from you.

## Your responsibilities

| | |
|---|---|
| Private keys | Never leave your tenancy. Nothing asks for them. |
| The registration credential | Single-use. Inject at deploy; do not treat as a key. |
| Secrets | Your vault. The platform integrates; it does not custody. |
| Egress | Allow outbound. Never open inbound. |

## Reporting

A refusal without a reason, an accepted cross-tenant access, or an unexpected
revocation are all security events. Report them rather than working around them.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
