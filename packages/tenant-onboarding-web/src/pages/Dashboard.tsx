import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { queryDashboard } from '@dbiz/tenant-onboarding-engine/dashboard';
import type { TenantSummary, OnboardingStatus } from '@dbiz/tenant-onboarding-engine';

export function Dashboard(): JSX.Element {
  const api = useApi();
  const { allowed } = useAuth();
  const nav = useNavigate();
  const [tenants, setTenants] = useState<readonly TenantSummary[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OnboardingStatus | ''>('');
  const [error, setError] = useState<string | null>(null);

  const load = (): void => { api.listTenants().then(setTenants).catch((e: Error) => setError(e.message)); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () => queryDashboard(tenants, { search, ...(status ? { status } : {}), sort: 'recently-updated' }),
    [tenants, search, status],
  );

  const remove = async (slug: string): Promise<void> => { await api.deleteTenant(slug); load(); };

  return (
    <div>
      <div className="page-head">
        <h1>Tenants</h1>
        {allowed('tenant:create') && <Link className="primary" to="/new">Create tenant</Link>}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="filters">
        <input placeholder="Search name, slug or id…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as OnboardingStatus | '')}>
          <option value="">All statuses</option>
          <option value="Onboarding">Onboarding</option>
          <option value="Certified">Certified</option>
          <option value="Provisioned">Provisioned</option>
          <option value="Failed">Failed</option>
        </select>
      </div>
      <table className="grid">
        <thead><tr><th>Tenant</th><th>Status</th><th>Progress</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          {visible.map((t) => (
            <tr key={t.slug}>
              <td><Link to={`/tenants/${t.slug}`}>{t.displayName}</Link><div className="sub">{t.tenantId}</div></td>
              <td><span className={`badge s-${t.status.toLowerCase()}`}>{t.status}</span></td>
              <td><div className="bar"><i style={{ width: `${t.progress}%` }} /></div></td>
              <td className="sub">{t.updatedAt.slice(0, 19).replace('T', ' ')}</td>
              <td className="actions">
                {t.status !== 'Provisioned' && allowed('tenant:update') && (
                  <button onClick={() => nav(`/new?slug=${t.slug}`)}>Continue</button>
                )}
                {allowed('tenant:delete') && <button className="danger" onClick={() => remove(t.slug)}>Delete</button>}
              </td>
            </tr>
          ))}
          {visible.length === 0 && <tr><td colSpan={5} className="sub">No tenants yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
