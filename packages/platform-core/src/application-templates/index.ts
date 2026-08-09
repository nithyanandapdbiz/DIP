/**
 * The Application Template Registry — the platform's registered application classes.
 *
 * TRACEABILITY: ADR-0021 · ADR-0030 (one generator) · C-03.17 (unsupported combination fails at onboarding)
 *
 * THIS FILE IS THE EXTENSION POINT, AND THE ONLY ONE.
 *
 * Supporting a new application class is: author a template module beside the others, import it
 * here, and add it to `REGISTERED_TEMPLATES`. Nothing in the generator, the portal, the discovery
 * engine, the runtime profile, the validator or the documentation writer is touched — every one of
 * them reads the template, not the id. If a change to the generator is ever needed to add a target,
 * the generator has grown application knowledge it should not have, and that is the defect.
 *
 * The onboarding schema's `applicationTypes` enum is DERIVED from this registry, so a registered
 * template is selectable at onboarding the moment it is registered, and an unregistered id cannot
 * be stored in a tenant configuration at all.
 */
import { ApplicationTemplateRegistry, type ApplicationTemplate, type ApplicationContext } from '../application-template.js';
import { WEB_TEMPLATES } from './web.js';
import { API_TEMPLATES } from './api.js';
import { DYNAMICS_TEMPLATES } from './microsoft-dynamics.js';
import { ENTERPRISE_SAAS_TEMPLATES } from './enterprise-saas.js';
import { ENDPOINT_TEMPLATES } from './endpoint.js';
import { CUSTOM_TEMPLATES } from './custom.js';

/**
 * Every registered application class.
 *
 * Order here is irrelevant — the registry sorts by id for determinism and resolves by declared
 * precedence — so this list can stay grouped by family for a human reader.
 */
export const REGISTERED_TEMPLATES: readonly ApplicationTemplate[] = [
  ...WEB_TEMPLATES,
  ...API_TEMPLATES,
  ...DYNAMICS_TEMPLATES,
  ...ENTERPRISE_SAAS_TEMPLATES,
  ...ENDPOINT_TEMPLATES,
  ...CUSTOM_TEMPLATES,
];

/**
 * The id used when a tenant's declaration matches no registered template.
 *
 * `other` rather than `web`: a tenant whose application class is unknown must receive a package
 * that says so, not one shaped for a target it was never matched to.
 */
export const FALLBACK_APPLICATION_TEMPLATE_ID = 'other';

/**
 * The class ASSUMED when a tenant declared none at all.
 *
 * Distinct from the fallback above, and deliberately so. "You named a class I do not recognise" is
 * an unclassified target; "you named nothing" is a tenant onboarded before the declaration existed,
 * and every one of those was generated as a web application. Resolving them to anything else would
 * change the package under an already-deployed Execution Plane — the `.env` keys it has filled in
 * would stop being the keys its package reads.
 *
 * It lives here, beside the registry, rather than in the generator: the generator must not know
 * that `web` is special, only that the platform has a declared default.
 */
export const DEFAULT_APPLICATION_TEMPLATE_ID = 'web';

/** Build a registry from a set of templates. Exported so tests can register in isolation. */
export function buildRegistry(templates: readonly ApplicationTemplate[]): ApplicationTemplateRegistry {
  const registry = new ApplicationTemplateRegistry();
  for (const t of templates) registry.register(t);
  return registry;
}

/** The platform registry. Built once at import; registration failures surface immediately. */
export const APPLICATION_TEMPLATES: ApplicationTemplateRegistry = buildRegistry(REGISTERED_TEMPLATES);

/**
 * Every registered id, as a non-empty tuple so it can type a schema enum directly.
 *
 * The cast is safe by construction: `REGISTERED_TEMPLATES` is non-empty and the registry rejects
 * duplicates, so `ids()` always yields at least one distinct id.
 */
export const APPLICATION_TYPE_IDS = APPLICATION_TEMPLATES.ids() as unknown as readonly [string, ...string[]];

/**
 * The application declaration as it appears in a tenant's canonical configuration.
 *
 * Structural, not imported: Platform Core owns the registry and must not depend on the onboarding
 * schema that happens to carry these fields. Any object with this shape can be resolved.
 *
 * `| undefined` is spelled out on every optional member because the workspace compiles with
 * `exactOptionalPropertyTypes`: a caller holding `applicationTypes?: string[] | undefined` — which
 * is exactly what the onboarding schema produces — would otherwise not be assignable here.
 */
