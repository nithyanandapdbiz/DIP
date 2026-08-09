/**
 * `dbiz` — the command line a customer uses instead of asking an engineer.
 *
 * TRACEABILITY
 *   Architecture : 25-customer-success-model.md §5 · 23-operational-excellence-model.md
 *   ADR          : ADR-0021
 *   Criteria     : C-25.3 (a failure names the unmet precondition)
 *                  C-25.5 (configuration validates against the live schema)
 *
 * THE FAILURE PATH IS THE PRODUCT.
 * A CLI is judged on what it does when something is wrong, because that is when it is
 * read carefully. Three rules follow, and they are enforced by tests rather than by
 * intention:
 *
 *   1. Every error names WHAT failed, WHY, and WHAT TO DO. Two out of three leaves the
 *      user to guess the third, and they will guess wrong.
 *   2. An unknown command lists the known ones. "Unknown command" alone forces a
 *      round trip through documentation for a typo.
 *   3. Exit codes distinguish "this failed" from "I could not run". A script that
 *      cannot tell those apart will retry the wrong one.
 *
 * This module is deliberately I/O-free: it takes argv and returns text and an exit
 * code. That is what makes the failure path testable, and an untested failure path is
 * the one that will be wrong.
 */
import { renderReport, summarise, checkNodeRuntime, checkConfiguration, checkDependencyPinning, type CheckResult } from './diagnostics.js';
import { renderOnboarding, ONBOARDING_STEPS, type OnboardingResult } from './onboarding.js';
import { buildExamples, validateExamples } from './configuration.js';
import { buildRunbooks, renderRunbook } from './runbooks.js';

export interface CliResult {
  readonly stdout: string;
  /** 0 success · 1 a check or command failed · 2 the command could not be run. */
  readonly exitCode: 0 | 1 | 2;
}

export interface CliContext {
  /** Reads a JSON file. Injected so the CLI stays testable without a filesystem. */
  readonly readJson?: (path: string) => unknown;
  /** Runs onboarding. Injected because the real one needs live platform services. */
  readonly onboard?: (tenantId: string, profile: unknown) => OnboardingResult;
}

const COMMANDS = [
  ['doctor', 'Run diagnostics. Failures print first, each with what to do next.'],
  ['validate', 'Validate a technology profile against the live schema.'],
  ['onboard', 'Run guided onboarding: validate, create, generate, register, verify.'],
  ['examples', 'List the validated configuration examples.'],
  ['runbook', 'Print an operational runbook.'],
  ['help', 'Show this.'],
] as const;

export function run(argv: readonly string[], context: CliContext = {}): CliResult {
  const [command, ...rest] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { stdout: usage(), exitCode: command ? 0 : 2 };
  }

  switch (command) {
    case 'doctor': return doctor(rest, context);
    case 'validate': return validate(rest, context);
    case 'onboard': return onboard(rest, context);
    case 'examples': return examples();
    case 'runbook': return runbook(rest);
    default:
      // Rule 2: list what IS known. An unknown-command message that does not is a
      // dead end for a typo, and typos are the common case.
      return {
        stdout: [
          `Unknown command: ${command}`,
          '',
          'Known commands:',
          ...COMMANDS.map(([n, d]) => `  ${n.padEnd(10)} ${d}`),
          '',
          `Did you mean ${nearest(command)}?`,
          '',
        ].join('\n'),
        exitCode: 2,
      };
  }
}

function usage(): string {
  return [
    '',
    'dbiz — DBiz Agentic QA Platform',
    '',
    'Usage: dbiz <command> [options]',
    '',
    'Commands:',
    ...COMMANDS.map(([n, d]) => `  ${n.padEnd(10)} ${d}`),
    '',
    'Options:',
    '  --profile <path>   Path to a technology profile JSON file.',
    '  --tenant <id>      Your tenant identifier.',
    '  --preflight        Run only the checks that need no deployment.',
    '',
    'Every failure names what failed, why, and what to do about it. If one does not,',
    'that is a defect worth reporting.',
    '',
  ].join('\n');
}

function doctor(args: readonly string[], context: CliContext): CliResult {
  const results: CheckResult[] = [checkNodeRuntime()];
  const profilePath = optionOf(args, '--profile');

  if (profilePath) {
    const loaded = loadJson(profilePath, context);
    if ('error' in loaded) return { stdout: loaded.error, exitCode: 2 };
    results.push(checkConfiguration(loaded.value));
    const manifest = (loaded.value as { frameworkVersions?: Record<string, string> }).frameworkVersions;
    if (manifest) results.push(checkDependencyPinning(manifest));
  } else {
    results.push({
      id: 'preflight.configuration', checked: 'technology profile', status: 'skipped',
      detail: 'no profile supplied',
      remedy: 'Pass --profile <path> to validate your configuration as part of this run.',
    });
  }

  const report = summarise(results);
  return { stdout: renderReport(report), exitCode: report.ready ? 0 : 1 };
}

