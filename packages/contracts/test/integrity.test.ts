/**
 * The canonical integrity primitive.
 * TRACEABILITY: 10-evidence-flow-model.md §4 · 20 §4 · ADR-0005
 * Criteria: C-20.1, C-20.2, C-20.3, C-10.3, C-10.5, C-10.6, C-10.13, C-10.14
 * Categories: unit, tampering, negative, security, fault injection
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hash, verify, HASH_DOMAINS, ALGORITHM_VERSIONS, CURRENT_ALGORITHM,
} from '../src/integrity.js';

const content = { evidenceVersion: '1.0', dom: '<html/>', steps: [1, 2, 3] };

describe('integrity primitive', () => {
  test('produces a 64-character lowercase hex digest', () => {
    assert.match(hash('dbiz.evidence-record@1', content).value, /^[0-9a-f]{64}$/);
  });

  test('carries its algorithm version on every digest (C-20.3)', () => {
    assert.equal(hash('dbiz.evidence-record@1', content).algorithm, CURRENT_ALGORITHM);
  });

  test('is deterministic regardless of property order', () => {
    assert.equal(
      hash('dbiz.evidence-record@1', { x: 1, y: 2 }).value,
      hash('dbiz.evidence-record@1', { y: 2, x: 1 }).value,
    );
  });

  // ── Domain separation: the predecessor's actual defect ────────────────────
  test('identical content under different domains yields different digests (C-10.6)', () => {
    const seen = new Set(HASH_DOMAINS.map((d) => hash(d, content).value));
    assert.equal(
      seen.size,
      HASH_DOMAINS.length,
      'domain separation failed: a digest over one kind of object would be valid for another',
    );
  });

  test('a package digest is not a valid evidence digest', () => {
    const asPackage = hash('dbiz.execution-package@1', content);
    assert.equal(verify({ ...asPackage, domain: 'dbiz.evidence-record@1' }, content).ok, false);
  });

  // ── C-10.14: the false-positive test the predecessor most needed ──────────
  test('unaltered content NEVER fails verification, under every algorithm version (C-10.14)', () => {
    const payloads: unknown[] = [
      content,
      {},
      [],
      { nested: { deep: { deeper: [1, 'two', null, true] } } },
      { unicode: 'hello - world - accented' },
      { big: Array.from({ length: 500 }, (_, i) => ({ i, v: `v${i}` })) },
      { reordered: { z: 1, a: 2, m: 3 } },
      { emptyString: '', zero: 0, false: false, nullValue: null },
    ];
    for (const algorithm of ALGORITHM_VERSIONS) {
      for (const payload of payloads) {
        const digest = hash('dbiz.evidence-payload@1', payload, algorithm);
        assert.equal(
          verify(digest, payload).ok,
          true,
          `FALSE TAMPER VERDICT under ${algorithm}: untampered content reported as altered`,
        );
      }
    }
  });

  test('a digest survives JSON transport without a false failure', () => {
    const digest = hash('dbiz.evidence-payload@1', content);
    const wire = JSON.parse(JSON.stringify({ digest, content })) as {
      digest: typeof digest;
      content: unknown;
    };
    assert.equal(verify(wire.digest, wire.content).ok, true);
  });

  test('re-ordering properties in transit does not fail verification', () => {
    const digest = hash('dbiz.evidence-payload@1', { a: 1, b: 2, c: 3 });
    assert.equal(verify(digest, { c: 3, a: 1, b: 2 }).ok, true);
  });

  // ── Tamper detection ──────────────────────────────────────────────────────
  test('an altered payload fails verification (C-10.13)', () => {
    const digest = hash('dbiz.evidence-payload@1', content);
    const result = verify(digest, { ...content, dom: '<html>tampered</html>' });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, 'digest-mismatch');
  });

  test('an added field fails verification', () => {
    const digest = hash('dbiz.evidence-payload@1', content);
    assert.equal(verify(digest, { ...content, extra: 1 }).ok, false);
  });

  test('a removed field fails verification', () => {
    const digest = hash('dbiz.evidence-payload@1', content);
    const { dom: _dropped, ...without } = content;
    assert.equal(verify(digest, without).ok, false);
  });

  // ── Failure classification: "unsupported" is not "tampered" ───────────────
  test('an unsupported algorithm is classified, not reported as tampering', () => {
    const digest = hash('dbiz.evidence-payload@1', content);
    const result = verify({ ...digest, algorithm: 'sha512-jcs-v9' as never }, content);
    assert.equal(result.ok === false && result.reason, 'algorithm-unsupported');
  });

  test('a malformed digest is classified, not reported as tampering', () => {
    const digest = hash('dbiz.evidence-payload@1', content);
    const result = verify({ ...digest, value: 'nothex' }, content);
    assert.equal(result.ok === false && result.reason, 'malformed-digest');
  });

  test('altered content is never misreported as unsupported', () => {
    const digest = hash('dbiz.evidence-payload@1', content);
    const result = verify(digest, { different: true });
    assert.equal(result.ok === false && result.reason, 'digest-mismatch');
  });
});
