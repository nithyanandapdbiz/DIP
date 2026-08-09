/**
 * Configuration Provider (ADR-0060) — the SINGLE reader of the process environment.
 *
 * TRACEABILITY: 17-deployment-topology.md (R-17.15) · ADR-0060 §4
 *
 * No other code in the platform reads `process.env`. This provider takes an environment snapshot
 * (defaulting to `process.env`, the one and only real read), maps flat KEY=VALUE variables onto the
 * typed schema, validates ONCE with fail-fast aggregated diagnostics, and exposes:
 *   - `config`   — the resolved, immutable default+environment configuration.
 *   - `resolve(tenant?, execution?)` — the precedence chain Default → Environment → Tenant → Execution,
 *     where the tenant and execution layers may override only a SAFE, non-infrastructure subset. They
 *     can never change a backend selector or a secret — those are platform-operator decisions.
 *
 * A misconfigured boot is loud and precise, never a silent default.
 */
import { PlatformConfigSchema, type PlatformConfig } from './schema.js';

/** A read-only view of the environment. Injected in tests; defaults to the real process environment. */
export type EnvSnapshot = Readonly<Record<string, string | undefined>>;

/** Thrown when the environment does not satisfy the schema. Carries every issue, not just the first. */
export class ConfigurationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`invalid platform configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigurationError';
  }
}

/** The only place in the platform that a flat environment maps onto the typed configuration shape. */
function mapEnvToShape(env: EnvSnapshot): Record<string, unknown> {
  const pick = (k: string): string | undefined => {
    const v = env[k];
    return v === undefined || v === '' ? undefined : v;
  };
  return {
    environment: pick('DBIZ_ENV'),
    server: {
      port: pick('PORT'),
      host: pick('DBIZ_HOST'),
      basePath: pick('DBIZ_BASE_PATH'),
    },
    state: { dir: pick('DBIZ_STATE_DIR') },
    storage: {
      backend: pick('DBIZ_STORAGE_BACKEND'),
      root: pick('DBIZ_STORAGE_ROOT') ?? pick('DBIZ_STATE_DIR'),
    },
    secret: {
      backend: pick('DBIZ_SECRET_BACKEND'),
      dir: pick('DBIZ_SECRET_DIR'),
    },
    distributed: {
      backend: pick('DBIZ_STATE_BACKEND') ?? (pick('REDIS_URL') ? 'redis' : undefined),
      redisUrl: pick('REDIS_URL'),
      keyPrefix: pick('DBIZ_KEY_PREFIX'),
    },
    logging: { level: pick('DBIZ_LOG_LEVEL') },
    registration: {
      endpoint: pick('REGISTRATION_ENDPOINT'),
      contractVersion: pick('INTELLIGENCE_CONTRACT_VERSION'),
    },
  };
}

/** Fields a tenant or execution request MAY override. Deliberately excludes every backend + secret. */
export interface ConfigOverrides {
  readonly logging?: { readonly level?: PlatformConfig['logging']['level'] };
  readonly registration?: { readonly contractVersion?: string };
}

/** The effective configuration for one request after tenant/execution layering. Immutable. */
export type EffectiveConfig = PlatformConfig;

export class ConfigurationProvider {
  private readonly _config: PlatformConfig;
  private readonly _env: EnvSnapshot;

  private constructor(config: PlatformConfig, env: EnvSnapshot) {
    this._config = Object.freeze(config);
    this._env = Object.freeze({ ...env });
  }

  /**
   * Build and validate from an environment snapshot. The default argument `process.env` is the one
   * real environment read in the entire package — every other consumer receives typed configuration
   * or, for secret material, the captured snapshot exposed via `environmentSnapshot` (so the Secret
   * Provider never touches `process.env` itself).
   */
  static fromEnvironment(env: EnvSnapshot = process.env): ConfigurationProvider {
    const parsed = PlatformConfigSchema.safeParse(mapEnvToShape(env));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
      throw new ConfigurationError(issues);
    }
    return new ConfigurationProvider(parsed.data, env);
  }

  /** The resolved Default → Environment configuration (immutable). */
  get config(): PlatformConfig {
    return this._config;
  }

  /**
   * The captured environment snapshot, so the Secret Provider (env backend) can resolve secrets
   * WITHOUT itself reading `process.env`. This keeps exactly one `process.env` call site in the package.
   */
  get environmentSnapshot(): EnvSnapshot {
    return this._env;
  }

  /**
   * Resolve the full precedence chain for a request: Default → Environment (already in `config`)
   * → Tenant → Execution. Only the safe subset is layerable; backends and secrets never change.
   */
  resolve(tenant?: ConfigOverrides, execution?: ConfigOverrides): EffectiveConfig {
    const base = this._config;
    const level = execution?.logging?.level ?? tenant?.logging?.level ?? base.logging.level;
    const contractVersion =
      execution?.registration?.contractVersion ??
      tenant?.registration?.contractVersion ??
      base.registration.contractVersion;
    return Object.freeze({
      ...base,
      logging: { ...base.logging, level },
      registration: { ...base.registration, contractVersion },
    });
  }
}
