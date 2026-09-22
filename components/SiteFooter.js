import Link from 'next/link';
import { SUPPORT_URL } from '../lib/supportLink';

// Mirrors the top-nav structure in SiteHeader.js: the standalone links
// (Home, Guides, Apply) plus the About and Members dropdown groups, each
// presented under a small heading. The Admin link is intentionally absent.
const FOOTER_GROUPS = [
  {
    heading: 'Explore',
    links: [
      { href: '/', label: 'Home' },
      { href: '/guides', label: 'Guides' },
      { href: '/chronometer', label: 'Apply' },
    ],
  },
  {
    heading: 'About',
    links: [
      { href: '/about', label: 'About' },
      { href: '/timeline', label: 'Game Updates' },
      { href: '/gallery', label: 'Gallery' },
      { href: '/glossary', label: 'Glossary' },
    ],
  },
  {
    heading: 'Members',
    links: [
      { href: '/player-record', label: 'Dashboard' },
      { href: '/forms', label: 'Forms' },
      { href: '/tools', label: 'Tools' },
      { href: '/events', label: 'Events' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <div>
            <span className="site-footer-name">Kingdom 710</span>
            <span className="site-footer-tag">Three alliances. One kingdom. KvK-first.</span>
          </div>
        </div>

        <nav className="site-footer-nav" aria-label="Footer">
          {FOOTER_GROUPS.map((group) => (
            <div className="site-footer-group" key={group.heading}>
              <h2 className="site-footer-group-heading">{group.heading}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
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
          title="Support K710 Hub (opens Ko-fi donation page in a new tab)"
          aria-label="Support K710 Hub (opens Ko-fi donation page in a new tab)"
        >
          ☕ Support K710 Hub <span aria-hidden="true">(donate)</span>
        </Link>
      </div>
    </footer>
  );
}
