'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { SUPPORT_URL } from '../lib/supportLink';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/guides', label: 'Guides' },
  { href: '/events', label: 'Events' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/tools', label: 'Tools' },
  { href: '/player-record', label: 'Members' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

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
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? 'active' : ''}
              aria-current={isActive(link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/chronometer" className="site-nav-cta">Join K710</Link>
          <Link href="/admin" className="site-nav-admin">Admin</Link>
          <Link href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="site-nav-support">
            ☕ Support K710 Hub
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
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={isActive(link.href) ? 'active' : ''}>
              {link.label}
            </Link>
          ))}
          <Link href="/chronometer" onClick={() => setOpen(false)} className="site-nav-cta">Join K710</Link>
          <Link href="/admin" onClick={() => setOpen(false)} className="site-nav-admin">Admin</Link>
          <Link
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="site-nav-support"
          >
            ☕ Support K710 Hub
          </Link>
        </nav>
      )}
    </header>
  );
}
