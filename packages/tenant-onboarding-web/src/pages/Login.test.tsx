/**
 * TRACEABILITY: 08-security-model.md · ADR-0033
 *
 * The sign-in callback contract. Three properties, each of which was a real defect:
 *
 *   1. /login is the REDIRECT-flow callback. If it does not consume the response on mount, the
 *      redirect fallback returns from Entra and silently does nothing.
 *   2. A blocked popup degrades to the redirect flow. It previously dead-ended, which locks every
 *      platform administrator out of the console when a browser policy forbids popups.
 *   3. A failure reports WHAT failed. Every MSAL error was previously reported as "cancelled", so a
 *      misconfigured deployment was indistinguishable from a user closing the window.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Login } from './Login';
import { AuthProvider } from '../auth/AuthContext';

const msal = vi.hoisted(() => ({
  msalConfigured: true,
  signInWithMicrosoft: vi.fn(),
  signInWithRedirect: vi.fn(),
  completeRedirectSignIn: vi.fn(),
  restoreSilentSignIn: vi.fn(),
  isPopupBlocked: (e: unknown) => {
    const code = (e as { errorCode?: string } | null)?.errorCode ?? '';
    return code === 'popup_window_error' || code === 'empty_window_error';
  },
}));
vi.mock('../auth/msal', () => msal);

const session = vi.hoisted(() => ({ exchangeMicrosoftToken: vi.fn() }));
vi.mock('../auth/session', () => session);

const wrap = (): JSX.Element => (
  <MemoryRouter><AuthProvider><Login /></AuthProvider></MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  msal.completeRedirectSignIn.mockResolvedValue(null);
  // Default: nobody is already signed in with Microsoft, so the restore finds nothing.
  msal.restoreSilentSignIn.mockResolvedValue(null);
});

describe('Login — Microsoft sign-in callbacks', () => {
  test('consumes a redirect-flow response on mount and exchanges it for a DBIZ session', async () => {
    msal.completeRedirectSignIn.mockResolvedValue('id-token-from-redirect');
    session.exchangeMicrosoftToken.mockResolvedValue({
      ok: true, token: 'dbiz-session', principal: { id: 'a@b.test', roles: ['platform-admin'] },
    });

    render(wrap());

    await waitFor(() => expect(session.exchangeMicrosoftToken).toHaveBeenCalledWith('id-token-from-redirect'));
    // The popup was never opened: this page load WAS the callback.
    expect(msal.signInWithMicrosoft).not.toHaveBeenCalled();
  });

  test('an ordinary visit is not treated as a callback — the sign-in button renders', async () => {
    render(wrap());

    expect(await screen.findByRole('button', { name: /sign in with microsoft/i })).toBeEnabled();
    expect(session.exchangeMicrosoftToken).not.toHaveBeenCalled();
  });

  test('a blocked popup falls back to the redirect flow instead of dead-ending', async () => {
    msal.signInWithMicrosoft.mockRejectedValue({ errorCode: 'popup_window_error' });
    msal.signInWithRedirect.mockImplementation(() => new Promise(() => { /* navigates away */ }));

    render(wrap());
    fireEvent.click(await screen.findByRole("button", { name: /sign in with microsoft/i }));

    await waitFor(() => expect(msal.signInWithRedirect).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a genuine cancellation says cancelled, and nothing else does', async () => {
    msal.signInWithMicrosoft.mockRejectedValue({ errorCode: 'user_cancelled' });

    render(wrap());
    fireEvent.click(await screen.findByRole("button", { name: /sign in with microsoft/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/i);
    expect(msal.signInWithRedirect).not.toHaveBeenCalled();
  });

  test('a refresh restores the session silently — no sign-in screen, no click', async () => {
    // The defect this covers: the DBIZ token lives in memory, so a refresh dropped it and returned a
    // signed-in administrator to the sign-in screen to answer a question Microsoft had already answered.
    msal.restoreSilentSignIn.mockResolvedValue('id-token-from-cache');
    session.exchangeMicrosoftToken.mockResolvedValue({
      ok: true, token: 'dbiz-session', principal: { id: 'a@b.test', roles: ['platform-admin'] },
    });

    render(wrap());

    await waitFor(() => expect(session.exchangeMicrosoftToken).toHaveBeenCalledWith('id-token-from-cache'));
    // No interactive sign-in was needed.
    expect(msal.signInWithMicrosoft).not.toHaveBeenCalled();
    expect(msal.signInWithRedirect).not.toHaveBeenCalled();
  });

  test('a failed silent restore is not reported as a refusal — it just shows the button', async () => {
    // This runs on every page load. Someone who has simply never signed in has done nothing wrong.
    msal.restoreSilentSignIn.mockResolvedValue('stale-token');
    session.exchangeMicrosoftToken.mockResolvedValue({ ok: false, status: 403, message: 'no access' });

    render(wrap());

    expect(await screen.findByRole('button', { name: /sign in with microsoft/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a configuration failure reports the Entra error code rather than "cancelled"', async () => {
    // The exact deployment fault this cannot be allowed to disguise: an unregistered redirect URI.
    msal.signInWithMicrosoft.mockRejectedValue({
      errorCode: 'invalid_request',
      errorMessage: 'AADSTS50011: The redirect URI specified in the request does not match',
    });

    render(wrap());
    fireEvent.click(await screen.findByRole("button", { name: /sign in with microsoft/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/AADSTS50011/);
    expect(alert).not.toHaveTextContent(/cancelled/i);
  });
});
