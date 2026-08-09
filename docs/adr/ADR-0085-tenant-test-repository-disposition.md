# ADR-0085 — A tenant declares whether its test repository already exists

**Status:** ACCEPTED · **Date:** 2026-08-06 · **Accepted:** 2026-08-06
**Supersedes:** nothing · **Amends:** nothing · **Extends:** ADR-0072, ADR-0073, ADR-0074 (the outcome-widening line) · **Records:** `TECHNICAL_DEBT.md` D-057's shape, third occurrence

> ## THE NUMBER COLLISION, RESOLVED AT ACCEPTANCE — because acceptance is when it became this ADR's to resolve
>
> A second file, `ADR-0085-test-container-resolution-policy.md`, was written to `docs/adr/` by a
> concurrent writer on the same day, on the same defect, and stated its own resolution as **owed at
> acceptance**: *"one of the two must not survive."* **It was an INDEPENDENT MEASUREMENT of the same
> absence and it is treated as evidence.** Its findings are carried below and attributed at each site
> — §3's recorded disagreement, §4.2's ruling 3, §4.4's `issueKey` disposition — **and where the two
> disagreed, the disagreement is RECORDED rather than merged away.** The file is then removed, so that
> one number carries one decision (CHARTER §4).
>
> **The connectivity gate was passing on a falsehood while both existed.**
> `verify-change-control-completeness` property 4 reported ADR-0085 as connected **only because each
> file cited the other's identifier** — two orphans holding each other up. Acceptance connects this
> ADR to `DECISIONS.md`, `PROJECT_STATE.md` and `TECHNICAL_DEBT.md`, which is what the property was
> written to measure.

> ## THE THREE ADDITIONS, AND WHY EACH IS LOAD-BEARING RATHER THAN THOROUGH
>
> Three things were added to this ADR after its first measurement and each was flagged for review.
> **All three were correct and none should have needed flagging** — they are recorded here as ruled,
> with the reason each is not optional, so that a later reader meets the argument rather than a blank.
>
> **(1) §4.3's DISCOVERY OPERATION is what makes the disposition ACTIONABLE rather than merely
> REPORTABLE.** Widening `createContainer`/`createGrouping` to `WriteOutcome` alone leaves the platform
> able to say **that an unconditional create was refused** — better reporting, and *the same decision*.
> The create stays unconditional, because the port that creates still cannot ask. **A disposition the
> platform can record but cannot act on is a configuration field with no consumer**, which is the
> declared-and-unconsumed class this ADR's own §2.1 names as the mechanism that concealed the absence.
> The discovery operation is the only addition that turns §4.1 from a declaration into a branch.
>
> **(2) §5's MIGRATION RULING HAS THE WIDEST REACH OF ANYTHING HERE.** Existing generated solutions
> **must not be read as `create-if-absent`**; their disposition is **UNKNOWN and is recorded as
> unknown**. Without that sentence **every existing tenant silently acquires a policy nobody chose** —
> §3's rejected inference arriving through **migration** instead of through design, which is the route
> a rejected alternative actually returns by. It reaches every tenant already in the field, which is
> more than any ruling that reaches only tenants onboarded after this ADR.
>
> **(3) §6's ORDER IS THE RULING, not a plan.** `baseUrl` first — rulings 3 and 4 are **unreachable**
> until it lands, because an identifier with no organisation to resolve it against identifies nothing.
> And **both layers move or neither**: `onboarding-configuration.ts` is `.strict()`, so a widened
> exporter has nothing to emit and a passed-through field is a **validation failure**, not a silently
> dropped one. Widening either layer alone accomplishes nothing and looks like progress.

## 1. Problem

**The two tenants are BYTE-IDENTICAL configurations.**

A tenant whose Azure DevOps project already holds a Test Plan, and a tenant for whom one must be created, generate the same file. Not similar — identical, byte for byte:

```json
"testManagement": {
  "provider": "azure-test-plans",
  "projectKey": "D365 - IT",
  "credentialEnv": "TM_TOKEN"
}
```

