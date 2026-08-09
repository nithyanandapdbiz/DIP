/**
 * @dbiz/tenant-lifecycle — Tenant Lifecycle Management (TLM).
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md · 03-intelligence-plane-architecture.md
 *   ADR          : ADR-0030 (TLM is the Platform Core onboarding orchestrator) · ADR-0021
 *
 * The Platform Core onboarding orchestrator (ADR-0030). Intelligence Plane only. It
 * carries a tenant across the onboarding stages (R-21.27) over the frozen six-state
 * lifecycle (R-21.5), reusing @dbiz/platform-runtime (registration, identity) and
 * @dbiz/platform-core (solution generation) — it duplicates neither.
 *
 * It is NOT a seventh capability (R-11.4) and NOT a fourth Platform Service
 * (ADR-0021 §5): it is the orchestration surface of the Platform Core bounded context.
 */
export {
  OnboardingConfigurationSchema,
  DbizConfigurationSchema,
  CustomerConfigurationSchema,
  validateConfiguration,
  ENTITLED_CAPABILITIES,
  AI_CAPABILITY_CLASSES,
  CREDENTIAL_MARKERS,
} from './onboarding-configuration.js';
export type {
  OnboardingConfiguration,
  DbizConfiguration,
  CustomerConfiguration,
  ConfigurationResult,
  ConfigurationAcceptance,
  ConfigurationRejection,
} from './onboarding-configuration.js';

export {
  TenantLifecycle,
  projectLifecycle,
  legalCanonicalTransitions,
  isLegalCanonicalTransition,
  CANONICAL_STATES,
  ONBOARDING_STAGES,
  ACTIVATION_PREREQUISITE_STAGES,
  PROJECTION_STAGES,
} from './lifecycle-state-machine.js';
export type {
  CanonicalState,
  ProjectionStage,
  LifecycleEvent,
  TransitionOutcome,
  TenantLifecycleOptions,
} from './lifecycle-state-machine.js';

export { validateOnboarding, CAPABILITIES_WITH_EXECUTION_PATH, entitlementsWithoutExecutionPath } from './validation.js';
export type { ValidationResult, ValidationIssue } from './validation.js';

export { onboard, renderBootstrap } from './bootstrap-orchestrator.js';
export type {
  BootstrapRequest,
  BootstrapServices,
  BootstrapResult,
  StageOutcome,
  StageStatus,
} from './bootstrap-orchestrator.js';
