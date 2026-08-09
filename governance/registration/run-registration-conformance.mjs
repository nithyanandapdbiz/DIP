/**
 * EP↔IP REGISTRATION CONFORMANCE SCENARIO — the trust-establishment endpoint (ADR-0036).
 * ============================================================================
 * Exercises the registration flow end to end and reports what was OBSERVED as JSON. Asserts
 * nothing; exits 0 either way. The gate that spawns it decides pass or fail (R-14.2: evidence is
 * regenerated on every run, never read from a committed file).
 *
 *   RG-1  a valid OTC yields a tenant-scoped EP credential that AUTHENTICATES (401→200)
 *   RG-2  the OTC is single-use — replay refused (single-use, R-36.2)
 *   RG-3  cross-tenant registration refused; a refusal does NOT consume the OTC (C-07.11, R-36.4/5)
 *   RG-4  the credential is least-privilege — no cross-tenant read, no onboarding PATCH (R-36.1/5, C-07.11)
 *   RG-5  INV-2: the store holds only a HASH; no OTC/credential value at rest or in audit (R-36.3)
 *   RG-6  every trust event is audited — issuance, success AND refusal (R-36.8)
 *   RG-7  Zero Trust: expired / contract / environment mismatches are refused (R-36.4)
 *   RG-8  a post-consume issuance failure rolls back the OTC (503) so a retry succeeds (R-36.2 hardening)
 *
 * Run:  node governance/registration/run-registration-conformance.mjs
 * Out:  {"properties":[...],"digest":"<sha256>","fatal":null}
 */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');

const properties = [];
const record = (id, property, ok, detail) => properties.push({ id, property, ok: Boolean(ok), detail });
let fatal = null;

