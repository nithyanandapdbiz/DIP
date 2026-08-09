/**
 * Transport security controls — headers, CORS and rate limiting.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md §5a (the gateway enforces before any component sees a request)
 *   ADR          : ADR-0033 §R-33.5 (auth is a production precondition) · ADR-0019 (evidence over assertion)
 *
 * NODE STANDARD LIBRARY ONLY — NO NEW DEPENDENCY.
 * `helmet`, `cors` and `@nestjs/throttler` would each add supply-chain surface to a repository whose
 * `auth-tokens.ts` already declines a JWT library for exactly that reason, and whose lockfile carries
 * hand-maintained advisory overrides. These controls are a few dozen lines of header-setting and
 * counting; importing three packages to express them would trade a real, reviewable implementation for
 * transitive dependencies nobody in this repository reviews. Same rule the platform already applies.
 *
 * WHY THIS LIVES IN THE TRANSPORT AND NOT IN `route()`.
 * `route()` is the pure domain router — (method, path, body) → (status, body) — and it must stay pure so
 * the failure path is testable without a socket. Headers, origins and request counting are properties of
 * the CONNECTION, not of the domain decision. They belong here.
 *
 * INTERIM POSITION. `platform-runtime`'s `ApiGateway` implements the full model (mutual TLS, nonce replay
 * protection, per-tenant limits, audit) and is the architecture's answer. It is not yet wired to this
 * tier. This module closes the gap that exists TODAY at the tier that is actually deployed; adopting the
 * gateway remains the ADR-0021 target and supersedes this file rather than competing with it.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/** A minimal connect-style middleware, the shape both Express and the node:http adapter accept. */
export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

// ── Security headers ──────────────────────────────────────────────────────────

/**
 * Response headers applied to every response.
 *
 * The API returns JSON only and serves no user-controlled HTML, so the policy can be maximally
 * restrictive: `default-src 'none'` denies every subresource class rather than enumerating the ones
 * that happen to be known today. `frame-ancestors 'none'` supersedes X-Frame-Options for modern
 * browsers; X-Frame-Options is retained for older ones.
 *
 * HSTS is deliberately CONDITIONAL. Sending it over plaintext HTTP is meaningless, and sending it from
 * a local development instance pins `localhost` to HTTPS in the developer's browser for a year — a
 * genuinely disruptive, hard-to-diagnose side effect. It is emitted only when the request arrived over
 * TLS, which behind Azure Application Gateway means trusting `x-forwarded-proto` (see `trustProxy`).
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  // The server's identity is not a secret worth advertising; Express sets this by default.
  'x-powered-by': '',
};

export const HSTS_HEADER = 'max-age=31536000; includeSubDomains';

export interface SecurityHeaderOptions {
  /** Trust `x-forwarded-proto` when deciding whether the connection was TLS (true behind App Gateway). */
  readonly trustProxy?: boolean;
}

/** Apply the security headers to every response. */
export function securityHeaders(options: SecurityHeaderOptions = {}): Middleware {
  return (req, res, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (value === '') res.removeHeader(name);
      else res.setHeader(name, value);
    }
    const proto = options.trustProxy ? headerValue(req, 'x-forwarded-proto') : undefined;
    const secure = proto === 'https' || (req.socket as { encrypted?: boolean }).encrypted === true;
    if (secure) res.setHeader('strict-transport-security', HSTS_HEADER);
    next();
  };
}

// ── CORS ──────────────────────────────────────────────────────────────────────

/**
 * Cross-origin policy driven by an explicit allow-list.
 *
 * DENY BY DEFAULT, AND SILENTLY. An origin that is not allow-listed simply receives no
 * `Access-Control-Allow-Origin` header, so the browser refuses the response. There is no wildcard path:
 * `*` is incompatible with `Access-Control-Allow-Credentials` and, more importantly, this API is an
 * administrative surface — every legitimate caller is a known deployment whose origin can be named.
 *
 * An EMPTY allow-list means "same-origin only", which is the correct posture when the SPA is served
 * from the same host as the API. It is not a misconfiguration and must not fall back to permissive.
 */
export function cors(allowedOrigins: readonly string[]): Middleware {
  const allowed = new Set(allowedOrigins.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean));
  return (req, res, next) => {
    const origin = headerValue(req, 'origin');
    if (origin && allowed.has(origin.replace(/\/+$/, ''))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-credentials', 'true');
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('access-control-allow-headers', 'authorization,content-type,x-correlation-id,x-dbiz-contract-version');
      res.setHeader('access-control-max-age', '600');
      res.setHeader('vary', 'Origin');
    }
    // A pre-flight is answered whether or not the origin was allowed; without the allow headers above
    // the browser refuses it anyway, and answering keeps the response shape uniform.
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    next();
  };
}

// ── Request body limit ────────────────────────────────────────────────────────

