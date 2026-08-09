# ADR-0009 — Configuration Precedence

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-005

---

## 1. Problem

Configuration is set at several scopes by two different owners across a sovereignty boundary. How do values resolve, and can a more specific scope override a broader one?

## 2. Context

- Configuration is split by ownership: DBiz declares entitlements, policy, gates and obligations; the customer declares adapters, credentials, environments and limits ([15](../architecture/15-configuration-model.md) §2).
- Gate thresholds and residency constraints are safety and compliance controls, not preferences.
- Support requires explaining *why* a run behaved as it did, which requires knowing which scope supplied each effective value.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Most specific always wins** | Conventional and simple. **Rejected**: a tenant could raise a platform safety limit by writing one line, making governance advisory. |
| **Broadest always wins** | Safe but useless — per-tenant and per-run configuration would be inert. |
| **Narrowing-only scope chain** | **Selected.** Specificity increases restriction; platform constraints are a genuine ceiling. |
| **Per-field override policy** | Maximum flexibility, but every field becomes a decision and the model cannot be reasoned about globally. |

## 4. Decision

Values resolve through a scope chain, most specific winning **within the bounds set by broader scopes**:

```
platform default → capability default → tenant → environment → run
```

- A more specific scope may only **narrow** a constraint, never widen it (R-15.10).
- Resolution is deterministic and **explainable**: for any effective value the system reports which scope supplied it (R-15.11).
- There is no ambient or implicit configuration; an unresolvable required field is an error, never a silent default (R-15.12).
- DBiz-owned values are not overridable by the Execution Plane, including by environment variable (R-15.8).

## 5. Consequences

**Positive.** Platform safety limits cannot be escaped by configuration; the model is one rule rather than per-field policy; provenance makes configuration debugging tractable instead of archaeological.

**Negative, accepted.** A legitimate need to *widen* a limit for one tenant requires changing the platform or capability default — deliberately friction-bearing, because widening a safety ceiling should be a decision, not a configuration edit.

**Prohibited.** Any override path that bypasses the chain, including environment-variable escapes for DBiz-owned values.

## 6. Migration strategy

None required — taken before implementation.

**Forward path.** Adding a scope would be a breaking change to resolution semantics and requires an ADR. Changing a platform default narrows or widens the ceiling for every tenant, so it requires impact analysis identifying tenants whose effective values would change. Because provenance is recorded, that analysis is a query rather than an investigation.

## 7. Version impact

No contract version change — configuration is not contract shape. Establishes the configuration schema requirement that every field declares its owner and scope (R-15.16). Adding a field is additive and non-breaking provided it declares owner, scope and a consuming component in the same change.

## 8. Affected components

[15](../architecture/15-configuration-model.md) §3 (owning document) · [21](../architecture/21-tenant-lifecycle.md) §5 (ownership split) · [18](../architecture/18-governance-model.md) (gate thresholds resolve through this chain) · [12](../architecture/12-capability-orchestration.md) stage 6 (guardrail limits) · both planes' configuration layers.
