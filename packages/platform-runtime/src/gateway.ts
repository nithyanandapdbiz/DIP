/**
 * API Gateway — a real mutual-TLS server enforcing authentication, authorisation,
 * rate limiting, replay protection, tenant-context injection and audit.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md §5a.2-5a.4 · 03 §2a (gateway in Platform Core)
 *   ADR          : ADR-0021
 *   Criteria     : C-08.20 (mTLS AND OAuth token — both)
 *                  C-08.22 (repeated nonce rejected)
 *                  C-08.23 (every request passes the gateway before any component)
 *                  C-08.24 (no inbound path into customer infrastructure)
 *                  C-07.11 (scope from authenticated identity, never a supplied field)
 *
 * REAL TLS, REAL CLIENT CERTIFICATES.
 * `requestCert: true` with `rejectUnauthorized: true` means Node's TLS stack performs
 * chain verification before a byte of application data is read. A gateway that
 * accepted a certificate its own code had "validated" would prove nothing — the
 * point is that an independent implementation enforces it.
 *
 * THE EXECUTION PLANE ALWAYS INITIATES. This server runs in the Intelligence Plane
 * and is connected TO. Nothing here dials out to a customer tenancy (INV-3).
 */
import { createServer, type Server, type TLSSocket } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import type { CertificateAuthority } from './certificate-authority.js';
import type { AuthorisationServer } from './authentication.js';

export interface AuditEvent {
  readonly at: string;
  readonly event: string;
  readonly tenantId: string | null;
  readonly outcome: 'allowed' | 'denied';
  readonly reason?: string;
}

export interface GatewayRequest {
  readonly path: string;
  readonly token?: string;
  readonly nonce?: string;
  /**
   * A tenant the CALLER claims. Deliberately accepted and deliberately ignored for
   * authorisation: scope derives from the certificate. Accepting it lets the gateway
   * detect and audit an attempt to assert someone else's identity.
   */
  readonly claimedTenantId?: string;
  readonly body?: unknown;
}

export type GatewayResponse =
  | { readonly status: 200; readonly tenantId: string; readonly body: unknown }
  | { readonly status: 401; readonly reason: string }
  | { readonly status: 403; readonly reason: string }
  | { readonly status: 429; readonly reason: string };

export interface GatewayOptions {
  readonly ca: CertificateAuthority;
  readonly auth: AuthorisationServer;
  /** Server identity. Presented to clients; clients verify it against the same CA. */
  readonly serverCertPem: string;
  readonly serverKeyPem: string;
  /** Requests per tenant per window. */
  readonly rateLimit?: number;
  readonly rateWindowMs?: number;
  /** Paths permitted per tenant role. Absent path ⇒ denied (fail closed). */
  readonly authorisedPaths?: readonly string[];
}

export class ApiGateway {
  private readonly ca: CertificateAuthority;
  private readonly auth: AuthorisationServer;
  private readonly options: GatewayOptions;
  private readonly audit: AuditEvent[] = [];
  private readonly counters = new Map<string, { count: number; resetAt: number }>();
  private server: Server | null = null;

  constructor(options: GatewayOptions) {
    this.ca = options.ca;
    this.auth = options.auth;
    this.options = options;
  }

  get auditTrail(): readonly AuditEvent[] { return this.audit; }

  private record(event: string, tenantId: string | null, outcome: 'allowed' | 'denied', reason?: string): void {
    this.audit.push({ at: new Date().toISOString(), event, tenantId, outcome, ...(reason ? { reason } : {}) });
  }

