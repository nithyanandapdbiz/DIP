/**
 * Execution package, evidence and assurance contracts.
 * TRACEABILITY: 20 §2-3 · 10 · 05 §4 · ADR-0004, ADR-0007, ADR-0015
 * Criteria: C-20.6, C-20.7, C-20.8, C-20.10, C-05.6, C-05.7, C-10.10, C-10.11, C-10.12, C-22.1
 * Categories: contract, negative, compatibility, cross-plane, security
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExecutionPackage, ExecutionPackageSchema, hashableContent,
} from '../src/execution-package.js';
import { parseEvidenceReference, statusAt } from '../src/evidence.js';
import { parseDetachedSignature, signatureMatchesProvenance } from '../src/signature.js';
import { admitForCertification, isCertifiable, ASSURANCE_STATES } from '../src/assurance.js';
import { hash, verify } from '../src/integrity.js';
import { CONTRACT_VERSION, isSupported, majorOf } from '../src/version.js';

const digest = {
  algorithm: 'sha256-jcs-v1' as const,
  domain: 'dbiz.execution-package@1' as const,
  value: 'a'.repeat(64),
};

function validPackage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: CONTRACT_VERSION,
    runId: 'run-1',
    correlationId: 'corr-1',
    capabilityId: 'functional-testing',
    proceed: true,
    operations: [{ operationId: 'op-1', kind: 'browser.navigate', parameters: { url: 'https://x' } }],
    directives: { timeoutMs: 30_000, maxAttempts: 3, maxConcurrency: 4, mode: 'live' },
    gates: [{ gateId: 'g-1', expression: 'all(steps.passed)' }],
    evidenceRequirements: [{ requirementId: 'r-1', classification: 'C1', required: true }],
    provenance: {
      authoredBy: 'ip-authoring',
      tenantId: 'tenant-a',
      authoredAt: '2026-07-22T10:00:00Z',
      contractVersion: CONTRACT_VERSION,
      signingKeyId: 'key-1',
      contentHash: digest,
    },
    validity: {
      notBefore: '2026-07-22T10:00:00Z',
      notAfter: '2026-07-22T11:00:00Z',
      reusableWhileUnavailable: true,
    },
    ...overrides,
  };
}

describe('execution package contract', () => {
  test('accepts a well-formed package', () => {
    assert.doesNotThrow(() => parseExecutionPackage(validPackage()));
  });

  test('all seven required elements are mandatory (R-20.6)', () => {
    for (const element of [
      'operations', 'directives', 'gates', 'evidenceRequirements', 'provenance', 'validity',
    ]) {
      const pkg = validPackage();
      delete pkg[element];
      let threw = false;
      try { parseExecutionPackage(pkg); } catch { threw = true; }
      assert.equal(threw, true, `${element} should be required`);
    }
  });

  test('a message without a contract version is rejected, not guessed (C-20.6)', () => {
    const pkg = validPackage();
    delete pkg['contractVersion'];
    assert.throws(() => parseExecutionPackage(pkg));
  });

  test('an unsupported contract version is refused explicitly, never reinterpreted', () => {
    assert.throws(
      () => parseExecutionPackage(validPackage({ contractVersion: '99.0.0' })),
      /unsupported contract version/,
    );
  });

  test('unknown fields survive parsing so a newer producer cannot break an older consumer (C-20.7)', () => {
    const parsed = parseExecutionPackage(validPackage({ futureField: { added: 'later' } }));
    assert.deepEqual((parsed as Record<string, unknown>)['futureField'], { added: 'later' });
  });

  test('unknown nested fields survive a full round-trip unmodified (C-20.7)', () => {
    const input = validPackage({ futureField: { a: [1, 2, { b: 'c' }] } });
    const roundTripped = parseExecutionPackage(JSON.parse(JSON.stringify(parseExecutionPackage(input))));
    assert.deepEqual((roundTripped as Record<string, unknown>)['futureField'], { a: [1, 2, { b: 'c' }] });
  });

  test('refusal requires a reason — proceed:false cannot be silent', () => {
    assert.throws(() => parseExecutionPackage(validPackage({ proceed: false })));
    assert.doesNotThrow(() =>
      parseExecutionPackage(validPackage({ proceed: false, refusalReason: 'tenant suspended' })));
  });

  test('the content hash excludes itself, so a package is self-verifiable (C-20.8)', () => {
    const pkg = parseExecutionPackage(validPackage());
    const content = hashableContent(pkg);
    assert.equal('contentHash' in (content['provenance'] as object), false);
    const computed = hash('dbiz.execution-package@1', content);
    assert.equal(verify(computed, hashableContent(pkg)).ok, true);
  });

  test('mutating any field changes the content hash (C-20.8, tampering)', () => {
    const pkg = parseExecutionPackage(validPackage());
    const original = hash('dbiz.execution-package@1', hashableContent(pkg));
    const tampered = parseExecutionPackage(validPackage({ capabilityId: 'penetration-testing' }));
    assert.equal(verify(original, hashableContent(tampered)).ok, false);
  });

  test('directives reject non-positive timeout and concurrency (no unbounded stage)', () => {
    assert.throws(() => parseExecutionPackage(validPackage({
      directives: { timeoutMs: 0, maxAttempts: 1, maxConcurrency: 1, mode: 'live' },
    })));
    assert.throws(() => parseExecutionPackage(validPackage({
      directives: { timeoutMs: 1, maxAttempts: 1, maxConcurrency: 0, mode: 'live' },
    })));
  });

  test('mode is closed to live and dry-run', () => {
    assert.throws(() => parseExecutionPackage(validPackage({
      directives: { timeoutMs: 1, maxAttempts: 1, maxConcurrency: 1, mode: 'sandbox' },
    })));
  });

  test('validity is mandatory, so an unbounded package is unrepresentable (C-22.1)', () => {
    const pkg = validPackage();
    delete (pkg['validity'] as Record<string, unknown>)['notAfter'];
    assert.throws(() => ExecutionPackageSchema.parse(pkg));
  });
});

describe('evidence contract', () => {
  const evidenceDigest = { ...digest, domain: 'dbiz.evidence-record@1' as const };

  function validEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      contractVersion: CONTRACT_VERSION,
      evidenceId: 'ev-1',
      packageHash: digest,
      contentHash: evidenceDigest,
      classification: 'C1',
      capturedAt: '2026-07-22T10:30:00Z',
      expiresAt: '2027-07-22T10:30:00Z',
      assuranceState: 'CERTIFIED',
      outcome: 'captured',
      ...overrides,
    };
  }

  test('every record binds to its producing package hash (C-20.10, C-10.7)', () => {
    const ref = parseEvidenceReference(validEvidence());
    assert.deepEqual(ref.packageHash, digest);
    const missing = validEvidence();
    delete missing['packageHash'];
    assert.throws(() => parseEvidenceReference(missing));
  });

  test('no record is constructible without an assurance state (C-05.6)', () => {
    const missing = validEvidence();
    delete missing['assuranceState'];
    assert.throws(() => parseEvidenceReference(missing));
  });

  test('capture failure is distinguishable from empty (C-10.10)', () => {
    const empty = parseEvidenceReference(validEvidence({ outcome: 'empty' }));
    const failed = parseEvidenceReference(validEvidence({ outcome: 'failed', reason: 'driver crashed' }));
    const notApplicable = parseEvidenceReference(
      validEvidence({ outcome: 'not-applicable', reason: 'capability has no DOM' }),
    );
    assert.notEqual(empty.outcome, failed.outcome);
    assert.notEqual(failed.outcome, notApplicable.outcome);
  });

  test('a failed or not-applicable outcome requires a reason', () => {
    assert.throws(() => parseEvidenceReference(validEvidence({ outcome: 'failed' })));
    assert.throws(() => parseEvidenceReference(validEvidence({ outcome: 'not-applicable' })));
  });

  test('an expired reference reports as expired, not missing or tampered (C-10.12)', () => {
    const ref = parseEvidenceReference(validEvidence({ expiresAt: '2026-07-01T00:00:00Z' }));
    assert.equal(statusAt(ref, new Date('2026-07-22T00:00:00Z')), 'expired');
    assert.equal(statusAt(ref, new Date('2026-06-01T00:00:00Z')), 'available');
  });
});

describe('assurance state', () => {
  test('only CERTIFIED is certifiable (C-05.7, C-10.11)', () => {
    for (const state of ASSURANCE_STATES) {
      assert.equal(isCertifiable(state), state === 'CERTIFIED');
    }
  });

  test('the certification interface refuses every degraded state', () => {
    for (const state of ASSURANCE_STATES) {
      const admission = admitForCertification(state);
      if (state === 'CERTIFIED') {
        assert.equal(admission.admitted, true);
      } else {
        assert.equal(admission.admitted, false, `${state} must not be admitted`);
        assert.equal(admission.admitted === false && admission.reason, 'not-certifiable');
      }
    }
  });
});

describe('version compatibility (C-20.12)', () => {
  test('the declared contract version is supported by this build', () => {
    assert.equal(isSupported(CONTRACT_VERSION), true);
  });

  test('every supported major is accepted and unsupported majors are refused', () => {
    assert.equal(isSupported('1.4.2'), true, 'a later minor within a supported major must parse');
    assert.equal(isSupported('2.0.0'), false);
    assert.equal(isSupported('not-a-version'), false);
    assert.equal(majorOf('1.2.3'), 1);
    assert.equal(majorOf('bad'), null);
  });

  /**
   * THE TEST ABOVE ASSERTED THE PREDICATE. NOTHING ASSERTED ITS EFFECT ON THE PARSER, AND THE TWO
   * DISAGREED — `isSupported('1.4.2')` was `true` while `parseExecutionPackage` threw on exactly
   * that input, inside one package, indefinitely, with the suite green (debt D-118).
   *
   * These assert the PARSER, which is the thing R-20.24 and R-19.11 actually constrain. A
   * predicate nothing consumes constrains nothing.
   */
  test('D-118: the PARSER accepts a later minor within a supported major, not only the predicate', () => {
    const later = validPackage({ contractVersion: '1.4.2' });
    assert.doesNotThrow(() => parseExecutionPackage(later),
      'an Execution Plane older than this build must still be parseable (R-19.11, R-20.24)');
    assert.equal(parseExecutionPackage(later).contractVersion, '1.4.2',
      'the parsed version is the CALLER\'s, never rewritten to this build\'s — that would be the silent reinterpretation R-20.1 forbids');
  });

  test('D-118: the parser and the predicate agree on every case the predicate is tested with', () => {
    // The disagreement is impossible to reintroduce silently: every input the predicate is
    // asserted on is asserted against the parser too, in the same test file.
    for (const [version, supported] of [
      [CONTRACT_VERSION, true], ['1.0.0', true], ['1.4.2', true],
      ['2.0.0', false], ['0.9.0', false], ['not-a-version', false],
    ] as const) {
      const pkg = validPackage({ contractVersion: version });
      let parserAccepted = true;
      try { parseExecutionPackage(pkg); } catch { parserAccepted = false; }
      assert.equal(parserAccepted, isSupported(version) && supported,
        `parser and predicate disagree on "${version}" — this is exactly D-118`);
    }
  });

  test('an unsupported MAJOR is still refused explicitly, and the message names what is supported', () => {
    assert.throws(() => parseExecutionPackage(validPackage({ contractVersion: '2.0.0' })),
      /unsupported contract version "2\.0\.0".*major/s,
      'a major bump is where meaning may change, so it is refused rather than reinterpreted (R-20.1)');
  });
});

