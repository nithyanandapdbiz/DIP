# Runbook — Tenant decommissioning

**When to use:** A tenant is being retired permanently.
**Downtime:** Terminal.
**Reversible:** **No.** Read every step before starting.

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Confirm with the tenant owner. This does not reverse. | The decision is recorded before anything is destroyed. |
| 2 | Take your own final backup of everything you need. | Restore it somewhere and verify content hashes BEFORE proceeding. |
| 3 | Decommission the tenant. | The tenant is no longer registered. |
| 4 | Confirm the certificate is revoked. | Validation reports `revoked`. |
| 5 | Confirm calls are refused. | Refused. |
| 6 | Confirm the audit trail records the decommission. | A `decommission` event is present. The record outlives the tenant, deliberately. |

## If it fails partway

If step 2 was skipped, stop — there is no recovery path after step 3. Decommissioning revokes credentials and removes registration; the audit record remains, but access does not.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (6 steps, 5 distinct operations).*
