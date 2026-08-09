'use strict';
/**
 * GOVERNANCE — deployment currency.
 * ============================================================================
 * Answers the question no instrument in this programme could ask:
 *
 *     **IS THIS THE COMMIT THE DEPLOYMENT SERVES?**
 *
 * D-144: four "is done" claims were true of a commit and false of the running system, and every
 * gate agreed with them, because every gate reads the WORKING TREE and was correct about it.
 * CHARTER §3 makes git history the fact against a state file's claim — and here the history AGREED
 * with the claim, and both were about something other than what serves traffic.
 *
 * ── IT DOES NOT READ `origin/main`, AND THAT IS THE WHOLE DESIGN ─────────────────────────────────
 *
 * `git rev-parse origin/main` vs `HEAD` is one line and would have caught the instance. It is still
 * the wrong check, by this programme's own rule:
 *
 *   **CHARTER §17.1.1, the subject-removal test** — of every property a control asserts, ask: if its
 *   SUBJECT were removed, would this property turn RED or GREEN? A `HEAD == origin/main` check
 *   **goes GREEN when nothing is deployed at all.** It is satisfied *by* the absence of a
 *   deployment. It measures PUSHED, and pushed is not served.
 *
 * It also reads a remote-tracking ref only as fresh as the last `fetch` — a check that cannot
 * distinguish a stale answer from a current one, which is D-107's class.
 *
 * ── IT DOES NOT DIAL THE DEPLOYMENT EITHER, AND THAT IS NOT A COMPROMISE ─────────────────────────
 *
 * **The first version of this gate called `fetch`, and EG-2 caught it in the same run it was
 * written**: *no Intelligence-Plane source opens an outbound connection* (R-3.2, R-6.3, R-14.16).
 * The allowlist would have taken it — file, host, rationale — and **an allowlist entry was the wrong
 * repair.** Two reasons, and only the first is about the invariant:
 *
 *   1. **The rule is right and the gate was wrong.** Nothing in this plane dials out; a gate is not
 *      a special case, and a control that needs the invariant relaxed to run is a control arguing
 *      with its own subject.
 *   2. **Every other gate here is DETERMINISTIC AND OFFLINE, and this one had stopped being either.**
 *      A network-dependent gate cannot run in an offline CI at all, and a transport blip and real
 *      drift arrive at the same function — discriminable, but only by code that would not exist if
 *      the gate simply did not dial.
 *
 * **So the OBSERVATION is an input.** Whoever can reach the deployment — the pipeline, an operator,
 * one line of `curl` — records what it said; this gate decides what that means. The measuring and
 * the judging are separated, which is the same split `undistributed()`/`publishWorkPaths()` makes
 * for a different reason: the party that may ASK is not always the party that may ACT.
 *
 * ── THREE OUTCOMES, NEVER TWO, AND THE STANDING RULE IS WHY ─────────────────────────────────────
 *
 *   > Any type that represents "could not reach it" and "it said no" with one value has discarded
 *   > the only fact the caller needs: whether to retry or to stop.
 *
 * The observation therefore records `reached` SEPARATELY from what was read, and this gate reports
 * unreachable, unauthorised, absent-route, unknown-commit and mismatch as five distinct findings.
 *
 * **AND NO ABSENCE SATISFIES IT.** A missing observation file FAILS. An observation is the subject;
 * a gate that passed when nobody measured would go green in exactly the case it exists to catch —
 * §17.1.1 applied to this gate itself.
 *
 * ── A DIVERGENCE IS NOT AUTOMATICALLY A FAULT ───────────────────────────────────────────────────
 *
 * Work in progress is normal and this gate is not in the default suite. What is a fault is an
 * unqualified "IS MOUNTED" written over a divergence — a property of the state file, not of the git
 * graph, which is why the standing rule requires a claim of LIVE to name the deployed commit or say
 * "committed, not deployed".
 *
 * ── HOW TO PRODUCE THE OBSERVATION (outside this plane) ─────────────────────────────────────────
 *
 *   curl -sS -m 30 -H "authorization: Bearer $TOKEN" "$BASE/api/version" \
 *     -o body.json -w '{"reached":true,"status":%{http_code}}' > meta.json
 *   # then: {"reached":true,"status":<code>,"body":<body.json, or null>}
 *   # transport failure (non-zero curl exit) is: {"reached":false,"why":"<message>"}
 *
 * Run:  node governance/verification/verify-deployment-currency.js <observation.json>
 *       DBIZ_DEPLOYMENT_OBSERVATION is read when the argument is absent.
 * Exit: 0 = the deployment serves this commit   1 = it does not, or was not measured
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const observationPath = process.argv[2] ?? process.env.DBIZ_DEPLOYMENT_OBSERVATION ?? '';

let failures = 0;
const line = (s) => console.log(s);
const check = (label, ok, detail) => {
  line(`  ${ok ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!ok) failures++;
};

line('');
line('GOVERNANCE — deployment currency (D-144)');
line('='.repeat(90));

/** Local HEAD — the commit this working tree is at. The claim being tested against the deployment. */
function localHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
}

