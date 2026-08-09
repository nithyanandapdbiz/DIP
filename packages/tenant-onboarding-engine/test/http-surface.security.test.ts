/**
 * HTTP SURFACE SECURITY SUITE — the release gate for the deployed transport.
 *
 * TRACEABILITY
 *   Architecture : 07-tenant-isolation.md (C-07.11) · 08-security-model.md §5a
 *   ADR          : ADR-0033 §R-33.5 · ADR-0019 (evidence over assertion) · ADR-0020 (continuous verification)
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS DIFFERENT FROM EVERY OTHER TEST HERE.
 *
 * The platform had 825 passing tests, 58 governance gates, 55 ADRs and 24 certification reports, and a
 * single request — `DELETE /api/tenants/%2e%2e` — recursively deleted the entire state volume. None of
 * that apparatus caught it, and the reason is structural rather than accidental: every existing test
 * examines the DESIGN (module shape, contract conformance, domain purity, ADR rules), and the defect
 * was in the ADAPTER between the network and the design. `route()` was tested as a pure function and
 * behaved correctly; the vulnerability lived in what a real socket did on the way to it.
 *
 * So this suite drives the assembled application over a REAL TCP SOCKET, deliberately bypassing any
 * client-side URL normalisation. That is not a stylistic choice. The first attempt to prove the
 * traversal used `fetch`, which normalises `/api/tenants/..` to `/api/` before the bytes leave the
 * process, and reported three false negatives — the request never reached the server. An attacker does
 * not use `fetch`. A test that proves a security property MUST send what an attacker sends.
 *
 * Every test below corresponds to a finding that was verified by execution against this repository.
 * They are regression locks, not aspirations.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { createApp, MAX_BODY_BYTES } from '../src/server/main.js';
import {
  TenantConfigRepository, FileTenantConfigStore, bearerAuthenticator, issueSessionToken, issueEpToken,
  tenantOwnershipResolver, type ApiDeps,
} from '../src/index.js';
import {
  InMemoryStorageProvider, SealedPackageStore, RunRecordStore, tenantContext, sealedPackageRefusal,
  RUN_RECORD_CAPABILITY, RUN_RECORD_RUN, RUN_RECORD_EVIDENCE_RUN,
} from '@dbiz/platform-providers';
import { createLogger } from '../src/server/structured-logger.js';

const SECRET = 'test-secret-at-least-thirty-two-characters-long';

let app: INestApplication;
let port: number;
let root: string;
let tenantsDir: string;
let adminToken: string;
let logLines: string[] = [];
/**
 * EXPOSED AT MODULE SCOPE because a test that mints its OWN tenant must also mint that tenant's own
 * run (ADR-0082 P-82.5): a brand-new tenant has no runs, so no evidence reference binds for it, and
 * a positive control asserting 202 would fail for a reason unrelated to what it is testing.
 */
let runRecords: RunRecordStore;
/**
 * The provider BENEATH the run record store, held so a test can read the bytes directly.
 * ADR-0080 §6 step 3 condition (c) asserts two polls leave the plane byte-identical, and asking the
 * STORE whether it changed would let a store that recorded a poll answer for itself.
 */
let workStorage: InMemoryStorageProvider;

/** Sealed-package fixtures, populated in `before` and probed over the socket further down. */
let acmeSlug: string;
let globexSlug: string;
let acmeEpToken: string;
let globexEpToken: string;
const ACME_HASH = 'a'.repeat(64);
const GLOBEX_HASH = 'b'.repeat(64);

// ── HASHES FOR THE EVIDENCE BINDING (ADR-0082 P-82.5), DELIBERATELY DISTINCT FROM THE ABOVE ─────
//
// `GLOBEX_HASH` and the evidence fixture's package hash were THE SAME VALUE (`'b'.repeat(64)`) — a
// collision that was harmless while the two stores never met, and would have been actively
// misleading now that one route reads both: a cross-tenant test written on it could pass because of
// the sealed package store rather than because of the run record partition.
const EVIDENCE_PKG_HASH = 'd'.repeat(64);   // acme's run — the positive control binds to this
const GLOBEX_RUN_HASH = 'c'.repeat(64);     // a REAL run, in the OTHER partition
const UNKNOWN_PKG_HASH = 'e'.repeat(64);    // well-formed, names no run anywhere
const ABSENT_HASH = 'c'.repeat(64);

function sealedBody(hash: string, tenantId: string): string {
  return JSON.stringify({
    contractVersion: '1.0.0', runId: 'r', correlationId: 'c', capabilityId: 'functional-testing',
    proceed: true, operations: [],
    directives: { timeoutMs: 1000, maxAttempts: 1, maxConcurrency: 1, mode: 'dry-run' },
    gates: [], evidenceRequirements: [],
    provenance: {
      authoredBy: 'ip', tenantId, authoredAt: '2026-08-01T00:00:00Z', contractVersion: '1.0.0',
      signingKeyId: 'k',
      contentHash: { algorithm: 'sha256-jcs-v1', domain: 'dbiz.execution-package@1', value: hash },
    },
    validity: { notBefore: '2026-08-01T00:00:00Z', notAfter: '2099-01-01T00:00:00Z', reusableWhileUnavailable: true },
  });
}

/**
 * Send a request over a raw socket with the path EXACTLY as written.
 *
 * `fetch`/undici normalise dot segments client-side, so they cannot express the attack at all. This is
 * the only way to assert the server's own behaviour on a hostile path.
 */
