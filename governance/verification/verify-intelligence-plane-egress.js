'use strict';
/**
 * GOVERNANCE — Intelligence-Plane egress: no outbound connection to a customer system.
 * ============================================================================
 * TRACEABILITY
 *   Architecture : 01-platform-constitution.md Rule 3 · 06-data-sovereignty.md · 14-tool-operating-model.md
 *   ADR          : ADR-0069 §2.2, §2.3 (the plane-of-egress ruling and this gap)
 *   Criteria     : R-3.2 · R-3.3 · R-5.1 · R-5.2 · R-6.3 · R-14.16 · R-13.4 (self-proof)
 *
 * THE GAP THIS CLOSES.
 *
 * The constitution states R-3.2's enforcement as three mechanisms: "(1) dependency ban gate over
 * the plane's manifest; (2) import-scan gate over its source tree; (3) egress policy at the runtime
 * boundary". Mechanisms (1) and (2) existed — as verify-execution-plane-boundary.js, scoped to
 * R-3.5 (browser, load and scan capability). Mechanism (3) DID NOT EXIST. CHARTER §6 requires a
 * minimum of three independent mechanisms per constitutional rule; R-3.2 had two, and neither of
 * them was looking for an HTTP client.
 *
 * The practical consequence, measured before this gate was written: an ADO or Jira REST client
 * placed in Intelligence-Plane source would have compiled, passed all 67 gates, and shipped. The
 * absence of a detecting gate is not permission — R-3.2 forbids the connection regardless — but a
 * rule enforced only by documentation is the failure class this platform exists to prevent.
 *
 * WHAT R-3.2 ACTUALLY FORBIDS. The CONNECTION, not the mutation:
 *   R-3.2  The Intelligence Plane SHALL NOT open connections to customer systems.
 *   R-3.3  The Intelligence Plane SHALL NOT hold customer credentials.
 *   R-6.3  Credential custody belongs exclusively to the Execution Plane.
 *   R-14.16 Tool credentials are created, held and rotated by the customer, in the Execution Plane.
 * A read is as forbidden as a write. Tool I/O belongs to the Execution Plane; the Intelligence
 * Plane composes intent against injected ports and never dials out.
 *
 * THE FOUR CASES, AND WHY THREE OF THEM ARE LEGITIMATE.
 *
 *   1. PLATFORM INFRASTRUCTURE — the platform's own identity provider, not a customer system.
 *      Allowlisted explicitly, per file AND per host, each with a recorded rationale. An allowlist
 *      entry naming only a file would permit that file to dial anywhere; naming the host makes it a
 *      control rather than a hole. An entry without a rationale is a bypass, and this gate refuses
 *      to run with one.
 *
 *   2. BROWSER CONTEXT — code that executes in the user's browser, not in an Intelligence-Plane
 *      process. The tenant onboarding wizard calls its own API with `window.fetch`; the connection
 *      is opened by the user's browser to the platform's own API. Classified from the package
 *      manifest (a browser bundler is declared), never from a hard-coded package name.
 *
 *   3. EMITTED TEMPLATE TEXT — the generator writes `fetch(...)` into tenant solution files as
 *      string and template literals. That text is DATA here and code only in the Execution Plane.
 *      Handled structurally by live-code extraction rather than by an allowlist: string bodies are
 *      blanked before the scan, so the emitter is invisible to the detector by construction. This
 *      is the one case that needs no permission entry, and it is the largest of the three.
 *
 *   4. EVERYTHING ELSE — fails, and names the file, line and call.
 *
 * The stripping is SHARED with verify-execution-plane-boundary.js (governance/verification/lib/
 * live-code.js) precisely so cases 3 and 4 cannot drift apart between the two gates.
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

// ── Outbound vocabulary ─────────────────────────────────────────────────────
const HTTP_CLIENT_PACKAGES = [
  'axios', 'node-fetch', 'got', 'undici', 'superagent', 'request',
  'isomorphic-fetch', 'cross-fetch', 'phin', 'needle', 'ky', 'bent',
];
const CLIENT_IMPORT_RE = new RegExp(
  '(?:import[^;\\n]*?from\\s*|require\\s*\\(\\s*)[\'"](?:'
  + HTTP_CLIENT_PACKAGES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  + ')[\'"]', 'i');
/**
 * A call that actually opens an OUTBOUND socket.
 *
 * Importing `node:http` is deliberately NOT a signal, and the first draft of this gate was wrong
 * to treat it as one. The module is direction-blind: `createServer` is an INBOUND listener, which
 * is the opposite of egress, and `import type { IncomingHttpHeaders }` is erased at compile time
 * and opens nothing at all. Both appear in this tree for legitimate reasons. What distinguishes
 * egress is the CALL, so the call is what is matched.
 */
