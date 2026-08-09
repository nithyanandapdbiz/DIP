/**
 * ApplicationTemplateController — the Application Template catalogue's HTTP surface. Kept THIN.
 *
 * TRACEABILITY: ADR-0033 (NestJS wraps the tested domain) · ADR-0021 (Platform Core owns the registry)
 *
 * WHY THIS FILE EXISTS. `route()` has served `GET /api/application-templates` since the wizard stopped
 * compiling the application list into the bundle — but NO controller mapped it, and NestJS is the only
 * transport in the deployed image. The live server therefore answered Nest's own 404 before `route()`
 * was ever reached, and the wizard's application step failed with "application templates unavailable:
 * request failed (404)" while every route()-level test passed.
 *
 * This is the third occurrence of that defect class (publish-update, branding, and now this one).
 * `controller-coverage.test.ts` guards it — it previously saw only `/api/tenants/:slug/<action>` paths,
 * so a TOP-LEVEL path was invisible to it; it now guards those too.
 *
 * NO LOGIC LIVES HERE. The catalogue, and the authentication it requires, are decided by `route()`.
 */
import { Controller, Get, Req, Res, Inject } from '@nestjs/common';
import { route, principalOf, AUTH_NOT_CONFIGURED, type ApiDeps } from '../engine/index.js';
import { TENANT_DEPS } from './tokens.js';

@Controller('api/application-templates')
export class ApplicationTemplateController {
  constructor(@Inject(TENANT_DEPS) private readonly deps: ApiDeps) {}

  /**
   * Platform metadata, not tenant data — authenticated (like the wizard) but not tenant-scoped.
   *
   * THIS IS THE ROUTE THE EXECUTION PLANE MEASURED AS AN UNDIAGNOSABLE 401 (OBL-002). It served
   * `authentication required` identically to a caller with no credential, a caller whose token
   * this deployment could not verify, and a deployment with no authenticator wired — so the far
   * side could not establish that its own grant was the problem, and correctly declined to guess.
   * The three are now distinct; the reason a credential was refused still is not. See
   * `auth-refusal.ts`, which owns that decision and the argument for it.
   */
  @Get()
  templates(@Req() req: any, @Res() res: any): void {
    if (!this.deps.authenticate) {
      res.status(AUTH_NOT_CONFIGURED.status).json(AUTH_NOT_CONFIGURED.body);
      return;
    }
    const auth = this.deps.authenticate(req.headers);
    const principal = principalOf(auth);
    const response = route(
      {
        method: 'GET', path: '/api/application-templates',
        ...(principal ? { principal } : {}),
        credentialPresented: auth.outcome === 'rejected',
      },
      this.deps,
    );
    for (const [k, v] of Object.entries(response.headers ?? {})) res.setHeader(k, v);
    res.status(response.status).json(response.body);
  }
}
