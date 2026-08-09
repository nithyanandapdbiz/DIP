# ADR-0035 — Execution-Plane Operational Portal & Local Execution API

**Status:** **ACCEPTED** — 2026-07-24 (customer sign-off: "proceed", with a confirming EP/IP architecture — single execution pipeline for CLI+UI, config service owning operational config only, `vault://` secret references, and an explicit IP↔EP data-security model). §6 migration authorised and executing, **gates first**.
**Date:** 2026-07-24
**Raised by:** customer directive to generate, per tenant solution, a branded operational console in the Execution Plane — configuration (no manual JSON), per-capability run, live monitoring, evidence, reports, logs, health — with UI and terminal sharing exactly one execution path
**Affects:** [04](../architecture/04-execution-plane-architecture.md), [16](../architecture/16-runtime-model.md), [17](../architecture/17-deployment-topology.md), `@dbiz/platform-core` (solution generation), the generated Execution-Plane solution template, `tenants/<slug>/tenant.json` (branding band), `governance/`, `program/`
**Builds on:** [ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md) (tenant.json SSOT) · [ADR-0033](ADR-0033-production-web-tier.md) (the IP onboarding web tier) · [ADR-0034](ADR-0034-tenant-onboarding-engine-refounding.md) (the two-package web split, and the PROPOSED→ACCEPTED gate precedent)
**Explicitly does NOT amend (constitutional — preserved and re-satisfied):** INV-2 / INV-3 / INV-4 / INV-7, the sequencer-decides-nothing rule (R-04.1), the single sequencing path (R-04.5), the twelve-stage lifecycle and its typestate enforcement ([12](../architecture/12-capability-orchestration.md)), stages 10–12 never in the EP (R-12.5 / C-12.10), the single cross-plane client and its one direction (R-05.1–R-05.4), the two-artefact topology (R-17.1), and the frozen six-capability model (R-11.4)

---

## 1. Problem

The customer directs that **every generated tenant solution ship a branded web portal** — the customer's operational console, running in their own tenancy:

```
Execution-Plane Portal
├── Dashboard        ├── Test Data      ├── Reports
├── Configuration    ├── Execution      ├── Logs
├── Capabilities     ├── Live Monitoring├── Health
├── Integrations     ├── Evidence       └── Settings
```

with three load-bearing requirements:

1. **Configuration without hand-edited JSON.** The customer edits base URL, authentication, browser selection, parallelism, timeouts, Jira/Azure DevOps/Zephyr, AI provider, environment and secrets through forms; on **Save** a **configuration service** writes `config/*.json` — the browser never edits a file directly.
2. **A per-capability Run button** that enters the same orchestration pipeline as a terminal invocation (`npm run functional`), producing evidence and a certification outcome. **UI and terminal SHALL share one execution path**; the only difference is the trigger.
3. **A live, Jenkins/BrowserStack-class monitoring view** — running/queued jobs, current step, elapsed time, evidence captured, screenshots, logs, console, network, failures, retries, certification progress.

Today the Execution Plane has **none** of this. It is config + a single outbound update agent (`bin/ep-update-agent.mjs`); [04](../architecture/04-execution-plane-architecture.md) §8 and the generated `docs/EP-RUNTIME-REQUIREMENTS.md` record that the execution runtime itself is **not yet emitted**. The only web surface in the platform is the IP-owned onboarding SPA (ADR-0033/0034), which is a **different surface for a different actor** (DBiz/onboarding, in the Intelligence Plane) and is not this.

Three parts of the literal directive collide with frozen invariants and would be absorbed silently if not recorded here.

## 2. Context — the three collisions and their resolutions

