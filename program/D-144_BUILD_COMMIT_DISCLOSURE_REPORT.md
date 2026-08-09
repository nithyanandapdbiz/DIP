# D-144 — Where the build commit belongs: disclosure report

> ## RULED 2026-08-06 — **OPTION B, AUTHENTICATED.**
>
> On the ground stated in §1: **relaxing is one line and withdrawing a published value is not**, and
> **repeated reads across a published-fix window state precisely that a fix is not applied.**
> **Nothing changes** — B is what was built.
>
> **OPTION C IS RECORDED AS THE HONEST FORM OF THE OPPOSITE RULING.** If anyone later decides a build
> SHA is not worth protecting, **C — a separate unauthenticated route — is that ruling's correct
> shape, and A is not.** A publishes the same value *and* re-muddles the liveness/readiness split
> this controller exists to enforce, so A is never the right way to reach C's outcome. **Ruling to C
> is deleting four lines from the handler; it is not moving the field onto `health()`.**

**Status: RULED (§ above). The mechanism is built; the body below is the report as written for the
ruling, unedited.**

**Measured 2026-08-06.** The value now reaches the process (`ARG BUILD_COMMIT` → `DBIZ_BUILD_COMMIT`
→ `buildIdentity()`), and is served on **`GET /api/version`, authenticated** — the option that
cannot leak, chosen as a default rather than as a ruling, because **relaxing it is one line and
withdrawing an anonymously-published value is not.**

---

## 0. What is actually being disclosed, and what it is not

**The repository is private.** A 40-hex SHA resolves to nothing an anonymous caller can fetch: it is
not a version number, not a dependency list, and not a path. **The naive risk — "it tells an attacker
which code you run" — is not the risk here.**

> **THE REAL DISCLOSURE IS STALENESS, AND IT IS A FUNCTION OF TIME RATHER THAN OF A SINGLE READ.**
> One read says nothing. **Repeated reads say how long this instance has been on the same commit** —
> and across a window in which a fix was published, an unchanging SHA is a precise statement that the
> fix is not applied. It also reveals **deploy cadence** (how often this system changes) and, when
> compared across environments, **which environment is behind**.

**This is the same shape as the fact this controller already moved behind authentication.** The
tenant count was individually harmless, useful in aggregate, and offered to anyone who could reach
the ingress. So is this.

**One thing genuinely argues the other way:** a build identifier is not a secret in the credential
sense, it is standard on many public APIs, and **an unauthenticated version endpoint is the cheapest
possible input to an availability/upgrade check run by a party that has no other credential.**

## 1. The three placements, and what each tells a caller who should not have it

### A — a field on the unauthenticated `/api/health`

**Tells an unauthenticated caller:** the commit, on every poll, forever. Staleness and cadence become
continuously observable to anyone who can reach the ingress. **It is also the only option that
publishes to a caller who has demonstrated nothing at all.**

**And it has a second cost that is not about disclosure.** This controller exists because liveness
and readiness were conflated and *"a container with a detached volume stayed in rotation serving
500s."* `health()` answers one question and touches nothing. **Putting build metadata on it re-muddles
a distinction that was deliberately drawn**, and adds a field to a response consumed every 30 s by a
probe that has no use for it.

### B — an authenticated route (**built, and current**)

**Tells an unauthorised caller:** nothing. `401`, indistinguishable from any other unauthorised read.

**Costs:** the gate must hold a credential, which puts one in CI. **That is a real cost and it is
already paid elsewhere** — this programme mints EP tokens and operates an admin allowlist. It also
means an anonymous third party cannot self-serve *"are you patched?"*, which is a **feature** in this
posture and a **friction** in a different one.

### C — a separate route, unauthenticated

