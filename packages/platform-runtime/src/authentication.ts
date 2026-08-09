/**
 * Authentication — OAuth2/OIDC client registration, short-lived JWT access tokens,
 * refresh, rotation and replay protection.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md §5a.2, §5a.3 · 21-tenant-lifecycle.md §3b
 *   ADR          : ADR-0021
 *   Criteria     : C-08.16 (no static API key exists anywhere)
 *                  C-08.17 (one-time credential consumed on first use, refused on replay)
 *                  C-08.19 (registration idempotent by tenant identity)
 *                  C-08.20 (mTLS AND a short-lived OAuth token — both, not either)
 *                  C-08.22 (a repeated nonce is rejected within the validity window)
 *
 * TOKENS ARE SHORT-LIVED AND BOUND TO A CERTIFICATE.
 * A bearer token that could be replayed from another machine would make mutual TLS
 * decorative: the certificate would prove who connected while the token proved
 * nothing about who it was issued to. Binding the token to the certificate key id
 * is what makes the two factors actually independent.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const b64url = (b: Buffer): string => b.toString('base64url');
const jsonB64 = (o: unknown): string => b64url(Buffer.from(JSON.stringify(o)));

export interface AccessToken {
  readonly token: string;
  readonly expiresAt: Date;
  readonly tenantId: string;
  /** Certificate the token is bound to. A token alone authorises nothing. */
  readonly boundKeyId: string;
}

export interface RefreshToken {
  readonly token: string;
  readonly expiresAt: Date;
  readonly tenantId: string;
}

export interface OAuthClient {
  readonly clientId: string;
  readonly tenantId: string;
}

export type TokenVerification =
  | { readonly ok: true; readonly tenantId: string; readonly boundKeyId: string }
  | { readonly ok: false; readonly reason: 'malformed' }
  | { readonly ok: false; readonly reason: 'bad-signature' }
  | { readonly ok: false; readonly reason: 'expired' }
  | { readonly ok: false; readonly reason: 'certificate-mismatch' }
  | { readonly ok: false; readonly reason: 'replayed' };

/**
 * Load the token signing key from state, creating it on first use.
 *
 * WHY THIS EXISTS.
 * The signing key was previously generated per instance, so every token issued by one
 * process was rejected by the next with `bad-signature`. A rolling restart or a second
 * instance therefore invalidated every customer's token — an outage caused by a
 * routine deploy, and one that only appears under a restart test.
 *
 * This is NOT a new custody decision. The certificate authority already persists its
 * root key to the same state directory under the same model; this applies that
 * settled decision to the second key rather than inventing a second scheme. A
 * production deployment supplies its own key from its secret store via
 * `AuthorisationServerOptions.signingKey`, which is why that option exists.
 */
export function loadOrCreateSigningKey(stateDir: string): Buffer {
  mkdirSync(stateDir, { recursive: true });
  const file = join(stateDir, 'auth-signing.key');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8'), 'base64');
  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64'), { encoding: 'utf8', mode: 0o600 });
  return key;
}

/**
 * Where seen nonces are remembered.
 *
 * THIS INTERFACE EXISTS BECAUSE THE DEFAULT WAS WRONG FOR THE DECLARED TOPOLOGY.
 * Nonces were held in a per-process Map. Document 17 declares the Intelligence Plane
 * "multiple per region, horizontally scaled", and R-16.19 requires it be horizontally
 * scalable without coordination — so a nonce refused by one instance was accepted by
 * the next, and no restart was even needed. A load balancer was sufficient. That is a
 * replay window against C-08.22, produced by an assumption the code made silently.
 *
 * The assumption is now explicit and injectable. Choosing WHERE shared state lives is
 * a deployment-topology decision and is deliberately not made here; what is made here
 * is the requirement, visible and testable, with `singleProcessOnly` so a deployment
 * running the default cannot do so unknowingly.
 */
export interface NonceStore {
  has(nonce: string): boolean;
  add(nonce: string, expiresAtMs: number): void;
  prune(nowMs: number): void;
  /** True for the in-memory default. A horizontally scaled deployment MUST replace it. */
  readonly singleProcessOnly: boolean;
}

