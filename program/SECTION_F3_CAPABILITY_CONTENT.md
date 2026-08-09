# F3 items 2–5 — capability content, decision session

**REPORT ONLY. Nothing built. Stop for ruling.** · 2026-08-05

**The question is not where to plumb these from. It is which domain should PRODUCE each, and whether producing it is capability content the canonical sequence should have.** D-032's ruling stands throughout: **a source before a field**, and `'verify: ' + objective` is objective wearing a second name.

**Measured first, so the four are not treated as one shape. They are four different kinds of absence.**

| # | Item | Kind of absence | Decision or design question |
|---|---|---|---|
| 2a | `storyId` | **Present under another name** | **Yours — a semantic ruling** |
| 2b | `storyTitle` | **Arrives and is DROPPED** | **Yours — smallest of the four** |
| 3 | `workItemIds` | **No producer; needs a READ the sequence does not perform** | **Design question — do not build** |
| 4 | design `artefacts` | **No producer, and it cannot be an IP domain** | **Design question — sovereignty-shaped** |
| 5 | `businessGoal` / `title` | **`title` = 2b. `businessGoal` has NO source anywhere** | **Split: 2b's ruling, plus a design question** |

---

## 2a · `storyId` — **PRESENT UNDER ANOTHER NAME. This may not be a gap at all.**

**Consumed by:** `sync.design-discovery` (FT-030) · **narrative step 11** (organise).

**Positioned to produce it:** `story-intelligence` **already emits it** — `StoryIntelligenceResult.requirementId`, derived from `RequirementInput.id`, which the canonical runtime receives at its boundary.

**What producing it requires:** *nothing new.* The value exists and is carried the whole way.

**What the published output loses without it:** nothing, **if `requirementId` is the story identity.** Everything, if it is not.

> **THE RULING I NEED, AND IT IS SEMANTIC RATHER THAN TECHNICAL: is `RequirementInput.id` the customer's STORY identity, or a requirement identity derived from it?**

`RequirementInput` carries `id`, `title`, `statement`, `rawAcceptanceCriteria`, `rawBusinessRules`, `rawDependencies` — **the shape of a story, named as a requirement.** If it is the story id, item 2a is closed by renaming a reference and D-036's list drops to seven. If it is a derived requirement id, then publishing it as `storyId` would put a synthetic identifier into the customer's tool as though it were theirs, **which is the D-013 class at the publication boundary.**

**I have not assumed either.** The distinction is invisible in the types and decides whether this item exists.

## 2b · `storyTitle` — **IT ARRIVES AND IS DISCARDED. Not absent — dropped.**

**Consumed by:** `sync.design-discovery` (FT-030) · **narrative step 11**.

**Positioned to produce it:** `story-intelligence`, which **already receives it**: `RequirementInput.title` is present at the domain's input and **`StoryIntelligenceResult` does not carry it forward.**

**What producing it requires:** **one carried field.** No new work, no new read, no new producer — the smallest change of the four by a wide margin.

**What the published output loses without it:** the design-sync container name. `sync.design-discovery` composes `` `${storyId}-${storyTitle}`.slice(0, 80) `` to locate the customer's Test Plan. **Without the title that becomes an id and a hyphen** — a container named after a number, in the customer's tool, permanently.

> **DECISION, AND IT IS YOURS: does `StoryIntelligenceResult` carry `title`?** I recommend yes. It is a value the domain already holds, discarded at its own boundary, and **this is the same information-destroying-boundary shape as D-042 — with the difference that nothing here needs to be invented.**

## 3 · `workItemIds` — **NO PRODUCER, AND THE MISSING THING IS A READ**

**Consumed by:** `sync.design-traceability` (FT-030) · **narrative step 11**.

**Positioned to produce it: NONE, and this is not a domain-content gap.** `StoryIntelligenceResult.traceabilityReferences` exists and looks like a candidate — **it is not one.** It is built as `acceptanceCriteria.map((_c, index) => …)`, so it is a **synthetic reference the platform invented**, not an identifier the customer's tool holds. Publishing it as a work-item link would assert a relationship to an item that may not exist. **That is D-013's class, and D-032's ruling forbids it: a source before a field.**

