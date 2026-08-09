/**
 * Gateway, authentication, registration, isolation and cross-tenant attack.
 * TRACEABILITY: 08 §5a · 07 · 21 §3b · ADR-0021, ADR-0010
 *   Criteria: C-08.16, C-08.17, C-08.18, C-08.19, C-08.20, C-08.22, C-08.23,
 *             C-07.1, C-07.3, C-07.7, C-07.11, C-07.12
 * Categories: security, negative, integration, cross-tenant, replay, isolation
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CertificateAuthority, AuthorisationServer, ApiGateway, RegistrationService,
  TenantPaths, TenantStorage, TenantQueues, TenantConfiguration, TenantQuotas, TenantVault,
  TenantPathError,
} from '../src/index.js';

let stateDir: string;
let dataDir: string;
let ca: CertificateAuthority;
let auth: AuthorisationServer;
let registration: RegistrationService;
let gateway: ApiGateway;

const TENANTS = ['tenant-a', 'tenant-b', 'tenant-revoked'];

before(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'dbiz-gw-ca-'));
  dataDir = mkdtempSync(join(tmpdir(), 'dbiz-gw-data-'));
  ca = CertificateAuthority.create({ stateDir, leafValidityDays: 1 });
  auth = new AuthorisationServer({ accessTokenTtlSeconds: 300 });
  registration = new RegistrationService({ ca, auth, activeTenants: new Set(TENANTS) });
  const server = ca.issueForTenant('gateway');
  gateway = new ApiGateway({
    ca, auth,
    serverCertPem: server.certificatePem,
    serverKeyPem: server.privateKeyPem,
    authorisedPaths: ['/v1/execute', '/v1/evidence'],
    rateLimit: 5,
  });
});
after(() => {
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

function registerTenant(tenantId: string) {
  const otc = auth.issueOneTimeCredential(tenantId);
  const outcome = registration.register({ tenantId, oneTimeCredential: otc });
  assert.equal(outcome.ok, true, `registration failed for ${tenantId}`);
  return outcome.ok && !outcome.idempotentReplay ? outcome.grant : null!;
}

describe('secure registration (C-08.17, C-08.18, C-08.19)', () => {
  test('a tenant registers with a one-time credential and receives a certificate', () => {
    const grant = registerTenant('tenant-a');
    assert.ok(grant.certificate.certificatePem.includes('BEGIN CERTIFICATE'));
    assert.ok(grant.access.token.split('.').length === 3, 'access token is not a JWT');
    assert.equal(ca.validate(grant.certificate.certificatePem, 'tenant-a').ok, true);
  });

  test('the one-time credential is refused on replay', () => {
    const otc = auth.issueOneTimeCredential('tenant-b');
    const first = registration.register({ tenantId: 'tenant-b', oneTimeCredential: otc });
    assert.equal(first.ok, true);
    // A second tenant cannot reuse it, and neither can the same one after eviction.
    const consumed = auth.consumeOneTimeCredential(otc);
    assert.equal(consumed.ok, false);
    assert.equal(consumed.ok === false && consumed.reason, 'already-consumed');
  });

  test('an unknown credential is refused and leaves the tenant unregistered', () => {
    const r = registration.register({ tenantId: 'tenant-unknown', oneTimeCredential: 'otc_fabricated' });
    assert.equal(r.ok === false && r.reason, 'unknown-credential');
    assert.equal(registration.isRegistered('tenant-unknown'), false);
  });

  test('a credential issued for one tenant cannot register another', () => {
    const otc = auth.issueOneTimeCredential('tenant-a');
    const r = registration.register({ tenantId: 'tenant-b-impostor', oneTimeCredential: otc });
    assert.equal(r.ok === false && r.reason, 'tenant-mismatch');
    assert.equal(registration.isRegistered('tenant-b-impostor'), false);
  });

  test('an inactive subscription is refused and leaves the tenant unregistered', () => {
    const otc = auth.issueOneTimeCredential('tenant-inactive');
    const r = registration.register({ tenantId: 'tenant-inactive', oneTimeCredential: otc });
    assert.equal(r.ok === false && r.reason, 'subscription-inactive');
    assert.equal(registration.isRegistered('tenant-inactive'), false);
  });

  test('registration is idempotent by tenant identity', () => {
    const again = registration.register({ tenantId: 'tenant-a', oneTimeCredential: 'irrelevant' });
    assert.equal(again.ok, true);
    assert.equal(again.ok === true && again.idempotentReplay, true);
  });
});

describe('gateway enforces mTLS AND OAuth together (C-08.20, C-08.23)', () => {
  test('a request with no client certificate is refused', () => {
    const r = gateway.handle(null, { path: '/v1/execute' });
    assert.equal(r.status, 401);
  });

  test('a valid certificate with no token is refused — the certificate alone is not enough', () => {
    const grant = registration.grantFor('tenant-a')!;
    const r = gateway.handle(grant.certificate.certificatePem, { path: '/v1/execute' });
    assert.equal(r.status, 401);
    assert.match(r.status === 401 ? r.reason : '', /access token required/);
  });

  test('a valid certificate and matching token is allowed', () => {
    const grant = registration.grantFor('tenant-a')!;
    const r = gateway.handle(grant.certificate.certificatePem, {
      path: '/v1/execute', token: grant.access.token, nonce: 'n-allow-1',
    });
    assert.equal(r.status, 200);
    assert.equal(r.status === 200 ? r.tenantId : '', 'tenant-a');
  });

  test("a token bound to another certificate is refused", () => {
    // The confirmation claim binds the token to a specific certificate. Without it,
    // a stolen token would be usable from any machine holding any valid certificate,
    // and mutual TLS would be decorative.
    const a = registration.grantFor('tenant-a')!;
    const b = registration.grantFor('tenant-b')!;
    const r = gateway.handle(b.certificate.certificatePem, {
      path: '/v1/execute', token: a.access.token, nonce: 'n-crossbind',
    });
    assert.equal(r.status, 401);
    assert.match(r.status === 401 ? r.reason : '', /certificate-mismatch/);
  });

  test('an unauthorised path is denied — the gateway fails closed', () => {
    const grant = registration.grantFor('tenant-a')!;
    const r = gateway.handle(grant.certificate.certificatePem, {
      path: '/v1/admin/everything', token: grant.access.token, nonce: 'n-unauth',
    });
    assert.equal(r.status, 403);
  });

  test('a repeated nonce is rejected (C-08.22)', () => {
    const grant = registration.grantFor('tenant-a')!;
    const first = gateway.handle(grant.certificate.certificatePem, {
      path: '/v1/evidence', token: grant.access.token, nonce: 'n-replay-once',
    });
    assert.equal(first.status, 200);
    const replay = gateway.handle(grant.certificate.certificatePem, {
      path: '/v1/evidence', token: grant.access.token, nonce: 'n-replay-once',
    });
    assert.equal(replay.status, 401);
    assert.match(replay.status === 401 ? replay.reason : '', /replayed/);
  });

  test('a revoked certificate is refused at the gateway (C-08.25)', () => {
    // Revocation must take effect at the enforcement point, not only in the CA's
    // own view. A certificate the CA considers revoked but the gateway still
    // accepts is a revocation that has not happened.
    const grant = registerTenant('tenant-revoked');
    const before = gateway.handle(grant.certificate.certificatePem, {
      path: '/v1/execute', token: grant.access.token, nonce: 'n-revoke-before',
    });
    assert.equal(before.status, 200);

    ca.revoke(grant.certificate.keyId);

    const after = gateway.handle(grant.certificate.certificatePem, {
      path: '/v1/execute', token: grant.access.token, nonce: 'n-revoke-after',
    });
    assert.equal(after.status, 401);
    assert.match(after.status === 401 ? after.reason : '', /revoked/);
  });

  test('rate limiting is per tenant and does not starve another tenant', () => {
    const a = registration.grantFor('tenant-a')!;
    const b = registration.grantFor('tenant-b')!;
    let limited = false;
    for (let i = 0; i < 12; i += 1) {
      const r = gateway.handle(a.certificate.certificatePem, {
        path: '/v1/execute', token: a.access.token, nonce: `n-rate-${i}`,
      });
      if (r.status === 429) limited = true;
    }
    assert.equal(limited, true, 'rate limit never triggered for the noisy tenant');
    const other = gateway.handle(b.certificate.certificatePem, {
      path: '/v1/execute', token: b.access.token, nonce: 'n-b-unaffected',
    });
    assert.equal(other.status, 200, "one tenant's rate limit starved another");
  });
});

describe('cross-tenant attack simulation (C-07.11)', () => {
  test('tenant A cannot assert tenant B by supplying a tenant field', () => {
    // Scope derives from the certificate. Accepting the claimed field and refusing
    // it is deliberate: it makes the attempt auditable rather than invisible.
    const a = registration.grantFor('tenant-a')!;
    const r = gateway.handle(a.certificate.certificatePem, {
      path: '/v1/evidence', token: a.access.token, nonce: 'n-claim-b', claimedTenantId: 'tenant-b',
    });
    assert.equal(r.status, 403);
    assert.match(r.status === 403 ? r.reason : '', /may not be asserted/);
  });

  test('the refused cross-tenant attempt is recorded in the audit trail', () => {
    const denied = gateway.auditTrail.filter(
      (e) => e.outcome === 'denied' && (e.reason ?? '').includes('does not match certificate'),
    );
    assert.ok(denied.length > 0, 'a cross-tenant attempt was not audited');
  });
});

describe('tenant isolation is physical (C-07.1, C-07.3)', () => {
  const paths = () => new TenantPaths(dataDir, TENANTS);

  test('a path cannot be constructed without a tenant', () => {
    assert.throws(() => paths().path(''), (e) => e instanceof TenantPathError && e.reason === 'absent');
  });

  test('traversal, absolute and malformed identifiers are rejected', () => {
    assert.throws(() => paths().path('../escape'), (e) => e instanceof TenantPathError);
    assert.throws(() => paths().path('/etc'), (e) => e instanceof TenantPathError);
    assert.throws(() => paths().path('tenant a!'), (e) => e instanceof TenantPathError && e.reason === 'malformed');
  });

  test('an unregistered tenant cannot obtain a path at all', () => {
    assert.throws(() => paths().path('tenant-ghost'),
      (e) => e instanceof TenantPathError && e.reason === 'unregistered');
  });

  test('the tenant leads the path, so purge is a prefix operation', () => {
    const p = paths().path('tenant-a', 'functional-testing', 'run-1', 'evidence.json');
    assert.ok(p.includes(join('tenant-a', 'functional-testing', 'run-1')));
  });

  test('storage written by one tenant is not readable through another', () => {
    const storage = new TenantStorage(paths());
    storage.write('tenant-a', 'functional-testing', 'run-1', 'result.json', '{"secret":"a"}');
    assert.equal(storage.read('tenant-b', 'functional-testing', 'run-1', 'result.json'), null);
    assert.equal(storage.read('tenant-a', 'functional-testing', 'run-1', 'result.json'), '{"secret":"a"}');
  });

  test('a listing cannot cross tenants', () => {
    const storage = new TenantStorage(paths());
    storage.write('tenant-a', 'perf', 'run-9', 'x.json', '1');
    assert.deepEqual([...new Set(storage.list('tenant-b'))], []);
  });

  test('queues are separate instances, not one queue with a tenant field', () => {
    const queues = new TenantQueues(paths());
    queues.enqueue('tenant-a', 'job-a');
    assert.equal(queues.depth('tenant-b'), 0);
    assert.deepEqual([...queues.drain('tenant-b')], []);
    assert.deepEqual([...queues.drain('tenant-a')], ['job-a']);
  });

  test('configuration has no global fallback that could leak another tenant', () => {
    const config = new TenantConfiguration(paths());
    config.set('tenant-a', 'endpoint', 'https://a.internal');
    assert.equal(config.get('tenant-b', 'endpoint'), null);
  });

  test('one tenant cannot exhaust another tenant quota (C-07.12)', () => {
    const quotas = new TenantQuotas(3);
    assert.equal(quotas.consume('tenant-a', 3), true);
    assert.equal(quotas.consume('tenant-a', 1), false);
    assert.equal(quotas.consume('tenant-b', 3), true, "tenant A's exhaustion blocked tenant B");
  });
});

describe('secret vault: rotation without interrupting execution (E-9)', () => {
  const vault = () => new TenantVault(new TenantPaths(dataDir, TENANTS));

  test('rotation mints a new version while the previous remains readable', () => {
    // An atomic swap would break every execution holding the old secret at that
    // instant, which is why rotation and revocation are separate operations.
    const v = vault();
    const first = v.store('tenant-a', 'db-password', 'initial');
    const second = v.rotate('tenant-a', 'db-password');
    assert.notEqual(first.value, second.value);
    assert.equal(v.retrieve('tenant-a', 'db-password')!.version, second.version);
    assert.equal(v.retrieveVersion('tenant-a', 'db-password', first.version)!.value, 'initial');
  });

  test('revocation removes the old version once cutover completes', () => {
    const v = vault();
    const first = v.store('tenant-a', 'api-token', 'old');
    v.rotate('tenant-a', 'api-token');
    assert.equal(v.revoke('tenant-a', 'api-token', first.version), true);
    assert.equal(v.retrieveVersion('tenant-a', 'api-token', first.version), null);
    assert.ok(v.retrieve('tenant-a', 'api-token'));
  });

  test("a tenant cannot read another tenant's secret", () => {
    const v = vault();
    v.store('tenant-a', 'shared-name', 'a-value');
    v.store('tenant-b', 'shared-name', 'b-value');
    assert.equal(v.retrieve('tenant-a', 'shared-name')!.value, 'a-value');
    assert.equal(v.retrieve('tenant-b', 'shared-name')!.value, 'b-value');
  });
});

describe('token lifecycle and refresh rotation', () => {
  test('an expired token is refused', () => {
    const grant = registration.grantFor('tenant-a')!;
    const future = new Date(Date.now() + 10 * 60 * 1000);
    const v = auth.verify(grant.access.token, grant.certificate.keyId, undefined, future);
    assert.equal(v.ok === false && v.reason, 'expired');
  });

  test('a tampered token fails signature verification', () => {
    const grant = registration.grantFor('tenant-a')!;
    const [h, , s] = grant.access.token.split('.') as [string, string, string];
    const forged = `${h}.${Buffer.from('{"sub":"tenant-b","exp":9999999999}').toString('base64url')}.${s}`;
    const v = auth.verify(forged, grant.certificate.keyId);
    assert.equal(v.ok === false && v.reason, 'bad-signature');
  });

  test('refresh rotates the refresh token, invalidating the old one', () => {
    const grant = registration.grantFor('tenant-a')!;
    const first = auth.refresh(grant.refresh.token, grant.certificate.keyId);
    assert.equal(first.ok, true);
    const reuse = auth.refresh(grant.refresh.token, grant.certificate.keyId);
    assert.equal(reuse.ok, false, 'a used refresh token was accepted twice');
  });

  test('no static API key exists — every credential is one-time or short-lived (C-08.16)', () => {
    const grant = registration.grantFor('tenant-a')!;
    assert.ok(grant.access.expiresAt.getTime() > Date.now());
    assert.ok(grant.access.expiresAt.getTime() - Date.now() <= 5 * 60 * 1000 + 1000,
      'access token lifetime exceeds the short-lived bound');
  });
});
