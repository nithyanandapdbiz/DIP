/**
 * TenantApiClient — the web tier's typed data layer over the tenant REST API.
 *
 * TRACEABILITY
 *   ADR : ADR-0033 (production web tier) · ADR-0032 (the API operates on the SSOT)
 *
 * THE SPA'S ONLY DOOR TO THE TENANT. The frontend holds no configuration and no business logic
 * (R-33.2); it reads and writes `tenant.json` exclusively through these calls. The client is
 * transport only — typed request/response, no decisions. `fetch` is injected so the contract is
 * testable against the real server without a browser.
 */
import type { TenantEnvelope, WelcomeInput } from './tenant-config.js';
import type { ConnectionSelection } from './onboarding-session.js';
import type { DiscoveredMetadata } from './discovery.js';
import type { RecommendationSet } from './recommendations.js';
import type { TenantSummary } from './tenant-repository.js';
import type { ActivationOutcome, ActivationCertification } from './experience-orchestrator.js';
import type { SolutionManifest } from './solution-export.js';
import type { CapabilityUpdateEvent } from './tenant-config.js';
import type { EpTokenResult } from './ep-token.js';
import type { RegistrationOtcResult } from './registration.js';
import type { CompatibilityResult, UpdateHistoryEntry } from './update-management.js';
import type { ApplicationTemplateCatalogue } from './application-catalogue.js';

export type FetchLike = (url: string, init?: {
  method?: string; headers?: Record<string, string>; body?: string;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class TenantApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'TenantApiError'; }
}

