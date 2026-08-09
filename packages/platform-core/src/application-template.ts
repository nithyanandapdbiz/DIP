/**
 * Application Template contract — the metadata that drives Execution-Plane generation.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md §2c (generation) · 21-tenant-lifecycle.md §3a
 *   ADR          : ADR-0021 (Platform Core bounded context) · ADR-0030 (one generator)
 *   Criteria     : C-03.16 (every declared field is consumed by generator code)
 *                  C-03.17 (an unsupported combination fails at onboarding)
 *                  C-03.19 (generated output contains no secret material)
 *   Invariant    : INV-2 (DBiz never receives a customer credential)
 *
 * THE GENERATOR IS A COMPILER; THIS IS ITS TARGET DESCRIPTION.
 * The Technology Profile says HOW the Execution Plane is built (language, runner, CI).
 * An Application Template says WHAT it drives: how the application under test authenticates,
 * how it is discovered, how it is executed against, which configuration slots the package must
 * carry, which of those are secrets, what the operator must be told, and what must be true
 * before the package may start.
 *
 * The generator core reads ONLY this contract. Adding Salesforce, SAP or a bespoke in-house
 * application is authoring one template object and registering it — no generator change, no new
 * branch, no new emitter. A `switch (applicationType)` anywhere downstream of this module is the
 * failure this contract exists to prevent.
 *
 * EVERYTHING HERE IS DATA. No template may carry a function: templates are serialised into the
 * generated package (`config/application.json`) so the Execution Plane evaluates the SAME
 * validation rules and renders the SAME portal schema the Intelligence Plane generated it from.
 * A behavioural template could not cross that boundary, and the two sides would drift.
 *
 * NO TEMPLATE CARRIES A SECRET VALUE. A template declares env var NAMES and vault REFERENCE
 * shapes; every value is set at the Execution Plane and never reaches the Intelligence Plane
 * (INV-2). Registration-time structural guards below make a secret-with-a-default unrepresentable,
 * and `application-template.test.ts` scans the whole registry to prove the property holds.
 */

// ── Strategy vocabularies ────────────────────────────────────────────────────
// Enumerated rather than open strings: an unknown strategy is a target the runtime cannot drive,
// and it must fail at onboarding (C-03.17) rather than in a customer's first run.

/** How the Execution Plane proves identity to the application under test. */
export const AUTHENTICATION_STRATEGIES = [
  'anonymous',
  'form',
  'basic',
  'api-key',
  'jwt-bearer',
  'oauth2-client-credentials',
  'oauth2-authorization-code',
  'openid-connect',
  'saml',
  'microsoft-entra-interactive',
  'certificate',
  'windows-integrated',
] as const;
export type AuthenticationStrategyId = (typeof AUTHENTICATION_STRATEGIES)[number];

/** How the Execution Plane learns the application's surface before it tests it. */
export const DISCOVERY_STRATEGIES = [
  'anonymous',
  'authenticated',
  'api',
  'metadata',
  'hybrid',
  'reverse',
  'capture-session',
  'none',
] as const;
export type DiscoveryStrategyId = (typeof DISCOVERY_STRATEGIES)[number];

/** How the Execution Plane drives the application when a capability runs. */
export const EXECUTION_STRATEGIES = [
  'anonymous',
  'authenticated',
  'storage-state',
  'api',
  'hybrid',
  'capture-session',
] as const;
export type ExecutionStrategyId = (typeof EXECUTION_STRATEGIES)[number];

/** How a session is kept alive across a long run. */
export const SESSION_REFRESH_STRATEGIES = ['none', 'reauthenticate', 'refresh-token', 'storage-state-replay'] as const;
export type SessionRefreshStrategyId = (typeof SESSION_REFRESH_STRATEGIES)[number];

/** Input classes the portal renders and the validator understands. */
export const CONFIG_FIELD_TYPES = ['text', 'url', 'number', 'boolean', 'select', 'password', 'secret', 'multiline'] as const;
export type ConfigFieldType = (typeof CONFIG_FIELD_TYPES)[number];

/** Data-only validation predicates. Evaluated identically in the IP and in the generated EP. */
export const VALIDATION_RULES = [
  'required', 'url', 'https-url', 'pattern', 'one-of', 'env-reference', 'vault-reference', 'positive-number',
] as const;
export type ValidationRuleId = (typeof VALIDATION_RULES)[number];

