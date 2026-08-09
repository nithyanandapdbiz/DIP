# ADR-0006 — Retention Model

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-006, AD-017
**Retrospective:** decision taken in M1.3; regularised under D-001

---

## 1. Problem

How long does each class of data live, who declares it, who enforces it, and how is enforcement proven? AD-006 asked for retention per data class; AD-017 asked for the statutory horizon on decisions and audit records. They are one decision and are recorded as one.

## 2. Context

- Data spans a sovereignty boundary: customer data and evidence live in the customer's tenancy, decisions in DBiz's ([06](../architecture/06-data-sovereignty.md)).
- A certification must remain defensible for the life of the release it authorised — longer than the evidence it cites is likely to be kept.
- The predecessor declared a 90-day retention limit that was customer-visible, schema-validated, API-served, console-rendered, and **read by no code**. Its own analysis called it *configuration theatre*.
- It also used append-only immutability as justification for having no purge path at all.

## 3. Alternatives

| Question | Options | Selected |
|---|---|---|
| Who declares retention | Customer only · DBiz only · **split: DBiz declares obligation, customer implements** | Split — DBiz carries the compliance commitment; the data is in the customer's tenancy |
| C1 in Intelligence Plane | Short TTL · **ephemeral, never persisted** | Ephemeral — its presence is a processing necessity, not a storage decision |
| C3 in Intelligence Plane | Unbounded · tenant-configured uncapped · **tenant-configured, capped at 90 days** | Capped, so the plane cannot become a shadow data platform |
| Decisions and audit | 1 year · 3 years · **7 years** | 7 years — the statutory audit horizon in the platform's target markets |
| Enforcement | Operator-initiated · scheduled · **scheduled code, purge proven by test** | Proven — an unproven purge is indistinguishable from none |

## 4. Decision

| Data | Retention |
|---|---|
| C1 in Intelligence Plane | **Ephemeral** — request duration only, never persisted |
| C3 in Intelligence Plane | Tenant-configured, **maximum 90 days** |
| C2 anywhere in DBiz | **Not permitted** |
| Evidence (customer tenancy) | Tenant-configured, default 365 days, no platform maximum |
| Decisions and evidence hashes | **7 years** |
| Audit records | **7 years** |
| Tenant configuration | Life of tenant + 90 days |

Enforced by four standing rules:

- **Every store declares a retention period.** A store without one SHALL NOT be registered (R-06.9).
- **Every declared retention value is read by code.** A field with no reader fails the build (R-06.12).
- **Purge is code on a schedule**, never operator-initiated, and each store ships a test proving data is unreadable afterwards (R-06.13/14).
- **Immutability does not justify indefinite retention.** An append-only store still requires expiry and archival (R-06.11).

**The evidence/decision asymmetry is the model working as designed.** Evidence is purged on the customer's schedule; the decision citing it persists for seven years and **remains auditable**, because it retains the hash rather than the payload (R-10.19). The record states precisely what was judged without holding what was judged.

## 5. Consequences

**Positive.** Sovereignty and auditability hold simultaneously; DBiz cannot accumulate customer data; retention is provable rather than asserted; offboarding has a defined disposition for every class.

**Negative, accepted.** The 90-day C3 cap limits long-horizon trend reasoning — accepted deliberately, because an uncapped analytics store is how a quality platform becomes a data platform without anyone deciding to. Seven-year decision retention carries real storage cost, bounded by decisions being small and payload-free.

**Structural obligation.** A store base type that cannot be registered without a retention source, a purge implementation, and a passing purge test. This makes an unpurgeable store *unrepresentable* rather than merely non-conformant (C-0.1).

## 6. Migration strategy

None required — taken before any store exists.

**Forward path.** Retention periods are configuration, so **shortening** a period takes effect at the next scheduled purge with no migration. **Lengthening** cannot recover already-purged data, so an extension applies only to data still within its current window — this asymmetry SHALL be stated to customers rather than discovered by them.

**A change to a statutory period** (the 7-year values) requires an ADR and impact analysis, since it affects the defensibility of certifications already issued.

**Constraint on any future change.** Retention values SHALL NOT be lengthened to avoid implementing purge. That would be the predecessor's failure in a new form — a commitment adjusted to match what the code happens to do.

## 7. Version impact

No contract version change: retention is configuration, not contract shape.

The **configuration schema** gains retention fields per store class, each with a declared consuming component (R-15.16). As no configuration has been published, this is a baseline definition.

**Forward obligation.** Adding a store class adds a retention field and its enforcing code **in the same change** (R-15.2). A store class added without one fails the build.

## 8. Affected components

[06](../architecture/06-data-sovereignty.md) §4 (owning document) · [21](../architecture/21-tenant-lifecycle.md) §7 (offboarding disposition) · [10](../architecture/10-evidence-flow-model.md) §6 (decisions outliving evidence) · [15](../architecture/15-configuration-model.md) (declared-versus-consumed) · [17](../architecture/17-deployment-topology.md) §4 (layout must permit scoped purge) · every store in both planes.
