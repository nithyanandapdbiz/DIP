# OAP-0002 — Infrastructure Activation Specification

**Status:** COMPLETE · **Audience:** Platform Engineering / DevOps · **Date:** 2026-07-29

> A complete, **implementation-independent** specification to transition the canonical Functional Testing
> platform from **READY WITH EXTERNAL BLOCKERS** to **READY FOR OPERATIONAL ACTIVATION** — with **no
> repository modifications**. The engineering is complete and verified; this document describes only the
> external infrastructure, configuration, and operational steps Platform Engineering owns. Every contract
> below is extracted from the existing code, not invented. The single operational command is
> `npm run functionaltest`; no other launcher is documented.

---

## 1. Infrastructure Activation Specification (Phase 1 — Required Infrastructure)

| Component | Purpose | Owner | M/O | Depends on | Availability | Validation |
|---|---|---|---|---|---|---|
| **E-2 container runtime** | Host the IP image (Docker/Podman/containerd/K8s) | Platform Eng | **Mandatory** | — | to provision | `docker info` / cluster ready; then the E-2 deployment probe |
| **Execution Plane (non-prod)** | Verifies the signed package, executes the real browser, returns evidence by reference | **Customer** | **Mandatory** | networking, identity | customer-provided | health endpoint 200; contract-version compatible (R-20.24/25) |
| **Runtime bindings module** (`FTE_RUNTIME_BINDINGS`) | Wires the canonical injected ports (signer, transport, translator, capability, locator) to real infra | Platform Eng | **Mandatory** | EP, secrets, identity | to author (config, not core code) | launcher prerequisite check passes; §4 AT-3 |
| **Identity provider** | Authenticate IP→EP; issue the EP session credential (ADR-0036) | Customer/Platform | Mandatory | networking | external | token issuance succeeds |
| **Secrets management (Key Vault)** | Store the ed25519 signing key + credentials | Platform Eng | Mandatory | identity | external | key retrievable; `KEY_VAULT.md` |
| **Certificates (TLS)** | Secure IP↔EP transport; publish the trust anchor to the EP tenancy | Platform Eng | Mandatory | DNS | external | TLS handshake; anchor published |
| **Networking / DNS / Firewall** | Route IP→EP; resolve the EP endpoint | Platform/Customer | Mandatory | — | external | EP endpoint resolves + reachable |
| **Storage (evidence)** | Evidence retained in **EP custody** (by reference only, INV-1) | Customer | Mandatory | EP | external | evidence references resolve |
| **Logging / Monitoring / Alerting** | Operational observability | Platform Eng | Recommended | runtime | external | telemetry flowing |
| **Health / readiness endpoints** | Liveness ≠ readiness (R-23.30) | (in-image) | Present | runtime | shipped | `/health` + readiness green |

**Dependency chain:** E-2 runtime → deploy IP image → Key Vault (signing key) + identity → networking/DNS/TLS to the customer Execution Plane → author the runtime bindings module → health green → run `npm run functionaltest`.

## 2. Configuration Contract (Phase 2)

The canonical launcher (`packages/functional-testing-engine/canonical-functionaltest.mjs`) reads exactly the
following. **Nothing else is required, and no code changes are needed to supply them.**

### 2.1 Environment variables

| Variable | Required format | Validation | Default behaviour if absent | Startup diagnostic |
|---|---|---|---|---|
| `FTE_EXECUTION_PLANE_ENDPOINT` | absolute URL (https) of the reachable Execution Plane | non-empty; passed to `buildDependencies({ executionPlaneEndpoint })` | prerequisite fail → exit 1 | "Execution Plane endpoint not configured (env FTE_EXECUTION_PLANE_ENDPOINT is unset)…" |
| `FTE_RUNTIME_BINDINGS` | filesystem path to an ESM module (absolute, or relative to CWD) | must exist on disk | prerequisite fail → exit 1 | "ADR-0050 runtime ports not bound (env FTE_RUNTIME_BINDINGS is unset)…" / "bindings module not found at …" |
| (implicit) canonical dist built | `pnpm --filter @dbiz/functional-testing-engine build` runs in the script | `dist/src/runtime-entry-point-bridge.js` exists | prerequisite fail → exit 1 | "canonical runtime not built — run pnpm … build first" |

