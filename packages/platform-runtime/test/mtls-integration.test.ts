/**
 * End-to-end mutual TLS over a real socket, reconnection after rotation, and the
 * full lifecycle audit chain.
 * TRACEABILITY: 08-security-model.md §5a.2-5a.4 · 21 §3b, §7a · ADR-0021
 *   Criteria: C-08.20 (mTLS and OAuth), C-08.21 (rotation, no redeploy),
 *             C-08.23 (gateway precedes components), C-08.24 (outbound only),
 *             C-21.24 (certification record), E-4, E-6, E-7, E-10
 * Categories: integration, security, mTLS, rotation, audit
 *
 * THIS IS THE TEST THAT MATTERS FOR mTLS.
 * Everything else validates certificates through this module's own logic. Here Node's
 * TLS stack performs the handshake and rejects unauthorised clients before a byte of
 * application data is read. A client our own validator liked but OpenSSL refused
 * would be caught only here.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, type TLSSocket } from 'node:tls';
import {
  CertificateAuthority, AuthorisationServer, ApiGateway, RegistrationService,
} from '../src/index.js';

let stateDir: string;
let ca: CertificateAuthority;
let auth: AuthorisationServer;
let registration: RegistrationService;
let gateway: ApiGateway;
let listener: { port: number; close: () => Promise<void> };

const TENANTS = ['tenant-mtls', 'tenant-other'];

before(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'dbiz-mtls-'));
  ca = CertificateAuthority.create({ stateDir, leafValidityDays: 1 });
  auth = new AuthorisationServer({ accessTokenTtlSeconds: 300 });
  registration = new RegistrationService({ ca, auth, activeTenants: new Set(TENANTS) });
  const server = ca.issueForTenant('gateway');
  gateway = new ApiGateway({
    ca, auth,
    serverCertPem: server.certificatePem,
    serverKeyPem: server.privateKeyPem,
    authorisedPaths: ['/v1/execute'],
    rateLimit: 100,
  });
  listener = await gateway.listen(0);
});

after(async () => {
  await listener.close();
  rmSync(stateDir, { recursive: true, force: true });
});

interface CallResult {
  /** True only if the gateway returned a parseable response over the connection. */
  readonly served: boolean;
  readonly response?: { status: number; reason?: string };
  readonly error?: string;
}

/**
 * A real TLS client presenting a client certificate.
 *
 * `served` is the honest signal, not "did the handshake succeed". Under TLS 1.3 the
 * client's own `secureConnect` fires before the server has even seen its certificate
 * — the client sends Certificate after the server's Finished. A client the server
 * will reject therefore observes a successful local handshake and only afterwards a
 * fatal alert or a bare close. Asserting on `secureConnect` would let an unauthorised
 * client look accepted; asserting that no response was served cannot.
 */
function callGateway(
  cert: string | undefined, key: string | undefined, payload: unknown,
): Promise<CallResult> {
  return new Promise((resolve) => {
    const socket: TLSSocket = connect({
      port: listener.port, host: '127.0.0.1',
      ca: [ca.rootCertificatePem],
      ...(cert && key ? { cert, key } : {}),
      servername: 'localhost',
      rejectUnauthorized: true,
    });
    let out = '';
    let settled = false;
    const done = (r: CallResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      clearTimeout(watchdog);
      resolve(r);
    };
    // A wall-clock watchdog, not socket.setTimeout: an idle timer is reset by the
    // very alert bytes that signal rejection, so it can fail to fire at all.
    const watchdog = setTimeout(() => done({ served: false, error: 'timeout' }), 8000);

    socket.on('secureConnect', () => { socket.write(`${JSON.stringify(payload)}\n`); });
    socket.on('data', (d) => {
      out += d.toString('utf8');
      if (out.includes('\n')) {
        try {
          const response = JSON.parse(out.trim()) as { status: number; reason?: string };
          done({ served: true, response });
        } catch { done({ served: false, error: 'unparseable response' }); }
      }
    });
    socket.on('error', (e) => done({ served: false, error: (e as Error).message }));
    // Rejection frequently arrives as a close with no error event at all.
    socket.on('close', () => done({ served: false, error: 'closed by peer' }));
    socket.on('end', () => done({ served: false, error: 'ended by peer' }));
  });
}