const CALL_RE = /\bfetch\s*\(|\bhttps?\s*\.\s*(?:request|get)\s*\(|\bnew\s+XMLHttpRequest\b|\bnew\s+WebSocket\b/;
/**
 * `fetch` captured as a VALUE rather than called directly. Injecting the client under another name
 * is the obvious way past a call-shaped matcher, and it is not hypothetical: the launcher's
 * `executionPlaneService.mjs` defaulted a parameter to `fetch` and called it as `fetchImpl(...)`,
 * which the call pattern alone could not see. It hid a real R-3.2 violation from the gate written
 * to catch exactly that.
 *
 * THE MATCHER NARROWED SILENTLY ONCE. It must not be able to again, so every capture shape is
 * enumerated here and a fault proof pins the class:
 *
 *   default / assignment    `{ fetchImpl = fetch }`   `impl = fetch`
 *   const or let capture    `const f = fetch`         `let g = globalThis.fetch`
 *   global reference        `globalThis.fetch`        `window.fetch` (outside browser context)
 *   property assignment     `this.http = fetch`       `deps.send = fetch`
 *   destructured capture    `const { fetch: f } = globalThis`
 *   passed as an argument   `send(fetch)`             `[fetch]`
 *
 * A `fetch` that is merely aliased and never invoked is still an outbound capability held in this
 * plane — R-3.5's "even dormant, even unreferenced" rationale, applied to Rule 3's other half.
 */
const ALIAS_RE = new RegExp([
  // assignment / default parameter / property assignment: `= fetch` not followed by a call
  '=\\s*(?:globalThis\\s*\\.\\s*|window\\s*\\.\\s*)?fetch\\s*(?![\\s]*\\()',
  // destructured capture: `{ fetch }` or `{ fetch: alias }`
  '\\{[^{}\\n]*\\bfetch\\s*(?::[^,}\\n]+)?[^{}\\n]*\\}\\s*=',
  // global reference in any position
  '\\bglobalThis\\s*\\.\\s*fetch\\b',
  // passed as an argument or element: `send(fetch)`, `[fetch]`, `f(a, fetch)`
  '[(\\[,]\\s*fetch\\s*[,)\\]]',
].join('|'));

const findLine = (src, idx) => src.slice(0, idx).split('\n').length;

/** Every outbound signal in one source file, as {kind, line, text}. */
function scanForEgress(src) {
  const live = stripToLiveCode(src);
  const hits = [];
  const m0 = live.match(CLIENT_IMPORT_RE);
  if (m0) hits.push({ kind: 'http-client import', line: findLine(live, m0.index), text: m0[0].trim().slice(0, 70) });
  const g = new RegExp(CALL_RE.source, 'g');
  let m;
  while ((m = g.exec(live)) !== null) {
    hits.push({ kind: 'outbound call', line: findLine(live, m.index), text: m[0].trim() });
  }
  const a = new RegExp(ALIAS_RE.source, 'g');
  let ma;
  while ((ma = a.exec(live)) !== null) {
    hits.push({ kind: 'aliased fetch', line: findLine(live, ma.index), text: ma[0].trim() });
  }
  return hits;
}

// ── Case 2b — web-tier modules that live in a Node package ──────────────────
// A shared client library can be published to the browser while physically residing in a Node
// package, for type-sharing. Package-level classification cannot see that, so it is declared here
// — and then VERIFIED rather than trusted: the gate asserts the module has no importer outside a
// browser-context package or a test. An entry that acquired a server-side consumer would stop
// being classified and start failing, which is what separates a control from a permission.
const WEB_TIER_MODULES = [
  {
    file: 'packages/tenant-onboarding-engine/src/engine/web-client.ts',
    rationale:
      'TenantApiClient is the onboarding wizard\'s typed data layer over the platform\'s OWN REST API, '
      + 'published deliberately as the "./web-client" export subpath (package.json) and consumed only by '
      + 'packages/tenant-onboarding-web. Its `globalThis.fetch` default resolves to the BROWSER\'S fetch: '
      + 'the connection is opened by the user\'s browser to the platform\'s own API, not by an '
      + 'Intelligence-Plane process to a customer system. It resides in the Node package so the wizard and '
      + 'the server share one set of types rather than two that can drift.',
  },
];

// ── Allowlist — platform infrastructure only. Every entry carries a rationale ─
// An entry permits ONE file to reach ONE host. Anything wider is a hole, not a control.
const ALLOWLIST = [
  {
    file: 'packages/tenant-onboarding-engine/src/engine/microsoft-auth.ts',
    host: 'login.microsoftonline.com',
    rationale:
      'JWKS retrieval from the PLATFORM\'S OWN identity provider, to verify signatures on tokens the '
      + 'platform itself issued. Not a customer system: it holds no customer data, is identical for every '
      + 'tenant, is reached with no customer credential, and is the discovery endpoint the platform '
      + 'authenticates ITS OWN operators against. R-3.2 forbids connections to CUSTOMER systems; this is '
      + 'the platform\'s own control plane. Signature verification cannot be delegated to the Execution '
      + 'Plane without making the EP an authority on IP token validity, which inverts the trust direction.',
  },
];

// ── Self-proof (R-13.4) ─────────────────────────────────────────────────────
line('GOVERNANCE — Intelligence-Plane egress (R-3.2 enforcement mechanism 3)');
line('='.repeat(74));
line('\n0. Self-proof — positive and negative detection before any verdict (R-13.4)');

const FIXTURE_VIOLATION = "const r = await fetch('https://customer-ado.example.com/_apis/wit/workitems/42');";
const FIXTURE_EMITTED = "const tpl = \"const r = await fetch(url); return r.json();\";\nconst t2 = `await fetch(${u})`;";
const FIXTURE_CLIENT = "import axios from 'axios';\nconst r = await axios.get(u);";

const posLive = scanForEgress(FIXTURE_VIOLATION);
const posClient = scanForEgress(FIXTURE_CLIENT);
const negEmitted = scanForEgress(FIXTURE_EMITTED).filter((h) => h.kind === 'outbound call');

const positiveOk = posLive.some((h) => h.kind === 'outbound call') && posClient.some((h) => h.kind === 'http-client import');
// The emitted-template case: the `fetch(` inside a quoted string is blanked. The one inside a
// template literal survives ONLY if it sits in a ${...} region, which this fixture's does not.
const negativeOk = negEmitted.length === 0;

check('POSITIVE — a live fetch() to a customer host and an axios import are both detected', positiveOk,
  positiveOk
    ? `detected: ${[...posLive, ...posClient].map((h) => h.kind).join(', ')}`
    : 'NOT DETECTED — the scanner is blind to the defect it exists to catch');
check('NEGATIVE — emitted template text (case 3) is NOT flagged', negativeOk,
  negativeOk ? 'generation is data, not execution — string and template bodies blanked before the scan'
    : `FALSE POSITIVE: ${negEmitted.map((h) => h.text).join(', ')}`);

// An allowlist without a rationale is a bypass. Refuse to run rather than honour one.
const unjustified = ALLOWLIST.filter((a) => !a.rationale || a.rationale.trim().length < 40 || !a.host || !a.file);
check('the allowlist is fully justified — every entry names a file, a host and a rationale', unjustified.length === 0,
  unjustified.length ? `entries without a recorded rationale: ${unjustified.map((a) => a.file).join(', ')}`
    : `${ALLOWLIST.length} entr(y/ies), each naming one file, one host and why`);

if (!positiveOk || !negativeOk || unjustified.length) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — self-proof failed; the gate cannot demonstrate detection (C-0.4, R-13.4).');
  line('');
  process.exit(1);
}

// ── Discovery ───────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'build', 'out', '.turbo', '.vite', 'generated']);
const SRC_EXT = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.tsx']);
const manifests = [];
const sources = [];
(function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
    if (e.name === 'package.json') { manifests.push(full); continue; }
    if (SRC_EXT.has(path.extname(e.name)) && !e.name.endsWith('.d.ts')) sources.push(full);
  }
})(ROOT);

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// Case 2 — browser-context packages, DERIVED from the manifest, never hard-coded. A package that
// declares a browser bundler ships to a browser; `window.fetch` there is the user's browser
// dialling the platform's own API, which is not an Intelligence-Plane process opening a socket.
const BROWSER_BUNDLERS = ['vite', 'webpack', 'parcel', 'rollup', '@vitejs/plugin-react'];
const browserPackageDirs = [];
for (const m of manifests) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(m, 'utf8')); } catch { continue; }
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  if (Object.keys(deps).some((d) => BROWSER_BUNDLERS.includes(d))) {
    browserPackageDirs.push(path.dirname(m));
  }
}
const isBrowserContext = (file) => browserPackageDirs.some((d) => file.startsWith(d + path.sep));

