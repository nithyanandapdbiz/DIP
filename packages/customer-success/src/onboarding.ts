/**
 * Guided onboarding — the workflow a customer runs instead of asking an engineer.
 *
 * TRACEABILITY
 *   Architecture : 25-customer-success-model.md §5 · 21-tenant-lifecycle.md §3a-3b
 *   ADR          : ADR-0021
 *   Criteria     : C-25.1 (installation succeeds on a clean environment)
 *                  C-25.3 (a failed installation names the unmet precondition)
 *                  C-25.5 (configuration validates against the live schema)
 *                  C-21.21 (the registration credential is consumed on first use)
 *
 * VALIDATE BEFORE CREATING, ALWAYS.
 * Every step that can be checked is checked before anything is created. The order is
 * not a stylistic preference: a tenant created against an unbuildable profile leaves
 * the customer holding an identity for a solution that will never generate, and
 * unwinding that is a support case rather than a retry.
 *
 * A STEP THAT FAILS SAYS WHAT TO DO.
 * The failure path is the one that decides whether a customer succeeds alone, and it
 * is the path that is never rehearsed. Each step therefore carries its own remedy, and
 * the workflow stops at the first failure rather than continuing into consequences.
 */
import type { CertificateAuthority, AuthorisationServer, RegistrationService } from '@dbiz/platform-runtime';
import { validateProfile, generateSolution, type TechnologyProfile } from '@dbiz/platform-core';
import { checkNodeRuntime, checkConfiguration, type CheckResult } from './diagnostics.js';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface StepOutcome {
  readonly id: string;
  /** Shown to the customer while the step runs. Present tense, plain language. */
  readonly label: string;
  readonly status: StepStatus;
  readonly detail: string;
  readonly remedy?: string;
}

export interface OnboardingRequest {
  readonly tenantId: string;
  readonly profile: unknown;
  readonly registrationEndpoint: string;
}

export interface OnboardingResult {
  readonly steps: readonly StepOutcome[];
  readonly succeeded: boolean;
  /** Present only on success. The customer's solution, ready to commit. */
  readonly solution?: { readonly fileCount: number; readonly contentHash: string };
  /** Number of steps that ran. Used to report progress honestly when it stops early. */
  readonly completed: number;
  readonly total: number;
}

export interface OnboardingServices {
  readonly ca: CertificateAuthority;
  readonly auth: AuthorisationServer;
  readonly registration: RegistrationService;
  /** Called after each step so a CLI or UI can render progress as it happens. */
  readonly onProgress?: (step: StepOutcome, index: number, total: number) => void;
}

/** The steps, named once so progress reporting and documentation cannot disagree. */
export const ONBOARDING_STEPS = [
  { id: 'preflight', label: 'Checking your environment' },
  { id: 'configuration', label: 'Validating your technology profile' },
  { id: 'tenant', label: 'Creating your tenant' },
  { id: 'credential', label: 'Issuing a one-time registration credential' },
  { id: 'generate', label: 'Generating your Execution Plane' },
  { id: 'register', label: 'Registering and issuing your certificate' },
  { id: 'verify', label: 'Verifying an authenticated call' },
] as const;

/**
 * Run the guided onboarding.
 *
 * Stops at the first failure. Continuing past a failed step would produce a longer
 * report in which the real cause is buried among consequences of it.
 */
