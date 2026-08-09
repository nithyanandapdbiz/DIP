# Administrator guide

For whoever owns the Execution Plane deployment day to day.

## What you own, and what DBiz owns

| | You | DBiz |
|---|---|---|
| The Execution Plane deployment | **Yes** | No access |
| Your source, test data, results, screenshots | **Yes** | Never stored |
| Your secrets | **Yes**, in your vault | Never held |
| Certificates and tokens | Held by you | **Issued and revoked** |
| The platform endpoint | — | **Yes** |

This split is enforced, not agreed. The platform is checked on every build for
retention of customer source, media, archives, keys and environment files.

## Routine tasks

| Task | Runbook | Downtime |
|---|---|---|
| Certificate renewal | [RUNBOOK-certificate-renewal.md](runbooks/RUNBOOK-certificate-renewal.md) | **None** |
| Secret rotation | [RUNBOOK-secret-rotation.md](runbooks/RUNBOOK-secret-rotation.md) | **None** |
| Platform upgrade | [RUNBOOK-platform-upgrade.md](runbooks/RUNBOOK-platform-upgrade.md) | None for you |
| Execution Plane upgrade | [RUNBOOK-execution-plane-upgrade.md](runbooks/RUNBOOK-execution-plane-upgrade.md) | Your schedule |
| Rollback | [RUNBOOK-rollback.md](runbooks/RUNBOOK-rollback.md) | Your schedule |
| Decommissioning | [RUNBOOK-tenant-decommissioning.md](runbooks/RUNBOOK-tenant-decommissioning.md) | Terminal |

## Rotation is not an outage

Certificate rotation issues a new certificate while the previous one **keeps
working** until it is explicitly revoked. There is no moment where your deployment
must restart in lockstep with the platform. Rotate early rather than at expiry —
the overlap is what makes that free.

## Monitoring

Watch three things: certificate expiry (warned at 14 days by `dbiz doctor`),
refusal rates by reason, and your request rate against your limit. A rising `401`
rate with reason `token replayed` means something is retrying with a stale nonce —
a client bug, not a platform fault.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
