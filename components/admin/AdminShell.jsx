'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_NAV, isNavActive, navBadge } from './adminNav';
import { useAdminEmbedded } from './adminEmbed';
import StackTableLabels from '../ui/StackTableLabels';

const SIDEBAR_KEY = 'k710-admin-sidebar-collapsed';
const SECTIONS_KEY = 'k710-admin-nav-groups';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function activeGroupId(pathname) {
  const group = ADMIN_NAV.find((g) => g.items.some((item) => isNavActive(pathname, item)));
  return group ? group.id : null;
}

function NavGroups({ pathname, taskCounts, openGroups, onToggle, collapsed = false, onNavigate, labelsOnly = false }) {
  return (
    <nav className="admin-sidebar-nav" aria-label="Admin sections">
      {ADMIN_NAV.map((group) => {
        const hasActive = group.items.some((item) => isNavActive(pathname, item));
        const open = collapsed ? true : Boolean(openGroups[group.id]);
        const groupBadge = group.items.reduce((sum, item) => sum + navBadge(item, taskCounts), 0);
        const panelId = `admin-nav-${group.id}`;
        return (
          <div key={group.id} className={`admin-nav-section${hasActive ? ' has-active' : ''}`}>
            {labelsOnly ? (
              <h2 className="admin-nav-section-header is-static">{group.label}</h2>
            ) : (
              <button
                type="button"
                className="admin-nav-section-header"
                onClick={() => onToggle(group.id)}
                aria-expanded={open}
                aria-controls={panelId}
              >
                <span className="admin-nav-section-label">{group.label}</span>
                {!open && groupBadge > 0 ? <span className="admin-nav-count" aria-label={`${groupBadge} waiting`}>{groupBadge}</span> : null}
                <span className="admin-nav-section-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
              </button>
            )}
            {open && (
              <div className="admin-nav-section-items" id={panelId}>
                {group.items.map((item) => {
                  const active = isNavActive(pathname, item);
                  const badge = navBadge(item, taskCounts);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={active ? 'active' : undefined}
                      aria-current={active ? 'page' : undefined}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className="admin-nav-link-label">{item.label}</span>
                      {badge > 0 ? <span className="admin-nav-count" aria-label={`${badge} waiting`}>{badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function AdminShell(props) {
  const embedded = useAdminEmbedded();
  if (embedded) {
    return (
      <>
        <StackTableLabels />
        {props.actions ? <div className="admin-embed-actions">{props.actions}</div> : null}
        {props.children}
      </>
    );
  }
  return (
    <>
      <StackTableLabels />
      <FullShell {...props} />
    </>
  );
}

function FullShell({ title, subtitle, actions, meta, counters = [], onLogout, children }) {
  const pathname = usePathname();
  const [taskCounts, setTaskCounts] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => {
    const id = activeGroupId(pathname);
    return id ? { [id]: true } : {};
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/admin-task-counts', { cache: 'no-store', signal: controller.signal });
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

  // Restore remembered state once; the group holding this page is always opened.
  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === '1') setSidebarCollapsed(true);
      const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) || 'null');
      const active = activeGroupId(pathname);
      if (saved && typeof saved === 'object') setOpenGroups({ ...saved, ...(active ? { [active]: true } : {}) });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGroup = useCallback((id) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  // Dropdown menus built on <details> close when the user clicks elsewhere.
  useEffect(() => {
    function onPointerDown(event) {
      document.querySelectorAll('details.roster-more[open]').forEach((d) => {
        if (!d.contains(event.target)) d.removeAttribute('open');
      });
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // Close the drawer after any navigation.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Drawer: focus trap, Esc closes and returns focus, body scroll locked.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector('.admin-drawer-nav-close')?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(drawerRef.current?.querySelectorAll(FOCUSABLE) || []);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !nodes.includes(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !nodes.includes(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    function onResize() {
      if (window.innerWidth > 980) setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  async function handleLogout() {
    if (onLogout) {
      await onLogout();
      return;
    }
    await fetch('/api/admin-logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  const currentItem = ADMIN_NAV.flatMap((g) => g.items).find((item) => isNavActive(pathname, item));
  const menuBadge = ADMIN_NAV.flatMap((g) => g.items).reduce((sum, item) => sum + navBadge(item, taskCounts), 0);

  const bottom = (
    <div className="admin-sidebar-bottom">
      <Link href="/" className="admin-sidebar-view-site">View site</Link>
      <button type="button" className="admin-sidebar-logout" onClick={handleLogout}>Log out</button>
    </div>
  );

  return (
    <div className={`admin-shell${sidebarCollapsed ? ' admin-sidebar-is-collapsed' : ''}`}>
      <aside className={`admin-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`} aria-label="Admin">
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
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="admin-sidebar-toggle-arrow" aria-hidden="true">{sidebarCollapsed ? '»' : '«'}</span>
          </button>
        </div>
        <NavGroups
          pathname={pathname}
          taskCounts={taskCounts}
          openGroups={openGroups}
          onToggle={toggleGroup}
          collapsed={sidebarCollapsed}
        />
        {bottom}
      </aside>

      <div className="admin-mobile-bar">
        <button
          type="button"
          ref={menuButtonRef}
          className="admin-menu-button"
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          <span className="admin-menu-bars" aria-hidden="true"><span /><span /><span /></span>
          Menu
          {menuBadge > 0 ? <span className="admin-nav-count" aria-label={`${menuBadge} waiting`}>{menuBadge}</span> : null}
        </button>
        <span className="admin-mobile-here">{currentItem ? currentItem.label : 'Admin'}</span>
      </div>

      {menuOpen && (
        <div className="admin-drawer-nav-overlay" role="presentation" onClick={() => setMenuOpen(false)}>
          <div
            className="admin-drawer-nav"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-drawer-nav-head">
              <span className="admin-sidebar-brand-k">K710 Admin</span>
              <button type="button" className="admin-drawer-nav-close" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}>
                Close
              </button>
            </div>
            <NavGroups
              pathname={pathname}
              taskCounts={taskCounts}
              openGroups={Object.fromEntries(ADMIN_NAV.map((g) => [g.id, true]))}
              onToggle={() => {}}
              labelsOnly
              onNavigate={() => setMenuOpen(false)}
            />
            {bottom}
          </div>
        </div>
      )}

      <div className="admin-content">
        <header className="admin-topbar">
          <div className="admin-topbar-main">
            <h1>{title}</h1>
            {subtitle ? <p className="admin-page-lead">{subtitle}</p> : null}
            {meta ? <div className="admin-topbar-meta">{meta}</div> : null}
            {counters.length > 0 ? (
              <dl className="admin-counters">
                {counters.map((c) => (
                  <div key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>
                ))}
              </dl>
            ) : null}
          </div>
          {actions ? <div className="admin-topbar-actions">{actions}</div> : null}
        </header>
        <main id="main" tabIndex={-1} className="admin-content-body">{children}</main>
      </div>
    </div>
  );
}
