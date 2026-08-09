/**
 * Platform Bootstrap Engine — the config-driven onboarding orchestrator.
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md §3a (R-21.27, R-21.28, R-21.29, R-21.30, R-21.31)
 *   ADR          : ADR-0030 §4.1, §4.4
 *   Criteria     : C-21.15 (all fourteen stages, in order, none skipped)
 *                  C-21.17 (no manual DBiz engineering) · C-21.18 (a failed stage halts and names itself)
 *
 * ONE CONFIGURATION IN, A DEPLOYABLE TENANT OUT — AS FAR AS THE PLANE CAN GO ALONE.
 * The engine drives the seven Intelligence-Plane stages (R-21.28): it validates, creates
 * the tenant, captures the profile, sets entitlements, and generates the Execution Plane
 * solution and its deployment package. It reuses @dbiz/platform-runtime (identity) and
 * @dbiz/platform-core (generation) — it reimplements neither.
 *
 * STAGES 8–14 ARE REPORTED PENDING, NEVER ASSUMED (ADR-0030 §4.4).
 * Stage 8 is the customer's deployment; stages 9–12 are Execution-Plane-initiated
 * (INV-3) and need the P5 runtime and a container runtime; stages 13–14 follow their
 * evidence. The engine reports them PENDING with the reason. It NEVER marks a tenant
 * ACTIVE on assumption (R-21.29) — that is the declared-but-unbuilt failure refused.
 */
import type { AuthorisationServer, RegistrationService } from '@dbiz/platform-runtime';
import { generateSolution } from '@dbiz/platform-core';
import { validateOnboarding } from './validation.js';
import { TenantLifecycle, ONBOARDING_STAGES } from './lifecycle-state-machine.js';
import type { OnboardingConfiguration } from './onboarding-configuration.js';

export type StageStatus = 'done' | 'failed' | 'pending';

export interface StageOutcome {
  readonly stage: number;
  readonly name: string;
  readonly status: StageStatus;
  readonly detail: string;
  readonly remedy?: string;
}

export interface BootstrapRequest {
  /** The stable, meaningless tenant identifier (R-21.3), allocated by the registry. */
  readonly tenantId: string;
  readonly configuration: unknown;
  readonly registrationEndpoint: string;
}

export interface BootstrapServices {
  readonly auth: Pick<AuthorisationServer, 'issueOneTimeCredential'>;
  readonly registration: Pick<RegistrationService, 'recordTenantCreated'>;
  /** Injected for deterministic, replayable lifecycle audit (R-14.2). */
  readonly now?: () => string;
}

export interface BootstrapResult {
  readonly tenantId: string;
  /** True once the seven Intelligence-Plane stages have all completed. */
  readonly intelligencePlaneComplete: boolean;
  readonly stages: readonly StageOutcome[];
  readonly lifecycleState: string;
  readonly projection: string;
  readonly solution?: {
    readonly fileCount: number;
    readonly contentHash: string;
    readonly generatorVersion: string;
    readonly templateVersion: string;
  };
  /** Stage number the run halted at, if it failed. */
  readonly haltedAt?: number;
}

const IP_STAGES = [1, 2, 3, 4, 5, 6, 7] as const;
const DEFERRED_STAGES = [8, 9, 10, 11, 12, 13, 14] as const;
const DEFERRAL_REASON: Readonly<Record<number, string>> = {
  8: 'performed by the customer in their own tenancy (R-21.12); the platform never deploys inward',
  9: 'Execution-Plane-initiated on first start (INV-3); needs the deployed EP runtime (P5)',
  10: 'Execution-Plane-initiated secure registration (INV-3); needs the deployed EP and a container runtime',
  11: 'Execution-Plane-initiated connectivity proof (INV-3); needs the deployed EP',
  12: 'smoke run executed by the EP (R-21.38); needs the P5 runtime and a container runtime',
  13: 'certification follows a proven smoke result (R-21.39); pending stages 10–12',
  14: 'activation requires proven registration, connectivity and smoke (R-21.29); pending stages 10–12',
};

