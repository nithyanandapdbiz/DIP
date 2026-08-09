/**
 * TRACEABILITY: 08-security-model.md · ADR-0033
 *
 * Microsoft (Entra ID) sign-in via MSAL. Config comes from the environment so no secret is baked in:
 *   VITE_AZURE_CLIENT_ID  — the Entra app registration's Application (client) ID
 *   VITE_AZURE_TENANT_ID  — your directory (tenant) ID   [default: 'organizations']
 * Leave VITE_AZURE_CLIENT_ID unset to fall back to local dev sign-in (see Login).
 *
 * ── ONE CALLBACK URL, AND WHY IT MUST RUN A SCRIPT ────────────────────────────────────────────────
 *
 * Both flows come back to /blank.html, which runs MSAL's redirect bridge (auth/redirect-bridge.ts).
 * In msal-browser v5 the opener does NOT read the response out of the popup's URL — the callback page
 * hands it back over a same-origin BroadcastChannel. A scriptless callback page (the v2/v3 pattern)
 * therefore hangs on `blank.html#code=…` until the opener fails with `popup_relay_timeout`. The
 * bridge also serves the redirect flow, caching the response and navigating back to the page sign-in
 * started from, so a second callback URL buys nothing.
 *
 * Register in Entra (App registration → Authentication → Single-page application; the SPA platform,
 * not Web — a Web-platform URI refuses cross-origin token redemption):
 *   https://inteligenceplane.dbizsolution.com/blank.html
 *   http://localhost:5173/blank.html      (local development)
 *
 * The instance is created lazily so importing this module is cheap and side-effect-free (tests, SSR).
 */
import { PublicClientApplication, type Configuration, type AuthenticationResult } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined;
const tenantId = (import.meta.env.VITE_AZURE_TENANT_ID as string | undefined) ?? 'organizations';

/** True when a real Entra app registration is configured; false → the UI offers dev sign-in. */
export const msalConfigured = Boolean(clientId);

/** The sign-in callback for BOTH flows. Must be the page that runs the redirect bridge. */
export const AUTH_CALLBACK_PATH = '/blank.html';
/** Where the redirect flow resumes; the bridge navigates back here and Login consumes the response. */
export const SIGN_IN_PATH = '/login';

const SCOPES = ['openid', 'profile', 'email'];

/**
 * Callback URLs are derived from the live origin rather than a build-time variable. The deployed
 * bundle already shipped with VITE_API_URL empty because an ad-hoc build omitted it; a redirect URI
 * that can be dropped the same way would fail in Entra rather than at a network call. Each origin is
 * registered in the app registration regardless, so deriving it adds no configuration step.
 */
const callbackUrl = (path: string): string => `${window.location.origin}${path}`;

let instance: PublicClientApplication | null = null;
function getInstance(): PublicClientApplication {
  if (!instance) {
    const config: Configuration = {
      auth: {
        clientId: clientId ?? 'unconfigured',
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: callbackUrl(AUTH_CALLBACK_PATH),
        // Sign-out lands on a real route, never on the callback page.
        postLogoutRedirectUri: callbackUrl(SIGN_IN_PATH),
      },
      // Tokens die with the tab. This is a platform-admin surface: it does not get localStorage.
      cache: { cacheLocation: 'sessionStorage' },
    };
    instance = new PublicClientApplication(config);
  }
  return instance;
}

// `initialize()` must complete before ANY other MSAL call, and exactly once — a second concurrent
// call (popup click racing the on-mount redirect check) would otherwise re-enter initialisation.
let initialization: Promise<void> | null = null;
async function ready(): Promise<PublicClientApplication> {
  const app = getInstance();
  if (!initialization) initialization = app.initialize();
  await initialization;
  return app;
}

/** True when the browser refused to open the sign-in popup, so the redirect flow should take over. */
export function isPopupBlocked(e: unknown): boolean {
  const code = (e as { errorCode?: string } | null)?.errorCode ?? '';
  return code === 'popup_window_error' || code === 'empty_window_error';
}

/** Open the Microsoft sign-in popup and return the id_token (a JWT the API validates against Entra). */
export async function signInWithMicrosoft(): Promise<string> {
  const app = await ready();
  const result: AuthenticationResult = await app.loginPopup({
    scopes: SCOPES,
    redirectUri: callbackUrl(AUTH_CALLBACK_PATH),
  });
  return result.idToken;
}

/**
 * Full-page redirect sign-in — the fallback when the popup is blocked. Navigates away, so it never
 * returns; the flow resumes in `completeRedirectSignIn()` when the browser comes back to /login.
 */
export async function signInWithRedirect(): Promise<never> {
  const app = await ready();
  await app.loginRedirect({ scopes: SCOPES, redirectUri: callbackUrl(AUTH_CALLBACK_PATH) });
  // The navigation is already committed; resolving here would let the caller render over it.
  return new Promise<never>(() => { /* navigating away */ });
}

/**
 * Consume a redirect-flow response if this page load is one. Returns the id_token when the browser
 * has just come back from Entra, and null on an ordinary visit — so /login can call it unconditionally.
 */
export async function completeRedirectSignIn(): Promise<string | null> {
  if (!msalConfigured) return null;
  const app = await ready();
  const result = await app.handleRedirectPromise();
  return result?.idToken ?? null;
}

/**
 * Re-establish a signed-in session WITHOUT user interaction, from MSAL's cached account.
 *
 * The DBIZ session lives in React state, so a page refresh used to drop it and bounce the operator
 * back to the sign-in screen mid-task. Microsoft still considers them signed in, so asking again is
 * a prompt with no question in it. This asks Entra silently instead.
 *
 * Returns null whenever interaction is genuinely required (no cached account, expired refresh token,
 * a Conditional Access policy demanding re-authentication). Null means "show the sign-in screen" —
 * never an error, because this runs on every page load and a failure here is the ordinary case for
 * anyone who has not signed in yet.
 */
export async function restoreSilentSignIn(): Promise<string | null> {
  if (!msalConfigured) return null;
  try {
    const app = await ready();
    const account = app.getActiveAccount() ?? app.getAllAccounts()[0];
    if (!account) return null;
    const result = await app.acquireTokenSilent({ scopes: SCOPES, account });
    return result.idToken ?? null;
  } catch {
    // Interaction required, or MSAL could not reach Entra. Either way: fall back to the button.
    return null;
  }
}
