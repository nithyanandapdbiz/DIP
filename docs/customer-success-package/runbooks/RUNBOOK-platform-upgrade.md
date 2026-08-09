# Runbook — Platform upgrade

**When to use:** DBiz upgrades the platform. Recorded so you know what to expect.
**Downtime:** None for you.
**Reversible:** Yes

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Confirm your contract version is inside the supported window. | Calls continue to be served. |
| 2 | Make an authenticated call after the upgrade. | Served, with no change on your side. |
| 3 | Check the audit trail for upgrade events affecting your tenant. | Any upgrade affecting you is recorded and attributable. |

## If it fails partway

A platform upgrade that breaks a contract inside its supported window is a platform defect. Report it; do not work around it by upgrading early under pressure.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (3 steps, 3 distinct operations).*