export interface ApplicationDeclaration {
  readonly applicationTypes?: readonly string[] | undefined;
  readonly applicationName?: string | undefined;
  readonly applicationUrl?: string | undefined;
  readonly authenticationType?: string | undefined;
  readonly mfa?: { readonly required?: boolean | undefined; readonly method?: string | undefined } | undefined;
  readonly browserRequirements?: readonly string[] | undefined;
}

/**
 * Normalise an MFA declaration.
 *
 * MFA is only ever asserted from an EXPLICIT customer declaration; absent means not required — a
 * platform that assumed MFA would generate a second-factor slot no one can fill. When it IS
 * required, `totp` is the only method an Execution Plane can present unattended, so that is what a
 * bare `required: true` resolves to.
 *
 * One implementation, because both planes and both validation passes must agree on it: a generator
 * that thought MFA was off while validation thought it was on would emit a package that refuses to
 * start for a reason its own manifest denies.
 */
export function normaliseMfaDeclaration(
  mfa?: { readonly required?: boolean | undefined; readonly method?: string | undefined } | undefined,
): { required: boolean; method: string } {
  const required = mfa?.required === true;
  return { required, method: required ? (mfa?.method && mfa.method !== 'none' ? mfa.method : 'totp') : 'none' };
}

/**
 * Build the declared application context from a tenant's configuration.
 *
 * THE ONE DERIVATION. Onboarding validation and package generation both resolve templates against
 * this context; deriving it twice would let the Intelligence Plane validate one declaration and
 * generate for another. It lives here, beside the registry, because both callers already depend on
 * Platform Core and neither may depend on the other.
 *
 * A declaration with NO class resolves to the platform default, not to the unclassified fallback:
 * tenants onboarded before the declaration existed were all generated as that class, and moving
 * them would change the `.env` keys under an already-deployed Execution Plane.
 */
export function applicationContextFrom(
  declaration: ApplicationDeclaration | undefined,
  options: { readonly environment?: string } = {},
): ApplicationContext {
  return {
    applicationTypes: declaration?.applicationTypes?.length
      ? [...declaration.applicationTypes]
      : [DEFAULT_APPLICATION_TEMPLATE_ID],
    ...(declaration?.applicationName ? { applicationName: declaration.applicationName } : {}),
    ...(declaration?.applicationUrl ? { applicationUrl: declaration.applicationUrl } : {}),
    authenticationType: declaration?.authenticationType ?? 'none',
    mfa: normaliseMfaDeclaration(declaration?.mfa),
    browserRequirements: declaration?.browserRequirements ? [...declaration.browserRequirements] : [],
    ...(options.environment ? { environment: options.environment } : {}),
  };
}

/** Resolve the primary template for a declaration, using the platform registry and fallback. */
export function resolveApplicationTemplate(applicationTypes: readonly string[]): ApplicationTemplate {
  return APPLICATION_TEMPLATES.resolve(applicationTypes, FALLBACK_APPLICATION_TEMPLATE_ID);
}

/** Resolve every template a declaration selects, primary first. */
export function resolveApplicationTemplates(applicationTypes: readonly string[]): readonly ApplicationTemplate[] {
  return APPLICATION_TEMPLATES.resolveAll(applicationTypes, FALLBACK_APPLICATION_TEMPLATE_ID);
}

export { WEB_TEMPLATE, REACT_TEMPLATE, ANGULAR_TEMPLATE } from './web.js';
export { REST_API_TEMPLATE, GRAPHQL_TEMPLATE, SOAP_TEMPLATE } from './api.js';
export { D365_TEMPLATE, CRM_TEMPLATE } from './microsoft-dynamics.js';
export { SALESFORCE_TEMPLATE, SAP_TEMPLATE, ORACLE_FUSION_TEMPLATE, SERVICENOW_TEMPLATE, WORKDAY_TEMPLATE } from './enterprise-saas.js';
export { DESKTOP_TEMPLATE, MOBILE_TEMPLATE } from './endpoint.js';
export { OTHER_TEMPLATE, CUSTOM_TEMPLATE } from './custom.js';
