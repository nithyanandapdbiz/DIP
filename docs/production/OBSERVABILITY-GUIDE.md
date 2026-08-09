# Observability guide

**Generated from the live metric registry.** A metric appears here because the
platform declares it, not because someone documented it.

## The three questions, and why they are not one question

| Probe | Asks | Asked by | Consults dependencies |
|---|---|---|---|
| Liveness | Should this process be killed and restarted? | The orchestrator | **No, deliberately** |
| Readiness | Should traffic be sent here? | The load balancer | Yes, those required to serve |
| Health | Is the platform doing its job for its tenants? | An operator | Yes, and it requires evidence of activity |

Conflating them causes specific, opposite failures. A liveness probe that checks
dependencies restarts a healthy process because a database blinked, turning a blip
into a restart storm. A health check that only checks liveness answers *"the process
is running"* to the question *"is it working?"* — which is how outages go undetected
(R-23.30, F-23.2).

## Silence is not health

A health check with no activity reports **`unknown`**, never `healthy`. A platform
with no errors because it is serving no requests is not healthy — it is silent, and
silence is indistinguishable from working from the outside. This is C-24.7, and it is
the property most easily lost: every convenience — a default of zero, an average that
skips nulls, a value carried forward from the last window — quietly converts
"unmeasured" into "fine".

The same rule reaches the dashboards: **every panel declares what its emptiness
means**, because the data layer getting this right is wasted if the presentation
layer then guesses.

## Correlation and tracing

Every operation carries a correlation id, and every record of that operation carries
it too. Spans nest, and a span that is never ended reports **`unfinished`** rather
than disappearing — a hung operation and one that never started need opposite
responses, so they must not render identically.

## Telemetry carries no customer content

C-23.11 forbids customer data in operational telemetry. This is enforced at the call
site: fields named `body`, `payload`, `response`, `content` and similar are refused,
as are values shaped like keys, tokens, or email addresses, and any value long enough
to be content rather than an identifier.

**Refused, not redacted.** Redaction is a guess about which fields matter and it
fails silently when the guess is wrong. Refusing surfaces the mistake while someone
is still looking at it.

## Metrics

| Metric | Kind | Unit | Scope | Meaning |
|---|---|---|---|---|
| `registration.succeeded` | counter | registrations | per tenant | Execution Planes that registered and received credentials. |
| `registration.failed` | counter | registrations | per tenant | Registrations refused or failed. Excludes idempotent replays, which are successes. |
| `registration.duration` | histogram | ms | per tenant | Wall-clock time to complete a registration. |
| `gateway.served` | counter | requests | per tenant | Authenticated requests served. |
| `gateway.refused_by_policy` | counter | requests | per tenant | Requests refused deliberately. A working control, not a fault — excluded from the gateway SLI. |
| `gateway.refused_unexpectedly` | counter | requests | per tenant | Requests refused for a reason that is not a policy decision. Counts against the SLI. |
| `gateway.duration` | histogram | ms | per tenant | Time to serve or refuse a request. |
| `certificate.issued` | counter | certificates | per tenant | Certificates issued. |
| `certificate.rotated` | counter | certificates | per tenant | Certificates rotated with overlap. |
| `certificate.rotation_failed` | counter | certificates | per tenant | Rotations that did not complete. A failure here becomes an outage on a known date. |
| `certificate.revoked` | counter | certificates | per tenant | Certificates revoked. |
| `certificate.days_remaining` | gauge | days | per tenant | Days until the active certificate expires. |
| `secret.rotated` | counter | secrets | per tenant | Secret versions created by rotation. |
| `secret.revoked` | counter | secrets | per tenant | Secret versions revoked, ending an overlap window. |
| `generation.succeeded` | counter | solutions | per tenant | Execution Plane solutions generated. |
| `generation.failed` | counter | solutions | per tenant | Generation failures for a profile the registry accepted. |
| `generation.duration` | histogram | ms | per tenant | Time to generate a solution. |
| `queue.depth` | gauge | items | per tenant | Items awaiting processing for a tenant. |
| `queue.enqueued` | counter | items | per tenant | Items enqueued. |
| `queue.drained` | counter | items | per tenant | Items drained. |
| `audit.recorded` | counter | events | per tenant | Lifecycle audit events recorded. |
| `security.replay_refused` | counter | requests | per tenant | Requests refused for nonce reuse. |
| `security.cross_tenant_refused` | counter | requests | per tenant | Attempts to assert another tenant. Refused and audited. |
| `quota.remaining` | gauge | units | per tenant | Quota left for a tenant in the current window. |

**An unrecorded metric reads `null`, never `0`.** "No requests were served" and "no
telemetry arrived" are different facts, and a zero collapses them into the more
comforting one — after which every SLI, score and dashboard inherits the error.

**Percentiles are observed values.** A p99 produced by interpolating between two
measurements is a number nothing measured (C-24.1).

## Service level objectives

| SLO | Protects | Target | Window | Consequence on breach |
|---|---|---|---|---|
| `slo.registration` | An Execution Plane can register and receive its credentials on first start. | 99.50% | 30d | Registration changes are frozen and the next release is blocked until the budget recovers. Onboarding is the first thing a customer experiences; a failure here is never absorbed. |
| `slo.gateway` | An authenticated call from a registered tenant is served. | 99.90% | 30d | Gateway deploys are frozen and an incident is opened with the affected tenants named. Refusals that are policy decisions are excluded from this SLI; only unexpected refusals count against it. |
| `slo.certificate-rotation` | A certificate rotates without the customer redeploying anything. | 99.90% | 90d | Rotation is suspended and every affected tenant is contacted before their certificate expires. A rotation failure becomes an outage on a known date, which makes it the one failure with a deadline. |
| `slo.solution-generation` | A tenant receives a generated Execution Plane for a supported profile. | 99.00% | 30d | Generator changes are frozen and the supported-target matrix is re-validated before any release. A generation failure for a declared-supported profile means the matrix is lying. |

**An SLO without a consequence is a statistic, not an objective** (R-23.10), and one
cannot be published without it — the registry refuses it.

**An exhausted error budget cannot be reset by retargeting** (R-23.17). Consumption
is recorded against the objective, not against its current target, so moving the
target carries the consumption forward and records the change. Adjusting the
instrument to flatter the result is the most natural thing to do when a budget is
spent and a release is waiting, which is exactly why it is prevented mechanically.

**An SLI with no telemetry reports `NOT MEASURED`** — never interpolated, never
carried forward from a previous window (R-23.13).

---

*Generated from the live registries. Not hand-maintained.*
