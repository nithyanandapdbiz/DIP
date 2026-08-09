# ADR-0052 — First Runtime Deployment Package

**Status:** COMPLETE (deployment package) · **Verdict:** PACKAGE READY · DEPLOYMENT NOT PERFORMED · **Date:** 2026-07-29

> A deployment-ready operational package and runbook for the **first** end-to-end
> execution of the canonical Functional Testing runtime in a real **non-production**
> environment. **This ADR prepares deployment; it does not deploy, does not cut over,
> and does not retire the legacy runtime.** No code, architecture, contract or ADR was
> changed. Every item is backed by repository evidence and explicitly marked where
> external infrastructure is required. No deployment is simulated and no runtime
> evidence is fabricated. It reuses the existing `deploy/azure/` artifacts rather than
> duplicating them.

---

## 1. Deployment Inventory (Phase 1)

| Artifact | Classification | Evidence / Source |
|----------|----------------|-------------------|
| IP execution gateway (`/v1/execute`) | IMPLEMENTED | `packages/tenant-onboarding-engine/ip-execute-gateway.mjs` |
| Canonical runtime bridge + composer + SPI (ADR-0048) | IMPLEMENTED | `src/runtime-entry-point-bridge.ts`, `canonical-authoring-composer.ts`, `runtime-execution-spi.ts` |
| Runtime infrastructure (translator/adapter/transport/evidence) (ADR-0050) | IMPLEMENTED (in-reference) | `src/runtime/*.ts` |
| Container image (Dockerfile) | IMPLEMENTED | `deploy/Dockerfile`, `deploy/azure/containerapp.yaml` |
| Package signing (ed25519, ADR-0007) | IMPLEMENTED | `packages/tenant-onboarding-engine/src/engine/package-signing.ts` |
| Health / readiness endpoints | IMPLEMENTED | `packages/observability/src/health.ts` (readiness ≠ liveness, R-23.30) |
| Startup script / entrypoint | IMPLEMENTED | `src/server/index.ts`, gateway `node ip-execute-gateway.mjs` |
| E-2 evidence collection | IMPLEMENTED (tooling) | `deploy/azure/collect-e2-evidence.sh`, `deploy/azure/E2_EVIDENCE.md` |
| Signing key (persisted ed25519) | ENVIRONMENT PROVIDED | gateway `KEY_FILE = .execute-signing-key.pem` (dev fixture); production key from Key Vault (`deploy/azure/KEY_VAULT.md`) |
| Signature-verification / trust anchor (public key) | ENVIRONMENT PROVIDED | published to the EP tenancy (ADR-0036) |
| Configuration / environment variables | ENVIRONMENT PROVIDED | `IP_EXECUTE_PORT` (default 4611), `IP_AUTHORING`, tenant config |
| Secrets (AI key, PAT, credentials) | CUSTOMER / ENVIRONMENT PROVIDED | vault-stored; AI-key/PAT owner rotation pre-existing (noted) |
| Network to the Execution Plane | CUSTOMER PROVIDED | cross-plane contract (doc 20); gateway currently binds loopback `127.0.0.1` |
| **Execution Plane runtime** | **CUSTOMER PROVIDED** | separate sovereign plane; not in this repository |
| **Container runtime (E-2)** | **MISSING (ENVIRONMENT PROVIDED)** | E-2 NOT MEASURED; no runtime present (probe searched 8) |
| Real port bindings (translation providers / locator resolver / network `send`) | **MISSING (implementation, bounded)** | ADR-0050 ports are injected; real bindings not yet written |

## 2. Deployment Runbook (Phase 2)

> Reuses `deploy/azure/DEPLOYMENT_GUIDE.md`, `CONTAINER_APPS.md`, `APPLICATION_GATEWAY.md`, `KEY_VAULT.md`. The steps below are the ordered first-run procedure; they execute **only** when a container runtime and a reachable Execution Plane exist.

