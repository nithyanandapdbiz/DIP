/**
 * Tenant Configuration — the canonical, single-source-of-truth envelope for a tenant.
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md §1 (R-21.3 opaque id) · §5 (ownership split) · 15-configuration-model.md
 *   ADR          : ADR-0032 (Tenant Configuration Repository — canonical JSON SSOT) · ADR-0031 · ADR-0030
 *   Invariant    : INV-2 (no customer credential in the IP)
 *
 * ONE FILE, ONE TRUTH. The envelope embeds the EXACT `configuration` object the existing
 * onboard() consumes — so onboard() reads it with no mapper and no transformation (the SSOT
 * requirement). Around that canonical region sit two non-authoritative bands: `onboarding`
 * (orchestration/progress/audit) and `provenance` (what discovery/recommendation observed).
 * onboard() and validateOnboarding read ONLY `configuration`.
 *
 * IDENTITY IS OPAQUE (R-21.3). The folder slug may be human ("carlisle-prod"); the identity
 * onboard() uses is an opaque `tenantId` that encodes no meaning. The two are never conflated.
 *
 * NO CREDENTIAL LIVES HERE (INV-2). The canonical region carries selections and handles only;
 * the test suite scans it against the platform's CREDENTIAL_MARKERS.
 */
import type { ExperienceStage } from './onboarding-session.js';
import type { TestRepositoryDisposition } from '../domain/onboarding-configuration.js';

/** Stage 1 input — the only manual entry the journey asks for. */
export interface WelcomeInput {
  readonly organisationName: string;
  readonly tenantName: string;
  readonly primaryAdministrator: string;
  readonly primaryAdministratorEmail?: string;
  readonly preferredCloud: string;
  readonly deploymentModel: string;
  /** Classes of application under test (crm/d365/react/mobile/…). Each selects an EP target config. */
  readonly applicationTypes?: string[];
  /**
   * Does the application under test enforce a second factor at sign-in? Declared here because the
   * edge cannot detect it. Selects the TOTP secret SLOT in the generated EP package; the value is
   * set at the EP and never reaches the IP (INV-2). Sign-in targets (CRM/D365) are the usual case.
   */
  readonly mfaRequired?: boolean;
}

/** MFA posture of the application under test — a declaration, never a credential. */
export interface ApplicationMfa {
  required: boolean;
  method: string;
}

/**
 * The canonical configuration — structurally the OnboardingConfiguration the platform
 * validates and onboard() consumes. Fields are plain strings; `validateOnboarding` remains
 * the single authority on the enum/coherence rules (no validation is duplicated here).
 */
export interface CanonicalConfig {
  configurationVersion: string;
  customer: { customerName: string; tenantName: string; businessUnit: string; environment: string };
  technologyProfile: {
    profileVersion: string; language: string; framework: string; testRunner: string;
    ciSystem: string; gitProvider: string; cloudProvider: string; deploymentModel: string;
    packageManager: string; reportingFramework: string; frameworkVersions: Record<string, string>;
  };
  dbiz: { entitledCapabilities: string[]; contractVersion: string; retentionObligationDays: number };
  customerOwned: {
    deployment: { executionPlaneName: string; region: string };
    application: { applicationName: string; applicationUrl: string; applicationTypes?: string[]; authenticationType: string; mfa?: ApplicationMfa; browserRequirements: string[] };
    projectManagement: { provider: string; project?: string; board?: string; repository?: string };
    /**
     * ADR-0085. `repositoryDisposition` is OPTIONAL ON THE RECORD and REQUIRED AT INTAKE, and the
     * asymmetry is the ruling rather than an oversight:
     *
     *   - ABSENT on a draft means "not answered yet". A draft that seeded a disposition would be
     *     installing the default §4.1 rejects, taken by whoever wrote the seed on behalf of every
     *     tenancy that never took one.
     *   - `'unknown'` is produced ONLY by normalisation, for records generated before this field
     *     existed (D-133). It is never selectable, never a pass, and never read as a policy.
     *     Existing generated solutions MUST NOT be read as `create-if-absent` — that is §3's
     *     rejected inference arriving through MIGRATION instead of through design, which is the
     *     route a rejected alternative actually returns by.
     *   - A concrete member is set only by a configuration that passed `OnboardingConfigurationSchema`.
     */
    testManagement: {
      provider: string; projectKey?: string;
      repositoryDisposition?: TestRepositoryDisposition | 'unknown';
      baseUrl?: string;
      planId?: string; planName?: string;
      suiteId?: string; suiteName?: string;
      suiteKind?: 'requirement-based' | 'static';
    };
    ai: { providerHandle: string; capabilityClasses: string[]; routing?: string };
    security: { mutualTls: boolean; oauth: boolean; vault: boolean };
  };
}

export type OnboardingStatus = 'Onboarding' | 'Certified' | 'Provisioned' | 'Active' | 'Suspended' | 'Archived' | 'Failed';

