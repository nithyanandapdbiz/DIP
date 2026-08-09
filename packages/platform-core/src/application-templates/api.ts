/**
 * Service-interface templates — REST, GraphQL and SOAP.
 *
 * TRACEABILITY: ADR-0021 · INV-2 (slot NAMES only) · R-14.14 (capability-named interfaces)
 *
 * These targets have no browser and no user session: they are driven through the I3-api adapter,
 * discovered from their own contract (an OpenAPI document, a GraphQL introspection response, a
 * WSDL), and executed against with a machine credential. Modelling them as web applications with
 * the browser switched off is what produced the generic package this registry replaces — they get
 * their own templates so their discovery and execution strategies can be honest.
 *
 * BACKWARD COMPATIBILITY: `web-api` keeps `TEST_BASE_URL` and `API_TOKEN`, the two slots the
 * previous generator emitted for it.
 */
import type { ApplicationTemplate, AuthenticationStrategy, VisibilityCondition } from '../application-template.js';
import {
  STANDARD_GROUPS, baseUrlField, usernameField, passwordField, secretField, authField,
  timeoutField, parallelismField, executionField, baseUrlRules, signInRules, executionRules, defineTemplate,
} from './shared.js';

const OAUTH_DECLARED: VisibilityCondition = { path: 'authenticationType', equals: 'oauth' };
const BASIC_DECLARED: VisibilityCondition = { path: 'authenticationType', equals: 'basic' };

const API_KEY_AUTH: AuthenticationStrategy = {
  id: 'api-key',
  label: 'API key / bearer token presented on every request',
  credentialModel: 'service-credential',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'none' },
  credentialFields: ['apiToken'],
};

const CLIENT_CREDENTIALS_AUTH: AuthenticationStrategy = {
  id: 'oauth2-client-credentials',
  label: 'OAuth 2.0 client credentials — a token is minted per run and refreshed before expiry',
  credentialModel: 'service-credential',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'refresh-token', intervalMinutes: 50 },
  credentialFields: ['clientId', 'clientSecret'],
};

const BASIC_AUTH: AuthenticationStrategy = {
  id: 'basic',
  label: 'HTTP basic authentication',
  credentialModel: 'user-sign-in',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'none' },
  credentialFields: ['username', 'password'],
};

const ANONYMOUS_AUTH: AuthenticationStrategy = {
  id: 'anonymous',
  label: 'Anonymous — the service requires no credential',
  credentialModel: 'none',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'none' },
  credentialFields: [],
};

/** The credential slots every service template shares, whichever mechanism is declared. */
const CREDENTIAL_FIELDS = [
  secretField({
    name: 'apiToken', label: 'API token', envVar: 'API_TOKEN', order: 40,
    help: 'Bearer token or API key presented on every request. Set at the Execution Plane; DBiz never receives it.',
  }),
  authField({
    name: 'clientId', label: 'OAuth client id', envVar: 'API_CLIENT_ID', order: 41, visibleWhen: OAUTH_DECLARED,
    help: 'Client id of the machine identity the Execution Plane authenticates as.',
  }),
  secretField({
    name: 'clientSecret', label: 'OAuth client secret', envVar: 'API_CLIENT_SECRET', order: 42, required: true, visibleWhen: OAUTH_DECLARED,
    help: 'Client secret for the machine identity. Set at the Execution Plane.',
  }),
  authField({
    name: 'tokenUrl', label: 'Token endpoint', type: 'url', envVar: 'API_TOKEN_URL', order: 43, visibleWhen: OAUTH_DECLARED,
    help: 'OAuth token endpoint the Execution Plane mints its access token from.',
  }),
  authField({
    name: 'scopes', label: 'Scopes', envVar: 'API_SCOPES', order: 44, visibleWhen: OAUTH_DECLARED,
    help: 'Space-separated scopes requested for the access token. Request the least the suite needs.',
  }),
  usernameField({ order: 45, visibleWhen: BASIC_DECLARED }),
  passwordField({ order: 46, visibleWhen: BASIC_DECLARED }),
] as const;

const SHARED_VARIANTS = {
  none: ANONYMOUS_AUTH,
  oauth: CLIENT_CREDENTIALS_AUTH,
  basic: BASIC_AUTH,
  custom: API_KEY_AUTH,
} as const;

