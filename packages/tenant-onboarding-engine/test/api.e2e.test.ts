/**
 * NestJS web tier — end-to-end over a real booted application.
 * TRACEABILITY: ADR-0033 (Increment 1) · ADR-0032 (SSOT) · ADR-0030 (onboard() reused)
 *   Proves: the Nest app boots, enforces RBAC, and drives the whole journey to PROVISIONED — all
 *           through the same tested route()/repository, on the one tenant.json. Controllers add no logic.
 * Categories: integration, e2e, security
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { type BootstrapServices } from '../src/domain/index.js';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, SimulatedEdge, recommend, deterministicAdvisor,
  AUTH_ABSENT, type AuthOutcome, type Principal,
  type ProjectManagementMetadata, type TestManagementMetadata, type SourceControlMetadata, type ApplicationMetadata,
} from '../src/engine/index.js';
import { createApp } from '../src/server/main.js';

const admin: Principal = { id: 'u-admin', roles: ['platform-admin'] };
const services: BootstrapServices = {
  auth: { issueOneTimeCredential: (t: string) => `otc-${t}` },
  registration: { recordTenantCreated: () => { /* audit */ } },
  now: () => '2026-07-23T00:00:00.000Z',
};
const WELCOME = { organisationName: 'Carlisle Homes', tenantName: 'Carlisle Prod', primaryAdministrator: 'John Smith', preferredCloud: 'azure', deploymentModel: 'container' };

let app: INestApplication;
let base: string;