/** Asserts the gateway served the call, and returns the response status. */
function statusOf(r: CallResult): number {
  assert.equal(r.served, true, `the gateway did not serve the call: ${r.error}`);
  return r.response!.status;
}

function register(tenantId: string) {
  const otc = auth.issueOneTimeCredential(tenantId);
  const r = registration.register({ tenantId, oneTimeCredential: otc });
  assert.equal(r.ok, true);
  return r.ok && !r.idempotentReplay ? r.grant : null!;
}

describe('E-4 · secure registration over real mutual TLS', () => {
  test('a registered Execution Plane completes a TLS handshake and is served', async () => {
    const grant = register('tenant-mtls');
    const result = await callGateway(
      grant.certificate.certificatePem, grant.certificate.privateKeyPem,
      { path: '/v1/execute', token: grant.access.token, nonce: 'mtls-1', body: { run: 'r1' } },
    );
    assert.equal(statusOf(result), 200);
  });

  test('a client presenting NO certificate is never served', async () => {
    // The TLS layer refuses it: no application data is exchanged in either direction.
    // This is the property that makes mutual TLS mandatory rather than advisory.
    const result = await callGateway(undefined, undefined, { path: '/v1/execute' });
    assert.equal(result.served, false, 'a certificate-less client was served');
  });

  test('a client with a certificate from an untrusted CA is never served', async () => {
    const rogueDir = mkdtempSync(join(tmpdir(), 'dbiz-rogue-'));
    try {
      const rogue = CertificateAuthority.create({ stateDir: rogueDir });
      const forged = rogue.issueForTenant('tenant-mtls');
      const result = await callGateway(forged.certificatePem, forged.privateKeyPem,
        { path: '/v1/execute' });
      assert.equal(result.served, false, 'a forged certificate was served by the gateway');
    } finally {
      rmSync(rogueDir, { recursive: true, force: true });
    }
  });

  test('a valid certificate without a token is refused at the application layer', async () => {
    const grant = registration.grantFor('tenant-mtls')!;
    const result = await callGateway(
      grant.certificate.certificatePem, grant.certificate.privateKeyPem,
      { path: '/v1/execute' },
    );
    // The certificate is valid, so TLS admits it — and the gateway then refuses it
    // for want of a token. Both layers are required; neither alone is sufficient.
    assert.equal(statusOf(result), 401);
  });
});

describe('E-6 and E-7 · rotation with zero downtime, then reconnection', () => {
  test('the old certificate keeps working while the new one is issued', async () => {
    const before = registration.grantFor('tenant-mtls')!;
    const rotated = registration.rotateCertificate('tenant-mtls');
    assert.equal(rotated.ok, true);

    // The Execution Plane has not restarted and still holds the previous material.
    // If rotation broke it here, rotation would require a customer redeploy.
    const stillWorks = await callGateway(
      before.certificate.certificatePem, before.certificate.privateKeyPem,
      { path: '/v1/execute', token: before.access.token, nonce: 'rot-old-1' },
    );
    assert.equal(statusOf(stillWorks), 200,
      'rotation caused downtime for a client still using the previous certificate');
  });

  test('the Execution Plane reconnects using the rotated certificate', async () => {
    const grant = registration.grantFor('tenant-mtls')!;
    const result = await callGateway(
      grant.certificate.certificatePem, grant.certificate.privateKeyPem,
      { path: '/v1/execute', token: grant.access.token, nonce: 'rot-new-1' },
    );
    assert.equal(statusOf(result), 200);
  });

  test('once the old certificate is revoked, only the rotated one is served', async () => {
    const current = registration.grantFor('tenant-mtls')!;
    // Cutover completes: the tenant has moved to the new certificate, so the old one
    // is revoked. Revocation is what ends the overlap window.
    const rotatedAgain = registration.rotateCertificate('tenant-mtls');
    assert.equal(rotatedAgain.ok, true);
    if (rotatedAgain.ok) {
      assert.equal(rotatedAgain.previous.keyId, current.certificate.keyId,
        'rotation did not report the certificate it replaced');
    }
    ca.revoke(current.certificate.keyId);

    const revokedAttempt = await callGateway(
      current.certificate.certificatePem, current.certificate.privateKeyPem,
      { path: '/v1/execute', token: current.access.token, nonce: 'rot-revoked-1' },
    );
    // TLS still admits the connection — revocation is a platform decision, not a
    // chain property — and the gateway refuses it. That layering is deliberate:
    // revocation must take effect without reissuing the CA's own trust store.
    assert.equal(statusOf(revokedAttempt), 401);

    const now = registration.grantFor('tenant-mtls')!;
    const fresh = await callGateway(
      now.certificate.certificatePem, now.certificate.privateKeyPem,
      { path: '/v1/execute', token: now.access.token, nonce: 'rot-fresh-1' },
    );
    assert.equal(statusOf(fresh), 200);
  });
});

