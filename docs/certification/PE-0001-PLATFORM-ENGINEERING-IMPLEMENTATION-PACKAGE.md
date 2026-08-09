# PE-0001 — Platform Engineering Implementation Package

**Status:** DESIGN COMPLETE · LIVE PROVISIONING & EXECUTION BLOCKED (no cloud/runtime access in this environment) · **Date:** 2026-07-29

> Build-ready Platform Engineering package to operationalize the completed canonical Functional Testing
> platform. The software repository is treated as complete and immutable; **no repository code, contract,
> or architecture was modified.**
>
> **Honest capability boundary (evidence-backed):** this environment is a repository sandbox — `az`,
> `docker`/`podman`, `kubectl`, and `terraform` are all **absent**, and no Execution Plane endpoint exists.
> Therefore the workstreams that require **live** cloud/runtime/customer-plane access — deploying the
> Execution Plane, provisioning Key Vault/networking, applying IaC, and executing against a real EP —
> **cannot be performed from here**, and the program's rules forbid simulating, mocking, or fabricating
> them. This package delivers the **design/blueprint + the runtime-bindings reference implementation**;
> the live build/provision/execute/certify steps are handed to a Platform Engineering team with real cloud
> and customer-EP access. Nothing below claims a deployment or execution that did not occur.

---

## Workstream status matrix

| WS | Scope | What is delivered here | Live action status |
|---|---|---|---|
| PE-001 | Execution Plane | deployment/hosting/scaling/security **architecture** (design) | **BLOCKED** — deploy requires the customer plane + runtime |
| PE-002 | Runtime bindings module | **reference implementation template** (§3, concrete) | needs real infra to complete integration points + validate |
| PE-003 | Identity & security | Key Vault/ed25519/mTLS/rotation **architecture** | **BLOCKED** — no Key Vault / identity access |
| PE-004 | Networking | DNS/TLS/ingress/egress/timeout/retry **design** | **BLOCKED** — no network to a real EP |
| PE-005 | Observability | logging/metrics/tracing/alerting **design** (in-package emitters exist) | partial — hosting **BLOCKED** |
| PE-006 | Deployment pipeline | IaC + pipeline **design** (§6) | **BLOCKED** — no `terraform`/CI runner/cloud |
| PE-007 | Operational validation | validation plan + config (§8) | **BLOCKED** — nothing to provision against |
| PE-008 | First execution | run procedure (§9) | **BLOCKED** — `npm run functionaltest` exits 1 with external blockers (OAP-0001) |
| PE-009 | Operational certification | report templates (§8) | **BLOCKED** — requires a successful execution |

## 1. Infrastructure Architecture

Reuses and does not duplicate the existing baseline: `deploy/Dockerfile`, `deploy/azure/{CONTAINER_APPS,APPLICATION_GATEWAY,KEY_VAULT,DEPLOYMENT_GUIDE,E2_EVIDENCE}.md`, and `docs/certification/OAP-0002-INFRASTRUCTURE-ACTIVATION-SPECIFICATION.md` §1 (the required-infrastructure table with owners/dependency-chain/validation).

- **Two-plane topology (sovereignty-preserving):** the **Intelligence Plane** (this image) authors + signs the `ExecutionPackage`; the **customer-owned Execution Plane** verifies, executes the real browser, and returns evidence **by reference** (INV-1). No IP browser; no customer data in the IP.
- **IP hosting:** container (ACR image) on a container runtime (E-2) — Container Apps / AKS / any OCI host; horizontally stateless (state via the platform-providers Distributed-State port).
- **Scaling:** IP scales on authoring throughput; the EP scales on execution throughput (customer-owned).

## 2. Deployment Architecture (PE-001)

- **Hosting model:** IP image behind an application gateway / ingress; TLS-terminated; readiness gates traffic (readiness ≠ liveness, R-23.30, `packages/observability/src/health.ts`).
- **Health/readiness/liveness probes:** `/health` (liveness), readiness endpoint (dependencies bound). **Auth/authz/TLS/cert validation/signature verification/correlation/logging/metrics/tracing** for the **Execution Plane** are the customer's to implement to the frozen cross-plane contract (doc 20; ADR-0036 registration/trust; ADR-0007 signing) — this package specifies the contract they must satisfy, not a customer implementation.
- **Reference:** `deploy/azure/APPLICATION_GATEWAY.md`, `CONTAINER_APPS.md`.

