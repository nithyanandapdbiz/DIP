'use strict';
/**
 * GOVERNANCE — fault-proof recorder.
 * ============================================================================
 * Produces the machine-readable fault-injection registry required by R-13.4.
 *
 * It RE-RUNS every proof rather than transcribing prose. Transcribing a claim
 * from a commit message into JSON would convert an assertion into a
 * machine-readable assertion — the exact substitution R-13.1 forbids. Every entry
 * in proofs.json is produced by planting a real fault and observing a real exit code.
 *
 * For each gate it observes two runs:
 *   CLEAN  — the repository as it stands, expecting exit 0
 *   FAULT  — a deliberately planted violation, expecting exit 1 AND a named cause
 *
 * From those two observations it records five properties (R-13.4). Note honestly
 * that false-positive and false-negative resistance are DERIVED from the same two
 * observations rather than independently measured, and the confidence field says so.
 * Claiming five independent measurements from two would itself be an assertion.
 *
 * Run:  node governance/verification/record-fault-proofs.js
 * Exit: 0 = every gate proved  1 = at least one gate failed to prove
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const REGISTRY = path.join(__dirname, 'proofs.json');

/**
 * One fault per gate. Each plants a violation the gate is specifically responsible
 * for detecting, and declares the phrase its output must contain — so a gate that
 * fails for an unrelated reason does not count as having detected anything.
 */
/**
 * The vendor literal the AI-neutrality probe needs, assembled from fragments.
 *
 * Written this way so the recorder does not itself introduce the violation it
 * plants — the neutrality gate scans this file too, and a probe that turns the
 * repository red on a clean run is a defect, not a test. Fragments are preferred
 * over an inline exemption, which would suppress detection on this line permanently.
 */
const VENDOR_LITERAL = ['G', 'PT', '-4'].join('');

/**
 * The General Availability claim the GA probe needs, assembled from fragments.
 *
 * Same reason as VENDOR_LITERAL above, and the same lesson learned twice: the GA gate
 * scans this file too, and a recorder containing the literal claim turns the
 * repository red on a CLEAN run. Fragments are preferred over exempting this file from
 * the scan, which would create a permanent blind spot in exactly the place a fault
 * author works.
 */
const GA_CLAIM = ['General', ' Availability', ': ', 'CERT', 'IFIED'].join('');

