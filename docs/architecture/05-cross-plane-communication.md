# 05 — Cross-Plane Communication

**Status:** **FROZEN** · **Version:** 1.3 · **Date:** 2026-08-06 · **Milestone:** P1 / M1.2
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 5 and 10
**Amendments:** v1.1 — package retrieval recorded, and **R-05.5 amended from three result classes to four** by [ADR-0078](../adr/ADR-0078-package-retrieval-recorded-in-architecture.md), executing [ADR-0070](../adr/ADR-0070-execution-package-retrieval-inversion.md) §6 step 1. R-05.21–R-05.25, C-05.10–C-05.12, one degradation-matrix row and AD-043 are additive; **R-05.5 is not** — it declared three classes exhaustive and a fourth is mandatory under retrieval (ADR-0078 §4.1)
**Amendments:** v1.2 — **AD-043 is CLOSED** by [ADR-0080](../adr/ADR-0080-work-request-exchange.md), which also **amends [ADR-0070](../adr/ADR-0070-execution-package-retrieval-inversion.md) P-70.2**. **R-05.26–R-05.28 are additive**; no existing rule is amended and the result taxonomy is untouched — **R-05.5 stays at four, and ADR-0080 P-80.3 is why**. §9's *"sole Execution-Plane-initiated route"* count is corrected below; **the remainder of that residue is D-112 and is NOT repaired here** (ADR-0080 §5.2)
**Amendments:** v1.3 — **a SECOND design law is recorded beside R-05.27**, on the axis the first one does not cover: *a port may be declared and left unimplemented only if its empty case fails CLOSED.* **NO RULE IS ADDED, AMENDED OR WITHDRAWN** — R-05.26–R-05.28 are untouched, the taxonomy stays at four, no criterion is added and no gate count moves. It is a **design law derived from R-05.27 as it already stands**, recorded at the rule that yields it because the shape it governs is the one R-05.27 fixes. Its occasion is the ruling that `GET /api/tenants/{slug}/work` stays unmounted rather than shipping behind an unimplemented `PendingWorkSource` (`TECHNICAL_DEBT.md` **D-115**)

**This document owns:** direction, transport, the result taxonomy, retry semantics, and the degradation matrix.
**It does not own:** message contents or wire format ([20](20-cross-plane-contracts.md)), what data may cross ([06](06-data-sovereignty.md), [09](09-data-flow-model.md)), or authentication design ([08](08-security-model.md)).

---

## 1. Direction

**R-5.1 restated in operational terms.** Every cross-plane interaction is **initiated by the Execution Plane**, travels **customer tenancy → DBiz**, and is **synchronous request/response**.

```
   Customer tenancy                     DBiz tenancy
  ┌─────────────────┐                 ┌─────────────────┐
  │ Execution Plane │ ──── request ──▶│ Intelligence    │
  │                 │ ◀─── response ──│ Plane           │
  └─────────────────┘                 └─────────────────┘
        initiator                          responder
```

**R-05.1** There SHALL be no callback, webhook, queue, subscription, polling endpoint, or long-lived socket originating in the Intelligence Plane.

**R-05.2** The customer SHALL NOT be required to open any inbound network path to DBiz.

**R-05.21** Retrieval of a sealed execution package is a **separate Execution-Plane-initiated exchange**, keyed by the package's content hash ([20](20-cross-plane-contracts.md) §R-20.28). It is idempotent and repeatable, and the Intelligence Plane holds **no delivery state** for it: an Execution Plane that crashes mid-execution re-fetches by the hash it already holds, without re-requesting work.

**The Intelligence Plane never delivers** (ADR-0070 P-70.1). Its obligation ends when a sealed package exists and is retrievable; it opens no connection toward a customer tenancy for delivery or for any other purpose. **Which Execution-Plane-initiated exchange carries the package hash to the Execution Plane in the first place is settled at R-05.26–R-05.28** — the work-request exchange, closed as AD-043 by [ADR-0080](../adr/ADR-0080-work-request-exchange.md) (§9). **What was already settled before it, and did not depend on it, is that the exchange is Execution-Plane-initiated, because R-05.1 admits no alternative** — and that is why the rule could be recorded here while the mechanism was still undesigned.

**R-05.26** The Execution Plane learns which package to retrieve on a **separate Execution-Plane-initiated work-request exchange** ([ADR-0080](../adr/ADR-0080-work-request-exchange.md) P-80.2). It is tenant-scoped in its path, so it is authorised by the controls the tenant surface already applies rather than by a block written for it — the opposite of retrieval's shape, and for the opposite reason: retrieval must not name a tenant (P-70.4), and this must.

