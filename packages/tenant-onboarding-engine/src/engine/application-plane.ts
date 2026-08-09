/**
 * Application plane — the Application-Template-driven half of the generated Execution Plane.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md §2c · 21-tenant-lifecycle.md §3a
 *   ADR          : ADR-0030 (one generator) · ADR-0032 (SSOT) · ADR-0035 (EP operational portal)
 *   Criteria     : C-03.18 (deterministic) · C-03.19 (no secret material in output)
 *   Invariant    : INV-2 (no customer credential in the Intelligence Plane)
 *
 * THIS MODULE HOLDS NO APPLICATION KNOWLEDGE.
 * It resolves the tenant's declared application classes to templates and projects template
 * metadata into the artefacts an Execution Plane needs: env slots, an application config document,
 * auth profiles, discovery and execution profiles, capability overlays, validation rules, portal
 * schema and operator documentation. Every branch here is on a template PROPERTY — `credentialModel`,
 * `captureSession`, `storage` — never on a template ID. Adding Salesforce or a bespoke target
 * changes nothing in this file, which is the property that makes the registry an extension point
 * rather than a lookup table.
 *
 * The previous generator hard-coded a `SIGN_IN_TARGETS = ['d365','crm']` list and an `APP_TARGET`
 * env-var table. Those two constants were the whole application model, and everything they did not
 * cover — discovery strategy, session capture, execution mode, per-target validation, operator
 * guidance — silently defaulted to a generic web application. That is the failure this module ends.
 */
import {
  resolveApplicationTemplate, resolveApplicationTemplates, resolveAuthentication, resolveConfigFields,
  resolveAllConfigFields, primaryTargetEnvVar, evaluateApplicationValidation,
  conditionHolds, applicationContextFrom, normaliseMfaDeclaration,
  type ApplicationTemplate, type ApplicationContext, type ResolvedConfigField, type ApplicationValidationIssue,
} from '@dbiz/platform-core';
import type { TenantEnvelope } from './tenant-config.js';

/**
 * The declared application context for a tenant.
 *
 * A thin adapter over the platform's ONE derivation (`applicationContextFrom`), which onboarding
 * validation also uses. Deriving it a second time here would let the Intelligence Plane validate
 * one declaration and generate a package for another.
 */
export function applicationContext(env: TenantEnvelope): ApplicationContext {
  return applicationContextFrom(env.configuration.customerOwned.application, {
    ...(env.configuration.customer?.environment ? { environment: env.configuration.customer.environment } : {}),
  });
}

/** Look up a resolved field by its logical name within one template's contribution. */
function fieldEnv(fields: readonly ResolvedConfigField[], templateId: string, name: string): string | undefined {
  return fields.find((f) => f.templateId === templateId && f.name === name)?.envVar;
}

// ── Sign-in credentials (public, backward-compatible surface) ────────────────

/**
 * The sign-in credential slots a target needs, or `null` when it is not driven as a named user.
 *
 * Kept as a named export because it is the platform's answer to "does this target sign a user in,
 * and through which env vars?" — the onboarding wizard, the generator and the tests all ask it.
 * What changed is the ANSWER's source: it is now the resolved template's `credentialModel`, not a
 * hard-coded list of two application ids.
 */
export interface AppTargetCredentials {
  readonly type: string;
  readonly baseUrlEnv: string;
  readonly usernameEnv: string;
  readonly passwordEnv: string;
  readonly mfa: { readonly required: boolean; readonly method: string; readonly totpSecretEnv?: string };
}

export function signInCredentials(
  appTypes: readonly string[],
  mfa?: { required?: boolean; method?: string },
  authenticationType?: string,
): AppTargetCredentials | null {
  const template = resolveApplicationTemplate(appTypes);
  const context: ApplicationContext = {
    applicationTypes: appTypes,
    mfa: normaliseMfaDeclaration(mfa),
    ...(authenticationType ? { authenticationType } : {}),
  };
  const auth = resolveAuthentication(template, context);
  if (auth.credentialModel !== 'user-sign-in') return null;

  const fields = resolveConfigFields(template, context);
  const usernameEnv = fieldEnv(fields, template.id, 'username');
  const passwordEnv = fieldEnv(fields, template.id, 'password');
  // A user-sign-in strategy without both slots visible is a template defect, not a runtime case:
  // returning a half-populated credential set would put a dangling reference in the package.
  if (!usernameEnv || !passwordEnv) return null;

  const declared = normaliseMfaDeclaration(mfa);
  const totpSecretEnv = declared.required && auth.mfaSupported ? fieldEnv(fields, template.id, 'totpSecret') : undefined;
  return {
    type: template.id,
    baseUrlEnv: primaryTargetEnvVar(template),
    usernameEnv,
    passwordEnv,
    mfa: { required: declared.required, method: declared.method, ...(totpSecretEnv ? { totpSecretEnv } : {}) },
  };
}

