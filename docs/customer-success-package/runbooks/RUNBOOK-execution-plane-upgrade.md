# Runbook — Execution Plane upgrade

**When to use:** You choose to adopt a newer generated scaffolding.
**Downtime:** Your schedule.
**Reversible:** Yes

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Regenerate from your existing profile. | A content hash is returned. Same profile and generator version means byte-identical output. |
| 2 | Review the diff in your repository. | The diff shows only real changes — determinism is what makes that true. |
| 3 | Deploy. | Registration is idempotent: you get your existing grant, not a new identity. |
| 4 | Run diagnostics. | Every check passes. |

## If it fails partway

Roll back to the previous commit and redeploy. Nothing on the platform side changed, so there is nothing to unwind there.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (4 steps, 3 distinct operations).*
