import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { TenantEnvelope, SolutionManifest, CapabilityUpdateEvent, EpTokenResult, CompatibilityResult, UpdateHistoryEntry, RegistrationOtcResult } from '@dbiz/tenant-onboarding-engine';

const TABS = ['Overview', 'Capabilities', 'Integrations', 'Certification', 'Audit'] as const;
type Tab = (typeof TABS)[number];

const CAP_REGISTRY = ['functional-testing', 'dev-change', 'inverse-flow-discovery', 'performance', 'security-testing', 'penetration-testing'];

export function TenantDetails(): JSX.Element {
  const api = useApi();
  const { allowed } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const [env, setEnv] = useState<TenantEnvelope | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [error, setError] = useState<string | null>(null);
  const [solution, setSolution] = useState<SolutionManifest | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [updates, setUpdates] = useState<CapabilityUpdateEvent[]>([]);
  const [addCap, setAddCap] = useState('');
  const [openUpd, setOpenUpd] = useState<string | null>(null);
  const [epReveal, setEpReveal] = useState<EpTokenResult | null>(null);
  const [epBusy, setEpBusy] = useState(false);
  const [epCopied, setEpCopied] = useState(false);
  const [otcReveal, setOtcReveal] = useState<RegistrationOtcResult | null>(null);
  const [otcBusy, setOtcBusy] = useState(false);
  const [otcCopied, setOtcCopied] = useState(false);
  const [updBusy, setUpdBusy] = useState(false);
  const [mandatory, setMandatory] = useState(false);
  const [compat, setCompat] = useState<CompatibilityResult | null>(null);
  const [history, setHistory] = useState<UpdateHistoryEntry[] | null>(null);

  const load = (): void => {
    if (!slug) return;
    api.getManifest(slug).then(setEnv).catch((e: Error) => setError(e.message));
    api.listUpdates(slug).then((u) => setUpdates([...u])).catch(() => setUpdates([]));
  };
  useEffect(load, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="error">{error}</div>;
  if (!env) return <div className="sub">Loading…</div>;
  const o = env.onboarding;
  const c = env.configuration;
  const act = async (fn: () => Promise<TenantEnvelope>): Promise<void> => {
    try { setEnv(await fn()); setError(null); } catch (e) { setError((e as Error).message); }
  };
  const generate = async (): Promise<void> => {
    setGenBusy(true); setError(null);
    try { setSolution(await api.generateSolution(slug!)); }
    catch (e) { setError((e as Error).message); }
    finally { setGenBusy(false); }
  };
  const addCapability = async (): Promise<void> => {
    if (!addCap) return;
    try { await api.setCapability(slug!, addCap, true); setAddCap(''); setError(null); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const applyUpdate = async (id: string): Promise<void> => {
    try { await api.acknowledgeUpdate(slug!, id); setError(null); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const toggleIntegration = async (name: string, enabled: boolean): Promise<void> => {
    try { await api.setIntegration(slug!, name, enabled); setError(null); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const genEpToken = async (): Promise<void> => {
    setEpBusy(true); setError(null); setEpCopied(false);
    try { setEpReveal(await api.generateEpToken(slug!)); load(); }
    catch (e) { setError((e as Error).message); }
    finally { setEpBusy(false); }
  };
  const copyEpToken = (): void => {
    if (epReveal) void navigator.clipboard?.writeText(epReveal.token).then(() => setEpCopied(true)).catch(() => {});
  };
  // A fresh one-time registration credential (OTC) — the EP presents it ONCE at /api/register to obtain
  // its DBIZ_EP_TOKEN. Shown here for the operator to map into the EP bootstrap; the IP keeps only its hash.
  const genOtc = async (): Promise<void> => {
    setOtcBusy(true); setError(null); setOtcCopied(false);
    try { setOtcReveal(await api.generateOtc(slug!)); }
    catch (e) { setError((e as Error).message); }
    finally { setOtcBusy(false); }
  };
  const copyOtc = (): void => {
    if (otcReveal) void navigator.clipboard?.writeText(otcReveal.otc).then(() => setOtcCopied(true)).catch(() => {});
  };
  // Software Update Management (ADR-0035): the IP publishes a signed update; the EP pulls + verifies + installs.
  const publishUpdate = async (): Promise<void> => {
    setUpdBusy(true); setError(null); setCompat(null);
    try { setEnv(await api.publishUpdate(slug!, mandatory)); load(); }
    catch (e) { setError((e as Error).message); }
    finally { setUpdBusy(false); }
  };
  const syncConfig = async (): Promise<void> => {
    setUpdBusy(true); setError(null);
    try { await api.syncConfiguration(slug!); load(); }
    catch (e) { setError((e as Error).message); }
    finally { setUpdBusy(false); }
  };
  const runCompat = async (): Promise<void> => {
    setError(null);
    try { setCompat(await api.checkCompatibility(slug!, { contractVersion: c.dbiz.contractVersion })); }
    catch (e) { setError((e as Error).message); }
  };
  const loadHistory = async (): Promise<void> => {
    try { setHistory([...(await api.updateHistory(slug!))]); }
    catch (e) { setError((e as Error).message); }
  };
  const rollback = async (): Promise<void> => {
    setUpdBusy(true); setError(null);
    try { setEnv(await api.rollbackUpdate(slug!, 'operator rollback')); load(); }
    catch (e) { setError((e as Error).message); }
    finally { setUpdBusy(false); }
  };
  const availableCaps = CAP_REGISTRY.filter((x) => !c.dbiz.entitledCapabilities.includes(x));
  const aiOn = c.customerOwned.ai.providerHandle !== 'ai-none';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{o.displayName}</h1>
          <div className="sub">{o.tenantId} · <span className={`badge s-${o.status.toLowerCase()}`}>{o.status}</span> · {o.progress}%</div>
        </div>
        <Link className="ghost" to={`/tenants/${slug}/config`}>View tenant.json</Link>
      </div>
      <nav className="tabs">
        {TABS.map((t) => <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </nav>
      <div className="card">
        {tab === 'Overview' && (
          <dl className="kv">
            <dt>Administrators</dt><dd>{o.administrators.map((a) => a.name).join(', ')}</dd>
            <dt>Cloud</dt><dd>{c.technologyProfile.cloudProvider}</dd>
            <dt>Deployment</dt><dd>{c.technologyProfile.deploymentModel}</dd>
            <dt>Framework</dt><dd>{c.technologyProfile.framework}</dd>
            <dt>Isolation</dt><dd>{env.multiTenancy.isolationModel} · namespace {env.isolation.namespace}</dd>
            <dt>Lifecycle</dt><dd>{o.lifecycleState ?? '—'} / {o.projection ?? '—'}</dd>
          </dl>
        )}
        {tab === 'Capabilities' && <ul>{c.dbiz.entitledCapabilities.map((x) => <li key={x}>{x}</li>)}</ul>}
        {tab === 'Integrations' && (
          <dl className="kv">
            <dt>Project mgmt</dt><dd>{c.customerOwned.projectManagement.provider} / {c.customerOwned.projectManagement.project ?? '—'}</dd>
            <dt>Test mgmt</dt><dd>{c.customerOwned.testManagement.provider} / {c.customerOwned.testManagement.projectKey ?? '—'}</dd>
            <dt>AI</dt><dd>{c.customerOwned.ai.providerHandle}</dd>
          </dl>
        )}
        {tab === 'Certification' && (
          <div>{env.provenance.certification
            ? <span className={env.provenance.certification.ok ? 'badge s-certified' : 'badge s-failed'}>{env.provenance.certification.ok ? 'Certified' : 'Failed'}</span>
            : <span className="sub">Not yet certified.</span>}</div>
        )}
        {tab === 'Audit' && (
          <ul className="audit">{o.audit.map((a, i) => <li key={i}><code>{a.at.slice(11, 19)}</code> {a.event} — {a.detail}</li>)}</ul>
        )}
      </div>

      {allowed('tenant:configure') && (
        <div className="card">
          <div className="page-head" style={{ marginBottom: (o.epToken || epReveal) ? 12 : 0 }}>
            <div>
              <span className="tt">Execution-Plane API Token</span>
              <div className="sub">The <code>DBIZ_EP_TOKEN</code> the EP uses to reach the IP (pull updates, acknowledge). Generate it here and map it into the EP; regenerating revokes the previous token.</div>
            </div>
            <button className="primary" disabled={epBusy} onClick={genEpToken}>{epBusy ? 'Generating…' : o.epToken ? 'Regenerate token' : 'Generate token'}</button>
          </div>
          {o.epToken && (
            <div className="summary" style={{ marginBottom: epReveal ? 12 : 0 }}>
              <span className="k">version</span> <span className="v">v{o.epToken.version}</span><br />
              <span className="k">issued</span> <span className="v">{o.epToken.issuedAt.slice(0, 19).replace('T', ' ')}</span><br />
              <span className="k">expires</span> <span className="v">{o.epToken.expiresAt.slice(0, 10)}</span><br />
              <span className="k">ends with</span> <span className="v">…{o.epToken.last4}</span>
            </div>
          )}
          {epReveal && (
            <div className="tokenbox">
              <strong>Copy this token now — it is shown only once.</strong>
              <div className="tokenrow">
                <code className="token">{epReveal.token}</code>
                <button onClick={copyEpToken}>{epCopied ? 'Copied ✓' : 'Copy'}</button>
              </div>
              <span className="sub">Map it into the EP as <code>DBIZ_EP_TOKEN</code>. Any previous token is now revoked.</span>
            </div>
          )}
        </div>
      )}

      {allowed('tenant:configure') && (
        <div className="card">
          <div className="page-head" style={{ marginBottom: otcReveal ? 12 : 0 }}>
            <div>
              <span className="tt">One-Time Registration Credential (OTC)</span>
              <div className="sub">The single-use credential the EP presents ONCE at <code>/api/register</code> to obtain its <code>DBIZ_EP_TOKEN</code>. Generate one here and map it into the EP bootstrap; the IP stores only its hash (INV-2). It is single-use and short-lived (24h) — regenerate if it has been consumed or has expired.</div>
            </div>
            <button className="primary" disabled={otcBusy} onClick={genOtc}>{otcBusy ? 'Generating…' : otcReveal ? 'Regenerate OTC' : 'Generate OTC'}</button>
          </div>
          {otcReveal && (
            <div className="tokenbox">
              <strong>Copy this OTC now — it is shown only once.</strong>
              <div className="tokenrow">
                <code className="token">{otcReveal.otc}</code>
                <button onClick={copyOtc}>{otcCopied ? 'Copied ✓' : 'Copy'}</button>
              </div>
              <div className="summary" style={{ marginTop: 8 }}>
                <span className="k">tenant</span> <span className="v">{otcReveal.tenantId}</span><br />
                <span className="k">register at</span> <span className="v">{otcReveal.registrationEndpoint}</span><br />
                <span className="k">expires</span> <span className="v">{otcReveal.expiresAt.slice(0, 19).replace('T', ' ')}</span>
              </div>
              <span className="sub">Map it into the EP bootstrap, then run <code>npm run register</code> in the EP. It is consumed on first use.</span>
            </div>
          )}
        </div>
      )}

      {allowed('tenant:lifecycle') && (
        <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="tt">Lifecycle</span>
          {o.lifecycleState !== 'SUSPENDED' && o.lifecycleState !== 'CLOSED' && <button onClick={() => act(() => api.suspend(slug!, 'operator action'))}>Suspend</button>}
          {o.lifecycleState === 'SUSPENDED' && <button onClick={() => act(() => api.reactivate(slug!))}>Reactivate</button>}
          {o.lifecycleState !== 'CLOSED' && <button className="danger" onClick={() => act(() => api.archive(slug!))}>Archive</button>}
          <span className="sub">Governed by the frozen state machine — current state <b>{o.lifecycleState ?? '—'}</b>. Suspend requires ACTIVE; illegal transitions are refused.</span>
        </div>
      )}

      {allowed('tenant:activate') && (
        <div className="card">
          <div className="page-head" style={{ marginBottom: solution ? 12 : 0 }}>
            <div>
              <span className="tt">Execution-Plane Solution</span>
              <div className="sub">Generate the deployable test-automation solution from this tenant's <code>tenant.json</code>. The IP produces the package; you deploy it to the Execution Plane.</div>
            </div>
            <button className="primary" disabled={genBusy} onClick={generate}>{genBusy ? 'Generating…' : 'Generate EP solution'}</button>
          </div>
          {solution && (
            <div>
              <div className="summary" style={{ marginBottom: 12 }}>
                <span className="k">profile</span> <span className="v">{solution.profile.language} · {solution.profile.framework} · {solution.profile.testRunner} · {solution.profile.packageManager}</span><br />
                <span className="k">capabilities</span> <span className="v">{solution.capabilities.join(', ') || 'none'}</span><br />
                <span className="k">tools</span> <span className="v">{solution.tools.join(', ') || 'none'}</span><br />
                <span className="k">files</span> <span className="v">{solution.fileCount}</span><br />
                <span className="k">content hash</span> <span className="v">{solution.contentHash.slice(0, 24)}…</span><br />
                <span className="k">generator</span> <span className="v">{solution.generatorVersion} · templates {solution.templateVersion}</span>
                {solution.outputPath && <><br /><span className="k">written to</span> <span className="v">{solution.outputPath}</span></>}
              </div>
              <div className="filelist">
                {solution.files.map((f) => (
                  <div key={f.path} className="filerow">
                    <div className="fh" onClick={() => setOpenFile(openFile === f.path ? null : f.path)}>
                      <span className="chev">{openFile === f.path ? '▼' : '▶'}</span>
                      <code>{f.path}</code>
                      <span className="sub" style={{ marginLeft: 'auto' }}>{f.content.split('\n').length} lines</span>
                    </div>
                    {openFile === f.path && <pre className="filebody">{f.content}</pre>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {allowed('tenant:activate') && (
        <div className="card">
          <div className="page-head" style={{ marginBottom: 12 }}>
            <div>
              <span className="tt">Software Update</span>
              <div className="sub">Publish a signed platform update to this onboarded tenant. The IP regenerates and signs the EP solution, then queues a pull event; the tenant's Execution Plane pulls it, verifies the ed25519 signature against the content hash, and installs it. The IP never pushes (INV-3); a tampered or unsigned package is refused (ADR-0007).</div>
            </div>
            <label className="sub" style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> mandatory
            </label>
          </div>
          {env.epSolution ? (
            <div className="summary" style={{ marginBottom: 12 }}>
              <span className="k">status</span> <span className={`v badge s-${env.epSolution.status === 'up-to-date' ? 'certified' : env.epSolution.status === 'update-available' ? 'provisioned' : 'failed'}`}>{env.epSolution.status}</span><br />
              <span className="k">published</span> <span className="v">{env.epSolution.publishedVersion} · {env.epSolution.publishedHash.slice(0, 16)}…{env.epSolution.publishedKeyId ? ` · signed ${env.epSolution.publishedKeyId}` : ''}</span><br />
              {env.epSolution.installedVersion && <><span className="k">installed</span> <span className="v">{env.epSolution.installedVersion} · {(env.epSolution.installedHash ?? '').slice(0, 16)}…</span><br /></>}
              <span className="k">published at</span> <span className="v">{env.epSolution.publishedAt.slice(0, 19).replace('T', ' ')}</span>
            </div>
          ) : <div className="sub" style={{ marginBottom: 12 }}>No platform update has been published to this tenant yet.</div>}
          <div className="caprow">
            <button className="primary" disabled={updBusy} onClick={publishUpdate}>{updBusy ? 'Working…' : 'Publish platform update'}</button>
            <button disabled={updBusy} onClick={syncConfig}>Sync configuration</button>
            <button disabled={updBusy} onClick={runCompat}>Check compatibility</button>
            <button disabled={updBusy} onClick={loadHistory}>Update history</button>
            {env.epSolution?.rollbackPoint && allowed('tenant:lifecycle') && <button className="danger" disabled={updBusy} onClick={rollback}>Rollback</button>}
          </div>
          {compat && (
            <div className="summary" style={{ marginTop: 8 }}>
              <span className="k">compatible</span> <span className={`v badge s-${compat.compatible ? 'certified' : 'failed'}`}>{compat.compatible ? 'yes' : 'no'}</span>
              {compat.reasons.length > 0 && <><br /><span className="k">reasons</span> <span className="v">{compat.reasons.map((r) => `${r.severity}: ${r.detail}`).join('; ')}</span></>}
            </div>
          )}
          {history && (
            <ul className="audit" style={{ marginTop: 8 }}>
              {history.length === 0 ? <li className="sub">No update history yet.</li> : history.map((h, i) => <li key={i}><code>{h.at.slice(0, 19).replace('T', ' ')}</code> {h.event} — {h.detail}</li>)}
            </ul>
          )}
        </div>
      )}

      {allowed('tenant:configure') && (
        <div className="card">
          <span className="tt">Capabilities &amp; Update Events</span>
          <div className="sub">Add a capability to this live tenant. The IP records an update event; the tenant's Execution Plane pulls it and enables the capability + its config in its own system — the IP never dials in (INV-3).</div>
          <div className="caprow">
            <select value={addCap} onChange={(e) => setAddCap(e.target.value)}>
              <option value="">Add capability…</option>
              {availableCaps.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <button className="primary" disabled={!addCap} onClick={addCapability}>Add &amp; emit update</button>
            {!o.lifecycleState && <span className="sub">Update events are emitted once the tenant is provisioned (its EP exists).</span>}
          </div>
          <div className="caprow">
            <span className="sub">Integrations:</span>
            <span className={`badge ${aiOn ? 's-provisioned' : ''}`}>AI {aiOn ? 'enabled' : 'disabled'}</span>
            <button onClick={() => toggleIntegration('ai', !aiOn)}>{aiOn ? 'Disable AI' : 'Enable AI'}</button>
            <span className="sub">Toggling AI emits an update event; the EP enables/disables it and (when enabled) fills the vendor/key locally (INV-9).</span>
          </div>
          {updates.length === 0 ? <div className="sub" style={{ marginTop: 8 }}>No update events yet.</div> : (
            <div className="filelist" style={{ marginTop: 4 }}>
              {updates.map((u) => (
                <div key={u.id} className="filerow">
                  <div className="fh" onClick={() => setOpenUpd(openUpd === u.id ? null : u.id)}>
                    <span className="chev">{openUpd === u.id ? '▼' : '▶'}</span>
                    <span className={`badge ${u.status === 'applied' ? 's-provisioned' : ''}`}>{u.status}</span>
                    <code>{u.type}{u.capability || u.integration ? ` · ${u.capability ?? u.integration}` : ''}</code>
                    {u.status === 'pending' && allowed('tenant:update')
                      ? <button style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); void applyUpdate(u.id); }}>Apply (EP)</button>
                      : <span className="sub" style={{ marginLeft: 'auto' }}>{(u.appliedAt ?? u.createdAt).slice(11, 19)}</span>}
                  </div>
                  {openUpd === u.id && u.config && <pre className="filebody">{JSON.stringify(u.config, null, 2)}</pre>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