export interface AuditEntry { readonly at: string; readonly event: string; readonly detail: string }

/**
 * Isolation configuration — DERIVED from the opaque tenant identity, and stored in the SSOT
 * so isolation settings live in the manifest (not a second `isolation.json`). It DESCRIBES the
 * platform's existing physical-path isolation model (platform-runtime `TenantPaths`); it does
 * not introduce a new mechanism, and the runtime enforcement is unchanged.
 */
export interface IsolationConfig {
  namespace: string;
  storagePartition: string;
  networkPolicy: 'default-deny';
  encryption: { atRest: boolean; algorithm: string };
  capabilityBoundaries: string[];
}

export interface MultiTenancyConfig {
  isolationModel: 'physical-path';
  tenantScoped: boolean;
}

/** Derive isolation from the opaque id + entitled capabilities. No customer secret, IP-owned. */
export function deriveIsolation(tenantId: string, capabilities: readonly string[]): IsolationConfig {
  return {
    namespace: tenantId,
    storagePartition: tenantId,
    networkPolicy: 'default-deny',
    // Declare the TRUE posture (F-17). The IP tenant store writes config at rest UNENCRYPTED; this is
    // acceptable because the SSOT holds no customer secret (INV-2, CREDENTIAL_MARKERS-verified). Asserting
    // atRest:true here would be false assurance — a manifest claiming a control the bytes do not have.
    // Real at-rest encryption of the store is a deployment/volume control (roadmap F-05), not asserted here.
    encryption: { atRest: false, algorithm: 'none' },
    capabilityBoundaries: [...capabilities],
  };
}

/**
 * Optional presentation branding for the generated Execution-Plane portal (ADR-0035 R-35.7).
 * Presentation only — NOT execution config; read by generation, never by onboard()/validateOnboarding.
 * Holds no secret (INV-2); a logo is a self-contained data: URI, never an external URL (sovereignty).
 */
export interface BrandingBand {
  companyName?: string;
  productName?: string;
  monogram?: string;
  themeNavy?: string;
  themeAccent?: string;
  logoDataUri?: string;
}

export interface TenantEnvelope {
  schemaVersion: '1.0.0';
  onboarding: {
    tenantId: string;   // opaque (R-21.3)
    slug: string;       // human folder name
    displayName: string;
    administrators: { name: string; email?: string }[];
    status: OnboardingStatus;
    currentStage: ExperienceStage;
    progress: number;   // 0..100
    createdAt: string;
    updatedAt: string;
    audit: AuditEntry[];
    lifecycleState?: string;
    projection?: string;
    /** Pending/applied change events the EP pulls and applies (EP-initiated; the IP never pushes). */
    updates?: CapabilityUpdateEvent[];
    /** EP API token METADATA (never the token itself). Regenerating bumps `version` and revokes prior tokens. */
    epToken?: { version: number; issuedAt: string; expiresAt: string; last4: string };
  };
  configuration: CanonicalConfig;
  /** Isolation + multi-tenancy settings, part of the manifest (never a second source). */
  isolation: IsolationConfig;
  multiTenancy: MultiTenancyConfig;
  provenance: {
    discovery?: unknown;
    recommendations?: unknown;
    certification?: { ok: boolean; issues: readonly { stage: number; code: string; detail: string }[]; at: string };
  };
  /** Optional presentation branding for the generated portal (ADR-0035 R-35.7). Additive; never consumed by onboard(). */
  branding?: BrandingBand;
  /** EP solution version state — published (IP) vs installed (EP-reported). Additive; the SSOT for update status (ADR-0035). */
  epSolution?: import('./update-management.js').EpSolutionVersion;
}

/** Stage → progress percentage. Welcome is 16%, matching the reference. */
export const EXPERIENCE_PROGRESS: Readonly<Record<ExperienceStage, number>> = {
  welcome: 16, connect: 33, discovery: 50, recommendations: 66, review: 83, activation: 100,
};

/**
 * Seed a COMPLETE canonical configuration from Welcome alone, with safe defaults for
 * everything discovery will later refine. Seeding a whole object (not a partial) is what
 * lets onboard() consume the SSOT at any point — enrichment refines fields in place rather
 * than assembling a second object at the end.
 */
