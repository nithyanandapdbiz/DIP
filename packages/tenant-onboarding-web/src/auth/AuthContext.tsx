/**
 * Authentication + RBAC context. Reuses the platform's `can()` policy — the UI gates actions
 * with the same rules the API enforces, so a hidden button is never a security control on its own.
 *
 * It also owns the SESSION LIFECYCLE, which is not the same thing as signing in:
 *
 *   RESTORE  — the DBIZ session token lives in memory, so a refresh or a new tab loses it. Microsoft
 *              still considers the operator signed in, so on boot we ask Entra silently and re-exchange
 *              the result. Without this, every refresh returned an administrator to the sign-in screen
 *              mid-task and asked a question that had no answer but "yes, obviously".
 *   EXPIRY   — the DBIZ token is valid for an hour and there is no refresh. When the API rejects it,
 *              the session is cleared and the operator is told it expired, rather than being shown a
 *              raw failure on whatever they were doing.
 */
import {
  createContext, useContext, useMemo, useState, useEffect, useRef, useCallback, type ReactNode,
} from 'react';
import { can } from '@dbiz/tenant-onboarding-engine/authz';
import type { Permission, Principal } from '@dbiz/tenant-onboarding-engine';
import { restoreSilentSignIn, msalConfigured } from './msal';
import { exchangeMicrosoftToken } from './session';

/** Why the operator is at the sign-in screen. Drives the message shown there, nothing else. */
export type SignedOutReason = 'expired' | null;

interface AuthState {
  principal: Principal | null;
  token: string | null;
  /** True while the silent restore is in flight. Routes must wait rather than redirect to sign-in. */
  restoring: boolean;
  signedOutReason: SignedOutReason;
  /** Establish the session from a verified DBIZ session token + its principal (see auth/session.ts). */
  login(principal: Principal, token: string): void;
  logout(reason?: SignedOutReason): void;
  allowed(permission: Permission): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [signedOutReason, setSignedOutReason] = useState<SignedOutReason>(null);
  // Start in the restoring state only when there is something that could restore. With Microsoft
  // unconfigured (local dev sign-in) there is nothing to ask, and blocking the first paint on a
  // promise that always resolves null would just be a flash of nothing.
  const [restoring, setRestoring] = useState(msalConfigured);

  const login = useCallback((p: Principal, tok: string) => {
    setPrincipal(p); setToken(tok); setSignedOutReason(null);
  }, []);

  const logout = useCallback((reason: SignedOutReason = null) => {
    setPrincipal(null); setToken(null); setSignedOutReason(reason);
  }, []);

  const restored = useRef(false);
  useEffect(() => {
    if (!msalConfigured || restored.current) return;
    restored.current = true;   // StrictMode double-invokes effects; restore once.
    let cancelled = false;
    void (async () => {
      try {
        const idToken = await restoreSilentSignIn();
        if (cancelled || !idToken) return;
        const r = await exchangeMicrosoftToken(idToken);
        // A refusal here is NOT surfaced. The operator did not ask for anything: they loaded a page.
        // Access may have been revoked, or a role unassigned — either way the sign-in screen states
        // the case when they actually try. Shouting it at page load would be noise.
        if (!cancelled && r.ok) { setPrincipal(r.principal); setToken(r.token); }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AuthState>(() => ({
    principal,
    token,
    restoring,
    signedOutReason,
    login,
    logout,
    allowed: (permission) => (principal ? can(principal, permission) : false),
  }), [principal, token, restoring, signedOutReason, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth used outside AuthProvider');
  return a;
}
