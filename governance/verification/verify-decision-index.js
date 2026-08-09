#!/usr/bin/env node
'use strict';
/**
 * GOVERNANCE — the decision index is DERIVED, not maintained.
 * ============================================================================
 * `program/DECISIONS.md` §5 is the ADR index (CHARTER §2 item 8). Nothing measured it,
 * and it had failed in BOTH directions:
 *
 *   D-107 — three rows carried a STALE STATUS: `ACCEPTED` on disk, `PROPOSED` in the
 *           index, with ADR-0070 among them while two accepted children discharged it.
 *   D-126 — EIGHT ADRs had NO ROW AT ALL, including ADR-0080, accepted the same day and
 *           the subject of an open ruling.
 *
 * ── WHY THREE GATES RAN OVER THE ADR ESTATE AND NONE OVER THE INDEX ─────────────────
 *
 * `verify-adr-completeness` reads the FILES. `verify-programme-closure` compares DISK to
 * the BASELINE. And `verify-change-control-completeness`'s connectivity property scans
 * `program/` WHOLESALE — so being mentioned once in any state file is indistinguishable
 * from being named by the index.
 *
 * That wholesale scan is CORRECT and is not reverted. Its own header records why: the
 * narrow, hand-listed version omitted `DECISIONS.md` itself and reported five connected
 * ADRs as orphans, and "a check that cries wolf trains reviewers to ignore it". **This
 * file is the sibling property that widening traded away** — the third pre-landing check
 * in `TECHNICAL_DEBT.md`: a widened check states what it stopped seeing, and what it
 * stopped seeing is owed as its own property.
 *
 * ── ABSENCE IS THE HARDER DIRECTION, WHICH IS WHY PROPERTY 1 IS FIRST ───────────────
 *
 * A stale row is a wrong value: it exists, it can be diffed, a reader can doubt it. A
 * MISSING row cannot be stale, cannot be diffed, and produces no output at all. Under
 * CHARTER §17.1.1 every property over the estate is satisfied MORE EASILY when a row is
 * absent — so absence is checked first and by enumeration from disk, never from the index.
 *
 * ── THE STATUS ACCESSOR: AN UNPARSEABLE STATUS IS AN ERROR, NEVER A VALUE ───────────
 *
 * D-107 (ii) is the reason `statusOf` throws rather than defaulting. The closure emitter's
 * own reader defaults to `'UNKNOWN'` and writes that into a frozen register — 31 of 71
 * decisions recorded as nothing or a single letter, every gate green over it. A reader
 * whose failure value is legal cannot fail, and a reader that cannot fail is worse than
 * no reader.
 *
 * **SCOPE, STATED SO IT IS NOT MISTAKEN FOR THE WHOLE REPAIR.** D-107's full repair is ONE
 * canonical accessor used by BOTH this check and `emit-closure-package.mjs`. The emitter is
 * NOT converted here: it is the closure emitter, so it lands with its own fault proof, and
 * folding it into this change is the scope error D-087 counts. `statusOf` below is that
 * accessor, exported for the emitter to adopt. **Until it does, the emitter's `UNKNOWN`
 * default stands and D-107 stays open** — recorded rather than implied closed.
 *
 * TRACEABILITY
 *   Charter  : §2 item 8 (the index) · §17.1.1 (subject removal) · §18 (this gate's proof)
 *   Rules    : R-13.1 (no hand-authored status) · R-18.13
 *   Debt     : D-107 (stale status) · D-126 (absent rows) · D-116 (decision traceability)
 *
 * Read-only.
 *
 * Run:  node governance/verification/verify-decision-index.js
 * Exit: 0 = the index agrees with disk   1 = at least one violation
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ADR_DIR = path.join(ROOT, 'docs', 'adr');
const INDEX = path.join(ROOT, 'program', 'DECISIONS.md');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

/**
 * THE CANONICAL STATUS ACCESSOR. An unparseable status THROWS — it is never a value.
 *
 * Accepts the three spellings that exist on disk and normalises them:
 *   `**Status:** ACCEPTED`      the parseable form
 *   `**Status:** **ACCEPTED**`  bold-wrapped — the emitter's regex yields UNKNOWN
 *   `**Status:** Accepted`      title case — the emitter's regex yields "A"
 *
 * Normalising here is deliberate and is NOT the same as tolerating: every spelling maps to
 * exactly one status or the read fails. What the emitter does is different in kind — it
 * emits a legal placeholder for an input it could not read.
 */
