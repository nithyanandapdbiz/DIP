/**
 * Web application templates — generic web, React and Angular.
 *
 * TRACEABILITY: ADR-0021 · INV-2 (slot NAMES only)
 *
 * A web application is not one authentication story, so the template declares VARIANTS keyed by
 * the mechanism the tenant declared (or discovery observed): anonymous by default, form/basic
 * sign-in with a user, or a token-bearing mode (OAuth/SAML/custom) with one application secret.
 * That is why there is one web template family rather than one template per mechanism.
 *
 * React and Angular are the SAME target with a different declared stack: they differ only in
 * label, description and discovery hint (SPA route discovery needs to wait for hydration). They
 * are built from one factory so a fix to web behaviour cannot reach two of the three and miss one.
 *
 * BACKWARD COMPATIBILITY: every slot keeps the env var name the previous generator emitted —
 * `TEST_BASE_URL` for the target and `APP_AUTH_SECRET` for the application secret. An existing
 * tenant regenerating its package sees the same `.env` keys it already filled in.
 */
import type { ApplicationTemplate, AuthenticationStrategy, VisibilityCondition } from '../application-template.js';
import {
  STANDARD_GROUPS, baseUrlField, usernameField, passwordField, totpSecretField, secretField,
  browserField, timeoutField, parallelismField, baseUrlRules, signInRules, mfaRules, executionRules, defineTemplate,
} from './shared.js';

/** Mechanisms that sign a real user in — the only ones that need a username/password pair. */
const USER_SIGN_IN: VisibilityCondition = { path: 'authenticationType', oneOf: ['form', 'basic'] };
/** Mechanisms that present a single application-held token or assertion. */
const TOKEN_BEARING: VisibilityCondition = { path: 'authenticationType', oneOf: ['oauth', 'saml', 'custom'] };

const ANONYMOUS: AuthenticationStrategy = {
  id: 'anonymous',
  label: 'Anonymous — the application under test requires no sign-in',
  credentialModel: 'none',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'none' },
  credentialFields: [],
};

/** A user sign-in variant. Form and basic differ only in how the credential is presented. */
const userSignIn = (id: 'form' | 'basic', label: string): AuthenticationStrategy => ({
  id,
  label,
  credentialModel: 'user-sign-in',
  captureSession: true,
  storageStateReuse: true,
  mfaSupported: true,
  sessionRefresh: { strategy: 'reauthenticate', intervalMinutes: 240 },
  credentialFields: ['username', 'password', 'totpSecret'],
  storageStatePath: '.auth/web-session.json',
});

/** A token-bearing variant. One application secret, no interactive sign-in, no second factor. */
const tokenBearing = (id: 'oauth2-authorization-code' | 'saml' | 'api-key', label: string): AuthenticationStrategy => ({
  id,
  label,
  credentialModel: 'service-credential',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'refresh-token', intervalMinutes: 50 },
  credentialFields: ['authSecret'],
});

interface WebVariant {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly precedence: number;
  /** Extra discovery hints for a client-rendered application. */
  readonly clientRendered: boolean;
}

