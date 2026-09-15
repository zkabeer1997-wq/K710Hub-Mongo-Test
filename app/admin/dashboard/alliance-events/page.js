'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import EventsPanel from '../../../../components/admin/EventsPanel';
import AlliancesPanel from '../../../../components/admin/AlliancesPanel';

const TABS = [
  { id: 'events', label: 'Events' },
  { id: 'alliances', label: 'Alliances' },
];

export default function AdminAllianceEventsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('events');

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <AdminShell
      title="Alliance Events"
      subtitle="Manage kingdom events and alliance details in one place."
      onLogout={handleLogout}
    >
      <div className="admin-subtabs" role="tablist" aria-label="Alliance Events sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`admin-subtab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'events' ? <EventsPanel /> : <AlliancesPanel />}
      </div>

      <style>{`
        .admin-subtabs{display:flex;gap:6px;margin-bottom:18px;border-bottom:1px solid var(--edge)}
        .admin-subtab{padding:10px 16px;background:none;border:0;border-bottom:2px solid transparent;font-weight:700;font-size:.85rem;letter-spacing:.02em;color:var(--color-text-muted,inherit);cursor:pointer}
        .admin-subtab.is-active{color:var(--gold-bright,inherit);border-bottom-color:var(--gold-bright,currentColor)}
        .admin-subtab:focus-visible{outline:2px solid var(--gold-bright,currentColor);outline-offset:2px}
      `}</style>
    </AdminShell>
  );
}
