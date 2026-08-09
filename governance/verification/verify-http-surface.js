'use strict';
/**
 * GOVERNANCE — deployed HTTP surface security.
 * ============================================================================
 * THE GAP THIS CLOSES, STATED PLAINLY.
 *
 * This suite had 58 gates, 825 tests, 55 ADRs, 417 conformance criteria and 24 certification reports
 * when a single request — `DELETE /api/tenants/%2e%2e` — recursively removed the entire state volume:
 * every tenant manifest, the OTC store, the append-only audit trail and the EP package-signing key.
 *
 * It survived all of that apparatus for a structural reason, not an accidental one. Every other gate
 * here inspects the DESIGN: module shape, contract conformance, domain purity, bounded contexts, ADR
 * traceability. The defect was in the ADAPTER between the network and the design. `route()` was tested
 * as a pure function and was correct; `FileTenantConfigStore` composed `join(rootDir, slug)` and was
 * never asked what it would do with `..`. No gate opened a socket, so no gate could see it.
 *
 * This gate opens a socket. It drives the ASSEMBLED application over raw TCP — deliberately bypassing
 * client-side URL normalisation, which silently rewrites `..` and produced false negatives during the
 * original investigation — and asserts the properties an attacker actually probes.
 *
 * ENFORCES:
 *   C-07.11  tenant scope comes from the authenticated principal; no cross-tenant read or mutation
 *   R-33.5   authentication is a production precondition on every protected route
 *   CWE-22   no slug composes a filesystem path outside the tenant root
 *   CWE-209  no internal exception text reaches a caller
 *   CWE-306  no protected route is reachable without a credential
 *   C-23.11  every request is recorded, and no secret or PII appears in a log line
 *
 * TWO INDEPENDENT CHECKS, DELIBERATELY.
 *   1. The suite passes.
 *   2. The suite still COVERS what it is supposed to cover. A gate that only runs a test file is
 *      defeated by deleting tests from it — the file would pass vacuously and the gate would stay
 *      green. So the required coverage areas are asserted by name, and a minimum test count is
 *      enforced. Weakening the suite now fails the gate instead of silencing it.
 *
 * ADR: ADR-0033 (production web tier) · ADR-0019 (evidence over assertion) · ADR-0020 (continuous verification).
 * Run:  node governance/verification/verify-http-surface.js
 * Exit: 0 = every property holds   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PKG = path.join(ROOT, 'packages', 'tenant-onboarding-engine');
const EVIDENCE = path.join(ROOT, 'governance', 'http-surface', 'evidence.json');

/**
 * The suites this gate owns. Each asserts a property of the RUNNING system that no design-level gate
 * can observe, and all three are mandatory: a release cannot proceed with any of them missing, failing,
 * or quietly reduced.
 */
const SUITES = [
  {
    name: 'http-surface',
    src: path.join(PKG, 'test', 'http-surface.security.test.ts'),
    built: path.join(PKG, 'dist', 'test', 'http-surface.security.test.js'),
    // Raised 60 → 72 when the sealed-package retrieval probes landed (ADR-0079, D-111), and
    // 72 → 88 when the 401 stopped collapsing (OBL-002). A baseline that is not raised with the
    // suite lets a later deletion of the new tests pass unnoticed.
    minimumTests: 88,
    why: 'the transport adapter, over a raw socket',
  },
  {
    name: 'tenant-rbac',
    src: path.join(PKG, 'test', 'tenant-rbac.security.test.ts'),
    built: path.join(PKG, 'dist', 'test', 'tenant-rbac.security.test.js'),
    minimumTests: 16,
    why: 'identity → role → tenant scope (C-07.11), including fail-closed refusals',
  },
  {
    name: 'persistence-integrity',
    src: path.join(PKG, 'test', 'persistence-integrity.test.ts'),
    built: path.join(PKG, 'dist', 'test', 'persistence-integrity.test.js'),
    minimumTests: 6,
    why: 'atomic writes to the ADR-0032 single source of truth and the OTC store',
  },
];

const SUITE_SRC = SUITES[0].src;

/**
 * Coverage areas this gate REQUIRES the suite to exercise. Each corresponds to a finding that was
 * verified by execution against this repository — they are regression locks, not aspirations.
 */
const REQUIRED_COVERAGE = [
  ['path traversal is refused', 'CWE-22 — the state-volume deletion'],
  ['authentication is required', 'R-33.5 / CWE-306'],
  ['authorisation is enforced', 'C-07.11 — cross-tenant access'],
  ['security headers are present', 'transport hardening'],
  ['CORS denies by default', 'origin policy'],
  ['API documentation is not exposed', 'administrative surface disclosure'],
  ['request bodies are bounded', 'payload limits and error typing'],
  ['rate limiting protects', 'unauthenticated brute force / audit amplification'],
  ['every request is recorded', 'C-23.11 — the platform logged nothing at all'],
  // ADR-0079 P-79.8 / D-111. `GET /api/packages/{hash}` carries no tenant slug, so it reaches none
  // of the tenant router's checks and its own auth block is the only thing between a tenant and
  // another tenant's authored tests. It MUST be proved through the assembled application: the
  // first version of its controller read a `req.principal` that nothing in this application
  // populates, so it answered 401 to the package's rightful owner over a real socket while passing
  // every in-process test. That is this suite's founding class, found again.
  ['sealed package retrieval is tenant-scoped', 'ADR-0079 P-79.8 — the auth block is the sole control, proved through the adapter'],
  // OBL-002. The 401 was byte-identical for a valid credential, a malformed one and none at all,
  // so a caller could form no hypothesis about its own grant that the response could separate —
  // the reach/refusal collapse, in this plane's own auth path. BOTH halves are required coverage:
  // the refusals must SEPARATE on what the caller already knows (did I present a credential?) and
  // stay IDENTICAL on what it does not (why was it refused?). Requiring only the first would be
  // satisfied by an implementation that leaked the reason.
  ['the 401 distinguishes no-credential from credential-refused', 'OBL-002 — the collapse that stopped the far side diagnosing its own grant'],
  ['BYTE-IDENTICAL across all four reasons', 'OBL-002 — the separation must not become a rejection-reason oracle'],
  // D-111's shape one field along: an unwired authenticator answering 401 reports a DEPLOYMENT
  // fault as a CREDENTIAL fault, and sends the far side to rotate a grant that was never at fault.
  ['an unconfigured authenticator is 501, never 401', 'D-111 — operational faults must not present as credential faults'],
];

