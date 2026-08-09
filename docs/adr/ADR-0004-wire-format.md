# ADR-0004 — Cross-Plane Wire Format

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-003
**Retrospective:** decision taken in M1.2; regularised under D-001

---

## 1. Problem

The execution package and evidence contracts cross a sovereignty boundary between two independently-owned deployables. What serialisation, validation, canonicalisation and integrity mechanism do they use?

## 2. Context

- The package instructs a customer's infrastructure to act on the customer's own systems.
- Evidence and decisions must remain auditable for **seven years** ([06](../architecture/06-data-sovereignty.md) §4) — longer than any toolchain generation.
- Content addressing requires a **deterministic canonical form** ([10](../architecture/10-evidence-flow-model.md) §4).
- Packages are authored **once per run**, not at high frequency — so serialisation efficiency is a weak criterion.
- Both planes are TypeScript ([ADR-0001](ADR-0001-platform-language-and-runtime.md)), but the format must not assume that permanently.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **JSON + JSON Schema** | Human-readable without tooling; schema is data, so it validates identically in both planes; universally supported; readable in a decade without the original toolchain. Larger payloads. |
| **Protocol Buffers** | Compact and fast; strong schema evolution. **Requires code generation per language, and inspection requires tooling plus the current schema.** |
| **CBOR** | Compact, canonical form standardised. Binary, so the same inspection objection applies. |
| **MessagePack** | Compact. No standard canonical form — disqualifying for content addressing. |

## 4. Decision

**JSON**, validated by **JSON Schema**, canonicalised for hashing by **RFC 8785 (JCS)**, with **detached signatures** over the canonical form.

**The deciding factor is auditability under sovereignty.** A customer's security team must be able to read exactly what DBiz instructed their tenancy to do, **using no DBiz tooling**. That is a procurement and trust requirement, not a developer preference — and it outweighs the efficiency gap on an artefact authored once per run.

Two supporting reasons: evidence outliving its toolchain is far safer in a self-describing text format; and JSON Schema is *data*, so one artefact validates in both planes without code generation, satisfying R-20.3 directly.

**Detached** signatures are specified so verification does not require re-serialising the payload, and so signing does not perturb the canonical bytes the content hash is computed over.

## 5. Consequences

**Positive.** Customer-inspectable packages; one schema artefact for both planes; long-term evidence readability; no code-generation step; language-neutral, so a future non-TypeScript consumer is not excluded.

**Negative, accepted.** Larger payloads and slower parsing than binary formats — acceptable at one package per run, and explicitly *not* acceptable to trade auditability for. JSON's lack of native binary and date types requires encoding conventions fixed by schema.

**Rejected trade.** Efficiency was available and was declined. Recorded so it is not revisited as though it were an oversight.

## 6. Migration strategy

None required — taken before implementation.

**Forward path.** Every contract instance carries its contract version (R-20.5), and every hashed record carries its algorithm version (R-20.19). A future format change would be a **major contract version**, with both formats supported concurrently across the declared support window (R-20.24). Because the Intelligence Plane must support every version still deployed, a format migration proceeds tenant by tenant rather than as a flag day.

**Constraint on any future change.** Canonicalisation determines evidence identity. A format change that alters canonical bytes invalidates existing hashes, so it requires re-hashing under a new algorithm version rather than reinterpretation.

## 7. Version impact

Establishes contract v1. Sets the compatibility rules of [20](../architecture/20-cross-plane-contracts.md) §6: additive is minor; removal, semantic change, or constraint tightening is major. **A field's meaning SHALL NOT change within a major version** — the most dangerous available change class, because both sides validate and the disagreement surfaces only as wrong behaviour.

## 8. Affected components

[20](../architecture/20-cross-plane-contracts.md) §5 (owning document) · [10](../architecture/10-evidence-flow-model.md) (canonicalisation feeds content addressing) · [08](../architecture/08-security-model.md) §5 (detached signing) · [05](../architecture/05-cross-plane-communication.md) (transport payloads) · shared contract packages · both planes' validation layers.
