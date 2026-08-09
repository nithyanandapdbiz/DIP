/**
 * Enterprise SaaS templates — Salesforce, SAP, Oracle Fusion, ServiceNow, Workday.
 *
 * TRACEABILITY: ADR-0021 · INV-2 (slot NAMES only)
 *
 * These targets share a shape: a real named user signs in through the product's own login flow,
 * usually behind a second factor; the session is captured once and replayed; discovery must be
 * authenticated because an anonymous request sees a login page; and each product publishes a
 * metadata surface that describes its objects far better than crawling its UI does.
 *
 * That shape is expressed ONCE, in `enterpriseSaasTemplate`, and each product declares only what
 * is genuinely its own: its slot prefix, the extra identifiers it needs (an SAP client, a Workday
 * tenant), its metadata endpoint, and its operator guidance. Restating the shared 200 lines five
 * times is how these templates would drift apart — a fix applied to Salesforce and missed on SAP.
 *
 * Each product is still a first-class template: it is registered by id, resolves independently,
 * and can diverge from the shared shape whenever it needs to without disturbing the others.
 */
import type { ApplicationTemplate, ApplicationConfigField, AuthenticationStrategy, ApplicationValidationRule, AuthenticationStrategyId } from '../application-template.js';
import {
  STANDARD_GROUPS, baseUrlField, usernameField, passwordField, totpSecretField, targetField, secretField,
  browserField, timeoutField, parallelismField, baseUrlRules, signInRules, mfaRules, executionRules, defineTemplate,
} from './shared.js';

interface EnterpriseSaasSpec {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly envPrefix: string;
  readonly precedence: number;
  readonly authStrategy: AuthenticationStrategyId;
  readonly authLabel: string;
  /** Minutes before the product expires an idle session. Drives the refresh cadence. */
  readonly sessionMinutes: number;
  /** Product-specific identifiers beyond the base URL (client/mandant, tenant, instance). */
  readonly extraTargetFields?: readonly ApplicationConfigField[];
  /** Product-specific credential slots beyond user/password/TOTP. */
  readonly extraCredentialFields?: readonly ApplicationConfigField[];
  /** Product-specific discovery profile entries (metadata endpoints, object scopes). */
  readonly discoveryProfile: Readonly<Record<string, unknown>>;
  readonly discoveryLabel: string;
  /** Concurrent authenticated sessions the product tolerates for one account. */
  readonly maxParallelSessions: number;
  readonly defaultTimeoutMs: number;
  readonly setupSteps: readonly string[];
  readonly authenticationNotes: readonly string[];
  readonly discoveryNotes: readonly string[];
  readonly executionNotes: readonly string[];
  readonly troubleshooting: readonly { readonly symptom: string; readonly resolution: string }[];
  readonly extraValidation?: readonly ApplicationValidationRule[];
}

