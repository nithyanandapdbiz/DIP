import { useAuth } from '../auth/AuthContext';

export function Settings(): JSX.Element {
  const { principal } = useAuth();
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '(same origin)';
  return (
    <div>
      <h1>Settings</h1>
      <div className="card">
        <dl className="kv">
          <dt>Signed in as</dt><dd>{principal?.id} ({principal?.roles.join(', ')})</dd>
          <dt>API endpoint</dt><dd><code>{base}</code></dd>
          <dt>Theme</dt><dd>Toggle in the top bar (☾ / ☀)</dd>
        </dl>
      </div>
    </div>
  );
}
