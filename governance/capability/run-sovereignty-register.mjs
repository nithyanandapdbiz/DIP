#!/usr/bin/env node
// CI GATE — the Capability Sovereignty Register is valid, and the platform matches it.
//
// TRACEABILITY
//   Audit : PLANE-SOVEREIGNTY-AUDIT.md §13 / §14 (duplication) · V-35 / V-36 / V-37
//
// WHY THIS GATE EXISTS.
// The audit's most expensive finding was not a violation, it was a DUPLICATION: business-rule
// extraction existed twice, in two planes, with two implementations and two answers — and the
// Execution Plane's copy was serialised, transported across the boundary and discarded, because
// nothing read it. Entity discovery, coverage, the knowledge graph, the agent runtime, the
// governance triad and the orchestration lifecycle were all doubled the same way.
//
// None of it was noticed because nothing could answer "who owns this?" — the question had no place
// to be asked. The register is that place, and this is what stops it becoming a wiki page.
//
// It checks three things the register alone cannot:
//   1. the register validates (one owner per knowledge type; no reasoning in the Execution Plane);
//   2. every agent's declared plane agrees with its declared reasoning class;
//   3. every `producer` path in the register actually exists.
//
// Exit 1 fails the build.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const REGISTER = join(HERE, 'sovereignty-register.json');

const failures = [];
const note = (rule, detail) => failures.push({ rule, detail });

/**
 * DECLARED DEBT — known violations, deliberately not yet fixed, each with its reason.
 *
 * A waiver list is a risk, and it is the lesser one. A gate that stays red gets disabled, and a
 * disabled gate protects nothing; a gate that silently passes a known violation is worse still. So
 * known debt is DECLARED: it is listed here, it is reported on every run, and it cannot be added
 * without a reason and a tracking reference.
 *
 * A waiver suppresses the failure. It does not suppress the finding — every run prints what is
 * waived and why, so the list is visible to anyone reading the build rather than buried in a file
 * nobody opens.
 */
const WAIVERS = [
  {
    agent: 'repository.search.lexical-vector',
    rules: ['agent/ep-reasons', 'agent/ep-prompt-contract'],
    reason:
      'Audit V-35. The agent does BOTH a deterministic lexical/vector score over supplied assets and '
      + 'an AI re-ranking of the result, so the correct fix is to split it as the Functional Testing '
      + 'Engine already does. Flipping the plane alone would break this capability\'s certified '
      + '"repository.search.* declares EP" invariant while leaving the deterministic half misplaced.',
    trackedIn: 'docs/audit/SOVEREIGNTY-REMEDIATION.md §remaining debt',
  },
];

const waiverFor = (rule, detail) =>
  WAIVERS.find((w) => w.rules.includes(rule) && detail.startsWith(w.agent));

// ── 1. the register validates ───────────────────────────────────────────────

const register = JSON.parse(readFileSync(REGISTER, 'utf8'));
const { validateRegister } = await import('../../packages/contracts/dist/src/capability-register.js');

for (const v of validateRegister(register)) {
  note(`register/${v.rule}`, `${v.capabilityId}: ${v.detail}`);
}

// ── 2. an agent's plane and its reasoning class must agree ──────────────────
//
// V-35: `repository.semantic-search` declared `plane: 'EP'` while carrying
// `aiCapabilityClass: 'ranking'` and a prompt contract — a reasoning agent, declared as Execution
// Plane. The `plane` field is read by a conformance gate, so a mismatch here is a claim the platform
// makes about itself and does not honour.

function sourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { sourceFiles(path, out); continue; }
    if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

// Each `defineAgent(...)` call is one declaration, so the file is split on the call itself rather
// than matched with a bounded lookahead — a lookahead has to guess where the object ends, and it
// guessed wrong, which is how this gate passed while the violation it exists to catch was present.
let agentsChecked = 0;

/**
 * Strip comments before scanning.
 *
 * Not cosmetic — this gate reported six false failures without it, because a comment EXPLAINING that
 * an agent used to declare `plane: 'EP'` reads identically to the declaration itself. A gate that
 * fires on its own documentation trains people to delete the documentation.
 */
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

