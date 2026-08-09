/**
 * Runtime execution governance (v2.3).
 *
 * TRACEABILITY
 *   ADR      : ADR-0066 · ADR-0022
 *   Criteria : C-13.1 (no verdict without the measurement behind it)
 * Categories: runtime, governance, negative, determinism
 *
 * THE TESTS THAT MATTER ARE THE ONES THAT TRY TO CHEAT THE MACHINE.
 * A state machine is only worth having if it refuses: skipping a state, re-entering one,
 * running them backwards, starting in the middle. A ledger is only an audit trail if
 * editing it is detectable. A graph is only a traceability chain if a broken link fails.
 * Each is attacked below rather than merely exercised.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME_STATES, OPTIONAL_STATES, LEGAL_TRANSITIONS, RuntimeTransitionError,
  StepRuntime, GovernanceLedger, EvidenceGraph, RuntimeGovernor,
  captureSnapshot, compareReplay,
  type RuntimeState, type LedgerRecord,
} from '../src/index.js';

/** A counter clock. Deterministic, so a ledger can be compared byte for byte. */
const counterClock = () => { let t = 1_000; return () => (t += 10); };

/**
 * Drive a runtime through every mandatory state.
 *
 * A runtime the governor created is already at REGISTERED; a standalone one is not. The
 * helper registers only when needed, so both paths reach COMPLETED the same way.
 */
function driveToCompletion(r: StepRuntime, includeOptional = false): void {
  if (r.state === null) r.transition('REGISTERED', { evidence: ['ev:REGISTERED'] });
  for (const s of RUNTIME_STATES) {
    if (s === 'REGISTERED') continue;
    if (OPTIONAL_STATES.includes(s) && !includeOptional) continue;
    r.transition(s, { evidence: [`ev:${s}`] });
  }
}

// ── The state machine ───────────────────────────────────────────────────────

describe('the runtime state machine refuses illegal movement', () => {
  test('the eighteen states are declared in order, one of them optional', () => {
    assert.equal(RUNTIME_STATES.length, 18);
    assert.equal(RUNTIME_STATES[0], 'REGISTERED');
    assert.equal(RUNTIME_STATES[RUNTIME_STATES.length - 1], 'COMPLETED');
    assert.deepEqual([...OPTIONAL_STATES], ['AUTO_CORRECTED']);
  });

  test('a runtime must begin at REGISTERED', () => {
    const r = new StepRuntime('FT-007', counterClock());
    assert.throws(() => r.transition('DISCOVERED'), RuntimeTransitionError);
    assert.equal(r.state, null);
  });

  test('a SKIPPED state is refused at the transition, not at the audit', () => {
    // The whole point: a machine that recorded the violation and continued would let
    // everything downstream run before anyone objected.
    const r = new StepRuntime('FT-008', counterClock());
    r.transition('REGISTERED');
    r.transition('DISCOVERED');
    assert.throws(() => r.transition('ANALYSED'), RuntimeTransitionError,
      'EVIDENCE_COLLECTED was skipped and the machine allowed it');
  });

  test('a state cannot be RE-ENTERED', () => {
    const r = new StepRuntime('FT-009', counterClock());
    r.transition('REGISTERED');
    r.transition('DISCOVERED');
    assert.throws(() => r.transition('DISCOVERED'), /cannot be re-entered/);
  });

  test('the machine cannot run BACKWARDS', () => {
    const r = new StepRuntime('FT-010', counterClock());
    r.transition('REGISTERED');
    r.transition('DISCOVERED');
    r.transition('EVIDENCE_COLLECTED');
    assert.throws(() => r.transition('DISCOVERED'), RuntimeTransitionError);
  });

  test('CERTIFIED is unreachable without review and verification', () => {
    // A step cannot certify itself by jumping the reviewers.
    const r = new StepRuntime('FT-011', counterClock());
    r.transition('REGISTERED');
    assert.throws(() => r.transition('CERTIFIED'), RuntimeTransitionError);
  });

  test('AUTO_CORRECTED may be skipped, and only AUTO_CORRECTED', () => {
    const clean = new StepRuntime('FT-012', counterClock());
    driveToCompletion(clean);
    assert.equal(clean.completed, true);
    assert.deepEqual([...clean.skippedStates()], [], 'a mandatory state was skipped');

    const corrected = new StepRuntime('FT-013', counterClock());
    driveToCompletion(corrected, true);
    assert.equal(corrected.completed, true);
    assert.ok(corrected.history.some((t) => t.to === 'AUTO_CORRECTED'));
  });

  test('nothing follows COMPLETED', () => {
    const r = new StepRuntime('FT-014', counterClock());
    driveToCompletion(r);
    assert.deepEqual([...LEGAL_TRANSITIONS.COMPLETED], []);
    assert.throws(() => r.transition('REGISTERED'), RuntimeTransitionError);
  });

  test('every transition is timestamped, durationed and evidenced', () => {
    const r = new StepRuntime('FT-015', counterClock());
    driveToCompletion(r);
    for (const t of r.history) {
      assert.ok(t.at > 0, 'a transition carries no timestamp');
      assert.ok(t.durationMs >= 0, 'a transition carries no duration');
      assert.equal(t.stepId, 'FT-015');
    }
    // One execution proof per transition — the record a verifier reads.
    assert.equal(r.executionProofs.length, r.history.length);
    for (const p of r.executionProofs) {
      assert.ok(p.endedAt >= p.startedAt);
      assert.equal(p.endedAt - p.startedAt, p.durationMs);
    }
  });

  test('an incomplete runtime NAMES the states it never entered', () => {
    const r = new StepRuntime('FT-016', counterClock());
    r.transition('REGISTERED');
    r.transition('DISCOVERED');
    const skipped = r.skippedStates();
    assert.ok(skipped.length > 0);
    assert.ok(skipped.includes('CERTIFIED'));
    assert.ok(!skipped.includes('AUTO_CORRECTED'), 'the optional state was reported as skipped');
    assert.equal(r.completed, false);
  });
});

