'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAdminEmbedded } from './adminEmbed';

// Link tabs that join separate admin routes into one page (Inbox, Tools).
// The old route URLs stay valid; each is simply one tab of the group.
export const INBOX_TABS = [
  { href: '/admin/dashboard/interest', label: 'Transfer requests', badge: 'transfers' },
  { href: '/admin/dashboard/website-requests', label: 'Website requests', badge: 'website' },
];

export const TOOL_TABS = [
  { href: '/admin/dashboard/tool-editing', label: 'Pack editing' },
  { href: '/admin/dashboard/tool-database', label: 'Tool database' },
];

export default function SectionTabs({ tabs, label }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState({});
  const wantsCounts = tabs.some((t) => t.badge);
  useEffect(() => {
    if (!wantsCounts) return;
    fetch('/api/admin-task-counts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setCounts)
      .catch(() => {});
  }, [wantsCounts]);
  const embedded = useAdminEmbedded();
  if (embedded) return null;
  return (
    <nav className="admin-tabs" aria-label={label}>
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const n = tab.badge ? Number(counts?.[tab.badge] || 0) : 0;
        return (
          <Link key={tab.href} href={tab.href} className={`admin-tab${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            {tab.label}
            {n > 0 ? <span className="admin-nav-count" aria-label={`${n} waiting`}>{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
