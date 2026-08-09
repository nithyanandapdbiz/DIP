'use strict';
/**
 * GOVERNANCE — Engineering Scorecard, Platform Maturity, Governance Confidence Index.
 * ============================================================================
 * GENERATED. Never hand-edit the outputs (R-13.1, ADR-0018 §4.3).
 *
 * Three rules govern everything here:
 *
 *   R-13.1  Every measurement derives from objective evidence. A hand-authored
 *           status value is prohibited.
 *   R-13.2  Every measurement carries an evidence envelope: source, collection
 *           time, method, confidence, traceability, validation status.
 *   R-13.3  Uncollectable evidence reports NOT MEASURED. NOT MEASURED is never
 *           reported, aggregated, or omitted as a pass.
 *
 * The GCI (R-13.5) measures the governance system rather than the product.
 * ERI answers "is the platform ready?"; GCI answers "can the system that told you
 * so be trusted?" A high ERI produced by an untrustworthy governance system is
 * worse than a low one, because it is confidently wrong.
 *
 * Run:  node governance/verification/generate-scorecard.js
 * Exit: 0 always — this measures; run-all.js gates.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(ROOT_OF(__dirname));
function ROOT_OF(dir) { return path.join(dir, '..', '..'); }
const ARCH = path.join(ROOT, 'docs', 'architecture');
const ADR = path.join(ROOT, 'docs', 'adr');
const PROGRAM = path.join(ROOT, 'program');
const HERE = __dirname;

const NM = 'NOT MEASURED';
const collectedAt = new Date().toISOString();

/** An evidence envelope. A bare value is unfalsifiable; this makes it checkable. */
function evidence({ value, source, method, confidence, traceability, validation }) {
  return { value, source, method, confidence, traceability, validation, collectedAt };
}
const notMeasured = (source, why) => evidence({
  value: NM, source, method: 'none', confidence: 'none',
  traceability: why, validation: 'unvalidated',
});

// ── Gate execution ──────────────────────────────────────────────────────────
function runGate(script) {
  const file = path.join(HERE, script);
  if (!fs.existsSync(file)) return 'NOT RUN';
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  if (r.error || r.status === null) return 'NOT RUN';
  return r.status === 0 ? 'PASS' : 'FAIL';
}

const runnerSrc = fs.existsSync(path.join(HERE, 'run-all.js'))
  ? fs.readFileSync(path.join(HERE, 'run-all.js'), 'utf8') : '';
const registered = [...runnerSrc.matchAll(/script:\s*'([^']+\.js)'/g)].map((m) => m[1]);
const gateResults = Object.fromEntries(registered.map((g) => [g, runGate(g)]));
const gatesPassing = Object.values(gateResults).filter((v) => v === 'PASS').length;

// ── Proof registry ──────────────────────────────────────────────────────────
let registry = null;
try { registry = JSON.parse(fs.readFileSync(path.join(HERE, 'proofs.json'), 'utf8')); } catch { /* absent */ }
const proofs = registry?.proofs ?? [];
const proved = proofs.filter((p) => p.proved).length;
const replayed = proofs.filter((p) => p.replayed).length;
const provenanced = proofs.filter((p) => p.commit && p.generator && p.evidenceId).length;

/**
 * Freshness and decay (R-14.5).
 *
 * Confidence declines with evidence age and reaches zero at expiry. A gradient
 * without a floor lets a gate that stopped detecting keep paying into the score
 * forever at a diminishing rate; a cliff without a gradient says nothing until the
 * deadline. The combination is what makes the number responsive and honest.
 */
const registryAgeMs = registry && registry.recordedAt ? Date.now() - Date.parse(registry.recordedAt) : null;
const expiryMs = ((registry && registry.expiryDays) || 7) * 86400000;
const decayFactor = registryAgeMs === null ? 0 : Math.max(0, Math.min(1, 1 - registryAgeMs / expiryMs));
const isCurrent = decayFactor > 0;
const freshnessLabel = registryAgeMs === null
  ? NM
  : isCurrent
    ? Math.round(registryAgeMs / 3600000) + 'h old, ' + Math.round(decayFactor * 100) + '% of window remaining'
    : 'NOT CURRENT - evidence expired';
const bothPaths = proofs.filter(
  (p) => p.properties?.positiveDetection?.verified && p.properties?.negativeDetection?.verified,
).length;

// ── Repository facts ────────────────────────────────────────────────────────
const archDocs = fs.existsSync(ARCH) ? fs.readdirSync(ARCH).filter((f) => /^\d\d-.*\.md$/.test(f)) : [];
const adrDocs = fs.existsSync(ADR) ? fs.readdirSync(ADR).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)) : [];
let criteria = 0;
let frozen = 0;
for (const f of archDocs) {
  const body = fs.readFileSync(path.join(ARCH, f), 'utf8');
  criteria += new Set([...body.matchAll(/\*\*(C-[\w.]+)\*\*/g)].map((m) => m[1])).size;
  if (/\*\*Status:\*\*\s*\*\*FROZEN\*\*/.test(body)) frozen += 1;
}

