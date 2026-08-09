# Self-Certification — the authority audits itself

_Generated 2026-08-07T07:24:07.769Z · node v24.14.1 on win32_

The governance authority certifies its own execution the way it certifies a capability. **SELF-CERTIFIED** — the authority certifies its own execution

| # | Property | Holds |
|---|---|---|
| SC-1 | own runtime executed (five capabilities measured) | YES |
| SC-2 | own compilation of every capability was attempted fresh | YES |
| SC-3 | own tests were executed live for every buildable capability | YES |
| SC-4 | own self-validation is sound | YES |
| SC-5 | own scorecard verdict is derived, not asserted | YES |

## Double validation

The harness self-validation and the gate's independent re-derivation must agree; disagreement fails certification.

| # | Self-validation property | Holds |
|---|---|---|
| S-1 | exactly five canonical capabilities were measured | YES |
| S-2 | no capability is CERTIFIED without a passing gate | YES |
| S-3 | no capability is CERTIFIED with failing or unmeasured tests | YES |
| S-4 | no CERTIFIED capability has a NOT MEASURED dimension | YES |
| S-5 | no dimension marked certified is actually NOT MEASURED | YES |
| S-6 | the platform verdict follows the capability set | YES |
| S-7 | the scorecard verdict matches the platform verdict | YES |
| S-8 | every verdict carries a reason | YES |
| S-9 | every gate result was produced by a live invocation, not a stored value | YES |
| S-10 | maturity is one of the seven defined rungs | YES |
