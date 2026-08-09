/**
 * Cross-implementation conformance for the Execution-Plane credential (audit V-06 / C-06).
 *
 * The gateway harness verifies EP tokens with its own ESM implementation rather than importing the
 * TypeScript engine, for the same reason `canonicalize` is duplicated there: the harness runs whether
 * or not `dist/` has been built. Two implementations of one contract is only safe while something
 * proves they agree, and that is what this file is.
 *
 * Every token here is minted by the ISSUER's algorithm (auth-tokens.ts, reproduced exactly) and
 * verified by the VERIFIER under test. A drift in either direction fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyEpToken, authoriseForTenant, parseEpPrincipal } from '../ep-token-verifier.mjs';

const SECRET = 'test-session-secret-not-a-real-credential';

/** The issuer's algorithm, transcribed from `src/engine/auth-tokens.ts` (HS256 over header.payload). */
function issue({ sub, roles = ['execution-plane'], tenants = ['carlisle-homes'], ttlSeconds = 3600, nowSec = Math.floor(Date.now() / 1000), secret = SECRET }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub, roles, ...(tenants.length ? { tenants } : {}), iat: nowSec, exp: nowSec + ttlSeconds });
  const body = `${header}.${payload}`;
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

const bearer = (t) => `Bearer ${t}`;
const tenantAt = (version) => ({ onboarding: { epToken: { version } } });

// ── identity ────────────────────────────────────────────────────────────────

test('a token minted by the issuer verifies under the gateway implementation', () => {
  const r = verifyEpToken(bearer(issue({ sub: 'ep:carlisle-homes:v3' })), { secret: SECRET });
  assert.equal(r.ok, true);
  assert.equal(r.slug, 'carlisle-homes');
  assert.equal(r.version, 3);
});

test('an absent credential is refused with a typed reason, never defaulted', () => {
  const r = verifyEpToken(undefined, { secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'absent');
});

test('a non-Bearer authorization header is refused', () => {
  const r = verifyEpToken('Basic dXNlcjpwYXNz', { secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'absent');
});

test('a token signed with a DIFFERENT secret is refused', () => {
  const forged = issue({ sub: 'ep:carlisle-homes:v1', secret: 'attacker-secret' });
  const r = verifyEpToken(bearer(forged), { secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-signature');
});

test('a tampered payload is refused — the signature covers it', () => {
  const token = issue({ sub: 'ep:carlisle-homes:v1' });
  const [h, , s] = token.split('.');
  const swapped = Buffer.from(JSON.stringify({ sub: 'ep:other-tenant:v1', roles: ['execution-plane'], exp: 9999999999 })).toString('base64url');
  const r = verifyEpToken(bearer(`${h}.${swapped}.${s}`), { secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-signature');
});

test('an expired credential is refused', () => {
  const token = issue({ sub: 'ep:carlisle-homes:v1', ttlSeconds: 60, nowSec: Math.floor(Date.now() / 1000) - 3600 });
  const r = verifyEpToken(bearer(token), { secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'expired');
});

test('a NON-Execution-Plane principal is refused even with a valid signature', () => {
  // A platform-admin session token is validly signed by the same secret. It must not be able to
  // request an execution package: least privilege is the point of the role, not decoration.
  const r = verifyEpToken(bearer(issue({ sub: 'admin@dbiz.example', roles: ['platform-admin'], tenants: [] })), { secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-execution-plane');
});

test('an EP-shaped principal without the execution-plane role is refused', () => {
  const r = verifyEpToken(bearer(issue({ sub: 'ep:carlisle-homes:v1', roles: ['tenant-viewer'] })), { secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-execution-plane');
});

test('a missing signing secret refuses rather than admitting', () => {
  const r = verifyEpToken(bearer(issue({ sub: 'ep:carlisle-homes:v1' })), { secret: null });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-configured');
});

// ── tenant scope and rotation ───────────────────────────────────────────────

test('a credential scoped to another tenant cannot obtain this tenant a package', () => {
  const p = verifyEpToken(bearer(issue({ sub: 'ep:other-tenant:v1' })), { secret: SECRET });
  assert.equal(p.ok, true, 'the credential itself is valid — that is the point');
  const a = authoriseForTenant(p, tenantAt(1), 'carlisle-homes');
  assert.equal(a.ok, false);
  assert.equal(a.reason, 'tenant-scope');
});

test('a superseded credential version is refused after rotation', () => {
  const p = verifyEpToken(bearer(issue({ sub: 'ep:carlisle-homes:v1' })), { secret: SECRET });
  assert.equal(authoriseForTenant(p, tenantAt(2), 'carlisle-homes').ok, false);
  assert.equal(authoriseForTenant(p, tenantAt(2), 'carlisle-homes').reason, 'superseded');
  assert.equal(authoriseForTenant(p, tenantAt(1), 'carlisle-homes').ok, true);
});

test('a tenant with no recorded token version does not block a validly scoped credential', () => {
  // Absence of a recorded version is not evidence of rotation. Refusing here would lock out an EP
  // whose tenant record predates version tracking.
  const p = verifyEpToken(bearer(issue({ sub: 'ep:carlisle-homes:v7' })), { secret: SECRET });
  assert.equal(authoriseForTenant(p, { onboarding: {} }, 'carlisle-homes').ok, true);
});

test('parseEpPrincipal rejects a principal that is not an Execution Plane', () => {
  assert.equal(parseEpPrincipal('admin@dbiz.example'), null);
  assert.deepEqual(parseEpPrincipal('ep:a-b-c:v12'), { slug: 'a-b-c', version: 12 });
});
