/**
 * Software Update Management — API integration: publish → pull → verify-shape → install → rollback.
 * TRACEABILITY: ADR-0035 · ADR-0032 (SSOT) · INV-3 (pull-only) · ADR-0007 (signed package).
 * Categories: integration, security, regression.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, route,
  type ApiDeps, type ApiRequest, type Principal, type RepositoryOptions,
} from '../src/engine/index.js';
import type { BootstrapServices } from '../src/domain/index.js';

const admin: Principal = { id: 'u-admin', roles: ['platform-admin'] };
let tick = 0;
const opts: RepositoryOptions = { now: () => `2026-07-27T00:00:${String(tick++).padStart(2, '0')}.000Z`, newTenantId: () => 'tnt-upd-01' };
const services: BootstrapServices = { auth: { issueOneTimeCredential: (t: string) => `otc-${t}` }, registration: { recordTenantCreated: () => { /* audit */ } }, now: () => '2026-07-27T00:00:00.000Z' };
const WELCOME = { organisationName: 'Carlisle Homes', tenantName: 'Carlisle Prod', primaryAdministrator: 'John Smith', primaryAdministratorEmail: 'john@carlisle.example', preferredCloud: 'azure', deploymentModel: 'container' };
const signPackage = (h: string) => ({ algorithm: 'ed25519' as const, keyId: 'sig-test', value: Buffer.from(h).toString('base64') });
function deps(withSigner = true): ApiDeps {
  return { repo: new TenantConfigRepository(new InMemoryTenantConfigStore(), opts), services, registrationEndpoint: 'https://ip.example/register', ...(withSigner ? { signPackage } : {}) };
}
const A = (req: Omit<ApiRequest, 'principal'>, d: ApiDeps) => route({ ...req, principal: admin }, d);

describe('Software Update Management — pull-only lifecycle (ADR-0035, INV-3)', () => {
  test('publish → pull → compatibility → install → history → rollback updates the one manifest', () => {
    tick = 0;
    const d = deps();
    assert.equal(A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d).status, 201);
    const slug = 'carlisle-prod';

    // Publish a platform update → regenerate + sign + stamp epSolution + emit a pull event.
    const pub = A({ method: 'POST', path: `/api/tenants/${slug}/publish-update`, body: { mandatory: true } }, d);
    assert.equal(pub.status, 200);
    const env1 = pub.body as { epSolution: { publishedHash: string; publishedVersion: string; status: string; publishedKeyId?: string } };
    assert.ok(env1.epSolution.publishedHash.length > 0, 'a published content hash is stamped on tenant.json');
    assert.equal(env1.epSolution.status, 'update-available');
    assert.equal(env1.epSolution.publishedKeyId, 'sig-test');
    const publishedHash = env1.epSolution.publishedHash;
    const publishedVersion = env1.epSolution.publishedVersion;

    // The EP pulls: a solution-update event is pending, carrying the signature (nothing was pushed).
    const pending = A({ method: 'GET', path: `/api/tenants/${slug}/updates` }, d).body as { id: string; type: string; config?: { contentHash: string; signature: { keyId: string }; mandatory: boolean } }[];
    const evt = pending.find((e) => e.type === 'solution-update');
    assert.ok(evt, 'a solution-update event is pending for the EP to pull');
    assert.equal(evt!.config!.signature.keyId, 'sig-test');
    assert.equal(evt!.config!.mandatory, true);
    assert.equal(evt!.config!.contentHash, publishedHash);

    // Compatibility: same contract major → compatible.
    const compat = A({ method: 'POST', path: `/api/tenants/${slug}/check-compatibility`, body: { ep: { contractVersion: '1.0.0' } } }, d).body as { compatible: boolean };
    assert.equal(compat.compatible, true);

    // EP verifies + installs, then reports the installed version → status up-to-date, rollback point captured.
    const inst = A({ method: 'POST', path: `/api/tenants/${slug}/installed`, body: { version: publishedVersion, hash: publishedHash } }, d);
    assert.equal(inst.status, 200);
    assert.equal((inst.body as { epSolution: { status: string } }).epSolution.status, 'up-to-date');

    // EP acknowledges the pulled event.
    assert.equal(A({ method: 'POST', path: `/api/tenants/${slug}/updates`, body: { id: evt!.id } }, d).status, 200);

    // History records the publish + install (reusing the audit trail).
    const hist = A({ method: 'GET', path: `/api/tenants/${slug}/update-history` }, d).body as { event: string }[];
    assert.ok(hist.some((h) => h.event === 'solution-update-published'), 'publish is audited');
    assert.ok(hist.some((h) => h.event === 'solution-update-installed'), 'install is audited');

    // Rollback restores the prior version and marks the manifest rolled-back.
    const rb = A({ method: 'POST', path: `/api/tenants/${slug}/rollback`, body: { reason: 'health check failed' } }, d);
    assert.equal(rb.status, 200);
    assert.equal((rb.body as { epSolution: { status: string } }).epSolution.status, 'rolled-back');
  });

  test('publish-update is 501 without a signer; RBAC still protects it (401 unauthenticated)', () => {
    tick = 0;
    const noSign = deps(false);
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, noSign);
    assert.equal(A({ method: 'POST', path: '/api/tenants/carlisle-prod/publish-update', body: {} }, noSign).status, 501);
    assert.equal(route({ method: 'POST', path: '/api/tenants/carlisle-prod/publish-update', body: {} }, noSign).status, 401);
  });

  test('sync-config emits a config re-sync event the EP pulls (no regeneration, reuses the event)', () => {
    tick = 0;
    const d = deps();
    A({ method: 'POST', path: '/api/tenants', body: WELCOME }, d);
    const r = A({ method: 'POST', path: '/api/tenants/carlisle-prod/sync-config' }, d);
    assert.equal(r.status, 200);
    const events = r.body as { type: string }[];
    assert.ok(events.some((e) => e.type === 'configuration-changed'), 'a configuration-changed event is queued for the EP');
  });
});
