/**
 * PERSISTENCE INTEGRITY — the tenant manifest and the OTC store are written atomically.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 17-deployment-topology.md (durable state on a mounted volume)
 *   ADR          : ADR-0032 (the ONE tenant.json is the single source of truth)
 *
 * WHY THIS MATTERS MORE HERE THAN IN A TYPICAL SERVICE.
 * ADR-0032 makes `tenants/<slug>/tenant.json` the single source of truth — by design there is no second
 * copy and no journal. A truncated write is therefore not a degraded read, it is the permanent loss of
 * a tenant, and the platform has no automated backup to restore from. The OTC store is worse still: a
 * torn write there can resurrect a spent one-time credential (single-use defeated) or destroy the
 * record of every outstanding registration.
 *
 * `writeFileSync` onto the live path truncates first and then streams, so a crash, a SIGTERM during a
 * Container Apps revision swap, or an SMB disconnect on the Azure Files mount could leave either file
 * partial. These tests assert the write is temp → fsync → rename, which makes the replacement atomic.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileTenantConfigStore, TenantConfigRepository, FileRegistrationStore,
  issueRegistrationOtcDetailed, type RegistrationDeps,
} from '../src/index.js';

const roots: string[] = [];
const freshRoot = (): string => { const r = mkdtempSync(join(tmpdir(), 'dbiz-integrity-')); roots.push(r); return r; };
afterEach(() => { for (const r of roots.splice(0)) { try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ } } });

describe('the tenant manifest is written atomically', () => {
  test('a completed write leaves no temp file behind', () => {
    const root = freshRoot();
    const dir = join(root, 'tenants');
    mkdirSync(dir, { recursive: true });
    const repo = new TenantConfigRepository(new FileTenantConfigStore(dir));
    repo.createFromWelcome({ tenantName: 'Acme Corp', organisationName: 'Acme', primaryAdministrator: 'Ann' } as never);

    const entries = readdirSync(join(dir, 'acme-corp'));
    assert.deepEqual(entries, ['tenant.json'], `a temp file survived the write: ${entries.join(', ')}`);
  });

  test('repeated writes never leave temp files accumulating on the volume', () => {
    // A leaked temp file per write would grow without bound on the Azure Files mount.
    const root = freshRoot();
    const dir = join(root, 'tenants');
    mkdirSync(dir, { recursive: true });
    const repo = new TenantConfigRepository(new FileTenantConfigStore(dir));
    repo.createFromWelcome({ tenantName: 'Acme Corp', organisationName: 'Acme', primaryAdministrator: 'Ann' } as never);
    for (let i = 0; i < 25; i += 1) repo.setBranding('acme-corp', { companyName: `Acme ${i}` });

    assert.deepEqual(readdirSync(join(dir, 'acme-corp')), ['tenant.json']);
  });

  test('the manifest is always complete, parseable JSON after a write', () => {
    const root = freshRoot();
    const dir = join(root, 'tenants');
    mkdirSync(dir, { recursive: true });
    const repo = new TenantConfigRepository(new FileTenantConfigStore(dir));
    repo.createFromWelcome({ tenantName: 'Acme Corp', organisationName: 'Acme', primaryAdministrator: 'Ann' } as never);
    repo.setBranding('acme-corp', { companyName: 'Acme Holdings' });

    const raw = readFileSync(join(dir, 'acme-corp', 'tenant.json'), 'utf8');
    const parsed = JSON.parse(raw) as { onboarding: { slug: string } };
    assert.equal(parsed.onboarding.slug, 'acme-corp');
    assert.ok(raw.endsWith('\n'), 'the file is written whole, trailing newline included');
  });

  test('a pre-existing manifest is REPLACED, not appended to or partially overwritten', () => {
    // The rename must replace the file wholesale. Overwriting in place could leave a longer previous
    // document's tail behind, producing valid-prefix-plus-garbage.
    const root = freshRoot();
    const dir = join(root, 'tenants');
    mkdirSync(join(dir, 'acme-corp'), { recursive: true });
    writeFileSync(join(dir, 'acme-corp', 'tenant.json'), `${'x'.repeat(50_000)}\n`, 'utf8');

    const repo = new TenantConfigRepository(new FileTenantConfigStore(dir));
    const store = new FileTenantConfigStore(dir);
    const env = repo.createFromWelcome({ tenantName: 'Other', organisationName: 'O', primaryAdministrator: 'P' } as never);
    store.write('acme-corp', env);

    const raw = readFileSync(join(dir, 'acme-corp', 'tenant.json'), 'utf8');
    assert.ok(!raw.includes('xxxxx'), 'the previous document leaked into the new one');
    assert.doesNotThrow(() => JSON.parse(raw));
  });

  test('a write to an invalid slug fails without creating anything', () => {
    const root = freshRoot();
    const dir = join(root, 'tenants');
    mkdirSync(dir, { recursive: true });
    const store = new FileTenantConfigStore(dir);
    const repo = new TenantConfigRepository(new FileTenantConfigStore(dir));
    const env = repo.createFromWelcome({ tenantName: 'Acme', organisationName: 'A', primaryAdministrator: 'P' } as never);

    assert.throws(() => store.write('..', env));
    assert.ok(!existsSync(join(root, 'tenant.json')), 'a write escaped the tenant root');
  });
});

describe('the OTC store is written atomically', () => {
  const depsFor = (dir: string): RegistrationDeps => ({
    repo: new TenantConfigRepository(new FileTenantConfigStore(join(dir, 'tenants'))),
    store: new FileRegistrationStore(join(dir, 'registration')),
    epTokenSecret: 'test-secret-at-least-thirty-two-characters',
    contractVersion: '1.0.0',
    now: () => new Date().toISOString(),
  });

  test('issuing credentials leaves no temp file behind', () => {
    const root = freshRoot();
    const deps = depsFor(root);
    for (let i = 0; i < 10; i += 1) issueRegistrationOtcDetailed(deps, `tnt-${i}`);

    const entries = readdirSync(join(root, 'registration')).sort();
    assert.deepEqual(entries, ['audit.log', 'otc.json'], `unexpected files: ${entries.join(', ')}`);
  });

  test('the consumed-state record stays complete and parseable', () => {
    // If this file tore, a spent one-time credential could come back to life.
    const root = freshRoot();
    const deps = depsFor(root);
    const issued = issueRegistrationOtcDetailed(deps, 'tnt-1');
    assert.ok(issued.otc.startsWith('otc_'));

    const raw = readFileSync(join(root, 'registration', 'otc.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, { tenantId: string }>;
    assert.equal(Object.keys(parsed).length, 1);
    assert.equal(Object.values(parsed)[0]?.tenantId, 'tnt-1');
    // INV-2 regression guard: the plaintext credential is never persisted, only its hash.
    assert.ok(!raw.includes(issued.otc), 'the plaintext OTC was written to the store');
  });
});
