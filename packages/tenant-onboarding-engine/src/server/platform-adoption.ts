/**
 * Provider Platform adoption for the Intelligence Plane API — ADR-0060 §6 Migration strategy, step M-a.
 *
 * TRACEABILITY: 17-deployment-topology.md (R-17.15) · ADR-0060 (Cloud-Native Provider Platform) · ADR-0033
 *
 * The CANONICAL composition of the tested API domain over the certified providers. It sources ALL
 * configuration through the `ConfigurationProvider` and the session secret through the `SecretProvider`
 * — so no runtime code reads `process.env` directly (the entrypoint calls `bootstrapPlatform`, and the
 * few auth-policy variables not in the config schema are read from the provider's captured environment
 * snapshot, never from `process.env`). Backward compatible: the domain wiring (file-backed SSOT, ed25519
 * signing, registration/trust) is UNCHANGED — this adopts the config/secret seam only, additively.
 *
 * It THROWS a typed error on a misconfigured boot; the process entrypoint decides how to report it
 * (so this composition is testable in-process without a container).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PlatformContext } from '@dbiz/platform-providers';
import { sealedPackageService, runRecordService, tenantContext } from '@dbiz/platform-providers';
import {
  TenantConfigRepository,
  FileTenantConfigStore,
  FileRegistrationStore,
  issueRegistrationOtc,
  bearerAuthenticator,
  devEmailVerifier,
  resolveSigningKey,
  signContentHash,
} from '../engine/index.js';
import {
  tenantOwnershipResolver, createSealedPackageWriter, createPackageSigner, publishVerificationKeys,
} from '../engine/index.js';
import type { ApiDeps, RegistrationDeps, SigningKey } from '../engine/index.js';

/** Raised when the environment cannot compose a bootable API. Carries an operator-facing message. */
export class BootstrapError extends Error {
  constructor(message: string) { super(message); this.name = 'BootstrapError'; }
}

/**
 * Parse `DBIZ_GROUP_TENANT_MAP` — `<groupObjectId>:<slug>|<slug>,<groupObjectId>:<slug>`.
 *
 * Malformed entries are DROPPED rather than defaulted. A typo must not silently widen anyone's tenant
 * scope, and an unmapped group leaves a tenant-scoped principal with an empty scope, which
 * `mayAccessTenant()` denies. Slugs are case-folded to match the router's canonical form, so a mapping
 * written as `Acme-Corp` still matches the `acme-corp` the API addresses.
 */
export function parseGroupTenantMap(raw: string): Readonly<Record<string, readonly string[]>> {
  const map: Record<string, string[]> = {};
  for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const sep = entry.indexOf(':');
    if (sep <= 0) continue;
    const group = entry.slice(0, sep).trim();
    const slugs = entry.slice(sep + 1).split('|').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!group || slugs.length === 0) continue;
    map[group] = [...new Set([...(map[group] ?? []), ...slugs])].sort();
  }
  return map;
}

export interface ComposedApi {
  readonly deps: ApiDeps;
  readonly port: number;
  readonly host: string;
  /** True in a production deployment. Drives fail-safe refusals (Swagger exposure, dev auth), never grants. */
  readonly isProduction: boolean;
  readonly diagnostics: {
    readonly stateDir: string;
    readonly liveEntra: boolean;
    readonly allowlist: readonly string[];
    readonly contractVersion: string;
    readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
    /** Exact browser origins permitted to call the API. Empty ⇒ same-origin only (deny by default). */
    readonly corsOrigins: readonly string[];
    /** Honour x-forwarded-* headers. True only behind a proxy that overwrites them (App Gateway). */
    readonly trustProxy: boolean;
  };
}

/**
 * Compose the API dependencies from an already-bootstrapped platform context. All configuration comes
 * from `platform.config`; the session secret from `platform.secrets`; auth-policy variables from the
 * provider's captured environment snapshot — never from `process.env`.
 */