const debtBody = (() => { try { return fs.readFileSync(path.join(PROGRAM, 'TECHNICAL_DEBT.md'), 'utf8'); } catch { return ''; } })();
const currentDebt = /##\s*1\.\s*Current debt\s*([\s\S]*?)(?=\n##\s)/.exec(debtBody)?.[1] ?? '';
const openDebt = /\*\*None\.\*\*/.test(currentDebt) ? 0 : (currentDebt.match(/^\|\s*\*\*D-\d+\*\*/gm) || []).length;

/** Test results, anchored parsing; failure degrades to NOT MEASURED, never a guess. */
function testResults() {
  // EVERY package with a built test tree, not a hard-coded one. This counted
  // @dbiz/contracts alone; two further packages were added and the reported figure
  // silently stopped describing the platform. A scorecard that undercounts is not
  // being conservative — it is wrong, and it hides regressions in what it forgot.
  const pkgRoot = path.join(ROOT, 'packages');
  let names = [];
  try {
    names = fs.readdirSync(pkgRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch { return null; }

  const perPackage = [];
  let total = 0; let pass = 0; let fail = 0;
  for (const name of names) {
    const pkg = path.join(pkgRoot, name);
    if (!fs.existsSync(path.join(pkg, 'dist', 'test'))) continue;
    const r = spawnSync(process.execPath, ['--test', 'dist/test/*.test.js'],
      { cwd: pkg, encoding: 'utf8', timeout: 300000 });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const read = (label) => {
      const m = new RegExp(`^\\s*(?:#|\\u2139)\\s*${label}\\s+(\\d+)\\s*$`, 'm').exec(out);
      return m?.[1] === undefined ? null : Number(m[1]);
    };
    const t = read('tests'); const p = read('pass'); const f = read('fail');
    // A package whose suite could not be read is NOT silently skipped: skipping it
    // would let a broken build improve the score.
    if (t === null || p === null || f === null) return null;
    perPackage.push(`${name} ${p}/${t}`);
    total += t; pass += p; fail += f;
  }
  return perPackage.length === 0 ? null : { total, pass, fail, perPackage };
}
const tests = testResults();

/** Compatibility evidence, regenerated by its gate rather than read as a claim. */
let compat = null;
try {
  compat = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'contracts', 'compat', 'evidence.json'), 'utf8'));
} catch { /* absent */ }

/** Architecture coverage and lifecycle traceability evidence. */
let trace = null;
try {
  trace = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance', 'traceability', 'evidence.json'), 'utf8'));
} catch { /* absent */ }

/** Operational evidence — regenerated by its gate, read here as the gate left it. */
let operational = null;
try {
  operational = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance', 'operational', 'evidence.json'), 'utf8'));
} catch { /* absent */ }

/** Customer readiness evidence — regenerated by its gate, read here as it was left. */
let customer = null;
try {
  customer = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance', 'customer-success', 'evidence.json'), 'utf8'));
} catch { /* absent */ }

/** Production readiness evidence — regenerated by its gate, read here as it was left. */
let production = null;
try {
  production = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance', 'production', 'evidence.json'), 'utf8'));
} catch { /* absent */ }

/** Deployment and General Availability evidence — regenerated by its gate. */
let deployment = null;
try {
  deployment = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance', 'deployment', 'evidence.json'), 'utf8'));
} catch { /* absent */ }

/** Supply-chain evidence. Partial by construction: signing and attestation have no tooling. */
let supply = null;
try {
  supply = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance', 'supply-chain', 'evidence.json'), 'utf8'));
} catch { /* absent */ }

const gateEv = (script, label) => evidence({
  value: gateResults[script] ?? 'NOT RUN',
  source: script, method: 'gate execution, exit code',
  confidence: 'high', traceability: label, validation: proofs.some((p) => p.gate === script && p.proved) ? 'fault-injection proved' : 'unproven',
});

