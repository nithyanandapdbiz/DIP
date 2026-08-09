/**
 * Experience Orchestrator — certify the SSOT, then hand it to onboard() unchanged.
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md §3a, §3d · 03-intelligence-plane-architecture.md §2b
 *   ADR          : ADR-0032 (SSOT) · ADR-0031 · ADR-0030 (onboard() is the single orchestrator, reused)
 *   Criteria     : reuses validateOnboarding (no duplicate validation) and onboard() (no duplicate orchestration)
 *
 * onboard() CONSUMES THE CANONICAL CONFIGURATION OBJECT DIRECTLY FROM tenant.json. There is
 * no mapper and no transformation model: the SSOT's `configuration` region IS the shape the
 * platform validates and onboard() accepts. Activation reads it, validates it (the certify
 * gate), and — only on success — calls onboard() exactly once, writing the outcome back to
 * the same file. Activation never occurs before certification succeeds.
 */
import { validateOnboarding, onboard, type BootstrapServices, type BootstrapResult } from '../domain/index.js';
import type { TenantConfigRepository } from './tenant-repository.js';

export interface ActivationRequest {
  readonly registrationEndpoint: string;
  /** Overrides the opaque tenantId in the SSOT if supplied; otherwise the SSOT's id is used (R-21.3). */
  readonly tenantId?: string;
}

export interface ActivationCertification {
  readonly ok: boolean;
  readonly issues: readonly { readonly stage: number; readonly code: string; readonly detail: string }[];
}

export interface ActivationOutcome {
  readonly certification: ActivationCertification;
  /** Present only when certification passed and onboard() ran. */
  readonly result?: BootstrapResult;
}

/**
 * Stage 5 + 6 over the SSOT. Load tenant.json, certify its canonical configuration with the
 * platform's own validateOnboarding, and — only if it passes — invoke onboard(). The verdict
 * and the onboard() outcome are written back to the same tenant.json.
 */
export function activate(
  repo: TenantConfigRepository,
  slug: string,
  services: BootstrapServices,
  request: ActivationRequest,
): ActivationOutcome {
  const env = repo.load(slug);
  if (!env) throw new Error(`unknown tenant "${slug}"`);

  // Certify: the platform's own validation is the gate. No validation is duplicated here.
  const validation = validateOnboarding(env.configuration);
  if (!validation.ok) {
    const issues = validation.issues.map((i) => ({ stage: i.stage, code: i.code, detail: i.detail }));
    repo.recordCertification(slug, { ok: false, issues });
    return { certification: { ok: false, issues } };
  }
  repo.recordCertification(slug, { ok: true, issues: [] });

  // Activation: hand the SSOT's configuration to the single existing orchestrator, once.
  const result = onboard(
    {
      tenantId: request.tenantId ?? env.onboarding.tenantId,
      configuration: env.configuration,
      registrationEndpoint: request.registrationEndpoint,
    },
    services,
  );
  repo.recordActivation(slug, { lifecycleState: result.lifecycleState, projection: result.projection });
  return { certification: { ok: true, issues: [] }, result };
}