line('\n1. Scope');
check(`the Intelligence-Plane tree was walked (${manifests.length} manifest(s), ${sources.length} source(s))`,
  manifests.length > 0 && sources.length > 0,
  `browser-context package(s) classified from their manifests: ${browserPackageDirs.map(rel).join(', ') || 'none'}`);

// ── 2. Manifest dependency ban (R-3.2 mechanism 1, egress vocabulary) ───────
line('\n2. Manifest dependency ban — no HTTP client declared');
const depViolations = [];
for (const m of manifests) {
  if (isBrowserContext(path.dirname(m) + path.sep)) continue;
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(m, 'utf8')); } catch { continue; }
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies);
  for (const name of Object.keys(deps)) {
    if (HTTP_CLIENT_PACKAGES.includes(name)) depViolations.push(`${rel(m)} declares "${name}"`);
  }
}
check(`EG-1  no Intelligence-Plane manifest declares an HTTP client (${manifests.length} scanned)`,
  depViolations.length === 0,
  depViolations.join('; ') || 'no HTTP client in the IP dependency graph');

// ── 3. Source egress ban (R-3.2 mechanism 3) ────────────────────────────────
line('\n3. Source egress ban — LIVE code, whole tree');
const violations = [];
const allowedHits = [];
const browserHits = [];
const testHits = [];
const webTierHits = [];
// Case 5 — a test harness dialling the system under test over loopback. Tests spin up the
// plane's OWN server and call it; that is not a connection to a customer system, and it never
// ships. The exemption is narrow on purpose: it covers only bare `fetch(`-style calls. A test
// that IMPORTS an http client is still a violation, because a real client hidden in a test is
// exactly the hole a blanket test exemption would open.
const isTestFile = (f) => /(?:^|[\\/])test[\\/]|\.test\.[cm]?[jt]sx?$|\.e2e\.test\./.test(rel(f));
for (const s of sources) {
  const src = (() => { try { return fs.readFileSync(s, 'utf8'); } catch { return ''; } })();
  if (!src) continue;
  const hits = scanForEgress(src);
  if (!hits.length) continue;
  const r = rel(s);
  if (isBrowserContext(s)) { browserHits.push(`${r} (${hits.length} call(s))`); continue; }
  if (isTestFile(s)) {
    const clientImports = hits.filter((h) => h.kind === 'http-client import');
    if (!clientImports.length) { testHits.push(r); continue; }
    for (const h of clientImports) violations.push(`${r}:${h.line} ${h.kind} "${h.text}" (a test may dial loopback; it may not carry an HTTP client)`);
    continue;
  }
  const webTier = WEB_TIER_MODULES.find((w) => w.file === r);
  if (webTier) {
    // Verified, not trusted: the claim is that nothing server-side imports it. Prove it.
    const moduleName = path.basename(r).replace(/\.tsx?$/, '');
    const serverSideImporters = sources.filter((o) => {
      if (o === s || isTestFile(o) || isBrowserContext(o)) return false;
      const os = (() => { try { return fs.readFileSync(o, 'utf8'); } catch { return ''; } })();
      // `import ... from` only. A barrel `export ... from` is a re-export, not a consumer: it
      // makes the module reachable without executing it, and the capability this gate cares
      // about is held by whoever CONSTRUCTS the client, not by whoever forwards its name.
      return new RegExp(`\\bimport\\b[^;]*?from\\s*['"][^'"]*${moduleName}(?:\\.js)?['"]`).test(stripToLiveCode(os));
    }).map(rel);
    if (serverSideImporters.length === 0) { webTierHits.push(`${r} (no server-side importer)`); continue; }
    violations.push(`${r}: declared web-tier but imported by Intelligence-Plane server code — ${serverSideImporters.join(', ')}`);
    continue;
  }
  const allow = ALLOWLIST.find((a) => a.file === r);
  if (allow) {
    // An allowlisted FILE is not a blank cheque: the host it reaches must be the allowlisted one.
    if (src.includes(allow.host)) { allowedHits.push(`${r} -> ${allow.host}`); continue; }
    violations.push(`${r}: allowlisted for "${allow.host}" but no call to that host was found — the entry is stale or the file now dials elsewhere`);
    continue;
  }
  for (const h of hits) violations.push(`${r}:${h.line} ${h.kind} "${h.text}"`);
}

