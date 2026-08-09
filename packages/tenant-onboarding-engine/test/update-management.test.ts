/**
 * Software Update Management — unit tests for the new isolated modules.
 * TRACEABILITY: ADR-0035 · ADR-0007 (signing) · ADR-0005 (hashing) · INV-3 (pull-only).
 * Categories: security, contract, regression.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * A provisioned secret backend, minted DELIBERATELY (ADR-0083 P-83.2).
 *
 * The fixtures previously created a key by calling into an empty directory — the create-if-missing
 * branch this ADR removed. Provisioning is now an explicit act here too, which is the point: there
 * is no path, in production or in a test, by which a signing key appears because something looked
 * for one and did not find it.
 */
const freshSecrets = () => {
  const { privateKeyPem } = generateSigningKeyMaterial();
  return { get: (n: string) => (n === 'PACKAGE_SIGNING_KEY' ? privateKeyPem : undefined) };
};
import { join } from 'node:path';
import { resolveSigningKey, generateSigningKeyMaterial, signContentHash, verifyContentHash } from '../src/engine/package-signing.js';
import {
  stampPublished, markInstalled, isUpdateAvailable, checkCompatibility, solutionVersion,
  buildUpdatePayload, updateHistory,
} from '../src/engine/update-management.js';

describe('package-signing — production ed25519 (ADR-0007 posture)', () => {
  test('resolves a provisioned key, signs, and verifies a content hash', () => {
    // ONE backend, resolved twice: the SAME provisioned secret must yield the SAME keyId, because
    // the key id is a fingerprint of the public half and nothing about resolution is stateful.
    const secrets = freshSecrets();
    const k = resolveSigningKey(secrets);
    const reloaded = resolveSigningKey(secrets);
    assert.equal(k.keyId, reloaded.keyId, 'the same provisioned secret resolved to a different keyId');
    const sig = signContentHash(k, 'sha-abc123');
    assert.equal(sig.algorithm, 'ed25519');
    assert.equal(sig.keyId, k.keyId);
    assert.ok(verifyContentHash(k.publicKeyPem, 'sha-abc123', sig), 'a valid signature verifies');
  });

  test('rejects a tampered hash and a wrong key (no push of unsigned/tampered packages)', () => {
    const k = resolveSigningKey(freshSecrets());
    const sig = signContentHash(k, 'sha-abc123');
    assert.equal(verifyContentHash(k.publicKeyPem, 'sha-TAMPERED', sig), false);
    // A DIFFERENT provisioned key — the point of the assertion below is that a signature made
    // under one key does not verify under another.
    const other = resolveSigningKey(freshSecrets());
    assert.equal(verifyContentHash(other.publicKeyPem, 'sha-abc123', sig), false);
    // A malformed signature never throws — it just fails closed.
    assert.equal(verifyContentHash(k.publicKeyPem, 'sha-abc123', { algorithm: 'ed25519', keyId: 'x', value: 'not-base64!!' }), false);
  });
});

describe('update-management — version + compatibility', () => {
  const m = { contentHash: 'sha-v1', generatorVersion: '1.0.0', templateVersion: '1.0.0', fileCount: 28 };

  test('publish stays update-available until the EP reports the same hash installed', () => {
    let v = stampPublished(m, 'sig-key', '2026-07-24T00:00:00.000Z');
    assert.equal(v.publishedHash, 'sha-v1');
    assert.equal(v.publishedVersion, 'gen-1.0.0+tpl-1.0.0');
    assert.equal(isUpdateAvailable(v), true, 'nothing installed yet');

    v = markInstalled(v, solutionVersion(m), 'sha-v1', '2026-07-24T00:05:00.000Z');
    assert.equal(v.status, 'up-to-date');
    assert.equal(isUpdateAvailable(v), false);

    // Publish a newer version → update-available again; the prior install is preserved as the rollback point.
    const v2 = stampPublished({ ...m, contentHash: 'sha-v2' }, 'sig-key', '2026-07-25T00:00:00.000Z', v);
    assert.equal(v2.status, 'update-available');
    assert.equal(v2.installedHash, 'sha-v1');
    assert.equal(isUpdateAvailable(v2), true);
  });

  test('the pull payload carries version, hash and signature', () => {
    const sig = { algorithm: 'ed25519' as const, keyId: 'sig-key', value: 'AAAA' };
    const p = buildUpdatePayload(m, sig, 'generated/carlislehomes', true, '2026-07-24T00:00:00.000Z');
    assert.equal(p.contentHash, 'sha-v1');
    assert.equal(p.signature.keyId, 'sig-key');
    assert.equal(p.mandatory, true);
  });

  test('compatibility blocks on a contract major mismatch, warns on removed capabilities', () => {
    const blocked = checkCompatibility({ publishedContractVersion: '2.0.0', installedContractVersion: '1.0.0', publishedSchemaVersion: '1.0.0', publishedCapabilities: ['functional-testing'] });
    assert.equal(blocked.compatible, false);
    assert.ok(blocked.reasons.some((r) => r.code === 'contract-major-mismatch' && r.severity === 'block'));

    const ok = checkCompatibility({
      publishedContractVersion: '1.1.0', installedContractVersion: '1.0.0',
      publishedSchemaVersion: '1.0.0', installedSchemaVersion: '1.0.0',
      publishedCapabilities: ['functional-testing'], installedCapabilities: ['functional-testing', 'performance'],
    });
    assert.equal(ok.compatible, true, 'a minor bump is compatible');
    assert.ok(ok.reasons.some((r) => r.code === 'capabilities-removed' && r.severity === 'warn'));

    const oldRuntime = checkCompatibility({ publishedContractVersion: '1.0.0', publishedSchemaVersion: '1.0.0', epRuntimeVersion: '1.0.0', minRuntimeVersion: '2.0.0', publishedCapabilities: [] });
    assert.equal(oldRuntime.compatible, false);
    assert.ok(oldRuntime.reasons.some((r) => r.code === 'runtime-too-old'));
  });

  test('update history extracts only the update slice of the audit trail', () => {
    const h = updateHistory([
      { at: 't1', event: 'tenant-created', detail: 'x' },
      { at: 't2', event: 'solution-update-published', detail: 'v2' },
      { at: 't3', event: 'update-installed', detail: 'v2' },
    ]);
    assert.equal(h.length, 2);
    assert.equal(h[0]!.event, 'solution-update-published');
  });
});
