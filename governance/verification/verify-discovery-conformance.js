'use strict';
/**
 * GOVERNANCE — Discovery Flow Engine conformance.
 * ============================================================================
 * Regenerates the conformance evidence for capability 3 and gates on it.
 *
 * WHY THIS IS A SEPARATE GATE FROM verify-capability-conformance.js.
 * That gate asks whether a capability conforms to the capability architecture. This one
 * asks whether the Discovery Flow Engine still does the specific things it was built to
 * do — publish through adapters, run both reasoning modes as one workflow, keep customer
 * values out of the Intelligence Plane. They fail for different reasons and a combined
 * gate would report the wrong one.
 *
 * THE PROPERTIES ARE THE PREVIOUS AUDIT'S FINDINGS, INVERTED.
 * D-5 exists because the first capability declared ten adapter methods and called one.
 * D-13 exists because two of its stages named agents that never ran. D-11 exists because
 * its generator emitted a rotating asset kind. D-14 exists because its eleven domain
 * orchestrators were never invoked by any stage. Each of those was found by reading the
 * code once; each is now read on every build.
 *
 * ALSO GATES ADAPTER COVERAGE PLATFORM-WIDE.
 * An SPI method no capability invokes is an interface nobody implements against — the
 * declared-but-unwired shape this platform has already audited once. The check is
 * platform-wide rather than per-capability because a method one capability legitimately
 * does not need is not a defect; a method NO capability exercises is.
 *
 * Run:  node governance/verification/verify-discovery-conformance.js
 * Exit: 0 = every property holds   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCENARIO = path.join(ROOT, 'governance', 'capability', 'run-discovery-conformance.mjs');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'discovery-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — Discovery Flow Engine conformance');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
const REQUIRED = ['capability-framework', 'discovery-flow-engine'];
const unbuilt = REQUIRED.filter((p) => !fs.existsSync(path.join(ROOT, 'packages', p, 'dist', 'src', 'index.js')));
check('the capability packages are built', unbuilt.length === 0,
  unbuilt.length ? `not built: ${unbuilt.join(', ')}` : `${REQUIRED.length} packages present`);
check('the conformance scenario exists', fs.existsSync(SCENARIO),
  fs.existsSync(SCENARIO) ? 'governance/capability/run-discovery-conformance.mjs' : 'absent');

if (unbuilt.length > 0 || !fs.existsSync(SCENARIO)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — Discovery Flow Engine conformance cannot be evidenced.');
  line('');
  process.exit(1);
}

// ── 2. Execute ──────────────────────────────────────────────────────────────
line('\n2. Scenario execution');
const run = spawnSync(process.execPath, [SCENARIO],
  { cwd: ROOT, encoding: 'utf8', timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });

let observed = null;
if (run.status !== 0) {
  check('the scenario executed', false, `exit ${run.status}: ${(run.stderr || '').slice(0, 400)}`);
} else {
  try { observed = JSON.parse(run.stdout); } catch { observed = null; }
  check('the scenario executed and produced observations', observed !== null,
    observed ? `${observed.properties.length} properties` : 'no parseable output');
}

if (observed) {
  // ── 3. Properties ─────────────────────────────────────────────────────────
  line('\n3. Conformance properties');
  for (const property of observed.properties) {
    check(`${property.id}  ${property.property}`, property.observed === true, property.detail);
  }

  // ── 4. Adapter SPI coverage, platform-wide ────────────────────────────────
  line('\n4. Adapter SPI coverage across every capability');
  const adapterSource = fs.readFileSync(
    path.join(ROOT, 'packages', 'capability-framework', 'src', 'adapters.ts'), 'utf8');

  // Method signatures declared on the SPI INTERFACES only. The registry's own methods
  // are not an SPI — they are how a capability obtains one — and counting them would
  // make this check pass or fail for the wrong reason.
  const spiBlocks = [...adapterSource.matchAll(/export interface (\w*Adapter)\s*\{([\s\S]*?)\n\}/g)];
  const declared = spiBlocks.flatMap(([, , body]) =>
    [...body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\(/gm)].map((m) => m[1]));
  const unique = [...new Set(declared)].sort();

  const engineSources = [];
  for (const pkg of fs.readdirSync(path.join(ROOT, 'packages'))) {
    const src = path.join(ROOT, 'packages', pkg, 'src');
    if (!fs.existsSync(src)) continue;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && entry.name !== 'adapters.ts') {
          engineSources.push(fs.readFileSync(full, 'utf8'));
        }
      }
    };
    walk(src);
  }
  const allEngineSource = engineSources.join('\n');

  const neverCalled = unique.filter((method) => !new RegExp(`\\.${method}\\(`).test(allEngineSource));
  check('every declared adapter SPI method is invoked by at least one capability',
    neverCalled.length === 0,
    neverCalled.length
      ? `declared and never invoked anywhere: ${neverCalled.join(', ')}`
      : `${unique.length} SPI method(s), each invoked by capability code`);

  // ── 5. Architectural invariants ───────────────────────────────────────────
  line('\n5. Architectural invariants');
  const capabilityModel = fs.readFileSync(
    path.join(ROOT, 'docs', 'architecture', '11-capability-model.md'), 'utf8');
  check('capability 3 is still named as the architecture names it',
    /Inverse-Flow Discovery Engine/.test(capabilityModel),
    'docs/architecture/11-capability-model.md §3');

  const engineDir = path.join(ROOT, 'packages', 'discovery-flow-engine', 'src');
  const orchestrationSource = fs.readFileSync(path.join(engineDir, 'orchestrators.ts'), 'utf8')
    + fs.readFileSync(path.join(engineDir, 'capability.ts'), 'utf8');
  // An orchestrator that can name a provider can branch on it, and one that can branch
  // on it eventually will.
  const providerNames = ['azure-devops', 'azuredevops', "'jira'", 'zephyr', 'xray', 'testrail'];
  const leaked = providerNames.filter((p) => orchestrationSource.toLowerCase().includes(p));
  check('no provider name appears in orchestration source', leaked.length === 0,
    leaked.length ? `provider name in orchestration: ${leaked.join(', ')}` : 'orchestration is provider-blind');

  // Comments are stripped first. The header of reasoning.ts explains WHY it must not
  // read `discovery.aiEnabled`, and a check that read prose would fail on the sentence
  // describing the rule it enforces.
  const frameworkSource = fs.readFileSync(
    path.join(ROOT, 'packages', 'capability-framework', 'src', 'reasoning.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  check('the framework reads no capability-specific configuration key (C-11.11)',
    !/discovery\.|functionalTesting\.|performance\.|penetration\./.test(frameworkSource),
    'reasoning.ts reads only the capability-neutral ai.enabled');

  // ── 6. Evidence ───────────────────────────────────────────────────────────
  const evidence = {
    evidenceId: 'discovery-flow-engine-conformance',
    generator: 'governance/verification/verify-discovery-conformance.js',
    generatorVersion: '1.0.0',
    executionContext: `node ${process.version} on ${process.platform}`,
    repository: 'DBiz_IntelligencePlane',
    capability: 'inverse-flow-discovery',
    timestamp: new Date().toISOString(),
    adrReference: ['ADR-0023', 'ADR-0022'],
    ruleReference: ['C-11.11', 'C-11.13', 'C-12.1', 'C-12.12', 'C-13.1', 'C-14.1'],
    properties: observed.properties,
    census: observed.census,
    digest: observed.digest,
    verificationStatus: failures === 0 ? 'verified' : 'failed',
  };
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  line('\n6. Census');
  for (const [key, value] of Object.entries(observed.census)) line(`         ${key}: ${value}`);
}

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Discovery Flow Engine conforms.');
  line('One workflow, two reasoning modes, two providers. Adapters invoked, not merely declared.');
} else {
  line(`RESULT: FAIL — ${failures} conformance property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
