# Quick start

From nothing to a first authenticated call.

**The automated path is measured by executing it on every release.** The measured duration for this release is in `MANIFEST.json`. Your wall-clock time is that plus the decisions only you can make: which technology profile you want, and getting the generated repository through your own review.

## The seven steps

These are the steps the platform runs, in order. They are listed here from the
same definition the software uses, so this list cannot fall behind it.

1. **Checking your environment**
2. **Validating your technology profile**
3. **Creating your tenant**
4. **Issuing a one-time registration credential**
5. **Generating your Execution Plane**
6. **Registering and issuing your certificate**
7. **Verifying an authenticated call**

**Validation happens before creation.** Your profile is checked against the live
schema before a tenant exists, because a tenant created against an unbuildable
profile leaves you holding an identity for a solution that will never generate.

## 1. Choose a profile

9 combinations are validated. Copy one:

```json
{
  "profileVersion": "1.0.0",
  "language": "typescript",
  "framework": "playwright",
  "testRunner": "playwright-test",
  "ciSystem": "github-actions",
  "gitProvider": "github",
  "cloudProvider": "azure",
  "deploymentModel": "container",
  "packageManager": "pnpm",
  "reportingFramework": "allure",
  "frameworkVersions": {
    "@playwright/test": "1.49.0",
    "allure-playwright": "3.0.7",
    "typescript": "5.7.2"
  }
}
```

The full set is in [CONFIGURATION.md](CONFIGURATION.md), with a matrix of what is
supported and what is not.

## 2. Onboard

```
dbiz onboard --tenant <your-tenant-id> --profile ./profile.json
```

Each step reports as it completes. If one fails, it stops there and tells you what
to do — it does not continue into the consequences of a failure.

## 3. Commit what was generated

You receive a complete repository. It is yours: the platform keeps no copy of it,
your source, your test data or your results.

The generated repository contains a **one-time registration credential**. It is
single-use and is consumed the first time your deployment starts. It is not an API
key and cannot be reused — which is why it is safe in a repository history, and why
nothing else in that repository is a secret.

## 4. Deploy and let it register

Your deployment calls out to the platform. **Nothing calls in.** The platform never
opens a connection into your tenancy, so no inbound firewall rule is required —
and if someone asks you to open one, that request did not come from this platform.

## 5. Confirm

```
dbiz doctor
```

Runs every diagnostic and prints failures first, each with what to do next.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
