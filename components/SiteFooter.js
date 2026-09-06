import Link from 'next/link';
import { SUPPORT_URL } from '../lib/supportLink';
import { DISCORD_URL } from '../lib/communityLinks';

export default function SiteFooter() {
  return (
    <footer className="site-footer site-footer-polished">
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
        <nav className="site-footer-links" aria-label="Footer">
          <Link href="/">Home</Link>
          <Link href="/events">Events</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/about">About</Link>
          <Link href="/timeline">Timeline</Link>
          <Link href="/player-record">Members</Link>
          <Link href="/chronometer">Join K710</Link>
          {DISCORD_URL ? (
            <Link href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              Discord
            </Link>
          ) : null}
          <Link href="/admin">Admin</Link>
        </nav>
        <div className="site-footer-actions">
          <Link href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="site-footer-support">
            Support K710 Hub
          </Link>
          <p className="site-footer-lang-hint">Language: use the globe control to change on-device translation.</p>
        </div>
      </div>
    </footer>
  );
}
