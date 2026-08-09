# General Availability register

## STATUS: NOT CERTIFIED

**Reason:** Deployment evidence unavailable. E-2 is NOT MEASURED because no container runtime exists in this environment.

**This determination is computed**, not written: it equals `CERTIFIED` if and only if
E-2 has `PASS` evidence, and a gate refuses any file in this repository that claims
otherwise — fault-proved by planting exactly such a document.

## Evidence required

| # | Property | Criterion |
|---|---|---|
| **E-2** | the Intelligence Plane image builds, starts, and serves a real request (C-17.3) | C-17.3 |

**C-17.3 sets the bar and it is deliberately high:** *each image starts and serves a
real request*. A successful build is **not** E-2 evidence. Document 17 explains why —
*an image that builds is not an image that runs, and the gap between them is where the
predecessor's stale COPY and missing shared code both hid.*

## Required environment

Any one of these, with a responding daemon:

- `docker`
- `podman`
- `nerdctl`
- `ctr`
- `finch`

Or a Kubernetes cluster, which implies one.

## What was measured, and when

A probe searched **8 runtimes** on the PATH and in every
known install location, on this commit. None responded.

| Runtime | Kind | Present | Usable |
|---|---|---|---|
| `docker` | container-runtime | absent | no |
| `podman` | container-runtime | absent | no |
| `nerdctl` | container-runtime | absent | no |
| `ctr` | container-runtime | absent | no |
| `finch` | container-runtime | absent | no |
| `kubectl` | orchestrator | absent | no |
| `kind` | orchestrator | absent | no |
| `minikube` | orchestrator | absent | no |

**The blocker is a measurement, not an assumption.** It had been carried as a stated
sentence from M2.5 to M2.8; a stated blocker is an assertion, which R-13.1 does not
accept as evidence.

## Blocked by E-2

13 properties need **only** a container runtime. Obtaining one closes every one of them.

| # | Property | Evidence set |
|---|---|---|
| **E-2** | Execution Plane generated AND DEPLOYED to a customer tenancy | operational |
| **K-15** | deployment guides reproduce successfully | customer-success |
| **G-1** | the platform runs in a deployed production environment | production |
| **GA-1** | deployment replay passes | deployment |
| **GA-2** | restart replay passes against a deployed runtime | deployment |
| **GA-3** | recovery replay passes against a deployed runtime | deployment |
| **GA-4** | security replay passes against a deployed runtime | deployment |
| **GA-5** | performance replay passes against a deployed runtime | deployment |
| **GA-6** | tenant isolation replay passes against a deployed runtime | deployment |
| **GA-7** | observability replay passes against a deployed runtime | deployment |
| **GA-8** | operational replay passes against a deployed runtime | deployment |
| **GA-9** | container startup, shutdown, restart, upgrade and rollback | deployment |
| **GA-10** | certificate, signing key and configuration persistence across a container restart | deployment |

## Blocked by E-2 AND something further

3 properties need a deployment **and** something a deployment does not supply.
Obtaining a runtime is necessary for these and not sufficient.

| # | Property | Also needs |
|---|---|---|
| **G-2** | performance under production load and concurrency | a horizontally scaled deployment AND production load |
| **G-3** | SLO attainment over a real measurement window | a deployment AND a 30-day window of real traffic |
| **G-4** | incident detection in production, and detection source | a deployment AND a production incident to detect |

## NOT blocked by E-2 — and therefore not closed by GA

**4 properties remain unmeasured for reasons that have nothing to do
with a container runtime.** Certifying General Availability would **not** close them,
and this register states so explicitly so that a future reader cannot infer otherwise.

| # | Property | Needs |
|---|---|---|
| **K-12** | a customer completes onboarding in under 30 minutes | an observed customer. The automated path is already measured |
| **K-13** | generated example test suites execute successfully | Playwright, Selenium, JUnit, NUnit and pytest installed |
| **K-14** | installation validated on a clean environment for every supported target | a clean-environment runner per language |
| **G-5** | shared nonce store in a horizontally scaled deployment | a shared nonce store implementation — a deployment-topology decision (D-003). A container runtime does NOT provide one |

**This is the one place the mission's framing needed qualifying.** E-2 is the only
blocker to the *GA determination* — every `GA-*` replay names it, and nothing else
gates the determination. It is **not** the only outstanding item in the programme, and
recording it as such would have created exactly the false impression this register
exists to prevent.

## Expected sequence

```
acquire a container runtime
        ↓
node governance/deployment/run-deployment-probe.mjs      → E-2
        ↓
replay the certification suites against the deployment   → GA-1 … GA-10
        ↓
the GA determination recomputes itself
```

**No architecture change is required at any step.** No new milestone is required.

---

*Generated from `governance/deployment/evidence.json`.*