function enterpriseSaasTemplate(spec: EnterpriseSaasSpec): ApplicationTemplate {
  const storageStatePath = `.auth/${spec.id}-session.json`;
  const credentialFields = [
    'username', 'password', 'totpSecret',
    ...(spec.extraCredentialFields ?? []).map((f) => f.name),
  ];

  const authentication: AuthenticationStrategy = {
    id: spec.authStrategy,
    label: spec.authLabel,
    credentialModel: 'user-sign-in',
    captureSession: true,
    storageStateReuse: true,
    mfaSupported: true,
    // Refresh a little inside the product's own session lifetime, so the refresh happens BEFORE
    // the product starts redirecting to its login page mid-run rather than after.
    sessionRefresh: { strategy: 'reauthenticate', intervalMinutes: Math.max(5, spec.sessionMinutes - 5) },
    credentialFields,
    storageStatePath,
  };

  return defineTemplate({
    id: spec.id,
    label: spec.label,
    description: spec.description,
    category: 'enterprise-saas',
    precedence: spec.precedence,
    envPrefix: spec.envPrefix,
    primaryTargetField: 'baseUrl',
    authentication,
    // No variants: the sign-in mechanism of these products is intrinsic, and a discovery pass
    // reporting something else must not be able to downgrade the target.
    discovery: {
      strategy: 'authenticated',
      fallbackStrategy: 'capture-session',
      label: spec.discoveryLabel,
      profile: {
        requiresSession: true,
        sessionSource: storageStatePath,
        maxDepth: 4,
        requestsPerSecond: 2,
        nonDestructive: true,
        readOnly: true,
        excludePaths: ['<FILL: destructive paths to exclude>'],
        ...spec.discoveryProfile,
      },
    },
    execution: {
      strategy: 'storage-state',
      label: 'Replay the captured session, refreshing it before the product expires it',
      sessionRefresh: true,
      profile: {
        storageState: storageStatePath,
        reauthenticateOnSignInRedirect: true,
        captureTrace: true,
        captureScreenshotOnFailure: true,
      },
    },
    runtime: {
      adapterInterfaces: ['I2-browser', 'I3-api'],
      primaryAdapterInterface: 'I2-browser',
      browserRequired: true,
      headlessSupported: true,
      maxParallelSessions: spec.maxParallelSessions,
      supportsUiExecution: true,
      supportsApiExecution: true,
      nonDestructiveByDefault: true,
    },
    configuration: [
      baseUrlField({ label: `${spec.label} base URL`, help: `Base URL of the ${spec.label} test instance.` }),
      ...(spec.extraTargetFields ?? []),
      usernameField({ label: `${spec.label} sign-in user`, help: 'The automation account the Execution Plane signs in as. It must be a real, licensed account.' }),
      passwordField({ label: `${spec.label} sign-in password` }),
      totpSecretField(),
      ...(spec.extraCredentialFields ?? []),
      browserField(),
      timeoutField(spec.defaultTimeoutMs),
      parallelismField(spec.maxParallelSessions),
    ],
    portal: {
      title: spec.label,
      summary: 'The Execution Plane signs in to this target as a real user and reuses the captured session. Every value below is set at your Execution Plane; DBiz receives none of them.',
      groups: STANDARD_GROUPS,
    },
    validation: [
      ...baseUrlRules(spec.id, { requireHttps: true }),
      ...signInRules(spec.id),
      ...mfaRules(spec.id),
      ...executionRules(spec.id, spec.maxParallelSessions),
      ...(spec.extraValidation ?? []),
    ],
    documentation: {
      summary: `${spec.label} driven as a signed-in user. The session is captured once and replayed, so unattended execution works behind MFA.`,
      setupSteps: [
        `Create (or nominate) a dedicated automation account in the ${spec.label} test instance with the roles the suite needs and nothing more.`,
        'Enrol that account in TOTP-based MFA and keep the enrolment secret — the Execution Plane derives the second factor from it.',
        ...spec.setupSteps,
        'Run the capture step once. The authenticated session is written locally and reused by every later run.',
      ],
      authenticationNotes: [
        'Sign-in uses the product\'s own login flow — the real one, not a bypass.',
        'MFA is presented, not skipped: the Execution Plane derives the same TOTP code the account holder would enter.',
        `The captured session is written to \`${storageStatePath}\` inside your Execution Plane and never leaves it.`,
        `The session is refreshed roughly every ${Math.max(5, spec.sessionMinutes - 5)} minutes, inside this product's own session lifetime.`,
        'Credentials are read from `.env` at the point of use. The Intelligence Plane holds none of them (INV-2).',
        ...spec.authenticationNotes,
      ],
      discoveryNotes: [
        'Discovery is AUTHENTICATED. An anonymous request to this target returns its login page, so a captured session is a precondition.',
        'Discovery is read-only and rate-limited; no record is created, updated or deleted.',
        ...spec.discoveryNotes,
      ],
      executionNotes: [
        'Execution replays the captured session rather than signing in per test.',
        'If a replayed session has gone stale, the run re-authenticates instead of failing at whichever step first hit the login page.',
        'Writes are guardrailed by default — scope them explicitly before enabling them against an instance holding real data.',
        ...spec.executionNotes,
      ],
      troubleshooting: [
        { symptom: 'The run stalls at a second-factor prompt', resolution: 'The TOTP enrolment secret is missing or belongs to a different account. Set it in `.env` for the automation account you are signing in as.' },
        { symptom: 'Discovery returns an empty surface', resolution: 'The captured session has expired or was never created. Re-run the capture step; discovery against this target cannot proceed anonymously.' },
        ...spec.troubleshooting,
      ],
    },
    capabilityProfiles: {
      'functional-testing': { timeoutSeconds: 900, guardrail: { maxConcurrency: spec.maxParallelSessions }, browsers: ['chromium'] },
      'inverse-flow-discovery': { timeoutSeconds: 1800, guardrail: { maxConcurrency: 1, nonDestructive: true, requestsPerSecond: 2 }, maxDepth: 4 },
      performance: { guardrail: { maxVirtualUsers: 5 }, virtualUsers: 3 },
      'security-testing': { timeoutSeconds: 1800, guardrail: { maxConcurrency: 1 } },
      'penetration-testing': { guardrail: { maxConcurrency: 1 } },
    },
  });
}

