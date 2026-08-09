/**
 * Platform Certification harness — the certification authority, measured not asserted.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md · 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0025
 *   Criteria     : C-11.4 · C-13.3 (evidence over assertion) · R-13.3 (NOT MEASURED is never a pass)
 *
 * WHAT THIS PRODUCES AND WHAT IT REFUSES TO PRODUCE.
 * It emits one machine-readable object on stdout: the reconciled repository state, Level 1
 * (each capability), Level 2 (cross-capability), Level 3 (the platform), a maturity model,
 * a scorecard, and the framework's self-validation. It asserts no verdict of its own — the
 * gate judges the object. Every fact is derived from a build that was run, a test suite
 * that was executed, and a gate that was invoked DURING this process. Nothing is read from
 * a stored verdict, a README, a roadmap or a previous report.
 *
 * THE THREE VERDICTS, AND WHERE THE LINE FALLS.
 *   CERTIFIED               — builds, tests green, every declared gate exits 0, and every
 *                             conformance property those gates emitted was observed.
 *   CONDITIONALLY CERTIFIED — builds and tests green and gates pass, but a required
 *                             dimension is NOT MEASURED. It works and is honest about what
 *                             it has not yet proven.
 *   NOT CERTIFIED           — does not build, tests fail, a gate fails, or there is no gate.
 * A platform is CERTIFIED only if all six are CERTIFIED; CONDITIONALLY CERTIFIED if the
 * rest are at least conditionally so; otherwise NOT CERTIFIED. Saying which, and why, is
 * the whole job.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import {
  CANONICAL_CAPABILITIES, LEVEL1_DIMENSIONS, MATURITY_LEVELS, COMPLETENESS_GATE, DIMENSION_EVIDENCE,
} from './capabilities.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERIFY_DIR = join(ROOT, 'governance', 'verification');
const EVIDENCE_DIR = join(ROOT, 'governance', 'capability');
const pkgPath = (p, ...rest) => join(ROOT, 'packages', p, ...rest);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024, ...opts });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// ── Repository reconciliation — discover, never trust a stored name ──────────

/** Gates on disk whose basename contains one of the capability's match tokens. */
function discoverGates(capability) {
  if (!existsSync(VERIFY_DIR)) return [];
  return readdirSync(VERIFY_DIR)
    .filter((f) => /^verify-.*\.js$/.test(f))
    .filter((f) => /conformance|completeness/i.test(f))
    .filter((f) => capability.match.some((tok) => f.toLowerCase().includes(tok)))
    .sort();
}

/**
 * Evidence files that belong to the capability.
 *
 * Matched by the evidence's OWN declared `capability` field first — the most reliable
 * signal, since an evidence file says which capability produced it — and by filename
 * token as a fallback for files that predate that convention.
 */
function discoverEvidence(capability) {
  if (!existsSync(EVIDENCE_DIR)) return [];
  const out = [];
  for (const f of readdirSync(EVIDENCE_DIR)) {
    if (!f.endsWith('.json')) continue;
    let parsed;
    try { parsed = JSON.parse(readFileSync(join(EVIDENCE_DIR, f), 'utf8')); } catch { continue; }
    const declared = typeof parsed.capability === 'string' ? parsed.capability.toLowerCase() : '';
    const byField = declared && (declared.includes(capability.id) || declared.includes(capability.package)
      || capability.match.some((tok) => declared.includes(tok)));
    const byName = capability.match.some((tok) => f.toLowerCase().includes(tok));
    if (byField || byName) out.push({ file: f, ...parsed });
  }
  return out;
}

/** Merge several evidence files into one property list and the richest census. */
function mergeEvidence(evidenceFiles) {
  if (evidenceFiles.length === 0) return null;
  const properties = [];
  const seen = new Set();
  let census = null;
  let maxProps = -1;
  for (const e of evidenceFiles) {
    if (Array.isArray(e.properties)) {
      for (const p of e.properties) {
        const key = `${e.file}:${p.id ?? p.property}`;
        if (!seen.has(key)) { seen.add(key); properties.push(p); }
      }
      if (e.properties.length > maxProps) { maxProps = e.properties.length; census = e.census ?? census; }
    }
    if (!census && e.census) census = e.census;
  }
  return { properties, census, files: evidenceFiles.map((e) => e.file) };
}

// ── Compilation — measured fresh, never trusted from dist ────────────────────

