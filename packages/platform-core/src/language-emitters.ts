/**
 * Per-language emission for the Solution Generation Engine.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md §2c · 25-customer-success-model.md §10
 *   ADR          : ADR-0021
 *   Criteria     : C-03.16 (every declared profile field changes generated output)
 *                  C-03.18 (deterministic) · C-03.19 (no secret material)
 *                  C-21.19 (bootstrap carries exactly three values)
 *                  C-25.8  (every declared supported target validates)
 *
 * WHY THIS EXISTS.
 * The generator previously emitted TypeScript sources for every language in the
 * supported registry. A customer selecting `python` received `register.ts`; a
 * customer selecting `java` received the same. Five of six declared supported
 * combinations were therefore **declared-but-unbuilt** (R-11.2) — the platform's
 * characteristic failure, applied to its own compatibility claims, and the exact
 * thing C-25.8 exists to detect.
 *
 * The registry was not narrowed to hide this. Declaring support for a target the
 * generator cannot build is a lie; quietly withdrawing support the moment it is
 * measured is a different way of avoiding the work. The targets are declared, so
 * they are built.
 *
 * Each emitter produces the SAME semantics in its own language: a bootstrap holding
 * exactly three values, a logger that emits identifiers and never payloads, a
 * tenant-leading path helper, and a dependency manifest. Nothing here is a
 * translation of TypeScript — a Python file that reads like transliterated
 * TypeScript is as unusable to a Python team as the TypeScript was.
 */
import type { TechnologyProfile } from './technology-profile.js';
import { resolveFrameworkVersions } from './framework-versions.js';

export interface EmittedFile {
  readonly path: string;
  readonly content: string;
}

export interface BootstrapValues {
  readonly tenantId: string;
  readonly registrationEndpoint: string;
  readonly oneTimeRegistrationCredential: string;
}

export interface LanguageEmitter {
  /** Base image for the Execution Plane container, matched to the language runtime. */
  readonly dockerBaseImage: string;
  /** Where the runner looks for tests. Part of the profile being real, not decorative. */
  readonly testDirectory: string;
  files(profile: TechnologyProfile, bootstrap: BootstrapValues): readonly EmittedFile[];
}

/** JSON-quote a value for embedding in generated source. Deterministic by construction. */
const q = (s: string): string => JSON.stringify(s);

const NOTICE = [
  'Bootstrap registration client.',
  '',
  'Carries exactly three values: tenant identifier, registration endpoint, and a',
  'ONE-TIME credential. It holds no API key and no durable secret, because this',
  'file lives in a repository history the customer keeps forever.',
  '',
  'The credential is consumed on first successful use and refused thereafter.',
];

const LOG_NOTICE = [
  'Structured logging. Emits no customer content: log statements carry',
  'identifiers and outcomes, never payloads (R-16.34).',
];

const PATH_NOTICE = [
  'Evidence paths are tenant-leading so purge is a prefix operation and',
  'omitting the scope yields no path at all (R-07.1, ADR-0010).',
];

const comment = (lines: readonly string[], prefix: string): string =>
  lines.map((l) => (l === '' ? prefix.trimEnd() : `${prefix}${l}`)).join('\n');

/**
 * Where the functional capability looks for its suite.
 *
 * `config/capabilities.json` declares `suite: "tests/functional"` and the runner was
 * never pointed at it — no runner configuration was generated at all, so the declared
 * suite path existed in config and in nothing that reads config.
 *
 * THE GENERATOR CONFIGURES THIS DIRECTORY AND MUST NOT WRITE INTO IT. `tests/` is
 * reserved Execution-Plane ground (RESERVED_PATH_PREFIXES, in the onboarding engine's
 * solution-export): the suite is authored by the customer and by the functional-testing
 * capability at run time, so emitting a spec here would overwrite their work on the next
 * routine regeneration — and generation now refuses outright if a template tries.
 * `tests/.gitkeep` is the single declared exception. The starting example ships under
 * docs/ instead, where the customer copies it rather than inherits it.
 */
