# Installation

## Prerequisites

| Requirement | Why |
|---|---|
| Node.js 24 LTS | Older versions lack TLS behaviour the platform depends on. The failure appears later as a handshake error rather than a version error, which is why it is checked first. |
| Outbound TCP to your platform endpoint | The Execution Plane initiates every connection. |
| No inbound rule | Nothing connects into your tenancy. If you are asked to open a port, it is not for this. |
| A secret store | For the registration credential at deploy time. Not required to evaluate. |

**Run `dbiz doctor --preflight` before installing.** It checks each of these and
names the unmet one. A failed installation that does not name its unmet
precondition is a defect in this platform, not an error on your side.

## Validated targets

Each row was validated by an executed run, not declared:

| Language | Framework | Status |
|---|---|---|
| typescript | playwright | **Validated** |
| typescript | selenium | **Validated** |
| javascript | playwright | **Validated** |
| java | selenium | **Validated** |
| csharp | selenium | **Validated** |
| python | playwright | **Validated** |
| minimal | tenant | **Validated** |
| enterprise | tenant | **Validated** |
| jenkins | vm | **Validated** |

## Installing without reaching DBiz

Installation requires **no connectivity to DBiz**. Point your package manager at
your own mirror; the generated solution pins exact versions, so a mirrored
registry resolves to the same bytes.

Registration does require reaching your platform endpoint — but that is your
deployment calling out at runtime, not installation.

## When installation fails

It names the unmet precondition. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md),
which is generated from the same diagnostics that produce those messages.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
