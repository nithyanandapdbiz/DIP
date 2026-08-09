# Operational dashboard specification

**Generated from the metric registry.** Every panel below names metrics the platform
actually declares; a specification naming an undeclared metric is refused rather than
published, because an empty panel is indistinguishable from a quiet period.

## Why every panel declares what emptiness means

C-24.7: *absence of incidents is never reported as health*. A panel with no data is
either "nothing happened" or "nothing reported", and those need opposite responses.
Each panel below says which one its emptiness indicates — the data layer getting this
right is not enough if the presentation layer then guesses.

## Capacity utilisation

**Audience:** Capacity planning.

### Quota remaining by tenant

- **Type:** table · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `quota.remaining`
- **When empty:** No quota is being reported for any tenant. Every registered tenant has a quota, so emptiness here is a reporting failure rather than an absence of limits — do not read it as "nobody is near their limit".
- **Reading it:** Quotas are per tenant and independent: one tenant exhausting its quota does not affect another. A tenant at zero is rate-limited, not broken.

### Throughput by operation

- **Type:** timeseries · **Scope:** platform-wide
- **Metrics:** `gateway.served`, `registration.succeeded`, `certificate.issued`, `secret.rotated`
- **When empty:** No operations of any kind were recorded. On a platform with registered tenants this is an outage or a telemetry failure, never a quiet period — all four counters going flat together is the signal.
- **Reading it:** Compare against the benchmark report rather than against a remembered figure.

## Certificate and secret lifecycle

**Audience:** Operators owning credential rotation.

### Certificate issuance, rotation and revocation

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `certificate.issued`, `certificate.rotated`, `certificate.rotation_failed`, `certificate.revoked`
- **When empty:** No certificate activity. Sustained emptiness alongside falling days-remaining means rotation has stopped, which is an outage being scheduled.
- **Reading it:** Rotation failures are the highest-value signal here: each is a dated future outage.

### Secret rotation and revocation

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `secret.rotated`, `secret.revoked`
- **When empty:** No secret rotation. Whether that is correct depends on your rotation policy, which this panel does not know.
- **Reading it:** Rotations far exceeding revocations means overlap windows are being left open.

## Registration and onboarding

**Audience:** Anyone who owns the first thing a customer experiences.

### Registrations succeeded vs. failed

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `registration.succeeded`, `registration.failed`
- **When empty:** No registrations were attempted. Expected outside onboarding periods; NOT evidence that registration works.
- **Reading it:** A failure here is the first thing a customer sees. The SLO consequence is a freeze, deliberately.

### Registration duration

- **Type:** heatmap · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `registration.duration`
- **When empty:** No registrations completed in the window.
- **Reading it:** Compare against the published onboarding measurement rather than against intuition.

### Solution generation

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `generation.succeeded`, `generation.failed`, `generation.duration`
- **When empty:** No solutions were generated. Expected outside onboarding periods, and NOT evidence that generation works — that is proven by the supported-target validation, not by this panel.
- **Reading it:** A generation failure for a profile the registry ACCEPTED means the supported-target matrix is lying. That is a platform defect, not a customer error.

## Runtime health

**Audience:** Operators answering "is the platform working?"

### Gateway request duration

- **Type:** heatmap · **Scope:** platform-wide
- **Metrics:** `gateway.duration`
- **When empty:** No requests were handled. During business hours this is an outage signal, not a quiet period.
- **Reading it:** Percentiles are computed from observed values only; no interpolation (C-24.1).

### Queue depth by tenant

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `queue.depth`, `queue.enqueued`, `queue.drained`
- **When empty:** Nothing is queued. Distinguish from "nothing is reporting" using the enqueued/drained counters — a flat zero on all three is a reporting failure.
- **Reading it:** Depth rising while drained is flat means processing has stopped, not that load has risen.

## Security monitoring

**Audience:** Security operations.

### Replay refusals

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `security.replay_refused`
- **When empty:** No replays refused. This is the expected steady state and is NOT proof the control works — that is proven by the fault-injection suite, not by this panel.
- **Reading it:** A client bug reuses nonces on retry; an attack replays a captured request. The source certificate distinguishes them.

### Cross-tenant assertion attempts

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `security.cross_tenant_refused`
- **When empty:** No cross-tenant assertions were attempted. This is the expected steady state; it is evidence of nothing happening, not evidence that the control works.
- **Reading it:** Any non-zero value warrants investigation: legitimate clients have no reason to send a tenant identifier at all.

### Audit events recorded

- **Type:** stat · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `audit.recorded`
- **When empty:** No audit events. Since registration and execution both emit them, emptiness alongside gateway activity means the audit path is broken — which is a compliance failure, not a quiet period.
- **Reading it:** Audit volume should track lifecycle activity. Divergence is the signal.

## Tenant health

**Audience:** Operators answering "is this specific customer working?"

### Requests served vs. unexpectedly refused, per tenant

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `gateway.served`, `gateway.refused_unexpectedly`
- **When empty:** The tenant sent nothing, OR telemetry stopped arriving. These are different and this panel cannot tell them apart — check the platform status panel before concluding the tenant is idle.
- **Reading it:** A tenant at zero served while others are serving is an outage for that customer, and aggregate availability will not show it.

### Policy refusals, per tenant

- **Type:** timeseries · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `gateway.refused_by_policy`
- **When empty:** No policy refusals. This is normal and is NOT a fault indicator.
- **Reading it:** A rising rate for one tenant usually means a client change, not a platform change. These do not count against the gateway SLO.

### Certificate days remaining, per tenant

- **Type:** table · **Scope:** per tenant (never aggregated across tenants)
- **Metrics:** `certificate.days_remaining`
- **When empty:** No certificate is being reported for any tenant. That is a reporting failure, not an absence of certificates — every registered tenant has one.
- **Reading it:** Under 14 days is the action threshold. Expiry is the one outage with a known date, so this table should never surprise anyone.

---

*Generated from the live metric registry. Not hand-maintained.*
