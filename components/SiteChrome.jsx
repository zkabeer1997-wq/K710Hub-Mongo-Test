'use client';

import { usePathname } from 'next/navigation';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import SiteAtmosphere from './SiteAtmosphere';
import DeadlineTicker from './member/DeadlineTicker';
import MemberSidebar from './member/MemberSidebar';
import LanguageSwitcher from './i18n/LanguageSwitcher';
import { useT } from './i18n/LanguageProvider';

function wantsChrome(pathname) {
  if (pathname === '/gate') return false;
  // Admin login + full war-room shell own their chrome; public header/footer look wrong here.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return false;
  return true;
}

const MEMBER_PAGE_PREFIXES = ['/dashboard', '/forms', '/power-profile', '/flamedragon', '/prep-phase-backpack'];
function isMemberPage(pathname) {
  return MEMBER_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function routeTone(pathname) {
  if (pathname === '/' || pathname.startsWith('/about') || pathname.startsWith('/timeline') || pathname.startsWith('/events') || pathname.startsWith('/gallery') || pathname.startsWith('/guides') || pathname.startsWith('/alliances') || pathname.startsWith('/interest') || pathname.startsWith('/glossary') || pathname.startsWith('/help')) return 'realm';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'console';
}

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const t = useT();
  const tone = routeTone(pathname);
  const skipLink = <a href="#main" className="k-skip">{t('chrome.skip')}</a>;

  // The member dashboard draws its own header (shield, wordmark, language button), so the shared
  // header/ticker/footer are not rendered here. Its signed-out views add them back (PlayerRecordGate).
  if (pathname === '/dashboard') {
    return (
      <div className={`site-shell site-shell-${tone}`}>
        {skipLink}
        <SiteAtmosphere />
        <div id="main" className={`site-route site-route-${tone}`}>{children}</div>
      </div>
    );
  }

  if (!wantsChrome(pathname)) {
    return (
      <>
        {skipLink}
        <div id="main" className={`site-route site-route-${tone}`}>{children}</div>
        {/* Public entry pages without the site header (/gate) still need a way to change language. */}
        {!(pathname === '/admin' || pathname.startsWith('/admin/')) && <LanguageSwitcher className="lang-switch--floating" />}
      </>
    );
  }

  return (
    <div className={`site-shell site-shell-${tone}`}>
      {skipLink}
      <SiteAtmosphere />
      <SiteHeader />
      <DeadlineTicker />
      {isMemberPage(pathname) ? (
        <div className="member-layout">
          <MemberSidebar />
          <div id="main" className={`site-route site-route-${tone}`}>{children}</div>
        </div>
      ) : (
        <div id="main" className={`site-route site-route-${tone}`}>{children}</div>
      )}
      <SiteFooter />
    </div>
  );
}
