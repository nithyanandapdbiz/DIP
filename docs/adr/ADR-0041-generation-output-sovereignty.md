# ADR-0041 — Generation Output Sovereignty: the Intelligence Plane produces solution artifacts but never persists customer or Execution-Plane repositories inside itself

**Status:** **PROPOSED** — 2026-07-28. Nothing lands on disk (no default changed, no directory removed, no file deleted) until this ADR is moved from PROPOSED to ACCEPTED; on acceptance §6 executes gate-first (D-012).
**Date:** 2026-07-28
**History:** PROPOSED 2026-07-28 — raised from a customer "Constitution V2 · RULE 2" directive that generation must occur outside the Intelligence Plane at a configurable location, reconciled (CHARTER §3 — a prompt that conflicts with, or extends, the repository is resolved through the repository's own instruments, not on the prompt) to a governed additive amendment.
**Raised by:** customer directive — the Intelligence Plane shall never generate or own customer/Execution-Plane repositories inside itself; the platform *produces* solution artifacts but never *stores* them; output location must be configurable and default outside the IP tree.
**Builds on:** [ADR-0034](ADR-0034-tenant-onboarding-engine-refounding.md) (the onboarding/solution-generation engine this governs), [ADR-0035](ADR-0035-execution-plane-operational-portal.md) (the per-tenant EP scaffold that is generated), [06 — Data Sovereignty](../architecture/06-data-sovereignty.md), [19 — Repository Ownership](../architecture/19-repository-ownership.md).
**Explicitly does NOT amend (constitutional — preserved):** R-11.4 (six capabilities), R-12.18 (one orchestration lifecycle), INV-1 / INV-2 / INV-3 (sovereignty — customer source, credentials and evidence never leave the Execution Plane), the frozen cross-plane execution-package / evidence contracts, and the six canonical tenant states (R-21.5). This ADR governs *where the generator writes its output*, nothing else.

---

## 1. Problem

The Intelligence Plane's solution-generation path materialises a per-tenant **Execution-Plane scaffold** (a deployable EP repository: container definition, EP configuration, registration bootstrap, operational portal, EP documentation). Today that output is written **inside the Intelligence-Plane working tree** at `generated/<slug>/`. The customer directs that this must never happen: the platform may *produce* solution artifacts but must never *own or persist* a customer/EP repository inside itself, and the output location must be configurable and default outside the IP.

The platform's own stated posture already agrees in spirit — the generated scaffold's README declares *"This repository … is yours. The Intelligence Plane stores none of them,"* and [06 — Data Sovereignty](../architecture/06-data-sovereignty.md) makes customer credentials ephemeral-in-IP — yet **no architecture rule governs the generation output *location***, and the implementation default contradicts the principle by writing the EP repository into the IP tree. This ADR closes that gap by making output-sovereignty an explicit, enforced law and aligning the default with it.

## 2. Context

**Verified against disk (CHARTER §3).**

- **The generation engine is already output-location-agnostic by design.** `packages/tenant-onboarding-engine/src/engine/solution-export.ts` writes via an injected `outputDir` parameter (`writeSolutionFiles(outputDir, slug, files)`, `generateTenantSolution(env, { outputDir })`); `src/engine/api.ts` threads `solutionOutputDir` as a dependency. The engine names no fixed location — the location is a **wiring decision**, not an engine constraint.
- **Only the entrypoint defaults bind it inside the IP.** `run-server.mjs:113` sets `const solutionOutputDir = ${ROOT}/generated`; `src/server/index.ts:48` sets `const generatedDir = join(STATE_DIR, 'generated')`. These two defaults are the entire violation surface.
- **What is written is an EP scaffold, not customer test assets.** `generated/<slug>/` contains a container definition, `config/*.json`, an operational-portal server, a registration bootstrap and EP docs. It contains **no** customer feature files, page objects, locators, business logic, navigation, test data, screenshots, videos, reports or evidence (`tests/` and `testdata/` are `.gitkeep` placeholders). It carries **no secret values** — `config/identity.json` and `config/security.json` are `<FILL: ref…>` reference placeholders annotated `REFERENCES ONLY — never store secret values (INV-2)`; `.env.example` is a template.
- **The output is not version-controlled.** `.gitignore` excludes `generated/` (classified there as *"file-backed runtime state … Production persists it"*). So the versioned Intelligence Plane is already clean of it; the concern is the **working-tree / runtime behaviour and the absence of a governing rule**, not tracked contamination.
- **No existing instrument governs output location.** [06 — Data Sovereignty](../architecture/06-data-sovereignty.md) governs customer *credentials/data*; [19 — Repository Ownership](../architecture/19-repository-ownership.md) governs cross-repository imports; [ADR-0034](ADR-0034-tenant-onboarding-engine-refounding.md) governs the engine's packaging. None states where generated solution repositories may be written. This is a genuine additive gap, not drift from an existing rule.

## 3. Alternatives

| Option | Disposition |
|---|---|
| **Leave the default at `generated/` inside the IP** | **Rejected** — contradicts the platform's own sovereignty posture and the customer directive; persists an EP-owned repository inside the platform, however transiently. |
| **Delete `generated/` and hardcode a different in-IP path** | **Rejected** — moves the problem without fixing it; still writes an EP repository inside the IP. |
| **Redesign the generation engine** | **Rejected as unnecessary** — the engine is already `outputDir`-parameterised (§2); redesign would be churn against working, conformant code (CHARTER §15). |
| **Make output location a first-class configuration input, default it *outside* the IP tree, forbid an in-IP default by an enforced gate, and remove the in-IP directory** | **Chosen.** Minimal, aligns the default with the stated principle, and makes the law machine-enforced. |

## 4. Decision

**Establish Generation Output Sovereignty as platform law (principle P-41), enforced by a governance gate.**

**P-41 — The Intelligence Plane produces solution artifacts but never persists a customer or Execution-Plane repository inside itself.** The generator's output location is a **required, configurable input**; its default resolves **outside the Intelligence-Plane repository root**; and no code path may default generation output to a location inside the IP tree. The IP emits; the target plane owns.

### 4.1 MUST hold (enforced by the gate)

| # | Invariant | Why |
|---|---|---|
| O1 | Generation output location is resolved from configuration (an environment/config input), never a hardcoded literal | config-driven, [15 — Configuration Model](../architecture/15-configuration-model.md) |
| O2 | The resolved default is outside the Intelligence-Plane repository root | P-41, sovereignty ([06](../architecture/06-data-sovereignty.md)/[19](../architecture/19-repository-ownership.md)) |
| O3 | No source or config path writes a generated solution repository to a location inside the IP tree | P-41 |
| O4 | The IP tree contains no persisted generated customer/EP repository directory (`generated/`, `output/`, `customers/`, `projects/` at the IP root) | P-41 |
| O5 | Generated artifacts contain references/placeholders only, never secret values (re-asserts, does not replace, INV-2) | INV-2, [08 — Security Model](../architecture/08-security-model.md) |

### 4.2 What this does not change

The generation engine's internals, the EP scaffold's shape ([ADR-0035](ADR-0035-execution-plane-operational-portal.md)), the cross-plane registration/trust flow ([ADR-0036](ADR-0036-execution-plane-registration-and-trust-establishment.md)), and the six-capability / one-lifecycle model are untouched. Only *where output is written* and *the rule forbidding an in-IP default* are added.

## 5. Consequences (stated honestly)

- **The fix is bounded, not a redesign.** Two entrypoint defaults change; the engine is already location-agnostic. This is the smallest change that makes the principle true and enforced.
- **A new enforced law narrows a previously-free choice.** After acceptance, any future code that defaults generation output inside the IP is a certification failure, not a warning — which is the point.
- **The versioned tree was already clean** (the directory is gitignored); the value is (a) aligning the *runtime default* with the stated sovereignty posture and (b) making the rule machine-checkable so it cannot silently regress.
- **Cloud Engineering inherits a cleaner contract.** The master repository handed over never materialises customer/EP repositories inside itself; output location is an explicit deployment input, not a buried default.
- **Housekeeping is separable.** Removing the stale demo output already present in the working tree (`generated/*` from local demo runs) is untracked-scratch cleanup, sequenced under §6 after the default is corrected — never a precondition and never a deletion of tracked source.

## 6. Migration strategy (executes only after this ADR is ACCEPTED)

1. **Accept this ADR** and index it in `program/DECISIONS.md`.
2. **Write the enforcement gate FIRST** (D-012, gate-first): `governance/verification/verify-generation-output-sovereignty.js` asserting O1–O5 as executable properties (no in-IP default literal in the generation entrypoints; the resolved default path is outside the IP root; the IP root holds no persisted generated-repository directory; generated fixtures carry no secret values), registered in `run-all.js` with a recorded fault proof (plant an in-IP default → RED). It lands **RED** until the default is corrected (P-002).
3. **Correct the two entrypoint defaults** — `packages/tenant-onboarding-engine/run-server.mjs` and `src/server/index.ts` — to resolve the output location from configuration (e.g. a `DBIZ_SOLUTION_OUTPUT_DIR` input) with a default that resolves **outside** the IP repository root. The engine (`solution-export.ts` / `api.ts`) is unchanged.
4. **Remove the in-IP `generated/` directory** and drop its `.gitignore` entry once no path can recreate it inside the tree; delete stale local demo output as untracked-scratch housekeeping.
5. **Re-cut governance** — `run-all.js`, the closure baseline; re-run the suite. Restore green by satisfying the gate, never by weakening it (P-002).
6. **Record** the change in `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, and log any residual in `program/TECHNICAL_DEBT.md`.

## 7. Version impact

**Additive.** This ADR adds principle P-41 and one governance gate; it amends [06 — Data Sovereignty](../architecture/06-data-sovereignty.md) and [19 — Repository Ownership](../architecture/19-repository-ownership.md) **additively** (a new output-location clause) and references [03 — Intelligence Plane Architecture](../architecture/03-intelligence-plane-architecture.md) and [15 — Configuration Model](../architecture/15-configuration-model.md) without rewriting them. It changes **no** cross-plane contract, **no** runtime schema, **no** capability count, **no** lifecycle, and **no** tenant state. Its only code impact, on acceptance, is two entrypoint default bindings and the removal of an untracked directory. Nothing lands on disk except as §6 executes in order.

## 8. Affected components

On acceptance, the affected components are:

- `packages/tenant-onboarding-engine/run-server.mjs`, `packages/tenant-onboarding-engine/src/server/index.ts` — the two entrypoint default bindings corrected to a configurable, outside-the-IP output location.
- `packages/tenant-onboarding-engine/src/engine/solution-export.ts`, `packages/tenant-onboarding-engine/src/engine/api.ts` — **referenced, not changed**; already `outputDir`-parameterised.
- `.gitignore` — the `generated/` entry removed once no path can write there; the `generated/` directory removed from the working tree.
- A new generation-output-sovereignty gate (O1–O5) + recorded fault proof added under `governance/verification/`; `run-all.js` gains its line; `governance/closure/baseline.json` re-cut.
- [06 — Data Sovereignty](../architecture/06-data-sovereignty.md), [19 — Repository Ownership](../architecture/19-repository-ownership.md) — amended additively (the output-location clause / P-41); [03 — Intelligence Plane Architecture](../architecture/03-intelligence-plane-architecture.md), [15 — Configuration Model](../architecture/15-configuration-model.md) — referenced, not amended.
- [ADR-0034](ADR-0034-tenant-onboarding-engine-refounding.md), [ADR-0035](ADR-0035-execution-plane-operational-portal.md) — referenced; the engine and EP scaffold they govern are unchanged in shape.
- `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md`, `program/DECISIONS.md`, `program/TECHNICAL_DEBT.md` — updated to record this decision.

---

**Gate:** No default is changed, no directory is removed, and no file is deleted until this ADR is moved from PROPOSED to ACCEPTED. On acceptance, §6 executes in order, gate-first (D-012): the sovereignty gate lands RED, the default is corrected to satisfy it, and green is restored only by satisfying the gate (P-002).
