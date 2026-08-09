# ADR-0014 — PII Scrubbing and False-Negative Posture

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-023

---

## 1. Problem

Data leaving the customer tenancy is scrubbed of protected content ([09](../architecture/09-data-flow-model.md)). No detector is perfect. **What happens when the scrubber cannot determine whether a value contains protected data?**

## 2. Context

- Data crossing to the Intelligence Plane is minimised by allow-list and scrubbed on the write path (R-06.4).
- The system under test is an untrusted source that may return arbitrary content into Discovery, Evidence and AI context ([22](../architecture/22-security-threat-model.md) T7).
- Structure-based allow-listing catches known fields; it cannot catch protected data appearing *inside* a permitted free-text field.
- **Left unstated, the answer defaults to "transmit"** — because that is what every unhandled case does.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Transmit on uncertainty (fail-open)** | Maximises reasoning quality. **Rejected**: an unrecoverable sovereignty breach, discovered — if ever — long afterwards. |
| **Drop the field on uncertainty (fail-closed)** | **Selected.** Costs reasoning quality, which is recoverable. |
| **Refuse the whole request on any uncertainty** | Safest, but a single ambiguous field would block a run entirely, making the platform unusable against realistic data. |
| **Allow tenants to choose the posture** | Rejected — a customer cannot meaningfully consent to a risk whose realisation they will not observe, and a per-tenant posture makes the platform's sovereignty claim conditional. |

## 4. Decision

- Scrubbing is **allow-list on structure and detection-based on content** — both, not either (R-13.20).
- **On detection uncertainty, the field is dropped** (R-13.21).
- A dropped field is **recorded as dropped**, so reasoning knows information is absent rather than empty (R-13.22).
- Scrubbing failure on a **required** field causes the request to be **refused**, not transmitted unscrubbed (R-13.23).

**Fail-closed here costs reasoning quality; fail-open costs sovereignty. Only one of those is recoverable.** Degraded reasoning produces a less rich result that a later run can improve on. A leaked identifier cannot be unleaked, and the customer will not know it happened.

**Recording the drop matters as much as the drop.** An absent field and an empty field are identical to a consumer unless the difference is stated — the same distinction as an unrecorded capture failure (R-10.10) and a silently empty stage (R-12.12).

## 5. Consequences

**Positive.** Sovereignty holds even when detection is imperfect; reasoning can distinguish absent from empty and reason accordingly; the posture is uniform across tenants, so the platform's claim is unconditional.

**Negative, accepted.** Reasoning quality degrades on data with many ambiguous free-text fields, and an over-eager detector silently reduces enrichment quality. This is why drops are **recorded**: a rising drop rate is observable and tunable, rather than manifesting as unexplained result quality decline.

**Residual risk RR-4 remains open** in the threat model: false negatives are reduced, not eliminated. Recorded rather than claimed closed.

## 6. Migration strategy

None required — taken before implementation.

**Forward path.** Detector improvements change what is dropped, so a detector change alters the information reaching reasoning, and therefore potentially the richness — though never the *decision*, since decisions are deterministic over evidence rather than over enrichment (INV-4). This is the property that makes detector iteration safe: **tuning the scrubber cannot change a verdict.**

**Constraint.** No change may move the posture to fail-open for any field, tenant, or environment. Doing so would require an ADR amending this one, and would negate the guarantee for every tenant, not only the one requesting it.

## 7. Version impact

No contract version change. Contract v1 already carries per-field presence, so a dropped field is representable without a shape change — a consequence of minimisation having been allow-list based from the outset.

**Forward obligation.** Adding a field to the egress allow-list requires declaring its classification and its detection treatment in the same change.

## 8. Affected components

[13](../architecture/13-ai-operating-model.md) §5 (owning document) · [09](../architecture/09-data-flow-model.md) §2 (egress pipeline) · [06](../architecture/06-data-sovereignty.md) §2 (scrub-on-write condition) · [22](../architecture/22-security-threat-model.md) §6 (RR-4) · the Execution Plane egress pipeline.
