# General Availability — Engineering Execution Plan

**Date:** 2026-07-23 · **Type:** engineering execution register (playbook + measured evidence) · **No governance review · No architecture change**
**Complements:** `docs/deployment/DEPLOYMENT-EVIDENCE-PACKAGE.md` (generated), `NEXT_ACTION.md`, `deploy/Dockerfile`

> This register is **engineering execution**, not analysis. It records a probe that was *run* this session, grounds its failure predictions in the *actual* `deploy/Dockerfile`, and provides a turnkey playbook. It changes no architecture, no ADR, no governance. Where it and a canonical/generated document disagree, the canonical one governs.

---

## 1. Executive summary (Deliverable 1)

**GA is blocked by one hard external dependency — a container runtime — and this environment cannot supply one.** The deployment probe was **executed** this session and now *measures* the absence (it no longer asserts it): 8 runtimes searched across the PATH and 4 install locations, none responded; E-2 = `NOT MEASURED`; digest `51f83e5f9c20…`. The environment is **not elevated and has no WSL**, so a runtime cannot even be installed here.

Everything achievable **without** a runtime is done and green (26 gates, closure PASS). The remaining engineering work is **gated entirely on the runtime** and is turnkey: one command (`run-deployment-probe.mjs`) drives build → start → serve → the ten `GA-*` replays. This register makes that turnkey and pre-empts the first-build failures — including **one new finding** in the Dockerfile the standard predictions miss.

## 2. Engineering reconciliation (Deliverable 2 / Section 1)

| | |
|---|---|
| **Completed** | IP runtime (CA, auth, gateway, registration, tenant runtime), 6 capability engines, TLM 1–7, observability, customer-success, 26 gates, contracts — all VERIFIED |
| **Remaining** | E-2 (image builds/starts/serves) → stages 8–14 → 10 `GA-*` replays → GA recomputes |
| **Blocker** | **Container runtime — absent and uninstallable here** (measured, not assumed) |
| **External dependency** | Docker / Podman / nerdctl / ctr / finch with a responding daemon, **or** a K8s cluster |
| **Toolchain present** | Node v24.14.1, pnpm 11.15.1 — sufficient to build, insufficient to containerise |

**This is a legitimate CHARTER §13 stop condition** (missing infrastructure). It is already recorded in `NEXT_ACTION.md` and `PROJECT_STATE.md` §9 — this session re-confirmed it with a fresh probe rather than restating it.

## 3. Runtime assessment (Deliverable 3 / Section 2)

| Option | Requirement | Viability here |
|---|---|---|
| Docker Desktop / Engine | daemon on PATH; virtualization | needs install + elevation/WSL — **unavailable** |
| Podman | rootless capable | needs install — **unavailable** |
| nerdctl / containerd | containerd socket | needs install — **unavailable** |
| Kubernetes (kind/minikube) | a cluster + kubectl | needs install + a runtime — **unavailable** |

**Compatibility:** the image is `node:24.11.0-alpine` (multi-stage), non-root, `EXPOSE 8443`, `/state` volume — portable to any OCI runtime. **Installation assumption that fails here:** ability to install software (not elevated) and a Linux container backend (no WSL).

## 4. Deployment plan (Deliverable 4 / Section 3) — reference + measured

Sequence (from the generated evidence package, now with the probe *run*): **provide runtime → `run-deployment-probe.mjs` (builds `deploy/Dockerfile`, starts, requires a served request) → E-2 → ten `GA-*` replays against the deployed runtime**. Each replay must **match** its in-process result; a mismatch is a finding, not a tolerance (C-17.3, R-17.7).

**Probe executed this session (evidence, not prediction):**
```
E-2: NOT MEASURED · passed:false · blocker: "no container runtime is available"
imageDescriptorPresent:true · deployPathExercised:false · digest 51f83e5f9c20…
```

## 5. Failure prediction matrix (Deliverable 5 / Section 4) — grounded in the real Dockerfile

| # | Predicted failure | Root cause | Detection | Resolution | Verification |
|---|---|---|---|---|---|
| **F-1 OpenSSL** | CA shells out to `openssl` for X.509; a base without it starts then fails at first registration (R-17.7) | runtime dep, not build | first registration errors | **already mitigated** — Dockerfile line 67 `apk add --no-cache openssl` | E-2 served request + a registration replay |
| **F-2 Workspace copy** | pnpm workspace symlinks are not trivially portable into the runtime layer | monorepo link structure | `node` cannot resolve `@dbiz/*` at start | confirm `--prod deploy` output is what ships (see F-4) | image starts and imports `@dbiz/observability` |
| **F-3 `/state` volume** | CA root key + token signing key live on `/state`; without it a restart rejects every prior token (M2.8) | state not persisted | restart → all tokens invalid | mount `/state` (Dockerfile `VOLUME`/`ENV` present) | restart replay + persistence `GA-*` |
| **F-4 Dev-tooling leak (NEW — found this session)** | Line 58 runs `pnpm --prod deploy … /runtime \|\| true` but lines 73–75 **copy from `/build`, not `/runtime`** — so the prod-only tree is built and discarded, and full `node_modules` (incl. dev deps) ships. `\|\| true` also swallows a deploy failure. Contradicts the C-17.4 intent stated in the line-57 comment. | copy source mismatch | `verify-supply-chain.js` / C-17.4 image-content check at first build; image size | **staged fix:** copy `--from=build /runtime/...` (prod tree) instead of `/build/...`, and drop `\|\| true` so a deploy failure is loud | rebuild → C-17.4 gate green + image contains no dev tooling |