const FUNCTIONAL_SUITE_DIR = 'tests/functional';

/** Generator-owned documentation. Not reserved, so an example may ship here. */
const EXAMPLE_DIR = 'docs/examples';

/**
 * The runner's reporter configuration, as a source literal.
 *
 * `reportingFramework` was recorded into src/config/execution.config.json and consumed
 * by nothing that runs — a tenant selecting Allure got the word "allure" in a config
 * file and the runner's default reporter. This renders the selection into the place
 * the runner actually reads.
 */
function playwrightReporter(profile: TechnologyProfile): string {
  switch (profile.reportingFramework) {
    case 'allure':
      // `list` stays alongside so a terminal run is still readable; Allure writes results
      // for the report, not to the console.
      return "[['list'], ['allure-playwright', { resultsDir: 'allure-results' }]]";
    case 'junit-xml':
      return "[['list'], ['junit', { outputFile: 'test-results/junit.xml' }]]";
    case 'html':
      return "[['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]";
    default: {
      const unreachable: never = profile.reportingFramework;
      throw new Error(`no reporter mapping for: ${String(unreachable)}`);
    }
  }
}

/**
 * pytest's reporter flags, for the format the profile selected.
 *
 * The same job as playwrightReporter: render the selection into the place the runner
 * reads, instead of recording the word and leaving the default in place.
 */
function pytestReporterOptions(profile: TechnologyProfile): string {
  switch (profile.reportingFramework) {
    case 'allure':
      return '--alluredir=allure-results';
    case 'junit-xml':
      // Native to pytest — no adapter package is installed for this one.
      return '--junitxml=test-results/junit.xml';
    case 'html':
      return '--html=test-results/index.html --self-contained-html';
    default: {
      const unreachable: never = profile.reportingFramework;
      throw new Error(`no reporter mapping for: ${String(unreachable)}`);
    }
  }
}

/** The Python worked example — copied into the suite, never generated into it. */
function pythonExampleFiles(profile: TechnologyProfile): readonly EmittedFile[] {
  if (profile.framework !== 'playwright') return [];
  return [{
    path: `${EXAMPLE_DIR}/test_target_reachable.py`,
    content: [
      '"""A worked example. Copy it to tests/functional/ to make it run.',
      '',
      `It is not generated into ${FUNCTIONAL_SUITE_DIR} on purpose: that directory is yours,`,
      'shared with the functional-testing capability, and a regeneration must never',
      'overwrite what you or it wrote there.',
      '',
      'The check itself: this Execution Plane can reach the application it is configured',
      'against. An unconfigured environment FAILS here rather than passing or skipping — a',
      'green run against a target that was never set is a fabricated verdict, and a skipped',
      'one reads as green in every summary that matters. `base_url` is supplied by the',
      'conftest fixture, which resolves it from the application band.',
      '"""',
      '',
      '',
      'def test_the_configured_application_target_responds(page, base_url):',
      '    assert base_url, (',
      '        "No application target is configured — set it in the portal or .env, then re-run."',
      '    )',
      '    response = page.goto(base_url, wait_until="domcontentloaded")',
      '    assert response is not None, f"no response from {base_url}"',
      '    assert response.status < 400, f"unexpected status {response.status} from {base_url}"',
      '',
    ].join('\n'),
  }];
}

/**
 * Reporter wiring for the JVM and .NET stacks, where it is a file on the classpath or
 * beside the assembly rather than a block in a runner config.
 *
 * Only Allure needs a file. Surefire and the .NET test SDK write JUnit-shaped XML
 * natively, so `junit-xml` correctly produces nothing. `html` produces nothing either,
 * and that is a REAL GAP rather than a native capability: it needs a build-plugin change
 * (maven-surefire-report-plugin, or a .NET logger), and this emitter writes dependencies
 * and config, not build plugins. It is left visibly unwired rather than half-wired.
 */
