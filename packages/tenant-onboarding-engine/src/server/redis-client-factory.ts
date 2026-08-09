/**
 * Redis client factory — the last unwired seam in the ADR-0060 provider platform (milestone M-b).
 *
 * TRACEABILITY
 *   Architecture : 17-deployment-topology.md (R-17.12 cloud services behind interfaces) · ADR-0060 §4
 *   Limitation   : KNOWN_LIMITATIONS L-1 ("Redis not yet consumed"), L-2 (single replica only)
 *
 * WHAT WAS MISSING, AND WHY IT BLOCKED SCALE-OUT.
 * `bootstrapPlatform()` selects `RedisDistributedStateProvider` when `distributed.backend=redis`, but
 * only if a `redisClientFactory` is supplied — and the production entrypoint called `bootstrapPlatform()`
 * with no options at all. Selecting the redis backend therefore THREW at startup, so the platform could
 * only ever run the in-memory provider, which is correct at exactly one replica. That is why
 * `containerapp.yaml` pins `minReplicas: maxReplicas: 1`: not a policy choice, a code gap.
 *
 * WHY THE DEPENDENCY IS LOADED DYNAMICALLY AND NOT DECLARED.
 * `@dbiz/platform-providers` deliberately takes an INJECTED `RedisLikeClient` port so the package needs
 * no `ioredis` dependency and stays provider-agnostic and fully testable. Declaring `ioredis` as a hard
 * dependency of this package would undo that: every deployment — including the single-replica one that
 * uses no Redis at all — would carry the driver and its transitive supply-chain surface, in a repository
 * that hand-maintains advisory overrides. So it is resolved at RUNTIME, and ONLY when configuration has
 * actually selected the redis backend.
 *
 * THE FAILURE IS LOUD. If Redis is selected and the driver is absent, this refuses with an actionable
 * message rather than silently degrading to in-memory state. Silent degradation is the dangerous
 * outcome: nonce replay protection, distributed locks and rate-limit counters would each become
 * per-replica, so the platform would look healthy at N replicas while quietly losing the guarantees
 * that make N replicas safe — including the single-use gate on registration credentials.
 */
import type { RedisLikeClient } from '@dbiz/platform-providers';

/** Raised when the redis backend is configured but cannot be constructed. */
export class RedisUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'RedisUnavailableError'; }
}

/**
 * The subset of an ioredis instance the provider port needs. `ioredis` satisfies this structurally,
 * so no adapter shim is required — the port was designed against this shape.
 */
interface IoredisConstructor {
  new (url: string, options?: Record<string, unknown>): RedisLikeClient & {
    on(event: string, handler: (...args: unknown[]) => void): unknown;
    quit(): Promise<unknown>;
  };
}

/**
 * Build a `redisClientFactory` for `bootstrapPlatform`.
 *
 * `onError` receives connection errors so the caller can log them through the platform logger; an
 * unhandled 'error' event on an ioredis client is a process-level crash, which must not be how a
 * transient Redis blip takes down the API.
 */
export async function createRedisClientFactory(
  onError: (error: Error) => void,
): Promise<(redisUrl: string) => RedisLikeClient> {
  let Redis: IoredisConstructor;
  try {
    // The specifier is held in a variable ON PURPOSE. A literal `import('ioredis')` is resolved by
    // TypeScript at COMPILE time, so the build would fail wherever the optional driver is absent —
    // which is every deployment that does not use Redis, and this repository's own CI. Indirecting it
    // keeps the dependency genuinely optional: resolved at runtime, only when configuration asks for it.
    const specifier = 'ioredis';
    const mod = await import(specifier) as unknown as { default?: IoredisConstructor } & IoredisConstructor;
    Redis = (mod.default ?? mod) as IoredisConstructor;
  } catch (cause) {
    throw new RedisUnavailableError(
      'DBIZ_STATE_BACKEND=redis (or REDIS_URL) selects the Redis distributed-state backend, but the '
      + '`ioredis` driver is not installed. Install it in the deployment image (`pnpm add ioredis` in '
      + '@dbiz/tenant-onboarding-engine), or set DBIZ_STATE_BACKEND=memory — which is correct ONLY at a '
      + `single replica (KNOWN_LIMITATIONS L-2). Underlying cause: ${(cause as Error).message}`,
    );
  }

  return (redisUrl: string): RedisLikeClient => {
    const client = new Redis(redisUrl, {
      // Fail a command rather than queue it forever when the server is unreachable: an unbounded
      // offline queue turns a Redis outage into unbounded memory growth in the API process.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    client.on('error', (...args: unknown[]) => {
      const err = args[0];
      onError(err instanceof Error ? err : new Error(String(err)));
    });
    return client;
  };
}

/**
 * Whether the environment has selected the Redis backend.
 *
 * Mirrors the Configuration Provider's own rule — setting `REDIS_URL` selects redis implicitly — so the
 * entrypoint decides whether to load the driver using the SAME condition the provider uses to demand
 * it. Two different rules here would produce "configured for redis, started without it".
 */
export function redisSelected(env: Readonly<Record<string, string | undefined>>): boolean {
  return env['DBIZ_STATE_BACKEND'] === 'redis' || Boolean(env['REDIS_URL']);
}
