/**
 * Canonicalisation — RFC 8785.
 * TRACEABILITY: 20-cross-plane-contracts.md §5 · ADR-0004 · C-20.5, C-10.3
 * Categories: unit, negative, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalise, canonicalBytes, CanonicalisationError } from '../src/canonical.js';

describe('canonicalise', () => {
  test('is independent of property insertion order (C-20.5)', () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { c: { y: 2, z: 1 }, a: 2, b: 1 };
    assert.equal(canonicalise(a), canonicalise(b));
    assert.equal(canonicalise(a), '{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  test('orders keys by UTF-16 code unit, not locale', () => {
    // A locale-aware sort would order these differently; JCS mandates code units.
    assert.equal(canonicalise({ Z: 1, a: 2, A: 3 }), '{"A":3,"Z":1,"a":2}');
  });

  test('preserves array order — arrays are sequences, not sets', () => {
    assert.equal(canonicalise([3, 1, 2]), '[3,1,2]');
  });

  test('emits no insignificant whitespace', () => {
    assert.equal(canonicalise({ a: [1, { b: 2 }] }), '{"a":[1,{"b":2}]}');
  });

  test('is byte-stable across repeated invocation (C-10.3)', () => {
    const v = { n: 1.5, s: 'x', t: true, z: null, arr: [1, 2] };
    const first = canonicalBytes(v);
    for (let i = 0; i < 50; i += 1) {
      assert.deepEqual(canonicalBytes(v), first);
    }
  });

  test('escapes control characters in shortest JSON form', () => {
    const nul = String.fromCharCode(0);
    const value = `${nul}\n"`;
    assert.equal(canonicalise({ a: value }), '{"a":"\\u0000\\n\\""}');
  });

  test('nested ordering is applied at every depth', () => {
    const deep = { b: { d: { f: 1, e: 2 }, c: 3 }, a: 4 };
    assert.equal(canonicalise(deep), '{"a":4,"b":{"c":3,"d":{"e":2,"f":1}}}');
  });

  // ── Negative: values that would silently corrupt the canonical form ───────
  test('rejects NaN rather than emitting null', () => {
    // JSON.stringify emits null for NaN, which would make NaN and null collide.
    assert.throws(() => canonicalise({ a: NaN }), CanonicalisationError);
  });

  test('rejects Infinity', () => {
    assert.throws(() => canonicalise({ a: Infinity }), CanonicalisationError);
  });

  test('rejects undefined properties rather than dropping them', () => {
    assert.throws(() => canonicalise({ a: undefined }), CanonicalisationError);
  });

  test('rejects undefined inside arrays rather than emitting null', () => {
    assert.throws(() => canonicalise([1, undefined]), CanonicalisationError);
  });

  test('rejects bigint, function and symbol', () => {
    assert.throws(() => canonicalise({ a: BigInt(1) }), CanonicalisationError);
    assert.throws(() => canonicalise({ a: () => 1 }), CanonicalisationError);
    assert.throws(() => canonicalise({ a: Symbol('s') }), CanonicalisationError);
  });

  test('rejects Date so the conversion is explicit at the call site', () => {
    assert.throws(() => canonicalise({ a: new Date(0) }), CanonicalisationError);
  });

  test('the error names the offending path', () => {
    assert.throws(() => canonicalise({ outer: { inner: [1, NaN] } }), /outer\.inner\[1\]/);
  });
});
