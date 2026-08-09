/**
 * Onboarding validation — everything checkable is checked before anything is created.
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md §3 (R-21.9, R-21.10, R-21.11, R-21.31)
 *   ADR          : ADR-0030
 *   Criteria     : C-21.5 (a partially provisioned tenant cannot reach ACTIVE)
 *                  C-21.6 (entitling a capability with no execution path fails at provisioning)
 *
 * VALIDATE BEFORE CREATING (the runOnboarding lesson, 25 §5). A tenant created against
 * an unbuildable profile or an unbacked entitlement is a support case, not a retry.
 *
 * R-21.11 IS THE INHERITED FAILURE. The predecessor entitled a penetration-testing
 * engine with no runner on disk and returned a soft success — a security capability
 * that silently does nothing. Entitlement is therefore validated against the set of
 * capabilities that have a verified execution path, and an entitlement with no path is
 * refused here, loudly, at provisioning — never discovered later as silence.
 */
import {
  validateProfile, resolveApplicationTemplate, evaluateApplicationValidation, applicationContextFrom,
} from '@dbiz/platform-core';
import {
  validateConfiguration,
  type OnboardingConfiguration,
  ENTITLED_CAPABILITIES,
} from './onboarding-configuration.js';

/**
 * Capabilities with a verified execution path — the six built engines. Derived from
 * what exists on disk as a package, this is the registry R-21.11 validates against. If
 * an engine were removed, its entitlement would begin to fail here rather than at a
 * customer's first run.
 */
export const CAPABILITIES_WITH_EXECUTION_PATH: ReadonlySet<string> = new Set(ENTITLED_CAPABILITIES);

/**
 * The R-21.11 guard, isolated and with an injectable registry. Isolation is what makes
 * the *failure* provable: the schema enum and the built-engine registry coincide today,
 * so a negative can only be exercised by supplying a registry that lags — which is
 * exactly the drift R-21.11 exists to catch (an entitlement whose engine was removed).
 */
export function entitlementsWithoutExecutionPath(
  capabilities: readonly string[],
  registry: ReadonlySet<string> = CAPABILITIES_WITH_EXECUTION_PATH,
): readonly string[] {
  return capabilities.filter((c) => !registry.has(c));
}

export type ValidationIssue = {
  readonly stage: number;
  readonly code: 'malformed-configuration' | 'unbuildable-profile' | 'entitlement-without-execution-path' | 'incoherent-integration' | 'incoherent-application-target';
  readonly detail: string;
};


export type ValidationResult =
  | { readonly ok: true; readonly configuration: OnboardingConfiguration }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

