# ADR-0079 — The Retrievable Package Store: partition as authorisation, retention on contract, and the ownership assertion that needs a registry

**Status:** ACCEPTED · **Date:** 2026-08-06 · **Accepted:** 2026-08-06 · **Tree:** `257a824`
<!-- Status is written UNBOLDED deliberately. `emit-closure-package.mjs:116` parses it with
     /\*\*Status:\*\*\s*([A-Z]+)/, which yields UNKNOWN for the bold-wrapped form and a single
     letter for title case — 31 of 71 ADRs are recorded wrongly in the frozen closure baseline
     as a result. This line is a one-row workaround, NOT the repair; see debt D-107. -->

**Amended at acceptance:** 2026-08-06 — **§7, the re-baseline claim, corrected by measurement (§7.1).** No proposition moves.
**Governed by:** [06 — Data Sovereignty](../architecture/06-data-sovereignty.md); [07 — Tenant Isolation](../architecture/07-tenant-isolation.md); [17 — Deployment Topology](../architecture/17-deployment-topology.md) §4; [01 — Platform Constitution](../architecture/01-platform-constitution.md); [18 — Governance Model](../architecture/18-governance-model.md) §R-18.26–29
**Executes:** [ADR-0078](ADR-0078-package-retrieval-recorded-in-architecture.md) **P-78.6** — the store named there as a separate decision and step 2's precondition.
**Relates to:** [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) (P-70.3 no delivery state, P-70.4 one refusal signal) · [ADR-0010](ADR-0010-tenant-storage-layout.md) (the layout, and its §6 binding constraint) · [ADR-0060](ADR-0060-cloud-native-provider-platform.md) (the storage provider this is built on) · [ADR-0032](ADR-0032-tenant-configuration-repository-ssot.md) (the registry this asserts through) · [ADR-0005](ADR-0005-canonical-integrity-primitive.md) · [ADR-0007](ADR-0007-package-signing.md)

> **ACCEPTANCE (2026-08-06, programme-owner authority; CHARTER §9).** Accepted as written, with all nine propositions as scoped. Acceptance satisfies R-18.26 — an ADR, an impact analysis, a migration strategy and a governance review **before** implementation — and unblocks [ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) §6 step 2, discharging [ADR-0078](ADR-0078-package-retrieval-recorded-in-architecture.md) **P-78.6**. **This ADR is FROZEN on acceptance**, as ADR-0069, ADR-0070, ADR-0076, ADR-0077 and ADR-0078 are. New findings are recorded in `TECHNICAL_DEBT.md` and `PROJECT_STATE.md`, never written back into it.
>
> **Two residuals stay OPEN and recorded, and acceptance does not close them:** **D-106** (the registry P-79.2 asserts through is untracked — §5.1) and **§5.3** (`isolation.storagePartition` is the tenantId while `tenantPartition()` produces `t/<slug>`).
>
> **Added on acceptance — the offboarding case gets a TEST, not only a record.** §5.2's deleted-tenant path is proved by an executing test: store a package, delete the tenant, retrieve — and the refusal SHALL be **byte-identical** to a never-existing hash's. That is the oracle P-79.6's single expression closes, and **an untested guarantee is an assertion** (R-13.7 clause 1: a property whose failing run cannot be produced is reported as unreachable, never counted as satisfied). It is a completion condition of §6 step 2, listed at §6.
>
> **WHAT THIS ADR DOES.** It rules the retrievable package store that ADR-0078 P-78.6 named and did not build: where it writes, what authorises a read, what it holds, how long, and what it must never record. It is the **first customer-derived persistence in the Intelligence Plane**, so it is also the first thing document 06's obligations have ever had a subject in this plane — and it lands with the gate that measures them.
>
> **WHAT IT DOES NOT DO.** It does not build the route. `GET /api/packages/{hash}` is ADR-0070 §6 step 2's subject and is authored after this ADR is accepted, against P-79.6 and P-79.8.

---

## 1. Problem

