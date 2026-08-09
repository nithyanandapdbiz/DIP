/**
 * Sign in — Microsoft (Entra ID) only. The one role is DBIZ IP Admin; access is limited to an
 * email allow-list enforced server-side. A Microsoft account that isn't on the list gets a clear,
 * non-technical "no access" message rather than a blank failure.
 *
 * When no Entra app registration is configured (VITE_AZURE_CLIENT_ID unset), a local dev sign-in
 * stands in so the allow-list and journey can be exercised before Microsoft is wired.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  signInWithMicrosoft, signInWithRedirect, completeRedirectSignIn, isPopupBlocked, msalConfigured,
} from '../auth/msal';
import { exchangeMicrosoftToken } from '../auth/session';

function MicrosoftLogo(): JSX.Element {
  return (
    <span className="ms-logo" aria-hidden="true">
      <i style={{ background: '#F25022' }} /><i style={{ background: '#7FBA00' }} />
      <i style={{ background: '#00A4EF' }} /><i style={{ background: '#FFB900' }} />
    </span>
  );
}

export function Login(): JSX.Element {
  const { login, principal, restoring, signedOutReason } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState('');

  // The silent restore can succeed while this screen is mounted — a refresh lands here before the
  // session comes back. Leave as soon as it does, rather than asking someone already signed in.
  useEffect(() => { if (principal) nav('/', { replace: true }); }, [principal, nav]);

  async function complete(idToken: string): Promise<void> {
    setBusy(true); setDenied(null);
    const r = await exchangeMicrosoftToken(idToken);
    setBusy(false);
    if (r.ok) { login(r.principal, r.token); nav('/'); }
    else setDenied(r.message);
  }

  /**
   * Report what ACTUALLY failed. A bare `catch` here previously reported every MSAL failure as
   * "cancelled" — so a misconfigured deployment (unregistered redirect URI, wrong client/tenant id,
   * blocked popup) was indistinguishable from a user closing the window, and produced no evidence to
   * act on. Entra's error code is the diagnosis; it is shown, not swallowed.
   */
  function describeMsalFailure(e: unknown): string {
    const code = (e as { errorCode?: string } | null)?.errorCode ?? '';
    const detail = (e as { errorMessage?: string; message?: string } | null)?.errorMessage
      ?? (e as Error | null)?.message ?? '';
    if (code === 'user_cancelled') return 'Microsoft sign-in was cancelled. Please try again.';
    if (code === 'popup_window_error' || code === 'empty_window_error') {
      return 'The Microsoft sign-in window could not open. Allow pop-ups for this site and try again.';
    }
    const cause = [code, detail].filter(Boolean).join(': ');
    return `Microsoft sign-in could not be completed${cause ? ` — ${cause}` : ''}.`;
  }

  /**
   * This route is also the REDIRECT-flow callback (msal.ts). On every load it asks MSAL whether the
   * browser has just returned from Entra; on an ordinary visit that answers null and the sign-in
   * button renders as usual. Without this the redirect fallback would land back here and do nothing.
   */
  const redirectChecked = useRef(false);
  useEffect(() => {
    if (!msalConfigured || redirectChecked.current) return;
    redirectChecked.current = true;   // React 18 StrictMode double-invokes effects; consume once.
    setBusy(true);
    completeRedirectSignIn()
      .then((idToken) => (idToken ? complete(idToken) : setBusy(false)))
      .catch((e: unknown) => {
        console.error('Microsoft redirect sign-in failed', e);
        setBusy(false);
        setDenied(describeMsalFailure(e));
      });
    // Runs once on mount: consuming a redirect response is a page-load event, not a render event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function microsoft(): Promise<void> {
    setDenied(null);
    try {
      const idToken = await signInWithMicrosoft();
      await complete(idToken);
    } catch (e) {
      // A blocked popup must not lock an administrator out of the console — degrade to the full-page
      // redirect flow, which needs no popup. It navigates away and resumes in the effect above.
      if (isPopupBlocked(e)) {
        console.warn('Sign-in popup was blocked; falling back to redirect sign-in', e);
        setBusy(true);
        try {
          await signInWithRedirect();
          return;
        } catch (redirectError) {
          console.error('Redirect sign-in could not start', redirectError);
          setBusy(false);
          setDenied(describeMsalFailure(redirectError));
          return;
        }
      }
      // The cause belongs in the console too: the on-screen text is deliberately short, and an
      // operator diagnosing a deployment needs the whole error object.
      console.error('Microsoft sign-in failed', e);
      setDenied(describeMsalFailure(e));
    }
  }

  return (
    <div className="login card">
      <img src="/dbiz-logo.svg" alt="DBIZ" className="login-logo" />
      <div className="eyebrow">DBiz Intelligence Plane</div>
      <h1>Tenant Onboarding</h1>
      <p className="sub">Sign in with your Microsoft work account. Access is limited to authorised <strong>DBIZ IP Admin</strong> users.</p>

      {denied && (
        <div className="noaccess" role="alert">
          <strong>Access not authorised</strong>
          <span>{denied}</span>
        </div>
      )}

      {/* An expired session is not a refusal — say so, or it reads as having lost access. */}
      {!denied && signedOutReason === 'expired' && (
        <div className="notice" role="status">
          <strong>Your session has expired</strong>
          <span>Sessions last one hour. Please sign in again to continue.</span>
        </div>
      )}

      {restoring ? (
        <div className="restoring" role="status">Restoring your session…</div>
      ) : msalConfigured ? (
        <button className="ms-btn" onClick={microsoft} disabled={busy}>
          <MicrosoftLogo />
          {busy ? 'Signing in…' : 'Sign in with Microsoft'}
        </button>
      ) : (
        <div className="devsignin">
          <div className="dev-note">Microsoft sign-in isn't configured yet — using local dev sign-in. The email allow-list still applies.</div>
          <label htmlFor="dev-email">Work email</label>
          <input
            id="dev-email" type="email" placeholder="you@company.com" value={devEmail}
            onChange={(e) => setDevEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && devEmail) void complete(`dev:${devEmail}`); }}
          />
          <button className="primary" disabled={busy || !devEmail} onClick={() => void complete(`dev:${devEmail}`)}>
            {busy ? 'Signing in…' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}
