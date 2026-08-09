/**
 * Dashboard queries — the logic behind Tenant Management's list, search, filter and sort.
 *
 * TRACEABILITY
 *   ADR : ADR-0033 (the React dashboard is presentation over this tested logic)
 *
 * PRESENTATION-FREE. These are pure functions over the tenant summaries the repository already
 * derives from the manifests. The React dashboard renders their output and owns no tenant data
 * of its own — the authoritative source is always tenant.json. Building the query logic here (not
 * in the view) keeps "search returns the right tenants" a tested guarantee, not a UI accident.
 */
import type { TenantSummary } from './tenant-repository.js';
import type { OnboardingStatus } from './tenant-config.js';

export type TenantSort = 'recently-updated' | 'name' | 'progress';

export interface DashboardQuery {
  readonly search?: string;
  readonly status?: OnboardingStatus;
  readonly sort?: TenantSort;
}

/** Case-insensitive match over the human-facing fields (name, slug, id). */
export function searchTenants(tenants: readonly TenantSummary[], query: string): readonly TenantSummary[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return tenants;
  return tenants.filter((t) =>
    t.displayName.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || t.tenantId.toLowerCase().includes(q));
}

export function filterByStatus(tenants: readonly TenantSummary[], status: OnboardingStatus): readonly TenantSummary[] {
  return tenants.filter((t) => t.status === status);
}

export function sortTenants(tenants: readonly TenantSummary[], by: TenantSort): readonly TenantSummary[] {
  const copy = [...tenants];
  switch (by) {
    case 'recently-updated': return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    case 'name': return copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
    case 'progress': return copy.sort((a, b) => b.progress - a.progress);
    default: { const exhaustive: never = by; throw new Error(`unknown sort ${String(exhaustive)}`); }
  }
}

/** The dashboard's data pipeline: search → filter → sort. What the view renders. */
export function queryDashboard(tenants: readonly TenantSummary[], query: DashboardQuery = {}): readonly TenantSummary[] {
  let result = tenants;
  if (query.search) result = searchTenants(result, query.search);
  if (query.status) result = filterByStatus(result, query.status);
  result = sortTenants(result, query.sort ?? 'recently-updated');
  return result;
}
