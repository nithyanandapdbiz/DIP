'use strict';
/**
 * GOVERNANCE — AI tool agnosticism (INV-9, Rule 12).
 * ============================================================================
 * The platform specifies AI by CAPABILITY CLASS, never by product. A vendor,
 * model or tool name in a governed document converts an implementation tool
 * into a governance dependency — and unlike a vendor name in runtime code,
 * nothing else in the estate would ever notice.
 *
 * This is the reason the rule ships with a gate rather than as prose. The
 * predecessor's strongest empirical finding was that rules enforced by prose
 * alone always drifted (D-020); a vendor-neutrality principle stated only in
 * prose would drift exactly the same way, and silently.
 *
 * Properties enforced on every commit:
 *
 *   1. No AI vendor, model or tool name appears in a governed document
 *      outside the five permitted contexts (R-12.5, C-01.33).
 *   2. No governed document cites the tool bootstrap file as the SOURCE of a
 *      rule or control. The bootstrap file originates no rule and carries no
 *      authority; citing it as one is both a vendor coupling and a precedence
 *      violation.
 *   3. Every "Capability Class" named anywhere is declared in the taxonomy
 *      owned by 13 §7 (R-13.28, C-01.34).
 *   4. No class definition in the taxonomy names a vendor (R-13.29, C-13.20).
 *
 * PERMITTED CONTEXTS (R-12.5). A vendor name is legitimate in: a provider
 * adapter implementation; configuration examples and tenant configuration
 * values; supported-provider or compatibility documentation; migration and
 * historical records; and an ADR recording a genuinely product-specific
 * decision. Those are declared below as explicit paths, or marked inline with
 *
 *     [vendor-permitted: <reason>]
 *
 * on the offending line. An exemption is deliberately visible in the diff:
 * intent cannot be inferred mechanically, so it is declared and reviewed
 * rather than guessed.
 *
 * SCOPE. This repository only. The Execution Plane is a separate repository
 * with its own history and runs its own copy — a check that reached across the
 * plane boundary would itself be a sovereignty violation.
 *
 * Read-only. No writes, no network.
 *
 * Run:  node governance/verification/verify-ai-vendor-neutrality.js
 * Exit: 0 = all properties hold   1 = at least one violation
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ARCH = path.join(ROOT, 'docs', 'architecture');

// Governed scope: documents that carry architectural or governance authority.
const GOVERNED_DIRS = [
  path.join(ROOT, 'docs', 'architecture'),
  path.join(ROOT, 'docs', 'adr'),
  path.join(ROOT, 'docs', 'certification'),
  path.join(ROOT, 'program'),
  path.join(ROOT, 'governance'),
];
const GOVERNED_ROOT_FILES = [path.join(ROOT, 'README.md')];

// Paths where vendor names are legitimate by construction (R-12.5). Empty until
// adapters and configuration examples exist — declared here so the boundary is
// visible now rather than invented under deadline later.
const PERMITTED_PATHS = [
  // e.g. 'src/adapters/', 'docs/compatibility/', 'config/examples/'
];

// The tool bootstrap file's NAME is vendor-derived. The file is unversioned,
// originates no rule and carries no authority, so naming it is an
// implementation-specific reference (permitted context 5) — NOT a requirement
// on a vendor. Property 2 below enforces the distinction that actually matters:
// naming the file is fine; citing it as the source of a rule is not.
const BOOTSTRAP_FILENAME = 'CLAUDE.md';

const VENDOR_PATTERNS = [
  /\bclaude\b/i, /\banthropic\b/i, /\bopus\b/i, /\bsonnet\b/i, /\bhaiku\b/i,
  /\bgpt-?\d*\b/i, /\bchatgpt\b/i, /\bopenai\b/i, /\bgemini\b/i, /\bcopilot\b/i,
  /\bcursor\b/i, /\bcodex\b/i, /\bllama\b/i, /\bmistral\b/i, /\bbedrock\b/i,
  /\bvertex ?ai\b/i, /\bazure openai\b/i, /\bgrok\b/i, /\bdeepseek\b/i,
];

const EXEMPT_MARKER = /\[vendor-permitted:[^\]]*\]/i;

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(md|js|ts|json)$/.test(e.name) ? [full] : [];
  });
};

const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const isPermittedPath = (f) => PERMITTED_PATHS.some((p) => rel(f).startsWith(p));

line('');
line('GOVERNANCE — AI tool agnosticism (INV-9, Rule 12)');
line('='.repeat(74));

const files = [...GOVERNED_DIRS.flatMap(walk), ...GOVERNED_ROOT_FILES.filter(fs.existsSync)]
  // This check names vendors in order to detect them; scanning itself would be
  // a guaranteed self-report.
  .filter((f) => path.basename(f) !== path.basename(__filename));

line(`\n1. Governed scope (${files.length} files)`);
line(`   docs/architecture, docs/adr, docs/certification, program, governance, README.md`);
line(`   permitted-path allow-list: ${PERMITTED_PATHS.length ? PERMITTED_PATHS.join(', ') : '(none declared yet)'}`);

// ── 2. No vendor name in a governed document ────────────────────────────────
line('\n2. Vendor names in governed documents');
const violations = [];
let exempted = 0;
let bootstrapMentions = 0;

for (const f of files) {
  if (isPermittedPath(f)) continue;
  const src = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  src.forEach((text, i) => {
    if (!VENDOR_PATTERNS.some((p) => p.test(text))) return;
    if (EXEMPT_MARKER.test(text)) { exempted++; return; }
    // Strip bare references to the bootstrap filename, then re-test: a line
    // whose ONLY vendor token is that filename is a permitted reference.
    const stripped = text.split(BOOTSTRAP_FILENAME).join('<bootstrap-file>');
    if (!VENDOR_PATTERNS.some((p) => p.test(stripped))) { bootstrapMentions++; return; }
    violations.push(`${rel(f)}:${i + 1}  ${text.trim().slice(0, 96)}`);
  });
}

check('no AI vendor, model or tool name appears outside a permitted context',
  violations.length === 0,
  violations.length
    ? violations.slice(0, 12).join('\n         ') + (violations.length > 12 ? `\n         ...and ${violations.length - 12} more` : '')
    : `clean — ${exempted} inline exemption(s), ${bootstrapMentions} bootstrap-file reference(s)`);

// ── 3. The bootstrap file is never cited as the source of a rule ────────────
line('\n3. Rule citations');
// "CLAUDE.md §5" or "CLAUDE.md section 5" asserts the file GOVERNS something.
// It governs nothing: it is unversioned, unreviewed, and outside both repositories.
// Trailing markup (backticks, brackets, quotes) sits between the filename and
// the section marker far more often than a bare space does.
const ruleCitation = new RegExp(`${BOOTSTRAP_FILENAME.replace('.', '\\.')}[\`'"\\)\\]]*\\s*(?:§|section\\b)`, 'i');
const citations = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  src.forEach((text, i) => {
    if (ruleCitation.test(text) && !EXEMPT_MARKER.test(text)) {
      citations.push(`${rel(f)}:${i + 1}  ${text.trim().slice(0, 96)}`);
    }
  });
}
check('no governed document cites the tool bootstrap file as the source of a rule',
  citations.length === 0,
  citations.join('\n         ') || 'rules are cited from versioned, reviewable documents');

// ── 4. Declared capability classes ──────────────────────────────────────────
line('\n4. AI Capability Class taxonomy');
const aiDoc = path.join(ARCH, '13-ai-operating-model.md');
let declared = new Set();
if (fs.existsSync(aiDoc)) {
  const src = fs.readFileSync(aiDoc, 'utf8');
  const section = src.split(/^## \d+\. AI Capability Classes/m)[1] || '';
  const table = section.split(/^### How a class binds/m)[0] || '';
  for (const m of table.matchAll(/^\|\s*\*\*([^*|]+)\*\*\s*\|/gm)) declared.add(m[1].trim());
}
check('the taxonomy declares at least one class', declared.size > 0,
  declared.size ? `${declared.size} declared: ${[...declared].join(', ')}` : 'taxonomy not found in 13 §7');

// Every "<Name> Capability Class" used anywhere must be declared.
// Scanned line by line so the exemption marker applies here exactly as it does
// above — a fault-injection record naming a deliberately bogus class is a
// historical record, not a requirement.
const undeclared = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  src.forEach((text, i) => {
    if (EXEMPT_MARKER.test(text)) return;
    for (const m of text.matchAll(/\b([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,2})\s+Capability Class(?:es)?\b/g)) {
      const name = m[1].trim();
      if (name === 'AI' || name === 'The' || name === 'A') continue;   // the term itself
      if (!declared.has(name)) undeclared.add(`${rel(f)}:${i + 1} "${name}"`);
    }
  });
}
check('every capability class named is declared in the taxonomy',
  undeclared.size === 0, [...undeclared].join('; ') || 'no undeclared class referenced');

// ── 5. The taxonomy itself is vendor-free ───────────────────────────────────
line('\n5. Taxonomy self-check');
let taxonomyClean = true;
let taxonomyDetail = 'class definitions describe capability, not product';
if (fs.existsSync(aiDoc)) {
  const src = fs.readFileSync(aiDoc, 'utf8');
  const section = (src.split(/^## \d+\. AI Capability Classes/m)[1] || '').split(/^## \d+\./m)[0];
  const hits = section.split(/\r?\n/).filter((t) => VENDOR_PATTERNS.some((p) => p.test(t)));
  if (hits.length) { taxonomyClean = false; taxonomyDetail = hits.map((h) => h.trim().slice(0, 80)).join('; '); }
}
check('no class definition names a vendor, model or product', taxonomyClean, taxonomyDetail);

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — AI is specified by capability, never by product.');
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