/** Rules shared by every service template. `templateId` scopes the rule ids. */
const credentialRules = (id: string): ApplicationTemplate['validation'] => [
  {
    id: `${id}.clientSecret.required`, field: 'clientSecret', rule: 'required', scope: 'execution-plane', severity: 'error',
    appliesWhen: OAUTH_DECLARED, detail: 'OAuth client credentials are declared but no client secret is set.',
  },
  {
    id: `${id}.tokenUrl.https`, field: 'tokenUrl', rule: 'https-url', scope: 'both', severity: 'error',
    appliesWhen: OAUTH_DECLARED, detail: 'The OAuth token endpoint must be an https:// URL — a client secret is presented to it.',
  },
  ...signInRules(id, BASIC_DECLARED),
];

const requestRateField = executionField({
  name: 'requestsPerSecond', label: 'Request rate (per second)', type: 'number', defaultValue: 10, order: 53,
  help: 'Upper bound on requests per second. Keeps a suite inside the service rate limit rather than discovering it the hard way.',
});

// ── REST ─────────────────────────────────────────────────────────────────────

export const REST_API_TEMPLATE: ApplicationTemplate = defineTemplate({
  id: 'web-api',
  label: 'REST API',
  description: 'An HTTP/JSON service driven through the API adapter, discovered from its OpenAPI document.',
  category: 'api',
  precedence: 15,
  envPrefix: 'API',
  primaryTargetField: 'baseUrl',
  authentication: API_KEY_AUTH,
  authenticationVariants: SHARED_VARIANTS,
  discovery: {
    strategy: 'api',
    fallbackStrategy: 'reverse',
    label: 'Read the OpenAPI document; fall back to probing observed traffic when none is published',
    profile: {
      contractPath: '<FILL: path to the OpenAPI/Swagger document, e.g. /openapi.json>',
      nonDestructive: true,
      safeMethods: ['GET', 'HEAD', 'OPTIONS'],
      requestsPerSecond: 5,
      followPagination: true,
    },
  },
  execution: {
    strategy: 'api',
    label: 'Issue requests directly against the service with the declared credential',
    sessionRefresh: true,
    profile: { retryOn: [429, 502, 503, 504], maxRetries: 2, captureRequestResponse: true },
  },
  runtime: {
    adapterInterfaces: ['I3-api'],
    primaryAdapterInterface: 'I3-api',
    browserRequired: false,
    headlessSupported: true,
    maxParallelSessions: 8,
    supportsUiExecution: false,
    supportsApiExecution: true,
    nonDestructiveByDefault: false,
  },
  configuration: [
    // TEST_BASE_URL, not API_BASE_URL: the slot an existing web-api tenant already filled in.
    baseUrlField({ envVar: 'TEST_BASE_URL', label: 'Service base URL', help: 'Base URL of the API under test.' }),
    ...CREDENTIAL_FIELDS,
    timeoutField(15000),
    parallelismField(8),
    requestRateField,
  ],
  portal: {
    title: 'REST API',
    summary: 'Point the Execution Plane at your service and give it the credential the service expects.',
    groups: STANDARD_GROUPS,
  },
  validation: [
    ...baseUrlRules('web-api'),
    ...credentialRules('web-api'),
    ...executionRules('web-api', 8),
    {
      id: 'web-api.requestsPerSecond.positive', field: 'requestsPerSecond', rule: 'positive-number', scope: 'both', severity: 'error',
      detail: 'The request-rate ceiling must be a positive number.',
    },
  ],
  documentation: {
    summary: 'A REST service driven through the API adapter. No browser is started; discovery reads the published contract.',
    setupSteps: [
      'Set the service base URL in `.env`.',
      'Set the credential slots for the mechanism you declared (token, OAuth client credentials, or basic).',
      'Point `discovery.contractPath` at your OpenAPI document so discovery reads the contract rather than probing.',
    ],
    authenticationNotes: [
      'OAuth client credentials are minted per run and refreshed before expiry, so a long suite does not fail mid-way on an expired token.',
      'Scopes are requested explicitly — grant the least the suite needs.',
    ],
    discoveryNotes: [
      'Discovery reads the OpenAPI document. With no document published it falls back to probing observed traffic, which is slower and less complete.',
      'Only safe methods are issued during discovery; nothing is written.',
    ],
    executionNotes: [
      'Requests are retried on 429 and 5xx with a bounded retry count, and the request/response pair is captured as evidence.',
      'The request-rate ceiling keeps a suite inside your service rate limit.',
    ],
    troubleshooting: [
      { symptom: 'Discovery returns no operations', resolution: 'No OpenAPI document was found at `contractPath`. Set it to the served path of your document.' },
      { symptom: 'Runs fail part-way with 401', resolution: 'A static token expired mid-run. Declare OAuth client credentials so the token is refreshed automatically.' },
    ],
  },
  capabilityProfiles: {
    'functional-testing': { adapterInterface: 'I3-api', browsers: [] },
    'inverse-flow-discovery': { adapterInterface: 'I3-api', maxDepth: 1 },
    performance: { adapterInterface: 'I3-api' },
  },
});