**Collision A — "an inbound web + Execution API inside the EP" vs. "the EP accepts no inbound / DBiz initiates nothing."**
INV-3, R-05.1, R-05.2, R-08.1, R-08.54 and R-17.3 are frequently paraphrased as "the EP is outbound-only." Read precisely, **every one of them prohibits an inbound path *from DBiz (the reasoning plane) into the customer tenancy*, and any requirement that the customer open a port *to DBiz*.** None governs the customer's own surfaces inside their own plane. Decisively, [04](../architecture/04-execution-plane-architecture.md) §2 already lists the EP's trigger as **"schedule · pipeline · API"** — a **local API trigger is part of the frozen EP design.** The resolution: the portal, the Execution API, the queue and the config service are **customer-local, in-tenancy surfaces**; the **single Cross-Plane Client remains the only egress to DBiz** (R-05.3/R-05.4); **no path from DBiz into the tenancy is created and no port is opened to DBiz** (INV-3 intact, R-17.3 intact).

**Collision B — "Run → … → Certification (in the EP)" vs. "the sequencer decides nothing / certification is never delegated."**
R-04.1, R-04.14, R-12.5 and C-12.10 forbid the EP from reflecting, certifying, or reporting a verdict. The resolution is the frozen twelve-stage lifecycle exactly: **Run** triggers the EP; the EP **requests a sealed execution package** from the IP via the Cross-Plane Client (stages 1, 4–7 are IP; packages are IP-authored, R-2.4); **"Verify Before Execute" is the sequencer validating that sealed package** — provenance, content hash, validity window, and the IP's proceed/refuse flag (R-04.2), a boolean the EP reads but never computes (R-04.64); the **Capability Engine runs stage 8** and captures **stage-9 Evidence, custodied in the EP** (R-04.10); **evidence references** cross to the IP (R-04.11); the IP renders **stages 10–12** and returns the certification, which the portal displays. The EP emits **no verdict of its own**, ever.

**Collision C — "a config service that writes `config/*.json` from the browser" vs. "one SSOT (ADR-0032) / no secret in a generated artefact (INV-2) / no second configuration authority."**
ADR-0032 fixes `tenants/<slug>/tenant.json` in the **Intelligence Plane** as the SSOT for **onboarding and entitlement** configuration, and INV-2 / R-03.32 forbid secret material in generated artefacts. The resolution is **two config bands with disjoint, non-overlapping ownership** (no value has two authorities):

| Band | Authoritative home | Flows | Examples |
|---|---|---|---|
| **Entitlement / onboarding** | IP `tenant.json` (ADR-0032) | IP → EP via generation + `ep-update-agent` | capability entitlement, tenant identity, certification posture |
| **EP-operational** | EP `config/*.json`, written by the config service | edited in-plane by the customer | base URL, browser selection, parallelism, timeouts, tool endpoints, environment, and **secret *references* to a customer-managed vault** |

Base URL and tool endpoints living EP-side is *sovereignty-positive* (data minimisation — the IP need not learn customer-internal URLs). **The config service SHALL store secrets as references to a customer-managed vault, never plaintext** — this is the exact anti-pattern of the live `AI_PROVIDER_KEY` / `DBIZ_EP_TOKEN` currently found in a committed `.env`, which this ADR's controls are designed to make structurally impossible.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Implement the directive literally** — an EP that opens an inbound path, edits files from the browser, and certifies locally | **Rejected.** Breaches INV-3 (inbound), R-04.1/R-04.14/C-12.10 (EP certification), and INV-2 (plaintext secrets, second config authority). Each breach would be silent without this record. |
| **Serve the portal from the Intelligence Plane** instead of the EP | **Rejected.** It would require the IP to reach into the tenancy to run and monitor executions — precisely the inbound dependency INV-3 forbids — and would move customer evidence/logs across the boundary against INV-1/INV-2. The operational console belongs where the data and the execution live: the EP. |
| **Extend the IP onboarding SPA (ADR-0033/0034) to also be the operational console** | **Rejected.** Different actor, different plane, different trust boundary; fusing them would put customer operational data in the IP-owned surface and blur the sovereign split. They are two surfaces by design. |
| **A branded EP-local portal + Execution API + config service, generated per tenant, terminating cross-plane in the single client and the existing twelve-stage lifecycle** | **Selected.** Customer-local by construction; one sequencing path for UI and terminal (R-04.5); certification stays in the IP; secrets stay as vault references; two disjoint config bands preserve the SSOT. |