export function initialConfiguration(w: WelcomeInput, slug: string): CanonicalConfig {
  return {
    configurationVersion: '1.0.0',
    customer: { customerName: w.organisationName, tenantName: w.tenantName, businessUnit: 'Engineering', environment: 'test' },
    technologyProfile: {
      profileVersion: '1.0.0', language: 'typescript', framework: 'playwright', testRunner: 'playwright-test',
      ciSystem: 'github-actions', gitProvider: 'github', cloudProvider: w.preferredCloud, deploymentModel: w.deploymentModel,
      packageManager: 'pnpm', reportingFramework: 'allure', frameworkVersions: {},
    },
    dbiz: { entitledCapabilities: ['functional-testing'], contractVersion: '1.0.0', retentionObligationDays: 365 },
    customerOwned: {
      deployment: { executionPlaneName: `${slug}_ExecutionPlane`, region: 'primary' },
      application: {
        applicationName: w.organisationName,
        applicationUrl: 'https://app.example.test',
        applicationTypes: w.applicationTypes && w.applicationTypes.length ? w.applicationTypes : ['web'],
        authenticationType: 'none',
        // Seeded from Welcome and carried through discovery — the edge cannot observe an MFA policy.
        mfa: { required: w.mfaRequired === true, method: w.mfaRequired === true ? 'totp' : 'none' },
        browserRequirements: [],
      },
      projectManagement: { provider: 'none' },
      testManagement: { provider: 'none' },
      ai: { providerHandle: 'ai-none', capabilityClasses: [] },
      security: { mutualTls: true, oauth: true, vault: true },
    },
  };
}

/**
 * A change to a live tenant that its Execution Plane must apply. The IP records it here (the SSOT);
 * the EP pulls pending events, enables the capability/config in its system, then acknowledges — the
 * IP never dials into the EP (INV-3). The `config` is a fill-in scaffold, never a secret (INV-2).
 */
export interface CapabilityUpdateEvent {
  readonly id: string;
  readonly type:
    | 'capability-added' | 'capability-removed' | 'configuration-changed'
    | 'integration-enabled' | 'integration-disabled' | 'solution-update'
    /**
     * The IP's package VERIFICATION keys changed (ADR-0081 P-81.4, D-123 link 1).
     *
     * THE ROTATION CARRIER, AND IT EXISTS BECAUSE THE GRANT IS NOT ONE. Verification keys reach a
     * tenancy in the registration grant — and registration is a ONCE-PER-TENANCY event, so a
     * tenancy registered before the grant carried keys holds none and has no way to obtain them.
     * Re-registering would mint a new EP credential, which is exactly the redeployment coupling
     * ADR-0007 §6 exists to avoid.
     *
     * PUBLIC MATERIAL ONLY. `config` carries verification keys, which R-08.15 makes
     * public-verification-only — possession cannot produce a signature — so nothing INV-2 protects
     * crosses on this event.
     */
    | 'verification-keys-changed'
    /**
     * The tenancy's WORK REQUEST PATH (ADR-0080 §6 steps 4–5, P-80.2).
     *
     * THE SAME CARRIER FOR THE SAME REASON, AND THE PRECEDENT IS DELIBERATE. `workPath` reaches a
     * tenancy in the registration grant, and registration is a ONCE-PER-TENANCY event — so a
     * tenancy registered before the grant carried the field holds no path and cannot obtain one.
     * `carlisle-homes` is exactly that tenancy: it registered before `/work` existed.
     *
     * **Re-registering would mint a new EP credential — the coupling ADR-0007 §6 exists to avoid**,
     * and it is the identical argument that gave `verification-keys-changed` its existence. Two
     * fields, one carrier shape; a third would be the sign the grant needs a general mechanism.
     *
     * ROUTING METADATA ONLY. `config` carries a path this plane publishes and an interval. Nothing
     * secret crosses, and the path names a route whose authorisation is unchanged by knowing it —
     * discovery is not access (P-80.2: the route inherits the tenant router's checks).
     */
    | 'work-path-changed';
  readonly capability?: string;
  /** For integration events (e.g. 'ai') — which integration was enabled/disabled. */
  readonly integration?: string;
  readonly config?: Record<string, unknown>;
  readonly status: 'pending' | 'applied';
  readonly createdAt: string;
  readonly appliedAt?: string;
}

/** Record a pending update event for the EP to pull. Append-only; returns the created event. */
export function emitUpdate(
  env: TenantEnvelope,
  ev: Pick<CapabilityUpdateEvent, 'type' | 'capability' | 'integration' | 'config'>,
  now: string,
): CapabilityUpdateEvent {
  if (!env.onboarding.updates) env.onboarding.updates = [];
  const event: CapabilityUpdateEvent = {
    id: `upd-${env.onboarding.updates.length + 1}`, status: 'pending', createdAt: now,
    type: ev.type,
    ...(ev.capability ? { capability: ev.capability } : {}),
    ...(ev.integration ? { integration: ev.integration } : {}),
    ...(ev.config ? { config: ev.config } : {}),
  };
  env.onboarding.updates.push(event);
  return event;
}

/** Append an audit entry; the trail is append-only (C-21.14). */
export function audit(env: TenantEnvelope, event: string, detail: string, now: string): void {
  env.onboarding.audit.push({ at: now, event, detail });
  env.onboarding.updatedAt = now;
}

/** Advance the recorded stage + progress (orchestration band only, never gates execution). */
export function setStage(env: TenantEnvelope, stage: ExperienceStage): void {
  env.onboarding.currentStage = stage;
  env.onboarding.progress = EXPERIENCE_PROGRESS[stage];
}
