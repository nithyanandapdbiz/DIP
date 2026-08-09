/**
 * TenantApiClient — the web tier's data layer, driven end-to-end against the real API over HTTP.
 * TRACEABILITY: ADR-0033 (web tier) · ADR-0032 (SSOT) · ADR-0030 (onboard() reused)
 *   Proves: the SPA's typed client completes the whole journey (create → enrich → certify →
 *           activate) against a live node:http server, all on the one tenant.json.
 * Categories: contract, integration
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import { type BootstrapServices } from '../src/domain/index.js';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, createServer, TenantApiClient, TenantApiError,
  SimulatedEdge, recommend, deterministicAdvisor, AUTH_ABSENT,
  type AuthOutcome, type RepositoryOptions, type Principal,
  type ProjectManagementMetadata, type TestManagementMetadata, type SourceControlMetadata, type ApplicationMetadata,
} from '../src/engine/index.js';

const admin: Principal = { id: 'u-admin', roles: ['platform-admin'] };

let tick = 0;
const opts: RepositoryOptions = { now: () => `2026-07-23T00:00:${String(tick++).padStart(2, '0')}.000Z`, newTenantId: () => 'tnt-opaque-01' };
const services: BootstrapServices = {
  auth: { issueOneTimeCredential: (t: string) => `otc-${t}` },
  registration: { recordTenantCreated: () => { /* audit */ } },
  now: () => '2026-07-23T00:00:00.000Z',
};
const WELCOME = { organisationName: 'Carlisle Homes', tenantName: 'Carlisle Prod', primaryAdministrator: 'John Smith', preferredCloud: 'azure', deploymentModel: 'container' };

async function withServer(fn: (client: TenantApiClient) => Promise<void>) {
  tick = 0;
  const authenticate = (h: IncomingHttpHeaders): AuthOutcome =>
    (h.authorization === 'Bearer admin-token' ? { outcome: 'authenticated', principal: admin }
      : h.authorization ? { outcome: 'rejected', reason: 'bad-signature' }
        : AUTH_ABSENT);
  const server = createServer({ repo: new TenantConfigRepository(new InMemoryTenantConfigStore(), opts), services, registrationEndpoint: 'https://ip.example/register', authenticate });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    await fn(new TenantApiClient(`http://127.0.0.1:${port}`, undefined, 'admin-token'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('the SPA data layer completes the journey over real HTTP (ADR-0033)', () => {
  test('create → connect → discovery → recommendations → review → activate, all on one manifest', async () => {
    await withServer(async (client) => {
      const created = await client.createTenant(WELCOME);
      assert.equal(created.onboarding.status, 'Onboarding');
      const slug = created.onboarding.slug;

      const list = await client.listTenants();
      assert.equal(list.length, 1, 'Tenant Management shows the tenant immediately');

      const edge = new SimulatedEdge();
      const discovered = {
        projectManagement: await edge.discover('projectManagement', slug) as ProjectManagementMetadata,
        testManagement: await edge.discover('testManagement', slug) as TestManagementMetadata,
        sourceControl: await edge.discover('sourceControl', slug) as SourceControlMetadata,
        application: await edge.discover('application', slug) as ApplicationMetadata,
      };
      await client.connect(slug, [
        { kind: 'project-management', provider: 'jira', connected: true },
        { kind: 'test-management', provider: 'zephyr-scale', connected: true, repositoryDisposition: 'reuse-existing', baseUrl: 'https://carlisle.atlassian.net', planId: 'plan-4471', suiteId: 'suite-9920', suiteKind: 'requirement-based' },
      ]);
      await client.discovery(slug, discovered);
      await client.recommendations(slug, recommend(discovered, deterministicAdvisor, 'container'));

      const review = await client.review(slug);
      assert.equal(review.certification.ok, true);

      const outcome = await client.activate(slug);
      assert.ok(outcome.result, 'onboard() ran');
      assert.equal(outcome.result.lifecycleState, 'PROVISIONED');

      const manifest = await client.getManifest(slug);
      assert.equal(manifest.onboarding.status, 'Provisioned');
    });
  });

  test('the client raises a typed error on an unknown tenant', async () => {
    await withServer(async (client) => {
      await assert.rejects(() => client.getTenant('does-not-exist'), (e: unknown) => e instanceof TenantApiError && e.status === 404);
    });
  });
});
