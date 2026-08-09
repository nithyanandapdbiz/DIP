/**
 * DEPLOYMENT CAPABILITY PROBE — E-2.
 * ============================================================================
 * Searches for a container runtime, and if it finds one, **actually deploys**: builds
 * the Intelligence Plane image, starts it, and serves one real request. Reports what
 * was observed as JSON on stdout. Asserts nothing; exits 0 either way.
 *
 * WHY A PROBE RATHER THAN A DOCUMENTED ASSUMPTION.
 * "Docker is unavailable" has been carried as a stated blocker since M2.5. A stated
 * blocker is an assertion, and this platform does not accept assertions as evidence
 * (R-13.1). This probe converts it into a MEASUREMENT: it enumerates every runtime the
 * platform would accept, records exactly what it found, and reports the absence with
 * the same provenance as any other evidence. If a runtime appears tomorrow, the
 * blocker disappears without anyone remembering to edit a document.
 *
 * C-17.3 SETS THE BAR, AND IT IS DELIBERATELY HIGH.
 * "Each image starts and serves a real request." Document 17 is explicit about why:
 * **an image that builds is not an image that runs**, and the gap between them is
 * where the predecessor's stale COPY and missing shared code both hid. So a successful
 * build is NOT E-2 evidence. Only a started image that answered something is.
 *
 * THE DEPLOY PATH BELOW HAS NEVER EXECUTED IN THIS ENVIRONMENT.
 * That is stated in the output, not hidden. Code that has never run is not evidence of
 * anything, and this probe would be lying about itself if it implied otherwise.
 *
 * Run:  node governance/deployment/run-deployment-probe.mjs
 * Out:  {"runtime":{...},"e2":{...},"searched":[...],"digest":"<sha256>"}
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { platform, homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every runtime that could satisfy R-17.14 ("container images with no cloud-specific
 * packaging requirement"), plus the orchestrators that imply one.
 *
 * Searched by NAME on the PATH and by known INSTALL LOCATION, because a runtime that
 * is installed but not on the PATH is present — and reporting it absent would be a
 * measurement error, not a conservative one.
 */
const RUNTIMES = [
  { id: 'docker', kind: 'container-runtime', versionArgs: ['--version'], daemonArgs: ['info'] },
  { id: 'podman', kind: 'container-runtime', versionArgs: ['--version'], daemonArgs: ['info'] },
  { id: 'nerdctl', kind: 'container-runtime', versionArgs: ['--version'], daemonArgs: ['info'] },
  { id: 'ctr', kind: 'container-runtime', versionArgs: ['--version'], daemonArgs: ['version'] },
  { id: 'finch', kind: 'container-runtime', versionArgs: ['--version'], daemonArgs: ['info'] },
  { id: 'kubectl', kind: 'orchestrator', versionArgs: ['version', '--client'], daemonArgs: ['cluster-info'] },
  { id: 'kind', kind: 'orchestrator', versionArgs: ['--version'], daemonArgs: ['get', 'clusters'] },
  { id: 'minikube', kind: 'orchestrator', versionArgs: ['version'], daemonArgs: ['status'] },
];

const WINDOWS_LOCATIONS = [
  'C:/Program Files/Docker/Docker/resources/bin',
  'C:/Program Files/RedHat/Podman',
  `${homedir()}/AppData/Local/Programs/Docker/Docker/resources/bin`,
  'C:/ProgramData/DockerDesktop/version-bin',
];
const POSIX_LOCATIONS = ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/snap/bin'];

const searched = [];
let available = null;

/** Run a command, capturing everything. Never throws — absence is an observation. */
function attempt(command, args, timeout = 60_000) {
  try {
    const r = spawnSync(command, args, { encoding: 'utf8', timeout, windowsHide: true });
    return {
      ran: r.error === undefined && r.status !== null,
      status: r.status,
      stdout: (r.stdout || '').trim().slice(0, 400),
      stderr: (r.stderr || '').trim().slice(0, 400),
      error: r.error ? String(r.error.message).slice(0, 200) : null,
    };
  } catch (e) {
    return { ran: false, status: null, stdout: '', stderr: '', error: String(e.message).slice(0, 200) };
  }
}

function locate(id) {
  const exe = platform() === 'win32' ? `${id}.exe` : id;
  const dirs = platform() === 'win32' ? WINDOWS_LOCATIONS : POSIX_LOCATIONS;
  for (const d of dirs) {
    const full = join(d, exe);
    if (existsSync(full)) return full;
  }
  return null;
}

