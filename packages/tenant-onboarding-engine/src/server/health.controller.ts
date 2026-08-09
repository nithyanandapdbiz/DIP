/**
 * TRACEABILITY: 03-intelligence-plane-architecture.md · ADR-0034 · ADR-0033
 *
 * HealthController — liveness/readiness for the tenant web tier (P1).
 * Public (no tenant permission); reports the process is up and how many tenants exist.
 */
import { Controller, Get, Inject, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import type { ApiDeps } from '../engine/index.js';
import { buildIdentity, principalOf, AUTH_NOT_CONFIGURED } from '../engine/index.js';
import { TENANT_DEPS } from './tokens.js';

/**
 * HealthController — liveness and readiness.
 *
 * TWO DEFECTS ARE FIXED HERE.
 *
 * 1. COST. `health()` called `repo.list()`, which reads and JSON-parses EVERY tenant manifest from
 *    disk. On the Azure Files (SMB) mount this deployment actually specifies, each file operation costs
 *    a network round-trip rather than a page-cache hit, so the probe's cost grew linearly with the
 *    tenant count — on a SINGLE replica whose event loop is blocked for the whole scan, executed every
 *    10 s by the readiness probe and every 30 s by liveness. The probe was on course to become the
 *    outage it exists to detect. Liveness is now O(1).
 *
 * 2. DISCLOSURE. It returned the tenant count to unauthenticated callers — a customer-count metric
 *    published to anyone who can reach the ingress. The count moves behind authentication.
 *
 * SEPARATE LIVENESS FROM READINESS (closes KNOWN_LIMITATIONS L-3). `/api/health` answers "is this
 * process alive" and touches nothing. `/api/ready` answers "can it serve" and therefore DOES verify the
 * state directory is reachable and writable — the one dependency whose loss makes every tenant route
 * fail. Pointing both probes at one endpoint meant a container with a detached volume stayed in
 * rotation, serving 500s, because it was still alive.
 */
@Controller('api')
export class HealthController {
  constructor(@Inject(TENANT_DEPS) private readonly deps: ApiDeps) {}

  /** Liveness: the process is up. Touches no dependency — a dependency failure must not kill the pod. */
  @Get('health')
  health(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /**
   * Readiness: the process can serve. Verifies the durable store answers, in O(1).
   *
   * Returns 503 (not 200-with-a-status-field) when it cannot: a Kubernetes/Container Apps readiness
   * probe decides on the HTTP STATUS. A body saying "not-ready" under a 200 keeps the replica in
   * rotation, which is precisely the failure this endpoint exists to prevent.
   */
  @Get('ready')
  ready(): { status: string; checks: Record<string, string> } {
    try {
      this.deps.repo.probe();
    } catch {
      throw new ServiceUnavailableException({ status: 'not-ready', checks: { state: 'unavailable' } });
    }
    return { status: 'ready', checks: { state: 'ok' } };
  }

  /**
   * `GET /api/version` — THE COMMIT THIS DEPLOYMENT SERVES (D-144).
   *
   * ══ WHY IT IS A SEPARATE ROUTE AND NOT A FIELD ON `/api/health` ════════════════════════════════
   *
   * This controller's own reason for existing is that **liveness and readiness were conflated and a
   * container with a detached volume stayed in rotation serving 500s.** `health()` answers exactly
   * one question — *is this process alive* — and touches nothing. Adding build metadata to it
   * re-muddles a distinction that was deliberately drawn here, and it puts a field on the response
   * consumed every 30 s by a liveness probe that has no use for it.
   *
   * ══ WHY IT IS AUTHENTICATED, AND WHAT THAT COSTS ═══════════════════════════════════════════════
   *
   * **THE DISCLOSURE QUESTION IS ABOUT STALENESS, NOT ABOUT CODE.** The repository is private, so a
   * 40-hex SHA identifies nothing an anonymous caller can resolve. What it does reveal is
   * **how long this instance has been on the same commit** — and to a caller who should not have it,
   * an unchanging SHA across a published-fix window is a precise statement that the fix is not
   * applied. That is the same class of fact the tenant count was moved behind authentication for:
   * individually harmless, useful in aggregate and over time, and offered to anyone who can reach
   * the ingress.
   *
   * **AUTHENTICATED IS THE CONSERVATIVE DEFAULT AND IS DELIBERATELY REVERSIBLE.** Every party with a
   * legitimate need already holds a credential — this plane's own gate, and an Execution Plane
   * confirming what it is talking to. **Relaxing this to unauthenticated is one line; withdrawing a
   * value that has been published anonymously is not.** The ruling on where this belongs is recorded
   * in the D-144 disclosure report; if it goes the other way, this decorator moves and nothing else
   * changes.
   *
   * ══ `unknown` IS RETURNED, NOT SUPPRESSED ══════════════════════════════════════════════════════
   *
   * An artefact built without the build arg answers `{"commit":"unknown","known":false}`. **A gate
   * must be able to tell *"I was not built from a commit"* from *"I was built from commit X"***;
   * omitting the field would make a dev container indistinguishable from an up-to-date deployment.
   */
  @Get('version')
  version(@Req() req: any, @Res() res: any): void {
    if (!this.deps.authenticate) {
      res.status(AUTH_NOT_CONFIGURED.status).json(AUTH_NOT_CONFIGURED.body);
      return;
    }
    const auth = this.deps.authenticate(req.headers);
    if (!principalOf(auth)) {
      res.status(401).json({ error: 'authentication required' });
      return;
    }
    res.status(200).json(buildIdentity());
  }
}
