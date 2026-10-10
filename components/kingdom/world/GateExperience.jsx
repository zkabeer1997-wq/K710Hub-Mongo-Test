'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ForgeSequence from './ForgeSequence';
import CrestMenu from './CrestMenu';
import { useLanguage } from '../../i18n/LanguageProvider';
import { detectQuality, detectWebGL } from './gateCapabilities';

const GateScene = dynamic(() => import('./GateScene'), { ssr: false });

const ROADS = {
  left: {
    key: 'left',
    href: '/interest',
    kicker: 'The Gold Road',
    title: 'Request Entry',
    sub: 'Petition the registry to transfer into 710.',
    aria: 'Request entry — petition the registry to transfer into Kingdom 710',
  },
  right: {
    key: 'right',
    href: '/dashboard',
    kicker: 'The Inner Gate',
    title: 'Enter Kingdom',
    sub: 'Members report to the checkpoint.',
    aria: 'Enter kingdom — members report to the inner checkpoint',
  },
};

export default function GateExperience() {
  const router = useRouter();
  const { hasChosenLanguage } = useLanguage();
  const [ready, setReady] = useState(false);
  const [forging, setForging] = useState(true);
  const [webgl, setWebgl] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [quality, setQuality] = useState('standard');
  const [hovered, setHovered] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | travelling
  const [chosen, setChosen] = useState(null);
  const navTimer = useRef(null);

  useEffect(() => {
    setWebgl(detectWebGL());
    setQuality(detectQuality());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    setReady(true);
    return () => {
      mq.removeEventListener?.('change', onChange);
      if (navTimer.current) clearTimeout(navTimer.current);
    };
  }, []);

  const choose = useCallback(
    (key) => {
      if (phase === 'travelling') return;
      const road = ROADS[key];
      // Reduced motion / no WebGL: straight navigation, no camera travel.
      if (reduced || !webgl) {
        router.push(road.href);
        return;
      }
      setChosen(key);
      setPhase('travelling');
      const ms = quality === 'mobile' ? 1150 : 1750;
      navTimer.current = setTimeout(() => router.push(road.href), ms);
    },
    [phase, reduced, webgl, quality, router],
  );

  if (!ready) return <div className="k-scene" aria-hidden="true" />;

  /* ---------- No-WebGL fallback: still a location, still complete ---------- */
  if (!webgl) {
    return (
      <div className="k-scene gate-fallback">
        <CrestMenu />
        <div className="k-scene-layer gate-fallback-art" aria-hidden="true" />
        <div className="k-scene-layer k-vignette" aria-hidden="true" />
        <div className="k-scene-content gate-content">
          <header className="gate-head">
            <span className="k-mark">Kingdom 710</span>
            <h1 className="k-display gate-title">The Gate Stands Open</h1>
            <p className="k-narrative gate-lede">
              Many alliances. One kingdom. Choose the road that brings you in.
            </p>
          </header>
          <nav className="gate-roads" aria-label="Choose your road">
            {Object.values(ROADS).map((r) => (
              <Link key={r.key} href={r.href} className={`gate-road gate-road-${r.key}`}>
                <span className="k-mark gate-road-kicker">{r.kicker}</span>
                <span className="k-display gate-road-title">{r.title}</span>
                <span className="k-narrative gate-road-sub">{r.sub}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    );
  }

  return (
    <div className="k-scene gate-scene">
      <CrestMenu />
      {hasChosenLanguage && forging && (
        <ForgeSequence reducedMotion={reduced} onDone={() => setForging(false)} />
      )}

      {!reduced ? (
        <div className="k-scene-layer gate-canvas" aria-hidden="true">
          <GateScene hovered={hovered} phase={phase} chosen={chosen} quality={quality} />
        </div>
      ) : (
        <div className="k-scene-layer gate-fallback-art" aria-hidden="true" />
      )}

      <div className="k-scene-layer k-vignette" aria-hidden="true" />

      <div className={`k-scene-content gate-content ${phase === 'travelling' ? 'is-travelling' : ''}`}>
        <header className="gate-head">
          <span className="k-mark">Kingdom 710</span>
          <h1 className="k-display gate-title">Welcome to K710</h1>
        </header>

        {/* Environmental signage: anchored low and to the sides so it reads
            as marker-stones beside each road, not as floating cards. */}
        <nav className="gate-roads" aria-label="Choose your road">
          {Object.values(ROADS).map((r) => (
            <button
              key={r.key}
              type="button"
              className={`gate-road gate-road-${r.key}`}
              data-active={hovered === r.key}
              aria-label={r.aria}
              disabled={phase === 'travelling'}
              onMouseEnter={() => setHovered(r.key)}
              onMouseLeave={() => setHovered((h) => (h === r.key ? null : h))}
              onFocus={() => setHovered(r.key)}
              onBlur={() => setHovered((h) => (h === r.key ? null : h))}
              onClick={() => choose(r.key)}
            >
              <span className="k-mark gate-road-kicker">{r.kicker}</span>
              <span className="k-display gate-road-title">{r.title}</span>
              <span className="k-narrative gate-road-sub">{r.sub}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Architectural occlusion: the fade that hands off to the next scene. */}
      <div className={`gate-veil ${phase === 'travelling' ? 'is-on' : ''}`} aria-hidden="true" />
    </div>
  );
}
