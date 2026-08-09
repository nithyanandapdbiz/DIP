# Runbook — Tenant provisioning

**When to use:** A new team or environment needs its own Execution Plane.
**Downtime:** None — nothing exists yet.
**Reversible:** Yes

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Run pre-flight checks on the target environment. | Every check reports pass. A failure names the unmet precondition. |
| 2 | Validate the technology profile against the live schema. | The profile is accepted. A refusal names the field or the unsupported combination. |
| 3 | Create the tenant. | A `tenant-creation` event appears in the audit trail. |
| 4 | Issue a one-time registration credential. | A credential is returned. It is single-use; do not store it as a key. |
| 5 | Generate the Execution Plane solution. | A file count and content hash are returned. Regenerating yields the same hash. |
| 6 | Hand the repository to the customer team. | The team can clone and build it without further input. |

## If it fails partway

Steps 1 and 2 fail before anything is created — correct and re-run. If step 3 or later fails, the tenant may exist without a registration; re-running is safe because registration is idempotent by tenant.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (6 steps, 5 distinct operations).*