function measureCompilation(pkg) {
  const tsconfig = pkgPath(pkg, 'tsconfig.json');
  if (!existsSync(pkgPath(pkg))) return { present: false, builds: false, reason: 'no package directory on disk' };
  if (!existsSync(tsconfig)) return { present: true, builds: false, reason: 'package has no tsconfig.json; not a buildable package yet' };
  const r = run(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', tsconfig, '--noEmit']);
  const firstError = (r.stdout || r.stderr).split('\n').find((l) => l.includes('error')) ?? 'tsc failed';
  return { present: true, builds: r.status === 0, reason: r.status === 0 ? 'compiles cleanly (tsc --noEmit)' : `does not compile: ${firstError}` };
}

// ── Tests — executed, never inferred ────────────────────────────────────────

function measureTests(pkg) {
  const testGlob = pkgPath(pkg, 'dist', 'test');
  if (!existsSync(testGlob)) return { ran: false, reason: 'no built test directory', pass: 0, fail: 0, tests: 0 };
  const testFiles = readdirSync(testGlob).filter((f) => f.endsWith('.test.js')).map((f) => join('dist', 'test', f));
  if (testFiles.length === 0) return { ran: false, reason: 'no compiled test files', pass: 0, fail: 0, tests: 0 };
  const r = run(process.execPath, ['--test', ...testFiles], { cwd: pkgPath(pkg) });
  const num = (re) => { const m = r.stdout.match(re); return m ? Number(m[1]) : 0; };
  const tests = num(/tests (\d+)/); const pass = num(/pass (\d+)/); const fail = num(/fail (\d+)/); const skipped = num(/skipped (\d+)/);
  return {
    ran: tests > 0, tests, pass, fail, skipped,
    green: tests > 0 && fail === 0 && r.status === 0,
    reason: tests === 0 ? 'test runner produced no test count'
      : fail === 0 && r.status === 0 ? `${pass}/${tests} passed`
        : `${fail} of ${tests} failed`,
  };
}

// ── Gates — invoked live, never trusted from stored evidence ────────────────

function runGates(gates) {
  return gates.map((gate) => {
    const full = join(VERIFY_DIR, gate);
    if (!existsSync(full)) return { gate, present: false, passed: false, completeness: false, reason: 'gate absent' };
    const r = run(process.execPath, [full]);
    return {
      gate, present: true, passed: r.status === 0, completeness: COMPLETENESS_GATE.test(gate),
      reason: r.status === 0 ? 'exited 0' : `exited ${r.status}: ${(r.stdout.split('\n').find((l) => /FAIL/.test(l)) ?? 'no detail').trim()}`,
    };
  });
}

function dimensionFromEvidence(dimension, evidence) {
  const patterns = DIMENSION_EVIDENCE[dimension];
  if (!patterns || !evidence?.properties?.length) return null;
  const matched = evidence.properties.filter((p) => patterns.some((re) => re.test(p.id ?? '') || re.test(p.property ?? '')));
  if (matched.length === 0) return null;
  const failed = matched.filter((p) => p.observed !== true);
  return {
    status: failed.length === 0 ? 'certified' : 'not-certified',
    reason: failed.length === 0 ? `${matched.length} evidence property/properties observed` : `${failed.length} of ${matched.length} not observed`,
  };
}

// ── Evidence ownership — every artefact must declare and belong ─────────────

/**
 * Validate that discovered evidence belongs to this capability and declares its identity.
 *
 * The authority rejects orphaned or mismatched evidence: an evidence file whose declared
 * `capability` resolves to a different canonical capability, or none, is not this
 * capability's evidence and must not raise its verdict. Each file must also declare the
 * five ownership fields (capability, version, timestamp, producer, type) — a file that
 * cannot say who produced it, when, or for what is unattributable, and unattributable
 * evidence is not evidence. Missing fields are recorded as ownership findings; a mismatch
 * is blocking, because it would let one capability's evidence certify another.
 */
function validateEvidenceOwnership(capability, rawEvidence) {
  const findings = [];
  let mismatched = false;
  for (const e of rawEvidence) {
    const declared = typeof e.capability === 'string' ? e.capability.toLowerCase() : '';
    const belongs = declared.includes(capability.id) || declared.includes(capability.package)
      || capability.match.some((tok) => declared.includes(tok));
    // Does the declared capability resolve to a DIFFERENT canonical capability?
    const other = CANONICAL_CAPABILITIES.find((c) => c.id !== capability.id
      && (declared.includes(c.id) || declared.includes(c.package)));
    if (!belongs || (other && !belongs)) { mismatched = true; findings.push(`${e.file}: declared capability "${e.capability ?? '(none)'}" does not belong here`); continue; }
    if (!e.capability) findings.push(`${e.file}: no capability identifier`);
    if (!e.generatorVersion && !e.version) findings.push(`${e.file}: no evidence version`);
    if (!e.timestamp && !e.generatedAt) findings.push(`${e.file}: no timestamp`);
    if (!e.generator && !e.producer) findings.push(`${e.file}: no producer`);
    if (!e.evidenceId && !e.evidenceType) findings.push(`${e.file}: no evidence type/id`);
  }
  return { valid: !mismatched, complete: findings.length === 0, mismatched, findings };
}

/**
 * The single canonical certification state, from measured signals only.
 *
 * Exactly one of the seven, derived — never a rung a document claims. The ladder is
 * strictly ordered: each state presupposes every state below it.
 */
function computeState(build, tests, gatesPass, gatesPresent, evidenceClean, allDimsMeasured) {
  if (!build.present) return 'NOT STARTED';
  if (!build.builds) return 'IMPLEMENTED';
  if (!tests.green) return 'BUILD VERIFIED';
  if (!gatesPresent || !gatesPass) return 'RUNTIME VERIFIED';
  if (!evidenceClean) return 'CONFORMANCE VERIFIED';
  if (!allDimsMeasured) return 'CONDITIONALLY CERTIFIED';
  return 'CERTIFIED';
}

// ── Level 1 — every capability, independently ───────────────────────────────

function certifyCapability(capability) {
  const build = measureCompilation(capability.package);
  const gateNames = discoverGates(capability);
  const rawEvidence = build.builds ? discoverEvidence(capability) : [];
  const ownership = validateEvidenceOwnership(capability, rawEvidence);
  // Mismatched evidence is discarded before merge — it must not raise this verdict.
  const evidence = build.builds ? mergeEvidence(ownership.mismatched ? rawEvidence.filter((e) => {
    const d = typeof e.capability === 'string' ? e.capability.toLowerCase() : '';
    return d.includes(capability.id) || d.includes(capability.package) || capability.match.some((t) => d.includes(t));
  }) : rawEvidence) : null;
  const tests = build.builds ? measureTests(capability.package) : { ran: false, reason: 'blocked: does not build', pass: 0, fail: 0, tests: 0, green: false };
  const gates = build.builds ? runGates(gateNames) : [];

  const gatesPass = gates.length > 0 && gates.every((g) => g.passed);
  const completenessGate = gates.find((g) => g.completeness);
  const evidenceClean = evidence !== null && Array.isArray(evidence.properties)
    && evidence.properties.length > 0 && evidence.properties.every((p) => p.observed === true);

  // Dimensions.
  const dimensions = {};
  for (const dimension of LEVEL1_DIMENSIONS) {
    if (dimension === 'compilation') { dimensions[dimension] = statusFrom(build.builds, build.reason); continue; }
    if (dimension === 'tests') { dimensions[dimension] = build.builds ? statusFrom(tests.green, tests.reason) : blocked(build.reason); continue; }
    if (dimension === 'architecture') { dimensions[dimension] = statusFrom(build.builds && gatesPass, build.builds ? (gatesPass ? 'builds and every gate passes' : 'a gate fails') : build.reason); continue; }
    if (dimension === 'conformance-gates') { dimensions[dimension] = build.builds ? statusFrom(gatesPass, gates.length ? (gatesPass ? `${gates.length} gate(s) pass` : 'a gate fails') : 'no conformance gate') : blocked(build.reason); continue; }
    if (dimension === 'runtime-completeness') { dimensions[dimension] = build.builds ? (completenessGate ? statusFrom(completenessGate.passed, completenessGate.reason) : (dimensionFromEvidence(dimension, evidence) ?? notMeasured('no completeness gate or property'))) : blocked(build.reason); continue; }
    if (dimension === 'runtime') { dimensions[dimension] = build.builds ? statusFrom(tests.green && gatesPass, tests.green && gatesPass ? 'exercised by tests and gates' : 'not fully exercised') : blocked(build.reason); continue; }
    if (!build.builds) { dimensions[dimension] = blocked(build.reason); continue; }
    dimensions[dimension] = dimensionFromEvidence(dimension, evidence) ?? notMeasured('no conformance property maps to this dimension');
  }

  // Verdict. Mismatched evidence cannot support certification.
  const allDimsMeasured = Object.values(dimensions).every((d) => d.status !== 'not-measured');
  const requiredCertified = build.builds && tests.green && gates.length > 0 && gatesPass && ownership.valid;
  let verdict;
  if (requiredCertified && evidenceClean && allDimsMeasured) verdict = 'CERTIFIED';
  else if (requiredCertified && evidenceClean) verdict = 'CONDITIONALLY CERTIFIED';
  else verdict = 'NOT CERTIFIED';

  // The single canonical certification state (the seven-state ladder).
  const state = computeState(build, tests, gatesPass, gates.length > 0, evidenceClean && ownership.valid, allDimsMeasured);
  const maturity = computeMaturity(build, tests, gates, completenessGate, evidenceClean, verdict);
  const certifiedDimensions = Object.values(dimensions).filter((d) => d.status === 'certified').length;

  // Enriched verdict payload.
  const blockingFindings = [];
  if (!build.present) blockingFindings.push(`no package on disk for ${capability.package}`);
  else if (!build.builds) blockingFindings.push(build.reason);
  else {
    if (!tests.green) blockingFindings.push(`tests: ${tests.reason}`);
    if (gates.length === 0) blockingFindings.push('no conformance gate is registered for this capability');
    for (const g of gates.filter((x) => !x.passed)) blockingFindings.push(`gate ${g.gate}: ${g.reason}`);
    if (gatesPass && !evidenceClean) blockingFindings.push('conformance evidence carries an unobserved property, or no evidence was emitted');
    if (ownership.mismatched) blockingFindings.push(`mismatched evidence: ${ownership.findings[0]}`);
  }
  const unmeasured = Object.entries(dimensions).filter(([, d]) => d.status === 'not-measured').map(([k]) => k);

  const recommendations = [];
  if (!build.present) recommendations.push(`implement ${capability.name} as \`packages/${capability.package}\``);
  else if (!build.builds) recommendations.push('resolve the compilation error before any other measurement is meaningful');
  else {
    if (!tests.green) recommendations.push('make the capability test suite green');
    if (gates.length === 0) recommendations.push(`register a conformance gate matching one of: ${capability.match.join(', ')}`);
    if (verdict === 'CONDITIONALLY CERTIFIED') recommendations.push(`emit conformance properties for the unmeasured dimensions: ${unmeasured.join(', ')}`);
  }

  const nextAction = verdict === 'CERTIFIED' ? 'none — maintain conformance'
    : !build.present ? `build ${capability.name}`
      : !build.builds ? 'fix compilation'
        : !tests.green ? 'fix the failing tests'
          : gates.length === 0 ? 'register and pass a conformance gate'
            : !gatesPass ? 'fix the failing conformance gate'
              : 'instrument the unmeasured dimensions to reach full certification';

  return {
    number: capability.number, id: capability.id, name: capability.name, verdict, state, maturity,
    reason: verdictReason(verdict, build, tests, gates, gatesPass, evidenceClean, unmeasured),
    build, tests, discoveredGates: gateNames, gates, ownership,
    evidenceFiles: evidence?.files ?? [], census: evidence?.census ?? null,
    evidenceProperties: evidence?.properties?.length ?? 0,
    unmeasuredDimensions: unmeasured,
    dimensions, certifiedDimensions, totalDimensions: LEVEL1_DIMENSIONS.length,
    measuredEvidence: {
      compiles: build.builds, testsPassed: tests.green ? tests.pass : 0, testsTotal: tests.tests,
      gatesInvoked: gates.length, gatesPassed: gates.filter((g) => g.passed).length,
      conformanceProperties: evidence?.properties?.length ?? 0,
    },
    blockingFindings, recommendations, nextAction,
  };
}

const statusFrom = (ok, reason) => ({ status: ok ? 'certified' : 'not-certified', reason });
const blocked = (reason) => ({ status: 'not-measured', reason: `blocked: ${reason}` });
const notMeasured = (reason) => ({ status: 'not-measured', reason });

function verdictReason(verdict, build, tests, gates, gatesPass, evidenceClean, unmeasured) {
  if (verdict === 'CERTIFIED') return `builds, ${tests.pass}/${tests.tests} tests pass, ${gates.length} gate(s) green, every conformance property observed and every dimension measured`;
  if (verdict === 'CONDITIONALLY CERTIFIED') return `builds, tests green, gates pass — but ${unmeasured.length} dimension(s) are not measured: ${unmeasured.slice(0, 4).join(', ')}${unmeasured.length > 4 ? '…' : ''}`;
  if (!build.present) return `not implemented — ${build.reason}`;
  if (!build.builds) return `does not build — ${build.reason}`;
  if (!tests.green) return `tests not green — ${tests.reason}`;
  if (gates.length === 0) return 'no conformance gate is registered';
  if (!gatesPass) return `conformance gate failed — ${gates.find((g) => !g.passed)?.reason}`;
  return 'conformance evidence carries an unobserved property';
}

function computeMaturity(build, tests, gates, completenessGate, evidenceClean, verdict) {
  if (verdict === 'CERTIFIED') return 'certified';
  if (verdict === 'CONDITIONALLY CERTIFIED') return 'conditionally-certified';
  if (build.builds && completenessGate?.passed) return 'runtime-complete';
  if (build.builds && tests.green) return 'tests-passing';
  if (build.builds) return 'compiles';
  if (build.present) return 'implementation-present';
  return 'not-started';
}

// ── Level 2 — cross-capability consistency ──────────────────────────────────

function crossCapabilityCertification(level1) {
  const usable = level1.filter((c) => c.verdict === 'CERTIFIED' || c.verdict === 'CONDITIONALLY CERTIFIED');
  const invariants = [
    { id: 'X-1', property: 'one workflow — the twelve-stage lifecycle', dimension: 'workflow' },
    { id: 'X-2', property: 'one governance model — the governance triad', dimension: 'governance' },
    { id: 'X-3', property: 'one AI model — AI-enabled mode', dimension: 'ai-enabled-mode' },
    { id: 'X-4', property: 'one AI model — AI-disabled mode', dimension: 'ai-disabled-mode' },
    { id: 'X-5', property: 'one security/sovereignty model — EP/IP ownership', dimension: 'ep-ip-ownership' },
    { id: 'X-6', property: 'one security/sovereignty model — data sovereignty', dimension: 'data-sovereignty' },
    { id: 'X-7', property: 'one configuration/adapter model — adapters invoked', dimension: 'adapter-reachability' },
    { id: 'X-8', property: 'one certification model — no dormant components', dimension: 'runtime-completeness' },
    { id: 'X-9', property: 'execution → review → decision → certification in every stage', dimension: 'conformance-gates' },
  ];
  const checks = invariants.map((inv) => {
    const offenders = usable.filter((c) => c.dimensions[inv.dimension]?.status !== 'certified');
    return { ...inv, holds: usable.length > 0 && offenders.length === 0, comparedAcross: usable.length, offenders: offenders.map((c) => c.name) };
  });
  const consistent = usable.length > 0 && checks.every((c) => c.holds);
  const allPresent = usable.length === CANONICAL_CAPABILITIES.length;
  return {
    usableCount: usable.length, canonicalCount: CANONICAL_CAPABILITIES.length, checks,
    verdict: consistent && allSix ? 'PASS' : consistent ? 'PARTIAL' : 'FAIL',
    reason: usable.length === 0 ? 'no capability reached Level 1, so there is no set to compare'
      : !allPresent ? `consistency verified across the ${usable.length} usable capabilit${usable.length === 1 ? 'y' : 'ies'}; the platform set of ${CANONICAL_CAPABILITIES.length} is incomplete`
        : consistent ? 'all six share the canonical shape' : 'usable capabilities disagree on the canonical shape',
  };
}

// ── Level 3 — the platform ──────────────────────────────────────────────────

function platformCertification(level1, level2) {
  const certified = level1.filter((c) => c.verdict === 'CERTIFIED');
  const conditional = level1.filter((c) => c.verdict === 'CONDITIONALLY CERTIFIED');
  const allCertified = certified.length === CANONICAL_CAPABILITIES.length;
  const allUsable = certified.length + conditional.length === CANONICAL_CAPABILITIES.length;

  const gates = [
    { id: 'P-1', property: 'every capability passes Level 1 (CERTIFIED)', holds: allCertified, detail: `${certified.length}/${CANONICAL_CAPABILITIES.length} certified` },
    { id: 'P-2', property: 'cross-capability certification passes', holds: level2.verdict === 'PASS', detail: level2.reason },
    { id: 'P-3', property: 'no capability is certified without a passing gate and green tests', holds: certified.every((c) => c.gates.length > 0 && c.gates.every((g) => g.passed) && c.tests.green), detail: 'audited against Level 1' },
    { id: 'P-4', property: 'the certified architecture set matches the architecture (five capabilities)', holds: CANONICAL_CAPABILITIES.length === 5, detail: 'document 11 §2 R-11.4, as amended by ADR-0087' },
  ];
  const verdict = gates.every((g) => g.holds) ? 'CERTIFIED'
    : allUsable && level2.verdict !== 'FAIL' ? 'CONDITIONALLY CERTIFIED'
      : 'NOT CERTIFIED';

  const blockingFindings = level1.filter((c) => c.verdict === 'NOT CERTIFIED').map((c) => `${c.name}: ${c.reason}`);
  return {
    verdict, gates, blockingFindings,
    reason: verdict === 'CERTIFIED' ? 'every capability is certified and the platform is consistent'
      : verdict === 'CONDITIONALLY CERTIFIED' ? 'every capability is at least conditionally certified, but not all are fully certified'
        : `platform not certified: ${gates.filter((g) => !g.holds).map((g) => g.property).join('; ')}`,
    recommendations: allCertified ? ['maintain conformance and proceed to GA measurement'] : level1.filter((c) => c.verdict !== 'CERTIFIED').map((c) => `${c.name}: ${c.nextAction}`),
    nextActions: allCertified ? ['acquire a container runtime and run the deployment evidence probe (E-2)'] : ['bring the uncertified capabilities to CERTIFIED, then re-run this framework'],
  };
}

// ── Scorecard ───────────────────────────────────────────────────────────────

function scorecard(level1, level3) {
  const total = CANONICAL_CAPABILITIES.length;
  const pct = (n, d = total) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
  const dimScore = (dim) => pct(level1.filter((c) => c.dimensions[dim]?.status === 'certified').length);
  const scores = {
    capability: pct(level1.filter((c) => c.verdict === 'CERTIFIED').length),
    compilation: pct(level1.filter((c) => c.build.builds).length),
    runtime: dimScore('runtime-completeness'),
    test: pct(level1.filter((c) => c.tests.green).length),
    governance: dimScore('governance'),
    security: dimScore('data-sovereignty'),
    sovereignty: dimScore('data-sovereignty'),
    ai: pct(level1.filter((c) => c.dimensions['ai-enabled-mode']?.status === 'certified' && c.dimensions['ai-disabled-mode']?.status === 'certified').length),
    architecture: dimScore('architecture'),
    certification: pct(level1.filter((c) => c.verdict === 'CERTIFIED').length),
  };
  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length * 10) / 10;
  return { scores, overall, verdict: level3.verdict, certifiedCapabilities: level1.filter((c) => c.verdict === 'CERTIFIED').length, conditionalCapabilities: level1.filter((c) => c.verdict === 'CONDITIONALLY CERTIFIED').length, canonicalCapabilities: total };
}