// ── The governance ledger ───────────────────────────────────────────────────

describe('the governance ledger is append-only and tamper-evident', () => {
  const ledgerWith = (n: number) => {
    const l = new GovernanceLedger('2.3.0', counterClock());
    for (let i = 0; i < n; i += 1) {
      l.append({
        stepId: `FT-0${String(i + 7).padStart(2, '0')}`,
        runtimeState: 'CERTIFIED' as RuntimeState,
        inputs: ['in'], outputs: ['out'], evidence: [`ev${i}`],
        reviewerDecisions: ['Governance Reviewer: PASS'],
        gateResults: [{ gate: 'traceability', passed: true }],
        certification: 'PASS', confidence: 1,
      });
    }
    return l;
  };

  test('every record chains to its predecessor', () => {
    const l = ledgerWith(5);
    const v = l.verify();
    assert.equal(v.intact, true, v.reason);
    assert.equal(v.length, 5);
    assert.equal(l.entries[0]!.previousHash, '0'.repeat(64));
    for (let i = 1; i < l.entries.length; i += 1) {
      assert.equal(l.entries[i]!.previousHash, l.entries[i - 1]!.hash);
    }
  });

  test('EDITING a record breaks the chain, and the break is located', () => {
    // An audit trail that can be edited silently is not an audit trail.
    const l = ledgerWith(4);
    const tampered = l.entries as unknown as LedgerRecord[];
    tampered[1] = { ...tampered[1]!, certification: 'PASS', confidence: 0.1 };
    const v = l.verify();
    assert.equal(v.intact, false);
    assert.ok(v.brokenAt, 'the break was not located');
    assert.match(v.reason, /hash does not match its content|does not chain/);
  });

  test('a SEALED ledger refuses a later decision', () => {
    const l = ledgerWith(2);
    l.seal();
    assert.throws(() => l.append({
      stepId: 'FT-037', runtimeState: 'COMPLETED' as RuntimeState,
      inputs: [], outputs: [], evidence: [], reviewerDecisions: [], gateResults: [],
      certification: 'PASS', confidence: 1,
    }), /sealed/);
  });

  test('the ledger is deterministic under a deterministic clock', () => {
    // This is what makes replay comparable: two identical runs produce identical records.
    const a = ledgerWith(3).entries.map((r) => r.hash);
    const b = ledgerWith(3).entries.map((r) => r.hash);
    assert.deepEqual(a, b);
  });

  test('every record carries the full decision contract', () => {
    for (const r of ledgerWith(1).entries) {
      for (const field of ['decisionId', 'stepId', 'runtimeState', 'at', 'inputs', 'outputs',
        'evidence', 'reviewerDecisions', 'gateResults', 'certification', 'confidence', 'version', 'hash']) {
        assert.ok(field in r, `the ledger record omits ${field}`);
      }
    }
  });
});

