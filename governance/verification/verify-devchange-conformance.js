'use strict';
/**
 * GOVERNANCE — Dev-Change Engine conformance.
 * ============================================================================
 * Regenerates the conformance evidence for capability 2 and gates on it.
 *
 * WHY THIS IS A SEPARATE GATE.
 * verify-capability-conformance.js asks whether a capability conforms to the capability
 * architecture. This one asks whether the Dev-Change Engine still does the specific
 * things it was built to do — reason over a change without moving its source across the
 * boundary, publish through adapters, run both reasoning modes as one workflow. They fail
 * for different reasons and a combined gate would report the wrong one.
 *
 * THE PROPERTIES ARE THE PREVIOUS AUDITS' FINDINGS, INVERTED — PLUS ONE THAT IS NEW.
 * V-6 exists because the first capability declared ten adapter methods and called one.
 * V-13 because two of its stages named agents that never ran. V-11 because its generator
 * emitted a rotating asset kind. V-14 because its domain orchestrators were never invoked.
 * V-5 is new and specific to Dev-Change: a change IS source, so the sole boundary crossing
 * is checked by serialising the entire sealed Intelligence-Plane state and asserting no
 * source line, commit message or author appears in it.
 *
 * Run:  node governance/verification/verify-devchange-conformance.js
 * Exit: 0 = every property holds   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCENARIO = path.join(ROOT, 'governance', 'capability', 'run-devchange-conformance.mjs');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'devchange-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — Dev-Change Engine conformance');
line('='.repeat(74));

// ── 1. Preconditions ────────────────────────────────────────────────────────
line('\n1. Preconditions');
const REQUIRED = ['capability-framework', 'dev-change-engine'];
const unbuilt = REQUIRED.filter((p) => !fs.existsSync(path.join(ROOT, 'packages', p, 'dist', 'src', 'index.js')));
check('the capability packages are built', unbuilt.length === 0,
  unbuilt.length ? `not built: ${unbuilt.join(', ')}` : `${REQUIRED.length} packages present`);
check('the conformance scenario exists', fs.existsSync(SCENARIO),
  fs.existsSync(SCENARIO) ? 'governance/capability/run-devchange-conformance.mjs' : 'absent');

if (unbuilt.length > 0 || !fs.existsSync(SCENARIO)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — Dev-Change Engine conformance cannot be evidenced.');
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
  check('capability 2 is still named as the architecture names it',
    /Dev-Change Engine/.test(capabilityModel),
    'docs/architecture/11-capability-model.md §2');

  const engineDir = path.join(ROOT, 'packages', 'dev-change-engine', 'src');
  const orchestrationSource = fs.readFileSync(path.join(engineDir, 'orchestrators.ts'), 'utf8')
    + fs.readFileSync(path.join(engineDir, 'capability.ts'), 'utf8');
  const providerNames = ['azure-devops', 'azuredevops', "'jira'", 'zephyr', "'github'", "'gitlab'", 'bitbucket'];
  const leaked = providerNames.filter((p) => orchestrationSource.toLowerCase().includes(p.toLowerCase()));
  check('no provider name appears in orchestration source', leaked.length === 0,
    leaked.length ? `provider name in orchestration: ${leaked.join(', ')}` : 'orchestration is provider-blind');

  const frameworkSource = fs.readFileSync(
    path.join(ROOT, 'packages', 'capability-framework', 'src', 'reasoning.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  check('the framework reads no capability-specific configuration key (C-11.11)',
    !/discovery\.|functionalTesting\.|devchange\.|performance\.|penetration\./.test(frameworkSource),
    'reasoning.ts reads only the capability-neutral ai.enabled');

  // The sovereignty type guarantee, checked in source: ChangeFact must have no field that
  // could hold a line of source. A future edit adding one would be caught here.
  const modelSource = fs.readFileSync(path.join(engineDir, 'model.ts'), 'utf8');
  const factBlock = /export interface ChangeFact \{[\s\S]*?\n\}/.exec(modelSource)?.[0] ?? '';
  check('ChangeFact carries no field that could hold source (ADR-0024 §3.4)',
    factBlock.length > 0 && !/hunks|addedLines|removedLines|\bcontent\b|\bbody\b/.test(factBlock),
    'ChangeFact declares symbol names and counts, and has nowhere to put a line of source');

  // ── 6. Evidence ───────────────────────────────────────────────────────────
  const evidence = {
    evidenceId: 'dev-change-engine-conformance',
    generator: 'governance/verification/verify-devchange-conformance.js',
    generatorVersion: '1.0.0',
    executionContext: `node ${process.version} on ${process.platform}`,
    repository: 'DBiz_IntelligencePlane',
    capability: 'dev-change-engine',
    timestamp: new Date().toISOString(),
    adrReference: ['ADR-0024', 'ADR-0023', 'ADR-0022'],
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
  line('RESULT: PASS — the Dev-Change Engine conforms.');
  line('One workflow, two reasoning modes, two providers. A change reasoned about, its source never moved.');
} else {
  line(`RESULT: FAIL — ${failures} conformance property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