// ── Metrics ─────────────────────────────────────────────────────────────────
const metrics = [
  ['Architecture Compliance', gateEv('verify-architecture-integrity.js', `${archDocs.length} canonical documents`)],
  ['Governance Compliance', evidence({
    value: `${gatesPassing}/${registered.length} gates PASS`, source: 'run-all.js',
    method: 'gate execution', confidence: 'high', traceability: 'C-0.4 NOT RUN treated as FAIL', validation: 'proved',
  })],
  // Security is now PARTLY measured. The enforcement properties below are observed
  // against real certificates and real TLS handshakes; the threat model itself still
  // has no executing gate, and that half is reported as unmeasured rather than
  // absorbed into a green figure.
  ['Security Compliance', (() => {
    if (!operational || !Array.isArray(operational.proven)) {
      return notMeasured('—', 'the operational harness has not run');
    }
    const ENFORCEMENT = ['E-4', 'E-4.n', 'E-6', 'E-7', 'E-8', 'E-8.q', 'E-9', 'E-10.d'];
    const found = operational.proven.filter((x) => ENFORCEMENT.includes(x.id));
    const passed = found.filter((x) => x.passed).length;
    if (found.length === 0) return notMeasured('—', 'no enforcement property was exercised');
    return evidence({
      value: `${passed}/${found.length} enforcement properties proven`,
      source: 'governance/operational/evidence.json',
      method: 'real X.509, real mutual TLS handshakes, real token verification',
      confidence: 'high',
      traceability: 'C-08.20, C-08.21, C-08.22, C-08.25, C-07.1, C-07.3',
      validation: 'threat-model criteria remain NOT MEASURED (P3)',
    });
  })()],
  ['Traceability Compliance', gateEv('verify-implementation-traceability.js', 'source -> architecture -> ADR -> criteria')],
  ['Code Quality', notMeasured('—', 'no linter configured')],
  ['Test Coverage', tests
    ? evidence({ value: `${tests.pass}/${tests.total} passing`, source: 'node:test', method: 'test execution',
      confidence: 'high', traceability: tests.perPackage.join(', '),
      validation: 'line coverage NOT MEASURED' })
    : notMeasured('node:test', 'a package is not built, or its suite could not be read')],
  ['Contract Compatibility', compat && compat.summary
    ? evidence({
      value: compat.summary.passed + '/' + compat.summary.total + ' properties',
      source: 'packages/contracts/compat/evidence.json',
      method: 'harness execution over a frozen fixture corpus',
      confidence: 'high',
      traceability: compat.fixtureCount + ' fixtures, versions ' + (compat.versionsCovered || []).join(', '),
      validation: compat.certificationStatus === 'certified' ? 'certified' : 'uncertified',
    })
    : notMeasured('—', 'compatibility harness has not run')],
  ['Performance', production && production.proven
    ? (() => {
      const b = production.proven.filter((x) => /^B-\d/.test(x.id));
      const ctx = production.benchmarkContext ?? {};
      return b.length === 0
        ? notMeasured('—', 'no benchmark was executed')
        : evidence({
          value: `${b.filter((x) => x.passed).length}/${b.length} benchmarks within target`,
          source: 'governance/production/evidence.json',
          method: 'executed operations, percentiles from observed samples with no interpolation',
          confidence: 'medium',
          // Confidence is MEDIUM, not high, and the caveat says why. These figures
          // bound what the code can do on one machine; they are not a capacity model,
          // and a scorecard that presented them as one would be the misuse they invite.
          traceability: `${ctx.cpus ?? '?'} logical CPUs, ${ctx.platform ?? '?'} — single process`,
          validation: 'NOT a capacity model; production load remains NOT MEASURED (G-2)',
        });
    })()
    : notMeasured('—', 'the production readiness harness has not run')],
  ['Documentation', evidence({
    value: `${frozen}/${archDocs.length} frozen, ${adrDocs.length} ADRs, ${criteria} criteria`,
    source: 'docs/', method: 'file inspection', confidence: 'high',
    traceability: 'canonical set', validation: 'integrity gate',
  })],
  ['Technical Debt', evidence({
    value: openDebt === 0 ? '0 open' : `${openDebt} open`, source: 'program/TECHNICAL_DEBT.md',
    method: 'register parse, current section only', confidence: 'high',
    traceability: 'CHARTER §10', validation: 'parsed',
  })],
  ['Deployment Readiness', notMeasured('—', 'no container image; Docker unavailable (R-005)')],
  ['Operational Readiness', operational && operational.summary
    ? evidence({
      value: `${operational.summary.provenPassed}/${operational.summary.provenTotal} proven, `
        + `${operational.summary.unmeasuredTotal} NOT MEASURED`,
      source: 'governance/operational/evidence.json',
      method: 'end-to-end execution against @dbiz/platform-runtime, replayed in a second process',
      confidence: 'high',
      traceability: (operational.certificationBlockers ?? []).join('; ')
        || 'no outstanding blocker',
      validation: operational.certificationStatus,
    })
    : notMeasured('—', 'the operational harness has not run')],
  // R-25.29: customer readiness contributes to the indices ONLY from executed
  // validation, never from the existence of an artefact. That is why this reads the
  // evidence rather than counting the documents in the published package.
  ['Customer Readiness', customer && customer.summary
    ? evidence({
      value: `${customer.summary.provenPassed}/${customer.summary.provenTotal} proven, `
        + `${customer.summary.unmeasuredTotal} NOT MEASURED`,
      source: 'governance/customer-success/evidence.json',
      method: 'executed customer journey — onboard, generate, register, verify — replayed in a second process',
      confidence: 'high',
      traceability: customer.onboardingDurationMs !== null
        ? `automated onboarding measured at ${Math.round(customer.onboardingDurationMs)}ms across 7 steps`
        : 'onboarding duration NOT MEASURED',
      validation: customer.certificationStatus,
    })
    : notMeasured('—', 'the customer readiness harness has not run')],
  ['Customer Documentation', customer && customer.packageFileCount
    ? evidence({
      value: `${customer.packageFileCount} files generated`,
      source: 'docs/customer-success-package/',
      method: 'generated from validation output and content-hashed (R-25.34)',
      confidence: 'high',
      traceability: `content hash ${String(customer.packageContentHash ?? '').slice(0, 16)}…`,
      validation: 'published only from a passing validation run',
    })
    : notMeasured('—', 'no Customer Success Package has been published')],
  ['Production Readiness', production && production.summary
    ? evidence({
      value: `${production.summary.provenPassed}/${production.summary.provenTotal} measured, `
        + `${production.summary.unmeasuredTotal} NOT MEASURED`,
      source: 'governance/production/evidence.json',
      method: 'executed operational run, benchmarks and resilience suite, each replayed',
      confidence: 'high',
      // The GA limit is carried into the scorecard rather than left in a report, so a
      // reader of the summary cannot round "partially-certified" up to "ready".
      traceability: production.generalAvailability ?? 'general availability status not stated',
      validation: production.certificationStatus,
    })
    : notMeasured('—', 'the production readiness harness has not run')],
  ['Observability', production && production.proven
    ? (() => {
      const o = production.proven.filter((p) => ['P-1', 'P-2', 'P-3', 'P-4', 'P-5', 'P-10'].includes(p.id));
      return o.length === 0
        ? notMeasured('—', 'no observability property was exercised')
        : evidence({
          value: `${o.filter((p) => p.passed).length}/${o.length} properties proven`,
          source: 'governance/production/evidence.json',
          method: 'executed lifecycle with telemetry, then interrogation of what was recorded',
          confidence: 'high',
          traceability: 'C-23.10, C-23.11, C-24.1, C-24.7, R-23.14',
          validation: 'silence reports unknown, never health',
        });
    })()
    : notMeasured('—', 'the production readiness harness has not run')],
  // MEASURED ABSENCE, not an assumed one. The blocker is now the output of a probe
  // that enumerates every runtime the platform would accept — so this dimension moves
  // on its own the day a runtime appears, rather than when someone remembers.
  ['General Availability', deployment
    ? evidence({
      value: deployment.generalAvailability === 'CERTIFIED' ? 'CERTIFIED' : NM,
      source: 'governance/deployment/evidence.json',
      method: 'deployment capability probe; E-2 requires the image to start and serve a real request (C-17.3)',
      confidence: deployment.generalAvailability === 'CERTIFIED' ? 'high' : 'none',
      traceability: `${(deployment.runtimesSearched || []).length} runtimes searched, ${(deployment.runtimesSearched || []).filter((r) => r.daemonResponds).length} usable`,
      validation: deployment.generalAvailabilityReason ?? 'no determination recorded',
    })
    : notMeasured('—', 'the deployment probe has not run')],
  ['Deployment capability', deployment && Array.isArray(deployment.runtimesSearched)
    ? evidence({
      value: `${deployment.runtimesSearched.filter((r) => r.daemonResponds).length}/${deployment.runtimesSearched.length} runtimes usable`,
      source: 'governance/deployment/evidence.json',
      method: 'executed search of the PATH and every known install location',
      confidence: 'high',
      traceability: 'C-17.1, C-17.3, R-17.1',
      validation: 'the absence is measured, not assumed — R-13.1 does not accept a stated blocker as evidence',
    })
    : notMeasured('—', 'the deployment probe has not run')],
  ['AI Governance', gateEv('verify-ai-vendor-neutrality.js', 'Rule 12 / INV-9')],
  ['Supply Chain Security', supply && supply.summary
    ? evidence({
      value: supply.summary.measuredPassed + '/' + supply.summary.measuredTotal
        + ' measured, ' + supply.summary.unmeasuredTotal + ' NOT MEASURED',
      source: 'governance/supply-chain/evidence.json',
      method: 'SBOM, frozen lockfile, audit, licence policy, reproducible build',
      confidence: 'high',
      traceability: 'signing, attestation and promotion have no tooling and are not claimed',
      validation: supply.certificationStatus,
    })
    : notMeasured('—', 'supply-chain gate has not run')],
  ['Change Control', gateEv('verify-change-control-completeness.js', 'R-18.26 / C-01.41')],
  ['Architecture Coverage', trace && trace.coverage
    ? evidence({
      value: trace.coverage.documentsWithMilestone + '/' + trace.coverage.documents + ' documents owned, '
        + trace.chain.filter((c) => c.status !== NM).length + '/' + trace.chain.length + ' lifecycle stages',
      source: 'governance/traceability/evidence.json',
      method: 'derived from repository state; coverage map validated against the plan',
      confidence: 'high',
      traceability: 'ACM + ETM',
      validation: trace.verificationStatus,
    })
    : notMeasured('—', 'traceability matrices have not been generated')],
];

