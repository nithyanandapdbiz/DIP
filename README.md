# DBiz Intelligence Plane

**Role:** The plane that **reasons, decides, and governs.**
**Programme:** DBiz Agentic QA Platform — Enterprise Re-Foundation
**Status:** Engineering programme complete (ADR-0039–ADR-0054; see [`docs/certification/PCR-0001-FUNCTIONAL-TESTING-PROGRAMME-CLOSURE.md`](docs/certification/PCR-0001-FUNCTIONAL-TESTING-PROGRAMME-CLOSURE.md)). Operational execution and General Availability are pending external infrastructure (an E-2 container runtime + a reachable Execution Plane) and approvals — **GA NOT CERTIFIED**. The legacy Functional Testing runtime remains the active, recoverable path.

---

## Quick Start

A clean clone of this repository is everything you need. No file is obtained from another developer.

```bash
git clone <this-repo> && cd DBizIntelligencePlane
corepack enable                     # activates the pnpm version pinned in package.json
pnpm install --frozen-lockfile      # fails loudly if the lockfile and package.json have drifted
cp .env.example .env                # local configuration; every value is a placeholder
pnpm build
pnpm test
pnpm govern                         # the governance verification suite
```

To run the platform locally in containers:

```bash
docker compose up --build           # http://localhost:8080/api/health · Swagger at /api/docs
docker compose down -v              # tear down, including the state volume
```

### Prerequisites

| Tool | Version | Why | Required for |
|---|---|---|---|
| **Node.js** | `>=24.0.0 <25` (ADR-0017 runtime baseline; enforced by `engines`) | Runtime and test runner | install, build, test |
| **Corepack** | ships with Node 24 | Activates **pnpm 11.15.1** exactly as pinned by `packageManager`, so you cannot build against a different package manager than CI | install |
| **pnpm** | `11.15.1` — do **not** install separately | Workspace manager | install, build, test |
| **OpenSSL** | any recent | `CertificateAuthority` shells out to it to issue certificates; without it the `@dbiz/platform-runtime` mTLS integration test fails in `before()` | `pnpm test` |
| **Docker** | Engine + Compose v2 | `docker compose up`; also the container runtime the closure baseline names as its outstanding dependency | `pnpm dev`, runtime evidence |
| **Azure CLI** | `>=2.60` with the `containerapp` extension | Deployment only — not needed to build or test | deployment |

On Windows, OpenSSL is not on `PATH` by default. Git for Windows ships one at
`C:\Program Files\Git\usr\bin\openssl.exe`; add that directory to `PATH`, or install OpenSSL separately.

### Azure prerequisites

Only for deploying — never for local development. `az login` against the `dbiz-intelligence-plane`
subscription, with ACR · Container Apps · App Gateway · Key Vault · Azure Files provisioned. The
authoritative procedure is [deploy/azure/DEPLOYMENT_GUIDE.md](deploy/azure/DEPLOYMENT_GUIDE.md); the
Key Vault secret and environment-variable inventories are in [deploy/azure/README.md](deploy/azure/README.md).

### Environment variables

[.env.example](.env.example) is the single template and documents **every** variable. Copy it to `.env`
(gitignored) for local development and `docker compose`, which reads it via `env_file`.

The same variable *names* drive every environment — local, dev, qa, uat, production — and only their
*values* change (R-17.15). In Azure, secrets arrive from Key Vault as `secretRef → env` and non-secrets
are plain Container App values; the image is identical. `@dbiz/platform-providers` is the single reader
and validates them at startup, fail-fast.

`SESSION_SECRET` is the one **required** value. It signs both DBiz sessions and Execution Plane
credentials, so it must stay a single stable value — rotating it revokes every EP credential. The value
shipped in `.env.example` is a labelled local-only throwaway and must never be used outside your machine.

`.env` itself is gitignored and must never be committed. `.env.example` contains no secret values.

### Expected commands

| Command | Does | Expected |
|---|---|---|
| `pnpm install --frozen-lockfile` | Installs the workspace | exit 0 |
| `pnpm build` | `tsc` across all packages + the Vite web build | exit 0 |
| `pnpm test` | `node --test` across all packages | exit 0 — **requires OpenSSL** |
| `pnpm govern` | 58 governance gates | exit 0 only when the programme is certified; a non-zero exit reports real governance state, not a broken checkout |
| `pnpm verify` | `build && test && govern` | the full gate chain, as CI runs it |
| `pnpm dev` | `docker compose up --build` | requires `.env` |
| `pnpm dev:local` | Onboarding engine directly on the host | requires `.env` |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs exactly this sequence on every push.
Under D-016 / C-0.4, **NOT RUN ≡ FAIL** — a gate that does not execute is treated as a failed gate.

---

## Ownership

This repository owns:

| | |
|---|---|
| Architecture | The canonical enterprise architecture (`docs/architecture/`) |
| Capability registry | What capabilities exist and how they are described |
| Governance & policy | Policy authorship and the policy decision point |
| Workflow definitions | Authorship of what shall be executed |
| Tenant registry | Tenant identity and configuration intelligence |
| Knowledge graph | Accumulated platform knowledge |
| AI runtime | All AI inference, behind provider abstraction |
| Certification | Verdicts, decisions, and attestation |
| Review framework | The review pipeline |
| Platform contracts | What crosses the plane boundary |
| Platform APIs | The multi-tenant service surface |

## Never in this repository

- Connections to customer systems
- Customer credentials or secret material
- Permanent customer data
- Execution sequencing
- Browser, load, or scanning capability — **even dormant**
- AI-computed decisions (AI generates; deterministic code decides)

## Why the split exists

The Sovereign Split separates *reasoning about testing* from *performing testing*, so reasoning can be delivered as multi-tenant SaaS while execution — and all customer data, credentials, and evidence — remains inside the customer's tenancy.

**The split is the product.** It is what permits AI-assisted quality engineering in environments where customer data may not leave the tenancy. It is never violated for convenience; moving a responsibility across the boundary requires an ADR.

## Structure

```
docs/architecture/   canonical architecture (P1) — one authoritative answer per topic
docs/adr/            architecture decision records
```

## Programme memory

Implementation state is **not** tracked here. It lives in `../program/`. See `../CLAUDE.md` for the authoritative read order.