## 3. Runtime Bindings Implementation (PE-002) — reference template

The `FTE_RUNTIME_BINDINGS` module is **infrastructure-owned** (not repository code). It exports exactly
`buildDependencies` + `buildRequest`, assembling the **existing** repository factories with real
infrastructure. **This is a template: Platform Engineering completes the four `// PE:` integration points
against real infra and validates end-to-end. It is not executed here; no mock Execution Plane is permitted.**

```js
// runtime-bindings.mjs — infrastructure-owned; imports ONLY the frozen canonical factories.
import { createCanonicalFunctionalTestingCapability, createRuntimeExecutionSpi,
         createExecutionPlaneTransport, createLiveApplicationStrategyAdapter,
         translateExecutionRequest, createDecisionEngine } from '@dbiz/functional-testing-engine';
// (import the specific built modules to keep the graph canonical-only; never the legacy barrel entries)

export function buildDependencies({ executionPlaneEndpoint }) {
  // PE-1: real signer — ed25519 detached signature using the Key Vault key (ADR-0007). No key material in code.
  const signer = { sign: (pkg) => /* PE: KeyVault-backed ed25519 detached sign */ realKeyVaultSigner(pkg) };

  // PE-2: real transport — HTTPS to the customer Execution Plane; verify the EP response signature; bounded retry/timeout.
  const transport = createExecutionPlaneTransport({
    send: (pkg, signature, attempt) => /* PE: real HTTPS POST to executionPlaneEndpoint */ epHttpsSend(executionPlaneEndpoint, pkg, signature, attempt),
    verifyResponseSignature: (resp) => /* PE: verify against the EP trust anchor (ADR-0036) */ verifyEpSignature(resp),
    isTransient: (err) => /* PE: classify 5xx/timeout as transient */ isTransientNetworkError(err),
    policy: { timeoutMs: 30000, maxRetries: 3 },
  });
  const runtimeExecutionSpi = createRuntimeExecutionSpi(signer, transport);

  // PE-3: real capability — decision engine + live locator resolution against the real application model.
  const runtimeConnector = createLiveApplicationStrategyAdapter({
    locatorResolver: /* PE: resolves real selectors from the tenant's application model; returns typed null if unknown */ realLocatorResolver,
  });
  const capability = createCanonicalFunctionalTestingCapability({ decisionEngine: createDecisionEngine(), runtimeConnector });

  // PE-4: real providers — story/models/candidates/rules from the real project (ADO/Jira/…).
  const providers = /* PE: real TranslationProviders */ realProviders;
  const translate = (request) => translateExecutionRequest(request, providers);

  return { capability, runtimeExecutionSpi, translate };
}

export function buildRequest() {
  // PE: construct a RuntimeExecutionRequest from the real work item — { tenantId, runId, correlationId, requirement, … }.
  return /* PE: real request */ realRuntimeExecutionRequest();
}
```

**Invariants the runtime enforces on this module (no new code, must not be bypassed):** the SPI refuses an
unsigned/invalid package (ADR-0007); the transport refuses an unverifiable response signature, a correlation
mismatch, or a verdict missing a required evidence reference; evidence crosses **by reference only** (INV-1).
Supplying a mock signer/transport/EP to force a green run is a violation of PE-0001's rules.

## 4. Security Architecture (PE-003)

Key Vault-stored ed25519 signing key (ADR-0007; `deploy/azure/KEY_VAULT.md`); detached signatures; trust
anchor published to the EP tenancy (ADR-0036); managed identity + least privilege for key access; mTLS on
IP↔EP; certificate lifecycle + secret rotation (the AI-key/PAT owner rotation is pre-existing and tracked);
append-only audit (INV-2). **BLOCKED** for live provisioning — no Key Vault/identity in this environment.

## 5. Network Architecture (PE-004)

Private networking IP→EP; DNS for the EP endpoint; TLS everywhere; ingress to the IP gateway; controlled
egress to the EP; firewall allow-list; connection pooling; bounded timeouts + retries (surfaced in the
transport policy, §3). **BLOCKED** for live configuration — no network to a real EP.

