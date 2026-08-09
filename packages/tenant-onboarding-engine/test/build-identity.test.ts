/**
 * BUILD IDENTITY — the commit this artefact was built from.
 *
 * TRACEABILITY: D-144 (four "is done" claims true of a commit and false of the running system) ·
 *   CHARTER §17.1.1 (the subject-removal test) · the standing rule *a green suite over an unpushed
 *   commit measures a private artefact*.
 *   Proves: an artefact that does not know what it was built from SAYS SO, and cannot be mistaken
 *           for one that does. Categories: contract, regression
 *
 * **THE PROPERTY UNDER TEST IS THE `unknown` CASE, NOT THE HAPPY ONE.** A gate consumes this value
 * to decide whether a deployment is current; if a dev container, a build with no `--build-arg`, and
 * an unsubstituted `${BUILD_COMMIT}` were reported as commits, the gate would report them as up to
 * date. *"I was not built from a commit"* and *"I was built from commit X"* are different facts and
 * the type must keep them apart — the reach-versus-refusal rule at a build boundary.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentity } from '../src/engine/index.js';

const SHA = 'c0c3772aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('build identity reports what the artefact was built from, or says it does not know', () => {
  test('a baked 40-hex sha is reported, lower-cased', () => {
    assert.deepEqual(buildIdentity({ DBIZ_BUILD_COMMIT: SHA.toUpperCase() }), { commit: SHA, known: true });
  });

  test('an ABSENT value is unknown — not empty, not guessed', () => {
    assert.deepEqual(buildIdentity({}), { commit: 'unknown', known: false });
  });

  test('an UNSUBSTITUTED build arg is unknown, which is the realistic failure', () => {
    // A Dockerfile whose ARG never received a --build-arg, or a shell that did not expand it.
    for (const raw of ['${BUILD_COMMIT}', 'unknown', '', '   ']) {
      assert.equal(buildIdentity({ DBIZ_BUILD_COMMIT: raw }).known, false, `"${raw}" must not read as a commit`);
    }
  });

  test('an ABBREVIATED sha is unknown — a 7-char tag is not an identity', () => {
    // deploy-api.yml slices the sha to 7 for the IMAGE TAG. If that value ever reached this variable
    // it would compare unequal to every local HEAD and the gate could not explain why.
    assert.equal(buildIdentity({ DBIZ_BUILD_COMMIT: 'c0c3772' }).known, false);
  });

  test('a non-hex value of the right length is unknown', () => {
    assert.equal(buildIdentity({ DBIZ_BUILD_COMMIT: 'z'.repeat(40) }).known, false);
  });

  test('the environment is a PARAMETER, so reading it cannot depend on test order', () => {
    // Mutating process.env to exercise this would leak across tests in the same process and make the
    // state being reported depend on execution order — the defect, inside the check for it.
    assert.deepEqual(buildIdentity({ DBIZ_BUILD_COMMIT: SHA }), { commit: SHA, known: true });
    assert.deepEqual(buildIdentity({}), { commit: 'unknown', known: false });
  });
});