/**
 * Which plane owns a rule.
 *
 * This split is structural, not stylistic. The Intelligence Plane holds NO customer credential
 * (INV-2), so it cannot evaluate "the password is set" — only the Execution Plane can. Marking
 * such a rule `intelligence-plane` would make onboarding fail for every tenant; omitting it
 * entirely would let an unconfigured package start. Scoping keeps both sides honest from ONE
 * rule set, which is why the rules ship inside the package rather than being restated there.
 */
export const VALIDATION_SCOPES = ['intelligence-plane', 'execution-plane', 'both'] as const;
export type ValidationScope = (typeof VALIDATION_SCOPES)[number];

/**
 * Where a configuration slot lives.
 *
 * `env`    — a `.env` slot at the Execution Plane. The package carries the NAME; the customer
 *            sets the VALUE. Every secret is necessarily `env` (INV-2).
 * `config` — an operational setting written into the package with its default, editable in the
 *            EP portal (browser, parallelism, timeouts). Never a secret.
 */
export const CONFIG_STORAGE = ['env', 'config'] as const;
export type ConfigStorage = (typeof CONFIG_STORAGE)[number];

// ── Field + portal schema ────────────────────────────────────────────────────

/**
 * A condition on the tenant's declared application context. Data, not a predicate, so it survives
 * serialisation into the generated package and is evaluated the same way on both sides. `path` is
 * a dotted path into `ApplicationContext` (e.g. `mfa.required`).
 *
 * Exactly one of `equals` / `notEquals` / `oneOf` is set. `notEquals` and `oneOf` exist because the
 * common cases for an optional slot are "any authentication mode except none" and "form or basic" —
 * expressing either as a chain of `equals` conditions would need extending every time a mode is
 * added, which is the maintenance trap a data-driven condition is meant to avoid.
 *
 * `and` chains a second condition, so a slot can require two facts at once (a second-factor slot
 * needs BOTH a declared MFA policy AND an authentication mode that signs a user in) without the
 * contract growing a general expression language.
 */
export interface VisibilityCondition {
  readonly path: string;
  readonly equals?: string | number | boolean;
  readonly notEquals?: string | number | boolean;
  readonly oneOf?: readonly (string | number | boolean)[];
  readonly and?: VisibilityCondition;
}

/**
 * One configuration slot the generated package must carry.
 *
 * `envSuffix` is combined with the template's `envPrefix` (`D365` + `BASE_URL` → `D365_BASE_URL`)
 * so a template family renames its whole slot set by changing one string. `envVar` overrides that
 * for slots whose absolute name is established and must not move (`APP_PACKAGE`, `TEST_BASE_URL`).
 */
export interface ApplicationConfigField {
  /** Logical name, stable across env renames. Used by validation rules and the portal. */
  readonly name: string;
  readonly label: string;
  readonly type: ConfigFieldType;
  readonly storage: ConfigStorage;
  /** Env var suffix, prefixed with the template's `envPrefix`. `env` storage only. */
  readonly envSuffix?: string;
  /** Absolute env var name — only for slots whose name must not follow the prefix. */
  readonly envVar?: string;
  readonly required: boolean;
  /** A secret is never emitted with a value; in the portal it is a `vault://` reference (INV-2). */
  readonly secret: boolean;
  readonly group: string;
  readonly order: number;
  readonly help: string;
  readonly options?: readonly string[];
  /** Non-secret default. A secret field may never declare one. */
  readonly defaultValue?: string | number | boolean;
  /** Emitted only when the tenant's declared context satisfies this condition. */
  readonly visibleWhen?: VisibilityCondition;
}

/** A portal section. The portal renders groups in `order`, fields in their own order. */
export interface PortalFieldGroup {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly order: number;
}

/** The metadata the portal (onboarding wizard and EP console) renders the target's form from. */
export interface ApplicationPortalSchema {
  readonly title: string;
  readonly summary: string;
  readonly groups: readonly PortalFieldGroup[];
}

// ── Strategy declarations ────────────────────────────────────────────────────

/**
 * The authentication contract for a target.
 *
 * `credentialModel` is the load-bearing distinction: `user-sign-in` targets are driven as a real
 * named user (so the package carries base-URL/username/password slots and, when the tenant declares
 * it, a second-factor slot); `service-credential` targets present a machine identity; `none`
 * targets are anonymous. The generator reads THIS, never a hard-coded list of application ids.
 */
