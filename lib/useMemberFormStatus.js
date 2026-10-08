'use client';

import { useEffect, useState } from 'react';
import { visibleMemberItems } from './memberResults.mjs';

// Shared, short-lived cache so the header menu, sidebar, dashboard card and
// form notices on one page make a single request. `refresh` forces a re-read
// (used after a save). Logged-out visitors / no database resolve to an empty,
// signed-out shape: the UI then renders nothing.
const TTL_MS = 15_000;
const EMPTY = { signedIn: false, forms: [], results: [], entries: [], summary: null, firstIncomplete: null };
let cache = { at: 0, promise: null };
const listeners = new Set();

// The API already returns only open forms (and the results that follow them); applying the same
// helper here keeps every consumer consistent even if an older response is cached.
function visible(data) {
  if (!data || !Array.isArray(data.forms)) return data;
  const v = visibleMemberItems(data.forms, data.results || []);
  return { ...data, forms: v.forms, results: v.results, hidden: (data.hidden || 0) + v.hidden };
}

function load(force) {
  const fresh = cache.promise && Date.now() - cache.at < TTL_MS && !force;
  if (fresh) return cache.promise;
  const promise = fetch('/api/member-form-status', { cache: 'no-store', credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json().then(visible) : EMPTY))
    .catch(() => EMPTY);
  cache = { at: Date.now(), promise };
  return promise;
}

export function refreshMemberFormStatus() {
  load(true).then((data) => listeners.forEach((fn) => fn(data)));
}

/** @returns {{status: typeof EMPTY, loaded: boolean}} */
export function useMemberFormStatus(depKey = '') {
  const [state, setState] = useState({ status: EMPTY, loaded: false });
  useEffect(() => {
    let alive = true;
    const apply = (data) => { if (alive) setState({ status: data || EMPTY, loaded: true }); };
    listeners.add(apply);
    load(false).then(apply);
    return () => { alive = false; listeners.delete(apply); };
  }, [depKey]);
  return state;
}
