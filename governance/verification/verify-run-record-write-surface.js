'use strict';
/**
 * GOVERNANCE — the run record store's WRITE SURFACE and its permitted callers (ADR-0082 P-82.9).
 * ============================================================================
 * P-82.3 IS A RULE ABOUT CAUSATION, AND UNTIL THIS GATE IT HAD NO MECHANISM.
 *
 * The run/evidence store must record TWO causes — a package was authored, evidence arrived — and
 * nothing else. The danger is not a badly-named method; it is a THIRD CAUSE entering through an
 * existing one. A field added "for diagnostics" recording when a package was FETCHED converts this
 * store into the delivery record P-70.3 removed, **without failing a single test**, because a
 * delivery record and an evidence record have the same shape and differ only in WHAT CAUSES A WRITE.
 *
 * So the write surface is enumerated in source (two methods, each named for its cause) and the
 * PERMITTED CALLER SET of each is enumerated here.
 *
 * ── A CENSUS, NEVER A COUNT (CHARTER §17.1(i)) ──────────────────────────────────────────────
 *
 * This gate does NOT assert "there are 2 call sites". A gate whose passing condition is a literal
 * number must be EDITED whenever legitimate structure changes, and a gate people edit to make green
 * is a gate people edit to make green. **The count is also not the property:** two call sites into a
 * general `record()` would be worse than five into `onEvidenceArrived`, because the first tells you
 * nothing about what caused any of them.
 *
 * What is asserted is the SET: every module that writes must be one this ADR permits, and every
 * module this ADR permits must still write. **Both directions**, because an unexpected caller is a
 * new cause and a vanished caller is a store nothing feeds.
 *
 * ── WHY NOT A MODULE-PRIVATE BRAND, WHICH WOULD BE STRONGER ─────────────────────────────────
 *
 * `stages.ts` makes a value unconstructible outside its module with a module-private symbol — the
 * strongest mechanism in this platform. **It does not survive the package boundary.** The store is
 * in `@dbiz/platform-providers` and both permitted callers are in other packages, so a token they
 * can mint must be exported, and once exported any module can import the minting function. It would
 * look like enforcement and be a naming convention. P-82.9 names this and rules it out; this gate is
 * what replaces it.
 *
 * TESTS ARE EXCLUDED BY DECLARATION, not by accident: a test suite must be able to drive both write
 * methods directly, and excluding `test/` here is stated rather than achieved by a path that happens
 * not to match.
 *
 * Run:  node governance/verification/verify-run-record-write-surface.js
 * Exit: 0 = the surface and its callers are as ADR-0082 permits   1 = they are not
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PKG = path.join(ROOT, 'packages');
const STORE_SRC = path.join(PKG, 'platform-providers', 'src', 'storage', 'run-record-store.ts');

/**
 * THE WRITE SURFACE, AND THE MODULES ADR-0082 PERMITS TO DRIVE EACH EVENT.
 *
 * Paths are repo-relative and exact. A wildcard here would let a whole directory become a permitted
 * caller, which is the enumeration dissolving into a pattern.
 */
const WRITE_SURFACE = [
  {
    method: 'onPackageAuthored',
    cause: 'a package was authored (P-82.1)',
    permitted: ['packages/tenant-onboarding-engine/src/engine/sealed-package-writer.ts'],
  },
  {
    method: 'onEvidenceArrived',
    cause: 'evidence arrived (P-82.2)',
    permitted: ['packages/tenant-onboarding-engine/src/engine/evidence-ingress.ts'],
  },
];

/** Method names that would let a third cause in without a third method. */
const FORBIDDEN_GENERAL_WRITES = ['record', 'save', 'put', 'write', 'store', 'log'];

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

/** Every production `.ts` under packages/, excluding tests and build output — declared, not implied. */
function productionSources() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'test' || e.name === '.vite') continue;
        walk(full);
      } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !e.name.includes('.test.')) {
        out.push(full);
      }
    }
  };
  walk(PKG);
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/**
 * CODE WITH ITS COMMENTS REMOVED — and this is load-bearing, not tidiness.
 *
 * The first run of this gate went RED on its own subject's DOCUMENTATION: `run-record-store.ts`
 * explains, in prose, that a `kind: 'fetch'` field would be "a third event wearing a field's
 * clothes", and the scan matched the explanation. **A gate that reads comments measures what a file
 * SAYS, not what it DOES** — and in this platform, where the reasoning is written at the site and is
 * often longer than the code, that is a large surface to be wrong over. It fails in both directions:
 * a warning about a forbidden construct reads as the construct, and a construct discussed in a
 * comment could equally mask a real one.
 */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

