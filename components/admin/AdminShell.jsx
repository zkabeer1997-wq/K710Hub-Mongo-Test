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
      { href: '/admin/dashboard/member-pins', label: 'Member Profiles', match: '/admin/dashboard/member-pins' },
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

/**
 * THE WAR ROOM
 *
 * The admin shell is the command chamber. It offers two views so the room
 * never gets in the way of the work:
 *
 *   COMMAND — the war table: warm table light, brass counters, atmosphere.
 *   LEDGER  — dense operational mode for reviewing many rows quickly.
 *
 * The choice persists, so a returning admin lands where they actually work.
 * All page content is unchanged in both modes; only the room around it is.
 */
export default function AdminShell({ title, subtitle, actions, onLogout, counters = [], children }) {
  const pathname = usePathname();
  const [taskCounts, setTaskCounts] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      try { const response = await fetch('/api/admin-task-counts', { cache: 'no-store', signal: controller.signal }); if (response.ok) setTaskCounts(await response.json()); } catch {}
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('admin-tasks-changed', refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('admin-tasks-changed', refresh); };
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
      if (savedSections) {
        const parsed = JSON.parse(savedSections);
        if (parsed && typeof parsed === 'object') {
          setOpenSections((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      /* private mode */
    }
  }, []);

  // Auto-open the section that contains the active page
  useEffect(() => {
    const activeSection = NAV_SECTIONS.find((section) =>
      section.items.some((item) => isNavActive(pathname, item.match)),
    );
    if (activeSection) {
      setOpenSections((prev) => {
        if (prev[activeSection.id]) return prev;
        const next = { ...prev, [activeSection.id]: true };
        try {
          localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
        } catch {
          /* private mode */
        }
        return next;
      });
    }
  }, [pathname]);

  function choose(next) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* private mode */
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
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
        /* private mode */
      }
      return next;
    });
  }

  return (
    <div className={`admin-shell warroom-${mode}${sidebarCollapsed ? ' admin-sidebar-is-collapsed' : ''}`}>
      <style>{`.admin-task-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;padding:2px 6px;margin-left:8px;border-radius:999px;background:#c65330;color:white;font-size:11px;font-weight:800}.admin-sidebar-is-collapsed .admin-task-badge{margin-left:2px;min-width:16px;padding:1px 3px;font-size:9px}`}</style>
      <div className="warroom-atmos" aria-hidden="true" />

      <aside className={`admin-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
        <div className="admin-sidebar-top">
          <div className="admin-sidebar-brand">
            <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.6" />
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
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <span className="admin-sidebar-toggle-arrow" aria-hidden="true">
              {sidebarCollapsed ? '»' : '«'}
            </span>
          </button>
        </div>

        <nav className="admin-sidebar-nav" aria-label="Admin sections">
          {NAV_SECTIONS.map((section) => {
            const isOpen = openSections[section.id] !== false;
            const sectionHasActive = section.items.some((item) => isNavActive(pathname, item.match));
            return (
              <div
                key={section.id}
                className={`admin-nav-section${sectionHasActive ? ' has-active' : ''}${isOpen ? ' is-open' : ''}`}
              >
                <button
                  type="button"
                  className="admin-nav-section-header"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isOpen}
                  title={section.label}
                >
                  <span className="admin-nav-section-label">{section.label}</span>
                  {!sidebarCollapsed && (
                    <span className="admin-nav-section-chevron" aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                  )}
                </button>
                {(isOpen || sidebarCollapsed) && (
                  <div className="admin-nav-section-items" role="group" aria-label={section.label}>
                    {section.items.map((item) => {
                      const isActive = isNavActive(pathname, item.match);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={isActive ? 'active' : ''}
                          aria-current={isActive ? 'page' : undefined}
                          title={item.label}
                        >
                          {sidebarCollapsed ? item.label.charAt(0) : item.label}
                          {taskCounts[item.badge] > 0 && <span className="admin-task-badge" aria-label={`${taskCounts[item.badge]} unresolved`}>{taskCounts[item.badge]}</span>}
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
          {!sidebarCollapsed && (
            <div className="warroom-modes" role="group" aria-label="Admin view">
              <button
                type="button"
                className="warroom-mode"
                data-on={mode === 'command'}
                aria-pressed={mode === 'command'}
                onClick={() => choose('command')}
              >
                Admin
              </button>
              <button
                type="button"
                className="warroom-mode"
                data-on={mode === 'ledger'}
                aria-pressed={mode === 'ledger'}
                onClick={() => choose('ledger')}
              >
                Ledger
              </button>
            </div>
          )}
          <Link href="/" className="admin-sidebar-view-site" title="View Public Site">
            {sidebarCollapsed ? 'Site' : 'View Public Site'}
          </Link>
          {onLogout && (
            <button type="button" className="admin-sidebar-logout" onClick={onLogout} title="Log Out">
              {sidebarCollapsed ? 'Out' : 'Log Out'}
            </button>
          )}
        </div>
      </aside>

      <div className="admin-content">
        <div className="warroom-tablelight" aria-hidden="true" />
        <header className="admin-topbar">
          <div>
            {subtitle && <span className="admin-topbar-kicker">{subtitle}</span>}
            <h1>{title}</h1>
          </div>
          {actions && <div className="admin-topbar-actions">{actions}</div>}
        </header>

        {/* Brass counters read off the same live data the tables use. */}
        {counters.length > 0 && (
          <div className="warroom-counters" aria-label="Admin summary">
            {counters.map((c) => (
              <div key={c.label} className="warroom-counter">
                <span className="warroom-counter-val">{c.value}</span>
                <span className="k-mark warroom-counter-label">{c.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="admin-content-body">{children}</div>
      </div>
    </div>
  );
}
