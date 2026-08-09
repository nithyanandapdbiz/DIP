/**
 * TRACEABILITY: 03-intelligence-plane-architecture.md · 23-operational-excellence-model.md · ADR-0033
 *
 * LoggingInterceptor — one structured JSON line per request, on BOTH outcomes.
 *
 * TWO DEFECTS ARE FIXED HERE, AND THEY COMPOUNDED.
 *
 * 1. It logged through Nest's `Logger`, which `createApp()` disabled with `{ logger: false }`. Every
 *    call was a no-op: measured output across live requests was zero bytes.
 * 2. It used `tap(fn)`, the single-argument form, which fires ONLY on the success path. Even with the
 *    logger enabled, a failing request — the one worth logging — produced nothing.
 *
 * Together those meant the deployed platform had no access log and no error log at all. It now writes
 * through the injected structured logger and observes both `next` and `error`.
 *
 * CORRELATION. Every request carries a correlation id: the caller's `x-correlation-id` when supplied
 * (clamped — it is attacker-controlled and lands in every line), otherwise a generated one. It is echoed
 * in the response header so a client, a log line and an incident report can all name the same request.
 */
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomBytes } from 'node:crypto';
import { principalHandle, type Logger } from './structured-logger.js';
import { principalOf, type ApiDeps, type AuthOutcome } from '../engine/index.js';

/** Clamp a caller-supplied correlation id: unbounded input would amplify every log line it appears in. */
export function resolveCorrelationId(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 128);
  return `corr-${randomBytes(8).toString('hex')}`;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger, private readonly deps?: ApiDeps) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req: any = http.getRequest();
    const res: any = http.getResponse();
    const started = process.hrtime.bigint();

    const correlationId = resolveCorrelationId(req?.headers?.['x-correlation-id']);
    req.correlationId = correlationId;
    try { res.setHeader('x-correlation-id', correlationId); } catch { /* response may already be sent */ }

    // Resolve the caller for attribution ONLY. This is not an authorisation decision — `route()` remains
    // the sole authority on that — and a failure to resolve must never fail the request.
    //
    // AND THIS IS WHERE THE REJECTION REASON LIVES. `auth-refusal.ts` rules that `malformed`,
    // `bad-signature`, `expired` and `unsupported-scheme` are not distinguished on the wire —
    // the remedy is the same for all four, and separating `expired` from `bad-signature` would
    // tell whoever holds a token whether this deployment's signing secret has rotated. The
    // distinction is not DISCARDED though: it is recorded here, against the correlation id the
    // caller was handed, so an operator inside the trust boundary can answer "why was that
    // Execution Plane refused?" without the caller gaining an oracle. Collapsing a fact into a
    // log is not the same as not measuring it (CHARTER §17.1).
    let auth: AuthOutcome | undefined;
    try { auth = this.deps?.authenticate?.(req.headers); } catch { auth = undefined; }
    const principalId = principalOf(auth)?.id;

    const emit = (outcome: 'ok' | 'error', error?: unknown): void => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      this.logger.log(outcome === 'ok' ? 'info' : 'error', 'http.request', {
        method: req?.method ?? null,
        // The path, never the query string: a query string is caller-controlled and may carry values.
        path: String(req?.url ?? '').replace(/[?#].*$/, ''),
        status: res?.statusCode ?? null,
        durationMs: Number(ms.toFixed(2)),
        correlationId,
        principal: principalHandle(principalId) ?? null,
        // `auth` is the outcome, never a credential or any part of one: the three values are
        // `authenticated` / `absent` / `rejected`, and `authRejection` is a fixed vocabulary of
        // four. Nothing caller-supplied is interpolated, so this cannot become a log-injection
        // or a disclosure surface (C-23.11).
        auth: auth?.outcome ?? null,
        authRejection: auth?.outcome === 'rejected' ? auth.reason : null,
        outcome,
        ...(error ? { error: error instanceof Error ? error.message : 'unknown error' } : {}),
      });
    };

    return next.handle().pipe(tap({ next: () => emit('ok'), error: (e) => emit('error', e) }));
  }
}