**What producing it requires: A READ OF THE CUSTOMER'S TOOL THAT THE CANONICAL SEQUENCE DOES NOT PERFORM.** A work-item id is the customer's, held in their ADO or Jira, and reachable only through `ProjectAdapter`/`WorkItemAdapter`. **No canonical domain calls either for this purpose.**

**What the published output loses without it:** design-sync publishes test cases that are **not linked to the work items they verify** — the traceability half of FT-030. The tests exist in the tool and nothing connects them to the change that motivated them.

> **DESIGN QUESTION — F3 RULES IT AND DOES NOT BUILD IT, as `sharedSteps` was.** It adds a read, and a read is a new interaction with the customer's tool, not a field. **Two things now bear on it that did not a week ago:** ADR-0074 means that read can report unreachability, so it can be added honestly; and R-3.2 means the read is EP-initiated, so it is not simply a domain gaining a call.

## 4 · Design `artefacts` — **NO PRODUCER, AND IT CANNOT BE AN IP DOMAIN**

**Consumed by:** `sync.design-attachments` (FT-030) · **narrative step 11**.

**Positioned to produce it: NONE — and unlike item 3, no canonical domain COULD be.** `DesignAttachmentRef` is `{ name, kind, sha256, locator }`: a mockup, a Figma file, a specification, **by reference with a hash**. The hash proves what was attached without the Intelligence Plane holding it, exactly as `EvidenceReference` does.

**What producing it requires:** something must **observe an artefact and hash it**. That is custody of customer content. **Document 06 and R-3.3 put it in the Execution Plane**, and the same reasoning that keeps execution evidence EP-side applies unchanged to design evidence.

**What the published output loses without it:** test cases published without the mockups and specifications they were authored from. **A reviewer in the customer's tool cannot see what the test was written against.**

> **DESIGN QUESTION, AND IT IS SOVEREIGNTY-SHAPED RATHER THAN CONTENT-SHAPED.** The question is not *which domain produces it* — **no IP domain may.** It is *what EP-side capture produces a `DesignAttachmentRef`, and how does it cross*. That is the same question `EvidenceReference` already answered for execution artefacts, **which is where its answer should be modelled from rather than invented.**

## 5 · `businessGoal` / `title` — **TWO ITEMS WEARING ONE NAME**

**`title` IS ITEM 2b.** `canonicalSpecOf` maps `objective → title` at the publication boundary and states the reason; the underlying absence is the same discarded `RequirementInput.title`. **One gap, two directions, as the instruction says — and it is closed by 2b's ruling, not separately.**

**`businessGoal` IS NOT.** It has **no source anywhere in the canonical chain**, in any form, under any name.

**Consumed by:** the authored test case (FT-018) and carried to publication (FT-030) · **narrative steps 6 and 11**.

**Positioned to produce it: NONE.** The nearest candidates and why each fails:
- `functionalObjectives` — what the system must *do*. A business goal is why it matters. **Publishing one as the other is `'verify: ' + objective` at a higher altitude**, which D-032 forbids by name.
- `personas` — who, not why.
- `RequirementInput.statement` — the requirement itself. **Deriving a goal from it is inference, and inference presented as a field is what D-032 exists to stop.**

**What the published output loses without it:** the field is absent from the published test case. **That is honest.** The failure mode is not absence — it is a `businessGoal` synthesised from an objective and published into the customer's system of record as though someone had stated it.

> **DESIGN QUESTION, AND THE HONEST ANSWER MAY BE THAT IT SHOULD NOT EXIST.** Before asking what produces it, ask whether the canonical capability should carry business intent at all. **If no one states a business goal, the platform should not have a field for one** — and `sharedSteps`'s precedent applies exactly: an absent capability is reported as absent, not filled.

---

## What I am asking you to rule