const KNOWN_STATUSES = ['ACCEPTED', 'PROPOSED', 'SUPERSEDED', 'REJECTED', 'DEPRECATED'];

function statusOf(adrFile, src) {
  // The status token is the FIRST word after the label, with optional bold wrapping.
  // Everything after it on the line — an em-dash, a date, a sign-off note, a §6 condition —
  // is prose and is deliberately not parsed. The four spellings on disk are:
  //   `**Status:** ACCEPTED`  ·  `**Status:** **ACCEPTED**`
  //   `**Status:** Accepted`  ·  `**Status:** **ACCEPTED** — 2026-07-23 (sign-off…)`
  const m = /\*\*Status:\*\*\s*\**\s*([A-Za-z]+)/.exec(src);
  if (!m) throw new Error(`${adrFile}: no readable **Status:** line`);
  const status = m[1].trim().toUpperCase();
  if (!KNOWN_STATUSES.includes(status)) {
    throw new Error(`${adrFile}: unrecognised status "${m[1].trim()}" (known: ${KNOWN_STATUSES.join(', ')})`);
  }
  return status;
}

line('');
line('GOVERNANCE — decision index derived from the ADR files');
line('='.repeat(74));

const adrs = fs.existsSync(ADR_DIR)
  ? fs.readdirSync(ADR_DIR).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)).sort()
  : [];
const indexSrc = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';

/**
 * §5 IS THE INDEX. THE REST OF THE FILE IS NOT, AND THE DIFFERENCE IS LOAD-BEARING.
 *
 * `DECISIONS.md` also carries §4 *Open decisions*, whose rows name the ADR that closed
 * them — so a whole-file search finds `| AD-033 | … | **CLOSED — ADR-0016** |` and reads
 * it as ADR-0016's index row. Four ADRs were reported as declaring no status for exactly
 * that reason. **The subject is §5's table; scoping to it is not an optimisation.**
 */
function indexSection(src) {
  // `\Z` IS NOT A JAVASCRIPT ESCAPE. It is valid in Perl and Python and means end-of-input;
  // in JS it silently means the LITERAL LETTER Z. The first version of this function ended
  // the section at the first `Z` in the text — a timestamp's trailing `Z` — and returned
  // 24,007 of 95,518 characters. **It still matched, still parsed, and still produced rows**,
  // so three ADRs were reported as declaring no status when the truncation had cut their row
  // in half. A regex that degrades instead of erroring is the same class as a reader whose
  // failure value is legal (D-107), and it is recorded here because it was found by the
  // gate's own output disagreeing with a hand check, not by anything failing.
  const m = /^##\s*5\.\s*ADR index\s*$([\s\S]*?)(?=^##\s*\d+\.\s|$(?![\s\S]))/m.exec(src);
  return m ? m[1] : '';
}
const indexBody = indexSection(indexSrc);
const indexRows = indexBody.split('\n').filter((l) => l.trimStart().startsWith('|'));

line(`\n1. Subjects (${adrs.length} ADRs on disk)`);
check('at least one ADR exists', adrs.length > 0, `${adrs.length} ADR files`);
check('the decision index section (§5) exists and has rows', indexRows.length > 0,
  `${indexRows.length} rows in DECISIONS.md §5`);

