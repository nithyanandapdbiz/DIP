/**
 * @dbiz/onboarding-experience — the Intelligence-Plane Tenant Onboarding Experience layer.
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md · 03-intelligence-plane-architecture.md · 25-customer-success-model.md
 *   ADR          : ADR-0032 (Tenant Configuration Repository / SSOT) · ADR-0031 (experience layer) · ADR-0030 (single onboard())
 *
 * A configuration-driven experience layer over the EXISTING onboard(). A `tenants/<slug>/tenant.json`
 * SSOT is created at Stage 1 and enriched progressively; the session tracks the journey only; onboard()
 * consumes the SSOT's canonical configuration directly (no mapper). Not a seventh capability (R-11.4),
 * not a second orchestrator (ADR-0030), and it holds no customer credential (INV-2).
 */
export {
  EXPERIENCE_STAGES,
  OnboardingSessionService,
  InMemorySessionStore,
} from './onboarding-session.js';
export type {
  ExperienceStage,
  ConnectionSelection,
  SessionActivity,
  OnboardingSession,
  SessionClock,
  SessionStore,
} from './onboarding-session.js';

export {
  EXPERIENCE_PROGRESS,
  initialConfiguration,
  deriveIsolation,
  audit,
  setStage,
} from './tenant-config.js';
export type {
  WelcomeInput,
  ApplicationMfa,
  CanonicalConfig,
  TenantEnvelope,
  OnboardingStatus,
  AuditEntry,
  CapabilityUpdateEvent,
  IsolationConfig,
  MultiTenancyConfig,
} from './tenant-config.js';

export { TenantManifestResolver } from './tenant-manifest-resolver.js';
export type { MultiTenancyView } from './tenant-manifest-resolver.js';

export {
  route, createServer,
  // ADR-0080 P-80.2 — the work request exchange, and the authorisation it INHERITS from route().
  handleWorkRequest, isWorkPath, authoriseTenantRequest, translateError,
} from './api.js';
export type { TenantAuthorisation } from './api.js';
export type { ApiDeps, ApiRequest, ApiResponse } from './api.js';

export { TenantApiClient, TenantApiError } from './web-client.js';
export type { FetchLike } from './web-client.js';

export { ROLE_PERMISSIONS, permissionsOf, can, permissionForRoute, mayAccessTenant, isGlobalPrincipal } from './authz.js';
export type { Role, Permission, Principal } from './authz.js';

export { issueSessionToken, verifySessionToken, bearerAuthenticator, principalOf, AUTH_ABSENT } from './auth-tokens.js';
export type { IssueOptions, TokenResult, AuthOutcome, AuthRejection } from './auth-tokens.js';

export { AUTH_REALM, AUTH_REQUIRED, CREDENTIAL_REJECTED, AUTH_NOT_CONFIGURED, authRefusal } from './auth-refusal.js';
// D-144 — the commit this artefact was built from. One reader, so nothing else can invent a second.
export { buildIdentity } from './build-identity.js';
export type { BuildIdentity } from './build-identity.js';
export type { AuthRefusal } from './auth-refusal.js';

export {
  IP_ADMIN_ROLE, verifyMicrosoftIdToken, devEmailVerifier, resolveMicrosoftSession,
  ENTRA_ROLE_MAP, mapEntraRoles, resolveTenantScope,
} from './microsoft-auth.js';
export type { MicrosoftAuthConfig, MicrosoftAuthDeps, MicrosoftClaims, VerifyMicrosoftToken, SessionResult } from './microsoft-auth.js';

export { epPrincipal, parseEpPrincipal, issueEpToken } from './ep-token.js';
export type { EpTokenResult } from './ep-token.js';

export {
  handleRegistration, issueRegistrationOtc, issueRegistrationOtcDetailed,
  InMemoryRegistrationStore, FileRegistrationStore,
  // The ONE construction of the work path (ADR-0032). Exported so no caller — and no test — is
  // tempted to write the second `/api/tenants/{slug}/work` literal that would drift from it.
  workPathFor,
} from './registration.js';
export type {
  RegistrationRequest, RegistrationGrant, RegistrationDeps, RegistrationStore,
  OtcRecord, RegistrationAuditRecord, RegistrationOtcResult, IssuedOtc,
} from './registration.js';

export { buildTenantSolution, writeSolutionFiles, generateTenantSolution, capabilityScaffold, integrationScaffold, signInCredentials } from './solution-export.js';
export type { SolutionBuildOptions, SolutionFile, SolutionManifest, AppTargetCredentials } from './solution-export.js';

