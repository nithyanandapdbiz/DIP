# Disaster recovery

## What you must be able to restore

| Asset | Who holds it | If lost |
|---|---|---|
| Generated repository | You | **Regenerate.** Deterministic: the same profile yields byte-identical output. |
| Your tests and test data | **You** | Only your backups. The platform holds no copy. |
| Certificate and key | You | Rotate. Registration is idempotent. |
| Registration credential | You | Already consumed; you do not need it again. |
| Tenant identity | Platform | Nothing to restore. |

**The row that matters is the second.** The platform storing nothing of yours is a
security property and a recovery obligation at the same time. Nobody else has a
copy of your tests.

## Losing the whole Execution Plane

1. Restore your repository from your own backup, or regenerate the scaffolding.
2. Redeploy. Registration is idempotent — you get your existing grant back.
3. Run `dbiz doctor`.

Certificates do not need to be reissued unless they were compromised. If they were,
that is a rotation and it needs no redeploy.

## Restore is only real if you have done it

The platform holds itself to this: its own restore procedure is executed on every
build — backup, **destroy the working copies**, restore, and verify content hashes.
A restore check that never removes anything proves only that the files were already
there, and one that checks existence passes against an empty file.

Hold your own backups to the same standard. Restore them somewhere, and compare
content rather than filenames.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
