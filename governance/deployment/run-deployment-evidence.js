'use strict';
/**
 * DEPLOYMENT EVIDENCE HARNESS — E-2 and General Availability.
 * ============================================================================
 * Runs the deployment probe, replays it, and emits machine-readable evidence carrying
 * the General Availability determination.
 *
 * THIS HARNESS EXISTS TO MAKE ONE THING IMPOSSIBLE.
 * Not to certify GA — it cannot, and on this machine it never will. It exists so that
 * **General Availability cannot be claimed without measured deployment evidence**, and
 * so the reason it is withheld is a measurement rather than a sentence somebody wrote.
 *
 * "Docker is unavailable" was carried as a stated blocker from M2.5 to M2.8. A stated
 * blocker is an assertion, and R-13.1 does not accept assertions as evidence. It is
 * now the output of a probe that enumerates eight runtimes across the PATH and every
 * known install location — so if a runtime appears, the blocker disappears on the next
 * run, without anyone remembering to edit anything.
 *
 * THE GA DETERMINATION IS COMPUTED, NEVER WRITTEN.
 * `generalAvailability` is derived from E-2's status by a single expression. There is
 * no branch, no override and no configuration flag that can set it to CERTIFIED while
 * E-2 is anything other than PASS. That is deliberate: the failure this programme is
 * most exposed to now is not a broken measurement — it is someone, under pressure,
 * writing the word CERTIFIED somewhere a measurement should have gone.
 *
 * Run:  node governance/deployment/run-deployment-evidence.js
 * Exit: 0 = the evidence is internally consistent   1 = it is not
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = __dirname;
const PROBE = path.join(OUT, 'run-deployment-probe.mjs');

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
line('DEPLOYMENT EVIDENCE — E-2 and General Availability');
line('='.repeat(74));

function runProbe() {
  const r = spawnSync(process.execPath, [PROBE],
    { cwd: ROOT, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) return { fatal: `probe exited ${r.status}: ${(r.stderr || '').slice(0, 400)}` };
  try { return JSON.parse(r.stdout); } catch { return { fatal: 'probe produced no parseable observation' }; }
}

line('\nDeployment capability');
const probeA = runProbe();

if (probeA.fatal) {
  // A probe that cannot run is a FAILURE, not an absence of evidence. Reporting it as
  // NOT MEASURED would hide a broken probe behind a word that means "we did not look".
  record('E-2.probe', 'the deployment probe executes', false, probeA.fatal);
} else {
  record('E-2.probe', 'the deployment probe executes and reports what it searched', true,
    `${probeA.searched.length} runtimes searched; ${probeA.searched.filter((s) => s.daemonResponds).length} usable`);

  for (const s of probeA.searched) {
    line(`            ${s.daemonResponds ? 'USABLE ' : '  --   '} ${s.id.padEnd(10)} ${s.detail}`);
  }

  // ── E-2 itself ────────────────────────────────────────────────────────────
  const e2 = probeA.e2;
  if (e2.status === 'PASS') {
    record('E-2', e2.property, true, e2.detail);
  } else if (e2.status === 'FAIL') {
    record('E-2', e2.property, false, e2.detail);
  } else {
    blocked('E-2', e2.property, e2.blocker);
  }

  // The descriptor existing is NOT evidence, and is recorded as its own observation so
  // nobody can mistake its presence for a measurement (C-17.3).
  record('E-2.d', 'the image descriptor is reported as unverified while it has never been built',
    probeA.imageDescriptorPresent === true && e2.status !== 'PASS'
      ? /NEVER been built/i.test(e2.detail)
      : true,
    probeA.imageDescriptorPresent
      ? 'deploy/Dockerfile exists and is reported as never built and never started'
      : 'no descriptor present');
}

// ── Replay ──────────────────────────────────────────────────────────────────
line('\nReplay');
const probeB = runProbe();
record('E-2.replay', 'the deployment probe replays to an identical outcome',
  Boolean(probeA.digest) && probeA.digest === probeB.digest,
  probeA.digest && probeB.digest
    ? (probeA.digest === probeB.digest
      ? `identical, digest ${probeA.digest.slice(0, 24)}…`
      : 'replay diverged')
    : 'replay could not execute');

// ── The dependent gates ─────────────────────────────────────────────────────
line('\nBlocked by E-2 — none is simulated');

const e2Passed = probeA.e2 && probeA.e2.status === 'PASS';
if (!e2Passed) {
  // Every GA sub-gate the mission names. Each is blocked by the SAME root cause, and
  // each is listed rather than collapsed — a single line saying "deployment blocked"
  // would understate how much of the certification is downstream of one dependency.
  const dependents = [
    ['GA-1', 'deployment replay passes'],
    ['GA-2', 'restart replay passes against a deployed runtime'],
    ['GA-3', 'recovery replay passes against a deployed runtime'],
    ['GA-4', 'security replay passes against a deployed runtime'],
    ['GA-5', 'performance replay passes against a deployed runtime'],
    ['GA-6', 'tenant isolation replay passes against a deployed runtime'],
    ['GA-7', 'observability replay passes against a deployed runtime'],
    ['GA-8', 'operational replay passes against a deployed runtime'],
    ['GA-9', 'container startup, shutdown, restart, upgrade and rollback'],
    ['GA-10', 'certificate, signing key and configuration persistence across a container restart'],
  ];
  for (const [id, property] of dependents) {
    blocked(id, property, 'E-2 is NOT MEASURED — there is no deployed runtime to replay against. Every one of these is a measurement of a running deployment, and none can be inferred from the in-process evidence that M2.6-M2.8 produced');
  }
}

// ── The determination ───────────────────────────────────────────────────────
// COMPUTED from E-2. One expression, no branch, no override, no flag.
const generalAvailability = e2Passed ? 'CERTIFIED' : 'NOT CERTIFIED';
const gaReason = e2Passed
  ? 'E-2 has PASS evidence: the image built, started, and served a real request'
  : 'Deployment evidence unavailable. E-2 is NOT MEASURED because no container runtime exists in this environment.';

line('\n' + '='.repeat(74));
line(`GENERAL AVAILABILITY: ${generalAvailability}`);
line(`Reason: ${gaReason}`);

// ── Reports, generated from what the probe observed ─────────────────────────
if (failures === 0) {
  const written = writeReports();
  record('E-2.r', 'the deployment reports are generated from the probe output',
    written.length > 0, `${written.length} reports written to docs/deployment/`);
}

function writeReports() {
  // The emitter is handed THIS run's observations rather than left to find them, so a
  // determination can never be published from a previous run's evidence.
  const observations = path.join(require('os').tmpdir(), `dbiz-deploy-obs-${process.pid}.json`);
  fs.writeFileSync(observations, JSON.stringify({
    generalAvailability, generalAvailabilityReason: gaReason,
    e2: probeA.e2 ?? null,
    searched: probeA.searched ?? [],
    imageDescriptorPresent: probeA.imageDescriptorPresent ?? false,
    deployPathExercised: probeA.deployPathExercised ?? false,
    digest: probeA.digest ?? null,
    unmeasured,
  }), 'utf8');
  try {
    const r = spawnSync(process.execPath,
      [path.join(OUT, 'emit-deployment-docs.mjs'), path.join(ROOT, 'docs', 'deployment'), observations],
      { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
    if (r.status !== 0) return [];
    try { return JSON.parse(r.stdout).written ?? []; } catch { return []; }
  } finally {
    fs.rmSync(observations, { force: true });
  }
}

// ── Evidence ────────────────────────────────────────────────────────────────
const gitOrNull = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

const evidence = {
  evidenceId: 'deployment-and-general-availability',
  generator: 'governance/deployment/run-deployment-evidence.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: gitOrNull(['rev-parse', 'HEAD']),
  adrReference: ['ADR-0020', 'ADR-0021'],
  ruleReference: ['C-17.1', 'C-17.3', 'C-17.4', 'R-17.1', 'R-13.1', 'R-13.3', 'R-14.2'],
  timestamp: new Date().toISOString(),
  generalAvailability,
  generalAvailabilityReason: gaReason,
  e2: probeA.e2 ?? null,
  runtimesSearched: probeA.searched ?? [],
  deployPathExercised: probeA.deployPathExercised ?? false,
  proven,
  unmeasured,
  summary: {
    provenTotal: proven.length,
    provenPassed: proven.filter((p) => p.passed).length,
    unmeasuredTotal: unmeasured.length,
  },
  verificationStatus: failures === 0 ? 'verified' : 'failed',
  certificationStatus: failures !== 0 ? 'uncertified'
    : unmeasured.length === 0 ? 'certified' : 'partially-certified',
  certificationBlockers: unmeasured.map((u) => `${u.id}: ${u.blocker}`),
};
evidence.contentHash = crypto.createHash('sha256')
  .update('dbiz.deployment-evidence@1').update(Buffer.from([0]))
  .update(JSON.stringify(evidence, Object.keys(evidence).sort()))
  .digest('hex');

fs.writeFileSync(path.join(OUT, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('');
line(`${evidence.summary.provenPassed}/${evidence.summary.provenTotal} measured · ${unmeasured.length} NOT MEASURED`);
if (failures === 0) {
  line('RESULT: PASS — the deployment evidence is internally consistent.');
  if (!e2Passed) {
    line('');
    line('This PASS means the ABSENCE was measured correctly. It does not mean the');
    line('platform is deployable, and it must never be summarised as though it did.');
  }
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