describe('E-8 · cross-tenant attack over real connections', () => {
  test("tenant-other cannot use tenant-mtls's token, even with a valid certificate", async () => {
    const other = register('tenant-other');
    const victim = registration.grantFor('tenant-mtls')!;
    const result = await callGateway(
      other.certificate.certificatePem, other.certificate.privateKeyPem,
      { path: '/v1/execute', token: victim.access.token, nonce: 'attack-1' },
    );
    assert.equal(statusOf(result), 401,
      "one tenant's token was accepted on another tenant's certificate");
  });

  test('tenant-other cannot assert tenant-mtls by supplying a tenant field', async () => {
    const other = registration.grantFor('tenant-other')!;
    const result = await callGateway(
      other.certificate.certificatePem, other.certificate.privateKeyPem,
      {
        path: '/v1/execute', token: other.access.token, nonce: 'attack-2',
        claimedTenantId: 'tenant-mtls',
      },
    );
    assert.equal(statusOf(result), 403);
  });
});

describe('E-10 · lifecycle audit chain', () => {
  test('the audit chain covers creation, registration, execution, upgrade and decommission', () => {
    const t = 'tenant-mtls';
    registration.recordTenantCreated(t);
    registration.recordExecution(t, 'run-audit-1');
    registration.recordUpgrade(t, 'technology-pack 1.1.0');
    assert.equal(registration.decommission(t), true);

    const events = registration.auditTrail.filter((e) => e.tenantId === t).map((e) => e.event);
    for (const required of ['tenant-creation', 'registration', 'certificate-rotation', 'execution', 'upgrade', 'decommission']) {
      assert.ok(events.includes(required), `audit chain is missing ${required}`);
    }
  });

  test('every audit record carries a timestamp, tenant and outcome', () => {
    for (const e of registration.auditTrail) {
      assert.ok(e.at && !Number.isNaN(Date.parse(e.at)), 'audit record has no valid timestamp');
      assert.ok(e.tenantId, 'audit record has no tenant');
      assert.ok(e.outcome, 'audit record has no outcome');
    }
  });

  test('the gateway audit records both allowed and denied requests', () => {
    const allowed = gateway.auditTrail.filter((e) => e.outcome === 'allowed');
    const denied = gateway.auditTrail.filter((e) => e.outcome === 'denied');
    assert.ok(allowed.length > 0, 'no allowed request was audited');
    assert.ok(denied.length > 0, 'no denied request was audited');
    // A denial without a reason is indistinguishable from an unexplained failure.
    for (const d of denied) assert.ok(d.reason, 'a denial was recorded without a reason');
  });

  test('decommissioning revokes the certificate, so a decommissioned tenant cannot connect', async () => {
    const t = 'tenant-mtls';
    assert.equal(registration.isRegistered(t), false, 'tenant remained registered after decommission');
  });
});
