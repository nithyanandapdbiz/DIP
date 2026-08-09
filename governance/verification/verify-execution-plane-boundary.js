'use strict';
/**
 * GOVERNANCE — Execution-Plane boundary: tree-wide execution-ownership scan.
 * ============================================================================
 * WHAT THIS GATE OWNS
 *   Constitutional enforcement mechanism (2) for R-3.5 — "an import-scan gate over
 *   [the Intelligence Plane's] source tree" — at TREE SCOPE. The Intelligence Plane
 *   SHALL NOT contain browser, load-generation, or scanning capability, "even dormant,
 *   even unreferenced" (R-3.5, C-01.8). Browser execution, evidence capture and AUT
 *   connectivity belong solely to the Execution Plane (19-repository-ownership.md §2,
 *   R-19.2; 04-execution-plane-architecture.md).
 *
 * WHY THIS GATE EXISTS ALONGSIDE THE OTHERS
 *   verify-canonical-runtime-integration.js (CI-5) and verify-runtime-enablement.js
 *   (RE-4) already import-scan the runtime SEAM — a hardcoded set of bridge files
 *   (composer/SPI/bridge/translator/transport/adapter/evidence-channel). They are
 *   fault-proven (record-fault-proofs injects playwright.chromium.launch and confirms
 *   they go red). But a browser import introduced in a NEW file, in ANOTHER package,
 *   is outside their fixed file list and would pass CI. R-3.5 says "even unreferenced":
 *   the scan the constitution mandates is over the whole tree, not the known seam.
 *   This gate is that tree-wide scan. It does not restate a rule; it executes the
 *   enforcement the constitution already declares.
 *
 * WHAT IT CHECKS
 *   (1) Manifest dependency ban — no IP package.json declares a browser/automation
 *       runtime as a dependency (enforcement mechanism (1): the dependency-ban gate).
 *   (2) Source import/call ban — no IP source file, in LIVE code, imports a browser
 *       runtime or drives a browser (launch/newPage/goto/click/screenshot/trace/video).
 *
 * THE ONE SUBTLETY — GENERATION IS NOT EXECUTION
 *   The Functional Testing Engine's emitter (src/emitters/executable-automation.ts) is
 *   an IP-owned Test-Generation concern: it EMITS Playwright source as text for the
 *   Execution Plane to run. Its "page.goto" / "@playwright/test" tokens live inside
 *   string/template literals — generated artefacts, not executed code. Likewise the
 *   fault-proof harness carries injection strings. A correct scan of "does the IP
 *   EXECUTE a browser" must read LIVE code only. This gate strips comments and string/
 *   template-literal bodies (preserving ${...} interpolations, which are live) before
 *   scanning — so emitted text and prohibition comments never false-positive, while a
 *   real `import`/call anywhere in the tree is caught.
 *
 * SELF-PROOF (R-13.4)
 *   The gate proves positive AND negative detection on synthetic samples before it
 *   trusts its own verdict: a live `import 'playwright'` + `chromium.launch()` MUST be
 *   detected; an emitter-style template string carrying the same tokens MUST NOT be.
 *   If the self-proof fails, the gate fails closed — an enforcement mechanism that
 *   cannot demonstrate it detects is not evidence (C-0.4 / NOT RUN ≡ FAIL).
 *
 * SCOPE
 *   Reads ONLY Intelligence-Plane-local files. Never reads across the plane boundary
 *   (no path escapes the repository root). node_modules and build output (dist) are
 *   excluded — third-party and generated trees are not IP-authored capability.
 *
 * Run:  node governance/verification/verify-execution-plane-boundary.js
 * Exit: 0 = the Intelligence Plane contains no execution capability   1 = violation / self-proof failed
 *
 * REGISTERED as a gating check in run-all.js (GOVERNANCE-EPIP-002). Its fault proof is
 * recorded in proofs.json by record-fault-proofs.js (a live playwright import + browser
 * call planted in an IP source file; the gate must go red and name the cause), added in
 * the same change per CHARTER §18. This is the tree-wide leg of R-3.5 enforcement
 * mechanism (2) — the seam-scoped legs are verify-canonical-runtime-integration.js
 * (CI-5) and verify-runtime-enablement.js (RE-4).
 */
