/**
 * Endpoint templates — desktop and mobile applications.
 *
 * TRACEABILITY: ADR-0021 · INV-2 (slot NAMES only) · R-11.13 (no capability without a bound runner)
 *
 * These are the two targets that are NOT a URL. A desktop application is a binary the Execution
 * Plane launches on a machine with a session; a mobile application is a package installed on a
 * device or emulator. Both need an adapter class a browser-driven target does not (I8/I9), and
 * neither can be driven headlessly the way a web page can.
 *
 * That difference is why they are templates rather than options on the web template: the previous
 * generator emitted a browser-shaped package for them, which is buildable, deployable and unable
 * to start the application it was generated for.
 *
 * BACKWARD COMPATIBILITY: mobile keeps `TEST_BASE_URL`, `APP_PACKAGE` and `DEVICE_UDID`, the three
 * slots the previous generator emitted for it.
 */
import type { ApplicationTemplate, AuthenticationStrategy, VisibilityCondition } from '../application-template.js';
import {
  STANDARD_GROUPS, baseUrlField, usernameField, passwordField, totpSecretField, targetField,
  timeoutField, parallelismField, executionField, signInRules, mfaRules, executionRules, defineTemplate,
} from './shared.js';

/** Mechanisms that sign a real user in to an installed application. */
const USER_SIGN_IN: VisibilityCondition = { path: 'authenticationType', oneOf: ['form', 'basic'] };

const ANONYMOUS: AuthenticationStrategy = {
  id: 'anonymous',
  label: 'Anonymous — the application requires no sign-in',
  credentialModel: 'none',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'none' },
  credentialFields: [],
};

const IN_APP_SIGN_IN = (storageStatePath: string): AuthenticationStrategy => ({
  id: 'form',
  label: 'In-application sign-in with session capture',
  credentialModel: 'user-sign-in',
  captureSession: true,
  storageStateReuse: true,
  mfaSupported: true,
  sessionRefresh: { strategy: 'storage-state-replay', intervalMinutes: 240 },
  credentialFields: ['username', 'password', 'totpSecret'],
  storageStatePath,
});

const WINDOWS_INTEGRATED: AuthenticationStrategy = {
  id: 'windows-integrated',
  label: 'Windows integrated authentication — the application uses the logged-on session',
  credentialModel: 'user-sign-in',
  captureSession: false,
  storageStateReuse: false,
  mfaSupported: false,
  sessionRefresh: { strategy: 'none' },
  credentialFields: ['username', 'password'],
};

// ── Desktop ──────────────────────────────────────────────────────────────────

const DESKTOP_STORAGE_STATE = '.auth/desktop-session.json';

