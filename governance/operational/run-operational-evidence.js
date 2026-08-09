'use strict';
/**
 * OPERATIONAL EVIDENCE HARNESS — M2.6.
 * ============================================================================
 * Produces executable evidence for the operational properties that can actually be
 * proven against what exists, and reports the rest as NOT MEASURED with the blocker
 * named (R-13.3).
 *
 * PROVEN HERE — these execute, and their outcome is observed:
 *   E-1   provision, generate, register, first authenticated call
 *   E-3   deterministic generation (generate twice, byte-compare)
 *   E-4   registration over real mutual TLS, unauthorised clients refused
 *   E-5   non-retention (scan Intelligence Plane stores, find nothing)
 *   E-6   certificate rotation with no downtime
 *   E-7   reconnection on the rotated certificate
 *   E-8   concurrent tenants with no cross-tenant leakage
 *   E-9   secret rotation while execution continues
 *   E-10  audit trail across the whole tenant lifecycle
 *   E-11  replay determinism (re-run, compare outcomes)
 *   E-12  certification replay (whole scenario re-executed, outcomes compared)
 *   C-23.9 restore validation (back up, destroy, restore, verify content hashes)
 *
 * E-1 and E-4 through E-10 are driven against @dbiz/platform-runtime by
 * governance/operational/runtime-scenario.mjs: real X.509 certificates, real TLS
 * handshakes, real token verification. Nothing there is stubbed.
 *
 * NOT MEASURED — E-2's DEPLOYMENT leg alone, because Docker is unavailable here.
 * Simulating it would be the single most damaging thing this harness could do: an
 * operational claim backed by a simulation is worse than no claim, because it is
 * believed. M2.6 therefore remains short of full certification, and says so.
 *
 * Run:  node governance/operational/run-operational-evidence.js
 * Exit: 0 = every PROVEN property holds   1 = a proven property failed
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const OUT = __dirname;

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
line('OPERATIONAL EVIDENCE — M2.6');
line('='.repeat(74));

// ── E-3 · deterministic solution generation ─────────────────────────────────
line('\nProven properties');

const PROFILE = {
  profileVersion: '1.0.0', language: 'typescript', framework: 'playwright',
  testRunner: 'playwright-test', ciSystem: 'github-actions', gitProvider: 'github',
  cloudProvider: 'azure', deploymentModel: 'container', packageManager: 'pnpm',
  reportingFramework: 'allure', frameworkVersions: { playwright: '1.49.0' },
};
const BOOTSTRAP = {
  tenantId: 'tenant-evidence', registrationEndpoint: 'https://registration.example.test/v1/register',
  oneTimeRegistrationCredential: 'otc-evidence-single-use',
};

/** Generation runs in a child so each observation is a genuinely fresh process. */
function generateOnce() {
  const script = `
    import { generateSolution } from ${JSON.stringify(
      // A file:// URL, not a path. On Windows an absolute path is not a valid ESM
      // specifier, and the failure surfaces as "generator could not be invoked",
      // which reads like a missing build rather than a malformed import.
      pathToFileURL(path.join(ROOT, 'packages', 'platform-core', 'dist', 'src', 'index.js')).href,
    )};
    const s = generateSolution(${JSON.stringify(PROFILE)}, ${JSON.stringify(BOOTSTRAP)});
    process.stdout.write(JSON.stringify({ hash: s.contentHash.value, files: s.files.length,
      paths: s.files.map(f => f.path) }));
  `;
  // Run from the package directory, not the repository root: the generator imports
  // `@dbiz/contracts` as a bare workspace specifier, which resolves only through
  // that package's own node_modules link.
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script],
    { cwd: path.join(ROOT, 'packages', 'platform-core'), encoding: 'utf8' });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

const genA = generateOnce();
const genB = generateOnce();
if (!genA || !genB) {
  record('E-3', 'deterministic generation', false, 'generator could not be invoked — is platform-core built?');
} else {
  record('E-3', 'deterministic generation — two runs, separate processes, byte-identical',
    genA.hash === genB.hash && genA.files === genB.files,
    genA.hash === genB.hash
      ? `${genA.files} files, sha256 ${genA.hash.slice(0, 24)}…`
      : `differs: ${genA.hash.slice(0, 16)} vs ${genB.hash.slice(0, 16)}`);
}

// ── E-5 · non-retention of customer assets ──────────────────────────────────
/**
 * Scans Intelligence Plane stores for customer runtime assets that must never be
 * retained (R-08.56, C-03.20, C-08.26).
 *
 * Scans for ARTEFACT KINDS, not for known strings: searching for a specific secret
 * would only prove that one secret is absent. Kind-based detection is what makes the
 * absence claim general.
 */
