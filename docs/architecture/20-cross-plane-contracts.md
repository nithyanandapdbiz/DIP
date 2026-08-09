# 20 — Cross-Plane Contracts

**Status:** **FROZEN** · **Version:** 1.1 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.2
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rules 4, 9 and 10
**Resolves:** AD-003
**Amendments:** v1.1 — §2.3 retrieval (R-20.28–R-20.31) and C-20.13–C-20.14 added by [ADR-0078](../adr/ADR-0078-package-retrieval-recorded-in-architecture.md), executing [ADR-0070](../adr/ADR-0070-execution-package-retrieval-inversion.md) §6 step 1 (**additive** — no existing rule is amended; direction and the result taxonomy are [05](05-cross-plane-communication.md)'s and were amended there)

**This document owns:** the execution package and evidence contracts, the canonical integrity primitive, the wire format, and contract versioning.
**It does not own:** transport or direction ([05](05-cross-plane-communication.md)), the shared package vehicle ([19](19-repository-ownership.md)), or evidence capture semantics ([10](10-evidence-flow-model.md)).

---

## 1. Contract principles

**R-20.1** A contract is **explicitly versioned**. A version is never reinterpreted; changing meaning requires a new version.

**R-20.2** A contract defines **shape and constraints only**. It contains no business logic (R-19.7).

**R-20.3** Both planes validate against the **same schema artefact**, distributed as a versioned shared package — never as two hand-maintained copies.

**R-20.4** Unknown fields SHALL be preserved on pass-through and SHALL NOT cause rejection, so a newer producer does not break an older consumer on additive change.

**R-20.5** Every contract instance carries its contract version. A message without one is **rejected**, not guessed at.

## 2. The execution package

The sealed artefact the Intelligence Plane authors and the Execution Plane sequences. It is what converts orchestration from a conversation into an artefact — and therefore what makes INV-7 achievable at all.

### 2.1 Required elements

**R-20.6** An execution package SHALL contain exactly these elements. None is optional.

| Element | Purpose |
|---|---|
| **Proceed** | Whether execution is permitted at all. `false` carries a refusal reason |
| **Operations** | The ordered sequence to execute |
| **Directives** | Execution parameters — timeouts, retries, concurrency, mode |
| **Gate definitions** | The deterministic gates the Intelligence Plane will later evaluate |
| **Evidence requirements** | What SHALL be captured, and to what fidelity |
| **Provenance** | Authoring identity, tenant, timestamp, contract version, content hash |
| **Validity** | Expiry, and whether the package may be reused while the Intelligence Plane is unavailable |

**R-20.7** Gate definitions are **carried, not evaluated** by the Execution Plane. It captures what the gates require; it does not compute their outcome (R-2.3).

### 2.2 Package invariants

**R-20.8** A package is **sealed and immutable** once authored (R-4.2).

**R-20.9** A package is **content-addressed** by the canonical integrity primitive (§4).

**R-20.10** The Execution Plane executes a package or refuses it. It **never modifies** one (R-4.3).

**R-20.11** Execution is **idempotent with respect to package identity**: submitting the same package twice for the same run SHALL NOT produce two executions.

**R-20.12** Every execution is attributable to **exactly one** package hash, and every evidence record references the package hash that produced it (R-4.4).

**Why sealing matters.** A sealed artefact can be cached, replayed, audited, and executed while its author is offline. An unsealed instruction stream cannot — it would require the author live for every step, which is precisely the inbound dependency sovereignty forbids.

### 2.3 Retrieval

The Execution Plane retrieves the sealed package; the Intelligence Plane never delivers it (ADR-0070 P-70.1). **Retrieval as an operation — its direction, its result classes, its retry posture and its degradation behaviour — is [05](05-cross-plane-communication.md)'s**, which owns direction and transport. What follows is the artefact's half: the key, the verification obligation, and what may cross when verification fails.

**R-20.28** The package **content hash is a retrieval key**, as well as an integrity and attribution value. A retrieved package's recomputed content hash SHALL equal the hash it was requested by; if it does not, it is not the package requested and it is refused.

**This half of verification needs no key material and cannot be got wrong by convention.** Content addressing makes identity self-verifying: the request names the bytes, so a response that hashes to something else is answering a different question. R-20.9 already made the package content-addressed and R-20.12 already made attribution mechanical — retrieval only uses what was there.

**R-20.29** Verification on retrieval is **two checks**, and both SHALL pass before a retrieved package is executed: the content-hash match of R-20.28, and the validity of the detached signature over the canonical form (R-20.22). Key custody, rotation and customer-side trust material remain **AD-016** (§8) — open, and named here rather than assumed closed.

**R-20.30** An **integrity report** SHALL carry exactly: the content hash that was requested, the failure kind (`hash-mismatch` · `signature-invalid` · `unparseable`), and its contract version. It SHALL carry **no assurance state, no verdict and no evidence**, and it is never certification input (R-12.5, R-18.17). It is a **diagnostic self-report**: the Intelligence Plane treats it as authoritative about exactly one thing — that this Execution Plane said so.

**R-20.31** The Intelligence Plane SHALL NOT require, and the Execution Plane SHALL NOT send, an **acknowledgement of successful retrieval**. Attribution is carried by R-20.12 — every evidence record references the package hash that produced it — and a second record of one fact is two records that can disagree. The Intelligence Plane holds no delivery state ([05](05-cross-plane-communication.md) §R-05.21); a package's life is bounded by its own `Validity` (§2.1), not by whether anyone confirmed collecting it.

**Why the failure path gets a channel and the success path does not.** If verification fails the Execution Plane halts, so no execution begins, so **no evidence record ever carries that hash** — the one channel that would otherwise report it falls silent exactly where silence is indistinguishable from *"not yet started."* And a failed seal means this store is corrupt or something is impersonating the Intelligence Plane: an Intelligence-Plane security event, not an Execution-Plane execution outcome. On the success path none of that applies, and R-12.5 empties what would be left: strip verdict, assurance state and certification content — none of which may cross — and an acknowledgement says only *"I fetched a thing you already know exists."*

**The word is bound, not borrowed.** *Acknowledgement* already names the update-event mechanism, in which the Execution Plane pulls a pending event, applies it, and confirms application. An integrity report is **not** an acknowledgement and is not called one.

## 3. The evidence contract

**R-20.13** An evidence record SHALL carry: the producing **package hash**, its **content hash**, the **algorithm version** used, the **capture context**, and its **classification** ([06](06-data-sovereignty.md)).

**R-20.14** Evidence **payloads** remain in the Execution Plane. What crosses is a **reference plus hash** (INV-1, R-9.1).

**R-20.15** An evidence reference SHALL remain meaningful after its payload expires, so that a decision citing it stays auditable ([10](10-evidence-flow-model.md)).

**R-20.16** Every result SHALL carry a structural **assurance state** — `CERTIFIED`, `DEGRADED`, `DEGRADED — UNCERTIFIED`, or `HALTED`. A result is not constructible without one (R-10.3).

## 4. The canonical integrity primitive

**R-20.17** The platform SHALL have **exactly one** hashing implementation, defined in one shared package, for all content addressing and integrity verification.

**R-20.18** Hashing SHALL be **domain-separated**: the domain is a required parameter, not an option.

**R-20.19** Every hashed record SHALL carry its **algorithm version**.

**R-20.20** Canonicalisation SHALL be deterministic and specified — identical logical content always produces identical bytes.

**R-20.21** A second implementation of this primitive is a **Constitutional violation**, not a duplication smell.

### Why this is fixed in architecture rather than left to implementation

The predecessor allowed one governed term two implementations in two packages. Their canonical forms agreed; their digests did not, because one lacked domain separation. The operational consequence, proven by execution: **evidence written by one and verified by the other reported tampering on untampered records.**

A false tamper verdict is more corrosive than a missed detection. It reports corruption where none occurred, is indistinguishable from genuine corruption, and trains operators to discount the control. An integrity check that cries wolf is worse than no check.

**R-20.19 is what makes this survivable long-term.** Evidence outlives the algorithms that hashed it. Without a version on every record, changing the algorithm is a flag day across every customer tenancy simultaneously — which, across hundreds of independently-scheduled deployments, is not a migration that can actually be performed.

## 5. Wire format — AD-003 resolved

**R-20.22** The wire format SHALL be **JSON**, validated by **JSON Schema**, canonicalised for hashing by a **specified deterministic canonicalisation** (JCS, RFC 8785), and integrity-protected by a **detached signature** over the canonical form.

### Why JSON and not a binary format

| Criterion | JSON + JSON Schema | Binary (Protobuf/CBOR) |
|---|---|---|
| **Auditability** | A customer security team can read a package in a text editor | Requires tooling and the current schema to inspect |
| **Evidence longevity** | Readable in a decade without the original toolchain | Depends on schema availability at read time |
| **Schema distribution** | Schema is data; validates identically in both planes | Usually requires code generation in each language |
| **Cross-language** | Universal | Good, but constrains language choice |
| **Efficiency** | Lower | Higher |

**The deciding factor is auditability under sovereignty.** A customer must be able to inspect exactly what DBiz instructed their tenancy to do, using no DBiz tooling. That is a procurement and trust requirement, not a developer preference — and it outweighs the efficiency gap, because packages are authored once per run rather than at high frequency.

**Detached signatures** are specified so that the signature can be verified without re-serialising the payload, and so signing does not perturb the canonical bytes the content hash is computed over.

## 6. Versioning and compatibility

**R-20.23** Contracts follow **semantic versioning**. A breaking change is a major version.

**R-20.24** The Intelligence Plane SHALL support every contract major version still deployed in any customer tenancy, with **declared** support windows.

**R-20.25** An Execution Plane may run an **older** contract version than the Intelligence Plane's current. The reverse SHALL NOT be required (R-19.11).

**R-20.26** Additive change is minor; field removal or semantic change is major. **A field's meaning SHALL NOT change within a major version.**

**R-20.27** Deprecation SHALL be declared at least one major version before removal.

### 6.1 Compatibility posture

| Change | Version | Consumer impact |
|---|---|---|
| Add optional field | Minor | None — R-20.4 preserves unknowns |
| Add required field | **Major** | Older producers cannot satisfy it |
| Remove field | **Major** | Older consumers may depend on it |
| Change field meaning | **Major** | Silent misinterpretation otherwise — the most dangerous change class |
| Add enum member | **Major** unless consumers are specified to tolerate unknown members | Unknown member may be unhandled |
| Tighten a constraint | **Major** | Previously valid instances become invalid |

**Changing a field's meaning within a version is the most dangerous change available**, because nothing fails: both sides validate, and the disagreement surfaces only as wrong behaviour, at a time and place unrelated to the change.

## 7. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-20.1** | Exactly one implementation of the integrity primitive exists platform-wide | Governed-term registry gate |
| **C-20.2** | Hashing cannot be invoked without a domain | Signature-level requirement; compile-time where possible |
| **C-20.3** | Every hashed record carries an algorithm version | Schema gate |
| **C-20.4** | Both planes validate against the same schema artefact | Schema-identity test across repositories |
| **C-20.5** | Canonicalisation is deterministic across implementations and platforms | Cross-implementation equivalence test in CI |
| **C-20.6** | A message without a contract version is rejected | Negative validation test |
| **C-20.7** | Unknown fields survive pass-through unmodified | Round-trip preservation test |
| **C-20.8** | A package is immutable after authoring | Mutation-attempt test |
| **C-20.9** | Resubmitting a package does not produce a second execution | Idempotency test |
| **C-20.10** | Every evidence record carries its producing package hash | Schema gate |
| **C-20.11** | No result is constructible without an assurance state | Type-level requirement |
| **C-20.12** | Every supported contract version has a passing compatibility test | Compatibility matrix test |
| **C-20.13** | A retrieved package whose recomputed content hash differs from the hash it was requested by is **refused** | Mutation test — alter the stored bytes, request by the original hash |
| **C-20.14** | An integrity report is **not constructible** with an assurance state or a verdict field | Type-level requirement |

**No criterion asserts that no acknowledgement route exists**, and the omission is deliberate. Such a criterion turns **green when the entire retrieval surface is removed** — it is satisfied *by* the absence, so its pass carries no information about the thing it watches (CHARTER §17.1.1). R-20.31 is enforced positively instead, by **C-20.10** remaining the only attribution path: if a second one is ever added, C-20.10 stops being sufficient and the gap surfaces where attribution is measured. See [ADR-0078](../adr/ADR-0078-package-retrieval-recorded-in-architecture.md) §4.2.

**C-20.5 is the check the predecessor lacked and needed most.** A cross-implementation equivalence test executed in CI is precisely what would have caught its hash fork before any evidence was written under it.

## 8. Open items

| # | Item | Target |
|---|---|---|
| **AD-004** | Hash algorithm selection and the domain-separation scheme | M1.3 |
| **AD-016** | Signing key management, rotation, and customer-side verification | M1.3 — [08](08-security-model.md) |
| **AD-008** | Package caching and validity window | [05](05-cross-plane-communication.md) |

**AD-016 carries a sovereignty dimension.** The Execution Plane must verify that a package genuinely originated from the Intelligence Plane, using keys the customer can trust, without DBiz holding anything inside the customer tenancy that could be used to impersonate the customer. Recorded now so it is resolved deliberately rather than by whichever mechanism proves easiest first.
