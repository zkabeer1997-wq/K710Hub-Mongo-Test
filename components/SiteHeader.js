'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SUPPORT_URL } from '../lib/supportLink';
import { useMemberFormStatus } from '../lib/useMemberFormStatus';
import UtcClock from './member/UtcClock';
import FormStatusMark from './member/FormStatusMark';
import LanguageSwitcher from './i18n/LanguageSwitcher';
import EasyViewToggle from './EasyViewToggle';

const NAV_ITEMS = [
  { type: 'link', href: '/', label: 'Home' },
  {
    type: 'group',
    id: 'about',
    label: 'About',
    children: [
      { href: '/about', label: 'About Kingdom 710' },
      { href: '/timeline', label: 'Release Timeline' },
      { href: '/gallery', label: 'Gallery' },
      { href: '/glossary', label: 'Glossary' },
    ],
  },
  { type: 'link', href: '/guides', label: 'Guides' },
  { type: 'link', href: '/help', label: 'Help' },
  {
    type: 'group',
    id: 'members',
    label: 'Members',
    children: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/forms', label: 'Forms' },
      { href: '/tools', label: 'Tools' },
      { href: '/events', label: 'Events' },
    ],
  },
];

// The signed-in Members menu also lists every form with its live status
// (red dot = open and not yet submitted, badge = outside its window).
function membersChildren(base, status) {
  if (!status?.signedIn || !status.forms?.length) {
    return base.flatMap((c) => (c.href === '/forms' ? [{ href: '/power-profile', label: 'Power Profile' }, c] : [c]));
  }
  return [
    ...base,
    { separator: true, label: 'My forms' },
    ...status.forms.map((f) => ({ href: f.href, label: f.shortLabel, status: f })),
  ];
}

function isActivePath(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Hover-to-open is desktop/pointer-device behavior only — touch has no real
// hover, and browsers can fire a synthetic mouseenter on tap, which would
// otherwise pop the menu open right before the tap's own click toggles it
// shut again. Checked live (not cached) since a hybrid device can change
// pointer type between checks.
function isHoverCapable() {
  try {
    return window.matchMedia('(hover: hover)').matches;
  } catch {
    return false;
  }
}

// Delay before a mouseleave actually closes the menu, so crossing the gap
// between the trigger and its dropdown (or briefly overshooting) doesn't
// dismiss it.
const HOVER_CLOSE_DELAY_MS = 150;

function NavDropdown({ item, pathname, openGroup, setOpenGroup, memberStatus }) {
  const isOpen = openGroup === item.id;
  const children = item.id === 'members' ? membersChildren(item.children, memberStatus) : item.children;
  const links = children.filter((child) => !child.separator);
  const groupActive = links.some((child) => isActivePath(pathname, child.href));
  const groupPending = item.id === 'members' && links.some((child) => child.status?.needsInput);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const closeTimeoutRef = useRef(null);

  function clearCloseTimeout() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  useEffect(() => () => clearCloseTimeout(), []);

  function handleGroupMouseEnter() {
    if (!isHoverCapable()) return;
    clearCloseTimeout();
    setOpenGroup(item.id);
  }

  function handleGroupMouseLeave() {
    if (!isHoverCapable()) return;
    clearCloseTimeout();
    // Only close the group hover opened, in case the pointer has already
    // moved on to open a different one before this timer fires.
    closeTimeoutRef.current = setTimeout(() => {
      setOpenGroup((current) => (current === item.id ? null : current));
    }, HOVER_CLOSE_DELAY_MS);
  }

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
    <div className="site-nav-group" onMouseEnter={handleGroupMouseEnter} onMouseLeave={handleGroupMouseLeave}>
      <button
        type="button"
        ref={triggerRef}
        className={`site-nav-group-trigger${groupActive ? ' active' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => {
          clearCloseTimeout();
          setOpenGroup(isOpen ? null : item.id);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {item.label}
        {groupPending && (<><span className="form-status-dot" aria-hidden="true" /><span className="sr-only">: forms not submitted</span></>)}
        {' '}<span className="site-nav-group-caret" aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="site-nav-group-menu" role="menu" ref={menuRef} aria-label={item.label}>
          {children.map((child) => {
            if (child.separator) {
              return <span key={`sep-${child.label}`} className="site-nav-group-label" role="presentation">{child.label}</span>;
            }
            const index = links.indexOf(child);
            return (
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
                <span>{child.label}</span>
                <FormStatusMark status={child.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const toggleRef = useRef(null);
  const mobileRef = useRef(null);
  const headerRef = useRef(null);
  const { status: memberStatus } = useMemberFormStatus(pathname);

  // Close the mobile menu on route change.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Open mobile menu: focus trap (Tab cycles toggle + menu links), Esc closes
  // and returns focus to the trigger, outside pointer (backdrop) closes, and
  // body scroll is locked while open.
  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileRef.current?.querySelector(FOCUSABLE)?.focus();

    function onKeyDown(event) {
      // The language chooser dialog manages its own keys and focus.
      if (event.target?.closest?.('.k710-language-overlay')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = [toggleRef.current, ...(mobileRef.current?.querySelectorAll(FOCUSABLE) || [])].filter(Boolean);
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
    // If the viewport grows past the mobile breakpoint, drop the menu state.
    function onResize() {
      if (window.innerWidth >= 760) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <header className="site-header" ref={headerRef}>
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
                  memberStatus={memberStatus}
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
          <Link href="/interest" className="site-nav-cta">Apply</Link>
          <Link
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="site-nav-support"
            title="Support K710 Hub (opens Ko-fi donation page in a new tab)"
            aria-label="Support K710 Hub (opens Ko-fi donation page in a new tab)"
          >
            ☕ Donate
          </Link>
        </nav>

        <UtcClock />
        <EasyViewToggle className="easy-view-toggle--header" />
        <LanguageSwitcher className="lang-switch--header" />

        <button
          type="button"
          ref={toggleRef}
          className="site-nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav-mobile"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="site-nav-toggle-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="site-nav-toggle-label">Menu</span>
        </button>
      </div>

      {open && (
        <>
        <div className="site-nav-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
        <nav className="site-nav-mobile" id="site-nav-mobile" ref={mobileRef} aria-label="Mobile site">
          <LanguageSwitcher className="lang-switch--mobile" showLabel onOpen={() => setOpen(false)} />
          <EasyViewToggle className="easy-view-toggle--mobile" />
          {NAV_ITEMS.map((item) => {
            if (item.type === 'group') {
              const kids = item.id === 'members' ? membersChildren(item.children, memberStatus) : item.children;
              const groupActive = kids.some((child) => !child.separator && isActivePath(pathname, child.href));
              return (
                <div key={item.id} className="site-nav-mobile-group">
                  <span className={`site-nav-mobile-heading${groupActive ? ' active' : ''}`}>{item.label}</span>
                  {kids.map((child) => child.separator ? (
                    <span key={`sep-${child.label}`} className="site-nav-group-label">{child.label}</span>
                  ) : (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setOpen(false)}
                      className={isActivePath(pathname, child.href) ? 'active' : ''}
                    >
                      <span>{child.label}</span>
                      <FormStatusMark status={child.status} />
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
          <Link href="/interest" onClick={() => setOpen(false)} className="site-nav-cta">Apply</Link>
          <Link
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="site-nav-support"
            title="Support K710 Hub (opens Ko-fi donation page in a new tab)"
            aria-label="Support K710 Hub (opens Ko-fi donation page in a new tab)"
          >
            ☕ Donate
          </Link>
        </nav>
        </>
      )}
    </header>
  );
}