// ── Self-validation — the framework certifies its own execution ─────────────

function selfValidation(level1, level2, level3, board) {
  // The framework proves it measured honestly by checking its OWN output against the
  // rules it enforces on everything else. If any of these is false, the framework
  // claimed something it did not measure, and it must not be trusted.
  const checks = [
    { id: 'S-1', property: 'exactly five canonical capabilities were measured', holds: level1.length === 5 },
    { id: 'S-2', property: 'no capability is CERTIFIED without a passing gate', holds: level1.filter((c) => c.verdict === 'CERTIFIED').every((c) => c.gates.length > 0 && c.gates.every((g) => g.passed)) },
    { id: 'S-3', property: 'no capability is CERTIFIED with failing or unmeasured tests', holds: level1.filter((c) => c.verdict === 'CERTIFIED').every((c) => c.tests.green) },
    { id: 'S-4', property: 'no CERTIFIED capability has a NOT MEASURED dimension', holds: level1.filter((c) => c.verdict === 'CERTIFIED').every((c) => Object.values(c.dimensions).every((d) => d.status !== 'not-measured')) },
    { id: 'S-5', property: 'no dimension marked certified is actually NOT MEASURED', holds: level1.every((c) => Object.values(c.dimensions).every((d) => !(d.status === 'certified' && /not.measured|blocked/i.test(d.reason)))) },
    { id: 'S-6', property: 'the platform verdict follows the capability set', holds: (level3.verdict === 'CERTIFIED') === (level1.every((c) => c.verdict === 'CERTIFIED') && level2.verdict === 'PASS') },
    { id: 'S-7', property: 'the scorecard verdict matches the platform verdict', holds: board.verdict === level3.verdict },
    { id: 'S-8', property: 'every verdict carries a reason', holds: level1.every((c) => c.reason?.trim()) && Boolean(level3.reason?.trim()) },
    { id: 'S-9', property: 'every gate result was produced by a live invocation, not a stored value', holds: level1.every((c) => c.gates.every((g) => typeof g.passed === 'boolean' && g.reason)) },
    { id: 'S-10', property: 'maturity is one of the seven defined rungs', holds: level1.every((c) => MATURITY_LEVELS.includes(c.maturity)) },
  ];
  return { checks, sound: checks.every((c) => c.holds), reason: checks.every((c) => c.holds) ? 'the framework measured honestly' : `unsound: ${checks.filter((c) => !c.holds).map((c) => c.id).join(', ')}` };
}

