'use strict';
/**
 * CUSTOMER READINESS EVIDENCE HARNESS — M2.7.
 * ============================================================================
 * Executes the customer journey, replays it, writes the Customer Success Package to
 * disk, and emits machine-readable evidence.
 *
 * R-25.1: readiness is measured from EXECUTED OUTCOMES, never asserted from the
 * existence of documentation. Every property here is produced by running the scenario;
 * nothing is read from a document and reported as a fact about the platform.
 *
 * R-25.34: the package is GENERATED from validation output. It is written by this
 * harness, from the run that validated it, so a package cannot exist for a release
 * that was never validated — which is the only property that makes shipping it mean
 * anything.
 *
 * K-10 is replay (R-14.2). The whole scenario runs a second time in a fresh process
 * and the outcome digests are compared. The digest covers step identities and outcomes
 * only — never durations, hashes or paths — so a divergence means the platform behaved
 * differently rather than that a timer moved.
 *
 * Run:  node governance/customer-success/run-customer-evidence.js
 * Exit: 0 = every property holds   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = __dirname;
const SCENARIO = path.join(OUT, 'run-customer-readiness.mjs');
const PACKAGE_DIR = path.join(ROOT, 'docs', 'customer-success-package');

const proven = [];
const unmeasured = [];
let failures = 0;

const line = (s) => console.log(s);
const record = (id, property, passed, detail) => {
  proven.push({ id, property, passed, detail });
  line(`  ${passed ? 'PASS ' : 'FAIL '} ${id}  ${property}`);
  if (detail) line(`            ${detail}`);
  if (!passed) failures += 1;
};
const blocked = (id, property, blocker) => {
  unmeasured.push({ id, property, status: 'NOT MEASURED', blocker });
  line(`  NOT MEASURED  ${id}  ${property}`);
  line(`            blocked: ${blocker}`);
};

line('');
line('CUSTOMER READINESS EVIDENCE — M2.7');
line('='.repeat(74));

/**
 * Run the scenario in a fresh process.
 *
 * The scenario reports rather than asserts and always exits 0, so this function is the
 * only place that distinguishes "the scenario could not run" from "it ran and a
 * property failed". Collapsing those would let a broken build read as a clean one.
 */