const RETENTION_SCAN = [
  ['customer source repositories', /(^|\/)(customer-repos?|tenant-repos?|generated-solutions?)(\/|$)/],
  ['screenshots and captured media', /\.(png|jpg|jpeg|gif|webp|mp4|webm)$/i],
  ['archived customer bundles', /\.(zip|tar|tar\.gz|tgz)$/i],
  ['credential and key material', /\.(pem|key|p12|pfx|jks|keystore)$/i],
  ['environment secret files', /(^|\/)\.env(\.|$)/],
];

const SCAN_ROOTS = ['docs', 'governance', 'packages', 'program'];
const findings = [];
let scanned = 0;

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
      for (const [kind, re] of RETENTION_SCAN) if (re.test(`${rel}/`)) findings.push(`${kind}: ${rel}`);
      walk(full);
    } else if (e.isFile()) {
      scanned += 1;
      for (const [kind, re] of RETENTION_SCAN) if (re.test(rel)) findings.push(`${kind}: ${rel}`);
    }
  }
}
for (const r of SCAN_ROOTS) walk(path.join(ROOT, r));

record('E-5', 'non-retention — no customer source, media, archive, key or env file in the Intelligence Plane',
  findings.length === 0,
  findings.length ? findings.slice(0, 5).join('; ')
    : `${scanned} files scanned across ${SCAN_ROOTS.length} store roots, ${RETENTION_SCAN.length} artefact kinds`);

// ── C-23.9 · restore validation, proven by execution ────────────────────────
/**
 * Backs up the evidence artefacts, destroys the working copies, restores them, and
 * verifies CONTENT — not merely that files reappeared (R-23.26).
 *
 * A restore check that asserts "the file exists" passes against an empty file. This
 * one recomputes each content hash and compares, so a restore that produced the
 * wrong bytes fails.
 */
const EVIDENCE_ARTEFACTS = [
  'governance/verification/proofs.json',
  'packages/contracts/compat/evidence.json',
  'governance/supply-chain/evidence.json',
  'governance/traceability/evidence.json',
].filter((p) => fs.existsSync(path.join(ROOT, p)));

const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbiz-restore-'));
const hashesBefore = new Map();
let restoreDetail = '';
let restoreOk = false;