/**
 * Read the observation.
 *
 * `null` means NOT MEASURED, which is distinct from every state the deployment could be in, and is
 * the one this gate must never treat as satisfied.
 */
function readObservation(p) {
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

const seen = readObservation(observationPath);

if (seen === null) {
  check('a deployment observation was supplied', false,
    observationPath
      ? `${observationPath} is absent or unreadable. NOT MEASURED is not a pass: this gate cannot be ` +
        'satisfied by failing to look, which is the case it exists to catch.'
      : 'no observation file. Pass one, or set DBIZ_DEPLOYMENT_OBSERVATION. See the header for the ' +
        'one-line curl that produces it — the fetch happens OUTSIDE this plane (EG-2).');
} else {
  const head = localHead();

  if (seen.reached !== true) {
    check('the deployment answered', false,
      `unreachable (${seen.why ?? 'no reason recorded'}). UNAVAILABILITY, not a mismatch — but it ` +
      'FAILS: a deployment that cannot be reached is not one this programme may claim capability on.');
  } else if (seen.status === 401 || seen.status === 403) {
    check('the observer was authorised to ask', false,
      `/api/version returned ${seen.status}. The route is mounted and the observer had no credential. ` +
      'Distinguished from unreachable deliberately: the deployment answered, and what it said was no.');
  } else if (seen.status === 404) {
    check('the deployment reports its build commit', false,
      '/api/version returned 404. The deployed image PREDATES this mechanism — which is itself the ' +
      'D-144 answer: an instance that cannot say what it was built from is not current.');
  } else if (!seen.body || seen.body.known !== true) {
    check('the deployment knows its build commit', false,
      `answered ${seen.status} with ${JSON.stringify(seen.body)}. Built without BUILD_COMMIT, so it ` +
      'cannot say what it serves. Its own kind, not a mismatch — "I do not know" and "I am behind" ' +
      'are different facts.');
  } else {
    const deployed = String(seen.body.commit).toLowerCase();
    check('the deployment serves this commit', deployed === head,
      deployed === head
        ? `both at ${head.slice(0, 12)}…`
        : `deployed ${deployed.slice(0, 12)}… · local HEAD ${head.slice(0, 12)}… — the working tree ` +
          'is NOT what serves traffic. Any state-file claim that a capability is live is a claim ' +
          'about the deployed commit, not this one.');
  }
}

line('');
line('='.repeat(90));
line(failures === 0
  ? 'RESULT: PASS — the deployment serves this commit.'
  : `RESULT: FAIL — ${failures} check(s) failed. "Committed" is not "deployed".`);
line('='.repeat(90));
process.exitCode = failures === 0 ? 0 : 1;
