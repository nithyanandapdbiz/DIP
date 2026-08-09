# Authenticating

Two credentials are required together, and neither works alone.

| | What it proves | Where it comes from |
|---|---|---|
| Client certificate | Which tenant is calling | Issued during registration |
| Access token | That the call is currently authorised | Issued against the certificate |

## Why both

A certificate alone cannot expire quickly enough to be a session. A token alone can
be copied. Binding the token to the certificate key (`cnf.kid`) means a token lifted
from a log is useless without the private key — which never leaves your tenancy.

## Obtaining them

You do not request them. **Registration issues both**, once, in exchange for the
one-time credential embedded in your generated solution:

```json
{
  "tenantId": "tenant-example",
  "registrationEndpoint": "https://gateway.example.test/v1/register",
  "oneTimeRegistrationCredential": "otc-example-single-use-value"
}
```

That credential is **consumed on first use**. Registering twice with it does not
fail — it returns the grant you already hold. Registration is idempotent by tenant,
so a retried deployment cannot produce a second identity.

## Calling the API

```json
{
  "path": "/v1/execute",
  "token": "<access-token-issued-during-registration>",
  "nonce": "nonce-example-0001",
  "body": {
    "contractVersion": "1.0.0",
    "runId": "run-example-0001",
    "correlationId": "corr-example-0001",
    "capabilityId": "functional-testing",
    "operations": [
      {
        "operationId": "op-example-0001",
        "kind": "navigate",
        "target": "https://app.example.test/"
      }
    ]
  }
}
```

Send a `nonce` you have not sent before. A repeated nonce is refused — that is replay
protection, and it is not optional.

## Rotation

Certificates rotate without redeploying anything. The previous certificate keeps
working until it is explicitly revoked, so there is no moment where your deployment
must restart in lockstep with the platform. Fetch the new one, start using it, and
the old one falls away.

## What is never sent

Your private key. Your source. Your test data. Your screenshots. The platform stores
none of them, and the absence is verified on every build rather than promised here.
