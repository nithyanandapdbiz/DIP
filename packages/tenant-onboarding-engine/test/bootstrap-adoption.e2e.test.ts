/**
 * Runtime-adoption execution evidence (ADR-0060 §6 M-a).
 *
 * TRACEABILITY: 17-deployment-topology.md · ADR-0060 · ADR-0033
 *
 * Proves — by EXECUTION, in-process, no container required — that the production composition path
 * (`bootstrapPlatform` → `composeApiDeps` → `createApp`) starts a real HTTP server sourcing ALL config
 * through the Configuration Provider and the session secret through the Secret Provider, and serves a
 * real request. This is the operational evidence for Phases 1/2 (Docker/Azure remain E-2-blocked).
 */
import { test } from 'node:test';
import { generateSigningKeyMaterial } from '../src/index.js';

/** Provisioned once for this suite, deliberately — never created by a boot path. */
const TEST_SIGNING_KEY = generateSigningKeyMaterial().privateKeyPem;
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { bootstrapPlatform } from '@dbiz/platform-providers';
import { createApp } from '../src/server/main.js';
import { composeApiDeps, BootstrapError } from '../src/server/platform-adoption.js';

function fakeEnv(stateDir: string): Record<string, string | undefined> {
  return {
    DBIZ_STATE_DIR: stateDir,
    DBIZ_STORAGE_BACKEND: 'filesystem',
    DBIZ_SECRET_BACKEND: 'env',
    DBIZ_STATE_BACKEND: 'memory',
    SESSION_SECRET: 'adoption-test-only-stable-secret',
    // ADR-0083: the package signing key is a PROVISIONED SECRET. There is no create-if-missing, so
    // a deployment without it does not boot — including this one. Provisioning it here is the test
    // behaving like a real deployment rather than being exempted from one.
    PACKAGE_SIGNING_KEY: TEST_SIGNING_KEY,
    DBIZ_DEV_AUTH: '1',
    IP_ADMIN_ALLOWLIST: 'admin@dbiz.example',
    // PORT omitted → schema default 8080 (a valid configured port); the test binds an ephemeral port
    // via app.listen(0) directly, so the configured value is not used here.
  };
}

test('adoption: bootstrapPlatform -> composeApiDeps -> createApp serves /api/health (200)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ip-adopt-'));
  try {
    const platform = bootstrapPlatform({ env: fakeEnv(dir) });
    // Configuration is sourced through the provider, not process.env.
    assert.equal(platform.config.state.dir, dir);
    assert.equal(platform.secrets.require('SESSION_SECRET'), 'adoption-test-only-stable-secret');

    const composed = composeApiDeps(platform);
    assert.equal(composed.diagnostics.liveEntra, false);
    assert.deepEqual([...composed.diagnostics.allowlist], ['admin@dbiz.example']);

    const app = await createApp(composed.deps);
    await app.listen(0, '127.0.0.1');
    try {
      const addr = app.getHttpServer().address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${addr.port}/api/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { status: string };
      assert.equal(body.status, 'ok');
      // The file-backed SSOT was created under the provider-configured state dir (StorageProvider ready for M-c).
      assert.ok(existsSync(join(dir, 'tenants')));
    } finally {
      await app.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adoption: fail-fast when the Secret Provider cannot supply SESSION_SECRET', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ip-adopt-'));
  try {
    const env = fakeEnv(dir);
    delete env.SESSION_SECRET; // secret absent
    const platform = bootstrapPlatform({ env });
    assert.throws(() => composeApiDeps(platform), (e: unknown) => {
      assert.ok(e instanceof BootstrapError);
      assert.match((e as Error).message, /SESSION_SECRET/);
      return true;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adoption: fail-fast when neither Entra nor dev-auth is configured', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ip-adopt-'));
  try {
    const env = fakeEnv(dir);
    delete env.DBIZ_DEV_AUTH; // no dev auth, no Entra
    const platform = bootstrapPlatform({ env });
    assert.throws(() => composeApiDeps(platform), BootstrapError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