export class TenantApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
    /** Bearer token attached to every request (R-33.5); the server resolves it to a principal. */
    private readonly authToken?: string,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.authToken ? { authorization: `Bearer ${this.authToken}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await res.json();
    if (!res.ok) {
      const message = (payload as { error?: string }).error ?? `request failed (${res.status})`;
      throw new TenantApiError(res.status, message);
    }
    return payload as T;
  }

  /**
   * The Application Template catalogue — which application classes exist, what each generates, and
   * the `.env` slots it will carry. The wizard renders its application step from THIS rather than
   * from a list compiled into the bundle, so a newly registered template is selectable without a
   * frontend change.
   */
  applicationTemplates(): Promise<ApplicationTemplateCatalogue> {
    return this.call('GET', '/api/application-templates');
  }
  createTenant(welcome: WelcomeInput): Promise<TenantEnvelope> {
    return this.call('POST', '/api/tenants', welcome);
  }
  listTenants(): Promise<readonly TenantSummary[]> {
    return this.call('GET', '/api/tenants');
  }
  getTenant(slug: string): Promise<TenantEnvelope> {
    return this.call('GET', `/api/tenants/${slug}`);
  }
  getManifest(slug: string): Promise<TenantEnvelope> {
    return this.call('GET', `/api/tenants/${slug}/manifest`);
  }
  connect(slug: string, selections: readonly ConnectionSelection[]): Promise<TenantEnvelope> {
    return this.call('PATCH', `/api/tenants/${slug}/connect`, { selections });
  }
  discovery(slug: string, discovered: DiscoveredMetadata): Promise<TenantEnvelope> {
    return this.call('PATCH', `/api/tenants/${slug}/discovery`, { discovered });
  }
  recommendations(slug: string, recommendations: RecommendationSet, overrides?: { capabilities?: readonly string[]; framework?: string }): Promise<TenantEnvelope> {
    return this.call('PATCH', `/api/tenants/${slug}/recommendations`, { recommendations, ...(overrides ? { overrides } : {}) });
  }
  review(slug: string): Promise<{ certification: ActivationCertification }> {
    return this.call('PATCH', `/api/tenants/${slug}/review`);
  }
  generateSolution(slug: string): Promise<SolutionManifest> {
    return this.call('POST', `/api/tenants/${slug}/solution`);
  }
  activate(slug: string): Promise<ActivationOutcome> {
    return this.call('POST', `/api/tenants/${slug}/activate`);
  }
  deleteTenant(slug: string): Promise<{ deleted: string }> {
    return this.call('DELETE', `/api/tenants/${slug}`);
  }
  // ── Post-activation lifecycle governance (ADR-0034) ──
  suspend(slug: string, reason?: string): Promise<TenantEnvelope> {
    return this.call('POST', `/api/tenants/${slug}/suspend`, reason ? { reason } : undefined);
  }
  reactivate(slug: string, reason?: string): Promise<TenantEnvelope> {
    return this.call('POST', `/api/tenants/${slug}/reactivate`, reason ? { reason } : undefined);
  }
  archive(slug: string, reason?: string): Promise<TenantEnvelope> {
    return this.call('POST', `/api/tenants/${slug}/archive`, reason ? { reason } : undefined);
  }
  setCapability(slug: string, capability: string, enabled: boolean): Promise<TenantEnvelope> {
    return this.call('PATCH', `/api/tenants/${slug}/capabilities`, { capability, enabled });
  }
  setIntegration(slug: string, integration: string, enabled: boolean): Promise<TenantEnvelope> {
    return this.call('PATCH', `/api/tenants/${slug}/integrations`, { integration, enabled });
  }
  updateConfiguration(slug: string, patch: Record<string, unknown>): Promise<TenantEnvelope> {
    return this.call('PATCH', `/api/tenants/${slug}/configuration`, { patch });
  }
  /** Persist presentation branding for the generated portal (ADR-0035 R-35.7). */
  setBranding(slug: string, branding: Record<string, unknown>): Promise<TenantEnvelope> {
    return this.call('PATCH', `/api/tenants/${slug}/branding`, { branding });
  }
  /** The change events the EP pulls (capability added/removed, config changed). */
  listUpdates(slug: string): Promise<readonly CapabilityUpdateEvent[]> {
    return this.call('GET', `/api/tenants/${slug}/updates`);
  }
  /** The EP acknowledges an applied update; the IP marks it applied. */
  acknowledgeUpdate(slug: string, id: string): Promise<TenantEnvelope> {
    return this.call('POST', `/api/tenants/${slug}/updates`, { id });
  }
  /** Generate/regenerate the tenant's EP API token. Returns the full token ONCE; older tokens are revoked. */
  generateEpToken(slug: string): Promise<EpTokenResult> {
    return this.call('POST', `/api/tenants/${slug}/ep-token`);
  }
  /** Mint a fresh one-time registration credential (OTC) for the tenant. Returned ONCE; only its hash is kept. */
  generateOtc(slug: string): Promise<RegistrationOtcResult> {
    return this.call('POST', `/api/tenants/${slug}/otc`);
  }

  // ── Software Update Management (ADR-0035) — the IP publishes, the EP pulls (INV-3). ──
  /** Publish a signed platform update: regenerate the EP solution, sign it, and queue a pull event. */
  publishUpdate(slug: string, mandatory = false): Promise<TenantEnvelope> {
    return this.call('POST', `/api/tenants/${slug}/publish-update`, { mandatory });
  }
  /** Re-emit the tenant's current configuration for the EP to pull (no regeneration). */
  syncConfiguration(slug: string): Promise<TenantEnvelope> {
    return this.call('POST', `/api/tenants/${slug}/sync-config`);
  }
  /** Check whether a candidate EP runtime is compatible with the published solution. */
  checkCompatibility(slug: string, ep: Record<string, unknown>): Promise<CompatibilityResult> {
    return this.call('POST', `/api/tenants/${slug}/check-compatibility`, { ep });
  }
  /** The chronological publish/install/rollback history, derived from the audit trail. */
  updateHistory(slug: string): Promise<readonly UpdateHistoryEntry[]> {
    return this.call('GET', `/api/tenants/${slug}/update-history`);
  }
  /** Roll the recorded EP-solution version back to its prior installed point. */
  rollbackUpdate(slug: string, reason?: string): Promise<TenantEnvelope> {
    return this.call('POST', `/api/tenants/${slug}/rollback`, reason ? { reason } : undefined);
  }
}