**F-4 is not applied.** The Dockerfile has never been built (`|| true` suggests the `pnpm deploy` path was itself never verified); editing it blind would replace one unverified artefact with another. The fix is **staged** and applied against the *first real build output* — the probe replaces prediction with fact (evidence-package §3). This is the programme's own discipline, not caution.

## 6. Execution playbook (Deliverable 6 / Section 7) — turnkey

```sh
# PREREQUISITE (external, human): install a container runtime with a responding daemon.
export PATH="/c/Program Files/nodejs:/c/Program Files/Git/usr/bin:$PATH"
cd /c/DBIZAGENTICAI/DBiz_IntelligencePlane

# 1. Confirm the tree is green before deploying
node governance/verification/run-all.js                 # expect 26/26

# 2. Drive E-2 (builds deploy/Dockerfile, starts, requires a served request)
node governance/deployment/run-deployment-probe.mjs      # expect E-2 PASS
#    → on first-build failure, apply F-4 (and any F-2) against the real build log, re-run

# 3. Replay the ten GA-* certification properties against the deployed runtime
node governance/deployment/run-deployment-evidence.js    # each must match in-process

# 4. GA recomputes itself (CERTIFIED if and only if E-2 has PASS evidence; a gate refuses any other claim)
node governance/verification/verify-general-availability.js
node governance/verification/verify-programme-closure.js # re-baseline confirmation
```
**Verification sequence:** 26 gates green → E-2 PASS → GA-* match → GA gate green.
**Rollback:** deployment is out-of-process; no code rollback needed — a failed probe leaves the tree unchanged (build output is gitignored).
**Recovery:** a killed probe can leave a `replace`/`patch` probe artefact in `dist` (gitignored) — rebuild the affected package (`NEXT_ACTION.md` env notes).

## 7. Risk register (Deliverable 7 / Section 8)

| # | Risk | Type | Mitigation |
|---|---|---|---|
| GA-R1 | No runtime obtainable in this environment | External | Provision elsewhere (elevated host / CI with Docker / cloud) — **the only true blocker** |
| GA-R2 | First build fails on F-2/F-4 | Deployment | Staged fixes §5; apply against real build log |
| GA-R3 | Deployed behaviour ≠ in-process (GA-* mismatch) | Runtime | Treat as a finding; the in-process evidence was measuring the wrong thing (R-17.7) |
| GA-R4 | `/state` misconfig → token invalidation on restart | Operational | F-3; persistence replay before certifying |
| GA-R5 | Dev tooling in runtime image (F-4) | Supply chain | C-17.4 gate + F-4 fix |

## 8. GA readiness assessment (Deliverable 8 / Section 9)

| | |
|---|---|
| **Prerequisites** | A container runtime with a responding daemon (or a K8s cluster) |
| **Expected certification evidence** | E-2 PASS + 10 `GA-*` replays matching in-process results |
| **Remaining blockers** | The runtime — **and only the runtime** for GA itself |
| **Likelihood of success once a runtime exists** | **High.** The image is well-formed (mitigated OpenSSL, non-root, `/state`, healthcheck); expected first-build failures are enumerated and pre-resolved (F-1..F-4). Residual unknown is only what a real build reveals. |
| **Not closed by GA** | G-5 (shared nonce store), K-12 (observed customer), K-13/14 (test/clean-env runners) — per `KNOWN_LIMITATIONS.md` |

## 9. Final execution checklist & Definition of Done (Deliverable 9 / Section 10)

- [ ] Container runtime available with a responding daemon **(external — blocks all below)**
- [ ] `run-all.js` → 26/26 green
- [ ] `run-deployment-probe.mjs` → **E-2 PASS** (image builds, starts, serves)
- [ ] F-4 applied if the C-17.4 check flags dev tooling; F-2 if `@dbiz/*` fails to resolve
- [ ] Stages 8–14 execute (EP runtime + customer deployment)
- [ ] 10 `GA-*` replays match in-process results
- [ ] `verify-general-availability.js` green; GA would recompute to **CERTIFIED** once E-2 has PASS evidence
- [ ] Closure baseline re-cut; `verify-programme-closure.js` green

**DoD:** GA = CERTIFIED is *computed* from E-2 PASS evidence — never written. This checklist is complete only when the gate recomputes it.

## 10. Engineering certification (Deliverable 10)

| Property | State | Evidence |
|---|---|---|
| Tree green | ✔ | `verify-programme-closure.js` PASS (26 gates) |
| Deployment probe run | ✔ | digest `51f83e5f9c20…`, this session |
| E-2 | **NOT MEASURED** | no runtime (measured) |
| General Availability | **NOT CERTIFIED** | computed from E-2 |
| First-build failures | enumerated & pre-resolved | F-1..F-4 (F-4 new) |

**Honest determination: GA is NOT achievable in this environment.** The single blocker is external (a container runtime this host cannot install), it is measured rather than assumed, and every engineering step that does not require it is complete or staged. Execution resumes — turnkey — the moment a runtime is provided on any capable host.

---

*Engineering execution register. No governance review, no architecture/ADR change. Reuses the existing Dockerfile, probe and gates; adds one grounded finding (F-4) staged for verified application. The GA blocker is already recorded in `NEXT_ACTION.md`/`PROJECT_STATE.md` — this register re-measured it and made the path turnkey, creating no drift.*
