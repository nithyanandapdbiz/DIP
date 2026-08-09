/**
 * CONSUMER COMPATIBILITY HARNESS.
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md §6 · 19-repository-ownership.md §4
 *   ADR          : ADR-0003 · ADR-0004 · ADR-0020 (continuous verification)
 *   Criteria     : C-20.12 (every supported version has a passing compatibility test)
 *                  C-20.7 (unknown fields survive pass-through)
 *                  C-19.11 (an EP may run older than the IP; never the reverse)
 *
 * WHY THIS EXISTS.
 * The Execution Plane is built by customers and upgrades on their calendars, so
 * version skew is the NORMAL state. The commercial promise that a customer may run
 * older than the Intelligence Plane is worth exactly as much as the evidence
 * behind it — and until this harness ran, there was none.
 *
 * WHAT MAKES IT EVIDENCE RATHER THAN A TEST.
 * The fixture corpus is FROZEN and retained permanently. Each fixture was valid
 * under the contract version in its directory name, and it must remain parseable
 * by every later build. A test written against the current schema proves the
 * schema agrees with itself; parsing a fixture frozen at v1.0.0 proves the
 * current build has not broken a consumer that still sends v1.0.0.
 *
 * Emits machine-readable evidence to compat/evidence.json (R-13.1, R-14.4).
 *
 * Run:  node compat/harness.mjs
 * Exit: 0 = compatible   1 = a compatibility property failed
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  parseExecutionPackage, parseEvidenceReference, ExecutionPackageSchema,
  EvidenceReferenceSchema, CONTRACT_VERSION, SUPPORTED_MAJORS, isSupported, majorOf,
} from '../dist/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const BASELINE = join(HERE, 'baseline');

const results = [];
const record = (property, passed, detail) => {
  results.push({ property, passed, detail });
  console.log(`  ${passed ? 'PASS ' : 'FAIL '} ${property}`);
  if (detail) console.log(`         ${detail}`);
};

console.log('');
console.log('CONSUMER COMPATIBILITY HARNESS');
console.log('='.repeat(74));

// ── 1. Backward compatibility: every retained fixture still parses ──────────
console.log('\n1. Backward compatibility');
const versions = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((d) => /^v\d+\.\d+\.\d+$/.test(d)) : [];
let fixtureCount = 0;
const parseFailures = [];

for (const v of versions) {
  for (const f of readdirSync(join(FIXTURES, v)).filter((x) => x.endsWith('.json'))) {
    fixtureCount += 1;
    const raw = JSON.parse(readFileSync(join(FIXTURES, v, f), 'utf8'));
    try {
      if (f.startsWith('execution-package')) parseExecutionPackage(raw);
      else if (f.startsWith('evidence-reference')) parseEvidenceReference(raw);
      else throw new Error('fixture has no recognised contract prefix');
    } catch (e) {
      parseFailures.push(`${v}/${f}: ${e.message.split('\n')[0]}`);
    }
  }
}
record('every retained fixture parses under the current build',
  parseFailures.length === 0 && fixtureCount > 0,
  parseFailures.join('; ') || `${fixtureCount} fixture(s) across ${versions.length} version(s)`);

// ── 2. Unknown fields survive (forward compatibility) ───────────────────────
console.log('\n2. Forward compatibility — unknown fields');
const unknownFixture = join(FIXTURES, 'v1.0.0', 'execution-package.unknown-fields.json');
let unknownOk = false;
let unknownDetail = 'fixture absent';
if (existsSync(unknownFixture)) {
  const raw = JSON.parse(readFileSync(unknownFixture, 'utf8'));
  const parsed = parseExecutionPackage(raw);
  const topPreserved = JSON.stringify(parsed.futureField) === JSON.stringify(raw.futureField);
  const nestedPreserved = parsed.directives?.futureDirective === raw.directives.futureDirective;
  unknownOk = topPreserved && nestedPreserved;
  unknownDetail = unknownOk
    ? 'top-level and nested unknown fields both preserved'
    : `top=${topPreserved} nested=${nestedPreserved}`;
}
record('a newer producer cannot break an older consumer', unknownOk, unknownDetail);

// ── 3. Optional and deprecated fields ───────────────────────────────────────
console.log('\n3. Optional and deprecated fields');
const minimal = JSON.parse(readFileSync(join(FIXTURES, 'v1.0.0', 'execution-package.minimal.json'), 'utf8'));
let optionalOk = true;
let optionalDetail = 'empty collections and absent optionals accepted';
try {
  parseExecutionPackage(minimal);
} catch (e) {
  optionalOk = false;
  optionalDetail = e.message.split('\n')[0];
}
record('a minimal instance omitting every optional still parses', optionalOk, optionalDetail);

// ── 4. Version negotiation ──────────────────────────────────────────────────
console.log('\n4. Version negotiation');
const negotiation = [
  [CONTRACT_VERSION, true, 'the declared version'],
  ['1.99.99', true, 'a later minor within a supported major'],
  ['2.0.0', false, 'an unsupported major'],
  ['not-a-version', false, 'a malformed version'],
];
const negotiationFailures = negotiation.filter(([v, expected]) => isSupported(v) !== expected);
record('version negotiation accepts supported majors and refuses others',
  negotiationFailures.length === 0,
  negotiationFailures.length
    ? negotiationFailures.map(([v, e]) => `${v} expected ${e}`).join(', ')
    : `majors ${SUPPORTED_MAJORS.join(', ')}; ${negotiation.length} cases`);

// ── 5. Contract negotiation: unsupported version is refused, not guessed ────
console.log('\n5. Contract negotiation');
let refusedUnsupported = false;
try {
  parseExecutionPackage({ ...minimal, contractVersion: '2.0.0' });
} catch (e) {
  refusedUnsupported = /unsupported contract version/.test(e.message);
}
let refusedMissing = false;
try {
  const { contractVersion, ...without } = minimal;
  parseExecutionPackage(without);
} catch {
  refusedMissing = true;
}
record('an unsupported or absent contract version is refused explicitly',
  refusedUnsupported && refusedMissing,
  `unsupported refused=${refusedUnsupported}, absent refused=${refusedMissing}`);

// ── 6. Capability negotiation ───────────────────────────────────────────────
console.log('\n6. Capability negotiation');
// The contract carries a capability identifier without constraining it to a closed
// set: adding a capability is a registry change (R-11.17), NOT a contract change.
// If this ever fails, adding a capability would have become a breaking contract
// change — which would couple the capability model to the wire format.
let capabilityOpen = true;
try {
  parseExecutionPackage({ ...minimal, capabilityId: 'inverse-flow-discovery' });
  parseExecutionPackage({ ...minimal, capabilityId: 'a-capability-added-later' });
} catch {
  capabilityOpen = false;
}
record('adding a capability is not a breaking contract change', capabilityOpen,
  'capabilityId is carried, not enumerated — registry owns the six (R-11.4)');

// ── 7. Schema evolution / breaking-change detection ─────────────────────────
console.log('\n7. Breaking-change detection');

/** Required top-level properties, derived from the schema rather than listed. */
function requiredSurface(schema) {
  const out = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.required)) for (const r of node.required) out.add(r);
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      if (Array.isArray(node[key])) node[key].forEach(visit);
    }
  };
  visit(schema);
  return [...out].sort();
}