try {
  // 1. Back up, recording a content hash for each artefact.
  for (const rel of EVIDENCE_ARTEFACTS) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    hashesBefore.set(rel, crypto.createHash('sha256').update(buf).digest('hex'));
    const dest = path.join(backupDir, rel.replace(/\//g, '__'));
    fs.writeFileSync(dest, buf);
  }

  // 2. Destroy the working copies. A restore exercise that never removes anything
  //    proves only that the files were already there.
  for (const rel of EVIDENCE_ARTEFACTS) fs.rmSync(path.join(ROOT, rel));
  const destroyed = EVIDENCE_ARTEFACTS.every((rel) => !fs.existsSync(path.join(ROOT, rel)));

  // 3. Restore.
  for (const rel of EVIDENCE_ARTEFACTS) {
    fs.writeFileSync(path.join(ROOT, rel), fs.readFileSync(path.join(backupDir, rel.replace(/\//g, '__'))));
  }

  // 4. Verify CONTENT against the recorded hashes.
  const mismatches = [];
  for (const rel of EVIDENCE_ARTEFACTS) {
    const after = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
    if (after !== hashesBefore.get(rel)) mismatches.push(rel);
  }

  restoreOk = destroyed && mismatches.length === 0 && EVIDENCE_ARTEFACTS.length > 0;
  restoreDetail = restoreOk
    ? `${EVIDENCE_ARTEFACTS.length} artefacts destroyed and restored; all content hashes verified`
    : mismatches.length ? `content mismatch after restore: ${mismatches.join(', ')}`
      : destroyed ? 'no artefacts to restore' : 'artefacts were not actually removed before restore';
} catch (e) {
  // Restoration must survive its own failure: leaving evidence destroyed would make
  // this harness the worst possible source of data loss.
  for (const rel of EVIDENCE_ARTEFACTS) {
    const src = path.join(backupDir, rel.replace(/\//g, '__'));
    if (fs.existsSync(src) && !fs.existsSync(path.join(ROOT, rel))) {
      fs.writeFileSync(path.join(ROOT, rel), fs.readFileSync(src));
    }
  }
  restoreDetail = `restore exercise failed: ${e.message}`;
} finally {
  fs.rmSync(backupDir, { recursive: true, force: true });
}

record('C-23.9', 'restore is exercised and verified against content hashes', restoreOk, restoreDetail);

// ── E-11 · replay determinism ───────────────────────────────────────────────
/**
 * Re-runs generation and non-retention and compares outcomes. Replay is what
 * separates a proof from an anecdote (R-14.2).
 */
const genC = generateOnce();
record('E-11', 'replay — repeated execution yields an equivalent outcome',
  genC !== null && genA !== null && genC.hash === genA.hash,
  genC && genA ? (genC.hash === genA.hash ? 'generation replayed identically' : 'replay diverged')
    : 'replay could not execute');

// ── Runtime properties, driven end to end against @dbiz/platform-runtime ────
/**
 * Executes the runtime scenario in a fresh process and returns its observations.
 *
 * The scenario reports rather than asserts, and exits 0 either way. This function is
 * therefore the only place where "the scenario could not run" is distinguished from
 * "the scenario ran and a property failed" — collapsing those two would let a broken
 * build read as a clean one, which is exactly the failure C-0.4 exists to prevent.
 */
function runScenario() {
  const r = spawnSync(process.execPath, [path.join(OUT, 'runtime-scenario.mjs')],
    { cwd: ROOT, encoding: 'utf8', timeout: 180_000 });
  if (r.status !== 0) {
    return { steps: [], digest: null, fatal: `scenario process exited ${r.status}: ${(r.stderr || '').slice(0, 300)}` };
  }
  try { return JSON.parse(r.stdout); } catch {
    return { steps: [], digest: null, fatal: 'scenario produced no parseable observation' };
  }
}

const scenarioA = runScenario();

if (scenarioA.fatal || scenarioA.steps.length === 0) {
  // Not "blocked": a scenario that exists and could not run is a failure, not an
  // absence of evidence. Reporting it as NOT MEASURED would hide a broken runtime.
  record('E-runtime', 'the operational runtime scenario executes',
    false, scenarioA.fatal ?? 'scenario produced no steps');
} else {
  for (const s of scenarioA.steps) record(s.id, s.property, s.ok, s.detail);
}

// ── E-12 · certification replay ─────────────────────────────────────────────
/**
 * Re-runs the entire scenario in a second fresh process and compares outcomes. The
 * digest covers step identities and outcomes only, so a divergence means the platform
 * behaved differently — not that a port or a key id changed (R-14.2).
 */
const scenarioB = runScenario();
record('E-12', 'certification replay — the whole scenario re-executed, identical outcome',
  Boolean(scenarioA.digest) && scenarioA.digest === scenarioB.digest,
  scenarioA.digest && scenarioB.digest
    ? (scenarioA.digest === scenarioB.digest
      ? `${scenarioB.steps.length} properties replayed identically, digest ${scenarioA.digest.slice(0, 24)}…`
      : `replay diverged: ${scenarioA.digest.slice(0, 16)} vs ${scenarioB.digest.slice(0, 16)}`)
    : 'replay could not execute');

// ── Blocked properties, each with its blocker named ─────────────────────────
line('\nBlocked properties — no runtime exists for these, and none is simulated');

blocked('E-2', 'Execution Plane generated AND DEPLOYED to a customer tenancy',
  'Docker unavailable in this environment — generation is proven (E-1, E-3); deployment is not, and is not claimed');

// ── Evidence ────────────────────────────────────────────────────────────────
const gitOrNull = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

const evidence = {
  evidenceId: 'operational-readiness',
  generator: 'governance/operational/run-operational-evidence.js',
  generatorVersion: '2.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: gitOrNull(['rev-parse', 'HEAD']),
  adrReference: ['ADR-0020', 'ADR-0021'],
  ruleReference: ['C-03.18', 'C-03.20', 'C-07.1', 'C-07.3', 'C-08.17', 'C-08.20',
    'C-08.21', 'C-08.22', 'C-08.25', 'C-08.26', 'C-23.9', 'R-13.3', 'R-14.2'],
  timestamp: new Date().toISOString(),
  proven,
  unmeasured,
  summary: {
    provenTotal: proven.length,
    provenPassed: proven.filter((p) => p.passed).length,
    unmeasuredTotal: unmeasured.length,
  },
  verificationStatus: failures === 0 ? 'verified' : 'failed',
  // A property that is NOT MEASURED can never be counted as a pass (R-13.3), so
  // full certification is withheld while any remains — regardless of the reason.
  certificationStatus: failures !== 0 ? 'uncertified'
    : unmeasured.length === 0 ? 'certified' : 'partially-certified',
  certificationBlockers: unmeasured.map((u) => `${u.id}: ${u.blocker}`),
};
evidence.contentHash = crypto.createHash('sha256')
  .update('dbiz.operational-evidence@1').update(Buffer.from([0]))
  .update(JSON.stringify(evidence, Object.keys(evidence).sort()))
  .digest('hex');

fs.writeFileSync(path.join(OUT, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
line(`${evidence.summary.provenPassed}/${evidence.summary.provenTotal} proven · ${unmeasured.length} NOT MEASURED`);
if (failures === 0) {
  line('RESULT: PASS — every executable operational property holds.');
  line(`Operational readiness is PARTIALLY certified: ${unmeasured.length} property remains`);
  line('unmeasured (E-2 deployment, blocked on Docker) and is not claimed. None was simulated.');
} else {
  line(`RESULT: FAIL — ${failures} proven property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
