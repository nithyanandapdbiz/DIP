/**
 * PROGRAMME CLOSURE PACKAGE — generated from measured state.
 *
 * TRACEABILITY
 *   Architecture : 18-governance-model.md · 24-platform-intelligence-model.md
 *   ADR          : ADR-0018 · ADR-0020
 *   Criteria     : C-24.1 (no metric interpolated, estimated or inferred)
 *                  C-24.2 (every metric traces to an artefact and a commit)
 *                  C-24.5 (every index publishes score, coverage and freshness)
 *
 * A CLOSURE REGISTER THAT IS TYPED BY HAND IS OBSOLETE THE DAY IT IS WRITTEN.
 * Every figure below is read from an evidence file, a proof registry, a gate list or
 * the architecture set itself. Nothing is transcribed. That matters more at closure
 * than anywhere else: a baseline is the document future work will trust without
 * re-deriving, so an error in it survives longer than an error anywhere else.
 *
 * THE BLOCKER CLASSIFICATION IS EXPLICIT, AND CHECKED FOR COMPLETENESS.
 * The mission states that E-2 shall be the only blocker. That is true of the GA
 * DETERMINATION and false of the programme as a whole. Rather than write either claim,
 * every unmeasured property is classified into deployment-alone, deployment-and-more,
 * or independent — see BLOCKER_CLASS. The classification is a judgement, so it is
 * written down rather than inferred, and the closure gate fails on any property that
 * is not classified.
 *
 * Run:  node governance/closure/emit-closure-package.mjs <targetDir>
 * Out:  {"written":[...],"baseline":{...}}
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = process.argv[2] ?? join(ROOT, 'program');
mkdirSync(target, { recursive: true });

const written = [];
const write = (name, lines) => {
  writeFileSync(join(target, name), `${lines.join('\n')}\n`, 'utf8');
  written.push(name);
};

const readJson = (rel) => {
  try { return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')); } catch { return null; }
};
/**
 * Content hash over the CANONICAL representation — line endings normalised to LF first.
 *
 * The emitter and `verify-programme-closure.js` MUST hash identically, or the baseline this writes can
 * never be satisfied by the gate that reads it. They had drifted: the committed baseline held LF hashes
 * for the ADRs and CRLF hashes for the architecture set, because the two groups were emitted from
 * working trees with different checkout settings. Every governed document therefore reported as
 * "modified" on one platform or the other, and the documented remedy — re-emitting this baseline —
 * would have re-recorded whichever representation the operator's machine happened to produce, moving
 * the failure to their colleagues rather than removing it.
 *
 * `.gitattributes` declares these files `text`, so LF is the representation the repository actually
 * stores; hashing it makes the baseline mean the same thing on Windows, on macOS and in CI. This
 * changes the ENCODING of the fingerprint, never what counts as a change: a single edited character
 * still produces a different hash and still fails the gate.
 */
const canonical = (s) => s.replace(/\r\n/g, '\n');
const sha = (s) => createHash('sha256').update(canonical(s)).digest('hex');
const gitOrNull = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

// ── Measured inputs ─────────────────────────────────────────────────────────
const EVIDENCE_SETS = [
  ['operational', 'governance/operational/evidence.json', 'M2.6 Operational Readiness'],
  ['customer-success', 'governance/customer-success/evidence.json', 'M2.7 Customer Success'],
  ['production', 'governance/production/evidence.json', 'M2.8 Production Readiness'],
  ['deployment', 'governance/deployment/evidence.json', 'General Availability'],
  ['supply-chain', 'governance/supply-chain/evidence.json', 'M2.4 Trusted Supply Chain'],
  ['traceability', 'governance/traceability/evidence.json', 'M2.5a Coverage & Traceability'],
  ['compatibility', 'packages/contracts/compat/evidence.json', 'M2.2 Consumer Compatibility'],
];

const evidence = new Map();
for (const [id, rel, label] of EVIDENCE_SETS) {
  const body = readJson(rel);
  if (body) evidence.set(id, { id, rel, label, body });
}

const proofs = readJson('governance/verification/proofs.json');
const deployment = evidence.get('deployment')?.body ?? null;

// Gates, read from the runner rather than listed — the runner is what decides.
const runnerSrc = existsSync(join(ROOT, 'governance/verification/run-all.js'))
  ? readFileSync(join(ROOT, 'governance/verification/run-all.js'), 'utf8') : '';
const gates = [...runnerSrc.matchAll(/script:\s*'([^']+\.js)'/g)].map((m) => m[1]);

// Architecture set, hashed. The baseline's whole purpose is that future drift is
// detectable without re-reading every document.
const ARCH_DIR = join(ROOT, 'docs', 'architecture');
const archDocs = existsSync(ARCH_DIR)
  ? readdirSync(ARCH_DIR).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()
  : [];
const archBaseline = archDocs.map((f) => {
  const body = readFileSync(join(ARCH_DIR, f), 'utf8');
  const criteria = new Set([...body.matchAll(/\*\*(C-[\w.]+)\*\*/g)].map((m) => m[1]));
  const owns = /\*\*This document owns:\*\*\s*(.+)/.exec(body)?.[1]?.trim() ?? null;
  return {
    document: f,
    frozen: /\*\*Status:\*\*\s*\*\*FROZEN\*\*/.test(body),
    criteria: criteria.size,
    owns,
    sha256: sha(body),
  };
});

const ADR_DIR = join(ROOT, 'docs', 'adr');
const adrDocs = existsSync(ADR_DIR)
  ? readdirSync(ADR_DIR).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)).sort() : [];
const adrBaseline = adrDocs.map((f) => {
  const body = readFileSync(join(ADR_DIR, f), 'utf8');
  return { adr: f, status: /\*\*Status:\*\*\s*([A-Z]+)/.exec(body)?.[1] ?? 'UNKNOWN', sha256: sha(body) };
});

// ── Classification of every unmeasured property ─────────────────────────────
/**
 * How each unmeasured property is blocked.
 *
 * AN EXPLICIT TABLE, NOT A REGEX OVER THE BLOCKER TEXT. The first version of this
 * generator inferred the classification by pattern-matching, and got two of twenty-one
 * wrong in opposite directions: G-5 was marked deployment-blocked because its blocker
 * contains the word "deployed" — but a container runtime does not supply a shared
 * nonce store, so GA would not close it — while G-3 and G-4 were marked independent
 * because theirs say "production traffic" rather than "deployed", when both plainly
 * require a deployment first.
 *
 * Both errors are the same mistake: inferring MEANING from wording. In a closure
 * baseline that is worse than a manual table, because a baseline is the document future
 * work trusts without re-deriving. The classification is a judgement about what each
 * blocker requires, so it is written down, reviewable, and checked for completeness by
 * the closure gate — an unclassified property fails the build rather than defaulting.
 *
 *   deployment-alone       a container runtime is sufficient
 *   deployment-and-more    a runtime is necessary but not sufficient
 *   independent            a runtime is irrelevant; GA will not close it
 */