### 2.2 Runtime bindings module contract (the infra seam — authored by Platform Eng, not core code)

The module named by `FTE_RUNTIME_BINDINGS` **must export** (signatures fixed by the existing runtime):

```
export function buildDependencies(config: { executionPlaneEndpoint: string }): {
  capability:          { run(input, ctx): CanonicalCapabilityResult },   // createCanonicalFunctionalTestingCapability(deps)
  runtimeExecutionSpi: { dispatch(pkg): RuntimeExecutionResult },        // createRuntimeExecutionSpi(signer, transport)
  translate:           (request: RuntimeExecutionRequest) => RequestTranslation,  // translateExecutionRequest(request, providers)
};
export function buildRequest(): RuntimeExecutionRequest;   // { tenantId, runId, correlationId, requirement… } from the real work item
```

Each dependency is assembled from the **existing** canonical factories, given real infrastructure:

| Dependency | Existing factory | Real inputs Platform Eng supplies |
|---|---|---|
| `capability` | `createCanonicalFunctionalTestingCapability({ decisionEngine, runtimeConnector })` | a `DecisionEngine`; `runtimeConnector` = `createLiveApplicationStrategyAdapter({ locatorResolver })` bound to the real application model |
| `runtimeExecutionSpi` | `createRuntimeExecutionSpi(signer, transport)` | `signer: PackageSigner` = ed25519 detached signer using the **Key Vault** key (ADR-0007); `transport` = `createExecutionPlaneTransport(ports)` |
| `transport ports` | `createExecutionPlaneTransport({ send, verifyResponseSignature, isTransient, policy })` | `send(pkg, signature, attempt)` = the **real HTTPS call** to `FTE_EXECUTION_PLANE_ENDPOINT`; `verifyResponseSignature` against the EP trust anchor; `policy.timeoutMs`/retries |
| `translate` | `translateExecutionRequest(request, providers)` | `TranslationProviders` = story / models / candidates / rules from the real project (ADO/Jira/etc.) |

**Validation rules (enforced by the existing runtime — no new code):** the SPI refuses to dispatch an unsigned
or invalid package (ADR-0007); the transport refuses an unverifiable response signature, a correlation mismatch,
and a verdict missing a required evidence reference (INV-1); evidence crosses **by reference only**. No mock,
stub, or simulated Execution Plane is permitted — supplying one is a violation of this specification.

### 2.3 Credential / certificate references

| Item | Reference form | Source |
|---|---|---|
| Signing key (ed25519) | Key Vault secret reference | `deploy/azure/KEY_VAULT.md` |
| Trust anchor (public key) | published to the EP tenancy | ADR-0036 |
| TLS certificate | environment cert store | per environment |
| EP session credential | issued via `POST /api/register` (OTC) | ADR-0036 |
| Config files | `deploy/Dockerfile`, `deploy/azure/containerapp.yaml` | present in repo |

## 3. Deployment Runbook (Phase 3 — sequence + rollback)

1. **Provision the E-2 container runtime** and registry.
2. **Provision Key Vault**; store the ed25519 signing key; grant the workload identity read access.
3. **Deploy the IP image** (`deploy/Dockerfile` → `deploy/azure/containerapp.yaml`).
4. **Configure networking/DNS/TLS** IP→EP; confirm the customer **Execution Plane** is deployed and reachable; publish the trust anchor to the EP tenancy.
5. **Author + deploy the runtime bindings module** (§2.2) and set `FTE_RUNTIME_BINDINGS` to its path; set `FTE_EXECUTION_PLANE_ENDPOINT`.
6. **Verify health/readiness** (readiness ≠ liveness, R-23.30) and the acceptance tests (§4).
7. **Execute** `npm run functionaltest` (the M4.5 first run).
8. **Validate evidence** — evidence references returned, correlation preserved, audit append-only.

