/**
 * Operational Excellence and Platform Intelligence.
 * TRACEABILITY: 23-operational-excellence-model.md · 24-platform-intelligence-model.md
 *   Criteria: C-23.1, C-23.2, C-23.4, C-23.6, C-23.7, C-23.10, C-23.11
 *             C-24.1, C-24.2, C-24.3, C-24.4, C-24.5, C-24.7, C-24.9, C-24.10,
 *             C-24.13, C-24.14, C-25.4
 * Categories: observability, slo, intelligence, negative, security
 *
 * THE TESTS THAT MATTER MOST ARE THE ONES ABOUT ABSENCE.
 * A monitoring system's worst failure is reporting health because nothing reported.
 * C-24.7 and C-23.4 exist for that, and they are the hardest properties to keep: every
 * convenience — a default of zero, an average that skips nulls, a carried-forward
 * value — quietly converts "unmeasured" into "fine".
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Telemetry, Metrics, TelemetryContentError, fixedClock,
  HealthMonitor, SloRegistry, SloError, PLATFORM_SLOS,
  classify, detectSilentSources, scoreHealth, analyse, selfConformance,
  buildDashboards, validateDashboards, unusedMetrics, DashboardError, PLATFORM_METRICS,
  buildManifest, verifyIntegrity, verifyManifestHash,
  checkContractCompatibility, checkUpgradePath, checkDependencyPinning, admitEvidence,
  type IngestedSource, type SliReading,
} from '../src/index.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function freshMetrics(): Metrics {
  const m = new Metrics();
  for (const d of PLATFORM_METRICS) m.declare(d);
  return m;
}

describe('telemetry refuses customer content (C-23.11)', () => {
  test('a payload-carrying field name is refused', () => {
    const t = new Telemetry(fixedClock());
    const corr = t.newCorrelationId();
    // R-09.12: customer content arrives because something serialises a whole object.
    // An API that accepts one will be handed one, under pressure, while debugging.
    for (const field of ['body', 'payload', 'response', 'screenshot', 'source']) {
      assert.throws(
        () => t.log('info', 'e', { correlationId: corr }, { [field]: 'anything' }),
        TelemetryContentError, `field "${field}" was accepted`,
      );
    }
  });

  test('credential-shaped values are refused wherever they appear', () => {
    const t = new Telemetry(fixedClock());
    const corr = t.newCorrelationId();
    const forbidden = [
      '-----BEGIN PRIVATE KEY-----',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
      'AKIAIOSFODNN7EXAMPLE',
      'someone@example.com',
      'Authorization: Bearer abc123',
    ];
    for (const value of forbidden) {
      assert.throws(
        () => t.log('info', 'e', { correlationId: corr }, { detail: value }),
        TelemetryContentError, `value "${value.slice(0, 20)}" was accepted`,
      );
    }
  });

  test('a value long enough to be content is refused', () => {
    const t = new Telemetry(fixedClock());
    assert.throws(
      () => t.log('info', 'e', { correlationId: 'c' }, { note: 'x'.repeat(513) }),
      TelemetryContentError,
    );
  });

  test('identifiers and outcomes are accepted', () => {
    const t = new Telemetry(fixedClock());
    const corr = t.newCorrelationId();
    const r = t.log('info', 'registration.completed',
      { correlationId: corr, tenantId: 'tenant-a' }, { outcome: 'registered', durationMs: 42 });
    assert.equal(r.tenantId, 'tenant-a');
    assert.equal(r.attributes['outcome'], 'registered');
  });
});

describe('correlation and tracing', () => {
  test('every record of one operation is retrievable by correlation id', () => {
    const t = new Telemetry(fixedClock());
    const a = t.newCorrelationId();
    const b = t.newCorrelationId();
    t.log('info', 'start', { correlationId: a });
    t.log('info', 'step', { correlationId: a });
    t.log('info', 'other', { correlationId: b });
    assert.equal(t.byCorrelation(a).length, 2);
    assert.equal(t.byCorrelation(b).length, 1);
  });

  test('a span that was never ended reports unfinished, not missing', () => {
    // A hung operation and one that never started need opposite responses, so they
    // must not render identically.
    const t = new Telemetry(fixedClock());
    const corr = t.newCorrelationId();
    t.startSpan('hangs', { correlationId: corr });
    const ended = t.startSpan('completes', { correlationId: corr });
    t.endSpan(ended, 'ok');

    const traces = t.traces;
    assert.equal(traces.filter((s) => s.outcome === 'unfinished').length, 1);
    assert.equal(traces.filter((s) => s.outcome === 'ok').length, 1);
  });

  test('spans nest, so a trace can be reconstructed', () => {
    const t = new Telemetry(fixedClock());
    const corr = t.newCorrelationId();
    const parent = t.startSpan('parent', { correlationId: corr });
    const child = t.startSpan('child', { correlationId: corr, parentSpanId: parent });
    t.endSpan(child, 'ok');
    t.endSpan(parent, 'ok');
    assert.equal(t.traces.find((s) => s.spanId === child)!.parentSpanId, parent);
  });

  test('a span records a duration', () => {
    const t = new Telemetry(fixedClock(0, 5));
    const s = t.startSpan('work', { correlationId: 'c' });
    const ended = t.endSpan(s, 'ok')!;
    assert.ok(ended.durationMs !== null && ended.durationMs > 0);
  });
});

describe('metrics never invent a value (C-24.1)', () => {
  test('an unrecorded metric reads null, NOT zero', () => {
    // "No requests were served" and "no telemetry arrived" are different facts.
    // A zero collapses them into the more comforting one, and everything downstream
    // — SLIs, health, scores — inherits that lie.
    const m = freshMetrics();
    assert.equal(m.read('gateway.served', 'tenant-a'), null);
    m.increment('gateway.served', 'tenant-a');
    assert.equal(m.read('gateway.served', 'tenant-a')!.value, 1);
  });

  test('an undeclared metric cannot be recorded', () => {
    const m = new Metrics();
    assert.throws(() => m.increment('invented.metric'), /declared/);
  });

  test('a metric cannot be recorded as the wrong kind', () => {
    const m = freshMetrics();
    assert.throws(() => m.set('gateway.served', 1), /not a gauge/);
    assert.throws(() => m.observe('gateway.served', 1), /not a histogram/);
  });

  test('percentiles return an OBSERVED value, never an interpolated one', () => {
    const m = freshMetrics();
    for (const v of [10, 20, 30, 40, 100]) m.observe('gateway.duration', v, 'tenant-a');
    const p99 = m.percentile('gateway.duration', 99, 'tenant-a');
    assert.ok([10, 20, 30, 40, 100].includes(p99!), `${p99} was not an observed value`);
  });

  test('a percentile over no observations is null', () => {
    const m = freshMetrics();
    assert.equal(m.percentile('gateway.duration', 99, 'tenant-a'), null);
  });

  test('metrics are tenant-keyed, and there is no cross-tenant reader (C-24.10)', () => {
    const m = freshMetrics();
    m.increment('gateway.served', 'tenant-a', 5);
    m.increment('gateway.served', 'tenant-b', 3);
    assert.equal(m.read('gateway.served', 'tenant-a')!.value, 5);
    assert.equal(m.read('gateway.served', 'tenant-b')!.value, 3);
    // The unscoped slot is its own bucket, not a total. A getter that silently summed
    // tenants would be a cross-tenant aggregation nobody asked for.
    assert.equal(m.read('gateway.served', null), null);
    assert.deepEqual(m.tenantsFor('gateway.served'), ['tenant-a', 'tenant-b']);
  });
});

describe('health, readiness and liveness are three answers (C-23.10)', () => {
  test('liveness consults no dependency, so a dependency blip cannot cause a restart', () => {
    const m = freshMetrics();
    const h = new HealthMonitor(m);
    h.register({
      name: 'broken', requiredForReadiness: true,
      check: () => ({ state: 'unhealthy', detail: 'down' }),
    });
    h.markStarted();
    // Restarting the process would not fix a broken dependency; it would turn a blip
    // into a restart storm.
    assert.equal(h.liveness().state, 'pass');
    assert.equal(h.readiness().state, 'fail');
  });

  test('readiness fails during startup even with every dependency healthy', () => {
    const h = new HealthMonitor(freshMetrics());
    h.register({ name: 'ok', requiredForReadiness: true, check: () => ({ state: 'healthy', detail: 'up' }) });
    assert.equal(h.readiness().state, 'fail');
    h.markStarted();
    assert.equal(h.readiness().state, 'pass');
  });

  test('health does NOT report healthy on liveness alone (R-23.30, F-23.2)', () => {
    const m = freshMetrics();
    const h = new HealthMonitor(m);
    h.markStarted();
    h.register({ name: 'gateway', requiredForReadiness: true, check: () => ({ state: 'unhealthy', detail: 'refusing everything' }) });
    const report = h.health();
    assert.equal(report.state, 'unhealthy');
    assert.notEqual(report.state, 'healthy');
  });

  test('SILENCE IS NOT HEALTH — no activity reports unknown (C-24.7)', () => {
    // The single most damaging thing a health endpoint can do is report green during
    // a total outage of whatever reports to it.
    const m = freshMetrics();
    const h = new HealthMonitor(m);
    h.markStarted();
    h.register({ name: 'all-fine', requiredForReadiness: true, check: () => ({ state: 'healthy', detail: 'up' }) });

    const silent = h.health('gateway.served');
    assert.equal(silent.state, 'unknown');
    assert.match(silent.summary, /silent source|NOT health/i);

    m.increment('gateway.served', 'tenant-a');
    assert.equal(h.health('gateway.served').state, 'healthy');
  });

  test('a dependency that cannot be evaluated is unknown, not degraded', () => {
    const h = new HealthMonitor(freshMetrics());
    h.markStarted();
    h.register({ name: 'unreachable', requiredForReadiness: false, check: () => ({ state: 'unknown', detail: 'no answer' }) });
    // "Could not be checked" has not been shown to be working. Grading it as degraded
    // would imply a measurement that did not happen.
    assert.equal(h.health().state, 'unknown');
  });

  test('one tenant being down is visible even when others are healthy (R-23.14)', () => {
    const m = freshMetrics();
    const h = new HealthMonitor(m);
    for (let i = 0; i < 1000; i += 1) m.increment('gateway.served', 'tenant-healthy');
    m.increment('gateway.refused_unexpectedly', 'tenant-down', 20);

    assert.equal(h.tenantHealth('tenant-healthy', 'gateway.served', 'gateway.refused_unexpectedly').state, 'healthy');
    assert.equal(h.tenantHealth('tenant-down', 'gateway.served', 'gateway.refused_unexpectedly').state, 'unhealthy');
    // A tenant nobody reported is unknown, never healthy.
    assert.equal(h.tenantHealth('tenant-silent', 'gateway.served', 'gateway.refused_unexpectedly').state, 'unknown');
  });
});

describe('SLOs are objectives, not statistics (C-23.1, C-23.2)', () => {
  const source = (m: Metrics) => ({
    read: (n: string, t: string | null) => m.read(n, t),
    tenantsFor: (n: string) => m.tenantsFor(n),
  });

  test('an SLO without a consequence is REFUSED at publication (R-23.10)', () => {
    const r = new SloRegistry(source(freshMetrics()));
    assert.throws(() => r.publish({
      id: 'slo.decorative', protects: 'x', successMetric: 'a', failureMetric: 'b',
      target: 0.99, windowDays: 30, consequence: '', tenantScoped: false,
    }), SloError);
  });

  test('every published platform SLO declares SLI, target, window and consequence', () => {
    const r = new SloRegistry(source(freshMetrics()));
    for (const s of PLATFORM_SLOS) r.publish(s);
    for (const s of r.published) {
      assert.ok(s.successMetric && s.failureMetric, `${s.id} has no SLI`);
      assert.ok(s.target > 0 && s.target < 1, `${s.id} has no usable target`);
      assert.ok(s.windowDays > 0, `${s.id} has no window`);
      assert.ok(s.consequence.length > 40, `${s.id} has no substantive consequence`);
      // R-23.11: objectives protect user-visible outcomes, not component internals.
      assert.ok(!/cpu|memory|disk|thread/i.test(s.protects), `${s.id} protects an internal, not an outcome`);
    }
  });

  test('an SLI with no telemetry reports NOT MEASURED, never zero (C-23.4, R-23.13)', () => {
    const m = freshMetrics();
    const r = new SloRegistry(source(m));
    r.publish(PLATFORM_SLOS[0]!);
    const reading = r.read('slo.registration', 'tenant-a');
    assert.equal(reading.status, 'NOT MEASURED');
    assert.equal(reading.achieved, null, 'an unmeasured SLI produced a number');
    assert.equal(reading.budgetConsumed, null);
  });

  test('an unmeasured SLO consumes no budget and triggers no consequence', () => {
    const m = freshMetrics();
    const r = new SloRegistry(source(m));
    r.publish(PLATFORM_SLOS[0]!);
    const e = r.evaluate('slo.registration', 'tenant-a');
    assert.equal(e.consequenceTriggered, false);
    assert.equal(r.consumedFor('slo.registration'), 0);
  });

  test('breaching an SLO triggers its declared consequence (C-23.6)', () => {
    const m = freshMetrics();
    const r = new SloRegistry(source(m));
    r.publish(PLATFORM_SLOS[0]!);
    m.increment('registration.succeeded', 'tenant-a', 90);
    m.increment('registration.failed', 'tenant-a', 10);
    const e = r.evaluate('slo.registration', 'tenant-a');
    assert.equal(e.reading.status, 'breached');
    assert.equal(e.consequenceTriggered, true);
    assert.ok(e.consequence && e.consequence.length > 0);
  });

  test('RETARGETING DOES NOT RESET A CONSUMED BUDGET (C-23.7, R-23.17)', () => {
    // The most natural thing to do when a budget is spent and a release is waiting is
    // to move the target. That is adjusting the instrument to flatter the result.
    const m = freshMetrics();
    const r = new SloRegistry(source(m));
    r.publish(PLATFORM_SLOS[0]!);
    m.increment('registration.succeeded', 'tenant-a', 90);
    m.increment('registration.failed', 'tenant-a', 10);
    r.evaluate('slo.registration', 'tenant-a');
    const consumedBefore = r.consumedFor('slo.registration');
    assert.ok(consumedBefore > 0);

    r.retarget('slo.registration', { target: 0.5, windowDays: 365 }, 'deliberate attempt to reset the budget');
    assert.equal(r.consumedFor('slo.registration'), consumedBefore,
      'consumed budget was reset by retargeting');
    assert.ok(r.ledgerEntries.some((e) => e.event === 'retargeted'),
      'the retarget was not recorded');
  });

  test('a retarget without a reason is refused', () => {
    const r = new SloRegistry(source(freshMetrics()));
    r.publish(PLATFORM_SLOS[0]!);
    assert.throws(() => r.retarget('slo.registration', { target: 0.9 }, ''), SloError);
  });

  test('SLIs are read per tenant, so one tenant cannot be hidden by another', () => {
    const m = freshMetrics();
    const r = new SloRegistry(source(m));
    r.publish(PLATFORM_SLOS[1]!);
    m.increment('gateway.served', 'tenant-good', 10_000);
    m.increment('gateway.served', 'tenant-bad', 10);
    m.increment('gateway.refused_unexpectedly', 'tenant-bad', 90);

    const perTenant = r.readPerTenant('slo.gateway');
    const bad = perTenant.find((x) => x.tenantId === 'tenant-bad')!;
    assert.equal(bad.status, 'breached');
    assert.equal(perTenant.find((x) => x.tenantId === 'tenant-good')!.status, 'met');
  });
});

describe('platform intelligence (C-24.5, C-24.7, C-24.13, C-24.14)', () => {
  const source = (name: string, available: boolean, producedAtMs: number | null = 0): IngestedSource =>
    ({ name, available, unavailableReason: available ? null : 'no report received', producedAtMs });

  test('a silent source is a FINDING, not an absence (C-24.7)', () => {
    const findings = detectSilentSources([source('gateway', false), source('registry', true)]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.severity, 'major');
    assert.match(findings[0]!.recommendation, /unmeasured, not as healthy/i);
  });

  test('a score over zero measured inputs is null, never 100%', () => {
    const readings: SliReading[] = [
      { sloId: 'a', tenantId: null, status: 'NOT MEASURED', achieved: null, successes: 0, failures: 0, budgetConsumed: null, detail: '' },
    ];
    const report = scoreHealth(readings, [source('s', true)], 0);
    assert.equal(report.score, null, 'a score was published over zero measured inputs');
    assert.equal(report.coverage.measured, 0);
    assert.equal(report.coverage.expected, 1);
  });

  test('every index publishes score, coverage AND freshness (C-24.5)', () => {
    const readings: SliReading[] = [
      { sloId: 'a', tenantId: null, status: 'met', achieved: 1, successes: 10, failures: 0, budgetConsumed: 0, detail: '' },
      { sloId: 'b', tenantId: null, status: 'NOT MEASURED', achieved: null, successes: 0, failures: 0, budgetConsumed: null, detail: '' },
    ];
    const report = scoreHealth(readings, [source('s', true, 0)], 1000);
    assert.equal(report.score, 1);
    // The unmeasured indicator is excluded from the score and VISIBLE in coverage —
    // not counted as a pass, which would inflate, nor as a failure, which would make
    // the index permanently red and therefore ignored.
    assert.deepEqual(report.coverage, { measured: 1, expected: 2 });
    assert.equal(report.freshness.oldestAgeMs, 1000);
    assert.equal(typeof report.freshness.current, 'boolean');
  });

  test('stale evidence is reported as not current (C-24.6)', () => {
    const readings: SliReading[] = [
      { sloId: 'a', tenantId: null, status: 'met', achieved: 1, successes: 1, failures: 0, budgetConsumed: 0, detail: '' },
    ];
    const stale = scoreHealth(readings, [source('s', true, 0)], 86_400_001);
    assert.equal(stale.freshness.current, false);
  });

  test('ingestion failure is reported per source, not as a global outage (C-24.13)', () => {
    const findings = selfConformance([source('a', true), source('b', false), source('c', true)]);
    const ingestion = findings.find((f) => f.id === 'self.c-24.13')!;
    assert.match(ingestion.observation, /2\/3 available/);
    assert.match(ingestion.recommendation, /Partial ingestion, not a global outage/);
  });

  test('the service reports its own conformance (C-24.14)', () => {
    const findings = selfConformance([source('a', true)]);
    assert.ok(findings.some((f) => f.id === 'self.c-24.9'),
      'the service does not report its own no-remediation conformance');
  });

  test('every finding names the evidence it came from', () => {
    const readings: SliReading[] = [
      { sloId: 'slo.gateway', tenantId: 'tenant-a', status: 'breached', achieved: 0.5, successes: 5, failures: 5, budgetConsumed: 1, detail: 'x' },
    ];
    const findings = analyse(readings, {
      state: 'healthy', checkedAt: '', dependencies: [], summary: 'ok',
    }, [source('s', true)]);
    for (const f of findings) {
      assert.ok(f.derivedFrom.length > 0, `${f.id} is an opinion — it names no evidence`);
      assert.ok(f.recommendation.length > 0, `${f.id} offers no recommendation`);
    }
  });

  test('an unmeasured SLO produces a finding rather than passing quietly', () => {
    const readings: SliReading[] = [
      { sloId: 'slo.gateway', tenantId: null, status: 'NOT MEASURED', achieved: null, successes: 0, failures: 0, budgetConsumed: null, detail: 'no telemetry' },
    ];
    const findings = analyse(readings, { state: 'healthy', checkedAt: '', dependencies: [], summary: '' }, []);
    const f = findings.find((x) => x.id.startsWith('slo.unmeasured'))!;
    assert.ok(f, 'an unmeasured objective produced no finding');
    assert.match(f.recommendation, /Restore the telemetry rather than removing the objective/);
  });
});

describe('failure classification', () => {
  test('each distinct signal classifies to a distinct category', () => {
    const signals = [
      'client certificate required', 'certificate revoked', 'token certificate-mismatch',
      'token replayed', 'tenant scope may not be asserted by the caller',
      'not authorised for this path', 'rate limit exceeded', 'certificate expired',
    ];
    const categories = signals.map((s) => classify(s).category);
    assert.equal(new Set(categories).size, categories.length,
      `signals collapsed into the same category: ${categories.join(', ')}`);
  });

  test('an unrecognised signal is unclassified, NOT forced into the nearest bucket', () => {
    // A confident wrong answer sends an operator down a path that cannot work, which
    // costs more than an honest "I do not recognise this".
    const c = classify('a completely novel failure nobody anticipated');
    assert.equal(c.category, 'unclassified');
    assert.match(c.recommendation, /Unrecognised/);
  });

  test('a cross-tenant attempt is classified critical', () => {
    assert.equal(classify('tenant scope may not be asserted by the caller').severity, 'critical');
  });

  test('every classification says whether the customer can act on it', () => {
    for (const s of ['client certificate required', 'rate limit exceeded', 'certificate revoked']) {
      assert.equal(typeof classify(s).customerActionable, 'boolean');
    }
  });
});

describe('dashboards are generated and validated against the registry', () => {
  test('every panel names only declared metrics', () => {
    const m = freshMetrics();
    assert.doesNotThrow(() => validateDashboards(buildDashboards(), m));
  });

  test('a panel naming an undeclared metric is REFUSED', () => {
    const m = new Metrics();
    m.declare(PLATFORM_METRICS[0]!);
    // An empty panel is indistinguishable from a quiet period — the exact confusion
    // C-24.7 prevents in the data layer, arriving through the presentation layer.
    assert.throws(() => validateDashboards(buildDashboards(), m), DashboardError);
  });

  test('every panel declares what its emptiness means (C-24.7)', () => {
    for (const d of buildDashboards()) {
      for (const p of d.panels) {
        assert.ok(p.whenEmpty.length > 30, `${d.id}/${p.title} does not say what empty means`);
        assert.ok(p.interpretation.length > 20, `${d.id}/${p.title} has no interpretation`);
      }
    }
  });

  test('tenant-scoped panels are never described as aggregates (C-24.10)', () => {
    for (const d of buildDashboards()) {
      for (const p of d.panels.filter((x) => x.scope === 'tenant')) {
        assert.ok(!/across all tenants|total across|aggregate of/i.test(p.interpretation),
          `${d.id}/${p.title} describes a cross-tenant aggregate`);
      }
    }
  });

  test('metrics shown on no dashboard are reported as a gap, not hidden', () => {
    const unused = unusedMetrics(buildDashboards(), freshMetrics());
    assert.ok(Array.isArray(unused));
  });
});

describe('release governance (C-24.2, C-24.3, C-24.4, C-25.4)', () => {
  const artefacts = [
    { path: 'a.js', content: 'console.log(1);' },
    { path: 'b.json', content: '{"x":1}' },
  ];
  const manifest = () => buildManifest({
    releaseVersion: 'M2.8', contractVersion: '1.0.0',
    supportedContractMajors: [1], upgradeableFrom: ['M2.6', 'M2.7'],
    commit: 'abc', branch: 'main', builtAt: '2026-07-22T00:00:00.000Z',
    artefacts, dependencies: [{ name: 'typescript', version: '5.9.3' }],
  });

  test('every artefact traces to a commit and a manifest (C-24.2)', () => {
    // A measurement detached from the artefact and commit that produced it cannot be
    // reproduced, and therefore cannot be checked by anyone who did not run it.
    const m = manifest();
    assert.equal(m.commit, 'abc');
    assert.equal(m.branch, 'main');
    for (const a of m.artefacts) assert.match(a.sha256, /^[0-9a-f]{64}$/);
  });

  test('two builds of the same release produce an identical manifest', () => {
    assert.equal(manifest().manifestHash, manifest().manifestHash);
  });

  test('ingested artefacts are integrity-verified by RECOMPUTATION before use (C-24.4)', () => {
    const m = manifest();
    const tampered = [{ path: 'a.js', content: 'console.log(2);' }, artefacts[1]!];
    const result = verifyIntegrity(m, tampered);
    assert.equal(result.ok, false);
    assert.equal(result.failures[0]!.kind, 'modified');
  });

  test('a missing artefact and an unlisted one are DIFFERENT failures', () => {
    // Incomplete release vs. a release carrying something nobody recorded. The second
    // is what a supply-chain attack produces, and it is the one most likely waved through.
    const m = manifest();
    const missing = verifyIntegrity(m, [artefacts[0]!]);
    assert.equal(missing.failures[0]!.kind, 'missing');

    const extra = verifyIntegrity(m, [...artefacts, { path: 'stowaway.js', content: 'evil' }]);
    assert.equal(extra.failures[0]!.kind, 'unlisted');
  });

  test('an edited manifest fails its own hash', () => {
    const m = manifest();
    assert.equal(verifyManifestHash(m), true);
    assert.equal(verifyManifestHash({ ...m, releaseVersion: 'M9.9' }), false);
  });

  test('an unsupported contract major is refused with what to change', () => {
    const v = checkContractCompatibility(manifest(), '2.0.0');
    assert.equal(v.ok, false);
    assert.match(v.detail, /supported window/);
    assert.match(v.detail, /1\.0\.0/);
  });

  test('a malformed version is distinguished from an unsupported one', () => {
    const malformed = checkContractCompatibility(manifest(), 'v1');
    assert.equal(malformed.ok === false && malformed.reason, 'malformed-version');
    const unsupported = checkContractCompatibility(manifest(), '9.0.0');
    assert.equal(unsupported.ok === false && unsupported.reason, 'unsupported-major');
  });

  test('upgrade succeeds from every supported source, and only those (C-25.4)', () => {
    assert.equal(checkUpgradePath(manifest(), 'M2.7').ok, true);
    // "Newer is upgradeable" holds until one release needs an intermediate migration.
    assert.equal(checkUpgradePath(manifest(), 'M1.0').ok, false);
  });

  test('an unpinned dependency is caught', () => {
    const m = buildManifest({
      releaseVersion: 'x', contractVersion: '1.0.0', supportedContractMajors: [1],
      upgradeableFrom: [], commit: null, branch: null, builtAt: '2026-07-22T00:00:00.000Z',
      artefacts: [], dependencies: [{ name: 'left-pad', version: '^1.0.0' }],
    });
    assert.equal(checkDependencyPinning(m).ok, false);
  });

  test('evidence without provenance is rejected at ingestion (C-24.3)', () => {
    assert.equal(admitEvidence({ evidenceId: 'x' }).admitted, false);
    assert.equal(admitEvidence({
      evidenceId: 'x', generator: 'g', timestamp: 't', commit: 'c', contentHash: 'h',
    }).admitted, true);
  });
});

describe('this service performs no remediation (C-24.9) and blocks nothing (C-23.12)', () => {
  test('no source file performs a write, control or remediation operation', () => {
    // A SOURCE SCAN, not a comment. The pressure to close the loop — restart it,
    // rotate it, drain it — arrives during an incident, which is exactly when a
    // comment stops working.
    const files = ['telemetry.ts', 'health.ts', 'slo.ts', 'intelligence.ts', 'dashboards.ts', 'release-governance.ts', 'index.ts'];
    const forbidden = [
      /\bwriteFileSync\b/, /\bexecSync\b/, /\bspawnSync\b/, /\bexecFileSync\b/,
      /\bfetch\s*\(/, /\bhttps?\.request\b/, /\bprocess\.exit\b/, /\bprocess\.kill\b/,
    ];
    for (const f of files) {
      const body = readFileSync(join(packageRoot, 'src', f), 'utf8');
      for (const re of forbidden) {
        assert.ok(!re.test(body), `${f} contains ${re} — this service must observe, never act`);
      }
    }
  });

  test('the SLO registry reports a consequence rather than enforcing it', () => {
    const m = freshMetrics();
    const r = new SloRegistry({ read: (n, t) => m.read(n, t), tenantsFor: (n) => m.tenantsFor(n) });
    r.publish(PLATFORM_SLOS[0]!);
    m.increment('registration.succeeded', 'tenant-a', 1);
    m.increment('registration.failed', 'tenant-a', 99);
    const e = r.evaluate('slo.registration', 'tenant-a');
    // The consequence is returned as text for a human to act on. Nothing is frozen,
    // blocked or rolled back by this call.
    assert.equal(typeof e.consequence, 'string');
    assert.equal(e.consequenceTriggered, true);
  });
});
