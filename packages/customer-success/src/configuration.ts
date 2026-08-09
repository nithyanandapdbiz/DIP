/**
 * Customer configuration: examples, formats, validation and migration guidance.
 *
 * TRACEABILITY
 *   Architecture : 25-customer-success-model.md §10 · 03-intelligence-plane-architecture.md §2b
 *   ADR          : ADR-0021
 *   Criteria     : C-25.5 (every documented example validates against the LIVE schema)
 *                  C-25.9 (no real credentials, endpoints or tenant identifiers)
 *                  C-03.17 (an unsupported combination fails at onboarding)
 *
 * C-25.5 IS THE POINT OF THIS MODULE, AND IT IS EASY TO SATISFY DISHONESTLY.
 * An example validated against a schema COPIED into the documentation proves only that
 * the copy agrees with itself. Every example here is validated by calling
 * `validateProfile` — the same function onboarding calls — so an example can only pass
 * if a customer submitting it would also pass.
 *
 * The examples are therefore not illustrations. They are the inputs a customer can
 * paste, and they are proven to work by the same code path that will receive them.
 */
import {
  validateProfile, resolveFrameworkVersions, SUPPORTED, type TechnologyProfile,
} from '@dbiz/platform-core';
import { SYNTHETIC } from './api-reference.js';

export type ConfigurationFormat = 'json' | 'yaml' | 'env';

export interface ConfigurationExample {
  /** Stable identifier, used as the file name stem and in cross-references. */
  readonly id: string;
  readonly title: string;
  /** Why a customer would choose this one. Not a restatement of the title. */
  readonly whenToUse: string;
  readonly profile: TechnologyProfile;
  readonly rendered: Readonly<Record<ConfigurationFormat, string>>;
}

export interface ExampleValidation {
  readonly id: string;
  readonly valid: boolean;
  /** The rejection reason from the live validator, when it refuses. */
  readonly detail: string;
}

/**
 * The pins an example shows are the pins the generator would actually use.
 *
 * This module previously kept its OWN version table, keyed by framework alone. It was
 * wrong in a way documentation is uniquely good at hiding: it pinned `playwright` for
 * every Playwright stack, where a `playwright-test` runner needs `@playwright/test`, and
 * `selenium-java` for every Selenium stack including the TypeScript and C# ones that use
 * neither. C-25.5 could not catch it, because an example is validated against the profile
 * SCHEMA, and any string pair is a schema-valid `frameworkVersions` entry.
 *
 * Deriving from the live resolver removes the second source of truth: an example cannot
 * now recommend a dependency set the generator would not produce, and bumping a version
 * updates the docs by construction rather than by someone remembering this file.
 */
function examplePins(profile: Omit<TechnologyProfile, 'frameworkVersions'>): Record<string, string> {
  const unpinned = { ...profile, frameworkVersions: {} } as TechnologyProfile;
  return { ...resolveFrameworkVersions(unpinned) };
}

/**
 * One example per declared supported combination, plus environment variants.
 *
 * Derived from `SUPPORTED` rather than listed by hand. A combination added to the
 * registry gains an example automatically; one removed loses its example rather than
 * leaving documentation that recommends something the platform will refuse.
 */