1. **Prerequisites** — a container runtime (E-2), a reachable non-production Execution Plane endpoint, a Key Vault with the signing key, and tenant configuration. (See §4/§8.)
2. **Deployment order** — (a) build the image (`deploy/Dockerfile`); (b) provision Key Vault + inject the signing key; (c) deploy the container (`deploy/azure/containerapp.yaml`); (d) configure `IP_EXECUTE_PORT` and the EP endpoint; (e) publish the public trust anchor to the EP tenancy (ADR-0036).
3. **Configuration** — set the environment variables in §5; bind the ADR-0050 injected ports to the real project adapter, application-model locator resolver, and network transport (the one bounded implementation step, §8).
4. **Validation** — run the health/readiness checks (§7); run the M4.5 plan (§6) in the non-production environment.
5. **Rollback** — the canonical runtime is not yet the live path; rollback = do not reroute the gateway (it still serves the legacy engine). See §8 (Rollback Runbook).
6. **Troubleshooting** — signature mismatch → verify the canonicalization byte-matches the EP verifier and the public trust anchor is published; correlation mismatch → check the correlation id round-trip; transport failure → check EP reachability and retry policy.
7. **Log locations** — gateway stdout (`IP execution gateway on …`), `packages/tenant-onboarding-engine/.ip-execute-gateway.log`, observability telemetry (`packages/observability`).
8. **Health verification** — `packages/observability/src/health.ts` readiness endpoint (readiness distinct from liveness; a health check that reports healthy on liveness alone is refused, R-23.30).

## 3. Operational Checklist (Phase 3)

- [ ] **Infrastructure** — container runtime present (E-2); image built; container running.
- [ ] **Networking** — gateway reachable; EP endpoint reachable; ports open (`IP_EXECUTE_PORT`).
- [ ] **Execution Plane connectivity** — EP responds; contract version compatible (R-20.24/25).
- [ ] **Certificates** — TLS in place per environment; trust anchor published.
- [ ] **Authentication** — signing key loaded; public key resolvable by the EP.
- [ ] **Observability** — telemetry emitting; readiness endpoint green; audit append-only.
- [ ] **Package signing** — detached ed25519 signature produced; canonicalization byte-matches the EP verifier.
- [ ] **Evidence collection** — evidence references returned; payloads remain in EP custody (INV-1).
- [ ] **Correlation IDs** — correlation id preserved request→package→verdict→evidence.

## 4. Infrastructure Checklist (Phase 3)

- [ ] Container runtime (Docker/Podman/containerd/K8s) — **E-2, ENVIRONMENT PROVIDED, currently MISSING**.
- [ ] Container registry + image (`deploy/azure/CONTAINER_APPS.md`).
- [ ] Key Vault + signing key (`deploy/azure/KEY_VAULT.md`).
- [ ] Application gateway / ingress (`deploy/azure/APPLICATION_GATEWAY.md`).
- [ ] Non-production Execution Plane instance — **CUSTOMER PROVIDED**.
- [ ] Network path IP → EP (cross-plane; doc 20).

## 5. Configuration Matrix (Phase 5-adjacent output)

| Variable | Default | Source | Classification |
|----------|---------|--------|----------------|
| `IP_EXECUTE_PORT` | 4611 | gateway | ENVIRONMENT PROVIDED |
| `IP_AUTHORING` | `fte` | gateway (`fte`/`smoke`) | ENVIRONMENT PROVIDED |
| signing key file / Key Vault ref | `.execute-signing-key.pem` (dev) | gateway / Key Vault | ENVIRONMENT PROVIDED |
| EP endpoint URL | (loopback dev) | environment | CUSTOMER PROVIDED |
| trust anchor (public key) | published | ADR-0036 | ENVIRONMENT PROVIDED |
| tenant configuration (providers, candidates, rules) | — | tenant profile | CUSTOMER PROVIDED |
| AI key / PAT | vault | secret store | CUSTOMER PROVIDED (owner rotation pre-existing) |

## 6. Runtime Validation Plan (M4.5) (Phase 4) — prepared, NOT executed

**Scenarios:** (S1) a single requirement, happy path; (S2) a requirement with a negative acceptance criterion; (S3) a degraded connector (transport failure) → graceful; (S4) an unsigned package → refused; (S5) a correlation mismatch → refused; (S6) a verdict missing evidence → refused.

**Expected outcomes:** S1/S2 — a valid signed `ExecutionPackage` is transmitted, the EP accepts + executes, evidence references return, a `RuntimeExecutionOutcome` is produced; S3–S6 — the runtime **refuses** with a typed error (already fault-proved in-reference: ADR-0050 RE-2).