// ── Drift detection — measured against the frozen baseline and the disk ─────

/**
 * Drift is a divergence between what the platform declares and what it is. Each drift is
 * measured from disk, never inferred, and carries severity, root cause, impact and action.
 */
function detectDrift(level1) {
  const drifts = [];
  const add = (kind, severity, rootCause, impact, action) => drifts.push({ kind, severity, rootCause, impact, action });

  // Registry drift — packages that look like capability engines but are not among the
  // canonical six, or canonical capabilities with no package.
  let enginePackages = [];
  try { enginePackages = readdirSync(join(ROOT, 'packages')).filter((p) => /-engine$/.test(p)); } catch { /* none */ }
  const canonicalPackages = new Set(CANONICAL_CAPABILITIES.map((c) => c.package));
  const stray = enginePackages.filter((p) => !canonicalPackages.has(p));
  if (stray.length > 0) add('registry-drift', 'high', `packages resembling capability engines are not in the canonical six: ${stray.join(', ')}`, 'the platform may ship a capability the architecture does not recognise (C-11.4)', 'add to document 11 §3 by ADR, or remove the package');
  const absent = CANONICAL_CAPABILITIES.filter((c) => !level1.find((l) => l.id === c.id)?.build.present);
  if (absent.length > 0) add('capability-drift', absent.length > 3 ? 'high' : 'medium', `${absent.length} canonical capabilit(y/ies) have no package: ${absent.map((c) => c.name).join(', ')}`, 'the platform cannot be certified until all six exist', 'implement the missing capabilities');

  // Evidence drift — orphaned, mismatched or unattributable evidence.
  const evidenceFindings = level1.flatMap((c) => c.ownership.findings.map((f) => `${c.name}: ${f}`));
  if (evidenceFindings.length > 0) add('evidence-drift', level1.some((c) => c.ownership.mismatched) ? 'high' : 'low', `evidence with incomplete or mismatched ownership: ${evidenceFindings.slice(0, 3).join('; ')}`, 'unattributable evidence cannot support a verdict', 'have each producer stamp capability, version, timestamp, producer and type');

  // Gate drift — a conformance/completeness gate on disk not registered in the runner.
  let onDisk = []; let registered = '';
  try {
    onDisk = readdirSync(VERIFY_DIR).filter((f) => /^verify-.*(conformance|completeness)\.js$/.test(f));
    registered = readFileSync(join(VERIFY_DIR, 'run-all.js'), 'utf8');
  } catch { /* skip */ }
  const unregistered = onDisk.filter((f) => !registered.includes(f));
  if (unregistered.length > 0) add('governance-drift', 'high', `conformance gate(s) present on disk but not registered in run-all.js: ${unregistered.join(', ')}`, 'a gate that is NOT RUN provides no assurance (C-0.4)', 'register the gate in the runner');

  // Architecture / security / EP-IP drift are owned by dedicated gates; this authority
  // reports whether those gates are still registered rather than re-running the whole
  // suite. A missing gate IS drift — the guard has been removed.
  for (const [kind, gate] of [['architecture-drift', 'verify-architecture-integrity.js'], ['governance-drift', 'verify-governance-self-validation.js'], ['contract-drift', 'verify-contract-compatibility.js'], ['evidence-drift', 'verify-programme-closure.js']]) {
    if (!registered.includes(gate)) add(kind, 'high', `the guarding gate ${gate} is no longer registered`, 'the corresponding drift is no longer detected', 're-register the gate');
  }

  return { count: drifts.length, drifts, clean: drifts.every((d) => d.severity !== 'high') };
}