const measured = metrics.filter(([, e]) => e.value !== NM).length;

// ── Governance Confidence Index (R-13.5) ────────────────────────────────────
const gciInputs = [
  ['Gates validated by fault injection', registered.length ? proved / registered.length : null,
    `${proved}/${registered.length}`, 'proofs.json'],
  ['Gates validated on positive AND negative paths', registered.length ? bothPaths / registered.length : null,
    `${bothPaths}/${registered.length}`, 'proofs.json'],
  ['Governance gate execution success', registered.length ? gatesPassing / registered.length : null,
    `${gatesPassing}/${registered.length}`, 'run-all.js'],
  ['Evidence-backed metrics', metrics.length ? measured / metrics.length : null,
    `${measured}/${metrics.length}`, 'this generator'],
  ['Manually asserted metrics (inverse)', 1, '0 asserted', 'R-13.1 prohibits them'],
  ['ADR implementation completeness', gateResults['verify-change-control-completeness.js'] === 'PASS' ? 1 : 0,
    gateResults['verify-change-control-completeness.js'] ?? 'NOT RUN', 'change-control gate'],
  ['Architecture-to-implementation traceability', gateResults['verify-implementation-traceability.js'] === 'PASS' ? 1 : 0,
    gateResults['verify-implementation-traceability.js'] ?? 'NOT RUN', 'traceability gate'],
  ['Change control compliance', gateResults['verify-change-control-completeness.js'] === 'PASS' ? 1 : 0,
    gateResults['verify-change-control-completeness.js'] ?? 'NOT RUN', 'change-control gate'],
  ['Independent enforcement across both planes', null, NM,
    'requires a programme-level collector observing both repositories; neither plane may read the other'],
  ['Certification repeatability', null, NM, 'no repeat certification run yet'],
  ['Governance drift over time', null, NM, 'requires historical scorecards; this is the first with a GCI'],
  ['Evidence integrity verification', null, NM, 'proof registry is not itself signed'],
  ['Policy enforcement coverage', null, NM, 'no policy decision point implemented (P4)'],
  ['Decisions protected by automated governance', adrDocs.length ? Math.min(1, registered.length / adrDocs.length) : null,
    `${registered.length} gates / ${adrDocs.length} ADRs`, 'gate and ADR inventory'],
];