/**
 * Reject an over-large body on its DECLARED length, before anything buffers it.
 *
 * WHY THIS AND NOT A PARSER OPTION. Nest 10 applies its Express body parser during
 * `NestFactory.create`, and `INestApplication.useBodyParser` only exists in Nest 11. Reconfiguring the
 * parser here would mean `bodyParser: false` plus a direct `express`/`body-parser` import — an
 * undeclared dependency on a transitive package, which is exactly the supply-chain habit this
 * repository avoids elsewhere. So the limit is enforced in two complementary places instead:
 *
 *   • THIS middleware refuses a declared `content-length` over the limit immediately, with a clean 413
 *     and no buffering at all — the cheapest possible rejection, and the one that matters for a
 *     deliberate memory-exhaustion attempt against `/api/register` (unauthenticated by design).
 *   • The parser's own limit still bounds a body that LIES about its length or omits it (chunked
 *     encoding). That failure now surfaces as 413 rather than 500, because `AllExceptionsFilter` maps
 *     `entity.too.large`.
 *
 * `MAX_BODY_BYTES` is set to the parser's effective limit so the advertised limit and the enforced one
 * are the same number. A documented limit that differs from the enforced one is worse than none.
 */
export function bodyLimit(maxBytes: number): Middleware {
  return (req, res, next) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.statusCode = 413;
      res.setHeader('content-type', 'application/json');
      res.setHeader('connection', 'close');
      res.end(JSON.stringify({ statusCode: 413, message: 'payload too large' }));
      return;
    }
    next();
  };
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Requests permitted per client per window. */
  readonly limit: number;
  readonly windowMs: number;
  /** Trust `x-forwarded-for` for the client address (true behind App Gateway). */
  readonly trustProxy?: boolean;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
  /** Paths that get their own, stricter budget — the unauthenticated ones. */
  readonly strict?: { readonly paths: readonly string[]; readonly limit: number };
}

/**
 * Fixed-window rate limiter, keyed by client address.
 *
 * WHY A STRICTER BUDGET FOR THE UNAUTHENTICATED PATHS. `/api/register` and `/api/auth/session` run
 * BEFORE the caller holds any DBIZ credential, so they are the two doors an attacker can knock on
 * without one: `/api/register` appends a line to the immutable audit trail on every attempt
 * (disk growth), and `/api/auth/session` is the Entra exchange (credential stuffing, and an outbound
 * JWKS fetch per attempt). They get a tighter budget than the authenticated surface.
 *
 * SINGLE-REPLICA CORRECTNESS, STATED NOT ASSUMED. The counter is in-process, so the effective limit is
 * per-replica. That is exact at `maxReplicas: 1` — the only topology this platform currently deploys
 * (KNOWN_LIMITATIONS L-2) — and becomes approximate the moment it scales out. The replacement is
 * already designed and certified: `DistributedStateProvider.incr()` is a shared, TTL-windowed counter.
 * Swapping this for it is part of the M-b scale-out, not a separate design problem.
 *
 * MEMORY IS BOUNDED. Expired buckets are swept on write, so the map cannot grow without limit under a
 * rotating-source-address attack — the failure mode a naive Map-based limiter introduces while trying
 * to prevent a different one.
 */
export function rateLimit(options: RateLimitOptions): Middleware {
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const strictPaths = new Set(options.strict?.paths ?? []);
  let lastSweep = 0;

  const sweep = (t: number): void => {
    if (t - lastSweep < options.windowMs) return;
    lastSweep = t;
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
  };

  return (req, res, next) => {
    const t = now();
    sweep(t);
    const path = (req.url ?? '/').replace(/[?#].*$/, '').replace(/\/+$/, '');
    const isStrict = strictPaths.has(path);
    const limit = isStrict && options.strict ? options.strict.limit : options.limit;
    const key = `${isStrict ? 's' : 'n'}:${clientAddress(req, options.trustProxy === true)}`;

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= t) { bucket = { count: 0, resetAt: t + options.windowMs }; buckets.set(key, bucket); }
    bucket.count += 1;

    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader('ratelimit-limit', String(limit));
    res.setHeader('ratelimit-remaining', String(remaining));
    res.setHeader('ratelimit-reset', String(Math.ceil((bucket.resetAt - t) / 1000)));

    if (bucket.count > limit) {
      res.setHeader('retry-after', String(Math.ceil((bucket.resetAt - t) / 1000)));
      res.statusCode = 429;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'rate limit exceeded' }));
      return;
    }
    next();
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The client address used as the rate-limit key.
 *
 * `x-forwarded-for` is caller-controlled and is honoured ONLY when the deployment declares it is behind
 * a proxy that overwrites it (Azure Application Gateway does). Trusting it unconditionally would let any
 * caller mint a fresh rate-limit bucket per request by varying the header — a limiter that defeats
 * itself. The LEFTMOST entry is taken as the originating client, which is correct for a single trusted
 * proxy; a multi-hop chain needs a hop count, which this deployment does not have.
 */
function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = headerValue(req, 'x-forwarded-for');
    const first = fwd?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
