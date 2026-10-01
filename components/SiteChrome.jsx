'use client';

import { usePathname } from 'next/navigation';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import SiteAtmosphere from './SiteAtmosphere';
import DeadlineTicker from './member/DeadlineTicker';
import MemberSidebar from './member/MemberSidebar';

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
  if (pathname === '/' || pathname.startsWith('/about') || pathname.startsWith('/timeline') || pathname.startsWith('/events') || pathname.startsWith('/gallery') || pathname.startsWith('/guides') || pathname.startsWith('/alliances') || pathname.startsWith('/interest') || pathname.startsWith('/glossary')) return 'realm';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'console';
}

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const tone = routeTone(pathname);
  const skipLink = <a href="#main" className="k-skip">Skip to content</a>;

  if (!wantsChrome(pathname)) {
    return (
      <>
        {skipLink}
        <div id="main" className={`site-route site-route-${tone}`}>{children}</div>
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