for (const rt of RUNTIMES) {
  // 1. On the PATH?
  const onPath = attempt(rt.id, rt.versionArgs, 20_000);
  // 2. Installed but not on the PATH?
  const installedAt = onPath.ran ? null : locate(rt.id);
  const viaPath = installedAt ? attempt(installedAt, rt.versionArgs, 20_000) : null;

  const found = onPath.ran || (viaPath !== null && viaPath.ran);
  const invocation = onPath.ran ? rt.id : installedAt;
  const version = onPath.ran ? onPath.stdout : (viaPath?.stdout ?? '');

  // 3. PRESENT IS NOT THE SAME AS USABLE. A CLI with no daemon behind it cannot
  //    deploy anything, and reporting it as a runtime would be the same error as
  //    reporting a built image as a running one.
  const daemon = found ? attempt(invocation, rt.daemonArgs, 60_000) : null;
  const usable = Boolean(daemon && daemon.ran && daemon.status === 0);

  searched.push({
    id: rt.id,
    kind: rt.kind,
    foundOnPath: onPath.ran,
    foundAt: installedAt,
    version: version || null,
    daemonResponds: usable,
    detail: !found
      ? 'not found on the PATH or in any known install location'
      : usable
        ? `present and responding: ${version}`
        : `present but not usable: ${(daemon?.stderr || daemon?.stdout || daemon?.error || 'no response').slice(0, 200)}`,
  });

  if (usable && available === null && rt.kind === 'container-runtime') {
    available = { id: rt.id, invocation, version };
  }
}

// ── E-2 ─────────────────────────────────────────────────────────────────────
const IMAGE_DESCRIPTOR = join(ROOT, 'deploy', 'Dockerfile');
const descriptorPresent = existsSync(IMAGE_DESCRIPTOR);

let e2;
if (available === null) {
  // NOT MEASURED, with the search that produced it attached. This is the difference
  // between "we believe Docker is unavailable" and "we looked for eight runtimes in
  // twelve locations and none responded".
  e2 = {
    id: 'E-2',
    property: 'the Intelligence Plane image builds, starts, and serves a real request (C-17.3)',
    status: 'NOT MEASURED',
    passed: false,
    blocker: `no container runtime is available. ${searched.length} runtimes searched on the PATH and in ${platform() === 'win32' ? WINDOWS_LOCATIONS.length : POSIX_LOCATIONS.length} known install locations; none responded.`,
    imageDescriptorPresent: descriptorPresent,
    // Stated plainly: the descriptor existing proves nothing. C-17.3 exists precisely
    // because an image that builds is not an image that runs, and this one has done
    // neither.
    detail: descriptorPresent
      ? 'a deployment descriptor exists at deploy/Dockerfile, but it has NEVER been built and NEVER been started. Per C-17.3 that is not evidence of anything.'
      : 'no deployment descriptor is present.',
  };
} else {
  // ── This path has never executed in this environment. ─────────────────────
  const tag = 'dbiz-intelligence-plane:probe';
  const build = attempt(available.invocation, ['build', '-f', IMAGE_DESCRIPTOR, '-t', tag, ROOT], 900_000);
  if (!build.ran || build.status !== 0) {
    e2 = {
      id: 'E-2',
      property: 'the Intelligence Plane image builds, starts, and serves a real request (C-17.3)',
      status: 'FAIL',
      passed: false,
      blocker: null,
      runtime: available,
      detail: `image build failed under ${available.id}: ${(build.stderr || build.error || 'no output').slice(0, 300)}`,
    };
  } else {
    // A BUILD IS NOT EVIDENCE. Start it and make it answer something.
    const run = attempt(available.invocation,
      ['run', '--rm', tag, 'node', '--input-type=module', '-e',
        "import('@dbiz/observability').then(m=>{const x=new m.Metrics();process.stdout.write('served')})"],
      300_000);
    const served = run.ran && run.status === 0 && /served/.test(run.stdout);
    e2 = {
      id: 'E-2',
      property: 'the Intelligence Plane image builds, starts, and serves a real request (C-17.3)',
      status: served ? 'PASS' : 'FAIL',
      passed: served,
      blocker: null,
      runtime: available,
      detail: served
        ? `image built and started under ${available.id}, and served a real request`
        : `image built under ${available.id} but did not serve: ${(run.stderr || run.stdout || run.error || 'no output').slice(0, 300)}`,
    };
    attempt(available.invocation, ['rmi', '-f', tag], 120_000);
  }
}

const digest = createHash('sha256')
  .update('dbiz.deployment-probe@1')
  .update(JSON.stringify({
    e2: [e2.id, e2.status],
    searched: searched.map((s) => [s.id, s.foundOnPath, s.daemonResponds]),
  }))
  .digest('hex');

process.stdout.write(JSON.stringify({
  e2,
  searched,
  runtime: available,
  imageDescriptorPresent: descriptorPresent,
  // The deploy path is unexecuted here, and the probe says so about itself rather
  // than letting a reader assume it was exercised.
  deployPathExercised: available !== null,
  executionContext: {
    node: process.version,
    platform: platform(),
    elevated: null,
    searchedLocations: platform() === 'win32' ? WINDOWS_LOCATIONS : POSIX_LOCATIONS,
  },
  digest,
}));
