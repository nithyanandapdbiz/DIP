/**
 * Microsoft (Entra) sign-in → DBIZ session bridge. Proves the security-critical logic WITHOUT a live
 * tenant: the Entra verifier is injected, so we test the allow-list gate, the graceful denial, and the
 * DBIZ session-token issuance directly. TRACEABILITY: single-role (DBIZ IP Admin), no database.
 * Categories: security, contract
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { resolveMicrosoftSession, verifySessionToken, devEmailVerifier, verifyMicrosoftIdToken, type MicrosoftAuthConfig } from '../src/engine/index.js';

const cfg: MicrosoftAuthConfig = {
  tenantId: 't-1', clientId: 'c-1',
  allowlist: ['admin@dbiz.example', 'exec@dbiz.example'],
  sessionSecret: 'test-secret-please-change', sessionTtlSeconds: 3600,
};
const at = (s: number) => () => s;

describe('Microsoft sign-in → DBIZ session (single role · allow-list · no database)', () => {
  test('an allow-listed Microsoft email is granted a DBIZ IP Admin session token', async () => {
    const r = await resolveMicrosoftSession('tok', cfg, async () => ({ email: 'admin@dbiz.example' }), at(1000));
    assert.ok(r.ok);
    const v = verifySessionToken(r.token, cfg.sessionSecret, at(1010));
    assert.ok(v.ok);
    assert.equal(v.principal.id, 'admin@dbiz.example');
    assert.deepEqual(v.principal.roles, ['platform-admin']); // DBIZ IP Admin — the only role
  });

  test('a non-allow-listed email is refused with a clear no-access message (403)', async () => {
    const r = await resolveMicrosoftSession('tok', cfg, async () => ({ email: 'outsider@other.example' }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 403);
      assert.match(r.message, /not on the DBIZ IP Admin access list/);
      assert.equal(r.email, 'outsider@other.example');
    }
  });

  test('an unverifiable Microsoft token is refused (401) — never granted', async () => {
    const r = await resolveMicrosoftSession('forged', cfg, async () => null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 401);
  });

  test('the allow-list is case-insensitive (Entra may return mixed-case email)', async () => {
    const r = await resolveMicrosoftSession('tok', cfg, async () => ({ email: 'ADMIN@DBIZ.EXAMPLE' }), at(1000));
    assert.ok(r.ok);
  });

  test('the dev verifier accepts dev:<email> but STILL enforces the allow-list', async () => {
    const granted = await resolveMicrosoftSession('dev:exec@dbiz.example', cfg, devEmailVerifier, at(1000));
    assert.ok(granted.ok);
    const denied = await resolveMicrosoftSession('dev:stranger@x.example', cfg, devEmailVerifier);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.status, 403);
  });
});

// F-19: exercise the REAL production crypto path (verifyMicrosoftIdToken) — RS256 signature over the
// tenant JWKS — which the tests above deliberately bypass by injecting a verifier. We mint tokens with a
// local RSA keypair and stub the JWKS fetch, so a regression in the signature / aud / iss / exp / alg
// checks would now be caught. No live tenant or network is used.
describe('the real Entra JWKS verifier (RS256) — the production crypto path (F-19)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'test-kid-1';
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid, use: 'sig', alg: 'RS256' };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const mint = (payload: Record<string, unknown>, alg = 'RS256'): string => {
    const body = `${b64({ alg, kid, typ: 'JWT' })}.${b64(payload)}`;
    const sig = cryptoSign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url');
    return `${body}.${sig}`;
  };
  const valid = (): Record<string, unknown> => ({
    aud: cfg.clientId,
    iss: `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`,
    exp: Math.floor(Date.now() / 1000) + 600,
    preferred_username: 'admin@dbiz.example',
  });
  const withJwks = async (keys: unknown[], fn: () => Promise<void>): Promise<void> => {
    const saved = globalThis.fetch;
    globalThis.fetch = (async () => ({ json: async () => ({ keys }) })) as unknown as typeof globalThis.fetch;
    try { await fn(); } finally { globalThis.fetch = saved; }
  };

  test('a correctly-signed, in-window token from the tenant verifies to its email', async () => {
    await withJwks([jwk], async () => {
      const c = await verifyMicrosoftIdToken(mint(valid()), cfg);
      assert.ok(c && c.email === 'admin@dbiz.example');
    });
  });
  test('an expired token is rejected', async () => {
    await withJwks([jwk], async () => {
      assert.equal(await verifyMicrosoftIdToken(mint({ ...valid(), exp: Math.floor(Date.now() / 1000) - 60 }), cfg), null);
    });
  });
  test('a token for the wrong audience is rejected', async () => {
    await withJwks([jwk], async () => {
      assert.equal(await verifyMicrosoftIdToken(mint({ ...valid(), aud: 'not-our-client' }), cfg), null);
    });
  });
  test('a token from the wrong issuer (another tenant) is rejected', async () => {
    await withJwks([jwk], async () => {
      assert.equal(await verifyMicrosoftIdToken(mint({ ...valid(), iss: 'https://login.microsoftonline.com/other-tenant/v2.0' }), cfg), null);
    });
  });
  test('a tampered signature is rejected', async () => {
    await withJwks([jwk], async () => {
      const [h, p, s] = mint(valid()).split('.') as [string, string, string];
      // Flip a character in the MIDDLE of the signature — deterministic. (Flipping the LAST base64url
      // char is unreliable: the final char of an unpadded 256-byte RSA signature carries only 2
      // significant bits, so ~1/4 of flips decode to an identical signature and the token still verifies.
      // A middle char's 6 bits are all significant, so the tamper always changes the decoded bytes.)
      const i = Math.floor(s.length / 2);
      const forgedSig = `${s.slice(0, i)}${s[i] === 'A' ? 'B' : 'A'}${s.slice(i + 1)}`;
      assert.equal(await verifyMicrosoftIdToken(`${h}.${p}.${forgedSig}`, cfg), null);
    });
  });
  test('a non-RS256 algorithm is rejected before any network call', async () => {
    // No JWKS stub installed: the alg check must reject before any fetch.
    assert.equal(await verifyMicrosoftIdToken(mint(valid(), 'HS256'), cfg), null);
  });
  test('a token whose kid is not present in the JWKS is rejected', async () => {
    await withJwks([{ ...jwk, kid: 'a-different-kid' }], async () => {
      assert.equal(await verifyMicrosoftIdToken(mint(valid()), cfg), null);
    });
  });
});
