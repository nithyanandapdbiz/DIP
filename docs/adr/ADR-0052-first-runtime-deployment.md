# ADR-0052 — First Runtime Deployment Readiness

**Status:** **PROPOSED** · **Date:** 2026-07-29

## 1. Problem

ADR-0039…0050 built and certified the canonical Functional Testing runtime **in-reference**, and ADR-0051 returned **NO GO for M5** — architecture and implementation are GO, operations and environment are NO GO on five external prerequisites. What did not yet exist was an assembled, evidence-backed **deployment package and first-run procedure** an operator could execute the moment a runtime and a reachable Execution Plane become available. Without it, "ready to deploy" was an assertion, not an artefact.

## 2. Context

The certified-in-reference runtime comprises the 13 domains, the activation/qualification/retirement mechanisms, the M1–M3 bridge (composer + SPI + entry-point bridge), and the M4 runtime infrastructure (translator, live application-strategy adapter, execution-plane transport, evidence return channel). The five external prerequisites from ADR-0051 are: the E-2 container runtime, a reachable Execution Plane, binding the injected ADR-0050 ports to real infrastructure, M4.5 end-to-end validation, and approvals — **none architectural**. This ADR takes the next preparatory step; it **prepares** deployment, it does not deploy.

## 3. Decision

Produce a single, evidence-backed deployment package — `docs/certification/ADR-0052-FIRST-RUNTIME-DEPLOYMENT.md` — consolidating the ten required outputs (inventory, deployment runbook, operational checklist, infrastructure checklist, configuration matrix, M4.5 runtime validation plan, behavioural-equivalence test plan, rollback runbook, go-live readiness checklist, GO/NO-GO recommendation), **reusing** the existing `deploy/azure/` artifacts rather than duplicating them, and marking every item IMPLEMENTED / ENVIRONMENT PROVIDED / CUSTOMER PROVIDED / MISSING.

**No deployment is performed. No code, architecture, contract, or prior ADR (0039–0051) is modified. No deployment is simulated and no runtime evidence is fabricated.** Verdict: the **package is READY**; **deployment is NO GO now**, conditional on the ADR-0051 external prerequisites.

## 4. Alternatives

1. **Assemble the package from repository evidence, reusing `deploy/azure/`** (chosen) — honest, executable-on-availability, no duplication, no fabrication.
2. **Perform the first deployment** — rejected: no container runtime (E-2 NOT MEASURED), no reachable Execution Plane; the authorization forbids deploying.
3. **Simulate the deployment / assert operational success** — rejected: fabricated runtime evidence (C-0.4, R-13.1), forbidden by the authorization and CLAUDE.md §5.

## 5. Consequences

The programme has a complete, ordered first-run procedure any operator can execute the moment a runtime environment and an Execution Plane become available. The legacy runtime remains the live, recoverable implementation. No routing changed; no cut-over; no retirement. GA remains NOT CERTIFIED. The single bounded implementation step still outstanding (binding the ADR-0050 injected ports to real infrastructure) is named explicitly and left for its own authorization.

## 6. Migration strategy

None is performed or required by this ADR: it is preparatory documentation. The legacy runtime stays live and recoverable; `RC-3` continues to enforce that the gateway is not rerouted. When the ADR-0051 prerequisites arrive, migration follows the package's own ordered runbook (deploy → M4.5 validation → behavioural equivalence → go/no-go), each step separately authorized. Replace-before-remove is preserved throughout; no step in this ADR alters a running path.

## 7. Version impact

**None.** No code, contract, prior ADR (0039–0051), or shared package is modified; the change is additive documentation. No contract major/minor version is triggered, and the deployed-population compatibility posture is unchanged.

## 8. Affected components

Referenced (not modified): `packages/tenant-onboarding-engine/ip-execute-gateway.mjs`; `packages/tenant-onboarding-engine/src/engine/package-signing.ts`; `packages/observability/src/health.ts`; `deploy/Dockerfile`; `deploy/azure/DEPLOYMENT_GUIDE.md`; `deploy/azure/CONTAINER_APPS.md`; `deploy/azure/APPLICATION_GATEWAY.md`; `deploy/azure/KEY_VAULT.md`; `deploy/azure/E2_EVIDENCE.md`; `deploy/azure/containerapp.yaml`; `deploy/azure/collect-e2-evidence.sh`; ADR-0051 readiness review; the readiness gates `verify-runtime-cutover-readiness` and `verify-legacy-retirement-readiness`.

## 9. Scope boundary

Deployment **preparation** only. This ADR does not deploy, does not cut over (`RC-3` still enforces the gateway is not rerouted), does not retire the legacy runtime, and adds no governance gate. The first deployment, M4.5, behavioural equivalence, cut-over (ADR-0049 §6) and retirement (ADR-0046) each remain separately authorized and unperformed.

## 10. Evidence

`packages/tenant-onboarding-engine/ip-execute-gateway.mjs`; `packages/tenant-onboarding-engine/src/engine/package-signing.ts`; `packages/observability/src/health.ts`; `deploy/Dockerfile`; `deploy/azure/DEPLOYMENT_GUIDE.md`; `deploy/azure/CONTAINER_APPS.md`; `deploy/azure/APPLICATION_GATEWAY.md`; `deploy/azure/KEY_VAULT.md`; `deploy/azure/E2_EVIDENCE.md`; `deploy/azure/containerapp.yaml`; `deploy/azure/collect-e2-evidence.sh`; ADR-0051 readiness review; the readiness gates `verify-runtime-cutover-readiness` and `verify-legacy-retirement-readiness`.

## 11. Verification

No new gate (deployment-preparation is documentation, not a runtime behaviour to enforce). The existing readiness gates remain GREEN and continue to assert the honest blocked state. The closure baseline is re-cut to admit this ADR.

## 12. Status

PROPOSED. Package READY; deployment NO GO, conditional on the ADR-0051 external prerequisites. Legacy runtime live and untouched; GA NOT CERTIFIED.