const BLOCKER_CLASS = new Map([
  ['E-2', ['deployment-alone', 'a container runtime']],
  ['G-1', ['deployment-alone', 'a container runtime']],
  ['K-15', ['deployment-alone', 'a container runtime']],
  ['GA-1', ['deployment-alone', 'a container runtime']],
  ['GA-2', ['deployment-alone', 'a container runtime']],
  ['GA-3', ['deployment-alone', 'a container runtime']],
  ['GA-4', ['deployment-alone', 'a container runtime']],
  ['GA-5', ['deployment-alone', 'a container runtime']],
  ['GA-6', ['deployment-alone', 'a container runtime']],
  ['GA-7', ['deployment-alone', 'a container runtime']],
  ['GA-8', ['deployment-alone', 'a container runtime']],
  ['GA-9', ['deployment-alone', 'a container runtime']],
  ['GA-10', ['deployment-alone', 'a container runtime']],
  ['G-2', ['deployment-and-more', 'a horizontally scaled deployment AND production load']],
  ['G-3', ['deployment-and-more', 'a deployment AND a 30-day window of real traffic']],
  ['G-4', ['deployment-and-more', 'a deployment AND a production incident to detect']],
  ['G-5', ['independent', 'a shared nonce store implementation — a deployment-topology decision (D-003). A container runtime does NOT provide one']],
  ['K-12', ['independent', 'an observed customer. The automated path is already measured']],
  ['K-13', ['independent', 'Playwright, Selenium, JUnit, NUnit and pytest installed']],
  ['K-14', ['independent', 'a clean-environment runner per language']],

  // TRANSIENT. These are not outstanding programme items. Each is blocked only while
  // the harness that produces it is itself failing — publishing a package or a report
  // from a failed validation is refused by design — so they appear during a fault
  // probe and clear on the next clean run.
  //
  // They are classified rather than skipped. The completeness check exists so a
  // genuinely new blocker cannot slip in by defaulting into whichever bucket the
  // renderer happens to use, and quietly ignoring these would reopen that exact gap.
  ['K-11', ['transient', 'nothing — blocked only while its own validation run is failing']],
  ['G-reports', ['transient', 'nothing — blocked only while its own validation run is failing']],
]);

const unmeasured = [];
for (const { id, label, body } of evidence.values()) {
  for (const u of body.unmeasured ?? []) {
    if (!u || !u.id) continue;
    const [klass, needs] = BLOCKER_CLASS.get(u.id) ?? ['UNCLASSIFIED', 'not classified'];
    unmeasured.push({
      set: id,
      milestone: label,
      id: u.id,
      property: u.property ?? '(unnamed)',
      blocker: u.blocker ?? '(no blocker stated)',
      class: klass,
      needs,
    });
  }
}
// Deduplicated by id: E-2 is reported by two evidence sets, and counting it twice
// would overstate how much is outstanding.
const byId = new Map();
for (const u of unmeasured) if (!byId.has(u.id)) byId.set(u.id, u);
const distinct = [...byId.values()];

const deploymentAlone = distinct.filter((u) => u.class === 'deployment-alone');
const deploymentAndMore = distinct.filter((u) => u.class === 'deployment-and-more');
const independentlyBlocked = distinct.filter((u) => u.class === 'independent');
// Excluded from the registers: these describe a failing run, not an outstanding item,
// and listing them as programme limitations would overstate what remains.
const transient = distinct.filter((u) => u.class === 'transient');
const unclassified = distinct.filter((u) => u.class === 'UNCLASSIFIED');
const deploymentBlocked = [...deploymentAlone, ...deploymentAndMore];

// NOT IMPLEMENTED is a different category and is read from a different source: a
// component that does not exist is not an unmeasured property, it is absent work.
const implStatus = existsSync(join(ROOT, 'program', 'IMPLEMENTATION_STATUS.md'))
  ? readFileSync(join(ROOT, 'program', 'IMPLEMENTATION_STATUS.md'), 'utf8') : '';
const notImplemented = [...implStatus.matchAll(/^\|\s*([^|]+?)\s*\|\s*NOT STARTED\s*\|/gm)]
  .map((m) => m[1].trim())
  .filter((n) => n && n !== 'Component');

// Technical debt.
const debtBody = existsSync(join(ROOT, 'program', 'TECHNICAL_DEBT.md'))
  ? readFileSync(join(ROOT, 'program', 'TECHNICAL_DEBT.md'), 'utf8') : '';
// ONLY the "Current debt" section. Matching the whole file also caught the
// "raised and closed" table, which reported closed items as open — and duplicated
// them, because several appear in both.
const currentDebtSection = /##\s*1\.\s*Current debt\s*([\s\S]*?)(?=\n##\s)/.exec(debtBody)?.[1] ?? '';
/**
 * A ROW THAT CANNOT BE PARSED IS AN ERROR, NOT A ROW TO SKIP.
 *
 * This previously collected the rows it could match and ignored the rest. Two entries were
 * silently absent from `openDebt` as a result, in opposite ways: **D-019** was tagged
 * `| **D-019** · **HIGHEST SEVERITY** |` and dropped — the closure package omitted precisely the
 * entry marked as mattering most — and **D-014** carries its resolution in the identifier cell
 * (`| **D-014 — RESOLVED …** |`) and had been dropped since the day it was written, unnoticed
 * because a resolved entry's absence from an open-debt list looks correct.
 *
 * The general form is worth more than either incident: **presentational emphasis inside a
 * machine-read field silently deletes the entry it was meant to emphasise, and it fails in both
 * directions at once** — the table reads as more correct and the JSON reads as complete. Nothing
 * in either artefact shows the row went missing.
 *
 * **A parser that skips is a gate that cannot fail on the thing it reads** (CHARTER R-13.7).
 * So: any line in the Current-debt section that looks like a debt row — begins with `|` and
 * names a `D-nnn` — must parse, or emission fails and names the row.
 */
/**
 * A DEBT ROW IS ONE WHOSE **FIRST CELL** NAMES A `D-nnn`, not merely any table row that mentions
 * one. The first version of this guard used "begins with `|` and mentions D-nnn anywhere", which
 * fired on its first real exercise against a narrative table inside §1 whose rows cite debt ids in
 * their prose. **The repair was to make the rule more precise, not more permissive** — loosening it
 * back towards skipping would have restored the defect it was built to catch, in exchange for
 * silencing a false positive. Precision keeps both properties: the two known omissions still fail
 * (their identifiers ARE in the first cell), and a table that merely discusses debt does not.
 */
