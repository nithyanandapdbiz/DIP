/**
 * D-123 LINK 1 — the signer at authoring, rotation, and where the signing key comes from.
 *
 * The positive control comes first in each block: a suite in which everything refuses proves that
 * something refuses, not that these discriminate.
 *
 * **THE MINT-ON-EMPTY BLOCK IS GONE, RETIRED WITH ITS SUBJECT BY ADR-0083** — see the note below.
 *
 * TRACEABILITY: ADR-0007 (§6 rotation, signing model) · ADR-0081 (P-81.4) · ADR-0083 (P-83.2, P-83.3)
 *   · ADR-0084 (why holding the key here is permitted) · D-123 · D-125 · D-129.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TenantConfigRepository, FileTenantConfigStore,
  resolveSigningKey, generateSigningKeyMaterial, createPackageSigner, publishVerificationKeys,
  lastDistributedKeyIds, verificationKeyEvents,
  SigningKeyAbsentError, SigningKeyMismatchError,
} from '../src/index.js';

function world() {
  const root = mkdtempSync(join(tmpdir(), 'link1-'));
  const repo = new TenantConfigRepository(new FileTenantConfigStore(join(root, 'tenants')));
  return { root, repo };
}

/**
 * ── THE MINT-ON-EMPTY BLOCK IS RETIRED WITH ITS SUBJECT (ADR-0083 P-83.3) ─────────────────────
 *
 * This file carried four properties over `SigningKeyMintAuthorisation`: first run mints, an existing
 * key loads, absent-with-tenancies refuses, and whole-volume loss mints again. **They passed, they
 * were correct, and they are deleted rather than kept.**
 *
 * **CHARTER §17.1.1 obligation (ii): a control whose properties would survive the removal of its
 * subject SHALL be retired with its subject, and its retirement stated.** Once the key is resolved
 * through the Secret Provider there is no create-if-missing branch at all, so every one of those
 * four would be satisfied trivially — by the absence of the thing they watched. **Keeping them
 * would leave four green properties asserting a protection that no longer has anything to protect
 * against**, which is precisely the control-shaped literal the rule names.
 *
 * **The reasoning they encoded is NOT lost, and it was never really about minting:** *has any
 * verification key reached a tenancy?* is a question about DISTRIBUTION, and it survives in the
 * rotation block below, which is where it always belonged.
 *
 * **What replaces the refusal is stronger and is proved here:** `resolveSigningKey` throws when the
 * secret is not provisioned, with no branch that could create one.
 */
describe('the signing key comes from the Secret Provider — there is no create-if-missing', () => {
  const provisioned = () => {
    const { privateKeyPem } = generateSigningKeyMaterial();
    return { get: (n: string) => (n === 'PACKAGE_SIGNING_KEY' ? privateKeyPem : undefined) };
  };

  test('CONTROL — a provisioned key resolves, and resolves identically twice', () => {
    const secrets = provisioned();
    const a = resolveSigningKey(secrets);
    const b = resolveSigningKey(secrets);
    assert.match(a.keyId, /^sig-[0-9a-f]{16}$/);
    assert.equal(a.keyId, b.keyId);
    assert.match(a.publicKeyPem, /BEGIN PUBLIC KEY/);
  });

  test('an UNPROVISIONED secret REFUSES, and nothing is created', () => {
    assert.throws(
      () => resolveSigningKey({ get: () => undefined }),
      (e: Error) => e instanceof SigningKeyAbsentError
        && /not available from the secret backend/.test(e.message)
        && /no create-if-missing/.test(e.message),
    );
  });

  test('an EMPTY secret is treated as absent, not as a key', () => {
    assert.throws(() => resolveSigningKey({ get: () => '' }), SigningKeyAbsentError);
  });

  // THE PROPERTY THAT REPLACES THE WHOLE MINT-AUTHORISATION BLOCK: there is no path, in production
  // or in a test, by which a signing key appears because something looked for one and did not find
  // it. Minting is an explicit act with its own name.
  test('the module exposes no create-or-get — minting is a separate, deliberate call', async () => {
    const mod = await import('../src/engine/package-signing.js');
    assert.ok(!('loadOrCreateSigningKey' in mod), 'a create-or-get survived the retirement');
    assert.ok('generateSigningKeyMaterial' in mod, 'deliberate provisioning is not available');
    assert.ok('resolveSigningKey' in mod);
  });
});

