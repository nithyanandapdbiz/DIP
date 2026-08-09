# 09 — Data Flow Model

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.3
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 6 and 9

**This document owns:** what data moves where, under what authority, and with what transformation.
**It does not own:** classification and retention ([06](06-data-sovereignty.md)), isolation ([07](07-tenant-isolation.md)), transport and direction ([05](05-cross-plane-communication.md)), or evidence semantics ([10](10-evidence-flow-model.md)).

---

## 1. The five flows

Every movement of data in the platform is one of exactly five flows. **A movement that is not one of these is a violation.**

| # | Flow | Direction | Contents | Authority |
|---|---|---|---|---|
| **F1** | Context request | EP → IP | Scrubbed, minimised C3 | Tenant configuration + authorising ADR |
| **F2** | Package delivery | IP → EP | Execution package (C5), signed | Tenant is `ACTIVE` and policy permits |
| **F3** | Result return | EP → IP | Results, evidence **references**, hashes (C3/C4) | Same as F1 |
| **F4** | Certification | IP → EP | Decision, verdict, refusal reason (C4) | Deterministic gate evaluation |
| **F5** | Execution | EP → customer systems | Whatever the package directs | Customer-held credentials, least privilege |

**R-09.1** F1 and F3 SHALL carry no C1 payload and no C2 material, in any environment.

**R-09.2** F5 never crosses a sovereignty boundary — it is entirely within the customer's tenancy.

**R-09.3** There is no flow from the Intelligence Plane into customer systems. **No sixth flow exists**, and none may be added without an approved ADR amending Rule 3.

## 2. The transformation pipeline on egress

**R-09.4** Data leaving the customer tenancy SHALL pass through this pipeline, **in this order**. No stage may be skipped or reordered.

```
capture ──▶ classify ──▶ minimise ──▶ scrub ──▶ validate ──▶ transmit
                            │           │          │
                     allow-list only   PII      schema +
                                    removed    no-secrets guard
```

| Stage | Obligation |
|---|---|
| **Classify** | Assign exactly one classification at capture ([06](06-data-sovereignty.md)) |
| **Minimise** | Field-level **allow-list**. Only enumerated fields survive |
| **Scrub** | PII removal, applied on the **write path**, before anything is persisted |
| **Validate** | Schema validation plus an independent secret-shaped-value guard |
| **Transmit** | Through the single cross-plane client (R-05.3) |

**R-09.5** Minimisation SHALL be an allow-list. A deny-list is prohibited.

**R-09.6** The no-secrets guard SHALL be **independent of the schema**, so a schema error cannot disable it.

**Rationale for R-09.6.** A guard implemented as a schema constraint fails whenever the schema is wrong — which is precisely the situation in which unexpected data is present. The guard must hold when the schema does not.

**Rationale for scrubbing before persistence.** Scrubbing at the transmit boundary leaves the unscrubbed data on the customer's disk in the meantime. Scrubbing on write means it never exists.

## 3. Authority

**R-09.7** Every flow SHALL have an identifiable authority permitting it. **Absence of a prohibition is not authority.**

**R-09.8** F1 and F3 require a named ADR recorded in the transmitting module's own source ([06](06-data-sovereignty.md) §2).

**R-09.9** F2 requires the tenant to be `ACTIVE`. Any other state produces a refusal ([21](21-tenant-lifecycle.md) §2).

**R-09.10** Authority SHALL be evaluated at the Policy Decision Point, not at the call site (R-03.6).

## 4. What never flows

**R-09.11** The following SHALL NOT cross TB1 under any circumstance, in any environment, including diagnostics, error payloads, traces, and support bundles:

| Never | Rule |
|---|---|
| C2 — credentials, tokens, keys, connection strings | R-06.2, INV-2 |
| C1 payloads — screenshots, DOM captures, request/response bodies | R-06.1 |
| Evidence payloads (as distinct from references and hashes) | R-9.1, INV-1 |
| Any field not on the minimisation allow-list | R-09.5 |
| Unscrubbed data of any classification | R-09.4 |

**R-09.12** Diagnostic and support paths SHALL be subject to the same egress pipeline as application paths.

**R-09.12 closes the path most likely to be forgotten.** Support bundles, debug dumps, and crash reports are written under time pressure, by people trying to solve a problem, and they routinely serialise whole objects. They are the single most probable route by which C1 or C2 material leaves a customer tenancy, and they are almost never covered by the checks written for the application path.

## 5. Ephemerality in the Intelligence Plane

**R-09.13** C1 and C3 data received via F1 or F3 SHALL be **ephemeral** — held for the duration of the request and not persisted (R-06.9).

**R-09.14** What persists from a run is the **decision and the hashes** (C4), never the material that was reasoned over.

**R-09.15** Request-scoped data SHALL be released deterministically at request completion, not left to garbage collection.

## 6. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-09.1** | Every cross-boundary movement is one of the five declared flows | Flow inventory gate over the cross-plane client |
| **C-09.2** | No sixth flow exists; nothing in the Intelligence Plane initiates toward customer systems | Egress-direction gate |
| **C-09.3** | The egress pipeline stages execute in order, with none skipped | Pipeline order test |
| **C-09.4** | Minimisation is allow-list based | Schema inspection gate |
| **C-09.5** | The no-secrets guard operates independently of schema validation | Guard test with a deliberately broken schema |
| **C-09.6** | Scrubbing occurs before persistence | Raw-storage read test asserting absence |
| **C-09.7** | Every F1/F3 transmitting module records its authorising ADR in source | Source-annotation gate |
| **C-09.8** | A non-`ACTIVE` tenant produces refusal on F2 | Per-state negative test |
| **C-09.9** | No C1 payload, C2 material, or evidence payload appears in any outbound message | Outbound content gate across all sinks |
| **C-09.10** | Diagnostic and support paths pass through the same egress pipeline | Support-bundle content test |
| **C-09.11** | No C1/C3 data persists in the Intelligence Plane past request completion | Post-request persistence scan |
| **C-09.12** | Request-scoped data is released deterministically | Lifetime test |

**C-09.5 is deliberately adversarial.** It breaks the schema on purpose and asserts the secret guard still fires. A guard that only works when everything else is correct is not a guard — it is a second copy of the schema.

## 7. Open items

| # | Item | Target |
|---|---|---|
| **AD-023** | The PII detection and scrubbing strategy, and its false-negative posture | M1.5 |

**AD-023 needs an explicit false-negative position.** No scrubber is perfect, so the architecture must state what happens when detection fails: whether the field is transmitted, dropped, or the request refused. Leaving this to the implementation means the answer will be "transmitted," because that is what every unhandled case does.
