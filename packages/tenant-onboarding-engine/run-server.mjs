// Dev launcher: boots the Tenant Onboarding Engine API over the FILE-backed SSOT (tenants/), on :4610.
//
// AUTH (no database): the ONLY role is DBIZ IP Admin. A Microsoft (Entra) sign-in whose email is on the
// allow-list is exchanged (POST /api/auth/session) for a stateless DBIZ session token; every other
// request is authenticated by verifying that token (bearerAuthenticator). Until a real Entra tenant is
// configured (AZURE_TENANT_ID), a DEV verifier accepts `dev:<email>` so the allow-list can be exercised
// locally — the allow-list still applies, so only listed emails get in.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { devKeyPath, restrictToOwner } from './dev-key-store.mjs';

// The repository root, derived from this file rather than hardcoded. The previous absolute
// `c:/DBIZAGENTICAI/DBiz_IntelligencePlane` meant the launcher ran on exactly one machine and silently
// read another developer's tenants/ if the path happened to exist. Overridable for a relocated checkout.
const ROOT = process.env.DBIZ_REPO_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Key material lives OUTSIDE the repository (dev-key-store.mjs) — the E-5 non-retention property.

// Load packages/tenant-onboarding-engine/.env (simple KEY=VALUE) — THE place to edit IP_ADMIN_ALLOWLIST.
// An already-set process.env value wins, so an inline `IP_ADMIN_ALLOWLIST=… node run-server.mjs` still overrides.
const ENV_FILE = `${ROOT}/packages/tenant-onboarding-engine/.env`;
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

const eng = await import(pathToFileURL(`${ROOT}/packages/tenant-onboarding-engine/dist/src/index.js`).href);

const repo = new eng.TenantConfigRepository(new eng.FileTenantConfigStore(`${ROOT}/tenants`));

const env = process.env;

// STABLE signing secret. A random-per-boot secret silently revokes every EP credential on restart
// (the "restart loses identity forever" failure the EP runtime requirements warn about, and the root
// cause of the registration 401). Resolve it in order: an explicit SESSION_SECRET; else a persisted,
// gitignored key file that is generated ONCE and reused. Production supplies SESSION_SECRET from a
// secret manager; this file is the dev-instance equivalent — never committed.
const SECRET_FILE = devKeyPath('session-secret');
function resolveSessionSecret() {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (existsSync(SECRET_FILE)) {
    const s = readFileSync(SECRET_FILE, 'utf8').trim();
    if (s) return s;
  }
  const s = randomBytes(32).toString('base64url');
  writeFileSync(SECRET_FILE, s + '\n', 'utf8');
  restrictToOwner(SECRET_FILE);
  console.warn(`Generated a persistent session secret at ${SECRET_FILE} (gitignored — do not commit).`);
  return s;
}
const SESSION_SECRET = resolveSessionSecret();

// EP registration/trust-establishment deps (ADR-0036): the OTC store + the EP-credential signer.
// The OTC store is durable per-instance (hashes + immutable audit trail only — no secret, INV-2).
const registrationDeps = {
  repo,
  store: new eng.FileRegistrationStore(`${ROOT}/registration`),
  epTokenSecret: SESSION_SECRET,
  contractVersion: '1.0.0',
  now: () => new Date().toISOString(),
};

const services = {
  // Solution generation issues the ONE-TIME registration credential THROUGH the registration store,
  // so the OTC baked into the EP package is exactly the one POST /api/register later validates.
  auth: { issueOneTimeCredential: (tenantId) => eng.issueRegistrationOtc(registrationDeps, tenantId) },
  registration: { recordTenantCreated: () => {} },
};
// Default DBIZ IP Admin allow-list (dev). Overridden by IP_ADMIN_ALLOWLIST in .env or the environment.
// Kept here (a tracked file) so a wiped/gitignored .env can't lock the admin out.
const DEFAULT_ALLOWLIST = 'nithyananda.p@dbizsolution.com,admin@dbiz.example';
const allowlist = (env.IP_ADMIN_ALLOWLIST || DEFAULT_ALLOWLIST)
  .split(',').map((s) => s.trim()).filter(Boolean);
const tenantId = env.AZURE_TENANT_ID || '';
const clientId = env.AZURE_CLIENT_ID || '';
const liveEntra = Boolean(tenantId && clientId);

// The UNSIGNED dev verifier must be an explicit opt-in, never the silent default (F-18): without real
// Entra config AND without DBIZ_DEV_AUTH=1, refuse to start rather than accept unsigned dev:<email> tokens.
const devAuthOptIn = env.DBIZ_DEV_AUTH === '1' || env.DBIZ_DEV_AUTH === 'true';
if (!liveEntra && !devAuthOptIn) {
  console.error('Refusing to start: Microsoft Entra is not configured — set AZURE_TENANT_ID + AZURE_CLIENT_ID for real sign-in.');
  console.error('To use the UNSIGNED dev:<email> verifier for LOCAL DEVELOPMENT ONLY, set DBIZ_DEV_AUTH=1 explicitly.');
  process.exit(1);
}
if (!liveEntra) {
  console.warn('WARNING: DEV AUTH ENABLED (DBIZ_DEV_AUTH) — unsigned dev:<email> tokens are accepted; the allow-list still applies. NEVER enable outside local development.');
}

const microsoftAuth = {
  config: { tenantId, clientId, allowlist, sessionSecret: SESSION_SECRET, sessionTtlSeconds: 3600 },
  // Real Entra JWKS verification once configured; the dev fallback (unsigned dev:<email>) is reachable
  // only under the explicit DBIZ_DEV_AUTH opt-in guarded above.
  ...(liveEntra ? {} : { verify: eng.devEmailVerifier }),
};
const authenticate = eng.bearerAuthenticator(SESSION_SECRET);

// Generated EP solution packages are staged here (IP-owned artifact; the customer deploys to the EP).
const solutionOutputDir = `${ROOT}/generated`;

// Software Update Management (ADR-0035): the ed25519 package-signing key, persisted ONCE (gitignored) and
// reused so the signature keyId stays stable across restarts — a per-boot key would invalidate the
// signatures on already-published EP packages. Created on first run, then restricted to the owner.
const SIGNING_KEY_FILE = devKeyPath('package-signing-key.pem');
const signingKey = eng.loadOrCreateSigningKey(SIGNING_KEY_FILE);
restrictToOwner(SIGNING_KEY_FILE);
const signPackage = (contentHash) => eng.signContentHash(signingKey, contentHash);

await eng.bootstrap({ repo, services, registrationEndpoint: 'https://gateway.dbiz.example/v1/register', authenticate, microsoftAuth, solutionOutputDir, signPackage, epTokenSecret: SESSION_SECRET, registration: registrationDeps }, 4610);
console.log('Tenant Onboarding Engine API on http://127.0.0.1:4610  (Swagger: /api/docs)');
console.log('EP registration (OTC-authed): POST /api/register');
console.log(`EP solution packages → ${solutionOutputDir}/<slug>/`);
console.log(liveEntra
  ? `Auth: Microsoft (Entra) tenant ${tenantId}`
  : 'Auth: DEV sign-in (dev:<email>) — set AZURE_TENANT_ID + AZURE_CLIENT_ID for real Microsoft login');
console.log(`DBIZ IP Admin allow-list: ${allowlist.join(', ')}`);
