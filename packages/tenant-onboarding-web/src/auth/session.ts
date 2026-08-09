/**
 * TRACEABILITY: 08-security-model.md · ADR-0033
 *
 * Exchange a Microsoft id_token for a DBIZ session token. The API validates the token against Entra
 * AND enforces the DBIZ IP Admin email allow-list server-side (no database) — the browser can't bypass
 * it. A refusal returns a clear, non-technical message for the "no access" screen.
 */
import type { Principal } from '@dbiz/tenant-onboarding-engine';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export type Exchange =
  | { ok: true; token: string; principal: Principal }
  | { ok: false; status: number; message: string };

export async function exchangeMicrosoftToken(idToken: string): Promise<Exchange> {
  let res: Response;
  try {
    res = await window.fetch(`${BASE_URL}/api/auth/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the sign-in service. Please check the API is running and try again.' };
  }
  // A non-JSON body means the response did not come from this API — an edge proxy, WAF or static host
  // answered instead (the deployed symptom: `403 RBAC: access denied`, text/plain, from Azure Front
  // Door, because /api was never routed to the engine). Reporting a generic "sign-in failed" there
  // blames the credentials for what is a routing fault, so the status and body are carried through.
  const body = await res.text().catch(() => '');
  let data: { token?: string; error?: string; principal?: { id?: string; roles?: string[] } } = {};
  let isJson = false;
  try { data = JSON.parse(body); isJson = true; } catch { /* non-JSON handled below */ }

  if (res.ok && data.token) {
    // The principal is taken from the response, never defaulted. This previously fell back to
    // `['platform-admin']` when the field was absent — a default-to-admin in the one place whose job
    // is deciding what the operator may do. The server always sends it, so the fallback only ever
    // masked a contract break, and it masked it in the most permissive direction available.
    const id = data.principal?.id;
    const roles = data.principal?.roles as Principal['roles'] | undefined;
    if (!id || !roles?.length) {
      return {
        ok: false,
        status: res.status,
        message: 'Sign-in succeeded but the service did not say who you are, so no access was granted. Please try again, or contact your DBIZ platform administrator.',
      };
    }
    return { ok: true, token: data.token, principal: { id, roles } };
  }
  if (!isJson) {
    return {
      ok: false,
      status: res.status,
      message: `The sign-in service is not reachable at this address (HTTP ${res.status}${body ? `: ${body.slice(0, 120).trim()}` : ''}). `
        + 'The response did not come from the DBIZ API — check that /api is routed to it.',
    };
  }
  return { ok: false, status: res.status, message: data.error ?? `Sign-in failed (HTTP ${res.status}). Please try again.` };
}
