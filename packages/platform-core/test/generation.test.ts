/**
 * Platform Core — profile validation and deterministic solution generation.
 * TRACEABILITY: 03 §2b-2d · 21 §3a-3b · ADR-0021
 * Criteria: C-03.15, C-03.16, C-03.17, C-03.18, C-03.19, C-03.21, C-21.19, C-21.20
 * Categories: unit, contract, negative, security, determinism, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProfile, generateSolution, recordGeneration, resolveFrameworkVersions,
  PROFILE_FIELDS, SUPPORTED, GENERATOR_VERSION,
} from '../src/index.js';
import type { TechnologyProfile, BootstrapInputs } from '../src/index.js';

const profile: TechnologyProfile = {
  profileVersion: '1.0.0',
  language: 'typescript',
  framework: 'playwright',
  testRunner: 'playwright-test',
  ciSystem: 'github-actions',
  gitProvider: 'github',
  cloudProvider: 'azure',
  deploymentModel: 'container',
  packageManager: 'pnpm',
  reportingFramework: 'allure',
  frameworkVersions: { playwright: '1.49.0' },
};

const bootstrap: BootstrapInputs = {
  tenantId: 'tenant-alpha',
  registrationEndpoint: 'https://registration.example.test/v1/register',
  oneTimeRegistrationCredential: 'otc-single-use-value',
};

describe('technology profile validation (C-03.17)', () => {
  test('accepts a supported combination', () => {
    assert.equal(validateProfile(profile).ok, true);
  });

  test('rejects an unsupported language and framework pairing', () => {
    const r = validateProfile({ ...profile, language: 'java', framework: 'playwright' });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, 'unsupported-combination');
  });

  test('rejects a runner that parses but cannot be built for the stack', () => {
    // `pytest` is a declared runner and `typescript` a declared language, so the
    // schema accepts each field. Only the combination registry knows the pairing
    // is unbuildable — which is the distinction C-03.17 exists to enforce.
    const r = validateProfile({ ...profile, testRunner: 'pytest' });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, 'unsupported-combination');
  });

  test('rejects an unsupported package manager for the language', () => {
    const r = validateProfile({ ...profile, packageManager: 'maven' });
    assert.equal(r.ok === false && r.reason, 'unsupported-combination');
  });

  test('rejects a malformed profile with a distinct reason', () => {
    const r = validateProfile({ language: 'typescript' });
    assert.equal(r.ok === false && r.reason, 'malformed');
  });

  test('rejection is returned, never thrown, so the failing stage can be named', () => {
    assert.doesNotThrow(() => validateProfile({ nonsense: true }));
  });

  test('every declared profile field is consumed by generation (C-03.16)', () => {
    // A field no generator reads is configuration theatre. Each field is perturbed
    // and generation must change — except profileVersion and gitProvider, which are
    // recorded rather than rendered, and are asserted separately below.
    const base = generateSolution(profile, bootstrap).contentHash.value;
    const rendered: Record<string, unknown> = {
      language: 'javascript', framework: 'selenium', testRunner: 'vitest',
      ciSystem: 'jenkins', cloudProvider: 'aws', deploymentModel: 'kubernetes',
      packageManager: 'npm', reportingFramework: 'html',
      frameworkVersions: { playwright: '9.9.9' },
    };
    for (const [field, value] of Object.entries(rendered)) {
      const candidate = { ...profile, [field]: value } as TechnologyProfile;
      const v = validateProfile(candidate);
      const usable = v.ok ? v.profile : { ...profile, [field]: value } as TechnologyProfile;
      const changed = generateSolution(usable, bootstrap).contentHash.value !== base;
      assert.equal(changed, true, `profile field "${field}" does not affect generated output`);
    }
    // The remaining two are recorded in the generation record rather than rendered.
    const record = recordGeneration('t', profile, generateSolution(profile, bootstrap));
    assert.equal(record.profile.profileVersion, profile.profileVersion);
    assert.equal(record.profile.gitProvider, profile.gitProvider);
    assert.equal(PROFILE_FIELDS.length, 11);
  });

  test('the supported registry is non-empty and internally coherent', () => {
    assert.ok(SUPPORTED.length > 0);
    for (const s of SUPPORTED) {
      assert.ok(s.testRunners.length > 0, `${s.language}/${s.framework} declares no runner`);
      assert.ok(s.packageManagers.length > 0, `${s.language}/${s.framework} declares no package manager`);
    }
  });
});

describe('deterministic generation (C-03.18)', () => {
  test('two generations from one profile are byte-identical', () => {
    const a = generateSolution(profile, bootstrap);
    const b = generateSolution(profile, bootstrap);
    assert.equal(a.files.length, b.files.length);
    for (let i = 0; i < a.files.length; i += 1) {
      assert.equal(a.files[i]!.path, b.files[i]!.path);
      assert.equal(a.files[i]!.content, b.files[i]!.content, `content differs at ${a.files[i]!.path}`);
    }
    assert.equal(a.contentHash.value, b.contentHash.value);
  });

  test('generation remains identical across many repetitions', () => {
    // A single repeat would not catch non-determinism that surfaces occasionally —
    // map iteration order, for instance, is stable until it is not.
    const first = generateSolution(profile, bootstrap).contentHash.value;
    for (let i = 0; i < 25; i += 1) {
      assert.equal(generateSolution(profile, bootstrap).contentHash.value, first);
    }
  });

  test('output is emitted in a stable, path-sorted order', () => {
    const paths = generateSolution(profile, bootstrap).files.map((f) => f.path);
    assert.deepEqual(paths, [...paths].sort());
  });

  test('a different profile produces a different hash', () => {
    const a = generateSolution(profile, bootstrap);
    const b = generateSolution({ ...profile, ciSystem: 'jenkins' }, bootstrap);
    assert.notEqual(a.contentHash.value, b.contentHash.value);
  });

  test('output contains no wall-clock value that would break determinism', () => {
    const all = generateSolution(profile, bootstrap).files.map((f) => f.content).join('\n');
    // ISO timestamps and epoch-like integers are the usual sources of drift.
    assert.equal(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(all), false, 'a timestamp leaked into output');
    assert.equal(/\b1[6-9]\d{11}\b/.test(all), false, 'an epoch millisecond value leaked into output');
  });
});

describe('generated output carries no secret (C-03.19, C-21.20)', () => {
  test('the bootstrap client carries exactly three registration values', () => {
    const boot = generateSolution(profile, bootstrap).files
      .find((f) => f.path === 'src/bootstrap/register.ts');
    assert.ok(boot, 'bootstrap client not generated');
    assert.ok(boot.content.includes('TENANT_ID'));
    assert.ok(boot.content.includes('REGISTRATION_ENDPOINT'));
    assert.ok(boot.content.includes('ONE_TIME_REGISTRATION_CREDENTIAL'));
    assert.ok(boot.content.includes('REGISTRATION_IS_SINGLE_USE'));
  });

  test('no generated file contains an API key, client secret or private key', () => {
    const forbidden = /api[_-]?key|client[_-]?secret|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|bearer /i;
    for (const f of generateSolution(profile, bootstrap).files) {
      assert.equal(forbidden.test(f.content), false, `secret-shaped content in ${f.path}`);
    }
  });

  test('the one-time credential appears once, and only in the bootstrap client', () => {
    const carrying = generateSolution(profile, bootstrap).files
      .filter((f) => f.content.includes(bootstrap.oneTimeRegistrationCredential));
    assert.deepEqual(carrying.map((f) => f.path), ['src/bootstrap/register.ts']);
  });
});

describe('generation record is metadata only (C-03.21)', () => {
  test('the record carries profile, versions, hash and count — never file content', () => {
    const solution = generateSolution(profile, bootstrap);
    const record = recordGeneration('tenant-alpha', profile, solution);
    assert.equal(record.generatorVersion, GENERATOR_VERSION);
    assert.equal(record.fileCount, solution.files.length);
    assert.equal(record.contentHash.value, solution.contentHash.value);
    const serialised = JSON.stringify(record);
    for (const f of solution.files) {
      if (f.content.trim() === '') continue;
      assert.equal(serialised.includes(f.content), false, `record retains content of ${f.path}`);
    }
  });

  test('the record does not carry the one-time credential', () => {
    const record = recordGeneration('t', profile, generateSolution(profile, bootstrap));
    assert.equal(JSON.stringify(record).includes(bootstrap.oneTimeRegistrationCredential), false);
  });
});

/**
 * REGRESSION — the generated solution must be able to start.
 *
 * Every tenant onboarded through the wizard arrived at generation with
 * `frameworkVersions: {}`, because nothing on that path ever wrote to it. The manifest
 * is built from that map, so the delivered package named `playwright test` as its test
 * command and declared no dependencies at all. Determinism, secret-freeness and file
 * count were all green: none of them asks whether the thing runs.
 *
 * These tests ask that. They are written against the EMPTY-versions profile deliberately,
 * because that is the shape every real tenant had and no test used.
 */
