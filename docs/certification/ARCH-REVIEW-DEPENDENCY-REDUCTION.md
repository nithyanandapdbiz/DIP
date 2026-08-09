# Architecture Review — Minimize External Infrastructure Dependencies for Functional Testing

**Status:** COMPLETE (review; no code/architecture change) · **Date:** 2026-07-29

> Determines whether the external dependencies gating `npm run functionaltest` can be eliminated, embedded,
> automated, packaged, or generated to reduce **developer** setup friction — **without** changing the
> Functional Testing architecture, Runtime SPI contracts, signing, evidence generation, tenancy isolation, or
> security, and **without** mocking infrastructure or simulating the Execution Plane. Grounded in disk evidence.

---

## Framing: "local" is not "mock"

The decisive, legitimate lever is the distinction the rules and Task 2 invite:

- **A mock / simulated Execution Plane** (fake responses, no real browser, fabricated evidence) — **FORBIDDEN**, and this review recommends none.
- **A real Execution Plane instance run locally / containerized** — the *same* EP software, doing *real* signature verification, *real* browser execution against a *real* (developer-owned test) application, producing *real* evidence by reference — is **legitimate**. It changes the deployment *topology*, not the architecture, and preserves plane separation (the IP still authors + signs; the EP still executes).

Everything below reduces friction by **packaging, automation, and config-selection using existing mechanisms** — never by weakening a control.

## Task 1 — Per-dependency review

| Dependency | Remain external? | Packageable? | Containerizable? | Auto-startable? | Embeddable? | Generatable? | Eliminable? |
|---|---|---|---|---|---|---|---|
| **E-2 container runtime** | dev: a host tool (install Docker/Podman); prod/CI: provided | via Compose/dev-container | it *is* the container host | yes (`docker compose up`) | no (you need a runtime to run containers) | no | **no** — reduce to "install Docker", not remove |
| **Execution Plane** | **prod: MUST (customer-sovereign)**; dev: a local real instance may | dev: yes (real EP in Compose) | yes (dev EP container) | yes | no (must stay a distinct plane — INV-1) | no | no — prod EP is irreducible |
| **Runtime bindings** (`FTE_RUNTIME_BINDINGS`) | config-owned, not core code | yes | n/a | yes | no | **yes** — generate the wiring from declarative config | partly (dev default) |
| **Key Vault** | **prod: MUST**; dev: a Local Secret provider may | already abstracted (`platform-providers` Secret provider) | yes | yes | no (secrets never in code) | dev key generatable | no (prod) — signing preserved either way |
| **Identity** | prod: MUST (managed identity) | dev: local identity / OTC flow (ADR-0036) | yes | yes | no | dev identity generatable | no (prod) |
| **Certificates (TLS)** | prod: MUST | dev: self-signed cert via bootstrap | yes | yes | no | dev cert generatable | no — TLS preserved |
| **Networking / DNS** | prod: MUST (private) | dev: Compose network + service DNS | yes | yes | n/a | n/a | no (prod) — auto for dev |

**Signing and evidence-by-reference are never removed** in any option — only the *source* of the dev key (Local Secret provider vs Key Vault) and the *scope* of the run (local test app vs customer app) change.

## Task 2 — Execution Plane: local / containerized / self-hosted dev instance

**Yes — legitimately, for development, without violating production governance.** The `platform-providers`
package already selects Local vs Cloud implementations by configuration; the tenant-onboarding engine already
generates the per-tenant EP operational surface (ADR-0035). A **dev EP** is the *real* EP software, deployed in
a container, verifying real signatures and executing a real browser against a *developer-owned test
application* — not a mock. It validates the canonical runtime end-to-end locally (an M4.5-class run) while:

- **Preserving plane separation** — the EP remains a distinct plane; the IP never embeds or executes the app.
- **Preserving sovereignty (INV-1, doc 06)** — the dev tenant is the developer's own; no customer data.
- **Preserving signing/verification/evidence** — all real, just with a dev key + dev target.

**Sovereignty caveat (honest):** the Execution Plane's software belongs to the **Execution Plane repository**
(the separate, customer-owned plane), not the Intelligence Plane. A dev-EP container image and its Compose
service must be delivered **in that plane**, not authored into the IP — this review recommends it as a
cross-plane packaging task for the EP owner, not an IP change. It does **not** make a dev EP a substitute for
the **production** customer EP: GA and the M5 cut-over still require the real customer plane + approvals.

## Task 3 — Generate Runtime Bindings from configuration