ADR-0078 P-78.6 recorded that the store *"does not exist. No persistence, no hash index, no ownership record outside the package body"*, and gated ADR-0070 §6 step 2 on deciding it. P-70.1 already states the Intelligence Plane's obligation ends when a package *"exists and is retrievable"* — a claim about an artefact nothing retains.

Four questions have no answer on disk, and the first three are sovereignty questions rather than engineering ones:

1. **Where does it write, without becoming the second store to construct its own tenant path?** [`tenant-repository.ts:91-100`](../../packages/tenant-onboarding-engine/src/engine/tenant-repository.ts) — `FileTenantConfigStore.dir()` — composes `resolve(this.rootDir, safe)` itself. It is careful, defended twice, and it is an **existing R-07.2 violation**: *"A store SHALL NOT construct its own tenant-scoped path."* R-07.3 requires exactly one constructor and it is [`artefactPath`](../../packages/platform-providers/src/storage/storage-provider.ts). A second hand-rolled path would make the violation a pattern.

2. **What authorises a read on a route with no slug?** P-70.4 clause 2 gives `GET /api/packages/{hash}` no slug by design. Measured: that route therefore never reaches [`api.ts:99-118`](../../packages/tenant-onboarding-engine/src/engine/api.ts) — no slug validation, no `permissionForRoute`, no `mayAccessTenant` — nor the EP-token revocation check at `:126`.

3. **What is DBiz holding, and for how long?** Sealed artefacts carrying a tenant's authored tests, in the DBiz plane. Under R-06.9 a store without a declared retention period **SHALL NOT be registered**.

4. **And the ownership claim does not reconcile locally.** The store partitions by **slug**; the package carries **`provenance.tenantId`**. P-78.8 required this measured before the check was written. It is measured at §2.2, and the answer changes P-79.2: there is no derivation, so the assertion needs a registry.

## 2. Context

### 2.1 What exists, measured on `257a824`

| | State |
|---|---|
| One validated path constructor | **Exists** — `artefactPath` / `tenantPartition`, `t/<slug>/capability/run/artefact` (R-17.17, R-07.3) |
| A storage provider behind an interface | **Exists** — `FilesystemStorageProvider` (local **and** the Azure Files SMB mount) and `InMemoryStorageProvider`, ADR-0060 |
| Per-tenant purge as a prefix operation | **Exists** — `purgeTenant`, R-17.19 |
| The ownership claim inside the seal | **Exists** — `ProvenanceSchema.tenantId`, inside the content hash |
| A sealed-package store | **Does not exist** |
| A store that constructs its own tenant path | **Exists, and is a defect** — `tenant-repository.ts:91-100`, R-07.2 |
| Any governance citation of document 06 | **Zero** — §2.4 |

### 2.2 P-78.8, measured — the pairing is a lookup, and no derivation exists

Established once, at [`tenant-repository.ts:229-233`](../../packages/tenant-onboarding-engine/src/engine/tenant-repository.ts):

| | Shape | Origin |
|---|---|---|
| `slug` | `/^[a-z0-9][a-z0-9-]{0,62}$/` | `slugify(organisationName)` — human-derived |
| `tenantId` | `tnt-` + 12 hex | `randomBytes(6)` — R-21.3, *"opaque and meaningless … carries no isolation semantics"* |

**No derivation exists in either direction, and one was searched for from both planes.** Six random bytes are not a function of a name; the name is not recoverable from them. Every resolution in the tree is a **scan**, and the plane holds two of them with **different safety**:

| Resolver | Ambiguity |
|---|---|
| [`resolveSlugByTenantId`](../../packages/tenant-onboarding-engine/src/engine/registration.ts) `:430` | **fail-closed** — `hits.length === 1`, else `undefined` → 404 |
| [`knownTenant`](../../packages/tenant-onboarding-engine/ip-execute-gateway.mjs) `:488` | returns the **first** `readdirSync` match |

