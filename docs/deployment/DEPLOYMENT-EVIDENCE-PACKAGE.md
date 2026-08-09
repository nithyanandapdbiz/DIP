# Deployment evidence package

What must happen for **E-2** to pass, and therefore for General Availability to become
certifiable. Nothing here is optional and nothing can be substituted.

## 1. Provide a container runtime

Any one of these 5, with a responding daemon:

- `docker`
- `podman`
- `nerdctl`
- `ctr`
- `finch`

On this machine none is installed, WSL is not installed, and the session is not
elevated — so none could be installed either. **That is the entire blocker.**

## 2. Run the probe

```
node governance/deployment/run-deployment-probe.mjs
```

It finds the runtime, builds `deploy/Dockerfile`, starts the image, and requires it to
serve a request. It reports `PASS` only if the container answered.

## 3. Expect the first build to fail

The descriptor has never been built. R-17.7 exists because images **build and start
successfully, then fail on the first real request** when a lazily-loaded dependency is
missing from the manifest. The most likely first failures:

- **OpenSSL.** The certificate authority shells out to it, so an image without it
  starts cleanly and then fails at the first registration — exactly the shape R-17.7
  describes.
- **The workspace copy strategy.** pnpm workspace links are not trivially portable
  into a runtime layer.
- **The `/state` volume.** Without it, the certificate authority root key and the token
  signing key do not survive a restart — which M2.8 measured as a customer outage.

**These are predictions, not measurements**, and worth exactly what predictions are
worth. The probe replaces them with facts.

## 4. Then the replays

Once E-2 passes, the ten `GA-*` properties become measurable: deployment, restart,
recovery, security, performance, tenant isolation, observability and operational
replay, plus container lifecycle and persistence. Each must be re-executed **against
the deployed runtime**, and each must match its in-process result.

**A mismatch is a finding, not a tolerance.** If the deployed platform behaves
differently from the in-process one, the in-process evidence was measuring something
other than the product.

---

*Generated from the deployment probe.*