line('');
line('GOVERNANCE — run record write surface and permitted callers (ADR-0082 P-82.9)');
line('='.repeat(78));

// ── 1. The subject exists ───────────────────────────────────────────────────
//
// FAIL CLOSED. A caller census over a store that is not there would pass with an empty set for
// every method — CHARTER §17.1.1's control-shaped literal, in the gate written to prevent it.
line('\n1. The subject');
const storeExists = fs.existsSync(STORE_SRC);
check('the run record store source is present',
  storeExists,
  storeExists ? rel(STORE_SRC) : `ABSENT: ${rel(STORE_SRC)} — every property below would pass vacuously`);

if (!storeExists) {
  line(`\n${'='.repeat(78)}`);
  line('RESULT: FAIL — the subject is absent; nothing was measured.');
  process.exit(1);
}

const storeText = code(fs.readFileSync(STORE_SRC, 'utf8'));

// ── 2. The surface enumerates its events ────────────────────────────────────
line('\n2. The write surface is enumerated, and named for its causes');
for (const { method, cause } of WRITE_SURFACE) {
  check(`\`${method}\` exists — ${cause}`,
    new RegExp(`async\\s+${method}\\s*\\(`).test(storeText),
    `declared in ${rel(STORE_SRC)}`);
}

// A general write is the move P-82.9 exists to stop: it lets a third cause enter an existing method.
for (const name of FORBIDDEN_GENERAL_WRITES) {
  const found = new RegExp(`\\n\\s{2}(async\\s+)?${name}\\s*\\(`).test(storeText);
  check(`no general \`${name}()\` on the store`,
    !found,
    found ? `a general ${name}() admits a third cause without a third method` : 'none');
}

// An options bag carrying a discriminator is a third event wearing a field's clothes.
const discriminator = /kind\s*[?:]\s*['"](fetch|delivery|retrieval)['"]/.test(storeText);
check('no event discriminator field on the write path',
  !discriminator,
  discriminator ? "a `kind: 'fetch'` field is a third event wearing a field's clothes" : 'none');

// ── 3. The permitted-caller census, in BOTH directions ──────────────────────
line('\n3. The permitted-caller census — the SET, not the count');

const sources = productionSources();
for (const { method, permitted } of WRITE_SURFACE) {
  const callers = sources
    .filter((f) => f !== STORE_SRC)
    .filter((f) => new RegExp(`\\.${method}\\s*\\(`).test(fs.readFileSync(f, 'utf8')))
    .map(rel)
    .sort();

  // (a) NO UNPERMITTED CALLER. A module writing here that this ADR does not name is a new cause,
  //     and the gate names the module and the method so the finding is actionable without a search.
  const unpermitted = callers.filter((c) => !permitted.includes(c));
  check(`every caller of \`${method}\` is permitted by ADR-0082`,
    unpermitted.length === 0,
    unpermitted.length === 0
      ? `${callers.length} permitted caller(s): ${callers.join(', ') || 'none'}`
      : unpermitted.map((c) => `${c} calls .${method}() and is not a permitted caller`).join('; '));

  // (b) AND EVERY PERMITTED CALLER STILL CALLS. A declared caller that has stopped writing is a
  //     store nothing feeds — the D-122 shape, where the sealed package store had a writer with
  //     zero non-test callers and looked wired for as long as nobody asked.
  const missing = permitted.filter((p) => !callers.includes(p));
  check(`every module ADR-0082 permits still drives \`${method}\``,
    missing.length === 0,
    missing.length === 0
      ? 'all permitted callers present'
      : missing.map((m) => `${m} is declared a caller of .${method}() and no longer calls it`).join('; '));
}

line(`\n${'='.repeat(78)}`);
if (failures > 0) {
  line(`RESULT: FAIL — ${failures} write-surface property violated.`);
  line('The write surface is the mechanism P-82.3 has instead of a rule nobody can enforce.');
  process.exit(1);
}
line('RESULT: PASS — two events, two permitted caller sets, and no general write.');
process.exit(0);
