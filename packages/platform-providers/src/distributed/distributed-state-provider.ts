/**
 * Distributed State Provider (ADR-0060) — the mutable coordination state that must NOT live on Azure Files.
 *
 * TRACEABILITY: 17-deployment-topology.md (R-17.12 cloud services behind interfaces) · 08-security-model.md · ADR-0060 §4
 *
 * This is the seam that makes the Intelligence Plane horizontally scalable within the approved estate:
 * with the Redis backend selected by configuration, nonce/session/lock/rate-limit state is shared across
 * replicas, so `maxReplicas > 1` becomes correct. (Flipping the replica count is a separate, gated
 * topology change — this ADR wires the seam only.)
 *
 * Redis holds ONLY: keyed values with TTL, distributed locks, counters (rate-limit), sessions, and
 * single-use nonces (replay protection). NEVER secrets, customer data, API keys, or large evidence.
 * Every key is TENANT-PARTITIONED by prefix, so one tenant can never read another's coordination state.
 *
 * The package adds no `ioredis` dependency: `RedisDistributedStateProvider` talks to an INJECTED minimal
 * client port (`RedisLikeClient`), keeping the platform provider-agnostic and fully testable. The concrete
 * ioredis wiring is a thin adapter constructed by the entrypoint when `REDIS_URL` is configured.
 */
import type { TenantContext } from '../tenant/tenant-context.js';
import { tenantPartition } from '../tenant/tenant-context.js';

/** A distributed lock handle. `release()` is idempotent and only releases a lock this holder owns. */
export interface LockHandle {
  readonly key: string;
  release(): Promise<void>;
}

export interface DistributedStateProvider {
  readonly backend: string;

  /** Keyed value with optional TTL (seconds). */
  set(ctx: TenantContext, namespace: string, key: string, value: string, ttlSeconds?: number): Promise<void>;
  get(ctx: TenantContext, namespace: string, key: string): Promise<string | undefined>;
  del(ctx: TenantContext, namespace: string, key: string): Promise<void>;

  /** Acquire a lock (mutual exclusion). Returns undefined if already held by someone else. */
  acquireLock(ctx: TenantContext, key: string, ttlSeconds: number): Promise<LockHandle | undefined>;

  /** Increment a counter with a fixed TTL window (rate limiting). Returns the new count. */
  incr(ctx: TenantContext, key: string, ttlSeconds: number): Promise<number>;

  /**
   * Record a nonce as seen. Returns true the FIRST time (accept), false thereafter (replay). The single
   * source of truth for replay protection across replicas.
   */
  seenNonce(ctx: TenantContext, nonce: string, ttlSeconds: number): Promise<boolean>;
}

/** The minimal Redis surface the provider needs. An ioredis instance satisfies this structurally. */
export interface RedisLikeClient {
  set(key: string, value: string, mode?: 'NX', ex?: 'EX', ttl?: number): Promise<'OK' | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
}

/** Build the fully-qualified, tenant-partitioned key. Prefix + tenant + namespace guarantees isolation. */
function qualify(prefix: string, ctx: TenantContext, namespace: string, key: string): string {
  return `${prefix}/${tenantPartition(ctx)}/${namespace}/${key}`;
}

/** A clock, injectable for deterministic TTL tests. */
export type Clock = () => number;

// ── In-memory implementation (default; correct at one replica and for local dev) ─────────────────
export class InMemoryDistributedStateProvider implements DistributedStateProvider {
  readonly backend = 'memory';
  private readonly kv = new Map<string, { value: string; expiresAt: number | null }>();
  private readonly locks = new Map<string, number>();
  constructor(private readonly prefix = 'dbiz', private readonly now: Clock = () => Date.now()) {}

