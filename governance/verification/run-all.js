#!/usr/bin/env node
'use strict';
/**
 * GOVERNANCE VERIFICATION SUITE — runner.
 * ============================================================================
 * Reports every check as PASS, FAIL, or NOT RUN. **NOT RUN is treated as FAIL**
 * (C-0.4): a check that was never asked to run provides no assurance, and silence
 * must not read as success. This is the state the predecessor's tooling lacked —
 * its dashboard stayed green throughout the period one of its fitness tests was
 * failing, because the workflow triggered on branches where nobody worked.
 *
 * Checks are GATING or INFORMATIONAL. An informational finding must name the
 * decision blocking it (R-18.13), so the suite can be honestly green while a real
 * finding stays open — rather than forcing a choice between a permanently red
 * build and a silenced check.
 *
 * Run:  node governance/verification/run-all.js
 * Exit: 0 = every gating check passed   1 = at least one gating failure
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const CHECKS = [
  { script: 'verify-architecture-integrity.js', label: 'canonical architecture set integrity', gating: true },
  { script: 'verify-adr-completeness.js', label: 'ADR completeness and decision traceability', gating: true },
  { script: 'verify-ai-vendor-neutrality.js', label: 'AI tool agnosticism — capability, not product', gating: true },
  { script: 'verify-implementation-traceability.js', label: 'implementation traceability to frozen architecture', gating: true },
  { script: 'verify-change-control-completeness.js', label: 'change control completeness — declared changes were made', gating: true },
  // The sibling property that `verify-change-control-completeness`'s widening traded away (D-126).
  // Its connectivity check scans `program/` WHOLESALE — correctly, because the narrow version cried
  // wolf — which made "mentioned in any state file" indistinguishable from "named by the index".
  // Seven ADRs including ADR-0080 sat unindexed with three gates over the estate and none over the
  // index. RED and escalated (R-18.12): the seven missing rows are real, and each is a SUMMARY OF A
  // DECISION ITS AUTHOR MUST WRITE — nobody can write the summary of a decision they did not take,
  // so back-filling them is refused (D-126). ADR-0040's status literal `COMPLETE` and ADR-0067's
  // two-cell row are the other two findings, both pre-existing and both owed a ruling.
  { script: 'verify-decision-index.js', label: 'decision index derived from disk (D-126, D-107) — every ADR is named by the index, every named ADR exists, every status is readable, and the index agrees with the file [RED & escalated, R-18.12]', gating: true },
  { script: 'verify-governance-self-validation.js', label: 'governance self-validation — every gate proved', gating: true },
  // Added because a test that does not RUN rendered as green at every level this suite reads:
  // two readings of one workspace suite gave 409 and 413 tests, both `fail 0`, both EXIT 0
  // (D-068). Fault injection cannot detect a probe that was never loaded, so D-008's remedy
  // does not reach this. Checks a DROP, never a pinned expected count.
  { script: 'verify-suite-integrity.js', label: 'suite integrity (D-068) — every declared test is compiled and no suite shrank: a test that does not run must not read as a test that does not fail', gating: true },
  // ADR-0076 §4.2 as RULED: the SPI namespace is OPEN, so this checks RESOLUTION rather than
  // membership of a framework-owned list — item 9's narrowing has no implementation where the
  // framework does not own the valid set (D-071). RED and escalated (R-18.12, P-002): the three
  // phantom contracts are real defects whose replacement is the owning capability's decision.
  { script: 'verify-tool-contracts.js', label: 'tool contracts (D-058) — every declared SPI name resolves to an SPI that exists; the namespace is open, so resolution is checked, not membership [RED & escalated, R-18.12]', gating: true },
  // ADR-0076 §4.3 item 14 (D-062). `F-7`'s sentence, for domains: it passed over 144 agents
  // because `AgentDefinition.stage` is typed, and was unenforced for domains because
  // `PlatformEvent.stageRef` is `string` in a package the stage vocabulary depends ON.
  { script: 'verify-architecture-fitness.js', label: 'architecture fitness — invariants still hold', gating: true },
  { script: 'verify-contract-compatibility.js', label: 'consumer contract compatibility', gating: true },
  { script: 'verify-supply-chain.js', label: 'trusted software supply chain (partial)', gating: true },
  { script: 'verify-traceability.js', label: 'architecture coverage and enterprise traceability', gating: true },
  { script: 'verify-operational-readiness.js', label: 'operational readiness (partial)', gating: true },
  { script: 'verify-customer-readiness.js', label: 'customer readiness (partial)', gating: true },
  { script: 'verify-production-readiness.js', label: 'production readiness (partial — GA not certified)', gating: true },
  { script: 'verify-general-availability.js', label: 'General Availability — the claim matches the evidence', gating: true },
  /*
   * TWO GATES REMOVED AT ADR-0061 §6 step 6 / ADR-0077. Each lost its SUBJECT, not its
   * correctness, and each is recorded here because a gate that disappears without a reason is
   * indistinguishable from a gate that was quietly found inconvenient.
   *
   * verify-agent-naming.js — asserted every agent id prefix resolves to a declared domain,
   *   every domain matches its prefix, every id is unique. It ran over the 144 agents reached
   *   through `engine.buildCatalogue()`. After step 6 there is no catalogue and there are no
   *   agents, and the gate did not fail — it THREW:
   *       TypeError: engine.buildCatalogue is not a function   (verify-agent-naming.js:74)
   *   A throw is not a red. It exits non-zero with no property named, which reads in a log as
   *   a broken harness rather than a governed absence. Deleted rather than guarded, because a
   *   guard would have produced the second gate's failure instead — see below.
   *
   * verify-canonical-agent-dormancy.js — asserted the canonical runtime imports and invokes no
   *   agent, so the migration findings deferred in AGENT_MIGRATION_BAR.md stayed deferrable
   *   (D-045). Measured after step 6 it PASSED, and its pass is the reason it is gone:
   *       "RESULT: PASS — only the ruled design-synchronisation placement is reachable;
   *        135 agents remain dormant."
   *   The 135 is a HARD-CODED LITERAL in the gate's own output (lines 22, 50, 195, 199). It
   *   counts nothing. With the agent modules deleted, "no agent module is reachable from the
   *   canonical surface" is trivially true, so the gate reported a green about the dormancy of
   *   135 agents that no longer exist. D-015's class exactly, and a stale pinned literal of the
   *   kind verify-suite-integrity's own header was written against.
   *
   *   THE DORMANCY PROPERTY IS NOT LOST — it is discharged. Dormancy mattered because 135
   *   agents existed and had to be proved unreachable. Deletion is a stronger guarantee than
   *   dormancy: unreachable-because-absent needs no gate.
   *
   *   BOTH SUCCESSORS NAMED IN THIS BLOCK ARE THEMSELVES GONE — see the Functional Testing
   *   removal below. The nine surviving design-sync agents lived in the Functional Testing
   *   Engine and were removed with it, and the retirement inventory measured reachability INTO
   *   retired Functional Testing modules. Both sentences were true when written and expired
   *   when their subject went (CHARTER §17.1.3). The expiry costs no coverage: the modules
   *   whose reachability they measured no longer exist.
   */
  /*
   * THE FUNCTIONAL TESTING ENGINE AND ITS THIRTY-TWO GATES WERE REMOVED.
   *
   * Capability 1 (`packages/functional-testing-engine`) was deleted in full, and with it every
   * control whose SUBJECT was that capability — recorded here for the same reason as the two
   * above: a gate that disappears without a reason is indistinguishable from a gate that was
   * quietly found inconvenient.
   *
   * Removed with the capability, by class:
   *   - The fourteen ADR-0039/ADR-0075 per-domain gates (tenant-resolution, application-strategy,
   *     observation-interpretation, story-intelligence, test-design, repository-intelligence,
   *     test-management, automation-intelligence, automation-architecture, execution, healing,
   *     defect-management, synchronisation, executive-reporting). Each read its domain's source
   *     out of the engine tree.
   *   - The lifecycle gates certifying that capability's activation and cut-over: ADR-0044
   *     activation, ADR-0045 production qualification, ADR-0046 legacy-retirement readiness,
   *     ADR-0048 canonical runtime integration, ADR-0050 runtime enablement, ADR-0077 authoring
   *     cut-over readiness, and the ADR-0039 certification framework.
   *   - The three gates that EXECUTED the engine to measure a property — execution-contract,
   *     package-governance and reasoning-registry each imported `dist/src/index.js` and
   *     `authoring-bridge.mjs` and drove `authorViaFTE`. Their LABELS named the platform, but
   *     their SUBJECT was this capability: with the engine gone they cannot run at all. This is
   *     the case §17.1.2 exists for — a control whose scope is read off its label rather than
   *     its subject gets defended long after the thing it watched is gone.
   *   - capability-conformance, functional-completeness, intent-conservation, automation-executable,
   *     repository-handoff, automation-architecture, functional-workflow-substructure and
   *     domain-stage-ref, each of which resolved a path into the engine tree.
   *
   * §17.1.1's question was asked of each BEFORE removal, not after: every one turns
   * GREEN-BY-ABSENCE or throws once its subject is gone, so none could be left in the runner.
   *
   * WHAT WAS DELIBERATELY NOT REMOVED, because its subject is not this capability:
   *   - The ADR-0040 platform-contract gates (decision-engine, intelligence-models, reporting-model,
   *     platform-events, execution-contracts, connector-spi). They name `functional-testing` only
   *     inside FORBIDDEN regexes asserting that OTHER components stay capability-neutral. Those are
   *     guards on their own subjects; the token is one alternative among many, and dropping it
   *     would weaken a live control still governing capabilities 2-6.
   *   - verify-provider-platform.js, for the same reason (FORBIDDEN_MODULE).
   *   - verify-suite-integrity.js, whose subject is the workspace suite, not this capability.
   *   - `@dbiz/capability-framework`, which all six engines depend on and five still use.
   */
  // Present on disk but never registered, so three gates that pass have been proving nothing
  // to the suite. `verify-governance-self-validation` names this as "present but NOT RUN";
  // a gate the runner does not call is a gate the programme does not have.
  { script: 'verify-repository-hygiene.js', label: 'Repository hygiene — no placeholder, stub, temporary or suppressed code in the shipped tree', gating: true },
  { script: 'verify-ep-certification.js', label: 'Execution-Plane certification (EDR-4) — signed EP verdict verified, not browser-executed', gating: true },
  { script: 'verify-discovery-conformance.js', label: 'Discovery Flow Engine conformance — adapters invoked, two reasoning modes', gating: true },
  { script: 'verify-devchange-conformance.js', label: 'Dev-Change Engine conformance — a change reasoned about, its source never moved', gating: true },
  { script: 'verify-devchange-certification.js', label: 'Dev-Change Engine certification — measured evidence meets the enterprise bar', gating: true },
  { script: 'verify-performance-conformance.js', label: 'Performance Engine conformance — no load before the guardrail certifies, AI-optional', gating: true },
  { script: 'verify-sectest-conformance.js', label: 'Security Testing Engine conformance — verification only, exploitation refused at the boundary', gating: true },
  { script: 'verify-pentest-conformance.js', label: 'Penetration Testing Engine conformance — no packet before certification, no destructive probe on production', gating: true },
  { script: 'verify-pentest-completeness.js', label: 'Penetration Testing Engine runtime completeness — no dormant scanner, agent or orchestrator', gating: true },
  { script: 'verify-platform-certification.js', label: 'platform certification — the three-level report matches the measured evidence', gating: true },
  { script: 'verify-tenant-lifecycle-conformance.js', label: 'tenant lifecycle conformance — onboarding provisions the tenant; stages 8-14 pending, never assumed', gating: true },
  { script: 'verify-registration-conformance.js', label: 'EP↔IP registration & trust — OTC single-use, tenant-bound, hash-only-at-rest, audited', gating: true },
  // Added after a path traversal reached production-shaped code past 58 design-level gates: this one
  // drives the ASSEMBLED application over a raw socket, because the defect was in the transport
  // adapter and no gate that inspects source could see it. See the file header for the full account.
  { script: 'verify-http-surface.js', label: 'deployed HTTP surface — traversal refused, auth required, tenant scope honoured, headers/docs/body-limits/logging enforced over a real socket', gating: true },
  { script: 'verify-http-surface-parity.js', label: 'deployed HTTP surface parity (D-007) — every action and top-level path route() serves is mapped by a MOUNTED NestJS controller, and every route()-backed mapping is served: the tested surface and the deployed surface compared in both directions, because a business action implemented and tested in route() with no controller mapping 404s live while every test passes — which shipped three times (SUM actions, branding, application-templates); self-proving positive+negative (R-13.4)', gating: true },
  { script: 'verify-platform-contract-framework.js', label: 'ADR-0040 canonical platform contract framework — one definition per concept, versioned, acyclic dependency graph, no over-claimed state', gating: true },
  { script: 'verify-execution-contracts.js', label: 'ADR-0040 Wave 1 execution contracts — immutable context, domain contract, observational state; reference consumes all three', gating: true },
  { script: 'verify-connector-spi.js', label: 'ADR-0040 Wave 2 connector SPI framework — authentication/application-strategy/reporting SPIs, capability-neutral, governance metadata, reference-proven', gating: true },
  { script: 'verify-decision-engine.js', label: 'ADR-0040 Wave 3 Decision Engine — deterministic, rule-precedence, AI advisory-only, immutable decisions; capability-neutral', gating: true },
  { script: 'verify-intelligence-models.js', label: 'ADR-0040 Wave 4 intelligence models — repository + automation models, immutable, capability-neutral, single canonical definition', gating: true },
  { script: 'verify-reporting-model.js', label: 'ADR-0040 Wave 5 reporting model — immutable, capability-neutral, evidence-references-only, single canonical definition', gating: true },
  { script: 'verify-platform-events.js', label: 'ADR-0040 Wave 6 platform event + observability — immutable, observational-only, no business payload, capability-neutral', gating: true },
  { script: 'verify-provider-platform.js', label: 'ADR-0060 (Cloud-Native Provider Platform) — the additive Configuration/Storage/Secret/Distributed-State providers: one process.env reader, no @azure/* coupling, node:fs confined to storage/secret, Redis via an injected port, no runtime/legacy/gateway import (additive-only), tenant-partitioned; certified by an executed conformance suite; one image runs local/Docker/Azure by configuration only', gating: true },
  { script: 'verify-composition-root.js', label: 'the composition root carries what the surface declares (D-111) — every controller whose registration is CONDITIONED on an optional `ApiDeps` field is either wired by `composeApiDeps` or recorded as deliberately unmounted with a reason, and there is no third state. Exists because `GET /api/packages/{hash}` shipped declared, tested, documented and governed — and UNREACHABLE IN EVERY DEPLOYMENT, because the one place that decides what a deployment carries never set `packageStore`, and the whole suite was green over it. No gate could see it: parity compares SOURCE against decorators and cannot see a condition nothing satisfies, and the socket gate probed the routes it was written against. The defect lived BETWEEN the module and the deployment — one level out from the code every other gate inspects, and the same blind spot that let `DELETE /api/tenants/%2e%2e` survive 58 gates. Also asserts the store is obtained from `sealedPackageService()` so retention is running (R-06.13) and that the deployment supplies a purge alert sink that actually raises (R-06.15)', gating: true },
  { script: 'verify-data-sovereignty-store.js', label: 'ADR-0079 (The Retrievable Package Store) — document 06\'s FIRST measured subject in this plane: until the sealed package store existed, C-06.11 ("no C1 persists beyond the request") was satisfiable BY ABSENCE and every R-06.x/C-06.x was uncited by the whole suite. Measures, on the store: R-06.4\'s four conditions, R-06.5/C-06.3 (authorising ADR in the storing module\'s own source), R-06.9/C-06.6 (retention declared, within the C3 ceiling), R-06.12/C-06.7 (the declared value READ BY CODE — the "configuration theatre" the predecessor shipped), R-06.13/R-06.14/C-06.8 (scheduled purge with an executed unreadability proof), C-06.11, plus P-79.2 enforcement-by-ADDRESSING (no caller-supplied partition, no path constructed, no derived index), P-79.6 one refusal expression and P-79.7 no delivery state. SCOPED TO THIS STORE deliberately — a document-wide gate would report NOT MEASURED across most of its surface and be the second control-shaped literal. Certified by EXECUTION of the store suite, not by grep alone', gating: true },
  { script: 'verify-run-record-write-surface.js', label: 'ADR-0082 P-82.9 (The Run Record Write Surface) — P-82.3 rules that pending-ness must never depend on FETCHING, and until this gate that rule had no mechanism. The danger is not a badly-named method but a THIRD CAUSE entering an existing one: a field added "for diagnostics" recording when a package was FETCHED converts the store into the delivery record P-70.3 removed, WITHOUT FAILING A SINGLE TEST, because a delivery record and an evidence record have the same shape and differ only in what causes a write. Asserts: the surface is exactly two event-named write methods (onPackageAuthored, onEvidenceArrived); no general record()/save()/put()/write()/store()/log(); no event-discriminator field; and the PERMITTED CALLER SET of each method, in BOTH directions — no unpermitted module writes, and every permitted module still does (the D-122 shape, where a store had a writer with zero non-test callers and looked wired for as long as nobody asked). A CENSUS, NEVER A COUNT (CHARTER §17.1(i)): a gate whose passing condition is a literal number gets edited to make it green, and two call sites into a general record() would be worse than five into onEvidenceArrived. Scans code with COMMENTS STRIPPED — its first run went RED on the documentation of its own subject. Fault-proved in both directions', gating: true },
  { script: 'verify-operator-writer-census.js', label: 'Operator-writer census (D-147) — the P-82.9 caller census was built for exactly this class and SCOPED TO ONE STORE, so a sibling writer wired only by its tests passed every gate in this programme. D-141\'s pattern from the other direction: not two subjects sharing one driver, but one census not reaching a sibling — both are "the SET a control governs is implicit, so nobody can ask what is outside it". Multi-subject from ONE enumeration (the 677ec4a / P-82.8 shape): every property runs PER SUBJECT, an EMPTY enumeration fails closed, and an enumerated subject absent from disk FAILS rather than passing vacuously. Adds the property the run-record gate never needed — REACHABILITY — because its subject always had callers, so "no unpermitted caller" and "every permitted caller still writes" were together sufficient; they both pass VACUOUSLY for a writer nothing drives, which is D-147\'s exact state. Reachability is deliberately NOT permission: the first draft conflated them and reported a writer driven by an unpermitted caller as unreachable. It was KNOWINGLY RED on work-path-distribution — a gate that went green over an undrivable distributor would assert a capability this platform does not have — and that red is now CLOSED by the route D-147 ruled: POST /api/work-paths sweeps on demand, GET /api/work-paths asks without writing, both platform-admin and mounted unconditionally. The gate went green ON ITS OWN SUBJECT, which is the proof rather than the claim. The reachability property is KEPT rather than retired with the instance that motivated it (CHARTER §17.1.1). Its first run found the asymmetry it was written to find: publishVerificationKeys IS driven at boot from the composition root, and its deliberately-parallel sibling publishWorkPaths is driven by nothing', gating: true },
  { script: 'verify-programme-closure.js', label: 'programme closure baseline — no silent amendment', gating: true },
  { script: 'verify-intelligence-plane-egress.js', label: 'Intelligence-Plane egress (R-3.2 enforcement mechanism 3, the one CHARTER §6 required and the platform did not have) — no IP source opens an outbound connection to a customer system, and no IP manifest declares an HTTP client; four cases separated: platform-infrastructure egress allowlisted per file AND per host with a recorded rationale (an entry without one is a bypass and the gate refuses to run), browser-context code classified from its manifest, emitted template text invisible by construction via the shared live-code stripping, test harnesses dialling loopback exempt from calls but never from client imports; self-proving positive+negative (R-13.4)', gating: true },
  { script: 'verify-execution-plane-boundary.js', label: 'Execution-Plane boundary (GOVERNANCE-EPIP-002) — the Intelligence Plane contains no browser/load/scan capability, "even dormant, even unreferenced" (R-3.5): tree-wide manifest dependency ban + live-code source scan (comments/strings/template/regex stripped, import specifiers + ${} preserved) so generation (the emitter) and detection (the gates) never false-positive; self-proving positive+negative (R-13.4), fail-closed; the tree-wide leg of enforcement mechanism (2) that CI-5/RE-4 cover only at the runtime seam', gating: true },
];