export interface AuthenticationStrategy {
  readonly id: AuthenticationStrategyId;
  readonly label: string;
  readonly credentialModel: 'none' | 'user-sign-in' | 'service-credential';
  /** The sign-in is performed once through the real UI and the resulting session persisted. */
  readonly captureSession: boolean;
  /** The captured session is replayed on later runs instead of signing in again. */
  readonly storageStateReuse: boolean;
  /** Whether the target can present a second factor at sign-in (drives the TOTP slot). */
  readonly mfaSupported: boolean;
  readonly sessionRefresh: {
    readonly strategy: SessionRefreshStrategyId;
    /** Refresh cadence in minutes. Absent for `none`. */
    readonly intervalMinutes?: number;
  };
  /** Logical field names (from `configuration`) that carry credentials. Never values. */
  readonly credentialFields: readonly string[];
  /** Where the captured session is persisted inside the EP (a path, never a secret). */
  readonly storageStatePath?: string;
}

/** How the target's surface is discovered before execution. */
export interface DiscoveryStrategy {
  readonly strategy: DiscoveryStrategyId;
  /** Used when the primary strategy is unavailable (e.g. a metadata endpoint is not reachable). */
  readonly fallbackStrategy?: DiscoveryStrategyId;
  readonly label: string;
  /** Strategy-specific, non-secret parameters emitted into the EP discovery profile. */
  readonly profile: Readonly<Record<string, unknown>>;
}

/** How the target is driven when a capability executes. */
export interface ExecutionStrategy {
  readonly strategy: ExecutionStrategyId;
  readonly label: string;
  /** Whether the runtime must refresh the session mid-run (long suites against SaaS targets). */
  readonly sessionRefresh: boolean;
  readonly profile: Readonly<Record<string, unknown>>;
}

/** What the Execution Plane runtime must be able to do to drive this target. */
export interface RuntimeCapabilities {
  /** Interface classes (I2-browser, I3-api, …) this target can be driven through. */
  readonly adapterInterfaces: readonly string[];
  /** The interface a capability binds unless it declares another. */
  readonly primaryAdapterInterface: string;
  readonly browserRequired: boolean;
  readonly headlessSupported: boolean;
  /** Maximum concurrent authenticated sessions the target tolerates. */
  readonly maxParallelSessions: number;
  readonly supportsUiExecution: boolean;
  readonly supportsApiExecution: boolean;
  /** Targets where any write risks customer data until the tenant scopes it explicitly. */
  readonly nonDestructiveByDefault: boolean;
}

// ── Validation + documentation ───────────────────────────────────────────────

/** A data-only validation rule. `field` is a logical field name, or `*` for a template-wide rule. */
export interface ApplicationValidationRule {
  readonly id: string;
  readonly field: string;
  readonly rule: ValidationRuleId;
  readonly scope: ValidationScope;
  readonly severity: 'error' | 'warning';
  readonly detail: string;
  readonly pattern?: string;
  readonly options?: readonly string[];
  /** Applied only when the tenant's declared context satisfies this condition. */
  readonly appliesWhen?: VisibilityCondition;
}

/** Documentation fragments. Only the selected template's fragments reach the package. */
export interface ApplicationDocumentation {
  readonly summary: string;
  readonly setupSteps: readonly string[];
  readonly authenticationNotes: readonly string[];
  readonly discoveryNotes: readonly string[];
  readonly executionNotes: readonly string[];
  readonly troubleshooting: readonly { readonly symptom: string; readonly resolution: string }[];
}

// ── The template ─────────────────────────────────────────────────────────────

/** Broad family, used for grouping in the portal and for coarse capability defaults. */
export const APPLICATION_CATEGORIES = ['web', 'api', 'enterprise-saas', 'desktop', 'mobile', 'custom'] as const;
export type ApplicationCategory = (typeof APPLICATION_CATEGORIES)[number];