// ── The resolved application plane ───────────────────────────────────────────

/** Everything the generator needs about a tenant's application target, resolved once. */
export interface ApplicationPlane {
  readonly context: ApplicationContext;
  /** The template that drives authentication, discovery and execution. */
  readonly primary: ApplicationTemplate;
  /** Every template the declaration selects, primary first. All contribute config slots. */
  readonly templates: readonly ApplicationTemplate[];
  /** Every config slot, de-duplicated, primary template first. */
  readonly fields: readonly ResolvedConfigField[];
  /** Env slots only, in emission order. */
  readonly envFields: readonly ResolvedConfigField[];
  /** Operational settings with their defaults — the EP portal's editable configuration. */
  readonly operational: Readonly<Record<string, string | number | boolean>>;
  /** Sign-in slots, or null for a target that is not driven as a named user. */
  readonly credentials: AppTargetCredentials | null;
  /** The env var that addresses the target. */
  readonly targetEnv: string;
  /** The service-credential slot, when the resolved strategy uses one. */
  readonly authSecretEnv: string | undefined;
  /** Adapter interface classes the target itself requires, beyond those the capabilities drive. */
  readonly adapterInterfaces: readonly string[];
}

/** Resolve a tenant's whole application plane. Pure: same envelope in, same plane out. */
export function buildApplicationPlane(env: TenantEnvelope): ApplicationPlane {
  const context = applicationContext(env);
  const templates = resolveApplicationTemplates(context.applicationTypes);
  const primary = templates[0]!;
  const fields = resolveAllConfigFields(templates, context);
  const envFields = fields.filter((f) => f.storage === 'env');

  const operational: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    if (f.storage === 'config' && f.defaultValue !== undefined) operational[f.name] = f.defaultValue;
  }

  const auth = resolveAuthentication(primary, context);
  const credentials = signInCredentials(context.applicationTypes, context.mfa, context.authenticationType);
  // The service-credential slot is whichever credential field the resolved strategy names that is
  // not part of the user sign-in set — asking the strategy, not guessing at a well-known var name.
  const serviceCredentialField = auth.credentialModel === 'service-credential'
    ? auth.credentialFields.find((n) => !['username', 'password', 'totpSecret'].includes(n))
    : undefined;

  return {
    context,
    primary,
    templates,
    fields,
    envFields,
    operational,
    credentials,
    targetEnv: primaryTargetEnvVar(primary),
    authSecretEnv: serviceCredentialField ? fieldEnv(fields, primary.id, serviceCredentialField) : undefined,
    adapterInterfaces: [...primary.runtime.adapterInterfaces],
  };
}

// ── config/application.json ──────────────────────────────────────────────────

/**
 * The Execution-Plane application band — ONE document describing what this package drives.
 *
 * It carries the resolved strategies, the env REFERENCES for every slot, the operational defaults,
 * the portal schema and the validation rules. The Execution Plane renders its configuration screen
 * from the portal schema in this file and refuses to start when the validation rules in this file
 * are unmet — which is why the rules are emitted rather than restated in EP code: one rule set,
 * evaluated on both sides, cannot drift.
 */
