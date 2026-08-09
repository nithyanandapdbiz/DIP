/**
 * Identity, trust chain, rotation and revocation.
 * TRACEABILITY: 08-security-model.md §5a · ADR-0021, ADR-0007
 *   Criteria: C-08.20, C-08.21, C-08.25
 * Categories: security, negative, trust-chain, rotation
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { CertificateAuthority } from '../src/index.js';

let stateDir: string;
let ca: CertificateAuthority;

before(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'dbiz-ca-'));
  ca = CertificateAuthority.create({ stateDir, leafValidityDays: 1 });
});
after(() => rmSync(stateDir, { recursive: true, force: true }));

describe('certificate issuance produces a real X.509 chain', () => {
  test('the root certificate is a genuine CA certificate', () => {
    const root = new X509Certificate(ca.rootCertificatePem);
    assert.match(root.subject, /DBiz Platform Root CA/);
    assert.equal(root.ca, true, 'root is not marked as a CA');
  });

  test('a leaf verifies against the root using an independent implementation', () => {
    // Verification goes through Node's own X509 stack, not through this module's
    // logic. A certificate only our code accepted would prove nothing about mTLS.
    const leaf = ca.issueForTenant('tenant-alpha');
    const x = new X509Certificate(leaf.certificatePem);
    const root = new X509Certificate(ca.rootCertificatePem);
    assert.equal(x.verify(root.publicKey), true, 'leaf does not chain to the root');
    assert.equal(x.ca, false, 'a leaf must not be a CA certificate');
  });

  test('the tenant is bound in the certificate itself, not in an accompanying claim', () => {
    const leaf = ca.issueForTenant('tenant-alpha');
    const x = new X509Certificate(leaf.certificatePem);
    assert.match(x.subject, /CN=tenant-alpha/);
    assert.match(x.subjectAltName ?? '', /urn:dbiz:tenant:tenant-alpha/);
  });

  test('each issuance yields a distinct key identifier', () => {
    const a = ca.issueForTenant('tenant-alpha');
    const b = ca.issueForTenant('tenant-alpha');
    assert.notEqual(a.keyId, b.keyId, 'reissue produced the same key id');
  });
});

describe('trust chain validation (C-08.25)', () => {
  test('a valid certificate for the right tenant is accepted', () => {
    const leaf = ca.issueForTenant('tenant-alpha');
    assert.equal(ca.validate(leaf.certificatePem, 'tenant-alpha').ok, true);
  });

  test("another tenant's certificate is rejected as wrong-tenant", () => {
    const leaf = ca.issueForTenant('tenant-alpha');
    const r = ca.validate(leaf.certificatePem, 'tenant-beta');
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, 'wrong-tenant');
  });

  test('a certificate from an untrusted issuer is rejected', () => {
    const other = mkdtempSync(join(tmpdir(), 'dbiz-rogue-ca-'));
    try {
      const rogue = CertificateAuthority.create({ stateDir: other });
      const leaf = rogue.issueForTenant('tenant-alpha');
      const r = ca.validate(leaf.certificatePem, 'tenant-alpha');
      assert.equal(r.ok, false);
      assert.equal(r.ok === false && r.reason, 'untrusted-issuer');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  test('an expired certificate is rejected', () => {
    const leaf = ca.issueForTenant('tenant-alpha');
    const wellAfterExpiry = new Date(leaf.notAfter.getTime() + 86_400_000);
    const r = ca.validate(leaf.certificatePem, 'tenant-alpha', wellAfterExpiry);
    assert.equal(r.ok === false && r.reason, 'expired');
  });

  test('a not-yet-valid certificate is rejected', () => {
    const leaf = ca.issueForTenant('tenant-alpha');
    const beforeValidity = new Date(leaf.notBefore.getTime() - 86_400_000);
    const r = ca.validate(leaf.certificatePem, 'tenant-alpha', beforeValidity);
    assert.equal(r.ok === false && r.reason, 'not-yet-valid');
  });

  test('a revoked certificate is rejected, and revocation needs no customer action', () => {
    const leaf = ca.issueForTenant('tenant-gamma');
    assert.equal(ca.validate(leaf.certificatePem, 'tenant-gamma').ok, true);
    ca.revoke(leaf.keyId);
    const r = ca.validate(leaf.certificatePem, 'tenant-gamma');
    assert.equal(r.ok === false && r.reason, 'revoked');
  });

  test('malformed certificate material is rejected as malformed, not as untrusted', () => {
    // The distinction matters: "malformed" is a client defect, "untrusted-issuer"
    // is a potential attack. Collapsing them loses the signal that matters.
    const r = ca.validate('-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----', 'tenant-alpha');
    assert.equal(r.ok === false && r.reason, 'malformed');
  });
});

describe('certificate rotation with overlap (C-08.21)', () => {
  test('rotation issues new material without invalidating the previous certificate', () => {
    // Overlap is what allows rotation without redeploying the Execution Plane. An
    // atomic swap would force the customer to restart in lockstep with DBiz, which
    // R-19.11 forbids.
    const first = ca.issueForTenant('tenant-rotate');
    const second = ca.rotateForTenant('tenant-rotate');
    assert.notEqual(first.keyId, second.keyId);
    assert.equal(ca.validate(first.certificatePem, 'tenant-rotate').ok, true,
      'the previous certificate was invalidated by rotation');
    assert.equal(ca.validate(second.certificatePem, 'tenant-rotate').ok, true);
  });

  test('the old certificate can be revoked independently once cutover completes', () => {
    const first = ca.issueForTenant('tenant-cutover');
    const second = ca.rotateForTenant('tenant-cutover');
    ca.revoke(first.keyId);
    assert.equal(ca.validate(first.certificatePem, 'tenant-cutover').ok, false);
    assert.equal(ca.validate(second.certificatePem, 'tenant-cutover').ok, true);
  });
});
