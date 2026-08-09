# Best practices

## Rotate early

Rotate certificates at 14 days, not at expiry. The previous certificate keeps
working until revoked, so early rotation costs nothing and expiry costs an outage.

## Pin everything

Generated solutions pin exact versions. Keep it that way. A version range means
your build is not reproducible, and the day it breaks will not be a day anything
changed on your side.

## Keep the registration credential out of your image

Inject it at deploy from your secret store. It is single-use, so the blast radius
is small — but a credential baked into an image outlives every rotation policy you
will write.

## Send a fresh nonce every time

Replay protection is not tunable. A client that reuses nonces works until it
retries, then fails in a way that looks like an authentication problem.

## Do not log payloads

Generated logging emits identifiers and outcomes. Extending it to log request
bodies puts customer content somewhere nobody classified.

## Treat a reason-less refusal as a defect

Every refusal carries a reason. If one does not, report it rather than working
around it — the platform gates on that property, so its absence means something
is wrong upstream of you.

## Regenerate rather than hand-edit scaffolding

Generation is deterministic, so a regenerated diff is exactly what changed.
Hand-edited scaffolding turns your next upgrade into a merge.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
