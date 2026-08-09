/**
 * Execution-Plane API token — IP-issued, tenant-scoped, versioned for rotation.
 *
 * TRACEABILITY: 08-security-model.md §5a (short-lived signed tokens) · 07-tenant-isolation.md (C-07.11).
 *
 * The IP mints a DBIZ session token for the EP so it can call the tenant API (pull updates, acknowledge).
 * It is NOT a customer credential (INV-2 is unaffected) and it is NOT the one-time registration credential —
 * it is the EP's ongoing API identity, displayed in the dashboard for the operator to map into the EP.
 *
 * ROTATION WITHOUT A DENYLIST. The version is embedded in the principal id (`ep:<slug>:v<N>`), which
 * round-trips through the signed token. Regenerating bumps the tenant's stored version; the router rejects
 * any EP token whose embedded version is not the tenant's current one — so an old token stops working.
 * Least privilege: the token carries only the `execution-plane` role (tenant:read + tenant:update).
 */
import { issueSessionToken } from './auth-tokens.js';
import type { Principal, Role } from './authz.js';

const EP_ROLE: Role = 'execution-plane';
const DEFAULT_TTL_SECONDS = 30 * 24 * 3600; // 30 days; rotate by regeneration (version bump), not by short TTL.

export interface EpTokenResult {
  readonly token: string;
  readonly version: number;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly last4: string;
}

/** The tenant-scoped principal an EP token authenticates as. The version lives in the id for rotation. */
export function epPrincipal(slug: string, version: number): Principal {
  return { id: `ep:${slug}:v${version}`, roles: [EP_ROLE], tenants: [slug] };
}

/** Parse an EP principal id → { slug, version }, or null if it is not an EP token. */
export function parseEpPrincipal(id: string): { slug: string; version: number } | null {
  const m = /^ep:(.+):v(\d+)$/.exec(id);
  return m && m[1] ? { slug: m[1], version: Number(m[2]) } : null;
}

/** Issue a tenant-scoped EP API token (a DBIZ session JWT). No customer secret is involved. */
export function issueEpToken(slug: string, version: number, secret: string, opts: { ttlSeconds?: number; nowMs?: number } = {}): EpTokenResult {
  const ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const nowMs = opts.nowMs ?? Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const token = issueSessionToken(epPrincipal(slug, version), secret, { ttlSeconds, now: () => nowSec });
  return {
    token,
    version,
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date((nowSec + ttlSeconds) * 1000).toISOString(),
    last4: token.slice(-4),
  };
}
