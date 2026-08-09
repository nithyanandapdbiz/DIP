# Programme Closure Report — Architecture & Certification Programme

**Programme:** DBiz Agentic QA Platform — Enterprise Re-Foundation
**Closed:** 2026-07-22 · **Constitution:** v1.3
**Authority:** Enterprise Certification Authority

**Status: CLOSED.** The architecture is frozen, the governance is frozen, and the certification registers are frozen. **General Availability is NOT CERTIFIED, deliberately.**

---

## 1. What was asked, and what was delivered

The programme was asked to build an enterprise quality-engineering platform from first principles, on a sovereignty split, with every claim backed by executed evidence. It did that, and it withheld the one claim it could not evidence.

| | |
|---|---|
| Architecture documents | **25**, all frozen, 413 conformance criteria |
| ADRs | **21** |
| Packages | **5** — contracts, platform-core, platform-runtime, customer-success, observability |
| Tests | **236** |
| Gating checks | **15**, each fault-proved |
| Fault proofs | **16**, recorded and replayed |
| Evidence sets | **7**, all regenerated on every run |
| Unmeasured properties | **20**, every one with a named blocker |
| Open technical debt | **1** (D-003) |
| **General Availability** | **NOT CERTIFIED** |

## 2. The closure package

Seven registers, **all generated from measured state**. None is transcribed, because a closure register typed by hand is obsolete the day it is written — and a baseline is the one document future work trusts without re-deriving.

| Register | What it fixes |
|---|---|
| [PROGRAMME_SUMMARY.md](../../program/PROGRAMME_SUMMARY.md) | Objectives, deliverables, decisions, lessons |
| [FINAL_CERTIFICATION_REGISTER.md](../../program/FINAL_CERTIFICATION_REGISTER.md) | Every certification, its status and its evidence |
| [GENERAL_AVAILABILITY_REGISTER.md](../../program/GENERAL_AVAILABILITY_REGISTER.md) | The GA determination and precisely what would change it |
| [ARCHITECTURE_BASELINE.md](../../program/ARCHITECTURE_BASELINE.md) | Every document with its content hash |
| [GOVERNANCE_BASELINE.md](../../program/GOVERNANCE_BASELINE.md) | Gates, fault proofs, evidence registry, indices |
| [KNOWN_LIMITATIONS.md](../../program/KNOWN_LIMITATIONS.md) | NOT IMPLEMENTED, NOT MEASURED and NOT CERTIFIED, kept apart |
| [NEXT_ACTION.md](../../program/NEXT_ACTION.md) | One dependency: a container runtime |

## 3. Certification achieved

| Certification | Status | Measured | Unmeasured |
|---|---|---|---|
| Architecture (P1) | **CERTIFIED** | 25 documents frozen | — |
| M2.2 Consumer Compatibility | **CERTIFIED** | 9/9 properties | 0 |
| M2.4 Trusted Supply Chain | **PARTIALLY CERTIFIED** | 11 measured | 3 |
| M2.5a Platform Service Baseline | **CERTIFIED** | 25/25 documents owned | — |
| M2.6 Operational Runtime | **PARTIALLY CERTIFIED** | 16/16 | 1 |
| M2.7 Customer Success | **PARTIALLY CERTIFIED** | 15/15 | 4 |
| M2.8 Production Operations | **PARTIALLY CERTIFIED** | 36/36 | 5 |
| **General Availability** | **NOT CERTIFIED** | — | E-2 |

**`PARTIALLY CERTIFIED` does not mean *mostly ready*.** Every measured property holds; at least one remains unmeasured. An unmeasured property contributes nothing in either direction and is never scored as a pass.

## 4. Certification intentionally withheld

**General Availability is NOT CERTIFIED because nothing has ever been deployed.**

No container runtime exists in this environment. A probe searched eight — docker, podman, nerdctl, ctr, finch, kubectl, kind, minikube — across the PATH and every known install location, on this commit. None responded. WSL is not installed and the session is not elevated, so none could be installed.

**That blocker is now a measurement rather than a sentence.** It was carried as stated text from M2.5 through M2.8, and a stated blocker is an assertion, which R-13.1 does not accept as evidence.

### The determination cannot be faked

`generalAvailability` is computed from E-2 by a single expression — no flag, no override, no configuration. A gate then **searches the entire repository** for any file claiming otherwise, and is fault-proved by planting exactly such a document.

That gate exists because the remaining risk was never technical. Every measurement in M2.6–M2.8 passed. What remained was the possibility that someone, reasonably, under delivery pressure, would write CERTIFIED where a measurement should have gone — and **fourteen green milestones make that more likely, not less.**

