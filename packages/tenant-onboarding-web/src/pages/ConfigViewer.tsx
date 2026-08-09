import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../api';
import type { TenantEnvelope } from '@dbiz/tenant-onboarding-engine';

export function ConfigViewer(): JSX.Element {
  const api = useApi();
  const { slug } = useParams<{ slug: string }>();
  const [env, setEnv] = useState<TenantEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.getManifest(slug).then(setEnv).catch((e: Error) => setError(e.message));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="page-head">
        <h1>tenant.json <span className="sub">(read-only SSOT)</span></h1>
        <Link className="ghost" to={`/tenants/${slug}`}>Back</Link>
      </div>
      {error && <div className="error">{error}</div>}
      {env && <pre className="json">{JSON.stringify(env, null, 2)}</pre>}
    </div>
  );
}
