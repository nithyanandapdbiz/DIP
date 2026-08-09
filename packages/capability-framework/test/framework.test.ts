/**
 * The capability framework itself.
 * TRACEABILITY: 12-capability-orchestration.md · 11-capability-model.md
 *               14-tool-operating-model.md
 *   Criteria: C-12.1, C-12.2, C-12.11, C-12.12, C-11.11, C-11.13, C-14.1
 * Categories: framework, orchestration, negative
 *
 * TESTED SEPARATELY FROM ANY CAPABILITY, DELIBERATELY.
 * The Functional Testing Engine's suite exercises the framework through one capability.
 * That proves the framework works for that capability. These prove properties of the
 * framework itself — the ones every future capability will depend on, and which would
 * otherwise only be discovered when the second capability is written.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES, STAGE_PLANE, GOVERNANCE_TRIAD, CapabilityRegistry, runCapability, isSealed,
  valueOf, certify, progressedTo, CERTIFICATION_GATES, GATE_STAGE,
  AdapterRegistry, AdapterError, PLANNING_SEQUENCE, AgentCatalogue, defineAgent,
  CapabilityRegistrationError,
  type Capability, type StageName, type StageResult,
} from '../src/index.js';

/** A minimal, complete capability. Every stage does real work. */
function trivialCapability(overrides: Partial<Capability> = {}): Capability {
  const stages = Object.fromEntries(STAGES.map((s) => [
    s,
    (ctx: { audit: (e: string, d: string) => void }, emit: { ok: (v: unknown, a?: readonly string[]) => unknown }) => {
      ctx.audit(`${s}.ran`, 'trivial');
      return emit.ok({ stage: s }, [`agent.${s}`]);
    },
  ])) as unknown as Capability['stages'];

  return {
    id: 'trivial', version: '1.0.0', name: 'Trivial',
    stages, requiredAdapters: [], evidenceClasses: [],
    certificationCriteria: ['C-12.1'],
    ...overrides,
  };
}

describe('the twelve stages', () => {
  test('there are exactly twelve, and the governance triad is among them', () => {
    assert.equal(STAGES.length, 12);
    for (const s of GOVERNANCE_TRIAD) assert.ok(STAGES.includes(s));
    assert.equal(GOVERNANCE_TRIAD.length, 3);
  });

  test('stages 10, 11 and 12 are Intelligence Plane (C-12.10)', () => {
    for (const s of ['reflection', 'certification', 'reporting'] as StageName[]) {
      assert.equal(STAGE_PLANE[s], 'IP');
    }
  });

  test('a run traverses every stage in declared order', () => {
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    assert.deepEqual(outcome.completed, [...STAGES]);
    assert.equal(outcome.failedAt, null);
  });

  test('each stage receives the previous stage\'s result (C-12.9 ordering)', () => {
    const seen: (string | null)[] = [];
    const cap = trivialCapability();
    const stages = Object.fromEntries(STAGES.map((s) => [
      s,
      (ctx: { previous: StageResult<StageName, unknown> | null }, emit: { ok: (v: unknown) => unknown }) => {
        seen.push(ctx.previous ? ctx.previous.stage : null);
        return emit.ok({});
      },
    ])) as unknown as Capability['stages'];

    runCapability({ ...cap, stages }, { tenantId: 't', runId: 'r', correlationId: 'c' });
    assert.equal(seen[0], null, 'Planning received a predecessor');
    for (let i = 1; i < STAGES.length; i += 1) {
      assert.equal(seen[i], STAGES[i - 1], `${STAGES[i]} did not receive ${STAGES[i - 1]}`);
    }
  });

  test('a stage that throws fails the run at that stage and records it', () => {
    const cap = trivialCapability();
    const stages = {
      ...cap.stages,
      'policy-review': (ctx: unknown) => { void ctx; throw new Error('policy engine unavailable'); },
    } as unknown as Capability['stages'];

    const outcome = runCapability({ ...cap, stages }, { tenantId: 't', runId: 'r', correlationId: 'c' });
    assert.equal(outcome.failedAt, 'policy-review');
    assert.match(outcome.failure ?? '', /policy engine unavailable/);
    // The stages after the failure did NOT run. A framework that carried on would
    // certify against a run that never completed.
    assert.ok(!outcome.completed.includes('certification'));
  });
});

