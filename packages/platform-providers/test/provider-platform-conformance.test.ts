/**
 * Provider Platform conformance suite (ADR-0060) — certification by execution.
 *
 * TRACEABILITY: 17-deployment-topology.md · ADR-0060 · ADR-0019 (evidence over assertion)
 *
 * Every invariant the governance gate `verify-provider-platform.js` relies on is proved here against
 * the REAL built code: configuration precedence + fail-fast, storage tenant isolation + traversal
 * refusal + case-fold, secret backends + no-value-in-errors, distributed lock/TTL/nonce/rate-limit,
 * bootstrap composition + fail-fast, and tenant-context cross-tenant refusal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ConfigurationProvider, ConfigurationError,
  tenantContext, tenantPartition,
  FilesystemStorageProvider, InMemoryStorageProvider, artefactPath,
  EnvSecretProvider, InMemorySecretProvider, MissingSecretError,
  InMemoryDistributedStateProvider, RedisDistributedStateProvider, type RedisLikeClient,
  bootstrapPlatform, type TenantContext,
} from '../src/index.js';

const ctxA: TenantContext = tenantContext({ tenantId: 'tnt-a', tenantSlug: 'Acme-Corp' });
const ctxB: TenantContext = tenantContext({ tenantId: 'tnt-b', tenantSlug: 'globex' });

// ── Configuration ────────────────────────────────────────────────────────────
test('config: boots with an empty environment on safe defaults', () => {
  const c = ConfigurationProvider.fromEnvironment({}).config;
  assert.equal(c.environment, 'local');
  assert.equal(c.server.port, 8080);
  assert.equal(c.storage.backend, 'filesystem');
  assert.equal(c.distributed.backend, 'memory');
});

test('config: environment overrides defaults and coerces types', () => {
  const c = ConfigurationProvider.fromEnvironment({ PORT: '9099', DBIZ_ENV: 'production', DBIZ_STATE_DIR: '/data' }).config;
  assert.equal(c.server.port, 9099);
  assert.equal(c.environment, 'production');
  assert.equal(c.storage.root, '/data');
});

test('config: fail-fast on an invalid value, aggregating issues', () => {
  assert.throws(() => ConfigurationProvider.fromEnvironment({ PORT: 'not-a-port' }), (e: unknown) => {
    assert.ok(e instanceof ConfigurationError);
    assert.ok(e.issues.length >= 1);
    return true;
  });
});

test('config: redis backend requires a URL (fail-fast)', () => {
  assert.throws(() => ConfigurationProvider.fromEnvironment({ DBIZ_STATE_BACKEND: 'redis' }), ConfigurationError);
  const ok = ConfigurationProvider.fromEnvironment({ REDIS_URL: 'redis://localhost:6379' }).config;
  assert.equal(ok.distributed.backend, 'redis');
});

test('config: precedence Default -> Environment -> Tenant -> Execution; backends never layerable', () => {
  const p = ConfigurationProvider.fromEnvironment({ DBIZ_LOG_LEVEL: 'warn', DBIZ_STORAGE_BACKEND: 'memory' });
  const eff = p.resolve({ logging: { level: 'error' } }, { logging: { level: 'debug' } });
  assert.equal(eff.logging.level, 'debug'); // execution wins
  const eff2 = p.resolve({ logging: { level: 'error' } });
  assert.equal(eff2.logging.level, 'error'); // tenant beats env
  assert.equal(eff.storage.backend, 'memory'); // infrastructure selection unchanged by any layer
});

// ── Tenant context ─────────────────────────────────────────────────────────────
test('tenant-context: case-folds the slug and rejects unsafe slugs', () => {
  assert.equal(ctxA.tenantSlug, 'acme-corp');
  assert.throws(() => tenantContext({ tenantId: 't', tenantSlug: '../etc' }));
  assert.throws(() => tenantContext({ tenantId: '', tenantSlug: 'x' }));
});

test('tenant-context: partitions are disjoint across tenants', () => {
  assert.notEqual(tenantPartition(ctxA), tenantPartition(ctxB));
});

// ── Storage ─────────────────────────────────────────────────────────────────────
for (const make of [() => new InMemoryStorageProvider(), null]) {
  const label = make ? 'memory' : 'filesystem';
  test(`storage(${label}): put/get roundtrip and tenant isolation`, async () => {
    let dir: string | undefined;
    const store = make ? make() : (() => { dir = mkdtempSync(join(tmpdir(), 'pp-')); return new FilesystemStorageProvider(dir); })();
    try {
      const key = { capability: 'functional-testing', run: 'run-1', artefact: 'result.json' };
      await store.put(ctxA, key, '{"ok":true}');
      assert.equal(await store.getText(ctxA, key), '{"ok":true}');
      // Tenant B cannot see tenant A's artefact.
      assert.equal(await store.get(ctxB, key), undefined);
      assert.equal(await store.exists(ctxB, key), false);
      const listed = await store.list(ctxA, { capability: 'functional-testing', run: 'run-1' });
      assert.deepEqual([...listed], ['result.json']);
      await store.purgeTenant(ctxA);
      assert.equal(await store.exists(ctxA, key), false);
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('storage: the single path constructor refuses traversal segments', () => {
  assert.throws(() => artefactPath(ctxA, { capability: 'functional-testing', run: 'run-1', artefact: '../secret' }));
  assert.throws(() => artefactPath(ctxA, { capability: '..', run: 'r', artefact: 'a' }));
});

test('storage: canonical layout is tenant/capability/run/artefact', () => {
  const segs = artefactPath(ctxA, { capability: 'cap', run: 'run', artefact: 'a.txt' });
  assert.deepEqual(segs, ['t', 'acme-corp', 'cap', 'run', 'a.txt']);
});

// ── Secrets ──────────────────────────────────────────────────────────────────────
test('secret(env): resolves from the injected snapshot; require throws name-only on absence', () => {
  const s = new EnvSecretProvider({ SESSION_SECRET: 'super-secret-value' });
  assert.equal(s.require('SESSION_SECRET'), 'super-secret-value');
  assert.throws(() => s.require('MISSING'), (e: unknown) => {
    assert.ok(e instanceof MissingSecretError);
    assert.equal(e.secretName, 'MISSING');
    assert.ok(!/super-secret-value/.test(e.message)); // never leaks a value
    return true;
  });
});

test('secret(memory): get/set and optional resolution', () => {
  const s = new InMemorySecretProvider({ A: '1' });
  assert.equal(s.get('A'), '1');
  assert.equal(s.get('B'), undefined);
  s.set('B', '2');
  assert.equal(s.require('B'), '2');
});

// ── Distributed state ─────────────────────────────────────────────────────────────
test('distributed(memory): lock is mutually exclusive and releasable', async () => {
  const d = new InMemoryDistributedStateProvider('dbiz');
  const l1 = await d.acquireLock(ctxA, 'otc-consume', 30);
  assert.ok(l1);
  assert.equal(await d.acquireLock(ctxA, 'otc-consume', 30), undefined); // held
  await l1!.release();
  assert.ok(await d.acquireLock(ctxA, 'otc-consume', 30)); // released
});

test('distributed(memory): nonce is single-use across the TTL window; TTL expires', async () => {
  let nowMs = 1_000_000;
  const d = new InMemoryDistributedStateProvider('dbiz', () => nowMs);
  assert.equal(await d.seenNonce(ctxA, 'n1', 60), true);  // first accept
  assert.equal(await d.seenNonce(ctxA, 'n1', 60), false); // replay refused
  nowMs += 61_000;
  assert.equal(await d.seenNonce(ctxA, 'n1', 60), true);  // expired -> accept again
});

test('distributed(memory): rate counter increments within a window; tenant-partitioned', async () => {
  const d = new InMemoryDistributedStateProvider('dbiz');
  assert.equal(await d.incr(ctxA, 'login', 60), 1);
  assert.equal(await d.incr(ctxA, 'login', 60), 2);
  assert.equal(await d.incr(ctxB, 'login', 60), 1); // separate tenant, separate counter
});

test('distributed(redis): honours SET NX EX semantics via the injected client port', async () => {
  // A minimal fake Redis with real NX semantics — proves the provider issues atomic lock/nonce ops.
  const map = new Map<string, string>();
  const client: RedisLikeClient = {
    async set(k, v, mode) { if (mode === 'NX' && map.has(k)) return null; map.set(k, v); return 'OK'; },
    async get(k) { return map.get(k) ?? null; },
    async del(k) { return map.delete(k) ? 1 : 0; },
    async incr(k) { const n = Number(map.get(k) ?? '0') + 1; map.set(k, String(n)); return n; },
    async expire() { return 1; },
  };
  const d = new RedisDistributedStateProvider(client, 'dbiz');
  const l1 = await d.acquireLock(ctxA, 'k', 30);
  assert.ok(l1);
  assert.equal(await d.acquireLock(ctxA, 'k', 30), undefined);
  assert.equal(await d.seenNonce(ctxA, 'n', 30), true);
  assert.equal(await d.seenNonce(ctxA, 'n', 30), false);
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────────
test('bootstrap: composes providers from configuration (local defaults)', () => {
  const ctx = bootstrapPlatform({ env: { DBIZ_STORAGE_BACKEND: 'memory', DBIZ_SECRET_BACKEND: 'memory' } });
  assert.equal(ctx.storage.backend, 'memory');
  assert.equal(ctx.secrets.backend, 'memory');
  assert.equal(ctx.state.backend, 'memory');
  assert.equal(ctx.config.server.host, '0.0.0.0');
});

test('bootstrap: redis backend without a client factory fails fast', () => {
  assert.throws(() => bootstrapPlatform({ env: { REDIS_URL: 'redis://x:6379' } }), /redisClientFactory/);
});

test('bootstrap: selects the redis backend when a factory is supplied', () => {
  const ctx = bootstrapPlatform({
    env: { REDIS_URL: 'redis://x:6379' },
    redisClientFactory: () => ({
      async set() { return 'OK'; }, async get() { return null; }, async del() { return 0; },
      async incr() { return 1; }, async expire() { return 1; },
    }),
  });
  assert.equal(ctx.state.backend, 'redis');
});