// ── Salesforce ───────────────────────────────────────────────────────────────

export const SALESFORCE_TEMPLATE = enterpriseSaasTemplate({
  id: 'salesforce',
  label: 'Salesforce',
  description: 'A Salesforce org signed into as a real user, with session capture and MFA support.',
  envPrefix: 'SALESFORCE',
  precedence: 45,
  authStrategy: 'form',
  authLabel: 'Salesforce sign-in with session capture',
  sessionMinutes: 120,
  extraTargetFields: [
    targetField({
      name: 'apiVersion', label: 'REST API version', envSuffix: 'API_VERSION', order: 11, defaultValue: 'v60.0',
      help: 'Salesforce REST API version used for metadata discovery.',
    }),
  ],
  extraCredentialFields: [
    secretField({
      name: 'securityToken', label: 'Security token', envSuffix: 'SECURITY_TOKEN', order: 41,
      help: 'Salesforce security token for the automation account, if the org requires one for API access from an untrusted IP range.',
    }),
  ],
  discoveryProfile: {
    metadataEndpoint: '/services/data/{apiVersion}/sobjects',
    enumerateObjects: true,
    enumerateLayouts: true,
    enumerateFlows: true,
  },
  discoveryLabel: 'Sign in, then enumerate objects, layouts and flows from the REST metadata surface',
  maxParallelSessions: 2,
  defaultTimeoutMs: 60000,
  setupSteps: [
    'Add the Execution Plane\'s egress addresses to the org\'s trusted IP ranges, or set the account\'s security token.',
    'Set the base URL (the My Domain URL, not the login.salesforce.com front door), user, password and TOTP secret in `.env`.',
  ],
  authenticationNotes: [
    'Use the org\'s My Domain URL. Signing in through the shared login host lands on a different session than the org expects.',
  ],
  discoveryNotes: [
    'Objects, page layouts and flows are read from the REST metadata surface, which describes the org far more reliably than crawling Lightning pages.',
  ],
  executionNotes: [
    'Lightning pages settle slowly; the longer default timeout is deliberate and should not be lowered to web-app values.',
  ],
  troubleshooting: [
    { symptom: 'Sign-in fails with "invalid credentials" despite a correct password', resolution: 'The org requires a security token for this IP range. Set the security token slot in `.env`.' },
  ],
});

// ── SAP ──────────────────────────────────────────────────────────────────────