export const DESKTOP_TEMPLATE: ApplicationTemplate = defineTemplate({
  id: 'desktop',
  label: 'Desktop application',
  description: 'A native desktop binary launched and driven by the Execution Plane through a UI-automation adapter.',
  category: 'desktop',
  precedence: 20,
  envPrefix: 'DESKTOP',
  primaryTargetField: 'appPath',
  authentication: ANONYMOUS,
  authenticationVariants: {
    none: ANONYMOUS,
    form: IN_APP_SIGN_IN(DESKTOP_STORAGE_STATE),
    basic: IN_APP_SIGN_IN(DESKTOP_STORAGE_STATE),
    custom: WINDOWS_INTEGRATED,
  },
  discovery: {
    strategy: 'reverse',
    label: 'Launch the application and walk its window and control tree',
    profile: {
      // A desktop binary publishes no route list, so the control tree IS the surface. Depth is
      // bounded because a deep tree walk on a rich client is minutes, not seconds.
      walkControlTree: true,
      maxDepth: 5,
      nonDestructive: true,
      readOnly: true,
      excludeControls: ['<FILL: destructive controls to exclude, e.g. Delete, Post>'],
    },
  },
  execution: {
    strategy: 'authenticated',
    label: 'Launch the binary and drive its controls',
    sessionRefresh: false,
    profile: { relaunchPerSuite: true, captureScreenshotOnFailure: true, captureWindowTree: true },
  },
  runtime: {
    adapterInterfaces: ['I8-desktop-ui'],
    primaryAdapterInterface: 'I8-desktop-ui',
    browserRequired: false,
    // A native UI needs a real (or virtual) desktop session — there is no headless equivalent.
    headlessSupported: false,
    maxParallelSessions: 1,
    supportsUiExecution: true,
    supportsApiExecution: false,
    nonDestructiveByDefault: true,
  },
  configuration: [
    targetField({
      name: 'appPath', label: 'Application path', envSuffix: 'APP_PATH', order: 10, required: true,
      help: 'Absolute path to the executable on the Execution Plane host.',
    }),
    targetField({
      name: 'appArgs', label: 'Launch arguments', envSuffix: 'APP_ARGS', order: 11,
      help: 'Arguments passed on launch, e.g. a configuration profile or an environment switch.',
    }),
    targetField({
      name: 'windowTitle', label: 'Main window title', envSuffix: 'WINDOW_TITLE', order: 12,
      help: 'Title (or title pattern) of the main window, so the adapter attaches to the right one.',
    }),
    usernameField({ visibleWhen: USER_SIGN_IN }),
    passwordField({ visibleWhen: USER_SIGN_IN }),
    totpSecretField({ and: USER_SIGN_IN }),
    timeoutField(45000),
    parallelismField(1),
    executionField({
      name: 'launchTimeoutMs', label: 'Launch timeout (ms)', type: 'number', defaultValue: 60000, order: 54,
      help: 'How long to wait for the main window after launch. Rich clients are slow to start on first run.',
    }),
  ],
  portal: {
    title: 'Desktop application',
    summary: 'Tell the Execution Plane where the binary lives and how to recognise its main window.',
    groups: STANDARD_GROUPS,
  },
  validation: [
    {
      id: 'desktop.appPath.required', field: 'appPath', rule: 'required', scope: 'execution-plane', severity: 'error',
      detail: 'The application path is not set. The Execution Plane has nothing to launch.',
    },
    ...signInRules('desktop', USER_SIGN_IN),
    ...mfaRules('desktop', USER_SIGN_IN),
    ...executionRules('desktop', 1),
    {
      id: 'desktop.launchTimeoutMs.positive', field: 'launchTimeoutMs', rule: 'positive-number', scope: 'both', severity: 'error',
      detail: 'The launch timeout must be a positive number of milliseconds.',
    },
  ],
  documentation: {
    summary: 'A native desktop application launched on the Execution Plane host and driven through the UI-automation adapter.',
    setupSteps: [
      'Install the application on the Execution Plane host and set its path in `.env`.',
      'Set the main window title (or a pattern) so the adapter attaches to the right window.',
      'Provide the host with a real or virtual desktop session — a native UI cannot run headless.',
    ],
    authenticationNotes: [
      'If the application signs a user in, the session is captured and replayed so a suite does not sign in per test.',
      'Windows integrated authentication uses the host\'s logged-on session; the credential slots then describe that account rather than an in-application login.',
    ],
    discoveryNotes: [
      'There is no route list to read, so discovery walks the window and control tree. Depth is bounded — a full walk of a rich client takes minutes.',
      'Controls that perform destructive actions should be excluded by name before the first discovery run.',
    ],
    executionNotes: [
      'The binary is relaunched per suite, so one crashed run does not poison the next.',
      'One session at a time: a second instance of most desktop clients contends for the same user profile.',
    ],
    troubleshooting: [
      { symptom: 'The adapter attaches to the wrong window', resolution: 'Set the main window title pattern; without it the adapter takes the first top-level window it finds.' },
      { symptom: 'Runs fail immediately on a headless host', resolution: 'Desktop targets need a desktop session. Provide a virtual display or run on a host with an interactive session.' },
    ],
  },
  capabilityProfiles: {
    'functional-testing': { adapterInterface: 'I8-desktop-ui', timeoutSeconds: 900, guardrail: { maxConcurrency: 1 }, browsers: [] },
    'inverse-flow-discovery': { adapterInterface: 'I8-desktop-ui', timeoutSeconds: 1800, guardrail: { maxConcurrency: 1, nonDestructive: true } },
  },
});

// ── Mobile ───────────────────────────────────────────────────────────────────

const MOBILE_STORAGE_STATE = '.auth/mobile-session.json';