**Readable at seal time and at write time — not only at registration.** At seal time the lookup is *already performed*: `ip-execute-gateway.mjs:565-580` takes `contextRequest.tenantId` from the caller, resolves it via `knownTenant`, 404s `unknown tenant` if absent, then scopes the principal against `found.slug`. At write time the store runs in the process that already holds `TenantConfigRepository`. **So P-79.2's write-time assertion needs no new mechanism** — the "only at registration" branch of the question does not arise. It needs the *correct* one of the two that exist.

**The pairing has one home and it is untracked.** `tenants/<slug>/tenant.json`, with `/tenants/` at `.gitignore:76` — unversioned, unreplicated, single-replica local state, by ADR-0032's one-file-per-tenant design. This is stated because it bounds the strength of the claim P-79.2 makes; see §5.

### 2.3 The upstream dependency, and the asymmetry that makes it silent

**A wrong-tenant package is not caught on retrieval, and nothing downstream catches it either.** Verification proves **integrity, not ownership**: ADR-0078 P-78.3's two checks are content-hash match and detached-signature validity, and a package correctly sealed for tenant B satisfies both perfectly in tenant A's hands. Under P-70.4 the client is *correctly forbidden* from making the comparison — unknown and unowned are one signal, so the Execution Plane cannot tell "not yours" from "no such package" and **SHALL NOT pretend to**. ADR-0078's taxonomy has no result class for *served, verified, and someone else's*, and should not acquire one: that class would be the oracle P-70.4 exists to deny.

**So the protection is entirely upstream, and it is one thing:** the token's tenant claim scoping what slug the caller can reach.

**The failure asymmetry, which is the reason this is a finding rather than a note:**

| Substitution | Result |
|---|---|
| slug where tenantId belongs | **403** — `normaliseTenantSlug` rejects the shape, or `mayAccessTenant` refuses the scope. Loud. |
| tenantId where slug belongs | **A package that VERIFIES and belongs to someone else.** Silent. |

The first failure announces itself at the boundary. The second produces a well-formed, correctly-sealed, hash-matching artefact that the Execution Plane is contractually obliged to trust and execute. **Nothing in either plane is positioned to notice.**

**Consequence, stated so step 2 is authored against it:** the auth block on `GET /api/packages/{hash}` is **the only thing between a tenant and another tenant's authored tests**, on a route that inherits none of `api.ts:99-118`. It is not a variation of an existing check; it is the whole control.

### 2.4 Document 06 has never had a subject in this plane

Measured across all of `governance/`: **zero** citations of `R-06.4`, `R-06.9`, `R-06.12`, `R-06.13`, `R-06.14`, `C-06.3`, `C-06.11` — and zero of **every other** `R-06.x` and `C-06.x`. The whole document is uncited by the gate suite.

That is not neglect, and reading it as neglect would produce the wrong repair. **C-06.11 — *no C1 data persists beyond the request in the Intelligence Plane* — has been satisfiable by absence since it was written**, because until now the Intelligence Plane persisted no customer-derived artefact at all. A gate asserting it would have passed on an empty subject, which is CHARTER §17.1.1's control-shaped literal exactly.

**The store is what gives document 06 a subject.** That is why the gate lands *with* it and not after it: a store that creates the first subject for six obligations, shipped before the gate that measures them, is the declared-but-unbuilt shape (R-11.2) at the sovereignty layer.

## 3. Alternatives

**A. No store; serve from the authoring path on demand.** Rejected. Re-authoring is not deterministic across time (the FTE reasons over a live context), so the hash would not be stable, and content addressing — the thing that makes retrieval self-verifying (ADR-0078 §2.3) — would break. P-70.1's *"exists and is retrievable"* would remain false.

**B. A hash-keyed store with no tenant partition, authorised by a predicate over `provenance.tenantId`.** Rejected, and it is the alternative that looks simplest. It rebuilds **F-04**: a caller-supplied value reaching a lookup that a check is then expected to constrain. R-07.1's posture — *a tenant identifier filtered in application code fails open; a physical path fails closed* — is the whole reason the layout is tenant-leading. A flat store with a guard is the failing-open arrangement with a guard on top.