const currentSurface = {
  'execution-package': requiredSurface(JSON.parse(
    readFileSync(join(HERE, '..', 'schema', `execution-package-v${CONTRACT_VERSION}.json`), 'utf8'))),
  'evidence-reference': requiredSurface(JSON.parse(
    readFileSync(join(HERE, '..', 'schema', `evidence-reference-v${CONTRACT_VERSION}.json`), 'utf8'))),
};

const baselineFile = join(BASELINE, `v${CONTRACT_VERSION}.surface.json`);
mkdirSync(BASELINE, { recursive: true });

let breaking = [];
let surfaceDetail;
if (existsSync(baselineFile)) {
  const recorded = JSON.parse(readFileSync(baselineFile, 'utf8'));
  for (const [name, required] of Object.entries(currentSurface)) {
    const before = new Set(recorded[name] ?? []);
    const after = new Set(required);
    // A field required now that was not required before breaks older producers.
    for (const r of after) if (!before.has(r)) breaking.push(`${name}: newly required "${r}"`);
    // A field required before and absent now breaks older consumers depending on it.
    for (const r of before) if (!after.has(r)) breaking.push(`${name}: no longer required "${r}"`);
  }
  surfaceDetail = breaking.join('; ') || `surface unchanged against recorded v${CONTRACT_VERSION} baseline`;
} else {
  writeFileSync(baselineFile, `${JSON.stringify(currentSurface, null, 2)}\n`, 'utf8');
  surfaceDetail = `baseline recorded for v${CONTRACT_VERSION} — first run establishes it`;
}
record('no breaking change against the recorded baseline surface', breaking.length === 0, surfaceDetail);