export function applicationConfigDocument(plane: ApplicationPlane, env: TenantEnvelope): Record<string, unknown> {
  const { primary, context } = plane;
  const auth = resolveAuthentication(primary, context);
  const app = env.configuration.customerOwned.application;

  return {
    _note: 'Application band generated from the Application Template Registry. REFERENCES ONLY — every credential value is set in .env at this Execution Plane and never reaches DBiz (INV-2).',
    template: {
      id: primary.id,
      label: primary.label,
      category: primary.category,
      description: primary.description,
    },
    declaredTypes: [...context.applicationTypes],
    /** Secondary templates contribute configuration slots but not strategy. */
    contributingTemplates: plane.templates.map((t) => t.id),
    target: {
      name: app?.applicationName ?? '<FILL: application name>',
      url: app?.applicationUrl ?? '<FILL: app URL>',
      baseUrlEnv: plane.targetEnv,
      environment: context.environment ?? '<FILL: environment>',
    },
    authentication: {
      strategy: auth.id,
      label: auth.label,
      credentialModel: auth.credentialModel,
      captureSession: auth.captureSession,
      storageStateReuse: auth.storageStateReuse,
      ...(auth.storageStatePath ? { storageStatePath: auth.storageStatePath } : {}),
      sessionRefresh: auth.sessionRefresh,
      mfa: {
        supported: auth.mfaSupported,
        required: context.mfa?.required === true,
        method: context.mfa?.method ?? 'none',
        ...(plane.credentials?.mfa.totpSecretEnv ? { totpSecretEnv: plane.credentials.mfa.totpSecretEnv } : {}),
      },
      // Env REFERENCES for every credential slot the resolved strategy names.
      credentialEnv: Object.fromEntries(
        auth.credentialFields
          .map((name) => [name, fieldEnv(plane.fields, primary.id, name)] as const)
          .filter((pair): pair is readonly [string, string] => pair[1] !== undefined),
      ),
    },
    discovery: {
      strategy: primary.discovery.strategy,
      ...(primary.discovery.fallbackStrategy ? { fallbackStrategy: primary.discovery.fallbackStrategy } : {}),
      label: primary.discovery.label,
      profile: primary.discovery.profile,
    },
    execution: {
      strategy: primary.execution.strategy,
      label: primary.execution.label,
      sessionRefresh: primary.execution.sessionRefresh,
      profile: primary.execution.profile,
    },
    runtime: primary.runtime,
    configuration: {
      env: plane.envFields.map((f) => ({
        name: f.name, label: f.label, envVar: f.envVar, type: f.type,
        required: f.required, secret: f.secret, group: f.group, help: f.help,
        ...(f.options ? { options: [...f.options] } : {}),
        template: f.templateId,
      })),
      operational: plane.operational,
    },
    portal: {
      title: primary.portal.title,
      summary: primary.portal.summary,
      groups: primary.portal.groups,
      fields: plane.fields.map((f) => ({
        name: f.name, label: f.label, type: f.type, group: f.group, order: f.order,
        storage: f.storage, required: f.required, secret: f.secret, help: f.help,
        ...(f.envVar ? { envVar: f.envVar } : {}),
        ...(f.options ? { options: [...f.options] } : {}),
        ...(f.defaultValue !== undefined ? { defaultValue: f.defaultValue } : {}),
        template: f.templateId,
      })),
    },
    validation: primary.validation.map((r) => ({ ...r })),
  };
}

/**
 * The portal schema the generated console renders its configuration screen from.
 *
 * A field is either an ENV slot — which the portal shows as a read-only `env:NAME` reference,
 * because a portal that could set a secret's value would be a portal that holds one (INV-2) — or an
 * OPERATIONAL setting, which is editable and persisted to `config/application.json`. That
 * distinction comes from the template's `storage`, not from a list of known-secret field names.
 */
export interface ApplicationPortalField {
  readonly name: string;
  readonly label: string;
  readonly type: string;
  readonly group: string;
  readonly storage: 'env' | 'config';
  readonly required: boolean;
  readonly secret: boolean;
  readonly help: string;
  readonly envVar?: string;
  readonly options?: readonly string[];
  readonly value?: string | number | boolean;
}

export interface ApplicationPortalSnapshot {
  readonly templateId: string;
  readonly templateLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly authentication: string;
  readonly discovery: string;
  readonly execution: string;
  readonly groups: readonly { readonly id: string; readonly label: string; readonly description: string; readonly order: number }[];
  readonly fields: readonly ApplicationPortalField[];
}

export function applicationPortalSnapshot(plane: ApplicationPlane): ApplicationPortalSnapshot {
  const auth = resolveAuthentication(plane.primary, plane.context);
  return {
    templateId: plane.primary.id,
    templateLabel: plane.primary.label,
    title: plane.primary.portal.title,
    summary: plane.primary.portal.summary,
    authentication: auth.label,
    discovery: plane.primary.discovery.label,
    execution: plane.primary.execution.label,
    groups: plane.primary.portal.groups.map((g) => ({ ...g })),
    fields: plane.fields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      group: f.group,
      storage: f.storage,
      required: f.required,
      secret: f.secret,
      help: f.help,
      ...(f.envVar ? { envVar: f.envVar } : {}),
      ...(f.options ? { options: [...f.options] } : {}),
      // An env slot shows its REFERENCE, never a value — the portal never holds a credential.
      ...(f.storage === 'env' ? { value: `env:${f.envVar}` } : f.defaultValue !== undefined ? { value: f.defaultValue } : {}),
    })),
  };
}