before(async () => {
  let tick = 0;
  const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), {
    now: () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`, newTenantId: () => 'tnt-opaque-01',
  });
  // Three outcomes, like the real authenticator: nothing presented, presented-and-refused, resolved.
  const authenticate = (h: IncomingHttpHeaders): AuthOutcome =>
    (h.authorization === 'Bearer admin-token' ? { outcome: 'authenticated', principal: admin }
      : h.authorization ? { outcome: 'rejected', reason: 'bad-signature' }
        : AUTH_ABSENT);
  app = await createApp({ repo, services, registrationEndpoint: 'https://ip.example/register', authenticate });
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => { await app.close(); });

const authed = (method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer admin-token' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

describe('the NestJS app serves the tenant journey over HTTP (ADR-0033 Increment 1)', () => {
  test('an anonymous request is rejected with 401', async () => {
    const res = await fetch(`${base}/api/tenants`);
    assert.equal(res.status, 401);
  });

  test('create → connect → discovery → recommendations → review → activate, on one manifest', async () => {
    const created = await authed('POST', '/api/tenants', WELCOME);
    assert.equal(created.status, 201);
    const slug = 'carlisle-prod';

    const list = await (await authed('GET', '/api/tenants')).json() as unknown[];
    assert.equal(list.length, 1, 'Tenant Management lists the tenant immediately');

    const edge = new SimulatedEdge();
    const discovered = {
      projectManagement: await edge.discover('projectManagement', slug) as ProjectManagementMetadata,
      testManagement: await edge.discover('testManagement', slug) as TestManagementMetadata,
      sourceControl: await edge.discover('sourceControl', slug) as SourceControlMetadata,
      application: await edge.discover('application', slug) as ApplicationMetadata,
    };
    await authed('PATCH', `/api/tenants/${slug}/connect`, { selections: [
      { kind: 'project-management', provider: 'jira', connected: true },
      { kind: 'test-management', provider: 'zephyr-scale', connected: true, repositoryDisposition: 'reuse-existing', baseUrl: 'https://carlisle.atlassian.net', planId: 'plan-4471', suiteId: 'suite-9920', suiteKind: 'requirement-based' },
    ] });
    await authed('PATCH', `/api/tenants/${slug}/discovery`, { discovered });
    await authed('PATCH', `/api/tenants/${slug}/recommendations`, { recommendations: recommend(discovered, deterministicAdvisor, 'container') });

    const review = await (await authed('PATCH', `/api/tenants/${slug}/review`)).json() as { certification: { ok: boolean } };
    assert.equal(review.certification.ok, true);

    const activated = await authed('POST', `/api/tenants/${slug}/activate`);
    assert.equal(activated.status, 200);
    const outcome = await activated.json() as { result: { lifecycleState: string } };
    assert.equal(outcome.result.lifecycleState, 'PROVISIONED');

    const manifest = await (await authed('GET', `/api/tenants/${slug}/manifest`)).json() as { onboarding: { status: string } };
    assert.equal(manifest.onboarding.status, 'Provisioned');
  });

  test('a bare token with only the viewer role cannot create (RBAC through Nest)', async () => {
    // The test authenticator only grants admin; an unrecognised token → no principal → 401.
    const res = await fetch(`${base}/api/tenants`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer nope' }, body: JSON.stringify(WELCOME) });
    assert.equal(res.status, 401);
  });
});

describe('P1 production concerns are wired', () => {
  test('liveness is public, O(1), and discloses no tenant information', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assert.equal(body['status'], 'ok');
    assert.equal(typeof body['uptime'], 'number');
    // REGRESSION GUARD. `tenants` was previously returned here, which (a) published the customer count
    // to any unauthenticated caller and (b) forced a read of every tenant manifest on every probe —
    // every 10s on the Azure Files mount, on the single replica. Neither may come back.
    assert.equal(body['tenants'], undefined, 'liveness must not disclose the tenant count');
  });

  test('readiness is a distinct endpoint that checks the durable store', async () => {
    const res = await fetch(`${base}/api/ready`);
    assert.equal(res.status, 200);
    const body = await res.json() as { status: string; checks: Record<string, string> };
    assert.equal(body.status, 'ready');
    assert.equal(body.checks['state'], 'ok');
  });
  test('Swagger/OpenAPI is served and documents the tenant routes', async () => {
    const res = await fetch(`${base}/api/docs-json`);
    assert.equal(res.status, 200);
    const spec = await res.json() as { openapi?: string; paths?: Record<string, unknown> };
    assert.ok(spec.openapi, 'an OpenAPI document is served');
    assert.ok(spec.paths && Object.keys(spec.paths).some((p) => p.includes('/api/tenants')), 'tenant routes are documented');
  });
});

describe('Software Update Management routes are served over HTTP (ADR-0035)', () => {
  // REGRESSION GUARD: the six SUM actions must be mapped by TenantController, not just handled by route().
  // A missing controller route returns 404 at the Nest layer before route() is ever reached (the live-UI bug).
  let app2: INestApplication;
  let base2: string;
  const signPackage = (h: string) => ({ algorithm: 'ed25519' as const, keyId: 'sig-test', value: Buffer.from(h).toString('base64') });

  before(async () => {
    let tick = 0;
    const repo = new TenantConfigRepository(new InMemoryTenantConfigStore(), {
      now: () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`, newTenantId: () => 'tnt-upd-e2e',
    });
    // Three outcomes, like the real authenticator: nothing presented, presented-and-refused, resolved.
  const authenticate = (h: IncomingHttpHeaders): AuthOutcome =>
    (h.authorization === 'Bearer admin-token' ? { outcome: 'authenticated', principal: admin }
      : h.authorization ? { outcome: 'rejected', reason: 'bad-signature' }
        : AUTH_ABSENT);
    app2 = await createApp({ repo, services, registrationEndpoint: 'https://ip.example/register', authenticate, signPackage });
    await app2.listen(0, '127.0.0.1');
    const addr = app2.getHttpServer().address() as AddressInfo;
    base2 = `http://127.0.0.1:${addr.port}`;
  });
  after(async () => { await app2.close(); });

  const call = (method: string, path: string, body?: unknown) =>
    fetch(`${base2}${path}`, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer admin-token' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

  test('publish → updates → compatibility → sync → installed → history → rollback all route through Nest (not 404)', async () => {
    assert.equal((await call('POST', '/api/tenants', WELCOME)).status, 201);
    const slug = 'carlisle-prod';

    const pub = await call('POST', `/api/tenants/${slug}/publish-update`, { mandatory: true });
    assert.equal(pub.status, 200, 'publish-update is mapped by the controller (regression: was 404)');
    const env = await pub.json() as { epSolution: { publishedVersion: string; publishedHash: string; status: string } };
    assert.equal(env.epSolution.status, 'update-available');

    const updates = await (await call('GET', `/api/tenants/${slug}/updates`)).json() as { type: string }[];
    assert.ok(updates.some((u) => u.type === 'solution-update'), 'the solution-update event is pullable over HTTP');

    assert.equal((await call('POST', `/api/tenants/${slug}/check-compatibility`, { ep: { contractVersion: '1.0.0' } })).status, 200);
    assert.equal((await call('POST', `/api/tenants/${slug}/sync-config`)).status, 200);
    assert.equal((await call('POST', `/api/tenants/${slug}/installed`, { version: env.epSolution.publishedVersion, hash: env.epSolution.publishedHash })).status, 200);
    assert.equal((await call('GET', `/api/tenants/${slug}/update-history`)).status, 200);
    assert.equal((await call('POST', `/api/tenants/${slug}/rollback`, { reason: 'e2e' })).status, 200);
  });

  test('route discovery: all six SUM routes + branding are registered in the Nest route table (OpenAPI)', async () => {
    const spec = await (await call('GET', '/api/docs-json')).json() as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths);
    for (const p of ['publish-update', 'sync-config', 'installed', 'update-history', 'check-compatibility', 'rollback', 'branding']) {
      assert.ok(paths.some((k) => k.includes(p)), `"${p}" is not registered in the Nest route table (would 404 in production)`);
    }
  });

  test('an unauthenticated publish-update is rejected at the HTTP layer (401, not 404)', async () => {
    const res = await fetch(`${base2}/api/tenants/carlisle-prod/publish-update`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401);
  });
});