**Evidence collection:** evidence by reference only (INV-1); correlation id preserved; audit append-only; `deploy/azure/collect-e2-evidence.sh` gathers the E-2 record.

**Success metrics:** valid package generated + transmitted + EP-accepted + executed + evidence retrieved (§7 checks all green). **Failure criteria:** any unsigned/invalid/missing-evidence/correlation-mismatch not refused; any evidence payload crossing the boundary; any browser executed in the IP. **This validates infrastructure only — NOT behavioural equivalence (§7).**

## 7. Behavioural Equivalence Test Plan (Phase 4) — prepared, NOT executed

> Runs only after M4.5 passes and a real environment exists. It is **not** demonstrable now (the canonical has never run real; the packages are abstract-vs-concrete until live locator resolution).

**Procedure:** for each representative scenario, run the legacy runtime and the canonical runtime on the **identical** request; compare the execution package (post live locator resolution), execution intent, evidence references, defect behaviour and reporting semantics.

**Equivalence criteria:** same execution intent; same evidence-reference contract; same defect/report semantics. **Declared differences are acceptable and must be documented** (the internal-representation difference from the ADR-0039 rebuild); **unexpected differences are a FAIL.** No equivalence is claimed until this runs on real workloads.

## 8. Rollback Runbook (Phase 2) + bounded implementation note

- **Current rollback posture:** the canonical runtime is **not** the live path; the gateway serves the legacy engine. Rollback of a failed first-run = **do nothing to the gateway** (it remains on legacy). No production traffic is affected because no cut-over has occurred.
- **After a future M5 cut-over** (separate authorization): rollback = `rollbackToLegacy` (ADR-0044), deterministic, no code change — see ADR-0049.
- **Bounded implementation step required before M4.5** (the only code, not done here, and out of this ADR's scope): bind the ADR-0050 injected ports (`TranslationProviders`, `LocatorResolver`, transport `send`/`verifyResponseSignature`) to the real project adapter, application-model resolver, and network transport, and wire the bridge as an *additional, non-default* entry the runbook invokes — never replacing the gateway default.

## 9. Go-Live Readiness Checklist (Phase 3)

- [ ] E-2 container runtime provisioned (measured).
- [ ] Non-production Execution Plane reachable and contract-compatible.
- [ ] ADR-0050 injected ports bound to real infrastructure.
- [ ] M4.5 executed end-to-end with measured evidence.
- [ ] Behavioural equivalence demonstrated on representative real workloads.
- [ ] Observability green (readiness, telemetry, audit); signing + trust anchor verified.
- [ ] Governance + stakeholder + executive approval recorded.
- [ ] Rollback verified (`rollbackToLegacy`).

## 10. Risk Review (Phase 5)

| Risk | Likelihood | Impact | Mitigation | Rollback |
|------|-----------|--------|-----------|----------|
| E-2 runtime unavailable | High (now) | Blocks all | provision runtime | n/a (no deploy) |
| EP unreachable / contract mismatch | Medium | High | verify EP + contract version (R-20.24/25) | do not reroute |
| Signature canonicalization mismatch | Medium | High | byte-match the EP verifier; publish the trust anchor | do not reroute |
| Real locator resolution insufficient | Medium | High | validate the app-model resolver at M4.5; do not invent selectors | do not reroute |
| Behavioural drift | Medium | High | equivalence suite before cut-over | `rollbackToLegacy` |
| Premature cut-over | Low | High | RC-3 gate enforces the gateway is not rerouted | gate blocks |

## 11. Final GO / NO-GO Recommendation

> **The deployment PACKAGE is READY (GO for preparation).** The runbook, checklists,
> configuration matrix, M4.5 plan, behavioural-equivalence plan and rollback runbook are
> complete, evidence-backed, and executable **immediately once a real runtime environment
> and Execution Plane become available**.
>
> **Deployment itself is NO GO now** — it is gated on external prerequisites that this ADR
> cannot fabricate: a container runtime (E-2 NOT MEASURED), a reachable Execution Plane
> (customer-provided), the bounded binding of the ADR-0050 injected ports, and then M4.5
> and behavioural equivalence with approvals (ADR-0049/0051). No deployment was performed,
> no runtime evidence fabricated, and no operational success claimed. The legacy runtime
> remains the live, recoverable implementation; GA remains NOT CERTIFIED.
