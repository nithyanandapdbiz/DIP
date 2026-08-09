# ADR-0010 — Tenant Storage Layout

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-011

---

## 1. Problem

Tenant isolation must be physical rather than filtered in application code ([07](../architecture/07-tenant-isolation.md)). What concrete layout delivers that, and permits retention and offboarding purge at hundreds of customers?

## 2. Context

- A tenant identifier filtered in application code **fails open**; a physical path **fails closed** (R-07.1).
- Retention is enforced per store on a schedule, and purge must be provable ([ADR-0006](ADR-0006-retention-model.md)).
- Offboarding requires purging a whole tenant ([21](../architecture/21-tenant-lifecycle.md) §7).
- The predecessor's evidence store was both immutable **and** unpartitioned, so repartitioning would have meant writing new files while retaining old ones indefinitely.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Tenant column, application-filtered** | Rejected — fails open on any read path that forgets the filter. |
| **Run-keyed, tenant as an attribute** | Rejected — a run identifier is unique but carries no isolation semantics (R-07.6); it does not prevent a listing from returning another tenant's runs. |
| **Tenant-leading hierarchical path** | **Selected.** |
| **Separate physical store per tenant** | Strongest isolation, but unmanageable provisioning and cost at hundreds of tenants; hierarchical partitioning achieves fail-closed behaviour without it. |

## 4. Decision

```
tenant / capability / run / artefact
```

- Every location is produced by the **single validated path constructor** (R-07.3, R-17.18).
- The constructor requires a tenant identifier and rejects absent, malformed, traversing, absolute, and unregistered identifiers (R-07.4).
- The layout permits purge at **tenant, capability and run** level **without scanning unrelated data** (R-17.19).
- No store constructs its own path (R-07.2).

**Tenant leads because purge scope follows path prefix.** Any other ordering makes tenant-level purge a scan, which at hundreds of customers is expensive enough that it eventually will not be run — and an unenforced retention obligation is the predecessor's characteristic failure.

## 5. Consequences

**Positive.** Omitting tenant scope yields no path and therefore no data; offboarding is a prefix operation; retention purge is scoped and cheap; the layout is uniform across both planes and every store.

**Negative, accepted.** Cross-tenant platform analytics become deliberately awkward — which is intended, and is presumed prohibited until AD-020 rules otherwise. Capability-level reorganisation would require a path migration, accepted because capability identity is stable by construction ([11](../architecture/11-capability-model.md)).

## 6. Migration strategy

None required — taken before the first write, which is the only cheap moment.

**Forward path.** Because the layout is produced by one constructor, a future layout change is a change to one module plus a data migration. **Constraint:** any change SHALL preserve the tenant-leading prefix, since every isolation and purge property depends on it. A change altering the prefix would require re-writing every artefact and is prohibited absent an ADR with a full migration plan.

## 7. Version impact

No contract version change — storage layout is not contract shape. Evidence *references* crossing the boundary are opaque identifiers, so consumers are unaffected by layout. That opacity is deliberate: it is what allows the layout to evolve without a contract change.

## 8. Affected components

[07](../architecture/07-tenant-isolation.md) §3 (owning document for the constructor) · [17](../architecture/17-deployment-topology.md) §4 (owning document for the layout) · [06](../architecture/06-data-sovereignty.md) (purge obligation) · [21](../architecture/21-tenant-lifecycle.md) §7 (offboarding) · every store in both planes.
