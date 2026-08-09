# General Availability — certification determination

## STATUS: NOT CERTIFIED

**Reason:** Deployment evidence unavailable. E-2 is NOT MEASURED because no container runtime exists in this environment.

This determination is **computed** from E-2 by a single expression. No flag, override
or configuration can set it while E-2 is anything other than `PASS`, and a governance
gate refuses any document in this repository that claims otherwise — proven by
planting exactly such a document and observing the gate fail.

## What was measured

| Runtime | Kind | Present | Usable | Detail |
|---|---|---|---|---|
| `docker` | container-runtime | absent | no | not found on the PATH or in any known install location |
| `podman` | container-runtime | absent | no | not found on the PATH or in any known install location |
| `nerdctl` | container-runtime | absent | no | not found on the PATH or in any known install location |
| `ctr` | container-runtime | absent | no | not found on the PATH or in any known install location |
| `finch` | container-runtime | absent | no | not found on the PATH or in any known install location |
| `kubectl` | orchestrator | absent | no | not found on the PATH or in any known install location |
| `kind` | orchestrator | absent | no | not found on the PATH or in any known install location |
| `minikube` | orchestrator | absent | no | not found on the PATH or in any known install location |

**8 runtimes searched** on the PATH and in every known install location.
None responded.

This is a measurement, not an assumption. *"Docker is unavailable"* was carried as a
stated blocker from M2.5 through M2.8, and a stated blocker is an assertion — which
R-13.1 does not accept as evidence. It is now the output of a probe that runs on every
build, so if a runtime appears the blocker disappears without anyone editing anything.

## What cannot be measured, and why

| # | Property |
|---|---|
| **E-2** | the Intelligence Plane image builds, starts, and serves a real request (C-17.3) |
| **GA-1** | deployment replay passes |
| **GA-2** | restart replay passes against a deployed runtime |
| **GA-3** | recovery replay passes against a deployed runtime |
| **GA-4** | security replay passes against a deployed runtime |
| **GA-5** | performance replay passes against a deployed runtime |
| **GA-6** | tenant isolation replay passes against a deployed runtime |
| **GA-7** | observability replay passes against a deployed runtime |
| **GA-8** | operational replay passes against a deployed runtime |
| **GA-9** | container startup, shutdown, restart, upgrade and rollback |
| **GA-10** | certificate, signing key and configuration persistence across a container restart |

**Every one is a measurement of a running deployment.** None can be inferred from the
in-process evidence M2.6–M2.8 produced, however complete that evidence is. Document 17
states the principle directly — *an image that builds is not an image that runs* — and
this image has done neither.

## Where the requested outputs live

The mission requested eight documents. Six are replay reports **against a deployed
runtime**, and none can contain a measurement. Rather than publish six documents that
each repeat the same sentence, their content is consolidated here and in the
deployment validation report — one topic, one home.

| Requested output | Where |
|---|---|
| General Availability Certification Report | **This document** |
| Deployment Validation Report | [DEPLOYMENT-VALIDATION-REPORT.md](DEPLOYMENT-VALIDATION-REPORT.md) |
| Deployment Evidence Package | [DEPLOYMENT-EVIDENCE-PACKAGE.md](DEPLOYMENT-EVIDENCE-PACKAGE.md) |
| Operational Replay Report | `NOT MEASURED` — GA-8. In-process equivalent: `docs/production/` |
| Security Replay Report | `NOT MEASURED` — GA-4. In-process: `docs/production/SECURITY-MONITORING-REPORT.md` |
| Performance Validation Report | `NOT MEASURED` — GA-5. In-process: `docs/production/PERFORMANCE-BENCHMARK-REPORT.md` |
| Failure Recovery Report | `NOT MEASURED` — GA-3. In-process: `docs/production/RESILIENCE-VALIDATION-REPORT.md` |
| Updated Certification Record | [M2.8 record](../certification/M2.8-PRODUCTION-READINESS-CERTIFICATION.md) — unchanged; this determination supersedes nothing |

**The in-process equivalents are not substitutes.** They measure the same behaviours
in a test process. Whether those behaviours survive containerisation, orchestration, a
restart and a volume mount is precisely what is unmeasured.

---

*Generated from the deployment probe · 8 runtimes searched · digest 51f83e5f9c20392230768106…*