const FAULTS = [
  {
    gate: 'verify-architecture-integrity.js',
    file: 'docs/architecture/99-fault-probe.md',
    content: '# 99 — Fault Probe\n\n**Status:** DRAFT · **Version:** 0.1 · **Date:** 2026-07-22 · **Milestone:** P1\n\nCites a document that is neither present nor planned: [98](98-absent.md).\n',
    violation: 'document without ownership boundary, without conformance criteria, with a dangling reference',
    expects: /conformance criteria|owns and does not own|resolves to an existing/,
  },
  {
    gate: 'verify-adr-completeness.js',
    file: 'docs/adr/ADR-9999-fault-probe.md',
    content: '# ADR-9999 — Fault Probe\n\n**Status:** ACCEPTED · **Date:** 2026-07-22\n\n## 1. Problem\nDeliberately missing the other seven required sections.\n',
    violation: 'ADR missing required sections',
    expects: /eight required sections/,
  },
  {
    gate: 'verify-ai-vendor-neutrality.js',
    file: 'docs/architecture/98-fault-probe.md',
    content: '# 98 — Fault Probe\n\n**Status:** DRAFT · **Version:** 0.1 · **Date:** 2026-07-22 · **Milestone:** P1\n\n**This document owns:** nothing.\n**It does not own:** anything.\n\nThe platform requires the ' + VENDOR_LITERAL + ' model for reasoning.\n\n## 1. Conformance criteria\n\n| # | Criterion | Verified by |\n|---|---|---|\n| **C-98.1** | placeholder | placeholder |\n',
    violation: 'AI vendor and model named as a platform requirement',
    expects: /vendor, model or tool name/,
  },
  {
    gate: 'verify-implementation-traceability.js',
    file: 'packages/contracts/src/__fault-probe.ts',
    content: 'export const faultProbe = 1;\n',
    violation: 'source file with no TRACEABILITY block',
    expects: /TRACEABILITY block/,
  },
  {
    // ADR-0076 §4.2's replacement check, planted: a contract naming an SPI that exists nowhere.
    //
    // NOTE THE HARNESS RECORDS `proved: false` FOR THIS GATE AND THAT IS HONEST, not a
    // shortfall in the probe. The clean run is ALREADY red on three real phantom contracts
    // (`CustomerFindingStore`, `EvidenceCustody`, `TargetConnectivity`), so the clean-passes
    // half of the proof cannot hold until those five sites are resolved — and their
    // replacement is the owning capability's decision (§4.4), not this ADR's. The gate's
    // ability to FAIL on a planted violation was observed directly and is recorded in
    // `PROJECT_STATE.md`: the probe below is named in the output by name and site, and the
    // gate returns to exactly the three real phantoms when it is removed.
    gate: 'verify-tool-contracts.js',
    file: 'packages/capability-framework/src/__fault-probe-spi.ts',
    content: "/** TRACEABILITY: fault probe for verify-tool-contracts.js. */\nexport const probe = {\n  toolContracts: ['ThisSpiDoesNotExistAnywhere'],\n};\n",
    violation: 'a tool contract naming an SPI that exists nowhere in the repository',
    expects: /ThisSpiDoesNotExistAnywhere/,
  },
  {
    // D-068's own mechanism, planted: a declared test the built tree does not carry. The file
    // is created but never compiled, so `dist/test/` lacks its counterpart — which is exactly
    // the state that produced two green readings of one suite at 409 and 413 tests.
    gate: 'verify-suite-integrity.js',
    file: 'packages/capability-framework/test/__fault-probe.test.ts',
    content: "import { test } from 'node:test';\n\ntest('a declared test the built tree does not carry', () => {});\n",
    violation: 'a source test file with no compiled counterpart — it would silently never run',
    expects: /compiled counterpart|built tree carries/,
  },
  {
    gate: 'verify-change-control-completeness.js',
    file: 'docs/adr/ADR-9998-fault-probe.md',
    content: '# ADR-9998 — Fault Probe\n\n**Status:** ACCEPTED · **Date:** 2026-07-22\n\n## 1. Problem\np\n## 2. Context\nc\n## 3. Alternatives\na\n## 4. Decision\nd\n## 5. Consequences\nq\n## 6. Migration strategy\nm\n## 7. Version impact\nv\n## 8. Affected components\n\n`governance/verification/this-file-was-never-created.js` — **New**\n',
    violation: 'ADR declaring an affected component that was never created',
    expects: /affected component/,
  },
  {
    gate: 'verify-governance-self-validation.js',
    file: 'governance/verification/verify-__fault-probe.js',
    content: [
      "'use strict';",
      '// An unregistered gate: present on disk, absent from the runner, therefore NOT RUN.',
      'process.exit(0);',
      '',
    ].join('\n'),
    violation: 'gate present on disk but not registered in the runner (NOT RUN, therefore FAIL)',
    expects: /present but NOT RUN|registered in the runner/,
  },
  {
    gate: 'verify-architecture-fitness.js',
    file: 'docs/architecture/97-fault-probe.md',
    content: [
      '# 97 — Fault Probe',
      '',
      '**Status:** DRAFT · **Version:** 0.1 · **Date:** 2026-07-22 · **Milestone:** P1',
      '',
      '**This document owns:** nothing.',
      '**It does not own:** anything.',
      '',
      '## 1. Conformance criteria',
      '',
      '| **C-97.1** | placeholder | placeholder |',
      '',
    ].join('\n'),
    violation: 'a canonical document that is not frozen',
    expects: /canonical document is frozen/,
  },
  {
    gate: 'verify-contract-compatibility.js',
    file: 'packages/contracts/compat/fixtures/v1.0.0/execution-package.__probe.json',
    content: '{"contractVersion":"1.0.0","runId":"broken"}',
    violation: 'a retained fixture that no longer parses under the current build',
    expects: /every retained fixture parses|compatibility property/,
  },
  {
    gate: 'verify-supply-chain.js',
    // Planted in build output, which is non-mutating: it triggers no install and
    // touches no lockfile. An earlier version planted a workspace manifest to force
    // lockfile drift — and pnpm resolved it, rewriting the lockfile and installing a
    // real package. The recorder became a source of the defect it exists to detect.
    // A fault probe must not be able to mutate persistent state.
    file: 'packages/contracts/dist/__fault-probe.js',
    content: [
      '// Injected into build output: two clean builds can no longer agree.',
      'module.exports = {};',
      '',
    ].join('\n'),
    violation: 'build output containing an artefact no build produced',
    expects: /byte-identical|builds produce/,
  },
  {
    gate: 'verify-traceability.js',
    file: 'docs/architecture/96-fault-probe.md',
    content: [
      '# 96 — Fault Probe',
      '',
      '**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1',
      '',
      '**This document owns:** nothing.',
      '**It does not own:** anything.',
      '',
      '## 1. Conformance criteria',
      '',
      '| **C-96.1** | placeholder | placeholder |',
      '',
    ].join('\n'),
    violation: 'an architecture document with no implementation milestone — an orphan',
    expects: /implementation milestone/,
  },
  {
    gate: 'verify-operational-readiness.js',
    // Planted in the Intelligence Plane's own store tree: a screenshot is precisely
    // the customer runtime asset E-5 asserts is never retained. Non-mutating, and
    // it exercises the property rather than the plumbing.
    file: 'governance/operational/__fault-probe-screenshot.png',
    content: 'not a real image; presence is the violation',
    violation: 'a customer screenshot retained in Intelligence Plane storage',
    expects: /non-retention|proven property/,
  },
  {
    gate: 'verify-operational-readiness.js',
    id: 'permissive-gateway',
    // The sharpest question that can be asked of operational evidence: if the API
    // gateway stopped refusing unauthorised callers, would governance notice? This
    // replaces the runtime's built entry point with one whose gateway answers 200 to
    // everything, then runs the gate. If the gate still passes, every mTLS claim in
    // the certification record is worthless.
    //
    // REPLACE, not create — so the original is snapshotted and restored. Build output
    // is the target deliberately: a fault planted in source or in the lockfile makes
    // the recorder a source of the defect it exists to detect, which has happened here
    // once already and must not happen again.
    mode: 'replace',
    file: 'packages/platform-runtime/dist/src/index.js',
    content: [
      "// FAULT PROBE — a gateway that admits everyone. Restored immediately after.",
      "export * from './certificate-authority.js';",
      "export * from './authentication.js';",
      "export * from './registration.js';",
      "export * from './tenant-runtime.js';",
      "export class ApiGateway {",
      "  constructor(options) { this.options = options; this.auditTrail = []; }",
      "  handle(peerCertPem, request) {",
      "    return { status: 200, tenantId: request.claimedTenantId || 'any', body: request.body };",
      "  }",
      "  async listen(port = 0) {",
      "    const { createServer } = await import('node:tls');",
      "    const self = this;",
      "    const server = createServer({",
      "      key: this.options.serverKeyPem, cert: this.options.serverCertPem,",
      "      ca: [this.options.ca.rootCertificatePem], requestCert: false, rejectUnauthorized: false,",
      "    }, (socket) => {",
      "      let buffer = '';",
      "      socket.on('data', (chunk) => {",
      "        buffer += chunk.toString('utf8');",
      "        const idx = buffer.indexOf(String.fromCharCode(10));",
      "        if (idx === -1) return;",
      "        let req = {};",
      "        try { req = JSON.parse(buffer.slice(0, idx)); } catch { /* served anyway */ }",
      "        buffer = buffer.slice(idx + 1);",
      "        socket.write(JSON.stringify(self.handle('probe', req)) + String.fromCharCode(10));",
      "      });",
      "      socket.on('error', () => {});",
      "    });",
      "    await new Promise((r) => server.listen(port, '127.0.0.1', r));",
      "    return {",
      "      port: server.address().port,",
      "      close: () => new Promise((r) => server.close(() => r())),",
      "    };",
      "  }",
      "  get isListening() { return true; }",
      "}",
      '',
    ].join(String.fromCharCode(10)),
    violation: 'an API gateway that serves unauthenticated and cross-tenant callers',
    expects: /runtime properties|proven property|E-4|E-8/,
  },
  {
    gate: 'verify-customer-readiness.js',
    id: 'wrong-language-generator',
    // Reintroduces exactly the defect M2.7 removed: a generator that emits TypeScript
    // for every language, so a customer choosing Python receives `register.ts`. Five
    // of six declared supported targets were in this state and nothing detected it,
    // because a file COUNT cannot see it. If this fault does not turn the gate red,
    // C-25.8 is decorative and the supported-target list is a list of intentions.
    //
    // REPLACE, on build output, snapshotted and restored — for the same reason as the
    // permissive-gateway probe above.
    mode: 'replace',
    file: 'packages/platform-core/dist/src/language-emitters.js',
    content: [
      '// FAULT PROBE — one language for all. Restored immediately after.',
      'const q = (s) => JSON.stringify(s);',
      'const typescriptOnly = {',
      "  dockerBaseImage: 'node:24-alpine',",
      "  testDirectory: 'tests',",
      '  files(profile, b) {',
      '    return [',
      "      { path: 'src/bootstrap/register.ts', content: 'export const TENANT_ID = ' + q(b.tenantId) + ';' },",
      "      { path: 'src/logging/logger.ts', content: 'export const emit = () => {};' },",
      "      { path: 'src/utils/paths.ts', content: 'export const evidencePath = () => \"\";' },",
      "      { path: 'package.json', content: '{}' },",
      '    ];',
      '  },',
      '};',
      'export function emitterFor() { return typescriptOnly; }',
      'export const SOURCE_EXTENSIONS = {',
      "  typescript: ['.ts'], javascript: ['.js'], python: ['.py'], java: ['.java'], csharp: ['.cs'],",
      '};',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'a generator emitting TypeScript for every declared supported language',
    expects: /own language|C-25\.8|K-2|proven property/,
  },
  {
    gate: 'verify-production-readiness.js',
    id: 'health-reports-green-while-silent',
    // The sharpest question that can be asked of a monitoring system: if it started
    // reporting HEALTHY during a total outage of whatever reports to it, would anything
    // notice? That is C-24.7, and it is the failure that is most reassuring precisely
    // when it is least true — an operator sees green while the platform is dark.
    //
    // This replaces the health monitor with one that answers `healthy` whenever its
    // dependencies are up, ignoring whether any activity was observed. If the gate
    // stays green, C-24.7 is decorative.
    mode: 'replace',
    file: 'packages/observability/dist/src/health.js',
    content: [
      '// FAULT PROBE — health that ignores silence. Restored immediately after.',
      'export class HealthMonitor {',
      '  constructor(metrics, nowIso) { this.metrics = metrics; this.nowIso = nowIso || (() => new Date().toISOString()); this.deps = []; this.started = false; }',
      '  register(d) { this.deps.push(d); }',
      '  markStarted() { this.started = true; }',
      "  liveness() { return { probe: 'liveness', state: 'pass', detail: 'running' }; }",
      "  readiness() { return { probe: 'readiness', state: this.started ? 'pass' : 'fail', detail: 'x' }; }",
      '  health() {',
      '    const dependencies = this.deps.map((d) => Object.assign({ name: d.name }, d.check()));',
      "    const bad = dependencies.filter((d) => d.state === 'unhealthy');",
      "    return { state: bad.length ? 'unhealthy' : 'healthy', checkedAt: this.nowIso(), dependencies, summary: 'ok' };",
      '  }',
      "  tenantHealth() { return { state: 'healthy', checkedAt: this.nowIso(), dependencies: [], summary: 'ok' }; }",
      '}',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'a health endpoint that reports healthy while nothing is reporting',
    expects: /silence|unknown|C-24\.7|P-4|measured property/,
  },
  {
    gate: 'verify-general-availability.js',
    id: 'false-ga-claim',
    // The failure this whole milestone is actually exposed to. Not a broken
    // measurement — a plausible document, written under delivery pressure, asserting
    // the one thing that was never measured. Twelve green milestones make that MORE
    // likely, not less: the more that is genuinely proven, the more natural it feels
    // to round up the remainder.
    //
    // This plants exactly that document. If the gate stays green, every honest
    // NOT CERTIFIED in this repository is one edit away from being worthless.
    file: 'docs/certification/GA-STATUS-fault-probe.md',
    content: [
      '# ' + ['General', ' Availability', ' status'].join(''),
      '',
      '**' + GA_CLAIM + '.**',
      '',
      'All deployment evidence has been obtained and E-2 passes.',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'a document claiming General Availability while E-2 is unmeasured',
    expects: /claims General Availability|GA claim|E-2 is unmeasured/,
  },
  {
    gate: 'verify-programme-closure.js',
    id: 'silent-architecture-amendment',
    // The failure a frozen baseline exists to prevent: architecture that moves without
    // anyone deciding it should. Amending the architecture after closure is permitted;
    // amending it silently is not, and the difference is whether the build goes red.
    file: 'docs/architecture/95-fault-probe.md',
    content: [
      '# 95 — Fault Probe',
      '',
      '**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1',
      '',
      '**This document owns:** nothing.',
      '**It does not own:** anything.',
      '',
      'An architecture document added after the baseline was frozen.',
      '',
      '## 1. Conformance criteria',
      '',
      '| **C-95.1** | placeholder | placeholder |',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'an architecture document added after the closure baseline was frozen',
    expects: /added since closure|baselined architecture|canonical set is unchanged|re-baseline/,
  },
  {
    gate: 'verify-platform-contract-framework.js',
    id: 'platform-contract-over-claiming-its-state',
    // The failure a certified contract layer exists to prevent: a platform contract
    // declared implemented while its canonical type is not on disk. Every capability
    // would then consume a contract that does not exist. The framework measures each
    // contract's state from executed evidence (does the source export the symbol?),
    // so a registry that CLAIMS `implemented` for a type nobody built is caught by the
    // over-claim property — a clean registry passes, this patched one fails.
    //
    // PATCH mode on the registry source, snapshotted and restored. With every
    // contract now implemented, the over-claim is planted by pointing a contract's
    // verification rule at a symbol that is not exported: it then measures NOT
    // IMPLEMENTED while still declared implemented, which CT-3 catches.
    mode: 'patch',
    file: 'governance/capability/platform-contract-registry.mjs',
    find: "requires: ['PlatformEvent', 'ObservabilityModel']",
    replace: "requires: ['PlatformEvent__ABSENT']",
    violation: 'a platform contract declared implemented while its canonical type is not on disk (over-claim)',
    expects: /over-claim|expected implemented but measured|NOT IMPLEMENTED/,
  },
  {
    gate: 'verify-http-surface.js',
    id: 'transport-that-stops-enforcing-security-headers',
    // The question this probe answers: if the transport hardening were quietly removed, would
    // governance notice? A gate that only ever observes a fixed codebase proves nothing about its own
    // sensitivity, and this suite exists precisely because 58 design-level gates observed a codebase
    // containing a state-volume-deleting path traversal and stayed green.
    //
    // The probe neuters the security-header middleware in build output, so the assembled application
    // answers real requests without CSP, nosniff or frame-ancestors. The gate drives it over a socket
    // and must go RED.
    //
    // WHY NOT PROBE THE TRAVERSAL ITSELF — AND WHY THAT IS THE BETTER RESULT.
    // Two attempts were made, and both left the gate GREEN:
    //   1. Removing the `normaliseTenantSlug` call from the router (`api.js`) — the second barrier in
    //      `FileTenantConfigStore.dir()` still refused the path.
    //   2. Neutering `SLUG_RE` in the shared primitive both barriers call — `dir()`'s resolved-prefix
    //      assertion still refused it, because it validates the RESULT rather than the shape.
    // Traversal is therefore guarded by three independent mechanisms and no single-file edit can
    // reopen it. That is a stronger statement than any proof this recorder could produce, and it is
    // recorded here rather than engineered around: a probe contrived to defeat all three at once would
    // be measuring the probe, not the platform. The traversal property is covered by 30 assertions in
    // the suite; this entry proves the GATE reacts to a real regression in the surface it watches.
    //
    // PATCH mode on build output, snapshotted and restored.
    mode: 'patch',
    file: 'packages/tenant-onboarding-engine/dist/src/server/security.middleware.js',
    find: 'for (const [name, value] of Object.entries(SECURITY_HEADERS)) {',
    replace: 'for (const [name, value] of Object.entries({})) { /* FAULT PROBE: headers removed, restored immediately */',
    violation: 'a transport that answers requests without any security headers',
    expects: /HTTP-surface property|security property|header/,
  },
  {
    gate: 'verify-execution-contracts.js',
    id: 'execution-context-that-is-not-immutable',
    // The failure the immutability guarantee (G-8) exists to prevent: a sealed
    // Execution Context that is not actually frozen, so a domain could mutate the
    // tenant/governance/security core mid-run. The reference conformance suite
    // asserts the context is sealed; this probe removes the freeze in the built
    // helper, so the suite fails and the gate goes RED. A clean build passes.
    //
    // PATCH mode on build output, snapshotted and restored.
    mode: 'patch',
    file: 'packages/capability-framework/dist/src/execution-context.js',
    find: 'Object.freeze(value);',
    replace: 'void value; /* FAULT PROBE: freeze removed, restored immediately */',
    violation: 'a sealed execution context that is not deep-frozen (immutability broken)',
    expects: /immutability|sealed|consumes all three|reference/,
  },
  {
    gate: 'verify-connector-spi.js',
    id: 'connector-spi-naming-a-provider',
    // The failure the connector SPI framework exists to prevent: a provider brand
    // leaking into a capability-neutral SPI definition (G-16). Once a provider name
    // is in the contract, "support X" starts to mean editing the platform, which is
    // the coupling the SPI boundary removes. The probe injects a provider name into
    // an SPI governance descriptor; the neutrality property (CS-3) catches it. A
    // clean source passes; this patched one fails.
    //
    // PATCH mode on the SPI source, snapshotted and restored.
    mode: 'patch',
    file: 'packages/capability-framework/src/adapters.ts',
    find: "securityModel: 'credential references only; no plaintext secret crosses the boundary',",
    replace: "securityModel: 'azure ad and oauth tokens',",
    violation: 'a provider brand named inside a capability-neutral connector SPI descriptor',
    expects: /capability-neutral|provider|brand|azure/,
  },
  {
    gate: 'verify-decision-engine.js',
    id: 'decision-engine-nondeterminism',
    // The failure determinism exists to prevent: identical inputs producing
    // different decisions. The probe injects randomness into the decision id, so
    // two calls with the same request diverge and the determinism property fails.
    // PATCH mode on build output, snapshotted and restored.
    mode: 'patch',
    file: 'packages/capability-framework/dist/src/decision.js',
    find: "const decisionId = 'decision:' + request.type + ':' + request.traceId + ':' + selectedStrategy;",
    replace: "const decisionId = 'decision:' + request.type + ':' + request.traceId + ':' + selectedStrategy + ':' + Math.random();",
    violation: 'a Decision Engine that produces different decisions for identical inputs (nondeterminism)',
    expects: /determinism|identical|deterministic|Decision Engine property/,
  },
  {
    gate: 'verify-decision-engine.js',
    id: 'decision-engine-ai-override',
    // The failure AI-advisory-only exists to prevent: an AI recommendation
    // overriding a higher-precedence governance rule. The probe gives the
    // ai-recommendation tier the highest precedence, so AI wins over governance
    // and the rule-precedence / advisory-only property fails.
    mode: 'patch',
    file: 'packages/capability-framework/dist/src/decision.js',
    find: 'return RULE_PRECEDENCE.indexOf(source);',
    replace: "return source === 'ai-recommendation' ? -1 : RULE_PRECEDENCE.indexOf(source);",
    violation: 'a Decision Engine in which an AI recommendation overrides a higher-precedence governance rule',
    expects: /precedence|advisory|governance|Decision Engine property/,
  },
  {
    gate: 'verify-decision-engine.js',
    id: 'decision-engine-mutable-decision',
    // The failure immutability exists to prevent: a Decision Object that can be
    // mutated after it is returned. The probe stops freezing the decision, so the
    // immutability property fails.
    mode: 'patch',
    file: 'packages/capability-framework/dist/src/decision.js',
    find: 'return Object.freeze(decision);',
    replace: 'return decision;',
    violation: 'a Decision Engine that returns a mutable (non-frozen) Decision Object',
    expects: /immutab|frozen|Decision Engine property/,
  },
  {
    gate: 'verify-intelligence-models.js',
    id: 'intelligence-model-mutable',
    // The failure immutability exists to prevent: a model that can be changed
    // after it is created. The probe stops freezing the Repository model, so the
    // reference immutability assertion fails. PATCH on build output.
    mode: 'patch',
    file: 'packages/contracts/dist/src/repository-intelligence.js',
    find: 'Object.freeze(value);',
    replace: 'void value; /* FAULT PROBE: freeze removed, restored immediately */',
    violation: 'a Repository Intelligence model that is not deep-frozen (mutable model)',
    expects: /immutab|frozen|intelligence-model property/,
  },
  {
    gate: 'verify-intelligence-models.js',
    id: 'intelligence-model-capability-specific-field',
    // The failure capability-neutrality exists to prevent: a capability-specific
    // concept leaking into a platform model. The probe injects a provider-named
    // field into the Repository model source; the neutrality property catches it.
    // PATCH on source.
    mode: 'patch',
    file: 'packages/contracts/src/repository-intelligence.ts',
    find: '  readonly reuseCandidates: readonly string[];',
    replace: '  readonly reuseCandidates: readonly string[];\n  readonly playwrightTrace: string;',
    violation: 'a capability-specific (provider-named) field inside a capability-neutral platform model',
    expects: /capability-neutral|provider|Functional-Testing|playwright/,
  },
  {
    gate: 'verify-intelligence-models.js',
    id: 'intelligence-model-duplicate-definition',
    // The failure single-canonical-definition exists to prevent: one concept
    // defined twice. The probe adds a second definition of RepositoryIntelligence
    // Model to the automation source; the uniqueness property catches it. PATCH on
    // source.
    mode: 'patch',
    file: 'packages/contracts/src/automation-intelligence.ts',
    find: "export const AUTOMATION_INTELLIGENCE_VERSION = '1.0.0';",
    replace: "export interface RepositoryIntelligenceModel { readonly dup: true; }\nexport const AUTOMATION_INTELLIGENCE_VERSION = '1.0.0';",
    violation: 'a second canonical definition of RepositoryIntelligenceModel (duplicate definition)',
    expects: /duplicate|defined 2|single canonical/,
  },
  {
    gate: 'verify-reporting-model.js',
    id: 'reporting-model-mutable',
    // Immutability probe: stop freezing the report, so the reference immutability
    // assertion fails. PATCH on build output.
    mode: 'patch',
    file: 'packages/contracts/dist/src/reporting-model.js',
    find: 'Object.freeze(value);',
    replace: 'void value; /* FAULT PROBE: freeze removed, restored immediately */',
    violation: 'a Reporting model that is not deep-frozen (mutable model)',
    expects: /immutab|frozen|Reporting-model property/,
  },
  {
    gate: 'verify-reporting-model.js',
    id: 'reporting-model-capability-specific-field',
    // Capability-neutrality probe: inject a provider-named reporting field. PATCH on source.
    mode: 'patch',
    file: 'packages/contracts/src/reporting-model.ts',
    find: '  readonly decisionSummary: ReportSection;',
    replace: '  readonly decisionSummary: ReportSection;\n  readonly playwrightPanel: ReportSection;',
    violation: 'a capability-specific (provider-named) reporting field in a capability-neutral model',
    expects: /capability-neutral|provider|Functional-Testing|playwright/,
  },
  {
    gate: 'verify-reporting-model.js',
    id: 'reporting-model-embedded-payload',
    // Evidence-references-only probe: embed an execution payload instead of a
    // reference; the payload property catches it. PATCH on source.
    mode: 'patch',
    file: 'packages/contracts/src/reporting-model.ts',
    find: '  readonly observabilitySummary: ReportSection;',
    replace: '  readonly observabilitySummary: ReportSection;\n  readonly evidencePayloadBase64: string;',
    violation: 'an embedded execution payload instead of an evidence reference',
    expects: /payload|reference only|base64|embedded/,
  },
  {
    gate: 'verify-reporting-model.js',
    id: 'reporting-model-duplicate-definition',
    // Single-canonical-definition probe: add a second ReportingModel definition.
    // PATCH on source.
    mode: 'patch',
    file: 'packages/contracts/src/reporting-model.ts',
    find: "export const REPORTING_MODEL_VERSION = '1.0.0';",
    replace: "export interface ReportingModel { readonly dup: true; }\nexport const REPORTING_MODEL_VERSION = '1.0.0';",
    violation: 'a second canonical definition of ReportingModel (duplicate definition)',
    expects: /duplicate|defined 2|single canonical/,
  },
  {
    gate: 'verify-platform-events.js',
    id: 'platform-event-mutable',
    // Immutability probe: stop freezing the event/observability objects. PATCH on build output.
    mode: 'patch',
    file: 'packages/contracts/dist/src/events.js',
    find: 'Object.freeze(value);',
    replace: 'void value; /* FAULT PROBE: freeze removed, restored immediately */',
    violation: 'a PlatformEvent/Observability object that is not deep-frozen (mutable event)',
    expects: /immutab|frozen|event\/observability property/,
  },
  {
    gate: 'verify-platform-events.js',
    id: 'platform-event-business-payload',
    // No-business-payload probe: embed a business payload in the event. PATCH on source.
    mode: 'patch',
    file: 'packages/contracts/src/events.ts',
    find: '  readonly source: string;',
    replace: '  readonly source: string;\n  readonly businessPayloadBase64: string;',
    violation: 'a business payload embedded in a PlatformEvent instead of a reference',
    expects: /payload|business|base64|references only/,
  },
  {
    gate: 'verify-platform-events.js',
    id: 'platform-event-execution-control-field',
    // Observational-only probe: add an execution-control field to the event. PATCH on source.
    mode: 'patch',
    file: 'packages/contracts/src/events.ts',
    find: '  readonly severity: string;',
    replace: '  readonly severity: string;\n  readonly triggersStage: string;',
    violation: 'an execution-control field on a PlatformEvent (events must be observational only)',
    expects: /execution-control|observational|trigger|execution semantics/,
  },
  {
    gate: 'verify-platform-events.js',
    id: 'platform-event-duplicate-definition',
    // Single-canonical-definition probe: add a second PlatformEvent definition. PATCH on source.
    mode: 'patch',
    file: 'packages/contracts/src/events.ts',
    find: "export const PLATFORM_EVENT_VERSION = '1.0.0';",
    replace: "export interface PlatformEvent { readonly dup: true; }\nexport const PLATFORM_EVENT_VERSION = '1.0.0';",
    violation: 'a second canonical definition of PlatformEvent (duplicate definition)',
    expects: /duplicate|defined 2|single canonical/,
  },
  // ── ADR-0077 §4.8 — the cut-over probes, re-anchored onto the migrated gate ──────────────
  // Each names ONE property's FAIL line rather than the gate's summary, because this gate is
  // legitimately red on RC-3′ between ADR-0077 §6 steps 1 and 5: a probe matching the summary
  // would "detect" a failure that was already there, which is the incidental-detection weakness
  // the header at the top of this file warns about.
  //
  // WHILE RC-3′ IS RED, NONE OF THESE CAN BE RECORDED AS PROVED. The harness requires a clean
  // leg — the gate must exit 0 on the repository as it stands — and a correctly red gate cannot
  // supply one. That is debt D-009's circularity, arriving exactly where it was predicted. They
  // are kept, anchored and correct so they prove themselves the moment step 5 turns RC-3′ green;
  // deleting them to keep the registry tidy would be D-041's pressure taken rather than named.
  {
    gate: 'verify-provider-platform.js',
    id: 'provider-platform-second-env-reader',
    file: 'packages/platform-providers/src/__fault-env-reader.ts',
    content: 'export const leaked = process.env.SNEAKY;\n',
    violation: 'a second reader of process.env outside the Configuration Provider',
    expects: /reads process\.env|provider-platform property/,
  },
  {
    gate: 'verify-provider-platform.js',
    id: 'provider-platform-azure-lock-in',
    file: 'packages/platform-providers/src/__fault-azure.ts',
    content: "import '@azure/identity';\nexport const x = 1;\n",
    violation: 'an @azure/* import introducing cloud lock-in into the provider platform',
    expects: /@azure|cloud lock-in|provider-platform property/,
  },
  {
    gate: 'verify-provider-platform.js',
    id: 'provider-platform-runtime-coupling',
    file: 'packages/platform-providers/src/__fault-runtime.ts',
    content: "import '@dbiz/functional-testing-engine';\nexport const y = 1;\n",
    violation: 'the additive provider platform importing a deferred runtime/legacy component',
    expects: /imports no runtime|provider-platform property/,
  },
  {
    gate: 'verify-provider-platform.js',
    id: 'provider-platform-stray-fs',
    file: 'packages/platform-providers/src/config/__fault-fs.ts',
    content: "import { readFileSync } from 'node:fs';\nexport const z = readFileSync;\n",
    violation: 'node:fs used outside the Storage/Secret providers',
    expects: /node:fs only|provider-platform property/,
  },
  {
    gate: 'verify-discovery-conformance.js',
    id: 'adapters-declared-but-never-invoked',
    // The exact defect the Functional Testing Engine audit found: adapters resolved,
    // typed and configured — and never called, so nothing was ever published. It is
    // invisible in a diff because nothing is missing; what is missing is a call.
    //
    // The probe keeps every adapter method present and correctly typed and makes the
    // journal inert, which is indistinguishable from "the engine stopped calling them".
    // The run still completes and every other property still holds. Only the adapter
    // coverage property notices, which is the entire reason that property exists.
    //
    // REPLACE on build output, snapshotted and restored.
    mode: 'replace',
    file: 'packages/discovery-flow-engine/dist/src/adapters.js',
    content: [
      '// FAULT PROBE — adapters declared, typed, and never recorded as invoked. Restored immediately.',
      'let sequence = 0;',
      "function nextId(prefix) { sequence += 1; return prefix + '-' + String(sequence).padStart(5, '0'); }",
      'export function resetAdapterSequence() { sequence = 0; }',
      'function inert(provider, testProvider) {',
      "  const identity = (spi, p) => ({ spi, provider: p, version: '1.0.0' });",
      '  return {',
      '    journal: { calls: [] },',
      '    project: {',
      "      identity: identity('ProjectAdapter', provider),",
      "      containerNoun: 'Container', groupingNoun: 'Grouping',",
      "      fetchStory: (id) => ({ id, title: '', body: '', acceptanceCriteria: [] }),",
      "      linkRequirement: () => ({ linked: true, via: 'link' }),",
      '    },',
      '    testManagement: {',
      "      identity: identity('TestManagementAdapter', testProvider),",
      "      createContainer: () => ({ containerId: nextId('container'), noun: 'Container' }),",
      "      createGrouping: () => ({ groupingId: nextId('grouping'), noun: 'Grouping' }),",
      '      findExistingTests: () => [],',
      "      publishTests: (g, tests) => tests.map(() => nextId('test')),",
      '      linkTraceability: () => ({ linked: true }),',
      '    },',
      '    execution: {',
      "      identity: identity('ExecutionAdapter', testProvider),",
      '      publishResult: () => ({ published: true }),',
      '      publishEvidenceReference: () => ({ published: true }),',
      "      publishDefect: () => ({ defectId: nextId('defect') }),",
      '    },',
      '    workItem: {',
      "      identity: identity('WorkItemAdapter', provider),",
      '      nounFor: (level) => level,',
      "      supports: (level) => provider !== 'jira' || level !== 'feature',",
      "      createWorkItem: (r) => ({ workItemId: nextId('wi'), level: r.level, noun: r.level }),",
      '      linkWorkItemTraceability: () => ({ linked: true }),',
      '    },',
      '  };',
      '}',
      "export function azureDevOpsAdapters() { return inert('azure-devops', 'azure-devops'); }",
      "export function jiraAdapters() { return inert('jira', 'zephyr-scale'); }",
      '',
    ].join(String.fromCharCode(10)),
    violation: 'adapters that are configured and typed but whose invocation is never recorded',
    expects: /never called|never invoked|adapter method|D-5/,
  },
  {
    gate: 'verify-platform-certification.js',
    id: 'platform-certified-claim-without-evidence',
    // The failure a certification framework exists to prevent: a document declaring the
    // platform certified while the measured evidence says it is not. It is the same
    // defect the GA gate's false-claim probe plants, at the platform tier — and it is the
    // one most likely to be written by a well-meaning human under release pressure.
    //
    // The framework computes its verdict from executed capability gates and scans the
    // repository for a claim that outruns that verdict. This probe plants exactly such a
    // claim. The gate's soundness properties all still hold — the harness reports NOT
    // CERTIFIED correctly — but the claim scan fails, because a file now asserts otherwise.
    // CREATE mode: a new file, removed on restore.
    file: 'docs/__platform-certified-probe.md',
    content: [
      '# Platform Status — Fault Probe',
      '',
      'The DBiz Agentic QA Platform is now certified for enterprise release.',
      '',
      'Platform certification: CERTIFIED.',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'a document asserting the platform is CERTIFIED while the evidence says NOT CERTIFIED',
    expects: /claims the platform is CERTIFIED|no file claims|says otherwise/,
  },
  {
    gate: 'verify-platform-certification.js',
    id: 'harness-emitting-a-false-certified-verdict',
    // The deeper failure: not a document that lies, but the MEASURING HARNESS itself
    // emitting a false verdict — every capability CERTIFIED, the platform CERTIFIED, with
    // no passing gate behind any of it and the self-validation block lying "sound". A gate
    // that trusted its harness would print PASS and certify a platform that measured
    // nothing. This gate does not trust its harness: it re-derives soundness from the raw
    // per-capability data and compares its finding against the harness's self-report.
    //
    // The replacement harness fabricates six CERTIFIED capabilities with empty gate lists.
    // The gate's independent check "no capability is CERTIFIED without a passing conformance
    // gate" fails, and "the gate's independent finding agrees with the harness
    // self-validation" fails too — the harness says sound, the gate finds otherwise. A
    // clean harness passes; this planted one is rejected. That is the whole point of the
    // gate re-deriving rather than transcribing.
    //
    // REPLACE on the harness, snapshotted and restored.
    mode: 'replace',
    file: 'governance/platform-certification/run-platform-certification.mjs',
    content: [
      '// FAULT PROBE — a harness emitting a false CERTIFIED verdict. Restored immediately.',
      'const dims = {};',
      "for (const d of ['workflow','governance','data-sovereignty','ep-ip-ownership','runtime-completeness','adapter-reachability','ai-enabled-mode','ai-disabled-mode']) dims[d] = { status: 'certified', reason: 'fabricated' };",
      'const cap = (n, name) => ({',
      "  number: n, id: 'fake-' + n, name, verdict: 'CERTIFIED', maturity: 'certified',",
      "  reason: 'fabricated certification with no passing gate', build: { present: true, builds: true, reason: 'fabricated' },",
      "  tests: { ran: true, tests: 1, pass: 1, fail: 0, skipped: 0, green: true, reason: 'fabricated' },",
      '  discoveredGates: [], gates: [], evidenceFiles: [], census: null, evidenceProperties: 0,',
      '  dimensions: dims, certifiedDimensions: 8, totalDimensions: 8,',
      "  measuredEvidence: {}, blockingFindings: [], recommendations: [], nextAction: 'none',",
      '});',
      'const level1 = [cap(1,\'Functional Testing Engine\'),cap(2,\'Dev-Change Engine\'),cap(3,\'Inverse-Flow Discovery Engine\'),cap(4,\'Performance Engine\'),cap(5,\'Security Testing Engine\'),cap(6,\'Penetration Testing Engine\')];',
      "const level2 = { usableCount: 6, canonicalCount: 6, checks: [], verdict: 'PASS', reason: 'fabricated' };",
      "const level3 = { verdict: 'CERTIFIED', gates: [], blockingFindings: [], reason: 'fabricated', recommendations: [], nextActions: ['fabricated'] };",
      "const scorecard = { scores: {}, overall: 100, verdict: 'CERTIFIED', certifiedCapabilities: 6, conditionalCapabilities: 0, canonicalCapabilities: 6 };",
      "const selfValidation = { checks: [{ holds: true }], sound: true, reason: 'fabricated sound' };",
      'process.stdout.write(JSON.stringify({',
      "  framework: 'platform-certification', version: '2.0.0-probe', executionContext: 'probe', generatedAt: '1970-01-01T00:00:00.000Z',",
      '  repositoryState: level1.map((c) => ({ number: c.number, name: c.name, package: true, compiles: true, tests: \'1/1\', gates: 0, evidenceFiles: 0, maturity: c.maturity, verdict: c.verdict })),',
      '  level1, level2, level3, scorecard, selfValidation,',
      '  maturityModel: level1.map((c) => ({ capability: c.name, maturity: c.maturity })),',
      '}, null, 2));',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'the measuring harness emitting six CERTIFIED capabilities and a CERTIFIED platform with no passing gate behind any of it',
    expects: /without a passing conformance gate|agrees with the harness self-validation|claims more than it measured/,
  },
  {
    gate: 'verify-devchange-conformance.js',
    id: 'catalogue-omitting-the-governance-triad',
    // The most dangerous omission a capability can ship: a catalogue that registers every
    // domain agent and NONE of the governance agents. Nothing looks missing — the engine
    // still discovers, classifies, assesses and authors — but no stage can be reviewed,
    // decided or certified, because the agents that do so were never registered. It is the
    // "nothing progresses unless certified" guarantee removed by subtraction rather than by
    // an obvious bypass.
    //
    // The probe keeps the whole domain catalogue and drops the governance import. The first
    // stage's governance orchestrator then asks for an agent that is not registered, the
    // stage throws, and the run fails at planning. The gate catches it at scenario
    // execution and at the governance-completeness property — a clean build passes, a
    // planted one fails, which is the whole point of the property existing.
    //
    // REPLACE on build output, snapshotted and restored.
    mode: 'replace',
    file: 'packages/dev-change-engine/dist/src/catalogue.js',
    content: [
      '// FAULT PROBE — a catalogue that omits the governance triad. Restored immediately.',
      "import { AgentCatalogue } from '@dbiz/capability-framework';",
      "import { repositoryAgents, diffAgents } from './agents/repository-and-diff.js';",
      "import { changeIntelligenceAgents, dependencyIntelligenceAgents, businessImpactAgents, riskIntelligenceAgents, coverageIntelligenceAgents } from './agents/change-intelligence.js';",
      "import { testDiscoveryAgents, reuseAgents, generationAgents, authoringAgents } from './agents/planning-and-automation.js';",
      "import { executionAgents, evidenceAgents, healingAgents, reflectionAgents, rootCauseAgents, defectAgents, learningAgents } from './agents/execution-and-outcome.js';",
      "import { syncAgents, reportingAgents } from './agents/sync-and-reporting.js';",
      "import { changeTypeAgents, repositorySearchAgents, healingKindAgents, frameworkAgents, businessDetailAgents, coverageDetailAgents, discoveryStrategyAgents, rootCauseCategoryAgents } from './agents/expanded.js';",
      '// The governance agents are deliberately NOT imported. Every stage will run its',
      '// execution agents and then fail to review, decide or certify.',
      'export const ALL_AGENTS = [',
      '  ...repositoryAgents, ...diffAgents,',
      '  ...changeIntelligenceAgents, ...changeTypeAgents, ...dependencyIntelligenceAgents,',
      '  ...businessImpactAgents, ...businessDetailAgents, ...riskIntelligenceAgents,',
      '  ...coverageIntelligenceAgents, ...coverageDetailAgents,',
      '  ...testDiscoveryAgents, ...discoveryStrategyAgents, ...reuseAgents, ...repositorySearchAgents,',
      '  ...generationAgents, ...frameworkAgents, ...authoringAgents,',
      '  ...executionAgents, ...evidenceAgents, ...healingAgents, ...healingKindAgents,',
      '  ...reflectionAgents, ...rootCauseAgents, ...rootCauseCategoryAgents, ...defectAgents, ...learningAgents,',
      '  ...syncAgents, ...reportingAgents,',
      '];',
      'export function buildCatalogue() {',
      '  const catalogue = new AgentCatalogue();',
      '  catalogue.registerAll(ALL_AGENTS);',
      '  return catalogue;',
      '}',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'a catalogue that registers every domain agent but none of the governance agents, so no stage can be certified',
    expects: /scenario executed|governance|not certified|V-1|V-18|not registered/,
  },
  {
    gate: 'verify-performance-conformance.js',
    id: 'architecture-document-added-for-the-performance-engine',
    // ADR-0026 §3 (alternative B) forbids the Performance Engine from adding an architecture
    // document: performance testing needs no new architectural concept — it is capability 4, and
    // Document 11 already names it. The conformance property PP-10.a asserts the canonical set is
    // unchanged at twenty-five documents. This plants the exact document the design forbids — the
    // "26-performance-model.md" the alternative was rejected for — and the gate must catch it.
    //
    // CREATE mode: a new file, removed on restore. It touches no build output, so the clean run
    // observes the repository exactly as it stands.
    file: 'docs/architecture/26-performance-model.md',
    content: [
      '# 26 — Performance model (FAULT PROBE)',
      '',
      '**Status:** DRAFT · **Version:** 0.1 · **Date:** 2026-07-23',
      '',
      'An architecture document added for the Performance Engine, which ADR-0026 forbids.',
      'Its presence takes the canonical set to twenty-six documents; PP-10.a must fail.',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'an architecture document added for the Performance Engine (forbidden by ADR-0026; capability 4 needs none)',
    expects: /architecture document was added|26 architecture documents|no architecture document/,
  },
  {
    gate: 'verify-sectest-conformance.js',
    id: 'architecture-document-added-for-the-security-testing-engine',
    // ADR-0028 forbids the Security Testing Engine from adding an architecture document:
    // security verification is capability 5, already named by Document 11, and needs no new
    // architectural concept. Conformance property P-10.a asserts the canonical set is unchanged
    // at twenty-five documents. This plants a 26th document; the scenario re-reads the
    // architecture directory on every run, so the planted file makes P-10.a fail and the gate
    // reports the property violated.
    //
    // CREATE mode: a new file, removed on restore. It touches no build output, so the clean run
    // observes the repository exactly as it stands.
    file: 'docs/architecture/26-security-model.md',
    content: [
      '# 26 — Security model (FAULT PROBE)',
      '',
      '**Status:** DRAFT · **Version:** 0.1 · **Date:** 2026-07-23',
      '',
      'An architecture document added for the Security Testing Engine, which ADR-0028 forbids.',
      'Its presence takes the canonical set to twenty-six documents; P-10.a must fail.',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'an architecture document added for the Security Testing Engine (forbidden by ADR-0028; capability 5 needs none)',
    expects: /P-10\.a|26 architecture documents|architecture document was added/,
  },
  {
    gate: 'verify-pentest-conformance.js',
    id: 'architecture-document-added-for-the-penetration-testing-engine',
    // ADR-0027 forbids the Penetration Testing Engine from adding an architecture document:
    // penetration testing is capability 6, already named by Document 11. Conformance property
    // P-10.a asserts the canonical set is unchanged at twenty-five documents. This plants a 26th
    // document; the scenario re-reads the architecture directory on every run, so the planted
    // file makes P-10.a fail and the gate reports the property violated.
    //
    // CREATE mode: a new file, removed on restore. It touches no build output.
    file: 'docs/architecture/26-penetration-model.md',
    content: [
      '# 26 — Penetration model (FAULT PROBE)',
      '',
      '**Status:** DRAFT · **Version:** 0.1 · **Date:** 2026-07-23',
      '',
      'An architecture document added for the Penetration Testing Engine, which ADR-0027 forbids.',
      'Its presence takes the canonical set to twenty-six documents; P-10.a must fail.',
      '',
    ].join(String.fromCharCode(10)),
    violation: 'an architecture document added for the Penetration Testing Engine (forbidden by ADR-0027; capability 6 needs none)',
    expects: /P-10\.a|26 architecture documents|architecture document was added/,
  },
  {
    gate: 'verify-devchange-certification.js',
    id: 'learning-orchestrator-that-enumerates-instead-of-invoking',
    // The certification counterpart to the conformance catalogue probe. That probe drops the
    // governance triad — but this gate's harness calls a governance agent's handle directly, so
    // removing it crashes the harness (a stack trace, not a measured property). This probe instead
    // makes ONE domain orchestrator inert: the learning orchestrator returns the ids of the agents
    // it owns and invokes none of them. The run still traverses all twelve stages and the harness
    // still emits measurements — but learning.capture never executes, so runtime completeness falls
    // to 99.2%, learning becomes an inert domain, and the certification bar (100% completeness, no
    // dormant agent, no inert domain, every orchestrator executed) is missed. A clean build
    // certifies; this planted one is NOT CERTIFIED.
    //
    // PATCH mode: exactly one orchestrator body is rewritten in the built module. The rest of the
    // file — snapshotted and restored — is the engine as it stands, so the failure is the planted
    // one and nothing else.
    mode: 'patch',
    file: 'packages/dev-change-engine/dist/src/orchestrators.js',
    find: "('learning', 'Capture repository, change, failure, healing, history, graph, memory and prompt learning.', (input, agents, ctx) => call(agents, 'learning.capture', input, ctx))",
    replace: "('learning', 'Capture repository, change, failure, healing, history, graph, memory and prompt learning.', (input, agents, ctx) => agents.byDomain('learning').map((a) => a.id))",
    violation: 'a domain orchestrator (learning) that enumerates its agents instead of invoking them, leaving learning.capture dormant and runtime completeness below 100%',
    expects: /no inert domain|no registered agent is dormant|runtime completeness equals 100%|every domain orchestrator executed/,
  },
  {
    gate: 'verify-pentest-completeness.js',
    id: 'threat-agent-left-dormant',
    // The exact defect this gate's completeness census exists to catch: a registered agent that is
    // never invoked. The threat orchestrator runs the full Threat Intelligence engine; this probe
    // neutralises one of its agent invocations (threat.zero-day-awareness), so that agent goes
    // dormant. The scenario still executes and emits observations — the failure is a MEASURED
    // completeness shortfall, not a crash: runtime completeness drops below 100% and the dormant
    // agent is named. Nothing is missing and no type is wrong; only executing the engine and
    // counting what ran reveals it, which is the entire reason the census exists.
    //
    // PATCH mode on the built module: one invocation statement is rewritten to a no-op; the rest of
    // the file is snapshotted and restored unchanged.
    mode: 'patch',
    file: 'packages/penetration-testing-engine/dist/src/orchestrators.js',
    find: "agents.invoke('threat.zero-day-awareness', base, ctx('threat.zero-day-awareness'));",
    replace: "void 0; /* FAULT PROBE: threat.zero-day-awareness deliberately not invoked, so it goes dormant */",
    violation: 'a registered agent (threat.zero-day-awareness) that is never invoked, leaving it dormant and runtime completeness below 100%',
    expects: /runtime completeness equals 100%|every registered agent executes|dormant|C-13/,
  },
  {
    gate: 'verify-tenant-lifecycle-conformance.js',
    id: 'onboarding-that-provisions-on-assumption',
    // The failure this gate exists to catch, at the platform's front door: an onboarding
    // orchestrator that reports the Execution-Plane stages 8-14 as done rather than
    // pending — a tenant provisioned on assumption, with no proven deployment, smoke or
    // certification (R-21.29). This is the declared-but-unbuilt defect the whole
    // programme is shaped to prevent, and if the gate stays green, "stages 8-14 pending,
    // never assumed" (C-21.29) is decorative.
    //
    // PATCH mode on the built module: the deferred-stage status literal is rewritten from
    // 'pending' to 'done'. The rest of the file — snapshotted and restored — is the
    // orchestrator as it stands, so the failure is the planted one and nothing else.
    mode: 'patch',
    file: 'packages/tenant-onboarding-engine/dist/src/domain/bootstrap-orchestrator.js',
    find: "status: 'pending'",
    replace: "status: 'done'",
    violation: 'an onboarding orchestrator reporting the deferred stages 8-14 as done rather than pending, provisioning a tenant on assumption',
    expects: /C-21\.29|stages 8-14 pending|TL-2/,
  },
  {
    gate: 'verify-registration-conformance.js',
    id: 'registration-that-permits-otc-replay',
    // The failure this gate exists to catch: an OTC store that accepts a bootstrap
    // credential a SECOND time. Single-use (R-36.2) is the property that makes replay or
    // forgery of a consumed one-time credential impossible; if the gate stays green while
    // the store permits replay, "the OTC is single-use — replay refused" (RG-2) is decorative.
    //
    // PATCH mode on the built module: the single-use guard `if (!r || r.consumedAt)` is
    // rewritten to `if (!r)`, so a consumed OTC passes the guard, is re-consumed, and
    // registration replay returns 200 instead of 401. The conformance scenario exercises
    // InMemoryRegistrationStore; the substring occurs in both stores and both are neutered,
    // which only strengthens the planted violation. The rest of the file — snapshotted and
    // restored — is the registration engine as it stands, so the failure is the planted one.
    mode: 'patch',
    file: 'packages/tenant-onboarding-engine/dist/src/engine/registration.js',
    find: 'if (!r || r.consumedAt)',
    replace: 'if (!r)',
    violation: 'an OTC store that accepts a consumed credential a second time — single-use broken, replay permitted (R-36.2)',
    expects: /RG-2|single-use|replay/i,
  },
  {
    gate: 'verify-repository-hygiene.js',
    id: 'a-stub-shipped-in-the-source-tree',
    // An unfinished implementation in the shipped tree. The platform's standard is that no
    // placeholder, stub or temporary implementation reaches a customer; a gate that cannot
    // detect one planted in front of it is not enforcing that standard. CREATE, planted and
    // removed.
    file: 'packages/functional-testing-engine/src/__fault-probe.ts',
    content: '// TODO: implement this properly\n'
      + 'export function notYetImplemented(): never {\n'
      + '  throw new Error(\'not implemented\');\n'
      + '}\n',
    violation: 'a stub carrying a TODO and a not-implemented throw, shipped in the source tree',
    expects: /hygiene|placeholder|stub|check\(s\) failed/i,
  },
  {
    gate: 'verify-ep-certification.js',
    id: 'tampered-ep-certification-accepted',
    // EDR-4's failure, restored: a tampered Execution-Plane certification. The IP must reject
    // a package whose payload was altered after signing (content hash mismatch) or whose
    // signature was forged — otherwise the sovereign certification chain is worthless.
    // REPLACE: the real received certification is snapshotted and restored.
    mode: 'replace',
    file: 'governance/ep-received/ep-certification.json',
    content: JSON.stringify({
      payload: { schemaVersion: '1.0.0', plane: 'execution', contractVersion: '1.0.0', verdict: 'CERTIFIED', governanceResults: [{ id: 'G-1', ok: true }], evidenceReferences: [{ kind: 'screenshot', sha256: 'abc', locator: 'x' }] },
      contentHash: '0000000000000000000000000000000000000000000000000000000000000000',
      signature: 'AA==', algorithm: 'ed25519', keyId: 'ep-cert-v1',
    }, null, 2) + '\n',
    violation: 'a tampered EP certification (content hash mismatch / forged signature) presented to the IP',
    expects: /HASH MISMATCH|SIGNATURE INVALID|rejected the EP certification|not tampered/,
  },
  {
    gate: 'verify-execution-plane-boundary.js',
    // GOVERNANCE-EPIP-002. R-3.5: the Intelligence Plane contains no browser capability
    // "even dormant, even unreferenced". This probe plants a NEW Intelligence-Plane
    // source file that LIVE-imports playwright and drives a browser (chromium.launch /
    // page.goto). It is exactly the class of regression the seam-scoped gates (CI-5,
    // RE-4) cannot see because it is not in their fixed file list — the whole reason the
    // tree-wide gate exists. The gate must go red and name the cause.
    //
    // The tokens are placed as LIVE code (real import + real calls), not string
    // literals — the negative half (that emitter strings / detection regexes do NOT
    // trip the gate) is proven inside the gate's own self-proof on every run (R-13.4).
    file: 'packages/functional-testing-engine/src/__execution-fault-probe.ts',
    content: [
      "import { chromium } from 'playwright';",
      '',
      'export async function faultProbe(url: string): Promise<void> {',
      '  const browser = await chromium.launch({ headless: true });',
      '  const page = await browser.newPage();',
      '  await page.goto(url);',
      '}',
      '',
    ].join('\n'),
    violation: 'an Intelligence-Plane source file that live-imports playwright and launches a browser',
    expects: /execution-ownership violation|browser-drive call|browser-runtime import|contains no execution capability/,
  },
  // ── HTTP surface parity (D-007) ───────────────────────────────────────────
  // The class shipped in TWO distinct shapes, so it is proved in two. Both plant the
  // defect in route() rather than in a controller, because that is the direction the
  // defect actually travelled all three times: the business action was written and
  // tested, and the controller was simply never updated to expose it.
  {
    gate: 'verify-http-surface-parity.js',
    id: 'http-surface-unmapped-tenant-action',
    mode: 'patch',
    // Shape 1 — a `:slug/<action>` sub-resource with no controller mapping. This is the
    // shape of the branding defect and of all six Software Update Management actions.
    // Verified retrospectively: at de83eba (parent of the SUM fix) this gate names
    // "branding, check-compatibility, installed, publish-update, rollback, sync-config,
    // update-history" — it would have caught two of the three live incidents in one run.
    file: 'packages/tenant-onboarding-engine/src/engine/api.ts',
    find: "const parts = req.path.replace(/^\\/+|\\/+$/g, '').split('/'); // ['api','tenants',...]",
    replace: "const parts = req.path.replace(/^\\/+|\\/+$/g, '').split('/'); // ['api','tenants',...]\n  { const action = parts[3] ?? ''; if (action === 'fault-probe-unmapped') return err(500, 'fault probe'); }",
    violation: 'a route() action with no controller mapping — the live server 404s while every route()-level test passes',
    expects: /HS-1|NO controller mapping|fault-probe-unmapped|HTTP surface divergence/,
  },
  {
    gate: 'verify-http-surface-parity.js',
    id: 'http-surface-unmapped-top-level-path',
    mode: 'patch',
    // Shape 2 — a TOP-LEVEL `/api/<path>` route with no @Controller prefix. This is the
    // shape that got through the package-level guard, because that guard inspected only
    // tenant sub-resources. Verified retrospectively: at 87e103a (parent of the fix) this
    // gate names "application-templates".
    file: 'packages/tenant-onboarding-engine/src/engine/api.ts',
    find: "if (parts[0] !== 'api' || parts[1] !== 'tenants') return err(404, `no route for ${req.path}`);",
    replace: "if (parts[1] === 'fault-probe-path') return err(500, 'fault probe');\n  if (parts[0] !== 'api' || parts[1] !== 'tenants') return err(404, `no route for ${req.path}`);",
    violation: 'a top-level route() path with no @Controller prefix — the live server 404s before route() is reached',
    expects: /HS-3|NO @Controller|fault-probe-path|HTTP surface divergence/,
  },
  {
    gate: 'verify-http-surface-parity.js',
    id: 'http-surface-verb-mismatch',
    mode: 'patch',
    // Shape 3 — the action is mapped, but under the WRONG VERB. Both sides name it, so the
    // action-level checks (HS-1/HS-2) agree it exists and pass; NestJS routes on
    // (method, path), so the live server still refuses. This shape has not shipped, and
    // the probe exists so that remains true: it was the declared gap in the first version
    // of this gate, closed by HS-6.
    file: 'packages/tenant-onboarding-engine/src/engine/api.ts',
    find: "if (req.method === 'GET' && action === 'manifest')",
    replace: "if (req.method === 'DELETE' && action === 'manifest') return err(500, 'fault probe');\n  if (req.method === 'GET' && action === 'manifest')",
    violation: 'a route() action accepted under a verb no controller maps — the action exists on both sides, so only the method comparison can see it',
    expects: /HS-6|SAME verb|DELETE manifest|HTTP surface divergence/,
  },
  // ── Intelligence-Plane egress (R-3.2 enforcement mechanism 3) ──────────────
  // Two shapes, because a customer-system client arrives either as a bare call or as a
  // declared dependency, and a gate that caught only one would be trivially evaded.
  {
    gate: 'verify-intelligence-plane-egress.js',
    id: 'ip-egress-direct-fetch-to-customer-system',
    // Shape 1 — a bare fetch() to a customer's test-management tool. This is precisely the
    // client the withdrawn first draft of ADR-0069 proposed building in this plane, and it
    // would have compiled and passed all 67 gates before this one existed (ADR-0069 §2.3).
    file: 'packages/platform-core/src/__egress-fault-probe.ts',
    content: [
      'export async function fetchWorkItem(org: string, id: number, token: string): Promise<unknown> {',
      '  const url = `https://dev.azure.com/${org}/_apis/wit/workitems/${id}?api-version=7.0`;',
      '  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });',
      '  return res.json();',
      '}',
      '',
    ].join('\n'),
    violation: 'an Intelligence-Plane source file opening an outbound connection to a customer system (R-3.2), carrying a customer credential (R-3.3)',
    expects: /EG-2|outbound connection|egress violation|__egress-fault-probe/,
  },
  {
    gate: 'verify-intelligence-plane-egress.js',
    id: 'ip-egress-http-client-dependency',
    // Shape 2 — the client arrives as a declared import rather than a bare call. Caught by
    // the import signal even when the call site is dynamic or indirect.
    file: 'packages/platform-core/src/__egress-client-probe.ts',
    content: [
      "import axios from 'axios';",
      '',
      'export function client(baseURL: string) {',
      '  return axios.create({ baseURL });',
      '}',
      '',
    ].join('\n'),
    violation: 'an Intelligence-Plane source file importing an HTTP client library',
    expects: /EG-2|http-client import|egress violation|__egress-client-probe/,
  },
  {
    gate: 'verify-intelligence-plane-egress.js',
    id: 'ip-egress-aliased-fetch-capture',
    // Shape 3 — the ALIAS. This probe exists because the matcher narrowed silently once: the first
    // version matched only `fetch(`, and `launcher/services/executionPlaneService.mjs` had already
    // slipped past it by defaulting a parameter to `fetch` and calling it as `fetchImpl(...)`. A
    // real R-3.2 violation sat in the tree, invisible to the gate written to catch it. Every capture
    // shape the matcher now covers is exercised here, so a future narrowing fails this proof rather
    // than quietly passing.
    file: 'packages/platform-core/src/__egress-alias-probe.ts',
    content: [
      '// Every shape by which outbound capability is captured without calling fetch directly.',
      'const direct = fetch;',
      'const viaGlobal = globalThis.fetch;',
      'export function inject(send: unknown): unknown { return send; }',
      'export const wired = inject(fetch);',
      'export const captured = [direct, viaGlobal];',
      '',
    ].join('\n'),
    violation: 'an Intelligence-Plane source file capturing fetch as a VALUE — const capture, globalThis reference and argument passing — without ever calling it directly',
    expects: /EG-2|aliased fetch|egress violation|__egress-alias-probe/,
  },
  {
    // ADR-0082 P-82.9, planted: A THIRD MODULE WRITING TO THE STORE.
    //
    // The rule this proves is about CAUSATION, and causation has no type. The store's two methods
    // are named for their causes, but nothing in the language stops a third module calling one of
    // them for a third reason -- a "diagnostics" write on fetch being the exact case P-70.3 was
    // written against, and one that would fail no test because a delivery record and an evidence
    // record differ only in what causes the write.
    //
    // The probe is the smallest form of that: an unpermitted module that writes. The gate must go
    // RED and must NAME THE MODULE AND THE METHOD, because a census that says only "a caller is
    // wrong" sends a reader to grep for it.
    gate: 'verify-run-record-write-surface.js',
    id: 'run-record-unpermitted-write-caller',
    file: 'packages/tenant-onboarding-engine/src/engine/__fault-third-caller.ts',
    content: [
      '/** TRACEABILITY: fault probe for verify-run-record-write-surface.js (ADR-0082 P-82.9). */',
      "import type { RunRecordStore } from '@dbiz/platform-providers';",
      "import type { TenantContext } from '@dbiz/platform-providers';",
      '',
      'export async function recordOnFetch(',
      '  store: RunRecordStore, ctx: TenantContext, runId: string, packageHash: string,',
      '): Promise<void> {',
      '  // A THIRD CAUSE through an existing method: this fires on FETCH.',
      '  await store.onEvidenceArrived(ctx, {',
      "    runId, packageHash, contractVersion: '1.0.0',",
      '    reference: {',
      "      evidenceId: 'diag', contentHashRef: 'f'.repeat(64), classification: 'C2',",
      "      capturedAt: '2026-08-06T00:00:00Z', assuranceState: 'CERTIFIED', outcome: 'captured',",
      '    },',
      '  });',
      '}',
      '',
    ].join('\n'),
    violation: 'a third module driving the run record write surface, so a cause ADR-0082 never authorised enters through an existing event-named method',
    expects: /__fault-third-caller|is not a permitted caller/,
  },
  {
    // ADR-0079 P-79.9's fault proof, faulting the SOURCE OF TRUTH (R-13.7 clause 2): a second
    // persisting module lands in the storage layer carrying neither an authorising ADR nor a
    // retention, and writing a C1-shaped field. That is R-06.4 condition 1 and R-06.9 broken at
    // once, and C-06.11 broken by the credential.
    //
    // THIS IS THE SHAPE THE GATE EXISTS FOR. Document 06 went uncited by every gate for the life
    // of the programme because C-06.11 was satisfiable by absence — no customer-derived artefact
    // was persisted at all. The failure this probe plants is the one that becomes possible the
    // moment that stops being true: the SECOND store, arriving without the declarations the
    // first one carries.
    gate: 'verify-data-sovereignty-store.js',
    id: 'data-sovereignty-undeclared-c1-store',
    file: 'packages/platform-providers/src/storage/__fault-c1-store.ts',
    content: [
      '/** TRACEABILITY: fault probe for verify-data-sovereignty-store.js (ADR-0079 P-79.9). */',
      "import type { TenantContext } from '../tenant/tenant-context.js';",
      "import type { StorageProvider } from './storage-provider.js';",
      '',
      'export class UndeclaredCredentialStore {',
      '  constructor(private readonly storage: StorageProvider) {}',
      '  async save(ctx: TenantContext, password: string): Promise<void> {',
      "    await this.storage.put(ctx, { capability: 'creds', run: 'live', artefact: 'c' },",
      '      JSON.stringify({ password }));',
      '  }',
      '}',
      '',
    ].join('\n'),
    violation: 'a second persisting module in the storage layer with no authorising ADR, no declared retention, and a C1 credential on its write path',
    expects: /undeclared persisting module|C1-shaped field written by|__fault-c1-store/,
  },
  {
    // ADR-0079 P-79.4 / R-06.13 / R-06.15, planted: a purge driver that runs ON DEMAND and
    // SWALLOWS its failures. This is the defect that actually occurred — `purgeExpired` shipped
    // with no caller and the gate was green over it — in the form it would take once a caller
    // exists but is wrong. Both halves of R-06.13's clause are broken here: not on a schedule,
    // and a failure that alerts nobody is the silent skip R-06.15 names.
    gate: 'verify-data-sovereignty-store.js',
    id: 'data-sovereignty-unscheduled-swallowing-purge',
    file: 'packages/platform-providers/src/storage/__fault-purge-swallow.ts',
    content: [
      '/** TRACEABILITY: fault probe for verify-data-sovereignty-store.js (ADR-0079 P-79.4). */',
      "import type { TenantContext } from '../tenant/tenant-context.js';",
      "import type { SealedPackageStore } from './sealed-package-store.js';",
      '',
      'export class OnDemandPurge {',
      '  constructor(private readonly store: SealedPackageStore) {}',
      '  /** Operator-initiated, and it eats the failure. */',
      '  async runNow(ctx: TenantContext): Promise<void> {',
      '    try {',
      '      await this.store.purgeExpired(ctx, Date.now());',
      '    } catch {}',
      '  }',
      '}',
      '',
    ].join('\n'),
    violation: 'a purge driver that is operator-initiated rather than scheduled, and that swallows a purge failure instead of alerting',
    expects: /runs on a SCHEDULE|swallows a failure|__fault-purge-swallow/,
  },
  {
    // D-111, planted: a controller mounted behind an optional `ApiDeps` field that the composition
    // root never sets. This is the defect EXACTLY as it occurred — `GET /api/packages/{hash}` was
    // declared, tested, documented and governed, and unreachable in every deployment.
    //
    // PATCH MODE, because the fault is an ADDITION to a file that must survive: a whole-file copy
    // of app.module.ts would go stale the moment a controller is added, and a stale probe plants
    // nothing while still reporting a proof.
    gate: 'verify-composition-root.js',
    id: 'composition-root-unmounted-surface',
    mode: 'patch',
    file: 'packages/tenant-onboarding-engine/src/server/app.module.ts',
    find: 'return { module: AppModule, controllers, providers };',
    replace: [
      '    if (deps.__faultUnwiredSurface) {',
      '      controllers.push(HealthController);',
      '    }',
      '    return { module: AppModule, controllers, providers };',
    ].join('\n'),
    violation: 'a controller mounted behind an optional ApiDeps field that the composition root never sets — a surface declared, gated, and unreachable in every deployment',
    expects: /unreachable in every deployment|never sets it|__faultUnwiredSurface/,
  },
];

function runGate(gate) {
  const file = path.join(__dirname, gate);
  if (!fs.existsSync(file)) return { exit: null, out: '' };
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  return { exit: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Repository provenance (R-14.4). A claim detached from its origin cannot be reproduced. */
function gitOrNull(args) {
  try {
    return require('child_process').execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { return null; }
}
const PROVENANCE = {
  generator: 'governance/verification/record-fault-proofs.js',
  generatorVersion: '2.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: gitOrNull(['rev-parse', 'HEAD']),
  adrReference: ['ADR-0019', 'ADR-0020'],
  ruleReference: ['R-13.4', 'R-14.2', 'R-14.4', 'C-01.39', 'C-01.42', 'C-01.43'],
};

/** Expiry window. Beyond this a proof reports NOT CURRENT and contributes nothing (R-14.5). */
const EXPIRY_DAYS = 7;

const line = (s) => console.log(s);
line('');
line('GOVERNANCE — recording fault-injection proofs');
line('='.repeat(74));

const recordedAt = new Date().toISOString();
const proofs = [];
let failures = 0;

for (const fault of FAULTS) {
  const target = path.join(ROOT, fault.file);
  const replaces = fault.mode === 'replace' || fault.mode === 'patch';
  let clean;
  let faulted;
  let replay;

  // A replace-mode fault overwrites a file that must survive the probe. Snapshot it
  // BEFORE anything runs, and restore it unconditionally afterwards.
  let snapshot = null;
  // A patch-mode fault plants the CURRENT file with one substring rewritten, rather than a whole
  // hardcoded copy. It is strictly more robust than an embedded full file: it cannot go stale when
  // the source is regenerated, and — because the substitution is asserted to have changed the
  // bytes — it fails loudly if its find-string stops matching rather than silently planting nothing.
  let plantContent = fault.content;
  if (replaces) {
    if (!fs.existsSync(target)) {
      line(`  SKIP  ${fault.gate} — ${fault.file} is absent; build first`);
      failures += 1;
      continue;
    }
    snapshot = fs.readFileSync(target);
    if (fault.mode === 'patch') {
      const original = snapshot.toString('utf8');
      plantContent = original.split(fault.find).join(fault.replace);
      if (plantContent === original) {
        line(`  SKIP  ${fault.gate} — patch find-string did not match ${fault.file}; the probe would be inert`);
        failures += 1;
        continue;
      }
    }
  }

  try {
    // CLEAN — the gate must pass on the repository as it stands.
    if (!replaces && fs.existsSync(target)) fs.rmSync(target);
    clean = runGate(fault.gate);

    // FAULT — plant the violation and observe.
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, plantContent, 'utf8');
    faulted = runGate(fault.gate);
    // REPLAY — the same fault, observed again. A proof that cannot be reproduced
    // is not a proof (R-14.2/R-14.3); recording it once and trusting it forever is
    // the transcription failure with extra steps.
    //
    // The fault is RE-PLANTED first. Some gates legitimately consume what they
    // inspect — the supply-chain gate rebuilds build output as part of its
    // reproducibility check, erasing a probe placed there. Without re-planting,
    // replay would observe a repository the first run had already repaired and
    // record a spurious non-determinism.
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, plantContent, 'utf8');
    replay = runGate(fault.gate);
  } finally {
    // The probe is removed whatever happens. A recorder that could leave a fault
    // behind would be a source of the defects it exists to detect.
    if (replaces) {
      // Restore the original bytes exactly. Regenerating by rebuild would be slower
      // and would leave a window in which the weakened gateway is what is on disk.
      fs.writeFileSync(target, snapshot);
    } else if (fs.existsSync(target)) {
      fs.rmSync(target);
    }
    // ...including the DIRECTORY it created. Removing only the file left empty
    // directories behind — `packages/__fault-probe/` survived in the working tree
    // and would have been committed. Residue is residue whether or not it has
    // contents, and a verifier must leave the repository exactly as it found it.
    let dir = replaces ? ROOT : path.dirname(target);
    while (dir.startsWith(ROOT) && dir !== ROOT) {
      try {
        if (fs.readdirSync(dir).length > 0) break;
        fs.rmdirSync(dir);
      } catch { break; }
      dir = path.dirname(dir);
    }
  }

  const gateExists = clean.exit !== null;
  const cleanPasses = clean.exit === 0;
  const faultDetected = faulted.exit === 1;
  const namedCause = fault.expects.test(faulted.out);
  const replayed = replay !== undefined && replay.exit === faulted.exit
    && fault.expects.test(replay.out) === namedCause;
  const proved = gateExists && cleanPasses && faultDetected && namedCause && replayed;

  if (!proved) failures += 1;

  proofs.push({
    evidenceId: fault.id ? `proof:${fault.gate}#${fault.id}` : `proof:${fault.gate}`,
    gate: fault.gate,
    recordedAt,
    expiresAt: new Date(Date.parse(recordedAt) + EXPIRY_DAYS * 86400000).toISOString(),
    proved,
    replayed,
    violation: fault.violation,
    ...PROVENANCE,
    verificationStatus: proved ? 'verified' : 'failed',
    certificationStatus: proved ? 'certified' : 'uncertified',
    observations: {
      cleanRunExit: clean.exit,
      faultedRunExit: faulted.exit,
      causeNamedInOutput: namedCause,
    },
    properties: {
      positiveDetection: { verified: faultDetected && namedCause, evidence: 'faulted run exited 1 and named the cause' },
      negativeDetection: { verified: cleanPasses, evidence: 'clean run exited 0' },
      faultInjection: { verified: faultDetected, evidence: 'a real violation was planted and observed' },
      falsePositiveResistance: {
        verified: cleanPasses,
        evidence: 'derived from the clean run — not independently measured',
        confidence: 'derived',
      },
      falseNegativeResistance: {
        verified: faultDetected && namedCause,
        evidence: 'derived from the faulted run — not independently measured',
        confidence: 'derived',
      },
      deterministicReplay: {
        verified: replayed,
        evidence: 'the faulted observation was repeated and produced an equivalent outcome',
        confidence: 'measured',
      },
    },
  });

  const status = proved ? 'PROVED' : 'NOT PROVED';
  // The fault id is printed when present: two proofs for one gate are otherwise
  // indistinguishable in the output, and a reader cannot tell which fault was weak.
  line(`\n  [${status.padEnd(10)}] ${fault.gate}${fault.id ? ` (${fault.id})` : ''}`);
  line(`               ${fault.violation}`);
  line(`               clean ${clean.exit} · faulted ${faulted.exit} · named ${namedCause} · replayed ${replayed}`);
  if (!proved) {
    if (!gateExists) line('               gate script is absent');
    else if (!cleanPasses) line('               gate does not pass on a clean repository');
    else if (!faultDetected) line('               gate did NOT detect a planted violation');
    else if (!namedCause) line('               gate failed, but not for the planted reason');
    else if (!replayed) line('               the fault did NOT replay deterministically');
  }
}

fs.writeFileSync(
  REGISTRY,
  `${JSON.stringify({ registryVersion: 1, recordedAt, proofs }, null, 2)}\n`,
  'utf8',
);

line('\n' + '='.repeat(74));
line(`Recorded ${proofs.length} proof(s) to governance/verification/proofs.json`);
if (failures === 0) {
  line('RESULT: PASS — every gate proved it can fail correctly.');
} else {
  line(`RESULT: FAIL — ${failures} gate(s) could not be proved.`);
  // A KNOWN, STRUCTURAL chicken-and-egg, stated rather than left as tribal knowledge.
  //
  // verify-governance-self-validation.js checks that no gate has changed since its
  // proof was recorded. During THIS run its clean pass reads the PREVIOUS registry, so
  // if any gate was edited since that registry was written, it correctly reports the
  // gate as changed — and therefore fails its own clean run and cannot be proved.
  //
  // The registry has just been rewritten, so a second run resolves it. "Run it twice"
  // is a real procedure and belongs in the output, not in someone's memory.
  const selfValidationUnproved = proofs.some(
    (p) => p.gate === 'verify-governance-self-validation.js' && !p.proved
      && p.observations && p.observations.cleanRunExit !== 0,
  );
  if (selfValidationUnproved) {
    line('');
    line('  verify-governance-self-validation.js failed its CLEAN run, which happens when a');
    line('  gate was edited after the previous registry was written: its proof-currency');
    line('  check is comparing against the registry this run has just replaced.');
    line('  The registry is now current. RUN THIS RECORDER ONCE MORE to settle it.');
  }
}
line('');
process.exit(failures === 0 ? 0 : 1);