export interface ApplicationTemplate {
  /** Stable id. It is the value stored in the tenant configuration and must never change. */
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: ApplicationCategory;
  /**
   * Precedence when a tenant declares several classes. The highest wins and becomes the PRIMARY
   * template — the one that drives authentication, discovery and execution. This generalises the
   * former hard-coded "D365 beats CRM" rule into a property every template declares for itself.
   */
  readonly precedence: number;
  /** Env var prefix for this template's slots (`D365` → `D365_BASE_URL`). */
  readonly envPrefix: string;
  /**
   * The configuration field that ADDRESSES the target — the one slot that answers "where is the
   * application under test?". For a web or SaaS target that is its base URL; for a desktop target
   * it is the executable path. Named explicitly rather than inferred, because every consumer (the
   * integrations block, the auth profile, the operator documentation) must agree on it, and an
   * inferred answer is one that silently changes when a field is reordered.
   */
  readonly primaryTargetField: string;
  /** The authentication strategy used unless a variant matches the declared mechanism. */
  readonly authentication: AuthenticationStrategy;
  /**
   * Authentication strategies keyed by the tenant's declared `authenticationType`.
   *
   * A generic web application is not one authentication story: the same template drives an
   * anonymous marketing site, a form-login portal and an OIDC-protected app. Expressing that as
   * three templates would fragment every other property they share; expressing it as a branch in
   * the generator is the hard-coding this contract exists to remove. So the template declares the
   * variants and the resolver picks one from the declaration.
   *
   * A target whose authentication is intrinsic (Dynamics 365 is always Entra) declares NO variants,
   * and is therefore immune to a discovery pass that reports a different mechanism.
   */
  readonly authenticationVariants?: Readonly<Record<string, AuthenticationStrategy>>;
  readonly discovery: DiscoveryStrategy;
  readonly execution: ExecutionStrategy;
  readonly runtime: RuntimeCapabilities;
  readonly configuration: readonly ApplicationConfigField[];
  readonly portal: ApplicationPortalSchema;
  readonly validation: readonly ApplicationValidationRule[];
  readonly documentation: ApplicationDocumentation;
  /** Per-capability overrides merged onto the capability scaffold (e.g. lower concurrency). */
  readonly capabilityProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * The tenant's declared application context — the only input the template resolver reads. It is
 * derived from the canonical configuration; nothing here is a secret.
 */
export interface ApplicationContext {
  readonly applicationTypes: readonly string[];
  readonly applicationName?: string;
  readonly applicationUrl?: string;
  readonly authenticationType?: string;
  readonly mfa?: { readonly required: boolean; readonly method: string };
  readonly browserRequirements?: readonly string[];
  readonly environment?: string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

/**
 * The Application Template Registry.
 *
 * Registration is the ONLY extension point. The generator resolves a template by id and reads its
 * metadata; it never enumerates ids, and it has no knowledge of any particular application.
 *
 * Ordering is deterministic (id-sorted on read), because the registry feeds generated output and
 * generation must be byte-reproducible (C-03.18).
 */
export class ApplicationTemplateRegistry {
  private readonly templates = new Map<string, ApplicationTemplate>();

  /** Register a template. A duplicate id is a programming error, not a silent overwrite. */
  register(template: ApplicationTemplate): this {
    if (this.templates.has(template.id)) {
      throw new Error(`application template "${template.id}" is already registered`);
    }
    assertTemplateIsWellFormed(template);
    this.templates.set(template.id, template);
    return this;
  }

  has(id: string): boolean { return this.templates.has(id); }

  get(id: string): ApplicationTemplate | undefined { return this.templates.get(id); }

  /** Every registered template, id-sorted (deterministic). */
  all(): readonly ApplicationTemplate[] {
    return [...this.templates.values()].sort(byId);
  }

  /** Every registered id, sorted. The onboarding schema's enum is derived from this. */
  ids(): readonly string[] { return this.all().map((t) => t.id); }

  /**
   * Resolve the PRIMARY template for a set of declared classes.
   *
   * Highest precedence wins; ties break on id so the result is deterministic. An unknown or empty
   * declaration falls back to `fallbackId` — generation must always produce a coherent package,
   * and refusing here would strand a tenant whose declaration predates a template.
   */
  resolve(applicationTypes: readonly string[], fallbackId: string): ApplicationTemplate {
    const primary = this.known(applicationTypes)[0];
    if (primary) return primary;
    const fallback = this.templates.get(fallbackId);
    if (!fallback) throw new Error(`fallback application template "${fallbackId}" is not registered`);
    return fallback;
  }

