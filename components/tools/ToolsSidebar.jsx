'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TOOLS_NAV_SECTIONS } from '../../lib/toolsNavConfig';
import styles from './ToolsSidebar.module.css';

// Collapsible, grouped tool nav for Console pages - the sidebar-with-groups
// pattern from components/admin/AdminShell.jsx, generalized so any future
// tool page can drop it in rather than hand-rolling its own nav. An item can
// carry a `subItems` list (see lib/toolsNavConfig.js); it's rendered only
// while that item is the active page, so a tool's internal sections don't
// clutter the nav for every other tool.

const SECTIONS_KEY = 'k710-tools-nav-sections';

function isNavActive(pathname, href) {
  const base = href.split('#')[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

export default function ToolsSidebar({ sections = TOOLS_NAV_SECTIONS, className = '' }) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(sections.map((section) => [section.id, true])),
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SECTIONS_KEY);
      if (saved) setOpenSections((prev) => ({ ...prev, ...JSON.parse(saved) }));
    } catch {
      /* ignore */
    }
  }, []);

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

  return (
    <nav className={`${styles.sidebar} ${className}`} aria-label="Tools navigation">
      {sections.map((section) => {
        const sectionOpen = openSections[section.id] !== false;
        const hasActive = section.items.some((item) => isNavActive(pathname, item.href));
        return (
          <div key={section.id} className={`${styles.section}${hasActive ? ` ${styles.hasActive}` : ''}`}>
            <button
              type="button"
              className={styles.sectionHeader}
              onClick={() => toggleSection(section.id)}
              aria-expanded={sectionOpen}
            >
              <span>{section.label}</span>
              <span className={styles.chevron} aria-hidden="true">{sectionOpen ? '▾' : '▸'}</span>
            </button>
            {sectionOpen && (
              <div className={styles.items}>
                {section.items.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <div key={item.href}>
                      <Link href={item.href} className={active ? styles.active : undefined}>
                        {item.label}
                      </Link>
                      {active && item.subItems && (
                        <div className={styles.subItems}>
                          {item.subItems.map((sub) => (
                            <Link key={sub.href} href={sub.href}>
                              {sub.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
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