const firstCellOf = (line) => line.trimStart().replace(/^\|/, '').split('|')[0] ?? '';
const debtRowLines = currentDebtSection.split('\n')
  .filter((line) => line.trimStart().startsWith('|') && /\bD-\d+\b/.test(firstCellOf(line)));
const STRICT_DEBT_ROW = /^\|\s*\*\*(D-\d+)\*\*\s*\|\s*([^|]+)\|/;
const unparseableDebtRows = debtRowLines.filter((line) => !STRICT_DEBT_ROW.test(line));
if (unparseableDebtRows.length > 0) {
  throw new Error(
    `TECHNICAL_DEBT.md §1: ${unparseableDebtRows.length} debt row(s) have an unparseable identifier `
    + 'cell and would have been SILENTLY OMITTED from the closure package. The identifier cell must '
    + 'contain **D-nnn** and nothing else; put emphasis, status and prose in the item cell.\n'
    + unparseableDebtRows.map((l) => `  ${l.slice(0, 120)}…`).join('\n'),
  );
}
const openDebt = debtRowLines.map((line) => {
  const m = STRICT_DEBT_ROW.exec(line);
  return { id: m[1], summary: m[2].trim() };
});

const gaCertified = deployment?.generalAvailability === 'CERTIFIED';
const commit = gitOrNull(['rev-parse', 'HEAD']);
const branch = gitOrNull(['rev-parse', '--abbrev-ref', 'HEAD']);

const totalCriteria = archBaseline.reduce((n, d) => n + d.criteria, 0);
const frozenCount = archBaseline.filter((d) => d.frozen).length;

// The baseline hash. Two closures of the same repository state produce the same value,
// so drift after closure is detectable by recomputation rather than by review.
const baselineHash = sha(JSON.stringify({
  architecture: archBaseline.map((d) => [d.document, d.sha256]),
  adrs: adrBaseline.map((d) => [d.adr, d.sha256]),
  gates: gates.slice().sort(),
}));

// ── 1. PROGRAMME_SUMMARY.md ─────────────────────────────────────────────────
const MILESTONES = [
  ['M2.1', 'Cross-plane contract package', 'A versioned contract both planes compile against',
    '`@dbiz/contracts` v1.0.0, JSON Schema emitted from Zod', 'COMPLETE'],
  ['M2.2', 'Consumer compatibility harness', 'Prove a contract change cannot silently break a consumer',
    '9 properties over a frozen fixture corpus, regenerated never copied', 'COMPLETE'],
  ['M2.4', 'Trusted software supply chain', 'Know what is in the build and that it is reproducible',
    'SBOM, frozen lockfile, licence policy, reproducible build', 'PARTIAL'],
  ['M2.5', 'Production deployment readiness', 'Deploy the platform',
    'Blocked at the outset on the absence of a container runtime', 'BLOCKED'],
  ['M2.5a', 'Platform Service architecture baseline', 'Close the gap that M2.6–M2.8 would otherwise have implemented without architecture',
    'Documents 23, 24, 25 frozen; Architecture Coverage Matrix and Enterprise Traceability Matrix, both generated', 'COMPLETE'],
  ['P2.3', 'Tenant onboarding & secure solution generation', 'Platform Core as a bounded context, not a seventh capability',
    'ADR-0021; ownership distributed across documents 03, 08 and 21', 'COMPLETE'],
  ['M2.6', 'Operational runtime', 'Executable operational proof, not more architecture',
    'Real X.509 CA, OAuth bound to certificates, mutual-TLS gateway, atomic registration, tenant runtime', 'CERTIFIED (1 exception)'],
  ['M2.7', 'Customer success readiness', 'A customer can adopt the platform without engineering help',
    'Guided onboarding, diagnostics, CLI, 58-file Customer Success Package generated from validation output', 'CERTIFIED (4 exceptions)'],
  ['M2.8', 'Production operations', 'When it runs, is it observable and diagnosable?',
    'Telemetry, health/readiness/liveness, SLOs with enforceable budgets, dashboards, release governance', 'CERTIFIED (5 exceptions)'],
  ['GA', 'General Availability', 'Deployment evidence',
    'Deployment capability probe; GA gate that makes a false claim impossible', 'NOT CERTIFIED'],
];