describe('the package signer — at AUTHORING, and the provenance agreement is enforced', () => {
  test('CONTROL — a package naming this plane\'s key is signed', () => {
    const w = world();
    try {
      const key = resolveSigningKey({ get: () => generateSigningKeyMaterial().privateKeyPem });
      const signer = createPackageSigner(key);
      const sig = signer.sign({ provenance: { signingKeyId: key.keyId, contentHash: { value: 'a'.repeat(64) } } });
      assert.equal(sig.algorithm, 'ed25519');
      assert.equal(sig.keyId, key.keyId);
      assert.ok(sig.value.length > 0);
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  });

  // THE INVARIANT MADE USEFUL. `signatureMatchesProvenance` is the predicate; this is the only place
  // both values are in hand, so it is the only place a mismatch can still be fixed. Letting it
  // through turns an authoring defect into `signature-invalid` in the CUSTOMER's plane.
  test('FAULT — a package naming a DIFFERENT key is REFUSED rather than signed', () => {
    const w = world();
    try {
      const key = resolveSigningKey({ get: () => generateSigningKeyMaterial().privateKeyPem });
      assert.throws(
        () => createPackageSigner(key).sign({
          provenance: { signingKeyId: 'sig-somebody-else', contentHash: { value: 'a'.repeat(64) } },
        }),
        (e: Error) => e instanceof SigningKeyMismatchError && /resolves to the wrong key/.test(e.message),
      );
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  });
});

describe('rotation — the carrier for a tenancy that has ALREADY registered', () => {
  const keys = [{ keyId: 'sig-aaaa', publicKeyPem: '-----PEM-A-----', algorithm: 'ed25519' as const }];

  test('CONTROL — a tenancy that has never been sent a key IS sent one', () => {
    const w = world();
    try {
      const env = w.repo.createFromWelcome({ tenantName: 'Acme', organisationName: 'Acme', primaryAdministrator: 'A' } as never);
      const slug = env.onboarding.slug;
      // THE CASE THIS EXISTS FOR: registered before the grant carried keys, so it holds none.
      assert.equal(lastDistributedKeyIds(w.repo.load(slug)!), undefined);

      const out = publishVerificationKeys(w.repo, keys);
      assert.deepEqual(out.map((o) => o.result), ['emitted']);
      assert.deepEqual(lastDistributedKeyIds(w.repo.load(slug)!), ['sig-aaaa']);

      // IT RIDES THE CHANNEL THE EP ALREADY POLLS — pending, pullable, acknowledgeable.
      const pending = w.repo.listUpdates(slug, true).filter((e) => e.type === 'verification-keys-changed');
      assert.equal(pending.length, 1);
      assert.equal(pending[0]!.status, 'pending');
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  });

  test('idempotent BY COMPARISON — a second sweep with the same set emits nothing', () => {
    const w = world();
    try {
      w.repo.createFromWelcome({ tenantName: 'Acme', organisationName: 'Acme', primaryAdministrator: 'A' } as never);
      publishVerificationKeys(w.repo, keys);
      const again = publishVerificationKeys(w.repo, keys);
      assert.deepEqual(again.map((o) => o.result), ['current']);
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  });

  test('a CHANGED set emits again — this is rotation, not a one-shot backfill', () => {
    const w = world();
    try {
      const env = w.repo.createFromWelcome({ tenantName: 'Acme', organisationName: 'Acme', primaryAdministrator: 'A' } as never);
      publishVerificationKeys(w.repo, keys);
      const rotated = [...keys, { keyId: 'sig-bbbb', publicKeyPem: '-----PEM-B-----', algorithm: 'ed25519' as const }];
      const out = publishVerificationKeys(w.repo, rotated);
      assert.deepEqual(out.map((o) => o.result), ['emitted']);
      // BOTH keys travel — ADR-0007 §6 keeps several valid concurrently so rotation needs no
      // customer redeployment. Sending only the new one would break every package still in its
      // validity window under the old key.
      assert.deepEqual(lastDistributedKeyIds(w.repo.load(env.onboarding.slug)!), ['sig-aaaa', 'sig-bbbb']);
      assert.equal(verificationKeyEvents(w.repo.load(env.onboarding.slug)!).length, 2);
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  });

  test('no private material crosses — only keyId, publicKeyPem and algorithm are emitted', () => {
    const w = world();
    try {
      const env = w.repo.createFromWelcome({ tenantName: 'Acme', organisationName: 'Acme', primaryAdministrator: 'A' } as never);
      publishVerificationKeys(w.repo, keys);
      const ev = verificationKeyEvents(w.repo.load(env.onboarding.slug)!)[0]!;
      const emitted = (ev.config!['keys'] as Record<string, unknown>[])[0]!;
      assert.deepEqual(Object.keys(emitted).sort(), ['algorithm', 'keyId', 'publicKeyPem']);
      // R-08.15: possession of a verification key SHALL NOT permit signing. Enforced by the shape —
      // there is no field here that could carry a private key.
      assert.ok(!JSON.stringify(ev).includes('PRIVATE'));
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  });

  test('distribution is AUDITED — a trust event that leaves no audit line cannot be reconstructed', () => {
    const w = world();
    try {
      const env = w.repo.createFromWelcome({ tenantName: 'Acme', organisationName: 'Acme', primaryAdministrator: 'A' } as never);
      publishVerificationKeys(w.repo, keys);
      const audit = (w.repo.load(env.onboarding.slug)!.onboarding.audit ?? []) as { event: string; detail?: string }[];
      const entry = audit.find((a) => a.event === 'verification-keys-distributed');
      assert.ok(entry, 'no audit line for a trust event');
      assert.match(String(entry!.detail), /sig-aaaa/);
    } finally { rmSync(w.root, { recursive: true, force: true }); }
  });
});