That is the entire test-management surface of a generated solution. Three fields, all valued, **no `<FILL:>` marker anywhere in the block.**

**They are not under-specified. They are indistinguishable.** An under-specified configuration has a slot that is empty; a reader can see the question and answer it. Here there is no slot, so there is no question, so there is nothing for a reader to notice they have not answered.

**And the failure is silent in the more dangerous direction.** The tenant who already has a plan gets no error, **because nothing looks.** Not "looks and mishandles the answer" — nothing performs the read at all. The tenant with no plan is the recoverable case: something is missing, and a missing thing eventually announces itself. The tenant who has one is the case that proceeds smoothly and writes into a repository whose existence was never established.

**Measured 2026-08-06** across `config/capabilities.json` and `config/integrations.json` of a generated solution, the emitting generator, and the framework SPIs beneath both. **Nothing was changed.** No slot exists for a Test Plan name or id, a Test Suite name or id, or the Azure DevOps organisation. Absent — reported as absent, not as a gap already half-filled.

## 2. Context

### 2.1 · What makes the absence invisible

**The absence is not merely unrecorded. Four independent mechanisms actively present it as settled**, and each one alone would be enough to stop a careful reader.

**`testManagement` reads COMPLETE because there is nothing to fill.** Every other integration block in a generated solution carries at least one `<FILL:>` — `projectManagement` has `baseUrl`, `application` has `issueKey`, `executionAdapters` has three. `testManagement` has none. The convention that tells an operator where their attention is required **works by exception**, and a block with no exceptions is the block that looks finished. **It is the smallest block in the file and the only fully-valued one, and both facts are consequences of the same emptiness.**

**`suite` is a filesystem path, and it is the only field in the capability spelled `suite`.** `capabilities.json` → `functional-testing` → `"suite": "tests/functional"` is the directory holding spec files. An operator, a reviewer, or an agent searching a generated solution for suite configuration **finds a hit and stops.** The one search that would discover the gap terminates on a field that has nothing to do with it.

**`issuekey` is on `FORBIDDEN_NOUNS` with a conformance test, so two copies ship and nothing may read either.** The generator emits `issueKey` into both `capabilities.json` and `integrations.json` — deliberately, with a comment recording that story context is runtime and therefore always fill-in. The reasoning is correct. But the consuming plane's synchronisation port lists `issuekey` among the tool nouns forbidden in any port signature or in the orchestrator, **enforced by a conformance test that fails the build on a hit.** So the field is emitted twice, is required to be filled twice, and **no compliant consumer for it can be written.** Nothing states that the two copies must agree, because nothing reads either one.

> **A field declared twice and consumed nowhere is not an oversight with a small cost. It is a fifth-instance pattern that trains readers to treat declaration as provision** — and it sits in the same two files as the absence this ADR exists to name.

### 2.2 · The unreachable branch — the absent-plan path has never executed anywhere

`TestDesignSyncAdapter.discoverContainer` returns `ReadOutcome<{ containerId, noun } | null>`. ADR-0074 §4 preserved that inner `| null` **specifically** so the tool could say *"I answered, and there is no such container"* — a legitimate negative, distinct from unreachability. The read direction can express exactly the fact this ADR is about.

**Nothing has ever produced it.** The reference adapter materialises the container while discovering it:

```ts
discoverContainer: (name) => {
  const containerId = `plan-${name}`;
  if (!containers.has(containerId)) containers.set(containerId, name);
  return { reached: true, value: { containerId, noun: nouns.container } };
},
```
— `functional-testing-engine/src/design-sync-adapters.ts:70-76`

**`value: null` is unreachable in every test that exists.** The adapter's own comment holds the case open *"for a real adapter"*, honestly. The consequence is that `sync.design-discovery`'s absent branch —

```ts
if (!container || !grouping) {
  throw new Error(`design synchronisation cannot locate a container or grouping for ${input.storyId}`);
}
```
— `agents/design-sync.ts:183`