describe('stage results cannot be forged (C-12.11)', () => {
  test('a hand-written object is not sealed', () => {
    assert.equal(isSealed({ stage: 'planning', value: {}, outcome: 'ok' }), false);
    assert.equal(isSealed(null), false);
    assert.equal(isSealed('planning'), false);
  });

  test('a real result is sealed and carries its stage', () => {
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    for (const [stage, result] of outcome.results) {
      assert.equal(isSealed(result), true);
      assert.equal(result.stage, stage);
    }
  });

  test('a not-applicable result REQUIRES a reason (C-12.12)', () => {
    const cap = trivialCapability();
    const stages = {
      ...cap.stages,
      // An empty reason is refused: "not applicable" without one is an empty result
      // wearing a different name.
      discovery: (ctx: unknown, emit: { notApplicable: (v: unknown, r: string) => unknown }) => {
        void ctx;
        return emit.notApplicable({}, '');
      },
    } as unknown as Capability['stages'];

    const outcome = runCapability({ ...cap, stages }, { tenantId: 't', runId: 'r', correlationId: 'c' });
    assert.equal(outcome.failedAt, 'discovery');
    assert.match(outcome.failure ?? '', /reason/);
  });

  test('resumption accepts only sealed prior results', () => {
    const first = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    // Forged prior results are ignored, so the stage runs again rather than being
    // skipped — resumption cannot become a bypass.
    const forged = new Map<StageName, StageResult<StageName, unknown>>([
      ['certification', { stage: 'certification', value: {}, outcome: 'ok', reason: null, agentsInvoked: [] } as unknown as StageResult<StageName, unknown>],
    ]);
    const resumed = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' }, forged);
    assert.equal(resumed.failedAt, null);
    assert.equal(resumed.completed.length, first.completed.length);
    assert.ok(resumed.audit.every((e) => e.event !== 'stage.resumed'),
      'a forged prior result was replayed');
  });
});

describe('registration refuses an incomplete capability', () => {
  test('a missing stage is refused, and the message names it', () => {
    const cap = trivialCapability();
    const stages = { ...cap.stages } as Record<string, unknown>;
    delete stages['evidence'];
    try {
      new CapabilityRegistry().register({ ...cap, stages } as Capability);
      assert.fail('an incomplete capability registered');
    } catch (e) {
      assert.ok(e instanceof CapabilityRegistrationError);
      assert.match((e as CapabilityRegistrationError).missing.join(' '), /evidence/);
    }
  });

  test('a capability with no certification criteria is refused', () => {
    assert.throws(
      () => new CapabilityRegistry().register(trivialCapability({ certificationCriteria: [] })),
      CapabilityRegistrationError,
    );
  });

  test('the registry is the single enumeration of capabilities (C-11.9)', () => {
    const r = new CapabilityRegistry();
    r.register(trivialCapability());
    assert.equal(r.registered.length, 1);
    assert.equal(r.get('trivial')!.id, 'trivial');
    assert.equal(r.get('does-not-exist'), null);
  });
});

