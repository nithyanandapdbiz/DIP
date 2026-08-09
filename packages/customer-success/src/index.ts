/**
 * @dbiz/customer-success — the Customer Success Platform Service.
 *
 * TRACEABILITY
 *   Architecture : 25-customer-success-model.md (owns this surface)
 *   ADR          : ADR-0018 (Platform Service, not a capability) · ADR-0021
 *   Criteria     : C-25.5 · C-25.6 · C-25.8 · C-25.9 · C-25.11 · C-25.12
 *
 * A PLATFORM SERVICE, NOT A CAPABILITY.
 * This package renders no quality verdict and executes nothing in a customer tenancy.
 * It generates the artefacts a customer needs and the checks they run themselves. The
 * six Quality Engineering Capabilities are unchanged and this is not a seventh
 * (R-11.4) — a point worth stating in code, because "customer onboarding" is exactly
 * the kind of surface that grows into a capability if nobody says otherwise.
 *
 * EVERYTHING HERE IS GENERATED FROM MEASURED OUTPUT.
 * R-25.1: readiness is measured from executed outcomes, never asserted from the
 * existence of documentation. R-25.34: the package is generated from validation
 * output, not assembled by hand. Those two rules are why this package takes
 * validation results as INPUT and has no way to describe a capability nobody measured.
 */
export {
  generateOpenApi, generateErrorCatalogue, generateAuthenticationGuide, SYNTHETIC,
} from './api-reference.js';
export type {
  ApiSurface, ObservedResponse, SchemaSource, OpenApiDocument,
} from './api-reference.js';

export {
  buildExamples, validateExamples, generateCompatibilityMatrix,
} from './configuration.js';
export type {
  ConfigurationExample, ConfigurationFormat, ExampleValidation,
} from './configuration.js';

export {
  checkNodeRuntime, checkConfiguration, checkOutboundConnectivity, checkCertificate,
  checkAccessToken, checkGateway, checkTenantIsolation, checkDependencyPinning,
  summarise, renderReport,
} from './diagnostics.js';
export type { CheckResult, CheckStatus, DiagnosticReport } from './diagnostics.js';

export { runOnboarding, renderOnboarding, ONBOARDING_STEPS } from './onboarding.js';
export type {
  OnboardingRequest, OnboardingResult, OnboardingServices, StepOutcome, StepStatus,
} from './onboarding.js';

export { generateDocumentationSuite } from './documentation.js';
export type {
  DocumentationInput, GeneratedDoc, UnmeasuredProperty, KnownFailure,
} from './documentation.js';

export {
  buildRunbooks, renderRunbook, generateRunbookDocs, validateRunbook,
  KNOWN_OPERATIONS, RunbookError,
} from './runbooks.js';
export type { Runbook, RunbookStep, KnownOperation } from './runbooks.js';

export { buildCustomerSuccessPackage, generateIndex } from './package-builder.js';
export type { PackageInput, CustomerSuccessPackage } from './package-builder.js';

export { run as runCli } from './cli.js';
export type { CliResult, CliContext } from './cli.js';
