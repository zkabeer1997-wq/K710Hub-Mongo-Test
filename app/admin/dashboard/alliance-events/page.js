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
    </AdminShell>
  );
}
