'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clampIndex, parseStepParam, withStepParam } from './wizardState.mjs';

/**
 * Keeps a wizard's current step in the URL (?step=N, 1-based) without a
 * full navigation. Initial render is always step 0 (hydration-safe); after
 * mount the URL step is read, limited by `maxAllowed()` (so a deep link
 * can't skip past validation), and applied. Moving forward pushes a
 * history entry so the browser Back button returns to the previous step.
 */
export function useWizardUrlStep(stepCount, maxAllowed) {
  const [step, setStepState] = useState(0);
  const maxRef = useRef(maxAllowed);
  useEffect(() => { maxRef.current = maxAllowed; });

  const apply = useCallback((index) => {
    const limit = maxRef.current ? maxRef.current() : stepCount - 1;
    return clampIndex(Math.min(index, limit), stepCount);
  }, [stepCount]);

  const setStep = useCallback((index, { replace = false } = {}) => {
    const next = apply(index);
    setStepState(next);
    try {
      const url = `${window.location.pathname}${withStepParam(window.location.search, next)}${window.location.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (url !== current) window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', url);
    } catch { /* history unavailable */ }
  }, [apply]);

  // Read the step from the URL after mount; returns the applied index.
  const initFromUrl = useCallback(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('step');
      if (raw === null) return 0;
      const wanted = parseStepParam(raw, stepCount);
      const next = apply(wanted);
      setStepState(next);
      // Normalise a clamped / invalid value in the address bar.
      const url = `${window.location.pathname}${withStepParam(window.location.search, next)}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', url);
      return next;
    } catch { return 0; }
  }, [apply, stepCount]);

  useEffect(() => {
    function onPop() {
      try {
        const raw = new URLSearchParams(window.location.search).get('step');
        setStepState(apply(parseStepParam(raw, stepCount)));
      } catch { /* ignore */ }
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [apply, stepCount]);

  return { step, setStep, initFromUrl };
}
