/**
 * Tenant Manifest Resolver — the ONE read path every tenant-aware consumer uses.
 *
 * TRACEABILITY
 *   Architecture : 07-tenant-isolation.md · 06-data-sovereignty.md · 19-repository-ownership.md
 *   ADR          : ADR-0032 (tenant.json is the SSOT) · ADR-0031 · ADR-0030
 *
 * ONE SOURCE, MANY READERS. Multi-Tenancy, Tenant Isolation and the Configuration Intelligence
 * reader resolve their view of a tenant FROM the same `tenant.json` through this resolver —
 * they hold no registry, no cache-as-authority, and no copied configuration object. The
 * resolver is read-only: it never writes, so it cannot become a second source of truth.
 *
 * THIS RESOLVER IS THE INTEGRATION SEAM, NOT A REWRITE. It exposes typed views over the
 * manifest so a consumer can adopt the SSOT without the platform's frozen runtime enforcement
 * (platform-runtime `TenantPaths`) being modified. Wiring the frozen runtime to read the file
 * is a separate, security-reviewed, ADR-gated step — deliberately not done here.
 */
import type { TenantConfigRepository } from './tenant-repository.js';
import type { CanonicalConfig, IsolationConfig, MultiTenancyConfig, TenantEnvelope } from './tenant-config.js';

export interface MultiTenancyView {
  readonly tenantId: string;
  readonly slug: string;
  readonly isolationModel: MultiTenancyConfig['isolationModel'];
  readonly tenantScoped: boolean;
  readonly entitledCapabilities: readonly string[];
}

export class TenantManifestResolver {
  constructor(private readonly repo: TenantConfigRepository) {}

  /** The single read. Everything below reads a slice of this and nothing else. */
  resolve(slug: string): TenantEnvelope {
    const env = this.repo.load(slug);
    if (!env) throw new Error(`no tenant manifest for "${slug}"`);
    return env;
  }

  /** Multi-Tenancy resolves the tenant + policy posture from the manifest — no own registry. */
  forMultiTenancy(slug: string): MultiTenancyView {
    const env = this.resolve(slug);
    return {
      tenantId: env.onboarding.tenantId,
      slug: env.onboarding.slug,
      isolationModel: env.multiTenancy.isolationModel,
      tenantScoped: env.multiTenancy.tenantScoped,
      entitledCapabilities: env.configuration.dbiz.entitledCapabilities,
    };
  }

  /** Tenant Isolation resolves its settings from the manifest — no `isolation.json`. */
  forIsolation(slug: string): IsolationConfig {
    return this.resolve(slug).isolation;
  }

  /** Configuration Intelligence resolves configuration directly from the manifest — no cache-as-authority. */
  forConfigIntelligence(slug: string): CanonicalConfig {
    return this.resolve(slug).configuration;
  }
}
