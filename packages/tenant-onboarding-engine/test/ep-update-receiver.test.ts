/**
 * THE UPDATE RECEIVER — what the generated Execution Plane acknowledges, and what it must not.
 *
 * TRACEABILITY: ADR-0035 (the update channel) · ADR-0007 §4/§6 + INV-3 (an unverifiable update is
 *   refused) · ADR-0080 §6 (the work path and its rotation carrier) · P-78.4 (one record of a fact)
 *   Proves: the acknowledgement is derived from whether the event was APPLIED, and from nothing else.
 *   Categories: contract, security, regression
 *
 * ══ WHY THIS TEST RUNS THE AGENT INSTEAD OF MATCHING ITS SOURCE ════════════════════════════════
 *
 * The property under test is a RELATIONSHIP between two things — what the receiver did, and what it
 * then told the Intelligence Plane. A regex over the generated text can see the refusal and can see
 * the ack; it cannot see that the second contradicts the first. So the generated agent is written to
 * disk and executed against a fake Intelligence Plane, and the assertions are over the acks that
 * plane actually received.
 *
 * ══ WHY THE ACK IS THE SAFETY PROPERTY AND NOT A COURTESY ══════════════════════════════════════
 *
 * The queue's `status` is ALREADY the record of whether an event was applied: the IP reads it and
 * the agent's own filter depends on it. The ack is a SECOND record of that same fact, written by the
 * party that never checked — and when the two disagree the second wins BY CONSTRUCTION, because
 * acking is what moves the first. An acked refusal therefore does not merely mislead a log line: it
 * erases the refusal from the only channel able to report it.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  TenantConfigRepository, InMemoryTenantConfigStore, generateTenantSolution, writeSolutionFiles,
  workPathFor, WORK_POLL_INTERVAL_SECONDS,
  type RepositoryOptions, type WelcomeInput, type TenantEnvelope,
} from '../src/engine/index.js';

let tick = 0;
const opts: RepositoryOptions = {
  now: () => `2026-08-06T00:00:${String(tick++ % 60).padStart(2, '0')}.000Z`,
  newTenantId: () => 'tnt-update-receiver',
};

const welcome: WelcomeInput = {
  organisationName: 'Carlisle Homes', tenantName: 'receiver',
  primaryAdministrator: 'Ada', preferredCloud: 'dev', deploymentModel: 'container',
  applicationTypes: ['web'], mfaRequired: false,
};

function tenant(): TenantEnvelope {
  return new TenantConfigRepository(new InMemoryTenantConfigStore(), opts).createFromWelcome(welcome);
}

function packageOf(env: TenantEnvelope): Record<string, string> {
  const manifest = generateTenantSolution(env, {
    registrationEndpoint: 'https://gateway.dbiz.example/v1/register',
    issueCredential: (t) => `otc-${t}`,
  });
  return Object.fromEntries(manifest.files.map((f) => [f.path, f.content]));
}

const temps: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dbiz-receiver-'));
  temps.push(dir);
  return dir;
}
after(() => { for (const d of temps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* leave it */ } } });

/** A fake Intelligence Plane: serves one batch of pending events and records every ack it receives. */
interface FakeIp { readonly url: string; readonly acked: string[]; close(): Promise<void> }

