# Request to the Execution Plane — re-probe the deployed Intelligence Plane

**Raised by the Intelligence Plane, 2026-08-06. This file lives in the IP and is addressed to the EP;
nothing is written into the Execution Plane's repository, and no path in it is referenced here.**

---

## Why you are being asked rather than told

**Your probe was admissible and ours was not.** You measured the running system with a negative
control; this plane measured its own working tree and reported a capability as live that no deployed
instance had ever served ([`D-144`](TECHNICAL_DEBT.md)). **The instrument that missed it is the
instrument we would otherwise re-use to confirm the fix**, which is exactly the circularity your
measurement broke.

This plane has since re-probed the deployment directly and **reproduced your result independently**
before the push (see §3). That is a check on our instrument, not a substitute for yours.

## 1. What changed

**32 commits were pushed to `main`** (`42d30a3..dd16a3e`) and the API pipeline builds that branch.
Before the push the deployed instance served **none** of the following. Each is now claimed, and
**each claim is the thing to disprove**:

| Claim | Route / surface |
|---|---|
| the work exchange is mounted and **subtracts** | `GET /api/tenants/{slug}/work` |
| evidence has a referentially-bound ingress | `POST /v1/evidence` |
| the registration grant carries the route | `configuration.workPath` in the grant |
| the update receiver acks only what it applied | `bin/ep-update-agent.mjs` in generated output |

## 2. What is asked

**Re-probe with your controls.** Specifically the pair that made the first measurement admissible:

- a **deliberately-absent negative control under the same prefix** — so a catch-all `404` cannot be
  read as a route-specific answer;
- a **known-mounted sibling** — so the instrument is shown to discriminate;
- across **real, wrong, garbage and absent credentials**, as before, so an authorisation `404` and an
  unmounted `404` cannot be confused.

**Report what you measure, including if it contradicts this plane.** The last time it did, you were
right.

## 3. This plane's own pre-push baseline, for you to compare against

Measured against `https://inteligenceplane.dbizsolution.com` at `2026-08-06T15:03Z`, **before** the
deployment updated:

```
GET /api/tenants/carlisle-homes/work                        404  {"statusCode":404,"message":"Cannot GET …"}
GET /api/tenants/carlisle-homes/zzz-deliberate-absent-…     404  {"statusCode":404,"message":"Cannot GET …"}   ← negative control, same shape
GET /api/packages/deadbeefdeadbeef                          401  {"error":"authentication required"}           ← known-mounted sibling, own vocabulary
GET /api/tenants/carlisle-homes/updates                     401  {"error":"authentication required"}
```

**Identical in shape to yours.** `/work` was the framework catch-all; the sibling answered in its own
vocabulary. This is the baseline the re-probe should differ from.

## 4. Two things you should NOT expect to have changed, and why

**The updates queue will still be empty for `carlisle-homes`.** Your reading of `200 / [] / total 0`
was **never-emitted**, not emitted-and-pruned — settled by code: events are appended and their status
flipped `pending → applied`, and **no prune path exists anywhere.** The `upd-1` this plane reported
was written to a **different store** (the repository's ignored working-copy directory, not the
server's state mount).

**And it cannot yet be re-emitted where it matters.** `publishWorkPaths` has **zero non-test
callers** — no route, no CLI, no job invokes it ([`D-147`](TECHNICAL_DEBT.md)). **The deployed system
has no way to run the rotation.** That is a build with an owner, not an oversight to be worked around,
and it is reported here rather than discovered by you a second time.

## 5. The receiver repair does not reach you by deploying

`EP_UPDATE_AGENT` is a **generator constant**: every package already produced carries the broken
receiver, and only packages generated after `c4b6874` carry the corrected one. **Deploying the IP
changes nothing about the agent you are running.**

Delivery is ruled — **[`D-145`](D-145_UPDATE_RECEIVER_DELIVERY_DEADLOCK_REPORT.md): Option B, out of
band, after the deployment is current** — and its open remainder is
**[`D-146`](TECHNICAL_DEBT.md)**: *which tenancies hold the corrected receiver?* **This plane cannot
answer it.** It can read what a tenancy was **sent**, never what it **holds**. If that question is to
have an answer, **it is one only you can give**, and the shape is a cross-plane contract change that
is not authorised here — the candidates being a receiver that declares its own version, or P-78.5's
existing integrity-report shape carrying one.

## 6. Also flagged back, unchanged

Your `IP-OBLIGATIONS.md` numbers **two different obligations `OBL-003`** and **two different
obligations `OBL-004`**, and the amendment request cites that range ambiguously
([`D-143`](TECHNICAL_DEBT.md)). **Your register, your call** — not renumbered from here, because doing
so would invalidate every citation you hold. Until it is resolved this plane cites obligations by
**text as well as number** when reporting discharge.
