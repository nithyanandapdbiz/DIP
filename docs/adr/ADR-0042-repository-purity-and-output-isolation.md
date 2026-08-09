# ADR-0042 — Repository Purity & Output Isolation: the versioned Intelligence Plane contains only platform-owned assets, and all output lives outside source

**Status:** **PROPOSED** — 2026-07-28. Nothing lands on disk (no gate registered, no file moved or removed) until this ADR is moved from PROPOSED to ACCEPTED; on acceptance §6 executes gate-first (D-012).
**Date:** 2026-07-28
**History:** PROPOSED 2026-07-28 — raised from a customer "Constitution V2" directive (INV-04 Repository Purity, INV-14 Cloud Readiness "zero cleanup", INV-15 Repository Output Isolation), reconciled (CHARTER §3) into one coherent additive law with an executable positive-allowlist gate, rather than three overlapping documents.
**Raised by:** customer directive — the versioned repository must contain only platform-owned assets; build / generated / temporary / runtime output must never live inside tracked source; Cloud Engineering must be able to clone-build-deploy with zero manual cleanup. The objective stated by the customer is to make the violation *impossible to merge*, not merely detectable.
**Builds on:** [ADR-0041](ADR-0041-generation-output-sovereignty.md) (generation output specifically), [19 — Repository Ownership](../architecture/19-repository-ownership.md), [16 — Runtime Model](../architecture/16-runtime-model.md), [17 — Deployment Topology](../architecture/17-deployment-topology.md).
**Explicitly does NOT amend (constitutional — preserved):** R-11.4 (six capabilities), R-12.18 (one lifecycle), INV-1/2/3 (sovereignty), the frozen cross-plane contracts, and the six canonical tenant states (R-21.5). This ADR governs *what may exist in tracked source and where output goes*, nothing else.

---

## 1. Problem

The customer directs that the repository, as the permanent master handed to Cloud Engineering, contain **only platform-owned assets**, with every output class (build artefacts, generated solution repositories, temporary files, runtime state, downloads) living **outside tracked source** — so deployment requires zero cleanup and a contaminating file cannot be merged. Today the boundary is real but **enforced by `.gitignore` convention plus a descriptive fitness test**, not by a positive-allowlist gate that fails CI when an unexpected top-level entry or an output-class directory appears in tracked source. Convention is detectable, not impossible: a new `output/`, a committed `dist/`, a stray generated repository, or an undeclared top-level folder could be merged and only noticed later. This ADR closes that by making repository purity a **positive, enforced invariant**.

## 2. Context

**Verified against disk (CHARTER §3).**

- **The tracked tree is already substantially pure.** Output classes are gitignored: `.gitignore` excludes `generated/` (ADR-0041), `node_modules/`, build `dist/`, and file-backed runtime state (`registration/`, classified there as *"file-backed runtime state … Production persists it"*). The tracked top level is platform source (`packages/`), `docs/`, `governance/`, `program/`, `deploy/`, the tenant-configuration SSOT (`tenants/<slug>/tenant.json`, ADR-0032 — platform-owned config with opaque identity R-21.3), and root build/config files.
- **A fitness gate already asserts related properties** — [verify-architecture-fitness.js](../../governance/verification/verify-architecture-fitness.js) checks that *the Intelligence Plane declares the customer assets it will never store*, that *generated output is free of secret material*, and that *no architecture document reaches the other plane by filesystem path*. What it does **not** do is enforce a **positive allowlist** of permitted tracked top-level entries, nor fail when an output-class directory is committed.
- **The gap is therefore additive and small:** one gate that (a) admits only an explicit allowlist of tracked top-level entries, (b) fails when any output-class directory (`generated/`, `output/`, `customer/`, `customers/`, `temp/`, `tmp/`, `downloads/`, a committed `dist/`) appears in tracked source, and (c) confirms the ignore rules that keep output outside source are present. No source is restructured — the tree already conforms; the gate makes conformance permanent and un-mergeable-past.

## 3. Alternatives

| Option | Disposition |
|---|---|
| **Three separate ADRs (purity / cloud-zero-cleanup / output-isolation)** | **Rejected** — they are one property viewed three ways; three documents would fragment one invariant across three sources of truth (CHARTER §4). Zero-cleanup is a *consequence* of output isolation, not an independent law. |
| **Leave enforcement to `.gitignore` + reviewer discipline** | **Rejected** — the customer's explicit goal is to make the violation impossible to merge; convention is detectable, not impossible (the exact CHARTER §4 failure mode this programme prevents). |
| **A positive-allowlist repository-purity gate (INV-04 + INV-15) with zero-cleanup as its corollary, referencing ADR-0041 for the generation-specific case** | **Chosen.** One law, one gate, additive, CI-enforced. |

## 4. Decision

**Establish Repository Purity & Output Isolation as platform law (principle P-42), enforced by a positive-allowlist gate.**

**P-42 — The versioned Intelligence Plane contains only platform-owned assets; every output class lives outside tracked source.** Tracked top-level entries are admitted by an explicit allowlist; no output-class directory may exist in tracked source; all build / generated / temporary / runtime / download output is produced outside the repository (generation output per [ADR-0041](ADR-0041-generation-output-sovereignty.md)). A clone of tracked source is deployable with zero cleanup because there is nothing non-platform to remove.