**R-05.27** The work-request response is a **COLLECTION**, and an empty collection is a **Success** under R-05.5 — not a Refusal, not an Unavailability. **An Execution Plane with no work pending SHALL NOT be refused, and SHALL NOT halt.** A singular resource would make absence a 404, which R-05.24 classifies as a Refusal and §5's matrix HALTs; **the shape is therefore load-bearing on the taxonomy and is fixed here rather than left to an implementation.**

> **The design law this records, which binds every future exchange and not only this one.** **R-05.5 is closed at four. Where a response shape forces a fifth result class, the SHAPE is wrong — not the taxonomy.** The taxonomy classifies *how an exchange concluded*; it is not where *what the answer contained* is recorded. An exchange that finds itself needing a fifth class SHALL first be re-examined for this shape, and SHALL NOT propose an amendment to R-05.5 until it has been. See [ADR-0080](../adr/ADR-0080-work-request-exchange.md) P-80.3.

> **THE SECOND DESIGN LAW THIS RULE YIELDS — THE ONE ABOUT DEFERRING THE IMPLEMENTATION BEHIND IT. Recorded 2026-08-06, from the decision NOT to mount the work-request route (`TECHNICAL_DEBT.md` D-115).**
>
> **A port MAY be declared and left unimplemented ONLY IF its unimplemented answer fails CLOSED** — only if the value it returns while nothing stands behind it is one the caller **must not act on**. **Where that answer is a Success, the port SHALL NOT be mounted until it is implemented.**
>
> **R-05.27 is precisely the case where it is not, which is why the law is recorded here.** An empty collection is a Success — a positive assertion that no work is pending — so a `PendingWorkSource` injected and unimplemented would answer **200 with an empty collection to every Execution Plane, forever, byte-identical to the truthful answer.** No test fails and no gate reddens, because nothing is broken: the shape does exactly what it was declared to do. **An absent route is a Refusal the caller can see; an unimplemented fail-open port is a lie it cannot.**
>
> **THE PATTERN IS THE SAME AND THE SAFETY IS OPPOSITE — THAT CONTRAST IS THE WHOLE OF THE LAW.** Injecting a port to land a shape ahead of its implementation is legitimate, and this platform does it: an unwired authenticator answers `501` (`auth-refusal.ts`, `AUTH_NOT_CONFIGURED`) and an unconfigured package store answers `501` (`package-retrieval.ts`, *"declared-but-unconfigured is 501, never 404"*). **Both are safe for one reason only — their empty case fails CLOSED, so the absence is visible in the response.** The identical construction over a Success-valued empty case is not deferral but **fabrication**.
>
> **THE TEST, TO BE APPLIED BEFORE REACHING FOR THE PATTERN AND NOT AFTER:** *what does this port return when nothing is behind it, and what result class is that value under R-05.5?* **A Refusal or an Unavailability — the pattern is available. A Success — it is not**, and the shape SHALL be left unmounted until something stands behind it. **The empty case's result class decides whether the port may be declared at all**; it is not a property of the port's interface, and it cannot be read off the type.

**R-05.28** Pending work SHALL be derived from state the Intelligence Plane holds for its own reasons — **runs without evidence** (R-20.12) — and **never from a record of what an Execution Plane has collected.** A collection record would be delivery state under another name, and it is what P-70.3 removed: an Execution Plane that crashes mid-execution re-asks and is told the same thing, because *what is pending* never depended on *what was fetched*. **No acknowledgement is required or sent** (R-20.31).

**Why one direction is non-negotiable.** Four independent reasons, each sufficient on its own:

| Reason | Consequence if relaxed |
|---|---|
| **Sovereignty** | A DBiz-initiated inbound connection into customer tenancy is precisely what the split exists to prevent |
| **Auditability** | One direction, one client, one protocol is provable. A bidirectional mesh is not |
| **No ambient authority** | A compromised Intelligence Plane still cannot act on customer systems — it can only answer questions it is asked |
| **Firewall posture** | The customer opens no inbound port. This is frequently the deciding factor in enterprise procurement |

## 2. One client

**R-05.3** All cross-plane traffic SHALL pass through **exactly one client module** in the Execution Plane.

**R-05.4** No other module may construct a cross-plane request.