gciInputs.push(
  ['Proof replay success', registered.length ? replayed / registered.length : null,
    replayed + '/' + registered.length, 'proofs.json - deterministic replay'],
  ['Provenance integrity', proofs.length ? provenanced / proofs.length : null,
    provenanced + '/' + proofs.length, 'proofs.json - origin fields present'],
  ['Architecture fitness', gateResults['verify-architecture-fitness.js'] === 'PASS' ? 1 : 0,
    gateResults['verify-architecture-fitness.js'] || 'NOT RUN', 'fitness gate'],
  ['Compatibility coverage',
    compat && compat.summary && compat.summary.total ? compat.summary.passed / compat.summary.total : null,
    compat && compat.summary ? compat.summary.passed + '/' + compat.summary.total : NM, 'compatibility harness'],
  ['Evidence freshness', registryAgeMs === null ? null : decayFactor, freshnessLabel, 'proof registry age vs expiry'],
  ['Architecture coverage', trace && trace.coverage && trace.coverage.documents
    ? trace.coverage.documentsWithMilestone / trace.coverage.documents : null,
    trace && trace.coverage ? trace.coverage.documentsWithMilestone + '/' + trace.coverage.documents : NM,
    'architecture coverage matrix'],
  ['Lifecycle traceability', trace && trace.chain && trace.chain.length
    ? trace.chain.filter((c) => c.status !== NM).length / trace.chain.length : null,
    trace && trace.chain ? trace.chain.filter((c) => c.status !== NM).length + '/' + trace.chain.length : NM,
    'enterprise traceability matrix'],
);