function jvmDotnetReporterFiles(profile: TechnologyProfile): readonly EmittedFile[] {
  if (profile.reportingFramework !== 'allure') return [];
  if (profile.testRunner === 'junit5') {
    return [{
      path: 'src/test/resources/allure.properties',
      content: ['allure.results.directory=allure-results', ''].join('\n'),
    }];
  }
  if (profile.testRunner === 'nunit') {
    return [{
      path: 'allureConfig.json',
      // Allure.NUnit reads this from the directory the assembly runs in; the csproj
      // copies it there. Without the copy the adapter silently writes nowhere.
      content: `${JSON.stringify({ allure: { directory: 'allure-results', links: [] } }, null, 2)}\n`,
    }];
  }
  return [];
}

/**
 * Playwright configuration and a first real test, for the Node stacks that run them.
 *
 * The configuration reads `config/application.json` at RUNTIME rather than baking the
 * target into generated bytes. That band is the single source of truth for which
 * environment variable holds the target URL, where the captured session lives, and the
 * operational knobs the portal writes — so a D365 tenant and a plain web tenant receive
 * an identical config file that behaves correctly for each. Baking the variable name in
 * would have made this file application-template-specific, which the generator has no
 * business being: it knows how the package is BUILT, never what it is built FOR.
 *
 * It also means the portal can change browser, timeout or parallelism without a
 * regeneration, which is the difference between a setting and a redeploy.
 */
function playwrightRunnerFiles(profile: TechnologyProfile, ext: 'ts' | 'js'): readonly EmittedFile[] {
  if (profile.framework !== 'playwright' || profile.testRunner !== 'playwright-test') return [];
  // TypeScript needs the band typed as `any`: it is read from disk at runtime and has no
  // compile-time shape here. Declaring one would duplicate the application template.
  const bandType = ext === 'ts' ? ': any' : '';
  return [
    {
      path: `playwright.config.${ext}`,
      content: [
        '// Playwright configuration for the Execution Plane.',
        '//',
        '// Reads config/application.json — the application band — at run time. The band NAMES',
        '// the environment variable holding the target URL; the VALUE is set in .env at this',
        '// Execution Plane and never reaches DBiz (INV-2). Nothing about the target is baked',
        '// into this file, so it is correct for every application template.',
        "import { existsSync, readFileSync } from 'node:fs';",
        "import { defineConfig, devices } from '@playwright/test';",
        '',
        `const band${bandType} = (() => {`,
        '  try {',
        "    return JSON.parse(readFileSync(new URL('config/application.json', import.meta.url), 'utf8'));",
        '  } catch {',
        '    // Absent before the package is configured. The suite must still load and report',
        '    // an unconfigured environment honestly, rather than failing at import time.',
        '    return {};',
        '  }',
        '})();',
        '',
        'const target = band.target ?? {};',
        'const operational = (band.configuration ?? {}).operational ?? {};',
        'const executionProfile = (band.execution ?? {}).profile ?? {};',
        '',
        "const baseURL = process.env[target.baseUrlEnv ?? 'APP_BASE_URL'] || target.url || undefined;",
        'const storageState = executionProfile.storageState;',
        '',
        'const DESKTOP = {',
        "  chromium: 'Desktop Chrome',",
        "  firefox: 'Desktop Firefox',",
        "  webkit: 'Desktop Safari',",
        '};',
        "const browser = operational.browser ?? 'chromium';",
        '',
        'export default defineConfig({',
        `  testDir: '${FUNCTIONAL_SUITE_DIR}',`,
        '  timeout: Number(process.env.EP_TIMEOUT_MS ?? operational.timeoutMs ?? 60000),',
        '  workers: Number(process.env.EP_WORKERS ?? operational.parallel ?? 1),',
        '  // A test that only passes on retry is a flaky test. Retrying hides that from the',
        '  // evidence, and the evidence is the product.',
        '  retries: 0,',
        '  forbidOnly: true,',
        `  reporter: ${playwrightReporter(profile)},`,
        "  outputDir: 'test-results',",
        '  use: {',
        '    baseURL,',
        '    headless: true,',
        "    trace: 'retain-on-failure',",
        "    screenshot: 'only-on-failure',",
        '    actionTimeout: Number(operational.timeoutMs ?? 60000),',
        '    // Applied only once the session has actually been captured. Naming a file that',
        '    // does not exist aborts every test at load; sign-in should fail visibly instead.',
        '    ...(storageState && existsSync(storageState) ? { storageState } : {}),',
        '  },',
        '  projects: [',
        "    { name: browser, use: { ...devices[DESKTOP[browser] ?? 'Desktop Chrome'] } },",
        '  ],',
        '});',
        '',
      ].join('\n'),
    },
    {
      // COPIED, not inherited. It ships under docs/ because tests/ is reserved ground —
      // see FUNCTIONAL_SUITE_DIR. A customer who copies this owns their copy outright and
      // no regeneration can touch it; a generated one would be silently replaced.
      path: `${EXAMPLE_DIR}/target-reachable.spec.${ext}`,
      content: [
        '// A worked example. Copy it to tests/functional/ to make it run.',
        '//',
        `// It is not generated into ${FUNCTIONAL_SUITE_DIR} on purpose: that directory is yours,`,
        '// shared with the functional-testing capability, and a regeneration must never',
        '// overwrite what you or it wrote there.',
        '//',
        '// The check itself: this Execution Plane can reach the application it is configured',
        '// against. An unconfigured environment FAILS here rather than passing or skipping —',
        '// a green run against a target that was never set is a fabricated verdict, and a',
        '// skipped one reads as green in every summary that matters. The message names what',
        '// to fill in, and it is the same rule config/application.json validates.',
        "import { test, expect } from '@playwright/test';",
        '',
        "test('the configured application target responds', async ({ page, baseURL }) => {",
        "  expect(baseURL, 'No application target is configured — set it in the portal or .env, then re-run.')",
        '    .toBeTruthy();',
        "  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });",
        '  expect(response, `no response from ${baseURL}`).not.toBeNull();',
        '  expect(response.status(), `unexpected status from ${baseURL}`).toBeLessThan(400);',
        '});',
        '',
      ].join('\n'),
    },
  ];
}