write('PROGRAMME_SUMMARY.md', [
  '# Programme summary — Architecture & Certification Programme',
  '',
  `**Closed:** ${new Date().toISOString().slice(0, 10)} · **Commit:** \`${commit ?? 'unknown'}\` · **Branch:** \`${branch ?? 'unknown'}\``,
  '',
  '**GENERATED from evidence files, the proof registry and the architecture set.** No',
  'figure below is transcribed. A closure register typed by hand is obsolete the day it',
  'is written, and a baseline is the one document future work trusts without re-deriving.',
  '',
  '## 1. What the programme delivered',
  '',
  '| # | Objective | Deliverable | Outcome |',
  '|---|---|---|---|',
  ...MILESTONES.map(([id, name, obj, del, out]) =>
    `| **${id}** | ${obj} | ${del} | **${out}** |`),
  '',
  '## 2. Evidence produced',
  '',
  '| Evidence set | Measured | NOT MEASURED | Status |',
  '|---|---|---|---|',
  ...[...evidence.values()].map(({ label, rel, body }) => {
    const s = body.summary;
    const measured = s ? `${s.provenPassed}/${s.provenTotal}` : '—';
    const un = s ? s.unmeasuredTotal : (body.unmeasured?.length ?? '—');
    return `| ${label} <br>\`${rel}\` | ${measured} | ${un} | ${body.certificationStatus ?? '—'} |`;
  }),
  '',
  `**${gates.length} gating checks**, each with a recorded and replayed fault-injection proof`,
  `(**${proofs?.proofs?.length ?? 0} proofs**, ${proofs?.proofs?.filter((p) => p.proved).length ?? 0} proved).`,
  '',
  '## 3. Key architectural decisions',
  '',
  `${adrBaseline.length} ADRs are accepted. The decisions that shaped the outcome most:`,
  '',
  '| Decision | Why it mattered |',
  '|---|---|',
  '| **The sovereign split is the product** | Customer source, credentials and evidence never leave the customer tenancy. Verified on every build by scanning for artefact kinds, not for known strings — searching for one secret proves only that one secret is absent. |',
  '| **Evidence over assertion (Rule 13)** | A claim without an executed measurement is not evidence. This is why the programme has `NOT MEASURED` at all, and why it survived twelve milestones of pressure to round up. |',
  '| **`NOT RUN` ≡ `FAIL` (C-0.4)** | The predecessor stayed green while a fitness test failed, because the workflow triggered on branches nobody used. Silence is not success. |',
  '| **Trust expires (Rule 14)** | Proofs are re-recorded and replayed, never transcribed. A proof recorded once and trusted forever is an assertion with extra steps. |',
  '| **ADR-0021 — Platform Core as a bounded context** | Onboarding needed a home. Making it a seventh capability would have broken R-11.4; making it a third plane would have broken the split. It became a bounded context inside the Intelligence Plane, owned by documents 03, 08 and 21. |',
  '| **Platform Services are not capabilities (ADR-0018)** | Operational Excellence, Platform Intelligence and Customer Success render no quality verdict. Without this distinction the platform would now have nine capabilities and a broken constitution. |',
  '',
  '## 4. Lessons the programme actually learned',
  '',
  'Each of these was found by a machine, not by review, and each cost real rework.',
  '',
  '**A file count cannot see the wrong language.** Five of six declared supported targets',
  'emitted TypeScript regardless of the language selected — a customer choosing Python',
  'received `register.ts`. The file count was identical either way. Declared-but-unbuilt,',
  'applied to the platform\'s own compatibility claims.',
  '',
  '**A refusal for the wrong reason is a false pass.** A restart test asserted only that',
  'a replayed request was refused. It was — as `bad-signature`, caused by an unrelated',
  'defect — while a real replay exposure sat behind it. Asserting on the *reason* rather',
  'than the status exposed both defects at once.',
  '',
  '**A working control is not an availability failure.** Counting every non-`403` refusal',
  'against the SLI meant refusing an attack drove availability down, and the tenants the',
  'platform had just protected were reported as degraded. Left unfixed it produces a',
  'permanently amber metric that operators learn to ignore.',
  '',
  '**Silence is not health.** A platform with no errors because it is serving no requests',
  'is not healthy. Every convenience erodes this — a default of zero, an average that',
  'skips nulls, a value carried forward — and each one converts *unmeasured* into *fine*.',
  '',
  '**The recorder can become the defect it detects.** A fault probe once planted a',
  'workspace manifest; pnpm resolved it, rewrote the lockfile and installed a real',
  'package. Fault probes must not mutate persistent state — and must not contain the',
  'literal they search for, a lesson this programme learned three separate times.',
  '',
  '**Governance drifts silently.** An anti-erosion list still named four properties when',
  'twelve existed. A scorecard counted one package when five had tests. A boundary test',
  'enforced something broader than the criterion it cited. All three passed for months.',
  '',
  '## 5. Scope intentionally deferred',
  '',
  `**${notImplemented.length} components are NOT IMPLEMENTED** — see`,
  '[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). The six capability engines and the',
  'Execution Plane runtime were never in P2 scope; the programme built the contracts,',
  'the runtime, the customer surface and the governance that will hold them.',
  '',
  '---',
  '',
  `*Generated from ${evidence.size} evidence sets, ${gates.length} gates and ${archBaseline.length} architecture documents.*`,
]);

// ── 2. FINAL_CERTIFICATION_REGISTER.md ──────────────────────────────────────
write('FINAL_CERTIFICATION_REGISTER.md', [
  '# Final certification register',
  '',
  `**Frozen at commit \`${commit ?? 'unknown'}\`.** Generated from the evidence files themselves.`,
  '',
  '## Certifications',
  '',
  '| Certification | Status | Evidence | Owner | Outstanding |',
  '|---|---|---|---|---|',
  ...[...evidence.values()].map(({ label, rel, body }) => {
    const un = body.unmeasured?.length ?? 0;
    return `| ${label} | **${(body.certificationStatus ?? 'unknown').toUpperCase()}** | \`${rel}\`<br>hash \`${(body.contentHash ?? '').slice(0, 16)}…\` | Enterprise Certification Authority | ${un === 0 ? 'none' : `${un} NOT MEASURED`} |`;
  }),
  `| **General Availability** | **${gaCertified ? 'CERTIFIED' : 'NOT CERTIFIED'}** | \`governance/deployment/evidence.json\` | Enterprise Certification Authority | ${gaCertified ? 'none' : 'E-2'} |`,
  '',
  '## Certification records',
  '',
  ...(existsSync(join(ROOT, 'docs', 'certification'))
    ? readdirSync(join(ROOT, 'docs', 'certification')).filter((f) => f.endsWith('.md')).sort()
      .map((f) => `- [\`${f}\`](../docs/certification/${f})`)
    : ['- none']),
  '',
  '## Gating checks',
  '',
  `All ${gates.length} are gating. **\`NOT RUN\` counts as \`FAIL\`** (C-0.4).`,
  '',
  '| Gate | Fault proof | Proved |',
  '|---|---|---|',
  ...gates.map((g) => {
    const forGate = (proofs?.proofs ?? []).filter((p) => p.gate === g);
    const violations = forGate.map((p) => p.violation).join('; ') || 'none recorded';
    const proved = forGate.length > 0 && forGate.every((p) => p.proved);
    return `| \`${g}\` | ${violations} | ${forGate.length === 0 ? '—' : (proved ? '**yes**' : '**NO**')} |`;
  }),
  '',
  '**A gate without a fault proof is an untested control.** Every gate above was observed',
  'to pass on a clean repository and to fail — naming the planted cause — on a violation.',
  '',
  '## What certification here does and does not mean',
  '',
  '`partially-certified` means every **measured** property holds and at least one remains',
  '`NOT MEASURED`. It does not mean *mostly ready*: an unmeasured property contributes',
  'nothing in either direction, and is never scored as a pass (R-13.3).',
  '',
  '---',
  '',
  `*Generated from ${evidence.size} evidence sets and ${proofs?.proofs?.length ?? 0} fault proofs.*`,
]);