// ── D-123 link 1 / ruling 1 — ONE detached-signature shape ───────────────────────────────────
//
// There were TWO types for this concept and they shared NO field name on the two that matter:
//   SignatureEnvelope { signature, signingKeyId, algorithm }   functional-testing-engine
//   DetachedSignature { value,     keyId,        algorithm }   tenant-onboarding-engine
// They could drift because neither was declared here, and because NOTHING HAD EVER CARRIED A
// SIGNATURE ACROSS THE BOUNDARY — so nothing could disagree. These properties are what makes the
// convergence checkable rather than remembered.
describe('the detached signature — one shape, declared in the contract', () => {
  const valid = { algorithm: 'ed25519' as const, keyId: 'sig-1', value: 'c2ln' };

  test('CONTROL — a well-formed signature parses', () => {
    const s = parseDetachedSignature(valid);
    assert.equal(s.keyId, 'sig-1');
    assert.equal(s.value, 'c2ln');
  });

  test('an UNKNOWN algorithm is refused, never carried through as opaque', () => {
    assert.throws(() => parseDetachedSignature({ ...valid, algorithm: 'rsa-pss' }));
  });

  // THE OLD SHAPE IS NOT SILENTLY ACCEPTED. Passthrough admits unknown fields (R-20.4) — which is
  // correct and is exactly why this needs asserting: a `SignatureEnvelope`-shaped object carries
  // extra fields AND is missing the required ones, so it must fail on the ABSENCE rather than pass
  // on the extras.
  test('the retired SignatureEnvelope shape is REFUSED, not passed through', () => {
    assert.throws(() => parseDetachedSignature({ signature: 'c2ln', signingKeyId: 'sig-1', algorithm: 'ed25519' }));
  });

  test('additive fields still survive — passthrough is preserved (R-20.4, C-20.7)', () => {
    const s = parseDetachedSignature({ ...valid, signedAt: '2026-08-06T00:00:00Z' }) as Record<string, unknown>;
    assert.equal(s['signedAt'], '2026-08-06T00:00:00Z');
  });

  // THE AGREEMENT IS A PREDICATE, NOT A SHARED FIELD NAME. The previous design encoded it by
  // spelling one type's field `signingKeyId` to match the package's provenance — which is not a
  // check: two fields with one name still hold two values, and nothing compared them.
  test('signatureMatchesProvenance compares the two values rather than their spellings', () => {
    assert.equal(signatureMatchesProvenance(valid, { signingKeyId: 'sig-1' }), true);
    assert.equal(signatureMatchesProvenance(valid, { signingKeyId: 'sig-2' }), false);
  });
});