// Findings deliberately not gating. Each MUST name what blocks it (R-18.13).
const OPEN_FINDINGS = [];

const results = CHECKS.map((c) => {
  const file = path.join(__dirname, c.script);
  if (!fs.existsSync(file)) return { ...c, state: 'NOT RUN', out: 'check script absent' };
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  if (r.error || r.status === null) return { ...c, state: 'NOT RUN', out: String(r.error || 'no exit status') };
  return { ...c, state: r.status === 0 ? 'PASS' : 'FAIL', out: r.stdout || '' };
});

console.log('\n' + '='.repeat(78));
console.log('GOVERNANCE VERIFICATION SUITE');
console.log('='.repeat(78));

for (const r of results) {
  console.log(`\n  [${r.state.padEnd(7)}] ${r.label}`);
  console.log(`            ${r.script}${r.gating ? '' : '   (informational)'}`);
}

// NOT RUN counts as FAIL for gating purposes — the whole point of the third state.
const gating = results.filter((r) => r.gating);
const failed = gating.filter((r) => r.state !== 'PASS');

console.log('\n' + '='.repeat(78));
console.log('Gating checks:');
for (const r of gating) console.log(`  ${r.state === 'PASS' ? 'PASS' : 'FAIL'}  ${r.script}${r.state === 'NOT RUN' ? '  (NOT RUN — treated as FAIL)' : ''}`);

console.log('\nOpen findings (informational — each names its blocking decision):');
if (OPEN_FINDINGS.length === 0) console.log('  none');
else for (const f of OPEN_FINDINGS) console.log(`  ${f.id}  ${f.summary}  -> blocked on ${f.blockedOn}`);

console.log('\n' + '='.repeat(78));
if (failed.length) {
  console.log(`RESULT: FAIL — ${failed.length} gating check(s) did not pass.`);
  for (const r of failed) console.log(r.out);
  process.exit(1);
}
console.log(`RESULT: PASS — ${gating.length} gating check(s) green.`);
console.log('');
process.exit(0);
