'use strict';
/**
 * GOVERNANCE — EP↔IP registration & trust-establishment conformance.
 * ============================================================================
 * Regenerates the registration conformance evidence and gates on it (R-14.2). A committed result
 * would keep asserting the trust boundary holds long after a change made an OTC replayable, a
 * refusal silent in the audit, or an EP credential able to cross tenants — the declared-but-unbuilt
 * failure at the plane boundary, which is exactly what this gate exists to catch.
 *
 * ENFORCES (ADR-0036, added with this gate — D-012):
 *   R-36.1  the EP authenticates only with a tenant-scoped, least-privilege, versioned credential
 *   R-36.2  the OTC is single-use (replay refused); a post-consume failure is rolled back, not burned
 *   R-36.3  INV-2 — the IP holds the OTC only as a hash; no OTC/credential value at rest or in audit
 *   R-36.4  Zero Trust — tenant/OTC binding, environment, contract version all verified before issuance
 *   R-36.5  one identity per tenant; no cross-tenant registration or credential use (C-07.11)
 *   R-36.8  every trust event — issuance, success and every refusal — is audited, carrying no secret
 *
 * ADR: ADR-0036.
 * Run:  node governance/verification/verify-registration-conformance.js
 * Exit: 0 = every property holds   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCENARIO = path.join(ROOT, 'governance', 'registration', 'run-registration-conformance.mjs');
const EVIDENCE = path.join(ROOT, 'governance', 'registration', 'evidence.json');
const PACKAGE = path.join(ROOT, 'packages', 'tenant-onboarding-engine', 'dist', 'src', 'index.js');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — EP↔IP registration & trust-establishment conformance');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
check('the tenant-onboarding-engine package is built', fs.existsSync(PACKAGE),
  fs.existsSync(PACKAGE) ? 'packages/tenant-onboarding-engine/dist/src/index.js' : 'not built — run: pnpm --filter @dbiz/tenant-onboarding-engine build');
check('the conformance scenario exists', fs.existsSync(SCENARIO),
  fs.existsSync(SCENARIO) ? 'governance/registration/run-registration-conformance.mjs' : 'absent');

if (!fs.existsSync(PACKAGE) || !fs.existsSync(SCENARIO)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — registration conformance cannot be evidenced.');
  line('');
  process.exit(1);
}

// ── 2. Execute ──────────────────────────────────────────────────────────────
line('\n2. Scenario execution');
const run = spawnSync(process.execPath, [SCENARIO], { cwd: ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });

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

  // The property SET must not shrink — a scenario that quietly stopped exercising a property
  // would report everything it did run as passing.
  const ids = new Set(observed.properties.map((p) => p.id));
  const expected = ['RG-1', 'RG-2', 'RG-3', 'RG-4', 'RG-5', 'RG-6', 'RG-7', 'RG-8'];
  const absent = expected.filter((id) => !ids.has(id));
  check('no conformance property has been dropped', absent.length === 0,
    absent.length ? `missing: ${absent.join(', ')}` : `${expected.length} properties present`);

  // The properties most load-bearing to the security claim, named individually.
  for (const [id, label] of [
    ['RG-1', 'a valid OTC authenticates the EP (401→200)'],
    ['RG-2', 'the OTC is single-use (R-36.2)'],
    ['RG-3', 'no cross-tenant registration; refusal does not consume (C-07.11)'],
    ['RG-4', 'least privilege — no cross-tenant read, no onboarding PATCH'],
    ['RG-5', 'INV-2 — hash-only at rest; no secret in audit'],
    ['RG-8', 'a post-consume failure is rolled back, not burned'],
  ]) {
    const p = observed.properties.find((x) => x.id === id);
    check(label, p !== undefined && p.ok === true, p ? p.detail.slice(0, 150) : `${id} absent`);
  }

  // ── 3. Evidence ─────────────────────────────────────────────────────────────
  const evidence = {
    evidenceId: 'registration-conformance',
    generator: 'governance/verification/verify-registration-conformance.js',
    generatorVersion: '1.0.0',
    executionContext: `node ${process.version} on ${process.platform}`,
    repository: 'DBiz_IntelligencePlane',
    service: 'ep-ip-registration',
    timestamp: new Date().toISOString(),
    adrReference: ['ADR-0036'],
    ruleReference: ['R-36.1', 'R-36.2', 'R-36.3', 'R-36.4', 'R-36.5', 'R-36.8', 'C-07.11', 'INV-2', 'INV-3'],
    properties: observed.properties,
    digest: observed.digest,
    verificationStatus: failures === 0 ? 'verified' : 'failed',
  };
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the EP↔IP registration flow conforms to ADR-0036.');
  line('An OTC is single-use, tenant-bound, hash-only at rest; the credential is least-privilege and');
  line('cannot cross tenants; every trust event is audited. The 401 is closed without a security regression.');
} else {
  line(`RESULT: FAIL — ${failures} conformance property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
