# Runbook — Certificate renewal

**When to use:** At 14 days remaining, or immediately on suspected compromise.
**Downtime:** **None.** The previous certificate keeps working until it is revoked.
**Reversible:** Yes

## Procedure

| # | Action | How you know it worked |
|---|---|---|
| 1 | Check the current certificate. | Days remaining are reported. Under 14 is the trigger; under 0 is an outage. |
| 2 | Rotate. | New certificate material is returned, with a different key id. |
| 3 | Confirm the PREVIOUS certificate still works. | Served. This is the overlap that removes the need for a coordinated restart. |
| 4 | Deploy the new certificate and obtain a token bound to it. | A token is issued against the new key id. |
| 5 | Make an authenticated call with the new material. | Served. |
| 6 | Revoke the previous certificate. | A call using the old certificate is now refused with `certificate revoked`. |

## If it fails partway

Stop before step 6. Until revocation, both certificates work and you can simply continue on the old one. Never revoke before step 5 has passed.

---

*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (6 steps, 5 distinct operations).*
