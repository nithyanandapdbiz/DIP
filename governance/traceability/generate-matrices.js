'use strict';
/**
 * GOVERNANCE — Architecture Coverage Matrix and Enterprise Traceability Matrix.
 * ============================================================================
 * GENERATED from repository state. Never hand-maintained (R-13.1).
 *
 * A hand-kept coverage matrix is the declared-but-unverified failure in its purest
 * form: it asserts that architecture, milestones, implementation and evidence line
 * up, and nothing checks that they do. It stays green precisely because nobody
 * updates it. Derivation is what makes a gap in coverage detectable rather than
 * merely possible.
 *
 * ACM: architecture document -> ADRs -> milestone -> implementation -> evidence.
 * ETM: the full lifecycle chain, with orphan detection at every link.
 *
 * Stages with no artefacts in this repository (release, customer deployment) are
 * reported as NOT MEASURED. They are not scored as zero and not silently omitted —
 * an unmeasured stage contributes nothing in either direction (R-13.3).
 *
 * Run:  node governance/traceability/generate-matrices.js
 * Exit: 0 = matrices emitted   1 = they could not be derived
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const ARCH = path.join(ROOT, 'docs', 'architecture');
const ADR = path.join(ROOT, 'docs', 'adr');
const PROGRAM = path.join(ROOT, 'program');
const OUT = __dirname;

const NM = 'NOT MEASURED';
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const gitOrNull = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

// ── Architecture documents ──────────────────────────────────────────────────
const archFiles = fs.existsSync(ARCH)
  ? fs.readdirSync(ARCH).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()
  : [];

const PLATFORM_SERVICE_DOCS = new Set(['23', '24', '25']);
const CAPABILITY_DOCS = new Set(['11', '12']);

/**
 * Declared coverage map: document -> implementation milestone(s).
 *
 * An INPUT, not a measurement. The mapping is a planning decision that cannot be
 * derived — nothing in an architecture document knows which milestone will build
 * it. Keeping it here rather than inside frozen documents means the roadmap can
 * move without amending frozen architecture, which is what a freeze exists to prevent.
 *
 * A milestone claimed here is still validated against the programme plan, so a
 * mapping to a milestone that does not exist is a finding rather than a free pass.
 */
let coverageMap = { documents: {} };
try { coverageMap = JSON.parse(read(path.join(__dirname, 'coverage-map.json'))); } catch { /* absent */ }

const documents = archFiles.map((f) => {
  const body = read(path.join(ARCH, f));
  const num = f.slice(0, 2);
  const title = (/^#\s*\d\d\s*[—-]\s*(.+)$/m.exec(body)?.[1] ?? f).trim();
  const adrs = [...new Set([...body.matchAll(/\bADR-(\d{4})\b/g)].map((m) => `ADR-${m[1]}`))].sort();
  // Milestone comes from the declared coverage map first, falling back to an
  // "Implemented at" row where a document states one. The map is authoritative
  // because the roadmap moves and frozen architecture must not move with it.
  const declared = coverageMap.documents?.[num]?.milestones ?? null;
  const inDoc = /\|\s*Implemented at\s*\|\s*([^|\n]+)\|/.exec(body)?.[1]?.trim() ?? null;
  const milestone = declared && declared.length ? declared.join(', ') : inDoc;
  const frozen = /\*\*Status:\*\*\s*\*\*FROZEN\*\*/.test(body);
  const criteria = new Set([...body.matchAll(/\*\*(C-[\w.]+)\*\*/g)].map((m) => m[1]));
  return {
    id: num,
    file: f,
    title,
    adrs,
    milestone,
    frozen,
    criteriaCount: criteria.size,
    kind: PLATFORM_SERVICE_DOCS.has(num) ? 'Platform Service'
      : CAPABILITY_DOCS.has(num) ? 'Capability model' : 'Platform architecture',
  };
});

// ── ADRs ────────────────────────────────────────────────────────────────────
const adrFiles = fs.existsSync(ADR)
  ? fs.readdirSync(ADR).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)).sort()
  : [];
