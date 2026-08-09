# Backlog

**Last updated:** 2026-07-22

Work that is identified but **not yet scheduled into a milestone**. Scheduled work lives in `MASTER_IMPLEMENTATION_PLAN.md`; the immediate next step lives in `NEXT_ACTION.md`.

An item is promoted out of this file when it is assigned to a milestone. It is not worked on while it sits here.

---

## 1. Awaiting a decision

| # | Item | Blocked by |
|---|---|---|
| B-001 | Select language and runtime for both planes | AD-001 |
| B-002 | Select repository layout (monorepo per plane vs per-service) | AD-002 |
| B-003 | Select cross-plane transport and wire format | AD-003 |
| B-004 | Select the canonical integrity primitive | AD-004 |
| B-005 | Determine whether mobile execution is in scope | AD-007 |

## 2. Identified, not yet scheduled

| # | Item | Likely phase |
|---|---|---|
| B-006 | Knowledge graph design and storage model | P4 |
| B-007 | Reporting and evidence presentation surface | P7 |
| B-008 | Tenant onboarding flow and self-service provisioning | ~~P9~~ → **promoted to active** by [ADR-0030](../docs/adr/ADR-0030-tenant-lifecycle-management-orchestration.md); Platform Core onboarding orchestrator (TLM) |
| B-009 | Cost model and AI spend controls per tenant | P9 |
| B-010 | Observability: tracing, metrics, structured audit | P4/P5 |
| B-011 | Disaster recovery and evidence durability guarantees | P10 |
| B-012 | Performance budgets and load characterisation | P10 |
| B-013 | Secret backend integration (beyond references) | P5 |
| B-014 | Supply-chain pipeline: scan, SBOM, signing | P10 |
| B-015 | Certification report generation and attestation format | P10 |
| B-016 | **Authoring purity gate before the package is sealed** — the reference hard-fails on domain contamination at six points (`qa.agent.js:528,534`; `generate-playwright.js:1060,1091`; `agentOrchestrator.js:209,373`), each with exit code 2 and none soft-failed. [ADR-0086](../docs/adr/ADR-0086-reference-output-parity-as-domain-depth.md) §4.3 scoped this as G-10 and **it was not delivered** — it is a `contract/package-governance.ts` change, not domain depth, and folding it into a domain would have put a sealing-time gate inside a planning stage. | after ADR-0086 |
| B-017 | **Write idempotency on the synchronisation path** — the reference caches ADO writes so a retry cannot duplicate test cases (`agentOrchestrator.js:428-446`). ADR-0086 §4.6 **placed** this as G-12 rather than closing it: in EP/IP the external writes are `synchronisation`'s, through the connectors, so a checkpoint inside a planning domain would guard nothing that writes. | after ADR-0086 |

## 3. Deliberately out of scope

Recorded to prevent re-litigation.

| Item | Reason |
|---|---|
| Migrating any legacy code | D-001, D-003 — this is a re-foundation |
| Backwards compatibility with legacy evidence packages | No production evidence exists to preserve |
| Supporting the legacy configuration schema | Superseded; configuration is re-derived in M2.4 |
| Building all six capabilities in parallel | R-008 — guarantees divergent architectures |

## 4. Intake rule

An item enters the backlog with a **statement of what it is** and **why it matters**. Items are not added speculatively — an empty backlog is a healthy signal, and a large one is a symptom of deferred decisions rather than of thoroughness.
