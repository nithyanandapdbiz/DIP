/**
 * @dbiz/platform-core — the Platform Core bounded context.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md §2a-2d
 *   ADR          : ADR-0021 (Platform Core bounded context)
 *   Criteria     : C-03.13 (two bounded contexts), C-03.14 (dependency direction)
 *
 * Platform Core depends on contracts. It does NOT depend on Intelligence Core, and
 * nothing in Intelligence Core may depend on it (R-03.23). This package exists so
 * that direction is enforceable by the dependency graph rather than by convention.
 *
 * Not separately deployable (R-03.24): a library inside the Intelligence Plane,
 * binding no listener and owning no lifecycle.
 */
export {
  TechnologyProfileSchema, validateProfile, SUPPORTED, PROFILE_FIELDS,
  LANGUAGES, FRAMEWORKS, TEST_RUNNERS, CI_SYSTEMS, GIT_PROVIDERS,
  CLOUD_PROVIDERS, DEPLOYMENT_MODELS, PACKAGE_MANAGERS, REPORTING_FRAMEWORKS,
} from './technology-profile.js';
export type { TechnologyProfile, ProfileResult, ProfileRejection, ProfileAcceptance } from './technology-profile.js';

export {
  generateSolution, recordGeneration, GENERATOR_VERSION, TEMPLATE_VERSION,
} from './solution-generator.js';
export type { GeneratedFile, GeneratedSolution, GenerationRecord, BootstrapInputs } from './solution-generator.js';

// Pinned dependency resolution. Exported so a gate can assert that every declared
// supported stack resolves to a NON-EMPTY dependency set — the defect that shipped
// solutions naming a framework no manifest installed.
export {
  resolveFrameworkVersions, browsersRequired, containerBaseImage, browserInstallCommand,
  PLAYWRIGHT_VERSION,
} from './framework-versions.js';

// Per-language emission. Exported so the supported-target validator can assert that
// each declared language emits its own sources rather than another language's.
export { emitterFor, SOURCE_EXTENSIONS } from './language-emitters.js';
export type { LanguageEmitter, EmittedFile } from './language-emitters.js';

// The Application Template Registry — WHAT the generated Execution Plane drives, as metadata.
// The Technology Profile above says how the package is BUILT; a template says what it is built FOR.
export {
  ApplicationTemplateRegistry, envVarNameFor, primaryTargetEnvVar, readContextPath, conditionHolds,
  resolveAuthentication, resolveConfigFields, resolveAllConfigFields, evaluateApplicationValidation, isPlaceholder,
  AUTHENTICATION_STRATEGIES, DISCOVERY_STRATEGIES, EXECUTION_STRATEGIES, SESSION_REFRESH_STRATEGIES,
  CONFIG_FIELD_TYPES, CONFIG_STORAGE, VALIDATION_RULES, VALIDATION_SCOPES, APPLICATION_CATEGORIES,
} from './application-template.js';
export type {
  ApplicationTemplate, ApplicationContext, ApplicationConfigField, ResolvedConfigField,
  ApplicationPortalSchema, PortalFieldGroup, ApplicationValidationRule, ApplicationValidationIssue,
  ApplicationDocumentation, AuthenticationStrategy, DiscoveryStrategy, ExecutionStrategy,
  RuntimeCapabilities, VisibilityCondition, ApplicationCategory, ConfigFieldType, ConfigStorage,
  AuthenticationStrategyId, DiscoveryStrategyId, ExecutionStrategyId, SessionRefreshStrategyId,
  ValidationRuleId, ValidationScope,
} from './application-template.js';

export {
  APPLICATION_TEMPLATES, APPLICATION_TYPE_IDS, REGISTERED_TEMPLATES,
  FALLBACK_APPLICATION_TEMPLATE_ID, DEFAULT_APPLICATION_TEMPLATE_ID,
  buildRegistry, resolveApplicationTemplate, resolveApplicationTemplates,
  applicationContextFrom, normaliseMfaDeclaration,
} from './application-templates/index.js';
export type { ApplicationDeclaration } from './application-templates/index.js';

// The execution-adapter interface catalogue that templates and capabilities bind runners from.
export { ADAPTER_INTERFACES, ADAPTER_INTERFACE_IDS, adapterInterface } from './adapter-interfaces.js';
export type { AdapterInterfaceDefinition } from './adapter-interfaces.js';