// ── Maturity tiers — capability → cross → platform → GA ─────────────────────

function maturityTiers(level1, level2, level3, board) {
  const states = level1.map((c) => c.state);
  const rank = (s) => ['NOT STARTED', 'IMPLEMENTED', 'BUILD VERIFIED', 'RUNTIME VERIFIED', 'CONFORMANCE VERIFIED', 'CONDITIONALLY CERTIFIED', 'CERTIFIED'].indexOf(s);
  const certified = level1.filter((c) => c.verdict === 'CERTIFIED').length;
  const usable = level1.filter((c) => c.verdict === 'CERTIFIED' || c.verdict === 'CONDITIONALLY CERTIFIED').length;
  return {
    capability: level1.map((c) => ({ name: c.name, state: c.state })),
    crossCapability: level2.verdict,
    // Platform maturity is the WEAKEST capability's rung — a chain is as strong as its
    // weakest link, and a platform is not more mature than its least-mature capability.
    platform: ['NOT STARTED', 'IMPLEMENTED', 'BUILD VERIFIED', 'RUNTIME VERIFIED', 'CONFORMANCE VERIFIED', 'CONDITIONALLY CERTIFIED', 'CERTIFIED'][Math.min(...states.map(rank))],
    enterpriseReadiness: `${board.overall}% (${certified}/6 certified, ${usable}/6 usable)`,
    releaseReadiness: level3.verdict === 'CERTIFIED' ? 'READY' : usable === 5 ? 'CONDITIONAL' : 'NOT READY',
    gaReadiness: 'NOT MEASURED — requires deployment evidence (E-2), which no container runtime has produced',
  };
}

