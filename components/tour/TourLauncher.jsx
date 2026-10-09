'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useT } from '../i18n/LanguageProvider';
import { useTour } from './TourProvider';
import { getTour } from '../../lib/tours/tours.mjs';
import { shouldAutoStart } from '../../lib/tours/progress.mjs';

// The "Take the tour" / "Replay walkthrough" button for one tour. It also starts the tour by itself, once per
// user per version, a moment after the page is ready (never in the admin area, never over an open dialog).
// Put it next to the page title. `ready` lets a page hold the auto start until its content has loaded.
export default function TourLauncher({ id, ready = true, auto = true, className = '' }) {
  const t = useT();
  const pathname = usePathname() || '';
  const { start, isSettled, activeId, finished } = useTour();
  const tour = getTour(id);
  const [settled, setSettled] = useState(null); // null = not known yet (first render, server render)
  const autoDone = useRef(false);

  // Read the saved flags after mount only (no hydration mismatch).
  useEffect(() => {
    let cancelled = false;
    isSettled(id).then((value) => { if (!cancelled) setSettled(value); }).catch(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; };
  }, [id, isSettled]);

  // A tour finished or was skipped somewhere: this one now offers "Replay".
  useEffect(() => {
    if (finished && finished.id === id) setSettled(true);
  }, [finished, id]);

  useEffect(() => {
    if (!tour || !auto || autoDone.current || settled !== false) return undefined;
    if (!shouldAutoStart({ settled: false, pathname, ready, audienceMatches: true })) return undefined;
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      if (autoDone.current) return;
      // Do not start over a modal dialog (language chooser, admin dialogs) or another walkthrough; try again shortly.
      if (document.querySelector('[role="dialog"][aria-modal="true"], [data-tour-root]')) {
        tries += 1;
        if (tries < 6) timer = window.setTimeout(attempt, 1500);
        return;
      }
      autoDone.current = true;
      start(id, { auto: true });
    };
    timer = window.setTimeout(attempt, 900);
    return () => window.clearTimeout(timer);
  }, [tour, auto, settled, ready, pathname, id, start]);

  // Hide the button when the form it explains is not on the page (a closed form shows a notice instead).
  const [present, setPresent] = useState(true);
  useEffect(() => {
    if (!tour) return undefined;
    const required = tour.steps.filter((s) => !s.optional).map((s) => `[data-tour~="${s.anchor}"]`).join(',');
    let frame = 0;
    const check = () => {
      frame = 0;
      setPresent(Boolean(document.querySelector(required)));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(check); };
    check();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => { observer.disconnect(); if (frame) window.cancelAnimationFrame(frame); };
  }, [tour]);

  if (!tour || !present) return null;
  return (
    <button
      type="button"
      className={`k-tour-launch ${className}`.trim()}
      onClick={() => start(id)}
      aria-haspopup="dialog"
      aria-expanded={activeId === id ? 'true' : 'false'}
      data-tour-launcher={id}
    >
      {settled ? t('tour.ui.replay') : t('tour.ui.take')}
    </button>
  );
}
