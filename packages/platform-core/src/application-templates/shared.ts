/**
 * Shared building blocks for Application Templates.
 *
 * TRACEABILITY: ADR-0021 · INV-2 (env var NAMES only, never values)
 *
 * These are FIELD and GROUP factories, not behaviour. A template is still a plain data object;
 * these functions only spare every template from restating the same twelve properties for a base
 * URL slot. Nothing here decides anything — the template passes what differs and takes the rest.
 *
 * Keeping them here is what makes "a new application type is one new file" true: an author writes
 * the parts that are genuinely specific to their target and inherits the conventions (ordering,
 * grouping, help-text voice, secret handling) that every other template already follows.
 */
import type {
  ApplicationConfigField, ApplicationValidationRule, PortalFieldGroup, ApplicationTemplate, VisibilityCondition,
} from '../application-template.js';

// ── Portal groups ────────────────────────────────────────────────────────────

export const GROUP_TARGET: PortalFieldGroup = {
  id: 'target', label: 'Application target', order: 1,
  description: 'Where the application under test lives. These values stay in your tenancy.',
};
export const GROUP_AUTHENTICATION: PortalFieldGroup = {
  id: 'authentication', label: 'Authentication', order: 2,
  description: 'How the Execution Plane proves identity to the target. Every value is set at your Execution Plane and never reaches DBiz (INV-2).',
};
export const GROUP_EXECUTION: PortalFieldGroup = {
  id: 'execution', label: 'Execution', order: 3,
  description: 'How the Execution Plane drives the target when a capability runs.',
};

/** The three groups every template uses unless it needs a bespoke section. */
export const STANDARD_GROUPS: readonly PortalFieldGroup[] = [GROUP_TARGET, GROUP_AUTHENTICATION, GROUP_EXECUTION];

// ── Target fields ────────────────────────────────────────────────────────────

/** The target's base URL. `envVar` overrides the prefixed name for backward-compatible slots. */
export function baseUrlField(options: { label?: string; envSuffix?: string; envVar?: string; help?: string; order?: number; required?: boolean } = {}): ApplicationConfigField {
  return {
    name: 'baseUrl',
    label: options.label ?? 'Base URL',
    type: 'url',
    storage: 'env',
    ...(options.envVar ? { envVar: options.envVar } : { envSuffix: options.envSuffix ?? 'BASE_URL' }),
    required: options.required ?? true,
    secret: false,
    group: GROUP_TARGET.id,
    order: options.order ?? 10,
    help: options.help ?? 'Base URL of the test instance the Execution Plane drives.',
  };
}

/** A plain non-secret target field (tenant id, client/mandant, package name, …). */
export function targetField(field: {
  name: string; label: string; envSuffix?: string; envVar?: string; help: string;
  required?: boolean; order?: number; type?: ApplicationConfigField['type']; options?: readonly string[];
  defaultValue?: string | number | boolean; visibleWhen?: VisibilityCondition;
}): ApplicationConfigField {
  return {
    name: field.name,
    label: field.label,
    type: field.type ?? 'text',
    storage: 'env',
    ...(field.envVar ? { envVar: field.envVar } : { envSuffix: field.envSuffix ?? toEnvSuffix(field.name) }),
    required: field.required ?? false,
    secret: false,
    group: GROUP_TARGET.id,
    order: field.order ?? 20,
    help: field.help,
    ...(field.options ? { options: field.options } : {}),
    ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
    ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
  };
}

// ── Authentication fields ────────────────────────────────────────────────────

/** A sign-in user name. Marked secret: it identifies a real automation account. */
export function usernameField(options: { label?: string; envSuffix?: string; order?: number; help?: string; visibleWhen?: VisibilityCondition } = {}): ApplicationConfigField {
  return {
    name: 'username',
    label: options.label ?? 'Sign-in user',
    type: 'text',
    storage: 'env',
    envSuffix: options.envSuffix ?? 'USERNAME',
    required: true,
    secret: true,
    group: GROUP_AUTHENTICATION.id,
    order: options.order ?? 30,
    help: options.help ?? 'The automation account the Execution Plane signs in as.',
    ...(options.visibleWhen ? { visibleWhen: options.visibleWhen } : {}),
  };
}