**C. Partition by `tenantId` rather than by slug.** Rejected, though it is closer than it looks. `isolation.storagePartition` **is** the tenantId on the manifest today (`tnt-42d3e7e9d324` on the measured tenant), so this would agree with that field — but it disagrees with `tenantPartition()`, which produces `t/<slug>` and is the one constructor R-07.3 mandates. Choosing this would mean a second partitioning scheme in the plane. **The disagreement is real and is recorded as a consequence (§5) rather than resolved here** — it is a doc 07/17 question, not this store's to settle.

**D. Store the package and a derived index (tenant → hashes) for listing.** Rejected — P-79.5. A derived index is a second record of ownership that can disagree with the sealed body, and listing is a capability nothing has asked for.

**E. Retention keyed to delivery — purge once the Execution Plane has fetched.** Rejected. It is delivery state under another name, and P-70.3's entire benefit is re-fetch *without* the Intelligence Plane tracking it. It also makes retrieval non-idempotent, contradicting R-05.21.

**F. Ship the store now, add the document-06 gate as a follow-up.** Rejected — §2.4. The gate's subject comes into existence with the store; deferring the gate means the first customer-derived persistence in this plane runs for some interval with six sovereignty obligations unmeasured, and "we will add the gate" is the sentence D-007 counts.

## 4. Decision

**P-79.1 — The store is Intelligence-Plane side and is built on `artefactPath`.** It obtains its location from the one validated constructor (R-07.3) and constructs no path of its own (R-07.2). It is the **first production consumer of a correct mechanism rather than the second store to violate it** — [`tenant-repository.ts:91-100`](../../packages/tenant-onboarding-engine/src/engine/tenant-repository.ts) is the existing violation, named here so it is a known defect with a successor pattern rather than a precedent. Repairing it is **not** in this ADR's scope (§6).

**P-79.2 — The key is `t/<slug>/packages/sealed/<hash>`, and THE PARTITION IS THE AUTHORISATION.**

The caller supplies a **hash**. The caller never supplies, and cannot influence, the partition segment: it is resolved from the authenticated principal before the key is constructed. **A caller cannot express a request for another tenant's partition**, so F-04's shape cannot be rebuilt — there is no caller-supplied value for a check to fail to constrain.

> **This is enforcement by ADDRESSING, not by a PREDICATE, and it is stronger than P-70.4 asked for.** P-70.4 requires that unknown and unowned be indistinguishable in the *response*. This makes them indistinguishable in the *lookup*: a hash belonging to another tenant is not refused after being found, it is **never found**, because the address it would have to be found at is not constructible from this caller's context. Stated explicitly so that a later reader does not "improve" it into a check — replacing the addressing with a predicate over a flat store would be a regression that every test would still pass.

**Two constant segments, and the abuse is admitted.** The canonical layout is `tenant/capability/run/artefact` (R-17.17). Here `capability = "packages"` and `run = "sealed"` are constants: neither is a capability nor a run. That is a **mild abuse of the layout's semantics**, stated rather than glossed. It is accepted because the alternative — a fifth segment form, or a second constructor — costs the R-07.3 single-constructor property, which is worth more than segment-name fidelity. **[ADR-0010](ADR-0010-tenant-storage-layout.md) §6's binding constraint is preserved**: the tenant-leading prefix is unchanged, so every isolation and purge property that depends on it holds, and `purgeTenant` remains a prefix operation.

**AMENDED — the ownership assertion at write time.** The store partitions by **slug**; the package carries **`provenance.tenantId`**. Measured at §2.2: **these do not reconcile locally.**