export function composeApiDeps(platform: PlatformContext): ComposedApi {
  const { config, secrets, configuration } = platform;
  const env = configuration.environmentSnapshot;

  // Durable state lives beneath one configured directory (an Azure Files mount in cloud). The
  // file-backed SSOT is retained (backward compatible); the Storage/Distributed-State providers are
  // available on `platform` for the later M-b/M-c adoption steps.
  const stateDir = config.state.dir;
  const tenantsDir = join(stateDir, 'tenants');
  const registrationDir = join(stateDir, 'registration');
  const generatedDir = join(stateDir, 'generated');
  const signingDir = join(stateDir, 'signing');
  for (const dir of [tenantsDir, registrationDir, generatedDir, signingDir]) {
    try { mkdirSync(dir, { recursive: true }); }
    catch (e) { throw new BootstrapError(`state directory ${dir} is not writable (${(e as Error).message}). Set DBIZ_STATE_DIR to a writable mount.`); }
  }

  // Is this a production deployment? Used ONLY to REFUSE weaker settings, never to grant anything — so
  // it stays consistent with the schema's rule that the environment name is not an authorisation input.
  // A fail-safe interlock is not an environment-dependent permission.
  //
  // DBIZ_ENV is the authoritative signal: it is the platform's own declared environment. NODE_ENV is a
  // Node-runtime mode and legitimately reads `production` in local Docker (see docker-compose.yml, which
  // pairs NODE_ENV=production with DBIZ_ENV=local to exercise the production dependency tree). Treating
  // NODE_ENV alone as "this is production" would therefore break local development. But an operator who
  // sets NODE_ENV=production and FORGETS DBIZ_ENV must not silently fall back to the 'local' default —
  // so that combination counts as production too.
  const declaredEnv = env['DBIZ_ENV'];
  const isProduction = config.environment === 'production'
    || (env['NODE_ENV'] === 'production' && (declaredEnv === undefined || declaredEnv === ''));

  // The session/EP signing secret — resolved through the Secret Provider (Key Vault → env in Azure).
  let sessionSecret: string;
  try { sessionSecret = secrets.require('SESSION_SECRET'); }
  catch { throw new BootstrapError('SESSION_SECRET is not available from the secret backend. Populate it from Azure Key Vault (see the Key Vault secret inventory).'); }

  // SECRET STRENGTH. `secrets.require` proves a value is PRESENT; it cannot prove it is a secret. This
  // one signs every DBIZ session and every Execution-Plane credential, so a weak value is equivalent to
  // no authentication at all: forging a platform-admin token is offline brute force. The placeholder
  // shipped in `.env.example` is refused by name — copying that file and deploying it is the single most
  // likely way a weak secret reaches production.
  const PLACEHOLDER_SECRETS = new Set(['local-dev-only-change-me-not-a-real-secret', 'changeme', 'secret']);
  if (PLACEHOLDER_SECRETS.has(sessionSecret)) {
    throw new BootstrapError('SESSION_SECRET is a documentation placeholder, not a secret. Generate one with `openssl rand -base64 32` and store it in Azure Key Vault.');
  }
  const MIN_SECRET_LENGTH = 32;
  if (sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new BootstrapError(`SESSION_SECRET is too short (${sessionSecret.length} characters; at least ${MIN_SECRET_LENGTH} are required). It signs every session and Execution-Plane credential — generate one with \`openssl rand -base64 32\`.`);
  }

  // Microsoft (Entra) sign-in policy — auth variables via the provider snapshot (not process.env).
  const tenantId = env['AZURE_TENANT_ID'] ?? '';
  const clientId = env['AZURE_CLIENT_ID'] ?? '';
  const liveEntra = Boolean(tenantId && clientId);
  const devAuthOptIn = env['DBIZ_DEV_AUTH'] === '1' || env['DBIZ_DEV_AUTH'] === 'true';
  if (!liveEntra && !devAuthOptIn) {
    throw new BootstrapError('Microsoft Entra is not configured. Set AZURE_TENANT_ID + AZURE_CLIENT_ID for real sign-in, or set DBIZ_DEV_AUTH=1 for the UNSIGNED dev:<email> verifier (LOCAL/NON-PRODUCTION ONLY).');
  }
  // PRODUCTION INTERLOCK. `devEmailVerifier` accepts an UNSIGNED `dev:<email>` token — anyone who can
  // name an allow-listed address becomes a platform-admin over every tenant. Previously the only defence
  // was that nobody would set the variable in production; docker-compose.yml ships NODE_ENV=production
  // and DBIZ_DEV_AUTH=1 together, so that assumption was already false in a tracked file. Refuse instead.
  if (isProduction && devAuthOptIn) {
    throw new BootstrapError('DBIZ_DEV_AUTH is set in a PRODUCTION environment. The dev verifier accepts unsigned dev:<email> tokens and would grant platform-admin without any signature check. Unset DBIZ_DEV_AUTH and configure AZURE_TENANT_ID + AZURE_CLIENT_ID.');
  }

  const allowlist = (env['IP_ADMIN_ALLOWLIST'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  // ── Tenant-scoped RBAC (C-07.11) ───────────────────────────────────────────────────────────────
  // Roles come from Entra app-role assignments; tenant scope from group membership. Without
  // DBIZ_REQUIRE_ENTRA_ROLES an identity carrying no recognised role keeps the established
  // allow-list ⇒ platform-admin behaviour, so a deployment mid-way through provisioning roles does
  // not lock its operators out. A PRODUCTION deployment must state its choice explicitly: inheriting
  // the lenient default is how "every authenticated user is a global admin" survived this long.
  const requireEntraRoles = env['DBIZ_REQUIRE_ENTRA_ROLES'] === '1' || env['DBIZ_REQUIRE_ENTRA_ROLES'] === 'true';
  if (isProduction && liveEntra && env['DBIZ_REQUIRE_ENTRA_ROLES'] === undefined) {
    throw new BootstrapError('DBIZ_REQUIRE_ENTRA_ROLES is not set. Set it to 1 so every operator must hold an Entra app role (recommended), or to 0 to keep the transitional allow-list-implies-platform-admin behaviour while roles are provisioned.');
  }

  // Entra group object-id → tenant slugs, as `groupId:slug1|slug2,groupId2:slug3`. Absent means no
  // group grants any tenant, so a tenant-scoped principal reaches nothing (fail-closed).
  const groupTenantMap = parseGroupTenantMap(env['DBIZ_GROUP_TENANT_MAP'] ?? '');
  const registrationEndpoint = config.registration.endpoint;
  const contractVersion = config.registration.contractVersion;

  // Browser origins allowed to call the API. An empty list means SAME-ORIGIN ONLY — the correct posture
  // when the SPA is served from the same host, and a safe default when nobody has configured it. There
  // is deliberately no wildcard: every legitimate caller of an administrative API is a known deployment.
  const corsOrigins = (env['DBIZ_CORS_ORIGINS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  // Trusting x-forwarded-* is only correct behind a proxy that OVERWRITES them. Azure Application
  // Gateway does; a directly-exposed container does not, and trusting them there would let any caller
  // forge its own client address and defeat the rate limiter. Opt-in, and refused when it is a no-op.
  const trustProxy = env['DBIZ_TRUST_PROXY'] === '1' || env['DBIZ_TRUST_PROXY'] === 'true';

  // A production deployment must state its browser origins. Silently falling back to same-origin would
  // strand the SPA with an unexplained CORS failure; failing here names the cause at boot instead.
  if (isProduction && corsOrigins.length === 0 && env['DBIZ_CORS_ORIGINS'] === undefined) {
    throw new BootstrapError('DBIZ_CORS_ORIGINS is not set. Set it to the exact origin(s) of the web tier (comma-separated), or to an empty string to declare same-origin-only deliberately.');
  }

  const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
  // ── THE SIGNING KEY, FROM THE SECRET PROVIDER (ADR-0083 P-83.1, P-83.2) ──────────────────────
  //
  // RESOLVED LIKE EVERY OTHER SECRET THIS PLANE HOLDS, and twelve lines from where SESSION_SECRET is
  // resolved — which is where it should always have been. It was a file created when missing, by
  // RESIDUE rather than by choice: ADR-0060 §6 M-a adopted this seam ADDITIVELY, so what was already
  // a file stayed a file (debt D-129, closed by ADR-0083).
  //
  // THERE IS NO CREATE-IF-MISSING, AND THAT REMOVED A PROBLEM RATHER THAN ADDING A CHECK. Absence
  // now unambiguously means NOT PROVISIONED, so the first-run/lost-volume ambiguity does not arise —
  // and link 1's derived mint authorisation is RETIRED WITH ITS SUBJECT rather than left running as
  // decoration (ADR-0083 P-83.3, CHARTER §17.1.1 obligation (ii)).
  //
  // ADR-0084 IS WHY THIS READS AS A CUSTODY IMPROVEMENT RATHER THAN A REMEDIATION: holding this key
  // in this plane is permitted, and always was — Rule 6 governs what CROSSES.
  let signingKey: SigningKey;
  try { signingKey = resolveSigningKey(secrets); }
  catch (e) { throw new BootstrapError((e as Error).message); }

  // ── ROTATION: EVERY REGISTERED TENANCY IS SENT THE CURRENT KEY SET (D-125, ADR-0081 P-81.4) ───
  //
  // AT BOOT, AND IDEMPOTENT BY COMPARISON. A tenancy whose last event already carries this exact
  // set is skipped, so a restart emits nothing; a tenancy that has never been sent one — which is
  // every tenancy registered before the grant carried keys — is emitted to. **That is the only path
  // by which an already-registered tenancy can obtain a verification key**, and without it link 1
  // would ship packages it cannot verify.
  const distribution = publishVerificationKeys(repo, [
    { keyId: signingKey.keyId, publicKeyPem: signingKey.publicKeyPem, algorithm: 'ed25519' as const },
  ]);
  const emitted = distribution.filter((d) => d.result === 'emitted');
  if (emitted.length > 0) {
    console.log(JSON.stringify({
      level: 'info', event: 'verification-keys-distributed',
      tenancies: emitted.map((d) => d.slug), keyIds: emitted[0]?.keyIds ?? [],
      adr: 'ADR-0081', rule: 'R-08.16',
    }));
  }

  // ── THE SIGNER, AT AUTHORING (D-123 link 1) ──────────────────────────────────────────────────
  //
  // Structurally satisfies the canonical runtime's `PackageSigner` port. It is NOT injected into
  // the writer: the signature is an INPUT to publication, not something produced at the write —
  // which is what "sign at authoring" means in the wiring rather than in prose.
  const packageSigner = createPackageSigner(signingKey);
  void packageSigner;

  const registrationDeps: RegistrationDeps = {
    repo,
    store: new FileRegistrationStore(registrationDir),
    epTokenSecret: sessionSecret,
    contractVersion,
    now: () => new Date().toISOString(),
    // ADR-0081 P-81.4 — the distribution leg of AD-016, which ADR-0007 left open while closing the
    // model. The PUBLIC half only: `SigningKey.privateKeyPem` is never read here and there is no
    // field on `PackageVerificationKey` that could carry it (R-08.15, R-08.17).
    //
    // A THUNK, NOT A VALUE, AND THE REASON IS ROTATION. ADR-0007 §6 keeps several keys concurrently
    // valid so a customer never redeploys to accept a rotated one. Resolving at issue time means a
    // tenancy registering after a rotation receives the CURRENT set rather than the set that
    // happened to exist when this process booted — the same reason the purge driver reads
    // `repo.list()` fresh on every sweep instead of capturing it here.
    //
    // ONE KEY, TWO ARTEFACT DOMAINS — stated, not resolved (ADR-0081 §5.1). This key also signs the
    // ADR-0035 solution manifest. It is not a forgery risk, because `digestV1` binds the domain into
    // the value signed, so a manifest signature cannot be replayed as a package signature. Distinct
    // key identifiers per artefact domain are the recommended shape once custody is settled.
    packageVerificationKeys: () => [
      { keyId: signingKey.keyId, publicKeyPem: signingKey.publicKeyPem, algorithm: 'ed25519' as const },
    ],
  };

  // ── Sealed package retrieval (ADR-0079) ──────────────────────────────────────────────────────
  //
  // MOUNTED HERE BECAUSE THIS IS THE ONLY PLACE THAT DECIDES WHAT A DEPLOYMENT CARRIES, AND A ROUTE
  // THAT IS NEVER MOUNTED DOES NOT EXIST. `GET /api/packages/{hash}` shipped declared, tested and
  // gated — and unreachable in every deployment, because `packageStore` was the one `ApiDeps` field
  // this function did not set and `AppModule.register` mounts `PackageController` only when it is.
  // That is D-111, and it is the reason `verify-composition-root.js` now measures this literal.
  //
  // `sealedPackageService` is used rather than the bare `SealedPackageStore` constructor because it
  // STARTS the retention purge in the same call (R-06.13). A store mounted without its driver would
  // serve reads while nothing enforced its retention.
  const packages = sealedPackageService({
    storage: platform.storage,
    owners: tenantOwnershipResolver(repo),
    // Read fresh on every sweep, so a tenant onboarded after boot is covered. `purgeTenant` and the
    // package key are both slug-partitioned, so the context needs no more than the pairing.
    tenants: () => repo.list().map((t) => tenantContext({ tenantId: t.tenantId, tenantSlug: t.slug })),
    // R-06.15: purge failure is a loud, alerting condition and never a silent skip. The structured
    // logger is the deployment's alerting surface; `error` is the level operations pages on.
    onPurgeFailure: (tenantSlug, error) => {
      console.error(JSON.stringify({
        level: 'error', event: 'package-purge-failed', tenantSlug,
        detail: error instanceof Error ? error.message : String(error),
        rule: 'R-06.15', adr: 'ADR-0079',
      }));
    },
  });

  // ── THE WRITER (ADR-0081 §6 step 3) ──────────────────────────────────────────────────────────
  //
  // CONSTRUCTED HERE BECAUSE THIS IS WHERE THE STORE AND THE REGISTRY BOTH LIVE, and because the
  // writer is the component D-122 ruled on: `onPackageSealed` had zero non-test callers, so
  // `GET /api/packages/{hash}` served a store that had never held a package this plane produced.
  //
  // IT IS NOT MOUNTED ON A ROUTE, AND THAT IS NOT AN OVERSIGHT. Publication is not an HTTP
  // operation — nothing outside this plane may ask for a package to be published. The writer is
  // driven by the authoring path when a run reaches stage 7 and the publication gate admits it;
  // wiring that path is the ADR-0049 M5 cut-over, which is separately authorised. **Until then this
  // exists, is proved, and has no production caller — which is stated rather than implied by its
  // presence.**
  // ── THE RUN RECORD STORE (ADR-0082 §6 step 2) ────────────────────────────────────────────────
  //
  // OBTAINED THROUGH THE FACTORY THAT STARTS ITS PURGE (P-82.7, R-06.13), for the reason ADR-0079
  // learned the hard way: `purgeExpired` was correct and nothing called it. A store acquired by its
  // bare constructor would accept writes while nothing enforced its retention, and no test over a
  // successful write would notice.
  const runs = runRecordService({
    storage: platform.storage,
    // Read fresh on every sweep, so a tenant onboarded after boot is covered.
    tenants: () => repo.list().map((t) => tenantContext({ tenantId: t.tenantId, tenantSlug: t.slug })),
    // R-06.15: purge failure is a loud, alerting condition and never a silent skip.
    onPurgeFailure: (tenantSlug, error) => {
      console.error(JSON.stringify({
        level: 'error', event: 'run-record-purge-failed', tenantSlug,
        detail: error instanceof Error ? error.message : String(error),
        rule: 'R-06.15', adr: 'ADR-0082',
      }));
    },
  });

  // ── THE WRITER (ADR-0081 §6 step 3), NOW WITH THE RUN RECORD (ADR-0082 §6 step 2) ────────────
  //
  // CONSTRUCTED HERE BECAUSE THIS IS WHERE THE STORE AND THE REGISTRY BOTH LIVE. It is driven by
  // the canonical authoring path at stage 7 through the bridge's `SealedPackagePublisher` port
  // (ADR-0049 M5) — it is deliberately NOT mounted on a route, because publication is not an HTTP
  // operation and nothing outside this plane may ask for a package to be published.
  const packageWriter = createSealedPackageWriter({ repo, store: packages.store, runs: runs.store });
  void packageWriter;

  const deps: ApiDeps = {
    packageStore: packages.store,
    repo,
    services: {
      auth: { issueOneTimeCredential: (tid: string) => issueRegistrationOtc(registrationDeps, tid) },
      registration: { recordTenantCreated: () => {} },
    },
    registrationEndpoint,
    authenticate: bearerAuthenticator(sessionSecret),
    microsoftAuth: {
      config: {
        tenantId, clientId, allowlist, sessionSecret, sessionTtlSeconds: 3600,
        requireEntraRoles, groupTenantMap,
      },
      ...(liveEntra ? {} : { verify: devEmailVerifier }),
    },
    solutionOutputDir: generatedDir,
    signPackage: (contentHash: string) => signContentHash(signingKey, contentHash),
    epTokenSecret: sessionSecret,
    registration: registrationDeps,
  };

  return {
    deps,
    port: config.server.port,
    host: config.server.host,
    isProduction,
    diagnostics: {
      stateDir, liveEntra, allowlist, contractVersion,
      logLevel: config.logging.level, corsOrigins, trustProxy,
    },
  };
}