describe('a generated solution is installable and runnable (regression)', () => {
  const bare = (over: Partial<TechnologyProfile>): TechnologyProfile =>
    ({ ...profile, frameworkVersions: {}, ...over }) as TechnologyProfile;

  test('every declared supported stack resolves to real dependencies', () => {
    // C-25.8 applied to the manifest: declaring support for a stack whose generated
    // package installs nothing is the same class of claim as emitting the wrong language.
    for (const s of SUPPORTED) {
      for (const runner of s.testRunners) {
        const resolved = resolveFrameworkVersions(bare({
          language: s.language, framework: s.framework, testRunner: runner,
          packageManager: s.packageManagers[0]!,
        }));
        assert.ok(
          Object.keys(resolved).length > 0,
          `${s.language} + ${s.framework} + ${runner} resolves to no dependencies`,
        );
      }
    }
  });

  test('a profile declaring no versions still ships a manifest that installs the framework', () => {
    const solution = generateSolution(bare({
      language: 'javascript', framework: 'playwright', testRunner: 'playwright-test', packageManager: 'npm',
    }), bootstrap);
    const manifest = solution.files.find((f) => f.path === 'package.json');
    assert.ok(manifest, 'no dependency manifest generated');
    const parsed = JSON.parse(manifest.content) as { scripts: Record<string, string>; devDependencies: Record<string, string> };
    assert.ok(Object.keys(parsed.devDependencies).length > 0, 'the manifest declares no dependencies');
    assert.ok(parsed.devDependencies['@playwright/test'], 'the declared framework is not installed by the manifest');
    // The command and the dependency that provides it must agree. They did not before.
    assert.equal(parsed.scripts['test'], 'playwright test');
  });

  test('the selected reporting framework is wired into the runner, not just recorded', () => {
    const allure = generateSolution(bare({}), bootstrap).files.find((f) => f.path === 'playwright.config.ts');
    assert.ok(allure, 'no runner configuration generated');
    assert.match(allure.content, /allure-playwright/);
    const html = generateSolution(bare({ reportingFramework: 'html' }), bootstrap)
      .files.find((f) => f.path === 'playwright.config.ts');
    assert.ok(html);
    assert.match(html.content, /'html'/);
    assert.equal(/allure/.test(html.content), false, 'an unselected reporter leaked into the configuration');
  });

  test('the runner is pointed at the suite the capability config declares', () => {
    // config/capabilities.json declares `suite: "tests/functional"` and nothing generated
    // pointed a runner at it, because no runner configuration was generated at all.
    const config = generateSolution(bare({}), bootstrap).files
      .find((f) => f.path === 'playwright.config.ts');
    assert.ok(config, 'no runner configuration generated');
    assert.match(config.content, /testDir: 'tests\/functional'/);
  });

  test('the generator configures the suite directory without writing into it', () => {
    // `tests/` is reserved Execution-Plane ground: the suite is authored by the customer
    // and by the functional-testing capability, so generating a spec there would overwrite
    // their work on the next routine regeneration. solution-export refuses such a package
    // outright; this asserts the same boundary at the layer that would breach it.
    // `tests/.gitkeep` is the one declared exception, and the worked example ships under
    // docs/ to be COPIED rather than inherited.
    const files = generateSolution(bare({}), bootstrap).files;
    const intoReserved = files
      .map((f) => f.path)
      .filter((p) => (p.startsWith('tests/') || p.startsWith('src/runtime/')) && p !== 'tests/.gitkeep');
    assert.deepEqual(intoReserved, [], 'generation writes into reserved Execution-Plane ground');
    assert.ok(
      files.some((f) => f.path.startsWith('docs/examples/')),
      'no worked example ships for the customer to copy into the suite',
    );
  });

  test('a browser-driving stack is packaged with a browser', () => {
    const dockerfile = generateSolution(bare({}), bootstrap).files.find((f) => f.path === 'Dockerfile');
    assert.ok(dockerfile);
    assert.match(dockerfile.content, /mcr\.microsoft\.com\/playwright/);
    // Selenium drives a remote browser, so it must NOT be given a local one.
    const selenium = generateSolution(bare({ framework: 'selenium', testRunner: 'jest' }), bootstrap)
      .files.find((f) => f.path === 'Dockerfile');
    assert.ok(selenium);
    assert.equal(/mcr\.microsoft\.com\/playwright/.test(selenium.content), false);
  });

  test('CI installs the browsers the stack drives', () => {
    const ci = generateSolution(bare({}), bootstrap).files
      .find((f) => f.path === '.github/workflows/qa.yml');
    assert.ok(ci);
    assert.match(ci.content, /playwright install --with-deps/);
  });

  test('no generated build step requires a lockfile the package does not ship', () => {
    // `npm ci` and `pnpm install --frozen-lockfile` both abort without a lockfile, and
    // generation cannot produce one without resolving from a live registry (C-03.18).
    for (const packageManager of ['npm', 'pnpm'] as const) {
      const solution = generateSolution(bare({ packageManager }), bootstrap);
      assert.equal(
        solution.files.some((f) => f.path === 'package-lock.json' || f.path === 'pnpm-lock.yaml'),
        false,
        'a lockfile is generated — this assertion is now testing the wrong thing',
      );
      for (const f of solution.files) {
        assert.equal(/npm ci\b|--frozen-lockfile/.test(f.content), false, `${f.path} requires an absent lockfile`);
      }
    }
  });

  test('JVM coordinates name the group each artefact actually belongs to', () => {
    // Every dependency was previously emitted under the Selenium group, so the moment a
    // second group appeared the POM named artefacts that do not exist.
    const pom = generateSolution(bare({
      language: 'java', framework: 'selenium', testRunner: 'junit5', packageManager: 'maven',
    }), bootstrap).files.find((f) => f.path === 'pom.xml');
    assert.ok(pom);
    assert.match(pom.content, /<groupId>org\.seleniumhq\.selenium<\/groupId>/);
    assert.match(pom.content, /<groupId>org\.junit\.jupiter<\/groupId>/);
    assert.equal(/<artifactId>[^<]*:[^<]*<\/artifactId>/.test(pom.content), false, 'a coordinate leaked into an artifactId');
  });

  test('every supported stack points its runner at the suite and wires the reporter', () => {
    // Parity across stacks, asserted as one property rather than per language. Each stack
    // must (a) resolve dependencies, (b) carry a runner configuration that names the
    // declared suite directory, and (c) name its selected reporter somewhere the runner
    // reads. A stack satisfying only (a) installs a framework it never configures.
    const CONFIG_FOR: Readonly<Record<string, string>> = {
      'playwright-test': 'playwright.config',
      pytest: 'pytest.ini',
    };
    for (const s of SUPPORTED) {
      for (const runner of s.testRunners) {
        const key = CONFIG_FOR[runner];
        if (!key) continue; // jest/vitest/junit5/nunit — asserted separately below
        const files = generateSolution(bare({
          language: s.language, framework: s.framework, testRunner: runner,
          packageManager: s.packageManagers[0]!,
        }), bootstrap).files;
        const config = files.find((f) => f.path.startsWith(key));
        assert.ok(config, `${s.language}/${runner}: no runner configuration generated`);
        assert.ok(
          config.content.includes('tests/functional'),
          `${s.language}/${runner}: the runner is not pointed at the declared suite`,
        );
        assert.match(config.content, /allure/, `${s.language}/${runner}: the reporter is not wired`);
      }
    }
  });

  test('Allure on the JVM and .NET ships the file its adapter actually reads', () => {
    const jvm = generateSolution(bare({
      language: 'java', framework: 'selenium', testRunner: 'junit5', packageManager: 'maven',
    }), bootstrap).files;
    assert.ok(jvm.find((f) => f.path === 'src/test/resources/allure.properties'),
      'allure-junit5 is installed with no results directory configured');

    const dotnet = generateSolution(bare({
      language: 'csharp', framework: 'selenium', testRunner: 'nunit', packageManager: 'nuget',
    }), bootstrap).files;
    const config = dotnet.find((f) => f.path === 'allureConfig.json');
    assert.ok(config, 'Allure.NUnit is installed with no configuration file');
    assert.equal(JSON.parse(config.content).allure.directory, 'allure-results');
    // Installed + configured is still nothing if the file never reaches the output
    // directory the adapter reads it from.
    const csproj = dotnet.find((f) => f.path === 'ExecutionPlane.csproj');
    assert.ok(csproj);
    assert.match(csproj.content, /<None Update="allureConfig\.json">/);
  });

  test('a reporting format the runner lacks natively installs an adapter for it', () => {
    // "Built in" is a property of the runner, not the format. jest ships neither JUnit
    // XML nor HTML; configuring either without its package configures nothing.
    const jestJunit = resolveFrameworkVersions(bare({
      language: 'javascript', framework: 'playwright', testRunner: 'jest',
      packageManager: 'npm', reportingFramework: 'junit-xml',
    }));
    assert.ok(jestJunit['jest-junit'], 'jest is asked for JUnit XML it cannot produce');
    const pytestHtml = resolveFrameworkVersions(bare({
      language: 'python', framework: 'playwright', testRunner: 'pytest',
      packageManager: 'pip', reportingFramework: 'html',
    }));
    assert.ok(pytestHtml['pytest-html'], 'pytest is asked for HTML it cannot produce');
    // Playwright genuinely does ship both, so it must NOT pull an adapter in.
    const pwHtml = resolveFrameworkVersions(bare({ reportingFramework: 'html' }));
    assert.equal(Object.keys(pwHtml).some((k) => k.includes('html')), false,
      'an adapter was installed for a format the runner already produces');
  });

  test('an explicit pin still overrides the registry default', () => {
    // The registry is a default, not a ceiling: a customer holding a specific release
    // must still be able to say so, or the field is decorative in the other direction.
    const resolved = resolveFrameworkVersions({ ...profile, frameworkVersions: { '@playwright/test': '1.40.0' } });
    assert.equal(resolved['@playwright/test'], '1.40.0');
  });
});
