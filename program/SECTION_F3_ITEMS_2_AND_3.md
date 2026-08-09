# F3 mechanical phase — items 2 and 3

**2026-08-05. Item 2 measured and found already closed. Item 3 measured before building, and the measurement contradicts my logged prediction.**

---

## ITEM 2 — `testCases` type (D-031): **ALREADY IMPLEMENTED. Nothing to build.**

**Measured before converting.** `CanonicalTestCase` (`test-management-intelligence.ts:43`) already carries:

```ts
readonly requirementIds: readonly string[];        // PLURAL, replacing the singular mapping
readonly acceptanceCriteriaCovered: readonly string[];
```

**`requirementMapping` does not exist anywhere in the tree.** Its only occurrence is inside the comment that documents what replaced it, and that comment carries the reasoning verbatim: *"A field that structurally cannot represent the plural case cannot discriminate, which is D-029's shape expressed in a TYPE rather than in an aggregate."*

**So D-031's ruling landed with the enrichment, exactly as the instruction recalled, and item 2 is closed by measurement rather than by work.** Nothing was converted. **Searching before creating is what stopped a re-implementation of a field that already exists** — CLAUDE.md §5's failure mode, avoided by checking.

**What remains of D-031 is NOT this.** Two `TestCase` types still exist — `CanonicalTestCase` and `model.ts:423`'s `TestCase` — but the second is the **retiring closure's**, and unifying them is work that gets deleted (`AGENT_MIGRATION_BAR.md`'s sweep finding). **It is not an F3 item and should not be scheduled as one.**

---

## ITEM 3 — config dereference (D-037): **MEASURED, NOT BUILT. My prediction was WRONG, and in the more interesting direction.**

### What holds the values behind `vault://config/t1`

**Nothing in this repository.** `configurationRef` is a `string` (`canonical-capability.ts:60`), carried opaquely:

```
canonical-reference-input.ts:267   configurationRef: 'vault://config/t1'
canonical-domain-steps.ts:130      passed through to the domain input
tenant-resolution.ts:35, 47, 111   received, copied to the result
tenant-resolution.ts:179           used as an AUDIT REFERENCE
```

**It is carried, recorded and never dereferenced. The `vault://` scheme has no resolver anywhere in the Intelligence Plane.**

### Is any canonical domain positioned to read it — **NO, AND NONE MAY BE**

Resolving `vault://config/t1` requires **a connection to a secret store** and **credentials to authenticate to it**. Both are refused to the Intelligence Plane by name:

- **R-3.2** — the IP opens no connections to customer systems. A read is as forbidden as a write; ADR-0069 established that explicitly.
- **R-3.3 / R-6.3** — the IP holds no customer credentials; custody is exclusively EP.
- **R-14.16/17/18** — tool credentials are customer-held in the EP, with **only REFERENCES crossing, resolved AT POINT OF USE.**

### Is the answer a reader, or a producer — **NEITHER**

> **R-14.16/17/18 IS THE ANSWER, AND IT IS ALREADY IMPLEMENTED. A reference crosses; the EP resolves it at the point of use. The Intelligence Plane holding an unresolved `vault://` reference is the architecture WORKING, not a gap in it.**

**A "reader" inside a canonical domain would be a sovereignty violation, not a fix** — it is precisely the change ADR-0069 refused when it ruled the IP may not open connections to customer systems, and the R-3.2 egress gate would catch it.

### PREDICTION vs MEASUREMENT — **logged, and wrong**

**I predicted:** *item 3 resolves to a design question and joins items 3 and 4 rather than 7–9.*

**Measured:** it is **not a design question either.** It is `workItemIds`'s resolution one step further on — **not "the IP must not do this, so design how the EP does it", but "the EP already does this, and the IP's behaviour is correct as it stands."**

**Right that it is not mechanical. Wrong about what it is instead**, and wrong in the direction of assuming a gap. **This is the third time this session a recorded gap turned out to be the architecture working**, after 2a (`storyId` present under another name) and D-040 (AN-3's property enforced twice by construction).

### Why D-037's "mechanical" categorisation was made, and why it was correct when written

**D-037 records** *"a reference resolved and never read, by a sequence that cannot read it."* **Every word of that is accurate.** What it does not say — because nothing at the time required it to — is **whether the sequence SHOULD be able to read it.**

> **A CATEGORISATION CORRECT WHEN WRITTEN AND INVALIDATED BY A LATER FINDING. The time-bounded-correctness law, applied to the PLAN rather than to the code.**

The law's usual form is *neither half was a coding error; each was correct code resting on a guarantee that stopped holding when the layer beneath it became honest.* **Here the guarantee did not stop holding — the READING did.** D-037 was categorised as mechanical before ADR-0074 made the platform ask, of every read, *who is permitted to perform it*. **Once that question exists, "a reference nothing reads" stops being a plumbing observation and becomes a sovereignty one**, and the same reference reads as correct rather than incomplete.

**The plan's categorisations are as time-bounded as the code's guarantees, and they decay the same way: silently, while still looking right.**

### Recommended disposition

**Item 3 CLOSES — not as a design question, and not as a build.** `configurationRef` is an opaque reference the IP carries and audits, resolved EP-side at point of use per R-14.16/17/18.

**D-037 should be amended rather than actioned**, to record that the reference is *deliberately* unresolved in the IP. **Its current wording invites exactly the repair that R-3.2 forbids**, and a future reader following it would build a vault client inside a canonical domain.
