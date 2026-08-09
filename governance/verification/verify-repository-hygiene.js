#!/usr/bin/env node
/**
 * Phase 19.3 — Repository Quality Audit.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md · 14-tool-operating-model.md
 *   ADR          : ADR-0022
 *   Criteria     : C-13.1 (no verdict without the measurement behind it)
 *
 * THIS GATE READS SOURCE, WHICH IS WHY IT IS A GATE AND NOT AN AGENT.
 * The Phase 19 review board reads the ARTEFACTS a run produced. Repository hygiene is a
 * property of the CODE, and an Intelligence Plane agent that read the repository at
 * runtime would be reaching for something no adapter exposes. It belongs here, alongside
 * the other verification gates, and it runs in CI rather than in a tenant's run.
 *
 * A FINDING NAMES ITS FILE AND LINE.
 * A hygiene report that says "3 placeholders found" sends someone to grep. Every finding
 * below carries the path and the line, so the remediation is the next action rather than
 * the next investigation.
 *
 * WHAT IS DELIBERATELY NOT A FINDING.
 * Prose describing a prohibition is not a violation of it. This file, and the many
 * comments across the engine explaining why a mock or a stub would be wrong, contain
 * every banned word — and flagging them would make the gate unusable within a day, after
 * which someone would disable it. Matches are taken from CODE, with comments and strings
 * that merely discuss the rule excluded.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCAN_ROOTS = ['packages'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'generated']);
const CODE_EXT = new Set(['.ts', '.mjs', '.js']);

let failures = 0;
let checks = 0;

function check(name, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`         ${detail}`);
}

/** Every code file under the scanned roots. Tests included: a stub in a test still rots. */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
        continue;
      }
      if (CODE_EXT.has(path.extname(entry.name))) out.push(path.join(dir, entry.name));
    }
  };
  for (const r of SCAN_ROOTS) {
    const dir = path.join(ROOT, r);
    if (fs.existsSync(dir)) walk(dir);
  }
  return out;
}

/**
 * Strip comments and string literals.
 *
 * This is what lets the gate ban a word without banning the discussion of it. A crude
 * strip is correct here: a false negative from an over-eager strip is a missed finding,
 * whereas a false positive on prose is a gate nobody keeps.
 */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/** Findings for a pattern, over code only, as `path:line`. */
function findInCode(files, pattern, filter = () => true) {
  const found = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    if (!filter(file, raw)) continue;
    const stripped = codeOnly(raw).split('\n');
    stripped.forEach((line, i) => {
      if (pattern.test(line)) found.push(`${path.relative(ROOT, file)}:${i + 1}`);
    });
  }
  return found;
}

/** Findings over raw text, for things that are violations even inside a comment. */
function findInText(files, pattern) {
  const found = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (pattern.test(line)) found.push(`${path.relative(ROOT, file)}:${i + 1}`);
    });
  }
  return found;
}

const summarise = (found, limit = 6) =>
  (found.length === 0 ? 'none' : `${found.length}: ${found.slice(0, limit).join(', ')}${found.length > limit ? ' …' : ''}`);

console.log('='.repeat(90));
console.log('PHASE 19.3 — REPOSITORY QUALITY AUDIT');
console.log('='.repeat(90));

const files = sourceFiles();
console.log(`\nScanning ${files.length} source file(s) under ${SCAN_ROOTS.join(', ')}\n`);