**This is normative, not stylistic.** It means the entire cross-sovereignty attack surface is auditable in a single file. A reviewer can answer "what can leave the customer tenancy?" by reading one module, and a gate can assert it mechanically.

## 3. The result taxonomy

**R-05.5** The client SHALL return one of **four structurally distinct result types**. They are types, not status codes interpreted by callers.

| Result | Meaning | Required behaviour |
|---|---|---|
| **Success** | The Intelligence Plane answered | Proceed |
| **Refusal** | The Intelligence Plane **decided** not to permit this | **HALT** |
| **Unavailability** | The Intelligence Plane could not be reached or could not answer | **DEGRADE and continue** |
| **Integrity Failure** | The Intelligence Plane answered, and **what it returned failed verification** | **HALT** |

*Amended from three to four by [ADR-0078](../adr/ADR-0078-package-retrieval-recorded-in-architecture.md) P-78.2. The fourth class exists because retrieval separates the response from the artefact: under delivery they were one event, and a well-served worthless artefact had nowhere to appear.*

**R-05.6** Refusal SHALL NOT be retried. It is a decision, and retrying a decision is an attempt to obtain a different answer to the same question.

**R-05.7** Retry exhaustion SHALL yield **Unavailability**, and therefore degradation — never abort.

### 3.1 Why this is the most important rule in the document

Conflating refusal with unavailability is the single failure most likely to destroy the platform's value proposition, because the two demand **opposite** responses: one must stop the run, the other must not.

In the predecessor, one early return collapsed both into an abort. The result was that the Execution Plane aborted whenever the Intelligence Plane was unreachable — **including for the two capabilities that require no reasoning at all.** Its own assessment: *the architecture is correct; one early return contradicts it.*

**R-05.8** The two SHALL be distinguished at the type level such that a caller cannot handle one as the other. Where the language permits, this SHALL be structural impossibility rather than a test (C-0.1). **This applies to all four classes**, not only to Refusal and Unavailability.

### 3.2 Integrity Failure — the fourth boundary

**R-05.22** **Integrity Failure** is returned when the Intelligence Plane answered and the artefact it returned **failed verification** ([20](20-cross-plane-contracts.md) §R-20.29). The exchange succeeded; the artefact did not.

**R-05.23** Integrity Failure SHALL NOT be retried and SHALL NOT degrade. It **HALTs**, with assurance state `HALTED` — **including when a valid cached package is held.** A failed seal is evidence that the store or the channel is compromised, and the cached package came from the same store, so the failure impeaches it too. Executing the cache on that signal continues past a security event using the one artefact the event casts doubt on.

**R-05.24** Where the Intelligence Plane refuses a retrieval, the refusal is a **Refusal** under R-05.5 and its reason SHALL NOT distinguish "no such package" from "not yours" (ADR-0070 P-70.4 clause 3). The client SHALL NOT report either as fact.

**R-05.25** An Execution Plane whose verification fails SHALL send an **integrity report**. It is Execution-Plane-initiated like every other exchange (R-05.1); its shape, and the prohibition on it carrying any verdict, are [20](20-cross-plane-contracts.md) §R-20.30's.

**§3.1's rule, at the boundary retrieval creates.** §3.1 governs the boundary between *the responder decided* and *the responder could not be reached*. Retrieval adds a fourth: between **the responder answered** and **what it answered with can be trusted**. It is the same failure class and it is worse-behaved, because the predecessor's collapse produced an abort — visibly wrong, and it stopped. Here both classes that plausibly attract the outcome **continue**: Success proceeds to execute an artefact that failed verification, and Unavailability degrades past it. A taxonomy that cannot express a mandatory outcome does not omit it; it forces a wrong answer.

> **Three outcomes, and the client SHALL NOT collapse them.**
> *Could not reach the Intelligence Plane* ≠ *the Intelligence Plane refused* ≠ *the Intelligence Plane served a package that failed seal verification.* The first is Unavailability and degrades (R-05.5). The second is a decision and HALTs, unretried (R-05.6). The third is neither: the exchange succeeded and the artefact is untrustworthy — the Intelligence Plane was reached, decided nothing, and what came back cannot be executed. Degrading on it continues past a corrupt or forged artefact; retrying it asks a healthy responder the same question twice.
>
> **And under P-70.4 the client cannot recover a fourth distinction, deliberately.** Unknown-hash and unowned-hash are ONE signal from the Intelligence Plane, because distinguishing them turns retrieval into an oracle for the existence of another tenant's packages. The Execution Plane therefore cannot tell *"no such package"* from *"not yours"* — and SHALL NOT pretend to. A client that reports either as fact is reporting an inference the protocol was built to deny it. The refusal names the hash it declined, and stops.

