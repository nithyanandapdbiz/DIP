/**
 * THE PUBLICATION GATE — conformance and its fault proof (ADR-0082 severance 3).
 *
 * THE POSITIVE CONTROL IS FIRST AND IS NOT OPTIONAL. A suite in which every case refuses proves
 * that something refuses, not that this gate discriminates — and a gate written to produce "no" is
 * confirmed by any "no". Both legs, or the gate is a shape.
 *
 * TRACEABILITY: ADR-0082 (severance 3) · CHARTER §17.1 (`NOT MEASURED` is never a pass) ·
 *   §17.1.1 (subject removal) · R-13.7 clause 2 (the branch under test is named) · D-019.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decidePublication } from '../src/publication-admissibility.js';
import { GOVERNANCE_TRIAD } from '../src/stages.js';
import type { CertificationOutcome, Verdict, VerdictDisposition } from '../src/certification.js';

type TriadStage = (typeof GOVERNANCE_TRIAD)[number];

/** A triad verdict with the disposition under test. Non-triad gates are irrelevant here by design. */
const leg = (stage: Verdict['stage'], disposition: VerdictDisposition): Verdict => ({
  gate: 'release-certified',
  stage,
  disposition,
  certified: disposition === 'judged',
  reason: `${stage}: ${disposition}`,
});

const outcomeWith = (dispositions: Readonly<Record<string, VerdictDisposition>>): CertificationOutcome => {
  const verdicts = GOVERNANCE_TRIAD
    .filter((s) => dispositions[s] !== undefined)
    .map((s) => leg(s, dispositions[s]!));
  const firstRefusal = verdicts.find((v) => !v.certified) ?? null;
  return { verdicts, certified: firstRefusal === null, firstRefusal };
};

const judgedAll = (): Record<string, VerdictDisposition> =>
  Object.fromEntries(GOVERNANCE_TRIAD.map((s) => [s, 'judged' as VerdictDisposition]));

describe('publication admissibility — the governance-triad gate', () => {
  // ── THE POSITIVE CONTROL ────────────────────────────────────────────────────────────────────
  test('CONTROL — all three legs judged: ADMISSIBLE, and every leg is carried', () => {
    const d = decidePublication(outcomeWith(judgedAll()));
    assert.equal(d.admissible, true, d.reason);
    assert.equal(d.judged, 3);
    assert.equal(d.unjudged, 0);
    assert.equal(d.basis, 'governance-triad');
    // CONDITION 2: the per-leg fact travels WITH the decision, not beside it.
    assert.equal(d.legs.length, 3);
    assert.deepEqual([...d.legs].map((l) => l.stage).sort(), [...GOVERNANCE_TRIAD].sort());
    assert.ok(d.legs.every((l) => l.disposition === 'judged'));
  });

  // ── THE FAULT PROOF, LEG BY LEG. Each names the branch it fires (R-13.7 clause 2). ─────────
  //
  // CONDITION 1: `not-applicable` is NEVER approval. CHARTER §17.1 — `NOT MEASURED` is never a
  // pass — and admitting on it would make the gate satisfied BY THE ABSENCE of its subject, which
  // is §17.1.1's control-shaped literal exactly.
  for (const stage of GOVERNANCE_TRIAD as readonly TriadStage[]) {
    test(`FAULT — ${stage} returns not-applicable: NOT admissible`, () => {
      const d = decidePublication(outcomeWith({ ...judgedAll(), [stage]: 'not-applicable' }));
      assert.equal(d.admissible, false, d.reason);
      assert.equal(d.judged, 2);
      assert.equal(d.unjudged, 1);
      assert.match(d.reason, new RegExp(`${stage} \\(not-applicable\\)`));
      // The three non-judged dispositions stay DISTINGUISHABLE even though they agree here:
      // they are different facts, and a reader acting on them would act differently.
      assert.equal(d.legs.find((l) => l.stage === stage)!.disposition, 'not-applicable');
    });

    test(`FAULT — ${stage} is ABSENT from the outcome entirely: NOT admissible`, () => {
      const dispositions = judgedAll();
      delete dispositions[stage];
      const d = decidePublication(outcomeWith(dispositions));
      assert.equal(d.admissible, false, d.reason);
      // A MISSING VERDICT PRODUCES A LEG, NOT A GAP. The record is enumerated from the TRIAD, not
      // from what happened to be reported — so a stage nobody rendered a verdict for cannot vanish
      // from the count and read as "nothing wrong".
      assert.equal(d.legs.length, 3);
      assert.equal(d.legs.find((l) => l.stage === stage)!.disposition, 'absent');
    });

    test(`FAULT — ${stage} REFUSED: NOT admissible, and reported as refused rather than absent`, () => {
      const d = decidePublication(outcomeWith({ ...judgedAll(), [stage]: 'refused' }));
      assert.equal(d.admissible, false, d.reason);
      assert.equal(d.legs.find((l) => l.stage === stage)!.disposition, 'refused');
    });
  }

  test('an EMPTY outcome is NOT admissible — the gate fails closed on nothing at all', () => {
    // NOTE the input: `certified: true` with NO verdicts. A gate reading only that boolean would
    // ADMIT. This is the subject-removal test applied to the gate itself — remove its subject and
    // it must turn RED, not green.
    const d = decidePublication({ verdicts: [], certified: true, firstRefusal: null });
    assert.equal(d.admissible, false, d.reason);
    assert.equal(d.unjudged, 3);
  });

  // ── CONDITION 3, ASSERTED AS A PROPERTY RATHER THAN LEFT TO REVIEW ─────────────────────────
  //
  // The triad reviews PRESENCE, not SOUNDNESS (D-019). ADMISSIBLE means the plane has not found a
  // reason to refuse; CERTIFIED would mean it established soundness. A weak gate wearing a strong
  // gate's name is the whole defect class in one word choice, so the word is tested rather than
  // trusted to review.
  test('CONDITION 3 — the decision never claims certification, in any field or message', () => {
    const decisions = [
      decidePublication(outcomeWith(judgedAll())),
      decidePublication({ verdicts: [], certified: true, firstRefusal: null }),
    ];
    for (const d of decisions) {
      assert.ok(!('certified' in d), 'the decision exposes a `certified` field');
      assert.doesNotMatch(d.reason, /\bcertifie[sd]\b/i, `the reason claims certification: ${d.reason}`);
      assert.match(d.reason, /admissible/i);
    }
  });
});