/**
 * Run onboarding. Drives stages 1–7 in order (C-21.15), halting at the first failure and
 * naming the stage (C-21.18). Determinism makes it idempotent: the same configuration and
 * tenant produce the same generated solution, so a re-run is a repeat, not a divergence.
 */
export function onboard(request: BootstrapRequest, services: BootstrapServices): BootstrapResult {
  const stages: StageOutcome[] = [];
  const lifecycle = new TenantLifecycle(
    services.now ? { tenantId: request.tenantId, now: services.now } : { tenantId: request.tenantId },
  );

  const record = (o: StageOutcome): StageOutcome => { stages.push(o); return o; };
  const deferredStages = (): StageOutcome[] =>
    DEFERRED_STAGES.map((s) => ({
      stage: s, name: ONBOARDING_STAGES[s] ?? `stage-${s}`, status: 'pending' as const,
      detail: DEFERRAL_REASON[s] ?? 'deferred',
    }));
  const halt = (at: number): BootstrapResult => ({
    tenantId: request.tenantId,
    intelligencePlaneComplete: false,
    stages: [...stages, ...deferredStages()],
    lifecycleState: lifecycle.state,
    projection: lifecycle.projection,
    haltedAt: at,
  });

  // Stages 3–4: validate everything checkable before creating anything.
  const validation = validateOnboarding(request.configuration);
  if (!validation.ok) {
    const first = validation.issues[0];
    const at = first ? first.stage : 3;
    record({
      stage: at, name: ONBOARDING_STAGES[at] ?? `stage-${at}`, status: 'failed',
      detail: validation.issues.map((i) => i.detail).join('; '),
      remedy: 'Correct the configuration and re-run. Nothing was created — the tenant is not half-provisioned.',
    });
    return halt(at);
  }
  const configuration: OnboardingConfiguration = validation.configuration;

  // Stage 1 — customer registration (the customer record is captured from configuration).
  record({ stage: 1, name: ONBOARDING_STAGES[1] ?? 'customer-registration', status: 'done',
    detail: `customer "${configuration.customer.customerName}" (${configuration.customer.businessUnit})` });
  lifecycle.completeStage(1);

  // Stage 2 — tenant creation. Identity exists; the audit chain begins here (E-10).
  try {
    services.registration.recordTenantCreated(request.tenantId);
  } catch (e) {
    record({ stage: 2, name: ONBOARDING_STAGES[2] ?? 'tenant-creation', status: 'failed',
      detail: (e as Error).message,
      remedy: 'The tenant identifier may be malformed. Identifiers are lowercase letters, digits and hyphens (R-21.3).' });
    return halt(2);
  }
  record({ stage: 2, name: ONBOARDING_STAGES[2] ?? 'tenant-creation', status: 'done',
    detail: `tenant ${request.tenantId} created; state REGISTERED` });
  lifecycle.completeStage(2);

  // Stage 3 — technology profile captured (already validated above).
  record({ stage: 3, name: ONBOARDING_STAGES[3] ?? 'technology-profile-capture', status: 'done',
    detail: `${configuration.technologyProfile.language} + ${configuration.technologyProfile.framework}` });
  lifecycle.completeStage(3);

  // Stage 4 — business integration configuration set; entitlements verified (R-21.11).
  record({ stage: 4, name: ONBOARDING_STAGES[4] ?? 'business-integration-configuration', status: 'done',
    detail: `entitlements: ${configuration.dbiz.entitledCapabilities.join(', ')}; `
      + `PM=${configuration.customerOwned.projectManagement.provider}, TM=${configuration.customerOwned.testManagement.provider}` });
  lifecycle.completeStage(4);

  // Configuration and entitlements are set: REGISTERED -> PROVISIONED (21 §2).
  const provisioned = lifecycle.transition('PROVISIONED', 'tlm-orchestrator', 'configuration and entitlements set');
  if (!provisioned.ok) return halt(4);

  // Stage 5 — solution generation. The one-time credential is issued and embedded here
  // and nowhere else (R-21.32/33); the generated EP carries no durable secret.
  const credential = services.auth.issueOneTimeCredential(request.tenantId);
  let solution;
  try {
    solution = generateSolution(configuration.technologyProfile, {
      tenantId: request.tenantId,
      registrationEndpoint: request.registrationEndpoint,
      oneTimeRegistrationCredential: credential,
    });
  } catch (e) {
    record({ stage: 5, name: ONBOARDING_STAGES[5] ?? 'solution-generation', status: 'failed',
      detail: (e as Error).message,
      remedy: 'Generation failed after the profile was accepted — the registry and generator disagree. Report it as a platform defect.' });
    return halt(5);
  }
  record({ stage: 5, name: ONBOARDING_STAGES[5] ?? 'solution-generation', status: 'done',
    detail: `${solution.files.length} files generated; content hash ${solution.contentHash.value.slice(0, 16)}…` });
  lifecycle.completeStage(5);

  // Stage 6 — repository generation. The generated files ARE the repository layout,
  // delivered to the customer's Git provider (R-21.28 stage 6 / R-03.33); DBiz retains no copy.
  const sourceFiles = solution.files.filter((f) => !/^(Dockerfile|.*\.ya?ml|Jenkinsfile)$/.test(f.path));
  record({ stage: 6, name: ONBOARDING_STAGES[6] ?? 'repository-generation', status: 'done',
    detail: `${sourceFiles.length} repository files for the customer's ${configuration.technologyProfile.gitProvider} provider` });
  lifecycle.completeStage(6);

  // Stage 7 — deployment package generation. The container definition and CI pipeline
  // are part of the generated solution (R-03.30).
  const deploymentArtefacts = solution.files.filter((f) => /^(Dockerfile|.*\.ya?ml|Jenkinsfile)$/.test(f.path));
  record({ stage: 7, name: ONBOARDING_STAGES[7] ?? 'deployment-package-generation', status: 'done',
    detail: `${deploymentArtefacts.length} deployment artefacts (container + CI) for ${configuration.technologyProfile.deploymentModel}` });
  lifecycle.completeStage(7);

  // Stages 8–14 are pending, honestly (ADR-0030 §4.4). The tenant sits at PROVISIONED,
  // projecting WAITING_FOR_DEPLOYMENT — never ACTIVE on assumption (R-21.29).
  return {
    tenantId: request.tenantId,
    intelligencePlaneComplete: IP_STAGES.every((s) => lifecycle.completedStages.has(s)),
    stages: [...stages, ...deferredStages()],
    lifecycleState: lifecycle.state,
    projection: lifecycle.projection,
    solution: {
      fileCount: solution.files.length,
      contentHash: solution.contentHash.value,
      generatorVersion: solution.generatorVersion,
      templateVersion: solution.templateVersion,
    },
  };
}

/** Render an onboarding run the way an operator reads it — all fourteen stages, honestly. */
export function renderBootstrap(result: BootstrapResult): string {
  const icon: Record<StageStatus, string> = { done: '  [done]    ', failed: '  [FAILED]  ', pending: '  [pending] ' };
  const lines = ['', `TENANT ONBOARDING — ${result.tenantId}`, '='.repeat(72)];
  for (const s of result.stages) {
    lines.push(`${icon[s.status]}${s.stage}. ${s.name}`);
    lines.push(`             ${s.detail}`);
    if (s.remedy) lines.push(`             -> ${s.remedy}`);
  }
  lines.push('='.repeat(72));
  lines.push(`Lifecycle: ${result.lifecycleState}   Projection: ${result.projection}`);
  if (result.intelligencePlaneComplete) {
    lines.push('Intelligence-Plane onboarding complete. The tenant awaits customer deployment (stage 8).');
  } else if (result.haltedAt) {
    lines.push(`Onboarding halted at stage ${result.haltedAt}. The failed stage above names what to do.`);
  }
  lines.push('');
  return lines.join('\n');
}