## 4. The degradation matrix

**R-05.9** The Execution Plane's behaviour under Intelligence Plane unavailability is fully determined by this matrix. There are no other states.

| Intelligence Plane state | Cached package | Execution Plane behaviour | Assurance state |
|---|---|---|---|
| Available | — | Request fresh package → execute → return for certification | `CERTIFIED` |
| Unavailable | Valid | Execute the cached package; **queue evidence** for later certification | `DEGRADED` |
| Unavailable | Expired | Execute deterministic operations only; queue evidence | `DEGRADED — UNCERTIFIED` |
| Unavailable | None | Execute existing deterministic suites; **emit no verdict** | `DEGRADED — UNCERTIFIED` |
| **Refusal** | — | **HALT** with the refusal reason | `HALTED` |
| **Integrity Failure** | **Irrelevant — including a valid one** | **HALT**; do not execute the retrieved package, do not fall back to the cache, send the integrity report (R-05.25) | `HALTED` |

**R-05.10** In every degraded state, **testing continues and judgment waits**. Certification is queued, never skipped and never delegated (R-10.2).

**R-05.11** The Execution Plane SHALL NOT emit a verdict in any degraded state.

**R-05.12** Every result SHALL carry its assurance state as a **structural field**. A degraded result is a distinct type that the certification interface refuses to accept (R-10.3).

**Rationale for R-05.12.** An unlabelled degraded pass is worse than an outage. An outage is visible and someone responds to it; a silently degraded certification is a **false assurance that propagates into release decisions** — and is discovered, if ever, long after the release it authorised.

## 5. Retry and timeout semantics

**R-05.13** Retries SHALL use bounded exponential backoff with jitter, and a declared maximum attempt count.

**R-05.14** Every request SHALL carry a deadline. A deadline breach is **Unavailability**.

**R-05.15** Retry policy is configuration, not code (R-7.4), and is capability-named rather than tool-named (R-7.3).

**R-05.16** Retries SHALL be safe: a cross-plane request SHALL be idempotent with respect to its correlation identity, so a retried request cannot produce two execution packages for one run.

## 6. Transport and security posture

**R-05.17** Transport SHALL be mutually authenticated and encrypted in transit.

**R-05.18** The Execution Plane SHALL authenticate as its tenant. Tenant identity SHALL NOT be asserted by a caller-supplied field alone.

**R-05.19** Only credential **references** cross (INV-2). No secret material crosses in any environment, including diagnostics and error payloads.

**R-05.20** Outbound payloads SHALL be scrubbed and minimised **before transmission** (INV-6), on the write path rather than only at the boundary.

Threat model, authentication mechanism, and access control are owned by [08](08-security-model.md). What may cross is owned by [09](09-data-flow-model.md).

## 7. What crosses, in each direction

| Direction | Permitted | Prohibited |
|---|---|---|
| EP → IP | Scrubbed context, results, evidence **references** and hashes, contract version, tenant identity, package-retrieval requests by content hash (R-05.21), **integrity reports** ([20](20-cross-plane-contracts.md) §R-20.30) | Evidence payloads, customer data beyond authorised minimum, any secret material; **any verdict, assurance state or certification content on an integrity report** (R-12.5) |
| IP → EP | Execution package — authored, or **retrieved by hash** — certification decision, refusal reason, policy outcome | Anything requiring an inbound connection; any instruction to transmit secrets; **a refusal reason that distinguishes an unknown hash from an unowned one** (R-05.24) |

