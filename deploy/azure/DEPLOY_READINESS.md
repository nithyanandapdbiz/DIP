# Deploy readiness — what must be true for the next deploy to take

**Written 2026-08-06, while the failure was fresh.** The deployment is blocked on a missing
`PACKAGE_SIGNING_KEY` secret. This file records what must hold before the next attempt, and — more
usefully — **which of these conditions announce themselves and which do not**, because a checklist
whose items are all "check X" teaches nothing about where to look when X was checked and it still
failed.

> **THE ONE ERROR THIS FILE EXISTS TO CORRECT IS §3.** `/api/health` cannot distinguish old code from
> new. It was read as though it could, today, and the next reader will read it the same way.

Authoritative elsewhere, and not restated here: [`README.md`](README.md) (the estate),
[`KEY_VAULT.md`](KEY_VAULT.md) (the secret inventory), [`AZURE_DEVOPS.md`](AZURE_DEVOPS.md) (the
pipeline), [`FRONT_DOOR.md`](FRONT_DOOR.md) (the edge).

---

## 0. A PUSH TO `main` DOES NOT NECESSARILY DEPLOY — the trigger is PATH-FILTERED

**Read this before concluding from an unchanged revision that the pipeline is broken.** It is placed
first because it is the wrong conclusion that is available earliest.

**Predicted 2026-08-06 by Nithya, and it was wrong: "pushing replaces the revision that just came up
at 117s."** It did not, and nothing was wrong with the pipeline. `4c680a9` touches
`program/PROJECT_STATE.md` and nothing else. [`azure-pipelines/deploy-api.yml`](../../azure-pipelines/deploy-api.yml)
triggers on `main` **and only for these paths**:

```yaml
paths:
  include:
    - packages/**
    - deploy/Dockerfile
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
    - azure-pipelines/deploy-api.yml
```

**`program/`, `docs/`, `governance/`, `deploy/azure/**` and `deploy/iac/**` are NOT trigger paths.**
So a documentation or governance commit — including a commit to *this file* — pushes cleanly, queues
nothing, and leaves the running revision exactly as it was.

> ### THE OPERATIVE CONSEQUENCE
>
> **REPLACING A REVISION REQUIRES A MANUAL QUEUE IN THE AZURE DEVOPS UI, OR A COMMIT THAT TOUCHES ONE
> OF THE PATHS ABOVE — `packages/**` in practice.** There is no third way, and a push is not one.

**Why this is recorded rather than remembered.** Had the revision been checked after that push and
found unchanged, the available reading was *"the pipeline is broken again"* — and these same trigger
paths have already produced one misreading in this programme's record. **The failure is silent in the
only direction that matters:** a push that triggers nothing looks identical, from `git push`, to a
push that triggers a build which then fails. `git push` reports success in both cases, because
success is all it is reporting on.

Note the interaction with **§1**: `18f8255` added the `package-signing-key` reference to
`containerapp.yaml` and `main.bicep`, and **neither file is a trigger path either.** Those
declarations reach a running container only when a build is queued that carries them — the descriptor
being correct on `main` is not the descriptor being applied.

---

## 1. `PACKAGE_SIGNING_KEY` — the blocker, and it is a refuse-to-start

**The container will not boot without it.** The chain is short and worth knowing by heart, because
the symptom is a Container App revision that never becomes healthy rather than an error on a route:

```
platform-adoption.ts  composeApiDeps()
  → resolveSigningKey(secrets)              package-signing.ts
    → secrets.get('PACKAGE_SIGNING_KEY')    EnvSecretProvider — the captured env snapshot
      → undefined  ⇒ SigningKeyAbsentError
        → caught, rethrown as BootstrapError
          → the process exits at boot
```

**THERE IS NO CREATE-IF-MISSING, AND ITS ABSENCE IS THE FEATURE** (ADR-0083 P-83.2). The key used to
be a file this plane generated when it was not there. That branch is gone, so **absent now means
*not provisioned* unambiguously** — the first-run/lost-volume ambiguity does not arise. The cost is
exactly the blocker being worked around now: **provisioning is a deliberate act and nothing will
perform it on the platform's behalf.**