describe('certification', () => {
  // ADR-0076 §4.1.1 took these two from 8 to 9. BOTH ASSERTED ARITY, NEITHER ASSERTED A
  // PROGRESSION THAT DEPENDED ON STAGE 4 BEING UNHEARD — read before they were touched, because
  // a test that passed only because a control was missing is evidence and must not be
  // quietly updated. The trivial capability emits `ok` at every stage including
  // `architecture-review`, so it certified before the gate existed and certifies after it;
  // only the number of verdicts moved.
  //
  // THE REAL FINDING IS WHAT THE SUITE DID NOT CONTAIN. Before the probe above,
  // `architecture-review` appeared in this file ONLY inside `GOVERNANCE_TRIAD` iterations —
  // presence checks. **No test ever placed a non-`ok` outcome at stage 4.** The gap survived
  // not because a test was wrong but because a case was never written, which is why a green
  // suite was consistent with a triad stage nothing could hear.
  //
  // The literals are replaced by the properties they were standing in for, so the next gate
  // added moves no count and this assertion cannot go stale again.
  test('the gates are ordered, each binds to a stage, and the map and list agree', () => {
    assert.equal(CERTIFICATION_GATES.length, Object.keys(GATE_STAGE).length);
    for (const g of CERTIFICATION_GATES) assert.ok(STAGES.includes(GATE_STAGE[g]));

    // THE TRIAD'S GATES COME FIRST, IN STAGE ORDER, AND BEFORE EVERY OTHER GATE.
    // This is the property ADR-0076 §4.1.1 relies on when it places `architecture-certified`
    // first: `progressedTo` reads this list as a progression, so a run must not be
    // story-certified while its architecture review is still refusing.
    const triadGates = CERTIFICATION_GATES.filter((g) => GOVERNANCE_TRIAD.includes(GATE_STAGE[g] as never));
    assert.equal(triadGates.length, GOVERNANCE_TRIAD.length);
    assert.deepEqual(CERTIFICATION_GATES.slice(0, 3), triadGates);
    assert.deepEqual(triadGates.map((g) => GATE_STAGE[g]), [...GOVERNANCE_TRIAD]);

    // A WIDER "gate order mirrors stage order" ASSERTION WAS WRITTEN HERE FIRST AND IS WRONG.
    // It failed on the last pair: `reporting-certified` binds to stage 12 and `release-certified`
    // to stage 11. That is deliberate — release certification is the AGGREGATE verdict and is
    // last in the gate progression regardless of which stage renders it, because `progressedTo`
    // is a progression over CERTIFICATIONS and not over stages. Recorded rather than deleted:
    // the invented assertion is the same defect class this ADR is about — a claim that sounds
    // right, is not the one the design holds, and was caught only by running it.
  });

  test('a complete run certifies every gate', () => {
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    const verdict = certify(outcome.results);
    assert.equal(verdict.certified, true);
    assert.equal(verdict.verdicts.length, CERTIFICATION_GATES.length);
    assert.ok(progressedTo(verdict, 'release-certified'));
  });

  test('a run missing the governance triad is refused before any other gate', () => {
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    for (const missing of GOVERNANCE_TRIAD) {
      const partial = new Map(outcome.results);
      partial.delete(missing);
      const verdict = certify(partial);
      assert.equal(verdict.certified, false, `removing ${missing} still certified`);
      assert.match(verdict.verdicts[0]!.reason, /governance triad/i);
    }
  });

  test('a not-applicable stage is NOT certified, and is not a failure either', () => {
    const cap = trivialCapability();
    const stages = {
      ...cap.stages,
      execution: (ctx: unknown, emit: { notApplicable: (v: unknown, r: string) => unknown }) => {
        void ctx;
        return emit.notApplicable({}, 'nothing to execute for this run');
      },
    } as unknown as Capability['stages'];
    const outcome = runCapability({ ...cap, stages }, { tenantId: 't', runId: 'r', correlationId: 'c' });
    const verdict = certify(outcome.results);
    const executionGate = verdict.verdicts.find((v) => v.gate === 'execution-certified')!;
    // Certifying an absence would be certifying nothing.
    assert.equal(executionGate.certified, false);
    assert.match(executionGate.reason, /not applicable: nothing to execute/);
  });

  test('a REFUSED stage is not certified, and is reported distinctly from not-applicable (ADR-0071)', () => {
    const cap = trivialCapability();
    const stages = {
      ...cap.stages,
      execution: (ctx: unknown, emit: { refuse: (v: unknown, r: string) => unknown }) => {
        void ctx;
        return emit.refuse({}, 'the executed suite did not meet its acceptance threshold');
      },
    } as unknown as Capability['stages'];
    const outcome = runCapability({ ...cap, stages }, { tenantId: 't', runId: 'r', correlationId: 'c' });
    const verdict = certify(outcome.results);
    const executionGate = verdict.verdicts.find((v) => v.gate === 'execution-certified')!;
    assert.equal(executionGate.certified, false);
    // THE DISTINCTION IS THE WHOLE POINT. Before ADR-0071 a stage could only decline by
    // claiming it had done no work, so "the review failed" and "there was nothing to review"
    // arrived as one signal (D-019). A reader acting on them would act differently.
    assert.match(executionGate.reason, /^refused: the executed suite did not meet/);
    assert.doesNotMatch(executionGate.reason, /not applicable/);
    // `firstRefusal` finally denotes what it is named for.
    assert.equal(verdict.firstRefusal?.gate, 'execution-certified');
    // And the audit trail distinguishes all three, rather than folding refusal into absence.
    assert.ok(outcome.audit.some((e) => e.stage === 'execution' && e.event === 'stage.refused'));
  });

  test('EVERY governance-triad stage has a gate that reads its answer (ADR-0076 §4.1.1, D-066)', () => {
    // THE DEFECT THIS WAS WRITTEN AGAINST, and it was found by observation rather than by
    // reading: `certify()` checked the triad for PRESENCE (R-12.2, no bypass) and then rendered
    // verdicts by iterating CERTIFICATION_GATES — and `architecture-review` was in no gate's
    // GATE_STAGE. So stage 4 could do its work, say no, seal that answer, and the run certified.
    //
    // Measured before the repair, one triad stage refused per run, through the real runner:
    //   architecture-review -> outcome=refused  certified=TRUE   firstRefusal=null
    //   policy-review       -> outcome=refused  certified=false  firstRefusal=story-certified
    //   guardrail-review    -> outcome=refused  certified=false  firstRefusal=test-certified
    //
    // Identical with `notApplicable`, so the gap PREDATED ADR-0071 and was not created by it.
    // It is framework, so it held for all five implemented capabilities.
    //
    // ASSERTED OVER THE TRIAD RATHER THAN OVER `architecture-review` ALONE. Naming one stage
    // would prove the instance and not the property, and the property is what a fourth triad
    // stage — or a reordering — would need to keep. The gate map is the subject, not the value.
    for (const stage of GOVERNANCE_TRIAD) {
      assert.ok(
        Object.values(GATE_STAGE).includes(stage),
        `no certification gate reads ${stage} — its verdict cannot affect certification`,
      );
    }

    // And the property END-TO-END, because a map entry is a declaration and this is the
    // behaviour it exists to produce. A refusal at each triad stage must reach `certified`.
    for (const stage of GOVERNANCE_TRIAD) {
      const cap = trivialCapability();
      const stages = {
        ...cap.stages,
        [stage]: (ctx: unknown, emit: { refuse: (v: unknown, r: string) => unknown }) => {
          void ctx;
          return emit.refuse({ approved: false }, `${stage} did not approve the plan`);
        },
      } as unknown as Capability['stages'];
      const outcome = runCapability({ ...cap, stages }, { tenantId: 't', runId: `r-${stage}`, correlationId: 'c' });
      assert.equal(outcome.results.get(stage)?.outcome, 'refused', `${stage} did not seal a refusal`);
      const verdict = certify(outcome.results);
      assert.equal(verdict.certified, false, `a refusal at ${stage} still certified the run`);
      assert.ok(verdict.firstRefusal, `a refusal at ${stage} produced no firstRefusal`);
      assert.match(verdict.firstRefusal.reason, new RegExp(`refused: ${stage} did not approve`));
    }
  });

  test('a refusal REQUIRES a stated reason — a refusal without one has failed, not refused', () => {
    const cap = trivialCapability();
    const stages = {
      ...cap.stages,
      execution: (ctx: unknown, emit: { refuse: (v: unknown, r: string) => unknown }) => {
        void ctx;
        return emit.refuse({}, '   ');
      },
    } as unknown as Capability['stages'];
    // Same obligation `notApplicable` already carried: an unexplained outcome is how a stage
    // becomes invisible. A refusal with no reason is worse — it stops a run and says nothing.
    //
    // Asserted through the RUNNER's failure record, not `assert.throws`: the runner catches a
    // StageError and converts it to `failedAt`/`failure`, so a throwing assertion passes only
    // when the framework is broken in a different way. The first version of this test used
    // `assert.throws` and failed for exactly that reason — R-13.7 clause 2, a probe aimed at
    // the wrong mechanism, caught here by the probe rather than after it.
    const outcome = runCapability({ ...cap, stages }, { tenantId: 't', runId: 'r', correlationId: 'c' });
    assert.equal(outcome.failedAt, 'execution');
    assert.match(outcome.failure ?? '', /refusal requires a stated reason/);
    assert.ok(outcome.audit.some((e) => e.stage === 'execution' && e.event === 'stage.failed'));
  });

  test('the three stage outcomes are mutually exclusive by construction (ADR-0071)', () => {
    // A discriminated union rather than added booleans: `{applicable: false, refused: true}`
    // was representable and meaningless under the previous shape. This asserts the property
    // that replaced it — every result carries exactly one outcome, and a reason iff it is not `ok`.
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    for (const result of outcome.results.values()) {
      assert.ok(['ok', 'not-applicable', 'refused'].includes(result.outcome));
      if (result.outcome === 'ok') assert.equal(result.reason, null);
      else assert.ok(result.reason && result.reason.trim().length > 0);
    }
  });

  test('progression is ordered — a later gate cannot pass while an earlier one failed', () => {
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    const partial = new Map(outcome.results);
    partial.delete('execution');
    const verdict = certify(partial);
    assert.equal(progressedTo(verdict, 'story-certified'), true);
    assert.equal(progressedTo(verdict, 'release-certified'), false);
  });

  test('every verdict carries a reason', () => {
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    for (const v of certify(outcome.results).verdicts) assert.ok(v.reason.length > 0);
  });
});