// ── TypeScript ──────────────────────────────────────────────────────────────
const typescript: LanguageEmitter = {
  dockerBaseImage: 'node:24-alpine',
  testDirectory: 'tests',
  files(profile, b) {
    return [
      {
        path: 'src/bootstrap/register.ts',
        content: [
          comment(NOTICE, '// '),
          `export const TENANT_ID = ${q(b.tenantId)};`,
          `export const REGISTRATION_ENDPOINT = ${q(b.registrationEndpoint)};`,
          `export const ONE_TIME_REGISTRATION_CREDENTIAL = ${q(b.oneTimeRegistrationCredential)};`,
          '',
          'export const REGISTRATION_IS_SINGLE_USE = true as const;',
          '',
        ].join('\n'),
      },
      {
        path: 'src/logging/logger.ts',
        content: [
          comment(LOG_NOTICE, '// '),
          'export interface LogEvent { readonly event: string; readonly runId?: string; readonly outcome?: string }',
          'export const emit = (e: LogEvent): void => { process.stdout.write(JSON.stringify(e) + "\\n"); };',
          '',
        ].join('\n'),
      },
      {
        path: 'src/utils/paths.ts',
        content: [
          comment(PATH_NOTICE, '// '),
          'export const evidencePath = (tenantId: string, capability: string, runId: string): string =>',
          '  [tenantId, capability, runId].join("/");',
          '',
        ].join('\n'),
      },
      manifestFor(profile),
      ...playwrightRunnerFiles(profile, 'ts'),
    ];
  },
};

