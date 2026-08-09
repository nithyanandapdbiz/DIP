# Runbook — Disaster recovery

**When to use:** The Execution Plane environment is lost.
**Downtime:** Until recovery completes.
**Reversible:** **No.** Read every step before starting.

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Restore your repository from your own backup. | Compare content hashes, not filenames. A file that exists is not a file that is intact. |
| 2 | If the repository is unrecoverable, regenerate the scaffolding. | Deterministic generation returns the same hash for the same profile and version. |
| 3 | Redeploy. | Idempotent registration returns your existing grant. |
| 4 | Validate the certificate. | Valid, and bound to your tenant. |
| 5 | Rotate credentials if the loss may have exposed them. | New material is issued; revoke the old only after the new is proven. |
| 6 | Run full diagnostics. | Every check passes. |

## If it fails partway

**Your tests and test data exist only in your backups** — the platform holds no copy. That is a security property and a recovery obligation at the same time. If your backups are also lost, the platform cannot help recover them, and no procedure here will change that.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (6 steps, 6 distinct operations).*
