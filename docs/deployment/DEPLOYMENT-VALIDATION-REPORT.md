# Deployment validation report

**E-2: NOT MEASURED**

## The criterion, and why the bar is where it is

**C-17.3** — *each image starts and serves a real request.* Document 17 explains the
choice:

> An image that builds is not an image that runs, and the gap between them is where
> the predecessor’s stale COPY and missing shared code both hid.

**A successful build would not be E-2 evidence.** Only a started image that answered
something is. This image has neither built nor started.

## What exists

| Artefact | State |
|---|---|
| `deploy/Dockerfile` | **Present. Never built, never started.** Not evidence of anything |
| Deployment probe | **Executes on every build**, and replays identically |
| Deploy path inside the probe | **Never exercised** — no runtime has been found for it to run against |

## What the descriptor does not prove

It is an unverified artefact. It has not been shown to build, to start, to carry its
full runtime closure, or to be free of secret material — **C-17.1 through C-17.5 are
all unmeasured for it.** Its presence shortens the path to evidence; it is not
evidence, and the probe reports it that way rather than counting it.

## Workstreams 2 through 8

Container startup, shutdown, restart, upgrade, rollback and persistence; execution,
operational, performance, failure and security validation; and the full certification
replay — **all require a deployed runtime.** Each is reported `NOT MEASURED` against a
named blocker rather than approximated from the in-process suites.

Approximating them is the single thing that would destroy the value of the twelve
milestones preceding this one.

---

*Generated from the deployment probe.*