for (const file of sourceFiles(join(ROOT, 'packages'))) {
  const text = stripComments(readFileSync(file, 'utf8'));
  // Each `defineAgent<…>({…})` is one declaration, so the file is split on the call. A bounded
  // lookahead has to guess where the object ends, and it guessed wrong — which is how this gate
  // passed while the violation it exists to catch was present.
  for (const block of text.split(/\bdefineAgent\s*</).slice(1)) {
    const id = /id:\s*['"`]([a-z0-9.-]+)['"`]/.exec(block)?.[1];
    const plane = /plane:\s*['"`](EP|IP)['"`]/.exec(block)?.[1];
    if (!id || !plane) continue;
    agentsChecked += 1;
    if (plane !== 'EP') continue;

    const klass = /aiCapabilityClass:\s*['"`]([a-z]+)['"`]/.exec(block)?.[1];
    if (klass && klass !== 'none') {
      note('agent/ep-reasons', `${id} (${file.split(/[\\/]packages[\\/]/)[1]}) declares plane EP and aiCapabilityClass "${klass}"; the Execution Plane does not reason`);
    }
    if (/promptContract:\s*\{/.test(block)) {
      note('agent/ep-prompt-contract', `${id} declares plane EP and a prompt contract; an Execution-Plane agent sends nothing for reasoning`);
    }
  }
}

if (agentsChecked === 0) {
  // A gate that silently inspects nothing is worse than no gate: it reports PASS forever.
  note('agent/nothing-scanned', 'no agent declaration was found; the scanner is not reading the catalogue');
}

// ── 3. every declared producer exists ───────────────────────────────────────
//
// A register entry pointing at a path nobody wrote is how a register becomes fiction. The Execution
// Plane is a separate repository and may legitimately be absent, so its paths are checked only when
// the sibling checkout is present.

const EP_ROOT = resolve(ROOT, '..', 'carlisle-homes');
for (const c of register.capabilities) {
  const [rawPath] = c.producer.split('#');
  const isEp = rawPath.startsWith('carlisle-homes/');
  if (isEp && !existsSync(EP_ROOT)) continue;
  const abs = isEp ? join(EP_ROOT, rawPath.replace('carlisle-homes/', '')) : join(ROOT, rawPath);
  if (!existsSync(abs)) {
    note('register/producer-missing', `${c.capabilityId} names producer ${rawPath}, which does not exist`);
  }
}

// ── report ──────────────────────────────────────────────────────────────────

const owners = register.capabilities.filter((c) => c.knowledgeType).length;
const ep = register.capabilities.filter((c) => c.ownerPlane === 'EP').length;
const ip = register.capabilities.filter((c) => c.ownerPlane === 'IP').length;

const waived = failures.filter((f) => waiverFor(f.rule, f.detail));
const blocking = failures.filter((f) => !waiverFor(f.rule, f.detail));

// Always printed, pass or fail. Debt that is only visible when the build breaks is debt nobody sees.
if (waived.length > 0) {
  process.stdout.write(`WAIVED  ${waived.length} declared violation(s):\n`);
  for (const w of WAIVERS) {
    if (!waived.some((f) => f.detail.startsWith(w.agent))) continue;
    process.stdout.write(`        ${w.agent} — ${w.reason}\n        tracked in: ${w.trackedIn}\n`);
  }
}

// A waiver for something that no longer happens is stale, and a stale waiver is how a future
// violation gets admitted silently under an old excuse.
for (const w of WAIVERS) {
  if (!waived.some((f) => f.detail.startsWith(w.agent))) {
    process.stdout.write(`NOTE    the waiver for ${w.agent} no longer matches any violation — remove it.\n`);
  }
}

if (blocking.length === 0) {
  process.stdout.write(
    `PASS  capability sovereignty register — ${register.capabilities.length} capabilities `
    + `(${ep} Execution Plane, ${ip} Intelligence Plane), ${owners} knowledge types, each owned exactly once`
    + `${waived.length > 0 ? `, ${waived.length} declared debt` : ''}.\n`,
  );
  process.exit(0);
}

process.stderr.write(`FAIL  capability sovereignty register — ${blocking.length} violation(s):\n`);
for (const f of blocking) process.stderr.write(`      [${f.rule}] ${f.detail}\n`);
process.exit(1);
