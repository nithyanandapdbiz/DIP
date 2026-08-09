/**
 * Microsoft Dynamics 365 CRM — and the generic CRM target it generalises.
 *
 * TRACEABILITY: ADR-0021 · INV-2 (slot NAMES only) · R-14.14 (capability-named interfaces)
 *
 * D365 IS THE TARGET THAT PROVED THE GENERIC PACKAGE WRONG. It is not a web application with a
 * login form: it is signed into interactively through Microsoft Entra, behind a second factor, and
 * the resulting session must be captured, persisted and replayed — otherwise every capability run
 * re-authenticates, every re-authentication re-challenges MFA, and unattended execution is
 * impossible. Discovery is likewise authenticated: a D365 org shows a sign-in page and nothing
 * else to an anonymous crawler, so an anonymous discovery strategy returns an empty surface and
 * reports success.
 *
 * DECLARED, NOT DISCOVERED. This template declares NO authentication variants. A discovery pass
 * that reports `oauth` for the org's front door must not be able to downgrade the target to a
 * token-bearing web app — the authentication mechanism of a Dynamics org is intrinsic to it, and
 * that is precisely the regression `application-target.test.ts` guards.
 *
 * BACKWARD COMPATIBILITY: `D365_BASE_URL`, `D365_USERNAME`, `D365_PASSWORD`, `D365_TOTP_SECRET`
 * (and the `CRM_` equivalents) are the slot names the previous generator emitted, unchanged.
 */
import type { ApplicationTemplate, AuthenticationStrategy } from '../application-template.js';
import {
  STANDARD_GROUPS, baseUrlField, usernameField, passwordField, totpSecretField, targetField,
  browserField, timeoutField, parallelismField, baseUrlRules, signInRules, mfaRules, executionRules, defineTemplate,
} from './shared.js';

/**
 * Interactive Entra sign-in with session capture.
 *
 * `captureSession` + `storageStateReuse` are what make MFA survivable unattended: the second
 * factor is presented ONCE, the authenticated storage state is written to the EP-local path below,
 * and every later run replays it. `sessionRefresh` re-authenticates before the org's own session
 * lifetime expires, so a long suite does not die at the ninety-minute mark.
 *
 * MFA IS NEVER BYPASSED. The TOTP slot lets the Execution Plane DERIVE the second factor from the
 * automation account's own enrolment secret — the same factor a human would present. Nothing here
 * disables, downgrades or works around the policy.
 */
const entraInteractive = (label: string, storageStatePath: string): AuthenticationStrategy => ({
  id: 'microsoft-entra-interactive',
  label,
  credentialModel: 'user-sign-in',
  captureSession: true,
  storageStateReuse: true,
  mfaSupported: true,
  // 55 minutes: inside the default Entra access-token lifetime, so the refresh happens before
  // the org starts returning a sign-in redirect mid-run rather than after.
  sessionRefresh: { strategy: 'reauthenticate', intervalMinutes: 55 },
  credentialFields: ['username', 'password', 'totpSecret'],
  storageStatePath,
});

interface CrmVariant {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Higher wins when a tenant declares several classes — D365 must beat the generic CRM block. */
  readonly precedence: number;
  readonly envPrefix: string;
  readonly authLabel: string;
  /** Dynamics-specific slots and profile entries the generic CRM target does not have. */
  readonly dynamics: boolean;
}

