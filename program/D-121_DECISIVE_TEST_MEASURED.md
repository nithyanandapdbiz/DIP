# D-121 — the decisive test, run. And the method that made both halves readable

**2026-08-06, from `42d30a3`. Executed, not reasoned. Every command and every response below was run.**

> **THE TEST WAS: seal one package into the store for `carlisle-homes` and hand the Execution Plane
> its hash, so the EP can retrieve the actual bytes and parse them against
> `execution-package-v1.0.0.json`.**
>
> **IT CANNOT BE CONSTRUCTED, AND THE REASON IS THE ANSWER.** The package cannot be sealed. The
> store that serves `GET /api/packages/{hash}` **refuses the gateway's output on the first field it
> reads**, before storage, before retrieval, and long before any question of what the EP parses.
>
> **This settles D-121 as none of (a), (b) or (c).** See §4.

---

## 1. What was run

The live authoring path was driven for real — not reconstructed from source, not inferred from the
smoke fallback.

1. An EP token was minted for `carlisle-homes` v1 on a measurement-only secret.
2. `ip-execute-gateway.mjs` was started on `127.0.0.1:4699` with that secret and the repository's
   real `tenants/` directory, so `knownTenant('tnt-eb7e75f1d0de')` resolved the real record.
3. `POST /v1/execute` was called with a `contextRequest`. **`200`. A package was authored.**
4. That package — the exact bytes returned — was handed to a real `SealedPackageStore` over a real
   `FilesystemStorageProvider`, with the fail-closed ownership resolver, in `carlisle-homes`'
   partition.

**Every negative below is paired with a deliberate positive control**, for the reason §5 records.

## 2. The result

### The package the live path authored

Fourteen top-level keys:

```
authoredBy, authoredFor, capability, contentHash, contractVersion, issuedAt, metadata,
operations, packageId, proceed, refusalReason, signature, tenantId, validity
```

**`provenance` is absent.** `contentHash` is present — **at the top level**, as
`{ algorithm: "sha256", value: "bda40e2f…" }` — not under `provenance` where the store reads it.

### SUBJECT — seal it

```
store.put(carlisle-homes, <the authored package>)
  -> SealedPackageWriteRefused: sealed body carries no provenance.tenantId
```

### CONTROL — seal a body written to the published contract, same store, same call

```
store.put(carlisle-homes, <contract-conforming body>)   -> accepted, hash cccc…cccc
store.get(carlisle-homes, cccc…cccc)                    -> found
```

**The store works.** It accepts a package, partitions it, and serves it back. The refusal above is a
statement about the package, not about the store — and without this control it would not have been
possible to tell those two apart.

### And what the published parser says about each

```
parseExecutionPackage(authored package)  -> REFUSED, 8 issues
parseExecutionPackage(control body)      -> PARSED, contractVersion 1.0.0
```

The eight:

```
runId                              expected string,  received undefined
correlationId                      expected string,  received undefined
capabilityId                       expected string,  received undefined
directives                         expected object,  received undefined
gates                              expected array,   received undefined
evidenceRequirements               expected array,   received undefined
provenance                         expected object,  received undefined
validity.reusableWhileUnavailable  expected boolean, received undefined
```

> **EIGHT, NOT SEVEN. D-121 recorded seven and undercounted by one.** The first seven are the
> top-level fields it named. **The eighth is nested inside a section that IS emitted** —
> `validity` is sent, and is itself incomplete. A top-level field census cannot see that, and the
> census was the instrument. The divergence is one level deeper than the entry that found it.

## 3. Why this is decisive rather than one more measurement

**The store's write contract is a consumer of the published contract, in production code, on the
serving path — and it has been refusing the gateway all along.**

`SealedPackageStore.put` reads three fields before it will store anything:

| Field it requires | Whose vocabulary it is |
|---|---|
| `provenance.tenantId` | `ExecutionPackage` |
| `provenance.contentHash.value` | `ExecutionPackage` |
| `validity.notAfter` | `ExecutionPackage` |

**All three are the contract's.** The ownership assertion that makes the store tenant-safe — P-79.2,
the whole of C-07.11 on this path — is *built on `provenance`*. The store cannot partition a package
that has no `provenance`, so it cannot store one, so it can never serve one.

**This is not a partial check that happens to disagree. It is the load-bearing one.** The single
field the store refuses on is the single field its isolation property is derived from.

## 4. What it settles, and it is a fourth answer

**(c) — "the gateway serves a legitimately different IP-internal envelope, and the contract
describes what the EP gets once retrieval carries it" — IS REFUTED, NOT MERELY UNPROVEN.**
Retrieval cannot carry that envelope. There is no route by which it reaches the Execution Plane,
and the measurement above is why: the only door to the EP requires `provenance`, and the envelope
has none. It was never "two artefacts, one of which crosses". It is one artefact that crosses and
one that cannot.