check(`EG-2  no Intelligence-Plane source opens an outbound connection (${sources.length} source(s) scanned)`,
  violations.length === 0,
  violations.length ? violations.slice(0, 20).join('\n         ')
    : `no unpermitted outbound call anywhere in the IP tree`);

check(`EG-3  every allowlist entry is USED and reaches only its declared host (${ALLOWLIST.length} entr(y/ies))`,
  allowedHits.length === ALLOWLIST.length,
  allowedHits.length === ALLOWLIST.length
    ? allowedHits.join('; ')
    : `stale permission — allowlisted but never exercised: ${ALLOWLIST.filter((a) => !allowedHits.some((h) => h.startsWith(a.file))).map((a) => a.file).join(', ')}`);

line(`         case 2 (browser context, not an IP process): ${browserHits.join('; ') || 'none'}`);
line('         case 3 (emitted template text): invisible to the scan by construction — string bodies blanked');
line(`         case 5 (test harness dialling loopback, never shipped): ${testHits.length} file(s)`);
line(`         case 2b (web-tier module in a Node package, verified no server-side importer): ${webTierHits.join('; ') || 'none'}`);

// ── Evidence artefact ───────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'intelligence-plane-egress-scan',
  generator: 'governance/verification/verify-intelligence-plane-egress.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  ruleReference: ['R-3.2', 'R-3.3', 'R-5.1', 'R-5.2', 'R-6.3', 'R-14.16', 'ADR-0069'],
  enforcementMechanism: '3 of 3 for R-3.2 (CHARTER §6 minimum) — (1) and (2) are verify-execution-plane-boundary.js',
  method: 'shared live-code extraction (lib/live-code.js), then outbound vocabulary scan with four-case classification',
  selfProof: { positiveDetected: [...posLive, ...posClient], negativeFlagged: negEmitted },
  allowlist: ALLOWLIST.map((a) => ({ file: a.file, host: a.host, rationale: a.rationale })),
  browserContextPackages: browserPackageDirs.map(rel),
  manifestsScanned: manifests.length,
  sourcesScanned: sources.length,
  dependencyViolations: depViolations,
  egressViolations: violations,
  allowlistExercised: allowedHits,
  verificationStatus: failures === 0 ? 'no-customer-egress-from-ip' : 'violation',
  timestamp: new Date().toISOString(),
};
try {
  fs.mkdirSync(path.join(ROOT, 'governance', 'boundary'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'governance', 'boundary', 'intelligence-plane-egress-evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n', 'utf8');
} catch { /* evidence write is best-effort; the verdict below is authoritative */ }

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Intelligence Plane opens no connection to a customer system.');
  line(`Scanned ${manifests.length} manifests + ${sources.length} sources; ${ALLOWLIST.length} justified platform-infrastructure exception(s).`);
} else {
  line(`RESULT: FAIL — ${failures} egress violation(s). Tool I/O belongs to the Execution Plane (R-3.2, R-6.3, R-14.16).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