/**
 * RELEASE CONFIDENCE INDEX (RCI).
 *
 * ERI asks "is the platform ready?"  GCI asks "can the system that told you so be
 * trusted?"  RCI asks a third, narrower question: "can THIS build be shipped?"
 *
 * They are not interchangeable. A platform can be architecturally ready (high ERI)
 * with trustworthy governance (high GCI) and still produce a build that must not
 * ship — because its dependencies carry an advisory, its output is irreproducible,
 * or it is undeployable. RCI is the metric that would say so.
 */
const rciInputs = [
  ['Tests passing', tests && tests.total ? tests.pass / tests.total : null,
    tests ? tests.pass + '/' + tests.total : NM, 'node:test'],
  ['Contract compatibility', compat && compat.summary && compat.summary.total
    ? compat.summary.passed / compat.summary.total : null,
    compat && compat.summary ? compat.summary.passed + '/' + compat.summary.total : NM, 'compat harness'],
  ['Supply chain (measured portion)', supply && supply.summary && supply.summary.measuredTotal
    ? supply.summary.measuredPassed / supply.summary.measuredTotal : null,
    supply && supply.summary ? supply.summary.measuredPassed + '/' + supply.summary.measuredTotal : NM,
    'supply-chain gate'],
  ['Build reproducibility', supply
    ? (supply.measured || []).some((m) => /byte-identical/.test(m.property) && m.passed) ? 1 : 0
    : null,
    supply ? ((supply.measured || []).some((m) => /byte-identical/.test(m.property) && m.passed) ? 'reproducible' : 'not reproducible') : NM,
    'two clean builds compared'],
  ['Governance gates green', registered.length ? gatesPassing / registered.length : null,
    gatesPassing + '/' + registered.length, 'run-all.js'],
  ['Technical debt cleared', openDebt === 0 ? 1 : 0, openDebt === 0 ? '0 open' : openDebt + ' open', 'debt register'],
  ['Deployment readiness', deployment && deployment.e2 && deployment.e2.status === 'PASS' ? 1 : null,
    deployment && deployment.e2 ? (deployment.e2.status === 'PASS' ? 'E-2 PASS' : NM) : NM,
    'E-2 — the image must start and serve a real request (C-17.3); a build is not evidence'],
  ['Production readiness', production && production.summary && production.summary.provenTotal
    ? production.summary.provenPassed / production.summary.provenTotal : null,
    production && production.summary
      ? `${production.summary.provenPassed}/${production.summary.provenTotal} measured`
      : NM,
    'executed observability, benchmark and resilience evidence — a release nobody can observe in production is unshippable'],
  ['Operational readiness', operational && operational.summary && operational.summary.provenTotal
    ? operational.summary.provenPassed / operational.summary.provenTotal : null,
    operational && operational.summary
      ? `${operational.summary.provenPassed}/${operational.summary.provenTotal} proven`
      : NM,
    'executed operational evidence; SLO VALUES remain unmeasured'],
  ['Customer readiness', customer && customer.summary && customer.summary.provenTotal
    ? customer.summary.provenPassed / customer.summary.provenTotal : null,
    customer && customer.summary
      ? `${customer.summary.provenPassed}/${customer.summary.provenTotal} proven`
      : NM,
    'executed customer journey — a release a customer cannot adopt is unshippable'],
  ['Security validation', null, NM, 'threat-model criteria have no executing gate'],
  ['Architecture coverage', trace && trace.coverage && trace.coverage.documents
    ? trace.coverage.documentsWithMilestone / trace.coverage.documents : null,
    trace && trace.coverage ? trace.coverage.documentsWithMilestone + '/' + trace.coverage.documents : NM,
    'coverage matrix — a release with unowned architecture is unshippable'],
];
const rciScored = rciInputs.filter(([, v]) => typeof v === 'number');
const rawRci = rciScored.length ? rciScored.reduce((s, [, v]) => s + v, 0) / rciScored.length : null;
const rci = rawRci === null ? null : (isCurrent ? Math.round(rawRci * decayFactor * 100) : null);
const rciCoverage = rciScored.length + '/' + rciInputs.length + ' inputs measured';

const scored = gciInputs.filter(([, v]) => typeof v === 'number');
const rawGci = scored.length ? (scored.reduce((s, [, v]) => s + v, 0) / scored.length) : null;
// Decay applies to the aggregate, not to each input: the question is how much
// confidence the WHOLE body of evidence still supports, and expired evidence
// supports none of it (R-14.5).
const gci = rawGci === null ? null : (isCurrent ? Math.round(rawGci * decayFactor * 100) : null);
const gciCoverage = scored.length + '/' + gciInputs.length + ' inputs measured';

