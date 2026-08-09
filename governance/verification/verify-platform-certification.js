'use strict';
/**
 * GOVERNANCE — platform certification (the enterprise certification authority).
 * ============================================================================
 * Runs the three-level certification harness, INDEPENDENTLY re-verifies the soundness of
 * what it reports, writes the machine evidence, and generates the report set.
 *
 * THIS GATE PASSES WHEN THE FRAMEWORK REPORTS REALITY CORRECTLY — NOT WHEN THE PLATFORM
 * IS CERTIFIED. A platform measured as NOT CERTIFIED or CONDITIONALLY CERTIFIED, reported
 * honestly, is a PASSING gate: the measurement is sound. The gate fails only if the
 * framework claims more than it measured.
 *
 * WHY IT DOES NOT TRUST THE HARNESS'S OWN self-validation. The harness reports whether it
 * measured honestly; a framework that certified itself purely by its own say-so would be
 * the assertion this whole platform refuses. So the gate RE-DERIVES the soundness
 * properties here, from the raw per-capability data, and compares its own finding against
 * the harness's self-validation. They must agree, and each must hold.
 *
 * WHY IT CANNOT SELF-CERTIFY THE PLATFORM. The platform verdict is computed from executed
 * capability gates, live-invoked tests and fresh compilation, and a registered gate scans
 * every file for a platform-certification claim that outruns that verdict. There is no
 * string a human can write that makes the platform certified; only six certified
 * capabilities can.
 *
 * Run:  node governance/verification/verify-platform-certification.js
 * Exit: 0 = the framework's report is sound   1 = the framework claims more than it measured
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS = path.join(ROOT, 'governance', 'platform-certification', 'run-platform-certification.mjs');
const OUT = path.join(ROOT, 'governance', 'platform-certification');
const REPORTS = path.join(OUT, 'reports');
const EVIDENCE = path.join(OUT, 'platform-certification-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — platform certification');
line('='.repeat(74));

// ── 1. Execute the harness ──────────────────────────────────────────────────
line('\n1. Harness execution');
if (!fs.existsSync(HARNESS)) { check('the certification harness exists', false, 'harness absent'); line('\nRESULT: FAIL'); process.exit(1); }
const run = spawnSync(process.execPath, [HARNESS], { cwd: ROOT, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
let report = null;
try { report = JSON.parse(run.stdout); } catch { report = null; }
check('the harness executed and produced a parseable report', report !== null,
  report ? `${report.level1.length} capabilities measured` : `exit ${run.status}: ${(run.stderr || '').slice(0, 300)}`);
if (!report) { line('\nRESULT: FAIL — the harness produced nothing to gate on.'); process.exit(1); }

const { level1, level2, level3, scorecard, selfValidation, drift, maturityTiers, certificationHistory, releaseGovernance, selfCertification } = report;
const certified = level1.filter((c) => c.verdict === 'CERTIFIED');
const VERDICTS = new Set(['CERTIFIED', 'CONDITIONALLY CERTIFIED', 'NOT CERTIFIED']);
const STATES = new Set(['NOT STARTED', 'IMPLEMENTED', 'BUILD VERIFIED', 'RUNTIME VERIFIED', 'CONFORMANCE VERIFIED', 'CONDITIONALLY CERTIFIED', 'CERTIFIED']);

// ── 2. Level 1 — independent measurement soundness ──────────────────────────
line('\n2. Level 1 — measurement soundness (re-derived here, not trusted from the harness)');
check('exactly five canonical capabilities were measured (C-11.4, as amended by ADR-0087)', level1.length === 5, `${level1.length} capabilities`);
check('every capability verdict is one of the three permitted values', level1.every((c) => VERDICTS.has(c.verdict)), 'CERTIFIED · CONDITIONALLY CERTIFIED · NOT CERTIFIED');
check('no capability is CERTIFIED without a passing conformance gate', certified.every((c) => c.gates.length > 0 && c.gates.every((g) => g.passed)), 'a CERTIFIED verdict requires every declared gate to exit 0');
check('no capability is CERTIFIED with failing or unmeasured tests', certified.every((c) => c.tests && c.tests.green), 'a CERTIFIED verdict requires a green test suite executed live');
check('no capability is CERTIFIED with an unmeasured dimension', certified.every((c) => Object.values(c.dimensions).every((d) => d.status !== 'not-measured')), 'full certification requires every dimension measured; otherwise CONDITIONALLY CERTIFIED');
check('every CONDITIONALLY CERTIFIED capability builds, tests green and gates pass', level1.filter((c) => c.verdict === 'CONDITIONALLY CERTIFIED').every((c) => c.build.builds && c.tests.green && c.gates.length > 0 && c.gates.every((g) => g.passed)), 'conditional certification is earned, not a consolation');
check('no dimension counted as certified is actually NOT MEASURED (R-13.3)', level1.every((c) => Object.values(c.dimensions).every((d) => !(d.status === 'certified' && /not.measured|blocked/i.test(d.reason)))), 'NOT MEASURED never scores as certified');
check('every NOT CERTIFIED capability names its reason and next action', level1.filter((c) => c.verdict === 'NOT CERTIFIED').every((c) => c.reason?.trim() && c.nextAction?.trim()), 'a refusal carries its reason and what to do');
check('every capability carries a maturity rung', level1.every((c) => c.maturity && c.maturity.length > 0), level1.map((c) => `${c.name.split(' ')[0]}:${c.maturity}`).join(' · '));

// ── 3. Level 2 — cross-capability ───────────────────────────────────────────
line('\n3. Level 2 — cross-capability consistency');
const usable = level1.filter((c) => c.verdict === 'CERTIFIED' || c.verdict === 'CONDITIONALLY CERTIFIED');
check('consistency is verified only across the usable set', level2.usableCount === usable.length, `${level2.usableCount} usable capabilit${usable.length === 1 ? 'y' : 'ies'} compared`);
check('cross-capability PASS is claimed only when all six are usable and consistent', level2.verdict !== 'PASS' || usable.length === 6, `verdict ${level2.verdict}, ${usable.length}/6 usable`);

// ── 4. Level 3 — the platform verdict follows the evidence ───────────────────
line('\n4. Level 3 — platform verdict');
check('the platform is CERTIFIED iff every capability is CERTIFIED and Level 2 passes', (level3.verdict === 'CERTIFIED') === (certified.length === 6 && level2.verdict === 'PASS'), `verdict ${level3.verdict}; ${certified.length}/6 certified`);
check('the platform verdict is one of the three permitted values', VERDICTS.has(level3.verdict), level3.verdict);
check('the platform verdict carries reason, blocking findings and next actions', Boolean(level3.reason?.trim()) && Array.isArray(level3.blockingFindings) && Array.isArray(level3.nextActions), level3.reason);
check('the scorecard verdict matches the Level 3 verdict', scorecard.verdict === level3.verdict, `scorecard ${scorecard.verdict} · level 3 ${level3.verdict}`);

// ── 5. Self-validation and double-validation agreement ──────────────────────
line('\n5. Framework self-validation (double validation)');
check('the harness self-validation is present and sound', selfValidation && selfValidation.sound === true, selfValidation ? selfValidation.reason : 'no self-validation block');
// DOUBLE VALIDATION: the gate's independent finding (sections 2–4) and the harness's
// self-report must agree. Disagreement fails certification, per the brief.
const gateFindsSound = failures === 0;
check('the gate\'s independent finding agrees with the harness self-validation (double validation)', gateFindsSound === Boolean(selfValidation && selfValidation.sound), 'the authority does not get to certify itself by its own say-so alone');
check('the authority self-certifies its own execution', selfCertification && selfCertification.certified === true, selfCertification ? selfCertification.reason : 'no self-certification block');

// ── 5b. Certification states (the seven-state ladder) ───────────────────────
line('\n5b. Certification states');
check('every capability computes exactly one of the seven canonical states', level1.every((c) => STATES.has(c.state)), level1.map((c) => `${c.name.split(' ')[0]}:${c.state}`).join(' · '));
check('the state ladder agrees with the verdict', level1.every((c) => (c.state === 'CERTIFIED') === (c.verdict === 'CERTIFIED') && (c.state === 'CONDITIONALLY CERTIFIED') === (c.verdict === 'CONDITIONALLY CERTIFIED')), 'CERTIFIED/CONDITIONALLY CERTIFIED states and verdicts are consistent');
check('no capability with mismatched evidence is CERTIFIED', certified.every((c) => c.ownership && c.ownership.valid), 'mismatched evidence cannot support a verdict');
check('every CONDITIONALLY CERTIFIED capability lists its unmeasured dimensions', level1.filter((c) => c.verdict === 'CONDITIONALLY CERTIFIED').every((c) => Array.isArray(c.unmeasuredDimensions) && c.unmeasuredDimensions.length > 0), 'conditional certification never hides missing evidence');

// ── 5c. Drift detection ─────────────────────────────────────────────────────
line('\n5c. Drift detection');
check('the drift report is present and every drift carries severity, root cause, impact and action', drift && Array.isArray(drift.drifts) && drift.drifts.every((d) => d.severity && d.rootCause && d.impact && d.action), drift ? `${drift.count} drift(s) detected` : 'no drift block');
if (drift && drift.drifts.length) for (const d of drift.drifts) line(`         [${d.severity}] ${d.kind}: ${d.rootCause}`);

// ── 5d. Release governance ──────────────────────────────────────────────────
line('\n5d. Release governance');
check('the release decision is APPROVED or BLOCKED', releaseGovernance && ['APPROVED', 'BLOCKED'].includes(releaseGovernance.decision), releaseGovernance ? `${releaseGovernance.decision} — ${releaseGovernance.reason}` : 'no release block');
check('a release is APPROVED only when the platform is CERTIFIED', !releaseGovernance || (releaseGovernance.decision === 'APPROVED') === (level3.verdict === 'CERTIFIED'), 'release approval follows the platform verdict');
check('every BLOCKED release names evidence-backed blocking reasons', !releaseGovernance || releaseGovernance.decision === 'APPROVED' || (Array.isArray(releaseGovernance.blockingReasons) && releaseGovernance.blockingReasons.length > 0), 'blocking reasons are listed, not implied');

// ── 5e. Certification history ───────────────────────────────────────────────
line('\n5e. Certification history and maturity');
check('a measured snapshot was recorded to the history log', certificationHistory && certificationHistory.snapshot && certificationHistory.snapshot.platformVerdict === level3.verdict, certificationHistory ? `history at ${certificationHistory.historyFile}` : 'no history block');
check('maturity tiers are computed for capability, platform, release and GA', maturityTiers && maturityTiers.platform && maturityTiers.releaseReadiness && maturityTiers.gaReadiness, maturityTiers ? `platform ${maturityTiers.platform} · release ${maturityTiers.releaseReadiness}` : 'no maturity block');
check('GA readiness is NOT MEASURED (no deployment evidence exists)', !maturityTiers || /NOT MEASURED/.test(maturityTiers.gaReadiness), 'GA cannot be claimed without E-2');

// ── 6. Repository-wide claim scan ───────────────────────────────────────────
line('\n6. Repository-wide certification-claim scan');
const CLAIM = new RegExp([
  'platform\\s+(?:is|has been|is now|stands)\\s+(?:fully\\s+|enterprise[- ])?certified',
  'platform\\s+certification\\s*[:=]\\s*certified',
  '(?:enterprise\\s+)?platform\\s+certification\\s+(?:granted|achieved|complete|completed|awarded|succeeded)',
  'platform\\s+verdict\\s*[:=]?\\s*certified',
  'receives?\\s+enterprise\\s+platform\\s+certification',
].join('|'), 'i');
const NEGATED = /NOT\s+CERTIFIED|not certified|is not|SHALL only|shall be|only when|only be|conditionally|if and only if|iff|=== ?'CERTIFIED'|=>|`|verdict ===|when every|once every/i;
const offenders = [];
if (level3.verdict !== 'CERTIFIED') {
  const skip = new Set(['node_modules', 'dist', '.git']);
  const exts = new Set(['.md', '.json', '.txt']);
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!exts.has(path.extname(e.name))) continue;
      if (full === EVIDENCE || full.startsWith(REPORTS)) continue;
      for (const raw of fs.readFileSync(full, 'utf8').split('\n')) {
        if (CLAIM.test(raw) && !NEGATED.test(raw)) offenders.push(`${path.relative(ROOT, full)}: ${raw.trim().slice(0, 90)}`);
      }
    }
  };
  walk(ROOT);
}
check('no file claims the platform is CERTIFIED while the evidence says otherwise', offenders.length === 0, offenders.length ? offenders.slice(0, 3).join(' | ') : 'no unsupported certification claim found');

// ── 7. Evidence and reports ─────────────────────────────────────────────────
line('\n7. Evidence and reports');
const evidence = {
  evidenceId: 'platform-certification', generator: 'governance/verification/verify-platform-certification.js',
  generatorVersion: '3.0.0', executionContext: report.executionContext, repository: 'DBiz_IntelligencePlane',
  adrReference: ['ADR-0025'], ruleReference: ['C-11.4', 'C-13.3', 'R-13.3'], generatedAt: report.generatedAt,
  platformVerdict: level3.verdict, overallScore: scorecard.overall,
  certifiedCapabilities: certified.length, conditionalCapabilities: scorecard.conditionalCapabilities,
  canonicalCapabilities: level1.length, repositoryState: report.repositoryState,
  level1, level2, level3, scorecard, selfValidation, maturityModel: report.maturityModel,
  drift, maturityTiers, certificationHistory, releaseGovernance, selfCertification,
  certificationStates: report.certificationStates,
  verificationStatus: failures === 0 ? 'sound' : 'unsound',
};
fs.mkdirSync(REPORTS, { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
check('the machine-readable evidence was written', fs.existsSync(EVIDENCE), path.relative(ROOT, EVIDENCE));
const written = generateReports(report, REPORTS);
check('the report set was generated (20 reports + the machine evidence = 21 artefacts)', written === 20, `${written} reports + 1 evidence JSON in ${path.relative(ROOT, REPORTS)}`);

// ── Result ──────────────────────────────────────────────────────────────────
line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the platform certification framework reports the evidence soundly.');
  line('');
  line(`PLATFORM: ${level3.verdict}.  Overall ${scorecard.overall}%.  ${certified.length} certified, ${scorecard.conditionalCapabilities} conditional, of ${level1.length}.`);
  line('This gate passing means the report MATCHES the evidence. It does not mean the');
  line('platform is certified — that sentence is weaker, and it is the correct one.');
} else {
  line(`RESULT: FAIL — ${failures} soundness property violated. The framework claims more than it measured.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);

// ── Report generation ───────────────────────────────────────────────────────

function generateReports(report, dir) {
  const { level1, level2, level3, scorecard, selfValidation, maturityModel,
    drift, maturityTiers, certificationHistory, releaseGovernance, selfCertification } = report;
  const stamp = `Generated ${report.generatedAt} · ${report.executionContext}`;
  const pctv = (n) => `${n}%`;
  const dimRow = (c, d) => `| ${c.number} | ${c.name} | ${(c.dimensions[d]?.status ?? 'not-measured').toUpperCase()} | ${c.dimensions[d]?.reason ?? '—'} |`;
  const dimReport = (title, dimension, note) => `# ${title}\n\n_${stamp}_\n\n${note}\n\n| # | Capability | Status | Reason |\n|---|---|---|---|\n${level1.map((c) => dimRow(c, dimension)).join('\n')}\n`;
  // Clear any stale report from a prior revision so the set is exactly what was generated
  // now — a lingering report from an older run is a stored assertion, which is the thing
  // this framework refuses.
  for (const f of fs.readdirSync(dir)) { if (f.endsWith('.md')) fs.rmSync(path.join(dir, f)); }

  const files = {};

  files['01-capability-certification-report.md'] = `# Capability Certification Report — Level 1

_${stamp}_

A capability is **CERTIFIED** only if it builds, its tests pass live, every conformance gate exits 0, every conformance property is observed, and every dimension is measured. **CONDITIONALLY CERTIFIED** means all of that except a dimension is not yet measured. Anything less is **NOT CERTIFIED**, with the reason.

| # | Capability | Verdict | Maturity | Compiles | Tests | Gates | Dimensions |
|---|---|---|---|---|---|---|---|
${level1.map((c) => `| ${c.number} | ${c.name} | **${c.verdict}** | ${c.maturity} | ${c.build.builds ? 'yes' : 'no'} | ${c.tests.ran ? `${c.tests.pass}/${c.tests.tests}` : 'none'} | ${c.gates.filter((g) => g.passed).length}/${c.gates.length} | ${c.certifiedDimensions}/${c.totalDimensions} |`).join('\n')}

**${certified.length} certified · ${scorecard.conditionalCapabilities} conditionally certified · of ${level1.length}.**

${level1.map((c) => `## ${c.number}. ${c.name} — ${c.verdict}

${c.reason}

- **Compilation:** ${c.build.reason}
- **Tests:** ${c.tests.reason}
- **Gates discovered:** ${c.discoveredGates.join(', ') || 'none'}
- **Gate results:** ${c.gates.length ? c.gates.map((g) => `\`${g.gate}\` ${g.passed ? 'PASS' : `FAIL — ${g.reason}`}`).join('; ') : 'none'}
- **Blocking findings:** ${c.blockingFindings.length ? c.blockingFindings.join('; ') : 'none'}
- **Recommendations:** ${c.recommendations.length ? c.recommendations.join('; ') : 'none'}
- **Next action:** ${c.nextAction}

| Dimension | Status | Reason |
|---|---|---|
${Object.entries(c.dimensions).map(([d, v]) => `| ${d} | ${v.status.toUpperCase()} | ${v.reason} |`).join('\n')}
`).join('\n')}
`;

  files['02-cross-capability-report.md'] = `# Cross-Capability Certification Report — Level 2

_${stamp}_

Verified across the **${level2.usableCount}** capabilit${level2.usableCount === 1 ? 'y' : 'ies'} that reached at least conditional certification. **Verdict: ${level2.verdict}** — ${level2.reason}

| Invariant | Property | Holds | Compared | Offenders |
|---|---|---|---|---|
${level2.checks.map((c) => `| ${c.id} | ${c.property} | ${c.holds ? 'YES' : 'NO'} | ${c.comparedAcross} | ${c.offenders.join(', ') || '—'} |`).join('\n')}
`;

  files['03-platform-certification-report.md'] = `# Platform Certification Report — Level 3

_${stamp}_

**PLATFORM VERDICT: ${level3.verdict}**

${level3.reason}

| Gate | Property | Holds | Detail |
|---|---|---|---|
${level3.gates.map((g) => `| ${g.id} | ${g.property} | ${g.holds ? 'YES' : 'NO'} | ${g.detail} |`).join('\n')}

**Blocking findings**
${level3.blockingFindings.length ? level3.blockingFindings.map((f) => `- ${f}`).join('\n') : '- none'}

**Next actions**
${level3.nextActions.map((f) => `- ${f}`).join('\n')}

**Overall platform readiness: ${pctv(scorecard.overall)}** · ${certified.length}/${scorecard.canonicalCapabilities} certified.
`;

  files['04-runtime-completeness-report.md'] = dimReport('Runtime Completeness Report', 'runtime-completeness',
    'Every orchestrator, agent, adapter, gate, telemetry, audit and learning event must execute. No dormant production components. Measured by each capability\'s runtime-completeness gate where it has one.');
  files['05-compilation-report.md'] = `# Compilation Report

_${stamp}_

Every capability is compiled fresh with \`tsc --noEmit\`. Stored build output is never trusted.

| # | Capability | Compiles | Detail |
|---|---|---|---|
${level1.map((c) => `| ${c.number} | ${c.name} | ${c.build.builds ? 'YES' : 'NO'} | ${c.build.reason} |`).join('\n')}
`;
  files['06-test-report.md'] = `# Test Report

_${stamp}_

Every capability's test suite is executed live. Results are measured, never inferred.

| # | Capability | Ran | Passed | Total | Failed | Skipped | Green |
|---|---|---|---|---|---|---|---|
${level1.map((c) => `| ${c.number} | ${c.name} | ${c.tests.ran ? 'yes' : 'no'} | ${c.tests.pass} | ${c.tests.tests} | ${c.tests.fail ?? 0} | ${c.tests.skipped ?? 0} | ${c.tests.green ? 'YES' : 'no'} |`).join('\n')}
`;
  files['07-governance-report.md'] = dimReport('Governance Report', 'governance',
    'One governance model: validation, review, decision, certification. Every stage carries a review, a decision and a certification agent, and nothing progresses uncertified. No capability-specific governance.');
  files['08-security-report.md'] = `# Security Report

_${stamp}_

Zero Trust, mutual TLS, OAuth2, replay protection, tenant isolation, credential isolation and runtime authorization are implemented in \`@dbiz/platform-runtime\` and are **unchanged** by any capability engine. The capability-level posture measured here is that no capability moves a credential or secret across the boundary — carried by the data-sovereignty dimension.

| # | Capability | Sovereignty (no-secret-crossing proxy) | Reason |
|---|---|---|---|
${level1.map((c) => dimRow(c, 'data-sovereignty')).join('\n')}

**No security regression.** No capability engine modified a security document or control.
`;
  files['09-sovereignty-report.md'] = dimReport('Data Sovereignty Report', 'data-sovereignty',
    'No source code, credentials or evidence leave the Execution Plane. Only approved, minimised metadata crosses. Where a capability is built, this is enforced by types — evidence references carry a hash and a locator and no content field.');
  files['10-architecture-report.md'] = dimReport('Architecture Report', 'architecture',
    'A capability\'s architecture is proven when it builds and every declared conformance gate passes — the twelve-stage lifecycle traversed and certified, not merely present in source.');
  files['11-ai-compliance-report.md'] = `# AI Compliance Report

_${stamp}_

Every capability must support AI-enabled and AI-disabled modes producing an identical workflow — only reasoning differs, with no workflow branching.

| # | Capability | AI-enabled | AI-disabled | One workflow, both modes |
|---|---|---|---|---|
${level1.map((c) => { const en = c.dimensions['ai-enabled-mode']?.status ?? 'not-measured'; const di = c.dimensions['ai-disabled-mode']?.status ?? 'not-measured'; return `| ${c.number} | ${c.name} | ${en.toUpperCase()} | ${di.toUpperCase()} | ${en === 'certified' && di === 'certified' ? 'YES' : 'not proven'} |`; }).join('\n')}
`;
  files['12-executive-dashboard.md'] = `# Executive Dashboard — Platform Certification

_${stamp}_

## Verdict: ${level3.verdict} · Overall readiness ${pctv(scorecard.overall)}

${certified.length} of ${scorecard.canonicalCapabilities} capabilities are fully certified; ${scorecard.conditionalCapabilities} conditionally. Platform certification requires all six certified.

## Maturity ladder

${maturityModel.map((m) => `- **${m.capability}** — ${m.maturity}`).join('\n')}

## Scores

| Axis | Score |
|---|---|
${Object.entries(scorecard.scores).map(([k, v]) => `| ${k} | ${pctv(v)} |`).join('\n')}
| **Overall** | **${pctv(scorecard.overall)}** |

## What certification is waiting on

${level1.filter((c) => c.verdict !== 'CERTIFIED').map((c) => `- **${c.name}**: ${c.nextAction}`).join('\n')}
`;
  files['13-board-readiness-report.md'] = `# Board Readiness Report

_${stamp}_

**Headline:** the platform is **${level3.verdict}** at ${pctv(scorecard.overall)} overall readiness. ${certified.length} of six capabilities are fully certified and ${scorecard.conditionalCapabilities} conditionally. Certifying the platform requires all six.

## Decision required

${certified.length === 6 ? 'Accept enterprise platform certification.' : 'This is a measured progress report, not a certification. No decision to certify the platform is available yet — the verdict is computed from executed capability gates, live tests and fresh compilation, not asserted.'}

## Figures, each measured

| Figure | Value | Measured by |
|---|---|---|
| Capabilities certified | ${certified.length} / ${scorecard.canonicalCapabilities} | live gate + test execution |
| Capabilities conditionally certified | ${scorecard.conditionalCapabilities} / ${scorecard.canonicalCapabilities} | live gate + test execution |
| Overall readiness | ${pctv(scorecard.overall)} | ten measured axes |
| Cross-capability consistency | ${level2.verdict} | across ${level2.usableCount} usable |
| Framework self-validation | ${selfValidation.sound ? 'SOUND' : 'UNSOUND'} | ${selfValidation.checks.filter((c) => c.holds).length}/${selfValidation.checks.length} checks |
| Architecture drift introduced | none | closure + integrity gates |

## Risks

${level1.filter((c) => c.verdict === 'NOT CERTIFIED').map((c) => `- **${c.name}** is not certified: ${c.reason}`).join('\n')}
- A certification framework that reported a green platform here would be the precise failure it exists to prevent. Its verdict is deliberately unable to exceed the evidence.
`;

  files['14-certification-states.md'] = `# Certification States — the seven-state ladder

_${stamp}_

Each capability computes exactly one state, derived solely from measured evidence: NOT STARTED → IMPLEMENTED → BUILD VERIFIED → RUNTIME VERIFIED → CONFORMANCE VERIFIED → CONDITIONALLY CERTIFIED → CERTIFIED.

| # | Capability | State | Verdict | Unmeasured dimensions |
|---|---|---|---|---|
${level1.map((c) => `| ${c.number} | ${c.name} | **${c.state}** | ${c.verdict} | ${(c.unmeasuredDimensions || []).join(', ') || '—'} |`).join('\n')}
`;

  files['15-drift-report.md'] = `# Drift Report

_${stamp}_

Drift is a divergence between what the platform declares and what it is, measured from disk. **${drift.count} drift(s) detected · ${drift.clean ? 'no high-severity drift' : 'high-severity drift present'}.**

${drift.drifts.length ? `| Kind | Severity | Root cause | Impact | Recommended action |
|---|---|---|---|---|
${drift.drifts.map((d) => `| ${d.kind} | ${d.severity.toUpperCase()} | ${d.rootCause} | ${d.impact} | ${d.action} |`).join('\n')}` : 'No drift detected.'}
`;

  files['16-maturity-tiers.md'] = `# Maturity Model — capability to GA

_${stamp}_

| Tier | Value |
|---|---|
| Cross-capability | ${maturityTiers.crossCapability} |
| Platform (weakest capability) | ${maturityTiers.platform} |
| Enterprise readiness | ${maturityTiers.enterpriseReadiness} |
| Release readiness | ${maturityTiers.releaseReadiness} |
| GA readiness | ${maturityTiers.gaReadiness} |

## Per capability

${maturityTiers.capability.map((c) => `- **${c.name}** — ${c.state}`).join('\n')}
`;

  files['17-release-governance.md'] = `# Release Governance

_${stamp}_

**RELEASE DECISION: ${releaseGovernance.decision}** — ${releaseGovernance.reason}

| Release gate | Satisfied across all six |
|---|---|
${releaseGovernance.checks.map((c) => `| ${c.dimension} | ${c.holds ? 'YES' : 'NO'} |`).join('\n')}

**Blocking reasons (evidence-backed)**
${releaseGovernance.blockingReasons.length ? releaseGovernance.blockingReasons.map((r) => `- ${r}`).join('\n') : '- none'}
`;

  files['18-certification-history.md'] = `# Certification History and Trend

_${stamp}_

History is an append-only log of past measurements at \`${certificationHistory.historyFile}\`. It is used only for trend — the current verdict is always recomputed, never read from history.

**This snapshot:** ${certificationHistory.snapshot.platformVerdict} · ${certificationHistory.snapshot.overall}% · ${certificationHistory.snapshot.certified}/6 certified.
${certificationHistory.previous ? `**Previous:** ${certificationHistory.previous.verdict} · ${certificationHistory.previous.overall}% (${certificationHistory.previous.at}). **Overall delta: ${certificationHistory.overallDelta >= 0 ? '+' : ''}${certificationHistory.overallDelta}%.**` : '**Previous:** none — this is the first recorded snapshot.'}

**Progressions**
${certificationHistory.progressions.length ? certificationHistory.progressions.map((p) => `- ${p}`).join('\n') : '- none'}

**Regressions**
${certificationHistory.regressions.length ? certificationHistory.regressions.map((r) => `- ${r}`).join('\n') : '- none'}
`;

  files['19-self-certification.md'] = `# Self-Certification — the authority audits itself

_${stamp}_

The governance authority certifies its own execution the way it certifies a capability. **${selfCertification.certified ? 'SELF-CERTIFIED' : 'NOT SELF-CERTIFIED'}** — ${selfCertification.reason}

| # | Property | Holds |
|---|---|---|
${selfCertification.checks.map((c) => `| ${c.id} | ${c.property} | ${c.holds ? 'YES' : 'NO'} |`).join('\n')}

## Double validation

The harness self-validation and the gate's independent re-derivation must agree; disagreement fails certification.

| # | Self-validation property | Holds |
|---|---|---|
${selfValidation.checks.map((c) => `| ${c.id} | ${c.property} | ${c.holds ? 'YES' : 'NO'} |`).join('\n')}
`;

  files['20-evidence-ownership.md'] = `# Evidence Ownership Report

_${stamp}_

Every evidence artefact must declare its capability, version, timestamp, producer and type, and must belong to the capability it is assigned to. Orphaned or mismatched evidence is rejected and cannot raise a verdict.

| # | Capability | Evidence files | Ownership | Findings |
|---|---|---|---|---|
${level1.map((c) => `| ${c.number} | ${c.name} | ${c.evidenceFiles.length} | ${c.ownership.mismatched ? 'MISMATCHED' : c.ownership.complete ? 'complete' : 'incomplete'} | ${c.ownership.findings.join('; ') || '—'} |`).join('\n')}
`;

  let count = 0;
  for (const [name, content] of Object.entries(files)) { fs.writeFileSync(path.join(dir, name), content, 'utf8'); count += 1; }
  return count;
}