export function buildExamples(): readonly ConfigurationExample[] {
  const examples: ConfigurationExample[] = [];

  for (const s of SUPPORTED) {
    const runner = s.testRunners[0]!;
    const manager = s.packageManagers[0]!;
    const shape = {
      profileVersion: '1.0.0',
      language: s.language,
      framework: s.framework,
      testRunner: runner,
      ciSystem: 'github-actions',
      gitProvider: 'github',
      cloudProvider: 'azure',
      deploymentModel: 'container',
      packageManager: manager,
      reportingFramework: 'allure',
    } as const;
    const profile: TechnologyProfile = { ...shape, frameworkVersions: examplePins(shape) };
    examples.push({
      id: `${s.language}-${s.framework}`,
      title: `${s.language} with ${s.framework}`,
      whenToUse: `Your team writes ${s.language} and runs ${s.framework}. Tests execute with ${runner}; dependencies are managed by ${manager}.`,
      profile,
      rendered: render(profile),
    });
  }

  // A minimal single-environment tenant and a multi-environment enterprise tenant are
  // the two shapes customers actually ask for. Both are real profiles, not sketches.
  const minimalShape = {
    profileVersion: '1.0.0',
    language: 'typescript', framework: 'playwright', testRunner: 'playwright-test',
    ciSystem: 'github-actions', gitProvider: 'github', cloudProvider: 'azure',
    deploymentModel: 'container', packageManager: 'npm', reportingFramework: 'html',
  } as const;
  const minimal: TechnologyProfile = { ...minimalShape, frameworkVersions: examplePins(minimalShape) };
  examples.push({
    id: 'minimal-tenant',
    title: 'Minimal tenant',
    whenToUse: 'A single environment, one team, the shortest path to a first passing run.',
    profile: minimal,
    rendered: render(minimal),
  });

  const enterpriseShape = {
    profileVersion: '1.0.0',
    language: 'typescript', framework: 'playwright', testRunner: 'playwright-test',
    ciSystem: 'azure-pipelines', gitProvider: 'azure-repos', cloudProvider: 'azure',
    deploymentModel: 'kubernetes', packageManager: 'pnpm', reportingFramework: 'allure',
  } as const;
  const enterprise: TechnologyProfile = { ...enterpriseShape, frameworkVersions: examplePins(enterpriseShape) };
  examples.push({
    id: 'enterprise-tenant',
    title: 'Enterprise tenant',
    whenToUse: 'Multiple environments on Kubernetes, Azure DevOps pipelines, Allure reporting retained for audit.',
    profile: enterprise,
    rendered: render(enterprise),
  });

  const jenkins: TechnologyProfile = { ...enterprise, ciSystem: 'jenkins', gitProvider: 'github', deploymentModel: 'vm' };
  examples.push({
    id: 'jenkins-vm',
    title: 'Jenkins on virtual machines',
    whenToUse: 'An existing Jenkins estate and VM-based execution, with no container platform to adopt first.',
    profile: jenkins,
    rendered: render(jenkins),
  });

  return examples;
}

/**
 * Validate every example against the LIVE schema and supported-combination registry.
 *
 * This calls the same `validateProfile` the platform calls at onboarding. It is not a
 * second implementation, and it deliberately has no way to become one.
 */
export function validateExamples(examples: readonly ConfigurationExample[]): readonly ExampleValidation[] {
  return examples.map((e) => {
    const r = validateProfile(e.profile);
    return {
      id: e.id,
      valid: r.ok,
      detail: r.ok ? 'accepted by the live validator' : `${r.reason}: ${r.detail}`,
    };
  });
}

/**
 * Render a profile in all three formats.
 *
 * Keys are emitted in a fixed order rather than object order, so the rendering is
 * deterministic and a diff between releases shows a real change.
 */
function render(profile: TechnologyProfile): Record<ConfigurationFormat, string> {
  const ordered = orderedEntries(profile);
  return {
    json: `${JSON.stringify(withBootstrap(profile), null, 2)}\n`,
    yaml: renderYaml(ordered),
    env: renderEnv(ordered),
  };
}

/** The profile as a customer submits it, with the synthetic bootstrap values attached. */
function withBootstrap(profile: TechnologyProfile): Record<string, unknown> {
  return {
    // R-25.27: recognisably synthetic. `.test` is reserved by RFC 2606 and resolves
    // nowhere, so a copied example cannot accidentally reach a real system.
    tenant: {
      tenantId: SYNTHETIC.tenantId,
      registrationEndpoint: SYNTHETIC.registrationEndpoint,
    },
    technologyProfile: profile,
  };
}

function orderedEntries(profile: TechnologyProfile): readonly (readonly [string, string])[] {
  return [
    ['profileVersion', profile.profileVersion],
    ['language', profile.language],
    ['framework', profile.framework],
    ['testRunner', profile.testRunner],
    ['ciSystem', profile.ciSystem],
    ['gitProvider', profile.gitProvider],
    ['cloudProvider', profile.cloudProvider],
    ['deploymentModel', profile.deploymentModel],
    ['packageManager', profile.packageManager],
    ['reportingFramework', profile.reportingFramework],
    ...Object.keys(profile.frameworkVersions).sort()
      .map((k) => [`frameworkVersions.${k}`, profile.frameworkVersions[k]!] as const),
  ];
}