describe('adapters — one workflow, variation only in providers (C-14.1)', () => {
  const project = (provider: string) => ({
    identity: { spi: 'ProjectAdapter', provider, version: '1.0.0' },
    containerNoun: provider === 'a' ? 'Test Plan' : 'Test Cycle',
    groupingNoun: provider === 'a' ? 'Test Suite' : 'Folder',
    fetchStory: () => ({ reached: true as const, value: { id: 's', title: 't', body: 'b', acceptanceCriteria: [] } }),
    linkRequirement: () => ({ linked: true as const, via: 'x' }),
  });

  test('the planning sequence is identical regardless of provider', () => {
    assert.equal(PLANNING_SEQUENCE.length, 8);
    assert.deepEqual([...PLANNING_SEQUENCE], [
      'story', 'requirement', 'container', 'grouping',
      'existing-tests', 'new-tests', 'traceability', 'execution-plan',
    ]);
  });

  test('resolution is by configuration, and an unknown provider is named', () => {
    const r = new AdapterRegistry();
    r.registerProject(project('a'));
    try {
      r.resolve({ 'project.provider': 'missing' });
      assert.fail('an unknown provider resolved');
    } catch (e) {
      assert.ok(e instanceof AdapterError);
      // Naming the key and what is available turns a support case into a fix.
      assert.match((e as Error).message, /missing/);
      assert.match((e as Error).message, /available: a/);
    }
  });

  test('providers differ in nouns, not in sequence', () => {
    assert.notEqual(project('a').containerNoun, project('b').containerNoun);
    assert.notEqual(project('a').groupingNoun, project('b').groupingNoun);
  });
});