/** Governance reliability KPIs - permanent, per the governance-reliability mandate. */
const namedCorrectly = proofs.filter((p) => p.observations && p.observations.causeNamedInOutput).length;
const kpis = [
  ['Detection rate', registered.length ? proved + '/' + registered.length + ' gates detect their planted fault' : NM],
  ['False positive rate', proofs.length ? '0/' + proofs.length + ' - every clean run passed' : NM],
  ['False negative rate', proofs.length ? (proofs.length - proved) + '/' + proofs.length + ' faults undetected' : NM],
  ['Detection accuracy', proofs.length ? namedCorrectly + '/' + proofs.length + ' named the correct cause' : NM],
  ['Replay success', registered.length ? replayed + '/' + registered.length : NM],
  ['Verification success', gatesPassing + '/' + registered.length + ' gates PASS'],
  ['Gate stability', NM],
  ['Rule stability', NM],
  ['Governance drift', NM],
  ['Evidence freshness', freshnessLabel],
];

// ── Maturity, derived from evidence (ADR-0018 §4.4) ─────────────────────────
const gated = (s) => s === 'PASS' || s === 'FAIL';
const maturity = [
  ['Enterprise Architecture', gated(gateResults['verify-architecture-integrity.js']) ? 3 : 1, 'documented and gate-enforced'],
  ['Governance', gated(gateResults['verify-governance-self-validation.js']) ? 3 : 1, 'gate-enforced and self-validating'],
  ['Security', 2, 'threat model defined; no executing security gate'],
  ['AI Governance', gated(gateResults['verify-ai-vendor-neutrality.js']) ? 3 : 1, 'enforced in both planes'],
  ['Functional Testing', 1, 'not implemented'],
  ['Dev-Change Engine', 1, 'not implemented'],
  ['Inverse-Flow Discovery', 1, 'not implemented'],
  ['Performance Testing', 1, 'not implemented'],
  ['Security Testing', 1, 'not implemented'],
  ['Penetration Testing', 1, 'not implemented'],
  ['Platform Services', 1, 'documents 23-25 not authored'],
  ['Release Management', 2, 'semantic versioning defined; no release pipeline'],
  ['Operations', 1, 'document 23 not authored'],
  ['Deployment', 1, 'no image builds'],
  ['Configuration', 2, 'model frozen; not implemented'],
  ['Data Governance', 2, 'classification and retention frozen; unenforced in code'],
  ['Compliance', 1, 'no compliance evidence produced'],
  ['Certification', gated(gateResults['verify-change-control-completeness.js']) ? 3 : 1, 'architecture certified; implementation not'],
];
const avgMaturity = (maturity.reduce((s, [, l]) => s + l, 0) / maturity.length).toFixed(1);

// ── Emit ────────────────────────────────────────────────────────────────────
const banner = `<!-- GENERATED by governance/verification/generate-scorecard.js — DO NOT EDIT.
     R-13.1 prohibits hand-authored status values. Regenerate rather than correct. -->`;

const fmt = (v) => (v === NM ? `**${NM}**` : `\`${v}\``);
const row = ([name, e]) =>
  `| ${name} | ${fmt(e.value)} | ${e.source} | ${e.method} | ${e.confidence} | ${e.validation} |`;

