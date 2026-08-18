import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { queryDashboard } from '@dbiz/tenant-onboarding-engine/dashboard';
import type { TenantSummary, OnboardingStatus } from '@dbiz/tenant-onboarding-engine';
import './Dashboard.css';

type Operation = 'diagnose' | 'heal' | 'correct' | 'delete';

const STATUS_META: Record<string, { label: string; tone: string }> = {
  Onboarding: { label: 'Onboarding', tone: 'amber' },
  Certified: { label: 'Certified', tone: 'green' },
  Provisioned: { label: 'Provisioned', tone: 'blue' },
  Failed: { label: 'Failed', tone: 'red' },
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Dashboard(): JSX.Element {
  const api = useApi();
  const { allowed } = useAuth();
  const [tenants, setTenants] = useState<readonly TenantSummary[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OnboardingStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<TenantSummary | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [activity, setActivity] = useState<string[]>([]);

  const load = async (): Promise<void> => {
    try { setTenants(await api.listTenants()); setError(null); }
    catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () => queryDashboard(tenants, { search, ...(status ? { status } : {}), sort: 'recently-updated' }),
    [tenants, search, status],
  );

  const metrics = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter((t) => t.status === 'Provisioned').length;
    const attention = tenants.filter((t) => t.status === 'Failed' || t.progress < 100).length;
    const ready = tenants.filter((t) => t.status === 'Provisioned' || t.status === 'Certified').length;
    const health = total === 0 ? 100 : Math.round((ready / total) * 100);
    return { total, active, attention, ready, health };
  }, [tenants]);

  const run = async (tenant: TenantSummary, operation: Operation): Promise<void> => {
    const key = `${operation}:${tenant.slug}`;
    setBusy(key); setError(null);
    try {
      if (operation === 'diagnose') {
        const [manifest, updates, history] = await Promise.all([
          api.getManifest(tenant.slug),
          api.listUpdates(tenant.slug),
          api.updateHistory(tenant.slug),
        ]);
        const checks = [
          manifest.onboarding.slug === tenant.slug ? 'tenant identity' : 'tenant identity mismatch',
          manifest.configuration.dbiz.contractVersion ? 'contract version' : 'contract version missing',
          manifest.onboarding.status ? 'lifecycle state' : 'lifecycle state missing',
          `${updates.length} pending update${updates.length === 1 ? '' : 's'}`,
          `${history.length} update history entr${history.length === 1 ? 'y' : 'ies'}`,
        ];
        setActivity((a) => [`${tenant.displayName}: diagnostic completed · ${checks.join(' · ')}`, ...a].slice(0, 8));
      }
      if (operation === 'heal') {
        await api.syncConfiguration(tenant.slug);
        setActivity((a) => [`${tenant.displayName}: self-heal requested · current configuration re-published to the EP`, ...a].slice(0, 8));
        await load();
      }
      if (operation === 'correct') {
        await api.publishUpdate(tenant.slug, false);
        setActivity((a) => [`${tenant.displayName}: correction published · signed EP update queued`, ...a].slice(0, 8));
        await load();
      }
      if (operation === 'delete') {
        await api.deleteTenant(tenant.slug);
        setActivity((a) => [`${tenant.displayName}: tenant permanently deleted`, ...a].slice(0, 8));
        setSelected(null); setDeleteConfirm(''); await load();
      }
    } catch (e) {
      setError(`${tenant.displayName}: ${(e as Error).message}`);
    } finally { setBusy(null); }
  };

  return (
    <div className="tenant-dashboard">
      <section className="hero">
        <div>
          <div className="eyebrow">CERTUS · TENANT OPERATIONS CENTER</div>
          <h1>Tenant command center</h1>
          <p>One operational view for lifecycle, readiness, connectivity and safe tenant actions.</p>
        </div>
        <div className="hero-actions">
          <button className="dash-secondary" onClick={() => void load()}>↻ Refresh</button>
          {allowed('tenant:create') && <Link className="dash-primary" to="/new">＋ New tenant</Link>}
        </div>
      </section>

      {error && <div className="dash-alert"><strong>Action failed</strong><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}

      <section className="metric-grid" aria-label="Tenant portfolio summary">
        <article className="metric-card metric-hero-card"><span className="metric-label">TENANT PORTFOLIO</span><strong>{metrics.total}</strong><span>customers in the plane</span><div className="metric-spark"><i style={{ width: `${Math.max(8, metrics.health)}%` }} /></div></article>
        <article className="metric-card"><span className="metric-label">OPERATIONAL</span><strong>{metrics.active}</strong><span>ready to operate</span><b className="metric-good">{metrics.total ? Math.round((metrics.active / metrics.total) * 100) : 0}% active</b></article>
        <article className="metric-card"><span className="metric-label">ATTENTION</span><strong className={metrics.attention ? 'metric-warn' : ''}>{metrics.attention}</strong><span>need operator attention</span><b>{metrics.attention ? 'Review required' : 'All clear'}</b></article>
        <article className="metric-card"><span className="metric-label">READINESS</span><strong>{metrics.health}%</strong><span>portfolio readiness index</span><b className="metric-good">{metrics.ready} ready</b></article>
        <article className="health-card"><div className="health-ring" style={{ '--score': `${metrics.health * 3.6}deg` } as React.CSSProperties}><span>{metrics.health}</span></div><div><span className="metric-label">CONTROL HEALTH</span><strong>{metrics.health >= 80 ? 'Healthy' : metrics.health >= 50 ? 'Watch' : 'At risk'}</strong><span>based on current tenant state</span></div></article>
      </section>

      <section className="ops-strip">
        <div><span className="eyebrow">FAST OPERATIONS</span><h2>Act on the tenant that needs you</h2></div>
        <div className="ops-actions">
          {visible.slice(0, 3).map((tenant) => <button key={tenant.slug} className="op-chip" onClick={() => setSelected(tenant)}><span className={`status-dot ${STATUS_META[tenant.status]?.tone ?? 'blue'}`} /><span>{tenant.displayName}</span><small>{tenant.status}</small></button>)}
          {visible.length === 0 && <span className="empty-inline">No matching tenants.</span>}
        </div>
      </section>

      <section className="workspace">
        <div className="portfolio-card">
          <div className="section-head">
            <div><span className="eyebrow">TENANT PORTFOLIO</span><h2>All tenants</h2></div>
            <span className="count-pill">{visible.length} shown</span>
          </div>
          <div className="filters-pro">
            <div className="search-box"><span>⌕</span><input aria-label="Search tenants" placeholder="Search tenant, ID or slug…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select value={status} onChange={(e) => setStatus(e.target.value as OnboardingStatus | '')}><option value="">All states</option><option value="Onboarding">Onboarding</option><option value="Certified">Certified</option><option value="Provisioned">Provisioned</option><option value="Failed">Failed</option></select>
          </div>
          <div className="tenant-table-wrap">
            <table className="tenant-table">
              <thead><tr><th>Tenant</th><th>Lifecycle</th><th>Progress</th><th>Last activity</th><th>Actions</th></tr></thead>
              <tbody>
                {visible.map((t) => {
                  const meta = STATUS_META[t.status] ?? STATUS_META.Provisioned;
                  return <tr key={t.slug}>
                    <td><div className="tenant-name"><span className={`avatar avatar-${meta.tone}`}>{t.displayName.slice(0, 1).toUpperCase()}</span><div><Link to={`/tenants/${t.slug}`}>{t.displayName}</Link><small>{t.tenantId} · {t.slug}</small></div></div></td>
                    <td><span className={`state-pill ${meta.tone}`}><i />{meta.label}</span></td>
                    <td><div className="progress-cell"><div className="progress-track"><i style={{ width: `${t.progress}%` }} /></div><span>{t.progress}%</span></div></td>
                    <td><span className="last-activity">{formatDate(t.updatedAt)}</span></td>
                    <td><div className="row-actions"><button onClick={() => setSelected(t)}>Operate</button><Link to={`/tenants/${t.slug}`}>Open</Link></div></td>
                  </tr>;
                })}
                {visible.length === 0 && <tr><td colSpan={5}><div className="empty-state"><strong>No tenants match this view</strong><span>Clear the filters or create a new tenant.</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="attention-card">
          <div className="section-head"><div><span className="eyebrow">OPERATOR QUEUE</span><h2>Needs attention</h2></div><span className="attention-count">{metrics.attention}</span></div>
          <div className="queue-list">
            {visible.filter((t) => t.status === 'Failed' || t.progress < 100).slice(0, 5).map((t) => <button className="queue-item" key={t.slug} onClick={() => setSelected(t)}><span className={`queue-icon ${t.status === 'Failed' ? 'danger' : 'warning'}`}>{t.status === 'Failed' ? '!' : '•'}</span><span><strong>{t.displayName}</strong><small>{t.status === 'Failed' ? 'Execution blocked' : `${t.progress}% complete · action available`}</small></span><b>›</b></button>)}
            {metrics.attention === 0 && <div className="queue-empty"><span>✓</span><strong>Nothing needs attention</strong><small>Portfolio is operating within expected state.</small></div>}
          </div>
          <div className="activity-feed"><span className="eyebrow">LIVE ACTIVITY</span>{activity.length ? activity.map((item, i) => <p key={`${item}-${i}`}>{item}</p>) : <p>Operator actions will appear here with their outcome.</p>}</div>
        </aside>
      </section>

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
        <section className="operation-modal" role="dialog" aria-modal="true" aria-labelledby="operation-title">
          <div className="modal-head"><div><span className="eyebrow">TENANT OPERATIONS</span><h2 id="operation-title">{selected.displayName}</h2><small>{selected.tenantId} · {selected.slug}</small></div><button className="modal-close" onClick={() => setSelected(null)}>×</button></div>
          <div className="operation-grid">
            <button className="operation-tile" disabled={busy !== null} onClick={() => void run(selected, 'diagnose')}><span>⌁</span><strong>{busy === `diagnose:${selected.slug}` ? 'Running…' : 'Troubleshoot connectivity'}</strong><small>Validate tenant manifest, update channel and EP-facing configuration.</small></button>
            <button className="operation-tile heal" disabled={busy !== null} onClick={() => void run(selected, 'heal')}><span>↻</span><strong>{busy === `heal:${selected.slug}` ? 'Healing…' : 'Self-heal & reconcile'}</strong><small>Re-publish the current tenant configuration so the EP can recover to the IP state.</small></button>
            <button className="operation-tile correct" disabled={busy !== null} onClick={() => void run(selected, 'correct')}><span>✦</span><strong>{busy === `correct:${selected.slug}` ? 'Correcting…' : 'Apply correction'}</strong><small>Publish a signed EP update using the current tenant configuration.</small></button>
            <Link className="operation-tile" to={`/tenants/${selected.slug}`} onClick={() => setSelected(null)}><span>↗</span><strong>Open tenant control plane</strong><small>Manage lifecycle, capabilities, integrations, tokens and audit.</small></Link>
          </div>
          {allowed('tenant:delete') && <div className="hard-delete-zone"><div><span className="eyebrow danger-eyebrow">IRREVERSIBLE ACTION</span><strong>Hard delete tenant</strong><small>Permanently removes the tenant through the authoritative DELETE API. This is not archive or suspend.</small></div><button className="hard-delete-btn" onClick={() => setDeleteConfirm(selected.slug)}>Hard delete</button></div>}
        </section>
      </div>}

      {deleteConfirm && selected && <div className="modal-backdrop" role="presentation"><section className="delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><span className="delete-icon">!</span><span className="eyebrow danger-eyebrow">PERMANENT DELETION</span><h2 id="delete-title">Delete {selected.displayName} permanently?</h2><p>This action cannot be undone. Type <code>{selected.slug}</code> to confirm. Archive and suspend remain available when you need a reversible action.</p><input autoFocus value={deleteConfirm === selected.slug ? selected.slug : ''} placeholder={selected.slug} onChange={(e) => setDeleteConfirm(e.target.value)} /><div className="delete-actions"><button onClick={() => setDeleteConfirm('')}>Cancel</button><button className="hard-delete-btn" disabled={deleteConfirm !== selected.slug || busy !== null} onClick={() => void run(selected, 'delete')}>{busy === `delete:${selected.slug}` ? 'Deleting…' : 'Permanently delete'}</button></div></section></div>}
    </div>
  );
}