## 8. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-05.1** | Exactly one module constructs cross-plane requests | Single-client gate over the EP source tree |
| **C-05.2** | No Intelligence Plane code initiates a connection toward a customer tenancy | Egress-direction gate; runtime egress policy |
| **C-05.3** | Refusal and Unavailability are distinct types and cannot be handled interchangeably | Type-level test; compile-time where the language permits |
| **C-05.4** | Retry exhaustion produces Unavailability, never abort | Fault-injection test with the Intelligence Plane unreachable |
| **C-05.5** | Every degradation-matrix row is exercised by a test | Matrix coverage test — **six rows, six tests** (five until [ADR-0078](../adr/ADR-0078-package-retrieval-recorded-in-architecture.md) added the Integrity Failure row) |
| **C-05.6** | No result is constructible without an assurance state | Type-level requirement; schema gate |
| **C-05.7** | The certification interface rejects a degraded result | Interface rejection test |
| **C-05.8** | No secret-shaped value appears in any outbound payload, in any environment | Outbound payload guard; secret-scan gate over the client and its tests |
| **C-05.9** | A retried request cannot produce two execution packages for one run | Idempotency test under forced retry |
| **C-05.10** | Integrity Failure is a distinct type and cannot be handled as Success, Refusal or Unavailability | Type-level test; compile-time where the language permits |
| **C-05.11** | A retrieval refusal is **indistinguishable** between an unknown hash and an unowned one | Negative test asserting the two responses are equal |
| **C-05.12** | A verification failure HALTs and does not degrade, **with a valid cached package present** | Fault-injection test — the cache is the branch that must not fire |

**C-05.12 is written with the cache present deliberately.** Without a cached package, HALT and DEGRADE reach the same place — row 4 of the matrix emits no verdict either — so a test run without one would pass whichever branch fired. The cached-package case is the only one in which the two behaviours differ observably, which makes it the only one that measures anything.

**C-05.5 is deliberately exhaustive.** The degradation matrix is where the platform's availability promise lives, and a partially-tested matrix is indistinguishable from an untested one at the row that matters.

## 9. Open items

| # | Item | Blocks | Target |
|---|---|---|---|
| **AD-003** | Wire protocol and serialisation format | [20](20-cross-plane-contracts.md) | M1.2 |
| **AD-008** | Whether a last-known-good package is cached, and its validity window | Rows 2–3 of the degradation matrix | M1.2 |
| **AD-009** | How deferred certification is durably queued inside the customer tenancy | R-05.10 | M1.2 |
| **AD-043** | **Which Execution-Plane-initiated exchange carries the package hash to the Execution Plane**, and what else it carries | R-05.21; [ADR-0070](../adr/ADR-0070-execution-package-retrieval-inversion.md) §6 step 3 | **CLOSED 2026-08-06** — [ADR-0080](../adr/ADR-0080-work-request-exchange.md) |

**AD-043 IS ANSWERED, AND THE PARAGRAPH IT REPLACES WAS RIGHT TO REFUSE TO ANSWER IT.** This text previously read: *"Retrieval is keyed by a hash the Execution Plane must already hold, and no exchange exists that hands it one: **the sole Execution-Plane-initiated route today mints a credential and carries no work.** Naming a message on an exchange that has no design would put a claim into a frozen document with nothing on disk able to contradict it.*" **That restraint was correct and is preserved as the reason this row stayed open** — the mechanism is now designed, so the claim can be made.

**TWO CORRECTIONS TO THAT SENTENCE, MADE BY MEASUREMENT.** **(1) The count was wrong: there are FOUR Execution-Plane-initiated routes, not one** — `POST /api/register`, `GET /api/tenants/{slug}/updates`, `POST /api/tenants/{slug}/updates` and `POST /api/tenants/{slug}/installed`; the router labels the `/updates` pair *"EP-initiated"* in its own source. **The conclusion survived the correction — none of the four carries work — but the premise it was reasoned from did not**, and [ADR-0080](../adr/ADR-0080-work-request-exchange.md) §2.2 records why that matters: ADR-0070 P-70.2 was reasoned from this premise and is amended because of it. **(2) *"No exchange exists"* is now historical.** [ADR-0080](../adr/ADR-0080-work-request-exchange.md) P-80.2 rules the work-request exchange; **R-05.26–R-05.28** record its direction, its response shape and its derivation. **The residue — ADR-0070 P-70.5's false governance claim — is D-112 and is deliberately NOT repaired here** (ADR-0080 §5.2): repairing a second frozen statement inside this amendment would land it unreviewed.

See [ADR-0078](../adr/ADR-0078-package-retrieval-recorded-in-architecture.md) P-78.7 for the deferral this closes.

**AD-008 and AD-009 are the design questions of the sovereign split**, not implementation details. AD-008 sets the entire scope of degraded operation: without a cached package, rows 2 and 3 of the matrix collapse into row 4. AD-009 follows unavoidably from "certification deferred, never delegated" — it obliges the platform to own a durable queue, with delivery, ordering, expiry, and back-pressure semantics, **inside the customer tenancy**.
