# Programme-Level Evidence Collector — Design

**Status:** DESIGN · not implemented · **Date:** 2026-07-22
**Feeds:** document 24 — Platform Intelligence Model (scheduled, not yet authored)
**Governed by:** [ADR-0018](../docs/adr/ADR-0018-platform-services-and-programme-instruments.md) (platform service, not a capability) · [ADR-0020](../docs/adr/ADR-0020-continuous-verification.md) (provenance, freshness)

**This is a design note, not an implementation.** It is recorded because the need is real and the constraint is sharp, and because deciding it under delivery pressure would produce the wrong answer.

---

## 1. The problem

Five GCI inputs currently report `NOT MEASURED`, and one of them is structural rather than merely unbuilt:

> **Independent enforcement across the Intelligence Plane and the Execution Plane.**

Both repositories now run Rule 12 gates. Neither can *report* that fact about the other, because **neither plane may read the other** — by filesystem path, by import, or by any direct inspection. That prohibition is not incidental; it is the same boundary that makes the sovereign split real, and a measurement tool is not exempt from it.

The naive fix — have the Intelligence Plane's scorecard read `../CarlisleHomes_ExecutionPlane/` — would be a sovereignty violation committed by the very system that exists to detect sovereignty violations.

## 2. What must remain true

| Constraint | Source |
|---|---|
| Neither repository inspects the other's internal state | [19](../docs/architecture/19-repository-ownership.md) X-19.1, C-19.1 |
| No change spans both planes in one step | Two repositories, two histories |
| The Execution Plane runs in a **customer tenancy** — DBiz cannot reach into it | INV-3, R-17.2 |
| Evidence carries provenance and expires | R-14.4, R-14.5 |
| A collector must not become a third deployable | R-1.1 |

**The third row is the one that rules out most designs.** A collector that polls the Execution Plane requires an inbound path into customer infrastructure, which INV-3 forbids outright. Any workable design must be **push-based from the plane that owns the evidence**, or must operate on artefacts already published outside both tenancies.

## 3. Design

**Each plane publishes an evidence manifest. The collector aggregates manifests. It never reads a repository.**

```
Intelligence Plane            Execution Plane
  runs its own gates            runs its own gates
  emits manifest                emits manifest
        │                             │
        └──────────► collector ◄──────┘
                  aggregates published
                  manifests only
```

**D-1 — Publication, not inspection.** Each repository emits a signed evidence manifest as a **build artefact** of its own CI. The collector consumes manifests. It has no repository access, no filesystem path into either plane, and no credentials for either.

**D-2 — The manifest is a contract.** It carries exactly the provenance R-14.4 requires — evidence identifier, generator, generator version, repository, branch, commit, ADR and rule references, timestamp, content hash, verification and certification status — plus the gate results and their proof states. **Nothing else.** It publishes conformance facts, never source, configuration, customer data, or anything classified above C5.

**D-3 — Push, never pull.** Each plane publishes on its own schedule. The collector never initiates contact with a plane, which preserves INV-3 at the measurement layer exactly as it is preserved at the runtime layer.

**D-4 — Absence is reported, never inferred.** A plane that has not published is `NOT MEASURED`, not `assumed passing` and not `assumed failing`. A stale manifest decays exactly as a stale proof does (R-14.5) and reports `NOT CURRENT` past its window.

**D-5 — The collector is a platform service, not a capability** ([ADR-0018](../docs/adr/ADR-0018-platform-services-and-programme-instruments.md)). It performs no quality engineering against a customer system and yields no certified verdict about customer software, so it does not traverse the twelve-stage lifecycle and R-11.4 is untouched.

**D-6 — The collector manufactures nothing.** It aggregates published evidence and computes derived figures from it. It never estimates, interpolates, or infers a value a plane did not publish (R-13.6).

## 4. What this unlocks

| Currently `NOT MEASURED` | Becomes measurable |
|---|---|
| Independent enforcement across both planes | Both manifests carry gate results; agreement is computable |
| End-to-end compatibility | The Execution Plane publishes the contract version it was built against |
| Platform-wide readiness | ERI computed across both planes rather than one |
| Programme-wide governance confidence | GCI over the union of both proof registries |

## 5. What it deliberately does not do

| Not | Because |
|---|---|
| Read either repository | Sovereignty; the prohibition has no measurement exemption |
| Reach into a customer tenancy | INV-3 — there is no inbound path, for any purpose |
| Aggregate customer data | Manifests carry conformance facts only |
| Become a third deployable | R-1.1 — it is a build-time aggregation step, not a runtime |
| Assume a silent plane is healthy | D-4; silence is not success |

## 6. Open questions

Recorded, not guessed (R-11.5).

| # | Question | Why it matters |
|---|---|---|
| **Q-C1** | Where do manifests land, given the Execution Plane runs in a customer tenancy? | A customer may decline to publish anything to DBiz at all — which is their right, and the model must degrade to `NOT MEASURED` rather than break |
| **Q-C2** | Are manifests signed by the publishing plane? | Without signing, the collector cannot distinguish a genuine manifest from a fabricated one — the RR-1 problem in a new place |
| **Q-C3** | What is the manifest's expiry window? | Too short and honest customers look non-compliant; too long and a dead plane looks alive |
| **Q-C4** | Does a customer-declined publication differ from a failed one? | It must. Declining is a sovereignty right; failing is a defect. Conflating them would penalise the exercise of sovereignty |

**Q-C4 is the one to get right.** A collector that scores a customer lower for exercising a sovereignty right the platform explicitly grants them would make the measurement actively hostile to the product's central promise.

## 7. Status

**Design only.** Implementation requires document 24 to be authored and frozen first, per the build order — architecture precedes implementation, and there is currently no canonical document that owns platform intelligence.

Until then, cross-plane enforcement correctly reports **`NOT MEASURED`**.