## 6. Infrastructure-as-Code & Deployment Pipeline (PE-006)

- **IaC design:** modules for registry, container host (E-2), Key Vault, application gateway, private
  networking, DNS, and the config/secret wiring — parameterised per environment; **no environment-specific
  application command** (only config differs). Author in the team's IaC tool (Terraform/Bicep); this
  environment has no `terraform`/`az` to author-and-apply against a real subscription.
- **Pipeline design:** build IP image → push to registry → provision/update infra (IaC) → inject secrets →
  provision certs → deploy → run acceptance tests (OAP-0002 §4 AT-1…AT-7) → smoke test → **on failure,
  rollback** (the canonical path is non-production until M5, so a failed first run affects no production
  traffic). **BLOCKED** for live runs — no CI runner/cloud here.

## 7. Operational Validation Plan (PE-007)

Configure `FTE_EXECUTION_PLANE_ENDPOINT` (real EP URL) and `FTE_RUNTIME_BINDINGS` (path to the completed §3
module). Verify, in order: launcher starts → bindings load (OAP-0002 AT-3) → EP reachable (AT-2) → signing
succeeds (AT-4) → request transmitted → execution accepted → evidence generated → evidence verified. Each has
an objective acceptance test in OAP-0002 §4. **BLOCKED** — nothing to provision/validate against here.

## 8. Operational Certification templates (PE-009)

Report templates to be filled **from real evidence only** after a successful execution: Infrastructure
Validation, Execution, Security, Performance, Operational Readiness, Behavioural Equivalence, M5 Readiness,
GA Recommendation. **BLOCKED** — no successful execution has occurred; filling these now would be fabrication.

## 9. Go-Live Runbook (PE-008 procedure)

Follow OAP-0002 §3 (deployment sequence) then §6 (activation checklist), which ends in the single command:

```
npm run functionaltest
```

On failure: stop immediately; capture the launcher's stdout/stderr/exit + infrastructure evidence + logs;
identify the first failing component; classify (infrastructure / configuration / operational / security /
network) — **not** repository, unless a genuine defect is proven with evidence. In this environment the run
exits 1 on external blockers (E-2/EP/bindings), per OAP-0001 — the honest, observed result.

## 10. M5 Activation Recommendation

**NOT YET — do not cut over.** M5 eligibility requires a **successful real execution** (§9), demonstrated
**behavioural equivalence** (canonical vs legacy on identical scenarios), operational stability/metrics, and
governance/customer/rollback approvals — **none of which exist**, because no real execution has occurred.
`verify-runtime-cutover-readiness` (RC-3) correctly holds the gateway on legacy. Recommendation: complete the
Platform Engineering build (real infra + the §3 bindings), run `npm run functionaltest` to green, run the
equivalence suite, then re-assess M5 — under its own governed authorization (ADR-0049 §6).

## Success-criteria assessment (honest)

| Criterion | Status |
|---|---|
| Real Execution Plane deployed | **NOT DONE** — no cloud/customer-plane access here |
| Runtime bindings implemented | **TEMPLATE delivered** (§3); real integration points + validation require infra |
| Security configured | **DESIGN delivered**; provisioning BLOCKED |
| Infrastructure validated | **NOT DONE** — nothing to validate against |
| `npm run functionaltest` executes successfully | **NOT DONE** — exits 1 on external blockers (observed) |
| Canonical reaches the EP / evidence verified | **NOT DONE** — no EP |
| Behavioural equivalence completed | **NOT DONE** — no successful run |
| Platform recommended for M5 | **NOT YET** |

**No repository defect was discovered; no Software Engineering work is recommended.** The engineering
repository is complete and immutable. The remaining work is genuinely **outside the repository** — real
cloud/runtime provisioning, the customer Execution Plane, the completed runtime-bindings integration, and
governance approvals — and it requires a Platform Engineering environment with cloud and customer-EP access,
which this repository sandbox does not have. Nothing here was simulated, mocked, or fabricated.

> **Engineering implementation is complete. Operational activation requires real infrastructure provisioning
> and governance approval, executed by a Platform Engineering team with cloud and Execution-Plane access —
> which cannot be performed, simulated, or fabricated from this repository environment.**

GA remains NOT CERTIFIED; the legacy runtime remains the active production path and rollback.
