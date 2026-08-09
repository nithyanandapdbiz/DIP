# Known limitations register

**Commit:** `a7821fd63f6fedc2c7888478d33fcd33e300b765`. Generated from evidence, implementation status and the debt register.

## Three categories, deliberately not mixed

These words are not synonyms and the difference decides what to do about each:

| | Meaning | What it implies |
|---|---|---|
| **NOT IMPLEMENTED** | The thing does not exist. No code was written. | Build it. There is nothing to measure. |
| **NOT MEASURED** | The thing exists but no executed evidence covers it. | Measure it. It may work; nobody has shown that it does. |
| **NOT CERTIFIED** | Evidence exists but does not meet the bar for a certification claim. | Close the named gap. |

**Collapsing them is how a platform comes to believe it is nearly finished.** An
unmeasured property reads like a small gap and an unimplemented capability reads like
the same small gap, until someone tries to use it.

## NOT IMPLEMENTED

**20 components.** These were never in P2 scope; they are recorded so the
boundary of what was built is explicit.

- Composition root
- Policy decision point
- AI runtime + provider abstraction
- Capability registry
- Certification service
- Knowledge graph
- Platform APIs beyond the gateway
- Execution runtime
- Browser execution
- API execution
- Performance execution
- Security execution
- Penetration execution
- Tool mapping / adapters
- AI provider mapping
- Credential custody
- Evidence custody
- Degraded-mode operation
- Plane-boundary integrity
- AI-disabled operation

## NOT MEASURED

**23 properties.** Each names its blocker. None is simulated, and none
contributes to any readiness figure in either direction.

### A container runtime alone closes these

| # | Property | Evidence set |
|---|---|---|
| **E-2** | Execution Plane generated AND DEPLOYED to a customer tenancy | operational |
| **K-15** | deployment guides reproduce successfully | customer-success |
| **G-1** | the platform runs in a deployed production environment | production |
| **GA-1** | deployment replay passes | deployment |
| **GA-2** | restart replay passes against a deployed runtime | deployment |
| **GA-3** | recovery replay passes against a deployed runtime | deployment |
| **GA-4** | security replay passes against a deployed runtime | deployment |
| **GA-5** | performance replay passes against a deployed runtime | deployment |
| **GA-6** | tenant isolation replay passes against a deployed runtime | deployment |
| **GA-7** | observability replay passes against a deployed runtime | deployment |
| **GA-8** | operational replay passes against a deployed runtime | deployment |
| **GA-9** | container startup, shutdown, restart, upgrade and rollback | deployment |
| **GA-10** | certificate, signing key and configuration persistence across a container restart | deployment |

### A container runtime is necessary but not sufficient

| # | Property | Also needs |
|---|---|---|
| **G-2** | performance under production load and concurrency | a horizontally scaled deployment AND production load |
| **G-3** | SLO attainment over a real measurement window | a deployment AND a 30-day window of real traffic |
| **G-4** | incident detection in production, and detection source | a deployment AND a production incident to detect |

### A container runtime is irrelevant

| # | Property | Needs |
|---|---|---|
| **K-12** | a customer completes onboarding in under 30 minutes | an observed customer. The automated path is already measured |
| **K-13** | generated example test suites execute successfully | Playwright, Selenium, JUnit, NUnit and pytest installed |
| **K-14** | installation validated on a clean environment for every supported target | a clean-environment runner per language |
| **G-5** | shared nonce store in a horizontally scaled deployment | a shared nonce store implementation — a deployment-topology decision (D-003). A container runtime does NOT provide one |

**These remain unmeasured once General Availability is granted.** They are
not deployment problems, and it would be a serious misreading of the GA determination
to treat certification as having closed them.

## NOT CERTIFIED

| Claim | Status | Why |
|---|---|---|
| General Availability | **NOT CERTIFIED** | Deployment evidence unavailable. E-2 is NOT MEASURED because no container runtime exists in this environment. |
| General Availability | **PARTIALLY CERTIFIED** | 11 properties NOT MEASURED |

## Open technical debt

