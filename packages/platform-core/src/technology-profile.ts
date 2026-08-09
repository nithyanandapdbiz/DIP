/**
 * Technology Profile — the declared customer stack that drives solution generation.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md §2b · 21-tenant-lifecycle.md §3a
 *   ADR          : ADR-0021 (Platform Core bounded context)
 *   Criteria     : C-03.15 (no profile field influences IP implementation)
 *                  C-03.16 (every declared field is consumed by generator code)
 *                  C-03.17 (an unsupported combination fails at onboarding)
 *
 * A profile describes what is generated FOR THE CUSTOMER. It never describes what
 * DBiz builds — R-03.26. That direction is what keeps the platform tool-agnostic on
 * both sides: without it, a customer's stack choice would exert pressure on the
 * Intelligence Plane's own implementation.
 *
 * Shape and validation only. No business logic.
 */
import { z } from 'zod';

/**
 * Supported values, enumerated. An open string would let onboarding accept a stack
 * no generator can build, and the failure would surface in the customer's first
 * build rather than at onboarding (C-03.17).
 */
export const LANGUAGES = ['typescript', 'javascript', 'java', 'csharp', 'python'] as const;
export const FRAMEWORKS = ['playwright', 'selenium'] as const;
export const TEST_RUNNERS = ['playwright-test', 'jest', 'vitest', 'junit5', 'nunit', 'pytest'] as const;
export const CI_SYSTEMS = ['github-actions', 'azure-pipelines', 'gitlab-ci', 'jenkins'] as const;
export const GIT_PROVIDERS = ['github', 'azure-repos', 'gitlab', 'bitbucket'] as const;
export const CLOUD_PROVIDERS = ['azure', 'aws', 'gcp', 'on-premises', 'dev'] as const;
export const DEPLOYMENT_MODELS = ['container', 'kubernetes', 'vm'] as const;
export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'maven', 'gradle', 'nuget', 'pip'] as const;
export const REPORTING_FRAMEWORKS = ['allure', 'junit-xml', 'html'] as const;

export const TechnologyProfileSchema = z.object({
  profileVersion: z.literal('1.0.0'),
  language: z.enum(LANGUAGES),
  framework: z.enum(FRAMEWORKS),
  testRunner: z.enum(TEST_RUNNERS),
  ciSystem: z.enum(CI_SYSTEMS),
  gitProvider: z.enum(GIT_PROVIDERS),
  cloudProvider: z.enum(CLOUD_PROVIDERS),
  deploymentModel: z.enum(DEPLOYMENT_MODELS),
  packageManager: z.enum(PACKAGE_MANAGERS),
  reportingFramework: z.enum(REPORTING_FRAMEWORKS),
  frameworkVersions: z.record(z.string(), z.string()),
});

export type TechnologyProfile = z.infer<typeof TechnologyProfileSchema>;

/**
 * Combinations the generator can actually build.
 *
 * This registry is the difference between "the profile parsed" and "we can build
 * it". A schema proves each field is a known value; only this proves the fields
 * are coherent together. `python` + `playwright-test` parses and is unbuildable.
 */
interface SupportedCombination {
  readonly language: (typeof LANGUAGES)[number];
  readonly framework: (typeof FRAMEWORKS)[number];
  readonly testRunners: readonly (typeof TEST_RUNNERS)[number][];
  readonly packageManagers: readonly (typeof PACKAGE_MANAGERS)[number][];
}

export const SUPPORTED: readonly SupportedCombination[] = [
  { language: 'typescript', framework: 'playwright', testRunners: ['playwright-test', 'vitest'], packageManagers: ['pnpm', 'npm'] },
  { language: 'typescript', framework: 'selenium', testRunners: ['jest', 'vitest'], packageManagers: ['pnpm', 'npm'] },
  { language: 'javascript', framework: 'playwright', testRunners: ['playwright-test', 'jest'], packageManagers: ['npm'] },
  { language: 'java', framework: 'selenium', testRunners: ['junit5'], packageManagers: ['maven', 'gradle'] },
  { language: 'csharp', framework: 'selenium', testRunners: ['nunit'], packageManagers: ['nuget'] },
  { language: 'python', framework: 'playwright', testRunners: ['pytest'], packageManagers: ['pip'] },
];

export type ProfileRejection =
  | { readonly ok: false; readonly reason: 'malformed'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported-combination'; readonly detail: string };

export type ProfileAcceptance = { readonly ok: true; readonly profile: TechnologyProfile };
export type ProfileResult = ProfileAcceptance | ProfileRejection;

/**
 * Validate a profile at onboarding.
 *
 * Returns a typed rejection rather than throwing: onboarding must report WHICH
 * stage failed and why (R-21.31), and a thrown error loses that distinction by
 * the time it is caught.
 */
export function validateProfile(input: unknown): ProfileResult {
  const parsed = TechnologyProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed', detail: parsed.error.issues[0]?.message ?? 'invalid profile' };
  }
  const p = parsed.data;
  const match = SUPPORTED.find((s) => s.language === p.language && s.framework === p.framework);
  if (!match) {
    return {
      ok: false,
      reason: 'unsupported-combination',
      detail: `${p.language} + ${p.framework} is not a supported combination`,
    };
  }
  if (!match.testRunners.includes(p.testRunner)) {
    return {
      ok: false,
      reason: 'unsupported-combination',
      detail: `${p.testRunner} is not supported for ${p.language} + ${p.framework}`,
    };
  }
  if (!match.packageManagers.includes(p.packageManager)) {
    return {
      ok: false,
      reason: 'unsupported-combination',
      detail: `${p.packageManager} is not supported for ${p.language}`,
    };
  }
  return { ok: true, profile: p };
}

/** Every field the schema declares — used to prove each is consumed (C-03.16). */
export const PROFILE_FIELDS = [
  'profileVersion', 'language', 'framework', 'testRunner', 'ciSystem', 'gitProvider',
  'cloudProvider', 'deploymentModel', 'packageManager', 'reportingFramework', 'frameworkVersions',
] as const;
