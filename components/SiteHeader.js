'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SUPPORT_URL } from '../lib/supportLink';

const NAV_ITEMS = [
  { type: 'link', href: '/', label: 'Home' },
  {
    type: 'group',
    id: 'about',
    label: 'About',
    children: [
      { href: '/about', label: 'About' },
      { href: '/timeline', label: 'Game Updates' },
      { href: '/gallery', label: 'Gallery' },
      { href: '/glossary', label: 'Glossary' },
    ],
  },
  { type: 'link', href: '/guides', label: 'Guides' },
  {
    type: 'group',
    id: 'members',
    label: 'Members',
    children: [
      { href: '/player-record', label: 'Dashboard' },
      { href: '/forms', label: 'Forms' },
      { href: '/tools', label: 'Tools' },
      { href: '/events', label: 'Events' },
    ],
  },
];

function isActivePath(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavDropdown({ item, pathname, openGroup, setOpenGroup }) {
  const isOpen = openGroup === item.id;
  const groupActive = item.children.some((child) => isActivePath(pathname, child.href));
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (
        triggerRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpenGroup(null);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenGroup(null);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = itemRefs.current.filter(Boolean);
        if (!items.length) return;
        const currentIndex = items.findIndex((el) => el === document.activeElement);
        let nextIndex;
        if (currentIndex === -1) {
          nextIndex = event.key === 'ArrowDown' ? 0 : items.length - 1;
        } else if (event.key === 'ArrowDown') {
          nextIndex = (currentIndex + 1) % items.length;
        } else {
          nextIndex = (currentIndex - 1 + items.length) % items.length;
        }
        items[nextIndex]?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setOpenGroup]);

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' && !isOpen) {
      event.preventDefault();
      setOpenGroup(item.id);
    }
  }

  return (
    <div className="site-nav-group">
      <button
        type="button"
        ref={triggerRef}
        className={`site-nav-group-trigger${groupActive ? ' active' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setOpenGroup(isOpen ? null : item.id)}
        onKeyDown={handleTriggerKeyDown}
      >
        {item.label} <span className="site-nav-group-caret" aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="site-nav-group-menu" role="menu" ref={menuRef} aria-label={item.label}>
          {item.children.map((child, index) => (
            <Link
              key={child.href}
              href={child.href}
              role="menuitem"
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className={isActivePath(pathname, child.href) ? 'active' : ''}
              aria-current={isActivePath(pathname, child.href) ? 'page' : undefined}
              onClick={() => setOpenGroup(null)}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand" onClick={() => setOpen(false)}>
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="site-brand-crest">
            <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span>K710</span>
        </Link>

        <nav className="site-nav" aria-label="Main site">
          {NAV_ITEMS.map((item) => {
            if (item.type === 'group') {
              return (
                <NavDropdown
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  openGroup={openGroup}
                  setOpenGroup={setOpenGroup}
                />
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActivePath(pathname, item.href) ? 'active' : ''}
                aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/chronometer" className="site-nav-cta">Apply</Link>
          <Link href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="site-nav-support">
            ☕ Support Us
          </Link>
        </nav>

        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={open}
          aria-label="Toggle navigation menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {open && (
        <nav className="site-nav-mobile" aria-label="Mobile site">
          {NAV_ITEMS.map((item) => {
            if (item.type === 'group') {
              const groupActive = item.children.some((child) => isActivePath(pathname, child.href));
              return (
                <div key={item.id} className="site-nav-mobile-group">
                  <span className={`site-nav-mobile-heading${groupActive ? ' active' : ''}`}>{item.label}</span>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setOpen(false)}
                      className={isActivePath(pathname, child.href) ? 'active' : ''}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={isActivePath(pathname, item.href) ? 'active' : ''}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/chronometer" onClick={() => setOpen(false)} className="site-nav-cta">Apply</Link>
          <Link
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="site-nav-support"
          >
            ☕ Support Us
          </Link>
        </nav>
      )}
    </header>
  );
}