try {
  const eng = await import(pathToFileURL(entry('tenant-onboarding-engine')).href);
  const SECRET = 'registration-conformance-secret';

  // A mutable clock so expiry (RG-7) is deterministic without relying on wall time.
  let clockMs = Date.parse('2026-07-24T00:00:00.000Z');
  const now = () => new Date(clockMs).toISOString();
  const advance = (s) => { clockMs += s * 1000; };

  let idc = 0;
  const repo = new eng.TenantConfigRepository(new eng.InMemoryTenantConfigStore(), { now, newTenantId: () => `tnt-${idc++}` });
  const store = new eng.InMemoryRegistrationStore();
  const reg = { repo, store, epTokenSecret: SECRET, contractVersion: '1.0.0', now, otcTtlSeconds: 3600 };
  const apiDeps = {
    repo,
    services: { auth: { issueOneTimeCredential: (t) => `otc-${t}` }, registration: { recordTenantCreated: () => {} } },
    registrationEndpoint: 'https://ip.example/register', epTokenSecret: SECRET, registration: reg,
  };
  const welcome = (org, name, admin) => ({ organisationName: org, tenantName: name, primaryAdministrator: admin, preferredCloud: 'azure', deploymentModel: 'container' });

  const A = repo.createFromWelcome(welcome('Alpha', 'Alpha Prod', 'A'));
  const B = repo.createFromWelcome(welcome('Beta', 'Beta Prod', 'B'));
  const aSlug = A.onboarding.slug, aTid = A.onboarding.tenantId;
  const bSlug = B.onboarding.slug, bTid = B.onboarding.tenantId;

  // RG-1 — happy path + authentication.
  const otcA = eng.issueRegistrationOtc(reg, aTid);
  const r1 = eng.handleRegistration({ otc: otcA, tenantId: aTid, environment: 'test' }, reg);
  const grant = r1.body;
  const v = eng.verifySessionToken(grant.credential, SECRET);
  const authed = v.ok ? eng.route({ method: 'GET', path: `/api/tenants/${aSlug}/updates`, principal: v.principal }, apiDeps) : { status: 0 };
  record('RG-1', 'a valid OTC yields a tenant-scoped credential that authenticates',
    r1.status === 200 && v.ok && v.principal.roles.join() === 'execution-plane' && authed.status === 200,
    `register=${r1.status}, verified=${v.ok}, roles=${v.ok ? v.principal.roles.join() : '-'}, authed=${authed.status}`);

  // RG-2 — single-use.
  const replay = eng.handleRegistration({ otc: otcA, tenantId: aTid, environment: 'test' }, reg);
  record('RG-2', 'the OTC is single-use — replay refused', replay.status === 401, `replay=${replay.status}`);

  // RG-3 — cross-tenant registration refused; the failed attempt does not burn the OTC.
  const otcB = eng.issueRegistrationOtc(reg, bTid);
  const cross = eng.handleRegistration({ otc: otcB, tenantId: aTid, environment: 'test' }, reg); // B's OTC claiming A
  const legitB = eng.handleRegistration({ otc: otcB, tenantId: bTid, environment: 'test' }, reg); // still works
  record('RG-3', 'cross-tenant registration refused (403); the OTC is not consumed by the refusal',
    cross.status === 403 && legitB.status === 200, `cross=${cross.status}, legitB=${legitB.status}`);

  // RG-4 — least privilege: no cross-tenant read, no onboarding PATCH.
  const pA = v.ok ? v.principal : null;
  const crossTok = pA ? eng.route({ method: 'GET', path: `/api/tenants/${bSlug}/updates`, principal: pA }, apiDeps) : { status: 0 };
  const patchEsc = pA ? eng.route({ method: 'PATCH', path: `/api/tenants/${aSlug}/recommendations`, body: {}, principal: pA }, apiDeps) : { status: 0 };
  record('RG-4', 'the credential is least-privilege: no cross-tenant read (403), no onboarding PATCH (403)',
    crossTok.status === 403 && patchEsc.status === 403, `crossTokenRead=${crossTok.status}, patchRecommendations=${patchEsc.status}`);

  // RG-5 — data sovereignty: the store holds only a hash; no OTC/credential value at rest or in audit.
  const hashA = createHash('sha256').update(otcA).digest('hex');
  const rec = store.getOtc(hashA);
  const auditStr = JSON.stringify([...store.readAudit()]);
  const noSecretAtRest = Boolean(rec) && rec.hash === hashA && !JSON.stringify(rec).includes(otcA)
    && !auditStr.includes(otcA) && !auditStr.includes(grant.credential);
  record('RG-5', 'INV-2: the store holds only a HASH; no OTC/credential value at rest or in audit',
    noSecretAtRest, `recordIsHashOnly=${Boolean(rec) && !JSON.stringify(rec).includes(otcA)}, auditCarriesNoSecret=${!auditStr.includes(otcA) && !auditStr.includes(grant.credential)}`);

  // RG-6 — every trust event is audited.
  const ops = new Set([...store.readAudit()].map((a) => a.operation));
  record('RG-6', 'every trust event is audited — issuance, success and refusal',
    ops.has('otc-issued') && ops.has('credential-issued') && ops.has('registration-succeeded') && ops.has('registration-refused'),
    `operations=${[...ops].join(',')}`);

  // RG-7 — Zero Trust: expired / contract / environment mismatches refused.
  const otcExp = eng.issueRegistrationOtc(reg, aTid);
  advance(3601); // past the 3600s TTL
  const expd = eng.handleRegistration({ otc: otcExp, tenantId: aTid, environment: 'test' }, reg);
  const otcC = eng.issueRegistrationOtc(reg, aTid);
  const badContract = eng.handleRegistration({ otc: otcC, tenantId: aTid, environment: 'test', contractVersion: '9.9.9' }, reg);
  const badEnv = eng.handleRegistration({ otc: otcC, tenantId: aTid, environment: 'production' }, reg);
  record('RG-7', 'Zero Trust: expired / contract / environment mismatches refused',
    expd.status === 401 && badContract.status === 426 && badEnv.status === 403,
    `expired=${expd.status}, contract=${badContract.status}, environment=${badEnv.status}`);

  // RG-8 — a post-consume failure rolls back the OTC so a retry works (the review-hardening property).
  const otcR = eng.issueRegistrationOtc(reg, bTid);
  let failNext = true;
  const flaky = {
    putOtc: (r) => store.putOtc(r), getOtc: (h) => store.getOtc(h),
    consumeOtc: (h, a) => store.consumeOtc(h, a), releaseOtc: (h) => store.releaseOtc(h),
    readAudit: () => store.readAudit(),
    appendAudit: (r) => { if (failNext && r.operation === 'credential-issued') { failNext = false; throw new Error('injected transient write failure'); } store.appendAudit(r); },
  };
  const regFlaky = { ...reg, store: flaky };
  const failed = eng.handleRegistration({ otc: otcR, tenantId: bTid, environment: 'test' }, regFlaky);
  const retried = eng.handleRegistration({ otc: otcR, tenantId: bTid, environment: 'test' }, regFlaky);
  record('RG-8', 'a post-consume failure rolls back the OTC (503) so the legitimate EP can retry (200)',
    failed.status === 503 && retried.status === 200, `failed=${failed.status}, retried=${retried.status}`);
} catch (e) {
  fatal = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
}

const digest = createHash('sha256').update(JSON.stringify(properties.map((p) => [p.id, p.ok]))).digest('hex');
process.stdout.write(JSON.stringify({ properties, digest, fatal }));