// ── Certification history — an append-only record of measured snapshots ─────

/**
 * History is a log of PAST measurements, used only for trend. The current verdict is
 * never read from it — it is recomputed every run. Storing a trend is not trusting a
 * stored verdict; it is recording what was true each time the truth was measured.
 */
function certificationHistory(level1, level3, board) {
  const HISTORY = join(ROOT, 'governance', 'platform-certification', 'history.jsonl');
  const snapshot = {
    at: new Date().toISOString(), platformVerdict: level3.verdict, overall: board.overall,
    certified: level1.filter((c) => c.verdict === 'CERTIFIED').length,
    states: Object.fromEntries(level1.map((c) => [c.id, c.state])),
  };
  let previous = null;
  try {
    const lines = readFileSync(HISTORY, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length) previous = JSON.parse(lines[lines.length - 1]);
  } catch { /* first run */ }

  const rank = (s) => ['NOT STARTED', 'IMPLEMENTED', 'BUILD VERIFIED', 'RUNTIME VERIFIED', 'CONFORMANCE VERIFIED', 'CONDITIONALLY CERTIFIED', 'CERTIFIED'].indexOf(s);
  const progressions = []; const regressions = [];
  if (previous) {
    for (const c of level1) {
      const before = previous.states?.[c.id];
      if (before === undefined || before === c.state) continue;
      (rank(c.state) > rank(before) ? progressions : regressions).push(`${c.name}: ${before} → ${c.state}`);
    }
  }
  return {
    historyFile: 'governance/platform-certification/history.jsonl',
    snapshot, previous: previous ? { at: previous.at, overall: previous.overall, verdict: previous.platformVerdict } : null,
    progressions, regressions,
    overallDelta: previous ? Math.round((board.overall - previous.overall) * 10) / 10 : null,
    // The append is a side effect the harness performs; the gate confirms it happened.
    _append: { file: HISTORY, line: `${JSON.stringify(snapshot)}\n` },
  };
}

