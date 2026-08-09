/**
 * Pinned dependency sets for every declared supported stack.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md §2c
 *   ADR          : ADR-0021
 *   Criteria     : C-03.16 (every declared profile field changes generated output)
 *                  C-03.18 (deterministic — same profile and version, identical bytes)
 *                  C-25.8  (every declared supported target validates)
 *
 * WHY THIS EXISTS.
 * `TechnologyProfile.frameworkVersions` is the map the dependency manifest is built
 * from, and nothing on the onboarding path ever wrote to it. Every tenant onboarded
 * through the wizard therefore received a solution whose declared framework appeared
 * in every script and in no manifest: `package.json` named `playwright test` as its
 * test command and carried `"devDependencies": {}`. The customer's first command
 * failed, and the profile field that was supposed to prevent it was empty.
 *
 * That is the declared-but-unbuilt failure (R-11.2) one layer below the generator:
 * the stack was selected, recorded, validated and rendered into scripts, and never
 * installed. A default of `{}` is not a neutral default — it is a solution that
 * cannot start, shipped as though it could.
 *
 * So the versions are resolved HERE, at generation, from the declared stack. The
 * registry is a DEFAULT, not a ceiling: an explicit pin in the profile overrides it,
 * which is what keeps the field meaningful for a customer who needs a specific
 * release. What it removes is the empty case.
 *
 * DETERMINISM. Every version below is a literal. Nothing is resolved from a registry,
 * a lockfile or the network at generation time — that would make the same profile
 * produce different bytes on different days and undo C-03.18. Bumping a version is an
 * edit to this file, reviewed like any other, and it moves TEMPLATE_VERSION.
 *
 * A SEPARATE MODULE, deliberately. `language-emitters.ts` is replaced wholesale by the
 * `wrong-language-generator` fault probe in governance/verification/record-fault-proofs.js.
 * Resolution living here means that probe continues to test what it was written to test
 * rather than failing on a missing import.
 */
import type { TechnologyProfile } from './technology-profile.js';

/**
 * The Playwright release generated solutions pin.
 *
 * Also selects the container image tag: the browsers baked into `mcr.microsoft.com/playwright`
 * are built against a specific client, and a mismatch between the two is the single most
 * common way a working suite fails only inside the container.
 */
export const PLAYWRIGHT_VERSION = '1.49.0';

const SELENIUM_VERSION = '4.27.0';
const SELENIUM_TYPES_VERSION = '4.1.28';
const TYPESCRIPT_VERSION = '5.7.2';
const JEST_VERSION = '29.7.0';
const VITEST_VERSION = '2.1.8';
const PYTEST_VERSION = '8.3.4';
const PYTEST_PLAYWRIGHT_VERSION = '0.6.2';
const PYTEST_HTML_VERSION = '4.1.1';
const JEST_JUNIT_VERSION = '16.0.0';
const JEST_HTML_VERSION = '4.0.1';
const JUNIT_VERSION = '5.11.3';
const NUNIT_VERSION = '4.2.2';
const NUNIT_ADAPTER_VERSION = '4.6.0';
const DOTNET_TEST_SDK_VERSION = '17.12.0';

/** Allure adapters. One release line across the JS runners; the JVM and .NET lines differ. */
const ALLURE_JS_VERSION = '3.0.7';
const ALLURE_PYTHON_VERSION = '2.13.5';
const ALLURE_JVM_VERSION = '2.29.0';
const ALLURE_DOTNET_VERSION = '2.12.1';

type Dependencies = Readonly<Record<string, string>>;

/**
 * The stack's own dependencies, keyed by the exact triple that determines them.
 *
 * Keyed on all three fields rather than composed from parts because the parts are not
 * independent: `typescript + playwright` needs `@playwright/test` under the Playwright
 * runner and the bare `playwright` driver under vitest. A composed table would state
 * that relationship implicitly and get it wrong the first time a runner was added.
 *
 * One entry per pairing in SUPPORTED. A combination absent here resolves to no
 * dependencies, which validateProfile has already refused as unbuildable (C-03.17).
 *
 * Maven and Gradle keys carry full `group:artifact` coordinates. npm, pip and NuGet
 * names are flat, as those ecosystems have no separate group.
 */
const STACK_DEPENDENCIES: Readonly<Record<string, Dependencies>> = {
  'typescript|playwright|playwright-test': {
    '@playwright/test': PLAYWRIGHT_VERSION,
    typescript: TYPESCRIPT_VERSION,
  },
  'typescript|playwright|vitest': {
    playwright: PLAYWRIGHT_VERSION,
    vitest: VITEST_VERSION,
    typescript: TYPESCRIPT_VERSION,
  },
  'typescript|selenium|jest': {
    'selenium-webdriver': SELENIUM_VERSION,
    '@types/selenium-webdriver': SELENIUM_TYPES_VERSION,
    jest: JEST_VERSION,
    typescript: TYPESCRIPT_VERSION,
  },
  'typescript|selenium|vitest': {
    'selenium-webdriver': SELENIUM_VERSION,
    '@types/selenium-webdriver': SELENIUM_TYPES_VERSION,
    vitest: VITEST_VERSION,
    typescript: TYPESCRIPT_VERSION,
  },
  'javascript|playwright|playwright-test': {
    '@playwright/test': PLAYWRIGHT_VERSION,
  },
  'javascript|playwright|jest': {
    playwright: PLAYWRIGHT_VERSION,
    jest: JEST_VERSION,
  },
  'java|selenium|junit5': {
    'org.seleniumhq.selenium:selenium-java': SELENIUM_VERSION,
    'org.junit.jupiter:junit-jupiter': JUNIT_VERSION,
  },
  'csharp|selenium|nunit': {
    'Selenium.WebDriver': SELENIUM_VERSION,
    NUnit: NUNIT_VERSION,
    NUnit3TestAdapter: NUNIT_ADAPTER_VERSION,
    'Microsoft.NET.Test.Sdk': DOTNET_TEST_SDK_VERSION,
  },
  'python|playwright|pytest': {
    playwright: PLAYWRIGHT_VERSION,
    pytest: PYTEST_VERSION,
    'pytest-playwright': PYTEST_PLAYWRIGHT_VERSION,
  },
};