  /**
   * Every template a tenant's declaration selects, primary first. Secondary templates still
   * contribute their configuration slots (a tenant driving both a D365 back office and a public
   * web front end needs both slot sets), but only the primary drives auth/discovery/execution.
   */
  resolveAll(applicationTypes: readonly string[], fallbackId: string): readonly ApplicationTemplate[] {
    const known = this.known(applicationTypes);
    return known.length ? known : [this.resolve(applicationTypes, fallbackId)];
  }

  /** Declared classes that resolve to a template, precedence-ordered and de-duplicated. */
  private known(applicationTypes: readonly string[]): readonly ApplicationTemplate[] {
    const seen = new Set<string>();
    return applicationTypes
      .map((t) => this.templates.get(t))
      .filter((t): t is ApplicationTemplate => t !== undefined)
      .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
      .sort((a, b) => (b.precedence - a.precedence) || byId(a, b));
  }
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Structural guards applied at registration, so a malformed template fails at import time rather
 * than in a customer's generated package.
 */
function assertTemplateIsWellFormed(t: ApplicationTemplate): void {
  const where = `application template "${t.id}"`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(t.id)) throw new Error(`${where}: id must be lower-kebab-case`);
  if (!/^[A-Z][A-Z0-9_]*$/.test(t.envPrefix)) throw new Error(`${where}: envPrefix must be UPPER_SNAKE_CASE`);