  /**
   * Handle a request that has already completed a mutual-TLS handshake.
   *
   * `peerCertPem` is what the TLS layer actually verified, not a caller-supplied
   * value. Every authorisation decision derives from it.
   */
  handle(peerCertPem: string | null, request: GatewayRequest): GatewayResponse {
    // 1. Certificate identity. No certificate, no request — mTLS is not optional.
    if (!peerCertPem) {
      this.record(request.path, null, 'denied', 'no client certificate');
      return { status: 401, reason: 'client certificate required' };
    }

    let subjectTenant: string;
    try {
      const x = new X509Certificate(peerCertPem);
      const cn = /CN=([^,/\n]+)/.exec(x.subject)?.[1];
      if (!cn) throw new Error('no CN');
      subjectTenant = cn.trim();
    } catch {
      this.record(request.path, null, 'denied', 'malformed client certificate');
      return { status: 401, reason: 'malformed client certificate' };
    }

    // 2. Chain, expiry, revocation and tenant binding.
    const chain = this.ca.validate(peerCertPem, subjectTenant);
    if (!chain.ok) {
      this.record(request.path, subjectTenant, 'denied', `certificate ${chain.reason}`);
      return { status: 401, reason: `certificate ${chain.reason}` };
    }

    // 3. An OAuth token is required IN ADDITION to the certificate (R-08.48).
    if (!request.token) {
      this.record(request.path, subjectTenant, 'denied', 'no access token');
      return { status: 401, reason: 'access token required' };
    }

    const verdict = this.auth.verify(request.token, chain.keyId, request.nonce);
    if (!verdict.ok) {
      this.record(request.path, subjectTenant, 'denied', `token ${verdict.reason}`);
      return { status: 401, reason: `token ${verdict.reason}` };
    }

    // 4. The token's subject must match the certificate's tenant. A token issued for
    //    one tenant presented on another's certificate is a cross-tenant attempt.
    if (verdict.tenantId !== subjectTenant) {
      this.record(request.path, subjectTenant, 'denied', 'token/certificate tenant mismatch');
      return { status: 403, reason: 'token does not belong to the presenting certificate' };
    }

    // 5. A claimed tenant that differs from the certificate is audited and refused.
    //    Scope never derives from a caller-supplied field (C-07.11).
    if (request.claimedTenantId !== undefined && request.claimedTenantId !== subjectTenant) {
      this.record(request.path, subjectTenant, 'denied',
        `claimed tenant ${request.claimedTenantId} does not match certificate`);
      return { status: 403, reason: 'tenant scope may not be asserted by the caller' };
    }

    // 6. Authorisation. Fail closed: an unlisted path is denied.
    const permitted = this.options.authorisedPaths ?? [];
    if (!permitted.includes(request.path)) {
      this.record(request.path, subjectTenant, 'denied', 'path not authorised');
      return { status: 403, reason: 'not authorised for this path' };
    }

    // 7. Rate limiting, per tenant.
    const limit = this.options.rateLimit ?? 100;
    const windowMs = this.options.rateWindowMs ?? 60_000;
    const now = Date.now();
    const counter = this.counters.get(subjectTenant);
    if (!counter || counter.resetAt < now) {
      this.counters.set(subjectTenant, { count: 1, resetAt: now + windowMs });
    } else if (counter.count >= limit) {
      this.record(request.path, subjectTenant, 'denied', 'rate limit exceeded');
      return { status: 429, reason: 'rate limit exceeded' };
    } else {
      counter.count += 1;
    }

    // 8. Tenant context injected from the certificate, never from the request.
    this.record(request.path, subjectTenant, 'allowed');
    return { status: 200, tenantId: subjectTenant, body: request.body ?? null };
  }

  /** Start a genuine mutual-TLS listener. Callers connect in; nothing dials out. */
  async listen(port = 0): Promise<{ port: number; close: () => Promise<void> }> {
    const server = createServer({
      key: this.options.serverKeyPem,
      cert: this.options.serverCertPem,
      ca: [this.ca.rootCertificatePem],
      requestCert: true,
      rejectUnauthorized: true,   // Node verifies the chain before application data
    }, (socket: TLSSocket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const idx = buffer.indexOf('\n');
        if (idx === -1) return;
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        let req: GatewayRequest;
        try { req = JSON.parse(raw) as GatewayRequest; } catch {
          socket.write(`${JSON.stringify({ status: 401, reason: 'malformed request' })}\n`);
          return;
        }
        const peer = socket.getPeerCertificate();
        const pem = peer && peer.raw
          ? `-----BEGIN CERTIFICATE-----\n${peer.raw.toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----\n`
          : null;
        socket.write(`${JSON.stringify(this.handle(pem, req))}\n`);
      });
      socket.on('error', () => { /* connection-level failures are the client's to observe */ });
    });

    this.server = server;
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : 0;
    return {
      port: actualPort,
      close: () => new Promise<void>((resolve) => { server.close(() => resolve()); }),
    };
  }

  get isListening(): boolean { return this.server !== null && this.server.listening; }
}