/**
 * Reporting adapters, keyed by reporting framework and runner.
 *
 * An ABSENT key means the runner produces that format natively and needs no package.
 * The absences are stated per PAIRING rather than per format, because "built in" is a
 * property of the runner, not of the format: Playwright ships JUnit and HTML reporters,
 * jest ships neither, vitest and pytest ship JUnit but not HTML. Treating a format as
 * universally built in installs nothing and then configures a reporter that does not
 * exist — the same failure as the empty manifest, one field along.
 *
 * The Allure adapter is always runner-specific: `allure-playwright` cannot report a
 * jest run.
 */
const REPORTING_DEPENDENCIES: Readonly<Record<string, Dependencies>> = {
  // Allure — a distinct adapter per runner.
  'allure|playwright-test': { 'allure-playwright': ALLURE_JS_VERSION },
  'allure|jest': { 'allure-jest': ALLURE_JS_VERSION },
  'allure|vitest': { 'allure-vitest': ALLURE_JS_VERSION },
  'allure|pytest': { 'allure-pytest': ALLURE_PYTHON_VERSION },
  'allure|junit5': { 'io.qameta.allure:allure-junit5': ALLURE_JVM_VERSION },
  'allure|nunit': { 'Allure.NUnit': ALLURE_DOTNET_VERSION },
  // JUnit XML — native to Playwright, vitest, pytest, Surefire and the .NET test SDK.
  // jest is the one runner that needs its own reporter package.
  'junit-xml|jest': { 'jest-junit': JEST_JUNIT_VERSION },
  // HTML — native to Playwright only.
  'html|jest': { 'jest-html-reporter': JEST_HTML_VERSION },
  'html|vitest': { '@vitest/ui': VITEST_VERSION },
  'html|pytest': { 'pytest-html': PYTEST_HTML_VERSION },
};

/**
 * The effective, pinned dependency set for a profile.
 *
 * Resolution order — stack, then reporting adapter, then the profile's own pins. The
 * profile wins last on purpose: a customer who has to hold a specific release can say
 * so, and the registry supplies everything they did not name. Before this existed the
 * profile was the ONLY source, so saying nothing meant getting nothing.
 *
 * Returned key-sorted so map iteration order cannot reach the generated bytes.
 */
export function resolveFrameworkVersions(profile: TechnologyProfile): Readonly<Record<string, string>> {
  const stack = STACK_DEPENDENCIES[`${profile.language}|${profile.framework}|${profile.testRunner}`] ?? {};
  const reporting = REPORTING_DEPENDENCIES[`${profile.reportingFramework}|${profile.testRunner}`] ?? {};
  const merged: Record<string, string> = { ...stack, ...reporting, ...profile.frameworkVersions };
  return Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]!] as const));
}

/** Whether the stack drives a real browser, and therefore needs one present to run. */
export function browsersRequired(profile: TechnologyProfile): boolean {
  return profile.framework === 'playwright';
}

/**
 * The container base image for the stack.
 *
 * A Playwright suite on a bare language image installs, builds, and then fails at the
 * first `page.goto` because no browser exists — a failure that looks like a test defect
 * and is a packaging defect. The Playwright images carry the browsers and their system
 * libraries, pinned to the same client version resolved above.
 *
 * Selenium keeps the language image: it drives a browser over the wire (a grid or a
 * remote endpoint), so baking one into this container would be dead weight.
 */
export function containerBaseImage(profile: TechnologyProfile, languageDefault: string): string {
  if (profile.framework !== 'playwright') return languageDefault;
  switch (profile.language) {
    case 'typescript':
    case 'javascript':
      return `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`;
    case 'python':
      return `mcr.microsoft.com/playwright/python:v${PLAYWRIGHT_VERSION}-noble`;
    default:
      return languageDefault;
  }
}

/**
 * The command that installs browsers in CI, or null when the stack needs none.
 *
 * Only CI. The container base image above already carries them, and running the
 * installer there would download a second copy of what is already present.
 */
export function browserInstallCommand(profile: TechnologyProfile): string | null {
  if (profile.framework !== 'playwright') return null;
  switch (profile.language) {
    case 'typescript':
    case 'javascript':
      return 'npx playwright install --with-deps';
    case 'python':
      return 'python -m playwright install --with-deps';
    default:
      return null;
  }
}