/** Coverage areas required of the tenant-RBAC suite — the multi-tenancy proof (STEP 4). */
const REQUIRED_RBAC_COVERAGE = [
  ['Entra app roles map to platform roles through a closed table', 'no unrecognised role becomes a default'],
  ['tenant scope is resolved from group membership, fail-closed', 'an unmapped group grants nothing'],
  ['a signed-in identity receives only the access its directory role grants', 'C-07.11 end to end'],
  ['identity resolution fails closed', 'no implicit platform-admin'],
];

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — deployed HTTP surface security');
line('='.repeat(74));

// ── 1. Preconditions ─────────────────────────────────────────────────────────
line('\n1. Preconditions');
for (const s of SUITES) {
  check(`the ${s.name} suite exists in source`, fs.existsSync(s.src),
    fs.existsSync(s.src) ? path.relative(ROOT, s.src) : `${path.relative(ROOT, s.src)} is missing`);
  check(`the ${s.name} suite is built`, fs.existsSync(s.built),
    fs.existsSync(s.built) ? path.relative(ROOT, s.built) : 'run `pnpm -r build` first — NOT RUN is FAIL (C-0.4)');
}

if (failures > 0) {
  line('\n' + '='.repeat(74));
  line(`RESULT: FAIL — ${failures} precondition unmet. The HTTP surface was NOT verified.`);
  line('');
  process.exit(1);
}

// ── 2. Coverage is intact ────────────────────────────────────────────────────
line('\n2. Coverage is intact (the suites still test what they claim to)');
const httpSource = fs.readFileSync(SUITES[0].src, 'utf8');
for (const [needle, why] of REQUIRED_COVERAGE) {
  check(`http-surface covers: ${needle}`, httpSource.includes(needle), why);
}
const rbacSource = fs.existsSync(SUITES[1].src) ? fs.readFileSync(SUITES[1].src, 'utf8') : '';
for (const [needle, why] of REQUIRED_RBAC_COVERAGE) {
  check(`tenant-rbac covers: ${needle}`, rbacSource.includes(needle), why);
}

// ── 3. The suites pass against the assembled system ──────────────────────────
line('\n3. Execution against the assembled application');
let totalPassed = 0;
let totalFailed = 0;
for (const s of SUITES) {
  const run = spawnSync(process.execPath, ['--test', s.built], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const passed = Number((/^# pass (\d+)$/m.exec(output) ?? /ℹ pass (\d+)/.exec(output) ?? [])[1] ?? 0);
  const failed = Number((/^# fail (\d+)$/m.exec(output) ?? /ℹ fail (\d+)/.exec(output) ?? [])[1] ?? 0);
  totalPassed += passed;
  totalFailed += failed;

  check(`${s.name}: every property holds`, run.status === 0 && failed === 0,
    `${passed} passed, ${failed} failed — ${s.why}`);
  check(`${s.name}: still carries at least ${s.minimumTests} tests`, passed + failed >= s.minimumTests,
    `${passed + failed} present (baseline ${s.minimumTests})`);

  if (failed > 0) {
    line(`\n  Failing properties in ${s.name}:`);
    for (const l of output.split('\n').filter((l) => /^\s*(✖|not ok)/.test(l)).slice(0, 20)) line(`    ${l.trim()}`);
  }
}
const passed = totalPassed;
const failed = totalFailed;

// ── 4. Evidence ──────────────────────────────────────────────────────────────
const evidence = {
  gate: 'http-surface-security',
  producedAt: new Date().toISOString(),
  adrReference: ['ADR-0033', 'ADR-0019', 'ADR-0020'],
  ruleReference: ['C-07.11', 'R-33.5', 'C-23.11', 'CWE-22', 'CWE-209', 'CWE-306'],
  coverageAreas: [...REQUIRED_COVERAGE, ...REQUIRED_RBAC_COVERAGE].map(([area]) => area),
  suites: SUITES.map((s) => s.name),
  testsPassed: passed,
  testsFailed: failed,
  transport: 'raw TCP socket (no client-side URL normalisation)',
  verificationStatus: failures === 0 ? 'verified' : 'failed',
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the deployed HTTP surface enforces its security properties.');
  line(`${passed} properties verified over a raw socket: traversal refused, authentication required,`);
  line('tenant scope honoured, headers present, docs closed, bodies bounded, requests recorded.');
} else {
  line(`RESULT: FAIL — ${failures} HTTP-surface property violated.`);
  line('This gate exists because the design-level gates cannot see a defect in the transport adapter.');
}
line('');
process.exit(failures === 0 ? 0 : 1);
