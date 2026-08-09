# Customer Success Package

Release **M2.7** · contract **1.0.0**

Generated from the validation run that produced this release. Every guide below
describes behaviour that was executed, not behaviour that was intended.

## Start here

1. [Quick start](QUICK-START.md) — nothing to a first authenticated call
2. [Installation](INSTALLATION.md) — prerequisites, and what to do when one is unmet
3. [Configuration](CONFIGURATION.md) — what is supported, proven by validation
4. [Troubleshooting](TROUBLESHOOTING.md) — generated from real refusals

## Guides

- [Customer Administrator Guide](ADMINISTRATOR-GUIDE.md)
- [Architecture Overview](ARCHITECTURE-OVERVIEW.md)
- [Best Practices](BEST-PRACTICES.md)
- [Configuration compatibility matrix](CONFIGURATION.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Disaster Recovery Guide](DISASTER-RECOVERY.md)
- [FAQ](FAQ.md)
- [Installation Guide](INSTALLATION.md)
- [Known Limitations](KNOWN-LIMITATIONS.md)
- [Operations Guide](OPERATIONS.md)
- [Quick Start](QUICK-START.md)
- [Security Guide](SECURITY.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Upgrade Guide](UPGRADE.md)

## Runbooks

Every step names a platform operation that exists; the generator refuses to emit
a runbook whose steps do not.

- [Certificate renewal](runbooks/RUNBOOK-certificate-renewal.md)
- [Disaster recovery](runbooks/RUNBOOK-disaster-recovery.md)
- [Execution Plane upgrade](runbooks/RUNBOOK-execution-plane-upgrade.md)
- [Platform upgrade](runbooks/RUNBOOK-platform-upgrade.md)
- [Execution Plane registration](runbooks/RUNBOOK-registration.md)
- [Rollback](runbooks/RUNBOOK-rollback.md)
- [Secret rotation](runbooks/RUNBOOK-secret-rotation.md)
- [Tenant decommissioning](runbooks/RUNBOOK-tenant-decommissioning.md)
- [Tenant provisioning](runbooks/RUNBOOK-tenant-provisioning.md)
- [Troubleshooting](runbooks/RUNBOOK-troubleshooting.md)

## API

Generated from the published contract schemas and the gateway's observed behaviour.

- [Authenticating](api/AUTHENTICATION.md)
- [Error catalogue](api/ERROR-CATALOGUE.md)
- [OpenAPI specification](api/openapi.json)
- [Schema — evidence-reference-v1.0.0.json](api/schema/evidence-reference-v1.0.0.json)
- [Schema — execution-package-v1.0.0.json](api/schema/execution-package-v1.0.0.json)

## Configuration examples (27 files)

Each validates against the live schema — the same validator that will receive it.
Copy the file; do not transcribe from a guide.

- `examples/csharp-selenium/`
- `examples/enterprise-tenant/`
- `examples/java-selenium/`
- `examples/javascript-playwright/`
- `examples/jenkins-vm/`
- `examples/minimal-tenant/`
- `examples/python-playwright/`
- `examples/typescript-playwright/`
- `examples/typescript-selenium/`

## Verifying this package

```
content hash : d088bdc64b0575d3563f213fec0f1202095f42f8b102936572e93e41273799e2
built at     : 2026-07-22T00:00:00.000Z
expires at   : 2026-08-21T00:00:00.000Z
commit       : 292bf9f6e0cba0ec8b143a5fb9ae8148b69afb01
```

**The expiry is not a formality.** Installation validated against a superseded
release is not evidence about the current one. Past that date, treat this package
as unvalidated rather than merely old.
