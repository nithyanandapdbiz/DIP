/**
 * WorkPathController — the deployed surface for work-path distribution. Kept THIN.
 *
 * TRACEABILITY
 *   Architecture : 05-cross-plane-communication.md (R-05.27) · 17-deployment-topology.md (R-17.24)
 *   ADR          : ADR-0033 (NestJS wraps the tested domain) · ADR-0080 §6 · ADR-0007 §6 (rotation)
 *   Debt         : D-147 — the missing caller this closes
 *
 * WHY THIS FILE EXISTS. `publishWorkPaths` had **zero non-test callers**: the engine could tell a
 * tenancy where to ask for work, and no deployment had any way to ask it to. That is the same defect
 * class `controller-coverage.test.ts` and `verify-http-surface-parity.js` were built for — a
 * capability that is implemented, tested and unreachable — arriving one layer lower than either
 * looks, which is why the **operator-writer census** (`verify-operator-writer-census.js`) exists
 * above them and stays RED until this controller is mounted.
 *
 * NO LOGIC LIVES HERE. Authorisation, the read/sweep split and the response shape are all decided by
 * `route()` → `handleWorkPathDistribution`. This adapts NestJS request/response and nothing else.
 */
import { Controller, Get, Post, Req, Res, Inject } from '@nestjs/common';
import { route, principalOf, AUTH_NOT_CONFIGURED, type ApiDeps } from '../engine/index.js';
import { TENANT_DEPS } from './tokens.js';

@Controller('api/work-paths')
export class WorkPathController {
  constructor(@Inject(TENANT_DEPS) private readonly deps: ApiDeps) {}

  /** The single adapter — identical in shape to `TenantController.forward`, which it deliberately mirrors. */
  private forward(method: string, req: any, res: any): void {
    // An unwired authenticator makes no statement about a credential: 501, never 401 (`auth-refusal.ts`).
    if (!this.deps.authenticate) {
      res.status(AUTH_NOT_CONFIGURED.status).json(AUTH_NOT_CONFIGURED.body);
      return;
    }
    const auth = this.deps.authenticate(req.headers);
    const principal = principalOf(auth);
    const response = route(
      {
        method, path: '/api/work-paths',
        ...(principal ? { principal } : {}),
        credentialPresented: auth.outcome === 'rejected',
      },
      this.deps,
    );
    for (const [k, v] of Object.entries(response.headers ?? {})) res.setHeader(k, v);
    res.status(response.status).json(response.body);
  }

  /**
   * Which registered tenancies have never been sent their current work path.
   *
   * READS AND EMITS NOTHING, and it is a separate verb rather than a field on the sweep's response
   * because `work-path-distribution.ts` separated the two on purpose: asking who is stranded must
   * not require the authority to fix it, and must not fix it as a side effect.
   */
  @Get() undistributed(@Req() req: any, @Res() res: any): void {
    this.forward('GET', req, res);
  }

  /**
   * Sweep: send every registered tenancy its current work path.
   *
   * ON DEMAND, NEVER SCHEDULED — D-147's ruling. The module kept the trigger a decision; a schedule
   * would answer it silently and would put an unattended writer in the deployment, which is a
   * different security posture and needs its own owner. Idempotent by comparison, so a second call
   * emits nothing.
   */
  @Post() sweep(@Req() req: any, @Res() res: any): void {
    this.forward('POST', req, res);
  }
}
