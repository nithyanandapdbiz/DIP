# Programme summary — Architecture & Certification Programme

**Closed:** 2026-08-07 · **Commit:** `a7821fd63f6fedc2c7888478d33fcd33e300b765` · **Branch:** `main`

**GENERATED from evidence files, the proof registry and the architecture set.** No
figure below is transcribed. A closure register typed by hand is obsolete the day it
is written, and a baseline is the one document future work trusts without re-deriving.

## 1. What the programme delivered

| # | Objective | Deliverable | Outcome |
|---|---|---|---|
| **M2.1** | A versioned contract both planes compile against | `@dbiz/contracts` v1.0.0, JSON Schema emitted from Zod | **COMPLETE** |
| **M2.2** | Prove a contract change cannot silently break a consumer | 9 properties over a frozen fixture corpus, regenerated never copied | **COMPLETE** |
| **M2.4** | Know what is in the build and that it is reproducible | SBOM, frozen lockfile, licence policy, reproducible build | **PARTIAL** |
| **M2.5** | Deploy the platform | Blocked at the outset on the absence of a container runtime | **BLOCKED** |
| **M2.5a** | Close the gap that M2.6–M2.8 would otherwise have implemented without architecture | Documents 23, 24, 25 frozen; Architecture Coverage Matrix and Enterprise Traceability Matrix, both generated | **COMPLETE** |
| **P2.3** | Platform Core as a bounded context, not a seventh capability | ADR-0021; ownership distributed across documents 03, 08 and 21 | **COMPLETE** |
| **M2.6** | Executable operational proof, not more architecture | Real X.509 CA, OAuth bound to certificates, mutual-TLS gateway, atomic registration, tenant runtime | **CERTIFIED (1 exception)** |
| **M2.7** | A customer can adopt the platform without engineering help | Guided onboarding, diagnostics, CLI, 58-file Customer Success Package generated from validation output | **CERTIFIED (4 exceptions)** |
| **M2.8** | When it runs, is it observable and diagnosable? | Telemetry, health/readiness/liveness, SLOs with enforceable budgets, dashboards, release governance | **CERTIFIED (5 exceptions)** |
| **GA** | Deployment evidence | Deployment capability probe; GA gate that makes a false claim impossible | **NOT CERTIFIED** |

## 2. Evidence produced

| Evidence set | Measured | NOT MEASURED | Status |
|---|---|---|---|
| M2.6 Operational Readiness <br>`governance/operational/evidence.json` | 4/6 | 1 | uncertified |
| M2.7 Customer Success <br>`governance/customer-success/evidence.json` | 1/3 | 5 | uncertified |
| M2.8 Production Readiness <br>`governance/production/evidence.json` | 2/5 | 6 | uncertified |
| General Availability <br>`governance/deployment/evidence.json` | 4/4 | 11 | partially-certified |
| M2.4 Trusted Supply Chain <br>`governance/supply-chain/evidence.json` | undefined/undefined | 3 | uncertified |
| M2.5a Coverage & Traceability <br>`governance/traceability/evidence.json` | — | — | — |
| M2.2 Consumer Compatibility <br>`packages/contracts/compat/evidence.json` | undefined/undefined | undefined | certified |

**46 gating checks**, each with a recorded and replayed fault-injection proof
(**63 proofs**, 49 proved).

## 3. Key architectural decisions

79 ADRs are accepted. The decisions that shaped the outcome most:

| Decision | Why it mattered |
|---|---|
| **The sovereign split is the product** | Customer source, credentials and evidence never leave the customer tenancy. Verified on every build by scanning for artefact kinds, not for known strings — searching for one secret proves only that one secret is absent. |
| **Evidence over assertion (Rule 13)** | A claim without an executed measurement is not evidence. This is why the programme has `NOT MEASURED` at all, and why it survived twelve milestones of pressure to round up. |
| **`NOT RUN` ≡ `FAIL` (C-0.4)** | The predecessor stayed green while a fitness test failed, because the workflow triggered on branches nobody used. Silence is not success. |
| **Trust expires (Rule 14)** | Proofs are re-recorded and replayed, never transcribed. A proof recorded once and trusted forever is an assertion with extra steps. |
| **ADR-0021 — Platform Core as a bounded context** | Onboarding needed a home. Making it a seventh capability would have broken R-11.4; making it a third plane would have broken the split. It became a bounded context inside the Intelligence Plane, owned by documents 03, 08 and 21. |
| **Platform Services are not capabilities (ADR-0018)** | Operational Excellence, Platform Intelligence and Customer Success render no quality verdict. Without this distinction the platform would now have nine capabilities and a broken constitution. |

## 4. Lessons the programme actually learned

Each of these was found by a machine, not by review, and each cost real rework.

**A file count cannot see the wrong language.** Five of six declared supported targets
emitted TypeScript regardless of the language selected — a customer choosing Python
received `register.ts`. The file count was identical either way. Declared-but-unbuilt,
applied to the platform's own compatibility claims.

**A refusal for the wrong reason is a false pass.** A restart test asserted only that
a replayed request was refused. It was — as `bad-signature`, caused by an unrelated
defect — while a real replay exposure sat behind it. Asserting on the *reason* rather
than the status exposed both defects at once.

**A working control is not an availability failure.** Counting every non-`403` refusal
against the SLI meant refusing an attack drove availability down, and the tenants the
platform had just protected were reported as degraded. Left unfixed it produces a
permanently amber metric that operators learn to ignore.

**Silence is not health.** A platform with no errors because it is serving no requests
is not healthy. Every convenience erodes this — a default of zero, an average that
skips nulls, a value carried forward — and each one converts *unmeasured* into *fine*.

**The recorder can become the defect it detects.** A fault probe once planted a
workspace manifest; pnpm resolved it, rewrote the lockfile and installed a real
package. Fault probes must not mutate persistent state — and must not contain the
literal they search for, a lesson this programme learned three separate times.

**Governance drifts silently.** An anti-erosion list still named four properties when
twelve existed. A scorecard counted one package when five had tests. A boundary test
enforced something broader than the criterion it cited. All three passed for months.

## 5. Scope intentionally deferred

**20 components are NOT IMPLEMENTED** — see
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). The six capability engines and the
Execution Plane runtime were never in P2 scope; the programme built the contracts,
the runtime, the customer surface and the governance that will hold them.

---

*Generated from 7 evidence sets, 46 gates and 25 architecture documents.*
