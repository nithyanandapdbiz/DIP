/**
 * Manifest diff — the compare logic behind the read-only Configuration Viewer.
 *
 * TRACEABILITY
 *   ADR : ADR-0032 (tenant.json is authoritative) · ADR-0033 (the viewer displays it, read-only)
 *
 * A DIFF IS A DERIVED VIEW, NEVER A SOURCE. This computes the leaf-level changes between two
 * manifest snapshots (e.g. two versions of the same tenant, or a tenant vs a clone). It reads
 * manifests; it never writes one and never becomes a configuration model. It exists so the
 * viewer's "compare" is a tested function, not a hand-rolled UI tree-walk.
 */

export interface ManifestChange {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly kind: 'added' | 'removed' | 'changed';
}

/** Leaf-level diff of two JSON-shaped objects. Ordering by path is stable and deterministic. */
export function diffManifests(before: unknown, after: unknown): readonly ManifestChange[] {
  const changes: ManifestChange[] = [];
  walk('', before, after, changes);
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function walk(path: string, before: unknown, after: unknown, out: ManifestChange[]): void {
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      const hasB = k in before;
      const hasA = k in after;
      if (hasB && !hasA) out.push({ path: p, before: before[k], after: undefined, kind: 'removed' });
      else if (!hasB && hasA) out.push({ path: p, before: undefined, after: after[k], kind: 'added' });
      else walk(p, before[k], after[k], out);
    }
    return;
  }
  // Leaves (and arrays, compared structurally) — changed if not deep-equal.
  if (!deepEqual(before, after)) out.push({ path: path || '(root)', before, after, kind: 'changed' });
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((el, i) => deepEqual(el, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const ak = Object.keys(a); const bk = Object.keys(b);
    return ak.length === bk.length && ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