/** A sign-in password slot. Name only — the value lives in the customer `.env` (INV-2). */
export function passwordField(options: { label?: string; envSuffix?: string; order?: number; help?: string; visibleWhen?: VisibilityCondition } = {}): ApplicationConfigField {
  return {
    name: 'password',
    label: options.label ?? 'Sign-in password',
    type: 'password',
    storage: 'env',
    envSuffix: options.envSuffix ?? 'PASSWORD',
    required: true,
    secret: true,
    group: GROUP_AUTHENTICATION.id,
    order: options.order ?? 31,
    help: options.help ?? 'Password for the automation account. Set it at the Execution Plane; DBiz never receives it.',
    ...(options.visibleWhen ? { visibleWhen: options.visibleWhen } : {}),
  };
}

/**
 * The second-factor enrolment secret.
 *
 * Emitted ONLY when the tenant declared that the target enforces MFA — the `visibleWhen`
 * condition is what makes that conditional rather than a branch in the generator. TOTP is the
 * only method an Execution Plane can present unattended, which is why the slot is a TOTP secret.
 */
export function totpSecretField(options: { envSuffix?: string; order?: number; and?: VisibilityCondition } = {}): ApplicationConfigField {
  return {
    name: 'totpSecret',
    label: 'TOTP enrolment secret',
    type: 'secret',
    storage: 'env',
    envSuffix: options.envSuffix ?? 'TOTP_SECRET',
    required: true,
    secret: true,
    group: GROUP_AUTHENTICATION.id,
    order: options.order ?? 32,
    help: 'Enrolment secret of the automation account, so the Execution Plane can derive the second factor unattended.',
    visibleWhen: { path: 'mfa.required', equals: true, ...(options.and ? { and: options.and } : {}) },
  };
}

/** A machine credential slot (API key, client secret, certificate passphrase). */
export function secretField(field: { name: string; label: string; envSuffix?: string; envVar?: string; help: string; required?: boolean; order?: number; visibleWhen?: VisibilityCondition }): ApplicationConfigField {
  return {
    name: field.name,
    label: field.label,
    type: 'secret',
    storage: 'env',
    ...(field.envVar ? { envVar: field.envVar } : { envSuffix: field.envSuffix ?? toEnvSuffix(field.name) }),
    required: field.required ?? false,
    secret: true,
    group: GROUP_AUTHENTICATION.id,
    order: field.order ?? 40,
    help: field.help,
    ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
  };
}

/** A non-secret authentication setting (client id, token endpoint, scopes, realm). */
export function authField(field: {
  name: string; label: string; envSuffix?: string; envVar?: string; help: string;
  required?: boolean; order?: number; type?: ApplicationConfigField['type']; options?: readonly string[];
  defaultValue?: string | number | boolean; visibleWhen?: VisibilityCondition;
}): ApplicationConfigField {
  return {
    name: field.name,
    label: field.label,
    type: field.type ?? 'text',
    storage: 'env',
    ...(field.envVar ? { envVar: field.envVar } : { envSuffix: field.envSuffix ?? toEnvSuffix(field.name) }),
    required: field.required ?? false,
    secret: false,
    group: GROUP_AUTHENTICATION.id,
    order: field.order ?? 35,
    help: field.help,
    ...(field.options ? { options: field.options } : {}),
    ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
    ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
  };
}

// ── Execution (operational) fields ───────────────────────────────────────────

/**
 * An operational setting written into the package with its default and editable in the EP portal.
 * Never a secret (the contract enforces that at registration).
 */
export function executionField(field: {
  name: string; label: string; help: string; type: ApplicationConfigField['type'];
  defaultValue: string | number | boolean; options?: readonly string[]; order?: number;
}): ApplicationConfigField {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    storage: 'config',
    required: true,
    secret: false,
    group: GROUP_EXECUTION.id,
    order: field.order ?? 50,
    help: field.help,
    defaultValue: field.defaultValue,
    ...(field.options ? { options: field.options } : {}),
  };
}

/** Browser choice — for every target the Execution Plane drives through a browser. */
export function browserField(defaultBrowser = 'chromium', order = 50): ApplicationConfigField {
  return executionField({
    name: 'browser', label: 'Browser', type: 'select', defaultValue: defaultBrowser, order,
    options: ['chromium', 'firefox', 'webkit'],
    help: 'Browser engine the Execution Plane drives the target with.',
  });
}