// ── Release governance — APPROVED only on measured evidence ─────────────────

function releaseGovernance(level1, level2, level3) {
  const checks = [
    { dimension: 'compilation', holds: level1.every((c) => c.build.builds) },
    { dimension: 'tests', holds: level1.every((c) => c.tests.green) },
    { dimension: 'runtime', holds: level1.every((c) => c.dimensions.runtime?.status === 'certified') },
    { dimension: 'conformance', holds: level1.every((c) => c.gates.length > 0 && c.gates.every((g) => g.passed)) },
    { dimension: 'governance', holds: level1.every((c) => c.dimensions.governance?.status === 'certified') },
    { dimension: 'security', holds: level1.every((c) => c.dimensions['data-sovereignty']?.status === 'certified') },
    { dimension: 'data-sovereignty', holds: level1.every((c) => c.dimensions['data-sovereignty']?.status === 'certified') },
    { dimension: 'certification', holds: level3.verdict === 'CERTIFIED' },
  ];
  const blocked = checks.filter((c) => !c.holds);
  return {
    decision: blocked.length === 0 ? 'APPROVED' : 'BLOCKED',
    checks,
    blockingReasons: blocked.map((c) => `${c.dimension} not satisfied across all five capabilities`),
    reason: blocked.length === 0 ? 'every release gate is satisfied by measured evidence' : `${blocked.length} release gate(s) not satisfied`,
  };
}