// ── 2. Every ADR on disk is NAMED BY THE INDEX (D-126) ──────────────────────
//
// Enumerated FROM DISK, never from the index: an index-driven loop cannot see a row
// that was never written, which is the whole defect.
line('\n2. Membership — every ADR on disk is named by the index');
const unindexed = adrs.filter((a) => !indexBody.includes(a));
check('every ADR on disk has an index row', unindexed.length === 0,
  unindexed.length ? `absent from DECISIONS.md: ${unindexed.join(', ')}`
    : `${adrs.length} ADRs, all named`);

// ── 3. Every ADR the index names EXISTS (no phantom rows) ───────────────────
line('\n3. No phantom rows');
const named = [...new Set([...indexBody.matchAll(/ADR-\d{4}-[a-z0-9-]+\.md/g)].map((m) => m[0]))].sort();
const phantom = named.filter((n) => !fs.existsSync(path.join(ADR_DIR, n)));
check('every ADR named by the index exists on disk', phantom.length === 0,
  phantom.length ? `named but absent: ${phantom.join(', ')}` : `${named.length} names resolve`);

// ── 4. Every status is READABLE — unparseable is an error, not a value (D-107 ii) ──
line('\n4. Status readability');
const unreadable = [];
const statuses = new Map();
for (const a of adrs) {
  try {
    statuses.set(a, statusOf(a, fs.readFileSync(path.join(ADR_DIR, a), 'utf8')));
  } catch (e) {
    unreadable.push(e.message);
  }
}
check('every ADR status is readable by the canonical accessor', unreadable.length === 0,
  unreadable.length ? unreadable.join('; ') : `${statuses.size} statuses read`);

// ── 5. The index AGREES with the file (D-107 i) ─────────────────────────────
//
// Checked in BOTH directions. All three stale rows D-107 found read PROPOSED for an
// accepted decision — the UNDER-claiming direction, which looks like caution rather
// than error and which nothing would ever have queried.
line('\n5. Agreement — the index status matches the file');
const disagree = [];
for (const [adr, fileStatus] of statuses) {
  // The row is the index line naming this ADR; its status is the last bold token on it.
  const row = indexRows.find((l) => l.includes(adr));
  if (row === undefined) continue;                    // already reported by property 2
  // THE STATUS IS THE LAST CELL, AND ONLY THE LAST CELL. Reading the whole row matched
  // the word REJECTED inside a summary's prose ("REJECTED BEFORE COST") and reported an
  // ACCEPTED decision as REJECTED/PROPOSED. A status reader that ranges over prose is
  // reading a different subject than the one the table declares.
  //
  // BOTH cell spellings are read: the early rows write a bare `ACCEPTED`, the later ones
  // `**ACCEPTED** 2026-08-06 · **FROZEN**`.
  const cells = row.split('|').map((c) => c.trim()).filter((c) => c !== '');
  const statusCell = cells[cells.length - 1] ?? '';
  const claimed = [...new Set(
    [...statusCell.matchAll(/\b([A-Z]{6,10})\b/g)].map((m) => m[1])
  )].filter((t) => KNOWN_STATUSES.includes(t));
  if (claimed.length === 0) {
    disagree.push(`${adr}: index row declares no status (file: ${fileStatus})`);
    continue;
  }
  if (!claimed.includes(fileStatus)) {
    disagree.push(`${adr}: index says ${claimed.join('/')}, file says ${fileStatus}`);
  }
}
check('every index row agrees with its ADR file', disagree.length === 0,
  disagree.length ? disagree.join('; ') : `${statuses.size} rows agree`);

line('\n' + '='.repeat(74));
if (failures === 0) {
  line(`RESULT: PASS — the index is derivable from disk and agrees with it.`);
  line(`\n${adrs.length} ADRs, ${named.length} indexed, ${statuses.size} statuses read.`);
} else {
  line(`RESULT: FAIL — ${failures} property violated.`);
}
line('');

module.exports = { statusOf };
process.exit(failures === 0 ? 0 : 1);