## 4. Decision

**Authorize an Execution-Plane Operational Portal, a local Execution API, an execution queue, and a configuration service — generated per tenant into the Execution-Plane solution by `@dbiz/platform-core`, and served from within the customer tenancy — under the invariants below.** The portal is a **product surface, not a seventh capability** (R-11.4) and introduces **no** second orchestration model (R-12.18).

### 4.1 MUST preserve (re-satisfied by the build; enforced by re-cut gates)

| # | Invariant | Anchored in |
|---|---|---|
| P1 | **No inference in the EP.** The portal, API, queue and config service add no model-invocation code; the boot guard still refuses to start if inference capability is present | R-2.2, C-04.1/C-04.2 |
| P2 | **The sequencer decides nothing; exactly one sequencing path.** UI Run and terminal (`npm run <capability>`) converge on the same path; no imperative alternative | R-04.1, R-04.5 |
| P3 | **Dry-run and live differ only inside the adapter.** One code path through sequencer and engines | R-04.6, C-04.14 |
| P4 | **Stages 10–12 (Reflection, Certification, Reporting) never execute in the EP.** The EP requests sealed packages and returns evidence references; the IP certifies | R-04.1/R-04.14, R-12.5, C-12.10 |
| P5 | **One egress, one direction, no inbound from DBiz.** All cross-plane traffic passes through the single Cross-Plane Client; the portal opens no path to DBiz and requires no inbound port | R-05.1–R-05.4, INV-3, R-17.3 |
| P6 | **Assurance state is structural; no verdict in a degraded state.** The portal renders `CERTIFIED / DEGRADED / DEGRADED-UNCERTIFIED / HALTED` from the degradation matrix; it never fabricates a pass | R-05.9–R-05.12, R-12.17 |
| P7 | **Credentials and evidence custodied in the EP; nothing secret leaves or is generated.** The config service stores secret *references* to a customer vault, never plaintext; generated artefacts and outbound payloads contain no secret material | INV-2, R-04.7/R-04.10, R-03.32, R-17.8 |
| P8 | **Single tenancy; no multi-tenant construct** in the portal, API, queue or config service | R-04.20/R-04.21 |
| P9 | **The twelve-stage lifecycle and its typestate enforcement are unchanged.** The portal is a trigger and a view; it neither adds a stage nor constructs a stage result | R-12.1/R-12.8, R-12.18/R-12.19 |
| P10 | **Two config bands, disjoint ownership.** The EP config service owns only the EP-operational band; the IP `tenant.json` SSOT owns entitlement/onboarding; no value is authoritative in both | ADR-0032, §2 Collision C |

### 4.2 Rules