  private live(k: string): { value: string; expiresAt: number | null } | undefined {
    const e = this.kv.get(k);
    if (!e) return undefined;
    if (e.expiresAt !== null && e.expiresAt <= this.now()) { this.kv.delete(k); return undefined; }
    return e;
  }
  async set(ctx: TenantContext, ns: string, key: string, value: string, ttl?: number): Promise<void> {
    this.kv.set(qualify(this.prefix, ctx, ns, key), { value, expiresAt: ttl ? this.now() + ttl * 1000 : null });
  }
  async get(ctx: TenantContext, ns: string, key: string): Promise<string | undefined> {
    return this.live(qualify(this.prefix, ctx, ns, key))?.value;
  }
  async del(ctx: TenantContext, ns: string, key: string): Promise<void> {
    this.kv.delete(qualify(this.prefix, ctx, ns, key));
  }
  async acquireLock(ctx: TenantContext, key: string, ttl: number): Promise<LockHandle | undefined> {
    const k = qualify(this.prefix, ctx, 'lock', key);
    const exp = this.locks.get(k);
    if (exp !== undefined && exp > this.now()) return undefined;
    this.locks.set(k, this.now() + ttl * 1000);
    return { key: k, release: async () => { this.locks.delete(k); } };
  }
  async incr(ctx: TenantContext, key: string, ttl: number): Promise<number> {
    const k = qualify(this.prefix, ctx, 'rate', key);
    const e = this.live(k);
    const next = e ? String(Number(e.value) + 1) : '1';
    this.kv.set(k, { value: next, expiresAt: e?.expiresAt ?? this.now() + ttl * 1000 });
    return Number(next);
  }
  async seenNonce(ctx: TenantContext, nonce: string, ttl: number): Promise<boolean> {
    const k = qualify(this.prefix, ctx, 'nonce', nonce);
    if (this.live(k)) return false;
    this.kv.set(k, { value: '1', expiresAt: this.now() + ttl * 1000 });
    return true;
  }
}

// ── Redis implementation (backed by an injected client port; enables scale-out) ──────────────────
export class RedisDistributedStateProvider implements DistributedStateProvider {
  readonly backend = 'redis';
  constructor(private readonly client: RedisLikeClient, private readonly prefix = 'dbiz') {}

  async set(ctx: TenantContext, ns: string, key: string, value: string, ttl?: number): Promise<void> {
    const k = qualify(this.prefix, ctx, ns, key);
    if (ttl) await this.client.set(k, value, undefined, 'EX', ttl);
    else await this.client.set(k, value);
  }
  async get(ctx: TenantContext, ns: string, key: string): Promise<string | undefined> {
    const v = await this.client.get(qualify(this.prefix, ctx, ns, key));
    return v === null ? undefined : v;
  }
  async del(ctx: TenantContext, ns: string, key: string): Promise<void> {
    await this.client.del(qualify(this.prefix, ctx, ns, key));
  }
  async acquireLock(ctx: TenantContext, key: string, ttl: number): Promise<LockHandle | undefined> {
    const k = qualify(this.prefix, ctx, 'lock', key);
    const ok = await this.client.set(k, '1', 'NX', 'EX', ttl); // atomic SET NX EX
    if (ok !== 'OK') return undefined;
    return { key: k, release: async () => { await this.client.del(k); } };
  }
  async incr(ctx: TenantContext, key: string, ttl: number): Promise<number> {
    const k = qualify(this.prefix, ctx, 'rate', key);
    // Establish the counter AND its expiry atomically with SET NX EX on the first hit,
    // so no path can leave a counter without a TTL. The previous INCR-then-EXPIRE was two
    // commands: a failed/lost EXPIRE left an immortal key that never reset the window —
    // a permanent rate-limit lockout for that tenant (a single-replica DoS, not scale-out).
    const created = await this.client.set(k, '1', 'NX', 'EX', ttl);
    if (created === 'OK') return 1;
    const n = await this.client.incr(k);
    // Defence against the sub-millisecond race where the key expired between the SET NX and
    // the INCR: INCR would then recreate it with no TTL. n === 1 means INCR created it — re-arm.
    if (n === 1) await this.client.expire(k, ttl);
    return n;
  }
  async seenNonce(ctx: TenantContext, nonce: string, ttl: number): Promise<boolean> {
    const k = qualify(this.prefix, ctx, 'nonce', nonce);
    return (await this.client.set(k, '1', 'NX', 'EX', ttl)) === 'OK';
  }
}
