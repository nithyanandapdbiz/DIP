/**
 * Tenant Context (ADR-0060) — the identity every request carries, and the source of tenant partitioning.
 *
 * TRACEABILITY: 07-tenant-isolation.md · 17-deployment-topology.md (R-17.16-19 partitioned layout) · ADR-0060
 *
 * A `TenantContext` is immutable and travels with a request. Providers scoped to it can only ever
 * address that tenant's partition — cross-tenant addressing is impossible by construction, not by
 * discipline. The slug is CASE-FOLDED and validated here, once, closing the SMB/Windows case-collision
 * risk (two logically-distinct slugs colliding on a case-insensitive filesystem).
 */

/** The canonical partition + correlation identity for one unit of work. */
export interface TenantContext {
  /** Opaque tenant identifier (R-21.3). */
  readonly tenantId: string;
  /** Case-folded, filesystem/Redis-safe partition slug. */
  readonly tenantSlug: string;
  /** End-to-end correlation id (threaded to logs, EP calls, evidence). */
  readonly correlationId?: string;
  readonly executionId?: string;
  readonly workflowId?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Reject a slug that is empty, mixed-case, traversal-shaped, or otherwise unsafe as a partition key. */
export function normaliseTenantSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid tenant slug "${raw}" — must match ${SLUG_RE} after case-folding`);
  }
  return slug;
}

/** Build an immutable, validated tenant context. */
export function tenantContext(input: {
  tenantId: string;
  tenantSlug: string;
  correlationId?: string;
  executionId?: string;
  workflowId?: string;
}): TenantContext {
  if (!input.tenantId || !input.tenantId.trim()) throw new Error('tenantId is required');
  return Object.freeze({
    tenantId: input.tenantId,
    tenantSlug: normaliseTenantSlug(input.tenantSlug),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.executionId ? { executionId: input.executionId } : {}),
    ...(input.workflowId ? { workflowId: input.workflowId } : {}),
  });
}

/**
 * The leading partition segment for a tenant. Every physical location and every distributed-state key
 * is produced with this as its first component (R-17.16: tenant identifier is the leading component),
 * so a purge or an isolation boundary is a prefix operation.
 */
export function tenantPartition(ctx: TenantContext): string {
  return `t/${ctx.tenantSlug}`;
}