/** Validate the whole onboarding input. Returns every issue, each naming its stage (R-21.31). */
export function validateOnboarding(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  const cfg = validateConfiguration(input);
  if (!cfg.ok) {
    return { ok: false, issues: [{ stage: 3, code: 'malformed-configuration', detail: cfg.detail }] };
  }
  const configuration = cfg.configuration;

  // Stage 3 — the technology profile must be buildable, not merely well-formed.
  const profile = validateProfile(configuration.technologyProfile);
  if (!profile.ok) {
    issues.push({ stage: 3, code: 'unbuildable-profile', detail: profile.detail });
  }

  // Stage 4 — every entitled capability must have a verified execution path (R-21.11).
  for (const capability of entitlementsWithoutExecutionPath(configuration.dbiz.entitledCapabilities)) {
    issues.push({
      stage: 4,
      code: 'entitlement-without-execution-path',
      detail: `capability "${capability}" is entitled but has no verified execution path (R-21.11)`,
    });
  }

  // Stage 4 — integration selections must be internally coherent: a named provider
  // that carries no identifier cannot be bound, and a missing identifier is caught here
  // rather than surfacing as a broken adapter in the customer's first run.
  const pm = configuration.customerOwned.projectManagement;
  if (pm.provider !== 'none' && !pm.project) {
    issues.push({ stage: 4, code: 'incoherent-integration', detail: `project-management provider "${pm.provider}" selected without a project` });
  }
  const tm = configuration.customerOwned.testManagement;
  if (tm.provider !== 'none' && !tm.projectKey) {
    issues.push({ stage: 4, code: 'incoherent-integration', detail: `test-management provider "${tm.provider}" selected without a project key` });
  }
  // ADR-0085. The rule above checks a PROJECT. It never checked a PLAN, which is why a tenant with
  // an existing Test Plan and a tenant with none produced byte-identical configurations and the
  // first of the two was written into without anything establishing what was there.
  //
  // These rules are coherence, not schema: the schema makes the disposition REQUIRED and the
  // identifiers OPTIONAL, because which identifier a tenant must supply DEPENDS ON THE DISPOSITION
  // THEY DECLARED. A schema cannot express that dependency without either requiring every field of
  // every tenant or inferring the disposition from which fields are present — and the inference is
  // what ADR-0085 §3 rejects.
  if (tm.provider !== 'none') {
    // Ruling 2 first, and its absence is reported first: rulings 3 and 4 are UNREACHABLE without an
    // organisation to resolve an identifier against, so a missing plan id here would be a second
    // symptom of one cause.
    if (!tm.baseUrl) {
      issues.push({ stage: 4, code: 'incoherent-integration', detail: `test-management provider "${tm.provider}" selected without a base URL — an identifier with no organisation to resolve it against identifies nothing` });
    } else if (tm.repositoryDisposition === 'create-if-absent') {
      // `create-if-absent` consumes the NAME: no id can be configured for a plan that does not exist yet.
      if (!tm.planName) {
        issues.push({ stage: 4, code: 'incoherent-integration', detail: 'disposition "create-if-absent" declared without a plan name — a created plan has to be called something' });
      }
    } else if (!tm.planId) {
      // `reuse-existing` and `must-exist` consume the ID. Falling back to the name here would be
      // name-wins by omission: renaming a plan in the customer's tool would then re-target the
      // platform at a different plan, or create one, WITH NO EVENT ANYWHERE.
      issues.push({ stage: 4, code: 'incoherent-integration', detail: `disposition "${tm.repositoryDisposition}" declared without a plan id — the id is what binds; a name is not stable` });
    }
    // Recorded, never used to correct or re-target (ruling 3). It is surfaced as an issue rather
    // than resolved silently, because a tenant who supplied both and meant the name must find out
    // at onboarding rather than from a plan that never moved.
    if (tm.planId && tm.planName) {
      issues.push({ stage: 4, code: 'incoherent-integration', detail: 'both a plan id and a plan name are configured — THE ID IS AUTHORITATIVE and the name is recorded, never used to re-target' });
    }
    if (tm.suiteId && tm.suiteName) {
      issues.push({ stage: 4, code: 'incoherent-integration', detail: 'both a suite id and a suite name are configured — THE ID IS AUTHORITATIVE and the name is recorded, never used to re-target' });
    }
  }

  // Stage 4 — the declared application target must satisfy its own template's rules.
  //
  // Only `intelligence-plane`-scoped rules run here. The IP holds no customer credential (INV-2),
  // so "the password is set" is a fact only the Execution Plane can establish; those rules ship
  // inside the package and are evaluated there. Running the same rule set on both sides from ONE
  // declaration is what stops a package passing onboarding and failing at first start.
  //
  // WARNINGS ARE NOT FAILURES. A template's advisory rule (for example: MFA not declared on a
  // target that usually enforces it) must inform the operator without blocking a legitimate
  // tenant whose instance genuinely has it disabled.
  const applicationContext = applicationContextFrom(configuration.customerOwned.application, {
    environment: configuration.customer.environment,
  });
  const applicationTemplate = resolveApplicationTemplate(applicationContext.applicationTypes);
  const applicationValues: Record<string, unknown> = { baseUrl: configuration.customerOwned.application.applicationUrl };
  for (const field of applicationTemplate.configuration) {
    if (field.storage === 'config' && field.defaultValue !== undefined) applicationValues[field.name] = field.defaultValue;
  }
  for (const finding of evaluateApplicationValidation(applicationTemplate, applicationContext, applicationValues, 'intelligence-plane')) {
    if (finding.severity !== 'error') continue;
    issues.push({
      stage: 4,
      code: 'incoherent-application-target',
      detail: `application target "${applicationTemplate.id}": ${finding.detail} (${finding.ruleId})`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, configuration };
}
