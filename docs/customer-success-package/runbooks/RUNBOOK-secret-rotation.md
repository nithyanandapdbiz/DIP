# Runbook — Secret rotation

**When to use:** On schedule, on staff change, or on suspected exposure.
**Downtime:** **None.** The previous version stays readable until revoked.
**Reversible:** Yes

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Record the current version number. | The current version is returned. |
| 2 | Rotate. | A higher version number is returned. |
| 3 | Confirm work in flight still resolves the previous version. | The previous version is still readable. This overlap is what makes rotation not an outage. |
| 4 | Confirm execution continues. | Calls are still served across the rotation. |
| 5 | Revoke the previous version once nothing is using it. | The previous version is no longer retrievable. |

## If it fails partway

Before step 5 nothing is lost — the old version is live. After step 5 the old value is gone; if something was still using it, rotate forward again rather than trying to restore.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (5 steps, 4 distinct operations).*