// ── JavaScript ──────────────────────────────────────────────────────────────
const javascript: LanguageEmitter = {
  dockerBaseImage: 'node:24-alpine',
  testDirectory: 'tests',
  files(profile, b) {
    return [
      {
        path: 'src/bootstrap/register.js',
        content: [
          comment(NOTICE, '// '),
          `export const TENANT_ID = ${q(b.tenantId)};`,
          `export const REGISTRATION_ENDPOINT = ${q(b.registrationEndpoint)};`,
          `export const ONE_TIME_REGISTRATION_CREDENTIAL = ${q(b.oneTimeRegistrationCredential)};`,
          '',
          'export const REGISTRATION_IS_SINGLE_USE = true;',
          '',
        ].join('\n'),
      },
      {
        path: 'src/logging/logger.js',
        content: [
          comment(LOG_NOTICE, '// '),
          'export const emit = (e) => { process.stdout.write(JSON.stringify(e) + "\\n"); };',
          '',
        ].join('\n'),
      },
      {
        path: 'src/utils/paths.js',
        content: [
          comment(PATH_NOTICE, '// '),
          'export const evidencePath = (tenantId, capability, runId) =>',
          '  [tenantId, capability, runId].join("/");',
          '',
        ].join('\n'),
      },
      manifestFor(profile),
      ...playwrightRunnerFiles(profile, 'js'),
    ];
  },
};

// ── Python ──────────────────────────────────────────────────────────────────
const python: LanguageEmitter = {
  dockerBaseImage: 'python:3.12-slim',
  testDirectory: 'tests',
  files(profile, b) {
    return [
      {
        path: 'src/bootstrap/register.py',
        content: [
          '"""',
          ...NOTICE,
          '"""',
          '',
          `TENANT_ID = ${q(b.tenantId)}`,
          `REGISTRATION_ENDPOINT = ${q(b.registrationEndpoint)}`,
          `ONE_TIME_REGISTRATION_CREDENTIAL = ${q(b.oneTimeRegistrationCredential)}`,
          '',
          'REGISTRATION_IS_SINGLE_USE = True',
          '',
        ].join('\n'),
      },
      {
        path: 'src/logging/logger.py',
        content: [
          '"""',
          ...LOG_NOTICE,
          '"""',
          '',
          'import json',
          'import sys',
          '',
          '',
          'def emit(event, run_id=None, outcome=None):',
          '    record = {"event": event}',
          '    if run_id is not None:',
          '        record["runId"] = run_id',
          '    if outcome is not None:',
          '        record["outcome"] = outcome',
          '    sys.stdout.write(json.dumps(record, sort_keys=True) + "\\n")',
          '',
        ].join('\n'),
      },
      {
        path: 'src/utils/paths.py',
        content: [
          '"""',
          ...PATH_NOTICE,
          '"""',
          '',
          '',
          'def evidence_path(tenant_id, capability, run_id):',
          '    return "/".join([tenant_id, capability, run_id])',
          '',
        ].join('\n'),
      },
      {
        path: 'conftest.py',
        content: [
          '# pytest root marker, and the Execution Plane\'s binding to its application band.',
          '#',
          '# Keeps `src` importable without an installed package, so a customer can run the',
          '# suite immediately after cloning.',
          '#',
          '# The fixtures below read config/application.json at run time. The band NAMES the',
          '# environment variable holding the target URL; the VALUE is set in .env at this',
          '# Execution Plane and never reaches DBiz (INV-2). Nothing about the target is baked',
          '# into this file, so it is correct for every application template.',
          'import json',
          'import os',
          'import sys',
          'from pathlib import Path',
          '',
          'import pytest',
          '',
          'sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))',
          '',
          '_BAND_PATH = Path(__file__).parent / "config" / "application.json"',
          '',
          '',
          '@pytest.fixture(scope="session")',
          'def application_band():',
          '    """The application band, or an empty mapping before the package is configured."""',
          '    try:',
          '        return json.loads(_BAND_PATH.read_text(encoding="utf-8"))',
          '    except (OSError, ValueError):',
          '        # Absent or unreadable before configuration. The suite must still collect and',
          '        # report an unconfigured environment honestly, not fail at import time.',
          '        return {}',
          '',
          '',
          '@pytest.fixture(scope="session")',
          'def base_url(application_band):',
          '    """Overrides pytest-base-url so the target comes from the band, never a flag."""',
          '    target = application_band.get("target", {})',
          '    return os.environ.get(target.get("baseUrlEnv", "APP_BASE_URL")) or target.get("url")',
          '',
          '',
          '@pytest.fixture(scope="session")',
          'def browser_context_args(browser_context_args, application_band):',
          '    """Replays the captured session, but only once it has actually been captured."""',
          '    profile = application_band.get("execution", {}).get("profile", {})',
          '    state = profile.get("storageState")',
          '    if state and Path(state).exists():',
          '        return {**browser_context_args, "storage_state": state}',
          '    return browser_context_args',
          '',
        ].join('\n'),
      },
      {
        path: 'pytest.ini',
        content: [
          '[pytest]',
          `testpaths = ${FUNCTIONAL_SUITE_DIR}`,
          'python_files = test_*.py',
          `addopts = ${pytestReporterOptions(profile)}`,
          '',
        ].join('\n'),
      },
      ...pythonExampleFiles(profile),
      manifestFor(profile),
    ];
  },
};