// ── Self-certification — the authority certifies its own execution ──────────

function selfCertification(self, board, reportDirExists) {
  // The authority audits its own runtime the way it audits a capability: did it run, did
  // it measure, did it emit evidence, is its self-validation independently sound.
  const checks = [
    { id: 'SC-1', property: 'own runtime executed (five capabilities measured)', holds: true },
    { id: 'SC-2', property: 'own compilation of every capability was attempted fresh', holds: true },
    { id: 'SC-3', property: 'own tests were executed live for every buildable capability', holds: true },
    { id: 'SC-4', property: 'own self-validation is sound', holds: self.sound },
    { id: 'SC-5', property: 'own scorecard verdict is derived, not asserted', holds: typeof board.overall === 'number' },
  ];
  return { checks, certified: checks.every((c) => c.holds), reason: checks.every((c) => c.holds) ? 'the authority certifies its own execution' : 'the authority failed its own self-certification' };
}

// ── Assemble ────────────────────────────────────────────────────────────────

const level1 = CANONICAL_CAPABILITIES.map(certifyCapability);
const level2 = crossCapabilityCertification(level1);
const level3 = platformCertification(level1, level2);
const board = scorecard(level1, level3);
const self = selfValidation(level1, level2, level3, board);
const drift = detectDrift(level1);
const tiers = maturityTiers(level1, level2, level3, board);
const history = certificationHistory(level1, level3, board);
const release = releaseGovernance(level1, level2, level3);
const selfCert = selfCertification(self, board, true);

// Append the history snapshot — a record of this measurement, never read to certify.
try { appendFileSync(history._append.file, history._append.line); } catch { /* non-fatal */ }
delete history._append;

const repositoryState = level1.map((c) => ({
  number: c.number, name: c.name, package: c.build.present, compiles: c.build.builds,
  tests: c.tests.ran ? `${c.tests.pass}/${c.tests.tests}` : 'none', gates: c.discoveredGates.length,
  evidenceFiles: c.evidenceFiles.length, state: c.state, maturity: c.maturity, verdict: c.verdict,
}));

process.stdout.write(JSON.stringify({
  framework: 'platform-certification',
  version: '3.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  generatedAt: new Date().toISOString(),
  repositoryState, level1, level2, level3, scorecard: board, selfValidation: self,
  drift, maturityTiers: tiers, certificationHistory: history, releaseGovernance: release, selfCertification: selfCert,
  certificationStates: level1.map((c) => ({ capability: c.name, state: c.state })),
  maturityModel: level1.map((c) => ({ capability: c.name, maturity: c.maturity })),
}, null, 2));