describe('the agent contract', () => {
  test('an agent with no decision logic is refused', () => {
    const c = new AgentCatalogue();
    assert.throws(() => c.register(defineAgent({
      id: 'x.y', domain: 'x', purpose: 'a purpose long enough to pass', stage: 'planning',
      plane: 'IP', inputs: ['i'], outputs: ['o'], responsibilities: ['r'], toolContracts: [],
      aiCapabilityClass: 'none', failureHandling: 'a failure handling statement',
      handle: () => undefined,
    }) as never));
  });

  test('an agent cannot be registered twice', () => {
    const c = new AgentCatalogue();
    const a = defineAgent({
      id: 'x.y', domain: 'x', purpose: 'a purpose long enough to pass', stage: 'planning',
      plane: 'IP', inputs: ['i'], outputs: ['o'], responsibilities: ['r'], toolContracts: [],
      aiCapabilityClass: 'none', failureHandling: 'a failure handling statement',
      handle: (i: unknown) => i,
    }) as never;
    c.register(a);
    assert.throws(() => c.register(a));
  });

  test('a transient failure is retried up to the declared maximum', () => {
    const c = new AgentCatalogue();
    let attempts = 0;
    c.register(defineAgent({
      id: 'x.flaky', domain: 'x', purpose: 'fail twice then succeed, to exercise retry',
      stage: 'planning', plane: 'IP', inputs: ['i'], outputs: ['o'], responsibilities: ['r'],
      toolContracts: [], aiCapabilityClass: 'none',
      retry: { maxAttempts: 3, retryOn: 'transient' },
      failureHandling: 'reported after the declared attempts are exhausted',
      handle: (i: unknown) => { attempts += 1; if (attempts < 3) throw new Error('transient'); return i; },
    }) as never);

    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };
    assert.deepEqual(c.invoke('x.flaky', { ok: true }, ctx), { ok: true });
    assert.equal(attempts, 3);
  });

  // G-5. Before this, `invoke` built its message as `${failureHandling} (last error: …)`, so
  // every internal fault in every agent was announced as that agent's DECLARED failure mode
  // and the truth arrived in a trailing clause. Asserted by CONTENT AND ORDER, because the
  // defect was never that the cause was absent — it was present and subordinate.
  test('a TypeError surfaces as a TypeError, not as the declared failure mode', () => {
    const c = new AgentCatalogue();
    const DECLARED = 'A scope whose evidence is absent is UNREVIEWABLE and not approved.';
    c.register(defineAgent({
      id: 'x.faulty', domain: 'x', purpose: 'throw a genuine programming fault, not a domain error',
      stage: 'planning', plane: 'IP', inputs: ['i'], outputs: ['o'], responsibilities: ['r'],
      toolContracts: [], aiCapabilityClass: 'none',
      retry: { maxAttempts: 1, retryOn: 'never' },
      failureHandling: DECLARED,
      // A real TypeError: the property read that produced G-5 in the first place.
      handle: (i: { missing?: { filter: () => void } }) => (i.missing as { filter: () => void }).filter(),
    }) as never);

    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };

    // Not assert.throws: the earlier instance of this class passed while asserting nothing,
    // because the matcher caught a wrapper type and never inspected the message.
    let message: string | null = null;
    try {
      c.invoke('x.faulty', {}, ctx);
    } catch (e) {
      message = (e as Error).message;
    }

    assert.notEqual(message, null, 'invoke must throw when handle throws');
    // `AgentError` prefixes the agent id, which is correct and stays: an operator needs to
    // know WHICH agent faulted before knowing how. The property under test is what comes
    // after that prefix — the first EXPLANATION offered must be the fact, not the intent.
    assert.ok(message!.startsWith('agent x.faulty: TypeError:'),
      `the fact must lead the explanation; message began "${message!.slice(0, 70)}"`);
    assert.ok(!message!.includes(`x.faulty: ${DECLARED}`),
      'the declaration must not lead — that is the defect this proves absent');
    // The declaration is still carried, and is still useful: it says what the author
    // intended to happen. It just no longer claims to be what did happen.
    assert.ok(message!.includes(`declared handling: ${DECLARED}`),
      'the declaration must follow, labelled as a declaration');
    assert.ok(message!.indexOf('TypeError:') < message!.indexOf(DECLARED),
      'the cause must precede the declaration');
  });

  test('the catalogue reports agents by stage and by domain', () => {
    const c = new AgentCatalogue();
    c.register(defineAgent({
      id: 'd.one', domain: 'd', purpose: 'a purpose long enough to pass', stage: 'reflection',
      plane: 'IP', inputs: ['i'], outputs: ['o'], responsibilities: ['r'], toolContracts: [],
      aiCapabilityClass: 'none', failureHandling: 'a failure handling statement',
      handle: (i: unknown) => i,
    }) as never);
    assert.equal(c.byDomain('d').length, 1);
    assert.equal(c.byStage('reflection').length, 1);
    assert.equal(c.byStage('planning').length, 0);
    assert.deepEqual(c.domains, ['d']);
  });
});

describe('audit', () => {
  test('every stage contributes to the audit trail', () => {
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    for (const s of STAGES) {
      assert.ok(outcome.audit.some((e) => e.stage === s), `no audit entry for ${s}`);
    }
  });

  test('the audit trail survives a failed run', () => {
    const cap = trivialCapability();
    const stages = { ...cap.stages, evidence: (ctx: unknown) => { void ctx; throw new Error('boom'); } } as unknown as Capability['stages'];
    const outcome = runCapability({ ...cap, stages }, { tenantId: 't', runId: 'r', correlationId: 'c' });
    // The record of what happened is the one thing that must not be lost on failure.
    assert.ok(outcome.audit.some((e) => e.event === 'stage.failed'));
    assert.ok(outcome.audit.length > 0);
  });

  test('a stage value is readable through valueOf', () => {
    const outcome = runCapability(trivialCapability(), { tenantId: 't', runId: 'r', correlationId: 'c' });
    assert.deepEqual(valueOf(outcome.results.get('planning')!), { stage: 'planning' });
  });
});