// ── 8. Consumer upgrade validation ──────────────────────────────────────────
console.log('\n8. Consumer upgrade validation');
// A consumer built at v1.0.0 sends v1.0.0. The current build must accept it, and
// must return a value equivalent under canonical comparison — not merely parse it.
const upgradeFailures = [];
for (const f of readdirSync(join(FIXTURES, 'v1.0.0')).filter((x) => x.startsWith('execution-package'))) {
  const raw = JSON.parse(readFileSync(join(FIXTURES, 'v1.0.0', f), 'utf8'));
  // Guarded: an unparseable fixture is a RESULT, not a crash. An unguarded parse
  // here aborted the harness before it wrote evidence, leaving the previous run's
  // file in place — a generator that dies silently is worse than one that reports.
  let parsed;
  try {
    parsed = parseExecutionPackage(raw);
  } catch (e) {
    upgradeFailures.push(`${f}: ${e.message.split('\n')[0]}`);
    continue;
  }
  for (const key of Object.keys(raw)) {
    if (JSON.stringify(parsed[key]) !== JSON.stringify(raw[key])) upgradeFailures.push(`${f}:${key}`);
  }
}
record('a v1.0.0 consumer is served without loss by the current build',
  upgradeFailures.length === 0,
  upgradeFailures.join(', ') || 'every field round-trips unchanged');

// ── 9. Provider compatibility ───────────────────────────────────────────────
console.log('\n9. Provider compatibility');
const deployedMajors = versions.map((v) => majorOf(v.slice(1))).filter((m) => m !== null);
const unsupportedDeployed = deployedMajors.filter((m) => !SUPPORTED_MAJORS.includes(m));
record('the Intelligence Plane supports every version present in the corpus',
  unsupportedDeployed.length === 0,
  unsupportedDeployed.length ? `unsupported: ${unsupportedDeployed.join(', ')}` : `majors ${[...new Set(deployedMajors)].join(', ')}`);

// ── Evidence ────────────────────────────────────────────────────────────────
function gitOrNull(args) {
  try { return execFileSync('git', args, { cwd: HERE, encoding: 'utf8' }).trim(); } catch { return null; }
}

const passed = results.filter((r) => r.passed).length;
const evidence = {
  evidenceId: `compat-${CONTRACT_VERSION}`,
  generator: 'packages/contracts/compat/harness.mjs',
  generatorVersion: CONTRACT_VERSION,
  executionContext: `node ${process.version}`,
  repository: 'DBiz_IntelligencePlane',
  branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: gitOrNull(['rev-parse', 'HEAD']),
  adrReference: ['ADR-0003', 'ADR-0004', 'ADR-0020'],
  ruleReference: ['C-20.12', 'C-20.7', 'C-19.11', 'R-14.4'],
  timestamp: new Date().toISOString(),
  contractVersion: CONTRACT_VERSION,
  fixtureCount,
  versionsCovered: versions,
  properties: results,
  summary: { total: results.length, passed, failed: results.length - passed },
  verificationStatus: passed === results.length ? 'verified' : 'failed',
  certificationStatus: passed === results.length ? 'certified' : 'uncertified',
};
evidence.contentHash = createHash('sha256')
  .update('dbiz.compat-evidence@1').update(Buffer.from([0]))
  .update(JSON.stringify(evidence, Object.keys(evidence).sort()))
  .digest('hex');

writeFileSync(join(HERE, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

console.log('\n' + '='.repeat(74));
console.log(`${passed}/${results.length} compatibility properties hold · evidence -> compat/evidence.json`);
console.log(passed === results.length
  ? 'RESULT: PASS — consumer compatibility is evidence-backed.'
  : `RESULT: FAIL — ${results.length - passed} property failed.`);
console.log('');
process.exit(passed === results.length ? 0 : 1);
