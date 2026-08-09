# Deployment

The Execution Plane runs **in your tenancy**, built and operated by you. That is
the architecture, not a support boundary: DBiz has no route into your environment
and does not want one.

## What you deploy

The generated repository contains a `Dockerfile` whose base image matches your
chosen language, a deployment manifest for your chosen model, and a CI workflow for
your chosen system. All three come from the profile — they are not templates you
adapt afterwards.

## Network

| Direction | Required | Notes |
|---|---|---|
| Outbound to the platform endpoint | **Yes** | TLS. Your deployment initiates every connection. |
| Inbound from the platform | **Never** | No rule is required, and none should be created. |
| Outbound to your package mirror | At build | Not needed at runtime. |

**A TLS-inspecting proxy will break mutual TLS.** A proxy that re-signs traffic
presents its own certificate, and the platform is verifying yours. If handshakes
fail from inside a corporate network and succeed from outside, this is why.

## First start

On first start your deployment registers itself using the one-time credential in
the generated repository. Registration is **atomic** — a failure at any point
leaves the tenant unregistered rather than half-registered — and **idempotent** by
tenant, so a retried deployment returns the grant you already hold rather than
creating a second identity.

## Deployment validation

The following remain **`NOT MEASURED`** and are therefore not claimed:

- **E-2** — Execution Plane generated AND DEPLOYED to a customer tenancy. Blocked: Docker unavailable in this environment — generation is proven (E-1, E-3); deployment is not, and is not claimed.

This is stated rather than omitted. A deployment guide that implies validation
it does not have is worse than one that admits the gap, because you would find
out in your own environment.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
