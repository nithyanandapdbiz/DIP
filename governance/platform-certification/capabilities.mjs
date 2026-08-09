/**
 * The six canonical capabilities, and how to DISCOVER and measure each.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §3 (the six capabilities, frozen)
 *   ADR          : ADR-0025 (platform certification framework)
 *   Criteria     : C-11.4 (exactly six capabilities) · C-13.3 (evidence over assertion)
 *
 * THIS FILE ENCODES THE EXPECTED SET AND HOW TO FIND ITS PARTS — NEVER THE OUTCOME.
 * The six entries are the architecture's own capability list (document 11 §3), frozen and
 * hash-baselined. What is NOT encoded is whether any passes, nor the exact filenames of
 * its gates and evidence — those DRIFT as the concurrent engines land under names this
 * file cannot predict. So each capability declares `match` patterns, and the harness
 * discovers its gates and evidence by scanning the governance directories at run time.
 *
 * WHY DISCOVERY RATHER THAN A HARDCODED GATE NAME.
 * The previous revision hardcoded `verify-dev-change-conformance.js`; the engine actually
 * shipped as `verify-devchange-conformance.js`. A stored name that no longer resolves
 * makes a real, passing capability read as "no gate" — a false NOT CERTIFIED, which is
 * the same class of untruth as a false CERTIFIED. The framework must reconcile against
 * what is on disk, which is the brief's own instruction: recompute from source, trust no
 * stored table.
 */

/** The Level-1 dimensions every capability is measured against (from the brief). */
export const LEVEL1_DIMENSIONS = [
  'architecture', 'compilation', 'runtime', 'tests', 'conformance-gates',
  'runtime-completeness', 'agent-reachability', 'adapter-reachability', 'workflow',
  'governance', 'security', 'data-sovereignty', 'ep-ip-ownership',
  'ai-enabled-mode', 'ai-disabled-mode', 'provider-adapters',
  'telemetry', 'audit', 'evidence', 'learning',
];

/**
 * The maturity ladder, lowest to highest. A capability's maturity is the highest rung it
 * can stand on given what was measured — never a rung a document claims.
 */
export const MATURITY_LEVELS = [
  'not-started',            // no package on disk
  'implementation-present', // package exists
  'compiles',               // tsc --noEmit clean
  'tests-passing',          // its own test suite is green
  'runtime-complete',       // its runtime-completeness gate passes
  'conditionally-certified',// builds + tests + gates pass, but a dimension is unmeasured
  'certified',              // every declared gate green and every conformance property observed
];

/**
 * The canonical capabilities. `number` and `name` are document 11 §3 verbatim.
 *
 * `match` is an array of case-insensitive substrings; a governance file (a gate under
 * `governance/verification/` or an evidence JSON under `governance/capability/`) belongs
 * to the capability if its basename contains any of them. Patterns are chosen to be
 * specific enough not to collide — "devchange"/"dev-change" will not match "discovery".
 *
 * CAPABILITY 1 (Functional Testing Engine) WAS REMOVED, along with its package and its
 * thirty-two gates; the retirement is recorded in `governance/verification/run-all.js`.
 *
 * THE SURVIVORS KEEP THEIR ORIGINAL NUMBERS AND THE LIST STARTS AT 2 — deliberately, and it
 * is not an oversight to be tidied. A capability number is an IDENTITY, not a position: it is
 * cited verbatim by document 11 §3, by every certification report, by the evidence JSONs and
 * by the ADRs. Renumbering to close the gap would silently re-point every one of those
 * citations at a different capability, which is a far worse defect than a list beginning at 2.
 *
 * CONSUMERS DERIVE COUNTS FROM `.length`, SO THE COUNT IS PART OF THE CONTRACT, NOT AN
 * INCIDENTAL. `run-platform-certification.mjs` (P-4, S-1), the three capability conformance
 * runners (P-10/PP-10) and `verify-architecture-fitness.js` all compared against the literal
 * 6 and were amended to 5 with this removal — see ADR-0087. A `.length` that silently changed
 * under gates still asserting 6 would have turned the whole certification suite red for a
 * reason none of them named.
 */
export const CANONICAL_CAPABILITIES = [
  {
    number: 2, id: 'dev-change', name: 'Dev-Change Engine',
    package: 'dev-change-engine',
    match: ['devchange', 'dev-change'],
  },
  {
    number: 3, id: 'inverse-flow-discovery', name: 'Inverse-Flow Discovery Engine',
    package: 'discovery-flow-engine',
    match: ['discovery'],
  },
  {
    number: 4, id: 'performance', name: 'Performance Engine',
    package: 'performance-engine',
    match: ['performance'],
  },
  {
    number: 5, id: 'security-testing', name: 'Security Testing Engine',
    package: 'security-testing-engine',
    match: ['security-testing', 'sectest'],
  },
  {
    number: 6, id: 'penetration-testing', name: 'Penetration Testing Engine',
    package: 'penetration-testing-engine',
    match: ['pentest', 'penetration'],
  },
];

/**
 * A gate is a "completeness"/"runtime" gate rather than a conformance gate. Used to map a
 * capability's gates onto the runtime-completeness dimension specifically.
 */
export const COMPLETENESS_GATE = /completeness|runtime/i;

/**
 * How a capability's evidence properties map onto the Level-1 dimensions.
 *
 * A dimension is CERTIFIED when every evidence property mapped to it was observed. A
 * dimension with no mapped property is NOT MEASURED — never assumed to pass. Patterns
 * match the property `id` or `property` text of whatever the capability's own gate
 * emitted, so a capability keeps its mapping as long as the text still describes the same
 * thing.
 */
export const DIMENSION_EVIDENCE = {
  workflow: [/twelve.stage|all twelve stages|traverses all twelve|canonical workflow|one workflow|stage sequence/i],
  governance: [/governance triad|certification is reach|nothing progresses|review.*decision.*certif|carries a review|stage carries/i],
  'data-sovereignty': [/sovereignty|no customer value|customer content|crosses by reference|attribute name|reference only|source.*never|never leaves|no source/i],
  'ep-ip-ownership': [/execution plane|ep\/ip|run in the execution|repository.*search.*execution|reaches the intelligence plane|owned by the execution/i],
  'runtime-completeness': [/domain orchestrator.*ran|no dormant|every.*executes|actually ran agents|actually invoked|runtime complete/i],
  'agent-reachability': [/audit trail names|actually invoked|agent that did not run|orchestrator.*ran agents|every.*agent.*execut|reachab/i],
  'adapter-reachability': [/adapter method.*invoked|declared adapter method|adapter.*actually invoked|every adapter|declared.*never/i],
  'ai-enabled-mode': [/ai and non-ai|same stages and the same agents|both mode|reasoning agent declares|ai.enabled|enriches|reasoning enriches/i],
  'ai-disabled-mode': [/no proposal is delivered|reasoning is disabled|non-ai run|without reasoning|reasoning unavailable|deterministic path|non-ai/i],
  'provider-adapters': [/two provider|providers produce identical|providers genuinely differ|identical stage sequence under|provider behaviour|only.*adapter.*var/i],
  evidence: [/crosses by reference|hash and locator|no content field|evidence.*reference|evidence.*captured/i],
  audit: [/audit trail|audit event|sealed.*audit/i],
  learning: [/learning kind|learning.*emit|declared learning|learns/i],
  'conformance-gates': [/certification gate|every stage.*certif|stage carries a review|refuses.*blocking|certification is reach|nothing progresses/i],
  telemetry: [/telemetry/i],
};