// ── GraphQL ──────────────────────────────────────────────────────────────────

export const GRAPHQL_TEMPLATE: ApplicationTemplate = defineTemplate({
  id: 'graphql',
  label: 'GraphQL API',
  description: 'A GraphQL endpoint discovered by schema introspection and driven through the API adapter.',
  category: 'api',
  precedence: 15,
  envPrefix: 'GRAPHQL',
  primaryTargetField: 'baseUrl',
  authentication: API_KEY_AUTH,
  authenticationVariants: SHARED_VARIANTS,
  discovery: {
    strategy: 'metadata',
    fallbackStrategy: 'api',
    label: 'Introspect the schema; fall back to a declared operation set when introspection is disabled',
    profile: {
      introspection: true,
      // Production GraphQL endpoints commonly disable introspection. Saying so here is what lets
      // the Execution Plane report "introspection refused" rather than "no schema found".
      operationsPath: '<FILL: path to a .graphql operations document, used when introspection is disabled>',
      nonDestructive: true,
      queriesOnly: true,
      maxQueryDepth: 6,
    },
  },
  execution: {
    strategy: 'api',
    label: 'Execute named operations against the endpoint with the declared credential',
    sessionRefresh: true,
    profile: { retryOn: [429, 502, 503, 504], maxRetries: 2, captureRequestResponse: true, failOnPartialErrors: true },
  },
  runtime: {
    adapterInterfaces: ['I3-api'],
    primaryAdapterInterface: 'I3-api',
    browserRequired: false,
    headlessSupported: true,
    maxParallelSessions: 8,
    supportsUiExecution: false,
    supportsApiExecution: true,
    nonDestructiveByDefault: false,
  },
  configuration: [
    baseUrlField({ envSuffix: 'ENDPOINT', label: 'GraphQL endpoint', help: 'Absolute URL of the GraphQL endpoint (usually /graphql).' }),
    ...CREDENTIAL_FIELDS,
    timeoutField(20000),
    parallelismField(6),
    requestRateField,
  ],
  portal: {
    title: 'GraphQL API',
    summary: 'Point the Execution Plane at your GraphQL endpoint. The schema is read by introspection where it is enabled.',
    groups: STANDARD_GROUPS,
  },
  validation: [
    ...baseUrlRules('graphql'),
    ...credentialRules('graphql'),
    ...executionRules('graphql', 6),
  ],
  documentation: {
    summary: 'A GraphQL endpoint driven through the API adapter. The schema is the discovery surface.',
    setupSteps: [
      'Set the GraphQL endpoint URL in `.env`.',
      'Set the credential slots for the mechanism you declared.',
      'If introspection is disabled in this environment, publish an operations document and point `discovery.operationsPath` at it.',
    ],
    authenticationNotes: [
      'The credential is presented as a request header on every operation; GraphQL has no session of its own.',
    ],
    discoveryNotes: [
      'Introspection is the primary strategy. Where it is disabled, discovery reads the declared operations document instead — it does not guess at the schema.',
      'Only queries are issued during discovery; mutations are never executed.',
    ],
    executionNotes: [
      'A response carrying partial `errors` fails the step: a 200 with errors is a failure, not a pass.',
    ],
    troubleshooting: [
      { symptom: 'Discovery reports no schema', resolution: 'Introspection is disabled on this endpoint. Provide an operations document and set `discovery.operationsPath`.' },
      { symptom: 'Every operation returns 400', resolution: 'The endpoint expects the credential in a header this template has not been told about — record it in the operations document.' },
    ],
  },
  capabilityProfiles: {
    'functional-testing': { adapterInterface: 'I3-api', browsers: [] },
    'inverse-flow-discovery': { adapterInterface: 'I3-api', maxDepth: 1 },
    performance: { adapterInterface: 'I3-api' },
  },
});

