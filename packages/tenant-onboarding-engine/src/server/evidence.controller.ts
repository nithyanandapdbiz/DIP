/**
 * EvidenceController — the Execution Plane returns evidence references (ADR-0082, D-128). Kept THIN.
 *
 * TRACEABILITY: ADR-0082 (P-82.2, P-82.5) · ADR-0033 (NestJS wraps the tested domain) · D-128.
 *
 * NO LOGIC LIVES HERE, AND ESPECIALLY NO AUTHORISATION. It adapts the NestJS request to the pure
 * `handleEvidenceIngress()` handler — the same function the node:http server calls — which
 * establishes, explicitly and in order: an authenticated principal, the EP-token revocation check,
 * the permission, the principal's tenant scope, and only then the reference itself.
 *
 * SELF-HANDLED: it never delegates to the tenant dispatcher. This path carries no tenant slug by
 * design, so it reaches none of the tenant router's checks — which is the whole reason its
 * authorisation is written out in one place rather than inherited from two.
 *
 * THE DISPATCHER IS NOT NAMED IN THIS FILE, AND THAT IS DELIBERATE, exactly as in
 * `package.controller.ts`: `verify-http-surface-parity` classifies a controller as
 * dispatcher-backed with a bare source regex over the RAW file, so a comment merely MENTIONING it
 * would make the gate demand a dispatcher route for this prefix and the honest description would
 * become the violation. The gate's own gap is recorded as debt (D-110), not worked around silently.
 *
 * THE PRINCIPAL IS RESOLVED FROM HEADERS. Nothing populates `req.principal` in this application —
 * no guard, no middleware, nowhere. A controller that read that field would answer 401 to the
 * rightful caller through the assembled app while passing every in-process test (D-111).
 */
import { Controller, Post, Body, Req, Res, Inject } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import { handleEvidenceIngress, principalOf, AUTH_NOT_CONFIGURED, type EvidenceIngressDeps } from '../engine/index.js';
import { EVIDENCE_DEPS } from './tokens.js';

@Controller('v1/evidence')
export class EvidenceController {
  constructor(@Inject(EVIDENCE_DEPS) private readonly deps: EvidenceIngressDeps) {}

  @Post()
  async receive(
    @Body() body: unknown,
    @Req() req: { headers: IncomingHttpHeaders },
    @Res() res: {
      status: (n: number) => { json: (b: unknown) => void };
      setHeader: (k: string, v: string) => void;
    },
  ): Promise<void> {
    // An unwired authenticator is 501, never 401 — answering 401 would report a deployment fault as
    // the caller's credential being bad, which is the distinction OBL-002 spent a cycle on.
    if (!this.deps.authenticate) {
      res.status(AUTH_NOT_CONFIGURED.status).json(AUTH_NOT_CONFIGURED.body);
      return;
    }
    const auth = this.deps.authenticate(req.headers);
    const principal = principalOf(auth);
    // AWAITED SINCE ADR-0082 §6 STEP 1: the handler resolves the reference's `packageHash` against
    // the run record store (P-82.5), so it reads storage and returns a promise. It still writes
    // nothing — step 3 is what makes this route durable.
    const response = await handleEvidenceIngress(
      {
        method: 'POST',
        path: '/v1/evidence',
        body,
        ...(principal ? { principal } : {}),
        credentialPresented: auth.outcome === 'rejected',
      },
      this.deps,
    );
    for (const [k, v] of Object.entries(response.headers ?? {})) res.setHeader(k, v);
    res.status(response.status).json(response.body);
  }
}
