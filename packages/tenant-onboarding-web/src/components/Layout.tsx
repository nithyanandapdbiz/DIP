import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout(): JSX.Element {
  const { principal, logout } = useAuth();
  const nav = useNavigate();
  const [dark, setDark] = useState(false); // professional light by default (executive)
  useEffect(() => { document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'; }, [dark]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/dbiz-logo.svg" alt="DBIZ" className="brand-logo" />
          <span className="brand-text"><small>Intelligence Plane</small>Tenant Onboarding</span>
        </div>
        <nav className="nav">
          <Link to="/">Dashboard</Link>
          <Link to="/new">New Tenant</Link>
          <Link to="/settings">Settings</Link>
        </nav>
        <div className="spacer" />
        <button className="ghost" title="Toggle theme" onClick={() => setDark((d) => !d)}>{dark ? '☾' : '☀'}</button>
        {principal && <span className="who" title={principal.id}>{principal.id}</span>}
        <span className="role">DBIZ IP Admin</span>
        <button className="ghost" onClick={() => { logout(); nav('/login'); }}>Logout</button>
      </header>
      <main className="content"><Outlet /></main>
    </div>
  );
}