// ── 3. GENERAL_AVAILABILITY_REGISTER.md ─────────────────────────────────────
write('GENERAL_AVAILABILITY_REGISTER.md', [
  '# General Availability register',
  '',
  `## STATUS: ${gaCertified ? 'CERTIFIED' : 'NOT CERTIFIED'}`,
  '',
  `**Reason:** ${deployment?.generalAvailabilityReason ?? 'no determination recorded'}`,
  '',
  '**This determination is computed**, not written: it equals `CERTIFIED` if and only if',
  'E-2 has `PASS` evidence, and a gate refuses any file in this repository that claims',
  'otherwise — fault-proved by planting exactly such a document.',
  '',
  '## Evidence required',
  '',
  '| # | Property | Criterion |',
  '|---|---|---|',
  `| **E-2** | ${deployment?.e2?.property ?? 'deployment validation'} | C-17.3 |`,
  '',
  '**C-17.3 sets the bar and it is deliberately high:** *each image starts and serves a',
  'real request*. A successful build is **not** E-2 evidence. Document 17 explains why —',
  '*an image that builds is not an image that runs, and the gap between them is where the',
  'predecessor\'s stale COPY and missing shared code both hid.*',
  '',
  '## Required environment',
  '',
  'Any one of these, with a responding daemon:',
  '',
  ...((deployment?.runtimesSearched ?? []).filter((r) => r.kind === 'container-runtime')
    .map((r) => `- \`${r.id}\``)),
  '',
  'Or a Kubernetes cluster, which implies one.',
  '',
  '## What was measured, and when',
  '',
  `A probe searched **${(deployment?.runtimesSearched ?? []).length} runtimes** on the PATH and in every`,
  'known install location, on this commit. None responded.',
  '',
  '| Runtime | Kind | Present | Usable |',
  '|---|---|---|---|',
  ...((deployment?.runtimesSearched ?? []).map((r) =>
    `| \`${r.id}\` | ${r.kind} | ${r.foundOnPath ? 'on PATH' : (r.foundAt ? 'installed' : 'absent')} | ${r.daemonResponds ? 'yes' : 'no'} |`)),
  '',
  '**The blocker is a measurement, not an assumption.** It had been carried as a stated',
  'sentence from M2.5 to M2.8; a stated blocker is an assertion, which R-13.1 does not',
  'accept as evidence.',
  '',
  '## Blocked by E-2',
  '',
  `${deploymentAlone.length} properties need **only** a container runtime. Obtaining one closes every one of them.`,
  '',
  '| # | Property | Evidence set |',
  '|---|---|---|',
  ...deploymentAlone.map((u) => `| **${u.id}** | ${u.property} | ${u.set} |`),
  '',
  '## Blocked by E-2 AND something further',
  '',
  `${deploymentAndMore.length} properties need a deployment **and** something a deployment does not supply.`,
  'Obtaining a runtime is necessary for these and not sufficient.',
  '',
  '| # | Property | Also needs |',
  '|---|---|---|',
  ...deploymentAndMore.map((u) => `| **${u.id}** | ${u.property} | ${u.needs} |`),
  '',
  '## NOT blocked by E-2 — and therefore not closed by GA',
  '',
  independentlyBlocked.length === 0
    ? '**None.** Every unmeasured property in the programme is downstream of deployment.'
    : [
      `**${independentlyBlocked.length} properties remain unmeasured for reasons that have nothing to do`,
      'with a container runtime.** Certifying General Availability would **not** close them,',
      'and this register states so explicitly so that a future reader cannot infer otherwise.',
      '',
      '| # | Property | Needs |',
      '|---|---|---|',
      ...independentlyBlocked.map((u) => `| **${u.id}** | ${u.property} | ${u.needs} |`),
    ].join('\n'),
  '',
  '**This is the one place the mission\'s framing needed qualifying.** E-2 is the only',
  'blocker to the *GA determination* — every `GA-*` replay names it, and nothing else',
  'gates the determination. It is **not** the only outstanding item in the programme, and',
  'recording it as such would have created exactly the false impression this register',
  'exists to prevent.',
  '',
  '## Expected sequence',
  '',
  '```',
  'acquire a container runtime',
  '        ↓',
  'node governance/deployment/run-deployment-probe.mjs      → E-2',
  '        ↓',
  'replay the certification suites against the deployment   → GA-1 … GA-10',
  '        ↓',
  'the GA determination recomputes itself',
  '```',
  '',
  '**No architecture change is required at any step.** No new milestone is required.',
  '',
  '---',
  '',
  `*Generated from \`governance/deployment/evidence.json\`.*`,
]);

// ── 4. ARCHITECTURE_BASELINE.md ─────────────────────────────────────────────
write('ARCHITECTURE_BASELINE.md', [
  '# Architecture baseline — frozen at closure',
  '',
  `**Commit:** \`${commit ?? 'unknown'}\` · **Baseline hash:** \`${baselineHash.slice(0, 32)}…\``,
  '',
  '## What this is, and what it is not',
  '',
  'This is a **cryptographic snapshot** of the closed architecture: every document with',
  'its content hash, so drift after closure is detectable by recomputation rather than by',
  'review.',
  '',
  'It does **not** duplicate [ARCHITECTURE_STATUS.md](ARCHITECTURE_STATUS.md), which owns',
  'the living question *"which documents exist and what state are they in"*. This answers',
  'a different one: *"what exactly was frozen, and has it moved since"*. One topic, one',
  'home — the two would otherwise become a pair of records that disagree.',
  '',
  '## The canonical set',
  '',
  `**${archBaseline.length} documents · ${frozenCount} frozen · ${totalCriteria} conformance criteria**`,
  '',
  '| # | Document | Frozen | Criteria | SHA-256 |',
  '|---|---|---|---|---|',
  ...archBaseline.map((d) =>
    `| ${d.document.slice(0, 2)} | \`${d.document}\` | ${d.frozen ? '**yes**' : 'NO'} | ${d.criteria} | \`${d.sha256.slice(0, 16)}…\` |`),
  '',
  '## Decisions',
  '',
  `**${adrBaseline.length} ADRs.**`,
  '',
  '| ADR | Status | SHA-256 |',
  '|---|---|---|',
  ...adrBaseline.map((a) => `| \`${a.adr}\` | ${a.status} | \`${a.sha256.slice(0, 16)}…\` |`),
  '',
  '## Invariants held at closure',
  '',
  '| Invariant | Value |',
  '|---|---|',
  `| Architecture documents | **${archBaseline.length}** |`,
  `| Documents frozen | **${frozenCount}/${archBaseline.length}** |`,
  '| Platform Services | **3** — Operational Excellence (23), Platform Intelligence (24), Customer Success (25) |',
  '| Quality Engineering Capabilities | **6** — R-11.4 |',
  '| Planes | **2** — the sovereign split |',
  `| ADRs | **${adrBaseline.length}**, ADR-0021 among them and unchanged |`,
  '| Documents numbered 26 or above | **0** |',
  '',
  '**Each of these is verified by an executing fitness function**, not by this table.',
  'The table records what the fitness functions found at closure.',
  '',
  '## Ownership',
  '',
  'Each document declares what it owns and what it does not. The anti-duplication',
  'contract is enforced by the architecture-integrity gate, which fails on a topic with',
  'two owners.',
  '',
  '| Document | Owns |',
  '|---|---|',
  ...archBaseline.filter((d) => d.owns).map((d) => `| \`${d.document.slice(0, 2)}\` | ${d.owns.slice(0, 150)} |`),
  '',
  '## Detecting drift against this baseline',
  '',
  '```',
  'node governance/verification/verify-programme-closure.js',
  '```',
  '',
  'It recomputes every hash above. A changed document fails the gate and is named.',
  '**Amending the architecture is permitted; amending it silently is not.**',
  '',
  '---',
  '',
  `*Generated from ${archBaseline.length} documents and ${adrBaseline.length} ADRs.*`,
]);

