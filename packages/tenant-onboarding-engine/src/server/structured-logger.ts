/**
 * Structured request/error logging for the deployed API tier.
 *
 * TRACEABILITY
 *   Architecture : 23-operational-excellence-model.md §5.7 (operational telemetry) ·
 *                  06-data-sovereignty.md (INV-2 — no customer secret leaves, and none is logged)
 *   Criteria     : C-23.11 (operational telemetry contains no C1/C2 data)
 *
 * WHY THIS EXISTS.
 * `createApp()` built the Nest application with `{ logger: false }`, which disables the Nest logger
 * globally. `LoggingInterceptor` then called `this.logger.log(...)` into that disabled logger, and
 * `AllExceptionsFilter` did not log at all. Measured result: ZERO bytes of output across live requests.
 * The deployed platform recorded no access log, no authentication failure, no authorisation denial and
 * no 500 — so an incident left no trace whatsoever, and a destructive request would have been invisible.
 *
 * WHY NOT SIMPLY RE-ENABLE THE NEST LOGGER.
 * Nest's default logger writes human-prose lines with ANSI colour. Azure Container Apps ships stdout to
 * Log Analytics, which indexes JSON and treats prose as an opaque string — so prose is unqueryable at
 * exactly the moment it matters. One JSON object per line is the format the platform can actually
 * operate on, and it costs nothing.
 *
 * THE CONTENT RULE IS ENFORCED, NOT REQUESTED.
 * `@dbiz/observability` establishes the principle that a logging API which accepts arbitrary values
 * will eventually be handed one. The same discipline applies here in the form the risk actually takes
 * at this tier: this module never logs a request body, never logs headers, and passes every emitted
 * string through a redactor that refuses bearer tokens, one-time credentials, PEM key material and
 * JWT-shaped values. The principal is logged as a stable SHA-256 prefix rather than an email address,
 * so a log line attributes an action to an operator without turning the log into a PII store.
 */
import { createHash } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Value shapes that must never reach a log line, detected by SHAPE rather than by field name.
 * Matching on names alone fails the moment a value arrives in a field nobody predicted.
 */
const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  [/-----BEGIN (?:RSA |EC |ED25519 )?PRIVATE KEY-----[\s\S]*?-----END [^-]*-----/g, '[redacted:private-key]'],
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, '[redacted:jwt]'],
  [/\botc_[A-Za-z0-9_-]{8,}/g, '[redacted:otc]'],
  [/\b(?:bearer)\s+\S+/gi, 'bearer [redacted]'],
  [/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[redacted:email]'],
];

/** Longest permitted value. Beyond this it is content, not an identifier. */
const MAX_VALUE_LENGTH = 512;

export function redact(value: string): string {
  let out = value;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out.length > MAX_VALUE_LENGTH ? `${out.slice(0, MAX_VALUE_LENGTH)}…[truncated]` : out;
}

/**
 * A stable, non-reversible handle for a principal.
 *
 * The audit question is "was it the same actor?", not "what is their email address". A truncated digest
 * answers the first without putting an identity in every log line — and it correlates across lines,
 * which a blanket `[redacted]` would not.
 */
export function principalHandle(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return `p_${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
}

export interface LogFields {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface Logger {
  readonly level: LogLevel;
  log(level: LogLevel, event: string, fields?: LogFields): void;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  /** Sink for the serialised line. Injected so tests capture output without touching stdout. */
  readonly sink?: (line: string) => void;
  /** Clock, injected for deterministic tests. */
  readonly now?: () => Date;
}

/** One JSON object per line, on stdout — the format Azure Log Analytics and every log shipper index. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const sink = options.sink ?? ((line: string) => { process.stdout.write(`${line}\n`); });
  const now = options.now ?? (() => new Date());
  const threshold = LEVEL_ORDER[level];

  const log = (lvl: LogLevel, event: string, fields: LogFields = {}): void => {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const record: Record<string, unknown> = { ts: now().toISOString(), level: lvl, event };
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      record[k] = typeof v === 'string' ? redact(v) : v;
    }
    // A logger must never be able to take the process down. A serialisation failure degrades to a
    // minimal line rather than throwing inside a request handler.
    try { sink(JSON.stringify(record)); }
    catch { sink(JSON.stringify({ ts: now().toISOString(), level: 'error', event: 'log.serialisation-failed' })); }
  };

  return {
    level,
    log,
    debug: (e, f) => log('debug', e, f),
    info: (e, f) => log('info', e, f),
    warn: (e, f) => log('warn', e, f),
    error: (e, f) => log('error', e, f),
  };
}

/** A logger that discards everything — for tests that assert on behaviour rather than output. */
export const SILENT_LOGGER: Logger = createLogger({ level: 'error', sink: () => {} });
