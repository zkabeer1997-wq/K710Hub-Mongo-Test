'use client';

import { useEffect, useState } from 'react';
import Breadcrumb from '../ui/Breadcrumb';
import ToolsSidebar from './ToolsSidebar';
import styles from './ConsoleToolLayout.module.css';

const COLLAPSE_KEY = 'k710-tools-sidebar-collapsed';

/**
 * Shared Console tool shell: sidebar nav + breadcrumb + content column.
 * Intended to replace the ad hoc header/nav markup each tool page currently
 * hand-rolls (see components/tools/ToolPage.jsx) for any tool built or
 * rebuilt going forward - keep this generic, no Hero-Gear-specific markup.
 */
export default function ConsoleToolLayout({ breadcrumb, children }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <main className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
      <aside className={styles.sidebarCol}>
        <button
          type="button"
          className={styles.sidebarToggle}
          onClick={toggle}
          aria-label={collapsed ? 'Expand tools navigation' : 'Collapse tools navigation'}
        >
          {collapsed ? '»' : '«'}
        </button>
        {!collapsed && <ToolsSidebar />}
      </aside>
      <div className={styles.main}>
        {breadcrumb && <Breadcrumb items={breadcrumb} />}
        {children}
      </div>
    </main>
  );
}