| # | Item |
|---|---|
| **D-019** | **HEADLINE CORRECTED 2026-08-06 BY MEASUREMENT, AND THE CORRECTION NARROWS IT: THE TRIAD *CAN* DECLINE — IT DECLINES ON **PRESENCE** AND IS SILENT ON **SOUNDNESS**.** Two framework repairs postdate th |
| **D-003** | **No shared nonce store implementation.** Replay protection is injectable and proven to work across instances when a shared store is supplied (R-11), but the default is per process. |
| **D-006** | **`onboarding-experience` declares an unused direct `@dbiz/platform-core` dependency.** The package imports platform-core in no source file; it is wired to the Platform Core onboarding stack entirely  |
| **D-005** | **Uncommitted, unrecorded prior work in the working tree.** At the start of Session 7 the committed HEAD (`f922626`) held only the Functional Testing Engine, but the working tree contained — uncommitt |
| **D-007** | **DECLARATION-VERSUS-IMPLEMENTATION DRIFT — a debt class, not a single defect.** No gate in this platform compares what a declaration *says* against what the implementation *does*. Every gate verifies |
| **D-008** | **A published measurement can be taken across a concurrently-changing tree, and nothing records that it was.** Observed 2026-08-04: `packages/tenant-onboarding-engine` reported **310** tests, then **3 |
| **D-009** | **A gate suite cannot fault-prove its own red portion — the unproved set is exactly the failing set.** Measured 2026-08-04: `record-fault-proofs.js` recorded 149 proofs and reported **8 NOT PROVED**,  |
| **D-010** | **An Intelligence-Plane script opens an outbound connection into the customer tenancy.** `packages/functional-testing-engine/launcher/generator/devBootstrap.mjs:27` calls `fetch(new URL('/health', url |
| **D-011** | **Nothing measures what is reachable ONLY from something about to be deleted — and the first instrument built to measure it cannot yet do so.** *(Corrected 2026-08-04. This entry first asserted that t |
| **D-012** | **THE CANONICAL RUNTIME REPORTS A CERTIFICATION VERDICT IT DID NOT COMPUTE.** `packages/functional-testing-engine/src/domains/executive-reporting.ts:169` emits `{ label: 'verdict', value: model.certif |
| **D-013** | **DECLARED CAPABILITY THAT IS STRUCTURALLY UNREACHABLE — a field whose type promises discrimination its construction cannot deliver.** Two instances, both found 2026-08-04 while designing failure cond |
| **D-014** | **RESOLVED 2026-08-04: NEITHER DEFECTIVE; THE EXPECTATION WAS WRONG.** **The canonical runtime leaves a requirement uncovered on its own blessed reference fixture, and nobody has ever asked whether th |
| **D-015** | **THE CANONICAL DOMAINS DECLARE 115 CERTIFICATION CRITERIA AND EVIDENCE NONE OF THEM — and the property that says so was itself passing vacuously.** Measured 2026-08-04 by counting `certificationCrite |
| **D-016** | **FOUR OF THIRTEEN CANONICAL DOMAINS HAVE NO STATE OF THEIR OWN TO FAIL ON — they are 1:1 projections of their input, and a projection cannot have a finding.** Established 2026-08-04 by designing a fa |
| **D-017** | **THE DOMAIN WHOSE JOB IS RESOLVING THE TENANT HELD BOTH HALVES OF AN ENTITLEMENT CHECK AND PERFORMED NEITHER.** `tenant-resolution` receives `enabledCapabilities` on its input and copies it to its re |
| **D-018** | **A REPAIRED INSTRUMENT RETURNED THE SAME WRONG VALUE FOR AN UNRELATED REASON — AND WOULD HAVE READ AS MORE CREDIBLE THAN THE FIRST.** `retirement-inventory.mjs` reported `orphanCount: 0` because a su |
| **D-024** | **A DECLARATION THAT WAS UNIMPLEMENTABLE WHEN WRITTEN, IS NOW IMPLEMENTABLE, AND IS STILL UNWIRED.** `dev-change-engine/src/agents/sync-and-reporting.ts` declares `failureHandling: 'A defect that cann |
| **D-023** | **THE PUBLICATION SPI CANNOT REPORT A FAILED PUBLICATION — the tool boundary can say *published* and nothing else.** Traced from `capability-framework/src/adapters.ts`: `linkTraceability → { linked: t |
| **D-039** | **THIS REGISTER'S OWN DEFECTS ARE NEARLY REPRODUCED BY THEIR FIXES — twice this section, caught in DESIGN both times.** *(i)* **ADR-0072's negative-path test.** R-13.7 requires a property be shown to  |
| **D-038** | **NONE OF THE 109 CERTIFICATION CRITERIA IS THE KIND OF THING AN AGENT CAN EVIDENCE BY DOING ITS WORK.** Measured 2026-08-04, before building the criteria mechanism, by reading all 109 rather than sam |
| **D-040** | **AN-3 — the agent-naming gate's uniqueness rule — CANNOT FAIL, found by its own R-13.7 probe on the day it was registered.** The probe injected an exact duplicate of `ALL_AGENTS[0]` into the built ca |
| **D-041** | **A RED GATE IS EXPENSIVE TO REGISTER (D-009), WHICH CREATES STANDING PRESSURE TO WEAKEN GATES SO THEY CAN BE REGISTERED. This is a hazard, not an incident — it has no instance yet and will recur ever |
| **D-042** | **THE FIFTEEN SCENARIO-TECHNIQUE AGENTS DESTROY `Requirement.confidence`, AND THE SCENARIOS THEY PRODUCE ARE BYTE-IDENTICAL ACROSS IT — INCLUDING THE FINGERPRINT.** Measured 2026-08-04 in the batch-1  |
| **D-043** | **`test.certification` RETURNS `certified: true` ON ZERO REQUIREMENTS, AND ITS OWN REASON STRING STATES THE NUMBER THAT REFUTES IT.** Measured 2026-08-04: `coverage-analysis({scenarios: [], requiremen |
| **D-044** | **THREE CHECKS IN `authoring.quality-review` RECORD EVIDENCE THAT FLATLY ASSERTS THE PROPERTY THEIR OWN VERDICT DENIES — ON EVERY FAILURE.** Measured 2026-08-05 in the batch-3 per-file reading. The ag |
| **D-045** | **AN UNREACHABLE CUSTOMER REPOSITORY AND AN EMPTY ONE ARE THE SAME VALUE, AND THE PLAN CERTIFIED FROM IT IS "CREATE EVERYTHING".** Measured 2026-08-05 in the batch-4 per-file reading; the whole chain  |
| **D-047** | **A REGISTER BUILT TO CATCH SILENT FAILURES ALSO RECORDS SILENT SUCCESSES AS FAILURES, AND ONLY MEASUREMENT DISTINGUISHES THEM.** Three entries in one session turned out to be **the architecture worki |
| **D-048** | **THE FOURTH BLAST-RADIUS CORRECTION THIS SESSION, AND THE FIRST IN AN INSTRUCTION RATHER THAN A PLAN DOCUMENT.** Placement was scoped as two surfaces — the contract member and the nine agents. Measur |
| **D-049** | **THE FIFTH BLAST-RADIUS CORRECTION, AND THE FIRST WHERE THE ERROR WAS IN THE VERB.** Every scoping of this work — in F1's design report, in `RETIREMENT_RESOLUTION_REGISTER.md`, in the section's own i |
| **D-050** | **THE SIXTH SCOPE CORRECTION, AND THE FIRST THAT IS NOT ABOUT SIZE BUT ABOUT FEASIBILITY. *"The nine agents are unchanged"* was written into the scope repeatedly, by me, and was never checked against  |
| **D-051** | **THE SEVENTH SCOPE CORRECTION, AND THE FIRST FOUND IN A REGISTRY RATHER THAN IN A TYPE, A COUNT OR A VERB.** Measured at `9c2cfc8`, clean tree, before any edit: **the nine design-sync agents are not  |
| **D-054** | **THE EIGHTH SCOPE CORRECTION, AND THE FIRST WHERE THE ARTEFACT BEING CORRECTED WAS AN INSTRUCTION RATHER THAN AN ESTIMATE, A TYPE OR A REGISTRY.** Four predictions — **N1, N2, N3 and N4** — were carr |
| **D-055** | **A STRUCTURAL PROPERTY ASSERTED OVER THE COMPLEMENT OF ONE KIND IS TRUE BY COINCIDENCE, AND STAYS TRUE UNTIL A KIND IS ADDED.** Measured 2026-08-05 while adding a fourth `ReuseDecision` member. **Thr |
| **D-056** | **THE NINTH SCOPE CORRECTION, AND THE SEVENTH WHOSE CORRECTED ARTEFACT WAS AN ESTIMATE — FOUR FIGURES, ALL LOW, ALL IN ONE CHANGE.** Measured 2026-08-05 landing D-045's repair: **9 `EngineDependencies |
| **D-059** | **THE HASH-STORAGE GAP — A CASE CAN ENTER A STATE THE PLATFORM CAN DETECT, REPORT, AND NEVER LEAVE. F2 RULES THAT IT CANNOT CLOSE IT.** `sync.design-idempotency` reads a hash VERSION before its digest |
| **D-057** | **ADR-0072's REPAIR NEVER REACHED THREE CAPABILITIES' OWN PUBLICATION SPIs — D-028, THREE MORE TIMES, AND NOBODY SEARCHED FOR IT.** Measured 2026-08-05 by the F2 `failureHandling` audit (`SECTION_F2_F |
| **D-068** | **A TEST THAT DOES NOT RUN IS INDISTINGUISHABLE FROM A TEST THAT DOES NOT FAIL, AT EVERY LEVEL THE PLATFORM INSPECTS.** Observed 2026-08-05 during B1. Two readings of the same workspace suite, minutes |
| **D-067** | **NO TEST IN THE PLATFORM HAD EVER PLACED A NON-`ok` OUTCOME AT `architecture-review` — WHICH IS WHY A GREEN SUITE WAS CONSISTENT WITH A TRIAD STAGE NOTHING COULD HEAR.** Measured 2026-08-05 while clo |
| **D-075** | **THE FIFTEENTH SCOPE CORRECTION — A GATE WAS CLASSIFIED AS *LOSING ITS SUBJECT* WHEN IT WAS ABOUT TO DETECT THE THING IT WAS BUILT FOR, AND THE ACCEPTED ADR AUTHORISING THE CHANGE FORBIDS IT IN TWO P |
| **D-080** | **THREE PLACES WHERE ADR-0077 DESCRIBES A MECHANISM SLIGHTLY OFF FROM WHAT IMPLEMENTING IT REQUIRES — ONE CLASS, THREE INSTANCES, NONE CHANGING THE DECISION.** Found 2026-08-05 while executing §6 step |
| **D-081** | **ADR-0077 §4.8 STATES RC-4′ AS A CONJUNCTION OF THREE, AND THE LITERAL READING WOULD MAKE IT RED AT STEP 1 — WHICH §6 STEP 1's OWN SENTENCE CONTRADICTS.** Measured 2026-08-05 implementing the gate. § |
| **D-082** | **ADR-0077 §4.8 SPECIFIES A PROBE WHOSE EXPECTED OUTCOME IS *GREEN*, AND THE FAULT-PROOF HARNESS CANNOT EXPRESS ONE.** Measured 2026-08-05. §4.8's re-anchored probe set ends with *"plant a comment nam |
| **D-083** | **D-009's CIRCULARITY ARRIVED WHERE IT WAS PREDICTED: A CORRECTLY RED GATE CANNOT CARRY A RECORDED PROOF, AND FOUR PROBES WENT UNPROVED THE MOMENT RC-3′ WENT RED.** Measured 2026-08-05 at §6 step 2's  |
| **D-084** | **CU-6a IS MEASURED, AND IT DOES NOT HOLD — THE CANONICAL COMPOSITION PRODUCES NO PACKAGE BODY AT ALL, ON EVERY ENTRY OF THE DECLARED CORPUS.** Measured 2026-08-05 on a rebuilt tree, both paths, ADR-0 |
| **D-085** | **THE ONE EVIDENCE ARTEFACT THAT CANNOT BE REGENERATED IS STORED UNDER THE RULE THAT ASSUMES ALL OF THEM CAN.** Measured 2026-08-05 producing the CU-6a artefact. `.gitignore:115` ignores `governance/* |
| **D-086** | **THE GROUNDING VOCABULARY IS CLOSED AND THE CANONICAL STEP IS PROSE — A DEFECT, RULED AS ONE, NOT A DESIGN DIFFERENCE.** Measured 2026-08-05 (ADR-0077 §6 step 3), ruled 2026-08-05. `groundOperations` |
| **D-087** | **THIRD INSTANCE IN THREE SECTIONS: A STEP'S SCOPE WRITTEN AGAINST A PARTIAL PICTURE OF WHAT IT TOUCHES — AND THIS ONE CHANGED THE DECISION.** Recorded 2026-08-05 on the ruling of ADR-0077 §6 step 3.  |
| **D-088** | **THE REASONING RESULT REGISTRY'S PROOF-OF-REASONING IS BOUND TO THE RUNTIME BEING RETIRED — ITS DECLARED EVIDENCE NAMES ARE LEGACY AGENT IDENTITIES, AND STEP 4 IS WHERE THIS SURFACED, NOT WHERE IT OR |
| **D-089** | **A LIVE VACUOUS GREEN INSIDE THE REGISTRY ADR-0067 BUILT TO PREVENT IT — `grounded-authoring` DECLARES TWO EVIDENCE NAMES NOTHING HAS EVER EMITTED, AND PASSES.** Measured 2026-08-05 on both paths. `C |
| **D-090** | **CU-6a RE-MEASURED AFTER §6 STEPS 4 AND 5: THE FIRST TWO CAUSES ARE CLOSED AND TWO MORE ARE MEASURED, SAME CLASS, STILL OUTSIDE §4.7.** Measured 2026-08-05 on a rebuilt tree, both compositions presen |
| **D-091** | **HIGHEST-SEVERITY HARNESS FINDING IN THE PROGRAMME — THE INSTRUMENT THE WHOLE CUT-OVER RESTS ON PRODUCED A GREEN EQUIVALENCE PROOF BETWEEN ONE IMPLEMENTATION AND ITSELF, ON THE LAST TREE WHERE THE CO |
| **D-092** | **ADR-0077 §4.5's E-3 IS EQUIVALENCE-AS-SAMENESS, WHICH §4.1 OF THE SAME ADR RULES UNSATISFIABLE BY CONSTRUCTION — AND IT PASSES ONLY WHERE IT MEASURES NOTHING.** Measured 2026-08-05, both composition |
| **D-093** | **HALF THE CLOSED-LOOP SUITE WAS SATISFIED BY REPORTING THE LOSS HONESTLY; THE OTHER HALF NEEDS THE LOSS NOT TO EXIST — AND THAT LINE IS WHERE HONEST REPORTING STOPS BEING SUFFICIENT.** Measured 2026- |
| **D-094** | **THE TWO RUNTIMES CLASSIFY THE SAME SENTENCE DIFFERENTLY — LEGACY `business-rule`, CANONICAL `acceptance-criterion` — AND CARDINALITY HID IT.** Measured 2026-08-05, before asserting E-4′(2), on the c |
| **D-098** | **THE INTELLIGENCE PLANE MINTS EVIDENCE REFERENCES INTO THE EXECUTION PLANE FOR TRACES THAT DO NOT EXIST — INV-1 INVERTED, ON THE AUTHORING PASS.** Measured 2026-08-05. On an authoring pass — no execu |
| **D-097** | **AN ABSENT READ WAS READ AS AN ABSENT CHANNEL — THE SAME ERROR CLASS AS THE REST OF THIS SECTION, REASONING ABOUT ONE DIRECTION AND NOT MEASURING THE OTHER.** Recorded 2026-08-05 as a correction to m |
| **D-096** | **STANDING CORRECTION — THREE MEASUREMENTS IN A ROW PUT THE CANONICAL RUNTIME AHEAD OF THE ASSUMPTION MADE ABOUT IT, AND THE ASSUMPTION HAD NEVER BEEN MEASURED UNTIL NOW.** Recorded 2026-08-05, ADR-00 |
| **D-095** | *(D-094 is the same finding at a second field — see below.)* **A GOVERNED CONTRACT THAT DOES NOT GOVERN THE THING CROSSING IT — AND THAT, NOT THE EXECUTION PLANE'S ABSENCE, IS THE CEILING.** Raised 20 |
| **D-099** | **THE ROLLBACK MACHINERY SURVIVED THE THING IT ROLLS BACK TO.** Recorded 2026-08-05 at ADR-0061 §6 step 6. `rollbackToLegacy()`, `selectImplementation()` and `buildParallelValidationReport()` remain e |
| **D-100** | **ADR-0061 §6 STEP 6 FALSIFIES A RECORDED PROPERTY OF AN ACCEPTED ADR THAT THE AUTHORISING ADR NEVER NAMES.** Measured 2026-08-05 while re-pointing the gate set. **AC-7 is an ADR-0044 acceptance prope |
| **D-101** | **THE PLATFORM's REASONING REGISTRY STILL TAKES ITS INPUT SHAPE FROM ONE CAPABILITY's PACKAGE.** Recorded 2026-08-05, ADR-0061 §6 step 6 / obligation 4. `registry/reasoning-publication.ts` imported `E |
| **D-102** | **A NUMBER HANDED TO YOU IS AN ESTIMATE UNTIL YOU MEASURE IT, AND THAT INCLUDES A NUMBER FROM THE PROGRAMME OWNER.** Recorded 2026-08-05, by the programme owner, against the session that executed ADR- |
| **D-103** | **A GATE WENT GREEN ON A COUNT OF THINGS THAT NO LONGER EXIST — `verify-canonical-agent-dormancy`, PASSING AFTER THE DELETION, REPORTING "135 agents remain dormant" FROM A HARD-CODED LITERAL.** Measur |
| **D-104** | **TWO PIECES OF EVIDENCE WERE SAVED BY THE BINDING'S OWN PROCEDURE AND BY A TOOL REFUSING — NEITHER BY ANYONE INTENDING TO SAVE THEM.** Recorded 2026-08-05, both at ADR-0061 §6 step 6. **(i) The CU-6a |
| **D-105** | **A DECLARED CONNECTOR OPERATION IS DRIVEN BY NO RUN THE PLATFORM CAN MAKE, AND UNLIKE ITS FOUR NEIGHBOURS IT CARRIES NO REASON.** Measured 2026-08-05 building Part 4, across a five-run workflow set s |
| **D-106** | **THE IP's OWNERSHIP RECORD — THE THING ADR-0079 WOULD ASSERT AGAINST — IS UNTRACKED RUNTIME STATE, AND THE GENERATOR ALREADY EMITS FROM IT FAITHFULLY.** Measured 2026-08-06 during the P-78.8 mapping, |
| **D-107** | **THE CLASS, IN ITS STRONGEST FORM — REACHED 2026-08-06 AND PROMOTED TO LEAD THIS ENTRY, BECAUSE IT GOVERNS EVERY INSTANCE BELOW AND THE ORIGINAL HEADLINE IS ONLY THE FIRST OF THEM:** **A CLAIM THAT C |
| **D-108** | **THE PLANE'S TENANT REGISTRY CONSTRUCTS ITS OWN TENANT-SCOPED PATH, WHICH R-07.2 FORBIDS, AND ADR-0079 DELIBERATELY DID NOT REPAIR IT.** Recorded 2026-08-06 at ADR-0079 §4 P-79.1 and §6. [`tenant-rep |
| **D-109** | **ONE CUSTOMER IS TWO TENANTS IN TWO REGISTRIES, AND EVERY RECENCY SIGNAL THE PLATFORM EXPOSES POINTS AT THE ABANDONED ONE.** Measured 2026-08-06, from a question about which `tenantId` Carlisle Homes |
| **D-110** | **A GATE THAT READS RAW SOURCE CANNOT TELL A CALL FROM A SENTENCE ABOUT A CALL, AND THE HONEST COMMENT BECAME THE VIOLATION.** Measured 2026-08-06 while landing `GET /api/packages/{hash}` (ADR-0079 §6 |
| **D-111** | **MOUNTING A ROUTE IS A CONFIGURATION ACT AND NOTHING GATES IT — SO A ROUTE CAN BE DECLARED, TESTED, GATED AND UNREACHABLE IN EVERY DEPLOYMENT.** Measured 2026-08-06 after landing `GET /api/packages/{ |
| **D-112** | **A FROZEN ADR ASSERTS THAT TWO GATES GOVERN A ROUTE. NEITHER DOES, AND ONE OF THEM STRUCTURALLY CANNOT.** Measured 2026-08-06. **P-70.5** states the retrieval endpoint *"is therefore governed automat |
| **D-113** | **EP-TOKEN ROTATION IS NOT ENFORCED ON `/api/application-templates`, AND THE ROUTE THAT ESCAPES IT IS THE ONE THAT ESCAPES IT BY ARRIVING FIRST.** Measured 2026-08-06 while diagnosing OBL-002. The rev |
| **D-114** | **THE TENANT REGISTRY IS THE ONLY RECORD OF ITS OWN HISTORY, IT IS UNTRACKED AND SINGLE-COPY, AND ONE OF ITS RECORDS HAS NOW BEEN DESTROYED.** Measured 2026-08-06 while diagnosing OBL-002. **What exis |
| **D-115** | **ADR-0080 P-80.5 DERIVES PENDING WORK FROM STATE THIS PLANE DOES NOT HOLD — MEASURED ONE HOUR AFTER THE ADR WAS ACCEPTED, WHILE BUILDING IT.** P-80.5 rules that *"pending work SHALL be derived from r |
| **D-116** | **DECISION TRACEABILITY IS CARRIED BY A LABEL NOBODY IS OBLIGED TO WRITE, AND THE ONE CHECK OVER IT RUNS IN A SINGLE DIRECTION ON ONE OF THREE SPELLINGS — SO FOUR ACCEPTED ADRs CLAIM TO CLOSE DECISION |
| **D-117** | **CORRECTED 2026-08-06 BY MEASUREMENT, AND THE CORRECTION IS NOW THE HEADLINE: THIS ENTRY'S LOAD-BEARING CLAIM — *"NOTHING PARSES WHAT THIS PLANE EMITS, SO NOTHING CAN CONTRADICT IT"* — WAS ALREADY UN |
| **D-118** | **THE VERSION-NEGOTIATION MECHANISM R-20.24 REQUIRES EXISTS, IS TESTED, AND IS NOT WIRED TO THE ONLY FUNCTION THAT PARSES A PACKAGE — AND A TEST ASSERTS THE OPPOSITE OF WHAT THE PARSER DOES.** Measure |
| **D-119** | **THE PLATFORM'S CREDENTIAL REMEDIATION ASSUMES A VAULT RESOLVER THE GENERATED SOLUTION DOES NOT CARRY.** Measured 2026-08-06 **from the Execution Plane**, and the instruction that prompted it was **W |
| **D-120** | **THE COMPATIBILITY CORPUS ENCODES A BREACH OF THE RULE STATED BESIDE THE SCHEMA IT VALIDATES.** Measured 2026-08-06 while scoping the OBL-004 amendment. `compat/fixtures/v1.0.0/execution-package.full |
| **D-121** | **SETTLED 2026-08-06 AS NONE OF (a), (b) OR (c) — THE CONTRACT IS NOT WRONG, THE PRODUCER IS; `CONTRACT_VERSION` STAYS AT 1.0.0 AND NOTHING WAS AMENDED. THE FIELD COUNT IN THIS HEADLINE WAS ALSO WRONG |
| **D-122** | **NOTHING HAS EVER WRITTEN TO THE SEALED PACKAGE STORE. `SealedPackageStore.put` HAS ZERO CALL SITES OUTSIDE TESTS, IN THE ENTIRE TREE — SO `GET /api/packages/{hash}` IS A DEPLOYED, AUTHENTICATED, TEN |
| **D-123** | **THE DETACHED SIGNATURE R-20.29 REQUIRES THE EXECUTION PLANE TO VERIFY HAS NO CARRIER UNDER PULL — SO A WRITER BUILT TODAY WOULD PRODUCE PACKAGES THE EP IS CONTRACTUALLY OBLIGED TO REFUSE.** Measured |
| **D-124** | **DOC 12 ASSIGNS THE SEALED EXECUTION PACKAGE TO STAGE 7, AND STAGE 7 AS BUILT EMITS A COUNT — THE PACKAGE IS COMPOSED OUTSIDE THE TWELVE-STAGE LIFECYCLE ENTIRELY.** Measured 2026-08-06 while reportin |
| **D-125** | **CORRECTED 2026-08-06 WHILE IMPLEMENTING ITS OWN FIX, AND THE CORRECTION SHARPENS IT: THE PLACEHOLDER IS FAIL-CLOSED AND IS STILL WRONG, BECAUSE IT ASKS THE CUSTOMER FOR A VALUE ONLY DBiz HOLDS.** Th |
| **D-126** | **SEVEN ACCEPTED ADRs ARE ABSENT FROM THE ADR INDEX, AND THE THREE GATES OVER ADRs ARE ALL STRUCTURALLY UNABLE TO SEE IT.** Measured 2026-08-06 while adding ADR-0081's index row. `DECISIONS.md` §5 is  |
| **D-128** | **THERE IS NO EVIDENCE ROUTE IN THE AUTHENTICATED TIER, SO R-20.12's BINDING HAS NO PRODUCTION INGRESS TO BE ENFORCED AT — AND `EvidenceReferenceHandle` CANNOT CARRY THE HASH EITHER, BECAUSE IT IS CON |
| **D-129** | **THE PLATFORM'S HIGHEST-VALUE ASSET IS HELD IN WEAKER CUSTODY THAN THE SESSION SECRET, AND THE TWO ARE RESOLVED TWELVE LINES APART IN THE SAME FUNCTION.** Measured 2026-08-06 while reporting the firs |
| **D-130** | **THE STORY-OBSERVATION PROJECTION DROPS FIVE OF THE SEVEN FIELDS ITS OWN CONTRACT DECLARES, AND ONE OF THE TWO IT KEEPS CANNOT DISTINGUISH ABSENCE FROM SUCCESS.** Measured 2026-08-06 against the atta |
| **D-131** | **TWELVE OF THIRTEEN COMPLETENESS SIGNALS ARE COMPUTED ON EVERY RUN AND READ BY NOTHING — THEIR ENTIRE EFFECT IS A COUNT IN AN EVENT.** Measured 2026-08-06. `assessCompleteness` ([`observation-interpr |
| **D-132** | **NOTHING IN AN EXECUTION PACKAGE STATES WHICH TENANT, ORGANISATION OR ENVIRONMENT THE RUN IS SUPPOSED TO MEASURE, SO A RUN AGAINST THE WRONG CUSTOMER'S ENVIRONMENT IS UNDETECTABLE RATHER THAN IMPOSSI |
| **D-133** | **EVERY GENERATED SOLUTION IN THE FIELD ASSERTS NO TEST-REPOSITORY DISPOSITION, AND THE SAFE-LOOKING READING OF THAT SILENCE IS THE ONE [ADR-0085](../docs/adr/ADR-0085-tenant-test-repository-dispositi |
| **D-134** | **`issueKey` — THE SIXTH DECLARED-AND-UNCONSUMED INSTANCE, AND THE FIRST AIMED AT A HUMAN.** Measured 2026-08-06 during ADR-0085's measurement and **carried from the concurrent ADR-0085 file that was  |
| **D-135** | **A FRESHLY GENERATED SOLUTION CANNOT EXECUTE THE FUNCTIONAL-TESTING CAPABILITY, AND THE THREE VALUES THAT WOULD LET IT ARE UNFILLED PLACEHOLDERS.** Observed 2026-08-06 during ADR-0085's measurement o |
| **D-136** | **THE DISPOSITION IS CONFIGURABLE, EMITTED AND READABLE — AND NO CONSUMER BRANCHES ON IT. THE CREATE AT `synchronisation.ts:205` IS STILL UNCONDITIONAL.** Raised 2026-08-06 executing [ADR-0085](../doc |
| **D-137** | **A PACKAGE WAS ABSENT FROM EVERY SUITE MEASUREMENT THIS PROGRAMME HAS PUBLISHED, AND THE FIGURES LOOKED COMPLETE WITHOUT IT.** Measured 2026-08-06 taking M5's pre-deletion measurement. `packages/tena |
| **D-138** | **A RED CARRIED FOR MANY TURNS AS A MISSING TOOL IS A PATH CONDITION, AND THE FIGURE NEVER RECORDED THE SHELL THAT PRODUCED IT.** Measured 2026-08-06 taking ADR-0082 §6 step 2's baseline. `packages/pl |
| **D-139** | **ADR-0082's Q3 IS PARTIALLY MET: THE RUN RECORD PROVES A HASH IS WELL-FORMED AND NEVER PROVES IT RESOLVES TO A PACKAGE — FORMAT-BINDING IS NOT REFERENTIAL BINDING.** Measured 2026-08-06 against `run- |
| **D-140** | **A GATE THAT READS COMMENTS MEASURES WHAT A FILE SAYS, NOT WHAT IT DOES — AND THE FIRST ONE TO PROVE IT WENT RED ON ITS OWN SUBJECT'S EXPLANATION OF THE RULE IT ENFORCES.** Measured 2026-08-06 buildi |
| **D-141** | **WITH ONE SUBJECT, "ANY MODULE THAT CALLS `purgeExpired`" IDENTIFIES THE PURGE DRIVER. WITH TWO, EITHER DRIVER SATISFIES BOTH SUBJECTS — AND A STORE WHOSE OWN DRIVER WAS DELETED BORROWS ITS NEIGHBOUR |
| **D-142** | **ONE EVIDENCE RECORD PER RUN: A RUN PRODUCING SEVERAL DISTINCT REFERENCES HAS ALL BUT THE FIRST DROPPED, SILENTLY — AND NOTHING DOWNSTREAM CAN TELL A ONE-REFERENCE RUN FROM A TRUNCATED ONE.** Raised  |
| **D-146** | **"WHICH TENANCIES HOLD THE CORRECTED RECEIVER?" HAS NO ANSWER, THE ACK CANNOT BECOME ONE, AND OPTION B DOES NOT CLOSE IT.** Recorded 2026-08-06 with [`D-145`](D-145_UPDATE_RECEIVER_DELIVERY_DEADLOCK_ |
| **D-147** | **`publishWorkPaths` HAS NO CALLER OUTSIDE ITS OWN TESTS, SO THE ROTATION CARRIER CANNOT BE RUN AGAINST THE DEPLOYED STORE AT ALL.** Measured 2026-08-06 while attempting exactly that. A census across  |
| **D-148** | **THE TWO DEPLOYMENT DESCRIPTORS DISAGREE ABOUT WHERE READINESS POINTS, AND THE ONE THAT IS WRONG RE-CREATES THE EXACT CONDITION `HealthController` WAS WRITTEN TO REMOVE.** Recorded 2026-08-06, found  |
| **D-149** | **THE WORKING TREE IS PERMANENTLY DIRTY FROM REGENERATOR OUTPUT, AND IN `git status` A TIMESTAMP-ONLY DIFF IS INDISTINGUISHABLE FROM A CHANGED VERDICT.** Measured 2026-08-06 classifying **every** dirt |
| **D-144** | **EVERY "IS DONE" IN THIS PROGRAMME'S STATE FOR THE LAST 31 COMMITS IS TRUE OF THE COMMIT AND FALSE OF THE DEPLOYMENT, AND NOTHING ON EITHER SIDE SAYS SO.** Measured 2026-08-06 **only because the Exec |
| **D-145** | **THE CORRECTED UPDATE RECEIVER CAN ONLY BE ANNOUNCED THROUGH THE RECEIVER IT CORRECTS, AND EVERY EXISTING TENANT HOLDS THE BROKEN ONE.** Raised 2026-08-06 by the Execution Plane, immediately after th |
| **D-143** | **THE EXECUTION PLANE'S OBLIGATION REGISTER NUMBERS TWO DIFFERENT OBLIGATIONS `OBL-003` AND TWO DIFFERENT OBLIGATIONS `OBL-004`, AND THE AMENDMENT REQUEST CITES THAT RANGE AS THOUGH IT WERE UNAMBIGUOU |
| **D-127** | **EVERY EVIDENCE ARTEFACT BACKING A CERTIFIED VERDICT IN THE FINAL CERTIFICATION REGISTER IS UNTRACKED, THE REGISTER CITES EACH BY CONTENT HASH, AND ONE OF THOSE HASHES CHANGED WITH NO COMMIT AND NO G |
| **D-076** | **ADR-0061 §6 CONTRADICTS ITSELF ABOUT ONE FILE, AND THE CONTRADICTION IS THE FINDING RATHER THAN THE BLOCKAGE.** Ruled 2026-08-05 and separated from D-075, which recorded it as a reason to stop. Four |
| **D-077** | **THE METHOD'S BOUNDARY, RECORDED BESIDE THE METHOD — A SYMBOL SCAN CANNOT SEE A FILE PATH OR THE ABSENCE OF A STRING, AND AT LEAST FIVE SURFACES SIT IN THAT BLIND SPOT.** Ruled 2026-08-05. Section G' |
| **D-078** | **THE CUT-OVER READINESS VERDICT HAS NEVER BEEN COMPUTED — *"NINE OF TEN UNMET"* IS A TEST FIXTURE, AND THE ONE TIME IT WAS MEASURED THE ANSWER WAS EIGHT.** Measured 2026-08-05. `assessCutoverReadines |
| **D-079** | **RC-3 DETECTS A NAME, NOT A ROUTING — SO THE REROUTE THAT WILL ACTUALLY HAPPEN LEAVES IT GREEN.** Measured 2026-08-05. `verify-runtime-cutover-readiness.js:84–86` tests `/(runtime-entry-point-bridge\ |
| **D-074** | **THE FOURTEENTH SCOPE CORRECTION — AN EVIDENCE ARTEFACT ASSERTING ITS OWN VALIDITY AGED SILENTLY, AND THE COMMIT THAT AGED IT WAS THE ONE DISCHARGING THE PLAN IT SERVED.** `governance/capability/reti |
| **D-073** | **THE ELEVENTH SCOPE CORRECTION — THE OWNERSHIP TEST WAS STATED WITH ONE FAILURE MODE AND HAS TWO, AND THE MISSING ONE WAS ASSERTED AS THE REASON RULING 3 DIFFERED.** ADR-0076 §4.2.1 introduced the te |
| **D-072** | **RULING 3's NARROWING FAILS THE SAME OWNERSHIP TEST AS RULING 2's — FOR A STRUCTURALLY DIFFERENT REASON, AND THE COMPILER SAID SO.** ADR-0076 §4.3 item 11 rules `PlatformEvent.stageRef` narrowed from |
| **D-071** | **RULING 2's NAMED SOURCE IS NOT THE SPI REGISTRY IT WAS ASSUMED TO BE — THREE ENTRIES AGAINST ELEVEN NAMES IN LIVE USE.** ADR-0076 §4.2 item 9 rules that `toolContracts` SHALL be narrowed to *"a unio |
| **D-069** | **THE TENTH SCOPE CORRECTION, AND THE FIRST INSIDE AN *ACCEPTED* ADR: §4.1.2 PRICED THE BOARD PORT AS A COMPOSITION STEP, AND IT IS A PROJECTION BETWEEN TWO TYPE FAMILIES THAT HAVE NEVER BEEN CONNECTE |
| **D-070** | **THE BOARD PORT — ITS OWN CHANGE, SCOPED AND OWED. NOT A1's REMAINDER.** A projection from `CanonicalCapabilityResult` (fourteen domain result types) to `ReviewSnapshot` (fourteen agent-path model ty |
| **D-066** | **ARCHITECTURE REVIEW IS THE ONE GOVERNANCE-TRIAD STAGE WHOSE VERDICT `certify()` NEVER READS — IT IS CHECKED FOR PRESENCE AND FOR NOTHING ELSE. PROVED BY OBSERVATION, THROUGH THE REAL FRAMEWORK.** Fo |
| **D-064** | **THE COVERAGE DENOMINATOR'S PROVENANCE WAS STRUCTURALLY INVISIBLE TO EVERY MECHANISM IN THE PLATFORM, BECAUSE A PRE-SPLIT ARRAY AND A SPLIT ARRAY ARE THE SAME TYPE.** Recorded 2026-08-05 as its own e |
| **D-065** | **THE ADR INDEX IN `DECISIONS.md` IS SIX ENTRIES BEHIND THE ADRs ON DISK — NOT FOUR — AND NOTHING COMPARES THEM.** Measured 2026-08-05 **by diffing the index's rows against `docs/adr/` rather than by  |
| **D-060** | **FOUR OF FIVE INTERPRETATION CAPABILITIES ARE NOW COMPOSED AND STILL UNREAD.** ADR-0075 composed `observation-interpretation` third and wired ONE consumer: `story-intelligence` derives its acceptance |
| **D-061** | **THE DOMAIN'S DECLARED INPUT CONTRACT IS NOT THE TYPE IT CONSUMES, AND THE MAPPING BETWEEN THEM HAS NO HOME.** `sovereignty-register.json` declares `observation-interpretation`'s `inputContract` as * |
| **D-062** | **EIGHT OF THIRTEEN DOMAINS DECLARE A STAGE THEY DO NOT RUN IN, AND THREE NAME SOMETHING THAT IS NOT A STAGE.** Measured 2026-08-05 while placing the fourteenth. Each domain's completed-event declares |
| **D-063** | **`rawBusinessRules` AND `rawDependencies` STILL ARRIVE PRE-INTERPRETED — THE SHAPE ADR-0075 REMOVED FROM THE CRITERIA, PRESENT TWICE MORE IN THE SAME TYPE.** `RequirementInput` lost `rawAcceptanceCri |
| **D-058** | **A `failureHandling` CAN DESCRIBE AN OPERATION THE AGENT DOES NOT PERFORM — A FOURTH ANSWER TO D-024's QUESTION, WHICH ADMITS ONLY TWO.** D-024 asks *could the platform have honoured this when it was |
| **D-052** | **THE TWO SYNCHRONISATION PHASES ARE COLLAPSED ON THE CANONICAL RUNTIME, AND THE AGENT PATH'S OWN HEADER ARGUES AGAINST IT.** `syncOrchestrator` states the rule it was built to keep: *"TWO PHASES, AND |
| **D-053** | **EVERY CANONICAL TEST CASE IS LINKED TWICE TO ONE WORK ITEM, BECAUSE THE STORY AND THE REQUIREMENT ARE THE SAME IDENTIFIER.** Measured at `4d79e59` from the ordered adapter call sequence: 8 `linkWork |
| **D-046** | **A TYPE WHOSE NAME SAYS LESS THAN ITS SHAPE, AND IT COST F3 AN OPEN ITEM.** `RequirementInput` — the canonical runtime's entry value — carries `id`, `title`, `statement`, `rawAcceptanceCriteria`, `ra |
| **D-037** | **THE CANONICAL SEQUENCE RESOLVES A REFERENCE IT NEVER READS, AND CANNOT READ.** `tenant-resolution` produces `configurationRef: string` — in the reference input, `'vault://config/t1'`, **a vault URI* |
| **D-036** | **THE CANONICAL RUNTIME IS A REDUCED CAPABILITY, NOT A RE-ARRANGED ONE — three independent measurements now say so.** *(i)* **D-031, fields:** the canonical `TestCase` lacks `title`, `businessGoal`, ` |
| **D-035** | **FIFTEEN OF THE TWENTY "TRIAD AGENTS" ARE GENERATORS, NOT REVIEWERS — AND WIRING THEM INTO THE TRIAD WOULD HAVE BUILT PRODUCER-REVIEWS-SELF INTO THE GOVERNANCE TRIAD.** Found 2026-08-04 by reading wh |
| **D-034** | **THREE AGENTS ASSUME A TEST CASE EXISTS BECAUSE, UNTIL THIS TURN, IT ALWAYS DID.** Found 2026-08-04 by the pre-port sweep, before porting, on the instruction to look for inferences that held only whi |
| **D-033** | **A FIELD NOBODY READS CANNOT BE FOUND WRONG BY USE.** Two instances, four days apart, both found only while changing the field for another reason. *(i)* `requirementMapping: string` — produced once p |
| **D-032** | **TWO OF THE FOUR FIELDS RULED FOR ENRICHMENT HAVE NO SOURCE IN THE CANONICAL CHAIN — AND THE NARROWING IS AT DOMAIN 4, NOT DOMAIN 6.** Traced 2026-08-04 before enriching, on the instruction that a do |
| **D-031** | **TWO DIFFERENT TYPES ARE BOTH CALLED `TestCase` IN ONE PACKAGE, AND THE CANONICAL ONE CARRIES STRICTLY LESS THAN THE DESIGN-SYNC AGENTS REQUIRE.** Found 2026-08-04 by the pre-port shape trace, before |
| **D-030** | **`SyncReport.status` CANNOT BE ANYTHING BUT `SUCCESS`, AND THE AGENT THAT PRODUCES IT DECLARES OTHERWISE.** Found 2026-08-04 by the pre-port sweep of the nine `designSyncAgents`, before any porting.  |
| **D-029** | **WHERE A FIELD IS A TYPE-LEVEL LITERAL, EVERY AGGREGATE OVER IT IS A COUNT OF ATTEMPTS WEARING THE NAME OF OUTCOMES.** Third instance in two sections. *(i)* `agents/design-sync.ts` — `if (adapter.lin |
| **D-028** | **THE DESIGN-SYNCHRONISATION SPI HAS THE SAME DEFECT ADR-0072 JUST REMOVED FROM ITS SIBLING — and ADR-0072 did not touch it.** `TestDesignSyncAdapter` (`capability-framework/src/adapters.ts`) returns  |
| **D-027** | **A TEST CAN ENCODE THE DEFECT IT APPEARS TO GUARD AGAINST.** Two instances, both found 2026-08-04 by making `defect-management`'s `eligible` field discriminate for the first time. *(i)* `assert.ok(r. |
| **D-026** | **A NEGATIVE-PATH VARIANT WITH NO ASSERTION ON ITS OUTPUT IS ONE REFACTOR AWAY FROM EXERCISING NOTHING — and that is exactly what happened.** Variant F (`referenceDependencies('F')`) exists for one pu |
| **D-025** | **AN OVER-PERMISSIVE PATTERN MATCHES A DIFFERENT THING THAT LEGITIMATELY HAS THE SAME SHAPE — twice, in two different tools, four days apart in one session.** *(i) The closure-package guard.* Written  |
| **D-022** | **A DESIGN REPORT'S BLAST-RADIUS ESTIMATE WAS WRONG BY AN ORDER OF MAGNITUDE, AND REVIEW DID NOT CATCH IT — IMPLEMENTATION DID.** The ADR-0071 design report stated the refusal primitive's surface as * |
| **D-021** | **TWO CERTIFICATION MECHANISMS RETURN OPPOSITE ANSWERS FOR THE SAME RUN, AND NO ARTEFACT SAYS WHICH GOVERNS.** Measured 2026-08-04 on the canonical runtime, reference input, one execution: `certify()` |
| **D-020** | **THE AGENT NAMED FOR THE PLATFORM'S CERTIFICATION STEP DOES NOT RUN AT THE CERTIFICATION STAGE.** `governance.final-certification`, in `agents/review-board.ts`, declares `stage: 'reporting'`. The fra |

**A debt register at zero is not a good sign** unless something looked hard enough to
find one. These were found by measurement, not review.

## Deliberate limits — not gaps, and they will not close

| Limit | Why it is permanent |
|---|---|
| No inbound connectivity into a customer tenancy | The boundary the platform exists to hold (INV-3). |
| The platform stores no customer source, data, media or secrets | Same. Verified on every build. |
| Unsupported technology combinations are refused | A profile that parses is not a profile that can be built. |
| Registration credentials are single-use | A reusable credential is an API key with a different name. |
| Platform Intelligence performs no remediation | C-24.9. Closing the loop turns a read-only surface into an unaudited control plane. |

## Relationship to the customer-facing register

[`docs/customer-success-package/KNOWN-LIMITATIONS.md`](../docs/customer-success-package/KNOWN-LIMITATIONS.md)
is generated for customers and covers what affects **them**. This register is internal
and covers the whole programme. They are not duplicates and neither is authoritative
for the other's scope.

---

*Generated from 7 evidence sets, implementation status and the debt register.*
