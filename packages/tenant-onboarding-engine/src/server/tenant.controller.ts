/**
 * TenantController — the production HTTP surface, kept deliberately THIN.
 *
 * TRACEABILITY
 *   ADR : ADR-0033 (NestJS wraps the tested domain) · ADR-0032 (every route operates on the SSOT)
 *
 * NO BUSINESS LOGIC LIVES HERE. Each handler forwards to the already-tested `route()` — the same
 * pure function the node:http server used — which enforces RBAC and calls the repository/onboard().
 * The controller only adapts NestJS request/response to the domain's request/response. Authorisation,
 * validation, orchestration and persistence are all reused, not reimplemented.
 */
import { Controller, Get, Post, Patch, Delete, Param, Body, Req, Res, Inject } from '@nestjs/common';
import { route, handleWorkRequest, principalOf, AUTH_NOT_CONFIGURED, type ApiDeps } from '../engine/index.js';
import { TENANT_DEPS } from './tokens.js';

@Controller('api/tenants')
export class TenantController {
  constructor(@Inject(TENANT_DEPS) private readonly deps: ApiDeps) {}

  /** The single adapter: resolve the caller, delegate to route(), write the domain response. */
  private forward(method: string, path: string, body: unknown, req: any, res: any): void {
    // An unwired authenticator cannot evaluate a credential, so it makes no statement about one:
    // 501, never 401. See `auth-refusal.ts` — a 401 here sends the caller to rotate a grant that
    // was never the problem, which is D-111's shape on the authentication seam.
    if (!this.deps.authenticate) {
      res.status(AUTH_NOT_CONFIGURED.status).json(AUTH_NOT_CONFIGURED.body);
      return;
    }
    const auth = this.deps.authenticate(req.headers);
    const principal = principalOf(auth);
    const response = route(
      {
        method, path,
        ...(body !== undefined ? { body } : {}),
        ...(principal ? { principal } : {}),
        credentialPresented: auth.outcome === 'rejected',
      },
      this.deps,
    );
    for (const [k, v] of Object.entries(response.headers ?? {})) res.setHeader(k, v);
    res.status(response.status).json(response.body);
  }

  @Post() createTenant(@Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', '/api/tenants', body, req, res);
  }
  @Get() listTenants(@Req() req: any, @Res() res: any): void {
    this.forward('GET', '/api/tenants', undefined, req, res);
  }
  @Get(':slug') getTenant(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('GET', `/api/tenants/${slug}`, undefined, req, res);
  }
  @Get(':slug/manifest') getManifest(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('GET', `/api/tenants/${slug}/manifest`, undefined, req, res);
  }
  @Patch(':slug/connect') connect(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('PATCH', `/api/tenants/${slug}/connect`, body, req, res);
  }
  @Patch(':slug/discovery') discovery(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('PATCH', `/api/tenants/${slug}/discovery`, body, req, res);
  }
  @Patch(':slug/recommendations') recommendations(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('PATCH', `/api/tenants/${slug}/recommendations`, body, req, res);
  }
  @Patch(':slug/review') review(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('PATCH', `/api/tenants/${slug}/review`, undefined, req, res);
  }
  @Post(':slug/activate') activate(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/activate`, undefined, req, res);
  }
  @Post(':slug/solution') solution(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/solution`, undefined, req, res);
  }
  @Post(':slug/ep-token') epToken(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/ep-token`, undefined, req, res);
  }
  @Post(':slug/otc') otc(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/otc`, undefined, req, res);
  }
  // ── Post-activation lifecycle governance (IP-owned) — forwarded to the same pure route(). ──
  @Post(':slug/suspend') suspend(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/suspend`, body, req, res);
  }
  @Post(':slug/reactivate') reactivate(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/reactivate`, body, req, res);
  }
  @Post(':slug/archive') archive(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/archive`, body, req, res);
  }
  @Patch(':slug/capabilities') capabilities(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('PATCH', `/api/tenants/${slug}/capabilities`, body, req, res);
  }
  @Patch(':slug/integrations') integrations(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('PATCH', `/api/tenants/${slug}/integrations`, body, req, res);
  }
  @Patch(':slug/configuration') configuration(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('PATCH', `/api/tenants/${slug}/configuration`, body, req, res);
  }
  @Patch(':slug/branding') branding(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('PATCH', `/api/tenants/${slug}/branding`, body, req, res);
  }
  /**
   * `GET /api/tenants/{slug}/work` — ADR-0080 P-80.2, the work request exchange.
   *
   * THE ONE HANDLER THAT DOES NOT GO THROUGH `route()`, AND ITS AUTHORISATION IS STILL THE ROUTER'S.
   * It reads the run record store, so it is asynchronous and `route()` is pure and synchronous.
   * `handleWorkRequest` calls `authoriseTenantRequest` — the very function `route()` calls — so
   * slug validation, `permissionForRoute`, `can`, `mayAccessTenant` and EP-token revocation all
   * apply here without a line of them being restated. **A hand-written auth block on this route
   * would be a defect, not a variation (P-80.2).**
   */
  @Get(':slug/work') async work(@Param('slug') slug: string, @Req() req: any, @Res() res: any): Promise<void> {
    if (!this.deps.authenticate) {
      res.status(AUTH_NOT_CONFIGURED.status).json(AUTH_NOT_CONFIGURED.body);
      return;
    }
    const auth = this.deps.authenticate(req.headers);
    const principal = principalOf(auth);
    const response = await handleWorkRequest(
      {
        method: 'GET', path: `/api/tenants/${slug}/work`,
        ...(principal ? { principal } : {}),
        credentialPresented: auth.outcome === 'rejected',
      },
      this.deps,
    );
    for (const [k, v] of Object.entries(response.headers ?? {})) res.setHeader(k, v);
    res.status(response.status).json(response.body);
  }

  @Get(':slug/updates') updates(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('GET', `/api/tenants/${slug}/updates`, undefined, req, res);
  }
  @Post(':slug/updates') ackUpdate(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/updates`, body, req, res);
  }
  // ── Software Update Management (ADR-0035) — forwarded to the same pure route() (INV-3 pull-only). ──
  @Post(':slug/publish-update') publishUpdate(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/publish-update`, body, req, res);
  }
  @Post(':slug/sync-config') syncConfig(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/sync-config`, undefined, req, res);
  }
  @Post(':slug/installed') installed(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/installed`, body, req, res);
  }
  @Get(':slug/update-history') updateHistory(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('GET', `/api/tenants/${slug}/update-history`, undefined, req, res);
  }
  @Post(':slug/check-compatibility') checkCompatibility(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/check-compatibility`, body, req, res);
  }
  @Post(':slug/rollback') rollback(@Param('slug') slug: string, @Body() body: unknown, @Req() req: any, @Res() res: any): void {
    this.forward('POST', `/api/tenants/${slug}/rollback`, body, req, res);
  }
  @Delete(':slug') deleteTenant(@Param('slug') slug: string, @Req() req: any, @Res() res: any): void {
    this.forward('DELETE', `/api/tenants/${slug}`, undefined, req, res);
  }
}