// ── .env.example application blocks ──────────────────────────────────────────

/** The comment shown beside a slot — required/optional, secret, and the field's own help text. */
function slotComment(field: ResolvedConfigField): string {
  const flags = [field.required ? '[required]' : '[optional]', ...(field.secret ? ['[secret]'] : [])].join('');
  return `${flags} ${field.help}`;
}

/**
 * The application-target blocks for `.env.example` — one per contributing template, each env var
 * defined exactly once across all of them. A slot a later template repeats is referenced, not
 * redefined, so the file can never declare the same variable twice with different comments.
 */
export function applicationEnvBlocks(plane: ApplicationPlane): string {
  const rule = '#'.repeat(79);
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const template of plane.templates) {
    const fields = plane.envFields.filter((f) => f.templateId === template.id);
    if (!fields.length) continue;
    const pad = Math.max(...fields.map((f) => f.envVar!.length + (f.secret ? 1 : String(f.defaultValue ?? '').length + 1)));
    const lines = fields.map((f) => {
      if (seen.has(f.envVar!)) return `# ${f.envVar} (defined above)`;
      seen.add(f.envVar!);
      // A non-secret slot with a sensible default is PRE-FILLED. The objective is a package that
      // needs no manual configuration, and making an operator retype `v9.2` is manual configuration
      // whose only possible outcomes are "the same value" or "a mistake". A secret is never
      // pre-filled — the contract makes a secret-with-a-default unrepresentable (INV-2).
      const value = !f.secret && f.defaultValue !== undefined ? String(f.defaultValue) : '';
      return `${`${f.envVar}=${value}`.padEnd(pad + 1)}# ${slotComment(f)}`.trimEnd();
    });
    blocks.push([
      rule,
      `# ${template.label} / application target (customer tenant — never sent to DBiz)`,
      rule,
      ...lines,
    ].join('\n'));
  }
  return blocks.join('\n\n');
}

/** Env var names the application plane defines — so the platform secret block cannot redefine them. */
export function applicationEnvNames(plane: ApplicationPlane): ReadonlySet<string> {
  return new Set(plane.envFields.map((f) => f.envVar!));
}

// ── integrations.json contributions ──────────────────────────────────────────

/**
 * The `application` block of `config/integrations.json`.
 *
 * Its established keys (`name`, `types`, `url`, `baseUrlEnv`, `authenticationType`, `authSecretEnv`,
 * `issueKey`, `credentials`) are preserved exactly — an Execution Plane already reading them keeps
 * working. The template binding is added alongside, and points at `config/application.json` for the
 * strategies, so there is one authoritative copy rather than two that can disagree.
 */
export function applicationIntegrationBlock(plane: ApplicationPlane, env: TenantEnvelope): Record<string, unknown> {
  const app = env.configuration.customerOwned.application;
  const auth = resolveAuthentication(plane.primary, plane.context);
  return {
    name: app?.applicationName ?? '<FILL: application name>',
    types: [...plane.context.applicationTypes],
    url: app?.applicationUrl ?? '<FILL: app URL>',
    baseUrlEnv: plane.targetEnv,
    authenticationType: app?.authenticationType ?? 'none',
    // Preserved for compatibility: an EP that already reads this key keeps resolving a slot name.
    authSecretEnv: plane.authSecretEnv ?? 'APP_AUTH_SECRET',
    // The functional workflow's entry point — which user story / issue to test. A per-run target:
    // the slot is generated; the value is entered at the EP, never at onboarding.
    issueKey: '<FILL: user story / issue key (e.g. CARL-123)>',
    template: plane.primary.id,
    authenticationStrategy: auth.id,
    applicationConfigRef: '@config/application.json',
    ...(plane.credentials
      ? {
        credentials: {
          baseUrlEnv: plane.credentials.baseUrlEnv,
          usernameEnv: plane.credentials.usernameEnv,
          passwordEnv: plane.credentials.passwordEnv,
          mfa: plane.credentials.mfa,
        },
      }
      : {}),
  };
}

/**
 * The `app-default` auth profile every capability's `authProfileRef` resolves to.
 *
 * Generated from the resolved strategy so a capability that resolves this profile has everything
 * it needs to authenticate — including whether to capture a session, where the storage state lives
 * and when to refresh it — without reading the application block or knowing the target's class.
 */