**Yes, for the standard case.** The bindings module wires *existing* factories
(`createRuntimeExecutionSpi(signer, transport)`, `createExecutionPlaneTransport(ports)`,
`createCanonicalFunctionalTestingCapability({decisionEngine, runtimeConnector})`, `translateExecutionRequest`).
Most of that is boilerplate derivable from a **declarative config** (endpoint, key reference, transport policy,
provider config). A **bindings generator** could emit the `buildDependencies`/`buildRequest` module from that
config, so a developer supplies *config values*, not code. What remains non-generatable is the genuinely
variable part — the real provider connection (project adapter) and the real application locator model — which
for a dev EP is a real developer test fixture (still not a mock). **No architecture change:** the launcher
already consumes `FTE_RUNTIME_BINDINGS` as a module path; a generated module satisfies the same contract.

## Task 4 — Infrastructure provisioning opportunities (dev-only, production-preserving)

| Opportunity | What it packages | Effect |
|---|---|---|
| **Docker Compose** (extend the existing `docker-compose.yml`) | today runs `intelligence-plane` + `redis` + `dbiz-state`; add a **dev EP** service + a **test target app** + local providers | one `docker compose up` brings up the whole dev topology |
| **Dev Container** (`.devcontainer` — absent today) | the toolchain (Node 24, pnpm) + Compose | a clone opens ready-to-run; no manual toolchain setup |
| **Local Kubernetes / azd / IaC** | the same topology for teams that prefer it | optional parity with the production `deploy/azure` IaC |
| **Automatic bootstrap** | generate the dev key (Local Secret provider), dev TLS cert, and generated bindings; set `FTE_EXECUTION_PLANE_ENDPOINT` to the Compose EP service | removes manual Key Vault / cert / bindings authoring for dev |

**Target developer experience:** *install Docker → `docker compose up` → `npm run functionaltest`.* Compose
supplies networking/DNS/TLS; the Local providers supply config/secret/state; the generated bindings supply the
wiring; the dev EP supplies real execution. Production remains exactly as designed.

## Task 5 — Dependency reduction roadmap (classification)

| Dependency | Classification | Rationale |
|---|---|---|
| E-2 container runtime | **AUTOMATABLE** (dev) | reduce to "install Docker" + Compose; cannot be eliminated (a runtime is required to run containers) |
| Production Execution Plane | **PRODUCTION ONLY / PERMANENT** | customer-sovereign; real app + credentials; irreducible for a production run/GA (INV-1, doc 06) |
| Dev Execution Plane instance | **PACKAGEABLE** (EP plane) | real EP software, containerized for dev; not a mock; delivered in the EP repo |
| Runtime bindings | **AUTOMATABLE** (generatable) | wiring generatable from declarative config; the launcher contract is unchanged |
| Key Vault | **OPTIONAL (dev) / PRODUCTION ONLY (prod)** | Local Secret provider for dev; Key Vault for prod; signing preserved either way |
| Identity | **AUTOMATABLE (dev) / PRODUCTION ONLY (prod)** | local dev identity / OTC flow; managed identity in prod |
| Certificates (TLS) | **AUTOMATABLE (dev) / PRODUCTION ONLY (prod)** | dev self-signed cert via bootstrap; real TLS preserved |
| Networking / DNS | **PACKAGEABLE (dev) / PRODUCTION ONLY (prod)** | Compose network + service DNS for dev; private networking in prod |

## What cannot legitimately be simplified (architectural reason)

1. **A container runtime must exist somewhere.** It is reducible to a one-time developer install (Docker) but not eliminable — you cannot run a containerized runtime without a runtime host.
2. **The production Execution Plane, the real customer application, real credentials, and governance approvals are irreducible for a real production run, cut-over, and GA.** Data sovereignty (INV-1, doc 06, doc 20) requires that the customer's application be executed only by the customer's own plane and that no customer data enter the Intelligence Plane. A dev EP validates the runtime but is architecturally *not* the production target; substituting it for production would violate sovereignty. This is a deliberate architectural boundary, not a friction defect.

## Conclusion

Significant developer friction **can** be removed — without changing architecture, mocking infrastructure, or
weakening security — by packaging the dev topology (extend Compose + add a `.devcontainer` + a dev EP container
in the EP plane + Local providers + a bindings generator + an automatic bootstrap). This collapses developer
setup toward *"install Docker → `docker compose up` → `npm run functionaltest`"* while preserving signing,
evidence-by-reference, tenancy isolation, and plane separation. **Production remains fully governed:** the
real customer Execution Plane, Key Vault, managed identity, private networking, and approvals stay
PRODUCTION-ONLY, and neither GA nor the M5 cut-over is reachable via the dev topology.

**This is a review only — no architecture, contract, runtime, or governance was changed.** The recommended
work is dev-experience packaging/automation using existing mechanisms; the IP-side items (Compose extension,
`.devcontainer`, bindings generator, bootstrap using `platform-providers` Local impls) are additive and
dev-scoped; the dev-EP container is a cross-plane task owned by the Execution Plane. GA remains NOT CERTIFIED;
the legacy runtime remains the active production path and rollback.