// ── The evidence graph ──────────────────────────────────────────────────────

describe('the evidence graph is a walkable, immutable chain', () => {
  const chain = () => {
    const g = new EvidenceGraph();
    g.addNode({ id: 'r1', kind: 'requirement', label: 'r' });
    g.addNode({ id: 's1', kind: 'scenario', label: 's' });
    g.addNode({ id: 't1', kind: 'manual-test-case', label: 't' });
    g.addEdge({ from: 'r1', to: 's1', relation: 'covered-by' });
    g.addEdge({ from: 's1', to: 't1', relation: 'authored-as' });
    return g;
  };

  test('a complete chain validates', () => {
    const v = chain().validate();
    assert.equal(v.complete, true, v.reason);
    assert.equal(v.nodes, 3);
    assert.equal(v.edges, 2);
  });

  test('a BROKEN edge fails, and names both ends', () => {
    const g = chain();
    g.addEdge({ from: 't1', to: 'missing-node', relation: 'automated-by' });
    const v = g.validate();
    assert.equal(v.complete, false);
    assert.ok(v.brokenEdges.includes('t1 -> missing-node'));
  });

  test('an ORPHAN node fails — nothing reaches it', () => {
    const g = chain();
    g.addNode({ id: 'floating', kind: 'locator', label: 'unreferenced' });
    const v = g.validate();
    assert.equal(v.complete, false);
    assert.ok(v.orphans.includes('floating'));
  });

  test('a DUPLICATE id is recorded, never silently overwritten', () => {
    // Overwriting would lose the artefact whose id collided.
    const g = chain();
    g.addNode({ id: 'r1', kind: 'requirement', label: 'a different requirement' });
    const v = g.validate();
    assert.equal(v.complete, false);
    assert.ok(v.duplicates.includes('r1'));
    assert.equal(g.allNodes().find((n) => n.id === 'r1')!.label, 'r', 'the original node was overwritten');
  });

  test('a CYCLE fails — the chain cannot be walked', () => {
    const g = chain();
    g.addEdge({ from: 't1', to: 'r1', relation: 'loops-back' });
    const v = g.validate();
    assert.equal(v.complete, false);
    assert.ok(v.cycles.length > 0);
  });

  test('an EMPTY graph is incomplete, and says why', () => {
    const v = new EvidenceGraph().validate();
    assert.equal(v.complete, false);
    assert.match(v.reason, /nothing was evidenced/);
  });

  test('a SEALED graph refuses extension', () => {
    const g = chain();
    g.seal();
    assert.throws(() => g.addNode({ id: 'x', kind: 'release', label: 'x' }), /sealed/);
    assert.throws(() => g.addEdge({ from: 'r1', to: 's1', relation: 'x' }), /sealed/);
  });
});

// ── Replay ──────────────────────────────────────────────────────────────────