function crmTemplate(v: CrmVariant): ApplicationTemplate {
  const storageStatePath = `.auth/${v.id}-session.json`;
  return defineTemplate({
    id: v.id,
    label: v.label,
    description: v.description,
    category: 'enterprise-saas',
    precedence: v.precedence,
    envPrefix: v.envPrefix,
    primaryTargetField: 'baseUrl',
    authentication: entraInteractive(v.authLabel, storageStatePath),
    // Deliberately no variants — see the file header.
    discovery: {
      strategy: 'authenticated',
      fallbackStrategy: 'capture-session',
      label: 'Sign in, then walk the authenticated application surface',
      profile: {
        // Anonymous crawling of a Dynamics org returns the sign-in page and nothing else, so the
        // captured session is a PRECONDITION of discovery, not an optimisation.
        requiresSession: true,
        sessionSource: storageStatePath,
        maxDepth: 4,
        requestsPerSecond: 2,
        nonDestructive: true,
        readOnly: true,
        excludePaths: ['<FILL: destructive paths to exclude>'],
        ...(v.dynamics
          ? {
            // A model-driven app exposes its entity/form/view metadata through the Web API, which
            // is a far more reliable surface than scraping the shell UI. The version is a
            // PLACEHOLDER resolved from the `apiVersion` slot — writing it literally here would
            // give the package two versions to keep in step, and they would not stay in step.
            metadataEndpoint: '/api/data/{apiVersion}/$metadata',
            enumerateEntities: true,
            enumerateForms: true,
            enumerateViews: true,
            enumerateBusinessProcessFlows: true,
          }
          : {}),
      },
    },
    execution: {
      strategy: 'storage-state',
      label: 'Replay the captured session, refreshing it before the org expires it',
      sessionRefresh: true,
      profile: {
        storageState: storageStatePath,
        // If the replayed session has gone stale the run must sign in again rather than fail at
        // whatever step first landed on the login page.
        reauthenticateOnSignInRedirect: true,
        captureTrace: true,
        captureScreenshotOnFailure: true,
        ...(v.dynamics ? { waitForAppShell: true, dismissWelcomeDialogs: true } : {}),
      },
    },
    runtime: {
      adapterInterfaces: ['I2-browser', 'I3-api'],
      primaryAdapterInterface: 'I2-browser',
      browserRequired: true,
      // A captured storage state is replayable headlessly; only the initial capture needs a head.
      headlessSupported: true,
      // One authenticated session per automation account. Running several in parallel makes the
      // org invalidate the older ones, which surfaces as random mid-run sign-out.
      maxParallelSessions: 1,
      supportsUiExecution: true,
      supportsApiExecution: true,
      nonDestructiveByDefault: true,
    },
    configuration: [
      baseUrlField({
        label: `${v.label} base URL`,
        help: v.dynamics
          ? 'Organisation URL of the Dynamics 365 test instance, e.g. https://contoso.crm.dynamics.com.'
          : 'Base URL of the CRM test instance the Execution Plane signs in to.',
      }),
      ...(v.dynamics
        ? [
          targetField({
            name: 'appId', label: 'Model-driven app id', envSuffix: 'APP_ID', order: 11,
            help: 'App id of the model-driven app to open (the `appid` query parameter). Leave blank to use the org default.',
          }),
          targetField({
            name: 'apiVersion', label: 'Web API version', envSuffix: 'API_VERSION', order: 12, defaultValue: 'v9.2',
            help: 'Dataverse Web API version used for metadata discovery.',
          }),
        ]
        : []),
      usernameField({ label: `${v.label} sign-in user`, help: 'The automation account the Execution Plane signs in as. It must be a real, licensed account.' }),
      passwordField({ label: `${v.label} sign-in password` }),
      totpSecretField(),
      browserField(),
      // Enterprise SaaS shells are slow to settle; a web-app timeout produces flake that looks
      // like a product defect.
      timeoutField(60000),
      parallelismField(1),
    ],
    portal: {
      title: v.label,
      summary: 'The Execution Plane signs in to this target as a real user and reuses the captured session. Every value below is set at your Execution Plane; DBiz receives none of them.',
      groups: STANDARD_GROUPS,
    },
    validation: [
      // Credentials cross this connection, so plain http is refused rather than warned about.
      ...baseUrlRules(v.id, { requireHttps: true }),
      ...signInRules(v.id),
      ...mfaRules(v.id),
      ...executionRules(v.id, 1),
      {
        id: `${v.id}.mfa.declared`, field: '*', rule: 'required', scope: 'intelligence-plane', severity: 'warning',
        appliesWhen: { path: 'mfa.required', equals: false },
        detail: 'MFA was not declared for this target. Most Dynamics/CRM tenants enforce it — if sign-in is later challenged, re-run onboarding with MFA enabled so the TOTP slot is generated.',
      },
      ...(v.dynamics
        ? [{
          id: `${v.id}.baseUrl.pattern`, field: 'baseUrl', rule: 'pattern' as const, scope: 'both' as const, severity: 'warning' as const,
          pattern: '^https://[^/]+\\.(crm[0-9]*\\.dynamics\\.com|dynamics\\.com)(/.*)?$',
          detail: 'The base URL does not look like a Dynamics 365 organisation URL. Confirm it is the org URL, not the Power Platform admin centre.',
        }]
        : []),
    ],
    documentation: {
      summary: `${v.label} driven as a signed-in user. The session is captured once and replayed, so unattended execution works behind MFA.`,
      setupSteps: [
        `Create (or nominate) a dedicated automation account in the ${v.label} test instance with the roles the suite needs and nothing more.`,
        'Enrol that account in TOTP-based MFA and keep the enrolment secret — the Execution Plane derives the second factor from it.',
        'Set the base URL, user, password and TOTP secret in `.env` at your Execution Plane.',
        'Run the capture step once. The authenticated session is written locally and reused by every later run.',
      ],
      authenticationNotes: [
        'Sign-in is interactive Microsoft Entra — the real sign-in flow, not a bypass.',
        'MFA is presented, not skipped: the Execution Plane derives the same TOTP code the account holder would enter.',
        `The captured session is written to \`${storageStatePath}\` inside your Execution Plane and never leaves it.`,
        'The session is refreshed before the organisation expires it, so a long suite does not sign out mid-run.',
        'Credentials are read from `.env` at the point of use. The Intelligence Plane holds none of them (INV-2).',
      ],
      discoveryNotes: [
        'Discovery is AUTHENTICATED. An anonymous crawl of this target returns the sign-in page and nothing else, so a session is a precondition rather than an optimisation.',
        ...(v.dynamics
          ? ['Entities, forms, views and business process flows are enumerated from the Dataverse metadata endpoint — a far more reliable surface than scraping the shell.']
          : []),
        'Discovery is read-only and rate-limited; no record is created, updated or deleted.',
      ],
      executionNotes: [
        'Execution replays the captured session rather than signing in per test.',
        'If a replayed session has gone stale, the run re-authenticates instead of failing at whichever step first hit the sign-in page.',
        'One session at a time: this target invalidates older sessions for the same account, so parallel workers cause random sign-outs.',
        'Writes are guardrailed by default — scope them explicitly before enabling them against an instance holding real data.',
      ],
      troubleshooting: [
        { symptom: 'The run stalls at a "Enter code" prompt', resolution: 'The TOTP enrolment secret is missing or belongs to a different account. Set it in `.env` for the automation account you are signing in as.' },
        { symptom: 'Runs sign out part-way through', resolution: 'More than one worker is using the same account. Set parallel workers to 1, or give each worker its own automation account.' },
        { symptom: 'Discovery returns an empty surface', resolution: 'The captured session has expired or was never created. Re-run the capture step; discovery against this target cannot proceed anonymously.' },
        { symptom: 'Sign-in succeeds but every flow lands on a blank shell', resolution: 'The model-driven app id is wrong or the account has no access to it. Clear it to use the org default, or grant the app role.' },
      ],
    },
    capabilityProfiles: {
      // Enterprise SaaS: one session, longer budgets, read-only discovery.
      'functional-testing': { timeoutSeconds: 900, guardrail: { maxConcurrency: 1 }, browsers: ['chromium'] },
      'inverse-flow-discovery': { timeoutSeconds: 1800, guardrail: { maxConcurrency: 1, nonDestructive: true, requestsPerSecond: 2 }, maxDepth: 4 },
      performance: { guardrail: { maxVirtualUsers: 5 }, virtualUsers: 3 },
      'security-testing': { timeoutSeconds: 1800, guardrail: { maxConcurrency: 1 } },
      'penetration-testing': { guardrail: { maxConcurrency: 1 } },
    },
  });
}

export const D365_TEMPLATE = crmTemplate({
  id: 'd365',
  label: 'Microsoft Dynamics 365',
  description: 'A Dynamics 365 organisation signed into through Microsoft Entra, with session capture and MFA support.',
  precedence: 50,
  envPrefix: 'D365',
  authLabel: 'Microsoft Entra interactive sign-in with session capture',
  dynamics: true,
});

export const CRM_TEMPLATE = crmTemplate({
  id: 'crm',
  label: 'CRM',
  description: 'A CRM application signed into as a real user, with session capture and MFA support.',
  precedence: 40,
  envPrefix: 'CRM',
  authLabel: 'Interactive sign-in with session capture',
  dynamics: false,
});

export const DYNAMICS_TEMPLATES: readonly ApplicationTemplate[] = [D365_TEMPLATE, CRM_TEMPLATE];