// ── SOAP ─────────────────────────────────────────────────────────────────────

export const SOAP_TEMPLATE: ApplicationTemplate = defineTemplate({
  id: 'soap',
  label: 'SOAP service',
  description: 'A SOAP/WSDL service discovered from its contract and driven through the API adapter.',
  category: 'api',
  precedence: 15,
  envPrefix: 'SOAP',
  primaryTargetField: 'baseUrl',
  authentication: BASIC_AUTH,
  authenticationVariants: { ...SHARED_VARIANTS, none: ANONYMOUS_AUTH },
  discovery: {
    strategy: 'metadata',
    label: 'Parse the WSDL to enumerate ports, operations and message shapes',
    profile: { wsdlPath: '<FILL: WSDL path or ?wsdl query, if not the base URL itself>', nonDestructive: true, soapVersion: '1.1' },
  },
  execution: {
    strategy: 'api',
    label: 'Issue SOAP envelopes against the declared port',
    sessionRefresh: false,
    profile: { retryOn: [500, 502, 503], maxRetries: 1, captureRequestResponse: true, soapAction: true },
  },
  runtime: {
    adapterInterfaces: ['I3-api'],
    primaryAdapterInterface: 'I3-api',
    browserRequired: false,
    headlessSupported: true,
    maxParallelSessions: 4,
    supportsUiExecution: false,
    supportsApiExecution: true,
    nonDestructiveByDefault: true,
  },
  configuration: [
    baseUrlField({ envSuffix: 'WSDL_URL', label: 'WSDL URL', help: 'URL of the WSDL contract for the service under test.' }),
    ...CREDENTIAL_FIELDS,
    timeoutField(30000),
    parallelismField(4),
  ],
  portal: {
    title: 'SOAP service',
    summary: 'Point the Execution Plane at your WSDL. Operations and message shapes are read from the contract.',
    groups: STANDARD_GROUPS,
  },
  validation: [
    ...baseUrlRules('soap'),
    ...credentialRules('soap'),
    ...executionRules('soap', 4),
  ],
  documentation: {
    summary: 'A SOAP service driven through the API adapter. The WSDL is the contract and the discovery surface.',
    setupSteps: [
      'Set the WSDL URL in `.env`.',
      'Set the credential slots for the mechanism you declared — SOAP services most often use basic authentication.',
    ],
    authenticationNotes: [
      'Basic authentication is the default for SOAP endpoints; declare OAuth only if the service actually fronts one.',
    ],
    discoveryNotes: [
      'Discovery parses the WSDL and enumerates ports, operations and message shapes. Nothing is invoked during discovery.',
    ],
    executionNotes: [
      'SOAPAction headers are sent per operation, and the full envelope pair is captured as evidence.',
      'Writes are guardrailed by default for this target class — scope them explicitly before enabling them.',
    ],
    troubleshooting: [
      { symptom: 'The WSDL cannot be parsed', resolution: 'The URL serves an HTML error page rather than the contract. Set `discovery.wsdlPath` to the `?wsdl` form of the endpoint.' },
      { symptom: 'Operations fail with a SOAP fault about the version', resolution: 'The service speaks SOAP 1.2. Set `discovery.soapVersion` accordingly.' },
    ],
  },
  capabilityProfiles: {
    'functional-testing': { adapterInterface: 'I3-api', browsers: [] },
    'inverse-flow-discovery': { adapterInterface: 'I3-api', maxDepth: 1 },
  },
});

export const API_TEMPLATES: readonly ApplicationTemplate[] = [REST_API_TEMPLATE, GRAPHQL_TEMPLATE, SOAP_TEMPLATE];
