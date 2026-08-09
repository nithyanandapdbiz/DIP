# Session Log

Implementation memory, newest last. Each entry records what was found, what was decided, what was produced, and where work stopped.

---

## Session 1 — 2026-07-22

### Situation on entry

The stated working directory `C:\DBIZAGENTICAI` was **empty** — created the same day at 11:30 and never populated. The brief's read-order referenced eleven `/program` files, **none of which existed anywhere on the filesystem**.

Investigation located a live, substantial project at `C:\POC\DBIZIPEP` containing both named repositories, actively developed through 11:20 that same day.

### Work performed against the legacy project

Before the re-foundation decision was taken, one unit of work was completed in the legacy tree: **verification of its open question Q-13**, which its own baseline had mandated as *"the first act of certification"* and identified as the sole open question able to invalidate a Constitutional rule.

**Result: Q-13 resolved.** The control plane was proven composed strictly in-process; no Rule 1 violation. Determination CL-01 upheld, confidence raised Medium → Verified.

Evidence: the sole production entry point (`server.js`) contained no reference to the composition host; exactly two listeners existed in the tree; the control-plane listener's only callers were two integration tests binding ephemeral ports.

The verification also surfaced a finding the legacy baseline had not recorded: **Rule 1 conformance was behavioural, not structural** — the capability to bind a listener existed and was exported, and conformance rested solely on nothing calling it. A gating check was added and proven to fail on a planted violation.

Two files were written into the legacy tree (`Architecture/verification/verify-control-plane-inprocess.js`, `Architecture/Certification/20_Q13_ControlPlaneVerification.md`) and one line added to its verification runner. This preceded the read-only instruction.

### Decision taken

The user directed a **complete Enterprise Re-Foundation**: build a new platform at `C:\DBIZAGENTICAI` from first principles; treat `C:\POC\DBIZIPEP` as a read-only knowledge base; do not migrate implementation, repository structure, or technical debt; author the new canonical architecture in `DBiz_IntelligencePlane/docs/architecture/`; create `program/` for implementation state only.

### Produced

- Root structure at `C:\DBIZAGENTICAI` (both plane directories, `program/`, `governance/verification/`)
- `CLAUDE.md` — programme charter and read order
- Eleven `program/` state files
- Founding decisions D-001…D-010 and prohibited decisions P-001…P-008
- Risk register seeded with R-001…R-010

### M0.3 — repositories initialised

Three repositories, because the Sovereign Split is a repository boundary rather than a folder boundary: the programme repository (`f319862`), the Intelligence Plane (`0b98bc6`), and the Execution Plane (`7382937`). Each plane's README declares what it owns and what it may never contain. R-010 closed.

### M0.2 — legacy lessons extracted

A read-only knowledge extraction over the predecessor's 22 baseline documents, 20 certification records, and 6 executable verification checks.

**The central finding: the predecessor's failure was not poor architecture.** Two independent reviews found no reason to change it and recommended none. Certification was withheld because *the verification apparatus that would have caught the violations did not run where the work happened*.

**The strongest empirical signal:** the one rule enforced by three independent mechanisms never drifted. Everything enforced by a single mechanism, or by prose alone, did.

Twelve mechanisms were derived and recorded as D-011…D-022, each mapped to a specific evidenced failure — among them: the conformant orchestration path existed and worked but sat behind an opt-in flag, so deployments ran the non-conformant default; a retention limit was customer-visible, validated, and API-served while being read by no code; a penetration engine was tier-listed and sold with no runner on disk, its dispatch wrapper logging the miss and returning soft failure; and two implementations of one hashing term produced false tamper verdicts on untampered evidence.

Three further prohibitions were added (P-009…P-011), and `TECHNICAL_DEBT.md` §3 now maps twelve debt classes to the mechanism and milestone that prevents each.

### Carried forward

- **Docker is not on PATH.** The predecessor's deployability was never proven for exactly this reason; this programme must not repeat that (R-005)
- **AD-010 warning recorded:** the predecessor deferred SPI signatures as "implementation detail" and then built one of eight declared adapter layers. Deferring the *how* is correct for a constitution and dangerous for a roadmap

### M1.1 — Platform Constitution authored

`DBiz_IntelligencePlane/docs/architecture/01-platform-constitution.md` (DRAFT v0.1, commit `5a1fd39`).

**Derived rather than asserted.** Its §2 walks from the problem — enterprises want AI-assisted QA, their data may not leave their tenancy — through six steps to the two-plane split, the authorship/sequencing separation, deferred certification, the decisions-here/evidence-there division, and the AI-generates/code-decides rule. Each step states the tension and the resolution, so a later reader can tell whether a rule still follows from its premise.

**Enforcement was made constitutional (§3).** A ranked hierarchy from prose (no enforcement value) through declared-but-unread configuration (*negative* value — it manufactures the appearance of a control) up to structural impossibility; a requirement of at least three independent mechanisms per rule; `NOT RUN` treated as `FAIL`; and every gate required to be observed failing against a planted violation before it is trusted.

**Eight invariants, eleven rules**, each with conformance criteria and named enforcement mechanisms. Several encode a specific predecessor failure as a structural prohibition — one orchestration path with no imperative alternative; refusal and unavailability as distinct types; physical tenant partitioning; and no export of a capability that must never run.

### Stopped at

**P0 complete; P1 in progress (M1.1 of 6).** Next: M1.2 — reference architecture, both plane architectures, cross-plane communication, and repository ownership.

Commits: programme `f319862`, `fbc79ae` · Intelligence Plane `0b98bc6`, `5a1fd39` · Execution Plane `7382937`.

---

## Session 2 — 2026-07-22

### Repository reality re-established

The two-repository mandate conflicted with what existed: three repositories, the third created at the container root to version programme state and governance tooling.

**Resolution.** `program/` and `governance/` moved into the Intelligence Plane; the root repository was retired. Deleting it outright would have left operational memory and governance-as-code unversioned — re-opening R-010 and reproducing the predecessor's exact defect, whose entire governance estate sat outside version control.

The Intelligence Plane is the correct home on ownership grounds, and on a stronger one: programme risks, debt and decisions are DBiz's internal operational record, and placing them in the customer-owned repository would leak DBiz operational posture across the sovereignty boundary.

The container root is now a plain directory holding two repositories, with a `CLAUDE.md` reduced to a bootstrap pointer carrying no source of truth. `CHARTER.md` replaced the former root charter and stopped restating architecture — ownership, the AI rule, the capability model and the enforcement hierarchy are now referenced from their canonical documents.

### The anti-duplication contract

`ARCHITECTURE_STATUS.md` §3 now assigns every architectural topic exactly one canonical owning document. Several topics named for M1.2 are authored in M1.3–M1.5 instead, because restating them in a structural document would create precisely the second source of truth the contract exists to prevent.

### M1.2 — seven documents authored

02 Reference Architecture · 03 Intelligence Plane · 04 Execution Plane · 05 Cross-Plane Communication · 19 Repository Ownership & Shared Package Strategy · 20 Cross-Plane Contracts · 21 Tenant Lifecycle.

**Three open decisions closed.**

- **AD-002** — plane-neutral code is distributed as versioned packages from a private registry, authored in the Intelligence Plane and consumed by the Execution Plane as a version-pinned dependency. Chosen over relative paths, submodules, a monorepo, duplication, and build-time vendoring because it is the only vehicle that makes version skew *visible*: a deployment declares exactly which contract version it was built against.
- **AD-003** — the wire format is JSON with JSON Schema, canonicalised deterministically for hashing, with detached signatures. Chosen over binary formats because a customer security team must be able to inspect exactly what DBiz instructed their tenancy to do, using no DBiz tooling. That is a procurement and trust requirement, and it outweighs the efficiency gap.
- **The integrity primitive** is fixed in architecture rather than deferred: exactly one implementation, mandatory domain separation, and an algorithm version on every record. Without the version, changing the algorithm becomes a flag day across hundreds of independently-scheduled customer deployments — a migration that cannot actually be performed.

### First governance gate built and proven

`governance/verification/verify-architecture-integrity.js` enforces five properties of the canonical set: required headers, declared ownership boundaries, mandatory conformance criteria, cross-reference integrity, and number uniqueness.

**It found a real defect on its first run.** The Platform Constitution stated enforcement mechanisms inline but carried no identified, citable conformance criteria — meaning a violation could be described but not *named*. The document was fixed rather than the gate, per P-001/P-002; the Constitution gained §6 with C-01.1 through C-01.32.

**Fault injection recorded (C-0.3).** A probe document with no ownership boundary, no conformance criteria, and a dangling reference was planted; the gate reported all three failures by name and exited 1. The probe was removed and the suite reconfirmed green.

### Stopped at

**P1 / M1.2 complete, gate green. 8 of 21 architecture documents in DRAFT.** Next: M1.3 — sovereignty, isolation, security, data flow, evidence flow.

### M1.3 — sovereignty, isolation, security, data flow, evidence flow

06 Data Sovereignty · 07 Tenant Isolation · 08 Security Model & Trust Boundaries · 09 Data Flow Model · 10 Evidence Flow Model. Gate green; 13 of 21 documents in DRAFT.

**Five open decisions closed.**

- **AD-006 / AD-017** — retention set per data class. C1 in the Intelligence Plane is ephemeral and never persisted; C3 is capped at 90 days so the plane cannot become a shadow data platform; decisions and audit records are held 7 years, because a certification must be defensible for the life of the release it authorised.
- **AD-004** — SHA-256 with mandatory domain separation, deterministic canonicalisation, and an algorithm version on every record. The version is what makes algorithm change survivable: without it, a change is a flag day across hundreds of independently scheduled customer deployments.
- **AD-016** — packages are signed by the Intelligence Plane and verified before execution. Verification failure is classed as a **refusal**, not unavailability — misclassifying it would cause the Execution Plane to degrade and continue, executing an unverified package.
- **AD-019** — customer-tenancy data is encrypted at rest under **customer-held** keys. If DBiz held them, the data would be functionally DBiz-accessible wherever the bytes sat, and the split would be a topology detail rather than a sovereignty guarantee.

**Three conformance criteria are deliberately adversarial**, because their positive-direction equivalents would have passed in the predecessor: C-06.5 reads raw storage and asserts absence rather than checking that a scrubber was called; C-09.5 breaks the schema on purpose and asserts the secret guard still fires; C-10.14 tests that *untampered* evidence never fails verification, which is the exact failure the predecessor shipped.

### Stopped at

**P1 / M1.3 complete, gate green.** Next: M1.4 — capability model and orchestration.

### M1.4 — capability framework, threat model, and AD-001 closed

11 Capability Model · 12 Capability Orchestration · 22 Security Threat Model. Gate green; 16 of 22 documents in DRAFT.

**AD-001 closed by ADR-0001** — TypeScript on Node 22 LTS, pnpm workspaces, NestJS, JSON Schema contracts with Zod. The decisive reason was not preference but structure: one language across both planes is what makes a single schema artefact validate identically on each side, and TypeScript's type system is expressive enough to make an incomplete capability fail to compile. A polyglot split was rejected outright because it would require two implementations of one schema — re-creating the predecessor's two-implementations-of-one-governed-term failure.

**The capability framework makes invalid states unrepresentable at four levels.** Omission is a compile error, because all twelve stages are required interface members. *Skipping* is a type error, because each stage consumes the previous stage's output type and those types are constructible only by their producing stage — so there is no value with which to call a stage out of order. Registration validates at startup, and CI asserts a verified execution path.

Two subtleties were made explicit rather than left to implementation. A stage that legitimately does nothing must return a **typed not-applicable result with a reason**, never an empty value — otherwise twelve stubs satisfy the requirement dishonestly. And the framework must expose **no test seam that fabricates a stage result**, because a helper added for testing convenience reintroduces precisely the bypass the type system removed.

**Duplication found and removed immediately.** Adding document 22 duplicated the threat table in 08. The table was removed from 08, which now defines controls while 22 defines the threats those controls answer. C-22.11 reconciles every attack path against a criterion that currently runs — a threat model decays into fiction the moment a mapped mitigation stops running, and nothing about the document would otherwise reveal it.

**Debt raised: D-001.** Seven decisions were closed inside architecture documents before ADRs became mandatory. Each has rationale and alternatives, none has a migration strategy or version impact. Recorded against M1.6 because the freeze is the moment it becomes expensive.

### Stopped at

**P1 / M1.4 complete, gate green.** Next: M1.5 — the six operating models, then M1.6 freeze.

### M1.5 — the six operating models, and AD-026 ruled

13 AI · 14 Tool · 15 Configuration · 16 Runtime · 17 Deployment · 18 Governance. **All 22 canonical documents now exist**; gate green.

**AD-026 closed by ADR-0002.** One orchestration lifecycle for the platform; capability-specific behaviour is expressed through extension points *within* it, never beside it. Two mechanisms: stage extensions, type-constrained to their host stage's input and output so they are invisible to the lifecycle; and directed stages, which require an authored package using the identical contract. Exchange count becomes `1 + directed stages` — so Inverse-Flow Discovery has three exchanges of the same exchange, not a different architecture. C-12.14 was amended accordingly and is no longer capability-dependent in form.

The accepted risk is recorded plainly: an extension mechanism is a bypass mechanism if not tightly bounded, which is why R-12.21 forbids an extension from altering its host stage's types. An extension that could produce a different type would be a stage in disguise, and the typestate chain would no longer constrain it.

**Decisions closed across M1.5.** AD-005 (configuration precedence — narrowing-only scope chain), AD-011 (storage layout, purgeable without scanning), AD-012 (contract distribution, customer-mirrorable), AD-014 (cloud portability), AD-015 (concurrency), AD-023 (PII posture — **drop on uncertainty**), AD-027 (timeouts and cancellation).

**Three rules encode predecessor failures directly.** R-15.18: a flag may protect a rollback path from the conformant default, never the reverse — defaults are architecture. R-14.12: a conformance suite is authored *before* the first implementation of its interface class, because a suite written afterwards encodes one vendor's quirks and the abstraction has been decorative since the day it was written. R-18.8: `NOT RUN` is a reported gate state treated as `FAIL`, because the predecessor's dashboard was green throughout the period a fitness test was failing — the check simply never ran.

### Stopped at

**P1 / M1.5 complete, gate green, 22 of 22 documents DRAFT.** Next: M1.6 — clear D-001, verify single authoritative ownership, re-run all gates, produce the Architecture Certification Report, freeze v1.0.

### M1.6 — certification and freeze

**Enterprise Architecture v1.0 is CERTIFIED and FROZEN.** 22 documents · 15 ADRs · 474 rules · 309 conformance criteria · 18 decisions closed · 17 open and recorded · 5 residual risks · 0 blocking debt.

**A second governance gate was built, and it immediately earned its cost.** `verify-adr-completeness.js` checks ADR structure in one direction and decision traceability in the other. On its first run it found **seven decisions closed during M1.5 with no ADR** — the identical D-001 pattern, recurring within a single phase, immediately after D-001 had been cleared under an explicit instruction to prevent it. Closed by ADR-0009 through ADR-0014.

That recurrence is the most useful evidence produced this session. The failure was not caught by discipline; it was caught by a machine. It is the argument for governance-before-runtime, demonstrated on this programme rather than argued from the predecessor's.

**Certification also found D-003:** AD-008 and AD-009 were open while the degradation matrix already specified behaviour depending on both — the architecture described a mechanism nobody had decided existed. Closed by ADR-0015, which bounds package caching by the package's own validity window rather than a separate TTL. A separate TTL would create a period in which a package is invalid for fresh execution but valid from cache, turning the availability feature into an authorised replay channel.

**Both gates were fault-injected in both directions** and observed to fail before being trusted (C-0.3). Both had already found real defects on first run — the architecture gate found the Constitution itself carried no citable conformance identifiers.

**One review was recorded as qualified rather than passed.** Performance is specified, not measured, because nothing runs.

---

## Session 2 — 2026-07-22

### AI Tool Agnostic Principle — first post-freeze amendment

A platform-wide principle was directed: the platform SHALL remain permanently AI tool agnostic. The instruction asked for a review of the canonical architecture, replacement of vendor references with capability terminology, and a new constitutional rule.

**The review found nothing to replace.** A scan of both planes for AI vendor, model and tool names returned **zero hits in any architectural or governance context** — every hit was the filename of the session bootstrap file. Provider abstraction, capability-named configuration keys and tenant-driven selection were already required by R-7.2, R-7.3, R-8.7 and R-13.10-R-13.14.

**The gap was somewhere the instruction did not point.** Every existing control governs the platform *as it runs*. Nothing governed the AI tooling used to *build, review and certify* it: R-18.22 named seven review stages and never said what performs them. A vendor name in a runtime module fails an existing gate; a vendor name in a review standard fails nothing and reads as helpful specificity. **The unguarded surface was documentation, not code.**

Closed by **ADR-0016** — the first amendment under R-18.26, and the first time the post-freeze change-control path ran for real rather than as a declared intention. Adds INV-9, Rule 12, the AI Capability Class taxonomy (13 §7), R-18.30-R-18.32, and eight conformance criteria. Documents 01, 13 and 18 move to v1.1; the certification report carries an amendment record (§12) so the certified baseline and the actual architecture cannot silently diverge.

**One directed detail was not adopted as given.** The principle proposed calling the classifications "capabilities". Document 11 is frozen and owns that word: exactly six certifiable units, a seventh requiring an ADR. Thirteen more would have made that cardinality rule uncheckable by inspection — a reviewer counting capabilities would get nineteen. The concept was adopted in full under a distinct name, **AI Capability Class**; the frozen document was not touched. Resolving a collision by renaming the *new* concept rather than editing the *frozen* one is the direction R-11.1 requires.

### Fault injection recorded (C-0.3)

`verify-ai-vendor-neutrality.js` was planted with two violations in `program/BACKLOG.md`: a product-named requirement (*"Implementation shall use <product> for architecture review"*) and an undeclared class (*"a Telepathy Capability Class"* [vendor-permitted: fault-injection record, R-12.5 context 4]). The gate reported both by file and line, named the undeclared class, and exited 1. The probes were removed and the suite reconfirmed green.

**The gate caught two real defects on its first run.** `RISKS.md` R-003 and R-006 cited the unversioned session bootstrap file as the source of a standing rule — simultaneously a vendor coupling and a precedence violation, since that file originates no rule and carries no authority. Both were repointed to `CHARTER.md` §5 and §16. Neither had been raised by any review, including the certification review that had just passed over them.

### Drift reconciled against disk

State files are claims; disk is fact. `IMPLEMENTATION_STATUS.md` still described P0 with both repositories `NOT STARTED`. `ARCHITECTURE_STATUS.md` §5 listed 2 ADRs and `DECISIONS.md` §5 read *"None yet"* — 16 exist. The duplicate ADR register was removed rather than synchronised: one index, in `DECISIONS.md` §5, referenced from the other.

**The most instructive finding was self-inflicted.** Populating that index, closure claims were written from ADR *filenames* rather than from the ADRs. Verified against the actual headers, **five of sixteen were wrong** — ADR-0008 closes AD-019 not AD-017, ADR-0011 closes AD-012 not AD-019, ADR-0012 closes AD-014 not AD-025, and two more. A plausible-looking index is worse than an absent one: it is *declared-but-unbuilt* applied to traceability, manufacturing confidence while carrying no information. Caught by checking source instead of trusting inference, in the very file being written to record that discipline.

### Debt raised

**D-004** — the Execution Plane is unreviewed against Rule 12 and its `README.md` carries the same bootstrap-file citation just corrected here. Not fixed in this change: a change spanning both planes in one step is prohibited. The gate must be copied there and run under that repository's own history, before P2 exit.

### Stopped at

**Architecture v1.1. Suite green: 3 of 3 gating checks.** One debt item open (D-004, owned, dated, blocking P2 exit). Next: P2 / M2.1 — the cross-plane execution package contract as a versioned shared package.

---

## Session 1 closing note

**P1 complete, certified, frozen at v1.0. Architecture Change Control in force.** Next: P2 / M2.1 — implement the cross-plane contract as a versioned shared package.

### P2 / M2.1 — the cross-plane contract package

**`@dbiz/contracts` v1.0.0.** TypeScript strict on Node 24, pnpm workspace, Zod validation, generated JSON Schema, RFC 8785 canonicalisation, SHA-256 domain-separated integrity. **58 tests, 4 governance gates green.**

**First amendment raised by implementation contact.** ADR-0001 fixed the runtime at Node 22 LTS; the environment provides Node 24. Rather than silently using 24, [ADR-0017](../docs/adr/ADR-0017-runtime-baseline-node-24.md) amended the baseline through change control. It also rejected "current LTS" as the baseline: a version can be asserted by a gate, a moving reference cannot, and per C-0.4 an unverifiable criterion counts as NOT RUN and therefore FAIL. This is the precedent the process was built for.

**The traceability gate found two untested claims on first run.** `verify-implementation-traceability.js` requires every source file to trace to architecture, ADR and criteria — and every claimed criterion to be exercised by a test. It caught C-20.4 and C-19.4 claimed in source with no test asserting them. Fixed by adding the surface test suite.

**One test was sharpened rather than the code changed.** The C-19.4 heuristic flagged `GateDefinitionSchema` for matching `/^gate/`. That is not a violation: R-20.7 requires gate definitions to be *carried* by the Execution Plane and evaluated only by the Intelligence Plane, so a schema for a gate belongs in contracts while an evaluator would not. The test now excludes declarative `*Schema` exports and separately asserts that no evaluator exists — a stronger assertion, not a weaker one.

