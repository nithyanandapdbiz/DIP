/**
 * Emits the observability guide, the platform intelligence guide and the dashboard
 * specification — all from the live registries rather than from prose.
 *
 * Separated from the evidence harness so the harness decides, from an executed run,
 * WHETHER to publish. A guide written from a failed run is indistinguishable from one
 * written from a good one.
 *
 * Run:  node governance/production/emit-observability-docs.mjs <targetDir>
 * Out:  {"written":["..."]}
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = process.argv[2];
if (!target) {
  process.stdout.write(JSON.stringify({ written: [], error: 'no target directory' }));
  process.exit(1);
}
mkdirSync(target, { recursive: true });

const obs = await import(pathToFileURL(join(ROOT, 'packages', 'observability', 'dist', 'src', 'index.js')).href);

const written = [];
const write = (name, content) => { writeFileSync(join(target, name), content, 'utf8'); written.push(name); };

// ── Dashboard specification, generated from the metric registry ─────────────
write('OPERATIONAL-DASHBOARD-SPECIFICATION.md', obs.renderDashboardSpec(obs.buildDashboards()));

// ── Observability guide ─────────────────────────────────────────────────────
const metricRows = obs.PLATFORM_METRICS
  .map((m) => `| \`${m.name}\` | ${m.kind} | ${m.unit} | ${m.tenantScoped ? 'per tenant' : 'platform'} | ${m.description} |`);

write('OBSERVABILITY-GUIDE.md', [
  '# Observability guide',
  '',
  '**Generated from the live metric registry.** A metric appears here because the',
  'platform declares it, not because someone documented it.',
  '',
  '## The three questions, and why they are not one question',
  '',
  '| Probe | Asks | Asked by | Consults dependencies |',
  '|---|---|---|---|',
  '| Liveness | Should this process be killed and restarted? | The orchestrator | **No, deliberately** |',
  '| Readiness | Should traffic be sent here? | The load balancer | Yes, those required to serve |',
  '| Health | Is the platform doing its job for its tenants? | An operator | Yes, and it requires evidence of activity |',
  '',
  'Conflating them causes specific, opposite failures. A liveness probe that checks',
  'dependencies restarts a healthy process because a database blinked, turning a blip',
  'into a restart storm. A health check that only checks liveness answers *"the process',
  'is running"* to the question *"is it working?"* — which is how outages go undetected',
  '(R-23.30, F-23.2).',
  '',
  '## Silence is not health',
  '',
  'A health check with no activity reports **`unknown`**, never `healthy`. A platform',
  'with no errors because it is serving no requests is not healthy — it is silent, and',
  'silence is indistinguishable from working from the outside. This is C-24.7, and it is',
  'the property most easily lost: every convenience — a default of zero, an average that',
  'skips nulls, a value carried forward from the last window — quietly converts',
  '"unmeasured" into "fine".',
  '',
  'The same rule reaches the dashboards: **every panel declares what its emptiness',
  'means**, because the data layer getting this right is wasted if the presentation',
  'layer then guesses.',
  '',
  '## Correlation and tracing',
  '',
  'Every operation carries a correlation id, and every record of that operation carries',
  'it too. Spans nest, and a span that is never ended reports **`unfinished`** rather',
  'than disappearing — a hung operation and one that never started need opposite',
  'responses, so they must not render identically.',
  '',
  '## Telemetry carries no customer content',
  '',
  'C-23.11 forbids customer data in operational telemetry. This is enforced at the call',
  'site: fields named `body`, `payload`, `response`, `content` and similar are refused,',
  'as are values shaped like keys, tokens, or email addresses, and any value long enough',
  'to be content rather than an identifier.',
  '',
  '**Refused, not redacted.** Redaction is a guess about which fields matter and it',
  'fails silently when the guess is wrong. Refusing surfaces the mistake while someone',
  'is still looking at it.',
  '',
  '## Metrics',
  '',
  '| Metric | Kind | Unit | Scope | Meaning |',
  '|---|---|---|---|---|',
  ...metricRows,
  '',
  '**An unrecorded metric reads `null`, never `0`.** "No requests were served" and "no',
  'telemetry arrived" are different facts, and a zero collapses them into the more',
  'comforting one — after which every SLI, score and dashboard inherits the error.',
  '',
  '**Percentiles are observed values.** A p99 produced by interpolating between two',
  'measurements is a number nothing measured (C-24.1).',
  '',
  '## Service level objectives',
  '',
  '| SLO | Protects | Target | Window | Consequence on breach |',
  '|---|---|---|---|---|',
  ...obs.PLATFORM_SLOS.map((s) =>
    `| \`${s.id}\` | ${s.protects} | ${(s.target * 100).toFixed(2)}% | ${s.windowDays}d | ${s.consequence} |`),
  '',
  '**An SLO without a consequence is a statistic, not an objective** (R-23.10), and one',
  'cannot be published without it — the registry refuses it.',
  '',
  '**An exhausted error budget cannot be reset by retargeting** (R-23.17). Consumption',
  'is recorded against the objective, not against its current target, so moving the',
  'target carries the consumption forward and records the change. Adjusting the',
  'instrument to flatter the result is the most natural thing to do when a budget is',
  'spent and a release is waiting, which is exactly why it is prevented mechanically.',
  '',
  '**An SLI with no telemetry reports `NOT MEASURED`** — never interpolated, never',
  'carried forward from a previous window (R-23.13).',
  '',
  '---', '', '*Generated from the live registries. Not hand-maintained.*', '',
].join('\n'));

// ── Platform intelligence guide ─────────────────────────────────────────────
write('PLATFORM-INTELLIGENCE-GUIDE.md', [
  '# Platform intelligence guide',
  '',
  '## This service observes. It never acts.',
  '',
  'C-24.9 is absolute: no remediation, no writes, no control operations. Every output is',
  'a description of what is true and what a human might do about it.',
  '',
  'The temptation to close the loop — restart the thing, rotate the certificate, drain',
  'the queue — is what turns a read-only intelligence surface into an unaudited control',
  'plane. **A source scan in the test suite enforces this**, because the pressure to act',
  'arrives during an incident, which is precisely when a comment stops working.',
  '',
  '## Failure classification',
  '',
  `${obs.CLASSIFIER_CATEGORIES.length} categories are recognised:`,
  '',
  ...obs.CLASSIFIER_CATEGORIES.map((c) => `- \`${c}\``),
  '',
  '**An unrecognised signal returns `unclassified` rather than the nearest match.** A',
  'confident wrong answer sends an operator down a path that cannot work, which costs',
  'more than an honest "I do not recognise this". An `unclassified` signal that recurs',
  'is a gap in the classifier, and that is itself worth fixing.',
  '',
  '## Every finding names its evidence',
  '',
  'A finding carries what was observed, the likely cause **where that can be established',
  'from evidence rather than guessed**, a recommendation, and the sources it was derived',
  'from. A finding without traceable evidence is an opinion (C-24.2).',
  '',
  '## Scores publish coverage and freshness',
  '',
  'Every index publishes **score, coverage and freshness together** (C-24.5), and the',
  'score is `null` when coverage is zero. Publishing `100%` over zero inputs is the most',
  'dangerous number this service could produce, because it is most reassuring exactly',
  'when it is least true.',
  '',
  'Unmeasured indicators are excluded from the score and shown in coverage — not counted',
  'as passes, which would inflate it, nor as failures, which would make the index',
  'permanently red and therefore ignored.',
  '',
  '## A silent source is a finding',
  '',
  'A source that reported nothing produces a **major finding**, not an absence. Without',
  'this, a monitoring system reports its best numbers during a total outage of whatever',
  'reports to it — because nothing arrived to contradict them.',
  '',
  '## Ingestion failure is per source',
  '',
  'C-24.13: one unavailable source is partial ingestion, not a global outage. Reporting',
  'it globally would discard the sources that did report.',
  '',
  '## The service reports on itself',
  '',
  'C-24.14: its own conformance appears in its own output. An intelligence service that',
  'reported on everything except itself would hold an exemption precisely where scrutiny',
  'matters most.',
  '',
  '---', '', '*Generated from the live registries. Not hand-maintained.*', '',
].join('\n'));

process.stdout.write(JSON.stringify({ written }));
