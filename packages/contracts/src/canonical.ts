/**
 * Canonical JSON serialisation — RFC 8785 (JCS).
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md §5 · 10-evidence-flow-model.md §4
 *   ADR          : ADR-0004 (wire format) · ADR-0005 (integrity primitive)
 *   Criteria     : C-20.5 (canonicalisation deterministic across implementations)
 *                  C-10.3 (byte-identical across implementations and platforms)
 *
 * Canonicalisation determines evidence *identity*. A change here invalidates every
 * existing digest, so this module is deliberately small, dependency-free, and
 * exhaustively tested. Per ADR-0005 §6, a canonicalisation change is not an
 * algorithm change — it requires re-hashing under a new algorithm version.
 *
 * This file contains shape and serialisation only. No business logic (R-19.7).
 */

/** A value that can be canonicalised. `undefined` is deliberately absent. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Raised when a value cannot be represented canonically. */
export class CanonicalisationError extends Error {
  public readonly path: string;
  constructor(message: string, path: string) {
    super(`${message} (at ${path || '<root>'})`);
    this.name = 'CanonicalisationError';
    this.path = path;
  }
}

/**
 * Recursively rebuild `value` with object keys ordered by UTF-16 code unit.
 *
 * JSON.stringify already satisfies RFC 8785 for number formatting (ECMAScript
 * Number::toString) and for string escaping (shortest form). It does *not* order
 * keys, which is the one thing this function supplies.
 */
function order(value: unknown, path: string): JsonValue {
  if (value === null) return null;

  const t = typeof value;

  if (t === 'boolean' || t === 'string') return value as boolean | string;

  if (t === 'number') {
    const n = value as number;
    // RFC 8785 admits no NaN or Infinity; JSON.stringify would silently emit
    // `null` for both, which would make two different inputs hash identically.
    if (!Number.isFinite(n)) {
      throw new CanonicalisationError(`non-finite number (${String(n)}) cannot be canonicalised`, path);
    }
    return n;
  }

  if (t === 'undefined') {
    // JSON.stringify drops undefined properties and emits `null` inside arrays.
    // Either would make the canonical form lossy, so both are rejected.
    throw new CanonicalisationError('undefined cannot be canonicalised', path);
  }

  if (t === 'bigint') throw new CanonicalisationError('bigint cannot be canonicalised', path);
  if (t === 'function' || t === 'symbol') {
    throw new CanonicalisationError(`${t} cannot be canonicalised`, path);
  }

  if (Array.isArray(value)) {
    return value.map((item, i) => order(item, `${path}[${i}]`));
  }

  if (value instanceof Date) {
    // A Date would serialise via toJSON, making the canonical form depend on a
    // prototype method. Callers convert to an explicit string first, so the
    // intent is visible at the call site rather than inferred here.
    throw new CanonicalisationError('Date must be converted to a string before canonicalisation', path);
  }

  if (t === 'object') {
    const source = value as Record<string, unknown>;
    // Own enumerable string keys only, sorted by UTF-16 code unit (JS default).
    const keys = Object.keys(source).sort();
    const out: Record<string, JsonValue> = {};
    for (const key of keys) {
      const child = source[key];
      if (child === undefined) {
        throw new CanonicalisationError(`property "${key}" is undefined`, path);
      }
      out[key] = order(child, path ? `${path}.${key}` : key);
    }
    return out;
  }

  throw new CanonicalisationError(`unsupported type ${t}`, path);
}

/**
 * Produce the RFC 8785 canonical form of `value`.
 *
 * Deterministic: identical logical content always yields identical bytes,
 * regardless of property insertion order.
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(order(value, ''));
}

/** Canonical form as UTF-8 bytes — the exact input to the integrity primitive. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalise(value));
}