export const SAP_TEMPLATE = enterpriseSaasTemplate({
  id: 'sap',
  label: 'SAP',
  description: 'An SAP Fiori/S4 system signed into as a real user, discovered from its OData catalogue.',
  envPrefix: 'SAP',
  precedence: 45,
  authStrategy: 'form',
  authLabel: 'SAP Fiori launchpad sign-in with session capture',
  sessionMinutes: 60,
  extraTargetFields: [
    targetField({
      name: 'client', label: 'Client (mandant)', envSuffix: 'CLIENT', order: 11, required: true,
      help: 'SAP client number the Execution Plane signs in against, e.g. 100. The wrong client is a different dataset.',
    }),
    targetField({
      name: 'language', label: 'Logon language', envSuffix: 'LANGUAGE', order: 12, defaultValue: 'EN',
      help: 'Two-letter logon language. It changes UI labels, so a suite written against EN will not match a DE session.',
    }),
  ],
  discoveryProfile: {
    metadataEndpoint: '/sap/opu/odata/iwfnd/catalogservice;v=2/ServiceCollection',
    enumerateOdataServices: true,
    enumerateFioriTiles: true,
  },
  discoveryLabel: 'Sign in, then enumerate Fiori tiles and OData services from the gateway catalogue',
  maxParallelSessions: 1,
  defaultTimeoutMs: 90000,
  setupSteps: [
    'Set the base URL, client, logon language, user, password and TOTP secret in `.env`.',
    'Confirm the automation account is not locked out by the system\'s failed-logon policy before the first run.',
  ],
  authenticationNotes: [
    'The client number is part of the identity: the same user in a different client is a different session and a different dataset.',
    'SAP locks an account after a small number of failed logons. A wrong password in `.env` will lock the automation account, not just fail the run.',
  ],
  discoveryNotes: [
    'Fiori tiles and OData services are read from the gateway catalogue, which is authoritative where crawling the launchpad is not.',
  ],
  executionNotes: [
    'The logon language changes every UI label. Keep it fixed for the life of a suite.',
  ],
  troubleshooting: [
    { symptom: 'The automation account is locked', resolution: 'A wrong password in `.env` tripped the failed-logon policy. Correct it, then have an administrator unlock the account.' },
    { symptom: 'Selectors match nothing after a working run', resolution: 'The logon language changed. Set it explicitly in `.env` rather than relying on the account default.' },
  ],
});

// ── Oracle Fusion ────────────────────────────────────────────────────────────

export const ORACLE_FUSION_TEMPLATE = enterpriseSaasTemplate({
  id: 'oracle-fusion',
  label: 'Oracle Fusion',
  description: 'An Oracle Fusion Cloud application signed into as a real user, with session capture.',
  envPrefix: 'ORACLE_FUSION',
  precedence: 45,
  authStrategy: 'form',
  authLabel: 'Oracle Fusion sign-in with session capture',
  sessionMinutes: 60,
  discoveryProfile: {
    metadataEndpoint: '/fscmRestApi/resources/latest',
    enumerateRestResources: true,
    enumerateWorkAreas: true,
  },
  discoveryLabel: 'Sign in, then enumerate work areas and REST resources',
  maxParallelSessions: 1,
  defaultTimeoutMs: 90000,
  setupSteps: [
    'Set the base URL, user, password and TOTP secret in `.env`.',
    'Confirm the automation account holds the job roles the suite exercises — Fusion hides, rather than refuses, what a role cannot reach.',
  ],
  authenticationNotes: [
    'Fusion applies role-based visibility. An under-privileged account produces empty pages rather than authorisation errors, which reads as a product defect.',
  ],
  discoveryNotes: [
    'REST resources are enumerated from the versioned catalogue, so discovery reflects the modules this account can actually reach.',
  ],
  executionNotes: [
    'Fusion pages reload their region content asynchronously; the longer default timeout is deliberate.',
  ],
  troubleshooting: [
    { symptom: 'Pages render but are empty', resolution: 'The automation account lacks the job role for that work area. Grant it, rather than raising timeouts.' },
  ],
});

// ── ServiceNow ───────────────────────────────────────────────────────────────

