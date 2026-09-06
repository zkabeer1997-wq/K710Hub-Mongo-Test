'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SUPPORT_URL } from '../lib/supportLink';
import { DISCORD_URL } from '../lib/communityLinks';

const PRIMARY_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events' },
  { href: '/guides', label: 'Guides' },
  { href: '/gallery', label: 'Gallery' },
];

const SECONDARY_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/admin', label: 'Admin' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/session', { credentials: 'include', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.state === 'authenticated' && data.profile) {
          setSession(data.profile);
        } else {
          setSession(null);
        }
      })
      .catch(() => {
        if (active) setSession(null);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  function isActive(href) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const nickname =
    session?.nickname ||
    session?.playerName ||
    session?.playerId ||
    session?.memberId ||
    '';
  const memberId = session?.playerId || session?.memberId || '';
  const profileHref = memberId
    ? `/player-record?member_id=${encodeURIComponent(String(memberId))}`
    : '/player-record';
  const formsHref = memberId
    ? `/forms?member_id=${encodeURIComponent(String(memberId))}`
    : '/forms';

  return (
    <header className="site-header site-header-polished">
      <div className="site-header-inner">
        <Link href="/" className="site-brand" onClick={() => setOpen(false)}>
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="site-brand-crest">
            <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span>K710</span>
        </Link>

        <nav className="site-nav" aria-label="Main site">
          {PRIMARY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? 'active' : ''}
              aria-current={isActive(link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}

          <div className="site-nav-more">
            <button
              type="button"
              className="site-nav-more-btn"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((value) => !value)}
            >
              More
            </button>
            {moreOpen && (
              <div className="site-nav-more-menu" role="menu">
                {SECONDARY_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    role="menuitem"
                    className={isActive(link.href) ? 'active' : ''}
                    onClick={() => setMoreOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setMoreOpen(false)}>
                  Support
                </Link>
              </div>
            )}
          </div>

          {session ? (
            <>
              <Link href={formsHref} className="site-nav-member">Forms</Link>
              <Link href={profileHref} className="site-nav-session" title={String(nickname)}>
                {nickname || 'Member'}
              </Link>
            </>
          ) : (
            <Link href="/player-record" className="site-nav-member">Members</Link>
          )}

          <Link href="/chronometer" className="site-nav-cta">Join K710</Link>
          {DISCORD_URL ? (
            <Link href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="site-nav-discord">
              Discord
            </Link>
          ) : null}
        </nav>

        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={open}
          aria-label="Toggle navigation menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {open && (
        <nav className="site-nav-mobile" aria-label="Mobile site">
          {PRIMARY_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={isActive(link.href) ? 'active' : ''}>
              {link.label}
            </Link>
          ))}
          {SECONDARY_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={isActive(link.href) ? 'active' : ''}>
              {link.label}
            </Link>
          ))}
          {session ? (
            <>
              <Link href={formsHref} onClick={() => setOpen(false)}>Forms</Link>
              <Link href={profileHref} onClick={() => setOpen(false)}>{nickname || 'My profile'}</Link>
            </>
          ) : (
            <Link href="/player-record" onClick={() => setOpen(false)}>Members</Link>
          )}
          <Link href="/chronometer" onClick={() => setOpen(false)} className="site-nav-cta">Join K710</Link>
          {DISCORD_URL ? (
            <Link href={DISCORD_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="site-nav-discord">
              Discord
            </Link>
          ) : null}
          <Link href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            Support
          </Link>
        </nav>
      )}
    </header>
  );
}
