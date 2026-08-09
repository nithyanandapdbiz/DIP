# Troubleshooting

**Start here:**

```
dbiz doctor
```

It runs every diagnostic and prints failures first, each with what to do next. The
table below is the same information, for when you have a message and not a terminal.

## Refusals

Every entry was produced by executing the gateway, not by reading its source.

| Refusal | What to do |
|---|---|
| `401` — access token required | Obtain a token bound to the certificate you are presenting. After rotating, fetch a new one. |
| `401` — client certificate required | Present your client certificate. Mutual TLS is required; a token alone is never sufficient. |
| `401` — token certificate-mismatch | Obtain a token bound to the certificate you are presenting. After rotating, fetch a new one. |
| `403` — not authorised for this path | Authenticated, but not entitled to what you asked for. Reissuing credentials will not change this — check the path and the tenant. |
| `403` — tenant scope may not be asserted by the caller | Authenticated, but not entitled to what you asked for. Reissuing credentials will not change this — check the path and the tenant. |

**`401` and `403` mean different things.** `401` is "I could not establish who you
are". `403` is "I know who you are, and that is not yours". Reissuing credentials
will never fix a `403`.

## Known failures

| Symptom | Cause | Remedy |
|---|---|---|
| Handshake fails inside the corporate network, succeeds outside | A TLS-inspecting proxy re-signs traffic and presents its own certificate | Exempt the platform endpoint from TLS inspection. Mutual TLS cannot survive a re-signing proxy. |
| A valid token is refused immediately after certificate rotation | Tokens are bound to the certificate they were issued against | Fetch a token for the new certificate. This is the binding working, not a fault. |
| Registration reports the credential is already consumed | The credential is single-use and this deployment has registered before | Registration is idempotent by tenant — re-registering returns your existing grant. If it does not, the tenant identifier is wrong. |
| Every field in the profile is valid but it is still refused | The combination is not buildable, even though each value is known | Check the compatibility matrix. A profile that parses is not a profile that can be built. |
| Onboarding fails at the environment check | Node.js is older than the supported minimum | Install Node.js 24 LTS. Older versions fail later as a handshake error, which is much harder to diagnose. |

## Two that look like platform faults and are not

**Handshakes fail inside the corporate network, succeed outside.** A TLS-inspecting
proxy is re-signing traffic. Mutual TLS is verifying your certificate, and the proxy
is presenting its own. Exempt the platform endpoint from inspection.

**A valid token is refused after rotating certificates.** Tokens are bound to the
certificate they were issued against. After rotating, fetch a token for the **new**
certificate. This is the binding doing its job: a token lifted from a log is useless
without the key it was bound to.

## When to contact support

Contact DBiz when a refusal carries **no reason**, when tenant isolation reports a
failure, or when credentials are issued but do not verify. Those are platform
defects. Everything else in this guide you can resolve without us — which is the
point of it.

**Support bundles are scrubbed before they leave your tenancy.** A support bundle is
the most probable route by which customer content escapes, because it is assembled
under time pressure by people trying to solve a problem.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
