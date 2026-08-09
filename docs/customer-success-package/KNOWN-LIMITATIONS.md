# Known limitations

**Generated from the platform's own unmeasured properties.** Nothing here is
editorial. A property appears because a validation run did not measure it, and it
disappears when one does.

## Not measured

| # | Property | Blocker |
|---|---|---|
| **E-2** | Execution Plane generated AND DEPLOYED to a customer tenancy | Docker unavailable in this environment — generation is proven (E-1, E-3); deployment is not, and is not claimed |

**`NOT MEASURED` is not a soft pass.** These are not claimed, and they do not
contribute to any readiness figure you are shown. If a capability you need is
listed here, treat it as absent.

## Targets

Every declared supported target validated.

## Deliberate limits

These are not gaps and will not close:

| Limit | Why |
|---|---|
| No inbound connectivity into your tenancy | The boundary the platform exists to hold. |
| Platform stores no source, data, media or secrets | Same. |
| Unsupported technology combinations are refused | A profile that parses is not a profile that can be built. |
| Registration credentials are single-use | A reusable credential is an API key with a different name. |

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
