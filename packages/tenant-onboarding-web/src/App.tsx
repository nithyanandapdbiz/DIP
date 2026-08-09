import { useMemo, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ApiProvider, makeClient } from './api';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Wizard } from './pages/Wizard';
import { TenantDetails } from './pages/TenantDetails';
import { ConfigViewer } from './pages/ConfigViewer';
import { Settings } from './pages/Settings';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

function ApiBridge({ children }: { children: ReactNode }): JSX.Element {
  const { token, logout } = useAuth();
  // An expired bearer token ends the session and says why; RequireAuth then routes to sign-in.
  const client = useMemo(() => makeClient(BASE_URL, token ?? undefined, () => logout('expired')), [token, logout]);
  return <ApiProvider client={client}>{children}</ApiProvider>;
}

function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const { principal, restoring } = useAuth();
  // Redirecting while the silent restore is still in flight would send a signed-in operator to the
  // sign-in screen on every refresh — the exact bug the restore exists to fix, reintroduced by a race.
  if (restoring) return <div className="restoring" role="status">Restoring your session…</div>;
  return principal ? children : <Navigate to="/login" replace />;
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <ApiBridge>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<Wizard />} />
            <Route path="/tenants/:slug" element={<TenantDetails />} />
            <Route path="/tenants/:slug/config" element={<ConfigViewer />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </ApiBridge>
    </AuthProvider>
  );
}