export function applicationAuthProfile(plane: ApplicationPlane, env: TenantEnvelope): Record<string, unknown> {
  const auth = resolveAuthentication(plane.primary, plane.context);
  const app = env.configuration.customerOwned.application;
  return {
    source: '@integrations.application',
    authenticationType: app?.authenticationType ?? 'none',
    strategy: auth.id,
    credentialModel: auth.credentialModel,
    secretEnv: plane.authSecretEnv ?? 'APP_AUTH_SECRET',
    captureSession: auth.captureSession,
    storageStateReuse: auth.storageStateReuse,
    ...(auth.storageStatePath ? { storageStatePath: auth.storageStatePath } : {}),
    sessionRefresh: auth.sessionRefresh,
    ...(plane.credentials
      ? {
        baseUrlEnv: plane.credentials.baseUrlEnv,
        usernameEnv: plane.credentials.usernameEnv,
        passwordEnv: plane.credentials.passwordEnv,
        mfa: plane.credentials.mfa,
      }
      : {}),
  };
}

// ── capability overlay ───────────────────────────────────────────────────────

/**
 * Merge a template's per-capability profile onto a capability scaffold.
 *
 * Nested objects (`guardrail`) merge one level deep so a template can tighten `maxConcurrency`
 * without discarding the guardrails the capability declares for itself. Deeper structures are
 * replaced wholesale — a template that needs to restate one is describing a different guardrail,
 * not amending this one.
 */
export function applyCapabilityProfile(
  scaffold: Record<string, unknown>,
  profile: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!profile) return scaffold;
  const merged: Record<string, unknown> = { ...scaffold };
  for (const [key, value] of Object.entries(profile)) {
    const existing = merged[key];
    merged[key] = isPlainObject(existing) && isPlainObject(value) ? { ...existing, ...value } : value;
  }
  return merged;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The discovery + execution profile a capability inherits from the target it drives. */
export function capabilityTargetProfile(plane: ApplicationPlane): Record<string, unknown> {
  return {
    applicationTemplate: plane.primary.id,
    discoveryStrategy: plane.primary.discovery.strategy,
    executionStrategy: plane.primary.execution.strategy,
    authProfileRef: 'app-default',
  };
}

// ── validation ───────────────────────────────────────────────────────────────

/**
 * The Intelligence-Plane-side application validation for a tenant.
 *
 * Only `intelligence-plane` and `both`-scoped rules run here: the IP holds no customer credential
 * (INV-2), so a rule asserting that a password is set is one only the Execution Plane can decide.
 * The full rule set — including those — ships inside `config/application.json`.
 */
export function validateApplicationPlane(env: TenantEnvelope): readonly ApplicationValidationIssue[] {
  const plane = buildApplicationPlane(env);
  const app = env.configuration.customerOwned.application;
  // What the IP legitimately knows: the declared target address and the operational defaults.
  const values: Record<string, unknown> = {
    ...plane.operational,
    baseUrl: app?.applicationUrl,
  };
  return evaluateApplicationValidation(plane.primary, plane.context, values, 'intelligence-plane');
}

// ── documentation ────────────────────────────────────────────────────────────