### What must be true

| # | Condition | Where | How it fails if wrong |
|---|---|---|---|
| 1.1 | The Key Vault secret **exists** and holds a **PKCS#8 ed25519 private key PEM** | the vault named in `README.md` | boot refusal, `SigningKeyAbsentError` message names the variable |
| 1.2 | The Container App declares it as a **Key Vault–referenced secret**, resolved through the user-assigned identity | `configuration.secrets` | boot refusal — identical to 1.1, and indistinguishable from it without reading the revision's secret list |
| 1.3 | It is mapped to the env var **spelled exactly `PACKAGE_SIGNING_KEY`** | `template.containers[].env` | boot refusal, again indistinguishable |
| 1.4 | The identity holds **Key Vault Secrets User** on the vault | RBAC | the reference fails to resolve; the revision reports a provisioning error, *not* a boot refusal |

> **1.1, 1.2 and 1.3 ALL PRODUCE THE SAME ERROR**, because the application can only observe that the
> variable is absent — it cannot see whether the vault, the reference or the mapping is what is
> missing. **Check them in that order rather than diagnosing from the message**, which names the
> variable and can say nothing about which of the three links is broken.

### Which half is Azure's and which was this repository's

**1.2 and 1.3 were declarations in this repository, and they were missing.** `package-signing-key`
appeared in neither `deploy/azure/containerapp.yaml` nor `deploy/iac/main.bicep` — both declared
`session-secret` only. **Creating the vault secret without the reference and the env mapping changes
nothing**: the value never reaches the process, and the boot refusal looks identical to the secret
not existing. Both files now declare it.

**1.1 and 1.4 are the Azure operation** — the vault secret itself, and the identity's role
assignment — and they remain outstanding.

`README.md` and `KEY_VAULT.md` have been corrected: they previously described the key as *optional*
and *auto-generated on the durable mount*, which was true before ADR-0083 and is now the opposite of
the boot behaviour.

---

## 2. The PEM's newlines surviving the env round-trip — MEASURED, and narrower than feared

A PEM carries structural newlines; an env var is one line. The worry is that the round-trip through
Key Vault → Container App env → `EnvSecretProvider` mangles them. `EnvSecretProvider` returns the
value **verbatim** — it trims nothing and normalises nothing — so whatever the platform delivers is
what OpenSSL parses.

**So it was measured rather than assumed** (Node 22, `node:crypto`, same call the platform makes —
`createPublicKey(pem)`, then a sign/verify round trip and the key-id derivation):

| Mangling | `createPublicKey` | Same public key? | Same key id? | Signature verifies? |
|---|---|---|---|---|
| clean PEM | accepted | — | — | yes |
| `\n` → literal `\n` (two chars) | **accepted** | **yes** | **yes** | **yes** |
| CRLF line endings | **accepted** | **yes** | **yes** | **yes** |
| trailing newline lost | **accepted** | **yes** | **yes** | **yes** |
| newlines **stripped** | **REFUSED** — `ERR_OSSL_UNSUPPORTED` | — | — | — |
| newlines → spaces | **REFUSED** — `ERR_OSSL_UNSUPPORTED` | — | — | — |

**THE FAILURE MODE THAT WOULD HAVE BEEN DANGEROUS DOES NOT EXIST HERE.** The dangerous shape is a
PEM that parses to a *different* key — the platform would boot, sign packages under a key id no
Execution Plane holds a verification key for, and every signature would fail verification on the far
side with nothing on this side red. **No accepted variant produces a different key.** The key id is
derived from the **re-exported SPKI public PEM**, not from the private key's incoming text
(`package-signing.ts`), so representation differences are normalised away before anything is
identified by them.

**And the two refused variants refuse at BOOT**, through the same `BootstrapError` path as §1 — loud,
before a single request is served, and never silently.

