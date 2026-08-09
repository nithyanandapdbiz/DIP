# Intelligence Plane image — the ONE deployable IP artefact (17-deployment-topology.md, R-17.1).
#
# TRACEABILITY
#   Architecture : 17-deployment-topology.md
#   Criteria     : C-17.1 (builds in CI on every commit)
#                  C-17.3 (starts and serves a real request — GET /api/health)
#                  C-17.4 (no secret material, customer data or development tooling)
#                  C-17.5 (the copy strategy is automatically verified)
#
# ─────────────────────────────────────────────────────────────────────────────
#  E-2 STATUS: STILL NOT MEASURED IN THIS ENVIRONMENT.
#
#  This file now builds and launches the real Intelligence Plane API
#  (@dbiz/tenant-onboarding-engine → dist/src/server/index.js), replacing the
#  earlier stub CMD. But no container runtime exists where it was authored
#  (a probe found none), so it has NOT been `docker build`/`docker run`
#  verified here. Document 17 is explicit that this distinction is the whole
#  point: "An image that builds is not an image that runs." The first real
#  container build — expected in CI or on a runtime-equipped host — IS the
#  E-2 measurement; GA remains NOT CERTIFIED until it passes.
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24.11.0-alpine AS build
WORKDIR /build

# Corepack pins pnpm from the repository's packageManager field, so the image cannot build against a
# different package manager than CI used.
RUN corepack enable

# Manifests + lockfile first so a source-only change does not invalidate the dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm -r build

# Produce a self-contained, PRODUCTION-ONLY tree for just the API package and its workspace/prod deps.
# This is what enforces C-17.4 (no dev tooling — typescript, @types, vitest, etc. are excluded) and
# R-17.7 (the injected node_modules is the actual runtime closure, lazy edges included). The built dist/
# is carried along because it already exists on disk from `pnpm -r build`.
RUN pnpm --filter @dbiz/tenant-onboarding-engine --prod deploy --legacy /runtime

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:24.11.0-alpine

# OpenSSL is a RUNTIME dependency: the platform-runtime certificate authority shells out to it to issue
# real X.509. Absent, the image starts and then fails on the first registration (R-17.7's lazy edge).
RUN apk add --no-cache openssl \
 && addgroup -S dbiz && adduser -S dbiz -G dbiz

WORKDIR /app
COPY --from=build --chown=dbiz:dbiz /runtime ./

# THE COMMIT THIS ARTEFACT WAS BUILT FROM (D-144). Baked here and nowhere else.
#
# This is the one value that must NOT follow R-17.15's "configuration, never baked in" rule, and the
# exception is the point: everything else in this block describes how the image should BEHAVE, which
# the deployment is entitled to change. This describes what the image IS. A commit supplied at
# deploy time could be set to any value by whoever deploys, which would make it a claim rather than
# a fact — and a claim is exactly what D-144 already had.
#
# It carries no secret: it is an opaque 40-hex identifier into a private repository. Its disclosure
# question is about STALENESS, not about code, and is reasoned about at the route that serves it.
#
# `unknown` is the honest default. A local `docker build` with no --build-arg produces an image that
# says it does not know what it was built from, which is true and is what the consumer needs.
ARG BUILD_COMMIT=unknown

# Cloud selection is configuration, never baked in (R-17.15). Durable state lives on a mounted volume
# (Azure Files), NOT in the image. NO SECRET MATERIAL IS BAKED IN (C-17.4) — SESSION_SECRET and the
# Entra config arrive from the environment (populated from Key Vault).
ENV NODE_ENV=production \
    PORT=8080 \
    DBIZ_STATE_DIR=/state \
    DBIZ_BUILD_COMMIT=${BUILD_COMMIT}
VOLUME ["/state"]

USER dbiz
EXPOSE 8080

# Liveness inside the container. busybox wget ships in the alpine base.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

# Real production entrypoint (binds 0.0.0.0 via bootstrap). No dev launcher, no hardcoded paths.
CMD ["node", "dist/src/server/index.js"]