const fs = require('fs');
const path = require('path');
const { stripToLiveCode } = require('./lib/live-code.js');

const ROOT = path.join(__dirname, '..', '..');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
  return cond;
};

// ── Browser / automation runtime vocabulary ─────────────────────────────────
// Package names that ARE an execution runtime (dependency ban).
const BROWSER_PACKAGES = [
  'playwright', 'playwright-core', '@playwright/test',
  'puppeteer', 'puppeteer-core',
  'selenium-webdriver', 'webdriverio', '@wdio/cli',
  'cypress', 'appium', 'chromedriver', 'geckodriver',
];
// Live-code signals that the IP is DRIVING a browser (import/call ban), applied to
// source with comments and string/template bodies removed.
const IMPORT_RE = new RegExp(
  '(?:import[^;\\n]*?from\\s*|require\\s*\\(\\s*)[\'"](?:' +
  BROWSER_PACKAGES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  ')[\'"]', 'i');
const CALL_RE = /\b(?:chromium|firefox|webkit)\s*\.\s*launch\b|\bbrowser\s*\.\s*newPage\b|\bbrowser\s*\.\s*newContext\b|\bpage\s*\.\s*goto\b|\bpage\s*\.\s*click\b|\bpage\s*\.\s*fill\b|\bpage\s*\.\s*screenshot\s*\(|\bstartTracing\s*\(/i;

// -- Live-code extraction ---------------------------------------------------
// Shared with verify-intelligence-plane-egress.js. Extracted to governance/
// verification/lib/live-code.js so the two source-scanning gates cannot drift apart
// about what "live code" means - a second copy would be D-007 reproduced inside the
// governance suite itself. Behaviour is unchanged: comments and string/template
// bodies blanked, module specifiers and interpolation regions preserved, regex
// literals neutralised so a detection gate never flags its own patterns.

function scanSourceForExecution(src) {
  const live = stripToLiveCode(src);
  const hits = [];
  const im = live.match(IMPORT_RE);
  if (im) hits.push(`browser-runtime import "${im[0].trim().slice(0, 60)}"`);
  const ca = live.match(CALL_RE);
  if (ca) hits.push(`browser-drive call "${ca[0].trim()}"`);
  return hits;
}

// ── SELF-PROOF (R-13.4) — positive and negative detection ───────────────────
line('');
line('GOVERNANCE — Execution-Plane boundary: tree-wide execution-ownership scan');
line('='.repeat(74));
line('\n0. Self-proof (R-13.4 — positive and negative detection)');

const POSITIVE_SAMPLE = [
  "import { chromium } from 'playwright';",
  'export async function run(url) {',
  '  const browser = await chromium.launch({ headless: true });',
  '  const page = await browser.newPage();',
  '  await page.goto(url);',
  "  await page.screenshot({ path: 'x.png' });",
  '}',
].join('\n');

const NEGATIVE_SAMPLE = [
  '// This is the emitter: it GENERATES Playwright text; it never runs it.',
  'export function emit() {',
  '  return [',
  "    `import { expect, type Page } from '@playwright/test';`,",
  '    `    await this.page.goto(url);`,',
  "    `  return page.screenshot({ path: 'evidence/' + name + '.png' });`,",
  '  ];',
  '}',
  '// A detection gate legitimately names the vocabulary inside a regex:',
  'const RUNTIME = /(playwright|chromium\\.launch|page\\.goto|\\.screenshot\\()/i;',
  "const spec = 'playwright'; // the package name as a data string, not an import",
  '// Prohibition comment: the IP must never call chromium.launch or page.goto.',
].join('\n');

const posHits = scanSourceForExecution(POSITIVE_SAMPLE);
const negHits = scanSourceForExecution(NEGATIVE_SAMPLE);
const positiveOk = posHits.length >= 2; // both the import and a live call
const negativeOk = negHits.length === 0; // emitted text + comments: nothing
check('POSITIVE — a live playwright import + browser call is detected', positiveOk, posHits.join('; ') || 'NOT DETECTED — scanner is blind');
check('NEGATIVE — emitter string literals & comments are NOT flagged', negativeOk, negHits.length ? `FALSE POSITIVE: ${negHits.join('; ')}` : 'generation ≠ execution, correctly ignored');
if (!positiveOk || !negativeOk) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — self-proof failed; the gate cannot demonstrate detection (C-0.4).');
  line('');
  process.exit(1);
}

// ── Tree walk (IP-local; exclude node_modules and build output) ─────────────
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'generated', 'coverage', '.turbo', '.vite', '.next', '.cache', 'build', 'out']);
const SRC_EXT = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const manifests = [];
const sources = [];
(function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
    if (e.name === 'package.json') { manifests.push(full); continue; }
    if (SRC_EXT.has(path.extname(e.name))) sources.push(full);
  }
})(ROOT);

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// ── 1. Manifest dependency ban ──────────────────────────────────────────────
line('\n1. Manifest dependency ban (R-3.5 enforcement mechanism 1)');
const depViolations = [];
for (const m of manifests) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(m, 'utf8')); } catch { continue; }
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies);
  for (const name of Object.keys(deps)) {
    if (BROWSER_PACKAGES.includes(name)) depViolations.push(`${rel(m)} declares "${name}"`);
  }
}
check(`no Intelligence-Plane manifest declares a browser/automation runtime (${manifests.length} manifests scanned)`,
  depViolations.length === 0, depViolations.join('; ') || 'no browser runtime in the IP dependency graph');