— **has never fired.** Not in a conformance run, not in a governance gate, not in a probe. The platform's entire response to *"the tenant has no Test Plan"* is one untested `throw`, guarded by a discovery function that creates the thing it was asked to find.

**This is ADR-0074's §6.4.6 hazard in a new position, and it is worth naming as such.** That section guarded both directions and asserted each explicitly, because *"a change that turned an empty repository into an unreachable one would satisfy half the probes and be the worse defect."* Here the reference adapter has done the analogous thing at construction time: **it turned an absent container into a present one**, so the probes cannot distinguish them and never had to.

### 2.3 · Plan identity is a naming convention, not tenant configuration

Even where discovery exists, the name it discovers by is derived:

```ts
input.adapter.discoverContainer(`${input.storyId}-${input.storyTitle}`.slice(0, 80));
input.adapter.discoverGrouping(container?.containerId ?? '', input.storyId);
```
— `agents/design-sync.ts:171,176`

Container by story id and title, truncated to eighty characters; grouping by story id. **A tenant whose plan is called *"Regression 2026 Q3"* cannot be expressed anywhere in this platform** — not in onboarding intake, not in the generated configuration, not in the discovery call. The convention is not a default that configuration overrides. It is the only expressible value.

**The convention's fragility was already recorded, in the CREATE direction only, and the note is correct as written.** `domains/story-intelligence.ts:81`: *"`sync.design-discovery` composes `${storyId}-${storyTitle}` and the customer's Test Plan is named after a number and a hyphen, PERMANENTLY: a container is not renamed once assets hang off it."* **The same line breaks the FIND direction, and nothing records that.** Carried from `ADR-0085-test-container-resolution-policy.md` §1.1.

### 2.5 · The concrete harm on the other tenant, and a declaration no schema can support

**Two findings carried from `ADR-0085-test-container-resolution-policy.md` §1.2 and §3**, both measured independently of §1's measurement and neither reachable from it.

**A parallel plan EVERY RUN.** `domains/synchronisation.ts:205` creates unconditionally on every `execute`, and **there is no existence check on this path — not a weak one, none**, because `TestManagementAdapter` has no discovery operation to perform one with. **N runs of one story produce N containers**, each holding one run's worth of tests, **and every one of them looks correct on the way in.** That is the shape of the harm §4.3's added discovery operation exists to make preventable, and it is why widening the writes alone is insufficient.

**The agent's first stated responsibility describes an input that cannot be supplied.** `agents/design-sync.ts:158` declares *`'locate the container and grouping the tenant configured'`* — **and no tenant configures either.** This is the **second** site in this agent with that shape: ADR-0074 §6.2.1e recorded this agent's `failureHandling` — *"An unreachable tool fails the phase; it never yields 'nothing exists'"* — as a correct guarantee its SPI could not honour, and made it keepable with `ReadOutcome`.

> **ADR-0074's gap was EXPRESSIBLE-BUT-UNEXPRESSED: a type could not carry a fact the run held. A type change closed it.**
> **This gap is UNCONFIGURABLE: no type can carry a fact nobody was asked for. Only a schema field closes it** — which is why this is an onboarding decision wearing an SPI's clothes, and why §4.2 lands before §4.3 in §6's order.

### 2.4 · The consuming plane cannot construct its adapter from what is emitted

The generated solution's synchronisation adapter factory takes `{ baseUrl, project, credential, … }`, where `baseUrl` is the organisation root. **`testManagement` carries no `baseUrl` and no organisation field.** The only organisation-bearing value in the file sits in `projectManagement.baseUrl` — a different block, itself `<FILL:>`, belonging to a different provider concern.

**This is observed in the consuming plane, not asserted about generator output.** The generator emits configuration; it does not emit that plane's synchronisation layer, which is that plane's own work. **That is what makes it a contract gap rather than a bug**: one plane authored a consumer requiring a field, the other has no slot to supply it, and neither is wrong on its own terms. The gap is only visible from a position that reads both, which is this ADR's position and not either plane's.