| # | Rule | Enforcement |
|---|---|---|
| **R-35.1** | The portal, Execution API, queue and config service SHALL be **customer-local**; none SHALL create an inbound path from DBiz or require a port opened to DBiz | egress-direction gate (C-05.2); single-client scan (C-05.1); no new outbound construction outside the client |
| **R-35.2** | UI Run and the generated CLI (`npm run <capability>` / `ep run <capability>`) SHALL enter the **same** sequencing path **via the Local Execution API** — the CLI calls the API, never an engine directly; no second path exists | single-path gate (C-04.6); trace test asserting both triggers reach one sequencer |
| **R-35.3** | The Execution API SHALL trigger a run by **requesting a sealed package** and letting the sequencer validate it; it SHALL NOT construct a stage result, verdict, or package | package-count assertion (C-12.13); verdict-site fitness test (C-04.3); construction-attempt negative test (C-12.3) |
| **R-35.4** | The config service SHALL **validate → persist → reload runtime** on every change, and SHALL store secrets only as **vault references** (`vault://…`), never plaintext | config-validation test; runtime-reload test; secret-scan gate over written `config/*.json` (C-04.8-style) |
| **R-35.5** | The config service SHALL write only the **EP-operational band**; entitlement config SHALL remain owned by the IP SSOT and arrive via `ep-update-agent` | band-ownership test proving no overlap; drift-reconciliation test |
| **R-35.6** | Monitoring, evidence, logs and certification-progress views SHALL render the **structural assurance state** and SHALL NOT display a verdict the EP computed | degraded-run assertion (C-05.7, C-12.11); no verdict-construction in EP source |
| **R-35.7** | Branding (company name, product name, logo, theme colours, favicon) SHALL be captured during onboarding into `tenant.json` and applied by the generator; an **AI-generated logo, if permitted, SHALL use an opaque provider handle and a deterministic monogram fallback**, and SHALL be non-blocking (INV-9, R-31.5) | branding-band schema test; AI-off determinism test; INV-9 vendor-name scan |
| **R-35.8** | The portal and API SHALL ship **inside the Execution-Plane image** (still two artefacts, R-17.1); the image SHALL contain no secret material and no cloud primitive above the adapter layer | image content scan (C-17.4); cloud-primitive source scan (C-17.7); image smoke test (C-17.3) |
| **R-35.9** | Every new runtime dependency (the portal stack, the API stack) SHALL be **pinned and SBOM-tracked** in the same change (D-014, R-33.3) | pinned versions; SBOM regeneration in the change; supply-chain gate |

### 4.3 Cross-boundary data-security model (governs every exchange)

The sovereign split is made explicit as an allow/deny list on each direction ([06](../architecture/06-data-sovereignty.md), [09](../architecture/09-data-flow-model.md)):

| Direction | Allowed | Never |
|---|---|---|
| **IP → EP** | generated deployment package, capability entitlements, non-secret configuration metadata, sealed execution packages, policy/certification decisions | customer data, evidence payloads, local secrets, runtime credentials |
| **EP → IP** | execution status, evidence **references** (or explicitly-governed evidence), metrics, health, certification inputs | local vault contents, plaintext credentials, sensitive configuration, customer business data unless explicitly governed |

Secrets never leave the EP and are never stored in plaintext; the config service persists **references**, resolved at point of use in the runtime (R-04.9):

```json
{
  "baseUrl": "https://uat.customer.com",
  "browser": "chromium",
  "parallel": 4,
  "jiraToken": "vault://jira/token",
  "aiProviderKey": "vault://ai-provider/key"
}
```

**R-35.10** Every cross-plane payload SHALL conform to the table above; the single Cross-Plane Client SHALL scrub and minimise on the write path (INV-6, R-05.20), and the certification interface SHALL reject any degraded result (R-05.12). *Enforcement:* outbound-payload guard + secret-scan over the client; data-classification test per direction.

## 5. Consequences (stated honestly)

- **The operational console lands where sovereignty says it must** — in the customer plane, over the customer's own evidence, credentials and execution, with one auditable egress. This is more sovereignty-correct than serving it from the IP.
- **UI/terminal parity is structural, not aspirational** — R-04.5 already mandates one sequencing path, so both triggers converge by construction rather than by discipline.
- **The largest new dependency surface on the EP side.** A portal stack and an HTTP-API stack are pinned and SBOM-tracked like the IP web tier (R-33.3 precedent); this compounds the outstanding un-SBOM'd web-tier debt, which must be reconciled, not grown silently.
- **The container-runtime boundary is untouched.** A Run button can be **built and wired now**, and both triggers can drive the pipeline end-to-end with the **boundary severed and adapters in dry-run** (R-04.6, C-04.4). But **live execution against real customer systems (stage 8) still requires the EP execution runtime — `NOT STARTED` — and a container runtime, the single open GA dependency.** Until then the portal honestly reports execution as `PENDING` / degraded; it does not fabricate results. **GA remains NOT CERTIFIED.**
- **Primary risk:** re-introducing, through a UI convenience, one of the invariants the sovereign split exists to hold (an inbound shortcut, an EP-side verdict, a plaintext secret, a second config authority). The re-cut gates (P1–P10) are what hold that line, and are written **before** the code (D-012).