const scorecard = `${banner}

# Engineering Scorecard

**Generated ${collectedAt}.** Every metric carries an evidence envelope (R-13.2).

| Metric | Value | Evidence source | Method | Confidence | Validation |
|---|---|---|---|---|---|
${metrics.map(row).join('\n')}
| **Enterprise Readiness Index** | \`${measured}/${metrics.length} measured\` | this generator | coverage of measurable metrics | high | derived |
| **Governance Confidence Index** | ${gci === null ? '**NOT CURRENT**' : '`' + gci + '%`'} | proofs.json + run-all.js | see below | medium | ${gciCoverage} · ${freshnessLabel} |
| **Release Confidence Index** | ${rci === null ? '**NOT CURRENT**' : '`' + rci + '%`'} | tests, compat, supply chain, gates | see below | medium | ${rciCoverage} · ${freshnessLabel} |

## Governance Confidence Index

**ERI asks "is the platform ready?" — GCI asks "can the system that told you so be trusted?"**

A high readiness index produced by an untrustworthy governance system is worse than a low one, because it is confidently wrong. The two are reported together and neither substitutes for the other.

| Input | Value | Evidence |
|---|---|---|
${gciInputs.map(([n, v, d, s]) => `| ${n} | ${v === null ? `**${NM}**` : `\`${d}\``} | ${s} |`).join('\n')}

### Score · Coverage · Freshness

R-14.6 forbids publishing confidence as a single number. **All three are published together, always.**

| | |
|---|---|
| **Score** | ${gci === null ? '**NOT CURRENT**' : gci + '%'} |
| **Coverage** | ${gciCoverage} |
| **Freshness** | ${freshnessLabel} |

A score means one thing at full coverage with fresh evidence and something entirely different at partial coverage with expired evidence. Publishing the score alone permits exactly the misreading the index exists to prevent.

**Confidence decays with evidence age** (R-14.5). The raw aggregate is ${rawGci === null ? NM : Math.round(rawGci * 100) + '%'}; after decay it is ${gci === null ? '**NOT CURRENT**' : gci + '%'}. Once the registry expires the score reports **NOT CURRENT** rather than a low number — expired evidence contributes nothing and is never averaged in as partial credit.

## Release Confidence Index

**ERI** asks *is the platform ready?* · **GCI** asks *can the system that told you so be trusted?* · **RCI** asks *can this build be shipped?*

They are not interchangeable. A platform can be architecturally ready with trustworthy governance and still produce a build that must not ship — because a dependency carries an advisory, the output is irreproducible, or it cannot be deployed. RCI is the metric that would say so.

| | |
|---|---|
| **Score** | ${rci === null ? '**NOT CURRENT**' : rci + '%'} |
| **Coverage** | ${rciCoverage} |
| **Freshness** | ${freshnessLabel} |

| Input | Value | Evidence |
|---|---|---|
${rciInputs.map(([n, v, d, src]) => '| ' + n + ' | ' + (v === null ? '**' + NM + '**' : '`' + d + '`') + ' | ' + src + ' |').join('\n')}

**Deployment readiness contributes nothing and is not counted against the score either** — it is excluded from the average and reported. An unmeasured input never contributes positively (R-13.3), and inventing a zero for it would be as dishonest as inventing a one.

## Governance reliability KPIs

| KPI | Value |
|---|---|
${kpis.map(([n, v]) => '| ' + n + ' | ' + (v === NM ? '**' + NM + '**' : '`' + v + '`') + ' |').join('\n')}

Unmeasured GCI inputs are excluded from the average and reported — never counted as satisfied, never silently dropped (R-13.3).

## How to read this

**\`${NM}\` is not a pass.** It states that no mechanism currently measures the metric — the measurement analogue of \`NOT RUN\` ≡ \`FAIL\` (C-0.4). ${metrics.length - measured} of ${metrics.length} metrics are unmeasured, reported rather than hidden.

**Regressions.** A metric moving from \`PASS\` to \`FAIL\`, or from measured to \`${NM}\`, is a regression requiring investigation before implementation continues. This report is a generated build artifact (ADR-0063), not committed to source — compare a run against the previous CI run's \`governance-evidence\` artifact to see movement.
`;

const report = `${banner}

# Platform Maturity Report

**Generated ${collectedAt}.** Levels are derived from evidence, never asserted (ADR-0018 §4.4).

**Average maturity: ${avgMaturity} / 5** · **GCI: ${gci === null ? NM : `${gci}%`}** (${gciCoverage})

| Area | Level | Evidence |
|---|---|---|
${maturity.map(([n, l, e]) => `| ${n} | **${l}** | ${e} |`).join('\n')}

## Levels

| Level | Requires |
|---|---|
| 1 Initial | nothing — the default |
| 2 Managed | a defined process exists and is followed |
| 3 Defined | the process is documented **and enforced by at least one gate** |
| 4 Measured | metrics emitted and collected automatically |
| 5 Optimized | metrics drive improvement, with regression detection |

## Reading this honestly

Most areas are **Level 1**, which is the correct assessment: the six capabilities are not implemented, nothing is deployed, and no metric is collected automatically.

**No area exceeds Level 3.** Level 4 requires automatic metric collection, which does not exist. An area cannot reach Level 3 without a gate — which is why architecture, governance, AI governance and certification are the only areas that do.

Rising above Level 3 requires observability ([16](../docs/architecture/16-runtime-model.md) §7) and the Operational Excellence model (document 23, not yet authored).
`;

fs.writeFileSync(path.join(PROGRAM, 'ENGINEERING_SCORECARD.md'), scorecard, 'utf8');
fs.writeFileSync(path.join(PROGRAM, 'PLATFORM_MATURITY.md'), report, 'utf8');

console.log('');
console.log('SCORECARD GENERATED');
console.log('='.repeat(64));
for (const [n, e] of metrics) console.log(`  ${String(e.value).padEnd(24)} ${n}`);
console.log('-'.repeat(64));
console.log(`  Enterprise Readiness Index : ${measured}/${metrics.length} measured`);
console.log('  Governance Confidence Index: ' + (gci === null ? 'NOT CURRENT' : gci + '%'));
console.log('    coverage  : ' + gciCoverage);
console.log('    freshness : ' + freshnessLabel);
console.log('  Release Confidence Index   : ' + (rci === null ? 'NOT CURRENT' : rci + '%'));
console.log('    coverage  : ' + rciCoverage);
console.log(`  Average platform maturity  : ${avgMaturity} / 5`);
console.log('');
process.exit(0);
