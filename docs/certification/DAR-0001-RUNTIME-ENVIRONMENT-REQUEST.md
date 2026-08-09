# DAR-0001 — Request for First Canonical Functional Testing Runtime Environment

**Document type:** Operational Request (Deployment Activation Request) · **Date raised:** 2026-07-29 · **Status:** OPEN — awaiting external response

> **This document is not an ADR, not an implementation authorization, and not an execution
> authorization.** It requests the external infrastructure required to activate the completed
> Functional Testing engineering programme. **No software, architecture, contract, or
> governance change is requested, and no deployment shall occur until the requested
> infrastructure is available.** The "Requested Response" fields are intentionally left
> blank — they are for the receiving teams to complete; nothing in them is assumed or
> fabricated here.

---

## Background

The Functional Testing Engineering Programme (ADR-0039 … ADR-0054) is complete; **PCR-0001**
formally closed it. **OP-0001** remains **EXECUTION DEFERRED** because mandatory external
infrastructure does not exist (verified: E-2 NOT MEASURED — no container runtime; the
Execution Plane is the separate customer-owned plane; the ADR-0050 ports are unbound; no
approvals). **No repository implementation work remains.**

## Purpose

Request provisioning of the external environment required to begin operational validation,
from **Infrastructure, DevOps, Customer Operations, and Governance**. This is a request for
prerequisites only — **no software changes are requested.**

## Requested Infrastructure

**Priority 1 — Container Runtime (E-2)** — *the terminal blocker; nothing downstream can begin without it.*
- ☐ Docker / Podman / supported OCI runtime
- ☐ Host provisioning
- ☐ Network connectivity
- ☐ Persistent storage
- ☐ Environment configuration

**Priority 2 — Execution Plane** *(customer-owned)*
- ☐ Non-production Execution Plane deployment
- ☐ Reachability from the runtime
- ☐ Authentication
- ☐ Signing-key exchange (trust-anchor publication)
- ☐ Health endpoint

**Priority 3 — Operational Services**
- ☐ Evidence storage *(Execution-Plane custody; evidence-by-reference, INV-1)*
- ☐ Log aggregation
- ☐ Monitoring
- ☐ Metrics
- ☐ Correlation
- ☐ Alerting

**Priority 4 — Security**
- ☐ Certificates
- ☐ Secrets
- ☐ Key management
- ☐ Identity
- ☐ Access approval

## Requested Governance

- ☐ Operational Approval
- ☐ Change Approval
- ☐ Customer Approval
- ☐ Rollback Approval

## Requested Validation (authorize only after infrastructure exists)

1. ☐ Deployment of the certified package (ADR-0052 runbook — no code/config redesign).
2. ☐ Binding of the ADR-0050 runtime ports to real infrastructure.
3. ☐ Execution of OP-0001 Phase 1 (Deployment).
4. ☐ M4.5 validation (first runtime execution).
5. ☐ Behavioural equivalence (legacy vs canonical).
6. ☐ M5 decision (evidence-based; no automatic cut-over).

## Current Status

| Dimension | Status |
|---|---|
| Engineering | **COMPLETE** |
| Operational Preparation | **COMPLETE** |
| Operational Execution | **NOT STARTED** |
| GA | **NOT CERTIFIED** |
| Legacy Runtime | **ACTIVE** |

## Engineering Evidence (references)

- ADR-0039 … ADR-0054 — `docs/adr/`
- Programme closure — `docs/certification/PCR-0001-FUNCTIONAL-TESTING-PROGRAMME-CLOSURE.md`
- First-execution deferral — OP-0001 (recorded in `program/PROJECT_STATE.md`)
- Deployment package — `docs/certification/ADR-0052-FIRST-RUNTIME-DEPLOYMENT.md`
- Operational handover — `docs/certification/ADR-0054-OPERATIONAL-HANDOVER.md`
- Repository governance reconciliation — `docs/certification/ADR-0053-REPOSITORY-GOVERNANCE-RECONCILIATION.md`

*Integrity note (for accuracy, not action): the Functional Testing programme's architecture, implementation, contracts, and certifications are intact and unchanged. Any transient RED on the shared `programme-closure` gate is concurrent-workstream baseline housekeeping (ADR-0060 provider-platform) and is unrelated to this request; it is that workstream's to reconcile.*

## Requested Response (to be completed by the receiving teams)

- ☐ Infrastructure available: __________
- ☐ Expected provisioning date: __________
- ☐ Environment owner: __________
- ☐ Operations contact: __________
- ☐ Customer contact: __________
- ☐ Execution Plane endpoint: __________
- ☐ Runtime endpoint: __________
- ☐ Deployment window: __________

---

**No implementation, architecture, or governance changes are requested. No deployment shall
occur until the requested infrastructure is available. Once the requested environment exists,
OP-0001 becomes executable and the operational validation programme may begin.**