function runScenario() {
  const r = spawnSync(process.execPath, [SCENARIO], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  if (r.status !== 0) {
    return { steps: [], digest: null, fatal: `scenario process exited ${r.status}: ${(r.stderr || '').slice(0, 400)}` };
  }
  try { return JSON.parse(r.stdout); } catch {
    return { steps: [], digest: null, fatal: 'scenario produced no parseable observation' };
  }
}

line('\nExecuted properties');

const runA = runScenario();
if (runA.fatal || runA.steps.length === 0) {
  // A scenario that exists and cannot run is a FAILURE, not an absence of evidence.
  // Reporting it as NOT MEASURED would hide a broken customer journey behind a word
  // that means "we did not look".
  record('K-scenario', 'the customer journey executes', false, runA.fatal ?? 'no steps were produced');
} else {
  for (const s of runA.steps) record(s.id, s.property, s.ok, s.detail);
}

// ── K-10 · replay ───────────────────────────────────────────────────────────
const runB = runScenario();
record('K-10', 'the whole customer journey replays to an identical outcome',
  Boolean(runA.digest) && runA.digest === runB.digest,
  runA.digest && runB.digest
    ? (runA.digest === runB.digest
      ? `${runB.steps.length} properties replayed identically, digest ${runA.digest.slice(0, 24)}…`
      : `replay diverged: ${runA.digest.slice(0, 16)} vs ${runB.digest.slice(0, 16)}`)
    : 'replay could not execute');

// ── The package is deterministic ────────────────────────────────────────────
record('K-8.d', 'two builds of the same release produce a byte-identical package',
  Boolean(runA.package?.contentHash) && runA.package?.contentHash === runB.package?.contentHash,
  runA.package && runB.package
    ? (runA.package.contentHash === runB.package.contentHash
      ? `content hash ${runA.package.contentHash.slice(0, 24)}… over ${runA.package.fileCount} files`
      : 'the package differed between builds — a customer could not verify what they hold')
    : 'no package was built');

// ── Write the package ───────────────────────────────────────────────────────
/**
 * Written from the validated run, and only when that run passed.
 *
 * A package on disk from a failed validation is worse than no package: it is
 * indistinguishable from a good one, and it is the artefact a customer trusts.
 */
let publishedHash = null;
if (failures === 0 && runA.package?.shippable) {
  const written = writePackage();
  // Recorded ONLY when the package was actually written. Recording the in-memory hash
  // of a package the harness refused to publish would make the evidence claim a hash
  // for a file that does not exist — and the next gate run would compare the disk
  // against it and report a mismatch it could not explain. That is a manufactured
  // inconsistency, and it looks exactly like a real one.
  publishedHash = written.count > 0 ? written.contentHash ?? null : null;
  record('K-11', 'the Customer Success Package is published from the validated run',
    written.count > 0, `${written.count} files written to docs/customer-success-package/`);
} else {
  blocked('K-11', 'the Customer Success Package is published',
    failures > 0
      ? 'a customer readiness property failed — publishing a package from a failed validation would ship an artefact indistinguishable from a good one'
      : `the package reported itself unshippable: ${(runA.package?.blockers ?? []).join('; ')}`);
}

function writePackage() {
  // The emitter is handed THIS run's observations, not left to find them. Reading them
  // from a previously written evidence file would mean the package could be built from
  // the last release's observations while claiming to describe this one.
  const observations = path.join(os.tmpdir(), `dbiz-observations-${process.pid}.json`);
  fs.writeFileSync(observations, JSON.stringify({
    observedResponses: runA.observedResponses ?? [],
    knownFailures: runA.knownFailures ?? [],
    unmeasured: runA.unmeasured ?? [],
    onboardingDurationMs: runA.onboardingDurationMs ?? null,
  }), 'utf8');
  try {
    const r = spawnSync(process.execPath, [path.join(OUT, 'emit-package.mjs'), PACKAGE_DIR, observations],
      { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
    if (r.status !== 0) return { count: 0, error: (r.stderr || '').slice(0, 300) };
    try { return JSON.parse(r.stdout); } catch { return { count: 0, error: 'emitter produced no parseable result' }; }
  } finally {
    fs.rmSync(observations, { force: true });
  }
}

// ── What is NOT measured, with the blocker named ────────────────────────────
line('\nBlocked properties — none is simulated');

blocked('K-12', 'a customer completes onboarding in under 30 minutes',
  'no customer has been observed. The AUTOMATED path is measured (K-1); the human path — reading, deciding, obtaining approvals — has no observation and is not modelled');
blocked('K-13', 'generated example test suites execute successfully',
  'Playwright, Selenium, JUnit, NUnit and pytest are not installed here. Scaffolding is generated and validated; running a customer suite is not, and is not claimed');
blocked('K-14', 'installation validated on a clean environment for every supported target',
  'requires a clean-environment runner per language (C-25.1, R-25.6). Generation is validated for all six targets (K-2); installation is not');
blocked('K-15', 'deployment guides reproduce successfully',
  'Docker unavailable — unchanged since M2.5, and the same blocker as operational E-2');

// ── Evidence ────────────────────────────────────────────────────────────────
const gitOrNull = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

const evidence = {
  evidenceId: 'customer-readiness',
  generator: 'governance/customer-success/run-customer-evidence.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: gitOrNull(['rev-parse', 'HEAD']),
  adrReference: ['ADR-0018', 'ADR-0021'],
  ruleReference: ['C-25.1', 'C-25.3', 'C-25.5', 'C-25.6', 'C-25.8', 'C-25.9',
    'C-25.11', 'C-25.12', 'C-25.13', 'R-25.1', 'R-25.34', 'R-13.3', 'R-14.2'],
  timestamp: new Date().toISOString(),
  onboardingDurationMs: runA.onboardingDurationMs ?? null,
  // The hash of what was PUBLISHED, or null when nothing was. Never the hash of a
  // package that was built and then withheld.
  packageContentHash: publishedHash,
  packageFileCount: publishedHash ? (runA.package?.fileCount ?? null) : null,
  proven,
  unmeasured,
  summary: {
    provenTotal: proven.length,
    provenPassed: proven.filter((p) => p.passed).length,
    unmeasuredTotal: unmeasured.length,
  },
  verificationStatus: failures === 0 ? 'verified' : 'failed',
  // NOT MEASURED can never be counted as a pass (R-13.3), so full certification is
  // withheld while any remains — regardless of how good the reason is.
  certificationStatus: failures !== 0 ? 'uncertified'
    : unmeasured.length === 0 ? 'certified' : 'partially-certified',
  certificationBlockers: unmeasured.map((u) => `${u.id}: ${u.blocker}`),
};
evidence.contentHash = crypto.createHash('sha256')
  .update('dbiz.customer-readiness-evidence@1').update(Buffer.from([0]))
  .update(JSON.stringify(evidence, Object.keys(evidence).sort()))
  .digest('hex');

fs.writeFileSync(path.join(OUT, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
line(`${evidence.summary.provenPassed}/${evidence.summary.provenTotal} proven · ${unmeasured.length} NOT MEASURED`);
if (failures === 0) {
  line('RESULT: PASS — every executable customer readiness property holds.');
  line(`Customer readiness is PARTIALLY certified: ${unmeasured.length} properties remain unmeasured,`);
  line('each with a named blocker. None was simulated.');
  if (evidence.onboardingDurationMs !== null) {
    line(`Automated onboarding measured at ${(evidence.onboardingDurationMs).toFixed(0)}ms across 7 steps.`);
  }
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
