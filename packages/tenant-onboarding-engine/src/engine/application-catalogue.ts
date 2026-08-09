/**
 * Application template catalogue — the registry, projected for the onboarding experience.
 *
 * TRACEABILITY: ADR-0031 (experience layer) · ADR-0021 (Platform Core owns the registry)
 *
 * The onboarding wizard must show the operator WHICH application classes exist, what each one will
 * generate, and which fields it will ask for — before a tenant is created. It gets that from here,
 * over the API, rather than from a list compiled into the web bundle. A hard-coded list in the
 * wizard is the same second source of truth the generator just lost: registering Salesforce would
 * make it generatable but not selectable, and the two would silently disagree.
 *
 * This module holds no application knowledge and makes no decision. It reads the registry and
 * flattens it into a shape a form can render.
 */
import {
  APPLICATION_TEMPLATES, FALLBACK_APPLICATION_TEMPLATE_ID, resolveConfigFields, resolveAuthentication,
  type ApplicationTemplate, type ApplicationContext,
} from '@dbiz/platform-core';

/** One application class, as the wizard renders it. */
export interface ApplicationTemplateDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: string;
  /** Whether this target is driven as a real named user — the wizard asks about MFA only for those. */
  readonly signInTarget: boolean;
  /** Whether the target can present a second factor, so the MFA question is worth asking at all. */
  readonly mfaSupported: boolean;
  readonly authentication: { readonly strategy: string; readonly label: string; readonly captureSession: boolean };
  readonly discovery: { readonly strategy: string; readonly label: string };
  readonly execution: { readonly strategy: string; readonly label: string };
  /**
   * The env slots this target generates, for the two declarations the wizard can vary: with MFA
   * and without. The wizard shows the operator exactly which `.env` keys their package will carry
   * before they commit to a class.
   */
  readonly slots: { readonly withoutMfa: readonly string[]; readonly withMfa: readonly string[] };
  readonly portal: ApplicationTemplate['portal'];
  readonly setupSteps: readonly string[];
}

export interface ApplicationTemplateCatalogue {
  readonly templates: readonly ApplicationTemplateDescriptor[];
  /** The id used when a declaration matches nothing — surfaced so the wizard can label it. */
  readonly fallbackId: string;
}

/**
 * The declaration a descriptor is computed against: the class alone, with and without MFA.
 *
 * No `authenticationType` is supplied, deliberately. The wizard asks WHICH CLASS before it knows
 * the mechanism, so a descriptor describes the template's own default. A target whose mechanism is
 * intrinsic (Dynamics is always Entra) therefore previews accurately; a generic web application
 * previews as anonymous until a mechanism is declared or discovered, which is the honest answer.
 */
function contextFor(template: ApplicationTemplate, mfaRequired: boolean): ApplicationContext {
  return {
    applicationTypes: [template.id],
    mfa: { required: mfaRequired, method: mfaRequired ? 'totp' : 'none' },
  };
}

const envSlots = (template: ApplicationTemplate, mfaRequired: boolean): readonly string[] =>
  resolveConfigFields(template, contextFor(template, mfaRequired))
    .filter((f) => f.storage === 'env')
    .map((f) => f.envVar!);

/** Project one template into the descriptor the wizard renders. */
export function applicationTemplateDescriptor(template: ApplicationTemplate): ApplicationTemplateDescriptor {
  const auth = resolveAuthentication(template, contextFor(template, false));
  return {
    id: template.id,
    label: template.label,
    description: template.description,
    category: template.category,
    signInTarget: auth.credentialModel === 'user-sign-in',
    mfaSupported: auth.mfaSupported,
    authentication: { strategy: auth.id, label: auth.label, captureSession: auth.captureSession },
    discovery: { strategy: template.discovery.strategy, label: template.discovery.label },
    execution: { strategy: template.execution.strategy, label: template.execution.label },
    slots: { withoutMfa: envSlots(template, false), withMfa: envSlots(template, true) },
    portal: template.portal,
    setupSteps: template.documentation.setupSteps,
  };
}

/** The whole catalogue, id-sorted (the registry's deterministic order). */
export function applicationTemplateCatalogue(): ApplicationTemplateCatalogue {
  return {
    templates: APPLICATION_TEMPLATES.all().map(applicationTemplateDescriptor),
    fallbackId: FALLBACK_APPLICATION_TEMPLATE_ID,
  };
}