1. **2a — is `RequirementInput.id` the customer's story identity, or a derived requirement id?** This decides whether item 2a exists. Semantic, invisible in the types, and not mine to assume.
2. **2b — does `StoryIntelligenceResult` carry `title`?** I recommend yes: a value the domain already holds and discards, one field, no new producer. **It also closes item 5's `title` half.**
3. **3 and 4 — ruled as design questions, not built**, on `sharedSteps`'s precedent. Item 3 adds a read; item 4 adds an EP-side capture. Neither is a field.
4. **5's `businessGoal` — is business intent capability content at all?** If the answer is no, the item closes as a **recorded capability reduction** rather than an open gap, and P-69.2's closure names it alongside `sharedSteps`.

**Two of four are decisions. Two are design questions. None is a build**, and no producer was fabricated for any of them.

---

# RULED — 2026-08-05

## 2a · **CLOSED. The value is the customer's identity by construction; the NAME is what was wrong.**

**Verified before ruling:** `story-intelligence.ts:142` is `requirementId: req.id`, and `req.id` is **never modified anywhere in the domain**. A pure pass-through — **the platform derives nothing and carries the caller's identifier unmodified**, so publishing it cannot introduce a synthetic id. The D-013-class risk this item was held open for **does not exist**.

**Ruling:** rename the reference to `storyId`, with the pass-through recorded as the reason. **D-036's list drops from eight to seven.**

**The naming mismatch is recorded separately as `TECHNICAL_DEBT.md` D-046** — a type whose name says less than its shape. Small, and it is the entire reason 2a looked like a gap for as long as it did.

## 2b · **RULED YES — `StoryIntelligenceResult` carries `title`.**

**The consequence that motivates it, recorded because it is the part that decays silently:** without it, `sync.design-discovery` composes `` `${storyId}-${storyTitle}`.slice(0, 80) `` and **the customer's Test Plan is named after a number and a hyphen — permanently, in their tool.** A container is not renamed once assets hang off it.

**Also closes item 5's `title` half.** One field, one producer that already holds it, no new read.

**Queued for the mechanical phase (items 7–9), NOT taken here** — this session was ruled a decision session, and a domain-output change is a build.

## 3 and 4 · **DESIGN QUESTIONS. RULED, NOT BUILT** — `sharedSteps`'s precedent.

**Item 3 — `workItemIds`: not a domain gaining a call.** It is a **cross-plane read**, EP-initiated under R-3.2, and **honestly reportable under ADR-0074** — which it would not have been a week ago. The framing matters because "add a read" sounds like plumbing and is not: it is a new interaction with the customer's tool, crossing a sovereignty boundary.

**Item 4 — design `artefacts`: no IP domain MAY produce it.** Custody is EP-side per document 06 and R-3.3. **Model the answer from `EvidenceReference`, which already solved exactly this for execution artefacts — do not invent a second mechanism.** A second by-reference-with-hash design would be CHARTER §4's duplication, differing only in which artefact it carries.

## 5 · `businessGoal` — **NOT CAPABILITY CONTENT. CLOSED as a recorded capability reduction.**

**All three candidate producers fail the same way, and that is the finding rather than three separate rejections: each would put AUTHORED-LOOKING INTENT into a customer's system of record that NOBODY AUTHORED.** `functionalObjectives` is what the system must do; `personas` is who; `statement` is the requirement. None is a business goal, and presenting any of them as one publishes an assertion no human made.

> **If no one states a business goal, the platform should not have a field for one.**

**Closes alongside `sharedSteps` in P-69.2's closure**, named at closure rather than discovered afterwards: **the canonical capability does not carry business intent, and its published test cases will not have a `businessGoal`.** That is a stated reduction, not a gap.

## Where this leaves D-036

**Eight inputs → seven.** 2a closed by measurement; 2b ruled and queued; 5 closed as a reduction; **3, 4 and `sharedSteps` are design questions ruled but not built**; `testCases` type and the config dereference remain mechanical (items 7–9); the fifth dependency stays last.
