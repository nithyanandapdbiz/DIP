/**
 * Storage Provider (ADR-0060) — the one interface all durable artefact storage goes through.
 *
 * TRACEABILITY: 17-deployment-topology.md (R-17.16-20 partitioned, interface-addressable) · 06/07 · ADR-0060
 *
 * Business code addresses LOGICAL keys under a tenant partition; it never calls `node:fs` and never
 * names a cloud primitive. `FilesystemStorageProvider` serves BOTH a local folder and the Azure Files
 * SMB mount — the same implementation, its root chosen by configuration — which is precisely why one
 * image runs everywhere. `InMemoryStorageProvider` serves tests and local-no-disk runs.
 *
 * The canonical layout is `tenant/capability/run/artefact` (R-17.17), produced by ONE validated path
 * constructor (R-17.18) that rejects path traversal and absolute escapes and case-folds the tenant slug.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { TenantContext } from '../tenant/tenant-context.js';
import { tenantPartition } from '../tenant/tenant-context.js';

/** A logical artefact address within a tenant partition. Every segment is validated. */
export interface ArtefactKey {
  readonly capability: string;
  readonly run: string;
  readonly artefact: string;
}

export interface StorageProvider {
  /** Human-readable backend name (for diagnostics). */
  readonly backend: string;
  put(ctx: TenantContext, key: ArtefactKey, data: string | Uint8Array): Promise<void>;
  get(ctx: TenantContext, key: ArtefactKey): Promise<Uint8Array | undefined>;
  getText(ctx: TenantContext, key: ArtefactKey): Promise<string | undefined>;
  exists(ctx: TenantContext, key: ArtefactKey): Promise<boolean>;
  delete(ctx: TenantContext, key: ArtefactKey): Promise<void>;
  /** List artefact names under a tenant/capability/run prefix. */
  list(ctx: TenantContext, prefix: { capability: string; run: string }): Promise<readonly string[]>;
  /** Purge an entire tenant partition without scanning unrelated data (R-17.19). */
  purgeTenant(ctx: TenantContext): Promise<void>;
}

const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Reject any segment that could escape the partition (traversal, separators, absolute, empty). */
function validateSegment(name: string, value: string): string {
  if (!SEGMENT_RE.test(value) || value === '.' || value === '..') {
    throw new Error(`unsafe storage segment ${name}="${value}" — path traversal refused`);
  }
  return value;
}

/** The ONE path/key constructor: tenant/capability/run/artefact, traversal-safe (R-17.18). */
export function artefactPath(ctx: TenantContext, key: ArtefactKey): string[] {
  return [
    ...tenantPartition(ctx).split('/'),
    validateSegment('capability', key.capability),
    validateSegment('run', key.run),
    validateSegment('artefact', key.artefact),
  ];
}

// ── Filesystem implementation (local folder AND Azure Files SMB mount) ───────────────────────────
export class FilesystemStorageProvider implements StorageProvider {
  readonly backend = 'filesystem';
  constructor(private readonly root: string) {}

  private toPath(ctx: TenantContext, key: ArtefactKey): string {
    return join(this.root, ...artefactPath(ctx, key));
  }

  async put(ctx: TenantContext, key: ArtefactKey, data: string | Uint8Array): Promise<void> {
    const p = this.toPath(ctx, key);
    mkdirSync(p.slice(0, p.lastIndexOf(sep)), { recursive: true });
    writeFileSync(p, data);
  }
  async get(ctx: TenantContext, key: ArtefactKey): Promise<Uint8Array | undefined> {
    const p = this.toPath(ctx, key);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : undefined;
  }
  async getText(ctx: TenantContext, key: ArtefactKey): Promise<string | undefined> {
    const p = this.toPath(ctx, key);
    return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  }
  async exists(ctx: TenantContext, key: ArtefactKey): Promise<boolean> {
    return existsSync(this.toPath(ctx, key));
  }
  async delete(ctx: TenantContext, key: ArtefactKey): Promise<void> {
    const p = this.toPath(ctx, key);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  async list(ctx: TenantContext, prefix: { capability: string; run: string }): Promise<readonly string[]> {
    const dir = join(
      this.root,
      ...tenantPartition(ctx).split('/'),
      validateSegment('capability', prefix.capability),
      validateSegment('run', prefix.run),
    );
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
  }
  async purgeTenant(ctx: TenantContext): Promise<void> {
    const dir = join(this.root, ...tenantPartition(ctx).split('/'));
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

// ── In-memory implementation (tests / local-no-disk) ─────────────────────────────────────────────
export class InMemoryStorageProvider implements StorageProvider {
  readonly backend = 'memory';
  private readonly store = new Map<string, Uint8Array>();
  private flatKey(ctx: TenantContext, key: ArtefactKey): string {
    return artefactPath(ctx, key).join('/');
  }
  async put(ctx: TenantContext, key: ArtefactKey, data: string | Uint8Array): Promise<void> {
    this.store.set(this.flatKey(ctx, key), typeof data === 'string' ? new TextEncoder().encode(data) : data);
  }
  async get(ctx: TenantContext, key: ArtefactKey): Promise<Uint8Array | undefined> {
    return this.store.get(this.flatKey(ctx, key));
  }
  async getText(ctx: TenantContext, key: ArtefactKey): Promise<string | undefined> {
    const v = this.store.get(this.flatKey(ctx, key));
    return v ? new TextDecoder().decode(v) : undefined;
  }
  async exists(ctx: TenantContext, key: ArtefactKey): Promise<boolean> {
    return this.store.has(this.flatKey(ctx, key));
  }
  async delete(ctx: TenantContext, key: ArtefactKey): Promise<void> {
    this.store.delete(this.flatKey(ctx, key));
  }
  async list(ctx: TenantContext, prefix: { capability: string; run: string }): Promise<readonly string[]> {
    const base = [...tenantPartition(ctx).split('/'),
      validateSegment('capability', prefix.capability), validateSegment('run', prefix.run)].join('/') + '/';
    return [...this.store.keys()].filter((k) => k.startsWith(base)).map((k) => k.slice(base.length));
  }
  async purgeTenant(ctx: TenantContext): Promise<void> {
    const base = tenantPartition(ctx) + '/';
    for (const k of [...this.store.keys()]) if (k.startsWith(base)) this.store.delete(k);
  }
}