/** Per-action timeout, in milliseconds. */
export function timeoutField(defaultMs: number, order = 51): ApplicationConfigField {
  return executionField({
    name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', defaultValue: defaultMs, order,
    help: 'Per-action timeout. Enterprise SaaS targets need a longer value than a static web app.',
  });
}

/** How many capability workers may run concurrently against the target. */
export function parallelismField(defaultWorkers: number, order = 52): ApplicationConfigField {
  return executionField({
    name: 'parallel', label: 'Parallel workers', type: 'number', defaultValue: defaultWorkers, order,
    help: 'Concurrent workers. Bounded by how many simultaneous sessions the target tolerates.',
  });
}

// ── Validation rule factories ────────────────────────────────────────────────

/** The base URL must be present and a real URL. Present-ness is an EP-side fact (INV-2). */
export function baseUrlRules(templateId: string, options: { requireHttps?: boolean } = {}): readonly ApplicationValidationRule[] {
  return [
    {
      id: `${templateId}.baseUrl.required`, field: 'baseUrl', rule: 'required', scope: 'execution-plane', severity: 'error',
      detail: 'The target base URL is not set. The Execution Plane cannot address the application under test.',
    },
    {
      id: `${templateId}.baseUrl.url`, field: 'baseUrl', rule: options.requireHttps ? 'https-url' : 'url', scope: 'both', severity: 'error',
      detail: options.requireHttps
        ? 'The target base URL must be an https:// URL — credentials are presented over this connection.'
        : 'The target base URL must be a valid absolute URL.',
    },
  ];
}

/** Sign-in credential rules: both slots must be filled, and only at the Execution Plane. */
export function signInRules(templateId: string, appliesWhen?: VisibilityCondition): readonly ApplicationValidationRule[] {
  const when = appliesWhen ? { appliesWhen } : {};
  return [
    {
      id: `${templateId}.username.required`, field: 'username', rule: 'required', scope: 'execution-plane', severity: 'error', ...when,
      detail: 'The sign-in user is not set. Authenticated discovery and execution cannot start.',
    },
    {
      id: `${templateId}.password.required`, field: 'password', rule: 'required', scope: 'execution-plane', severity: 'error', ...when,
      detail: 'The sign-in password is not set. Authenticated discovery and execution cannot start.',
    },
  ];
}

/**
 * The MFA rule. It fires only when the tenant DECLARED that the target enforces a second factor —
 * an Execution Plane that is challenged with no TOTP secret hangs at the sign-in page, and this is
 * the check that turns that into a refusal at start-up instead.
 */
export function mfaRules(templateId: string, and?: VisibilityCondition): readonly ApplicationValidationRule[] {
  return [
    {
      id: `${templateId}.totpSecret.required`, field: 'totpSecret', rule: 'required', scope: 'execution-plane', severity: 'error',
      appliesWhen: { path: 'mfa.required', equals: true, ...(and ? { and } : {}) },
      detail: 'This target enforces MFA but no TOTP enrolment secret is set — unattended sign-in will stall at the second factor.',
    },
  ];
}

/** Operational bounds shared by every template that declares the standard execution fields. */
export function executionRules(templateId: string, maxParallel: number): readonly ApplicationValidationRule[] {
  return [
    {
      id: `${templateId}.timeoutMs.positive`, field: 'timeoutMs', rule: 'positive-number', scope: 'both', severity: 'error',
      detail: 'The per-action timeout must be a positive number of milliseconds.',
    },
    {
      id: `${templateId}.parallel.positive`, field: 'parallel', rule: 'positive-number', scope: 'both', severity: 'error',
      detail: `Parallel workers must be a positive number, and no more than ${maxParallel} for this target.`,
    },
  ];
}

// ── Misc ─────────────────────────────────────────────────────────────────────

/** `clientSecret` → `CLIENT_SECRET`. The default env suffix for a field with no explicit one. */
export function toEnvSuffix(fieldName: string): string {
  return fieldName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

/** Convenience for template modules: the object literal, typed, with no widening. */
export function defineTemplate(template: ApplicationTemplate): ApplicationTemplate { return template; }