**Design choices worth recording.** Hashing has no overload omitting the domain, and `HashDomain` is a closed union, so an undeclared domain is a compile error. Verification failures are *classified* — "algorithm unsupported", "malformed digest" and "content altered" are different facts, and collapsing them into a bare false is how the predecessor's false tamper verdicts became indistinguishable from real corruption. Canonicalisation rejects NaN, Infinity and undefined rather than letting `JSON.stringify` silently emit `null`, which would make distinct inputs hash identically.

### Stopped at

**P2 / M2.1 complete and verified.** Next: M2.2 — consumer compatibility harness.

### Strategic principles adopted; ADR-0018; D-004 closed

**Twelve strategic recommendations adopted as permanent principles.** ADR-0018 classifies them, and two needed change control rather than absorption.

**A cardinality collision was caught before it landed.** "Create a Platform Intelligence capability" would have been a seventh capability against R-11.4, which fixes the platform at exactly six. It is not a capability at all — it performs no quality engineering against a customer system and yields no certified verdict, and document 11 states that test mechanically. Platform Intelligence, Operational Excellence and Customer Success are **platform services**. R-11.4 is confirmed, not amended. Recorded explicitly because the phrasing is natural enough that, unexamined, it would have produced the seventh capability.

**Documents 23, 24 and 25 are scheduled** for the unowned topics — SLOs and incident management, platform intelligence, customer success — rather than stretching an existing document to answer unrelated questions.

**The scorecard is generated, never authored.** A hand-written scorecard asserting compliance is the declared-but-unbuilt failure class exactly: it manufactures confidence rather than measuring it, and is more dangerous than no scorecard because it is persuasive. `NOT MEASURED` is never a pass; maturity levels are derived from evidence, and an area cannot exceed Level 3 without a gate.

**The generator found two defects in its own measurement on first run** — an unanchored regex reporting 0/1 tests against an actual 58/58, and a debt count that included the closed-debt table. Both fixed; parsing failure now degrades to `NOT MEASURED` rather than guessing, because a scorecard reporting a wrong number is worse than one reporting that it cannot tell.

**First honest baseline: 7 of 14 metrics measured, average maturity 1.7 of 5, no area above Level 3.**

**Drift found in my own work.** ADR-0017 listed `CHARTER.md` §5a as an affected component and I had not updated it — the charter still declared Node 22. Corrected. No gate currently checks that an ADR's affected components were actually changed; that is a real gap, recorded for a future increment.

**D-004 closed in the Execution Plane's own repository and history.** Rule 12 was enforced in the Intelligence Plane only. The gate now runs in both, and it does not read the Intelligence Plane's taxonomy — reaching across the boundary by filesystem path is itself the violation it checks for. Its first run failed on a README line that was wrong three ways: it cited the unversioned bootstrap as authoritative, used a stale programme-state path, and pointed across the plane boundary.

### Stopped at

**P2 / M2.1 complete; strategic principles recorded; debt register empty.** Next: M2.2 — consumer compatibility harness.

### Evidence over assertion — Constitution v1.2, and governance that validates itself

**ADR-0019 amends the Constitution to v1.2**, adding INV-10 and Rule 13. Additive; no invariant weakened.

**The amendment was motivated by a defect in this estate.** Every fault-injection proof recorded before it existed only as prose in a commit message or a document — *the rule requiring evidence over assertion was itself backed by assertions about evidence*. R-13.4 now requires machine-readable proofs, and prose does not satisfy it.

**Proofs are re-run, never transcribed.** `record-fault-proofs.js` plants a real fault per gate, observes real exit codes, and requires the gate to **name the planted cause** — a gate that fails for an unrelated reason has detected nothing. Transcribing prose into JSON would have converted an assertion into a machine-readable assertion, which is the substitution R-13.1 forbids.