It has already caught one author: a session-log entry that quoted the planted claim while explaining it. The build went red on that file. Correct outcome — prose explaining a rule is not exempt from it.

## 5. The one qualification this report makes to its own brief

The closure brief states that **E-2 shall remain the only blocker**. That is true of the **GA determination** and false of the programme as a whole, and recording it unqualified would have created exactly the false impression the registers exist to prevent.

Of 20 unmeasured properties:

| Class | Count | Meaning |
|---|---|---|
| A container runtime alone closes it | **13** | Obtaining Docker closes these outright |
| A runtime is necessary but not sufficient | **3** | G-2 needs production load, G-3 needs a 30-day window, G-4 needs an incident |
| A runtime is irrelevant | **4** | **G-5, K-12, K-13, K-14 remain unmeasured once GA is granted** |

**G-5 is the one that matters most.** It needs a shared nonce store implementation — a deployment-topology decision (**D-003**), not a runtime. Document 17 declares this plane horizontally scaled, and running the per-process default there means a nonce refused by one instance is accepted by another. A load balancer is sufficient; no restart is required.

The classification is an explicit, reviewed table rather than inferred from blocker wording. An earlier version inferred it by pattern-matching and got two of twenty wrong **in opposite directions** — G-5 looked deployment-blocked because its blocker contains the word "deployed", while G-3 and G-4 looked independent because theirs say "production traffic". Both errors were the same mistake: inferring meaning from wording.

## 6. Governance integrity

| Assertion | Result |
|---|---|
| 25 architecture documents preserved | **25**, all frozen, hashes recorded |
| 3 Platform Services preserved | **3** |
| 6 Capability Architecture preserved | **6** |
| ADR-0021 unchanged | **verified by hash** |
| Document ownership unchanged | no topic has two owners |
| No architectural drift | fitness functions green; baseline hashes match |
| No governance drift | no gate removed; 15 registered |
| No certification criteria relaxed | 413 criteria, none removed |
| No false certification claim | repository-wide scan, fault-proved |
| M-series milestones beyond M2.8 | **none created** |

### Drift is now detectable by recomputation

`verify-programme-closure.js` verifies the repository against the **committed** baseline. It deliberately does **not** regenerate before comparing — a gate that regenerated its own baseline would always agree with itself, which is precisely the self-healing weakness found in M2.7's package-integrity check and recorded there.

Amending the architecture after closure is permitted. **Amending it silently is not.**

## 7. What the programme learned

Every one of these was found by a machine, and each cost real rework.

**A file count cannot see the wrong language.** Five of six declared supported targets emitted TypeScript regardless of the language chosen. The file count was identical either way.

**A refusal for the wrong reason is a false pass.** A restart test asserted a replayed request was refused. It was — as `bad-signature`, from an unrelated defect — with a real replay exposure sitting behind it.

**A working control is not an availability failure.** Counting every non-`403` refusal against the SLI meant refusing an attack drove availability down, and the tenants the platform had just protected were reported as degraded.

**Silence is not health.** A platform with no errors because it is serving no requests is not healthy. Every convenience erodes this, and each one converts *unmeasured* into *fine*.

**The recorder can become the defect it detects.** A fault probe once planted a workspace manifest; pnpm resolved it and installed a real package. Fault probes must not mutate persistent state — nor contain the literal they search for, a lesson learned three separate times.

**Governance drifts silently.** An anti-erosion list still named four properties when twelve existed. A scorecard counted one package when five had tests. A boundary test enforced something broader than the criterion it cited. All three passed for months.

## 8. Future GA certification requires no architecture change

```
acquire a container runtime
        ↓
node governance/deployment/run-deployment-probe.mjs        →  E-2
        ↓
replay the certification suites against the deployment     →  GA-1 … GA-10
        ↓
the General Availability determination recomputes itself
```

The gates, the probe, the image descriptor and the registers are all in place. **Certification is an execution, not a design activity.**

## 9. What this report does not claim

| Does not claim | Because |
|---|---|
| That the platform is deployable | It has never been deployed |
| That the image works | `deploy/Dockerfile` has never been built or started |
| That GA is imminent | It requires a dependency this environment cannot provide |
| That the platform is feature-complete | 27 components are NOT IMPLEMENTED and recorded as such |
| That the unmeasured properties would pass | They are unmeasured; that is the entire meaning of the word |

---

**The integrity of the certification programme was more valuable than a green status, and that trade was made deliberately, repeatedly, and is recorded here.**

*Issued by the Enterprise Certification Authority · 2026-07-22*
*Programme CLOSED · Architecture FROZEN · Governance FROZEN · General Availability NOT CERTIFIED*
