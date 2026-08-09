/**
 * Platform configuration schema (ADR-0060).
 *
 * TRACEABILITY: 17-deployment-topology.md (R-17.15 cloud selection is configuration) · ADR-0060
 *
 * The single strongly-typed description of everything the Intelligence Plane reads from its
 * environment. Backend selectors (`storage`/`secret`/`state`) are what make one image behave as a
 * laptop, a Docker container, or an Azure Container App WITHOUT a code change — they are configuration,
 * never a build-time or code-level decision. Secrets are NOT modelled here (they never appear in a
 * schema or a log); they are resolved through the Secret Provider.
 */
import { z } from 'zod';

/** The deployment environment name. Affects diagnostics/logging only — never a security control. */
export const EnvironmentName = z.enum(['local', 'development', 'qa', 'uat', 'production']);
export type EnvironmentName = z.infer<typeof EnvironmentName>;

export const StorageBackend = z.enum(['filesystem', 'memory']);
export type StorageBackend = z.infer<typeof StorageBackend>;

export const SecretBackend = z.enum(['env', 'file', 'memory']);
export type SecretBackend = z.infer<typeof SecretBackend>;

export const StateBackend = z.enum(['memory', 'redis']);
export type StateBackend = z.infer<typeof StateBackend>;

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevel>;

/**
 * The resolved, validated platform configuration. Produced ONCE at startup from the environment
 * snapshot. Every field has a safe default so the platform boots locally with an empty environment
 * (except genuinely required secrets, which are the Secret Provider's concern, not this schema's).
 */
export const PlatformConfigSchema = z
  .object({
    environment: EnvironmentName.default('local'),

    server: z.object({
      port: z.coerce.number().int().min(1).max(65535).default(8080),
      host: z.string().min(1).default('0.0.0.0'),
      basePath: z.string().default(''),
    }),

    state: z.object({
      dir: z.string().min(1).default('/state'),
    }),

    storage: z.object({
      backend: StorageBackend.default('filesystem'),
      root: z.string().min(1).default('/state'),
    }),

    secret: z.object({
      backend: SecretBackend.default('env'),
      dir: z.string().min(1).default('/state/secrets'),
    }),

    distributed: z.object({
      backend: StateBackend.default('memory'),
      redisUrl: z.string().optional(),
      keyPrefix: z.string().default('dbiz'),
    }),

    logging: z.object({
      level: LogLevel.default('info'),
    }),

    registration: z.object({
      endpoint: z.string().default('https://gateway.dbiz.example/v1/register'),
      contractVersion: z.string().default('1.0.0'),
    }),
  })
  // The distributed=redis backend requires a URL — fail fast rather than "connect to nothing".
  .refine((c) => c.distributed.backend !== 'redis' || Boolean(c.distributed.redisUrl), {
    message: 'distributed.backend=redis requires distributed.redisUrl (set REDIS_URL)',
    path: ['distributed', 'redisUrl'],
  });

export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;
