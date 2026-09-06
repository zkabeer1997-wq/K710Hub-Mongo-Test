'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_SECTIONS = [
  {
    id: 'dashboard',
    label: 'Dashboard Panel',
    items: [
      { href: '/admin/dashboard/overview', label: 'Dashboard', match: '/admin/dashboard/overview' },
    ],
  },
  {
    id: 'website',
    label: 'Website Management',
    items: [
      { href: '/admin/dashboard/guides', label: 'Guides', match: '/admin/dashboard/guides' },
      { href: '/admin/dashboard/events', label: 'Events', match: '/admin/dashboard/events' },
      { href: '/admin/dashboard/alliances', label: 'Alliances', match: '/admin/dashboard/alliances' },
      { href: '/admin/dashboard/gallery', label: 'Gallery', match: '/admin/dashboard/gallery' },
      { href: '/admin/dashboard/tool-editing', label: 'Tool Editing', match: '/admin/dashboard/tool-editing' },
      { href: '/admin/dashboard/form-gates', label: 'Form Gates', match: '/admin/dashboard/form-gates' },
    ],
  },
  {
    id: 'member',
    label: 'Member and Transfer Management',
    items: [
      { href: '/admin/dashboard/member-pins', label: 'Member roster', match: '/admin/dashboard/member-pins' },
      { href: '/admin/dashboard/access', label: 'User Access', match: '/admin/dashboard/access' },
      { href: '/admin/dashboard/gift-codes', label: 'Gift Codes', match: '/admin/dashboard/gift-codes' },
      { href: '/admin/dashboard/interest', label: 'Transfer Requests', badge: 'transfers', match: '/admin/dashboard/interest' },
      { href: '/admin/dashboard/website-requests', label: 'Website Requests', badge: 'website', match: '/admin/dashboard/website-requests' },
    ],
  },
  {
    id: 'kvk',
    label: 'KvK Management',
    items: [
      { href: '/admin/dashboard/prep-ministers', label: 'Prep Ministers', match: '/admin/dashboard/prep-ministers' },
      { href: '/admin/dashboard', label: 'KvK Members', match: '/admin/dashboard' },
    ],
  },
  {
    id: 'flamedragon',
    label: 'Flamedragon Management',
    items: [
      { href: '/admin/dashboard/noble-advisor', label: 'Noble Advisor Schedule', match: '/admin/dashboard/noble-advisor' },
      { href: '/admin/dashboard/flamedragon', label: 'Flamedragon Tyrant', match: '/admin/dashboard/flamedragon' },
    ],
  },
];

const MODE_KEY = 'k710-warroom-mode';
const SIDEBAR_KEY = 'k710-admin-sidebar-collapsed';
const SECTIONS_KEY = 'k710-admin-nav-sections';

function isNavActive(pathname, match) {
  if (match === '/admin/dashboard') {
    return pathname === '/admin/dashboard';
  }
  return pathname === match || pathname.startsWith(match + '/');
}

export default function AdminShell({ title, subtitle, actions, onLogout, counters = [], children }) {
  const pathname = usePathname();
  const [taskCounts, setTaskCounts] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/admin-task-counts', { cache: 'no-store', signal: controller.signal });
        if (response.ok) setTaskCounts(await response.json());
      } catch {}
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('admin-tasks-changed', refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('admin-tasks-changed', refresh);
    };
  }, [pathname]);
  const [mode, setMode] = useState('ledger');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(NAV_SECTIONS.map((s) => [s.id, true])),
  );

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(MODE_KEY);
      if (savedMode === 'command' || savedMode === 'ledger') setMode(savedMode);
      const savedSidebar = localStorage.getItem(SIDEBAR_KEY);
      if (savedSidebar === '1') setSidebarCollapsed(true);
      const savedSections = localStorage.getItem(SECTIONS_KEY);
      if (savedSections) setOpenSections(JSON.parse(savedSections));
    } catch {}
  }, []);

  function toggleMode() {
    setMode((prev) => {
      const next = prev === 'ledger' ? 'command' : 'ledger';
      try { localStorage.setItem(MODE_KEY, next); } catch {}
      return next;
    });
  }

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  function toggleSection(id) {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  async function handleLogout() {
    if (onLogout) return onLogout();
    await fetch('/api/admin-logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/admin/login';
  }

  return (
    <div className={`admin-shell mode-${mode}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar-brand">
          <strong>K710 War Room</strong>
          <button type="button" className="admin-sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
            {sidebarCollapsed ? '»' : '«'}
          </button>
        </div>
        <nav className="admin-sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.id} className="admin-nav-section">
              <button type="button" className="admin-nav-section-label" onClick={() => toggleSection(section.id)}>
                {section.label}
              </button>
              {openSections[section.id] !== false && (
                <ul>
                  {section.items.map((item) => {
                    const active = isNavActive(pathname, item.match);
                    const badge = item.badge ? taskCounts[item.badge] : null;
                    return (
                      <li key={item.href}>
                        <Link href={item.href} className={active ? 'is-active' : undefined}>
                          <span>{item.label}</span>
                          {badge > 0 && <em className="admin-nav-badge">{badge}</em>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <button type="button" onClick={toggleMode} className="admin-mode-toggle">
            Mode: {mode === 'ledger' ? 'Ledger' : 'Command'}
          </button>
          <button type="button" onClick={handleLogout} className="admin-logout">
            Log out
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-main-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="admin-main-actions">{actions}</div>}
          {counters?.length > 0 && (
            <div className="admin-main-counters">
              {counters.map((c) => (
                <span key={c.label}>
                  {c.label} <strong>{c.value}</strong>
                </span>
              ))}
            </div>
          )}
        </header>
        <div className="admin-main-body">{children}</div>
      </div>
    </div>
  );
}