export const MOBILE_TEMPLATE: ApplicationTemplate = defineTemplate({
  id: 'mobile',
  label: 'Mobile application',
  description: 'A mobile app installed on a device or emulator and driven through the mobile-device adapter.',
  category: 'mobile',
  precedence: 20,
  envPrefix: 'MOBILE',
  // TEST_BASE_URL, not APP_PACKAGE: this is the slot an existing mobile tenant already treats as
  // the target address, and every downstream consumer reads it by that name.
  primaryTargetField: 'baseUrl',
  authentication: ANONYMOUS,
  authenticationVariants: {
    none: ANONYMOUS,
    form: IN_APP_SIGN_IN(MOBILE_STORAGE_STATE),
    basic: IN_APP_SIGN_IN(MOBILE_STORAGE_STATE),
  },
  discovery: {
    strategy: 'reverse',
    fallbackStrategy: 'authenticated',
    label: 'Install the app on the device and walk its screen and element tree',
    profile: {
      walkElementTree: true,
      maxDepth: 5,
      nonDestructive: true,
      readOnly: true,
      resetAppBetweenFlows: true,
      excludeControls: ['<FILL: destructive controls to exclude>'],
    },
  },
  execution: {
    strategy: 'authenticated',
    label: 'Drive the installed app on the bound device or emulator',
    sessionRefresh: false,
    profile: { resetAppBetweenSuites: true, captureScreenshotOnFailure: true, captureDeviceLog: true },
  },
  runtime: {
    adapterInterfaces: ['I9-mobile-device', 'I3-api'],
    primaryAdapterInterface: 'I9-mobile-device',
    browserRequired: false,
    // An emulator can run without a visible display, but never without a device session.
    headlessSupported: false,
    maxParallelSessions: 1,
    supportsUiExecution: true,
    supportsApiExecution: true,
    nonDestructiveByDefault: false,
  },
  configuration: [
    targetField({
      name: 'appPackage', label: 'App / bundle id', envVar: 'APP_PACKAGE', order: 10, required: true,
      help: 'Application package name (Android) or bundle identifier (iOS) of the build under test.',
    }),
    // Kept as TEST_BASE_URL: the slot an existing mobile tenant already filled in.
    baseUrlField({ envVar: 'TEST_BASE_URL', label: 'Backend base URL', order: 11, required: false, help: 'Base URL of the backend the app talks to, when the suite also exercises it.' }),
    targetField({
      name: 'deviceUdid', label: 'Device UDID', envVar: 'DEVICE_UDID', order: 12,
      help: 'Identifier of the device or emulator to bind. Leave blank to take the first available device.',
    }),
    targetField({
      name: 'platform', label: 'Platform', envSuffix: 'PLATFORM', type: 'select', options: ['android', 'ios'], defaultValue: 'android', order: 13,
      help: 'Mobile platform of the build under test.',
    }),
    usernameField({ visibleWhen: USER_SIGN_IN }),
    passwordField({ visibleWhen: USER_SIGN_IN }),
    totpSecretField({ and: USER_SIGN_IN }),
    timeoutField(60000),
    parallelismField(1),
  ],
  portal: {
    title: 'Mobile application',
    summary: 'Tell the Execution Plane which build to install and which device or emulator to bind.',
    groups: STANDARD_GROUPS,
  },
  validation: [
    {
      id: 'mobile.appPackage.required', field: 'appPackage', rule: 'required', scope: 'execution-plane', severity: 'error',
      detail: 'The app package / bundle id is not set. The Execution Plane cannot identify the build to drive.',
    },
    {
      id: 'mobile.platform.one-of', field: 'platform', rule: 'one-of', scope: 'both', severity: 'error',
      options: ['android', 'ios'], detail: 'Platform must be android or ios.',
    },
    // The backend URL is optional for a mobile target, so only its SHAPE is checked.
    {
      id: 'mobile.baseUrl.url', field: 'baseUrl', rule: 'url', scope: 'both', severity: 'error',
      detail: 'The backend base URL must be a valid absolute URL when it is set.',
    },
    ...signInRules('mobile', USER_SIGN_IN),
    ...mfaRules('mobile', USER_SIGN_IN),
    ...executionRules('mobile', 1),
  ],
  documentation: {
    summary: 'A mobile application installed on a device or emulator and driven through the mobile-device adapter.',
    setupSteps: [
      'Set the app package / bundle id of the build under test in `.env`.',
      'Bind a device or emulator by UDID, or leave it blank to take the first available one.',
      'Set the backend base URL if the suite also exercises the API the app talks to.',
    ],
    authenticationNotes: [
      'An in-app sign-in is captured once and replayed, so a suite does not sign in on every screen flow.',
    ],
    discoveryNotes: [
      'Discovery walks the screen and element tree; the app is reset between flows so one flow cannot leave state for the next.',
    ],
    executionNotes: [
      'The app is reset between suites and the device log is captured as evidence.',
      'One device at a time: two suites bound to the same device contend for the foreground.',
    ],
    troubleshooting: [
      { symptom: 'The run binds the wrong device', resolution: 'Set the device UDID explicitly; a blank value takes the first available device.' },
      { symptom: 'Flows fail with stale state', resolution: 'App reset is disabled for this run. Re-enable it, or make the flow independent of prior state.' },
    ],
  },
  capabilityProfiles: {
    'functional-testing': { adapterInterface: 'I9-mobile-device', timeoutSeconds: 900, guardrail: { maxConcurrency: 1 }, browsers: [] },
    'inverse-flow-discovery': { adapterInterface: 'I9-mobile-device', timeoutSeconds: 1800, guardrail: { maxConcurrency: 1, nonDestructive: true } },
  },
});

export const ENDPOINT_TEMPLATES: readonly ApplicationTemplate[] = [DESKTOP_TEMPLATE, MOBILE_TEMPLATE];