  const fieldNames = new Set<string>();
  const envNames = new Set<string>();
  for (const f of t.configuration) {
    if (fieldNames.has(f.name)) throw new Error(`${where}: duplicate configuration field "${f.name}"`);
    fieldNames.add(f.name);
    // INV-2 is structural here: a secret can only ever be an env slot, and an env slot is only
    // ever a NAME. A secret with a default, or a secret held as operational config, would put a
    // value in the package — so neither is representable.
    if (f.secret && f.storage !== 'env') throw new Error(`${where}: secret field "${f.name}" must be env-stored (INV-2)`);
    if (f.secret && f.defaultValue !== undefined) throw new Error(`${where}: secret field "${f.name}" must not declare a default (INV-2)`);
    if (f.storage === 'env') {
      if (!f.envSuffix && !f.envVar) throw new Error(`${where}: env field "${f.name}" declares neither envSuffix nor envVar`);
      const env = envVarNameFor(t, f);
      if (!/^[A-Z][A-Z0-9_]*$/.test(env)) throw new Error(`${where}: field "${f.name}" resolves to invalid env var "${env}"`);
      if (envNames.has(env)) throw new Error(`${where}: duplicate env var "${env}"`);
      envNames.add(env);
    } else if (f.envSuffix ?? f.envVar) {
      throw new Error(`${where}: config field "${f.name}" must not declare an env var`);
    }
    if (!t.portal.groups.some((g) => g.id === f.group)) throw new Error(`${where}: field "${f.name}" references unknown portal group "${f.group}"`);
    if (f.type === 'select' && !f.options?.length) throw new Error(`${where}: select field "${f.name}" declares no options`);
  }
  for (const [variant, strategy] of authenticationStrategies(t)) {
    for (const c of strategy.credentialFields) {
      if (!fieldNames.has(c)) throw new Error(`${where}: ${variant} credentialField "${c}" is not a declared configuration field`);
    }
    if (strategy.credentialModel === 'none' && strategy.credentialFields.length > 0) {
      throw new Error(`${where}: ${variant} is anonymous but declares credential fields`);
    }
    if (strategy.credentialModel !== 'none' && strategy.credentialFields.length === 0) {
      throw new Error(`${where}: ${variant} is credentialed but declares no credential field`);
    }
    if (strategy.storageStateReuse && !strategy.storageStatePath) {
      throw new Error(`${where}: ${variant} reuses storage state but declares no storageStatePath`);
    }
  }
  for (const f of t.configuration) assertConditionIsDecidable(where, `field "${f.name}"`, f.visibleWhen);
  for (const r of t.validation) {
    if (r.field !== '*' && !fieldNames.has(r.field)) throw new Error(`${where}: validation rule "${r.id}" targets unknown field "${r.field}"`);
    if (r.rule === 'pattern' && !r.pattern) throw new Error(`${where}: validation rule "${r.id}" is a pattern rule with no pattern`);
    if (r.rule === 'one-of' && !r.options?.length) throw new Error(`${where}: validation rule "${r.id}" is a one-of rule with no options`);
    assertConditionIsDecidable(where, `validation rule "${r.id}"`, r.appliesWhen);
  }
  if (!t.runtime.adapterInterfaces.includes(t.runtime.primaryAdapterInterface)) {
    throw new Error(`${where}: primaryAdapterInterface "${t.runtime.primaryAdapterInterface}" is not in adapterInterfaces`);
  }
  const target = t.configuration.find((f) => f.name === t.primaryTargetField);
  if (!target) throw new Error(`${where}: primaryTargetField "${t.primaryTargetField}" is not a declared configuration field`);
  if (target.storage !== 'env') throw new Error(`${where}: primaryTargetField "${t.primaryTargetField}" must be an env slot`);
  if (target.visibleWhen) throw new Error(`${where}: primaryTargetField "${t.primaryTargetField}" must be unconditional — every package needs a target address`);
}

/** The env var that addresses the target for this template. */
export function primaryTargetEnvVar(template: ApplicationTemplate): string {
  const field = template.configuration.find((f) => f.name === template.primaryTargetField);
  // Unreachable for a registered template — the registration guard proves the field exists.
  if (!field) throw new Error(`application template "${template.id}" has no primary target field`);
  return envVarNameFor(template, field);
}

/**
 * A condition with no clause is always true, which silently turns a conditional slot into an
 * unconditional one — the kind of drift that only surfaces as an unexpected env var in a
 * customer's package. Refuse it at registration.
 */
function assertConditionIsDecidable(where: string, what: string, condition: VisibilityCondition | undefined): void {
  for (let c = condition; c; c = c.and) {
    if (c.equals === undefined && c.notEquals === undefined && c.oneOf === undefined) {
      throw new Error(`${where}: ${what} has a condition on "${c.path}" with no equals/notEquals/oneOf clause`);
    }
  }
}

/** The default strategy plus every declared variant, each labelled for error messages. */
function authenticationStrategies(t: ApplicationTemplate): readonly (readonly [string, AuthenticationStrategy])[] {
  return [
    ['default authentication', t.authentication] as const,
    ...Object.entries(t.authenticationVariants ?? {}).map(([k, v]) => [`authentication variant "${k}"`, v] as const),
  ];
}

/**
 * The authentication strategy that applies to a tenant's declared context.
 *
 * A variant matching the declared `authenticationType` wins; otherwise the template's default
 * applies. This is the ONE place the mechanism is decided — the generator, the portal and the
 * Execution Plane all call it rather than re-deriving it.
 */
export function resolveAuthentication(template: ApplicationTemplate, context: ApplicationContext): AuthenticationStrategy {
  const declared = context.authenticationType;
  const variant = declared ? template.authenticationVariants?.[declared] : undefined;
  return variant ?? template.authentication;
}

// ── Resolution helpers (pure, shared by the generator, the portal and the EP) ─

/** The env var a field occupies for a given template. Empty for operational-config fields. */
export function envVarNameFor(template: ApplicationTemplate, field: ApplicationConfigField): string {
  if (field.storage !== 'env') return '';
  return field.envVar ?? `${template.envPrefix}_${field.envSuffix}`;
}

/** Read a dotted path out of the declared context. Returns `undefined` for a missing branch. */
export function readContextPath(context: ApplicationContext, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    context as unknown,
  );
}

/** Whether a visibility condition holds for the declared context. No condition = always. */
export function conditionHolds(condition: VisibilityCondition | undefined, context: ApplicationContext): boolean {
  if (!condition) return true;
  const actual = readContextPath(context, condition.path);
  const clause =
    condition.equals !== undefined ? actual === condition.equals
      : condition.notEquals !== undefined ? actual !== condition.notEquals
        : condition.oneOf !== undefined ? condition.oneOf.includes(actual as string | number | boolean)
          : true;
  return clause && conditionHolds(condition.and, context);
}

/** A configuration field with its env var resolved — the shape the generator emits. */
export interface ResolvedConfigField extends ApplicationConfigField {
  /** Present only for `env` storage. */
  readonly envVar?: string;
  /** The template that contributed this field (a tenant may select several). */
  readonly templateId: string;
}

/**
 * The configuration slots a template contributes for a given declared context, in portal order.
 * Conditional fields (e.g. the TOTP slot) are included only when their condition holds.
 */
export function resolveConfigFields(template: ApplicationTemplate, context: ApplicationContext): readonly ResolvedConfigField[] {
  return template.configuration
    .filter((f) => conditionHolds(f.visibleWhen, context))
    .map((f) => {
      const env = envVarNameFor(template, f);
      return { ...f, ...(env ? { envVar: env } : {}), templateId: template.id } as ResolvedConfigField;
    })
    .sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : 1));
}

