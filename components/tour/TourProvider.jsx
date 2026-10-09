'use client';

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import Tour from './Tour';
import './tour.css';
import { getTour } from '../../lib/tours/tours.mjs';
import {
  TOUR_TOOL_KEY, emptyProgress, isTourSettled, localKey, markTour, mergeProgress, normalizeProgress,
  parseLocal, serializeLocal,
} from '../../lib/tours/progress.mjs';

// Walkthrough state for the whole site. Completion is kept per user and per tour version:
//  - this device: localStorage `k710-tour:<id>:v<version>` (the only store for anonymous applicants);
//  - signed-in members: also one best-effort row in member_tool_state (/api/tool-state/tour-progress).
// Either side saying "done" wins. Nothing is read during render (hydration-safe): everything here runs in
// effects or event handlers.

const TourContext = createContext({
  start: () => {},
  isSettled: async () => true,
  activeId: null,
  finished: null,
});

export function useTour() {
  return useContext(TourContext);
}

const ENDPOINT = `/api/tool-state/${TOUR_TOOL_KEY}`;

function readLocal(tour) {
  try { return parseLocal(window.localStorage.getItem(localKey(tour.id, tour.version))); } catch { return null; }
}
function writeLocal(tour, kind) {
  try { window.localStorage.setItem(localKey(tour.id, tour.version), serializeLocal(kind)); } catch { /* private mode */ }
}

// null = not signed in / unavailable. Never throws.
async function fetchRemote() {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeProgress(data?.state);
  } catch {
    return null;
  }
}

export default function TourProvider({ children }) {
  const [active, setActive] = useState(null); // { id, auto, opener }
  const [finished, setFinished] = useState(null); // { id, kind, n } for launchers to refresh their label
  const remoteOnce = useRef(null);
  const signedOut = useRef(false);

  const loadRemote = useCallback(() => {
    if (signedOut.current) return Promise.resolve(null);
    if (!remoteOnce.current) {
      remoteOnce.current = fetchRemote().then((value) => {
        if (value === null) signedOut.current = true;
        return value;
      });
    }
    return remoteOnce.current;
  }, []);

  // Has this user already finished or skipped this tour version? (either store)
  const isSettled = useCallback(async (id) => {
    const tour = getTour(id);
    if (!tour) return true;
    if (readLocal(tour)) return true;
    if (tour.audience !== 'member') return false;
    const remote = await loadRemote();
    return remote ? isTourSettled(remote, tour.id, tour.version) : false;
  }, [loadRemote]);

  const start = useCallback((id, { auto = false } = {}) => {
    const tour = getTour(id);
    if (!tour) return;
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    setActive({ id, auto, opener });
  }, []);

  const finish = useCallback(async (id, kind) => {
    const tour = getTour(id);
    setActive(null);
    setFinished((prev) => ({ id, kind, n: (prev?.n || 0) + 1 }));
    if (!tour) return;
    writeLocal(tour, kind);
    if (tour.audience !== 'member' || signedOut.current) return;
    // Best effort: re-read, merge, write. A failure only means the next device may show the tour once more.
    try {
      const latest = (await fetchRemote()) || emptyProgress();
      const merged = markTour(mergeProgress(latest, remoteOnce.current ? await remoteOnce.current : null), tour.id, tour.version, kind);
      remoteOnce.current = Promise.resolve(merged);
      await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: merged }),
      });
    } catch { /* offline or signed out: the local flag still holds */ }
  }, []);

  const value = useMemo(() => ({ start, isSettled, activeId: active?.id || null, finished }), [start, isSettled, active, finished]);
  const tour = active ? getTour(active.id) : null;

  return (
    <TourContext.Provider value={value}>
      {children}
      {tour ? (
        <Tour
          key={`${tour.id}:${finished?.n || 0}`}
          tour={tour}
          auto={active.auto}
          opener={active.opener}
          onFinish={(kind) => {
            if (kind === 'cancel') setActive(null);
            else finish(tour.id, kind);
          }}
        />
      ) : null}
    </TourContext.Provider>
  );
}