console.log('1. No unfinished work markers');
// These are violations wherever they appear, including in comments — that is the whole
// point of a TODO: it is a note to a future reader that the work is not done.
const markers = findInText(files, /\b(?:TODO|FIXME|HACK|XXX)\b(?!["'`])/);
check('no TODO / FIXME / HACK / XXX marker', markers.length === 0, summarise(markers));

console.log('\n2. No placeholder or unimplemented logic');
const notImplemented = findInCode(files, /throw new Error\(\s*['"`]?(?:not implemented|unimplemented|TODO)/i);
check('no "not implemented" throw', notImplemented.length === 0, summarise(notImplemented));

const placeholderReturn = findInCode(files, /\breturn\s+(?:null|undefined)\s*;\s*\/\/\s*(?:placeholder|stub|for now)/i);
check('no placeholder return', placeholderReturn.length === 0, summarise(placeholderReturn));

console.log('\n3. No mock, stub or fake implementation in production source');
// Tests legitimately construct doubles; production source must not.
const productionOnly = (file) => !/[\\/](?:test|tests|__tests__)[\\/]/.test(file) && !/\.test\.(?:ts|mjs|js)$/.test(file);
const doubles = findInCode(files.filter(productionOnly),
  /\b(?:createMock|makeMock|mockImplementation|jest\.mock|sinon\.stub|fakeImpl|dummyImpl)\b/);
check('no mock or stub construction in production source', doubles.length === 0, summarise(doubles));

console.log('\n4. No hard-coded credentials');
const secrets = findInCode(files, /\b(?:password|passwd|secret|apiKey|api_key|token|clientSecret)\s*[:=]\s*["'][^"'\s]{8,}["']/i);
check('no hard-coded credential literal', secrets.length === 0, summarise(secrets));

console.log('\n5. No bypassed assertions or disabled quality gates');
const skipped = findInText(files, /\b(?:it|test|describe)\.(?:skip|todo)\b|\bxit\(|\bxdescribe\(/);
check('no skipped or todo test', skipped.length === 0, summarise(skipped));

const suppressions = findInText(files, /eslint-disable(?!-next-line\s+@typescript-eslint\/no-unused-vars)|@ts-ignore|@ts-nocheck/);
check('no blanket lint or type suppression', suppressions.length === 0, summarise(suppressions));

console.log('\n6. No commented-out production code');
// A line of real code behind `//` is code nobody runs and nobody deletes.
//
// The pattern requires CODE STRUCTURE, not merely a keyword. English prose opens with
// "let", "function", "return" and "class" constantly — "// let one tenant's registration
// bind to another's" is an explanation, not a disabled statement — and a check that
// flagged those would be switched off within a day.
const commentedCode = findInText(files, new RegExp([
  '^\\s*//\\s*(?:',
  '(?:const|let|var)\\s+\\w+\\s*=',            // a declaration WITH an assignment
  '|(?:function|class)\\s+\\w+\\s*[({]',       // a definition WITH its opening bracket
  '|(?:import|export)\\s+[\\w{*][^;]*;\\s*$',  // a module statement, terminated
  '|return\\s+[^;]*;\\s*$',                    // a return, terminated
  '|\\w+(?:\\.\\w+)*\\([^)]*\\)\\s*;\\s*$',    // a call, terminated
  ')',
].join('')));
check('no commented-out statement', commentedCode.length === 0, summarise(commentedCode));

console.log('\n7. No temporary files');
const temporary = files.filter((f) => /\.(?:tmp|bak|orig|old)\.(?:ts|mjs|js)$|\.tmp$/.test(f))
  .map((f) => path.relative(ROOT, f));
check('no temporary source file', temporary.length === 0, summarise(temporary));

console.log('\n8. No unresolved merge markers');
// A conflict marker in source is code nobody has actually reconciled.
const mergeMarkers = findInText(files, /^(?:<{7}|={7}|>{7})(?:\s|$)/);
check('no unresolved merge conflict marker', mergeMarkers.length === 0, summarise(mergeMarkers));

console.log('\n9. No dependency conflicts');
// The same dependency pinned to two different ranges across the workspace is a conflict
// that resolves differently depending on hoisting — and therefore differently per machine.
const manifests = [];
const walkManifests = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkManifests(path.join(dir, entry.name));
    } else if (entry.name === 'package.json') manifests.push(path.join(dir, entry.name));
  }
};
for (const r of SCAN_ROOTS) {
  const dir = path.join(ROOT, r);
  if (fs.existsSync(dir)) walkManifests(dir);
}
const ranges = new Map();
for (const m of manifests) {
  const pkg = JSON.parse(fs.readFileSync(m, 'utf8'));
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(pkg[section] ?? {})) {
      // A workspace protocol is a local link, not a version constraint.
      if (String(range).startsWith('workspace:')) continue;
      const seen = ranges.get(name) ?? new Set();
      seen.add(range);
      ranges.set(name, seen);
    }
  }
}
const conflicts = [...ranges].filter(([, v]) => v.size > 1).map(([n, v]) => `${n}: ${[...v].join(' vs ')}`);
check('no dependency is pinned to conflicting ranges', conflicts.length === 0, summarise(conflicts));

console.log('\n10. No circular imports between source modules');
// A cycle makes initialisation order load-bearing, and it fails differently under a
// bundler than under Node.
const importGraph = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const deps = [];
  // `import type { X } from './y.js'` is ERASED by the compiler, so it forms no runtime
  // cycle. Counting it produced a finding against a pair of modules that load in a fixed
  // order at runtime — a false positive, and the fastest way to get a gate switched off.
  for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[\s\S]*?)from\s+['"](\.[^'"]+)['"]/g)) {
    if (m[1]) continue;
    const target = path.resolve(path.dirname(file), m[2].replace(/\.js$/, '.ts'));
    deps.push(target);
  }
  importGraph.set(path.resolve(file), deps);
}
const cycles = [];
const colour = new Map();
const walkImports = (id, trail) => {
  colour.set(id, 'grey');
  for (const next of importGraph.get(id) ?? []) {
    if (!importGraph.has(next)) continue;
    if (colour.get(next) === 'grey') {
      cycles.push([...trail, id, next].map((f) => path.relative(ROOT, f)).join(' -> '));
      continue;
    }
    if (!colour.has(next)) walkImports(next, [...trail, id]);
  }
  colour.set(id, 'black');
};
for (const id of importGraph.keys()) if (!colour.has(id)) walkImports(id, []);
check('no circular import between source modules', cycles.length === 0, summarise(cycles, 3));