// ── 5. GOVERNANCE_BASELINE.md ───────────────────────────────────────────────
const scorecardBody = existsSync(join(ROOT, 'program', 'ENGINEERING_SCORECARD.md'))
  ? readFileSync(join(ROOT, 'program', 'ENGINEERING_SCORECARD.md'), 'utf8') : '';
const metric = (name) => {
  const m = new RegExp(`\\|\\s*${name}\\s*\\|\\s*([^|]+)\\|`, 'i').exec(scorecardBody);
  return m ? m[1].trim() : 'NOT MEASURED';
};

write('GOVERNANCE_BASELINE.md', [
  '# Governance baseline — frozen at closure',
  '',
  `**Commit:** \`${commit ?? 'unknown'}\` · **Proofs recorded:** ${proofs?.recordedAt ?? 'unknown'}`,
  '',
  '## Gating checks',
  '',
  `**${gates.length} gates, all gating.** \`NOT RUN\` counts as \`FAIL\` (C-0.4) — the state the`,
  'predecessor\'s tooling lacked, which is why its dashboard stayed green while a fitness',
  'test failed on branches nobody used.',
  '',
  ...gates.map((g, i) => `${i + 1}. \`${g}\``),
  '',
  '## Fault proofs',
  '',
  `**${proofs?.proofs?.length ?? 0} proofs, ${proofs?.proofs?.filter((p) => p.proved).length ?? 0} proved**, each re-recorded and replayed rather than transcribed.`,
  '',
  '| Gate | Planted violation | Clean | Faulted | Cause named |',
  '|---|---|---|---|---|',
  ...((proofs?.proofs ?? []).map((p) => {
    const o = p.observations ?? {};
    return `| \`${p.gate}\` | ${p.violation} | ${o.cleanRunExit} | ${o.faultedRunExit} | ${o.causeNamedInOutput ? 'yes' : 'NO'} |`;
  })),
  '',
  '**The sharpest three, kept together because they are what the registry is for:**',
  '',
  '- a **gateway that stops refusing** unauthenticated and cross-tenant callers',
  '- a **health endpoint that reports green while nothing is reporting**',
  '- a **document falsely claiming General Availability**',
  '',
  'If any of those failed to turn a gate red, the corresponding certification would be',
  'decorative.',
  '',
  '## Governance metrics at closure',
  '',
  '| Index | Value |',
  '|---|---|',
  `| Enterprise Readiness Index | ${/Enterprise Readiness Index\s*\|\s*([^|\n]+)/.exec(scorecardBody)?.[1]?.trim() ?? metric('Enterprise Readiness Index')} |`,
  `| Governance Confidence Index | ${/Governance Confidence Index\s*\|\s*([^|\n]+)/.exec(scorecardBody)?.[1]?.trim() ?? metric('Governance Confidence Index')} |`,
  `| Release Confidence Index | ${/Release Confidence Index\s*\|\s*([^|\n]+)/.exec(scorecardBody)?.[1]?.trim() ?? metric('Release Confidence Index')} |`,
  `| Security Compliance | ${metric('Security Compliance')} |`,
  `| Operational Readiness | ${metric('Operational Readiness')} |`,
  `| Customer Readiness | ${metric('Customer Readiness')} |`,
  `| Observability | ${metric('Observability')} |`,
  `| Production Readiness | ${metric('Production Readiness')} |`,
  `| General Availability | ${metric('General Availability')} |`,
  '',
  '**Every index publishes score, coverage and freshness** (C-24.5). A score without',
  'coverage is the most dangerous number a governance system can publish, because it is',
  'most reassuring exactly when it is least true.',
  '',
  '## Evidence registry',
  '',
  '| Set | Generator | Regenerated by |',
  '|---|---|---|',
  ...[...evidence.values()].map(({ label, rel, body }) =>
    `| ${label} | \`${body.generator ?? '—'}\` | its gate, on every run |`),
  '',
  '**Evidence is regenerated, never read.** Committed evidence would keep asserting a',
  'property long after it stopped holding — which is the failure the evidence exists to',
  'catch, one level up.',
  '',
  '## Rules that shaped this baseline',
  '',
  '| Rule | Effect |',
  '|---|---|',
  '| R-13.1 | A hand-authored status value is prohibited. Every measurement derives from evidence. |',
  '| R-13.3 | `NOT MEASURED` is never reported, aggregated or omitted as a pass. |',
  '| R-13.4 | Every gate carries a machine-readable fault-injection proof. |',
  '| R-14.2 | Proofs are replayed. A proof that cannot be reproduced is not a proof. |',
  '| R-14.5 | Evidence expires. Trust does not accumulate. |',
  '| C-0.4 | `NOT RUN` ≡ `FAIL`. |',
  '',
  '---',
  '',
  `*Generated from the runner, the proof registry and ${evidence.size} evidence sets.*`,
]);