Keeps `/api/health` clean (C's structural half is what was built) but publishes the value anyway. **It
has A's disclosure profile without A's semantic defect.** If the ruling is that a build SHA is not
worth protecting, **this is the honest form of that ruling** — not a field bolted onto liveness.

## 2. What was built, and what changes if the ruling differs

| Piece | Decision-independent? |
|---|---|
| `ARG BUILD_COMMIT` → `ENV DBIZ_BUILD_COMMIT` (Dockerfile) | **yes** |
| `--build-arg BUILD_COMMIT="${BUILD_SOURCEVERSION}"` (pipeline, FULL sha) | **yes** |
| `buildIdentity()` — one reader, `unknown` as a first-class answer | **yes** |
| `GET /api/version` **separate route** | **yes** — A is the only option that changes this |
| **the authentication on it** | **NO — this is the ruling** |

**Ruling to A:** move the field onto `health()` and accept the semantic cost. **Ruling to C:** delete
four lines from the handler. **Ruling to B:** nothing changes.

## 3. Two properties that hold under every placement

**THE FULL SHA IS SERVED, NOT THE TAG.** `deploy-api.yml` slices the sha to 7 characters for the image
tag; the baked value is the full 40. **A 7-character comparison against a local `HEAD` is a prefix
match wearing an identity's clothes**, and the gate does an equality check.

**`unknown` IS RETURNED, NEVER OMITTED.** An image built with no `--build-arg` answers
`{"commit":"unknown","known":false}`. **A gate must distinguish *"I was not built from a commit"* from
*"I was built from commit X"***; suppressing the field would make a dev container indistinguishable
from a current deployment — the reach-versus-refusal rule at a build boundary.

## 4. The gate reads THIS, not `origin/main`

[`verify-deployment-currency.js`](../governance/verification/verify-deployment-currency.js) asks the
**running system**. The `origin/main` check was rejected on this programme's own rule and the
rejection is recorded in the gate's own header: **`HEAD == origin/main` goes GREEN when nothing is
deployed at all** (CHARTER §17.1.1), and it reads a remote-tracking ref only as fresh as the last
fetch (D-107's class).

**AND IT DOES NOT DIAL THE DEPLOYMENT EITHER — EG-2 CAUGHT THE FIRST VERSION IN THE RUN THAT
WROTE IT.** The gate originally called `fetch`, and
`verify-intelligence-plane-egress` flagged it: **no Intelligence-Plane source opens an outbound
connection** (R-3.2, R-6.3, R-14.16). **The allowlist would have taken it** — file, host, rationale —
**and an allowlist entry was the wrong repair.**

> **The rule is right and the gate was wrong.** A control that needs an invariant relaxed in order to
> run is a control arguing with its own subject. **And the second reason is independent of the
> invariant:** every other gate here is deterministic and offline, and this one had stopped being
> either — it could not run in an offline CI at all, and a transport blip arrived at the same
> function as real drift.

**So the OBSERVATION is an input.** Whoever can reach the deployment records what it said — one line
of `curl`, documented in the gate's header — and the gate decides what that means. **The measuring
and the judging are separated**, which is the same split `undistributed()`/`publishWorkPaths()` makes
for a different reason: the party that may ASK is not always the party that may ACT.

**FAULT-PROVED IN FOUR DIRECTIONS, one of them against the live deployment:**

| Condition | Result |
|---|---|
| **not measured** (no observation) | **FAIL** — omission cannot satisfy it; *failing to look* IS the case it exists to catch |
| unreachable | **FAIL**, as *unavailability* — its own kind, never merged with mismatch |
| answered `404` — **live, today** | **FAIL** — *the deployed image predates this mechanism*, itself the D-144 answer |
| answered `200` at local `HEAD` | **PASS**, exit 0 |

`401`/`403` is reported as *the observer was not authorised to ask* — distinguished from unreachable
deliberately, because the deployment answered and what it said was no.

**Unreachable FAILS rather than skips**, and that is §17.1.1 applied to the gate itself: a gate that
passed when the deployment could not be reached would go green in exactly the case it exists to catch.