const adrs = adrFiles.map((f) => {
  const body = read(path.join(ADR, f));
  const id = f.slice(0, 8);
  const title = (/^#\s*ADR-\d{4}\s*[—-]\s*(.+)$/m.exec(body)?.[1] ?? f).trim();
  const status = /\*\*Status:\*\*\s*([A-Z]+)/.exec(body)?.[1] ?? '?';
  // Components the ADR declares affected — the implementation edge of the chain.
  const section = /##\s*8\.\s*Affected components\s*([\s\S]*)$/i.exec(body)?.[1] ?? '';
  const components = [...new Set([...section.matchAll(/`([^`\n]+\.(?:md|js|ts|json|ya?ml))`/g)].map((m) => m[1]))];
  return { id, file: f, title, status, components };
});

// ── Implementation, tests, evidence ─────────────────────────────────────────
function walk(dir, test, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
      walk(full, test, acc);
    } else if (e.isFile() && test(e.name, full)) acc.push(full);
  }
  return acc;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const sources = walk(path.join(ROOT, 'packages'), (n) => n.endsWith('.ts') && !n.endsWith('.test.ts')).map(rel);
const tests = walk(path.join(ROOT, 'packages'), (n) => n.endsWith('.test.ts')).map(rel);
const gates = fs.existsSync(path.join(ROOT, 'governance', 'verification'))
  ? fs.readdirSync(path.join(ROOT, 'governance', 'verification')).filter((f) => /^verify-.*\.js$/.test(f))
  : [];

/** Criteria cited by implementation and tests — the architecture-to-code edge. */
function citedCriteria(files) {
  const out = new Set();
  for (const f of files) {
    const body = read(path.join(ROOT, f));
    const head = body.slice(0, Math.max(body.indexOf('*/') + 2, 2500));
    for (const m of head.matchAll(/\b(C-\d+\.\d+)\b/g)) out.add(m[1]);
  }
  return out;
}
const implCriteria = citedCriteria(sources);
const testCriteria = citedCriteria(tests);

/** Evidence artefacts actually present. */
const evidenceArtefacts = [
  ['governance/verification/proofs.json', 'gate fault-injection proofs'],
  ['packages/contracts/compat/evidence.json', 'consumer compatibility'],
  ['governance/supply-chain/evidence.json', 'supply chain'],
  ['governance/supply-chain/sbom.cdx.json', 'SBOM'],
].filter(([p]) => fs.existsSync(path.join(ROOT, p)));

const certificationReports = fs.existsSync(path.join(ROOT, 'docs', 'certification'))
  ? fs.readdirSync(path.join(ROOT, 'docs', 'certification')).filter((f) => f.endsWith('.md'))
  : [];

// ── Milestones, from the programme plan ─────────────────────────────────────
const planBody = read(path.join(PROGRAM, 'MASTER_IMPLEMENTATION_PLAN.md'));
const milestones = [...new Set([...planBody.matchAll(/\*\*(M\d+\.\d+[a-z]?)\*\*/g)].map((m) => m[1]))].sort();

/** Milestones claimed in the coverage map that the programme plan does not define. */
const claimedMilestones = new Set();
for (const entry of Object.values(coverageMap.documents ?? {})) {
  for (const m of entry.milestones ?? []) claimedMilestones.add(m);
}
const phantomMilestones = [...claimedMilestones].filter((m) => !milestones.includes(m)).sort();

// ── Architecture Coverage Matrix ────────────────────────────────────────────
const acm = documents.map((d) => {
  const docCriteria = new Set();
  const body = read(path.join(ARCH, d.file));
  for (const m of body.matchAll(/\*\*(C-\d+\.\d+)\*\*/g)) docCriteria.add(m[1]);
  const implemented = [...docCriteria].some((c) => implCriteria.has(c));
  const tested = [...docCriteria].some((c) => testCriteria.has(c));
  return {
    document: `${d.id} — ${d.title}`,
    kind: d.kind,
    adrs: d.adrs.length ? d.adrs.join(', ') : NM,
    programme: d.milestone ? 'P' + (/P(\d)/.exec(d.milestone)?.[1] ?? '?') : NM,
    milestone: d.milestone ?? NM,
    implementationStatus: implemented ? 'implemented' : (d.milestone ? 'scheduled' : NM),
    certificationStatus: d.frozen ? 'frozen' : 'draft',
    evidenceStatus: tested ? 'test-evidenced' : NM,
    traceabilityStatus: d.adrs.length && d.milestone ? 'complete' : 'incomplete',
    criteria: d.criteriaCount,
  };
});

// ── Enterprise Traceability Matrix — the lifecycle chain ────────────────────
const constitution = read(path.join(ARCH, '01-platform-constitution.md'));
const businessVision = /\*\*The problem\.\*\*\s*([^\n]+)/.exec(constitution)?.[1]?.trim() ?? NM;
const capabilityModel = read(path.join(ARCH, '11-capability-model.md'));
// 'Functional Testing Engine' was removed from this list with the capability (ADR-0087).
// The `.filter` would have dropped it anyway once document 11 stopped naming it — which is
// exactly why it is deleted rather than left: a name that survives only because a filter
// removes it reads as a capability the platform still has.
const QE_CAPABILITIES = ['Dev-Change Engine', 'Inverse-Flow Discovery Engine',
  'Performance Engine', 'Security Testing Engine', 'Penetration Testing Engine']
  .filter((c) => capabilityModel.includes(c));

const etm = [
  { stage: 'Business Vision', count: businessVision === NM ? 0 : 1,
    source: '01 §2 derivation', status: businessVision === NM ? NM : 'declared' },
  { stage: 'Business Capability', count: QE_CAPABILITIES.length,
    source: 'derived from the quality-engineering capabilities the platform sells',
    status: QE_CAPABILITIES.length ? 'declared' : NM },
  { stage: 'Quality Engineering Capability', count: QE_CAPABILITIES.length,
    source: '11 — capability model', status: QE_CAPABILITIES.length === 5 ? 'declared' : 'INCOMPLETE' },
  { stage: 'Platform Service', count: PLATFORM_SERVICE_DOCS.size,
    source: '23, 24, 25', status: 'declared' },
  { stage: 'Architecture Document', count: documents.length,
    source: 'docs/architecture', status: documents.every((d) => d.frozen) ? 'all frozen' : 'some draft' },
  { stage: 'Architecture Decision Record', count: adrs.length,
    source: 'docs/adr', status: adrs.every((a) => a.status === 'ACCEPTED') ? 'all accepted' : 'mixed' },
  { stage: 'Implementation', count: sources.length + gates.length,
    source: 'packages/ sources + governance gates', status: sources.length ? 'present' : NM },
  { stage: 'Platform Contract', count: fs.existsSync(path.join(ROOT, 'packages/contracts/schema')) ?
      fs.readdirSync(path.join(ROOT, 'packages/contracts/schema')).length : 0,
    source: 'published JSON Schema', status: 'published' },
  { stage: 'Test', count: tests.length, source: 'packages/**/*.test.ts', status: tests.length ? 'present' : NM },
  { stage: 'Evidence', count: evidenceArtefacts.length,
    source: evidenceArtefacts.map(([, d]) => d).join(', '), status: evidenceArtefacts.length ? 'present' : NM },
  { stage: 'Certification', count: certificationReports.length,
    source: 'docs/certification', status: certificationReports.length ? 'present' : NM },
  { stage: 'Release', count: 0, source: 'no release artefact exists', status: NM },
  { stage: 'Customer Deployment', count: 0, source: 'nothing is deployed; Docker unavailable', status: NM },
];

// ── Orphan detection ────────────────────────────────────────────────────────
const orphans = {
  documentsWithoutAdr: documents.filter((d) => d.adrs.length === 0).map((d) => d.id),
  documentsWithoutMilestone: documents.filter((d) => !d.milestone).map((d) => d.id),
  adrsWithoutComponents: adrs.filter((a) => a.components.length === 0).map((a) => a.id),
  milestonesWithoutDocument: milestones.filter(
    (m) => !documents.some((d) => (d.milestone ?? '').includes(m)),
  ),
  criteriaCitedButUndeclared: [...new Set([...implCriteria, ...testCriteria])]
    .filter((c) => !documents.some((d) => read(path.join(ARCH, d.file)).includes(`**${c}**`))),
  // A coverage map claiming a milestone the plan does not define would make the
  // matrix green by pointing at nothing.
  phantomMilestones,
};

// ── Emit ────────────────────────────────────────────────────────────────────
const timestamp = new Date().toISOString();
const banner = `<!-- GENERATED by governance/traceability/generate-matrices.js — DO NOT EDIT.
     A hand-maintained coverage matrix asserts alignment nothing checks (R-13.1).
     Regenerate rather than correct. -->`;

const fmt = (v) => (v === NM ? `**${NM}**` : `\`${v}\``);

const acmDoc = `${banner}

# Architecture Coverage Matrix

**Generated ${timestamp}.** Derived from repository state.

Every architecture document maps to milestones and evidence; every milestone maps to architecture. A gap here is a **finding**, not a formatting issue.

| Document | Kind | ADRs | Milestone | Implementation | Certification | Evidence | Traceability | Criteria |
|---|---|---|---|---|---|---|---|---|
${acm.map((r) => `| ${r.document} | ${r.kind} | ${fmt(r.adrs)} | ${fmt(r.milestone)} | ${fmt(r.implementationStatus)} | \`${r.certificationStatus}\` | ${fmt(r.evidenceStatus)} | \`${r.traceabilityStatus}\` | ${r.criteria} |`).join('\n')}

## Coverage

| | |
|---|---|
| Documents | ${documents.length} (${documents.filter((d) => d.frozen).length} frozen) |
| Documents with an ADR | ${documents.length - orphans.documentsWithoutAdr.length}/${documents.length} |
| Documents with a declared milestone | ${documents.length - orphans.documentsWithoutMilestone.length}/${documents.length} |
| Milestones with architectural coverage | ${milestones.length - orphans.milestonesWithoutDocument.length}/${milestones.length} |

## Orphans

**An orphan is a real finding.** Architecture with no implementation owner never gets built; implementation with no architecture was reverse-engineered into existence.

| Kind | Count | Detail |
|---|---|---|
| Documents with no ADR reference | ${orphans.documentsWithoutAdr.length} | ${orphans.documentsWithoutAdr.join(', ') || '—'} |
| Documents with no declared milestone | ${orphans.documentsWithoutMilestone.length} | ${orphans.documentsWithoutMilestone.join(', ') || '—'} |
| ADRs declaring no affected component | ${orphans.adrsWithoutComponents.length} | ${orphans.adrsWithoutComponents.join(', ') || '—'} |
| Milestones with no architecture document | ${orphans.milestonesWithoutDocument.length} | ${orphans.milestonesWithoutDocument.join(', ') || '—'} |
| Criteria cited in code but undeclared | ${orphans.criteriaCitedButUndeclared.length} | ${orphans.criteriaCitedButUndeclared.join(', ') || '—'} |
| Coverage map naming a milestone the plan does not define | ${orphans.phantomMilestones.length} | ${orphans.phantomMilestones.join(', ') || '—'} |

**Documents with no declared milestone are expected at this stage** and are not defects: most describe architecture whose implementation milestone lies ahead in the roadmap. They are reported so the count is visible rather than assumed.
`;

const etmDoc = `${banner}

# Enterprise Traceability Matrix

**Generated ${timestamp}.** Derived from repository state.

The governed chain, end to end. Each stage reports what exists — never what is intended.

| # | Stage | Artefacts | Source | Status |
|---|---|---|---|---|
${etm.map((s, i) => `| ${i + 1} | ${s.stage} | ${s.count} | ${s.source} | ${s.status === NM ? `**${NM}**` : `\`${s.status}\``} |`).join('\n')}

## Chain integrity

| | |
|---|---|
| Stages with artefacts | ${etm.filter((s) => s.status !== NM).length}/${etm.length} |
| Stages unmeasured | ${etm.filter((s) => s.status === NM).length}/${etm.length} |

**Release and Customer Deployment are unmeasured because no release exists and nothing is deployed.** They are reported, not scored as zero and not omitted. An unmeasured stage contributes nothing in either direction — inventing a zero would be as dishonest as inventing a one.

## Business vision

> ${businessVision}

Sourced from the Platform Constitution's derivation (§2). **The business vision is not a separate artefact invented for this matrix** — it is the premise the architecture was derived from, and inventing a parallel statement would create a second source of truth for the platform's purpose.

## Quality engineering capabilities

${QE_CAPABILITIES.map((c) => `- ${c}`).join('\n')}

Exactly ${QE_CAPABILITIES.length}, per R-11.4. A seventh requires an approved ADR.
`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'ARCHITECTURE-COVERAGE-MATRIX.md'), acmDoc, 'utf8');
fs.writeFileSync(path.join(OUT, 'ENTERPRISE-TRACEABILITY-MATRIX.md'), etmDoc, 'utf8');

const evidence = {
  evidenceId: 'traceability-matrices',
  generator: 'governance/traceability/generate-matrices.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  branch: gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: gitOrNull(['rev-parse', 'HEAD']),
  adrReference: ['ADR-0018', 'ADR-0019', 'ADR-0020'],
  ruleReference: ['R-13.1', 'R-13.3', 'R-14.4', 'R-11.4'],
  timestamp,
  coverage: {
    documents: documents.length,
    frozen: documents.filter((d) => d.frozen).length,
    documentsWithAdr: documents.length - orphans.documentsWithoutAdr.length,
    documentsWithMilestone: documents.length - orphans.documentsWithoutMilestone.length,
    milestones: milestones.length,
    milestonesCovered: milestones.length - orphans.milestonesWithoutDocument.length,
  },
  chain: etm.map((s) => ({ stage: s.stage, count: s.count, status: s.status })),
  orphans,
  verificationStatus: (orphans.criteriaCitedButUndeclared.length === 0
    && orphans.phantomMilestones.length === 0) ? 'verified' : 'failed',
};
evidence.contentHash = crypto.createHash('sha256')
  .update('dbiz.traceability@1').update(Buffer.from([0]))
  .update(JSON.stringify(evidence, Object.keys(evidence).sort()))
  .digest('hex');
fs.writeFileSync(path.join(OUT, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

console.log('');
console.log('TRACEABILITY MATRICES GENERATED');
console.log('='.repeat(66));
console.log(`  documents            : ${documents.length} (${evidence.coverage.frozen} frozen)`);
console.log(`  with ADR             : ${evidence.coverage.documentsWithAdr}/${documents.length}`);
console.log(`  with milestone       : ${evidence.coverage.documentsWithMilestone}/${documents.length}`);
console.log(`  milestones covered   : ${evidence.coverage.milestonesCovered}/${milestones.length}`);
console.log(`  chain stages present : ${etm.filter((s) => s.status !== NM).length}/${etm.length}`);
console.log(`  criteria cited but undeclared : ${orphans.criteriaCitedButUndeclared.length}`);
console.log(`  phantom milestones            : ${orphans.phantomMilestones.length}`);
console.log('');
process.exit(0);
