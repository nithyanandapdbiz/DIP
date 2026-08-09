# Runbook — Rollback

**When to use:** A deployment is misbehaving and you want the previous state back.
**Downtime:** Your schedule.
**Reversible:** Yes

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Redeploy the previous commit of your repository. | The deployment starts and re-registers idempotently. |
| 2 | Confirm credentials still verify. | They do. Rolling back your deployment does not invalidate platform-issued credentials. |
| 3 | Make an authenticated call. | Served. |
| 4 | Run diagnostics. | Every check passes. |

## If it fails partway

Credentials are independent of your deployment version, so a rollback cannot lose them. If they no longer verify, the cause is unrelated to the rollback — run the certificate check.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (4 steps, 4 distinct operations).*
