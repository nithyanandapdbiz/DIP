'use strict';
/**
 * GOVERNANCE — tenant lifecycle conformance.
 * ============================================================================
 * Regenerates the TLM conformance evidence and gates on it (R-14.2). A committed
 * result would keep asserting that onboarding provisions a tenant long after a stage
 * became a no-op — and an onboarding orchestrator that silently stopped provisioning,
 * while still reporting success, is the declared-but-unbuilt failure at the platform's
 * front door (R-21.11), which is exactly what this gate exists to catch.
 *
 * ENFORCES (doc 21 §3d, added with this gate — D-012):
 *   C-21.28  the orchestrator completes stages 1-7 and provisions the tenant
 *   C-21.29  stages 8-14 are pending; no ACTIVE without stage 10/11/12 evidence
 *   C-21.30  the projection is derived from canonical state and never gates execution
 *   C-21.31  the onboarding configuration contains no credential field (INV-2)
 * and the invariants it rests on: C-21.16, C-21.6, C-21.18, R-21.5, R-21.11, R-21.29.
 *
 * ADR: ADR-0030.
 * Run:  node governance/verification/verify-tenant-lifecycle-conformance.js
 * Exit: 0 = every property holds   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCENARIO = path.join(ROOT, 'governance', 'tenant-lifecycle', 'run-tenant-lifecycle-conformance.mjs');
const EVIDENCE = path.join(ROOT, 'governance', 'tenant-lifecycle', 'evidence.json');
const PACKAGE = path.join(ROOT, 'packages', 'tenant-onboarding-engine', 'dist', 'src', 'index.js');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — tenant lifecycle conformance');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the tenant-lifecycle package is built', fs.existsSync(PACKAGE),
  fs.existsSync(PACKAGE) ? 'packages/tenant-onboarding-engine/dist/src/index.js' : 'not built — run: pnpm --filter @dbiz/tenant-onboarding-engine build');
check('the conformance scenario exists', fs.existsSync(SCENARIO),
  fs.existsSync(SCENARIO) ? 'governance/tenant-lifecycle/run-tenant-lifecycle-conformance.mjs' : 'absent');

if (!fs.existsSync(PACKAGE) || !fs.existsSync(SCENARIO)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — tenant lifecycle conformance cannot be evidenced.');
  line('');
  process.exit(1);
}

// ── 2. Execute ──────────────────────────────────────────────────────────────
line('\n2. Scenario execution');
const run = spawnSync(process.execPath, [SCENARIO],
  { cwd: ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });

let observed = null;
if (run.status !== 0) {
  check('the scenario executed', false, `exit ${run.status}: ${(run.stderr || '').slice(0, 400)}`);
} else {
  try { observed = JSON.parse(run.stdout); } catch { observed = null; }
  check('the scenario executed and produced observations', observed !== null,
    observed ? `${observed.properties.length} properties` : `no parseable output: ${(run.stdout || '').slice(0, 200)}`);
}

if (observed) {
  check('the scenario did not fail fatally', observed.fatal === null, observed.fatal ?? 'completed');

  const failed = observed.properties.filter((p) => !p.ok);
  check('every conformance property holds', failed.length === 0,
    failed.length ? failed.map((p) => `${p.id}: ${p.detail}`).join('; ') : `${observed.properties.length}/${observed.properties.length}`);

  // The property SET must not shrink — a scenario that quietly stopped exercising a
  // property would report everything it did run as passing.
  const ids = new Set(observed.properties.map((p) => p.id));
  const expected = ['TL-1', 'TL-2', 'TL-3', 'TL-4', 'TL-5', 'TL-6', 'TL-7', 'TL-8'];
  const absent = expected.filter((id) => !ids.has(id));
  check('no conformance property has been dropped', absent.length === 0,
    absent.length ? `missing: ${absent.join(', ')}` : `${expected.length} properties present`);

  // The properties most load-bearing to the honesty of the claim, named individually.
  for (const [id, label] of [
    ['TL-1', 'stages 1-7 provision the tenant (C-21.28)'],
    ['TL-2', 'stages 8-14 pending, never ACTIVE (C-21.29)'],
    ['TL-3', 'no ACTIVE without registration/connectivity/smoke (C-21.16, R-21.29)'],
    ['TL-5', 'no credential is representable (C-21.31, INV-2)'],
    ['TL-8', 'exactly six canonical states (R-21.5)'],
  ]) {
    const p = observed.properties.find((x) => x.id === id);
    check(label, p !== undefined && p.ok === true, p ? p.detail.slice(0, 150) : `${id} absent`);
  }

  // ── 3. Evidence ───────────────────────────────────────────────────────────
  const evidence = {
    evidenceId: 'tenant-lifecycle-conformance',
    generator: 'governance/verification/verify-tenant-lifecycle-conformance.js',
    generatorVersion: '1.0.0',
    executionContext: `node ${process.version} on ${process.platform}`,
    repository: 'DBiz_IntelligencePlane',
    service: 'tenant-lifecycle-management',
    timestamp: new Date().toISOString(),
    adrReference: ['ADR-0030'],
    ruleReference: ['C-21.16', 'C-21.28', 'C-21.29', 'C-21.30', 'C-21.31', 'R-21.5', 'R-21.11', 'R-21.29'],
    properties: observed.properties,
    digest: observed.digest,
    verificationStatus: failures === 0 ? 'verified' : 'failed',
  };
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Tenant Lifecycle Manager conforms to doc 21 §3d.');
  line('Onboarding provisions the tenant; stages 8-14 are pending, never assumed.');
} else {
  line(`RESULT: FAIL — ${failures} conformance property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
