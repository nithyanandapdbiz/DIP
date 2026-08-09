/**
 * Tenant Configuration Repository — the canonical home of a tenant's SSOT.
 *
 * TRACEABILITY
 *   Architecture : 19-repository-ownership.md (tenant registry & lifecycle are IP-owned) · 21-tenant-lifecycle.md
 *   ADR          : ADR-0032 (Tenant Configuration Repository) · ADR-0031 · ADR-0030
 *
 * ONE FILE PER TENANT, ENRICHED PROGRESSIVELY. Stage 1 creates `tenants/<slug>/tenant.json`
 * immediately; every later stage updates the SAME file. There is no transient configuration
 * model and no second copy — the session holds orchestration metadata only, the repository
 * holds the truth. The store is injected: an in-memory store for tests, a file store for the
 * real `tenants/` tree, both behind one interface (the durability signal a scaled deployment
 * replaces, as elsewhere).
 */
import {
  mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, accessSync,
  openSync, closeSync, fsyncSync, renameSync, constants as fsConstants,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { normaliseTenantSlug } from '@dbiz/platform-providers';
import type { ConnectionSelection } from './onboarding-session.js';
import {
  type TenantEnvelope, type WelcomeInput, type OnboardingStatus, type CapabilityUpdateEvent,
  initialConfiguration, audit, emitUpdate, setStage, deriveIsolation,
} from './tenant-config.js';
import { capabilityScaffold, integrationScaffold } from './solution-export.js';
import { buildApplicationPlane, applicationConfigDocument } from './application-plane.js';
import {
  type ManifestVersionInfo, stampPublished, markInstalled, checkCompatibility, updateHistory, buildUpdatePayload,
} from './update-management.js';
import type { DetachedSignature } from './package-signing.js';
import {
  type DiscoveredMetadata,
  normaliseProjectManagement, normaliseTestManagement, normaliseApplication, detectFramework,
} from './discovery.js';
import type { RecommendationSet } from './recommendations.js';
import {
  type CanonicalState, isLegalCanonicalTransition, projectLifecycle,
  validateOnboarding, CAPABILITIES_WITH_EXECUTION_PATH,
} from '../domain/index.js';
import { SUPPORTED } from '@dbiz/platform-core';

// ── Store abstraction ────────────────────────────────────────────────────────

export interface TenantConfigStore {
  read(slug: string): TenantEnvelope | undefined;
  write(slug: string, env: TenantEnvelope): void;
  exists(slug: string): boolean;
  remove(slug: string): void;
  list(): readonly TenantEnvelope[];
  readonly durable: boolean;
  /**
   * Cheap liveness check on the backing store, for the readiness probe. OPTIONAL, so every existing
   * implementation of this interface stays valid (no breaking change); a store that does not implement
   * it is treated as available. Throws when the store cannot be reached.
   *
   * It exists so readiness does NOT have to call `list()`, which reads and parses every tenant manifest
   * — a cost the probe would pay every 10 seconds, forever, on the platform's single replica.
   */
  probe?(): void;
}

export class InMemoryTenantConfigStore implements TenantConfigStore {
  private readonly tenants = new Map<string, TenantEnvelope>();
  readonly durable = false;
  read(slug: string): TenantEnvelope | undefined { const e = this.tenants.get(slug); return e ? structuredClone(e) : undefined; }
  write(slug: string, env: TenantEnvelope): void { this.tenants.set(slug, structuredClone(env)); }
  exists(slug: string): boolean { return this.tenants.has(slug); }
  remove(slug: string): void { this.tenants.delete(slug); }
  list(): readonly TenantEnvelope[] { return [...this.tenants.values()].map((e) => structuredClone(e)); }
}

/** Writes the real `tenants/<slug>/tenant.json` tree, Git-versionable and human-diffable. */
export class FileTenantConfigStore implements TenantConfigStore {
  readonly durable = true;
  constructor(private readonly rootDir: string) {}

  /**
   * Resolve a tenant's directory — the ONLY place a slug becomes a filesystem path.
   *
   * DEFENCE IN DEPTH (CWE-22). `route()` already validates the slug, so a traversal cannot arrive here
   * through the HTTP surface. This is the second, independent barrier for every OTHER caller — the
   * registration handler, the dashboard, a future transport, a test — because a containment rule that
   * lives only in the router is one new call site away from being bypassed again.
   *
   * Two checks, deliberately not one: `normaliseTenantSlug` rejects the shape (traversal, separators,
   * case), and the resolved-prefix assertion rejects the RESULT, catching anything the shape rule might
   * not anticipate on a platform with different path semantics (Windows `\`, UNC, drive-relative paths).
   */
  private dir(slug: string): string {
    const safe = normaliseTenantSlug(slug);
    const full = resolve(this.rootDir, safe);
    const root = resolve(this.rootDir);
    if (full !== join(root, safe) || !full.startsWith(root + sep)) {
      throw new Error(`tenant slug "${slug}" escapes the tenant root`);
    }
    return full;
  }
  private file(slug: string): string { return join(this.dir(slug), 'tenant.json'); }
  read(slug: string): TenantEnvelope | undefined {
    const f = this.file(slug);
    if (!existsSync(f)) return undefined;
    return JSON.parse(readFileSync(f, 'utf8')) as TenantEnvelope;
  }
  /**
   * Persist a tenant manifest ATOMICALLY.
   *
   * `writeFileSync` straight onto the target truncates it and then streams the new content, so a crash,
   * a SIGTERM during a Container Apps revision swap, or a disconnect on the Azure Files SMB mount could
   * leave `tenant.json` truncated or half-written. This file is the tenant's SINGLE source of truth by
   * design (ADR-0032) — there is no second copy to recover from, and a torn write is unrecoverable.
   *
   * Write-temp-then-rename makes the replacement atomic: a reader sees either the whole old file or the
   * whole new one, never a partial. `fsync` on the temp file before the rename is the part that is
   * easy to omit and that matters — without it the rename can reach the disk before the CONTENT it
   * points at, which is precisely how a crash yields a correctly-named empty file.
   */
  write(slug: string, env: TenantEnvelope): void {
    const dir = this.dir(slug);
    mkdirSync(dir, { recursive: true });
    const target = this.file(slug);
    // Unique per write so two writers can never share a temp path (belt-and-braces; the platform is
    // single-replica today and Node's synchronous handlers do not interleave).
    const tmp = join(dir, `.tenant.json.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    let fd: number | undefined;
    try {
      fd = openSync(tmp, 'w');
      writeFileSync(fd, `${JSON.stringify(env, null, 2)}\n`, 'utf8');
      fsyncSync(fd);      // content is durable BEFORE the rename publishes it
      closeSync(fd);
      fd = undefined;
      renameSync(tmp, target); // atomic replace within the same directory
    } catch (e) {
      if (fd !== undefined) { try { closeSync(fd); } catch { /* already closed */ } }
      // Never leave a temp file behind to be mistaken for state or to accumulate on the mount.
      try { if (existsSync(tmp)) rmSync(tmp, { force: true }); } catch { /* best effort */ }
      throw e;
    }
  }
  exists(slug: string): boolean { return existsSync(this.file(slug)); }
  remove(slug: string): void { if (existsSync(this.dir(slug))) rmSync(this.dir(slug), { recursive: true, force: true }); }
  /** O(1) reachability check on the tenant root — the readiness signal, without reading any manifest. */
  probe(): void { accessSync(this.rootDir, fsConstants.R_OK | fsConstants.W_OK); }
  /**
   * Every tenant on disk. A directory whose NAME is not a legal slug is skipped rather than thrown on:
   * `dir()` now refuses such a name, and a single stray directory under the state mount must not be able
   * to break listing for every tenant (which would take down the dashboard and the health probe).
   * Skipping is the fail-safe direction here — an unaddressable directory is not a tenant.
   */
  list(): readonly TenantEnvelope[] {
    if (!existsSync(this.rootDir)) return [];
    return readdirSync(this.rootDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => { try { return this.read(d.name); } catch { return undefined; } })
      .filter((e): e is TenantEnvelope => e !== undefined);
  }
}

// ── Repository ────────────────────────────────────────────────────────────────

const GIT_PROVIDER: Readonly<Record<string, string>> = { github: 'github', 'azure-repos': 'azure-repos', gitlab: 'gitlab' };
const VALID_TM = new Set(['zephyr-essential', 'zephyr-scale', 'xray', 'testrail', 'azure-test-plans']);

/**
 * ADR-0085 §5 — THE MIGRATION RULING, AND IT REACHES EVERY TENANT ALREADY IN THE FIELD.
 *
 * A record written before `repositoryDisposition` existed asserts NO disposition, because there was
 * no field in which to assert one. It is marked `'unknown'` on the way out — as a VALUE, so that the
 * state "nobody has answered this" is representable rather than inferable.
 *
 * THE ALTERNATIVE IS THE ONE ADR-0085 §3 REJECTS, ARRIVING BY A DIFFERENT ROUTE. Reading silence as
 * `create-if-absent` would give EVERY EXISTING TENANT A POLICY NOBODY CHOSE — the rejected inference
 * arriving through MIGRATION instead of through design, which is how a rejected alternative actually
 * returns: nobody re-argues it, a default is simply picked for the records that lack the field. The
 * harm is permanent rather than theoretical, because a tenant whose plan name does not match the
 * composed convention gets a SECOND PLAN, and a container is not renamed once assets hang off it.
 *
 * `'unknown'` IS NEVER A PASS — CHARTER §17.1's `NOT MEASURED` rule at the configuration layer. A
 * consumer that finds it refuses with a reason naming the migration; it does not choose a policy.
 * Resolution is per tenant: a re-onboarding, or an explicit amendment (D-133).
 *
 * IT MARKS RATHER THAN WRITES. Nothing is persisted here, so an un-migrated record stays visibly
 * un-migrated on disk, and the marker can never be mistaken later for an answer the tenant gave.
 */
function hydrate(env: TenantEnvelope | undefined): TenantEnvelope | undefined {
  if (!env) return env;
  const tm = env.configuration?.customerOwned?.testManagement;
  // A tenant with NO test-management provider has no test repository, so it has no disposition
  // rather than an unrecorded one. Marking those records `'unknown'` would manufacture a migration
  // obligation for tenants that never had the thing being migrated — and, worse, it would make the
  // marker mean two different things: "predates the field" and "not applicable".
  if (tm && tm.provider !== 'none' && tm.repositoryDisposition === undefined) tm.repositoryDisposition = 'unknown';
  return env;
}

/**
 * Resolve a coherent technology profile from a chosen language (and optional preferred framework),
 * using the platform's SUPPORTED matrix so the generated EP solution is always buildable. Language is
 * primary — it constrains the framework, test runner and package manager (e.g. java ⇒ selenium/junit5/maven,
 * python ⇒ playwright/pytest/pip). An unknown language leaves the profile unchanged (null).
 */
function resolveProfile(
  language: string | undefined,
  preferredFramework: string | undefined,
): { language: string; framework: string; testRunner: string; packageManager: string } | null {
  if (!language) return null;
  const forLang = SUPPORTED.filter((s) => s.language === language);
  if (forLang.length === 0) return null;
  const combo = forLang.find((s) => s.framework === preferredFramework) ?? forLang[0]!;
  return {
    language,
    framework: combo.framework,
    testRunner: combo.testRunners[0]!,
    packageManager: combo.packageManagers[0]!,
  };
}

export interface RepositoryOptions {
  readonly now?: () => string;
  /** Mints an opaque tenant identifier (R-21.3). Injected for deterministic tests. */
  readonly newTenantId?: () => string;
}

export interface TenantSummary {
  readonly slug: string;
  readonly displayName: string;
  readonly status: OnboardingStatus;
  readonly progress: number;
  readonly currentStage: string;
  readonly tenantId: string;
  readonly updatedAt: string;
}

export class TenantConfigRepository {
  private readonly now: () => string;
  private readonly newTenantId: () => string;

  constructor(private readonly store: TenantConfigStore, options: RepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.newTenantId = options.newTenantId ?? defaultTenantId;
  }

  /** Stage 1 — create the tenant folder + tenant.json immediately, and open its audit trail. */
  createFromWelcome(w: WelcomeInput): TenantEnvelope {
    const slug = slugify(w.tenantName);
    if (this.store.exists(slug)) throw new Error(`tenant "${slug}" already exists`);
    // A slug differing from an existing one ONLY by separators is the same tenant entered twice
    // ("CarlisleHomes" vs "Carlisle Homes" → "carlislehomes" vs "carlisle-homes"). Unguarded, each
    // spelling mints its own opaque tenantId and its own credentials; a solution package generated
    // from one then 403s against an EP token issued by the other. That failure is invisible here and
    // surfaces only at runtime in the customer's plane, so it is refused at the point of creation.
    // Substantive differences ("Carlisle Prod" vs "Carlisle Test") are untouched.
    const twin = this.store.list().find((e) => identityKey(e.onboarding.slug) === identityKey(slug));
    if (twin) {
      throw new Error(
        `tenant "${twin.onboarding.slug}" already exists for that name — "${w.tenantName}" differs from it ` +
        `only by separators. Reuse that tenant, or choose a name that differs in substance.`);
    }
    const at = this.now();
    const tenantId = this.newTenantId();
    const env: TenantEnvelope = {
      schemaVersion: '1.0.0',
      onboarding: {
        tenantId, slug, displayName: w.organisationName,
        administrators: [{ name: w.primaryAdministrator, ...(w.primaryAdministratorEmail ? { email: w.primaryAdministratorEmail } : {}) }],
        status: 'Onboarding', currentStage: 'welcome', progress: 16,
        createdAt: at, updatedAt: at, audit: [],
      },
      configuration: initialConfiguration(w, slug),
      isolation: deriveIsolation(tenantId, ['functional-testing']),
      multiTenancy: { isolationModel: 'physical-path', tenantScoped: true },
      provenance: {},
    };
    audit(env, 'tenant-created', `tenant ${env.onboarding.tenantId} created from Welcome`, at);
    setStage(env, 'connect');
    this.store.write(slug, env);
    return env;
  }

  load(slug: string): TenantEnvelope | undefined { return hydrate(this.store.read(slug)); }

  /** Readiness signal: throws when the backing store is unreachable. O(1) where the store supports it. */
  probe(): void { this.store.probe?.(); }

  /** List for Tenant Management — a tenant appears here the instant Stage 1 completes. */
  list(): readonly TenantSummary[] {
    return this.store.list().map((e) => ({
      slug: e.onboarding.slug, displayName: e.onboarding.displayName, status: e.onboarding.status,
      progress: e.onboarding.progress, currentStage: e.onboarding.currentStage, tenantId: e.onboarding.tenantId,
      updatedAt: e.onboarding.updatedAt,
    }));
  }

  private mutate(slug: string, stage: TenantEnvelope['onboarding']['currentStage'], event: string, f: (env: TenantEnvelope) => void): TenantEnvelope {
    const env = hydrate(this.store.read(slug));
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    f(env);
    setStage(env, stage);
    audit(env, event, `updated at stage ${stage}`, this.now());
    this.store.write(slug, env);
    return env;
  }

  /** Stage 2 — record connected providers (selection only). */
  enrichIntegrations(slug: string, selections: readonly ConnectionSelection[]): TenantEnvelope {
    return this.mutate(slug, 'discovery', 'integrations-updated', (env) => {
      const co = env.configuration.customerOwned;
      for (const s of selections) {
        if (!s.connected) continue;
        if (s.kind === 'project-management') co.projectManagement.provider = s.provider;
        else if (s.kind === 'test-management') {
          co.testManagement.provider = VALID_TM.has(s.provider) ? s.provider : 'none';
          // ADR-0085. Recorded ONLY when the tenant supplied it. An `undefined` here leaves the
          // field absent, which is "not answered yet" — writing a value on their behalf would be
          // the default §4.1 rejects, installed one layer below the schema that refuses it.
          if (s.repositoryDisposition !== undefined) co.testManagement.repositoryDisposition = s.repositoryDisposition;
          if (s.baseUrl !== undefined) co.testManagement.baseUrl = s.baseUrl;
          if (s.planId !== undefined) co.testManagement.planId = s.planId;
          if (s.planName !== undefined) co.testManagement.planName = s.planName;
          if (s.suiteId !== undefined) co.testManagement.suiteId = s.suiteId;
          if (s.suiteName !== undefined) co.testManagement.suiteName = s.suiteName;
          if (s.suiteKind !== undefined) co.testManagement.suiteKind = s.suiteKind;
        }
        else if (s.kind === 'ai') co.ai.providerHandle = `handle:${s.provider}`;
        else if (s.kind === 'source-control') env.configuration.technologyProfile.gitProvider = GIT_PROVIDER[s.provider] ?? 'github';
      }
    });
  }

  /** Stage 3 — write edge-discovered metadata INTO the canonical config (no separate model). */
  enrichDiscovery(slug: string, discovered: DiscoveredMetadata): TenantEnvelope {
    return this.mutate(slug, 'recommendations', 'discovery-updated', (env) => {
      const co = env.configuration.customerOwned;
      if (discovered.projectManagement) co.projectManagement = normaliseProjectManagement(discovered.projectManagement);
      // ADR-0085. Discovery refines what the edge can OBSERVE — the provider, the project key. The
      // DISPOSITION and the plan/suite identities are customer DECLARATIONS the edge cannot detect,
      // exactly as `applicationTypes` and the MFA posture are, so they are CARRIED FORWARD rather
      // than overwritten by enrichment.
      //
      // This replacement was wholesale, and left as such it would have silently dropped a
      // disposition the tenant had already declared at Stage 2 — the tenant would then fail
      // certification for a question they HAD answered, and the answer would be gone from the
      // record. It is the same defect this function already guards one field down, for the same
      // reason: enrichment must never overwrite what only the customer can know.
      if (discovered.testManagement) {
        const declared = co.testManagement;
        co.testManagement = {
          ...normaliseTestManagement(discovered.testManagement),
          ...(declared?.repositoryDisposition !== undefined ? { repositoryDisposition: declared.repositoryDisposition } : {}),
          ...(declared?.baseUrl !== undefined ? { baseUrl: declared.baseUrl } : {}),
          ...(declared?.planId !== undefined ? { planId: declared.planId } : {}),
          ...(declared?.planName !== undefined ? { planName: declared.planName } : {}),
          ...(declared?.suiteId !== undefined ? { suiteId: declared.suiteId } : {}),
          ...(declared?.suiteName !== undefined ? { suiteName: declared.suiteName } : {}),
          ...(declared?.suiteKind !== undefined ? { suiteKind: declared.suiteKind } : {}),
        };
      }
      if (discovered.application) {
        const app = normaliseApplication(discovered.application);
        // Discovery refines what the edge can OBSERVE (name, URL, auth mechanism, browsers). The
        // application CLASS and its MFA posture are customer DECLARATIONS made at Welcome — the edge
        // cannot detect them — so they are carried forward, never overwritten by enrichment. Losing
        // them here silently downgrades a CRM/D365 tenant to the generic web target at export time.
        if (app) {
          co.application = {
            ...app,
            ...(co.application?.applicationTypes ? { applicationTypes: [...co.application.applicationTypes] } : {}),
            ...(co.application?.mfa ? { mfa: { ...co.application.mfa } } : {}),
            browserRequirements: [...app.browserRequirements],
          };
        }
      }
      if (discovered.sourceControl) {
        const fw = detectFramework(discovered.sourceControl);
        if (fw) {
          env.configuration.technologyProfile.framework = fw;
          env.configuration.technologyProfile.testRunner = fw === 'selenium' ? 'jest' : 'playwright-test';
        }
        env.configuration.technologyProfile.gitProvider = GIT_PROVIDER[discovered.sourceControl.provider] ?? 'github';
      }
      env.provenance.discovery = discovered;
    });
  }

  /** Stage 4 — apply recommendations (and overrides) into the canonical config. */
  enrichRecommendations(slug: string, recommendations: RecommendationSet, overrides: { readonly capabilities?: readonly string[]; readonly framework?: string; readonly language?: string } = {}): TenantEnvelope {
    return this.mutate(slug, 'review', 'recommendations-updated', (env) => {
      const caps = overrides.capabilities ?? recommendations.capabilities.value;
      // R-21.11 execution-path guard — mirror setCapability. A capability is entitled ONLY if it has a
      // verified execution path, regardless of how it arrived (recommendation or caller override). Without
      // this, a caller reaching this route could entitle an arbitrary/unbacked capability (least-privilege
      // and the never-entitle-an-unrunnable-capability invariant).
      for (const c of caps) {
        if (!CAPABILITIES_WITH_EXECUTION_PATH.has(c)) throw new Error(`capability "${c}" has no verified execution path (R-21.11)`);
      }
      env.configuration.dbiz.entitledCapabilities = [...caps];
      // Isolation boundaries track entitled capabilities — one manifest, kept coherent.
      env.isolation.capabilityBoundaries = [...caps];

      // Language drives the EP solution. The chosen language (+ preferred framework) is resolved to a
      // coherent, buildable profile via the SUPPORTED matrix — language constrains framework/runner/pm.
      const tp = env.configuration.technologyProfile;
      const language = overrides.language ?? recommendations.language?.value ?? tp.language;
      const framework = overrides.framework ?? recommendations.automationFramework?.value ?? tp.framework;
      const resolved = resolveProfile(language, framework);
      if (resolved) {
        tp.language = resolved.language;
        tp.framework = resolved.framework;
        tp.testRunner = resolved.testRunner;
        tp.packageManager = resolved.packageManager;
      }
      env.provenance.recommendations = recommendations;
    });
  }

  /** Stage 5 — record the certification verdict on the SSOT. */
  recordCertification(slug: string, cert: { ok: boolean; issues: readonly { stage: number; code: string; detail: string }[] }): TenantEnvelope {
    return this.mutate(slug, 'review', 'certification-recorded', (env) => {
      env.provenance.certification = { ok: cert.ok, issues: cert.issues, at: this.now() };
      env.onboarding.status = cert.ok ? 'Certified' : 'Failed';
    });
  }

  /** Stage 6 — record the onboard() outcome (lifecycle state / projection) on the SSOT. */
  recordActivation(slug: string, outcome: { lifecycleState: string; projection: string }): TenantEnvelope {
    return this.mutate(slug, 'activation', 'activated', (env) => {
      env.onboarding.status = 'Provisioned';
      env.onboarding.lifecycleState = outcome.lifecycleState;
      env.onboarding.projection = outcome.projection;
    });
  }

  // ── Import / export / clone ─────────────────────────────────────────────────

  /** Export the canonical tenant.json as text (Git-versionable). */
  exportJson(slug: string): string {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    return `${JSON.stringify(env, null, 2)}\n`;
  }

  /** Import a tenant.json, under its own slug or an override. */
  importJson(text: string, asSlug?: string): TenantEnvelope {
    const env = JSON.parse(text) as TenantEnvelope;
    const slug = asSlug ?? env.onboarding.slug;
    if (this.store.exists(slug)) throw new Error(`tenant "${slug}" already exists`);
    // The opaque tenantId must stay globally unique (R-21.3) — security-critical lookups (e.g. EP
    // registration's resolveSlugByTenantId) assume one tenant per id. An import that reused an id would
    // let one tenant's registration bind to another's slug. Refuse a duplicate id here (the one path that
    // does not mint a fresh id; createFromWelcome/clone always do).
    if (this.store.list().some((e) => e.onboarding.tenantId === env.onboarding.tenantId)) {
      throw new Error(`tenantId "${env.onboarding.tenantId}" already in use`);
    }
    env.onboarding.slug = slug;
    this.store.write(slug, env);
    return env;
  }

  /** Duplicate a tenant under a new slug + fresh opaque identity (never reuse an id, R-21.26). */
  clone(fromSlug: string, toSlug: string): TenantEnvelope {
    const src = this.store.read(fromSlug);
    if (!src) throw new Error(`unknown tenant "${fromSlug}"`);
    if (this.store.exists(toSlug)) throw new Error(`tenant "${toSlug}" already exists`);
    const at = this.now();
    const env: TenantEnvelope = structuredClone(src);
    env.onboarding.slug = toSlug;
    env.onboarding.tenantId = this.newTenantId();
    env.onboarding.createdAt = at;
    env.onboarding.audit = [];
    env.configuration.customer.tenantName = toSlug;
    env.configuration.customerOwned.deployment.executionPlaneName = `${toSlug}_ExecutionPlane`;
    env.isolation.namespace = env.onboarding.tenantId;
    env.isolation.storagePartition = env.onboarding.tenantId;
    audit(env, 'tenant-cloned', `cloned from ${fromSlug}`, at);
    this.store.write(toSlug, env);
    return env;
  }

  /** Delete a tenant from the repository (Tenant Management). */
  delete(slug: string): void {
    if (!this.store.exists(slug)) throw new Error(`unknown tenant "${slug}"`);
    this.store.remove(slug);
  }

  // ── Lifecycle governance operations ─────────────────────────────────────────
  // Intelligence-Plane owned (Doc 19: tenant registry & lifecycle are IP-owned). Each
  // drives the FROZEN canonical state machine (R-21.5) — reused, never duplicated — updates
  // the one tenant.json, records audit, and refuses illegal transitions. The Execution Plane
  // CONSUMES the resulting state (refusal at the PDP, R-21.6/7); it never creates it.

  private applyAndAudit(slug: string, event: string, detail: string, f: (env: TenantEnvelope) => void): TenantEnvelope {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    f(env); // throws before any write, so an illegal op leaves the manifest untouched
    audit(env, event, detail, this.now());
    this.store.write(slug, env);
    return env;
  }

  private setState(env: TenantEnvelope, target: CanonicalState, status: OnboardingStatus): void {
    const from = (env.onboarding.lifecycleState as CanonicalState) ?? 'REGISTERED';
    if (!isLegalCanonicalTransition(from, target)) throw new Error(`illegal transition ${from} -> ${target}`);
    env.onboarding.lifecycleState = target;
    env.onboarding.projection = projectLifecycle(target, new Set());
    env.onboarding.status = status;
  }

  /** Suspend an ACTIVE tenant (ACTIVE→SUSPENDED). A governance decision; the EP honours it. */
  suspend(slug: string, actor = 'platform-admin', reason = 'governance hold'): TenantEnvelope {
    return this.applyAndAudit(slug, 'suspended', `${actor}: ${reason}`, (env) => this.setState(env, 'SUSPENDED', 'Suspended'));
  }
  /** Reactivate a SUSPENDED tenant (SUSPENDED→ACTIVE). */
  reactivate(slug: string, actor = 'platform-admin', reason = 'restored'): TenantEnvelope {
    return this.applyAndAudit(slug, 'reactivated', `${actor}: ${reason}`, (env) => this.setState(env, 'ACTIVE', 'Active'));
  }
  /** Archive a tenant (ACTIVE|SUSPENDED → OFFBOARDING → CLOSED). The manifest is retained (R-21.24). */
  archive(slug: string, actor = 'platform-admin', reason = 'retired'): TenantEnvelope {
    return this.applyAndAudit(slug, 'archived', `${actor}: ${reason}`, (env) => {
      this.setState(env, 'OFFBOARDING', 'Archived');
      this.setState(env, 'CLOSED', 'Archived');
      env.onboarding.projection = 'DECOMMISSIONED';
    });
  }

  /** Enable/disable a capability. Enable is bounded by the R-21.11 execution-path guard. */
  setCapability(slug: string, capability: string, enabled: boolean): TenantEnvelope {
    return this.applyAndAudit(slug, enabled ? 'capability-enabled' : 'capability-disabled', capability, (env) => {
      const caps = new Set(env.configuration.dbiz.entitledCapabilities);
      if (enabled) {
        if (!CAPABILITIES_WITH_EXECUTION_PATH.has(capability)) throw new Error(`capability "${capability}" has no verified execution path (R-21.11)`);
        caps.add(capability);
      } else {
        caps.delete(capability);
      }
      env.configuration.dbiz.entitledCapabilities = [...caps];
      env.isolation.capabilityBoundaries = [...caps];
      // Once the tenant is live (its EP exists), record an update event for the EP to pull and apply.
      if (env.onboarding.lifecycleState) {
        emitUpdate(env, {
          type: enabled ? 'capability-added' : 'capability-removed', capability,
          // Specialised to THIS tenant's application target, exactly as generation would have
          // emitted it. A generic scaffold pulled by a live Execution Plane would overwrite the
          // target-specific concurrency, adapter class and strategies its capabilities depend on.
          ...(enabled ? { config: capabilityScaffold(capability, buildApplicationPlane(env)) } : {}),
        }, this.now());
      }
    });
  }

  /**
   * Enable/disable an integration (e.g. 'ai'). On a live tenant this emits an integration-enabled/disabled
   * update event carrying the EP config scaffold, which the EP pulls and applies (INV-3). AI vendor/key are
   * resolved in the EP, never in the IP (INV-9).
   */
  setIntegration(slug: string, integration: string, enabled: boolean): TenantEnvelope {
    return this.applyAndAudit(slug, enabled ? 'integration-enabled' : 'integration-disabled', integration, (env) => {
      if (integration === 'ai') {
        env.configuration.customerOwned.ai.providerHandle = enabled ? 'handle:capability' : 'ai-none';
        if (!enabled) env.configuration.customerOwned.ai.capabilityClasses = [];
      } else {
        throw new Error(`unknown integration "${integration}"`);
      }
      if (env.onboarding.lifecycleState) {
        const config = enabled ? integrationScaffold(integration, env.configuration.customerOwned.ai as unknown as Record<string, unknown>) : null;
        emitUpdate(env, {
          type: enabled ? 'integration-enabled' : 'integration-disabled', integration,
          ...(config ? { config } : {}),
        }, this.now());
      }
    });
  }

  /** The current EP-token version for a tenant (0 = none issued / tenant unknown). */
  epTokenVersion(slug: string): number {
    return this.store.read(slug)?.onboarding.epToken?.version ?? 0;
  }

  /** Record EP-token METADATA (never the token). Bumps the version → revokes prior tokens. */
  recordEpToken(slug: string, meta: { version: number; issuedAt: string; expiresAt: string; last4: string }): TenantEnvelope {
    return this.applyAndAudit(slug, 'ep-token-issued', `v${meta.version} (…${meta.last4})`, (env) => {
      env.onboarding.epToken = meta;
    });
  }

  /** The change events for the EP to pull — all, or only those still pending. */
  /**
   * Record the CURRENT package verification key set for a tenancy (ADR-0081 P-81.4, D-123 link 1).
   *
   * PUBLIC MATERIAL ONLY — R-08.15 makes verification keys public-verification-only, so nothing
   * INV-2 protects crosses. The event rides the channel the Execution Plane already polls, so
   * rotation needs no new route and no customer redeployment (R-08.16, ADR-0007 §6).
   *
   * AUDITED LIKE EVERY OTHER MANIFEST CHANGE. A key set reaching a tenancy is a trust event, and a
   * trust event that leaves no audit line is one nobody can reconstruct after an incident.
   */
  recordVerificationKeys(
    slug: string,
    keys: readonly { keyId: string; publicKeyPem: string; algorithm: string }[],
  ): TenantEnvelope {
    return this.applyAndAudit(slug, 'verification-keys-distributed', keys.map((k) => k.keyId).join(', '), (env) => {
      emitUpdate(env, { type: 'verification-keys-changed', config: { keys: keys.map((k) => ({ ...k })) } }, this.now());
    });
  }

  /**
   * Tell a tenancy where to ask for work (ADR-0080 §6 step 5).
   *
   * The event carries the path and the cadence together, because a path with no interval leaves the
   * Execution Plane to invent one — and an invented cadence is a load decision made by the party
   * that cannot see the load.
   */
  recordWorkPath(slug: string, workPath: string, pollingIntervalSeconds: number): TenantEnvelope {
    return this.applyAndAudit(slug, 'work-path-distributed', workPath, (env) => {
      emitUpdate(env, { type: 'work-path-changed', config: { workPath, pollingIntervalSeconds } }, this.now());
    });
  }

  listUpdates(slug: string, onlyPending = false): readonly CapabilityUpdateEvent[] {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    const updates = env.onboarding.updates ?? [];
    return onlyPending ? updates.filter((u) => u.status === 'pending') : updates;
  }

  /** The EP acknowledges an applied update; the IP marks it applied (idempotent). */
  acknowledgeUpdate(slug: string, updateId: string): TenantEnvelope {
    return this.applyAndAudit(slug, 'update-acknowledged', updateId, (env) => {
      const u = (env.onboarding.updates ?? []).find((x) => x.id === updateId);
      if (!u) throw new Error(`unknown update "${updateId}"`);
      const m = u as { status: string; appliedAt?: string };
      if (m.status !== 'applied') { m.status = 'applied'; m.appliedAt = this.now(); }
    });
  }

  /** Generic configuration edit: deep-merge a patch, re-validate BEFORE persisting (P7), re-certify. */
  updateConfiguration(slug: string, patch: Record<string, unknown>): TenantEnvelope {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    const candidate = deepMerge(structuredClone(env.configuration) as unknown as Record<string, unknown>, patch);
    const validation = validateOnboarding(candidate);
    if (!validation.ok) throw new Error(`invalid configuration: ${validation.issues.map((i) => i.detail).join('; ')}`);
    env.configuration = candidate as unknown as TenantEnvelope['configuration'];
    env.provenance.certification = { ok: true, issues: [], at: this.now() };
    audit(env, 'configuration-updated', Object.keys(patch).join(', '), this.now());
    // A live tenant's EP must apply the config change — record an event for it to pull. The
    // regenerated APPLICATION BAND travels with it: a patch that changes the declared application
    // class (or its MFA posture) changes the target's whole strategy set, and an EP left holding
    // the previous band would keep discovering and executing the old way while its manifest said
    // otherwise. The band is derived and non-secret, so sending it always is cheaper than deciding
    // whether this particular patch happened to touch it.
    if (env.onboarding.lifecycleState) {
      emitUpdate(env, {
        type: 'configuration-changed',
        config: { ...patch, application: applicationConfigDocument(buildApplicationPlane(env), env) },
      }, this.now());
    }
    this.store.write(slug, env);
    return env;
  }

  /**
   * Persist the presentation branding band (ADR-0035 R-35.7). Presentation only — never execution config,
   * never consumed by onboard(). A logo must be a self-contained data: URI (no external URL), and no secret
   * may be stored here (INV-2). Requires tenant:configure (all PATCH routes do; authz.ts).
   */
  setBranding(slug: string, band: Record<string, unknown>): TenantEnvelope {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    const logo = band['logoDataUri'];
    if (typeof logo === 'string' && logo && !logo.startsWith('data:')) throw new Error('logoDataUri must be a self-contained data: URI, never an external URL (sovereignty)');
    const allowed = ['companyName', 'productName', 'monogram', 'themeNavy', 'themeAccent', 'logoDataUri'];
    const next: Record<string, unknown> = { ...(env.branding ?? {}) };
    for (const k of allowed) if (band[k] !== undefined) next[k] = typeof band[k] === 'string' ? band[k] : String(band[k]);
    env.branding = next as NonNullable<TenantEnvelope['branding']>;
    audit(env, 'branding-updated', Object.keys(next).join(', '), this.now());
    this.store.write(slug, env);
    return env;
  }

  // ── Software Update Management (ADR-0035) — the IP PUBLISHES; the EP always PULLS (INV-3) ─────────
  // No second store: version state lives on tenant.json (`epSolution`); all logic is reused from
  // update-management.ts, all eventing from emitUpdate, all trail from audit.

  /** Record a published solution update: stamp the version band, emit a `solution-update` pull event, audit. */
  recordSolutionUpdate(slug: string, manifest: ManifestVersionInfo, signature: DetachedSignature, packageRef: string, mandatory: boolean): TenantEnvelope {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    const at = this.now();
    env.epSolution = stampPublished(manifest, signature.keyId, at, env.epSolution);
    const payload = buildUpdatePayload(manifest, signature, packageRef, mandatory, at);
    emitUpdate(env, { type: 'solution-update', config: payload as unknown as Record<string, unknown> }, at);
    audit(env, 'solution-update-published', `${payload.version} (${manifest.contentHash.slice(0, 16)}) signed ${signature.keyId}`, at);
    this.store.write(slug, env);
    return env;
  }

  /** The EP reports the version it actually installed (EP-initiated telemetry after a verified install). */
  recordInstalledVersion(slug: string, version: string, hash: string): TenantEnvelope {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    if (!env.epSolution) throw new Error('no published solution version to record an install against');
    const at = this.now();
    env.epSolution = markInstalled(env.epSolution, version, hash, at);
    audit(env, 'solution-update-installed', `${version} (${hash.slice(0, 16)})`, at);
    this.store.write(slug, env);
    return env;
  }

  /** Record a rollback to the prior version — the EP restores its own backup; the IP records intent + audit. */
  recordRollback(slug: string, reason?: string): TenantEnvelope {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    const v = env.epSolution;
    if (!v || !v.rollbackPoint) throw new Error('no rollback point available');
    const at = this.now();
    env.epSolution = { ...v, installedVersion: v.rollbackPoint.version, installedHash: v.rollbackPoint.hash, installedAt: at, status: 'rolled-back' };
    audit(env, 'solution-update-rolledback', `${v.rollbackPoint.version}${reason ? ` — ${reason}` : ''}`, at);
    this.store.write(slug, env);
    return env;
  }

  /** The update-management slice of the tenant audit trail (reuse updateHistory; no second store). */
  solutionUpdateHistory(slug: string): ReturnType<typeof updateHistory> {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    return updateHistory(env.onboarding.audit);
  }

  /** Compatibility of the published solution vs the EP's reported versions (reuse checkCompatibility). */
  checkSolutionCompatibility(slug: string, ep: Record<string, unknown>): ReturnType<typeof checkCompatibility> {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    const s = (k: string): string | undefined => (typeof ep[k] === 'string' ? ep[k] as string : undefined);
    return checkCompatibility({
      publishedContractVersion: env.configuration.dbiz?.contractVersion ?? '1.0.0',
      ...(s('contractVersion') ? { installedContractVersion: s('contractVersion')! } : {}),
      publishedSchemaVersion: env.schemaVersion,
      ...(s('schemaVersion') ? { installedSchemaVersion: s('schemaVersion')! } : {}),
      ...(s('runtimeVersion') ? { epRuntimeVersion: s('runtimeVersion')! } : {}),
      ...(s('minRuntimeVersion') ? { minRuntimeVersion: s('minRuntimeVersion')! } : {}),
      publishedCapabilities: [...env.configuration.dbiz.entitledCapabilities],
      ...(Array.isArray(ep['capabilities']) ? { installedCapabilities: ep['capabilities'] as string[] } : {}),
    });
  }

  /** Sync Configuration — nudge the EP to re-pull current operational config (reuses the config-changed event). */
  syncConfiguration(slug: string): readonly CapabilityUpdateEvent[] {
    const env = this.store.read(slug);
    if (!env) throw new Error(`unknown tenant "${slug}"`);
    const at = this.now();
    emitUpdate(env, {
      type: 'configuration-changed',
      config: {
        resync: true,
        entitledCapabilities: [...env.configuration.dbiz.entitledCapabilities],
        application: applicationConfigDocument(buildApplicationPlane(env), env),
      },
    }, at);
    audit(env, 'configuration-resync', 'operator-triggered EP configuration re-sync', at);
    this.store.write(slug, env);
    return env.onboarding.updates ?? [];
  }
}

/**
 * Recursive object merge for configuration patches (arrays and scalars are replaced, not merged).
 *
 * SECURITY (CWE-1321 prototype pollution; OWASP API8). The patch is attacker-influenced JSON delivered
 * to `PATCH /api/tenants/:slug/configuration`. A key of `__proto__`, `constructor` or `prototype` in a
 * JSON body is an OWN enumerable property (JSON.parse never invokes the prototype setter), so an
 * unguarded merge would recurse into `Object.prototype` via `base['__proto__']` and pollute it
 * process-wide — corrupting the shared object model the authz layer itself relies on, across every
 * tenant. Such keys are never valid in an OnboardingConfiguration, so they are refused loudly
 * (D-013 fail-loud) BEFORE any assignment, at every depth, rather than silently dropped.
 */
const FORBIDDEN_MERGE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(patch)) {
    if (FORBIDDEN_MERGE_KEYS.has(k)) {
      throw new Error(`invalid configuration: illegal key "${k}" (prototype-pollution guard)`);
    }
    const cur = base[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      base[k] = deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      base[k] = v;
    }
  }
  return base;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive an addressable slug from a tenant name.
 *
 * Capped at 63 characters so every slug this function mints also satisfies `normaliseTenantSlug`
 * (/^[a-z0-9][a-z0-9-]{0,62}$/), which is now enforced on the request path. Without the cap a tenant
 * created from a long organisation name would be written to disk and then be permanently unaddressable
 * — created successfully, then 400 on every subsequent request. The trailing-hyphen strip is repeated
 * after truncation because slicing can land on one.
 */
function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const capped = s.slice(0, 63).replace(/-+$/g, '');
  return capped.length > 0 ? capped : 'tenant';
}

/**
 * Separator-insensitive identity of a slug, used only to detect duplicate tenants at creation.
 *
 * `slugify` maps each run of non-alphanumerics to a single hyphen, so two spellings of one customer
 * name ("CarlisleHomes", "Carlisle Homes") produce two different slugs that address the same real
 * tenant. Collapsing the hyphens yields the key on which that collision is visible. It deliberately
 * does NOT collapse anything else: names differing in substance keep distinct keys.
 */
function identityKey(slug: string): string {
  return slug.replace(/-/g, '');
}

function defaultTenantId(): string {
  // Opaque and meaningless (R-21.3). Uniqueness only — carries no isolation semantics.
  return `tnt-${randomBytes(6).toString('hex')}`;
}