**Sovereignty is unaffected.** This ADR rules on which fields onboarding captures and the generator emits. It opens no connection (R-3.2), holds no credential (R-3.3) — every value ruled in here is a name or an identifier, and the credential remains a `*_ENV` reference resolved in the customer's tenancy (INV-2) — and it does not alter which plane initiates (R-5.1).

## 3. Alternatives

- **Emit the identifier fields and stop.** REJECTED, and it is the alternative that will be attempted, because §4.1 will read as redundant once §4.2 lands. See §4.1 — the reason is the ruling.
- **Infer the disposition from whether the plan field is populated.** REJECTED. That is the collapse restated as a convention: an empty field would mean *create one for me*, and a tenant part-way through onboarding would silently acquire a create instruction. **A configuration's meaning must not depend on how far its author got.**
- **Keep deriving plan and suite names from the story; add nothing.** REJECTED. It is coherent — a convention consistently applied is a real design — but it makes the platform unusable by any tenant with an existing test repository, which is the majority case for an established Azure DevOps project. **The convention was never chosen over the alternative; it was chosen in the absence of a field to express one.**
- **Have the platform search for a plausible plan and adopt the best match.** REJECTED. Choosing which of a customer's existing Test Plans to write into is a decision with consequences this platform cannot evaluate, and it is the same class as the deduplication the consuming plane already refuses to perform on its own judgement. **A tenant names its plan or authorises its creation; the platform does not guess.**
- **A TWO-MEMBER vocabulary — `require-existing | create-if-absent` — instead of three.** **RECORDED AS A DISAGREEMENT, NOT MERGED AWAY**, and carried from the concurrent measurement (`ADR-0085-test-container-resolution-policy.md` §5.1) which reached it independently. Its argument: the policy answers **two** questions — *may the platform create?* and *must the container already exist?* — and `reuse-existing` reads as either *prefer existing* (= `create-if-absent`) or *only existing* (= `must-exist`), so it is **ambiguous and is one of the other two**. **The argument is sound and the three-member form is kept anyway**, for a reason that ADR does not reach: `reuse-existing` and `must-exist` differ not in what the platform may create but in **what a reached-and-absent read means to the TENANT** — under `must-exist` absence is a governance refusal (someone must approve a plan's creation), under `reuse-existing` it is a misconfiguration to be corrected. **Both refuse; they refuse with different reasons, and the reason is what a customer acts on.** Where the third member proves inert in implementation, this paragraph is the record that its removal is a *simplification of a considered choice* and not the discovery of an oversight. **Both files agree on the half that matters and reached it separately: the disposition is REQUIRED, with NO DEFAULT.**
- **Widen `createContainer`/`createGrouping` to `WriteOutcome` as part of a bulk SPI sweep.** REJECTED as a method — D-057's own ruling: a negative-path decision belongs to the capability that owns it, and a bulk widening reproduces the defect it repairs by choosing failure paths on those capabilities' behalf. The widening is ruled here; the failure paths are marked `UNDECIDED`.

## 4. Decision

### 4.1 · **RULING 1 — THE DISPOSITION. Stated first, and first deliberately.**

**A tenant's test-management configuration declares its disposition toward the test repository, as an explicit value:**

```
repositoryDisposition: 'reuse-existing' | 'create-if-absent' | 'must-exist'
```

**It is stated before the identifier fields because it will read as redundant once they land.** A reviewer looking at a configuration that already carries a plan name and a suite name will ask what the disposition adds, conclude it is inferable, and drop it — and the drop will look like a simplification, produce a green suite, and ship.

> **Verbatim, and this is the ruling's reason:**
>
> **Identifier fields alone leave an empty plan slot ambiguous between *"create one for me"* and *"not configured yet"* — the Absent/Unreachable collapse one layer up, in configuration, where no `fold()` demands all five handlers.**

That is the whole argument and it should not be paraphrased when this ADR is cited. The platform has already ruled, three times, that a negative which could mean two things must be split into two values that mean one thing each — ADR-0072 for writes, ADR-0074 for reads, and ADR-0074 §6.4.2's fourth `ReuseDecision` member for decisions. **In all three the type was the enforcement.** At the configuration layer there is no type doing that work: a JSON field is absent or it is not, `fold()` demands nothing of whoever reads it, and no conformance test greps a customer's config file for an unhandled case.

**So the disposition must be a value, not an inference.** `create-if-absent` and *"nobody has filled this in yet"* are different states of the world and must be different bytes on disk.

**`must-exist` is not a convenience member.** It is the disposition for a tenant whose test repository is governed — where creating a plan is a change someone must approve, and a platform that creates one silently has bypassed a control. **Under `must-exist`, a reached-and-absent container is a refusal, not a create** (ADR-0071's outcome: the stage did its work and the answer is no).

### 4.2 · Rulings 2–4 — the identifier fields, **in dependency order**

**Ruling 2 · `baseUrl` (or an explicit `organisation`) on `testManagement`. FIRST, and nothing works without it.** The consuming plane's adapter factory requires it and no other block can lawfully supply it — reading `projectManagement.baseUrl` from a test-management code path would couple two providers that a tenant may legitimately host separately. **Rulings 3 and 4 are unreachable until this lands**, because an identifier with no organisation to resolve it against identifies nothing.

**Ruling 3 · Plan identity** — id and/or name, **and an explicit statement of which is authoritative when both are present.** Left unstated, every adapter answers it differently, which is CHARTER §4.

> **THE AUTHORITY STATEMENT, RULED — carried from `ADR-0085-test-container-resolution-policy.md` §5.2, where it was reached independently, and adopted because it is the answer this ruling declared owed:**
>
> **BOTH fields exist, and they are not two ways to answer one question — they answer two different moments.** An **ID resolves an existing container**; a **name is what a created container is called**, and no id can be configured for a container that does not exist yet. §4.1's dispositions map onto them exactly: `must-exist` and `reuse-existing` consume the **ID**; `create-if-absent` consumes the **name**.
>
> **THE ID WINS ON CONFLICT. A configured name that disagrees with a resolved ID is RECORDED, never used to correct or re-target.**
>
> - **Cost of ID-wins:** a tenant who retypes the plan name expecting the platform to move gets no move, and must learn that the id is what binds.
> - **Cost of name-wins, which is why it is rejected:** renaming a plan in the customer's tool re-targets the platform at a different plan, or creates one, **with no event anywhere** — silent, and it is the failure §2.3 already exhibits.
> - **Cost of requiring an ID at all:** the tenant must open their tool and copy an identifier out of it during onboarding. **That is a real cost and it is the whole reason the name field survives** — without it, `create-if-absent` has no input.

**Ruling 4 · Suite identity** — the same, plus the `requirement-based | static` discriminant. **`discoverGrouping` already returns that discriminant**, and a discovered value that nothing can be compared against is a read whose result cannot be checked.

### 4.3 · **RULING 5 — RECONCILE THE SPI SPLIT**

**One port asks and cannot create. The other creates and never asks.**

| Port | Discovery | Creation |
|---|---|---|
| `TestDesignSyncAdapter` | `discoverContainer`, `discoverGrouping` — `ReadOutcome<X \| null>`, ADR-0074 | **none** |
| `TestManagementAdapter` | **none for containers** | `createContainer`, `createGrouping` |

**The decision has no seam to sit in**, and that is a structural fact rather than a missing function. The port positioned to establish that a plan is absent has no way to create one; the port that creates has no way to ask first. Every call site on the creating port therefore creates unconditionally, with no prior search — `functional-testing-engine/src/domains/synchronisation.ts:205`, `dev-change-engine/src/agents/sync-and-reporting.ts:61`, `discovery-flow-engine/src/agents/execution-and-outcome.ts:375`.

**The reuse-or-create decision does not exist anywhere in this platform.** Not implemented incorrectly — **unrepresentable**, because no single port can express both of its branches.

**And `createContainer` / `createGrouping` return bare `{ containerId, noun }` — not `WriteOutcome` — so they cannot report a refusal.**

```ts
createContainer(name: string): { containerId: string; noun: string };
createGrouping(containerId: string, name: string): { groupingId: string; noun: string };
```
— `capability-framework/src/adapters.ts:98-99`

**Every neighbouring operation on this exact interface was widened, and these two were not.** `publishTests` returns `readonly PublicationOutcome[]` (ADR-0072). `linkTraceability` returns `PublicationOutcome` (ADR-0072). `findExistingTests` returns `ReadOutcome<readonly string[]>` (ADR-0074). **Three of five operations widened, two passed over, in a single interface in a single file that both ADRs edited.**

> **D-057's SHAPE, THIRD OCCURRENCE — with nothing recording the boundary.**
>
> D-028 recorded it as one recurrence; it was four. D-057 recorded three capabilities' own publication SPIs and named the finding exactly: **THE COUNT IS NOT THE FINDING; THE ABSENCE OF A RECORDED BOUNDARY IS.**
>
> **This occurrence is the same shape at the shortest possible distance.** D-057's three were sibling SPIs in other packages — plausibly out of sight of an ADR scoped to *"the SPIs Section C's publication semantics ran through"*. **These two are in the canonical framework interface, four lines from operations the same ADRs rewrote.** The exclusion was not a package away; it was two lines away, twice, and no artefact records that it was made.

**RULED:** both operations widen to `WriteOutcome<T>`, matching their neighbours. **Failure paths are MARKED, NOT DECIDED** — every consumer in `dev-change-engine`, `discovery-flow-engine` and `functional-testing-engine` carries `UNDECIDED — <capability>` at the call site, exactly as ADR-0074 §4 did. **A wrong negative-path decision taken here stays invisible until that capability disagrees** (D-024).

**RULED, and this is the part that repairs the split rather than the reporting:** a container/grouping **discovery** operation is added to `TestManagementAdapter`, returning `ReadOutcome<X | null>` with the same nesting ADR-0074 established, **so that one port can express both branches of the decision §4.1 makes configurable.** Widening the writes without this leaves the platform able to report that an unconditional create was refused — an improvement, and still unconditional.

### 4.4 · **THE BOUNDARY OF THIS ADR, RECORDED — because §4.3 diagnoses a failure to record one**

An ADR whose central finding is an unrecorded exclusion may not leave its own unrecorded. This ADR:

- **RULES ON** the disposition, the four identifier/organisation fields, the intake schema, the generator emission, and the two framework SPI signatures plus the added discovery operation.
- **DOES NOT RULE ON** `issueKey`. Its two copies and its `FORBIDDEN_NOUNS` collision are recorded in §2.1 as a mechanism that concealed this absence, **not repaired here.** Whether the field is consumed, deduplicated, or withdrawn is a separate ruling and is **owed**.

  > **CARRIED, NOT RULED — the concurrent measurement went further on this field, and its measurement is preserved rather than discarded with its file.** `ADR-0085-test-container-resolution-policy.md` §4 measured `issueKey` as the **sixth** instance of the declared-and-unconsumed class (after `EvidenceReferenceSchema.packageHash` D-115, the execution-package schema D-117, version tolerance D-118, `SealedPackageStore.put` D-122, and `receiveEvidence`), emitted at `application-plane.ts:385` and `solution-export.ts:389`, **with no consumer in either plane** — the only other occurrences being the two generators and one template test asserting the key survives regeneration.
  >
  > **What makes it worse than the other five, and this is the part worth keeping:** the five are code declaring a capability nothing calls, and they cost a reader's time. **This one is a `<FILL:>` — an instruction to a PERSON, asking a customer to go and find a value.** *A placeholder implies a consumer.* It is a claim, made to the customer, that supplying this changes what the platform does. It changes nothing.
  >
  > The measurement is **recorded in `TECHNICAL_DEBT.md` as instance six** and the ruling stays **owed**. **It is deliberately not taken here**, because the concurrent file's proposed disposition — *delete `issueKey` from onboarding output rather than wire it to a consumer* — is a ruling on **per-run** identity, and this ADR rules on **per-tenant** configuration. **They arrive as one question and they are two, and answering them together is how `issueKey` came to exist.**
- **DOES NOT RULE ON** the `suite` field's name, though §2.1 records that it is the field a searcher stops on. Renaming an emitted configuration key is a compatibility change on generated solutions in the field.
- **DOES NOT RULE ON** what each capability does on a `WriteOutcome` reporting refusal from `createContainer` / `createGrouping`. `UNDECIDED — <capability>`, per §4.3.
- **DOES NOT RULE ON** whether plan/suite identity should also exist per-capability rather than once per tenant.
- **EXPLICITLY OUT OF SCOPE:** the three `<FILL:>` values in `executionAdapters."I2-browser"` — `selection`, `endpoint`, `leastPrivilegeScope`. **They mean the functional-testing capability cannot execute in a freshly generated solution.** That is a real and separate absence, observed during the same measurement, **named here so that it is excluded on the record rather than by silence.** It is not this ADR's, and it is owed.

## 5. Consequences

- **The two tenants become distinguishable.** That is the point, and the test of this ADR is exactly that: two configurations that differ on disk for two tenants that differ in the world.
- **§4.1 will be proposed for removal.** Once §4.2's fields land, the disposition reads as derivable. **The rejection is recorded in §3 and the reason verbatim in §4.1 so that the proposal meets an argument rather than a blank.**
- **`sync.design-discovery`'s untested `throw` acquires a decision above it.** Today it fails the phase for a tenant who simply has not been onboarded yet. Under `create-if-absent` that becomes a create; under `must-exist` it becomes a refusal carrying a reason; under `reuse-existing` with a named plan it becomes a genuine error. **One code path, three meanings, currently collapsed into the harshest.**
- **The absent-plan path must be exercised.** §2.2's reference-adapter behaviour makes `value: null` unreachable, so a conformance probe cannot reach the branch it needs. **The adapter must gain a mode where discovery does not create**, and it is the prerequisite for testing any part of this ADR — not a follow-up to it.
- **Existing generated solutions in the field carry the ambiguity.** They were generated before a disposition existed and therefore assert none. **They must not be read as `create-if-absent` by default**, which is precisely §3's rejected inference arriving through migration instead of through design. A re-onboarding or an explicit amendment is required per tenant, and until then their disposition is **unknown, and must be recorded as unknown.**
- **The cost is bounded and known.** Two signatures, one added operation, one schema object, one generator line, and their call sites — against a defect whose failure mode is writing into a customer's system of record without establishing what is there.

## 6. Migration strategy

### 6.1 · **BOTH LAYERS MOVE OR NEITHER**

Widening the exporter alone accomplishes nothing. The intake schema is `.strict()` and admits two fields:

```ts
testManagement: z.object({
  provider: z.enum(TEST_MANAGEMENT_PROVIDERS),
  projectKey: z.string().optional(),
}).strict(),
```
— `tenant-onboarding-engine/src/domain/onboarding-configuration.ts:109-112`

**Onboarding cannot capture a plan, so the exporter has nothing to emit even if widened**, and `.strict()` means an attempt to pass one through is a validation failure rather than a silently dropped field — which is correct, and is why the schema is the first edit rather than the last.

**Order:**

1. **`onboarding-configuration.ts`** — the schema gains the disposition and the four fields. **Ruling 2's `baseUrl` first**; the rest are inert without it.
2. **`solution-export.ts:408`** — the emission widens. **Every new field that a tenant did not supply emits `<FILL:>`**, restoring the convention §2.1 records as broken: the block must stop reading complete.
3. **The SPI change (§4.3)** — under ADR-0074 §6.2.2's ruled method, **convert-then-run**. Do not enumerate first.
4. **The reference adapter's non-creating discovery mode** (§5) — **before any probe**, since no probe can reach the absent branch until it exists.
5. **R-13.7 clause 2** — a probe supplying a reached-and-absent container, a consumer observed taking a different branch **per disposition**, and evidence that the absent branch is the one that executed. **Three probes, one per disposition value**, since a single probe would pass while two of the three dispositions were unimplemented.

### 6.2 · **ADR-0074's ENUMERATION LAW APPLIES IN FULL**

`grep` is blind to implementors; `tsc` is blind to implementors it does not type-check; a package suite is blind to implementors it does not import; **and `as never` is an authored instruction not to check.** `createContainer` and `createGrouping` have implementors in at least `functional-testing-engine/src/adapters.ts` (×2, provider pairs), `dev-change-engine/src/adapters.ts`, `discovery-flow-engine/src/adapters.ts` (×2), and `canonical-reference-input.ts`. **That list is a floor derived by reading, and ADR-0074 §6.2.2 rules that such lists are not to be planned from.** Suite-green, never build-green.

### 6.3 · **THE MEASUREMENT THIS ADR RESTS ON IS RECORDED, NOT REPEATED**

Measured 2026-08-06 across a generated solution's `config/capabilities.json` and `config/integrations.json`, `solution-export.ts`, `onboarding-configuration.ts`, `capability-framework/src/adapters.ts`, `agents/design-sync.ts`, `design-sync-adapters.ts`, and the consuming plane's synchronisation port and adapter. **Nothing was modified.** The counts in §1 and §2 are observations, not estimates — and per ADR-0074 §6.1, **they are counts of what was read, not of the surface an edit will touch.** §6.2 governs the surface.

## 7. Version impact

`@dbiz/capability-framework` **minor** — two signatures widen, one operation is added. **Breaking for any out-of-tree implementor of `TestManagementAdapter`**; there are none, every implementation being in this repository.

`@dbiz/tenant-onboarding-engine` **minor** — the intake schema gains optional fields; the disposition is **required with no default**, which is a deliberate break at the intake boundary. **A default would be the inference §3 rejects, installed as a constant.**

Generated solutions in the field: **no runtime break** — new keys are additive and the disposition's absence is recorded as unknown (§5), never assumed.

## 8. Affected components

- `packages/tenant-onboarding-engine/src/domain/onboarding-configuration.ts` — **Amended** (`testManagement` object; `.strict()` admits the disposition and identifiers).
- `packages/tenant-onboarding-engine/src/engine/solution-export.ts:408` — **Amended** (emission; `<FILL:>` for unsupplied fields).
- `packages/tenant-onboarding-engine/src/engine/tenant-config.ts`, `packages/tenant-onboarding-engine/src/engine/tenant-repository.ts` — **Amended** (defaults and normalisation carry the new fields).
- `packages/capability-framework/src/adapters.ts:98-99` — **Amended** (`createContainer`, `createGrouping` → `WriteOutcome<T>`; container discovery added).
- `packages/functional-testing-engine/src/adapters.ts`, `packages/functional-testing-engine/src/design-sync-adapters.ts`, `packages/functional-testing-engine/src/canonical-reference-input.ts` — **Amended** (implementors; **non-creating discovery mode**, §5).
- `packages/functional-testing-engine/src/domains/synchronisation.ts:205-206` — **Amended** (consumer; **`UNDECIDED — Functional Testing`**).
- `packages/functional-testing-engine/src/agents/design-sync.ts:171,176,183` — **Amended** (discovery names come from configuration; the absent branch acquires the disposition).
- `packages/dev-change-engine/src/adapters.ts`, `src/agents/sync-and-reporting.ts:61-62` — **Amended** (**`UNDECIDED — Dev-Change`**).
- `packages/discovery-flow-engine/src/adapters.ts`, `src/agents/execution-and-outcome.ts:375-376` — **Amended** (**`UNDECIDED — Discovery-Flow`**).
- `program/TECHNICAL_DEBT.md` D-057 — **Amended** (third occurrence of the shape, in the framework SPI rather than a capability's own).
- **Owed, and named rather than performed:** `issueKey`'s two copies and its `FORBIDDEN_NOUNS` collision · the `suite` field's name · `executionAdapters."I2-browser"`'s three `<FILL:>` values.
