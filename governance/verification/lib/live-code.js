'use strict';
/**
 * Live-code extraction — shared by every source-scanning governance gate.
 * ============================================================================
 * TRACEABILITY
 *   Architecture : 01-platform-constitution.md (Rule 3 enforcement mechanism 2)
 *   Criteria     : R-13.4 (a gate must not flag itself) · C-01.8
 *
 * WHY THIS IS SHARED AND NOT COPIED.
 *
 * Two gates now scan Intelligence-Plane source for a forbidden vocabulary:
 * `verify-execution-plane-boundary.js` (browser/load/scan capability, R-3.5) and
 * `verify-intelligence-plane-egress.js` (outbound HTTP to a customer system, R-3.2).
 * Both need EXACTLY the same notion of "live code", and for the same reason: the
 * platform's own emitters write browser and fetch vocabulary into generated tenant
 * solutions as string and template literals. If the detector read those as executable,
 * generation would be indistinguishable from execution and every emitter would fail
 * the gate that exists to protect it.
 *
 * A second copy of this function would be free to drift from the first, and the two
 * gates would then disagree about what "live" means while both reporting green. That is
 * TECHNICAL_DEBT.md D-007 — declaration-versus-implementation drift — reproduced inside
 * the governance suite itself. One implementation, two callers.
 *
 * WHAT IT DOES. Blanks comment text and string/template bodies to spaces, preserving
 * line and column structure so offsets stay meaningful. Two things are deliberately
 * PRESERVED because they are genuinely live:
 *   · module specifiers — the string after `from`, `import(` or `require(` — so imports
 *     remain scannable;
 *   · `${...}` interpolation regions inside template literals, so a call hidden inside
 *     an emitted template is still seen.
 * Regex literals are neutralised, because detection gates embed the forbidden vocabulary
 * inside their own patterns and must not flag themselves.
 */

/**
 * @param {string} src raw source text
 * @returns {string} the same text with comments and string bodies blanked to spaces
 */
function stripToLiveCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line-comment | block-comment | sq | dq | tpl | regex | regex-class
  let preserveString = false; // true while inside a preserved module-specifier string
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line-comment'; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block-comment'; out += '  '; i += 2; continue; }
      if (c === "'" || c === '"') {
        const isSpecifier = /(?:\bfrom|\bimport\s*\(?|\brequire\s*\()\s*$/.test(out);
        state = c === "'" ? 'sq' : 'dq';
        out += isSpecifier ? c : ' ';
        preserveString = isSpecifier;
        i++; continue;
      }
      if (c === '`') { state = 'tpl'; out += ' '; i++; continue; }
      if (c === '/') {
        // Distinguish a regex literal from division by the preceding significant token.
        // Conservative: only treat `/` as a regex where a value is expected.
        const before = out.replace(/\s+$/, '');
        const prev = before.slice(-1);
        const afterKeyword = /(?:\breturn|\btypeof|\binstanceof|\bin|\bof|\bnew|\bdelete|\bvoid|\bdo|\belse|\bcase|\byield|\bawait)$/.test(before);
        const regexPos = before === '' || '(,=:[!&|?{};+-*%^~<>'.includes(prev) || afterKeyword;
        if (regexPos) { state = 'regex'; out += ' '; i++; continue; }
        out += c; i++; continue; // division
      }
      out += c; i++; continue;
    }
    if (state === 'regex') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === '[') { state = 'regex-class'; out += ' '; i++; continue; }
      if (c === '/') { state = 'code'; out += ' '; i++; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (state === 'regex-class') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === ']') { state = 'regex'; out += ' '; i++; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (state === 'line-comment') {
      if (c === '\n') { state = 'code'; out += '\n'; i++; continue; }
      out += (c === '\t' ? '\t' : ' '); i++; continue;
    }
    if (state === 'block-comment') {
      if (c === '*' && c2 === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (state === 'sq' || state === 'dq') {
      const q = state === 'sq' ? "'" : '"';
      if (c === '\\') { out += (preserveString ? src.slice(i, i + 2) : '  '); i += 2; continue; }
      if (c === q) { state = 'code'; out += preserveString ? q : ' '; preserveString = false; i++; continue; }
      out += preserveString ? c : (c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (state === 'tpl') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === '`') { state = 'code'; out += ' '; i++; continue; }
      if (c === '$' && c2 === '{') {
        // Live interpolation — copy verbatim until the matching brace, so a hidden call
        // inside an emitted template is still scanned.
        out += '  '; i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
          const d = src[i];
          if (d === '{') depth++;
          else if (d === '}') depth--;
          if (depth > 0) out += d;
          else out += ' ';
          i++;
        }
        continue;
      }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
  }
  return out;
}

module.exports = { stripToLiveCode };
