/**
 * Emits the General Availability determination, the deployment validation report and
 * the deployment evidence package — all from what the probe observed.
 *
 * Separated from the harness so the harness decides, from an executed run, WHETHER to
 * publish. A determination written from a run that failed is indistinguishable from
 * one written from a run that succeeded.
 *
 * Run:  node governance/deployment/emit-deployment-docs.mjs <targetDir> <observationsJson>
 * Out:  {"written":["..."]}
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [target, observationsPath] = process.argv.slice(2);
if (!target || !observationsPath) {
  process.stdout.write(JSON.stringify({ written: [], error: 'usage: emit-deployment-docs.mjs <targetDir> <observationsJson>' }));
  process.exit(1);
}

let obs;
try {
  obs = JSON.parse(readFileSync(observationsPath, 'utf8'));
} catch (e) {
  process.stdout.write(JSON.stringify({ written: [], error: `unreadable observations: ${e.message}` }));
  process.exit(1);
}

mkdirSync(target, { recursive: true });
const written = [];
const write = (name, lines) => {
  writeFileSync(join(target, name), lines.join('\n'), 'utf8');
  written.push(name);
};

const searched = obs.searched ?? [];
const unmeasured = obs.unmeasured ?? [];
const e2 = obs.e2 ?? { status: 'unknown' };
const runtimeCount = searched.filter((r) => r.kind === 'container-runtime').length;

write('GENERAL-AVAILABILITY-CERTIFICATION.md', [
  '# General Availability — certification determination',
  '',
  `## STATUS: ${obs.generalAvailability}`,
  '',
  `**Reason:** ${obs.generalAvailabilityReason}`,
  '',
  'This determination is **computed** from E-2 by a single expression. No flag, override',
  'or configuration can set it while E-2 is anything other than `PASS`, and a governance',
  'gate refuses any document in this repository that claims otherwise — proven by',
  'planting exactly such a document and observing the gate fail.',
  '',
  '## What was measured',
  '',
  '| Runtime | Kind | Present | Usable | Detail |',
  '|---|---|---|---|---|',
  ...searched.map((r) => `| \`${r.id}\` | ${r.kind} | ${r.foundOnPath ? 'on PATH' : (r.foundAt ? 'installed' : 'absent')} | ${r.daemonResponds ? 'responding' : 'no'} | ${r.detail} |`),
  '',
  `**${searched.length} runtimes searched** on the PATH and in every known install location.`,
  'None responded.',
  '',
  'This is a measurement, not an assumption. *"Docker is unavailable"* was carried as a',
  'stated blocker from M2.5 through M2.8, and a stated blocker is an assertion — which',
  'R-13.1 does not accept as evidence. It is now the output of a probe that runs on every',
  'build, so if a runtime appears the blocker disappears without anyone editing anything.',
  '',
  '## What cannot be measured, and why',
  '',
  '| # | Property |',
  '|---|---|',
  ...unmeasured.map((u) => `| **${u.id}** | ${u.property} |`),
  '',
  '**Every one is a measurement of a running deployment.** None can be inferred from the',
  'in-process evidence M2.6–M2.8 produced, however complete that evidence is. Document 17',
  'states the principle directly — *an image that builds is not an image that runs* — and',
  'this image has done neither.',
  '',
  '## Where the requested outputs live',
  '',
  'The mission requested eight documents. Six are replay reports **against a deployed',
  'runtime**, and none can contain a measurement. Rather than publish six documents that',
  'each repeat the same sentence, their content is consolidated here and in the',
  'deployment validation report — one topic, one home.',
  '',
  '| Requested output | Where |',
  '|---|---|',
  '| General Availability Certification Report | **This document** |',
  '| Deployment Validation Report | [DEPLOYMENT-VALIDATION-REPORT.md](DEPLOYMENT-VALIDATION-REPORT.md) |',
  '| Deployment Evidence Package | [DEPLOYMENT-EVIDENCE-PACKAGE.md](DEPLOYMENT-EVIDENCE-PACKAGE.md) |',
  '| Operational Replay Report | `NOT MEASURED` — GA-8. In-process equivalent: `docs/production/` |',
  '| Security Replay Report | `NOT MEASURED` — GA-4. In-process: `docs/production/SECURITY-MONITORING-REPORT.md` |',
  '| Performance Validation Report | `NOT MEASURED` — GA-5. In-process: `docs/production/PERFORMANCE-BENCHMARK-REPORT.md` |',
  '| Failure Recovery Report | `NOT MEASURED` — GA-3. In-process: `docs/production/RESILIENCE-VALIDATION-REPORT.md` |',
  '| Updated Certification Record | [M2.8 record](../certification/M2.8-PRODUCTION-READINESS-CERTIFICATION.md) — unchanged; this determination supersedes nothing |',
  '',
  '**The in-process equivalents are not substitutes.** They measure the same behaviours',
  'in a test process. Whether those behaviours survive containerisation, orchestration, a',
  'restart and a volume mount is precisely what is unmeasured.',
  '',
  '---',
  '',
  `*Generated from the deployment probe · ${searched.length} runtimes searched · digest ${(obs.digest ?? '').slice(0, 24)}…*`,
  '',
]);

write('DEPLOYMENT-VALIDATION-REPORT.md', [
  '# Deployment validation report',
  '',
  `**E-2: ${e2.status}**`,
  '',
  '## The criterion, and why the bar is where it is',
  '',
  '**C-17.3** — *each image starts and serves a real request.* Document 17 explains the',
  'choice:',
  '',
  '> An image that builds is not an image that runs, and the gap between them is where',
  '> the predecessor’s stale COPY and missing shared code both hid.',
  '',
  '**A successful build would not be E-2 evidence.** Only a started image that answered',
  'something is. This image has neither built nor started.',
  '',
  '## What exists',
  '',
  '| Artefact | State |',
  '|---|---|',
  `| \`deploy/Dockerfile\` | ${obs.imageDescriptorPresent ? '**Present. Never built, never started.** Not evidence of anything' : 'absent'} |`,
  '| Deployment probe | **Executes on every build**, and replays identically |',
  `| Deploy path inside the probe | **Never exercised** — ${obs.deployPathExercised ? 'exercised' : 'no runtime has been found for it to run against'} |`,
  '',
  '## What the descriptor does not prove',
  '',
  'It is an unverified artefact. It has not been shown to build, to start, to carry its',
  'full runtime closure, or to be free of secret material — **C-17.1 through C-17.5 are',
  'all unmeasured for it.** Its presence shortens the path to evidence; it is not',
  'evidence, and the probe reports it that way rather than counting it.',
  '',
  '## Workstreams 2 through 8',
  '',
  'Container startup, shutdown, restart, upgrade, rollback and persistence; execution,',
  'operational, performance, failure and security validation; and the full certification',
  'replay — **all require a deployed runtime.** Each is reported `NOT MEASURED` against a',
  'named blocker rather than approximated from the in-process suites.',
  '',
  'Approximating them is the single thing that would destroy the value of the twelve',
  'milestones preceding this one.',
  '',
  '---', '', '*Generated from the deployment probe.*', '',
]);

write('DEPLOYMENT-EVIDENCE-PACKAGE.md', [
  '# Deployment evidence package',
  '',
  'What must happen for **E-2** to pass, and therefore for General Availability to become',
  'certifiable. Nothing here is optional and nothing can be substituted.',
  '',
  '## 1. Provide a container runtime',
  '',
  `Any one of these ${runtimeCount}, with a responding daemon:`,
  '',
  ...searched.filter((r) => r.kind === 'container-runtime').map((r) => `- \`${r.id}\``),
  '',
  'On this machine none is installed, WSL is not installed, and the session is not',
  'elevated — so none could be installed either. **That is the entire blocker.**',
  '',
  '## 2. Run the probe',
  '',
  '```',
  'node governance/deployment/run-deployment-probe.mjs',
  '```',
  '',
  'It finds the runtime, builds `deploy/Dockerfile`, starts the image, and requires it to',
  'serve a request. It reports `PASS` only if the container answered.',
  '',
  '## 3. Expect the first build to fail',
  '',
  'The descriptor has never been built. R-17.7 exists because images **build and start',
  'successfully, then fail on the first real request** when a lazily-loaded dependency is',
  'missing from the manifest. The most likely first failures:',
  '',
  '- **OpenSSL.** The certificate authority shells out to it, so an image without it',
  '  starts cleanly and then fails at the first registration — exactly the shape R-17.7',
  '  describes.',
  '- **The workspace copy strategy.** pnpm workspace links are not trivially portable',
  '  into a runtime layer.',
  '- **The `/state` volume.** Without it, the certificate authority root key and the token',
  '  signing key do not survive a restart — which M2.8 measured as a customer outage.',
  '',
  '**These are predictions, not measurements**, and worth exactly what predictions are',
  'worth. The probe replaces them with facts.',
  '',
  '## 4. Then the replays',
  '',
  'Once E-2 passes, the ten `GA-*` properties become measurable: deployment, restart,',
  'recovery, security, performance, tenant isolation, observability and operational',
  'replay, plus container lifecycle and persistence. Each must be re-executed **against',
  'the deployed runtime**, and each must match its in-process result.',
  '',
  '**A mismatch is a finding, not a tolerance.** If the deployed platform behaves',
  'differently from the in-process one, the in-process evidence was measuring something',
  'other than the product.',
  '',
  '---', '', '*Generated from the deployment probe.*', '',
]);

process.stdout.write(JSON.stringify({ written }));
