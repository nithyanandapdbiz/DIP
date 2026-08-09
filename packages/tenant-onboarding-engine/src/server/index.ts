/**
 * TRACEABILITY: 03-intelligence-plane-architecture.md · 17-deployment-topology.md · ADR-0033 · ADR-0034 · ADR-0036 · ADR-0060
 *
 * PRODUCTION ENTRYPOINT for the Intelligence Plane container (the one deployable IP artefact, R-17.1).
 *
 * CANONICAL STARTUP (ADR-0060 §6, step M-a): initialization goes through `bootstrapPlatform` — the
 * certified Configuration + Secret + Storage + Distributed-State providers — so no runtime code reads
 * `process.env` directly and cloud selection is configuration, never code (R-17.15). The tested API
 * domain is composed by `composeApiDeps` and is UNCHANGED (backward compatible); binds 0.0.0.0 so
 * Container Apps ingress can reach it.
 */
import 'reflect-metadata';
import { bootstrapPlatform, ConfigurationError } from '@dbiz/platform-providers';
import { bootstrap } from './main.js';
import { composeApiDeps, BootstrapError } from './platform-adoption.js';
import { createLogger } from './structured-logger.js';
import { createRedisClientFactory, redisSelected, RedisUnavailableError } from './redis-client-factory.js';

/** Fail fast with a clear operator message. A misconfigured boot must be loud, never a silent default. */
function refuse(message: string): never {
  console.error(`Refusing to start: ${message}`);
  process.exit(1);
}

// A logger is needed before configuration is resolved (a Redis connection error can arrive during
// bootstrap). Its level is raised to the configured one once the config is known.
let logger = createLogger();

// ── Canonical bootstrap: providers first, then compose the tested domain over them ───────────────
//
// The Redis client factory is supplied ONLY when configuration has selected the redis backend, and is
// resolved dynamically so no deployment carries the driver it does not use (see redis-client-factory.ts).
// This closes the last gap in the ADR-0060 provider platform: previously `bootstrapPlatform()` was
// called with no options, so selecting redis threw at startup and the platform could only ever run the
// in-memory backend — the reason `containerapp.yaml` is pinned to a single replica.
let composed;
try {
  const bootstrapOptions = redisSelected(process.env)
    ? { redisClientFactory: await createRedisClientFactory((error) => logger.error('redis.error', { error: error.message })) }
    : {};
  const platform = bootstrapPlatform(bootstrapOptions);
  composed = composeApiDeps(platform);
} catch (e) {
  if (e instanceof BootstrapError || e instanceof ConfigurationError || e instanceof RedisUnavailableError) {
    refuse(e.message);
  }
  throw e;
}
const { deps, port, host, isProduction, diagnostics } = composed;

logger = createLogger({ level: diagnostics.logLevel });

if (!diagnostics.liveEntra) {
  logger.warn('boot.dev-auth-enabled', {
    detail: 'unsigned dev:<email> tokens are accepted; the allow-list still applies. NEVER enable outside local development.',
  });
}
if (diagnostics.allowlist.length === 0) {
  logger.warn('boot.empty-allowlist', {
    detail: 'IP_ADMIN_ALLOWLIST is empty — no Microsoft identity can obtain a session until it is set.',
  });
}

const app = await bootstrap(deps, port, host, {
  // API docs publish the whole administrative surface — never in production.
  exposeApiDocs: !isProduction,
  corsOrigins: diagnostics.corsOrigins,
  // Azure Application Gateway terminates TLS and rewrites the forwarded headers, so they are
  // trustworthy there and ONLY there. Off by default: honouring x-forwarded-for without a proxy in
  // front lets any caller mint a fresh rate-limit bucket per request.
  trustProxy: diagnostics.trustProxy,
  logger,
});

// Graceful shutdown: Container Apps sends SIGTERM on revision swap / scale-in. Drain in-flight requests.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info('process.shutdown', { signal });
    app.close().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}

// An unhandled rejection or uncaught exception must be RECORDED before the process dies. Without this
// the container restarts and the only evidence of why is gone.
process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled-rejection', { error: reason instanceof Error ? reason.message : String(reason) });
});
process.on('uncaughtException', (error) => {
  logger.error('process.uncaught-exception', { error: error.message, stack: error.stack?.slice(0, 2000) });
  app.close().then(() => process.exit(1)).catch(() => process.exit(1));
});

logger.info('boot.listening', {
  host, port,
  production: isProduction,
  apiDocs: isProduction ? 'disabled' : '/api/docs',
  health: '/api/health',
  ready: '/api/ready',
  stateDir: diagnostics.stateDir,
  contractVersion: diagnostics.contractVersion,
  auth: diagnostics.liveEntra ? 'microsoft-entra' : 'dev-unsigned',
  // The allow-list is emitted as a COUNT, not as addresses: it is a list of real people's email
  // addresses and a boot line is not the place to publish them (C-23.11).
  allowlistCount: diagnostics.allowlist.length,
  corsOrigins: diagnostics.corsOrigins.length,
});
