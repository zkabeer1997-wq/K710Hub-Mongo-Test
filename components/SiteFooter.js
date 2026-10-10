'use client';

import Link from 'next/link';
import { SUPPORT_URL } from '../lib/supportLink';
import { useMemberFormStatus } from '../lib/useMemberFormStatus';
import { useT } from './i18n/LanguageProvider';

// Mirrors the top-nav structure in SiteHeader.js: the standalone links
// (Home, Guides, Apply) plus the About and Members dropdown groups, each
// presented under a small heading. The Admin link is intentionally absent.
const FOOTER_GROUPS = [
  {
    heading: 'footer.group.explore',
    links: [
      { href: '/', label: 'footer.link.home' },
      { href: '/guides', label: 'footer.link.guides' },
      { href: '/interest', label: 'footer.link.apply' },
      { href: '/help', label: 'footer.link.help' },
    ],
  },
  {
    heading: 'footer.group.about',
    links: [
      { href: '/about', label: 'footer.link.about' },
      { href: '/timeline', label: 'footer.link.timeline' },
      { href: '/gallery', label: 'footer.link.gallery' },
      { href: '/glossary', label: 'footer.link.glossary' },
      { href: '/lore', label: 'footer.link.lore' },
    ],
  },
  {
    heading: 'footer.group.members',
    links: [
      { href: '/dashboard', label: 'footer.link.dashboard' },
      { href: '/power-profile', label: 'footer.link.power' },
      { href: '/forms', label: 'footer.link.forms' },
      { href: '/tools', label: 'footer.link.tools' },
      { href: '/events', label: 'footer.link.events' },
    ],
  },
];

export default function SiteFooter() {
  const t = useT();
  const { status, loaded } = useMemberFormStatus('footer');
  const signedOut = loaded && !status.signedIn;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <div>
            <span className="site-footer-name">{t('footer.name')}</span>
            <span className="site-footer-tag">{t('footer.tag')}</span>
          </div>
        </div>

        <nav className="site-footer-nav" aria-label={t('footer.nav.aria')}>
          {FOOTER_GROUPS.map((group) => (
            <div className="site-footer-group" key={group.heading}>
              <h2 className="site-footer-group-heading">{t(group.heading)}</h2>
              <ul>
                {/* Signed out: "Sign in" leads the Members column. */}
                {signedOut && group.heading === 'footer.group.members' && (
                  <li>
                    <Link href="/login">{t('signin.member.link')}</Link>
                    <small className="site-footer-sub">{t('signin.member.sub')}</small>
                  </li>
                )}
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{t(link.label)}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <Link
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="site-footer-support"
          title={t('footer.donate.aria')}
          aria-label={t('footer.donate.aria')}
        >
          {t('footer.donate')}
        </Link>
      </div>
    </footer>
  );
}
