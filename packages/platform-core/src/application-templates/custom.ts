/**
 * Custom / unclassified application templates.
 *
 * TRACEABILITY: ADR-0021 · INV-2 (slot NAMES only)
 *
 * THE FALLBACK MUST BE HONEST. When a tenant's application does not match a registered class, the
 * package it receives must say so — not quietly pretend to be a generic web app whose discovery
 * and execution strategies were chosen for a different target. This template therefore declares
 * the smallest coherent target (an addressable endpoint with an optional credential), marks
 * discovery as `none` rather than claiming a strategy it cannot deliver, and documents exactly
 * which decisions the operator has to make by hand.
 *
 * `other` is the historical id and remains the registry's fallback, so a tenant onboarded before
 * this registry existed resolves to the same behaviour it already had. `custom` is the same shape
 * under the name the product surfaces; both are generated from one factory so they cannot drift.
 */
import type { ApplicationTemplate, AuthenticationStrategy, VisibilityCondition } from '../application-template.js';
import {
  STANDARD_GROUPS, baseUrlField, usernameField, passwordField, totpSecretField, secretField,
  browserField, timeoutField, parallelismField, baseUrlRules, signInRules, mfaRules, executionRules, defineTemplate,
} from './shared.js';

const USER_SIGN_IN: VisibilityCondition = { path: 'authenticationType', oneOf: ['form', 'basic'] };
const TOKEN_BEARING: VisibilityCondition = { path: 'authenticationType', oneOf: ['oauth', 'saml', 'custom'] };

const ANONYMOUS: AuthenticationStrategy = {
  id: 'anonymous',
  label: 'Anonymous — no sign-in declared',
  credentialModel: 'none',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'none' },
  credentialFields: [],
};

const SIGN_IN = (storageStatePath: string): AuthenticationStrategy => ({
  id: 'form',
  label: 'Sign-in with session capture',
  credentialModel: 'user-sign-in',
  captureSession: true,
  storageStateReuse: true,
  mfaSupported: true,
  sessionRefresh: { strategy: 'reauthenticate', intervalMinutes: 240 },
  credentialFields: ['username', 'password', 'totpSecret'],
  storageStatePath,
});

const TOKEN_BEARER: AuthenticationStrategy = {
  id: 'api-key',
  label: 'Application-held token or assertion',
  credentialModel: 'service-credential',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'none' },
  credentialFields: ['authSecret'],
};

function customTemplate(id: string, label: string, description: string, precedence: number): ApplicationTemplate {
  const storageStatePath = `.auth/${id}-session.json`;
  return defineTemplate({
    id,
    label,
    description,
    category: 'custom',
    precedence,
    envPrefix: 'TEST',
    primaryTargetField: 'baseUrl',
    authentication: ANONYMOUS,
    authenticationVariants: {
      none: ANONYMOUS,
      form: SIGN_IN(storageStatePath),
      basic: SIGN_IN(storageStatePath),
      oauth: TOKEN_BEARER,
      saml: TOKEN_BEARER,
      custom: TOKEN_BEARER,
    },
    discovery: {
      // `none`, deliberately. Claiming `anonymous` here would emit a crawl profile chosen for a
      // target class this application has not been matched to, and report an empty surface as a
      // successful discovery. Saying "not automated" is the honest state and the actionable one.
      strategy: 'none',
      label: 'Not automated for an unclassified target — declare flows explicitly',
      profile: {
        reason: 'This application is not matched to a registered class, so no discovery strategy is assumed.',
        seedFlows: ['<FILL: declare the flows to exercise, or register an application template for this target>'],
      },
    },
    execution: {
      strategy: 'authenticated',
      label: 'Drive the declared flows against the target',
      sessionRefresh: false,
      profile: { captureTrace: true, captureScreenshotOnFailure: true },
    },
    runtime: {
      adapterInterfaces: ['I2-browser', 'I3-api'],
      primaryAdapterInterface: 'I2-browser',
      browserRequired: true,
      headlessSupported: true,
      maxParallelSessions: 2,
      supportsUiExecution: true,
      supportsApiExecution: true,
      // Nothing is known about this target's write semantics, so writes stay guardrailed until
      // the tenant says otherwise.
      nonDestructiveByDefault: true,
    },
    configuration: [
      baseUrlField({ help: 'Base URL of the application under test.' }),
      usernameField({ visibleWhen: USER_SIGN_IN }),
      passwordField({ visibleWhen: USER_SIGN_IN }),
      totpSecretField({ and: USER_SIGN_IN }),
      secretField({
        name: 'authSecret', label: 'Application authentication secret', envVar: 'APP_AUTH_SECRET', required: true,
        help: 'The token, client secret or assertion the application accepts. Set at the Execution Plane.',
        visibleWhen: TOKEN_BEARING,
      }),
      browserField(),
      timeoutField(30000),
      parallelismField(2),
    ],
    portal: {
      title: label,
      summary: 'An unclassified target. Point the Execution Plane at it and declare the flows to exercise — discovery is not assumed.',
      groups: STANDARD_GROUPS,
    },
    validation: [
      ...baseUrlRules(id),
      ...signInRules(id, USER_SIGN_IN),
      ...mfaRules(id, USER_SIGN_IN),
      {
        id: `${id}.authSecret.required`, field: 'authSecret', rule: 'required', scope: 'execution-plane', severity: 'error',
        appliesWhen: TOKEN_BEARING,
        detail: 'The declared authentication mechanism needs an application secret, and none is set.',
      },
      ...executionRules(id, 2),
      {
        id: `${id}.classification`, field: '*', rule: 'required', scope: 'intelligence-plane', severity: 'warning',
        detail: 'This tenant\'s application is unclassified, so discovery is not automated and execution profiles are generic. Registering an application template for this target replaces both with real strategies.',
      },
    ],
    documentation: {
      summary: `${label}. No registered class matched this target, so the package carries a minimal, honest configuration rather than an assumed one.`,
      setupSteps: [
        'Set the target base URL in `.env`.',
        'Set the credential slots for the mechanism you declared, if any.',
        'Declare the flows to exercise in the discovery profile — nothing is crawled automatically for an unclassified target.',
      ],
      authenticationNotes: [
        'The mechanism you declared at onboarding selects the credential slots. A sign-in mechanism captures and replays the session.',
      ],
      discoveryNotes: [
        'Discovery is NOT automated for this target. That is deliberate: a crawl profile chosen for a different class of application would report an empty surface as a success.',
        'Registering an application template for this target is what turns discovery on — it needs no generator change.',
      ],
      executionNotes: [
        'Writes stay guardrailed by default, because nothing is known about this target\'s write semantics.',
      ],
      troubleshooting: [
        { symptom: 'Discovery finds nothing', resolution: 'Expected — discovery is not automated for an unclassified target. Declare seed flows, or register an application template for it.' },
      ],
    },
    capabilityProfiles: {
      'inverse-flow-discovery': { guardrail: { maxConcurrency: 1, nonDestructive: true } },
    },
  });
}

/** The historical id, and the registry's fallback. Behaviour is unchanged for existing tenants. */
export const OTHER_TEMPLATE = customTemplate(
  'other',
  'Other application',
  'An application that does not match a registered class.',
  1,
);

/** The same shape under the name the product surfaces. */
export const CUSTOM_TEMPLATE = customTemplate(
  'custom',
  'Custom application',
  'A bespoke application with no registered class, configured explicitly by the tenant.',
  2,
);

export const CUSTOM_TEMPLATES: readonly ApplicationTemplate[] = [OTHER_TEMPLATE, CUSTOM_TEMPLATE];