export function runOnboarding(
  request: OnboardingRequest,
  services: OnboardingServices,
): OnboardingResult {
  const steps: StepOutcome[] = [];
  const total = ONBOARDING_STEPS.length;

  const emit = (o: StepOutcome): StepOutcome => {
    steps.push(o);
    services.onProgress?.(o, steps.length, total);
    return o;
  };
  const fromCheck = (id: string, label: string, c: CheckResult): StepOutcome => ({
    id, label,
    status: c.status === 'pass' ? 'done' : c.status === 'warn' ? 'done' : 'failed',
    detail: c.detail,
    ...(c.remedy ? { remedy: c.remedy } : {}),
  });
  const stop = (): OnboardingResult => ({
    steps, succeeded: false, completed: steps.filter((s) => s.status === 'done').length, total,
  });

  // 1. Environment. Checked first because everything after it assumes a runtime.
  if (emit(fromCheck('preflight', ONBOARDING_STEPS[0].label, checkNodeRuntime())).status === 'failed') return stop();

  // 2. Configuration, against the live validator.
  if (emit(fromCheck('configuration', ONBOARDING_STEPS[1].label, checkConfiguration(request.profile))).status === 'failed') {
    return stop();
  }
  const validated = validateProfile(request.profile);
  if (!validated.ok) return stop(); // unreachable; narrows the type without a cast
  const profile: TechnologyProfile = validated.profile;

  // 3. Tenant. Only now, with a profile the platform can actually build.
  try {
    services.registration.recordTenantCreated(request.tenantId);
    emit({
      id: 'tenant', label: ONBOARDING_STEPS[2].label, status: 'done',
      detail: `tenant ${request.tenantId} created and recorded in the audit trail`,
    });
  } catch (e) {
    emit({
      id: 'tenant', label: ONBOARDING_STEPS[2].label, status: 'failed',
      detail: (e as Error).message,
      remedy: 'The tenant identifier may already be in use, or may contain characters the platform refuses. Identifiers are lowercase letters, digits and hyphens.',
    });
    return stop();
  }

  // 4. One-time credential.
  const credential = services.auth.issueOneTimeCredential(request.tenantId);
  emit({
    id: 'credential', label: ONBOARDING_STEPS[3].label, status: 'done',
    detail: 'issued; it is single-use and is consumed by the first successful registration',
  });

  // 5. Generate. The credential is embedded here and nowhere else.
  let solution;
  try {
    solution = generateSolution(profile, {
      tenantId: request.tenantId,
      registrationEndpoint: request.registrationEndpoint,
      oneTimeRegistrationCredential: credential,
    });
    emit({
      id: 'generate', label: ONBOARDING_STEPS[4].label, status: 'done',
      detail: `${solution.files.length} files generated for ${profile.language} + ${profile.framework}`,
    });
  } catch (e) {
    emit({
      id: 'generate', label: ONBOARDING_STEPS[4].label, status: 'failed',
      detail: (e as Error).message,
      remedy: 'Generation failed after the profile was accepted, which means the profile is valid but unbuildable. Report this: the registry and the generator disagree, and that is a platform defect.',
    });
    return stop();
  }

  // 6. Register.
  const registered = services.registration.register({
    tenantId: request.tenantId, oneTimeCredential: credential,
  });
  if (!registered.ok) {
    const remedy: Record<string, string> = {
      'unknown-credential': 'The credential was not recognised. Regenerate your solution: the embedded credential is the one to use.',
      'credential-already-consumed': 'This credential has already registered a deployment. If you are redeploying the same tenant, registration is idempotent and will return your existing grant — check the tenant identifier matches.',
      'tenant-mismatch': 'The credential was issued for a different tenant than the one being registered. Check which configuration the deployment mounted.',
      'subscription-inactive': 'Your subscription does not currently permit registration. This is a commercial state, not a technical one; contact your account contact.',
      'issuance-failed': 'The platform could not issue credentials. Nothing was created — your tenant is not half-registered. Retry, and report it if it persists.',
    };
    emit({
      id: 'register', label: ONBOARDING_STEPS[5].label, status: 'failed',
      detail: registered.reason,
      remedy: remedy[registered.reason] ?? 'Retry registration.',
    });
    return stop();
  }
  if (registered.idempotentReplay) {
    // The tenant was already registered, so no second identity was created — and no
    // secret material is re-disclosed on replay (platform-runtime, N-1). Without a
    // grant there is nothing to verify with, and pretending otherwise would report a
    // success the customer cannot use. Say what happened and where recovery lives.
    emit({
      id: 'register', label: ONBOARDING_STEPS[5].label, status: 'done',
      detail: 'already registered; the existing identity was kept rather than a second one issued',
    });
    emit({
      id: 'verify', label: ONBOARDING_STEPS[6].label, status: 'skipped',
      detail: 'no credentials were returned, because replaying registration must not re-disclose them',
      remedy: 'This tenant is already registered. If you are onboarding a new deployment, use a new tenant identifier. If you have lost the credentials for this one, recover them through the authenticated rotation path — registration will never hand them back.',
    });
    return stop();
  }
  emit({
    id: 'register', label: ONBOARDING_STEPS[5].label, status: 'done',
    detail: 'registered; certificate and access token issued',
  });

  // 7. Verify. Onboarding is not finished because credentials were issued — it is
  //    finished when a call using them is served. Anything less leaves the customer
  //    to discover the failure themselves, later, in their own pipeline.
  const grant = registered.grant;
  const verification = services.auth.verify(
    grant.access.token, grant.certificate.keyId, `onboard-${request.tenantId}`,
  );
  if (!verification.ok) {
    emit({
      id: 'verify', label: ONBOARDING_STEPS[6].label, status: 'failed',
      detail: verification.reason,
      remedy: 'Credentials were issued but do not verify. Do not proceed; report this with the tenant identifier. Registration is idempotent, so retrying is safe.',
    });
    return stop();
  }
  emit({
    id: 'verify', label: ONBOARDING_STEPS[6].label, status: 'done',
    detail: `an authenticated call for ${verification.tenantId} was accepted`,
  });

  return {
    steps,
    succeeded: true,
    solution: { fileCount: solution.files.length, contentHash: solution.contentHash.value },
    completed: steps.filter((s) => s.status === 'done').length,
    total,
  };
}

/** Render onboarding progress the way a customer reads it, not the way it is stored. */
export function renderOnboarding(result: OnboardingResult): string {
  const icon: Record<StepStatus, string> = {
    done: '  [done]   ', failed: '  [FAILED] ', running: '  [ ... ]  ',
    pending: '  [    ]   ', skipped: '  [skip]   ',
  };
  const lines = ['', 'ONBOARDING', '='.repeat(72)];
  for (const s of result.steps) {
    lines.push(`${icon[s.status]}${s.label}`);
    lines.push(`             ${s.detail}`);
    if (s.remedy) lines.push(`             -> ${s.remedy}`);
  }
  // Steps never reached are shown, not hidden. A customer who stopped at step 3 of 7
  // should see the four they have left rather than a report that simply ends.
  for (const remaining of ONBOARDING_STEPS.slice(result.steps.length)) {
    lines.push(`${icon.pending}${remaining.label}`);
  }
  lines.push('='.repeat(72));
  lines.push(`${result.completed}/${result.total} steps complete`);
  if (result.succeeded && result.solution) {
    lines.push(`Your Execution Plane: ${result.solution.fileCount} files, content hash ${result.solution.contentHash.slice(0, 16)}…`);
    lines.push('Commit it to your repository. The platform keeps no copy.');
  } else {
    lines.push('Onboarding stopped. The failed step above names what to do next.');
  }
  lines.push('');
  return lines.join('\n');
}