// The Application-Template-driven half of generation. Exported so the API can surface the portal
// schema to the onboarding wizard, and so the target of a tenant can be inspected without
// generating a package.
export {
  buildApplicationPlane, applicationConfigDocument, applicationPortalSnapshot,
  applicationEnvBlocks, applicationEnvNames, applicationIntegrationBlock, applicationAuthProfile,
  applicationDocument, applicationConfigurationSummary, applyCapabilityProfile, capabilityTargetProfile,
  validateApplicationPlane,
} from './application-plane.js';
export type { ApplicationPlane, ApplicationPortalSnapshot, ApplicationPortalField } from './application-plane.js';

export {
  handlePackageRetrieval, tenantOwnershipResolver, packageHashFromPath, PACKAGE_RETRIEVAL_PATH,
} from './package-retrieval.js';
export {
  handleEvidenceIngress, isEvidenceIngressPath, EVIDENCE_INGRESS_PATH,
} from './evidence-ingress.js';
export { createSealedPackageWriter, PackagePublicationRefused } from './sealed-package-writer.js';
export type {
  SealedPackageWriterDeps, PackageSealedEvent, PackagePublished, PublicationVerdict,
} from './sealed-package-writer.js';
export type {
  EvidenceIngressDeps, EvidenceIngressRequest, EvidenceIngressResponse,
} from './evidence-ingress.js';
export type {
  PackageRetrievalDeps, PackageRetrievalRequest, PackageRetrievalResponse,
} from './package-retrieval.js';

export { applicationTemplateCatalogue, applicationTemplateDescriptor } from './application-catalogue.js';
export type { ApplicationTemplateDescriptor, ApplicationTemplateCatalogue } from './application-catalogue.js';

// Software Update Management (ADR-0035): the ed25519 package signer and the version/compatibility/history
// helpers. Signing is a production precondition for publishing a platform update; unsigned publish → 501.
export {
  resolveSigningKey, generateSigningKeyMaterial, signContentHash, verifyContentHash, createPackageSigner,
  SigningKeyAbsentError, SigningKeyMismatchError,
} from './package-signing.js';
export type { DetachedSignature, SigningKey, SignablePackage } from './package-signing.js';
export { publishVerificationKeys, lastDistributedKeyIds, verificationKeyEvents } from './verification-key-distribution.js';
// ADR-0080 §6 steps 4-5 — the work path, and the carrier for tenancies that registered before it.
export {
  publishWorkPaths, lastDistributedWorkPath, workPathEvents, undistributed as undistributedWorkPaths,
  WORK_POLL_INTERVAL_SECONDS,
} from './work-path-distribution.js';
export type { WorkPathOutcome } from './work-path-distribution.js';
export type { DistributionOutcome } from './verification-key-distribution.js';
export {
  solutionVersion, buildUpdatePayload, stampPublished, markInstalled, isUpdateAvailable, checkCompatibility, updateHistory,
} from './update-management.js';
export type {
  UpdateStatus, EpSolutionVersion, ManifestVersionInfo, SolutionUpdatePayload,
  CompatibilityInput, CompatibilityReason, CompatibilityResult, UpdateHistoryEntry,
} from './update-management.js';

export { searchTenants, filterByStatus, sortTenants, queryDashboard } from './dashboard.js';
export type { TenantSort, DashboardQuery } from './dashboard.js';

export { diffManifests } from './manifest-diff.js';
export type { ManifestChange } from './manifest-diff.js';

export {
  TenantConfigRepository,
  InMemoryTenantConfigStore,
  FileTenantConfigStore,
} from './tenant-repository.js';
export type {
  TenantConfigStore,
  RepositoryOptions,
  TenantSummary,
} from './tenant-repository.js';

export {
  normaliseProjectManagement,
  normaliseTestManagement,
  normaliseApplication,
  detectFramework,
  SimulatedEdge,
} from './discovery.js';
export type {
  DiscoveredMetadata,
  EdgeDiscovery,
  ProjectManagementMetadata,
  TestManagementMetadata,
  SourceControlMetadata,
  ApplicationMetadata,
  ProjectManagementConfig,
  TestManagementConfig,
  ApplicationConfig,
} from './discovery.js';

export { recommend, deterministicAdvisor } from './recommendations.js';
export type { Advisor, Recommendation, RecommendationSet } from './recommendations.js';

export { activate } from './experience-orchestrator.js';
export type { ActivationRequest, ActivationOutcome, ActivationCertification } from './experience-orchestrator.js';
