'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const REALM_PREFIXES = ['/', '/about', '/timeline', '/events', '/guides', '/alliances', '/interest', '/gate'];

function isRealm(pathname) {
  if (pathname === '/') return true;
  return REALM_PREFIXES.slice(1).some((prefix) => pathname.startsWith(prefix));
}

function writeMotionVars(root, scroll = 0, x = 0, y = 0) {
  const story = scroll - 900;
  root.style.setProperty('--site-scroll', String(scroll));
  root.style.setProperty('--site-pointer-x', x.toFixed(3));
  root.style.setProperty('--site-pointer-y', y.toFixed(3));
  root.style.setProperty('--site-pointer-x-5', `${x * 5}px`);
  root.style.setProperty('--site-pointer-x-7', `${x * 7}px`);
  root.style.setProperty('--site-pointer-x-8', `${x * 8}px`);
  root.style.setProperty('--site-pointer-x-10', `${x * 10}px`);
  root.style.setProperty('--site-pointer-x-16', `${x * 16}px`);
  root.style.setProperty('--site-pointer-y-8', `${y * 8}px`);
  root.style.setProperty('--site-scroll-025', `${scroll * -0.025}px`);
  root.style.setProperty('--site-scroll-035', `${scroll * -0.035}px`);
  root.style.setProperty('--site-scroll-04', `${scroll * -0.04}px`);
  root.style.setProperty('--site-scroll-045', `${scroll * -0.045}px`);
  root.style.setProperty('--site-scroll-075', `${scroll * -0.075}px`);
  root.style.setProperty('--site-scroll-12', `${scroll * -0.12}px`);
  root.style.setProperty('--site-scroll-16', `${scroll * -0.16}px`);
  root.style.setProperty('--site-scroll-20', `${scroll * -0.2}px`);
  root.style.setProperty('--site-story-025', `${story * -0.025}px`);
  root.style.setProperty('--site-story-055', `${story * -0.055}px`);
}

export default function SiteAtmosphere() {
  const pathname = usePathname();
  const realm = isRealm(pathname);

  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      writeMotionVars(root, 0, 0, 0);
      return undefined;
    }

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const paint = () => {
      frame = 0;
      writeMotionVars(root, Math.min(window.scrollY, 2200), pointerX, pointerY);
    };
    const requestPaint = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const updatePointer = (event) => {
      pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
      requestPaint();
    };

    paint();
    window.addEventListener('scroll', requestPaint, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });
    return () => {
      window.removeEventListener('scroll', requestPaint);
      window.removeEventListener('pointermove', updatePointer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={`site-atmosphere ${realm ? 'site-atmosphere-realm' : 'site-atmosphere-console'}`} aria-hidden="true">
      <div className="site-atmosphere-glow" />
      <div className="site-atmosphere-ridge site-atmosphere-ridge-back" />
      <div className="site-atmosphere-ridge site-atmosphere-ridge-front" />
      <div className="site-atmosphere-grain" />
    </div>
  );
}