/**
 * The slots for EVERY template a tenant declared, primary first, each slot appearing once.
 * De-duplication is by env var for env slots and by name for operational config: two templates may
 * legitimately describe the same slot (`TEST_BASE_URL`, `browser`), and a package must define it once.
 */
export function resolveAllConfigFields(
  templates: readonly ApplicationTemplate[],
  context: ApplicationContext,
): readonly ResolvedConfigField[] {
  const seen = new Set<string>();
  const out: ResolvedConfigField[] = [];
  for (const t of templates) {
    for (const f of resolveConfigFields(t, context)) {
      const key = f.storage === 'env' ? `env:${f.envVar}` : `config:${f.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

/** A validation finding. Identical shape in the IP (onboarding) and the EP (start-up guard). */
export interface ApplicationValidationIssue {
  readonly ruleId: string;
  readonly field: string;
  readonly severity: 'error' | 'warning';
  readonly detail: string;
}

const URL_PREDICATE: Record<'url' | 'https-url', (v: string) => boolean> = {
  url: (v) => { try { new URL(v); return true; } catch { return false; } },
  'https-url': (v) => { try { return new URL(v).protocol === 'https:'; } catch { return false; } },
};

/**
 * Evaluate a template's validation rules against a set of values.
 *
 * `values` maps LOGICAL field names to whatever the caller holds — at onboarding that is the
 * declared configuration; in the Execution Plane it is the resolved `.env` plus operational config.
 * The rule set is the same object in both places, which is the point: a package that passes here
 * cannot fail there for a reason the Intelligence Plane could have caught.
 *
 * A `<FILL: …>` placeholder is treated as ABSENT. It is the generator's marker for "the operator
 * has not completed this yet", and accepting it as a value is how an unconfigured package reaches
 * a customer's first run looking valid.
 */
export function evaluateApplicationValidation(
  template: ApplicationTemplate,
  context: ApplicationContext,
  values: Readonly<Record<string, unknown>>,
  scope: Exclude<ValidationScope, 'both'>,
): readonly ApplicationValidationIssue[] {
  const visible = new Set(resolveConfigFields(template, context).map((f) => f.name));
  const issues: ApplicationValidationIssue[] = [];
  const push = (r: ApplicationValidationRule): void => {
    issues.push({ ruleId: r.id, field: r.field, severity: r.severity, detail: r.detail });
  };

  for (const rule of template.validation) {
    if (rule.scope !== 'both' && rule.scope !== scope) continue;
    if (!conditionHolds(rule.appliesWhen, context)) continue;
    if (rule.field !== '*' && !visible.has(rule.field)) continue;

    const raw = values[rule.field];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    const present = value !== undefined && value !== null && value !== '' && !isPlaceholder(value);

    switch (rule.rule) {
      case 'required':
        if (!present) push(rule);
        break;
      case 'url':
      case 'https-url':
        if (present && !(typeof value === 'string' && URL_PREDICATE[rule.rule](value))) push(rule);
        break;
      case 'pattern':
        if (present && !(typeof value === 'string' && new RegExp(rule.pattern!).test(value))) push(rule);
        break;
      case 'one-of':
        if (present && !rule.options!.includes(String(value))) push(rule);
        break;
      case 'positive-number':
        if (present && !(Number(value) > 0)) push(rule);
        break;
      case 'env-reference':
        // The package must name an env var, never inline a value.
        if (present && !(typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/.test(value))) push(rule);
        break;
      case 'vault-reference':
        if (present && !(typeof value === 'string' && value.startsWith('vault://'))) push(rule);
        break;
      default: {
        const unreachable: never = rule.rule;
        throw new Error(`unsupported validation rule: ${String(unreachable)}`);
      }
    }
  }
  return issues;
}

/** `<FILL: …>` is the generator's "not completed yet" marker — never a value. */
export function isPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('<FILL:');
}