> **The store SHALL assert, at write time, that the package's `provenance.tenantId` resolves to the partition it is being written into — THROUGH THE REGISTRY that established the pairing, and never through a derivation.**
>
> **No derivation exists, and one was searched for from both planes.** `tenantId` is `randomBytes(6)`; `slug` is `slugify(organisationName)`. Neither is a function of the other, and no code in either plane computes one from the other. Every resolution is a registry lookup. **This is recorded because a future reader will reach for a derivation** — the two values look like they should be related, and the cheapest-looking implementation is a string transform that would be wrong in a way no test written against a well-formed tenant would catch.
>
> **The resolution SHALL use the fail-closed resolver.** `resolveSlugByTenantId` returns `undefined` unless exactly one tenant matches; `knownTenant` returns the first `readdirSync` match. The store uses the former's semantics. **Resolving ambiguously is a write refusal, not a first-match.**
>
> **The assertion fails the WRITE.** It is not a warning, not a quarantine, and not a stored-with-flag. See P-79.6.

**P-79.3 — Classification is RULED, not assumed: C4 with a C3 component, and no C1 by construction.**

| Part | Class |
|---|---|
| The seal, hashes, signing key id, `authoredBy`, contract version, the platform's authored decision | **C4** — platform judgment |
| Operation targets, element identifiers, route names, the authored test structure | **C3** — customer metadata |
| Credentials, secrets, session material, customer business data | **C1 — none, by construction** |