function raw(method: string, path: string, opts: { token?: string; body?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      const lines = [`${method} ${path} HTTP/1.1`, 'Host: 127.0.0.1', 'Connection: close'];
      if (opts.token) lines.push(`Authorization: Bearer ${opts.token}`);
      for (const [k, v] of Object.entries(opts.headers ?? {})) lines.push(`${k}: ${v}`);
      if (opts.body !== undefined) {
        lines.push('Content-Type: application/json');
        lines.push(`Content-Length: ${Buffer.byteLength(opts.body)}`);
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n${opts.body ?? ''}`);
    });
    let buf = '';
    socket.setTimeout(10_000, () => { socket.destroy(); reject(new Error('socket timeout')); });
    socket.on('data', (d) => { buf += d.toString('utf8'); });
    socket.on('error', reject);
    socket.on('close', () => {
      const split = buf.indexOf('\r\n\r\n');
      const head = buf.slice(0, split < 0 ? buf.length : split);
      const rest = split < 0 ? '' : buf.slice(split + 4);
      const [statusLine, ...headerLines] = head.split('\r\n');
      const headers: Record<string, string> = {};
      for (const line of headerLines) {
        const i = line.indexOf(':');
        if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
      resolve({
        status: Number((statusLine ?? '').split(' ')[1] ?? 0),
        headers,
        // Strip chunked-encoding framing so assertions can read the JSON directly.
        body: rest.replace(/^[0-9a-fA-F]+\r\n/, '').replace(/\r\n0\r\n\r\n$/, ''),
      });
    });
  });
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'dbiz-httpsec-'));
  tenantsDir = join(root, 'tenants');
  mkdirSync(tenantsDir, { recursive: true });

  // A sibling of the tenant root, and a file one level ABOVE it. Both are outside the tenant tree and
  // must remain untouched and unreadable no matter what a caller puts in the slug.
  mkdirSync(join(root, 'OTHER-TENANT-DATA'));
  writeFileSync(join(root, 'OTHER-TENANT-DATA', 'payroll.txt'), 'another customer');
  writeFileSync(join(root, 'tenant.json'), JSON.stringify({ secret: 'OUTSIDE THE TENANT ROOT' }));

  const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
  const acme = repo.createFromWelcome({ tenantName: 'Acme Corp', organisationName: 'Acme', primaryAdministrator: 'Ann' } as never);
  const globex = repo.createFromWelcome({ tenantName: 'Globex', organisationName: 'Globex', primaryAdministrator: 'Bob' } as never);

  // Sealed package retrieval, driven over the real socket like everything else in this suite.
  // Until this existed, `GET /api/packages/{hash}` was proved only in-process — and the whole point
  // of this file is that a route proved in-process and never driven through the assembled
  // application is a route whose adapter nobody has tested (D-111).
  acmeSlug = acme.onboarding.slug;
  globexSlug = globex.onboarding.slug;
  const packageStore = new SealedPackageStore(new InMemoryStorageProvider(), tenantOwnershipResolver(repo));
  await packageStore.onPackageSealed(
    tenantContext({ tenantId: acme.onboarding.tenantId, tenantSlug: acmeSlug }),
    sealedBody(ACME_HASH, acme.onboarding.tenantId),
    JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'YWNtZQ==' }),
  );
  await packageStore.onPackageSealed(
    tenantContext({ tenantId: globex.onboarding.tenantId, tenantSlug: globexSlug }),
    sealedBody(GLOBEX_HASH, globex.onboarding.tenantId),
    JSON.stringify({ algorithm: 'ed25519', keyId: 'sig-test', value: 'Z2xvYmV4' }),
  );
  acmeEpToken = issueEpToken(acmeSlug, repo.epTokenVersion(acmeSlug), SECRET).token;
  globexEpToken = issueEpToken(globexSlug, repo.epTokenVersion(globexSlug), SECRET).token;

  // ── THE RUN RECORD STORE `/v1/evidence` BINDS AGAINST (ADR-0082 §6 step 1, P-82.5) ──────────
  //
  // TWO RUNS IN TWO PARTITIONS, AND THE SECOND ONE IS THE WHOLE POINT. Acme's run makes the
  // positive control bindable; Globex's exists ONLY so that Acme can name a hash that IS a real run
  // somewhere and still be refused. **Without a run in the other partition, "refused" would be
  // satisfied by a store that simply cannot find anything**, and the cross-tenant property would
  // pass for the wrong reason.
  workStorage = new InMemoryStorageProvider();
  runRecords = new RunRecordStore(workStorage);
  await runRecords.onPackageAuthored(
    tenantContext({ tenantId: acme.onboarding.tenantId, tenantSlug: acmeSlug }),
    { runId: 'run-acme-1', packageHash: EVIDENCE_PKG_HASH, contractVersion: '1.0.0', authoredAt: '2026-08-06T00:00:00.000Z' },
  );
  await runRecords.onPackageAuthored(
    tenantContext({ tenantId: globex.onboarding.tenantId, tenantSlug: globexSlug }),
    { runId: 'run-globex-1', packageHash: GLOBEX_RUN_HASH, contractVersion: '1.0.0', authoredAt: '2026-08-06T00:00:00.000Z' },
  );

  const deps: ApiDeps = {
    repo,
    services: { auth: { issueOneTimeCredential: () => 'otc_test' }, registration: { recordTenantCreated: () => {} } },
    registrationEndpoint: 'https://gateway.test/register',
    authenticate: bearerAuthenticator(SECRET),
    epTokenSecret: SECRET,
    packageStore,
    runRecords,
  };

  app = await createApp(deps, {
    exposeApiDocs: false,                       // production posture
    corsOrigins: ['https://portal.dbiz.test'],
    logger: createLogger({ level: 'debug', sink: (l) => { logLines.push(l); } }),
  });
  await app.listen(0, '127.0.0.1');
  port = Number(new URL(await app.getUrl()).port);
  adminToken = issueSessionToken({ id: 'admin@dbiz.test', roles: ['platform-admin'] }, SECRET);
});

after(async () => {
  await app?.close();
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

// ── Sealed package retrieval over the socket (ADR-0079 P-79.8, D-111) ─────────
//
// PROVED HERE BECAUSE IN-PROCESS PROOF IS NOT ENOUGH ON THIS SURFACE. `GET /api/packages/{hash}`
// carries no tenant slug, so it reaches none of the tenant router's checks and its own auth block
// is the only thing between a tenant and another tenant's authored tests. This suite exists
// because a route that behaves correctly as a function can still behave differently through the
// adapter — which is exactly how `DELETE /api/tenants/%2e%2e` survived.

describe('sealed package retrieval is tenant-scoped through the assembled application', () => {
  test('the owning Execution Plane receives its own package over the socket', async () => {
    const res = await raw('GET', `/api/packages/${ACME_HASH}`, { token: acmeEpToken });
    assert.equal(res.status, 200, res.body);
    assert.ok(res.body.includes(ACME_HASH), 'the served body must be the requested package');
  });

  test('cross-tenant retrieval is refused through the real adapter', async () => {
    // Precondition: Globex's package really is in the store, so this is not a vacuous pass.
    assert.equal((await raw('GET', `/api/packages/${GLOBEX_HASH}`, { token: globexEpToken })).status, 200);

    const res = await raw('GET', `/api/packages/${GLOBEX_HASH}`, { token: acmeEpToken });
    assert.equal(res.status, 404, 'another tenant\'s package must not be served');
    assert.ok(!res.body.includes('"provenance"'), 'no package content may leak on a refusal');
  });

  test('unknown, cross-tenant and malformed refusals are BYTE-IDENTICAL over the wire (P-79.6)', async () => {
    const probes: [string, string][] = [
      ['unknown', ABSENT_HASH],
      ['cross-tenant', GLOBEX_HASH],
      ['malformed', 'not-a-content-hash'],
    ];
    const seen: string[] = [];
    for (const [label, hash] of probes) {
      const res = await raw('GET', `/api/packages/${hash}`, { token: acmeEpToken });
      assert.equal(res.status, 404, `${label} must be 404`);
      assert.equal(res.body.trim(), JSON.stringify({ error: sealedPackageRefusal(hash) }), `${label} body`);
      seen.push(`${res.status}|${res.body.trim().split(hash).join('<H>')}`);
    }
    // With the caller's own hash normalised out, the three responses are the same bytes. A
    // distinguishable refusal is the oracle P-70.4 exists to deny.
    assert.equal(new Set(seen).size, 1, `refusals are distinguishable over the wire: ${JSON.stringify(seen)}`);
  });

  test('an unauthenticated package request is refused', async () => {
    const res = await raw('GET', `/api/packages/${ACME_HASH}`);
    assert.equal(res.status, 401);
    assert.ok(!res.body.includes('"provenance"'));
  });

  test('a platform-admin resolves to no partition and cannot read any package', async () => {
    // A global principal is entitled to every tenant BY SLUG, and this route names none — so the
    // fail-closed answer is refusal rather than a licence to read all of them.
    const res = await raw('GET', `/api/packages/${ACME_HASH}`, { token: adminToken });
    assert.equal(res.status, 403);
    assert.ok(!res.body.includes('"provenance"'));
  });

  test('a traversal-shaped hash cannot escape the partition through the adapter', async () => {
    for (const hostile of ['..%2f..%2fOTHER-TENANT-DATA', '%2e%2e', '..']) {
      const res = await raw('GET', `/api/packages/${hostile}`, { token: acmeEpToken });
      assert.ok(res.status >= 400, `expected a refusal for "${hostile}", got ${res.status}`);
      assert.ok(!res.body.includes('OUTSIDE THE TENANT ROOT'), 'content escaped the tenant root');
    }
    assert.ok(existsSync(join(root, 'OTHER-TENANT-DATA')), 'a directory outside the tenant root was touched');
  });
});

// ── The 401 itself (OBL-002) ─────────────────────────────────────────────────
//
// THE FIFTH BOUNDARY, AND THE ONE IN THIS PLANE'S OWN AUTH PATH. Measured from the Execution
// Plane, `GET /api/application-templates` answered `401 authentication required` — byte for byte
// — to a caller holding a valid credential, a caller holding a corrupt one, and a caller holding
// none. The far side could therefore form no hypothesis about its own grant that the response
// could separate, and correctly refused to guess. That is not untidiness on this boundary; it is
// what stopped the diagnosis.
//
// TWO PROPERTIES, AND THE SECOND IS THE ONE THAT KEEPS THIS HONEST. The refusals must SEPARATE
// on the fact the caller already holds (did I present a credential?) and must stay IDENTICAL on
// the fact it does not (why was it refused?). A test for the first alone would pass just as well
// against an implementation that leaked the reason.

describe('the 401 distinguishes no-credential from credential-refused', () => {
  const TEMPLATES = '/api/application-templates';
  const expired = () => issueSessionToken({ id: 'u@dbiz.test', roles: ['platform-admin'] }, SECRET,
    { ttlSeconds: 1, now: () => Math.floor(Date.now() / 1000) - 7200 });

  test('a valid credential still reads the catalogue (the control this suite would be vacuous without)', async () => {
    // WITHOUT THIS, EVERY ASSERTION BELOW IS SATISFIED BY A ROUTE THAT REFUSES EVERYONE. The
    // subject-removal test (CHARTER §17.1.1) applied to a refusal suite: a property about how a
    // surface says no carries no information until something is known to get a yes.
    const res = await raw('GET', TEMPLATES, { token: adminToken });
    assert.equal(res.status, 200, res.body);
    assert.ok(Array.isArray(JSON.parse(res.body).templates), res.body.slice(0, 200));
  });

  test('no credential presented → 401 with a bare RFC 6750 challenge', async () => {
    const res = await raw('GET', TEMPLATES);
    assert.equal(res.status, 401);
    assert.deepEqual(JSON.parse(res.body), { error: 'authentication required' });
    // RFC 6750 §3.1: no error code when the request carried no authentication information.
    assert.equal(res.headers['www-authenticate'], 'Bearer realm="dbiz-intelligence-plane"');
    assert.ok(!res.headers['www-authenticate']?.includes('error='), 'a bare challenge must carry no error code');
  });

  test('credential presented and refused → 401 with error="invalid_token"', async () => {
    const res = await raw('GET', TEMPLATES, { token: 'not.a.valid.token' });
    assert.equal(res.status, 401);
    assert.deepEqual(JSON.parse(res.body), { error: 'credential rejected' });
    assert.ok(res.headers['www-authenticate']?.includes('error="invalid_token"'), res.headers['www-authenticate']);
  });

  test('the two refusals are actually different over the wire', async () => {
    const absent = await raw('GET', TEMPLATES);
    const rejected = await raw('GET', TEMPLATES, { token: 'not.a.valid.token' });
    assert.notEqual(absent.body.trim(), rejected.body.trim());
    assert.notEqual(absent.headers['www-authenticate'], rejected.headers['www-authenticate']);
  });

  test('WHY a credential was refused is BYTE-IDENTICAL across all four reasons (no oracle)', async () => {
    // malformed · bad-signature · expired · unsupported-scheme. Each is a different server-side
    // fact; each must be the same bytes here. Separating `expired` from `bad-signature` would
    // tell whoever holds a token whether this deployment's signing secret has rotated — a fact
    // about SERVER state that the holder of a stolen token does not otherwise possess.
    const probes: [string, { token?: string; headers?: Record<string, string> }][] = [
      ['malformed', { token: 'not-even-three-parts' }],
      ['bad-signature', { token: `${issueSessionToken({ id: 'x', roles: ['viewer'] }, 'a-completely-different-secret-32-chars')}` }],
      ['expired', { token: expired() }],
      ['unsupported-scheme', { headers: { Authorization: 'Basic dXNlcjpwYXNzd29yZA==' } }],
    ];
    const seen: string[] = [];
    for (const [label, opts] of probes) {
      const res = await raw('GET', TEMPLATES, opts);
      assert.equal(res.status, 401, `${label} must be 401`);
      seen.push(`${res.status}|${res.headers['www-authenticate']}|${res.body.trim()}`);
    }
    assert.equal(new Set(seen).size, 1, `a rejection reason is distinguishable over the wire: ${JSON.stringify(seen, null, 1)}`);
    // And none of the four reason words appears anywhere in a response.
    for (const word of ['malformed', 'signature', 'expired', 'scheme']) {
      assert.ok(!seen[0]!.includes(word), `the response leaks the reason "${word}"`);
    }
  });

  test('the reason IS recorded server-side, against the correlation id the caller was handed', async () => {
    // The distinction is moved, not discarded — otherwise this would be `NOT MEASURED` dressed as
    // a security property (CHARTER §17.1). An operator inside the trust boundary must be able to
    // answer "why was that Execution Plane refused?" from the log alone.
    logLines.length = 0;
    const res = await raw('GET', TEMPLATES, { token: expired(), headers: { 'x-correlation-id': 'obl-002-probe' } });
    assert.equal(res.status, 401);
    assert.ok(!res.body.includes('expired'), 'the wire must not carry the reason');
    const line = logLines.map((l) => JSON.parse(l)).find((l) => l.correlationId === 'obl-002-probe');
    assert.ok(line, `no log line for the probe: ${logLines.length} lines captured`);
    assert.equal(line.auth, 'rejected');
    assert.equal(line.authRejection, 'expired');
  });

  test('the same separation holds on sealed package retrieval, and refusals stay single there', async () => {
    // The two handlers refuse independently — `/api/packages/{hash}` inherits nothing from
    // `route()` (P-79.8) — so the property is proved on both or it is proved on neither.
    const absent = await raw('GET', `/api/packages/${ACME_HASH}`);
    const rejected = await raw('GET', `/api/packages/${ACME_HASH}`, { token: 'not.a.valid.token' });
    assert.equal(absent.status, 401);
    assert.equal(rejected.status, 401);
    assert.deepEqual(JSON.parse(absent.body), { error: 'authentication required' });
    assert.deepEqual(JSON.parse(rejected.body), { error: 'credential rejected' });
    // P-79.6 is untouched: neither refusal says anything about whether a package exists, so the
    // present hash and an absent one are still indistinguishable to an unauthenticated caller.
    const absentHash = await raw('GET', `/api/packages/${ABSENT_HASH}`);
    assert.equal(absentHash.body.trim(), absent.body.trim());
    assert.equal(absentHash.headers['www-authenticate'], absent.headers['www-authenticate']);
  });
});

// ── The deployment that cannot evaluate a credential at all ───────────────────
//
// D-111's SHAPE, ONE FIELD ALONG. `app.module.ts` already records that omitting `authenticate`
// from `PACKAGE_DEPS` "makes the route answer 401 to every caller, including the package's
// owner". That is an OPERATIONAL fault reported as a CREDENTIAL fault, and it is the single most
// expensive misdiagnosis on this boundary: it sends the far side to rotate a grant that was
// never the problem, which is exactly where OBL-002 spent its time. A deployment that cannot
// evaluate credentials is making no statement about the one presented — 501, never 401.

describe('an unconfigured authenticator is 501, never 401', () => {
  let bare: INestApplication;
  let barePort: number;

  before(async () => {
    const repo = new TenantConfigRepository(new FileTenantConfigStore(join(root, 'bare-tenants')));
    // `authenticate` DELIBERATELY ABSENT. Everything else is wired.
    bare = await createApp({
      repo,
      services: { auth: { issueOneTimeCredential: () => 'otc' }, registration: { recordTenantCreated: () => {} } },
      registrationEndpoint: 'https://gateway.test/register',
    }, { exposeApiDocs: false, logger: createLogger({ level: 'error', sink: () => {} }) });
    await bare.listen(0, '127.0.0.1');
    barePort = Number(new URL(await bare.getUrl()).port);
  });
  after(async () => { await bare?.close(); });

  const bareRaw = (path: string, token?: string): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const socket = net.connect(barePort, '127.0.0.1', () => {
        const lines = [`GET ${path} HTTP/1.1`, 'Host: 127.0.0.1', 'Connection: close'];
        if (token) lines.push(`Authorization: Bearer ${token}`);
        socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      });
      let buf = '';
      socket.setTimeout(10_000, () => { socket.destroy(); reject(new Error('socket timeout')); });
      socket.on('data', (d) => { buf += d.toString('utf8'); });
      socket.on('error', reject);
      socket.on('close', () => {
        const split = buf.indexOf('\r\n\r\n');
        const head = buf.slice(0, split < 0 ? buf.length : split);
        resolve({
          status: Number((head.split('\r\n')[0] ?? '').split(' ')[1] ?? 0),
          body: (split < 0 ? '' : buf.slice(split + 4)).replace(/^[0-9a-fA-F]+\r\n/, '').replace(/\r\n0\r\n\r\n$/, ''),
        });
      });
    });

  test('the templates route reports a deployment fault, not a credential fault', async () => {
    for (const token of [undefined, adminToken]) {
      const res = await bareRaw('/api/application-templates', token);
      assert.equal(res.status, 501, `token=${token ? 'valid' : 'none'} → ${res.status} ${res.body}`);
      assert.deepEqual(JSON.parse(res.body), { error: 'authentication is not configured' });
    }
  });

  test('it still refuses — 501 grants nothing and serves no catalogue', async () => {
    const res = await bareRaw('/api/application-templates', adminToken);
    assert.ok(!res.body.includes('templates'), 'a 501 must not serve the body it declined to authorise');
  });

  test('the tenant surface reports it identically (one adapter, one answer)', async () => {
    const res = await bareRaw('/api/tenants', adminToken);
    assert.equal(res.status, 501);
    assert.deepEqual(JSON.parse(res.body), { error: 'authentication is not configured' });
  });
});

// ── Path traversal (CWE-22 / CWE-73) ──────────────────────────────────────────

describe('path traversal is refused on every slug-bearing route', () => {
  // Each of these reached the filesystem before the fix. `..` and `%2e%2e` returned 200 with content
  // from outside the tenant root; `DELETE /api/tenants/%2e%2e` removed the whole state volume.
  const HOSTILE_SLUGS = [
    '..', '%2e%2e', '%2E%2E', '%2e%2E', '.', '%2e',
    '..%2f..', '%2e%2e%2f%2e%2e', '..%5cOTHER-TENANT-DATA', '..%2fOTHER-TENANT-DATA',
    '....//', '%252e%252e', 'acme%2f..%2f..', '/etc/passwd', 'C:%5CWindows',
  ];

  for (const slug of HOSTILE_SLUGS) {
    test(`GET /api/tenants/${slug} never returns data from outside the tenant root`, async () => {
      const res = await raw('GET', `/api/tenants/${slug}`, { token: adminToken });
      assert.ok(res.status >= 400, `expected a refusal, got ${res.status}`);
      assert.ok(!res.body.includes('OUTSIDE THE TENANT ROOT'), 'content escaped the tenant root');
    });

    test(`DELETE /api/tenants/${slug} never removes anything outside the tenant root`, async () => {
      const res = await raw('DELETE', `/api/tenants/${slug}`, { token: adminToken });
      assert.ok(res.status >= 400, `expected a refusal, got ${res.status}`);
      assert.ok(existsSync(join(root, 'OTHER-TENANT-DATA')), 'a directory outside the tenant root was deleted');
      assert.ok(existsSync(tenantsDir), 'the tenant root itself was deleted');
      assert.ok(existsSync(join(root, 'tenant.json')), 'a file above the tenant root was deleted');
    });
  }

  test('the legitimate tenants are still addressable and intact after every hostile attempt', async () => {
    const res = await raw('GET', '/api/tenants/acme-corp', { token: adminToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('acme-corp'));
    assert.equal(readdirSync(tenantsDir).length, 2, 'both tenants survive');
  });

  test('a slug is case-folded rather than treated as a distinct tenant', async () => {
    // Two slugs differing only by case must not become two tenants on a case-insensitive filesystem.
    const res = await raw('GET', '/api/tenants/ACME-CORP', { token: adminToken });
    assert.equal(res.status, 200);
  });
});

// ── Authentication ────────────────────────────────────────────────────────────

describe('authentication is required and fails closed', () => {
  const PROTECTED: readonly [string, string][] = [
    ['GET', '/api/tenants'], ['POST', '/api/tenants'], ['GET', '/api/tenants/acme-corp'],
    ['DELETE', '/api/tenants/acme-corp'], ['PATCH', '/api/tenants/acme-corp/configuration'],
    ['POST', '/api/tenants/acme-corp/activate'], ['POST', '/api/tenants/acme-corp/ep-token'],
    ['GET', '/api/tenants/acme-corp/updates'], ['POST', '/api/tenants/acme-corp/suspend'],
  ];

  for (const [method, path] of PROTECTED) {
    test(`${method} ${path} requires a token`, async () => {
      const res = await raw(method, path, { body: '{}' });
      assert.equal(res.status, 401);
    });
  }

  test('a forged token is refused', async () => {
    const forged = issueSessionToken({ id: 'attacker@evil.test', roles: ['platform-admin'] }, 'the-wrong-signing-secret');
    const res = await raw('GET', '/api/tenants', { token: forged });
    assert.equal(res.status, 401);
  });

  test('an expired token is refused', async () => {
    const past = () => Math.floor(Date.now() / 1000) - 7200;
    const expired = issueSessionToken({ id: 'admin@dbiz.test', roles: ['platform-admin'] }, SECRET, { ttlSeconds: 60, now: past });
    const res = await raw('GET', '/api/tenants', { token: expired });
    assert.equal(res.status, 401);
  });

  test('a token with a tampered payload is refused', async () => {
    const parts = adminToken.split('.');
    const tampered = Buffer.from(JSON.stringify({ sub: 'attacker', roles: ['platform-admin'], exp: 9e9 })).toString('base64url');
    const res = await raw('GET', '/api/tenants', { token: `${parts[0]}.${tampered}.${parts[2]}` });
    assert.equal(res.status, 401);
  });
});

// ── Authorization and tenant isolation (C-07.11) ──────────────────────────────

describe('authorisation is enforced and tenant scope is honoured', () => {
  test('a viewer cannot mutate', async () => {
    const viewer = issueSessionToken({ id: 'v@dbiz.test', roles: ['viewer'], tenants: ['acme-corp'] }, SECRET);
    const res = await raw('DELETE', '/api/tenants/acme-corp', { token: viewer });
    assert.equal(res.status, 403);
  });

  test('a tenant-scoped principal cannot reach another tenant', async () => {
    const scoped = issueSessionToken({ id: 't@dbiz.test', roles: ['tenant-admin'], tenants: ['acme-corp'] }, SECRET);
    const own = await raw('GET', '/api/tenants/acme-corp', { token: scoped });
    assert.equal(own.status, 200, 'its own tenant is reachable');
    const other = await raw('GET', '/api/tenants/globex', { token: scoped });
    assert.equal(other.status, 403, 'another tenant is refused');
  });

  test('the collection lists only tenants the caller is scoped to', async () => {
    const scoped = issueSessionToken({ id: 't@dbiz.test', roles: ['tenant-admin'], tenants: ['acme-corp'] }, SECRET);
    const res = await raw('GET', '/api/tenants', { token: scoped });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('acme-corp'));
    assert.ok(!res.body.includes('globex'), 'another tenant leaked through the collection');
  });

  test('an Execution-Plane token cannot escalate to a configuration route', async () => {
    const ep = issueEpToken('acme-corp', 1, SECRET);
    const res = await raw('POST', '/api/tenants/acme-corp/ep-token', { token: ep.token });
    assert.equal(res.status, 403);
  });

  test('an Execution-Plane token cannot address a different tenant', async () => {
    const ep = issueEpToken('acme-corp', 1, SECRET);
    const res = await raw('GET', '/api/tenants/globex/updates', { token: ep.token });
    assert.equal(res.status, 403);
  });
});

// ── Security headers ──────────────────────────────────────────────────────────

describe('security headers are present on every response', () => {
  const REQUIRED = [
    'content-security-policy', 'x-content-type-options', 'x-frame-options',
    'referrer-policy', 'cross-origin-opener-policy', 'permissions-policy',
  ];

  for (const header of REQUIRED) {
    test(`${header} is set`, async () => {
      const res = await raw('GET', '/api/health');
      assert.ok(res.headers[header], `${header} is missing`);
    });
  }

  test('x-powered-by is not advertised', async () => {
    const res = await raw('GET', '/api/health');
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  test('headers are present on a refusal too, not only on success', async () => {
    const res = await raw('GET', '/api/tenants');
    assert.equal(res.status, 401);
    assert.ok(res.headers['x-content-type-options']);
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────────

describe('CORS denies by default and allows only declared origins', () => {
  test('an allow-listed origin is echoed', async () => {
    const res = await raw('GET', '/api/health', { headers: { Origin: 'https://portal.dbiz.test' } });
    assert.equal(res.headers['access-control-allow-origin'], 'https://portal.dbiz.test');
  });

  test('an unknown origin receives no allow header', async () => {
    const res = await raw('GET', '/api/health', { headers: { Origin: 'https://evil.test' } });
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  test('a wildcard is never emitted', async () => {
    const res = await raw('GET', '/api/health', { headers: { Origin: 'https://portal.dbiz.test' } });
    assert.notEqual(res.headers['access-control-allow-origin'], '*');
  });
});

// ── API documentation exposure ────────────────────────────────────────────────

describe('API documentation is not exposed in the production posture', () => {
  test('/api/docs-json is not served', async () => {
    const res = await raw('GET', '/api/docs-json');
    assert.equal(res.status, 404);
  });
  test('/api/docs is not served', async () => {
    const res = await raw('GET', '/api/docs');
    assert.ok(res.status === 404 || res.status === 301, `unexpected ${res.status}`);
  });
});

// ── Body limits and error contract ────────────────────────────────────────────

describe('request bodies are bounded and errors are correctly typed', () => {
  test('an over-limit body is refused with 413, not 500', async () => {
    const body = JSON.stringify({ companyName: 'x'.repeat(MAX_BODY_BYTES + 1024) });
    const res = await raw('PATCH', '/api/tenants/acme-corp/branding', { token: adminToken, body });
    assert.equal(res.status, 413, 'an over-large body must be a client error, not a server error');
  });

  test('malformed JSON is refused with 400, not 500', async () => {
    const res = await raw('POST', '/api/tenants', { token: adminToken, body: '{not json' });
    assert.equal(res.status, 400);
  });

  test('an error response never echoes internal exception text', async () => {
    const res = await raw('POST', '/api/tenants', { token: adminToken, body: '{not json' });
    assert.ok(!/Unexpected token/i.test(res.body), 'internal parser detail leaked to the caller');
  });

  test('every error response carries a correlation id for support', async () => {
    const res = await raw('GET', '/api/tenants');
    assert.ok(res.headers['x-correlation-id'], 'no correlation id on the response');
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('rate limiting protects the unauthenticated surface', () => {
  test('the unauthenticated sign-in route is rate limited', async () => {
    let sawLimit = false;
    for (let i = 0; i < 40; i += 1) {
      const res = await raw('POST', '/api/auth/session', { body: JSON.stringify({ idToken: 'dev:x@y.test' }) });
      if (res.status === 429) { sawLimit = true; break; }
    }
    assert.ok(sawLimit, 'the unauthenticated route accepted 40 requests without limiting');
  });

  test('a limited response advertises retry-after', async () => {
    let res = await raw('POST', '/api/auth/session', { body: '{}' });
    for (let i = 0; i < 40 && res.status !== 429; i += 1) res = await raw('POST', '/api/auth/session', { body: '{}' });
    assert.equal(res.status, 429);
    assert.ok(res.headers['retry-after']);
  });
});

// ── Observability ─────────────────────────────────────────────────────────────

describe('every request is recorded', () => {
  test('a successful request emits one structured JSON log line', async () => {
    logLines = [];
    await raw('GET', '/api/health');
    const entry = logLines.map((l) => JSON.parse(l) as Record<string, unknown>).find((e) => e['event'] === 'http.request');
    assert.ok(entry, 'no http.request log line was emitted');
    assert.equal(entry['method'], 'GET');
    assert.equal(entry['status'], 200);
    assert.ok(entry['correlationId'], 'log line carries no correlation id');
  });

  test('a refused request is recorded too', async () => {
    logLines = [];
    await raw('GET', '/api/tenants');
    const entries = logLines.map((l) => JSON.parse(l) as Record<string, unknown>);
    assert.ok(entries.some((e) => e['event'] === 'http.request' && e['status'] === 401), '401 was not recorded');
  });

  test('a bearer token never appears in a log line', async () => {
    logLines = [];
    await raw('GET', '/api/tenants', { token: adminToken });
    const joined = logLines.join('\n');
    assert.ok(!joined.includes(adminToken), 'the caller token was written to the log');
  });

  test('the principal is recorded as a stable non-reversible handle, not an email', async () => {
    logLines = [];
    await raw('GET', '/api/tenants', { token: adminToken });
    const entry = logLines.map((l) => JSON.parse(l) as Record<string, unknown>).find((e) => e['event'] === 'http.request');
    assert.ok(entry, 'no log line');
    assert.ok(!String(entry['principal']).includes('@'), 'an email address reached the log');
    assert.match(String(entry['principal']), /^p_[0-9a-f]{12}$/);
  });
});

// ── Evidence ingress over the socket (ADR-0082 P-82.2/P-82.5, D-128) ─────────────────────────
//
// THE ROUTE MOVED HERE FROM `ip-execute-gateway.mjs`, WHICH BINDS 127.0.0.1, EXITS ON PRODUCTION,
// AND WHOSE `/v1/*` PATHS NEVER REACH THE DEPLOYED APPLICATION (D-121 §5). Until this suite drove
// it, R-20.12's binding was enforced on a development path only.
//
// DRIVEN THROUGH THE ASSEMBLED APPLICATION, for this file's standing reason: a route proved
// in-process and never driven through the assembled app is a route whose adapter nobody has tested
// (D-111). The positive control is FIRST and is not optional — a suite in which every case refuses
// proves that something refuses, not that this route discriminates. A 405, a 401 and a 400 all mean
// "no", and a property written to produce "no" is confirmed by any of them.
describe('evidence ingress — POST /v1/evidence through the assembled application', () => {
  const HEX = 'b'.repeat(64);
  // THE DOMAINS AND STATES ARE THE CONTRACT'S, NOT INVENTED. The first version of this fixture
  // used `dbiz.evidence@1` and `assuranceState: 'verified'` and was REFUSED by the route — the
  // parse rejecting a hand-written fixture is the parse working, and it is recorded here because
  // a fixture authored to match the code rather than the contract is what D-117 counts.
  // THE PACKAGE HASH IS NOW THE ONE ACME ACTUALLY HAS A RUN FOR. It was `HEX` — an arbitrary value
  // — which was correct while the route only checked the field's SHAPE, and is not once the field
  // must RESOLVE (P-82.5). `evDigest` keeps `HEX`: the evidence content hash binds to nothing here.
  const pkgDigest = { algorithm: 'sha256-jcs-v1', domain: 'dbiz.execution-package@1', value: EVIDENCE_PKG_HASH };
  const evDigest = { algorithm: 'sha256-jcs-v1', domain: 'dbiz.evidence-record@1', value: HEX };
  const digestFor = (value: string) => ({ algorithm: 'sha256-jcs-v1', domain: 'dbiz.execution-package@1', value });
  const conforming = (tenantId: string) => ({
    contractVersion: '1.0.0',
    evidenceId: 'ev-1',
    tenantId,
    packageHash: pkgDigest,
    contentHash: evDigest,
    classification: 'C2' as const,
    capturedAt: '2026-08-06T00:00:00Z',
    expiresAt: '2026-09-06T00:00:00Z',
    assuranceState: 'CERTIFIED',
    outcome: 'captured' as const,
  });
  const post = (token: string | undefined, reference: unknown) =>
    raw('POST', '/v1/evidence', {
      ...(token ? { token } : {}),
      body: JSON.stringify({ reference }),
      headers: { 'content-type': 'application/json' },
    });

  let acmeTenantId: string;
  before(() => {
    const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
    acmeTenantId = repo.load(acmeSlug)!.onboarding.tenantId;
  });

  // THE POSITIVE CONTROL. Everything below is only readable because this one passes.
  test('a conforming reference from the owning Execution Plane is ACCEPTED', async () => {
    const res = await post(acmeEpToken, conforming(acmeTenantId));
    assert.equal(res.status, 202, res.body);
    const body = JSON.parse(res.body) as { accepted: boolean; packageHash: string; runId: string; recorded: boolean };
    assert.equal(body.accepted, true);
    assert.equal(body.packageHash, EVIDENCE_PKG_HASH);
    // THE BINDING IS OBSERVABLE, NOT MERELY PERFORMED (P-82.5). The route resolved the hash to a
    // run and says which — so this test would fail if the resolution were skipped and the 202
    // returned anyway, which a status-only assertion could not distinguish.
    assert.equal(body.runId, 'run-acme-1');
    // DURABLE NOW (ADR-0082 §6 step 3). This asserted `false` while the route validated and
    // discarded — correct then, and the opposite of correct once the store is wired. The field is
    // kept rather than dropped because a reader of the response still needs to know which it was.
    assert.equal(body.recorded, true);
  });

  // ── THE SUBTRACTION, PROVED THROUGH THE ASSEMBLED APPLICATION, IN BOTH DIRECTIONS ─────────
  //
  // A run OBSERVED ONLY AS OUTSTANDING has not been shown to subtract, and a run observed only as
  // absent has not been shown to have been there. This drives the whole path — HTTP, auth, binding,
  // store — and reads the outstanding collection either side of it.
  test('a run is OUTSTANDING before its evidence arrives and NOT OUTSTANDING after — over the wire', async () => {
    const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
    const sub = repo.createFromWelcome({ tenantName: 'Sub Co', organisationName: 'Sub', primaryAdministrator: 'Dee' } as never);
    const slug = sub.onboarding.slug;
    const tenantId = sub.onboarding.tenantId;
    const ctx = tenantContext({ tenantId, tenantSlug: slug });
    const token = issueEpToken(slug, repo.epTokenVersion(slug), SECRET).token;

    await runRecords.onPackageAuthored(ctx, {
      runId: 'run-sub-1', packageHash: EVIDENCE_PKG_HASH, contractVersion: '1.0.0',
      authoredAt: '2026-08-06T00:00:00.000Z',
    });

    assert.deepEqual((await runRecords.outstandingRuns(ctx)).map((r) => r.runId), ['run-sub-1']);

    const res = await post(token, conforming(tenantId));
    assert.equal(res.status, 202, res.body);
    assert.equal((JSON.parse(res.body) as { recorded: boolean }).recorded, true);

    // THE SUBTRACTION. Without `onEvidenceArrived` this line is what fails, and it is the only line
    // in this suite that would.
    assert.deepEqual(await runRecords.outstandingRuns(ctx), []);
  });

  test('re-submitting the SAME evidence is idempotent — the run stays subtracted and nothing moves', async () => {
    const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
    const rep = repo.createFromWelcome({ tenantName: 'Rep Co', organisationName: 'Rep', primaryAdministrator: 'Eve' } as never);
    const slug = rep.onboarding.slug;
    const tenantId = rep.onboarding.tenantId;
    const ctx = tenantContext({ tenantId, tenantSlug: slug });
    const token = issueEpToken(slug, repo.epTokenVersion(slug), SECRET).token;

    await runRecords.onPackageAuthored(ctx, {
      runId: 'run-rep-1', packageHash: EVIDENCE_PKG_HASH, contractVersion: '1.0.0',
      authoredAt: '2026-08-06T00:00:00.000Z',
    });

    const first = await post(token, conforming(tenantId));
    const second = await post(token, conforming(tenantId));

    // A RETRY IS NOT AN ERROR. An Execution Plane whose 202 was lost will resend, and refusing that
    // would make a successful submission look unsent.
    assert.equal(first.status, 202, first.body);
    assert.equal(second.status, 202, second.body);
    assert.equal((JSON.parse(first.body) as { alreadyRecorded: boolean }).alreadyRecorded, false);
    assert.equal((JSON.parse(second.body) as { alreadyRecorded: boolean }).alreadyRecorded, true);
    assert.equal((await runRecords.evidenceFor(ctx, 'run-rep-1'))!.recordedAtMs,
      (await runRecords.evidenceFor(ctx, 'run-rep-1'))!.recordedAtMs);
    assert.deepEqual(await runRecords.outstandingRuns(ctx), []);
  });

  // ── P-82.5's COMPLETION CONDITION: THE NEGATIVE, PROVED BY CONSTRUCTION ────────────────────
  //
  // ADR-0082 §6 step 1 requires "an executing test showing an evidence reference WITHOUT a
  // resolvable `packageHash` REFUSED, not stored." A test over a hash that happens to exist passes
  // under BOTH implementations — the one that resolves and the one that does not — and would
  // certify this gap closed while it is open. **Only the unresolvable case can tell them apart.**
  test('a well-formed packageHash that names NO run is REFUSED — format-binding is not referential binding', async () => {
    const res = await post(acmeEpToken, { ...conforming(acmeTenantId), packageHash: digestFor(UNKNOWN_PKG_HASH) });
    assert.equal(res.status, 422, res.body);
    assert.match(res.body, /names no run authored for this tenant/);
    // AND IT IS NOT A CONTRACT FAILURE. The reference parses perfectly — 64 hex, right domain, every
    // required field. If this asserted only "422" it would pass on the schema refusal above and
    // prove nothing about resolution.
    assert.doesNotMatch(res.body, /does not satisfy the published contract/);
  });

  // ── P-70.4 REACHING THIS ROUTE ─────────────────────────────────────────────────────────────
  //
  // `GLOBEX_RUN_HASH` IS A REAL RUN — recorded in Globex's partition in this suite's `before`. Acme
  // naming it must be refused **by the same expression, byte for byte**, as a hash naming nothing
  // at all. A refusal that distinguished them would answer "does this package exist somewhere in
  // the platform?" to anything holding one valid EP credential.
  test('a packageHash naming ANOTHER tenant\'s run is refused IDENTICALLY to one naming nothing', async () => {
    const foreign = await post(acmeEpToken, { ...conforming(acmeTenantId), packageHash: digestFor(GLOBEX_RUN_HASH) });
    const absent = await post(acmeEpToken, { ...conforming(acmeTenantId), packageHash: digestFor(UNKNOWN_PKG_HASH) });

    assert.equal(foreign.status, 422, foreign.body);
    assert.equal(foreign.status, absent.status);
    // THE HASH ITSELF DIFFERS BETWEEN THE TWO BODIES — it is echoed back, and echoing what the
    // caller sent reveals nothing. Everything else must match, so the comparison is made on the
    // message with the caller's own hash removed.
    const scrub = (b: string) => b.replace(GLOBEX_RUN_HASH, '<h>').replace(UNKNOWN_PKG_HASH, '<h>');
    assert.equal(scrub(foreign.body), scrub(absent.body));
  });

  // THE OTHER DIRECTION, so the pair above cannot pass by the store being empty for everyone: the
  // run Acme was refused for IS bindable by the plane that owns it.
  test('the same hash Acme was refused for BINDS for Globex — the refusal was partition, not absence', async () => {
    const globexTenantId = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir))
      .load(globexSlug)!.onboarding.tenantId;
    const res = await post(globexEpToken, { ...conforming(globexTenantId), packageHash: digestFor(GLOBEX_RUN_HASH) });
    assert.equal(res.status, 202, res.body);
    assert.equal((JSON.parse(res.body) as { runId: string }).runId, 'run-globex-1');
  });

  // R-20.12's binding. Unattributable evidence means no run ever leaves the pending collection,
  // so `/work` would return the same work forever — a permanently NON-EMPTY falsehood.
  test('a reference with no packageHash is REFUSED, and the refusal names the contract', async () => {
    const { packageHash: _omitted, ...unbound } = conforming(acmeTenantId);
    const res = await post(acmeEpToken, unbound);
    assert.equal(res.status, 422, res.body);
    assert.match(res.body, /does not satisfy the published contract/);
  });

  // INV-1 / R-20.14. The schema is `.passthrough()`, so this reference PARSES — which is exactly
  // why the payload check cannot be left to the parse.
  test('a reference carrying an embedded payload is REFUSED even though it parses', async () => {
    const res = await post(acmeEpToken, { ...conforming(acmeTenantId), content: 'a screenshot' });
    assert.equal(res.status, 422, res.body);
    assert.match(res.body, /references and hashes only/);
  });

  test('a payload nested inside artefacts[] is REFUSED — the guard looks one level down', async () => {
    const res = await post(acmeEpToken, { ...conforming(acmeTenantId), artefacts: [{ content: 'x' }] });
    assert.equal(res.status, 422, res.body);
    assert.match(res.body, /references and hashes only/);
  });

  // The credential decides the tenant; the body may not contradict it. Silently re-scoping would
  // record one tenant's evidence under another's identity.
  test('a reference claiming ANOTHER tenant is REFUSED, not silently re-scoped', async () => {
    const res = await post(acmeEpToken, { ...conforming(acmeTenantId), tenantId: 'tnt-000000000000' });
    assert.equal(res.status, 403, res.body);
  });

  test('no credential is REFUSED with the RFC 6750 challenge', async () => {
    const res = await post(undefined, conforming(acmeTenantId));
    assert.equal(res.status, 401, res.body);
    assert.ok(res.headers['www-authenticate'], 'no challenge header');
  });

  // A global principal resolves to no single tenant, so the fail-closed answer is to refuse —
  // the same reasoning as package retrieval, and for the same reason: there is no slug on this
  // path for `mayAccessTenant` to range over.
  test('a platform-admin is REFUSED — a global principal resolves to no tenant', async () => {
    const res = await post(adminToken, conforming(acmeTenantId));
    assert.equal(res.status, 403, res.body);
    assert.match(res.body, /scoped to exactly one tenant/);
  });

  // THE CHECK A NEW ROUTE SILENTLY OMITS. Without it this surface accepts every EP token ever
  // issued, including the ones rotation was meant to kill, and no test that does not specifically
  // rotate a token would notice.
  test('a SUPERSEDED EP token is REFUSED — rotation is enforced on this route', async () => {
    // ON ITS OWN TENANT, DELIBERATELY. Bumping acme's or globex's stored version would revoke the
    // tokens minted in `before()` and silently change what the retrieval tests above are asserting
    // — a test that mutates shared state is a test that decides its neighbours' results.
    const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
    const rotating = repo.createFromWelcome({ tenantName: 'Rotate Co', organisationName: 'Rotate', primaryAdministrator: 'Cal' } as never);
    const slug = rotating.onboarding.slug;
    const tenantId = rotating.onboarding.tenantId;

    // v1 is issued and then SUPERSEDED by v2 — the rotation this check exists for.
    const superseded = issueEpToken(slug, 1, SECRET).token;
    repo.recordEpToken(slug, { version: 2, issuedAt: '2026-08-06T00:00:00Z', expiresAt: '2026-09-06T00:00:00Z', last4: 'abcd' });

    // THIS TENANT NEEDS ITS OWN RUN, for the same reason it needs its own tenant (ADR-0082 P-82.5).
    // A tenant created inside a test has no authored runs, so every evidence reference for it is
    // legitimately unbindable — and the positive control below would then fail with a 422 that says
    // nothing about rotation. Recording the run here keeps this test's subject rotation alone.
    await runRecords.onPackageAuthored(
      tenantContext({ tenantId, tenantSlug: slug }),
      { runId: 'run-rotate-1', packageHash: EVIDENCE_PKG_HASH, contractVersion: '1.0.0', authoredAt: '2026-08-06T00:00:00.000Z' },
    );

    // THE POSITIVE CONTROL FOR THIS TEST, not for the suite: the CURRENT version is accepted, so a
    // 401 below is rotation being enforced rather than this tenant being unusable.
    const current = issueEpToken(slug, 2, SECRET).token;
    const ok = await post(current, conforming(tenantId));
    assert.equal(ok.status, 202, `current token rejected: ${ok.body}`);

    const res = await post(superseded, conforming(tenantId));
    assert.equal(res.status, 401, res.body);
    assert.match(res.body, /revoked/);
  });

  // ══ ADR-0080 §6 step 3 — `GET /api/tenants/{slug}/work`, ALL THREE COMPLETION CONDITIONS ══
  //
  // Driven through the assembled application over a real socket, because a route proved in-process
  // and never driven through the deployed adapter is a route whose adapter nobody has tested (D-111).
  describe('the work request exchange — GET /api/tenants/{slug}/work', () => {
    const work = (slug: string, token: string | undefined) =>
      raw('GET', `/api/tenants/${slug}/work`, { ...(token ? { token } : {}) });

    // ── CONDITION (a): AN EMPTY COLLECTION IS A SUCCESS, AND THE EP DOES NOT HALT ─────────
    test('a tenant with no outstanding runs gets 200 and an EMPTY collection — never a 404', async () => {
      const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
      const idle = repo.createFromWelcome({ tenantName: 'Idle Co', organisationName: 'Idle', primaryAdministrator: 'Fay' } as never);
      const slug = idle.onboarding.slug;
      const token = issueEpToken(slug, repo.epTokenVersion(slug), SECRET).token;

      const res = await work(slug, token);
      // THE WHOLE REASON ADR-0080 §3 ALTERNATIVE B WAS REJECTED. A singular resource would 404 here;
      // under R-05.24 a refused retrieval is a Refusal, and document 05's degradation matrix turns a
      // Refusal into HALT. An Execution Plane with nothing to do would HALT ON EVERY QUIET POLL.
      assert.equal(res.status, 200, res.body);
      assert.notEqual(res.status, 404);
      assert.deepEqual(JSON.parse(res.body), { work: [] });
    });

    // ── CONDITION (b): THE DERIVATION, PROVED IN BOTH DIRECTIONS, AT THE ROUTE ────────────
    test('a run with no evidence APPEARS in the collection; the same run after evidence arrives does NOT', async () => {
      const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
      const w = repo.createFromWelcome({ tenantName: 'Work Co', organisationName: 'Work', primaryAdministrator: 'Gus' } as never);
      const slug = w.onboarding.slug;
      const tenantId = w.onboarding.tenantId;
      const token = issueEpToken(slug, repo.epTokenVersion(slug), SECRET).token;

      await runRecords.onPackageAuthored(tenantContext({ tenantId, tenantSlug: slug }), {
        runId: 'run-work-1', packageHash: EVIDENCE_PKG_HASH, contractVersion: '1.0.0',
        authoredAt: '2026-08-06T00:00:00.000Z',
      });

      // DIRECTION ONE — it appears, and it is identified by the RUN, carrying the hash it points at.
      const before = await work(slug, token);
      assert.equal(before.status, 200, before.body);
      const listed = (JSON.parse(before.body) as { work: { runId: string; packageHash: string }[] }).work;
      assert.deepEqual(listed.map((x) => x.runId), ['run-work-1']);
      assert.equal(listed[0]!.packageHash, EVIDENCE_PKG_HASH);

      // Evidence arrives through the real ingress route, not by touching the store directly — the
      // subtraction has to survive the whole path or it has not been shown at the route.
      const submitted = await raw('POST', '/v1/evidence', {
        token, body: JSON.stringify({ reference: conforming(tenantId) }),
        headers: { 'content-type': 'application/json' },
      });
      assert.equal(submitted.status, 202, submitted.body);

      // DIRECTION TWO — it is GONE. A /work observed only non-empty has not been shown to subtract.
      const after = await work(slug, token);
      assert.equal(after.status, 200, after.body);
      assert.deepEqual(JSON.parse(after.body), { work: [] });
    });

    test('a run WITHOUT evidence survives repeated polls unchanged (ADR-0080 §5.1)', async () => {
      const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
      const p = repo.createFromWelcome({ tenantName: 'Poll Co', organisationName: 'Poll', primaryAdministrator: 'Hal' } as never);
      const slug = p.onboarding.slug;
      const token = issueEpToken(slug, repo.epTokenVersion(slug), SECRET).token;
      await runRecords.onPackageAuthored(tenantContext({ tenantId: p.onboarding.tenantId, tenantSlug: slug }), {
        runId: 'run-poll-1', packageHash: EVIDENCE_PKG_HASH, contractVersion: '1.0.0',
        authoredAt: '2026-08-06T00:00:00.000Z',
      });

      const a = await work(slug, token);
      const b = await work(slug, token);
      const c = await work(slug, token);
      assert.equal(a.body, b.body);
      assert.equal(b.body, c.body);
      assert.deepEqual((JSON.parse(c.body) as { work: { runId: string }[] }).work.map((x) => x.runId), ['run-poll-1']);
    });

    // ── CONDITION (c): TWO IDENTICAL POLLS LEAVE THE PLANE BYTE-IDENTICAL ────────────────
    //
    // **THIS IS P-82.3 AT THE ROUTE, AND IT IS THE PROPERTY THE WHOLE STORE WAS DESIGNED AROUND.**
    // Ask what changes when an Execution Plane polls for work it has already seen. Under a DELIVERY
    // record something changes — and that is the defect. Here nothing changes, because pending-ness
    // never depended on fetching and the store has no method a poll could call.
    test('polling records NOTHING — the plane is byte-identical before and after (P-82.3)', async () => {
      const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
      const q = repo.createFromWelcome({ tenantName: 'Quiet Co', organisationName: 'Quiet', primaryAdministrator: 'Ivy' } as never);
      const slug = q.onboarding.slug;
      const ctx = tenantContext({ tenantId: q.onboarding.tenantId, tenantSlug: slug });
      const token = issueEpToken(slug, repo.epTokenVersion(slug), SECRET).token;
      await runRecords.onPackageAuthored(ctx, {
        runId: 'run-quiet-1', packageHash: EVIDENCE_PKG_HASH, contractVersion: '1.0.0',
        authoredAt: '2026-08-06T00:00:00.000Z',
      });

      // The bytes on disk, read through the provider — not through the store, which could hide a
      // write behind its own read. A delivery record would move exactly these.
      const bytes = async (): Promise<string> => JSON.stringify({
        runs: await workStorage.list(ctx, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN }),
        evidence: await workStorage.list(ctx, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN }),
        record: await workStorage.getText(ctx, {
          capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: 'run-quiet-1',
        }),
      });

      const beforeBytes = await bytes();
      await work(slug, token);
      await work(slug, token);
      const afterBytes = await bytes();

      // A `lastPolledAt` or `fetchCount` added "for diagnostics" fails HERE and nowhere else: it
      // would not change a single status code, response body, or any other assertion in this file.
      assert.equal(afterBytes, beforeBytes);
    });

    // ── AUTHORISATION IS INHERITED, AND THIS IS WHAT ASSERTS IT (P-80.2) ─────────────────
    test('authorisation is the tenant router\'s, not a hand-written block on this route', async () => {
      const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
      const other = repo.createFromWelcome({ tenantName: 'Other Co', organisationName: 'Other', primaryAdministrator: 'Jo' } as never);
      const otherSlug = other.onboarding.slug;

      // No credential → 401 with the RFC 6750 challenge, exactly as every other tenant route.
      const anon = await work(acmeSlug, undefined);
      assert.equal(anon.status, 401, anon.body);
      assert.match(anon.headers['www-authenticate'] ?? '', /Bearer realm/);

      // Acme's EP token naming ANOTHER tenant → refused by the shared ep-scope check.
      const crossTenant = await work(otherSlug, acmeEpToken);
      assert.equal(crossTenant.status, 403, crossTenant.body);

      // An invalid slug is refused by the SHARED normaliseTenantSlug, before any store read.
      const traversal = await raw('GET', '/api/tenants/..%2f..%2fetc/work', { token: acmeEpToken });
      assert.ok(traversal.status === 400 || traversal.status === 404, `expected refusal, got ${traversal.status}`);
    });

    test('a SUPERSEDED EP token is refused on /work — revocation is inherited too', async () => {
      const repo = new TenantConfigRepository(new FileTenantConfigStore(tenantsDir));
      const rot = repo.createFromWelcome({ tenantName: 'Rot Co', organisationName: 'Rot', primaryAdministrator: 'Kim' } as never);
      const slug = rot.onboarding.slug;
      const superseded = issueEpToken(slug, 1, SECRET).token;
      repo.recordEpToken(slug, { version: 2, issuedAt: '2026-08-06T00:00:00Z', expiresAt: '2026-09-06T00:00:00Z', last4: 'abcd' });

      const current = issueEpToken(slug, 2, SECRET).token;
      assert.equal((await work(slug, current)).status, 200);
      const res = await work(slug, superseded);
      assert.equal(res.status, 401, res.body);
      assert.match(res.body, /revoked/);
    });

    test('POST is not allowed — /work is a read, and the collection is not a submission surface', async () => {
      const res = await raw('POST', `/api/tenants/${acmeSlug}/work`, { token: acmeEpToken, body: '{}', headers: { 'content-type': 'application/json' } });
      assert.ok(res.status === 404 || res.status === 405, `expected refusal, got ${res.status}: ${res.body}`);
    });
  });

  test('GET is not allowed on the evidence surface', async () => {
    const res = await raw('GET', '/v1/evidence', { token: acmeEpToken });
    assert.ok(res.status === 404 || res.status === 405, `unexpected ${res.status}`);
  });
});
