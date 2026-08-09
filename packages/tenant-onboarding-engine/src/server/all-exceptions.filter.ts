/**
 * TRACEABILITY: 03-intelligence-plane-architecture.md · ADR-0034 · ADR-0033
 *
 * AllExceptionsFilter — one stable error contract, and the place unexpected failures get RECORDED.
 *
 * THREE DEFECTS ARE FIXED HERE.
 *
 * 1. NOTHING WAS LOGGED. An unhandled exception produced a 500 response and no record of any kind, so
 *    the only evidence a failure had occurred was the client's own copy of it. The exception is now
 *    logged with its stack, at `error`, before the response is written.
 *
 * 2. AN OVERSIZED BODY RETURNED 500. Express's body parser throws `PayloadTooLargeError`, which is not
 *    an `HttpException`, so it fell through to the 500 branch — measured: a 2 MB body returned 500. A
 *    client could not distinguish "your request is too large" (their fault, retryable after shrinking)
 *    from "the platform is broken" (ours), and the 500 rate — the signal any future SLO is built on —
 *    was polluted by ordinary client error. Payload and malformed-JSON failures are now mapped to their
 *    correct 4xx codes.
 *
 * 3. INTERNAL DETAIL LEAKED. Raw parser text such as `Unexpected token 'N', "NOT JSON" is not valid
 *    JSON` reached the caller — internal state disclosed (CWE-209). Unexpected exceptions now return a
 *    fixed message; the detail goes to the log, tied to the correlation id so support can still find it.
 *
 * THE CONTRACT IS DELIBERATELY UNCHANGED in shape: `{ statusCode, message, path, timestamp }`, plus
 * `correlationId`. Existing clients keep parsing what they already parse.
 */
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Logger } from './structured-logger.js';

/** Client-caused failures thrown by the transport rather than by the domain, and their correct codes. */
export function classifyTransportError(exception: unknown): { status: number; message: string } | null {
  const e = exception as { type?: string };
  // body-parser tags its failures with `type`; map each to the code the caller can act on.
  if (e?.type === 'entity.too.large') return { status: 413, message: 'payload too large' };
  if (e?.type === 'entity.parse.failed') return { status: 400, message: 'invalid JSON body' };
  if (e?.type === 'charset.unsupported') return { status: 415, message: 'unsupported charset' };
  if (e?.type === 'encoding.unsupported') return { status: 415, message: 'unsupported content encoding' };
  return null;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res: any = ctx.getResponse();
    const req: any = ctx.getRequest();
    const correlationId: string | undefined = req?.correlationId;
    const path = String(req?.url ?? '').replace(/[?#].*$/, '') || null;

    const transport = classifyTransportError(exception);
    const isHttp = exception instanceof HttpException;
    const status = transport?.status ?? (isHttp ? exception.getStatus() : 500);
    const message = transport?.message ?? (isHttp ? exception.message : 'internal error');

    // A 5xx is OUR failure and always carries the full detail to the log. A 4xx is the caller's and is
    // recorded at warn without a stack — otherwise ordinary client error drowns the signal that matters.
    if (status >= 500) {
      this.logger.error('http.unhandled-exception', {
        path, status, correlationId: correlationId ?? null,
        error: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack?.slice(0, 2000) : undefined,
      });
    } else {
      this.logger.warn('http.client-error', { path, status, correlationId: correlationId ?? null, error: message });
    }

    if (res?.headersSent) return;
    res.status(status).json({
      statusCode: status,
      message,
      path,
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
    });
  }
}