function webTemplate(v: WebVariant): ApplicationTemplate {
  return defineTemplate({
    id: v.id,
    label: v.label,
    description: v.description,
    category: 'web',
    precedence: v.precedence,
    // Kept as TEST_* so an existing tenant's filled-in `.env` keeps working after regeneration.
    envPrefix: 'TEST',
    primaryTargetField: 'baseUrl',
    authentication: ANONYMOUS,
    authenticationVariants: {
      none: ANONYMOUS,
      form: userSignIn('form', 'Form sign-in — the Execution Plane submits the application login form'),
      basic: userSignIn('basic', 'HTTP basic authentication'),
      oauth: tokenBearing('oauth2-authorization-code', 'OAuth 2.0 — the Execution Plane presents an application-held token'),
      saml: tokenBearing('saml', 'SAML — the Execution Plane presents an application-held assertion'),
      custom: tokenBearing('api-key', 'Custom scheme — one application-held secret'),
    },
    discovery: {
      strategy: 'anonymous',
      fallbackStrategy: 'authenticated',
      label: v.clientRendered
        ? 'Crawl the rendered application, waiting for client-side routing to settle'
        : 'Crawl the served application from its base URL',
      profile: {
        maxDepth: 3,
        requestsPerSecond: 2,
        nonDestructive: true,
        // A client-rendered app has no server-rendered link graph, so the crawler has to settle on
        // network idle before reading routes; a server-rendered one does not and should not wait.
        waitForNetworkIdle: v.clientRendered,
        respectRobotsTxt: true,
        excludePaths: ['<FILL: destructive paths to exclude>'],
      },
    },
    execution: {
      strategy: 'anonymous',
      label: 'Drive the application through a browser; sign in first when a mechanism is declared',
      sessionRefresh: false,
      profile: { reuseContext: true, captureTrace: true, captureScreenshotOnFailure: true },
    },
    runtime: {
      adapterInterfaces: ['I2-browser', 'I3-api'],
      primaryAdapterInterface: 'I2-browser',
      browserRequired: true,
      headlessSupported: true,
      maxParallelSessions: 4,
      supportsUiExecution: true,
      supportsApiExecution: true,
      nonDestructiveByDefault: false,
    },
    configuration: [
      baseUrlField({ help: `Base URL of the ${v.label.toLowerCase()} test instance.` }),
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
      parallelismField(4),
    ],
    portal: {
      title: v.label,
      summary: 'Point the Execution Plane at your web application. Only the sign-in mechanism you declared asks for credentials.',
      groups: STANDARD_GROUPS,
    },
    validation: [
      ...baseUrlRules(v.id),
      ...signInRules(v.id, USER_SIGN_IN),
      ...mfaRules(v.id, USER_SIGN_IN),
      {
        id: `${v.id}.authSecret.required`, field: 'authSecret', rule: 'required', scope: 'execution-plane', severity: 'error',
        appliesWhen: TOKEN_BEARING,
        detail: 'The declared authentication mechanism needs an application secret, and none is set.',
      },
      ...executionRules(v.id, 4),
      {
        id: `${v.id}.browser.one-of`, field: 'browser', rule: 'one-of', scope: 'both', severity: 'error',
        options: ['chromium', 'firefox', 'webkit'],
        detail: 'Browser must be one of chromium, firefox or webkit.',
      },
    ],
    documentation: {
      summary: `${v.label} driven through a browser from the Execution Plane. Discovery crawls the application; execution replays flows against it.`,
      setupSteps: [
        'Set the target base URL in `.env`.',
        'If the application requires sign-in, set the credential slots for the mechanism you declared.',
        'Confirm the Execution Plane can reach the target — it dials out only; nothing dials in.',
      ],
      authenticationNotes: [
        'The authentication mechanism you declared at onboarding selects which credential slots the package carries.',
        'Anonymous targets carry none — an unauthenticated application generates no credential slot at all.',
        'A form or basic sign-in captures the session once and replays it, so a long suite signs in once rather than per test.',
      ],
      discoveryNotes: [
        'Discovery is non-destructive and rate-limited by default; excluded paths are honoured before any request.',
        ...(v.clientRendered ? ['Client-side routing is waited out before routes are read, so hydrated views are not missed.'] : []),
      ],
      executionNotes: [
        'Execution reuses one browser context per worker and captures a trace plus a screenshot on failure.',
        'Parallelism is bounded by how many simultaneous sessions your application tolerates.',
      ],
      troubleshooting: [
        { symptom: 'Every flow lands on the login page', resolution: 'The declared authentication mechanism does not match the application. Re-run onboarding with the correct mechanism so the right credential slots are generated.' },
        { symptom: 'Discovery finds only the landing page', resolution: 'The application renders its routes on the client. Confirm the declared application type is the client-rendered one, and raise the discovery depth.' },
      ],
    },
    capabilityProfiles: {
      'functional-testing': { browsers: ['chromium'] },
      'inverse-flow-discovery': { maxDepth: 3 },
    },
  });
}

export const WEB_TEMPLATE = webTemplate({
  id: 'web',
  label: 'Generic web application',
  description: 'Any browser-driven web application, server- or client-rendered.',
  precedence: 10,
  clientRendered: false,
});

export const REACT_TEMPLATE = webTemplate({
  id: 'react',
  label: 'React web application',
  description: 'A React single-page application driven through a browser.',
  precedence: 12,
  clientRendered: true,
});

export const ANGULAR_TEMPLATE = webTemplate({
  id: 'angular',
  label: 'Angular web application',
  description: 'An Angular single-page application driven through a browser.',
  precedence: 12,
  clientRendered: true,
});

export const WEB_TEMPLATES: readonly ApplicationTemplate[] = [WEB_TEMPLATE, REACT_TEMPLATE, ANGULAR_TEMPLATE];