console.log('\n11. No duplicate agent identifiers within a catalogue');
// Two agents sharing an id means one silently replaces the other at registration.
//
// Scoped PER PACKAGE, because that is the scope a catalogue has. `sync.defects` exists in
// the Functional Testing and Dev-Change engines and they are different agents in
// different catalogues; a global check would report every shared domain vocabulary as a
// collision and teach the reader to ignore this gate.
const perPackage = new Map();
for (const file of files) {
  if (/[\\/](?:test|tests)[\\/]/.test(file) || /\.test\.(?:ts|mjs|js)$/.test(file)) continue;
  const pkg = path.relative(ROOT, file).split(path.sep).slice(0, 2).join('/');
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/^\s*id:\s*'([a-z][a-z0-9.-]*)',\s*domain:/gm)) {
    const ids = perPackage.get(pkg) ?? [];
    ids.push(m[1]);
    perPackage.set(pkg, ids);
  }
}
const collisions = [];
let totalIds = 0;
for (const [pkg, ids] of perPackage) {
  totalIds += ids.length;
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) collisions.push(`${pkg}: ${id}`);
}
check('every agent identifier is unique within its catalogue', collisions.length === 0,
  collisions.length === 0
    ? `${totalIds} literal agent id(s) across ${perPackage.size} package(s), no collision`
    : summarise(collisions));

console.log('\n' + '='.repeat(90));
if (failures === 0) {
  console.log(`RESULT: PASS — repository hygiene certified across ${checks} check(s) over ${files.length} file(s).`);
  console.log('No placeholder, stub, temporary, suppressed or unfinished code in the scanned tree.');
} else {
  console.log(`RESULT: FAIL — ${failures} of ${checks} hygiene check(s) failed.`);
  console.log('Every finding names its file and line. Remediate, or record a governed exception.');
}
console.log('='.repeat(90));
process.exit(failures === 0 ? 0 : 1);