export const SERVICENOW_TEMPLATE = enterpriseSaasTemplate({
  id: 'servicenow',
  label: 'ServiceNow',
  description: 'A ServiceNow instance signed into as a real user, discovered from its Table API.',
  envPrefix: 'SERVICENOW',
  precedence: 45,
  authStrategy: 'form',
  authLabel: 'ServiceNow sign-in with session capture',
  sessionMinutes: 30,
  extraTargetFields: [
    targetField({
      name: 'instance', label: 'Instance name', envSuffix: 'INSTANCE', order: 11,
      help: 'Instance short name (the host label of your instance URL). Used to scope discovery to this instance.',
    }),
  ],
  discoveryProfile: {
    metadataEndpoint: '/api/now/table/sys_db_object',
    enumerateTables: true,
    enumerateForms: true,
    enumerateWorkflows: true,
  },
  discoveryLabel: 'Sign in, then enumerate tables, forms and workflows from the Table API',
  maxParallelSessions: 2,
  defaultTimeoutMs: 45000,
  setupSteps: [
    'Set the base URL, instance name, user, password and TOTP secret in `.env`.',
    'Give the automation account a role that can read `sys_db_object`, or discovery will see only the tables it can already reach.',
  ],
  authenticationNotes: [
    'ServiceNow expires an idle session quickly; the refresh cadence is set accordingly.',
  ],
  discoveryNotes: [
    'Tables, forms and workflows are read from the Table API rather than crawled from the UI, so discovery is not limited to what is linked in the navigator.',
  ],
  executionNotes: [
    'A developer instance hibernates when idle. Wake it before a scheduled run, or the first steps fail against a sleeping instance.',
  ],
  troubleshooting: [
    { symptom: 'Discovery finds far fewer tables than expected', resolution: 'The automation account cannot read `sys_db_object`. Grant the role; discovery reports only what the account can see.' },
    { symptom: 'The first run of the day fails', resolution: 'The instance was hibernating. Wake it before the scheduled run.' },
  ],
});

// ── Workday ──────────────────────────────────────────────────────────────────

export const WORKDAY_TEMPLATE = enterpriseSaasTemplate({
  id: 'workday',
  label: 'Workday',
  description: 'A Workday tenant signed into as a real user, with session capture.',
  envPrefix: 'WORKDAY',
  precedence: 45,
  authStrategy: 'form',
  authLabel: 'Workday sign-in with session capture',
  sessionMinutes: 30,
  extraTargetFields: [
    targetField({
      name: 'tenant', label: 'Workday tenant', envSuffix: 'TENANT', order: 11, required: true,
      help: 'Workday tenant name. It is part of every URL and of the identity — the wrong tenant is a different dataset.',
    }),
  ],
  discoveryProfile: {
    metadataEndpoint: '/ccx/api/v1/{tenant}',
    enumerateTasks: true,
    enumerateReports: true,
  },
  discoveryLabel: 'Sign in, then enumerate tasks and reports available to the account',
  maxParallelSessions: 1,
  defaultTimeoutMs: 60000,
  setupSteps: [
    'Set the base URL, tenant, user, password and TOTP secret in `.env`.',
    'Use a sandbox or implementation tenant. Workday production tenants hold live worker data.',
  ],
  authenticationNotes: [
    'The tenant name is part of the identity as well as the URL. A suite pointed at the wrong tenant signs in successfully and tests the wrong data.',
  ],
  discoveryNotes: [
    'Discovery enumerates the tasks and reports the account can reach — Workday exposes nothing an account is not entitled to see.',
  ],
  executionNotes: [
    'Workday holds worker data. Writes stay guardrailed by default for this target; scope them explicitly before enabling them.',
  ],
  troubleshooting: [
    { symptom: 'Sign-in succeeds but the expected tasks are missing', resolution: 'The account lacks the security group for those tasks, or the tenant is not the one the suite was written against.' },
  ],
});

export const ENTERPRISE_SAAS_TEMPLATES: readonly ApplicationTemplate[] = [
  SALESFORCE_TEMPLATE, SAP_TEMPLATE, ORACLE_FUSION_TEMPLATE, SERVICENOW_TEMPLATE, WORKDAY_TEMPLATE,
];
