# Product surface — Execution-Plane Operational Portal

**Status:** authorised by [ADR-0035](../adr/ADR-0035-execution-plane-operational-portal.md) (ACCEPTED 2026-07-24); implementation in progress, gates first.
**Owner:** DBiz Intelligence Plane (the portal is *generated* by `@dbiz/platform-core` and *runs* in the customer tenancy).
**Classification:** a **product surface, not a seventh capability** (R-11.4) and **not** a fourth Platform Service. It performs no quality engineering and yields no certified verdict of its own.

---

## 1. What it is

Every generated tenant solution ships a **branded operational console** — the customer's own web application, served from inside their Execution Plane, over their own data, credentials and evidence. It is the counterpart to the DBiz-owned **onboarding** web tier (ADR-0033/0034): different actor, different plane, different trust boundary.

| Section | Purpose |
|---|---|
| Dashboard | tenant/run overview, health at a glance |
| Configuration | edit operational config through forms — never hand-edited JSON |
| Capabilities | one card per entitled capability: Configure · Run · Monitor · Evidence · Reports · History |
| Integrations | tool endpoints (Jira, Azure DevOps, Zephyr, …) as configuration, not code |
| Test Data | tenant-owned test data management |
| Execution | trigger and track runs |
| Live Monitoring | Jenkins/BrowserStack-class live view — running/queued jobs, current step, elapsed time, evidence captured, logs, screenshots, failures, retries, certification progress |
| Evidence | the locally-custodied evidence set (INV-1) |
| Reports | certified outcomes as returned by the Intelligence Plane |
| Logs / Health / Settings | operational visibility and local runtime options |

## 2. One execution path (UI and terminal converge)

The portal's **Run** and the generated CLI (`npm run <capability>` / `ep run <capability>`) both call the **Local Execution API** — never an engine directly. This is not a convenience; R-04.5 mandates exactly one sequencing path, with no imperative alternative. The pipeline is the frozen twelve-stage lifecycle at the customer edge:

```
Run / CLI → Local Execution API → Execution Queue → request sealed package (IP: stages 1,4-7)
  → Verify Before Execute (sequencer validates provenance/hash/validity/proceed flag, R-04.2)
  → Capability Engine (stage 8) → Evidence (stage 9, custodied locally)
  → evidence references cross → IP certifies (stages 10-12) → Dashboard
```

The sequencer **decides nothing** (R-04.1); certification is **never** performed in the Execution Plane (R-12.5, C-12.10). Under Intelligence-Plane unavailability the portal renders the structural assurance state (`CERTIFIED / DEGRADED / DEGRADED-UNCERTIFIED / HALTED`) and **never fabricates a verdict** (R-05.9–12).

## 3. Configuration & secrets

The **Configuration Service** owns only the **EP-operational band** (base URL, browser selection, parallelism, timeouts, tool endpoints, environment). On Save it **validates → persists → reloads the runtime**. The Intelligence Plane's `tenant.json` remains the SSOT for **entitlement** config (ADR-0032); no value is authoritative in both bands. **Secrets are stored as `vault://` references, never plaintext** — resolved at point of use in the runtime (R-04.9, INV-2).

## 4. Sovereignty posture

Customer-local by construction: the portal, API, queue and config service open **no path from DBiz** and require **no inbound port to DBiz** (INV-3, R-17.3); the single Cross-Plane Client remains the only egress. The console ships **inside the Execution-Plane image** (two artefacts unchanged, R-17.1), containing no secret material and no cloud primitive above the adapter layer.

## 5. What is real, and what is pending

Buildable and driven end-to-end today with the boundary severed / adapters in dry-run (R-04.6, C-04.4): the portal shell, config service, Local Execution API, queue, and the single execution path. **Live capability execution (stage 8 against real customer systems) remains gated on the Execution-Plane execution runtime (`NOT STARTED`) and a container runtime — the single open GA dependency.** Until then, Run reports `PENDING`; it does not fabricate results. GA remains **NOT CERTIFIED**.
