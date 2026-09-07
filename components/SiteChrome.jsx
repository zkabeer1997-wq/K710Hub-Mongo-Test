'use client';

import { usePathname } from 'next/navigation';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import SiteAtmosphere from './SiteAtmosphere';

function wantsChrome(pathname) {
  if (pathname === '/gate') return false;
  if (pathname.startsWith('/admin/dashboard')) return false;
  return true;
}

function routeTone(pathname) {
  if (pathname === '/' || pathname.startsWith('/about') || pathname.startsWith('/timeline') || pathname.startsWith('/events') || pathname.startsWith('/gallery') || pathname.startsWith('/guides') || pathname.startsWith('/alliances') || pathname.startsWith('/chronometer') || pathname.startsWith('/interest')) return 'realm';
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
      <div id="main" className={`site-route site-route-${tone}`}>{children}</div>
      <SiteFooter />
    </div>
  );
}