/** The default store. Correct for one process, and for no other topology. */
export class InMemoryNonceStore implements NonceStore {
  private readonly seen = new Map<string, number>();
  readonly singleProcessOnly = true;
  has(nonce: string): boolean { return this.seen.has(nonce); }
  add(nonce: string, expiresAtMs: number): void { this.seen.set(nonce, expiresAtMs); }
  prune(nowMs: number): void {
    for (const [n, expiry] of this.seen) if (expiry < nowMs) this.seen.delete(n);
  }
}

export interface AuthorisationServerOptions {
  /**
   * Where seen nonces are remembered.
   *
   * Omitting it uses a per-process store, which is correct ONLY for a single
   * instance. Read `AuthorisationServer.replayProtectionIsSingleProcessOnly` and
   * surface it in readiness rather than discovering it from an incident.
   */
  readonly nonceStore?: NonceStore;
  /**
   * The token signing key.
   *
   * Supply one that outlives the process. Omitting it generates a per-instance key,
   * which is correct only for a single short-lived process: any restart invalidates
   * every token it issued.
   */
  readonly signingKey?: Buffer;
  /** Access-token lifetime. Short by design (R-08.49). */
  readonly accessTokenTtlSeconds?: number;
  readonly refreshTokenTtlSeconds?: number;
  /** Window within which a repeated nonce is rejected (R-08.51, R-22.4). */
  readonly nonceWindowSeconds?: number;
}

export class AuthorisationServer {
  private readonly signingKey: Buffer;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly nonceWindow: number;

  private readonly clients = new Map<string, OAuthClient>();
  /** One-time registration credentials, by tenant. Consumed on first use. */
  private readonly oneTimeCredentials = new Map<string, string>();
  private readonly consumedCredentials = new Set<string>();
  /** Seen nonces — replay protection. Injectable, because the default is single-process. */
  private readonly seenNonces: NonceStore;
  private readonly refreshTokens = new Map<string, RefreshToken>();

  constructor(options: AuthorisationServerOptions = {}) {
    this.signingKey = options.signingKey ?? randomBytes(32);
    this.seenNonces = options.nonceStore ?? new InMemoryNonceStore();
    this.accessTtl = options.accessTokenTtlSeconds ?? 300;
    this.refreshTtl = options.refreshTokenTtlSeconds ?? 3600;
    this.nonceWindow = options.nonceWindowSeconds ?? 300;
  }

  /**
   * Mint a one-time registration credential for a tenant.
   *
   * This is the ONLY credential that ever appears in generated output, and it dies
   * on first use (R-21.35). It is not an API key: it cannot authenticate a request,
   * only a registration.
   */
  issueOneTimeCredential(tenantId: string): string {
    const credential = `otc_${randomBytes(24).toString('base64url')}`;
    this.oneTimeCredentials.set(credential, tenantId);
    return credential;
  }

  /**
   * Consume a one-time credential. Returns the tenant on success.
   *
   * A second presentation is refused rather than silently re-registering — the
   * distinction R-08.46 requires, and the reason a leaked repository credential has
   * a blast radius measured in minutes.
   */
  consumeOneTimeCredential(credential: string): { ok: true; tenantId: string } | { ok: false; reason: 'unknown' | 'already-consumed' } {
    if (this.consumedCredentials.has(credential)) return { ok: false, reason: 'already-consumed' };
    const tenantId = this.oneTimeCredentials.get(credential);
    if (tenantId === undefined) return { ok: false, reason: 'unknown' };
    this.consumedCredentials.add(credential);
    this.oneTimeCredentials.delete(credential);
    return { ok: true, tenantId };
  }

  /** Register an OAuth client. Idempotent by tenant identity (C-08.19). */
  registerClient(tenantId: string): OAuthClient {
    const existing = [...this.clients.values()].find((c) => c.tenantId === tenantId);
    if (existing) return existing;
    const client: OAuthClient = { clientId: `client_${randomBytes(12).toString('base64url')}`, tenantId };
    this.clients.set(client.clientId, client);
    return client;
  }