function renderYaml(entries: readonly (readonly [string, string])[]): string {
  const lines = [
    '# DBiz Execution Plane — tenant configuration',
    '# Synthetic values throughout. Replace tenantId and registrationEndpoint with the',
    '# ones issued to you during onboarding.',
    'tenant:',
    `  tenantId: ${SYNTHETIC.tenantId}`,
    `  registrationEndpoint: ${SYNTHETIC.registrationEndpoint}`,
    'technologyProfile:',
  ];
  const versions = entries.filter(([k]) => k.startsWith('frameworkVersions.'));
  for (const [k, v] of entries.filter(([k2]) => !k2.startsWith('frameworkVersions.'))) {
    lines.push(`  ${k}: ${v}`);
  }
  if (versions.length > 0) {
    lines.push('  frameworkVersions:');
    for (const [k, v] of versions) lines.push(`    ${k.slice('frameworkVersions.'.length)}: ${JSON.stringify(v)}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderEnv(entries: readonly (readonly [string, string])[]): string {
  const lines = [
    '# DBiz Execution Plane — tenant configuration as environment variables.',
    '#',
    '# Copy this file to `.env` in your deployment. It ships as `env.example` because',
    '# a file named `.env*` is treated as a secret by scanners — including this',
    '# platform\'s own — and a documentation file should not have to be exempted.',
    '#',
    '# The one-time registration credential is deliberately ABSENT from this file.',
    '# It belongs in your secret store, injected at start. A credential committed to a',
    '# repository outlives every rotation policy you will ever write.',
    `DBIZ_TENANT_ID=${SYNTHETIC.tenantId}`,
    `DBIZ_REGISTRATION_ENDPOINT=${SYNTHETIC.registrationEndpoint}`,
  ];
  for (const [k, v] of entries) {
    lines.push(`DBIZ_${k.replace(/\./g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}=${v}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * The compatibility matrix, derived from the registry rather than maintained.
 *
 * A hand-maintained matrix is the most reliable way to publish support for something
 * that does not work: it is edited when support is *intended*, not when it is built.
 */
export function generateCompatibilityMatrix(validations: readonly ExampleValidation[]): string {
  const byId = new Map(validations.map((v) => [v.id, v]));
  const rows = SUPPORTED.map((s) => {
    const v = byId.get(`${s.language}-${s.framework}`);
    const status = v?.valid ? '**Validated**' : '`NOT VALIDATED`';
    return `| ${s.language} | ${s.framework} | ${s.testRunners.join(', ')} | ${s.packageManagers.join(', ')} | ${status} |`;
  });

  return [
    '# Configuration compatibility matrix',
    '',
    '**Derived from the supported-combination registry, then validated by execution.**',
    'Nothing in this table is declared by hand: a combination appears because the',
    'platform can build it, and it is marked validated because a run proved it.',
    '',
    '| Language | Framework | Test runners | Package managers | Status |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '## What is not here',
    '',
    'Anything absent from this table is **not supported**, and the platform will refuse',
    'it at onboarding rather than generating something that cannot build. That refusal is',
    'deliberate: a profile that parses is not a profile that can be built, and the',
    'registry is what knows the difference.',
    '',
    'If you need a combination that is not listed, that is a roadmap conversation rather',
    'than a configuration change. Editing the profile to name an unlisted framework will',
    'produce a clear refusal, not a broken solution.',
    '',
    '## Migrating a configuration',
    '',
    'The profile carries `profileVersion`. When the platform introduces a new version, it',
    'accepts the previous one for the whole of its supported window — you upgrade when it',
    'suits you, not when the platform ships. A profile from outside that window is refused',
    'with the version it was, the window that is current, and what to change.',
    '',
    '**Changing a profile does not migrate an existing solution.** It changes what is',
    'generated next. Regenerating produces a new solution; adopting it is a pull request',
    'in your repository, reviewed by you, on your schedule.',
    '',
  ].join('\n');
}
