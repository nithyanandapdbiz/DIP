/**
 * Solution Generation Engine — produces a complete Execution Plane solution from a
 * Technology Profile, deterministically, with no manual engineering.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md §2c · 21-tenant-lifecycle.md §3a
 *   ADR          : ADR-0021 · ADR-0005 (content hashing)
 *   Criteria     : C-03.18 (deterministic — same profile and version, identical bytes)
 *                  C-03.19 (generated output contains no secret material)
 *                  C-03.20 (no generated artefact retained in the Intelligence Plane)
 *                  C-03.21 (generation recorded as profile, versions and hash only)
 *                  C-21.19 (bootstrap carries only tenant id, endpoint, one-time credential)
 *
 * DETERMINISM IS THE LOAD-BEARING PROPERTY.
 * Generation is evidence: the platform must be able to state what it produced for a
 * tenant, and prove it, long after the artefact has left. Non-reproducible generation
 * makes that claim unverifiable — the same input would produce a different output and
 * neither could be shown to be the one delivered.
 *
 * This means: no timestamps in output, no random identifiers, no map-iteration
 * ordering, no host paths. Anything varying between runs is excluded by construction
 * rather than filtered afterwards.
 *
 * Shape and generation only. No inference, no credentials, no customer data.
 */
import { hash, type Digest } from '@dbiz/contracts';
import type { TechnologyProfile } from './technology-profile.js';
import { emitterFor } from './language-emitters.js';
import {
  resolveFrameworkVersions, containerBaseImage, browserInstallCommand,
} from './framework-versions.js';

/** Generator version. Part of the determinism contract: same profile AND same version. */
export const GENERATOR_VERSION = '1.0.0';

/** Template set version, recorded so a later upgrade can compute what changed (R-03.35). */
export const TEMPLATE_VERSION = '1.0.0';

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

export interface BootstrapInputs {
  readonly tenantId: string;
  readonly registrationEndpoint: string;
  /** One-time, single-use, short-lived. NEVER a long-lived key (R-21.33, R-08.42). */
  readonly oneTimeRegistrationCredential: string;
}

export interface GeneratedSolution {
  readonly files: readonly GeneratedFile[];
  readonly generatorVersion: string;
  readonly templateVersion: string;
  readonly contentHash: Digest;
}