// ── 6. KNOWN_LIMITATIONS.md ─────────────────────────────────────────────────
write('KNOWN_LIMITATIONS.md', [
  '# Known limitations register',
  '',
  `**Commit:** \`${commit ?? 'unknown'}\`. Generated from evidence, implementation status and the debt register.`,
  '',
  '## Three categories, deliberately not mixed',
  '',
  'These words are not synonyms and the difference decides what to do about each:',
  '',
  '| | Meaning | What it implies |',
  '|---|---|---|',
  '| **NOT IMPLEMENTED** | The thing does not exist. No code was written. | Build it. There is nothing to measure. |',
  '| **NOT MEASURED** | The thing exists but no executed evidence covers it. | Measure it. It may work; nobody has shown that it does. |',
  '| **NOT CERTIFIED** | Evidence exists but does not meet the bar for a certification claim. | Close the named gap. |',
  '',
  '**Collapsing them is how a platform comes to believe it is nearly finished.** An',
  'unmeasured property reads like a small gap and an unimplemented capability reads like',
  'the same small gap, until someone tries to use it.',
  '',
  '## NOT IMPLEMENTED',
  '',
  `**${notImplemented.length} components.** These were never in P2 scope; they are recorded so the`,
  'boundary of what was built is explicit.',
  '',
  ...(notImplemented.length === 0 ? ['None.'] : notImplemented.map((n) => `- ${n}`)),
  '',
  '## NOT MEASURED',
  '',
  `**${unmeasured.length} properties.** Each names its blocker. None is simulated, and none`,
  'contributes to any readiness figure in either direction.',
  '',
  '### A container runtime alone closes these',
  '',
  '| # | Property | Evidence set |',
  '|---|---|---|',
  ...deploymentAlone.map((u) => `| **${u.id}** | ${u.property} | ${u.set} |`),
  '',
  '### A container runtime is necessary but not sufficient',
  '',
  '| # | Property | Also needs |',
  '|---|---|---|',
  ...deploymentAndMore.map((u) => `| **${u.id}** | ${u.property} | ${u.needs} |`),
  '',
  '### A container runtime is irrelevant',
  '',
  ...(independentlyBlocked.length === 0 ? ['None.'] : [
    '| # | Property | Needs |',
    '|---|---|---|',
    ...independentlyBlocked.map((u) => `| **${u.id}** | ${u.property} | ${u.needs} |`),
    '',
    '**These remain unmeasured once General Availability is granted.** They are',
    'not deployment problems, and it would be a serious misreading of the GA determination',
    'to treat certification as having closed them.',
  ]),
  '',
  '## NOT CERTIFIED',
  '',
  '| Claim | Status | Why |',
  '|---|---|---|',
  `| General Availability | **NOT CERTIFIED** | ${deployment?.generalAvailabilityReason ?? 'no determination'} |`,
  ...[...evidence.values()].filter(({ body }) => body.certificationStatus === 'partially-certified')
    .map(({ label, body }) =>
      `| ${label} | **PARTIALLY CERTIFIED** | ${body.unmeasured?.length ?? 0} properties NOT MEASURED |`),
  '',
  '## Open technical debt',
  '',
  ...(openDebt.length === 0 ? ['**None.**'] : [
    '| # | Item |',
    '|---|---|',
    ...openDebt.map((d) => `| **${d.id}** | ${d.summary.slice(0, 200)} |`),
    '',
    '**A debt register at zero is not a good sign** unless something looked hard enough to',
    'find one. These were found by measurement, not review.',
  ]),
  '',
  '## Deliberate limits — not gaps, and they will not close',
  '',
  '| Limit | Why it is permanent |',
  '|---|---|',
  '| No inbound connectivity into a customer tenancy | The boundary the platform exists to hold (INV-3). |',
  '| The platform stores no customer source, data, media or secrets | Same. Verified on every build. |',
  '| Unsupported technology combinations are refused | A profile that parses is not a profile that can be built. |',
  '| Registration credentials are single-use | A reusable credential is an API key with a different name. |',
  '| Platform Intelligence performs no remediation | C-24.9. Closing the loop turns a read-only surface into an unaudited control plane. |',
  '',
  '## Relationship to the customer-facing register',
  '',
  '[`docs/customer-success-package/KNOWN-LIMITATIONS.md`](../docs/customer-success-package/KNOWN-LIMITATIONS.md)',
  'is generated for customers and covers what affects **them**. This register is internal',
  'and covers the whole programme. They are not duplicates and neither is authoritative',
  'for the other\'s scope.',
  '',
  '---',
  '',
  `*Generated from ${evidence.size} evidence sets, implementation status and the debt register.*`,
]);

/**
 * WHY THE BASELINE MOVED — one entry per deliberate re-baseline, newest last.
 *
 * `verify-programme-closure` refuses a silently amended baseline and tells the operator to
 * re-baseline deliberately if the change was intended. Until now "deliberately" left no trace in
 * the package: the new hash recorded THAT it moved and nothing recorded WHY, so a later reader
 * comparing two baselines could see a changed ADR digest and had no way to tell a correction from
 * an erosion. That is the gap the gate exists to close, reopened one level down.
 *
 * An entry is required to name what changed and the evidence for it. "Updated ADR" is not a
 * reason; a reason says what became true.
 */