> **What this does NOT license.** "OpenSSL is tolerant" is not "store it however". The tolerance is a
> property of the PEM reader measured today; a **base64-of-the-PEM** convention, or any transport that
> rewrites the body rather than the line endings, is outside every row of that table. **Store the PEM
> as-is and verify §4.1 against the running system rather than reasoning about the encoding.**

---

## 3. `/api/health` CANNOT DISTINGUISH OLD CODE FROM NEW — only the authenticated `/api/version` can

**This is the reasoning error made today, and it is the item most likely to be repeated.**

`GET /api/health` returns exactly `{ status, uptime }`. It is deliberately O(1) and touches nothing —
that is why it is a liveness probe. **It carries no build identity and it never has.** So:

- **A climbing `uptime` is a valid NEGATIVE.** It proves the process has *not* restarted, therefore
  the new image is *not* running. This is the one thing health legitimately settles, and it is how
  the failure was correctly diagnosed earlier today.
- **A reset `uptime` proves NOTHING about the code.** A revision restart of the *same* image resets
  it exactly as a new image does. Restart is necessary for a new build to be live; it is not
  sufficient, and it is not evidence.
- **`200 ok` proves less still.** The old image answers it identically.

`GET /api/version` is the only route that answers *which commit*. It returns
`{ commit, known }` — the **full 40-hex SHA**, baked at build time (`ARG BUILD_COMMIT` →
`DBIZ_BUILD_COMMIT`, wired to `$(BUILD_SOURCEVERSION)` in `deploy-api.yml`). It is **authenticated**
(D-144, ruled option B), so the check needs a credential.

`unknown` is returned rather than the field being omitted: an image built with no `--build-arg`
answers `{"commit":"unknown","known":false}`, which must stay distinguishable from *"built from
commit X"*.

> **A `404` FROM `/api/version` IS ITSELF THE ANSWER, AND IT IS THE CURRENT ONE.** The deployed image
> predates the mechanism, so it 404s — which is a positive statement that the deployment is behind,
> not a missing measurement. `verify-deployment-currency.js` reports it as its own finding, separate
> from unreachable and from mismatch.

### THE CHEAP FORM OF THIS PROBE NEEDS NO CREDENTIAL AND NO `az` CLI

**`/api/version` ANSWERING AT ALL — INCLUDING `401 authentication required` — PROVES THE NEW COMMITS
ARE SERVING.** The route exists or it does not, and that is settled before authorisation is
considered: an image built before the mechanism has no such route and answers Nest's catch-all
**`404`**. So the two outcomes are:

| Response | What it settles |
|---|---|
| **`401`** (or any authenticated answer) | **the route EXISTS — the deployment carries the new commits.** The commit *identity* still needs the credentialed probe in §4.1; that the deployment is current in kind is already proved. |
| **`404`** | **the route does NOT exist — the serving revision predates the mechanism.** Nothing further is needed to know the deploy has not taken. |

**A browser is sufficient.** No token, no `az` CLI, no pipeline access — open `$BASE/api/version` and
read which of the two came back. **This is the one outstanding probe**, and it is the cheapest
measurement in this document.

> **DO NOT SUBSTITUTE `/api/health` FOR IT, INCLUDING WHEN UPTIME IS LOW.** A restart of the *same*
> image resets uptime identically to a new one — a 117-second uptime proves a restart happened and
> says nothing whatever about which code is running. **The `401`/`404` split above is the discriminator
> `/api/health` has never been able to provide.**

---

## 4. The sequence, after the deploy

### 4.1 Establish what is actually running

The measuring and the judging are separated deliberately — **nothing in this plane dials out**
(R-3.2/R-6.3/R-14.16, and EG-2 caught the first version of the gate that tried). So an operator
produces the observation and the gate reads it:

```bash
curl -sS -m 30 -H "authorization: Bearer $TOKEN" "$BASE/api/version" \
  -o body.json -w '{"reached":true,"status":%{http_code}}' > meta.json
# compose: {"reached":true,"status":<code>,"body":<body.json, or null>}
# transport failure (non-zero curl exit) is: {"reached":false,"why":"<message>"}

node governance/verification/verify-deployment-currency.js observation.json
```