**No C1 by construction, and the construction is checkable:** the package body is assembled from the scrubbed, minimised F1 context (R-06.4 condition 2's allow-list, applied upstream at the cross-plane boundary), and `ProvenanceSchema` admits no credential field. **If any part of it were C1, [06:61](../architecture/06-data-sovereignty.md) prohibits this store outright** — C1 in the Intelligence Plane is *"Ephemeral — duration of the request, never persisted"* — so the classification is not a labelling exercise; it is the condition on the store's existence. C-06.11 is the gate that holds it (P-79.9).

R-06.4's four conditions are met as: **(1) Authorised** — this ADR, its identifier recorded in the storing module's own source per R-06.5 and C-06.3; **(2) Minimised** — the allow-list is the `ExecutionPackage` schema, applied upstream, and P-79.5 stores nothing beyond it; **(3) Scrubbed on write** — the body is already scrubbed at the F1 boundary and the store adds nothing; **(4) Purged** — P-79.4.

**P-79.4 — Retention is `min(validity.notAfter, tenant C3 retention ≤ 90 days)`, and it is NEVER keyed to delivery state.**

- **Declared** (R-06.9) — the store is not registered without it.
- **Read by code** (R-06.12) — the declared value drives the purge, not a comment. A retention field with no reader fails the build; document 06 records the predecessor's *configuration theatre* as the reason.
- **Purged by code on a schedule** (R-06.13), never operator-initiated, with purge failure alerting loudly (R-06.15).
- **With a test proving the data is unreadable afterwards** (R-06.14, C-06.8).

`validity.notAfter` bounds the artefact on its own contractual terms (R-22.5); the tenant's C3 ceiling of 90 days (06:62) bounds it on sovereignty terms; the store takes the **earlier**. **Retention is never a function of whether the package was fetched** — that is what preserves P-70.3, and alternative E is rejected on it.

**P-79.5 — The content is the sealed body and its provenance. Nothing derived.**

Not because derived data would be untidy, but because **the store cannot derive without destroying the identity it is addressed by.** The key *is* the content hash; anything computed and stored alongside is a second record of a fact the sealed body already carries, and a second record can disagree with the first. There is no index, no extracted tenant column, no cached parse. The ownership claim is read from the body, which is inside the hash, which is the key.

**P-79.6 — Three states, ONE refusal expression.**

| State | Response |
|---|---|
| No such hash in this partition | *identical* |
| Hash exists in another tenant's partition | *identical* — and under P-79.2 it is not even looked for |
| Hash exists in this partition and `validity.notAfter` has passed | *identical* |

One refusal, naming the hash it declined and nothing else (ADR-0078 P-78.2's quoted clause). Under P-79.2 the second state is already unreachable by addressing; the single expression covers it so that the property survives a future change to the addressing.

> **The timing residual, stated and scoped.** An expired package in the caller's own partition may take a filesystem read to refuse, where an absent one may not — a residual timing difference. It is **scoped to intra-tenant only**: it can distinguish *my expired package* from *my absent package*, and the caller is entitled to know both. It **cannot** distinguish anything about another tenant, because another tenant's partition is not addressed. **That is the whole claim, and no more is claimed** — this is not asserted to be constant-time.

**P-79.7 — The store records nothing from which a run could be inferred.** No delivery tracking, no fetch count, no last-accessed timestamp, no acknowledgement (R-20.31), no state transition on read. Retrieval is idempotent and leaves the store byte-identical (R-05.21). **R-12.5 is the binding constraint**: stages 10, 11 and 12 are the Intelligence Plane's, and a fetch record is an Execution-Plane execution signal crossing back in. A read-access audit line would be exactly the delivery state P-70.3 removed, re-entered through the audit trail.

**P-79.8 — `GET /api/packages/{hash}`'s auth block is authored deliberately, and is the sole control.** Per §2.3. The route reaches none of `api.ts:99-118` and none of `:126`. **Nothing is inherited, so nothing is inherited by accident** — and nothing is copied from `/api/application-templates`, whose authorisation is *"authenticated, not tenant-scoped"* and would be catastrophically wrong here. The block establishes, explicitly and in order: an authenticated principal; the EP-token revocation check equivalent to `:126`; the principal's tenant scope; and only then the partition from which the key is constructed. **A negative test proving cross-tenant retrieval is refused is part of the definition of done**, and under P-79.2 it must fail by *not finding*, not by *finding and refusing*.

**P-79.9 — The document-06 gate lands WITH the store, as a scoped consequence of this decision.** Not a follow-up. It measures, on the store as its subject: R-06.4's four conditions, R-06.5/C-06.3 (the ADR identifier in the storing module's source), R-06.9 (retention declared), R-06.12/C-06.7 (retention read by code), R-06.13/C-06.8 (scheduled purge with its unreadability test), and C-06.11 (no C1 persists). **Scoped to this store.** It does not attempt to measure document 06 across the plane — a gate that broad would report `NOT MEASURED` on most of its surface and would be the second control-shaped literal in a decision written to avoid the first. Its fault proof is recorded with it, in the same change, per CHARTER §18 and R-13.4/R-13.7.

## 5. Consequences

**What improves.** P-70.1's *"exists and is retrievable"* acquires a referent. ADR-0070 §6 step 2 unblocks. Document 06 acquires its first measured subject in this plane after being uncited by every gate. And the platform gains a store whose isolation is a property of its addressing rather than of a check — the posture R-07.1 argues for, in the first store built after the argument was written.

**What it costs.** A new gate with its fault proof. A scheduled purge job — the first in this plane — and the operational surface that comes with it (R-06.15's alerting is a real obligation, not a log line). The store is the first thing in the Intelligence Plane whose loss would be a customer-visible incident, so it inherits backup and recovery questions the plane has not had to answer.

**What does not change.** The `ExecutionPackage` contract, its seal, its content addressing. No contract version moves. P-70.3, P-70.4, R-12.5 and R-20.31 are enforced, not touched. ADR-0078's result taxonomy stays at **four** — see §5.2.

### 5.1 The claim this ADR makes is bounded by an untracked file, and that is stated rather than glossed

P-79.2's write-time assertion resolves through `tenants/<slug>/tenant.json`. That tree is `.gitignore:76` — **untracked, unversioned, unreplicated, single-replica**. The assertion is therefore exactly as strong as an operator-editable local file, and no stronger.

This is recorded in the decision rather than left to the register because the ADR's language would otherwise imply more than the mechanism delivers: *"asserts through the registry"* reads as a durable guarantee, and the registry is a file on a mount. **The gap is real, it is not this ADR's to close** — the tenant registry's durability posture is ADR-0032's and doc 21's — and it is carried as **D-106**, which also records that the same registry currently holds a pairing a live deployment rejects.

### 5.2 Why the fifth condition is not a fifth result class — confirmed, with one refutation

**Confirmed:** a package whose `provenance.tenantId` has no registry entry is a **write-time rejection**. The write fails, the package never enters the store, and retrieval never sees it — so ADR-0078's taxonomy stays at **four**. Measured support: the condition is already unreachable one step earlier, because `ip-execute-gateway.mjs:571-572` 404s an unresolvable tenantId *before authoring*, so no such package can currently be sealed at all. Reported as measured rather than adopted.

**One refutation of the reading as stated.** *"Retrieval never sees it"* holds for a tenant that never existed. It does **not** hold for a tenant deleted after the package was stored: `repo.delete(slug)` removes the directory outright and `archive()` drives to CLOSED, so a legitimately-stored package's owner can become unresolvable **at retrieval time**. This is a genuine retrieval-time occurrence of the fifth condition.

**It still does not create a fifth class, but only because P-79.6 is explicit.** An unresolvable owner at read time collapses into the single refusal expression alongside unknown and expired. Had P-79.6 said "three states" without saying "one expression", deleting a tenant would have made its former packages distinguishable from never-existing ones — an oracle, arriving through the offboarding path, which is the one path nobody would think to test for it.

### 5.3 The partition identifier disagrees with the manifest, and this ADR does not resolve it

`isolation.storagePartition` is the **tenantId**; `tenantPartition()` produces **`t/<slug>`**. Measured on the live tenant: `storagePartition: "tnt-42d3e7e9d324"`, directory `carlislehomes`. This store follows `tenantPartition`, per R-07.3.

So *"the partition is the authorisation"* is true of the partition the code constructs and not of the one the manifest declares. **The two should not disagree**, and reconciling them is a doc 07 / doc 17 question touching every store, not this one's. Recorded so that a reader of P-79.2 is not left believing the manifest field corroborates the key shape. It does not.

**Risk.** The principal risk is P-79.2 being "improved" into a predicate by a later change that finds the constant segments inelegant or wants a listing endpoint. Every test would still pass — addressing and predicate agree on all well-formed inputs and differ only on the attack. The control is that this is stated in the decision, and that P-79.8's negative test asserts *not found* rather than *refused*.

## 6. Migration strategy

Post-acceptance, in order. **None performed here.** R-18.26 requires an ADR, an impact analysis, a migration strategy and a governance review **before implementation**.

1. **Accept this ADR.** ADR-0070 §6 step 2 stays gated until then (ADR-0078 P-78.6).
2. **Build the store and the document-06 gate in one change** (P-79.9). Convert, then run the **full workspace suite** — not the package suite — and let failures name what `tsc` cannot see. The gate's fault proof is recorded in the same change, faulting the source of truth and naming the branch that fired (R-13.7 clause 2).
   **Two tests are completion conditions of this step, not follow-ups.** (a) The **offboarding oracle** — store a package, `repo.delete(slug)` the tenant, retrieve: the refusal SHALL be byte-identical to a never-existing hash's (§5.2). (b) The **write-time ownership assertion** proved failing — a package whose `provenance.tenantId` resolves to a different partition, and one that resolves ambiguously, are both write refusals (P-79.2).

3. **Then author `GET /api/packages/{hash}`** (ADR-0070 §6 step 2), its auth block written from P-79.8 rather than copied, with the cross-tenant negative test as a completion condition. `verify-contract-compatibility` before and after.
4. **Record the residuals** — §5.1, §5.3 and D-106 — in `PROJECT_STATE.md` and the debt register, before the milestone is called done rather than after.

**Not in this sequence, deliberately.** `tenant-repository.ts:91-100`'s R-07.2 violation (§4 P-79.1) is **not** repaired here. Moving the tenant registry onto `artefactPath` changes where every tenant manifest lives, which is a data migration touching ADR-0032's single source of truth. Folding it into a new store's introduction is the scope error D-087 counts. It is recorded as owed.

## 7. Version impact

- **No architecture document changes.** This ADR rules a store *under* documents 06, 07, 10 and 17; it amends none of them. No frozen document moves. **~~and no re-baseline is required~~ — CORRECTED AT ACCEPTANCE, see §7.1.**
- **No contract change.** `CONTRACT_SCHEMA_VERSION`, `EXECUTION_CONTEXT_VERSION` and `PACKAGE_GOVERNANCE_VERSION` unchanged. No compatibility window opens.
- **Gate count +1** — the document-06 store gate (P-79.9), landing with its subject and its fault proof.
- **Conformance criteria unchanged in count.** This store becomes the first *subject* of existing criteria C-06.3, C-06.6, C-06.7, C-06.8 and C-06.11; no new criterion is added. **No criterion is claimed as verified until its proof is recorded.**
- **[ADR-0078](ADR-0078-package-retrieval-recorded-in-architecture.md) P-78.6 is discharged**, and P-78.8 is answered by §2.2. ADR-0078 is FROZEN and is **not** written back into.
- **[ADR-0070](ADR-0070-execution-package-retrieval-inversion.md) §6 step 2 unblocks on acceptance.** P-70.1–P-70.6 untouched.

### 7.1 The re-baseline claim was wrong, and it was wrong because it reasoned about DOCUMENTS

**Measured at acceptance, before anything was edited:** `verify-programme-closure` is **FAIL — 1 baseline property violated**, and the property is *"no ADR has been added since closure"*. The closure baseline enumerates **ADRs on disk**, not only architecture documents, so **this ADR's own existence trips the gate** — exactly as ADR-0078's did.

**The error is worth naming because it is not a typo.** §7's first bullet reasoned correctly about what it was looking at — no frozen document moves, no criterion count changes — and then generalised from *documents* to *the baseline*, which enumerates more than documents. **A version-impact section that reasons only over the axes the change touches will miss every axis the change touches merely by existing.** Adding an ADR is a baseline event even when the ADR amends nothing.

**Corrected statement.** One leg of the closure gate goes red on this ADR landing; it is cleared by a **deliberate re-baseline** (`node governance/closure/emit-closure-package.mjs program`) whose diff review confirms **only** this ADR's entry moved — no architecture document, no criterion count, no gate count. **It is not a candidate for the documented-reds set**, because it is created by this change and cleared by this change. The gate count `+1` at the third bullet is a **second, later** baseline event, landing with the store at §6 step 2, and is re-baselined then rather than pre-empted now.

## 8. Affected components

- `docs/adr/ADR-0079-retrievable-package-store.md` — **New** (this ADR).
- `packages/platform-providers/src/storage/` — **New module**: the sealed package store, built on `artefactPath`, carrying this ADR's identifier in its own source (R-06.5, C-06.3).
- `governance/verification/` — **New gate** (P-79.9), scoped to this store, with its recorded fault proof.
- `governance/verification/run-all.js` — **Amended**: the new gate registered.
- `governance/verification/proofs.json` — **Amended**: the new gate's fault proof.
- `program/DECISIONS.md` — **Amended**: ADR-0079 index row.
- `program/TECHNICAL_DEBT.md` — **Amended**: D-106 cross-referenced from §5.1; the R-07.2 violation at `tenant-repository.ts:91-100` recorded as owed and out of scope (§6).
- `program/PROJECT_STATE.md`, `program/NEXT_ACTION.md` — **Amended** on completion of §6.

**No architecture document, no contract, no route and no Execution-Plane artefact is modified by this ADR.** The route it makes possible is ADR-0070 §6 step 2's, authored after acceptance.

---

> **~~STOP FOR ACCEPTANCE.~~ SATISFIED 2026-08-06.** R-18.26 gated §6 step 2 on this ADR being accepted, with an impact analysis, a migration strategy and a governance review, **before implementation**. **All four exist and acceptance is recorded above.** §6 step 1 is complete; **§6 step 2 is the next action** and is authored against P-79.1–P-79.9 as written, with the cross-tenant negative test and the offboarding refusal-identity test as completion conditions.