function validate(args: readonly string[], context: CliContext): CliResult {
  const profilePath = optionOf(args, '--profile');
  if (!profilePath) {
    // Rule 1: what failed, why, what to do — not "missing argument".
    return {
      stdout: [
        'Cannot validate: no profile was supplied.',
        '',
        'A profile is the JSON describing your language, framework, runner and CI system.',
        '',
        '  dbiz validate --profile ./profile.json',
        '',
        'Run `dbiz examples` to see validated profiles you can copy.',
        '',
      ].join('\n'),
      exitCode: 2,
    };
  }
  const loaded = loadJson(profilePath, context);
  if ('error' in loaded) return { stdout: loaded.error, exitCode: 2 };

  const result = checkConfiguration(loaded.value);
  const report = summarise([result]);
  return { stdout: renderReport(report), exitCode: report.ready ? 0 : 1 };
}

function onboard(args: readonly string[], context: CliContext): CliResult {
  const tenantId = optionOf(args, '--tenant');
  const profilePath = optionOf(args, '--profile');

  if (!tenantId || !profilePath) {
    const missing = [!tenantId && '--tenant', !profilePath && '--profile'].filter(Boolean);
    return {
      stdout: [
        `Cannot onboard: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required.`,
        '',
        '  dbiz onboard --tenant <your-tenant-id> --profile ./profile.json',
        '',
        'Onboarding runs these steps, stopping at the first failure:',
        ...ONBOARDING_STEPS.map((s, n) => `  ${n + 1}. ${s.label}`),
        '',
        'Nothing is created until your profile validates, so a failed validation costs',
        'you nothing to correct and retry.',
        '',
      ].join('\n'),
      exitCode: 2,
    };
  }

  if (!context.onboard) {
    return {
      stdout: [
        'Cannot onboard: this build has no connection to a platform endpoint.',
        '',
        'You are running the offline toolkit. `doctor`, `validate`, `examples` and',
        '`runbook` work without an endpoint; `onboard` does not.',
        '',
      ].join('\n'),
      exitCode: 2,
    };
  }

  const loaded = loadJson(profilePath, context);
  if ('error' in loaded) return { stdout: loaded.error, exitCode: 2 };

  const result = context.onboard(tenantId, loaded.value);
  return { stdout: renderOnboarding(result), exitCode: result.succeeded ? 0 : 1 };
}

function examples(): CliResult {
  const all = buildExamples();
  const validations = new Map(validateExamples(all).map((v) => [v.id, v]));
  const lines = ['', 'VALIDATED CONFIGURATION EXAMPLES', '='.repeat(72)];
  for (const e of all) {
    const v = validations.get(e.id);
    lines.push(`${v?.valid ? '  ok  ' : ' FAIL '} ${e.id}`);
    lines.push(`        ${e.whenToUse}`);
    if (!v?.valid) lines.push(`        -> ${v?.detail ?? 'no validation result'}`);
  }
  lines.push('='.repeat(72));
  const failed = [...validations.values()].filter((v) => !v.valid).length;
  lines.push(failed === 0
    ? `${all.length} examples, all validated against the live schema.`
    : `${failed} of ${all.length} examples DO NOT validate. Do not use them.`);
  lines.push('');
  return { stdout: lines.join('\n'), exitCode: failed === 0 ? 0 : 1 };
}

function runbook(args: readonly string[]): CliResult {
  const all = buildRunbooks();
  const id = args[0];
  if (!id) {
    return {
      stdout: [
        '', 'RUNBOOKS', '='.repeat(72),
        ...all.flatMap((r) => [`  ${r.id}`, `        ${r.whenToUse}`, `        downtime: ${r.downtime}`]),
        '='.repeat(72), 'Print one with: dbiz runbook <id>', '',
      ].join('\n'),
      exitCode: 0,
    };
  }
  const found = all.find((r) => r.id === id);
  if (!found) {
    return {
      stdout: [
        `No runbook called "${id}".`, '',
        'Available:', ...all.map((r) => `  ${r.id}`), '',
      ].join('\n'),
      exitCode: 2,
    };
  }
  return { stdout: `\n${renderRunbook(found)}`, exitCode: 0 };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function optionOf(args: readonly string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

function loadJson(path: string, context: CliContext): { value: unknown } | { error: string } {
  if (!context.readJson) {
    return { error: `Cannot read ${path}: this build has no filesystem access.\n` };
  }
  try {
    return { value: context.readJson(path) };
  } catch (e) {
    const message = (e as Error).message;
    // The two failures need different remedies, and "could not read file" covers both
    // badly: one is a path problem, the other is a syntax problem inside a found file.
    const isMissing = /ENOENT|no such file/i.test(message);
    return {
      error: [
        isMissing ? `Cannot find ${path}.` : `Cannot parse ${path}.`,
        '',
        isMissing
          ? 'Check the path. Run `dbiz examples` for validated profiles you can copy.'
          : `It was found but is not valid JSON: ${message}`,
        '',
      ].join('\n'),
    };
  }
}

/** Nearest known command by edit distance, so a typo gets a suggestion not a wall. */
function nearest(input: string): string {
  let best = COMMANDS[0][0] as string;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [name] of COMMANDS) {
    const d = distance(input, name);
    if (d < bestScore) { bestScore = d; best = name; }
  }
  return `\`${best}\``;
}

function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length]![b.length]!;
}