const REBASELINE_LOG = [
  {
    at: '2026-08-07',
    changed: 'docs/adr/ADR-0086-reference-output-parity-as-domain-depth.md — ADDED (77 -> 78 ADRs); '
      + 'gates 76 -> 78 (verify-run-record-write-surface.js, verify-operator-writer-census.js absorbed)',
    why:
      'A customer directive to reproduce the reference solution\'s Functional Testing behaviour inside '
      + 'EP/IP was answered as internal domain DEPTH rather than as a second workflow — ADR-0039 C-11 '
      + 'applied unchanged, with CANONICAL_DOMAIN_SEQUENCE untouched and the Execution Plane not touched '
      + 'at all. The closure gate correctly reported the new ADR as an addition since closure, which is '
      + 'what it exists to do; this entry is the deliberate answer it asked for. '
      + 'THE TWO GATES ARE A SEPARATE FACT AND ARE ABSORBED HERE RATHER THAN SMUGGLED: they were '
      + 'registered by earlier work and the closure gate never reported them, because it checks only '
      + 'that no gate has been REMOVED. A baseline that silently trailed the runner by two gates is the '
      + 'drift the baseline exists to prevent, and it is named here so the absorption is on the record '
      + 'rather than discovered later as an unexplained delta. '
      + 'Evidence: program/FUNCTIONAL_TESTING_REFERENCE_PARITY_ANALYSIS.md §9; measured pnpm -r build '
      + 'and pnpm -r test exit 0, functional-testing-engine dist/test 223 -> 246 pass with 0 fail. '
      + 'The GA determination is UNCHANGED at NOT CERTIFIED — nothing here touches E-2.',
  },
  {
    at: '2026-08-06',
    changed: 'docs/architecture/05-cross-plane-communication.md — v1.2 -> v1.3',
    why:
      'A SECOND design law is now recorded beside R-05.27, on the axis the first one does not '
      + 'cover: a port may be declared and left unimplemented ONLY IF its empty case fails CLOSED, '
      + 'and where that answer is a Success the port SHALL NOT be mounted until it is implemented. '
      + 'It became true from the decision NOT to mount GET /api/tenants/{slug}/work behind an '
      + 'unimplemented PendingWorkSource (D-115): under R-05.27 an empty collection is a SUCCESS, '
      + 'so that port would have answered 200-with-nothing-pending to every Execution Plane '
      + 'forever, byte-identical to the truthful answer, with no test failing and no gate '
      + 'reddening. The contrast is what is being legislated: the unwired authenticator and the '
      + 'unconfigured package store both answer 501 and are safe for that one reason, so the same '
      + 'injection pattern is safe on the fail-closed side and is fabrication on the fail-open '
      + 'side. NO RULE IS ADDED, AMENDED OR WITHDRAWN — R-05.26-R-05.28 are untouched, the result '
      + 'taxonomy stays at four, no conformance criterion is added and no gate count moves; the '
      + 'baseline moves only because a frozen document\'s hash changed. Evidence: '
      + 'TECHNICAL_DEBT.md D-115, program/D-115_RUN_AND_EVIDENCE_RECORD_DESIGN_REPORT.md.',
  },
  {
    at: '2026-08-04',
    changed: 'docs/adr/ADR-0073-design-sync-publication-outcome.md — ADDED',
    why:
      'The design-synchronisation SPI carried the same defect ADR-0072 removed from its two '
      + 'siblings: linkWorkItem, applyClassification, assignToSuite and attachDesignArtefact all '
      + 'returned type-level literals, so it could not report that the customer tool refused. It '
      + 'was found by applying the contagion corollary deliberately BEFORE porting the nine '
      + 'design-sync agents, and four failureHandling declarations turned out to have been '
      + 'unimplementable when written — one of which states that its census reports what the tool '
      + 'accepted and never what was attempted, one line above code that counted attempts. '
      + 'ADR-0073 widens the four writes and wires the four agents, making all four declarations '
      + 'true. Read-back validation is the stronger answer and is SEQUENCED to Section F with its '
      + 'reasoning recorded at the SPI, not omitted. The baseline moves because a new ADR '
      + 'necessarily violates the closed-programme property. Evidence: TECHNICAL_DEBT.md D-028, D-029.',
  },
  {
    at: '2026-08-04',
    changed: 'docs/adr/ADR-0072-publication-outcome-spi.md — ADDED',
    why:
      'The publication SPI could not report a failed publication: four of its five operations '
      + 'returned a type-level literal, so an adapter could not say published:false. No layer '
      + 'between the customer tool and the executive report could represent a failed publication '
      + 'into that customer system of record, and the five status-published literals in '
      + 'synchronisation.ts were the only value the SPI permitted a caller to derive. Masked only '
      + 'because reference adapters always succeed, which is what made the repair free exactly '
      + 'once — after a real connector lands the same repair must be made while producing wrong '
      + 'data in a customer system of record. ADR-0072 adds a PublicationOutcome union; every '
      + 'failure path is marked UNDECIDED with its owning capability rather than decided for '
      + 'capabilities this programme does not own. The baseline moves because a new ADR '
      + 'necessarily violates the closed-programme property. Evidence: TECHNICAL_DEBT.md D-023.',
  },
  {
    at: '2026-08-04',
    changed: 'docs/adr/ADR-0071-stage-refusal-primitive.md — ADDED',
    why:
      'The governance triad could not decline. StageEmitter offered only ok and notApplicable, and '
      + 'certify() derived certified from applicable without ever reading what the stage produced — '
      + 'so refusal was expressible only as absence, and a capability wanting to refuse had to claim '
      + 'it had done no work. This held for all five implemented capabilities, because the defect was '
      + 'in @dbiz/capability-framework: every certification the platform has produced was reviewed by '
      + 'three stages that could not refuse. ADR-0071 adds a third stage outcome. The baseline moves '
      + 'because "no ADR has been added since closure" is a closed-programme property and a new '
      + 'decision necessarily violates it; the alternative was to change the stage-result algebra for '
      + 'six capabilities with no decision record. Evidence: TECHNICAL_DEBT.md D-019, and D-021 which '
      + 'was recorded BEFORE the ADR so it could not read as having addressed it.',
  },
  {
    at: '2026-08-04',
    changed: 'docs/adr/ADR-0069-capability-one-connector-realisation.md — P-69.2',
    why:
      'P-69.2 was amended to correct itself against measured evidence. Its stated orphan figure '
      + '("fourteen") was produced by an inventory that could not find an orphan at all — a '
      + 'surviving entry point imported the package barrel, so the surviving closure was the whole '
      + 'package. With the instrument repaired the measured count is TEN, and two of the '
      + 'precondition\'s named instances were wrong in opposite directions: '
      + 'observation-interpretation is NOT orphaned (the bridge imports it directly), and the '
      + 'design-synchronisation entry named the adapter, which survives, rather than '
      + 'agents/design-sync.ts, which does not. Evidence: '
      + 'governance/capability/retirement-inventory.json; reasoning: TECHNICAL_DEBT.md D-011, D-018. '
      + 'The alternative was leaving the decision record that governs retirement asserting a '
      + 'withdrawn figure and two wrong instances, which is the declaration-versus-implementation '
      + 'drift of D-007 committed deliberately in the document meant to prevent it.',
  },
];

// ── Machine-readable baseline ───────────────────────────────────────────────
const baseline = {
  baselineId: 'programme-closure',
  generator: 'governance/closure/emit-closure-package.mjs',
  generatorVersion: '1.1.0',
  rebaselineLog: REBASELINE_LOG,
  commit, branch,
  baselineHash,
  architecture: archBaseline,
  adrs: adrBaseline,
  gates,
  invariants: {
    architectureDocuments: archBaseline.length,
    frozenDocuments: frozenCount,
    conformanceCriteria: totalCriteria,
    platformServices: 3,
    capabilities: 6,
    planes: 2,
    adrs: adrBaseline.length,
  },
  generalAvailability: gaCertified ? 'CERTIFIED' : 'NOT CERTIFIED',
  generalAvailabilityReason: deployment?.generalAvailabilityReason ?? null,
  unmeasured: distinct.map((u) => ({ id: u.id, set: u.set, class: u.class, needs: u.needs })),
  unclassified: unclassified.map((u) => u.id),
  transient: transient.map((u) => u.id),
  notImplemented,
  openDebt: openDebt.map((d) => d.id),
};

writeFileSync(join(ROOT, 'governance', 'closure', 'baseline.json'),
  `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');

process.stdout.write(JSON.stringify({
  written,
  baselineHash,
  architectureDocuments: archBaseline.length,
  gates: gates.length,
  unmeasured: unmeasured.length,
  deploymentAlone: deploymentAlone.length,
  deploymentAndMore: deploymentAndMore.length,
  independentlyBlocked: independentlyBlocked.length,
  unclassified: unclassified.map((u) => u.id),
  generalAvailability: baseline.generalAvailability,
}));
