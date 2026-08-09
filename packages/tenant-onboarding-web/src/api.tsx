/**
 * API layer — the SPA's single door to the platform. Presentation reuses the typed client;
 * it holds no tenant configuration and no business logic (ADR-0033 R-33.2). tenant.json remains
 * the SSOT; every call goes React → NestJS → onboarding-experience → tenant-lifecycle → tenant.json.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { TenantApiClient } from '@dbiz/tenant-onboarding-engine/web-client';
import type {
  TenantSummary, TenantEnvelope, WelcomeInput, ConnectionSelection,
  DiscoveredMetadata, RecommendationSet, ActivationOutcome, ActivationCertification, SolutionManifest,
  CapabilityUpdateEvent, EpTokenResult, CompatibilityResult, UpdateHistoryEntry, RegistrationOtcResult,
  ApplicationTemplateCatalogue,
} from '@dbiz/tenant-onboarding-engine';

/** The subset of the API the UI uses. TenantApiClient satisfies it structurally. */
export interface TenantClient {
  /** Application classes and what each generates — the wizard's application step renders from this. */
  applicationTemplates(): Promise<ApplicationTemplateCatalogue>;
  listTenants(): Promise<readonly TenantSummary[]>;
  getManifest(slug: string): Promise<TenantEnvelope>;
  createTenant(welcome: WelcomeInput): Promise<TenantEnvelope>;
  connect(slug: string, selections: readonly ConnectionSelection[]): Promise<TenantEnvelope>;
  discovery(slug: string, discovered: DiscoveredMetadata): Promise<TenantEnvelope>;
  recommendations(slug: string, recommendations: RecommendationSet): Promise<TenantEnvelope>;
  review(slug: string): Promise<{ certification: ActivationCertification }>;
  activate(slug: string): Promise<ActivationOutcome>;
  generateSolution(slug: string): Promise<SolutionManifest>;
  deleteTenant(slug: string): Promise<{ deleted: string }>;
  suspend(slug: string, reason?: string): Promise<TenantEnvelope>;
  reactivate(slug: string, reason?: string): Promise<TenantEnvelope>;
  archive(slug: string, reason?: string): Promise<TenantEnvelope>;
  setCapability(slug: string, capability: string, enabled: boolean): Promise<TenantEnvelope>;
  setIntegration(slug: string, integration: string, enabled: boolean): Promise<TenantEnvelope>;
  updateConfiguration(slug: string, patch: Record<string, unknown>): Promise<TenantEnvelope>;
  listUpdates(slug: string): Promise<readonly CapabilityUpdateEvent[]>;
  acknowledgeUpdate(slug: string, id: string): Promise<TenantEnvelope>;
  generateEpToken(slug: string): Promise<EpTokenResult>;
  generateOtc(slug: string): Promise<RegistrationOtcResult>;
  // Software Update Management (ADR-0035): the IP publishes a signed update; the EP pulls it.
  publishUpdate(slug: string, mandatory?: boolean): Promise<TenantEnvelope>;
  syncConfiguration(slug: string): Promise<TenantEnvelope>;
  checkCompatibility(slug: string, ep: Record<string, unknown>): Promise<CompatibilityResult>;
  updateHistory(slug: string): Promise<readonly UpdateHistoryEntry[]>;
  rollbackUpdate(slug: string, reason?: string): Promise<TenantEnvelope>;
}

const ApiContext = createContext<TenantClient | null>(null);

export function ApiProvider({ client, children }: { client: TenantClient; children: ReactNode }): JSX.Element {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): TenantClient {
  const c = useContext(ApiContext);
  if (!c) throw new Error('useApi used outside ApiProvider');
  return c;
}

/**
 * Build a real client bound to the API base URL and the caller's bearer token.
 *
 * `onUnauthorized` fires when the API rejects the bearer token. The DBIZ session lasts an hour and
 * there is no refresh, so this is the ordinary end of a working session — not an exceptional case.
 * Without it the expiry surfaced as a raw failure on whatever the operator was doing, mid-wizard,
 * with no indication that signing in again was the answer.
 */
export function makeClient(baseUrl: string, token?: string, onUnauthorized?: () => void): TenantClient {
  // fetch must be called with `this === window`; passing it bare (or as a method of the
  // client) throws "Illegal invocation" in the browser. Bind it here.
  const boundFetch = window.fetch.bind(window);
  const fetchImpl = (async (url: string, init?: Parameters<typeof boundFetch>[1]) => {
    const res = await boundFetch(url, init);
    // Only an authenticated call can expire. A 401 with no token is the caller's own problem and
    // must not clear a session that was never established.
    if (res.status === 401 && token) onUnauthorized?.();
    return res;
  }) as unknown as ConstructorParameters<typeof TenantApiClient>[1];
  return new TenantApiClient(baseUrl, fetchImpl, token) as unknown as TenantClient;
}