## 6. Migration strategy (executes only after ACCEPTED)

Additive; nothing frozen is deleted.

1. **Accept this ADR** (customer sign-off) and add the ADR index entry; add additive references to Docs 04 (§2 trigger — the local API/portal surface), 16 (the execution queue), and 17 (the portal inside the EP image).
2. **Write the P1–P10 conformance gate(s) first** (declaration-and-enforcement in one change, D-012), each with a recorded, replayed fault proof.
3. **Generate the surfaces** from `@dbiz/platform-core`: the config service + Execution API + queue + sequencer skeleton + the portal shell (component framework, not per-capability pages — see §8), branded from `tenant.json`.
4. **Wire the single execution path** so UI Run and `npm run <capability>` converge, exercised end-to-end with the boundary severed / adapters in dry-run.
5. **Re-cut governance** — new gate(s) + fault proofs, `run-all.js` registration, closure baseline; regenerate the SBOM for the new dependency surface.
6. **Update** the product catalogue (`docs/product/EXECUTION-PLANE-PORTAL.md`) and `program/` state.

Independently and ahead of feature work: **the two pre-existing red gates** (the conformance gate still pointing at the deleted `tenant-lifecycle`; the un-SBOM'd web-tier deps) are closed and the **live secret in the committed `.env` is rotated and removed** — building a new dependency surface onto a red baseline inverts the build order (CHARTER §5).

## 7. Version impact

No cross-plane contract version change: the execution-package and evidence contracts ([20](../architecture/20-cross-plane-contracts.md)), the twelve-stage lifecycle, the six canonical states, and the SSOT format are all unchanged. What changes is **structural and additive**: the Execution-Plane solution gains an in-plane portal + Execution API + queue + config service; `tenant.json` gains a **branding band**; Docs 04, 16 and 17 gain additive references; the **supply-chain baseline** moves (the EP web/API dependency surface) and is pinned + SBOM-tracked in the same change. The capability count (6, R-11.4), the Platform-Service count (3), and the sovereign split are unchanged.

## 8. Affected components

| Component | Change |
|---|---|
| `@dbiz/platform-core` (solution generation) | **Emits** the portal shell, Execution API, execution queue, sequencer skeleton and config service into the generated EP solution, branded from the tenant SSOT |
| Generated EP solution template (`generated/<slug>/`, deployed as `<slug>/`) | **New** in-plane surfaces under `web/` (portal), `src/` (Execution API, queue, sequencer, config service), `config/` (written only by the config service) |
| The tenant SSOT under `tenants/` | **New** additive `branding` band (company name, product name, logo/monogram, theme, favicon); captured during onboarding |
| `packages/tenant-onboarding-web` + `-engine` | Onboarding gains the branding capture fields; **otherwise unchanged** — the IP onboarding console and the EP operational portal remain two distinct surfaces |
| [04](../architecture/04-execution-plane-architecture.md), [16](../architecture/16-runtime-model.md), [17](../architecture/17-deployment-topology.md) | Additive references: the local API/portal trigger surface, the execution queue, the portal inside the EP image |
| `governance/` | **New** P1–P10 conformance gate(s) + fault proofs; `run-all.js` registration; closure baseline re-cut; SBOM regenerated |
| `docs/product/EXECUTION-PLANE-PORTAL.md` | **New** product-catalogue entry |
| `program/` state | Session addendum recording the decision and its outstanding, honestly-scoped increments |

**Architectural note on the build (not a rule).** The portal SHALL be **one component framework** — Dashboard, Capability Card, Configuration Form, Execution Monitor, Live Log, Evidence Viewer, Report, Health — into which each of the six capabilities plugs, **not** a page per capability. This keeps the surface consistent and lets a future engine appear without a new page, mirroring the platform's own "one lifecycle, capability-specific extensions" principle (R-12.18).

---

**Gate:** No file is generated and no package is scaffolded until this ADR is moved from PROPOSED to ACCEPTED. On acceptance, §6 executes in order, gates first.
