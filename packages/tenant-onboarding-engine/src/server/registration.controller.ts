/**
 * RegistrationController — the Execution-Plane trust-establishment surface. Kept THIN.
 *
 * TRACEABILITY: ADR-0036 (EP↔IP registration) · ADR-0033 (NestJS wraps the tested domain).
 *
 * NO LOGIC LIVES HERE. It adapts the NestJS request to the pure `handleRegistration()` handler —
 * the same function the node:http server calls — which validates the one-time credential, enforces
 * tenant/environment/contract binding, and mints the EP session credential. This route is
 * OTC-authenticated by design (the caller has no DBIZ session yet), so it is deliberately NOT behind
 * the session `authenticate` guard; the OTC is the proof, verified inside the handler.
 */
import { Controller, Post, Body, Headers, Res, Inject } from '@nestjs/common';
import { handleRegistration, type RegistrationDeps, type RegistrationRequest } from '../engine/index.js';
import { REGISTRATION_DEPS } from './tokens.js';

@Controller('api/register')
export class RegistrationController {
  constructor(@Inject(REGISTRATION_DEPS) private readonly deps: RegistrationDeps) {}

  @Post()
  register(
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationHeader: string | undefined,
    @Headers('x-dbiz-contract-version') versionHeader: string | undefined,
    @Res() res: { status: (n: number) => { json: (b: unknown) => void } },
  ): void {
    const b = (body ?? {}) as Record<string, unknown>;
    const req: RegistrationRequest = {
      ...(typeof b['otc'] === 'string' ? { otc: b['otc'] } : {}),
      ...(typeof b['tenantId'] === 'string' ? { tenantId: b['tenantId'] } : {}),
      ...(typeof b['executionPlaneId'] === 'string' ? { executionPlaneId: b['executionPlaneId'] } : {}),
      ...(typeof b['environment'] === 'string' ? { environment: b['environment'] } : {}),
      ...(typeof b['contractVersion'] === 'string' ? { contractVersion: b['contractVersion'] } : (versionHeader ? { contractVersion: versionHeader } : {})),
      ...(typeof b['correlationId'] === 'string' ? { correlationId: b['correlationId'] } : (correlationHeader ? { correlationId: correlationHeader } : {})),
    };
    const response = handleRegistration(req, this.deps);
    res.status(response.status).json(response.body);
  }
}
