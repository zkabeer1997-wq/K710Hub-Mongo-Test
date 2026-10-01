'use client';

import { useEffect, useState } from 'react';
import ForgeSequence from './ForgeSequence';
import { useLanguage } from '../../i18n/LanguageProvider';

// The Sigil Forge cinematic (ForgeSequence, unchanged) used to be the
// entire homepage before PR 5 gave "/" real server-rendered content. This
// brings the cinematic back as a one-time overlay in front of that
// content rather than reverting the homepage itself - ForgeSequence is
// already a fixed, full-viewport layer (see .forge2 in kingdom.css), so it
// covers the page without affecting what crawlers or a skip/reduced-motion
// visitor see underneath. Gated on hasChosenLanguage, same as
// GateExperience.jsx, so it never stacks on top of the language picker.
const SEEN_KEY = 'k710-forge-seen';

function hasSeenIntro() {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Storage blocked: the intro may replay, which is harmless.
  }
}

// Plays at most once per browser session, and never for visitors who prefer
// reduced motion. Decided after mount so server HTML and first paint (and
// therefore LCP) are never blocked by the overlay.
export default function HomeForgeIntro() {
  const { hasChosenLanguage } = useLanguage();
  const [forging, setForging] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || hasSeenIntro()) return;
    setForging(true);
  }, []);

  if (!forging || !hasChosenLanguage) return null;

  return <ForgeSequence reducedMotion={false} onDone={() => {
    markIntroSeen();
    setForging(false);
  }} />;
}
