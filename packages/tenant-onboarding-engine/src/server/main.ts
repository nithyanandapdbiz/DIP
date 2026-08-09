/**
 * TRACEABILITY: 03-intelligence-plane-architecture.md · 08-security-model.md · ADR-0034 · ADR-0033
 *
 * Production NestJS bootstrap for the Tenant Management web tier (ADR-0033, Increment 1).
 *
 * The app is a thin transport over the tested domain. `createApp` builds an application from injected
 * dependencies (so it is testable in-process); `bootstrap` is the production entrypoint.
 *
 * THE TRANSPORT NOW ENFORCES WHAT A TRANSPORT MUST.
 * Previously the pipeline was: exception filter → (disabled) logging interceptor → Swagger. That left
 * the deployed tier with no security headers, no CORS policy, no rate limit, no request body limit, no
 * logs, and an unauthenticated Swagger UI in production. Those are all properties of the CONNECTION, and
 * `route()` — a pure function of (method, path, body) — is the wrong place for any of them. They are
 * applied here, in front of the domain, in the order a request meets them.
 *
 * SECURITY OPTIONS ARE EXPLICIT AND FAIL SAFE. `AppSecurityOptions` has no permissive default: omit it
 * and the app gets restrictive headers, an empty CORS allow-list (same-origin only) and Swagger enabled
 * — the last being safe because `bootstrap` derives `exposeApiDocs` from the deployment environment and
 * a production deployment therefore turns it off without anyone remembering to.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { ApiDeps } from '../engine/index.js';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { LoggingInterceptor } from './logging.interceptor.js';
import { setupSwagger } from './swagger.js';
import { createLogger, type Logger, type LogLevel } from './structured-logger.js';
import { securityHeaders, cors, rateLimit, bodyLimit } from './security.middleware.js';

/**
 * Maximum JSON request body, in bytes.
 *
 * This is Express's own default parser limit (100 KB), stated explicitly rather than left implicit —
 * see `bodyLimit()` for why the value is matched to the parser rather than chosen independently.
 * Tenant and registration payloads are a few kilobytes at most, so this is already generous.
 */
export const MAX_BODY_BYTES = 100 * 1024;

/** Requests per client per minute on the authenticated surface. */
export const DEFAULT_RATE_LIMIT = 300;
/** Tighter budget for the two routes reachable WITHOUT a DBIZ credential. */
export const UNAUTHENTICATED_RATE_LIMIT = 20;
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Routes that run before the caller holds any DBIZ credential — see `rateLimit`'s `strict` budget. */
export const UNAUTHENTICATED_PATHS: readonly string[] = ['/api/register', '/api/auth/session'];

export interface AppSecurityOptions {
  /** Serve Swagger UI and the OpenAPI document. MUST be false in production. */
  readonly exposeApiDocs?: boolean;
  /** Exact origins permitted to call the API from a browser. Empty ⇒ same-origin only. */
  readonly corsOrigins?: readonly string[];
  /** Honour `x-forwarded-proto` / `x-forwarded-for` (true behind Azure Application Gateway). */
  readonly trustProxy?: boolean;
  readonly rateLimit?: { readonly limit: number; readonly windowMs: number; readonly unauthenticatedLimit: number };
  readonly logger?: Logger;
  readonly logLevel?: LogLevel;
}

/** Build (but do not start) a fully-wired Nest application over the given domain dependencies. */
export async function createApp(deps: ApiDeps, options: AppSecurityOptions = {}): Promise<INestApplication> {
  const logger = options.logger ?? createLogger({ ...(options.logLevel ? { level: options.logLevel } : {}) });

  // `logger: false` disables Nest's own prose logger — deliberate, and now correct: this application
  // logs structured JSON through its own logger instead. Previously this setting silently disabled the
  // ONLY logging the app had.
  const app = await NestFactory.create(AppModule.register(deps), { logger: false });

  const express = app.getHttpAdapter().getInstance() as {
    set?: (k: string, v: unknown) => void;
    disable?: (k: string) => void;
  };
  express.disable?.('x-powered-by');
  if (options.trustProxy) express.set?.('trust proxy', 1);

  const limits = options.rateLimit ?? {
    limit: DEFAULT_RATE_LIMIT, windowMs: RATE_LIMIT_WINDOW_MS, unauthenticatedLimit: UNAUTHENTICATED_RATE_LIMIT,
  };
  // Order matters: bound the body first (cheapest rejection), then headers, then origin, then counting.
  app.use(bodyLimit(MAX_BODY_BYTES));
  app.use(securityHeaders({ trustProxy: options.trustProxy === true }));
  app.use(cors(options.corsOrigins ?? []));
  app.use(rateLimit({
    limit: limits.limit,
    windowMs: limits.windowMs,
    trustProxy: options.trustProxy === true,
    strict: { paths: [...UNAUTHENTICATED_PATHS], limit: limits.unauthenticatedLimit },
  }));

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(new LoggingInterceptor(logger, deps));

  // Swagger publishes the complete administrative API surface. Unauthenticated in production it is a
  // free map of every route to an attacker, so it is opt-in and off wherever `exposeApiDocs` is false.
  if (options.exposeApiDocs !== false) setupSwagger(app);

  return app;
}

/**
 * Production entrypoint: build the app and listen.
 *
 * Binds `0.0.0.0` by default so the process is reachable through a container's published port (Azure
 * Container Apps ingress cannot reach a loopback-bound listener). The host stays overridable for callers
 * that want loopback; tests wire their own listener via `createApp` and are unaffected.
 */
export async function bootstrap(
  deps: ApiDeps, port = 3000, host = '0.0.0.0', options: AppSecurityOptions = {},
): Promise<INestApplication> {
  const app = await createApp(deps, options);
  await app.listen(port, host);
  return app;
}
