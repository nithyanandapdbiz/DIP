/**
 * Writes the Customer Success Package to disk.
 *
 * Separated from the evidence harness so the harness can decide, from an executed
 * validation, WHETHER to publish. A package that writes itself as a side effect of
 * being built would appear on disk even when the run that produced it failed — and a
 * bad package is indistinguishable from a good one to the customer holding it.
 *
 * The target directory is CLEARED first. Leaving stale files behind would let a
 * document survive the release that stopped generating it, which is precisely how a
 * documentation set comes to describe a capability that no longer exists.
 *
 * Run:  node governance/customer-success/emit-package.mjs <targetDir> <observationsJson>
 * Out:  {"count":N,"contentHash":"..."}
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = process.argv[2];
const observationsPath = process.argv[3];
if (!target || !observationsPath) {
  process.stdout.write(JSON.stringify({
    count: 0,
    error: 'usage: emit-package.mjs <targetDir> <observationsJson>',
  }));
  process.exit(1);
}

/**
 * Observations from the run that validated this release.
 *
 * REQUIRED, not optional. Without them the emitter would have to derive an error
 * catalogue and a limitations list from somewhere else — and the only other source is
 * this file's own assumptions, which is how documentation comes to describe a refusal
 * that never happens.
 */
let observations;
try {
  observations = JSON.parse(readFileSync(observationsPath, 'utf8'));
} catch (e) {
  process.stdout.write(JSON.stringify({ count: 0, error: `unreadable observations: ${e.message}` }));
  process.exit(1);
}

const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');
const cs = await import(pathToFileURL(entry('customer-success')).href);
const core = await import(pathToFileURL(entry('platform-core')).href);
const contracts = await import(pathToFileURL(entry('contracts')).href);

const schemaDir = join(ROOT, 'packages', 'contracts', 'schema');
const schemaSources = existsSync(schemaDir)
  ? readdirSync(schemaDir).filter((f) => f.endsWith('.json')).sort()
    .map((name) => ({ name, schema: JSON.parse(readFileSync(join(schemaDir, name), 'utf8')) }))
  : [];

const gitOrNull = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

const pkg = cs.buildCustomerSuccessPackage({
  releaseVersion: 'M2.7',
  contractVersion: contracts.CONTRACT_VERSION,
  generatorVersion: core.GENERATOR_VERSION,
  templateVersion: core.TEMPLATE_VERSION,
  apiSurface: {
    authorisedPaths: ['/v1/execute'],
    observedResponses: observations.observedResponses ?? [],
    contractVersion: contracts.CONTRACT_VERSION,
  },
  schemaSources,
  knownFailures: observations.knownFailures ?? [],
  unmeasured: observations.unmeasured ?? [],
  onboardingDurationMs: observations.onboardingDurationMs ?? null,
  provenance: {
    repository: 'DBiz_IntelligencePlane',
    commit: gitOrNull(['rev-parse', 'HEAD']),
    branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
    executionContext: `node ${process.version} on ${process.platform}`,
  },
  builtAt: '2026-07-22T00:00:00.000Z',
});

const index = cs.generateIndex(pkg);
const all = [...pkg.files, index];

// Clear, then write. A stale document is worse than a missing one: it is read.
rmSync(target, { recursive: true, force: true });
for (const f of all) {
  const full = join(target, f.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, f.content, 'utf8');
}
writeFileSync(join(target, 'MANIFEST.json'), `${JSON.stringify(pkg.manifest, null, 2)}\n`, 'utf8');

process.stdout.write(JSON.stringify({
  count: all.length + 1,
  contentHash: pkg.contentHash.value,
  shippable: pkg.shippable,
}));
