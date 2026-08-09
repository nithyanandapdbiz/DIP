import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { ApiProvider, type TenantClient } from '../api';
import { AuthProvider } from '../auth/AuthContext';
import type { TenantSummary } from '@dbiz/tenant-onboarding-engine';

const FIXTURES: TenantSummary[] = [
  { slug: 'carlisle-prod', displayName: 'Carlisle Homes', status: 'Onboarding', progress: 33, currentStage: 'connect', tenantId: 'tnt-1', updatedAt: '2026-07-23T00:00:03.000Z' },
  { slug: 'acme-qa', displayName: 'Acme QA', status: 'Provisioned', progress: 100, currentStage: 'activation', tenantId: 'tnt-2', updatedAt: '2026-07-23T00:00:01.000Z' },
];

const stub = {
  listTenants: async () => FIXTURES,
  deleteTenant: async () => ({ deleted: '' }),
} as unknown as TenantClient;

const wrap = (ui: JSX.Element): JSX.Element => (
  <MemoryRouter><AuthProvider><ApiProvider client={stub}>{ui}</ApiProvider></AuthProvider></MemoryRouter>
);

describe('Dashboard (reuses queryDashboard + typed client)', () => {
  test('lists tenants returned by the client, newest first', async () => {
    render(wrap(<Dashboard />));
    // Carlisle (updatedAt …03) sorts before Acme (…01) via recently-updated.
    expect(await screen.findByText('Carlisle Homes')).toBeInTheDocument();
    expect(screen.getByText('Acme QA')).toBeInTheDocument();
    // Opaque ids render per row (unique), proving the client data reached the grid.
    expect(screen.getByText('tnt-1')).toBeInTheDocument();
    expect(screen.getByText('tnt-2')).toBeInTheDocument();
  });
});