  private sign(payload: string): string {
    return b64url(createHmac('sha256', this.signingKey).update(payload).digest());
  }

  /** Issue an access token bound to a certificate key id. */
  issueAccessToken(tenantId: string, boundKeyId: string, now: Date = new Date()): AccessToken {
    const expiresAt = new Date(now.getTime() + this.accessTtl * 1000);
    const header = jsonB64({ alg: 'HS256', typ: 'JWT' });
    const body = jsonB64({
      sub: tenantId,
      cnf: { kid: boundKeyId },        // confirmation claim: the certificate this token belongs to
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      jti: randomBytes(12).toString('base64url'),
    });
    const token = `${header}.${body}.${this.sign(`${header}.${body}`)}`;
    return { token, expiresAt, tenantId, boundKeyId };
  }

  issueRefreshToken(tenantId: string, now: Date = new Date()): RefreshToken {
    const rt: RefreshToken = {
      token: `rt_${randomBytes(24).toString('base64url')}`,
      expiresAt: new Date(now.getTime() + this.refreshTtl * 1000),
      tenantId,
    };
    this.refreshTokens.set(rt.token, rt);
    return rt;
  }

  /**
   * Exchange a refresh token for a new access token, ROTATING the refresh token.
   *
   * The old refresh token is invalidated. Without rotation a leaked refresh token
   * would be a long-lived credential wearing a short-lived one's name.
   */
  refresh(refreshToken: string, boundKeyId: string, now: Date = new Date()):
  { ok: true; access: AccessToken; refresh: RefreshToken } | { ok: false; reason: 'unknown' | 'expired' } {
    const rt = this.refreshTokens.get(refreshToken);
    if (!rt) return { ok: false, reason: 'unknown' };
    if (now > rt.expiresAt) { this.refreshTokens.delete(refreshToken); return { ok: false, reason: 'expired' }; }
    this.refreshTokens.delete(refreshToken);
    return {
      ok: true,
      access: this.issueAccessToken(rt.tenantId, boundKeyId, now),
      refresh: this.issueRefreshToken(rt.tenantId, now),
    };
  }

  /**
   * Verify a token, its binding to the presenting certificate, and its nonce.
   *
   * `presentedKeyId` comes from the TLS layer — the certificate actually used on the
   * connection, not a value the caller supplied. That is what makes the binding real.
   */
  verify(token: string, presentedKeyId: string, nonce?: string, now: Date = new Date()): TokenVerification {
    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, reason: 'malformed' };
    const [header, body, signature] = parts as [string, string, string];

    const expected = Buffer.from(this.sign(`${header}.${body}`));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { ok: false, reason: 'bad-signature' };
    }

    let claims: { sub?: string; exp?: number; cnf?: { kid?: string } };
    try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }

    if (typeof claims.exp !== 'number' || now.getTime() / 1000 > claims.exp) return { ok: false, reason: 'expired' };
    if (claims.cnf?.kid !== presentedKeyId) return { ok: false, reason: 'certificate-mismatch' };
    if (typeof claims.sub !== 'string') return { ok: false, reason: 'malformed' };

    if (nonce !== undefined) {
      this.seenNonces.prune(now.getTime());
      if (this.seenNonces.has(nonce)) return { ok: false, reason: 'replayed' };
      this.seenNonces.add(nonce, now.getTime() + this.nonceWindow * 1000);
    }

    return { ok: true, tenantId: claims.sub, boundKeyId: presentedKeyId };
  }

  /**
   * Is replay protection confined to this process?
   *
   * Surfaced so a horizontally scaled deployment cannot run the single-process default
   * unknowingly. The platform cannot detect its own topology; it can refuse to hide
   * the assumption it is making.
   */
  get replayProtectionIsSingleProcessOnly(): boolean {
    return this.seenNonces.singleProcessOnly;
  }
}