**Six gates, six proofs, all proved.** Two new gates: change-control completeness (does every ADR's declared affected component actually exist?) and governance self-validation.

**Three real defects were caught by the new gates on their first runs.**

1. The recorder introduced a vendor literal into the repository, turning the AI-neutrality gate red. Fixed by assembling the literal from fragments rather than taking an inline exemption — an exemption would have suppressed detection on that line permanently.
2. Five ADRs were reported as orphans. **That was a false positive of my own making**: the change-control gate curated its corpus by hand and omitted `DECISIONS.md`, the actual ADR index. The corpus is now derived, not curated. A check that cries wolf trains reviewers to ignore it.
3. A gate present on disk but unregistered in the runner reports `NOT RUN` and therefore has zero enforcement value. This is not hypothetical — the AI-neutrality gate shipped unregistered and was caught only because someone looked. Self-validation now checks it, and that is the fault its own proof plants.

**One bootstrap limitation is recorded rather than hidden.** The self-validation gate cannot audit its own proof entry without infinite regress. The exclusion is narrow — checks 2 and 3, its own entry only — is stated in the file, and the gate is still fault-injected like every other. What is not evidenced is it auditing itself, and that is written down instead of covered by a passing check.

**The Governance Confidence Index is live: 87%, over 9 of 14 inputs measured.** Coverage is published beside the score deliberately, so a high score over few inputs cannot read as confidence. Five inputs report `NOT MEASURED`, including cross-plane enforcement — measuring that requires a programme-level collector observing both repositories, because neither plane may read the other.

### Stopped at

**Six gates green, six proofs recorded, ERI 8/15, GCI 87%, maturity 1.7/5, debt register empty.** Next: P2 / M2.2 — consumer compatibility harness, which is what turns Contract Compatibility from `NOT MEASURED` into a measurement.

### P2 / M2.2 — consumer compatibility, provenance, continuous verification

**Constitution v1.3** (ADR-0020) adds INV-11 and Rule 14 additively. **Trust expires.** The platform could previously demonstrate a claim was true *once*; nothing established it was true *now*. A proof recorded months ago counted identically to one recorded this morning, so a gate that silently stopped detecting would keep paying its original confidence forever.

**M2.2 complete — Contract Compatibility no longer reports NOT MEASURED.** A frozen fixture corpus (7 instances at v1.0.0, retained permanently) plus a harness proving 9 properties: backward compatibility, forward compatibility, optional fields, version negotiation, contract negotiation, capability negotiation, breaking-change detection against a recorded baseline surface, consumer upgrade validation, provider compatibility.

**Why fixtures rather than tests.** A test written against the current schema proves the schema agrees with itself. Parsing a fixture frozen at v1.0.0 proves the current build has not broken a consumer that still sends v1.0.0 — which is the actual commercial promise.

**Two new gates, both catching real defects immediately.** Architecture fitness validates the invariants themselves — cardinality, platform-service classification, sovereign split, contiguous invariants and rules, twelve stages, freeze integrity. An invariant can be weakened by editing the document that declares it, and every other gate would stay green because the document would remain internally consistent and wrong.

**The compatibility gate found a defect in itself.** The harness crashed on an unguarded parse before writing evidence, and the gate accepted 48-second-old stale evidence as current — reporting PASS while the harness exited 1. Two fixes: a non-zero harness exit now fails the gate outright, and evidence must post-date the start of *this* gate run rather than fall inside a tolerance window. Any window wide enough for clock skew is wide enough to accept a crashed generator's leftovers.

**Provenance and replay.** Every proof carries generator, generator version, execution context, repository, branch, commit, ADR and rule references, timestamps, expiry, content hash, verification and certification status. Each fault is observed twice and must produce an equivalent outcome — a proof that cannot be reproduced is not a proof.

**GCI v2 publishes three numbers, never one.** Score 93%, coverage 14/19, freshness 100% of window. Confidence decays with age and reports NOT CURRENT on expiry rather than a low number, because expired evidence contributes nothing and is never averaged in as partial credit.

**The neutrality gate caught this session's own design document** citing the unversioned bootstrap file as a rule source — precisely the violation that check exists for. Fixed by citing the versioned owner.

**Programme-level collector: designed, not built.** The sovereignty constraint rules out most designs — a collector that polls the Execution Plane needs an inbound path into a customer tenancy, which INV-3 forbids. The design is push-based: each plane publishes a signed manifest of conformance facts and the collector aggregates manifests without reading a repository. Four open questions recorded, the sharpest being that a customer *declining* to publish must remain distinguishable from a plane *failing* — conflating them would penalise the exercise of a sovereignty right the platform explicitly grants.

### Stopped at

**8 gating checks green · 8 proofs recorded and replayed · 58 tests · ERI 9/15 · GCI 93% (14/19 coverage, fresh) · maturity 1.7/5 · debt register empty.**

Deployment Readiness and Supply Chain Security remain honestly NOT MEASURED — Docker is unavailable and no SBOM tooling exists. Neither was simulated.

### P2 / M2.4 — trusted software supply chain (partial), and the RCI

**Supply Chain Security is no longer NOT MEASURED — it is 11 measured, 3 NOT MEASURED.** That distinction is the whole point. SBOM currency and provenance, lockfile integrity, frozen resolution, vulnerability scanning, licence policy and **build reproducibility** are measured. Artefact attestation, package signing and trusted promotion have no tooling present, are reported as unmeasured, and are **not claimed**.

**Reproducible builds are genuinely verified**: two clean builds produce byte-identical output across 48 artefacts. `.tsbuildinfo` is excluded deliberately — it records absolute paths and timestamps by design, and excluding it is a statement about what reproducibility means here rather than a convenience.

**The Release Confidence Index was introduced** because the roadmap requires it and it did not exist. ERI asks *is the platform ready?*; GCI asks *can the system that told you so be trusted?*; **RCI asks *can this build be shipped?*** They are not interchangeable — a platform can be architecturally ready with trustworthy governance and still produce a build that must not ship. RCI is 100% over 6 of 10 inputs; deployment, operational, customer and security readiness are excluded and reported, never scored as zero.

**The fault probe contaminated the repository, and that was the most useful finding.** The supply-chain fault originally planted a workspace manifest to force lockfile drift. pnpm resolved it, rewrote the lockfile and installed a real package — so **the recorder became a source of the defect it exists to detect**, exactly as its own comments warn against. Two fixes followed: the gate now snapshots and restores the lockfile so a drift check cannot persist the drift it finds, and the fault moved to build output, which triggers no install.

**A second interaction surfaced from the same work.** The supply-chain gate rebuilds `dist` as part of its reproducibility check, which erased the probe before the replay observed it and recorded a spurious non-determinism. The recorder now **re-plants the fault before replay**, because some gates legitimately consume what they inspect.

**M2.3 is absorbed into M2.4.** Package publication and signing are supply-chain concerns; separating them would have split one pipeline across two milestones.

**A sequencing conflict in the roadmap is recorded rather than worked around.** M2.6, M2.7 and M2.8 ask for Operational Excellence, Customer Success and Platform Intelligence to be implemented — but ADR-0018 assigned each a canonical document (23, 24, 25) and none is authored. The build order forbids implementing before architecture. Implementing SLOs before document 23 exists would mean writing the operational model in code and back-filling the document to match, which is how the predecessor's architecture came to describe a system nobody had built. Proposed resolution: an architecture increment **M2.5a** authoring the three documents, preserving every milestone objective and making only their prerequisite explicit.

### Stopped at

**9 gating checks green · 9 proofs recorded and replayed · 58 tests · ERI 10/15 · GCI 94% (14/19, fresh) · RCI 100% (6/10) · maturity 1.7/5 · debt register empty.**

Deployment Readiness remains `NOT MEASURED` — Docker is unavailable and no simulated evidence was produced.

### P2 / M2.5a — Platform Service architecture baseline

**Documents 23, 24 and 25 authored and frozen** — Operational Excellence, Platform Intelligence, Customer Success. 43 new conformance criteria. Each declares itself a **Platform Service**, and a fitness function now reads that classification line, because a service document declaring itself a capability would create a seventh under a different name while document 11 still counted six.

**Both matrices are generated, never hand-maintained.** A hand-kept coverage matrix is the declared-but-unverified failure in its purest form: it asserts that architecture, milestones, implementation and evidence line up, nothing checks that they do, and it stays green precisely because nobody updates it.

**The coverage map is an input, not a measurement.** Document-to-milestone mapping cannot be derived — nothing in an architecture document knows which milestone will build it. It is kept outside the frozen documents deliberately: a milestone recorded inside a frozen document would require amending frozen architecture every time the roadmap moved, which is what a freeze prevents. Architecture states what shall be true; the programme states when it will be built. The input is still validated — an entry naming a milestone the plan does not define is reported as a phantom, so the map cannot make the matrix green by pointing at nothing.

**The traceability gate checks chain contiguity, not just population.** Release and Customer Deployment are `NOT MEASURED` because nothing has been released or deployed. The gate additionally requires unmeasured stages to be **contiguous at the end** — an unmeasured stage *between* two populated ones would mean evidence exists on both sides of a gap nobody can cross.

**Two findings raised and closed.** The integrity gate caught documents 23–25 using "Certification criteria" where all 22 frozen documents use "Conformance criteria" — two names for one section is a terminology fork, and forking the standard's own vocabulary is exactly the duplication the anti-duplication contract prevents. Aligned. And 22 documents had no implementation owner; resolved by the coverage map rather than by bulk-editing frozen architecture, which would have been adjusting artefacts to flatter a metric.

**GCI fell one point while coverage rose** — 94% to 93%, as two new inputs entered the denominator. That is correct. An index that only rose when new measurement was added would not be measuring anything.

### Stopped at

**10 gating checks green · 10 proofs recorded and replayed · 25 documents frozen · 20 ADRs · 360 criteria · 0 orphans.**

ERI 11/16 · GCI 93% (16/21, fresh) · RCI 100% (7/11) · maturity 1.7/5 · debt register empty.

M2.6, M2.7 and M2.8 are unblocked — architecture now precedes them. M2.5 remains blocked on Docker.

### P2.3 — Tenant Onboarding & Secure Solution Generation

**Integrated by amending three existing documents, not by creating a twenty-sixth.** [ADR-0021](../docs/adr/ADR-0021-platform-core-bounded-context.md) records both the design and the placement decision.

**The instructed placement would have created the drift it was meant to avoid.** Platform Core was to go into document 24. But document 21 already owns *"tenant identity, onboarding, provisioning, state transitions, suspension, and offboarding"*, and document 08 already owns *"trust boundaries, identity, authentication, authorisation"*. Putting Platform Core in 24 would have given onboarding two owners and authentication two owners — the exact anti-duplication breach the topic-ownership contract exists to prevent, and it would have made document 24 answer two unrelated questions: analytics *and* provisioning.

**Resolution: distribute to the documents that already own each concern**, and put the genuinely new material where it belongs.

| Material | Document | Why |
|---|---|---|
| Bounded contexts, Technology Profiles, Solution Generation Engine | **03** v1.1 | It owns IP internal structure; a bounded context *is* internal structure. Generation is new and had no owner. |
| Onboarding workflow, EP bootstrap, lifecycle extensions | **21** v1.1 | Already owns onboarding and lifecycle. |
| Secure registration, mTLS/OAuth, rotation, replay | **08** v1.2 | Already owns identity and authentication. |

Document 24 was **not** amended — Platform Core is not analytics.

**Platform Core is a bounded context, not a plane.** The Intelligence Plane holds exactly two logical contexts inside **one deployable**. R-1.1 is untouched. Separating them as contexts rather than services is what lets the statelessness rule stay precise: onboarding is episodic and stateful, reasoning is per-request and stateless, and one undifferentiated plane could not state both truthfully.

**Three design points worth recording.**

*Stage 8 belongs to the customer.* Onboarding is not one continuous automated flow but two, separated by a deployment only the customer can perform — because designing it as one flow would require the inbound access INV-3 forbids.

*The generated repository carries no durable secret.* A credential shipped inside a repository lives in its history forever, readable by everyone who ever clones it, and no rotation policy reaches it. A one-time credential that dies on first use has a blast radius measured in minutes.

*Drift is reported, never auto-corrected.* Auto-correction would silently overwrite customer work in a repository the customer owns, making the platform the least trustworthy component in their own codebase.

**Governance validated:** 25 documents · no document 26 · 3 Platform Services · 6 capabilities · 2 deployable runtimes · 10 gates green · 10 proofs replayed. M2.5a baseline intact — no document's *boundary* changed; each gained material inside the boundary it already declared.

### Stopped at

**P2.3 architecture integrated. ERI 11/16 · GCI 94% (16/21, fresh) · RCI 100% (7/11).** Next: M2.6 — Operational Readiness, which now also carries the Platform Core implementation surface.

### P2.3 — certification record and diagram correction

The P2.3 brief was re-sent verbatim after implementation. Rather than re-doing work already committed at `2712b95`, the genuinely outstanding items from its OUTPUT list were closed.

**The primary structural diagram was corrected.** Document 03 §2 predated the amendment and did not show the bounded contexts. It also labelled a subgraph "Platform services", which now collides with the Platform Service classification of documents 23–25 — a small but real terminology drift. Renamed to "Platform-owned state", with the distinction stated in the surrounding text.

**A certification record was produced** covering the two OUTPUT items that existed only as ad-hoc command output: the governance validation (five assertions, each verified mechanically) and the certification evidence requirements (twelve artefacts M2.6 must produce, all currently `NOT MEASURED`).

**Recording the evidence requirements now is the point.** Fixing what implementation must produce *before* it is implemented stops M2.6 declaring itself complete against a narrower set chosen after the fact. E-3 (generate twice, byte-compare) and E-5 (read the stores, find nothing) are the two that cannot be satisfied by configuration.

**The single divergence is recorded with its reversal cost.** Platform Core was placed in documents 03, 21 and 08 rather than 24, because 21 and 08 already own onboarding and authentication respectively. Reversing to the instructed placement requires a superseding ADR, an impact analysis on the topic-ownership contract, and re-certification of M2.5a — because document boundaries would change. That cost is written down rather than left to be discovered.

### Stopped at

**P2.3 certified. 10 gates green · 10 proofs replayed · 25 documents · 21 ADRs · 0 duplicate topic owners.**

### P2 / M2.6 — Operational readiness (partial)

**Four properties proven by execution; nine NOT MEASURED with named blockers. Nothing simulated.**

| Proven | Method |
|---|---|
| E-3 deterministic generation | generate twice in separate processes, byte-compare — 13 files, identical hash |
| E-5 non-retention | 124 files scanned across 4 Intelligence Plane store roots, 5 artefact kinds, none found |
| C-23.9 restore | back up 4 evidence artefacts, **destroy them**, restore, verify content hashes |
| E-11 replay | re-execute, compare outcome |

**C-23.9 was the criterion document 23 called unavoidable** — *"every other operational control can be satisfied by configuration; restore can only be satisfied by doing it."* The exercise destroys the working copies first, because a restore check that never removes anything proves only that the files were already there; and it recomputes content hashes, because a check asserting "the file exists" passes against an empty file. It also restores from backup if it fails mid-exercise — a restore validator that could lose the evidence it validates would be the worst possible source of data loss.

**`@dbiz/platform-core` was built** — Technology Profiles with a supported-combination registry, and a Solution Generation Engine producing 13 deterministic files including the bootstrap client carrying exactly three registration values. 24 tests.

**Three defects found by the new tests and fixed.**

The most instructive: `frameworkVersions` was a declared profile field **that no generator consumed** — configuration theatre, in new code, written by the process that exists to prevent it, and caught by a machine rather than by review. Fixed by pinning versions into a generated dependency manifest, which is also the honest use of the field since an unpinned framework version undoes determinism one layer down.

The fault recorder was also leaving **empty directories** behind after removing planted probes; `packages/__fault-probe/` was found in the working tree. Residue is residue whether or not it has contents.

And `platform-core/src/index.ts` claimed C-03.13 and C-03.14 with no test citing them — caught by the traceability gate. Boundary tests added: no listener-binding code, no start script, no Intelligence Core dependency, and no package importing platform-core.

**M2.6 is recorded as partially complete, not complete.** Its success criteria require certificate rotation and tenant isolation to be proven, and both are unmeasured because no runtime exists to prove them against. Declaring the milestone complete on the subset that happened to be achievable would be choosing the target after seeing the result.

### Stopped at

**11 gating checks green · 11 proofs recorded and replayed · 42 tests across two packages.**

ERI 11/16 · GCI 94% (16/21, fresh) · RCI 100% (7/11) · debt register empty. Nine operational properties blocked on runtimes that do not yet exist — none blocked on an unresolved decision.

---

### P2 / M2.6 — Operational readiness completed

**The runtime that nine properties were waiting for was built, and those properties are now proven against it.**

`@dbiz/platform-runtime`: a real X.509 certificate authority driven through OpenSSL; an authorisation server issuing OAuth tokens **bound to the certificate key** via a `cnf.kid` confirmation claim; a mutual-TLS API gateway running an ordered eight-check pipeline that fails closed; an atomic, idempotent registration service; and a tenant runtime whose every location comes from a single validated path constructor. 58 tests. **No third-party dependency was added** — the lockfile change is the workspace entry alone.

**Sixteen operational properties are now proven by execution; one remains NOT MEASURED.** E-2's deployment leg is blocked on Docker and is recorded as the exception it is, rather than closed by a container that was never started. M2.6's success criterion was that every remaining unmeasured property becomes PASS; one did not, and the certification says so in its title.

**The mTLS test taught the lesson of this milestone.** The first version asserted that an unauthorised client's handshake failed — and it hung instead of passing. Under TLS 1.3 the client sends its certificate *after* the server's Finished message, so a client the server will reject still observes its own handshake succeeding, then a bare close. Asserting on `secureConnect` would have let a forged certificate look accepted; the promise simply never settled because nothing handled `close`. **"Was a response served?" is the only signal that cannot be fooled that way.** The bug was in the test, and the test was the thing being trusted to prove the security property.

**The operational gate now carries a second fault proof, and it is the sharpest question available:** if the API gateway stopped refusing unauthorised callers, would governance notice? The recorder replaces the runtime's built entry point with a gateway that answers `200` to everything, runs the gate, and observes it fail and name the cause. The original bytes are snapshotted and restored. The fault targets build output deliberately — a probe planted in source or in the lockfile makes the recorder a source of the defect it exists to detect, which has happened here once already.

**Three governance defects were found while wiring the evidence in.**

The operational gate's anti-erosion list still named **four** properties after twelve existed — the check whose entire purpose is preventing silent shrinkage had itself gone stale.

The scorecard counted tests in `@dbiz/contracts` **only**, reporting 58 when 140 pass. It had silently stopped describing the platform two packages ago. A scorecard that undercounts looks conservative and is simply wrong: it would have hidden any regression in what it had forgotten. It now enumerates every package with a built test tree and refuses to skip one whose suite cannot be read.

And `verify-governance-self-validation` kept **one proof per gate** in a Map keyed on gate name, so adding a second fault would have retired the first from audit without anyone deciding to. Proofs are now grouped, and every proof for every gate is checked.

**`PROJECT_STATE.md` and `IMPLEMENTATION_STATUS.md` had drifted badly** — both still claimed no runtime code existed and that the programme stood at M2.1. They are the files the charter calls authoritative, and they were the least accurate artefacts in the repository. Rewritten against what is on disk.

### Stopped at

**11 gating checks green · 12 proofs recorded and replayed · 140 tests across three packages.**

ERI 13/16 · GCI 97% (16/21, fresh) · RCI 100% (7/11) · debt register empty. Security Compliance moved from NOT MEASURED to 8/8 enforcement properties proven; Operational Readiness to 16/16 proven with 1 NOT MEASURED. Deployment Readiness remains NOT MEASURED, correctly and unchanged.

---

### P2 / M2.7 — Customer Success readiness

**Five of the six declared supported targets were declared-but-unbuilt, and nothing had noticed.**

The solution generator emitted TypeScript sources for every language in the registry. A customer selecting `python` received `register.ts`; a customer selecting `java` received the same, with no `pom.xml`. A file *count* could not see it, because the count was identical. This is the platform's characteristic failure — R-11.2 — applied to its own compatibility claims, and it is exactly what C-25.8 was written to catch.

**The registry was not narrowed to hide it.** Withdrawing support the moment it is measured is a different way of avoiding the work. Each language now emits its own sources, dependency manifest, test layout and a base image matched to its runtime. A Java solution on a Node base image is a solution that cannot start, and it would have looked correct in every review.

**`@dbiz/customer-success` was built as a Platform Service, not a seventh capability.** Guided onboarding that validates before it creates anything and finishes by verifying a real authenticated call; a diagnostics toolkit where every non-pass names a remedy; a `dbiz` CLI whose failure paths are tested harder than its happy path; thirteen guides, ten runbooks and an OpenAPI document, all generated from validation output. 38 tests.

**The runbook generator refuses to emit a runbook whose steps name an operation the platform does not have.** Throwing rather than warning is the point: a procedure referencing a non-existent operation is discovered during an incident, at the worst possible moment.

**Fifteen customer readiness properties are proven by execution; four are NOT MEASURED.** K-12 is the one worth reading carefully. The brief asked to verify a customer can onboard in under 30 minutes. What can honestly be measured is the automated path, and it is — 186ms across seven steps. What cannot be measured without a customer is a customer. Reporting 186ms as "onboarding takes under 30 minutes" would be true and misleading at once.

**An intermittent gate failure turned out not to be a flake.** The customer readiness gate failed once, did not reproduce, and the temptation was to record it as noise. It was a real defect: a measured wall-clock duration was being rendered into the generated documents, so two builds of the same release produced different bytes and a customer could not verify they held what was published. A duration describes the RUN; the documents describe the RELEASE. The number moved to the manifest. The property that caught it — *two builds are byte-identical* — had been written in the same session, for exactly this reason.

**Three more defects, each found by a check rather than by review.** The authentication guide carried a JWT-shaped literal, caught by the platform's own credential scan — a realistic-looking token reads as a credential to every scanner and teaches a reader nothing. `.env.example` would have been flagged as a retained secret file by the E-5 non-retention scan, so the file ships as `env.example`: loosening a security scan so documentation can use a familiar filename trades a real control for a cosmetic one. And the harness was recording a content hash for a package it had refused to publish, which manufactured an inconsistency indistinguishable from a real one.

**A boundary test was enforcing something broader than the criterion it cited.** C-03.14 says "Intelligence Core does not depend on Platform Core"; its test asserted that *no* package did. Identical while only one other package existed, and wrong once a Platform Service legitimately needed the generator. **The test was not relaxed to fit the new code** — it now enforces the criterion and keeps a stricter allowlist, so a future importer must be admitted deliberately with a stated reason. An allowlist fails closed; a denylist of Intelligence Core names fails open the first time one is named something unanticipated.

**The customer readiness gate is fault-proved by reintroducing the defect this milestone removed** — a generator emitting TypeScript for every language. If that fault did not turn the gate red, C-25.8 would be decorative and the supported-target list would be a list of intentions again.

**WebdriverIO was named in the brief and is not supported.** It is not in the registry, so it appears in no example, matrix or guide — the brief's own rule forbids unsupported technology in customer documentation. Recorded as a roadmap item rather than quietly satisfied.

**The fault recorder now states its own chicken-and-egg instead of leaving it as tribal knowledge.** After any gate is edited, the self-validation gate fails its clean run because it compares against the registry that run is about to replace; a second run settles it. That procedure is now printed, not remembered.

### Stopped at

**12 gating checks green · 13 proofs recorded and replayed · 179 tests across four packages.**

ERI 15/18 · GCI 97% (16/21, fresh) · RCI 100% (9/11) · debt register empty. Customer Readiness entered the scorecard at 15/15 proven with 4 NOT MEASURED; Customer Documentation at 58 generated files. Deployment Readiness remains NOT MEASURED, correctly and unchanged.

---

### P2 / M2.8 — Production readiness

**The mission asked for General Availability certification. It is withheld, and the reason is one sentence: nothing has ever been deployed.**

Docker is unavailable, so E-2 has been `NOT MEASURED` since M2.5 and still is. Every figure produced this milestone was measured in-process on one machine, and no in-process measurement is evidence about a deployed system. A GA certificate on this evidence would be the most expensive false claim available to this programme — it is the one a customer would act on. What M2.8 does establish is narrower and worth having: **when this platform runs, its health is observable, its failures are diagnosable, and its releases are verifiable.**

**Two real defects, both found by measurement rather than review.**

Tokens did not survive a restart. The signing key was generated per process, so a restarted instance rejected every token the previous one issued — a routine deploy was a customer outage, and no test before M2.8 could see it because none had ever restarted the platform. Fixed by loading the key from state, using the custody model the certificate authority already had for its root key rather than inventing a second scheme under delivery pressure.

Replay protection did not hold across instances. Nonces lived in a per-process map, while document 17 declares this plane *"multiple per region, horizontally scaled"*. **A nonce refused by one instance was accepted by another — no restart needed, a load balancer was sufficient.** The store is now injectable, the platform reports when the single-process default is in use, and readiness reports it as degraded. Supplying a shared implementation is a deployment obligation, recorded as **D-003**.

**The second defect was nearly missed, and how it was caught is the lesson.** The first restart scenario asserted only that the replayed request was refused. It was — with `bad-signature`, because of the *first* defect. A refusal for an unrelated reason is a false pass, and it was concealing a real replay exposure. Asserting on the **reason** rather than the status exposed both.

**A modelling error cost the platform its own availability metric.** The first version of the operational run counted every non-403 refusal as an availability failure, so refusing a replayed nonce or a stolen token drove the gateway SLI down and the tenants the platform had just protected were reported as degraded. *Unexpected* means the platform failed, not that it refused. Left unfixed it would have produced a permanently amber metric that operators learn to ignore — which is how an objective becomes decoration.

**`@dbiz/observability` was built against documents 23 and 24, which already owned this surface.** No architecture document was modified. Telemetry that refuses customer content at the call site rather than redacting it downstream; health, readiness and liveness as three genuinely different answers; an SLO registry that refuses an objective without a consequence and a budget that retargeting cannot reset; six dashboards generated from the metric registry where **every panel declares what its emptiness means**; and an intelligence layer that observes and never acts, enforced by a source scan rather than a comment. 57 tests, weighted towards absence — the properties that decay silently.

**Silence is `unknown`, never `healthy`.** That is C-24.7 and it is the hardest property in this milestone to keep, because every convenience erodes it: a default of zero, an average that skips nulls, a value carried forward from the last window. Each one quietly converts *unmeasured* into *fine*. The gate's fault proof replaces the health monitor with one that reports green whenever its dependencies are up, ignoring whether anything reported at all — and the gate goes red. If it did not, every dashboard in this milestone would be worth nothing.

**The gate also checks the claim, not only the measurement.** It verifies that `certificationStatus` has not quietly become `certified`, that the `generalAvailability` field still reads `NOT CERTIFIED`, and that the deployment gap is still reported. The most likely route to a false claim here was never a broken measurement; it was a passing measurement rounded up in a summary.

**Technical debt rose from zero to one, and that is an improvement.** A register at zero because nothing looked hard enough is worse than one carrying a real, named, owned item.

### Stopped at

**13 gating checks green · 14 proofs recorded and replayed · 236 tests across five packages.**

ERI 18/21 · GCI 97% (16/21, fresh) · RCI 100% · 1 debt item open. Production Readiness entered the scorecard at 36/36 measured with 5 NOT MEASURED; Observability at 6/6; Performance moved from NOT MEASURED to 9/9 benchmarks within target. **General Availability entered as `NOT MEASURED` and stays there until something is deployed.**

---

### General Availability — determination

**The mission was to obtain deployment evidence. It could not be obtained, and General Availability remains NOT CERTIFIED.**

No container runtime exists on this machine. Eight were searched — docker, podman, nerdctl, ctr, finch, kubectl, kind, minikube — across the PATH and every known install location. WSL is not installed. The session is not elevated, so none could be installed either. That is the entire blocker, and it is now a **measurement rather than a sentence somebody wrote**.

**That change is the substance of this session.** "Docker is unavailable" had been carried as a stated blocker from M2.5 through M2.8, and a stated blocker is an assertion — which R-13.1 does not accept as evidence. A probe now enumerates every runtime the platform would accept, on every build, and reports what it found with full provenance. If a runtime appears, the blocker disappears on the next run without anyone remembering to edit a document.

**The most important artefact built this session is a gate that makes a false claim impossible.** `verify-general-availability.js` derives the determination from E-2 by a single expression — no flag, no override, no configuration — and then **searches the entire repository** for any document claiming otherwise. A gate that only checked its own evidence file would be bypassed by writing the claim somewhere else, which is exactly where it would be written.

It is fault-proved by planting a document that makes the very claim the gate forbids. The gate goes red and names the file and the line.

**It then caught its own author.** This entry originally quoted that planted claim verbatim while describing it, and the gate failed the build on this file. That is the correct outcome — a bare assertion sitting in a repository is dangerous regardless of the paragraph around it, and prose explaining a fault is not exempt from the rule it is explaining. The lesson is now recorded three times in three places: the AI-vendor probe, the fault recorder, and here.

**That gate exists because the remaining risk is not technical.** Every measurement in M2.6–M2.8 passed. The platform is observable, diagnosable, isolated and verifiable. What is left is the possibility that someone, reasonably, under delivery pressure, writes CERTIFIED in a summary where a measurement should have gone — and twelve green milestones make that *more* likely, not less. The more that is genuinely proven, the more natural it feels to round up the remainder.

**The recorder taught the same lesson twice.** Planting a fault that contains the literal claim turned the repository red on a clean run, because the GA gate scans the recorder too. The fix was the one already established in that file for the AI-vendor probe: assemble the literal from fragments, rather than exempt the file from the scan. An exemption would have created a permanent blind spot in exactly the place a fault author works.

**`deploy/Dockerfile` was authored, and it proves nothing.** R-17.1 requires an Intelligence Plane image and none existed. It is marked in the file, in the probe output and in every report as **never built and never started**. Document 17 is explicit about why that distinction cannot be softened: *an image that builds is not an image that runs, and the gap between them is where the predecessor's stale COPY and missing shared code both hid.* This one has done neither.

**Six of the eight requested reports could not contain a measurement.** Operational, security, performance and failure-recovery replays are all measurements of a running deployment. Rather than publish six documents each repeating the same sentence, their content is consolidated into the GA determination and the deployment validation report, with a table naming where each requested output lives and why. Approximating them from the in-process suites is the single thing that would have destroyed the value of the twelve milestones before this one.

### Stopped at

**14 gating checks green · 15 proofs recorded and replayed · 236 tests across five packages.**

**GENERAL AVAILABILITY: NOT CERTIFIED. Reason: deployment evidence unavailable — E-2 NOT MEASURED, no container runtime.**

One action stands between the platform and a GA determination on evidence: a container runtime. Not a milestone — a dependency.

---

### Programme closure

**The Architecture & Certification Programme is closed.** Architecture frozen, governance frozen, certification registers frozen. **General Availability remains NOT CERTIFIED, deliberately.**

Seven registers were produced, and all seven are **generated from measured state** — evidence files, the proof registry, the gate list and the architecture set itself. A closure register typed by hand is obsolete the day it is written, and a baseline is the one document future work trusts without re-deriving, so an error in it survives longer than an error anywhere else.

**The closure gate deliberately does not regenerate before it compares.** Every other gate in the suite regenerates, because evidence must be current. A baseline is the inverse: it is a fixed point, and a gate that regenerated it would always agree with itself. That failure mode is not hypothetical — M2.7 shipped a package-integrity check with exactly this shape and it was found to be self-healing and therefore incapable of failing. So this one recomputes hashes from disk against the *committed* baseline. Amending the architecture after closure is permitted; amending it silently is not.

**The brief needed one qualification, and it is the most important paragraph in the closure package.** The brief states E-2 shall remain the only blocker. That is true of the GA *determination* and false of the programme: of 20 unmeasured properties, 13 need only a container runtime, 3 need a runtime *and* something a runtime does not supply, and **4 are unrelated to deployment entirely**. G-5 is the sharpest — it needs a shared nonce store implementation (D-003), not Docker, and would remain open after a GA grant. Recording E-2 as the sole outstanding item would have created exactly the false impression these registers exist to prevent.

**The first version of that classification was wrong in both directions.** It inferred the class by pattern-matching blocker text, and got two of twenty wrong: G-5 looked deployment-blocked because its blocker contains the word "deployed", while G-3 and G-4 looked independent because theirs say "production traffic" rather than "deployed". Both were the same mistake — inferring meaning from wording. The classification is now an explicit reviewed table, and the closure gate fails on any unmeasured property that is not in it, so a new blocker cannot default into a convenient bucket.

**The GA gate caught its author for the third time.** Four closure documents contained the phrase "will still be unmeasured after General Availability is certified" — a conditional, not a claim, but indistinguishable from one to a scanner. Rephrased rather than exempted, consistent with the two earlier occurrences. Weakening the scan to accommodate prose about the scan would have been the obvious move and the wrong one.

**A transient class had to be introduced, and was classified rather than skipped.** `K-11` and `G-reports` appear unmeasured only while their own harness run is failing — publishing a package or report from a failed validation is refused by design — so a fault probe makes them appear briefly. Skipping them would have satisfied the completeness check while reopening the gap it exists to close.

### Programme totals at closure

**25 architecture documents · 21 ADRs · 413 conformance criteria · 5 packages · 236 tests · 15 gating checks · 16 fault proofs · 7 evidence sets · 20 unmeasured properties · 1 open debt item.**

ERI 19/22 · GCI 97% · RCI 89%.

**GENERAL AVAILABILITY: NOT CERTIFIED. Reason: deployment evidence unavailable.**

One dependency stands between the platform and a GA determination on evidence: a container runtime. Not a milestone — a dependency. The gates, the probe, the image descriptor and the registers are all in place, so certification is an execution rather than a design activity.

---

### Functional Testing Engine — capability request, answered without drift

**A brief asked to replace the Functional Testing capability with a canonical Functional Testing Engine: one master orchestrator, ten domain orchestrators, 80–120 specialised agents, an eighteen-stage workflow. Establishing repository state first found four reasons the literal instruction could not be carried out inside the architecture it was required to preserve.**

**The rename was already done.** Document 11 names the capability *Functional Testing Engine*. The four short-form occurrences are table cells where all six capabilities appear in short form, plus one generated maturity row. Nothing to rename.

**There was nothing to replace.** `IMPLEMENTATION_STATUS.md` records it NOT STARTED and no source file in any package references it. What the brief describes is the first implementation of the first capability engine — a phase of work, not a capability swap.

**The specified workflow is a second orchestration lifecycle, and it omits the governance triad.** R-12.18 permits a capability to extend the framework internally and forbids it redefining the lifecycle; the eighteen stages contain no Architecture Review, no Policy Review and no Guardrail Review. R-12.2 says no capability may bypass them. The brief also forbids duplicate orchestration in its own terms, so implementing it as written would have violated the brief as well as the architecture. **That omission is the most valuable finding of the analysis** — an implementation following the list literally would produce a capability the registry refuses.

**No agent stubs were written, and that was the decision that mattered.** R-11.15 makes an incomplete capability unrepresentable at four independent levels; R-11.16 forbids registering a stage stubbed to a no-op; and R-11.14 records why in the platform's own words — the predecessor listed a penetration-testing capability in a tier, exposed it through an API, and shipped it with no runner on disk, its dispatch wrapper logging the miss and returning soft failure. A hundred agent files with no executed evidence would have recreated that defect at a hundred times the scale, in a repository whose entire history was spent eliminating it.

**Two placement corrections restore guarantees the brief would have broken.** Repository Intelligence belongs to the Execution Plane, not the Intelligence Plane: the customer repository never leaves the EP, so observing it is EP and reasoning about scrubbed context is IP. Evidence capture is likewise EP-custodied. Either misplacement would put customer source or artefacts in the Intelligence Plane and turn the E-5 non-retention gate red.

**The closure gate had a hole, and this change found it.** It detected an added architecture document but not an added ADR — so ADR-0022 was written and the baseline still reported PASS. An ADR is the instrument by which architecture is amended, so a new one appearing without a re-baseline is exactly the silent amendment the gate exists to prevent, arriving through the door left open. The check was added and proven to detect by planting one.

**Re-baselining was deliberate.** Adding an ADR changes the hashed baseline; the emitter was re-run, the registers regenerated, and the closure gate re-verified. Amending after closure is permitted; amending silently is not.

### Stopped at

**15 gating checks green · 16 proofs · 236 tests. 25 architecture documents unchanged, 6 capabilities, 3 Platform Services, ADR-0021 unchanged.**

**GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged, and untouched by this work.

---

### Functional Testing Engine — implemented

**The design recorded in ADR-0022 was built.** Two packages, 89 agents, 12 stages, one lifecycle.

`@dbiz/capability-framework` is the frame all six capabilities will run inside: twelve typed stages whose results carry a **module-private seal**, so a stage result cannot be written by hand anywhere in the platform. R-12.11 forbids any bypass, override, debug path or test hook that constructs a verdict without running the stage — a symbol nobody else can obtain is the cheapest way to make that true rather than requested.

`@dbiz/functional-testing-engine` is capability 1 of 6. Thirteen intelligences, eleven domain orchestrators and eighty-nine agents are **internal structure**; the capability count is still six and the lifecycle count is still one.

**The governance triad was implemented, and the brief never named it.** Stages 4, 5 and 6 have no counterpart among the eighteen canonical steps. An engine built to the list literally would produce a capability the registry refuses — which is how the omission would eventually have surfaced, as a registration failure nobody could explain.

**Two placements were corrected, and both are sovereignty, not preference.** Repository Intelligence searches the customer repository, so it is an Execution Plane agent at Discovery and only *scores* cross; deciding what to reuse is Intelligence Plane. Evidence capture is likewise EP. `EvidenceReference` carries a hash and a locator and has **no content field** — a test asserts it never gains one, because that field is the whole difference between a reference and an exfiltration.

**AI proposes; code decides — and the engine runs with no reasoning at all.** Forty-seven of eighty-nine agents are wholly deterministic. The conformance run supplies **no proposals** and still authors nineteen test cases, which is INV-7 demonstrated rather than asserted. Proposals are inputs: a proposed requirement duplicating an acceptance criterion is rejected, a proposed step without an expected result is dropped rather than repaired, and a semantic re-ranking may reorder repository matches but never add one.

**The conformance suite caught a defect in my own implementation.** Healing validation was passed `retryOutcome: 'passed'` unconditionally, so every proposed heal validated and every genuine failure disappeared — the exact failure `healing.validation` exists to prevent, committed inside the thing that prevents it. Retry outcomes are now observed by the Execution Plane and default to unchanged, because the safe direction leaves a defect visible.

**The traceability gate caught worse.** Source files cited `C-11.11`, `C-11.12` and `C-11.16` with meanings those criteria do not have — C-11.11 is *"no framework code branches on a capability identity"*, C-11.12 is *"the Execution stage completes with the Intelligence Plane unreachable"*, and **there is no C-11.16 at all**. Every citation was plausible and every one was wrong. This is the `DECISIONS.md` failure from session 1 recurring in a new place: a claim written from memory of what a rule says rather than from the rule. Citations were corrected and tests added for the criteria that were genuinely uncovered — including one the engine needed anyway: the Execution stage completing with the Intelligence Plane unreachable.

**One workflow, proven by execution.** The engine runs twice — Azure DevOps, then Jira with Zephyr — and the twelve-stage sequences are compared. They are identical; only the nouns differ (Test Plan/Test Suite versus Test Cycle/Folder). A gate scans orchestration source for provider names, and is fault-proved by an orchestrator that branches on one, because an orchestrator that can name a provider can branch on it and one that can branch on it eventually will.

### Stopped at

**16 gating checks green · 17 proofs recorded and replayed · 309 tests across seven packages.**

25 architecture documents unchanged · 6 capabilities · 3 Platform Services · ADR-0021 unchanged. The closure baseline was re-taken deliberately after the gate list changed.

**GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged and untouched by this work.

---

## Session 7 — 2026-07-23 — Penetration Testing Engine (capability 6)

A brief asked to make the **Penetration Testing Engine** the canonical implementation of the existing Penetration Testing capability — one master orchestrator, fifteen domain orchestrators, 120–180 agents, a scanner catalogue, a dedicated Threat Intelligence engine, AI and non-AI modes — with zero architectural drift. Establishing state first found the third instance of a now-familiar pattern (after ADR-0022 and ADR-0023): **the name is already canonical, there is no implementation to replace, the linear workflow is a second lifecycle that omits the governance triad, and agent stubs are unrepresentable** — R-11.14, the rule against declared-but-unbuilt, was itself written *about a penetration-testing capability shipped with no runner*.

### Built, not deferred

`@dbiz/penetration-testing-engine` — **220 agents (184 domain + 36 governance) across 15 domains, 1 master + 15 domain orchestrators, 34 scanners, mapped onto the twelve frozen stages.** 37 conformance tests pass. The engine supports AI-enabled and non-AI modes through the capability-neutral `ai.enabled` key alone; 212 of 220 agents are wholly deterministic, so it completes with reasoning unavailable (INV-7).

### The governance triad was the review the brief did not name

The linear workflow named a Scope Review and a Scanner Review but no Architecture, Policy or Guardrail Review. Those three mandatory stages (R-12.2) are implemented as the **Attack Surface Model**, **Scan Authorization** and **Scan Guardrails**. **No packet is transmitted before the guardrail stage certifies** — a destructive category authorized against a production target refuses the run at stage 6, before any Execution-Plane probe. Conformance property P-9 proves it.

### Sovereignty is in the types

`RawFinding` (request/response snippets) and `ObservedTarget` (values) never leave the Execution Plane; `Finding` and `EvidenceReference` carry a category, a location and a hash+locator and have no field for a payload. The crossing is two functions — `minimise` and `minimiseFinding`. A test asserts a session token never reaches the Intelligence-Plane state.

### Drift found and recorded

`PROJECT_STATE.md`'s "programme closed, the six capability engines NOT STARTED" narrative predates the capability layer's construction: FTE and Discovery are built and gated on disk, and this session added the Penetration Testing Engine. `IMPLEMENTATION_STATUS.md` §5 is already reconciled for FTE/Discovery and now carries capability 6. The `DECISIONS.md` ADR index still ends at ADR-0019 though ADR-0020–0024 exist — ADR-0024's row was added; the rest must be backfilled from headers, not filenames (the session-1 lesson).

### Stopped at

**The Penetration Testing Engine conformance gate (`verify-pentest-conformance.js`) exits 0 standalone.** Registering it in `run-all.js` and re-baselining closure (`emit-closure-package.mjs`) are the deliberate, human-reviewed final step — **this session performed neither silently.** The environment reverted an attempt to register the gate in the runner, which is consistent with routing gate additions through the closure re-baseline rather than absorbing them.

25 architecture documents unchanged · 6 capabilities · 3 Platform Services · ADR-0021 unchanged · EP/IP ownership preserved (63 EP / 157 IP). One ADR added (ADR-0024).

**GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged and untouched by this work.

---

## Session 8 — Performance Engine (capability 4, "PTIE") — 2026-07-23

**Task determined from state (CHARTER §12):** `IMPLEMENTATION_STATUS.md` recorded the Performance Engine as one of two `NOT STARTED` capability engines. A directive arrived to build "PTIE — Performance Testing Intelligence Engine." Reconciled per CHARTER §3: **PTIE is the product name of capability 4 (Performance Engine), already frozen in Document 11 §2 (R-11.4)** — not a seventh capability. Implemented in place; created no parallel service and no architecture document (conformance `P-10`/`P-10.a` would fail the build otherwise).

**Built (all additive, capability-internal — ADR-0022 §6.5 precedent):**
- `@dbiz/performance-engine@1.0.0` — builds green under strict TS. 179 agents (143 domain + 36 governance) across 19 domains; 1 master + 19 domain orchestrators; `LoadGeneratorAdapter` (k6/JMeter/Gatling/Locust/Playwright) + `TestManagementAdapter` (Azure DevOps/Zephyr/Xray). Sovereignty in the type system (`ObservedNode`/`RawSample` EP vs `SurfaceFact`/`MetricSummary` IP; evidence by reference only).
- `test/conformance.test.ts` — **33 tests, 0 failures.**
- `governance/capability/run-performance-conformance.mjs` — **15/15 properties hold**; `performance-evidence.json` generated.
- `governance/verification/verify-performance-conformance.js` — **PASS** standalone.
- ADR-0026, `PERFORMANCE_ENGINE_IMPACT_ANALYSIS.md`, `docs/capability/PERFORMANCE-ENGINE.md`, `PERFORMANCE_ENGINE_COMPLETION_REPORT.md`.
- Fault `architecture-document-added-for-the-performance-engine` added to `record-fault-proofs.js`; **demonstrated genuine** (clean exit 0; faulted exit 1 naming "26 architecture documents"; tree restored to 25).

**AI-optional by construction (the brief's headline):** one workflow, two modes via `gateProposals`. An AI-disabled run delivers **zero** proposals and still completes every stage and certifies (INV-7 / PP-8) — the exact predecessor defect Document 11 §2 records. 171 of 179 agents are deterministic.

**Reality reconciled against disk (CHARTER §3):** the working tree was found **already red** — `run-all.js` reports 6 gating failures from the prior session's uncommitted capability-2/3 work (the D-005 reconciliation), **before and independent of** this capability. The Performance gate is therefore standalone, its fault proof defined-and-demonstrated but not yet recorded into `proofs.json` (recording on a red tree would write `proved:false` for the six already-failing gates). This follows the Penetration Testing Engine precedent exactly. Registration + proof recording + closure re-baseline join the one pending D-005 reconciliation.

**Not changed:** 25 architecture documents (unchanged) · 6 capabilities · the capability framework, contracts, and all other engines · tenant/governance/security/audit/certification models. One ADR added (ADR-0026).

**GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged and untouched by this work. No readiness claim inflated; the Performance Engine is VERIFIED on its own merits, not claimed platform-CERTIFIED.

---

## Session 10 — Performance Engine Phase 2 (APM + Performance Intelligence Layer) — 2026-07-23

Two architecture-preserving enhancements to capability 4, each reconciled against a gap analysis before code (the mandated first task), each verified.

**Increment A — Enterprise APM Integration.** Built the optional `MonitoringAdapter` SPI ADR-0026 §4.3 declared but Phase 1 left unbuilt: 11 providers (Dynatrace, AppDynamics, Datadog, New Relic, Azure Monitor, CloudWatch, GCP Operations, Prometheus, Grafana, Elastic APM, OpenTelemetry), resolved by `perf.monitor`, **optional** (unset → null; unknown → refused by name). A configured provider's samples fuse into the same summarise→bottleneck→certification path via EP agent `load.monitor-collect`. Conformance property PP-13; 37 tests.

**Increment B — the Performance Intelligence Layer.** Four integrated domains as one chain — pattern → business → knowledge → optimization — inside the reflection stage.
- **D1 Pattern intelligence**: `patterns.ts`, a 30-pattern declarative catalogue + 2 composite rules, matched by a pure `matchPatterns()` that reuses the existing bottleneck saturation logic (reuse, not duplicate). Composite recognition (CPU+GC+pool → thread starvation) proven.
- **D2 Business intelligence**: `BusinessImpact` per transaction — capability, customer impact %, revenue risk, executive severity (sev1..4), financial exposure from configurable weights, recovery priority.
- **D3 Performance Knowledge Graph**: built on the framework `VectorMemory` (threaded but unused since Phase 1) + an EP-searched `deps.knowledgeRecords` seam (the pentest `PriorRecord` precedent). Query-before-recommend (similarity, known-fix, recurrence) and write-back so the next run finds this run.
- **D4 Optimization engine**: extended `optimisation` domain with pattern-driven, subject-specific recommendations carrying expected gain, cost saving, risk, confidence, complexity, business/technical value, plus knowledge reuse of prior verified fixes.

New reflection sub-domains `pattern`/`business`/`knowledge` (DOMAINS 19→22) + extended `optimisation`; `Recommendation` (+7 fields) and `PerformanceReport` (+pattern/business/knowledge/optimization summaries and executive/engineering/operations action lists) extended; one reflection governance rule added. Conformance properties PP-14…PP-17; **45 tests**, **19/19 properties**, gate green standalone, fault proof genuine (clean 0 / faulted 1 naming the cause / restored to 25 docs). Census: **214 agents (178 domain + 36 governance), 22 domains, 22 domain orchestrators**.

**AI-disabled parity proven**: pattern and business intelligence are byte-identical with AI enabled and disabled — reasoning (pattern confidence, business narrative, knowledge reasoning, advisor) only refines ranking/explanation. INV-7 holds.

**Not changed:** 25 architecture documents · 6 capabilities · one lifecycle · every frozen contract · EP/IP, governance, certification. One ADR total for the capability (ADR-0026); no new ADR needed — Increment A fulfilled an ADR-declared face, Increment B is internal structure (ADR-0022 §6.5). The pre-existing red suite (D-005) is unchanged and untouched.

**GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged. No readiness claim inflated.

---

## Session 11 — Performance Engine Phase 2 Increment C (Predictive Performance Layer) — 2026-07-23

Reconciled against the gap analysis before code (the mandated first task), then built and verified.

**The insight that kept it small:** a simulation is a deterministic transform of baseline metrics fed through the pipeline that already exists. The twin builds the input `MetricSummary[]`; `matchPatterns` / `forecastCapacity` / `assembleCertification` produce the prediction. No new analysis was written.

**Domain 1 — Digital Twin** (`twin.ts`): `buildTwin` synthesises baseline latency + resource summaries from topology, workload and `deps.baselines`/`deps.knowledgeRecords`, with a confidence from history coverage. It NEVER executes load.

**Domains 2/5/7 — Simulation**: `SCENARIO_LIBRARY` covers 21 scenario kinds (traffic ±, infra ±, region/db/cache/queue/container/node failure, scaling delay, memory leak, thread exhaustion, holiday, Black Friday, end-of-month, peak-banking, insurance-renewal, retail-promotion, release-deploy, what-if). `applyScenario` transforms the twin's summaries; `simulateScenario` reuses the real pattern/capacity/certification pipeline to predict bottlenecks, SLA, capacity, cost, verdict and confidence. Black Friday against a healthy baseline predicts FAIL (verified).

**Domain 3 — Capacity forecasting**: per-resource timeline, headroom and exhaustion (`resourceForecast`).

**Domain 4 — Seasonal intelligence**: deterministic multipliers daily→yearly + holiday/campaign (`seasonalForecast`).

**Domain 6 — Multi-tier baselines**: golden/production/environment/release tiers (`baselineTiers`).

**Domain 8 — Predictive certification + accuracy**: the worst simulated scenario governs a predicted verdict before execution; the reporting stage compares it against the actual certified verdict via `simulation.accuracy` → `PredictionAccuracy` (predicted FAIL vs actual FAIL matched in the conformance run). The loop that lets the platform continuously improve.

**Simulate mode**: `perf.mode=simulate` makes the Execution stage a typed **NOT-APPLICABLE** (`emit.notApplicable`, C-12.12) — the framework primitive for exactly this. The run still traverses all twelve stages and still predicts; the `gated()`/`stage()` helpers were extended to thread a not-applicable reason (additive, no lifecycle change).

Two reflection sub-domains `twin`/`simulation` (DOMAINS 22→24); `PerformanceReport` extended with twin/simulation/forecast/accuracy summaries; one reflection governance rule already covered patterns. Conformance properties PP-18…PP-21; **53 tests**, **23/23 properties**, gate green standalone, fault proof genuine. Census: **233 agents (197 domain + 36 governance), 24 domains, 24 domain orchestrators**.

**AI-disabled parity proven**: the Digital Twin and all simulations are byte-identical with AI enabled and disabled — reasoning (simulation narrative) only phrases the summary. INV-7 holds; simulation is fully deterministic.

**Not changed:** 25 architecture documents · 6 capabilities · one lifecycle · every frozen contract · EP/IP, governance, certification. No new ADR (internal structure, ADR-0022 §6.5); no optional adapter needed (the twin is pure internal computation). The pre-existing red suite (D-005) is unchanged and untouched.

**GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged. No readiness claim inflated.

---

## Session 12 — D-005 verification reconciliation (all six engines to green) — 2026-07-23

**Task determined from state (CHARTER §12):** `NEXT_ACTION.md` named the D-005 reconciliation as the single action — commit/complete the uncommitted tree, register the standalone capability gates, record their fault proofs, and re-baseline closure. Reconciled against disk first (CHARTER §3): all six capability-engine packages present (Security cap 5, ADR-0028/0029, among them); git HEAD still `f922626` (FTE only); the state files claiming "Security NOT STARTED" were stale.

**Reality established.** `run-all.js` was not the "6–8 red gates" older state described — a prior/concurrent session had already turned several green. The true state: **six red gates** — `ai-vendor-neutrality`, `implementation-traceability`, `change-control-completeness`, `governance-self-validation`, `traceability`, `programme-closure`.

**Fixed at root cause, nothing inflated:**
- **vendor-neutrality** — three governed docs (ADR-0026 §3, `PERFORMANCE_ENGINE_IMPACT_ANALYSIS.md`, this log) cited the unversioned tool bootstrap file as the source of a rule (its prompt-conflict clause). The bootstrap file originates no rule; repointed to CHARTER §3/§4 (the same drift the earlier session corrected in `RISKS.md`). The gate caught this reintroduced in the first draft of this very entry — which is the argument for the gate rather than for the prose.
- **implementation-traceability** — the performance and pentest conformance test files lacked TRACEABILITY blocks (added); two performance sources cited `C-11.16`, which does not exist — it was Rule R-11.16 mis-written as a criterion; corrected to the real criterion `C-11.5` (no silent no-op stage). This also cleared `traceability` (ACM/ETM).
- **change-control** — ADR-0026 §8 named affected components as bare filenames and globs (`model.ts`, `agents/*.ts`, `11/12/…-*.md`) the gate could not resolve; rewritten into a repo-relative table like ADR-0024.

**Gates registered + fault-proved.** The five standalone capability gates — `verify-devchange-certification`, `verify-performance-conformance`, `verify-sectest-conformance`, `verify-pentest-conformance`, `verify-pentest-completeness` — were registered in `run-all.js` (**25 gates == 25 verify-*.js on disk**). Each got a recorded, replayed fault proof:
- Two **CREATE-mode** probes plant a 26th architecture document (`sectest`/`pentest` conformance P-10.a asserts the canonical set stays 25).
- Two **`patch`-mode** probes — a new, more robust fault mode added to `record-fault-proofs.js`: it rewrites one substring of the *current* built file rather than embedding a whole stale copy, and fails loudly if its find-string stops matching. `devchange-certification` ← the `learning` orchestrator enumerates instead of invoking (learning.capture dormant, 99.2%); `pentest-completeness` ← one `threat.*` agent invocation neutralised (dormant, 99.5%).

**Re-baseline + record.** `emit-closure-package.mjs` re-cut `baseline.json` to admit ADR-0023…ADR-0029 and 25 gates (arch still 25, GA still NOT CERTIFIED). `record-fault-proofs.js` was run to convergence (the documented "run twice" — plus one extra pass after a SIGTERM'd run left `observability/dist/health.js` faulted, restored by rebuilding the package). **27 proofs, all `proved:true`.**

**Result:** `node governance/verification/run-all.js` → **RESULT: PASS — 25 gating checks green.** `DECISIONS.md` ADR index backfilled 0001…0029 from headers. State files (`IMPLEMENTATION_STATUS`, `TECHNICAL_DEBT`, `PROJECT_STATE`, `NEXT_ACTION`, this log) reconciled to disk.

**Not changed:** 25 architecture documents · 6 capabilities · one lifecycle · every frozen contract · no new ADR beyond those already on disk. The one residue of D-005: the green tree is **still uncommitted** — the per-capability git-history split is the next action.

**GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged. No readiness claim inflated.

---

## Session 14 — 2026-07-23 · Tenant Lifecycle Management (P0 directive)

**Context.** Reconciled against disk first (CHARTER §3): Session 13 had already committed and pushed the green tree (`5ef7c7e`…`3a4af26`), so the directive's "commit first" phase was already satisfied — skipped, not redone.

**The directive** designated Tenant Lifecycle Management the mandatory bootstrap "capability" with a 17-stage lifecycle. Three collisions with frozen architecture were resolved upward rather than complied with:
- **Not a seventh capability** (R-11.4): TLM yields no certified verdict about customer software.
- **Not a fourth Platform Service** (ADR-0021 §5; the closure baseline hard-codes three services / six capabilities — a fourth would force weakening a gate).
- **No new canonical states** (R-21.5): the richer lifecycle is an observable **projection** over the frozen six, never read at the PDP (R-21.7).

All recorded in **ADR-0030**, which **closes AD-018**. Doc 21 amended additively to **v1.2** (§3d; R-21.47/48; C-21.28–31).

**Built.** `@dbiz/tenant-lifecycle` — the config-driven bootstrap engine, the six-state machine + projection, validation (real R-21.11 execution-path guard), and the orchestrator, **reusing** `platform-runtime` (identity) and `platform-core` (generation). **23 package tests green.** The orchestrator drives IP stages 1–7 and reports **stages 8–14 `PENDING`** (customer deployment + EP runtime + container runtime), never `ACTIVE` on assumption (R-21.29).

**Governance (D-012 — declaration + enforcement atomic).** A **26th gate** `verify-tenant-lifecycle-conformance.js` + scenario enforces C-21.28–31, with a recorded, replayed fault proof (patch-mode: deferred stages forced `done` → the gate goes red). Baseline deliberately re-cut. **28 proofs, all `proved:true`.**

**Result:** `node governance/verification/run-all.js` → **RESULT: PASS — 26 gating checks green.**

**Not changed:** 25 architecture documents · **6 capabilities · 3 Platform Services · one lifecycle** · every frozen contract. **GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged; stages 8–14 remain gated on the P5 Execution-Plane runtime and a container runtime.

---

## Session 15 — 2026-07-23 · Functional Testing Engine certification request → reconciliation

**The request** asked to "analyse, repair, complete and certify the Functional Testing Engine" against an 18-stage domain workflow and a hierarchical orchestrator model, and to certify it production-ready.

**Reconciled against disk first (CHARTER §3).** The premise did not hold: the Functional Testing Engine (capability 1) was **already complete, verified, committed and pushed** — session 7 moved agent/adapter/orchestrator reachability to 100 %; it is the reference capability. Live re-measurement this session confirmed it: `verify-functional-completeness.js` → **PASS** (94/94 agents, 14/14 adapter operations, 13/13 orchestrators, all observed to execute); conformance suite **67/67**. The prompt's "canonical workflow" is a renaming of the built engine's own domain orchestrators over the frozen **one twelve-stage lifecycle** (Doc 12 / ADR-0022); its adapters (Azure DevOps project + test plans, Jira project, Zephyr Essential + Scale, Playwright/execution) already exist as four SPIs, one workflow, provider-blind (C-14.1). **No FTE repair was needed or made** — inventing one would have been the duplicate-source failure CHARTER §4 forbids.

**Drift found — the suite was not actually green (CHARTER §3: disk is fact).** State claimed "26/26 green"; a fresh `run-all.js` reported **FAIL**. Two items, both introduced after the last recorded green run and never re-verified:
- `PROGRAMME_GOVERNANCE_DECISION_D-023_PROPOSAL_2026-07-23.md` (untracked) — three phrases read as GA-certified assertions to `verify-general-availability`. They are hypothetical **targets** of a proposed track, not claims; rephrased faithfully with the gate's own conditional vocabulary (`would`, `target`). Meaning unchanged; GA stays NOT CERTIFIED.
- `PROJECT_STATE.md:5` (Session 14 addendum) — cited the unversioned bootstrap file (at its section 5) as a rule source, the exact coupling ADR-0016 §62 removed. Repointed to `CHARTER §3`, already cited alongside it. Same remediation prior sessions applied to `RISKS.md`.

**Result:** `node governance/verification/run-all.js` → **RESULT: PASS — 26 gating checks green.** Both fixes are drift corrections, not verification claims.

**Not changed:** 25 architecture documents · 6 capabilities · 3 Platform Services · one lifecycle · every frozen contract · no new ADR. **GENERAL AVAILABILITY: NOT CERTIFIED** — unchanged; the single open dependency remains a container runtime (E-2), and the Execution Plane runtime is NOT STARTED. The FTE cannot be certified *production-ready end-to-end* here because stages that require a deployed Execution Plane (real browser/API execution, live tool sync) have no runtime to execute against — that is the honest verdict, not a defect in the engine.

---

## Session 31 — 2026-07-24 · EP↔IP registration & trust establishment (P0 directive) — the 401 closed at root cause

**The request** (P0, "SECURITY FIRST / NO AUTHENTICATION BYPASS") asked to close the EP↔IP authentication blocker (HTTP 401) by implementing a **secure, enterprise-grade trust-establishment mechanism** — OTC → registration endpoint → validate → issue short-lived tenant-scoped credential → persist securely — preserving Zero Trust, Multi-Tenancy, Tenant Isolation, Data Sovereignty, Least Privilege and Secure Credential Management. Explicitly *not* "just make the 401 go away."

**Reconciled against disk first (CHARTER §3).** The mechanism was **already designed but unbuilt**: the solution generator bakes a one-time credential (OTC) into every EP package (`solution-export.ts`) and `docs/EP-RUNTIME-REQUIREMENTS.md` lists the registration client as *"required… NOT yet emitted"*, but there was **no registration endpoint and no OTC store** (`issueOneTimeCredential` a throwaway lambda, `recordTenantCreated` a no-op). So the task was to **build the missing half**, reusing existing primitives — not invent a parallel mechanism (CHARTER §4). **Root cause of the 401, proven live:** `run-server.mjs` signed EP tokens with a **random-per-boot secret** (`SESSION_SECRET` unset → `randomBytes()`), so every token failed verification after a restart; the `.env` `DBIZ_EP_TOKEN` was a hand-pasted shortcut.

**Built — IP (TypeScript, `@dbiz/tenant-onboarding-engine`):** `engine/registration.ts` — a hashed, single-use, TTL'd, tenant-bound **OTC store** (SHA-256 hash + non-secret metadata only, INV-2), the pure **`handleRegistration()`** endpoint (`POST /api/register`, OTC-authenticated, Zero-Trust: verifies contract version → OTC/tenant binding → environment → lifecycle state **before** minting; consumes the OTC atomically **after** all checks so a refusal never burns it), and an **immutable append-only audit log** (issuance + success + every refusal, carrying no secret). It reuses `issueEpToken` for a tenant-scoped least-privilege (`execution-plane`) credential with **version-bump revocation** (no denylist). Wired into `api.ts` `createServer`, a NestJS `RegistrationController`, and `run-server.mjs` — which now **persists a stable signing secret** (`.session-secret`, gitignored, 0600) and issues OTCs **through** the store, so the baked OTC is the one the endpoint validates.

**Built — EP (JS, `carlislehomes`):** extended the **single cross-plane client** with `register()` (no second HTTP client, R-05.3); a **secure local vault** (`src/runtime/secret-store.js` → `.secrets/`, 0600, gitignored) that replaces plaintext `.env` persistence; `src/bootstrap/register-client.js` (presents the OTC, persists the issued credential to the vault, records `vault://` **references** in `config/identity.json` — values never in config, INV-2); `bin/ep-register.mjs` (`npm run register`, register-then-run with the no-inference boot guard); and `ep-connectivity.mjs` now resolves the credential from the vault. **Remediated the leaked `.env`** — removed the plaintext EP token; flagged the previously-committed `sk-ant-…` AI key for owner rotation.

**Verified.** Clean `tsc`; **15 new registration tests** + full engine suite **109/109 green**; `verify-implementation-traceability.js` **PASS**. **Live end-to-end + adversarial matrix** against the running dev server: register → **`401 unauth → 200 authenticated`** (the blocker is gone); replay/forged/missing OTC → 401; cross-tenant registration → 403; cross-tenant token → 403; contract mismatch → 426; environment mismatch → 403; a second tenant received its **own** v1 identity; the OTC store held only a hash (`consumedAt` set after use); the audit trail carried no secret. Cleaned up the test tenant so the registry reflects reality.

**Drift found and handled (CHARTER §3).** (1) `engine/portal-templates.ts` did not compile (`noUncheckedIndexedAccess`), leaving `dist/` stale and the running server on old code — fixed at root cause (one line). (2) A **concurrent session** (ADR-0035 portal stream) ran `run-all.js` and flagged these files for citing a then-non-existent ADR-0036 and a mis-named `05-execution-plane-architecture.md`; both resolved (ADR-0036 authored; corrected to `05-cross-plane-communication.md`; TRACEABILITY blocks added) — the gate now PASSES. (3) Recorded, not resolved: the EP on disk is `carlislehomes/` (not `CarlisleHomes_ExecutionPlane/`) and is **not a git repo**.

**Not changed:** six capabilities · three Platform Services · the twelve-stage lifecycle · the six canonical states · the SSOT · INV-2/3/9. **New ADR:** [ADR-0036](../docs/adr/ADR-0036-execution-plane-registration-and-trust-establishment.md).

**Adversarial security review + hardening.** A 6-lens adversarial review (18 agents) surfaced **12 findings, all real, all fixed**: an unbounded body on the unauthenticated `/api/register` (→ 413 body cap + `toString` guard + handler `try/catch`, no crash); OTC consumed before durable issuance (→ `releaseOtc` rollback, retryable 503); an EP `execution-plane` credential able to self-grant capabilities via onboarding PATCH routes (→ those routes now need `tenant:configure` + an R-21.11 guard in `enrichRecommendations`); `correlationId` audit amplification (→ clamped 128); transient 5xx misclassified as Refusal (→ Unavailability/DEGRADE); OTC transmittable over cleartext (→ refused for non-loopback non-https before any POST); non-atomic file store (→ documented single-instance); duplicate opaque tenantId (→ fail-closed resolver + `importJson` uniqueness); Windows `chmod` no-op on both secret files (→ icacls owner-only ACL); false mTLS PASS (→ connectivity gates on an actual client cert). **114/114 tests green** post-hardening; each fix re-verified live (413, 403 escalation-block, transport-refusal). Also proved credential **survival across an IP restart** (the definitive root-cause fix) and **EP-side single-use**.

**Conformance gate (D-012 — built + fault-proved standalone):** `governance/verification/verify-registration-conformance.js` + `governance/registration/run-registration-conformance.mjs` execute the flow and gate on eight properties (RG-1…RG-8) — **8/8 green**, and fault-proved (breaking single-use in the compiled store turns the gate RED, R-13.4). **Remaining coordination step (honestly NOT done — shared governance state a concurrent ADR-0035 stream is editing):** register it in `run-all.js`, record its fault proof in `proofs.json`, re-cut `baseline.json`. Standalone pending that reconciliation (Session-8 precedent). **GENERAL AVAILABILITY: NOT CERTIFIED** — the container-runtime boundary is untouched; this closes an authentication blocker, not the deployment one.

---

## Session 32 — 2026-08-06 · D-122 reported before building; a fifth finding blocks the build

**Numbering note, recorded rather than smoothed over.** The previous entry is Session 31, dated
2026-07-24. Substantial work landed between then and now — it is in `PROJECT_STATE.md`, the debt
register and git history, and it is **not** in this log. The gap is real and is not repaired here;
this entry does not claim to be the 32nd session, only the next one written down.

**The request.** Rule on D-122 — *who writes to the sealed package store* — with four questions to
answer **before building**: what authors a package `put()` accepts; where the write belongs; what
decides that a run's package should be retrievable; and whether that decision is a capability's or
the platform's. Plus four records: D-117's larger correction as its headline, C-05.11's extension,
D-121's eighth issue with its lesson, and CHARTER §18 clause 3 brought as a proposal.

**Reconciled against disk first (CHARTER §3).** Tree clean at `8b2bcd8`, `origin/main` matched.
`verify-programme-closure` **PASS** before and after this session's edits.

**What was executed, not reasoned.** A probe drove `composeExecutionPackage` into a real
`SealedPackageStore` over a real `FilesystemStorageProvider` in `carlisle-homes`' partition, with a
fail-closed ownership resolver, rooted in a temporary directory that was removed. **The canonical
composition is ACCEPTED, retrieved byte-identical, and `parseExecutionPackage` parses the retrieved
body.** Three controls: a foreign `tenantId` refused with a stated reason, the gateway envelope
refused, and `{}` refused — **the last two byte-identically**, which is itself the finding: the
refusal D-121 relied on is the fallthrough, and control 1 is what shows `put` reading and asserting.

**Answered.** (i) the canonical composition — measured, not preferred. (ii) **stage 7, Execution
Planning**, which doc 12's stage table already assigns; *at certification* is impossible by the
lifecycle's own ordering and *a separate publication step* is a thirteenth stage. (iii) the two
fail-closed discriminators that already exist — certification and ownership resolution — and
introduce no third; a reference run cannot pollute a customer partition **by construction, today**.
(iv) the platform's, on C-11.11 and R-12.18.

**Found while answering, and it blocks the build — D-123.** The detached signature R-20.29 obliges
the Execution Plane to verify **has no carrier under pull**: `put` takes one artefact, retrieval
returns the body alone, and the contract correctly has no signature field because R-20.22 makes it
detached. It was the second argument of the push call ADR-0070 P-70.6 retired. **A writer built
today produces packages the EP is contractually required to refuse.** It is an ADR.

**Also found — D-124.** Doc 12 assigns the sealed package to stage 7; the runner's stage 7 emits a
count, and the package is composed after all twelve stages have returned, outside the lifecycle that
governs it. Recorded, not repaired; it is closed by D-122's ruling, never separately.

**Produced.** [`D-122_WRITER_RULING_DESIGN_REPORT.md`](D-122_WRITER_RULING_DESIGN_REPORT.md) ·
[`CHARTER_18_CLAUSE_3_PROPOSED.md`](CHARTER_18_CLAUSE_3_PROPOSED.md) · D-117 headline replaced with
its correction and clause (ii) annotated where it is wrong · D-121 **CLOSED**, headline corrected to
eight divergences with the census lesson · D-122 status carrying all four answers and C-05.11's
extension · D-123 and D-124 new · `PROJECT_STATE.md` and `NEXT_ACTION.md` updated · a stale
**73 gates** figure in `NEXT_ACTION.md` corrected to **75** against the gate's own measurement
(D-107's class in a third file; the class stays open).

**Where work stopped, and it stopped deliberately.** **Nothing was built.**
`SealedPackageStore.put` still has no non-test caller. `CONTRACT_VERSION` is 1.0.0, the compatibility
corpus is byte-identical, no architecture document and no ADR was modified, and **`CHARTER.md` was
not touched** — the clause 3 proposal is a proposal. The next action is the ruling, and the build
sequences behind D-123.

---

## Session 33 — 2026-08-06 · D-122 ruled; D-123's chain measured end to end and found broken in three places

**The request.** Rule D-122 as reported, record the *unavailable-rather-than-worse* distinction as
what makes it a finding, and produce a design report for the ADR carrying **both** the signature
carrier and ADR-0070 §6 steps 4–5. **Do not build the writer.** Commit the prior six files.

**Committed** at `971fc94` — the D-122 report, the CHARTER §18 clause 3 proposal, and the register
and state updates. Carrying correct records uncommitted was named as the fifth instance of a pattern.

**D-122 RULED**, as reported: `composeExecutionPackage` · **stage 7, Execution Planning** · the two
existing fail-closed discriminators · **the platform, not the capability**. The distinction is
recorded as the ruling's own content: *a ruling that selects between live options is a judgement; a
ruling that records which options were never available is a measurement, and revisiting it requires
refuting the measurement.*

**The design report enlarged its own subject.** Measuring the signature chain end to end found
**three** missing links, not one, and the carrier is the middle one:

1. **No signer on the write path** — the only `PackageSigner` is wired inside a *generated string*;
   the deployed tier's signer signs an ADR-0035 solution manifest, a different artefact.
2. **No carrier** — D-123 as recorded.
3. **The generated Execution Plane is instructed to verify against a literal placeholder** —
   `signatureVerificationKeyRef: '<FILL: IP public verification key ref + keyId>'`, written into
   every generated `config/security.json` **by the same function that writes the instruction to
   verify against it**. Recorded as **D-125**.

**So the ruling is not "pick a carrier."** A carrier ruled alone changes nothing observable — the EP
still cannot verify, and every retrieval still ends in R-20.30's `signature-invalid`.

**Options costed; two excluded before cost.** Embedding is a **major** contract version by ADR-0007
§7's forward obligation and breaks content addressing. A header alone does not survive caching to
disk, and caching is the property the sealed artefact exists to provide. Signing on the read path
changes what the signature asserts and puts the highest-value key on the highest-traffic route.
**Recommended: a sibling artefact at rest plus a retrieval envelope on the wire — two halves of one
answer.** The sibling scheme introduces a concrete defect that must land with it: `purgeExpired`
skips names failing `HASH_RE`, so a `<hash>.sig` would never be purged.

**AD-016's apparent contradiction resolved rather than arbitrated.** ADR-0007 closes AD-016's
**model**; R-20.29 correctly calls the **distribution** leg open — and D-125 is that leg on disk.
Neither frozen document is wrong; the sentence distinguishing them is what is missing. **Also
settled so it is not re-raised:** signing over the hex content hash is correct, because doc 20 §5
specifies detached signatures precisely to avoid re-serialisation and `digestV1` already binds the
domain into the signed value.

**ADR-0070 §6 steps 4–5: every figure and every citation has drifted.** *"Eight address-holding
references"* measures **10 across 7 files**; *"four conformance tests at `:88,103,109,115`"* measures
**seven at `:96,102,107,112,119,124,129`** and none of the cited lines is a test boundary; *"a
registered fault proof at `record-fault-proofs.js:1455`"* measures **five at `:1535–1580`**, and line
1455 is a proof about a different module. **An implementer following those citations would retire the
wrong things, miss four of five fault proofs, and report the step complete.**

**Two rules recorded.** **D-107's general form** — *a number in a state file, a register or an ADR is
an estimate until measured* — with its instances (criteria 417→422, gates 73→75, and ADR-0070 §6's
fully drifted scope), and the programme owner's running count of fourteen recorded as theirs and
**deliberately not verified by census here**, because asserting a total for that rule would be the
defect performing itself. **The second pre-landing check (D-121)** — *does this measurement range
over the dimension a defect could live in, and does its output say how deep it went?* — placed beside
the first, with three instances: D-121's nested eighth field, D-077's symbol scan, and D-117's
correction.

**Where work stopped.** **Nothing was built.** `put` still has no non-test caller; no ADR was
authored and no ADR number claimed; `CONTRACT_VERSION` is 1.0.0; no architecture document was
modified; `CHARTER.md` untouched. `verify-programme-closure` **PASS** throughout. The next action is
the D-123 ruling.

---

## Session 34 — 2026-08-06 · ADR-0081 drafted for acceptance; and reconciling the index found D-126

**The request.** D-123 ruled: sibling artefact at rest **and** retrieval envelope on the wire, both.
Draft **ADR-0081** carrying three links — the carrier, D-125's distribution leg, and ADR-0070 §6
steps 4–5 with its citations corrected. **Stop for acceptance.**

**Recorded before writing, on ADR-0078's precedent.** `verify-programme-closure` was PASS at
`0358633` with the leg *"no ADR has been added since closure — 72 ADRs, all baselined"*. The knowing
red was written into `PROJECT_STATE.md` **before the ADR file existed**, predicting **exactly one
leg** — one rather than ADR-0078's two, because ADR-0081 is PROPOSED and amends no architecture
document. Measured after: exactly that leg, naming ADR-0081, with *"no baselined ADR has been
modified or removed — 72 ADRs match their recorded hash"* still PASS.

**Two design consequences emerged in drafting that the ruling did not anticipate, and both are
load-bearing.**

- **The sibling is a parallel `run` segment, not a `<hash>.sig` suffix.** A suffix forces `HASH_RE`
  to be loosened inside `purgeExpired`, and that pattern is the same shape as the one guarding
  `keyFor` — so the naive retention fix would weaken a control P-79.2's addressing rests on. A
  parallel segment keeps both artefact segments a bare hash and turns the purge hole into an
  explicit enumeration change.
- **The body is the commit point — signature written first, body second**, so the body's presence
  implies the signature's. The general form recorded with it: *a partial write SHALL fail toward the
  absence of the thing that is SERVED, never toward the absence of the thing that PROVES it.*

**P-81.5 reconciled rather than assigned.** It has been cited across the registers since the v1.1.0
amendment D-121 closed, always meaning *the writer parses before it puts*. ADR-0081 is the ADR those
citations were waiting for, so P-81.5 lands with the meaning it was always cited with.

**No `Closes:` label declared, and the omission is stated in the ADR (§5.4).** ADR-0007 already
closes AD-016 and the closure-uniqueness property admits *one decision, one ADR*. ADR-0081 discharges
AD-016's **distribution** leg while ADR-0007 holds its **model** — a state the register cannot
express, because AD-016 is one identifier over two decisions. A false structural claim would be worse
than a traceability gap that is written down.

**Gate measurement.** `verify-adr-completeness` **PASS**, unchanged — all eight sections, no
duplicate closure. `verify-change-control-completeness` **FAIL on the same 2 properties with the same
pre-existing offenders; ADR-0081 appears in neither list** — zero net new.

**D-126, raised by the reconciliation itself.** Adding the index row meant comparing `DECISIONS.md`
§5 against `docs/adr/`: **73 on disk, eight unindexed**, including **ADR-0080** — accepted the same
day and the subject of D-115's open ruling. **Three gates run over the ADR estate and the index is
the subject of none of them**; the connectivity property's wholesale `program/` scan makes *mentioned
in state* indistinguishable from *indexed*. It is D-107 at its root in the harder direction —
**absence rather than staleness** — and it is the connectivity property's own deliberate widening
arriving as a cost, with nothing recording which detection was traded away. **Seven rows were not
back-filled:** nobody can write the summary of a decision they did not take. The repair is to derive
the index.

**Where work stopped.** **Nothing built. Nothing in ADR-0081 §6 performed.** No architecture document
amended, no contract version moved, no gate added, no source file touched, no re-baseline taken.
`CHARTER.md` untouched. **The next action is acceptance or amendment of ADR-0081.**

---

## Session 35 — 2026-08-06 · ADR-0081 accepted and re-baselined; the decision-index gate built; P-81.4 landed

**ADR-0081 ACCEPTED**, with **two propositions marked in the text as amending the authorising ruling
rather than restating it**: §3.1's parallel `run` segment (the ruling required the `HASH_RE` hole
closed *in* the scheme; drafting found the obvious closure — loosening the pattern — weakens the
control P-79.2 rests on) and §4 P-81.1's write ordering, which **was not in the ruling at all** and
governs a **crash boundary** no prior decision on this path had had reason to consider.

**Re-baselined twice, both deliberate, both diffs reviewed.** First for the accepted ADR (ADRs
72 → 73, `openDebt` gaining D-123–D-126); then for the new gate (75 → 76). Closure **PASS** after
each. **No architecture document moved in either.**

**The re-baseline diff review found D-127**, which is why it is done rather than skipped: **all seven
evidence artefacts backing `FINAL_CERTIFICATION_REGISTER.md`'s verdicts are `.gitignore`d**, the
register binds each verdict to a content hash, and **M2.2 Consumer Compatibility's hash changed with
no commit and with `verify-programme-closure` PASS on both sides.** The verdict is unchanged and the
gitignoring is correct under R-14.2 — **the defect is a register asserting CERTIFIED and offering as
proof a hash that binds to an artefact existing in no clone.** Committing the seven would satisfy the
hash and break R-14.2; the repair is a property in the emitter, not a file.

**D-126 — the index is now derived.** `verify-decision-index.js` checks four properties, membership
first and **enumerated from disk**, because an index-driven loop cannot see a row that was never
written. **Registered as RED and escalated (R-18.12)**, taking the suite from **9 red to 10**, and
its three failures are real: seven unindexed ADRs, ADR-0040's status literal `COMPLETE` (a sixth
token in no vocabulary), and ADR-0067's two-cell row. **The seven were NOT back-filled** — nobody can
write the summary of a decision they did not take. **Fault proof recorded** for the one green
property (clean → phantom row → FAIL naming `ADR-0099` → clean), the fault reverted in full.

> **THE GATE'S FIRST RUN FOUND A DEFECT IN MY OWN WORK — ADR-0081's index row still said PROPOSED
> while the file said ACCEPTED — AND FOUR DEFECTS IN THE GATE ITSELF.** The status reader matched
> only bold-wrapped tokens (57 false positives); the row reader scanned whole rows and matched the
> word REJECTED inside a summary's prose; the row finder searched the whole file and picked §4's
> *open decisions* rows; and the section regex used **`\Z`, which is not a JavaScript escape** — it
> silently means the literal letter `Z`, ended the section at a timestamp's trailing `Z`, and
> returned **24,007 of 95,518 characters** while still matching, still parsing and still producing
> rows. **Each was found by the gate's output disagreeing with a hand check, never by anything
> failing.** The second pre-landing check applied to the instrument that was written to enforce it.

**P-81.4 built — ADR-0081 §6 step 2, sequenced first.** `RegistrationGrant.configuration` now carries
`packageVerificationKeys`; `PackageVerificationKey` has **no field that could hold a private key**,
so R-08.15/R-08.17 are enforced by shape; the composition root supplies a **thunk** so a tenancy
registering after a rotation gets the current set. `tsc` clean, **352/352** engine tests pass.

**D-125 corrected while implementing its own fix.** The first entry implied the EP would **proceed**
on a placeholder. It would not — the boot guard refuses start on any unresolved `<FILL:>`, and the
convention is deliberate. **The real defect is which list the marker was in:** every other `<FILL:>`
names something the customer holds, under a sentence stating *"the Intelligence Plane holds none of
them"* — and this one named a **DBiz-held value appearing in no artefact the customer possesses**.
The consequence was not an unsafe boot but a **permanent** one.

**And the positive control stated what the build does NOT fix.** Generating a real solution for
`carlisle-homes`: `config/security.json`'s remaining markers are the EP signing key and the
customer's KMS key — both genuinely theirs. **But `config/connectivity.json` still carries four
IP-owned markers** (`executeEndpoint`, `evidenceEndpoint`, `oauthTokenEndpoint`,
`telemetryEndpoint`), and the boot guard refuses on any of them. **The generated Execution Plane
still cannot boot. P-81.4 removed one blocker of five, not the last one** — recorded so no reader
takes this as unblocking the EP.

**Regenerate noise classified, not stashed.** The 20 platform-certification reports differ by their
`_Generated <timestamp>_` line only; `history.jsonl` gained append-only run records with the verdict
unchanged (NOT CERTIFIED, overall 50); the customer-success manifest and performance report differ by
commit pointer and measured timings. **Nothing load-bearing was sheltering in them this time** —
checked, because `NEXT_ACTION.md` records that four load-bearing files once did.

**Where work stopped.** ADR-0081 §6 steps 3–6 are NOT started: the carrier itself, the writer, the
transport substitution, the retirement, and the captured compatibility fixture. **Nothing has been
written to the sealed package store.**

---

## Session 36 — 2026-08-06 · D-115 ruled B/B/B; ADR-0082 drafted for acceptance

**The request.** D-115 ruled Q1 = B, Q2 = B, Q3 = B. Author the run-and-evidence record ADR as **one**
decision, carrying three passages verbatim, with Q3's precondition ordering in §6 and §3's full
discharge. **Stop for acceptance.**

**Recorded before writing**, on the precedent now used twice: closure was PASS at `9815e9f` with
*"73 ADRs, all baselined"*; adding ADR-0082 turns **exactly one leg** red, deliberately, because it
amends no architecture document. Measured after: exactly that leg.

**Carried verbatim, as instructed** — P-82.3's discriminator (*what changes when an EP re-fetches a
package it already holds*), the decisive reading that **R-05.28 forbids the collection record in the
same sentence that requires the evidence record**, and §4.4's boundary **as a constraint rather than
a note**: references and hashes, never payloads, because a record that accreted payloads would be an
unauthorised C1 store — and since C1 in this plane is *"ephemeral, never persisted"*, that is a
condition on the store's **existence**, not a labelling exercise.

**Q3 is §6 step 1**, before either store exists, with its own completion condition: an executing test
showing an unbindable evidence reference **refused, not stored**. Built after the stores it would be
two stores and no derivation.

**One thing the drafting had to settle that the report did not.** `verify-data-sovereignty-store.js`
is **scoped to one subject by construction** — it hard-codes the sealed package store's path and
fails closed when that file is absent. ADR-0082 P-82.8 therefore **extends it to a second enumerated
subject rather than adding a sibling gate**: *"which stores does document 06 govern?"* must have one
answer from one enumeration, and a second gate makes the answer *"however many gates someone happened
to write"* — **which is exactly the shape D-126 recorded one session earlier**, where three gates ran
over the ADR estate and none over the index.

**Also settled in drafting:** no `Closes:` label is declared and the ADR says why — it closes no
`AD-nnn`, and **AD-008 and AD-009 are neither answered nor touched**. AD-009 concerns a durable queue
**inside the customer tenancy** and must not be read as discharged by a store in this one.

**Measured, prediction written first.** `verify-adr-completeness` **PASS** (unchanged);
`verify-change-control-completeness` **FAIL on the same 2 pre-existing properties, ADR-0082 in
neither**; **`verify-decision-index` FAIL on the same 3 — ADR-0082 is indexed and its status
agrees**, which is the gate built last session working as intended; `verify-programme-closure`
**PASS → FAIL on exactly one leg**.

**Where work stopped.** **Nothing built.** `GET /api/tenants/{slug}/work` is unmounted, ADR-0080 §6
steps 3–5 are unperformed, no new store exists, no re-baseline taken, `CHARTER.md` untouched.
**ADR-0081 §6 step 3 — the carrier — is authorised and not started**, and is the action after this
acceptance.

---

## Session 37 — 2026-08-06 · ADR-0082 accepted with P-82.9; §6 step 1 partly discharged; D-128

**ADR-0082 ACCEPTED** and re-baselined — ADRs 73 → 74, exactly one leg, diff reviewed, closure PASS,
no architecture document moved.

**P-82.9 was added at acceptance**, because the ADR's own risk paragraph was read as a **gap** rather
than a caveat: **P-82.6's allow-list enumerates FIELDS and P-82.3 governs CAUSATION, and they do not
overlap.** Reported first at `P-82.3_WRITE_TRIGGER_CONTROL_REPORT.md`. The report's finding is that
the obvious enforcement — *"exactly two call sites"* — **counts the wrong thing**: a pinned count is
CHARTER §17.1(i)'s trap, and two calls into a general `record()` are worse than five into
`onEvidenceArrived`. So the write surface **enumerates the events** and the gate is a
**permitted-caller census**. The `stages.ts` module-private brand was examined and **does not survive
the package boundary** — named in the ADR so nobody reaches for it. §4.2 states the three residuals
the control does not reach.

**§6 step 1 landed in part, and the part that did not is named.** The ingress now refuses a reference
carrying no usable `packageHash` — 422, before any side effect. **Measured against a running gateway:
two positive controls accepted, three subjects refused, and a fourth control refused for a DIFFERENT
stated reason**, showing the check shadows nothing. **`evidence.received` written exactly twice across
six probes — refused, never stored, proved by observation.**

> **THE PROBE NEEDED TWO CORRECTIONS BEFORE IT MEASURED ANYTHING** — six identical 401s, then six
> identical 400s, both fallthroughs one layer above the subject. Without the controls the first run
> would have read as *the ingress refuses everything*, which is the answer that looks like success.
> The probe also regenerated a **tracked** verification key at boot; reverted.

**D-128 raised.** **(i)** There is no evidence route in the authenticated tier — `POST /v1/evidence`
exists only on a gateway that binds `127.0.0.1`, exits on production, and whose `/v1/*` never reaches
the deployed application. **(ii)** `EvidenceReferenceHandle` is constructed at stages 8–9, **before**
the package is composed, so requiring `packageHash` there breaks both sites with no value to supply —
**D-124's consequence arriving as a blocker.** The decision owed is whether the evidence route moves
to the authenticated tier before ADR-0049 M5 retires the gateway.

**Recorded as the fourth pre-landing check:** *does this governance question have exactly ONE place
that answers it, and is that place an enumeration?* **D-126 is that check failing; P-82.8 is it
passing**, and the difference cost one sentence in an ADR against a whole gate.

**Where work stopped.** ADR-0082 §6 steps 2–4 not started; ADR-0080 §6 steps 3–5 unperformed; `/work`
unmounted; ADR-0081 §6 step 3 authorised and not started. **Nothing written to any store.** Suite
stands at **10 red**, unchanged by this session.

---

## Session 38 — 2026-08-06 · D-128 ruled and unblocked; D-124 reported as one field, not a placement

**The request.** Record the probe pattern as a pattern. Rule D-128 — move the evidence route to the
authenticated tier, do not wait for M5 — **but report D-124 first, because it blocks the move.**

**IT DOES NOT BLOCK THE MOVE, AND THE ENTRY THAT SAID SO WAS MINE.** Measured:
**`receiveEvidence` — the function that ingests EP evidence as handles — has zero non-test callers**,
and the gateway's `POST /v1/evidence` consumes **raw wire JSON**, implementing its own inline payload
check instead of calling it. **`EvidenceReferenceHandle` is on no ingress path at all**, and
`EvidenceReferenceSchema` — the wire contract — already requires `packageHash`. D-128's claim (ii) is
corrected in the register rather than quietly dropped.

**D-124 is one field.** Of the three domain outputs `composeExecutionPackage` consumes, **two are
assigned at stage 3** and exactly one is not: **`gates`, from `executiveReporting.certificationSummary`
— stage 11.** The package is composed after all twelve stages because **one field depends on a stage
that runs after the stage meant to author it.**

> **And it is worse than mistimed.** R-20.7 makes gates conditions the EP **carries** and the IP
> **evaluates**; a certification summary is what the IP **concludes after a run**. In a real
> cross-plane run the derivation is **impossible**, not late, because `STAGE_PLANE` makes stages 8–9
> the Execution Plane's. **The reference path works only because it simulates all twelve stages
> in-process, then composes a package "for dispatch" from a completed run — the ordering D-122 ruled
> impossible when it rejected "write the package at certification". The rejected option is what the
> implementation does.**

**So the repair is to sever `gates` from stage 11, not to move the composer**, and what gates should
derive from instead is a **capability decision** the report deliberately does not take. The
**two-phase handle is rejected**: it manufactures a window in which a handle exists and cannot be
attributed — ADR-0081 P-81.1's rule violated one artefact along.

**A fifth instance of the unwired-declaration class sits on the path just ruled to be built.**
`receiveEvidence` is declared, exported, conformance-tested and called by nothing, while the gateway
duplicates its payload guard inline. **The move is equally an opportunity to wire it and an
opportunity to carry the duplicate into the tier that is supposed to be canonical** — so wiring it is
step 3 of the move rather than a follow-up.

**Recorded as a check rather than an incident — the probe pattern.** *Before reading a refusal as the
subject refusing, ask what a deliberately VALID input returns.* Third instance, and the sharpest: the
evidence probe's six identical 401s then six identical 400s were **both refusals of the right general
kind**. **A 405, a 401 and a 400 all mean "no", and a property written to produce "no" is confirmed by
any of them** — the wrong answer and the right answer are the same word. A second *refusing* sibling
is explicitly not a substitute; instance 2's `{}` and the gateway envelope were both refused
byte-identically and proved only that neither is a package.

**Where work stopped.** **Nothing built.** The move is specified and not performed; ADR-0082 §6 steps
2–4 not started; ADR-0080 §6 steps 3–5 unperformed; `/work` unmounted; ADR-0081 §6 step 3 authorised
and not started. Closure **PASS**; suite unchanged at **10 red**.

---

## Session 39 — 2026-08-06 · the evidence route moved and is socket-proved; the gates derivation reported

**Built — D-128's four steps.** `POST /v1/evidence` now exists in the authenticated tier, served by
both transports from one pure handler, its auth block **written out rather than copied**:
authenticated principal → **EP-token revocation** → `tenant:update` → a principal scoped to **exactly
one tenant**. The tenant comes from the credential; a body claiming another is **refused, not silently
re-scoped**.

**Socket-proved through the assembled application** (D-111's lesson), positive control first:
conforming → **202**; no `packageHash` → **422** naming the contract; embedded payload → **422 even
though it PARSES** (the schema is `.passthrough()`); nested in `artefacts[]` → **422**; another tenant
→ **403**; no credential → **401 + RFC 6750 challenge**; platform-admin → **403**; **superseded EP
token → 401**, on its own tenant with its own positive control. **361/361 and 210/210 green;**
parity, composition-root, provider-platform and closure all **PASS**.

> **THE POSITIVE CONTROL FAILED FIRST, WHICH IS WHY IT IS FIRST.** The fixture used
> `domain: 'dbiz.evidence@1'` and `assuranceState: 'verified'` — **neither in the contract's
> vocabulary** — and the route refused it. **A parse rejecting a hand-written fixture is the parse
> working**; a fixture authored to match the code rather than the contract is what D-117 counts. The
> rotation test failed for a second reason worth keeping: `v-1` is not a parseable EP principal, so it
> measured a **malformed principal**, not rotation.

**Step 3 landed as a rule-lift, not an import, and the reason is the finding.**
`@dbiz/functional-testing-engine` is **not a dependency of the API tier**, and adding it would make
the platform's tenant surface depend on a **capability engine** — inverting the layering. **A
wire-contract rule belongs in the contract**, so `carriesEvidencePayload` now lives in
`@dbiz/contracts` beside the schema, and the capability's channel delegates to it. **The three copies
had already drifted** — the capability's omitted `body` and `bytes` and did not look inside
`artefacts[]`. Both consumers now run the **same** check rather than two that agree.

**The cost is recorded in the register, the state file, the route's own source AND its response
body:** the route **accepts any reference whose `packageHash` parses, including one naming a package
this plane never authored.** Resolution to a known run is **not** carried — ADR-0082 §6 step 2 — and
`recorded: false` is in the 202.

**D-124's corrected form recorded as its headline:** the reference path composes a package "for
dispatch" from a **completed run** — exactly the option **D-122 rejected as impossible**. The ruling
was right and **the implementation has been doing the rejected thing since before the ruling
existed**; nothing could see it because **nothing ever dispatched**, and the two artefacts are
byte-indistinguishable.

**Gates derivation reported** (`GATES_DERIVATION_REPORT.md`). A gate is a condition on evidence that
does not exist yet; a certification outcome is a judgement about evidence that does. **The declaration
is at stage 3 and the composer already reads it** for `evidenceRequirements`. **But severing `gates`
moves nothing:** the bridge refuses to compose until the run is **certified** — stage 11. **Three
severances, and the third is a ruling** — at stage 7 there is no certification verdict, only the
triad's, which is C-11.13's question. **Authoring and publishing are two acts**, and P-70.1's *"exists
and is retrievable"* is two moments rather than one obligation.

**Where work stopped.** Nothing else built. ADR-0082 §6 steps 2–4 not started; ADR-0080 §6 steps 3–5
unperformed; `/work` unmounted; ADR-0081 §6 step 3 authorised and not started.

---

## Session 40 — 2026-08-06 · authoring/publication ruled two acts; severances 1 and 2 landed; 3 reported

**Ruled:** P-70.1's *"exists and is retrievable"* is **two conjuncts and two moments**, and D-122 read
it as one obligation — recorded as the programme owner's error carried into that ruling.

**Severance 1 built.** `gates` now derives from `automationIntelligence.validationRequirements` —
stage 3 — the source the composer already reads for `evidenceRequirements`, because *"what SHALL be
captured" and "what SHALL be true of it" are one declaration seen from two sides*. **Proved with both
controls:** gates are **identical** when the stage-11 summary changes, and **change** when the stage-3
declaration changes. **The grammar was reported, not taken** — R-20.7 fixes who carries and who
evaluates, not the vocabulary, and a closed `expression` enum is a contract change at a moved version.
The expression carries the requirement verbatim and the source says it is a declaration, not yet an
evaluable expression. **Severance 1 fixes the temporal defect only.**

**Severance 2 built.** Composition is unconditional; the certification check moved from gating
*authoring* to gating *publication*. Nothing weakened — the same verdict blocks the same crossing —
and an uncertified run now produces an inert artefact. 210/210 green.

**Severance 3 reported, and the premise needed one correction that changed the answer.**
*"The canonical triad cannot decline"* is **no longer true as stated**: `emit.refuse` exists
(ADR-0071), `certify()` now reads refusals, and `architecture-review` **can** refuse, reachably.
**What is open is narrower — the triad reviews PRESENCE, not SOUNDNESS**; `policy-review` and
`guardrail-review` cannot refuse **by ruling**, because their negative is pure absence.

**Recommendation: available as an interim on three conditions** — per-leg recording with
`notApplicable` never counted as approval (CHARTER §17.1); the per-leg fact carried where a consumer
can see it; and **the decision SHALL NOT use the word *certified***, because the triad establishes
**admissibility**, not soundness. Without the third the interim is a weak gate wearing a strong gate's
name. **"Wait for D-019" is the more expensive answer**: the EP needs the package before stage 8, so
the comparison is **weak gate vs no path**.

**D-019's headline corrected in the register**, and closing it resolves to ADR-0076 §4.4's
`UNDECIDED — Functional Testing` — a decision with an owner rather than a repair with no author.

**D-124's headline recorded as ruled:** the two artefacts are **byte-indistinguishable and differ only
in WHEN they were built** — not a missing check, but two things identical in every dimension an
artefact carries. **An ordering with no consequence produces no evidence of itself.**

**The rule-lift recorded as the finding it is:** the argument is not that duplication is untidy but
that it **had already failed** — three copies, drifted. And importing would have **inverted the
layering**; a wire-contract rule belongs in the contract.

**Where work stopped.** Severance 3 not built; ADR-0082 §6 steps 2–4 not started; ADR-0080 §6 steps
3–5 unperformed; `/work` unmounted; ADR-0081 §6 step 3 authorised and not started. Closure **PASS**.

---

## Session 41 — 2026-08-06 · the publication gate is built and proved; the store still has no writer

**Built — severance 3, all three conditions and the fault proof.** `decidePublication()` in
`capability-framework` decides admissibility from the **governance triad alone**, because that is the
only certification that exists before stage 8 and the EP needs the package before stage 8. **The
reason is recorded as the reason and not as a caveat: this is not strong-gate versus weak-gate, it is
WEAK GATE VERSUS NO PATH.**

**Condition 1** required a type change: `certify()` carried the `refused` / `not-applicable`
distinction **only in a prose `reason`**, so a consumer needing it had to parse a sentence a producer
happened to write — D-013's shape. `Verdict` now has a typed `disposition`. **Condition 2**: `legs`
travels inside the decision and the decision travels on `RuntimeExecutionOutcome`; the record is
**enumerated from the triad, not from the verdicts**, so an unrendered stage produces a leg marked
`absent` rather than vanishing.

**Condition 3's property caught my own message.** The emitted reason read *"ADMISSIBLE IS NOT
CERTIFIED"* — true, and the property failed it, and **the property is right**: a disclaimer still puts
the word into every emitted verdict, where it is excerpted, logged and eventually read without its
negation. The distinction moved to the module's documentation, which travels to a reader deciding
whether the gate is sufficient, rather than to the message, which travels to everyone else.

**Fault proof, both legs:** positive control (all three judged → admissible, three legs carried) and
**nine faults** (each leg `not-applicable`, `absent`, `refused`) → not admissible, each naming the leg
and its disposition. Plus the **subject-removal test on the gate itself** — an empty outcome carrying
`certified: true` → **not admissible**, because a gate reading only that boolean would have admitted.
**89/89 framework · 210/210 engine · 361/361 onboarding · closure PASS.**

**The full certification still gates the reference path**, where all twelve stages run and the
stage-11 verdict is strictly stronger — dropping it to use the new gate would weaken a path that can
afford the stronger check.

**D-019's reframing recorded as the entry's real correction:** it was always a **deferred capability
decision carrying a defect's headline**. Filed as *the framework cannot decline*, it read as a
platform repair — and the framework half **was** repaired. What remains is a question only the
capability can answer. **A defect with no author sits; a decision with an owner can be scheduled.**

**Reported at the boundary, as asked: publication now has a GATE. It does not yet have a PATH.**
`SealedPackageStore.put` still has no non-test caller; the write is ADR-0081 §6 step 3, authorised
and not started. That is the next action.

---

## Session 42 — 2026-08-06 · ADR-0081 §6 step 3: the store has a writer, and the round trip works

**Built.** `createSealedPackageWriter` is the component D-122 ruled on. **A package this plane
authored has been written to the store and retrieved back through the real route with an EP
principal** — the first time in this programme.

**All four carried constraints landed with their proofs.** The sibling is a **parallel `run`
segment** (a `<hash>.sig` suffix would force `HASH_RE` loosened inside `purgeExpired`, weakening the
control P-79.2's addressing rests on). **Signature first, body second** — invisible in a green suite,
so it is proved by **crashing the storage provider between the two writes** and observing an inert
signature rather than a findable unverifiable package. **A package whose signature is absent refuses
byte-identically to a never-existing hash** — no fifth class, no oracle. **The write surface
enumerates one event**, asserted as a property.

**Two corrections the build made to my own work.** A non-parseable signature was being refused at the
READ — a stored, valid package 404-ing silently for a write-time defect; the store now validates the
signature's shape at the **write**, which is its stated posture (*a write refusal is loud; a read
refusal never is*). And **the document-06 gate pinned a write-site COUNT** (`putCalls === 1`) and went
red on the ADR-authorised second write — **CHARTER §17.1(i)'s trap**, which bumping to 2 would have
rebuilt one integer along. It now asserts **which segments are written**, from the store's own
exported constants, **fault-proved** by a write to an undeclared segment.

**Recorded as the fifth pre-landing check — the rule the publication gate earned:** *the audience for
the caveat is not the audience for the verdict.* A verdict string is excerpted, logged, quoted and
aggregated, so **the disclaimer travels one hop and the word travels all of them**; putting a caveat
inside a verdict **distributes the claim and localises the correction**. Found by a **property**, not
by review.

**Suites:** contracts 102/102 · capability-framework 89/89 · platform-providers 47/47 ·
tenant-onboarding-engine 368/368 · functional-testing-engine 210/210. Closure, composition-root,
HTTP-parity, provider-platform and document-06 all PASS.

**Where work stopped, and it is the honest boundary:** the writer has **no production caller**.
Publication is not an HTTP operation; driving it from the authoring path is the **ADR-0049 M5
cut-over**, separately authorised. **The store has a writer; the Execution Plane does not yet have a
run to retrieve.**

---

## Session 43 — 2026-08-06 · D-123 link 1 reported; two competing signature shapes found

**Reported before building.** Four answers, one stale premise corrected, and one finding that was not
asked for and is the most urgent of them.

**TWO COMPETING SIGNATURE SHAPES, SHARING NO FIELD NAME on the two fields that matter** —
`SignatureEnvelope { signature, signingKeyId, algorithm }` against `DetachedSignature { value, keyId,
algorithm }`; only `algorithm` agrees. **D-117's sentence at a different artefact**, surviving for
D-117's reason: nothing has ever carried a signature across the boundary, so nothing could disagree.
**It is live**: the writer takes `signature: unknown`, so **the first component to sign a real package
fixes the shape the EP must parse** — D-122's ruling shape one artefact down, and neither type is in
`@dbiz/contracts`.

**What signs today: nothing.** The one wired signer signs an ADR-0035 manifest; the SPI's port is
wired only inside a generated string; the gateway's cannot reach the store.

**Same key, same mechanism, different artefact domain** — not a forgery risk (`digestV1` binds the
domain) but one revocation blast radius; distinct key identifiers per domain recommended.

**Sign at AUTHORING**, because the signature attests **origin** — and **D-122 could not have answered
this**, because reading "exists and is retrievable" as one obligation left no distinct authoring
moment for a signature to attach to. **The writer already assumes it**: `PackageSealedEvent` takes the
signature as an input.

**R-6.3 says credential custody belongs EXCLUSIVELY to the Execution Plane, and this plane holds a
private key.** Both correct; reconciled by scope (Rule 6 is "secrets never cross"), **and that
sentence is nowhere written** — AD-016's shape a second time. A reader resolving it the other way
concludes the platform is in constitutional violation, reasoning correctly from what is written.

**An operational fact worse than the rule question:** `loadOrCreateSigningKey` **generates a new key
on an empty volume** — healthy plane, new `keyId`, every distributed verification key stops matching,
surfacing as `signature-invalid` **in the customer's plane**.

**D-125's premise is stale — the `<FILL:>` is gone**, measured by generating a real solution. What
remains is sharper: **rotation is not built and the grant is the only carrier**, and **the one
registered tenancy holds no verification key at all** because it registered before the field existed.
**So rotation rides with link 1**, or link 1 produces packages the only customer cannot verify.

**Where work stopped.** Nothing built. The M5 cut-over needs rulings 1 and 2 first, or it decides
them.

---

## Session 44 — 2026-08-06 · ruling 1 built: one detached-signature shape, in the contract

**Built before any signer runs, which is the whole point.** `DetachedSignatureSchema
{ algorithm, keyId, value }` now lives in `@dbiz/contracts` and nowhere else — passthrough, so
additive change survives (R-20.4, C-20.7), with `SIGNATURE_ALGORITHMS` refusing an unknown algorithm
at the boundary rather than carrying it through as opaque.

**Urgent rather than tidy:** the writer takes `signature: unknown`, so the first component to sign a
real package would have fixed the shape the EP must parse for the contract's life — **in a diff
reviewable as plumbing.** D-122's shape one artefact down.

**Both consumers converged.** `package-signing.ts` re-exports it; the SPI's `SignatureEnvelope` is a
type **alias** — the name kept deliberately, because renaming a type across a conformance suite in
the same change that unifies it would make the convergence unreviewable. One shape, two names, one
declaration.

**`{ algorithm, keyId, value }` won because they are the names actually PRODUCED.** Converging toward
the artefact that exists costs nothing; converging toward the unwired port would rewrite a working
signer to match something that has never run. **The counter-argument is answered rather than
omitted:** `signingKeyId` matched `provenance.signingKeyId`, and that symmetry is now an
**invariant** (`signatureMatchesProvenance`) rather than a shared spelling — **two fields with one
name still hold two values, and nothing compared them.**

**The compiler was the proof.** Four compile errors across two conformance suites, each a place where
a `SignatureEnvelope` literal could not satisfy the contract — that the type system found every
construction site is itself the demonstration that the drift was not stylistic.

**Proved:** a well-formed signature parses; an unknown algorithm is refused; **the retired shape is
REFUSED rather than passed through** — which needed asserting precisely because passthrough admits
unknown fields, so it must fail on the **absence** of the required ones; additive fields survive; the
provenance agreement compares **values, not spellings**.

**107/107 · 89/89 · 47/47 · 368/368 · 210/210.** Closure, contract compatibility and document-06 all
PASS.

**Where work stopped.** Link 1 itself is not built. It lands with **rotation** and the
**mint-on-empty repair** — neither is a follow-up: without rotation the only registered tenancy
cannot verify anything, and without the repair a lost volume silently mints a new signing identity.

---

## Session 45 — 2026-08-06 · three rules recorded; the first-run marker reported, and it should not be a marker

**Three rules recorded beside the pre-landing checks**, each from ruling 1 rather than invented:

**A shared spelling is not an agreement** — `SignatureEnvelope.signingKeyId` matched
`provenance.signingKeyId` and the resemblance was the whole guarantee. **Two fields with one name
still hold two values, and nothing compared them.** *A field name is not the place to encode an
agreement that can be checked.* The agreement is now a predicate over the two values — and what it is
**not** is stated with it, so a caller reading `true` as *verified* does not make D-012's error.

**The compiler as the demonstration** — four errors across two conformance suites, each at a
construction site a `SignatureEnvelope` literal could not satisfy. **That the type system found every
one is the evidence the drift was not stylistic**; a rename would have compiled. It is a cheap,
honest census that is usually discarded as work to get through.

**Refusing a retired shape on a passthrough schema** — it must fail on the **absence of required
fields**, never by rejecting extras, because **a passthrough schema that refuses by extras refuses
nothing**. The conformance property asserts the refusal **and** the survival of additive fields
together, because either alone is consistent with the schema being wrong in the other direction.

**The first-run marker reported, and the answer is that it should not be a marker.** Every
token-shaped option fails the test the ruling set — a token lives either on the lost volume or in an
operator's hands. **Derive it from whether a tenancy has ever been registered:** verification keys
reach a tenancy *only* through the registration grant, so **no tenancy means none was distributed and
minting is harmless.** The accident that destroys the evidence destroys the reason to refuse —
**coupled to the harm, not to a token.** It over-approximates toward refusal, which is the correct
direction. The self-retiring environment flag is refused explicitly: it still authorises the operator
debugging a refusal to create the state the refusal exists to prevent.

**A residual is stated rather than left to be found:** the refusal is only actionable once rotation
exists, because re-minting after an accepted loss requires re-distributing — another reason link 1's
three parts land together.

**D-129 raised.** `SESSION_SECRET` goes through the Secret Provider; the **package signing key** —
ADR-0007 §2's highest-value asset — is a file created if missing, **twelve lines apart in the same
composition root**. No decision records the split; it predates the provider adoption, which was
additive. **`SecretProvider.require` already has the semantics the mint-on-empty repair is
reconstructing by hand.** Not folded into link 1 — AD-016's leg, its own ADR.

**Where work stopped.** Link 1 not built; it waits on the first-run condition being ruled.

---

## Session 46 — 2026-08-06 · D-123 link 1 built, all three parts; ADR-0083 raised for the cause

**Built together, none a follow-up.**

**(c) Mint-on-empty as a refusal, on the DERIVED condition** — not a marker. The ruling's reasoning is
the code's own comment: minting is harmful only because verification keys already in customer hands
stop matching, and those reach a tenancy only through the registration grant. **The accident that
destroys the evidence also destroys the reason to refuse.** Every token-shaped option is refused with
its reason, including the self-retiring flag. The over-approximation is recorded as deliberate and in
the correct direction.

**(a) The signer at AUTHORING**, structurally satisfying the runtime's port without importing it —
and it **enforces the provenance agreement**, which is where `signatureMatchesProvenance` stopped
being a predicate nobody called. This is the only place both values are ever in hand; letting a
mismatch through turns an authoring defect into `signature-invalid` in the customer's plane.

**(b) Rotation** — `verification-keys-changed` on the ADR-0035 channel the EP already polls: no new
route, no inbound connection, no redeployment. **Idempotent by comparison over the key ids actually
sent**, not by a marker. A changed set carries **both** keys, because ADR-0007 §6 keeps several valid
concurrently. Only public material crosses, and distribution is **audited**.

**Proved, each block with its positive control** — 11 new properties, `107/107 · 89/89 · 47/47 ·
379/379 · 210/210`, and closure, composition-root, HTTP-parity and document-06 all PASS.

**ADR-0083 raised for D-129, correctly not folded in.** The cause is recorded plainly because it is
the part nobody would find by review: **no decision records the split.** ADR-0060 §6 M-a adopted the
config/secret seam **additively**, so what was already a file stayed a file — **the weaker custody
holds the stronger asset by residue, not by choice**, and the absence of the decision is the finding.
`SecretProvider.require` already has the semantics link 1's repair reconstructs, so **link 1's repair
is interim by construction and now says so at the site**; P-83.3 retires it **with its subject**.

**The connectivity gate caught ADR-0083 before its index row existed** — red on *every ADR is
referenced by the architecture, another ADR, or programme state* the moment the file was written.
D-126's lesson working the other way round.

**Where work stopped.** R-6.3's reconciliation is not written — it is next, and it is an ADR because
it touches a frozen document. ADR-0083 awaits acceptance. The M5 cut-over now waits on nothing but
its own authorisation.

---

## Session 47 — 2026-08-06 · ADR-0084: Rule 6's scope written down; four records from link 1

**ADR-0084 drafted.** It **adds no rule and narrows none** — it records the scope Rule 6's own title
implies and **its own conformance line already states**.

**The decisive argument was inside the rule.** Rule 6's conformance line measures *"no secret-shaped
value in any **cross-plane payload**"*, and all three enforcement mechanisms inspect a cross-plane
payload or the cross-plane client. **A rule forbidding this plane from holding any key would have no
enforcement mechanism here** — and a rule whose enforcement cannot see a case was never about that
case. What is missing is only that **R-6.3's sentence can be read in isolation.**

**Why it must be written:** a reader resolving R-6.3 against R-08.15 from the page concludes the
platform is in **constitutional violation** — and would be reasoning correctly, because R-6.3 sits in
the document whose authority line says it governs. **AD-016's shape a second time**, and the pattern
is named: each half recorded correctly in its own document, **and no document records that there are
two halves.**

**The closest call is recorded as such:** amending R-6.3's *text* is the smallest edit and **invites
the reading that a constitutional rule was narrowed**. §6 step 2 requires the diff to show only the
scope note moved, and that diff is the evidence for P-84.2.

**Four records from link 1.** The signer's refusal as **the invariant's justification** — the only
place both values are in hand, and mint-on-empty's shape at a second site: a defect surfacing where
nobody did anything wrong. Rotation's marker refusal as **the second application of the first-run
reasoning** — twice the temptation was a token and twice the answer was to derive. The **both-keys**
detail with its consequence: a failure appearing **only in production and only for packages already
issued**, invisible to any test that does not hold an artefact from before the change. And the
**seventh pre-landing check** — *an additive migration leaves the unmigrated case indistinguishable
from a considered exception*; a deliberate exception and an untouched case are the same artefact, so
the auditor either invents a rationale or reports a violation, and both are wrong.

**The two gates recorded as a pair:** connectivity catches a decision nothing points at; membership
catches one the index does not name. **One drift from each end, and only the first was covered until
D-126** — which is how eight ADRs sat unindexed while every one was *connected*.

**Where work stopped.** Nothing built. ADR-0083 and ADR-0084 await acceptance; the M5 cut-over waits
on nothing but its own authorisation.

---

## Session 48 — 2026-08-06 · ADR-0084 then ADR-0083 landed; M5 stopped at its own precondition

**ADR-0084 landed first, deliberately.** With Rule 6's scope recorded, ADR-0083 reads as a **custody
improvement**; in the other order it would have read as **a violation being remediated**, and it never
was one.

**The constitution's amendment was verified by its diff, because the diff IS the evidence for
P-84.2:** 72 rule lines before, 72 after, **zero changed**; 20 Conformance and Enforcement lines
before, 20 after, **zero changed**. No test can detect this change and none was written to pretend
otherwise.

**ADR-0083 executed.** The key resolves as `PACKAGE_SIGNING_KEY` from the secret backend; the
create-if-missing branch is gone; **`SigningKeyMintAuthorisation`'s four properties were deleted, not
kept** — they would have been satisfied by the absence of what they watched. What replaced them is
stronger: unprovisioned refuses, **empty is treated as absent rather than as a key**, and the module
**exposes no create-or-get at all**, asserted as a property. **The adoption end-to-end test had to
provision the key to keep booting** — the change working, because a test is a deployment.

**M5 STOPPED, and the reason is better than a dangling reference.**
`verify-package-governance.js` §13 reads the gateway's source and asserts **the sealing point is
wired to the four-level contract gate** — *"a gate nothing calls is a gate the programme does not
have"* — and **the canonical path does not call that gate at all.** `certifyPackageForSealing` has two
non-test callers: the gateway, and a registry orchestrator the bridge does not reach. **The cut-over
as scoped would silently drop a governance gate the old path had**, and none of the three available
responses is a wiring decision.

**What only a non-compiler check could find:** of five executable references to the gateway, **three
are in `.mjs` or inside a regex literal.** Nothing imports or executes it; one reference is a
deny-list pattern, two are comments, **one is the governance gate.**

**And the shape difference costs nothing to migrate** — nothing has ever consumed a gateway package:
`/v1/*` never reaches the deployed application, the gateway binds `127.0.0.1`, and no module here
reads its response. **There is nothing to translate and no compatibility window to open.**

**Where work stopped.** The gateway stands. The ruling owed is whether the canonical authoring path
certifies for sealing, and at which act — a capability decision the report deliberately does not take.

---

## Session — 2026-08-06 · story input: attachments, completeness as refusal, subject before breadth

**What was asked.** A capability report before any design, on three things that are different kinds of
work: whether anything reads a story attachment and whether carrying one crosses a sovereignty boundary;
what an upstream story-completeness assessment would look like **as a refusal rather than an inference**;
and the recording of **subject before breadth** as a constraint on the work.

**What was found on entry, and it moved the first part.** The request stated `RequirementInput` carries
`rawAcceptanceCriteria`. **It has not since Section D** — ADR-0075 P-75.2 removed it, and the raw text now
travels as an observed fact on `StoryObservation`. The prompt was measured against the disk rather than
followed, per CLAUDE.md §5, and the correction is not cosmetic: **the carrier a story attachment would use
already exists, and it is `StoryObservation`.**

**The measurement, and one shape runs through all three parts.** Nothing reads attachment content in
either plane. Three sites read attachment *names*; one writes references outward. But `retrieved` is a
boolean nobody sets, `classifyArtefact` classifies a list nobody fills, `design-sync`'s `artefacts` input
is plumbed and empty, ten of thirteen `ApplicationKnowledgeModel` slots are literal `[]` on every run, the
only producer of a `StoryObservation` in the repository is a fixture, and the Execution Plane performs no
work-item attachment retrieval at all. **Every capability in this area is built and unwired.**

**And the referencing answer was already written down.** `ArtefactObservationSchema` carries
`name · extension · mediaType · bytes · sha256 · retrieved · retrievalError · provenance` and **no content
field** — *"described by what is observable about it, never by what it is FOR"* — with `DesignAttachmentRef`
matching it on the write side. **Evidence's referencing model is not an analogy here; it is the same model,
already declared on both contracts.** What is absent is anything that fills either.

**What was decided.** Three rulings taken: attachments cross **by reference only**, content is **C1** and
gets no store without R-06.4's four conditions, and **who fetches is EP-side by R-3.2** — *whether* stays a
capability decision. The `{name, retrieved}` projection is a **defect, not a design**, and widening it is a
**build** because ADR-0075 P-75.8 already holds the gap open; the `attachments-retrieved` signal reporting
`present:true` on an empty list is fixed **with** the widening rather than deferred. The twelve discarded
completeness signals are recorded as a declared-and-unconsumed instance. **D-130, D-131.**

**The finding held back for a ruling was already ruled, against the framing it arrived with.**
`policy-review` approving on `story !== undefined` while `story-intelligence`'s `certified:false` goes
unread was offered as *not a capability question*. **D-019 rules exactly this shape and rules it a
capability decision** — reading the verdict changes the predicate from presence to soundness, which is
ADR-0076 §4.4's `UNDECIDED`, and refusing on it answers D-021's owed question as a side effect. Reported as
such rather than landed. **What is genuinely new: D-019 groups `policy-review` and `guardrail-review`
together and they have diverged** — measured, `test-design-intelligence` and `automation-architecture` have
zero `certified: false` sites and `story-intelligence` has one, so **`policy-review` is the only leg whose
subject can dissent and whose gate ignores a verdict that exists.** D-019 amended for it.

**A-8 raised.** The Execution Plane's highest-priority amendment request — a package asserting its own
subject — **had not arrived in this plane at all**; grep returns only `GA-8` and `AA-8`. Filed as **D-132**,
because the EP cannot file against this register and an amendment request nobody in the receiving plane
indexes has not arrived. `provenance.tenantId` is carried and is **not** the answer: provenance describes
authorship, not an obligation on the executor, and carries no `expectedOrigin`.

**What was produced.** [`STORY_INPUT_CAPABILITY_REPORT.md`](STORY_INPUT_CAPABILITY_REPORT.md) ·
D-130, D-131, D-132 · D-019 amended · `PROJECT_STATE.md` updated. **No code, no schema, no ADR text.**

**Where work stopped.** Four capability decisions stay open and are correctly named: D-021's precedence,
who weighs the signals, A-8's subject block, and whether Discovery's `ApplicationModel` sources
`ApplicationKnowledgeModel`. **`NEXT_ACTION.md` is unchanged — M5's sealing-certification ruling is still
the one action, and none of this work competes with it.**

**Continued — the six items, then M5.**

**Taken.** `policy-review` now carries `subjectCertified` / `subjectFinding` beside `approved`, from the
same outcome-ledger lookup the publication refusal uses. Predicate unchanged; presence still decides
approval. **The refusal half was tested against its own condition — *"if it is one line and does not
reopen D-021"* — and the condition failed**, so it was not taken, and the test is recorded rather than
the silence. D-019 amended with the general form: **a finding that groups by symptom ages badly when one
member's cause changes.** The declared-and-unconsumed count corrected from a carried estimate of eight to
a **measured seven**, enumerated — D-107's own subject. `DECISIONS.md`'s ADR-0083/0084 status cells
corrected (owed by the acceptance, not a decision); ADR-0040 and ADR-0067 routed to
`PENDING_ADR_AMENDMENTS.md` **AMD-4**, with a recorded correction that ADR-0067's defect is measurably an
index row rather than baselined content.

**Then M5, and one measurement moved it.** `certifyPackageForSealing` had never been run against a
canonical package. It was: **`sealEligible: false`, 18 blocking findings, every one a GATEWAY field** —
`packageId`, `tenantId`, `metadata.storyAnalysis`, `automation.manifest` and the rest of the set D-117 (iv)
records as absent from the published contract. **The canonical package satisfies `parseExecutionPackage`
and the gate rejects it**, and `SECTION_OWNERSHIP`'s repair strings name the gateway's internals by module
path. **So the four-level gate's subject is the gateway's package FORMAT, not the sealing point** — which
withdraws §5's *"SHALL NOT retire §13 with the gateway"* as stated, and makes option C's first step a
**build** rather than a wiring task. The ruling was restated accordingly and left with its owner:
**is the gate a property of the gateway's format, or of any sealed package?** `NEXT_ACTION.md` updated;
M5 report §7 carries the measurement.

**Where work stopped.** On the restated M5 ruling, which is a capability decision. **And on a condition
worth the next session knowing: another session was editing this working tree throughout** — ADR-0085's
SPI change, 20+ files by the end, mid-flight and leaving the package build red. `src` compiles clean and
the probe ran against `src` only, but **the suite numbers recorded here predate that edit and are not
claimed as current.**

**Continued — M5 ruled, and held.**

**Ruled (a): the four-level contract gate retires with the gateway.** Its subject is the gateway's package
format, named in its own repair strings, and **it does not merely survive its subject's removal — it fails
the artefact that replaces it**, 18 blocking findings against a package that satisfies the published
contract. (b) was not available as scoped: the 18 are absences of fields existing only in the retiring
format, so re-expressing the gate writes a **new gate sharing a name** and settles what a sealed package
must satisfy inside a change reviewed as a cut-over. What already holds — `parseExecutionPackage` on the
serving path, `decidePublication()` admissibility, the seal — is recorded at §8.1 so the retirement leaves
no property unguarded. **Option C's first step dissolves; steps 2 and 3 are one act.**

**§5's prohibition withdrawn on measurement, and the reason it survived was recorded as the transferable
part.** *"Its subject is the sealing point, which moved"* was an **inference**, adopted into §5 as a
prohibition and never distinguished from the measured facts beside it. **Testing it took one run of the
gate against the artefact it would govern.** The rule recorded: a prohibition resting on a claim about a
control's subject shall state how the subject was established — **and the cheaper the test, the longer it
goes untaken**, because a claim checkable in one run is assumed to have been checked. D-107's class, third
instance, and the cheapest to have measured.

**Then the tree was measured, and M5 was held.** The other session's ADR-0085 `functional-testing-engine`
half **landed mid-session** — clean typecheck, 210/210, where an hour earlier five test files referenced
an undeclared `made` binding. **Its `tenant-onboarding-engine` half has not:** 366/379, **13 failures**,
validation issue codes moved ahead of the assertions naming them. `capability-framework` 89/89,
`contracts` 107/107. **Nothing in this session touched `tenant-onboarding-engine`.**

**Where work stopped — deliberately, on a precondition rather than a blocker.** *A cut-over measured
against a suite that cannot execute is measured against nothing.* **The ruling is taken, the scope is
settled, the four acts are written down, and the gateway stands.** M5 runs when
`tenant-onboarding-engine` is green.

---

## 2026-08-06 · ADR-0085 accepted and executed through §6.1 — the number collision resolved, and M5's precondition cleared as a side effect

**Found.** Two ADR-0085 files, written minutes apart by concurrent writers on the same defect, both
untracked. **The other was an independent measurement and was treated as evidence rather than noise.**
Also found, and it is the sharper half: **`verify-change-control-completeness` property 4 was passing
on a falsehood** — it reported ADR-0085 as connected *only because each file cited the other's
identifier*. Two orphans holding each other up. The property measures a citation, and a citation is
what it got.

**Decided.** The accepted file survives; the other's additive findings are **carried and attributed**
(the ID-wins authority statement now filling §4.2 ruling 3's own declared gap, the per-run duplication
harm, the agent's unsupportable `responsibilities` declaration, and `issueKey` as declared-and-
unconsumed instance six); its **one disagreement — a two-member vocabulary — is RECORDED in §3 rather
than merged away**, kept at three because `reuse-existing` and `must-exist` both refuse but refuse
**with different reasons, and the reason is what a customer acts on**. Then the file was removed, so
one number carries one decision.

**The three additions were ruled rather than flagged, each with the reason it is not optional.**
§4.3's discovery operation is what makes the disposition **actionable rather than reportable** —
widening the writes alone leaves the platform able to report that *an unconditional create was
refused*, which is better reporting and the same decision. §5's migration ruling has **the widest
reach of anything in the ADR**, because it is the only one that touches tenants already deployed:
without it every existing tenant silently acquires a policy nobody chose, which is §3's rejected
inference **arriving through migration instead of design**. §6's order **is** the ruling — `baseUrl`
first, and both layers or neither, because `.strict()` makes a passed-through field a validation
failure rather than a silently dropped one.

**Produced.** All five §6.1 steps: the schema (disposition **required with no default**, scoped by
refinement to tenants that actually have a test tool — `provider: 'none'` means there is *no*
repository, not an undeclared disposition); the emission, where **every unsupplied field now emits
`<FILL:>` so the block stops reading complete**; the SPI (both writes → `WriteOutcome<T>`, **discovery
added to `TestManagementAdapter`**) under convert-then-run; the non-creating discovery mode; and ten
properties with a recorded fault proof.

**Two findings the work produced rather than consumed.** Discovery enrichment **replaced
`testManagement` wholesale**, so a disposition declared at Stage 2 would have been silently dropped
and the tenant would have failed certification for a question they *had* answered — the same defect
the same function already guards one field down for `applicationTypes` and MFA, and for the same
reason: enrichment must never overwrite what only the customer can know. And **the last implementor
was a `.mjs` governance runner** (`governance/tenant-lifecycle/…`), invisible to `tsc` and to every
package suite — ADR-0074 §6.2.1 exactly, found by running the gate rather than by reading.

**Fault proof.** Restoring discover-creates **at the source of truth** turns **5 of 10 properties
RED**; the refusal-channel properties correctly stay green, having a different subject.

**Debt-number collision, resolved the same way as the ADR one.** Both sessions claimed D-130/131/132.
The other session's are already cited across its report, NEXT_ACTION and PROJECT_STATE, so **this
session's renumber** to D-133/134/135, plus **D-136** (the disposition reaches no consumer yet).

**Measured.** `tenant-onboarding-engine` **379/379** · `functional-testing-engine` **220/220** (+10)
and `.mjs` 94/96 (two pre-existing ADR-0077 §4.7 deviations) · `capability-framework` 89/89 ·
`contracts` 107/107 · `dev-change` 47/47 · `discovery-flow` 54/54 · `platform-providers` 47/47 ·
`observability` 57/57. **Closure re-baselined and PASS: 77 ADRs.** ADR-0085 is named by **zero** gate
failures. `platform-runtime` cannot run at all — `spawnSync openssl ENOENT`, CHARTER §13, pre-existing.

**Where work stopped, and what it unblocked.** §6.1 is complete. **The disposition does not yet reach
the synchronisation domain and the create there is still unconditional — deliberately** (D-136): a
conditional create without the declared value is `create-if-absent` for every tenant, taken at a call
site instead of in a config file, and **it would look exactly like the repair**. Step 5's three
per-disposition probes are owed with it, for step 5's own reason. **And the thirteen
`tenant-onboarding-engine` failures the M5 session was held on were this work in flight: M5's
precondition is now met.**

**Continued — the blocker cleared by its owner, verified, and M5 not started.**

**D-107's corollary promoted to lead the entry**, as the strongest form the class has reached: *a claim
that could have been checked in one run is assumed to have been checked, **precisely because** it could
have been.* The cost comparison is the evidence and it runs the wrong way — 71 documents parsed, a
cross-plane deployment probe, and **four lines against an artefact already in hand**; the two expensive
checks were run and the cheap one was not. **The consequence recorded as the entry's governing finding:
the premises that survived longest in this programme were the ones easiest to test** — not the subtle
ones, but the ones whose test was so cheap its absence was invisible. The repair is not more
verification: **a claim shall carry how it was established**, measured or inferred.

**M5's four acts recorded, replacing the three-act sketch.** Act 3 — wire the canonical authoring path to
the writer at stage 7, gated on `decidePublication()` — was absent from it, **and its absence would have
made M5 a deletion that left the store still empty.** Measured while recording it:
`platform-adoption.ts:297-298` constructs the writer and then **`void packageWriter;`** — D-122's finding
still standing in source. Act 4's enumeration must cover `.mjs` files and regex literals, because three
of five executable references were invisible to both the compiler and a symbol search. **Exit: the first
package ever written to the store, and the first thing the Execution Plane has had to retrieve** — not
*"the gateway is gone"*.

**The blocker was NOT taken, and then cleared by its owner during this session.** The ADR-0085 session
landed its `tenant-onboarding-engine` half and edited `NEXT_ACTION.md` to record the precondition met.
**That claim was re-run from disk rather than accepted:** `tenant-onboarding-engine` **379/379**,
`functional-testing-engine` **220/220**. **They agree.** A precondition cleared by the session that was
blocking it is exactly the case where the claim and the fact should be checked against each other.

**Where work stopped — on instruction, with M5 unblocked and unstarted.** The gateway stands, §13 is
intact, and nothing was deleted. **The four acts are written down and the go is not this session's to
take.**

---

## 2026-08-06 · M5 executed — the gateway retired, §13 retired with it, and the sealed-package store finally has a writer

**Found, before anything was deleted.** Every package suite measured at execution rather than quoted:
green everywhere except `platform-runtime`, which cannot run at all (`spawnSync openssl ENOENT`,
CHARTER §13). **And one of the two "known reds" was not a red:** the `functional-testing-engine`
`.mjs` suite reports `fail 0, todo 2` — the two ADR-0077 §4.7 entry 8 items are `todo`-marked, not
failing. **They are still not a pass** (`NOT RUN` ≡ `FAIL`, C-0.4), and a suite reporting `fail 0`
over them is flattering itself; that is the honest reading and it is recorded rather than rounded.
`tenant-onboarding-web` was missing from every previous sweep entirely — it runs under vitest, 8/8.

**Decided — option C's first step WITHDRAWN ON MEASUREMENT, recorded rather than dropped.** C was
*"wire `certifyPackageForSealing` into the canonical publication path, then re-point §13, then
delete"*, recommended as the only order in which nothing goes green over an absence. **Its premise
was that the gate's subject is the sealing point.** The measurement showed the subject is the
**gateway's package format** — 18 blocking findings against a canonical package that satisfies
`parseExecutionPackage`, every finding a field existing only in the retiring format, and
`SECTION_OWNERSHIP`'s own repair strings naming the gateway by path. **Wiring it in would have turned
the gate red over the CORRECT artefact**, which is the opposite of what C was chosen to prevent.

> **AND THIS IS HOW THE PREMISE SURVIVED INTO A RECOMMENDATION: THE GATE HAD NEVER ONCE BEEN RUN
> AGAINST A CANONICAL PACKAGE.** Its only caller was the gateway whose format it was written for, so
> every run it had ever had confirmed it. **A gate that has only ever been shown its own subject
> cannot tell you what its subject is.** That is CHARTER §17.1.1's question asked one step earlier —
> about SCOPE rather than about deletion — and it is the generalisable finding of this session.

**Produced, in the order the work needed rather than the order it was listed.** The wiring came
FIRST: the bridge signs at authoring (D-123 link 1) and publishes through a `SealedPackagePublisher`
port **before** dispatch, because the Execution Plane obtains packages by hash under the pull model
and dispatching first would announce an artefact that is not yet retrievable. `execute` became
**asynchronous** — a publication whose failure could not be observed is indistinguishable from one
that never ran — and a refusal **throws** rather than degrading to an unpublished success. Signer and
publisher are **supplied together or not at all, refused at construction**; their absence reports
`published: null`, meaning *this composition does not publish*, never *publication was skipped*.

**Then the deletions.** `ip-execute-gateway.mjs` — a 680-line development harness that refused to
start in production, held its own dev signing key, and bound a package to whichever tenant
`readdirSync` sorted first. **§13 retired with it** under §17.1.1 (ii), with the three surviving
controls named at the retirement site rather than assumed: `parseExecutionPackage` on the authoring
path **and again in the writer** (P-81.5), `decidePublication()` admissibility, and the detached
signature written before the body (P-81.1). `verify-package-governance` went **50 → 47 checks and
stayed PASS** — exactly §13's three, and nothing else moved.

**A finding the deletion produced.** Five comments named the gateway, and **three were present-tense
assertions that the deletion falsified** — *"the WRONG second rule **is already** in the tree"*, the
stated justification for two fail-closed resolvers. Deleting the offender makes the sentence false
while leaving the requirement true, so a later reader meets a justification that does not check out
and may conclude the rule is stale. They now record it in the past tense: **why the rule exists**,
not something still there to avoid.

**Measured after.** All suites as above, `functional-testing-engine` **223/223** (+3 for M5).
Governance: **10 red, the same 10 as before M5**, none naming a file this change touched;
`verify-programme-closure`, `verify-package-governance`, `verify-provider-platform`,
`verify-composition-root`, `verify-runtime-cutover-readiness`, `verify-legacy-retirement-readiness`
and `verify-suite-integrity` all PASS.

**Where work stopped, and what it exposed.** M5 is complete. **The plane now authors retrievable,
signed, tenant-partitioned packages and keeps no record that it did** — which is ADR-0082 §6 step 2,
and it is sharper now than it was this morning: until today nothing wrote a package at all, so the
missing run record and the missing package were the same absence. The writer removed one of them.
**Recorded and not fixed here:** the bridge signs at authoring and `dispatch` signs again internally
— ed25519 is deterministic so the bytes agree, but it is the same act twice, and collapsing it means
changing `dispatch`'s signature, which would alter what the integration conformance certifies as a
side effect of a cut-over.

---

## 2026-08-06 · ADR-0082 §6 step 2 — the run record, and two things the build found

**Found.** §6 step 1 (P-82.5's `packageHash` binding) was checked before building on it, because §6
says the order is part of the decision. **Its completion condition is met**: `evidence-ingress.ts`
parses through `EvidenceReferenceSchema`, where `packageHash` is required, so an unbound reference is
refused at the route rather than stored. The residue is the internal `EvidenceReferenceHandle` type,
which step 3 consumes — recorded, not silently absorbed.

**Produced.** `RunRecordStore` in `platform-providers`, obtainable in production **only** through
`runRecordService()` — the factory that **starts the purge driver before it returns**. ADR-0079
learned that by shipping a correct `purgeExpired` that nothing called; the repair is reused rather
than re-derived. The writer now records the run and the composition root supplies the store.

**The allow-list is a CONSTRUCTION, not a filter.** The record is built field by field from named
inputs, so a caller-invented field cannot survive by being un-forbidden — a `{...event}` spread would
turn the allow-list into a deny-list without changing one test. **The proof asserts the bytes on
disk**, not the returned object, because an egress filter would pass a return-value assertion.
*Scrubbing on egress protects the API; scrubbing on write protects the disk.*

**P-82.3 is proved as a property of the SURFACE.** There is no `record()`, no `save()`, no options
bag — so *what changes when an Execution Plane re-fetches a package it already holds?* is answered by
construction: **nothing**. A third cause would need a third method, which is visible in a diff.

**The ordering decision, and it is P-81.1's reasoning on a different pair.** The run is recorded
BEFORE the package is written. A run with no package fails **loud** at the far side on the next poll;
a package with no run is **retrievable and nobody is ever told** — silent and permanent. *A partial
write shall fail toward the failure that announces itself.* The two awaits differ only on a crash
between them, so the ordering is invisible in a green suite and visible only at the site.

**Two findings the build produced.**

**`C-06.14` does not exist.** It was cited in three new files as *"unreadable after purge"*, read
entirely plausibly, and was invented. `verify-traceability` caught it — *no criterion is cited in
code without being declared in architecture* — and the real criterion is **C-06.8**, whose purge test
is what proves unreadability. **The gate did exactly what it is for**, against a citation a reviewer
would have accepted.

**`verify-customer-readiness` and `verify-production-readiness` FLAPPED inside `run-all`.** Red in one
sweep, `exit=0` run individually, green in the next sweep — they hash artefacts the sweep itself
regenerates. **That is D-008's shape observed inside the gate runner**, and the consequence is a
standard rather than a curiosity: **a single `run-all` reading is not evidence by itself.** The
stable set (10) was confirmed by a second sweep before being quoted.

**Measured.** `platform-providers` **61/61** (47 + 14) · `tenant-onboarding-engine` **379/379** ·
`functional-testing-engine` **223/223** and `.mjs` 94/96 (`fail 0, todo 2`) · `contracts` 107/107 ·
`capability-framework` 89/89. Governance: the stable **10** red, none naming a file this work touched.

**Where work stopped.** Step 2 is complete and **step 3 is the next action, not `/work`.** Nothing yet
removes a run from the outstanding set — P-82.3 forbids fetching from discharging it, so only evidence
can, and that is step 3. Mounting `/work` first would serve a collection that only ever grows: **a
permanently non-empty falsehood**, a Success under R-05.5 that reddens no gate.

---

## Session — 2026-08-07 · reference Functional Testing parity: the workflow existed, the depth did not

### Situation on entry

A customer directive to reproduce the Functional Testing capability implemented by the reference
solution at `C:\DBIZAGENTICAI\CarlisleHomesD365_AgenticQAPlatform` inside the EP/IP architecture,
behaviour identical, only plane placement changed, and with a strict rule that nothing may be
inferred — the workflow had to be reconstructed from source alone.

### What was found

**The reference's live journey, reconstructed from source** (`run-full-pipeline.js:190-291`):
`run-story.js` → `generate-playwright.js` → `smart-healer.js` → `run-bdd-and-sync.js` → `healer.js`
→ `create-ado-bugs.js` → report → governance gate → allure → archive → git. Its intelligence is
`agentOrchestrator.runAgentChain` (`:70-140`): planner → qa → reviewer → riskPrioritizer.

**Two findings about the reference, and both contradict the brief.** It has **no reflection stage**
in Functional Testing — the six agents that would supply one each have exactly one non-test caller
and it is `devChangeOrchestrator.js:43-48`. And its own **`PRESETS.functional` execution step is
dead**: `steps.js:181` runs `run-and-sync.js` over `tests/specs/`, which `generate-playwright.js:861-870`
throws `SPEC_GENERATION_FORBIDDEN` on writing to and which holds zero files. A faithful migration
of the preset named `functional` would have reproduced a path that runs nothing.

**The Intelligence Plane already had the workflow.** Fourteen certified domains covering every stage
the reference has. **What it did not have was depth**, and the shortfall was numeric: two steps per
case in every story against the reference's seven-to-ten; `negative → high / positive → medium`
against a three-dimension composite. So the directive could not be taken literally — that is
ADR-0039:17's ruling — and could not be declared already met either.

### What was decided and produced

[ADR-0086](../docs/adr/ADR-0086-reference-output-parity-as-domain-depth.md), ACCEPTED: **parity of
OUTPUTS, as internal domain depth.** `CANONICAL_DOMAIN_SEQUENCE` untouched; no stage, capability,
orchestrator or pipeline added in either plane; the Execution Plane not edited. G-1…G-8 and G-13
closed inside `story-intelligence`, `test-design-intelligence`, `test-management-intelligence`,
`healing` and `defect-management`. **G-9 WONTFIX with cause** (prose-pattern step inference,
prohibited by ADR-0077 §6 step 5a — the outcome is already reached by declaration) and **G-11
BOUNDED** (AI advisory-only, INV-9). G-10 deferred and G-12 placed, both to `BACKLOG.md` as B-016
and B-017. Evidence base:
[`FUNCTIONAL_TESTING_REFERENCE_PARITY_ANALYSIS.md`](FUNCTIONAL_TESTING_REFERENCE_PARITY_ANALYSIS.md).

### Three defects the work found in itself, each caught by a control

**Templates applied to a requirement with no acceptance criteria** — producing ten plausible cases
tracing to nothing, an architecture with components, and a run that certified. Strictly worse than
the empty suite it replaced, because an empty suite is visibly empty and the triad refuses it.
Caught by ADR-0076 §6 B2's existing test; **fixed in the domain, not in the test.**
**`regression` — a tag added to every case — sitting inside two scoring bands**, which is a floor
every case clears. **Cumulative context boosters saturating the composite**, so the more context a
story carried the less the score ordered. The last two were both caught by one conformance
assertion: that priority takes more than one value.

### Measured

`pnpm -r build` **exit 0** · `pnpm -r test` **exit 0** · `functional-testing-engine` `dist/test`
**223 → 246 pass, 0 fail** (23 new parity tests, each a pass/fail pair) · `.mjs` aggregate unchanged at
**94/96, fail 0, todo 2**. Git Bash, Node 24.14.1, IP at `292bf9f` plus this change.

**AND THE `.mjs` AGGREGATE IS MISLEADING — corrected rather than quietly fixed.** `node --test`
counts a `todo` test in `todo`, never in `pass` or `fail`, so a todo test flipping from **failing**
to **passing** moves no published figure. **Both of `authoring-bridge.test.mjs`'s todo tests did
exactly that** — *"the package VARIES with input"* and *"R4/grounded: real fill/click/assertText"*
were failing at baseline and now pass. The cause is `authoring-bridge.mjs:696`, which grounds by a
FIELD LOOKUP on the declared interaction (`input|select → fill`, `click → click`, `assert →
assertText`, each with a real selector). Before G-3 this domain synthesised **two** steps per case,
`navigate` and `assert`, so grounding could only ever emit `navigate` and `assertText` — verbatim
what the todo annotation says. **All four grounded kinds sit inside the EP's declared operation
profile, so the package the IP authors is for the first time of a shape the EP could execute** —
which is not the same as it doing so: `npm run functionaltesting` runs an EP-authored fixture and
retrieval is unwired (M5 / E-2). Neither todo test is unmarked; ADR-0077 §4.7 entry 8's reasoning
stands and the runtime-neutral replacement it asks for is still unwritten.

**Governance: 12 red on the first run, 10 on the second — and neither delta is a fix to claim.**
`verify-programme-closure` was the one net-new red, correctly reporting ADR-0086 as an addition
since closure; it is now PASS via a **deliberate re-baseline** with its reason written into
`REBASELINE_LOG` (which also absorbs two gates an earlier session registered without baselining —
named there rather than smuggled). **`verify-production-readiness` went red then green with nothing
addressing it:** its failing property was throughput, `165.93/s` against a `>=200/s` target, on a
machine also running the workspace test suite. That is CHARTER §17.1.4 exactly — a measurement
whose conditions were not recorded beside it. **The remaining 10 are the stable set the previous
session recorded, and none names a file this work touched.**

### Where work stopped

The parity work is complete and self-contained. `NEXT_ACTION.md` is **unchanged** — the
`/api/version` probe remains the single next action, is external, and nothing here touches it.
**No functional-testing run against a live application was executed in either plane**, so parity of
outputs is asserted against the reference's source and **not** measured side-by-side; that needs a
reachable Execution Plane and is the same M5 dependency.
