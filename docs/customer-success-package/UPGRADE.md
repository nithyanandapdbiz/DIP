# Upgrading

## Two things upgrade separately

| | Who upgrades it | When |
|---|---|---|
| The platform | DBiz | Continuously. You are not involved. |
| Your Execution Plane | **You** | When it suits you, within the supported window. |

They are decoupled on purpose. A platform release that required every customer to
redeploy would make your release schedule ours.

## The supported window

Contracts are versioned; the current contract is **1.0.0**. The
platform accepts every version in its supported window, so you upgrade inside that
window rather than on our release day. A version outside it is refused with the
version you sent, the window that is current, and what to change — never a bare
rejection.

## Upgrading your Execution Plane

1. Regenerate from your profile. Generation is deterministic: the same profile and
   the same generator version produce **byte-identical** output, so the diff you
   review is exactly what changed and nothing else.
2. Review the diff. It is a pull request in your repository.
3. Deploy on your schedule.

Registration is idempotent, so a redeploy does not create a second identity and
does not need a new credential.

## What upgrading never does

It does not touch your tests, your test data or your results. Regeneration
produces platform scaffolding; what you wrote is yours and is not overwritten.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