### 4.1 MUST hold (enforced by the gate)

| # | Invariant | Why |
|---|---|---|
| R1 | Every tracked top-level entry is on the platform allowlist; an unrecognised top-level entry fails the gate | INV-04 repository purity |
| R2 | No output-class directory (`generated/`, `output/`, `customer(s)/`, `temp/`, `tmp/`, `downloads/`, committed `dist/`) exists in tracked source | INV-15 output isolation, [ADR-0041](ADR-0041-generation-output-sovereignty.md) |
| R3 | The ignore rules that keep output classes out of tracked source are present and cover each output class | INV-15, keeps R2 true by construction |
| R4 | A clone of tracked source requires no file removal before build/deploy — zero-cleanup deployability is the corollary of R1–R3 | INV-14 cloud readiness |
| R5 | Tracked platform config carries references/identifiers only, never customer payload or secret values (re-asserts, does not replace, INV-2) | INV-2, composes with the fitness gate |

### 4.2 What this does not change

No source is moved or deleted (the tree already conforms). The allowlist is a record of what already exists and is platform-owned; the six-capability / one-lifecycle model, the cross-plane contracts and the tenant-configuration SSOT ([ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md)) are untouched. Cloud-readiness *certification* (deployment probe E-2, production/operational readiness) remains owned by its existing gates; this ADR supplies only the purity precondition.

## 5. Consequences (stated honestly)

- **Enforcement moves from convention to gate.** After acceptance, committing an output-class directory or an undeclared top-level entry fails CI — the customer's "impossible to merge, not merely detectable" standard, delivered for this invariant.
- **The allowlist becomes a maintained artefact.** A legitimately-new top-level platform folder must be added to the allowlist in the same change that introduces it — a deliberate, reviewable act, which is the point.
- **Zero-cleanup deployability is now asserted, not assumed.** R4 makes the Cloud-Engineering handover precondition an executed check rather than a hope.
- **No restructuring, no churn.** Because the tree already conforms, this is purely additive enforcement; nothing working is discarded (CHARTER §15).
- **This ADR is a precondition, not a certification.** It does not by itself make the platform cloud-*certified* — E-2 (container runtime) remains external and `NOT MEASURED`. It guarantees the repository is clean *to hand over*, not that the handover target runs.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

1. **Accept this ADR** and index it in `program/DECISIONS.md`.
2. **Write the enforcement gate FIRST** (D-012, gate-first): a new repository-purity gate under `governance/verification/` asserting R1–R5 (tracked-top-level allowlist; no output-class directory in tracked source; ignore rules present per output class; zero-cleanup corollary), registered in `run-all.js` with a recorded fault proof (commit a stray `output/` directory → RED). It lands green because the tree already conforms; the fault proof proves it bites.
3. **Record the allowlist** as data the gate reads (the current platform top-level set), so a new top-level entry is a deliberate allowlist edit.
4. **Re-cut governance** — `run-all.js`, the closure baseline; re-run the suite. Restore/keep green by satisfying the gate, never by weakening it (P-002).
5. **Record** in `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, and note any residual in `program/TECHNICAL_DEBT.md`.

## 7. Version impact

**Additive.** This ADR adds principle P-42 and one governance gate; it amends [19 — Repository Ownership](../architecture/19-repository-ownership.md) **additively** (a repository-purity/output-isolation clause) and references [16 — Runtime Model](../architecture/16-runtime-model.md) and [17 — Deployment Topology](../architecture/17-deployment-topology.md) without rewriting them. It changes **no** cross-plane contract, **no** runtime schema, **no** capability count, **no** lifecycle, **no** tenant state, and moves/deletes **no** source. Its only impact, on acceptance, is a new gate + an allowlist data file. Nothing lands on disk except as §6 executes in order.

## 8. Affected components

On acceptance, the affected components are:

- A new repository-purity gate + recorded fault proof added under `governance/verification/`; `run-all.js` gains its line; `governance/closure/baseline.json` re-cut.
- `.gitignore` — referenced (its output-class ignore rules are the substrate R3 checks); extended only if an output class is found uncovered.
- `governance/verification/verify-architecture-fitness.js` — **referenced, not changed**; the positive-allowlist gate composes with its existing sovereignty/secret assertions rather than duplicating them.
- [19 — Repository Ownership](../architecture/19-repository-ownership.md) — amended additively (the P-42 clause); [16 — Runtime Model](../architecture/16-runtime-model.md), [17 — Deployment Topology](../architecture/17-deployment-topology.md) — referenced, not amended.
- [ADR-0041](ADR-0041-generation-output-sovereignty.md) — referenced; the generation-output case is governed there, purity generalises it to all output classes; [ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md) — referenced (the `tenants/` SSOT is an allowlisted platform-owned entry).
- `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, `program/DECISIONS.md`, `program/TECHNICAL_DEBT.md` — updated to record this decision.

---

**Gate:** No gate is registered, no file is moved, and no allowlist is enforced until this ADR is moved from PROPOSED to ACCEPTED. On acceptance, §6 executes in order, gate-first (D-012): the repository-purity gate is added with its fault proof, and green is kept only by satisfying it (P-002).
