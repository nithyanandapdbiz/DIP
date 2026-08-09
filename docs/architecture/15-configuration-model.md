# 15 — Configuration Model & Configuration Ownership

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.5
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 7 and 9
**Resolves:** AD-005

**This document owns:** the configuration schema model, precedence, the ownership split, and declared-versus-consumed enforcement.
**It does not own:** tenant lifecycle ([21](21-tenant-lifecycle.md)), retention values ([06](06-data-sovereignty.md)), adapter interfaces ([14](14-tool-operating-model.md)), or deployment ([17](17-deployment-topology.md)).

---

## 1. The governing rule

**R-15.1** **Every declared configuration field SHALL be read by code.** A field with no reader fails the build.

**R-15.2** Adding a field SHALL require, **in the same change**: the field, the enforcing code, and a test proving enforcement.

**R-15.3** An unenforced field is **removed or implemented**. It SHALL NOT remain declared.

### Why this is the first rule and not a detail

The predecessor declared a retention limit that was customer-visible, schema-validated, API-served, and console-rendered — and read by no code. Its own archived analysis called it *configuration theatre*. Six of eight declared limit fields had no reader.

**Schema validation was the trap.** Validating the *shape* of a value creates every appearance of a live control: the API rejects a malformed value, the console renders it, an auditor sees it enforced. Nothing in that chain establishes that anything ever *reads* it.

> A declared control that does not execute is a **false representation, not a missing feature** — and it is worse than declaring nothing, because it manufactures compliance.

**R-15.4** The preferred implementation is **derivation**: the schema is generated from registered readers, so an unread field is *unrepresentable* rather than merely detectable (C-0.1). Where derivation is impractical, a build gate is the minimum.

## 2. Ownership split

**R-15.5** Configuration is partitioned by ownership, following the sovereignty boundary rather than convenience.

| Owned by DBiz — Intelligence Plane | Owned by the customer — Execution Plane |
|---|---|
| Entitled capabilities and their versions | Adapter selection and endpoints |
| Policy and guardrail definitions | Tool credentials (references) |
| Gate definitions and thresholds | AI provider selection and credentials |
| Supported contract versions | Environment and target configuration |
| Retention **obligations** | Retention **implementation** |
| Residency constraints | Concurrency and resource limits |
| Cost and token budgets | Execution scheduling |

**R-15.6** Neither side may write the other's column.

**R-15.7** A field SHALL have exactly one owner. A field appearing to need two owners is two fields.

**R-15.8** DBiz-owned configuration SHALL NOT be overridable by the Execution Plane, including by environment variable.

**R-15.8 closes an obvious bypass.** If a gate threshold could be overridden locally, governance would be advisory — and the override would be discovered only when a customer's certification was questioned.

## 3. Precedence — AD-005 resolved

**R-15.9** Values resolve through a **scope chain**, most specific winning:

```
platform default → capability default → tenant → environment → run
```

**R-15.10** A more specific scope may only **narrow** a constraint, never widen it. A tenant SHALL NOT raise a limit the platform set.

**R-15.11** Resolution SHALL be **deterministic and explainable**: for any effective value, the system SHALL report which scope supplied it.

**R-15.12** There SHALL be no ambient or implicit configuration. An unresolvable required field is an error, never a silent default.

**R-15.10 is what makes the chain safe.** A precedence model where the most specific scope simply wins lets a tenant override a platform safety limit by writing one line. **Narrowing-only** means specificity increases restriction, so the platform's constraints are a genuine ceiling.

**R-15.11 matters operationally.** When a customer asks why a run behaved as it did, "the effective timeout was 30s, from the environment scope" is an answer. Without provenance, configuration debugging becomes archaeology.

## 4. Schema and validation

**R-15.13** Configuration SHALL be schema-defined, validated at load, and **fail closed**.

**R-15.14** Validation failure SHALL prevent startup. A process SHALL NOT run with invalid configuration.

**R-15.15** Startup validation SHALL be **unconditional**. No environment, build flag, or image default may disable it (C-0.5).

**R-15.16** Every field SHALL declare: type, constraints, owner, scope, default (or that it is required), and its **consuming component**.

**R-15.15 records a specific failure.** The predecessor shipped startup validation **disabled by image default**, which meant the control ran in no deployed container. A control that is off by default in the artefact that reaches production has not been weakened — it has been removed, while remaining on the inventory.

## 5. Configuration is not code

**R-15.17** Configuration SHALL NOT express control flow, contain executable expressions, or select between architectural paths.

**R-15.18** A feature flag may protect a **rollback** path from the conformant default. It SHALL NEVER protect the conformant path from a non-conformant default (R-4.5, D-011).

**R-15.19** Where two paths exist, the non-conformant one SHALL carry a dated removal schedule enforced by a gate.

**R-15.18 is the predecessor's single most consequential contradiction, stated as a rule.** Its conformant orchestration path was fully built and working, and opt-in behind a flag — so every deployment ran the other one. **Defaults are architecture.** A flag does not make a path optional; it makes the default the real architecture and the alternative a hope.

## 6. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-15.1** | Every declared field has a consuming code reader | Declared-versus-consumed gate — build-failing |
| **C-15.2** | Adding a field without enforcing code fails the build | Negative test: field added, no reader |
| **C-15.3** | Every field declares owner, scope and consuming component | Schema completeness gate |
| **C-15.4** | Neither plane can write the other's column | Ownership enforcement test, both directions |
| **C-15.5** | DBiz-owned values cannot be overridden locally, including by environment variable | Override negative test |
| **C-15.6** | A more specific scope cannot widen a constraint | Widening negative test |
| **C-15.7** | Effective values report their supplying scope | Provenance test |
| **C-15.8** | Invalid configuration prevents startup | Invalid-config boot test |
| **C-15.9** | Startup validation cannot be disabled by any environment, flag or image default | Conditional scan; container boot test |
| **C-15.10** | No configuration field expresses control flow or selects an architectural path | Schema and consumer audit |
| **C-15.11** | No flag selects between orchestration paths | Flag inventory gate |
| **C-15.12** | Every retention field is read and enforced | Cross-check against [06](06-data-sovereignty.md) C-06.7 |
| **C-15.13** | No configuration key is tool-named or provider-named | Key-naming gate |

**C-15.1 is the single highest-leverage check in the platform.** It dissolves an entire defect class — retention limits, access roles, capability tiers, feature entitlements — every instance of which, in the predecessor, took the same form: declared, validated, presented, and read by nothing.

## 7. Open items

| # | Item | Target |
|---|---|---|
| **AD-031** | Configuration change audit: whether every effective-value change is recorded as evidence | P2 |

**AD-031 bears on certification defensibility.** If a gate threshold changed between two runs, a customer comparing their outcomes needs to see that. Without an audit trail on effective values, configuration becomes an unrecorded input to a certified decision — which is exactly the kind of gap an auditor finds.
