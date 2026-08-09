/**
 * Tenant runtime — physical isolation of storage, queues and configuration, plus a
 * secret vault with rotation and revocation.
 *
 * TRACEABILITY
 *   Architecture : 07-tenant-isolation.md · 08-security-model.md §6 · 21 §7a
 *   ADR          : ADR-0010 (tenant storage layout), ADR-0008 (key custody)
 *   Criteria     : C-07.1 (every location from the canonical constructor)
 *                  C-07.3 (constructor rejects absent, malformed, traversing, absolute ids)
 *                  C-07.7 (a cache entry is never shared across tenants)
 *                  C-07.12 (one tenant cannot exhaust another's quota)
 *
 * ISOLATION IS PHYSICAL, NOT FILTERED.
 * A tenant identifier filtered in application code fails OPEN: any read path that
 * forgets the filter returns everything. A path that requires the identifier fails
 * CLOSED: omitting it yields no path and therefore no data. Every store here obtains
 * its location from one constructor, and that constructor cannot be bypassed.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, isAbsolute, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';

export type PathRejection = 'absent' | 'malformed' | 'traversal' | 'absolute' | 'unregistered';

export class TenantPathError extends Error {
  readonly reason: PathRejection;
  constructor(reason: PathRejection, detail: string) {
    super(`tenant path rejected (${reason}): ${detail}`);
    this.name = 'TenantPathError';
    this.reason = reason;
  }
}

/**
 * THE canonical tenant path constructor. Every tenant-scoped location comes from here.
 *
 * Layout is `tenant / capability / run / artefact` (ADR-0010). Tenant leads because
 * purge scope follows path prefix: any other ordering makes tenant-level purge a
 * full scan, which at hundreds of customers is expensive enough that it stops
 * being run.
 */
export class TenantPaths {
  private readonly root: string;
  private readonly registry: ReadonlySet<string>;

  constructor(root: string, registeredTenants: Iterable<string>) {
    this.root = root;
    this.registry = new Set(registeredTenants);
  }

  path(tenantId: string, capability?: string, runId?: string, artefact?: string): string {
    if (tenantId === undefined || tenantId === null || tenantId === '') {
      throw new TenantPathError('absent', 'tenantId is required');
    }
    if (isAbsolute(tenantId)) throw new TenantPathError('absolute', tenantId);
    if (tenantId.includes('..') || normalize(tenantId) !== tenantId) {
      throw new TenantPathError('traversal', tenantId);
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(tenantId)) throw new TenantPathError('malformed', tenantId);
    if (!this.registry.has(tenantId)) throw new TenantPathError('unregistered', tenantId);

    for (const segment of [capability, runId, artefact]) {
      if (segment === undefined) break;
      if (segment.includes('..') || isAbsolute(segment)) throw new TenantPathError('traversal', segment);
    }
    return join(this.root, tenantId, capability ?? '', runId ?? '', artefact ?? '');
  }

  /** Purge at any level, by prefix. No scan of unrelated data (R-17.19). */
  purge(tenantId: string, capability?: string, runId?: string): void {
    const target = this.path(tenantId, capability, runId);
    rmSync(target, { recursive: true, force: true });
  }
}

/** Per-tenant storage. Obtains every location from the constructor above. */
export class TenantStorage {
  constructor(private readonly paths: TenantPaths) {}

  write(tenantId: string, capability: string, runId: string, artefact: string, content: string): void {
    const p = this.paths.path(tenantId, capability, runId, artefact);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content, 'utf8');
  }

  read(tenantId: string, capability: string, runId: string, artefact: string): string | null {
    const p = this.paths.path(tenantId, capability, runId, artefact);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  }

  /** Lists only within the tenant's own prefix — a listing cannot cross tenants. */
  list(tenantId: string, capability?: string): readonly string[] {
    const p = this.paths.path(tenantId, capability);
    return existsSync(p) ? readdirSync(p) : [];
  }
}

/** Per-tenant queue. Separate instances, never a shared queue with a tenant field. */
export class TenantQueues {
  private readonly queues = new Map<string, string[]>();

  constructor(private readonly paths: TenantPaths) {}

