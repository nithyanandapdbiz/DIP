/**
 * AuthController — Microsoft (Entra ID) sign-in → DBIZ session token. Kept THIN.
 *
 * TRACEABILITY: ADR-0033 (NestJS wraps the tested domain). All logic lives in resolveMicrosoftSession
 * (engine/microsoft-auth.ts): verify the Entra token, enforce the DBIZ IP Admin email allow-list, and
 * issue a stateless DBIZ session token. No database. The controller only adapts request/response.
 */
import { Controller, Post, Body, Res, Inject } from '@nestjs/common';
import { resolveMicrosoftSession, type MicrosoftAuthDeps } from '../engine/index.js';
import { MS_AUTH } from './tokens.js';

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(MS_AUTH) private readonly ms: MicrosoftAuthDeps) {}

  /** Exchange a Microsoft id_token for a DBIZ session token, or refuse with a clear message. */
  @Post('session')
  async session(@Body() body: unknown, @Res() res: { status: (n: number) => { json: (b: unknown) => void } }): Promise<void> {
    const idToken = typeof (body as { idToken?: unknown })?.idToken === 'string' ? (body as { idToken: string }).idToken : '';
    if (!idToken) { res.status(400).json({ error: 'A Microsoft id_token is required.' }); return; }
    const r = await resolveMicrosoftSession(idToken, this.ms.config, this.ms.verify);
    if (r.ok) {
      res.status(200).json({ token: r.token, principal: { id: r.principal.id, roles: r.principal.roles, role: 'DBIZ IP Admin' } });
    } else {
      res.status(r.status).json({ error: r.message, ...(r.email ? { email: r.email } : {}) });
    }
  }
}
