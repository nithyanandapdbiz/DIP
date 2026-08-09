'use strict';
/**
 * SUPPLY CHAIN — Software Bill of Materials generator.
 * ============================================================================
 * GENERATED from the resolved dependency graph. Never hand-authored (R-13.1).
 *
 * The SBOM is derived from pnpm's own resolution output rather than from
 * package.json. package.json states what was *requested*; the lockfile and the
 * installed tree state what is *present*. An SBOM built from declarations rather
 * than resolution would list a dependency set nobody actually runs — the
 * declared-but-unbuilt failure applied to inventory.
 *
 * Emits CycloneDX-shaped JSON with the provenance R-14.4 requires.
 *
 * Run:  node governance/supply-chain/generate-sbom.js
 * Exit: 0 = SBOM emitted   1 = the dependency graph could not be resolved
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = __dirname;

function pnpm(args) {
  const r = spawnSync('corepack', ['pnpm', ...args], { cwd: ROOT, encoding: 'utf8', shell: true });
  return { status: r.status, out: `${r.stdout || ''}` };
}
function gitOrNull(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
}

const line = (s) => console.log(s);
line('');
line('SUPPLY CHAIN — SBOM generation');
line('='.repeat(74));

// ── Resolved components, from the installed tree ────────────────────────────
const licenses = pnpm(['licenses', 'list', '--json']);
let byLicense = {};
try { byLicense = JSON.parse(licenses.out); } catch { byLicense = {}; }

const components = [];
for (const [licence, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) {
    for (const version of p.versions ?? []) {
      components.push({
        type: 'library',
        name: p.name,
        version,
        licenses: [{ license: { id: licence } }],
        purl: `pkg:npm/${p.name.replace('@', '%40')}@${version}`,
        // Where it came from is part of the inventory: a component present in the
        // tree but absent from the lockfile is a supply-chain finding, not a detail.
        scope: p.name.startsWith('@types/') ? 'optional' : 'required',
      });
    }
  }
}
components.sort((a, b) => (a.name + a.version).localeCompare(b.name + b.version));

if (components.length === 0) {
  line('\n  FAIL  no components resolved — the dependency graph could not be read');
  line('');
  process.exit(1);
}

const lockPath = path.join(ROOT, 'pnpm-lock.yaml');
const lockHash = fs.existsSync(lockPath)
  ? crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex')
  : null;

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: 'application', name: '@dbiz/intelligence-plane', version: '0.1.0' },
    tools: [{ name: 'generate-sbom.js', version: '1.0.0' }],
    // Provenance (R-14.4). An SBOM detached from the commit that produced it
    // cannot be reproduced, and an irreproducible inventory is an assertion.
    properties: [
      { name: 'dbiz:repository', value: 'DBiz_IntelligencePlane' },
      { name: 'dbiz:branch', value: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown' },
      { name: 'dbiz:commit', value: gitOrNull(['rev-parse', 'HEAD']) ?? 'unknown' },
      { name: 'dbiz:lockfileSha256', value: lockHash ?? 'absent' },
      { name: 'dbiz:executionContext', value: `node ${process.version} on ${process.platform}` },
      { name: 'dbiz:adrReference', value: 'ADR-0011,ADR-0020' },
      { name: 'dbiz:ruleReference', value: 'R-22.6,R-22.8,R-14.4' },
    ],
  },
  components,
};

sbom.metadata.properties.push({
  name: 'dbiz:contentHash',
  value: crypto.createHash('sha256')
    .update('dbiz.sbom@1').update(Buffer.from([0]))
    .update(JSON.stringify(sbom.components))
    .digest('hex'),
});

const outFile = path.join(OUT_DIR, 'sbom.cdx.json');
fs.writeFileSync(outFile, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');

const licenceCounts = Object.entries(
  components.reduce((acc, c) => {
    const id = c.licenses[0].license.id;
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {}),
).sort((a, b) => b[1] - a[1]);

line(`\n  ${components.length} resolved component(s)`);
for (const [id, n] of licenceCounts) line(`    ${String(n).padStart(3)}  ${id}`);
line(`\n  lockfile sha256 : ${lockHash ? `${lockHash.slice(0, 16)}…` : 'ABSENT'}`);
line(`  emitted         : governance/supply-chain/sbom.cdx.json`);
line('');
process.exit(0);
