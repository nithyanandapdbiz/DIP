'use strict';
/**
 * GOVERNANCE — ADR-0060 Cloud-Native Provider Platform.
 * ============================================================================
 * Certifies the additive infrastructure-abstraction layer (`@dbiz/platform-providers`) by EXECUTION
 * and by static invariant, not by assertion:
 *
 *   PP-1  the provider sources exist (configuration/storage/secret/distributed/tenant/bootstrap).
 *   PP-2  the reference conformance suite PASSES against the REAL build — config precedence + fail-fast,
 *         storage tenant isolation + traversal refusal + case-fold, secret backends, distributed
 *         lock/TTL/nonce/rate-limit, bootstrap composition, tenant-context cross-tenant refusal.
 *   PP-3  ONE reader of `process.env` — only `config/configuration-provider.ts` names it.
 *   PP-4  NO cloud lock-in — no `@azure/*` import or dependency anywhere in the package.
 *   PP-5  `node:fs` is confined to the Storage/Secret providers — business/config/distributed code
 *         never touches the filesystem directly.
 *   PP-6  the runtime is NOT touched — the package does not import the deferred M4/M5/M6 runtime, the
 *         legacy engine, or the `/v1/execute` gateway (additive-only, ADR-0060 §5/§7).
 *   PP-7  distributed state carries NO secret material (no session-secret/api-key/password persisted).
 *   PP-8  Redis is reached through an INJECTED port — the package declares no `ioredis` dependency.
 *
 * A broken invariant (a second env reader, an Azure import, a runtime import, a failing conformance
 * assertion) turns this gate RED.
 *
 * Run:  node governance/verification/verify-provider-platform.js
 * Exit: 0 = the provider platform is certified   1 = a property failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PKG = path.join(ROOT, 'packages', 'platform-providers');
const SRC = path.join(PKG, 'src');
const BUILT_TEST = path.join(PKG, 'dist', 'test', 'provider-platform-conformance.test.js');
const PKG_JSON = path.join(PKG, 'package.json');
const EVIDENCE = path.join(ROOT, 'governance', 'capability', 'provider-platform-evidence.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

/** Recursively collect .ts source files under a directory. */
const tsFiles = (dir) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...tsFiles(p));
    else if (d.name.endsWith('.ts')) out.push(p);
  }
  return out;
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const rel = (p) => path.relative(PKG, p).replace(/\\/g, '/');

line('');
line('GOVERNANCE — ADR-0060 Cloud-Native Provider Platform');
line('='.repeat(74));

// ── PP-1 preconditions ───────────────────────────────────────────────────────
line('\n1. Preconditions');
const required = [
  'config/configuration-provider.ts', 'config/schema.ts', 'storage/storage-provider.ts',
  'secret/secret-provider.ts', 'distributed/distributed-state-provider.ts',
  'tenant/tenant-context.ts', 'bootstrap/platform-bootstrap.ts', 'index.ts',
];
const missing = required.filter((r) => !fs.existsSync(path.join(SRC, r)));
check('PP-1  all provider sources exist', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : required.length + ' sources present');
check('PP-1  the reference conformance suite is built', fs.existsSync(BUILT_TEST),
  fs.existsSync(BUILT_TEST) ? 'dist/test/provider-platform-conformance.test.js' : 'not built — run tsc in @dbiz/platform-providers');

if (missing.length || !fs.existsSync(BUILT_TEST)) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — the provider platform cannot be evidenced (NOT MEASURED is FAIL, R-13.3).');
  process.exit(1);
}

const sources = tsFiles(SRC);
const code = (p) => stripComments(fs.readFileSync(p, 'utf8'));

