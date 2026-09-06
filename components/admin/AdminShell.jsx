'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_SECTIONS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    items: [
      { href: '/admin/dashboard/overview', label: 'Overview', match: '/admin/dashboard/overview' },
    ],
  },
  {
    id: 'website',
    label: 'Website',
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
    label: 'Members',
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
    label: 'KvK',
    items: [
      { href: '/admin/dashboard/prep-ministers', label: 'Prep Ministers', match: '/admin/dashboard/prep-ministers' },
      { href: '/admin/dashboard', label: 'KvK Members', match: '/admin/dashboard' },
    ],
  },
  {
    id: 'flamedragon',
    label: 'Flamedragon',
    items: [
      { href: '/admin/dashboard/noble-advisor', label: 'Noble Advisor', match: '/admin/dashboard/noble-advisor' },
      { href: '/admin/dashboard/flamedragon', label: 'Flamedragon Tyrant', match: '/admin/dashboard/flamedragon' },
    ],
  },
];

const SIDEBAR_KEY = 'k710-admin-sidebar-collapsed';
const SECTIONS_KEY = 'k710-admin-nav-sections';

function isNavActive(pathname, match) {
  if (match === '/admin/dashboard') {
    return pathname === '/admin/dashboard';
  }
  return pathname === match || pathname.startsWith(`${match}/`);
}

export default function AdminShell({ title, subtitle, actions, onLogout, counters = [], children }) {
  const pathname = usePathname();
  const [taskCounts, setTaskCounts] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(NAV_SECTIONS.map((section) => [section.id, true])),
  );

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/admin-task-counts', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.ok) setTaskCounts(await response.json());
      } catch {
        /* ignore */
      }
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

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === '1') setSidebarCollapsed(true);
      const savedSections = localStorage.getItem(SECTIONS_KEY);
      if (savedSections) setOpenSections(JSON.parse(savedSections));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleSection(id) {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function handleLogout() {
    if (onLogout) {
      await onLogout();
      return;
    }
    await fetch('/api/admin-logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  return (
    <div className={`admin-shell${sidebarCollapsed ? ' admin-sidebar-is-collapsed' : ''}`}>
      <aside className={`admin-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`} aria-label="Admin navigation">
        <div className="admin-sidebar-top">
          <div className="admin-sidebar-brand">
            <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <path
                d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            {!sidebarCollapsed && (
              <div>
                <span className="admin-sidebar-brand-k">K710</span>
                <span className="admin-sidebar-brand-sub">Admin</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="admin-sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="admin-sidebar-toggle-arrow">{sidebarCollapsed ? '»' : '«'}</span>
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {NAV_SECTIONS.map((section) => {
            const sectionOpen = openSections[section.id] !== false;
            const hasActive = section.items.some((item) => isNavActive(pathname, item.match));
            return (
              <div
                key={section.id}
                className={`admin-nav-section${hasActive ? ' has-active' : ''}`}
              >
                <button
                  type="button"
                  className="admin-nav-section-header"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={sectionOpen}
                >
                  <span className="admin-nav-section-label">{section.label}</span>
                  <span className="admin-nav-section-chevron">{sectionOpen ? '▾' : '▸'}</span>
                </button>
                {sectionOpen && (
                  <div className="admin-nav-section-items">
                    {section.items.map((item) => {
                      const active = isNavActive(pathname, item.match);
                      const badge = item.badge ? Number(taskCounts[item.badge] || 0) : 0;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={active ? 'active' : undefined}
                        >
                          {item.label}
                          {badge > 0 ? ` (${badge})` : ''}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="admin-sidebar-bottom">
          <Link href="/" className="admin-sidebar-view-site">
            View site
          </Link>
          <button type="button" className="admin-sidebar-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="admin-content">
        <header className="admin-topbar">
          <div>
            <span className="admin-topbar-kicker">Kingdom 710 · Admin</span>
            <h1>{title}</h1>
            {subtitle ? <p className="admin-page-lead">{subtitle}</p> : null}
          </div>
          <div className="admin-topbar-actions">
            {counters?.length > 0 && (
              <div className="warroom-counters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {counters.map((counter) => (
                  <div key={counter.label} className="warroom-counter" style={{ padding: '6px 10px' }}>
                    <span className="warroom-counter-label">{counter.label}</span>{' '}
                    <strong className="warroom-counter-val">{counter.value}</strong>
                  </div>
                ))}
              </div>
            )}
            {actions}
          </div>
        </header>
        <div className="admin-content-body">{children}</div>
      </div>
    </div>
  );
}
