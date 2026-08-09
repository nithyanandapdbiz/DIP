# Operations

## Running it

The Execution Plane initiates all communication outbound and accepts no inbound
connection from the Intelligence Plane, for any purpose. Everything below follows
from that.

## What to watch

| Signal | Healthy | Act when |
|---|---|---|
| Certificate days remaining | > 14 | At 14. Rotation is free; expiry is an outage. |
| Refusals by reason | Stable | Any rise in one reason. The reason names the cause. |
| Request rate vs. limit | Below | Sustained `429`. That is a limit, not a fault. |
| Registration attempts | One per deployment | Repeated attempts — something is not persisting its grant. |

## Logging

Generated logging emits **identifiers and outcomes, never payloads**. If you extend
it, keep that: a log line carrying a request body is customer content in a place
nobody classified.

## Capacity

Quotas are per tenant and independent — one tenant exhausting its quota does not
affect another. Within your own deployment, concurrency is yours to set.

## What is not measured

Service level objectives are **defined but not measured**: no SLO value has been
observed. Document 23 defines the model, not the targets. Treat any SLO figure you
are quoted informally as unmeasured until it appears here.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