async function fakeIp(slug: string, events: readonly unknown[]): Promise<FakeIp> {
  const acked: string[] = [];
  const server: Server = createServer((req, res) => {
    if (!req.url?.startsWith(`/api/tenants/${slug}/updates`)) { res.writeHead(404).end(); return; }
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(events));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { acked.push(String(JSON.parse(body).id)); } catch { acked.push('<unparseable>'); }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    acked,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Materialise the generated agent + its connectivity into a scratch EP, run ONE poll against a fake
 * IP, and return what that IP was told.
 *
 * The LAST event is always an applicable sentinel: its ack is how this harness knows the loop
 * finished, without which "nothing was acked yet" and "nothing will be acked" are the same
 * observation — the very conflation this file is about.
 */
async function runOnePoll(
  // A function of the slug, because a work-path event must name THIS tenancy's route and the slug
  // is not known until the tenant is created.
  build: readonly unknown[] | ((slug: string) => readonly unknown[]),
): Promise<{ acked: string[]; root: string; slug: string; stderr: string }> {
  const env = tenant();
  const slug = env.onboarding.slug;
  const events = typeof build === 'function' ? build(slug) : build;
  const files = packageOf(env);
  const root = join(scratch(), 'ep');
  for (const rel of ['bin/ep-update-agent.mjs', 'config/connectivity.json']) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, files[rel]!, 'utf8');
  }

  const sentinel = { id: 'sentinel', type: 'capability-updated', capability: 'cap-sentinel', status: 'pending', config: { enabled: true } };
  const ip = await fakeIp(slug, [...events, sentinel]);
  const child = spawn(process.execPath, [join(root, 'bin/ep-update-agent.mjs')], {
    env: { ...process.env, INTELLIGENCE_API_URL: ip.url, DBIZ_EP_TOKEN: 'test-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  child.stdout.resume();

  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`the poll never completed — acked ${JSON.stringify(ip.acked)}; stderr: ${stderr}`)), 20_000);
      const poll = setInterval(() => {
        if (!ip.acked.includes('sentinel')) return;
        clearInterval(poll); clearTimeout(deadline); resolve();
      }, 25);
      child.once('exit', (code) => { clearInterval(poll); clearTimeout(deadline); reject(new Error(`agent exited early (${code}): ${stderr}`)); });
    });
  } finally {
    child.kill();
    await ip.close();
  }
  return { acked: ip.acked, root, slug, stderr };
}

describe('the generated update receiver acks what it applied, and only that', () => {
  test('a DELIBERATE REFUSAL is not acked and is not reported as applied', async () => {
    const { acked, stderr } = await runOnePoll([
      // No signature and no contentHash: refused at the head of applySolutionUpdate (INV-3/ADR-0007).
      { id: 'unsigned', type: 'solution-update', status: 'pending', config: { version: '9.9.9', packageRef: 'pkg://x' } },
    ]);

    assert.ok(!acked.includes('unsigned'), `the refusal was acked — the IP was told the unverifiable update was applied (acks: ${JSON.stringify(acked)})`);
    assert.match(stderr, /REFUSED \(left pending\)/, 'the refusal must say so on stderr');
    assert.doesNotMatch(stderr, /^applied unsigned/m);
  });

  test('an UNRECOGNISED TYPE is not acked — it exits at the catch-all having changed nothing', async () => {
    // The shape of an event from a NEWER Intelligence Plane than this generated EP was built from.
    const { acked } = await runOnePoll([
      { id: 'future', type: 'a-type-this-build-has-never-heard-of', status: 'pending', config: { anything: true } },
    ]);
    assert.ok(!acked.includes('future'), 'an event no branch handled was consumed anyway');
  });

  test('a signed solution-update IS applied and IS acked — the refusal is discriminating, not blanket', async () => {
    const { acked, root } = await runOnePoll([
      { id: 'signed', type: 'solution-update', status: 'pending', config: { version: '2.0.0', contentHash: 'a'.repeat(64), signature: { keyId: 'kid-1' }, packageRef: 'pkg://y', mandatory: true } },
    ]);
    assert.ok(acked.includes('signed'));
    const marker = JSON.parse(readFileSync(join(root, '.update-available.json'), 'utf8'));
    assert.equal(marker.version, '2.0.0');
    assert.equal(marker.signatureKeyId, 'kid-1');
  });

  test('a capability event still applies and acks — the ack is narrowed, not withdrawn', async () => {
    const { acked, root } = await runOnePoll([
      { id: 'cap', type: 'capability-updated', capability: 'test-automation', status: 'pending', config: { enabled: true } },
    ]);
    assert.deepEqual(acked, ['cap', 'sentinel']);
    const caps = JSON.parse(readFileSync(join(root, 'config/capabilities.json'), 'utf8'));
    assert.deepEqual(caps.capabilities['test-automation'], { enabled: true });
  });

  test('an unapplied event does not block the events behind it', async () => {
    const { acked } = await runOnePoll([
      { id: 'unsigned', type: 'solution-update', status: 'pending', config: {} },
      { id: 'future', type: 'unknown-type', status: 'pending', config: {} },
      { id: 'cap', type: 'capability-updated', capability: 'c', status: 'pending', config: { enabled: true } },
    ]);
    assert.deepEqual(acked, ['cap', 'sentinel'], 'the refusals must be skipped, not fatal');
  });
});

