/**
 * TRACEABILITY: 08-security-model.md · ADR-0033
 *
 * THE AUTH CALLBACK. Entra redirects here (blank.html) after sign-in, and this is the only script
 * that page loads.
 *
 * WHY A SCRIPT IS REQUIRED HERE. @azure/msal-browser v5 does not read the response out of the popup's
 * URL from the opener — the callback page hands it back itself, over a same-origin BroadcastChannel.
 * A genuinely empty callback page (the MSAL v2/v3 pattern) therefore never completes sign-in: the
 * popup sits on `blank.html#code=…` showing a white screen until the opener times out with
 * `popup_relay_timeout`. `broadcastResponseToMainFrame` is what MSAL ships for this, as its own
 * `@azure/msal-browser/redirect-bridge` entry point.
 *
 * It serves BOTH flows, which is why one callback URL is enough:
 *   popup    — broadcasts the response to the opener, then closes this window.
 *   redirect — caches the response and navigates back to the page sign-in started from, where
 *              `handleRedirectPromise()` picks it up (see auth/msal.ts, pages/Login.tsx).
 *
 * It is kept apart from the application bundle deliberately: this window only carries an auth
 * response, so it loads no React, no router and no API client.
 */
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

broadcastResponseToMainFrame().catch((e: unknown) => {
  // This window is normally invisible and closes itself, so a silent failure here looks to the user
  // exactly like the bug this file exists to fix: a white screen that never resolves. Say something.
  console.error('Microsoft sign-in callback failed', e);
  document.title = 'Sign-in failed';
  const message = e instanceof Error ? e.message : String(e);
  document.body.textContent =
    `Sign-in could not be completed: ${message}. You can close this window and try again.`;
});