/** `docs/EP-APPLICATION.md` — the operator guidance for THIS tenant's target, and no other. */
export function applicationDocument(plane: ApplicationPlane): string {
  const { primary, context } = plane;
  const auth = resolveAuthentication(primary, context);
  const doc = primary.documentation;
  const bullets = (items: readonly string[]): string[] => (items.length ? items.map((i) => `- ${i}`) : ['- (none)']);
  const epRules = primary.validation.filter((r) => r.scope !== 'intelligence-plane' && conditionHolds(r.appliesWhen, context));

  return [
    `# Execution Plane — application under test: ${primary.label}`,
    '',
    doc.summary,
    '',
    '## What was generated for this target',
    '',
    `- **Application template** — \`${primary.id}\` (${primary.category}).`,
    `- **Authentication** — ${auth.label} (\`${auth.id}\`).`,
    `- **Discovery** — \`${primary.discovery.strategy}\`${primary.discovery.fallbackStrategy ? ` (fallback \`${primary.discovery.fallbackStrategy}\`)` : ''}: ${primary.discovery.label}.`,
    `- **Execution** — \`${primary.execution.strategy}\`: ${primary.execution.label}.`,
    `- **Adapter interfaces** — ${primary.runtime.adapterInterfaces.map((i) => `\`${i}\``).join(', ')} (primary \`${primary.runtime.primaryAdapterInterface}\`).`,
    `- **Concurrency ceiling** — ${primary.runtime.maxParallelSessions} concurrent session(s) against this target.`,
    '',
    '## Set up',
    '',
    ...bullets(doc.setupSteps),
    '',
    '## Configuration slots — `.env`',
    '',
    ...(plane.envFields.length
      ? plane.envFields.map((f) => `- \`${f.envVar}\` — ${f.required ? '**required**' : 'optional'}${f.secret ? ', **secret**' : ''}. ${f.help}`)
      : ['- (this target needs no environment slot)']),
    '',
    '## Operational settings — `config/application.json` → `configuration.operational`',
    '',
    ...(Object.keys(plane.operational).length
      ? Object.entries(plane.operational).map(([k, v]) => `- \`${k}\` — default \`${String(v)}\`. Editable in the Execution-Plane portal.`)
      : ['- (this target declares no operational setting)']),
    '',
    '## Authentication',
    '',
    ...bullets(doc.authenticationNotes),
    ...(context.mfa?.required
      ? ['', `MFA is **enforced** on this target (\`${context.mfa.method}\`). The Execution Plane derives the second factor from the enrolment secret in \`${plane.credentials?.mfa.totpSecretEnv ?? 'the TOTP slot'}\` — it is presented, never bypassed.`]
      : ['', 'MFA is **not** declared for this target. If sign-in later challenges for a second factor, re-run onboarding with MFA enabled so the TOTP slot is generated.']),
    '',
    '## Discovery',
    '',
    ...bullets(doc.discoveryNotes),
    '',
    '## Execution',
    '',
    ...bullets(doc.executionNotes),
    '',
    '## Validation applied before this package starts',
    '',
    // Only the rules the EXECUTION PLANE will actually evaluate for THIS declaration. Listing an
    // Intelligence-Plane rule would describe a check that never runs here, and listing a rule whose
    // condition cannot hold (the "MFA was not declared" advisory, for a tenant that declared it)
    // would tell the operator to expect a message they will never see.
    ...(epRules.length
      ? epRules.map((r) => `- \`${r.id}\` (${r.severity}) — ${r.detail}`)
      : ['- (no rule applies to this target and declaration)']),
    '',
    '## Troubleshooting',
    '',
    ...(doc.troubleshooting.length
      ? doc.troubleshooting.flatMap((t) => [`- **${t.symptom}**`, `  ${t.resolution}`])
      : ['- (none recorded)']),
    '',
  ].join('\n');
}

/** The application section of `docs/EP-CONFIGURATION.md`, so both documents agree. */
export function applicationConfigurationSummary(plane: ApplicationPlane): readonly string[] {
  const { primary, context } = plane;
  const auth = resolveAuthentication(primary, context);
  const lines: string[] = [
    `- Declared type(s): **${context.applicationTypes.join(', ')}**.`,
    `- Application template: **${primary.label}** (\`${primary.id}\`) — see \`docs/EP-APPLICATION.md\`.`,
    `- Authentication: **${auth.label}**.`,
  ];
  if (plane.credentials) {
    lines.push(
      `- This is a **sign-in target**: the EP signs in to ${primary.label} as a real user.`,
      `  Set \`${plane.credentials.baseUrlEnv}\`, \`${plane.credentials.usernameEnv}\` and \`${plane.credentials.passwordEnv}\` in \`.env\`.`,
    );
    if (plane.credentials.mfa.required) {
      lines.push(
        `- MFA is **enforced** on this target (\`${plane.credentials.mfa.method}\`): also set \`${plane.credentials.mfa.totpSecretEnv}\` to the`,
        '  enrolment secret of the automation account, so the EP can derive the second factor unattended.',
      );
    } else {
      lines.push(
        '- MFA is **not** declared for this target. If sign-in later challenges for a second factor,',
        '  re-run onboarding with MFA enabled so the TOTP slot is generated.',
      );
    }
    if (auth.captureSession) {
      lines.push(`- The session is captured once and replayed from \`${auth.storageStatePath}\`, so a long suite signs in once.`);
    }
    lines.push('- These values stay in your tenancy; the Intelligence Plane holds none of them (INV-2).');
  } else {
    lines.push(`- Set the target address in \`.env\` → \`${plane.targetEnv}\`.`);
    if (plane.authSecretEnv) lines.push(`- This target presents an application-held credential: set \`${plane.authSecretEnv}\`.`);
  }
  return lines;
}
