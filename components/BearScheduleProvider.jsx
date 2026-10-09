'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { huntsFromAlliances } from '../lib/bearHuntSchedule';
import BearTimes from './BearTimes';

const Context = createContext({ alliances: null, error: '' });
export const BEAR_SCHEDULE_CHANGED = 'k710-bear-schedule-changed';

export function notifyBearScheduleChanged() {
  window.dispatchEvent(new Event(BEAR_SCHEDULE_CHANGED));
  try { localStorage.setItem(BEAR_SCHEDULE_CHANGED, String(Date.now())); } catch { /* Storage may be disabled. */ }
}

export default function BearScheduleProvider({ children }) {
  const [state, setState] = useState({ alliances: null, error: '' });
  useEffect(() => {
    let active = true;
    let request = 0;
    const controllers = new Set();
    async function refresh() {
      const version = ++request;
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await fetch('/api/bear-schedule', { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.alliances)) throw new Error('Bear Hunt times are temporarily unavailable.');
        if (active && version === request) setState({ alliances: result.alliances, error: '' });
      } catch (error) {
        if (active && version === request && error.name !== 'AbortError') setState(current => ({ ...current, error: 'Bear Hunt times are temporarily unavailable.' }));
      } finally { controllers.delete(controller); }
    }
    function onVisible() { if (document.visibilityState === 'visible') refresh(); }
    function onStorage(event) { if (event.key === BEAR_SCHEDULE_CHANGED) refresh(); }
    refresh();
    const timer = setInterval(onVisible, 60000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(BEAR_SCHEDULE_CHANGED, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      controllers.forEach(controller => controller.abort());
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(BEAR_SCHEDULE_CHANGED, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useBearSchedule(initialAlliances = null) {
  const state = useContext(Context);
  const alliances = state.alliances ?? initialAlliances;
  return { alliances: alliances || [], hunts: huntsFromAlliances(alliances || []), loading: alliances === null && !state.error, error: state.error };
}

export function AllianceBearTimes({ tag, initialTimes, ...timeProps }) {
  const initial = initialTimes ? [{ tag, bear_times_utc: initialTimes }] : null;
  const { alliances, loading, error } = useBearSchedule(initial);
  const times = alliances.find(alliance => alliance.tag === tag)?.bear_times_utc || [];
  if (loading) return <span>Loading Bear Hunt times…</span>;
  if (error) return <span>{error}</span>;
  return <BearTimes times={times} {...timeProps} />;
}
