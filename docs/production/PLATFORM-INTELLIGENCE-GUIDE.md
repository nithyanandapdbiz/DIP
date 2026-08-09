# Platform intelligence guide

## This service observes. It never acts.

C-24.9 is absolute: no remediation, no writes, no control operations. Every output is
a description of what is true and what a human might do about it.

The temptation to close the loop — restart the thing, rotate the certificate, drain
the queue — is what turns a read-only intelligence surface into an unaudited control
plane. **A source scan in the test suite enforces this**, because the pressure to act
arrives during an incident, which is precisely when a comment stops working.

## Failure classification

8 categories are recognised:

- `authentication.no-certificate`
- `authentication.revoked-certificate`
- `authentication.token-binding`
- `authorisation.path`
- `capacity.rate-limit`
- `lifecycle.expiry`
- `security.cross-tenant-attempt`
- `security.replay`

**An unrecognised signal returns `unclassified` rather than the nearest match.** A
confident wrong answer sends an operator down a path that cannot work, which costs
more than an honest "I do not recognise this". An `unclassified` signal that recurs
is a gap in the classifier, and that is itself worth fixing.

## Every finding names its evidence

A finding carries what was observed, the likely cause **where that can be established
from evidence rather than guessed**, a recommendation, and the sources it was derived
from. A finding without traceable evidence is an opinion (C-24.2).

## Scores publish coverage and freshness

Every index publishes **score, coverage and freshness together** (C-24.5), and the
score is `null` when coverage is zero. Publishing `100%` over zero inputs is the most
dangerous number this service could produce, because it is most reassuring exactly
when it is least true.

Unmeasured indicators are excluded from the score and shown in coverage — not counted
as passes, which would inflate it, nor as failures, which would make the index
permanently red and therefore ignored.

## A silent source is a finding

A source that reported nothing produces a **major finding**, not an absence. Without
this, a monitoring system reports its best numbers during a total outage of whatever
reports to it — because nothing arrived to contradict them.

## Ingestion failure is per source

C-24.13: one unavailable source is partial ingestion, not a global outage. Reporting
it globally would discard the sources that did report.

## The service reports on itself

C-24.14: its own conformance appears in its own output. An intelligence service that
reported on everything except itself would hold an exemption precisely where scrutiny
matters most.

---

*Generated from the live registries. Not hand-maintained.*