  private keyFor(tenantId: string): string {
    // Routed through the path constructor so an unregistered or malformed tenant
    // cannot obtain a queue at all.
    this.paths.path(tenantId);
    return tenantId;
  }

  enqueue(tenantId: string, item: string): void {
    const key = this.keyFor(tenantId);
    const q = this.queues.get(key) ?? [];
    q.push(item);
    this.queues.set(key, q);
  }

  drain(tenantId: string): readonly string[] {
    const key = this.keyFor(tenantId);
    const q = this.queues.get(key) ?? [];
    this.queues.set(key, []);
    return q;
  }

  depth(tenantId: string): number {
    return (this.queues.get(this.keyFor(tenantId)) ?? []).length;
  }
}

/** Per-tenant configuration. No global fallback that could leak another tenant's value. */
export class TenantConfiguration {
  private readonly config = new Map<string, Map<string, string>>();

  constructor(private readonly paths: TenantPaths) {}

  set(tenantId: string, key: string, value: string): void {
    this.paths.path(tenantId);
    const c = this.config.get(tenantId) ?? new Map();
    c.set(key, value);
    this.config.set(tenantId, c);
  }

  get(tenantId: string, key: string): string | null {
    this.paths.path(tenantId);
    return this.config.get(tenantId)?.get(key) ?? null;
  }
}

/** Per-tenant quota. One tenant cannot exhaust another's capacity (C-07.12). */
export class TenantQuotas {
  private readonly used = new Map<string, number>();
  constructor(private readonly limit: number) {}

  consume(tenantId: string, amount = 1): boolean {
    const current = this.used.get(tenantId) ?? 0;
    if (current + amount > this.limit) return false;
    this.used.set(tenantId, current + amount);
    return true;
  }

  remaining(tenantId: string): number {
    return this.limit - (this.used.get(tenantId) ?? 0);
  }
}

// ── Vault ───────────────────────────────────────────────────────────────────

export interface SecretVersion {
  readonly version: number;
  readonly value: string;
  readonly createdAt: Date;
  readonly revoked: boolean;
}

/**
 * Secret vault with rotation and revocation.
 *
 * Rotation keeps the PREVIOUS version readable until it is explicitly revoked, so a
 * rotation does not interrupt work already in flight (E-9). An atomic swap would
 * break every execution holding the old secret at that instant — which is why
 * rotation and revocation are separate operations here.
 */
export class TenantVault {
  private readonly secrets = new Map<string, SecretVersion[]>();

  constructor(private readonly paths: TenantPaths) {}

  private key(tenantId: string, name: string): string {
    this.paths.path(tenantId);
    return `${tenantId}::${name}`;
  }

  store(tenantId: string, name: string, value: string): SecretVersion {
    const k = this.key(tenantId, name);
    const versions = this.secrets.get(k) ?? [];
    const v: SecretVersion = { version: versions.length + 1, value, createdAt: new Date(), revoked: false };
    versions.push(v);
    this.secrets.set(k, versions);
    return v;
  }

  /** Current, non-revoked version. */
  retrieve(tenantId: string, name: string): SecretVersion | null {
    const versions = this.secrets.get(this.key(tenantId, name)) ?? [];
    for (let i = versions.length - 1; i >= 0; i -= 1) {
      const v = versions[i]!;
      if (!v.revoked) return v;
    }
    return null;
  }

  /** Rotate: mint a new version. The previous remains readable until revoked. */
  rotate(tenantId: string, name: string): SecretVersion {
    return this.store(tenantId, name, `s_${randomBytes(18).toString('base64url')}`);
  }

  retrieveVersion(tenantId: string, name: string, version: number): SecretVersion | null {
    const versions = this.secrets.get(this.key(tenantId, name)) ?? [];
    const v = versions.find((x) => x.version === version);
    return v && !v.revoked ? v : null;
  }

  revoke(tenantId: string, name: string, version: number): boolean {
    const k = this.key(tenantId, name);
    const versions = this.secrets.get(k) ?? [];
    const idx = versions.findIndex((x) => x.version === version);
    if (idx === -1) return false;
    versions[idx] = { ...versions[idx]!, revoked: true };
    this.secrets.set(k, versions);
    return true;
  }
}