**Rollback considerations:** the canonical path is **not** the production gateway; a failed first run affects no
production traffic — the live `/v1/execute` gateway remains on the legacy runtime. Rollback of the *first run* =
take no action on the gateway. (The production **cut-over** to route the gateway through the canonical is the
separate governed **M5** step, ADR-0049 §6, with `rollbackToLegacy` per ADR-0044 — out of scope here.)

## 4. Operational Acceptance Checklist (Phase 4 — objective acceptance tests)

| ID | Dependency | Validation command | Expected | Failure condition | Remediation |
|---|---|---|---|---|---|
| AT-1 | E-2 runtime | `docker info` (or cluster readiness) | daemon/cluster ready | not found / not ready | provision the runtime |
| AT-2 | Execution Plane | `curl -sf $FTE_EXECUTION_PLANE_ENDPOINT/health` | HTTP 200 | non-200 / unreachable | deploy/expose the EP; fix networking/DNS |
| AT-3 | Runtime bindings | `node -e "import(process.env.FTE_RUNTIME_BINDINGS).then(m=>{if(!m.buildDependencies||!m.buildRequest)process.exit(1)})"` | exit 0 (both exports present) | missing exports / import error | author the bindings module per §2.2 |
| AT-4 | Signing key | Key Vault get-secret | key material retrievable | access denied / absent | grant identity; store the key |
| AT-5 | Trust anchor | EP verifies a test-signed package | signature accepted | verification fails | publish the correct public key (ADR-0036) |
| AT-6 | Config present | `env | grep -E 'FTE_EXECUTION_PLANE_ENDPOINT|FTE_RUNTIME_BINDINGS'` | both set | either unset | set the env vars (§2.1) |
| AT-7 | Launcher prereqs | `npm run functionaltest` | proceeds past the prerequisite gate | exit 1 with a named blocker | resolve the exact blocker printed |

## 5. Platform Engineering Handoff Checklist (Phase 5 — independently verifiable)

- ☐ E-2 container runtime reachable (AT-1)
- ☐ IP image deployed and started (health endpoint responding)
- ☐ Execution Plane deployed and **healthy** (AT-2)
- ☐ Runtime bindings module authored, deployed, and loadable (AT-3)
- ☐ Certificates installed; trust anchor published (AT-5)
- ☐ Secrets available (signing key retrievable) (AT-4)
- ☐ EP endpoint responding; contract-version compatible
- ☐ Networking/DNS/firewall path IP→EP verified
- ☐ Health + readiness checks passing (R-23.30)
- ☐ `FTE_EXECUTION_PLANE_ENDPOINT` and `FTE_RUNTIME_BINDINGS` set (AT-6)
- ☐ Operational / change / customer / rollback approvals recorded
- ☐ Launcher prerequisites satisfied (AT-7)

## 6. Production Activation Checklist (Phase 6 — ends in one command)

1. ☐ All Phase-5 handoff items verified.
2. ☐ All Phase-4 acceptance tests pass.
3. ☐ Governance approvals recorded.
4. ☐ Execute the single operational command:

```
npm run functionaltest
```

5. ☐ Validate the returned evidence references + correlation id + audit entry.

**No other launcher is documented or supported.** (Behavioural equivalence, the M5 production cut-over, and M6
legacy retirement are separate governed steps that follow a successful first run — not part of this activation.)

## Success statement

This specification is complete and implementation-independent: Platform Engineering can provision the required
infrastructure, author the runtime bindings module against real infra, set two environment variables, and run
the existing canonical Functional Testing platform **without any code change**. No repository defect was found
and none is required to be fixed.

> **Engineering implementation is complete. Platform Engineering now owns the remaining work required for operational activation.**

GA remains NOT CERTIFIED until a successful real execution + E-2 evidence exist; the legacy runtime remains the
active production path and rollback until the separate M5/M6 steps.