**(a) — "amend the whole package shape at v1.1.0 so the contract describes the served envelope" —
IS REFUTED IN THE SAME STROKE, AND THIS IS THE PART THAT WAS NOT EXPECTED.** Amending the
cross-plane contract to describe the served envelope would be **writing an artefact that never
crosses a plane boundary into the contract that governs crossing it.** The envelope is not
underdescribed. It is internal, and the measurement is what makes that a fact rather than a
preference.

**(b) is moot** — it was the smaller half of an amendment whose premise has now gone.

> **THE FOURTH ANSWER: THE CONTRACT IS NOT WRONG AND NEEDS NO AMENDMENT. THE PRODUCER IS.**
>
> `ip-execute-gateway.mjs` emits a shape that cannot enter the store that serves the Execution
> Plane. **The repair is at the producer, and it is already scheduled**: ADR-0049 M5 —
> *retire this file and serve `/v1/execute` from the authenticated NestJS tier* — is written in
> the gateway's own header, and `verify-runtime-cutover-readiness.js` already gates it.
>
> **`CONTRACT_VERSION` stays at 1.0.0. The corpus stays byte-identical. Nothing is amended.**
> The published contract has never been contradicted, and now it is clear why: the only consumer
> that could contradict it *agrees with it*, and refuses the thing that does not.

**What is genuinely open is not a contract question at all** — see D-122. Nothing has ever written
to the store. Both halves of ADR-0070's retrieval inversion exist; neither has ever been connected
to the other; and the half that would connect them is the half that decides which shape crosses.

## 5. THE METHOD — and it is the transferable part

> **A response is evidence of an answer only once you have shown the path answers at all.**
> Compare every observation against a deliberately nonsense sibling. Where the two are
> byte-identical, you measured the fallthrough, not the subject.

### Applied to the live deployment, reproduced here

Four probes against `https://inteligenceplane.dbizsolution.com`, three of them controls:

| Probe | Status | Bytes | What answered |
|---|---|---|---|
| `POST /v1/execute` | 405 | 335 | — |
| `POST /v1/evidence` | 405 | 335 | — |
| `POST /zzz-deliberately-nonsense-path` | **405** | **335** | **the control** |
| `POST /api/packages/notahash` | 404 | 136 | **the application** |

The three 405s are **byte-identical**, and the bytes name their author:

```html
<!DOCTYPE html><html><head><title>UnsupportedHttpVerb</title></head><body>
<h1>The resource doesn't support specified Http Verb.</h1><p><ul>
<li>HttpStatusCode: 405</li><li>ErrorCode: UnsupportedHttpVerb</li>
<li>RequestId : …</li><li>TimeStamp : …</li></ul></p></body></html>
```

**That is Azure Blob Storage's error page.** `/v1/*` is not merely unrouted inside the Intelligence
Plane application — **it never reaches the application.** The static-site origin answers it.

The fourth probe is the one that makes the other three mean something. `POST /api/packages/notahash`
returns NestJS's own refusal — `{"statusCode":404,"message":"Cannot POST /api/packages/notahash",…}`
— naming the method and the path. **So the application is up, reachable, and answering; the
fallthrough is specific to `/v1/*` and is not an outage.** Without it, "the app is down" would have
been an equally good explanation for all three.

`GET` closes it: `/v1/execute` and the nonsense path both return the **same 555-byte SPA
`index.html`** — the static site's catch-all.

### What it would have read as without the control

**`405 UnsupportedHttpVerb` on `POST /v1/execute` is a plausible answer from a route that exists.**
It says "wrong verb", which is what a mounted-but-GET-only route would say. **A 405 is a stronger
false signal than a 404**, because it appears to confirm the path is real and merely misused. One
probe, read alone, would have concluded the gateway was deployed and the contract question was live
on the wire. It is not, and it never was.

### And it is the same method twice

§2's control is §5's control, one layer in. `SealedPackageWriteRefused` on the authored package
would have read as *"the store is misconfigured"* — the same misdiagnosis one field along, and the
expensive one on this boundary, exactly as OBL-002 spent its time on a credential that was never
the problem. **The contract-conforming body proved the store accepts, partitions and serves.** Only
then does the refusal mean what it says.

### Where this belongs

CHARTER §18 clause 2 already says a demonstration is evidence only of *what it actually faulted and
what actually ran*, for **fault injection**. This is the same obligation for **observation**: a
response is evidence only of *what actually answered*. **It is offered as a candidate clause 3 and
is not written into the CHARTER here** — §18's clauses are constitutional, adopted through
ADR-0019, and a rule added without a ruling is a rule nobody ruled on. Recorded here, cited from
D-117, D-121 and D-122, and owed a decision.

## 6. Reproduction

The gateway is a **development harness** and says so: it `process.exit(1)`s if `DBIZ_ENV` or
`NODE_ENV` is `production`, and binds `127.0.0.1` only. That refusal is independent source-level
confirmation of §5 — **`/v1/execute` cannot be served by the production deployment, by the
gateway's own design**, and the control-path probe measures the consequence rather than discovering
it.

Nothing in the repository was modified by this measurement. The store was rooted in a temporary
directory; the tenant record was read, never written.