// ── 2. Source import / call ban (tree-wide) ─────────────────────────────────
line('\n2. Source execution ban — LIVE code, whole tree (R-3.5 enforcement mechanism 2)');
// The gate's own file and the fault-proof harness legitimately carry the vocabulary
// as data (this scanner's patterns; the injection strings). They are scanned like any
// other file — because their tokens live in strings, live-code extraction clears them.
const srcViolations = [];
for (const s of sources) {
  let src;
  try { src = fs.readFileSync(s, 'utf8'); } catch { continue; }
  const hits = scanSourceForExecution(src);
  if (hits.length) srcViolations.push(`${rel(s)}: ${hits.join('; ')}`);
}
check(`no Intelligence-Plane source executes or drives a browser (${sources.length} source files scanned)`,
  srcViolations.length === 0,
  srcViolations.length ? srcViolations.slice(0, 20).join('\n         ') : 'no live browser import or call anywhere in the IP tree');

// ── Evidence artefact ───────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'execution-plane-boundary-scan',
  generator: 'governance/verification/verify-execution-plane-boundary.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  ruleReference: ['R-3.5', 'C-01.8', 'R-19.2', 'INV-2'],
  method: 'live-code extraction (comments + string/template bodies stripped, ${...} preserved) then vocabulary scan',
  selfProof: { positiveDetected: posHits, negativeFlagged: negHits },
  manifestsScanned: manifests.length,
  sourcesScanned: sources.length,
  dependencyViolations: depViolations,
  sourceViolations: srcViolations,
  verificationStatus: failures === 0 ? 'no-execution-in-ip' : 'violation',
  timestamp: new Date().toISOString(),
};
try {
  fs.mkdirSync(path.join(ROOT, 'governance', 'boundary'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'governance', 'boundary', 'execution-plane-boundary-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
} catch { /* evidence write is best-effort; the verdict below is authoritative */ }

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Intelligence Plane contains no execution capability.');
  line(`Scanned ${manifests.length} manifests + ${sources.length} sources tree-wide; browser execution stays in the Execution Plane.`);
} else {
  line(`RESULT: FAIL — ${failures} execution-ownership violation(s). Move the capability to the Execution Plane (R-3.5, R-19.2).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