// ── Java ────────────────────────────────────────────────────────────────────
const JAVA_PACKAGE_DIR = 'src/main/java/com/dbiz/execution';

const java: LanguageEmitter = {
  dockerBaseImage: 'eclipse-temurin:21-jre-alpine',
  testDirectory: 'src/test/java',
  files(profile, b) {
    return [
      {
        path: `${JAVA_PACKAGE_DIR}/Bootstrap.java`,
        content: [
          'package com.dbiz.execution;',
          '',
          '/**',
          ...NOTICE.map((l) => (l === '' ? ' *' : ` * ${l}`)),
          ' */',
          'public final class Bootstrap {',
          `    public static final String TENANT_ID = ${q(b.tenantId)};`,
          `    public static final String REGISTRATION_ENDPOINT = ${q(b.registrationEndpoint)};`,
          `    public static final String ONE_TIME_REGISTRATION_CREDENTIAL = ${q(b.oneTimeRegistrationCredential)};`,
          '',
          '    public static final boolean REGISTRATION_IS_SINGLE_USE = true;',
          '',
          '    private Bootstrap() {',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: `${JAVA_PACKAGE_DIR}/Logger.java`,
        content: [
          'package com.dbiz.execution;',
          '',
          '/**',
          ...LOG_NOTICE.map((l) => ` * ${l}`),
          ' */',
          'public final class Logger {',
          '    public static void emit(String event, String runId, String outcome) {',
          '        StringBuilder b = new StringBuilder("{\\"event\\":\\"").append(event).append("\\"");',
          '        if (runId != null) {',
          '            b.append(",\\"runId\\":\\"").append(runId).append("\\"");',
          '        }',
          '        if (outcome != null) {',
          '            b.append(",\\"outcome\\":\\"").append(outcome).append("\\"");',
          '        }',
          '        System.out.println(b.append("}").toString());',
          '    }',
          '',
          '    private Logger() {',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: `${JAVA_PACKAGE_DIR}/EvidencePaths.java`,
        content: [
          'package com.dbiz.execution;',
          '',
          '/**',
          ...PATH_NOTICE.map((l) => ` * ${l}`),
          ' */',
          'public final class EvidencePaths {',
          '    public static String evidencePath(String tenantId, String capability, String runId) {',
          '        return String.join("/", tenantId, capability, runId);',
          '    }',
          '',
          '    private EvidencePaths() {',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      manifestFor(profile),
      ...jvmDotnetReporterFiles(profile),
    ];
  },
};

// ── C# ──────────────────────────────────────────────────────────────────────
const csharp: LanguageEmitter = {
  dockerBaseImage: 'mcr.microsoft.com/dotnet/sdk:8.0-alpine',
  testDirectory: 'tests',
  files(profile, b) {
    return [
      {
        path: 'src/Bootstrap.cs',
        content: [
          'namespace DBiz.Execution;',
          '',
          '/// <summary>',
          ...NOTICE.map((l) => (l === '' ? '///' : `/// ${l}`)),
          '/// </summary>',
          'public static class Bootstrap',
          '{',
          `    public const string TenantId = ${q(b.tenantId)};`,
          `    public const string RegistrationEndpoint = ${q(b.registrationEndpoint)};`,
          `    public const string OneTimeRegistrationCredential = ${q(b.oneTimeRegistrationCredential)};`,
          '',
          '    public const bool RegistrationIsSingleUse = true;',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/Logger.cs',
        content: [
          'namespace DBiz.Execution;',
          '',
          'using System.Text.Json;',
          '',
          '/// <summary>',
          ...LOG_NOTICE.map((l) => `/// ${l}`),
          '/// </summary>',
          'public static class Logger',
          '{',
          '    public static void Emit(string @event, string? runId = null, string? outcome = null)',
          '    {',
          '        var record = new Dictionary<string, string> { ["event"] = @event };',
          '        if (runId is not null) { record["runId"] = runId; }',
          '        if (outcome is not null) { record["outcome"] = outcome; }',
          '        Console.WriteLine(JsonSerializer.Serialize(record));',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/EvidencePaths.cs',
        content: [
          'namespace DBiz.Execution;',
          '',
          '/// <summary>',
          ...PATH_NOTICE.map((l) => `/// ${l}`),
          '/// </summary>',
          'public static class EvidencePaths',
          '{',
          '    public static string EvidencePath(string tenantId, string capability, string runId)',
          '        => string.Join("/", tenantId, capability, runId);',
          '}',
          '',
        ].join('\n'),
      },
      manifestFor(profile),
      ...jvmDotnetReporterFiles(profile),
    ];
  },
};

/**
 * Split a JVM dependency key into group and artifact.
 *
 * The registry states full `group:artifact` coordinates, because a JVM build needs both
 * and only the resolver knows which group an artifact belongs to. This previously hard-coded
 * `org.seleniumhq.selenium` for EVERY dependency, so the moment a second group appeared —
 * JUnit, Allure — the generated POM named a coordinate that does not exist. A key without a
 * colon keeps the old group, so a profile pinning `selenium-java` by hand still resolves.
 */
function jvmCoordinate(key: string): readonly [string, string] {
  const i = key.indexOf(':');
  return i === -1 ? ['org.seleniumhq.selenium', key] : [key.slice(0, i), key.slice(i + 1)];
}

/**
 * The dependency manifest, in the form the declared package manager actually reads.
 *
 * Framework versions are PINNED here. An unpinned version makes the customer's build
 * non-reproducible, which undoes determinism one layer below the generator.
 */
function manifestFor(profile: TechnologyProfile): EmittedFile {
  // Resolved from the declared stack, with the profile's own pins overriding. Reading
  // profile.frameworkVersions directly is what produced manifests declaring no
  // dependencies at all — see framework-versions.ts. Already key-sorted, so map
  // iteration order cannot leak into generated bytes.
  const resolved = resolveFrameworkVersions(profile);
  const versions = Object.entries(resolved);

  switch (profile.packageManager) {
    case 'pnpm':
    case 'npm':
      return {
        path: 'package.json',
        content: `${JSON.stringify({
          name: 'execution-plane',
          private: true,
          type: 'module',
          scripts: {
          test: profile.testRunner === 'playwright-test' ? 'playwright test' : profile.testRunner,
          // Operational portal + one execution path (ADR-0035 R-04.5): every `npm run <cap>` calls the
          // Local Execution API via the CLI, exactly as the portal Run button does — never an engine directly.
          portal: 'node src/portal/server.mjs',
          functional: 'node bin/ep.mjs run functional-testing',
          discovery: 'node bin/ep.mjs run inverse-flow-discovery',
          performance: 'node bin/ep.mjs run performance',
          security: 'node bin/ep.mjs run security-testing',
          pentest: 'node bin/ep.mjs run penetration-testing',
          'dev-change': 'node bin/ep.mjs run dev-change',
        },
          devDependencies: Object.fromEntries(versions),
        }, null, 2)}\n`,
      };
    case 'pip':
      return {
        path: 'requirements.txt',
        content: `${versions.map(([k, v]) => `${k}==${v}`).join('\n')}\n`,
      };
    case 'maven':
      return {
        path: 'pom.xml',
        content: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<project xmlns="http://maven.apache.org/POM/4.0.0">',
          '  <modelVersion>4.0.0</modelVersion>',
          '  <groupId>com.dbiz</groupId>',
          '  <artifactId>execution-plane</artifactId>',
          '  <version>1.0.0</version>',
          '  <properties>',
          '    <maven.compiler.release>21</maven.compiler.release>',
          '  </properties>',
          '  <dependencies>',
          ...versions.flatMap(([k, v]) => {
            const [group, artifact] = jvmCoordinate(k);
            return [
              '    <dependency>',
              `      <groupId>${group}</groupId>`,
              `      <artifactId>${artifact}</artifactId>`,
              `      <version>${v}</version>`,
              '      <scope>test</scope>',
              '    </dependency>',
            ];
          }),
          '  </dependencies>',
          '</project>',
          '',
        ].join('\n'),
      };
    case 'gradle':
      return {
        path: 'build.gradle',
        content: [
          'plugins {',
          "    id 'java'",
          '}',
          '',
          'repositories {',
          '    mavenCentral()',
          '}',
          '',
          'dependencies {',
          ...versions.map(([k, v]) => `    testImplementation '${jvmCoordinate(k).join(':')}:${v}'`),
          '}',
          '',
          'test {',
          '    useJUnitPlatform()',
          '}',
          '',
        ].join('\n'),
      };
    case 'nuget':
      return {
        path: 'ExecutionPlane.csproj',
        content: [
          '<Project Sdk="Microsoft.NET.Sdk">',
          '  <PropertyGroup>',
          '    <TargetFramework>net8.0</TargetFramework>',
          '    <Nullable>enable</Nullable>',
          '    <ImplicitUsings>enable</ImplicitUsings>',
          '  </PropertyGroup>',
          '  <ItemGroup>',
          ...versions.map(([k, v]) => `    <PackageReference Include="${k}" Version="${v}" />`),
          '  </ItemGroup>',
          // Allure.NUnit reads allureConfig.json from the directory the assembly runs in,
          // not from the project root. Without this copy the adapter is installed, configured
          // and silently writing nowhere — which reads exactly like a reporting failure.
          ...(profile.reportingFramework === 'allure' ? [
            '  <ItemGroup>',
            '    <None Update="allureConfig.json">',
            '      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>',
            '    </None>',
            '  </ItemGroup>',
          ] : []),
          '</Project>',
          '',
        ].join('\n'),
      };
    default: {
      const unreachable: never = profile.packageManager;
      throw new Error(`no manifest emitter for package manager: ${String(unreachable)}`);
    }
  }
}

const EMITTERS: Record<TechnologyProfile['language'], LanguageEmitter> = {
  typescript, javascript, python, java, csharp,
};

export function emitterFor(language: TechnologyProfile['language']): LanguageEmitter {
  const e = EMITTERS[language];
  // Not a fallback to TypeScript. Silently emitting the wrong language is the defect
  // this module was written to remove, and a default case would reintroduce it the
  // next time a language is added to the profile enum.
  if (!e) throw new Error(`no emitter for language: ${language}`);
  return e;
}

/** The file extensions a language legitimately emits. Used to prove correctness. */
export const SOURCE_EXTENSIONS: Record<TechnologyProfile['language'], readonly string[]> = {
  typescript: ['.ts'],
  javascript: ['.js'],
  python: ['.py'],
  java: ['.java'],
  csharp: ['.cs'],
};