/** Deterministic ordering. Sorting by path removes filesystem and insertion order. */
const byPath = (a: GeneratedFile, b: GeneratedFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

const runnerCommand = (p: TechnologyProfile): string => ({
  'playwright-test': 'playwright test',
  jest: 'jest',
  vitest: 'vitest run',
  junit5: 'mvn test',
  nunit: 'dotnet test',
  pytest: 'pytest',
}[p.testRunner]);

/**
 * The install command, matched to what the generated package actually ships.
 *
 * `npm ci` and `pnpm install --frozen-lockfile` REQUIRE a lockfile and fail outright
 * without one — and no lockfile is generated here, because producing one means resolving
 * the dependency graph from a live registry, which is exactly the non-determinism C-03.18
 * forbids. Emitting the frozen form anyway made the first command in the generated CI a
 * guaranteed failure. The versions in the manifest are exact pins, so the resolving form
 * is reproducible in the way that matters; the customer commits the lockfile their first
 * install produces and can move CI to the frozen form from then on.
 */
const installCommand = (p: TechnologyProfile): string => ({
  pnpm: 'pnpm install',
  npm: 'npm install',
  maven: 'mvn -B dependency:go-offline',
  gradle: 'gradle --no-daemon dependencies',
  nuget: 'dotnet restore',
  pip: 'pip install -r requirements.txt',
}[p.packageManager]);

function ciWorkflow(p: TechnologyProfile): GeneratedFile {
  // Install dependencies, then the browsers they drive, then run. The middle step is
  // absent for stacks that need no local browser — a CI file that installs browsers it
  // will not use is as wrong as one that omits browsers it needs.
  const steps = [installCommand(p), browserInstallCommand(p), runnerCommand(p)]
    .filter((s): s is string => s !== null);
  switch (p.ciSystem) {
    case 'github-actions':
      return {
        path: '.github/workflows/qa.yml',
        content: [
          'name: qa',
          'on: [push, pull_request]',
          'jobs:',
          '  test:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: actions/checkout@v4',
          ...steps.map((s) => `      - run: ${s}`),
          '',
        ].join('\n'),
      };
    case 'azure-pipelines':
      return {
        path: 'azure-pipelines.yml',
        content: ['trigger: [main]', 'steps:', ...steps.map((s) => `  - script: ${s}`), ''].join('\n'),
      };
    case 'gitlab-ci':
      return {
        path: '.gitlab-ci.yml',
        content: ['test:', '  script:', ...steps.map((s) => `    - ${s}`), ''].join('\n'),
      };
    case 'jenkins':
      return {
        path: 'Jenkinsfile',
        content: [
          'pipeline {', '  agent any', '  stages {', '    stage("test") {', '      steps {',
          ...steps.map((s) => `        sh "${s}"`), '      }', '    }', '  }', '}', '',
        ].join('\n'),
      };
    default: {
      const unreachable: never = p.ciSystem;
      throw new Error(`unsupported CI system: ${String(unreachable)}`);
    }
  }
}

/**
 * Generate a complete solution.
 *
 * The bootstrap client is the only file carrying tenant-specific values, and it
 * carries exactly three: identifier, endpoint, and a one-time credential. No API
 * key, no client secret, no certificate (C-21.19, R-08.41).
 */
export function generateSolution(
  profile: TechnologyProfile,
  bootstrap: BootstrapInputs,
): GeneratedSolution {
  const files: GeneratedFile[] = [];
  const add = (path: string, content: string) => files.push({ path, content });

  add('README.md', [
    '# Execution Plane',
    '',
    'Generated by the DBiz Platform Core Solution Generation Engine.',
    '',
    `- framework: ${profile.framework}`,
    `- test runner: ${profile.testRunner}`,
    `- package manager: ${profile.packageManager}`,
    `- reporting: ${profile.reportingFramework}`,
    `- deployment: ${profile.deploymentModel} on ${profile.cloudProvider}`,
    `- generator: ${GENERATOR_VERSION}`,
    `- templates: ${TEMPLATE_VERSION}`,
    '',
    '## Ownership',
    '',
    'This repository, its source, its credentials, its test data and its evidence',
    'are yours. The Intelligence Plane stores none of them.',
    '',
    '## First start',
    '',
    'On first start this deployment registers itself. The registration credential is',
    'single-use and expires: it is not an API key and cannot be reused.',
    '',
  ].join('\n'));

  // Execution readiness knobs. `mode` selects the deployment model (Dry Run …
  // DBiz Managed Cloud Live); `strategy` selects the Execution Plane topology and
  // is DERIVED from where the customer runs — a dev/on-prem tenancy is Local, a
  // cloud tenancy is Customer Cloud. Both are operator-overridable at runtime via
  // EP_EXECUTION_MODE / EP_EXECUTION_STRATEGY (see .env.example); an invalid value
  // is a Configuration Error, never silently reinterpreted.
  const executionStrategy = (profile.cloudProvider === 'dev' || profile.cloudProvider === 'on-premises') ? 'local' : 'customer-cloud';
  add('src/config/execution.config.json', `${JSON.stringify({
    // Capability-named, never tool-named (R-7.3, R-14.14).
    execution: { timeoutMs: 30000, maxAttempts: 3, maxConcurrency: 4, mode: 'live', strategy: executionStrategy },
    reporting: { framework: profile.reportingFramework },
    evidence: { retentionDays: 365 },
  }, null, 2)}\n`);

  // Sources come from the language emitter, not from a TypeScript template.
  // The generator previously emitted `.ts` files for every language in the supported
  // registry — a customer selecting `python` received `register.ts`. See
  // language-emitters.ts for why that is the failure C-25.8 exists to catch.
  const emitter = emitterFor(profile.language);
  for (const f of emitter.files(profile, bootstrap)) add(f.path, f.content);

  // Framework versions are PINNED into the dependency manifest.
  //
  // Added because a test asserted every declared profile field must change the
  // generated output, and this one did not — the field was declared, validated and
  // read by nothing, which is exactly the configuration theatre R-03.27 forbids.
  // Pinning is also the honest use of the field: an unpinned framework version makes
  // the customer's build non-reproducible, undoing C-03.18 one layer down.
  //
  // RESOLVED, not read. The field alone was not enough: nothing on the onboarding path
  // ever wrote to it, so every real tenant reached here with `{}` and received a
  // manifest declaring no dependencies at all. resolveFrameworkVersions derives the set
  // from the declared stack and lets an explicit pin override it — see framework-versions.ts.
  add('dependencies.lock.json', `${JSON.stringify({
    language: profile.language,
    packageManager: profile.packageManager,
    frameworkVersions: resolveFrameworkVersions(profile),
  }, null, 2)}\n`);

  add(`${emitter.testDirectory}/.gitkeep`, '');
  add('testdata/.gitkeep', '');

  add('Dockerfile', [
    '# Execution Plane image. Runs in the customer tenancy.',
    // The base image follows the language AND the framework. A Java solution on a Node
    // base image is a solution that cannot start, and it would look correct in every
    // review; so is a Playwright solution on an image with no browser in it.
    `FROM ${containerBaseImage(profile, emitter.dockerBaseImage)}`,
    'WORKDIR /app',
    'COPY . .',
    `RUN ${installCommand(profile)}`,
    `CMD ["sh", "-c", "${runnerCommand(profile)}"]`,
    '',
  ].join('\n'));

  add('deploy/deployment.yaml', [
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    '  name: execution-plane-config',
    'data:',
    `  deploymentModel: ${profile.deploymentModel}`,
    `  cloudProvider: ${profile.cloudProvider}`,
    '',
  ].join('\n'));

  files.push(ciWorkflow(profile));

  add('docs/CODING-STANDARDS.md', [
    '# Coding standards',
    '',
    `- language: ${profile.language}`,
    '- no credential literals in source; resolve at point of use',
    '- no customer content in logs',
    '- evidence paths are tenant-leading',
    '',
  ].join('\n'));

  add('docs/OPERATIONS.md', [
    '# Operations',
    '',
    'This deployment initiates all communication outbound. It never accepts inbound',
    'connections from the Intelligence Plane, for any purpose.',
    '',
  ].join('\n'));

  const sorted = [...files].sort(byPath);

  // The hash covers ordered path+content pairs only. It deliberately excludes any
  // wall-clock value: a timestamp would make every generation differ and destroy
  // the property this hash exists to prove.
  const contentHash = hash('dbiz.execution-package@1', {
    generatorVersion: GENERATOR_VERSION,
    templateVersion: TEMPLATE_VERSION,
    files: sorted.map((f) => [f.path, f.content]),
  });

  return { files: sorted, generatorVersion: GENERATOR_VERSION, templateVersion: TEMPLATE_VERSION, contentHash };
}

/**
 * What the Intelligence Plane retains about a generation: metadata only.
 *
 * Sufficient to prove what was produced, without holding it (R-03.34). The same
 * move as an evidence hash: it answers "what did you generate?" without retaining
 * the answer's contents.
 */
export interface GenerationRecord {
  readonly tenantId: string;
  readonly profile: TechnologyProfile;
  readonly generatorVersion: string;
  readonly templateVersion: string;
  readonly contentHash: Digest;
  readonly fileCount: number;
}

export function recordGeneration(
  tenantId: string,
  profile: TechnologyProfile,
  solution: GeneratedSolution,
): GenerationRecord {
  return {
    tenantId,
    profile,
    generatorVersion: solution.generatorVersion,
    templateVersion: solution.templateVersion,
    contentHash: solution.contentHash,
    fileCount: solution.files.length,
  };
}