// ── PP-2 conformance (executed) ──────────────────────────────────────────────
line('\n2. Reference conformance (executed against the real build)');
const run = spawnSync(process.execPath, ['--test', BUILT_TEST], { cwd: PKG, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
const passed = Number((out.match(/(?:#|ℹ)\s*pass\s+(\d+)/) || [])[1] || 0);
const failed = Number((out.match(/(?:#|ℹ)\s*fail\s+(\d+)/) || [])[1] || (run.status === 0 ? 0 : 1));
check('PP-2  the reference conformance suite passes', run.status === 0 && failed === 0 && passed >= 18,
  `${passed} passed, ${failed} failed (exit ${run.status})`);

// ── PP-3 single env reader ────────────────────────────────────────────────────
line('\n3. Configuration is the sole environment reader');
const envReaders = sources.filter((p) => /process\.env/.test(code(p))).map(rel);
check('PP-3  only configuration-provider.ts reads process.env',
  envReaders.length === 1 && envReaders[0] === 'src/config/configuration-provider.ts',
  envReaders.length ? `readers: ${envReaders.join(', ')}` : 'no reader found');

// ── PP-4 no Azure lock-in ─────────────────────────────────────────────────────
line('\n4. No cloud lock-in');
const azureSrc = sources.filter((p) => /@azure\//.test(code(p))).map(rel);
const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const azureDep = Object.keys(deps).filter((d) => d.startsWith('@azure/'));
check('PP-4  no @azure/* import or dependency', azureSrc.length === 0 && azureDep.length === 0,
  azureSrc.length || azureDep.length ? `src: ${azureSrc.join(', ')}; deps: ${azureDep.join(', ')}` : 'zero Azure coupling');

// ── PP-5 fs confined to storage/secret ────────────────────────────────────────
line('\n5. Filesystem confined to the Storage/Secret providers');
const ALLOW_FS = new Set(['src/storage/storage-provider.ts', 'src/secret/secret-provider.ts']);
const fsUsers = sources.filter((p) => /from ['"]node:fs['"]|require\(['"]node:fs['"]\)/.test(code(p))).map(rel);
const strayFs = fsUsers.filter((p) => !ALLOW_FS.has(p));
check('PP-5  node:fs only in the Storage/Secret providers', strayFs.length === 0,
  strayFs.length ? `stray fs users: ${strayFs.join(', ')}` : `fs confined to: ${fsUsers.join(', ') || 'none'}`);

// ── PP-6 runtime untouched (additive-only) ────────────────────────────────────
line('\n6. The deferred runtime is not touched');
const FORBIDDEN_MODULE = /(functional-testing-engine|platform-runtime|capability-framework|tenant-onboarding-engine|ip-execute-gateway|canonical-capability|runtime-execution-spi|runtime-entry-point|legacy)/;
// Extract EVERY import/require specifier — `import x from 'm'`, bare `import 'm'`, and `require('m')` —
// and test the specifier itself. (An earlier heuristic missed bare side-effect imports.)
const importSpecifiers = (c) => {
  const specs = [];
  const re = /(?:\bfrom|\bimport|\brequire\s*\()\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(c)) !== null) specs.push(m[1]);
  return specs;
};
const runtimeImporters = sources.filter((p) => importSpecifiers(code(p)).some((s) => FORBIDDEN_MODULE.test(s))).map(rel);
check('PP-6  the package imports no runtime/legacy/gateway component', runtimeImporters.length === 0,
  runtimeImporters.length ? `importers: ${runtimeImporters.join(', ')}` : 'additive-only — no runtime coupling');

// ── PP-7 no secrets in distributed state ──────────────────────────────────────
line('\n7. Distributed state holds no secret material');
const distSrc = code(path.join(SRC, 'distributed', 'distributed-state-provider.ts'));
// The provider must not persist secret-shaped values; it stores caller-supplied coordination data only.
// Guard: the distributed source names no secret env var / secret concept as a stored value.
const SECRET_TOKENS = /(SESSION_SECRET|api[_-]?key|password|private[_-]?key|bearer\s+token)/i;
check('PP-7  the distributed provider references no secret material', !SECRET_TOKENS.test(distSrc),
  SECRET_TOKENS.test(distSrc) ? 'a secret token appears in the distributed provider' : 'coordination state only — no secrets');

// ── PP-8 redis via injected port ──────────────────────────────────────────────
line('\n8. Redis via an injected port (no ioredis dependency)');
const hasIoredisDep = Object.keys(deps).some((d) => d === 'ioredis' || d === 'redis');
const hasInjectedPort = /RedisLikeClient/.test(distSrc);
check('PP-8  Redis is reached through RedisLikeClient; no ioredis/redis dependency',
  hasInjectedPort && !hasIoredisDep,
  hasIoredisDep ? 'a redis client dependency is declared' : 'RedisLikeClient injected — provider-agnostic');

// ── Evidence envelope (R-13.2) ────────────────────────────────────────────────
const evidence = {
  evidenceId: 'adr0051-provider-platform',
  generator: 'governance/verification/verify-provider-platform.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  timestamp: new Date().toISOString(),
  adrReference: ['ADR-0060', 'ADR-0019'],
  ruleReference: ['R-17.11', 'R-17.12', 'R-17.15', 'R-17.20', 'R-13.1', 'R-13.4'],
  properties: [
    { id: 'PP-1', observed: missing.length === 0 },
    { id: 'PP-2', observed: run.status === 0 && failed === 0 && passed >= 18, referencePassed: passed, referenceFailed: failed },
    { id: 'PP-3', observed: envReaders.length === 1, readers: envReaders },
    { id: 'PP-4', observed: azureSrc.length === 0 && azureDep.length === 0 },
    { id: 'PP-5', observed: strayFs.length === 0, fsUsers },
    { id: 'PP-6', observed: runtimeImporters.length === 0 },
    { id: 'PP-7', observed: !SECRET_TOKENS.test(distSrc) },
    { id: 'PP-8', observed: hasInjectedPort && !hasIoredisDep },
  ],
  verificationStatus: failures === 0 ? 'verified' : 'failed',
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) line('RESULT: PASS — the ADR-0060 cloud-native provider platform is certified by executed evidence.');
else line(`RESULT: FAIL — ${failures} provider-platform property violated (ADR-0060).`);
line('');
process.exit(failures === 0 ? 0 : 1);
