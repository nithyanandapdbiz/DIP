/**
 * BUILD IDENTITY — the commit this process was built from, and the ONE place it is read.
 *
 * TRACEABILITY
 *   Debt         : D-144 (four "is done" claims true of a commit and false of the running system)
 *   Charter      : §17.1.1 (the subject-removal test) · §3 (state files are claims, disk is fact)
 *   Architecture : 17-deployment-topology.md (the image is the deployable artefact)
 *
 * ══ WHY THIS EXISTS AT ALL ═════════════════════════════════════════════════════════════════════
 *
 * Every instrument this programme runs — build, suite, governance, every gate — reads the WORKING
 * TREE. They are correct about it, and that correctness was the problem: a green measurement of an
 * artefact nobody can reach is indistinguishable, in every register kept here, from a green
 * measurement of the running system. **The missing question was "is this the commit the deployment
 * serves?", and nothing could ask it because the running system never said.**
 *
 * The pipeline has ALWAYS known the answer — `deploy-api.yml` derives the image tag from
 * `BUILD_SOURCEVERSION`. The value existed and stopped at the image boundary. This carries it one
 * step further, into the process, so the question becomes answerable rather than inferable.
 *
 * ══ WHY IT IS NOT DERIVED, LOOKED UP, OR GUESSED ═══════════════════════════════════════════════
 *
 * **It is BAKED AT IMAGE BUILD and read from the environment exactly once.** It is not read from
 * `.git` (which is not in the image, by design — C-17.4), not fetched, and not inferred from a
 * version string in a manifest. A value that could be recomputed at runtime would answer *"what does
 * this process think it is?"* instead of *"what was this artefact built from?"*, and those differ in
 * precisely the case the whole mechanism exists for.
 *
 * ══ `unknown` IS A FIRST-CLASS ANSWER, AND IT IS NOT AN ERROR ══════════════════════════════════
 *
 * A locally-run process, a dev container and a `docker build` with no `--build-arg` all legitimately
 * have no commit. **They must say so rather than guess**, because the consumer of this value is a
 * gate deciding whether a deployment is current: *"I was not built from a commit"* and *"I was built
 * from commit X"* are different facts, and a gate that cannot tell them apart would report a dev
 * container as up to date. This is the reach-versus-refusal rule at a build boundary — see the
 * standing rule in `TECHNICAL_DEBT.md`.
 */

/** The environment variable the image bakes. Named here once; the Dockerfile is its only writer. */
const BUILD_COMMIT_ENV = 'DBIZ_BUILD_COMMIT';

export interface BuildIdentity {
  /**
   * The full 40-character commit SHA this artefact was built from, or `'unknown'`.
   *
   * FULL, NOT ABBREVIATED, and deliberately not the image tag. The tag is 7 characters
   * (`deploy-api.yml` slices it) which is fine for naming an image and wrong for an equality check
   * against a local `HEAD`: a 7-character comparison is a prefix match wearing an identity's clothes.
   */
  readonly commit: string;
  /** True when the value was baked. `false` means this artefact cannot say what it was built from. */
  readonly known: boolean;
}

/**
 * Read the build identity from the environment.
 *
 * Takes the environment as a parameter so a test can exercise the unknown case without mutating
 * `process.env` — mutating it leaks across tests in the same process and makes the very state this
 * function reports depend on execution order.
 */
export function buildIdentity(env: NodeJS.ProcessEnv = process.env): BuildIdentity {
  const raw = (env[BUILD_COMMIT_ENV] ?? '').trim();
  // A 40-hex SHA or nothing. A partially-substituted build arg (`${BUILD_COMMIT}` left literal, an
  // empty string, an abbreviated tag) is NOT a commit, and reporting it as one would put a value in
  // the gate's comparison that cannot match and cannot be explained.
  const known = /^[0-9a-f]{40}$/i.test(raw);
  return { commit: known ? raw.toLowerCase() : 'unknown', known };
}