describe('replay is deterministic and divergence is analysed', () => {
  const snapshot = (over: Record<string, string> = {}) => {
    const r = new StepRuntime('FT-025', counterClock());
    driveToCompletion(r);
    return captureSnapshot({
      stepId: 'FT-025',
      environment: { env: 'test', ...over },
      testData: { seed: 'abc' },
      configuration: { browser: 'chromium' },
      browserContext: 'chromium-1',
      logs: [],
      transitions: r.history,
    });
  };

  test('an identical replay reproduces the state sequence and evidence', () => {
    const original = snapshot();
    const replay = snapshot();
    const c = compareReplay(original, replay);
    assert.equal(c.reproducible, true, c.reason);
    assert.equal(c.identicalInputs, true);
    assert.deepEqual([...c.differences], []);
  });

  test('a replay against DIFFERENT inputs is not evidence of intermittency', () => {
    // The distinction that stops a bad defect being raised.
    const c = compareReplay(snapshot(), snapshot({ env: 'staging' }));
    assert.equal(c.reproducible, false);
    assert.equal(c.identicalInputs, false);
    assert.ok(c.differences.some((d) => /different inputs/.test(d)));
  });

  test('a diverged state sequence is reported for analysis', () => {
    const original = snapshot();
    const partial = new StepRuntime('FT-025', counterClock());
    partial.transition('REGISTERED');
    partial.transition('DISCOVERED');
    const replay = captureSnapshot({
      stepId: 'FT-025',
      environment: { env: 'test' }, testData: { seed: 'abc' },
      configuration: { browser: 'chromium' }, browserContext: 'chromium-1',
      logs: [], transitions: partial.history,
    });
    const c = compareReplay(original, replay);
    assert.equal(c.reproducible, false);
    assert.ok(c.differences.some((d) => /state sequence diverged/.test(d)));
    assert.match(c.reason, /require analysis before a defect is raised/);
  });
});

// ── The governor ────────────────────────────────────────────────────────────

describe('the runtime governor proves a run executed', () => {
  test('a fully governed run reports governed', () => {
    const g = new RuntimeGovernor('2.3.0', counterClock());
    for (const step of ['FT-007', 'FT-008']) driveToCompletion(g.register(step));
    g.graph.addNode({ id: 'r1', kind: 'requirement', label: 'r' });
    g.graph.addNode({ id: 's1', kind: 'scenario', label: 's' });
    g.graph.addEdge({ from: 'r1', to: 's1', relation: 'covered-by' });

    const report = g.report();
    assert.equal(report.steps, 2);
    assert.equal(report.completed, 2);
    assert.deepEqual([...report.skipped], []);
    assert.equal(report.ledger.intact, true);
    assert.equal(report.graph.complete, true);
    assert.equal(report.governed, true, report.reason);
  });

  test('an INCOMPLETE step blocks the governed verdict, and is named', () => {
    const g = new RuntimeGovernor('2.3.0', counterClock());
    driveToCompletion(g.register('FT-007'));
    g.register('FT-008').transition('DISCOVERED');
    g.graph.addNode({ id: 'r1', kind: 'requirement', label: 'r' });
    g.graph.addNode({ id: 's1', kind: 'scenario', label: 's' });
    g.graph.addEdge({ from: 'r1', to: 's1', relation: 'covered-by' });

    const report = g.report();
    assert.equal(report.governed, false);
    assert.ok(report.incomplete.includes('FT-008'));
    assert.ok(report.skipped.some((s) => s.startsWith('FT-008:')));
  });

  test('a run that governed NOTHING cannot be certified as having run', () => {
    const report = new RuntimeGovernor('2.3.0', counterClock()).report();
    assert.equal(report.governed, false);
    assert.match(report.reason, /no step entered runtime governance/);
  });

  test('every transition reaches the ledger', () => {
    const g = new RuntimeGovernor('2.3.0', counterClock());
    const r = g.register('FT-007');
    driveToCompletion(r);
    assert.equal(g.ledger.entries.length, r.history.length);
    assert.equal(g.ledger.verify().intact, true);
  });

  test('sealing closes both the ledger and the graph', () => {
    const g = new RuntimeGovernor('2.3.0', counterClock());
    driveToCompletion(g.register('FT-007'));
    g.seal();
    assert.equal(g.ledger.isSealed, true);
    assert.equal(g.graph.isSealed, true);
  });
});