describe('work-path-changed reaches the runtime (ADR-0080 §6)', () => {
  test('the event WRITES the path and its cadence into connectivity, and is acked', async () => {
    const { acked, root, slug } = await runOnePoll((s) => [
      { id: 'wp', type: 'work-path-changed', status: 'pending', config: { workPath: workPathFor(s), pollingIntervalSeconds: 45 } },
    ]);
    assert.ok(acked.includes('wp'));
    const conn = JSON.parse(readFileSync(join(root, 'config/connectivity.json'), 'utf8'));
    assert.equal(conn.intelligencePlane.workPath, workPathFor(slug));
    assert.equal(conn.polling.workIntervalSeconds, 45);
  });

  test('an event carrying no usable path is REFUSED rather than writing a route that 404s', async () => {
    const { acked, root } = await runOnePoll([
      { id: 'empty', type: 'work-path-changed', status: 'pending', config: { pollingIntervalSeconds: 30 } },
      { id: 'relative', type: 'work-path-changed', status: 'pending', config: { workPath: 'api/tenants/x/work' } },
    ]);
    assert.deepEqual(acked, ['sentinel']);
    const conn = JSON.parse(readFileSync(join(root, 'config/connectivity.json'), 'utf8'));
    // The GENERATED value is still there and untouched — a refusal must not corrupt what it declined to change.
    assert.equal(conn.polling.workIntervalSeconds, WORK_POLL_INTERVAL_SECONDS);
  });
});

describe('the written work path SURVIVES regeneration — emitted, not merely reserved', () => {
  test('the generator emits workPath, so connectivity carries it before any event arrives', () => {
    const env = tenant();
    const conn = JSON.parse(packageOf(env)['config/connectivity.json']!);
    assert.equal(conn.intelligencePlane.workPath, workPathFor(env.onboarding.slug));
    assert.equal(conn.polling.workIntervalSeconds, WORK_POLL_INTERVAL_SECONDS);
  });

  test('regeneration RESTORES the path rather than erasing it', () => {
    // config/connectivity.json is generator-owned and rewritten on every regeneration. The receiver
    // writes `workPath` into it, so without a generator entry the next routine regeneration would
    // drop the key and the EP would silently stop polling for work it had been told about — which
    // looks exactly like an idle tenancy and reddens nothing.
    const env = tenant();
    const slug = env.onboarding.slug;
    const out = scratch();
    const files = generateTenantSolution(env, {
      registrationEndpoint: 'https://gateway.dbiz.example/v1/register',
      issueCredential: (t) => `otc-${t}`,
    }).files;
    const root = writeSolutionFiles(out, slug, files);

    const connPath = join(root, 'config/connectivity.json');
    const corrupted = JSON.parse(readFileSync(connPath, 'utf8'));
    delete corrupted.intelligencePlane.workPath;
    writeFileSync(connPath, `${JSON.stringify(corrupted, null, 2)}\n`, 'utf8');
    assert.ok(existsSync(connPath));

    writeSolutionFiles(out, slug, files);
    const after = JSON.parse(readFileSync(connPath, 'utf8'));
    assert.equal(after.intelligencePlane.workPath, workPathFor(slug), 'a regeneration must restore the route');
  });

  test('all three carriers state ONE path — the grant, the rotation event and the package', () => {
    const store = new InMemoryTenantConfigStore();
    const repo = new TenantConfigRepository(store, opts);
    const env = repo.createFromWelcome(welcome);
    const slug = env.onboarding.slug;

    const rotated = repo.recordWorkPath(slug, workPathFor(slug), WORK_POLL_INTERVAL_SECONDS);
    const event = [...(rotated.onboarding.updates ?? [])].reverse().find((u) => u.type === 'work-path-changed');
    const conn = JSON.parse(packageOf(env)['config/connectivity.json']!);

    assert.equal(event!.config!['workPath'], workPathFor(slug));
    assert.equal(conn.intelligencePlane.workPath, workPathFor(slug));
  });
});