**Compare the full 40 hex characters.** The image *tag* is `${BUILD_SOURCEVERSION:0:7}` and the baked
value is the whole SHA; a 7-character comparison is a prefix match wearing an identity's clothes.

**A missing observation FAILS** — it is not a skip. *Failing to look* is the case the gate exists to
catch.

### 4.2 Then, and only then, drive the work-path sweep

New as of this session (D-147). It is an operator act, on demand, and it is what tells an
already-registered tenancy — `carlisle-homes` among them — where `/work` is:

```bash
# who cannot currently discover the exchange (reads, writes nothing)
curl -sS -H "authorization: Bearer $TOKEN" "$BASE/api/work-paths"

# send every registered tenancy its current path (idempotent by comparison)
curl -sS -X POST -H "authorization: Bearer $TOKEN" "$BASE/api/work-paths"
```

Both require a **platform-admin** principal: the subject is the whole population, so there is no slug
to scope a tenant-admin against. A second `POST` reports every tenancy `current` and emits nothing.

**Run 4.1 before 4.2.** A sweep against an image that predates the route answers Nest's own 404, and
a 404 there is indistinguishable from a sweep that did nothing.

---

## 5. Standing conditions that are not new but are load-bearing

These already refuse to start and are listed so a boot failure is diagnosed in one pass rather than
one variable at a time. All are in `composeApiDeps`.

| Condition | Refusal |
|---|---|
| `SESSION_SECRET` present, not a documentation placeholder, ≥ 32 characters | it signs every session and EP credential; a weak value is offline-forgeable |
| `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` set, **or** `DBIZ_DEV_AUTH=1` | otherwise nothing can verify a credential |
| `DBIZ_DEV_AUTH` **absent** in production | the dev verifier accepts unsigned `dev:<email>` and grants platform-admin |
| `DBIZ_REQUIRE_ENTRA_ROLES` stated explicitly in production | inheriting the lenient default is how "every authenticated user is a global admin" survives |
| `DBIZ_CORS_ORIGINS` stated explicitly in production (empty string = same-origin, deliberately) | silently defaulting strands the SPA with an unexplained CORS failure |
| `DBIZ_STATE_DIR` writable | the file-backed SSOT; named at boot rather than on the first write |

---

## 6. Open, and named rather than assumed

- **The Azure operation itself** — `az keyvault secret set --name package-signing-key` in
  **`kv-dbizip-dev-ajtw`**, and `Key Vault Secrets User` on the identity (§1, conditions 1.1 and
  1.4). The declarations that consume it (1.2, 1.3) are now in this repository. **Addressed to its
  owner in [`SIGNING-KEY-PROVISIONING-REQUEST.md`](SIGNING-KEY-PROVISIONING-REQUEST.md)**, which
  carries the one precondition that is not obvious: **check `/state/signing/ep-package-signing.pem`
  on the `ip-state` share before generating** — the key id derives from the key, so a new key
  invalidates every signature already issued.
- **`containerapp.yaml` points its Readiness probe at `/api/health`**, while `main.bicep` points it at
  `/api/ready`. The split between them is deliberate — `/api/health` touches nothing, `/api/ready`
  verifies the state directory — and pointing readiness at liveness re-creates the condition
  `HealthController` was written to remove: *a container with a detached volume stays in rotation
  serving 500s.* **Now recorded as its own register entry — [`D-148`](../../program/TECHNICAL_DEBT.md)
  — rather than only as a bullet here**, because it belongs to neither file's change and is **decided
  by whichever descriptor is applied last**. Not blocking this deploy; it will bite the one after.
- **A green suite over an unpushed commit measures a private artefact** — the standing rule from
  D-145. `verify-deployment-currency.js` is the instrument, and it is not in the default suite,
  because work in progress is normal. What is a fault is an unqualified *"is live"* written over a
  divergence.
